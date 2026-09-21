"""Build exhaustive DUCAR socioeconomic facilities and road-link exposure analysis.

The build uses every usable record from the local Uganda school, health,
trading-centre, town, OpenStreetMap land-use and curated strategic-site layers.
All distance joins are calculated in WGS 84 / UTM zone 36N (EPSG:32636).
"""

from __future__ import annotations

import json
import math
import sqlite3
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd


HERE = Path(__file__).resolve().parent
SITE = HERE.parent
REPOSITORY = SITE.parents[1]
DUCAR = SITE.parent
SHAPES = DUCAR / "shapefiles"
OSM = DUCAR / "uganda-latest-free.shp"
DATA = SITE / "data"
CRS_METRIC = "EPSG:32636"
CRS_WEB = "EPSG:4326"


SOURCES = [
    {
        "name": "Uganda Ministry of Education and Sports — Schools & Institutions",
        "url": "https://www.education.go.ug/schools-institutions/",
        "coverage": "Education-institution master lists and sector context",
    },
    {
        "name": "Uganda Ministry of Health — National Health Facility Master List",
        "url": "https://library.health.go.ug/category/health-infrastructure",
        "coverage": "Public and private health-facility planning context",
    },
    {
        "name": "Uganda Directorate of Geological Survey and Mines — Geographic Maps",
        "url": "https://dgsm.go.ug/resources/",
        "coverage": "Mineral occurrence, industrial minerals, gold and critical-minerals maps",
    },
    {
        "name": "Uganda Investment Authority — Industrial and Business Parks",
        "url": "https://ugandainvest.go.ug/parks/",
        "coverage": "Operational, planned and proposed industrial parks",
    },
    {
        "name": "Uganda Bureau of Statistics",
        "url": "https://www.ubos.org/",
        "coverage": "Population, administrative and socioeconomic statistical authority",
    },
    {
        "name": "Geofabrik Uganda OpenStreetMap extract",
        "url": "https://download.geofabrik.de/africa/uganda.html",
        "coverage": "Open geospatial land-use and points-of-interest supplement",
    },
]


def text(value, fallback="Not supplied"):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return fallback
    value = str(value).strip()
    return value or fallback


def number(value, fallback=0.0):
    try:
        if value is None or pd.isna(value):
            return fallback
        return float(value)
    except (TypeError, ValueError):
        return fallback


def point_layer(path: Path, category: str, mapping: dict[str, str], source: str) -> gpd.GeoDataFrame:
    frame = gpd.read_file(path)
    frame = frame[frame.geometry.notna() & ~frame.geometry.is_empty].copy()
    frame = frame.to_crs(CRS_WEB)
    rows = pd.DataFrame(index=frame.index)
    for target, source_field in mapping.items():
        rows[target] = frame[source_field] if source_field in frame.columns else None
    rows["category"] = category
    rows["source_dataset"] = source
    rows["source_record_count"] = len(frame)
    result = gpd.GeoDataFrame(rows, geometry=frame.geometry, crs=CRS_WEB)
    return result


def curated_layer() -> gpd.GeoDataFrame:
    frame = gpd.read_file(DATA / "uganda_socioeconomic_geodata.json")
    frame = frame.to_crs(CRS_WEB)
    frame["source_dataset"] = "Curated Uganda strategic socioeconomic sites"
    frame["source_record_count"] = len(frame)
    return frame


def osm_landuse_layer() -> gpd.GeoDataFrame:
    frame = gpd.read_file(OSM / "gis_osm_landuse_a_free_1.shp")
    classes = {
        "industrial": "Industry & Logistics",
        "commercial": "Commerce & Services",
        "retail": "Commerce & Services",
        "quarry": "Mineral Deposit",
        "farmland": "Agriculture & Agro-processing",
        "farmyard": "Agriculture & Agro-processing",
        "orchard": "Agriculture & Agro-processing",
    }
    frame = frame[frame["fclass"].isin(classes)].copy().to_crs(CRS_WEB)
    frame["geometry"] = frame.geometry.representative_point()
    rows = gpd.GeoDataFrame(
        {
            "id": "OSM-LAND-" + frame["osm_id"].astype(str),
            "name": frame["name"].fillna(frame["fclass"].str.replace("_", " ").str.title()),
            "category": frame["fclass"].map(classes),
            "sub_type": frame["fclass"].str.replace("_", " ").str.title(),
            "status": "Mapped land use",
            "district": "Spatial join required",
            "source_dataset": "Geofabrik/OpenStreetMap Uganda land-use extract",
            "source_record_count": len(frame),
        },
        geometry=frame.geometry,
        crs=CRS_WEB,
    )
    return rows


