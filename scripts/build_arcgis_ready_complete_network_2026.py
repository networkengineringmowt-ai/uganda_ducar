from __future__ import annotations

"""Build ArcGIS-ready complete-network recovery layers from the 404,047-row GDB."""

import json
import re
import shutil
from collections import Counter
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyogrio


ROOT = Path(__file__).resolve().parents[1]
DUCAR = ROOT.parent
GDB = DUCAR / "DUCAR_Final_Deliverables_2026" / "07_ArcGIS_Pro_Package" / "DUCAR_ArcGIS_Pro_2026.gdb"
OUTPUT = DUCAR / "DUCAR_Final_Deliverables_2026" / "04_GIS_Shapefiles" / "DUCAR_ArcGIS_Ready_Reconciled_2026"
GPKG = OUTPUT / "DUCAR_Complete_Reconciled_2026.gpkg"
AUDIT = ROOT / "data" / "arcgis_ready_complete_network_reconciliation_2026.json"

EXPECTED_ROWS = 404_047
EXPECTED_LENGTH_KM = 248_616.15
OFFICIAL_ID = re.compile(r"^[A-Z]{4}\d{3}$")
SHP_ALIASES = {
    "segment_id": "SEG_ID",
    "link_id": "LINK_ID",
    "link_id_status": "ID_STATUS",
    "road_name": "ROAD_NAME",
    "mowt_class": "MOWT_CLASS",
    "district": "DISTRICT",
    "region": "REGION",
    "surface_clean": "SURFACE",
    "pavement_clean": "PAVEMENT",
    "condition_clean": "CONDITION",
    "length_km": "LEN_KM",
    "geometry_length_km": "GEOM_KM",
    "segment_count": "SEG_COUNT",
    "start_x_coordinate_dd": "START_X",
    "start_y_coordinate_dd": "START_Y",
    "end_x_coordinate_dd": "END_X",
    "end_y_coordinate_dd": "END_Y",
    "national_match": "NAT_MATCH",
    "road_management_class": "MGMT_CLASS",
    "adt_total": "ADT_TOTAL",
    "adt_excluding_motorcycles": "ADT_NOMC",
    "adt_motorcycles": "ADT_MC",
    "heavy_vehicle_adt": "HVY_ADT",
    "speed_mean_kmh": "SPD_MEAN",
    "speed_p85_kmh": "SPD_P85",
    "speed_over_limit_pct": "SPD_OVR",
    "heavy_vehicle_overload_rate_pct": "HVY_OVR",
    "annual_crashes_estimate": "CRASH_YR",
    "road_safety_risk_band": "SAFETY_R",
    "aadt_bounds_corrected": "AADT_FIX",
    "traffic_aadt_lower": "AADT_LOW",
    "traffic_aadt_upper": "AADT_HIGH",
}

CITY_NAMES = {
    "Arua", "Fort Portal", "Gulu", "Hoima", "Jinja", "Lira",
    "Masaka", "Mbale", "Mbarara", "Soroti",
}
MUNICIPAL_NAMES = {
    "Busia", "Bushenyi", "Entebbe", "Iganga", "Kabale", "Kasese",
    "Kira", "Kitgum", "Koboko", "Lugazi", "Masindi", "Mityana",
    "Mukono", "Mubende", "Nansana", "Njeru", "Ntungamo", "Rukungiri",
    "Ssabagabo", "Tororo",
}


def clean(value: object, fallback: str = "Not Reported") -> str:
    if value is None or pd.isna(value):
        return fallback
    text = str(value).strip()
    return text if text else fallback


def proper(value: object, fallback: str = "Not Reported") -> str:
    text = clean(value, fallback).replace("_", " ")
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s*-\s*", " - ", text)
    text = re.sub(r"\s*\([A-Z]{4}\d{3,4}\)\s*$", "", text).strip()
    keep_upper = {"KCCA", "P/S", "TC", "HC", "UNRA", "MoWT"}
    words = []
    for word in text.split(" "):
        bare = word.strip(",")
        if bare.upper() in keep_upper:
            words.append(word.upper())
        else:
            words.append("-".join(part.capitalize() for part in word.split("-")))
    return " ".join(words) or fallback


