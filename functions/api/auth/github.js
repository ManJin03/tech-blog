import { json } from '../../_lib/respond.js';
import { randomId } from '../../_lib/auth.js';
import {
  COOKIE_NAME,
  STATE_COOKIE,
  RETURN_COOKIE,
  OAUTH_TTL,
  oauthAuthorizeUrl,
  clearUserSessionCookie,
  appendCookies,
  makeCookie,
  destroyUserSession,
  getCookie,
  sanitizeReturn
} from '../../_lib/comment-auth.js';

/**
 * GET    /api/auth/github?return_to=<站内路径>   发起 GitHub 登录（302 → GitHub 授权页）
 * DELETE /api/auth/github                        退出评论登录（fetch 调用）
 *
 * state 与 return_to 以 HttpOnly 临时 Cookie 暂存（10 分钟），
 * 回调时校验 state 防 CSRF，成功后跳回 return_to 所在文章页。
 * 本路由只操作 byteforge_github 相关会话，不影响管理员登录态。
 */
export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  if (method === 'GET') {
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      return json({ error: '评论功能未启用：请配置 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET' }, 500);
    }
    const url = new URL(request.url);
    const returnTo = sanitizeReturn(url.searchParams.get('return_to'));
    const state = randomId();
    const redirectUri = `${url.origin}/api/auth/github/callback`;
    const headers = appendCookies(new Headers(), [
      makeCookie(STATE_COOKIE, state, { maxAge: OAUTH_TTL }),
      makeCookie(RETURN_COOKIE, returnTo, { maxAge: OAUTH_TTL })
    ]);
    headers.set('Location', oauthAuthorizeUrl(env, redirectUri, state));
    return new Response(null, { status: 302, headers });
  }

  if (method === 'DELETE') {
    const token = getCookie(request, COOKIE_NAME);
    await destroyUserSession(env, token);
    const headers = appendCookies(new Headers(), [clearUserSessionCookie()]);
    return json({ ok: true }, { status: 200, headers });
  }

  return json({ error: 'Method Not Allowed' }, 405);
}
