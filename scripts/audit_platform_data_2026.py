from __future__ import annotations

"""Audit the corrected full-network web data, governed link names and GIS sync."""

import gzip
import json
import re
import sqlite3
from pathlib import Path

import pandas as pd
import pyogrio


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
GIS = ROOT.parent / "DUCAR_Final_Deliverables_2026" / "04_GIS_Shapefiles"
SOURCE_PARTS = GIS / "DUCAR_Full_Vehicular_Network_HOTOSM_parts"
SOURCE_PATTERN = "DUCAR_Full_Vehicular_Network_HOTOSM_part??of30.shp"
ARCGIS_GDB = ROOT.parent / "DUCAR_Final_Deliverables_2026" / "07_ArcGIS_Pro_Package" / "DUCAR_ArcGIS_Pro_2026.gdb"
OUTPUT = DATA / "platform_data_accuracy_audit_2026.json"
EMPTY = {
    "", "nan", "none", "null", "not supplied", "not reported",
    "not applicable", "unclassified", "unknown",
}
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


def normalized(series: pd.Series) -> pd.Series:
    return series.fillna("").astype(str).str.strip().str.casefold()


def pavement_surface_conflicts(frame: pd.DataFrame) -> int:
    surface = normalized(frame["SURFACE"])
    pavement = normalized(frame["PAVED_CLS"])
    paved_surface = surface.isin({"bituminous", "concrete", "asphalt", "paved"})
    unpaved_surface = surface.isin({"gravel", "earth", "unpaved", "dirt", "ground"})
    return int(((paved_surface & pavement.ne("paved")) | (unpaved_surface & pavement.ne("unpaved"))).sum())


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
    full_link_ids = source["LINK_ID"].fillna("").astype(str).str.strip()
    full_road_names = source["ROAD_NAME"].fillna("").astype(str).str.strip()
    source_paths = sorted(SOURCE_PARTS.glob(SOURCE_PATTERN))
    source_part_counts = {path.name: int(pyogrio.read_info(path)["features"]) for path in source_paths}
    source_snapshot_rows = sum(source_part_counts.values())
    source_lineage_checks = {
        "source_part_count_variance": abs(len(source_paths) - 30),
        "source_feature_count_variance_from_published": abs(source_snapshot_rows - len(source)),
        "source_feature_count_variance_from_expected": abs(source_snapshot_rows - EXPECTED_ROWS),
        "published_feature_count_variance_from_expected": abs(len(source) - EXPECTED_ROWS),
    }
    gdb_layers = {str(name) for name, _ in pyogrio.list_layers(ARCGIS_GDB)} if ARCGIS_GDB.exists() else set()
    required_gdb_layers = {"Road_Segment_Master", "Road_Network", "Road_Traffic", "Road_Condition"}
    if required_gdb_layers.issubset(gdb_layers):
        gdb_network = pyogrio.read_dataframe(
            ARCGIS_GDB,
            layer="Road_Network",
            columns=[
                "osm_feature_id", "road_name_display", "functional_class", "surface",
                "pavement_class", "condition", "length_km", "start_x_coordinate_dd",
                "start_y_coordinate_dd", "end_x_coordinate_dd", "end_y_coordinate_dd",
            ],
            read_geometry=False,
        )
        gdb_length = float(pd.to_numeric(gdb_network["length_km"], errors="coerce").sum())
        gdb_classes = set(gdb_network["functional_class"].dropna().astype(str))
        traffic_components = [
            "adt_motorcycles", "adt_passenger_cars", "adt_taxis", "adt_minibuses",
            "adt_large_buses", "adt_light_goods", "adt_medium_goods", "adt_heavy_goods",
            "adt_articulated_trucks", "adt_tractors", "adt_special_vehicles", "adt_other_motorised",
        ]
        gdb_traffic = pyogrio.read_dataframe(
            ARCGIS_GDB,
            layer="Road_Traffic",
            columns=[
                "adt_total", "adt_excluding_motorcycles", "heavy_vehicle_adt",
                "traffic_aadt_lower", "traffic_aadt_upper", "traffic_projection_year",
                "annual_crashes_estimate", "annual_fatal_crashes_estimate",
                "annual_serious_crashes_estimate", "annual_minor_crashes_estimate",
                *traffic_components,
            ],
            read_geometry=False,
        )
        component_sum = gdb_traffic[traffic_components].sum(axis=1)
        crash_sum = gdb_traffic[
            ["annual_fatal_crashes_estimate", "annual_serious_crashes_estimate", "annual_minor_crashes_estimate"]
        ].sum(axis=1)
        gdb_recovery_checks = {
            "missing_required_layers": sorted(required_gdb_layers - gdb_layers),
            "feature_count_variance_from_expected": abs(len(gdb_network) - EXPECTED_ROWS),
            "duplicate_osm_feature_ids": int(gdb_network["osm_feature_id"].duplicated(keep=False).sum()),
            "missing_display_road_names": missing(gdb_network["road_name_display"]),
            "missing_surface": missing(gdb_network["surface"]),
            "missing_pavement_class": missing(gdb_network["pavement_class"]),
            "missing_condition": missing(gdb_network["condition"]),
            "missing_endpoint_coordinates": {
                field: missing(gdb_network[field])
                for field in ["start_x_coordinate_dd", "start_y_coordinate_dd", "end_x_coordinate_dd", "end_y_coordinate_dd"]
            },
            "geometry_length_within_two_hundredths_km": abs(gdb_length - EXPECTED_LENGTH) <= 0.02,
            "functional_classes_requiring_seven_class_reconciliation": sorted(gdb_classes - EXPECTED_FUNCTIONAL_CLASSES),
            "traffic_component_sum_mismatches": int((component_sum != gdb_traffic["adt_total"]).sum()),
            "adt_excluding_motorcycles_mismatches": int(
                ((gdb_traffic["adt_total"] - gdb_traffic["adt_motorcycles"]) != gdb_traffic["adt_excluding_motorcycles"]).sum()
            ),
            "heavy_vehicle_adt_exceeds_non_motorcycle_adt": int(
                (gdb_traffic["heavy_vehicle_adt"] > gdb_traffic["adt_excluding_motorcycles"]).sum()
            ),
            "aadt_outside_stated_confidence_bounds": int(
                (
                    (gdb_traffic["traffic_aadt_lower"] > gdb_traffic["adt_total"])
                    | (gdb_traffic["traffic_aadt_upper"] < gdb_traffic["adt_total"])
                ).sum()
            ),
            "crash_severity_sum_mismatches": int((crash_sum != gdb_traffic["annual_crashes_estimate"]).sum()),
            "non_2026_traffic_projection_rows": int((gdb_traffic["traffic_projection_year"] != 2026).sum()),
        }
        gdb_recovery_statistics = {
            "ways": len(gdb_network),
            "unique_osm_feature_ids": int(gdb_network["osm_feature_id"].nunique(dropna=True)),
            "geometry_length_km": round(gdb_length, 6),
            "functional_classes": sorted(gdb_classes),
        }
    else:
        gdb_recovery_checks = {"missing_required_layers": sorted(required_gdb_layers - gdb_layers)}
        gdb_recovery_statistics = {"ways": 0, "unique_osm_feature_ids": 0, "geometry_length_km": 0.0, "functional_classes": []}
    corrected_checks = {
        "record_count_variance": abs(len(source) - EXPECTED_ROWS),
        "published_length_variance_km": round(abs(round(source_length, 2) - EXPECTED_LENGTH), 6),
        "district_count_variance": abs(source["DISTRICT"].nunique() - 135),
        "region_count_variance": abs(source["REGION"].nunique() - 6),
        "missing_required_attributes": {field: missing(source[field]) for field in ["LINK_ID", "ROAD_NAME", "SURFACE", "FUNC_CLASS", "PAVED_CLS", "COND", "DISTRICT", "REGION", "GOV_NAME"]},
        "duplicate_full_network_link_ids": int(full_link_ids.duplicated(keep=False).sum()),
        "invalid_official_full_network_link_ids": int((~full_link_ids.str.fullmatch(ROAD_ID)).sum()),
        "duplicate_full_network_road_names": int(full_road_names.str.casefold().duplicated(keep=False).sum()),
        "pavement_surface_contradictions": pavement_surface_conflicts(source),
        "national_roads_without_named_authority": int(
            ((source["FUNC_CLASS"] == "National Roads") & normalized(source["GOV_NAME"]).isin(EMPTY)).sum()
        ),
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

    sections = {
        "source_lineage": source_lineage_checks,
        "arcgis_complete_geometry_recovery": gdb_recovery_checks,
        "corrected_source": corrected_checks,
        "web_map": web_checks,
        "analysis": analysis_checks,
        "road_names": name_checks,
        "delivery": delivery_checks,
    }
    report = {
        "audit_year": 2026,
        "scope": "Published 404,047-way full vehicular network, current 30-part GIS source snapshot and governed DUCAR link register",
        "status": "PASS" if all(valid(section) for section in sections.values()) else "REVIEW",
        "authoritative_population": {"ways": len(source), "length_km_raw": round(source_length, 6), "length_km_published": EXPECTED_LENGTH, "districts": source["DISTRICT"].nunique(), "regions": source["REGION"].nunique()},
        "current_source_snapshot": {
            "parts": len(source_paths),
            "ways": source_snapshot_rows,
            "difference_from_published_ways": source_snapshot_rows - len(source),
            "part_feature_counts": source_part_counts,
        },
        "arcgis_complete_geometry_snapshot": gdb_recovery_statistics,
        **sections,
    }
    OUTPUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
