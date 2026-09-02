/**
 * 管理员会话认证（无状态，基于 HMAC 签名 Cookie）
 *
 * 环境变量：
 * - ADMIN_PASSWORD：登录密码（必填）
 * - SESSION_SECRET：签名密钥（可选，缺省时回退用 ADMIN_PASSWORD）
 *
 * 流程：
 * - POST /api/login   校验密码 → 下发 HttpOnly Cookie
 * - GET  /api/me      返回 { authed }
 * - DELETE /api/login 清除 Cookie
 * - /api/* 中间件注入 data.authed 供受保护接口使用
 */
export const COOKIE_NAME = 'byteforge_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 天

const enc = new TextEncoder();

export async function hmacHex(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 常数时间比较，防止时序侧信道 */
function safeEqual(a, b) {
  const ba = new TextEncoder().encode(String(a));
  const bb = new TextEncoder().encode(String(b));
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

function secretOf(env) {
  return env.SESSION_SECRET || env.ADMIN_PASSWORD || 'byteforge-default-secret';
}

export async function createSession(env) {
  const id = randomId();
  const secret = secretOf(env);
  const sig = await hmacHex(id, secret);
  return `${id}.${sig}`;
}

export async function verifySession(token, env) {
  if (!token || typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const id = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacHex(id, secretOf(env));
  return safeEqual(sig, expected);
}

/** 从请求 Cookie 中解析会话 token */
export function getSessionToken(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    if (name === COOKIE_NAME) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/** 校验请求会话，返回是否已登录 */
export async function getSession(request, env) {
  const token = getSessionToken(request);
  if (!token) return false;
  return verifySession(token, env);
}

/** 生成下发会话的 Set-Cookie 头 */
export function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

/** 生成清除会话的 Set-Cookie 头 */
export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export { safeEqual, hmacHex, randomId };
