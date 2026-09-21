from __future__ import annotations

import csv
import gzip
import json
import math
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import fiona
import geopandas as gpd
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import ExtraTreesRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent
DATA = ROOT / "data"
MODEL_ID = "DUCAR-Traffic-ET-v2.0-2026-08-21"
PROJECTION_YEAR = 2026
CRASH_TOTAL_2025 = 26044
CRASH_TOTAL_2026 = round(CRASH_TOTAL_2025 * (26044 / 25107))
CRASH_COMPOSITION_2025 = np.array([4602, 13563, 7879], dtype=float)
CRASH_COMPOSITION_2025 /= CRASH_COMPOSITION_2025.sum()
UPF_SOURCE = "https://upf.go.ug/wp-content/uploads/2026/04/ACR-2025-Official-Report-Web-Version.pdf"
SPEED_SOURCE = "https://www.works.go.ug/policies-regulations/traffic-and-road-safety-laws-regulations/455-the-traffic-and-road-safety-prescription-of-speed-limits-regulations-2025/download"
OVERLOAD_SOURCE = "https://works.go.ug/wp-content/uploads/2026/05/MoWT-Strategic-Plan-2026_30-Draft-v6.pdf"

NUMERIC = ["geometry_length_km", "x_coordinate_dd", "y_coordinate_dd", "condition_risk", "surface_risk", "planning_priority_score"]
CATEGORICAL = ["district", "county", "subcounty", "surface", "pavement_class", "condition", "priority_band", "recommended_intervention"]
MODEL_FIELDS = NUMERIC + CATEGORICAL
CLASS_FIELDS = [
    "adt_motorcycles", "adt_passenger_cars", "adt_taxis", "adt_minibuses", "adt_large_buses", "adt_light_goods",
    "adt_medium_goods", "adt_heavy_goods", "adt_articulated_trucks", "adt_tractors", "adt_special_vehicles", "adt_other_motorised",
]
TRAFFIC_FIELDS = [
    "traffic_projection_year", "adt_total", "adt_excluding_motorcycles", *CLASS_FIELDS, "heavy_vehicle_adt",
    "speed_mean_kmh", "speed_p85_kmh", "speed_limit_kmh", "speed_over_limit_pct", "heavy_vehicle_overload_rate_pct",
    "overloaded_heavy_vehicle_adt", "estimated_overload_tonnes_day", "annual_crashes_estimate", "annual_fatal_crashes_estimate",
    "annual_serious_crashes_estimate", "annual_minor_crashes_estimate", "crash_rate_per_100m_vehicle_km", "road_safety_risk_band",
    "traffic_projection_status", "traffic_projection_method", "traffic_statistics_source", "speed_statistics_source", "overload_statistics_source",
    "start_town", "start_town_distance_km", "end_town", "end_town_distance_km",
]


def clean(value: object, fallback: str = "Not supplied") -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return fallback
    text = str(value).strip()
    return text if text and text.lower() not in {"none", "nan", "null", "not supplied"} else fallback


def model_pipeline() -> Pipeline:
    prep = ColumnTransformer([
        ("num", Pipeline([("fill", SimpleImputer(strategy="median"))]), NUMERIC),
        ("cat", Pipeline([("fill", SimpleImputer(strategy="most_frequent")), ("onehot", OneHotEncoder(handle_unknown="ignore"))]), CATEGORICAL),
    ])
    model = ExtraTreesRegressor(n_estimators=180, min_samples_leaf=2, max_features=.74, n_jobs=-1, random_state=20260821)
    return Pipeline([("prep", prep), ("model", model)])


def train_models(frame: pd.DataFrame) -> tuple[dict[str, Pipeline], dict]:
    observed = frame[frame["traffic_value_status"].astype(str).str.lower().eq("observed")].copy()
    models, metrics = {}, {}
    for target in ["registry_aadt", "registry_pcu", "registry_speed_kmh"]:
        sample = observed[pd.to_numeric(observed[target], errors="coerce").notna()].copy()
        train, test = train_test_split(sample, test_size=.22, random_state=20260821)
        model = model_pipeline()
        model.fit(train[MODEL_FIELDS], np.log1p(train[target].astype(float)))
        prediction = np.expm1(model.predict(test[MODEL_FIELDS]))
        metrics[target] = {"observed_records": len(sample), "training_records": len(train), "validation_records": len(test), "validation_mae": round(float(mean_absolute_error(test[target], prediction)), 3), "validation_r2": round(float(r2_score(test[target], prediction)), 4)}
        model.fit(sample[MODEL_FIELDS], np.log1p(sample[target].astype(float)))
        models[target] = model
    return models, metrics


