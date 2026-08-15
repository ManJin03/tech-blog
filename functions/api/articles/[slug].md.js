import { readArticle } from '../../_lib/store.js';
import { notFound } from '../../_lib/respond.js';

/**
 * GET /api/articles/:slug.md  以 Markdown 文件形式下载文章（公开）
 * 文章页的“下载本文”按钮指向此端点。
 */
export async function onRequest(context) {
  const { env, params } = context;
  let slug = decodeURIComponent(params.slug || '');
  if (slug.endsWith('.md')) slug = slug.slice(0, -'.md'.length);

  const article = await readArticle(env, slug);
  if (!article) return notFound('文章不存在');

  const lines = ['---', `title: ${JSON.stringify(article.title)}`, `date: ${article.date}`];
  if (article.category) lines.push(`category: ${JSON.stringify(article.category)}`);
  if (Array.isArray(article.tags) && article.tags.length) {
    lines.push(`tags: [${article.tags.map(t => JSON.stringify(t)).join(', ')}]`);
  }
  if (article.summary) lines.push(`summary: ${JSON.stringify(article.summary)}`);
  if (article.series) {
    lines.push('series:');
    lines.push(`  name: ${JSON.stringify(article.series.name)}`);
    if (article.series.order !== null && article.series.order !== undefined) {
      lines.push(`  order: ${article.series.order}`);
    }
  }
  const frontmatter = lines.join('\n') + '\n---\n\n' + (article.content || '');

  const ascii = /^[\x00-\x7F]+$/.test(slug);
  return new Response(frontmatter, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': ascii
        ? `attachment; filename="${slug}.md"`
        : `attachment; filename="article.md"; filename*=UTF-8''${encodeURIComponent(slug)}.md`
    }
  });
}
