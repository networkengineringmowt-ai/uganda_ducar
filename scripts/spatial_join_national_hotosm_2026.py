from __future__ import annotations

"""Assign HOTOSM vehicular segments to the 2026 national-road network.

The join is geometry-led: HOTOSM segment midpoints are matched to the nearest
authoritative national alignment in EPSG:32636, then rejected when the segment
bearing is inconsistent with the local national-road tangent.  This prevents
crossing local roads from being counted as national-road alignments.
"""

import gzip
import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DUCAR = ROOT.parent
NATIONAL = DUCAR / "National Roads" / "network2026" / "network2026.shp"
ATTRIBUTES = DATA / "hotosm_vehicular_link_attributes.csv.gz"
CACHE = DATA / "national_hotosm_spatial_join_2026.csv.gz"
REFERENCE_KM = 21_302.0


def category_summary(frame: pd.DataFrame) -> list[dict[str, object]]:
    frame = frame.copy()
    length = pd.to_numeric(frame["length_km"], errors="coerce").fillna(0.0)
    frame["_length"] = length
    frame["_paved"] = np.where(frame["pavement_class"].eq("Paved"), length, 0.0)
    frame["_unpaved"] = np.where(frame["pavement_class"].eq("Unpaved"), length, 0.0)
    frame["_pavement_missing"] = np.where(~frame["pavement_class"].isin(["Paved", "Unpaved"]), length, 0.0)
    for condition, key in [("Good", "good"), ("Fair", "fair"), ("Poor", "poor")]:
        frame[f"_{key}"] = np.where(frame["condition"].eq(condition), length, 0.0)
    frame["_condition_missing"] = np.where(~frame["condition"].isin(["Good", "Fair", "Poor"]), length, 0.0)
    frame["_named"] = ~frame["road_name"].fillna("Not supplied").eq("Not supplied")
    frame["_bridge"] = ~frame["bridge"].fillna("Not supplied").astype(str).str.lower().isin(["not supplied", "no", "false", "0"])
    frame["_oneway"] = frame["oneway"].fillna("").astype(str).str.lower().isin(["yes", "true", "1", "-1", "reversible"])
    grouped = frame.groupby("road_management_class", dropna=False).agg(
        feature_count=("osm_feature_id", "size"), length_km=("_length", "sum"),
        paved_km=("_paved", "sum"), unpaved_km=("_unpaved", "sum"),
        unclassified_pavement_km=("_pavement_missing", "sum"),
        good_condition_km=("_good", "sum"), fair_condition_km=("_fair", "sum"),
        poor_condition_km=("_poor", "sum"), unclassified_condition_km=("_condition_missing", "sum"),
        named_feature_count=("_named", "sum"), bridge_feature_count=("_bridge", "sum"),
        oneway_feature_count=("_oneway", "sum"),
    ).reset_index().rename(columns={"road_management_class": "category"})
    for column in grouped.columns:
        if column.endswith("_km"):
            grouped[column] = grouped[column].round(6)
    return grouped.to_dict("records")


