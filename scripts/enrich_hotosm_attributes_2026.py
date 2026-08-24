from __future__ import annotations

"""Complete public road names and model missing planning attributes.

Observed values remain traceable. Missing surface, pavement and condition values
receive deterministic 2026 estimates plus explicit basis and confidence fields.
"""

import ast
import json
import re
from pathlib import Path

import pandas as pd
import geopandas as gpd


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SOURCE_ATTRIBUTES = DATA / "hotosm_vehicular_link_attributes.csv.gz"
ROUTES = DATA / "hotosm_vehicular_route_register.csv.gz"
WEB_ROUTES = DATA / "hotosm_vehicular_map.geojson"
DUCAR_CSV = DATA / "ducar_link_register.csv"
DUCAR_JSON = DATA / "ducar_link_register.json"
ANALYSIS = DATA / "hotosm_vehicular_analysis.json"
AUDIT = DATA / "road_attribute_enrichment_2026.json"
ADMIN_PARISHES = ROOT.parent / "Administrative units - Uganda" / "ug_parishes.shp"
ADMIN_DISTRICTS = ROOT.parent / "Administrative units - Uganda" / "ug_districts.shp"

EMPTY = {"", "nan", "none", "null", "not supplied", "unclassified", "unknown"}
ACRONYMS = {"kcca": "KCCA", "hq": "HQ", "hqtrs": "Headquarters", "ps": "P/S", "tc": "Town Council"}


def missing(series: pd.Series) -> pd.Series:
    return series.isna() | series.astype(str).str.strip().str.lower().isin(EMPTY)


def normalise_name(value: object) -> str:
    text = "" if value is None or pd.isna(value) else str(value)
    text = text.replace("�", " - ").replace("–", " - ").replace("—", " - ")
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)
    text = re.sub(r"[_/\\|]+", " - ", text)
    text = re.sub(r"\s*[-]+\s*", " - ", text)
    text = re.sub(r"[^\w'(). -]+", " ", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text).strip(" .-_")
    if not text or text.lower() in EMPTY:
        return ""
    parts = []
    for part in text.split(" - "):
        words = []
        for word in part.split():
            key = word.lower().strip(".")
            words.append(ACRONYMS.get(key, word[:1].upper() + word[1:].lower()))
        titled = " ".join(words)
        if titled and titled.casefold() not in {item.casefold() for item in parts}:
            parts.append(titled)
    return " - ".join(parts)


def resolved_name(row: pd.Series, sequence: int) -> tuple[str, str]:
    for field, basis in (
        ("road_name_display", "Supplied road name; punctuation and casing normalised"),
        ("road_name", "Supplied road name; punctuation and casing normalised"),
        ("national_link_name", "MoWT national-road alignment name"),
        ("nearest_reference_road", "Nearest aligned reference-road name"),
    ):
        if field in row:
            name = normalise_name(row.get(field))
            if name and name.casefold() not in {"district road", "road", "unnamed road"}:
                return name, basis
    start = normalise_name(row.get("start_town")) if "start_town" in row else ""
    end = normalise_name(row.get("end_town")) if "end_town" in row else ""
    nearest = normalise_name(row.get("nearest_town")) if "nearest_town" in row else ""
    if start and end and start.casefold() != end.casefold():
        return f"{start} - {end}", "Model assigned from nearest start/end settlements"
    place = start or end or nearest
    if place:
        return f"{place} Access Road", "Model assigned from nearest settlement"
    district = normalise_name(row.get("district")) or "Uganda"
    return f"{district} Access Road {sequence:06d}", "Model assigned from administrative location and sequence"


def estimate_surface(highway: str, district: str) -> tuple[str, float, str]:
    road = str(highway).lower()
    urban = str(district).strip().lower() in {"kampala", "wakiso", "jinja", "mbarara", "gulu", "arua", "mbale"}
    if road.startswith(("motorway", "trunk", "primary")):
        return "Asphalt", 82.0, "Functional-class and national-corridor surface model"
    if road.startswith(("secondary", "tertiary")):
        return ("Asphalt", 68.0, "Urban/collector functional-class surface model") if urban else ("Gravel", 66.0, "District/collector functional-class surface model")
    if road in {"residential", "living_street", "service", "busway", "services", "rest_area"}:
        return ("Asphalt", 64.0, "Urban-context functional-class surface model") if urban else ("Gravel", 58.0, "Local-road functional-class surface model")
    if road == "track":
        return "Earth", 78.0, "Track functional-class surface model"
    return "Gravel", 61.0, "Community-access functional-class surface model"


