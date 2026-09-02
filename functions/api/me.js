import { json } from '../_lib/respond.js';

/**
 * GET /api/me 返回当前会话身份：
 * - authed：是否为管理员（管理员登录面板使用）
 * - user  ：GitHub 评论用户资料 { id, login, name, avatar, url }，未登录为 null（评论区使用）
 *
 * 两套会话彼此独立：管理员登录不会"变成"评论用户，GitHub 登录也不会获得管理员权限。
 */
export function onRequest(context) {
  return json({ authed: !!context.data.authed, user: context.data.user || null });
}
