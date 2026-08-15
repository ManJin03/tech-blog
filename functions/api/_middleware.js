import { getSession } from '../_lib/auth.js';

/** 注入 data.authed，供受保护接口判断是否已登录 */
export async function onRequest(context) {
  context.data.authed = await getSession(context.request, context.env);
  return context.next();
}
