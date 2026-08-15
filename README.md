# personal-blog

个人技术博客，部署于 [Cloudflare Pages](https://tech-manjin.pages.dev/)。

**文章存储于 Cloudflare KV（绑定变量 `KV`）**，由 Cloudflare Pages Functions 动态渲染。新增/修改/删除文章直接在浏览器管理面板完成，无需重新部署。

## 特性

- **Markdown 写作**：文章用 frontmatter + Markdown，管理面板在线编辑
- **KV 动态存储**：所有文章从 Cloudflare KV 读取，不再依赖本地文件，新增文章无需重新部署
- **管理员后台**：个人资料卡底部「管理员登录」入口，登录后可对文章增、删、查、改
- **文章下载**：每篇文章页提供「下载本文」按钮，一键下载 Markdown 源文件
- **暗色模式**：一键切换，localStorage 持久化，无 FOUC
- **代码高亮**：基于 highlight.js，支持 190+ 语言
- **自动目录**：文章页根据标题层级生成 TOC，滚动联动高亮
- **归档与标签**：按年份归档，按标签聚类，标签云可视化
- **专栏（系列文章）**：通过 frontmatter 中的 `series` 字段把多篇文章聚合为专栏，自动生成专栏列表页与详情页，文章页带上下篇导航
- **全文搜索**：关键词 + 专栏 + 日期 + 标签四维度组合筛选
- **RSS 订阅**：自动生成 `feed.xml`

## 架构

```
浏览器
  │
  ├── /assets/*  静态资源（CSS/JS） → Cloudflare Pages 静态托管
  ├── /          首页            ┐
  ├── /posts/<slug>.html  文章页  │  均由 Pages Functions 动态渲染
  ├── /archive.html     归档      │  （数据来自 KV）
  ├── /tags.html        标签      │
  ├── /columns*.html    专栏      │
  ├── /search.html/.json 搜索    │
  ├── /feed.xml         RSS      ┘
  └── /api/*   登录 / 会话 / 文章增删改查 / 下载
```

| 目录 / 文件 | 说明 |
| ---------- | ---- |
| `functions/_lib/render.js` | 共享渲染模块（构建与 Functions 共用，纯函数无文件系统依赖） |
| `functions/_lib/store.js` | KV 文章存储层（`article:index` 元数据索引 + `article:<slug>` 全文） |
| `functions/_lib/auth.js` | 管理员会话认证（HMAC 签名 HttpOnly Cookie） |
| `functions/api/*` | 登录、会话、文章 CRUD、下载端点 |
| `functions/posts/[slug].html.js` 等 | 文章页 / 首页 / 归档 / 标签 / 专栏 / 搜索 / RSS 动态渲染 |
| `build.js` | 本地构建脚本（复用 render.js，输出 `dist/`，可用于本地预览与 KV 迁移） |
| `scripts/seed-kv.js` | 把 `src/posts/*.md` 迁移到 KV 的种子文件生成器 |

### KV 数据模型

- `article:index`：文章元数据列表（不含正文，按日期倒序）—— 首页 / 归档 / 标签 / 专栏 / 搜索 / RSS 共用
- `article:<slug>`：单篇文章完整记录（含 Markdown 正文、frontmatter 字段）

## 部署与迁移（首次）

### 1. 创建 KV namespace 并配置绑定

```bash
# 在项目根目录执行（生成 KV namespace 后把 id 填入 wrangler.toml）
npx wrangler kv namespace create ARTICLE_KV
```

把输出的 namespace `id` 填入 `wrangler.toml`：

```toml
[[kv_namespaces]]
binding = "KV"
id = "粘贴 namespace id"
```

**重要**：建议直接在 Dashboard 中为 Pages 项目绑定该 KV namespace：

`Cloudflare Dashboard → Workers & Pages → 你的 Pages 项目 → Settings → Functions → Bindings → 添加 KV namespace 绑定`

- 变量名（Variable name）：**`KV`**
- 选择刚创建的 namespace

`wrangler.toml` 仅供 `wrangler pages dev` / `wrangler kv` 等 CLI 命令解析绑定，线上运行时以 Dashboard 中的绑定为准。

### 2. 配置环境变量

在 Cloudflare Pages 项目 **Settings → Environment variables**（生产环境）中配置：

| 变量 | 说明 |
| ---- | ---- |
| `ADMIN_PASSWORD` | 管理员登录密码（必填） |
| `SESSION_SECRET` | 会话签名密钥（可选，缺省回退用 ADMIN_PASSWORD），可用 `openssl rand -hex 32` 生成 |

### 3. 迁移已有文章到 KV

```bash
# 安装依赖
npm install

# 生成 kv-seed.json（读取 src/posts/*.md）
npm run seed

# 写入 KV（在 wrangler.toml 配置好 KV id 后执行）
npm run kv:seed
```

### 4. 重新部署

仓库根目录新增的 `functions/` 目录会自动作为 Pages Functions 部署，构建命令保持 `npm run build`、输出目录 `dist`。

## 管理后台

- 任意页面左侧「个人资料卡」底部 → **🔒 管理员登录**，输入 `ADMIN_PASSWORD` 登录
- 登录后同一入口变为 **🛠 管理文章**，打开管理面板可：
  - **新建文章**：填写标题、slug、日期、分类、标签、专栏、摘要、Markdown 正文
  - **编辑 / 删除 / 查看**：列表内对应按钮（删除需二次确认）
- 文章页登录状态下，正文上方会额外出现「✏️ 编辑」快捷入口
- 会话 Cookie（30 天）由服务端 HMAC 签名，密码校验使用常数时间比较

## 写作（本地方式）

仍然支持在 `src/posts/` 直接放 Markdown 文件：

```bash
npm run new -- "文章标题" 分类名
```

然后在管理面板中创建，或编辑后执行迁移命令把数据同步到 KV：

```bash
npm run seed && npm run kv:seed
```

### Frontmatter 字段

```yaml
---
title: 文章标题           # 必填
date: 2026-01-01         # 必填，YYYY-MM-DD
category: 分类            # 可选，默认「未分类」
tags: [标签1, 标签2]      # 可选
series:                   # 专栏，可选
  name: 名称
  order: 次序
summary: 摘要             # 可选，默认取正文前 120 字
draft: false             # 可选，true 时不发布
---
```

### 专栏（系列文章）

专栏通过 `series` 字段把多篇文章聚合为一个系列，自动生成专栏列表页（`/columns.html`）与详情页（`/columns/<slug>.html`），文章页内显示专栏信息及上下篇导航。

两种写法（可混用）：

```yaml
series: 现代C++深度指南          # 写法一：仅名称，按 date 升序排序
---
series:
  name: 现代C++深度指南          # 写法二：名称 + order（越小越靠前）
  order: 2
```

> 详情规则见文章页内「系列文章」的导航逻辑与 `functions/_lib/render.js` 中 `collectSeries`。

## 本地开发

```bash
# 构建静态站点到 dist/（预览）
npm run build && npm run serve

# 或直接用 wrangler 本地跑 Functions + KV（推荐）
npx wrangler pages dev dist
# 需在 wrangler.toml 配置好 KV id 与 [vars] 中的 ADMIN_PASSWORD / SESSION_SECRET
```

## 目录结构

```md
personal-blog/
├── build.js                  # 本地构建（复用 render.js）
├── wrangler.toml             # Pages / KV 绑定配置
├── functions/                # Cloudflare Pages Functions
│   ├── _lib/                 # 共享模块（render / store / auth / respond / articles）
│   ├── api/                  # 登录、会话、文章 CRUD、下载
│   ├── index.js              # 首页动态渲染
│   ├── posts/[slug].html.js  # 文章页动态渲染
│   ├── archive.html.js       # 归档
│   ├── tags.html.js          # 标签
│   ├── columns*.js           # 专栏
│   ├── search*.js            # 搜索页 + search.json
│   └── feed.xml.js           # RSS
├── scripts/
│   ├── new-post.js           # 新建文章脚手架
│   └── seed-kv.js            # 本地文章 → KV 迁移
├── src/
│   ├── posts/                # 文章源文件（迁移数据用）
│   ├── pages/                # 自定义页面（如关于）
│   └── assets/
│       ├── css/style.css     # 全局样式与主题变量（含管理后台样式）
│       ├── js/main.js        # 客户端交互
│       ├── js/admin.js       # 管理员界面（登录 / 文章管理）
│       ├── js/search.js      # 搜索页筛选逻辑
│       └── favicon.svg
└── dist/                     # 构建输出（gitignore）
```

## 技术栈

- Node.js（ESM）
- Cloudflare Pages + Pages Functions + KV
- [marked](https://github.com/markedjs/marked) - Markdown 解析
- [highlight.js](https://highlightjs.org/) - 代码高亮
- [gray-matter](https://github.com/jonschlinkert/gray-matter) - frontmatter 解析
- [wrangler](https://developers.cloudflare.com/workers/wrangler/) - KV 迁移 / 本地开发

## License

MIT
