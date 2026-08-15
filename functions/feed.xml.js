import { readIndex } from './_lib/store.js';
import { renderRss } from './_lib/render.js';

/** RSS feed.xml（文章数据从 KV 读取） */
export async function onRequest(context) {
  const posts = await readIndex(context.env);
  return new Response(renderRss(posts), {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' }
  });
}
