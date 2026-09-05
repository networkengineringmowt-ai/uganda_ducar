/* ============================================================
   DUCAR Priority Studio — Apple-style visual refresh (JS pass)
   Handles what CSS alone cannot reach: literal hex `fill`
   attributes set by the chart-rendering code on SVG shapes, and
   the active nav icon color set inline by the preserved bundle.
   Idempotent + MutationObserver-driven so it keeps working across
   tab switches, data reloads and re-renders.
   ============================================================ */
(function () {
  "use strict";

  var COLOR_MAP = {
    "#22c55e": "#30d158", // green    -> systemGreen
    "#16a34a": "#30d158",
    "#84cc16": "#64d2ff", // lime     -> systemTeal-ish (kept distinct from green)
    "#a3e635": "#64d2ff",
    "#eab308": "#ffd60a", // yellow   -> systemYellow
    "#facc15": "#ffd60a",
    "#f97316": "#ff9f0a", // orange   -> systemOrange
    "#fb923c": "#ff9f0a",
    "#ef4444": "#ff453a", // red      -> systemRed
    "#dc2626": "#ff453a",
    "#0ea5e9": "#0a84ff", // sky      -> systemBlue (brand)
    "#38bdf8": "#0a84ff",
    "#8b5cf6": "#bf5af2", // violet   -> systemPurple
    "#a78bfa": "#bf5af2",
    "#ec4899": "#ff375f", // pink     -> systemPink
    "#f472b6": "#ff375f",
    "#06b6d4": "#64d2ff", // cyan     -> systemTeal
    "#eab90a": "#ffd60a"
  };

  function remapAttr(el, attrName) {
    var v = el.getAttribute(attrName);
    if (!v) return;
    var lower = v.toLowerCase();
    var mapped = COLOR_MAP[lower];
    if (mapped && v !== mapped) {
      el.setAttribute(attrName, mapped);
    }
  }

  function pass(root) {
    var scope = root || document;
    var shapes = scope.querySelectorAll ? scope.querySelectorAll("rect, path, circle, polygon, line") : [];
    for (var i = 0; i < shapes.length; i++) {
      remapAttr(shapes[i], "fill");
      remapAttr(shapes[i], "stroke");
    }
    // The preserved bundle sets the active nav icon color inline (black-on-yellow);
    // force it to white so it reads correctly on the new blue-glass selected state.
    var activeIcons = scope.querySelectorAll
      ? scope.querySelectorAll(".nav-rail-item.active .nav-rail-icon-wrap, .nav-rail-item.active svg, .nav-rail-item.active path")
      : [];
    for (var j = 0; j < activeIcons.length; j++) {
      var el = activeIcons[j];
      if (el.style && el.style.color && el.style.color !== "rgb(255, 255, 255)") {
        el.style.color = "#ffffff";
      }
      if (el.tagName === "path" && el.getAttribute("fill") === "#000000") {
        el.setAttribute("fill", "#ffffff");
      }
    }
  }

  function schedule() {
    if (schedule._t) return;
    schedule._t = setTimeout(function () {
      schedule._t = null;
      pass(document);
    }, 60);
  }

  function start() {
    pass(document);
    var mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === "attributes" && (m.attributeName === "fill" || m.attributeName === "stroke")) continue; // avoid self-trigger loops
        schedule();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
