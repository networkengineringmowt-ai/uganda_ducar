from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import pyogrio
from pyproj import Geod


SOURCE = Path(r"D:\OneDrive\Uganda National Road Network Repository\DUCAR\hotosm_uga_roads_osm_shp\roads_lines.shp")
CHUNK_SIZE = 50_000
VEHICULAR_HIGHWAYS = {
    "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
    "secondary", "secondary_link", "tertiary", "tertiary_link", "residential",
    "unclassified", "service", "track", "road", "living_street", "busway",
    "escape", "raceway", "rest_area", "services", "construction", "passing_place",
}
GEOD = Geod(ellps="WGS84")


def main() -> None:
    info = pyogrio.read_info(SOURCE)
    total_features = int(info["features"])
    totals = defaultdict(lambda: {"features": 0, "length_km": 0.0})
    district_totals = defaultdict(lambda: {"features": 0, "length_km": 0.0})
    region_totals = defaultdict(lambda: {"features": 0, "length_km": 0.0})
    all_length = 0.0
    vehicular_length = 0.0
    vehicular_geodesic_length = 0.0
    vehicular_features = 0

    for offset in range(0, total_features, CHUNK_SIZE):
        frame = pyogrio.read_dataframe(
            SOURCE,
            columns=["highway", "adm1_name", "adm2_name"],
            skip_features=offset,
            max_features=CHUNK_SIZE,
        )
        lengths = frame.to_crs(32636).geometry.length / 1000.0
        frame = frame.assign(length_km=lengths)
        all_length += float(lengths.sum())
        for highway, group in frame.groupby(frame["highway"].fillna("Not supplied"), dropna=False):
            totals[str(highway)]["features"] += int(len(group))
            totals[str(highway)]["length_km"] += float(group["length_km"].sum())
        vehicle = frame[frame["highway"].isin(VEHICULAR_HIGHWAYS)]
        vehicle_geodesic = vehicle.geometry.apply(lambda geometry: abs(GEOD.geometry_length(geometry)) / 1000.0)
        vehicular_features += int(len(vehicle))
        vehicular_length += float(vehicle["length_km"].sum())
        vehicular_geodesic_length += float(vehicle_geodesic.sum())
        for district, group in vehicle.groupby(vehicle["adm2_name"].fillna("Not supplied"), dropna=False):
            district_totals[str(district)]["features"] += int(len(group))
            district_totals[str(district)]["length_km"] += float(group["length_km"].sum())
        for region, group in vehicle.groupby(vehicle["adm1_name"].fillna("Not supplied"), dropna=False):
            region_totals[str(region)]["features"] += int(len(group))
            region_totals[str(region)]["length_km"] += float(group["length_km"].sum())
        print(f"{min(offset + len(frame), total_features):,}/{total_features:,}", flush=True)

    result = {
        "source": str(SOURCE),
        "crs": str(info["crs"]),
        "length_method": "EPSG:32636 projected geometry length",
        "all_line_features": total_features,
        "all_line_length_km": round(all_length, 6),
        "vehicular_highways": sorted(VEHICULAR_HIGHWAYS),
        "vehicular_features": vehicular_features,
        "vehicular_length_km": round(vehicular_length, 6),
        "vehicular_geodesic_length_km": round(vehicular_geodesic_length, 6),
        "highway_summary": dict(sorted(totals.items(), key=lambda item: -item[1]["length_km"])),
        "district_summary": dict(sorted(district_totals.items())),
        "region_summary": dict(sorted(region_totals.items())),
    }
    Path("data/hotosm_vehicular_audit.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({key: result[key] for key in ["all_line_features", "all_line_length_km", "vehicular_features", "vehicular_length_km", "vehicular_geodesic_length_km"]}, indent=2))


if __name__ == "__main__":
    main()
