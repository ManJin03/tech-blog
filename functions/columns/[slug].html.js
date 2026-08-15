import { html } from '../_lib/respond.js';
import { readIndex } from '../_lib/store.js';
import { renderColumnPage, renderNotFound, collectSeries, backfillSeriesCount } from '../_lib/render.js';

/** 专栏详情页（/columns/<slug>.html，文章数据从 KV 读取） */
export async function onRequest(context) {
    const { env, params } = context;
    let slug = decodeURIComponent(params.slug || '');
    if (slug.endsWith('.html')) slug = slug.slice(0, -'.html'.length);

    const posts = await readIndex(context.env);
    const series = backfillSeriesCount(collectSeries(posts));
    const col = series.find(item => item.slug === slug);
    if (!col) return html(renderNotFound(), 404);
    return html(renderColumnPage(col));
}
