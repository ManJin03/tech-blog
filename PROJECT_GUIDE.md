# 项目说明文档

> 个人技术博客（ByteForge）。静态资源部署在 Cloudflare Pages，文章数据存储于 Cloudflare KV，由 Pages Functions 动态渲染。
> **文章以云端 KV 为唯一事实源**：所有增删改均在浏览器管理面板完成，项目不再提供"本地推送云端"的迁移命令，避免本地文件覆盖云端数据。本地 `src/posts/*.md` 仅作草稿模板存放（已 gitignore）。

---

## 一、整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                        浏览器（管理员）                        │
│   个人资料卡 → 管理员登录 → 管理面板                           │
│     ├── 新建文章（可上传本地 .md 自动解析填充）                 │
│     ├── 编辑 / 删除 / 查看                                     │
│     └── 操作成功后自动刷新页面                                 │
└──────────────────────────┬───────────────────────────────────┘
                           │ /api/*（登录、会话、文章 CRUD）
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    Cloudflare（云端）                          │
│   KV Namespace（绑定名 KV）                                    │
│     ├── article:index    文章元数据列表（JSON 数组）            │
│     └── article:<slug>   单篇文章完整记录                       │
│        ▲                                                      │
│        │ 读                                                  │
│   Pages Functions（functions/）                                │
│        │ 动态渲染                                              │
│   Pages 静态站点（dist/ 静态资源 + Functions 路由）              │
└──────────────────────────────────────────────────────────────┘

本地（可选）：
  npm run new -- "标题" 分类   →  生成 src/posts/<slug>.md 草稿模板
  （gitignore，仅供写作参考 / 上传导入用，不会上传覆盖云端）
```

**写入渠道（唯一）：浏览器管理面板 → `/api/articles`（POST/PATCH/DELETE）→ 云端 KV。**

不存在第二条写入通道，因此不存在本地推送覆盖云端数据的问题。

---

## 二、根目录文件说明

| 文件 | 作用 |
| --- | --- |
| `wrangler.toml` | Cloudflare Pages / Wrangler 配置：项目名、构建输出目录、本地开发端口、KV 绑定、本地开发变量。**此文件被 `.gitignore` 忽略，含真实 KV id 与密码，勿提交** |
| `wrangler.md` | 配置模板的说明文档（带占位符，可对照填写 `wrangler.toml`） |
| `build.js` | 本地静态构建脚本：读 `src/posts/*.md` 生成 `dist/`，**仅用于本地预览**（不参与线上数据） |
| `package.json` | npm 脚本与依赖（见下表） |
| `src/` | 源码：草稿模板、自定义页、静态资源、模板 |
| `functions/` | Cloudflare Pages Functions（服务端 API 与动态渲染） |
| `scripts/` | 辅助脚本（新建本地模板） |
| `dist/` | 构建输出目录，Pages 的部署产物（被忽略，不提交） |
| `.gitignore` | 忽略 `node_modules/`、`wrangler.toml`、`src/posts`、`dist/`、`.wrangler` 等 |
| `README.md` | 项目说明 |
| `PROJECT_GUIDE.md` | 本文档 |

### package.json 脚本

| 命令 | 作用 |
| --- | --- |
| `npm run build` | 执行 `node build.js`，生成 `dist/`（本地预览用） |
| `npm run dev` | 构建并监听 `src/` 变化自动重构建 |
| `npm run serve` | 构建后用 `serve` 在 8881 端口静态预览 |
| `npm run new -- "标题" [分类]` | 用 `scripts/new-post.js` 在 `src/posts/` 生成文章草稿模板（已 gitignore，可配合管理面板上传导入） |
| `npm run pages:dev` | 用 `wrangler pages dev dist` 本地起 Cloudflare 开发服务器（端口由 `wrangler.toml` 的 `[dev].port` 决定，实际为 8881） |

> 已移除 `seed` / `kv:seed` / `kv:seed-remote` 等一切本地→云端 KV 推送脚本。

### 依赖

- 运行时：`marked`（Markdown 渲染）、`marked-highlight`（代码高亮衔接）、`highlight.js`（代码高亮）
- 开发时：`gray-matter`（构建解析 frontmatter）、`wrangler`（本地开发）

---

## 三、src/ 目录说明

| 路径 | 作用 |
| --- | --- |
| `src/posts/*.md` | 本地文章草稿模板（**gitignore**）。文件名即 slug（如 `hello-world.md` → `slug: hello-world`）。仅用于本地写作参考，可上传到管理面板导入发布；**不会**自动上传覆盖云端 |
| `src/pages/*.md` | 自定义静态页（如 `about.md` → `about.html`），随构建部署 |
| `src/assets/` | 静态资源，构建时整体拷贝到 `dist/assets/` |
| `src/assets/css/` | 样式表（含管理面板样式） |
| `src/assets/js/` | 前端脚本：`main.js`（全局交互）、`admin.js`（管理面板：登录、文章 CRUD、md 上传导入、自动刷新）、`intro.js`（光标/首页动效）等 |
| `src/templates/` | 页面模板（渲染函数从这里取布局） |

### 文章 frontmatter 字段（src/posts/*.md 与上传导入均支持）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | string | 文章标题 |
| `date` | string | 日期 `YYYY-MM-DD` |
| `category` | string | 分类 |
| `tags` | array | 标签数组 |
| `summary` | string | 摘要 |
| `series` | string / object | 专栏：字符串 `series: 专栏名`；对象 `series: { name, order }` |
| `draft` | boolean | 本地构建时草稿标记（`true` 则本地预览跳过）；**管理面板云端接口不处理 draft，发布后一律公开** |

---

## 四、functions/ 目录说明（服务端）

### 4.1 functions/_lib/

| 文件 | 作用与导出 |
| --- | --- |
| `store.js` | **KV 存储层**，全部 KV 读写集中在此。详见 4.2 |
| `render.js` | 共享渲染模块：`SITE` 站点配置、`renderMarkdown`、`buildToc`、`slugify`、`parseSeries`、`collectSeries`、各页面渲染函数等。`build.js` 与 Functions 共用 |
| `articles.js` | 文章数据归一化：`normalizeArticle(body, existing)` 校验并整理前端提交的字段（标题、slug、日期、分类、标签、摘要、专栏、正文），生成可写 KV 的记录 |
| `auth.js` | 管理员会话认证（无状态，HMAC-SHA256 签名 Cookie）：`createSession`、`verifySession`、`getSession`、`sessionCookie`、`clearSessionCookie`、`safeEqual`。导出常量 `COOKIE_NAME = 'byteforge_session'`、`SESSION_MAX_AGE = 30 天` |
| `respond.js` | 响应辅助：`json(data, status)`、`html(body, status)`、`notFound(message)` |

### 4.2 functions/_lib/store.js —— KV 读写（核心）

| 符号 | 含义 |
| --- | --- |
| `INDEX_KEY = 'article:index'` | KV 中文章元数据列表的 key（常量） |
| `articleKey(slug)` | 返回单篇文章 key：`article:<slug>` |
| `readIndex(env)` | 读 `article:index`，返回元数据数组（JSON 解析，带 60s 缓存），失败返回 `[]` |
| `writeIndex(env, list)` | 覆盖写 `article:index` |
| `metaFromArticle(article)` | 从完整文章记录提取索引条目（不含正文） |
| `readArticle(env, slug)` | 读 `article:<slug>` 完整记录 |
| `writeArticle(env, article)` | **新增/更新文章**：写 `article:<slug>` → 读现有 index → 更新或追加该条 meta → 按 date 倒序重排 → 覆盖写 `article:index` |
| `removeArticle(env, slug)` | 删除：删 `article:<slug>` → 从 index 中移除 → 覆盖写 index |
| `getAllArticles(env)` | 遍历 index 读取全部完整文章 |

### 4.3 functions/api/ —— HTTP 接口

| 路径 | 方法 | 权限 | 作用 |
| --- | --- | --- | --- |
| `/api/login` | POST | 公开 | 校验 `ADMIN_PASSWORD`，成功下发会话 Cookie；DELETE 退出（清 Cookie） |
| `/api/me` | GET | 公开 | 返回 `{ authed: boolean }`，前端判断是否已登录 |
| `/api/articles` | GET | 公开 | 返回文章元数据列表（`{ articles }`，**不含正文**） |
| `/api/articles` | POST | 需登录 | 新建文章，slug 冲突返回 409 |
| `/api/articles/:slug` | GET | 公开 | 返回单篇完整文章（含正文，附渲染后的 `html`/`toc`） |
| `/api/articles/:slug` | PATCH | 需登录 | 更新文章；若改了 slug，删除旧 key、写新 key |
| `/api/articles/:slug` | DELETE | 需登录 | 删除文章并同步索引 |
| `/api/articles/:slug.md` | GET | 公开 | 以 Markdown 文件形式下载文章（含 frontmatter），供文章页"下载"按钮使用 |
| `/`（index.js） | GET | 公开 | 首页，从 KV 读 index 动态渲染 |

### 4.4 中间件

| 文件 | 作用 |
| --- | --- |
| `functions/_middleware.js` | 全局中间件：把会话校验结果注入 `context.data.authed`，供受保护接口判断 |

---

## 五、KV 空间中的变量（键）含义

KV（Cloudflare Key-Value）里的"变量"实际是 **键值对（key-value）**，本项目只用两个 key 前缀：

| key | 值类型 | 含义 |
| --- | --- | --- |
| `article:index` | JSON 字符串（数组） | **文章元数据索引**：不含正文，按日期倒序。每项为 `{ slug, title, date, category, tags, summary, series, updatedAt }`。首页、归档、标签、专栏、搜索、RSS、管理列表全部读它 |
| `article:<slug>` | JSON 字符串（对象） | **单篇文章完整记录**：`{ slug, title, date, category, tags, summary, series, content, createdAt, updatedAt }`。`content` 为 Markdown 正文，文章页与 API 详情读它 |

**补充说明：**

- KV 绑定名 `KV`（`wrangler.toml` 中 `[[kv_namespaces]] binding = "KV"`）只是代码里访问 `env.KV` 的变量名，不是 key；key 指的是 `article:index`、`article:<slug>` 这些。
- 除这两个前缀外没有其他 key（没有计数器、配置项等）。
- `readIndex` 读 index 带 60s 边缘缓存；对同一 key 的 `put` 会使缓存失效，因此管理面板写文章后列表能即时更新。
- 云端记录不含 `draft` 字段，管理面板发布的文章一律公开。

### 环境变量 / 配置变量（wrangler.toml `[vars]` + Pages 环境变量）

| 变量 | 必填 | 作用 |
| --- | --- | --- |
| `ADMIN_PASSWORD` | 是 | 管理员登录密码。`wrangler.toml` 中为本地开发默认值，**生产环境必须在 Cloudflare Pages 项目设置里配置真实密码** |
| `SESSION_SECRET` | 否 | 会话签名密钥，缺省时回退用 `ADMIN_PASSWORD` 当密钥。改了会导致已有 Cookie 全部失效 |

> 注意：`wrangler.toml` 里的 `[vars]` 仅对本地 `wrangler pages dev` 生效；云端变量以 Pages 项目设置的 Environment variables 为准。

---

## 六、为什么不存在"本地推送覆盖云端"问题

项目曾提供 `npm run kv:seed-remote`（`wrangler kv bulk put`）把本地文章推送到云端，语义是**按 key 整值覆盖**：

- 本地 `article:index` 会整体替换云端索引（云端管理面板新建的文章会从列表中"消失"）；
- 云端多余的 `article:<slug>` 不会被删除（残留"幽灵数据"）。

**该方案已彻底移除**：

- `package.json` 删除 `seed` / `kv:seed` / `kv:seed-remote` 脚本；
- 删除 `scripts/seed-kv.js` 与 `kv-seed.json` 产物（`.gitignore` 相应清理）；
- 文档（README、本文档）同步更新。

现在云端 KV 是**唯一事实源**，只能通过管理面板（或 API）写入，不存在第二条写入路径，从根本上避免覆盖冲突。

### 历史残留数据（如曾使用过旧推送方案）

若 KV 中曾残留未被索引引用的 `article:<slug>`（幽灵数据），不影响页面展示与写入（新文章写同 slug 会覆盖旧值）。如需彻底清理，可在 Dashboard 的 KV 界面人工删除多余 key。

---

## 七、常用工作流

### 日常写文章并发布（推荐）

```bash
# 可选：本地生成草稿模板，方便离线写作
npm run new -- "文章标题" 分类
# 编辑 src/posts/<slug>.md 写作

# 浏览器发布（二选一）：
#   a. 线上：https://tech-manjin.pages.dev → 管理员登录 → 新建文章 → 手动填写 / 上传 .md 导入
#   b. 本地调试：npm run pages:dev → /admin 登录 → 同上
```

### 管理面板使用要点

- 登录入口：任意页面左侧「个人资料卡」底部 → 🔒 管理员登录 → 输入 `ADMIN_PASSWORD`。
- **新建文章**：表单顶部可「导入 Markdown 文件」，选中本地 `.md` 后自动解析 frontmatter（标题、slug、日期、分类、标签、专栏、摘要）并填入对应输入框，正文填入 Markdown 文本框，确认无误后点「保存」。
- **编辑 / 删除 / 查看**：管理列表内对应按钮；删除需二次确认。
- **自动刷新**：新建、编辑保存、删除成功后页面自动刷新，保证看到的始终是最新云端数据。
- 会话 Cookie（30 天）由服务端 HMAC 签名，密码校验使用常数时间比较。

### 仅本地预览

```bash
npm run serve       # 8881 端口（静态）
npm run pages:dev   # wrangler 开发服务器（含 Functions + 本地 KV）
```
