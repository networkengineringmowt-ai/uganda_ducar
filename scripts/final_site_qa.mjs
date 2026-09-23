import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const baseUrl = process.env.DUCAR_QA_URL || "http://127.0.0.1:8135/";
const output = new URL("../data/final_site_qa_2026.json", import.meta.url);
const screenshot = new URL("../data/final_site_qa_2026.png", import.meta.url);
const sections = [
  "ducar", "traffic", "condition", "structures", "pims", "hdm4",
  "global", "socioeconomic", "budgets", "summaries",
];
const tabs = ["dashboard", "map", "records", "analytics", "sql", "schema"];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const checks = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
page.on("console", message => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", error => pageErrors.push(String(error)));
page.on("requestfailed", request => {
  const url = request.url();
  if (!url.includes("tile") && !url.includes("arcgisonline")) {
    failedRequests.push({ url, error: request.failure()?.errorText || "Request failed" });
  }
});

await page.goto(`${baseUrl}?qa=final-complete#ducar:dashboard`, { waitUntil: "domcontentloaded", timeout: 45_000 });
await page.waitForSelector("#exhaustive-root .exhaustive-shell", { timeout: 45_000 });
await page.waitForTimeout(2_000);

for (const section of sections) {
  for (const tab of tabs) {
    await page.evaluate(hash => { window.location.hash = hash; }, `${section}:${tab}`);
    if (tab === "map") {
      await page.waitForSelector("#section-map,.mind-schematic,.platform-mind-svg", { timeout: 12_000 }).catch(() => {});
      await page.waitForTimeout(750);
    } else {
      await page.waitForTimeout(450);
    }
    if (section === "ducar" && tab === "records") {
      await page.waitForSelector("#exhaustive-root .all-records-table", { timeout: 30_000 });
    }
    const result = await page.evaluate(({ section, tab }) => {
      const root = document.querySelector("#exhaustive-root");
      const activeNav = document.querySelector("#root .nav-item.active,#root [aria-current='page']")?.textContent?.trim() || "";
      const activeTab = root?.querySelector(".section-tab.active")?.textContent?.trim() || "";
      const content = root?.querySelector(".section-studio");
      const rect = content?.getBoundingClientRect();
      const doc = document.documentElement;
      const tableWrap = root?.querySelector(".all-records-table");
      const headings = [...(root?.querySelectorAll(".all-records-table thead th") || [])];
      const headingSortControls = headings.filter(th => th.querySelector("button,[data-sort-field]")).length;
      const collapseControls = root?.querySelectorAll("[data-collapse],.collapse-toggle,.card-collapse,.chart-collapse").length || 0;
      const visibleDisabled = [...(root?.querySelectorAll("button:disabled") || [])]
        .filter(button => button.getBoundingClientRect().width > 0 && button.getBoundingClientRect().height > 0)
        .map(button => button.textContent?.trim()).filter(Boolean);
      const map = root?.querySelector("#section-map,.mind-schematic,.platform-mind-svg");
      const mapRect = map?.getBoundingClientRect();
      const ibpRegister = Boolean(root?.querySelector(".ibp-register-section"));
      return {
        section,
        tab,
        hash: window.location.hash,
        activeNav,
        activeTab,
        contentTextLength: content?.innerText?.trim().length || 0,
        contentVisible: Boolean(rect && rect.width > 0 && rect.height > 0),
        documentVerticalScroll: doc.scrollHeight > doc.clientHeight + 2,
        documentHorizontalOverflowPx: Math.max(0, doc.scrollWidth - doc.clientWidth),
        collapseControls,
        visibleDisabled,
        ibpRegister,
        table: tableWrap ? {
          rows: root.querySelectorAll(".all-records-table tbody tr").length,
          columns: headings.length,
          headingSortControls,
          horizontalScrollable: tableWrap.scrollWidth > tableWrap.clientWidth,
          verticalScrollable: tableWrap.scrollHeight > tableWrap.clientHeight,
          overflowX: getComputedStyle(tableWrap).overflowX,
          overflowY: getComputedStyle(tableWrap).overflowY,
        } : null,
        map: map ? {
          visible: Boolean(mapRect && mapRect.width > 300 && mapRect.height > 250),
          leaflet: Boolean(root.querySelector(".leaflet-container")),
          paths: root.querySelectorAll(".leaflet-overlay-pane path,.platform-mind-svg path").length,
        } : null,
      };
    }, { section, tab });
    checks.push(result);
  }
}

await page.evaluate(() => { window.location.hash = "ducar:map"; });
await page.waitForTimeout(2_000);
await page.screenshot({ path: fileURLToPath(screenshot), fullPage: false });

const landing = await page.evaluate(() => {
  const root = document.querySelector("#exhaustive-root");
  const expectedNavigation = new Set(["DUCAR Dashboard", "Traffic", "Condition", "Structures", "PIMS", "HDM-4", "Global", "Socioeconomic Analysis", "Priority Studio", "Admin Tools"]);
  return {
    navItems: [...document.querySelectorAll("#root button,#root a")].map(item => item.textContent.trim()).filter(text => expectedNavigation.has(text)),
    tabs: [...root.querySelectorAll(".section-tabs .section-tab")].map(item => item.textContent.trim()),
    exportButton: document.querySelector("#root .ducar-export-trigger")?.textContent?.trim() || "",
    backButton: Boolean(document.querySelector("#root [data-header-navigation='back']")),
    topButton: Boolean(document.querySelector("#root [data-header-navigation='top']")),
    totalTextPresent: document.body.innerText.includes("248,616.14") || document.body.innerText.includes("248,616.15"),
    nationalTextPresent: document.body.innerText.includes("21,302"),
  };
});

await browser.close();

const routeFailures = checks.filter(check =>
  !check.contentVisible || check.contentTextLength < 20 || check.documentHorizontalOverflowPx > 3 ||
  check.collapseControls > 0 || check.visibleDisabled.length > 0 ||
  (check.ibpRegister && !(check.section === "pims" && check.tab === "records")) ||
  (check.section === "pims" && check.tab === "records" && !check.ibpRegister) ||
  (check.tab === "records" && (!check.table || check.table.rows < 1 || check.table.headingSortControls !== check.table.columns)) ||
  (check.tab === "map" && (!check.map || !check.map.visible))
);
const report = {
  auditedAt: new Date().toISOString(),
  baseUrl,
  routesChecked: checks.length,
  sectionsChecked: sections.length,
  tabsPerSection: tabs.length,
  status: consoleErrors.length || pageErrors.length || failedRequests.length || routeFailures.length ? "REVIEW" : "PASS",
  landing,
  consoleErrors: [...new Set(consoleErrors)],
  pageErrors: [...new Set(pageErrors)],
  failedRequests,
  routeFailures,
  checks,
};
await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify({
  status: report.status,
  routesChecked: report.routesChecked,
  routeFailures: routeFailures.length,
  consoleErrors: report.consoleErrors.length,
  pageErrors: report.pageErrors.length,
  failedRequests: report.failedRequests.length,
  landing,
}, null, 2));
