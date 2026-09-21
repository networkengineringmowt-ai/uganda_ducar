from __future__ import annotations

"""Assign unique, evidence-backed origin-destination names to DUCAR links.

The public link name is a link-level label, not a claim that every short GIS
section is a separately gazetted road. Established route names are retained in
``established_route_name`` while the link label uses its actual endpoint
localities, intermediate settlements and administrative context. LINK_ID stays
in its own field and is never appended to the visible road name.
"""

import ast
import json
import math
import re
from pathlib import Path

import geopandas as gpd
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DUCAR = ROOT.parent
CSV = DATA / "ducar_link_register.csv"
JSON = DATA / "ducar_link_register.json"
AUDIT = DATA / "ducar_road_name_enrichment_2026.json"
DISTRICT_ROADS = DUCAR / "district roads" / "dcroads2025.shp"
VILLAGES = DUCAR / "Administrative units - Uganda" / "ug_villages.shp"
OSM_PLACES = DUCAR / "gis_osm_places_free_1.shp"
KCCA_ROADS = DUCAR / "shapefiles" / "Kampala_Roads.shp"
GEONAMES = DATA / "external" / "geonames_uganda_2026" / "UG.txt"

EMPTY = {"", "nan", "none", "null", "not supplied", "unclassified", "unknown", "0", "0 - 0"}
GENERIC_ROAD_NAMES = {"road", "district road", "community access road", "urban road", "unnamed road"}
ACRONYMS = {
    "drc": "DRC", "kcca": "KCCA", "hq": "HQ", "ps": "P/S", "p/s": "P/S",
    "tc": "TC", "s/c": "S/C", "sc": "S/C", "ueb": "UEB",
    "i": "I", "ii": "II", "iii": "III", "iv": "IV", "v": "V",
    "vi": "VI", "vii": "VII", "viii": "VIII", "ix": "IX", "x": "X",
}
GEONAMES_COLUMNS = [
    "geonameid", "name", "asciiname", "alternatenames", "latitude", "longitude",
    "feature_class", "feature_code", "country_code", "cc2", "admin1_code", "admin2_code",
    "admin3_code", "admin4_code", "population", "elevation", "dem", "timezone", "modification_date",
]


def plain(value: object) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return ""
    text = str(value).strip()
    return "" if text.casefold() in EMPTY else text


