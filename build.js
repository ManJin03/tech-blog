/**
 * 静态站点生成器
 * - 读取 src/posts/*.md (带 frontmatter) 生成文章页
 * - 生成首页、归档、标签页、专栏页、RSS、关于页
 * - 拷贝静态资源到 dist/
 *
 * 拓展点：
 *   1. 在 src/posts/ 下新增 .md 即可发布新文章
 *   2. 在 src/pages/ 下新增 .md 可生成自定义页面
 *   3. 在 templates/ 中修改模板改变渲染
 *
 * 专栏（series）说明：
 *   专栏通过文章 frontmatter 中的 series 字段隐式定义，无需单独配置文件。
 *   同名 series 的文章自动归为同一专栏，构建时生成专栏列表页和详情页。
 *
 *   series 支持两种写法：
 *     1) series: 现代C++深度指南           — 仅指定专栏名，组内按 date 升序排列
 *     2) series:                           — 对象写法，可手动控制顺序
 *        name: 现代C++深度指南
 *        order: 2                           — order 越小越靠前；未设 order 者按 date 排在后
 *
 *   专栏相关生成物：
 *     - columns.html          专栏列表页（所有专栏卡片）
 *     - columns/<slug>.html   单个专栏详情页（专栏内文章有序列表）
 *     - 文章页内的 .series-box 专栏信息块（专栏名 + 第 X/N 篇 + 上下篇导航）
 *     - 首页专栏速览区、归档/标签页专栏小标签、搜索页专栏下拉筛选
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, existsSync, statSync, watch } from 'node:fs';
import { join, extname, basename, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname as pathDirname } from 'node:path';

import matter from 'gray-matter';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = pathDirname(__filename);

const ROOT = __dirname;
const SRC = join(ROOT, 'src');
const POSTS_DIR = join(SRC, 'posts');
const PAGES_DIR = join(SRC, 'pages');
const TEMPLATES_DIR = join(SRC, 'templates');
const ASSETS_DIR = join(SRC, 'assets');
const OUT = join(ROOT, 'dist');

// 站点配置（可拓展为读取 site.config.json）
const SITE = {
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
  // 个人资料卡内的社交按钮（GitHub 风格图标）
  socialButtons: [
    { name: 'GitHub', url: 'https://github.com/ManJin03', icon: 'https://cdn.simpleicons.org/github/181717' },
    { name: '总站', url: 'https://manjin.pages.dev/', icon: 'https://cdn.simpleicons.org/globe/0969da' }
  ],
  // 友情链接（个人资料卡底部）
  friendLinks: [
    { name: 'Young man の 小破站', url: 'https://homepage-afl.pages.dev/' }
  ]
};

// 配置 marked：代码高亮 + 标题编号（用于生成目录）
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

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function readMd(file) {
  const raw = readFileSync(file, 'utf8');
  const { data, content } = matter(raw);
  return { data, content };
}

function renderMarkdown(md) {
  return marked.parse(md);
}

/** 从 markdown 正文提取一级标题作为 TOC */
function buildToc(md) {
  const lines = md.split('\n');
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

function slugify(s) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
}

function formatDate(d) {
  const date = new Date(d);
  if (isNaN(date)) return d;
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** 把 frontmatter 的 date（可能是 Date 对象或字符串）标准化为 YYYY-MM-DD */
function toISODate(d) {
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
 * 解析 frontmatter 中的 series 字段，返回标准化的专栏信息对象。
 *
 * 支持两种写法：
 *   1) series: "专栏名"                          → order 为 null，由 collectSeries 按 date 排序
 *   2) series: { name: "专栏名", order: 2 }       → order 为数字，越小越靠前
 *
 * @param {*} raw - gray-matter 解析出的 series 值（string | object | undefined）
 * @returns {{ name: string, slug: string, order: number|null } | null}
 *          slug 由 name 经 slugify 生成，用作专栏 URL 和分组键
 */
