# assets/public — 公共區家具使用的素材出處

全部來自 Poly Haven，授權 CC0（公眾領域，可商用、免署名）。
API：`https://api.polyhaven.com/files/<id>`（要帶瀏覽器 User-Agent）。
模型下載 1k glTF 版，在站外用 `@gltf-transform`（weld / simplify / resize）合併成單一 .glb；
**沒有**用 Draco / meshopt / 量化壓縮（網站的 GLTFLoader 不需要任何解碼器）。貼圖 1k JPG 縮成 512 再存 JPG（q82）。

## 模型（assets/public/models/）

| 檔案 | Poly Haven 素材 | 來源 | 用途／處理 |
|---|---|---|---|
| potted_plant_01_foliage.glb（1.12 MB） | `potted_plant_01` | https://polyhaven.com/a/potted_plant_01 | 客廳花架盆栽、客廳／餐廳交界的高盆栽、茶几與餐桌上的小盆栽。**只留枝幹＋葉子**：原本的陶甕盆（5.4k 面）與鵝卵石（5.7 萬面）拿掉，白色圓筒盆與土在程式裡做（目標圖都是白盆）。葉子原 10.7 萬面 → 一個檔裡放三份：`leaves_hi` 1.49 萬面（電腦版大盆栽）、`leaves_lo` 7.1 千面（手機版大盆栽）、`leaves_xs` 2.5 千面（桌上 0.3 m 的小盆栽）；枝幹兩份：`stem` 1.75 千面、`stem_xs` 556 面。三份葉子共用同一組貼圖。`leaves_xs` 不是減面（每簇葉子有邊界與 UV 接縫，meshoptimizer 減到 6.2 千面就停了），而是**疏葉**：從 `leaves_lo` 的 211 簇葉子依高度排序、每 3 簇留 1 簇（61 簇），每簇以自己的中心放大 1.3 倍補回面積。葉子貼圖是 JPG 沒有透明度，alphaMode 由 MASK 改 OPAQUE（省掉 alpha test）；枝幹用不到的法線／粗糙度貼圖拿掉。處理腳本（站外）：`o5/gt/plant01_lod3.mjs`（@gltf-transform + meshoptimizer 減面、sharp 縮貼圖 512） |
| ceramic_vase_01.glb（68 KB） | `ceramic_vase_01` | https://polyhaven.com/a/ceramic_vase_01 | 白瓷花瓶 ×3（電視櫃、餐桌、玄關櫃）。simplify 到 15%，貼圖 256 |
| hanging_picture_frame_01.glb（112 KB） | `hanging_picture_frame_01` | https://polyhaven.com/a/hanging_picture_frame_01 | 餐廳 L 牆與走道北牆的簡約掛畫 ×2。站外處理（`o5/gt/frame_clean.mjs`）：玻璃層整片拿掉（轉 JPG 後沒有透明度，本來就不畫）；示意海報的三張貼圖拿掉、只留它的 UV（海報面在程式裡換成 canvas 畫的極簡版畫）；畫框本體減面 2,582 → 1,054 面。193 KB → 112 KB |

## 貼圖（assets/public/tex/）

| 檔案 | Poly Haven 素材 | 來源 | 用途／處理 |
|---|---|---|---|
| oak_veneer_01_diff.jpg / _nor.jpg / _rough.jpg | `oak_veneer_01`（1 m × 1 m 橡木薄片） | https://polyhaven.com/a/oak_veneer_01 | 全部橡木家具（沙發腳、茶几、電視櫃、花架、餐桌椅、玄關櫃、廚櫃門片）。diff 從 1k 原圖縮 512，整體底色換成目標圖的淺蜜色（平均 sRGB 181,161,137）、木紋對比收到 ×0.6（腳本 `o5/r3/oaktex.py`）；對照目標圖取樣：14:00 餐桌面 rgb(211,186,157) ↔ 目標 rgb(209,183,154) |
| rough_linen_nor.jpg | `rough_linen`（只用法線圖） | https://polyhaven.com/a/rough_linen | 沙發、抱枕、桌旗、餐椅坐墊的亞麻織紋（顏色由材質給，不用它的藍色 diffuse） |
| wool_boucle_nor.jpg | `wool_boucle`（只用法線圖） | https://polyhaven.com/a/wool_boucle | 客廳地毯的圈絨織紋（地毯底色是程式畫的 canvas 兩色地毯；它的 diffuse 是格紋，沒有用、已刪） |

其餘（L 型沙發、茶几、電視櫃、電視、落地燈、花架、餐桌、弧背餐椅、吊燈、玄關櫃、圓鏡、DD 電箱、
整組廚具與檯面小物、冰箱、洗衣機、洗衣槽、AC 室外機、白瓷盆）都是程式用 RoundedBox／Cylinder／Torus／
Tube／Extrude 拼出來的；地毯、電視畫面、兩張版畫、鏡面假反射、電箱門都是 canvas 現畫的，沒有外部檔案。

總量：模型 3 檔 1.30 MB ＋ 貼圖 5 檔 0.18 MB ≈ **1.48 MB**（上限 10 MB）。
（2026-09-19 修正版：盆栽檔多了一份疏葉版 +0.11 MB、畫框檔 −0.08 MB。手機不載三張法線圖。）
