import gzip
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "hotosm_vehicular_link_attributes.json.gz"
OUTPUT = ROOT / "data" / "full_network_chunks"
MANIFEST = ROOT / "data" / "full_network_chunks_manifest.json"
CHUNK_SIZE = 20_000


def main():
    with gzip.open(SOURCE, "rt", encoding="utf-8") as stream:
        rows = json.load(stream)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    chunks = []
    for index, start in enumerate(range(0, len(rows), CHUNK_SIZE)):
        payload = rows[start : start + CHUNK_SIZE]
        filename = f"roads_{index:02d}.json.gz"
        path = OUTPUT / filename
        with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as stream:
            json.dump(payload, stream, ensure_ascii=False, separators=(",", ":"))
        chunks.append({"path": f"./data/full_network_chunks/{filename}", "records": len(payload)})
    manifest = {
        "population_records": len(rows),
        "chunk_size": CHUNK_SIZE,
        "chunk_count": len(chunks),
        "fields": list(rows[0]) if rows else [],
        "chunks": chunks,
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
