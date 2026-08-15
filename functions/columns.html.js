import { html } from './_lib/respond.js';
import { readIndex } from './_lib/store.js';
import { renderColumnsList, collectSeries, backfillSeriesCount } from './_lib/render.js';

/** 专栏列表页（从 KV 读取文章后按专栏聚合） */
export async function onRequest(context) {
  const posts = await readIndex(context.env);
  const series = backfillSeriesCount(collectSeries(posts));
  return html(renderColumnsList(series));
}
