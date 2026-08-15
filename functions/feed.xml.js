import { readIndex } from './_lib/store.js';
import { renderRss } from './_lib/render.js';

/** RSS feed.xml（仅摘要：读取索引元数据即可，无需拉取完整文章） */
export async function onRequest(context) {
  const { env } = context;
  const metas = await readIndex(env);

  return new Response(renderRss(metas), {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      // RSS 更新频率低：浏览器缓存 1 分钟，CDN 共享缓存 5 分钟（与 KV cacheTtl 60s 一致）
      'Cache-Control': 'public, max-age=60, s-maxage=300',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
