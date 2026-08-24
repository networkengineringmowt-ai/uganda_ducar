from __future__ import annotations

"""Add the latest reproducibly available all-country roadway inventory.

The World Bank's IRF-derived total-road series is no longer distributable, so
this build uses the 2024-11-21 public-domain CIA World Factbook snapshot. The
Factbook values have heterogeneous reference years and are never presented as
2026 measurements. Uganda is replaced by the audited local HOTOSM inventory.
"""

import argparse
import difflib
import html
import json
import re
import subprocess
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MATRIX = ROOT / "data" / "global_country_matrix.json"
AUDIT = ROOT / "data" / "global_country_road_data_audit_2026.json"
COMMIT = "2dc8ed5b"
SOURCE_URL = "https://github.com/factbook/factbook.json/tree/2dc8ed5b"

# Official-country releases fill the small number of roadway gaps in the
# Factbook snapshot. Values are intentionally not harmonised across years.
OFFICIAL_OVERRIDES = {
    "Panama": {
        "road_network_km": 17_880.93,
        "paved_road_km": 8_497.10,
        "unpaved_road_km": 9_383.83,
        "road_data_year": 2024,
        "road_data_source_text": "411.05 concrete + 416.41 asphalt-over-concrete + 4,674.58 asphalt + 2,995.06 surface treatment + 3,995.29 gravel + 5,388.54 earth (km)",
        "road_data_source_title": "Panama INEC Transport 2024, Road Network by Surface",
        "road_data_source_url": "https://www.inec.gob.pa/publicaciones/Default3.aspx?ID_CATEGORIA=4&ID_PUBLICACION=1365&ID_SUBCATEGORIA=22",
    },
    "Monaco": {
        "road_network_km": 57.0,
        "paved_road_km": 57.0,
        "unpaved_road_km": 0.0,
        "road_data_year": 2021,
        "road_data_source_text": "57 km of roads, including 7 km in tunnels",
        "road_data_source_title": "Monaco en Chiffres 2022, Road Transport",
        "road_data_source_url": "https://en.gouv.mc/content/download/514984/5896833/file/MAGAZINE_160x240_IMSEE_Monaco%20en%20Chiffres%202022_30-05-2022_interactif_complet.pdf",
    },
    "Saint Vincent and the Grenadines": {
        "road_network_km": 829.0,
        "paved_road_km": None,
        "unpaved_road_km": None,
        "road_data_year": 2013,
        "road_data_source_text": "829 km Transport Infrastructure Manual Inventory Database",
        "road_data_source_title": "Government of Saint Vincent and the Grenadines PDNA Road Network",
        "road_data_source_url": "https://finance.gov.vc/finance/images/PDF/Full_Report_SVG_PDNA_Volcanic_Eruption.pdf",
    },
    "Trinidad and Tobago": {
        "road_network_km": 9_592.0,
        "paved_road_km": None,
        "unpaved_road_km": None,
        "road_data_year": None,
        "road_data_source_text": "9,592 km total; Highways Division manages 2,050 km (21%)",
        "road_data_source_title": "Trinidad and Tobago Ministry of Works and Transport, Highways Division",
        "road_data_source_url": "https://mowt.gov.tt/Divisions/Highways-Division/What-We-Do",
    },
}

CODE_NAMES = {
    "ct": "Central African Republic",
    "cf": "Congo",
    "cg": "Democratic Republic of the Congo",
    "iv": "Cote d'Ivoire",
    "kn": "Democratic People's Republic of Korea",
    "ks": "Republic of Korea",
    "la": "Lao People's Democratic Republic",
    "we": "State of Palestine",
    "tu": "Turkiye",
    "ae": "United Arab Emirates",
    "vt": "Holy See",
    "md": "Republic of Moldova",
    "dr": "Dominican Republic",
    "fm": "Micronesia",
}


