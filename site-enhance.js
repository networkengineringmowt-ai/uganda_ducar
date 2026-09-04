/* site-enhance.js — generic DOM-based dashboard enhancement layer.
   Adds: conditional formatting, sortable/searchable/paginated tables, CSV export,
   animated KPI counters, toasts, loading skeleton, collapsible cards, chart tooltips
   and legend click-to-toggle. Works on any content already in the DOM regardless of
   how it was rendered (vanilla JS string templates or a built React bundle). */
(function () {
  "use strict";
  var PAGE_SIZE = 25;
  var CONDITION_WORDS = { good: "good", fair: "fair", poor: "poor", critical: "critical", severe: "critical", failed: "critical" };
  var ROAD_CLASS_WORDS = { national: "national", trunk: "national", district: "district", urban: "urban", community: "community", earth: "earth", "feeder": "community" };
  var MISSING_VALUES = { "": 1, "-": 1, "--": 1, "n/a": 1, "na": 1, "null": 1, "undefined": 1, "none": 1 };

  /* ================= Toasts ================= */
  var toastStack;
  function initToasts() {
    toastStack = document.getElementById("se-toast-stack");
    if (!toastStack) {
      toastStack = document.createElement("div");
      toastStack.id = "se-toast-stack";
      document.body.appendChild(toastStack);
    }
  }
  function seToast(message, type) {
    if (!toastStack) initToasts();
    var el = document.createElement("div");
    el.className = "se-toast se-" + (type || "success");
    el.textContent = message;
    toastStack.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("se-in"); });
    setTimeout(function () {
      el.classList.remove("se-in");
      setTimeout(function () { el.remove(); }, 250);
    }, 3200);
  }
  window.seToast = seToast;

  /* ================= Skeleton ================= */
  function initSkeleton() {
    if (document.getElementById("se-skeleton-overlay")) return;
    // Don't stack a second loading overlay on top of a page's own loader
    // (exhaustive.js shows its own "studio-loading" state while its gzipped
    // datasets stream in, which can take several seconds).
    if (document.getElementById("loading") || document.querySelector('[class*="loading"]')) return;
    var overlay = document.createElement("div");
    overlay.id = "se-skeleton-overlay";
    overlay.innerHTML =
      '<div class="se-skel-kpis">' +
        '<div class="se-skel-row"></div><div class="se-skel-row"></div><div class="se-skel-row"></div><div class="se-skel-row"></div>' +
      '</div>' +
      '<div class="se-skel-table">' +
        Array(9).fill('<div class="se-skel-row"></div>').join("") +
      '</div>';
    document.body.appendChild(overlay);
    var dismissed = false;
    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      overlay.classList.add("se-hidden");
      setTimeout(function () { overlay.remove(); }, 400);
    }
    setTimeout(dismiss, 5000);
    window.__seDismissSkeleton = dismiss;
  }

  /* ================= Helpers ================= */
  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }
  function parseNumber(text) {
    if (text == null) return NaN;
    var m = String(text).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  }
  function normalize(text) {
    return String(text == null ? "" : text).trim().toLowerCase();
  }
  function quantiles(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    function q(p) {
      if (!sorted.length) return 0;
      var idx = (sorted.length - 1) * p;
      var lo = Math.floor(idx), hi = Math.ceil(idx);
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
    }
    return { q25: q(.25), q50: q(.5), q75: q(.5 + .25) };
  }

  /* ================= Conditional formatting ================= */
  function applyCellFormatting(table) {
    var headerCells = table.querySelectorAll("thead th, tr:first-child th");
    var headers = [];
    headerCells.forEach(function (th) { headers.push(normalize(th.textContent)); });
    var isAadtCol = headers.map(function (h) { return /aadt|traffic\s*volume|vehicles?\s*\/?\s*day/.test(h); });

    // Collect numeric values per AADT-like column first for quantile thresholds.
    var colValues = {};
    var bodyRows = table.querySelectorAll("tbody tr");
    bodyRows.forEach(function (row) {
      row.querySelectorAll("td").forEach(function (td, idx) {
        if (isAadtCol[idx]) {
          var n = parseNumber(td.textContent);
          if (!isNaN(n)) (colValues[idx] = colValues[idx] || []).push(n);
        }
      });
    });
    var colQuantiles = {};
    Object.keys(colValues).forEach(function (idx) { colQuantiles[idx] = quantiles(colValues[idx]); });

    bodyRows.forEach(function (row) {
      row.querySelectorAll("td").forEach(function (td, idx) {
        if (td.hasAttribute("data-se-fmt")) return;
        td.setAttribute("data-se-fmt", "1");
        var raw = td.textContent;
        var norm = normalize(raw);

        // Missing value
        if (MISSING_VALUES[norm]) {
          td.classList.add("se-missing");
          td.textContent = "—";
          return;
        }

        // Condition words (Good/Fair/Poor/Critical)
        var condKey = Object.keys(CONDITION_WORDS).find(function (w) { return norm === w || norm.indexOf(w) !== -1 && norm.length < w.length + 4; });
        if (condKey) {
          td.classList.add("se-cond-" + CONDITION_WORDS[condKey]);
        }

        // Road class badge
        var classKey = Object.keys(ROAD_CLASS_WORDS).find(function (w) { return norm === w; });
        if (classKey) {
          var cls = ROAD_CLASS_WORDS[classKey];
          td.innerHTML = '<span class="se-badge se-badge-' + cls + '">' + raw.trim() + "</span>";
        }

        // Percentage
        var pctMatch = raw.match(/^\s*(-?\d+(\.\d+)?)\s*%\s*$/);
        if (pctMatch) {
          var pct = parseFloat(pctMatch[1]);
          td.classList.add(pct > 80 ? "se-pct-good" : pct >= 50 ? "se-pct-fair" : "se-pct-poor");
        }

        // AADT / traffic heat scale
        if (isAadtCol[idx] && colQuantiles[idx]) {
          var n = parseNumber(raw);
          if (!isNaN(n)) {
            var qs = colQuantiles[idx];
            var band = n <= qs.q25 ? "low" : n <= qs.q50 ? "med" : n <= qs.q75 ? "high" : "vhigh";
            td.classList.add("se-heat-" + band);
          }
        }
      });
    });
  }

  /* ================= CSV export ================= */
  function csvEscape(v) {
    var s = String(v == null ? "" : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportTableCsv(table, visibleRowsOnly) {
    var headerCells = table.querySelectorAll("thead th, tr:first-child th");
    var headers = [];
    headerCells.forEach(function (th) { headers.push(csvEscape(th.textContent.trim())); });
    var rows = [];
    table.querySelectorAll("tbody tr").forEach(function (tr) {
      if (visibleRowsOnly && tr.getAttribute("data-se-match") === "0") return;
      var cells = [];
      tr.querySelectorAll("td").forEach(function (td) { cells.push(csvEscape(td.textContent.trim())); });
      rows.push(cells.join(","));
    });
    var csv = headers.join(",") + "\n" + rows.join("\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "table-export-" + rows.length + "-rows.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    seToast(rows.length + " rows exported to CSV", "success");
  }

  /* ================= Sort / search / paginate ================= */
  function enhanceTable(table) {
    if (table.hasAttribute("data-se-table")) return;
    table.setAttribute("data-se-table", "1");
    var wrap = table.closest(".table-wrap") || table.parentElement;

    var toolbar = document.createElement("div");
    toolbar.className = "se-table-toolbar";
    var search = document.createElement("input");
    search.type = "text";
    search.className = "se-table-search";
    search.placeholder = "Search this table…";
    var exportBtn = document.createElement("button");
    exportBtn.type = "button";
    exportBtn.className = "se-table-export";
    exportBtn.textContent = "Export CSV";
    var meta = document.createElement("span");
    meta.className = "se-table-meta";
    toolbar.appendChild(search);
    toolbar.appendChild(meta);
    toolbar.appendChild(exportBtn);
    table.parentNode.insertBefore(toolbar, table);

    var pagination = document.createElement("div");
    pagination.className = "se-pagination";
    var prevBtn = document.createElement("button");
    prevBtn.type = "button"; prevBtn.className = "se-page-btn"; prevBtn.textContent = "‹ Prev";
    var pageInfo = document.createElement("span");
    pageInfo.className = "se-page-info";
    var nextBtn = document.createElement("button");
    nextBtn.type = "button"; nextBtn.className = "se-page-btn"; nextBtn.textContent = "Next ›";
    pagination.appendChild(prevBtn); pagination.appendChild(pageInfo); pagination.appendChild(nextBtn);
    table.parentNode.insertBefore(pagination, table.nextSibling);

    var headerCells = Array.prototype.slice.call(table.querySelectorAll("thead th, tr:first-child th"));
    var bodyRowsAll = Array.prototype.slice.call(table.querySelectorAll("tbody tr"));
    bodyRowsAll.forEach(function (tr) {
      tr.setAttribute("data-se-text", normalize(tr.textContent));
      tr.setAttribute("data-se-match", "1");
    });

    var state = { page: 1, sortIdx: -1, sortDir: 1, query: "" };

    function currentBodyRows() {
      return Array.prototype.slice.call(table.querySelectorAll("tbody tr"));
    }

    function applyFilter() {
      var rows = currentBodyRows();
      var q = state.query;
      rows.forEach(function (tr) {
        var match = !q || (tr.getAttribute("data-se-text") || "").indexOf(q) !== -1;
        tr.setAttribute("data-se-match", match ? "1" : "0");
      });
      state.page = 1;
      render();
    }

    function applySort(idx) {
      var tbody = table.querySelector("tbody");
      if (!tbody) return;
      var rows = currentBodyRows();
      var numeric = rows.every(function (tr) {
        var cell = tr.children[idx];
        if (!cell) return true;
        var t = cell.textContent.trim();
        return t === "" || !isNaN(parseNumber(t)) && /^[\s\d,.\-%$]+$/.test(t);
      });
      rows.sort(function (a, b) {
        var ca = a.children[idx] ? a.children[idx].textContent.trim() : "";
        var cb = b.children[idx] ? b.children[idx].textContent.trim() : "";
        var res;
        if (numeric) {
          res = (parseNumber(ca) || 0) - (parseNumber(cb) || 0);
        } else {
          res = ca.localeCompare(cb, undefined, { numeric: true, sensitivity: "base" });
        }
        return res * state.sortDir;
      });
      rows.forEach(function (tr) { tbody.appendChild(tr); });
      headerCells.forEach(function (th) { th.classList.remove("se-sort-asc", "se-sort-desc"); });
      headerCells[idx].classList.add(state.sortDir === 1 ? "se-sort-asc" : "se-sort-desc");
      render();
    }

    function render() {
      var rows = currentBodyRows().filter(function (tr) { return tr.getAttribute("data-se-match") !== "0"; });
      var totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      if (state.page > totalPages) state.page = totalPages;
      var start = (state.page - 1) * PAGE_SIZE;
      var end = start + PAGE_SIZE;
      currentBodyRows().forEach(function (tr) { tr.classList.add("se-row-hidden"); });
      rows.slice(start, end).forEach(function (tr) { tr.classList.remove("se-row-hidden"); });
      pageInfo.textContent = rows.length === 0 ? "No matching rows" :
        "Page " + state.page + " / " + totalPages + " · " + rows.length + " rows";
      prevBtn.disabled = state.page <= 1;
      nextBtn.disabled = state.page >= totalPages;
      meta.textContent = rows.length + " of " + currentBodyRows().length + " rows";
    }

    search.addEventListener("input", debounce(function () {
      state.query = normalize(search.value);
      applyFilter();
      if (state.query) seToast("Filtered to " + table.querySelectorAll('tbody tr[data-se-match="1"]').length + " matching rows", "success");
    }, 350));

    headerCells.forEach(function (th, idx) {
      th.classList.add("se-sortable");
      th.addEventListener("click", function () {
        state.sortDir = state.sortIdx === idx ? -state.sortDir : 1;
        state.sortIdx = idx;
        applySort(idx);
      });
    });

    prevBtn.addEventListener("click", function () { if (state.page > 1) { state.page--; render(); } });
    nextBtn.addEventListener("click", function () { state.page++; render(); });
    exportBtn.addEventListener("click", function () { exportTableCsv(table, true); });

    applyCellFormatting(table);
    render();
  }

  /* ================= Searchable select combobox ================= */
  // Converts any native <select> (however it was rendered — hand-written
  // template or a pre-built React bundle) into a type-to-filter combobox,
  // while leaving the underlying <select>'s value/change-event contract
  // untouched so existing wiring (onChange handlers, read of .value) keeps
  // working with zero changes elsewhere.
  function enhanceSelect(select) {
    if (select.hasAttribute("data-se-select")) return;
    if (select.multiple) return;
    select.setAttribute("data-se-select", "1");

    var wrap = document.createElement("span");
    wrap.className = "se-select-wrap";
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add("se-select-native");

    var input = document.createElement("input");
    input.type = "text";
    input.className = "se-select-input";
    input.setAttribute("autocomplete", "off");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    input.placeholder = "Type to search…";
    wrap.appendChild(input);

    var list = document.createElement("div");
    list.className = "se-select-list";
    list.hidden = true;
    wrap.appendChild(list);

    function optionsList() {
      return Array.prototype.slice.call(select.options);
    }
    function syncInputFromSelect() {
      var opt = select.options[select.selectedIndex];
      input.value = opt ? opt.textContent : "";
    }
    function chooseOption(opt) {
      select.value = opt.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      syncInputFromSelect();
      closeList();
    }
    function buildList(filterText) {
      var q = normalize(filterText || "");
      list.innerHTML = "";
      var any = false;
      optionsList().forEach(function (opt) {
        if (q && normalize(opt.textContent).indexOf(q) === -1) return;
        any = true;
        var item = document.createElement("div");
        item.className = "se-select-option" + (opt.selected ? " se-selected" : "");
        item.textContent = opt.textContent;
        item.addEventListener("mousedown", function (e) {
          e.preventDefault();
          chooseOption(opt);
        });
        list.appendChild(item);
      });
      if (!any) {
        var empty = document.createElement("div");
        empty.className = "se-select-empty";
        empty.textContent = "No matches";
        list.appendChild(empty);
      }
    }
    function openList() {
      buildList("");
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }
    function closeList() {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
    }
    input.addEventListener("focus", function () {
      input.select();
      openList();
    });
    input.addEventListener("input", function () {
      buildList(input.value);
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    });
    input.addEventListener("blur", function () {
      setTimeout(function () {
        syncInputFromSelect();
        closeList();
      }, 120);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        syncInputFromSelect();
        closeList();
      } else if (e.key === "Enter") {
        var first = list.querySelector(".se-select-option");
        if (!list.hidden && first) {
          e.preventDefault();
          first.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        }
      } else if (e.key === "ArrowDown" && list.hidden) {
        openList();
      }
    });
    select.addEventListener("change", syncInputFromSelect);
    syncInputFromSelect();
  }

  /* ================= KPI cards ================= */
  var KPI_SELECTOR = ".metric-card, .stat-box, [class*='kpi-card'], [class*='stat-card'], [class*='stat-item']";
  function enhanceKpiCard(card) {
    if (card.hasAttribute("data-se-kpi")) return;
    card.setAttribute("data-se-kpi", "1");
    var valueEl = card.querySelector("strong, b, .val, [class*='value'], [class*='-val'], [class*='figure'], [class*='number']");
    if (!valueEl) return;
    var raw = valueEl.textContent.trim();
    var num = parseNumber(raw);
    if (isNaN(num)) return;
    var prefix = raw.slice(0, raw.search(/-?[\d,.]/));
    var suffixMatch = raw.match(/[\d,.]+(.*)$/);
    var suffix = suffixMatch ? suffixMatch[1] : "";
    var decimals = (raw.split(".")[1] || "").replace(/[^\d]/g, "").length;
    var hasCommas = /,/.test(raw);

    if (/%$/.test(raw.trim())) {
      card.classList.add(num > 80 ? "se-kpi-good" : num >= 50 ? "se-kpi-warn" : "se-kpi-bad");
    }

    valueEl.classList.add("se-counting");
    var duration = 1200, startTime = null;
    function fmt(n) {
      var v = decimals ? n.toFixed(decimals) : Math.round(n).toString();
      if (hasCommas) {
        var parts = v.split(".");
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        v = parts.join(".");
      }
      return prefix + v + suffix;
    }
    function step(ts) {
      if (!startTime) startTime = ts;
      var progress = Math.min(1, (ts - startTime) / duration);
      var eased = 1 - Math.pow(1 - progress, 3);
      valueEl.textContent = fmt(num * eased);
      if (progress < 1) requestAnimationFrame(step);
      else valueEl.textContent = raw;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          requestAnimationFrame(step);
          observer.disconnect();
        }
      });
    });
    observer.observe(card);
  }

  /* ================= Collapsible cards ================= */
  // .metric-grid deliberately excluded: it's a bare row of headline KPI
  // tiles with no heading, so a generic "Collapse" control would just
  // dangle among the stat tiles and let a viewer hide top-line numbers —
  // the opposite of "always show the length affected for every statistic".
  var COLLAPSIBLE_SELECTOR = ".chart-card, .dynamic-chart-card, .schema-card";
  function enhanceCollapsible(card) {
    if (card.hasAttribute("data-se-collapse")) return;
    if (card.children.length < 1) return;
    card.setAttribute("data-se-collapse", "1");
    var heading = card.querySelector("h3, h4") || (card.classList.contains("metric-grid") ? null : null);
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "se-collapse-toggle";
    toggle.textContent = "Collapse";
    var body = document.createElement("div");
    body.className = "se-collapsible-body";
    while (card.firstChild) { body.appendChild(card.firstChild); }
    if (heading && body.contains(heading)) {
      card.appendChild(heading);
      var head = document.createElement("div");
      head.className = "se-collapse-head";
      head.appendChild(toggle);
      card.insertBefore(head, card.firstChild);
      head.insertBefore(heading, toggle);
    } else {
      card.appendChild(toggle);
    }
    card.appendChild(body);
    toggle.addEventListener("click", function () {
      var collapsed = body.classList.toggle("se-collapsed-body");
      toggle.classList.toggle("se-collapsed", collapsed);
      toggle.textContent = collapsed ? "Expand" : "Collapse";
    });
  }

  /* ================= Chart tooltip ================= */
  var tooltipEl;
  function initChartTooltip() {
    tooltipEl = document.createElement("div");
    tooltipEl.id = "se-chart-tooltip";
    document.body.appendChild(tooltipEl);
    document.addEventListener("mousemove", function (e) {
      var target = e.target.closest && e.target.closest("[title]");
      var inChart = target && target.closest(".chart-card, .dynamic-chart-card, .radial-layout, .stacked-layout, .advanced-viz, .radar-layout, .clustered-wrap, .treemap-viz, .gauge-grid, .ranked-matrix, .funnel-chart");
      if (inChart && target.getAttribute("title")) {
        tooltipEl.textContent = target.getAttribute("title");
        tooltipEl.style.left = (e.clientX + 14) + "px";
        tooltipEl.style.top = (e.clientY + 14) + "px";
        tooltipEl.classList.add("se-show");
        target.setAttribute("data-se-title", target.getAttribute("title"));
        target.removeAttribute("title");
      } else if (tooltipEl.classList.contains("se-show")) {
        var stillOver = e.target.closest && e.target.closest("[data-se-title]");
        if (!stillOver) {
          tooltipEl.classList.remove("se-show");
          document.querySelectorAll("[data-se-title]").forEach(function (el) {
            if (!el.contains(e.target)) { el.setAttribute("title", el.getAttribute("data-se-title")); el.removeAttribute("data-se-title"); }
          });
        }
      }
    });
  }

  /* ================= Legend click-to-toggle ================= */
  function enhanceLegend(legend) {
    if (legend.hasAttribute("data-se-legend")) return;
    legend.setAttribute("data-se-legend", "1");
    var wrap = legend.closest(".radial-layout, .stacked-layout, .advanced-viz, .radar-layout");
    if (!wrap) return;
    var items = Array.prototype.slice.call(legend.children);
    var isRadial = !!wrap.querySelector(".radial-chart");
    var radialEl = wrap.querySelector(".radial-chart");
    var origGradient = radialEl ? radialEl.style.background : null;
    var targets = wrap.querySelector(".stacked-column") ?
      Array.prototype.slice.call(wrap.querySelectorAll(".stacked-column > i")) :
      Array.prototype.slice.call(wrap.querySelectorAll("svg circle, svg rect[fill]")).filter(function (el) {
        return el.getAttribute("fill") && el.getAttribute("fill") !== "none";
      });

    items.forEach(function (item, idx) {
      item.addEventListener("click", function () {
        var off = item.classList.toggle("se-legend-off");
        if (targets[idx]) targets[idx].classList.toggle("se-dim", off);
        if (isRadial && radialEl) {
          var visible = items.map(function (it, i) { return !it.classList.contains("se-legend-off") ? i : -1; }).filter(function (i) { return i !== -1; });
          if (visible.length === items.length) {
            radialEl.style.background = origGradient;
          } else if (visible.length === 0) {
            radialEl.style.background = "#303034";
          } else {
            var small = legend.querySelectorAll(":scope > span > small");
            var vals = [];
            small.forEach(function (s, i) {
              var n = parseNumber(s.textContent);
              vals.push(isNaN(n) ? 0 : n);
            });
            var total = visible.reduce(function (s, i) { return s + vals[i]; }, 0) || 1;
            var cursor = 0, stops = [];
            var swatches = legend.querySelectorAll(":scope > span > i");
            visible.forEach(function (i) {
              var color = swatches[i] ? swatches[i].style.background : "#0a84ff";
              var start = cursor;
              cursor += vals[i] / total * 360;
              stops.push(color + " " + start + "deg " + cursor + "deg");
            });
            radialEl.style.background = "conic-gradient(" + stops.join(",") + ")";
          }
        }
        seToast((off ? "Hidden" : "Shown") + ": " + item.querySelector("b").textContent, "success");
      });
    });
  }

  /* ================= Driver ================= */
  function runPass() {
    // .data-table (and anything already using our own toolbar) is exhaustive.js's
    // own territory — it already has its own sort/search/CSV/virtualized-load
    // handling there, so we leave those alone and only pick up tables nothing
    // else has touched (chiefly the pre-built dashboard bundle's own tables).
    document.querySelectorAll("table:not([data-se-table]):not(.data-table)").forEach(function (t) {
      // skip trivial 0/1-row tables and tables already inside our own toolbar/pagination
      if (t.querySelector("tbody tr")) enhanceTable(t);
    });
    document.querySelectorAll("select:not([data-se-select])").forEach(enhanceSelect);
    document.querySelectorAll(KPI_SELECTOR + ":not([data-se-kpi])").forEach(enhanceKpiCard);
    document.querySelectorAll(COLLAPSIBLE_SELECTOR + ":not([data-se-collapse])").forEach(enhanceCollapsible);
    document.querySelectorAll(".dynamic-legend:not([data-se-legend])").forEach(enhanceLegend);
    if (window.__seDismissSkeleton) window.__seDismissSkeleton();
  }

  function init() {
    initToasts();
    initSkeleton();
    initChartTooltip();
    runPass();
    var scheduled = false;
    var observer = new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      setTimeout(function () {
        scheduled = false;
        runPass();
      }, 60);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
