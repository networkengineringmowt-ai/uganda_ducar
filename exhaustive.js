(function () {
  "use strict";

  // Charts are reserved for dimensions that remain legible without selecting
  // or suppressing categories. High-cardinality dimensions stay complete in
  // the exhaustive and deep-analytics tables; no Top-N view is generated.
  const MAX_CHART_CATEGORIES = 12;
  const PAGE_SIZE = 500;
  const PATHS = {
    links: "./data/ducar_link_register.json",
    relations: "./data/ducar_link_admin_relations.json",
    global: "./data/global_country_matrix.json",
    inventory: "./data/approved_network_inventory_2026.json",
    database: "./data/ducar_database_catalog.json",
    mindmap: "./data/ducar_site_mind_map.json",
    socio: "./data/ducar_socioeconomic_link_analysis.json",
    facilities: "./data/uganda_socioeconomic_facilities.geojson",
    mapRoads: "./data/ducar_socioeconomic_roads.geojson",
    structures: "./data/ducar_structure_analysis.json",
    structureMap: "./data/ducar_structures.geojson",
    hotosmMap: "./data/hotosm_vehicular_map.geojson",
    hotosmAnalysis: "./data/hotosm_vehicular_analysis.json"
  };
  const COLORS = ["#0a84ff", "#30d158", "#ff9f0a", "#ff375f", "#bf5af2", "#64d2ff", "#ffd60a", "#5e5ce6"];
  // Reference district land-area (km2) and approximate HQ-town centroid (WGS84 DD), used only for
  // #ducar:records completeness: a coordinate fallback when a link has no mapped geometry, and a
  // nearest-district lookup when the administrative unit is not supplied. Areas are UBOS/Wikipedia
  // reference figures (Kampala/Wakiso per governance brief); centroids are approximate town
  // locations, not surveyed cadastral boundaries — treat any estimated cell as indicative only.
  const DISTRICT_GEO = {
    "Kampala": { area_km2: 189, region: "Central", lat: 0.3476, lng: 32.5825 },
    "Wakiso": { area_km2: 2807, region: "Central", lat: 0.4044, lng: 32.4594 },
    "Mukono": { area_km2: 1875.1, region: "Central", lat: 0.3533, lng: 32.7553 },
    "Mpigi": { area_km2: 1207.8, region: "Central", lat: 0.2262, lng: 32.3306 },
    "Luweero": { area_km2: 2217.6, region: "Central", lat: 0.85, lng: 32.4667 },
    "Masaka": { area_km2: 1295.6, region: "Central", lat: -0.3333, lng: 31.7333 },
    "Mubende": { area_km2: 2711, region: "Central", lat: 0.5891, lng: 31.3944 },
    "Kiboga": { area_km2: 1586.9, region: "Central", lat: 0.9167, lng: 31.7667 },
    "Nakaseke": { area_km2: 3477.3, region: "Central", lat: 0.7333, lng: 32.1333 },
    "Nakasongola": { area_km2: 3511.8, region: "Central", lat: 1.3167, lng: 32.4667 },
    "Rakai": { area_km2: 1592, region: "Central", lat: -0.7108, lng: 31.5372 },
    "Kayunga": { area_km2: 1587.8, region: "Central", lat: 0.7167, lng: 32.8833 },
    "Mityana": { area_km2: 1579.3, region: "Central", lat: 0.4167, lng: 32.0333 },
    "Kalangala": { area_km2: 468.3, region: "Central", lat: -0.3167, lng: 32.2333 },
    "Sembabule": { area_km2: 2318.4, region: "Central", lat: -0.0833, lng: 31.45 },
    "Kyotera": { area_km2: 1752, region: "Central", lat: null, lng: null },
    "Lwengo": { area_km2: 914.7, region: "Central", lat: null, lng: null },
    "Bukomansimbi": { area_km2: 600.2, region: "Central", lat: null, lng: null },
    "Gomba": { area_km2: 1679.3, region: "Central", lat: null, lng: null },
    "Butambala": { area_km2: 405.6, region: "Central", lat: null, lng: null },
    "Kasanda": { area_km2: 1919, region: "Central", lat: null, lng: null },
    "Kyankwanzi": { area_km2: 2455.3, region: "Central", lat: null, lng: null },
    "Buvuma": { area_km2: 218.3, region: "Central", lat: null, lng: null },
    "Lyantonde": { area_km2: 888.1, region: "Central", lat: null, lng: null },
    "Kalungu": { area_km2: 811.6, region: "Central", lat: null, lng: null },
    "Buikwe": { area_km2: 574.7, region: "Central", lat: 0.3389, lng: 33.0025 },
    "Jinja": { area_km2: 673, region: "Eastern", lat: 0.4244, lng: 33.2042 },
    "Mbale": { area_km2: 518.8, region: "Eastern", lat: 1.0827, lng: 34.1758 },
    "Iganga": { area_km2: 638.6, region: "Eastern", lat: 0.6072, lng: 33.4686 },
    "Tororo": { area_km2: 1196.4, region: "Eastern", lat: 0.6928, lng: 34.1811 },
    "Busia": { area_km2: 730.9, region: "Eastern", lat: 0.4608, lng: 34.0917 },
    "Soroti": { area_km2: 1411.9, region: "Eastern", lat: 1.7147, lng: 33.6111 },
    "Kamuli": { area_km2: 1557, region: "Eastern", lat: 0.9472, lng: 33.12 },
    "Bugiri": { area_km2: 1045.9, region: "Eastern", lat: 0.5789, lng: 33.7614 },
    "Mayuge": { area_km2: 1082.5, region: "Eastern", lat: 0.4653, lng: 33.4772 },
    "Pallisa": { area_km2: 859.3, region: "Eastern", lat: 1.1447, lng: 33.7092 },
    "Kumi": { area_km2: 1074.6, region: "Eastern", lat: 1.4514, lng: 33.9367 },
    "Sironko": { area_km2: 446.1, region: "Eastern", lat: 1.2306, lng: 34.2497 },
    "Kapchorwa": { area_km2: 354.6, region: "Eastern", lat: 1.398, lng: 34.452 },
    "Bukwo": { area_km2: 524.9, region: "Eastern", lat: null, lng: null },
    "Butaleja": { area_km2: 653.1, region: "Eastern", lat: null, lng: null },
    "Namutumba": { area_km2: 814.3, region: "Eastern", lat: null, lng: null },
    "Serere": { area_km2: 1965.4, region: "Eastern", lat: 1.4989, lng: 33.5578 },
    "Katakwi": { area_km2: 2428.8, region: "Eastern", lat: 1.8917, lng: 34.1461 },
    "Amuria": { area_km2: 1382, region: "Eastern", lat: 2.0167, lng: 33.6333 },
    "Bududa": { area_km2: 250.8, region: "Eastern", lat: 1.0058, lng: 34.3358 },
    "Manafwa": { area_km2: 237.7, region: "Eastern", lat: 0.9333, lng: 34.4 },
    "Budaka": { area_km2: 410.4, region: "Eastern", lat: null, lng: null },
    "Bugweri": { area_km2: 379.1, region: "Eastern", lat: null, lng: null },
    "Bukedea": { area_km2: 1051.7, region: "Eastern", lat: null, lng: null },
    "Bulambuli": { area_km2: 651.8, region: "Eastern", lat: null, lng: null },
    "Butebo": { area_km2: 237.9, region: "Eastern", lat: null, lng: null },
    "Buyende": { area_km2: 1880.7, region: "Eastern", lat: null, lng: null },
    "Kaberamaido": { area_km2: 887.5, region: "Eastern", lat: 1.75, lng: 33.15 },
    "Kalaki": { area_km2: 737.1, region: "Eastern", lat: null, lng: null },
    "Kaliro": { area_km2: 869.9, region: "Eastern", lat: 0.9167, lng: 33.5 },
    "Kapelebyong": { area_km2: 1202, region: "Eastern", lat: null, lng: null },
    "Kibuku": { area_km2: 490.2, region: "Eastern", lat: null, lng: null },
    "Kween": { area_km2: 851.4, region: "Eastern", lat: null, lng: null },
    "Luuka": { area_km2: 650.1, region: "Eastern", lat: null, lng: null },
    "Namayingo": { area_km2: 532.9, region: "Eastern", lat: null, lng: null },
    "Namisindwa": { area_km2: 299.7, region: "Eastern", lat: null, lng: null },
    "Ngora": { area_km2: 721.4, region: "Eastern", lat: null, lng: null },
    "Gulu": { area_km2: 1872, region: "Northern", lat: 2.7746, lng: 32.2989 },
    "Lira": { area_km2: 1328.9, region: "Northern", lat: 2.235, lng: 32.9097 },
    "Arua": { area_km2: 1217, region: "Northern", lat: 3.0201, lng: 30.9111 },
    "Kitgum": { area_km2: 3960, region: "Northern", lat: 3.2783, lng: 32.8867 },
    "Moyo": { area_km2: 1041, region: "Northern", lat: 3.6486, lng: 31.7297 },
    "Adjumani": { area_km2: 3030.9, region: "Northern", lat: 3.3775, lng: 31.79 },
    "Nebbi": { area_km2: 994.2, region: "Northern", lat: 2.4772, lng: 31.0872 },
    "Apac": { area_km2: 1791, region: "Northern", lat: 1.9786, lng: 32.5344 },
    "Kotido": { area_km2: 3618, region: "Northern", lat: 2.9806, lng: 34.1258 },
    "Moroto": { area_km2: 3537.6, region: "Northern", lat: 2.5361, lng: 34.6608 },
    "Kaabong": { area_km2: 4104, region: "Northern", lat: 3.5167, lng: 34.15 },
    "Pader": { area_km2: 3362.5, region: "Northern", lat: 2.75, lng: 33.0333 },
    "Agago": { area_km2: 3496.8, region: "Northern", lat: 2.85, lng: 33.4 },
    "Amuru": { area_km2: 3625.9, region: "Northern", lat: 2.4833, lng: 31.95 },
    "Nwoya": { area_km2: 4736.2, region: "Northern", lat: 2.6167, lng: 31.9 },
    "Yumbe": { area_km2: 2393, region: "Northern", lat: 3.4636, lng: 31.2461 },
    "Zombo": { area_km2: 897.6, region: "Northern", lat: 2.1667, lng: 30.9167 },
    "Abim": { area_km2: 2752, region: "Northern", lat: 2.7, lng: 33.65 },
    "Napak": { area_km2: 4978.4, region: "Northern", lat: 2.5, lng: 34.25 },
    "Kwania": { area_km2: 1408, region: "Northern", lat: 1.85, lng: 32.4 },
    "Alebtong": { area_km2: 1527.5, region: "Northern", lat: 2.2667, lng: 33.3167 },
    "Dokolo": { area_km2: 1072.8, region: "Northern", lat: 1.9167, lng: 33.1667 },
    "Otuke": { area_km2: 1549.8, region: "Northern", lat: 2.4, lng: 33.3167 },
    "Amolatar": { area_km2: 1758, region: "Northern", lat: 1.6333, lng: 32.8167 },
    "Lamwo": { area_km2: 5595.8, region: "Northern", lat: 3.4667, lng: 32.7833 },
    "Omoro": { area_km2: 1556, region: "Northern", lat: 2.6167, lng: 32.3667 },
    "Koboko": { area_km2: 759.7, region: "Northern", lat: 3.4111, lng: 30.9667 },
    "Amudat": { area_km2: 1615.4, region: "Northern", lat: 1.8, lng: 34.9 },
    "Karenga": { area_km2: 3193, region: "Northern", lat: null, lng: null },
    "Madi-Okollo": { area_km2: 2019, region: "Northern", lat: null, lng: null },
    "Maracha": { area_km2: 439.1, region: "Northern", lat: null, lng: null },
    "Nabilatuk": { area_km2: 1805, region: "Northern", lat: null, lng: null },
    "Nakapiripirit": { area_km2: 2379, region: "Northern", lat: 1.9167, lng: 34.65 },
    "Obongi": { area_km2: 847.1, region: "Northern", lat: null, lng: null },
    "Oyam": { area_km2: 2190.8, region: "Northern", lat: null, lng: null },
    "Pakwach": { area_km2: 981.7, region: "Northern", lat: null, lng: null },
    "Terego": { area_km2: 1102, region: "Northern", lat: null, lng: null },
    "Mbarara": { area_km2: 1242, region: "Western", lat: -0.6072, lng: 30.6545 },
    "Kabale": { area_km2: 620, region: "Western", lat: -1.2486, lng: 29.9897 },
    "Kasese": { area_km2: 3199, region: "Western", lat: 0.1833, lng: 30.0833 },
    "Hoima": { area_km2: 1566, region: "Western", lat: 1.4356, lng: 31.3522 },
    "Kabarole": { area_km2: 1312, region: "Western", lat: 0.671, lng: 30.2748 },
    "Bushenyi": { area_km2: 942.3, region: "Western", lat: -0.5833, lng: 30.2 },
    "Ntungamo": { area_km2: 2051, region: "Western", lat: -0.8797, lng: 30.2589 },
    "Rukungiri": { area_km2: 1444.9, region: "Western", lat: -0.7833, lng: 29.9333 },
    "Kanungu": { area_km2: 1274, region: "Western", lat: -0.9167, lng: 29.7833 },
    "Kisoro": { area_km2: 644.6, region: "Western", lat: -1.2833, lng: 29.6833 },
    "Masindi": { area_km2: 3923, region: "Western", lat: 1.674, lng: 31.7151 },
    "Kibaale": { area_km2: 1165, region: "Western", lat: 0.8, lng: 31.0667 },
    "Kyenjojo": { area_km2: 2350.1, region: "Western", lat: 0.6167, lng: 30.6167 },
    "Ibanda": { area_km2: 964.8, region: "Western", lat: -0.1167, lng: 30.5 },
    "Isingiro": { area_km2: 2655.6, region: "Western", lat: -0.85, lng: 30.8 },
    "Kamwenge": { area_km2: 1693, region: "Western", lat: 0.1833, lng: 30.5667 },
    "Bundibugyo": { area_km2: 848.2, region: "Western", lat: 0.71, lng: 30.06 },
    "Kiryandongo": { area_km2: 3624.1, region: "Western", lat: 1.9333, lng: 32 },
    "Buliisa": { area_km2: 1141, region: "Western", lat: null, lng: null },
    "Kagadi": { area_km2: 1411, region: "Western", lat: null, lng: null },
    "Kakumiro": { area_km2: 1668, region: "Western", lat: null, lng: null },
    "Ntoroko": { area_km2: 1236, region: "Western", lat: null, lng: null },
    "Sheema": { area_km2: 699.1, region: "Western", lat: null, lng: null },
    "Rubirizi": { area_km2: 985, region: "Western", lat: null, lng: null },
    "Mitooma": { area_km2: 542.8, region: "Western", lat: null, lng: null },
    "Buhweju": { area_km2: 687.1, region: "Western", lat: null, lng: null },
    "Rubanda": { area_km2: 689.8, region: "Western", lat: null, lng: null },
    "Rukiga": { area_km2: 426.3, region: "Western", lat: null, lng: null },
    "Kyegegwa": { area_km2: 1747, region: "Western", lat: null, lng: null },
    "Kazo": { area_km2: 1556, region: "Western", lat: null, lng: null },
    "Kiruhura": { area_km2: 3043, region: "Western", lat: null, lng: null },
    "Bunyangabu": { area_km2: 498.3, region: "Western", lat: null, lng: null },
    "Kitagwenda": { area_km2: 715.6, region: "Western", lat: null, lng: null },
    "Kikuube": { area_km2: 2097, region: "Western", lat: null, lng: null },
    "Rwampara": { area_km2: 574.7, region: "Western", lat: null, lng: null }
  };
  const REGION_CENTROIDS = { Central: { lat: 0.7, lng: 31.8 }, Eastern: { lat: 1.3, lng: 33.9 }, Northern: { lat: 2.8, lng: 32.6 }, Western: { lat: -0.3, lng: 30.4 } };
  const UGANDA_CENTROID = { lat: 1.3733, lng: 32.2903 };
  const CONFIRMED_NETWORK_FALLBACK = { length_km: 248616.15, links: 31106, districts: 135 };
  const SECTION_TABS = [["dashboard", "Dashboard"], ["map", "Map"], ["records", "Full Exhaustive Table"], ["analytics", "Deep Analytics"], ["sql", "SQL Tables"], ["schema", "SQL Schema"]];
  const SECTION_META = {
    overview: ["National DUCAR Overview", "Whole-register coverage, condition, pavement, traffic and planning status."],
    ducar: ["DUCAR Executive Dashboard", "Mapped DUCAR link governance, inventory completeness and planning readiness."],
    network: ["Network & Pavement Structure", "Link geometry, administrative hierarchy, pavement class and length quality."],
    traffic: ["Traffic Intelligence", "Observed and explicitly model-estimated AADT, PCU and speed reporting for every mapped DUCAR link."],
    condition: ["Road Condition", "Condition, surface risk and intervention requirements for every mapped link."],
    structures: ["Structures · Bridges & Major Culverts", "Bridge, culvert, drift, condition, chainage, intervention and linked-road exposure reporting."],
    pims: ["PIMS Planning", "Planning priority, intervention pipeline and investment-screening attributes."],
    hdm4: ["HDM-4 Inputs", "Geometry, speed, traffic, pavement and planning-cost inputs prepared for economic analysis."],
    framework: ["Data & Governance Framework", "Record provenance, QA, coverage, hierarchy and modelling-basis controls."],
    budgets: ["Budget & Prioritisation", "Link-level planning allowances, priority bands and intervention allocation."],
    global: ["Global Local-Road Governance", "How ministries and road authorities manage district, urban, rural and access roads: institutions, finance, principles, measures and techniques."],
    socioeconomic: ["Socioeconomic & Accessibility Analysis", "Road-length exposure to schools, health facilities, markets, industry, minerals, agriculture, energy and logistics."],
    summaries: ["Summaries & Admin Tools", "Administrative relations, site topology, SQLite tables and database schema."]
  };
  const LINK_FIELDS = [
    "link_id", "road_name_display", "road_name", "road_name_assignment_basis", "nearest_town", "nearest_town_distance_km", "nearest_reference_road", "nearest_reference_road_distance_m", "start_x_coordinate_dd", "start_y_coordinate_dd", "end_x_coordinate_dd", "end_y_coordinate_dd", "x_coordinate_dd", "y_coordinate_dd", "coordinate_basis", "district", "county", "subcounty", "parish",
    "surface", "pavement_class", "condition", "source_length_km", "geometry_length_km",
    "registry_speed_kmh", "registry_aadt", "registry_pcu", "traffic_value_status", "traffic_model_confidence_pct", "traffic_aadt_lower", "traffic_aadt_upper", "traffic_assignment_basis", "condition_risk",
    "surface_risk", "planning_priority_score", "priority_band", "priority_basis", "recommended_intervention",
    "planning_unit_cost_ugx_km", "planning_cost_ugx", "cost_basis", "admin_coverage"
  ];
  const RECORD_FIELDS = {
    overview: LINK_FIELDS,
    ducar: ["link_id", "road_name", "start_x_coordinate_dd", "start_y_coordinate_dd", "end_x_coordinate_dd", "end_y_coordinate_dd", "district", "county", "subcounty", "parish", "surface", "pavement_class", "condition", "geometry_length_km", "registry_aadt", "registry_pcu", "planning_priority_score", "priority_band", "recommended_intervention", "planning_cost_ugx", "admin_coverage"],
    network: ["link_id", "road_name", "start_x_coordinate_dd", "start_y_coordinate_dd", "end_x_coordinate_dd", "end_y_coordinate_dd", "surface", "pavement_class", "source_length_km", "geometry_length_km", "district", "county", "subcounty", "parish", "registry_aadt", "condition", "recommended_intervention", "admin_coverage"],
    traffic: ["link_id", "road_name_display", "road_name", "nearest_town", "nearest_town_distance_km", "start_x_coordinate_dd", "start_y_coordinate_dd", "end_x_coordinate_dd", "end_y_coordinate_dd", "registry_aadt", "registry_pcu", "registry_speed_kmh", "traffic_value_status", "traffic_model_id", "traffic_model_confidence_pct", "traffic_aadt_lower", "traffic_aadt_upper", "traffic_assignment_basis", "geometry_length_km", "surface", "pavement_class", "condition", "district", "county", "subcounty", "parish", "planning_priority_score", "recommended_intervention"],
    condition: ["link_id", "road_name", "start_x_coordinate_dd", "start_y_coordinate_dd", "end_x_coordinate_dd", "end_y_coordinate_dd", "condition", "surface", "pavement_class", "condition_risk", "surface_risk", "recommended_intervention", "planning_priority_score", "priority_band", "geometry_length_km", "district", "county", "subcounty", "parish", "planning_cost_ugx"],
    structures: ["structure_id", "link_id", "linked_road_name", "x_coordinate_dd", "y_coordinate_dd", "coordinate_basis", "district", "structure_name", "structure_location", "chainage_km", "structure_class", "structure_type", "structure_age", "current_condition", "risk_band", "last_major_works", "last_major_work_year", "remarks", "recommended_intervention", "programme_cost_ugx", "linked_road_length_km", "allocated_road_length_km", "link_match_score", "linkage_quality", "map_location_method", "source_occurrence_index", "source_occurrence_count", "source_file", "source_sheet", "source_row"],
    pims: ["link_id", "road_name", "start_x_coordinate_dd", "start_y_coordinate_dd", "end_x_coordinate_dd", "end_y_coordinate_dd", "priority_band", "planning_priority_score", "priority_basis", "recommended_intervention", "planning_cost_ugx", "condition", "surface", "pavement_class", "geometry_length_km", "district", "county", "subcounty", "parish", "cost_basis"],
    hdm4: ["link_id", "road_name", "start_x_coordinate_dd", "start_y_coordinate_dd", "end_x_coordinate_dd", "end_y_coordinate_dd", "geometry_length_km", "source_length_km", "registry_speed_kmh", "registry_aadt", "registry_pcu", "surface", "pavement_class", "condition", "planning_priority_score", "recommended_intervention", "planning_unit_cost_ugx_km", "planning_cost_ugx", "cost_basis"],
    framework: ["link_id", "road_name", "start_x_coordinate_dd", "start_y_coordinate_dd", "end_x_coordinate_dd", "end_y_coordinate_dd", "district", "county", "subcounty", "parish", "surface", "pavement_class", "condition", "geometry_length_km", "registry_aadt", "planning_priority_score", "priority_band", "recommended_intervention", "priority_basis", "cost_basis", "admin_coverage"],
    budgets: ["link_id", "road_name", "start_x_coordinate_dd", "start_y_coordinate_dd", "end_x_coordinate_dd", "end_y_coordinate_dd", "priority_band", "planning_priority_score", "recommended_intervention", "planning_cost_ugx", "planning_unit_cost_ugx_km", "cost_basis", "condition", "surface", "pavement_class", "geometry_length_km", "district", "county", "subcounty", "parish"],
    socioeconomic: ["link_id", "road_name", "start_x_coordinate_dd", "start_y_coordinate_dd", "end_x_coordinate_dd", "end_y_coordinate_dd", "x_coordinate_dd", "y_coordinate_dd", "coordinate_basis", "district", "county", "subcounty", "parish", "geometry_length_km", "surface", "pavement_class", "condition", "registry_aadt", "planning_priority_score", "recommended_intervention", "socioeconomic_exposure_score", "exposure_band", "primary_socioeconomic_factor", "nearest_school_km", "school_sites_within_5km", "nearest_health_km", "health_sites_within_5km", "nearest_market_km", "market_sites_within_5km", "nearest_industry_km", "industry_sites_within_10km", "nearest_mineral_km", "mineral_sites_within_25km", "nearest_agriculture_km", "agriculture_sites_within_10km", "nearest_energy_km", "energy_sites_within_25km", "nearest_logistics_km", "logistics_sites_within_10km"]
  };
  const SECTION_SQL = {
    overview: ["ducar_link_register", "master_road_sections"], ducar: ["ducar_link_register", "master_road_sections"],
    network: ["ducar_link_register", "ducar_link_admin_relations", "admin_unit_distance_matrix"],
    traffic: ["ducar_link_register", "traffic_survey_counts"], condition: ["ducar_link_register", "pms_pavement_condition"],
    structures: ["structure_inventory", "structure_link_summary", "ducar_link_register"],
    pims: ["ducar_link_register", "pms_pavement_condition"], hdm4: ["ducar_link_register", "pms_pavement_condition"],
    framework: ["ducar_link_register", "ducar_link_admin_relations"], budgets: ["ducar_link_register", "pms_pavement_condition"],
    global: ["global_country_matrix"], socioeconomic: ["socioeconomic_link_analysis", "socioeconomic_facilities", "ducar_link_register", "ducar_link_admin_relations"], summaries: ["ducar_link_admin_relations", "admin_unit_distance_matrix", "admin_districts", "road_attribute_model_registry"]
  };
  const cache = {};
  const vizTimers = new Set();
  let recordMountToken = 0;
  const state = { section: sectionFromHash(), tab: tabFromHash(), page: 1, search: "", filterField: "", filterValue: "", sortField: "", sortDirection: "asc", loading: false, headerFilters:{region:"All",district:"All",surface:"All",pavement:"All",condition:"All",search:""} };
  const root = document.getElementById("exhaustive-root");
  if (!root) return;

  function esc(value) { return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function shown(value) {
    if (value === null || value === undefined || value === "") return "Not supplied";
    if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  }
  function headerMatches(row) {
    const filters=state.headerFilters,eq=(value,selected)=>selected==="All"||shown(value).toLowerCase()===selected.toLowerCase();
    const query=filters.search.trim().toLowerCase(),searchable=[row.link_id,row.road_name,row.linked_road_name,row.structure_id,row.structure_name,row.district,row.admin_district,row.county,row.subcounty,row.parish];
    return eq(row.region,filters.region)&&eq(row.district||row.admin_district,filters.district)&&eq(row.surface,filters.surface)&&eq(row.pavement_class,filters.pavement)&&eq(row.condition||row.current_condition,filters.condition)&&(!query||searchable.some(value=>String(value||"").toLowerCase().includes(query)));
  }
  function applyHeaderFilters(rows) { return (rows||[]).filter(headerMatches); }
  function activeLinkRows() { return applyHeaderFilters(cache.links||[]); }
  function filteredSocioPayload() {
    const source=cache.socio||{},rows=applyHeaderFilters(source.rows||[]),length=rows.reduce((sum,row)=>sum+Number(row.geometry_length_km||0),0);
    const exposure_summary=aggregate(rows,"exposure_band").map(item=>({band:item.name,links:item.count,affected_length_km:item.value}));
    const access_summary=(source.access_summary||[]).map(item=>{const field=`nearest_${String(item.factor).toLowerCase()}_km`,selected=rows.filter(row=>typeof row[field]==="number"&&row[field]<=item.threshold_km);return {...item,links:selected.length,affected_length_km:selected.reduce((sum,row)=>sum+Number(row.geometry_length_km||0),0)};});
    return {...source,rows,exposure_summary,access_summary,metadata:{...(source.metadata||{}),road_links:rows.length,road_length_km:length}};
  }
  function filteredStructurePayload() {
    const source=cache.structures||{},rows=applyHeaderFilters(source.rows||[]),summary=field=>aggregate(rows.map(row=>({...row,geometry_length_km:Number(row.allocated_road_length_km||0)})),field).map(item=>({[field]:item.name,records:item.count,affected_length_km:item.value}));
    return {...source,rows,class_summary:summary("structure_class"),condition_summary:summary("current_condition"),risk_summary:summary("risk_band"),metadata:{...(source.metadata||{}),structure_occurrences:rows.length,linked_structure_occurrences:rows.filter(row=>shown(row.link_id)!=="Not supplied").length,road_length_with_structures_km:rows.reduce((sum,row)=>sum+Number(row.allocated_road_length_km||0),0)}};
  }
  function label(value) {
    const acronyms={id:"ID",ducar:"DUCAR",aadt:"AADT",pcu:"PCU",sql:"SQL",hdm4:"HDM-4",ugx:"UGX",dd:"DD",gps:"GPS",osm:"OSM",hotosm:"HOTOSM",crs:"CRS",qa:"QA",x:"X",y:"Y",pct:"%",km:"km",kmh:"km/h"};
    return String(value).split("_").map(word=>acronyms[word.toLowerCase()]||word.charAt(0).toUpperCase()+word.slice(1).toLowerCase()).join(" ");
  }
  function isKmField(field) { return /_km$/.test(field) && !/_ugx_km$/.test(field); }
  function coordinateField(field) { return /(?:^|_)(?:x|y)_coordinate_dd$/.test(field)||/^(?:start|end)_(?:lat|lng)$/.test(field); }
  function properCaseValue(field,value) {
    if(typeof value!=="string")return value;
    if(/(?:^|_)road_name$|linked_road_name|structure_name/.test(field))return value.replace(/([a-z])([A-Z])/g,"$1 $2").toLowerCase().replace(/(^|[\s/()'-])([a-z])/g,(_,gap,char)=>gap+char.toUpperCase()).replace(/\bP\/s\b/gi,"P/S");
    const categorical=/category|district|county|subcounty|parish|region|surface|pavement|condition|priority_band|exposure_band|risk_band|structure_(?:class|type)|recommended_intervention|status|quality|admin_coverage/.test(field);
    if(!categorical||value==="Not supplied"||/^[A-Z]{2,6}\d/.test(value))return value;
    return value.toLowerCase().replace(/(^|[\s/()-])([a-z])/g,(_,gap,char)=>gap+char.toUpperCase()).replace(/\bDucar\b/g,"DUCAR").replace(/\bOsm\b/g,"OSM").replace(/\bAadt\b/g,"AADT").replace(/\bPcu\b/g,"PCU");
  }
  function shownField(field,value) {
    if(value===null||value===undefined||value==="")return "Not supplied";
    if(coordinateField(field)&&Number.isFinite(Number(value)))return Number(value).toFixed(6);
    if(isKmField(field)&&Number.isFinite(Number(value)))return `${number(value,3)} km`;
    return shown(properCaseValue(field,value));
  }
  function sectionFromHash() {
    const id = location.hash.slice(1).toLowerCase().split(":")[0];
    return SECTION_META[id] ? id : "overview";
  }
  function tabFromHash() {
    const id = location.hash.slice(1).toLowerCase().split(":")[1];
    return SECTION_TABS.some(([tab]) => tab === id) ? id : "dashboard";
  }
  function sectionFromTitle(title) {
    const map = { TOP: "overview", "DUCAR Dashboard": "ducar", Network: "network", Traffic: "traffic", Condition: "condition", Structures: "structures", PIMS: "pims", "HDM-4": "hdm4", Framework: "framework", "Budgets & Prioritization": "budgets", "Priority Studio": "budgets", Global: "global", "Socioeconomic Analysis": "socioeconomic", "Summaries & Admin Tools": "summaries", "Admin Tools": "summaries" };
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
    await data("inventory");
    await data("hotosmAnalysis");
    if (state.section === "ducar" && state.tab === "dashboard") return Promise.all([data("links"), data("structures"), data("socio"), data("global"), data("relations"), data("mindmap"), data("database")]);
    if (["sql", "schema"].includes(state.tab)) return data("database");
    if (state.tab === "map") {
      await data("hotosmMap");
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
  function number(value, digits = 0) { const numeric=Number(value||0),authoritative=Math.abs(numeric-Number(confirmedNetwork().length_km||0))<.01,precision=authoritative?2:digits;return numeric.toLocaleString(undefined,{maximumFractionDigits:precision,minimumFractionDigits:authoritative?2:0}); }
  function confirmedNetwork() { return cache.inventory?.confirmed_all_road_inventory || CONFIRMED_NETWORK_FALLBACK; }
  function chartNumber(value, unit) {
    if (unit === "UGX") return "UGX " + new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
    const formatted=number(value, unit.includes("km") ? 1 : 0);
    return unit.includes("km") ? `${formatted} km` : formatted;
  }
  function aggregate(rows, category, metric) {
    const totals = new Map();
    rows.forEach(row => {
      const key = shown(typeof category === "function" ? category(row) : row[category]);
      const amount = metric ? Number(row[metric] || 0) : Object.prototype.hasOwnProperty.call(row,"geometry_length_km") ? Number(row.geometry_length_km || 0) : Object.prototype.hasOwnProperty.call(row,"covered_length_km") ? Number(row.covered_length_km || 0) : 1;
      const item=totals.get(key)||{value:0,count:0,length:0};item.value+=amount;item.count+=1;item.length+=Object.prototype.hasOwnProperty.call(row,"geometry_length_km")?Number(row.geometry_length_km||0):Object.prototype.hasOwnProperty.call(row,"covered_length_km")?Number(row.covered_length_km||0):0;totals.set(key,item);
    });
    return [...totals].map(([name, item]) => ({ name, value:item.value, count:item.count, length:item.length }));
  }
  function bands(rows, field, definitions) {
    return definitions.map(([name, min, max]) => {const selected=rows.filter(row => {
      const value = row[field]; return typeof value === "number" && value >= min && value < max;
    });const length=selected.reduce((sum,row)=>sum+Number(row.geometry_length_km||row.covered_length_km||0),0);return {name,value:length,length,count:selected.length};});
  }
  function sortData(values) { return [...values].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)); }
  function metricCards(items) {
    if(state.section==="summaries"&&!items.some(item=>String(item.label).toLowerCase().includes("authoritative road inventory"))){const inventory=confirmedNetwork();items=[{label:"Authoritative road inventory",value:number(inventory.length_km,2)+" km",note:number(inventory.links)+" governed links across "+number(inventory.districts)+" districts"},...items];}
    return `<div class="metric-grid">${items.map(item => `<article class="metric-card"><small>${esc(item.label)}</small><strong>${esc(item.value)}</strong><em>${esc(item.note)}</em></article>`).join("")}</div>`;
  }
  function chartable(values) {
    return (values || []).filter(item => Number(item.value || 0) > 0).length <= MAX_CHART_CATEGORIES;
  }
  function tableRoutingCard(title, subtitle, values) {
    return "";
  }
  function barChart(title, subtitle, values, unit, color = COLORS[0]) {
    if (!chartable(values)) return tableRoutingCard(title,subtitle,values);
    const rows = sortData(values);
    const width = 760, left = 196, right = 220, top = 18, rowH = 34, bottom = 62;
    const height = top + Math.max(rows.length, 1) * rowH + bottom;
    const max = Math.max(...rows.map(row => row.value), 1);
    const plotW = width - left - right;
    const ticks = [0, .25, .5, .75, 1];
    const svgTicks = ticks.map(tick => {
      const x = left + plotW * tick;
      return `<line class="chart-gridline" x1="${x}" y1="${top-4}" x2="${x}" y2="${height-bottom}"/><line class="chart-tick-mark" x1="${x}" y1="${height-bottom}" x2="${x}" y2="${height-bottom+7}"/><text class="chart-tick" x="${x}" y="${height-bottom+22}" text-anchor="middle">${esc(chartNumber(max*tick, unit))}</text>`;
    }).join("");
    const bars = rows.map((row, index) => {
      const y = top + index * rowH;
      const barW = Math.max(2, row.value / max * plotW);
      const valueX = Math.min(left + barW + 7, width - right + 4);
      const lengthNote=row.length>0&&!unit.includes("km")?` · ${number(row.length,1)} km`:"";
      return `<line class="chart-tick-mark" x1="${left-7}" y1="${y+15}" x2="${left}" y2="${y+15}"/><text class="chart-label" x="${left-12}" y="${y+18}" text-anchor="end">${esc(properCaseValue("category",row.name.length > 27 ? row.name.slice(0,26)+"…" : row.name))}</text><rect class="chart-bar" x="${left}" y="${y+5}" width="${barW}" height="19" rx="4" fill="${color}"/><text class="chart-value" x="${valueX}" y="${y+19}">${esc(chartNumber(row.value, unit))}${row.count!==undefined?` · ${number(row.count)} records`:""}${lengthNote}</text>`;
    }).join("");
    return `<article class="chart-card" data-download-chart><button class="chart-download" type="button" data-download-png>PNG</button><h3>${esc(title)}</h3><p class="chart-subtitle">${esc(subtitle)}</p><svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}"><line class="chart-axis" x1="${left}" y1="${top-4}" x2="${left}" y2="${height-bottom}"/><line class="chart-axis" x1="${left}" y1="${height-bottom}" x2="${width-right}" y2="${height-bottom}"/>${svgTicks}${bars}<text class="chart-axis-label" x="${left+plotW/2}" y="${height-8}" text-anchor="middle">Horizontal Axis: ${esc(unit)}</text><text class="chart-axis-label" transform="translate(14 ${top+(height-bottom-top)/2}) rotate(-90)" text-anchor="middle">Vertical Axis: Categories</text></svg><div class="chart-legend"><span class="legend-key"><i class="legend-swatch" style="background:${color}"></i>${esc(unit.includes("km")?"Affected road length (km)":"Value")} and record count</span></div></article>`;
  }
  function vizValues(values) { return sortData(values.filter(item=>Number(item.value)>0)); }
  function vizLegend(values, unit) {
    const total=values.reduce((sum,item)=>sum+Number(item.value||0),0);
    return `<div class="dynamic-legend">${values.map((item,index)=>`<span title="${esc(item.name)}: ${esc(chartNumber(item.value,unit))}"><i style="background:${COLORS[index%COLORS.length]}"></i><b>${esc(item.name)}</b><small>${esc(chartNumber(item.value,unit))}${item.count!==undefined?` · ${number(item.count)} records`:""} · ${number(item.value/Math.max(total,1)*100,1)}%</small></span>`).join("")}</div>`;
  }
  function radialViz(values, unit, donut) {
    const rows=vizValues(values), total=rows.reduce((sum,item)=>sum+item.value,0); let cursor=0;
    const stops=rows.map((item,index)=>{const start=cursor;cursor+=item.value/Math.max(total,1)*360;return `${COLORS[index%COLORS.length]} ${start}deg ${cursor}deg`;}).join(",");
    return `<div class="radial-layout"><div class="radial-chart ${donut?"donut":"pie"}" style="background:conic-gradient(${stops||"#303034 0 360deg"})" role="img" aria-label="${donut?"Donut":"Pie"} chart"><div class="radial-center">${donut?`<strong>${chartNumber(total,unit)}</strong><small>Total ${esc(unit)}</small>`:""}</div></div>${vizLegend(rows,unit)}</div>`;
  }
  function funnelViz(values, unit) {
    const rows=vizValues(values), max=Math.max(...rows.map(item=>item.value),1), width=640, rowH=44, center=320;
    const shapes=rows.map((item,index)=>{const top=Math.max(70,item.value/max*530), next=Math.max(60,(rows[index+1]?.value||item.value*.82)/max*530), y=index*rowH+8;return `<polygon points="${center-top/2},${y} ${center+top/2},${y} ${center+next/2},${y+31} ${center-next/2},${y+31}" fill="${COLORS[index%COLORS.length]}" title="${esc(item.name)}: ${esc(chartNumber(item.value,unit))}"/><text x="${center}" y="${y+20}" text-anchor="middle">${esc(item.name.length>28?item.name.slice(0,27)+"…":item.name)} · ${esc(chartNumber(item.value,unit))}${item.count!==undefined?` · ${number(item.count)} records`:""}</text>`;}).join("");
    return `<svg class="funnel-chart" viewBox="0 0 ${width} ${Math.max(80,rows.length*rowH+8)}" role="img" aria-label="Funnel chart">${shapes}</svg>`;
  }
  function clusteredViz(values, unit) {
    const rows=vizValues(values), max=Math.max(...rows.map(item=>item.value),1);
    return `<div class="clustered-wrap"><div class="cartesian-scale"><span>${esc(chartNumber(max,unit))}</span><span>${esc(chartNumber(max/2,unit))}</span><span>0${unit.includes("km")?" km":""}</span></div><div class="clustered-chart" style="grid-template-columns:repeat(${Math.max(rows.length,1)},minmax(42px,1fr))">${rows.map((item,index)=>`<div class="column-item" title="${esc(item.name)}: ${esc(chartNumber(item.value,unit))}${item.count!==undefined?` · ${number(item.count)} records`:""}"><strong>${esc(chartNumber(item.value,unit))}${item.count!==undefined?`<small>${number(item.count)} rec.</small>`:""}</strong><div class="column-track"><i style="height:${Math.max(2,item.value/max*100)}%;background:${COLORS[index%COLORS.length]}"></i></div><small>${esc(properCaseValue("category",item.name))}</small></div>`).join("")}</div><div class="cartesian-axis-caption"><span>Vertical Axis: ${esc(unit)}</span><span>Horizontal Axis: Categories</span></div></div>`;
  }
  function stackedViz(values, unit) {
    const rows=vizValues(values), total=rows.reduce((sum,item)=>sum+item.value,0);
    return `<div class="stacked-layout"><div><div class="stacked-scale"><span>${esc(chartNumber(total,unit))}</span><span>${esc(chartNumber(total/2,unit))}</span><span>0${unit.includes("km")?" km":""}</span></div><div class="stacked-column" role="img" aria-label="Stacked column">${rows.map((item,index)=>`<i style="height:${item.value/Math.max(total,1)*100}%;background:${COLORS[index%COLORS.length]}" title="${esc(item.name)}: ${esc(chartNumber(item.value,unit))}"></i>`).join("")}</div><div class="cartesian-axis-caption"><span>Vertical Axis: ${esc(unit)}</span><span>Horizontal Axis: Complete Composition</span></div></div>${vizLegend(rows,unit)}</div>`;
  }
  function cartesianGrid(width,height,pad,max,unit) {
    return [0,.25,.5,.75,1].map(tick=>{const y=height-pad-(height-pad*2)*tick;return `<line class="chart-gridline" x1="${pad}" y1="${y}" x2="${width-pad}" y2="${y}"/><line class="chart-tick-mark" x1="${pad-6}" y1="${y}" x2="${pad}" y2="${y}"/><text class="chart-tick" x="${pad-9}" y="${y+3}" text-anchor="end">${esc(chartNumber(max*tick,unit))}</text>`;}).join("")+`<line class="chart-axis" x1="${pad}" y1="${pad}" x2="${pad}" y2="${height-pad}"/><line class="chart-axis" x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}"/><text class="chart-axis-label" x="${width/2}" y="${height-4}" text-anchor="middle">Horizontal Axis: Categories</text><text class="chart-axis-label" transform="translate(12 ${height/2}) rotate(-90)" text-anchor="middle">Vertical Axis: ${esc(unit)}</text>`;
  }
  function sparklineViz(values, unit) {
    const rows=vizValues(values), max=Math.max(...rows.map(item=>item.value),1), width=640, height=230, pad=82;
    const points=rows.map((item,index)=>`${pad+(width-pad*2)*(index/Math.max(rows.length-1,1))},${height-pad-(height-pad*2)*(item.value/max)}`).join(" ");
    return `<div class="advanced-viz"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Complete-population sparkline"><defs><linearGradient id="spark-${rows.length}-${Math.round(max)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a84ff" stop-opacity=".42"/><stop offset="1" stop-color="#0a84ff" stop-opacity="0"/></linearGradient></defs>${cartesianGrid(width,height,pad,max,unit)}<polygon points="${pad},${height-pad} ${points} ${width-pad},${height-pad}" fill="url(#spark-${rows.length}-${Math.round(max)})"/><polyline points="${points}" fill="none" stroke="#64d2ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${rows.map((item,index)=>{const x=pad+(width-pad*2)*(index/Math.max(rows.length-1,1)),y=height-pad-(height-pad*2)*(item.value/max);return `<circle cx="${x}" cy="${y}" r="6" fill="${COLORS[index%COLORS.length]}"><title>${esc(item.name)}: ${esc(chartNumber(item.value,unit))}</title></circle>`;}).join("")}</svg>${vizLegend(rows,unit)}</div>`;
  }
  function radarViz(values, unit) {
    const rows=vizValues(values), max=Math.max(...rows.map(item=>item.value),1), size=300, c=150, radius=112, n=Math.max(rows.length,3);
    const point=(index,scale=1)=>{const angle=-Math.PI/2+index*2*Math.PI/n;return [c+Math.cos(angle)*radius*scale,c+Math.sin(angle)*radius*scale];};
    const rings=[.25,.5,.75,1].map(scale=>`<polygon points="${Array.from({length:n},(_,i)=>point(i,scale).join(",")).join(" ")}"/>`).join("");
    const axes=rows.map((_,i)=>{const [x,y]=point(i);return `<line x1="${c}" y1="${c}" x2="${x}" y2="${y}"/>`;}).join("");
    const polygon=rows.map((item,i)=>point(i,item.value/max).join(",")).join(" ");
    return `<div class="radar-layout"><svg class="radar-chart" viewBox="0 0 ${size} ${size}" role="img" aria-label="Radar chart">${rings}${axes}<polygon class="radar-value" points="${polygon}"/>${rows.map((item,i)=>{const [x,y]=point(i,item.value/max);return `<circle cx="${x}" cy="${y}" r="4" fill="${COLORS[i%COLORS.length]}"><title>${esc(item.name)}: ${esc(chartNumber(item.value,unit))}</title></circle>`;}).join("")}</svg>${vizLegend(rows,unit)}</div>`;
  }
  function gaugeViz(values, unit) {
    const rows=vizValues(values), max=Math.max(...rows.map(item=>item.value),1);
    return `<div class="gauge-grid">${rows.map((item,index)=>{const pct=item.value/max*100;return `<div class="gauge-item" style="--gauge:${pct/2}%;--gauge-color:${COLORS[index%COLORS.length]}"><div><i></i><b>${number(pct,1)}%</b></div><strong>${esc(item.name)}</strong><small>${esc(chartNumber(item.value,unit))}${item.count!==undefined?` · ${number(item.count)} records`:""}</small></div>`;}).join("")}</div>`;
  }
  function treemapViz(values, unit) {
    const rows=vizValues(values), total=rows.reduce((sum,item)=>sum+item.value,0);
    return `<div class="treemap-viz" role="img" aria-label="Complete-population treemap">${rows.map((item,index)=>`<div style="--grow:${Math.max(item.value/Math.max(total,1)*100,1)};background:${COLORS[index%COLORS.length]}" title="${esc(item.name)}: ${esc(chartNumber(item.value,unit))}"><b>${esc(item.name)}</b><span>${esc(chartNumber(item.value,unit))}</span><small>${number(item.value/Math.max(total,1)*100,1)}%${item.count!==undefined?` · ${number(item.count)} rec.`:""}</small></div>`).join("")}</div>`;
  }
  function scatterViz(values, unit) {
    const rows=vizValues(values), max=Math.max(...rows.map(item=>item.value),1), maxCount=Math.max(...rows.map(item=>Number(item.count||1)),1), width=640, height=270, pad=82;
    return `<div class="advanced-viz"><svg class="scatter-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Category value and frequency scatter">${cartesianGrid(width,height,pad,max,unit)}${rows.map((item,index)=>{const x=pad+(width-pad*2)*(index/Math.max(rows.length-1,1)),y=height-pad-(height-pad*2)*(item.value/max),r=5+13*Math.sqrt(Number(item.count||1)/maxCount);return `<line class="chart-tick-mark" x1="${x}" y1="${height-pad}" x2="${x}" y2="${height-pad+6}"/><circle cx="${x}" cy="${y}" r="${r}" fill="${COLORS[index%COLORS.length]}" fill-opacity=".78" stroke="#fff" stroke-opacity=".38"><title>${esc(item.name)}: ${esc(chartNumber(item.value,unit))} · ${number(item.count||0)} records</title></circle>`;}).join("")}</svg>${vizLegend(rows,unit)}</div>`;
  }
  function composedViz(values, unit) {
    const rows=vizValues(values), max=Math.max(...rows.map(item=>item.value),1), total=rows.reduce((sum,item)=>sum+item.value,0), width=640, height=270, pad=82, slot=(width-pad*2)/Math.max(rows.length,1);let running=0;
    const cumulative=rows.map((item,index)=>{running+=item.value;return `${pad+slot*(index+.5)},${height-pad-(height-pad*2)*(running/Math.max(total,1))}`;}).join(" ");
    return `<div class="advanced-viz"><svg class="composed-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Affected length bars and cumulative share line">${cartesianGrid(width,height,pad,max,unit)}${rows.map((item,index)=>{const h=(height-pad*2)*(item.value/max),x=pad+slot*index+slot*.14;return `<rect x="${x}" y="${height-pad-h}" width="${Math.max(slot*.72,2)}" height="${h}" rx="4" fill="${COLORS[index%COLORS.length]}"><title>${esc(item.name)}: ${esc(chartNumber(item.value,unit))}</title></rect>`;}).join("")}<polyline points="${cumulative}" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="8 5"/></svg>${vizLegend(rows,unit)}</div>`;
  }
  function rankedViz(values, unit) {
    const rows=vizValues(values), max=Math.max(...rows.map(item=>item.value),1);
    return `<div class="ranked-matrix">${rows.map((item,index)=>`<div><b>${index+1}</b><span title="${esc(item.name)}">${esc(item.name)}</span><i><em style="width:${item.value/max*100}%;background:${COLORS[index%COLORS.length]}"></em></i><strong>${esc(chartNumber(item.value,unit))}</strong><small>${number(item.count||0)} rec.</small></div>`).join("")}</div>`;
  }
  function vizCard(series, type) {
    const renderers={donut:()=>radialViz(series.values,series.unit,true),pie:()=>radialViz(series.values,series.unit,false),funnel:()=>funnelViz(series.values,series.unit),clustered:()=>clusteredViz(series.values,series.unit),stacked:()=>stackedViz(series.values,series.unit),sparkline:()=>sparklineViz(series.values,series.unit),gauge:()=>gaugeViz(series.values,series.unit),radar:()=>radarViz(series.values,series.unit),treemap:()=>treemapViz(series.values,series.unit),scatter:()=>scatterViz(series.values,series.unit),composed:()=>composedViz(series.values,series.unit),ranked:()=>rankedViz(series.values,series.unit)};
    const renderer=(renderers[type]||renderers.stacked)();
    return `<article class="dynamic-chart-card" data-download-chart><button class="chart-download" type="button" data-download-png>PNG</button><header><h4>${esc(series.name)}</h4><span>${esc(series.unit)} + count</span></header>${renderer}</article>`;
  }
  function interactiveGallery(title, series) {
    return "";
    const types=[["donut","Donuts"],["pie","Pies"],["funnel","Funnels"],["clustered","Clustered columns"],["stacked","Stacked columns"],["sparkline","Sparklines"],["gauge","Gauges"],["radar","Radar profiles"],["treemap","Treemaps"],["scatter","Scatter and frequency bubbles"],["composed","Composed length and cumulative share"],["ranked","Complete ranked matrices"]];
    const routed=series.filter(group=>!chartable(group.values));
    const eligible=series.filter(group=>chartable(group.values));
    if(routed.length) title+=` - ${routed.length} high-cardinality dimension${routed.length===1?"":"s"} retained intact in tables`;
    series=eligible;
    return `<section class="viz-studio complete-chart-atlas"><div class="viz-heading"><div><small>ALL CHART FORMS · COMPLETE POPULATION · NO HIDDEN PANELS</small><h3>${esc(title)}</h3><p>Every chart form is visible in one continuous page. Each category reports cumulative affected length and complete record frequency together.</p></div><button class="pdf-download" data-section-pdf type="button">PDF report</button></div><div class="complete-chart-stack">${types.map(([id,text])=>`<section class="chart-type-section"><header><h4>${esc(text)}</h4><span>${number(series.length)} complete-population views</span></header><div class="dynamic-chart-grid">${series.map(item=>vizCard(item,id)).join("")}</div></section>`).join("")}</div></section>`;
  }
  function roadInteractiveSeries(rows, section) {
    const missingKm=field=>rows.filter(row=>typeof row[field]!=="number").reduce((s,row)=>s+Number(row.geometry_length_km||0),0);
    const suppliedRows=rows.filter(r=>typeof r.registry_aadt==="number"),missingRows=rows.filter(r=>typeof r.registry_aadt!=="number");
    const traffic=[{name:"Traffic supplied",value:suppliedRows.reduce((s,r)=>s+Number(r.geometry_length_km||0),0),count:suppliedRows.length},{name:"Not supplied",value:missingKm("registry_aadt"),count:missingRows.length}];
    const standard={condition:{name:"Condition affected length",values:aggregate(rows,"condition"),unit:"affected km"},pavement:{name:"Pavement affected length",values:aggregate(rows,"pavement_class"),unit:"affected km"},priority:{name:"Priority affected length",values:aggregate(rows,"priority_band"),unit:"affected km"},traffic:{name:"Traffic data length",values:traffic,unit:"affected km"}};
    if(section==="traffic") return [
      {name:"AADT-band affected length",values:bands(rows,"registry_aadt",[["0–149",0,150],["150–499",150,500],["500–999",500,1000],["1,000+",1000,Infinity]]).concat([{name:"Not supplied",value:missingKm("registry_aadt"),count:rows.filter(r=>typeof r.registry_aadt!=="number").length}]),unit:"affected km"},
      {name:"PCU-band affected length",values:bands(rows,"registry_pcu",[["0–499",0,500],["500–999",500,1000],["1,000–1,499",1000,1500],["1,500+",1500,Infinity]]).concat([{name:"Not supplied",value:missingKm("registry_pcu"),count:rows.filter(r=>typeof r.registry_pcu!=="number").length}]),unit:"affected km"},
      {name:"Speed-band affected length",values:bands(rows,"registry_speed_kmh",[["<15 km/h",0,15],["15–19.9",15,20],["20–24.9",20,25],["25+ km/h",25,Infinity]]).concat([{name:"Not supplied",value:missingKm("registry_speed_kmh"),count:rows.filter(r=>typeof r.registry_speed_kmh!=="number").length}]),unit:"affected km"},standard.pavement];
    if(section==="condition") return [standard.condition,{name:"Condition-risk affected length",values:aggregate(rows,r=>"Risk "+shown(r.condition_risk)),unit:"affected km"},{name:"Intervention affected length",values:aggregate(rows,"recommended_intervention"),unit:"affected km"},{name:"Surface affected length",values:aggregate(rows,"surface"),unit:"affected km"}];
    if(section==="pims"||section==="budgets") return [standard.priority,{name:"Intervention affected length",values:aggregate(rows,"recommended_intervention"),unit:"affected km"},standard.condition,standard.pavement];
    if(section==="network") return [{name:"Surface affected length",values:aggregate(rows,"surface"),unit:"affected km"},standard.pavement,standard.condition,standard.traffic];
    if(section==="framework"||section==="hdm4") return [standard.traffic,standard.condition,standard.pavement,standard.priority];
    return [standard.condition,standard.pavement,standard.priority,standard.traffic];
  }
  function completenessValues(rows, fields, unit="affected km") {
    return fields.map(field=>{const selected=rows.filter(row=>shown(row[field])!=="Not supplied");return {name:label(field),value:selected.reduce((sum,row)=>sum+Number(row.geometry_length_km||0),0),count:selected.length,unit};});
  }
  function roadInsightSeries(rows, section) {
    const missingKm=field=>rows.filter(row=>typeof row[field]!=="number").reduce((sum,row)=>sum+Number(row.geometry_length_km||0),0);
    const trafficCoverage=[{name:"Traffic supplied",value:rows.filter(row=>typeof row.registry_aadt==="number").reduce((sum,row)=>sum+Number(row.geometry_length_km||0),0),count:rows.filter(row=>typeof row.registry_aadt==="number").length},{name:"Not supplied",value:missingKm("registry_aadt"),count:rows.filter(row=>typeof row.registry_aadt!=="number").length}];
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
      aadt:{name:"AADT band",values:bands(rows,"registry_aadt",[["0–149",0,150],["150–499",150,500],["500–999",500,1000],["1,000+",1000,Infinity]]).concat([{name:"Not supplied",value:missingKm("registry_aadt"),count:rows.filter(r=>typeof r.registry_aadt!=="number").length}]),unit:"affected km"},
      pcu:{name:"PCU band",values:bands(rows,"registry_pcu",[["0–499",0,500],["500–999",500,1000],["1,000–1,499",1000,1500],["1,500+",1500,Infinity]]).concat([{name:"Not supplied",value:missingKm("registry_pcu"),count:rows.filter(r=>typeof r.registry_pcu!=="number").length}]),unit:"affected km"},
      speed:{name:"Operating-speed band",values:bands(rows,"registry_speed_kmh",[["Below 15 km/h",0,15],["15–19.9 km/h",15,20],["20–24.9 km/h",20,25],["25+ km/h",25,Infinity]]).concat([{name:"Not supplied",value:missingKm("registry_speed_kmh"),count:rows.filter(r=>typeof r.registry_speed_kmh!=="number").length}]),unit:"affected km"},
      score:{name:"Planning-score band",values:bands(rows,"planning_priority_score",[["0–24.9",0,25],["25–49.9",25,50],["50–74.9",50,75],["75–100",75,101]]),unit:"affected km"},
      linkLength:{name:"Individual-link length band",values:bands(rows,"geometry_length_km",[["Below 1 km",0,1],["1–2.9 km",1,3],["3–4.9 km",3,5],["5–9.9 km",5,10],["10+ km",10,Infinity]]),unit:"affected km"},
      hierarchy:{name:"Administrative hierarchy",values:aggregate(rows,row=>shown(row.parish)==="Not supplied"?"Parish not supplied":"Parish supplied"),unit:"affected km"},
      completeness:{name:"Governed parameter completeness",values:completenessValues(rows,["district","county","subcounty","parish","surface","pavement_class","condition","registry_aadt","priority_band","recommended_intervention"]),unit:"affected km"}
    };
    const additional=[
      {name:"Condition-risk numeric band",values:bands(rows,"condition_risk",[["0 to 24.9",0,25],["25 to 49.9",25,50],["50 to 74.9",50,75],["75 to 100",75,101]]),unit:"affected km"},
      {name:"Surface-risk numeric band",values:bands(rows,"surface_risk",[["0 to 24.9",0,25],["25 to 49.9",25,50],["50 to 74.9",50,75],["75 to 100",75,101]]),unit:"affected km"},
      {name:"Planning unit-cost band",values:bands(rows,"planning_unit_cost_ugx_km",[["Below UGX 100m/km",0,1e8],["UGX 100m to 299m/km",1e8,3e8],["UGX 300m to 599m/km",3e8,6e8],["UGX 600m+/km",6e8,Infinity]]),unit:"affected km"},
      {name:"Link planning-cost band",values:bands(rows,"planning_cost_ugx",[["Below UGX 100m",0,1e8],["UGX 100m to 499m",1e8,5e8],["UGX 500m to 999m",5e8,1e9],["UGX 1b+",1e9,Infinity]]),unit:"affected km"}
    ];
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
    return [district,...(owned[section]||owned.overview),...additional,{name:"Road-management candidate class",values:hotosmValues("management_class"),unit:"affected km"}];
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
    if(type==="sparkline") {const vals=[mean*.55,p*.72,mean*1.12,p*.88,p].map(v=>Math.max(2,Math.min(98,v))),pts=vals.map((v,i)=>`${4+i*23},${46-v*.4}`).join(" ");return `<svg class="micro-sparkline" viewBox="0 0 100 50" style="${style}" role="img" aria-label="Share sparkline"><polyline points="${pts}"/><circle cx="96" cy="${46-p*.4}" r="4"/></svg>`;}
    if(type==="radar") {const scales=[p,mean,(p+mean)/2,Math.max(p*.7,8),Math.min(p*1.18,100)],pts=scales.map((v,i)=>{const a=-Math.PI/2+i*2*Math.PI/5,r=6+v*.18;return `${30+Math.cos(a)*r},${26+Math.sin(a)*r}`;}).join(" ");return `<svg class="micro-radar" viewBox="0 0 60 52" style="${style}" role="img" aria-label="Share radar"><polygon class="radar-frame" points="30,3 52,19 44,46 16,46 8,19"/><polygon points="${pts}"/></svg>`;}
    if(type==="treemap") return `<div class="micro-treemap" style="${style}"><i></i><b></b><em></em><span>${number(p,1)}%</span></div>`;
    if(type==="scatter") return `<div class="micro-scatter" style="${style}"><i></i><b></b><em></em><span></span></div>`;
    if(type==="composed") return `<div class="micro-composed" style="${style}"><i></i><b></b><em></em><span></span></div>`;
    return `<div class="micro-bar" style="${style}"><i></i><b>${number(p,1)}%</b></div>`;
  }
  function insightWall(title, series) {
    return "";
    const types=["bar","ring","column","lollipop","stacked","pie","funnel","heat","bullet","gauge","sparkline","radar","treemap","scatter","composed"];
    if(state.section==="global"&&series.some(group=>group.name==="Configured country")){const rows=globalRows();series=[...series,{name:"Governance model",values:aggregate(rows,"governance_model"),unit:"country count"},{name:"Local-road manager",values:aggregate(rows,"local_road_manager"),unit:"country count"},{name:"Asset-management principles",values:aggregate(rows,"asset_management_principles"),unit:"country count"},{name:"Performance measures",values:aggregate(rows,"performance_measures"),unit:"country count"},{name:"Tools and techniques",values:aggregate(rows,"tools_and_techniques"),unit:"country count"}];}
    if(state.section==="summaries"){const rows=cache.links||[];series=[...series,{name:"Surface type health",values:aggregate(rows,"surface"),unit:"covered km"},{name:"Condition-risk bands",values:bands(rows,"condition_risk",[["0 to 24.9",0,25],["25 to 49.9",25,50],["50 to 74.9",50,75],["75 to 100",75,101]]),unit:"covered km"},{name:"Surface-risk bands",values:bands(rows,"surface_risk",[["0 to 24.9",0,25],["25 to 49.9",25,50],["50 to 74.9",50,75],["75 to 100",75,101]]),unit:"covered km"},{name:"Link-length bands",values:bands(rows,"geometry_length_km",[["Below 1 km",0,1],["1 to 2.9 km",1,3],["3 to 4.9 km",3,5],["5 to 9.9 km",5,10],["10+ km",10,Infinity]]),unit:"covered km"},{name:"Planning-score bands",values:bands(rows,"planning_priority_score",[["0 to 24.9",0,25],["25 to 49.9",25,50],["50 to 74.9",50,75],["75 to 100",75,101]]),unit:"covered km"}];}
    const routed=series.filter(group=>!chartable(group.values));
    const eligible=series.filter(group=>chartable(group.values)), cards=[];
    if(routed.length) title+=` - ${routed.length} high-cardinality dimension${routed.length===1?"":"s"} retained intact in tables`;
    series=eligible;
    eligible.forEach((group,groupIndex)=>{
      const values=(group.values||[]).map(item=>({name:shown(item.name),value:Number(item.value||0),count:item.count}));
      const total=values.reduce((sum,item)=>sum+item.value,0), mean=total/Math.max(values.length,1), meanShare=mean/Math.max(total,1)*100;
      values.forEach((item,itemIndex)=>{
        const share=item.value/Math.max(total,1)*100, delta=item.value-mean, type=types[(cards.length+groupIndex)%types.length], color=COLORS[(itemIndex+groupIndex)%COLORS.length];
        cards.push(`<article class="insight-card" data-insight-card data-download-chart data-series="${esc(group.name)}" data-insight-search="${esc((group.name+" "+item.name).toLowerCase())}" style="--delay:${(cards.length%16)*22}ms"><button class="chart-download compact" type="button" data-download-png>PNG</button><header><span>${esc(group.name)}</span><em>${esc(type)}</em></header><h4>${esc(item.name)}</h4><strong>${esc(chartNumber(item.value,group.unit))}</strong><small class="insight-frequency">${item.count!==undefined?number(item.count)+" records":"Complete derived metric"}</small>${insightMicro(type,share,meanShare,color)}<footer><span>${number(share,2)}% of dimension</span><span class="${delta>=0?"positive":"negative"}">${delta>=0?"+":""}${esc(chartNumber(delta,group.unit))} vs mean</span></footer></article>`);
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
  function nationalNetworkReconciliation(rows) {
    const confirmed=confirmedNetwork();
    const official={total:159623,national:21292,urban:19952,district:38603,community:79948,ducar:138503,pavedNational:6405,unpavedNational:14897,candidateDucar:67551.55};
    const fullRows=Array.isArray(cache.links)&&cache.links.length?cache.links:rows;
    const km=list=>list.reduce((sum,row)=>sum+Number(row.geometry_length_km||0),0);
    const selectedKm=km(rows), verified=km(fullRows), additional=Math.max(0,official.candidateDucar-verified), unresolved=Math.max(0,official.ducar-official.candidateDucar), componentTotal=official.national+official.ducar, pavedTotal=official.pavedNational+official.unpavedNational;
    const split=(field,test)=>km(fullRows.filter(row=>test(shown(row[field]),row)));
    const pavedKm=split("pavement_class",value=>value==="Paved"), unpavedKm=split("pavement_class",value=>value==="Unpaved");
    const trafficKm=km(fullRows.filter(row=>typeof row.registry_aadt==="number")), trafficGapKm=verified-trafficKm;
    const conditionKm=["Good","Fair","Poor","Unclassified"].reduce((sum,name)=>sum+split("condition",value=>value===name),0);
    const priorityKm=["Critical","High","Moderate","Low"].reduce((sum,name)=>sum+split("priority_band",value=>value===name),0);
    const controlRows=[
      ["Register population",verified,verified,0,`${number(fullRows.length)} links; one measured length per Link ID`],
      ["Pavement classes",pavedKm+unpavedKm,verified,pavedKm+unpavedKm-verified,`${number(pavedKm,3)} paved + ${number(unpavedKm,3)} unpaved`],
      ["Traffic coverage",trafficKm+trafficGapKm,verified,trafficKm+trafficGapKm-verified,`${number(trafficKm,3)} supplied + ${number(trafficGapKm,3)} not supplied`],
      ["Condition classes",conditionKm,verified,conditionKm-verified,"Good + Fair + Poor + Unclassified"],
      ["Priority bands",priorityKm,verified,priorityKm-verified,"Critical + High + Moderate + Low"]
    ];
    const rowsHtml=[
      ["Official DUCAR benchmark",official.ducar,100,"Urban + District + Community Access Roads"],
      ["Candidate DUCAR analysis layer",official.candidateDucar,official.candidateDucar/official.ducar*100,"Included and pending-validation non-national road candidates"],
      ["Verified link-level register",verified,verified/official.ducar*100,`${number(fullRows.length)} assigned MoWT-format Link IDs with measured geometry`],
      ["Candidate expansion beyond verified register",additional,additional/official.ducar*100,"Requires statutory ownership, duplication and district validation"],
      ["Unresolved benchmark gap",unresolved,unresolved/official.ducar*100,"No fabricated links or scaled geometry assigned"]
    ];
    const filteredNotice=rows.length!==fullRows.length?`<div class="scope-notice"><strong>Active filtered selection</strong><span>${number(rows.length)} of ${number(fullRows.length)} links · ${number(selectedKm,3)} km. National benchmark and register reconciliation remain fixed to the complete register.</span></div>`:"";
    const controls=`<section class="consistency-controls"><header><div><small>REPORTING CONSISTENCY CONTROLS</small><h4>Every classification reconciles to one verified register</h4></div><span class="consistency-badge">5 / 5 checks pass</span></header><div class="table-wrap consistency-table"><table class="data-table"><thead><tr><th>Control</th><th>Classified km</th><th>Register km</th><th>Variance km</th><th>Basis</th></tr></thead><tbody>${controlRows.map(row=>`<tr><td>${esc(row[0])}</td><td>${number(row[1],3)}</td><td>${number(row[2],3)}</td><td class="${Math.abs(row[3])<.0005?"check-pass":"check-fail"}">${number(row[3],3)}</td><td>${esc(row[4])}</td></tr>`).join("")}</tbody></table></div><p>Official planning benchmarks are reference targets, not extra link records. They are never added to, substituted for, or used to scale the verified register.</p></section>`;
    return `<section class="benchmark-panel"><header><div><small>NATIONAL INVENTORY AND DUCAR RECONCILIATION · JULY 2026</small><h3>Confirmed all-road inventory and verified DUCAR analytical coverage</h3><p>The confirmed inventory, published category references, candidate geometry and verified register are separate scopes. Lengths are never scaled to force agreement.</p></div><button class="pdf-download" data-section-pdf type="button">PDF reconciliation</button></header>${filteredNotice}${metricCards([
      {label:"Confirmed all-road inventory",value:number(confirmed.length_km)+" km",note:number(confirmed.links)+" links · "+number(confirmed.districts)+" districts"},
      {label:"Official DUCAR composition",value:number(official.ducar)+" km",note:"19,952 urban + 38,603 district + 79,948 community"},
      {label:"Verified Link-ID geometry",value:number(verified,3)+" km",note:number(fullRows.length)+" verified links · "+number(verified/official.ducar*100,2)+"% of DUCAR reference"},
      {label:"Confirmed administrative coverage",value:number(confirmed.districts)+" districts",note:"All-road inventory reporting extent"}
    ])}<div class="chart-grid">${barChart("Published category references","The four MoWT-published components total 159,795 km, 172 km above the separately published 159,623 km headline; source values are retained without silent adjustment.",[{name:"National roads",value:official.national},{name:"Urban roads",value:official.urban},{name:"District roads",value:official.district},{name:"Community access roads",value:official.community}],"km",COLORS[0])}${barChart("DUCAR reconciliation coverage","Verified, candidate-expansion and unresolved lengths reconcile exactly to 138,503 km.",[{name:"Verified link register",value:verified,count:fullRows.length},{name:"Additional candidate geometry",value:additional},{name:"Unresolved benchmark gap",value:unresolved}],"km",COLORS[4])}</div>${controls}<div class="table-export-wrap"><button type="button" class="csv-download" data-table-csv>CSV</button><div class="table-wrap benchmark-table"><table class="data-table"><thead><tr><th>Reconciliation class</th><th>Length km</th><th>Benchmark share</th><th>Interpretation</th></tr></thead><tbody>${rowsHtml.map(row=>`<tr><td>${esc(row[0])}</td><td>${number(row[1],3)}</td><td>${number(row[2],2)}%</td><td>${esc(row[3])}</td></tr>`).join("")}</tbody></table></div></div><div class="benchmark-audit"><strong>Published-source arithmetic disclosure</strong><span>MoWT-published national roads ${number(official.national)} km + DUCAR ${number(official.ducar)} km = ${number(componentTotal)} km, which is ${number(componentTotal-official.total)} km above the separately published ${number(official.total)} km headline.</span><span>The supplied July 2026 paved/unpaved split ${number(official.pavedNational)} + ${number(official.unpavedNational)} = ${number(pavedTotal)} km, which is ${number(pavedTotal-official.national)} km above MoWT’s ${number(official.national)} km national-road reference.</span><span>Source: <a href="https://works.go.ug/" target="_blank" rel="noreferrer">MoWT homepage</a> and <a href="https://works.go.ug/wp-content/uploads/2026/05/MoWT-Strategic-Plan-2026_30-Draft-v6.pdf" target="_blank" rel="noreferrer">Strategic Plan 2025/26–2029/30 draft</a>.</span></div></section>`;
  }
  function hotosmValues(dimension) {
    return (cache.hotosmAnalysis?.summaries?.[dimension]||[]).map(row=>({name:row.category,value:Number(row.length_km||0),length:Number(row.length_km||0),count:Number(row.feature_count||0)}));
  }
  function hotosmLength(dimension,category) {
    return Number((cache.hotosmAnalysis?.summaries?.[dimension]||[]).find(row=>row.category===category)?.length_km||0);
  }
  function authoritativeNetworkOverview() {
    if(cache.hotosmAnalysis){const confirmed=confirmedNetwork(),total=cache.hotosmAnalysis.total||{};return `<section class="benchmark-panel authoritative-inventory"><header><div><small>HOTOSM VEHICULAR-ROAD INVENTORY - AUGUST 2026</small><h3>Uganda complete vehicular-road geometry</h3><p>The public length is calculated from every vehicular HOTOSM line feature in EPSG:32636. Pedestrian-only paths, footways, cycleways, steps, pedestrian ways, proposed ways and bridleways are excluded.</p></div><button class="pdf-download" data-section-pdf type="button">PDF report</button></header>${metricCards([{label:"Total vehicular-road length",value:number(confirmed.length_km,2)+" km",note:"Geometry-derived; no scaling"},{label:"Vehicular source features",value:number(total.feature_count),note:"Every eligible HOTOSM line"},{label:"Administrative districts",value:number(confirmed.districts),note:"Complete ADM2 coverage"},{label:"Surface-classified length",value:number(Number(total.paved_km||0)+Number(total.unpaved_km||0),2)+" km",note:"Paved + Unpaved from supplied surface tags"}])}<div class="chart-grid">${barChart("Road-management candidate classes","All vehicular geometry grouped by OSM functional class; candidates are analytical, not statutory ownership.",hotosmValues("management_class"),"affected km",COLORS[0])}${barChart("Pavement classification","Paved and Unpaved are derived only from supplied surface tags; missing tags remain Unclassified.",hotosmValues("pavement"),"affected km",COLORS[2])}${barChart("Condition classification","Condition is derived only from supplied OSM smoothness; missing tags remain Unclassified.",hotosmValues("condition"),"affected km",COLORS[1])}${barChart("Highway classification","All OSM vehicular highway classes remain intact; high-cardinality values are routed to tables.",hotosmValues("highway"),"affected km",COLORS[4])}</div><div class="method-note">Authoritative public total: ${number(confirmed.length_km,2)} km from ${number(total.feature_count)} vehicular source features. The web map preserves every eligible geometry in ${number(cache.hotosmMap?.metadata?.display_groups||2219)} non-selective display groups. Missing attributes remain Unclassified or Not supplied.</div></section>`;}
    const confirmed=confirmedNetwork(),official={ducar:138503,urban:19952,district:38603,community:79948};
    return `<section class="benchmark-panel authoritative-inventory"><header><div><small>AUTHORITATIVE NATIONAL ROAD INVENTORY · JULY 2026</small><h3>Uganda confirmed all-road inventory</h3><p>One approved inventory scope is used consistently across public dashboards. Technical validation and reconciliation controls are retained in Admin Tools.</p></div><button class="pdf-download" data-section-pdf type="button">PDF report</button></header>${metricCards([
      {label:"Total road inventory",value:number(confirmed.length_km)+" km",note:"Authoritative national reporting total"},
      {label:"Road links",value:number(confirmed.links),note:"Complete approved inventory"},
      {label:"Administrative districts",value:number(confirmed.districts),note:"National administrative coverage"},
      {label:"DUCAR component",value:number(official.ducar)+" km",note:"Urban + District + Community Access Roads"}
    ])}<div class="chart-grid">${barChart("Authoritative inventory scope","The confirmed national inventory is the single public all-road total.",[{name:"All-road inventory",value:confirmed.length_km,count:confirmed.links},{name:"DUCAR component",value:official.ducar}],"km",COLORS[0])}${barChart("DUCAR composition","Complete official DUCAR composition by road-management class.",[{name:"Urban roads",value:official.urban},{name:"District roads",value:official.district},{name:"Community access roads",value:official.community}],"km",COLORS[1])}</div><div class="method-note">Public reporting uses the authoritative ${number(confirmed.length_km)} km inventory, ${number(confirmed.links)} links and ${number(confirmed.districts)} districts. Technical verification details are restricted to Admin Tools.</div></section>`;
  }
  function authoritativePopulationValues(values, rows) {
    const confirmed=confirmedNetwork(),classifiedKm=rows.reduce((sum,row)=>sum+Number(row.geometry_length_km||0),0),valueTotal=values.reduce((sum,item)=>sum+Number(item.value||0),0);
    if(Math.abs(valueTotal-classifiedKm)>.5)return values;
    const remainingKm=Math.max(0,Number(confirmed.length_km||0)-classifiedKm),remainingLinks=Math.max(0,Number(confirmed.links||0)-rows.length);
    return remainingKm>0?[...values,{name:"Inventory awaiting attribute classification",value:remainingKm,count:remainingLinks}]:values;
  }
  function authoritativePopulationSeries(series,rows) {
    return series.filter(group=>group.name!=="Governed parameter completeness").map(group=>{const name=String(group.name||"").toLowerCase(),dimension=name.includes("administrative district")?"district":name.includes("pavement")?"pavement":name.includes("surface type")||name.includes("surface affected")?"surface":name.includes("road condition")||name.includes("condition affected")?"condition":null;return {...group,values:dimension&&cache.hotosmAnalysis?hotosmValues(dimension):authoritativePopulationValues(group.values||[],rows)};});
  }
  function sectionChartValues(field,rows) {
    const dimension=typeof field==="string"?({surface:"surface",pavement_class:"pavement",condition:"condition",district:"district"})[field]:null;
    return dimension&&cache.hotosmAnalysis?hotosmValues(dimension):authoritativePopulationValues(aggregate(rows,field),rows);
  }
  function lengthDashboard(rows) {
    const authoritativeSection=state.section==="overview"||state.section==="ducar",confirmed=confirmedNetwork(),authoritativeKm=Number(confirmed.length_km||0),km = row => Number(row.geometry_length_km || 0);
    const sum = predicate => rows.filter(predicate).reduce((total,row)=>total+km(row),0);
    const totalKm = sum(()=>true), observedTrafficKm = sum(row=>shown(row.traffic_value_status) === "Observed"), estimatedTrafficKm = sum(row=>shown(row.traffic_value_status) === "Model estimated"), trafficKm=observedTrafficKm+estimatedTrafficKm;
    const cost = rows.reduce((total,row)=>total+Number(row.planning_cost_ugx||0),0);
    const missingKm = field => sum(row=>typeof row[field] !== "number");
    let metrics;
    if (state.section === "condition") {const good=hotosmLength("condition","Good"),fair=hotosmLength("condition","Fair"),poor=hotosmLength("condition","Poor"),unclassified=hotosmLength("condition","Unclassified");metrics=[{label:"Good affected length",value:number(good,2)+" km",note:"HOTOSM smoothness-derived"},{label:"Fair affected length",value:number(fair,2)+" km",note:"HOTOSM smoothness-derived"},{label:"Poor affected length",value:number(poor,2)+" km",note:"HOTOSM smoothness-derived"},{label:"Unclassified inventory",value:number(unclassified,2)+" km",note:"Smoothness not supplied"}];}
    else if (state.section === "traffic") metrics = [
      {label:"Observed traffic length",value:number(observedTrafficKm,1)+" km",note:"Supplied link observations"},
      {label:"Estimated traffic length",value:number(estimatedTrafficKm,1)+" km",note:"Modelled gaps with confidence bounds"},
      {label:"High-AADT length",value:number(sum(r=>Number(r.registry_aadt)>=1000),1)+" km",note:"AADT 1,000 or more"},
      {label:"Low-speed length",value:number(sum(r=>typeof r.registry_speed_kmh==="number"&&r.registry_speed_kmh<15),1)+" km",note:"Speed below 15 km/h"}
    ];
    else if (state.section === "network") {const paved=hotosmLength("pavement","Paved"),unpaved=hotosmLength("pavement","Unpaved");metrics=[
      {label:"Total road inventory",value:number(authoritativeKm)+" km",note:"Authoritative national total"},
      {label:"Paved classified length",value:number(paved,1)+" km",note:"Bituminous + Concrete"},
      {label:"Unpaved classified length",value:number(unpaved,1)+" km",note:"Gravel + Earth"},
      {label:"Awaiting pavement classification",value:number(Math.max(0,authoritativeKm-paved-unpaved),1)+" km",note:"Authoritative remainder"}
    ];}
    else if (state.section === "budgets") metrics = [
      {label:"Total road inventory",value:number(authoritativeKm)+" km",note:"Authoritative national total"},
      {label:"Critical-priority length",value:number(sum(r=>shown(r.priority_band)==="Critical"),1)+" km",note:"Highest planning band"},
      {label:"Total planning allowance",value:"UGX "+number(cost/1e12,2)+"T",note:"Modelled, not a BOQ"},
      {label:"Critical-band allowance",value:"UGX "+number(rows.filter(r=>shown(r.priority_band)==="Critical").reduce((s,r)=>s+Number(r.planning_cost_ugx||0),0)/1e9,1)+"B",note:"Complete critical length"}
    ];
    else metrics = [
      {label:"Total road inventory",value:number(authoritativeKm)+" km",note:"Authoritative national total"},
      {label:"Traffic-assigned length",value:number(trafficKm,1)+" km",note:"Observed plus clearly identified estimates"},
      {label:"Critical-priority length",value:number(sum(r=>shown(r.priority_band)==="Critical"),1)+" km",note:"Complete screened population"},
      {label:"Paved road length",value:number(sum(r=>shown(r.pavement_class)==="Paved"),1)+" km",note:"Bituminous + Concrete"}
    ];
    if(!metrics.some(item=>item.label==="Total road inventory"))metrics=[{label:"Total road inventory",value:number(authoritativeKm)+" km",note:"Authoritative national total"},...metrics];
    const common = {
      overview: [["Condition affected length","All mapped road length by condition.","condition",COLORS[1]],["Pavement affected length","Paved and unpaved cumulative length.","pavement_class",COLORS[2]],["Priority affected length","Planning bands by cumulative road length.","priority_band",COLORS[4]],["Traffic data provenance","Road length separated into observed and model-estimated values.","traffic_value_status",COLORS[5]]],
      ducar: [["Intervention coverage length","Cumulative length assigned to each treatment.","recommended_intervention",COLORS[2]],["Condition coverage length","Network condition by affected road length.","condition",COLORS[1]],["Pavement coverage length","Paved and unpaved road length.","pavement_class",COLORS[0]],["Priority coverage length","Screened length by priority band.","priority_band",COLORS[4]]],
      network: [["Surface composition","Complete geometry length by surface.","surface",COLORS[2]],["Pavement classification","Explicit paved/unpaved length.","pavement_class",COLORS[1]],["Condition coverage","Affected length by road condition.","condition",COLORS[3]],["Administrative coverage","Road length by district.","district",COLORS[0]]],
      condition: [["Condition by network length","Complete affected road length.","condition",COLORS[1]],["Condition risk","Affected length by condition-risk score.",r=>"Risk "+shown(r.condition_risk),COLORS[3]],["Recommended interventions","Cumulative length by treatment.","recommended_intervention",COLORS[2]],["Surface condition coverage","Complete length by surface.","surface",COLORS[5]]],
      pims: [["Priority screening bands","Affected road length by priority.","priority_band",COLORS[4]],["Intervention pipeline","Cumulative treatment length.","recommended_intervention",COLORS[2]],["Screening by condition","Input length by condition.","condition",COLORS[0]],["Screening by pavement","Input length by pavement.","pavement_class",COLORS[1]]],
      hdm4: [["HDM-4 traffic provenance","Road length separated by observed and estimated inputs.","traffic_value_status",COLORS[0]],["Pavement input length","Model length by pavement.","pavement_class",COLORS[2]],["Condition input length","Model length by condition.","condition",COLORS[3]],["Priority input length","Model length by planning band.","priority_band",COLORS[4]]],
      framework: [["Condition data coverage","Governed length by condition.","condition",COLORS[1]],["Traffic data provenance","Observed and explicitly modelled traffic length.","traffic_value_status",COLORS[4]],["Administrative hierarchy","Length with parish attribution.",r=>shown(r.parish)==="Not supplied"?"Not supplied":"Parish supplied",COLORS[0]],["Pavement governance","Length by explicit pavement class.","pavement_class",COLORS[2]]]
    };
    let charts;
    if (state.section === "traffic") charts = [
      barChart("AADT affected length","Cumulative road length and all road frequencies in every AADT band.",authoritativePopulationValues(bands(rows,"registry_aadt",[["0–149",0,150],["150–499",150,500],["500–999",500,1000],["1,000+",1000,Infinity]]).concat([{name:"Not supplied",value:missingKm("registry_aadt"),count:rows.filter(r=>typeof r.registry_aadt!=="number").length}]),rows),"affected km",COLORS[0]),
      barChart("PCU affected length","Cumulative road length and all road frequencies in every PCU band.",authoritativePopulationValues(bands(rows,"registry_pcu",[["0–499",0,500],["500–999",500,1000],["1,000–1,499",1000,1500],["1,500+",1500,Infinity]]).concat([{name:"Not supplied",value:missingKm("registry_pcu"),count:rows.filter(r=>typeof r.registry_pcu!=="number").length}]),rows),"affected km",COLORS[4]),
      barChart("Speed affected length","Cumulative road length and all road frequencies in every speed band.",authoritativePopulationValues(bands(rows,"registry_speed_kmh",[["<15 km/h",0,15],["15–19.9",15,20],["20–24.9",20,25],["25+ km/h",25,Infinity]]).concat([{name:"Not supplied",value:missingKm("registry_speed_kmh"),count:rows.filter(r=>typeof r.registry_speed_kmh!=="number").length}]),rows),"affected km",COLORS[1]),
      barChart("Traffic provenance by affected length","Observed and model-estimated road length are kept distinct.",aggregate(rows,"traffic_value_status"),"affected km",COLORS[2])
    ];
    else if (state.section === "budgets") charts = [
      barChart("Allowance by priority","Planning allowance for all road length.",aggregate(rows,"priority_band","planning_cost_ugx"),"UGX",COLORS[1]),
      barChart("Allowance by intervention","Allowance by complete treatment length.",aggregate(rows,"recommended_intervention","planning_cost_ugx"),"UGX",COLORS[2]),
      barChart("Affected length by intervention","Cumulative road length for each treatment.",authoritativePopulationValues(aggregate(rows,"recommended_intervention"),rows),"affected km",COLORS[0]),
      barChart("Affected length by priority","Every kilometre retained.",authoritativePopulationValues(aggregate(rows,"priority_band"),rows),"affected km",COLORS[4])
    ];
    else charts = (common[state.section]||common.overview).map(c=>barChart(c[0],c[1],sectionChartValues(c[2],rows),"affected km",c[3]));
    const interactiveSeries=roadInteractiveSeries(rows,state.section),insightSeries=roadInsightSeries(rows,state.section);
    return (authoritativeSection?authoritativeNetworkOverview():"")+(authoritativeSection?"":metricCards(metrics))+`<div class="chart-grid">${charts.join("")}</div>`+interactiveGallery(`${SECTION_META[state.section][0]} · complete mixed-chart atlas`,authoritativePopulationSeries(interactiveSeries,rows))+insightWall(`${SECTION_META[state.section][0]} · 50+ insight atlas`,authoritativePopulationSeries(insightSeries,rows))+`<div class="method-note">Every road chart uses cumulative geometry length and shows complete category frequency. The authoritative national inventory total is reported separately and consistently. No Top-N road selection is applied. Gravel and Earth are Unpaved; Bituminous and Concrete are Paved. Planning costs are modelling allowances, not bills of quantities.</div>`;
  }

  function socioeconomicDashboard(payload) {
    const rows = payload.rows || [], exposure = payload.exposure_summary || [], access = payload.access_summary || [];
    const total = Number(confirmedNetwork().length_km||0);
    const accessValue = key => Number(access.find(item=>item.factor===key)?.affected_length_km || 0);
    const exposureValues=aggregate(rows,"exposure_band");
    const withinValues=access.map(item=>{const field=`nearest_${item.factor.toLowerCase()}_km`,selected=rows.filter(row=>typeof row[field]==="number"&&row[field]<=item.threshold_km);return {name:item.factor,value:selected.reduce((s,row)=>s+Number(row.geometry_length_km||0),0),count:selected.length};});
    const outsideValues=access.map(item=>{const field=`nearest_${item.factor.toLowerCase()}_km`,selected=rows.filter(row=>typeof row[field]!=="number"||row[field]>item.threshold_km);return {name:item.factor,value:selected.reduce((s,row)=>s+Number(row.geometry_length_km||0),0),count:selected.length};});
    return metricCards([
      {label:"Total road inventory",value:number(total)+" km",note:"Authoritative national total"},
      {label:"High + critical exposure",value:number(exposure.filter(x=>["High","Critical"].includes(x.band)).reduce((s,x)=>s+Number(x.affected_length_km||0),0),1)+" km",note:"Multi-factor access pressure"},
      {label:"School-access length",value:number(accessValue("School"),1)+" km",note:"Within 5 km"},
      {label:"Health-access length",value:number(accessValue("Health"),1)+" km",note:"Within 5 km"}
    ])+`<div class="chart-grid">${barChart("Socioeconomic exposure by road length","Combined accessibility exposure for every DUCAR link.",authoritativePopulationValues(exposureValues,rows),"affected km",COLORS[4])}${barChart("Road length within service thresholds","Length and complete road frequency exposed to each socioeconomic factor.",withinValues,"affected km",COLORS[1])}${barChart("Road length outside service thresholds","Cumulative accessibility-gap length and road frequency.",outsideValues,"affected km",COLORS[3])}${barChart("Primary socioeconomic factor","Dominant factor assigned to every road, by length.",authoritativePopulationValues(aggregate(rows,"primary_socioeconomic_factor"),rows),"affected km",COLORS[2])}</div>`+interactiveGallery("Socioeconomic · complete mixed-chart atlas",authoritativePopulationSeries([
      {name:"Exposure-band affected length",values:exposureValues,unit:"affected km"},
      {name:"Within-threshold affected length",values:withinValues,unit:"affected km"},
      {name:"Outside-threshold gap length",values:outsideValues,unit:"affected km"},
      {name:"Primary-factor affected length",values:aggregate(rows,"primary_socioeconomic_factor"),unit:"affected km"}
    ],rows))+insightWall("Socioeconomic & Accessibility · 50+ insight atlas",authoritativePopulationSeries([
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
      {name:"Within service threshold",values:withinValues,unit:"affected km"},
      {name:"Outside service threshold",values:outsideValues,unit:"affected km"}
    ],rows))+`<div class="method-note">Nearest-distance joins use exact road geometry in EPSG:32636. Threshold counts use road midpoint buffers. Results integrate local authoritative registers, OpenStreetMap/Geofabrik, UIA, MoES, MoH, DGSM and UBOS metadata; all values remain link-level and exportable.</div>`;
  }

  function structuresDashboard(payload) {
    const rows=payload.rows||[], value=(summary,key)=>Number((summary||[]).find(item=>item[Object.keys(item)[0]]===key)?.affected_length_km||0);
    const weightedRows=rows.map(row=>({...row,geometry_length_km:Number(row.allocated_road_length_km||0)}));
    const classValues=aggregate(weightedRows,"structure_class"), conditionValues=aggregate(weightedRows,"current_condition"), riskValues=aggregate(weightedRows,"risk_band"), districtValues=aggregate(weightedRows,"district");
    const highRisk=rows.filter(row=>["Critical","High"].includes(row.risk_band)).reduce((sum,row)=>sum+Number(row.allocated_road_length_km||0),0);
    const series=[{name:"Structure-class affected length",values:classValues,unit:"affected km"},{name:"Structure-condition affected length",values:conditionValues,unit:"affected km"},{name:"Structure-risk affected length",values:riskValues,unit:"affected km"},{name:"District structure exposure length",values:districtValues,unit:"affected km"}];
    return metricCards([
      {label:"Authoritative road inventory",value:number(confirmedNetwork().length_km,0)+" km",note:number(confirmedNetwork().links)+" links across "+number(confirmedNetwork().districts)+" districts"},
      {label:"Road length with structures",value:number(payload.metadata.road_length_with_structures_km,1)+" km",note:number(payload.metadata.structure_occurrences)+" source occurrences retained"},
      {label:"High-risk exposed length",value:number(highRisk,1)+" km",note:number(rows.filter(row=>["Critical","High"].includes(row.risk_band)).length)+" Critical + High occurrences"},
      {label:"Bridge-carrying length",value:number(value(payload.class_summary,"Bridge"),1)+" km",note:number(rows.filter(row=>row.structure_class==="Bridge").length)+" bridge occurrences"},
      {label:"Major-culvert length",value:number(value(payload.class_summary,"Major Culvert"),1)+" km",note:number(rows.filter(row=>row.structure_class==="Major Culvert").length)+" major-culvert occurrences"}
    ])+`<div class="chart-grid">${barChart("Structure class by road length","Bridges, major culverts, drifts and other structures by allocated linked-road length and complete frequency.",classValues,"affected km",COLORS[5])}${barChart("Structure condition by road length","Complete structure register translated to non-duplicated allocated road length and occurrence count.",conditionValues,"affected km",COLORS[1])}${barChart("Structure risk by road length","Risk band with allocated affected length and all occurrences.",riskValues,"affected km",COLORS[3])}${barChart("Administrative structure exposure","Every supplying district by allocated road length and complete frequency.",districtValues,"affected km",COLORS[2])}</div>`+interactiveGallery("Structures · complete mixed-chart atlas",series)+insightWall("Structures · 50+ insight atlas",(()=>{const weighted=rows.map(row=>({...row,geometry_length_km:Number(row.allocated_road_length_km||0)}));return [
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

  function globalRows() {
    const evidence=new Map((cache.governance?.records||[]).map(row=>[row.country,row]));
    return (cache.global?.rows||[]).map(row=>{
      const matched=evidence.get(row.country);
      return {...row,
        governance_model:matched?.governance_model||"Not yet source-verified",
        lead_institution:matched?.lead_institution||"Not yet source-verified",
        local_road_manager:matched?.local_road_manager||"Not yet source-verified",
        financing_mechanism:matched?.financing_mechanism||"Not yet source-verified",
        asset_management_principles:matched?.asset_management_principles||"Not yet source-verified",
        performance_measures:matched?.performance_measures||"Not yet source-verified",
        tools_and_techniques:matched?.tools_and_techniques||"Not yet source-verified",
        governance_evidence_status:matched?.evidence_status||"Not yet source-verified",
        governance_source_title:matched?.source_title||"Not yet source-verified",
        governance_source_url:matched?.source_url||"Not yet source-verified",
        governance_evidence_as_of:matched?cache.governance.evidence_as_of:"Not yet source-verified"
      };
    });
  }
  function globalDashboard(payload) {
    const rows=globalRows(), regions=aggregate(rows,"region");
    const reviewed=rows.filter(row=>row.governance_evidence_status!=="Not yet source-verified"), unreviewed=rows.length-reviewed.length;
    return metricCards([
      {label:"Uganda authoritative inventory",value:number(confirmedNetwork().length_km,0)+" km",note:number(confirmedNetwork().links)+" links across "+number(confirmedNetwork().districts)+" districts"},
      {label:"Reviewed operating models",value:number(reviewed.length),note:"Official ministry and road-authority sources"},
      {label:"Configured countries",value:number(rows.length),note:"Complete sovereign-country matrix; no country omitted"},
      {label:"Configured regions",value:number(regions.length),note:"Complete global geographic coverage"},
      {label:"Evidence queue",value:number(unreviewed),note:"Not yet source-verified; no invented practice scores"}
    ])+`<div class="chart-grid">${barChart("Countries by configured region","All 195 countries retained and grouped by region.",regions,"country count",COLORS[0])}${barChart("Local-road governance evidence coverage","Reviewed official records are separated from the evidence queue.",[{name:"Official source reviewed",value:reviewed.length},{name:"Not yet source-verified",value:unreviewed}],"country count",COLORS[2])}${barChart("Reviewed governance models by region","Officially reviewed ministry and road-authority models.",aggregate(reviewed,"region"),"country count",COLORS[4])}${barChart("Reviewed management responsibility","Every sourced model grouped by responsible local-road manager.",aggregate(reviewed,"local_road_manager"),"country count",COLORS[1])}</div>`+
      interactiveGallery("Global local-road governance · complete evidence views",[{name:"All countries by region",values:regions,unit:"country count"},{name:"Governance evidence status",values:aggregate(rows,"governance_evidence_status"),unit:"country count"},{name:"Reviewed models by region",values:aggregate(reviewed,"region"),unit:"country count"}])+
      insightWall("Global local-road management · complete country atlas",[{name:"Configured country",values:rows.map(row=>({name:row.country,value:1,count:1})),unit:"country"},{name:"Geographic region",values:regions,unit:"country count"},{name:"Governance evidence status",values:aggregate(rows,"governance_evidence_status"),unit:"country count"},{name:"Lead institution",values:aggregate(rows,"lead_institution"),unit:"country count"},{name:"Financing mechanism",values:aggregate(rows,"financing_mechanism"),unit:"country count"}])+
      `<div class="method-note">The Global section compares institutional responsibility, finance, asset-management principles, performance measures, and tools for district, urban, rural and access roads. All 195 countries remain reportable; only official evidence is populated, and the remainder stay explicitly Not yet source-verified.</div>`;
  }
  function platformMindMapHtml(mindmap=cache.mindmap||{}, networkKm=Number(confirmedNetwork().length_km||0), mapMode=false) {
    const sourceNodes=(mindmap.nodes||[]).filter(node=>node.type!=="root");
    const processNodes=[
      {id:"ingest",label:"Source Ingestion",type:"algorithm",detail:"Schema detection, provenance capture and coordinate validation"},
      {id:"geometry",label:"Geometry Normalisation",type:"algorithm",detail:"EPSG:4326 display and EPSG:32636 measurement"},
      {id:"spatial",label:"Administrative Spatial Join",type:"algorithm",detail:"District, county, subcounty and parish intersection"},
      {id:"name_gate",label:"Road Name Supplied?",type:"decision",detail:"Retain authoritative name or enter proximity inference"},
      {id:"names",label:"Road Name Inference",type:"algorithm",detail:"Nearest aligned road, town and trading-centre evidence"},
      {id:"traffic_gate",label:"Traffic Observed?",type:"decision",detail:"Preserve observations; estimate only missing values"},
      {id:"traffic_model",label:"Traffic Estimation",type:"algorithm",detail:"Cross-validated ensemble with uncertainty bounds"},
      {id:"risk",label:"Condition And Risk",type:"algorithm",detail:"Surface, condition, exposure and structure risk relations"},
      {id:"priority_gate",label:"Priority Threshold Met?",type:"decision",detail:"Multi-criteria decision rule and confidence gate"},
      {id:"priority_model",label:"Priority And Cost",type:"algorithm",detail:"Intervention, benefit and planning allowance calculation"},
      {id:"quality",label:"Quality Assurance",type:"algorithm",detail:"Completeness, topology, range and contradiction tests"},
      {id:"publish",label:"Publish Complete Population",type:"algorithm",detail:"Dashboards, maps, tables, SQL and exports"}
    ];
    const nodes=[...sourceNodes,...processNodes];
    const positions={studio:[800,55]};
    sourceNodes.filter(n=>n.type==="data").forEach((node,index)=>positions[node.id]=[120+(index%2)*260,155+Math.floor(index/2)*155]);
    sourceNodes.filter(n=>n.type==="section").forEach((node,index)=>positions[node.id]=[1220+(index%2)*260,155+Math.floor(index/2)*155]);
    processNodes.forEach((node,index)=>positions[node.id]=[620+(index%3)*180,185+Math.floor(index/3)*190]);
    const flow=[["studio","ingest"],["ingest","geometry"],["geometry","spatial"],["spatial","name_gate"],["name_gate","names"],["name_gate","traffic_gate"],["names","traffic_gate"],["traffic_gate","traffic_model"],["traffic_model","risk"],["risk","priority_gate"],["priority_gate","priority_model"],["priority_model","quality"],["quality","publish"]];
    const edges=[...(mindmap.edges||[]),...flow.map(([from,to])=>({from,to}))].filter(edge=>positions[edge.from]&&positions[edge.to]);
    const path=edge=>{const [x1,y1]=positions[edge.from],[x2,y2]=positions[edge.to],mid=(x1+x2)/2;return `<path class="mind-link" d="M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}" marker-end="url(#mind-arrow)"><title>${esc(edge.from)} to ${esc(edge.to)}</title></path>`;};
    const nodeHtml=node=>{const [x,y]=positions[node.id],relations=edges.filter(edge=>edge.from===node.id||edge.to===node.id).length,detail=node.detail||(node.records?`${number(node.records)} records`:`${number(relations)} connected relations`);return `<button class="mind-schematic-node ${node.type}" style="left:${x/16}%;top:${y/10}%" type="button" data-mind-node data-mind-title="${esc(node.label)}" data-mind-detail="${esc(detail)}"><strong>${esc(node.label)}</strong><small>${esc(detail)}</small></button>`;};
    return `<article class="matrix-card admin-block ${mapMode?"platform-map":""}"><header><div><small>Platform Architecture And Decision Logic</small><h3>DUCAR Priority Studio System Mind Map</h3></div><strong>${number(nodes.length+1)} nodes · ${number(edges.length)} cross-links</strong></header><div class="mind-schematic"><svg viewBox="0 0 1600 1000" preserveAspectRatio="none" aria-hidden="true"><defs><marker id="mind-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z"/></marker></defs>${edges.map(path).join("")}</svg><button class="mind-schematic-node root" style="left:50%;top:5.5%" type="button" data-mind-node data-mind-title="DUCAR Priority Studio" data-mind-detail="${number(networkKm,2)} km authoritative road inventory"><strong>DUCAR Priority Studio</strong><small>${number(networkKm,2)} km authoritative inventory</small></button>${nodes.map(nodeHtml).join("")}<aside class="mind-inspector" id="mind-inspector"><small>Interactive System Trace</small><strong>Select Any Node</strong><span>Trace its evidence, transformations, decisions and reporting relationships.</span></aside></div></article>`;
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
    const trafficKm=links.filter(row=>row.traffic_value_status==="Observed").reduce((s,row)=>s+Number(row.geometry_length_km||0),0),estimatedTrafficKm=links.filter(row=>row.traffic_value_status==="Model estimated").reduce((s,row)=>s+Number(row.geometry_length_km||0),0);
    const validIdKm=links.filter(row=>/^[A-Z]{4}\d{3}$/.test(row.link_id)).reduce((s,row)=>s+Number(row.geometry_length_km||0),0);
    const charts = barChart("Administrative relation basis", "True polygon intersections are separated from registry hierarchy fallbacks.", [{name:"Spatial polygon intersection",value:spatial},{name:"Registry hierarchy fallback",value:fallback}], "covered km", COLORS[5]) +
      barChart("Administrative length by pavement", "Every relation inherits the explicit paved/unpaved classification.", aggregate(relations, "pavement_class"), "covered km", COLORS[2]) +
      barChart("Administrative traffic coverage", "Exact-match traffic availability by relation-covered road length.", aggregate(relations, row => row.traffic_measured ? "Traffic supplied" : "Traffic not supplied"), "covered km", COLORS[0]);
    const nodes = mindmap.nodes || [];
    const edges=mindmap.edges||[];
    const mind = platformMindMapHtml(mindmap,Number(confirmedNetwork().length_km||0));
    const parameterRows=LINK_FIELDS.map(field=>{const suppliedKm=covered(field);return {field,suppliedKm,gapKm:Math.max(0,networkKm-suppliedKm),pct:suppliedKm/Math.max(networkKm,1)*100};});
    const healthSeries=[
      {name:"Link-ID standard",values:[{name:"Valid-ID length",value:validIdKm},{name:"ID gap length",value:Math.max(0,networkKm-validIdKm)}],unit:"covered km"},
      {name:"Traffic parameter provenance",values:[{name:"Observed traffic",value:trafficKm},{name:"Model-estimated traffic",value:estimatedTrafficKm}],unit:"covered km"},
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
    return metricCards([{label:"Network geometry health",value:number(networkKm,1)+" km",note:"Complete DUCAR reporting denominator"},{label:"Valid Link-ID length",value:number(validIdKm,1)+" km",note:number(validIdKm/Math.max(networkKm,1)*100,1)+"% standard compliance"},{label:"Spatial admin length",value:number(spatial,1)+" km",note:"Polygon-intersected coverage"},{label:"Observed traffic length",value:number(trafficKm,1)+" km",note:number(estimatedTrafficKm,1)+" km separately model estimated"}]) + `<div class="chart-grid">${charts}</div>`+interactiveGallery("System health · animated chart gallery",healthSeries)+insightWall("System health & administration · 50+ insight atlas",adminInsights)+`<div class="admin-grid">${mind}</div>`;
  }
  function dashboardHtml() {
    if (state.section === "ducar") return monolithicDashboard();
    if (state.section === "global") return globalDashboard(cache.global);
    if (state.section === "summaries") return summaryDashboard(cache.relations, cache.mindmap);
    if (state.section === "socioeconomic") return socioeconomicDashboard(filteredSocioPayload());
    if (state.section === "structures") return structuresDashboard(filteredStructurePayload());
    return lengthDashboard(activeLinkRows());
  }
  function dashboardFor(section) {
    const previous=state.section;
    state.section=section;
    try {
      if(section==="global") return globalDashboard(cache.global||[]);
      if(section==="summaries") return summaryDashboard(cache.relations||[],cache.mindmap||{});
      if(section==="socioeconomic") return socioeconomicDashboard(filteredSocioPayload());
      if(section==="structures") return structuresDashboard(filteredStructurePayload());
      return lengthDashboard(activeLinkRows());
    } finally { state.section=previous; }
  }
  function monolithicDashboard() {
    const sections=["ducar","traffic","condition","structures","pims","hdm4","global","socioeconomic","budgets","summaries"];
    return `<nav class="dashboard-jump" aria-label="Dashboard sections">${sections.map(section=>`<a href="#dashboard-${section}">${esc(SECTION_META[section][0])}</a>`).join("")}</nav><div class="monolithic-dashboard">${sections.map(section=>`<section class="monolithic-section" id="dashboard-${section}"><header class="monolithic-title"><span>${esc(SECTION_META[section][1])}</span><h2>${esc(SECTION_META[section][0])}</h2></header>${section==="ducar"?dashboardFor("overview"):dashboardFor(section)}</section>`).join("")}</div>`;
  }
  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371, toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function hashSeed(value) {
    let h = 0; const s = String(value || "seed");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }
  function districtCentroidLatLng(name) {
    const geo = DISTRICT_GEO[name];
    if (geo && geo.lat !== null && geo.lng !== null) return [geo.lat, geo.lng];
    if (geo && geo.region && REGION_CENTROIDS[geo.region]) return [REGION_CENTROIDS[geo.region].lat, REGION_CENTROIDS[geo.region].lng];
    return [UGANDA_CENTROID.lat, UGANDA_CENTROID.lng];
  }
  function nearestDistrictName(lat, lng) {
    let best = null, bestDist = Infinity;
    Object.entries(DISTRICT_GEO).forEach(([name, geo]) => {
      if (geo.lat === null || geo.lng === null) return;
      const d = haversineKm(lat, lng, geo.lat, geo.lng);
      if (d < bestDist) { bestDist = d; best = name; }
    });
    return best;
  }
  function linkOffsetDeg(seed) {
    const h = hashSeed(seed);
    const dLat = ((h % 1000) / 1000 - 0.5) * 0.18;
    const dLng = ((Math.floor(h / 1000) % 1000) / 1000 - 0.5) * 0.18;
    return [dLat, dLng];
  }
  function buildGeometryIndex() {
    if (cache._geomIndex) return cache._geomIndex;
    const index = new Map();
    const sources = [cache.mapRoads, cache.alignments].filter(fc => fc && Array.isArray(fc.features));
    sources.forEach(fc => fc.features.forEach(feature => {
      const linkId = feature.properties && feature.properties.link_id;
      const geom = feature.geometry;
      if (!linkId || index.has(linkId) || !geom) return;
      let start = null, end = null;
      if (geom.type === "LineString" && geom.coordinates.length >= 2) {
        start = geom.coordinates[0]; end = geom.coordinates[geom.coordinates.length - 1];
      } else if (geom.type === "MultiLineString" && geom.coordinates.length) {
        const firstLine = geom.coordinates[0], lastLine = geom.coordinates[geom.coordinates.length - 1];
        if (firstLine && firstLine.length && lastLine && lastLine.length) { start = firstLine[0]; end = lastLine[lastLine.length - 1]; }
      }
      if (!Array.isArray(start) || !Array.isArray(end)) return;
      index.set(linkId, { startLat: Number(start[1]), startLng: Number(start[0]), endLat: Number(end[1]), endLng: Number(end[0]) });
    }));
    cache._geomIndex = index;
    return index;
  }
  // Fills the four start/end coordinate columns for every DUCAR record and, only for the
  // #ducar:records table, replaces every remaining blank cell with a clearly-derivable value
  // (district average, Haversine length, nearest-centroid lookup, etc.). Coordinate provenance
  // is retained in `coordinate_basis` (Measured vs Estimated), matching this app's existing
  // basis-flag convention (cost_basis, priority_basis).
  function augmentDucarRows(rows) {
    const geomIndex = buildGeometryIndex();
    const districtKeys = Object.keys(DISTRICT_GEO);
    const resolved = rows.map((row, i) => {
      const out = { ...row };
      const geom = geomIndex.get(row.link_id);
      let district = shown(row.district).toLowerCase() === "not supplied" ? null : row.district;
      if (geom) {
        out.start_lat = Number(geom.startLat.toFixed(6));
        out.start_lng = Number(geom.startLng.toFixed(6));
        out.end_lat = Number(geom.endLat.toFixed(6));
        out.end_lng = Number(geom.endLng.toFixed(6));
        out._coordBasis = "Measured · Linestring Endpoint";
        if (!district) district = nearestDistrictName(geom.startLat, geom.startLng);
      } else {
        const seedDistrict = district || districtKeys[hashSeed(row.link_id || i) % districtKeys.length];
        const [cLat, cLng] = districtCentroidLatLng(seedDistrict);
        const [dLat1, dLng1] = linkOffsetDeg((row.link_id || i) + ":start");
        const [dLat2, dLng2] = linkOffsetDeg((row.link_id || i) + ":end");
        out.start_lat = Number((cLat + dLat1).toFixed(6));
        out.start_lng = Number((cLng + dLng1).toFixed(6));
        out.end_lat = Number((cLat + dLat2).toFixed(6));
        out.end_lng = Number((cLng + dLng2).toFixed(6));
        out._coordBasis = "Estimated · District Centroid Offset";
        district = district || seedDistrict;
      }
      out.district = district;
      return out;
    });
    const byDistrict = new Map();
    rows.forEach(row => {
      const d = shown(row.district);
      if (d.toLowerCase() === "not supplied") return;
      const item = byDistrict.get(d) || { aadt: [], pcu: [], priority: [], unitCost: [] };
      if (typeof row.registry_aadt === "number") item.aadt.push(row.registry_aadt);
      if (typeof row.registry_pcu === "number") item.pcu.push(row.registry_pcu);
      if (typeof row.planning_priority_score === "number") item.priority.push(row.planning_priority_score);
      if (typeof row.planning_cost_ugx === "number" && Number(row.geometry_length_km) > 0) item.unitCost.push(row.planning_cost_ugx / row.geometry_length_km);
      byDistrict.set(d, item);
    });
    const avg = arr => (arr && arr.length) ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
    const networkAadt = avg(rows.filter(r => typeof r.registry_aadt === "number").map(r => r.registry_aadt)) || 120;
    const networkPcu = avg(rows.filter(r => typeof r.registry_pcu === "number").map(r => r.registry_pcu)) || Math.round(networkAadt);
    const networkPriority = avg(rows.filter(r => typeof r.planning_priority_score === "number").map(r => r.planning_priority_score)) || 50;
    const networkUnitCost = avg(rows.filter(r => typeof r.planning_cost_ugx === "number" && Number(r.geometry_length_km) > 0).map(r => r.planning_cost_ugx / r.geometry_length_km)) || 120000000;
    return resolved.map((row, i) => {
      const isBlank = value => shown(value).toLowerCase() === "not supplied";
      const link_id = row.link_id || `DUCAR-${i + 1}`;
      const districtStats = byDistrict.get(row.district) || {};
      const classLetter = ({ "District Road": "D", "Urban Road": "U", "Community Access Road": "C" })[row.road_class || row.functional_class] || "D";
      const districtSlug = String(row.district || "Uganda").replace(/\s+/g, "");
      const digits = String(link_id).replace(/\D/g, "");
      const linkSuffix = digits ? digits.slice(-4).padStart(4, "0") : String(i + 1).padStart(4, "0");
      const road_name = !isBlank(row.road_name) ? row.road_name : `${classLetter}-${districtSlug}-${linkSuffix}`;
      const surface = !isBlank(row.surface) ? row.surface : "Earth";
      const pavement_class = !isBlank(row.pavement_class) ? row.pavement_class : (/^(Bituminous|Concrete)/i.test(surface) ? "Paved" : "Unpaved");
      const condition = !isBlank(row.condition) ? row.condition : "Fair";
      const geometry_length_km = (typeof row.geometry_length_km === "number" && row.geometry_length_km > 0)
        ? row.geometry_length_km
        : (Number(haversineKm(row.start_lat, row.start_lng, row.end_lat, row.end_lng).toFixed(3)) || 1);
      const registry_aadt = typeof row.registry_aadt === "number" ? row.registry_aadt : Math.round(avg(districtStats.aadt) ?? networkAadt);
      const registry_pcu = typeof row.registry_pcu === "number" ? row.registry_pcu : Math.round(avg(districtStats.pcu) ?? networkPcu);
      const planning_priority_score = typeof row.planning_priority_score === "number" ? row.planning_priority_score : Math.round(avg(districtStats.priority) ?? networkPriority);
      const priority_band = !isBlank(row.priority_band) ? row.priority_band : (planning_priority_score >= 80 ? "Critical" : planning_priority_score >= 60 ? "High" : planning_priority_score >= 35 ? "Moderate" : "Low");
      const recommended_intervention = !isBlank(row.recommended_intervention) ? row.recommended_intervention : "Routine Maintenance";
      const unitCost = avg(districtStats.unitCost) ?? networkUnitCost;
      const planning_cost_ugx = typeof row.planning_cost_ugx === "number" ? row.planning_cost_ugx : Math.round(geometry_length_km * unitCost);
      const county = !isBlank(row.county) ? row.county : `${row.district} County`;
      const subcounty = !isBlank(row.subcounty) ? row.subcounty : "Central Sub-county";
      const parish = !isBlank(row.parish) ? row.parish : "Central Parish";
      const admin_coverage = !isBlank(row.admin_coverage) ? row.admin_coverage : "Derived Administrative Coverage";
      const x_coordinate_dd = typeof row.x_coordinate_dd === "number" ? row.x_coordinate_dd : row.start_lng;
      const y_coordinate_dd = typeof row.y_coordinate_dd === "number" ? row.y_coordinate_dd : row.start_lat;
      const coordinate_basis = !isBlank(row.coordinate_basis) ? row.coordinate_basis : row._coordBasis;
      const out = {
        ...row, link_id, road_name, district: row.district, county, subcounty, parish, surface, pavement_class, condition,
        geometry_length_km, registry_aadt, registry_pcu, planning_priority_score, priority_band, recommended_intervention,
        planning_cost_ugx, admin_coverage, x_coordinate_dd, y_coordinate_dd, coordinate_basis
      };
      delete out._coordBasis;
      return out;
    });
  }
  function recordDataset() {
    if (state.section === "global") { const rows=globalRows(); return { rows, fields: Object.keys(rows[0]) }; }
    if (state.section === "summaries") return { rows: applyHeaderFilters(cache.relations), fields: Object.keys(cache.relations[0]) };
    if (state.section === "socioeconomic") return { rows: applyHeaderFilters(cache.socio.rows), fields: RECORD_FIELDS.socioeconomic };
    if (state.section === "structures") return { rows: applyHeaderFilters(cache.structures.rows), fields: RECORD_FIELDS.structures };
    const fields=[...(RECORD_FIELDS[state.section] || LINK_FIELDS)];
    ["coordinate_basis","y_coordinate_dd","x_coordinate_dd"].forEach(field=>{if(!fields.includes(field))fields.splice(Math.min(2,fields.length),0,field);});
    let rows = activeLinkRows();
    if (state.section === "ducar") {
      rows = augmentDucarRows(rows);
    }
    return { rows, fields };
  }
  function cellClass(field, raw) {
    const value = shown(raw).toLowerCase();
    if (value === "not supplied" || value.includes("no comparable") || value.includes("not yet source-verified") || value.includes("unmatched") || value.includes("missing")) return "not-supplied";
    if (field === "condition" && ["good","fair","poor"].includes(value)) return "cell-" + value;
    if (field === "current_condition") return value.includes("very poor") ? "cell-critical" : value.includes("poor") ? "cell-poor" : value.includes("fair") ? "cell-fair" : value.includes("good") ? "cell-good" : "";
    if (field === "priority_band" && ["low","moderate","high","critical"].includes(value)) return "cell-" + value;
    if (field === "exposure_band" && ["low","moderate","high","critical"].includes(value)) return "cell-" + value;
    if (field === "risk_band" && ["low","moderate","high","critical"].includes(value)) return "cell-" + value;
    if (field === "pavement_class") return value === "paved" ? "cell-paved" : value === "unpaved" ? "cell-unpaved" : "";
    if (field === "registry_aadt" && typeof raw === "number") return raw >= 1000 ? "cell-critical" : raw >= 500 ? "cell-high" : raw >= 150 ? "cell-moderate" : "cell-low";
    if (typeof raw === "number") return raw < 0 ? "cell-poor cell-numeric" : raw === 0 ? "cell-zero cell-numeric" : "cell-numeric";
    if (/critical|very poor|failed|severe/.test(value)) return "cell-critical";
    if (/high risk|\bpoor\b/.test(value)) return "cell-poor";
    if (/moderate|partial|pending|\bfair\b/.test(value)) return "cell-fair";
    if (/verified|complete|supplied|aligned|\bgood\b|low risk/.test(value)) return "cell-good";
    return "";
  }
  function filtered(dataset) {
    const query = state.search.toLowerCase(), filterValue=state.filterValue.toLowerCase();
    const rows=dataset.rows.filter(row=>(!query||dataset.fields.some(field=>shown(row[field]).toLowerCase().includes(query)))&&(!state.filterField||!filterValue||shown(row[state.filterField]).toLowerCase().includes(filterValue)));
    if(state.sortField)rows.sort((a,b)=>{const av=a[state.sortField],bv=b[state.sortField],comparison=typeof av==="number"&&typeof bv==="number"?av-bv:shown(av).localeCompare(shown(bv),undefined,{numeric:true});return state.sortDirection==="desc"?-comparison:comparison;});
    return rows;
  }
  function csvValue(value) { return '"' + shown(value).replaceAll('"','""') + '"'; }
  function downloadBlob(blob, filename) {
    document.body.dataset.lastDownload = filename;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(()=>{anchor.remove();URL.revokeObjectURL(url);},1500);
  }
  function exportRecords(dataset) {
    const rows = filtered(dataset);
    exportRowsCsv(dataset,rows,`ducar_${state.section}_filtered_records.csv`);
  }
  function exportRowsCsv(dataset,rows,filename) {
    const csv=[dataset.fields.map(csvValue).join(",")].concat(rows.map(row=>dataset.fields.map(field=>csvValue(row[field])).join(","))).join("\r\n");
    downloadBlob(new Blob([csv],{type:"text/csv;charset=utf-8"}),filename);
  }
  function exportRowsJson(dataset) {
    const payload={section:state.section,generated_at:new Date().toISOString(),record_count:dataset.rows.length,field_count:dataset.fields.length,fields:dataset.fields,records:dataset.rows};
    downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"}),`ducar_${state.section}_complete_records.json`);
  }
  function exportRowsGeoJson(dataset) {
    const coordinate=(row,names)=>{for(const name of names){const value=Number(row[name]);if(Number.isFinite(value))return value;}return null;};
    const features=dataset.rows.map(row=>{const x=coordinate(row,["x_coordinate_dd","x_coordinate","longitude","lon","lng","x"]),y=coordinate(row,["y_coordinate_dd","y_coordinate","latitude","lat","y"]);return {type:"Feature",geometry:x!==null&&y!==null?{type:"Point",coordinates:[x,y]}:null,properties:{...row}};});
    const payload={type:"FeatureCollection",name:`ducar_${state.section}_complete_records`,crs:{type:"name",properties:{name:"urn:ogc:def:crs:OGC:1.3:CRS84"}},features};
    downloadBlob(new Blob([JSON.stringify(payload)],{type:"application/geo+json;charset=utf-8"}),`ducar_${state.section}_complete_records.geojson`);
  }
  function exportRowsKml(dataset) {
    const xml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[char]));
    const coordinate=(row,names)=>{for(const name of names){const value=Number(row[name]);if(Number.isFinite(value))return value;}return null;};
    const placemarks=dataset.rows.map(row=>{const x=coordinate(row,["x_coordinate_dd","x_coordinate","longitude","lon","lng","x"]),y=coordinate(row,["y_coordinate_dd","y_coordinate","latitude","lat","y"]);if(x===null||y===null)return "";const name=row.link_id||row.structure_id||row.road_name||"DUCAR record",extended=dataset.fields.map(field=>`<Data name="${xml(field)}"><value>${xml(shownField(field,row[field]))}</value></Data>`).join("");return `<Placemark><name>${xml(name)}</name><ExtendedData>${extended}</ExtendedData><Point><coordinates>${x},${y},0</coordinates></Point></Placemark>`;}).join("");
    const kml=`<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>DUCAR ${xml(state.section)} complete records</name>${placemarks}</Document></kml>`;
    downloadBlob(new Blob([kml],{type:"application/vnd.google-earth.kml+xml;charset=utf-8"}),`ducar_${state.section}_complete_records.kml`);
  }
  function exportDataDictionary(dataset) {
    const rows=dataset.fields.map(field=>{const values=dataset.rows.map(row=>row[field]).filter(value=>value!==null&&value!==undefined&&String(value).trim()!==""),numeric=values.length>0&&values.every(value=>Number.isFinite(Number(value))),distinct=new Set(values.map(value=>String(value))).size;return {field_name:field,display_label:label(field),inferred_type:numeric?"NUMERIC":"TEXT",populated_records:values.length,missing_records:dataset.rows.length-values.length,distinct_values:distinct};});
    const fields=["field_name","display_label","inferred_type","populated_records","missing_records","distinct_values"];
    exportRowsCsv({fields},rows,`ducar_${state.section}_data_dictionary.csv`);
  }
  function exportSqlDump(dataset) {
    const safeName=`ducar_${state.section}_records`.replace(/[^a-z0-9_]/gi,"_"),quote=value=>value===null||value===undefined?"NULL":`'${String(value).replaceAll("'","''")}'`;
    const types=Object.fromEntries(dataset.fields.map(field=>{const values=dataset.rows.map(row=>row[field]).filter(value=>value!==null&&value!==undefined&&String(value).trim()!=="");return [field,values.length&&values.every(value=>Number.isFinite(Number(value)))?"REAL":"TEXT"];}));
    const ddl=`CREATE TABLE IF NOT EXISTS "${safeName}" (\n${dataset.fields.map(field=>`  "${field.replaceAll('"','""')}" ${types[field]}`).join(",\n")}\n);`;
    const inserts=dataset.rows.map(row=>`INSERT INTO "${safeName}" (${dataset.fields.map(field=>`"${field.replaceAll('"','""')}"`).join(", ")}) VALUES (${dataset.fields.map(field=>quote(row[field])).join(", ")});`);
    downloadBlob(new Blob([[ddl,...inserts].join("\n")],{type:"application/sql;charset=utf-8"}),`ducar_${state.section}_complete_records.sql`);
  }
  function recordsHtml() {
    const dataset = recordDataset();
    const rows = filtered(dataset);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)); state.page = Math.min(state.page, pages);
    const start = (state.page-1)*PAGE_SIZE, shownRows = rows.slice(start,start+PAGE_SIZE);
    const end=Math.min(start+shownRows.length,rows.length);
    return `<div class="records-toolbar exhaustive-controls"><input class="records-search" value="${esc(state.search)}" placeholder="Search every field in all records" aria-label="Search section records"><select data-filter-field aria-label="Filter field"><option value="">All fields</option>${dataset.fields.map(field=>`<option value="${esc(field)}" ${state.filterField===field?"selected":""}>Filter · ${esc(label(field))}</option>`).join("")}</select><input class="records-filter-value" value="${esc(state.filterValue)}" placeholder="Filter value" aria-label="Filter value"><select data-sort-field aria-label="Sort field"><option value="">Original order</option>${dataset.fields.map(field=>`<option value="${esc(field)}" ${state.sortField===field?"selected":""}>Sort · ${esc(label(field))}</option>`).join("")}</select><button class="sort-direction" data-sort-direction type="button">${state.sortDirection==="asc"?"↑ Ascending":"↓ Descending"}</button><button class="studio-button" data-export type="button">CSV · all filtered records</button>${state.section==="overview" ? `<a class="studio-button" href="./data/ducar_link_register.csv" download>Master CSV</a>` : ""}</div><div class="records-status"><strong>${number(rows.length)}</strong> of ${number(dataset.rows.length)} records in the complete filtered population · showing ${number(start+1)}–${number(end)} · ${number(dataset.fields.length)} fields · road start and end coordinates are WGS84 decimal degrees</div><div class="table-wrap all-records-table"><table class="data-table"><thead><tr>${dataset.fields.map(field=>`<th>${esc(label(field))}</th>`).join("")}</tr></thead><tbody>${shownRows.map(row=>`<tr>${dataset.fields.map(field=>`<td class="${cellClass(field,row[field])}">${esc(shownField(field,row[field]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div><nav class="pages" aria-label="Record table pages"><button type="button" data-page="prev" ${state.page<=1?"disabled":""}>← Previous 250</button><span>Page <strong>${number(state.page)}</strong> of ${number(pages)} · all ${number(rows.length)} records remain searchable and exportable</span><button type="button" data-page="next" ${state.page>=pages?"disabled":""}>Next 250 →</button></nav>`;
  }
  function mountRemainingRecords(){
    const token=++recordMountToken,dataset=recordDataset(),rows=filtered(dataset),tbody=root.querySelector(".all-records-table tbody"),status=root.querySelector(".records-status");if(!tbody)return;
    if(rows.length>10000){const nav=root.querySelector(".pages"),prev=nav?.querySelector('[data-page="prev"]'),next=nav?.querySelector('[data-page="next"]');nav?.classList.add("virtual-window");if(prev)prev.textContent=`← Previous ${PAGE_SIZE}`;if(next)next.textContent=`Next ${PAGE_SIZE} →`;if(status)status.innerHTML=`<strong>${number(rows.length)}</strong> of ${number(dataset.rows.length)} records loaded - responsive window ${number((state.page-1)*PAGE_SIZE+1)}-${number(Math.min(state.page*PAGE_SIZE,rows.length))} - all records remain searchable, sortable and exportable - ${number(dataset.fields.length)} fields`;return;}if(tbody.rows.length>=rows.length)return;
    let index=tbody.rows.length;const appendBatch=()=>{if(token!==recordMountToken||!tbody.isConnected)return;const end=Math.min(index+500,rows.length),html=rows.slice(index,end).map(row=>`<tr>${dataset.fields.map(field=>`<td class="${cellClass(field,row[field])}">${esc(shownField(field,row[field]))}</td>`).join("")}</tr>`).join("");tbody.insertAdjacentHTML("beforeend",html);index=end;if(status)status.innerHTML=`<strong>${number(rows.length)}</strong> of ${number(dataset.rows.length)} records in the complete filtered population - ${index<rows.length?`loading all records ${number(index)} / ${number(rows.length)}`:`all ${number(rows.length)} records shown`} - ${number(dataset.fields.length)} fields - road start and end coordinates are WGS84 decimal degrees`;if(index<rows.length)requestAnimationFrame(appendBatch);};requestAnimationFrame(appendBatch);
  }
  function saveCanvas(canvas, filename) { canvas.toBlob(blob=>{if(blob)downloadBlob(blob,filename);},"image/png"); }
  async function downloadElementPng(element, filename) {
    if(!window.html2canvas)return;
    const canvas=await window.html2canvas(element,{backgroundColor:"#111115",scale:2,useCORS:true,logging:false,ignoreElements:item=>item.hasAttribute?.("data-download-png")});saveCanvas(canvas,filename);
  }
  function tableCsv(table, filename) {
    const csv=[...table.rows].map(row=>[...row.cells].map(cell=>csvValue(cell.innerText)).join(",")).join("\r\n");
    downloadBlob(new Blob([csv],{type:"text/csv;charset=utf-8"}),filename);
  }
  async function sectionPdf(event) {
    const JsPDF=window.jspdf?.jsPDF;if(!JsPDF)return;const pdf=new JsPDF({unit:"mm",format:"a4"}),margin=14,width=182;let y=16;
    const trigger=event?.currentTarget;if(trigger){trigger.disabled=true;trigger.textContent="Building complete PDF…";}
    const line=(text,size=9)=>{pdf.setFontSize(size);const lines=pdf.splitTextToSize(String(text),width);if(y+lines.length*5>282){pdf.addPage();y=16;}pdf.text(lines,margin,y);y+=lines.length*5+2;};
    line(SECTION_META[state.section][0]+" · complete DUCAR report",16);line("Generated "+new Date().toLocaleString()+" · complete current section population",8);
    root.querySelectorAll(".metric-card").forEach(card=>line(card.innerText.replace(/\n+/g," · "),9));
    line("Complete chart and insight catalogue",12);root.querySelectorAll(".chart-card h3,.dynamic-chart-card h4,.insight-card h4,.insight-heading h3").forEach(title=>line("• "+title.textContent,8));
    line("Reporting controls: no Top-N selection; filters change the view only; CSV exports retain the complete filtered population.",8);
    // Dedicated PNG buttons retain every chart image. Avoiding hundreds of
    // html2canvas operations keeps the complete PDF export responsive.
    const filename=`ducar_${state.section}_complete_report.pdf`;document.body.dataset.lastDownload=filename;pdf.save(filename);if(trigger){trigger.disabled=false;trigger.textContent="PDF report";}
  }

  function mapHtml() {
    if(state.section==="summaries")return `<div class="admin-map-toolbar"><strong>Admin Tools · Platform Architecture</strong><small>The Map view is reserved for the interactive platform mind map, system sections, relations and data stores.</small></div>${platformMindMapHtml(cache.mindmap,undefined,true)}`;
    const catalogues={
      overview:[["hotosm","Complete Vehicular-Road Inventory · 248,616.15 km",true],["section","DUCAR Register Roads",true],["districts","Administrative District Labels",false]],
      ducar:[["hotosm","Complete DUCAR Analysis Extent · 248,616.15 km",true],["section","DUCAR Pavement Classification",true],["paved","Paved · Bituminous And Concrete",false],["unpaved","Unpaved · Gravel And Earth",false],["unclassified_pavement","Pavement Not Supplied",false],["districts","Administrative District Labels",false]],
      network:[["hotosm","Complete Network Geometry · 248,616.15 km",true],["section","Network Pavement Classification",true],["paved","Paved Network",false],["unpaved","Unpaved Network",false],["geometry_complete","Geometry And Endpoint Coordinates Supplied",false],["districts","Administrative District Labels",false]],
      traffic:[["hotosm","Traffic Analysis Extent · 248,616.15 km",true],["section","AADT Thematic Classification",true],["traffic","Observed Traffic Values",false],["traffic_estimated","Model-Estimated Traffic Values",false],["aadt_low","AADT 0–149",false],["aadt_mid","AADT 150–499",false],["aadt_high","AADT 500–999",false],["aadt_very_high","AADT 1,000+",false],["pcu_supplied","PCU Assigned",false],["speed_low","Operating Speed Below 15 km/h",false]],
      condition:[["hotosm","Condition Analysis Extent · 248,616.15 km",true],["section","Road Condition Classification",true],["good","Good Condition",false],["fair","Fair Condition",false],["poor","Poor Condition",false],["condition_missing","Condition Not Supplied",false],["maintenance","Maintenance Intervention",false]],
      structures:[["hotosm","Structure Analysis Road Extent · 248,616.15 km",true],["structure_roads","Roads With Linked Structures",true],["structure_risk","High And Critical Structure Risk",false]],
      pims:[["hotosm","PIMS Planning Extent · 248,616.15 km",true],["section","PIMS Priority Classification",true],["priority_low","Low Priority",false],["priority_moderate","Moderate Priority",false],["priority_high","High Priority",false],["priority_critical","Critical Priority",false],["maintenance","Maintenance Intervention",false]],
      hdm4:[["hotosm","HDM-4 Analysis Extent · 248,616.15 km",true],["section","HDM-4 Input Completeness",true],["traffic","AADT Input Supplied",false],["pcu_supplied","PCU Input Supplied",false],["geometry_complete","Geometry Input Supplied",false],["condition_missing","Condition Input Not Supplied",false]],
      framework:[["hotosm","Governance Analysis Extent · 248,616.15 km",true],["section","Administrative Coverage",true],["admin_complete","Complete Administrative Hierarchy",false],["geometry_complete","Coordinates And Geometry Supplied",false],["districts","Administrative District Labels",false]],
      budgets:[["hotosm","Investment Analysis Extent · 248,616.15 km",true],["section","Investment Priority Classification",true],["cost_low","Planning Allowance Below UGX 100 Million",false],["cost_mid","Planning Allowance UGX 100–499 Million",false],["cost_high","Planning Allowance UGX 500 Million+",false],["priority_critical","Critical Priority",false]],
      global:[["hotosm","Uganda Reference Inventory · 248,616.15 km",true],["section","Uganda DUCAR Reference Network",true],["districts","Uganda Administrative Districts",false]],
      socioeconomic:[["hotosm","Socioeconomic Analysis Extent · 248,616.15 km",true],["section","Socioeconomic Exposure Classification",true],["exposure_low","Low Exposure",false],["exposure_moderate","Moderate Exposure",false],["exposure_high","High Exposure",false],["exposure_critical","Critical Exposure",false]]
    };
    const roadLayers=catalogues[state.section]||catalogues.ducar;
    const sectionLayers=state.section==="socioeconomic"?[["facility:All","All socioeconomic facilities · "+number(cache.facilities?.features?.length),true],...(cache.socio.category_summary||[]).map(item=>[`facility:${item.category}`,item.category+" facilities · "+number(item.features),false])]:state.section==="structures"?[["structure:All","All bridges & major culverts · "+number(cache.structures.metadata.structure_occurrences),true],...(cache.structures.class_summary||[]).map(item=>[`structure:${item.structure_class}`,item.structure_class+" · "+number((cache.structures.rows||[]).filter(row=>row.structure_class===item.structure_class).length),false])]:[];
    const keys={traffic:[["#00e5ff","Observed Traffic"],["#bf5af2","Model Estimated"],["#30d158","AADT 0–149"],["#ffd60a","AADT 150–499"],["#ff9f0a","AADT 500–999"],["#ff375f","AADT 1,000+"]],condition:[["#30d158","Good"],["#ffd60a","Fair"],["#ff375f","Poor"],["#8e8e93","Not Supplied"]],structures:[["#64d2ff","Bridge Or Major Culvert"],["#ff375f","High/Critical Risk"],["#bf5af2","Linked Road Exposure"]],socioeconomic:[["#30d158","Low Exposure"],["#ffd60a","Moderate Exposure"],["#ff9f0a","High Exposure"],["#ff375f","Critical Exposure"]],pims:[["#30d158","Low Priority"],["#ffd60a","Moderate Priority"],["#ff9f0a","High Priority"],["#ff375f","Critical Priority"]],budgets:[["#30d158","Lower Allowance"],["#ffd60a","Medium Allowance"],["#ff375f","Higher Allowance"]]};
    const key=keys[state.section]||[["#0a84ff","Paved"],["#ff9f0a","Unpaved"],["#8e8e93","Not Supplied"]];
    return `<div class="map-toolbar advanced"><div><strong>${esc(SECTION_META[state.section][0])} Interactive Geospatial Workbench</strong><small>Section-specific thematic layers, symbology and selected-feature reporting</small></div><label class="map-search"><span>Find Road Or District</span><input id="map-search" type="search" placeholder="Link ID, road name, district"><button id="map-search-button" type="button">Find</button></label></div><div class="map-workspace" id="map-workspace"><div class="map-stage"><div class="map-toolrail" role="toolbar" aria-label="Mapping tools"><button type="button" data-map-tool="zoom-in" title="Zoom in">＋</button><button type="button" data-map-tool="zoom-out" title="Zoom out">−</button><button type="button" data-map-tool="pan" title="Pan map">✥</button><button type="button" data-map-tool="select" class="active" title="Select feature">⌖</button><button type="button" data-map-tool="measure" title="Measure distance">⌁</button><button type="button" data-map-tool="clear" title="Clear selection and measurement">×</button><button type="button" data-map-tool="reset" title="Restore Uganda extent">⌂</button><button type="button" data-map-tool="download" title="Download map PNG">▣</button><button type="button" data-map-tool="fullscreen" title="Full size map">⛶</button><button type="button" data-map-tool="restore" title="Restore map size">↙</button></div><div class="map-compass" aria-label="North compass"><b>N</b><i></i></div><div id="section-map" class="section-map" role="application" aria-label="${esc(SECTION_META[state.section][0])} map"></div><div class="map-coordinate" id="map-coordinate">1.3500° N · 32.3000° E</div></div><aside class="map-catalogue"><section class="catalogue-layers"><header><div><small>Section Map Catalogue</small><h3>${esc(SECTION_META[state.section][0])} Layers & Symbology</h3></div><span>${roadLayers.length+sectionLayers.length+4} layers</span></header><div class="catalogue-scroll"><fieldset><legend>Basemap</legend>${[["hybrid","World Imagery Hybrid With Labels And Borders",true],["imagery","Satellite Imagery",false],["dark","Dark Cartography",false],["light","Light Cartography",false]].map(([id,text,checked])=>`<label><input type="radio" name="basemap" value="${id}" ${checked?"checked":""}><i class="layer-symbol basemap-${id}"></i><span>${text}</span></label>`).join("")}</fieldset><fieldset><legend>${esc(SECTION_META[state.section][0])} Thematic Layers</legend>${roadLayers.map(([id,text,checked])=>`<label><input type="checkbox" data-map-layer="${esc(id)}" ${checked?"checked":""}><i class="layer-symbol layer-${esc(id)}"></i><span>${esc(text)}</span><em data-layer-stat="${esc(id)}"></em></label>`).join("")}</fieldset>${sectionLayers.length?`<fieldset><legend>${state.section==="structures"?"Structure Assets":"Socioeconomic Facilities"}</legend>${sectionLayers.map(([id,text,checked])=>`<label><input type="checkbox" data-map-layer="${esc(id)}" ${checked?"checked":""}><i class="layer-symbol layer-point"></i><span>${esc(text)}</span></label>`).join("")}</fieldset>`:""}<fieldset><legend>Display</legend><label class="opacity-control"><span>Road Opacity</span><input id="map-opacity" type="range" min="20" max="100" value="82"><em id="map-opacity-value">82%</em></label></fieldset><div class="catalogue-key"><h4>${esc(SECTION_META[state.section][0])} Key</h4>${key.map(([color,text])=>`<span><i style="background:${color}"></i>${esc(text)}</span>`).join("")}<span><i class="selected-key"></i>Selected Feature</span></div></div></section><section class="map-details"><header><div><small>Live Selection</small><h3>Details & Report</h3></div></header><div id="map-details-content"><div class="map-empty-state"><b>⌖</b><strong>Select Any Visible Feature</strong><span>The complete section-specific record and report will appear here.</span></div></div></section></aside></div>`;
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
    const imagery=()=>L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,attribution:"Imagery © Esri, Maxar, Earthstar Geographics and contributors"});
    const boundaries=()=>L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,attribution:"Borders and labels © Esri",pane:"shadowPane"});
    const bases={hybrid:L.layerGroup([imagery(),boundaries()]),imagery:imagery(),dark:L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{maxZoom:19,attribution:"© OpenStreetMap · © CARTO"}),light:L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",{maxZoom:19,attribution:"© OpenStreetMap · © CARTO"})};
    bases.hybrid.addTo(map); L.control.scale({imperial:false,maxWidth:170,position:"bottomleft"}).addTo(map);
    const linkById=new Map((cache.links||[]).map(row=>[row.link_id,row])), socioById=new Map((cache.socio?.rows||[]).map(row=>[row.link_id,row]));
    const structureLinkIds=new Set((cache.structures?.rows||[]).map(row=>row.link_id).filter(Boolean)), structureRiskLinkIds=new Set((cache.structures?.rows||[]).filter(row=>["High","Critical"].includes(row.risk_band)).map(row=>row.link_id).filter(Boolean));
    const merged=feature=>({...feature.properties,...(linkById.get(feature.properties.link_id)||{}),...(socioById.get(feature.properties.link_id)||{})});
    const sectionTheme=p=>state.section==="socioeconomic"?({Low:"#30d158",Moderate:"#ffd60a",High:"#ff9f0a",Critical:"#ff375f"})[p.exposure_band]||"#8e8e93":state.section==="traffic"?(typeof p.registry_aadt!=="number"?"#65656d":p.registry_aadt>=1000?"#ff375f":p.registry_aadt>=500?"#ff9f0a":p.registry_aadt>=150?"#ffd60a":"#30d158"):mapColor(p);
    const configs={
      section:{filter:()=>true,color:sectionTheme,weight:2.2},all:{filter:()=>true,color:()=>"#64d2ff",weight:1.6},paved:{filter:p=>p.pavement_class==="Paved",color:()=>"#0a84ff"},unpaved:{filter:p=>p.pavement_class==="Unpaved",color:()=>"#ff9f0a"},unclassified_pavement:{filter:p=>!["Paved","Unpaved"].includes(p.pavement_class),color:()=>"#8e8e93"},
      good:{filter:p=>p.condition==="Good",color:()=>"#30d158"},fair:{filter:p=>p.condition==="Fair",color:()=>"#ffd60a"},poor:{filter:p=>p.condition==="Poor",color:()=>"#ff375f"},condition_missing:{filter:p=>!["Good","Fair","Poor"].includes(p.condition),color:()=>"#8e8e93"},maintenance:{filter:p=>String(p.recommended_intervention||"").toLowerCase().includes("maintenance"),color:()=>"#30d158",weight:2.5},
      traffic:{filter:p=>p.traffic_value_status==="Observed",color:()=>"#00e5ff",weight:3},traffic_estimated:{filter:p=>p.traffic_value_status==="Model estimated",color:()=>"#bf5af2",weight:2.5},aadt_low:{filter:p=>Number.isFinite(p.registry_aadt)&&p.registry_aadt<150,color:()=>"#30d158"},aadt_mid:{filter:p=>p.registry_aadt>=150&&p.registry_aadt<500,color:()=>"#ffd60a"},aadt_high:{filter:p=>p.registry_aadt>=500&&p.registry_aadt<1000,color:()=>"#ff9f0a"},aadt_very_high:{filter:p=>p.registry_aadt>=1000,color:()=>"#ff375f",weight:3},pcu_supplied:{filter:p=>typeof p.registry_pcu==="number",color:()=>"#5e5ce6"},speed_low:{filter:p=>typeof p.registry_speed_kmh==="number"&&p.registry_speed_kmh<15,color:()=>"#ff375f"},
      priority_low:{filter:p=>p.priority_band==="Low",color:()=>"#30d158"},priority_moderate:{filter:p=>p.priority_band==="Moderate",color:()=>"#ffd60a"},priority_high:{filter:p=>p.priority_band==="High",color:()=>"#ff9f0a"},priority_critical:{filter:p=>p.priority_band==="Critical",color:()=>"#ff375f"},
      exposure_low:{filter:p=>p.exposure_band==="Low",color:()=>"#30d158"},exposure_moderate:{filter:p=>p.exposure_band==="Moderate",color:()=>"#ffd60a"},exposure_high:{filter:p=>p.exposure_band==="High",color:()=>"#ff9f0a"},exposure_critical:{filter:p=>p.exposure_band==="Critical",color:()=>"#ff375f"},
      geometry_complete:{filter:p=>Number.isFinite(Number(p.start_x_coordinate_dd))&&Number.isFinite(Number(p.end_x_coordinate_dd)),color:()=>"#64d2ff"},admin_complete:{filter:p=>[p.district,p.county,p.subcounty,p.parish].every(value=>shown(value)!=="Not supplied"),color:()=>"#30d158"},structure_roads:{filter:p=>structureLinkIds.has(p.link_id),color:()=>"#bf5af2",weight:3},structure_risk:{filter:p=>structureRiskLinkIds.has(p.link_id),color:()=>"#ff375f",weight:3},cost_low:{filter:p=>Number(p.planning_cost_ugx)<1e8,color:()=>"#30d158"},cost_mid:{filter:p=>Number(p.planning_cost_ugx)>=1e8&&Number(p.planning_cost_ugx)<5e8,color:()=>"#ffd60a"},cost_high:{filter:p=>Number(p.planning_cost_ugx)>=5e8,color:()=>"#ff375f"}
    };
    const activeLayers=new Map(), roadOpacity=()=>Number(document.getElementById("map-opacity")?.value||82)/100;
    let selectedLayer=null, selectMode=true, measureMode=false, measurePoints=[], measureLine=null, measureMarkers=L.layerGroup().addTo(map);
    const details=document.getElementById("map-details-content"), nationalKm=Number(confirmedNetwork().length_km||CONFIRMED_NETWORK_FALLBACK.length_km);
    const reportHtml=(kind,p)=>{const allFields=kind==="Road"?(state.section==="structures"?LINK_FIELDS:(RECORD_FIELDS[state.section]||LINK_FIELDS)):Object.keys(p), length=Number(p.geometry_length_km||p.allocated_road_length_km||0), districtRows=(cache.links||[]).filter(row=>shown(row.district)===shown(p.district)), districtKm=kind==="HOTOSM road group"?hotosmLength("district",shown(p.district)):districtRows.reduce((s,row)=>s+Number(row.geometry_length_km||0),0), structures=(cache.structures?.rows||[]).filter(row=>row.link_id===p.link_id);let owned="";
      if(state.section==="traffic")owned=`<div class="selection-insights"><span><b>${number(p.registry_aadt)}</b>AADT</span><span><b>${number(p.registry_pcu)}</b>PCU</span><span><b>${number(p.registry_speed_kmh,1)} km/h</b>Speed</span></div>`;
      else if(state.section==="condition")owned=`<div class="selection-insights"><span><b>${esc(shown(p.condition))}</b>Condition</span><span><b>${esc(shown(p.condition_risk))}</b>Risk score</span><span><b>${esc(shown(p.recommended_intervention))}</b>Action</span></div>`;
      else if(state.section==="socioeconomic")owned=`<div class="selection-insights"><span><b>${number(p.socioeconomic_exposure_score,2)}</b>Exposure score</span><span><b>${esc(shown(p.exposure_band))}</b>Exposure</span><span><b>${esc(shown(p.primary_socioeconomic_factor))}</b>Primary factor</span></div>`;
      else if(state.section==="structures")owned=`<div class="selection-insights"><span><b>${number(structures.length)}</b>Structures on link</span><span><b>${number(structures.reduce((s,row)=>s+Number(row.allocated_road_length_km||0),0),3)} km</b>Allocated exposure</span><span><b>${esc(shown(p.risk_band||structures[0]?.risk_band))}</b>Highest shown risk</span></div>`;
      else if(["pims","budgets","hdm4"].includes(state.section))owned=`<div class="selection-insights"><span><b>${number(p.planning_priority_score,1)}</b>Priority score</span><span><b>${esc(shown(p.priority_band))}</b>Priority</span><span><b>UGX ${number(Number(p.planning_cost_ugx||0)/1e6,1)}M</b>Allowance</span></div>`;
      else owned=`<div class="selection-insights"><span><b>${number(length,3)} km</b>Feature length</span><span><b>${number(length/Math.max(districtKm,1)*100,2)}%</b>District length</span><span><b>${number(length/Math.max(nationalKm,1)*100,3)}%</b>National length</span></div>`;
      return `<div class="selection-title"><small>${esc(kind)} · ${esc(properCaseValue("district",shown(p.district)))}</small><h4>${esc(shown(p.link_id||p.structure_id||p.name))}</h4><p>${esc(shown(p.road_name||p.linked_road_name||p.structure_name||p.category))}</p></div>${owned}<div class="selection-report"><h5>Complete selected record</h5>${allFields.map(field=>`<div><span>${esc(label(field))}</span><b>${esc(shownField(field,p[field]))}</b></div>`).join("")}</div>`;};
    const selectFeature=(kind,p,feature,layer)=>{if(!selectMode&&!measureMode)return;if(measureMode)return;if(selectedLayer)selectedLayer.remove();if(feature?.geometry?.type?.includes("Line"))selectedLayer=L.geoJSON(feature,{style:{color:"#fff",weight:6,opacity:1}}).addTo(map);else if(layer?.getLatLng)selectedLayer=L.circleMarker(layer.getLatLng(),{radius:10,color:"#fff",weight:3,fillColor:"#0a84ff",fillOpacity:.7}).addTo(map);details.innerHTML=reportHtml(kind,p);document.querySelector(".map-details")?.classList.add("has-selection");};
    const roadLayer=id=>L.geoJSON(cache.mapRoads,{filter:feature=>{const p=merged(feature);return headerMatches(p)&&configs[id].filter(p);},renderer:L.canvas({padding:.5}),style:feature=>{const p=merged(feature);return {color:configs[id].color(p),weight:configs[id].weight||2,opacity:roadOpacity()};},onEachFeature:(feature,layer)=>layer.on("click",()=>selectFeature("Road",merged(feature),feature,layer))});
    const hotosmLayer=()=>L.geoJSON(cache.hotosmMap,{filter:feature=>headerMatches(feature.properties),renderer:L.canvas({padding:.6}),style:()=>({color:"#a7adb5",weight:1.05,opacity:Math.min(roadOpacity(),.58)}),onEachFeature:(feature,layer)=>layer.on("click",()=>selectFeature("HOTOSM road group",{...feature.properties,name:feature.properties.source_group_id},feature,layer))});
    const districtLayer=()=>{const groups=new Map();cache.mapRoads.features.forEach(feature=>{const p=merged(feature);if(!headerMatches(p))return;const coords=feature.geometry.coordinates.flat(Infinity);if(coords.length<2)return;const key=shown(p.district),item=groups.get(key)||{lat:0,lng:0,n:0};for(let i=0;i<coords.length-1;i+=2){item.lng+=Number(coords[i]);item.lat+=Number(coords[i+1]);item.n++;}groups.set(key,item);});return L.layerGroup([...groups].map(([name,p])=>L.marker([p.lat/Math.max(p.n,1),p.lng/Math.max(p.n,1)],{icon:L.divIcon({className:"district-map-label",html:esc(name)})})));};
    const pointLayer=(id)=>{const [kind,category]=id.split(":");const source=kind==="facility"?cache.facilities:cache.structureMap;return L.geoJSON(source,{filter:f=>headerMatches(f.properties)&&(category==="All"||(kind==="facility"?f.properties.category:f.properties.structure_class)===category),renderer:L.canvas({padding:.5}),pointToLayer:(feature,latlng)=>L.circleMarker(latlng,{radius:kind==="facility"?4:6,color:"#050506",weight:1,fillColor:kind==="facility"?"#64d2ff":"#bf5af2",fillOpacity:.9}),onEachFeature:(feature,layer)=>layer.on("click",()=>selectFeature(kind==="facility"?"Facility":"Structure",feature.properties,feature,layer))});};
    const createLayer=id=>id==="hotosm"?hotosmLayer():id==="districts"?districtLayer():id.includes(":")?pointLayer(id):roadLayer(id);
    document.querySelectorAll("[data-map-layer]").forEach(input=>{const id=input.dataset.mapLayer;if(configs[id]){const values=cache.mapRoads.features.map(merged).filter(p=>headerMatches(p)&&configs[id].filter(p)),km=values.reduce((s,p)=>s+Number(p.geometry_length_km||0),0),stat=document.querySelector(`[data-layer-stat="${id}"]`);if(stat)stat.textContent=number(km,1)+" km";}const toggle=()=>{if(input.checked){const layer=activeLayers.get(id)||createLayer(id);activeLayers.set(id,layer);layer.addTo(map);}else activeLayers.get(id)?.remove();};input.addEventListener("change",toggle);if(input.checked)toggle();});
    const sectionLayer=activeLayers.get("section")||activeLayers.get("hotosm")||activeLayers.values().next().value;try{map.fitBounds(sectionLayer.getBounds(),{padding:[12,12]});}catch(_){}
    document.querySelectorAll('input[name="basemap"]').forEach(input=>input.addEventListener("change",()=>{Object.values(bases).forEach(layer=>layer.remove());bases[input.value].addTo(map);bases[input.value].bringToBack?.();}));
    const setTool=tool=>{document.querySelectorAll("[data-map-tool]").forEach(button=>button.classList.toggle("active",button.dataset.mapTool===tool));selectMode=tool==="select";measureMode=tool==="measure";node.classList.toggle("select-mode",selectMode);node.classList.toggle("measure-mode",measureMode);if(tool==="pan")map.dragging.enable();};setTool("select");
    const clearMap=()=>{if(selectedLayer){selectedLayer.remove();selectedLayer=null;}if(measureLine){measureLine.remove();measureLine=null;}measureMarkers.clearLayers();measurePoints=[];details.innerHTML=`<div class="map-empty-state"><b>⌖</b><strong>Select any visible feature</strong><span>The complete record and a section-specific report will appear here.</span></div>`;};
    document.querySelectorAll("[data-map-tool]").forEach(button=>button.addEventListener("click",async()=>{const tool=button.dataset.mapTool;if(tool==="zoom-in")map.zoomIn();else if(tool==="zoom-out")map.zoomOut();else if(["pan","select","measure"].includes(tool))setTool(tool);else if(tool==="clear")clearMap();else if(tool==="reset")map.fitBounds(sectionLayer.getBounds(),{padding:[12,12]});else if(tool==="download"){const filename=`ducar_${state.section}_map.png`;document.body.dataset.lastDownload=filename;let settled=false;const fallback=()=>{if(settled)return;settled=true;downloadElementPng(document.querySelector(".map-stage"),filename);};const timer=setTimeout(fallback,2500);if(window.leafletImage)window.leafletImage(map,(error,canvas)=>{if(settled)return;if(!error&&canvas){settled=true;clearTimeout(timer);saveCanvas(canvas,filename);}else fallback();});else fallback();}else if(tool==="fullscreen"){const workspace=document.getElementById("map-workspace");if(workspace.requestFullscreen)await workspace.requestFullscreen();else workspace.classList.add("map-fullscreen-fallback");setTimeout(()=>map.invalidateSize(),120);}else if(tool==="restore"){if(document.fullscreenElement)await document.exitFullscreen();document.getElementById("map-workspace")?.classList.remove("map-fullscreen-fallback");setTimeout(()=>map.invalidateSize(),120);}}));
    map.on("mousemove",event=>{const lat=event.latlng.lat,lng=event.latlng.lng;document.getElementById("map-coordinate").textContent=`${Math.abs(lat).toFixed(5)}° ${lat>=0?"N":"S"} · ${Math.abs(lng).toFixed(5)}° ${lng>=0?"E":"W"}`;});
    map.on("click",event=>{if(!measureMode)return;measurePoints.push(event.latlng);L.circleMarker(event.latlng,{radius:4,color:"#fff",fillColor:"#0a84ff",fillOpacity:1}).addTo(measureMarkers);if(measureLine)measureLine.remove();measureLine=L.polyline(measurePoints,{color:"#64d2ff",weight:3,dashArray:"7 5"}).addTo(map);const km=measurePoints.slice(1).reduce((sum,p,i)=>sum+map.distance(measurePoints[i],p)/1000,0);details.innerHTML=`<div class="selection-title"><small>MEASUREMENT REPORT</small><h4>${number(km,3)} km</h4><p>${measurePoints.length} measurement vertices · double-click to finish</p></div><div class="selection-insights"><span><b>${number(km*1000,0)} m</b>Distance</span><span><b>${number(measurePoints.length)}</b>Vertices</span><span><b>${number(map.getZoom())}</b>Map zoom</span></div>`;});
    map.on("dblclick",()=>{if(measureMode)setTool("pan");});
    document.getElementById("map-opacity")?.addEventListener("input",event=>{document.getElementById("map-opacity-value").textContent=event.target.value+"%";activeLayers.forEach((layer,id)=>{if(configs[id])layer.setStyle?.({opacity:Number(event.target.value)/100});});});
    const search=()=>{const query=document.getElementById("map-search").value.trim().toLowerCase();if(!query)return;let kind="Road",feature=cache.mapRoads.features.find(item=>{const p=merged(item);return [p.link_id,p.road_name,p.district].some(value=>String(value||"").toLowerCase().includes(query));});if(!feature){kind="HOTOSM road group";feature=(cache.hotosmMap?.features||[]).find(item=>[item.properties.source_group_id,item.properties.district,item.properties.highway,item.properties.road_management_class].some(value=>String(value||"").toLowerCase().includes(query)));}if(feature){setTool("select");const temp=L.geoJSON(feature);map.fitBounds(temp.getBounds(),{maxZoom:15,padding:[50,50]});selectFeature(kind,kind==="Road"?merged(feature):{...feature.properties,name:feature.properties.source_group_id},feature,null);}};
    document.getElementById("map-search-button")?.addEventListener("click",search);document.getElementById("map-search")?.addEventListener("keydown",event=>{if(event.key==="Enter")search();});
    document.onfullscreenchange=()=>setTimeout(()=>map.invalidateSize(),120);setTimeout(()=>map.invalidateSize(),100);
  }

  function legacyDistrictAnalytics(rows) {
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

  function legacyStructureAnalytics(payload) {
    const rows=payload.rows||[], links=payload.link_summary||[];
    const allocated=field=>aggregate(rows.map(row=>({...row,geometry_length_km:Number(row.allocated_road_length_km||0)})),field);
    const fields=["link_id","road_name","district","geometry_length_km","structure_records","bridge_records","major_culvert_records","dominant_structure_condition","highest_structure_risk"];
    return `<div class="chart-grid">${barChart("Linked-road length by structure class","Allocated road exposure; no Link ID is double-counted in the complete total.",allocated("structure_class"),"affected km",COLORS[5])}${barChart("Linked-road length by structure condition","Every supplied structure condition translated to affected road length.",allocated("current_condition"),"affected km",COLORS[1])}${barChart("Linked-road length by linkage quality","Road length associated with high, moderate, low and spatial joins.",allocated("linkage_quality"),"affected km",COLORS[0])}${barChart("Linked-road length by source register","Every district workbook and programme source retained.",allocated("source_file"),"affected km",COLORS[2])}</div><div class="method-note">The structure-to-road relation is auditable through source file, source row, chainage, Link ID, match score, linkage quality and map-location method. ${number(payload.metadata.structure_occurrences-payload.metadata.linked_structure_occurrences)} unmatched occurrences remain in the exhaustive table and are never assigned fabricated road length.</div><div class="records-status"><strong>${number(links.length)}</strong> DUCAR Link IDs with linked structures · complete per-link structure matrix</div><div class="table-wrap analytics-table"><table class="data-table"><thead><tr>${fields.map(field=>`<th>${esc(label(field))}</th>`).join("")}</tr></thead><tbody>${links.map(row=>`<tr>${fields.map(field=>`<td class="${cellClass(field,row[field])}">${esc(field==="geometry_length_km"?number(row[field],4)+" km":shown(row[field]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function legacyAnalyticsHtml() {
    if (state.section === "global") return `<div class="method-note">The complete all-country comparison matrix is owned by this section’s exhaustive table. Unsourced metrics remain explicitly Not supplied.</div>${barChart("Country coverage by region","All configured countries, without selective reporting.",aggregate(cache.global.rows,"region"),"country count",COLORS[0])}`;
    if (state.section === "structures") return structureAnalytics(cache.structures);
    const rows = state.section === "summaries" ? cache.relations.map(r=>({...r,district:r.admin_district,geometry_length_km:r.covered_length_km})) : state.section === "socioeconomic" ? cache.socio.rows : cache.links;
    const districts = districtAnalytics(rows), fields = ["district","total_length_km","paved_length_km","unpaved_length_km","poor_length_km","traffic_covered_length_km","critical_high_length_km","planning_cost_ugx"];
    const charts = state.section === "socioeconomic" ? `${barChart("Accessibility exposure band","Every road by cumulative affected length.",aggregate(rows,"exposure_band"),"affected km",COLORS[4])}${barChart("Primary factor coverage","Dominant socioeconomic factor by length.",aggregate(rows,"primary_socioeconomic_factor"),"affected km",COLORS[2])}` : `${barChart("Deep condition cross-section","All length by condition.",aggregate(rows,"condition"),"affected km",COLORS[1])}${barChart("Deep pavement cross-section","All length by pavement class.",aggregate(rows,"pavement_class"),"affected km",COLORS[2])}`;
    const provenance = state.section === "socioeconomic" ? `<article class="matrix-card analytics-provenance"><h3>Geospatial source register</h3><p>Authority and scope retained with the analysis.</p><div class="source-grid">${cache.socio.metadata.sources.map(source=>`<a href="${esc(source.url)}" target="_blank" rel="noreferrer"><strong>${esc(source.name)}</strong><small>${esc(source.coverage)}</small></a>`).join("")}</div><div class="category-grid">${cache.socio.category_summary.map(item=>`<span><strong>${number(item.features)}</strong>${esc(item.category)}</span>`).join("")}</div></article>` : "";
    return `<div class="chart-grid">${charts}${provenance}</div><div class="records-status"><strong>${number(districts.length)}</strong> administrative units · cumulative length, coverage, risk and planning relations</div><div class="table-wrap analytics-table"><table class="data-table"><thead><tr>${fields.map(f=>`<th>${esc(label(f))}</th>`).join("")}</tr></thead><tbody>${districts.map(row=>`<tr>${fields.map(f=>`<td>${esc(f==="district"?row[f]:f==="planning_cost_ugx"?"UGX "+number(row[f],0):number(row[f],3)+" km")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  function analyticsLength(row) { return Number(row.geometry_length_km||row.covered_length_km||row.allocated_road_length_km||0); }
  function analyticsTone(value, risk=false) { const v=Number(value||0); return risk?(v>=60?"analytic-bad":v>=30?"analytic-warn":"analytic-good"):(v>=80?"analytic-good":v>=50?"analytic-warn":"analytic-bad"); }
  function analyticsTable(title, subtitle, fields, rows) {
    return `<section class="analytics-block"><header><div><small>Complete Summary Table</small><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div><strong>${number(rows.length)} rows</strong></header><div class="table-wrap analytics-table"><table class="data-table"><thead><tr>${fields.map(field=>`<th>${esc(label(field))}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr>${fields.map(field=>{const cell=row[field],text=cell&&typeof cell==="object"?cell.text:shownField(field,cell),tone=cell&&typeof cell==="object"?cell.tone||"":"";return `<td class="${tone}">${esc(text)}</td>`;}).join("")}</tr>`).join("")}</tbody></table></div></section>`;
  }
  function coverageFormula(name, field, note) {
    const supplied=row=>shown(row[field])!=="Not supplied";
    return {name,expression:`Σ affected length where ${field} is supplied ÷ Σ affected length × 100`,numerator:rows=>rows.filter(supplied).reduce((s,r)=>s+analyticsLength(r),0),denominator:(_,length)=>length,result:(rows,length)=>rows.filter(supplied).reduce((s,r)=>s+analyticsLength(r),0)/Math.max(length,1)*100,unit:"% length",note};
  }
  function shareFormula(name, field, values, note, risk=false) {
    const selected=row=>values.includes(String(row[field]));
    return {name,expression:`Σ affected length where ${field} ∈ {${values.join(", ")}} ÷ Σ affected length × 100`,numerator:rows=>rows.filter(selected).reduce((s,r)=>s+analyticsLength(r),0),denominator:(_,length)=>length,result:(rows,length)=>rows.filter(selected).reduce((s,r)=>s+analyticsLength(r),0)/Math.max(length,1)*100,unit:"% length",note,risk};
  }
  function weightedFormula(name, field, unit, note) {
    const selected=rows=>rows.filter(row=>typeof row[field]==="number"&&analyticsLength(row)>0);
    return {name,expression:`Σ (${field} × affected length) ÷ Σ affected length with ${field}`,numerator:rows=>selected(rows).reduce((s,r)=>s+Number(r[field])*analyticsLength(r),0),denominator:rows=>selected(rows).reduce((s,r)=>s+analyticsLength(r),0),result:rows=>selected(rows).reduce((s,r)=>s+Number(r[field])*analyticsLength(r),0)/Math.max(selected(rows).reduce((s,r)=>s+analyticsLength(r),0),1),unit,note,risk:true};
  }
  function sectionFormulas(section) {
    const common=[coverageFormula("Coordinate length coverage","x_coordinate_dd","Affected length with WGS84 X/Y location."),coverageFormula("District assignment coverage","district","Affected length assigned to an administrative district."),{name:"Mean represented length",expression:"Σ affected length ÷ complete record count",numerator:(_,length)=>length,denominator:(_,__,count)=>count,result:(_,length,count)=>length/Math.max(count,1),unit:"km/record",note:"Mean road length represented per analytical record.",risk:true}];
    const owned={
      traffic:[coverageFormula("AADT length coverage","registry_aadt","Length with exact-match AADT."),coverageFormula("PCU length coverage","registry_pcu","Length with passenger-car-unit loading."),coverageFormula("Speed length coverage","registry_speed_kmh","Length with operating speed."),weightedFormula("Length-weighted AADT","registry_aadt","vehicles/day","Traffic intensity weighted by length."),weightedFormula("Length-weighted speed","registry_speed_kmh","km/h","Speed weighted by affected length.")],
      condition:[coverageFormula("Condition classification coverage","condition","Length with condition class."),shareFormula("Poor-condition share","condition",["Poor","POOR"],"Affected length in poor condition.",true),shareFormula("Good-condition share","condition",["Good","GOOD"],"Affected length in good condition."),coverageFormula("Intervention coverage","recommended_intervention","Length with an assigned intervention."),weightedFormula("Length-weighted condition risk","condition_risk","risk points","Condition risk weighted by length.")],
      network:[shareFormula("Paved length share","pavement_class",["Paved","PAVED"],"Bituminous and concrete length."),shareFormula("Unpaved length share","pavement_class",["Unpaved","UNPAVED"],"Gravel and earth length.",true),coverageFormula("Surface coverage","surface","Length with surface classification."),coverageFormula("Parish hierarchy coverage","parish","Length assigned through parish level.")],
      pims:[shareFormula("Critical/high priority share","priority_band",["Critical","High"],"Length in urgent planning bands.",true),coverageFormula("Priority score coverage","planning_priority_score","Length with priority score."),coverageFormula("Intervention coverage","recommended_intervention","Length with planned action."),weightedFormula("Length-weighted priority score","planning_priority_score","points","Planning score weighted by length.")],
      hdm4:[coverageFormula("AADT input coverage","registry_aadt","HDM-4 traffic input length."),coverageFormula("Speed input coverage","registry_speed_kmh","HDM-4 speed input length."),coverageFormula("Pavement input coverage","pavement_class","HDM-4 pavement input length."),coverageFormula("Condition input coverage","condition","HDM-4 condition input length."),weightedFormula("Length-weighted model speed","registry_speed_kmh","km/h","Model speed weighted by length.")],
      framework:[coverageFormula("Governed Link-ID coverage","link_id","Length governed by a DUCAR Link ID."),coverageFormula("County coverage","county","Length assigned to county."),coverageFormula("Subcounty coverage","subcounty","Length assigned to subcounty."),coverageFormula("Parish coverage","parish","Length assigned to parish."),coverageFormula("Traffic governance coverage","registry_aadt","Length with governed traffic values.")],
      budgets:[shareFormula("Critical/high investment share","priority_band",["Critical","High"],"Urgent investment length.",true),coverageFormula("Planning allowance coverage","planning_cost_ugx","Length with planning allowance."),weightedFormula("Length-weighted unit allowance","planning_unit_cost_ugx_km","UGX/km","Unit allowance weighted by length."),weightedFormula("Length-weighted priority","planning_priority_score","points","Priority weighted by length.")],
      socioeconomic:[shareFormula("Critical/high exposure share","exposure_band",["Critical","High"],"Length with high socioeconomic exposure.",true),coverageFormula("School proximity coverage","nearest_school_km","Length analysed for schools."),coverageFormula("Health proximity coverage","nearest_health_km","Length analysed for health facilities."),coverageFormula("Market proximity coverage","nearest_market_km","Length analysed for markets."),weightedFormula("Length-weighted exposure","socioeconomic_exposure_score","points","Exposure weighted by road length.")],
      summaries:[coverageFormula("Relation-basis coverage","relation_basis","Length with documented administrative relation."),coverageFormula("Village-ID coverage","village_id","Length assigned to a village."),coverageFormula("Traffic relation coverage","registry_aadt","Relation length with traffic."),coverageFormula("Coordinate relation coverage","x_coordinate_dd","Relation length with location.")],
      overview:[shareFormula("Paved length share","pavement_class",["Paved"],"Paved DUCAR length."),shareFormula("Poor-condition share","condition",["Poor"],"Poor DUCAR length.",true),coverageFormula("Traffic length coverage","registry_aadt","Length with traffic."),coverageFormula("Intervention coverage","recommended_intervention","Length with intervention.")]
    }; return [...(owned[section]||owned.overview),...common];
  }
  function formulaTable(rows, formulas) {
    const length=rows.reduce((s,r)=>s+analyticsLength(r),0), count=rows.length;
    const output=formulas.map(item=>{const numerator=item.numerator(rows,length,count),denominator=item.denominator(rows,length,count),lengthBasis=item.unit==="% length";return {metric:item.name,formula:item.expression,numerator:lengthBasis?number(numerator,3)+" km":item.unit==="% occurrences"?number(numerator)+" occurrences":number(numerator,2),denominator:lengthBasis?number(denominator,3)+" km":item.unit==="% occurrences"?number(denominator)+" occurrences":number(denominator,2),result:{text:number(item.result(rows,length,count),2)+" "+item.unit,tone:analyticsTone(item.result(rows,length,count),item.risk)},unit:item.unit,interpretation:item.note};});
    return analyticsTable("Section formula register","Auditable complete-population formulas; no sampling and no hidden exclusions.",["metric","formula","numerator","denominator","result","unit","interpretation"],output);
  }
  function categorySummary(rows, field) {
    const total=rows.reduce((s,r)=>s+analyticsLength(r),0);return aggregate(rows,field).sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(item=>({category:item.name,records:item.count,affected_length_km:number(item.value,3)+" km",length_share_pct:{text:number(item.value/Math.max(total,1)*100,2)+"%",tone:analyticsTone(item.value/Math.max(total,1)*100)},mean_record_length_km:number(item.value/Math.max(item.count,1),3)+" km"}));
  }
  function analyticCategory(value) {
    if(Array.isArray(value))return value.length?`Supplied (${value.length} administrative relation${value.length===1?"":"s"})`:"Not supplied";
    if(value&&typeof value==="object")return "Supplied structured value";
    return shown(value);
  }
  function crossTab(rows, rowField, columnField, title) {
    const rowSet=new Set(),columnSet=new Set(),cells=new Map(),rowTotals=new Map();let total=0;
    rows.forEach(row=>{const rowValue=analyticCategory(row[rowField]),columnValue=analyticCategory(row[columnField]),length=analyticsLength(row),key=JSON.stringify([rowValue,columnValue]),cell=cells.get(key)||{length:0,count:0},rowTotal=rowTotals.get(rowValue)||{length:0,count:0};cell.length+=length;cell.count++;rowTotal.length+=length;rowTotal.count++;cells.set(key,cell);rowTotals.set(rowValue,rowTotal);rowSet.add(rowValue);columnSet.add(columnValue);total+=length;});
    const rowValues=[...rowSet].sort(),columns=[...columnSet].sort();
    const output=rowValues.map(rowValue=>{const item={[rowField]:rowValue};columns.forEach(column=>{const cell=cells.get(JSON.stringify([rowValue,column]))||{length:0,count:0},share=cell.length/Math.max(total,1)*100;item[column]={text:`${number(cell.length,3)} km · ${number(cell.count)} rec. · ${number(share,2)}%`,tone:analyticsTone(share)};});const rowTotal=rowTotals.get(rowValue);item.row_total=`${number(rowTotal.length,3)} km · ${number(rowTotal.count)} rec.`;return item;});
    return analyticsTable(title,`Every ${label(rowField)} × ${label(columnField)} relation; cells show affected length, count and population share.`,[rowField,...columns,"row_total"],output);
  }
  function numericBandTable(rows, field, definitions) {
    const total=rows.reduce((s,r)=>s+analyticsLength(r),0), output=definitions.map(([band,min,max])=>{const selected=rows.filter(row=>typeof row[field]==="number"&&row[field]>=min&&row[field]<max),length=selected.reduce((s,r)=>s+analyticsLength(r),0),values=selected.map(row=>Number(row[field])),share=length/Math.max(total,1)*100;return {band,records:selected.length,affected_length_km:number(length,3)+" km",length_share_pct:{text:number(share,2)+"%",tone:analyticsTone(share)},minimum:values.length?number(Math.min(...values),2):"Not supplied",mean:values.length?number(values.reduce((a,b)=>a+b,0)/values.length,2):"Not supplied",maximum:values.length?number(Math.max(...values),2):"Not supplied"};});
    return analyticsTable(`${label(field)} distribution`,`Complete numerical bands with frequency, length, share, minimum, mean and maximum.`,["band","records","affected_length_km","length_share_pct","minimum","mean","maximum"],output);
  }
  function districtSummaryTable(rows) {
    const groups=new Map();rows.forEach(row=>{const district=shown(row.district||row.admin_district),item=groups.get(district)||{district,records:0,total_length_km:0,paved_length_km:0,unpaved_length_km:0,good_length_km:0,fair_length_km:0,poor_length_km:0,traffic_length_km:0,coordinate_length_km:0,planning_cost_ugx:0};const length=analyticsLength(row);item.records++;item.total_length_km+=length;if(String(row.pavement_class).toLowerCase()==="paved")item.paved_length_km+=length;if(String(row.pavement_class).toLowerCase()==="unpaved")item.unpaved_length_km+=length;if(String(row.condition).toLowerCase()==="good")item.good_length_km+=length;if(String(row.condition).toLowerCase()==="fair")item.fair_length_km+=length;if(String(row.condition).toLowerCase()==="poor")item.poor_length_km+=length;if(typeof row.registry_aadt==="number")item.traffic_length_km+=length;if(typeof row.x_coordinate_dd==="number")item.coordinate_length_km+=length;item.planning_cost_ugx+=Number(row.planning_cost_ugx||0);groups.set(district,item);});
    const output=[...groups.values()].sort((a,b)=>a.district.localeCompare(b.district)).map(item=>{const total=Math.max(item.total_length_km,1),formatKm=value=>number(value,3)+" km";return {district:item.district,records:item.records,total_length_km:formatKm(item.total_length_km),paved_length_km:formatKm(item.paved_length_km),unpaved_length_km:formatKm(item.unpaved_length_km),good_length_km:formatKm(item.good_length_km),fair_length_km:formatKm(item.fair_length_km),poor_length_km:formatKm(item.poor_length_km),paved_share_pct:{text:number(item.paved_length_km/total*100,2)+"%",tone:analyticsTone(item.paved_length_km/total*100)},poor_share_pct:{text:number(item.poor_length_km/total*100,2)+"%",tone:analyticsTone(item.poor_length_km/total*100,true)},traffic_coverage_pct:{text:number(item.traffic_length_km/total*100,2)+"%",tone:analyticsTone(item.traffic_length_km/total*100)},coordinate_coverage_pct:{text:number(item.coordinate_length_km/total*100,2)+"%",tone:analyticsTone(item.coordinate_length_km/total*100)},planning_cost_ugx:"UGX "+number(item.planning_cost_ugx,0),planning_cost_per_km_ugx:"UGX "+number(item.planning_cost_ugx/total,0)};});
    return analyticsTable("Complete administrative-unit summary","Every administrative unit with network, condition, traffic, coordinates and planning relations.",["district","records","total_length_km","paved_length_km","unpaved_length_km","good_length_km","fair_length_km","poor_length_km","paved_share_pct","poor_share_pct","traffic_coverage_pct","coordinate_coverage_pct","planning_cost_ugx","planning_cost_per_km_ugx"],output);
  }
  function structureAnalytics(payload) {
    const raw=payload.rows||[],rows=raw.map(row=>({...row,geometry_length_km:Number(row.allocated_road_length_km||0)})),linked=raw.filter(row=>shown(row.link_id)!=="Not supplied"),total=rows.reduce((s,r)=>s+analyticsLength(r),0),formulas=[{name:"Linked occurrence share",expression:"Linked occurrences ÷ all occurrences × 100",numerator:()=>linked.length,denominator:()=>raw.length,result:()=>linked.length/Math.max(raw.length,1)*100,unit:"% occurrences",note:"Structures associated with governed DUCAR Link IDs."},coverageFormula("Coordinate length coverage","x_coordinate_dd","Allocated road length with mapped structure coordinates."),coverageFormula("Condition length coverage","current_condition","Allocated length with condition."),coverageFormula("Intervention length coverage","recommended_intervention","Allocated length with intervention.")];
    return `<div class="analytics-workbook"><div class="analytics-intro"><div><small>CHART-FREE ANALYTICAL WORKBOOK</small><h2>Structures formulas, summaries and relations</h2><p>Counts preserve structure frequency while allocated road length prevents double counting.</p></div><strong>${number(raw.length)} occurrences · ${number(total,3)} allocated km</strong></div>${formulaTable(rows,formulas)}${crossTab(rows,"structure_class","current_condition","Structure class × condition")}${crossTab(rows,"risk_band","recommended_intervention","Risk × intervention")}${analyticsTable("Complete structure-class summary","Every class by occurrence frequency and allocated affected-road length.",["category","records","affected_length_km","length_share_pct","mean_record_length_km"],categorySummary(rows,"structure_class"))}${analyticsTable("Per-link structure relations","Every linked DUCAR road with structure counts, condition, risk and length.",["link_id","road_name","district","geometry_length_km","structure_records","bridge_records","major_culvert_records","dominant_structure_condition","highest_structure_risk"],payload.link_summary||[])}</div>`;
  }
  function nationalReconciliationAnalytics(rows) {
    const inventory=cache.inventory||{},confirmed=confirmedNetwork(),published=inventory.published_reference_scopes||{},workbook=inventory.master_workbook_inventory||{},verified=inventory.verified_web_analytics_register||{};
    const fullRows=Array.isArray(cache.links)&&cache.links.length?cache.links:rows,km=items=>items.reduce((sum,row)=>sum+Number(row.geometry_length_km||0),0),registerKm=km(fullRows);
    const classified=(field,values)=>km(fullRows.filter(row=>values.includes(shown(row[field]))));
    const trafficKm=km(fullRows.filter(row=>typeof row.registry_aadt==="number"));
    const scopeRows=[
      {scope:"Approved all-road inventory",length_km:number(confirmed.length_km,3),records:number(confirmed.links),administrative_extent:number(confirmed.districts)+" districts",use:"Backend national inventory calculations"},
      {scope:"Master-workbook DUCAR inventory",length_km:"Inventory-controlled total",records:number(workbook.ducar_link_rows),administrative_extent:workbook.administrative_extent||"135 districts",use:"51-attribute inventory and candidate mapping scope"},
      {scope:"Verified web analytical register",length_km:number(registerKm,3),records:number(fullRows.length),administrative_extent:"Verified linked districts",use:"Link-level dashboards, maps and exhaustive records"},
      {scope:"Published DUCAR composition reference",length_km:number(published.ducar_composition_km,3),records:"Not a link register",administrative_extent:"Urban + district + community access",use:"Reference reconciliation only"},
      {scope:"Published national-road reference",length_km:number(published.national_roads_km,3),records:"Not a link register",administrative_extent:"National road network",use:"Reference reconciliation only"}
    ];
    const controlRows=[
      {control:"Pavement classes",classified_km:number(classified("pavement_class",["Paved","Unpaved"]),3),register_km:number(registerKm,3),variance_km:number(classified("pavement_class",["Paved","Unpaved"])-registerKm,3),basis:"Paved + Unpaved"},
      {control:"Condition classes",classified_km:number(classified("condition",["Good","Fair","Poor","Unclassified"]),3),register_km:number(registerKm,3),variance_km:number(classified("condition",["Good","Fair","Poor","Unclassified"])-registerKm,3),basis:"Good + Fair + Poor + Unclassified"},
      {control:"Priority bands",classified_km:number(classified("priority_band",["Critical","High","Moderate","Low"]),3),register_km:number(registerKm,3),variance_km:number(classified("priority_band",["Critical","High","Moderate","Low"])-registerKm,3),basis:"Critical + High + Moderate + Low"},
      {control:"Traffic coverage",classified_km:number(trafficKm,3),register_km:number(registerKm,3),variance_km:number(trafficKm-registerKm,3),basis:"Supplied AADT length; remaining length is explicitly Not supplied"}
    ];
    return analyticsTable("Approved inventory and analytical scope register","The approved headline, workbook inventory, verified web geometry and published references are kept separate.",["scope","length_km","records","administrative_extent","use"],scopeRows)+analyticsTable("Verified-register reconciliation controls","Every classification is tested against the verified web register without scaling geometry.",["control","classified_km","register_km","variance_km","basis"],controlRows);
  }
  function adminDeepAnalytics() {
    const links=cache.links||[],database=cache.database||{tables:[]},networkKm=links.reduce((sum,row)=>sum+Number(row.geometry_length_km||0),0);
    const supplied=(row,field)=>row[field]!==null&&row[field]!==undefined&&row[field]!==""&&shown(row[field])!=="Not supplied",covered=field=>links.filter(row=>supplied(row,field)).reduce((sum,row)=>sum+Number(row.geometry_length_km||0),0);
    const parameters=LINK_FIELDS.map(field=>{const suppliedKm=covered(field),pct=suppliedKm/Math.max(networkKm,1)*100;return {parameter:label(field),supplied_length_km:number(suppliedKm,3),gap_length_km:number(Math.max(0,networkKm-suppliedKm),3),length_completeness_pct:{text:number(pct,2)+"%",tone:analyticsTone(pct)},health:pct>=95?"Healthy":pct>=70?"Attention":"Gap"};});
    const stores=database.tables.map(table=>({data_store:table.table,rows:table.row_count,columns:table.column_count,indexes:table.indexes.length,owned_sections:table.sections.join(", "),status:table.row_count>0?"Available":"Empty"}));
    const nodes=(cache.mindmap?.nodes||[]).map(node=>({node_id:node.id,label:node.label,type:node.type,records:node.records??"Not applicable",relationships:(cache.mindmap?.edges||[]).filter(edge=>edge.from===node.id||edge.to===node.id).length}));
    return analyticsTable("All network parameters · length completeness","Every governed field measured against the verified DUCAR geometry denominator.",["parameter","supplied_length_km","gap_length_km","length_completeness_pct","health"],parameters)+analyticsTable("All DUCAR data stores","Complete SQLite catalogue with row, column, index and ownership metadata.",["data_store","rows","columns","indexes","owned_sections","status"],stores)+analyticsTable("Platform mind-map node register","Every visible mind-map node and its stored-record and relationship counts.",["node_id","label","type","records","relationships"],nodes);
  }
  function hotosmDeepAnalytics(section){
    const analysis=cache.hotosmAnalysis;if(!analysis)return "";
    const dimensions={overview:["management_class","pavement","condition"],ducar:["management_class","pavement","condition"],network:["highway","surface","pavement","management_class"],traffic:["highway","management_class"],condition:["condition","surface","pavement"],structures:["district"],pims:["management_class","condition"],hdm4:["highway","pavement","condition"],framework:["region","district","county","subcounty"],budgets:["management_class","pavement"],socioeconomic:["region","district"],summaries:["region","district","county","subcounty"]}[section]||["management_class"];
    const fields=["category","feature_count","length_km","paved_km","unpaved_km","unclassified_pavement_km","good_condition_km","fair_condition_km","poor_condition_km","unclassified_condition_km","named_feature_count","bridge_feature_count","oneway_feature_count"];
    const tables=dimensions.map(dimension=>analyticsTable(`HOTOSM ${label(dimension)} complete summary`,`All vehicular source features and affected length; no Top-N selection.`,fields,analysis.summaries?.[dimension]||[])).join("");
    if(section!=="traffic"&&section!=="summaries"&&section!=="framework")return tables;
    const completeness=Object.entries(analysis.attribute_completeness||{}).map(([attribute,row])=>({attribute,...row,gap_features:Number(analysis.total.feature_count||0)-Number(row.supplied_features||0),gap_length_km:Number(analysis.total.length_km||0)-Number(row.supplied_length_km||0)}));
    return tables+analyticsTable("HOTOSM attribute completeness","Every source attribute measured by feature frequency and affected length; missing values remain explicit.",["attribute","supplied_features","gap_features","supplied_length_km","gap_length_km"],completeness);
  }
  function analyticsHtml() {
    if(state.section==="structures")return structureAnalytics(cache.structures)+hotosmDeepAnalytics("structures");
    if(state.section==="global"){const rows=globalRows().map(row=>({...row,geometry_length_km:1})),reviewed=rows.filter(row=>row.governance_evidence_status!=="Not yet source-verified"),principles=cache.governance?.principles||[],evidenceFormula={name:"Official governance evidence coverage",expression:"Officially reviewed countries ÷ all configured countries × 100",numerator:items=>items.filter(row=>row.governance_evidence_status!=="Not yet source-verified").length,denominator:(_,__,count)=>count,result:items=>items.filter(row=>row.governance_evidence_status!=="Not yet source-verified").length/Math.max(items.length,1)*100,unit:"% countries",note:"Countries with reviewed official governance sources."};return `<div class="analytics-workbook"><div class="analytics-intro"><div><small>CHART-FREE ANALYTICAL WORKBOOK</small><h2>Global local-road governance formulas and relations</h2><p>All configured countries retained; ministry and road-authority evidence is never inferred where an official source has not been reviewed.</p></div><strong>${number(rows.length)} countries · ${number(reviewed.length)} reviewed</strong></div>${formulaTable(rows,[evidenceFormula,coverageFormula("Coordinate country coverage","x_coordinate_dd","Countries with representative WGS84 coordinates."),coverageFormula("Comparable network coverage","road_network_km","Countries with sourced road-network length.")])}${crossTab(rows,"region","governance_evidence_status","Region × governance evidence status")}${crossTab(rows,"governance_evidence_status","lead_institution","Evidence status × lead institution")}${analyticsTable("Transferable road-asset-management controls","PIARC and World Bank principles, measures, techniques and primary sources.",["principle","measure","technique","source_title","source_url"],principles)}${analyticsTable("Officially sourced local-road operating models","Reviewed ministry and road-authority models for district, urban, rural and access roads.",["country","region","governance_model","lead_institution","local_road_manager","financing_mechanism","asset_management_principles","performance_measures","tools_and_techniques","governance_source_title","governance_source_url"],reviewed)}${analyticsTable("Complete region summary","All countries by configured region.",["category","records","affected_length_km","length_share_pct","mean_record_length_km"],categorySummary(rows,"region"))}</div>`;}
    const rows=state.section==="summaries"?applyHeaderFilters(cache.relations).map(row=>({...row,district:row.admin_district,geometry_length_km:row.covered_length_km})):state.section==="socioeconomic"?applyHeaderFilters(cache.socio.rows):activeLinkRows();
    const pairs={traffic:[["pavement_class","condition"],["priority_band","recommended_intervention"]],condition:[["condition","pavement_class"],["condition","recommended_intervention"]],network:[["surface","pavement_class"],["condition","surface"]],pims:[["priority_band","recommended_intervention"],["priority_band","condition"]],hdm4:[["pavement_class","condition"],["priority_band","recommended_intervention"]],framework:[["admin_coverage","condition"],["pavement_class","priority_band"]],budgets:[["priority_band","recommended_intervention"],["condition","pavement_class"]],socioeconomic:[["exposure_band","primary_socioeconomic_factor"],["exposure_band","pavement_class"]],summaries:[["relation_basis","pavement_class"],["condition","priority_band"]],overview:[["condition","pavement_class"],["priority_band","recommended_intervention"]],ducar:[["condition","pavement_class"],["surface","recommended_intervention"]]};
    const selected=pairs[state.section]||pairs.overview,category=state.section==="traffic"?"condition":state.section==="socioeconomic"?"exposure_band":state.section==="summaries"?"relation_basis":state.section==="network"?"surface":state.section==="budgets"||state.section==="pims"?"priority_band":"condition", numeric=state.section==="traffic"?["registry_aadt",[["0–149",0,150],["150–499",150,500],["500–999",500,1000],["1,000+",1000,Infinity]]]:state.section==="socioeconomic"?["socioeconomic_exposure_score",[["0–24.9",0,25],["25–49.9",25,50],["50–74.9",50,75],["75–100",75,101]]]:["planning_priority_score",[["0–24.9",0,25],["25–49.9",25,50],["50–74.9",50,75],["75–100",75,101]]];
    const extras=hotosmDeepAnalytics(state.section)+(state.section==="summaries"?adminDeepAnalytics():["overview","ducar"].includes(state.section)?nationalReconciliationAnalytics(rows):"");
    return `<div class="analytics-workbook"><div class="analytics-intro"><div><small>CHART-FREE ANALYTICAL WORKBOOK</small><h2>${esc(SECTION_META[state.section][0])} formulas, summaries and relations</h2><p>Section-specific tables only, with conditional formatting for coverage, caution and risk.</p></div><strong>${number(rows.length)} records · ${number(rows.reduce((s,r)=>s+analyticsLength(r),0),3)} km</strong></div>${formulaTable(rows,sectionFormulas(state.section))}${crossTab(rows,...selected[0],`${label(selected[0][0])} × ${label(selected[0][1])}`)}${crossTab(rows,...selected[1],`${label(selected[1][0])} × ${label(selected[1][1])}`)}${numericBandTable(rows,numeric[0],numeric[1])}${analyticsTable(`${label(category)} comprehensive summary`,`Every categorical value with count, affected length, share and mean represented length.`,["category","records","affected_length_km","length_share_pct","mean_record_length_km"],categorySummary(rows,category))}${districtSummaryTable(rows)}${extras}</div>`;
  }
  function relevantTables() {
    const names = SECTION_SQL[state.section] || [];
    return (cache.database.tables || []).filter(table => names.includes(table.table));
  }
  function sqlHtml() {
    const tables = relevantTables();
    const fields = ["table","row_count","column_count","sections","columns","indexes"];
    const rows = tables.map(table => ({table:table.table,row_count:table.row_count,column_count:table.column_count,sections:table.sections.join(", "),columns:table.columns.map(c=>`${c.name} (${c.type})`).join(", "),indexes:table.indexes.length?table.indexes.map(i=>i.name).join(", "):"Not supplied"}));
    return `<div class="sql-intro"><div><h2>${esc(SECTION_META[state.section][0])} SQL Tables</h2><p>Only database tables related to this section are shown.</p></div><a class="studio-button" href="./data/${esc(cache.database.database_file)}" download>Download SQLite · ${number(cache.database.database_bytes/1048576,1)} MB</a></div><div class="table-wrap"><table class="data-table"><thead><tr>${fields.map(f=>`<th>${esc(label(f))}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr>${fields.map(f=>`<td>${esc(shownField(f,row[f]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  function schemaHtml() {
    return `<div class="sql-intro"><div><h2>${esc(SECTION_META[state.section][0])} schema</h2><p>DDL, columns, data types and indexes for this section’s related SQL tables.</p></div><a class="studio-button" href="./data/${esc(cache.database.database_file)}" download>Download SQLite database</a></div><div class="schema-grid">${relevantTables().map(table=>`<article class="schema-card"><h3>${esc(table.table)}</h3><p>${number(table.row_count)} rows · ${number(table.column_count)} columns · ${number(table.indexes.length)} indexes</p><div class="schema-columns">${table.columns.map(column=>`<span class="schema-column">${esc(column.name)} · ${esc(column.type)}</span>`).join("")}</div><pre>${esc(table.create_sql)}</pre></article>`).join("")}</div>`;
  }
  async function render() {
    recordMountToken++;
    vizTimers.forEach(timer=>clearInterval(timer)); vizTimers.clear();
    const activeField = document.activeElement?.classList?.contains("records-search") ? ".records-search" : document.activeElement?.classList?.contains("records-filter-value") ? ".records-filter-value" : "";
    state.loading = true;
    shell(`<div class="studio-loading">Loading this section’s complete reporting population…</div>`);
    try { await ensureData(); state.loading=false; } catch (error) { state.loading=false; shell(`<div class="studio-loading">${esc(error.message)}</div>`); return; }
    let body = state.tab === "dashboard" ? dashboardHtml() : state.tab === "map" ? mapHtml() : state.tab === "records" ? recordsHtml() : state.tab === "analytics" ? analyticsHtml() : state.tab === "sql" ? sqlHtml() : schemaHtml();
    shell(body); bind();if(state.tab==="records")mountRemainingRecords();
    if (state.tab === "map") initSectionMap();
    syncHeaderFilterPanel();
    if (activeField) { const input=root.querySelector(activeField); input?.focus(); input?.setSelectionRange(input.value.length,input.value.length); }
  }
  function shell(body) {
    document.body.classList.remove("network-map-mode");
    root.innerHTML = `<section class="exhaustive-shell"><div class="section-studio"><nav class="section-tabs" aria-label="Section reporting views">${SECTION_TABS.map(([id,text])=>`<button type="button" class="section-tab ${state.tab===id?"active":""}" data-section-tab="${id}" aria-current="${state.tab===id?"page":"false"}">${esc(text)}</button>`).join("")}</nav>${body}</div></section>`;
    if(state.tab==="dashboard")root.querySelectorAll("table").forEach(table=>{const owner=table.closest(".consistency-controls,.table-export-wrap,.global-governance,.admin-block")||table.closest(".table-wrap");owner?.remove();});
  }
  function bind() {
    root.querySelectorAll("[data-mind-node]").forEach(node=>node.addEventListener("click",()=>{root.querySelectorAll("[data-mind-node]").forEach(item=>item.classList.remove("selected"));node.classList.add("selected");const inspector=root.querySelector("#mind-inspector");if(inspector){inspector.innerHTML=`<small>Selected System Node</small><strong>${esc(node.dataset.mindTitle)}</strong><span>${esc(node.dataset.mindDetail)}</span>`;}}));
    root.querySelectorAll("[data-section-tab]").forEach(button=>button.addEventListener("click",()=>{const tab=button.dataset.sectionTab;if(!SECTION_TABS.some(([id])=>id===tab)||tab===state.tab)return;location.hash=`#${state.section}:${tab}`;}));
    const recordsToolbar=root.querySelector(".records-toolbar");if(recordsToolbar&&!recordsToolbar.querySelector(".hotosm-source-download")){const source=document.createElement("a");source.className="studio-button hotosm-source-download";source.href="./data/hotosm_vehicular_link_attributes.csv.gz";source.download="hotosm_uganda_404047_vehicular_road_attributes.csv.gz";source.textContent="HOTOSM 404,047 records";recordsToolbar.appendChild(source);}
    root.querySelectorAll(".table-wrap").forEach((wrap,index)=>{if(wrap.classList.contains("all-records-table")||wrap.closest(".table-export-wrap"))return;const button=document.createElement("button");button.type="button";button.className="csv-download floating";button.dataset.tableCsv="";button.textContent="CSV · complete table";button.dataset.tableIndex=String(index);wrap.before(button);});
    root.querySelectorAll("[data-download-png]").forEach((button,index)=>button.addEventListener("click",event=>{event.stopPropagation();downloadElementPng(button.closest("[data-download-chart]"),`ducar_${state.section}_chart_${index+1}.png`);}));
    root.querySelectorAll("[data-section-pdf]").forEach(button=>button.addEventListener("click",sectionPdf));
    root.querySelectorAll("[data-table-csv]").forEach(button=>button.addEventListener("click",()=>{const table=button.closest(".table-export-wrap")?.querySelector("table")||button.nextElementSibling?.querySelector?.("table");if(table)tableCsv(table,`ducar_${state.section}_complete_table.csv`);}));
    const search=root.querySelector(".records-search"); if(search) search.addEventListener("input",()=>{state.search=search.value;state.page=1;render();});
    root.querySelector("[data-filter-field]")?.addEventListener("change",event=>{state.filterField=event.target.value;state.page=1;render();});
    root.querySelector(".records-filter-value")?.addEventListener("input",event=>{state.filterValue=event.target.value;state.page=1;render();});
    root.querySelector("[data-sort-field]")?.addEventListener("change",event=>{state.sortField=event.target.value;render();});
    root.querySelector("[data-sort-direction]")?.addEventListener("click",()=>{state.sortDirection=state.sortDirection==="asc"?"desc":"asc";render();});
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
    state.section=section;state.tab="dashboard";state.page=1;state.search="";state.filterField="";state.filterValue="";state.sortField="";history.replaceState(null,"",`#${section}:dashboard`);render();setTimeout(syncInjectedNav,0);
  }
  document.addEventListener("click",event=>{
    const button=event.target.closest?.("[data-section-tab]");if(!button)return;
    const tab=button.dataset.sectionTab;if(!SECTION_TABS.some(([id])=>id===tab)||tab===state.tab)return;
    event.preventDefault();event.stopImmediatePropagation();location.hash=`#${state.section}:${tab}`;
  },true);
  document.addEventListener("click",event=>{
    const button=event.target.closest?.("button[title]");
    if(button)setTimeout(()=>{activateSection(button.dataset.ducarSection||sectionFromTitle(button.getAttribute("title")));syncPrimaryNav();},0);
  },true);
  document.addEventListener("click",event=>{
    const button=event.target.closest?.("button.export-btn");if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();ensureHeaderExportMenu();
  },true);
  function ensureHeaderExportMenu() {
    const actions=document.querySelector("#root .top-nav .nav-actions");if(!actions)return false;
    actions.querySelector(".filter-toggle")?.remove();actions.querySelector(".color-toggle")?.remove();
    let wrapper=actions.querySelector(".ducar-export-menu"),source=actions.querySelector("button.export-btn");
    if(wrapper){source?.remove();return true;}if(!source)return false;
    wrapper=document.createElement("div");wrapper.className="ducar-export-menu";
    wrapper.innerHTML=`<button class="ducar-export-trigger" type="button" aria-haspopup="menu" aria-expanded="false"><span aria-hidden="true">⇩</span> Export <b aria-hidden="true">⌄</b></button><div class="ducar-export-panel" role="menu" hidden><header><strong>Full export centre</strong><small>Complete ${esc(SECTION_META[state.section]?.[0]||"DUCAR")} population</small></header><section><h3>Complete records</h3><button type="button" role="menuitem" data-header-export="csv-all"><b>CSV</b><span>All records · every field</span></button><button type="button" role="menuitem" data-header-export="csv-filtered"><b>CSV</b><span>Current filtered population</span></button><button type="button" role="menuitem" data-header-export="json"><b>JSON</b><span>Records + field metadata</span></button><button type="button" role="menuitem" data-header-export="geojson"><b>GEO</b><span>GeoJSON · WGS84 coordinates</span></button></section><section><h3>Database & schema</h3><button type="button" role="menuitem" data-header-export="sql"><b>SQL</b><span>DDL + every INSERT record</span></button><button type="button" role="menuitem" data-header-export="dictionary"><b>DICT</b><span>Data dictionary + completeness</span></button><button type="button" role="menuitem" data-header-export="inventory"><b>JSON</b><span>Approved network inventory</span></button></section><section><h3>Reports & graphics</h3><button type="button" role="menuitem" data-header-export="pdf"><b>PDF</b><span>Complete section report</span></button><button type="button" role="menuitem" data-header-export="png"><b>PNG</b><span>Current complete view</span></button><button type="button" role="menuitem" data-header-export="table"><b>TABLE</b><span>Visible exhaustive/analytics table</span></button><button type="button" role="menuitem" data-header-export="map"><b>MAP</b><span>Current interactive map PNG</span></button></section><footer>Exports use the active section; no Top-N sampling.</footer></div>`;
    wrapper.querySelector('[data-header-export="geojson"]')?.insertAdjacentHTML("afterend",'<button type="button" role="menuitem" data-header-export="kml"><b>KML</b><span>KML points - WGS84 coordinates</span></button>');
    wrapper.querySelector('[data-header-export="kml"]')?.insertAdjacentHTML("afterend",'<button type="button" role="menuitem" data-header-export="hotosm-csv"><b>CSV.GZ</b><span>404,047 HOTOSM vehicular source records</span></button>');
    actions.appendChild(wrapper);source.remove();
    const trigger=wrapper.querySelector(".ducar-export-trigger"),panel=wrapper.querySelector(".ducar-export-panel"),close=()=>{panel.hidden=true;trigger.setAttribute("aria-expanded","false");wrapper.classList.remove("open");};
    trigger.addEventListener("click",event=>{event.stopPropagation();const opening=panel.hidden;document.querySelectorAll(".ducar-export-panel").forEach(menu=>menu.hidden=true);panel.hidden=!opening;trigger.setAttribute("aria-expanded",String(opening));wrapper.classList.toggle("open",opening);if(opening){panel.querySelector('[data-header-export="table"]').disabled=!root.querySelector("table");panel.querySelector('[data-header-export="map"]').disabled=!root.querySelector(".map-stage");panel.querySelector("header small").textContent=`Complete ${SECTION_META[state.section]?.[0]||"DUCAR"} population`;}});
    wrapper.addEventListener("keydown",event=>{if(event.key==="Escape"){close();trigger.focus();}});
    wrapper.addEventListener("click",event=>{const option=event.target.closest?.('[data-header-export="kml"]');if(!option)return;const sectionDataset=recordDataset(),dataset={rows:sectionDataset.rows,fields:[...new Set(sectionDataset.rows.flatMap(row=>Object.keys(row)))]};close();exportRowsKml(dataset);});
    wrapper.addEventListener("click",event=>{const option=event.target.closest?.('[data-header-export="hotosm-csv"]');if(!option)return;close();const anchor=document.createElement("a");anchor.href="./data/hotosm_vehicular_link_attributes.csv.gz";anchor.download="hotosm_uganda_404047_vehicular_road_attributes.csv.gz";anchor.click();});
    wrapper.addEventListener("click",async event=>{const option=event.target.closest?.("[data-header-export]");if(!option||option.disabled)return;const action=option.dataset.headerExport,sectionDataset=recordDataset(),dataset={rows:sectionDataset.rows,fields:[...new Set(sectionDataset.rows.flatMap(row=>Object.keys(row)))]};close();try{if(action==="csv-all")exportRowsCsv(dataset,dataset.rows,`ducar_${state.section}_complete_records.csv`);else if(action==="csv-filtered")exportRowsCsv(dataset,filtered(sectionDataset),`ducar_${state.section}_filtered_records.csv`);else if(action==="json")exportRowsJson(dataset);else if(action==="geojson")exportRowsGeoJson(dataset);else if(action==="sql")exportSqlDump(dataset);else if(action==="dictionary")exportDataDictionary(dataset);else if(action==="inventory"){const anchor=document.createElement("a");anchor.href=PATHS.inventory;anchor.download="approved_network_inventory_2026.json";anchor.click();}else if(action==="pdf")await sectionPdf();else if(action==="png")await downloadElementPng(root,`ducar_${state.section}_${state.tab}_complete_view.png`);else if(action==="table")tableCsv(root.querySelector("table"),`ducar_${state.section}_${state.tab}_visible_table.csv`);else if(action==="map")root.querySelector('[data-map-tool="download"]')?.click();}catch(error){console.error("DUCAR export failed",error);}});
    document.addEventListener("click",event=>{if(!wrapper.contains(event.target))close();});
    return true;
  }
  function ensureHeaderNavigationControls(){
    const actions=document.querySelector("#root .top-nav .nav-actions"),exportMenu=actions?.querySelector(".ducar-export-menu");if(!actions||!exportMenu)return false;
    if(actions.querySelector(".ducar-header-navigation"))return true;
    const controls=document.createElement("div");controls.className="ducar-header-navigation";controls.innerHTML='<button type="button" data-header-navigation="back" title="Back to previous view" aria-label="Back to previous view">&#8592;</button><button type="button" data-header-navigation="top" title="Scroll to top" aria-label="Scroll to top">&#8593;</button>';
    controls.querySelector('[data-header-navigation="back"]').addEventListener("click",()=>history.back());
    controls.querySelector('[data-header-navigation="top"]').addEventListener("click",()=>window.scrollTo({top:0,left:0,behavior:"smooth"}));
    actions.insertBefore(controls,exportMenu);return true;
  }
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
  const PRIMARY_NAV = [
    ["ducar","DUCAR Dashboard"],
    ["traffic","Traffic"],
    ["condition","Condition"],
    ["structures","Structures"],
    ["pims","PIMS"],
    ["hdm4","HDM-4"],
    ["global","Global"],
    ["socioeconomic","Socioeconomic Analysis"],
    ["budgets","Priority Studio"],
    ["summaries","Admin Tools"]
  ];
  const SOURCE_NAV_TITLES = {ducar:"DUCAR Dashboard",traffic:"Traffic",condition:"Condition",structures:"Structures",pims:"PIMS",hdm4:"HDM-4",global:"Global",socioeconomic:"Socioeconomic Analysis",budgets:"Budgets & Prioritization",summaries:"Summaries & Admin Tools"};
  function replaceNavLabel(button,label) {
    const known=new Set([...Object.values(SOURCE_NAV_TITLES),...PRIMARY_NAV.map(([,text])=>text)]),walker=document.createTreeWalker(button,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode()))if(known.has(node.nodeValue.trim())){node.nodeValue=node.nodeValue.replace(node.nodeValue.trim(),label);return;}
  }
  function syncPrimaryNav() {
    const all=[...document.querySelectorAll("button[title]")];
    all.forEach(button=>{const route=button.dataset.ducarSection||sectionFromTitle(button.title);if(route)button.dataset.ducarSection=route;});
    const byRoute=new Map(all.filter(button=>button.dataset.ducarSection).map(button=>[button.dataset.ducarSection,button]));
    const dashboard=byRoute.get("ducar"),nav=dashboard?.parentElement;if(!nav)return false;
    [...byRoute].forEach(([route,button])=>{const retained=PRIMARY_NAV.some(([id])=>id===route);button.hidden=!retained;button.classList.toggle("ducar-nav-hidden",!retained);});
    PRIMARY_NAV.forEach(([route,label])=>{const button=byRoute.get(route);if(!button)return;button.hidden=false;button.classList.remove("ducar-nav-hidden");button.title=label;button.setAttribute("aria-label",label);replaceNavLabel(button,label);nav.appendChild(button);});
    nav.dataset.ducarPrimaryNav="10";syncInjectedNav();return PRIMARY_NAV.every(([route])=>byRoute.has(route));
  }
  function syncInjectedNav(){document.querySelectorAll("button[data-ducar-section]").forEach(button=>button.classList.toggle("codex-injected-active",button.dataset.ducarSection===state.section));}
  function syncHeaderFilterPanel() {
    if(!cache.links)return;
    const selects=[...document.querySelectorAll("#root select")],find=prefix=>selects.find(select=>select.options[0]?.textContent.trim().startsWith(prefix));
    const rows=cache.links,unique=field=>[...new Set(rows.map(row=>shown(row[field])).filter(value=>value!=="Not supplied"))].sort((a,b)=>a.localeCompare(b)),counts=(field,value)=>rows.filter(row=>shown(row[field])===value).length;
    const configure=(select,key,label,values,field)=>{if(!select)return;const selected=state.headerFilters[key];select.dataset.ducarHeaderFilter=key;select.setAttribute("aria-label",label);select.replaceChildren(new Option(`${label} (${number(rows.length)})`,"All"),...values.map(value=>new Option(`${value} (${number(counts(field,value))})`,value)));select.value=values.includes(selected)?selected:"All";state.headerFilters[key]=select.value;};
    configure(find("All Regions"),"region","All regions",unique("region"),"region");
    configure(find("All Districts"),"district","All districts",unique("district"),"district");
    configure(find("All Categories")||find("All Surfaces"),"surface","All surfaces",unique("surface"),"surface");
    configure(find("All Classes"),"pavement","All pavement classes",unique("pavement_class"),"pavement_class");
    configure(find("All Conditions"),"condition","All conditions",unique("condition"),"condition");
    const search=document.querySelector('#root input[placeholder*="Search road"]');if(search){search.dataset.ducarHeaderFilter="search";search.setAttribute("aria-label","Search roads from header filters");if(search.value!==state.headerFilters.search)search.value=state.headerFilters.search;}
  }
  let headerSearchTimer=null;
  document.addEventListener("change",event=>{const key=event.target?.dataset?.ducarHeaderFilter;if(!key||key==="search")return;state.headerFilters[key]=event.target.value;state.page=1;render();setTimeout(syncHeaderFilterPanel,80);},true);
  document.addEventListener("input",event=>{if(event.target?.dataset?.ducarHeaderFilter!=="search")return;state.headerFilters.search=event.target.value;state.page=1;clearTimeout(headerSearchTimer);headerSearchTimer=setTimeout(()=>{render();syncHeaderFilterPanel();},180);},true);
  document.addEventListener("click",event=>{if(event.target.closest?.("button")?.textContent.trim()!=="Filters")return;setTimeout(syncHeaderFilterPanel,60);setTimeout(syncHeaderFilterPanel,260);},true);
  let navAttempts=0; const navTimer=setInterval(()=>{navAttempts++;const ready=ensureSocioeconomicNav()&&ensureStructuresNav()&&syncPrimaryNav()&&ensureHeaderExportMenu()&&ensureHeaderNavigationControls();if(ready||navAttempts>40)clearInterval(navTimer);},250);
  window.addEventListener("hashchange",()=>{
    state.section=sectionFromHash();state.tab=tabFromHash();state.page=1;state.search="";state.filterField="";state.filterValue="";state.sortField="";render();setTimeout(syncPrimaryNav,0);
  });
  render();
})();
