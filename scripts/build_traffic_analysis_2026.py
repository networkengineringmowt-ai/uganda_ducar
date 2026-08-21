from __future__ import annotations

import gzip
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"
SOURCE=DATA/"hotosm_vehicular_link_attributes.csv.gz"
OUTPUT=DATA/"hotosm_vehicular_analysis.json"

BANDS={
    "aadt_band":("adt_total",[-1,149,499,999,np.inf],["0–149","150–499","500–999","1,000+"]),
    "adt_excluding_motorcycles_band":("adt_excluding_motorcycles",[-1,99,299,749,np.inf],["0–99","100–299","300–749","750+"]),
    "motorcycle_adt_band":("adt_motorcycles",[-1,24,99,249,np.inf],["0–24","25–99","100–249","250+"]),
    "heavy_vehicle_adt_band":("heavy_vehicle_adt",[-1,9,29,74,np.inf],["0–9","10–29","30–74","75+"]),
    "mean_speed_band":("speed_mean_kmh",[-1,19.9,29.9,39.9,np.inf],["Below 20 km/h","20–29.9 km/h","30–39.9 km/h","40+ km/h"]),
    "p85_speed_band":("speed_p85_kmh",[-1,29.9,39.9,49.9,np.inf],["Below 30 km/h","30–39.9 km/h","40–49.9 km/h","50+ km/h"]),
    "speed_exceedance_band":("speed_over_limit_pct",[-1,0,9.9,24.9,np.inf],["No exceedance","0.1–9.9%","10–24.9%","25%+"]),
    "overload_rate_band":("heavy_vehicle_overload_rate_pct",[-1,3.9,4.4,4.9,np.inf],["Below 4%","4–4.4%","4.5–4.9%","5%+"]),
    "annual_crash_band":("annual_crashes_estimate",[-1,0,1,2,np.inf],["0","1","2","3+"]),
}

CLASS_FIELDS=["adt_motorcycles","adt_passenger_cars","adt_taxis","adt_minibuses","adt_large_buses","adt_light_goods","adt_medium_goods","adt_heavy_goods","adt_articulated_trucks","adt_tractors","adt_special_vehicles","adt_other_motorised"]

def summary(frame:pd.DataFrame,field:str,bins:list[float],labels:list[str])->list[dict]:
    categories=pd.cut(pd.to_numeric(frame[field],errors="coerce").fillna(0),bins=bins,labels=labels)
    grouped=frame.assign(_category=categories).groupby("_category",observed=False).agg(feature_count=("length_km","size"),length_km=("length_km","sum"),minimum=(field,"min"),maximum=(field,"max"),mean=(field,"mean")).reset_index()
    value=lambda item:round(float(item),3) if pd.notna(item) and np.isfinite(float(item)) else 0
    return [{"category":str(row._category),"feature_count":int(row.feature_count),"length_km":round(float(row.length_km),6),"minimum":value(row.minimum),"maximum":value(row.maximum),"mean":value(row["mean"])} for _,row in grouped.iterrows()]

def main()->None:
    fields=["length_km","surface","pavement_class","condition","road_safety_risk_band","traffic_value_status","annual_fatal_crashes_estimate","annual_serious_crashes_estimate","annual_minor_crashes_estimate",*CLASS_FIELDS,*[value[0] for value in BANDS.values()]]
    with gzip.open(SOURCE,"rt",encoding="utf-8",newline="") as stream: frame=pd.read_csv(stream,usecols=list(dict.fromkeys(fields)),low_memory=False)
    numeric=set(CLASS_FIELDS)|{value[0] for value in BANDS.values()}|{"length_km","annual_fatal_crashes_estimate","annual_serious_crashes_estimate","annual_minor_crashes_estimate"}
    for field in numeric: frame[field]=pd.to_numeric(frame[field],errors="coerce").fillna(0)
    payload=json.loads(OUTPUT.read_text(encoding="utf-8"))
    traffic={key:summary(frame,*definition) for key,definition in BANDS.items()}
    for field in ["road_safety_risk_band","traffic_value_status"]:
        grouped=frame.groupby(field,dropna=False).agg(feature_count=("length_km","size"),length_km=("length_km","sum")).reset_index()
        traffic[field]=[{"category":str(row[field]),"feature_count":int(row.feature_count),"length_km":round(float(row.length_km),6)} for _,row in grouped.iterrows()]
    cross=frame.groupby(["surface","condition"],dropna=False).agg(feature_count=("length_km","size"),length_km=("length_km","sum")).reset_index()
    traffic["condition_by_surface"]=[{"surface":str(row.surface),"condition":str(row.condition),"feature_count":int(row.feature_count),"length_km":round(float(row.length_km),6)} for _,row in cross.iterrows()]
    traffic["vehicle_classes"]=[{"category":field.replace("adt_","").replace("_"," ").title(),"daily_vehicle_count":int(frame[field].sum()),"length_weighted_mean_adt":round(float(np.average(frame[field],weights=np.maximum(frame["length_km"],.000001))),1),"affected_length_km":round(float(frame.loc[frame[field]>0,"length_km"].sum()),6),"feature_count":int((frame[field]>0).sum())} for field in CLASS_FIELDS]
    traffic["totals"]={"projection_year":2026,"feature_count":len(frame),"length_km":round(float(frame.length_km.sum()),6),"projected_crashes":int(frame["annual_fatal_crashes_estimate"].sum()+frame["annual_serious_crashes_estimate"].sum()+frame["annual_minor_crashes_estimate"].sum()),"projected_fatal_crashes":int(frame["annual_fatal_crashes_estimate"].sum()),"projected_serious_crashes":int(frame["annual_serious_crashes_estimate"].sum()),"projected_minor_crashes":int(frame["annual_minor_crashes_estimate"].sum()),"length_weighted_mean_aadt":round(float(np.average(frame["adt_total"],weights=frame["length_km"])),1),"length_weighted_mean_adt_excluding_motorcycles":round(float(np.average(frame["adt_excluding_motorcycles"],weights=frame["length_km"])),1),"length_weighted_mean_motorcycles":round(float(np.average(frame["adt_motorcycles"],weights=frame["length_km"])),1),"length_weighted_mean_heavy_vehicles":round(float(np.average(frame["heavy_vehicle_adt"],weights=frame["length_km"])),1)}
    payload["traffic_2026"]=traffic
    payload["traffic_2026_sources"]=["https://upf.go.ug/wp-content/uploads/2026/04/ACR-2025-Official-Report-Web-Version.pdf","https://www.works.go.ug/policies-regulations/traffic-and-road-safety-laws-regulations/455-the-traffic-and-road-safety-prescription-of-speed-limits-regulations-2025/download","https://works.go.ug/wp-content/uploads/2026/05/MoWT-Strategic-Plan-2026_30-Draft-v6.pdf"]
    OUTPUT.write_text(json.dumps(payload,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print(json.dumps(traffic["totals"],indent=2))

if __name__=="__main__":main()