def proper(value: object) -> str:
    text = plain(value)
    if not text:
        return ""
    text = text.replace("�", " - ").replace("–", " - ").replace("—", " - ")
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)
    text = re.sub(r"[_/\\|]+", " - ", text)
    text = re.sub(r"\s*-+\s*", " - ", text)
    text = re.sub(r"\bboarder\b", "border", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip(" .-_")
    output = []
    for part in text.split(" - "):
        words = []
        for word in part.split():
            key = word.casefold().strip(".,()")
            if key in ACRONYMS:
                replacement = ACRONYMS[key]
                prefix = "(" if word.startswith("(") else ""
                suffix = ")" if word.endswith(")") else ""
                words.append(prefix + replacement + suffix)
            else:
                words.append(word[:1].upper() + word[1:].lower())
        candidate = " ".join(words).strip()
        if candidate and candidate.casefold() not in {item.casefold() for item in output}:
            output.append(candidate)
    return " - ".join(output)


def valid_place(value: object) -> bool:
    raw = plain(value)
    if re.fullmatch(r"[A-Z]{1,8}(?:/[A-Z]{1,8})+", raw):
        return False
    text = proper(value)
    return bool(text and len(text) > 1 and not re.fullmatch(r"[A-Z](/?[A-Z])?", text))


def canonical_code(value: object) -> str:
    return re.sub(r"\.0$", "", plain(value))


def make_points(frame: pd.DataFrame, prefix: str) -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(
        frame[["link_id"]].copy(),
        geometry=gpd.points_from_xy(
            pd.to_numeric(frame[f"{prefix}_x_coordinate_dd"], errors="coerce"),
            pd.to_numeric(frame[f"{prefix}_y_coordinate_dd"], errors="coerce"),
        ),
        crs=4326,
    )


def join_villages(points: gpd.GeoDataFrame) -> pd.DataFrame:
    villages = gpd.read_file(
        VILLAGES, columns=["VILLAGE", "PARISH", "SUBCOUNTY", "DISTRICT"], engine="pyogrio"
    ).to_crs(4326)
    joined = gpd.sjoin(points, villages, how="left", predicate="within")
    joined = joined.loc[~joined.index.duplicated(keep="first")]
    return joined[["VILLAGE", "PARISH", "SUBCOUNTY", "DISTRICT"]].reindex(points.index)


def place_catalogue() -> gpd.GeoDataFrame:
    osm = gpd.read_file(OSM_PLACES, columns=["osm_id", "fclass", "name"], engine="pyogrio").to_crs(4326)
    osm = osm[osm["name"].map(valid_place)].copy()
    osm["place_name"] = osm["name"].map(proper)
    osm["place_source"] = "OpenStreetMap/HOTOSM populated place"
    osm["place_reference_id"] = "OSM:" + osm["osm_id"].astype(str)
    osm["place_rank"] = osm["fclass"].map({"city": 5, "town": 4, "village": 3, "hamlet": 2, "locality": 1}).fillna(1)

    geonames = pd.read_csv(GEONAMES, sep="\t", names=GEONAMES_COLUMNS, dtype=str, low_memory=False)
    geonames = geonames[geonames["feature_class"].eq("P") & geonames["name"].map(valid_place)].copy()
    geonames["longitude"] = pd.to_numeric(geonames["longitude"], errors="coerce")
    geonames["latitude"] = pd.to_numeric(geonames["latitude"], errors="coerce")
    geonames = geonames.dropna(subset=["longitude", "latitude"])
    geo = gpd.GeoDataFrame(
        geonames,
        geometry=gpd.points_from_xy(geonames["longitude"], geonames["latitude"]),
        crs=4326,
    )
    geo["place_name"] = geo["name"].map(proper)
    geo["place_source"] = "GeoNames Uganda gazetteer (CC BY 4.0)"
    geo["place_reference_id"] = "GEONAMES:" + geo["geonameid"].astype(str)
    geo["place_rank"] = pd.to_numeric(geo["population"], errors="coerce").fillna(0).map(lambda value: 4 if value >= 20000 else 3 if value >= 5000 else 2)

    fields = ["place_name", "place_source", "place_reference_id", "place_rank", "geometry"]
    return gpd.GeoDataFrame(pd.concat([osm[fields], geo[fields]], ignore_index=True), crs=4326)


def nearest_places(points: gpd.GeoDataFrame, catalogue: gpd.GeoDataFrame) -> pd.DataFrame:
    metric_points = points.to_crs(32636)
    metric_catalogue = catalogue.to_crs(32636)
    joined = gpd.sjoin_nearest(metric_points, metric_catalogue, how="left", distance_col="place_distance_m")
    # At equal distance prefer the higher-rank locality, then a stable identifier.
    joined = joined.sort_values(["link_id", "place_distance_m", "place_rank", "place_reference_id"], ascending=[True, True, False, True])
    joined = joined.loc[~joined.index.duplicated(keep="first")]
    return joined[["place_name", "place_source", "place_reference_id", "place_distance_m"]].reindex(points.index)


def authoritative_routes(frame: pd.DataFrame) -> pd.DataFrame:
    roads = gpd.read_file(
        DISTRICT_ROADS, columns=["RdCode", "Rdname", "VilStart", "VillEnd", "DistName"], engine="pyogrio"
    ).drop(columns="geometry")
    roads["source_code_key"] = roads["RdCode"].map(canonical_code)
    for field in ["Rdname", "VilStart", "VillEnd", "DistName"]:
        roads[field] = roads[field].map(proper)
    roads["specific"] = roads["Rdname"].map(lambda value: bool(value and value.casefold() not in GENERIC_ROAD_NAMES))
    roads = roads.sort_values(["source_code_key", "specific", "Rdname"], ascending=[True, False, True])
    roads = roads.drop_duplicates("source_code_key", keep="first")
    output = frame[["source_code"]].copy()
    output["source_code_key"] = output["source_code"].map(canonical_code)
    return output.merge(
        roads[["source_code_key", "Rdname", "VilStart", "VillEnd", "DistName"]],
        on="source_code_key", how="left", validate="many_to_one",
    )


def kcca_reference_names(frame: pd.DataFrame) -> pd.DataFrame:
    midpoints = gpd.GeoDataFrame(
        frame[["link_id"]].copy(),
        geometry=gpd.points_from_xy(
            (pd.to_numeric(frame["start_x_coordinate_dd"], errors="coerce") + pd.to_numeric(frame["end_x_coordinate_dd"], errors="coerce")) / 2,
            (pd.to_numeric(frame["start_y_coordinate_dd"], errors="coerce") + pd.to_numeric(frame["end_y_coordinate_dd"], errors="coerce")) / 2,
        ),
        crs=4326,
    ).to_crs(32636)
    roads = gpd.read_file(KCCA_ROADS, columns=["Rd_name"], engine="pyogrio").to_crs(32636)
    roads["kcca_route_name"] = roads["Rd_name"].map(proper)
    roads = roads[roads["kcca_route_name"].map(lambda value: bool(value and value.casefold() not in GENERIC_ROAD_NAMES))]
    joined = gpd.sjoin_nearest(midpoints, roads[["kcca_route_name", "geometry"]], how="left", max_distance=12, distance_col="kcca_route_distance_m")
    joined = joined.sort_values(["link_id", "kcca_route_distance_m", "kcca_route_name"])
    joined = joined.loc[~joined.index.duplicated(keep="first")]
    return joined[["kcca_route_name", "kcca_route_distance_m"]].reindex(frame.index)


def intermediate_places(frame: pd.DataFrame) -> pd.Series:
    """Return ordered official settlements crossed between each link endpoint."""
    roads = gpd.read_file(DISTRICT_ROADS, columns=["RdCode"], engine="pyogrio").to_crs(32636)
    roads["source_code_key"] = roads["RdCode"].map(canonical_code)
    roads = roads.drop_duplicates("source_code_key", keep="first").set_index("source_code_key")
    villages = gpd.read_file(
        VILLAGES, columns=["VILLAGE", "PARISH", "SUBCOUNTY"], engine="pyogrio"
    ).to_crs(32636)
    spatial_index = villages.sindex
    output = []
    for row in frame.itertuples(index=False):
        key = canonical_code(row.source_code)
        if key not in roads.index:
            output.append("")
            continue
        geometry = roads.at[key, "geometry"]
        if isinstance(geometry, pd.Series):
            geometry = geometry.iloc[0]
        hits = list(spatial_index.query(geometry, predicate="intersects"))
        ordered = []
        for hit in hits:
            polygon = villages.iloc[hit]
            name = proper(polygon["VILLAGE"]) if valid_place(polygon["VILLAGE"]) else proper(polygon["PARISH"])
            if not name:
                name = proper(polygon["SUBCOUNTY"])
            if name:
                ordered.append((geometry.project(polygon.geometry.representative_point()), name))
        names = []
        for _, name in sorted(ordered):
            if name.casefold() not in {item.casefold() for item in names}:
                names.append(name)
        output.append(" | ".join(names))
    return pd.Series(output, index=frame.index, dtype="string")


def number_words(value: int) -> str:
    ones = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
    if value < 20:
        return ones[value]
    if value < 100:
        return tens[value // 10] + ("-" + ones[value % 10] if value % 10 else "")
    if value < 1000:
        return ones[value // 100] + " Hundred" + (" " + number_words(value % 100) if value % 100 else "")
    return f"{value:,}"


def unique_visible_names(frame: pd.DataFrame, labels: list[str]) -> list[str]:
    """Disambiguate genuine same-corridor links without exposing an ID code."""
    result = pd.Series(labels, index=frame.index, dtype="string")
    original_groups = result.groupby(result).groups
    strategies = [
        ("established_route_name",), ("parish",), ("subcounty",), ("county",),
        ("established_route_name", "parish"),
        ("established_route_name", "subcounty"),
        ("parish", "subcounty"),
    ]
    for _, indices in original_groups.items():
        if len(indices) == 1:
            continue
        base = result.at[indices[0]]
        resolved = False
        for fields in strategies:
            candidates = []
            for index in indices:
                contexts = []
                for field in fields:
                    context = proper(frame.at[index, field])
                    if context and context.casefold() not in base.casefold() and context.casefold() not in {item.casefold() for item in contexts}:
                        contexts.append(context)
                candidates.append(f"{base} - {' - '.join(contexts)} Section" if contexts else base)
            if len(set(candidates)) == len(indices):
                for index, candidate in zip(indices, candidates):
                    result.at[index] = candidate
                resolved = True
                break
        if resolved:
            continue
        preferred = []
        for index in indices:
            route = proper(frame.at[index, "established_route_name"])
            preferred.append(f"{base} - {route} Section" if route and route.casefold() not in base.casefold() else base)
        ordered = sorted(indices, key=lambda index: (
            -float(frame.at[index, "start_y_coordinate_dd"]),
            float(frame.at[index, "start_x_coordinate_dd"]),
            -float(frame.at[index, "geometry_length_km"]),
            plain(frame.at[index, "link_id"]),
        ))
        for position, index in enumerate(ordered, start=1):
            result.at[index] = f"{preferred[list(indices).index(index)]} - Local Branch {number_words(position)}"
    return result.tolist()


def choose_endpoint(village: object, parish: object, nearest: pd.Series) -> tuple[str, str, str, float]:
    if valid_place(village):
        return proper(village), "Official Uganda village polygon", "UBOS/administrative village polygon", 0.0
    if valid_place(parish):
        return proper(parish), "Official Uganda parish polygon", "UBOS/administrative parish polygon", 0.0
    if valid_place(nearest.get("place_name")):
        return (
            proper(nearest["place_name"]), plain(nearest["place_source"]),
            plain(nearest["place_reference_id"]), round(float(nearest["place_distance_m"]) / 1000.0, 3),
        )
    return "Uganda", "Administrative fallback", "UG", 0.0


def name_links(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    start_points, end_points = make_points(frame, "start"), make_points(frame, "end")
    start_admin, end_admin = join_villages(start_points), join_villages(end_points)
    catalogue = place_catalogue()
    start_nearest, end_nearest = nearest_places(start_points, catalogue), nearest_places(end_points, catalogue)
    routes = authoritative_routes(frame)
    kcca_routes = kcca_reference_names(frame)

    starts, ends = [], []
    for index in frame.index:
        starts.append(choose_endpoint(start_admin.at[index, "VILLAGE"], start_admin.at[index, "PARISH"], start_nearest.loc[index]))
        ends.append(choose_endpoint(end_admin.at[index, "VILLAGE"], end_admin.at[index, "PARISH"], end_nearest.loc[index]))

    if "road_name_previous" not in frame:
        frame["road_name_previous"] = frame["road_name"]
    frame["start_place_name"] = [item[0] for item in starts]
    frame["start_place_source"] = [item[1] for item in starts]
    frame["start_place_reference_id"] = [item[2] for item in starts]
    frame["start_place_distance_km"] = [item[3] for item in starts]
    frame["end_place_name"] = [item[0] for item in ends]
    frame["end_place_source"] = [item[1] for item in ends]
    frame["end_place_reference_id"] = [item[2] for item in ends]
    frame["end_place_distance_km"] = [item[3] for item in ends]
    frame["intermediate_place_names"] = intermediate_places(frame)
    for index, row in frame.loc[frame["intermediate_place_names"].fillna("").astype(str).str.strip().eq("")].iterrows():
        route_places = []
        for value in [row["start_place_name"], row["end_place_name"]]:
            place = proper(value)
            if place and place.casefold() not in {item.casefold() for item in route_places}:
                route_places.append(place)
        frame.at[index, "intermediate_place_names"] = "|".join(route_places)

    route_names = []
    route_sources = []
    route_distances = []
    for index, row in frame.iterrows():
        supplied = proper(routes.at[index, "Rdname"])
        reference = proper(row.get("nearest_reference_road"))
        if supplied and supplied.casefold() not in GENERIC_ROAD_NAMES:
            route_names.append(supplied)
            route_sources.append("District road register source-code match")
            route_distances.append(0.0)
        elif reference and reference.casefold() not in GENERIC_ROAD_NAMES:
            route_names.append(reference)
            route_sources.append("Nearest aligned named reference road")
            route_distances.append(round(float(row.get("nearest_reference_road_distance_m", 0) or 0), 2))
        elif proper(kcca_routes.at[index, "kcca_route_name"]):
            route_names.append(proper(kcca_routes.at[index, "kcca_route_name"]))
            route_sources.append("Nearest KCCA named road alignment")
            route_distances.append(round(float(kcca_routes.at[index, "kcca_route_distance_m"]), 2))
        else:
            origin = proper(routes.at[index, "VilStart"])
            destination = proper(routes.at[index, "VillEnd"])
            if origin and destination and origin.casefold() != destination.casefold():
                route_names.append(f"{origin} - {destination} Road")
                route_sources.append("District road register origin-destination fields")
                route_distances.append(0.0)
            else:
                route_names.append("")
                route_sources.append("Link endpoint locality model")
                route_distances.append(0.0)
    frame["established_route_name"] = route_names
    frame["established_route_name_source"] = route_sources
    frame["established_route_name_distance_m"] = route_distances

    base_names = []
    for _, row in frame.iterrows():
        origin, destination = proper(row["start_place_name"]), proper(row["end_place_name"])
        parish = proper(row.get("parish"))
        intermediates = [proper(item) for item in plain(row.get("intermediate_place_names")).split("|") if valid_place(item)]
        if len(intermediates) > 3:
            intermediates = [intermediates[0], intermediates[len(intermediates) // 2], intermediates[-1]]
        ordered = []
        for place in [origin, *intermediates, destination]:
            if place and place.casefold() not in {item.casefold() for item in ordered}:
                ordered.append(place)
        if len(ordered) >= 2:
            label = " - ".join(ordered)
            if not label.casefold().endswith(" road"):
                label += " Road"
        elif parish and parish.casefold() != origin.casefold():
            label = f"{origin} - {parish} Access Road"
        elif proper(row.get("established_route_name")):
            label = f"{proper(row['established_route_name'])} - {origin} Section"
        else:
            label = f"{origin} Internal Access Road"
        base_names.append(label)

    names = unique_visible_names(frame, base_names)

    frame["road_name"] = names
    frame["road_name_display"] = names
    frame["road_name_authoritative"] = [route or name for route, name in zip(route_names, names)]
    frame["road_name_assignment_basis"] = "Unique ordered settlement route label; Link ID retained separately"
    frame["road_name_confidence_pct"] = [
        98 if start[1].startswith("Official") and end[1].startswith("Official") else 90
        for start, end in zip(starts, ends)
    ]
    frame["road_name_model_year"] = 2026
    return frame


def write_json(frame: pd.DataFrame) -> None:
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
    JSON.write_text(json.dumps(records, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main() -> None:
    frame = name_links(pd.read_csv(CSV, low_memory=False))
    if frame["link_id"].duplicated().any():
        raise RuntimeError("LINK_ID must be unique before road naming")
    if frame["road_name"].duplicated().any():
        raise RuntimeError("Road-name enrichment failed to create unique link labels")
    if frame["road_name"].isna().any() or frame["road_name"].str.strip().eq("").any():
        raise RuntimeError("Blank public road names remain")
    frame.to_csv(CSV, index=False)
    write_json(frame)
    audit = {
        "model_year": 2026,
        "retrieval_date": "2026-08-26",
        "links": int(len(frame)),
        "unique_link_ids": int(frame["link_id"].nunique()),
        "unique_public_road_names": int(frame["road_name"].nunique()),
        "duplicate_public_road_names": int(frame["road_name"].duplicated().sum()),
        "blank_public_road_names": int(frame["road_name"].isna().sum() + frame["road_name"].str.strip().eq("").sum()),
        "official_start_endpoint_names": int(frame["start_place_source"].str.startswith("Official").sum()),
        "official_end_endpoint_names": int(frame["end_place_source"].str.startswith("Official").sum()),
        "established_route_names": int(frame["established_route_name"].str.strip().ne("").sum()),
        "sources": [
            {"name": "MoWT/district road register", "path": str(DISTRICT_ROADS)},
            {"name": "Uganda village and parish polygons", "path": str(VILLAGES)},
            {"name": "OpenStreetMap/HOTOSM populated places", "path": str(OSM_PLACES), "url": "https://data.humdata.org/dataset/hotosm_uga_populated_places"},
            {"name": "GeoNames Uganda gazetteer", "path": str(GEONAMES), "url": "https://download.geonames.org/export/dump/UG.zip", "license": "CC BY 4.0"},
        ],
        "policy": "Every public road name uses ordered endpoint, intermediate-settlement and administrative context without appending LINK_ID. Established route names and LINK_ID remain separate attributes.",
    }
    AUDIT.write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(audit, indent=2))


if __name__ == "__main__":
    main()
