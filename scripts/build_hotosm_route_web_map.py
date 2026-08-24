from __future__ import annotations

"""Build a compact complete-population web map from the merged route GeoPackage."""

import gzip
import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
from shapely.geometry import MultiLineString


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SOURCE = ROOT.parent / "Merged HOTOSM Routes 2026" / "uganda_hotosm_merged_routes_2026.gpkg"
OUTPUT = DATA / "hotosm_vehicular_map.geojson"
OUTPUT_GZIP = DATA / "hotosm_vehicular_map.geojson.gz"
ENRICHED_ROUTES = DATA / "hotosm_vehicular_route_register.csv.gz"
TOPOLOGY_CHUNK_KM = 45.0
DISPLAY_SIMPLIFICATION_M = 45.0
GROUP_FIELDS = ["region", "district", "county", "functional_class", "highway", "road_management_class", "surface", "pavement_class", "condition", "national_aligned"]
NUMERIC_FIELDS = [
    "registry_aadt", "registry_pcu", "registry_speed_kmh", "adt_total",
    "adt_excluding_motorcycles", "adt_motorcycles", "heavy_vehicle_adt",
    "speed_mean_kmh", "speed_limit_kmh", "speed_p85_kmh", "speed_over_limit_pct",
    "heavy_vehicle_overload_rate_pct", "crash_rate_per_100m_vehicle_km",
]


def flatten(geometries) -> MultiLineString:
    parts = []
    for geometry in geometries:
        if geometry.geom_type == "MultiLineString":
            parts.extend(geometry.geoms)
        elif geometry.geom_type == "LineString":
            parts.append(geometry)
    return MultiLineString(parts)


def aggregate(frame: gpd.GeoDataFrame, identifier: str, name: str, basis: str) -> dict:
    lengths = pd.to_numeric(frame["geometry_length_km"], errors="coerce").fillna(0).to_numpy()
    total = max(float(lengths.sum()), 1e-12)
    props = {
        "source_group_id": identifier,
        "route_id": identifier,
        "road_name": name,
        "route_assignment_basis": basis,
        "source": "Complete HOTOSM route conflation with MoWT, KCCA and district-road alignment joins",
        "geometry_length_km": round(total, 6),
        "source_feature_count": int(frame["source_feature_count"].sum()),
        "merged_route_count": int(len(frame)),
        "bridge_feature_count": int(frame["bridge_feature_count"].sum()),
        "named_feature_count": int(frame["named_feature_count"].sum()),
        "national_aligned": bool(frame["national_aligned"].any()),
        "coordinate_reference_system": "EPSG:4326",
        "length_measurement_crs": "EPSG:32636",
    }
    for field in GROUP_FIELDS:
        values = frame[field].fillna("Not supplied").astype(str)
        weighted = pd.DataFrame({"value": values, "length": lengths}).groupby("value")["length"].sum()
        props[field] = weighted.idxmax() if len(weighted) else "Not supplied"
    props["national_aligned"] = bool(frame["national_aligned"].fillna(False).astype(bool).any())
    for field in NUMERIC_FIELDS:
        values = pd.to_numeric(frame[field], errors="coerce").fillna(0).to_numpy()
        props[field] = round(float(np.average(values, weights=lengths)), 1) if total > 0 else 0
    props["traffic_value_status"] = frame["traffic_value_status"].mode().iat[0] if len(frame["traffic_value_status"].mode()) else "Not supplied"
    props["road_safety_risk_band"] = frame["road_safety_risk_band"].mode().iat[0] if len(frame["road_safety_risk_band"].mode()) else "Not supplied"
    return {"geometry": flatten(frame.geometry), **props}


def main() -> None:
    routes = gpd.read_file(SOURCE, layer="merged_routes", engine="pyogrio").to_crs(32636)
    # The GeoPackage is the geometry authority; the enriched register is the
    # current attribute authority. Join by stable route ID before aggregating so
    # every web collection retains the exact length-weighted categories.
    enriched = pd.read_csv(ENRICHED_ROUTES, low_memory=False).set_index("route_id")
    for field in GROUP_FIELDS + NUMERIC_FIELDS + ["traffic_value_status", "road_safety_risk_band"]:
        if field in enriched:
            values = routes["route_id"].map(enriched[field])
            routes[field] = values.where(values.notna(), routes.get(field))
    known = routes[routes["route_assignment_basis"] != "County-bounded straight-through topology"].copy()
    topology = routes[routes["route_assignment_basis"] == "County-bounded straight-through topology"].copy()
    output = []
    for index, row in known.iterrows():
        output.append(aggregate(known.loc[[index]], str(row["route_id"]), str(row["road_name"]), str(row["route_assignment_basis"])))

    collection_number = 0
    for group_key, group in topology.groupby(GROUP_FIELDS, dropna=False, sort=True):
        centroids = group.geometry.centroid
        group = group.assign(_x=centroids.x, _y=centroids.y).sort_values(["_x", "_y"])
        chunk, chunk_km = [], 0.0
        for index, row in group.iterrows():
            length = float(row["geometry_length_km"])
            if chunk and chunk_km + length > TOPOLOGY_CHUNK_KM:
                collection_number += 1
                frame = routes.loc[chunk]
                county = str(group_key[2])
                road_class = str(group_key[3])
                output.append(aggregate(frame, f"TOPO-{collection_number:05d}", f"{county} {road_class} Route Collection {collection_number:05d}", "County topology route collection"))
                chunk, chunk_km = [], 0.0
            chunk.append(index)
            chunk_km += length
        if chunk:
            collection_number += 1
            frame = routes.loc[chunk]
            county = str(group_key[2])
            road_class = str(group_key[3])
            output.append(aggregate(frame, f"TOPO-{collection_number:05d}", f"{county} {road_class} Route Collection {collection_number:05d}", "County topology route collection"))

    web = gpd.GeoDataFrame(output, geometry="geometry", crs=32636)
    web.geometry = web.geometry.simplify(DISPLAY_SIMPLIFICATION_M, preserve_topology=True)
    web = web.to_crs(4326)
    # Five-decimal-degree display precision is sub-metre to metre scale in
    # Uganda and dramatically reduces transfer/parsing time. Exact analytical
    # lengths remain stored in geometry_length_km from EPSG:32636.
    web.geometry = shapely.set_precision(web.geometry.array, 0.00001)
    payload = json.loads(web.to_json(drop_id=True))
    payload.update({
        "name": "Uganda complete vehicular road route map",
        "metadata": {
            "source": str(SOURCE),
            "source_snapshot": "2026-08-07",
            "vehicular_source_features": int(routes["source_feature_count"].sum()),
            "vehicular_length_km": round(float(routes["geometry_length_km"].sum()), 6),
            "merged_route_features": int(len(routes)),
            "identified_route_features": int(len(known)),
            "topology_route_features": int(len(topology)),
            "topology_web_collections": int(collection_number),
            "display_groups": int(len(web)),
            "display_simplification_m": DISPLAY_SIMPLIFICATION_M,
            "display_coordinate_precision_dd": 0.00001,
            "reporting_note": "Every source segment is retained in route lineage. Identified routes remain discrete; unnamed topology routes use county/class web collections to keep the complete map responsive.",
        },
    })
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    OUTPUT.write_text(serialized, encoding="utf-8")
    with gzip.open(OUTPUT_GZIP, "wt", encoding="utf-8", compresslevel=9) as stream:
        stream.write(serialized)
    print(json.dumps(payload["metadata"], indent=2))


if __name__ == "__main__":
    main()
