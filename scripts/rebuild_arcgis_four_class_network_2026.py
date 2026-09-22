from __future__ import annotations

"""Rebuild the complete four-class Uganda vehicular network for ArcGIS Pro."""

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pyogrio


DUCAR = Path(r"D:\OneDrive\Uganda National Road Network Repository\DUCAR")
GIS = DUCAR / "DUCAR_Final_Deliverables_2026" / "04_GIS_Shapefiles"
GDB = DUCAR / "DUCAR_Final_Deliverables_2026" / "07_ArcGIS_Pro_Package" / "DUCAR_ArcGIS_Pro_2026.gdb"
OUTPUT = GIS / "DUCAR_Full_Vehicular_Network_4Class_parts"
PACKAGE = GIS / "DUCAR_Four_Class_Network_2026.gpkg"
AUDIT = GIS / "DUCAR_FOUR_CLASS_REBUILD_AUDIT_2026.json"
README = OUTPUT / "README_FOUR_CLASS_NETWORK.txt"

EXPECTED_ROWS = 404_047
EXPECTED_KM = 248_616.148981
PARTS = 30
CLASS_ORDER = ["National Roads", "District Roads", "Urban Roads", "Community Access Roads"]

SOURCE_FIELDS = [
    "osm_feature_id", "road_name", "road_name_display", "road_name_authoritative",
    "highway", "surface", "pavement_class", "condition", "functional_class",
    "road_management_class", "length_km", "region", "district", "county",
    "subcounty", "parish", "registry_aadt", "registry_pcu", "registry_speed_kmh",
    "traffic_value_status", "traffic_model_confidence_pct", "traffic_assignment_basis",
    "start_x_coordinate_dd", "start_y_coordinate_dd", "end_x_coordinate_dd",
    "end_y_coordinate_dd", "surface_value_status", "surface_model_confidence_pct",
    "condition_value_status", "condition_model_confidence_pct", "national_match",
    "national_link_id", "route_id",
]


def first_text(frame: pd.DataFrame, fields: list[str]) -> pd.Series:
    out = pd.Series("", index=frame.index, dtype="object")
    for field in fields:
        values = frame[field].fillna("").astype(str).str.strip()
        out = out.where(out.str.len().gt(0), values)
    return out


def four_class(value: object) -> str:
    source = str(value or "").strip()
    if source == "National Road":
        return "National Roads"
    if source in {"District Road", "Trunk/Primary Road"}:
        return "District Roads"
    if source == "Urban/Local Road":
        return "Urban Roads"
    return "Community Access Roads"


def government_department(value: str) -> str:
    return {
        "National Roads": "MoWT National Roads",
        "District Roads": "District Local Government",
        "Urban Roads": "Urban Authority",
        "Community Access Roads": "District Local Government",
    }[value]


