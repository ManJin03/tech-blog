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
#   ADMIN_PASSWORD  管理员登录密码（必填）
#   SESSION_SECRET  会话签名密钥（可选，缺省时回退使用 ADMIN_PASSWORD）
# [vars]
# ADMIN_PASSWORD = "change-me"
# SESSION_SECRET = "change-me"
```