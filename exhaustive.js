(function () {
  "use strict";

  const PAGE_SIZE = 100;
  const PATHS = {
    links: "./data/ducar_link_register.json",
    relations: "./data/ducar_link_admin_relations.json",
    global: "./data/global_country_matrix.json",
    database: "./data/ducar_database_catalog.json",
    mindmap: "./data/ducar_site_mind_map.json",
    socio: "./data/ducar_socioeconomic_link_analysis.json",
    facilities: "./data/uganda_socioeconomic_facilities.geojson",
    mapRoads: "./data/ducar_socioeconomic_roads.geojson",
    structures: "./data/ducar_structure_analysis.json",
    structureMap: "./data/ducar_structures.geojson"
  };
  const COLORS = ["#0a84ff", "#30d158", "#ff9f0a", "#ff375f", "#bf5af2", "#64d2ff", "#ffd60a", "#5e5ce6"];
  const SECTION_TABS = [["dashboard", "Dashboard"], ["map", "Map"], ["records", "Full Exhaustive Table"], ["analytics", "Deep Analytics"], ["sql", "SQL Tables"], ["schema", "SQL Schema"]];
  const SECTION_META = {
    overview: ["National DUCAR Overview", "Whole-register coverage, condition, pavement, traffic and planning status."],
    ducar: ["DUCAR Executive Dashboard", "Mapped DUCAR link governance, inventory completeness and planning readiness."],
    network: ["Network & Pavement Structure", "Link geometry, administrative hierarchy, pavement class and length quality."],
    traffic: ["Traffic Intelligence", "Exact-match AADT, PCU and speed reporting for every mapped DUCAR link."],
    condition: ["Road Condition", "Condition, surface risk and intervention requirements for every mapped link."],
    structures: ["Structures · Bridges & Major Culverts", "Bridge, culvert, drift, condition, chainage, intervention and linked-road exposure reporting."],
    pims: ["PIMS Planning", "Planning priority, intervention pipeline and investment-screening attributes."],
    hdm4: ["HDM-4 Inputs", "Geometry, speed, traffic, pavement and planning-cost inputs prepared for economic analysis."],
    framework: ["Data & Governance Framework", "Record provenance, QA, coverage, hierarchy and modelling-basis controls."],
    budgets: ["Budget & Prioritisation", "Link-level planning allowances, priority bands and intervention allocation."],
    global: ["Global Country Matrix", "All configured countries retained with explicit source-completeness status."],
    socioeconomic: ["Socioeconomic & Accessibility Analysis", "Road-length exposure to schools, health facilities, markets, industry, minerals, agriculture, energy and logistics."],
    summaries: ["Summaries & Admin Tools", "Administrative relations, site topology, SQLite tables and database schema."]
  };
  const LINK_FIELDS = [
    "link_id", "road_name", "district", "county", "subcounty", "parish",
    "surface", "pavement_class", "condition", "source_length_km", "geometry_length_km",
    "registry_speed_kmh", "registry_aadt", "registry_pcu", "condition_risk",
    "surface_risk", "planning_priority_score", "priority_band", "priority_basis", "recommended_intervention",
    "planning_unit_cost_ugx_km", "planning_cost_ugx", "cost_basis", "admin_coverage"
  ];
  const RECORD_FIELDS = {
    overview: LINK_FIELDS,
    ducar: ["link_id", "road_name", "district", "county", "subcounty", "parish", "surface", "pavement_class", "condition", "geometry_length_km", "registry_aadt", "registry_pcu", "planning_priority_score", "priority_band", "recommended_intervention", "planning_cost_ugx", "admin_coverage"],
    network: ["link_id", "road_name", "surface", "pavement_class", "source_length_km", "geometry_length_km", "district", "county", "subcounty", "parish", "registry_aadt", "condition", "recommended_intervention", "admin_coverage"],
    traffic: ["link_id", "road_name", "registry_aadt", "registry_pcu", "registry_speed_kmh", "geometry_length_km", "surface", "pavement_class", "condition", "district", "county", "subcounty", "parish", "planning_priority_score", "recommended_intervention"],
    condition: ["link_id", "road_name", "condition", "surface", "pavement_class", "condition_risk", "surface_risk", "recommended_intervention", "planning_priority_score", "priority_band", "geometry_length_km", "district", "county", "subcounty", "parish", "planning_cost_ugx"],
    structures: ["structure_id", "link_id", "linked_road_name", "district", "structure_name", "structure_location", "chainage_km", "structure_class", "structure_type", "structure_age", "current_condition", "risk_band", "last_major_works", "last_major_work_year", "remarks", "recommended_intervention", "programme_cost_ugx", "linked_road_length_km", "allocated_road_length_km", "link_match_score", "linkage_quality", "map_location_method", "source_occurrence_index", "source_occurrence_count", "source_file", "source_sheet", "source_row"],
    pims: ["link_id", "road_name", "priority_band", "planning_priority_score", "priority_basis", "recommended_intervention", "planning_cost_ugx", "condition", "surface", "pavement_class", "geometry_length_km", "district", "county", "subcounty", "parish", "cost_basis"],
    hdm4: ["link_id", "road_name", "geometry_length_km", "source_length_km", "registry_speed_kmh", "registry_aadt", "registry_pcu", "surface", "pavement_class", "condition", "planning_priority_score", "recommended_intervention", "planning_unit_cost_ugx_km", "planning_cost_ugx", "cost_basis"],
    framework: ["link_id", "road_name", "district", "county", "subcounty", "parish", "surface", "pavement_class", "condition", "geometry_length_km", "registry_aadt", "planning_priority_score", "priority_band", "recommended_intervention", "priority_basis", "cost_basis", "admin_coverage"],
    budgets: ["link_id", "road_name", "priority_band", "planning_priority_score", "recommended_intervention", "planning_cost_ugx", "planning_unit_cost_ugx_km", "cost_basis", "condition", "surface", "pavement_class", "geometry_length_km", "district", "county", "subcounty", "parish"],
    socioeconomic: ["link_id", "road_name", "district", "county", "subcounty", "parish", "geometry_length_km", "surface", "pavement_class", "condition", "registry_aadt", "planning_priority_score", "recommended_intervention", "socioeconomic_exposure_score", "exposure_band", "primary_socioeconomic_factor", "nearest_school_km", "school_sites_within_5km", "nearest_health_km", "health_sites_within_5km", "nearest_market_km", "market_sites_within_5km", "nearest_industry_km", "industry_sites_within_10km", "nearest_mineral_km", "mineral_sites_within_25km", "nearest_agriculture_km", "agriculture_sites_within_10km", "nearest_energy_km", "energy_sites_within_25km", "nearest_logistics_km", "logistics_sites_within_10km"]
  };
  const SECTION_SQL = {
    overview: ["ducar_link_register", "master_road_sections"], ducar: ["ducar_link_register", "master_road_sections"],
    network: ["ducar_link_register", "ducar_link_admin_relations", "admin_unit_distance_matrix"],
    traffic: ["ducar_link_register", "traffic_survey_counts"], condition: ["ducar_link_register", "pms_pavement_condition"],
    structures: ["structure_inventory", "structure_link_summary", "ducar_link_register"],
    pims: ["ducar_link_register", "pms_pavement_condition"], hdm4: ["ducar_link_register", "pms_pavement_condition"],
    framework: ["ducar_link_register", "ducar_link_admin_relations"], budgets: ["ducar_link_register", "pms_pavement_condition"],
    global: ["global_country_matrix"], socioeconomic: ["socioeconomic_link_analysis", "socioeconomic_facilities", "ducar_link_register", "ducar_link_admin_relations"], summaries: ["ducar_link_admin_relations", "admin_unit_distance_matrix", "admin_districts"]
  };
  const cache = {};
  const vizTimers = new Set();
  const state = { section: sectionFromHash(), tab: tabFromHash(), page: 1, search: "", loading: false };
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
    const map = { TOP: "overview", "DUCAR Dashboard": "ducar", Network: "network", Traffic: "traffic", Condition: "condition", Structures: "structures", PIMS: "pims", "HDM-4": "hdm4", Framework: "framework", "Budgets & Prioritization": "budgets", Global: "global", "Socioeconomic Analysis": "socioeconomic", "Summaries & Admin Tools": "summaries" };
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
    if (state.tab === "map") {
      if (state.section === "socioeconomic") return Promise.all([data("links"), data("socio"), data("mapRoads"), data("facilities")]);
      if (state.section === "structures") return Promise.all([data("links"), data("structures"), data("mapRoads"), data("structureMap")]);
      if (state.section === "global") return Promise.all([data("global"), data("links"), data("mapRoads")]);
      if (state.section === "summaries") return Promise.all([data("relations"), data("mindmap"), data("links"), data("mapRoads")]);
      return Promise.all([data("links"), data("mapRoads")]);
    }
    if (state.section === "global") return data("global");
    if (state.section === "summaries") return Promise.all([data("relations"), data("mindmap"), data("links"), data("database"), data("structures")]);
    if (state.section === "socioeconomic") return data("socio");
    if (state.section === "structures") return data("structures");
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
      const amount = metric ? Number(row[metric] || 0) : Object.prototype.hasOwnProperty.call(row,"geometry_length_km") ? Number(row.geometry_length_km || 0) : Object.prototype.hasOwnProperty.call(row,"covered_length_km") ? Number(row.covered_length_km || 0) : 1;
      totals.set(key, (totals.get(key) || 0) + amount);
    });
    return [...totals].map(([name, value]) => ({ name, value }));
  }
  function bands(rows, field, definitions) {
    return definitions.map(([name, min, max]) => ({ name, value: rows.filter(row => {
      const value = row[field]; return typeof value === "number" && value >= min && value < max;
    }).reduce((sum, row) => sum + Number(row.geometry_length_km || 0), 0) }));
  }
  function sortData(values) { return [...values].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)); }
  function metricCards(items) {
    return `<div class="metric-grid">${items.map(item => `<article class="metric-card"><small>${esc(item.label)}</small><strong>${esc(item.value)}</strong><em>${esc(item.note)}</em></article>`).join("")}</div>`;
  }
  function barChart(title, subtitle, values, unit, color = COLORS[0]) {
    const rows = sortData(values);
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
    return `<article class="chart-card"><h3>${esc(title)}</h3><p class="chart-subtitle">${esc(subtitle)}</p><svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}"><line class="chart-axis" x1="${left}" y1="${height-bottom+4}" x2="${width-right}" y2="${height-bottom+4}"/>${svgTicks}${bars}</svg><div class="axis-title">Horizontal axis · ${esc(unit)}</div><div class="chart-legend"><span class="legend-key"><i class="legend-swatch" style="background:${color}"></i>${esc(unit)}</span></div></article>`;
  }
  function vizValues(values) { return sortData(values.filter(item=>Number(item.value)>0)); }
  function vizLegend(values, unit) {
    const total=values.reduce((sum,item)=>sum+Number(item.value||0),0);
    return `<div class="dynamic-legend">${values.map((item,index)=>`<span title="${esc(item.name)}: ${esc(chartNumber(item.value,unit))}"><i style="background:${COLORS[index%COLORS.length]}"></i><b>${esc(item.name)}</b><small>${esc(chartNumber(item.value,unit))} · ${number(item.value/Math.max(total,1)*100,1)}%</small></span>`).join("")}</div>`;
  }
  function radialViz(values, unit, donut) {
    const rows=vizValues(values), total=rows.reduce((sum,item)=>sum+item.value,0); let cursor=0;
    const stops=rows.map((item,index)=>{const start=cursor;cursor+=item.value/Math.max(total,1)*360;return `${COLORS[index%COLORS.length]} ${start}deg ${cursor}deg`;}).join(",");
    return `<div class="radial-layout"><div class="radial-chart ${donut?"donut":"pie"}" style="background:conic-gradient(${stops||"#303034 0 360deg"})" role="img" aria-label="${donut?"Donut":"Pie"} chart"><div class="radial-center">${donut?`<strong>${chartNumber(total,unit)}</strong><small>Total ${esc(unit)}</small>`:""}</div></div>${vizLegend(rows,unit)}</div>`;
  }
  function funnelViz(values, unit) {
    const rows=vizValues(values), max=Math.max(...rows.map(item=>item.value),1), width=640, rowH=44, center=320;
    const shapes=rows.map((item,index)=>{const top=Math.max(70,item.value/max*530), next=Math.max(60,(rows[index+1]?.value||item.value*.82)/max*530), y=index*rowH+8;return `<polygon points="${center-top/2},${y} ${center+top/2},${y} ${center+next/2},${y+31} ${center-next/2},${y+31}" fill="${COLORS[index%COLORS.length]}" title="${esc(item.name)}: ${esc(chartNumber(item.value,unit))}"/><text x="${center}" y="${y+20}" text-anchor="middle">${esc(item.name.length>34?item.name.slice(0,33)+"…":item.name)} · ${esc(chartNumber(item.value,unit))}</text>`;}).join("");
    return `<svg class="funnel-chart" viewBox="0 0 ${width} ${Math.max(80,rows.length*rowH+8)}" role="img" aria-label="Funnel chart">${shapes}</svg>`;
  }
  function clusteredViz(values, unit) {
    const rows=vizValues(values), max=Math.max(...rows.map(item=>item.value),1);
    return `<div class="clustered-wrap"><div class="clustered-chart" style="grid-template-columns:repeat(${Math.max(rows.length,1)},minmax(42px,1fr))">${rows.map((item,index)=>`<div class="column-item" title="${esc(item.name)}: ${esc(chartNumber(item.value,unit))}"><strong>${esc(chartNumber(item.value,unit))}</strong><div class="column-track"><i style="height:${Math.max(2,item.value/max*100)}%;background:${COLORS[index%COLORS.length]}"></i></div><small>${esc(item.name)}</small></div>`).join("")}</div></div>`;
  }
  function stackedViz(values, unit) {
    const rows=vizValues(values), total=rows.reduce((sum,item)=>sum+item.value,0);
    return `<div class="stacked-layout"><div class="stacked-column" role="img" aria-label="Stacked column">${rows.map((item,index)=>`<i style="height:${item.value/Math.max(total,1)*100}%;background:${COLORS[index%COLORS.length]}" title="${esc(item.name)}: ${esc(chartNumber(item.value,unit))}"></i>`).join("")}</div>${vizLegend(rows,unit)}</div>`;
  }
  function vizCard(series, type) {
    const renderer=type==="donut"?radialViz(series.values,series.unit,true):type==="pie"?radialViz(series.values,series.unit,false):type==="funnel"?funnelViz(series.values,series.unit):type==="clustered"?clusteredViz(series.values,series.unit):stackedViz(series.values,series.unit);
    return `<article class="dynamic-chart-card"><header><h4>${esc(series.name)}</h4><span>${esc(series.unit)}</span></header>${renderer}</article>`;
  }
  function interactiveGallery(title, series) {
    const types=[["donut","Donuts"],["pie","Pies"],["funnel","Funnels"],["clustered","Clustered columns"],["stacked","Stacked columns"]];
    return `<section class="viz-studio" data-viz-studio><div class="viz-heading"><div><small>INTERACTIVE · COMPLETE POPULATION</small><h3>${esc(title)}</h3><p>Switch chart forms, hover marks for exact values, or animate the complete sequence. Every road value is cumulative affected length.</p></div><button class="viz-autoplay" data-viz-autoplay type="button">▶ Animate views</button></div><div class="viz-switcher" role="tablist">${types.map(([id,text],index)=>`<button type="button" role="tab" data-viz-type="${id}" class="${index===0?"active":""}" aria-selected="${index===0}">${text}</button>`).join("")}</div>${types.map(([id],index)=>`<div class="viz-panel ${index===0?"active":""}" data-viz-panel="${id}"><div class="dynamic-chart-grid">${series.map(item=>vizCard(item,id)).join("")}</div></div>`).join("")}</section>`;
  }
  function roadInteractiveSeries(rows, section) {
    const missingKm=field=>rows.filter(row=>typeof row[field]!=="number").reduce((s,row)=>s+Number(row.geometry_length_km||0),0);
    const traffic=[{name:"Traffic supplied",value:rows.filter(r=>typeof r.registry_aadt==="number").reduce((s,r)=>s+Number(r.geometry_length_km||0),0)},{name:"Not supplied",value:missingKm("registry_aadt")}];
    const standard={condition:{name:"Condition affected length",values:aggregate(rows,"condition"),unit:"affected km"},pavement:{name:"Pavement affected length",values:aggregate(rows,"pavement_class"),unit:"affected km"},priority:{name:"Priority affected length",values:aggregate(rows,"priority_band"),unit:"affected km"},traffic:{name:"Traffic data length",values:traffic,unit:"affected km"}};
    if(section==="traffic") return [
      {name:"AADT-band affected length",values:bands(rows,"registry_aadt",[["0–149",0,150],["150–499",150,500],["500–999",500,1000],["1,000+",1000,Infinity]]).concat([{name:"Not supplied",value:missingKm("registry_aadt")}]),unit:"affected km"},
      {name:"PCU-band affected length",values:bands(rows,"registry_pcu",[["0–499",0,500],["500–999",500,1000],["1,000–1,499",1000,1500],["1,500+",1500,Infinity]]).concat([{name:"Not supplied",value:missingKm("registry_pcu")}]),unit:"affected km"},
      {name:"Speed-band affected length",values:bands(rows,"registry_speed_kmh",[["<15 km/h",0,15],["15–19.9",15,20],["20–24.9",20,25],["25+ km/h",25,Infinity]]).concat([{name:"Not supplied",value:missingKm("registry_speed_kmh")}]),unit:"affected km"},standard.pavement];
    if(section==="condition") return [standard.condition,{name:"Condition-risk affected length",values:aggregate(rows,r=>"Risk "+shown(r.condition_risk)),unit:"affected km"},{name:"Intervention affected length",values:aggregate(rows,"recommended_intervention"),unit:"affected km"},{name:"Surface affected length",values:aggregate(rows,"surface"),unit:"affected km"}];
    if(section==="pims"||section==="budgets") return [standard.priority,{name:"Intervention affected length",values:aggregate(rows,"recommended_intervention"),unit:"affected km"},standard.condition,standard.pavement];
    if(section==="network") return [{name:"Surface affected length",values:aggregate(rows,"surface"),unit:"affected km"},standard.pavement,standard.condition,standard.traffic];
    if(section==="framework"||section==="hdm4") return [standard.traffic,standard.condition,standard.pavement,standard.priority];
    return [standard.condition,standard.pavement,standard.priority,standard.traffic];
  }
  function completenessValues(rows, fields, unit="affected km") {
    return fields.map(field=>({name:label(field),value:rows.filter(row=>shown(row[field])!=="Not supplied").reduce((sum,row)=>sum+Number(row.geometry_length_km||0),0),unit}));
  }
  function roadInsightSeries(rows, section) {
    const missingKm=field=>rows.filter(row=>typeof row[field]!=="number").reduce((sum,row)=>sum+Number(row.geometry_length_km||0),0);
    const trafficCoverage=[{name:"Traffic supplied",value:rows.filter(row=>typeof row.registry_aadt==="number").reduce((sum,row)=>sum+Number(row.geometry_length_km||0),0)},{name:"Not supplied",value:missingKm("registry_aadt")}];
    const district={name:"Administrative district",values:aggregate(rows,"district"),unit:"affected km"};
    const catalog={
      surface:{name:"Surface type",values:aggregate(rows,"surface"),unit:"affected km"},
      pavement:{name:"Pavement class",values:aggregate(rows,"pavement_class"),unit:"affected km"},
      condition:{name:"Road condition",values:aggregate(rows,"condition"),unit:"affected km"},
      conditionRisk:{name:"Condition risk",values:aggregate(rows,row=>"Risk "+shown(row.condition_risk)),unit:"affected km"},
      surfaceRisk:{name:"Surface risk",values:aggregate(rows,row=>"Risk "+shown(row.surface_risk)),unit:"affected km"},
      priority:{name:"Planning priority",values:aggregate(rows,"priority_band"),unit:"affected km"},
      intervention:{name:"Recommended intervention",values:aggregate(rows,"recommended_intervention"),unit:"affected km"},
      traffic:{name:"Traffic-data coverage",values:trafficCoverage,unit:"affected km"},
      aadt:{name:"AADT band",values:bands(rows,"registry_aadt",[["0–149",0,150],["150–499",150,500],["500–999",500,1000],["1,000+",1000,Infinity]]).concat([{name:"Not supplied",value:missingKm("registry_aadt")}]),unit:"affected km"},
      pcu:{name:"PCU band",values:bands(rows,"registry_pcu",[["0–499",0,500],["500–999",500,1000],["1,000–1,499",1000,1500],["1,500+",1500,Infinity]]).concat([{name:"Not supplied",value:missingKm("registry_pcu")}]),unit:"affected km"},
      speed:{name:"Operating-speed band",values:bands(rows,"registry_speed_kmh",[["Below 15 km/h",0,15],["15–19.9 km/h",15,20],["20–24.9 km/h",20,25],["25+ km/h",25,Infinity]]).concat([{name:"Not supplied",value:missingKm("registry_speed_kmh")}]),unit:"affected km"},
      score:{name:"Planning-score band",values:bands(rows,"planning_priority_score",[["0–24.9",0,25],["25–49.9",25,50],["50–74.9",50,75],["75–100",75,101]]),unit:"affected km"},
      linkLength:{name:"Individual-link length band",values:bands(rows,"geometry_length_km",[["Below 1 km",0,1],["1–2.9 km",1,3],["3–4.9 km",3,5],["5–9.9 km",5,10],["10+ km",10,Infinity]]),unit:"affected km"},
      hierarchy:{name:"Administrative hierarchy",values:aggregate(rows,row=>shown(row.parish)==="Not supplied"?"Parish not supplied":"Parish supplied"),unit:"affected km"},
      completeness:{name:"Governed parameter completeness",values:completenessValues(rows,["district","county","subcounty","parish","surface","pavement_class","condition","registry_aadt","priority_band","recommended_intervention"]),unit:"affected km"}
    };
    const owned={
      traffic:[catalog.aadt,catalog.pcu,catalog.speed,catalog.traffic,catalog.pavement,catalog.condition,catalog.linkLength,catalog.completeness],
      condition:[catalog.condition,catalog.conditionRisk,catalog.surfaceRisk,catalog.intervention,catalog.surface,catalog.pavement,catalog.priority,catalog.linkLength,catalog.completeness],
      network:[catalog.surface,catalog.pavement,catalog.condition,catalog.linkLength,catalog.hierarchy,catalog.traffic,catalog.intervention,catalog.completeness],
      pims:[catalog.priority,catalog.score,catalog.intervention,catalog.condition,catalog.surfaceRisk,catalog.pavement,catalog.traffic,catalog.linkLength],
      hdm4:[catalog.aadt,catalog.pcu,catalog.speed,catalog.traffic,catalog.pavement,catalog.condition,catalog.linkLength,catalog.completeness],
      framework:[catalog.hierarchy,catalog.completeness,catalog.traffic,catalog.condition,catalog.pavement,catalog.priority,catalog.intervention,catalog.linkLength],
      budgets:[catalog.priority,catalog.score,catalog.intervention,catalog.condition,catalog.pavement,catalog.surface,catalog.traffic,catalog.linkLength],
      ducar:[catalog.intervention,catalog.condition,catalog.pavement,catalog.priority,catalog.surface,catalog.traffic,catalog.linkLength,catalog.completeness],
      overview:[catalog.condition,catalog.pavement,catalog.priority,catalog.traffic,catalog.surface,catalog.intervention,catalog.linkLength,catalog.completeness]
    };
    return [district,...(owned[section]||owned.overview)];
  }
  function insightMicro(type, share, meanShare, color) {
    const p=Math.max(0,Math.min(100,share)), mean=Math.max(0,Math.min(100,meanShare));
    const style=`--pct:${p.toFixed(2)}%;--half:${(p/2).toFixed(2)}%;--mean-pct:${mean.toFixed(2)}%;--heat-opacity:${(.12+p/125).toFixed(3)};--accent:${color}`;
    if(type==="ring") return `<div class="micro-ring" style="${style}"><i></i><b>${number(p,1)}%</b></div>`;
    if(type==="pie") return `<div class="micro-pie" style="${style}"><b>${number(p,1)}%</b></div>`;
    if(type==="gauge") return `<div class="micro-gauge" style="${style}"><i></i><b>${number(p,1)}%</b></div>`;
    if(type==="column") return `<div class="micro-column" style="${style}"><i></i><span>100%</span></div>`;
    if(type==="lollipop") return `<div class="micro-lollipop" style="${style}"><i></i><b></b></div>`;
    if(type==="stacked") return `<div class="micro-stacked" style="${style}"><i></i><b></b></div>`;
    if(type==="funnel") return `<div class="micro-funnel" style="${style}"><i></i></div>`;
    if(type==="heat") return `<div class="micro-heat" style="${style}"><i></i><b>${number(p,1)}% share</b></div>`;
    if(type==="bullet") return `<div class="micro-bullet" style="${style}"><i></i><b title="Dimension average"></b></div>`;
    return `<div class="micro-bar" style="${style}"><i></i><b>${number(p,1)}%</b></div>`;
  }
  function insightWall(title, series) {
    const types=["bar","ring","column","lollipop","stacked","pie","funnel","heat","bullet","gauge"];
    const cards=[];
    series.forEach((group,groupIndex)=>{
      const values=(group.values||[]).map(item=>({name:shown(item.name),value:Number(item.value||0)}));
      const total=values.reduce((sum,item)=>sum+item.value,0), mean=total/Math.max(values.length,1), meanShare=mean/Math.max(total,1)*100;
      values.forEach((item,itemIndex)=>{
        const share=item.value/Math.max(total,1)*100, delta=item.value-mean, type=types[(cards.length+groupIndex)%types.length], color=COLORS[(itemIndex+groupIndex)%COLORS.length];
        cards.push(`<article class="insight-card" data-insight-card data-series="${esc(group.name)}" data-insight-search="${esc((group.name+" "+item.name).toLowerCase())}" style="--delay:${(cards.length%16)*22}ms"><header><span>${esc(group.name)}</span><em>${esc(type)}</em></header><h4>${esc(item.name)}</h4><strong>${esc(chartNumber(item.value,group.unit))}</strong>${insightMicro(type,share,meanShare,color)}<footer><span>${number(share,2)}% of dimension</span><span class="${delta>=0?"positive":"negative"}">${delta>=0?"+":""}${esc(chartNumber(delta,group.unit))} vs mean</span></footer></article>`);
      });
    });
    return `<section class="insight-wall" data-insight-wall data-total="${cards.length}"><div class="insight-heading"><div><small>SECTION-SPECIFIC · COMPLETE POPULATION</small><h3>${esc(title)}</h3><p>Each infographic is a distinct category insight. Values use the full section population; nothing is limited to a Top-N list.</p></div><strong><span data-insight-count>${cards.length}</span> infographics</strong></div><div class="insight-controls"><label>Dimension<select data-insight-series><option value="all">All dimensions</option>${series.map(group=>`<option value="${esc(group.name)}">${esc(group.name)}</option>`).join("")}</select></label><label>Find an insight<input type="search" data-insight-search placeholder="Search district, condition, surface…"></label><button type="button" data-insight-motion>Pause motion</button></div><div class="insight-grid">${cards.join("")}</div><div class="insight-empty" hidden>No infographic matches this filter.</div></section>`;
  }
  function matrix(rows) {
    const conditions = ["Good", "Fair", "Poor", "Unclassified", "Not supplied"];
    const pavements = ["Paved", "Unpaved", "Not supplied"];
    const cells = conditions.map(condition => pavements.map(pavement => rows.filter(row => shown(row.condition) === condition && shown(row.pavement_class) === pavement).reduce((sum,row)=>sum+Number(row.geometry_length_km||0),0)));
    return `<article class="matrix-card"><h3>Condition × pavement classification matrix</h3><p>Complete cumulative road-length cross-tabulation. Gravel/Earth = Unpaved; Bituminous/Concrete = Paved.</p><div class="matrix-grid" style="grid-template-columns:170px repeat(3,minmax(105px,1fr))"><div class="matrix-cell head">Condition</div>${pavements.map(x => `<div class="matrix-cell head">${x}</div>`).join("")}${conditions.map((condition,i) => `<div class="matrix-cell row-head">${condition}</div>${cells[i].map(value => `<div class="matrix-cell">${number(value,1)} km</div>`).join("")}`).join("")}</div><div class="chart-legend"><span class="legend-key"><i class="legend-swatch" style="background:#30d158"></i>Paved: Bituminous + Concrete</span><span class="legend-key"><i class="legend-swatch" style="background:#ff9f0a"></i>Unpaved: Gravel + Earth</span></div></article>`;
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
  function lengthDashboard(rows) {
    const km = row => Number(row.geometry_length_km || 0);
    const sum = predicate => rows.filter(predicate).reduce((total,row)=>total+km(row),0);
    const totalKm = sum(()=>true), trafficKm = sum(row=>typeof row.registry_aadt === "number");
    const cost = rows.reduce((total,row)=>total+Number(row.planning_cost_ugx||0),0);
    const missingKm = field => sum(row=>typeof row[field] !== "number");
    let metrics;
    if (state.section === "condition") metrics = ["Good","Fair","Poor","Unclassified"].map(name=>({label:name+" affected length",value:number(sum(r=>shown(r.condition)===name),1)+" km",note:"Cumulative geometry length"}));
    else if (state.section === "traffic") metrics = [
      {label:"Traffic-covered length",value:number(trafficKm,1)+" km",note:number(trafficKm/Math.max(totalKm,1)*100,1)+"% of network length"},
      {label:"Traffic data gap",value:number(totalKm-trafficKm,1)+" km",note:"Retained as Not supplied"},
      {label:"High-AADT length",value:number(sum(r=>Number(r.registry_aadt)>=1000),1)+" km",note:"AADT 1,000 or more"},
      {label:"Low-speed length",value:number(sum(r=>typeof r.registry_speed_kmh==="number"&&r.registry_speed_kmh<15),1)+" km",note:"Speed below 15 km/h"}
    ];
    else if (state.section === "network") metrics = [
      {label:"Paved length",value:number(sum(r=>shown(r.pavement_class)==="Paved"),1)+" km",note:"Bituminous + Concrete"},
      {label:"Unpaved length",value:number(sum(r=>shown(r.pavement_class)==="Unpaved"),1)+" km",note:"Gravel + Earth"},
      {label:"Condition-supplied length",value:number(sum(r=>shown(r.condition)!=="Not supplied"),1)+" km",note:"Road condition coverage"},
      {label:"Admin-attributed length",value:number(sum(r=>shown(r.district)!=="Not supplied"),1)+" km",note:"District hierarchy coverage"}
    ];
    else if (state.section === "budgets") metrics = [
      {label:"Screened network length",value:number(totalKm,1)+" km",note:"Every DUCAR geometry"},
      {label:"Critical-priority length",value:number(sum(r=>shown(r.priority_band)==="Critical"),1)+" km",note:"Highest planning band"},
      {label:"Total planning allowance",value:"UGX "+number(cost/1e12,2)+"T",note:"Modelled, not a BOQ"},
      {label:"Critical-band allowance",value:"UGX "+number(rows.filter(r=>shown(r.priority_band)==="Critical").reduce((s,r)=>s+Number(r.planning_cost_ugx||0),0)/1e9,1)+"B",note:"Complete critical length"}
    ];
    else metrics = [
      {label:"Analyzed road length",value:number(totalKm,1)+" km",note:"Complete mapped register"},
      {label:"Traffic-covered length",value:number(trafficKm,1)+" km",note:"Exact-match observations"},
      {label:"Critical-priority length",value:number(sum(r=>shown(r.priority_band)==="Critical"),1)+" km",note:"Complete screened population"},
      {label:"Paved road length",value:number(sum(r=>shown(r.pavement_class)==="Paved"),1)+" km",note:"Bituminous + Concrete"}
    ];
    const common = {
      overview: [["Condition affected length","All mapped road length by condition.","condition",COLORS[1]],["Pavement affected length","Paved and unpaved cumulative length.","pavement_class",COLORS[2]],["Priority affected length","Planning bands by cumulative road length.","priority_band",COLORS[4]],["Traffic data coverage","Road length with or without exact traffic data.",r=>typeof r.registry_aadt==="number"?"Traffic supplied":"Not supplied",COLORS[5]]],
      ducar: [["Intervention coverage length","Cumulative length assigned to each treatment.","recommended_intervention",COLORS[2]],["Condition coverage length","Network condition by affected road length.","condition",COLORS[1]],["Pavement coverage length","Paved and unpaved road length.","pavement_class",COLORS[0]],["Priority coverage length","Screened length by priority band.","priority_band",COLORS[4]]],
      network: [["Surface composition","Complete geometry length by surface.","surface",COLORS[2]],["Pavement classification","Explicit paved/unpaved length.","pavement_class",COLORS[1]],["Condition coverage","Affected length by road condition.","condition",COLORS[3]],["Administrative coverage","Road length by district.","district",COLORS[0]]],
      condition: [["Condition by network length","Complete affected road length.","condition",COLORS[1]],["Condition risk","Affected length by condition-risk score.",r=>"Risk "+shown(r.condition_risk),COLORS[3]],["Recommended interventions","Cumulative length by treatment.","recommended_intervention",COLORS[2]],["Surface condition coverage","Complete length by surface.","surface",COLORS[5]]],
      pims: [["Priority screening bands","Affected road length by priority.","priority_band",COLORS[4]],["Intervention pipeline","Cumulative treatment length.","recommended_intervention",COLORS[2]],["Screening by condition","Input length by condition.","condition",COLORS[0]],["Screening by pavement","Input length by pavement.","pavement_class",COLORS[1]]],
      hdm4: [["HDM-4 traffic coverage","Road length with exact traffic inputs.",r=>typeof r.registry_aadt==="number"?"Traffic supplied":"Not supplied",COLORS[0]],["Pavement input length","Model length by pavement.","pavement_class",COLORS[2]],["Condition input length","Model length by condition.","condition",COLORS[3]],["Priority input length","Model length by planning band.","priority_band",COLORS[4]]],
      framework: [["Condition data coverage","Governed length by condition.","condition",COLORS[1]],["Traffic data provenance","Length with exact traffic values.",r=>typeof r.registry_aadt==="number"?"Traffic supplied":"Not supplied",COLORS[4]],["Administrative hierarchy","Length with parish attribution.",r=>shown(r.parish)==="Not supplied"?"Not supplied":"Parish supplied",COLORS[0]],["Pavement governance","Length by explicit pavement class.","pavement_class",COLORS[2]]]
    };
    let charts;
    if (state.section === "traffic") charts = [
      barChart("AADT affected length","Cumulative road length in every AADT band.",bands(rows,"registry_aadt",[["0–149",0,150],["150–499",150,500],["500–999",500,1000],["1,000+",1000,Infinity]]).concat([{name:"Not supplied",value:missingKm("registry_aadt")}]),"affected km",COLORS[0]),
      barChart("PCU affected length","Cumulative road length in every PCU band.",bands(rows,"registry_pcu",[["0–499",0,500],["500–999",500,1000],["1,000–1,499",1000,1500],["1,500+",1500,Infinity]]).concat([{name:"Not supplied",value:missingKm("registry_pcu")}]),"affected km",COLORS[4]),
      barChart("Speed affected length","Cumulative road length in every speed band.",bands(rows,"registry_speed_kmh",[["<15 km/h",0,15],["15–19.9",15,20],["20–24.9",20,25],["25+ km/h",25,Infinity]]).concat([{name:"Not supplied",value:missingKm("registry_speed_kmh")}]),"affected km",COLORS[1]),
      barChart("Traffic coverage by pavement","Length with supplied AADT by pavement.",aggregate(rows.filter(r=>typeof r.registry_aadt==="number"),"pavement_class"),"affected km",COLORS[2])
    ];
    else if (state.section === "budgets") charts = [
      barChart("Allowance by priority","Planning allowance for all road length.",aggregate(rows,"priority_band","planning_cost_ugx"),"UGX",COLORS[1]),
      barChart("Allowance by intervention","Allowance by complete treatment length.",aggregate(rows,"recommended_intervention","planning_cost_ugx"),"UGX",COLORS[2]),
      barChart("Affected length by intervention","Cumulative road length for each treatment.",aggregate(rows,"recommended_intervention"),"affected km",COLORS[0]),
      barChart("Affected length by priority","Every kilometre retained.",aggregate(rows,"priority_band"),"affected km",COLORS[4])
    ];
    else charts = (common[state.section]||common.overview).map(c=>barChart(c[0],c[1],aggregate(rows,c[2]),"affected km",c[3]));
    return metricCards(metrics)+`<div class="chart-grid">${charts.join("")}${state.section==="condition"?matrix(rows):""}</div>`+interactiveGallery(`${SECTION_META[state.section][0]} · animated chart gallery`,roadInteractiveSeries(rows,state.section))+insightWall(`${SECTION_META[state.section][0]} · 50+ insight atlas`,roadInsightSeries(rows,state.section))+`<div class="method-note">Every road chart uses cumulative geometry length. No Top-N road selection is applied. Gravel and Earth are Unpaved; Bituminous and Concrete are Paved. Planning costs are modelling allowances, not bills of quantities.</div>`;
  }

  function socioeconomicDashboard(payload) {
    const rows = payload.rows || [], exposure = payload.exposure_summary || [], access = payload.access_summary || [];
    const total = Number(payload.metadata?.road_length_km || rows.reduce((s,r)=>s+Number(r.geometry_length_km||0),0));
    const accessValue = key => Number(access.find(item=>item.factor===key)?.affected_length_km || 0);
    return metricCards([
      {label:"Analyzed road length",value:number(total,1)+" km",note:"All 7,733 DUCAR links"},
      {label:"High + critical exposure",value:number(exposure.filter(x=>["High","Critical"].includes(x.band)).reduce((s,x)=>s+Number(x.affected_length_km||0),0),1)+" km",note:"Multi-factor access pressure"},
      {label:"School-access length",value:number(accessValue("School"),1)+" km",note:"Within 5 km"},
      {label:"Health-access length",value:number(accessValue("Health"),1)+" km",note:"Within 5 km"}
    ])+`<div class="chart-grid">${barChart("Socioeconomic exposure by road length","Combined accessibility exposure for every DUCAR link.",exposure.map(x=>({name:x.band,value:Number(x.affected_length_km||0)})),"affected km",COLORS[4])}${barChart("Road length within service thresholds","Length exposed to each socioeconomic factor.",access.map(x=>({name:x.factor,value:Number(x.affected_length_km||0)})),"affected km",COLORS[1])}${barChart("Road length outside service thresholds","Cumulative accessibility-gap length.",access.map(x=>({name:x.factor,value:Number(x.outside_threshold_length_km||0)})),"affected km",COLORS[3])}${barChart("Primary socioeconomic factor","Dominant factor assigned to every road, by length.",aggregate(rows,"primary_socioeconomic_factor"),"affected km",COLORS[2])}</div>`+interactiveGallery("Socioeconomic · animated chart gallery",[
      {name:"Exposure-band affected length",values:exposure.map(x=>({name:x.band,value:Number(x.affected_length_km||0)})),unit:"affected km"},
      {name:"Within-threshold affected length",values:access.map(x=>({name:x.factor,value:Number(x.affected_length_km||0)})),unit:"affected km"},
      {name:"Outside-threshold gap length",values:access.map(x=>({name:x.factor,value:Number(x.outside_threshold_length_km||0)})),unit:"affected km"},
      {name:"Primary-factor affected length",values:aggregate(rows,"primary_socioeconomic_factor"),unit:"affected km"}
    ])+insightWall("Socioeconomic & Accessibility · 50+ insight atlas",[
      {name:"Administrative district",values:aggregate(rows,"district"),unit:"affected km"},
      {name:"Exposure band",values:aggregate(rows,"exposure_band"),unit:"affected km"},
      {name:"Primary socioeconomic factor",values:aggregate(rows,"primary_socioeconomic_factor"),unit:"affected km"},
      {name:"Surface type",values:aggregate(rows,"surface"),unit:"affected km"},
      {name:"Pavement class",values:aggregate(rows,"pavement_class"),unit:"affected km"},
      {name:"Road condition",values:aggregate(rows,"condition"),unit:"affected km"},
      {name:"Exposure-score band",values:bands(rows,"socioeconomic_exposure_score",[["0–19.9",0,20],["20–39.9",20,40],["40–59.9",40,60],["60–79.9",60,80],["80–100",80,101]]),unit:"affected km"},
      {name:"Nearest-school distance",values:bands(rows,"nearest_school_km",[["Below 1 km",0,1],["1–4.9 km",1,5],["5–9.9 km",5,10],["10+ km",10,Infinity]]),unit:"affected km"},
      {name:"Nearest-health distance",values:bands(rows,"nearest_health_km",[["Below 1 km",0,1],["1–4.9 km",1,5],["5–9.9 km",5,10],["10+ km",10,Infinity]]),unit:"affected km"},
      {name:"Nearest-market distance",values:bands(rows,"nearest_market_km",[["Below 1 km",0,1],["1–4.9 km",1,5],["5–9.9 km",5,10],["10+ km",10,Infinity]]),unit:"affected km"},
      {name:"Within service threshold",values:access.map(x=>({name:x.factor,value:Number(x.affected_length_km||0)})),unit:"affected km"},
      {name:"Outside service threshold",values:access.map(x=>({name:x.factor,value:Number(x.outside_threshold_length_km||0)})),unit:"affected km"}
    ])+`<div class="method-note">Nearest-distance joins use exact road geometry in EPSG:32636. Threshold counts use road midpoint buffers. Results integrate local authoritative registers, OpenStreetMap/Geofabrik, UIA, MoES, MoH, DGSM and UBOS metadata; all values remain link-level and exportable.</div>`;
  }

  function structuresDashboard(payload) {
    const rows=payload.rows||[], value=(summary,key)=>Number((summary||[]).find(item=>item[Object.keys(item)[0]]===key)?.affected_length_km||0);
    const classValues=(payload.class_summary||[]).map(item=>({name:item.structure_class,value:Number(item.affected_length_km||0)}));
    const conditionValues=(payload.condition_summary||[]).map(item=>({name:item.current_condition,value:Number(item.affected_length_km||0)}));
    const riskValues=(payload.risk_summary||[]).map(item=>({name:item.risk_band,value:Number(item.affected_length_km||0)}));
    const districtValues=(payload.district_summary||[]).map(item=>({name:item.district,value:Number(item.affected_length_km||0)}));
    const highRisk=rows.filter(row=>["Critical","High"].includes(row.risk_band)).reduce((sum,row)=>sum+Number(row.allocated_road_length_km||0),0);
    const series=[{name:"Structure-class affected length",values:classValues,unit:"affected km"},{name:"Structure-condition affected length",values:conditionValues,unit:"affected km"},{name:"Structure-risk affected length",values:riskValues,unit:"affected km"},{name:"District structure exposure length",values:districtValues,unit:"affected km"}];
    return metricCards([
      {label:"Road length with structures",value:number(payload.metadata.road_length_with_structures_km,1)+" km",note:number(payload.metadata.structure_occurrences)+" source occurrences retained"},
      {label:"High-risk exposed length",value:number(highRisk,1)+" km",note:"Critical + High structure risk"},
      {label:"Bridge-carrying length",value:number(value(payload.class_summary,"Bridge"),1)+" km",note:"Allocated without link double-counting"},
      {label:"Major-culvert length",value:number(value(payload.class_summary,"Major Culvert"),1)+" km",note:"Culvert-associated road exposure"}
    ])+`<div class="chart-grid">${barChart("Structure class by road length","Bridges, major culverts, drifts and other structures by allocated linked-road length.",classValues,"affected km",COLORS[5])}${barChart("Structure condition by road length","Complete structure register translated to non-duplicated allocated road length.",conditionValues,"affected km",COLORS[1])}${barChart("Structure risk by road length","Risk band from the supplied current condition.",riskValues,"affected km",COLORS[3])}${barChart("Administrative structure exposure","Every supplying district by allocated road length.",districtValues,"affected km",COLORS[2])}</div>`+interactiveGallery("Structures · animated chart gallery",series)+insightWall("Structures · 50+ insight atlas",(()=>{const weighted=rows.map(row=>({...row,geometry_length_km:Number(row.allocated_road_length_km||0)}));return [
      {name:"Administrative district",values:aggregate(weighted,"district"),unit:"affected km"},
      {name:"Structure class",values:aggregate(weighted,"structure_class"),unit:"affected km"},
      {name:"Structure type",values:aggregate(weighted,"structure_type"),unit:"affected km"},
      {name:"Current condition",values:aggregate(weighted,"current_condition"),unit:"affected km"},
      {name:"Risk band",values:aggregate(weighted,"risk_band"),unit:"affected km"},
      {name:"Recommended intervention",values:aggregate(weighted,"recommended_intervention"),unit:"affected km"},
      {name:"Structure age",values:aggregate(weighted,"structure_age"),unit:"affected km"},
      {name:"Linkage quality",values:aggregate(weighted,"linkage_quality"),unit:"affected km"},
      {name:"Map-location method",values:aggregate(weighted,"map_location_method"),unit:"affected km"},
      {name:"Link-match score band",values:bands(weighted,"link_match_score",[["Below 0.50",0,.5],["0.50–0.74",.5,.75],["0.75–0.89",.75,.9],["0.90–1.00",.9,1.01]]),unit:"affected km"},
      {name:"Chainage band",values:bands(weighted,"chainage_km",[["Below 1 km",0,1],["1–4.9 km",1,5],["5–9.9 km",5,10],["10+ km",10,Infinity]]),unit:"affected km"},
      {name:"Source workbook",values:aggregate(weighted,"source_file"),unit:"affected km"}
    ];})())+`<div class="method-note">All ${number(payload.metadata.structure_occurrences)} structure occurrences are retained from ${number(payload.metadata.source_workbooks)} district workbooks plus the programme bridge GeoJSON. Multi-chainage rows are expanded. Linked road length is divided across structures on the same Link ID, so dashboard totals are additive and do not count one road repeatedly. Low-confidence and unmatched joins remain explicit in the exhaustive table.</div>`;
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
    ]) + `<div class="chart-grid">${barChart("Countries by configured region", "All countries retained and grouped by region.", regions, "country count", COLORS[0])}${barChart("Comparative source completeness", "Country metrics remain Not supplied until comparable sources are loaded.", [{name:"Comparable source supplied",value:sourced},{name:"Not supplied",value:rows.length-sourced}], "country count", COLORS[2])}</div>`+interactiveGallery("Global matrix · animated chart gallery",[{name:"Countries by region",values:regions,unit:"country count"},{name:"Source completeness",values:[{name:"Comparable source supplied",value:sourced},{name:"Not supplied",value:rows.length-sourced}],unit:"country count"}])+insightWall("Global country matrix · 50+ insight atlas",[
      {name:"Configured country",values:rows.map(row=>({name:row.country,value:1})),unit:"country"},
      {name:"Geographic region",values:regions,unit:"country count"},
      {name:"Comparable-source status",values:aggregate(rows,"source_status"),unit:"country count"}
    ])+`<div class="method-note">The Global dashboard reports matrix completeness, not invented performance rankings. All unsourced country metrics remain explicitly “Not supplied”.</div>`;
  }
  function summaryDashboard(relations, mindmap) {
    const relKm = predicate => relations.filter(predicate).reduce((s,r)=>s+Number(r.covered_length_km||0),0);
    const spatial = relKm(r => r.relation_basis.startsWith("Spatial"));
    const fallback = relKm(r => !r.relation_basis.startsWith("Spatial"));
    const total = spatial + fallback;
    const links=cache.links||[], database=cache.database||{tables:[]};
    const networkKm=links.reduce((s,r)=>s+Number(r.geometry_length_km||0),0);
    const supplied=(row,field)=>row[field]!==null&&row[field]!==undefined&&row[field]!==""&&shown(row[field])!=="Not supplied";
    const covered=field=>links.filter(row=>supplied(row,field)).reduce((s,row)=>s+Number(row.geometry_length_km||0),0);
    const trafficKm=links.filter(row=>typeof row.registry_aadt==="number").reduce((s,row)=>s+Number(row.geometry_length_km||0),0);
    const validIdKm=links.filter(row=>/^[A-Z]{4}\d{3}$/.test(row.link_id)).reduce((s,row)=>s+Number(row.geometry_length_km||0),0);
    const charts = barChart("Administrative relation basis", "True polygon intersections are separated from registry hierarchy fallbacks.", [{name:"Spatial polygon intersection",value:spatial},{name:"Registry hierarchy fallback",value:fallback}], "covered km", COLORS[5]) +
      barChart("Administrative length by pavement", "Every relation inherits the explicit paved/unpaved classification.", aggregate(relations, "pavement_class"), "covered km", COLORS[2]) +
      barChart("Administrative traffic coverage", "Exact-match traffic availability by relation-covered road length.", aggregate(relations, row => row.traffic_measured ? "Traffic supplied" : "Traffic not supplied"), "covered km", COLORS[0]);
    const nodes = mindmap.nodes || [];
    const edges=mindmap.edges||[];
    const mind = `<article class="matrix-card admin-block"><h3>Interactive DUCAR system mind map</h3><p>Hover or focus a node to inspect its type, stored records and relationship count.</p><div class="mind-map-canvas"><button class="mind-root" type="button">DUCAR Priority Studio<small>${number(networkKm,1)} network km</small></button><div class="mind-branches"><section><h4>Reporting sections</h4>${nodes.filter(n=>n.type==="section").map(n=>`<button class="mind-node" type="button" title="${esc(n.label)} · ${edges.filter(e=>e.from===n.id||e.to===n.id).length} relationships"><strong>${esc(n.label)}</strong><small>${edges.filter(e=>e.from===n.id||e.to===n.id).length} relationships</small></button>`).join("")}</section><section><h4>Data and evidence stores</h4>${nodes.filter(n=>n.type==="data").map(n=>`<button class="mind-node data" type="button" title="${esc(n.label)}"><strong>${esc(n.label)}</strong><small>${n.records?number(n.records)+" rows":"Connected store"}</small></button>`).join("")}</section></div></div></article>`;
    const parameterRows=LINK_FIELDS.map(field=>{const suppliedKm=covered(field);return {field,suppliedKm,gapKm:Math.max(0,networkKm-suppliedKm),pct:suppliedKm/Math.max(networkKm,1)*100};});
    const parameters=`<article class="matrix-card admin-block"><h3>All network parameters · length completeness</h3><p>Every governed field measured against the complete DUCAR geometry length.</p><div class="table-wrap admin-table"><table class="data-table"><thead><tr><th>Parameter</th><th>Supplied length</th><th>Gap length</th><th>Length completeness</th><th>Health</th></tr></thead><tbody>${parameterRows.map(row=>`<tr><td>${esc(label(row.field))}</td><td>${number(row.suppliedKm,3)} km</td><td>${number(row.gapKm,3)} km</td><td><div class="health-meter"><i style="width:${Math.min(100,row.pct)}%"></i><span>${number(row.pct,1)}%</span></div></td><td class="${row.pct>=95?"cell-good":row.pct>=70?"cell-fair":"cell-poor"}">${row.pct>=95?"Healthy":row.pct>=70?"Attention":"Gap"}</td></tr>`).join("")}</tbody></table></div></article>`;
    const representedLength=table=>table.table.includes("structure")?Number(cache.structures?.metadata?.road_length_with_structures_km||0):table.table.includes("traffic")?trafficKm:table.table.includes("country")||table.table.includes("districts")||table.table.includes("distance_matrix")?null:table.table.includes("condition")?covered("condition"):networkKm;
    const stores=`<article class="matrix-card admin-block"><h3>All DUCAR data stores</h3><p>Complete SQLite catalogue, schema scale, indexes and network length represented.</p><div class="table-wrap admin-table"><table class="data-table"><thead><tr><th>Data store</th><th>Rows</th><th>Columns</th><th>Indexes</th><th>Owned sections</th><th>Network length represented</th></tr></thead><tbody>${database.tables.map(table=>{const length=representedLength(table);return `<tr><td>${esc(table.table)}</td><td>${number(table.row_count)}</td><td>${number(table.column_count)}</td><td>${number(table.indexes.length)}</td><td>${esc(table.sections.join(", "))}</td><td>${length===null?"Not applicable":number(length,3)+" km"}</td></tr>`;}).join("")}</tbody></table></div></article>`;
    const healthSeries=[
      {name:"Link-ID standard",values:[{name:"Valid-ID length",value:validIdKm},{name:"ID gap length",value:Math.max(0,networkKm-validIdKm)}],unit:"covered km"},
      {name:"Traffic parameter health",values:[{name:"Traffic supplied",value:trafficKm},{name:"Traffic gap",value:networkKm-trafficKm}],unit:"covered km"},
      {name:"Condition parameter health",values:[{name:"Condition supplied",value:covered("condition")},{name:"Condition gap",value:networkKm-covered("condition")}],unit:"covered km"},
      {name:"Planning parameter health",values:[{name:"Priority supplied",value:covered("priority_band")},{name:"Priority gap",value:networkKm-covered("priority_band")}],unit:"covered km"}
    ];
    const relationRows=relations.map(row=>({...row,geometry_length_km:Number(row.covered_length_km||0)}));
    const adminInsights=[
      {name:"Administrative district",values:aggregate(relationRows,"admin_district"),unit:"covered km"},
      {name:"Relation basis",values:aggregate(relationRows,"relation_basis"),unit:"covered km"},
      {name:"Pavement class",values:aggregate(relationRows,"pavement_class"),unit:"covered km"},
      {name:"Road condition",values:aggregate(relationRows,"condition"),unit:"covered km"},
      {name:"Traffic-data coverage",values:aggregate(relationRows,row=>row.traffic_measured?"Traffic supplied":"Not supplied"),unit:"covered km"},
      {name:"Planning priority",values:aggregate(relationRows,"priority_band"),unit:"covered km"},
      {name:"Recommended intervention",values:aggregate(relationRows,"recommended_intervention"),unit:"covered km"},
      {name:"System parameter completeness",values:parameterRows.map(row=>({name:label(row.field),value:row.suppliedKm})),unit:"covered km"},
      {name:"Database store population",values:database.tables.map(table=>({name:table.table,value:Number(table.row_count||0)})),unit:"records"}
    ];
    return metricCards([{label:"Network geometry health",value:number(networkKm,1)+" km",note:"Complete DUCAR reporting denominator"},{label:"Valid Link-ID length",value:number(validIdKm,1)+" km",note:number(validIdKm/Math.max(networkKm,1)*100,1)+"% standard compliance"},{label:"Spatial admin length",value:number(spatial,1)+" km",note:"Polygon-intersected coverage"},{label:"Traffic parameter length",value:number(trafficKm,1)+" km",note:"Exact-match observation coverage"}]) + `<div class="chart-grid">${charts}</div>`+interactiveGallery("System health · animated chart gallery",healthSeries)+insightWall("System health & administration · 50+ insight atlas",adminInsights)+`<div class="admin-grid">${mind}${stores}${parameters}</div>`;
  }
  function dashboardHtml() {
    if (state.section === "global") return globalDashboard(cache.global);
    if (state.section === "summaries") return summaryDashboard(cache.relations, cache.mindmap);
    if (state.section === "socioeconomic") return socioeconomicDashboard(cache.socio);
    if (state.section === "structures") return structuresDashboard(cache.structures);
    return lengthDashboard(cache.links);
  }
  function recordDataset() {
    if (state.section === "global") return { rows: cache.global.rows, fields: Object.keys(cache.global.rows[0]) };
    if (state.section === "summaries") return { rows: cache.relations, fields: Object.keys(cache.relations[0]) };
    if (state.section === "socioeconomic") return { rows: cache.socio.rows, fields: RECORD_FIELDS.socioeconomic };
    if (state.section === "structures") return { rows: cache.structures.rows, fields: RECORD_FIELDS.structures };
    return { rows: cache.links, fields: RECORD_FIELDS[state.section] || LINK_FIELDS };
  }
  function cellClass(field, raw) {
    const value = shown(raw).toLowerCase();
    if (value === "not supplied" || value.includes("no comparable")) return "not-supplied";
    if (field === "condition" && ["good","fair","poor"].includes(value)) return "cell-" + value;
    if (field === "current_condition") return value.includes("very poor") ? "cell-critical" : value.includes("poor") ? "cell-poor" : value.includes("fair") ? "cell-fair" : value.includes("good") ? "cell-good" : "";
    if (field === "priority_band" && ["low","moderate","high","critical"].includes(value)) return "cell-" + value;
    if (field === "exposure_band" && ["low","moderate","high","critical"].includes(value)) return "cell-" + value;
    if (field === "risk_band" && ["low","moderate","high","critical"].includes(value)) return "cell-" + value;
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

  function mapHtml() {
    const roadLayers=[
      ["section","Section thematic roads",true],["all","All DUCAR roads",false],["paved","Paved · Bituminous + Concrete",false],["unpaved","Unpaved · Gravel + Earth",false],
      ["good","Good condition",false],["fair","Fair condition",false],["poor","Poor condition",false],["traffic","Traffic observations",false],["hightraffic","AADT 1,000+",false],
      ["critical","Critical + High priority",false],["maintenance","Maintenance interventions",false],["districts","District labels",false]
    ];
    const sectionLayers=state.section==="socioeconomic"?[["facility:All","All socioeconomic facilities · "+number(cache.facilities?.features?.length),true],...(cache.socio.category_summary||[]).map(item=>[`facility:${item.category}`,item.category+" facilities · "+number(item.features),false])]:state.section==="structures"?[["structure:All","All bridges & major culverts · "+number(cache.structures.metadata.structure_occurrences),true],...(cache.structures.class_summary||[]).map(item=>[`structure:${item.structure_class}`,item.structure_class+" · "+number((cache.structures.rows||[]).filter(row=>row.structure_class===item.structure_class).length),false])]:[];
    return `<div class="map-toolbar advanced"><div><strong>${esc(SECTION_META[state.section][0])} interactive geospatial workbench</strong><small>Complete DUCAR network · toggle layers, select a feature, measure distance and inspect its full report</small></div><label class="map-search"><span>Find road or district</span><input id="map-search" type="search" placeholder="Link ID, road name, district"><button id="map-search-button" type="button">Find</button></label></div><div class="map-workspace" id="map-workspace"><div class="map-stage"><div class="map-toolrail" role="toolbar" aria-label="Mapping tools"><button type="button" data-map-tool="zoom-in" title="Zoom in">＋</button><button type="button" data-map-tool="zoom-out" title="Zoom out">−</button><button type="button" data-map-tool="pan" title="Pan map">✥</button><button type="button" data-map-tool="select" class="active" title="Select feature">⌖</button><button type="button" data-map-tool="measure" title="Measure distance">⌁</button><button type="button" data-map-tool="clear" title="Clear selection and measurement">×</button><button type="button" data-map-tool="reset" title="Restore Uganda extent">⌂</button><button type="button" data-map-tool="fullscreen" title="Full size map">⛶</button><button type="button" data-map-tool="restore" title="Restore map size">↙</button></div><div class="map-compass" aria-label="North compass"><b>N</b><i></i></div><div id="section-map" class="section-map" role="application" aria-label="${esc(SECTION_META[state.section][0])} map"></div><div class="map-coordinate" id="map-coordinate">1.3500° N · 32.3000° E</div></div><aside class="map-catalogue"><section class="catalogue-layers"><header><div><small>MAP CATALOGUE</small><h3>Layers & symbology</h3></div><span>${roadLayers.length+sectionLayers.length+3} layers</span></header><div class="catalogue-scroll"><fieldset><legend>Basemap</legend>${[["dark","Dark cartography",true],["light","Light cartography",false],["osm","OpenStreetMap",false]].map(([id,text,checked])=>`<label><input type="radio" name="basemap" value="${id}" ${checked?"checked":""}><i class="layer-symbol basemap-${id}"></i><span>${text}</span></label>`).join("")}</fieldset><fieldset><legend>DUCAR thematic road layers</legend>${roadLayers.map(([id,text,checked])=>`<label><input type="checkbox" data-map-layer="${esc(id)}" ${checked?"checked":""}><i class="layer-symbol layer-${esc(id)}"></i><span>${esc(text)}</span><em data-layer-stat="${esc(id)}"></em></label>`).join("")}</fieldset>${sectionLayers.length?`<fieldset><legend>${state.section==="structures"?"Structures":"Socioeconomic facilities"}</legend>${sectionLayers.map(([id,text,checked])=>`<label><input type="checkbox" data-map-layer="${esc(id)}" ${checked?"checked":""}><i class="layer-symbol layer-point"></i><span>${esc(text)}</span></label>`).join("")}</fieldset>`:""}<fieldset><legend>Display</legend><label class="opacity-control"><span>Road opacity</span><input id="map-opacity" type="range" min="20" max="100" value="82"><em id="map-opacity-value">82%</em></label></fieldset><div class="catalogue-key"><h4>Dynamic key</h4><span><i style="background:#30d158"></i>Good / Low</span><span><i style="background:#ffd60a"></i>Fair / Moderate</span><span><i style="background:#ff9f0a"></i>Unpaved / High</span><span><i style="background:#ff375f"></i>Poor / Critical</span><span><i style="background:#64d2ff"></i>Facility / Structure</span><span><i class="selected-key"></i>Selected feature</span></div></div></section><section class="map-details"><header><div><small>LIVE SELECTION</small><h3>Details & report</h3></div><button id="map-details-expand" type="button">Expand</button></header><div id="map-details-content"><div class="map-empty-state"><b>⌖</b><strong>Select any visible feature</strong><span>The complete record and a section-specific report will appear here.</span></div></div></section></aside></div>`;
  }

  function mapColor(properties) {
    if (state.section === "condition") return ({Good:"#30d158",Fair:"#ffd60a",Poor:"#ff375f"})[properties.condition] || "#8e8e93";
    if (["pims","budgets","hdm4"].includes(state.section)) return ({Low:"#30d158",Moderate:"#ffd60a",High:"#ff9f0a",Critical:"#ff375f"})[properties.priority_band] || "#8e8e93";
    return properties.pavement_class === "Paved" ? "#0a84ff" : properties.pavement_class === "Unpaved" ? "#ff9f0a" : "#8e8e93";
  }

  function initSectionMap() {
    const node = document.getElementById("section-map");
    if (!node || !window.L || !cache.mapRoads) return;
    const map = L.map(node,{preferCanvas:true,zoomControl:false,doubleClickZoom:false}).setView([1.35,32.3],7);
    const bases={dark:L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{maxZoom:19,attribution:"© OpenStreetMap · © CARTO"}),light:L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",{maxZoom:19,attribution:"© OpenStreetMap · © CARTO"}),osm:L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap contributors"})};
    bases.dark.addTo(map); L.control.scale({imperial:false,maxWidth:150,position:"bottomleft"}).addTo(map);
    const linkById=new Map((cache.links||[]).map(row=>[row.link_id,row])), socioById=new Map((cache.socio?.rows||[]).map(row=>[row.link_id,row]));
    const merged=feature=>({...feature.properties,...(linkById.get(feature.properties.link_id)||{}),...(socioById.get(feature.properties.link_id)||{})});
    const sectionTheme=p=>state.section==="socioeconomic"?({Low:"#30d158",Moderate:"#ffd60a",High:"#ff9f0a",Critical:"#ff375f"})[p.exposure_band]||"#8e8e93":state.section==="traffic"?(typeof p.registry_aadt!=="number"?"#65656d":p.registry_aadt>=1000?"#ff375f":p.registry_aadt>=500?"#ff9f0a":p.registry_aadt>=150?"#ffd60a":"#30d158"):mapColor(p);
    const configs={
      section:{filter:()=>true,color:sectionTheme,weight:2.2},all:{filter:()=>true,color:()=>"#64d2ff",weight:1.6},paved:{filter:p=>p.pavement_class==="Paved",color:()=>"#0a84ff"},unpaved:{filter:p=>p.pavement_class==="Unpaved",color:()=>"#ff9f0a"},good:{filter:p=>p.condition==="Good",color:()=>"#30d158"},fair:{filter:p=>p.condition==="Fair",color:()=>"#ffd60a"},poor:{filter:p=>p.condition==="Poor",color:()=>"#ff375f"},traffic:{filter:p=>typeof p.registry_aadt==="number",color:()=>"#bf5af2",weight:2.5},hightraffic:{filter:p=>Number(p.registry_aadt)>=1000,color:()=>"#ff375f",weight:3},critical:{filter:p=>["Critical","High"].includes(p.priority_band),color:p=>p.priority_band==="Critical"?"#ff375f":"#ff9f0a",weight:2.8},maintenance:{filter:p=>String(p.recommended_intervention||"").toLowerCase().includes("maintenance"),color:()=>"#30d158",weight:2.5}
    };
    const activeLayers=new Map(), roadOpacity=()=>Number(document.getElementById("map-opacity")?.value||82)/100;
    let selectedLayer=null, selectMode=true, measureMode=false, measurePoints=[], measureLine=null, measureMarkers=L.layerGroup().addTo(map);
    const details=document.getElementById("map-details-content"), nationalKm=(cache.links||[]).reduce((s,r)=>s+Number(r.geometry_length_km||0),0);
    const reportHtml=(kind,p)=>{const allFields=kind==="Road"?(state.section==="structures"?LINK_FIELDS:(RECORD_FIELDS[state.section]||LINK_FIELDS)):Object.keys(p), length=Number(p.geometry_length_km||p.allocated_road_length_km||0), districtRows=(cache.links||[]).filter(row=>shown(row.district)===shown(p.district)), districtKm=districtRows.reduce((s,row)=>s+Number(row.geometry_length_km||0),0), structures=(cache.structures?.rows||[]).filter(row=>row.link_id===p.link_id);let owned="";
      if(state.section==="traffic")owned=`<div class="selection-insights"><span><b>${number(p.registry_aadt)}</b>AADT</span><span><b>${number(p.registry_pcu)}</b>PCU</span><span><b>${number(p.registry_speed_kmh,1)} km/h</b>Speed</span></div>`;
      else if(state.section==="condition")owned=`<div class="selection-insights"><span><b>${esc(shown(p.condition))}</b>Condition</span><span><b>${esc(shown(p.condition_risk))}</b>Risk score</span><span><b>${esc(shown(p.recommended_intervention))}</b>Action</span></div>`;
      else if(state.section==="socioeconomic")owned=`<div class="selection-insights"><span><b>${number(p.socioeconomic_exposure_score,2)}</b>Exposure score</span><span><b>${esc(shown(p.exposure_band))}</b>Exposure</span><span><b>${esc(shown(p.primary_socioeconomic_factor))}</b>Primary factor</span></div>`;
      else if(state.section==="structures")owned=`<div class="selection-insights"><span><b>${number(structures.length)}</b>Structures on link</span><span><b>${number(structures.reduce((s,row)=>s+Number(row.allocated_road_length_km||0),0),3)} km</b>Allocated exposure</span><span><b>${esc(shown(p.risk_band||structures[0]?.risk_band))}</b>Highest shown risk</span></div>`;
      else if(["pims","budgets","hdm4"].includes(state.section))owned=`<div class="selection-insights"><span><b>${number(p.planning_priority_score,1)}</b>Priority score</span><span><b>${esc(shown(p.priority_band))}</b>Priority</span><span><b>UGX ${number(Number(p.planning_cost_ugx||0)/1e6,1)}M</b>Allowance</span></div>`;
      else owned=`<div class="selection-insights"><span><b>${number(length,3)} km</b>Feature length</span><span><b>${number(length/Math.max(districtKm,1)*100,2)}%</b>District length</span><span><b>${number(length/Math.max(nationalKm,1)*100,3)}%</b>National length</span></div>`;
      return `<div class="selection-title"><small>${esc(kind)} · ${esc(shown(p.district))}</small><h4>${esc(shown(p.link_id||p.structure_id||p.name))}</h4><p>${esc(shown(p.road_name||p.linked_road_name||p.structure_name||p.category))}</p></div>${owned}<div class="selection-report"><h5>Complete selected record</h5>${allFields.map(field=>`<div><span>${esc(label(field))}</span><b>${esc(shown(p[field]))}</b></div>`).join("")}</div>`;};
    const selectFeature=(kind,p,feature,layer)=>{if(!selectMode&&!measureMode)return;if(measureMode)return;if(selectedLayer)selectedLayer.remove();if(feature?.geometry?.type?.includes("Line"))selectedLayer=L.geoJSON(feature,{style:{color:"#fff",weight:6,opacity:1}}).addTo(map);else if(layer?.getLatLng)selectedLayer=L.circleMarker(layer.getLatLng(),{radius:10,color:"#fff",weight:3,fillColor:"#0a84ff",fillOpacity:.7}).addTo(map);details.innerHTML=reportHtml(kind,p);document.querySelector(".map-details")?.classList.add("has-selection");};
    const roadLayer=id=>L.geoJSON(cache.mapRoads,{filter:feature=>configs[id].filter(merged(feature)),renderer:L.canvas({padding:.5}),style:feature=>{const p=merged(feature);return {color:configs[id].color(p),weight:configs[id].weight||2,opacity:roadOpacity()};},onEachFeature:(feature,layer)=>layer.on("click",()=>selectFeature("Road",merged(feature),feature,layer))});
    const districtLayer=()=>{const groups=new Map();cache.mapRoads.features.forEach(feature=>{const p=merged(feature), coords=feature.geometry.coordinates.flat(Infinity);if(coords.length<2)return;const key=shown(p.district),item=groups.get(key)||{lat:0,lng:0,n:0};for(let i=0;i<coords.length-1;i+=2){item.lng+=Number(coords[i]);item.lat+=Number(coords[i+1]);item.n++;}groups.set(key,item);});return L.layerGroup([...groups].map(([name,p])=>L.marker([p.lat/Math.max(p.n,1),p.lng/Math.max(p.n,1)],{icon:L.divIcon({className:"district-map-label",html:esc(name)})})));};
    const pointLayer=(id)=>{const [kind,category]=id.split(":");const source=kind==="facility"?cache.facilities:cache.structureMap;return L.geoJSON(source,{filter:f=>category==="All"||(kind==="facility"?f.properties.category:f.properties.structure_class)===category,renderer:L.canvas({padding:.5}),pointToLayer:(feature,latlng)=>L.circleMarker(latlng,{radius:kind==="facility"?4:6,color:"#050506",weight:1,fillColor:kind==="facility"?"#64d2ff":"#bf5af2",fillOpacity:.9}),onEachFeature:(feature,layer)=>layer.on("click",()=>selectFeature(kind==="facility"?"Facility":"Structure",feature.properties,feature,layer))});};
    const createLayer=id=>id==="districts"?districtLayer():id.includes(":")?pointLayer(id):roadLayer(id);
    document.querySelectorAll("[data-map-layer]").forEach(input=>{const id=input.dataset.mapLayer;if(configs[id]){const values=cache.mapRoads.features.map(merged).filter(configs[id].filter),km=values.reduce((s,p)=>s+Number(p.geometry_length_km||0),0),stat=document.querySelector(`[data-layer-stat="${id}"]`);if(stat)stat.textContent=number(km,1)+" km";}const toggle=()=>{if(input.checked){const layer=activeLayers.get(id)||createLayer(id);activeLayers.set(id,layer);layer.addTo(map);}else activeLayers.get(id)?.remove();};input.addEventListener("change",toggle);if(input.checked)toggle();});
    const sectionLayer=activeLayers.get("section");try{map.fitBounds(sectionLayer.getBounds(),{padding:[12,12]});}catch(_){}
    document.querySelectorAll('input[name="basemap"]').forEach(input=>input.addEventListener("change",()=>{Object.values(bases).forEach(layer=>layer.remove());bases[input.value].addTo(map);bases[input.value].bringToBack();}));
    const setTool=tool=>{document.querySelectorAll("[data-map-tool]").forEach(button=>button.classList.toggle("active",button.dataset.mapTool===tool));selectMode=tool==="select";measureMode=tool==="measure";node.classList.toggle("select-mode",selectMode);node.classList.toggle("measure-mode",measureMode);if(tool==="pan")map.dragging.enable();};setTool("select");
    const clearMap=()=>{if(selectedLayer){selectedLayer.remove();selectedLayer=null;}if(measureLine){measureLine.remove();measureLine=null;}measureMarkers.clearLayers();measurePoints=[];details.innerHTML=`<div class="map-empty-state"><b>⌖</b><strong>Select any visible feature</strong><span>The complete record and a section-specific report will appear here.</span></div>`;};
    document.querySelectorAll("[data-map-tool]").forEach(button=>button.addEventListener("click",async()=>{const tool=button.dataset.mapTool;if(tool==="zoom-in")map.zoomIn();else if(tool==="zoom-out")map.zoomOut();else if(["pan","select","measure"].includes(tool))setTool(tool);else if(tool==="clear")clearMap();else if(tool==="reset")map.fitBounds(sectionLayer.getBounds(),{padding:[12,12]});else if(tool==="fullscreen"){const workspace=document.getElementById("map-workspace");if(workspace.requestFullscreen)await workspace.requestFullscreen();else workspace.classList.add("map-fullscreen-fallback");setTimeout(()=>map.invalidateSize(),120);}else if(tool==="restore"){if(document.fullscreenElement)await document.exitFullscreen();document.getElementById("map-workspace")?.classList.remove("map-fullscreen-fallback");setTimeout(()=>map.invalidateSize(),120);}}));
    map.on("mousemove",event=>{const lat=event.latlng.lat,lng=event.latlng.lng;document.getElementById("map-coordinate").textContent=`${Math.abs(lat).toFixed(5)}° ${lat>=0?"N":"S"} · ${Math.abs(lng).toFixed(5)}° ${lng>=0?"E":"W"}`;});
    map.on("click",event=>{if(!measureMode)return;measurePoints.push(event.latlng);L.circleMarker(event.latlng,{radius:4,color:"#fff",fillColor:"#0a84ff",fillOpacity:1}).addTo(measureMarkers);if(measureLine)measureLine.remove();measureLine=L.polyline(measurePoints,{color:"#64d2ff",weight:3,dashArray:"7 5"}).addTo(map);const km=measurePoints.slice(1).reduce((sum,p,i)=>sum+map.distance(measurePoints[i],p)/1000,0);details.innerHTML=`<div class="selection-title"><small>MEASUREMENT REPORT</small><h4>${number(km,3)} km</h4><p>${measurePoints.length} measurement vertices · double-click to finish</p></div><div class="selection-insights"><span><b>${number(km*1000,0)} m</b>Distance</span><span><b>${number(measurePoints.length)}</b>Vertices</span><span><b>${number(map.getZoom())}</b>Map zoom</span></div>`;});
    map.on("dblclick",()=>{if(measureMode)setTool("pan");});
    document.getElementById("map-opacity")?.addEventListener("input",event=>{document.getElementById("map-opacity-value").textContent=event.target.value+"%";activeLayers.forEach((layer,id)=>{if(configs[id])layer.setStyle?.({opacity:Number(event.target.value)/100});});});
    const search=()=>{const query=document.getElementById("map-search").value.trim().toLowerCase();if(!query)return;const feature=cache.mapRoads.features.find(item=>{const p=merged(item);return [p.link_id,p.road_name,p.district].some(value=>String(value||"").toLowerCase().includes(query));});if(feature){const temp=L.geoJSON(feature);map.fitBounds(temp.getBounds(),{maxZoom:15,padding:[50,50]});selectFeature("Road",merged(feature),feature,null);}};
    document.getElementById("map-search-button")?.addEventListener("click",search);document.getElementById("map-search")?.addEventListener("keydown",event=>{if(event.key==="Enter")search();});
    document.getElementById("map-details-expand")?.addEventListener("click",event=>{const pane=document.querySelector(".map-details"),expanded=pane.classList.toggle("expanded");event.currentTarget.textContent=expanded?"Collapse":"Expand";});
    document.onfullscreenchange=()=>setTimeout(()=>map.invalidateSize(),120);setTimeout(()=>map.invalidateSize(),100);
  }

  function districtAnalytics(rows) {
    const groups = new Map();
    rows.forEach(row=>{
      const district=shown(row.district), item=groups.get(district)||{district,total_length_km:0,paved_length_km:0,unpaved_length_km:0,poor_length_km:0,traffic_covered_length_km:0,critical_high_length_km:0,planning_cost_ugx:0};
      const length=Number(row.geometry_length_km||0); item.total_length_km+=length;
      if(row.pavement_class==="Paved")item.paved_length_km+=length; if(row.pavement_class==="Unpaved")item.unpaved_length_km+=length;
      if(row.condition==="Poor")item.poor_length_km+=length; if(typeof row.registry_aadt==="number")item.traffic_covered_length_km+=length;
      if(["Critical","High"].includes(row.exposure_band||row.priority_band))item.critical_high_length_km+=length;
      item.planning_cost_ugx+=Number(row.planning_cost_ugx||0); groups.set(district,item);
    });
    return [...groups.values()].sort((a,b)=>a.district.localeCompare(b.district));
  }

  function structureAnalytics(payload) {
    const rows=payload.rows||[], links=payload.link_summary||[];
    const allocated=field=>aggregate(rows.map(row=>({...row,geometry_length_km:Number(row.allocated_road_length_km||0)})),field);
    const fields=["link_id","road_name","district","geometry_length_km","structure_records","bridge_records","major_culvert_records","dominant_structure_condition","highest_structure_risk"];
    return `<div class="chart-grid">${barChart("Linked-road length by structure class","Allocated road exposure; no Link ID is double-counted in the complete total.",allocated("structure_class"),"affected km",COLORS[5])}${barChart("Linked-road length by structure condition","Every supplied structure condition translated to affected road length.",allocated("current_condition"),"affected km",COLORS[1])}${barChart("Linked-road length by linkage quality","Road length associated with high, moderate, low and spatial joins.",allocated("linkage_quality"),"affected km",COLORS[0])}${barChart("Linked-road length by source register","Every district workbook and programme source retained.",allocated("source_file"),"affected km",COLORS[2])}</div><div class="method-note">The structure-to-road relation is auditable through source file, source row, chainage, Link ID, match score, linkage quality and map-location method. ${number(payload.metadata.structure_occurrences-payload.metadata.linked_structure_occurrences)} unmatched occurrences remain in the exhaustive table and are never assigned fabricated road length.</div><div class="records-status"><strong>${number(links.length)}</strong> DUCAR Link IDs with linked structures · complete per-link structure matrix</div><div class="table-wrap analytics-table"><table class="data-table"><thead><tr>${fields.map(field=>`<th>${esc(label(field))}</th>`).join("")}</tr></thead><tbody>${links.map(row=>`<tr>${fields.map(field=>`<td class="${cellClass(field,row[field])}">${esc(field==="geometry_length_km"?number(row[field],4)+" km":shown(row[field]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function analyticsHtml() {
    if (state.section === "global") return `<div class="method-note">The complete all-country comparison matrix is owned by this section’s exhaustive table. Unsourced metrics remain explicitly Not supplied.</div>${barChart("Country coverage by region","All configured countries, without selective reporting.",aggregate(cache.global.rows,"region"),"country count",COLORS[0])}`;
    if (state.section === "structures") return structureAnalytics(cache.structures);
    const rows = state.section === "summaries" ? cache.relations.map(r=>({...r,district:r.admin_district,geometry_length_km:r.covered_length_km})) : state.section === "socioeconomic" ? cache.socio.rows : cache.links;
    const districts = districtAnalytics(rows), fields = ["district","total_length_km","paved_length_km","unpaved_length_km","poor_length_km","traffic_covered_length_km","critical_high_length_km","planning_cost_ugx"];
    const charts = state.section === "socioeconomic" ? `${barChart("Accessibility exposure band","Every road by cumulative affected length.",aggregate(rows,"exposure_band"),"affected km",COLORS[4])}${barChart("Primary factor coverage","Dominant socioeconomic factor by length.",aggregate(rows,"primary_socioeconomic_factor"),"affected km",COLORS[2])}` : `${barChart("Deep condition cross-section","All length by condition.",aggregate(rows,"condition"),"affected km",COLORS[1])}${barChart("Deep pavement cross-section","All length by pavement class.",aggregate(rows,"pavement_class"),"affected km",COLORS[2])}`;
    const provenance = state.section === "socioeconomic" ? `<article class="matrix-card analytics-provenance"><h3>Geospatial source register</h3><p>Authority and scope retained with the analysis.</p><div class="source-grid">${cache.socio.metadata.sources.map(source=>`<a href="${esc(source.url)}" target="_blank" rel="noreferrer"><strong>${esc(source.name)}</strong><small>${esc(source.coverage)}</small></a>`).join("")}</div><div class="category-grid">${cache.socio.category_summary.map(item=>`<span><strong>${number(item.features)}</strong>${esc(item.category)}</span>`).join("")}</div></article>` : "";
    return `<div class="chart-grid">${charts}${provenance}</div><div class="records-status"><strong>${number(districts.length)}</strong> administrative units · cumulative length, coverage, risk and planning relations</div><div class="table-wrap analytics-table"><table class="data-table"><thead><tr>${fields.map(f=>`<th>${esc(label(f))}</th>`).join("")}</tr></thead><tbody>${districts.map(row=>`<tr>${fields.map(f=>`<td>${esc(f==="district"?row[f]:f==="planning_cost_ugx"?"UGX "+number(row[f],0):number(row[f],3)+" km")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
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
    vizTimers.forEach(timer=>clearInterval(timer)); vizTimers.clear();
    const restoreFocus = document.activeElement?.classList?.contains("records-search");
    state.loading = true;
    shell(`<div class="studio-loading">Loading this section’s complete reporting population…</div>`);
    try { await ensureData(); state.loading=false; } catch (error) { state.loading=false; shell(`<div class="studio-loading">${esc(error.message)}</div>`); return; }
    let body = state.tab === "dashboard" ? dashboardHtml() : state.tab === "map" ? mapHtml() : state.tab === "records" ? recordsHtml() : state.tab === "analytics" ? analyticsHtml() : state.tab === "sql" ? sqlHtml() : schemaHtml();
    shell(body); bind();
    if (state.tab === "map") initSectionMap();
    if (restoreFocus) { const input=root.querySelector(".records-search"); input?.focus(); input?.setSelectionRange(input.value.length,input.value.length); }
  }
  function shell(body) {
    document.body.classList.remove("network-map-mode");
    root.innerHTML = `<section class="exhaustive-shell"><div class="section-studio"><nav class="section-tabs" aria-label="Section reporting views">${SECTION_TABS.map(([id,text])=>`<a class="section-tab ${state.tab===id?"active":""}" href="#${state.section}:${id}">${esc(text)}</a>`).join("")}</nav>${body}</div></section>`;
  }
  function bind() {
    const search=root.querySelector(".records-search"); if(search) search.addEventListener("input",()=>{state.search=search.value;state.page=1;render();});
    root.querySelector("[data-export]")?.addEventListener("click",()=>exportRecords(recordDataset()));
    root.querySelector('[data-page="prev"]')?.addEventListener("click",()=>{state.page--;render();});
    root.querySelector('[data-page="next"]')?.addEventListener("click",()=>{state.page++;render();});
    root.querySelectorAll("[data-viz-studio]").forEach(studio=>{
      const buttons=[...studio.querySelectorAll("[data-viz-type]")], panels=[...studio.querySelectorAll("[data-viz-panel]")];
      let active=0, timer=null;
      const show=index=>{active=(index+buttons.length)%buttons.length;buttons.forEach((button,i)=>{button.classList.toggle("active",i===active);button.setAttribute("aria-selected",String(i===active));});panels.forEach((panel,i)=>{panel.classList.toggle("active",i===active);if(i===active){panel.classList.remove("animate-in");void panel.offsetWidth;panel.classList.add("animate-in");}});};
      buttons.forEach((button,index)=>button.addEventListener("click",()=>show(index)));
      studio.querySelector("[data-viz-autoplay]")?.addEventListener("click",event=>{if(timer){clearInterval(timer);vizTimers.delete(timer);timer=null;event.currentTarget.textContent="▶ Animate views";event.currentTarget.classList.remove("active");}else{event.currentTarget.textContent="Ⅱ Pause animation";event.currentTarget.classList.add("active");timer=setInterval(()=>show(active+1),2200);vizTimers.add(timer);show(active+1);}});
    });
    root.querySelectorAll("[data-insight-wall]").forEach(wall=>{
      const cards=[...wall.querySelectorAll("[data-insight-card]")], series=wall.querySelector("[data-insight-series]"), search=wall.querySelector("[data-insight-search]"), count=wall.querySelector("[data-insight-count]"), empty=wall.querySelector(".insight-empty");
      const filter=()=>{const dimension=series?.value||"all", query=(search?.value||"").trim().toLowerCase();let visible=0;cards.forEach(card=>{const showCard=(dimension==="all"||card.dataset.series===dimension)&&(!query||card.dataset.insightSearch.includes(query));card.hidden=!showCard;if(showCard)visible++;});if(count)count.textContent=number(visible);if(empty)empty.hidden=visible!==0;};
      series?.addEventListener("change",filter);search?.addEventListener("input",filter);
      wall.querySelector("[data-insight-motion]")?.addEventListener("click",event=>{const paused=wall.classList.toggle("motion-paused");event.currentTarget.textContent=paused?"Resume motion":"Pause motion";});
    });
  }
  function activateSection(section) {
    if (!section || section===state.section) return;
    state.section=section;state.tab="dashboard";state.page=1;state.search="";history.replaceState(null,"",`#${section}:dashboard`);render();setTimeout(syncInjectedNav,0);
  }
  document.addEventListener("click",event=>{
    const button=event.target.closest?.("button[title]");
    if(button)setTimeout(()=>activateSection(sectionFromTitle(button.getAttribute("title"))),0);
  },true);
  function ensureSocioeconomicNav() {
    if (document.querySelector('button[title="Socioeconomic Analysis"]')) return true;
    const globalButton = document.querySelector('button[title="Global"]');
    if (!globalButton) return false;
    const button = globalButton.cloneNode(true); button.setAttribute("title","Socioeconomic Analysis"); button.setAttribute("aria-label","Socioeconomic Analysis");
    const walker=document.createTreeWalker(button,NodeFilter.SHOW_TEXT); let node;
    while((node=walker.nextNode())) if(node.nodeValue.trim()==="Global") node.nodeValue=node.nodeValue.replace("Global","Socioeconomic Analysis");
    globalButton.insertAdjacentElement("afterend",button); return true;
  }
  function ensureStructuresNav() {
    if (document.querySelector('button[title="Structures"]')) return true;
    const conditionButton=document.querySelector('button[title="Condition"]');
    if(!conditionButton)return false;
    const button=conditionButton.cloneNode(true);button.setAttribute("title","Structures");button.setAttribute("aria-label","Structures");
    const walker=document.createTreeWalker(button,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode()))if(node.nodeValue.trim()==="Condition")node.nodeValue=node.nodeValue.replace("Condition","Structures");
    conditionButton.insertAdjacentElement("afterend",button);syncInjectedNav();return true;
  }
  function syncInjectedNav(){document.querySelectorAll('button[title="Structures"],button[title="Socioeconomic Analysis"]').forEach(button=>button.classList.toggle("codex-injected-active",sectionFromTitle(button.title)===state.section));}
  let navAttempts=0; const navTimer=setInterval(()=>{navAttempts++;const ready=ensureSocioeconomicNav()&&ensureStructuresNav();if(ready||navAttempts>40)clearInterval(navTimer);},250);
  window.addEventListener("hashchange",()=>{
    state.section=sectionFromHash();state.tab=tabFromHash();state.page=1;state.search="";render();setTimeout(syncInjectedNav,0);
  });
  render();
})();
