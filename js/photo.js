/* ============================================================
   photo.js — 「📸 拍照級畫面」模式
   把「目前這一格畫面」交給路徑追蹤（path tracing：光線真的在房間裡一條一條彈跳），
   慢慢累積成接近照片的品質：柔和的日光、真的會互相反射的牆面與地板、角落自然變暗。

   介面（main.js 用）：{ available, active, enter(), exit(), render(), resize(w,h) }
     - available：這台裝置跑得動才 true（main.js 依此顯示按鈕）
     - enter()  ：凍結目前相機，開始累積取樣（第一次會先載入引擎 ~0.5 MB）
     - exit()   ：回到一般即時畫面（✕ 按鈕／Esc／main.js 換模式、換房間、換時間都會叫）
     - render() ：active 期間 main.js 每格改叫這個，不再叫 lighting.render()
     - resize() ：視窗大小改變（main.js 已先更新 camera.aspect 與畫布大小）

   流程（每次按下 📸）：
     1. 先用一般畫面量一次「亮度與色調」（之後的照片自動曝光／白平衡以它為準，跟即時畫面一致）
     2. 把場景交給引擎：天空圓頂 → 全景天空光、太陽 → 遠處的圓形面光源（影子柔）、
        假的窗光／假影子／標籤先藏起來、玻璃換成真的透光玻璃
     3. 另外畫兩張「參考圖」（每個像素的材質顏色、法線與距離），給降噪用
     4. 每格畫幾小塊（tile）路徑追蹤；每多一輪取樣就降噪一次再顯示
        降噪：先把材質顏色除掉只剩「光」，對光做保邊模糊，再乘回材質 → 木紋、石紋不會糊掉
     5. 顯示：曝光（對齊即時畫面的平均亮度，最亮 2% 有上限）→ 高光肩部（窗邊、陽光照到的地方不死白）→ 跟即時畫面同一種色調映射
     離開時把引擎整個丟掉（GPU／JS 記憶體還回去；下次按 📸 重建，約 1–2 秒）

   ⚠️ 讀回像素一律走 syncRead()（先解除 PIXEL_PACK_BUFFER 綁定再讀、讀完檢查錯誤）── 見那裡的說明
   網址加 ?debug 會在 console 印每一次的場景資訊與耗時（平常不印）

   引擎：three-gpu-pathtracer 0.0.24 + three-mesh-bvh 0.9.15（lib/pathtracer/，修改處見 assets/photo/CREDITS.md）
   ============================================================ */
import * as THREE from 'three';

const LIB_URL = '../lib/pathtracer/three-gpu-pathtracer.module.js';   // 第一次按下才載入，不拖慢開頁

