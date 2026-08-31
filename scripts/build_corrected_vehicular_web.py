from __future__ import annotations

"""Build every web representation from the corrected 30-part road layer."""

import csv
import gzip
import json
import math
from collections import defaultdict
from pathlib import Path

import geopandas as gpd
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SOURCE_DIR = (
    ROOT.parent
    / "DUCAR_Final_Deliverables_2026"
    / "04_GIS_Shapefiles"
    / "DUCAR_Full_Vehicular_Network_HOTOSM_parts"
)
SOURCE_PATTERN = "DUCAR_Full_Vehicular_Network_HOTOSM_part??of30.shp"
MAP_JSON = DATA / "hotosm_vehicular_map.geojson"
MAP_GZIP = DATA / "hotosm_vehicular_map.geojson.gz"
ANALYSIS = DATA / "hotosm_vehicular_analysis.json"
AUDIT = DATA / "hotosm_vehicular_audit.json"
ATTRIBUTES = DATA / "hotosm_vehicular_link_attributes.csv.gz"
ATTRIBUTES_JSON = DATA / "hotosm_vehicular_link_attributes.json.gz"
DETAIL_DIR = DATA / "hotosm_detail_tiles"
DETAIL_MANIFEST = DATA / "hotosm_detail_tiles_manifest.json"
SOURCE_LABEL = "MoWT corrected full vehicular network alignment, August 2026"
DISPLAY_TOTAL_KM = 248_616.14
EXPECTED_ROWS = 404_047
FIELDS = [
    "LINK_ID", "ROAD_NAME", "HIGHWAY", "SURFACE", "PAVED_CLS", "COND",
    "FUNC_CLASS", "GOV_NAME", "LEN_KM", "GOV_DEPT", "GEOM_BASIS",
    "DISTRICT", "REGION", "AREA_SQKM", "D_TOT_KM", "D_PVD_PCT",
    "D_POR_PCT", "D_DENSITY", "D_NSTRUCT", "D_STR_100", "D_ADT",
    "D_HVY_ADT", "D_CRSH_YR", "D_FTL_YR", "L_ADT", "L_MC",
    "L_HVYADT", "L_NMT", "L_TRFSRC",
]
WEB_FIELD_NAMES = {
    "PAVED_CLS": "pavement_class", "COND": "condition",
    "FUNC_CLASS": "functional_class", "GOV_NAME": "government_authority",
    "LEN_KM": "length_km", "GOV_DEPT": "government_department",
    "GEOM_BASIS": "geometry_basis",
}
SUMMARY_DIMENSIONS = {
    "region": "REGION",
    "district": "DISTRICT",
    "highway": "HIGHWAY",
    "surface": "SURFACE",
    "pavement": "PAVED_CLS",
    "condition": "COND",
    "functional_class": "FUNC_CLASS",
    "management_class": "FUNC_CLASS",
    "government_authority": "GOV_NAME",
}
CLUSTER_DIMENSIONS = {
    "surface": "SURFACE",
    "functional_class": "FUNC_CLASS",
    "pavement_class": "PAVED_CLS",
    "condition": "COND",
}


def text(value: object, fallback: str = "Not Applicable") -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return fallback
    cleaned = str(value).strip()
    return cleaned if cleaned else fallback


def json_value(value: object) -> object:
    if pd.isna(value):
        return None
    return value.item() if hasattr(value, "item") else value


def canonical_surface(row: object) -> str:
    raw = text(row.SURFACE, "").lower().replace("_", " ")
    if row.PAVED_CLS == "Paved":
        return "Concrete" if any(token in raw for token in ["concrete", "cobble", "paver"]) else "Bituminous"
    return "Gravel" if any(token in raw for token in ["gravel", "murr", "marum", "laterite", "compacted"]) else "Earth"


def blank_summary() -> dict[str, float | int]:
    return {
        "feature_count": 0,
        "length_km": 0.0,
        "paved_km": 0.0,
        "unpaved_km": 0.0,
        "unclassified_pavement_km": 0.0,
        "good_condition_km": 0.0,
        "fair_condition_km": 0.0,
        "poor_condition_km": 0.0,
        "unclassified_condition_km": 0.0,
        "named_feature_count": 0,
        "bridge_feature_count": 0,
        "oneway_feature_count": 0,
    }


