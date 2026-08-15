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

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
    $('.admin-modal-close', overlay).addEventListener('click', closeModal);
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
    return overlay;
  }

  function showError(form, message) {
    var el = $('.admin-status', form);
    if (el) {
      el.textContent = message;
      el.hidden = false;
    }
    return message;
  }

  function hideError(form) {
    var el = $('.admin-status', form);
    if (el) el.hidden = true;
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
        openEditor(article);
      } else if (btn.getAttribute('data-act') === 'delete') {
        if (window.confirm('确定删除文章「' + article.title + '」吗？此操作不可恢复。')) {
          api('/api/articles/' + encodeURIComponent(slug), { method: 'DELETE' })
            .then(refreshList)
            .catch(function (err) { showError(overlay, err.message); });
        }
      }
    });

    refreshList().catch(function (err) { showError(overlay, err.message); });
  }

  // ---------- 编辑器 ----------

  function openEditor(article) {
    currentSlug = article ? article.slug : null;
    var isEdit = !!article;
    var overlay = showModal(isEdit ? '编辑文章' : '新建文章',
      '<form id="admin-editor-form" class="admin-form">' +
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

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      hideError(form);
      var btn = $('button[type="submit"]', form);
      btn.disabled = true;

      var payload = {
        title: $('#ed-title', form).value,
        slug: $('#ed-slug', form).value,
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
        closeModal();
        openPanel();
        if (!isEdit && res.article) {
          window.alert('文章已创建：' + res.article.title + '\n地址：/posts/' + res.article.slug + '.html');
        }
      }).catch(function (err) {
        showError(form, err.message);
        btn.disabled = false;
      });
    });

    var titleInput = $('#ed-title', overlay);
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
          window.alert(err.message);
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
