/**
 * Cloudflare KV 评论存储层
 *
 * 数据模型：
 * - key `comment:list:<slug>`：某篇文章的评论数组（按时间正序，新评论追加尾部）
 * - key `comment:rate:<githubId>`：发表限流标记（TTL 20 秒）
 *
 * 存储对象（user 为发表时的 GitHub 身份快照）：
 *   {
 *     id: string,            // 随机 hex id
 *     user: { id, login, name, avatar, url },  // GitHub 用户快照
 *     content: string,       // 纯文本正文（前端转义后展示，杜绝 XSS）
 *     createdAt: string      // ISO 8601
 *   }
 *
 * 说明：正文一律纯文本存储、前端转义渲染；服务端不做任何 HTML 输出。
 *       删除权限由接口层判定：作者本人（user.id === 当前用户 id）或管理员。
 */
import { randomId } from './auth.js';

export const MAX_CONTENT_LENGTH = 2000;
export const MAX_COMMENTS_PER_POST = 500;
export const RATE_LIMIT_SECONDS = 20;

function listKey(slug) {
  return `comment:list:${slug}`;
}

function rateKey(githubId) {
  return `comment:rate:${githubId}`;
}

/** 读取一篇文章的评论列表（按发表时间正序） */
export async function readComments(env, slug) {
  if (!slug) return [];
  try {
    const value = await env.KV.get(listKey(slug), { type: 'json' });
    return Array.isArray(value) ? value : [];
  } catch (err) {
    console.error(`[kv] readComments failed: ${slug}`, err);
    return [];
  }
}

/** 校验并归一化评论正文 */
export function normalizeContent(raw) {
  const content = typeof raw === 'string' ? raw.trim() : '';
  if (!content) return { error: '评论内容不能为空' };
  if (content.length > MAX_CONTENT_LENGTH) {
    return { error: `评论内容过长（最多 ${MAX_CONTENT_LENGTH} 字）` };
  }
  return { content };
}

/**
 * 追加一条评论并返回新评论对象。
 * @param {object} env
 * @param {string} slug
 * @param {object} profile 当前 GitHub 用户资料（comment-auth 归一化：{ id, login, name, avatar, url }）
 * @param {string} content 已校验的纯文本正文
 */
export async function addComment(env, slug, profile, content) {
  const comment = {
    id: randomId(),
    user: {
      id: String(profile.id),
      login: String(profile.login || ''),
      name: String(profile.name || profile.login || ''),
      avatar: String(profile.avatar || ''),
      url: String(profile.url || `https://github.com/${profile.login}`)
    },
    content,
    createdAt: new Date().toISOString()
  };
  const list = await readComments(env, slug);
  list.push(comment);
  // 超出上限时丢弃最旧评论，控制单条 KV 大小
  if (list.length > MAX_COMMENTS_PER_POST) {
    list.splice(0, list.length - MAX_COMMENTS_PER_POST);
  }
  await env.KV.put(listKey(slug), JSON.stringify(list));
  return comment;
}

/** 删除指定评论，返回是否删除成功 */
export async function removeComment(env, slug, id) {
  const list = await readComments(env, slug);
  const idx = list.findIndex(c => c.id === id);
  if (idx < 0) return false;
  list.splice(idx, 1);
  await env.KV.put(listKey(slug), JSON.stringify(list));
  return true;
}

/** 发表评论限流检查：距上次发表不足 RATE_LIMIT_SECONDS 时拒绝 */
export async function checkRateLimit(env, githubId) {
  const last = await env.KV.get(rateKey(githubId));
  if (last) return false;
  await env.KV.put(rateKey(githubId), String(Date.now()), { expirationTtl: RATE_LIMIT_SECONDS });
  return true;
}
