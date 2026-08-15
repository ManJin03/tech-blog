/** 响应辅助工具 */

export function json(data, init = 200) {
  if (typeof init === 'number') init = { status: init };
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function html(body, init = 200) {
  if (typeof init === 'number') init = { status: init };
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'text/html; charset=utf-8');
  return new Response(body, { ...init, headers });
}

export function notFound(message = '页面未找到') {
  return json({ error: message }, 404);
}
