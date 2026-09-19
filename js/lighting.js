/* ============================================================
   lighting.js — 燈光、一天的時間（太陽路徑＋色溫）、天空、室內燈、後製（AO／泛光／調色）、實際畫出每一格
   ⭐ 場景裡所有 THREE.Light 都由這裡建立；家具模組只「登記」燈（ctx.lamps）與會發光的材質（ctx.emissives）
   介面：export default async buildLighting(ctx) → { setTime(hour), render(), resize(w,h), setMode(mode) }
   畫質：QUALITY 'high'（電腦）：自己串的後製（MSAA 浮點畫布 → GTAO 環境光遮蔽 → 夜間泛光 → 調色輸出＋抖色）
         俯瞰全屋：整棟在腰高剖切、切口補炭灰（§6b），配米白底盤＋接觸影（§3）
         QUALITY 'low'（手機）：直接畫、不做後製、陰影貼圖較小、燈池較小
         兩邊都有「自動畫質」：跑不動就自己降解析度（電腦再不行就關 AO）

   登記格式（給家具組）：
     ctx.lamps.push({ pos:Vector3, kind, room, color?, power? })
       kind：'pendant'｜'ceiling'｜'under'（往下打）、'floor'｜'table'｜'wall'（四面八方）
       power：亮度倍數，1 ＝ 這種燈的正常亮度（沒給就是 1；會夾在 0.3–1.6 之間）；晚上才亮（跟著時間滑桿）
     ctx.emissives.push({ mat, base, kind:'lamp'|'screen' })
       base ＝ 開燈時的 emissiveIntensity；lamp 只有晚上亮，screen 白天也微亮

   ⚠️ 三條效能規矩（改之前先看；數字都是實測 M4、1440×900、含家具）：
     1) 真正的燈數量固定（§5 燈池：電腦 6 聚光＋3 點光、手機 3＋2），白天晚上只調亮度 ──
        燈數一變 three 就把所有材質的 shader 重編（拉時間滑桿過黃昏會整頁卡 2–4.6 秒），
        燈多了也很貴（常駐 30 盞 24 ms／格、10 盞 6 ms、0 盞 3.4 ms）
     2) 太陽陰影只在「時間／模式／屋頂／場景物件」改變時重算，不是每格都算
     3) 後製全解析度只寫一次（§6）：EffectComposer 在 Retina 光流程就 18 ms、加 AO 泛光 70–90 ms；現在 16–20 ms
     4) 場景每格只畫「一趟」進 MSAA 畫布（俯瞰剖切的切口也在同一趟裡畫，§6b）：three 每畫完一趟就把多重取樣畫布作廢，
        第二趟疊上去在某些顯卡（實測 ANGLE Metal）會整片變黑
   比對用網址後門：?tm=agx|aces|neutral（換色調映射）、?ao=off、?cut=0（俯瞰不剖切）、?gov=0（關自動畫質）、?lv=N（指定畫質等級）
   ============================================================ */
