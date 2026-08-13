(function () {
  "use strict";

  const PAGE_SIZE = 100;
  const PATHS = {
    links: "./data/ducar_link_register.json",
    relations: "./data/ducar_link_admin_relations.json",
    global: "./data/global_country_matrix.json",
    database: "./data/ducar_database_catalog.json",
    mindmap: "./data/ducar_site_mind_map.json"
  };
  const COLORS = ["#0a84ff", "#30d158", "#ff9f0a", "#ff375f", "#bf5af2", "#64d2ff", "#ffd60a", "#5e5ce6"];
  const SECTION_TABS = [["dashboard", "Dashboard"], ["records", "Full Exhaustive Table"], ["sql", "SQL Tables"], ["schema", "SQL Schema"]];
  const SECTION_META = {
    overview: ["National DUCAR Overview", "Whole-register coverage, condition, pavement, traffic and planning status."],
    ducar: ["DUCAR Executive Dashboard", "Mapped DUCAR link governance, inventory completeness and planning readiness."],
    network: ["Network & Pavement Structure", "Link geometry, administrative hierarchy, pavement class and length quality."],
    traffic: ["Traffic Intelligence", "Exact-match AADT, PCU and speed reporting for every mapped DUCAR link."],
    condition: ["Road Condition", "Condition, surface risk and intervention requirements for every mapped link."],
    pims: ["PIMS Planning", "Planning priority, intervention pipeline and investment-screening attributes."],
    hdm4: ["HDM-4 Inputs", "Geometry, speed, traffic, pavement and planning-cost inputs prepared for economic analysis."],
    framework: ["Data & Governance Framework", "Record provenance, QA, coverage, hierarchy and modelling-basis controls."],
    budgets: ["Budget & Prioritisation", "Link-level planning allowances, priority bands and intervention allocation."],
    global: ["Global Country Matrix", "All configured countries retained with explicit source-completeness status."],
    summaries: ["Summaries & Admin Tools", "Administrative relations, site topology, SQLite tables and database schema."]
  };
  const LINK_FIELDS = [
    "link_id", "link_id_district", "link_id_standard", "source_code", "road_name", "district", "source_district",
    "admin_district", "county", "subcounty", "parish",
    "surface", "pavement_class", "condition", "source_length_km", "geometry_length_km", "length_variance_pct",
    "length_quality", "registry_speed_kmh", "registry_aadt", "registry_pcu", "traffic_source", "condition_risk",
    "surface_risk", "planning_priority_score", "priority_band", "priority_basis", "recommended_intervention",
    "planning_unit_cost_ugx_km", "planning_cost_ugx", "cost_basis", "record_status", "admin_coverage"
  ];
  const RECORD_FIELDS = {
    overview: LINK_FIELDS,
    ducar: ["link_id", "link_id_district", "source_code", "road_name", "district", "source_district", "admin_district", "county", "subcounty", "parish", "surface", "pavement_class", "condition", "geometry_length_km", "registry_aadt", "planning_priority_score", "priority_band", "recommended_intervention", "record_status"],
    network: ["link_id", "road_name", "surface", "pavement_class", "source_length_km", "geometry_length_km", "length_variance_pct", "length_quality", "district", "admin_district", "county", "subcounty", "parish", "admin_coverage"],
    traffic: ["link_id", "road_name", "registry_aadt", "registry_pcu", "registry_speed_kmh", "traffic_source", "geometry_length_km", "surface", "pavement_class", "condition", "district", "county", "subcounty", "parish", "record_status"],
    condition: ["link_id", "road_name", "condition", "surface", "pavement_class", "condition_risk", "surface_risk", "recommended_intervention", "planning_priority_score", "priority_band", "geometry_length_km", "district", "county", "subcounty", "parish", "length_quality", "record_status"],
    pims: ["link_id", "road_name", "priority_band", "planning_priority_score", "priority_basis", "recommended_intervention", "planning_cost_ugx", "condition", "surface", "pavement_class", "geometry_length_km", "district", "county", "subcounty", "parish", "cost_basis"],
    hdm4: ["link_id", "road_name", "geometry_length_km", "source_length_km", "length_variance_pct", "length_quality", "registry_speed_kmh", "registry_aadt", "registry_pcu", "surface", "pavement_class", "condition", "planning_unit_cost_ugx_km", "planning_cost_ugx", "cost_basis"],
    framework: ["link_id", "link_id_district", "link_id_standard", "source_code", "road_name", "record_status", "traffic_source", "length_quality", "length_variance_pct", "priority_basis", "cost_basis", "admin_district", "county", "subcounty", "parish", "admin_coverage"],
    budgets: ["link_id", "road_name", "priority_band", "planning_priority_score", "recommended_intervention", "planning_cost_ugx", "planning_unit_cost_ugx_km", "cost_basis", "condition", "surface", "pavement_class", "geometry_length_km", "district", "county", "subcounty", "parish"]
  };
  const SECTION_SQL = {
    overview: ["ducar_link_register", "master_road_sections"], ducar: ["ducar_link_register", "master_road_sections"],
    network: ["ducar_link_register", "ducar_link_admin_relations", "admin_unit_distance_matrix"],
    traffic: ["ducar_link_register", "traffic_survey_counts"], condition: ["ducar_link_register", "pms_pavement_condition"],
    pims: ["ducar_link_register", "pms_pavement_condition"], hdm4: ["ducar_link_register", "pms_pavement_condition"],
    framework: ["ducar_link_register", "ducar_link_admin_relations"], budgets: ["ducar_link_register", "pms_pavement_condition"],
    global: ["global_country_matrix"], summaries: ["ducar_link_admin_relations", "admin_unit_distance_matrix", "admin_districts"]
  };
  const cache = {};
  const state = { section: sectionFromHash(), tab: "dashboard", page: 1, search: "", loading: false };
  const root = document.getElementById("exhaustive-root");
  if (!root) return;

  function esc(value) { return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function shown(value) {
    if (value === null || value === undefined || value === "") return "Not supplied";
    if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  }
  function label(value) { return value.replaceAll("_", " "); }
  function sectionFromHash() {
    const id = location.hash.slice(1).toLowerCase().split(":")[0];
    return SECTION_META[id] ? id : "overview";
  }
  function tabFromHash() {
    const id = location.hash.slice(1).toLowerCase().split(":")[1];
    return SECTION_TABS.some(([tab]) => tab === id) ? id : "dashboard";
  }
  function sectionFromTitle(title) {
    const map = { TOP: "overview", "DUCAR Dashboard": "ducar", Network: "network", Traffic: "traffic", Condition: "condition", PIMS: "pims", "HDM-4": "hdm4", Framework: "framework", "Budgets & Prioritization": "budgets", Global: "global", "Summaries & Admin Tools": "summaries" };
    return map[title] || null;
  }
  async function data(key) {
    if (!cache[key]) {
      const response = await fetch(PATHS[key]);
      if (!response.ok) throw new Error("Unable to load " + PATHS[key]);
      cache[key] = await response.json();
    }
    return cache[key];
  }
  async function ensureData() {
    if (["sql", "schema"].includes(state.tab)) return data("database");
    if (state.section === "global") return data("global");
    if (state.section === "summaries") return Promise.all([data("relations"), data("mindmap")]);
    return data("links");
  }
  function number(value, digits = 0) { return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits }); }
  function chartNumber(value, unit) {
    if (unit === "UGX") return "UGX " + new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
    return number(value, unit.includes("km") ? 1 : 0);
  }
  function aggregate(rows, category, metric) {
    const totals = new Map();
    rows.forEach(row => {
      const key = shown(typeof category === "function" ? category(row) : row[category]);
      const amount = metric ? Number(row[metric] || 0) : 1;
      totals.set(key, (totals.get(key) || 0) + amount);
    });
    return [...totals].map(([name, value]) => ({ name, value }));
  }
  function bands(rows, field, definitions) {
    return definitions.map(([name, min, max]) => ({ name, value: rows.filter(row => {
      const value = row[field]; return typeof value === "number" && value >= min && value < max;
    }).length }));
  }
  function sortData(values) { return [...values].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)); }
  function metricCards(items) {
    return `<div class="metric-grid">${items.map(item => `<article class="metric-card"><small>${esc(item.label)}</small><strong>${esc(item.value)}</strong><em>${esc(item.note)}</em></article>`).join("")}</div>`;
  }
  function barChart(title, subtitle, values, unit, color = COLORS[0]) {
    const rows = sortData(values).slice(0, 10);
    const width = 720, left = 190, right = 85, top = 18, rowH = 34, bottom = 42;
    const height = top + Math.max(rows.length, 1) * rowH + bottom;
    const max = Math.max(...rows.map(row => row.value), 1);
    const plotW = width - left - right;
    const ticks = [0, .25, .5, .75, 1];
    const svgTicks = ticks.map(tick => {
      const x = left + plotW * tick;
      return `<line class="chart-gridline" x1="${x}" y1="${top-4}" x2="${x}" y2="${height-bottom+4}"/><text class="chart-tick" x="${x}" y="${height-18}" text-anchor="middle">${esc(chartNumber(max*tick, unit))}</text>`;
    }).join("");
    const bars = rows.map((row, index) => {
      const y = top + index * rowH;
      const barW = Math.max(2, row.value / max * plotW);
      const valueX = Math.min(left + barW + 7, width - right + 4);
      return `<text class="chart-label" x="${left-10}" y="${y+18}" text-anchor="end">${esc(row.name.length > 27 ? row.name.slice(0,26)+"…" : row.name)}</text><rect class="chart-bar" x="${left}" y="${y+5}" width="${barW}" height="19" rx="4" fill="${color}"/><text class="chart-value" x="${valueX}" y="${y+19}">${esc(chartNumber(row.value, unit))}</text>`;
    }).join("");
    return `<article class="chart-card"><h3>${esc(title)}</h3><p class="chart-subtitle">${esc(subtitle)}</p><svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}"><line class="chart-axis" x1="${left}" y1="${height-bottom+4}" x2="${width-right}" y2="${height-bottom+4}"/>${svgTicks}${bars}</svg><div class="axis-title">Horizontal axis · ${esc(unit)}</div><div class="chart-legend"><span class="legend-key"><i class="legend-swatch" style="background:${color}"></i>${esc(unit)}</span><span class="legend-key">■ Bar mark</span><span class="legend-key">│ Major tick</span><span class="legend-key">— Grid key</span></div></article>`;
  }
  function matrix(rows) {
    const conditions = ["Good", "Fair", "Poor", "Unclassified", "Not supplied"];
    const pavements = ["Paved", "Unpaved", "Not supplied"];
    const cells = conditions.map(condition => pavements.map(pavement => rows.filter(row => shown(row.condition) === condition && shown(row.pavement_class) === pavement).length));
    return `<article class="matrix-card"><h3>Condition × pavement classification matrix</h3><p>Complete link count cross-tabulation. Gravel/Earth = Unpaved; Bituminous/Concrete = Paved.</p><div class="matrix-grid" style="grid-template-columns:170px repeat(3,minmax(105px,1fr))"><div class="matrix-cell head">Condition</div>${pavements.map(x => `<div class="matrix-cell head">${x}</div>`).join("")}${conditions.map((condition,i) => `<div class="matrix-cell row-head">${condition}</div>${cells[i].map(value => `<div class="matrix-cell">${number(value)} links</div>`).join("")}`).join("")}</div><div class="chart-legend"><span class="legend-key"><i class="legend-swatch" style="background:#30d158"></i>Paved: Bituminous + Concrete</span><span class="legend-key"><i class="legend-swatch" style="background:#ff9f0a"></i>Unpaved: Gravel + Earth</span></div></article>`;
  }
  function linkDashboard(rows) {
    const measured = rows.filter(row => typeof row.registry_aadt === "number").length;
    const totalKm = rows.reduce((sum, row) => sum + Number(row.geometry_length_km || 0), 0);
    const cost = rows.reduce((sum, row) => sum + Number(row.planning_cost_ugx || 0), 0);
    const observed = rows.filter(row => typeof row.registry_aadt === "number");
    const sumWhere = (field, value, metric) => rows.filter(row => shown(row[field]) === value).reduce((sum,row)=>sum+Number(row[metric]||0),0);
    let baseMetrics;
    if (state.section === "network") baseMetrics = [
      {label:"Paved length",value:number(sumWhere("pavement_class","Paved","geometry_length_km"),1)+" km",note:"Bituminous + Concrete"},
      {label:"Unpaved length",value:number(sumWhere("pavement_class","Unpaved","geometry_length_km"),1)+" km",note:"Gravel + Earth"},
      {label:"District assignments",value:number(new Set(rows.map(r=>shown(r.admin_district))).size),note:"Complete hierarchy population"},
      {label:"Length QA aligned",value:number(rows.filter(r=>shown(r.length_quality).startsWith("Aligned")).length),note:"Within 15% variance"}
    ]; else if (state.section === "traffic") baseMetrics = [
      {label:"Traffic observations",value:number(measured),note:number(measured/rows.length*100,1)+"% exact-match coverage"},
      {label:"Traffic not supplied",value:number(rows.length-measured),note:"Retained in exhaustive table"},
      {label:"Mean supplied AADT",value:number(observed.reduce((s,r)=>s+Number(r.registry_aadt),0)/Math.max(observed.length,1),0),note:"Measured links only"},
      {label:"Mean supplied speed",value:number(observed.reduce((s,r)=>s+Number(r.registry_speed_kmh||0),0)/Math.max(observed.length,1),1)+" km/h",note:"Measured links only"}
    ]; else if (state.section === "condition") baseMetrics = ["Good","Fair","Poor","Unclassified"].map(name=>({label:name+" links",value:number(rows.filter(r=>shown(r.condition)===name).length),note:number(sumWhere("condition",name,"geometry_length_km"),1)+" geometry km"}));
    else if (state.section === "pims") baseMetrics = ["Critical","High","Moderate","Low"].map(name=>({label:name+" priority",value:number(rows.filter(r=>shown(r.priority_band)===name).length),note:"Complete screened population"}));
    else if (state.section === "hdm4") baseMetrics = [
      {label:"Model links",value:number(rows.length),note:"No link selected out"},{label:"Traffic inputs",value:number(measured),note:"Exact source matches"},
      {label:"Geometry length",value:number(totalKm,1)+" km",note:"EPSG:32636 measured"},{label:"Aligned lengths",value:number(rows.filter(r=>shown(r.length_quality).startsWith("Aligned")).length),note:"Input calibration QA"}
    ]; else if (state.section === "framework") baseMetrics = [
      {label:"Registered links",value:number(rows.length),note:"Deterministic link IDs"},{label:"Exact traffic provenance",value:number(measured),note:"No traffic estimation"},
      {label:"Parish assignments",value:number(rows.filter(r=>shown(r.parish)!=="Not supplied").length),note:"Supplied hierarchy"},{label:"Aligned geometry QA",value:number(rows.filter(r=>shown(r.length_quality).startsWith("Aligned")).length),note:"Within 15%"}
    ]; else if (state.section === "budgets") baseMetrics = [
      {label:"Total planning allowance",value:"UGX "+number(cost/1e12,2)+"T",note:"Not a BOQ"},{label:"Critical-band allowance",value:"UGX "+number(sumWhere("priority_band","Critical","planning_cost_ugx")/1e9,1)+"B",note:"All critical links"},
      {label:"Intervention types",value:number(new Set(rows.map(r=>r.recommended_intervention)).size),note:"Complete treatment set"},{label:"Mean allowance per link",value:"UGX "+number(cost/rows.length/1e6,1)+"M",note:"Modelled mean"}
    ]; else if (state.section === "ducar") baseMetrics = [
      {label:"DUCAR links",value:number(rows.length),note:"Every mapped geometry"},{label:"DUCAR geometry",value:number(totalKm,1)+" km",note:"Measured reporting length"},
      {label:"Administrative districts",value:number(new Set(rows.map(r=>shown(r.admin_district))).size),note:"Link hierarchy"},{label:"Intervention classes",value:number(new Set(rows.map(r=>r.recommended_intervention)).size),note:"Planning actions"}
    ]; else baseMetrics = [
      { label: "Mapped links", value: number(rows.length), note: "Every available geometry" },
      { label: "Geometry length", value: number(totalKm, 1) + " km", note: "EPSG:32636 measured" },
      { label: "Traffic observations", value: number(measured), note: number(measured / rows.length * 100, 1) + "% exact-match coverage" },
      { label: "Planning allowance", value: "UGX " + number(cost / 1e12, 2) + "T", note: "Modelled—not a BOQ" }
    ];
    const charts = [];
    if (state.section === "overview") {
      charts.push(barChart("Condition distribution", "All links grouped by supplied condition.", aggregate(rows, "condition"), "link count", COLORS[1]));
      charts.push(barChart("Paved and unpaved network", "Bituminous/Concrete are Paved; Gravel/Earth are Unpaved.", aggregate(rows, "pavement_class", "geometry_length_km"), "geometry km", COLORS[2]));
      charts.push(barChart("Planning priority bands", "All links grouped by the derived planning score band.", aggregate(rows, "priority_band"), "link count", COLORS[4]));
      charts.push(barChart("Traffic source availability", "Exact source-code match versus explicitly unavailable traffic.", aggregate(rows, row => typeof row.registry_aadt === "number" ? "Exact-match supplied" : "Not supplied"), "link count", COLORS[5]));
    } else if (state.section === "ducar") {
      charts.push(barChart("DUCAR intervention population", "Every link assigned to a planning intervention.", aggregate(rows, "recommended_intervention"), "link count", COLORS[2]));
      charts.push(barChart("DUCAR record readiness", "Complete data-availability status for mapped links.", aggregate(rows, "record_status"), "link count", COLORS[0]));
      charts.push(barChart("DUCAR geometry QA", "Source-versus-geometry length validation for every link.", aggregate(rows, "length_quality"), "link count", COLORS[5]));
      charts.push(barChart("DUCAR pavement population", "Link count under the explicit paved/unpaved classification.", aggregate(rows, "pavement_class"), "link count", COLORS[1]));
    } else if (state.section === "network") {
      charts.push(barChart("Surface composition", "Complete geometry length by surface type.", aggregate(rows, "surface", "geometry_length_km"), "geometry km", COLORS[2]));
      charts.push(barChart("Pavement classification", "Explicit paved/unpaved classification by geometry length.", aggregate(rows, "pavement_class", "geometry_length_km"), "geometry km", COLORS[1]));
      charts.push(barChart("Length QA categories", "Source-versus-geometry validation applied to every link.", aggregate(rows, "length_quality"), "link count", COLORS[5]));
      charts.push(barChart("Administrative assignment", "District hierarchy availability for every mapped link.", aggregate(rows, row => shown(row.admin_district) === "Not supplied" ? "Not supplied" : "District supplied"), "link count", COLORS[0]));
    } else if (state.section === "traffic") {
      charts.push(barChart("AADT bands", "Exact-match annual average daily traffic; unavailable values retained separately.", bands(rows,"registry_aadt",[["0–149",0,150],["150–499",150,500],["500–999",500,1000],["1,000+",1000,Infinity]]).concat([{name:"Not supplied",value:rows.length-measured}]), "link count", COLORS[0]));
      charts.push(barChart("PCU bands", "Passenger-car-unit bands for supplied link observations.", bands(rows,"registry_pcu",[["0–499",0,500],["500–999",500,1000],["1,000–1,499",1000,1500],["1,500+",1500,Infinity]]).concat([{name:"Not supplied",value:rows.filter(r=>typeof r.registry_pcu!=="number").length}]), "link count", COLORS[4]));
      charts.push(barChart("Operating speed bands", "Registry speed in kilometres per hour.", bands(rows,"registry_speed_kmh",[["<15 km/h",0,15],["15–19.9",15,20],["20–24.9",20,25],["25+ km/h",25,Infinity]]).concat([{name:"Not supplied",value:rows.filter(r=>typeof r.registry_speed_kmh!=="number").length}]), "link count", COLORS[1]));
      charts.push(barChart("Traffic coverage by pavement", "Links with supplied AADT grouped by paved/unpaved class.", aggregate(rows.filter(r=>typeof r.registry_aadt==="number"), "pavement_class"), "measured links", COLORS[2]));
    } else if (state.section === "condition") {
      charts.push(barChart("Condition by network length", "Complete geometry length associated with each condition.", aggregate(rows, "condition", "geometry_length_km"), "geometry km", COLORS[1]));
      charts.push(barChart("Condition risk", "Link count grouped by supplied/derived condition-risk value.", aggregate(rows, row => "Risk " + shown(row.condition_risk)), "link count", COLORS[3]));
      charts.push(barChart("Recommended interventions", "Every link assigned a planning intervention from condition and surface.", aggregate(rows, "recommended_intervention"), "link count", COLORS[2]));
      charts.push(barChart("Surface condition coverage", "Complete link count by surface type.", aggregate(rows, "surface"), "link count", COLORS[5]));
    } else if (state.section === "pims") {
      charts.push(barChart("Priority screening bands", "All links grouped by planning-priority score band.", aggregate(rows, "priority_band"), "link count", COLORS[4]));
      charts.push(barChart("Intervention pipeline", "Link count by recommended intervention.", aggregate(rows, "recommended_intervention"), "link count", COLORS[2]));
      charts.push(barChart("Planning allowance by priority", "Derived link allowances aggregated by priority band.", aggregate(rows, "priority_band", "planning_cost_ugx"), "UGX", COLORS[1]));
      charts.push(barChart("Screening by condition", "Complete inventory entering PIMS screening by condition.", aggregate(rows, "condition"), "link count", COLORS[0]));
    } else if (state.section === "hdm4") {
      charts.push(barChart("HDM-4 input coverage", "Availability of exact traffic inputs across all links.", aggregate(rows, row => typeof row.registry_aadt === "number" ? "Traffic supplied" : "Traffic not supplied"), "link count", COLORS[0]));
      charts.push(barChart("Speed input bands", "Supplied registry speeds prepared for model calibration.", bands(rows,"registry_speed_kmh",[["<15",0,15],["15–19.9",15,20],["20–24.9",20,25],["25+",25,Infinity]]).concat([{name:"Not supplied",value:rows.filter(r=>typeof r.registry_speed_kmh!=="number").length}]), "link count", COLORS[1]));
      charts.push(barChart("Pavement input length", "Geometry length by paved/unpaved model class.", aggregate(rows, "pavement_class", "geometry_length_km"), "geometry km", COLORS[2]));
      charts.push(barChart("Length calibration QA", "Source-length variance categories used for input QA.", aggregate(rows, "length_quality"), "link count", COLORS[5]));
    } else if (state.section === "framework") {
      charts.push(barChart("Record status", "Explicit data-availability state for every mapped link.", aggregate(rows, "record_status"), "link count", COLORS[0]));
      charts.push(barChart("Length quality controls", "All link geometries classified by source-length variance.", aggregate(rows, "length_quality"), "link count", COLORS[5]));
      charts.push(barChart("Traffic provenance", "No estimation: exact-match source or Not supplied.", aggregate(rows, "traffic_source"), "link count", COLORS[4]));
      charts.push(barChart("Administrative hierarchy", "Availability of parish-level link attribution.", aggregate(rows, row => shown(row.parish) === "Not supplied" ? "Not supplied" : "Parish supplied"), "link count", COLORS[1]));
    } else if (state.section === "budgets") {
      charts.push(barChart("Allowance by priority band", "Derived planning allowance aggregated across every link.", aggregate(rows, "priority_band", "planning_cost_ugx"), "UGX", COLORS[1]));
      charts.push(barChart("Allowance by intervention", "Derived planning allowance by recommended treatment.", aggregate(rows, "recommended_intervention", "planning_cost_ugx"), "UGX", COLORS[2]));
      charts.push(barChart("Allowance by pavement class", "Paved/unpaved planning allocation using explicit surface classification.", aggregate(rows, "pavement_class", "planning_cost_ugx"), "UGX", COLORS[0]));
      charts.push(barChart("Link count by priority", "Every link retained in the prioritisation population.", aggregate(rows, "priority_band"), "link count", COLORS[4]));
    }
    return metricCards(baseMetrics) + `<div class="chart-grid">${charts.join("")}${state.section === "condition" ? matrix(rows) : ""}</div><div class="method-note">All dashboard values are derived from the complete section population. Charts do not select Top-N roads. Planning costs are modelling allowances and are not engineer’s estimates or bills of quantities.</div>`;
  }
  function globalDashboard(payload) {
    const rows = payload.rows;
    const regions = aggregate(rows, "region");
    const sourced = rows.filter(row => row.source_status !== "No comparable country-level source supplied in the repository").length;
    return metricCards([
      {label:"Configured countries",value:number(rows.length),note:"No country omitted"},
      {label:"Regions",value:number(Object.keys(payload.regions).length),note:"Complete configured geography"},
      {label:"Comparable sourced rows",value:number(sourced),note:"Repository evidence only"},
      {label:"Explicitly not supplied",value:number(rows.length-sourced),note:"No fabricated scores"}
    ]) + `<div class="chart-grid">${barChart("Countries by configured region", "All countries retained and grouped by region.", regions, "country count", COLORS[0])}${barChart("Comparative source completeness", "Country metrics remain Not supplied until comparable sources are loaded.", [{name:"Comparable source supplied",value:sourced},{name:"Not supplied",value:rows.length-sourced}], "country count", COLORS[2])}</div><div class="method-note">The Global dashboard reports matrix completeness, not invented performance rankings. All unsourced country metrics remain explicitly “Not supplied”.</div>`;
  }
  function summaryDashboard(relations, mindmap) {
    const spatial = relations.filter(r => r.relation_basis.startsWith("Spatial")).length;
    const fallback = relations.length - spatial;
    const districts = new Set(relations.map(r => shown(r.admin_district))).size;
    const villages = new Set(relations.map(r => shown(r.village_id))).size;
    const charts = barChart("Administrative relation basis", "True polygon intersections are separated from registry hierarchy fallbacks.", [{name:"Spatial polygon intersection",value:spatial},{name:"Registry hierarchy fallback",value:fallback}], "relation count", COLORS[5]) +
      barChart("Relations by pavement class", "Every relation inherits the link paved/unpaved classification.", aggregate(relations, "pavement_class"), "relation count", COLORS[2]) +
      barChart("Relation traffic coverage", "Relations retain exact-match traffic availability from the source link.", aggregate(relations, row => row.traffic_measured ? "Traffic supplied" : "Traffic not supplied"), "relation count", COLORS[0]);
    const nodes = mindmap.nodes || [];
    const mind = `<article class="matrix-card"><h3>DUCAR site mind map</h3><p>Section and data ownership. Each reporting section has its own dashboard, records, SQL and schema views.</p><div class="mind-root">DUCAR Priority Studio</div><div class="mind-grid">${nodes.filter(n=>n.type!=="root").map(n=>`<div class="mind-node"><strong>${esc(n.label)}</strong><small>${esc(n.type)}${n.records ? " · "+number(n.records)+" records" : ""}</small></div>`).join("")}</div></article>`;
    return metricCards([{label:"Admin relations",value:number(relations.length),note:"Every mapped link represented"},{label:"Spatial relations",value:number(spatial),note:"Village polygon intersections"},{label:"Registry fallbacks",value:number(fallback),note:"Explicit uncovered residual"},{label:"Administrative districts",value:number(districts),note:number(villages)+" village identifiers"}]) + `<div class="chart-grid">${charts}${mind}</div>`;
  }
  function dashboardHtml() {
    if (state.section === "global") return globalDashboard(cache.global);
    if (state.section === "summaries") return summaryDashboard(cache.relations, cache.mindmap);
    return linkDashboard(cache.links);
  }
  function recordDataset() {
    if (state.section === "global") return { rows: cache.global.rows, fields: Object.keys(cache.global.rows[0]) };
    if (state.section === "summaries") return { rows: cache.relations, fields: Object.keys(cache.relations[0]) };
    return { rows: cache.links, fields: RECORD_FIELDS[state.section] || LINK_FIELDS };
  }
  function cellClass(field, raw) {
    const value = shown(raw).toLowerCase();
    if (value === "not supplied" || value.includes("no comparable")) return "not-supplied";
    if (field === "condition" && ["good","fair","poor"].includes(value)) return "cell-" + value;
    if (field === "priority_band" && ["low","moderate","high","critical"].includes(value)) return "cell-" + value;
    if (field === "pavement_class") return value === "paved" ? "cell-paved" : value === "unpaved" ? "cell-unpaved" : "";
    if (field === "registry_aadt" && typeof raw === "number") return raw >= 1000 ? "cell-critical" : raw >= 500 ? "cell-high" : raw >= 150 ? "cell-moderate" : "cell-low";
    return "";
  }
  function filtered(dataset) {
    if (!state.search) return dataset.rows;
    const query = state.search.toLowerCase();
    return dataset.rows.filter(row => dataset.fields.some(field => shown(row[field]).toLowerCase().includes(query)));
  }
  function csvValue(value) { return '"' + shown(value).replaceAll('"','""') + '"'; }
  function exportRecords(dataset) {
    const rows = filtered(dataset);
    const csv = [dataset.fields.map(csvValue).join(",")].concat(rows.map(row => dataset.fields.map(field => csvValue(row[field])).join(","))).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    const anchor = document.createElement("a"); anchor.href=url; anchor.download=`ducar_${state.section}_all_records.csv`; anchor.click(); URL.revokeObjectURL(url);
  }
  function recordsHtml() {
    const dataset = recordDataset();
    const rows = filtered(dataset);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)); state.page = Math.min(state.page, pages);
    const start = (state.page-1)*PAGE_SIZE, shownRows = rows.slice(start,start+PAGE_SIZE);
    return `<div class="records-toolbar"><input class="records-search" value="${esc(state.search)}" placeholder="Search this section’s complete records" aria-label="Search section records"><button class="studio-button" data-export>Export this complete section</button>${state.section==="overview" ? `<a class="studio-button" href="./data/ducar_link_register.csv" download>Download master CSV</a>` : ""}</div><div class="records-status"><strong>${number(rows.length)}</strong> of ${number(dataset.rows.length)} records · ${number(dataset.fields.length)} section-specific fields · pagination changes display only</div><div class="table-wrap"><table class="data-table"><thead><tr>${dataset.fields.map(field=>`<th>${esc(label(field))}</th>`).join("")}</tr></thead><tbody>${shownRows.map(row=>`<tr>${dataset.fields.map(field=>`<td class="${cellClass(field,row[field])}">${esc(shown(row[field]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div><div class="pages"><button data-page="prev" ${state.page===1?"disabled":""}>Previous</button><span>Page ${number(state.page)} of ${number(pages)}</span><button data-page="next" ${state.page===pages?"disabled":""}>Next</button></div>`;
  }
  function relevantTables() {
    const names = SECTION_SQL[state.section] || [];
    return (cache.database.tables || []).filter(table => names.includes(table.table));
  }
  function sqlHtml() {
    const tables = relevantTables();
    const fields = ["table","row_count","column_count","sections","columns","indexes"];
    const rows = tables.map(table => ({table:table.table,row_count:table.row_count,column_count:table.column_count,sections:table.sections.join(", "),columns:table.columns.map(c=>`${c.name} (${c.type})`).join(", "),indexes:table.indexes.length?table.indexes.map(i=>i.name).join(", "):"Not supplied"}));
    return `<div class="sql-intro"><div><h2>${esc(SECTION_META[state.section][0])} SQL tables</h2><p>Only database tables related to this section are shown; the same catalogue is not duplicated across unrelated sections.</p></div><a class="studio-button" href="./data/${esc(cache.database.database_file)}" download>Download SQLite · ${number(cache.database.database_bytes/1048576,1)} MB</a></div><div class="table-wrap"><table class="data-table"><thead><tr>${fields.map(f=>`<th>${esc(label(f))}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr>${fields.map(f=>`<td>${esc(shown(row[f]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  function schemaHtml() {
    return `<div class="sql-intro"><div><h2>${esc(SECTION_META[state.section][0])} schema</h2><p>DDL, columns, data types and indexes for this section’s related SQL tables.</p></div><a class="studio-button" href="./data/${esc(cache.database.database_file)}" download>Download SQLite database</a></div><div class="schema-grid">${relevantTables().map(table=>`<article class="schema-card"><h3>${esc(table.table)}</h3><p>${number(table.row_count)} rows · ${number(table.column_count)} columns · ${number(table.indexes.length)} indexes</p><div class="schema-columns">${table.columns.map(column=>`<span class="schema-column">${esc(column.name)} · ${esc(column.type)}</span>`).join("")}</div><pre>${esc(table.create_sql)}</pre></article>`).join("")}</div>`;
  }
  async function render() {
    const restoreFocus = document.activeElement?.classList?.contains("records-search");
    state.loading = true;
    shell(`<div class="studio-loading">Loading this section’s complete reporting population…</div>`);
    try { await ensureData(); state.loading=false; } catch (error) { state.loading=false; shell(`<div class="studio-loading">${esc(error.message)}</div>`); return; }
    let body = state.tab === "dashboard" ? dashboardHtml() : state.tab === "records" ? recordsHtml() : state.tab === "sql" ? sqlHtml() : schemaHtml();
    shell(body); bind();
    if (restoreFocus) { const input=root.querySelector(".records-search"); input?.focus(); input?.setSelectionRange(input.value.length,input.value.length); }
  }
  function shell(body) {
    const networkMapMode = state.section === "network" && state.tab === "dashboard";
    document.body.classList.toggle("network-map-mode", networkMapMode);
    root.innerHTML = `<section class="exhaustive-shell"><div class="section-studio"><nav class="section-tabs" aria-label="Section reporting views">${SECTION_TABS.map(([id,text])=>`<a class="section-tab ${state.tab===id?"active":""}" href="#${state.section}:${id}">${esc(networkMapMode && id === "dashboard" ? "Network Map" : text)}</a>`).join("")}</nav>${body}</div></section>`;
  }
  function bind() {
    const search=root.querySelector(".records-search"); if(search) search.addEventListener("input",()=>{state.search=search.value;state.page=1;render();});
    root.querySelector("[data-export]")?.addEventListener("click",()=>exportRecords(recordDataset()));
    root.querySelector('[data-page="prev"]')?.addEventListener("click",()=>{state.page--;render();});
    root.querySelector('[data-page="next"]')?.addEventListener("click",()=>{state.page++;render();});
  }
  function activateSection(section) {
    if (!section || section===state.section) return;
    state.section=section;state.tab="dashboard";state.page=1;state.search="";render();
  }
  document.addEventListener("click",event=>{
    const button=event.target.closest?.("button[title]");
    if(button)setTimeout(()=>activateSection(sectionFromTitle(button.getAttribute("title"))),0);
  },true);
  window.addEventListener("hashchange",()=>{
    state.section=sectionFromHash();state.tab=tabFromHash();state.page=1;state.search="";render();
  });
  render();
})();