def osm_poi_layer() -> gpd.GeoDataFrame:
    frame = gpd.read_file(OSM / "gis_osm_pois_free_1.shp")
    classes = {
        "market_place": "Market & Trading Centre",
        "supermarket": "Commerce & Services",
        "bank": "Finance & Services",
        "college": "Educational Institution",
        "university": "Educational Institution",
        "bus_station": "Transport & Logistics",
        "airport": "Transport & Logistics",
        "fuel": "Transport & Logistics",
    }
    frame = frame[frame["fclass"].isin(classes)].copy().to_crs(CRS_WEB)
    rows = gpd.GeoDataFrame(
        {
            "id": "OSM-POI-" + frame["osm_id"].astype(str),
            "name": frame["name"].fillna(frame["fclass"].str.replace("_", " ").str.title()),
            "category": frame["fclass"].map(classes),
            "sub_type": frame["fclass"].str.replace("_", " ").str.title(),
            "status": "Mapped point of interest",
            "district": "Spatial join required",
            "source_dataset": "Geofabrik/OpenStreetMap Uganda POI extract",
            "source_record_count": len(frame),
        },
        geometry=frame.geometry,
        crs=CRS_WEB,
    )
    return rows


def facilities() -> gpd.GeoDataFrame:
    schools = point_layer(
        SHAPES / "Ug_Schools.shp",
        "Educational Institution",
        {
            "id": "DISPEMISNO",
            "name": "SCHOOLNAME",
            "sub_type": "SCHOOLTYPE",
            "status": "SCHOOLDESC",
            "district": "DISTNAM",
            "ownership": "SCHOOLOWNE",
            "students": "NRSTUD",
            "teachers": "NRTEACHERS",
        },
        "Ug_Schools.shp — local Uganda education facility layer",
    )
    health = point_layer(
        SHAPES / "Ug_health_centres.shp",
        "Healthcare Facility",
        {
            "id": "LABEL",
            "name": "Name",
            "sub_type": "GRADE",
            "status": "OWNERSHIP",
            "district": "DISTRICT",
            "ownership": "OWNERSHIP",
            "capacity": "CAPACITY",
        },
        "Ug_health_centres.shp — local Uganda health facility layer",
    )
    trading = point_layer(
        SHAPES / "Ug_Trading_Centres.shp",
        "Market & Trading Centre",
        {
            "id": "NO",
            "name": "NAME",
            "sub_type": "ID",
            "status": "POWER_SUPP",
            "district": "DISTRICT",
            "population": "POP",
            "households": "HH",
        },
        "Ug_Trading_Centres.shp — local Uganda rural growth and market-centre layer",
    )
    towns = point_layer(
        SHAPES / "Ug_Towns.shp",
        "Town & Administrative Centre",
        {"id": "OBJECTID", "name": "cityname", "sub_type": "Adm_level"},
        "Ug_Towns.shp — local Uganda urban-centre layer",
    )
    frames = [curated_layer(), schools, health, trading, towns, osm_landuse_layer(), osm_poi_layer()]
    merged = pd.concat(frames, ignore_index=True, sort=False)
    merged = gpd.GeoDataFrame(merged, geometry="geometry", crs=CRS_WEB)
    for column in ["id", "name", "category", "sub_type", "status", "district", "ownership"]:
        if column not in merged:
            merged[column] = "Not supplied"
        merged[column] = merged[column].map(text)
    merged["id"] = [value if value != "Not supplied" else f"SOC-{i+1:06d}" for i, value in enumerate(merged["id"])]
    merged = merged.drop_duplicates(subset=["category", "name", "geometry"]).reset_index(drop=True)
    return merged