export default async function buildPhoto(ctx){
  const { scene, camera, renderer, QUALITY } = ctx;
  const LOW = QUALITY === 'low';

  /* ---------- 0. 這台裝置跑得動嗎？（WebGL2 + 能把浮點數畫進貼圖） ---------- */
  const gl = renderer.getContext();
  const caps = renderer.capabilities;
  const canFloatTarget = !!gl.getExtension('EXT_color_buffer_float');
  const available = !!(caps.isWebGL2 && canFloatTarget && caps.maxTextures >= 16 && !/[?&]photo=0/.test(location.search));
  const stub = { available:false, active:false, enter(){}, exit(){}, render(){}, resize(){} };
  if(!available) return stub;

  /* ---------- 1. 畫質設定：桌機吃滿、手機省著跑 ----------
     maxPx    ：路徑追蹤的解析度上限（像素數；以 CSS 像素為準，Retina 不再 ×2）
     tilePx   ：每一小塊的像素數（一格畫面至少畫一塊；塊越小，畫面越不卡）
     bounces  ：光線最多彈幾次（室內靠多次反射才亮，但每多一次就慢一點）
     target   ：進度條「算完」的取樣數；cap：之後繼續精修到這個數就停，省電
     texSize  ：材質貼圖交給引擎時的邊長 */
  const CFG = LOW
    ? { maxPx: 300e3, tilePx: 50e3,  bounces: 4, trans: 4, texSize: 512,  target: 48,  cap: 256,  maxLamps: 4 }
    : { maxPx: 1.2e6, tilePx: 140e3, bounces: 5, trans: 5, texSize: 768,  target: 128, cap: 2000, maxLamps: 8 };

  /* ---------- 2. 介面（純 DOM，不動 index.html） ---------- */
  const css = document.createElement('style');
  css.textContent = `
    #photo-ui{position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:30;display:none;
      flex-direction:column;align-items:center;gap:10px;pointer-events:none;font-family:inherit}
    #photo-ui .ph-card{pointer-events:auto;background:rgba(14,18,26,.86);border:1px solid rgba(255,255,255,.16);
      border-radius:14px;padding:12px 18px;min-width:280px;max-width:min(92vw,420px);backdrop-filter:blur(10px);
      color:#fff;font-size:13.5px;line-height:1.7;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.35)}
    #photo-ui .ph-msg b{color:#f6d7a8;font-variant-numeric:tabular-nums}
    #photo-ui .ph-sub{font-size:11.5px;color:#93a3b8;margin-top:2px}
    #photo-ui .ph-track{height:4px;border-radius:2px;background:#1e2633;overflow:hidden;margin:9px 0 10px}
    #photo-ui .ph-bar{height:100%;width:0;background:#f2b35b;transition:width .25s}
    #photo-ui .ph-btns{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
    #photo-ui button{font-family:inherit;font-size:13px;cursor:pointer;border-radius:9px;padding:8px 14px;
      border:1px solid rgba(255,255,255,.18);background:#1d2532;color:#dbe6f3}
    #photo-ui button:hover{background:#2c3a4e}
    #photo-ui button.ph-save{background:#3b82f6;border-color:#60a5fa;color:#fff;font-weight:600}
    #photo-ui button.ph-save:disabled{opacity:.45;cursor:default}
    @media (max-width:760px){#photo-ui{bottom:auto;top:12px;left:12px;right:128px;transform:none}
      #photo-ui .ph-card{min-width:0;width:100%;box-sizing:border-box;padding:10px 12px;font-size:12.5px}
      #photo-ui button{padding:7px 10px;font-size:12.5px}}
  `;
  document.head.appendChild(css);
  const ui = document.createElement('div'); ui.id = 'photo-ui';
  ui.innerHTML = `
    <div class="ph-card">
      <div class="ph-msg">📸 正在載入拍照引擎…</div>
      <div class="ph-sub">畫面會先有點顆粒，越等越乾淨</div>
      <div class="ph-track"><div class="ph-bar"></div></div>
      <div class="ph-btns"><button class="ph-save" disabled>💾 存成圖片</button><button class="ph-exit">✕ 離開拍照</button></div>
    </div>`;
  document.body.appendChild(ui);
  const msgEl = ui.querySelector('.ph-msg'), subEl = ui.querySelector('.ph-sub'), barEl = ui.querySelector('.ph-bar');
  const saveBtn = ui.querySelector('.ph-save'), exitBtn = ui.querySelector('.ph-exit');
  const setMsg = (html, sub) => { msgEl.innerHTML = html; if(sub != null) subEl.textContent = sub; };

  /* ---------- 3. 狀態 ---------- */
  // _dbg：只給自動測試調整用（正式使用都是預設值）；log：網址加 ?debug 才在 console 印進度
  const DBG = { denoise: true, autoExpose: true, bounces: null, sunHalfAngle: 2.5, exposureBias: 1.0, wbStrength: 0.8,
                maxPx: null, maxLamps: null, noSun: false, texSize: null, defines: null, portals: true, skyPull: 0.6, env: null, sigL: null,
                hiCap: true, hiQ: 0.98, planarCaps: true, keepTracer: null, log: /[?&]debug\b/.test(location.search) };
  const log = (...a) => { if(DBG.log) console.log('[photo]', ...a); };
  const api = { available:true, active:false, enter, exit, render, resize,
                _samples: () => (pt && ready ? pt.samples : null), _perFrame: () => perFrame, _stats: () => stats, _dbg: DBG, _pt: () => pt,
                _readHDR: () => readHDR() };
  let lib = null;           // 動態載入的引擎模組
  let pt = null;            // WebGLPathTracer
  let ready = false;        // 場景已交給引擎、可以開始累積
  let session = 0;          // enter/exit 的序號（async 途中被 exit 就作廢）
  let wantStart = false;    // 進來時 #start 開場框本來要顯示（離開時還原）
  let lastShown = -1, paused = false, restartPending = false, holdMsgUntil = 0;
  let perFrame = 1, goodFrames = 0, slowFrames = 0, lastT = 0, grid = 2, fence = null, waitFrames = 0;
  let tCompile = 0, tEnter = 0, lastDenoiseT = 0, denoiseMs = 0, denoisedAt = -1;
  let roofAtEnter = null;
  const camAtEnter = new THREE.Matrix4();
  const stats = {};          // 給測試看的數字（曝光、白平衡、解析度…）
  const startEl = document.getElementById('start');
  const photoBtn = document.getElementById('m-photo');

  /* ---------- 4. 小工具：全螢幕四邊形、render target ---------- */
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene(); quadScene.add(quad);
  const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  function pass(mat, target){
    quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, quadCam);
  }
  /* 同步讀回像素（存圖、第一次測光）。
     ⚠️ three r169 的非同步讀回（readRenderTargetPixelsAsync）在 GPU 做完之前會一直把 PIXEL_PACK_BUFFER 綁著，
        這段時間任何同步讀回都會失敗、讀到全 0（→ 存出全透明的 PNG；測光拿到 null → 整輪曝光停在 1、畫面偏暗）。
        所以讀之前先解除綁定：非同步那邊的像素早就寫進它自己的緩衝區，之後它會自己重新綁定再取回，不受影響。
        讀完再問一次 GL 有沒有報錯，失敗就回 false（呼叫的人會重試或顯示錯誤，不會把空白當成功） */
  function syncRead(target, w, h, buf){
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    for(let i = 0; i < 8 && gl.getError() !== gl.NO_ERROR; i++);     // 清掉之前留下、不屬於這次的錯誤
    renderer.readRenderTargetPixels(target, 0, 0, w, h, buf);
    return gl.getError() === gl.NO_ERROR;
  }
  function rt(w, h, opt = {}){
    return new THREE.WebGLRenderTarget(w, h, Object.assign({ type: THREE.HalfFloatType, format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false }, opt));
  }
  const saveGL = () => ({ t: renderer.getRenderTarget(), ac: renderer.autoClear, cc: renderer.getClearColor(new THREE.Color()),
                           ca: renderer.getClearAlpha(), tm: renderer.toneMapping, bg: scene.background, ov: scene.overrideMaterial });
  const loadGL = s => { renderer.setRenderTarget(s.t); renderer.autoClear = s.ac; renderer.setClearColor(s.cc, s.ca);
                        renderer.toneMapping = s.tm; scene.background = s.bg; scene.overrideMaterial = s.ov; };

  /* ---------- 5. 天空：做成引擎吃的全景圖（equirect，半精度浮點） ----------
     依序找：lighting 模組的天空圓頂（uniform 顏色＋太陽方向）→ arch 的頂點色圓頂 → 背景色。
     太陽圓盤本身不畫進天空（太陽另外是一顆面光源），只留太陽旁邊那圈暈。 */
  function skyModel(){
    const dome = (ctx.lighting && ctx.lighting.sky) || ctx.skyDome;
    const U = dome && dome.material && dome.material.uniforms;
    const out = new THREE.Color();
    if(U && U.uZenith && U.uHorizon){
      const zen = U.uZenith.value.clone(), hor = U.uHorizon.value.clone(), gnd = (U.uGround || U.uHorizon).value.clone();
      const sd = U.uSunDir ? U.uSunDir.value.clone().normalize() : new THREE.Vector3(0, 1, 0);
      const sc = U.uSunCol ? U.uSunCol.value.clone() : new THREE.Color(1, 1, 1);
      const glow = U.uGlow ? U.uGlow.value : 0;
      const k = 0.6 + 0.4 * (1 - Math.min(1, Math.max(0, sd.y * 2)));
      return d => {
        const y = d.y;
        if(y >= 0) out.copy(hor).lerp(zen, Math.pow(y, 0.55)); else out.copy(hor).lerp(gnd, Math.min(1, -y * 6));
        const ca = d.x * sd.x + d.y * sd.y + d.z * sd.z;
        const g = Math.pow(Math.max(ca, 0), 8) * k * glow;
        return out.setRGB(out.r + sc.r * g, out.g + sc.g * g, out.b + sc.b * g);
      };
    }
    const sky = ctx.sky;
    if(sky && sky.geometry && sky.geometry.attributes.color){
      const pos = sky.geometry.attributes.position, cl = sky.geometry.attributes.color;
      let R = 0; for(let i = 0; i < pos.count; i++) R = Math.max(R, Math.abs(pos.getY(i)));
      const rings = new Map();   // 高度角 → 平均顏色
      for(let i = 0; i < pos.count; i++){
        const k = Math.round(pos.getY(i) / R * 1000) / 1000;
        let r = rings.get(k); if(!r){ r = [0, 0, 0, 0]; rings.set(k, r); }
        r[0] += cl.getX(i); r[1] += cl.getY(i); r[2] += cl.getZ(i); r[3]++;
      }
      const ramp = [...rings.entries()].map(([e, r]) => ({ e, c: [r[0] / r[3], r[1] / r[3], r[2] / r[3]] })).sort((a, b) => a.e - b.e);
      return d => {
        const e = d.y;
        if(e <= ramp[0].e) return out.setRGB(...ramp[0].c);
        for(let i = 1; i < ramp.length; i++) if(e <= ramp[i].e){
          const a = ramp[i - 1], b = ramp[i], t = (e - a.e) / Math.max(1e-6, b.e - a.e);
          return out.setRGB(a.c[0] + (b.c[0] - a.c[0]) * t, a.c[1] + (b.c[1] - a.c[1]) * t, a.c[2] + (b.c[2] - a.c[2]) * t);
        }
        return out.setRGB(...ramp[ramp.length - 1].c);
      };
    }
    const bg = scene.background && scene.background.isColor ? scene.background.clone() : new THREE.Color(0xe8e3da);
    return () => out.copy(bg);
  }
  function makeSkyTexture(model){
    const W = 256, H = 128, data = new Uint16Array(W * H * 4), d = new THREE.Vector3(), h = THREE.DataUtils.toHalfFloat;
    let sum = 0;
    for(let j = 0; j < H; j++){
      const phi = (1 - (j + 0.5) / H) * Math.PI;           // 引擎慣例：第 0 列＝正下方、最後一列＝天頂
      for(let i = 0; i < W; i++){
        const th = ((i + 0.5) / W - 0.5) * 2 * Math.PI;
        d.set(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
        const c = model(d), o = (j * W + i) * 4;
        data[o] = h(c.r); data[o + 1] = h(c.g); data[o + 2] = h(c.b); data[o + 3] = h(1);
        if(d.y > 0) sum += (c.r + c.g + c.b) / 3;
      }
    }
    const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    t.needsUpdate = true;
    t.userData.upperMean = sum / (W * H / 2);
    return t;
  }

  /* ---------- 6. 材質翻譯（只在交給引擎的那一瞬間換，交完馬上換回來） ----------
     - 清玻璃／霧玻璃（即時畫面用半透明假裝）→ 真的透光玻璃（薄片、不偏折）
     - 燈罩（ctx.emissives 裡 kind:'lamp'）→ 外觀不變、但不擋光（燈泡的光才照得出來）
     - 鏡子（three 的 Reflector）→ 真的鏡面
     - MeshBasic：地面底盤 → 會受光的地面；登記過的發光材質／其他 → 自發光（保持原本「不受光」的樣子）
     - Lambert／Phong／Toon → Standard；Standard／Physical 原樣送進去（貼圖、重複次數、法線圖都支援） */
  const twins = new Map();
  const emissiveKind = new Map();   // 材質 → 'lamp' | 'screen'
  const WHITE = new THREE.Color(0xffffff);
  // Standard → Physical（Physical.copy 只能吃 Physical，Standard 要用 Standard 的 copy 才不會讀到不存在的欄位）
  function toPhysical(m){
    const t = new THREE.MeshPhysicalMaterial();
    if(m.isMeshPhysicalMaterial) t.copy(m); else THREE.MeshStandardMaterial.prototype.copy.call(t, m);
    return t;
  }
  function isGlassy(m){ return m.isMeshStandardMaterial && m.transparent && m.opacity < 0.75 && !m.map && !m.alphaMap; }
  /* 淋浴間的玻璃（固定隔屏＋玻璃門）：真的清玻璃在照片裡幾乎看不見，只剩鉸鏈和把手浮在空中（即時畫面是一片淡淡的玻璃）。
     所以這幾片（只有這幾片，窗戶照舊）留一點看得出來的樣子：透光 90%，剩下的 10% 是玻璃面自己被照亮的那一層薄霧，
     跟即時畫面「半透明的一片」同一個道理 */
  let showerGlass = null, birdNow = false;
  function isShowerGlass(o){
    if(!showerGlass){
      showerGlass = { rects: (ctx.archWalls || []).filter(w => w.glass).map(w => w.axis === 'x' ? [w.a, w.c0, w.b, w.c1] : [w.c0, w.a, w.c1, w.b]),
                      leaves: new Set((ctx.doors || []).filter(d => d.type === 'shower' && d.leaf).map(d => d.leaf)) };
    }
    for(let q = o; q; q = q.parent) if(showerGlass.leaves.has(q)) return true;
    _bb.setFromObject(o).getCenter(_c);
    return showerGlass.rects.some(r => _c.x >= Math.min(r[0], r[2]) - 0.02 && _c.x <= Math.max(r[0], r[2]) + 0.02 && _c.z >= Math.min(r[1], r[3]) - 0.02 && _c.z <= Math.max(r[1], r[3]) + 0.02);
  }
  // 貼圖的平均顏色（縮成 8×8 讀回來；只在交給引擎時算一次、記住）。讀不到（還沒載入、特殊格式）就回 null
  const texAvgCache = new Map();
  function texAvg(tex){
    if(!tex) return [1, 1, 1];
    if(texAvgCache.has(tex.uuid)) return texAvgCache.get(tex.uuid);
    let out = null;
    try{
      const img = tex.image;
      if(img && (img.width || img.videoWidth) && !(img.data)){
        const cv = document.createElement('canvas'); cv.width = cv.height = 8;
        const c2 = cv.getContext('2d', { willReadFrequently: true }); c2.drawImage(img, 0, 0, 8, 8);
        const d = c2.getImageData(0, 0, 8, 8).data, srgb = tex.colorSpace === THREE.SRGBColorSpace, acc = [0, 0, 0];
        for(let i = 0; i < d.length; i += 4) for(let k = 0; k < 3; k++){ const v = d[i + k] / 255; acc[k] += srgb ? (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)) : v; }
        out = acc.map(v => v / 64);
      }
    }catch(e){ out = null; }
    texAvgCache.set(tex.uuid, out);
    return out;
  }
  // 0～1：這個材質有多「淺色霧面」（粗糙度 0.7→0.9、反射率 0.15→0.5 各一條漸變相乘）；有粗糙度貼圖就用它的平均值
  function matteBright(m){
    if(!m.isMeshStandardMaterial) return 0;
    const ra = m.roughnessMap ? texAvg(m.roughnessMap) : [1, 1, 1];
    const ca = m.map ? texAvg(m.map) : [1, 1, 1];
    if(!ra || !ca) return 0;
    const rough = m.roughness * ra[1];                                  // 粗糙度在貼圖的 G 色版
    const alb = (0.2126 * m.color.r * ca[0] + 0.7152 * m.color.g * ca[1] + 0.0722 * m.color.b * ca[2]);
    return THREE.MathUtils.smoothstep(rough, 0.7, 0.9) * THREE.MathUtils.smoothstep(alb, 0.15, 0.5);
  }
  function twin(m, o){
    if(!m || Array.isArray(m)) return m;
    const glassy = m.isMeshStandardMaterial && (isGlassy(m) || (m.transmission > 0 && m.transparent));
    const shower = !!(glassy && o && o.isMesh && isShowerGlass(o));
    // 俯瞰時的小金屬件（陽台鋁百葉、窗框）：從上面看都只有幾個像素寬，亮面金屬反射太陽會變成一片閃爍的雜點 → 拍照版粗糙一點
    const birdMetal = birdNow && m.isMeshStandardMaterial && m.metalness > 0.5 && !m.metalnessMap && !m.roughnessMap && m.roughness < 0.6;
    const key = m.uuid + (o && o.isReflector ? '|mirror' : '') + (shower ? '|shower' : '') + (birdMetal ? '|bird' : '');
    const hit = twins.get(key);
    if(hit && hit.v === m.version && hit.op === m.opacity && hit.ei === m.emissiveIntensity) return hit.t;
    let t = null;
    if(o && o.isReflector){
      t = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, metalness: 1, roughness: 0.02 });
    }else if(m.isMeshStandardMaterial){
      const kind = emissiveKind.get(m);
      if(isGlassy(m) || (m.transmission > 0 && m.transparent)){
        t = toPhysical(m);
        t.transparent = false; t.opacity = 1; t.depthWrite = true;
        t.transmission = Math.max(m.transmission || 0, 0.95);
        t.ior = m.ior || 1.5; t.thickness = 0; t.attenuationDistance = Infinity;   // 薄片玻璃：不偏折，只做反射＋透光
        if(m.roughness < 0.2) t.roughness = 0;                                     // 清玻璃（引擎會讓間接光直接穿過）
        t.color.lerp(WHITE, shower ? 0.85 : 0.75);                                 // 真玻璃幾乎不吃色，只留一點點原本的色調
        if(shower) t.transmission = 0.9;                                           // 淋浴玻璃：10% 變成玻璃面自己的薄霧（看得出有一片玻璃）
        // ⚠️ 淋浴玻璃不要再加深色調：一片玻璃是一個 8 mm 的盒子＝前後兩個面，看浴缸要穿過兩片＝四個面，
        //    每個面乘一次色調，0.82 的色調四次方後只剩 0.45（實測浴缸正面變成深灰）
        t.side = THREE.DoubleSide;
      }else if(m.clearcoat > 0){
        // 亮面塗層（白瓷的釉）：引擎的 clearcoat 在「沒有切線」的幾何上會算出 NaN（整片變黑），
        // 改成一般的亮面材質：粗糙度取兩層中比較亮滑的那層，看起來一樣是有光澤的白瓷
        t = toPhysical(m);
        t.clearcoat = 0; t.roughness = Math.min(m.roughness, THREE.MathUtils.lerp(m.roughness, m.clearcoatRoughness ?? m.roughness, m.clearcoat));
      }else if(birdMetal){
        t = m.clone(); t.roughness = 0.6;
      }else if(kind === 'lamp'){
        // 燈罩：看起來照舊，但「不擋光」（引擎的 castShadow=false）→ 燈泡的光照得出來，燈罩本身照樣會亮
        t = m.clone(); t.castShadow = false; t.transparent = false; t.opacity = 1;
      }else if(/artwork|poster|painting/i.test(m.name || '') && !(m.metalness > 0.1) && !m.transparent){
        // 掛畫的畫面＝紙（霧面）。模型原本的粗糙度貼圖（平均 0.3，像上過亮光漆）是給它原本那張圖用的；
        // 畫面換成自己畫的圖之後還留著，真的光線會把窗戶的倒影整片映在畫上 → 畫的顏色被洗白（實測主臥掛畫）。
        // 拍照版當成霧面紙（即時畫面看不出差別，因為它沒有「窗戶倒影」）
        t = m.clone(); t.roughnessMap = null; t.metalnessMap = null; t.roughness = 1; t.metalness = 0; t.specularIntensity = 0.25;
      }else if(!(m.metalness > 0.1) && !m.transparent && !(m.transmission > 0) && matteBright(m) > 0){
        // 淺色霧面（油漆牆、紙、淺色布、地毯）：引擎的反光模型在粗糙度 0.9–1 時，斜斜看過去反光很強 ──
        // 實測主臥掛畫斜看時有 45% 的亮度是「窗戶的反光」，畫的顏色整片被洗白（即時畫面沒有這層反光）。
        // 所以反光強度打折（最多打到 0.25），顏色與漫射照舊。
        // ⚠️ 深色霧面（RC 柱的炭黑）不打折：它看起來「是深灰不是全黑」靠的就是這層反光（實測打折後柱子變成 RGB 8 的純黑）
        t = m.clone();
        t.specularIntensity = THREE.MathUtils.lerp(m.specularIntensity ?? 1, 0.25, matteBright(m));
      }
    }else if(m.isMeshBasicMaterial){
      if(ctx.lighting && ctx.lighting.ground && m === ctx.lighting.ground.material){
        t = new THREE.MeshStandardMaterial({ color: m.color, roughness: 1, metalness: 0 });
      }else{
        t = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: m.color, emissiveMap: m.map || null,
              emissiveIntensity: 1, roughness: 1, side: m.side, transparent: m.transparent, opacity: m.opacity,
              vertexColors: m.vertexColors, alphaMap: m.alphaMap || null, alphaTest: m.alphaTest });
      }
    }else if(m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial || m.isMeshMatcapMaterial){
      t = new THREE.MeshStandardMaterial({ color: m.color, map: m.map || null, emissive: m.emissive || 0x000000,
            emissiveMap: m.emissiveMap || null, emissiveIntensity: m.emissiveIntensity ?? 1, normalMap: m.normalMap || null,
            roughness: m.isMeshPhongMaterial ? 0.55 : 0.9, side: m.side, transparent: m.transparent, opacity: m.opacity,
            alphaMap: m.alphaMap || null, alphaTest: m.alphaTest, vertexColors: m.vertexColors });
    }
    if(!t) t = m;
    if(t !== m) t.name = (m.name || m.type) + ' (photo)';
    twins.set(key, { t, v: m.version, op: m.opacity, ei: m.emissiveIntensity });
    return t;
  }
  // 引擎追蹤不了、或本來就是「假裝」出來的東西：拍照時先藏起來（真的光線會自己算出影子與天空）
  function shouldHide(o){
    if(o.userData && o.userData.noPhoto) return true;
    if(o.isSprite || o.isPoints || o.isLine) return true;
    if(!o.isMesh) return false;
    if(o.isReflector) return false;
    const m = o.material;
    if(Array.isArray(m)) return false;
    if(!m || m.isShaderMaterial || m.isRawShaderMaterial || m.isShadowMaterial) return true;
    // 半透明的深色 MeshBasic ＝ 畫在地上的假接觸影
    if(m.isMeshBasicMaterial && m.transparent && (m.color.r + m.color.g + m.color.b) < 0.3) return true;
    return false;
  }

  /* ---------- 6b. 剖切：俯瞰時 lighting 用 three 的「切平面」把牆和家具切到腰高（像配置圖）----------
     引擎不支援切平面 → 交給引擎之前，把被切到的物件真的切開（只切「目前有效」的切平面；lighting 不切時會把平面推到 10 萬公尺高）。
     切口：lighting 替它掛了「切口分身」的物件（不透明、單面），這裡在切的高度蓋一片「真的平的蓋子」：
       把每個三角形被切出來、正好躺在切平面上的那一小段線收集起來 → 串成封閉的圈 → 三角化。
       ⛔ 不要改回「翻面的複本」當切口：那樣看進去的是物件內側的牆面，各面受光不同，0.8 m 的 RC 柱會像沒有蓋子的空盒子。
       串不成圈的（本來就不封閉的幾何）才退回翻面複本。
     切口顏色照 lighting 的規則：建築（牆、柱、窗框…）→ 炭灰、門片 → 門片自己的顏色、家具 → 淺米。
     這裡用「白天」的顏色，蓋子本身會受光（晚上自然就暗；lighting 的切口是不受光的平塗，所以它自己在晚上把顏色調暗）。
     CAP_LIT：蓋子朝上、整片吃到太陽＋天空，是整個畫面受光最強的面；照原色會比即時畫面的平塗亮將近 3 倍
     （實測 14:00 俯瞰：柱頂 RGB 95 對 56），所以反射率打 0.4 折 → 回到即時畫面／目標圖的炭灰（約 RGB 42–61） */
  const CAP_COLOR = { 7: 0x4c4b4a, 6: 0xe4ded3 };   // lighting 的「補切口」顏色（建築炭灰／家具淺米）
  const CAP_LIT = 0.4;
  const capMats = {};
  const capMatFor = hex => capMats[hex] || (capMats[hex] = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex).multiplyScalar(CAP_LIT), roughness: 0.9, metalness: 0 }));
  function livePlanes(m){
    const list = [];
    if(renderer.localClippingEnabled && m && m.clippingPlanes) for(const pl of m.clippingPlanes) if(Math.abs(pl.constant) < 1e4) list.push(pl);
    for(const pl of renderer.clippingPlanes || []) if(Math.abs(pl.constant) < 1e4) list.push(pl);
    return list;
  }
  function capColor(o, sib, layer){
    if(!sib) return layer ? CAP_COLOR[layer] : null;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const arch = new Set(Object.values(ctx.archMaterials || {}));
    if(mats.every(m => arch.has(m))) return CAP_COLOR[7];
    const leaves = new Set((ctx.doors || []).map(d => d.leaf).filter(Boolean));
    for(let p = o; p; p = p.parent) if(leaves.has(p)) return (!Array.isArray(o.material) && o.material.color) ? o.material.color.getHex() : sib.material.color.getHex();
    return CAP_COLOR[6];
  }
  const _bb = new THREE.Box3(), _c = new THREE.Vector3();
  function cutMeshes(hidden, added, temp){
    const todo = [];
    scene.traverseVisible(o => {
      if(!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if(!mats.some(m => livePlanes(m).length)) return;
      _bb.setFromObject(o);
      // 整個都在留下來的那一側 → 不用切
      const planes = [...new Set(mats.flatMap(livePlanes))];
      const allIn = planes.every(pl => { for(let i = 0; i < 8; i++){ _c.set(i & 1 ? _bb.max.x : _bb.min.x, i & 2 ? _bb.max.y : _bb.min.y, i & 4 ? _bb.max.z : _bb.min.z); if(pl.distanceToPoint(_c) < 0) return false; } return true; });
      if(!allIn) todo.push(o);
    });
    let tris = 0, maxY = -1e9, lids = 0, flips = 0;
    for(const o of todo){
      const cut = clipMesh(o);
      hidden.push(o); o.visible = false;
      if(!cut) continue;
      tris += cut.tris;
      cut.geo.computeBoundingBox(); maxY = Math.max(maxY, cut.geo.boundingBox.max.y);
      const m = new THREE.Mesh(cut.geo, o.material); m.name = (o.name || 'mesh') + ' (cut)';
      scene.add(m); added.push(m); temp.push(cut.geo);
      //（lighting 的切口分身標了 noPhoto，在這之前已經被藏起來，所以不看它的 visible）
      const sib = o.children.find(c => c.name === 'cut-cap' && c.material && c.material.color);
      const layer = o.layers.isEnabled(7) ? 7 : o.layers.isEnabled(6) ? 6 : 0;
      const capHex = capColor(o, sib, layer);
      let how = '-', lidInfo = null;
      if(capHex != null){
        const capMat = capMatFor(capHex);
        const lid = DBG.planarCaps ? capGeometry(cut.segs) : { geo: null, open: 1 };
        lidInfo = [lid.loops, lid.open, lid.openPts];
        if(lid.geo){ const c = new THREE.Mesh(lid.geo, capMat); c.name = (o.name || 'mesh') + ' (cut lid)'; scene.add(c); added.push(c); temp.push(lid.geo); lids++; how = 'lid'; }
        if(lid.open || !lid.geo){   // 有串不成圈的邊（不封閉的幾何）→ 那部分用翻面複本補
          const g2 = flipped(cut.geo);
          const c = new THREE.Mesh(g2, capMat); c.name = (o.name || 'mesh') + ' (cut cap)';
          scene.add(c); added.push(c); temp.push(g2); flips++; how += '+flip';
        }
      }
      if(DBG.cutLog) DBG.cutLog.push([o.name, (Array.isArray(o.material) ? 'multi' : o.material.name || o.material.type), sib ? 'sib' : layer, capHex != null ? capHex.toString(16) : null, cut.tris, how, lidInfo]);
    }
    return { meshes: todo.length, tris, lids, flips, maxY: todo.length ? +maxY.toFixed(3) : null };
  }
  // 逐個三角形用切平面裁掉（Sutherland–Hodgman），輸出世界座標、保留幾何分組（多重材質）；
  // 同時收集「落在切平面上的那一段邊」（segs：每個切平面一組 [ax,ay,az,bx,by,bz,…]），給 capGeometry 蓋蓋子
  function clipMesh(o){
    const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, col = g.attributes.color, idx = g.index;
    const mats = Array.isArray(o.material) ? o.material : null;
    const groups = mats && g.groups.length ? g.groups : [{ start: 0, count: idx ? idx.count : pos.count, materialIndex: 0 }];
    const P = [], N = [], U = [], C = [], outGroups = [];
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    const segs = new Map();   // 切平面 → 線段
    const lerp = (a, b, t) => ({ p: a.p.map((x, k) => x + (b.p[k] - x) * t), n: a.n.map((x, k) => x + (b.n[k] - x) * t),
                                 u: a.u.map((x, k) => x + (b.u[k] - x) * t), c: a.c ? a.c.map((x, k) => x + (b.c[k] - x) * t) : null });
    const dist = (pl, q) => pl.normal.x * q.p[0] + pl.normal.y * q.p[1] + pl.normal.z * q.p[2] + pl.constant;
    const push = q => { P.push(...q.p); N.push(...q.n); U.push(...q.u); if(col) C.push(...q.c); };
    // InstancedMesh：每一個分身各切一次（目前場景沒有，保險）
    const inst = o.isInstancedMesh ? o.count : 0, im = new THREE.Matrix4();
    let tris = 0;
    for(let ii = 0; ii < Math.max(1, inst); ii++){
      const mw = inst ? (o.getMatrixAt(ii, im), im.premultiply(o.matrixWorld)) : o.matrixWorld;
      const nm = new THREE.Matrix3().getNormalMatrix(mw);
      const vert = i => {
        v.fromBufferAttribute(pos, i).applyMatrix4(mw);
        if(nor) n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); else n.set(0, 1, 0);
        return { p: [v.x, v.y, v.z], n: [n.x, n.y, n.z], u: uv ? [uv.getX(i), uv.getY(i)] : [0, 0], c: col ? [col.getX(i), col.getY(i), col.getZ(i)] : null };
      };
      for(const gr of groups){
        const planes = livePlanes(mats ? mats[gr.materialIndex] : o.material);
        const start = P.length / 3;
        const end = Math.min(gr.start + gr.count, idx ? idx.count : pos.count);
        for(let t = gr.start; t + 2 < end; t += 3){
          let poly = [0, 1, 2].map(k => vert(idx ? idx.getX(t + k) : t + k));
          for(const pl of planes){
            const d = poly.map(q => dist(pl, q));
            if(d.every(x => x >= 0)) continue;
            if(d.every(x => x < 0)){ poly = []; break; }
            const out = [];
            for(let k = 0; k < poly.length; k++){
              const a = poly[k], b = poly[(k + 1) % poly.length], da = d[k], db = d[(k + 1) % poly.length];
              if(da >= 0) out.push(a);
              if((da >= 0) !== (db >= 0)) out.push(lerp(a, b, da / (da - db)));
            }
            poly = out;
            if(poly.length < 3) break;
          }
          if(poly.length < 3) continue;
          for(let k = 1; k + 1 < poly.length; k++){ push(poly[0]); push(poly[k]); push(poly[k + 1]); tris++; }
          // 落在切平面上的邊：剛好兩個點在平面上 → 一段（三個以上＝這個面本身就躺在平面上，它自己就是蓋子）
          for(const pl of planes){
            const on = poly.filter(q => Math.abs(dist(pl, q)) < 1e-6);
            if(on.length !== 2) continue;
            let s = segs.get(pl); if(!s){ s = { pl, list: [] }; segs.set(pl, s); }
            s.list.push(...on[0].p, ...on[1].p);
          }
        }
        outGroups.push({ start, count: P.length / 3 - start, materialIndex: gr.materialIndex });
      }
    }
    if(!tris) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    if(col) geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    if(mats){
      // 分身（InstancedMesh）會讓同一個材質分組出現好幾次：同材質的連續段合併（three 的分組可以重複 materialIndex）
      for(const gr of outGroups) if(gr.count) geo.addGroup(gr.start, gr.count, gr.materialIndex);
    }
    return { geo, tris, segs: [...segs.values()] };
  }
  // 平的蓋子：把切平面上的線段串成封閉的圈，外圈＋內圈（洞）三角化；回傳 { geo, open：串不成圈的段數 }
  const _u = new THREE.Vector3(), _w = new THREE.Vector3(), _o = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();
  function capGeometry(segSets){
    const Pos = [], Nor = [];
    let open = 0, nLoops = 0;
    const openPts = [];
    for(const { pl, list } of segSets){
      const nrm = pl.normal;
      _u.set(Math.abs(nrm.y) > 0.9 ? 1 : 0, Math.abs(nrm.y) > 0.9 ? 0 : 1, 0).addScaledVector(nrm, -(Math.abs(nrm.y) > 0.9 ? nrm.x : nrm.y)).normalize();
      _w.crossVectors(nrm, _u);
      _o.copy(nrm).multiplyScalar(-pl.constant);                     // 平面上的一點
      // 端點合併（0.1 mm 格子）：相鄰三角形算出來的同一個交點會落在同一格
      const E = 1e-4, ids = new Map(), pts = [];
      const vid = i => {
        const x = list[i] - _o.x, y = list[i + 1] - _o.y, z = list[i + 2] - _o.z;
        const a = x * _u.x + y * _u.y + z * _u.z, b = x * _w.x + y * _w.y + z * _w.z;
        const k = Math.round(a / E) + ',' + Math.round(b / E);
        let id = ids.get(k); if(id === undefined){ id = pts.length; pts.push(new THREE.Vector2(a, b)); ids.set(k, id); }
        return id;
      };
      const edges = [], adj = new Map(), seen = new Set();
      for(let i = 0; i < list.length; i += 6){
        const a = vid(i), b = vid(i + 3);
        if(a === b) continue;
        const k = a < b ? a + ',' + b : b + ',' + a; if(seen.has(k)) continue; seen.add(k);
        const e = edges.length; edges.push([a, b]);
        for(const x of [a, b]){ let l = adj.get(x); if(!l){ l = []; adj.set(x, l); } l.push(e); }
      }
      // 串成圈
      const used = new Uint8Array(edges.length), loops = [];
      for(let s = 0; s < edges.length; s++){
        if(used[s]) continue;
        used[s] = 1;
        const first = edges[s][0], loop = [first];
        let cur = edges[s][1], closed = false;
        for(let guard = 0; guard <= edges.length; guard++){
          if(cur === first){ closed = true; break; }
          loop.push(cur);
          const nx = adj.get(cur).find(e => !used[e]);
          if(nx === undefined) break;
          used[nx] = 1;
          cur = edges[nx][0] === cur ? edges[nx][1] : edges[nx][0];
        }
        if(closed && loop.length >= 3) loops.push(loop.map(i => pts[i])); else { open++; if(DBG.cutLog && openPts.length < 6) openPts.push(loop.map(i => pts[i].x.toFixed(3) + ',' + pts[i].y.toFixed(3)).join(' ')); }
      }
      nLoops += loops.length;
      if(!loops.length) continue;
      // 外圈／洞：面積大的先排，被奇數個圈包住的是洞（掛在包住它的最小那圈底下）
      const L = loops.map(p => ({ p, area: THREE.ShapeUtils.area(p), holes: [], depth: 0, parent: null }));
      L.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
      const inside = (pt, poly) => { let c = false; for(let i = 0, j = poly.length - 1; i < poly.length; j = i++){ const a = poly[i], b = poly[j];
        if((a.y > pt.y) !== (b.y > pt.y) && pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
      for(let i = 0; i < L.length; i++){
        const q = L[i].p, probe = new THREE.Vector2((q[0].x + q[1].x) / 2, (q[0].y + q[1].y) / 2);   // 第一條邊的中點（避開頂點剛好碰在別圈邊上）
        for(let j = i - 1; j >= 0; j--) if(inside(probe, L[j].p)){ L[i].parent = L[j]; L[i].depth = L[j].depth + 1; break; }
      }
      for(const l of L) if(l.depth % 2 === 1 && l.parent) l.parent.holes.push(l.p);
      for(const l of L){
        if(l.depth % 2 === 1) continue;
        let faces;
        try{ faces = THREE.ShapeUtils.triangulateShape(l.p.slice(), l.holes.map(h => h.slice())); }catch(e){ open++; continue; }
        const all = l.p.concat(...l.holes);
        for(const f of faces){
          const tri = f.map(i => all[i]).map(q => new THREE.Vector3().copy(_o).addScaledVector(_u, q.x).addScaledVector(_w, q.y));
          _e1.subVectors(tri[1], tri[0]); _e2.subVectors(tri[2], tri[0]);
          if(_e1.cross(_e2).dot(nrm) > 0) [tri[1], tri[2]] = [tri[2], tri[1]];   // 蓋子朝「被切掉的那一側」（朝上）
          for(const q of tri){ Pos.push(q.x, q.y, q.z); Nor.push(-nrm.x, -nrm.y, -nrm.z); }
        }
      }
    }
    if(!Pos.length) return { geo: null, open, loops: nLoops, openPts };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(Pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(Nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(Pos.length / 3 * 2), 2));
    return { geo, open, loops: nLoops, openPts };
  }
  // 翻面的複本（三角形順序反過來、法線反向）→ 從切口往裡看到的是它的正面 ＝ 切口的顏色（只給不封閉、蓋不了蓋子的幾何用）
  function flipped(geo){
    const g2 = new THREE.BufferGeometry();
    const P = geo.attributes.position.array.slice(), N = geo.attributes.normal.array.slice(), U = geo.attributes.uv.array.slice();
    for(let t = 0; t < P.length; t += 9){ for(let k = 0; k < 3; k++){ const a = t + 3 + k, b = t + 6 + k; [P[a], P[b]] = [P[b], P[a]]; [N[a], N[b]] = [N[b], N[a]]; } }
    for(let t = 0; t < U.length; t += 6){ for(let k = 0; k < 2; k++){ const a = t + 2 + k, b = t + 4 + k; [U[a], U[b]] = [U[b], U[a]]; } }
    // 法線反向，並往物件裡面縮 2 mm：跟原本的面重疊的話，光線會「兩個面同距離」而直接穿牆
    for(let i = 0; i < N.length; i++){ N[i] = -N[i]; P[i] += N[i] * 0.002; }
    g2.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g2.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g2.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    return g2;
  }

  /* ---------- 7. 燈光翻譯 ----------
     引擎每次反彈只「隨機挑一盞燈」去問亮度（平均挑），燈越多、每盞被問到的機會越少 → 雜點越多。
     所以只留真的會照到這個畫面的燈：
       - 平行光只留最亮那顆當太陽，換成很遠的圓形面光源（影子邊緣柔、而且不會有平行光那種硬邊）
       - 放在建築外面的聚光燈／點光源（即時畫面用來假裝窗光的）關掉：拍照模式的窗光是真的天空
       - 室內燈：只留「看得到的房間」或相機附近的，最多 CFG.maxLamps 盞；聚光燈給一點半徑（影子柔） */
  const _v = new THREE.Vector3(), _t = new THREE.Vector3();
  function arrangeSun(hidden, added){
    const dirs = [];
    scene.traverse(l => { if(l.isDirectionalLight && l.visible && l.intensity > 0) dirs.push(l); });
    if(!dirs.length) return null;
    dirs.sort((a, b) => b.intensity - a.intensity);
    dirs.forEach(l => { hidden.push(l); l.visible = false; });
    const sun = dirs[0];
    // 太陽太弱（夜裡的月光、黃昏）就不要了：佔一個燈位但幾乎沒貢獻
    if(sun.intensity < 0.35 || DBG.noSun) return null;
    sun.getWorldPosition(_v); sun.target.getWorldPosition(_t);
    const dir = _v.sub(_t).normalize();
    const DIST = 400, half = DBG.sunHalfAngle * Math.PI / 180, r = DIST * Math.tan(half), area = Math.PI * r * r;
    const B = ctx.bounds, centre = new THREE.Vector3((B.x0 + B.x1) / 2, ctx.H / 2, (B.z0 + B.z1) / 2);
    // 照度不變：L = E·d² / (π r²)
    const disc = new THREE.RectAreaLight(sun.color, sun.intensity * DIST * DIST / area, 2 * r, 2 * r);
    disc.isCircular = true;
    disc.position.copy(centre).addScaledVector(dir, DIST);
    disc.lookAt(centre);
    disc.name = 'photo-sun'; scene.add(disc); added.push(disc);
    return disc;
  }
  function lampCandidates(hidden){
    const B = ctx.bounds, L = ctx.lighting || {};
    // 即時畫面用來「假裝窗光」的燈：舊版 lighting 放在 spots、新版放在燈池 slots（vl.group === 'win'）
    const fake = new Set(L.spots || []);
    for(const sl of L.slots || []) if(sl && sl.light && sl.vl && sl.vl.group === 'win') fake.add(sl.light);
    const list = [];
    scene.traverse(l => {
      if(!(l.isPointLight || l.isSpotLight || l.isRectAreaLight) || !l.visible) return;
      // 亮度 0 的燈（lighting 模組白天把燈調到 0 但不關掉）也要藏：引擎是「平均挑燈」，挑到它等於白算
      if(!(l.intensity > 1e-3)){ hidden.push(l); l.visible = false; return; }
      if(l.isRectAreaLight) return;
      l.getWorldPosition(_v);
      // 不在任何房間裡（窗外、陽台女兒牆外）的燈也當成假窗光
      const outside = _v.x < B.x0 - 0.02 || _v.x > B.x1 + 0.02 || _v.z < B.z0 - 0.02 || _v.z > B.z1 + 0.02 || !roomAt(_v.x, _v.z, 0.1);
      if(fake.has(l) || outside){ hidden.push(l); l.visible = false; return; }
      list.push({ l, p: _v.clone() });
    });
    return list;
  }
  function roomAt(x, z, m = 0){
    for(const k in ctx.R) for(const q of (ctx.R[k].rects || [])) if(x >= q[0] - m && x <= q[2] + m && z >= q[1] - m && z <= q[3] + m) return k;
    return null;
  }
  // 從相機往畫面各處打一排射線（用引擎剛建好的 BVH，很快），打到哪些房間＝「看得到的房間」
  function visibleRooms(bvh, bird){
    const rooms = new Set();
    if(bird || !bvh){ for(const k in ctx.R) rooms.add(k); return rooms; }
    const here = roomAt(camera.position.x, camera.position.z, 0.2); if(here) rooms.add(here);
    const ray = new THREE.Ray(), nd = new THREE.Vector3();
    for(let j = 0; j < 12; j++) for(let i = 0; i < 20; i++){
      nd.set((i + 0.5) / 20 * 2 - 1, (j + 0.5) / 12 * 2 - 1, 0.5).unproject(camera);
      ray.origin.copy(camera.position); ray.direction.copy(nd).sub(camera.position).normalize();
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
      if(!hit) continue;
      const p = hit.point.addScaledVector(ray.direction, -0.05);
      const k = roomAt(p.x, p.z, 0.05); if(k) rooms.add(k);
    }
    return rooms;
  }
  /* 窗口光源（portal）：白天在「看得到的房間」每一扇清玻璃窗的室內側，貼一片朝室內發光的面光源，
     亮度＝從那扇窗看出去的天空平均亮度。引擎就能直接「對著窗戶」取樣，不用瞎猜哪個方向能穿出窗外看到天空
     （室內日光最主要的雜點來源）。同時引擎（已修改）不再透過清玻璃把天空再算一次 → 不會重複計算。 */
  function windowGroups(rooms){
    const list = (ctx.windows || []).filter(w => rooms.has(w.room) && w.axis && w.normal && w.at0 != null && w.y0 != null);
    const groups = new Map();
    for(const w of list){
      const key = w.room + '|' + w.axis + '|' + w.normal.join(',') + '|' + (+w.c0).toFixed(2) + '|' + (+w.y0).toFixed(2) + '|' + (+w.y1).toFixed(2);
      if(!groups.has(key)) groups.set(key, []);
      groups.get(key).push(w);
    }
    const out = [];
    for(const g of groups.values()){
      g.sort((a, b) => a.at0 - b.at0);
      let cur = null;
      for(const w of g){
        if(cur && w.at0 - cur.at1 < 0.16){ cur.at1 = Math.max(cur.at1, w.at1); continue; }
        cur = { room: w.room, axis: w.axis, normal: w.normal, c0: Math.min(w.c0, w.c1), c1: Math.max(w.c0, w.c1), at0: w.at0, at1: w.at1, y0: w.y0, y1: w.y1 };
        out.push(cur);
      }
    }
    return out;
  }
  function portalRadiance(model, n){
    // 從窗戶往外看的半球，天空亮度的餘弦加權平均（＝把窗戶當成均勻發光面時該有的亮度）
    const acc = new THREE.Color(0, 0, 0), d = new THREE.Vector3(), N = new THREE.Vector3(n[0], 0, n[1]);
    let wsum = 0;
    for(let j = 0; j < 24; j++) for(let i = 0; i < 48; i++){
      const phi = (j + 0.5) / 24 * Math.PI, th = (i + 0.5) / 48 * 2 * Math.PI;
      d.set(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
      const c = d.dot(N); if(c <= 0) continue;
      const w = c * Math.sin(phi), col = model(d);
      acc.r += col.r * w; acc.g += col.g * w; acc.b += col.b * w; wsum += w;
    }
    return acc.multiplyScalar(1 / wsum);
  }
  // 每一扇清玻璃窗都放（光會經過門、走道一路傳到別的房間；只放看得到的房間會漏掉這些光、畫面偏暗又多雜點）。
  // 引擎是「平均挑燈」→ 看得到的房間的窗口光源複製成 3 片、每片 1/3 亮度，被挑中的機會變 3 倍（總亮度不變、結果不偏）
  // 陽台沒有玻璃：女兒牆上方到天花板那一整片是開口。拍照時在那裡放一片「看不見的玻璃」（折射率 1＝不反光、不偏折，
  // 相機完全看不到它），讓引擎把它當成窗戶，於是陽台開口也能用窗口光源取樣（從廚房看出去的那道門光最需要）
  function balconyOpening(){
    const w = (ctx.archWalls || []).find(v => v.id === 'W_balcony_parapet');
    if(!w || !ctx.R['陽台']) return null;
    const room = Object.keys(ctx.R).find(k => /陽台/.test(k));
    return { room, axis: 'x', normal: [0, 1], at0: w.a, at1: w.b, c0: Math.min(w.c0, w.c1), c1: Math.max(w.c0, w.c1), y0: 1.14, y1: ctx.H - 0.01 };
  }
  const paneMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, roughness: 0, metalness: 0, ior: 1.0, specularIntensity: 0, thickness: 0, side: THREE.DoubleSide });
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), paneMat);
  pane.name = 'photo-balcony-pane';
  function addPortals(rooms, model, added){
    const all = new Set((ctx.windows || []).map(w => w.room));
    let n = 0;
    const open = balconyOpening();
    for(const w of windowGroups(all).concat(open ? [open] : [])){
      const copies = rooms.has(w.room) ? 3 : 1;
      for(let c = 0; c < copies; c++) n += addPortal(w, model, added, 1 / copies);
    }
    return n;
  }
  function addPortal(w, model, added, k){
    const width = w.at1 - w.at0 - 0.06, height = w.y1 - w.y0 - 0.06;
    if(width < 0.2 || height < 0.2) return 0;
    const nx = w.normal[0], nz = w.normal[1];                      // 法線朝室外
    const nAxis = w.axis === 'x' ? nz : nx;
    const inner = nAxis < 0 ? w.c1 : w.c0;                        // 牆的室內面
    const a = (w.at0 + w.at1) / 2, y = (w.y0 + w.y1) / 2;
    const x = w.axis === 'x' ? a : inner - nx * 0.015;
    const z = w.axis === 'x' ? inner - nz * 0.015 : a;
    const L = new THREE.RectAreaLight(portalRadiance(model, w.normal), k, width, height);
    L.position.set(x, y, z);
    L.lookAt(x - nx, y, z - nz);        // 面光源朝室內發光（燈的 lookAt ＝ −z 對著目標）
    L.name = 'photo-portal'; scene.add(L); added.push(L);
    return 1;
  }
  function sunUseful(sunDisc, bird){
    if(!sunDisc) return false;
    if(bird || ctx.R['陽台']) return true;            // 陽台是露天的，太陽只要在地平線上就照得進來
    const d = sunDisc.position.clone().normalize();   // 大約就是太陽方向（圓盤放在 400 m 外）
    return d.y > 0 && (ctx.windows || []).some(w => w.normal && (w.normal[0] * d.x + w.normal[1] * d.z) > 0.02);
  }
  const keptNames = [];
  function cullLamps(cands, rooms, hidden, radii){
    const cam = camera.position;
    keptNames.length = 0;
    const scored = cands.map(c => {
      const k = roomAt(c.p.x, c.p.z, 0.3), d = c.p.distanceTo(cam);
      const inView = (k && rooms.has(k)) || d < 3.5;
      return { ...c, inView, score: c.l.intensity / Math.max(1, d * d) };
    });
    scored.sort((a, b) => b.score - a.score);
    let kept = 0;
    for(const c of scored){
      if(c.inView && kept < (DBG.maxLamps ?? CFG.maxLamps)){
        kept++; keptNames.push((c.l.name || c.l.type) + ':' + (+c.l.intensity).toFixed(2));
        if(c.l.isSpotLight && !(c.l.radius > 0)){ radii.push(c.l); c.l.radius = 0.06; }   // 燈具有大小 → 影子邊緣柔
      }else{ hidden.push(c.l); c.l.visible = false; }
    }
    return kept;
  }

  /* ---------- 8. 參考圖（給降噪）：材質顏色＋可降噪程度、法線＋距離 ----------
     用一般的光柵化畫（很快），4 倍多重取樣讓邊緣跟路徑追蹤的抗鋸齒一致。
     A：rgb＝材質底色（線性），|a|＝這個像素可以降噪到什麼程度（0＝鏡面等，不動它）；a 為負＝不列入測光（俯瞰的地面）
     G：rgb＝視角空間法線，a＝到相機的距離（0＝沒有東西，天空） */
  const guideCache = new Map();
  const ndMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, useMap: { value: 0 }, alphaTest: { value: 0 } },
    vertexShader: `varying vec3 vN; varying float vD; varying vec2 vUv;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vD = -mv.z; vUv = uv; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform int useMap; uniform float alphaTest; varying vec3 vN; varying float vD; varying vec2 vUv;
      void main(){ if(useMap == 1 && texture2D(map, vUv).a < alphaTest) discard;
        vec3 n = normalize(vN); if(!gl_FrontFacing) n = -n; gl_FragColor = vec4(n, vD); }`,
    side: THREE.DoubleSide,
  });
  function guideMats(m, o, tw){
    const key = (m && m.uuid) + '|' + (tw && tw.uuid);
    let g = guideCache.get(key);
    if(g && g.v === m.version && g.ei === m.emissiveIntensity) return g;
    const src = tw || m;
    let strength = 1, color = src.color ? src.color.clone() : new THREE.Color(1, 1, 1), map = src.map || null;
    const rough = src.roughness ?? 1, metal = src.metalness ?? 0;
    const emissive = src.emissive && (src.emissive.r + src.emissive.g + src.emissive.b) > 0.01 && (src.emissiveIntensity ?? 1) > 0.05;
    const S = THREE.MathUtils.smoothstep, lumC = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    if(o.isReflector){ strength = 0; color.setRGB(1, 1, 1); map = null; }                                  // 鏡子：不動它
    else if(emissive){ strength = 0.5; color.setRGB(1, 1, 1); map = null; }                                // 發光體：自己的光，不除底色
    else if(src.transmission > 0.5 && !src.roughnessMap){ strength = rough > 0.25 ? 0.8 : 0; color.setRGB(1, 1, 1); map = null; }   // 霧玻璃／清玻璃
    else if(!src.metalnessMap && metal > 0.5){                                                             // 金屬：看到的是反射 → 不除底色
      strength = src.roughnessMap ? 0.5 : Math.max(0.35, S(rough, 0.06, 0.4)); color.setRGB(1, 1, 1); map = null;
    }else if(!src.roughnessMap && rough < 0.35 && lumC < 0.12 && !map){                                    // 深色亮面（電視螢幕）：主要是反射
      strength = 0.5; color.setRGB(1, 1, 1);
    }else if(!src.roughnessMap){                                                                           // 一般材質（含白瓷這類亮面淺色）
      strength = Math.max(0.6, S(rough, 0.06, 0.32));
    }
    if(o === photoGround) strength = -1;                      // 俯瞰地面：照樣降噪，但曝光只看建築本身
    const clear = src.transmission > 0.5 && rough <= 0.25;   // 清玻璃：參考圖裡當作看不見（看它後面的東西）
    const alb = new THREE.MeshBasicMaterial({ color, map, vertexColors: !!src.vertexColors, alphaMap: src.alphaMap || null,
      alphaTest: src.alphaTest || 0, side: src.side ?? THREE.FrontSide, transparent: false, blending: THREE.NoBlending,
      opacity: strength < 0 ? strength : Math.max(0.0001, strength), toneMapped: false, fog: false });
    g = { v: m.version, ei: m.emissiveIntensity, alb, clear, map: (src.alphaTest > 0 && src.map) ? src.map : null, alphaTest: src.alphaTest || 0 };
    guideCache.set(key, g);
    return g;
  }
  let T = null;   // 這一輪的 render targets（大小 = 路徑追蹤解析度）
  function makeTargets(w, h){
    disposeTargets();
    const ms = { samples: 4, depthBuffer: true };
    T = {
      w, h,
      albMS: rt(w, h, ms), geoMS: rt(w, h, ms),   // 參考圖先用 4 倍多重取樣畫，畫完複製到下面兩張普通的，多重取樣那兩張就丟掉（省 GPU 記憶體）
      alb: rt(w, h), geo: rt(w, h),
      e0: rt(w, h), e1: rt(w, h), var0: null,
      out: rt(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }),
      red: RED.map(r => rt(r.w, r.h, { type: THREE.FloatType })),   // 測光縮圖：室內／天空／地面各一張
    };
  }
  function disposeTargets(){
    if(!T) return;
    for(const k in T){ const v = T[k]; (Array.isArray(v) ? v : [v]).forEach(x => x && x.dispose && x.dispose()); }
    T = null;
  }
  function renderGuides(meshes){
    const s = saveGL();
    const swapped = [];
    const hiddenG = [], glassG = [];
    for(const [o, orig, tw] of meshes){
      // 多重材質（幾何分組）：每一組各換成自己的參考材質
      const g = Array.isArray(orig) ? { alb: orig.map(mm => guideMats(mm, o, null).alb), clear: false, map: null } : guideMats(orig, o, tw);
      if(g.clear){ glassG.push([o, o.material]); continue; }
      swapped.push([o, o.material, g]);
    }
    scene.background = null; renderer.setClearColor(0x000000, 0); renderer.toneMapping = THREE.NoToneMapping;
    renderer.autoClear = true;
    // A：材質顏色（沒東西的地方＝天空：底色當白、可以輕度降噪）
    //    清玻璃：顏色不動（參考圖要的是玻璃後面的東西），只把「可降噪程度」拉到至少 0.9 ──
    //    隔著玻璃看到的東西（浴缸、窗外）光線要多穿一層，雜點特別多
    for(const [o, , g] of swapped) o.material = g.alb;
    for(const [o] of glassG) o.material = glassMarkMat;
    accumulate(T.albMS, T.alb, 0xffffff, 0.7);
    for(const [o, m] of glassG){ o.material = m; if(o.visible){ o.visible = false; hiddenG.push(o); } }
    // G：法線＋距離（alpha 裁切的葉子等也要裁）
    const ndCache = new Map();
    for(const [o, , g] of swapped){
      if(g.map){
        let m2 = ndCache.get(g); if(!m2){ m2 = ndMat.clone(); m2.uniforms.map.value = g.map; m2.uniforms.useMap.value = 1; m2.uniforms.alphaTest.value = g.alphaTest; ndCache.set(g, m2); }
        o.material = m2;
      }else o.material = ndMat;
    }
    accumulate(T.geoMS, T.geo, 0x000000, 0);
    for(const [o, m] of swapped) o.material = m;
    hiddenG.forEach(o => { o.visible = true; });
    ndCache.forEach(m => m.dispose());
    // 多重取樣那兩張用完就丟（每個像素省約 64 bytes）
    T.albMS.dispose(); T.geoMS.dispose(); T.albMS = T.geoMS = null;
    loadGL(s);
  }
  /* 參考圖畫 4 次、每次整個畫面偏移不到一個像素（每次再加上 4 倍多重取樣 → 每個像素 16 個取樣點），平均起來。
     ⭐ 為什麼：邊緣像素（窗框、踢腳板上緣）的「兩種材質各佔幾成」要跟路徑追蹤的一樣準，不然除掉／乘回材質顏色時
        算錯 → 沿著斜斜的邊緣出現一格亮一格暗的虛線。只用 4 個取樣點時比例只能是 0／¼／½／¾／1，誤差是規則的（＝虛線）；
        16 個點誤差小 4 倍。只在按下 📸 時做一次，參考材質很簡單，多畫幾次很便宜 */
  const GUIDE_JIT = [[0.125, 0.375], [-0.375, 0.125], [0.375, -0.125], [-0.125, -0.375]];
  function accumulate(ms, out, clearHex, clearA){
    renderer.setRenderTarget(out); renderer.setClearColor(0x000000, 0); renderer.clear(true, false, false);
    addMat.uniforms.tIn.value = ms.texture; addMat.uniforms.uW.value = 1 / GUIDE_JIT.length;
    // 相機本來就可能有鏡頭偏移（main.js 俯瞰取景：把房子中心移到沒被按鈕擋住的那塊）→ 抖動要「疊加」在它上面，畫完還原，
    // 不能直接覆蓋／清掉（不然參考圖、路徑追蹤跟畫面對不上，離開拍照後俯瞰也會跳位）
    const v0 = camera.view && camera.view.enabled ? { ...camera.view } : null;
    for(const [jx, jy] of GUIDE_JIT){
      if(v0) camera.setViewOffset(v0.fullWidth, v0.fullHeight, v0.offsetX + jx * v0.width / T.w, v0.offsetY + jy * v0.height / T.h, v0.width, v0.height);
      else camera.setViewOffset(T.w, T.h, jx, jy, T.w, T.h);
      renderer.setClearColor(clearHex, clearA);
      renderer.setRenderTarget(ms); renderer.render(scene, camera);
      quad.material = addMat; renderer.autoClear = false; renderer.setRenderTarget(out); renderer.render(quadScene, quadCam); renderer.autoClear = true;
    }
    if(v0) camera.setViewOffset(v0.fullWidth, v0.fullHeight, v0.offsetX, v0.offsetY, v0.width, v0.height);
    else camera.clearViewOffset();
    renderer.setClearColor(0x000000, 0);
  }
  const addMat = new THREE.ShaderMaterial({ uniforms: { tIn: { value: null }, uW: { value: 0.25 } }, vertexShader: VS,
    fragmentShader: `uniform sampler2D tIn; uniform float uW; void main(){ gl_FragColor = texelFetch(tIn, ivec2(gl_FragCoord.xy), 0) * uW; }`,
    depthTest: false, depthWrite: false, transparent: true, blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor });
  // 清玻璃在參考圖 A 裡的樣子：RGB 不動（ZERO·src＋ONE·dst），alpha 取 max(0.9, 原本) → 後面的東西降噪強一點
  const glassMarkMat = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.9, transparent: true, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide, toneMapped: false, fog: false, blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.MaxEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor });
  const copyMat = new THREE.ShaderMaterial({ uniforms: { tIn: { value: null } }, vertexShader: VS,
    fragmentShader: `uniform sampler2D tIn; void main(){ gl_FragColor = texelFetch(tIn, ivec2(gl_FragCoord.xy), 0); }`,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending });

  /* ---------- 9. 降噪與顯示用的 shader ---------- */
  const lumFn = `float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }`;
  // (a) 把材質顏色除掉 → 只剩「光」；順便壓掉孤立的亮點（firefly）、估計每個像素附近的雜訊大小
  // 除掉／乘回材質顏色時加的一點點（不是夾住）：深色有紋理的材質（RC 柱的斑點約 0.01–0.04）除完再乘回來一模一樣，紋理不會被抹平
  const ALB_EPS = { ALB_EPS: 'vec3(0.003)' };
  const demodMat = new THREE.ShaderMaterial({
    defines: ALB_EPS,
    uniforms: { tColor: { value: null }, tAlb: { value: null }, tGeo: { value: null } },
    vertexShader: VS,
    fragmentShader: `uniform sampler2D tColor, tAlb, tGeo; ${lumFn}
      vec3 irr(ivec2 q){ vec4 a = texelFetch(tAlb, q, 0); vec3 c = texelFetch(tColor, q, 0).rgb;
        if(any(isnan(c)) || any(isinf(c))) c = vec3(0.0);   // 保險：壞掉的像素不要擴散
        return (abs(a.a) > 0.0 && texelFetch(tGeo, q, 0).a > 0.0) ? c / (a.rgb + ALB_EPS) : c; }
      void main(){
        ivec2 p = ivec2(gl_FragCoord.xy), mx = textureSize(tColor, 0) - 1;
        vec4 a = texelFetch(tAlb, p, 0);
        vec3 e = irr(p);
        if(abs(a.a) <= 0.0){ gl_FragColor = vec4(e, 0.0); return; }
        bool sky = texelFetch(tGeo, p, 0).a <= 0.0;   // 天空（含窗外）自成一類：只跟天空混
        float lp = lum(e), s1 = 0.0, s2 = 0.0, n = 0.0, nmax = 0.0;
        for(int y = -1; y <= 1; y++) for(int x = -1; x <= 1; x++){
          ivec2 q = clamp(p + ivec2(x, y), ivec2(0), mx);
          if(abs(texelFetch(tAlb, q, 0).a) <= 0.0 || (texelFetch(tGeo, q, 0).a <= 0.0) != sky) continue;
          float l = (x == 0 && y == 0) ? lp : lum(irr(q));
          s1 += l; s2 += l * l; n += 1.0;
          if(x != 0 || y != 0) nmax = max(nmax, l);
        }
        // 比周圍 8 格最亮的還亮 2.5 倍以上 → 孤立亮點，壓回去
        float lim = 2.5 * nmax + 0.02;
        if(lp > lim){ e *= lim / lp; lp = lim; }
        float m1 = s1 / n, v = max(0.0, s2 / n - m1 * m1);
        gl_FragColor = vec4(e, v);
      }`,
    depthTest: false, depthWrite: false,
  });
  // (b) 保邊模糊（à-trous 小波，6 輪：步距 1,2,4,8,16,32）：法線不同、不在同一平面、亮度差太多的鄰居都不混
  const atrousMat = new THREE.ShaderMaterial({
    uniforms: { tIn: { value: null }, tAlb: { value: null }, tGeo: { value: null }, uStep: { value: 1 }, uPass: { value: 0 }, uJit: { value: 1 },
                uProj: { value: new THREE.Vector2(1, 1) }, uOff: { value: new THREE.Vector2(0, 0) }, uSigL: { value: 4.0 } },
    vertexShader: VS,
    fragmentShader: `uniform sampler2D tIn, tAlb, tGeo; uniform int uStep, uPass, uJit; uniform vec2 uProj, uOff; uniform float uSigL; ${lumFn}
      uint hash(uint x){ x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
      vec3 viewPos(ivec2 q, float d, vec2 size){ vec2 ndc = (vec2(q) + 0.5) / size * 2.0 - 1.0; return vec3((ndc + uOff) * uProj * d, -d); }
      void main(){
        ivec2 p = ivec2(gl_FragCoord.xy); ivec2 isz = textureSize(tIn, 0); vec2 size = vec2(isz);
        vec4 c = texelFetch(tIn, p, 0); vec4 g = texelFetch(tGeo, p, 0); float sp = abs(texelFetch(tAlb, p, 0).a);
        if(sp <= 0.0){ gl_FragColor = c; return; }
        bool sky = g.a <= 0.0;
        vec3 np = sky ? vec3(0.0, 0.0, 1.0) : normalize(g.rgb), Pp = viewPos(p, max(g.a, 1e-3), size);
        // 邊緣像素：4 倍取樣把兩個面的法線平均在一起（長度 < 1）→ 放寬法線／平面條件，不然它找不到鄰居、雜點會留成一串亮點
        float edge = sky ? 0.0 : smoothstep(0.995, 0.93, length(g.rgb));
        float nPow = mix(64.0, 2.0, edge);
        float lp = lum(c.rgb);
        // 亮度差容忍度：跟這一帶的雜訊大小成正比（雜訊小 → 幾乎不模糊，細節保留）
        float vb = 0.0, wb = 0.0;
        for(int y = -1; y <= 1; y++) for(int x = -1; x <= 1; x++){
          ivec2 q = clamp(p + ivec2(x, y), ivec2(0), isz - 1); float k = (x == 0 && y == 0) ? 0.25 : ((x == 0 || y == 0) ? 0.125 : 0.0625);
          vb += k * texelFetch(tIn, q, 0).a; wb += k; }
        float sig = uSigL * sqrt(max(vb / wb, 0.0)) + 1e-4 + 0.002 * lp;
        const float h[3] = float[3](0.375, 0.25, 0.0625);
        vec3 sum = c.rgb * 0.140625; float wsum = 0.140625, vsum = c.a * 0.140625 * 0.140625;
        // 步距 4 以上的幾輪：每個像素、每一輪的取樣格各自隨機偏一點（最多半格）→ 平的牆上不會留下規則的格子紋
        ivec2 jit = ivec2(0);
        if(uJit == 1 && uStep >= 4){
          uint hs = hash(uint(p.x) * 1973u + uint(p.y) * 9277u + uint(uPass) * 26699u);
          jit = ivec2(int(hs & 255u) % uStep, int((hs >> 8) & 255u) % uStep) - uStep / 2;
        }
        for(int y = -2; y <= 2; y++) for(int x = -2; x <= 2; x++){
          if(x == 0 && y == 0) continue;
          ivec2 q = p + ivec2(x, y) * uStep + jit;
          if(q.x < 0 || q.y < 0 || q.x >= isz.x || q.y >= isz.y) continue;
          vec4 gq = texelFetch(tGeo, q, 0); float sq = abs(texelFetch(tAlb, q, 0).a);
          if(sq <= 0.0 || (gq.a <= 0.0) != sky) continue;
          vec4 cq = texelFetch(tIn, q, 0);
          float wg = 1.0;
          if(!sky){
            float wn = pow(max(dot(np, normalize(gq.rgb)), 0.0), nPow);
            float wp = exp(-abs(dot(np, viewPos(q, gq.a, size) - Pp)) / (0.02 * g.a + 0.01));
            wg = wn * mix(wp, 1.0, edge * 0.8);
          }
          float wl = exp(-abs(lum(cq.rgb) - lp) / sig);
          float w = h[abs(x)] * h[abs(y)] * wg * wl * sq;
          sum += cq.rgb * w; wsum += w; vsum += cq.a * w * w;
        }
        vec3 f = sum / wsum;
        gl_FragColor = vec4(mix(c.rgb, f, sp), vsum / (wsum * wsum));
      }`,
    depthTest: false, depthWrite: false,
  });
  // (c) 乘回材質顏色 → 線性的最終影像（拿來顯示、量曝光、存圖）
  const remodMat = new THREE.ShaderMaterial({
    defines: ALB_EPS,
    uniforms: { tIn: { value: null }, tAlb: { value: null }, tGeo: { value: null }, tColor: { value: null }, uRaw: { value: 0 }, uSky: { value: new THREE.Vector3(1, 1, 1) }, uGround: { value: new THREE.Vector3(1, 1, 1) } },
    vertexShader: VS,
    fragmentShader: `uniform sampler2D tIn, tAlb, tGeo, tColor; uniform int uRaw; uniform vec3 uSky, uGround;
      void main(){
        ivec2 p = ivec2(gl_FragCoord.xy);
        vec3 c = texelFetch(tColor, p, 0).rgb;
        vec4 a = texelFetch(tAlb, p, 0);
        vec4 g = texelFetch(tGeo, p, 0);
        bool sky = g.a <= 0.0;
        // 窗外壓暗（uSky）按「這個像素有幾成是天空」漸變：4 倍取樣後法線長度 ≈ 有東西的比例 → 窗框邊緣不會有一格一格的亮暗鋸齒
        float cov = sky ? 0.0 : clamp(length(g.rgb) * 1.02, 0.0, 1.0);
        vec3 k = mix(uSky, a.a < 0.0 ? uGround : vec3(1.0), cov);
        if(uRaw == 1 || abs(a.a) <= 0.0){ gl_FragColor = vec4(c * k, 1.0); return; }
        vec3 alb = sky ? vec3(1.0) : a.rgb + ALB_EPS;
        gl_FragColor = vec4(texelFetch(tIn, p, 0).rgb * alb * k, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  // (d) 顯示：曝光 × 白平衡 → 跟即時畫面同一種色調映射 → sRGB；放大到畫布用硬體雙線性
  const TM_FN = { [THREE.LinearToneMapping]: 'LinearToneMapping', [THREE.ReinhardToneMapping]: 'ReinhardToneMapping',
    [THREE.CineonToneMapping]: 'CineonToneMapping', [THREE.ACESFilmicToneMapping]: 'ACESFilmicToneMapping',
    [THREE.AgXToneMapping]: 'AgXToneMapping', [THREE.NeutralToneMapping]: 'NeutralToneMapping',
    [THREE.CustomToneMapping]: 'CustomToneMapping' };   // lighting 模組可能改寫 CustomToneMapping（調色）→ 照樣沿用
  const oetf = `vec3 srgbOETF(vec3 v){ return mix(pow(v, vec3(0.41666)) * 1.055 - vec3(0.055), v * 12.92, vec3(lessThanEqual(v, vec3(0.0031308)))); }`;
  // 高光肩部：最亮的色版超過 knee 之後改用對數曲線慢慢逼近 lim（整個顏色等比例縮 → 色相不變）。
  // 真的光線比即時畫面對比強：窗邊的牆、陽光照到的床單、窗外的天空常常是室內平均的 5–10 倍，
  // 直接進色調映射會整片死白、畫的顏色不見；加這一段之後亮的地方還是亮、但留得住層次。
  // 只給「肩部很短」的色調映射用（Neutral／本站調色、線性）；ACES／AgX 自己就有長肩部。
  // cap：曝光上限用的「最亮 2% 的格子，映射前最多到多少」（見 applyExposure）
  function tone(){
    const tm = renderer.toneMapping;
    if(tm === THREE.NeutralToneMapping || tm === THREE.CustomToneMapping) return { knee: 0.7, lim: 1.4, cap: 4.0 };
    if(tm === THREE.NoToneMapping || tm === THREE.LinearToneMapping) return { knee: 0.6, lim: 1.0, cap: 1.5 };
    if(tm === THREE.ReinhardToneMapping) return { knee: 1e9, lim: 2e9, cap: 9 };
    return { knee: 1e9, lim: 2e9, cap: 2.5 };
  }
  function makePresent(){
    const fn = TM_FN[renderer.toneMapping];
    const tmPars = THREE.ShaderChunk.tonemapping_pars_fragment;   // 用當下（可能被 lighting 調過色）的版本
    const tn = tone();
    return new THREE.ShaderMaterial({
      uniforms: { tIn: { value: null }, toneMappingExposure: { value: 1 }, uExpo: { value: 1 }, uGain: { value: new THREE.Vector3(1, 1, 1) },
                  uKnee: { value: tn.knee }, uLim: { value: tn.lim } },
      defines: fn ? { PH_TM: fn } : {},
      vertexShader: VS,
      fragmentShader: `uniform sampler2D tIn; uniform vec3 uGain; uniform float uExpo, uKnee, uLim; varying vec2 vUv;
${tmPars}
${oetf}
        vec3 shoulder(vec3 c){
          float peak = max(c.r, max(c.g, c.b));
          if(peak <= uKnee) return c;
          float l = log(1.0 + (peak - uKnee) / (uLim - uKnee));
          return c * ((uKnee + (uLim - uKnee) * l / (1.0 + l)) / peak);
        }
        void main(){
          vec3 c = shoulder(max(texture2D(tIn, vUv).rgb, vec3(0.0)) * uGain * uExpo);
          #ifdef PH_TM
          c = PH_TM(c);          // toneMappingExposure 固定 1（曝光已經在上面乘過）
          #endif
          gl_FragColor = vec4(srgbOETF(clamp(c, 0.0, 1.0)), 1.0);
        }`,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
  }
  let presentMat = null, presentTM = null;
  function present(target){
    if(!presentMat || presentTM !== renderer.toneMapping){ if(presentMat) presentMat.dispose(); presentMat = makePresent(); presentTM = renderer.toneMapping; }
    presentMat.uniforms.tIn.value = T.out.texture;
    presentMat.uniforms.uExpo.value = renderer.toneMappingExposure * expo.value;
    presentMat.uniforms.uGain.value.copy(expo.gain);
    const s = saveGL();
    renderer.autoClear = false;
    pass(presentMat, target);
    loadGL(s);
  }
  /* (e) 量亮度：把影像縮成小格子，每格記「有東西的像素」的平均顏色與比例（天空不算：照片是對室內曝光）
     室內用 96×60 格（每格約 14 像素見方，夠細，量得到一幅畫、一片床單有多亮 → 高光保護用）；天空、地面用 32×20 格 */
  const RED = [{ w: 96, h: 60, taps: 4 }, { w: 32, h: 20, taps: 8 }, { w: 32, h: 20, taps: 8 }];
  const reduceMat = new THREE.ShaderMaterial({
    uniforms: { tIn: { value: null }, tGeo: { value: null }, tAlb: { value: null }, uSky: { value: 0 },
                uCells: { value: new THREE.Vector2(32, 20) }, uTaps: { value: 8 } },
    vertexShader: VS,
    fragmentShader: `uniform sampler2D tIn, tGeo, tAlb; uniform int uSky, uTaps; uniform vec2 uCells; varying vec2 vUv;
      void main(){
        vec2 cell = 1.0 / uCells, base = floor(vUv * uCells) * cell;
        float nt = float(uTaps);
        vec3 s = vec3(0.0); float n = 0.0;
        for(int y = 0; y < 8; y++){ if(y >= uTaps) break;
          for(int x = 0; x < 8; x++){ if(x >= uTaps) break;
            vec2 uv = base + (vec2(x, y) + 0.5) / nt * cell;
            float aa = texture2D(tAlb, uv).a; bool skyPx = texture2D(tGeo, uv).a <= 0.0;
            // uSky 0＝室內（測光用；發光體、鏡子、俯瞰地面不算）、1＝天空（窗外）、2＝俯瞰地面
            if(uSky == 0 && (aa <= 0.0 || skyPx)) continue;
            if(uSky == 1 && (aa == 0.0 || !skyPx)) continue;
            if(uSky == 2 && (aa >= 0.0 || skyPx)) continue;
            vec3 c = texture2D(tIn, uv).rgb;
            if(any(isnan(c)) || any(isinf(c))) continue;
            s += max(c, vec3(0.0)); n += 1.0;
          }
        }
        gl_FragColor = n > 0.0 ? vec4(s / n, n / (nt * nt)) : vec4(0.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  // 把縮圖讀回來算平均（sync：只在剛開始用；async：之後都用非同步讀回，主執行緒不用等 GPU）
  function reduceTo(tex, kind, target){
    const R = RED[kind];
    reduceMat.uniforms.tIn.value = tex; reduceMat.uniforms.uSky.value = kind;
    reduceMat.uniforms.uCells.value.set(R.w, R.h); reduceMat.uniforms.uTaps.value = R.taps;
    reduceMat.uniforms.tGeo.value = T.geo.texture; reduceMat.uniforms.tAlb.value = T.alb.texture;
    const s = saveGL(); renderer.autoClear = true;
    pass(reduceMat, target);
    loadGL(s);
  }
  function summarize(buf, n){
    let wl = 0, sl = 0, r = 0, g = 0, b = 0;
    const cells = [];
    for(let i = 0; i < n; i++){
      const w = buf[i * 4 + 3]; if(!(w > 0)) continue;
      const R = buf[i * 4], G = buf[i * 4 + 1], Bc = buf[i * 4 + 2];
      if(!Number.isFinite(R + G + Bc)) continue;
      const L = 0.2126 * R + 0.7152 * G + 0.0722 * Bc;
      sl += w * Math.log(L + 1e-4); wl += w; r += w * R; g += w * G; b += w * Bc;
      cells.push(R, G, Bc, w);
    }
    if(!wl) return null;
    const mean = (0.2126 * r + 0.7152 * g + 0.0722 * b) / wl;
    return { logAvg: Math.exp(sl / wl), mean, rgb: [r / wl, g / wl, b / wl], cover: wl / n, cells };
  }
  function measure(tex, kind = 0){
    const t = T.red[kind], R = RED[kind];
    reduceTo(tex, kind, t);
    const buf = new Float32Array(R.w * R.h * 4);
    if(!syncRead(t, R.w, R.h, buf)) return null;
    return summarize(buf, R.w * R.h);
  }
  function measureAsync(tex, kind){
    const t = T.red[kind], R = RED[kind];
    reduceTo(tex, kind, t);
    const buf = new Float32Array(R.w * R.h * 4);
    return renderer.readRenderTargetPixelsAsync(t, 0, 0, R.w, R.h, buf).then(() => summarize(buf, R.w * R.h));
  }
  // 高光：每一格取最亮的色版（乘上白平衡），求加權第 q 百分位（一幅畫、一片白床單夠大就會進到這裡）
  function highlight(m, gain, q){
    const c = m.cells, list = [];
    let tot = 0;
    for(let i = 0; i < c.length; i += 4){ list.push([Math.max(c[i] * gain[0], c[i + 1] * gain[1], c[i + 2] * gain[2]), c[i + 3]]); tot += c[i + 3]; }
    if(!list.length) return 0;
    list.sort((a, b) => a[0] - b[0]);
    let acc = 0;
    for(const [v, w] of list){ acc += w; if(acc >= q * tot) return v; }
    return list[list.length - 1][0];
  }
  // 曝光與白平衡：讓照片的平均亮度與平均色調對齊「按下 📸 那一刻的即時畫面」，但高光不准被推爆（見 applyExposure）
  const expo = { value: 1, gain: new THREE.Vector3(1, 1, 1), ref: null, refSky: null, refGround: null, refTries: 0,
                 sky: new THREE.Vector3(1, 1, 1), ground: new THREE.Vector3(1, 1, 1), n: 0, pending: null };
  // 即時畫面的參考量測：量不到（讀回失敗、畫面裡沒有室內像素）就留著參考圖，下一次降噪再量，最多 5 次
  function measureRef(){
    if(!T || !T.ref) return;
    expo.refTries++;
    expo.ref = measure(T.ref.texture); expo.refSky = measure(T.ref.texture, 1); expo.refGround = T.bird ? measure(T.ref.texture, 2) : null;
    if(expo.ref || expo.refTries >= 5){ T.ref.dispose(); T.ref = null; }
    stats.refLogAvg = expo.ref ? +expo.ref.logAvg.toFixed(4) : null; stats.refTries = expo.refTries;
  }
  function updateExposure(sync){
    if(!DBG.autoExpose) return;
    if(!expo.ref){ measureRef(); if(!expo.ref) return; sync = true; }
    if(sync){ applyExposure(measure(T.out.texture), expo.refSky && measure(pt.target.texture, 1), expo.refGround && measure(pt.target.texture, 2)); return; }
    if(expo.pending) return;
    const my = session;
    expo.pending = Promise.all([measureAsync(T.out.texture, 0), expo.refSky ? measureAsync(pt.target.texture, 1) : null, expo.refGround ? measureAsync(pt.target.texture, 2) : null])
      .then(([m, sky, gnd]) => { if(my === session && T) applyExposure(m, sky, gnd); })
      .catch(err => log('測光讀回失敗：', err && err.message))
      .finally(() => { if(my === session) expo.pending = null; });
  }
  function applyExposure(m, sky, gnd){
    if(!m) return;
    const ref = expo.ref;
    // 平均亮度比（前幾輪雜點多時，對數平均會被一塊塊的黑斑拉低，所以跟算術平均各取一半）
    const eLog = ref.logAvg / Math.max(m.logAvg, 1e-6), eMean = ref.mean / Math.max(m.mean, 1e-6);
    let e = THREE.MathUtils.clamp(Math.sqrt(eLog * eMean), 0.005, 500) * DBG.exposureBias;
    // 白平衡：只校正「整體偏色」（除以亮度後的色度比），強度 0.8，範圍夾住，避免把木頭的暖色洗掉
    const norm = c => { const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] || 1; return c.map(v => v / L); };
    const cr = norm(ref.rgb), cp = norm(m.rgb), k = DBG.wbStrength;
    const gain = [0, 1, 2].map(i => THREE.MathUtils.clamp(Math.pow(cr[i] / Math.max(cp[i], 1e-4), k), 0.75, 1.33));
    // 高光保護（兩段）：真的光線比即時畫面對比強（窗邊的牆、白床單、畫框裡的畫特別亮），只對平均亮度的話，
    // 這些地方會被推過色調映射的肩部 → 整片死白。① 顯示時先過一段「高光肩部」（makePresent）；
    // ② 曝光再加一個上限：最亮的那 2% 格子，映射前不超過 tone().cap（肩部還留得住層次的範圍；
    //    即時畫面自己若也那麼亮，就容許到跟它一樣）
    if(DBG.hiCap){
      const tmx = renderer.toneMappingExposure || 1, q = DBG.hiQ;
      const hp = highlight(m, gain, q), rp = highlight(ref, [1, 1, 1], q);
      const allowed = Math.max(tone().cap, rp * tmx);
      const cap = hp > 0 ? allowed / (hp * tmx) : Infinity;
      stats.hiCapped = cap < e; stats.eMean = +e.toFixed(3); stats.eCap = +Math.min(cap, 999).toFixed(3);
      e = Math.min(e, cap);
    }
    // 前幾次直接套用，之後慢慢靠近（不會一閃一閃）
    const a = expo.n < 3 ? 1 : 0.35;
    expo.value += (e - expo.value) * a;
    expo.gain.set(expo.gain.x + (gain[0] - expo.gain.x) * a, expo.gain.y + (gain[1] - expo.gain.y) * a, expo.gain.z + (gain[2] - expo.gain.z) * a);
    expo.n++;
    // 窗外（天空）另外壓一點：像房仲攝影的「窗景拉回」——室內曝光拉亮後窗外會整片死白，
    // 這裡讓窗外亮度往即時畫面的窗外靠（只靠 60%，保留一點「窗外比室內亮」的真實感）；
    // 逐色：連色調也往即時畫面靠（白平衡是為室內調的，窗外／地面不該跟著偏色）
    const pull = (ref, cur, k, lo, hi, out) => {
      const L = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      const g = THREE.MathUtils.clamp(Math.pow(L(ref.rgb) / Math.max(L(cur.rgb) * expo.value, 1e-6), k), lo, hi);   // 亮度
      const wb = [expo.gain.x, expo.gain.y, expo.gain.z];
      const ch = [0, 1, 2].map(i => THREE.MathUtils.clamp((ref.rgb[i] / L(ref.rgb)) / Math.max(cur.rgb[i] * wb[i] / L(cur.rgb), 1e-6), 0.7, 1.4));
      return out.set(g * ch[0], g * ch[1], g * ch[2]);
    };
    if(sky && sky.mean > 0) pull(expo.refSky, sky, DBG.skyPull, 0.15, 1, expo.sky);   // sky/gnd 量的是「還沒壓過」的原始影像
    // 俯瞰地面同理：亮度往即時畫面的米白底盤靠（建築本身照樣以室內測光為準）
    if(gnd && gnd.mean > 0) pull(expo.refGround, gnd, 0.9, 0.25, 4, expo.ground);   // 夜裡的地面幾乎沒受光，要多拉一點才接近即時畫面的深藍（上限 4：再高會把窗戶灑到地上的燈光放大成一圈橘光）
    Object.assign(stats, { groundGain: expo.ground.toArray().map(v => +v.toFixed(3)), skyGain: expo.sky.toArray().map(v => +v.toFixed(3)), exposure: +expo.value.toFixed(3), gain: expo.gain.toArray().map(v => +v.toFixed(3)),
                           refLogAvg: +ref.logAvg.toFixed(4), ptLogAvg: +m.logAvg.toFixed(4), cover: +m.cover.toFixed(2) });
  }
  function denoise(){
    const t0 = performance.now();
    const s = saveGL(); renderer.autoClear = true;
    const tex = pt.target.texture;
    if(DBG.denoise){
      demodMat.uniforms.tColor.value = tex; demodMat.uniforms.tAlb.value = T.alb.texture; demodMat.uniforms.tGeo.value = T.geo.texture;
      pass(demodMat, T.e0);
      let a = T.e0, b = T.e1;
      const P = camera.projectionMatrix.elements;   // 視角空間位置重建：x_ndc = (P0·x + P8·z)/−z → x = (ndc + P8)·d/P0（P8、P9＝鏡頭偏移，俯瞰取景會用到）
      atrousMat.uniforms.uProj.value.set(1 / P[0], 1 / P[5]);
      atrousMat.uniforms.uOff.value.set(P[8], P[9]);
      // 亮度容忍度：取樣少時放寬（大片牆面才不會一塊一塊），取樣多了收緊（角落的陰影細節回來）
      const spp = Math.max(1, Math.floor(pt.samples));
      atrousMat.uniforms.uSigL.value = DBG.sigL ?? THREE.MathUtils.clamp(4 + 6 * (1 - Math.log2(spp / 16) / 3), 4, 10);
      atrousMat.uniforms.tAlb.value = T.alb.texture; atrousMat.uniforms.tGeo.value = T.geo.texture;
      atrousMat.uniforms.uJit.value = DBG.jitter === false ? 0 : 1;
      for(let i = 0; i < 6; i++){
        atrousMat.uniforms.tIn.value = a.texture; atrousMat.uniforms.uStep.value = 1 << i; atrousMat.uniforms.uPass.value = i;   // 偏移只跟「第幾輪」有關：每次更新畫面同一個像素偏一樣，不會閃
        pass(atrousMat, b); [a, b] = [b, a];
      }
      remodMat.uniforms.tIn.value = a.texture; remodMat.uniforms.uRaw.value = 0;
    }else remodMat.uniforms.uRaw.value = 1;
    remodMat.uniforms.tColor.value = tex; remodMat.uniforms.tAlb.value = T.alb.texture; remodMat.uniforms.tGeo.value = T.geo.texture;
    remodMat.uniforms.uSky.value.copy(expo.sky); remodMat.uniforms.uGround.value.copy(expo.ground);
    pass(remodMat, T.out);
    loadGL(s);
    updateExposure(expo.n === 0);   // 第一次同步量（第一張就要亮度對）；之後非同步，不卡畫面
    denoiseMs = performance.now() - t0;
    stats.denoiseCpuMs = +denoiseMs.toFixed(1);
  }

  /* ---------- 10. 把目前的場景交給引擎 ---------- */
  function sizeFor(){
    const db = renderer.getDrawingBufferSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
    const css = db.x * db.y / (pr * pr);
    const k = Math.min(1, Math.sqrt((DBG.maxPx || CFG.maxPx) / css));     // 以 CSS 像素為準，太大才縮
    const scale = k / pr;                                  // 引擎的 renderScale 是相對「畫布實際像素」
    return { scale, w: Math.ceil(Math.floor(scale * db.x)), h: Math.ceil(Math.floor(scale * db.y)) };
  }
  function prepare(){
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);   // 上一輪還沒回來的非同步讀回不要擋到這一輪（見 syncRead）
    const S = sizeFor();
    pt.renderScale = S.scale;
    makeTargets(S.w, S.h);
    grid = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(S.w * S.h / CFG.tilePx))));
    pt.tiles.set(grid, grid);
    const bird = camera.position.y > ctx.H + 0.3;
    birdNow = bird;
    // (0) 先用一般畫面量「即時畫面的亮度與色調」（曝光／白平衡的目標）
    {
      const s = saveGL(); renderer.autoClear = true;
      const ref = rt(S.w, S.h, { samples: 4, depthBuffer: true });
      renderer.setRenderTarget(ref); renderer.render(scene, camera);
      loadGL(s);
      T.ref = ref;
    }
    // (a) 藏起引擎不該看到的東西
    const hidden = [], added = [], radii = [];
    const hide = o => { if(o && o.visible){ o.visible = false; hidden.push(o); } };
    hide(ctx.sky); hide(ctx.skyDome); if(ctx.lighting){ hide(ctx.lighting.sky); hide(ctx.lighting.catcher); }
    (ctx.labels || []).forEach(hide);
    const toHide = [];
    scene.traverseVisible(o => { if(o !== scene && shouldHide(o)) toHide.push(o); });
    toHide.forEach(hide);
    // (a1) 剖切（俯瞰時 lighting 把東西切到腰高）：把被切的物件換成真的切開的幾何＋切口
    const temp = [];
    const cutInfo = DBG.noCut ? { meshes: 0, tris: 0, maxY: 0 } : cutMeshes(hidden, added, temp);
    // (a2) 俯瞰：放一片「拍照專用」的地面（會受光、接得到建築的柔和影子，像展示模型放在桌上）；
    //      即時畫面的地面是不受光的純色（lighting 標了 noPhoto），這片只在交給引擎的那一瞬間存在
    if(bird){
      const gcol = (ctx.lighting && ctx.lighting.ground && ctx.lighting.ground.material && ctx.lighting.ground.material.color) || new THREE.Color(0xe2ddd4);
      photoGround.material.color.copy(gcol);
      const B = ctx.bounds;
      photoGround.position.set((B.x0 + B.x1) / 2, (ctx.lighting && ctx.lighting.ground ? ctx.lighting.ground.position.y : -0.302), (B.z0 + B.z1) / 2);
      scene.add(photoGround); added.push(photoGround);
    }
    if(!bird){
      const o = balconyOpening();
      if(o){
        pane.scale.set(o.at1 - o.at0, o.y1 - o.y0, 1);
        pane.position.set((o.at0 + o.at1) / 2, (o.y0 + o.y1) / 2, o.c0 - 0.005);
        scene.add(pane); added.push(pane);
      }
    }
    // (b) 材質換成拍照版
    emissiveKind.clear();
    for(const em of ctx.emissives || []) if(em && em.mat) emissiveKind.set(em.mat, em.kind || 'lamp');
    const swapped = [], meshes = [];
    scene.traverseVisible(o => {
      if(!o.isMesh) return;
      const orig = o.material, t = twin(orig, o);
      meshes.push([o, orig, t !== orig ? t : null]);
      if(t !== orig){ swapped.push([o, orig]); o.material = t; }
    });
    // (c) 參考圖（藏起東西之後、材質還沒換回來之前；用原材質的顏色）
    for(const [o, orig] of swapped) o.material = orig;
    renderGuides(meshes);
    for(const [o, orig, t] of meshes) if(t) o.material = t;
    // 量即時畫面（要用參考圖當遮罩，天空不算）；量不到就留著參考圖，之後再量（measureRef）
    expo.ref = expo.refSky = expo.refGround = null; expo.refTries = 0; T.bird = bird;
    measureRef();
    expo.value = 1; expo.gain.set(1, 1, 1); expo.n = 0; expo.sky.set(1, 1, 1); expo.ground.set(1, 1, 1); expo.pending = null;
    // (d) 天空、太陽、燈
    if(skyTex) skyTex.dispose();
    const model = skyModel();
    const sky = skyTex = makeSkyTexture(model);   // 環境光（引擎會複製一份做重要性取樣）＋背景（引擎直接用這張）
    const sun = arrangeSun(hidden, added);
    const lamps = lampCandidates(hidden);
    const bg = scene.background, env = scene.environment, envI = scene.environmentIntensity, bgI = scene.backgroundIntensity;
    scene.background = sky; scene.environment = sky;
    scene.environmentIntensity = 1; scene.backgroundIntensity = 1;
    let rooms = null, kept = 0, portals = 0, sunOn = !!sun;
    const M = pt._pathTracer.material;
    try{
      camera.updateMatrixWorld(true);
      const res = pt.setScene(scene, camera);
      // 看得到的房間 → 只留那些房間的燈；白天加窗口光源；太陽照不進這些房間就不用它；然後重新交一次燈光（不會重新編譯）
      rooms = visibleRooms(res && res.bvh, bird);
      kept = cullLamps(lamps, rooms, hidden, radii);
      if(sun && !sunUseful(sun, bird)){ scene.remove(sun); sunOn = false; }
      const daySky = sky.userData.upperMean > 0.08;
      if(!bird && daySky && DBG.portals !== false) portals = addPortals(rooms, model, added);
      M.photoPortals = portals ? 1 : 0;
      // 環境光（天空）一律開著：引擎已改成「隔著清玻璃不算天空」（窗口光源負責那一份），所以它只照得到
      // 直接看得到天空的面 ── 窗外的柱子、外牆、陽台、屋頂打開時的室內。關掉的話，從窗戶看出去的外牆會是一片黑。
      //（引擎平均挑燈，天空只是幾十盞裡的一盞，對室內雜點幾乎沒影響）
      M.environmentIntensity = DBG.env ?? 1;
      pt.updateLights();
      // 場景已經上傳到 GPU：把引擎留在 JS 裡的幾何快取（每個物件一份烘好的複本＋合併幾何＋BVH）丟掉，
      // 省下 100 MB 以上的記憶體（手機很需要）；下次按 📸 本來就會整個重建
      pt._generator = new lib.PathTracingSceneGenerator();
    }finally{
      scene.background = bg; scene.environment = env; scene.environmentIntensity = envI; scene.backgroundIntensity = bgI;
      added.forEach(l => scene.remove(l));
      swapped.forEach(([o, m]) => { o.material = m; });
      hidden.forEach(o => { o.visible = true; });
      radii.forEach(l => { l.radius = 0; });
      temp.forEach(g => g.dispose());
    }
    Object.assign(stats, { cutMeshes: cutInfo.meshes, cutTris: cutInfo.tris, cutLids: cutInfo.lids, cutFlips: cutInfo.flips, cutMaxY: cutInfo.maxY, w: S.w, h: S.h, grid, bird, sun: sunOn, lamps: kept, lampNames: keptNames.slice(), portals, env: M.environmentIntensity, rooms: rooms ? [...rooms] : [],
                           refLogAvg: expo.ref ? +expo.ref.logAvg.toFixed(4) : null, lights: pt._pathTracer.material.lights.count });
    log((bird ? '俯瞰' : (roomAt(camera.position.x, camera.position.z, 0.2) || '走道')) + '：' + S.w + '×' + S.h +
                '，太陽 ' + (sunOn ? '有' : '無') + '，窗口光源 ' + portals + '，室內燈 ' + kept + ' 盞，看得到 ' + (rooms ? [...rooms].join('/') : '') );
  }
  let skyTex = null;
  const photoGround = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ color: 0xe2ddd4, roughness: 1, metalness: 0 }));
  photoGround.rotation.x = -Math.PI / 2; photoGround.name = 'photo-ground';

  function makeTracer(){
    const P = new lib.WebGLPathTracer(renderer);
    P.renderToCanvas = false;      // 畫到畫布由我們自己來（降噪、曝光之後才顯示）
    P.rasterizeScene = false;
    P.dynamicLowRes = false;
    P.renderDelay = 0; P.minSamples = 1; P.fadeDuration = 0;
    P.bounces = DBG.bounces || CFG.bounces;
    P.transmissiveBounces = CFG.trans;
    P.filterGlossyFactor = 0.5;    // 壓掉亮面反射造成的亮點雜訊
    P.multipleImportanceSampling = true;
    P.textureSize.set(CFG.texSize, CFG.texSize);
    // 引擎第一次 update() 會逐一改三個 #define（景深／背景圖／霧），每改一個就觸發一次整支 shader 重新編譯；
    // 這支 shader 很大（Metal 上編一次要好幾秒），所以先一次把最終值填好，只編譯一次。
    const mat = P._pathTracer.material;
    Object.assign(mat.defines, { FEATURE_DOF: 0, FEATURE_BACKGROUND_MAP: 1, FEATURE_FOG: 0 });
    mat.needsUpdate = true;
    return P;
  }

  /* ---------- 11. 進出 ---------- */
  // 拍照中用不到、又會擋住畫面的介面：搖桿、準心；窄螢幕（手機）連左上角說明框也先收起來（離開時還原）
  const tucked = [];
  function tuck(){
    const ids = ['stick', 'cross'].concat(matchMedia('(max-width:760px)').matches ? ['hud'] : []);
    for(const id of ids){ const el = document.getElementById(id); if(el){ tucked.push([el, el.style.visibility]); el.style.visibility = 'hidden'; } }
  }
  function untuck(){ for(const [el, v] of tucked) el.style.visibility = v; tucked.length = 0; }
  function enter(){
    if(api.active) return;
    api.active = true;
    tuck();
    ui.style.display = 'flex'; saveBtn.disabled = true; barEl.style.width = '0%';
    renderer.domElement.style.pointerEvents = 'none';    // 拍照中不讓滑鼠／手指再轉動畫面
    if(photoBtn) photoBtn.classList.add('on');
    start();
  }
  function start(){
    ready = false; paused = false; lastShown = -1; restartPending = false;
    perFrame = 1; goodFrames = 0; slowFrames = 0; lastT = 0; tCompile = 0; denoisedAt = -1; lastDenoiseT = 0;
    if(fence){ gl.deleteSync(fence); fence = null; } waitFrames = 0;
    const my = ++session;
    tEnter = performance.now();
    setMsg(lib ? '📸 正在整理場景…' : '📸 正在載入拍照引擎…', '第一次會多等幾秒');
    (async () => {
      if(!lib) lib = await import(LIB_URL);
      if(my !== session) return;
      if(!pt) pt = makeTracer();
      else pt.bounces = DBG.bounces || CFG.bounces;
      if(DBG.texSize) pt.textureSize.set(DBG.texSize, DBG.texSize);
      if(DBG.defines){ Object.assign(pt._pathTracer.material.defines, DBG.defines); pt._pathTracer.material.needsUpdate = true; }
      setMsg('📸 正在整理場景…', '把牆、家具、燈光交給光線引擎');
      await new Promise(r => requestAnimationFrame(r));   // 讓上面那行字先畫出來
      if(my !== session) return;
      const t0 = performance.now();
      camera.updateMatrixWorld(true);
      camAtEnter.copy(camera.matrixWorld);
      roofAtEnter = ctx.roof ? ctx.roof.visible : null;
      prepare();
      ready = true;
      stats.prepareMs = Math.round(performance.now() - t0);
      log('scene ready in ' + stats.prepareMs + ' ms');
    })().catch(err => {
      console.error('[photo] 拍照級畫面啟動失敗：', err && err.stack || err);
      if(my !== session) return;
      setMsg('😥 這台裝置跑不動拍照級畫面', '已切回一般畫面');
      setTimeout(() => { if(my === session) exit(); }, 1800);
    });
  }
  function exit(){
    if(!api.active) return;
    api.active = false; ready = false; session++;
    ui.style.display = 'none';
    untuck();
    renderer.domElement.style.pointerEvents = '';
    if(photoBtn) photoBtn.classList.remove('on');
    if(wantStart && startEl){ startEl.style.display = 'flex'; }
    wantStart = false;
    if(pt) pt.reset();
    if(fence){ gl.deleteSync(fence); fence = null; }
    disposeTargets();                                  // 手機上把大張的暫存圖還給記憶體
    if(!(DBG.keepTracer ?? false)) freeTracer();       // 引擎的場景資料（BVH、材質貼圖陣列…）也一起還（下次按 📸 本來就整個重建）
    renderer.setRenderTarget(null);
  }
  // 把引擎佔的 GPU／JS 記憶體還回去：場景資料貼圖（BVH、頂點資料、材質、貼圖陣列、燈、天空）＋引擎本身的暫存圖＋shader。
  // 實測（手機畫質）不還的話離開後還佔 GPU 約 87 MB、JS 約 38 MB；電腦 162 MB＋43 MB
  function freeTracer(){
    if(!pt) return;
    const P = pt; pt = null;
    for(const tr of [P._pathTracer, P._lowResPathTracer]){
      const m = tr && tr.material;
      if(!m || !m.uniforms) continue;
      for(const k in m.uniforms){
        const v = m.uniforms[k] && m.uniforms[k].value;
        if(!v || v === skyTex) continue;
        try{
          if(v.renderTarget2DArray) v.renderTarget2DArray.dispose();         // 材質貼圖陣列：要丟整個 render target（只丟貼圖的話 GL 那份不會釋放）
          else if(typeof v.dispose === 'function') v.dispose();
          else if(v.tex && typeof v.tex.dispose === 'function') v.tex.dispose();
        }catch(e){}
      }
      try{ m.dispose(); }catch(e){}
    }
    try{ P.dispose(); }catch(e){}
    try{ P._lowResPathTracer.dispose(); }catch(e){}
    if(skyTex){ skyTex.dispose(); skyTex = null; }
  }
  function resize(){
    if(api.active) restartPending = true;   // 畫面比例變了＝構圖變了，重新開始算
  }

  /* ---------- 12. 每一格 ----------
     一格畫幾塊 tile 是「量出來」的：每批工作後面插一個 GPU 柵欄（fence），下一格先看它做完沒有——
     下一格就做完 → 下一批多畫一塊；拖了兩格以上 → 少畫一塊（塊太大就把畫面切得更細）。
     ⛔ 不能用 CPU 時間或幀間隔當預算 —— renderSample() 只是把指令丟給 GPU 就回來，
        GPU 沒回報的話指令會越堆越多（實測無頭 Chrome 這樣會整個分頁卡死被關掉）。
     畫布只在「有新的降噪結果」時才重畫；其他格完全不碰畫布（畫面停在上一張，GPU 全力算光線）。 */
  function render(){
    // 開場框（點擊進入）在放開滑鼠時會冒出來，拍照中先收起，離開再還原
    if(startEl && startEl.style.display !== 'none'){ wantStart = true; startEl.style.display = 'none'; }
    if(restartPending || (ready && (!camera.matrixWorld.equals(camAtEnter) || (ctx.roof && ctx.roof.visible !== roofAtEnter)))){
      restartPending = false; if(pt) pt.reset(); start(); return;
    }
    if(!ready || !pt) return;                       // 還在準備：畫布維持按下 📸 前的最後一格
    if(pt.isCompiling){
      if(!tCompile){ tCompile = performance.now(); setMsg('📸 光線引擎暖機中…', '第一次要準備光線程式，可能要等幾秒到幾十秒'); }
      lastT = 0;
      return;
    }
    if(tCompile){ stats.compileS = +((performance.now() - tCompile) / 1000).toFixed(1); log('shader compiled in ' + stats.compileS + ' s'); tCompile = 0; }
    const now = performance.now();
    const before = pt.samples;
    let issued = false;
    // GPU 還沒做完上一格交代的工作 → 這格不再加工作（不然指令會越堆越多，整個瀏覽器卡死）
    if(fence){
      if(gl.getSyncParameter(fence, gl.SYNC_STATUS) !== gl.SIGNALED){ waitFrames++; if(waitFrames < 600) return; }
      gl.deleteSync(fence); fence = null;
      // 上一批花了幾格才做完 → 調整這一批的份量
      if(waitFrames <= 0 && ++goodFrames >= 2){ perFrame = Math.min(grid * grid, perFrame + 1); goodFrames = 0; slowFrames = 0; }
      else if(waitFrames >= 2){
        goodFrames = 0; perFrame = Math.max(1, perFrame - 1);
        if(perFrame === 1 && waitFrames >= 4 && ++slowFrames >= 3 && grid < 10){ grid++; slowFrames = 0; pt.tiles.set(grid, grid); }
      }
      waitFrames = 0;
    }
    if(!paused){
      for(let i = 0; i < perFrame && pt.samples < CFG.cap; i++) pt.renderSample();
      if(pt.samples >= CFG.cap) paused = true;
      issued = true;
    }
    lastT = now;
    const s = Math.floor(pt.samples);
    if(s >= 1 && s !== Math.floor(before) || (s >= 1 && denoisedAt < 0)){
      // 每完成一輪取樣：前 16 輪每輪都更新畫面，之後視降噪花的時間拉開間隔
      const gap = s < 16 ? 0 : Math.max(250, denoiseMs * 12);
      if(now - lastDenoiseT >= gap || paused){
        denoise(); present(null); denoisedAt = s; lastDenoiseT = performance.now();
        if(denoisedAt === 1 && !stats.firstMs){ stats.firstMs = Math.round(performance.now() - tEnter); log('first image at ' + stats.firstMs + ' ms after enter'); }
      }
    }
    if(issued){ fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush(); }
    if(denoisedAt !== lastShown && performance.now() >= holdMsgUntil){   // 存圖的結果訊息先留 3 秒，不要馬上被進度蓋掉
      lastShown = denoisedAt;
      const pct = Math.min(100, Math.round(100 * denoisedAt / CFG.target));
      barEl.style.width = pct + '%';
      if(denoisedAt < 1){ setMsg('📸 開始計算光線…', '第一張馬上出來'); }
      else if(denoisedAt < CFG.target){ setMsg('📸 拍照級渲染中… <b>' + denoisedAt + '</b> 次取樣', '越等越乾淨；隨時可以先存圖'); saveBtn.disabled = false; }
      else if(!paused){ setMsg('✅ 拍照級畫面完成（<b>' + denoisedAt + '</b> 次取樣）', '還在慢慢精修，現在存圖就很好看了'); saveBtn.disabled = false; }
      else { setMsg('✅ 拍照級畫面完成（<b>' + denoisedAt + '</b> 次取樣）', '已經很乾淨，停止繼續計算'); saveBtn.disabled = false; }
    }
  }

  // 測試用：把目前的線性影像（降噪後、曝光前）與參考圖 G 讀出來（自動測試調曝光曲線用，正式流程不會呼叫）
  function readHDR(){
    if(!T || !ready) return null;
    const f = rt(T.w, T.h, { type: THREE.FloatType }), out = {};
    for(const [k, tex] of [['out', T.out.texture], ['geo', T.geo.texture], ['alb', T.alb.texture]]){
      copyMat.uniforms.tIn.value = tex; const s = saveGL(); pass(copyMat, f); loadGL(s);
      const buf = new Float32Array(T.w * T.h * 4); syncRead(f, T.w, T.h, buf); out[k] = buf;
    }
    f.dispose();
    return { w: T.w, h: T.h, ...out, expo: { value: expo.value, gain: expo.gain.toArray(), sky: expo.sky.toArray(), ground: expo.ground.toArray() },
             tmExp: renderer.toneMappingExposure, tm: renderer.toneMapping };
  }

  /* ---------- 13. 存成圖片：用路徑追蹤的原始解析度輸出（不是放大過的畫布） ---------- */
  // 畫出來的每個像素 alpha 都是 1（255）→ 讀回來不是 255 就表示讀取失敗（全 0 的空白圖），不能當成功
  function looksValid(px){ for(let i = 3; i < px.length; i += 4 * 61) if(px[i] !== 255) return false; return px[px.length - 1] === 255; }
  /* 存圖的出口：
     ・claude.ai 的 Artifact 框框裡：網頁自己不能下載（<a download> 會被擋、而且沒有任何錯誤）→ 走平台的 downloads 能力
       （需要發佈時宣告 capabilities {downloads:true}；使用者會看到一個確認視窗）
     ・自己電腦上直接開（沒有 window.claude）或平台把頁面單獨打開（不在框框裡）：照舊用 <a download>
     ・在框框裡但平台沒給這個能力 → 存圖按鈕藏起來（按了也存不下來，不要騙人說「已存成圖片」） */
  const framed = (() => { try{ return window.self !== window.top; }catch(e){ return true; } })();
  const claudeUse = window.claude && typeof window.claude.use === 'function' ? window.claude.use.bind(window.claude) : null;
  let saveVia = claudeUse ? 'pending' : 'anchor', dlCap = null, dlPromise = null;
  function showSaveBtn(){ saveBtn.style.display = saveVia === 'none' ? 'none' : ''; }
  if(claudeUse){
    dlPromise = Promise.resolve().then(() => claudeUse('downloads')).then(d => {
      dlCap = d || null;
      saveVia = dlCap ? 'cap' : (framed ? 'none' : 'anchor');
      showSaveBtn();
    }, () => { saveVia = framed ? 'none' : 'anchor'; showSaveBtn(); });
  }
  const hold = (html, sub, ms = 3200) => { setMsg(html, sub); holdMsgUntil = performance.now() + ms; lastShown = -2; };
  async function deliver(blob, name){
    if(saveVia === 'pending' && dlPromise){ setMsg('💾 準備存圖…', ''); await dlPromise; }
    if(saveVia === 'cap' && dlCap){
      try{
        await dlCap.save({ filename: name, data: blob });
        hold('💾 已存成圖片', name);
      }catch(e){
        const code = e && e.code;
        if(code === 'declined') hold('已取消存圖', '想存的話再按一次「💾 存成圖片」');
        else if(code === 'rate_limited') hold('😥 存圖視窗已經開著', '請先回應那個視窗，或稍等一下再按');
        else if(code === 'too_large') hold('😥 圖片太大存不下來', '');
        else { hold('😥 這裡不能存圖', '可以用螢幕截圖代替'); saveVia = 'none'; showSaveBtn(); }
      }
      return;
    }
    if(saveVia === 'none'){ hold('😥 這裡不能存圖', '可以用螢幕截圖代替'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    hold('💾 已存成圖片', name);
  }
  function savePng(){
    if(!ready || !pt || denoisedAt < 1 || !T) return;
    const w = T.w, h = T.h;
    const t8 = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, depthBuffer: false });
    const px = new Uint8Array(w * h * 4);
    let ok = false;
    for(let n = 0; n < 2 && !ok; n++){ present(t8); ok = syncRead(t8, w, h, px) && looksValid(px); }
    t8.dispose();
    if(!ok){ hold('😥 這次沒有存成功', '請再按一次「💾 存成圖片」'); return; }
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c2 = cv.getContext('2d'), img = c2.createImageData(w, h);
    for(let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);   // WebGL 是由下往上
    c2.putImageData(img, 0, 0);
    const hr = ctx.time ?? 14, hh = String(Math.floor(hr)).padStart(2, '0'), mm = String(Math.round((hr % 1) * 60)).padStart(2, '0');
    const where = camera.position.y > ctx.H + 0.3 ? '俯瞰' : (roomAt(camera.position.x, camera.position.z, 0.2) || '走道');
    const name = 'A8戶-' + where + '-' + hh + mm + '-' + denoisedAt + '次取樣.png';
    const fail = e => { console.error('[photo] 存圖失敗：', e); hold('😥 存圖失敗', '瀏覽器不允許讀取畫面'); };
    try{
      if(cv.toBlob) cv.toBlob(b => { if(b) deliver(b, name).catch(fail); else fail('toBlob 回傳空的'); }, 'image/png');
      else fetch(cv.toDataURL('image/png')).then(r => r.blob()).then(b => deliver(b, name)).catch(fail);
    }catch(e){ fail(e); }
  }
  saveBtn.onclick = savePng;
  exitBtn.onclick = () => exit();
  addEventListener('keydown', e => { if(e.code === 'Escape' && api.active) exit(); });
  renderer.domElement.addEventListener('webglcontextlost', () => { if(api.active) exit(); api.available = false; });

  return api;
}
