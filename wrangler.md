# Cloudflare Pages / Wrangler 配置

```toml
name = "tech-blog"
compatibility_date = "2026-08-15"
pages_build_output_dir = "dist"

# 本地开发服务器配置（wrangler pages dev）
[dev]
port = 8880

# 文章存储 KV（绑定变量名：KV）
# 在 Cloudflare Dashboard → Workers & Pages → KV 中创建 namespace，并把 id 填到下面
# 也可运行：npx wrangler kv namespace create ARTICLE_KV
[[kv_namespaces]]
binding = "KV"
id = "REPLACE_WITH_YOUR_KV_NAMESPACE_ID"

# 以下变量为本地开发（wrangler pages dev）默认值，
# 生产环境请在 Cloudflare Pages 项目 Settings → Environment variables 中配置：
#   ADMIN_PASSWORD       管理员登录密码（必填）
#   SESSION_SECRET       会话签名密钥（管理员 + 评论用户会话共用，可选，缺省回退 ADMIN_PASSWORD）
#   GITHUB_CLIENT_ID     GitHub OAuth App Client ID（评论区 GitHub 登录）
#   GITHUB_CLIENT_SECRET GitHub OAuth App Client Secret（评论区 GitHub 登录）
# [vars]
# ADMIN_PASSWORD = "change-me"
# SESSION_SECRET = "change-me"
# GITHUB_CLIENT_ID = "change-me"
# GITHUB_CLIENT_SECRET = "change-me"
```

## 评论区 GitHub 登录

评论功能使用 **GitHub OAuth App**，评论用户会话 Cookie 为 `byteforge_github`
（用户资料存 KV `comment-session:<id>`，30 天 TTL）；
管理员会话 Cookie 为 `byteforge_session`。两者**完全隔离、互不影响**，
同一浏览器可同时保持 GitHub 登录与管理员登录。

### 1. 创建 GitHub OAuth App

`GitHub → Settings → Developer settings → OAuth Apps → New OAuth App`：

| 字段 | 值 |
| ---- | ---- |
| Homepage URL | `https://<你的站点域名>/`（本地可用 `http://localhost:8880`） |
| Authorization callback URL | `https://<你的站点域名>/api/auth/github/callback` |

- 本地开发回调地址：`http://localhost:8880/api/auth/github/callback`（`wrangler pages dev` 默认端口 8880；如用 `npm run serve` 预览静态产物则为 8881，需在 OAuth App 中一并匹配）
- Scope 只需 `read:user`（公开资料：用户名、昵称、头像）

### 2. 配置环境变量

在 Cloudflare Pages 项目 **Settings → Environment variables**（生产环境）中配置：

| 变量 | 说明 |
| ---- | ---- |
| `GITHUB_CLIENT_ID` | OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | OAuth App Client Secret |
| `SESSION_SECRET` | （可选）会话签名密钥，缺省回退用 `ADMIN_PASSWORD` |

> 未配置 `GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET` 时评论功能自动降级为「未启用」提示，不影响站点其它功能。

### 3. 相关接口

| 接口 | 说明 |
| ---- | ---- |
| `GET /api/auth/github?return_to=` | 发起登录（302 → GitHub 授权页） |
| `GET /api/auth/github/callback` | OAuth 回调（校验 state 防 CSRF → 建会话 → 跳回原页） |
| `DELETE /api/auth/github` | 退出评论登录（仅清除评论会话，不影响管理员会话） |
| `GET /api/me` | 当前身份：`authed`（管理员）+ `user`（GitHub 评论用户） |
| `GET /api/comments?slug=` | 文章评论列表（含 `enabled` 是否已启用） |
| `POST /api/comments` | 发表评论（需 GitHub 登录），body `{ slug, content }` |
| `DELETE /api/comments/:id?slug=` | 删除评论（评论作者本人或管理员） |

### 4. KV 数据模型（评论相关）

- `comment:list:<slug>`：某篇文章的评论数组（按时间正序；评论者信息为发表时快照）
- `comment:rate:<githubId>`：发表评论限流标记（TTL 60 秒；Cloudflare KV `expirationTtl` 下限为 60 秒）
- `comment-session:<id>`：评论用户会话资料（30 天 TTL）
