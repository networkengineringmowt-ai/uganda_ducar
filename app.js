const DATA = "./data/";
const PAGE_SIZE = 50;
const state = { links: [], filtered: [], adminRaw: [], adminRows: [], summary: null, page: 1, map: null, layer: null, linkById: new Map() };
const $ = (id) => document.getElementById(id);
const fmt = (v, d = 0) => Number(v || 0).toLocaleString("en-UG", { maximumFractionDigits: d });
const km = (v) => `${fmt(v, 2)} km`;
const value = (v, suffix = "") => v === null || v === undefined || v === "" ? "Not supplied" : `${fmt(v, 1)}${suffix}`;
const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
const title = (v) => String(v || "Unclassified").toLowerCase().replace(/(^|\s)\S/g, (s) => s.toUpperCase());

async function json(name) {
  const response = await fetch(`${DATA}${name}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json();
}

function switchView(view) {
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === view));
  document.querySelectorAll(".tab").forEach((el) => el.classList.toggle("active", el.dataset.view === view));
  history.replaceState(null, "", `#${view}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (view === "overview" && state.map) setTimeout(() => state.map.invalidateSize(), 100);
}

function kpi(label, number, note) {
  return `<div class="kpi"><span>${label}</span><strong>${number}</strong><small>${note}</small></div>`;
}

function aggregate(items, key) {
  const sums = new Map();
  items.forEach((item) => sums.set(item[key] || "Unclassified", (sums.get(item[key] || "Unclassified") || 0) + Number(item.geometry_length_km || 0)));
  return [...sums].sort((a, b) => b[1] - a[1]);
}

function renderBars(id, rows) {
  const max = Math.max(...rows.map((r) => r[1]), 1);
  $(id).innerHTML = rows.map(([name, length], i) => `<div class="bar-row"><span>${esc(title(name))}</span><div class="bar-track"><div class="bar-fill" style="width:${length / max * 100}%;background:${["#1168e8", "#00a68a", "#efb52d", "#d94b51", "#8495a1"][i % 5]}"></div></div><small>${km(length)}</small></div>`).join("");
}

function renderOverview() {
  const q = state.summary.quality;
  const aligned = q.length_quality["Aligned (<=15%)"] || 0;
  $("quality-rate").textContent = `${fmt(aligned / q.mapped_links * 100, 1)}%`;
  $("admin-relations").textContent = fmt(q.admin_intersections);
  $("updated").textContent = `Built ${new Date(q.generated_at).toLocaleString("en-UG", { dateStyle: "medium", timeStyle: "short" })}`;
  $("kpis").innerHTML = [
    kpi("Mapped links", fmt(q.mapped_links), "unique geometry-linked IDs"),
    kpi("Calculated length", km(q.geometry_length_km), "geometry-derived reporting length"),
    kpi("Districts", fmt(q.districts), "with mapped coverage"),
    kpi("Subcounties", fmt(q.subcounties), "spatially related"),
    kpi("Traffic coverage", `${fmt(q.traffic_coverage_pct, 1)}%`, `${fmt(q.traffic_links)} exact registry matches`),
  ].join("");
  renderBars("condition-bars", aggregate(state.links, "condition"));
  renderBars("surface-bars", aggregate(state.links, "surface"));
  $("quality-list").innerHTML = Object.entries(q.length_quality).map(([name, count]) => `<div class="quality-item"><strong>${esc(name)}</strong><div class="bar-track"><div class="bar-fill" style="width:${count / q.mapped_links * 100}%"></div></div><span>${fmt(count)} links</span></div>`).join("");
  $("caveats").innerHTML = q.caveats.map((text) => `<div class="caveat"><p>${esc(text)}</p></div>`).join("");
}

function populateFilters() {
  const add = (id, values) => { $(id).insertAdjacentHTML("beforeend", [...new Set(values.filter(Boolean))].sort().map((v) => `<option value="${esc(v)}">${esc(title(v))}</option>`).join("")); };
  add("district-filter", state.links.map((x) => x.admin_district || x.district));
  add("condition-filter", state.links.map((x) => x.condition));
  add("surface-filter", state.links.map((x) => x.surface));
}

function conditionPill(name) {
  const cls = String(name || "unclassified").toLowerCase();
  return `<span class="pill pill-${["good", "fair", "poor"].includes(cls) ? cls : "unclassified"}">${esc(title(name))}</span>`;
}

function filterLinks() {
  const needle = $("link-search").value.trim().toLowerCase();
  const district = $("district-filter").value;
  const condition = $("condition-filter").value;
  const surface = $("surface-filter").value;
  const traffic = $("traffic-filter").value;
  state.filtered = state.links.filter((x) => {
    const haystack = `${x.link_id} ${x.road_name} ${x.source_code}`.toLowerCase();
    return (!needle || haystack.includes(needle)) && (!district || (x.admin_district || x.district) === district) && (!condition || x.condition === condition) && (!surface || x.surface === surface) && (!traffic || (traffic === "yes") === (x.registry_aadt !== null));
  });
  state.page = 1;
  renderLinks();
}

function renderLinks() {
  const pages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
  state.page = Math.min(state.page, pages);
  const rows = state.filtered.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
  $("link-rows").innerHTML = rows.map((x) => `<tr data-link="${esc(x.link_id)}">
    <td><strong>${esc(x.link_id)}</strong></td>
    <td class="road-cell"><strong>${esc(x.road_name)}</strong><small>${esc(x.source_code)}</small></td>
    <td class="admin-cell"><strong>${esc(title(x.admin_district || x.district))}</strong><small>${esc(title(x.subcounty))} · ${esc(title(x.parish))}</small></td>
    <td><strong>${km(x.geometry_length_km)}</strong><small>${esc(x.length_quality)}</small></td>
    <td>${esc(title(x.surface))}</td><td>${conditionPill(x.condition)}</td>
    <td><strong>${x.registry_aadt == null ? "—" : fmt(x.registry_aadt)}</strong><small>${x.registry_pcu == null ? "Traffic gap" : `${fmt(x.registry_pcu)} PCU`}</small></td>
    <td><div class="priority"><strong>${fmt(x.planning_priority_score, 1)}</strong><i style="--score:${x.planning_priority_score}%"></i></div></td></tr>`).join("");
  $("link-count").textContent = `${fmt(state.filtered.length)} links`;
  $("link-length").textContent = `${km(state.filtered.reduce((a, x) => a + Number(x.geometry_length_km || 0), 0))} calculated length`;
  $("page-label").textContent = `Page ${state.page} of ${pages}`;
  $("prev-page").disabled = state.page <= 1;
  $("next-page").disabled = state.page >= pages;
}

function openLink(id) {
  const x = state.linkById.get(id);
  if (!x) return;
  const details = [
    ["Source code", x.source_code], ["Calculated length", km(x.geometry_length_km)], ["Source length", km(x.source_length_km)], ["Length variance", `${fmt(x.length_variance_pct, 1)}%`],
    ["Surface", title(x.surface)], ["Condition", title(x.condition)], ["AADT", value(x.registry_aadt)], ["PCU", value(x.registry_pcu)],
    ["Speed", value(x.registry_speed_kmh, " km/h")], ["Priority score", value(x.planning_priority_score)], ["District", title(x.admin_district || x.district)], ["County", title(x.county)],
    ["Subcounty", title(x.subcounty)], ["Parish", title(x.parish)], ["Traffic provenance", x.traffic_source], ["Length QA", x.length_quality],
  ];
  $("drawer-content").innerHTML = `<p class="eyebrow">Complete link record</p><span class="id">${esc(x.link_id)}</span><h2>${esc(x.road_name)}</h2>${conditionPill(x.condition)}
    <div class="detail-grid">${details.map(([label, val]) => `<div class="detail"><span>${esc(label)}</span><strong>${esc(val)}</strong></div>`).join("")}</div>
    <p class="eyebrow">Administrative length splits</p><div class="coverage-list">${(x.admin_coverage || []).map((c) => `<div class="coverage-row"><strong>${esc(title(c.parish))}, ${esc(title(c.subcounty))}</strong><small>${esc(title(c.county))} · ${esc(title(c.district))} · ${km(c.length_km)}</small></div>`).join("") || "No polygon intersection supplied"}</div>
    <p class="eyebrow" style="margin-top:25px">Priority basis</p><p>${esc(x.priority_basis)}</p>`;
  $("drawer").classList.add("open");
  $("drawer").setAttribute("aria-hidden", "false");
}

function aggregateAdmin(level) {
  const groups = new Map();
  state.adminRaw.forEach((r) => {
    const key = level === "district" ? r.admin_district : level === "subcounty" ? `${r.admin_district}|${r.county}|${r.subcounty}` : `${r.admin_district}|${r.county}|${r.subcounty}|${r.parish}`;
    if (!groups.has(key)) groups.set(key, { district: r.admin_district, county: level === "district" ? "—" : r.county, subcounty: ["district"].includes(level) ? "—" : r.subcounty, parish: level === "parish" ? r.parish : "—", link_count: 0, covered_length_km: 0 });
    const row = groups.get(key); row.link_count += Number(r.link_count); row.covered_length_km += Number(r.covered_length_km);
  });
  return [...groups.values()].sort((a, b) => b.covered_length_km - a.covered_length_km);
}

function renderAdmin() {
  const level = $("admin-level").value;
  const needle = $("admin-search").value.trim().toLowerCase();
  state.adminRows = aggregateAdmin(level).filter((r) => `${r.district} ${r.county} ${r.subcounty} ${r.parish}`.toLowerCase().includes(needle));
  $("admin-head").innerHTML = `<tr><th>District</th>${level !== "district" ? "<th>County</th><th>Subcounty</th>" : ""}${level === "parish" ? "<th>Parish</th>" : ""}<th>Link relations</th><th>Covered length</th><th>Share</th></tr>`;
  const total = state.adminRows.reduce((a, r) => a + r.covered_length_km, 0);
  $("admin-rows").innerHTML = state.adminRows.map((r) => `<tr><td><strong>${esc(title(r.district))}</strong></td>${level !== "district" ? `<td>${esc(title(r.county))}</td><td>${esc(title(r.subcounty))}</td>` : ""}${level === "parish" ? `<td>${esc(title(r.parish))}</td>` : ""}<td>${fmt(r.link_count)}</td><td><strong>${km(r.covered_length_km)}</strong></td><td>${fmt(r.covered_length_km / Math.max(total, 1) * 100, 2)}%</td></tr>`).join("");
  $("admin-kpis").innerHTML = [kpi("Reporting units", fmt(state.adminRows.length), `${title(level)} level`), kpi("Covered length", km(total), "line/polygon intersections"), kpi("Link relations", fmt(state.adminRows.reduce((a, r) => a + r.link_count, 0)), "not a unique-link count"), kpi("Largest unit", state.adminRows[0] ? title(level === "district" ? state.adminRows[0].district : level === "subcounty" ? state.adminRows[0].subcounty : state.adminRows[0].parish) : "—", state.adminRows[0] ? km(state.adminRows[0].covered_length_km) : "No match")].join("");
}

function csvDownload(filename, rows) {
  if (!rows.length) return toast("No rows to export");
  const keys = Object.keys(rows[0]).filter((k) => k !== "admin_coverage");
  const quote = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const blob = new Blob([[keys.join(","), ...rows.map((r) => keys.map((k) => quote(r[k])).join(","))].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href); toast(`Exported ${fmt(rows.length)} rows`);
}

function toast(message) { $("toast").textContent = message; $("toast").classList.add("show"); setTimeout(() => $("toast").classList.remove("show"), 2200); }

async function initMap() {
  if (!window.L) { $("map-fallback").hidden = false; return; }
  const geo = await json("ducar_link_map.geojson");
  state.map = L.map("map", { zoomControl: true, preferCanvas: true }).setView([1.35, 32.3], 7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap contributors" }).addTo(state.map);
  const colors = { Good: "#00a68a", Fair: "#efb52d", Poor: "#d94b51" };
  state.layer = L.geoJSON(geo, { style: (f) => ({ color: colors[f.properties.condition] || "#8495a1", weight: 2, opacity: .78 }), onEachFeature: (f, layer) => layer.on("click", () => openLink(f.properties.link_id)) }).addTo(state.map);
  state.map.fitBounds(state.layer.getBounds(), { padding: [12, 12] });
}

function bind() {
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
  document.querySelectorAll("[data-open-view]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.openView)));
  ["link-search", "district-filter", "condition-filter", "surface-filter", "traffic-filter"].forEach((id) => $(id).addEventListener(id === "link-search" ? "input" : "change", filterLinks));
  ["admin-search", "admin-level"].forEach((id) => $(id).addEventListener(id === "admin-search" ? "input" : "change", renderAdmin));
  $("prev-page").addEventListener("click", () => { state.page -= 1; renderLinks(); }); $("next-page").addEventListener("click", () => { state.page += 1; renderLinks(); });
  $("link-rows").addEventListener("click", (e) => { const row = e.target.closest("tr[data-link]"); if (row) openLink(row.dataset.link); });
  $("close-drawer").addEventListener("click", () => { $("drawer").classList.remove("open"); $("drawer").setAttribute("aria-hidden", "true"); });
  $("export-links").addEventListener("click", () => csvDownload("ducar_links_filtered.csv", state.filtered));
  $("export-admin").addEventListener("click", () => csvDownload(`ducar_${$("admin-level").value}_coverage.csv`, state.adminRows));
}

async function start() {
  try {
    const [links, summary] = await Promise.all([json("ducar_link_register.json"), json("ducar_link_reporting_summary.json")]);
    state.links = links; state.filtered = [...links]; state.summary = summary; state.adminRaw = summary.administrative_units; state.linkById = new Map(links.map((x) => [x.link_id, x]));
    renderOverview(); populateFilters(); renderLinks(); renderAdmin(); bind();
    const requested = location.hash.slice(1); if (["overview", "links", "admin", "method"].includes(requested)) switchView(requested);
    $("loading").classList.add("hidden");
    initMap().catch((error) => { console.warn("Map layer unavailable", error); $("map-fallback").hidden = false; });
  } catch (error) {
    console.error(error); $("loading").innerHTML = `<strong>Data could not be loaded</strong><small>${esc(error.message)}</small><button class="primary" onclick="location.reload()">Retry</button>`;
  }
}

start();
