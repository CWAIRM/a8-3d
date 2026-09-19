# 📸 拍照級畫面（js/photo.js）用到的第三方程式庫

全部 MIT 授權、已 vendor 進 `lib/pathtracer/`，執行時不連網。第一次按下「📸 拍照級畫面」才載入（約 0.5 MB），不影響開頁速度。
沒有用到任何外部圖片、模型或貼圖素材。

| 檔案 | 來源 | 版本 | 授權 |
|---|---|---|---|
| `lib/pathtracer/three-gpu-pathtracer.module.js` | https://github.com/gkjohnson/three-gpu-pathtracer （npm `three-gpu-pathtracer`, `build/index.module.js`） | 0.0.24（2026-02-21，npm 目前最新） | MIT，`lib/pathtracer/LICENSE-three-gpu-pathtracer.txt` |
| `lib/pathtracer/three-mesh-bvh.module.js` | https://github.com/gkjohnson/three-mesh-bvh （npm `three-mesh-bvh`, `build/index.module.js`） | 0.9.15（2026-09-09，npm 目前最新） | MIT，`lib/pathtracer/LICENSE-three-mesh-bvh.txt` |
| `lib/postprocessing/Pass.js` | three.js r169 `examples/jsm/postprocessing/Pass.js`（原封不動；lighting 組也放了一份，內容逐位元相同） | r169 | MIT（同 three.js） |

## 對 vendored 檔案做過的修改

每一處都在原始碼裡用 `(vendored patch)` 標記，搜尋這個字就找得到。

`three-gpu-pathtracer.module.js`
1. （2026-09-19 撤銷）原本把 `from 'three-mesh-bvh'` 改成 `from './three-mesh-bvh.module.js'`；現在恢復原樣，改由頁面的 import map 對應 `three-mesh-bvh`（本機指向 `lib/pathtracer/`，claude.ai 版指向 jsDelivr 同版本）
2. `import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'` → `from 'three/addons/postprocessing/Pass.js'`（經 import map 解析到 `lib/postprocessing/Pass.js`）
3. 移除 `//# sourceMappingURL=` 那一行（不附 .map 檔）
4. `PathTracingSceneGenerator.generate()` 的 BVH 選項 `maxLeafTris: 1` → `targetLeafSize: 1`（three-mesh-bvh 0.9 已把舊名字標為 deprecated，會在 console 印警告；行為相同）
5. `PathTracingRenderer.compileMaterial()`：編譯前先綁定路徑追蹤用的 render target。three.js 的 shader 版本會依「畫到畫布」或「畫到 render target」而不同（色調映射／色彩空間），不綁定的話這支很大的 shader 會被編譯兩次。
6. **薄的清玻璃：間接光線直接穿過**（主迴圈，`photoIsClearGlass()`）。原版對「光線穿過玻璃」使用玻璃透射的機率密度去算 MIS 權重，於是窗外的天空／太陽被「直接光取樣」和「反彈光線打到」各算一次（偏亮），而且小而亮的光源會變成白色亮點（firefly）。改成：已經反彈過的光線碰到薄、清、沒有貼圖的玻璃時，跟陰影光線一樣直接穿過（乘上玻璃顏色），MIS 權重沿用上一次真正的反彈。相機直接看出去的光線不受影響，玻璃的反光照樣有。
7. **窗口光源（window portal）**：新增 uniform `photoPortals`、`RenderState.throughGlass`、全域 `photoEnvShadow`。`photoPortals = 1` 時，天空經由清玻璃照進室內的光改由 photo.js 放在每扇窗室內側的面光源提供，所以 (a) 環境光的直接取樣光線碰到清玻璃就算被擋、(b) 穿過清玻璃後逃到天空的反彈光線不再加環境光 ── 避免重複計算。沒有玻璃的開口（陽台、俯瞰時拿掉的屋頂）不受影響。預設 0＝跟原版行為相同。
8. **防 NaN**：(a) 取樣到的反彈方向若是 NaN 就結束這條路徑（薄玻璃在很斜的角度折射會「全反射」，`refract()` 回傳 0 向量，`normalize(0)` ＝ NaN）；(b) 每個像素這一輪的結果若含 NaN／Inf 就當作 0，不加進平均。原版遇到時，累積圖上那個像素會永遠是 NaN（畫面上一個黑點，經過降噪會擴散成黑色方塊）。實測 次浴廁 視角 13 次取樣內出現 22 個 NaN 像素，修正後 0 個。

9. **頂點色合併的錯誤**（`mergeGeometries()`）：把「有 RGB 頂點色」和「有 RGBA 頂點色」的物件合併成一個大幾何時，原版的迴圈方向寫反了（從合併結果抄回原物件、索引範圍也不對），那些物件的顏色變成 0 ＝ 全黑。手機畫質的家具為了省效能，用「頂點色＋共用材質」把同一間房的家具併在一起，就會踩到（實測：手機畫質拍照時沙發整座變黑，而且看載入順序時好時壞）。改成：合併後的顏色一律是 RGBA 浮點數，逐點正確複製，缺第四個值就補 1。

10. **材質貼圖陣列的反向參照**（`RenderTarget2DArray` 建構子）：在它的 `texture` 上掛 `renderTarget2DArray = this`。
    photo.js 離開拍照模式時要把整個 render target 丟掉（`dispose()`）；原版只拿得到貼圖，只丟貼圖的話 three 不會釋放
    那份 GL 貼圖（實測每拍一次就多留一張，電腦畫質約 119 MB、手機約 48 MB）。只加一個欄位，引擎本身行為不變。

`three-mesh-bvh.module.js`
1. 只移除 `//# sourceMappingURL=` 那一行；它本身只 import `three`，不需要改路徑。

## 版本相容性怎麼選的
- three-gpu-pathtracer 0.0.24 的 package.json 寫 `three >= 0.180`，但和 0.0.23（`three >= 0.151`）的原始碼差異只有材質索引快取、alphaMap 變換、環境光強度歸零、`dispose()` 修正——沒有用到 r180 之後才有的 three API；實際在本站的 three r169 上跑通（見報告截圖，console 無錯誤）。
- three-mesh-bvh 0.9.15 內建 `REVISION >= 169` 的分支，是 0.0.24 開發時搭配的版本系列（devDependencies `^0.9.5`）。
- 沒有用到 `xatlas-web`（那是它的 UV 展開範例才需要的 peer dependency）。
