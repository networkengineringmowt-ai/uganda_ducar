from __future__ import annotations

"""Synchronise audited DUCAR link names into link-based GIS deliverables."""

import json
import shutil
import sqlite3
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import Point

from enrich_ducar_link_names_2026 import canonical_code, proper, valid_place


ROOT = Path(__file__).resolve().parents[1]
DUCAR = ROOT.parent
REGISTER = ROOT / "data" / "ducar_link_register.csv"
GIS = DUCAR / "DUCAR_Final_Deliverables_2026" / "04_GIS_Shapefiles"
BACKUP = DUCAR / "DUCAR_Final_Deliverables_2026" / "04_GIS_Shapefiles_Road_Name_Backup_20260826"
AUDIT = ROOT / "data" / "ducar_road_name_gis_sync_2026.json"
DATABASE = ROOT / "data" / "ducar_enterprise_unified.sqlite"
DATABASE_BACKUP = ROOT / "data" / "ducar_enterprise_unified_road_name_backup_20260826.sqlite"
CATALOG = ROOT / "data" / "ducar_database_catalog.json"
DISTRICT_ROADS = DUCAR / "district roads" / "dcroads2025.shp"
VILLAGES = DUCAR / "Administrative units - Uganda" / "ug_villages.shp"


def backup_family(stem: str) -> None:
    BACKUP.mkdir(parents=True, exist_ok=True)
    for source in GIS.glob(stem + ".*"):
        target = BACKUP / source.name
        if not target.exists():
            shutil.copy2(source, target)


def write_shape(frame: gpd.GeoDataFrame, path: Path) -> None:
    backup_family(path.stem)
    frame.to_file(path, driver="ESRI Shapefile", encoding="UTF-8", index=False)


def endpoint(geometry, end: bool) -> Point:
    if geometry is None or geometry.is_empty:
        return Point(0, 0)
    if geometry.geom_type == "MultiLineString":
        parts = list(geometry.geoms)
        geometry = parts[-1] if end else parts[0]
    return Point(geometry.coords[-1 if end else 0][:2])


def master_names(connection: sqlite3.Connection) -> pd.DataFrame:
    rows = pd.read_sql_query(
        "SELECT rowid AS source_row, section_id, road_code FROM master_road_sections ORDER BY rowid", connection
    )
    roads = gpd.read_file(DISTRICT_ROADS, columns=["RdCode", "Rdname", "VilStart", "VillEnd"], engine="pyogrio").to_crs(32636)
    if len(rows) != len(roads):
        raise RuntimeError("Master road table no longer aligns with the 31,106-row source geometry")
    code_matches = sum(canonical_code(a) == canonical_code(b) for a, b in zip(rows["road_code"], roads["RdCode"]))
    if code_matches != len(rows):
        raise RuntimeError(f"Only {code_matches:,} master rows align with their source road code")

    start = gpd.GeoDataFrame(rows[["section_id"]].copy(), geometry=[endpoint(item, False) for item in roads.geometry], crs=32636)
    end = gpd.GeoDataFrame(rows[["section_id"]].copy(), geometry=[endpoint(item, True) for item in roads.geometry], crs=32636)
    villages = gpd.read_file(VILLAGES, columns=["VILLAGE", "PARISH"], engine="pyogrio").to_crs(32636)
    def joined(points: gpd.GeoDataFrame) -> pd.DataFrame:
        result = gpd.sjoin(points, villages, how="left", predicate="within")
        return result.loc[~result.index.duplicated(keep="first")][["VILLAGE", "PARISH"]].reindex(rows.index)
    start_admin, end_admin = joined(start), joined(end)

    output = []
    for index, record in rows.iterrows():
        source = roads.iloc[index]
        origin = proper(start_admin.at[index, "VILLAGE"]) if valid_place(start_admin.at[index, "VILLAGE"]) else proper(source["VilStart"])
        destination = proper(end_admin.at[index, "VILLAGE"]) if valid_place(end_admin.at[index, "VILLAGE"]) else proper(source["VillEnd"])
        parish = proper(start_admin.at[index, "PARISH"])
        origin = origin or parish or "Uganda"
        destination = destination or proper(end_admin.at[index, "PARISH"]) or origin
        if origin.casefold() != destination.casefold():
            label = f"{origin} - {destination}"
            if not label.casefold().endswith(" road"):
                label += " Road"
        elif parish and parish.casefold() != origin.casefold():
            label = f"{origin} - {parish} Access Road"
        else:
            label = f"{origin} Internal Access Road"
        route = proper(source["Rdname"]) or f"{proper(source['VilStart'])} - {proper(source['VillEnd'])} Road"
        output.append((record["section_id"], f"{label} ({record['section_id']})", route, origin, destination))
    result = pd.DataFrame(output, columns=["section_id", "road_name", "established_route_name", "start_place_name", "end_place_name"])
    if result["road_name"].nunique() != len(result):
        raise RuntimeError("Master road-name labels are not unique")
    return result


