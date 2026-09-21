"""Add representative WGS84 coordinates to every DUCAR-linked record and SQL table."""

from __future__ import annotations

import json
import sqlite3
import csv
import urllib.request
from pathlib import Path

from shapely.geometry import shape


SITE = Path(__file__).resolve().parent.parent
DATA = SITE / "data"
X_FIELD = "x_coordinate_dd"
Y_FIELD = "y_coordinate_dd"
BASIS_FIELD = "coordinate_basis"


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def save(name, payload):
    (DATA / name).write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
        encoding="utf-8",
    )


def representative(geometry):
    geom = shape(geometry)
    if geom.geom_type in {"LineString", "MultiLineString"}:
        point = geom.interpolate(0.5, normalized=True)
        basis = "WGS84 midpoint along DUCAR link geometry"
    else:
        point = geom.representative_point()
        basis = "WGS84 representative point of supplied geometry"
    return round(point.x, 7), round(point.y, 7), basis


roads = load("ducar_socioeconomic_roads.geojson")
link_coordinates = {}
for feature in roads["features"]:
    x, y, basis = representative(feature["geometry"])
    link_id = feature["properties"]["link_id"]
    values = {X_FIELD: x, Y_FIELD: y, BASIS_FIELD: basis}
    feature["properties"].update(values)
    link_coordinates[link_id] = values
save("ducar_socioeconomic_roads.geojson", roads)


def update_link_rows(name, payload_key=None):
    payload = load(name)
    rows = payload[payload_key] if payload_key else payload
    updated = 0
    for row in rows:
        values = link_coordinates.get(row.get("link_id"))
        if values:
            row.update(values)
            updated += 1
    save(name, payload)
    return updated


results = {
    "ducar_link_register": update_link_rows("ducar_link_register.json"),
    "ducar_link_admin_relations": update_link_rows("ducar_link_admin_relations.json"),
    "socioeconomic_link_analysis": update_link_rows("ducar_socioeconomic_link_analysis.json", "rows"),
}
link_export = load("ducar_link_register.json")
with (DATA / "ducar_link_register.csv").open("w", newline="", encoding="utf-8-sig") as stream:
    writer = csv.DictWriter(stream, fieldnames=list(link_export[0]))
    writer.writeheader()
    writer.writerows(link_export)

structures_geo = load("ducar_structures.geojson")
structure_coordinates = {}
for feature in structures_geo["features"]:
    x, y, _ = representative(feature["geometry"])
    values = {X_FIELD: x, Y_FIELD: y, BASIS_FIELD: feature["properties"].get("map_location_method", "WGS84 supplied structure point")}
    feature["properties"].update(values)
    structure_coordinates[feature["properties"]["structure_id"]] = values
save("ducar_structures.geojson", structures_geo)

structures = load("ducar_structure_analysis.json")
link_rows = load("ducar_link_register.json")
district_points = {}
for link in link_rows:
    district_points.setdefault(str(link.get("district", "Not supplied")).upper(), []).append((link[X_FIELD], link[Y_FIELD]))
district_centroids = {district: (round(sum(x for x, _ in points) / len(points), 7), round(sum(y for _, y in points) / len(points), 7)) for district, points in district_points.items()}
national_x = round(sum(item[X_FIELD] for item in link_rows) / len(link_rows), 7)
national_y = round(sum(item[Y_FIELD] for item in link_rows) / len(link_rows), 7)
existing_structure_ids = {feature["properties"]["structure_id"] for feature in structures_geo["features"]}
for row in structures["rows"]:
    values = structure_coordinates.get(row.get("structure_id")) or link_coordinates.get(row.get("link_id"))
    if not values:
        x, y = district_centroids.get(str(row.get("district", "")).upper(), (national_x, national_y))
        values = {X_FIELD: x, Y_FIELD: y, BASIS_FIELD: "Derived district road-network centroid for unmatched structure"}
    row.update(values)
    structure_coordinates[row["structure_id"]] = values
    if row["structure_id"] not in existing_structure_ids:
        structures_geo["features"].append({"type": "Feature", "properties": dict(row), "geometry": {"type": "Point", "coordinates": [values[X_FIELD], values[Y_FIELD]]}})
for row in structures.get("link_summary", []):
    values = link_coordinates.get(row.get("link_id"))
    if values:
        row.update(values)
save("ducar_structure_analysis.json", structures)
save("ducar_structures.geojson", structures_geo)
results["structure_inventory"] = sum(X_FIELD in row for row in structures["rows"])

facilities = load("uganda_socioeconomic_facilities.geojson")
facility_coordinates = {}
for feature in facilities["features"]:
    x, y, basis = representative(feature["geometry"])
    feature["properties"].update({X_FIELD: x, Y_FIELD: y, BASIS_FIELD: basis})
    facility_coordinates[str(feature["properties"]["id"])] = {X_FIELD: x, Y_FIELD: y, BASIS_FIELD: basis}
save("uganda_socioeconomic_facilities.geojson", facilities)
results["socioeconomic_facilities"] = len(facilities["features"])

global_matrix = load("global_country_matrix.json")
country_request = urllib.request.Request("https://studies.cs.helsinki.fi/restcountries/api/all", headers={"User-Agent": "DUCAR-Geospatial-QA/1.0"})
with urllib.request.urlopen(country_request, timeout=60) as response:
    countries = json.load(response)
country_lookup = {}
for country in countries:
    latlng = country.get("latlng") or []
    if len(latlng) != 2:
        continue
    values = {X_FIELD: round(float(latlng[1]), 7), Y_FIELD: round(float(latlng[0]), 7), BASIS_FIELD: "REST Countries representative WGS84 coordinate via University of Helsinki mirror"}
    for name in {country.get("name", {}).get("common"), country.get("name", {}).get("official")}:
        if name:
            country_lookup[name.casefold()] = values
