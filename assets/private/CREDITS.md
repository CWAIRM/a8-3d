# assets/private — 私領域家具使用的素材出處

## 3D 模型（Poly Haven，授權 CC0：公眾領域、可商用、免署名）

下載的是 1k glTF 版（API `https://api.polyhaven.com/files/<id>`，需帶瀏覽器 User-Agent），
在站外用 `@gltf-transform/cli` 做 `simplify`（減面）→ `resize`（縮貼圖）→ `webp`（貼圖轉 WebP，品質 82）
合併成單一 .glb（沒有 Draco / meshopt 壓縮，loader 直接讀）。

| 檔案 | Poly Haven 素材 | 來源 | 用在哪 | 減面比／誤差／貼圖 | 大小 |
|---|---|---|---|---|---|
| potted_plant_02.glb | `potted_plant_02` | https://polyhaven.com/a/potted_plant_02 | 主臥室、臥室二、臥室三的落地盆栽 | 0.3 ／ 0.0015 ／ 1024（只剩葉子貼圖） | 350 KB |
| potted_plant_04.glb | `potted_plant_04` | https://polyhaven.com/a/potted_plant_04 | 床頭櫃、矮櫃、書桌上的小多肉 | 0.12 ／ 0.02 ／ 512 | 174 KB |
| hanging_picture_frame_01.glb | `hanging_picture_frame_01` | https://polyhaven.com/a/hanging_picture_frame_01 | 四幅掛畫（畫面換成程式畫的無印幾何圖案、玻璃片拿掉） | 0.6 ／ 0.0015 ／ 512 | 101 KB |
| ceramic_vase_01.glb | `ceramic_vase_01` | https://polyhaven.com/a/ceramic_vase_01 | 前室高櫃頂上的花瓶 | 0.3 ／ 0.0015 ／ 512 | 152 KB |

原始下載檔 URL 形如 `https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/<id>/<id>_1k.gltf`。
模型合計約 0.8 MB（本資料夾含 Reflector.js 共約 0.8 MB）。

站外再修過的檔案：
- `potted_plant_02`（2026-09-19，用 `@gltf-transform/core` 4.5 的小腳本，沒有壓縮）：
  盆裡的碎石土網格（`potted_plant_02_dirt`，一盆約 1.2 萬個三角形、388 KB）刪掉，
  換成一片 24 邊的圓形土面（節點 `potted_plant_02_soil`，位置／半徑取原碎石土外框）；
  盆子材質的三張貼圖（程式本來就會換成白色霧面陶盆）刪掉；prune + dedup。961 KB → 350 KB。

執行時的修改（程式裡做）：
- `potted_plant_02`：盆子、土面改用程式的共用材質（白色霧面陶／深褐土）；葉子色調稍微偏橄欖。
- `hanging_picture_frame_01`：畫面貼圖換成程式畫的圖案，玻璃片移除。

## 程式碼

| 檔案 | 出處 | 授權 |
|---|---|---|
| Reflector.js | three.js r169 `examples/jsm/objects/Reflector.js`（原檔未改） | MIT（three.js authors） |

用途：電腦版（QUALITY 'high'）主浴洗手台鏡與主臥穿衣鏡的真實反射，只有人站在同一間房、鏡子前 5 m 內才開；
貼圖尺寸跟著畫面走（繪圖緩衝尺寸、長邊上限 1600），並用 scissor 只畫鏡子在畫面上那一塊。
手機版（'low'）檔案仍會被 import（7 KB），但不建立反射鏡；手機與電腦的底層都是程式裡的「反射探針」鏡
（CubeCamera 拍一次環景＋房間盒子視差校正，沒有外部檔案）。

## 其餘

床、床品（羽絨被、床旗、枕頭）、床頭櫃、矮櫃、衣櫃、前室高櫃、書桌、椅子、燈具、
所有衛浴設備（浴缸、馬桶、洗手台、淋浴組、五金、毛巾）與亞麻／粗織／羊毛／橡木紋／馬賽克磚／掛畫圖案貼圖，
全部是程式在瀏覽器裡現做的，沒有外部檔案。

## 曾經用過、已移除

`side_table_01`（顏色偏橘紅，換成程式做的淺橡木床頭櫃）、`drawer_cabinet`（黑鐵架工業風，換成橡木高櫃）、
`wicker_basket_02`（太小又帶著一片斜靠的蓋子，換成程式做的洗衣籃；洗衣籃後來也拿掉 —— 前室照參考圖保持空曠）。
