/**
 * KV 迁移脚本：把 src/posts/*.md 中的文章写入 kv-seed.json
 *
 * 用法：
 *   1. node scripts/seed-kv.js
 *   2. npx wrangler kv bulk put --binding=KV kv-seed.json
 *
 * 写入的数据模型与 functions/_lib/store.js 保持一致：
 *   - article:index     文章元数据列表（不含正文，按日期倒序）
 *   - article:<slug>    单篇文章完整记录（含 markdown 正文）
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname as pathDirname } from 'node:path';
import matter from 'gray-matter';

import { toISODate, parseSeries } from '../functions/_lib/render.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = pathDirname(__filename);

const ROOT = join(__dirname, '..');
const POSTS_DIR = join(ROOT, 'src', 'posts');
const SEED_FILE = join(ROOT, 'kv-seed.json');

const INDEX_KEY = 'article:index';

function buildArticle(file) {
  const raw = readFileSync(file, 'utf8');
  const { data, content } = matter(raw);
  const slug = basename(file, '.md');
  const date = toISODate(data.date || new Date());
  const title = data.title || slug;
  const tags = Array.isArray(data.tags) ? data.tags : [];
  const category = data.category || '未分类';
  const summary = data.summary
    || content.replace(/[#`>*\-\[\]\(\)]/g, '').trim().slice(0, 120)
    + (content.replace(/[#`>*\-\[\]\(\)]/g, '').trim().length > 120 ? '…' : '');
  const series = parseSeries(data.series);
  const now = new Date().toISOString();
  return {
    slug,
    title,
    date,
    category,
    tags,
    summary,
    series,
    content,
    draft: !!data.draft,
    createdAt: now,
    updatedAt: now
  };
}

function main() {
  if (!existsSync(POSTS_DIR)) {
    console.error('✗ 未找到 src/posts 目录');
    process.exit(1);
  }

  const files = readdirSync(POSTS_DIR).filter(f => extname(f) === '.md');
  const articles = files.map(f => buildArticle(join(POSTS_DIR, f)));
  const published = articles.filter(a => !a.draft);

  const index = published
    .map(({ slug, title, date, category, tags, summary, series }) => ({
      slug, title, date, category, tags, summary, series
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const entries = [
    { key: INDEX_KEY, value: JSON.stringify(index) }
  ];
  for (const article of published) {
    const record = { ...article };
    delete record.draft;
    entries.push({ key: `article:${article.slug}`, value: JSON.stringify(record) });
  }

  writeFileSync(SEED_FILE, JSON.stringify(entries, null, 2), 'utf8');

  console.log(`✓ 已生成 ${SEED_FILE}`);
  console.log(`  - ${published.length} 篇文章（草稿 ${articles.length - published.length} 篇已跳过）`);
  console.log('');
  console.log('下一步：将数据写入 Cloudflare KV（需先在 wrangler.toml 中配置 KV 绑定 id）');
  console.log('  npx wrangler kv bulk put --binding=KV kv-seed.json');
}

main();
