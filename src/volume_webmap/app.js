/* ArcGIS handles mapping, sketching and polygon clipping; only cell-volume aggregation is custom. */
"use strict";

const ui = (id) => document.getElementById(id);
const number = (value, digits = 2) => Number.isFinite(value)
  ? value.toLocaleString("zh-TW", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";
const startupTimeout = setTimeout(() => showError(new Error("Map startup timed out")), 90000);
function showError(error) {
  clearTimeout(startupTimeout);
  console.error(error);
  ui("load-status").textContent = "資料載入失敗";
  ui("load-status").className = "status error";
  ui("load-error").hidden = false;
}

if (!window.require) {
  showError(new Error("Public map SDK did not load"));
} else {
  require([
    "esri/Map", "esri/views/MapView", "esri/layers/WebTileLayer", "esri/layers/TileLayer", "esri/Basemap", "esri/layers/support/TileInfo",
    "esri/layers/GraphicsLayer", "esri/Graphic", "esri/geometry/Extent", "esri/geometry/Polygon",
    "esri/widgets/Sketch", "esri/widgets/ScaleBar", "esri/geometry/operators/clipOperator",
    "esri/geometry/operators/areaOperator", "esri/geometry/operators/projectOperator", "esri/geometry/SpatialReference"
  ], async (Map, MapView, WebTileLayer, TileLayer, Basemap, TileInfo,
             GraphicsLayer, Graphic, Extent, Polygon, Sketch, ScaleBar, clipOperator, areaOperator, projectOperator, SpatialReference) => {
    try {
      const metadataResponse = await fetch("./data/manifest.json");
      if (!metadataResponse.ok) throw new Error("Manifest could not be loaded");
      const manifest = await metadataResponse.json();
      const sr = { wkid: 3826 };
      const extent = (bounds, wkid = 3826) => new Extent({ xmin: bounds[0], ymin: bounds[1],
        xmax: bounds[2], ymax: bounds[3], spatialReference: { wkid } });
      const initialExtent = extent(manifest.initial_view_bounds_3857, 3857);
      const analysisExtent = extent(manifest.analysis_bounds);
      const grid = manifest.raster;
      const lods = Array.from({ length: 20 }, (_, level) => ({ level,
        resolution: 156543.03392804097 / 2**level, scale: 591657527.591555 / 2**level }));
      const titles = { rgb: "Fusion Pléiades RGB", chm: "Pléiades CHM 樹冠高度", volume: "Pléiades 推估材積" };
      const tileLayers = Object.fromEntries(Object.entries(manifest.layers).map(([key, source]) => [key,
        new WebTileLayer({ id: key, title: titles[key], visible: key === "rgb",
          urlTemplate: new URL(source.url_template, document.baseURI).href.replaceAll("%7B", "{").replaceAll("%7D", "}"),
          fullExtent: extent(source.bounds_3857, 3857), minScale: lods[source.min_zoom].scale,
          copyright: "Pléiades · 第 103 林班",
          tileInfo: new TileInfo({ size: [256, 256], dpi: 96, format: "mixed",
            spatialReference: { wkid: 3857 }, origin: { x: -20037508.342789244, y: 20037508.342789244 },
            lods: lods.slice(source.min_zoom, source.max_zoom+1) }) })]));
      let activeLayer = "rgb";
      const zonesLayer = new GraphicsLayer({ title: "F–I 調查區" });
      const selectionLayer = new GraphicsLayer({ title: "查詢範圍" });
      const basemap = new Basemap({ baseLayers: [new TileLayer({
        url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer" })] });
      const map = new Map({ basemap, layers: [...Object.values(tileLayers), zonesLayer, selectionLayer] });
      const view = new MapView({ container: "view-div", map, spatialReference: { wkid: 3857 },
        extent: initialExtent, background: { color: "#dfe4dc" },
        constraints: { rotationEnabled: false, minZoom: 10, maxZoom: 19 } });
      const selectionSymbol = { type: "simple-fill", color: [239, 166, 76, 0.13],
        outline: { color: "#e18b2d", width: 2.5 } };
      const zoneFeatures = manifest.zones.features;
      const zonePolygons = new window.Map();
      for (const feature of zoneFeatures) {
        const polygon = new Polygon(feature.display_geometry);
        zonePolygons.set(feature.properties.zone, new Polygon(feature.esri_geometry));
        zonesLayer.addMany([
          new Graphic({ geometry: polygon, symbol: { type: "simple-fill", color: [0, 0, 0, 0],
            outline: { color: "#223b2a", width: 3.1 } } }),
          new Graphic({ geometry: polygon, symbol: { type: "simple-fill", color: [0, 0, 0, 0],
            outline: { color: "#ffffff", width: 1.3 } } }),
          new Graphic({ geometry: { type: "point", x: feature.properties.label_xy_3857[0],
            y: feature.properties.label_xy_3857[1], spatialReference: { wkid: 3857 } },
            symbol: { type: "text", text: feature.properties.zone, color: "white",
              haloColor: "#223b2a", haloSize: 1.7, font: { family: "Arial", size: 13, weight: "bold" } } })
        ]);
      }
      const sketch = new Sketch({ view, layer: selectionLayer, creationMode: "single",
        availableCreateTools: ["rectangle", "polygon"],
        visibleElements: { selectionTools: { "rectangle-selection": false, "lasso-selection": false },
          settingsMenu: false, duplicateButton: false },
        defaultUpdateOptions: { tool: "reshape", enableRotation: false, enableScaling: false } });
      sketch.viewModel.polygonSymbol = selectionSymbol;
      view.ui.add(sketch, "top-left");
      view.ui.add(new ScaleBar({ view, unit: "metric" }), "bottom-left");
      let imagePromise;
      function loadVolumeImage() {
        if (!imagePromise) imagePromise = new Promise((resolve, reject) => {
          require(["https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js"], resolve, reject);
        }).then(async (GeoTIFF) => {
          const tiff = await GeoTIFF.fromUrl(new URL(grid.url, document.baseURI).href,
            { allowFullFile: true, blockSize: 65536, cacheSize: 32 });
          const image = await tiff.getImage(0);
          if (image.getWidth() !== grid.width || image.getHeight() !== grid.height ||
              image.getBoundingBox().some((n, i) => Math.abs(n-grid.grid_bounds[i]) > 1e-6)) {
            throw new Error("Query raster grid differs from the verified source");
          }
          return image;
        }).catch((error) => { imagePromise = null; throw error; });
        return imagePromise;
      }
      // Cell volumes are additive. Partial boundary cells use their original effective source area.
      async function queryVolume(input, bounds = manifest.analysis_bounds) {
        let polygon = input.clone();
        if (polygon.spatialReference.wkid !== 3826) {
          await projectOperator.load();
          polygon = projectOperator.execute(polygon, new SpatialReference(sr));
          if (!polygon) throw new Error("Could not project the selection to TWD97");
        }
        const selectionArea = Math.abs(areaOperator.execute(polygon, { unit: "square-meters" }));
        const clipped = clipOperator.execute(polygon, extent(bounds));
        let volume = 0, supported = 0, cells = 0;
        if (clipped && clipped.extent && selectionArea > 0) {
          const b = clipped.extent, cell = grid.cell_size_m, foot = grid.footprint_bounds;
          const c0 = Math.max(0, Math.floor((b.xmin-grid.origin_x)/cell));
          const c1 = Math.min(grid.width, Math.ceil((b.xmax-grid.origin_x)/cell));
          const r0 = Math.max(0, Math.floor((grid.origin_y-b.ymax)/cell));
          const r1 = Math.min(grid.height, Math.ceil((grid.origin_y-b.ymin)/cell));
          const image = await loadVolumeImage();
          const values = await image.readRasters({ window: [c0, r0, c1, r1], samples: [0], interleave: true });
          if (values.BYTES_PER_ELEMENT !== 8 || grid.unit !== "m3/cell") throw new Error("Expected original Float64 cell volumes");
          for (let row = r0; row < r1; row++) for (let col = c0; col < c1; col++) {
            const value = values[(row-r0)*(c1-c0)+(col-c0)];
            if (!Number.isFinite(value) || value === grid.nodata) continue;
            const left = Math.max(foot[0], grid.origin_x+col*cell);
            const right = Math.min(foot[2], grid.origin_x+(col+1)*cell);
            const top = Math.min(foot[3], grid.origin_y-row*cell);
            const bottom = Math.max(foot[1], grid.origin_y-(row+1)*cell);
            if (right <= left || top <= bottom) continue;
            const overlap = clipOperator.execute(clipped, extent([left, bottom, right, top]));
            const area = overlap ? Math.abs(areaOperator.execute(overlap, { unit: "square-meters" })) : 0;
            if (area <= 0) continue;
            volume += value*area/((right-left)*(top-bottom));
            supported += area;
            cells++;
          }
        }
        return { selection_area_m2: selectionArea, supported_area_m2: supported,
          coverage_pct: selectionArea > 0 ? Math.min(100, 100*supported/selectionArea) : 0,
          volume_m3: supported > 0 ? volume : null,
          density_m3_ha: supported > 0 ? volume*10000/supported : null, intersected_cells: cells,
          geometry_3826: polygon.toJSON() };
      }
      let result = null, selectionName = "", queryToken = 0;
      function resetResult() {
        queryToken++;
        result = null;
        ui("selection-name").textContent = "尚未選取範圍";
        ["volume-value", "selection-area", "covered-area", "density-value", "coverage-value"].forEach((id) => ui(id).textContent = "—");
        ui("selection-hint").textContent = "框選範圍，或點選上方 F–I 調查區。";
        ui("selection-hint").classList.remove("partial");
        ui("download-result").disabled = true;
        document.querySelectorAll("[data-zone]").forEach((b) => b.classList.remove("active"));
      }
      async function showResult(geometry, name = "自訂範圍") {
        const token = ++queryToken;
        result = null;
        selectionName = name;
        ui("selection-name").textContent = name;
        ui("volume-value").textContent = "…";
        ui("selection-hint").textContent = "正在讀取選取範圍的材積資料…";
        ui("download-result").disabled = true;
        try {
          const calculated = await queryVolume(geometry);
          if (token !== queryToken) return;
          result = calculated;
        } catch (error) {
          if (token !== queryToken) return;
          console.error(error);
          ui("volume-value").textContent = "—";
          ui("selection-hint").textContent = "材積資料讀取失敗，請重新選取範圍。";
          return;
        }
        ui("volume-value").textContent = number(result.volume_m3);
        ui("selection-area").textContent = number(result.selection_area_m2/10000, 2);
        ui("covered-area").textContent = number(result.supported_area_m2/10000, 2);
        ui("density-value").textContent = number(result.density_m3_ha);
        ui("coverage-value").textContent = number(result.coverage_pct, 1);
        ui("selection-hint").classList.toggle("partial", result.coverage_pct < 99.999);
        ui("selection-hint").textContent = result.coverage_pct < 99.999
          ? "範圍部分超出本頁資料視野或缺少數值，僅加總有資料的面積。"
          : `依 ${result.intersected_cells.toLocaleString("zh-TW")} 個相交格網與邊界重疊比例加總。`;
        ui("download-result").disabled = result.volume_m3 === null;
        animate(".result-card");
      }
      function selectGeometry(geometry, name) {
        sketch.cancel();
        selectionLayer.removeAll();
        selectionLayer.add(new Graphic({ geometry: geometry.clone(), symbol: selectionSymbol }));
        resetResult();
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
        if (event.state === "complete" && event.graphics[0]) {
          document.querySelectorAll("[data-zone]").forEach((b) => b.classList.remove("active"));
          showResult(event.graphics[0].geometry, "自訂範圍");
        }
      });
      sketch.on("delete", resetResult);
      document.querySelectorAll("[data-zone]").forEach((button) => button.addEventListener("click", () => {
        selectGeometry(zonePolygons.get(button.dataset.zone), `${button.dataset.zone} 區`);
        button.classList.add("active");
      }));
      ui("query-view").onclick = () => selectGeometry(Polygon.fromExtent(analysisExtent), "整個參考視野");
      ui("clear-selection").onclick = () => { sketch.cancel(); selectionLayer.removeAll(); resetResult(); };
      ui("reset-view").onclick = () => view.goTo(initialExtent).catch((error) => {
        if (error.name !== "AbortError") console.error(error);
      });
      function animate(target) {
        if (window.gsap && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
          gsap.fromTo(target, { y: 5, opacity: 0.65 }, { y: 0, opacity: 1, duration: 0.25, overwrite: true });
        }
      }
      function switchLayer(key) {
        activeLayer = key;
        Object.entries(tileLayers).forEach(([name, layer]) => layer.visible = name === key);
        document.querySelectorAll("[data-layer]").forEach((button) => {
          button.classList.toggle("active", button.dataset.layer === key);
          button.setAttribute("aria-pressed", button.dataset.layer === key ? "true" : "false");
        });
        ui("active-layer-name").textContent = titles[key] || "Esri 衛星底圖";
        ui("volume-legend").hidden = !["chm", "volume"].includes(key);
        ui("legend-title").textContent = key === "chm" ? "樹冠高度" : "推估材積";
        ui("legend-unit").textContent = key === "chm" ? "m" : "m³／10 m 格";
        ui("legend-max").textContent = key === "chm" ? "≥ 25" : "≥ 4.0";
        ui("volume-opacity").value = key === "satellite" ? 100 : Math.round(tileLayers[key].opacity*100);
        ui("opacity-value").textContent = `${ui("volume-opacity").value}%`;
        ui("volume-opacity").disabled = key === "satellite";
        animate(".legend");
      }
      document.querySelectorAll("[data-layer]").forEach((button) => button.onclick = () => switchLayer(button.dataset.layer));
      ui("show-zones").onchange = (event) => zonesLayer.visible = event.target.checked;
      ui("volume-opacity").oninput = (event) => {
        if (tileLayers[activeLayer]) tileLayers[activeLayer].opacity = Number(event.target.value)/100;
        ui("opacity-value").textContent = `${event.target.value}%`;
      };
      ui("download-result").onclick = () => {
        if (!result) return;
        const rows = [
          ["selection", "volume_m3", "selection_area_ha", "covered_area_ha", "coverage_pct", "density_m3_ha", "crs", "geometry_esri_json"],
          [selectionName, result.volume_m3, result.selection_area_m2/10000,
            result.supported_area_m2/10000, result.coverage_pct, result.density_m3_ha,
            "EPSG:3826", JSON.stringify(result.geometry_3826)]
        ];
        const csv = "\ufeff" + rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
        const link = document.createElement("a"), url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        link.href = url; link.download = "103-volume-query.csv"; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      switchLayer("rgb");
      await view.when();
      clearTimeout(startupTimeout);
      document.querySelectorAll("button[disabled]").forEach((button) => {
        if (button.id !== "download-result") button.disabled = false;
      });
      ui("load-status").textContent = "地圖已就緒 · 資料按需載入";
      ui("load-status").className = "status ready";
      window.volumeMap = { view, sketch, manifest, queryVolume, zonePolygons, selectGeometry, switchLayer, tileLayers,
        get result() { return result; }, ready: true };
    } catch (error) { showError(error); }
  }, showError);
}
