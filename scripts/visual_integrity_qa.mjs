import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const baseUrl = process.env.DUCAR_QA_URL || "http://127.0.0.1:8136/";
const output = new URL("../data/visual_integrity_qa_2026.json", import.meta.url);
const routes = [
  "ducar:dashboard", "traffic:dashboard", "condition:dashboard", "structures:dashboard",
  "global:dashboard", "socioeconomic:dashboard", "traffic:records", "pims:records",
  "traffic:analytics", "traffic:sql", "traffic:schema", "summaries:map",
];
const viewports = [
  { name: "desktop", width: 1440, height: 980 },
  { name: "mobile", width: 430, height: 932 },
];

const browser = await chromium.launch({ headless: true });
const results = [];
for (const viewport of viewports) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  for (const hash of routes) {
    await page.goto(`${baseUrl}?qa=visual-integrity#${hash}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForSelector("#exhaustive-root .section-studio", { timeout: 45_000 });
    await page.waitForTimeout(hash.endsWith(":map") ? 1_000 : 550);
    const audit = await page.evaluate(() => {
      const root = document.querySelector("#exhaustive-root");
      const visible = element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.05;
      };
      const candidates = [...root.querySelectorAll([
        "h1", "h2", "h3", "h4", "h5", "p", "small", "strong", "em",
        "button", "label", ".section-tab", ".metric-card *", ".chart-card header *",
        ".dynamic-chart-card header *", ".insight-card > *", ".map-catalogue header *",
        ".catalogue-scroll label span", ".catalogue-scroll label em", ".selection-report *",
        ".analytics-intro *", ".analytics-block > header *", ".schema-card > *",
      ].join(","))].filter(visible).filter(element => element.textContent.trim());
      const clipped = candidates.filter(element => {
        if (element.matches(".micro-gauge")) return false;
        const style = getComputedStyle(element);
        const constrained = ["hidden", "clip"].includes(style.overflow) || ["hidden", "clip"].includes(style.overflowX) || ["hidden", "clip"].includes(style.overflowY);
        return constrained && (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2);
      }).map(element => ({
        tag: element.tagName.toLowerCase(),
        className: String(element.className || "").slice(0, 100),
        text: element.textContent.trim().replace(/\s+/g, " ").slice(0, 140),
        client: `${element.clientWidth}x${element.clientHeight}`,
        scroll: `${element.scrollWidth}x${element.scrollHeight}`,
      }));
      const controls = [...root.querySelectorAll("button,input,select,a")].filter(visible);
      const tooSmallControls = controls.filter(element => {
        const rect = element.getBoundingClientRect();
        return (rect.width < 30 || rect.height < 30) && !element.matches(".column-sort,a[href^='#']");
      }).map(element => ({ text: element.textContent.trim().slice(0, 80), className: String(element.className || ""), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
      const emptyHeadings = [...root.querySelectorAll("h1,h2,h3,h4,h5")].filter(visible).filter(element => !element.textContent.trim()).length;
      return {
        clipped,
        tooSmallControls,
        emptyHeadings,
        horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        visibleTextLength: root.innerText.trim().length,
      };
    });
    if (viewport.name === "desktop" && ["condition:dashboard", "global:dashboard", "summaries:map"].includes(hash)) {
      const safeName = hash.replace(":", "-");
      const screenshot = new URL(`../data/visual_integrity_${safeName}_2026.png`, import.meta.url);
      await page.screenshot({ path: fileURLToPath(screenshot), fullPage: false });
    }
    results.push({ viewport: viewport.name, hash, ...audit });
  }
  await page.close();
}
await browser.close();

const failures = results.filter(result => result.clipped.length || result.tooSmallControls.length || result.emptyHeadings || result.horizontalOverflowPx > 3 || result.visibleTextLength < 20);
const report = { auditedAt: new Date().toISOString(), baseUrl, status: failures.length ? "REVIEW" : "PASS", failures, results };
await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ status: report.status, routes: results.length, failures: failures.map(({ viewport, hash, clipped, tooSmallControls, horizontalOverflowPx }) => ({ viewport, hash, clipped: clipped.length, tooSmallControls: tooSmallControls.length, horizontalOverflowPx })) }, null, 2));
