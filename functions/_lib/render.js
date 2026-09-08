/**
 * 共享渲染模块（纯函数，无文件系统依赖）
 *
 * - 供 build.js（本地构建 / KV 迁移）与 Cloudflare Pages Functions（KV 动态渲染）共同使用
 * - 所有渲染函数接收统一的文章 / 专栏对象，返回 HTML 字符串或数据，不直接读写文件
 *
 * 文章对象形状（与 KV 中存储的结构一致）：
 *   { slug, title, date, category, tags[], summary, series:{name,slug,order}|null, content, ... }
 *
 * 界面主题（自 v1.2 起）：
 *   采用「Linux 系统窗口」风格的界面：
 *   - 顶部站点头 = 窗口标题栏（红黄绿三灯 + 终端提示符风站点名）
 *   - 首页中部最上方 = 进站介绍窗口（原左侧个人资料卡内容迁移至此）
 *   - 文章卡片 = 迷你窗口（标题栏显示文章文件路径）
 *   - 页脚 = 底部状态栏
 */
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

// 站点配置：所有可自定义的站点内容统一在项目根目录的 site.config.js 中修改
import { SITE } from '../../site.config.js';

// 配置 marked：代码高亮 + 标题编号（用于生成目录），与构建时保持一致
const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    }
  })
);
marked.setOptions({
  gfm: true,
  breaks: false,
  headerIds: true,
  headerPrefix: 'h-'
});

/* 代码块「复制」按钮（服务端注入，事件绑定在 assets/js/main.js） */
const COPY_BTN_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const CODE_COPY_BTN = `<button type="button" class="code-copy" aria-label="复制代码到剪贴板"><span class="code-copy-icon">${COPY_BTN_SVG}</span><span class="code-copy-text">复制</span></button>`;

/**
 * 渲染 markdown：
 * - 由 marked v12+ 渲染正文（marked 12 已不再自动生成标题锚点 id）
 * - 后处理①：给 h2~h4 按标题文本补齐 id，供「本文目录」锚点跳转与滚动高亮使用
 * - 后处理②：把 <pre> 代码块包进 .code-block 容器并注入右上角「复制」按钮
 */
export function renderMarkdown(md) {
  const html = marked.parse(md);
  return addHeadingAnchors(wrapCodeBlocks(html));
}

/** 解码内联 HTML 中的常见实体，得到可阅读的纯文本 */
function decodeHtmlEntities(s) {
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/gi, (all, ent) => {
    const low = ent.toLowerCase();
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    if (named[low]) return named[low];
    if (low[0] === '#') {
      const code = low[1] === 'x' ? parseInt(low.slice(2), 16) : parseInt(low.slice(1), 10);
      if (!Number.isNaN(code) && code >= 0 && code <= 0x10ffff) return String.fromCodePoint(code);
    }
    return all;
  });
}

/** 标题文本 → 唯一锚点 id：相同文本的标题依次追加 -2、-3 后缀 */
function nextHeadingId(text, used) {
  const base = 'h-' + slugify(text);
  const n = (used.get(base) || 0) + 1;
  used.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

/** 给 HTML 中 h2~h4 补充锚点 id（依据标题文本生成，去重后与目录提取结果一一对应） */
function addHeadingAnchors(html) {
  const used = new Map();
  const re = /<h([234])\b([^>]*)>/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(html))) {
    const level = m[1];
    const attrs = (m[2] || '').replace(/\s+$/, '');
    const endTag = `</h${level}>`;
    const close = html.indexOf(endTag, re.lastIndex);
    if (close === -1) break; // 结构异常，跳过后续处理
    const inner = html.slice(re.lastIndex, close);
    const id = nextHeadingId(decodeHtmlEntities(inner.replace(/<[^>]*>/g, '')), used);
    out += html.slice(last, m.index);
    out += `<h${level}${attrs ? ` ${attrs}` : ''} id="${id}">${inner}${endTag}`;
    last = close + endTag.length;
    re.lastIndex = last; // 直接从闭合标签之后继续扫描
  }
  out += html.slice(last);
  return out;
}