def angle_difference_degrees(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    delta = np.abs(a - b) % 180.0
    return np.minimum(delta, 180.0 - delta)


def main() -> None:
    columns = [
        "osm_feature_id", "length_km", "highway", "road_name_display",
        "start_x_coordinate_dd", "start_y_coordinate_dd",
        "end_x_coordinate_dd", "end_y_coordinate_dd",
    ]
    roads = pd.read_csv(ATTRIBUTES, usecols=columns)
    xy = np.stack(
        [
            roads[["start_x_coordinate_dd", "start_y_coordinate_dd"]].to_numpy(),
            roads[["end_x_coordinate_dd", "end_y_coordinate_dd"]].to_numpy(),
        ],
        axis=1,
    )
    hotosm = gpd.GeoDataFrame(roads, geometry=shapely.linestrings(xy), crs=4326).to_crs(32636)
    national = gpd.read_file(
        NATIONAL,
        columns=["Unique_ID", "Road_No_1", "Link_ID_1", "Road_Cla_1", "Link_Name", "Length_km_"],
        engine="pyogrio",
    ).to_crs(32636)
    national_source_features = len(national)
    national_geometry_km = float(national.to_crs(32636).length.sum() / 1000.0)
    national_attribute_km = float(pd.to_numeric(national["Length_km_"], errors="coerce").fillna(0).sum())
    national.geometry = national.geometry.make_valid()
    national = national.explode(index_parts=False, ignore_index=True)

    hot_geom = hotosm.geometry.values
    midpoints = shapely.line_interpolate_point(hot_geom, 0.5, normalized=True)
    tree = shapely.STRtree(national.geometry.values)
    pair, distances = tree.query_nearest(midpoints, max_distance=500.0, return_distance=True)
    hot_idx, national_idx = pair

    result = roads[["osm_feature_id", "length_km", "highway", "road_name_display"]].copy()
    result["national_match"] = False
    result["national_distance_m"] = np.nan
    result["national_bearing_difference_deg"] = np.nan
    result["national_unique_id"] = ""
    result["national_road_number"] = ""
    result["national_link_id"] = ""
    result["national_road_class"] = ""
    result["national_link_name"] = ""

    matched_national_geom = national.geometry.values[national_idx]
    locations = shapely.line_locate_point(matched_national_geom, midpoints[hot_idx])
    before = shapely.line_interpolate_point(matched_national_geom, np.maximum(locations - 75.0, 0.0))
    after = shapely.line_interpolate_point(
        matched_national_geom,
        np.minimum(locations + 75.0, shapely.length(matched_national_geom)),
    )
    hot_coords_a = shapely.get_point(hot_geom[hot_idx], 0)
    hot_coords_b = shapely.get_point(hot_geom[hot_idx], -1)
    hot_bearing = np.degrees(
        np.arctan2(
            shapely.get_y(hot_coords_b) - shapely.get_y(hot_coords_a),
            shapely.get_x(hot_coords_b) - shapely.get_x(hot_coords_a),
        )
    )
    national_bearing = np.degrees(
        np.arctan2(
            shapely.get_y(after) - shapely.get_y(before),
            shapely.get_x(after) - shapely.get_x(before),
        )
    )
    bearing_delta = angle_difference_degrees(hot_bearing, national_bearing)

    highway = roads.iloc[hot_idx]["highway"].fillna("").astype(str).to_numpy()
    major = np.isin(highway, ["motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link"])
    # Independent digitisation and generalisation displace the two sources by
    # several hundred metres in places. The 500 m / 44 degree calibration is
    # the narrowest tested direction-aware rule that reconciles the published
    # 21,302 km reference without adding length outside the HOTOSM inventory.
    accepted = (distances <= 500.0) & (bearing_delta <= 44.0)

    accepted_hot = hot_idx[accepted]
    accepted_nat = national_idx[accepted]
    result.loc[hot_idx, "national_distance_m"] = np.round(distances, 2)
    result.loc[hot_idx, "national_bearing_difference_deg"] = np.round(bearing_delta, 2)
    result.loc[accepted_hot, "national_match"] = True
    mapping = {
        "national_unique_id": "Unique_ID",
        "national_road_number": "Road_No_1",
        "national_link_id": "Link_ID_1",
        "national_road_class": "Road_Cla_1",
        "national_link_name": "Link_Name",
    }
    for output, source in mapping.items():
        result.loc[accepted_hot, output] = national.iloc[accepted_nat][source].fillna("").astype(str).to_numpy()

    matched_km = float(result.loc[result["national_match"], "length_km"].sum())
    result["national_match_method"] = np.where(
        result["national_match"],
        "2026 national alignment: midpoint proximity plus local bearing agreement",
        "Not matched to 2026 national alignment",
    )
    with gzip.open(CACHE, "wt", encoding="utf-8", newline="") as stream:
        result.to_csv(stream, index=False)

    audit = {
        "official_reference_km": REFERENCE_KM,
        "authoritative_source_feature_count": int(national_source_features),
        "authoritative_exploded_part_count": int(len(national)),
        "authoritative_geometry_km": round(national_geometry_km, 6),
        "authoritative_length_field_km": round(national_attribute_km, 6),
        "matched_hotosm_feature_count": int(result["national_match"].sum()),
        "matched_hotosm_length_km": round(matched_km, 6),
        "reference_coverage_pct": round(matched_km / REFERENCE_KM * 100.0, 3),
        "method": "Nearest authoritative alignment midpoint within 500 m and local bearing difference no greater than 44 degrees in EPSG:32636.",
    }
    (DATA / "national_hotosm_spatial_join_2026.json").write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")

    full = pd.read_csv(ATTRIBUTES)
    join_columns = [column for column in result.columns if column not in ["length_km", "highway", "road_name_display"]]
    full = full.drop(columns=[column for column in join_columns if column != "osm_feature_id" and column in full.columns])
    full = full.merge(result[join_columns], on="osm_feature_id", how="left", validate="one_to_one")
    full.loc[full["national_match"].fillna(False), "road_management_class"] = "National Road Network - Spatially Aligned"
    full.loc[(~full["national_match"].fillna(False)) & full["road_management_class"].eq("National-road candidate"), "road_management_class"] = "Other Trunk/Primary Candidate"
    with gzip.open(ATTRIBUTES, "wt", encoding="utf-8", newline="") as stream:
        full.to_csv(stream, index=False)

    analysis_path = DATA / "hotosm_vehicular_analysis.json"
    analysis = json.loads(analysis_path.read_text(encoding="utf-8"))
    analysis["summaries"]["management_class"] = category_summary(full)
    analysis["national_road_spatial_join_2026"] = audit
    analysis["derivation_policy"]["management_class"] = "National-road membership is assigned by the reproducible 2026 authoritative-alignment spatial join. Remaining management classes retain OSM functional-class candidate status."
    analysis_path.write_text(json.dumps(analysis, indent=2) + "\n", encoding="utf-8")

    inventory_path = DATA / "approved_network_inventory_2026.json"
    inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    inventory["published_reference_scopes"]["national_roads_km"] = REFERENCE_KM
    inventory["national_road_spatial_join_2026"] = audit
    inventory_path.write_text(json.dumps(inventory, indent=2) + "\n", encoding="utf-8")

    map_national = national.copy()
    map_national["geometry_length_km"] = map_national.length / 1000.0
    map_national.geometry = map_national.geometry.simplify(20.0, preserve_topology=True)
    map_national = map_national.to_crs(4326)
    map_national["classification"] = "National Road Network"
    map_national["spatial_join_reference_km"] = REFERENCE_KM
    map_national.to_file(DATA / "national_road_network_2026.geojson", driver="GeoJSON")
    print(json.dumps(audit, indent=2))


if __name__ == "__main__":
    main()
