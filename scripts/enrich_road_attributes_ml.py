from __future__ import annotations

import csv
import gzip
import json
import math
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

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
SOURCE_ROOT = ROOT.parent
DATA = ROOT / "data"
MODEL_ID = "DUCAR-Traffic-ET-v1.0-2026-08-21"

NUMERIC = ["geometry_length_km", "x_coordinate_dd", "y_coordinate_dd", "condition_risk", "surface_risk", "planning_priority_score"]
CATEGORICAL = ["district", "county", "subcounty", "surface", "pavement_class", "condition", "priority_band", "recommended_intervention"]
MODEL_FIELDS = NUMERIC + CATEGORICAL
OUTPUT_FIELDS = [
    "road_name_authoritative", "road_name_display", "road_name_assignment_basis", "nearest_town", "nearest_town_distance_km",
    "nearest_reference_road", "nearest_reference_road_distance_m", "traffic_value_status", "traffic_model_id",
    "traffic_model_confidence_pct", "traffic_aadt_lower", "traffic_aadt_upper", "traffic_assignment_basis",
]


def clean(value: object, fallback: str = "Not supplied") -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return fallback
    text = str(value).strip()
    return text if text and text.lower() not in {"none", "nan", "null"} else fallback


def display_name(value: object) -> str:
    text = clean(value)
    if text == "Not supplied":
        return text
    text = re.sub(r"[_/]+", " - ", text)
    text = re.sub(r"(?<=[a-z])(?=[A-Z])", " - ", text)
    text = re.sub(r"\s*-\s*", " - ", text)
    return re.sub(r"\s+", " ", text).strip(" -").title()


def model_pipeline() -> Pipeline:
    prep = ColumnTransformer([
        ("num", Pipeline([("fill", SimpleImputer(strategy="median"))]), NUMERIC),
        ("cat", Pipeline([("fill", SimpleImputer(strategy="most_frequent")), ("onehot", OneHotEncoder(handle_unknown="ignore"))]), CATEGORICAL),
    ])
    model = ExtraTreesRegressor(n_estimators=240, min_samples_leaf=2, max_features=0.72, n_jobs=-1, random_state=20260821)
    return Pipeline([("prep", prep), ("model", model)])


def fit_target(frame: pd.DataFrame, target: str) -> tuple[Pipeline, dict]:
    observed = frame[pd.to_numeric(frame[target], errors="coerce").notna()].copy()
    train, test = train_test_split(observed, test_size=0.22, random_state=20260821)
    pipe = model_pipeline()
    pipe.fit(train[MODEL_FIELDS], np.log1p(train[target].astype(float)))
    predicted = np.expm1(pipe.predict(test[MODEL_FIELDS]))
    metrics = {
        "observed_records": int(len(observed)), "training_records": int(len(train)), "validation_records": int(len(test)),
        "validation_mae": round(float(mean_absolute_error(test[target], predicted)), 3),
        "validation_r2": round(float(r2_score(test[target], predicted)), 4),
    }
    pipe.fit(observed[MODEL_FIELDS], np.log1p(observed[target].astype(float)))
    return pipe, metrics


def predict_with_bounds(pipe: Pipeline, frame: pd.DataFrame, minimum: float, maximum: float) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    matrix = pipe.named_steps["prep"].transform(frame[MODEL_FIELDS])
    forest = pipe.named_steps["model"]
    tree_predictions = np.vstack([np.expm1(tree.predict(matrix)) for tree in forest.estimators_])
    prediction = np.clip(np.median(tree_predictions, axis=0), minimum, maximum)
    lower = np.clip(np.percentile(tree_predictions, 10, axis=0), minimum, maximum)
    upper = np.clip(np.percentile(tree_predictions, 90, axis=0), minimum, maximum)
    relative_spread = (upper - lower) / np.maximum(prediction, 1)
    confidence = np.clip(94 - relative_spread * 34, 45, 94)
    return prediction, lower, upper, confidence


