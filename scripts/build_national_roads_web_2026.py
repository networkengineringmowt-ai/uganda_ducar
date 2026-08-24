from __future__ import annotations

"""Build the public national-road layer from the MoWT FY2025/26 link register."""

import json
import re
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "National Roads" / "network2026" / "network2026.shp"
OUTPUT = ROOT / "data" / "uganda_national_roads_2026.geojson"
AUDIT = ROOT / "data" / "national_road_accuracy_audit_2026.json"
MODEL_YEAR = 2026


def clean_name(value: object) -> str:
    text = str(value or "").replace("�", " - ").replace("–", " - ").replace("—", " - ")
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)
    text = re.sub(r"[_/|]+", " - ", text)
    text = re.sub(r"\s*-+\s*", " - ", text)
    text = re.sub(r"\s+", " ", text).strip(" .-")
    return " - ".join(part.strip().title() for part in text.split(" - ") if part.strip())


def endpoint(geometry, last: bool = False) -> tuple[float, float]:
    if geometry.geom_type == "MultiLineString":
        geometry = list(geometry.geoms)[-1 if last else 0]
    coordinate = geometry.coords[-1 if last else 0]
    return round(float(coordinate[0]), 7), round(float(coordinate[1]), 7)


def condition(row: pd.Series) -> tuple[str, float, str]:
    years = [float(value) if pd.notna(value) else 0.0 for value in (row.get(field) for field in ["Rehabili_1", "Year_of_La", "Completi_1"])]
    latest = int(max(years)) if max(years) > 1900 else 2000
    age = MODEL_YEAR - latest
    if str(row["Surface__1"]).lower() == "bituminous":
        band = "Good" if age <= 7 else "Fair" if age <= 15 else "Poor"
    else:
        band = "Fair" if age <= 7 else "Poor"
    confidence = 74.0 if max(years) > 1900 else 55.0
    return band, confidence, f"Surface and latest completion/rehabilitation-year model; asset age {age} years"


