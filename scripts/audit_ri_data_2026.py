from __future__ import annotations

"""Read-only structural and content audit of the MoWT RI_DATA submissions.

The source archive contains heterogeneous district workbooks.  This audit does
not alter them.  It fingerprints every file, detects tabular headers, profiles
road-inventory fields and flags likely path/content attribution conflicts before
any attributes are joined to the validated national road geometry.
"""

import hashlib
import json
import re
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "RI_DATA"
OUTPUT = ROOT / "data" / "ri_data_source_audit_2026.json"

FIELD_GROUPS = {
    "road_id": ("road id", "link id", "road code", "road no", "road number"),
    "road_name": ("road name", "name of road", "road section", "road link", "route name"),
    "origin": ("from", "origin", "start point", "start"),
    "destination": ("to", "destination", "end point", "end"),
    "length_km": ("length km", "road length", "length", "distance km"),
    "surface": ("surface type", "surface", "pavement type"),
    "condition": ("condition", "road condition", "surface condition"),
    "traffic": ("aadt", "adt", "traffic", "vehicles per day", "vehicle class"),
    "functional_class": ("functional class", "road class", "type of road"),
    "structure": ("structure", "bridge", "culvert"),
    "district": ("district", "district name", "local government"),
    "subcounty": ("sub county", "subcounty", "sub-county"),
    "town_council": ("town council", "municipal", "city division", "urban council"),
    "latitude": ("latitude", "start latitude", "end latitude", "y coordinate"),
    "longitude": ("longitude", "start longitude", "end longitude", "x coordinate"),
}

HEADER_TERMS = {term for terms in FIELD_GROUPS.values() for term in terms}
DISTRICT_SUFFIXES = (
    " district local government", " local government", " district", " dlg", " municipal council",
)


def clean_text(value: Any) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    text = re.sub(r"[\r\n\t]+", " ", str(value)).strip()
    return re.sub(r"\s+", " ", text)


def normalize(value: Any) -> str:
    text = clean_text(value).lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_district(value: Any) -> str:
    text = normalize(value)
    text = re.sub(r"^(district name|name of district city|local government)\s*", "", text).strip()
    for suffix in DISTRICT_SUFFIXES:
        if text.endswith(suffix):
            text = text[: -len(suffix)].strip()
            break
    corrections = {
        "adjuman": "adjumani", "adjumani distrct": "adjumani", "kabong": "kaabong",
        "nakaseske": "nakaseke", "sembabule": "ssembabule", "kasanda": "kassanda",
        "luwero": "luweero", "mityana district local govt": "mityana",
    }
    return corrections.get(text, text)


def plausible_district(value: str) -> bool:
    generic = {
        "", "district", "district name", "district roads", "urban", "road class i ii iii district 1 2 3 4 5 urban",
        "i", "ii", "iii", "local government", "name of district city",
    }
    return value not in generic and 2 <= len(value) <= 48 and len(value.split()) <= 6


def same_admin_name(left: str, right: str) -> bool:
    def base(value: str) -> str:
        return re.sub(r"\b(city|municipal|municipality|council|roads|road|data|2026)\b", " ", value).strip()
    return bool(base(left)) and base(left) == base(right)


