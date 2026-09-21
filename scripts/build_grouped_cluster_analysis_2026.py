from __future__ import annotations

"""Build compact full-population matrices for grouped dashboard columns."""

import gzip
import json
from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SOURCE = DATA / "hotosm_vehicular_link_attributes.csv.gz"
ANALYSIS = DATA / "hotosm_vehicular_analysis.json"

DIMENSIONS = {
    "surface": "surface",
    "functional_class": "road_management_class",
    "pavement_class": "pavement_class",
}

FUNCTIONAL_LABELS = {
    "Community-access candidate": "Community Access",
    "Urban/local-road candidate": "Urban / Local",
    "District-road candidate": "District / Collector",
    "National Road Network - Spatially Aligned": "Primary / National",
    "Other Trunk/Primary Candidate": "Other Trunk / Primary",
    "Other vehicular candidate": "Other Vehicular",
}

CATEGORY_ORDER = {
    "surface": ["Concrete", "Bituminous", "Gravel", "Earth"],
    "functional_class": [
        "Community Access",
        "Other Vehicular",
        "Urban / Local",
        "District / Collector",
        "Other Trunk / Primary",
        "Primary / National",
    ],
    "pavement_class": ["Paved", "Unpaved"],
}

MEAN_FIELDS = [
    "registry_aadt",
    "registry_pcu",
    "adt_total",
    "adt_excluding_motorcycles",
    "adt_motorcycles",
    "adt_passenger_cars",
    "adt_taxis",
    "adt_minibuses",
    "adt_large_buses",
    "adt_light_goods",
    "adt_medium_goods",
    "adt_heavy_goods",
    "adt_articulated_trucks",
    "adt_tractors",
    "adt_special_vehicles",
    "adt_other_motorised",
    "heavy_vehicle_adt",
    "speed_mean_kmh",
    "speed_limit_kmh",
    "speed_p85_kmh",
    "speed_over_limit_pct",
    "heavy_vehicle_overload_rate_pct",
    "overloaded_heavy_vehicle_adt",
    "estimated_overload_tonnes_day",
    "crash_rate_per_100m_vehicle_km",
]

SUM_FIELDS = [
    "annual_crashes_estimate",
    "annual_fatal_crashes_estimate",
    "annual_serious_crashes_estimate",
    "annual_minor_crashes_estimate",
]


def weighted_mean(frame: pd.DataFrame, field: str) -> float:
    values = pd.to_numeric(frame[field], errors="coerce")
    weights = pd.to_numeric(frame["length_km"], errors="coerce").fillna(0)
    valid = values.notna() & weights.gt(0)
    if not valid.any():
        return 0.0
    return float(np.average(values[valid], weights=weights[valid]))


def build_dimension(frame: pd.DataFrame, name: str, field: str) -> list[dict]:
    working = frame.copy()
    if name == "functional_class":
        working[field] = working[field].map(FUNCTIONAL_LABELS).fillna(working[field])
    records = []
    for category, group in working.groupby(field, dropna=False, sort=False):
        category = "Not Classified" if pd.isna(category) or not str(category).strip() else str(category)
        length = float(pd.to_numeric(group["length_km"], errors="coerce").fillna(0).sum())
        condition_length = {
            condition: round(
                float(pd.to_numeric(group.loc[group["condition"].eq(condition), "length_km"], errors="coerce").fillna(0).sum()),
                6,
            )
            for condition in ["Good", "Fair", "Poor"]
        }
        poor_share = condition_length["Poor"] / max(length, 1e-12) * 100
        condition_risk = (
            condition_length["Fair"] * 50 + condition_length["Poor"] * 100
        ) / max(length, 1e-12)
        surface_risk = sum(
            float(pd.to_numeric(group.loc[group["surface"].eq(surface), "length_km"], errors="coerce").fillna(0).sum()) * risk
            for surface, risk in {"Concrete": 0, "Bituminous": 25, "Gravel": 75, "Earth": 100}.items()
        ) / max(length, 1e-12)
        records.append(
            {
                "category": category,
                "affected_length_km": round(length, 6),
                "source_record_count": int(len(group)),
                "weighted_mean": {field_name: round(weighted_mean(group, field_name), 3) for field_name in MEAN_FIELDS},
                "sum": {
                    field_name: round(float(pd.to_numeric(group[field_name], errors="coerce").fillna(0).sum()), 3)
                    for field_name in SUM_FIELDS
                },
                "condition_length_km": condition_length,
                "condition_risk_score": round(condition_risk, 3),
                "poor_condition_share_pct": round(poor_share, 3),
                "surface_risk_score": round(surface_risk, 3),
            }
        )
    order = {value: index for index, value in enumerate(CATEGORY_ORDER[name])}
    return sorted(records, key=lambda item: (order.get(item["category"], len(order)), item["category"]))


def main() -> None:
    usecols = sorted(set(DIMENSIONS.values()) | {"condition", "surface", "length_km"} | set(MEAN_FIELDS) | set(SUM_FIELDS))
    with gzip.open(SOURCE, "rt", encoding="utf-8-sig") as stream:
        frame = pd.read_csv(stream, usecols=usecols, low_memory=False)
    for field in ["length_km", *MEAN_FIELDS, *SUM_FIELDS]:
        frame[field] = pd.to_numeric(frame[field], errors="coerce")
    payload = json.loads(ANALYSIS.read_text(encoding="utf-8"))
    payload["grouped_clustered_2026"] = {
        "source": str(SOURCE),
        "population": "All 404,047 vehicular HOTOSM source records; no Top-N selection",
        "geometry_length_km": round(float(frame["length_km"].fillna(0).sum()), 6),
        "source_record_count": int(len(frame)),
        "aggregation": "Affected length sums; length-weighted means for traffic, speed and rate metrics; annual event estimates are summed.",
        "dimensions": {name: build_dimension(frame, name, field) for name, field in DIMENSIONS.items()},
    }
    ANALYSIS.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({
        "records": len(frame),
        "length_km": payload["grouped_clustered_2026"]["geometry_length_km"],
        "dimensions": {name: len(rows) for name, rows in payload["grouped_clustered_2026"]["dimensions"].items()},
    }, indent=2))


if __name__ == "__main__":
    main()
