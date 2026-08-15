import { json } from '../_lib/respond.js';
import { readIndex, writeArticle, metaFromArticle } from '../_lib/store.js';
import { normalizeArticle } from '../_lib/articles.js';

/**
 * GET  /api/articles   文章元数据列表（公开）
 * POST /api/articles   新建文章（需登录）
 */
export async function onRequest(context) {
  const { request, env, data } = context;

  if (request.method === 'GET') {
    const articles = await readIndex(env);
    return json({ articles });
  }

  if (request.method === 'POST') {
    if (!data.authed) return json({ error: '未登录' }, 401);
    const body = await request.json().catch(() => null);
    if (!body) return json({ error: '无效的请求体' }, 400);

    const { article, error } = normalizeArticle(body, null);
    if (error) return json({ error }, 400);

    const index = await readIndex(env);
    if (index.some(item => item.slug === article.slug)) {
      return json({ error: `slug 已存在：${article.slug}，请修改标题或手动指定 slug` }, 409);
    }

    const meta = await writeArticle(env, article);
    return json({ ok: true, article: meta }, 201);
  }

  return json({ error: 'Method Not Allowed' }, 405);
}
