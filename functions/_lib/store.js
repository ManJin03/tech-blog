/**
 * Cloudflare KV 文章存储层
 *
 * 数据模型：
 * - key `article:index`：文章元数据列表（不含正文，按日期倒序），用于首页 / 归档 / 标签 / 专栏 / 搜索 / RSS
 * - key `article:<slug>`：单篇文章完整记录 { slug, title, date, category, tags, summary, series, content, createdAt, updatedAt }
 *
 * KV 绑定变量名：KV
 */
export const INDEX_KEY = 'article:index';

export function articleKey(slug) {
  return `article:${slug}`;
}

/** 读取文章元数据列表（KV 读取带 60s 边缘缓存；同 key 的 put 会使缓存失效） */
export async function readIndex(env) {
  try {
    const value = await env.KV.get(INDEX_KEY, { type: 'json', cacheTtl: 60 });
    return Array.isArray(value) ? value : [];
  } catch (err) {
    console.error('[kv] readIndex failed:', err);
    return [];
  }
}

export async function writeIndex(env, list) {
  await env.KV.put(INDEX_KEY, JSON.stringify(list));
}

/** 从完整文章记录中提取元数据（索引条目） */
export function metaFromArticle(article) {
  return {
    slug: article.slug,
    title: article.title,
    date: article.date,
    category: article.category,
    tags: Array.isArray(article.tags) ? article.tags : [],
    summary: article.summary || '',
    series: article.series || null,
    updatedAt: article.updatedAt || article.date
  };
}

export async function readArticle(env, slug) {
  if (!slug) return null;
  try {
    const value = await env.KV.get(articleKey(slug), { type: 'json', cacheTtl: 60 });
    return value || null;
  } catch (err) {
    console.error(`[kv] readArticle failed: ${slug}`, err);
    return null;
  }
}

/**
 * 新增或更新文章，并同步索引。
 * @param {object} env
 * @param {object} article 完整文章记录
 * @param {string} [prevSlug] 更新时传入原 slug；若与 article.slug 不同则视为 slug 迁移：
 *                            删除旧记录 key，并从索引中移除旧 slug 条目（避免残留幽灵条目导致 404 / slug 冲突）
 */
export async function writeArticle(env, article, prevSlug) {
  if (prevSlug && prevSlug !== article.slug) {
    await env.KV.delete(articleKey(prevSlug));
  }
  await env.KV.put(articleKey(article.slug), JSON.stringify(article));
  const list = await readIndex(env);
  const idx = list.findIndex(item => item.slug === article.slug);
  const meta = metaFromArticle(article);
  if (idx >= 0) list[idx] = meta;
  else list.push(meta);
  if (prevSlug && prevSlug !== article.slug) {
    const oldIdx = list.findIndex(item => item.slug === prevSlug);
    if (oldIdx >= 0) list.splice(oldIdx, 1);
  }
  list.sort((a, b) => new Date(b.date) - new Date(a.date));
  await writeIndex(env, list);
  return meta;
}

/** 删除文章并同步索引 */
export async function removeArticle(env, slug) {
  await env.KV.delete(articleKey(slug));
  const list = await readIndex(env);
  const next = list.filter(item => item.slug !== slug);
  await writeIndex(env, next);
}

/** 读取全部完整文章（用于迁移脚本等场景） */
export async function getAllArticles(env) {
  const list = await readIndex(env);
  const articles = [];
  for (const meta of list) {
    const article = await readArticle(env, meta.slug);
    if (article) articles.push(article);
  }
  return articles;
}