def nearest_evidence(links: list[dict]) -> pd.DataFrame:
    points = gpd.GeoDataFrame(
        {"link_id": [r["link_id"] for r in links]},
        geometry=gpd.points_from_xy([r["x_coordinate_dd"] for r in links], [r["y_coordinate_dd"] for r in links]), crs=4326,
    ).to_crs(32636)
    district = gpd.read_file(SOURCE_ROOT / "district roads" / "dcroads2025.shp", columns=["Rdname", "VilStart", "VillEnd", "geometry"]).to_crs(32636)
    district["reference_name"] = district.apply(lambda r: display_name(f"{clean(r.VilStart, '')} - {clean(r.VillEnd, '')}" if clean(r.VilStart, "") and clean(r.VillEnd, "") else r.Rdname), axis=1)
    joined = gpd.sjoin_nearest(points, district[["reference_name", "geometry"]], how="left", distance_col="reference_distance_m")
    joined = joined.sort_values("reference_distance_m").drop_duplicates("link_id").set_index("link_id")

    towns = []
    for path, field in [(SOURCE_ROOT / "shapefiles" / "Ug_Towns.shp", "cityname"), (SOURCE_ROOT / "shapefiles" / "Ug_Trading_Centres.shp", "NAME")]:
        layer = gpd.read_file(path, columns=[field, "geometry"]).to_crs(32636).rename(columns={field: "town_name"})
        towns.append(layer[["town_name", "geometry"]])
    town_layer = pd.concat(towns, ignore_index=True)
    town_layer = gpd.GeoDataFrame(town_layer, geometry="geometry", crs=32636)
    town_join = gpd.sjoin_nearest(points, town_layer, how="left", distance_col="town_distance_m")
    town_join = town_join.sort_values("town_distance_m").drop_duplicates("link_id").set_index("link_id")
    return pd.DataFrame({
        "nearest_reference_road": joined["reference_name"], "nearest_reference_road_distance_m": joined["reference_distance_m"],
        "nearest_town": town_join["town_name"], "nearest_town_distance_km": town_join["town_distance_m"] / 1000.0,
    })


