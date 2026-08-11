"""Build the browser-ready DUCAR link and administrative coverage registry.

The source route GeoJSON is incorrectly labelled EPSG:4326 even though its
coordinates are UTM Zone 36N.  This pipeline repairs the CRS, calculates
geometry-derived lengths, intersects every mapped route with parish polygons,
and joins only traffic values that already exist in the supplied link registry.
No AADT, PCU, or speed values are invented.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely


REPO = Path(__file__).resolve().parents[1]
SOURCE_ROOT = REPO.parent
DATA = REPO / "data"
ADMIN = SOURCE_ROOT / "Administrative units - Uganda" / "ug_parishes.shp"


def clean(value: object, fallback: str = "UNASSIGNED") -> str:
    if value is None or pd.isna(value):
        return fallback
    text = str(value).strip()
    return text if text else fallback


def stable_link_id(row: pd.Series) -> str:
    district = "".join(ch for ch in clean(row["district"]) if ch.isalnum())[:4].upper() or "UNAS"
    signature = "|".join(
        [clean(row["source_code"], ""), clean(row["road_name"], ""), clean(row["district"], ""), row.geometry.wkb_hex]
    )
    digest = hashlib.sha1(signature.encode("utf-8")).hexdigest()[:8].upper()
    return f"UG-DUC-{district}-{digest}"


def build() -> None:
    routes = gpd.read_file(DATA / "ducar_2025_routes_web.geojson")
    routes.geometry = shapely.force_2d(routes.geometry.array)
    # Source coordinates are UTM 36N despite the embedded CRS84 declaration.
    routes = routes.set_crs(32636, allow_override=True)
    routes = routes.rename(columns={"c": "source_code", "n": "road_name", "d": "district", "l": "source_length_km", "s": "surface", "p": "condition"})
    routes["geometry_length_km"] = routes.geometry.length / 1000
    routes["source_length_km"] = pd.to_numeric(routes["source_length_km"], errors="coerce")
    routes["length_variance_pct"] = np.where(
        routes["source_length_km"].gt(0),
        (routes["geometry_length_km"] - routes["source_length_km"]) / routes["source_length_km"] * 100,
        np.nan,
    )
    routes["length_quality"] = np.select(
        [routes["source_length_km"].isna(), routes["length_variance_pct"].abs().le(15), routes["length_variance_pct"].abs().le(35)],
        ["Source length missing", "Aligned (<=15%)", "Review (15-35%)"],
        default="Material variance (>35%)",
    )
    routes["district"] = routes["district"].map(clean).str.upper()
    routes["road_name"] = routes["road_name"].map(lambda value: clean(value, "Unnamed road"))
    routes["surface"] = routes["surface"].map(clean)
    routes["condition"] = routes["condition"].map(clean)
    routes["link_id"] = routes.apply(stable_link_id, axis=1)
    # Some source rows are exact duplicates. Preserve them as separate links,
    # but append a deterministic occurrence suffix so IDs remain unique.
    occurrence = routes.groupby("link_id").cumcount().add(1)
    duplicate_count = routes.groupby("link_id")["link_id"].transform("size")
    routes["link_id"] = np.where(
        duplicate_count.gt(1),
        routes["link_id"] + "-" + occurrence.astype(str).str.zfill(2),
        routes["link_id"],
    )

    registry = json.loads((DATA / "uganda_link_level_master_registry.json").read_text(encoding="utf-8"))
    traffic = pd.DataFrame(registry["links_sample"])
    traffic["code"] = traffic["code"].astype(str)
    traffic = traffic.drop_duplicates("code").set_index("code")
    routes["registry_speed_kmh"] = routes["source_code"].astype(str).map(traffic["speed_kmh"])
    routes["registry_aadt"] = routes["source_code"].astype(str).map(traffic["aadt"])
    routes["registry_pcu"] = routes["source_code"].astype(str).map(traffic["pcu"])
    routes["traffic_source"] = np.where(routes["registry_aadt"].notna(), "Supplied DUCAR link registry", "No link-level traffic value supplied")

    condition_score = {"Good": 25, "Fair": 60, "Poor": 90}
    surface_risk = {"Bituminous": 15, "Gravel": 55, "Earth": 75}
    routes["condition_risk"] = routes["condition"].map(condition_score)
    routes["surface_risk"] = routes["surface"].map(surface_risk).fillna(50)
    traffic_percentile = routes["registry_pcu"].rank(pct=True).mul(100)
    routes["planning_priority_score"] = (
        routes["condition_risk"].fillna(50) * 0.55
        + routes["surface_risk"] * 0.25
        + traffic_percentile.fillna(0) * 0.20
    ).round(1)
    routes["priority_basis"] = np.where(
        routes["registry_pcu"].notna(),
        "55% condition + 25% surface + 20% supplied PCU percentile",
        "55% condition + 25% surface; traffic component unavailable",
    )

    admin = gpd.read_file(ADMIN).to_crs(32636)
    admin = admin[["DNAME_2011", "CNAME_2006", "SNAME_2006", "PNAME_2006", "geometry"]].rename(
        columns={"DNAME_2011": "admin_district", "CNAME_2006": "county", "SNAME_2006": "subcounty", "PNAME_2006": "parish"}
    )
    candidates = gpd.sjoin(routes[["link_id", "geometry"]], admin, predicate="intersects", how="left")
    candidates = candidates.dropna(subset=["index_right"]).copy()
    left_geom = routes.geometry.loc[candidates.index].reset_index(drop=True)
    right_geom = admin.geometry.loc[candidates["index_right"].astype(int)].reset_index(drop=True)
    candidates["covered_length_km"] = shapely.length(shapely.intersection(left_geom.array, right_geom.array)) / 1000
    coverage = candidates[candidates["covered_length_km"] >= 0.005].copy()
    coverage["admin_district"] = coverage["admin_district"].map(clean).str.upper()
    coverage["county"] = coverage["county"].map(clean).str.upper()
    coverage["subcounty"] = coverage["subcounty"].map(clean).str.upper()
    coverage["parish"] = coverage["parish"].map(clean).str.upper()
    coverage = coverage[["link_id", "admin_district", "county", "subcounty", "parish", "covered_length_km"]]
    coverage["covered_length_km"] = coverage["covered_length_km"].round(3)

    primary = coverage.sort_values("covered_length_km", ascending=False).drop_duplicates("link_id").set_index("link_id")
    for col in ["admin_district", "county", "subcounty", "parish"]:
        routes[col] = routes["link_id"].map(primary[col])

    # A compact nested list keeps the browser payload small while retaining
    # every link-to-administrative-unit length relationship.
    coverage_by_link = {}
    for row in coverage.itertuples(index=False):
        coverage_by_link.setdefault(row.link_id, []).append(
            {"district": row.admin_district, "county": row.county, "subcounty": row.subcounty, "parish": row.parish, "length_km": row.covered_length_km}
        )
    routes["admin_coverage"] = routes["link_id"].map(coverage_by_link).map(lambda value: value if isinstance(value, list) else [])

    admin_summary = (
        coverage.groupby(["admin_district", "county", "subcounty", "parish"], dropna=False)
        .agg(link_count=("link_id", "nunique"), covered_length_km=("covered_length_km", "sum"))
        .reset_index()
        .sort_values("covered_length_km", ascending=False)
    )
    admin_summary["covered_length_km"] = admin_summary["covered_length_km"].round(2)

    keep = [
        "link_id", "source_code", "road_name", "district", "admin_district", "county", "subcounty", "parish",
        "surface", "condition", "source_length_km", "geometry_length_km", "length_variance_pct", "length_quality",
        "registry_speed_kmh", "registry_aadt", "registry_pcu", "traffic_source", "condition_risk", "surface_risk",
        "planning_priority_score", "priority_basis", "admin_coverage", "geometry",
    ]
    web = routes[keep].to_crs(4326)
    numeric = ["source_length_km", "geometry_length_km", "length_variance_pct", "registry_speed_kmh", "registry_aadt", "registry_pcu", "condition_risk", "surface_risk", "planning_priority_score"]
    for col in numeric:
        decimals = 3 if col in {"source_length_km", "geometry_length_km"} else 2
        web[col] = pd.to_numeric(web[col], errors="coerce").round(decimals)
    web.to_file(DATA / "ducar_link_reporting.geojson", driver="GeoJSON")

    link_records = web.drop(columns="geometry").replace({np.nan: None}).to_dict(orient="records")
    (DATA / "ducar_link_register.json").write_text(json.dumps(link_records, separators=(",", ":")), encoding="utf-8")
    map_layer = web[["link_id", "condition", "geometry"]].copy().to_crs(32636)
    map_layer.geometry = map_layer.geometry.simplify(20, preserve_topology=True)
    map_layer.to_crs(4326).to_file(DATA / "ducar_link_map.geojson", driver="GeoJSON")

    quality = {
        "generated_at": pd.Timestamp.now(tz="UTC").isoformat(),
        "mapped_links": int(len(web)),
        "geometry_length_km": round(float(routes["geometry_length_km"].sum()), 2),
        "source_length_km": round(float(routes["source_length_km"].sum()), 2),
        "traffic_links": int(routes["registry_aadt"].notna().sum()),
        "traffic_coverage_pct": round(float(routes["registry_aadt"].notna().mean() * 100), 1),
        "admin_intersections": int(len(coverage)),
        "districts": int(coverage["admin_district"].nunique()),
        "subcounties": int(coverage["subcounty"].nunique()),
        "parishes": int(coverage["parish"].nunique()),
        "length_quality": routes["length_quality"].value_counts().to_dict(),
        "method": "CRS repair (EPSG:32636 to EPSG:4326), geometry length calculation, line/polygon intersection against parish boundaries, exact source-code traffic join, deterministic SHA-1 link IDs.",
        "caveats": [
            "The mapped web route layer contains 7,733 geometries; the wider source inventory reports 31,106 records.",
            "AADT, PCU and speed remain null where the supplied link registry has no exact source-code match.",
            "The traffic-flow GeoJSON contains national-road reference routes only and is not presented as DUCAR link traffic.",
            "Geometry-derived length is the reporting length; the original source length is preserved for audit and variance checks.",
        ],
    }
    (DATA / "ducar_link_reporting_summary.json").write_text(
        json.dumps({"quality": quality, "administrative_units": admin_summary.to_dict(orient="records")}, indent=2), encoding="utf-8"
    )
    print(json.dumps(quality, indent=2))


if __name__ == "__main__":
    build()
