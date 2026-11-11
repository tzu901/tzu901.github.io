/* Display images are georeferenced; range queries use the unchanged source GeoTIFF values. */
"use strict";

const ui = (id) => document.getElementById(id);
const number = (value, digits = 2) => Number.isFinite(value)
  ? value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";
const startupTimeout = setTimeout(() => showError(new Error("Map startup timed out")), 90000);
function showError(error) {
  clearTimeout(startupTimeout);
  console.error(error);
  ui("load-status").textContent = "Loading failed";
  ui("load-status").className = "status error";
  ui("load-error").hidden = false;
}

if (!window.require) {
  showError(new Error("Public map SDK did not load"));
} else {
  require([
    "esri/Map", "esri/views/MapView", "esri/layers/MediaLayer", "esri/layers/support/ImageElement",
    "esri/layers/support/ExtentAndRotationGeoreference", "esri/layers/TileLayer", "esri/Basemap",
    "esri/layers/GraphicsLayer", "esri/Graphic", "esri/geometry/Extent", "esri/geometry/Polygon",
    "esri/widgets/Sketch", "esri/widgets/ScaleBar", "esri/geometry/operators/clipOperator",
    "esri/geometry/operators/geodeticAreaOperator", "esri/geometry/support/webMercatorUtils"
  ], async (Map, MapView, MediaLayer, ImageElement, ExtentAndRotationGeoreference, TileLayer, Basemap,
             GraphicsLayer, Graphic, Extent, Polygon, Sketch, ScaleBar, clipOperator, geodeticAreaOperator, webMercatorUtils) => {
    try {
      const response = await fetch("./data/manifest.json");
      if (!response.ok) throw new Error("Manifest could not be loaded");
      const manifest = await response.json();
      if (manifest.schema !== "jk-paper-webmap-v1") throw new Error("Unexpected map data schema");
      const sites = new window.Map(manifest.sites.map((site) => [site.id, site]));
      let activeSite = sites.get(manifest.default_site), activeLayer = "rgb";
      const extent = (bounds, wkid = 4326) => new Extent({ xmin: bounds[0], ymin: bounds[1],
        xmax: bounds[2], ymax: bounds[3], spatialReference: { wkid } });
      const imageLayers = new window.Map(), rasterCache = new window.Map();
      const footprintLayer = new GraphicsLayer({ title: "Image footprint" });
      const selectionLayer = new GraphicsLayer({ title: "Query area" });
      const basemap = new Basemap({ baseLayers: [new TileLayer({
        url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer"
      })] });
      const map = new Map({ basemap, layers: [footprintLayer, selectionLayer] });
      const view = new MapView({ container: "view-div", map, spatialReference: { wkid: 3857 },
        extent: extent(activeSite.bounds_3857, 3857).expand(1.18), background: { color: "#dfe4dc" },
        constraints: { rotationEnabled: false, minZoom: 8, maxZoom: 19, snapToZoom: false } });
      const selectionSymbol = { type: "simple-fill", color: [239, 166, 76, 0.10],
        outline: { color: "#e18b2d", width: 2.5 } };
      const sketch = new Sketch({ view, layer: selectionLayer, creationMode: "single",
        availableCreateTools: ["rectangle", "polygon"],
        visibleElements: { selectionTools: { "rectangle-selection": false, "lasso-selection": false },
          settingsMenu: false, duplicateButton: false },
        defaultUpdateOptions: { tool: "reshape", enableRotation: false, enableScaling: false } });
      sketch.viewModel.polygonSymbol = selectionSymbol;
      view.ui.add(sketch, "top-left");
      view.ui.add(new ScaleBar({ view, unit: "metric" }), "bottom-left");

      let geotiffPromise;
      function loadRasterData(site) {
        if (!rasterCache.has(site.id)) {
          if (!geotiffPromise) geotiffPromise = new Promise((resolve, reject) => {
            require(["https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js"], resolve, reject);
          }).catch((error) => { geotiffPromise = null; throw error; });
          const promise = geotiffPromise.then(async (GeoTIFF) => {
            const entries = await Promise.all(Object.entries(site.rasters).map(async ([key, url]) => {
              const fetched = await fetch(new URL(url, document.baseURI));
              if (!fetched.ok) throw new Error(`Raster could not be loaded: ${site.id}/${key}`);
              const tiff = await GeoTIFF.fromArrayBuffer(await fetched.arrayBuffer());
              const image = await tiff.getImage();
              if (image.getWidth() !== site.grid.width || image.getHeight() !== site.grid.height ||
                  image.getBoundingBox().some((value, i) => Math.abs(value - site.bounds[i]) > 1e-8)) {
                throw new Error("Query raster grid differs from its source metadata");
              }
              const values = await image.readRasters({ samples: [0], interleave: true });
              return [key, values];
            }));
            return Object.fromEntries(entries);
          }).catch((error) => { rasterCache.delete(site.id); throw error; });
          rasterCache.set(site.id, promise);
        }
        return rasterCache.get(site.id);
      }

      function coordinateArea(polygon) {
        let sum = 0;
        for (const ring of polygon.rings) {
          const [x0, y0] = ring[0];
          for (let i = 0; i < ring.length - 1; i++) {
            sum += (ring[i][0] - x0) * (ring[i + 1][1] - y0) -
              (ring[i + 1][0] - x0) * (ring[i][1] - y0);
          }
        }
        return Math.abs(sum) / 2;
      }

      async function queryVolume(input, site = activeSite) {
        const polygon = input.spatialReference.isWebMercator
          ? webMercatorUtils.webMercatorToGeographic(input) : input.clone();
        if (polygon.spatialReference.wkid !== 4326) throw new Error("Selection must use WGS84 or Web Mercator");
        if (!geodeticAreaOperator.isLoaded()) await geodeticAreaOperator.load();
        const selectionArea = Math.abs(geodeticAreaOperator.execute(polygon));
        const clipped = clipOperator.execute(polygon, extent(site.bounds));
        let volume = 0, supported = 0, heightTotal = 0, heightArea = 0, cells = 0;
        if (clipped && clipped.extent && selectionArea > 0) {
          const b = clipped.extent, g = site.grid;
          const c0 = Math.max(0, Math.floor((b.xmin - g.origin_x) / g.pixel_width));
          const c1 = Math.min(g.width, Math.ceil((b.xmax - g.origin_x) / g.pixel_width));
          const r0 = Math.max(0, Math.floor((g.origin_y - b.ymax) / g.pixel_height));
          const r1 = Math.min(g.height, Math.ceil((g.origin_y - b.ymin) / g.pixel_height));
          const data = await loadRasterData(site);
          const bboxArea = b.width * b.height;
          const rectangular = clipped.rings.length === 1 && clipped.rings[0].length === 5 &&
            Math.abs(coordinateArea(clipped) - bboxArea) < bboxArea * 1e-8;
          for (let row = r0; row < r1; row++) {
            const top = g.origin_y - row * g.pixel_height, bottom = top - g.pixel_height;
            for (let col = c0; col < c1; col++) {
              const index = row * g.width + col, density = data.volume[index];
              if (!Number.isFinite(density) || density === g.nodata || density < 0) continue;
              const left = g.origin_x + col * g.pixel_width, right = left + g.pixel_width;
              let overlapArea;
              if (rectangular) {
                overlapArea = Math.max(0, Math.min(right, b.xmax) - Math.max(left, b.xmin)) *
                  Math.max(0, Math.min(top, b.ymax) - Math.max(bottom, b.ymin));
              } else {
                const overlap = clipOperator.execute(clipped, extent([left, bottom, right, top]));
                overlapArea = overlap ? coordinateArea(overlap) : 0;
              }
              const fraction = Math.min(1, overlapArea / (g.pixel_width * g.pixel_height));
              if (fraction <= 0) continue;
              // Densities are per hectare; exact row areas also account for latitude.
              const area = fraction * g.row_area_m2[row];
              volume += density * area / 10000;
              supported += area;
              const height = data.chm[index];
              if (Number.isFinite(height) && height !== g.nodata && height >= 0) {
                heightTotal += height * area;
                heightArea += area;
              }
              cells++;
            }
            if ((row - r0) % 32 === 31) await new Promise(requestAnimationFrame);
          }
        }
        return { site_id: site.id, selection_area_m2: selectionArea, supported_area_m2: supported,
          coverage_pct: selectionArea > 0 ? Math.min(100, 100 * supported / selectionArea) : 0,
          volume_m3: supported > 0 ? volume : null, density_m3_ha: supported > 0 ? volume * 10000 / supported : null,
          height_mean_m: heightArea > 0 ? heightTotal / heightArea : null, intersected_cells: cells,
          geometry_4326: polygon.toJSON() };
      }

      let result = null, selectionName = "", queryToken = 0;
      const metricIds = ["volume-value", "selection-area", "covered-area", "density-value", "height-value", "coverage-value"];
      function resetResult() {
        queryToken++;
        result = null;
        ui("selection-name").textContent = "No area selected";
        metricIds.forEach((id) => ui(id).textContent = "—");
        ui("selection-hint").textContent = "Draw an area or choose “Query full image”.";
        ui("selection-hint").classList.remove("partial");
        ui("download-result").disabled = true;
      }
      async function showResult(geometry, name = "Custom area") {
        const token = ++queryToken, site = activeSite;
        result = null;
        selectionName = name;
        ui("selection-name").textContent = name;
        metricIds.forEach((id) => ui(id).textContent = "…");
        ui("selection-hint").textContent = "Reading source height and volume values…";
        ui("download-result").disabled = true;
        try {
          const calculated = await queryVolume(geometry, site);
          if (token !== queryToken) return;
          result = calculated;
        } catch (error) {
          if (token !== queryToken) return;
          console.error(error);
          metricIds.forEach((id) => ui(id).textContent = "—");
          ui("selection-hint").textContent = "Could not read raster values. Please select the area again.";
          return;
        }
        ui("volume-value").textContent = number(result.volume_m3);
        ui("selection-area").textContent = number(result.selection_area_m2 / 10000, 2);
        ui("covered-area").textContent = number(result.supported_area_m2 / 10000, 2);
        ui("density-value").textContent = number(result.density_m3_ha);
        ui("height-value").textContent = number(result.height_mean_m);
        ui("coverage-value").textContent = number(result.coverage_pct, 1);
        ui("selection-hint").classList.toggle("partial", result.coverage_pct < 99.9);
        ui("selection-hint").textContent = result.intersected_cells === 0 ? "No valid pixels intersect the selected area."
          : `${result.intersected_cells.toLocaleString("en-US")} valid intersecting pixels, weighted by overlap area. ` +
            (result.coverage_pct < 99.9 ? "Missing data and areas outside the image are excluded." : "");
        ui("download-result").disabled = result.volume_m3 === null;
        animate(".result-card");
      }
      function selectGeometry(geometry, name) {
        sketch.cancel();
        selectionLayer.removeAll();
        selectionLayer.add(new Graphic({ geometry: geometry.clone(), symbol: selectionSymbol }));
        return showResult(geometry, name);
      }
      sketch.on("create", (event) => {
        if (event.state === "start") resetResult();
        if (event.state === "complete") {
          selectionLayer.removeMany(selectionLayer.graphics.toArray().filter((graphic) => graphic !== event.graphic));
          event.graphic.symbol = selectionSymbol;
          showResult(event.graphic.geometry);
        }
      });
      sketch.on("update", (event) => {
        if (event.state === "complete" && event.graphics[0]) showResult(event.graphics[0].geometry);
      });
      sketch.on("delete", resetResult);

      function animate(target) {
        if (window.gsap && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
          gsap.fromTo(target, { y: 5, opacity: 0.65 }, { y: 0, opacity: 1, duration: 0.25, overwrite: true });
        }
      }
      function switchLayer(key) {
        if (key !== "satellite" && !manifest.layers[key]) throw new Error("Unknown display layer");
        activeLayer = key;
        imageLayers.forEach((layer) => layer.visible = false);
        let current;
        if (key !== "satellite") {
          const cacheKey = `${activeSite.id}/${key}`;
          if (!imageLayers.has(cacheKey)) {
            const layer = new MediaLayer({ title: `${activeSite.label} · ${manifest.layers[key].title}`, opacity: 1,
              source: [new ImageElement({ image: new URL(activeSite.images[key], document.baseURI).href,
                georeference: new ExtentAndRotationGeoreference({ extent: extent(activeSite.bounds_3857, 3857) }) })] });
            imageLayers.set(cacheKey, layer);
            map.add(layer, 0);
          }
          current = imageLayers.get(cacheKey);
          current.visible = true;
        }
        document.querySelectorAll("[data-layer]").forEach((button) => {
          const selected = button.dataset.layer === key;
          button.classList.toggle("active", selected);
          button.setAttribute("aria-pressed", String(selected));
        });
        ui("active-layer-name").textContent = manifest.layers[key]?.title || "Esri satellite basemap";
        ui("volume-legend").hidden = !["chm", "volume"].includes(key);
        if (["chm", "volume"].includes(key)) {
          ui("legend-title").textContent = key === "chm" ? "Canopy height" : "Volume density";
          ui("legend-unit").textContent = manifest.layers[key].unit;
          ui("legend-max").textContent = String(manifest.layers[key].max);
        }
        ui("volume-opacity").value = current ? Math.round(current.opacity * 100) : 100;
        ui("volume-opacity").disabled = !current;
        ui("opacity-value").textContent = `${ui("volume-opacity").value}%`;
      }
      function switchSite(id, navigate = true) {
        if (!sites.has(id)) throw new Error("Unknown site");
        activeSite = sites.get(id);
        sketch.cancel();
        selectionLayer.removeAll();
        resetResult();
        footprintLayer.removeAll();
        footprintLayer.add(new Graphic({ geometry: Polygon.fromExtent(extent(activeSite.bounds_3857, 3857)),
          symbol: { type: "simple-fill", color: [0, 0, 0, 0], outline: { color: "#ffffff", width: 1.5, style: "dash" } } }));
        document.querySelectorAll("[data-site]").forEach((button) => {
          const selected = button.dataset.site === id;
          button.classList.toggle("active", selected);
          button.setAttribute("aria-pressed", String(selected));
        });
        ui("site-region").textContent = `${activeSite.label} · ${activeSite.region}`;
        ui("site-summary").textContent = `Valid area ${number(activeSite.summary.supported_area_m2 / 10000)} ha · Mean height ${number(activeSite.summary.height_mean_m)} m`;
        for (const key of ["rgb", "chm", "volume"]) ui(`download-${key}`).href = activeSite.rasters[key] || activeSite.images[key];
        switchLayer(activeLayer);
        if (navigate) return view.goTo(extent(activeSite.bounds_3857, 3857).expand(1.18), { animate: false });
      }
      document.querySelectorAll("[data-site]").forEach((button) => button.onclick = () => switchSite(button.dataset.site).catch(showError));
      document.querySelectorAll("[data-layer]").forEach((button) => button.onclick = () => switchLayer(button.dataset.layer));
      ui("query-view").onclick = () => selectGeometry(Polygon.fromExtent(extent(activeSite.bounds)), `${activeSite.label} · Full image`);
      ui("clear-selection").onclick = () => { sketch.cancel(); selectionLayer.removeAll(); resetResult(); };
      ui("reset-view").onclick = () => view.goTo(extent(activeSite.bounds_3857, 3857).expand(1.18)).catch((error) => {
        if (error.name !== "AbortError") console.error(error);
      });
      ui("show-footprint").onchange = (event) => footprintLayer.visible = event.target.checked;
      ui("volume-opacity").oninput = (event) => {
        const current = imageLayers.get(`${activeSite.id}/${activeLayer}`);
        if (current) current.opacity = Number(event.target.value) / 100;
        ui("opacity-value").textContent = `${event.target.value}%`;
      };
      ui("download-result").onclick = () => {
        if (!result) return;
        const rows = [
          ["site_id", "selection", "volume_m3", "density_m3_ha", "height_mean_m", "selection_area_ha", "covered_area_ha", "coverage_pct", "crs", "geometry_esri_json"],
          [result.site_id, selectionName, result.volume_m3, result.density_m3_ha, result.height_mean_m,
            result.selection_area_m2 / 10000, result.supported_area_m2 / 10000, result.coverage_pct,
            "EPSG:4326", JSON.stringify(result.geometry_4326)]
        ];
        const csv = "\ufeff" + rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
        const link = document.createElement("a"), url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        link.href = url; link.download = `JK_Paper_${result.site_id}_volume_query.csv`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      const model = manifest.model;
      ui("model-equation").textContent = `Volume density V = CHM × ${model.carbon_height_coefficient_MgC_ha_per_m.toFixed(6)} ÷ (CF ${model.carbon_fraction_MgC_per_Mg_dry_biomass} × WD ${model.wood_density_Mg_dry_biomass_per_m3} × BEF ${model.biomass_expansion_factor}), using the existing pooled POC coefficients.`;
      document.querySelector(".legend-gradient").style.background = `linear-gradient(90deg,${manifest.colors.join(",")})`;
      switchSite(activeSite.id, false);
      await view.when();
      clearTimeout(startupTimeout);
      document.querySelectorAll("button[disabled]").forEach((button) => {
        if (button.id !== "download-result") button.disabled = false;
      });
      ui("load-status").textContent = "Ready · 2 sites";
      ui("load-status").className = "status ready";
      window.jkPaperMap = window.volumeMap = { view, sketch, manifest, queryVolume, selectGeometry, switchLayer, switchSite,
        get result() { return result; }, get site() { return activeSite; }, get layer() { return activeLayer; }, ready: true };
    } catch (error) { showError(error); }
  }, showError);
}
