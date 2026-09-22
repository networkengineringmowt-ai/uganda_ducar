from __future__ import annotations

"""Publish the complete ArcGIS pavement reconciliation to web summaries.

The public site previously inherited pavement totals from an incomplete export.
This sync reads the 404,047-record ArcGIS master, preserves the explicit MoWT
surface rule, and updates every compact web summary that reports pavement.
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pyogrio


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
GDB = ROOT.parent / "DUCAR_Final_Deliverables_2026" / "07_ArcGIS_Pro_Package" / "DUCAR_ArcGIS_Pro_2026.gdb"
ANALYSIS = DATA / "hotosm_vehicular_analysis.json"
APPROVED = DATA / "approved_network_inventory_2026.json"
RECONCILIATION = DATA / "arcgis_ready_complete_network_reconciliation_2026.json"
GLOBAL = DATA / "global_country_matrix.json"
MIND_MAP = DATA / "ducar_site_mind_map.json"
PLATFORM_AUDIT = DATA / "platform_data_accuracy_audit_2026.json"

EXPECTED_ROWS = 404_047
EXPECTED_LENGTH_KM = 248_616.15
MINIMUM_PAVED_KM = 7_000.0
SURFACE_ORDER = ["Bituminous", "Concrete", "Gravel", "Earth"]
PAVEMENT_ORDER = ["Paved", "Unpaved"]
MEAN_FIELDS = [
    "registry_aadt", "registry_pcu", "adt_total", "adt_excluding_motorcycles",
    "adt_motorcycles", "adt_passenger_cars", "adt_taxis", "adt_minibuses",
    "adt_large_buses", "adt_light_goods", "adt_medium_goods", "adt_heavy_goods",
    "adt_articulated_trucks", "adt_tractors", "adt_special_vehicles",
    "adt_other_motorised", "heavy_vehicle_adt", "speed_mean_kmh",
    "speed_limit_kmh", "speed_p85_kmh", "speed_over_limit_pct",
    "heavy_vehicle_overload_rate_pct", "overloaded_heavy_vehicle_adt",
    "estimated_overload_tonnes_day", "crash_rate_per_100m_vehicle_km",
]
SUM_FIELDS = [
    "annual_crashes_estimate", "annual_fatal_crashes_estimate",
    "annual_serious_crashes_estimate", "annual_minor_crashes_estimate",
]


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def length_sum(frame: pd.DataFrame, mask: pd.Series | None = None) -> float:
    values = frame["length_km"] if mask is None else frame.loc[mask, "length_km"]
    return float(pd.to_numeric(values, errors="coerce").fillna(0).sum())


def weighted_mean(frame: pd.DataFrame, field: str) -> float:
    values = pd.to_numeric(frame[field], errors="coerce")
    weights = pd.to_numeric(frame["length_km"], errors="coerce").fillna(0)
    valid = values.notna() & weights.gt(0)
    return float(np.average(values[valid], weights=weights[valid])) if valid.any() else 0.0


def compact_summary(frame: pd.DataFrame, field: str, order: list[str]) -> list[dict]:
    records = []
    for category in order:
        group = frame.loc[frame[field].eq(category)]
        length = length_sum(group)
        paved = length_sum(group, group["pavement_class"].eq("Paved"))
        unpaved = length_sum(group, group["pavement_class"].eq("Unpaved"))
        records.append({
            "category": category,
            "feature_count": int(len(group)),
            "length_km": round(length, 6),
            "paved_km": round(paved, 6),
            "unpaved_km": round(unpaved, 6),
            "unclassified_pavement_km": 0.0,
            "good_condition_km": round(length_sum(group, group["condition"].eq("Good")), 6),
            "fair_condition_km": round(length_sum(group, group["condition"].eq("Fair")), 6),
            "poor_condition_km": round(length_sum(group, group["condition"].eq("Poor")), 6),
            "unclassified_condition_km": 0.0,
            "named_feature_count": int(group["road_name"].fillna("").astype(str).str.strip().ne("").sum()),
            "bridge_feature_count": 0,
            "oneway_feature_count": 0,
        })
    return records


def grouped_dimension(frame: pd.DataFrame, field: str, order: list[str]) -> list[dict]:
    records = []
    for category in order:
        group = frame.loc[frame[field].eq(category)]
        length = length_sum(group)
        condition_length = {
            condition: round(length_sum(group, group["condition"].eq(condition)), 6)
            for condition in ["Good", "Fair", "Poor"]
        }
        surface_risk = sum(
            length_sum(group, group["surface"].eq(surface)) * risk
            for surface, risk in {"Concrete": 0, "Bituminous": 25, "Gravel": 75, "Earth": 100}.items()
        ) / max(length, 1e-12)
        records.append({
            "category": category,
            "affected_length_km": round(length, 6),
            "source_record_count": int(len(group)),
            "weighted_mean": {name: round(weighted_mean(group, name), 3) for name in MEAN_FIELDS},
            "sum": {
                name: round(float(pd.to_numeric(group[name], errors="coerce").fillna(0).sum()), 3)
                for name in SUM_FIELDS
            },
            "condition_length_km": condition_length,
            "condition_risk_score": round(
                (condition_length["Fair"] * 50 + condition_length["Poor"] * 100) / max(length, 1e-12), 3
            ),
            "poor_condition_share_pct": round(condition_length["Poor"] / max(length, 1e-12) * 100, 3),
            "surface_risk_score": round(surface_risk, 3),
        })
    return records


def main() -> None:
    if not GDB.exists():
        raise RuntimeError(f"ArcGIS master geodatabase is missing: {GDB}")
    columns = sorted(set(
        ["road_name", "surface", "pavement_class", "condition", "length_km"]
        + MEAN_FIELDS + SUM_FIELDS
    ))
    frame = pyogrio.read_dataframe(GDB, layer="Road_Segment_Master", columns=columns, read_geometry=False)
    frame["length_km"] = pd.to_numeric(frame["length_km"], errors="coerce").fillna(0)
    total_km = length_sum(frame)
    if len(frame) != EXPECTED_ROWS:
        raise RuntimeError(f"Expected {EXPECTED_ROWS:,} records, found {len(frame):,}")
    if abs(total_km - EXPECTED_LENGTH_KM) > 0.02:
        raise RuntimeError(f"Expected {EXPECTED_LENGTH_KM:,.2f} km, found {total_km:,.6f} km")
    rule = frame["surface"].map(lambda value: "Paved" if value in {"Bituminous", "Concrete"} else "Unpaved")
    conflicts = int(rule.ne(frame["pavement_class"]).sum())
    if conflicts:
        raise RuntimeError(f"Found {conflicts:,} surface/pavement contradictions")
    paved_km = length_sum(frame, frame["pavement_class"].eq("Paved"))
    unpaved_km = length_sum(frame, frame["pavement_class"].eq("Unpaved"))
    if paved_km < MINIMUM_PAVED_KM:
        raise RuntimeError(f"Paved length regressed below {MINIMUM_PAVED_KM:,.0f} km: {paved_km:,.6f} km")

    analysis = read_json(ANALYSIS)
    analysis["published_total_length_km"] = round(total_km, 6)
    analysis["total"].update({
        "feature_count": int(len(frame)), "length_km": round(total_km, 6),
        "paved_km": round(paved_km, 6), "unpaved_km": round(unpaved_km, 6),
        "unclassified_pavement_km": 0.0,
    })
    analysis["summaries"]["surface"] = compact_summary(frame, "surface", SURFACE_ORDER)
    analysis["summaries"]["pavement"] = compact_summary(frame, "pavement_class", PAVEMENT_ORDER)
    analysis["derivation_policy"]["pavement"] = (
        "Complete ArcGIS Road_Segment_Master classification: Bituminous and Concrete are Paved; "
        "Gravel and Earth are Unpaved. Observed values are retained and estimates carry an assignment basis."
    )
    analysis["pavement_reconciliation_2026"] = {
        "source_layer": "DUCAR_ArcGIS_Pro_2026.gdb/Road_Segment_Master",
        "source_record_count": int(len(frame)), "source_length_km": round(total_km, 6),
        "paved_record_count": int(frame["pavement_class"].eq("Paved").sum()),
        "paved_length_km": round(paved_km, 6),
        "unpaved_record_count": int(frame["pavement_class"].eq("Unpaved").sum()),
        "unpaved_length_km": round(unpaved_km, 6),
        "surface_pavement_contradictions": conflicts,
        "status": "PASS",
    }
    grouped = analysis.setdefault("grouped_clustered_2026", {}).setdefault("dimensions", {})
    grouped["surface"] = grouped_dimension(frame, "surface", SURFACE_ORDER)
    grouped["pavement_class"] = grouped_dimension(frame, "pavement_class", PAVEMENT_ORDER)
    analysis["grouped_clustered_2026"].update({
        "source": "DUCAR_ArcGIS_Pro_2026.gdb/Road_Segment_Master",
        "population": "All 404,047 reconciled vehicular-road segments; no Top-N selection",
        "geometry_length_km": round(total_km, 6), "source_record_count": int(len(frame)),
    })
    write_json(ANALYSIS, analysis)

    approved = read_json(APPROVED)
    approved["confirmed_all_road_inventory"].update({"length_km": round(total_km, 2), "links": int(len(frame))})
    approved["hotosm_vehicular_inventory"].update({
        "source_line_features": int(len(frame)), "vehicular_features": int(len(frame)),
        "vehicular_length_km": round(total_km, 6), "published_rounded_length_km": round(total_km, 2),
    })
    approved["pavement_reconciliation_2026"] = analysis["pavement_reconciliation_2026"]
    approved["calculation_policy"] = [
        item.replace("248,616.14 km", "248,616.15 km") for item in approved["calculation_policy"]
    ]
    approved["geospatial_reconciliation_policy"]["authoritative_public_length_km"] = round(total_km, 2)
    approved["geospatial_reconciliation_policy"]["public_reporting_rule"] = (
        "Public dashboards use the reconciled 248,616.15 km and 404,047-segment vehicular inventory; "
        "governed Link-ID and source-verification coverage remain explicit in Admin Tools."
    )
    approved["geospatial_reconciliation_policy"]["methodology_note"] = (
        "The authoritative public total is the rounded sum of length_km across all 404,047 "
        "Road_Segment_Master records; pavement is the complete reconciled surface classification."
    )
    write_json(APPROVED, approved)

    reconciliation = read_json(RECONCILIATION)
    reconciliation["segment_length_km"] = round(total_km, 6)
    reconciliation["pavement_reconciliation"] = analysis["pavement_reconciliation_2026"]
    write_json(RECONCILIATION, reconciliation)

    global_matrix = read_json(GLOBAL)
    uganda = next(row for row in global_matrix["rows"] if row.get("country") == "Uganda")
    uganda.update({
        "road_network_km": round(total_km, 2),
        "paved_share_pct": round(paved_km / total_km * 100, 3),
        "paved_road_km": round(paved_km, 6),
        "unpaved_road_km": round(unpaved_km, 6),
        "road_data_source_text": "248,616.15 km reconciled vehicular network; Paved and Unpaved classes complete",
        "road_data_status": "Geometry-derived complete ArcGIS vehicular-road inventory",
        "road_data_source_title": "DUCAR ArcGIS Road Segment Master pavement reconciliation 2026",
        "road_data_source_url": "./data/hotosm_vehicular_analysis.json",
    })
    write_json(GLOBAL, global_matrix)

    mind_map = read_json(MIND_MAP)
    encoded = json.dumps(mind_map, ensure_ascii=False).replace("248,616.14 km", "248,616.15 km")
    write_json(MIND_MAP, json.loads(encoded))

    platform_audit = read_json(PLATFORM_AUDIT)
    platform_audit["authoritative_population"].update({
        "ways": int(len(frame)), "length_km_raw": round(total_km, 6),
        "length_km_published": round(total_km, 2),
    })
    platform_audit["arcgis_complete_geometry_snapshot"]["length_km"] = round(total_km, 6)
    platform_audit["analysis"]["pavement_reconciliation"] = analysis["pavement_reconciliation_2026"]
    write_json(PLATFORM_AUDIT, platform_audit)
    print(json.dumps({
        "status": "PASS", "records": len(frame), "total_km": round(total_km, 6),
        "paved_km": round(paved_km, 6), "unpaved_km": round(unpaved_km, 6),
        "surface_pavement_contradictions": conflicts,
    }, indent=2))


if __name__ == "__main__":
    main()
