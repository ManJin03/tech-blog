/**
 * 共享渲染模块（纯函数，无文件系统依赖）
 *
 * - 供 build.js（本地构建 / KV 迁移）与 Cloudflare Pages Functions（KV 动态渲染）共同使用
 * - 所有渲染函数接收统一的文章 / 专栏对象，返回 HTML 字符串或数据，不直接读写文件
 *
 * 文章对象形状（与 KV 中存储的结构一致）：
 *   { slug, title, date, category, tags[], summary, series:{name,slug,order}|null, content, ... }
 */
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

// 站点配置（与构建时保持一致）
export const SITE = {
  title: 'ByteForge',
  description: '一个关注系统编程、异构计算与工程实践的个人技术博客',
  url: 'https://example.com',
  author: 'ManJin',
  login: 'ManJin03',
  avatar: 'https://github.com/ManJin03.png',
  homepage: 'https://manjin.pages.dev/',
  bio: '系统编程与异构计算爱好者，热衷于探索 C++ 底层机制、CUDA 并行编程与昇腾 Ascend 算子开发。这里是我记录技术学习与工程实践的地方，希望这些文字能对你有所帮助。',
  lang: 'zh-CN',
  nav: [
    { label: '首页', href: '/' },
    { label: '专栏', href: '/columns.html' },
    { label: '归档', href: '/archive.html' },
    { label: '标签', href: '/tags.html' },
    { label: '搜索', href: '/search.html' },
    { label: '关于', href: '/about.html' }
  ],
  social: [
    { label: 'GitHub', href: 'https://github.com/' },
    { label: 'RSS', href: '/feed.xml' }
  ],
  // 个人资料卡内的社交按钮（图标仿 ManJin 总站外部链接样式：右上箭头方框）
  socialButtons: [
    { name: 'GitHub', url: 'https://github.com/ManJin03', icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 4.7 18 5 18 5c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/></svg>' },
    { name: '总站', url: 'https://manjin.pages.dev/', icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/></svg>' }
  ],
  // 友情链接（个人资料卡底部）
  friendLinks: [
    { name: 'Young man の 小破站', url: 'https://homepage-afl.pages.dev/' }
  ]
};

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

export function renderMarkdown(md) {
  return marked.parse(md);
}

/** 从 markdown 正文提取二级及以下标题作为 TOC */
export function buildToc(md) {
  const lines = String(md || '').split('\n');
  const toc = [];
  let inCode = false;
  for (const line of lines) {
    if (/^```/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const m = /^(#{2,4})\s+(.*)$/.exec(line);
    if (m) {
      const level = m[1].length;
      const text = m[2].replace(/`/g, '').trim();
      const id = 'h-' + text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
      toc.push({ level, text, id });
    }
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
  const toc = buildToc(content);
  const html = renderMarkdown(content);
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

export function renderLayout(opts) {
  const { title, description, content, extraHead = '', extraBody = '' } = opts;
  const navHtml = SITE.nav.map(n =>
    `<a href="${n.href}" class="nav-link">${n.label}</a>`
  ).join('\n');
  const socialHtml = SITE.social.map(s =>
    `<a href="${s.href}" class="social-link" target="_blank" rel="noopener">${s.label}</a>`
  ).join('\n');

  // 左侧个人资料卡片（GitHub 风格）：含社交按钮、我的站点、友情链接、管理员入口
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

  // 管理员登录入口：位于个人资料卡底部，交互由 /assets/js/admin.js 接管
  const adminEntry = `
          <div class="profile-admin-entry">
            <button type="button" class="profile-admin-btn" id="admin-entry" aria-haspopup="dialog">🔒 管理员登录</button>
          </div>`;

  const sidebarHtml = `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-inner">
        <div class="profile-card">
          <div class="profile-banner"></div>
          <div class="profile-avatar">
            <img src="${SITE.avatar}" alt="${SITE.author}" loading="lazy">
          </div>
          <div class="profile-identity">
            <div class="profile-name">${SITE.author}</div>
            <div class="profile-login">@${SITE.login}</div>
          </div>
          <p class="profile-bio">${SITE.bio}</p>
          <div class="profile-social">
            ${socialButtons}
          </div>
          <div class="profile-divider"></div>
          <div class="profile-section">
            <div class="profile-section-title">友情链接</div>
            <div class="profile-friend-links">${friendLinks}</div>
          </div>
          ${adminEntry}
        </div>
      </div>
    </aside>`;

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
      <button class="sidebar-toggle nav-toggle" id="sidebarToggle" aria-label="折叠/展开侧边栏" title="折叠/展开侧边栏" aria-expanded="true">
        <span class="nav-toggle-bars" aria-hidden="true"><i></i><i></i><i></i></span>
      </button>
      <a href="/" class="site-title">${SITE.title}</a>
      <aside class="visit-badge" id="visit-badge" aria-label="本站访问统计">
        <span class="visit-badge-icon">👥</span>
        <span class="visit-badge-label">本站访客</span>
        <span class="visit-badge-value" id="vercount_value_site_uv">…</span>
        <span class="visit-badge-unit">人</span>
      </aside>
      <nav class="site-nav">${navHtml}</nav>
      <button class="theme-toggle" id="theme-toggle" aria-label="切换主题" title="切换主题">
        <span class="theme-icon-light">🌙</span>
        <span class="theme-icon-dark">☀️</span>
      </button>
    </div>
  </header>
  <div class="container layout">
    ${sidebarHtml}
    <main class="site-main">
${content}
    </main>
  </div>
  <footer class="site-footer">
    <div class="container footer-inner">
      <div class="social">${socialHtml}</div>
      <p class="copyright">© ${new Date().getFullYear()} ${SITE.author} · 由自建生成器驱动 · 文章数据存储于 Cloudflare KV</p>
    </div>
  </footer>
  <script src="/assets/js/main.js"></script>
  <script src="/assets/js/admin.js"></script>
  ${extraBody}
</body>
</html>`;
}

export function renderHome(posts, series) {
  const list = posts.slice(0, 10).map(p => `
    <article class="post-card">
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
    </article>`).join('\n');

  const seriesHtml = series.length ? `
    <section class="series-preview">
      <h2 class="section-title"><a href="/columns.html" class="section-title-link">专栏</a></h2>
      <div class="series-grid">
        ${series.slice(0, 6).map(c => `
          <a href="/columns/${c.slug}.html" class="series-card">
            <div class="series-card-header">
              <h3 class="series-card-title">${c.name}</h3>
              <span class="series-card-count">${c.count} 篇</span>
            </div>
            <p class="series-card-summary">${c.summary}</p>
            <div class="series-card-meta">
              <time>${formatDate(c.startDate)}</time>
              <span>→</span>
              <time>${formatDate(c.endDate)}</time>
            </div>
          </a>
        `).join('')}
      </div>
    </section>` : '';

  const content = `
    <section class="blog-intro">
      <h1 class="blog-intro-title">${SITE.title}</h1>
      <p class="blog-intro-desc">${SITE.description}</p>
    </section>
    ${seriesHtml}
    <section class="post-list">
      <h2 class="section-title">最新文章</h2>
      ${list}
    </section>`;

  return renderLayout({
    title: '首页',
    description: SITE.description,
    content
  });
}

export function renderPostPage(post) {
  const tocHtml = post.toc.length
    ? `<details class="toc" open><summary>目录</summary><ul>${
        post.toc.map(t => `<li class="toc-level-${t.level}"><a href="#${t.id}">${t.text}</a></li>`).join('')
      }</ul></details>`
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

  const content = `
    <article class="post">
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
      ${tocHtml}
      <div class="post-content">
        ${post.html}
      </div>
    </article>
    <a href="/" class="back-home">← 返回首页</a>`;

  return renderLayout({
    title: post.title,
    description: post.summary,
    content
  });
}

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
      <h1 class="section-title">专栏</h1>
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
      <h1 class="section-title">专栏</h1>
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
  const listHtml = col.posts.map((p, i) => `
    <li class="series-article-item ${p.seriesIndex === col.posts[0].seriesIndex && i === 0 ? '' : ''}">
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
    </section>`;

  return renderLayout({
    title: '搜索',
    description: '按关键词、专栏、日期或标签搜索文章',
    content,
    extraBody: '<script src="/assets/js/search.js"></script>'
  });
}

/** RSS feed.xml */
export function renderRss(posts) {
  const items = posts.slice(0, 20).map(p => `
    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${SITE.url}/posts/${p.slug}.html</link>
      <guid isPermaLink="true">${SITE.url}/posts/${p.slug}.html</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <description>${escapeXml(p.summary)}</description>
    </item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(SITE.title)}</title>
    <link>${SITE.url}</link>
    <description>${escapeXml(SITE.description)}</description>
    <language>${SITE.lang}</language>
    ${items}
  </channel>
</rss>`;
}

/** 404 页面 */
export function renderNotFound() {
  const content = `
    <section class="not-found">
      <h1>404</h1>
      <p>页面未找到</p>
      <a href="/" class="back-home">← 返回首页</a>
    </section>`;
  return renderLayout({ title: '404', description: '页面未找到', content });
}
