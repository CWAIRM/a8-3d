# 燈光／後製（js/lighting.js）用到的外部檔案

沒有新增任何圖片、模型或貼圖素材。只從 three.js r169 官方範例原封不動複製了下面 6 個後製模組到 `lib/`
（跟 `lib/three.module.js` 同一版；逐檔與 jsdelivr 上的原檔比對過，位元組完全相同）。

| 檔案（lib/ 底下） | 來源 | 授權 |
|---|---|---|
| postprocessing/GTAOPass.js | https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/postprocessing/GTAOPass.js | MIT（three.js） |
| postprocessing/UnrealBloomPass.js | https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/postprocessing/UnrealBloomPass.js | MIT（three.js） |
| postprocessing/Pass.js | https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/postprocessing/Pass.js | MIT（three.js） |
| shaders/GTAOShader.js | https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/shaders/GTAOShader.js | MIT（three.js） |
| shaders/PoissonDenoiseShader.js | https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/shaders/PoissonDenoiseShader.js | MIT（three.js） |
| shaders/LuminosityHighPassShader.js | https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/shaders/LuminosityHighPassShader.js | MIT（three.js） |

它們另外會用到 `lib/` 裡原本就有的 `shaders/CopyShader.js`、`math/SimplexNoise.js`（同樣是 three r169 範例）。
對這些模組的調整（去雜訊的邊界判斷、泛光的亮度上限）都是在 `js/lighting.js` 執行時改寫 shader 字串，檔案本身沒有動。
