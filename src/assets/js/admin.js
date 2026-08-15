/**
 * 管理员界面
 *
 * - 个人资料卡底部“管理员登录 / 管理文章”入口
 * - 登录弹窗（POST /api/login，会话 Cookie 由服务端下发）
 * - 文章管理面板：新建 / 编辑 / 删除 / 查看
 * - 文章页：已登录时在“下载本文”旁追加“编辑”入口
 */
(function () {
  'use strict';

  var authed = false;
  var articles = [];
  var modal = null;
  var currentSlug = null; // 编辑中的文章 slug
  var errorHideTimer = null; // 表单内联错误 4 秒自动隐藏

  // ---------- 工具 ----------

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function todayISO() {
    var d = new Date();
    var off = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - off).toISOString().slice(0, 10);
  }

  // ---------- Markdown 文件解析（上传导入用） ----------

  function unquote(s) {
    s = String(s).trim();
    if (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) {
      return s.slice(1, -1);
    }
    return s;
  }

  function parseTagList(s) {
    s = String(s).trim();
    var arr = (s[0] === '[' && s[s.length - 1] === ']') ? s.slice(1, -1).split(',') : s.split(/[,，]/);
    return arr.map(unquote).filter(function (t) { return t; });
  }

  /** 简易 frontmatter 解析（覆盖本项目用到的 YAML 字段） */
  function parseFrontmatter(yaml) {
    var meta = {};
    var lines = yaml.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line[0] === '#') continue;
      if (/^series\s*:\s*$/.test(line)) {
        var name = null;
        var order = '';
        while (i + 1 < lines.length && /^\s{2,}/.test(lines[i + 1])) {
          i++;
          var sub = lines[i].trim();
          var sm = /^([\w-]+)\s*:\s*(.*)$/.exec(sub);
          if (!sm) continue;
          if (sm[1] === 'name') name = unquote(sm[2]);
          else if (sm[1] === 'order') order = unquote(sm[2]);
        }
        if (name) meta.series = order === '' ? name : { name: name, order: order };
        continue;
      }
      var mm = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
      if (!mm) continue;
      var key = mm[1];
      var val = mm[2].trim();
      if (key === 'tags') {
        meta.tags = parseTagList(val);
      } else if (val !== '' && val !== null && val !== undefined) {
        meta[key] = unquote(val);
      }
    }
    return meta;
  }

  /** 从上传的 md 文件内容中提取 frontmatter + Markdown，自动填入编辑器表单 */
  function applyMdImport(form, raw) {
    var m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(raw);
    var meta = {};
    var content = raw;
    if (m) {
      meta = parseFrontmatter(m[1]);
      content = m[2];
    }
    if (meta.title) $('#ed-title', form).value = meta.title;
    if (meta.slug) $('#ed-slug', form).value = meta.slug;
    if (meta.date) $('#ed-date', form).value = String(meta.date);
    if (meta.category) $('#ed-category', form).value = meta.category;
    if (meta.tags && meta.tags.length) $('#ed-tags', form).value = meta.tags.join(', ');
    if (meta.series) {
      if (typeof meta.series === 'string') {
        $('#ed-series', form).value = meta.series;
        $('#ed-series-order', form).value = '';
      } else {
        $('#ed-series', form).value = meta.series.name || '';
        $('#ed-series-order', form).value = meta.series.order == null ? '' : String(meta.series.order);
      }
    }
    if (meta.summary) $('#ed-summary', form).value = meta.summary;
    $('#ed-content', form).value = content.replace(/^\s*\r?\n/, '');
  }

  function api(path, options) {
    options = options || {};
    return fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      ...options
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || ('请求失败 (' + res.status + ')'));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  // ---------- 弹窗 ----------

  function closeModal() {
    if (modal) {
      modal.overlay.remove();
      modal = null;
    }
  }

  function showModal(title, bodyHtml) {
    closeModal();
    var overlay = document.createElement('div');
    overlay.className = 'admin-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<div class="admin-modal">' +
        '<header class="admin-modal-header">' +
          '<h2 class="admin-modal-title">' + esc(title) + '</h2>' +
          '<button type="button" class="admin-modal-close" aria-label="关闭">✕</button>' +
        '</header>' +
        '<div class="admin-modal-body">' + bodyHtml + '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    modal = { overlay: overlay };

    // 仅右上角关闭按钮可退出，点击遮罩空白不关闭
    $('.admin-modal-close', overlay).addEventListener('click', closeModal);
    return overlay;
  }

  function showError(form, message) {
    var el = $('.admin-status', form);
    if (el) {
      el.textContent = message;
      el.hidden = false;
    }
    // 错误消息同样 4 秒后自动消失（与成功 toast 一致）
    if (errorHideTimer) clearTimeout(errorHideTimer);
    errorHideTimer = setTimeout(function () {
      if (el) el.hidden = true;
      errorHideTimer = null;
    }, 4000);
    return message;
  }

  function hideError(form) {
    if (errorHideTimer) {
      clearTimeout(errorHideTimer);
      errorHideTimer = null;
    }
    var el = $('.admin-status', form);
    if (el) el.hidden = true;
  }

  // ---------- 自定义消息 / 确认（替代浏览器 alert / confirm，避免丢失鼠标样式） ----------

  function showToast(message, opts) {
    opts = opts || {};
    var toast = document.createElement('div');
    toast.className = 'admin-toast' + (opts.type ? ' admin-toast-' + opts.type : '');
    toast.setAttribute('role', 'status');
    toast.innerHTML =
      '<span class="admin-toast-msg">' + esc(String(message)).replace(/\n/g, '<br>') + '</span>' +
      '<button type="button" class="admin-toast-close" aria-label="关闭">✕</button>';
    document.body.appendChild(toast);

    var close = function () {
      if (!toast.isConnected) return;
      toast.classList.add('is-closing');
      setTimeout(function () { toast.remove(); }, 220);
    };
    $('.admin-toast-close', toast).addEventListener('click', close);
    if (opts.autoClose !== false) {
      setTimeout(close, opts.duration || 4000);
    }
    return toast;
  }

  function confirmDialog(message, title, onConfirm) {
    if (typeof title === 'function') {
      onConfirm = title;
      title = undefined;
    }
    var overlay = showModal(title || '确认操作',
      '<div class="admin-confirm">' +
        '<p class="admin-confirm-text">' + esc(message) + '</p>' +
        '<div class="admin-form-actions">' +
          '<button type="button" class="admin-btn admin-btn-ghost" data-close>取消</button>' +
          '<button type="button" class="admin-btn admin-btn-danger" id="admin-confirm-ok">确定</button>' +
        '</div>' +
      '</div>'
    );
    $('[data-close]', overlay).addEventListener('click', closeModal);
    $('#admin-confirm-ok', overlay).addEventListener('click', function () {
      closeModal();
      if (onConfirm) onConfirm();
    });
  }

  // ---------- 登录 ----------

  function openLogin() {
    var overlay = showModal('管理员登录',
      '<form id="admin-login-form" class="admin-form">' +
        '<div class="admin-form-row">' +
          '<label for="admin-password">管理员密码</label>' +
          '<input type="password" id="admin-password" name="password" required autocomplete="current-password" placeholder="请输入管理员密码">' +
        '</div>' +
        '<p class="admin-status admin-status-error" hidden></p>' +
        '<div class="admin-form-actions">' +
          '<button type="button" class="admin-btn admin-btn-ghost" data-close>取消</button>' +
          '<button type="submit" class="admin-btn">登录</button>' +
        '</div>' +
      '</form>'
    );
    var form = $('#admin-login-form', overlay);
    $('[data-close]', form).addEventListener('click', closeModal);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      hideError(form);
      var btn = $('button[type="submit"]', form);
      btn.disabled = true;
      api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('#admin-password', form).value }) })
        .then(function () {
          authed = true;
          closeModal();
          updateEntry();
          openPanel();
        })
        .catch(function (err) {
          showError(form, err.message);
          btn.disabled = false;
          var input = $('#admin-password', form);
          input.focus();
          input.select();
        });
    });
    var input = $('#admin-password', overlay);
    if (input) input.focus();
  }

  function logout() {
    api('/api/login', { method: 'DELETE' })
      .catch(function () { /* 忽略 */ })
      .finally(function () {
        authed = false;
        closeModal();
        updateEntry();
      });
  }

  // ---------- 管理面板 ----------

  function refreshList() {
    return api('/api/articles').then(function (data) {
      articles = data.articles || [];
      var list = $('#admin-list');
      if (!list) return;
      list.innerHTML = articles.map(function (a) {
        var metaParts = [a.date];
        if (a.category) metaParts.push(a.category);
        if (a.series && a.series.name) metaParts.push('📚 ' + a.series.name);
        if (a.tags && a.tags.length) metaParts.push(a.tags.map(function (t) { return '#' + t; }).join(' '));
        return (
          '<li class="admin-list-item" data-slug="' + esc(a.slug) + '">' +
            '<div class="admin-list-info">' +
              '<a class="admin-list-title" href="/posts/' + encodeURIComponent(a.slug) + '.html" target="_blank" rel="noopener">' + esc(a.title) + '</a>' +
              '<div class="admin-list-meta">' + esc(metaParts.join(' · ')) + '</div>' +
            '</div>' +
            '<div class="admin-list-actions">' +
              '<button type="button" class="admin-btn admin-btn-sm" data-act="edit">编辑</button>' +
              '<button type="button" class="admin-btn admin-btn-sm admin-btn-danger" data-act="delete">删除</button>' +
            '</div>' +
          '</li>'
        );
      }).join('');
      var count = $('#admin-count');
      if (count) count.textContent = String(articles.length);
    });
  }

  function openPanel() {
    var overlay = showModal('文章管理',
      '<div class="admin-panel">' +
        '<div class="admin-panel-toolbar">' +
          '<button type="button" class="admin-btn" id="admin-new-btn">＋ 新建文章</button>' +
          '<button type="button" class="admin-btn admin-btn-ghost" id="admin-refresh-btn">刷新</button>' +
          '<span class="admin-panel-count">共 <strong id="admin-count">0</strong> 篇</span>' +
          '<button type="button" class="admin-btn admin-btn-ghost admin-btn-danger" id="admin-logout-btn">退出登录</button>' +
        '</div>' +
        '<p class="admin-status admin-status-error" hidden></p>' +
        '<ul class="admin-list" id="admin-list"></ul>' +
      '</div>'
    );

    $('#admin-new-btn', overlay).addEventListener('click', function () {
      openEditor(null);
    });
    $('#admin-refresh-btn', overlay).addEventListener('click', function () {
      refreshList().catch(function (err) { showError(overlay, err.message); });
    });
    $('#admin-logout-btn', overlay).addEventListener('click', logout);

    overlay.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var item = btn.closest('.admin-list-item');
      if (!item) return;
      var slug = item.getAttribute('data-slug');
      var article = articles.find(function (a) { return a.slug === slug; });
      if (!article) return;
      if (btn.getAttribute('data-act') === 'edit') {
        // 列表接口只返回元数据（不含正文），编辑前需拉取完整文章
        api('/api/articles/' + encodeURIComponent(slug))
          .then(function (data) {
            openEditor(data.article);
          })
          .catch(function (err) { showError(overlay, err.message); });
      } else if (btn.getAttribute('data-act') === 'delete') {
        confirmDialog('确定删除文章「' + article.title + '」吗？此操作不可恢复。', '删除确认', function () {
          api('/api/articles/' + encodeURIComponent(slug), { method: 'DELETE' })
            .then(function () {
              showToast('已删除文章：' + article.title, { type: 'success' });
              // 删除成功后自动刷新页面
              setTimeout(function () { window.location.reload(); }, 1200);
            })
            .catch(function (err) { showError(overlay, err.message); });
        });
      }
    });

    refreshList().catch(function (err) { showError(overlay, err.message); });
  }

  // ---------- 编辑器 ----------

  function openEditor(article) {
    currentSlug = article ? article.slug : null;
    var isEdit = !!article;
    // 编辑时的原标题 / 原 slug，以及 slug 输入框是否被手动修改
    var originalTitle = article ? article.title : '';
    var originalSlug = article ? article.slug : '';
    var slugTouched = false;
    var overlay = showModal(isEdit ? '编辑文章' : '新建文章',
      '<form id="admin-editor-form" class="admin-form">' +
        '<div class="admin-form-row">' +
          '<label for="ed-import">导入 Markdown 文件</label>' +
          '<input type="file" id="ed-import" class="admin-file-input" accept=".md,.markdown,text/markdown,text/plain" aria-describedby="ed-import-hint">' +
          '<span class="admin-hint" id="ed-import-hint">选择 .md 文件后自动解析 frontmatter 并填入下方表单，供确认后保存</span>' +
        '</div>' +
        '<div class="admin-form-row">' +
          '<label for="ed-title">标题 *</label>' +
          '<input type="text" id="ed-title" name="title" required value="' + esc(article ? article.title : '') + '">' +
        '</div>' +
        '<div class="admin-form-grid">' +
          '<div class="admin-form-row">' +
            '<label for="ed-slug">链接标识 slug</label>' +
            '<input type="text" id="ed-slug" name="slug" value="' + esc(article ? article.slug : '') + '" placeholder="留空自动根据标题生成">' +
          '</div>' +
          '<div class="admin-form-row">' +
            '<label for="ed-date">日期</label>' +
            '<input type="date" id="ed-date" name="date" value="' + esc(article ? article.date : todayISO()) + '">' +
          '</div>' +
          '<div class="admin-form-row">' +
            '<label for="ed-category">分类</label>' +
            '<input type="text" id="ed-category" name="category" value="' + esc(article ? article.category : '') + '" placeholder="未分类">' +
          '</div>' +
          '<div class="admin-form-row">' +
            '<label for="ed-tags">标签（逗号分隔）</label>' +
            '<input type="text" id="ed-tags" name="tags" value="' + esc(article && article.tags ? article.tags.join(', ') : '') + '" placeholder="C++, CUDA, 架构">' +
          '</div>' +
          '<div class="admin-form-row">' +
            '<label for="ed-series">专栏名</label>' +
            '<input type="text" id="ed-series" name="seriesName" value="' + esc(article && article.series ? article.series.name : '') + '" placeholder="不填则不归入专栏">' +
          '</div>' +
          '<div class="admin-form-row">' +
            '<label for="ed-series-order">专栏序号（可选）</label>' +
            '<input type="number" id="ed-series-order" name="seriesOrder" value="' + esc(article && article.series && article.series.order !== null && article.series.order !== undefined ? article.series.order : '') + '" placeholder="1 开始，留空按日期排序">' +
          '</div>' +
        '</div>' +
        '<div class="admin-form-row">' +
          '<label for="ed-summary">摘要</label>' +
          '<textarea id="ed-summary" name="summary" rows="2" placeholder="留空自动从正文截取">' + esc(article ? article.summary : '') + '</textarea>' +
        '</div>' +
        '<div class="admin-form-row">' +
          '<label for="ed-content">正文（Markdown）*</label>' +
          '<textarea id="ed-content" name="content" rows="14" required spellcheck="false" placeholder="# 标题&#10;正文…">' + esc(article ? article.content : '') + '</textarea>' +
        '</div>' +
        '<p class="admin-status admin-status-error" hidden></p>' +
        '<div class="admin-form-actions">' +
          '<button type="button" class="admin-btn admin-btn-ghost" data-close>取消</button>' +
          '<button type="submit" class="admin-btn">保存</button>' +
        '</div>' +
      '</form>'
    );

    var form = $('#admin-editor-form', overlay);
    $('[data-close]', form).addEventListener('click', closeModal);

    var fileInput = $('#ed-import', form);
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        hideError(form);
        var reader = new FileReader();
        reader.onload = function (e) {
          applyMdImport(form, String(e.target.result));
          fileInput.value = '';
        };
        reader.onerror = function () { showError(form, '文件读取失败'); };
        reader.readAsText(file, 'utf-8');
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      hideError(form);
      var btn = $('button[type="submit"]', form);
      btn.disabled = true;

      var titleVal = $('#ed-title', form).value;
      var slugVal = $('#ed-slug', form).value;
      if (isEdit) {
        if (titleVal === originalTitle) {
          // 标题未修改：保留原 slug，避免手动指定的 slug 被意外重算
          slugVal = originalSlug;
        } else if (!slugTouched) {
          // 标题已修改且未手动改 slug：留空交给后端按新标题自动生成
          slugVal = '';
        }
      }

      var payload = {
        title: titleVal,
        slug: slugVal,
        date: $('#ed-date', form).value,
        category: $('#ed-category', form).value,
        tags: $('#ed-tags', form).value,
        series: { name: $('#ed-series', form).value, order: $('#ed-series-order', form).value },
        summary: $('#ed-summary', form).value,
        content: $('#ed-content', form).value
      };

      var method = isEdit ? 'PATCH' : 'POST';
      var path = isEdit ? '/api/articles/' + encodeURIComponent(currentSlug) : '/api/articles';
      var done = api(path, { method: method, body: JSON.stringify(payload) });

      done.then(function (res) {
        var newSlug = res.article && res.article.slug;
        showToast(
          (isEdit ? '文章已保存' : '文章已创建') + (res.article ? '：' + res.article.title : '') +
          (!isEdit && newSlug ? '\n地址：/posts/' + newSlug + '.html' : ''),
          { type: 'success' }
        );
        if (isEdit && newSlug && newSlug !== currentSlug) {
          // slug 已修改：若当前正处于旧地址的文章页，跳转到新地址，避免刷新后 404
          var oldPath = '/posts/' + encodeURIComponent(currentSlug) + '.html';
          if (window.location.pathname === oldPath) {
            setTimeout(function () {
              window.location.href = '/posts/' + encodeURIComponent(newSlug) + '.html';
            }, 1200);
            return;
          }
        }
        // 保存成功后自动刷新页面，确保看到最新的云端数据
        setTimeout(function () { window.location.reload(); }, 1200);
      }).catch(function (err) {
        showError(form, err.message);
        btn.disabled = false;
      });
    });

    // slug 输入框手动编辑后不再自动跟随标题
    var slugInput = $('#ed-slug', form);
    if (slugInput) {
      slugInput.addEventListener('input', function () { slugTouched = true; });
    }
    // 修改标题且未手动改 slug 时，清空 slug 让后端自动生成（placeholder 有提示）
    var titleInput = $('#ed-title', form);
    if (titleInput) {
      titleInput.addEventListener('input', function () {
        if (!slugTouched && slugInput) slugInput.value = '';
      });
    }
    if (titleInput) titleInput.focus();
  }

  // ---------- 资料卡入口 ----------

  function updateEntry() {
    var entry = document.getElementById('admin-entry');
    if (!entry) return;
    entry.textContent = authed ? '🛠 管理文章' : '🔒 管理员登录';
  }

  function initEntry() {
    var entry = document.getElementById('admin-entry');
    if (!entry) return;
    entry.addEventListener('click', function () {
      if (authed) openPanel();
      else openLogin();
    });
  }

  // ---------- 文章页编辑入口 ----------

  function initPostActions() {
    if (!authed) return;
    var actions = document.querySelector('.post-actions');
    if (!actions) return;
    var btn = document.createElement('a');
    btn.href = '#';
    btn.className = 'post-download post-edit';
    btn.textContent = '✏️ 编辑';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var slug = window.location.pathname.split('/').pop().replace(/\.html$/, '');
      if (!slug) return;
      api('/api/articles/' + encodeURIComponent(slug))
        .then(function (data) {
          openEditor(data.article);
        })
        .catch(function (err) {
          showToast(err.message, { type: 'error' }); // 4 秒后自动消失
        });
    });
    actions.appendChild(btn);
  }

  // ---------- 初始化 ----------

  function init() {
    initEntry();
    api('/api/me').then(function (data) {
      authed = !!data.authed;
      updateEntry();
      initPostActions();
    }).catch(function () { /* 未登录态即可 */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
