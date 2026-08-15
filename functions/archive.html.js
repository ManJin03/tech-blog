import { html } from './_lib/respond.js';
import { readIndex } from './_lib/store.js';
import { renderArchive } from './_lib/render.js';

/** 归档页（文章列表从 KV 读取） */
export async function onRequest(context) {
  const posts = await readIndex(context.env);
  return html(renderArchive(posts));
}
