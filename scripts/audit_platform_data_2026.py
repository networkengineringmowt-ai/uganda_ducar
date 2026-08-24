from __future__ import annotations

"""Run reproducible cross-register completeness and consistency checks."""

import json
from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUTPUT = DATA / "platform_data_accuracy_audit_2026.json"
EMPTY = {"", "nan", "none", "null", "not supplied", "unclassified", "unknown"}


def missing(series: pd.Series) -> int:
    return int((series.isna() | series.astype(str).str.strip().str.lower().isin(EMPTY)).sum())


def negative(frame: pd.DataFrame, fields: list[str]) -> int:
    return int(sum((pd.to_numeric(frame[field], errors="coerce") < 0).sum() for field in fields if field in frame))


def coordinate_errors(frame: pd.DataFrame) -> int:
    x1 = pd.to_numeric(frame["start_x_coordinate_dd"], errors="coerce")
    x2 = pd.to_numeric(frame["end_x_coordinate_dd"], errors="coerce")
    y1 = pd.to_numeric(frame["start_y_coordinate_dd"], errors="coerce")
    y2 = pd.to_numeric(frame["end_y_coordinate_dd"], errors="coerce")
    return int((~x1.between(29, 36) | ~x2.between(29, 36) | ~y1.between(-2, 5) | ~y2.between(-2, 5)).sum())


def main() -> None:
    source = pd.read_csv(DATA / "hotosm_vehicular_link_attributes.csv.gz", low_memory=False)
    routes = pd.read_csv(DATA / "hotosm_vehicular_route_register.csv.gz", low_memory=False)
    ducar = pd.read_csv(DATA / "ducar_link_register.csv", low_memory=False)
    national = json.loads((DATA / "national_road_accuracy_audit_2026.json").read_text(encoding="utf-8"))
    web = json.loads((DATA / "hotosm_vehicular_map.geojson").read_text(encoding="utf-8"))
    web_rows = pd.DataFrame(feature["properties"] for feature in web["features"])

    core = ["road_name", "surface", "pavement_class", "condition", "region", "district", "county", "subcounty", "parish", "registry_aadt", "registry_pcu", "start_x_coordinate_dd", "start_y_coordinate_dd", "end_x_coordinate_dd", "end_y_coordinate_dd"]
    traffic = [field for field in source if field.startswith("adt_")] + ["registry_aadt", "registry_pcu", "speed_mean_kmh", "speed_limit_kmh", "speed_p85_kmh", "speed_over_limit_pct", "heavy_vehicle_overload_rate_pct", "overloaded_heavy_vehicle_adt", "estimated_overload_tonnes_day", "annual_crashes_estimate", "annual_fatal_crashes_estimate", "annual_serious_crashes_estimate", "annual_minor_crashes_estimate"]
    class_fields = ["adt_motorcycles", "adt_passenger_cars", "adt_taxis", "adt_minibuses", "adt_large_buses", "adt_light_goods", "adt_medium_goods", "adt_heavy_goods", "adt_articulated_trucks", "adt_tractors", "adt_special_vehicles", "adt_other_motorised"]
    class_sum = source[class_fields].apply(pd.to_numeric, errors="coerce").sum(axis=1)
    aadt = pd.to_numeric(source["adt_total"], errors="coerce")
    excluding = pd.to_numeric(source["adt_excluding_motorcycles"], errors="coerce")
    motorcycles = pd.to_numeric(source["adt_motorcycles"], errors="coerce")

    report = {
        "audit_year": 2026,
        "status": "PASS" if all(missing(source[field]) == 0 for field in core) else "REVIEW",
        "scope": {
            "hotosm_source_segments": int(len(source)),
            "merged_routes": int(len(routes)),
            "ducar_links": int(len(ducar)),
            "national_register_links": national["records"],
            "hotosm_geometry_length_km": round(float(pd.to_numeric(source["length_km"], errors="coerce").sum()), 6),
            "national_registry_length_km": national["registry_length_km"],
            "national_geometry_length_km": national["geometry_length_km"],
        },
        "core_missing_records": {field: missing(source[field]) for field in core},
        "categorical_domains": {
            "surface": source["surface"].value_counts().to_dict(),
            "pavement_class": source["pavement_class"].value_counts().to_dict(),
            "condition": source["condition"].value_counts().to_dict(),
        },
        "web_map_missing_records": {field: missing(web_rows[field]) for field in ["road_name", "surface", "pavement_class", "condition", "region", "district", "county", "subcounty", "parish", "registry_aadt"]},
        "consistency_checks": {
            "noncanonical_surface_records": int((~source["surface"].isin(["Bituminous", "Concrete", "Gravel", "Earth"])).sum()),
            "pavement_surface_mismatch_records": int((((source["surface"].isin(["Bituminous", "Concrete"])) & source["pavement_class"].ne("Paved")) | ((source["surface"].isin(["Gravel", "Earth"])) & source["pavement_class"].ne("Unpaved"))).sum()),
            "invalid_condition_records": int((~source["condition"].isin(["Good", "Fair", "Poor"])).sum()),
            "negative_traffic_or_safety_values": negative(source, traffic),
            "traffic_class_sum_mismatch_records": int((~np.isclose(class_sum, aadt, atol=1)).sum()),
            "excluding_motorcycle_mismatch_records": int((~np.isclose(excluding, aadt - motorcycles, atol=1)).sum()),
            "coordinate_range_error_records": coordinate_errors(source),
            "blank_ducar_link_ids": missing(ducar["link_id"]),
            "duplicate_ducar_link_ids": int(ducar["link_id"].duplicated().sum()),
            "blank_route_ids": missing(routes["route_id"]),
            "duplicate_route_ids": int(routes["route_id"].duplicated().sum()),
        },
        "provenance_policy": "Observed/source values are retained. Completed values carry status, method, confidence and assignment-basis fields; evidence scopes are never rescaled to force agreement.",
        "national_register_audit": national,
    }
    report["status"] = "PASS" if all(value == 0 for value in report["core_missing_records"].values()) and all(value == 0 for value in report["web_map_missing_records"].values()) and all(value == 0 for value in report["consistency_checks"].values()) else "REVIEW"
    OUTPUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
