import { json, notFound } from '../../_lib/respond.js';
import { readIndex, readArticle, writeArticle, removeArticle, articleKey } from '../../_lib/store.js';
import { normalizeArticle } from '../../_lib/articles.js';
import { hydratePost } from '../../_lib/render.js';

/**
 * GET    /api/articles/:slug   文章详情（公开，含渲染后的 html/toc）
 * PATCH  /api/articles/:slug   更新文章（需登录）
 * DELETE /api/articles/:slug   删除文章（需登录）
 */
export async function onRequest(context) {
  const { request, env, data, params } = context;
  const slug = decodeURIComponent(params.slug || '');
  const method = request.method;

  if (method === 'GET') {
    const article = await readArticle(env, slug);
    if (!article) return notFound('文章不存在');
    return json({ article: hydratePost(article) });
  }

  if (!data.authed) return json({ error: '未登录' }, 401);

  if (method === 'PATCH') {
    const existing = await readArticle(env, slug);
    if (!existing) return notFound('文章不存在');

    const body = await request.json().catch(() => null);
    if (!body) return json({ error: '无效的请求体' }, 400);

    const { article, error } = normalizeArticle(body, existing);
    if (error) return json({ error }, 400);

    if (article.slug !== slug) {
      const index = await readIndex(env);
      if (index.some(item => item.slug === article.slug)) {
        return json({ error: `slug 已存在：${article.slug}` }, 409);
      }
      await env.KV.delete(articleKey(slug)); // 旧 key 迁移到新 slug
    }

    const meta = await writeArticle(env, article);
    return json({ ok: true, article: meta });
  }

  if (method === 'DELETE') {
    await removeArticle(env, slug);
    return json({ ok: true });
  }

  return json({ error: 'Method Not Allowed' }, 405);
}