def nearest_and_count(roads_m: gpd.GeoDataFrame, sites_m: gpd.GeoDataFrame, distance_m: float):
    if sites_m.empty:
        return [None] * len(roads_m), [0] * len(roads_m)
    site_tree = sites_m.sindex
    valid = roads_m.geometry.notna() & ~roads_m.geometry.is_empty
    valid_geometries = roads_m.loc[valid, "geometry"]
    distances = np.full(len(roads_m), np.nan, dtype=float)
    counts = np.zeros(len(roads_m), dtype=int)
    if len(valid_geometries):
        nearest_indexes, nearest_distances = site_tree.nearest(
            valid_geometries, return_all=False, return_distance=True
        )
        valid_positions = np.flatnonzero(valid.to_numpy())
        distances[valid_positions[nearest_indexes[0]]] = nearest_distances / 1000.0
        # Use road midpoints for bulk threshold counts. Minimum geometry-to-site
        # distance remains exact; midpoint density avoids multi-million polygon
        # intersection pairs for long links while preserving complete coverage.
        midpoints = valid_geometries.interpolate(0.5, normalized=True)
        buffered = midpoints.buffer(distance_m)
        pairs = site_tree.query(buffered, predicate="intersects")
        if pairs.size:
            local_counts = np.bincount(pairs[0], minlength=len(valid_geometries))
            counts[valid_positions] = local_counts
    return [None if np.isnan(value) else float(value) for value in distances], counts.tolist()


