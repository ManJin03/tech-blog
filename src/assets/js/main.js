/**
 * 客户端交互：
 * - 主题切换 + localStorage 持久化
 * - 防止主题闪烁（FOUC）的内联脚本已在 head 中执行
 * - 目录平滑滚动
 */
(function () {
  "use strict";

  const THEME_KEY = "byteforge-theme";
  const root = document.documentElement;

  // 主题切换按钮
  const toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      const current = root.getAttribute("data-theme");
      const next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (e) {
        /* localStorage 不可用时静默降级 */
      }
    });
  }

  // 外部链接新窗口打开
  document.querySelectorAll('.post-content a[href^="http"]').forEach(function (a) {
    if (a.host !== window.location.host) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
  });

  // 目录：当前节高亮（IntersectionObserver）
  const tocLinks = document.querySelectorAll(".toc a");
  if (tocLinks.length && "IntersectionObserver" in window) {
    const headings = Array.from(tocLinks).map(function (link) {
      return document.getElementById(link.getAttribute("href").slice(1));
    }).filter(Boolean);

    const setActive = function (id) {
      tocLinks.forEach(function (l) {
        l.classList.toggle("active", l.getAttribute("href") === "#" + id);
      });
    };

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-80px 0px -70% 0px" }
    );

    headings.forEach(function (h) { observer.observe(h); });
  }

  // 跟随光标的圆点层（仿 ManJin 总站风格）
  // 仅精确指针设备（有鼠标）启用；触摸设备跳过，避免遮挡
  if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) {
    const dot = document.createElement("div");
    dot.className = "focus-cursor";
    document.body.appendChild(dot);

    let raf = null;
    const move = function (e) {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        dot.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)";
        raf = null;
      });
      dot.classList.add("is-visible");
    };
    window.addEventListener("mousemove", move, { passive: true });
    // 鼠标移出整个文档（浏览器边缘、切换到其他应用）时隐藏自定义光标；
    // 重新移入时 mousemove 会再次显示
    document.addEventListener("mouseleave", function () {
      dot.classList.remove("is-visible");
    });
    window.addEventListener("blur", function () {
      dot.classList.remove("is-visible");
    });

    // 悬停可交互元素时放大变亮
    const hotSelector = 'a, button, [role="button"], input, textarea, select, label[for], .post-card, .link-card, .tag';
    document.addEventListener("mouseover", function (e) {
      if (e.target.closest(hotSelector)) dot.classList.add("is-hot");
    });
    document.addEventListener("mouseout", function (e) {
      if (e.target.closest(hotSelector)) dot.classList.remove("is-hot");
    });
  }
})();
