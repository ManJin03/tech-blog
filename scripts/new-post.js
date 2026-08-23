/**
 * 新建文章脚手架
 * 用法: npm run new -- "文章标题" [分类]
 * 示例: npm run new -- "深入理解 CUDA 编程模型" 异构计算
 */
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = join(__dirname, '..', 'src', 'posts');

const title = process.argv[2] || '未命名文章';
const category = process.argv[3] || '技术';
const slug = title
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 60) || `post-${Date.now()}`;
const date = new Date().toISOString().slice(0, 10);
const file = join(POSTS_DIR, `${slug}.md`);

if (existsSync(file)) {
  console.error(`✗ 文章已存在：${file}`);
  process.exit(1);
}

const template = `---
title: ${title}
date: ${date}
category: ${category}
tags: []
series: 专栏名
# series:                              # 专栏（可选）：需要手动控制顺序时用对象写法
#   name: 专栏名
#   order: 1                           # 数字越小越靠前
summary: 在此填写文章摘要（120 字以内，用于首页展示，留空以自动截取文章前百字）。
draft: false
---

## 引言

在这里开始写作。

## 正文

\`\`\`cpp
// 代码示例
#include <iostream>

int main() {
    std::cout << "Hello, World!" << std::endl;
    return 0;
}
\`\`\`

## 小结

总结要点。
`;

writeFileSync(file, template);
console.log(`✓ 已创建：${file}`);