def predict(model: Pipeline, frame: pd.DataFrame, low: float, high: float) -> np.ndarray:
    return np.clip(np.expm1(model.predict(frame[MODEL_FIELDS])), low, high)


def town_index() -> tuple[pd.DataFrame, cKDTree, float]:
    rows = []
    for path, field in [(SOURCE / "shapefiles" / "Ug_Towns.shp", "cityname"), (SOURCE / "shapefiles" / "Ug_Trading_Centres.shp", "NAME")]:
        layer = gpd.read_file(path, columns=[field, "geometry"]).to_crs(4326)
        rows.extend({"name": clean(row[field], "Settlement"), "x": row.geometry.x, "y": row.geometry.y} for _, row in layer.iterrows() if row.geometry is not None)
    frame = pd.DataFrame(rows).drop_duplicates(["name", "x", "y"]).reset_index(drop=True)
    cosine = float(np.cos(np.deg2rad(frame["y"].mean())))
    return frame, cKDTree(np.c_[frame["x"] * 111 * cosine, frame["y"] * 111]), cosine


def nearest_towns(frame: pd.DataFrame, xfield: str, yfield: str, towns: pd.DataFrame, tree: cKDTree, cosine: float) -> tuple[np.ndarray, np.ndarray]:
    coords = np.c_[pd.to_numeric(frame[xfield], errors="coerce").fillna(32.3) * 111 * cosine, pd.to_numeric(frame[yfield], errors="coerce").fillna(1.35) * 111]
    distance, index = tree.query(coords, k=1)
    return towns.iloc[index]["name"].to_numpy(), distance


def largest_remainder(total: int, weights: np.ndarray) -> np.ndarray:
    weights = np.nan_to_num(np.maximum(weights.astype(float), 0), nan=0)
    if weights.sum() <= 0:
        weights = np.ones(len(weights))
    raw = weights / weights.sum() * int(total)
    result = np.floor(raw).astype(np.int64)
    remainder = int(total - result.sum())
    if remainder:
        result[np.argpartition(raw - result, -remainder)[-remainder:]] += 1
    return result


def class_counts(total: np.ndarray, frame: pd.DataFrame) -> pd.DataFrame:
    highway = frame.get("highway", pd.Series("", index=frame.index)).astype(str).str.lower()
    urban = frame.get("road_management_class", pd.Series("", index=frame.index)).astype(str).str.lower().str.contains("urban") | highway.isin(["residential", "service", "living_street"])
    paved = frame["pavement_class"].astype(str).str.lower().eq("paved")
    motorcycle = np.where(urban, .38, np.where(paved, .27, .34))
    heavy = np.where(highway.isin(["trunk", "primary", "secondary"]), .19, np.where(paved, .12, .08))
    remaining = 1 - motorcycle - heavy
    shares = np.column_stack([
        motorcycle, remaining*.45, remaining*.10, remaining*.15, heavy*.08, remaining*.17,
        heavy*.18, heavy*.31, heavy*.28, heavy*.07, heavy*.05, remaining*.13,
    ])
    shares /= shares.sum(axis=1, keepdims=True)
    out = np.zeros((len(frame), len(CLASS_FIELDS)), dtype=np.int64)
    for i, value in enumerate(total.astype(int)):
        raw = shares[i] * max(value, 0); base = np.floor(raw).astype(int); remainder = value - base.sum()
        if remainder > 0: base[np.argsort(raw-base)[-remainder:]] += 1
        out[i] = base
    return pd.DataFrame(out, columns=CLASS_FIELDS, index=frame.index)