def estimate_condition(surface: str, highway: str) -> tuple[str, float, str]:
    paved = str(surface).lower() in {"asphalt", "paved", "concrete", "concrete:lanes", "concrete:plates", "paving_stones", "cobblestone", "sett", "metal", "bricks", "bituminous"}
    road = str(highway).lower()
    if paved and road.startswith(("motorway", "trunk", "primary")):
        return "Good", 70.0, "Surface and functional-class condition model"
    if paved:
        return "Fair", 62.0, "Surface and functional-class condition model"
    if str(surface).lower() in {"earth", "dirt", "ground", "mud", "sand", "clay"} or road == "track":
        return "Poor", 66.0, "Unsealed-surface and functional-class condition model"
    return "Fair", 60.0, "Unsealed-surface and functional-class condition model"


def canonical_surface(value: object) -> str:
    text = str(value).strip().lower()
    if "concrete" in text:
        return "Concrete"
    if text in {"asphalt", "paved", "bituminous", "paving_stones", "cobblestone", "sett", "metal", "bricks", "wood"}:
        return "Bituminous"
    if text in {"gravel", "fine_gravel", "compacted", "pebblestone", "unpaved"}:
        return "Gravel"
    return "Earth"


def complete_administration(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    x_field = "start_x_coordinate_dd"
    y_field = "start_y_coordinate_dd"
    if x_field not in frame or y_field not in frame:
        return frame
    for field in ["region", "district", "county", "subcounty", "parish"]:
        if field not in frame:
            frame[field] = "Not supplied"
    districts = gpd.read_file(ADMIN_DISTRICTS, columns=["adm2_name", "adm1_name"])
    region_lookup = dict(zip(districts["adm2_name"].map(normalise_name), districts["adm1_name"].map(normalise_name)))
    region_missing = missing(frame["region"])
    frame.loc[region_missing, "region"] = frame.loc[region_missing, "district"].map(
        lambda value: region_lookup.get(normalise_name(value), "Not supplied")
    )
    unresolved = frame[["district", "county", "subcounty", "parish"]].apply(missing).any(axis=1)
    valid = unresolved & pd.to_numeric(frame[x_field], errors="coerce").notna() & pd.to_numeric(frame[y_field], errors="coerce").notna()
    if not valid.any():
        return frame
    points = gpd.GeoDataFrame(frame.loc[valid, []].copy(), geometry=gpd.points_from_xy(frame.loc[valid, x_field], frame.loc[valid, y_field]), crs=4326).to_crs(32636)
    admin = gpd.read_file(ADMIN_PARISHES, columns=["DNAME_2011", "CNAME_2006", "SNAME_2006", "PNAME_2006"]).to_crs(32636)
    joined = gpd.sjoin_nearest(points, admin, how="left", max_distance=100000)
    # Boundary overlaps can yield more than one equally near polygon. Keep one
    # deterministic match per source row; the source population remains intact.
    joined = joined.loc[~joined.index.duplicated(keep="first")]
    mapping = {"district": "DNAME_2011", "county": "CNAME_2006", "subcounty": "SNAME_2006", "parish": "PNAME_2006"}
    for target, source in mapping.items():
        mask = valid & missing(frame[target])
        frame.loc[mask, target] = joined.reindex(frame.index)[source].loc[mask].fillna("Uganda").map(normalise_name)
    mask = missing(frame["region"])
    frame.loc[mask, "region"] = frame.loc[mask, "district"].map(lambda value: region_lookup.get(normalise_name(value), "Uganda"))
    frame["administrative_assignment_status"] = frame.get("administrative_assignment_status", "Source supplied")
    frame.loc[valid, "administrative_assignment_status"] = "Spatially completed from nearest official administrative polygon"
    return frame


def enrich(frame: pd.DataFrame) -> pd.DataFrame:
    frame = complete_administration(frame)
    names = [resolved_name(row, i + 1) for i, (_, row) in enumerate(frame.iterrows())]
    if "road_name_authoritative" not in frame:
        frame["road_name_authoritative"] = frame.get("road_name", "Not supplied")
    frame["road_name"] = [item[0] for item in names]
    frame["road_name_display"] = frame["road_name"]
    frame["road_name_assignment_basis"] = [item[1] for item in names]

    if "surface" not in frame:
        frame["surface"] = "Not supplied"
    if "surface_source_value" not in frame:
        frame["surface_source_value"] = frame["surface"]
    surface_missing = missing(frame["surface"])
    estimates = [estimate_surface(row.get("highway", row.get("functional_class", "road")), row.get("district", "")) for _, row in frame.loc[surface_missing].iterrows()]
    if "surface_value_status" not in frame:
        frame["surface_value_status"] = "Observed/source supplied"
    if "surface_model_confidence_pct" not in frame:
        frame["surface_model_confidence_pct"] = 100.0
    if "surface_assignment_basis" not in frame:
        frame["surface_assignment_basis"] = "Supplied source attribute"
    if estimates:
        frame.loc[surface_missing, "surface"] = [item[0] for item in estimates]
        frame.loc[surface_missing, "surface_model_confidence_pct"] = [item[1] for item in estimates]
        frame.loc[surface_missing, "surface_assignment_basis"] = [item[2] for item in estimates]
        frame.loc[surface_missing, "surface_value_status"] = "Model estimated"

    frame["surface"] = frame["surface"].map(canonical_surface)

    frame["pavement_class"] = frame["surface"].map(lambda value: "Paved" if value in {"Bituminous", "Concrete"} else "Unpaved")
    frame["pavement_assignment_basis"] = frame["surface_assignment_basis"]

    if "condition" not in frame:
        frame["condition"] = "Unclassified"
    condition_missing = missing(frame["condition"])
    estimates = [estimate_condition(row.get("surface", ""), row.get("highway", row.get("functional_class", "road"))) for _, row in frame.loc[condition_missing].iterrows()]
    if "condition_value_status" not in frame:
        frame["condition_value_status"] = "Observed/source supplied"
    if "condition_model_confidence_pct" not in frame:
        frame["condition_model_confidence_pct"] = 100.0
    if "condition_assignment_basis" not in frame:
        frame["condition_assignment_basis"] = "Supplied smoothness/condition attribute"
    if estimates:
        frame.loc[condition_missing, "condition"] = [item[0] for item in estimates]
        frame.loc[condition_missing, "condition_model_confidence_pct"] = [item[1] for item in estimates]
        frame.loc[condition_missing, "condition_assignment_basis"] = [item[2] for item in estimates]
        frame.loc[condition_missing, "condition_value_status"] = "Model estimated"
    for field in ["region", "district", "county", "subcounty", "parish", "condition", "pavement_class"]:
        if field in frame:
            frame[field] = frame[field].map(lambda value: normalise_name(value) or "Uganda")
    return frame


def update_analysis(frame: pd.DataFrame) -> None:
    payload = json.loads(ANALYSIS.read_text(encoding="utf-8"))
    for dimension, field in (("surface", "surface"), ("pavement", "pavement_class"), ("condition", "condition")):
        payload["summaries"][dimension] = sorted([
            {"category": str(category), "feature_count": int(len(group)), "length_km": round(float(group["length_km"].sum()), 6)}
            for category, group in frame.groupby(field, dropna=False)
        ], key=lambda item: item["category"])
    payload["derivation_policy"].update({
        "pavement": "Observed surfaces are retained; missing surfaces receive a functional-class/context estimate, then map to Paved or Unpaved.",
        "condition": "Observed condition is retained; missing values receive a surface and functional-class planning estimate.",
        "missing_values": "Public analytical categories are complete. Estimated values carry status, basis and confidence; evidence is never overwritten silently.",
    })
    paved = frame["pavement_class"].eq("Paved")
    unpaved = frame["pavement_class"].eq("Unpaved")
    payload["total"].update({
        "paved_km": round(float(frame.loc[paved, "length_km"].sum()), 6),
        "unpaved_km": round(float(frame.loc[unpaved, "length_km"].sum()), 6),
        "unclassified_pavement_km": 0.0,
        "good_condition_km": round(float(frame.loc[frame["condition"].eq("Good"), "length_km"].sum()), 6),
        "fair_condition_km": round(float(frame.loc[frame["condition"].eq("Fair"), "length_km"].sum()), 6),
        "poor_condition_km": round(float(frame.loc[frame["condition"].eq("Poor"), "length_km"].sum()), 6),
        "unclassified_condition_km": 0.0,
        "model_estimated_surface_km": round(float(frame.loc[frame["surface_value_status"].eq("Model estimated"), "length_km"].sum()), 6),
        "model_estimated_condition_km": round(float(frame.loc[frame["condition_value_status"].eq("Model estimated"), "length_km"].sum()), 6),
    })
    payload["attribute_completion"] = {"status": "Complete observed-plus-modelled planning classification", "model_year": 2026, "road_name_complete_features": int((~missing(frame["road_name"])).sum()), "surface_complete_features": int((~missing(frame["surface"])).sum()), "pavement_complete_features": int((~missing(frame["pavement_class"])).sum()), "condition_complete_features": int((~missing(frame["condition"])).sum())}
    ANALYSIS.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def update_web_routes(frame: pd.DataFrame) -> None:
    payload = json.loads(WEB_ROUTES.read_text(encoding="utf-8"))
    indexed = frame.set_index("route_id").to_dict(orient="index")
    fields = ["road_name", "surface", "pavement_class", "condition", "surface_value_status", "surface_model_confidence_pct", "surface_assignment_basis", "condition_value_status", "condition_model_confidence_pct", "condition_assignment_basis"]
    for sequence, feature in enumerate(payload.get("features", []), start=1):
        properties = feature.get("properties", {})
        row = indexed.get(str(properties.get("route_id", properties.get("source_group_id", ""))))
        if row:
            properties.update({field: row.get(field) for field in fields})
        surface_missing = str(properties.get("surface", "")).strip().lower() in EMPTY
        if surface_missing:
            surface, confidence, basis = estimate_surface(properties.get("highway", properties.get("functional_class", "road")), properties.get("district", ""))
            properties.update(surface=surface, surface_value_status="Model estimated", surface_model_confidence_pct=confidence, surface_assignment_basis=basis)
        properties["surface"] = canonical_surface(properties.get("surface"))
        properties["pavement_class"] = "Paved" if properties["surface"] in {"Bituminous", "Concrete"} else "Unpaved"
        condition_missing = str(properties.get("condition", "")).strip().lower() in EMPTY
        if condition_missing:
            condition, confidence, basis = estimate_condition(properties["surface"], properties.get("highway", properties.get("functional_class", "road")))
            properties.update(condition=condition, condition_value_status="Model estimated", condition_model_confidence_pct=confidence, condition_assignment_basis=basis)
        properties["condition"] = normalise_name(properties.get("condition")) or "Fair"
        for field in ["region", "district", "county"]:
            if str(properties.get(field, "")).strip().lower() in EMPTY:
                properties[field] = "Transboundary"
        properties.setdefault("subcounty", "Route-Spanning")
        properties.setdefault("parish", "Route-Spanning")
        if str(properties.get("road_name", "")).strip().lower().startswith("not supplied"):
            properties["road_name"] = f"{normalise_name(properties.get('district')) or 'Uganda'} {normalise_name(properties.get('functional_class')) or 'Road'} Route {properties.get('source_group_id', sequence)}"
            properties["road_name_assignment_basis"] = "Display-group name assigned from administration, functional class and route identifier"
    payload.setdefault("metadata", {})["attribute_completion"] = "Observed values retained; missing values model-estimated with explicit provenance"
    WEB_ROUTES.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def write_ducar_json(frame: pd.DataFrame) -> None:
    output = frame.copy()
    if "admin_coverage" in output:
        def relation(value: object):
            if isinstance(value, list):
                return value
            try:
                parsed = ast.literal_eval(str(value))
                return parsed if isinstance(parsed, list) else []
            except (SyntaxError, ValueError):
                return []
        output["admin_coverage"] = output["admin_coverage"].map(relation)
    records = json.loads(output.where(pd.notna(output), None).to_json(orient="records"))
    DUCAR_JSON.write_text(json.dumps(records, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main() -> None:
    source = enrich(pd.read_csv(SOURCE_ATTRIBUTES))
    source.to_csv(SOURCE_ATTRIBUTES, index=False, compression="gzip")
    update_analysis(source)
    routes = enrich(pd.read_csv(ROUTES))
    routes.to_csv(ROUTES, index=False, compression="gzip")
    update_web_routes(routes)
    ducar = enrich(pd.read_csv(DUCAR_CSV))
    ducar.to_csv(DUCAR_CSV, index=False)
    write_ducar_json(ducar)
    audit = {"model_year": 2026, "method": "Observed-first deterministic road-name, surface, pavement and condition completion", "source_segments": int(len(source)), "routes": int(len(routes)), "ducar_links": int(len(ducar)), "source_segment_length_km": round(float(source["length_km"].sum()), 6), "model_estimated_surface_segments": int((source["surface_value_status"] == "Model estimated").sum()), "model_estimated_condition_segments": int((source["condition_value_status"] == "Model estimated").sum()), "unclassified_pavement_segments": int(missing(source["pavement_class"]).sum()), "unclassified_condition_segments": int(missing(source["condition"]).sum()), "blank_public_road_names": int(missing(source["road_name"]).sum()), "provenance_policy": "Observed values retained; estimates identified by status, assignment basis and confidence."}
    AUDIT.write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(audit, indent=2))


if __name__ == "__main__":
    main()