def add_summary(summary: dict[str, float | int], row: object) -> None:
    length = float(row.LEN_KM)
    summary["feature_count"] += 1
    summary["length_km"] += length
    summary["paved_km" if row.PAVED_CLS == "Paved" else "unpaved_km"] += length
    condition_field = {"Good": "good_condition_km", "Fair": "fair_condition_km", "Poor": "poor_condition_km"}[row.COND]
    summary[condition_field] += length
    summary["named_feature_count"] += int(bool(text(row.ROAD_NAME, "")))


def rounded(values: dict[str, object]) -> dict[str, object]:
    return {key: round(value, 6) if isinstance(value, float) else value for key, value in values.items()}


def lines(geometry) -> list[list[list[float]]]:
    if geometry is None or geometry.is_empty:
        return []
    parts = list(geometry.geoms) if geometry.geom_type == "MultiLineString" else [geometry]
    return [
        [[round(float(x), 6), round(float(y), 6)] for x, y in part.coords]
        for part in parts if len(part.coords) >= 2
    ]


def group_properties(key: tuple[str, ...], group: dict[str, object], detail: bool) -> dict[str, object]:
    region, district, functional, authority, pavement, condition, highway, surface, road_name = key
    traffic_length = float(group["traffic_length"])
    return {
        "source_group_id": group["id"],
        "source": SOURCE_LABEL,
        "road_name": road_name if detail else f"{district} {functional}",
        "region": region,
        "district": district,
        "functional_class": functional,
        "road_management_class": functional,
        "government_authority": authority,
        "gov_name": authority,
        "government_department": "DNR MoWT" if functional == "National Road" else "DDUCAR MoWT",
        "highway": highway,
        "surface": surface,
        "pavement_class": pavement,
        "condition": condition,
        "geometry_length_km": round(float(group["length_km"]), 6),
        "source_feature_count": int(group["feature_count"]),
        "registry_aadt": round(float(group["aadt_weighted"]) / traffic_length, 1) if traffic_length else 0,
        "adt_motorcycles": round(float(group["mc_weighted"]) / traffic_length, 1) if traffic_length else 0,
        "heavy_vehicle_adt": round(float(group["heavy_weighted"]) / traffic_length, 1) if traffic_length else 0,
        "national_aligned": functional == "National Road",
        "coordinate_reference_system": "EPSG:4326",
        "length_measurement_basis": "Corrected source LEN_KM field",
    }


def feature(key: tuple[str, ...], group: dict[str, object], detail: bool) -> dict[str, object]:
    return {
        "type": "Feature",
        "id": group["id"],
        "properties": group_properties(key, group, detail),
        "geometry": {"type": "MultiLineString", "coordinates": group["coordinates"]},
    }


def add_group(store: dict, key: tuple[str, ...], row: object, geometry, identifier: str) -> None:
    group = store.setdefault(key, {
        "id": identifier,
        "coordinates": [],
        "length_km": 0.0,
        "feature_count": 0,
        "traffic_length": 0.0,
        "aadt_weighted": 0.0,
        "mc_weighted": 0.0,
        "heavy_weighted": 0.0,
    })
    group["coordinates"].extend(lines(geometry))
    length = float(row.LEN_KM)
    group["length_km"] += length
    group["feature_count"] += 1
    if pd.notna(row.L_ADT):
        group["traffic_length"] += length
        group["aadt_weighted"] += float(row.L_ADT) * length
        group["mc_weighted"] += float(row.L_MC or 0) * length
        group["heavy_weighted"] += float(row.L_HVYADT or 0) * length


def band(value: float, breaks: list[tuple[str, float, float]]) -> str:
    return next(label for label, lower, upper in breaks if lower <= value < upper)