export default async function buildLighting(ctx){
  const { THREE, scene, renderer, camera, R, H, QUALITY } = ctx;
  const LOW = QUALITY === 'low';
  const QS = new URLSearchParams(location.search);   // 比對用後門（見檔頭）
  const DEG = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };   // a<b：x 從 a 到 b 平滑 0→1
  const lerp = (a, b, t) => a + (b - a) * t;
  const C = hex => new THREE.Color(hex);
  const B = ctx.bounds || { x0: 0, z0: 0, x1: ctx.W, z1: ctx.D };
  const CX = (B.x0 + B.x1) / 2, CZ = (B.z0 + B.z1) / 2;

  /* ============================================================
     0. 色調映射＋調色：Neutral（白牆乾淨、木頭保暖）之後再收一點彩度（無印的霧感，對照 target_muji 的低彩度）
        做法：改寫 three 的 CustomToneMapping（整個網頁共用一份）→ 手機（材質裡直接映射）與電腦（最後一道輸出）
        用的是同一段程式，兩邊的顏色一致
     ============================================================ */
  const SAT = 0.86;   // 調色後的彩度（1 ＝ 不動）
  const GRADE = `vec3 CustomToneMapping( vec3 color ) {
	color = NeutralToneMapping( color );
	float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
	return max( mix( vec3( l ), color, ${SAT.toFixed(3)} ), 0.0 );
}`;
  const TM_STUB = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  const gradeOK = chunk.includes(TM_STUB) || chunk.includes(GRADE);
  if(gradeOK) THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(TM_STUB, GRADE);
  const TM = { neutral: THREE.NeutralToneMapping, agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping };
  const tmName = QS.get('tm');
  renderer.toneMapping = TM[tmName] || (gradeOK ? THREE.CustomToneMapping : THREE.NeutralToneMapping);
  // 燈泡半徑：three 的點光／聚光在 10 cm 內才開始限制亮度（1/d² 最多放大 100 倍）→ 燈罩、貼牆的鏡燈、床頭燈旁的牆
  // 會被打出一塊爆白。改成 25 cm（最多 16 倍，等於把燈當成一顆小球而不是一個點），3 m 外的吸頂燈完全不受影響
  const ATT_OLD = 'max( pow( lightDistance, decayExponent ), 0.01 )', ATT_NEW = 'max( pow( lightDistance, decayExponent ), 0.0625 )';
  THREE.ShaderChunk.lights_pars_begin = THREE.ShaderChunk.lights_pars_begin.replace(ATT_OLD, ATT_NEW);
  // 俯瞰剖切的抗鋸齒（見 §6b）：掛了 A8_CUT_A2C 的材質，輸出的 alpha 只看「剖切覆蓋率」（其餘跟不透明材質一樣）
  const OPQ_OLD = '#ifdef OPAQUE\ndiffuseColor.a = 1.0;\n#endif';
  if(THREE.ShaderChunk.opaque_fragment.includes(OPQ_OLD) && !THREE.ShaderChunk.opaque_fragment.includes('A8_CUT_A2C'))
    THREE.ShaderChunk.opaque_fragment = THREE.ShaderChunk.opaque_fragment.replace(OPQ_OLD,
      OPQ_OLD + '\n#if defined( A8_CUT_A2C ) && defined( ALPHA_TO_COVERAGE ) && NUM_CLIPPING_PLANES > 0\ndiffuseColor.a = clipOpacity;\n#endif');
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  // PCF 陰影（半徑可調的柔邊）。⚠️ 不用 VSM：實測 VSM 在室內會把「太陽從窗戶照進來的光斑」整片吃掉
  // （窗口旁都是屋頂和牆，模糊後的深度分布讓 Chebyshev 判定全在陰影裡），PCF 才照得出窗框的影子
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;          // 陰影由 §8 自己決定什麼時候重算
  scene.background = null;                        // 背景由天空圓頂負責（見 §3）
  if(scene.fog){ scene.fog.far = 90; }            // 遠處地面慢慢融進地平線顏色（near 由 main.js 依模式設定）

  /* ============================================================
     1. 太陽路徑：台北 25°N，取春秋平均赤緯 +8°（日出約 5:55、日落約 18:25、正午高度約 73°、偏南）
     ============================================================ */
  const LAT = 25.03 * DEG, DECL = 8 * DEG, NOON = 12.15;   // 台灣的太陽正午約 12:09
  function sunAt(h){
    const ha = (h - NOON) * 15 * DEG;   // 時角
    const sinAlt = Math.sin(LAT) * Math.sin(DECL) + Math.cos(LAT) * Math.cos(DECL) * Math.cos(ha);
    const alt = Math.asin(clamp(sinAlt, -1, 1));
    const cosAz = (Math.sin(DECL) - Math.sin(alt) * Math.sin(LAT)) / (Math.cos(alt) * Math.cos(LAT) || 1e-6);
    let az = Math.acos(clamp(cosAz, -1, 1));   // 方位角：從北順時針
    if(ha > 0) az = 2 * Math.PI - az;          // 下午在西邊
    return { alt, az };
  }
  // 方位 → 單位向量（X 東、Z 南、Y 上）
  const dirOf = (alt, az) => new THREE.Vector3(Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az));
  const MOON_DIR = dirOf(55 * DEG, 200 * DEG);   // 夜裡的「月光」：固定高掛偏南，很弱、偏藍
  const SUN_LOW = C(0xffb26b), SUN_MID = C(0xffdcb8), SUN_HIGH = C(0xfff8f1), MOON = C(0x8fa6cf);
  function sunColor(out, e){   // e = 太陽高度角（度）：低 → 橘暖、中 → 暖、高 → 近白
    return e < 12 ? out.copy(SUN_LOW).lerp(SUN_MID, smooth(-2, 12, e)) : out.copy(SUN_MID).lerp(SUN_HIGH, smooth(12, 40, e));
  }
  // 天空／天光調色盤（白天 / 黃昏 / 藍調時刻 / 夜晚）
  //   zen 天頂、hor 地平線（＝霧的顏色）、gnd 地面底盤（純色、不受光 → 俯瞰時整片背景就是這個顏色）
  //   白天的 hor／gnd 故意給超過 1 的亮度：經過色調映射後才會是目標圖那種約 RGB(243,240,233) 的米白（純白 1.0 只到 240 灰白）
  //   藍調時刻（太陽在地平線下約 4°–10°）：天光轉成灰藍 → 暖黃燈光的小屋浮在藍色裡；不插這一段的話，
  //   RGB 直接從桃色混到夜色會經過一段髒髒的咖啡色
  const HDR = (hex, k) => C(hex).multiplyScalar(k);   // 亮度可以超過 1 的顏色
  const PAL = {
    day  : { zen: C(0xa9c3db), hor: HDR(0xfffcf7, 1.14), gnd: HDR(0xfffaf2, 1.12), hemiS: C(0xeef1f6), hemiG: C(0xdad4cb) },
    dusk : { zen: C(0x6f7ea8), hor: C(0xefc9a6), gnd: C(0xd9c3ae), hemiS: C(0xc4bccf), hemiG: C(0xa8917c) },
    blue : { zen: C(0x22335e), hor: C(0x6a7898), gnd: C(0x49536b), hemiS: C(0x5d6d96), hemiG: C(0x3b4050) },
    night: { zen: C(0x05080f), hor: C(0x121824), gnd: C(0x14171d), hemiS: C(0x3a4660), hemiG: C(0x2a2624) },
  };
  const palTmp = {}; for(const k in PAL.day) palTmp[k] = new THREE.Color();
  function palette(e){   // 依太陽高度角把四段調色盤混成當下的顏色（夜 → 藍調 → 黃昏 → 白天）
    const kBlue = smooth(-13, -6, e), kDusk = smooth(-4.5, 1.5, e), kDay = smooth(2, 24, e);
    for(const k in PAL.day) palTmp[k].copy(PAL.night[k]).lerp(PAL.blue[k], kBlue).lerp(PAL.dusk[k], kDusk).lerp(PAL.day[k], kDay);
    return palTmp;
  }
  // 夜裡的「室內反光」：燈打到地板／牆再彈回來的暖光（半球光的地面色 → 天花板朝下的面也會微亮，不會一片死黑）
  const BOUNCE_S = C(0x6e5a48), BOUNCE_G = C(0xc79a6c);

  /* ============================================================
     2. 主要光源：太陽（唯一投影的燈）＋ 半球天光
     ============================================================ */
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 80;   // 罩住整棟＋地面上的落影
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.015;
  sun.shadow.radius = 2.5;
  sun.target.position.set(CX, 0, CZ);
  scene.add(sun, sun.target);
  // 走動模式：建築（牆、屋頂…）用「朝太陽那一面」畫進陰影貼圖（three 預設是背面）：
  //   預設時屋頂記下的是天花板底面，剛好壓在牆頂上 → 牆貼天花板那一條會漏光（走動時牆角一條鋸齒狀亮帶）；
  //   改成屋頂的上表面（再高 12 cm）就擋住了。實測窗戶照進來的光斑、地板、外牆都沒有出現陰影痘（acne）
  // 俯瞰模式要改回預設（背面）：牆和柱子被剖切成「開口的盒子」，只記朝太陽那面的話，盒子從太陽看是空心的 → 幾乎沒有影子
  //   （俯瞰時屋頂是關的，天花板漏光的問題不存在）
  const archOpaque = Object.values(ctx.archMaterials || {}).filter(m => m && !m.transparent);
  const archShadowSide = walk => { for(const m of archOpaque) m.shadowSide = walk ? THREE.FrontSide : null; };
  archShadowSide(true);
  const hemi = new THREE.HemisphereLight(0xe6edf6, 0xd8ccbb, 1.0); scene.add(hemi);

  /* ============================================================
     3. 地面（暖灰底盤：純色不受光、只吃霧）＋ 只接影子的透明面 ＋ 建築腳下的柔和接觸影 ＋ 天空圓頂
        地面不受光的理由：受光的地面會比霧色亮，遠處就出現一條「亮→暗→亮」的地平線帶；
        純色地面 + 霧 → 由 gnd 平順融進 hor，俯瞰時整片背景是一體的米白
        抖色（dithering）：大片平滑漸層在 8 位元螢幕上會出現一圈圈色階（夜間俯瞰最明顯）──
        手機在這裡抖（直接畫到螢幕）；電腦在最後一道輸出抖（浮點畫面裡抖，轉 sRGB 後暗處會變成明顯雜點）
     ============================================================ */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240, 32, 32), new THREE.MeshBasicMaterial({ color: 0xe0dad0, dithering: LOW }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.302; ground.name = 'ground';
  ground.userData.noPhoto = true;   // 拍照模組不要把這片不受光的底盤當成發光面
  scene.add(ground);
  // 影子承接面：只有太陽影子那裡有顏色，其餘全透明
  const catcherMat = new THREE.ShadowMaterial({ color: 0x3f382f, opacity: 0.22, depthWrite: false });
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), catcherMat);
  catcher.rotation.x = -Math.PI / 2; catcher.position.set(CX, -0.300, CZ); catcher.receiveShadow = true;
  catcher.renderOrder = -6; catcher.name = 'shadow-catcher'; catcher.userData.noPhoto = true;
  scene.add(catcher);
  let decalMat;
  {
    // 接觸影：把底盤與三支外柱的腳印畫成一張模糊的影子貼在地面上（用 shadowBlur，所有瀏覽器都支援）
    const FOOT = [[-0.15, -0.15, 9.126, 10.571], [-1.131, -1.16, 0, 0], [8.2, -1.108, 9.314, 0.023], [-1.108, 8.257, 0.036, 9.399]];
    const M = 1.5, x0 = -1.131 - M, z0 = -1.16 - M, x1 = 9.314 + M, z1 = 10.571 + M;
    const cv = document.createElement('canvas'); cv.width = cv.height = 512;
    const c = cv.getContext('2d'), sx = 512 / (x1 - x0), sz = 512 / (z1 - z0);
    c.shadowColor = 'rgba(0,0,0,1)'; c.shadowBlur = 34; c.shadowOffsetX = 2000; c.fillStyle = '#000';
    for(const f of FOOT) c.fillRect((f[0] - x0) * sx - 2000, (f[1] - z0) * sz, (f[2] - f[0]) * sx, (f[3] - f[1]) * sz);   // 本體畫在畫布外，只留影子
    const tex = new THREE.CanvasTexture(cv);
    decalMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, opacity: .30, depthWrite: false });
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), decalMat);
    decal.rotation.x = -Math.PI / 2; decal.position.set((x0 + x1) / 2, -0.298, (z0 + z1) / 2); decal.renderOrder = -5; decal.name = 'contact-shadow';
    decal.userData.noPhoto = true;
    scene.add(decal); ctx.contactShadow = decal;
  }
  // 天空圓頂：天頂／地平／地面三色漸層 ＋ 太陽圓盤與暈；顏色跟著時間；取代 arch 的頂點色圓頂
  // （arch 的 ctx.sky 留在場景裡但隱藏：拍照模組會讀它的頂點色當天空，它的顏色仍由 arch 每格更新）
  if(ctx.sky) ctx.sky.visible = false;
  const skyU = {
    uZenith: { value: C(0xa9c3db) }, uHorizon: { value: C(0xe6e2da) }, uGround: { value: C(0xe6e2da) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: C(0xffffff) }, uGlow: { value: 0.3 }, uDisc: { value: 3 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(120, LOW ? 24 : 40, LOW ? 12 : 20), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false, dithering: LOW,
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uZenith, uHorizon, uGround, uSunDir, uSunCol; uniform float uGlow, uDisc; varying vec3 vDir;
      #include <common>
      #include <dithering_pars_fragment>
      void main(){
        vec3 d = normalize(vDir); float y = d.y;
        vec3 c = y >= 0.0 ? mix(uHorizon, uZenith, pow(y, 0.55)) : mix(uHorizon, uGround, clamp(-y * 6.0, 0.0, 1.0));
        float ca = dot(d, uSunDir);
        float glow = pow(max(ca, 0.0), 8.0) * (0.6 + 0.4 * (1.0 - clamp(uSunDir.y * 2.0, 0.0, 1.0)));   // 太陽低時暈比較大
        float disc = smoothstep(0.99955, 0.99985, ca);
        c += uSunCol * (glow * uGlow + disc * uDisc);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <dithering_fragment>
      }`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; sky.name = 'sky-dome';
  sky.userData.noPhoto = true;
  scene.add(sky); ctx.skyDome = sky;

  /* ============================================================
     4. 室內的「虛擬燈」清單：窗光（白天）、每間房的吸頂燈、家具登記的燈（晚上）
        ⚠️ 這些不是真的 THREE.Light —— 真正的燈只有 §5 的固定小燈池，每一刻把「最有關係」的虛擬燈指派進去
        理由（實測 M4、1440×900、含家具）：燈常駐 30 盞 24 ms／格、20 盞 10 ms、10 盞 6 ms、0 盞 3.4 ms ──
        燈是整個畫面最貴的東西；而且燈數一變就全部 shader 重編（拉時間滑桿過黃昏整頁卡 2–4.6 秒）
     ============================================================ */
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const VL = [];   // { type:'spot'|'point', group:'win'|'ceil'|'lamp', room, pos, tgt, color, angle, pen, dist, base, i }
  const roomAt = (x, z) => { for(const k in R) if(inRoom(k, x, z)) return k; return null; };
  function inRoom(name, x, z){ const r = R[name]; return (r.rects || [[r.x0, r.z0, r.x1, r.z1]]).some(q => x >= q[0] && x <= q[2] && z >= q[1] && z <= q[3]); }

  // 4a. 窗光：每一面窗一盞寬角聚光燈，從窗口往室內打（白天天光從窗戶擴散進來的那一層）；太陽照到的那一面稍亮
  const wgroups = new Map();
  for(const w of ctx.windows || []){
    if(!w.normal) continue;
    const key = w.room + '|' + w.normal.join(',');
    let g = wgroups.get(key);
    if(!g){ g = { room: w.room, normal: w.normal, axis: w.axis, a0: 1e9, a1: -1e9, c0: w.c0, c1: w.c1, y0: w.y0, y1: w.y1, area: 0 }; wgroups.set(key, g); }
    g.a0 = Math.min(g.a0, w.at0); g.a1 = Math.max(g.a1, w.at1); g.area += w.w * (w.y1 - w.y0);
  }
  // 陽台沒有玻璃：女兒牆上方那一大片開口也算一面「窗」
  if(R['陽台']) wgroups.set('陽台|open', { room: '陽台', normal: [0, 1], axis: 'x', a0: 0.055, a1: 3.056, c0: 9.987, c1: 10.219, y0: 1.10, y1: H, area: 3.0 * (H - 1.10) * 0.6 });
  for(const g of wgroups.values()){
    const n = g.normal, mid = (g.a0 + g.a1) / 2, ym = (g.y0 + g.y1) / 2;
    let x, z;
    // 燈放在玻璃「外側」5 cm：玻璃背面不受光 → 不會在每片玻璃上映出一顆亮點
    if(g.axis === 'x'){ const outer = n[1] < 0 ? g.c0 : g.c1; x = mid; z = outer + n[1] * 0.05; }
    else               { const outer = n[0] < 0 ? g.c0 : g.c1; z = mid; x = outer + n[0] * 0.05; }
    // 半角 66°、邊緣很軟：窗邊天花板只會有一片柔柔的亮（不是一顆熱點）
    VL.push({ type: 'spot', group: 'win', room: g.room, normal: n, pos: V3(x, ym, z), tgt: V3(x - n[0] * 3.8, 0.2, z - n[1] * 3.8),
              color: C(0xfaf6ee), angle: 66 * DEG, pen: 0.9, dist: 9, base: 2.1 * g.area, i: 0 });
  }

  // 清玻璃／霧玻璃：關掉「燈光的直接高光」（保留環境反射）— 不然每片玻璃都會映出窗光燈與室內燈的一顆亮點；
  // 晚上再把玻璃自己的漫射壓低 → 夜裡的窗是暗的（映著一點室內），不會變成一片灰白的霧
  const glassU = { uGlassDiffuse: { value: 1 } };
  for(const m of [ctx.archMaterials && ctx.archMaterials.GL, ctx.archMaterials && ctx.archMaterials.GLF, ctx.archMaterials && ctx.archMaterials.GLS]){
    if(!m) continue;
    m.onBeforeCompile = sh => {
      sh.uniforms.uGlassDiffuse = glassU.uGlassDiffuse;
      sh.fragmentShader = 'uniform float uGlassDiffuse;\n' + sh.fragmentShader.replace('#include <lights_fragment_end>',
        '#include <lights_fragment_end>\n\treflectedLight.directSpecular = vec3( 0.0 );\n\treflectedLight.directDiffuse *= uGlassDiffuse;\n\treflectedLight.indirectDiffuse *= uGlassDiffuse;');
    };
    m.customProgramCacheKey = () => 'glass-no-direct-specular-v2';
    m.needsUpdate = true;
  }

  // 4b. 每間房一盞吸頂燈：燈具本體（白圈＋會發光的乳白罩，每間都有）＋ 往下打的寬角光（半角 86°：
  //     天花板不會被打出一顆白點、牆的上緣留一點暗、地上一圈暖光 → 夜間俯瞰像參考影片的溫暖小屋）
  //     家具組若已在那間房登記 'ceiling' 燈就不重複放（'pendant' 是餐桌吊燈那種重點燈，房間照明照放）
  const lampPos = l => l.pos && l.pos.isVector3 ? l.pos : V3(...(l.pos || [0, 0, 0]));
  const hasCeilingLamp = name => (ctx.lamps || []).some(l => l.kind === 'ceiling' && (l.room === name || inRoom(name, lampPos(l).x, lampPos(l).z)));
  const fixWhite = new THREE.MeshStandardMaterial({ color: 0xf7f6f3, roughness: .5 });
  const fixGlow  = new THREE.MeshStandardMaterial({ color: 0xfff4e4, emissive: 0xffdcae, emissiveIntensity: 0, roughness: .6 });
  const fixtures = new THREE.Group(); fixtures.name = 'ceiling-fixtures'; scene.add(fixtures);
  const ringGeo = new THREE.CylinderGeometry(1, 1, 0.045, 28), discGeo = new THREE.CylinderGeometry(1, 1, 0.012, 28);
  for(const k of Object.keys(R).sort((a, b) => R[b].area - R[a].area)){
    if(hasCeilingLamp(k)) continue;
    const r = R[k], [lx, lz] = r.label;
    const rad = r.area < 6 ? 0.10 : 0.16;
    const ring = new THREE.Mesh(ringGeo, fixWhite); ring.scale.set(rad, 1, rad); ring.position.set(lx, H - 0.0225, lz);
    const disc = new THREE.Mesh(discGeo, fixGlow);  disc.scale.set(rad * 0.9, 1, rad * 0.9); disc.position.set(lx, H - 0.048, lz);
    fixtures.add(ring, disc);
    // 約 3000K 的暖白；亮度跟房間大小走（大房間亮、小房間暗一點）
    VL.push({ type: 'spot', group: 'ceil', room: k, pos: V3(lx, H - 0.10, lz), tgt: V3(lx, 0, lz),
              color: C(0xffd7ad), angle: 86 * DEG, pen: 0.45, dist: 8, base: clamp(0.62 * r.area + 2.2, 4.2, 13), i: 0 });
  }

  // 4c. 家具登記的燈（ctx.lamps）：power 是「倍數」（1 ＝ 正常）；各組傳的數字單位不一（1.0／1.2 與 4／6／8 都有），
  //     這裡一律夾在 0.3–1.6，不會有燈暴亮或全暗。之後才登記的燈，下一次 setTime 會補進清單
  const KIND = {   // 每種燈的正常亮度（three 的 candela）、光源型態、照射距離
    pendant: { i: 5.0, spot: true, dist: 6.0, angle: 70 },
    ceiling: { i: 9.0, spot: true, dist: 8.0, angle: 86 },
    under  : { i: 1.2, spot: true, dist: 2.0, angle: 75 },
    floor  : { i: 2.2, dist: 6.0 },
    table  : { i: 0.9, dist: 4.0 },
    wall   : { i: 0.7, dist: 3.5 },
  };
  const lampMult = l => clamp(Number.isFinite(+l.power) ? +l.power : 1, 0.3, 1.6);
  // 貼牆的燈（鏡前燈、壁燈）：光源往房間裡挪到離牆 30 cm，不然旁邊那面牆會被打出一塊爆白
  function offWall(pos, room){
    const r = room && R[room]; if(!r) return pos;
    for(const q of r.rects || []){
      if(pos.x < q[0] - 0.05 || pos.x > q[2] + 0.05 || pos.z < q[1] - 0.05 || pos.z > q[3] + 0.05) continue;
      const M = 0.30;
      if(q[2] - q[0] > 2 * M) pos.x = clamp(pos.x, q[0] + M, q[2] - M);
      if(q[3] - q[1] > 2 * M) pos.z = clamp(pos.z, q[1] + M, q[3] - M);
      break;
    }
    return pos;
  }
  const adopted = new Set();
  function adoptLamps(){
    for(const l of ctx.lamps || []){
      if(adopted.has(l)) continue;
      adopted.add(l);
      const k = KIND[l.kind] || KIND.table, pos = lampPos(l).clone(), room = l.room || roomAt(pos.x, pos.z);
      if(!k.spot) offWall(pos, room);
      VL.push({ type: k.spot ? 'spot' : 'point', group: 'lamp', kind: l.kind, room, pos, tgt: V3(pos.x, 0, pos.z),
                color: C(l.color != null ? l.color : 0xffc994), angle: (k.angle || 86) * DEG, pen: 0.45, dist: k.dist, base: k.i * lampMult(l), i: 0 });
    }
  }
  adoptLamps();

  /* ============================================================
     5. 燈池：數量固定的真燈（電腦 6 聚光＋3 點光、手機 3＋2），建好就不再增減
        每 0.2 秒重排一次：走動 → 人在的那間房優先、越近越優先；俯瞰 → 最亮的優先（大房間）
        換燈時先淡出再淡入（0.3 秒）；瞬移／切模式時直接到位
     ============================================================ */
  const NSPOT = LOW ? 3 : 6, NPOINT = LOW ? 2 : 3;
  const slots = [];
  for(let n = 0; n < NSPOT; n++){ const l = new THREE.SpotLight(0xffffff, 0, 8, 1, 0.5, 2); l.name = 'pool-spot-' + n; scene.add(l, l.target); slots.push({ light: l, type: 'spot', vl: null, want: null, f: 0 }); }
  for(let n = 0; n < NPOINT; n++){ const l = new THREE.PointLight(0xffffff, 0, 6, 2); l.name = 'pool-point-' + n; scene.add(l); slots.push({ light: l, type: 'point', vl: null, want: null, f: 0 }); }
  function bind(slot, vl){
    slot.vl = vl;
    if(!vl) return;
    const l = slot.light;
    l.position.copy(vl.pos); l.color.copy(vl.color); l.distance = vl.dist;
    if(slot.type === 'spot'){ l.target.position.copy(vl.tgt); l.angle = vl.angle; l.penumbra = vl.pen; }
  }
  let modeName = 'walk';
  function plan(snap){
    const walk = modeName === 'walk';
    const cx = camera.position.x, cz = camera.position.z, camRoom = roomAt(cx, cz);
    for(const type of ['spot', 'point']){
      const ss = slots.filter(s => s.type === type);
      const held = new Set(ss.map(s => s.vl));
      const ranked = [];
      for(const v of VL){
        if(v.type !== type || v.i <= 1e-3) continue;
        let sc = v.i;
        if(walk){ const dx = v.pos.x - cx, dz = v.pos.z - cz; sc *= (v.room === camRoom ? 4 : 1) / (1 + (dx * dx + dz * dz) / 4); }
        if(held.has(v)) sc *= 1.25;   // 已經在燈池裡的稍微優先 → 分數差不多時不會來回換
        ranked.push([v, sc]);
      }
      ranked.sort((a, b) => b[1] - a[1]);
      const top = ranked.slice(0, ss.length).map(a => a[0]);
      const free = [];
      for(const s of ss){ if(top.includes(s.vl)) s.want = s.vl; else free.push(s); }
      const missing = top.filter(v => !held.has(v));
      free.forEach((s, n) => { s.want = missing[n] || null; });
      if(snap) for(const s of ss){ bind(s, s.want); s.f = s.want ? 1 : 0; }
    }
  }
  const FADE = 1 / 0.3;
  let planT = 0;
  const lastCam = camera.position.clone();
  function poolTick(dt){
    const jump = camera.position.distanceToSquared(lastCam) > 1.5 * 1.5;   // 瞬移（快速傳送／切模式）
    lastCam.copy(camera.position);
    planT += dt;
    if(jump || planT > 0.2){ planT = 0; plan(jump); }
    for(const s of slots){
      if(s.want !== s.vl){ s.f -= dt * FADE; if(s.f <= 0){ s.f = 0; bind(s, s.want); } }
      else if(s.vl && s.f < 1) s.f = Math.min(1, s.f + dt * FADE);
      s.light.intensity = s.vl ? s.vl.i * s.f : 0;
    }
  }

  /* ============================================================
     5b. 地板光暈（假的光，不是 THREE.Light）：燈池只有 6 盞（手機 3 盞），晚上俯瞰時分不到真燈的房間會整間暗掉、
         走動時從門口看隔壁房也是黑的 → 每間房的主燈（吸頂燈）下面補一片很便宜的暖色光暈（加法混色的半透明地板貼片，
         範圍只到那間房的牆內、會被家具擋住）；那盞燈一分到真燈就跟著淡掉（跟燈池同步交叉淡入淡出）
         ⚠️ 不增加任何真燈（見檔頭規矩 1）；userData.noPhoto：拍照模式有真的燈，不要這片假的
     ============================================================ */
  const glowTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    for(const [t, a] of [[0, 1], [0.25, 0.78], [0.5, 0.42], [0.75, 0.13], [1, 0]]) g.addColorStop(t, 'rgba(255,255,255,' + a + ')');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  })();
  const GLOW_Y = 0.062;                                   // 地板完成面 0.045、地毯頂 0.057 之上
  const GLOW_K = LOW ? { bird: 0.34, walk: 0.20 } : { bird: 0.30, walk: 0.16 };
  const glowGroup = new THREE.Group(); glowGroup.name = 'room-glow'; glowGroup.userData.noPhoto = true; glowGroup.userData.noCut = true; scene.add(glowGroup);
  const glows = [], glowFor = new Set();
  function ensureGlows(){
    for(const v of VL){
      if(glowFor.has(v) || v.type !== 'spot' || !(v.group === 'ceil' || (v.group === 'lamp' && v.kind === 'ceiling'))) continue;
      const r = v.room && R[v.room]; if(!r) continue;
      glowFor.add(v);
      const rects = r.rects || [[r.x0, r.z0, r.x1, r.z1]];
      const area = rects.reduce((a, q) => a + (q[2] - q[0]) * (q[3] - q[1]), 0);
      const rad = clamp(Math.sqrt(area) * 0.85, 1.4, 3.4), cx = v.pos.x, cz = v.pos.z;
      const mat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffc48c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
                                                depthWrite: false, fog: false, toneMapped: false });
      mat.userData.glow = true;
      for(const q of rects){
        const g = new THREE.PlaneGeometry(q[2] - q[0], q[3] - q[1]); g.rotateX(-Math.PI / 2); g.translate((q[0] + q[2]) / 2, GLOW_Y, (q[1] + q[3]) / 2);
        const P = g.attributes.position, UV = g.attributes.uv;
        for(let i = 0; i < P.count; i++) UV.setXY(i, 0.5 + (P.getX(i) - cx) / (2 * rad), 0.5 - (P.getZ(i) - cz) / (2 * rad));
        const m = new THREE.Mesh(g, mat);
        m.name = 'room-glow:' + v.room; m.renderOrder = 5; m.castShadow = m.receiveShadow = false; m.visible = false;
        m.userData.noPhoto = true; m.userData.noCut = true; m.raycast = () => {};
        glowGroup.add(m);
        glows.push({ v, m, mat, k: clamp(Math.sqrt(v.base / 9), 0.7, 1.15) });
      }
    }
  }
  function glowTick(){
    const k = modeName === 'walk' ? GLOW_K.walk : GLOW_K.bird;
    for(const g of glows){
      let bound = 0;
      for(const s of slots) if(s.vl === g.v) bound = Math.max(bound, s.f);
      const on = g.v.base > 0 ? g.v.i / (g.v.base * (mode.lampK || 1)) : 0;   // 0 白天 → 1 晚上
      const o = k * g.k * on * (1 - bound);
      g.mat.opacity = o; g.m.visible = o > 0.004;
    }
  }

  /* ============================================================
     6. 後製（只有電腦）── 自己串的精簡流程（不用 EffectComposer）：
          ① 場景 → 一張 MSAA 浮點畫布（附深度貼圖）
          ② AO（GTAO）與去雜訊：大約「螢幕的 CSS 像素」解析度；法線由深度推回來（不必把整個場景再畫一次）
          ③ 夜間泛光：從半解析度往下做
          ④ 最後一道全螢幕：顏色 × AO（看深度放大：每個像素只拿同一個面的 AO）＋ 泛光 → 色調映射＋調色 → sRGB → 抖色
        理由（實測 M4）：EffectComposer 每一步都要寫一次全解析度的 MSAA 浮點畫布，Retina（像素比 2）光是流程本身
        就 18 ms（直接畫 6.8 ms），加上 AO 與泛光 70–90 ms；這裡全解析度只寫一次
        另有「自動降解析度」（§8）：一台電腦跑不動時先降畫布解析度、再關 AO，不會卡
     ============================================================ */
  let post = null, aoPass = null, bloomPass = null;
  const AO_OFF = QS.get('ao') === 'off';   // 比對用後門：?ao=off
  // 後製的三個檔案載不到（網路斷一下、檔案被擋）→ 不要整頁卡在載入畫面：退回「直接畫」（跟手機同一條路，只是少了 AO／泛光）
  let postMods = null;
  if(!LOW){
    try{
      postMods = await Promise.all([
        import('three/addons/postprocessing/GTAOPass.js'),
        import('three/addons/postprocessing/UnrealBloomPass.js'),
        import('three/addons/postprocessing/Pass.js'),
      ]);
    }catch(e){ console.warn('[lighting] 後製模組載入失敗，改用直接畫：', e && e.message || e); }
  }
  if(postMods){
    const [{ GTAOPass }, { UnrealBloomPass }, { FullScreenQuad }] = postMods;
    // ② AO：借用 three 的 GTAOPass 的兩個 shader（AO、去雜訊），只算出 AO 貼圖，不做它自己的合成
    class AO extends GTAOPass {
      constructor(depthTex){
        super(scene, camera, 16, 16, { depthTexture: depthTex },
          { radius: 0.40, distanceExponent: 1, thickness: 0.3, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false },
          { lumaPhi: 10, depthPhi: 0.08, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 12 });
        // 去雜訊時不再替每個取樣點由深度重算法線（每點 9 次讀取 × 12 點）：改用「離中心點切平面多遠」判斷是不是同一個面
        //（depthPhi 0.08 m：超過 8 cm 就不混 → 不會把家具的 AO 抹到後面的牆上）
        const PD_OLD = 'vec3 sampleNormal = getViewNormal(sampleUv);';
        if(this.pdMaterial.fragmentShader.includes(PD_OLD)){
          this.pdMaterial.fragmentShader = this.pdMaterial.fragmentShader.replace(PD_OLD, 'vec3 sampleNormal = viewNormal;');
          this.pdMaterial.needsUpdate = true;
        }
      }
      setGBuffer(depthTexture){   // 不另外畫法線／深度那一趟：直接用主畫面的深度
        this.depthTexture = depthTexture; this.normalTexture = null; this._renderGBuffer = false;
        for(const m of [this.gtaoMaterial, this.pdMaterial]){
          m.defines.NORMAL_VECTOR_TYPE = 0; m.defines.DEPTH_SWIZZLING = 'x';
          m.uniforms.tNormal.value = null; m.uniforms.tDepth.value = depthTexture; m.needsUpdate = true;
        }
        this.depthRenderMaterial.uniforms.tDepth.value = depthTexture;
      }
      setSize(w, h){
        this.width = w; this.height = h;
        this.gtaoRenderTarget.setSize(w, h); this.pdRenderTarget.setSize(w, h);
        this.gtaoMaterial.uniforms.resolution.value.set(w, h); this.pdMaterial.uniforms.resolution.value.set(w, h);
      }
      compute(r){   // 算 AO → 去雜訊；結果在 this.pdRenderTarget
        const c = this.camera, g = this.gtaoMaterial.uniforms;
        g.cameraNear.value = c.near; g.cameraFar.value = c.far;
        g.cameraProjectionMatrix.value.copy(c.projectionMatrix); g.cameraProjectionMatrixInverse.value.copy(c.projectionMatrixInverse);
        g.cameraWorldMatrix.value.copy(c.matrixWorld);
        this.renderPass(r, this.gtaoMaterial, this.gtaoRenderTarget, 0xffffff, 1.0);
        this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(c.projectionMatrixInverse);
        this.renderPass(r, this.pdMaterial, this.pdRenderTarget, 0xffffff, 1.0);
      }
    }
    // ③ 泛光：借用 UnrealBloomPass 的亮部擷取＋多層模糊，只算出泛光貼圖（renderTargetsHorizontal[0]），疊加交給 ④
    class Bloom extends UnrealBloomPass {
      compute(r, input){
        const oldAuto = r.autoClear; r.getClearColor(this._oldClearColor); const oldA = r.getClearAlpha();
        r.autoClear = false; r.setClearColor(this.clearColor, 0);
        this.highPassUniforms.tDiffuse.value = input.texture;
        this.highPassUniforms.luminosityThreshold.value = this.threshold;
        this.fsQuad.material = this.materialHighPassFilter;
        r.setRenderTarget(this.renderTargetBright); r.clear(); this.fsQuad.render(r);
        let src = this.renderTargetBright;
        for(let i = 0; i < this.nMips; i++){
          const m = this.separableBlurMaterials[i]; this.fsQuad.material = m;
          m.uniforms.colorTexture.value = src.texture; m.uniforms.direction.value = UnrealBloomPass.BlurDirectionX;
          r.setRenderTarget(this.renderTargetsHorizontal[i]); r.clear(); this.fsQuad.render(r);
          m.uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture; m.uniforms.direction.value = UnrealBloomPass.BlurDirectionY;
          r.setRenderTarget(this.renderTargetsVertical[i]); r.clear(); this.fsQuad.render(r);
          src = this.renderTargetsVertical[i];
        }
        this.fsQuad.material = this.compositeMaterial;
        this.compositeMaterial.uniforms.bloomStrength.value = this.strength;
        this.compositeMaterial.uniforms.bloomRadius.value = this.radius;
        r.setRenderTarget(this.renderTargetsHorizontal[0]); r.clear(); this.fsQuad.render(r);
        r.setClearColor(this._oldClearColor, oldA); r.autoClear = oldAuto;
        return this.renderTargetsHorizontal[0].texture;
      }
    }
    // 深度＋模板：模板只拿來標記俯瞰切口（§6b），不必搬進貼圖
    const depthTexture = new THREE.DepthTexture(16, 16, THREE.UnsignedInt248Type); depthTexture.format = THREE.DepthStencilFormat;
    const sceneRT = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: 4, depthTexture, stencilBuffer: true });
    sceneRT.resolveStencilBuffer = false;
    aoPass = new AO(depthTexture);
    bloomPass = new Bloom(new THREE.Vector2(16, 16), 0.3, 0.25, 1.0);
    // 亮到爆的像素（燈罩內面、燈泡）先壓到 2.5 再模糊 → 燈罩旁一圈柔光，不會整個畫面起霧
    {
      const hp = bloomPass.materialHighPassFilter, HP_OLD = 'gl_FragColor = mix( outputColor, texel, alpha );';
      if(hp.fragmentShader.includes(HP_OLD)){
        hp.fragmentShader = hp.fragmentShader.replace(HP_OLD, 'gl_FragColor = mix( outputColor, vec4( min( texel.rgb, vec3( 2.5 ) ), texel.a ), alpha );');
        hp.needsUpdate = true;
      }
    }
    // ④ 最後一道
    const tmFn = { [THREE.CustomToneMapping]: 'CustomToneMapping', [THREE.NeutralToneMapping]: 'NeutralToneMapping',
                   [THREE.AgXToneMapping]: 'AgXToneMapping', [THREE.ACESFilmicToneMapping]: 'ACESFilmicToneMapping' }[renderer.toneMapping] || 'NeutralToneMapping';
    const presentMat = new THREE.ShaderMaterial({
      name: 'A8Present',
      uniforms: { tColor: { value: sceneRT.texture }, tDepth: { value: depthTexture }, tAO: { value: aoPass.pdRenderTarget.texture },
                  tBloom: { value: null }, uAO: { value: 1 }, uBloom: { value: 0 }, cameraNear: { value: 0.05 }, cameraFar: { value: 250 },
                  toneMappingExposure: { value: 1 } },
      vertexShader: `varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `#define DITHERING
        #include <common>
        #include <packing>
        #include <tonemapping_pars_fragment>
        #include <dithering_pars_fragment>
        uniform sampler2D tColor, tDepth, tAO, tBloom;
        uniform float uAO, uBloom, cameraNear, cameraFar;
        varying vec2 vUv;
        float viewZ(float d){ return -perspectiveDepthToViewZ(d, cameraNear, cameraFar); }
        // AO 放大：每個像素只取「跟自己同一個面」的 AO 格子（深度差越大權重越小）→ 輪廓不會有一圈白邊或黑邊
        float aoAt(){
          ivec2 fs = textureSize(tDepth, 0), hs = textureSize(tAO, 0);
          float d = texelFetch(tDepth, clamp(ivec2(vUv * vec2(fs)), ivec2(0), fs - 1), 0).r;
          if(d >= 1.0) return 1.0;
          float z = viewZ(d);
          vec2 hp = vUv * vec2(hs) - 0.5; ivec2 h0 = ivec2(floor(hp)); vec2 f = fract(hp);
          float sum = 0.0, wsum = 0.0, best = 1e9, bestAo = 1.0;
          for(int j = 0; j < 2; j++) for(int i = 0; i < 2; i++){
            ivec2 q = clamp(h0 + ivec2(i, j), ivec2(0), hs - 1);
            vec2 quv = (vec2(q) + 0.5) / vec2(hs);
            float dz = abs(viewZ(texelFetch(tDepth, clamp(ivec2(quv * vec2(fs)), ivec2(0), fs - 1), 0).r) - z) / max(z, 1e-3);
            float ao = texelFetch(tAO, q, 0).r;
            float w = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y) / (1e-3 + dz * 60.0);
            sum += w * ao; wsum += w;
            if(dz < best){ best = dz; bestAo = ao; }
          }
          return wsum > 1e-6 ? sum / wsum : bestAo;
        }
        void main(){
          vec4 src = texture2D(tColor, vUv); vec3 c = src.rgb;
          if(uAO > 0.0) c *= mix(1.0, aoAt(), uAO * src.a);   // alpha 0 ＝ 俯瞰切口（不乘 AO；見 §6b）
          if(uBloom > 0.0) c += uBloom * texture2D(tBloom, vUv).rgb;
          c = ${tmFn}(c);
          c = sRGBTransferOETF(vec4(c, 1.0)).rgb;
          gl_FragColor = vec4(dithering(c), 1.0);
        }`,
      depthTest: false, depthWrite: false, toneMapped: false,   // toneMapped:false → three 不會再塞一份色調映射進來（我們自己做）
    });
    const quad = new FullScreenQuad(presentMat);
    const U = presentMat.uniforms, dbs = new THREE.Vector2();
    post = {
      sceneRT, quad, U, scale: 1, w: 0, h: 0, aoOn: !AO_OFF, bloomOn: false,
      resize(){
        renderer.getDrawingBufferSize(dbs);
        const pr = renderer.getPixelRatio(), eff = pr * this.scale;   // eff ＝ 場景實際用的像素比
        const w = Math.max(1, Math.round(dbs.x * this.scale)), h = Math.max(1, Math.round(dbs.y * this.scale));
        this.w = w; this.h = h;
        const ns = eff > 1.3 ? 2 : 4;                                  // 高解析度時 2 倍 MSAA 就夠（邊緣本來就細）
        if(sceneRT.samples !== ns){ sceneRT.samples = ns; sceneRT.dispose(); }
        sceneRT.setSize(w, h);
        const k = clamp(1 / eff, 0.5, 1);                             // AO：大約 CSS 像素的解析度
        aoPass.setSize(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
        bloomPass.setSize(w, h);                                       // 泛光自己從一半開始往下
      },
      render(){
        if(this.w === 0) this.resize();
        renderer.setRenderTarget(sceneRT);
        renderer.render(scene, camera);   // ⚠️ 場景只畫這一趟：three 每畫完一趟就把多重取樣畫布「作廢」，再疊畫第二趟在某些顯卡會整片變黑
        if(this.aoOn) aoPass.compute(renderer);
        let bloomTex = null;
        if(this.bloomOn) bloomTex = bloomPass.compute(renderer, sceneRT);
        U.tAO.value = aoPass.pdRenderTarget.texture; U.uAO.value = this.aoOn ? 1 : 0;
        U.tBloom.value = bloomTex; U.uBloom.value = bloomTex ? 1 : 0;
        U.cameraNear.value = camera.near; U.cameraFar.value = camera.far;
        U.toneMappingExposure.value = renderer.toneMappingExposure;
        renderer.setRenderTarget(null);
        quad.render(renderer);
      },
    };
  }

  /* ============================================================
     6b. 俯瞰剖切（像 target_muji 那種「牆切到腰高、切口是炭灰色」的配置圖）
        俯瞰時把所有東西在 CUT_H 高度切掉（牆、門、窗、家具都一樣切，不會有掛在半空的電視或吊櫃），
        切口用「只畫背面」的分身補起來（跟本體共用幾何、掛在本體底下）：
          建築（牆、窗框、門框）→ 炭灰；門片 → 門片自己的顏色（目標圖的門片頂是木色）；家具 → 淺米色（像櫃子頂面）；
          RC 柱切高一點（CUT_H + COL_UP，像目標圖那樣略高出牆的深色實心柱）
        ・分身排在所有不透明物件之後畫（renderOrder）→ 只補「本體被切掉、露出內部」的地方
        ・整個場景仍然只畫一趟（⚠️ 不要改回「另外多畫幾趟」：多重取樣畫布每畫完一趟就被作廢，疊畫會出錯）
        ・切口邊緣用 alpha-to-coverage 抗鋸齒（three 內建）：切線上的像素照「被切掉幾成」只畫部分取樣點 → MSAA 抹順
          只拿剖切覆蓋率當 alpha（原本不透明的材質，貼圖的 alpha 照樣不管）；走動模式切平面在 10 萬公尺 → 完全不變
        ・電腦版：切口在模板（stencil）記 1，最後一個全螢幕小三角形把那些點的 alpha 設 0 → 合成時不乘 AO
          （切口在深度上是開口的空盒子，AO 會把它當深坑壓黑、還壓出雜點）
        ・切平面在建好時就掛到每個材質上（走動時推到 10 萬公尺高＝等於沒切）→ 切換模式不會重編 shader
        ・正交相機（main.js 的 orthoTop 藍圖）一律不切 → 對圖工具看到的永遠是完整高度的模型
        ・不支援剖切的特殊材質（例如鏡子 Reflector）若高過切線，俯瞰時先藏起來
        ?cut=0 關掉、?cut=1.6 改切的高度
     ============================================================ */
  const CUT_Q = QS.get('cut'), CUT_ON = CUT_Q !== '0', CUT_H = CUT_Q && +CUT_Q > 0.3 ? +CUT_Q : 1.30;
  const COL_UP = 0.5;                                  // RC 柱比牆多留 0.5 m
  const NO_CUT = 1e5, CAP_ORDER = 1e6;                 // 切口分身在不透明物件裡最後畫
  const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), NO_CUT);   // 留下 y ≤ constant 的部分
  const colPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), NO_CUT);   // RC 柱：切在 CUT_H + COL_UP
  let cutActive = false;
  const A2C_DEF = 'A8_CUT_A2C';
  const a2cOK = m => m && !m.isShaderMaterial && !m.transparent && !(m.alphaTest > 0) && !m.alphaHash && !(m.transmission > 0);
  function useA2C(m){ m.alphaToCoverage = true; m.defines = { ...(m.defines || {}), [A2C_DEF]: '' }; m.needsUpdate = true; }
  const POCHE_HEX = 0x4c4b4a;                          // 建築切口：中炭灰（映射後約 RGB 50，對照 target_muji 牆頂約 42–61；太黑會被色調映射壓成藍黑）
  const capMats = [];                                  // 所有切口材質：晚上跟著暗一點（{ m, hex, night }）
  let capDay = 1;                                      // 目前的天光（0 夜 → 1 日），晚到的切口材質也照這個亮度
  function capMaterial(hex, plane, night){
    // polygonOffset：切口跟某個面剛好同一個平面時（衣櫃門背、貼牆的櫃子、伸進柱子裡的牆面），一律讓切口贏 → 轉動時不會一條一條閃
    const m = new THREE.MeshBasicMaterial({ color: hex, side: THREE.BackSide, clippingPlanes: [plane], polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    m.color.multiplyScalar(night + (1 - night) * capDay);
    useA2C(m);
    if(post) Object.assign(m, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
    capMats.push({ m, hex, night });
    return m;
  }
  const pocheMat    = capMaterial(POCHE_HEX, cutPlane, 0.45);   // 建築（牆、窗框、門框…）
  const capMat      = capMaterial(0xe4ded3, cutPlane, 0.25);    // 家具（淺米色，像櫃子頂面）
  const colPocheMat = capMaterial(POCHE_HEX, colPlane, 0.45);   // RC 柱（切得比牆高）
  const leafCaps = new Map();                                   // 門片：門片自己的顏色
  const leafCap = m => { let c = leafCaps.get(m); if(!c){ c = capMaterial(m.color ? m.color.getHex() : 0xd8bc90, cutPlane, 0.25); leafCaps.set(m, c); } return c; };
  const archMats = new Set(Object.values(ctx.archMaterials || {}));
  const colMat = ctx.archMaterials && ctx.archMaterials.COL;
  const cutExempt = new Set([sky, ground, catcher, ctx.contactShadow, ctx.sky].filter(Boolean));
  const cutSeen = new WeakSet(), nonClip = [], bb = new THREE.Box3();
  const leafRoots = new Set((ctx.doors || []).map(d => d.leaf).filter(Boolean));
  const underLeaf = o => { for(let p = o; p; p = p.parent) if(leafRoots.has(p)) return true; return false; };
  const capSibs = [];
  function addCapSibling(o, mat){
    let c;
    if(o.isInstancedMesh){ c = new THREE.InstancedMesh(o.geometry, mat, o.count); c.instanceMatrix = o.instanceMatrix; }
    else c = new THREE.Mesh(o.geometry, mat);
    c.name = 'cut-cap'; c.visible = false; c.renderOrder = CAP_ORDER; c.castShadow = c.receiveShadow = false;
    c.userData.noCut = true; c.userData.noPhoto = true; c.raycast = () => {};
    cutSeen.add(c); o.add(c); capSibs.push(c);
  }
  const capable = o => !o.isSkinnedMesh && !o.isBatchedMesh;   // 骨架／批次物件的分身太複雜，不補（目前場景沒有）
  if(CUT_ON) renderer.localClippingEnabled = true;
  function tagCut(){   // 替新進場景的物件掛上切平面＋切口分身（建好時跑一次；之後有物件晚到再補）
    if(!CUT_ON) return;
    scene.updateMatrixWorld();
    scene.traverse(o => {
      if(!o.isMesh || o.isSprite || cutSeen.has(o) || cutExempt.has(o) || o.userData.noCut) return;
      cutSeen.add(o);
      const mats = (Array.isArray(o.material) ? o.material : [o.material]).filter(Boolean);
      if(colMat && mats.every(m => m === colMat)){                                                          // RC 柱：切高一點
        if(!colMat.clippingPlanes || !colMat.clippingPlanes.includes(colPlane)){ colMat.clippingPlanes = [colPlane]; colMat.clipShadows = true; colMat.needsUpdate = true; if(a2cOK(colMat)) useA2C(colMat); }
        if(capable(o)) addCapSibling(o, colPocheMat);
        return;
      }
      const top = bb.setFromObject(o).max.y;
      if(mats.some(m => m.isShaderMaterial && !m.clipping)){ if(top > CUT_H) nonClip.push(o); return; }   // 自訂 shader 不吃切平面
      for(const m of mats){
        if(m.clippingPlanes && m.clippingPlanes.includes(cutPlane)) continue;
        m.clippingPlanes = [...(m.clippingPlanes || []), cutPlane]; m.clipShadows = true; m.needsUpdate = true;
        if(a2cOK(m)) useA2C(m);
      }
      // 高過切線、不透明、單面 → 補切口（雙面材質本來就看得到內面，不補）
      if(top > CUT_H + 0.005 && capable(o) && !mats.some(m => m.transparent || m.side === THREE.DoubleSide)){
        const leaf = underLeaf(o) && !Array.isArray(o.material);
        addCapSibling(o, leaf ? leafCap(o.material) : mats.every(m => archMats.has(m)) ? pocheMat : capMat);
      }
    });
  }
  tagCut();
  // 切口記號（只有電腦版）：畫在最後的全螢幕三角形，模板＝1 的取樣點「顏色不動、alpha 設 0」
  let capMark = null;
  if(post){
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    capMark = new THREE.Mesh(g, new THREE.ShaderMaterial({
      name: 'A8CapMark', vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'void main(){ gl_FragColor = vec4(0.0); }', transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.ZeroFactor,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc, stencilWriteMask: 0,
      stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp }));
    capMark.frustumCulled = false; capMark.renderOrder = 1e9; capMark.visible = false; capMark.name = 'cut-cap-mark';
    capMark.userData.noCut = true; capMark.userData.noPhoto = true; capMark.raycast = () => {};
    cutSeen.add(capMark); scene.add(capMark);
  }
  // 每一次畫場景之前決定切不切：透視相機＋俯瞰才切；正交相機（藍圖）不切
  {
    const prev = scene.onBeforeRender;
    scene.onBeforeRender = function(r, sc, cam, rt){
      if(prev) prev.call(this, r, sc, cam, rt);
      const on = cutActive && !cam.isOrthographicCamera;
      cutPlane.constant = on ? CUT_H : NO_CUT; colPlane.constant = on ? CUT_H + COL_UP : NO_CUT;
      for(const c of capSibs) c.visible = on;
      if(capMark) capMark.visible = on && rt === (post && post.sceneRT);   // 只有畫進後製畫布時才需要記號
    };
  }
  // main.js 的房間標籤原本浮在天花板上方 0.9 m；剖切後牆只剩 1.3 m，標籤離地太高、透視一斜就飄到隔壁房
  // → 剖切時壓到切口上方一點（標籤下緣仍高過切口，不會被切口蓋到），回走動模式還原（main.js 若自己改了更低的高度，就用它的）
  const LABEL_UP = 0.6;
  function placeLabels(){
    for(const sp of ctx.labels || []){
      if(!sp || !sp.position) continue;
      if(sp.userData.__y0 === undefined) sp.userData.__y0 = sp.position.y;
      sp.position.y = cutActive ? Math.min(sp.userData.__y0, CUT_H + LABEL_UP) : sp.userData.__y0;
    }
  }
  function setCut(on){
    cutActive = CUT_ON && on;
    for(const o of nonClip){
      if(cutActive){ if(o.userData.__cutVis === undefined){ o.userData.__cutVis = o.visible; o.visible = false; } }
      else if(o.userData.__cutVis !== undefined){ o.visible = o.userData.__cutVis; delete o.userData.__cutVis; }
    }
    placeLabels();
  }

  /* ============================================================
     7. 模式（走動／俯瞰）與時間
     ============================================================ */
  const MODE = {
    // aoThk：AO 的「厚度」＝ 多近的東西才算遮擋。跟半徑差不多（0.3 m）→ 牆角照樣暗，
    //        但不會把「近處牆邊後面幾公尺的天花板」也算成被遮 → 遠處天花板不會冒出一團團灰影
    walk: { shadowR: 2.5, map: LOW ? 1024 : 2048, aoR: 0.40, aoScale: 1.10, aoThk: 0.3, spot: 1.0, sunMinAlt: 0,  sunK: 1.8,  hemiK: 0.85, env: 0.95, catcher: 0.34,
            nightExp: 1.25, lampK: 1.0, bounce: 0.45, emK: 1.2, pdR: 6 },
    // 俯瞰：太陽拉高（影子短）、影子拉柔、太陽弱天光強、環境反射壓低（斜看地板不泛白）→ 像展示模型
    //       晚上：燈與曝光再拉一點 → 參考影片那種整間暖暖亮著的小屋
    bird: { shadowR: 4,   map: 1024, aoR: 0.40, aoScale: 1.00, aoThk: 0.3, spot: 0.5, sunMinAlt: 62, sunK: 0.35, hemiK: 1.30, env: 0.70, catcher: 0.32,
            nightExp: 1.45, lampK: 1.3, bounce: LOW ? 0.85 : 0.6, emK: 1.5, pdR: 8 },   // 手機燈池小 → 俯瞰多一點室內反光
  };
  let mode = MODE.walk, shadowDirty = 3;
  function setMode(m){
    mode = MODE[m] || MODE.walk; modeName = MODE[m] ? m : 'walk';
    setCut(modeName === 'bird');
    archShadowSide(modeName === 'walk');
    // 俯瞰：陰影貼圖用較粗的 1024（每格約 2.7 cm）再加大半徑 → 影子很柔，像展示模型；走動：2048、邊緣清楚一點
    sun.shadow.radius = mode.shadowR;
    if(sun.shadow.mapSize.x !== mode.map){ sun.shadow.mapSize.set(mode.map, mode.map); if(sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; } }
    if(aoPass){ aoPass.updateGtaoMaterial({ radius: mode.aoR, scale: mode.aoScale, thickness: mode.aoThk }); aoPass.updatePdMaterial({ radius: mode.pdR }); }
    setTime(ctx.time ?? 14);
    plan(true); poolTick(0); glowTick();   // 換模式：燈池直接到位（俯瞰要大房間的燈，走動要身邊的燈）
  }

  // JS 版的「色調映射＋調色」：手機沒有後製，霧是在材質「已經色調映射、已轉 sRGB」之後才混進去的
  // （three 上傳霧色時只會幫忙轉 sRGB，不會做色調映射）→ 霧色要先自己映射＋調色，才會跟天空圓頂的地平線同色
  //（電腦走 §6 的後製：霧在浮點畫布裡混，整張圖最後一起映射，不用管）
  function neutralTM(c, exposure){   // 跟 three 的 GLSL NeutralToneMapping 一模一樣
    let r = c.r * exposure, g = c.g * exposure, b = c.b * exposure;
    const x = Math.min(r, g, b), off = x < 0.08 ? x - 6.25 * x * x : 0.04;
    r -= off; g -= off; b -= off;
    const peak = Math.max(r, g, b), SC = 0.76;
    if(peak >= SC){
      const d = 1 - SC, np = 1 - d * d / (peak + d - SC), k = np / peak, gg = 1 - 1 / (0.15 * (peak - np) + 1);
      r = r * k + (np - r * k) * gg; g = g * k + (np - g * k) * gg; b = b * k + (np - b * k) * gg;
    }
    return c.setRGB(r, g, b, THREE.LinearSRGBColorSpace);
  }
  function screenColor(c, exposure){   // 霧色（線性）＝ 天空圓頂地平線經過色調映射＋調色之後的值
    neutralTM(c, exposure);
    if(renderer.toneMapping === THREE.CustomToneMapping){
      const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      c.r = Math.max(0, lerp(l, c.r, SAT)); c.g = Math.max(0, lerp(l, c.g, SAT)); c.b = Math.max(0, lerp(l, c.b, SAT));
    }
    return c;
  }
  const fogNeedsTM = !post && (renderer.toneMapping === THREE.NeutralToneMapping || renderer.toneMapping === THREE.CustomToneMapping);

  const tmpV = new THREE.Vector3(), tmpC = new THREE.Color();
  function setTime(h){
    ctx.time = h;
    const s = sunAt(h), e = s.alt / DEG;
    const day   = smooth(-6, 10, e);        // 天光：日出前 6° 就開始亮
    const lampF = 1 - smooth(-3, 9, e);     // 室內燈：太陽低於 9° 開始亮、−3° 全亮
    const nightT = 1 - smooth(-8, 0, e);    // 太陽下山後慢慢換成月光
    const pal = palette(e);

    // 太陽：方向（俯瞰時最低拉到 mode.sunMinAlt）、顏色、強度；夜裡交給月光
    const dir = dirOf(Math.max(s.alt, 6 * DEG, mode.sunMinAlt * DEG), s.az).lerp(MOON_DIR, nightT).normalize();
    sun.position.copy(dir).multiplyScalar(45).add(sun.target.position);
    sunColor(sun.color, e).lerp(MOON, nightT);
    sun.intensity = Math.max(2.4 * Math.pow(smooth(-1, 32, e), 0.75), 0.10 * nightT) * mode.sunK;
    // 地面影子：太陽很低時跟著淡掉（本來就沒什麼光）。⚠️ 白天底盤亮度超過 1、落在色調曲線的「壓縮區」→
    // 同樣的不透明度看起來會淡很多，所以 catcher／接觸影的濃度比舊版（底盤 0.72 時）高約 1.5 倍，實際反差跟舊版差不多
    catcherMat.opacity = mode.catcher * smooth(0, 12, e);
    decalMat.opacity = 0.42 * (0.35 + 0.65 * day);
    capDay = day;
    for(const c of capMats) c.m.color.setHex(c.hex).multiplyScalar(c.night + (1 - c.night) * day);   // 切口：晚上跟著暗一點（曝光會拉亮）

    // 天光（半球）：白天＝天空／地面色；晚上混入室內反光（暖）；環境貼圖強度；曝光（晚上像相機自動曝光拉亮一點）
    const bounce = lampF * mode.bounce;
    hemi.color.copy(pal.hemiS).multiplyScalar(0.24 + 1.16 * day).add(tmpC.copy(BOUNCE_S).multiplyScalar(bounce));
    hemi.groundColor.copy(pal.hemiG).multiplyScalar(0.24 + 1.16 * day).add(tmpC.copy(BOUNCE_G).multiplyScalar(bounce));
    hemi.intensity = mode.hemiK;
    scene.environmentIntensity = (0.10 + 0.70 * day) * mode.env;
    renderer.toneMappingExposure = lerp(1.0, mode.nightExp, lampF);
    glassU.uGlassDiffuse.value = lerp(1, 0.15, lampF);

    // 虛擬燈的亮度：窗光跟著天光（朝太陽那一面稍亮）；吸頂燈與家具燈晚上亮 → 燈池下一格照新亮度重排
    adoptLamps(); ensureGlows();
    tmpV.set(dir.x, 0, dir.z).normalize();
    for(const v of VL){
      if(v.group === 'win') v.i = v.base * day * (0.8 + 0.45 * Math.max(0, v.normal[0] * tmpV.x + v.normal[1] * tmpV.z)) * mode.spot;
      else v.i = v.base * lampF * mode.lampK;
    }
    plan(false); poolTick(0); glowTick();
    // 發光材質：吸頂燈罩、家具的燈罩／燈泡（lamp）與螢幕（screen）
    fixGlow.emissiveIntensity = 1.8 * lampF;
    for(const em of ctx.emissives || []){
      if(!em.mat) continue;
      const base = em.base ?? 1;
      em.mat.emissiveIntensity = em.kind === 'screen' ? base * (0.35 + 0.65 * lampF) : base * lampF * mode.emK;
    }

    // 天空、地面與霧（圓頂地平線以下＝地平線色，跟霧化的地面無縫）
    skyU.uZenith.value.copy(pal.zen); skyU.uHorizon.value.copy(pal.hor); skyU.uGround.value.copy(pal.hor);
    skyU.uSunDir.value.copy(dirOf(s.alt, s.az));
    sunColor(skyU.uSunCol.value, e);
    skyU.uGlow.value = 0.35 * smooth(-4, 4, e) * (1 - 0.5 * smooth(10, 40, e));
    skyU.uDisc.value = 3.0 * smooth(-1, 3, e);
    ground.material.color.copy(pal.gnd);
    if(scene.fog){
      if(fogNeedsTM) scene.fog.color.copy(screenColor(tmpC.copy(pal.hor), renderer.toneMappingExposure));
      else scene.fog.color.copy(pal.hor);
    }

    // 夜間泛光（燈罩、燈泡、螢幕微微暈開）
    if(post){ post.bloomOn = lampF > 0.02; bloomPass.strength = 0.30 * lampF; }
    shadowDirty = Math.max(shadowDirty, 2);
  }

  /* ============================================================
     8. 每格：吸頂燈具跟著天花板一起顯示／隱藏；陰影只在需要時重算；畫出來；順便記三角形數
     ============================================================ */
  let roofSeen = ctx.roof ? ctx.roof.visible : true, sigFrame = 0, sig = '';
  const signature = () => scene.children.length + '|' + renderer.info.memory.geometries;
  ctx.tick.push(dt => {
    poolTick(dt); glowTick();
    if(ctx.roof){
      fixtures.visible = ctx.roof.visible;
      if(ctx.roof.visible !== roofSeen){ roofSeen = ctx.roof.visible; shadowDirty = Math.max(shadowDirty, 1); }   // 屋頂擋不擋太陽
    }
    if(++sigFrame % 30 === 0){ const s = signature(); if(s !== sig){ sig = s; shadowDirty = Math.max(shadowDirty, 1); tagCut(); if(cutActive) setCut(true); } }   // 有物件晚到（模型載入）
  });
  /* ------------------------------------------------------------
     自動畫質：量真實的每格間隔，連續跑不到約 45 fps 就降一級；
     降了卻沒變快（螢幕或省電模式本來就鎖 30 fps、或是 CPU 忙）→ 退回、暫停往下降 20 秒（第二次 40 秒）；
     第三次還是沒用 → 這台就是鎖幀，之後不再往下降（不然每隔一陣子畫面解析度就跳一次）；
     很順的話過一陣子試著升回去（升了又跑不動就退回、之後不再往上升）
       電腦：場景像素比 原生 → 1.5 → 1.25 → 1 → 關 AO → 0.85；手機：像素比 原生(≤1.5) → 1.25 → 1 → 0.85
       ?gov=0 關掉（量效能用）、?lv=N 直接指定等級
     ------------------------------------------------------------ */
  const dpr0 = renderer.getPixelRatio();
  const LEVELS = [];
  {
    const effs = [dpr0, 1.5, 1.25, 1].filter(e => e <= dpr0 + 1e-3);
    for(const e of effs) if(!LEVELS.some(L => Math.abs(L.eff - e) < 0.01)) LEVELS.push({ eff: e, ao: true });
    if(LOW) LEVELS.forEach(L => { L.ao = false; });
    if(!LOW) LEVELS.push({ eff: Math.min(1, dpr0), ao: false });
    LEVELS.push({ eff: Math.min(0.85, dpr0), ao: false });
  }
  const gov = { level: 0, on: QS.get('gov') !== '0', win: [], skip: 150, last: 0, good: 0, pending: null, lockUp: false, lockDown: false,
                reverts: 0, downUntil: 0, log: [] };
  function setLevel(n){
    gov.level = clamp(n, 0, LEVELS.length - 1);
    const L = LEVELS[gov.level];
    if(post){ post.scale = L.eff / dpr0; post.aoOn = L.ao && !AO_OFF; post.resize(); }
    else { renderer.setPixelRatio(L.eff); renderer.setSize(innerWidth, innerHeight); }
    gov.skip = 30; gov.win.length = 0;
  }
  if(QS.get('lv')) setLevel(+QS.get('lv'));
  function govFrame(){
    const now = performance.now(), dt = now - gov.last; gov.last = now;
    if(!gov.on || (gov.lockUp && gov.lockDown)) return;
    const holdDown = now < gov.downUntil;               // 剛退回過：這段時間先不往下降
    if(dt > 250){ gov.win.length = 0; return; }        // 分頁切走、拍照模式、偶發的卡頓：這一段不算
    if(gov.skip > 0){ gov.skip--; return; }
    gov.win.push(dt);
    if(gov.win.length < 60) return;
    const med = [...gov.win].sort((a, b) => a - b)[30]; gov.win.length = 0;
    const p = gov.pending; gov.pending = null;
    if(p && p.dir > 0 && med > p.before * 0.85){   // 降了沒用 → 退回；暫停一陣子（載入模型時 CPU 忙也會這樣），第三次才永久不降
      gov.log.push('revert ' + gov.level + '→' + p.prev + ' @' + med.toFixed(1)); setLevel(p.prev);
      if(++gov.reverts >= 3) gov.lockDown = true; else gov.downUntil = now + 20000 * gov.reverts;
      return;
    }
    if(p && p.dir < 0 && med > 22.5){ gov.log.push('up failed ' + gov.level + '→' + p.prev); setLevel(p.prev); gov.lockUp = true; return; }
    if(med > 22.5 && gov.level < LEVELS.length - 1 && !gov.lockDown && !holdDown){
      gov.pending = { dir: 1, prev: gov.level, before: med }; gov.log.push('down ' + gov.level + ' @' + med.toFixed(1)); setLevel(gov.level + 1); gov.good = 0;
    }else if(med < 17.8){
      if(++gov.good >= 5 && gov.level > 0 && !gov.lockUp){ gov.pending = { dir: -1, prev: gov.level, before: med }; gov.log.push('up ' + gov.level + ' @' + med.toFixed(1)); setLevel(gov.level - 1); gov.good = 0; }
    }else gov.good = 0;
  }

  const stats = { tris: 0, calls: 0, shadowUpdates: 0 };   // 整格的三角形與 draw call 數，給量測用
  function render(){
    govFrame();
    if(shadowDirty > 0){ renderer.shadowMap.needsUpdate = true; shadowDirty--; stats.shadowUpdates++; }
    renderer.info.autoReset = false; renderer.info.reset();
    if(post) post.render(); else renderer.render(scene, camera);
    stats.tris = renderer.info.render.triangles; stats.calls = renderer.info.render.calls;
    renderer.info.autoReset = true;   // 交還預設行為（拍照模組自己畫的時候不受影響）
  }
  function resize(){ if(post) post.resize(); }

  setTime(ctx.time ?? 14);
  plan(true); poolTick(0);
  ctx.lighting = { sun, hemi, VL, slots, glows, sky, ground, catcher, post, aoPass, bloomPass, stats, MODE, gov, LEVELS, setLevel, cutPlane, cutHeight: CUT_ON ? CUT_H : H,
                   dirtyShadows: () => { shadowDirty = Math.max(shadowDirty, 1); } };   // 給測試／偵錯用
  return { setTime, render, resize, setMode };
}
