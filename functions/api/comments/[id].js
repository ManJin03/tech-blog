import { json } from '../../_lib/respond.js';
import { readComments, removeComment } from '../../_lib/comments.js';

/**
 * DELETE /api/comments/:id?slug=<slug>  删除评论
 *
 * 权限：评论作者本人（data.user.id === 评论.user.id）或管理员（data.authed）。
 * GitHub 用户会话与管理员会话独立判定，互不影响。
 */
export async function onRequest(context) {
  const { request, env, data, params } = context;
  if (request.method !== 'DELETE') return json({ error: 'Method Not Allowed' }, 405);

  const id = params.id || '';
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug') || '';
  if (!id || !slug) return json({ error: '缺少 slug 或 id 参数' }, 400);

  const list = await readComments(env, slug);
  const comment = list.find(c => c.id === id);
  if (!comment) return json({ error: '评论不存在或已删除' }, 404);

  const isOwner = data.user && data.user.id === String(comment.user.id);
  const isAdmin = !!data.authed;
  if (!isOwner && !isAdmin) return json({ error: '无权删除该评论' }, 403);

  await removeComment(env, slug, id);
  return json({ ok: true });
}
