from __future__ import annotations

"""Conflate complete HOTOSM vehicular segments into county-bounded road routes.

The source segment register remains unchanged for lineage.  This script creates
longer map/reporting routes using, in priority order: authoritative national
matches, KCCA and district-road alignment joins, supplied OSM names, and a
straight-through topology rule for unnamed roads.  No route crosses a county.
"""

import gzip
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import pyogrio
import shapely
from shapely.geometry import LineString, MultiLineString


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DUCAR = ROOT.parent
HOTOSM = DUCAR / "hotosm_uga_roads_osm_shp" / "roads_lines.shp"
ATTRIBUTES = DATA / "hotosm_vehicular_link_attributes.csv.gz"
DISTRICT = DUCAR / "district roads" / "Final_Merged_2026" / "uganda_district_roads_2026_merged.shp"
KCCA = DUCAR / "KCCA" / "kcca_nrn" / "kccanrn.shp"
COUNTIES = DUCAR / "Administrative units - Uganda" / "ug_counties.shp"
WEB = DATA / "hotosm_vehicular_map.geojson"
ROUTE_CSV = DATA / "hotosm_vehicular_route_register.csv.gz"
LINEAGE_CSV = DATA / "hotosm_segment_route_relations.csv.gz"
AUDIT = DATA / "hotosm_route_conflation_2026.json"
GIS_DIR = DUCAR / "Merged HOTOSM Routes 2026"
GIS_GPKG = GIS_DIR / "uganda_hotosm_merged_routes_2026.gpkg"
SNAP_METRES = 10.0

NUMERIC_MEANS = [
    "registry_aadt", "registry_pcu", "registry_speed_kmh", "adt_total",
    "adt_excluding_motorcycles", "adt_motorcycles", "heavy_vehicle_adt",
    "speed_mean_kmh", "speed_limit_kmh", "speed_p85_kmh", "speed_over_limit_pct",
    "heavy_vehicle_overload_rate_pct", "crash_rate_per_100m_vehicle_km",
]


def clean(value: object, fallback: str = "Not supplied") -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return fallback
    text = str(value).strip()
    return text if text and text.lower() not in {"nan", "none", "not supplied"} else fallback


def norm(value: object) -> str:
    value = clean(value, "")
    return re.sub(r"[^A-Z0-9]+", " ", value.upper()).strip()


def highway_family(value: object) -> str:
    value = clean(value, "road").lower()
    if value.startswith(("motorway", "trunk", "primary")):
        return "Primary/National"
    if value.startswith(("secondary", "tertiary")):
        return "District/Collector"
    if value in {"residential", "living_street", "service", "busway", "services", "rest_area"}:
        return "Urban/Local"
    if value in {"track", "unclassified", "road", "passing_place"}:
        return "Community Access"
    return "Other Vehicular"


def weighted_mode(frame: pd.DataFrame, field: str, weights: np.ndarray) -> str:
    totals: dict[str, float] = defaultdict(float)
    for value, weight in zip(frame[field].tolist(), weights):
        totals[clean(value)] += float(weight)
    return max(totals, key=totals.get) if totals else "Not supplied"


def local_bearing(lines: np.ndarray, points: np.ndarray) -> np.ndarray:
    locations = shapely.line_locate_point(lines, points)
    lengths = shapely.length(lines)
    before = shapely.line_interpolate_point(lines, np.maximum(locations - 60.0, 0.0))
    after = shapely.line_interpolate_point(lines, np.minimum(locations + 60.0, lengths))
    return np.degrees(np.arctan2(shapely.get_y(after) - shapely.get_y(before), shapely.get_x(after) - shapely.get_x(before)))


