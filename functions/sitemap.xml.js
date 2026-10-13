import { readIndex } from './_lib/store.js';
import { renderSitemap, collectSeries, backfillSeriesCount } from './_lib/render.js';

/** sitemap.xml（仅时间戳与 slug：读取索引元数据即可，无需拉取全文） */
export async function onRequest(context) {
  const posts = await readIndex(context.env);
  const series = backfillSeriesCount(collectSeries(posts));

  return new Response(renderSitemap({ posts, series }), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // 内容随文章增删变化：浏览器缓存 1 分钟，CDN 共享缓存 5 分钟（与 KV cacheTtl 60s 一致）
      'Cache-Control': 'public, max-age=60, s-maxage=300',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
