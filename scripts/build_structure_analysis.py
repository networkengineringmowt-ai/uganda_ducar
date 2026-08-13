"""Normalize district structure registers and join every occurrence to DUCAR links."""

from __future__ import annotations

import json
import math
import re
import sqlite3
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import Point


SITE = Path(__file__).resolve().parent.parent
DATA = SITE / "data"
DUCAR = SITE.parent
EXTRACT = DATA / "ducar_structure_workbook_extract.json"
PROGRAMME_BRIDGES = DUCAR / "DUCAR_Framework_Tool" / "gis" / "DUCAR_Programme_Bridges.geojson"
CRS_METRIC = "EPSG:32636"

DISTRICTS = {
    "Bulambuli Structures.xlsx": "BULAMBULI",
    "Dokolo DLG- Structures.xlsx": "DOKOLO",
    "Kapchorwa MC Structures.xlsx": "KAPCHORWA",
    "KUMI Municipal Drainage Structure Assesment.xlsx": "KUMI",
    "NAPAK-Road structure.xlsx": "NAPAK",
    "Nebbi Muncipal Road Structures.xlsx": "NEBBI",
    "PADER DLG Structures Districts.xlsx": "PADER",
    "Pakwach Structures.xlsx": "PAKWACH",
    "Rubirizi DLG structures.xlsx": "RUBIRIZI",
    "Structures - Kagwara TC.xlsx": "SERERE",
    "Structures -Kidetok TC.xlsx": "SERERE",
    "Structures- District.xlsx": "SERERE",
    "Structures- Kadungulu TC.xlsx": "SERERE",
    "Structures DATA MARACHA DLG 2022.xlsx": "MARACHA",
    "Structures DATA TEREGO DLG 2022.xlsx": "TEREGO",
    "Structures Maracha TC 2022.xlsx": "MARACHA",
    "TORORO Structures.xlsx": "TORORO",
}


def text(value, fallback="Not supplied"):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return fallback
    value = str(value).strip()
    return value if value and value.lower() not in {"nan", "none", "nil", "n/a", "na"} else fallback


def normalize(value):
    value = text(value, "").upper().replace("&", " AND ")
    value = re.sub(r"\d+\s*\+\s*\d+", " ", value)
    value = re.sub(r"\b(CHAINAGE|CHAIN|CH|ROAD|RD|STREET|BRIDGE|CULVERT|STRUCTURE|AT|KM|M)\b", " ", value)
    value = re.sub(r"[^A-Z0-9]+", " ", value)
    return " ".join(part for part in value.split() if len(part) > 1)


def district_prefix(district):
    letters = re.sub(r"[^A-Z]", "", district.upper())
    return (letters + "XXXX")[:4]


def structure_class(name, kind):
    value = f"{name} {kind}".lower()
    if "culvert" in value or "armco" in value:
        return "Major Culvert"
    if "drift" in value or "ford" in value:
        return "Drift / Ford"
    if "bridge" in value or "ladder" in value or "bailey" in value:
        return "Bridge"
    return "Other Structure"


def risk(condition):
    value = condition.lower()
    if "very poor" in value or "broken" in value:
        return "Critical"
    if "poor" in value or "bad" in value:
        return "High"
    if "fair" in value:
        return "Moderate"
    if "good" in value:
        return "Low"
    return "Unclassified"


def intervention(condition):
    value = condition.lower()
    if "very poor" in value or "broken" in value:
        return "Reconstruction or replacement"
    if "poor" in value or "bad" in value:
        return "Major rehabilitation and safety works"
    if "fair" in value:
        return "Preventive and periodic maintenance"
    if "good" in value:
        return "Routine maintenance and inspection"
    return "Detailed structural inspection"


def chainages(location):
    value = text(location, "")
    found = [int(km) + int(metres) / (10 ** len(metres)) for km, metres in re.findall(r"(\d+)\s*\+\s*(\d+)", value)]
    if found:
        return found
    found = [float(item) for item in re.findall(r"(?<![+\d])(\d+(?:\.\d+)?)\s*KM\b", value.upper())]
    return found or [None]


