import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const baseUrl = process.env.DUCAR_QA_URL || "http://127.0.0.1:8136/";
const output = new URL("../data/trend_line_qa_2026.json", import.meta.url);
const browser = await chromium.launch({ headless: true });
const results = [];

for (const viewport of [{ name: "desktop", width: 1440, height: 980 }, { name: "mobile", width: 430, height: 932 }]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(`${baseUrl}?qa=trend-lines#ducar:dashboard`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForSelector(".category-profile-chart,.composed-chart,.micro-sparkline", { timeout: 45_000 });
  await page.waitForTimeout(1_000);
  const audit = await page.evaluate(() => {
    const profiles = [...document.querySelectorAll(".category-profile-chart")];
    const composed = [...document.querySelectorAll(".composed-chart")];
    const micro = [...document.querySelectorAll(".micro-sparkline")];
    const visible = element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(element).display !== "none";
    };
    return {
      profiles: profiles.length,
      composed: composed.length,
      micro: micro.length,
      profileFailures: profiles.filter(visible).map((chart, index) => ({
        index,
        points: chart.querySelectorAll(".category-profile-point").length,
        labels: chart.querySelectorAll(".category-profile-label").length,
        yTicks: chart.querySelectorAll(".chart-tick").length,
        lineStroke: getComputedStyle(chart.querySelector(".category-profile-line")).stroke,
        scrollContained: chart.closest(".category-profile-scroll").scrollWidth >= chart.closest(".category-profile-scroll").clientWidth,
      })).filter(item => item.points < 2 || item.labels !== item.points || item.yTicks !== 5 || item.lineStroke === "rgb(255, 255, 255)"),
      composedFailures: composed.filter(visible).map((chart, index) => ({
        index,
        bars: chart.querySelectorAll("rect").length,
        labels: chart.querySelectorAll(".composed-category-label").length,
        cumulativePoints: chart.querySelectorAll(".cumulative-point").length,
        cumulativeTicks: chart.querySelectorAll(".cumulative-tick").length,
        lineStroke: getComputedStyle(chart.querySelector(".cumulative-line")).stroke,
      })).filter(item => item.bars < 2 || item.labels !== item.bars || item.cumulativePoints !== item.bars || item.cumulativeTicks !== 5 || item.lineStroke === "rgb(255, 255, 255)"),
      microFailures: micro.filter(visible).map((chart, index) => ({
        index,
        points: chart.querySelectorAll("circle").length,
        labels: [...chart.querySelectorAll("text")].map(item => item.textContent.trim()),
      })).filter(item => item.points !== 2 || !["100%", "50%", "0%", "Average", "Value"].every(label => item.labels.includes(label))),
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    };
  });
  results.push({ viewport: viewport.name, ...audit });
  if (viewport.name === "desktop") {
    for (const [selector, file] of [[".category-profile-chart", "trend_category_profile_2026.png"], [".composed-chart", "trend_cumulative_profile_2026.png"], [".micro-sparkline", "trend_micro_comparison_2026.png"]]) {
      const element = page.locator(selector).first();
      await element.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await element.locator("xpath=ancestor::*[contains(@class,'dynamic-chart-card') or contains(@class,'insight-card')][1]").screenshot({ path: fileURLToPath(new URL(`../data/${file}`, import.meta.url)) }).catch(async () => {
        await element.screenshot({ path: fileURLToPath(new URL(`../data/${file}`, import.meta.url)) });
      });
    }
  }
  await page.close();
}
await browser.close();
const failures = results.filter(result => result.profileFailures.length || result.composedFailures.length || result.microFailures.length || result.horizontalOverflowPx > 3);
const report = { auditedAt: new Date().toISOString(), baseUrl, status: failures.length ? "REVIEW" : "PASS", failures, results };
await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ status: report.status, failures, results }, null, 2));