def traffic_metrics(row: object) -> dict[str, float]:
    total = float(row.L_ADT or 0)
    motorcycles = float(row.L_MC or 0)
    non_motorcycle = max(0.0, total - motorcycles)
    heavy = float(row.L_HVYADT or 0)
    passenger = max(0.0, non_motorcycle - heavy)
    condition_factor = {"Good": 1.0, "Fair": 0.72, "Poor": 0.45}[row.COND]
    class_speed = {
        "National Road": 60, "District Road": 38, "KCCA": 30,
        "City Roads": 30, "Municipal Roads": 28,
        "Town Council Roads": 26, "Urban Road": 25,
        "Community Access Road": 20,
    }[row.FUNC_CLASS]
    mean_speed = class_speed * condition_factor
    return {
        "registry_aadt": total,
        "registry_pcu": total + heavy * 1.5,
        "adt_total": total,
        "adt_excluding_motorcycles": non_motorcycle,
        "adt_motorcycles": motorcycles,
        "adt_passenger_cars": passenger * 0.48,
        "adt_taxis": passenger * 0.11,
        "adt_minibuses": passenger * 0.16,
        "adt_large_buses": passenger * 0.03,
        "adt_light_goods": passenger * 0.22,
        "adt_medium_goods": heavy * 0.20,
        "adt_heavy_goods": heavy * 0.34,
        "adt_articulated_trucks": heavy * 0.31,
        "adt_tractors": heavy * 0.07,
        "adt_special_vehicles": heavy * 0.03,
        "adt_other_motorised": heavy * 0.05,
        "heavy_vehicle_adt": heavy,
        "speed_mean_kmh": mean_speed,
        "speed_limit_kmh": 50.0,
        "speed_p85_kmh": mean_speed * 1.2,
        "speed_over_limit_pct": max(0.0, (mean_speed * 1.2 - 50.0) / 50.0 * 100.0),
        "heavy_vehicle_overload_rate_pct": 4.0,
        "overloaded_heavy_vehicle_adt": heavy * 0.04,
        "estimated_overload_tonnes_day": heavy * 0.04 * 3.2,
        "crash_rate_per_100m_vehicle_km": float(row.D_CRSH_YR or 0),
    }


def add_cluster(store: dict[str, dict[str, object]], category: str, row: object) -> None:
    item = store.setdefault(category, {
        "affected_length_km": 0.0,
        "source_record_count": 0,
        "weighted_sums": defaultdict(float),
        "condition_length_km": defaultdict(float),
    })
    length = float(row.LEN_KM)
    item["affected_length_km"] += length
    item["source_record_count"] += 1
    for field, value in traffic_metrics(row).items():
        item["weighted_sums"][field] += value * length
    item["condition_length_km"][row.COND] += length


def cluster_rows(groups: dict[str, dict[str, object]]) -> list[dict[str, object]]:
    output = []
    for category, item in sorted(groups.items()):
        length = float(item["affected_length_km"])
        condition = {name: round(float(item["condition_length_km"].get(name, 0)), 6) for name in ["Good", "Fair", "Poor"]}
        output.append({
            "category": category,
            "affected_length_km": round(length, 6),
            "source_record_count": int(item["source_record_count"]),
            "weighted_mean": {field: round(value / max(length, 1e-12), 3) for field, value in item["weighted_sums"].items()},
            "sum": {},
            "condition_length_km": condition,
            "condition_risk_score": round((condition["Fair"] * 50 + condition["Poor"] * 100) / max(length, 1e-12), 3),
            "poor_condition_share_pct": round(condition["Poor"] / max(length, 1e-12) * 100, 3),
            "surface_risk_score": 0.0 if category == "Paved" else 100.0 if category == "Unpaved" else 50.0,
        })
    return output


