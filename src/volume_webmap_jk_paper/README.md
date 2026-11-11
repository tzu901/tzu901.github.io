# JK Paper Canopy Height and Volume Explorer

An interactive map of Sentinel-2 RGB imagery, GCHM canopy height, and estimated stem volume for Odisha (Site 1) and Gujarat (Site 2), India. Switch sites and layers, adjust opacity, draw rectangles or polygons, query the full image, and download query results as CSV.

## Open locally

Run from the workspace root:

```powershell
python -m http.server 8000 --bind 127.0.0.1 --directory JK_paper/webmap
```

Open `http://localhost:8000/`. Use HTTP so the browser can read local images and GeoTIFF files. The ArcGIS SDK, GeoTIFF.js, and Esri satellite basemap require an internet connection. Press `Ctrl+C` in the terminal to stop the server.

This folder can also be deployed directly to GitHub Pages. Keep `.nojekyll`, `index.html`, `app.js`, `style.css`, and the complete `data/` folder. No backend or npm build is required.

## Layers and units

| Layer | Source | Display |
| --- | --- | --- |
| RGB | Bands B4/B3/B2 of `s2/JK_Paper_2026_S2*.tif` | Per-site, per-band 2–98 percentile stretch |
| CHM | `chm/*gchm_prediction_2026.tif` | Shared 0–35 m scale |
| Estimated stem volume | `carbon_poc/*merchantable_volume_poc_m3_ha.tif` | Shared 0–250 m³/ha scale |

PNG files are display images with transparent NoData pixels. Each image is positioned using its source footprint and retains the source pixel dimensions. Layers load on demand. The first numeric query loads that site's CHM and volume GeoTIFF files. Downloads and queries use the same GeoTIFF files, with SHA-256 hashes identical to the original outputs.

Volume uses the existing pooled POC: `V = CHM × k_C / (CF × WD × BEF)`, with `k_C=2.268153865943`, `CF=0.47`, `WD=0.53 Mg/m³`, and `BEF=1.20`. CHM is canopy height estimated by a Sentinel-2/GEDI model. Volume is an uncalibrated scenario estimate. The images represent two different locations.

## Area queries

Each pixel's volume density is multiplied by its WGS84 ellipsoidal ground area in hectares and its overlap fraction with the selected polygon. The sum gives total volume in m³. Geodesic pixel areas for each row are stored in `manifest.json`; the geographic grid is not treated as a constant 100 m² per pixel. Partial pixels use planar overlap fractions in longitude/latitude coordinates, an area approximation at the current approximately 10 m pixel scale.

Mean height and volume density are weighted by valid overlap area. Valid zero values are included. NoData `-9999` and non-finite values are excluded. Queries extending beyond the image or covering missing data report the valid data area and coverage percentage. CSV downloads include the site, total volume (m³), density (m³/ha), height (m), areas, coverage, and selection geometry in WGS84.

The image outline marks the data footprint. All interface text, map widgets, tooltips, and query labels use English.

## Rebuild data

Run from the workspace root:

```powershell
python JK_paper/build_jk_paper_webmap.py
```

The builder lives outside `webmap/`. It reads the existing S2, CHM, volume, POC summary, and coefficient files; checks source hashes, grids, NoData, and copied raster files; and generates display images and the manifest. Each of `data/point1/` and `data/point2/` contains three display PNGs, one original CHM GeoTIFF, and one original volume GeoTIFF.

The original Linban 103 template and its Taiwan tiles are retained in `JK_paper/.webmap_template_103_backup_20261111/`.