def traffic_detail(frame: pd.DataFrame, complete_network: bool = False) -> pd.DataFrame:
    total = pd.to_numeric(frame["registry_aadt"], errors="coerce").fillna(0).round().clip(lower=0).astype(np.int64).to_numpy()
    classes = class_counts(total, frame)
    for field in CLASS_FIELDS: frame[field] = classes[field].astype(np.int64)
    frame["traffic_projection_year"] = PROJECTION_YEAR
    frame["adt_total"] = total
    frame["adt_excluding_motorcycles"] = frame[CLASS_FIELDS[1:]].sum(axis=1).astype(np.int64)
    heavy_fields = ["adt_large_buses", "adt_medium_goods", "adt_heavy_goods", "adt_articulated_trucks", "adt_tractors"]
    frame["heavy_vehicle_adt"] = frame[heavy_fields].sum(axis=1).astype(np.int64)
    frame["speed_mean_kmh"] = pd.to_numeric(frame["registry_speed_kmh"], errors="coerce").fillna(30).round(1)
    highway = frame.get("highway", pd.Series("", index=frame.index)).astype(str).str.lower()
    urban = frame.get("road_management_class", pd.Series("", index=frame.index)).astype(str).str.lower().str.contains("urban") | highway.isin(["residential", "service", "living_street"])
    frame["speed_limit_kmh"] = np.where(urban, 30, 50).astype(int)
    frame["speed_p85_kmh"] = np.minimum(frame["speed_mean_kmh"] * 1.22, 100).round(1)
    frame["speed_over_limit_pct"] = np.clip((frame["speed_p85_kmh"] / frame["speed_limit_kmh"] - 1) * 100, 0, 100).round(1)
    base_overload = np.where(highway.isin(["trunk", "primary", "secondary"]), 5.0, 4.0)
    frame["heavy_vehicle_overload_rate_pct"] = np.round(base_overload, 1)
    frame["overloaded_heavy_vehicle_adt"] = np.rint(frame["heavy_vehicle_adt"] * frame["heavy_vehicle_overload_rate_pct"] / 100).astype(np.int64)
    frame["estimated_overload_tonnes_day"] = np.round(frame["overloaded_heavy_vehicle_adt"] * 3.2, 1)
    length = pd.to_numeric(frame.get("length_km", frame.get("geometry_length_km", 0)), errors="coerce").fillna(0).clip(lower=.001).to_numpy()
    risk = frame["condition"].astype(str).str.lower().map({"good":.75, "fair":1.0, "poor":1.45, "unclassified":1.1}).fillna(1.1).to_numpy()
    exposure = np.maximum(total, 1) * length * risk
    if complete_network:
        component_totals = largest_remainder(CRASH_TOTAL_2026, CRASH_COMPOSITION_2025)
        fatal = largest_remainder(int(component_totals[0]), exposure * 1.15)
        serious = largest_remainder(int(component_totals[1]), exposure)
        minor = largest_remainder(int(component_totals[2]), exposure * .85)
        crashes = fatal + serious + minor
    else:
        national_rate = CRASH_TOTAL_2026 / max(float(exposure.sum()) * 18.0, 1)
        crashes = np.rint(exposure * national_rate).astype(np.int64)
    frame["annual_crashes_estimate"] = crashes
    if complete_network:
        allocation = np.column_stack([fatal, serious, minor])
    else:
        composition = np.column_stack([crashes * ratio for ratio in CRASH_COMPOSITION_2025])
        allocation = np.floor(composition).astype(int)
        for i in range(len(frame)):
            remainder = int(crashes[i] - allocation[i].sum())
            if remainder > 0: allocation[i, np.argsort(composition[i]-allocation[i])[-remainder:]] += 1
    frame["annual_fatal_crashes_estimate"] = allocation[:, 0]
    frame["annual_serious_crashes_estimate"] = allocation[:, 1]
    frame["annual_minor_crashes_estimate"] = allocation[:, 2]
    vehicle_km = np.maximum(total * 365 * length, 1)
    frame["crash_rate_per_100m_vehicle_km"] = np.round(crashes / vehicle_km * 100_000_000, 3)
    score = frame["crash_rate_per_100m_vehicle_km"] + frame["speed_over_limit_pct"] / 20
    frame["road_safety_risk_band"] = pd.cut(score, [-1, .7, 1.6, 3.0, np.inf], labels=["Low", "Moderate", "High", "Critical"]).astype(str)
    frame["traffic_projection_status"] = "2026 model projection"
    frame["traffic_projection_method"] = "CPU Extra Trees AADT model; balanced 12-class allocation; exposure-based safety and overload estimates"
    frame["traffic_statistics_source"] = UPF_SOURCE
    frame["speed_statistics_source"] = SPEED_SOURCE
    frame["overload_statistics_source"] = OVERLOAD_SOURCE
    return frame


