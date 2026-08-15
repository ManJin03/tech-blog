import { html } from '../_lib/respond.js';
import { readIndex, readArticle } from '../_lib/store.js';
import { renderPostPage, renderNotFound, hydratePost, collectSeries, backfillSeriesCount } from '../_lib/render.js';

/** 文章页（/posts/<slug>.html，正文从 KV 读取） */
export async function onRequest(context) {
  const { env, params } = context;
  let slug = decodeURIComponent(params.slug || '');
  if (slug.endsWith('.html')) slug = slug.slice(0, -'.html'.length);

  const article = await readArticle(env, slug);
  if (!article) return html(renderNotFound(), 404);

  const index = await readIndex(env);
  backfillSeriesCount(collectSeries(index));

  const post = hydratePost(article);
  const entry = index.find(item => item.slug === slug);
  if (entry) {
    post.seriesIndex = entry.seriesIndex;
    post.seriesPrev = entry.seriesPrev;
    post.seriesNext = entry.seriesNext;
    post.seriesCount = entry.seriesCount;
  }
  return html(renderPostPage(post));
}
