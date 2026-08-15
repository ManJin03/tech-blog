import { html } from './_lib/respond.js';
import { readIndex } from './_lib/store.js';
import { renderHome, collectSeries, backfillSeriesCount } from './_lib/render.js';

/** 首页（文章列表从 KV 读取） */
export async function onRequest(context) {
  const posts = await readIndex(context.env);
  const series = backfillSeriesCount(collectSeries(posts));
  return html(renderHome(posts, series));
}