def header_map(row):
    result = {}
    for index, value in enumerate(row):
        key = re.sub(r"[^A-Z0-9]+", " ", text(value, "").upper()).strip()
        if "STRUCTURE NAME" in key:
            result["structure_name"] = index
        elif "STRUCTURE LOCATION" in key:
            result["location"] = index
        elif "STRUCTURE TYPE" in key:
            result["structure_type"] = index
        elif "STRUCTURE AGE" in key:
            result["structure_age"] = index
        elif "LAST MAJOR WORKS" in key and "YEAR" not in key:
            result["last_major_works"] = index
        elif "YEAR" in key and "LAST MAJOR" in key:
            result["last_major_work_year"] = index
        elif "CURRENT CONDITION" in key:
            result["current_condition"] = index
        elif key == "REMARKS":
            result["remarks"] = index
    return result


def extract_rows():
    workbooks = json.loads(EXTRACT.read_text(encoding="utf-8"))
    rows = []
    for workbook in workbooks:
        file_name = Path(workbook["file"]).name
        if file_name == "Structures Template.xlsx" or file_name not in DISTRICTS:
            continue
        district = DISTRICTS[file_name]
        for sheet in workbook.get("sheets", []):
            if sheet.get("name", "").lower() != "structures":
                continue
            values = sheet.get("values", [])
            headers, header_index = {}, None
            for index, row in enumerate(values):
                candidate = header_map(row)
                if {"structure_name", "location", "structure_type"}.issubset(candidate):
                    headers, header_index = candidate, index
                    break
            if header_index is None:
                continue
            road_context = ""
            for source_row, row in enumerate(values[header_index + 1 :], start=header_index + 2):
                def get(field):
                    index = headers.get(field)
                    return row[index] if index is not None and index < len(row) else None

                name, location, kind = text(get("structure_name"), ""), text(get("location"), ""), text(get("structure_type"), "")
                condition = text(get("current_condition"), "Not supplied")
                if not kind and condition == "Not supplied" and (name or location):
                    road_context = " ".join(item for item in [name, location] if item).strip()
                    continue
                if not kind or not (name or location):
                    continue
                location_parts = [road_context] if road_context else []
                if location and location != road_context:
                    location_parts.append(location)
                location_full = " · ".join(location_parts)
                occurrences = chainages(location_full)
                for occurrence_index, chainage in enumerate(occurrences, start=1):
                    rows.append(
                        {
                            "district": district,
                            "source_file": file_name,
                            "source_sheet": sheet["name"],
                            "source_row": source_row,
                            "structure_name": text(name),
                            "structure_location": text(location_full),
                            "structure_type": text(kind),
                            "structure_class": structure_class(name, kind),
                            "structure_age": text(get("structure_age")),
                            "last_major_works": text(get("last_major_works")),
                            "last_major_work_year": text(get("last_major_work_year")),
                            "current_condition": condition,
                            "remarks": text(get("remarks")),
                            "chainage_km": round(chainage, 3) if chainage is not None else None,
                            "source_occurrence_index": occurrence_index,
                            "source_occurrence_count": len(occurrences),
                        }
                    )
    return rows


def match_links(rows, links):
    by_district = defaultdict(list)
    for link in links:
        by_district[normalize(link.get("district"))].append(link)
    for row in rows:
        candidates = []
        district_key = normalize(row["district"])
        for key, district_links in by_district.items():
            if district_key in key or key in district_key:
                candidates.extend(district_links)
        target = normalize(row["structure_location"])
        if row["structure_name"].lower().endswith((" road", " rd")):
            target = normalize(row["structure_name"] + " " + row["structure_location"])
        best, best_score = None, -1.0
        for link in candidates:
            candidate = normalize(link.get("road_name"))
            ratio = SequenceMatcher(None, target, candidate).ratio() if target and candidate else 0
            target_tokens, candidate_tokens = set(target.split()), set(candidate.split())
            overlap = len(target_tokens & candidate_tokens) / max(len(candidate_tokens), 1)
            score = ratio * 0.65 + overlap * 0.35
            chainage = row.get("chainage_km")
            if chainage is not None and chainage <= float(link.get("geometry_length_km") or 0) * 1.2:
                score += 0.04
            if score > best_score:
                best, best_score = link, score
        if best is None or best_score < 0.18:
            row.update({"link_id": "Not supplied", "linked_road_name": "Not supplied", "linked_road_length_km": 0, "link_match_score": 0, "linkage_quality": "Unmatched"})
        else:
            quality = "High" if best_score >= 0.72 else "Moderate" if best_score >= 0.48 else "Low"
            row.update({"link_id": best["link_id"], "linked_road_name": text(best.get("road_name")), "linked_road_length_km": round(float(best.get("geometry_length_km") or 0), 4), "link_match_score": round(min(best_score, 1), 3), "linkage_quality": quality})
        row["risk_band"] = risk(row["current_condition"])
        row["recommended_intervention"] = intervention(row["current_condition"])