/** 给每个 <pre> 代码块包上 .code-block 容器，并在其右上角注入「复制」按钮 */
function wrapCodeBlocks(html) {
  const re = /<pre\b[^>]*>/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(html))) {
    const close = html.indexOf('</pre>', m.index);
    if (close === -1) break;
    out += html.slice(last, m.index);
    out += '<div class="code-block">' + CODE_COPY_BTN + html.slice(m.index, close + '</pre>'.length) + '</div>';
    last = close + '</pre>'.length;
    re.lastIndex = last;
  }
  out += html.slice(last);
  return out;
}

/**
 * 从渲染后的正文 HTML 提取二至四级标题作为 TOC。
 * 直接扫描渲染结果（此时 addHeadingAnchors 已为标题补齐 id），
 * 保证目录文本 / 锚点与正文中的标题完全一致，天然规避行内格式差异。
 */
export function extractTocFromHtml(html) {
  const toc = [];
  const used = new Map();
  const re = /<h([234])\b([^>]*)>([\s\S]*?)<\/h\1>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[2] || '';
    const idAttr = /\bid\s*=\s*"([^"]+)"/.exec(attrs);
    const inner = m[3];
    const text = decodeHtmlEntities(inner.replace(/<[^>]*>/g, ''))
      .replace(/[ \t]+/g, ' ')
      .trim();
    if (!text) continue;
    toc.push({
      level: Number(m[1]),
      text,
      id: idAttr ? idAttr[1] : nextHeadingId(text, used)
    });
  }
  return toc;
}

export function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
}

export function formatDate(d) {
  const date = new Date(d);
  if (isNaN(date)) return d;
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** 把日期（Date 对象或字符串）标准化为 YYYY-MM-DD */
export function toISODate(d) {
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const s = String(d);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/**
 * 解析 series 字段，返回标准化的专栏信息对象。
 * 支持两种写法：
 *   1) series: "专栏名"                          → order 为 null，由 collectSeries 按 date 排序
 *   2) series: { name: "专栏名", order: 2 }       → order 为数字，越小越靠前
 */
export function parseSeries(raw) {
  if (!raw) return null;
  let name, order = null;
  if (typeof raw === 'string') {
    name = raw.trim();
  } else if (typeof raw === 'object') {
    name = raw.name ? String(raw.name).trim() : '';
    const o = Number(raw.order);
    order = Number.isFinite(o) ? o : null;
  }
  if (!name) return null;
  return { name, slug: slugify(name), order };
}

export function estimateReadingTime(text) {
  const chars = String(text || '').replace(/\s+/g, '').length;
  return Math.max(1, Math.round(chars / 500));
}

export function tagSizeClass(n) {
  if (n >= 5) return 'xl';
  if (n >= 3) return 'lg';
  if (n >= 2) return 'md';
  return 'sm';
}

export function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
  }[c]));
}

/**
 * 把文章按专栏（series slug）分组，组内排序，并回填导航信息。
 * 同 build.js 中的 collectSeries，供 Functions 与构建共用。
 */
export function collectSeries(posts) {
  const map = new Map();
  for (const p of posts) {
    if (!p.series) continue;
    if (!map.has(p.series.slug)) {
      map.set(p.series.slug, {
        slug: p.series.slug,
        name: p.series.name,
        posts: []
      });
    }
    map.get(p.series.slug).posts.push(p);
  }
  for (const col of map.values()) {
    col.posts.sort((a, b) => {
      const ao = a.series.order, bo = b.series.order;
      if (ao !== null && bo !== null) return ao - bo;
      if (ao !== null) return -1;
      if (bo !== null) return 1;
      return new Date(a.date) - new Date(b.date);
    });
    col.posts.forEach((p, i) => {
      p.seriesIndex = i + 1;
      p.seriesPrev = i > 0 ? col.posts[i - 1] : null;
      p.seriesNext = i < col.posts.length - 1 ? col.posts[i + 1] : null;
    });
    col.count = col.posts.length;
    col.startDate = col.posts[0].date;
    col.endDate = col.posts[col.posts.length - 1].date;
    col.summary = col.posts[0].summary;
  }
  return [...map.values()].sort((a, b) => new Date(b.endDate) - new Date(a.endDate));
}

/** 回填每篇文章的 seriesCount（专栏总篇数），供文章页专栏信息块使用 */
export function backfillSeriesCount(series) {
  for (const col of series) {
    for (const p of col.posts) p.seriesCount = col.count;
  }
  return series;
}