def bearing_delta(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    delta = np.abs(a - b) % 180.0
    return np.minimum(delta, 180.0 - delta)


def match_reference(
    roads: gpd.GeoDataFrame,
    eligible: np.ndarray,
    reference_path: Path,
    id_field: str,
    name_field: str,
    source_label: str,
) -> pd.DataFrame:
    output = pd.DataFrame(index=roads.index, data={
        f"{source_label}_match": False,
        f"{source_label}_id": "",
        f"{source_label}_name": "",
        f"{source_label}_distance_m": np.nan,
        f"{source_label}_bearing_difference_deg": np.nan,
    })
    refs = gpd.read_file(reference_path, columns=[id_field, name_field], engine="pyogrio").to_crs(32636)
    refs.geometry = refs.geometry.make_valid()
    refs = refs.explode(index_parts=False, ignore_index=True)
    selected = np.flatnonzero(eligible)
    if not len(selected):
        return output
    geometries = roads.geometry.values[selected]
    midpoints = shapely.line_interpolate_point(geometries, 0.5, normalized=True)
    tree = shapely.STRtree(refs.geometry.values)
    pair, distances = tree.query_nearest(midpoints, max_distance=300.0, return_distance=True)
    source_positions, ref_positions = pair
    road_positions = selected[source_positions]
    road_lines = roads.geometry.values[road_positions]
    ref_lines = refs.geometry.values[ref_positions]
    road_a = shapely.get_point(road_lines, 0)
    road_b = shapely.get_point(road_lines, -1)
    road_bearing = np.degrees(np.arctan2(shapely.get_y(road_b) - shapely.get_y(road_a), shapely.get_x(road_b) - shapely.get_x(road_a)))
    delta = bearing_delta(road_bearing, local_bearing(ref_lines, midpoints[source_positions]))
    supplied_names = roads.iloc[road_positions]["road_name"].map(norm).to_numpy()
    reference_names = refs.iloc[ref_positions][name_field].map(norm).to_numpy()
    name_agrees = (supplied_names != "") & (supplied_names == reference_names)
    accepted = ((distances <= 120.0) & (delta <= 45.0)) | ((distances <= 220.0) & (delta <= 28.0)) | (name_agrees & (distances <= 300.0) & (delta <= 60.0))
    road_positions = road_positions[accepted]
    ref_positions = ref_positions[accepted]
    output.loc[road_positions, f"{source_label}_match"] = True
    output.loc[road_positions, f"{source_label}_id"] = refs.iloc[ref_positions][id_field].fillna("").astype(str).to_numpy()
    output.loc[road_positions, f"{source_label}_name"] = refs.iloc[ref_positions][name_field].fillna("").astype(str).to_numpy()
    output.loc[road_positions, f"{source_label}_distance_m"] = np.round(distances[accepted], 2)
    output.loc[road_positions, f"{source_label}_bearing_difference_deg"] = np.round(delta[accepted], 2)
    return output


def endpoint_angle(coords: np.ndarray, endpoint: int) -> float:
    if endpoint == 0:
        dx, dy = coords[1] - coords[0]
    else:
        dx, dy = coords[-2] - coords[-1]
    return math.degrees(math.atan2(dy, dx)) % 360.0


def angle_opposition(a: float, b: float) -> float:
    difference = abs(a - b) % 360.0
    difference = min(difference, 360.0 - difference)
    return abs(180.0 - difference)


def build_chains(group: gpd.GeoDataFrame) -> list[tuple[list[int], LineString]]:
    edge_ids = group.index.tolist()
    coords: dict[int, np.ndarray] = {}
    nodes: dict[int, tuple[tuple[int, int], tuple[int, int]]] = {}
    incidence: dict[tuple[int, int], list[tuple[int, int, float]]] = defaultdict(list)
    for edge in edge_ids:
        geometry = group.at[edge, "geometry"]
        if geometry.geom_type == "MultiLineString":
            geometry = max(geometry.geoms, key=lambda item: item.length)
        array = np.asarray(geometry.coords, dtype=float)
        if len(array) < 2:
            continue
        start = tuple(np.round(array[0] / SNAP_METRES).astype(int))
        end = tuple(np.round(array[-1] / SNAP_METRES).astype(int))
        coords[edge] = array
        nodes[edge] = (start, end)
        incidence[start].append((edge, 0, endpoint_angle(array, 0)))
        incidence[end].append((edge, 1, endpoint_angle(array, 1)))

    pairs: dict[tuple[int, int], tuple[int, int]] = {}
    for items in incidence.values():
        candidates = []
        for left in range(len(items)):
            for right in range(left + 1, len(items)):
                if items[left][0] == items[right][0]:
                    continue
                score = angle_opposition(items[left][2], items[right][2])
                # Degree-two vertices are always one continuous road, even on
                # a sharp bend. At true junctions the greedy ordering below
                # pairs the straightest continuations first and leaves only
                # unavoidable branches unpaired.
                candidates.append((score, items[left], items[right]))
        used: set[tuple[int, int]] = set()
        for _, left, right in sorted(candidates, key=lambda item: item[0]):
            left_key, right_key = (left[0], left[1]), (right[0], right[1])
            if left_key in used or right_key in used:
                continue
            used.update([left_key, right_key])
            pairs[left_key] = right_key
            pairs[right_key] = left_key

    visited: set[int] = set()
    chains: list[tuple[list[int], LineString]] = []

    def walk(first: int, entry: int) -> tuple[list[int], LineString]:
        route_edges: list[int] = []
        route_coords: list[tuple[float, float]] = []
        edge, enter = first, entry
        while edge not in visited and edge in coords:
            visited.add(edge)
            route_edges.append(edge)
            array = coords[edge] if enter == 0 else coords[edge][::-1]
            if route_coords:
                junction = ((route_coords[-1][0] + array[0][0]) / 2.0, (route_coords[-1][1] + array[0][1]) / 2.0)
                route_coords[-1] = junction
                array = array.copy()
                array[0] = junction
                route_coords.extend(map(tuple, array[1:]))
            else:
                route_coords.extend(map(tuple, array))
            connection = pairs.get((edge, 1 - enter))
            if connection is None or connection[0] in visited:
                break
            edge, enter = connection
        return route_edges, LineString(route_coords)

    for edge in edge_ids:
        if edge not in coords or edge in visited:
            continue
        unpaired = [endpoint for endpoint in (0, 1) if (edge, endpoint) not in pairs]
        if unpaired:
            chains.append(walk(edge, unpaired[0]))
    for edge in edge_ids:
        if edge in coords and edge not in visited:
            chains.append(walk(edge, 0))
    return chains


def route_name(frame: pd.DataFrame, basis: str, sequence: int) -> str:
    candidates = []
    if basis == "National alignment":
        candidates.extend(frame["national_link_name"].tolist())
    elif basis == "KCCA alignment":
        candidates.extend(frame["kcca_name"].tolist())
    elif basis == "District-road alignment":
        candidates.extend(frame["district_ref_name"].tolist())
    candidates.extend(frame["road_name"].tolist())
    supplied = [clean(value, "") for value in candidates if clean(value, "")]
    if supplied:
        return Counter(supplied).most_common(1)[0][0]
    towns = [clean(value, "") for field in ["start_town", "end_town", "nearest_town"] for value in frame[field].tolist() if clean(value, "")]
    distinct = list(dict.fromkeys(towns))
    if len(distinct) >= 2:
        return f"{distinct[0]} - {distinct[1]}"
    if distinct:
        return f"{distinct[0]} Access Route"
    county = clean(frame["county"].iloc[0], clean(frame["district"].iloc[0], "Uganda"))
    return f"{county} {highway_family(frame['highway'].iloc[0])} Route {sequence:03d}"


def district_prefix(value: str) -> str:
    text = re.sub(r"[^A-Z]", "", clean(value, "UGAN").upper())
    return (text + "XXXX")[:4]


def multipart_geometry(geometries: gpd.GeoSeries):
    parts = []
    for geometry in geometries:
        if geometry.geom_type == "MultiLineString":
            parts.extend(list(geometry.geoms))
        elif geometry.geom_type == "LineString":
            parts.append(geometry)
    if not parts:
        return LineString()
    return parts[0] if len(parts) == 1 else MultiLineString(parts)


def geometry_endpoint(geometry, end: bool = False) -> tuple[float, float]:
    if geometry.geom_type == "MultiLineString":
        parts = list(geometry.geoms)
        geometry = parts[-1] if end else parts[0]
    return tuple(geometry.coords[-1 if end else 0])[:2]


def main() -> None:
    attributes = pd.read_csv(ATTRIBUTES)
    vehicle_ids = set(attributes["osm_feature_id"].astype(str))
    source = pyogrio.read_dataframe(
        HOTOSM,
        columns=["id", "name", "highway", "surface", "smoothness", "bridge", "oneway", "adm1_name", "adm2_name", "adm3_name", "adm4_name"],
    )
    source["id"] = source["id"].astype(str)
    source = source[source["id"].isin(vehicle_ids)].copy()
    source = source.rename(columns={"id": "osm_feature_id"})[["osm_feature_id", "geometry"]]
    roads = attributes.merge(source, on="osm_feature_id", how="inner", validate="one_to_one")
    roads = gpd.GeoDataFrame(roads, geometry="geometry", crs=4326).to_crs(32636)
    roads = roads.reset_index(drop=True)
    if len(roads) != len(attributes):
        raise RuntimeError(f"Geometry join returned {len(roads):,} of {len(attributes):,} vehicular segments")

    national = roads["national_match"].fillna(False).astype(bool).to_numpy()
    kcca_eligible = (~national) & roads["district"].fillna("").astype(str).str.upper().str.contains("KAMPALA").to_numpy()
    kcca = match_reference(roads, kcca_eligible, KCCA, "Link_ID_1", "Link_Name", "kcca")
    roads = pd.concat([roads, kcca], axis=1)
    district_eligible = (~national) & (~roads["kcca_match"].to_numpy())
    district = match_reference(roads, district_eligible, DISTRICT, "LINK_ID", "ROAD_NAME", "district_ref")
    roads = pd.concat([roads, district], axis=1)

    supplied_name = roads["road_name"].map(norm)
    route_keys = []
    bases = []
    for index, row in roads.iterrows():
        boundary = f"{norm(row.get('district'))}|{norm(row.get('county'))}"
        if bool(row.get("national_match")):
            identity = norm(row.get("national_road_number")) or norm(row.get("national_link_id")) or norm(row.get("national_link_name"))
            route_keys.append(f"{boundary}|NAT|{identity}")
            bases.append("National alignment")
        elif bool(row.get("kcca_match")):
            route_keys.append(f"{boundary}|KCCA|{norm(row.get('kcca_id')) or norm(row.get('kcca_name'))}")
            bases.append("KCCA alignment")
        elif bool(row.get("district_ref_match")):
            route_keys.append(f"{boundary}|DIST|{norm(row.get('district_ref_id')) or norm(row.get('district_ref_name'))}")
            bases.append("District-road alignment")
        elif supplied_name.iat[index]:
            route_keys.append(f"{boundary}|OSM|{supplied_name.iat[index]}")
            bases.append("Supplied OSM road name")
        else:
            route_keys.append(f"{boundary}|TOPO|{highway_family(row.get('highway'))}")
            bases.append("County-bounded straight-through topology")
    roads["route_key"] = route_keys
    roads["route_basis"] = bases

    routes = []
    lineage = []
    prefix_sequences: dict[str, int] = defaultdict(int)
    grouped = roads.groupby("route_key", sort=True)
    for group_number, (_, group) in enumerate(grouped, start=1):
        group_basis = Counter(group["route_basis"]).most_common(1)[0][0]
        chains = build_chains(group) if group_basis == "County-bounded straight-through topology" else [(group.index.tolist(), multipart_geometry(group.geometry))]
        for chain_edges, geometry in chains:
            frame = roads.loc[chain_edges]
            lengths = pd.to_numeric(frame["length_km"], errors="coerce").fillna(0).to_numpy()
            district_name = weighted_mode(frame, "district", lengths)
            prefix = district_prefix(district_name)
            prefix_sequences[prefix] += 1
            route_id = f"{prefix}R{prefix_sequences[prefix]:04d}"
            basis = Counter(frame["route_basis"]).most_common(1)[0][0]
            total_km = float(lengths.sum())
            properties = {
                "source_group_id": route_id,
                "route_id": route_id,
                "road_name": route_name(frame, basis, prefix_sequences[prefix]),
                "route_assignment_basis": basis,
                "source": "HOTOSM Uganda roads / OpenStreetMap snapshot 2026-08-07 with MoWT/KCCA/district alignment joins",
                "region": weighted_mode(frame, "region", lengths),
                "district": district_name,
                "county": weighted_mode(frame, "county", lengths),
                "subcounty": weighted_mode(frame, "subcounty", lengths),
                "highway": weighted_mode(frame, "highway", lengths),
                "functional_class": highway_family(weighted_mode(frame, "highway", lengths)),
                "road_management_class": weighted_mode(frame, "road_management_class", lengths),
                "surface": weighted_mode(frame, "surface", lengths),
                "pavement_class": weighted_mode(frame, "pavement_class", lengths),
                "condition": weighted_mode(frame, "condition", lengths),
                "geometry_length_km": round(total_km, 6),
                "source_feature_count": int(len(frame)),
                "bridge_feature_count": int(frame["bridge"].fillna("").astype(str).str.lower().isin(["yes", "true", "1"]).sum()),
                "named_feature_count": int((frame["road_name"].map(clean) != "Not supplied").sum()),
                "national_aligned": bool(frame["national_match"].fillna(False).any()),
                "national_road_number": weighted_mode(frame, "national_road_number", lengths),
                "district_reference_id": weighted_mode(frame, "district_ref_id", lengths),
                "kcca_reference_id": weighted_mode(frame, "kcca_id", lengths),
                "coordinate_reference_system": "EPSG:4326",
                "length_measurement_crs": "EPSG:32636",
            }
            for field in NUMERIC_MEANS:
                values = pd.to_numeric(frame[field], errors="coerce")
                valid = values.notna().to_numpy() & (lengths > 0)
                properties[field] = round(float(np.average(values.to_numpy()[valid], weights=lengths[valid])), 1) if valid.any() else 0
            properties["traffic_value_status"] = weighted_mode(frame, "traffic_value_status", lengths)
            properties["road_safety_risk_band"] = weighted_mode(frame, "road_safety_risk_band", lengths)
            routes.append({"geometry": geometry, **properties})
            lineage.extend({"osm_feature_id": value, "route_id": route_id, "route_assignment_basis": basis} for value in frame["osm_feature_id"])
        if group_number % 500 == 0:
            print(f"Merged {group_number:,}/{len(grouped):,} route-key groups into {len(routes):,} routes", flush=True)

    route_frame = gpd.GeoDataFrame(routes, geometry="geometry", crs=32636)
    route_frame["merged_geometry_km"] = route_frame.length / 1000.0
    route_frame["geometry_variance_pct"] = np.where(route_frame["geometry_length_km"] > 0, (route_frame["merged_geometry_km"] / route_frame["geometry_length_km"] - 1) * 100, 0)
    geographic = route_frame.to_crs(4326).geometry
    route_frame["start_x_coordinate_dd"] = geographic.map(lambda geom: geometry_endpoint(geom)[0])
    route_frame["start_y_coordinate_dd"] = geographic.map(lambda geom: geometry_endpoint(geom)[1])
    route_frame["end_x_coordinate_dd"] = geographic.map(lambda geom: geometry_endpoint(geom, True)[0])
    route_frame["end_y_coordinate_dd"] = geographic.map(lambda geom: geometry_endpoint(geom, True)[1])

    GIS_DIR.mkdir(parents=True, exist_ok=True)
    if GIS_GPKG.exists():
        GIS_GPKG.unlink()
    route_frame.to_file(GIS_GPKG, layer="merged_routes", driver="GPKG")
    pd.DataFrame(lineage).to_csv(GIS_DIR / "hotosm_segment_route_relations.csv", index=False)
    with gzip.open(ROUTE_CSV, "wt", encoding="utf-8", newline="") as stream:
        pd.DataFrame(route_frame.drop(columns="geometry")).to_csv(stream, index=False)
    with gzip.open(LINEAGE_CSV, "wt", encoding="utf-8", newline="") as stream:
        pd.DataFrame(lineage).to_csv(stream, index=False)

    web = route_frame.copy()
    web.geometry = web.geometry.simplify(10.0, preserve_topology=True)
    web = web.to_crs(4326)
    payload = json.loads(web.to_json(drop_id=True))
    total_source_km = float(pd.to_numeric(attributes["length_km"], errors="coerce").fillna(0).sum())
    total_route_km = float(route_frame["geometry_length_km"].sum())
    payload.update({
        "name": "Uganda complete vehicular road routes - topologically merged",
        "metadata": {
            "source": str(HOTOSM),
            "source_snapshot": "2026-08-07",
            "vehicular_source_features": int(len(attributes)),
            "vehicular_length_km": round(total_source_km, 6),
            "merged_route_features": int(len(route_frame)),
            "display_groups": int(len(route_frame)),
            "snap_tolerance_m": SNAP_METRES,
            "county_boundary_rule": "Routes never merge across district/county route keys",
            "route_hierarchy": ["National alignment", "KCCA alignment", "District-road alignment", "Supplied OSM road name", "County-bounded straight-through topology"],
            "lineage_records": int(len(lineage)),
            "reporting_note": "Every vehicular HOTOSM segment belongs to exactly one longer route; source length is preserved without scaling.",
        },
    })
    WEB.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    audit = {
        "source_segments": int(len(attributes)),
        "source_length_km": round(total_source_km, 6),
        "merged_routes": int(len(route_frame)),
        "merged_route_length_km": round(total_route_km, 6),
        "length_variance_km": round(total_route_km - total_source_km, 9),
        "source_segments_per_route_mean": round(len(attributes) / max(len(route_frame), 1), 3),
        "single_segment_routes": int((route_frame["source_feature_count"] == 1).sum()),
        "national_aligned_segments": int(national.sum()),
        "kcca_aligned_segments": int(roads["kcca_match"].sum()),
        "district_aligned_segments": int(roads["district_ref_match"].sum()),
        "named_osm_segments": int((roads["road_name"].map(clean) != "Not supplied").sum()),
        "route_basis_counts": route_frame["route_assignment_basis"].value_counts().to_dict(),
        "gis_geopackage": str(GIS_GPKG),
        "web_geojson": str(WEB),
    }
    AUDIT.write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(audit, indent=2), flush=True)


if __name__ == "__main__":
    main()
