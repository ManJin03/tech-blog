# personal-blog

个人技术博客，基于 Markdown 的可拓展静态站点。

## 特性

- **Markdown 写作**：文章用 frontmatter + Markdown，专注内容
- **零运行时依赖部署**：构建产物为纯静态 HTML/CSS/JS，可托管于 GitHub Pages / Netlify / 任意静态服务器
- **暗色模式**：一键切换，localStorage 持久化，无 FOUC
- **代码高亮**：基于 highlight.js，支持 190+ 语言
- **自动目录**：文章页根据标题层级生成 TOC，滚动联动高亮
- **归档与标签**：按年份归档，按标签聚类，标签云可视化
- **RSS 订阅**：自动生成 `feed.xml`
- **响应式**：桌面/平板/手机自适应
- **可拓展**：新增文章只需在 `src/posts/` 放一个 `.md` 文件

## 目录结构

```md
personal-blog/
├── build.js                  # 静态站点生成器（核心）
├── scripts/
│   └── new-post.js           # 新建文章脚手架
├── src/
│   ├── posts/                # 文章源文件（Markdown + frontmatter）
│   ├── pages/                # 自定义页面（如关于）
│   └── assets/
│       ├── css/style.css     # 全局样式与主题变量
│       ├── js/main.js        # 客户端交互
│       └── favicon.svg
└── dist/                     # 构建输出（gitignore）
```

## 快速开始

```bash
# 安装依赖
npm install

# 构建静态站点到 dist/
npm run build

# 本地预览（默认 http://localhost:4321）
npm run serve

# 监听文件变化自动重建
npm run dev
```

## 写作

### 新建文章

```bash
npm run new -- "文章标题" 分类名
# 例：npm run new -- "深入理解 CUDA 编程模型" 异构计算
```

会在 `src/posts/` 下生成带 frontmatter 的模板文件。

### Frontmatter 字段

```yaml
---
title: 文章标题           # 必填
date: 2026-01-01         # 必填，YYYY-MM-DD
category: 分类            # 必填
tags: [标签1, 标签2]      # 可选
summary: 摘要             # 可选，默认取正文前 120 字
draft: false             # 可选，true 时不发布
---
```

## 拓展指南

- **新增导航项**：修改 `build.js` 中 `SITE.nav`
- **新增社交链接**：修改 `build.js` 中 `SITE.social`
- **调整主题色**：修改 `src/assets/css/style.css` 中 `:root` / `[data-theme]` 的 CSS 变量
- **自定义页面**：在 `src/pages/` 放 Markdown 文件，自动生成对应 HTML
- **新增生成器功能**：在 `build.js` 中添加 `buildXxx` 函数，并在 `build()` 中调用

## 技术栈

- Node.js（ESM）
- [marked](https://github.com/markedjs/marked) - Markdown 解析
- [highlight.js](https://highlightjs.org/) - 代码高亮
- [gray-matter](https://github.com/jonschlinkert/gray-matter) - frontmatter 解析

## License

MIT