ALIASES = {
    "bahamas the": "bahamas",
    "the bahamas": "bahamas",
    "bolivia plurinational state of": "bolivia",
    "brunei darussalam": "brunei",
    "cabo verde": "cape verde",
    "congo": "congo republic of the",
    "republic of the congo": "congo republic of the",
    "congo democratic republic of the": "congo democratic republic of the",
    "democratic republic of the congo": "congo democratic republic of the",
    "cote d ivoire": "cote d ivoire",
    "czechia": "czechia",
    "eswatini": "eswatini",
    "gambia": "gambia the",
    "the gambia": "gambia the",
    "iran islamic republic of": "iran",
    "korea democratic people s republic of": "korea north",
    "north korea": "korea north",
    "korea republic of": "korea south",
    "south korea": "korea south",
    "lao people s democratic republic": "laos",
    "burma": "myanmar",
    "micronesia federated states of": "micronesia federated states of",
    "micronesia": "micronesia federated states of",
    "moldova republic of": "moldova",
    "russian federation": "russia",
    "saint kitts and nevis": "saint kitts and nevis",
    "saint lucia": "saint lucia",
    "saint vincent and the grenadines": "saint vincent and the grenadines",
    "syrian arab republic": "syria",
    "tanzania united republic of": "tanzania",
    "united republic of tanzania": "tanzania",
    "timor leste": "timor leste",
    "turkiye": "turkey turkiye",
    "turkey": "turkey turkiye",
    "united kingdom": "united kingdom",
    "united states of america": "united states",
    "vatican city holy see": "holy see",
    "venezuela bolivarian republic of": "venezuela",
    "viet nam": "vietnam",
}


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFKD", html.unescape(str(value or "").replace("&nbsp;", " ")))
    text = "".join(character for character in text if not unicodedata.combining(character))
    text = re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()
    return ALIASES.get(text, text)