def road_analysis(all_facilities: gpd.GeoDataFrame):
    print("Loading and joining 7,733 DUCAR road geometries...", flush=True)
    roads = gpd.read_file(DATA / "ducar_2025_routes_web.geojson")
    # The source GeoJSON contains UTM 36N coordinates but GeoJSON readers
    # conventionally assume WGS84 when no CRS member is present.
    roads = roads.set_crs(CRS_METRIC, allow_override=True)
    register = pd.DataFrame(json.loads((DATA / "ducar_link_register.json").read_text(encoding="utf-8")))
    register["source_code"] = register["source_code"].astype(str)
    roads["source_code"] = roads["c"].astype(str)
    # Source road codes are not unique. Pair repeated codes deterministically
    # by their occurrence order to prevent a many-to-many join explosion.
    register["_source_occurrence"] = register.groupby("source_code").cumcount()
    roads["_source_occurrence"] = roads.groupby("source_code").cumcount()
    roads = roads.merge(register, on=["source_code", "_source_occurrence"], how="left", suffixes=("_map", ""))
    if len(roads) != 7733:
        raise RuntimeError(f"Expected 7,733 road geometries after deterministic join, found {len(roads):,}")
    roads_m = roads
    map_roads = roads[["link_id", "road_name", "district", "surface", "pavement_class", "condition", "geometry_length_km", "planning_priority_score", "priority_band", "geometry"]].copy()
    map_roads = map_roads.to_crs(CRS_WEB)
    map_roads["geometry"] = map_roads.geometry.simplify(0.00008, preserve_topology=True)
    clean_properties(map_roads).to_file(DATA / "ducar_socioeconomic_roads.geojson", driver="GeoJSON")
    facilities_m = all_facilities.to_crs(CRS_METRIC)
    groups = {
        "school": (["Educational Institution"], 5000),
        "health": (["Healthcare Facility"], 5000),
        "market": (["Market & Trading Centre", "Commerce & Services", "Finance & Services"], 5000),
        "industry": (["Industrial Park", "Industry & Logistics"], 10000),
        "mineral": (["Mineral Deposit"], 25000),
        "agriculture": (["Agricultural Corridor", "Agriculture & Agro-processing"], 10000),
        "energy": (["Energy Infrastructure"], 25000),
        "logistics": (["Border Post", "Transport & Logistics", "Town & Administrative Centre"], 10000),
    }
    results = {}
    for key, (categories, radius) in groups.items():
        print(f"Calculating {key} proximity and exposure...", flush=True)
        sites = facilities_m[facilities_m["category"].isin(categories)].reset_index(drop=True)
        nearest, count = nearest_and_count(roads_m, sites, radius)
        results[f"nearest_{key}_km"] = nearest
        results[f"{key}_sites_within_{radius // 1000}km"] = count

    rows = []
    for idx, road in roads.iterrows():
        length = number(road.get("geometry_length_km"), number(road.get("l_map"), 0))
        proximity = {
            key: results[f"nearest_{key}_km"][idx] if results[f"nearest_{key}_km"][idx] is not None else 999
            for key in groups
        }
        weights = {"school": 12, "health": 16, "market": 12, "industry": 18, "mineral": 15, "agriculture": 12, "energy": 7, "logistics": 8}
        thresholds = {"school": 5, "health": 5, "market": 5, "industry": 10, "mineral": 25, "agriculture": 10, "energy": 25, "logistics": 10}
        score = sum(weights[key] * max(0, 1 - proximity[key] / thresholds[key]) for key in groups)
        primary = min(proximity, key=lambda key: proximity[key] / thresholds[key])
        row = {
            "link_id": text(road.get("link_id")),
            "road_name": text(road.get("road_name"), text(road.get("n"))),
            "district": text(road.get("district"), text(road.get("d_map"))),
            "county": text(road.get("county")),
            "subcounty": text(road.get("subcounty")),
            "parish": text(road.get("parish")),
            "geometry_length_km": round(length, 4),
            "surface": text(road.get("surface"), text(road.get("s_map"))),
            "pavement_class": text(road.get("pavement_class")),
            "condition": text(road.get("condition"), text(road.get("p_map"))),
            "registry_aadt": road.get("registry_aadt") if pd.notna(road.get("registry_aadt")) else None,
            "planning_priority_score": road.get("planning_priority_score") if pd.notna(road.get("planning_priority_score")) else None,
            "recommended_intervention": text(road.get("recommended_intervention")),
            "socioeconomic_exposure_score": round(min(score, 100), 2),
            "primary_socioeconomic_factor": primary.title(),
        }
        for key in groups:
            row[f"nearest_{key}_km"] = round(proximity[key], 3) if proximity[key] < 999 else None
            radius = groups[key][1] // 1000
            row[f"{key}_sites_within_{radius}km"] = results[f"{key}_sites_within_{radius}km"][idx]
        row["exposure_band"] = "Critical" if score >= 70 else "High" if score >= 50 else "Moderate" if score >= 30 else "Low"
        rows.append(row)

    def length_where(predicate):
        return round(sum(row["geometry_length_km"] for row in rows if predicate(row)), 3)

    category_summary = []
    for category, count in all_facilities["category"].value_counts().sort_values(ascending=False).items():
        category_summary.append({"category": category, "features": int(count)})
    exposure_summary = [
        {"band": band, "affected_length_km": length_where(lambda row, band=band: row["exposure_band"] == band)}
        for band in ["Critical", "High", "Moderate", "Low"]
    ]
    access_summary = []
    for key, (_, radius_m) in groups.items():
        radius = radius_m // 1000
        access_summary.append(
            {
                "factor": key.title(),
                "threshold_km": radius,
                "affected_length_km": length_where(lambda row, key=key, radius=radius: (row[f"nearest_{key}_km"] or 999) <= radius),
                "outside_threshold_length_km": length_where(lambda row, key=key, radius=radius: (row[f"nearest_{key}_km"] or 999) > radius),
            }
        )
    district_summary = []
    for district in sorted({row["district"] for row in rows}):
        selected = [row for row in rows if row["district"] == district]
        district_summary.append(
            {
                "district": district,
                "total_length_km": round(sum(row["geometry_length_km"] for row in selected), 3),
                "critical_high_length_km": round(sum(row["geometry_length_km"] for row in selected if row["exposure_band"] in {"Critical", "High"}), 3),
                "weighted_exposure_score": round(
                    sum(row["geometry_length_km"] * row["socioeconomic_exposure_score"] for row in selected)
                    / max(sum(row["geometry_length_km"] for row in selected), 0.0001),
                    2,
                ),
            }
        )
    payload = {
        "metadata": {
            "title": "Uganda DUCAR socioeconomic road-link exposure analysis",
            "analysis_crs": CRS_METRIC,
            "distance_method": "Minimum planar distance from complete road geometry to facility point/representative polygon point",
            "road_links": len(rows),
            "road_length_km": round(sum(row["geometry_length_km"] for row in rows), 3),
            "facility_features": len(all_facilities),
            "all_records_reporting": True,
            "sources": SOURCES,
        },
        "category_summary": category_summary,
        "exposure_summary": exposure_summary,
        "access_summary": access_summary,
        "district_summary": district_summary,
        "rows": rows,
    }
    return payload


