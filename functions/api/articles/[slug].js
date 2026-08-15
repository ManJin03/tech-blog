import { json, notFound } from '../../_lib/respond.js';
import { readIndex, readArticle, writeArticle, removeArticle } from '../../_lib/store.js';
import { normalizeArticle, serializeArticle } from '../../_lib/articles.js';
import { hydratePost } from '../../_lib/render.js';

/**
 * GET    /api/articles/:slug     文章详情（公开，含渲染后的 html/toc）
 * GET    /api/articles/:slug.md  以 Markdown 下载文章（公开，供"下载本文"按钮使用）
 * PATCH  /api/articles/:slug     更新文章（需登录）
 * DELETE /api/articles/:slug     删除文章（需登录）
 *
 * 注意：下载不再使用独立的 [slug].md.js 文件——它与此文件存在两个动态路由
 * 同时匹配 /api/articles/xxx.md 的歧义（Cloudflare 未承诺 .md 路由优先），
 * 实际部署中 .md 请求可能被本文件截获导致 slug 带 .md 后缀而查不到文章。
 * 因此统一在本入口处理：slug 以 .md 结尾时返回 Markdown 下载。
 */
export async function onRequest(context) {
  const { request, env, data, params } = context;
  const slug = decodeURIComponent(params.slug || '');
  const method = request.method;

  if (method === 'GET') {
    // 下载：/api/articles/xxx.md
    if (slug.endsWith('.md')) {
      const mdSlug = slug.slice(0, -'.md'.length);
      const article = await readArticle(env, mdSlug);
      if (!article) return notFound('文章不存在');
      const frontmatter = serializeArticle(article);
      const ascii = /^[\x00-\x7F]+$/.test(mdSlug);
      return new Response(frontmatter, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': ascii
            ? `attachment; filename="${mdSlug}.md"`
            : `attachment; filename="article.md"; filename*=UTF-8''${encodeURIComponent(mdSlug)}.md`
        }
      });
    }

    const article = await readArticle(env, slug);
    if (!article) return notFound('文章不存在');
    return json({ article: hydratePost(article) });
  }

  if (!data.authed) return json({ error: '未登录' }, 401);

  if (method === 'PATCH') {
    const existing = await readArticle(env, slug);
    if (!existing) return notFound('文章不存在');

    const body = await request.json().catch(() => null);
    if (!body) return json({ error: '无效的请求体' }, 400);

    const { article, error } = normalizeArticle(body, existing);
    if (error) return json({ error }, 400);

    if (article.slug !== slug) {
      const index = await readIndex(env);
      if (index.some(item => item.slug === article.slug)) {
        return json({ error: `slug 已存在：${article.slug}` }, 409);
      }
    }

    // 传入旧 slug：slug 变化时由 writeArticle 完成旧 key 删除 + 索引旧条目清理
    const meta = await writeArticle(env, article, slug);
    return json({ ok: true, article: meta });
  }

  if (method === 'DELETE') {
    await removeArticle(env, slug);
    return json({ ok: true });
  }

  return json({ error: 'Method Not Allowed' }, 405);
}
