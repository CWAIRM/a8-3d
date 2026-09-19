# assets/arch — 建築部分使用的素材出處

全部來自 Poly Haven，授權 CC0（公眾領域，可商用、免署名）。
下載的是 1k JPG 版，重新壓縮後放在 `lib/tex/`。

| 檔案（lib/tex/） | Poly Haven 素材 | 來源 | 用途 |
|---|---|---|---|
| oak_Diffuse.jpg / oak_nor_gl.jpg / oak_arm.jpg | `laminate_floor_02`（1.7 m × 1.7 m，長條淺橡木板，板寬約 0.19 m） | https://polyhaven.com/a/laminate_floor_02 | 臥室／客餐廳／走道／前室 木地板（材質色調再偏暖一點） |
| stone_Diffuse.jpg / stone_nor_gl.jpg / stone_arm.jpg | `marble_01`（1.5 m × 1.5 m，大片石材磚） | https://polyhaven.com/a/marble_01 | 浴室地板＋磁磚牆、廚房、陽台（材質色調調成暖灰） |
| wall_nor_gl.jpg（原本就有） | `white_plaster_02` 或同類 plaster 法線圖（沿用原站既有檔） | https://polyhaven.com | 油漆牆細微凹凸 |

API：`https://api.polyhaven.com/files/<id>`（需帶瀏覽器 User-Agent）。
其餘牆頂炭黑切面、柱子斑點、門片橡木紋、天空漸層都是程式在瀏覽器裡用 canvas 現算的，沒有外部檔案。
