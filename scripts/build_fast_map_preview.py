from __future__ import annotations

"""Create the non-blocking map preview while preserving the original geometry."""

import gzip
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SOURCE = DATA / "ducar_socioeconomic_roads.geojson"
OUTPUT = DATA / "ducar_map_preview.geojson.gz"

FIELDS = [
    "link_id",
    "road_name",
    "road_name_display",
    "district",
    "surface",
    "pavement_class",
    "condition",
    "geometry_length_km",
    "registry_aadt",
    "registry_pcu",
    "registry_speed_kmh",
    "speed_mean_kmh",
    "planning_priority_score",
    "priority_band",
    "road_safety_risk_band",
    "traffic_value_status",
    "start_town",
    "end_town",
]


def main() -> None:
    payload = json.loads(SOURCE.read_text(encoding="utf-8"))
    for feature in payload["features"]:
        properties = feature.get("properties") or {}
        feature["properties"] = {field: properties.get(field) for field in FIELDS}
    payload["name"] = "DUCAR fast source-geometry preview"
    payload["metadata"] = {
        "source": str(SOURCE),
        "feature_count": len(payload["features"]),
        "geometry_policy": "Geometry copied without simplification; exhaustive attributes load asynchronously.",
        "retained_properties": FIELDS,
    }
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    with gzip.open(OUTPUT, "wt", encoding="utf-8", compresslevel=9) as stream:
        stream.write(serialized)
    print(json.dumps({"features": len(payload["features"]), "gzip_bytes": OUTPUT.stat().st_size}, indent=2))


if __name__ == "__main__":
    main()
