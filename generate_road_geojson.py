#!/usr/bin/env python3
"""
generate_road_geojson.py
========================
Converts hotosm_uga_roads_osm_shp to per-class GeoJSON files for the DUCAR Priority Studio.
Run from the repo root: python generate_road_geojson.py

Requirements: geopandas, shapely
Install: pip install geopandas shapely fiona pyproj

Output: data/roads_class_m.geojson, data/roads_class_a.geojson, etc.
"""

import os
import json
import geopandas as gpd

# ── Configuration ──────────────────────────────────────────────────────────────
SHP_PATH = r"D:\OneDrive\Uganda National Road Network Repository\DUCAR\hotosm_uga_roads_osm_shp\hotosm_uga_roads.shp"
OUT_DIR  = "data"
EPSG_OUT = 4326   # WGS84 for Leaflet

# Road class mapping from OSM highway tag to functional class
CLASS_MAP = {
    # Class M — Motorways/Expressways
    'motorway':        'class_m',
    'motorway_link':   'class_m',
    # Class A — National Primary
    'trunk':           'class_a',
    'trunk_link':      'class_a',
    # Class B — National Secondary
    'primary':         'class_b',
    'primary_link':    'class_b',
    # Class C — National Tertiary
    'secondary':       'class_c',
    'secondary_link':  'class_c',
    'tertiary':        'class_c',
    'tertiary_link':   'class_c',
    # District Roads
    'unclassified':    'district',
    'road':            'district',
    # Urban Roads
    'residential':     'urban',
    'living_street':   'urban',
    'service':         'urban',
    # Community Access Roads
    'track':           'car',
    'path':            'footpath',
    'footway':         'footpath',
    'cycleway':        'footpath',
    'steps':           'footpath',
    'pedestrian':      'footpath',
}

OUTPUT_FILES = {
    'class_m':   'roads_class_m.geojson',
    'class_a':   'roads_class_a.geojson',
    'class_b':   'roads_class_b.geojson',
    'class_c':   'roads_class_c.geojson',
    'district':  'roads_district.geojson',
    'urban':     'roads_urban.geojson',
    'car':       'roads_car.geojson',
    'footpath':  'roads_footpath.geojson',
}

def compute_length_km(gdf_utm):
    """Compute length in km using UTM Zone 36N projection."""
    gdf_utm = gdf_utm.to_crs(epsg=32636)
    return gdf_utm.geometry.length / 1000.0

def classify_surface(row):
    surf = str(row.get('surface', '')).lower()
    if surf in ('asphalt', 'paved', 'concrete', 'bituminous'):
        return 'Paved'
    elif surf in ('gravel', 'compacted', 'crushed_limestone'):
        return 'Gravel'
    elif surf in ('dirt', 'earth', 'mud', 'ground', 'grass'):
        return 'Earth'
    return 'Unpaved'

def main():
    print(f"Loading shapefile: {SHP_PATH}")
    gdf = gpd.read_file(SHP_PATH)
    print(f"  Loaded {len(gdf):,} features, CRS: {gdf.crs}")

    # Ensure WGS84
    if gdf.crs and gdf.crs.to_epsg() != EPSG_OUT:
        gdf = gdf.to_crs(epsg=EPSG_OUT)

    # Add functional_class column
    highway_col = 'highway' if 'highway' in gdf.columns else gdf.columns[0]
    gdf['functional_class_key'] = gdf[highway_col].str.lower().map(CLASS_MAP).fillna('car')
    gdf['surface_type'] = gdf.apply(classify_surface, axis=1)

    # Compute length
    lengths = compute_length_km(gdf.copy())
    gdf['length_km'] = lengths.round(4)

    os.makedirs(OUT_DIR, exist_ok=True)

    totals = {}
    for cls_key, out_file in OUTPUT_FILES.items():
        subset = gdf[gdf['functional_class_key'] == cls_key].copy()
        if subset.empty:
            print(f"  {cls_key}: no features, skipping")
            continue

        # Select and rename columns for output
        keep_cols = ['geometry', 'length_km', 'surface_type']
        for col in ['name', 'ref', highway_col, 'surface', 'lanes']:
            if col in subset.columns:
                keep_cols.append(col)
        subset = subset[keep_cols].rename(columns={highway_col: 'highway_tag'})
        subset['functional_class'] = cls_key.replace('_', ' ').title()

        out_path = os.path.join(OUT_DIR, out_file)
        subset.to_file(out_path, driver='GeoJSON')
        total_km = subset['length_km'].sum()
        totals[cls_key] = {'links': len(subset), 'km': round(total_km, 2)}
        print(f"  {cls_key}: {len(subset):,} links, {total_km:,.2f} km → {out_path}")

    print("\nSummary:")
    grand_total_km = sum(v['km'] for k,v in totals.items() if k != 'footpath')
    grand_total_links = sum(v['links'] for k,v in totals.items() if k != 'footpath')
    for k, v in totals.items():
        print(f"  {k:12s}: {v['links']:8,} links  {v['km']:12,.2f} km")
    print(f"  {'TOTAL (ex footpaths)':20s}: {grand_total_links:8,} links  {grand_total_km:12,.2f} km")
    print("\nDone. Upload the data/ folder files to the GitHub repo.")

if __name__ == '__main__':
    main()
