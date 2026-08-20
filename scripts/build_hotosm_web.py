from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

import pyogrio


SOURCE = Path(r"D:\OneDrive\Uganda National Road Network Repository\DUCAR\hotosm_uga_roads_osm_shp\roads_lines.shp")
OUTPUT_DIR = Path("data")
CHUNK_SIZE = 50_000
VEHICULAR_HIGHWAYS = {
    "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
    "secondary", "secondary_link", "tertiary", "tertiary_link", "residential",
    "unclassified", "service", "track", "road", "living_street", "busway",
    "escape", "raceway", "rest_area", "services", "construction", "passing_place",
}
PAVED = {"asphalt", "paved", "concrete", "concrete:lanes", "concrete:plates", "paving_stones", "cobblestone", "sett", "metal", "wood", "bricks"}
UNPAVED = {"unpaved", "ground", "dirt", "earth", "gravel", "fine_gravel", "compacted", "pebblestone", "sand", "mud", "clay", "grass", "grass_paver"}
GOOD = {"excellent", "very_good", "good"}
FAIR = {"intermediate"}
POOR = {"bad", "very_bad", "horrible", "very_horrible", "impassable"}
SOURCE_FIELDS = ["name", "surface", "smoothness", "width", "lanes", "oneway", "bridge", "layer", "adm1_name", "adm2_name", "adm3_name", "adm4_name"]


def clean(value: object, fallback: str = "Not supplied") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text if text and text.lower() != "nan" else fallback


def pavement(surface: str) -> str:
    value = surface.lower()
    if value in PAVED:
        return "Paved"
    if value in UNPAVED:
        return "Unpaved"
    return "Unclassified"


def condition(smoothness: str) -> str:
    value = smoothness.lower()
    if value in GOOD:
        return "Good"
    if value in FAIR:
        return "Fair"
    if value in POOR:
        return "Poor"
    return "Unclassified"


def management_class(highway: str) -> str:
    if highway in {"motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link"}:
        return "National-road candidate"
    if highway in {"secondary", "secondary_link", "tertiary", "tertiary_link"}:
        return "District-road candidate"
    if highway in {"residential", "service", "living_street", "busway", "services", "rest_area"}:
        return "Urban/local-road candidate"
    if highway in {"unclassified", "track", "road"}:
        return "Community-access candidate"
    return "Other vehicular candidate"


def blank_summary() -> dict[str, object]:
    return {
        "feature_count": 0,
        "length_km": 0.0,
        "paved_km": 0.0,
        "unpaved_km": 0.0,
        "unclassified_pavement_km": 0.0,
        "good_condition_km": 0.0,
        "fair_condition_km": 0.0,
        "poor_condition_km": 0.0,
        "unclassified_condition_km": 0.0,
        "named_feature_count": 0,
        "bridge_feature_count": 0,
        "oneway_feature_count": 0,
    }


def add_summary(summary: dict[str, object], length_km: float, paved: str, road_condition: str, named: bool, bridge: bool, oneway: bool) -> None:
    summary["feature_count"] += 1
    summary["length_km"] += length_km
    summary[{"Paved": "paved_km", "Unpaved": "unpaved_km"}.get(paved, "unclassified_pavement_km")] += length_km
    summary[{"Good": "good_condition_km", "Fair": "fair_condition_km", "Poor": "poor_condition_km"}.get(road_condition, "unclassified_condition_km")] += length_km
    summary["named_feature_count"] += int(named)
    summary["bridge_feature_count"] += int(bridge)
    summary["oneway_feature_count"] += int(oneway)


def rounded(summary: dict[str, object]) -> dict[str, object]:
    return {key: round(value, 6) if isinstance(value, float) else value for key, value in summary.items()}