/** 把 KV 中的文章记录补齐 html / toc / summary 等渲染所需字段 */
export function hydratePost(article) {
  const content = (article && article.content) || '';
  const html = renderMarkdown(content);
  const toc = extractTocFromHtml(html);
  const summary = article && article.summary && String(article.summary).trim()
    ? article.summary
    : content.replace(/[#`>*\-\[\]\(\)]/g, '').slice(0, 120) + '…';
  return {
    ...(article || {}),
    content,
    html,
    toc,
    summary,
    readingMinutes: estimateReadingTime(content)
  };
}

/* ============================================================
   通用 UI 片段（Linux 窗口风格）
   ============================================================ */

/** 窗口标题栏左侧的「红黄绿」三灯（纯装饰） */
const WIN_DOTS = '<span class="win-dots" aria-hidden="true"><i class="wd wd-r"></i><i class="wd wd-y"></i><i class="wd wd-g"></i></span>';

/** 生成一段窗口标题栏：三灯 + 标题文字（+ 可选右侧标签） */
function winBar(text, tag = '') {
  return `
        <div class="win-bar">
          ${WIN_DOTS}
          <span class="win-bar-text">${text}</span>
          ${tag ? `<span class="win-bar-tag">${tag}</span>` : ''}
        </div>`;
}

/* ============================================================
   页面骨架（所有页面共用）
   ============================================================ */
export function renderLayout(opts) {
  const { title, description, content, extraHead = '', extraBody = '', mainClass = '', containerMod = '' } = opts;
  const navHtml = SITE.nav.map(n =>
    `<a href="${n.href}" class="nav-link">${n.label}</a>`
  ).join('\n');
  const socialHtml = SITE.social.map(s =>
    `<a href="${s.href}" class="social-link" target="_blank" rel="noopener">${s.label}</a>`
  ).join('\n');

  // 管理员登录入口：位于页脚右侧（交互由 /assets/js/admin.js 接管）
  const adminEntry = `
        <button type="button" class="admin-entry" id="admin-entry" aria-haspopup="dialog">🔒 管理员登录</button>`;

  return `<!DOCTYPE html>
<html lang="${SITE.lang}" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} · ${SITE.title}</title>
  <meta name="description" content="${description || SITE.description}">
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
  <link rel="alternate" type="application/rss+xml" title="${SITE.title}" href="/feed.xml">
  <link rel="stylesheet" href="/assets/css/style.css">
  <script defer src="https://events.vercount.one/js"></script>
  <script>
    (function(){try{var t=localStorage.getItem('byteforge-theme');if(t){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();
  </script>
  ${extraHead}
</head>
<body>
  <header class="site-header">
    <div class="container header-inner">
      ${WIN_DOTS}
      <a href="/" class="site-title">${SITE.title}<span class="site-caret" aria-hidden="true">_</span></a>
      <aside class="visit-badge" id="visit-badge" aria-label="本站访问统计">
        <span class="visit-badge-icon">👥</span>
        <span class="visit-badge-label">${SITE.ui.visitorLabel}</span>
        <span class="visit-badge-value" id="vercount_value_site_uv">…</span>
        <span class="visit-badge-unit">${SITE.ui.visitorUnit}</span>
      </aside>
      <nav class="site-nav">${navHtml}</nav>
      <button class="theme-toggle" id="theme-toggle" aria-label="切换主题" title="切换主题">
        <span class="theme-icon-light">🌙</span>
        <span class="theme-icon-dark">☀️</span>
      </button>
    </div>
  </header>
  <div class="container layout${containerMod ? ` ${containerMod}` : ''}">
    <main class="site-main${mainClass ? ` ${mainClass}` : ''}">
${content}
    </main>
  </div>
  <footer class="site-footer">
    <div class="container footer-inner">
      <p class="footer-status"><span class="footer-status-led" aria-hidden="true"></span>${SITE.title}@${SITE.login}:<span class="footer-status-tilde">~</span>$</p>
      <div class="footer-actions">
        <div class="social">${socialHtml}</div>
        ${adminEntry}
      </div>
      <p class="copyright">© ${new Date().getFullYear()} ${SITE.author} · ${SITE.ui.footerNote}</p>
    </div>
  </footer>
  <script src="/assets/js/main.js"></script>
  <script src="/assets/js/admin.js"></script>
  ${extraBody}
</body>
</html>`;
}

/** 首页（含进站介绍窗口 + 专栏速览区 + 最新文章窗口列表） */
export function renderHome(posts, series) {
  // —— 进站介绍窗口（原左侧个人资料卡内容迁至此处，位于中部最上方）——
  const socialButtons = SITE.socialButtons.map(btn => `
        <a class="profile-social-btn" href="${btn.url}" target="_blank" rel="noopener" title="${btn.name}">
          <span class="profile-social-icon">${btn.icon}</span>
          <span>${btn.name}</span>
        </a>`).join('');

  const friendIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
  const friendLinks = SITE.friendLinks.map(link => `
          <a class="profile-friend-link" href="${link.url}" target="_blank" rel="noopener">
            <span class="profile-link-icon">${friendIcon}</span>
            <span>${link.name}</span>
          </a>`).join('');

  const introHtml = `
    <section class="intro-win">
      ${winBar('~/README.md', 'welcome guest')}
      <div class="win-body intro-body">
        <div class="intro-grid">
          <div class="intro-id">
            <img class="intro-avatar" src="${SITE.avatar}" alt="${SITE.author}" loading="lazy" onerror="this.onerror=null;this.src='/assets/head.jpg'">
            <div class="intro-id-text">
              <h1 class="intro-name">${SITE.author}<span class="intro-login">@${SITE.login}</span></h1>
              <p class="intro-bio">${SITE.bio}</p>
            </div>
          </div>
          <div class="intro-slogan">
            <h2 class="intro-site">${SITE.title}</h2>
            <p class="intro-desc">${SITE.description}</p>
            <div class="intro-social">
              ${socialButtons}
            </div>
          </div>
        </div>
        ${friendLinks ? `
        <div class="intro-links">
          <span class="intro-links-label">友情链接</span>
          <div class="intro-friend-links">${friendLinks}</div>
        </div>` : ''}
      </div>
    </section>`;

  // —— 最新文章：每篇为一个小窗口 ——
  const list = posts.slice(0, 10).map(p => `
    <article class="post-card">
      ${winBar(`~/posts/${p.slug}.md`)}
      <div class="win-body post-body">
        <h2 class="post-card-title"><a href="/posts/${p.slug}.html">${p.title}</a></h2>
        <div class="post-meta">
          <time datetime="${p.date}">${formatDate(p.date)}</time>
          <span class="post-category">${p.category}</span>
          ${p.series ? `<a class="post-series" href="/columns/${p.series.slug}.html">📚 ${p.series.name}</a>` : ''}
        </div>
        <p class="post-summary">${p.summary}</p>
        <div class="post-tags">
          ${p.tags.map(t => `<a href="/tags.html#${slugify(t)}" class="tag">#${t}</a>`).join('')}
        </div>
      </div>
    </article>`).join('\n');

  // —— 首页专栏速览区 ——
  const seriesHtml = series.length ? `
    <section class="series-preview">
      <h2 class="section-title"><a href="/columns.html" class="section-title-link">${SITE.ui.columnsTitle}</a></h2>
      <div class="series-grid">
        ${series.slice(0, 6).map(c => `
          <a href="/columns/${c.slug}.html" class="series-card">
            <div class="series-card-header">
              <h3 class="series-card-title">${c.name}</h3>
              <span class="series-card-count">${c.count} 篇</span>
            </div>
            <p class="series-card-summary">${c.summary}</p>
            <div class="series-card-meta">
              <span class="series-card-cmd">$</span>
              <time>${formatDate(c.startDate)}</time>
              <span>→</span>
              <time>${formatDate(c.endDate)}</time>
            </div>
          </a>
        `).join('')}
      </div>
    </section>` : '';

  const content = `
    ${introHtml}
    ${seriesHtml}
    <section class="post-list">
      <h2 class="section-title">${SITE.ui.latestPostsTitle}</h2>
      ${list}
    </section>`;

  return renderLayout({
    title: '首页',
    description: SITE.description,
    content
  });
}

/** 文章页（正文窗口 + 目录：窄屏内联折叠目录 / 宽屏右侧悬浮目录卡片） */
export function renderPostPage(post) {
  const tocItems = Array.isArray(post.toc) ? post.toc : [];
  const hasToc = tocItems.length > 0;

  // 目录条目清单：内联目录与右侧悬浮卡片共用，锚点 id 与正文标题（服务端补齐）一致
  const tocListHtml = hasToc
    ? `<ul>${tocItems.map(t =>
        `<li class="toc-level-${t.level}"><a href="#${escapeXml(t.id)}">${escapeXml(t.text)}</a></li>`
      ).join('')}</ul>`
    : '';

  // 窄屏折叠目录（宽屏由 CSS 隐藏，避免与右侧悬浮卡片重复）
  const tocInlineHtml = hasToc
    ? `<details class="toc" open><summary>目录</summary>${tocListHtml}</details>`
    : '';

  // 宽屏右侧悬浮目录卡片（position: sticky，滚动时跟随阅读位置）
  const tocCardHtml = hasToc
    ? `<aside class="toc-card" aria-label="本文目录">
        <div class="toc-card-bar">
          <span class="toc-card-title">本文目录</span>
          <span class="toc-card-count">${tocItems.length} 节</span>
        </div>
        <nav class="toc-card-nav">${tocListHtml}</nav>
      </aside>`
    : '';

  // 专栏信息块：当文章属于某个专栏时，渲染专栏名、序号及上下篇导航
  let seriesBoxHtml = '';
  if (post.series && post.seriesIndex) {
    const seriesCount = post.seriesCount || (() => {
      let n = post.seriesIndex; let cur = post;
      while (cur.seriesNext) { cur = cur.seriesNext; n++; }
      return n;
    })();

    const prevHtml = post.seriesPrev
      ? `<a class="series-nav-prev" href="/posts/${post.seriesPrev.slug}.html">← ${post.seriesPrev.title}</a>`
      : `<span class="series-nav-disabled">← 已是第一篇</span>`;
    const nextHtml = post.seriesNext
      ? `<a class="series-nav-next" href="/posts/${post.seriesNext.slug}.html">${post.seriesNext.title} →</a>`
      : `<span class="series-nav-disabled">已是最后一篇 →</span>`;

    seriesBoxHtml = `
    <section class="series-box">
      <div class="series-box-header">
        <span class="series-badge">专栏</span>
        <a class="series-box-title" href="/columns/${post.series.slug}.html">${post.series.name}</a>
        <span class="series-box-index">第 ${post.seriesIndex} 篇 / 共 ${seriesCount} 篇</span>
      </div>
      <nav class="series-nav">
        ${prevHtml}
        ${nextHtml}
      </nav>
    </section>`;
  }

  // 下载按钮：下载文章 Markdown 源文件（由 /api/articles/<slug>.md 提供）
  const downloadHtml = `
        <div class="post-actions">
          <a class="post-download" href="/api/articles/${post.slug}.md" download title="下载本文 Markdown 源文件">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            下载本文
          </a>
        </div>`;

  // 评论窗口：登录 GitHub 账号后可评论（交互逻辑见 /assets/js/comments.js）
  const slugEsc = escapeXml(post.slug);
  const commentsWin = `
    <section class="comments-win">
      ${winBar(`~/comments/${slugEsc}.sh`)}
      <div class="win-body comments-body">
        <div id="comments-root" data-slug="${slugEsc}">
          <p class="comments-loading">$ 正在加载评论…</p>
        </div>
      </div>
    </section>`;

  const content = `
    <div class="post-wrap${hasToc ? ' post-wrap--toc' : ''}">
      <article class="post">
        ${winBar(`~/posts/${slugEsc}.md`, `${post.readingMinutes || estimateReadingTime(post.content)} min read`)}
        <div class="win-body">
          <header class="post-header">
            <h1 class="post-title">${post.title}</h1>
            <div class="post-meta">
              <time datetime="${post.date}">${formatDate(post.date)}</time>
              <span class="post-category">${post.category}</span>
              ${post.series ? `<a class="post-series" href="/columns/${post.series.slug}.html">📚 ${post.series.name}</a>` : ''}
              <span class="post-reading">${post.readingMinutes || estimateReadingTime(post.content)} 分钟阅读</span>
            </div>
            ${downloadHtml}
            <div class="post-tags">
              ${post.tags.map(t => `<a href="/tags.html#${slugify(t)}" class="tag">#${t}</a>`).join('')}
            </div>
          </header>
          ${seriesBoxHtml}
          ${tocInlineHtml}
          <div class="post-content">
            ${post.html}
          </div>
        </div>
      </article>
      ${tocCardHtml}
    </div>
    ${commentsWin}
    <a href="/" class="back-home">← 返回首页</a>`;

  return renderLayout({
    title: post.title,
    description: post.summary,
    content,
    mainClass: hasToc ? 'site-main--toc' : '',
    // 含目录时放宽外层容器宽度，正文列仍保持居中，目录卡片位于左侧留白区
    containerMod: hasToc ? 'layout--wide' : '',
    extraBody: '<script src="/assets/js/comments.js"></script>'
  });
}

/** 归档页 */
export function renderArchive(posts) {
  const yearMap = new Map();
  for (const p of posts) {
    const y = String(p.date).slice(0, 4);
    if (!yearMap.has(y)) yearMap.set(y, []);
    yearMap.get(y).push(p);
  }
  const years = [...yearMap.keys()].sort((a, b) => b.localeCompare(a));
  const content = `
    <section class="archive">
      <h1 class="section-title">归档</h1>
      ${years.map(y => `
        <div class="archive-year">
          <h2 class="archive-year-title">${y}</h2>
          <ul class="archive-list">
            ${yearMap.get(y).map(p => `
              <li>
                <time datetime="${p.date}">${formatDate(p.date)}</time>
                <a href="/posts/${p.slug}.html">${p.title}</a>
                ${p.series ? `<a class="post-series post-series-inline" href="/columns/${p.series.slug}.html">📚 ${p.series.name}</a>` : ''}
              </li>`).join('')}
          </ul>
        </div>`).join('')}
    </section>`;
  return renderLayout({ title: '归档', description: '全部文章归档', content });
}

/** 标签页 */
export function renderTags(posts) {
  const tagMap = new Map();
  for (const p of posts) {
    for (const t of p.tags) {
      if (!tagMap.has(t)) tagMap.set(t, []);
      tagMap.get(t).push(p);
    }
  }
  const tags = [...tagMap.keys()].sort((a, b) => tagMap.get(b).length - tagMap.get(a).length);
  const content = `
    <section class="tags-page">
      <h1 class="section-title">标签</h1>
      <div class="tag-cloud">
        ${tags.map(t => `<a href="#${slugify(t)}" class="tag tag-${tagSizeClass(tagMap.get(t).length)}">#${t} <span class="tag-count">${tagMap.get(t).length}</span></a>`).join('')}
      </div>
      ${tags.map(t => `
        <section id="${slugify(t)}" class="tag-section">
          <h2 class="tag-section-title">#${t}</h2>
          <ul class="archive-list">
            ${tagMap.get(t).map(p => `
              <li>
                <time datetime="${p.date}">${formatDate(p.date)}</time>
                <a href="/posts/${p.slug}.html">${p.title}</a>
                ${p.series ? `<a class="post-series post-series-inline" href="/columns/${p.series.slug}.html">📚 ${p.series.name}</a>` : ''}
              </li>`).join('')}
          </ul>
        </section>`).join('')}
    </section>`;
  return renderLayout({ title: '标签', description: '按标签浏览文章', content });
}

/** 专栏列表页 columns.html */
export function renderColumnsList(series) {
  let content;
  if (!series.length) {
    content = `
    <section class="columns-page">
      <h1 class="section-title">${SITE.ui.columnsTitle}</h1>
      <p class="search-empty">暂无专栏，在文章 frontmatter 中添加 <code>series: 专栏名</code> 即可创建。</p>
    </section>`;
  } else {
    const cards = series.map(c => {
      const list = c.posts.slice(0, 5).map(p => `
        <li>
          <span class="series-idx">#${p.seriesIndex}</span>
          <time datetime="${p.date}">${formatDate(p.date)}</time>
          <a href="/posts/${p.slug}.html">${p.title}</a>
        </li>`).join('');
      const more = c.posts.length > 5 ? `<li class="series-more"><a href="/columns/${c.slug}.html">查看全部 ${c.posts.length} 篇 →</a></li>` : '';
      return `
        <article class="series-card series-card-lg">
          <div class="series-card-header">
            <h3 class="series-card-title"><a href="/columns/${c.slug}.html">${c.name}</a></h3>
            <span class="series-card-count">${c.count} 篇</span>
          </div>
          <p class="series-card-summary">${c.summary}</p>
          <ul class="series-card-list">
            ${list}
            ${more}
          </ul>
          <div class="series-card-meta">
            <span>起讫</span>
            <time>${formatDate(c.startDate)}</time>
            <span>—</span>
            <time>${formatDate(c.endDate)}</time>
          </div>
        </article>`;
    }).join('');
    content = `
    <section class="columns-page">
      <h1 class="section-title">${SITE.ui.columnsTitle}</h1>
      <p class="columns-desc">按主题把多篇文章聚合成专栏，便于系统阅读。</p>
      <div class="series-grid series-grid-lg">
        ${cards}
      </div>
    </section>`;
  }
  return renderLayout({
    title: '专栏',
    description: '按主题聚合的系列文章',
    content
  });
}

/** 单个专栏详情页 columns/<slug>.html */
export function renderColumnPage(col) {
  const listHtml = col.posts.map(p => `
    <li class="series-article-item">
      <div class="series-article-meta">
        <span class="series-idx-badge">第 ${p.seriesIndex} 篇</span>
        <time datetime="${p.date}">${formatDate(p.date)}</time>
      </div>
      <h3 class="series-article-title">
        <a href="/posts/${p.slug}.html">${p.title}</a>
      </h3>
      <p class="series-article-summary">${p.summary}</p>
      <div class="post-tags">
        ${p.tags.map(t => `<a href="/tags.html#${slugify(t)}" class="tag">#${t}</a>`).join('')}
      </div>
    </li>`).join('');

  const content = `
    <section class="column-detail">
      <a href="/columns.html" class="back-home">← 返回专栏列表</a>
      <header class="column-header">
        <div class="column-header-bar">
          <span class="series-badge">📚 专栏</span>
          <span class="column-meta-path">~/columns/${col.slug}</span>
        </div>
        <h1 class="column-title">${col.name}</h1>
        <div class="column-meta">
          <span>共 <strong>${col.count}</strong> 篇</span>
          <span class="dot">·</span>
          <span>${formatDate(col.startDate)} — ${formatDate(col.endDate)}</span>
        </div>
        <p class="column-summary">${col.summary}</p>
      </header>
      <ol class="series-article-list">
        ${listHtml}
      </ol>
    </section>`;

  return renderLayout({
    title: col.name,
    description: `${col.name} · 共 ${col.count} 篇文章`,
    content
  });
}

/** 搜索索引 search.json 数据（数组形式返回，由调用方序列化） */
export function renderSearchIndex(posts) {
  return posts.map(p => ({
    slug: p.slug,
    title: p.title,
    date: p.date,
    year: String(p.date).slice(0, 4),
    month: String(p.date).slice(0, 7),
    category: p.category,
    tags: p.tags,
    series: p.series ? { slug: p.series.slug, name: p.series.name } : null,
    summary: p.summary,
    url: `/posts/${p.slug}.html`
  }));
}

/** 搜索页 search.html */
export function renderSearchPage(posts, series) {
  const yearMonths = new Map();
  for (const p of posts) {
    const y = String(p.date).slice(0, 4);
    const m = String(p.date).slice(0, 7);
    if (!yearMonths.has(y)) yearMonths.set(y, new Set());
    yearMonths.get(y).add(m);
  }
  const years = [...yearMonths.keys()].sort((a, b) => b.localeCompare(a));
  const tagMap = new Map();
  for (const p of posts) {
    for (const t of p.tags) tagMap.set(t, (tagMap.get(t) || 0) + 1);
  }
  const tags = [...tagMap.keys()].sort((a, b) => tagMap.get(b) - tagMap.get(a));

  const content = `
    <section class="search-page">
      <h1 class="section-title">搜索</h1>

      <div class="search-win">
        ${winBar('~/search.sh', 'search')}
        <div class="win-body">
          <form class="search-form" id="search-form" autocomplete="off">
            <div class="search-field search-field-keyword">
              <label for="q">关键词</label>
              <input type="search" id="q" name="q" placeholder="搜索标题、摘要、标签或专栏…" class="search-input">
            </div>

            <div class="search-field">
              <label for="column">专栏</label>
              <select id="column" name="column" class="search-select">
                <option value="">全部</option>
                ${series.map(c => `<option value="${c.slug}">${c.name} (${c.count})</option>`).join('')}
              </select>
            </div>

            <div class="search-field search-field-date">
              <label for="year">年份</label>
              <select id="year" name="year" class="search-select">
                <option value="">全部</option>
                ${years.map(y => `<option value="${y}" data-months="${[...yearMonths.get(y)].sort((a, b) => b.localeCompare(a)).join(',')}">${y}</option>`).join('')}
              </select>
            </div>

            <div class="search-field search-field-date">
              <label for="month">月份</label>
              <select id="month" name="month" class="search-select" disabled>
                <option value="">全部</option>
              </select>
            </div>

            <div class="search-field search-field-actions">
              <button type="submit" class="search-btn">搜索</button>
              <button type="reset" class="search-btn search-btn-ghost" id="search-reset">重置</button>
            </div>
          </form>

          <fieldset class="search-tags" id="search-tags">
            <legend>标签筛选（多选）</legend>
            <div class="search-tags-list">
              ${tags.map(t => `
                <label class="search-tag">
                  <input type="checkbox" name="tag" value="${t}">
                  <span>#${t} <em>${tagMap.get(t)}</em></span>
                </label>`).join('')}
            </div>
          </fieldset>

          <div class="search-summary" id="search-summary" aria-live="polite"></div>
          <div class="search-results" id="search-results"></div>
        </div>
      </div>
    </section>`;

  return renderLayout({
    title: '搜索',
    description: '按关键词、专栏、日期或标签搜索文章',
    content,
    extraBody: '<script src="/assets/js/search.js"></script>'
  });
}

/** 从 markdown 正文提取纯文本摘要（用于 RSS description 兜底） */
function plainText(md, len) {
  return String(md || '')
    .replace(/[#`>*\-\[\]\(\)]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, len);
}

/** RSS feed.xml（RSS 2.0 + Atom/DC 扩展：自引用、作者、分类；仅摘要，不含全文） */
export function renderRss(posts, opts = {}) {
  const { limit = 20 } = opts;
  const feedUrl = `${SITE.url}/feed.xml`;
  // 频道最后构建时间：取最新文章日期，无文章时回退到当前时间
  const buildDate = new Date(posts.length ? (posts[0].date || Date.now()) : Date.now());
  const lastBuildDate = isNaN(buildDate) ? new Date() : buildDate;

  const items = posts.slice(0, limit).map(p => {
    if (!p || !p.slug) return '';
    const url = `${SITE.url}/posts/${escapeXml(p.slug)}.html`;

    // 日期防御：无效日期不输出 pubDate / dc:date，避免生成 "Invalid Date"
    const date = new Date(p.date || p.updatedAt);
    const dateValid = !isNaN(date.getTime());
    const pubDate = dateValid ? date.toUTCString() : '';
    const isoDate = dateValid ? toISODate(date) : '';

    // description 兜底：summary 为空时截取正文纯文本
    const summary = (p.summary || '').trim() || plainText(p.content || p.html || '', 120);
    const tags = Array.isArray(p.tags) ? p.tags : [];

    const lines = [
      '    <item>',
      `      <title>${escapeXml(p.title)}</title>`,
      `      <link>${url}</link>`,
      `      <guid isPermaLink="true">${url}</guid>`
    ];
    if (pubDate) lines.push(`      <pubDate>${pubDate}</pubDate>`);
    lines.push(`      <description>${escapeXml(summary)}</description>`);
    lines.push(`      <dc:creator>${escapeXml(SITE.author)}</dc:creator>`);
    if (isoDate) lines.push(`      <dc:date>${isoDate}</dc:date>`);
    for (const t of tags) lines.push(`      <category>${escapeXml(t)}</category>`);
    lines.push('    </item>');
    return lines.join('\n');
  }).filter(Boolean).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(SITE.title)}</title>
    <link>${SITE.url}</link>
    <description>${escapeXml(SITE.description)}</description>
    <language>${SITE.lang}</language>
    <lastBuildDate>${lastBuildDate.toUTCString()}</lastBuildDate>
    <generator>${escapeXml(SITE.title)}</generator>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
    <image>
      <url>${SITE.avatar}?size=144</url>
      <title>${escapeXml(SITE.title)}</title>
      <link>${SITE.url}</link>
      <width>144</width>
      <height>144</height>
    </image>
${items}
  </channel>
</rss>`;
}

/** 404 页面 */
export function renderNotFound() {
  const content = `
    <section class="not-found">
      <h1>404</h1>
      <p>${SITE.ui.notFoundText}</p>
      <a href="/" class="back-home">← 返回首页</a>
    </section>`;
  return renderLayout({ title: '404', description: SITE.ui.notFoundText, content });
}
