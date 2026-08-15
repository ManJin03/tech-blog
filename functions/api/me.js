import { json } from '../_lib/respond.js';

/** GET /api/me 返回当前会话是否已登录 */
export function onRequest(context) {
  return json({ authed: !!context.data.authed });
}