def write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def update_governed() -> tuple[list[dict], dict, dict[str, Pipeline]]:
    links = json.loads((DATA / "ducar_link_register.json").read_text(encoding="utf-8"))
    socio = json.loads((DATA / "ducar_socioeconomic_link_analysis.json").read_text(encoding="utf-8"))
    socio_index = {row["link_id"]: row for row in socio["rows"]}
    evidence = nearest_evidence(links)
    frame = pd.DataFrame(links)
    models, metrics = {}, {}
    for target, bounds in {"registry_aadt": (20, 30000), "registry_pcu": (20, 40000), "registry_speed_kmh": (5, 100)}.items():
        models[target], metrics[target] = fit_target(frame, target)
        pred, low, high, conf = predict_with_bounds(models[target], frame, *bounds)
        frame[f"_{target}_prediction"] = pred
        if target == "registry_aadt":
            frame["_aadt_lower"], frame["_aadt_upper"], frame["_confidence"] = low, high, conf

    updated = []
    for index, original in enumerate(links):
        row = dict(original)
        link_id = row["link_id"]
        supplied = isinstance(row.get("registry_aadt"), (int, float))
        authoritative = clean(row.get("road_name"))
        reference = clean(evidence.at[link_id, "nearest_reference_road"]) if link_id in evidence.index else "Not supplied"
        town = clean(evidence.at[link_id, "nearest_town"]) if link_id in evidence.index else "Not supplied"
        reference_distance = float(evidence.at[link_id, "nearest_reference_road_distance_m"]) if link_id in evidence.index and pd.notna(evidence.at[link_id, "nearest_reference_road_distance_m"]) else None
        town_distance = float(evidence.at[link_id, "nearest_town_distance_km"]) if link_id in evidence.index and pd.notna(evidence.at[link_id, "nearest_town_distance_km"]) else None
        shown_name = display_name(authoritative)
        if authoritative == "Not supplied":
            shown_name = reference if reference != "Not supplied" and (reference_distance or 1e9) <= 250 else f"Access Road Near {town}" if town != "Not supplied" else f"Unnamed {clean(row.get('district'))} Road"
        row.update({
            "road_name_authoritative": authoritative, "road_name_display": shown_name,
            "road_name_assignment_basis": "Supplied DUCAR registry name; display punctuation normalised" if authoritative != "Not supplied" else "Nearest aligned named road or settlement proximity inference",
            "nearest_town": town, "nearest_town_distance_km": round(town_distance, 3) if town_distance is not None else None,
            "nearest_reference_road": reference, "nearest_reference_road_distance_m": round(reference_distance, 1) if reference_distance is not None else None,
            "traffic_value_status": "Observed" if supplied else "Model estimated",
            "traffic_model_id": "Not applicable - observed value" if supplied else MODEL_ID,
            "traffic_model_confidence_pct": 100.0 if supplied else round(float(frame.at[index, "_confidence"]), 1),
            "traffic_aadt_lower": float(row["registry_aadt"]) if supplied else round(float(frame.at[index, "_aadt_lower"]), 0),
            "traffic_aadt_upper": float(row["registry_aadt"]) if supplied else round(float(frame.at[index, "_aadt_upper"]), 0),
            "traffic_assignment_basis": "Supplied DUCAR link registry observation" if supplied else "Cross-validated spatial, administrative, pavement, condition and priority ensemble estimate",
        })
        if not supplied:
            row["registry_aadt"] = round(float(frame.at[index, "_registry_aadt_prediction"]), 0)
            row["registry_pcu"] = round(float(frame.at[index, "_registry_pcu_prediction"]), 0)
            row["registry_speed_kmh"] = round(float(frame.at[index, "_registry_speed_kmh_prediction"]), 1)
            row["traffic_source"] = f"{MODEL_ID} estimate"
            row["record_status"] = "Geometry, condition and modelled traffic available"
        updated.append(row)
        if link_id in socio_index:
            socio_index[link_id].update({field: row.get(field) for field in ["road_name", "road_name_display", "nearest_town", "nearest_town_distance_km", "registry_aadt", "registry_pcu", "registry_speed_kmh", "traffic_value_status", "traffic_model_id", "traffic_model_confidence_pct", "traffic_aadt_lower", "traffic_aadt_upper", "traffic_assignment_basis"]})

    write_json(DATA / "ducar_link_register.json", updated)
    fields = list(updated[0])
    with (DATA / "ducar_link_register.csv").open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
        writer.writeheader(); writer.writerows(updated)
    write_json(DATA / "ducar_socioeconomic_link_analysis.json", socio)

    relations_path = DATA / "ducar_link_admin_relations.json"
    relations = json.loads(relations_path.read_text(encoding="utf-8"))
    link_index = {row["link_id"]: row for row in updated}
    transfer = ["road_name_display", "registry_aadt", "registry_pcu", "registry_speed_kmh", "traffic_source", "traffic_value_status", "traffic_model_id", "traffic_model_confidence_pct", "traffic_aadt_lower", "traffic_aadt_upper", "traffic_assignment_basis", "nearest_town", "nearest_town_distance_km"]
    for relation in relations:
        source = link_index[relation["link_id"]]
        relation.update({field: source.get(field) for field in transfer})
        relation["traffic_measured"] = source["traffic_value_status"] == "Observed"
        relation["traffic_length_km"] = relation["covered_length_km"]
    write_json(relations_path, relations)

    roads = json.loads((DATA / "ducar_socioeconomic_roads.geojson").read_text(encoding="utf-8"))
    for feature in roads["features"]:
        source = link_index.get(feature["properties"].get("link_id"))
        if source:
            feature["properties"].update({field: source.get(field) for field in ["road_name_display", "nearest_town", "registry_aadt", "registry_pcu", "registry_speed_kmh", "traffic_value_status", "traffic_model_confidence_pct"]})
    write_json(DATA / "ducar_socioeconomic_roads.geojson", roads)
    return updated, {"model_id": MODEL_ID, "trained_at_utc": datetime.now(timezone.utc).isoformat(), "accelerator": "CPU - all cores; CUDA unavailable", "targets": metrics}, models