def main() -> None:
    info = pyogrio.read_info(SOURCE)
    total_features = int(info["features"])
    geometry_groups: dict[tuple[str, str, str, str, str], dict[str, object]] = {}
    summaries = {dimension: defaultdict(blank_summary) for dimension in ["region", "district", "county", "subcounty", "highway", "surface", "pavement", "condition", "management_class"]}
    completeness = {field: {"supplied_features": 0, "supplied_length_km": 0.0} for field in SOURCE_FIELDS}
    total = blank_summary()
    highway_frequencies = Counter()

    columns = ["id", "name", "highway", "surface", "smoothness", "width", "lanes", "oneway", "bridge", "layer", "adm1_name", "adm2_name", "adm3_name", "adm4_name"]
    for offset in range(0, total_features, CHUNK_SIZE):
        frame = pyogrio.read_dataframe(SOURCE, columns=columns, skip_features=offset, max_features=CHUNK_SIZE)
        frame = frame[frame["highway"].isin(VEHICULAR_HIGHWAYS)].copy()
        frame["length_km"] = frame.to_crs(32636).geometry.length / 1000.0
        for row in frame.itertuples(index=False):
            highway = clean(row.highway).lower()
            surface = clean(row.surface)
            smoothness = clean(row.smoothness)
            paved = pavement(surface)
            road_condition = condition(smoothness)
            road_management = management_class(highway)
            region, district, county, subcounty = (clean(row.adm1_name), clean(row.adm2_name), clean(row.adm3_name), clean(row.adm4_name))
            length_km = float(row.length_km)
            named = clean(row.name) != "Not supplied"
            bridge = clean(row.bridge).lower() not in {"not supplied", "no", "false", "0"}
            oneway = clean(row.oneway).lower() in {"yes", "true", "1", "-1", "reversible"}
            add_summary(total, length_km, paved, road_condition, named, bridge, oneway)
            highway_frequencies[highway] += 1
            for dimension, key in [
                ("region", region), ("district", district), ("county", county), ("subcounty", subcounty),
                ("highway", highway), ("surface", surface), ("pavement", paved),
                ("condition", road_condition), ("management_class", road_management),
            ]:
                add_summary(summaries[dimension][key], length_km, paved, road_condition, named, bridge, oneway)
            for field in SOURCE_FIELDS:
                if clean(getattr(row, field)) != "Not supplied":
                    completeness[field]["supplied_features"] += 1
                    completeness[field]["supplied_length_km"] += length_km

            group_key = (region, district, highway, paved, road_condition)
            group = geometry_groups.setdefault(group_key, {"coordinates": [], "length_km": 0.0, "feature_count": 0, "bridge_count": 0, "named_count": 0})
            simplified = row.geometry.simplify(0.00025, preserve_topology=False)
            if not simplified.is_empty:
                group["coordinates"].append([[round(x, 6), round(y, 6)] for x, y in simplified.coords])
            group["length_km"] += length_km
            group["feature_count"] += 1
            group["bridge_count"] += int(bridge)
            group["named_count"] += int(named)
        print(f"{min(offset + CHUNK_SIZE, total_features):,}/{total_features:,}", flush=True)

    features = []
    for index, (key, group) in enumerate(sorted(geometry_groups.items()), start=1):
        region, district, highway, paved, road_condition = key
        features.append({
            "type": "Feature",
            "id": f"HOTOSM-GROUP-{index:05d}",
            "geometry": {"type": "MultiLineString", "coordinates": group["coordinates"]},
            "properties": {
                "source_group_id": f"HOTOSM-GROUP-{index:05d}",
                "source": "HOTOSM Uganda roads / OpenStreetMap snapshot 2026-08-07",
                "region": region,
                "district": district,
                "highway": highway,
                "road_management_class": management_class(highway),
                "pavement_class": paved,
                "condition": road_condition,
                "geometry_length_km": round(group["length_km"], 6),
                "source_feature_count": group["feature_count"],
                "bridge_feature_count": group["bridge_count"],
                "named_feature_count": group["named_count"],
                "coordinate_reference_system": "EPSG:4326",
                "length_measurement_crs": "EPSG:32636",
            },
        })

    map_payload = {
        "type": "FeatureCollection",
        "name": "HOTOSM Uganda complete vehicular road network",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "metadata": {
            "source": str(SOURCE),
            "source_snapshot": "2026-08-07",
            "source_line_features": total_features,
            "vehicular_source_features": total["feature_count"],
            "vehicular_length_km": round(total["length_km"], 6),
            "display_groups": len(features),
            "display_simplification_degrees": 0.00025,
            "reporting_note": "Every vehicular source geometry contributes to one display group; grouping and cartographic simplification reduce web transfer without selecting a subset.",
        },
        "features": features,
    }
    analysis = {
        "status": "complete_hotosm_vehicular_analysis",
        "source_file": str(SOURCE),
        "source_snapshot": "2026-08-07",
        "source_crs": str(info["crs"]),
        "length_measurement_crs": "EPSG:32636",
        "vehicular_highway_classes": sorted(VEHICULAR_HIGHWAYS),
        "excluded_non_vehicular_classes": sorted(set(highway_frequencies) - VEHICULAR_HIGHWAYS),
        "total": rounded(total),
        "attribute_completeness": {field: rounded(values) for field, values in completeness.items()},
        "summaries": {dimension: [{"category": category, **rounded(values)} for category, values in sorted(groups.items())] for dimension, groups in summaries.items()},
        "derivation_policy": {
            "pavement": "Paved and Unpaved are derived only from supplied OSM surface tags; missing or unfamiliar surfaces remain Unclassified.",
            "condition": "Good, Fair and Poor are derived only from supplied OSM smoothness tags; missing values remain Unclassified.",
            "management_class": "Functional classes are analytical candidates based on OSM highway tags, not statutory ownership assignments.",
            "missing_values": "Not supplied values remain explicit and are never imputed.",
        },
    }
    OUTPUT_DIR.mkdir(exist_ok=True)
    (OUTPUT_DIR / "hotosm_vehicular_map.geojson").write_text(json.dumps(map_payload, separators=(",", ":")), encoding="utf-8")
    (OUTPUT_DIR / "hotosm_vehicular_analysis.json").write_text(json.dumps(analysis, indent=2), encoding="utf-8")
    print(json.dumps({"vehicular_features": total["feature_count"], "vehicular_length_km": round(total["length_km"], 6), "display_groups": len(features)}, indent=2))


if __name__ == "__main__":
    main()
