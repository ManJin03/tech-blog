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

  // 目录：点击平滑跳转 + 滚动时高亮当前阅读章节
  // 覆盖窄屏折叠目录（.toc）与宽屏右侧悬浮卡片（.toc-card）两套列表
  const tocLinks = Array.prototype.slice.call(
    document.querySelectorAll(".toc a, .toc-card a")
  );

  if (tocLinks.length) {
    // 点击目录项 → 平滑滚动到对应章节（scroll-margin-top 规避吸顶头部遮挡）
    tocLinks.forEach(function (link) {
      link.addEventListener("click", function (e) {
        const href = link.getAttribute("href");
        const target = href && document.getElementById(href.slice(1));
        if (!target) return;
        e.preventDefault();
        history.replaceState(null, "", href);
        const reduceMotion = window.matchMedia &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      });
    });

    // 目录项高亮切换；悬浮卡片内列表超长滚动时，保证当前项可见
    const setActiveLink = function (id) {
      tocLinks.forEach(function (l) {
        const on = l.getAttribute("href") === "#" + id;
        if (on && !l.classList.contains("active")) {
          const nav = l.closest(".toc-card-nav");
          if (nav && nav.scrollHeight > nav.clientHeight) {
            const top = l.offsetTop;
            const bottom = top + l.offsetHeight;
            if (top < nav.scrollTop) {
              nav.scrollTop = top - 4;
            } else if (bottom > nav.scrollTop + nav.clientHeight) {
              nav.scrollTop = bottom - nav.clientHeight + 4;
            }
          }
        }
        l.classList.toggle("active", on);
      });
    };

    const headings = tocLinks.map(function (link) {
      return document.getElementById(link.getAttribute("href").slice(1));
    }).filter(Boolean);

    if (headings.length) {
      // 根据阅读位置计算当前章节：取「页顶 + 偏移」之下最后一个标题
      const READ_OFFSET = 100;
      let ticking = false;
      const computeActive = function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          let current = headings[0].id;
          const nearBottom = window.innerHeight + window.scrollY >=
            document.documentElement.scrollHeight - 8;
          if (nearBottom) {
            current = headings[headings.length - 1].id;
          } else {
            for (let i = 0; i < headings.length; i++) {
              if (headings[i].getBoundingClientRect().top <= READ_OFFSET) {
                current = headings[i].id;
              } else {
                break;
              }
            }
          }
          setActiveLink(current);
        });
      };
      window.addEventListener("scroll", computeActive, { passive: true });
      window.addEventListener("resize", computeActive, { passive: true });
      // 初始渲染、字体加载完成后各校正一次，避免布局偏移导致高亮错位
      computeActive();
      window.addEventListener("load", computeActive);
    }
  }

  // 代码块：一键复制（复制按钮已由服务端随 <pre> 一起渲染）
  document.querySelectorAll(".code-block .code-copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (btn.dataset.copied) return;
      const block = btn.closest(".code-block");
      const codeEl = block ? block.querySelector("pre code") : null;
      const text = codeEl ? codeEl.textContent : "";
      if (!text) return;
      copyText(text).then(function () {
        flashCopy(btn, false);
      }).catch(function () {
        flashCopy(btn, true);
      });
    });
  });

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      // 旧浏览器降级方案：隐藏 textarea + execCommand
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
      ok ? resolve() : reject(new Error("copy failed"));
    });
  }

  function flashCopy(btn, failed) {
    btn.dataset.copied = "1";
    btn.classList.add("is-copied");
    const label = btn.querySelector(".code-copy-text");
    if (label) label.textContent = failed ? "复制失败" : "已复制";
    btn.setAttribute("aria-label", failed ? "复制失败，请手动选择复制" : "代码已复制到剪贴板");
    setTimeout(function () {
      btn.dataset.copied = "";
      btn.classList.remove("is-copied");
      if (label) label.textContent = "复制";
      btn.setAttribute("aria-label", "复制代码到剪贴板");
    }, 1800);
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