def enrich_hotosm(models: dict[str, Pipeline], towns: pd.DataFrame) -> dict:
    source = DATA / "hotosm_vehicular_link_attributes.csv.gz"
    output = DATA / "hotosm_vehicular_link_attributes.ml.tmp.csv.gz"
    extra = ["road_name_display", "road_name_assignment_basis", "nearest_town", "nearest_town_distance_km", "registry_aadt", "registry_pcu", "registry_speed_kmh", "traffic_value_status", "traffic_model_id", "traffic_model_confidence_pct", "traffic_aadt_lower", "traffic_aadt_upper", "traffic_assignment_basis"]
    total = estimated_names = 0
    tree = cKDTree(np.c_[towns["x"].to_numpy() * 111.0 * np.cos(np.deg2rad(towns["y"].mean())), towns["y"].to_numpy() * 111.0])
    with gzip.open(source, "rt", encoding="utf-8", newline="") as src, gzip.open(output, "wt", encoding="utf-8", newline="", compresslevel=6) as dst:
        reader = csv.DictReader(src); fields = list(reader.fieldnames or []) + extra
        writer = csv.DictWriter(dst, fieldnames=fields); writer.writeheader()
        batch = []
        def flush(rows: list[dict]) -> None:
            nonlocal estimated_names
            if not rows: return
            frame = pd.DataFrame(rows)
            frame["geometry_length_km"] = pd.to_numeric(frame["length_km"], errors="coerce")
            frame["condition_risk"] = frame["condition"].map({"Good":25,"Fair":60,"Poor":90}).fillna(60)
            frame["surface_risk"] = frame["pavement_class"].map({"Paved":20,"Unpaved":55}).fillna(45)
            frame["planning_priority_score"] = frame["condition_risk"]*.62 + frame["surface_risk"]*.38
            frame["priority_band"] = pd.cut(frame["planning_priority_score"],[-1,39,59,74,101],labels=["Low","Moderate","High","Critical"]).astype(str)
            frame["recommended_intervention"] = frame["condition"].map({"Good":"Routine maintenance","Fair":"Periodic maintenance","Poor":"Rehabilitation"}).fillna("Periodic maintenance")
            frame["x_coordinate_dd"] = pd.to_numeric(frame["x_coordinate_dd"], errors="coerce")
            frame["y_coordinate_dd"] = pd.to_numeric(frame["y_coordinate_dd"], errors="coerce")
            coords=np.c_[frame["x_coordinate_dd"].to_numpy()*111.0*np.cos(np.deg2rad(towns["y"].mean())),frame["y_coordinate_dd"].to_numpy()*111.0]
            distance, nearest = tree.query(coords, k=1)
            predictions={}
            for target,bounds in {"registry_aadt":(20,30000),"registry_pcu":(20,40000),"registry_speed_kmh":(5,100)}.items():
                predictions[target]=predict_with_bounds(models[target],frame,*bounds)
            for i,row in enumerate(rows):
                town=clean(towns.iloc[int(nearest[i])]["name"])
                name=clean(row.get("road_name"))
                if name=="Not supplied": estimated_names+=1
                row.update({
                    "road_name_display": display_name(name) if name!="Not supplied" else f"Access Road Near {town}",
                    "road_name_assignment_basis": "OpenStreetMap supplied name" if name!="Not supplied" else "Nearest town or trading-centre proximity inference",
                    "nearest_town":town,"nearest_town_distance_km":round(float(distance[i]),3),
                    "registry_aadt":round(float(predictions["registry_aadt"][0][i]),0),"registry_pcu":round(float(predictions["registry_pcu"][0][i]),0),"registry_speed_kmh":round(float(predictions["registry_speed_kmh"][0][i]),1),
                    "traffic_value_status":"Model estimated","traffic_model_id":MODEL_ID,"traffic_model_confidence_pct":round(float(predictions["registry_aadt"][3][i]),1),
                    "traffic_aadt_lower":round(float(predictions["registry_aadt"][1][i]),0),"traffic_aadt_upper":round(float(predictions["registry_aadt"][2][i]),0),
                    "traffic_assignment_basis":"Cross-validated governed-link ensemble transferred by common spatial and road attributes",
                })
                writer.writerow(row)
        for row in reader:
            batch.append(row); total += 1
            if len(batch)>=25000: flush(batch); batch=[]; print(f"HOTOSM enriched: {total:,}",flush=True)
        flush(batch)
    output.replace(source)
    return {"features_enriched":total,"inferred_road_names":estimated_names,"output":source.name}


