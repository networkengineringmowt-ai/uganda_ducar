import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const baseUrl = process.env.DUCAR_QA_URL || "http://127.0.0.1:8136/";
const output = new URL("../data/modern_ui_qa_2026.json", import.meta.url);
const routes = [
  { name: "dashboard", hash: "ducar:dashboard", width: 1440, height: 980 },
  { name: "records", hash: "traffic:records", width: 1440, height: 980 },
  { name: "map", hash: "ducar:map", width: 1440, height: 980 },
  { name: "mobile-dashboard", hash: "ducar:dashboard", width: 430, height: 932 },
  { name: "mobile-map", hash: "ducar:map", width: 430, height: 932 },
];

const browser = await chromium.launch({ headless: true });
const results = [];

for (const route of routes) {
  const page = await browser.newPage({ viewport: { width: route.width, height: route.height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${baseUrl}?qa=modern-ui#${route.hash}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForSelector("#exhaustive-root .section-studio", { timeout: 45_000 });
  await page.waitForTimeout(route.hash.endsWith(":map") ? 2_000 : 1_000);

  const audit = await page.evaluate(() => {
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const px = element => Number.parseFloat(getComputedStyle(element).fontSize) || 0;
    const groups = {
      sectionTabs: [...document.querySelectorAll("#exhaustive-root .section-tab")],
      navigation: [...document.querySelectorAll("#root .nav-rail-label")],
      headings: [...document.querySelectorAll("#exhaustive-root h1,#exhaustive-root h2,#exhaustive-root h3")],
      controls: [...document.querySelectorAll("#exhaustive-root button,#exhaustive-root input,#exhaustive-root select")]
        .filter(element => (element.textContent.trim() || element.matches("input,select")) && !element.matches(".basemap-stack-button")),
      tableCells: [...document.querySelectorAll("#exhaustive-root .data-table th,#exhaustive-root .data-table td")].slice(0, 250),
      mapCatalogue: [...document.querySelectorAll("#exhaustive-root .map-catalogue label,#exhaustive-root .map-catalogue p,#exhaustive-root .map-catalogue span")],
    };
    const minimums = innerWidth <= 520
      ? { sectionTabs: 11, navigation: 9.5, headings: 15, controls: 10.5, tableCells: 10, mapCatalogue: 10 }
      : { sectionTabs: 12, navigation: 12, headings: 16, controls: 12, tableCells: 10.5, mapCatalogue: 10.5 };
    const typography = Object.fromEntries(Object.entries(groups).map(([name, elements]) => {
      const sizes = elements.filter(visible).map(px);
      return [name, {
        samples: sizes.length,
        minimum: sizes.length ? Math.min(...sizes) : null,
        required: minimums[name],
        pass: !sizes.length || Math.min(...sizes) >= minimums[name] - 0.05,
        smallest: elements.filter(visible).map(element => ({
          size: px(element),
          tag: element.tagName.toLowerCase(),
          className: String(element.className || "").slice(0, 100),
          text: element.textContent.trim().slice(0, 100),
        })).sort((a, b) => a.size - b.size).slice(0, 5),
      }];
    }));
    const clipped = [...document.querySelectorAll("#root .nav-rail-label,#exhaustive-root .section-tab,#exhaustive-root h1,#exhaustive-root h2,#exhaustive-root h3")]
      .filter(visible)
      .filter(element => element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2)
      .map(element => ({ selector: element.className, text: element.textContent.trim().slice(0, 90) }));
    return {
      viewport: { width: innerWidth, height: innerHeight },
      typography,
      clipped,
      chrome: (() => {
        const brand = document.querySelector("#root .nav-brand");
        const header = document.querySelector("#root .top-nav");
        const brandRect = brand?.getBoundingClientRect();
        const headerRect = header?.getBoundingClientRect();
        return {
          brandText: brand?.textContent.trim() || "",
          brandVisible: Boolean(brandRect && brandRect.width > 0 && brandRect.height > 0),
          brandRect: brandRect ? { x: brandRect.x, y: brandRect.y, width: brandRect.width, height: brandRect.height } : null,
          headerRect: headerRect ? { x: headerRect.x, y: headerRect.y, width: headerRect.width, height: headerRect.height } : null,
        };
      })(),
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    };
  });

  const screenshot = new URL(`../data/modern_ui_${route.name}_2026.png`, import.meta.url);
  await page.screenshot({ path: fileURLToPath(screenshot), fullPage: false });
  results.push({ ...route, ...audit, errors: [...new Set(errors)] });
  await page.close();
}

await browser.close();
const failures = results.flatMap(result => [
  ...Object.entries(result.typography).filter(([, value]) => !value.pass).map(([group, value]) => ({ route: result.name, group, ...value })),
  ...(result.horizontalOverflowPx > 3 ? [{ route: result.name, horizontalOverflowPx: result.horizontalOverflowPx }] : []),
  ...result.errors.map(error => ({ route: result.name, error })),
]);
const report = { auditedAt: new Date().toISOString(), baseUrl, status: failures.length ? "REVIEW" : "PASS", failures, results };
await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ status: report.status, failures, routes: results.map(({ name, typography, clipped, horizontalOverflowPx }) => ({ name, typography, clipped: clipped.length, horizontalOverflowPx })) }, null, 2));