def standard_surface(value: object, pavement: object) -> str:
    raw = clean(value, "").casefold()
    paved = clean(pavement, "").casefold()
    if "concrete" in raw:
        return "Concrete"
    if any(token in raw for token in ["bituminous", "asphalt", "paved", "cobble"]):
        return "Bituminous"
    if "gravel" in raw or "murram" in raw or "laterite" in raw:
        return "Gravel"
    if paved == "paved":
        return "Bituminous"
    return "Earth"


def pavement_from_surface(surface: str) -> str:
    return "Paved" if surface in {"Bituminous", "Concrete"} else "Unpaved"


def urban_class(row: pd.Series) -> str:
    places = {proper(row.get(field), "") for field in ["nearest_town", "start_town", "end_town", "district"]}
    if row.get("district") == "Kampala":
        return "KCCA"
    if places & CITY_NAMES:
        return "City Roads"
    if places & MUNICIPAL_NAMES:
        return "Municipal Roads"
    return "Town Council Roads"


def mowt_class(row: pd.Series) -> str:
    management = clean(row.get("road_management_class", row.get("functional_class", "")), "").casefold()
    if int(row.get("national_match", 0) or 0) == 1 or "national" in management:
        return "National Roads"
    if "district" in management:
        return "District Roads"
    if "urban" in management or "local" in management:
        return urban_class(row)
    if "trunk" in management or "primary" in management:
        return "District Roads"
    return "Community Access Roads"


def district_prefix(district: object) -> str:
    letters = re.sub(r"[^A-Za-z]", "", clean(district, "UGND")).upper()
    return (letters + "XXXX")[:4]