def fingerprint(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def header_score(values: list[Any]) -> tuple[int, list[str]]:
    normalized = [normalize(value) for value in values]
    matched: set[str] = set()
    for value in normalized:
        for term in HEADER_TERMS:
            if value == term or (len(term) >= 6 and term in value):
                matched.add(term)
    nonempty = sum(bool(value) for value in normalized)
    return len(matched) * 10 + min(nonempty, 20), normalized


def find_header(path: Path, sheet: str) -> tuple[int | None, list[str]]:
    preview = pd.read_excel(path, sheet_name=sheet, header=None, nrows=30, dtype=object)
    if preview.empty:
        return None, []
    best_index, best_score, best_values = None, -1, []
    for index, row in preview.iterrows():
        score, values = header_score(row.tolist())
        if score > best_score:
            best_index, best_score, best_values = int(index), score, values
    return (best_index, best_values) if best_score >= 22 else (None, best_values)


def classify(path: Path, fields: set[str]) -> str:
    name = normalize(path.name)
    field_text = normalize(" ".join(fields))
    if "structure" in name or "bridge" in name or "culvert" in name:
        return "Structures"
    if "community access" in name or re.search(r"\bcars?\b", name):
        return "Community Access Roads"
    if any(term in name for term in ("town council", "urban road", "municipal", " tcs", " tc ")):
        return "Urban / Town Council / Municipal Roads"
    if "traffic" in name or "condition" in name:
        return "Combined Traffic / Condition Submission"
    if "road" in name or "inventory" in name:
        return "District Road Inventory"
    if "traffic" in field_text or "condition" in field_text:
        return "Combined Traffic / Condition Submission"
    return "Other"


def match_fields(columns: list[str]) -> dict[str, list[str]]:
    found: dict[str, list[str]] = {}
    for group, terms in FIELD_GROUPS.items():
        matches = [column for column in columns if any(term == column or (len(term) >= 6 and term in column) for term in terms)]
        if matches:
            found[group] = matches
    return found


def numeric_summary(series: pd.Series) -> dict[str, Any]:
    values = pd.to_numeric(series, errors="coerce")
    valid = values.dropna()
    if valid.empty:
        return {"numeric_count": 0}
    return {
        "numeric_count": int(valid.size),
        "sum": round(float(valid.sum()), 6),
        "min": round(float(valid.min()), 6),
        "max": round(float(valid.max()), 6),
        "negative_count": int((valid < 0).sum()),
        "zero_count": int((valid == 0).sum()),
    }


def sheet_profile(path: Path, sheet: str) -> dict[str, Any]:
    profile: dict[str, Any] = {"sheet": sheet}
    try:
        header_row, preview_header = find_header(path, sheet)
        profile["header_row_1_based"] = None if header_row is None else header_row + 1
        if header_row is None:
            profile.update({"status": "No tabular road header detected", "preview_best_row": preview_header[:25]})
            return profile
        frame = pd.read_excel(path, sheet_name=sheet, header=header_row, dtype=object)
        frame = frame.dropna(how="all").dropna(axis=1, how="all")
        columns = [normalize(value) or f"unnamed_{index + 1}" for index, value in enumerate(frame.columns)]
        deduped: list[str] = []
        counts: Counter[str] = Counter()
        for column in columns:
            counts[column] += 1
            deduped.append(column if counts[column] == 1 else f"{column}_{counts[column]}")
        frame.columns = deduped
        fields = match_fields(deduped)
        profile.update(
            {
                "status": "Readable table",
                "rows": int(len(frame)),
                "columns": int(len(frame.columns)),
                "normalized_fields": deduped,
                "field_groups": fields,
                "classification": classify(path, set(deduped)),
            }
        )
        emptiness: dict[str, Any] = {}
        for group, matches in fields.items():
            series = frame[matches[0]].map(clean_text)
            nonempty = series.ne("")
            emptiness[group] = {
                "field": matches[0],
                "populated": int(nonempty.sum()),
                "missing": int((~nonempty).sum()),
                "unique_nonblank": int(series[nonempty].nunique()),
            }
            if group == "length_km":
                emptiness[group].update(numeric_summary(frame[matches[0]]))
            if group in {"surface", "condition", "functional_class", "district"}:
                values = Counter(normalize(value) for value in series[nonempty])
                emptiness[group]["values"] = dict(values.most_common(40))
            if group in {"road_id", "road_name"}:
                duplicate = series[nonempty].duplicated(keep=False)
                emptiness[group]["duplicate_rows"] = int(duplicate.sum())
                emptiness[group]["sample"] = series[nonempty].head(8).tolist()
        profile["field_completeness"] = emptiness

        content_districts: set[str] = set()
        if "district" in fields:
            content_districts.update(
                normalize_district(value)
                for value in frame[fields["district"][0]].dropna().head(500)
                if plausible_district(normalize_district(value))
            )
        for row_index in range(min(header_row + 1, 12)):
            try:
                row = pd.read_excel(path, sheet_name=sheet, header=None, skiprows=row_index, nrows=1, dtype=object)
                for value in row.iloc[0].tolist() if not row.empty else []:
                    text = normalize(value)
                    if "district" in text and len(text.split()) <= 7:
                        candidate = normalize_district(text)
                        if plausible_district(candidate):
                            content_districts.add(candidate)
            except Exception:
                pass
        profile["content_district_candidates"] = sorted(value for value in content_districts if value)
    except Exception as error:
        profile.update({"status": "Unreadable", "error": f"{type(error).__name__}: {error}"})
    return profile


def inferred_path_district(path: Path) -> str:
    excluded = {"central", "eastern", "northern", "western", "west nile", "ri data"}
    for part in reversed(path.parts[:-1]):
        candidate = normalize_district(part)
        if candidate and candidate not in excluded and not any(term in candidate for term in ("district roads", "community access", "town council", "wakiso district")):
            return candidate
    return ""


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    files = sorted((path for path in SOURCE.rglob("*") if path.is_file()), key=lambda value: str(value).lower())
    hashes: defaultdict[str, list[str]] = defaultdict(list)
    records: list[dict[str, Any]] = []
    all_fields: Counter[str] = Counter()
    all_groups: Counter[str] = Counter()
    classifications: Counter[str] = Counter()
    readable_tables = 0
    total_rows = 0
    total_length_km = 0.0

    for index, path in enumerate(files, 1):
        relative = str(path.relative_to(SOURCE))
        signature = fingerprint(path)
        hashes[signature].append(relative)
        record: dict[str, Any] = {
            "path": relative,
            "extension": path.suffix.lower(),
            "bytes": path.stat().st_size,
            "sha256": signature,
            "path_district_candidate": inferred_path_district(path),
        }
        if path.suffix.lower() in {".xlsx", ".xls"}:
            try:
                workbook = pd.ExcelFile(path)
                profiles = [sheet_profile(path, sheet) for sheet in workbook.sheet_names]
                record.update({"status": "Readable workbook", "sheets": profiles})
                for profile in profiles:
                    if profile.get("status") != "Readable table":
                        continue
                    readable_tables += 1
                    total_rows += int(profile.get("rows", 0))
                    classifications[str(profile.get("classification", "Other"))] += 1
                    all_fields.update(profile.get("normalized_fields", []))
                    all_groups.update(profile.get("field_groups", {}).keys())
                    length = profile.get("field_completeness", {}).get("length_km", {}).get("sum")
                    if isinstance(length, (int, float)):
                        total_length_km += float(length)
                content = {
                    value
                    for profile in profiles
                    for value in profile.get("content_district_candidates", [])
                    if value
                }
                path_district = record["path_district_candidate"]
                matches_path = any(same_admin_name(path_district, value) for value in content)
                if content and path_district and not matches_path:
                    record["district_attribution_warning"] = {
                        "path_candidate": path_district,
                        "content_candidates": sorted(content),
                    }
            except Exception as error:
                record.update({"status": "Unreadable workbook", "error": f"{type(error).__name__}: {error}"})
        elif path.suffix.lower() == ".zip":
            try:
                with zipfile.ZipFile(path) as archive:
                    record.update(
                        {
                            "status": "Readable archive",
                            "archive_members": [
                                {"path": item.filename, "bytes": item.file_size, "crc": item.CRC}
                                for item in archive.infolist() if not item.is_dir()
                            ],
                        }
                    )
            except Exception as error:
                record.update({"status": "Unreadable archive", "error": f"{type(error).__name__}: {error}"})
        else:
            record["status"] = "Catalogued non-tabular source"
        records.append(record)
        print(f"{index:,}/{len(files):,} {relative}", flush=True)

    duplicate_groups = [
        {"sha256": signature, "copies": len(paths), "paths": paths}
        for signature, paths in hashes.items() if len(paths) > 1
    ]
    report = {
        "audit_year": 2026,
        "scope_root": str(SOURCE),
        "files": len(files),
        "workbooks": sum(path.suffix.lower() in {".xlsx", ".xls"} for path in files),
        "archives": sum(path.suffix.lower() == ".zip" for path in files),
        "unique_file_payloads": len(hashes),
        "exact_duplicate_files": sum(len(paths) - 1 for paths in hashes.values()),
        "readable_tables": readable_tables,
        "profiled_rows_including_source_duplicates": total_rows,
        "raw_length_sum_km_including_source_duplicates_and_mixed_scopes": round(total_length_km, 6),
        "table_classifications": dict(classifications.most_common()),
        "field_group_coverage_tables": dict(all_groups.most_common()),
        "most_common_normalized_fields": dict(all_fields.most_common(100)),
        "duplicate_groups": duplicate_groups,
        "records": records,
        "integration_policy": {
            "geometry": "RI_DATA workbooks are attribute evidence only unless a source includes explicit coordinates verified against the 248,616.14 km master geometry.",
            "district": "Use workbook content and boundary containment before directory-name inference.",
            "duplicates": "Retain one payload per SHA-256 group; preserve every source path as lineage.",
            "road_identity": "Match normalized official ID first, then district + normalized name + length, then spatial alignment; never join on road name alone.",
            "categories": "Map final records to National Roads, District Roads, KCCA City Roads, Community Access Roads, Town Council Roads, or Municipal Roads.",
            "surface_standard": "Earth and Gravel are Unpaved; Bituminous and Concrete are Paved. Preserve both surface material and paved/unpaved class.",
            "condition_standard": "Very Good, Good, Fair, Poor and Very Poor. Map Bad and Very Bad to Very Poor; keep the submitted raw value in lineage.",
        },
    }
    OUTPUT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({key: report[key] for key in list(report)[:13]}, indent=2), flush=True)


if __name__ == "__main__":
    main()
