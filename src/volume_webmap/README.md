# 第 103 林班互動地圖

衛星底圖搭配 Pléiades RGB、CHM 與推估材積圖層，支援矩形／多邊形框選、F–I 快速查詢及 CSV 下載。

## GitHub Pages

1. 將本資料夾內容上傳至 repository 根目錄。
2. 在 **Settings → Pages** 選 **Deploy from a branch → main → /(root)**，按 Save。
3. 開啟 Pages 提供的網址。

保留所有 `data/` 檔案與 `.nojekyll`。本頁使用公開 ArcGIS SDK、GSAP 與 Esri 衛星底圖，瀏覽時需連網，不需後端或 npm 建置。

## 本機預覽

在專案根目錄執行：

```powershell
python -m http.server 8000 --directory output_103_2026/webmap
```

開啟 `http://localhost:8000/`；請透過 HTTP 開啟，避免瀏覽器限制本機資料讀取。

## 資料與計算

`data/` 只保留範圍與區界設定、RGB／CHM／材積 XYZ 圖磚，以及一份材積 COG。圖磚依視野載入，材積數值在框選後才讀取；同一份 COG 同時供查詢與下載。

材積由 Pléiades 樹冠高度搭配 F–I 調查資料建立簡單回歸推估。原格網為 10 × 10 公尺，單位是 **m³／格**，每格數值與來源 raster 相同。框選邊界轉回 TWD97 後，依與格網的重疊面積比例加總。

資料涵蓋參考圖的 F–I 邊界外包框向外各延伸 55 公尺，約 41.69 ha。超出範圍的選取會顯示資料涵蓋率。此成果屬模型推估，尚無逐格或區外材積精度驗證。

建置與檢查指令另見上層專案 README；本資料夾可直接部署。
