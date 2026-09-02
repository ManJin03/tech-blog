import { getSession } from '../_lib/auth.js';
import { getUser } from '../_lib/comment-auth.js';

/**
 * 为 /api/* 注入两套独立身份，互不干扰：
 * - data.authed：管理员会话（byteforge_session，密码登录）
 * - data.user  ：GitHub 评论用户（byteforge_github，OAuth 登录），未登录为 null
 */
export async function onRequest(context) {
  context.data.authed = await getSession(context.request, context.env);
  context.data.user = await getUser(context.request, context.env);
  return context.next();
}
