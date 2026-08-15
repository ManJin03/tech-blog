/**
 * 文章记录归一化（创建 / 更新共用）
 * 校验并整理管理员提交的文章字段，输出可直接写入 KV 的记录。
 */
import { slugify, toISODate, parseSeries } from './render.js';

export function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return toISODate(new Date(now.getTime() - offset));
}

export function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map(t => String(t).trim()).filter(Boolean);
  }
  if (typeof tags === 'string') {
    return tags.split(/[,，]/).map(t => t.trim()).filter(Boolean);
  }
  return [];
}

export function normalizeSeries(series) {
  if (!series) return null;
  if (typeof series === 'string') return parseSeries(series);
  if (typeof series === 'object' && series.name) {
    return parseSeries({ name: series.name, order: series.order });
  }
  return null;
}

/**
 * 将文章序列化为 Markdown 文本（含 YAML frontmatter），供"下载本文"接口使用。
 * @param {object} article 完整文章记录
 * @returns {string}
 */
export function serializeArticle(article) {
  const lines = ['---', `title: ${JSON.stringify(article.title)}`, `date: ${article.date}`];
  if (article.category) lines.push(`category: ${JSON.stringify(article.category)}`);
  if (Array.isArray(article.tags) && article.tags.length) {
    lines.push(`tags: [${article.tags.map(t => JSON.stringify(t)).join(', ')}]`);
  }
  if (article.summary) lines.push(`summary: ${JSON.stringify(article.summary)}`);
  if (article.series) {
    lines.push('series:');
    lines.push(`  name: ${JSON.stringify(article.series.name)}`);
    if (article.series.order !== null && article.series.order !== undefined) {
      lines.push(`  order: ${article.series.order}`);
    }
  }
  return lines.join('\n') + '\n---\n\n' + (article.content || '');
}

/**
 * 校验 + 归一化文章数据。
 * @param {object} body    前端提交的字段
 * @param {object|null} existing 已存在的文章记录（更新时传入，用于保留 createdAt 等）
 * @returns {{article?: object, error?: string}}
 */
export function normalizeArticle(body, existing) {
  if (!body || typeof body !== 'object') return { error: '无效的请求体' };

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return { error: '标题不能为空' };

  let slug = typeof body.slug === 'string' && body.slug.trim()
    ? slugify(body.slug)
    : slugify(title);
  if (!slug) return { error: '无法生成文章标识 slug，请手动填写' };

  let date = typeof body.date === 'string' ? body.date.trim() : '';
  if (!date) date = todayISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: '日期格式应为 YYYY-MM-DD' };
  }

  const category = (typeof body.category === 'string' && body.category.trim())
    ? body.category.trim()
    : '未分类';

  const tags = normalizeTags(body.tags);

  const content = typeof body.content === 'string' ? body.content : '';

  let summary = (typeof body.summary === 'string' && body.summary.trim())
    ? body.summary.trim()
    : '';
  if (!summary) {
    summary = content.replace(/[#`>*\-\[\]\(\)]/g, '').trim().slice(0, 120);
    if (content.replace(/[#`>*\-\[\]\(\)]/g, '').trim().length > 120) summary += '…';
  }

  const series = normalizeSeries(
    body.series && typeof body.series === 'object'
      ? body.series
      : (body.seriesName ? { name: body.seriesName, order: body.seriesOrder } : body.series)
  );

  const now = new Date().toISOString();
  const base = existing || { createdAt: now };

  return {
    article: {
      ...base,
      slug,
      title,
      date,
      category,
      tags,
      summary,
      series,
      content,
      updatedAt: now
    }
  };
}
