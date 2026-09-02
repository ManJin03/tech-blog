import { json } from '../../../_lib/respond.js';
import {
  STATE_COOKIE,
  RETURN_COOKIE,
  makeCookie,
  sessionCookie,
  createUserSession,
  exchangeCode,
  fetchGithubProfile,
  getCookie,
  sanitizeReturn
} from '../../../_lib/comment-auth.js';

/**
 * GET /api/auth/github/callback  GitHub OAuth 回调
 * 1. 校验 state（防 CSRF）
 * 2. code 换取 access_token → 拉取 GitHub 用户资料
 * 3. 写 KV 会话 `comment-session:<id>` 并下发 byteforge_github（与管理员会话无关）
 * 4. 302 跳回原文章页
 *
 * 任何失败都会清理临时 Cookie 并静默跳回来源页，不打断阅读。
 */
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method Not Allowed' }, 405);

  const url = new URL(request.url);
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const savedState = getCookie(request, STATE_COOKIE);
  const returnTo = sanitizeReturn(getCookie(request, RETURN_COOKIE));

  // 清除两条临时 Cookie，并追加可选下发 Cookie
  const respondRedirect = (extraCookie) => {
    const headers = new Headers();
    headers.append('Set-Cookie', makeCookie(STATE_COOKIE, '', { maxAge: 0 }));
    headers.append('Set-Cookie', makeCookie(RETURN_COOKIE, '', { maxAge: 0 }));
    if (extraCookie) headers.append('Set-Cookie', extraCookie);
    headers.set('Location', returnTo);
    return new Response(null, { status: 302, headers });
  };

  // 取消授权 / 缺 code / state 不匹配 → 回来源页
  if (!code || !state || !savedState || state !== savedState) return respondRedirect();

  const redirectUri = `${url.origin}/api/auth/github/callback`;
  let accessToken = null;
  let profile = null;
  try {
    accessToken = await exchangeCode(env, code, redirectUri);
    if (accessToken) profile = await fetchGithubProfile(accessToken);
  } catch (err) {
    console.error('[comments] github oauth failed:', err);
  }
  if (!profile) return respondRedirect();

  const session = await createUserSession(env, profile);
  return respondRedirect(sessionCookie(session));
}