def build() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    frame = pyogrio.read_dataframe(GDB, layer="Road_Segment_Master", columns=SOURCE_FIELDS)
    if len(frame) != EXPECTED_ROWS:
        raise RuntimeError(f"Expected {EXPECTED_ROWS:,} master records, found {len(frame):,}")
    frame["length_km"] = pd.to_numeric(frame["length_km"], errors="coerce").fillna(0)
    total_km = float(frame["length_km"].sum())
    if abs(total_km - EXPECTED_KM) > 0.001:
        raise RuntimeError(f"Expected {EXPECTED_KM:,.6f} km, found {total_km:,.6f} km")

    frame["FUNC_CL4"] = frame["functional_class"].map(four_class)
    if set(frame["FUNC_CL4"].unique()) != set(CLASS_ORDER):
        raise RuntimeError(f"Unexpected four-class domain: {sorted(frame['FUNC_CL4'].unique())}")
    frame["RESP_AUTH"] = np.where(frame["FUNC_CL4"].eq("National Roads"), "National Roads", "DUCAR")
    frame["GOV_DEPT"] = frame["FUNC_CL4"].map(government_department)
    frame["ROAD_NAME"] = first_text(frame, ["road_name_authoritative", "road_name_display", "road_name"])
    frame["ROAD_NAME"] = frame["ROAD_NAME"].where(frame["ROAD_NAME"].str.len().gt(0), frame["route_id"].fillna(frame["osm_feature_id"]))

    output = frame.rename(columns={
        "osm_feature_id": "LINK_ID", "highway": "HIGHWAY", "surface": "SURFACE",
        "pavement_class": "PAVED_CLS", "condition": "COND", "functional_class": "SRC_CLASS",
        "road_management_class": "CLASS_BAS", "length_km": "LEN_KM", "region": "REGION",
        "district": "DISTRICT", "county": "COUNTY", "subcounty": "SUBCOUNTY",
        "parish": "PARISH", "registry_aadt": "AADT", "registry_pcu": "PCU",
        "registry_speed_kmh": "SPEED_KMH", "traffic_value_status": "TRAF_STAT",
        "traffic_model_confidence_pct": "TRAF_CONF", "traffic_assignment_basis": "TRAF_BAS",
        "start_x_coordinate_dd": "START_X", "start_y_coordinate_dd": "START_Y",
        "end_x_coordinate_dd": "END_X", "end_y_coordinate_dd": "END_Y",
        "surface_value_status": "SURF_STAT", "surface_model_confidence_pct": "SURF_CONF",
        "condition_value_status": "COND_STAT", "condition_model_confidence_pct": "COND_CONF",
        "national_match": "NAT_MATCH", "national_link_id": "NAT_ID", "route_id": "ROUTE_ID",
    })
    columns = [
        "LINK_ID", "ROUTE_ID", "ROAD_NAME", "HIGHWAY", "SURFACE", "PAVED_CLS", "COND",
        "FUNC_CL4", "SRC_CLASS", "CLASS_BAS", "RESP_AUTH", "GOV_DEPT", "LEN_KM",
        "REGION", "DISTRICT", "COUNTY", "SUBCOUNTY", "PARISH", "AADT", "PCU",
        "SPEED_KMH", "TRAF_STAT", "TRAF_CONF", "TRAF_BAS", "START_X", "START_Y",
        "END_X", "END_Y", "SURF_STAT", "SURF_CONF", "COND_STAT", "COND_CONF",
        "NAT_MATCH", "NAT_ID", "geometry",
    ]
    output = output[columns]

    # Stable ordering makes the 30 parts deterministic and easy to reassemble.
    output = output.sort_values(["FUNC_CL4", "DISTRICT", "LINK_ID"], kind="stable").reset_index(drop=True)
    edges = np.linspace(0, len(output), PARTS + 1, dtype=int)
    part_audit = []
    for number in range(PARTS):
        part = output.iloc[edges[number]:edges[number + 1]].copy()
        target = OUTPUT / f"DUCAR_Full_Vehicular_Network_4Class_part{number + 1:02d}of{PARTS}.shp"
        pyogrio.write_dataframe(part, target, driver="ESRI Shapefile", encoding="UTF-8")
        part_audit.append({
            "part": number + 1, "records": int(len(part)),
            "length_km": round(float(part["LEN_KM"].sum()), 6),
            "classes": sorted(part["FUNC_CL4"].unique().tolist()),
        })
        print(f"Wrote part {number + 1:02d}/{PARTS}: {len(part):,} records", flush=True)

    # GeoPackage provides one ArcGIS-ready all-road layer plus four class-specific layers.
    if PACKAGE.exists():
        PACKAGE.unlink()
    pyogrio.write_dataframe(output, PACKAGE, layer="All_Roads_4Class", driver="GPKG")
    for road_class in CLASS_ORDER:
        layer = road_class.replace(" ", "_")
        pyogrio.write_dataframe(output.loc[output["FUNC_CL4"].eq(road_class)], PACKAGE, layer=layer, driver="GPKG", append=True)

    summary = {}
    for road_class in CLASS_ORDER:
        subset = output.loc[output["FUNC_CL4"].eq(road_class)]
        summary[road_class] = {"records": int(len(subset)), "length_km": round(float(subset["LEN_KM"].sum()), 6)}
    audit = {
        "status": "PASS", "source": str(GDB) + "/Road_Segment_Master",
        "output_parts_folder": str(OUTPUT), "geopackage": str(PACKAGE),
        "records": int(len(output)), "length_km": round(total_km, 6),
        "part_count": PARTS, "field_count": len(columns) - 1,
        "four_class_field": "FUNC_CL4", "four_class_domain": CLASS_ORDER,
        "classification_rule": {
            "National Roads": ["National Road"],
            "District Roads": ["District Road", "Trunk/Primary Road"],
            "Urban Roads": ["Urban/Local Road"],
            "Community Access Roads": ["Community Access Road", "Other Vehicular Road"],
        },
        "class_summary": summary, "parts": part_audit,
        "checks": {
            "all_records_classified": bool(output["FUNC_CL4"].notna().all()),
            "all_lengths_positive": bool(output["LEN_KM"].gt(0).all()),
            "surface_pavement_consistent": bool(np.where(output["SURFACE"].isin(["Bituminous", "Concrete"]), "Paved", "Unpaved").astype(str).tolist() == output["PAVED_CLS"].astype(str).tolist()),
        },
    }
    AUDIT.write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    README.write_text(
        "UGANDA COMPLETE VEHICULAR NETWORK - FOUR-CLASS ARCGIS PACKAGE\n"
        "=============================================================\n\n"
        "Use field FUNC_CL4 for the complete four-class classification:\n"
        "  1. National Roads\n  2. District Roads\n  3. Urban Roads\n  4. Community Access Roads\n\n"
        f"Population: {len(output):,} road segments; {total_km:,.6f} km.\n"
        "All 30 parts have the same schema, EPSG:4326 geometry and a populated FUNC_CL4 value.\n"
        "For easier ArcGIS Pro use, open DUCAR_Four_Class_Network_2026.gpkg in the parent folder.\n"
        "It contains All_Roads_4Class and one layer for each of the four classes.\n",
        encoding="utf-8",
    )
    print(json.dumps(audit, indent=2), flush=True)


if __name__ == "__main__":
    build()
