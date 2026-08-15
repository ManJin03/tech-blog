import { readIndex } from './_lib/store.js';
import { renderSearchIndex } from './_lib/render.js';

/** 搜索索引 search.json（文章数据从 KV 读取） */
export async function onRequest(context) {
  const posts = await readIndex(context.env);
  const data = renderSearchIndex(posts);
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
