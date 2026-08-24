from __future__ import annotations

"""Inventory and validate every shapefile beneath the DUCAR repository.

The audit is deliberately read-only with respect to source files. Exact copies
are fingerprinted once, while every path remains represented in the report.
Line layers receive full geometry, CRS, bounds and projected-length checks.
"""

import hashlib
import json
from collections import Counter
from pathlib import Path

import geopandas as gpd
import pyogrio


ROOT = Path(__file__).resolve().parents[1]
DUCAR = ROOT.parent
OUTPUT = ROOT / "data" / "spatial_source_inventory_audit_2026.json"
SIDECARS = (".shp", ".shx", ".dbf", ".prj", ".cpg")


def fingerprint(path: Path) -> str:
    digest = hashlib.sha256()
    for suffix in SIDECARS:
        item = path.with_suffix(suffix)
        if not item.exists():
            continue
        digest.update(suffix.encode())
        with item.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
    return digest.hexdigest()


def text_crs(value: object) -> str:
    text = str(value or "Unknown")
    return text if len(text) <= 240 else text[:237] + "..."


def main() -> None:
    paths = sorted((item for item in DUCAR.rglob("*.shp") if item.is_file()), key=lambda item: str(item).lower())
    records: list[dict[str, object]] = []
    signatures: Counter[str] = Counter()
    for path in paths:
        signature = fingerprint(path)
        signatures[signature] += 1
        record: dict[str, object] = {
            "path": str(path.relative_to(DUCAR)),
            "fingerprint": signature,
            "exact_copy_number": signatures[signature],
        }
        try:
            info = pyogrio.read_info(path)
            fields = [str(value) for value in info.get("fields", [])]
            geometry_type = str(info.get("geometry_type") or "Unknown")
            record.update(
                {
                    "status": "Readable",
                    "feature_count": int(info.get("features", 0)),
                    "geometry_type": geometry_type,
                    "crs": text_crs(info.get("crs")),
                    "field_count": len(fields),
                    "fields": fields,
                    "source_bounds": [round(float(value), 7) for value in info.get("total_bounds", [])],
                }
            )
            if "Line" in geometry_type and signatures[signature] == 1:
                frame = gpd.read_file(path, engine="pyogrio")
                nonempty = frame.geometry.notna() & ~frame.geometry.is_empty
                valid = frame.loc[nonempty].geometry.is_valid
                record.update(
                    {
                        "null_or_empty_geometries": int((~nonempty).sum()),
                        "invalid_geometries": int((~valid).sum()),
                        "duplicate_geometries": int(frame.loc[nonempty].geometry.to_wkb().duplicated().sum()),
                    }
                )
                if frame.crs and nonempty.any():
                    projected = frame.loc[nonempty].to_crs(32636)
                    record["projected_length_km"] = round(float(projected.length.sum() / 1000.0), 6)
                    geographic = frame.loc[nonempty].to_crs(4326)
                    record["wgs84_bounds"] = [round(float(value), 7) for value in geographic.total_bounds]
                    bounds = geographic.total_bounds
                    record["outside_uganda_extent"] = bool(
                        bounds[0] < 28.0 or bounds[2] > 36.5 or bounds[1] < -2.5 or bounds[3] > 5.5
                    )
        except Exception as error:
            record.update({"status": "Unreadable", "error": str(error)})
        records.append(record)
        print(f"{len(records):,}/{len(paths):,} {record['path']}", flush=True)

    duplicate_groups = [
        {
            "fingerprint": signature,
            "copies": count,
            "paths": [record["path"] for record in records if record["fingerprint"] == signature],
        }
        for signature, count in signatures.items()
        if count > 1
    ]
    unique_records = [record for record in records if record["exact_copy_number"] == 1]
    line_records = [record for record in unique_records if "Line" in str(record.get("geometry_type", ""))]
    report = {
        "audit_year": 2026,
        "scope_root": str(DUCAR),
        "shapefile_paths": len(records),
        "unique_shapefile_datasets": len(signatures),
        "exact_duplicate_paths": len(records) - len(signatures),
        "readable_paths": sum(record.get("status") == "Readable" for record in records),
        "unreadable_paths": sum(record.get("status") != "Readable" for record in records),
        "unique_line_datasets": len(line_records),
        "unique_line_features": sum(int(record.get("feature_count", 0)) for record in line_records),
        "unique_line_null_or_empty_geometries": sum(int(record.get("null_or_empty_geometries", 0)) for record in line_records),
        "unique_line_invalid_geometries": sum(int(record.get("invalid_geometries", 0)) for record in line_records),
        "duplicate_groups": duplicate_groups,
        "datasets": records,
        "selection_policy": {
            "national_roads": "MoWT National Roads/network2026/network2026.shp is the current authoritative FY2025/26 alignment and attribute register.",
            "complete_vehicular_geometry": "HOTOSM roads_lines.shp is the exhaustive 248,616.15 km geometry population; other road layers supply names and classifications through spatial joins without replacing its geometry.",
            "district_roads": "The 2025 district register and 2026 merged output are reference alignments; source lineage is retained.",
            "administrative_relations": "Administrative units - Uganda layers are used from district through village for spatial containment joins.",
        },
    }
    OUTPUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in list(report)[:11]}, indent=2), flush=True)


if __name__ == "__main__":
    main()
