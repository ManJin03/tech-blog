import { json } from '../_lib/respond.js';
import { readArticle } from '../_lib/store.js';
import { readComments, addComment, normalizeContent, checkRateLimit } from '../_lib/comments.js';

/**
 * GET  /api/comments?slug=<slug>   文章评论列表（公开，返回 { enabled, comments }）
 * POST /api/comments               发表评论（需 GitHub 登录 data.user）
 *      body: { slug, content }
 *
 * 会话隔离：发表评论只认 byteforge_github（GitHub OAuth，data.user）；
 * 管理员登录（data.authed）不产生评论身份，两者互不替代、可同时存在。
 * 删除走 DELETE /api/comments/:id?slug=（见同目录 [id].js）。
 */
export async function onRequest(context) {
  const { request, env, data } = context;
  const method = request.method;
  const enabled = !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);

  if (method === 'GET') {
    const url = new URL(request.url);
    const slug = url.searchParams.get('slug') || '';
    if (!slug || slug.length > 200) return json({ error: '缺少有效的 slug 参数' }, 400);
    const comments = await readComments(env, slug);
    return json({ enabled, comments });
  }

  if (method === 'POST') {
    if (!enabled) return json({ error: '评论功能未启用（未配置 GitHub OAuth）' }, 503);
    if (!data.user) return json({ error: '请先使用 GitHub 账号登录后再评论' }, 401);

    const body = await request.json().catch(() => null);
    if (!body) return json({ error: '无效的请求体' }, 400);

    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
    if (!slug || slug.length > 200) return json({ error: '缺少有效的 slug 参数' }, 400);

    const article = await readArticle(env, slug);
    if (!article) return json({ error: '文章不存在' }, 404);

    const { content, error } = normalizeContent(body.content);
    if (error) return json({ error }, 400);

    // 同一 GitHub 用户限流，防止刷屏
    if (!(await checkRateLimit(env, data.user.id))) {
      return json({ error: '评论太频繁，请稍后再试' }, 429);
    }

    const comment = await addComment(env, slug, data.user, content);
    return json({ ok: true, comment }, 201);
  }

  return json({ error: 'Method Not Allowed' }, 405);
}
