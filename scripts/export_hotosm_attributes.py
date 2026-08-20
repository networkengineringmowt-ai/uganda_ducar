from __future__ import annotations

import csv
import gzip
from pathlib import Path

import pyogrio

from build_hotosm_web import SOURCE, CHUNK_SIZE, VEHICULAR_HIGHWAYS, clean, condition, management_class, pavement


OUTPUT = Path("data/hotosm_vehicular_link_attributes.csv.gz")
FIELDS = [
    "osm_feature_id", "road_name", "highway", "surface", "smoothness", "width", "lanes", "oneway", "bridge", "layer",
    "region", "district", "county", "subcounty", "pavement_class", "condition", "road_management_class",
    "length_km", "x_coordinate_dd", "y_coordinate_dd", "coordinate_basis", "source_snapshot", "linkage_status",
]


def main() -> None:
    feature_total = int(pyogrio.read_info(SOURCE)["features"])
    columns = ["id", "name", "highway", "surface", "smoothness", "width", "lanes", "oneway", "bridge", "layer", "adm1_name", "adm2_name", "adm3_name", "adm4_name"]
    with gzip.open(OUTPUT, "wt", newline="", encoding="utf-8", compresslevel=6) as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS)
        writer.writeheader()
        for offset in range(0, feature_total, CHUNK_SIZE):
            frame = pyogrio.read_dataframe(SOURCE, columns=columns, skip_features=offset, max_features=CHUNK_SIZE)
            frame = frame[frame["highway"].isin(VEHICULAR_HIGHWAYS)].copy()
            frame["length_km"] = frame.to_crs(32636).geometry.length / 1000.0
            for row in frame.itertuples(index=False):
                midpoint = row.geometry.interpolate(0.5, normalized=True)
                highway = clean(row.highway).lower()
                surface = clean(row.surface)
                writer.writerow({
                    "osm_feature_id": clean(row.id),
                    "road_name": clean(row.name),
                    "highway": highway,
                    "surface": surface,
                    "smoothness": clean(row.smoothness),
                    "width": clean(row.width),
                    "lanes": clean(row.lanes),
                    "oneway": clean(row.oneway),
                    "bridge": clean(row.bridge),
                    "layer": clean(row.layer),
                    "region": clean(row.adm1_name),
                    "district": clean(row.adm2_name),
                    "county": clean(row.adm3_name),
                    "subcounty": clean(row.adm4_name),
                    "pavement_class": pavement(surface),
                    "condition": condition(clean(row.smoothness)),
                    "road_management_class": management_class(highway),
                    "length_km": f"{float(row.length_km):.6f}",
                    "x_coordinate_dd": f"{midpoint.x:.7f}",
                    "y_coordinate_dd": f"{midpoint.y:.7f}",
                    "coordinate_basis": "WGS84 midpoint of HOTOSM source geometry",
                    "source_snapshot": "2026-08-07",
                    "linkage_status": "HOTOSM source segment; governed DUCAR Link ID not assigned",
                })
            print(f"{min(offset + CHUNK_SIZE, feature_total):,}/{feature_total:,}", flush=True)
    print(f"Wrote {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
