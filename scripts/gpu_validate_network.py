"""GPU validation of the complete link register after geospatial enrichment."""

import json
from datetime import datetime, timezone
from pathlib import Path

import torch


site = Path(__file__).resolve().parent.parent
rows = json.loads((site / "data" / "ducar_link_register.json").read_text(encoding="utf-8"))
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
length = torch.tensor([float(row["geometry_length_km"]) for row in rows], dtype=torch.float64, device=device)
x = torch.tensor([float(row["x_coordinate_dd"]) for row in rows], dtype=torch.float64, device=device)
y = torch.tensor([float(row["y_coordinate_dd"]) for row in rows], dtype=torch.float64, device=device)
paved = torch.tensor([row["pavement_class"] == "Paved" for row in rows], dtype=torch.bool, device=device)
unpaved = torch.tensor([row["pavement_class"] == "Unpaved" for row in rows], dtype=torch.bool, device=device)
traffic = torch.tensor([isinstance(row.get("registry_aadt"), (int, float)) for row in rows], dtype=torch.bool, device=device)

report = {
    "generated_at_utc": datetime.now(timezone.utc).isoformat(),
    "compute_device": str(device),
    "gpu_name": torch.cuda.get_device_name(0) if device.type == "cuda" else "CPU fallback",
    "records_validated": len(rows),
    "finite_coordinate_records": int((torch.isfinite(x) & torch.isfinite(y)).sum().item()),
    "coordinate_extent_wgs84": {"min_x": round(x.min().item(), 7), "max_x": round(x.max().item(), 7), "min_y": round(y.min().item(), 7), "max_y": round(y.max().item(), 7)},
    "network_length_km": round(length.sum().item(), 6),
    "paved_length_km": round(length[paved].sum().item(), 6),
    "unpaved_length_km": round(length[unpaved].sum().item(), 6),
    "traffic_covered_length_km": round(length[traffic].sum().item(), 6),
    "length_partition_control_km": round((length[paved].sum() + length[unpaved].sum()).item(), 6),
    "all_coordinates_in_uganda_screening_extent": bool(((x >= 29.5) & (x <= 35.2) & (y >= -1.6) & (y <= 4.5)).all().item()),
}
(site / "data" / "gpu_network_validation.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