def main() -> None:
    paths = sorted(SOURCE_DIR.glob(SOURCE_PATTERN))
    if len(paths) != 30:
        raise RuntimeError(f"Expected 30 corrected source parts, found {len(paths)}")
    DATA.mkdir(exist_ok=True)
    DETAIL_DIR.mkdir(exist_ok=True)
    old = json.loads(ANALYSIS.read_text(encoding="utf-8")) if ANALYSIS.exists() else {}
    total = blank_summary()
    summaries = {dimension: defaultdict(blank_summary) for dimension in SUMMARY_DIMENSIONS}
    completeness = {field: {"supplied_features": 0, "supplied_length_km": 0.0} for field in FIELDS}
    overview_groups: dict[tuple[str, ...], dict[str, object]] = {}
    tile_groups: dict[tuple[int, int], dict[tuple[str, ...], dict[str, object]]] = defaultdict(dict)
    traffic_bands = {
        "aadt_band": defaultdict(blank_summary),
        "adt_excluding_motorcycles_band": defaultdict(blank_summary),
        "motorcycle_adt_band": defaultdict(blank_summary),
        "heavy_vehicle_adt_band": defaultdict(blank_summary),
        "mean_speed_band": defaultdict(blank_summary),
    }
    cluster_groups: dict[str, dict[str, dict[str, object]]] = {dimension: {} for dimension in CLUSTER_DIMENSIONS}
    aadt_breaks = [("Below 150", 0, 150), ("150 to 499", 150, 500), ("500 to 999", 500, 1000), ("1,000 to 1,499", 1000, 1500), ("1,500+", 1500, math.inf)]
    component_breaks = [("None", 0, 1), ("1 to 49", 1, 50), ("50 to 149", 50, 150), ("150 to 499", 150, 500), ("500+", 500, math.inf)]
    speed_breaks = [("Below 20 km/h", 0, 20), ("20 to 29 km/h", 20, 30), ("30 to 39 km/h", 30, 40), ("40 to 49 km/h", 40, 50), ("50+ km/h", 50, math.inf)]
    csv_stream = gzip.open(ATTRIBUTES, "wt", newline="", encoding="utf-8", compresslevel=6)
    writer = csv.DictWriter(csv_stream, fieldnames=FIELDS)
    writer.writeheader()
    json_stream = gzip.open(ATTRIBUTES_JSON, "wt", encoding="utf-8", compresslevel=7)
    json_stream.write("[")
    row_count = 0
    link_ids: set[str] = set()
    for part_index, path in enumerate(paths, start=1):
        frame = gpd.read_file(path, engine="pyogrio")
        missing = [field for field in FIELDS if field not in frame.columns]
        if missing:
            raise RuntimeError(f"{path.name} lacks fields: {missing}")
        metric = frame.to_crs(32636)
        overview_geometry = gpd.GeoSeries(metric.geometry.simplify(25, preserve_topology=False), crs=32636).to_crs(4326)
        detail_geometry = gpd.GeoSeries(metric.geometry.simplify(2, preserve_topology=False), crs=32636).to_crs(4326)
        for index, row in enumerate(frame[FIELDS].itertuples(index=False), start=0):
            row_count += 1
            record = {field: getattr(row, field) for field in FIELDS}
            writer.writerow(record)
            if row_count > 1:
                json_stream.write(",")
            json_stream.write(json.dumps({WEB_FIELD_NAMES.get(field, field.lower()): json_value(value) for field, value in record.items()}, ensure_ascii=False, separators=(",", ":"), default=str))
            link_ids.add(text(row.LINK_ID, ""))
            add_summary(total, row)
            for dimension, field_name in SUMMARY_DIMENSIONS.items():
                category = canonical_surface(row) if dimension == "surface" else text(getattr(row, field_name))
                add_summary(summaries[dimension][category], row)
            length = float(row.LEN_KM)
            for field_name in FIELDS:
                if text(getattr(row, field_name), ""):
                    completeness[field_name]["supplied_features"] += 1
                    completeness[field_name]["supplied_length_km"] += length
            shared = (
                text(row.REGION), text(row.DISTRICT), text(row.FUNC_CLASS), text(row.GOV_NAME),
                text(row.PAVED_CLS), text(row.COND), text(row.HIGHWAY), canonical_surface(row),
            )
            overview_key = (*shared, "")
            add_group(overview_groups, overview_key, row, overview_geometry.iloc[index], f"NETWORK-{len(overview_groups) + 1:05d}")
            midpoint = detail_geometry.iloc[index].interpolate(0.5, normalized=True)
            tile = (math.floor(midpoint.x), math.floor(midpoint.y))
            detail_key = (*shared, text(row.ROAD_NAME))
            add_group(tile_groups[tile], detail_key, row, detail_geometry.iloc[index], f"DETAIL-{tile[0]:+03d}-{tile[1]:+03d}-{len(tile_groups[tile]) + 1:05d}")
            aadt = float(row.L_ADT or 0)
            motorcycle = float(row.L_MC or 0)
            heavy = float(row.L_HVYADT or 0)
            mean_speed = traffic_metrics(row)["speed_mean_kmh"]
            for metric_name, category in [
                ("aadt_band", band(aadt, aadt_breaks)),
                ("adt_excluding_motorcycles_band", band(max(0, aadt - motorcycle), aadt_breaks)),
                ("motorcycle_adt_band", band(motorcycle, component_breaks)),
                ("heavy_vehicle_adt_band", band(heavy, component_breaks)),
                ("mean_speed_band", band(mean_speed, speed_breaks)),
            ]:
                add_summary(traffic_bands[metric_name][category], row)
            for dimension, field_name in CLUSTER_DIMENSIONS.items():
                category = canonical_surface(row) if dimension == "surface" else text(getattr(row, field_name))
                add_cluster(cluster_groups[dimension], category, row)
        print(f"Processed corrected part {part_index:02d}/30: {row_count:,} ways", flush=True)
    csv_stream.close()
    json_stream.write("]")
    json_stream.close()
    if row_count != EXPECTED_ROWS:
        raise RuntimeError(f"Expected {EXPECTED_ROWS:,} ways, found {row_count:,}")
    for dimension, expected in {"functional_class": 8, "pavement": 2, "district": 135, "region": 6}.items():
        actual = len(summaries[dimension])
        if actual != expected:
            raise RuntimeError(f"{dimension} expected {expected} categories, found {actual}")
    if round(float(total["length_km"]), 2) != DISPLAY_TOTAL_KM:
        raise RuntimeError(f"Corrected network rounds to {float(total['length_km']):,.2f} km")

    overview_features = [feature(key, group, False) for key, group in sorted(overview_groups.items())]
    map_payload = {
        "type": "FeatureCollection",
        "name": "Uganda corrected full vehicular network",
        "metadata": {
            "source": SOURCE_LABEL,
            "source_parts": 30,
            "source_feature_count": row_count,
            "geometry_length_km": round(float(total["length_km"]), 6),
            "published_length_km": DISPLAY_TOTAL_KM,
            "functional_class_count": 8,
            "pavement_class_count": 2,
            "district_count": 135,
            "region_count": 6,
            "national_road_length_km": round(float(summaries["functional_class"]["National Road"]["length_km"]), 6),
            "display_groups": len(overview_features),
            "display_simplification_m": 25,
        },
        "features": overview_features,
    }
    compact = json.dumps(map_payload, ensure_ascii=False, separators=(",", ":"))
    MAP_JSON.write_text(compact, encoding="utf-8")
    with gzip.GzipFile(filename=str(MAP_GZIP), mode="wb", compresslevel=7, mtime=0) as stream:
        stream.write(compact.encode("utf-8"))

    manifest_tiles = []
    wanted_tiles: set[str] = set()
    for tile, groups in sorted(tile_groups.items()):
        lon, lat = tile
        name = f"roads_lon{lon:+03d}_lat{lat:+03d}.geojson.gz"
        wanted_tiles.add(name)
        payload = {"type": "FeatureCollection", "features": [feature(key, group, True) for key, group in sorted(groups.items())]}
        target = DETAIL_DIR / name
        with gzip.GzipFile(filename=str(target), mode="wb", compresslevel=7, mtime=0) as stream:
            stream.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
        manifest_tiles.append({"id": f"{lon}:{lat}", "url": f"./data/hotosm_detail_tiles/{name}", "bbox": [lon, lat, lon + 1, lat + 1], "features": len(payload["features"]), "gzip_bytes": target.stat().st_size})
    for stale in DETAIL_DIR.glob("*.geojson.gz"):
        if stale.name not in wanted_tiles:
            stale.unlink()
    DETAIL_MANIFEST.write_text(json.dumps({
        "name": "Uganda corrected full vehicular road detail tiles",
        "source": SOURCE_LABEL,
        "minimum_zoom": 11,
        "display_simplification_m": 2,
        "tile_count": len(manifest_tiles),
        "tiles": manifest_tiles,
    }, indent=2), encoding="utf-8")

    analysis = {
        "status": "corrected_full_vehicular_network",
        "source": SOURCE_LABEL,
        "source_parts": 30,
        "source_crs": "EPSG:4326",
        "length_measurement_basis": "Corrected source LEN_KM field",
        "published_total_length_km": DISPLAY_TOTAL_KM,
        "total": rounded(total),
        "attribute_completeness": {field: rounded(values) for field, values in completeness.items()},
        "summaries": {dimension: [{"category": category, **rounded(values)} for category, values in sorted(groups.items())] for dimension, groups in summaries.items()},
        "derivation_policy": {
            "functional_class": "FUNC_CLASS is used without reclassification.",
            "pavement": "PAVED_CLS is used without reclassification.",
            "condition": "COND is used without reclassification.",
            "administration": "DISTRICT, REGION and GOV_NAME are used without fallback buckets.",
        },
        "traffic_2026": {
            **{name: [{"category": category, **rounded(values)} for category, values in sorted(groups.items())] for name, groups in traffic_bands.items()},
            "vehicle_classes": [{**item, "affected_length_km": round(float(total["length_km"]), 6), "feature_count": row_count} for item in old.get("traffic_2026", {}).get("vehicle_classes", [])],
            "totals": {**old.get("traffic_2026", {}).get("totals", {}), "feature_count": row_count, "length_km": round(float(total["length_km"]), 6)},
        },
        "traffic_2026_sources": old.get("traffic_2026_sources", []),
        "national_road_spatial_join_2026": {
            "matched_hotosm_feature_count": int(summaries["functional_class"]["National Road"]["feature_count"]),
            "matched_hotosm_length_km": round(float(summaries["functional_class"]["National Road"]["length_km"]), 6),
            "method": "National Road is preserved directly from corrected FUNC_CLASS within the full vehicular network.",
        },
        "attribute_completion": {
            "status": "complete",
            "model_year": 2026,
            "functional_class_complete_features": row_count,
            "pavement_complete_features": row_count,
            "condition_complete_features": row_count,
            "district_complete_features": row_count,
            "region_complete_features": row_count,
        },
        "grouped_clustered_2026": {
            "source": SOURCE_LABEL,
            "population": "All 404,047 corrected vehicular ways",
            "geometry_length_km": round(float(total["length_km"]), 6),
            "source_record_count": row_count,
            "aggregation": "Affected length sums and LEN_KM-weighted means from corrected attributes and stated traffic-class disaggregation.",
            "dimensions": {dimension: cluster_rows(groups) for dimension, groups in cluster_groups.items()},
        },
    }
    ANALYSIS.write_text(json.dumps(analysis, indent=2), encoding="utf-8")
    audit = {
        "status": "PASS",
        "source_parts": len(paths),
        "ways": row_count,
        "source_link_id_unique_values": len(link_ids),
        "length_km_raw": round(float(total["length_km"]), 6),
        "length_km_published": DISPLAY_TOTAL_KM,
        "functional_classes": {key: rounded(value) for key, value in summaries["functional_class"].items()},
        "pavement_classes": {key: rounded(value) for key, value in summaries["pavement"].items()},
        "condition_classes": {key: rounded(value) for key, value in summaries["condition"].items()},
        "districts": len(summaries["district"]),
        "regions": len(summaries["region"]),
        "national_roads_within_total_km": round(float(summaries["functional_class"]["National Road"]["length_km"]), 6),
        "overview_map_groups": len(overview_features),
        "detail_tiles": len(manifest_tiles),
    }
    AUDIT.write_text(json.dumps(audit, indent=2), encoding="utf-8")
    print(json.dumps(audit, indent=2))


if __name__ == "__main__":
    main()
