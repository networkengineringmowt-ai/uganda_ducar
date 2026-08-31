from __future__ import annotations

"""Audit the corrected full-network web data, governed link names and GIS sync."""

import gzip
import json
import re
import sqlite3
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
GIS = ROOT.parent / "DUCAR_Final_Deliverables_2026" / "04_GIS_Shapefiles"
OUTPUT = DATA / "platform_data_accuracy_audit_2026.json"
EMPTY = {"", "nan", "none", "null", "not supplied", "unclassified", "unknown"}
EXPECTED_ROWS = 404_047
EXPECTED_LENGTH = 248_616.14
EXPECTED_FUNCTIONAL_CLASSES = {
    "National Roads", "District Roads", "KCCA", "City Roads",
    "Community Access Roads", "Town Council Roads", "Municipal Roads",
}
EXPECTED_PAVEMENT = {"Paved": (4_619, 5_357.82), "Unpaved": (399_428, 243_258.32)}
EXPECTED_CONDITION = {"Good": 785.73, "Fair": 141_708.39, "Poor": 106_122.01}
ROAD_ID = re.compile(r"^[A-Z]{4}\d{3}$")
VISIBLE_ID_SUFFIX = re.compile(r"\s*\([A-Z]{4}\d{3}\)\s*$")


def missing(series: pd.Series) -> int:
    return int((series.isna() | series.astype(str).str.strip().str.lower().isin(EMPTY)).sum())


def grouped(frame: pd.DataFrame, field: str) -> dict[str, tuple[int, float]]:
    values = frame.groupby(field, dropna=False)["LEN_KM"].agg(["size", "sum"])
    return {str(index): (int(row["size"]), float(row["sum"])) for index, row in values.iterrows()}


def category_checks(actual: dict[str, tuple[int, float]], expected: dict[str, tuple[int, float]]) -> dict[str, object]:
    return {
        "category_set_match": set(actual) == set(expected),
        "record_count_variance": sum(abs(actual.get(name, (0, 0))[0] - count) for name, (count, _) in expected.items()),
        "rounded_length_variance_km": round(sum(abs(round(actual.get(name, (0, 0))[1], 2) - length) for name, (_, length) in expected.items()), 6),
    }