function parseSeries(raw) {
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

/** 收集文章 */
function collectPosts() {
  if (!existsSync(POSTS_DIR)) return [];
  const files = readdirSync(POSTS_DIR).filter(f => extname(f) === '.md');
  const posts = files.map(file => {
    const full = join(POSTS_DIR, file);
    const { data, content } = readMd(full);
    const slug = basename(file, '.md');
    const date = toISODate(data.date || new Date());
    const title = data.title || slug;
    const tags = Array.isArray(data.tags) ? data.tags : [];
    const category = data.category || '未分类';
    const summary = data.summary || content.replace(/[#`>*\-\[\]\(\)]/g, '').slice(0, 120) + '…';
    const toc = buildToc(content);
    const html = renderMarkdown(content);
    // 解析专栏字段：无 series 则为 null，不归属任何专栏
    const series = parseSeries(data.series);
    return {
      slug,
      title,
      date,
      tags,
      category,
      summary,
      draft: !!data.draft,
      html,
      toc,
      content,
      series
    };
  });
  return posts
    .filter(p => !p.draft)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

/**
 * 把文章按专栏（series slug）分组，组内排序，并回填导航信息。
 *
 * 组内排序规则：
 *   1. order 不为 null 的文章按 order 升序排在前面
 *   2. order 为 null 的文章按 date 升序排在后面
 *
 * 回填到每篇文章的额外字段：
 *   - seriesIndex: 在专栏中的序号（1-based）
 *   - seriesPrev:  专栏内上一篇文章（无则 null）
 *   - seriesNext:  专栏内下一篇文章（无则 null）
 *
 * 专栏级字段：
 *   - count:     文章总数
 *   - startDate: 专栏起始日期（首篇文章日期）
 *   - endDate:   专栏结束日期（末篇文章日期）
 *   - summary:   专栏简介（取首篇文章的 summary）
 *
 * 返回的专栏数组按 endDate 倒序排列（最近更新的专栏在前）。
 *
 * @param {Array} posts - collectPosts() 返回的文章列表
 * @returns {Array} 专栏对象数组
 */
function collectSeries(posts) {
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
  // 组内排序 + 回填 seriesIndex / prev / next
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
    // 专栏简介：取专栏中第一篇的 summary 作为默认
    col.summary = col.posts[0].summary;
  }
  // 按最近更新时间（专栏内最后一篇文章日期）倒序展示
  return [...map.values()].sort((a, b) => new Date(b.endDate) - new Date(a.endDate));
}

/** 收集自定义页面 */
function collectPages() {
  if (!existsSync(PAGES_DIR)) return [];
  return readdirSync(PAGES_DIR)
    .filter(f => extname(f) === '.md')
    .map(file => {
      const full = join(PAGES_DIR, file);
      const { data, content } = readMd(full);
      const slug = basename(file, '.md');
      return {
        slug,
        title: data.title || slug,
        html: renderMarkdown(content)
      };
    });
}

function renderLayout(opts) {
  const { title, description, content, extraHead = '', extraBody = '' } = opts;
  const navHtml = SITE.nav.map(n =>
    `<a href="${n.href}" class="nav-link">${n.label}</a>`
  ).join('\n');
  const socialHtml = SITE.social.map(s =>
    `<a href="${s.href}" class="social-link" target="_blank" rel="noopener">${s.label}</a>`
  ).join('\n');

  // 左侧个人资料卡片（GitHub 风格）：含 ManJin 按钮、社交按钮、我的站点、友情链接
  const socialButtons = SITE.socialButtons.map(btn => `
        <a class="profile-social-btn" href="${btn.url}" target="_blank" rel="noopener" title="${btn.name}">
          <img src="${btn.icon}" alt="${btn.name}" loading="lazy">
          <span>${btn.name}</span>
        </a>`).join('');

  const friendLinks = SITE.friendLinks.map(link => `
          <a class="profile-friend-link" href="${link.url}" target="_blank" rel="noopener">${link.name}</a>`).join('');

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
      <p class="copyright">© ${new Date().getFullYear()} ${SITE.author} · 由自建静态生成器驱动</p>
    </div>
  </footer>
  <script src="/assets/js/main.js"></script>
  ${extraBody}
</body>
</html>`;
}

async function buildHome(posts, series) {
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

  // 专栏速览区：首页展示最多 6 个专栏卡片，点击跳转专栏详情页
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

  const html = renderLayout({
    title: '首页',
    description: SITE.description,
    content
  });
  writeFileSync(join(OUT, 'index.html'), html);
}

async function buildPostPage(post) {
  const dir = join(OUT, 'posts');
  ensureDir(dir);
  const tocHtml = post.toc.length
    ? `<details class="toc" open><summary>目录</summary><ul>${
        post.toc.map(t => `<li class="toc-level-${t.level}"><a href="#${t.id}">${t.text}</a></li>`).join('')
      }</ul></details>`
    : '';

  // 专栏信息块：当文章属于某个专栏时，渲染专栏名、序号及上下篇导航
  // seriesIndex / seriesPrev / seriesNext / seriesCount 均由 collectSeries() 回填
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

  const content = `
    <article class="post">
      <header class="post-header">
        <h1 class="post-title">${post.title}</h1>
        <div class="post-meta">
          <time datetime="${post.date}">${formatDate(post.date)}</time>
          <span class="post-category">${post.category}</span>
          ${post.series ? `<a class="post-series" href="/columns/${post.series.slug}.html">📚 ${post.series.name}</a>` : ''}
          <span class="post-reading">${estimateReadingTime(post.content)} 分钟阅读</span>
        </div>
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

  const html = renderLayout({
    title: post.title,
    description: post.summary,
    content
  });
  writeFileSync(join(dir, `${post.slug}.html`), html);
}

function estimateReadingTime(text) {
  const chars = text.replace(/\s+/g, '').length;
  return Math.max(1, Math.round(chars / 500));
}

async function buildArchive(posts) {
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
  writeFileSync(join(OUT, 'archive.html'), renderLayout({ title: '归档', description: '全部文章归档', content }));
}

async function buildTags(posts) {
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
  writeFileSync(join(OUT, 'tags.html'), renderLayout({ title: '标签', description: '按标签浏览文章', content }));
}

function tagSizeClass(n) {
  if (n >= 5) return 'xl';
  if (n >= 3) return 'lg';
  if (n >= 2) return 'md';
  return 'sm';
}

/* ============================================
   专栏页
   - buildColumnsList:  生成专栏列表页 columns.html
   - buildColumnPage:   生成单个专栏详情页 columns/<slug>.html
   ============================================ */

/**
 * 专栏列表页 columns.html
 * 展示所有专栏卡片：专栏名、篇数、摘要、前 5 篇文章预览、起讫日期。
 * 无专栏时显示提示信息。
 */
async function buildColumnsList(series) {
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
  writeFileSync(join(OUT, 'columns.html'), renderLayout({
    title: '专栏',
    description: '按主题聚合的系列文章',
    content
  }));
}

/**
 * 单个专栏详情页 columns/<slug>.html
 * 展示专栏标题、篇数、起讫日期、简介，以及专栏内全部文章的有序列表。
 * 文章按 collectSeries 排序后的顺序展示，每篇带序号徽章、日期、标题、摘要和标签。
 */
async function buildColumnPage(col) {
  const dir = join(OUT, 'columns');
  ensureDir(dir);

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

  writeFileSync(join(dir, `${col.slug}.html`), renderLayout({
    title: col.name,
    description: `${col.name} · 共 ${col.count} 篇文章`,
    content
  }));
}

async function buildPages(pages) {
  for (const page of pages) {
    const content = `<article class="page">${page.html}</article>`;
    const html = renderLayout({ title: page.title, description: page.title, content });
    writeFileSync(join(OUT, `${page.slug}.html`), html);
  }
}

function buildRss(posts) {
  const items = posts.slice(0, 20).map(p => `
    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${SITE.url}/posts/${p.slug}.html</link>
      <guid isPermaLink="true">${SITE.url}/posts/${p.slug}.html</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <description>${escapeXml(p.summary)}</description>
    </item>`).join('');
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(SITE.title)}</title>
    <link>${SITE.url}</link>
    <description>${escapeXml(SITE.description)}</description>
    <language>${SITE.lang}</language>
    ${items}
  </channel>
</rss>`;
  writeFileSync(join(OUT, 'feed.xml'), rss);
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
  }[c]));
}

function copyAssets() {
  if (!existsSync(ASSETS_DIR)) return;
  const target = join(OUT, 'assets');
  ensureDir(target);
  copyDir(ASSETS_DIR, target);
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dest, entry);
    if (statSync(s).isDirectory()) {
      copyDir(s, d);
    } else {
      copyFileSync(s, d);
    }
  }
}

function build404() {
  const content = `
    <section class="not-found">
      <h1>404</h1>
      <p>页面未找到</p>
      <a href="/" class="back-home">← 返回首页</a>
    </section>`;
  writeFileSync(join(OUT, '404.html'), renderLayout({ title: '404', description: '页面未找到', content }));
}

/**
 * 构建搜索索引 search.json：供客户端 /search.html 异步加载并筛选
 * 字段精简，仅保留筛选与展示所需。
 * series 字段含 { slug, name }，供搜索页专栏下拉筛选和结果展示使用。
 */
function buildSearchIndex(posts) {
  const index = posts.map(p => ({
    slug: p.slug,
    title: p.title,
    date: p.date,                // YYYY-MM-DD
    year: String(p.date).slice(0, 4),
    month: String(p.date).slice(0, 7),  // YYYY-MM
    category: p.category,
    tags: p.tags,
    series: p.series ? { slug: p.series.slug, name: p.series.name } : null,
    summary: p.summary,
    url: `/posts/${p.slug}.html`
  }));
  writeFileSync(join(OUT, 'search.json'), JSON.stringify(index, null, 2));
}

/**
 * 构建搜索页：
 * - 关键词输入（匹配标题 + 摘要 + 标签 + 专栏）
 * - 日期维度（年份下拉 + 月份下拉，二者联动）
 * - 专栏下拉筛选
 * - 标签多选（标签云 checkbox）
 * 筛选逻辑由 /assets/js/search.js 在客户端完成
 */
function buildSearchPage(posts, series) {
  // 收集年份/标签；月份按年份分组，挂到 option 的 data-months 上供 JS 联动
  const yearMonths = new Map();  // year -> Set(YYYY-MM)
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

  const html = renderLayout({
    title: '搜索',
    description: '按关键词、专栏、日期或标签搜索文章',
    content,
    extraBody: '<script src="/assets/js/search.js"></script>'
  });
  writeFileSync(join(OUT, 'search.html'), html);
}

async function build() {
  const start = Date.now();
  console.log('▶ 开始构建...');

  ensureDir(OUT);
  const posts = collectPosts();
  // 收集专栏：分组、排序、回填 seriesIndex / seriesPrev / seriesNext
  const series = collectSeries(posts);

  // 回填每篇文章的 seriesCount（专栏总篇数），供文章页专栏信息块使用
  for (const col of series) {
    for (const p of col.posts) p.seriesCount = col.count;
  }

  const pages = collectPages();

  await buildHome(posts, series);                          // 首页（含专栏速览区）
  for (const post of posts) await buildPostPage(post);     // 文章页（含专栏信息块）
  await buildColumnsList(series);                           // 专栏列表页 columns.html
  for (const col of series) await buildColumnPage(col);    // 各专栏详情页 columns/<slug>.html
  await buildArchive(posts);
  await buildTags(posts);
  buildSearchIndex(posts);
  buildSearchPage(posts, series);
  await buildPages(pages);
  buildRss(posts);
  build404();
  copyAssets();

  console.log(`✓ 构建完成：${posts.length} 篇文章 / ${series.length} 个专栏 / ${pages.length} 个页面，耗时 ${Date.now() - start}ms`);
  console.log(`  输出目录：${relative(ROOT, OUT)}`);
}

const isWatch = process.argv.includes('--watch');

await build();

if (isWatch) {
  console.log('👁 监听文件变化中... (Ctrl+C 退出)');
  let timer;
  const debounce = () => {
    clearTimeout(timer);
    timer = setTimeout(build, 200);
  };
  [POSTS_DIR, PAGES_DIR, ASSETS_DIR, TEMPLATES_DIR].forEach(dir => {
    if (existsSync(dir)) {
      watch(dir, { recursive: true }, debounce);
    }
  });
}
