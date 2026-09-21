from __future__ import annotations

import json
import sqlite3
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"
DB=DATA/"ducar_enterprise_unified.sqlite"
MODEL_PATH=DATA/"traffic_ml_2026_report.json"
MODEL=json.loads(MODEL_PATH.read_text(encoding="utf-8")) if MODEL_PATH.exists() else json.loads((DATA/"road_attribute_ml_model.json").read_text(encoding="utf-8"))


def add_columns(connection:sqlite3.Connection,table:str,rows:list[dict],fields:list[str])->None:
    existing={row[1] for row in connection.execute(f'PRAGMA table_info("{table}")')}
    sample=rows[0]
    for field in fields:
        if field in existing: continue
        value=next((row.get(field) for row in rows if row.get(field) is not None),None)
        kind="REAL" if isinstance(value,(int,float)) and not isinstance(value,bool) else "INTEGER" if isinstance(value,bool) else "TEXT"
        connection.execute(f'ALTER TABLE "{table}" ADD COLUMN "{field}" {kind}')


def update_rows(connection:sqlite3.Connection,table:str,key:str,rows:list[dict],fields:list[str])->None:
    add_columns(connection,table,rows,fields)
    assignments=", ".join(f'"{field}"=?' for field in fields)
    connection.executemany(f'UPDATE "{table}" SET {assignments} WHERE "{key}"=?',[[row.get(field) for field in fields]+[row[key]] for row in rows])


def main()->None:
    links=json.loads((DATA/"ducar_link_register.json").read_text(encoding="utf-8"))
    relations=json.loads((DATA/"ducar_link_admin_relations.json").read_text(encoding="utf-8"))
    socio=json.loads((DATA/"ducar_socioeconomic_link_analysis.json").read_text(encoding="utf-8"))["rows"]
    traffic=[field for field in links[0] if field.startswith(("adt_","traffic_","speed_","heavy_vehicle_","overloaded_","estimated_overload_","annual_","crash_","road_safety_","start_town","end_town")) or field in {"length_km","registry_aadt","registry_pcu","registry_speed_kmh","road_name_display","road_name_assignment_basis","nearest_town","nearest_town_distance_km","nearest_reference_road","nearest_reference_road_distance_m","record_status"}]
    connection=sqlite3.connect(DB)
    update_rows(connection,"ducar_link_register","link_id",links,traffic)
    update_rows(connection,"ducar_link_admin_relations","link_id",relations,[field for field in traffic if field!="road_name_assignment_basis"]+["traffic_measured"])
    update_rows(connection,"socioeconomic_link_analysis","link_id",socio,[field for field in traffic if any(field in row for row in socio)])
    connection.execute("DROP TABLE IF EXISTS road_attribute_model_registry")
    connection.execute("CREATE TABLE road_attribute_model_registry (model_id TEXT PRIMARY KEY, trained_at_utc TEXT, algorithm TEXT, observed_training_records INTEGER, governed_links_enriched INTEGER, hotosm_features_enriched INTEGER, validation_aadt_mae REAL, validation_aadt_r2 REAL, estimation_policy TEXT)")
    governed=MODEL.get("governed_ducar",MODEL.get("governed_links",{}));hotosm=MODEL.get("complete_hotosm_network",MODEL.get("hotosm_vehicular_network",{}))
    connection.execute("INSERT INTO road_attribute_model_registry VALUES (?,?,?,?,?,?,?,?,?)",(MODEL["model_id"],MODEL["trained_at_utc"],"Extra Trees spatial-road ensemble · CPU",MODEL["targets"]["registry_aadt"]["observed_records"],governed.get("records",len(links)),hotosm.get("records",hotosm.get("features_enriched",404047)),MODEL["targets"]["registry_aadt"]["validation_mae"],MODEL["targets"]["registry_aadt"]["validation_r2"],MODEL.get("estimation_policy","Observed values retained; 2026 projections explicitly identified and source-backed")))
    connection.commit();connection.close()

    previous=json.loads((DATA/"ducar_database_catalog.json").read_text(encoding="utf-8"))
    sections={item["table"]:item.get("sections",[]) for item in previous["tables"]}
    sections["road_attribute_model_registry"]=["traffic","hdm4","summaries"]
    sections["national_road_link_register"]=["network","hdm4","framework","summaries"]
    connection=sqlite3.connect(DB)
    tables=[]
    names=[row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
    for table in names:
        columns=[]
        for pos,name,kind,not_null,default,primary in connection.execute(f'PRAGMA table_info("{table}")'):
            columns.append({"position":pos,"name":name,"type":kind,"not_null":bool(not_null),"default":"Not supplied" if default is None else default,"primary_key":bool(primary)})
        indexes=[{"name":row[1],"unique":bool(row[2]),"origin":row[3]} for row in connection.execute(f'PRAGMA index_list("{table}")')]
        create_sql=connection.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?",(table,)).fetchone()[0]
        tables.append({"table":table,"row_count":connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0],"column_count":len(columns),"columns":columns,"indexes":indexes,"create_sql":create_sql,"sections":sections.get(table,["summaries"])})
    connection.close()
    catalog={"database_file":DB.name,"database_bytes":DB.stat().st_size,"table_count":len(tables),"tables":tables}
    (DATA/"ducar_database_catalog.json").write_text(json.dumps(catalog,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print(json.dumps({"tables":len(tables),"database_bytes":DB.stat().st_size,"model_rows":1},indent=2))


if __name__=="__main__":main()