def main() -> None:
    source = pd.read_csv(DATA / "hotosm_vehicular_link_attributes.csv.gz", low_memory=False)
    ducar = pd.read_csv(DATA / "ducar_link_register.csv", low_memory=False)
    analysis = json.loads((DATA / "hotosm_vehicular_analysis.json").read_text(encoding="utf-8"))
    manifest = json.loads((DATA / "hotosm_detail_tiles_manifest.json").read_text(encoding="utf-8"))
    with gzip.open(DATA / "hotosm_vehicular_map.geojson.gz", "rt", encoding="utf-8") as stream:
        web = json.load(stream)
    with gzip.open(DATA / "ducar_map_preview.geojson.gz", "rt", encoding="utf-8") as stream:
        preview = json.load(stream)

    source_length = float(pd.to_numeric(source["LEN_KM"], errors="coerce").sum())
    functional = grouped(source, "FUNC_CLASS")
    pavement = grouped(source, "PAVED_CLS")
    condition = grouped(source, "COND")
    corrected_checks = {
        "record_count_variance": abs(len(source) - EXPECTED_ROWS),
        "published_length_variance_km": round(abs(round(source_length, 2) - EXPECTED_LENGTH), 6),
        "district_count_variance": abs(source["DISTRICT"].nunique() - 135),
        "region_count_variance": abs(source["REGION"].nunique() - 6),
        "missing_required_attributes": {field: missing(source[field]) for field in ["FUNC_CLASS", "PAVED_CLS", "COND", "DISTRICT", "REGION", "GOV_NAME"]},
        "functional_class": {
            "category_set_match": set(functional) == EXPECTED_FUNCTIONAL_CLASSES,
            "record_count_variance": abs(sum(value[0] for value in functional.values()) - EXPECTED_ROWS),
            "rounded_length_variance_km": round(abs(round(sum(value[1] for value in functional.values()), 2) - EXPECTED_LENGTH), 6),
            "urban_umbrella_records": functional.get("Urban Road", (0, 0))[0],
        },
        "pavement_class": category_checks(pavement, EXPECTED_PAVEMENT),
        "condition_category_set_match": set(condition) == set(EXPECTED_CONDITION),
        "condition_rounded_length_variance_km": round(sum(abs(round(condition.get(name, (0, 0))[1], 2) - length) for name, length in EXPECTED_CONDITION.items()), 6),
        "national_road_record_variance": abs(functional.get("National Roads", (0, 0))[0] - 7_219),
        "national_road_length_variance_km": round(abs(round(functional.get("National Roads", (0, 0))[1], 2) - 22_205.38), 6),
    }

    map_meta = web.get("metadata", {})
    map_properties = pd.DataFrame(feature.get("properties", {}) for feature in web.get("features", []))
    web_checks = {
        "metadata_record_count_variance": abs(int(map_meta.get("source_feature_count", 0)) - EXPECTED_ROWS),
        "metadata_published_length_variance_km": round(abs(float(map_meta.get("published_length_km", 0)) - EXPECTED_LENGTH), 6),
        "metadata_national_length_variance_km": round(abs(round(float(map_meta.get("national_road_length_km", 0)), 2) - 22_205.38), 6),
        "functional_categories_match": set(map_properties["functional_class"].dropna()) == EXPECTED_FUNCTIONAL_CLASSES,
        "pavement_categories_match": set(map_properties["pavement_class"].dropna()) == set(EXPECTED_PAVEMENT),
        "condition_categories_match": set(map_properties["condition"].dropna()) == set(EXPECTED_CONDITION),
        "missing_thematic_properties": {field: missing(map_properties[field]) for field in ["functional_class", "pavement_class", "condition", "district", "region", "government_authority"]},
        "manifest_tile_count_variance": abs(int(manifest.get("tile_count", 0)) - len(manifest.get("tiles", []))),
        "missing_detail_tile_files": sum(not (ROOT / str(tile["url"]).replace("./", "")).exists() for tile in manifest.get("tiles", [])),
    }

    traffic = analysis.get("traffic_2026", {})
    grouped_analysis = analysis.get("grouped_clustered_2026", {})
    traffic_series = ["aadt_band", "adt_excluding_motorcycles_band", "motorcycle_adt_band", "heavy_vehicle_adt_band", "mean_speed_band"]
    analysis_checks = {
        "published_total_variance_km": round(abs(float(analysis.get("published_total_length_km", 0)) - EXPECTED_LENGTH), 6),
        "missing_required_traffic_series": sorted(set(traffic_series) - set(traffic)),
        "traffic_series_length_variance_km": {key: round(abs(sum(float(item.get("length_km", 0)) for item in traffic.get(key, [])) - source_length), 6) for key in traffic_series},
        "grouped_record_count_variance": abs(int(grouped_analysis.get("source_record_count", 0)) - EXPECTED_ROWS),
        "grouped_length_variance_km": round(abs(float(grouped_analysis.get("geometry_length_km", 0)) - source_length), 6),
        "missing_cluster_dimensions": sorted({"surface", "functional_class", "pavement_class", "condition"} - set(grouped_analysis.get("dimensions", {}))),
    }

    link_ids = ducar["link_id"].astype(str).str.strip()
    road_names = ducar["road_name"].astype(str).str.strip()
    preview_names = pd.Series([feature.get("properties", {}).get("road_name", "") for feature in preview.get("features", [])], dtype="string")
    preview_ids = pd.Series([feature.get("properties", {}).get("link_id", "") for feature in preview.get("features", [])], dtype="string")
    name_checks = {
        "governed_link_count_variance": abs(len(ducar) - 7_733),
        "blank_link_ids": missing(ducar["link_id"]),
        "invalid_official_link_ids": int((~link_ids.str.fullmatch(ROAD_ID)).sum()),
        "duplicate_link_ids": int(link_ids.duplicated().sum()),
        "blank_road_names": missing(ducar["road_name"]),
        "duplicate_road_names": int(road_names.str.casefold().duplicated().sum()),
        "visible_link_id_suffixes": int(road_names.str.contains(VISIBLE_ID_SUFFIX).sum()),
        "missing_intermediate_place_names": missing(ducar["intermediate_place_names"]),
        "map_preview_record_variance": abs(len(preview_names) - len(ducar)),
        "map_preview_blank_road_names": missing(preview_names),
        "map_preview_duplicate_road_names": int(preview_names.str.casefold().duplicated().sum()),
        "map_preview_name_mismatches": int(sum(dict(zip(link_ids, road_names)).get(link_id, "") != road_name for link_id, road_name in zip(preview_ids, preview_names))),
    }

    with sqlite3.connect(DATA / "ducar_enterprise_unified.sqlite") as connection:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    components = [GIS / f"DUCAR_Verified_Traffic_Safety_Register{suffix}" for suffix in [".shp", ".shx", ".dbf", ".prj", ".cpg"]]
    delivery_checks = {"sqlite_integrity": integrity, "missing_arcgis_components": [path.name for path in components if not path.exists()]}

    def valid(value: object) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return abs(value) < 1e-6
        if isinstance(value, list):
            return not value
        if isinstance(value, dict):
            return all(valid(item) for item in value.values())
        return value == "ok"

    sections = {"corrected_source": corrected_checks, "web_map": web_checks, "analysis": analysis_checks, "road_names": name_checks, "delivery": delivery_checks}
    report = {
        "audit_year": 2026,
        "scope": "Corrected 404,047-way full vehicular network and governed DUCAR link register",
        "status": "PASS" if all(valid(section) for section in sections.values()) else "REVIEW",
        "authoritative_population": {"ways": len(source), "length_km_raw": round(source_length, 6), "length_km_published": EXPECTED_LENGTH, "districts": source["DISTRICT"].nunique(), "regions": source["REGION"].nunique()},
        **sections,
    }
    OUTPUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