def add_programme_bridges(rows, roads):
    programme = gpd.read_file(PROGRAMME_BRIDGES).to_crs("EPSG:4326")
    roads_metric = roads.to_crs(CRS_METRIC)
    for _, feature in programme.iterrows():
        point_metric = gpd.GeoSeries([feature.geometry], crs="EPSG:4326").to_crs(CRS_METRIC).iloc[0]
        distances = roads_metric.geometry.distance(point_metric)
        index = distances.idxmin()
        road = roads.loc[index]
        rows.append({
            "district": text(feature.get("Admin_Area")).upper(), "source_file": "DUCAR_Programme_Bridges.geojson", "source_sheet": "GeoJSON", "source_row": text(feature.get("Bridge_ID")),
            "structure_name": text(feature.get("Bridge_ID")), "structure_location": "Exact programme coordinate", "structure_type": "Programme bridge / drainage structure", "structure_class": "Major Culvert" if "culvert" in text(feature.get("Intervention"), "").lower() else "Bridge",
            "structure_age": "Not supplied", "last_major_works": "Not supplied", "last_major_work_year": "Not supplied", "current_condition": text(feature.get("Status")), "remarks": text(feature.get("Intervention")), "chainage_km": None,
            "source_occurrence_index": 1, "source_occurrence_count": 1, "link_id": road["link_id"], "linked_road_name": text(road.get("road_name")), "linked_road_length_km": round(float(road.get("geometry_length_km") or 0), 4),
            "link_match_score": 1.0, "linkage_quality": "Exact spatial nearest-road join", "risk_band": "Moderate", "recommended_intervention": text(feature.get("Intervention")), "programme_cost_ugx": feature.get("Cost_UGX"), "_exact_geometry": feature.geometry,
        })


def finish(rows, roads):
    prefix_counts = Counter()
    per_link = Counter(row["link_id"] for row in rows if row["link_id"] != "Not supplied")
    road_geometry = {row.link_id: row.geometry for _, row in roads.iterrows()}
    point_features = []
    for row in rows:
        prefix = district_prefix(row["district"])
        prefix_counts[prefix] += 1
        row["structure_id"] = f"{prefix}-STR-{prefix_counts[prefix]:04d}"
        count = per_link.get(row["link_id"], 0)
        row["allocated_road_length_km"] = round(row["linked_road_length_km"] / count, 6) if count else 0
        geometry = row.pop("_exact_geometry", None)
        if geometry is None and row["link_id"] in road_geometry:
            line = road_geometry[row["link_id"]]
            fraction = 0.5
            if row["chainage_km"] is not None and row["linked_road_length_km"] > 0:
                fraction = max(0, min(1, row["chainage_km"] / row["linked_road_length_km"]))
            geometry = line.interpolate(fraction, normalized=True)
            row["map_location_method"] = "Chainage interpolation on matched DUCAR geometry" if row["chainage_km"] is not None else "Matched DUCAR geometry midpoint"
        elif geometry is not None:
            row["map_location_method"] = "Exact supplied programme coordinate"
        else:
            row["map_location_method"] = "Not supplied"
        if geometry is not None:
            point_features.append({"type": "Feature", "properties": {key: value for key, value in row.items()}, "geometry": json.loads(gpd.GeoSeries([geometry], crs="EPSG:4326").to_json())["features"][0]["geometry"]})
    rows.sort(key=lambda item: item["structure_id"])
    return point_features


