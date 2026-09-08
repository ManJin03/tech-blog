/**
 * 本地构建脚本（静态站点生成器）
 *
 * - 读取 src/posts/*.md（带 frontmatter）生成文章页
 * - 生成首页、归档、标签页、专栏页、RSS、关于页
 * - 拷贝静态资源到 dist/
 *
 * 说明：页面渲染逻辑已抽取到 functions/_lib/render.js（共享渲染模块），
 * 线上站点由 Cloudflare Pages Functions 从 KV 动态渲染，不依赖本地文件；
 * 本地构建仅用于预览（文章一律通过云端管理面板增删改）。
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
import { join, extname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname as pathDirname } from 'node:path';

import matter from 'gray-matter';

import {
  renderMarkdown,
  extractTocFromHtml,
  toISODate,
  parseSeries,
  collectSeries,
  renderLayout,
  renderHome,
  renderPostPage,
  renderArchive,
  renderTags,
  renderColumnsList,
  renderColumnPage,
  renderSearchPage,
  renderSearchIndex,
  renderRss,
  renderNotFound
} from './functions/_lib/render.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = pathDirname(__filename);

const ROOT = __dirname;
const SRC = join(ROOT, 'src');
const POSTS_DIR = join(SRC, 'posts');
const PAGES_DIR = join(SRC, 'pages');
const TEMPLATES_DIR = join(SRC, 'templates');
const ASSETS_DIR = join(SRC, 'assets');
const OUT = join(ROOT, 'dist');

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function readMd(file) {
  const raw = readFileSync(file, 'utf8');
  const { data, content } = matter(raw);
  return { data, content };
}

/** 收集文章（本地构建使用） */
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
    const html = renderMarkdown(content);
    const toc = extractTocFromHtml(html);
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

function buildPages(pages) {
  for (const page of pages) {
    const content = `<article class="page">${page.html}</article>`;
    const html = renderLayout({ title: page.title, description: page.title, content });
    writeFileSync(join(OUT, `${page.slug}.html`), html);
  }
}

function build() {
  const start = Date.now();
  console.log('▶ 开始构建...');

  ensureDir(OUT);
  const posts = collectPosts();
  // 收集专栏：分组、排序、回填 seriesIndex / seriesPrev / seriesNext / seriesCount
  const series = collectSeries(posts);
  for (const col of series) {
    for (const p of col.posts) p.seriesCount = col.count;
  }

  const pages = collectPages();

  writeFileSync(join(OUT, 'index.html'), renderHome(posts, series));          // 首页（含专栏速览区）
  ensureDir(join(OUT, 'posts'));
  for (const post of posts) writeFileSync(join(OUT, 'posts', `${post.slug}.html`), renderPostPage(post)); // 文章页（含下载按钮、专栏信息块）
  writeFileSync(join(OUT, 'columns.html'), renderColumnsList(series));        // 专栏列表页 columns.html
  ensureDir(join(OUT, 'columns'));
  for (const col of series) writeFileSync(join(OUT, 'columns', `${col.slug}.html`), renderColumnPage(col)); // 各专栏详情页
  writeFileSync(join(OUT, 'archive.html'), renderArchive(posts));
  writeFileSync(join(OUT, 'tags.html'), renderTags(posts));
  writeFileSync(join(OUT, 'search.json'), JSON.stringify(renderSearchIndex(posts), null, 2));
  writeFileSync(join(OUT, 'search.html'), renderSearchPage(posts, series));
  buildPages(pages);
  writeFileSync(join(OUT, 'feed.xml'), renderRss(posts));
  writeFileSync(join(OUT, '404.html'), renderNotFound());
  copyAssets();

  console.log(`✓ 构建完成：${posts.length} 篇文章 / ${series.length} 个专栏 / ${pages.length} 个页面，耗时 ${Date.now() - start}ms`);
  console.log(`  输出目录：${relative(ROOT, OUT)}`);
}

const isWatch = process.argv.includes('--watch');

build();

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
