import { html } from './_lib/respond.js';
import { readIndex } from './_lib/store.js';
import { renderTags } from './_lib/render.js';

/** 标签页（文章列表从 KV 读取） */
export async function onRequest(context) {
  const posts = await readIndex(context.env);
  return html(renderTags(posts));
}