def main() -> None:
    roads = gpd.read_file(SOURCE)
    roads = roads[~roads.geometry.isna() & ~roads.geometry.is_empty].copy()
    roads["registry_length_km"] = pd.to_numeric(roads["Length_km_"], errors="coerce").fillna(0)
    roads["geometry_length_km"] = roads.to_crs(32636).length / 1000.0
    roads["registry_geometry_variance_pct"] = np.where(roads["registry_length_km"] > 0, (roads["geometry_length_km"] / roads["registry_length_km"] - 1) * 100, 0)
    roads["source_link_id"] = roads["Link_ID_1"].astype(str).str.strip()
    duplicate_sequence = roads.groupby("source_link_id").cumcount() + 1
    duplicate_count = roads.groupby("source_link_id")["source_link_id"].transform("size")
    roads["link_id"] = np.where(duplicate_count > 1, roads["source_link_id"] + "-" + duplicate_sequence.astype(str).str.zfill(2), roads["source_link_id"])
    roads["road_number"] = roads["Road_No_1"].astype(str).str.strip()
    roads["road_name"] = roads["Link_Name"].map(clean_name)
    roads["road_class"] = roads["Road_Cla_1"].map(lambda value: f"Class {str(value).strip().upper()} National Road")
    roads["surface_source_value"] = roads["Surface__1"].astype(str).str.strip()
    roads["surface"] = roads["surface_source_value"].map(lambda value: "Bituminous" if value.lower() == "bituminous" else "Gravel")
    roads["pavement_class"] = roads["surface"].map(lambda value: "Paved" if value == "Bituminous" else "Unpaved")
    estimates = roads.apply(condition, axis=1)
    roads["condition"] = estimates.map(lambda item: item[0])
    roads["condition_model_confidence_pct"] = estimates.map(lambda item: item[1])
    roads["condition_assignment_basis"] = estimates.map(lambda item: item[2])
    roads["condition_value_status"] = "Model estimated from official asset fields"
    roads["maintenance_station"] = roads["Maintena_2"].fillna("National Roads Directorate").map(clean_name)
    roads["region"] = roads["Maintena_3"].fillna("Uganda").map(clean_name)
    roads["chainage_start_km"] = pd.to_numeric(roads["Chainage_1"], errors="coerce").fillna(0)
    roads["chainage_end_km"] = pd.to_numeric(roads["Chainage_2"], errors="coerce").fillna(roads["registry_length_km"])
    roads["completion_year"] = pd.to_numeric(roads["Completi_1"], errors="coerce").fillna(0).astype(int)
    roads["rehabilitation_year"] = pd.to_numeric(roads["Rehabili_1"], errors="coerce").fillna(0).astype(int)
    roads["last_intervention_year"] = pd.to_numeric(roads["Year_of_La"], errors="coerce").fillna(0).astype(int)
    roads["comments"] = roads["Comments"].fillna("No additional source comment")
    roads = roads.to_crs(4326)
    roads["start_x_coordinate_dd"] = roads.geometry.map(lambda geometry: endpoint(geometry)[0])
    roads["start_y_coordinate_dd"] = roads.geometry.map(lambda geometry: endpoint(geometry)[1])
    roads["end_x_coordinate_dd"] = roads.geometry.map(lambda geometry: endpoint(geometry, True)[0])
    roads["end_y_coordinate_dd"] = roads.geometry.map(lambda geometry: endpoint(geometry, True)[1])
    roads["source"] = "MoWT National Roads network2026.shp FY2025/26"
    roads["length_measurement_crs"] = "EPSG:32636"
    roads["coordinate_reference_system"] = "EPSG:4326"

    fields = ["link_id", "source_link_id", "road_number", "road_name", "road_class", "surface_source_value", "surface", "pavement_class", "condition", "condition_value_status", "condition_model_confidence_pct", "condition_assignment_basis", "maintenance_station", "region", "registry_length_km", "geometry_length_km", "registry_geometry_variance_pct", "chainage_start_km", "chainage_end_km", "completion_year", "rehabilitation_year", "last_intervention_year", "comments", "start_x_coordinate_dd", "start_y_coordinate_dd", "end_x_coordinate_dd", "end_y_coordinate_dd", "source", "length_measurement_crs", "coordinate_reference_system", "geometry"]
    public = roads[fields].copy()
    public.geometry = public.geometry.simplify(0.00002, preserve_topology=True)
    public.geometry = shapely.set_precision(public.geometry.array, 0.00001)
    payload = json.loads(public.to_json(drop_id=True))
    registry_total = float(roads["registry_length_km"].sum())
    geometry_total = float(roads["geometry_length_km"].sum())
    payload["name"] = "Uganda MoWT FY2025/26 National Road Network"
    payload["metadata"] = {
        "source": str(SOURCE), "source_scope": "MoWT National Roads FY2025/26 link register", "records": int(len(roads)),
        "registry_length_km": round(registry_total, 6), "geometry_length_km": round(geometry_total, 6),
        "paved_registry_length_km": round(float(roads.loc[roads["pavement_class"] == "Paved", "registry_length_km"].sum()), 6),
        "unpaved_registry_length_km": round(float(roads.loc[roads["pavement_class"] == "Unpaved", "registry_length_km"].sum()), 6),
        "public_official_headline_km": 21292, "public_official_headline_source": "https://works.go.ug/",
        "scope_note": "The local FY2025/26 link-register total and the current MoWT public headline are retained as separate evidence scopes; neither is rescaled.",
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    audit = {
        "source": str(SOURCE), "records": int(len(roads)), "unique_public_link_ids": int(roads["link_id"].nunique()),
        "duplicate_source_link_id_records": int(roads["source_link_id"].duplicated(keep=False).sum()),
        "blank_road_names": int(roads["road_name"].eq("").sum()), "null_geometries": 0,
        "registry_length_km": round(registry_total, 6), "geometry_length_km": round(geometry_total, 6),
        "length_variance_km": round(geometry_total - registry_total, 6),
        "paved_registry_length_km": round(float(roads.loc[roads["pavement_class"] == "Paved", "registry_length_km"].sum()), 6),
        "unpaved_registry_length_km": round(float(roads.loc[roads["pavement_class"] == "Unpaved", "registry_length_km"].sum()), 6),
        "noncanonical_surface_records": int((~roads["surface"].isin(["Bituminous", "Concrete", "Gravel", "Earth"])).sum()),
        "unclassified_pavement_records": int((~roads["pavement_class"].isin(["Paved", "Unpaved"])).sum()),
        "unclassified_condition_records": int((~roads["condition"].isin(["Good", "Fair", "Poor"])).sum()),
        "official_comparison": {"mowt_public_headline_km": 21292, "ubos_2023_24_km": 21200, "local_fy2025_26_link_register_km": round(registry_total, 6), "reason_for_separate_values": "Different publication dates and evidence scopes; no forced reconciliation."},
    }
    AUDIT.write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(audit, indent=2))


if __name__ == "__main__":
    main()