def clean_properties(frame: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    result = frame.copy()
    for column in result.columns:
        if column == "geometry":
            continue
        result[column] = result[column].map(lambda value: None if pd.isna(value) else value)
    return result


def write_sql_tables(payload: dict, all_facilities: gpd.GeoDataFrame) -> None:
    database = DATA / "ducar_enterprise_unified.sqlite"
    link_frame = pd.DataFrame(payload["rows"])
    web_facilities = all_facilities.to_crs("EPSG:4326").copy()
    web_facilities["longitude"] = web_facilities.geometry.x
    web_facilities["latitude"] = web_facilities.geometry.y
    facility_fields = ["id", "name", "category", "sub_type", "status", "district", "source_dataset", "longitude", "latitude"]
    facility_frame = web_facilities[facility_fields].copy()
    with sqlite3.connect(database) as connection:
        link_frame.to_sql("socioeconomic_link_analysis", connection, if_exists="replace", index=False)
        facility_frame.to_sql("socioeconomic_facilities", connection, if_exists="replace", index=False)
        connection.execute("CREATE INDEX IF NOT EXISTS idx_socio_link_id ON socioeconomic_link_analysis(link_id)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_socio_district ON socioeconomic_link_analysis(district)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_socio_exposure ON socioeconomic_link_analysis(exposure_band)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_facility_category ON socioeconomic_facilities(category)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_facility_district ON socioeconomic_facilities(district)")
        catalog_path = DATA / "ducar_database_catalog.json"
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        catalog["tables"] = [table for table in catalog["tables"] if table["table"] not in {"socioeconomic_link_analysis", "socioeconomic_facilities"}]
        for table_name in ["socioeconomic_link_analysis", "socioeconomic_facilities"]:
            columns = []
            for position, name, data_type, not_null, default, primary_key in connection.execute(f'PRAGMA table_info("{table_name}")'):
                columns.append({"position": position, "name": name, "type": data_type or "TEXT", "not_null": bool(not_null), "default": default if default is not None else "Not supplied", "primary_key": bool(primary_key)})
            indexes = [{"name": row[1], "unique": bool(row[2]), "origin": row[3]} for row in connection.execute(f'PRAGMA index_list("{table_name}")')]
            create_sql = connection.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table_name,)).fetchone()[0]
            count = connection.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0]
            catalog["tables"].append({"table": table_name, "row_count": count, "column_count": len(columns), "columns": columns, "indexes": indexes, "create_sql": create_sql, "sections": ["socioeconomic"]})
        catalog["tables"].sort(key=lambda item: item["table"])
        catalog["table_count"] = len(catalog["tables"])
        catalog["database_bytes"] = database.stat().st_size
        catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    print("Loading socioeconomic facility and land-use layers...", flush=True)
    all_facilities = facilities()
    print(f"Loaded {len(all_facilities):,} socioeconomic features.", flush=True)
    print("Writing web facility GeoJSON...", flush=True)
    clean_properties(all_facilities).to_file(DATA / "uganda_socioeconomic_facilities.geojson", driver="GeoJSON")
    print("Building all-link socioeconomic exposure matrix...", flush=True)
    payload = road_analysis(all_facilities)
    (DATA / "ducar_socioeconomic_link_analysis.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
        encoding="utf-8",
    )
    print("Writing socioeconomic SQL tables and schema catalogue...", flush=True)
    write_sql_tables(payload, all_facilities)
    print(json.dumps(payload["metadata"], indent=2))
    print("Categories:", len(payload["category_summary"]))


if __name__ == "__main__":
    main()
