# personal-blog

个人技术博客，基于 Markdown 的可拓展静态站点。

已部署到[cloudflare pages](https://tech-manjin.pages.dev/)

## 特性

- **Markdown 写作**：文章用 frontmatter + Markdown，专注内容
- **零运行时依赖部署**：构建产物为纯静态 HTML/CSS/JS，可托管于 GitHub Pages / Netlify / 任意静态服务器
- **暗色模式**：一键切换，localStorage 持久化，无 FOUC
- **代码高亮**：基于 highlight.js，支持 190+ 语言
- **自动目录**：文章页根据标题层级生成 TOC，滚动联动高亮
- **归档与标签**：按年份归档，按标签聚类，标签云可视化
- **专栏（系列文章）**：通过 frontmatter 中的 `series` 字段把多篇文章聚合为专栏，自动生成专栏列表页与详情页，文章页带上下篇导航
- **全文搜索**：关键词 + 专栏 + 日期 + 标签四维度组合筛选
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
│       ├── js/search.js      # 搜索页筛选逻辑（含专栏过滤）
│       └── favicon.svg
└── dist/                     # 构建输出（gitignore）
    ├── index.html            # 首页（含专栏速览区）
    ├── posts/                # 文章页
    ├── columns/              # 专栏详情页
    ├── columns.html          # 专栏列表页
    └── ...
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
series:                   # 专栏，可选（详见下方「专栏」说明）
  name: 名称
  order: 次序
summary: 摘要             # 可选，默认取正文前 120 字
draft: false             # 可选，true 时不发布
---
```

### 专栏（系列文章）

专栏用于把同一主题的多篇文章聚合为一个系列，构建时自动生成专栏列表页（`/columns.html`）和每个专栏的详情页（`/columns/<slug>.html`），文章页内也会显示所属专栏信息及上下篇导航。

#### 创建专栏

专栏无需单独注册——在文章 frontmatter 中添加 `series` 字段即表示该文章属于某个专栏。同名专栏的文章会自动归为一组。

#### `series` 字段的两种写法

**写法一：仅指定专栏名（按日期自动排序）**

```yaml
series: 现代C++深度指南
```

适用于文章按发布时间自然排列即可的场景。专栏内文章按 `date` 升序（从早到晚）排序。

**写法二：指定专栏名 + 序号（手动控制顺序）**

```yaml
series:
  name: 现代C++深度指南
  order: 2
```

适用于需要自定义阅读顺序的专栏。`order` 是数字，越小越靠前。未设 `order` 的文章排在所有设了 `order` 的文章之后，再按日期升序排列。

> 两种写法可以混用：同一专栏中部分文章用 `order`，部分不用。设了 `order` 的排在前面，没设的按日期排在后面。

#### 自动生成的内容

| 生成物 | 路径 | 说明 |
| -------- | ------ | ------ |
| 专栏列表页 | `/columns.html` | 展示所有专栏卡片，每张卡片含专栏名、篇数、摘要、前 5 篇预览 |
| 专栏详情页 | `/columns/<slug>.html` | 展示专栏内全部文章的有序列表 |
| 文章页专栏信息块 | 文章页内 | 显示专栏名（可点击）、「第 X 篇 / 共 N 篇」、上/下篇导航 |
| 首页专栏速览 | `/` | 展示最多 6 个专栏卡片 |
| 搜索页专栏筛选 | `/search.html` | 专栏下拉框可按专栏过滤文章 |
| 归档/标签页专栏标记 | `/archive.html`、`/tags.html` | 文章旁显示所属专栏小标签 |

#### 专栏 slug 规则

专栏 URL 中的 `<slug>` 由专栏名经 `slugify` 生成：转小写 → 非字母数字替换为 `-` → 去首尾 `-`。例如 `现代C++内存与并发` → `现代c-内存与并发`。

#### 注意事项

- 专栏简介取专栏中第一篇文章的 `summary`。
- 专栏的起讫日期由专栏内首篇和末篇文章的日期决定。
- `draft: true` 的文章不会出现在专栏中。
- 同一篇文章只能属于一个专栏（`series` 不支持数组）。

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
