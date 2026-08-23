/**
 * ============================================================
 *  站点配置文件 —— 博客所有可自定义的站点内容统一在这里修改
 * ============================================================
 *
 * 使用说明：
 *   1. 修改本文件并保存后：
 *        - 本地预览：npm run serve（构建并启动本地服务器）
 *        - 线上生效：提交推送代码，Cloudflare Pages 会自动重新部署
 *   2. 其他可编辑内容（不在本文件中）：
 *        - 关于页正文：src/pages/about.md
 *        - 文章内容：src/posts/*.md（线上通过"管理员登录"面板管理）
 *        - 管理员密码：Cloudflare 环境变量 ADMIN_PASSWORD
 *
 * 本文件同时被本地构建（build.js）与线上渲染（Cloudflare Pages
 * Functions）引用，在此修改一处即可全局生效，无需改动其他代码。
 */

export const SITE = {
  /* ==================== 基本信息 ==================== */

  /** 站点名称：浏览器标签标题、页头 Logo、首页大标题、RSS 标题 */
  title: 'ByteForge',

  /** 站点介绍：首页副标题、SEO 描述、RSS 描述 */
  description: '一个关注系统编程、C++底层机制与工程实践的个人技术博客',

  /** 站点线上地址（用于 RSS 中的文章链接，末尾不带 /） */
  url: 'https://tech-manjin.pages.dev',

  /** 页面语言（影响 <html lang> 与 RSS <language>） */
  lang: 'zh-CN',

  /* ==================== 个人信息（左侧资料卡） ==================== */

  /** 昵称：资料卡姓名、页脚版权署名、RSS 作者 */
  author: 'ManJin',

  /** @用户名：资料卡姓名下方显示的 @xxx */
  login: 'ManJin03',

  /** 头像图片地址（加载失败时自动回退到 /assets/head.jpg） */
  avatar: 'https://github.com/ManJin03.png',

  /** 个人总站地址 */
  homepage: 'https://manjin.pages.dev/',

  /** 个人介绍：资料卡简介段落 */
  bio: 'C++与计算机爱好者，热衷于探索 C++ 底层机制、操作系统与昇腾 Ascend 算子开发。这里是我记录技术学习与工程实践的地方，希望这些文字能对你有所帮助。',

  /* ==================== 导航菜单（页头） ====================
   * label：菜单文字；href：链接地址。可自由增删条目。
   */
  nav: [
    { label: '首页', href: '/' },
    { label: '专栏', href: '/columns.html' },
    { label: '归档', href: '/archive.html' },
    { label: '标签', href: '/tags.html' },
    { label: '搜索', href: '/search.html' },
    { label: '关于', href: '/about.html' }
  ],

  /* ==================== 页脚社交链接 ====================
   * label：链接文字；href：链接地址。可自由增删条目。
   */
  social: [
    { label: 'GitHub', href: 'https://github.com/' },
    { label: 'RSS', href: '/feed.xml' }
  ],

  /* ==================== 资料卡社交按钮 ====================
   * name：按钮文字；url：链接地址；
   * icon：按钮内 SVG 图标代码（可替换为任意 SVG 或 <img> 标签）。
   */
  socialButtons: [
    { name: 'GitHub', url: 'https://github.com/ManJin03', icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 4.7 18 5 18 5c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/></svg>' },
    { name: '总站', url: 'https://manjin.pages.dev/', icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/></svg>' }
  ],

  /* ==================== 友情链接（资料卡底部） ====================
   * name：链接文字；url：链接地址。可自由增删条目。
   */
  friendLinks: [
    { name: 'Young man の 小破站', url: 'https://homepage-afl.pages.dev/' }
  ],

  /* ==================== 界面文案 ==================== */
  ui: {
    /** 首页文章列表区标题 */
    latestPostsTitle: '最新文章',

    /** 首页专栏区 & 专栏页的标题 */
    columnsTitle: '专栏',

    /** 页头访客统计的文字与单位 */
    visitorLabel: '本站访客',
    visitorUnit: '人',

    /** 页脚版权说明（显示在"© 年份 作者名 ·"之后） */
    footerNote: '由自建生成器驱动 · 文章数据存储于 Cloudflare KV',

    /** 404 页面提示文字 */
    notFoundText: '页面未找到'
  }
};