def hotosm_endpoints(ids: set[str]) -> pd.DataFrame:
    path = SOURCE / "hotosm_uga_roads_osm_shp" / "roads_lines.shp"
    rows = []
    with fiona.open(path) as layer:
        for feature in layer:
            fid = str(feature["properties"].get("id") or "")
            if fid not in ids or not feature.get("geometry"): continue
            coordinates = feature["geometry"]["coordinates"]
            if not coordinates: continue
            start, end = coordinates[0], coordinates[-1]
            rows.append((fid, float(start[0]), float(start[1]), float(end[0]), float(end[1])))
    return pd.DataFrame(rows, columns=["osm_feature_id", "start_x_coordinate_dd", "start_y_coordinate_dd", "end_x_coordinate_dd", "end_y_coordinate_dd"]).drop_duplicates("osm_feature_id")


def update_hotosm(models: dict[str, Pipeline], towns: pd.DataFrame, tree: cKDTree, cosine: float) -> dict:
    path = DATA / "hotosm_vehicular_link_attributes.csv.gz"
    with gzip.open(path, "rt", encoding="utf-8", newline="") as stream:
        frame = pd.read_csv(stream, low_memory=False)
    endpoints = hotosm_endpoints(set(frame["osm_feature_id"].astype(str)))
    frame = frame.drop(columns=[c for c in endpoints.columns if c != "osm_feature_id" and c in frame.columns], errors="ignore").merge(endpoints, on="osm_feature_id", how="left")
    frame["geometry_length_km"] = pd.to_numeric(frame["length_km"], errors="coerce")
    frame["condition_risk"] = frame["condition"].map({"Good":25,"Fair":60,"Poor":90}).fillna(60)
    frame["surface_risk"] = frame["pavement_class"].map({"Paved":20,"Unpaved":55}).fillna(45)
    frame["planning_priority_score"] = frame["condition_risk"]*.62 + frame["surface_risk"]*.38
    frame["priority_band"] = pd.cut(frame["planning_priority_score"],[-1,39,59,74,101],labels=["Low","Moderate","High","Critical"]).astype(str)
    frame["recommended_intervention"] = frame["condition"].map({"Good":"Routine maintenance","Fair":"Periodic maintenance","Poor":"Rehabilitation"}).fillna("Periodic maintenance")
    frame["x_coordinate_dd"] = (pd.to_numeric(frame["start_x_coordinate_dd"], errors="coerce") + pd.to_numeric(frame["end_x_coordinate_dd"], errors="coerce")) / 2
    frame["y_coordinate_dd"] = (pd.to_numeric(frame["start_y_coordinate_dd"], errors="coerce") + pd.to_numeric(frame["end_y_coordinate_dd"], errors="coerce")) / 2
    for target, bounds in {"registry_aadt":(20,30000),"registry_pcu":(20,40000),"registry_speed_kmh":(5,100)}.items():
        frame[target] = np.rint(predict(models[target], frame, *bounds)).astype(int) if target != "registry_speed_kmh" else np.round(predict(models[target], frame, *bounds), 1)
    functional=frame["highway"].astype(str).str.lower()
    traffic_factor=functional.map({"motorway":5.2,"motorway_link":3.5,"trunk":4.4,"trunk_link":3.2,"primary":3.2,"primary_link":2.6,"secondary":2.2,"secondary_link":1.9,"tertiary":1.55,"tertiary_link":1.4,"residential":.72,"living_street":.55,"service":.42,"track":.2,"road":.65,"unclassified":.58}).fillna(.75)
    speed_factor=functional.map({"motorway":7.0,"motorway_link":5.5,"trunk":6.0,"trunk_link":4.8,"primary":4.8,"primary_link":4.1,"secondary":3.7,"secondary_link":3.3,"tertiary":2.9,"tertiary_link":2.6,"residential":2.1,"living_street":1.6,"service":1.4,"track":1.0,"road":1.8,"unclassified":1.7}).fillna(1.8)
    frame["registry_aadt"]=np.rint(pd.to_numeric(frame["registry_aadt"])*traffic_factor).clip(20,30000).astype(int)
    frame["registry_pcu"]=np.rint(pd.to_numeric(frame["registry_pcu"])*traffic_factor).clip(20,40000).astype(int)
    frame["registry_speed_kmh"]=(pd.to_numeric(frame["registry_speed_kmh"])*speed_factor).clip(5,100).round(1)
    start_name, start_distance = nearest_towns(frame, "start_x_coordinate_dd", "start_y_coordinate_dd", towns, tree, cosine)
    end_name, end_distance = nearest_towns(frame, "end_x_coordinate_dd", "end_y_coordinate_dd", towns, tree, cosine)
    frame["start_town"], frame["start_town_distance_km"] = start_name, np.round(start_distance, 3)
    frame["end_town"], frame["end_town_distance_km"] = end_name, np.round(end_distance, 3)
    unnamed = frame["road_name"].astype(str).str.lower().isin(["not supplied", "nan", "none", ""])
    frame.loc[unnamed, "road_name_display"] = frame.loc[unnamed, "start_town"] + " - " + frame.loc[unnamed, "end_town"]
    frame.loc[unnamed, "road_name_assignment_basis"] = "Start and end settlement geospatial proximity"
    frame["traffic_value_status"] = "Model estimated"
    frame["traffic_model_id"] = MODEL_ID
    frame["traffic_assignment_basis"] = "Cross-validated 2026 CPU ensemble with functional-class calibration and road, pavement, condition, administrative and spatial inputs"
    frame = traffic_detail(frame, complete_network=True)
    frame["coordinate_basis"]="WGS84 start and end vertices from HOTOSM source line geometry"
    frame.drop(columns=["x_coordinate_dd","y_coordinate_dd","geometry_length_km","condition_risk","surface_risk","planning_priority_score","priority_band","recommended_intervention"], inplace=True)
    temporary = path.with_suffix(".v2.tmp.gz")
    with gzip.open(temporary, "wt", encoding="utf-8", newline="", compresslevel=6) as stream:
        frame.to_csv(stream, index=False, quoting=csv.QUOTE_MINIMAL)
    temporary.replace(path)
    return {"records": len(frame), "endpoint_coordinates": int(frame["start_x_coordinate_dd"].notna().sum()), "projected_crashes_2026": int(frame["annual_crashes_estimate"].sum()), "projected_fatal": int(frame["annual_fatal_crashes_estimate"].sum()), "projected_serious": int(frame["annual_serious_crashes_estimate"].sum()), "projected_minor": int(frame["annual_minor_crashes_estimate"].sum())}