def show(repo: Path, path: str) -> dict:
    result = subprocess.run(
        ["git", "show", f"{COMMIT}:{path}"],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return json.loads(result.stdout)


def road_number(value: object) -> float | None:
    text = re.sub(r"<[^>]+>", " ", str(value or ""))
    match = re.search(r"([0-9][0-9,]*(?:\.[0-9]+)?)\s*(million|billion)?\s*km\b", text, re.I)
    if not match:
        return None
    number = float(match.group(1).replace(",", ""))
    multiplier = {"million": 1_000_000, "billion": 1_000_000_000}.get((match.group(2) or "").lower(), 1)
    return number * multiplier


def text_at(value: object) -> str:
    return str(value.get("text", "")) if isinstance(value, dict) else str(value or "")


def year_from(*values: str) -> int | None:
    years = [int(value) for text in values for value in re.findall(r"\b(?:19|20)\d{2}\b", text)]
    return max(years) if years else None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--factbook-repo", type=Path, required=True)
    args = parser.parse_args()
    repo = args.factbook_repo.resolve()
    paths = subprocess.run(
        ["git", "ls-tree", "-r", "--name-only", COMMIT],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    ).stdout.splitlines()
    country_paths = [path for path in paths if re.match(r"^[^/]+/[a-z]{2}\.json$", path)]

    factbook: dict[str, dict[str, object]] = {}
    for index, path in enumerate(country_paths, start=1):
        document = show(repo, path)
        country = CODE_NAMES.get(Path(path).stem) or text_at(document.get("Government", {}).get("Country name", {}).get("conventional short form", {}))
        roadways = document.get("Transportation", {}).get("Roadways", {})
        total_text = text_at(roadways.get("total", roadways))
        paved_text = text_at(roadways.get("paved", {}))
        unpaved_text = text_at(roadways.get("unpaved", {}))
        total = road_number(total_text)
        paved = road_number(paved_text)
        unpaved = road_number(unpaved_text)
        if not country:
            continue
        factbook[normalize(country)] = {
            "source_country_name": country,
            "road_network_km": total,
            "paved_road_km": paved,
            "unpaved_road_km": unpaved,
            "road_data_year": year_from(total_text, paved_text, unpaved_text),
            "road_data_source_text": " | ".join(value for value in [total_text, paved_text, unpaved_text] if value),
        }
        if index % 50 == 0:
            print(f"Parsed {index:,}/{len(country_paths):,} Factbook profiles", flush=True)

    payload = json.loads(MATRIX.read_text(encoding="utf-8"))
    matched = 0
    with_total = 0
    with_surface = 0
    unmatched: list[str] = []
    for row in payload["rows"]:
        source = factbook.get(normalize(row["country"]))
        if source:
            matched += 1
            row.update(source)
            total = source["road_network_km"]
            paved = source["paved_road_km"]
            unpaved = source["unpaved_road_km"]
            if total is not None:
                with_total += 1
            if paved is not None or unpaved is not None:
                with_surface += 1
            if paved is not None and total:
                row["paved_share_pct"] = round(float(paved) / float(total) * 100.0, 3)
            row["road_data_status"] = "CIA World Factbook value available" if total is not None else "No roadway total in 2024 Factbook snapshot"
            row["source_status"] = row["road_data_status"]
            row["road_data_source_title"] = "CIA World Factbook 2024-11-21 snapshot"
            row["road_data_source_url"] = SOURCE_URL
        else:
            unmatched.append(row["country"])
            row.update(
                {
                    "road_network_km": None,
                    "paved_road_km": None,
                    "unpaved_road_km": None,
                    "road_data_year": None,
                    "road_data_status": "Country-name match not found in Factbook snapshot",
                    "road_data_source_title": "CIA World Factbook 2024-11-21 snapshot",
                    "road_data_source_url": SOURCE_URL,
                }
            )

    for row in payload["rows"]:
        override = OFFICIAL_OVERRIDES.get(row["country"])
        if not override:
            continue
        row.update(override)
        row["paved_share_pct"] = round(override["paved_road_km"] / override["road_network_km"] * 100.0, 3) if override["paved_road_km"] is not None else "Not supplied"
        row["road_data_status"] = "Official country roadway inventory available"
        row["source_status"] = row["road_data_status"]

    holy_see = next(row for row in payload["rows"] if row["country"] == "Holy See")
    holy_see.update(
        {
            "covered_road_count": 30,
            "road_data_year": 2024,
            "road_data_status": "Official covered-road count available; kilometre total not published",
            "source_status": "Official covered-road count available",
            "road_data_source_text": "30 covered roads; no official kilometre total",
            "road_data_source_title": "Vatican City State Statistical Data 2024",
            "road_data_source_url": "https://www.vaticanstate.va/en/state-and-government/general-informations/population.html",
        }
    )

    uganda = next(row for row in payload["rows"] if row["country"] == "Uganda")
    uganda.update(
        {
            "road_network_km": 248_616.148981,
            "paved_road_km": 3_992.877243,
            "unpaved_road_km": 244_623.271738,
            "paved_share_pct": round(3_992.877243 / 248_616.148981 * 100.0, 3),
            "road_data_year": 2026,
            "road_data_status": "Geometry-derived complete vehicular HOTOSM inventory",
            "road_data_source_title": "DUCAR HOTOSM Uganda vehicular geometry audit 2026",
            "road_data_source_url": "./data/hotosm_vehicular_audit.json",
            "road_data_source_text": "248,616.148981 km geometry-derived total; Bituminous and Concrete paved; Gravel and Earth unpaved",
            "source_status": "Audited Uganda geometry inventory available",
        }
    )
    arithmetic_mismatches: list[dict[str, object]] = []
    for row in payload["rows"]:
        total, paved, unpaved = (row.get(field) for field in ("road_network_km", "paved_road_km", "unpaved_road_km"))
        if total is None:
            row["road_surface_reconciliation_status"] = "Road total not supplied"
        elif paved is None or unpaved is None:
            row["road_surface_reconciliation_status"] = "Road total supplied; complete surface split not supplied"
        else:
            variance = float(paved) + float(unpaved) - float(total)
            tolerance = max(1.0, float(total) * 0.01)
            if abs(variance) <= tolerance:
                row["road_surface_reconciliation_status"] = "Source total and surface split reconcile within 1%"
            else:
                row["road_surface_reconciliation_status"] = f"Source-published surface split differs from total by {variance:,.3f} km"
                arithmetic_mismatches.append({"country": row["country"], "variance_km": round(variance, 3)})
    payload.update(
        {
            "road_data_source": "CIA World Factbook public-domain 2024-11-21 snapshot; Uganda replaced by audited 2026 HOTOSM vehicular geometry",
            "road_data_source_url": SOURCE_URL,
            "road_data_limitation": "Country values have heterogeneous reference years and definitions. They support comparison and mapping but are not a common-year engineering inventory.",
        }
    )
    MATRIX.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    audit = {
        "audit_year": 2026,
        "configured_countries": len(payload["rows"]),
        "factbook_profiles": len(country_paths),
        "country_name_matches": matched,
        "countries_with_road_total": sum(row.get("road_network_km") is not None for row in payload["rows"]),
        "countries_with_paved_or_unpaved_detail": sum(row.get("paved_road_km") is not None or row.get("unpaved_road_km") is not None for row in payload["rows"]),
        "official_country_gap_overrides": sorted(OFFICIAL_OVERRIDES),
        "unmatched_configured_countries": unmatched,
        "closest_factbook_name_matches": {
            country: difflib.get_close_matches(normalize(country), list(factbook), n=3, cutoff=0.45)
            for country in unmatched
        },
        "source_commit": COMMIT,
        "source_url": SOURCE_URL,
        "licensing_note": "The CIA World Factbook was public domain. The later World Bank/IRF series is not used because its metadata prohibits reproduction and the data were removed from external publication.",
        "uganda_override_km": 248_616.148981,
        "source_surface_arithmetic_mismatches": arithmetic_mismatches,
    }
    AUDIT.write_text(json.dumps(audit, indent=2), encoding="utf-8")
    print(json.dumps(audit, indent=2), flush=True)


if __name__ == "__main__":
    main()