def add_column(connection: sqlite3.Connection, table: str, column: str, data_type: str = "TEXT") -> None:
    existing = {item[1] for item in connection.execute(f'PRAGMA table_info("{table}")')}
    if column not in existing:
        connection.execute(f'ALTER TABLE "{table}" ADD COLUMN "{column}" {data_type}')


def sync_database(names: pd.DataFrame) -> dict[str, int]:
    if not DATABASE_BACKUP.exists():
        shutil.copy2(DATABASE, DATABASE_BACKUP)
    connection = sqlite3.connect(DATABASE)
    connection.execute("PRAGMA foreign_keys=ON")
    for column, data_type in [
        ("established_route_name", "TEXT"), ("established_route_name_source", "TEXT"),
        ("established_route_name_distance_m", "REAL"), ("start_place_name", "TEXT"),
        ("end_place_name", "TEXT"), ("road_name_confidence_pct", "REAL"),
    ]:
        add_column(connection, "ducar_link_register", column, data_type)
    for column in ["established_route_name", "start_place_name", "end_place_name", "road_name_assignment_basis"]:
        add_column(connection, "master_road_sections", column)

    connection.execute("DROP TABLE IF EXISTS temp.road_name_sync")
    connection.execute("CREATE TEMP TABLE road_name_sync (link_id TEXT PRIMARY KEY, road_name TEXT, route_name TEXT, route_source TEXT, route_distance REAL, start_name TEXT, end_name TEXT, confidence REAL)")
    connection.executemany(
        "INSERT INTO road_name_sync VALUES (?,?,?,?,?,?,?,?)",
        names.reset_index()[["link_id", "road_name", "established_route_name", "established_route_name_source", "established_route_name_distance_m", "start_place_name", "end_place_name", "road_name_confidence_pct"]].itertuples(index=False, name=None),
    )
    connection.execute("""UPDATE ducar_link_register SET
        road_name=(SELECT road_name FROM road_name_sync WHERE link_id=ducar_link_register.link_id),
        road_name_display=(SELECT road_name FROM road_name_sync WHERE link_id=ducar_link_register.link_id),
        road_name_authoritative=COALESCE(NULLIF((SELECT route_name FROM road_name_sync WHERE link_id=ducar_link_register.link_id),''),(SELECT road_name FROM road_name_sync WHERE link_id=ducar_link_register.link_id)),
        road_name_assignment_basis='Unique endpoint-locality link label; established route retained separately',
        established_route_name=(SELECT route_name FROM road_name_sync WHERE link_id=ducar_link_register.link_id),
        established_route_name_source=(SELECT route_source FROM road_name_sync WHERE link_id=ducar_link_register.link_id),
        established_route_name_distance_m=(SELECT route_distance FROM road_name_sync WHERE link_id=ducar_link_register.link_id),
        start_place_name=(SELECT start_name FROM road_name_sync WHERE link_id=ducar_link_register.link_id),
        end_place_name=(SELECT end_name FROM road_name_sync WHERE link_id=ducar_link_register.link_id),
        road_name_confidence_pct=(SELECT confidence FROM road_name_sync WHERE link_id=ducar_link_register.link_id)
        WHERE link_id IN (SELECT link_id FROM road_name_sync)""")
    for table, name_column in [
        ("ducar_link_admin_relations", "road_name"), ("socioeconomic_link_analysis", "road_name"),
        ("structure_inventory", "linked_road_name"), ("structure_link_summary", "road_name"),
        ("pms_pavement_condition", "road_name"),
    ]:
        columns = {item[1] for item in connection.execute(f'PRAGMA table_info("{table}")')}
        if "link_id" in columns and name_column in columns:
            connection.execute(f'''UPDATE "{table}" SET "{name_column}"=(SELECT road_name FROM road_name_sync WHERE link_id="{table}".link_id) WHERE link_id IN (SELECT link_id FROM road_name_sync)''')
        if "link_id" in columns and "road_name_display" in columns:
            connection.execute(f'''UPDATE "{table}" SET road_name_display=(SELECT road_name FROM road_name_sync WHERE link_id="{table}".link_id) WHERE link_id IN (SELECT link_id FROM road_name_sync)''')

    master = master_names(connection)
    connection.executemany(
        "UPDATE master_road_sections SET road_name=?, established_route_name=?, start_place_name=?, end_place_name=?, road_name_assignment_basis='Source-aligned endpoint-locality label with unique section ID' WHERE section_id=?",
        ((row.road_name, row.established_route_name, row.start_place_name, row.end_place_name, row.section_id) for row in master.itertuples()),
    )
    connection.commit()
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    result = {
        "ducar_database_unique_names": connection.execute("SELECT COUNT(DISTINCT road_name) FROM ducar_link_register").fetchone()[0],
        "master_database_unique_names": connection.execute("SELECT COUNT(DISTINCT road_name) FROM master_road_sections").fetchone()[0],
        "database_integrity_ok": int(integrity == "ok"),
    }
    connection.close()
    return result