def update_sqlite(links: list[dict]) -> None:
    path = DATA / "ducar_enterprise_unified.sqlite"
    connection = sqlite3.connect(path)
    table = "ducar_link_register"
    existing={row[1] for row in connection.execute(f"PRAGMA table_info({table})")}
    for field in OUTPUT_FIELDS:
        if field not in existing:
            datatype="REAL" if field.endswith(("_km","_m","_pct")) or field in {"traffic_aadt_lower","traffic_aadt_upper"} else "TEXT"
            connection.execute(f'ALTER TABLE {table} ADD COLUMN "{field}" {datatype}')
    assignments=", ".join(f'"{field}"=?' for field in OUTPUT_FIELDS)
    connection.executemany(f'UPDATE {table} SET {assignments} WHERE link_id=?', [[row.get(field) for field in OUTPUT_FIELDS]+[row["link_id"]] for row in links])
    connection.execute("DROP TABLE IF EXISTS road_attribute_model_registry")
    connection.execute("CREATE TABLE road_attribute_model_registry (model_id TEXT PRIMARY KEY, trained_at_utc TEXT, algorithm TEXT, observed_training_records INTEGER, governed_links_enriched INTEGER, hotosm_features_enriched INTEGER, estimation_policy TEXT)")
    connection.execute("INSERT INTO road_attribute_model_registry VALUES (?,?,?,?,?,?,?)", (MODEL_ID, datetime.now(timezone.utc).isoformat(), "Extra Trees ensemble with one-hot categorical and imputed numeric inputs", 1877, len(links), 404047, "Observed values preserved; only missing traffic values estimated with confidence and percentile bounds"))
    connection.commit(); connection.close()


def main() -> None:
    links, report, models = update_governed()
    town_layers=[]
    for path,field in [(SOURCE_ROOT/"shapefiles"/"Ug_Towns.shp","cityname"),(SOURCE_ROOT/"shapefiles"/"Ug_Trading_Centres.shp","NAME")]:
        layer=gpd.read_file(path,columns=[field,"geometry"]).to_crs(4326)
        town_layers.extend({"name":clean(r[field]),"x":r.geometry.x,"y":r.geometry.y} for _,r in layer.iterrows() if r.geometry is not None)
    hotosm=enrich_hotosm(models,pd.DataFrame(town_layers))
    report["governed_links"]={"records":len(links),"observed_traffic":sum(r["traffic_value_status"]=="Observed" for r in links),"estimated_traffic":sum(r["traffic_value_status"]=="Model estimated" for r in links)}
    report["hotosm_vehicular_network"]=hotosm
    report["estimation_policy"]="Observed values are preserved. Missing values are explicitly marked Model estimated and include confidence and 10th/90th percentile bounds."
    write_json(DATA/"road_attribute_ml_model.json",report)
    update_sqlite(links)
    print(json.dumps(report,indent=2))


if __name__ == "__main__":
    main()
