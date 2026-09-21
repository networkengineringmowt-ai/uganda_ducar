"""Add WGS84 road-geometry start/end coordinates to every link-backed store."""

from __future__ import annotations

import csv
import json
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
FIELDS = (
    "start_x_coordinate_dd",
    "start_y_coordinate_dd",
    "end_x_coordinate_dd",
    "end_y_coordinate_dd",
)


def endpoints(geometry: dict) -> tuple[float, float, float, float] | None:
    coords = geometry.get("coordinates") or []
    if geometry.get("type") == "MultiLineString":
        coords = [point for line in coords for point in line]
    if len(coords) < 2:
        return None
    start, end = coords[0], coords[-1]
    return tuple(round(float(value), 7) for value in (start[0], start[1], end[0], end[1]))


def apply(row: dict, lookup: dict[str, tuple[float, float, float, float]]) -> None:
    values = lookup.get(str(row.get("link_id") or ""))
    if not values:
        return
    row.update(dict(zip(FIELDS, values)))
    row["coordinate_basis"] = "WGS84 road midpoint and geometry endpoints in decimal degrees"


def update_json(path: Path, lookup: dict[str, tuple[float, float, float, float]]) -> int:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload if isinstance(payload, list) else payload.get("rows", [])
    for row in rows:
        apply(row, lookup)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return len(rows)


def update_csv(path: Path, rows: list[dict]) -> None:
    fields = list(rows[0])
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def update_sqlite(path: Path, lookup: dict[str, tuple[float, float, float, float]]) -> None:
    connection = sqlite3.connect(path)
    try:
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        for table in ("ducar_link_register", "socioeconomic_link_analysis", "ducar_link_admin_relations"):
            if table not in tables:
                continue
            columns = {row[1] for row in connection.execute(f'PRAGMA table_info("{table}")')}
            for field in FIELDS:
                if field not in columns:
                    connection.execute(f'ALTER TABLE "{table}" ADD COLUMN "{field}" REAL')
            sql = f'UPDATE "{table}" SET ' + ",".join(f'"{field}"=?' for field in FIELDS) + ' WHERE link_id=?'
            connection.executemany(sql, [(*values, link_id) for link_id, values in lookup.items()])
        connection.commit()
    finally:
        connection.close()


def refresh_catalog(database_path: Path, catalog_path: Path) -> None:
    previous = json.loads(catalog_path.read_text(encoding="utf-8"))
    sections = {table["table"]: table.get("sections", []) for table in previous.get("tables", [])}
    connection = sqlite3.connect(database_path)
    try:
        names = [row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        tables = []
        for name in names:
            info = list(connection.execute(f'PRAGMA table_info("{name}")'))
            indexes = list(connection.execute(f'PRAGMA index_list("{name}")'))
            create_sql = connection.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone()[0]
            tables.append({
                "table": name,
                "row_count": connection.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0],
                "column_count": len(info),
                "columns": [{"position": row[0], "name": row[1], "type": row[2], "not_null": bool(row[3]), "default": row[4] if row[4] is not None else "Not supplied", "primary_key": bool(row[5])} for row in info],
                "indexes": [{"name": row[1], "unique": bool(row[2]), "origin": row[3]} for row in indexes],
                "create_sql": create_sql,
                "sections": sections.get(name, []),
            })
    finally:
        connection.close()
    payload = {"database_file": database_path.name, "database_bytes": database_path.stat().st_size, "table_count": len(tables), "tables": tables}
    catalog_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main() -> None:
    geo_path = DATA / "ducar_socioeconomic_roads.geojson"
    geo = json.loads(geo_path.read_text(encoding="utf-8"))
    lookup: dict[str, tuple[float, float, float, float]] = {}
    for feature in geo.get("features", []):
        values = endpoints(feature.get("geometry") or {})
        link_id = str((feature.get("properties") or {}).get("link_id") or "")
        if link_id and values:
            lookup[link_id] = values
            apply(feature["properties"], lookup)
    geo_path.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    register_path = DATA / "ducar_link_register.json"
    update_json(register_path, lookup)
    register = json.loads(register_path.read_text(encoding="utf-8"))
    update_csv(DATA / "ducar_link_register.csv", register)
    update_json(DATA / "ducar_socioeconomic_link_analysis.json", lookup)
    update_json(DATA / "ducar_link_admin_relations.json", lookup)
    database_path = DATA / "ducar_enterprise_unified.sqlite"
    update_sqlite(database_path, lookup)
    refresh_catalog(database_path, DATA / "ducar_database_catalog.json")
    print(f"Updated {len(lookup):,} roads with WGS84 start/end coordinates across JSON, GeoJSON, CSV and SQLite stores.")


if __name__ == "__main__":
    main()