def rebuild_catalog() -> None:
    old = json.loads(CATALOG.read_text(encoding="utf-8"))
    sections = {item["table"]: item.get("sections", []) for item in old.get("tables", [])}
    connection = sqlite3.connect(DATABASE)
    tables = []
    for (table,) in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
        info = connection.execute(f'PRAGMA table_info("{table}")').fetchall()
        indexes = connection.execute(f'PRAGMA index_list("{table}")').fetchall()
        create_sql = connection.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()[0]
        tables.append({
            "table": table,
            "row_count": connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0],
            "column_count": len(info),
            "columns": [{"position": item[0], "name": item[1], "type": item[2], "not_null": bool(item[3]), "default": item[4] if item[4] is not None else "Not supplied", "primary_key": bool(item[5])} for item in info],
            "indexes": [{"name": item[1], "unique": bool(item[2]), "origin": item[3]} for item in indexes],
            "create_sql": create_sql,
            "sections": sections.get(table, []),
        })
    connection.close()
    payload = {"database_file": DATABASE.name, "database_bytes": DATABASE.stat().st_size, "table_count": len(tables), "tables": tables}
    CATALOG.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main() -> None:
    names = pd.read_csv(REGISTER, low_memory=False).set_index("link_id")
    traffic_path = GIS / "DUCAR_Verified_Traffic_Safety_Register.shp"
    traffic = gpd.read_file(traffic_path)
    lookup = traffic["LINK_ID"].map(names["road_name"])
    if lookup.isna().any():
        raise RuntimeError(f"{int(lookup.isna().sum())} traffic GIS links lack a public road name")
    traffic["ROAD_NAME"] = lookup
    traffic["AUTH_NAME"] = traffic["LINK_ID"].map(names["established_route_name"]).fillna(lookup)
    traffic["NAME_BAS"] = "Endpoint-locality link label; route retained in AUTH_NAME"
    traffic["START_NAME"] = traffic["LINK_ID"].map(names["start_place_name"])
    traffic["END_NAME"] = traffic["LINK_ID"].map(names["end_place_name"])
    traffic["NAME_CONF"] = traffic["LINK_ID"].map(names["road_name_confidence_pct"])
    write_shape(traffic, traffic_path)

    structures_path = GIS / "DUCAR_Structures_Bridges.shp"
    structures = gpd.read_file(structures_path)
    link_field = next((field for field in structures.columns if field.upper() in {"LINK_ID", "ROAD_ID"}), None)
    name_field = next((field for field in structures.columns if field.upper() in {"ROAD_NAME", "LINK_NAME", "RD_NAME"}), None)
    structure_updates = 0
    if link_field and name_field:
        mapped = structures[link_field].map(names["road_name"])
        valid = mapped.notna()
        structures.loc[valid, name_field] = mapped.loc[valid]
        structure_updates = int(valid.sum())
        write_shape(structures, structures_path)

    database_result = sync_database(names)
    rebuild_catalog()

    result = {
        "traffic_safety_links": int(len(traffic)),
        "traffic_safety_unique_names": int(traffic["ROAD_NAME"].nunique()),
        "traffic_safety_blank_names": int(traffic["ROAD_NAME"].isna().sum()),
        "structure_link_names_updated": structure_updates,
        "backup": str(BACKUP),
        "database_backup": str(DATABASE_BACKUP),
        **database_result,
    }
    AUDIT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
