from __future__ import annotations

import gzip
import json
from pathlib import Path

import pandas as pd

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"
KEYS=["region","district","highway","pavement_class","condition"]
VALUES=["registry_aadt","registry_pcu","registry_speed_kmh","traffic_model_confidence_pct"]


def main()->None:
    with gzip.open(DATA/"hotosm_vehicular_link_attributes.csv.gz","rt",encoding="utf-8",newline="") as stream:
        frame=pd.read_csv(stream,usecols=KEYS+VALUES+["length_km"])
    for field in VALUES+["length_km"]: frame[field]=pd.to_numeric(frame[field],errors="coerce").fillna(0)
    for field in VALUES: frame[f"weighted_{field}"]=frame[field]*frame["length_km"]
    grouped=frame.groupby(KEYS,dropna=False).agg(feature_count=("length_km","size"),length_km=("length_km","sum"),**{f"sum_{field}":(f"weighted_{field}","sum") for field in VALUES}).reset_index()
    index={tuple(str(row[field]) for field in KEYS):row for _,row in grouped.iterrows()}
    path=DATA/"hotosm_vehicular_map.geojson"
    payload=json.loads(path.read_text(encoding="utf-8"))
    matched=0
    for feature in payload["features"]:
        props=feature["properties"]
        row=index.get(tuple(str(props.get(field)) for field in KEYS))
        if row is None: continue
        length=max(float(row["length_km"]),1e-9)
        for field in VALUES: props[field]=round(float(row[f"sum_{field}"])/length,1)
        props.update({"traffic_value_status":"Model estimated","traffic_model_id":"DUCAR-Traffic-ET-v1.0-2026-08-21","traffic_assignment_basis":"Length-weighted aggregation of complete HOTOSM feature-level estimates","traffic_assigned_feature_count":int(row["feature_count"])})
        matched+=1
    payload.setdefault("metadata",{})["traffic_model_id"]="DUCAR-Traffic-ET-v1.0-2026-08-21"
    payload["metadata"]["traffic_assignment"]="All vehicular source features assigned; map properties are length-weighted group means"
    path.write_text(json.dumps(payload,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print({"map_groups":len(payload["features"]),"traffic_groups_matched":matched})


if __name__=="__main__":main()
