/**
 * 静态站点生成器
 * - 读取 src/posts/*.md (带 frontmatter) 生成文章页
 * - 生成首页、归档、标签页、RSS、关于页
 * - 拷贝静态资源到 dist/
 *
 * 拓展点：
 *   1. 在 src/posts/ 下新增 .md 即可发布新文章
 *   2. 在 src/pages/ 下新增 .md 可生成自定义页面
 *   3. 在 templates/ 中修改模板改变渲染
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
  author: 'Your Name',
  lang: 'zh-CN',
  nav: [
    { label: '首页', href: '/' },
    { label: '归档', href: '/archive.html' },
    { label: '标签', href: '/tags.html' },
    { label: '关于', href: '/about.html' }
  ],
  social: [
    { label: 'GitHub', href: 'https://github.com/' },
    { label: 'RSS', href: '/feed.xml' }
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

/** 收集文章 */
function collectPosts() {
  if (!existsSync(POSTS_DIR)) return [];
  const files = readdirSync(POSTS_DIR).filter(f => extname(f) === '.md');
  const posts = files.map(file => {
    const full = join(POSTS_DIR, file);
    const { data, content } = readMd(full);
    const slug = basename(file, '.md');
    const date = data.date || new Date().toISOString().slice(0, 10);
    const title = data.title || slug;
    const tags = Array.isArray(data.tags) ? data.tags : [];
    const category = data.category || '未分类';
    const summary = data.summary || content.replace(/[#`>*\-\[\]\(\)]/g, '').slice(0, 120) + '…';
    const toc = buildToc(content);
    const html = renderMarkdown(content);
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
      content
    };
  });
  return posts
    .filter(p => !p.draft)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
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
  <script>
    (function(){try{var t=localStorage.getItem('byteforge-theme');if(t){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();
  </script>
  ${extraHead}
</head>
<body>
  <header class="site-header">
    <div class="container header-inner">
      <a href="/" class="site-title">${SITE.title}</a>
      <nav class="site-nav">${navHtml}</nav>
      <button class="theme-toggle" id="theme-toggle" aria-label="切换主题" title="切换主题">
        <span class="theme-icon-light">🌙</span>
        <span class="theme-icon-dark">☀️</span>
      </button>
    </div>
  </header>
  <main class="container site-main">
${content}
  </main>
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

async function buildHome(posts) {
  const list = posts.slice(0, 10).map(p => `
    <article class="post-card">
      <h2 class="post-card-title"><a href="/posts/${p.slug}.html">${p.title}</a></h2>
      <div class="post-meta">
        <time datetime="${p.date}">${formatDate(p.date)}</time>
        <span class="post-category">${p.category}</span>
      </div>
      <p class="post-summary">${p.summary}</p>
      <div class="post-tags">
        ${p.tags.map(t => `<a href="/tags.html#${slugify(t)}" class="tag">#${t}</a>`).join('')}
      </div>
    </article>`).join('\n');

  const content = `
    <section class="hero">
      <h1 class="hero-title">${SITE.title}</h1>
      <p class="hero-desc">${SITE.description}</p>
    </section>
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
  const content = `
    <article class="post">
      <header class="post-header">
        <h1 class="post-title">${post.title}</h1>
        <div class="post-meta">
          <time datetime="${post.date}">${formatDate(post.date)}</time>
          <span class="post-category">${post.category}</span>
          <span class="post-reading">${estimateReadingTime(post.content)} 分钟阅读</span>
        </div>
        <div class="post-tags">
          ${post.tags.map(t => `<a href="/tags.html#${slugify(t)}" class="tag">#${t}</a>`).join('')}
        </div>
      </header>
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

async function build() {
  const start = Date.now();
  console.log('▶ 开始构建...');

  ensureDir(OUT);
  const posts = collectPosts();
  const pages = collectPages();

  await buildHome(posts);
  for (const post of posts) await buildPostPage(post);
  await buildArchive(posts);
  await buildTags(posts);
  await buildPages(pages);
  buildRss(posts);
  build404();
  copyAssets();

  console.log(`✓ 构建完成：${posts.length} 篇文章 / ${pages.length} 个页面，耗时 ${Date.now() - start}ms`);
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
