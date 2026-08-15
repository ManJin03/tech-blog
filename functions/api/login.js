import { json } from '../_lib/respond.js';
import { createSession, sessionCookie, clearSessionCookie, safeEqual } from '../_lib/auth.js';

/**
 * POST   /api/login         登录（body: { password }）
 * DELETE /api/login         退出登录
 */
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'POST') {
    if (!env.ADMIN_PASSWORD) {
      return json({ error: '服务端未配置 ADMIN_PASSWORD，无法登录' }, 500);
    }
    const body = await request.json().catch(() => ({}));
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password) return json({ error: '请输入密码' }, 400);
    if (!(await safeEqual(password, env.ADMIN_PASSWORD))) {
      return json({ error: '密码错误' }, 401);
    }
    const token = await createSession(env);
    return json({ ok: true }, { status: 200, headers: { 'Set-Cookie': sessionCookie(token) } });
  }

  if (request.method === 'DELETE') {
    return json({ ok: true }, { status: 200, headers: { 'Set-Cookie': clearSessionCookie() } });
  }

  return json({ error: 'Method Not Allowed' }, 405);
}