aliases = {
    "bolivia": "bolivia, plurinational state of", "brunei": "brunei darussalam", "cape verde": "cabo verde",
    "czech republic": "czechia", "democratic republic of the congo": "dr congo", "east timor": "timor-leste",
    "iran": "islamic republic of iran", "ivory coast": "côte d'ivoire", "laos": "lao people's democratic republic",
    "micronesia": "micronesia, federated states of", "moldova": "republic of moldova", "north korea": "democratic people's republic of korea",
    "russia": "russian federation", "south korea": "republic of korea", "syria": "syrian arab republic", "taiwan": "taiwan, province of china",
    "tanzania": "united republic of tanzania", "venezuela": "bolivarian republic of venezuela", "vietnam": "viet nam",
    "cabo verde": "cape verde", "congo": "republic of the congo", "cote d'ivoire": "ivory coast",
    "sao tome and principe": "são tomé and príncipe", "brunei darussalam": "brunei", "turkiye": "turkey",
    "viet nam": "vietnam", "holy see": "vatican city",
}
unmatched_countries = []
global_coordinates = {}
for row in global_matrix["rows"]:
    key = row["country"].casefold()
    values = country_lookup.get(key) or country_lookup.get(aliases.get(key, ""))
    if values:
        row.update(values)
        global_coordinates[row["country"]] = values
    else:
        unmatched_countries.append(row["country"])
save("global_country_matrix.json", global_matrix)
results["global_country_coordinates"] = len(global_coordinates)
results["global_country_unmatched"] = unmatched_countries


database = DATA / "ducar_enterprise_unified.sqlite"
with sqlite3.connect(database) as connection:
    table_names = [row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    for table in table_names:
        columns = {row[1] for row in connection.execute(f'PRAGMA table_info("{table}")')}
        key = "structure_id" if "structure_id" in columns else "link_id" if "link_id" in columns else None
        if not key:
            continue
        for field, sql_type in [(X_FIELD, "REAL"), (Y_FIELD, "REAL"), (BASIS_FIELD, "TEXT")]:
            if field not in columns:
                connection.execute(f'ALTER TABLE "{table}" ADD COLUMN "{field}" {sql_type}')
        lookup = structure_coordinates if key == "structure_id" else link_coordinates
        connection.executemany(
            f'UPDATE "{table}" SET "{X_FIELD}"=?, "{Y_FIELD}"=?, "{BASIS_FIELD}"=? WHERE "{key}"=?',
            [(value[X_FIELD], value[Y_FIELD], value[BASIS_FIELD], item_key) for item_key, value in lookup.items()],
        )
    if "global_country_matrix" in table_names:
        columns = {row[1] for row in connection.execute('PRAGMA table_info("global_country_matrix")')}
        for field, sql_type in [(X_FIELD, "REAL"), (Y_FIELD, "REAL"), (BASIS_FIELD, "TEXT")]:
            if field not in columns:
                connection.execute(f'ALTER TABLE "global_country_matrix" ADD COLUMN "{field}" {sql_type}')
        connection.executemany(
            f'UPDATE "global_country_matrix" SET "{X_FIELD}"=?, "{Y_FIELD}"=?, "{BASIS_FIELD}"=? WHERE country=?',
            [(value[X_FIELD], value[Y_FIELD], value[BASIS_FIELD], country) for country, value in global_coordinates.items()],
        )
    if "socioeconomic_facilities" in table_names:
        columns = {row[1] for row in connection.execute('PRAGMA table_info("socioeconomic_facilities")')}
        connection.execute('CREATE INDEX IF NOT EXISTS idx_socioeconomic_facility_id ON "socioeconomic_facilities"(id)')
        for field, sql_type in [(X_FIELD, "REAL"), (Y_FIELD, "REAL"), (BASIS_FIELD, "TEXT")]:
            if field not in columns:
                connection.execute(f'ALTER TABLE "socioeconomic_facilities" ADD COLUMN "{field}" {sql_type}')
        connection.executemany(
            f'UPDATE "socioeconomic_facilities" SET "{X_FIELD}"=?, "{Y_FIELD}"=?, "{BASIS_FIELD}"=? WHERE id=?',
            [(value[X_FIELD], value[Y_FIELD], value[BASIS_FIELD], facility_id) for facility_id, value in facility_coordinates.items()],
        )

    catalog = load("ducar_database_catalog.json")
    sections = {item["table"]: item.get("sections", []) for item in catalog.get("tables", [])}
    catalog_tables = []
    for table in table_names:
        columns = [{"position": row[0], "name": row[1], "type": row[2] or "TEXT", "not_null": bool(row[3]), "default": row[4] if row[4] is not None else "Not supplied", "primary_key": bool(row[5])} for row in connection.execute(f'PRAGMA table_info("{table}")')]
        indexes = [{"name": row[1], "unique": bool(row[2]), "origin": row[3]} for row in connection.execute(f'PRAGMA index_list("{table}")')]
        create_sql = connection.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()[0]
        count = connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        catalog_tables.append({"table": table, "row_count": count, "column_count": len(columns), "columns": columns, "indexes": indexes, "create_sql": create_sql, "sections": sections.get(table, [])})
    catalog["tables"] = sorted(catalog_tables, key=lambda item: item["table"])
    catalog["table_count"] = len(catalog_tables)
    catalog["database_bytes"] = database.stat().st_size
    save("ducar_database_catalog.json", catalog)

print(json.dumps(results, indent=2))
