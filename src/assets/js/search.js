/**
 * 搜索页客户端逻辑
 * - 异步加载 /search.json 索引
 * - 年份↔月份下拉联动
 * - 专栏下拉筛选
 * - 关键词（标题+摘要+标签+分类+专栏名模糊匹配）× 专栏 × 日期 × 标签多选 四维度 AND 组合
 * - 实时渲染结果，关键词高亮
 * - 支持 URL 参数：?q=xxx&column=xxx&year=2026&month=2026-07&tag=Ascend
 */
(function () {
  "use strict";

  var INDEX_URL = "/search.json";
  var index = [];
  var loaded = false;

  var elForm = document.getElementById("search-form");
  var elQ = document.getElementById("q");
  var elColumn = document.getElementById("column");
  var elYear = document.getElementById("year");
  var elMonth = document.getElementById("month");
  var elTags = document.getElementById("search-tags");
  var elSummary = document.getElementById("search-summary");
  var elResults = document.getElementById("search-results");
  var elReset = document.getElementById("search-reset");

  if (!elForm) return;

  // ---------- 索引加载 ----------
  function loadIndex() {
    if (loaded) return Promise.resolve();
    return fetch(INDEX_URL)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        index = data || [];
        loaded = true;
      })
      .catch(function (err) {
        elSummary.textContent = "索引加载失败：" + err.message;
      });
  }

  // ---------- 年份↔月份联动 ----------
  function syncMonthOptions() {
    var selected = elYear.options[elYear.selectedIndex];
    var monthsCsv = selected ? selected.getAttribute("data-months") : "";
    var months = monthsCsv ? monthsCsv.split(",") : [];

    elMonth.innerHTML = '<option value="">全部</option>';
    if (months.length) {
      elMonth.disabled = false;
      months.forEach(function (m) {
        var opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m.slice(5);   // 只显示 MM
        elMonth.appendChild(opt);
      });
    } else {
      elMonth.disabled = true;
    }
  }

  // ---------- 读取当前筛选条件 ----------
  function readFilters() {
    var tags = Array.prototype.slice
      .call(elTags.querySelectorAll('input[name="tag"]:checked'))
      .map(function (c) { return c.value; });

    return {
      q: (elQ.value || "").trim().toLowerCase(),
      column: elColumn ? elColumn.value : "",
      year: elYear.value,
      month: elMonth.value,
      tags: tags
    };
  }

  // ---------- 执行筛选 ----------
  function filter(f) {
    return index.filter(function (p) {
      // 专栏
      if (f.column) {
        if (!p.series || p.series.slug !== f.column) return false;
      }
      // 日期：年
      if (f.year && p.year !== f.year) return false;
      // 日期：月
      if (f.month && p.month !== f.month) return false;
      // 标签：多选 AND（选中标签都必须命中）
      if (f.tags.length) {
        for (var i = 0; i < f.tags.length; i++) {
          if (p.tags.indexOf(f.tags[i]) === -1) return false;
        }
      }
      // 关键词：标题 + 摘要 + 标签 + 分类 + 专栏名
      if (f.q) {
        var seriesName = p.series ? p.series.name : "";
        var haystack = (
          p.title + " " + p.summary + " " + p.tags.join(" ") + " " + p.category + " " + seriesName
        ).toLowerCase();
        if (haystack.indexOf(f.q) === -1) return false;
      }
      return true;
    });
  }

  // ---------- 高亮关键词 ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function highlight(text, q) {
    var safe = escapeHtml(text);
    if (!q) return safe;
    var qSafe = escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return safe.replace(new RegExp(qSafe, "gi"), function (m) {
      return '<mark class="search-hit">' + m + "</mark>";
    });
  }

  function formatDate(d) {
    var date = new Date(d);
    if (isNaN(date)) return d;
    return date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  function slugify(s) {
    return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  }

  // ---------- 渲染结果 ----------
  function render(results, f) {
    elSummary.textContent =
      results.length === 0
        ? "没有匹配的文章"
        : "共 " + results.length + " 篇匹配文章";

    if (!results.length) {
      elResults.innerHTML = '<p class="search-empty">尝试调整关键词或清除部分筛选条件。</p>';
      return;
    }

    var html = results
      .map(function (p) {
        var tagsHtml = p.tags
          .map(function (t) {
            return '<a href="/tags.html#' + slugify(t) + '" class="tag">#' + escapeHtml(t) + "</a>";
          })
          .join("");
        var seriesHtml = p.series
          ? '<a class="post-series" href="/columns/' + p.series.slug + '.html">📚 ' + highlight(p.series.name, f.q) + "</a>"
          : "";

        return (
          '<article class="post-card">' +
            '<h2 class="post-card-title"><a href="' + p.url + '">' + highlight(p.title, f.q) + "</a></h2>" +
            '<div class="post-meta">' +
              '<time datetime="' + p.date + '">' + formatDate(p.date) + "</time>" +
              '<span class="post-category">' + escapeHtml(p.category) + "</span>" +
              seriesHtml +
            "</div>" +
            '<p class="post-summary">' + highlight(p.summary, f.q) + "</p>" +
            (tagsHtml ? '<div class="post-tags">' + tagsHtml + "</div>" : "") +
          "</article>"
        );
      })
      .join("\n");

    elResults.innerHTML = '<div class="post-list">' + html + "</div>";
  }

  // ---------- 主流程 ----------
  function run() {
    var f = readFilters();
    var results = filter(f);
    render(results, f);
    syncUrl(f);
  }

  function syncUrl(f) {
    var params = new URLSearchParams();
    if (f.q) params.set("q", f.q);
    if (f.column) params.set("column", f.column);
    if (f.year) params.set("year", f.year);
    if (f.month) params.set("month", f.month);
    if (f.tags.length) params.set("tag", f.tags.join(","));
    var qs = params.toString();
    var newUrl = qs ? location.pathname + "?" + qs : location.pathname;
    history.replaceState(null, "", newUrl);
  }

  // ---------- 从 URL 预填筛选条件 ----------
  function applyUrlParams() {
    var params = new URLSearchParams(location.search);
    if (params.get("q")) elQ.value = params.get("q");
    if (elColumn && params.get("column")) elColumn.value = params.get("column");
    if (params.get("year")) {
      elYear.value = params.get("year");
      syncMonthOptions();
      if (params.get("month")) elMonth.value = params.get("month");
    }
    if (params.get("tag")) {
      var wanted = params.get("tag").split(",").filter(Boolean);
      Array.prototype.forEach.call(
        elTags.querySelectorAll('input[name="tag"]'),
        function (c) {
          if (wanted.indexOf(c.value) !== -1) c.checked = true;
        }
      );
    }
  }

  // ---------- 事件绑定 ----------
  elYear.addEventListener("change", function () {
    syncMonthOptions();
    run();
  });
  elMonth.addEventListener("change", run);
  if (elColumn) elColumn.addEventListener("change", run);

  // 输入框：防抖实时搜索
  var debounceTimer;
  elQ.addEventListener("input", function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(run, 200);
  });

  elTags.addEventListener("change", run);

  // 提交时也跑一次（防止某些浏览器 input 事件未触发）
  elForm.addEventListener("submit", function (e) {
    e.preventDefault();
    run();
  });

  // 重置：原生 reset 清空表单后，需手动联动月份与重渲染
  elReset.addEventListener("click", function () {
    setTimeout(function () {
      syncMonthOptions();
      run();
    }, 0);
  });

  // ---------- 启动 ----------
  loadIndex().then(function () {
    applyUrlParams();
    syncMonthOptions();
    run();
  });
})();
