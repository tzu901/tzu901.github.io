# 台電輸電線 2026 CHM 與 50 m 植生風險地圖

本目錄是可直接部署的靜態網站邊界（例如 GitHub Pages）。入口頁為 `index.html`，互動地圖為 `Pylon interactive map.html`；請一併上傳整個 `Taipower_pylon/Web` 目錄及其 `assets` 子目錄。

## 圖層與資料意義

地圖保留完整的 2026 年冠層高度模型（CHM）圖層，並新增下列瀏覽器直接讀取的資產：

- `assets/taipower_chm_2026_50m_corridor.tif`：沿依序連接的輸電線中心線左右各 50 m 範圍裁切的 2026 CHM 植生風險 GeoTIFF。
- `assets/tower_chm_2026_50m_stats.json`：每座鐵塔以塔位為圓心、半徑 50 m 內的最大 CHM 高度、有效像元數與高度類別。

走廊的 50 m 是中心線每一側的距離；鐵塔統計的 50 m 則是以各塔位為中心的圓形半徑，兩者不可互換。舊有的 250 m 生物多樣性背景圖層已移除，以避免與此一輸電線近鄰植生風險圖層混淆。

CHM 值為模型推估的冠層高度，並非現地直接量測；因此地圖用於空間篩檢與後續巡查排序時，仍應以現地查核確認。

## 高度類別與互動元件

50 m 走廊 GeoTIFF 依 10 m 間距顯示六個樹高類別：

- 0–<10 m：低矮植生
- 10–<20 m：較低冠層
- 20–<30 m：中等冠層
- 30–<40 m：較高冠層
- 40–<50 m：高冠層
- ≥50 m：最高冠層類別

各類別採下限包含、上限不包含的半開區間：例如 10.0 m 歸入 10–<20 m，而 50.0 m 歸入 ≥50 m。走廊外、來源 NoData、非有限值與非正 CHM 值皆為透明。地圖中的鐵塔圓點顏色與上列高度類別相同；鐵塔彈出視窗及「2026 50 m tower maximum tree height (m)」長條圖均由 `tower_chm_2026_50m_stats.json` 驅動。沒有有效像元的塔位會以中性灰色與 `No valid data` 顯示。

## 重新產生部署資產

請在專案根目錄使用已配置空間資料相依套件的 Python 環境執行：

```powershell
& '.venv_ctrees\Scripts\python.exe' 'Taipower_pylon/build_taipower_web_risk_layers.py'
```

此命令會更新 `Web/assets` 下的走廊 GeoTIFF 與鐵塔統計 JSON，不會修改來源 CHM 或塔位 CSV。也可使用等效的環境 Python 執行：

```powershell
python Taipower_pylon/build_taipower_web_risk_layers.py
```

## 本機預覽與 GitHub Pages

GeoTIFF 由網頁以 `fetch` 載入；請勿以瀏覽器直接開啟本機 HTML（`file://`），而應從 `Taipower_pylon/Web` 以 HTTP 服務提供檔案。例如在該目錄執行：

```powershell
python -m http.server 8000
```

接著開啟 `http://localhost:8000/`。部署至 GitHub Pages 或其他靜態主機時，設定網站根目錄為 `Taipower_pylon/Web`，並保留 `.nojekyll`、HTML、CSS/JavaScript 與 `assets/*.tif`、`assets/*.json`。這些 TIFF 與 JSON 是網站執行所需的部署資產，不能省略。
