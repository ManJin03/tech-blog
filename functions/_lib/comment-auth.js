/**
 * 评论用户（GitHub OAuth）认证 —— 与管理员会话完全隔离
 *
 * 会话模型：
 * - 独立 Cookie `byteforge_github`（与管理员 Cookie `byteforge_session` 互不影响）
 * - Cookie 值 = `<sessionId>.<hmac 签名>`（无状态防伪造，签名方式与管理员会话一致）
 * - 用户资料存 KV `comment-session:<sessionId>`，带 30 天 TTL，可主动注销 / 自然过期
 *
 * 环境变量（GitHub OAuth App，评论区必填，未配置时功能自动降级为"未启用"）：
 * - GITHUB_CLIENT_ID
 * - GITHUB_CLIENT_SECRET
 * 签名密钥复用 SESSION_SECRET（缺省回退 ADMIN_PASSWORD）。
 *
 * OAuth 流程：
 *   GET    /api/auth/github?return_to=   发起登录（302 → GitHub，state 存 Cookie 防 CSRF）
 *   GET    /api/auth/github/callback     回调：换 token → 拉取用户 → 建会话 → 302 回原页
 *   DELETE /api/auth/github              退出登录（清 Cookie + 删 KV 会话）
 *
 * 注意：管理员登录 / 登出只操作 byteforge_session；
 *       本模块只操作 byteforge_github，二者互不覆盖、可同时生效。
 */
import { hmacHex, randomId, safeEqual } from './auth.js';

export const COOKIE_NAME = 'byteforge_github';
export const STATE_COOKIE = 'byteforge_gh_state';
export const RETURN_COOKIE = 'byteforge_gh_return';
export const SESSION_TTL = 60 * 60 * 24 * 30; // 30 天（KV 过期 + Cookie Max-Age）
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
export const OAUTH_TTL = 60 * 10; // state / return 临时 Cookie 10 分钟有效

function secretOf(env) {
  return env.SESSION_SECRET || env.ADMIN_PASSWORD || 'byteforge-default-secret';
}

function sessionKey(id) {
  return `comment-session:${id}`;
}

/** 读取请求中的 Cookie 值 */
export function getCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

export function makeCookie(name, value, opts = {}) {
  const { maxAge, path = '/', httpOnly = true } = opts;
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; ${httpOnly ? 'HttpOnly; ' : ''}SameSite=Lax`;
  if (maxAge != null) c += `; Max-Age=${maxAge}`;
  return c;
}

/** 追加多条 Set-Cookie（Set-Cookie 必须各占一个响应头） */
export function appendCookies(headers, cookies) {
  for (const c of cookies) headers.append('Set-Cookie', c);
  return headers;
}

export function clearUserSessionCookie() {
  return makeCookie(COOKIE_NAME, '', { maxAge: 0 });
}

export function sessionCookie(token) {
  return makeCookie(COOKIE_NAME, token, { maxAge: SESSION_MAX_AGE });
}

/**
 * 创建 GitHub 评论用户会话：写 KV + 返回签名 token
 * @param {object} env
 * @param {object} profile 归一化 GitHub 用户资料 { id, login, name, avatar, url }
 */
export async function createUserSession(env, profile) {
  const id = randomId();
  const sig = await hmacHex(id, secretOf(env));
  await env.KV.put(sessionKey(id), JSON.stringify(profile), { expirationTtl: SESSION_TTL });
  return `${id}.${sig}`;
}

/** 主动注销：删除 KV 会话记录（Cookie 清理由调用方负责） */
export async function destroyUserSession(env, token) {
  if (!token || typeof token !== 'string') return;
  const dot = token.indexOf('.');
  if (dot <= 0) return;
  await env.KV.delete(sessionKey(token.slice(0, dot)));
}

/**
 * 校验请求中的评论用户 Cookie，返回用户资料 { id, login, name, avatar, url }；
 * 无效 / 未登录返回 null。仅当存在 byteforge_github Cookie 时才访问 KV。
 */
export async function getUser(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacHex(id, secretOf(env));
  if (!safeEqual(sig, expected)) return null;
  try {
    const profile = await env.KV.get(sessionKey(id), { type: 'json' });
    return profile || null;
  } catch (err) {
    console.error('[comment-auth] read session failed:', err);
    return null;
  }
}

/** 校验 return 仅允许站内路径（防开放重定向） */
export function sanitizeReturn(raw) {
  const s = String(raw || '').trim();
  if (s.startsWith('/') && !s.startsWith('//') && !s.includes('\\') && s.length <= 500) return s;
  return '/';
}

/** GitHub 授权页地址 */
export function oauthAuthorizeUrl(env, redirectUri, state) {
  const p = new URL('https://github.com/login/oauth/authorize');
  p.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  p.searchParams.set('redirect_uri', redirectUri);
  p.searchParams.set('scope', 'read:user');
  p.searchParams.set('state', state);
  return p.toString();
}

/** 用授权码换取 access_token，失败返回 null */
export async function exchangeCode(env, code, redirectUri) {
  try {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'tech-blog-comments'
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri
      })
    });
    const data = await res.json().catch(() => ({}));
    return data.access_token || null;
  } catch (err) {
    console.error('[comment-auth] exchange code failed:', err);
    return null;
  }
}

/** 拉取 GitHub 用户资料并归一化，失败返回 null */
export async function fetchGithubProfile(token) {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'tech-blog-comments'
      }
    });
    if (!res.ok) return null;
    const u = await res.json();
    if (!u || !u.id || !u.login) return null;
    return {
      id: String(u.id),
      login: String(u.login),
      name: (u.name && String(u.name).trim()) || String(u.login),
      avatar: u.avatar_url ? `${u.avatar_url}&s=96` : '',
      url: (u.html_url && String(u.html_url)) || `https://github.com/${u.login}`
    };
  } catch (err) {
    console.error('[comment-auth] fetch profile failed:', err);
    return null;
  }
}