def assign_route_ids(routes: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    routes = routes.sort_values(["district", "road_name", "geometry_length_km"], ascending=[True, True, False]).copy()
    sequences: Counter[str] = Counter()
    ids = []
    statuses = []
    for district in routes["district"]:
        prefix = district_prefix(district)
        sequences[prefix] += 1
        sequence = sequences[prefix]
        if sequence <= 999:
            ids.append(f"{prefix}{sequence:03d}")
            statuses.append("Official 4-letter district prefix + 3-digit sequence")
        else:
            ids.append(f"{prefix}{sequence:04d}")
            statuses.append("Overflow requires route consolidation before official publication")
    routes["link_id"] = ids
    routes["link_id_status"] = statuses
    return routes


def remove_family(path: Path) -> None:
    for existing in path.parent.glob(path.stem + ".*"):
        if existing.is_file():
            existing.unlink()


def write_shapefile(frame: gpd.GeoDataFrame, path: Path, columns: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    remove_family(path)
    output = frame[columns + ["geometry"]].rename(columns=SHP_ALIASES)
    output.to_file(path, driver="ESRI Shapefile", encoding="UTF-8", index=False)


def write_gpkg(frame: gpd.GeoDataFrame, layer: str) -> None:
    if GPKG.exists() and layer == "master_segments":
        GPKG.unlink()
    frame.to_file(GPKG, layer=layer, driver="GPKG", index=False)


def load_master() -> gpd.GeoDataFrame:
    columns = [
        "osm_feature_id", "road_name_display", "road_name_authoritative", "highway",
        "surface", "pavement_class", "condition", "road_management_class", "length_km",
        "region", "district", "county", "subcounty", "nearest_town", "start_town",
        "end_town", "lanes", "width", "oneway", "bridge",
        "start_x_coordinate_dd", "start_y_coordinate_dd", "end_x_coordinate_dd",
        "end_y_coordinate_dd", "national_match", "national_distance_m",
        "national_bearing_difference_deg", "national_unique_id", "national_road_number",
        "national_link_id", "national_road_class", "national_link_name",
        "registry_aadt", "registry_pcu", "adt_total", "adt_excluding_motorcycles",
        "adt_motorcycles", "heavy_vehicle_adt", "speed_mean_kmh", "speed_p85_kmh",
        "speed_over_limit_pct", "heavy_vehicle_overload_rate_pct",
        "overloaded_heavy_vehicle_adt", "estimated_overload_tonnes_day",
        "annual_crashes_estimate", "annual_fatal_crashes_estimate",
        "annual_serious_crashes_estimate", "annual_minor_crashes_estimate",
        "crash_rate_per_100m_vehicle_km", "road_safety_risk_band",
        "traffic_projection_year", "traffic_model_confidence_pct",
        "traffic_aadt_lower", "traffic_aadt_upper",
    ]
    frame = pyogrio.read_dataframe(GDB, layer="Road_Segment_Master", columns=columns)
    frame["road_name"] = frame["road_name_display"].map(proper)
    frame["surface_clean"] = [
        standard_surface(surface, pavement)
        for surface, pavement in zip(frame["surface"], frame["pavement_class"])
    ]
    frame["pavement_clean"] = frame["surface_clean"].map(pavement_from_surface)
    frame["condition_clean"] = frame["condition"].map(proper)
    frame["mowt_class"] = frame.apply(mowt_class, axis=1)
    for field in ["length_km", "adt_total", "traffic_aadt_lower", "traffic_aadt_upper"]:
        frame[field] = pd.to_numeric(frame[field], errors="coerce").fillna(0.0)
    fallback_lower = (frame["adt_total"] * 0.75).round()
    fallback_upper = (frame["adt_total"] * 1.25).round()
    lower = frame["traffic_aadt_lower"].where(frame["traffic_aadt_lower"].gt(0), fallback_lower)
    upper = frame["traffic_aadt_upper"].where(frame["traffic_aadt_upper"].gt(0), fallback_upper)
    corrected_lower = pd.concat([lower, frame["adt_total"]], axis=1).min(axis=1)
    corrected_upper = pd.concat([upper, frame["adt_total"]], axis=1).max(axis=1)
    frame["aadt_bounds_corrected"] = (
        corrected_lower.ne(frame["traffic_aadt_lower"]) | corrected_upper.ne(frame["traffic_aadt_upper"])
    ).astype(int)
    frame["traffic_aadt_lower"] = corrected_lower.round().astype(int)
    frame["traffic_aadt_upper"] = corrected_upper.round().astype(int)
    frame["segment_id"] = frame["osm_feature_id"].astype(str)
    return gpd.GeoDataFrame(frame, geometry="geometry", crs=frame.crs)


def build_routes(master: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    work = master.to_crs(32636).copy()
    work["route_key"] = (
        work["district"].fillna("Not Reported").astype(str) + "|" +
        work["mowt_class"].astype(str) + "|" +
        work["road_name"].astype(str).str.casefold()
    )
    grouped = work.dissolve(
        by="route_key",
        as_index=False,
        aggfunc={
            "road_name": "first", "mowt_class": "first", "district": "first",
            "region": "first", "surface_clean": lambda s: s.mode().iat[0],
            "pavement_clean": lambda s: s.mode().iat[0],
            "condition_clean": lambda s: s.mode().iat[0],
            "length_km": "sum", "segment_id": "count",
            "adt_total": "mean", "heavy_vehicle_adt": "mean",
            "annual_crashes_estimate": "sum", "national_match": "max",
        },
    )
    grouped = grouped.rename(columns={"segment_id": "segment_count"})
    grouped["geometry_length_km"] = grouped.geometry.length / 1000.0
    grouped = grouped.to_crs(4326)
    return assign_route_ids(grouped)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    master = load_master()
    routes = build_routes(master)
    national = master.loc[master["national_match"].astype(int).eq(1)].copy()
    traffic = master.copy()
    condition = master.copy()

    write_gpkg(master, "master_segments")
    write_gpkg(routes, "official_routes")
    write_gpkg(national, "national_roads_aligned")
    write_gpkg(traffic, "traffic_segments")
    write_gpkg(condition, "condition_segments")

    segment_columns = [
        "segment_id", "road_name", "mowt_class", "district", "region",
        "surface_clean", "pavement_clean", "condition_clean", "length_km",
        "start_x_coordinate_dd", "start_y_coordinate_dd", "end_x_coordinate_dd",
        "end_y_coordinate_dd", "national_match",
    ]
    traffic_columns = segment_columns + [
        "adt_total", "adt_excluding_motorcycles", "adt_motorcycles",
        "heavy_vehicle_adt", "speed_mean_kmh", "speed_p85_kmh",
        "speed_over_limit_pct", "heavy_vehicle_overload_rate_pct",
        "annual_crashes_estimate", "road_safety_risk_band",
        "traffic_aadt_lower", "traffic_aadt_upper", "aadt_bounds_corrected",
    ]
    condition_columns = segment_columns + ["road_management_class"]
    route_columns = [
        "link_id", "link_id_status", "road_name", "mowt_class", "district",
        "region", "surface_clean", "pavement_clean", "condition_clean",
        "length_km", "geometry_length_km", "segment_count", "adt_total",
        "heavy_vehicle_adt", "annual_crashes_estimate", "national_match",
    ]

    write_shapefile(master, OUTPUT / "DUCAR_Master_Segments_Complete_2026.shp", segment_columns)
    write_shapefile(traffic, OUTPUT / "DUCAR_Traffic_Segments_Complete_2026.shp", traffic_columns)
    write_shapefile(condition, OUTPUT / "DUCAR_Condition_Segments_Complete_2026.shp", condition_columns)
    write_shapefile(national, OUTPUT / "DUCAR_National_Roads_Aligned_2026.shp", traffic_columns)
    write_shapefile(routes, OUTPUT / "DUCAR_Official_Routes_Reconciled_2026.shp", route_columns)

    class_summary = master.groupby("mowt_class")["length_km"].agg(["size", "sum"]).sort_index()
    route_prefix_counts = routes["link_id"].str[:4].value_counts().sort_index()
    audit = {
        "status": "REVIEW" if (routes["link_id_status"] != "Official 4-letter district prefix + 3-digit sequence").any() else "PASS",
        "source": str(GDB),
        "output_folder": str(OUTPUT),
        "geopackage": str(GPKG),
        "segment_rows": int(len(master)),
        "segment_length_km": round(float(master["length_km"].sum()), 6),
        "expected_rows_variance": int(len(master) - EXPECTED_ROWS),
        "expected_length_variance_km": round(float(master["length_km"].sum()) - EXPECTED_LENGTH_KM, 6),
        "national_road_length_km": round(float(national["length_km"].sum()), 6),
        "official_route_rows": int(len(routes)),
        "official_route_id_valid_rows": int(routes["link_id"].astype(str).str.fullmatch(OFFICIAL_ID).sum()),
        "official_route_id_overflow_rows": int((routes["link_id_status"] != "Official 4-letter district prefix + 3-digit sequence").sum()),
        "route_prefix_counts_over_999": {
            prefix: int(count) for prefix, count in route_prefix_counts.items() if int(count) > 999
        },
        "traffic_aadt_bounds_corrected_rows": int(master["aadt_bounds_corrected"].sum()),
        "traffic_aadt_bounds_mismatches_after_export": int(
            (
                (master["traffic_aadt_lower"] > master["adt_total"])
                | (master["traffic_aadt_upper"] < master["adt_total"])
            ).sum()
        ),
        "class_summary": {
            index: {"records": int(row["size"]), "length_km": round(float(row["sum"]), 6)}
            for index, row in class_summary.iterrows()
        },
        "required_attribute_missing": {
            "road_name": int(master["road_name"].eq("Not Reported").sum()),
            "surface": int(master["surface_clean"].eq("Not Reported").sum()),
            "pavement": int(master["pavement_clean"].eq("Not Reported").sum()),
            "condition": int(master["condition_clean"].eq("Not Reported").sum()),
            "start_coordinates": int(master[["start_x_coordinate_dd", "start_y_coordinate_dd"]].isna().any(axis=1).sum()),
            "end_coordinates": int(master[["end_x_coordinate_dd", "end_y_coordinate_dd"]].isna().any(axis=1).sum()),
        },
    }
    AUDIT.write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(audit, indent=2))


if __name__ == "__main__":
    main()