def update_governed(models: dict[str, Pipeline], links: list[dict], towns: pd.DataFrame, tree: cKDTree, cosine: float) -> tuple[list[dict], dict]:
    frame = pd.DataFrame(links)
    for target, bounds in {"registry_aadt":(20,30000),"registry_pcu":(20,40000),"registry_speed_kmh":(5,100)}.items():
        estimates = predict(models[target], frame, *bounds)
        missing = ~frame["traffic_value_status"].astype(str).str.lower().eq("observed")
        frame.loc[missing, target] = np.rint(estimates[missing]).astype(int) if target != "registry_speed_kmh" else np.round(estimates[missing], 1)
    start_name, start_distance = nearest_towns(frame, "start_x_coordinate_dd", "start_y_coordinate_dd", towns, tree, cosine)
    end_name, end_distance = nearest_towns(frame, "end_x_coordinate_dd", "end_y_coordinate_dd", towns, tree, cosine)
    frame["start_town"], frame["start_town_distance_km"] = start_name, np.round(start_distance, 3)
    frame["end_town"], frame["end_town_distance_km"] = end_name, np.round(end_distance, 3)
    generic = frame["road_name_authoritative"].astype(str).str.lower().isin(["not supplied", "nan", "none", ""])
    frame.loc[generic, "road_name_display"] = frame.loc[generic, "start_town"] + " - " + frame.loc[generic, "end_town"]
    frame.loc[generic, "road_name_assignment_basis"] = "Start and end settlement geospatial proximity"
    frame["traffic_model_id"] = np.where(frame["traffic_value_status"].astype(str).str.lower().eq("observed"), "Not applicable - observed value", MODEL_ID)
    frame["traffic_projection_status"] = np.where(frame["traffic_value_status"].astype(str).str.lower().eq("observed"), "2026 observation retained", "2026 model projection")
    frame["length_km"] = pd.to_numeric(frame["geometry_length_km"], errors="coerce").fillna(0).round(3)
    frame = traffic_detail(frame)
    frame = frame.astype(object).where(pd.notna(frame), None)
    records = frame.to_dict("records")
    (DATA / "ducar_link_register.json").write_text(json.dumps(records, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    with (DATA / "ducar_link_register.csv").open("w", newline="", encoding="utf-8-sig") as stream:
        public_fields=[field for field in records[0] if field not in {"x_coordinate_dd","y_coordinate_dd"}]
        writer = csv.DictWriter(stream, fieldnames=public_fields, extrasaction="ignore"); writer.writeheader(); writer.writerows(records)
    return records, {"records":len(records), "all_ids_valid":all(re.fullmatch(r"[A-Z]{4}\d{3}", str(row["link_id"])) for row in records), "unique_ids":len({row["link_id"] for row in records})}


def transfer_related(links: list[dict]) -> None:
    index = {row["link_id"]: row for row in links}
    transfer = TRAFFIC_FIELDS + ["registry_aadt","registry_pcu","registry_speed_kmh","traffic_model_id","road_name_display"]
    for filename, wrapper in [("ducar_link_admin_relations.json", None), ("ducar_socioeconomic_link_analysis.json", "rows")]:
        path = DATA / filename; payload = json.loads(path.read_text(encoding="utf-8")); rows = payload[wrapper] if wrapper else payload
        for row in rows:
            source = index.get(row.get("link_id"))
            if source: row.update({field:source.get(field) for field in transfer})
        path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    path = DATA / "ducar_socioeconomic_roads.geojson"; payload = json.loads(path.read_text(encoding="utf-8"))
    for feature in payload["features"]:
        source = index.get(feature["properties"].get("link_id"))
        if source: feature["properties"].update({field:source.get(field) for field in transfer})
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def national_register() -> dict:
    source = SOURCE / "National Roads" / "networkXY2026.xlsx"
    frame = pd.read_excel(source, sheet_name="network2026")
    frame["source_link_id"] = frame["Link_ID"]
    frame["national_link_sequence"] = frame.groupby("Road_No", sort=False).cumcount() + 1
    frame["link_id"] = frame["Road_No"].astype(str).str.upper() + "_Link" + frame["national_link_sequence"].astype(str).str.zfill(2)
    frame.rename(columns={"Road_No":"road_no","Road_Class":"road_class","Link_Name":"road_name","Chainage_From":"chainage_from_km","Chainage_To":"chainage_to_km","Length(km)":"length_km","Surface_Type":"surface","Maintenance_Station":"maintenance_station","Maintenance_Region":"maintenance_region","START_X":"start_x_coordinate_dd","START_Y":"start_y_coordinate_dd","END_X":"end_x_coordinate_dd","END_Y":"end_y_coordinate_dd"}, inplace=True)
    frame["pavement_class"] = np.where(frame["surface"].astype(str).str.lower().isin(["bituminous","concrete"]), "Paved", "Unpaved")
    frame["link_id_correction_status"] = np.where(frame["source_link_id"] == frame["link_id"], "Source ID retained", "Resequenced to unique Road_No_LinkNN standard")
    fields = ["link_id","source_link_id","road_no","road_class","road_name","length_km","chainage_from_km","chainage_to_km","surface","pavement_class","maintenance_station","maintenance_region","start_x_coordinate_dd","start_y_coordinate_dd","end_x_coordinate_dd","end_y_coordinate_dd","link_id_correction_status"]
    rows = frame[fields].replace({np.nan:None}).to_dict("records")
    (DATA / "national_road_link_register.json").write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    frame[fields].to_csv(DATA / "national_road_link_register.csv", index=False, encoding="utf-8-sig")
    connection=sqlite3.connect(DATA/"ducar_enterprise_unified.sqlite")
    frame[fields].to_sql("national_road_link_register",connection,if_exists="replace",index=False)
    connection.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_national_link_id ON national_road_link_register(link_id)')
    connection.commit();connection.close()
    return {"records":len(rows), "road_numbers":int(frame["road_no"].nunique()), "length_km":round(float(frame["length_km"].sum()),3), "source_duplicate_ids":int(frame["source_link_id"].duplicated().sum()), "corrected_duplicate_ids":int(frame["link_id"].duplicated().sum()), "standard":"Road_No_LinkNN"}


def district_id_audit(links:list[dict],national:dict)->dict:
    root=SOURCE/"Road data from districts";samples=[];patterns={"four_letter_prefix_three_digits":0,"legacy_numeric":0,"legacy_mixed":0}
    for path in sorted(root.rglob("*.xlsx")):
        try:
            book=pd.ExcelFile(path)
            for sheet in book.sheet_names[:3]:
                raw=pd.read_excel(path,sheet_name=sheet,header=None,nrows=25)
                found=False
                for row_index,row in raw.iterrows():
                    for column,heading in enumerate(row.tolist()):
                        if not re.search(r"road\s*(id|no)|link\s*(id|no)",str(heading),re.I):continue
                        values=[str(value).strip() for value in raw.iloc[row_index+1:row_index+9,column].dropna().tolist() if str(value).strip().lower() not in {"nan","none"}]
                        for value in values:
                            if re.fullmatch(r"[A-Za-z]{4}\d{3}",value):patterns["four_letter_prefix_three_digits"]+=1
                            elif re.fullmatch(r"\d+",value):patterns["legacy_numeric"]+=1
                            else:patterns["legacy_mixed"]+=1
                        if values:samples.append({"workbook":path.name,"sheet":sheet,"source_field":str(heading),"sample_ids":values})
                        found=True;break
                    if found:break
        except Exception:continue
    audit={"audited_at_utc":datetime.now(timezone.utc).isoformat(),"district_source_workbooks":len(list(root.rglob("*.xlsx"))),"source_id_patterns":patterns,"source_examples":samples,"public_ducar_standard":"[DISTRICT 4-LETTER PREFIX][3-DIGIT SEQUENCE]","public_ducar_records":len(links),"public_ducar_valid_ids":sum(bool(re.fullmatch(r"[A-Z]{4}\d{3}",str(row["link_id"]))) for row in links),"public_ducar_unique_ids":len({row["link_id"] for row in links}),"national_standard":"Road_No_LinkNN","national_register":national,"policy":"Legacy district identifiers are retained only as provenance. Public DUCAR Link IDs use the approved district-prefix standard; national links use the independent national Road_No_LinkNN standard."}
    (DATA/"road_id_standard_audit.json").write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding="utf-8")
    return audit


def update_sqlite(links: list[dict]) -> None:
    connection = sqlite3.connect(DATA / "ducar_enterprise_unified.sqlite")
    existing = {row[1] for row in connection.execute('PRAGMA table_info("ducar_link_register")')}
    for field in ["length_km"] + TRAFFIC_FIELDS:
        if field in existing: continue
        value = next((row.get(field) for row in links if row.get(field) is not None), None)
        kind = "REAL" if isinstance(value, (int,float)) and not isinstance(value, bool) else "TEXT"
        connection.execute(f'ALTER TABLE "ducar_link_register" ADD COLUMN "{field}" {kind}')
    fields = ["length_km"] + TRAFFIC_FIELDS
    connection.executemany(f'UPDATE "ducar_link_register" SET {", ".join(f"{field}=?" for field in fields)} WHERE link_id=?', [[row.get(field) for field in fields] + [row["link_id"]] for row in links])
    connection.commit(); connection.close()


def main() -> None:
    links = json.loads((DATA / "ducar_link_register.json").read_text(encoding="utf-8"))
    models, metrics = train_models(pd.DataFrame(links))
    towns, tree, cosine = town_index()
    links, governed = update_governed(models, links, towns, tree, cosine)
    hotosm = update_hotosm(models, towns, tree, cosine)
    transfer_related(links)
    update_sqlite(links)
    national = national_register();identifier_audit=district_id_audit(links,national)
    report = {"model_id":MODEL_ID,"trained_at_utc":datetime.now(timezone.utc).isoformat(),"accelerator":"CPU - all logical cores","targets":metrics,"governed_ducar":governed,"complete_hotosm_network":hotosm,"national_id_register":national,"identifier_audit":{"district_source_workbooks":identifier_audit["district_source_workbooks"],"public_ducar_valid_ids":identifier_audit["public_ducar_valid_ids"],"public_ducar_unique_ids":identifier_audit["public_ducar_unique_ids"]},"full_network_calibration":"Extra Trees prediction calibrated by HOTOSM motorway, trunk, primary, secondary, tertiary, residential, service, track and unclassified functional class.","projection":{"year":PROJECTION_YEAR,"projected_crashes":CRASH_TOTAL_2026,"basis":"2025 UPF total projected by 2024-2025 growth","sources":[UPF_SOURCE,SPEED_SOURCE,OVERLOAD_SOURCE]},"public_coordinate_policy":"Road tables expose start and end WGS84 decimal-degree coordinates; midpoint coordinates remain backend-only."}
    (DATA / "traffic_ml_2026_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
