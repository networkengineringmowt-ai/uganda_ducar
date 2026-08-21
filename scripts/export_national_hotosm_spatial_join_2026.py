from __future__ import annotations

"""Export the matched HOTOSM national-road alignments for GIS and the web map."""

import json
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyogrio


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DUCAR = ROOT.parent
SOURCE = DUCAR / "hotosm_uga_roads_osm_shp" / "roads_lines.shp"
JOIN = DATA / "national_hotosm_spatial_join_2026.csv.gz"
WEB = DATA / "national_road_network_2026.geojson"
GIS_DIR = DUCAR / "National Roads" / "national_hotosm_spatial_join_2026"


def main() -> None:
    joined = pd.read_csv(JOIN)
    joined = joined[joined["national_match"]].copy()
    ids = set(joined["osm_feature_id"].astype(str))
    source = pyogrio.read_dataframe(
        SOURCE,
        columns=["id", "name", "highway", "surface", "adm1_name", "adm2_name", "adm3_name", "adm4_name"],
    )
    source["id"] = source["id"].astype(str)
    source = source[source["id"].isin(ids)].copy()
    join_fields = [
        "osm_feature_id", "national_unique_id", "national_road_number", "national_link_id",
        "national_road_class", "national_link_name", "national_distance_m",
        "national_bearing_difference_deg", "national_match_method",
    ]
    source = source.merge(joined[join_fields], left_on="id", right_on="osm_feature_id", how="inner", validate="one_to_one")
    source = gpd.GeoDataFrame(source, geometry="geometry", crs=4326)
    measured = source.to_crs(32636)
    source["geometry_length_km"] = measured.length / 1000.0
    source["classification"] = "National Road Network - HOTOSM Spatial Alignment"
    source["official_reference_km"] = 21_302.0

    web = source.to_crs(32636)
    web.geometry = web.geometry.simplify(12.0, preserve_topology=True)
    group_fields = ["adm1_name", "adm2_name", "national_road_number", "national_link_id", "national_road_class", "national_link_name", "classification"]
    for field in group_fields:
        web[field] = web[field].fillna("Not supplied").replace("", "Not supplied")
    web["source_feature_count"] = 1
    web = web.dissolve(
        by=group_fields,
        as_index=False,
        aggfunc={"geometry_length_km": "sum", "source_feature_count": "sum", "national_distance_m": "mean", "national_bearing_difference_deg": "mean"},
    )
    web["official_reference_km"] = 21_302.0
    web = web.to_crs(4326)[group_fields + [
        "source_feature_count", "national_distance_m", "national_bearing_difference_deg",
        "geometry_length_km", "official_reference_km", "geometry",
    ]]
    web.to_file(WEB, driver="GeoJSON")

    GIS_DIR.mkdir(parents=True, exist_ok=True)
    gis = source.rename(columns={
        "osm_feature_id": "osm_id", "highway": "hwy", "surface": "surface",
        "national_unique_id": "nat_uid", "national_road_number": "nat_rd_no",
        "national_link_id": "nat_link", "national_road_class": "nat_class",
        "national_link_name": "nat_name", "national_distance_m": "dist_m",
        "national_bearing_difference_deg": "bear_deg", "geometry_length_km": "len_km",
    })[[
        "osm_id", "name", "hwy", "surface", "adm1_name", "adm2_name", "adm3_name", "adm4_name",
        "nat_uid", "nat_rd_no", "nat_link", "nat_class", "nat_name", "dist_m", "bear_deg", "len_km", "geometry",
    ]]
    output = GIS_DIR / "matched_hotosm_national_roads.shp"
    gis.to_file(output, driver="ESRI Shapefile", encoding="UTF-8")

    audit = {
        "matched_source_features": int(len(source)),
        "matched_geometry_length_km": round(float(source["geometry_length_km"].sum()), 6),
        "web_geojson": str(WEB),
        "gis_shapefile": str(output),
    }
    (GIS_DIR / "spatial_join_audit.json").write_text(json.dumps(audit, indent=2), encoding="utf-8")
    print(json.dumps(audit, indent=2))


if __name__ == "__main__":
    main()
