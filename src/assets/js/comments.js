/**
 * 文章评论模块（GitHub 登录后可评论）
 *
 * 会话隔离说明：
 * - GitHub 用户会话 Cookie：byteforge_github（由 /api/auth/github* 维护）
 * - 管理员会话 Cookie：byteforge_session（由 admin.js 维护）
 * 两者互不影响、可同时登录；管理员或评论作者本人可删除评论。
 *
 * 接口：
 * - GET    /api/me                     返回 { authed: 管理员?, user: GitHub 用户? }
 * - GET    /api/auth/github?return_to= 跳转 GitHub OAuth 登录
 * - DELETE /api/auth/github            退出评论登录
 * - GET    /api/comments?slug=         评论列表（含 enabled 状态）
 * - POST   /api/comments               发表评论 { slug, content }
 * - DELETE /api/comments/:id?slug=     删除评论（作者或管理员）
 */
(function () {
  'use strict';

  var root = document.getElementById('comments-root');
  if (!root) return;
  var slug = root.getAttribute('data-slug') || '';

  var state = {
    enabled: null,   // null=未知 false=未启用 true=已启用
    unreachable: false,
    admin: false,    // 是否管理员
    user: null,      // GitHub 用户 { id, login, name, avatar, url }
    comments: [],
    pendingDelete: null,
    busy: false
  };

  /* ---------------- 工具 ---------------- */

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function $(sel, el) { return (el || document).querySelector(sel); }

  function fetchJson(path, opts) {
    opts = opts || {};
    return fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      ...opts
    }).then(function (res) {
      return res.json().catch(function () {
        throw new Error('接口返回异常 (' + res.status + ')');
      }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || '请求失败 (' + res.status + ')');
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function timeAgo(iso) {
    var t = new Date(iso);
    if (isNaN(t)) return '';
    var diff = Date.now() - t.getTime();
    if (diff < 0) return t.toLocaleString('zh-CN');
    var m = Math.floor(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时前';
    var d = Math.floor(h / 24);
    if (d < 7) return d + ' 天前';
    return t.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  function fullTime(iso) {
    var t = new Date(iso);
    return isNaN(t) ? '' : t.toLocaleString('zh-CN');
  }

  /** 转义 + 换行 + 自动识别 http(s) 链接（先转义再生成标签，杜绝注入） */
  function renderText(s) {
    return esc(s)
      .replace(/\r\n/g, '\n')
      .replace(/\n/g, '<br>')
      .replace(/(https?:\/\/[^\s<>"')]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer nofollow">$1</a>');
  }

  function returnTo() {
    return encodeURIComponent(window.location.pathname + window.location.search);
  }

  function canDelete(c) {
    return !!state.admin || !!(state.user && state.user.id && c.user && state.user.id === String(c.user.id));
  }

  function note(msg) {
    var el = document.createElement('p');
    el.className = 'comments-status';
    el.textContent = msg;
    return el;
  }

  /* ---------------- 渲染 ---------------- */

  function renderBar() {
    if (state.unreachable) {
      return '<p class="comments-note">评论服务暂不可用：当前是静态预览环境（无后端 API），请通过线上站点访问本页参与评论。</p>';
    }
    if (state.enabled === false) {
      return '<p class="comments-note">评论功能尚未启用：管理员需在 Cloudflare 配置 GitHub OAuth 环境变量（GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET）后才能开启。</p>';
    }
    if (state.user) {
      var name = state.user.name && state.user.name !== state.user.login
        ? '（' + esc(state.user.name) + '）' : '';
      return (
        '<div class="comments-bar">' +
          '<div class="comments-user">' +
            (state.user.avatar
              ? '<img class="comments-user-avatar" src="' + esc(state.user.avatar) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'">'
              : '') +
            '<span>已登录：<strong>@' + esc(state.user.login) + '</strong>' + name +
            (state.admin ? ' <em class="comments-admin-tag">管理员</em>' : '') +
            '</span>' +
          '</div>' +
          '<button type="button" class="comments-logout" id="comments-logout">退出</button>' +
        '</div>'
      );
    }
    return (
      '<div class="comments-bar">' +
        '<p class="comments-hint">登录 GitHub 账号后即可参与讨论' +
        (state.admin ? '（当前为管理员身份，可删除违规评论）' : '') + '</p>' +
        '<a class="gh-login-btn" href="/api/auth/github?return_to=' + returnTo() + '">' +
          '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">' +
            '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>' +
          '</svg>' +
          '<span>使用 GitHub 登录</span>' +
        '</a>' +
      '</div>'
    );
  }

  function renderComposer() {
    if (state.enabled !== true || state.unreachable || !state.user) return '';
    return (
      '<div class="comments-composer">' +
        '<textarea id="comments-input" rows="3" maxlength="2000" placeholder="友善交流，换行或自动识别 http(s) 链接；最长 2000 字"></textarea>' +
        '<div class="comments-composer-foot">' +
          '<span class="comments-counter">0 / 2000</span>' +
          '<button type="button" class="comments-submit" id="comments-submit">发表评论</button>' +
        '</div>' +
      '</div>'
    );
  }

  function renderListHead() {
    return (
      '<div class="comments-head">' +
        '<h3 class="comments-title">评论</h3>' +
        '<span class="comments-count">' + state.comments.length + ' 条</span>' +
      '</div>'
    );
  }

  function renderList() {
    if (!state.comments.length) {
      return renderListHead() + '<p class="comments-empty">还没有评论，来写下第一条吧。</p>';
    }
    var items = state.comments.map(function (c) {
      var meta = '@' + esc(c.user.login);
      var avatar = c.user.avatar
        ? '<img class="comment-avatar" src="' + esc(c.user.avatar) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'">'
        : '<span class="comment-avatar comment-avatar-fallback">' + esc((c.user.login || '?').charAt(0).toUpperCase()) + '</span>';
      var authorName = c.user.name && c.user.name !== c.user.login
        ? ' · ' + esc(c.user.name) : '';
      var del = canDelete(c)
        ? '<button type="button" class="comment-del" data-del="' + esc(c.id) + '">删除</button>'
        : '';
      return (
        '<article class="comment-item">' +
          avatar +
          '<div class="comment-main">' +
            '<header class="comment-head">' +
              '<a class="comment-author" href="' + esc(c.user.url || ('https://github.com/' + c.user.login)) + '" target="_blank" rel="noopener">' +
                meta + authorName + '</a>' +
              '<time class="comment-time" datetime="' + esc(c.createdAt) + '" title="' + esc(fullTime(c.createdAt)) + '">' +
                timeAgo(c.createdAt) + '</time>' +
              del +
            '</header>' +
            '<div class="comment-text">' + renderText(c.content) + '</div>' +
          '</div>' +
        '</article>'
      );
    }).join('');
    return renderListHead() + '<div class="comments-list">' + items + '</div>';
  }

  function renderAll() {
    var div = document.createElement('div');
    div.innerHTML = renderBar();
    var bar = div.firstChild;

    div.innerHTML = renderComposer();
    var composer = div.firstChild;

    div.innerHTML = renderList();
    var listFragment = document.createDocumentFragment();
    while (div.firstChild) listFragment.appendChild(div.firstChild);

    root.textContent = '';
    if (bar) root.appendChild(bar);
    if (composer) root.appendChild(composer);
    root.appendChild(listFragment);

    bindEvents();
  }

  /* ---------------- 事件 ---------------- */

  function bindEvents() {
    var logoutBtn = document.getElementById('comments-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        logoutBtn.disabled = true;
        fetchJson('/api/auth/github', { method: 'DELETE' })
          .then(function () { window.location.reload(); })
          .catch(function (err) {
            logoutBtn.disabled = false;
            root.insertBefore(note(err.message), root.firstChild.nextSibling || null);
          });
      });
    }

    var input = document.getElementById('comments-input');
    var submit = document.getElementById('comments-submit');
    if (input && submit) {
      var counter = $('.comments-counter', root);
      input.addEventListener('input', function () {
        if (counter) counter.textContent = input.value.length + ' / 2000';
      });

      submit.addEventListener('click', function () {
        if (state.busy) return;
        var content = input.value.trim();
        if (!content) {
          root.insertBefore(note('评论内容不能为空'), root.querySelector('.comments-head') || null);
          input.focus();
          return;
        }
        state.busy = true;
        submit.disabled = true;
        submit.textContent = '发表中…';
        fetchJson('/api/comments', {
          method: 'POST',
          body: JSON.stringify({ slug: slug, content: content })
        }).then(function () {
          input.value = '';
          if (counter) counter.textContent = '0 / 2000';
          return loadList();
        }).then(function () {
          refreshListArea();
        }).catch(function (err) {
          var el = note(err.message);
          root.insertBefore(el, root.querySelector('.comments-head') || root.firstChild);
          setTimeout(function () { el.remove(); }, 5000);
          if (err.status === 401) {
            window.location.href = '/api/auth/github?return_to=' + returnTo();
            return;
          }
        }).then(function () {
          state.busy = false;
          submit.disabled = false;
          submit.textContent = '发表评论';
        });
      });
    }

    Array.prototype.forEach.call(root.querySelectorAll('.comment-del'), function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-del');
        var item = btn.closest('.comment-item');
        if (state.pendingDelete === id) {
          state.pendingDelete = null;
          btn.disabled = true;
          btn.textContent = '删除中…';
          fetchJson('/api/comments/' + encodeURIComponent(id) + '?slug=' + encodeURIComponent(slug), { method: 'DELETE' })
            .then(function () {
              return loadList();
            })
            .then(function () {
              refreshListArea();
            })
            .catch(function (err) {
              if (item) {
                var el = note(err.message);
                item.appendChild(el);
                setTimeout(function () { el.remove(); }, 4000);
              }
              var again = $('[data-del="' + id.replace(/["\\]/g, '') + '"]', root);
              if (again) { again.disabled = false; again.textContent = '删除'; }
            });
          return;
        }
        state.pendingDelete = id;
        btn.textContent = '确认删除？';
        setTimeout(function () {
          if (state.pendingDelete === id) {
            state.pendingDelete = null;
            if (btn.isConnected) btn.textContent = '删除';
          }
        }, 3000);
      });
    });
  }

  /** 仅重绘列表区（保留顶部登录栏与输入框内容） */
  function refreshListArea() {
    Array.prototype.slice.call(root.children).forEach(function (child) {
      if (child.classList &&
          (child.classList.contains('comments-head') ||
           child.classList.contains('comments-list') ||
           child.classList.contains('comments-empty'))) {
        child.remove();
      }
    });
    var div = document.createElement('div');
    div.innerHTML = renderList();
    while (div.firstChild) root.appendChild(div.firstChild);
    bindEvents();
  }

  /* ---------------- 数据 ---------------- */

  function loadList() {
    return fetchJson('/api/comments?slug=' + encodeURIComponent(slug))
      .then(function (data) {
        state.enabled = !!data.enabled;
        state.comments = data.comments || [];
        state.unreachable = false;
        return data;
      })
      .catch(function () {
        state.unreachable = true;
        state.enabled = false;
        state.comments = [];
        return null;
      });
  }

  function init() {
    // 先并行取：我的身份（管理员 + GitHub 用户）与评论列表
    var mePromise = fetchJson('/api/me')
      .then(function (data) {
        state.admin = !!data.authed;
        state.user = data.user || null;
      })
      .catch(function () {
        state.admin = false;
        state.user = null;
      });

    mePromise
      .then(loadList)
      .then(renderAll)
      .catch(renderAll);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
