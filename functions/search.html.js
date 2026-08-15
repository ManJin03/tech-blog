import { html } from './_lib/respond.js';
import { readIndex } from './_lib/store.js';
import { renderSearchPage, collectSeries, backfillSeriesCount } from './_lib/render.js';

/** 搜索页（筛选选项从 KV 数据生成） */
export async function onRequest(context) {
  const posts = await readIndex(context.env);
  const series = backfillSeriesCount(collectSeries(posts));
  return html(renderSearchPage(posts, series));
}