def summaries(rows, links):
    linked_ids = {row["link_id"] for row in rows if row["link_id"] != "Not supplied"}
    links_by_id = {link["link_id"]: link for link in links}
    link_rows = []
    for link_id in sorted(linked_ids):
        selected = [row for row in rows if row["link_id"] == link_id]
        conditions = Counter(row["current_condition"] for row in selected)
        risks = Counter(row["risk_band"] for row in selected)
        link = links_by_id[link_id]
        link_rows.append({
            "link_id": link_id, "road_name": link.get("road_name"), "district": link.get("district"), "geometry_length_km": link.get("geometry_length_km"),
            "structure_records": len(selected), "bridge_records": sum(row["structure_class"] == "Bridge" for row in selected), "major_culvert_records": sum(row["structure_class"] == "Major Culvert" for row in selected),
            "dominant_structure_condition": conditions.most_common(1)[0][0], "highest_structure_risk": next((band for band in ["Critical", "High", "Moderate", "Low", "Unclassified"] if risks[band]), "Unclassified"),
        })
    def allocated(field):
        totals = defaultdict(float)
        for row in rows:
            totals[text(row.get(field))] += float(row.get("allocated_road_length_km") or 0)
        return [{field: key, "affected_length_km": round(value, 3)} for key, value in sorted(totals.items(), key=lambda item: (-item[1], item[0]))]
    return {
        "metadata": {"title": "DUCAR bridges and major culverts register", "source_workbooks": len({row["source_file"] for row in rows if row["source_file"].endswith(".xlsx")}), "structure_occurrences": len(rows), "linked_structure_occurrences": sum(row["link_id"] != "Not supplied" for row in rows), "road_length_with_structures_km": round(sum(float(links_by_id[item].get("geometry_length_km") or 0) for item in linked_ids), 3), "length_metric": "Linked road geometry length allocated equally across structure occurrences on each link to prevent double counting"},
        "class_summary": allocated("structure_class"), "condition_summary": allocated("current_condition"), "risk_summary": allocated("risk_band"), "district_summary": allocated("district"),
        "link_summary": link_rows, "rows": rows,
    }


def write_sql(payload):
    database = DATA / "ducar_enterprise_unified.sqlite"
    with sqlite3.connect(database) as connection:
        pd.DataFrame(payload["rows"]).to_sql("structure_inventory", connection, if_exists="replace", index=False)
        pd.DataFrame(payload["link_summary"]).to_sql("structure_link_summary", connection, if_exists="replace", index=False)
        connection.execute("CREATE INDEX IF NOT EXISTS idx_structure_link ON structure_inventory(link_id)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_structure_district ON structure_inventory(district)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_structure_class ON structure_inventory(structure_class)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_structure_risk ON structure_inventory(risk_band)")
        connection.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_structure_id ON structure_inventory(structure_id)")
        connection.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_structure_link_summary ON structure_link_summary(link_id)")
        catalog_path = DATA / "ducar_database_catalog.json"
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        names = {"structure_inventory", "structure_link_summary"}
        catalog["tables"] = [table for table in catalog["tables"] if table["table"] not in names]
        for name in sorted(names):
            columns = [{"position": row[0], "name": row[1], "type": row[2] or "TEXT", "not_null": bool(row[3]), "default": row[4] if row[4] is not None else "Not supplied", "primary_key": bool(row[5])} for row in connection.execute(f'PRAGMA table_info("{name}")')]
            indexes = [{"name": row[1], "unique": bool(row[2]), "origin": row[3]} for row in connection.execute(f'PRAGMA index_list("{name}")')]
            create_sql = connection.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone()[0]
            count = connection.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
            catalog["tables"].append({"table": name, "row_count": count, "column_count": len(columns), "columns": columns, "indexes": indexes, "create_sql": create_sql, "sections": ["structures"]})
        catalog["tables"].sort(key=lambda item: item["table"])
        catalog["table_count"] = len(catalog["tables"])
        catalog["database_bytes"] = database.stat().st_size
        catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    links = json.loads((DATA / "ducar_link_register.json").read_text(encoding="utf-8"))
    roads = gpd.read_file(DATA / "ducar_socioeconomic_roads.geojson").to_crs("EPSG:4326")
    rows = extract_rows()
    match_links(rows, links)
    add_programme_bridges(rows, roads)
    features = finish(rows, roads)
    payload = summaries(rows, links)
    (DATA / "ducar_structure_analysis.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    (DATA / "ducar_structures.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    write_sql(payload)
    print(json.dumps(payload["metadata"], indent=2))
    print("Classes:", payload["class_summary"])


if __name__ == "__main__":
    main()
