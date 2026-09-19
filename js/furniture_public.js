/* ============================================================
   furniture_public.js — 公共區家具：客廳、餐廳（含玄關）、走道、廚房、陽台
   風格：日式無印 × 北歐（淺橡木、米白布面、白瓷、霧黑五金、橄欖綠植栽）
   位置全部照 layout/spec_final.json 的房間框與設備框（公尺；X 東、Z 南、Y 上）。
   做法：每件家具用程式拼（RoundedBox／Cylinder／Extrude…），同材質合併成一個 mesh（四張椅子併成一組）；
   手機（low）最後再按房間把同材質的零件併起來（§8），電腦版保留一件一組；
   植栽枝葉、花瓶、畫框用 Poly Haven CC0 模型（assets/public/models/，出處見 CREDITS.md）；
   地毯、電視畫面、版畫、鏡面假反射、電箱門都是 canvas 現畫的。
   走道地上不放東西（只有 0.90 m 寬、三個房門都開在這裡），只在沒有開口的北牆掛一幅小畫。
   登記：ctx.lamps（餐桌吊燈 pendant、落地燈 floor、廚房櫃下燈 under；power 是倍數）、ctx.emissives（燈球、LED、電視）、
   ctx.colliders（走不過去的家具；矮的東西 y1 也給 1.0 讓人不會穿過；多一個 pub:1 欄位給檢查腳本辨認）。
   ============================================================ */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export default async function buildPublic(ctx){
  const { scene, H, QUALITY, colliders, loadModel, place, lamps, emissives } = ctx;
  const LOW = QUALITY === 'low';
  const FT = 0.045;                       // 地板完成面（arch 的慣例）

  /* ============================================================
     1. 貼圖與材質
     ============================================================ */
  const TL = new THREE.TextureLoader();
  const ANISO = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy());
  function tex(file, srgb, metersPerTile){
    const t = TL.load('./assets/public/tex/' + file);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO;
    t.repeat.set(1 / metersPerTile, 1 / metersPerTile);   // 幾何的 UV 是公尺
    if(srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function canvasTex(w, h, paint){
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    paint(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO;
    return t;
  }
  // 手機（low）不用法線貼圖 → 連下載都省掉
  const oakD = tex('oak_veneer_01_diff.jpg', true, 1.2), oakR = tex('oak_veneer_01_rough.jpg', false, 1.2);
  const oakN = LOW ? null : tex('oak_veneer_01_nor.jpg', false, 1.2);
  const linenN = LOW ? null : tex('rough_linen_nor.jpg', false, 0.32);
  const boucleN = LOW ? null : tex('wool_boucle_nor.jpg', false, 0.55);
  const stoneN = ctx.TEX.tile.n.clone(); stoneN.repeat.set(1 / 1.5, 1 / 1.5); stoneN.needsUpdate = true;

  // 地毯：目標圖是「兩色」── 外圈一大圈淺燕麥、中間一塊深一階的灰褐（亞麻色系、低彩度）
  //   canvas 的 x 對應地毯東西向（2.35 m）、y 對應南北向（3.15 m）；外圈寬約 0.33 m
  const rugMap = canvasTex(512, 686, (c, w, h) => {
    c.fillStyle = '#c9bfb1'; c.fillRect(0, 0, w, h);
    const bx = w * .15, by = h * .11;
    c.fillStyle = '#9f9383'; c.fillRect(bx, by, w - 2 * bx, h - 2 * by);
    for(let i = 0; i < 22000; i++){                          // 圈絨的細點（外圈亮點、內圈暗點）
      const x = Math.random() * w, y = Math.random() * h, inner = x > bx && x < w - bx && y > by && y < h - by;
      const v = (inner ? 140 : 190) + Math.random() * 40 | 0;
      c.fillStyle = `rgba(${v},${v - 7},${v - 18},.35)`; c.fillRect(x, y, 2, 2);
    }
  });
  // 電視：關機的深色玻璃面，只留一道很淡的窗光反射
  const tvMap = canvasTex(256, 144, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#2c3138'); g.addColorStop(.5, '#383d44'); g.addColorStop(1, '#1d2026');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const r = c.createLinearGradient(0, h, w * .55, 0); r.addColorStop(0, 'rgba(255,240,222,0)'); r.addColorStop(.5, 'rgba(255,240,222,.14)'); r.addColorStop(1, 'rgba(255,240,222,0)');
    c.fillStyle = r; c.fillRect(0, 0, w, h);
  });
  // 掛畫：手畫一張極簡版畫（米紙、灰褐色的弧＋一條細線），取代模型內建的示意海報
  const artMap = canvasTex(512, 724, (c, w, h) => {
    c.fillStyle = '#ede6d9'; c.fillRect(0, 0, w, h);
    for(let i = 0; i < 9000; i++){ const v = 200 + Math.random() * 40 | 0; c.fillStyle = `rgba(${v},${v - 5},${v - 18},.35)`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    c.fillStyle = '#b9a88f'; c.beginPath(); c.arc(w * .5, h * .56, w * .30, Math.PI, 0); c.fill();
    c.fillStyle = '#ede6d9'; c.beginPath(); c.arc(w * .5, h * .56, w * .22, Math.PI, 0); c.fill();
    c.fillStyle = '#8f8270'; c.fillRect(w * .14, h * .56, w * .72, 3);
    c.fillStyle = '#7d7264'; c.beginPath(); c.arc(w * .5, h * .40, w * .035, 0, 7); c.fill();
  });
  // 走道的小版畫：米紙、兩道低低的沙丘弧線、一顆橄欖綠的日
  const artMap2 = canvasTex(512, 724, (c, w, h) => {
    c.fillStyle = '#efe9de'; c.fillRect(0, 0, w, h);
    for(let i = 0; i < 9000; i++){ const v = 205 + Math.random() * 35 | 0; c.fillStyle = `rgba(${v},${v - 5},${v - 16},.3)`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    c.fillStyle = '#8a8f6a'; c.beginPath(); c.arc(w * .62, h * .36, w * .13, 0, 7); c.fill();
    c.fillStyle = '#c7b79c'; c.beginPath(); c.moveTo(0, h * .70); c.quadraticCurveTo(w * .45, h * .56, w, h * .66); c.lineTo(w, h); c.lineTo(0, h); c.fill();
    c.fillStyle = '#a89780'; c.beginPath(); c.moveTo(0, h * .80); c.quadraticCurveTo(w * .6, h * .70, w, h * .82); c.lineTo(w, h); c.lineTo(0, h); c.fill();
  });
  artMap.flipY = artMap2.flipY = false;   // glTF 的 UV 不翻轉
  // 圓鏡：假反射──上半是對面的白牆與天花、下半是淺木地板，加一道斜斜的柔光
  const mirMap = canvasTex(256, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#e9e7e2'); g.addColorStop(.55, '#dcd8d1'); g.addColorStop(.72, '#c9b9a2'); g.addColorStop(1, '#b89f80');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const r = c.createLinearGradient(0, 0, w, h); r.addColorStop(.25, 'rgba(255,255,255,0)'); r.addColorStop(.42, 'rgba(255,255,255,.35)'); r.addColorStop(.55, 'rgba(255,255,255,0)');
    c.fillStyle = r; c.fillRect(0, 0, w, h);
  });
  // DD 電箱門：平的白色門片、一圈細縫、右下角小小的 DD 標示（圖上的符號）
  const ddMap = canvasTex(256, 192, (c, w, h) => {
    c.fillStyle = '#f3f2ef'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#d2d1cd'; c.lineWidth = 2; c.strokeRect(10, 10, w - 20, h - 20);
    c.fillStyle = '#9a9994'; c.font = 'bold 15px sans-serif'; c.textAlign = 'right'; c.fillText('DD', w - 18, h - 18);
  });

  const Std = o => new THREE.MeshStandardMaterial(o);
  const nm = (t, s) => LOW ? {} : { normalMap: t, normalScale: new THREE.Vector2(s, s) };
  // 顏色對照 ref/target_muji.jpg 取樣：布面是低彩度的米灰（色相約 25–30°），橡木是很淡的淺蜜色、木紋對比低、不偏橘
  //   橡木貼圖在站外已調好底色（平均 sRGB 181,161,137）與木紋對比（×0.6），這裡的 color 只留一點點暖
  //   沙發布（FAB）刻意比地毯外圈（#c9bfb1）暗一階 ── 目標圖裡沙發是米灰、地毯外圈才是最亮的那塊
  const M = {
    OAK   : Std({ color: 0xfbf6f0, roughness: .6, map: oakD, roughnessMap: oakR, ...nm(oakN, .5) }),   // 淺橡木家具
    OAKL  : Std({ color: 0xf0e5d4, roughness: .55, map: oakD, roughnessMap: oakR }),                  // 橡木腳（稍深）
    FAB   : Std({ color: 0xbab0a2, roughness: .97, ...nm(linenN, 1.0) }),                             // 燕麥米灰亞麻（沙發）
    FABB  : Std({ color: 0xafa597, roughness: .97, ...nm(linenN, 1.0) }),                             // 沙發底座／硬背框（略深）
    MIRROR: Std({ color: 0xffffff, map: mirMap, roughness: .06, metalness: .35, envMapIntensity: .8 }),   // 鏡面：畫一張「映著對面白牆」的淺色漸層＋一點環境反射（純金屬鏡在這個環境光下會變成一片黑）
    TAUPE : Std({ color: 0xa39686, roughness: .95, ...nm(linenN, 1.0) }),                             // 灰褐抱枕／毯
    LINEN : Std({ color: 0xe2dbcf, roughness: .95, ...nm(linenN, .8) }),                              // 桌旗
    SEAT  : Std({ color: 0xa99e91, roughness: .96, ...nm(linenN, 1.0) }),                             // 餐椅坐墊（灰褐布）
    RUG   : Std({ color: 0xffffff, roughness: 1, map: rugMap, ...nm(boucleN, 1.0) }),
    WHT   : Std({ color: 0xf4f2ee, roughness: .5 }),                                                  // 白色櫃門／家電
    GRY   : Std({ color: 0xe3e2de, roughness: .55 }),                                                 // 淺灰家電
    QTZ   : Std({ color: 0xe4ded5, roughness: .32, ...nm(stoneN, .25) }),                             // 石英石檯面（淺暖灰，目標圖檯面偏米）
    STL   : Std({ color: 0xb9bbba, roughness: .32, metalness: .85 }),                                 // 髮絲不鏽鋼
    FRG   : Std({ color: 0xe9e6e0, roughness: .42 }),                                                 // 冰箱：霧面暖白烤漆（目標圖冰箱位是白色方塊、無印家電也是白）
    STLD  : Std({ color: 0x8f9394, roughness: .4, metalness: .8 }),                                   // 深一點的鋼（水槽內）
    BLK   : Std({ color: 0x232527, roughness: .55, metalness: .25 }),                                 // 霧黑五金
    GLB   : Std({ color: 0x0d0f12, roughness: .12, metalness: .35 }),                                 // 黑玻璃（爐面、微波爐門）
    BRASS : Std({ color: 0xc1a068, roughness: .35, metalness: .9 }),
    CER   : Std({ color: 0xf5f2ec, roughness: .35 }),                                                 // 白瓷
    OLIVE : Std({ color: 0x6d7a55, roughness: .9 }),
    DARKW : Std({ color: 0x3a342d, roughness: .7 }),                                                  // 深色踢腳／底座
    GLOBE : Std({ color: 0xfbf6ee, roughness: .55, emissive: 0xfff0d8, emissiveIntensity: .6, transparent: true, opacity: .96 }),
    LED   : Std({ color: 0xfff6e8, emissive: 0xfff1dc, emissiveIntensity: .9 }),
    TV    : Std({ color: 0x000000, emissive: 0xffffff, emissiveMap: tvMap, emissiveIntensity: .35, roughness: .34, metalness: 0 }),   // 關機的電視＝深色玻璃（不是金屬）：高光散開，不會有一顆刺眼白點
    DD    : Std({ color: 0xffffff, roughness: .5, map: ddMap }),
  };
  emissives.push({ mat: M.GLOBE, base: .6, kind: 'lamp' },
                 { mat: M.LED, base: .9, kind: 'lamp' }, { mat: M.TV, base: .35, kind: 'screen' });

  /* ---- 燈的位置 ----
     lighting.js 的登記規則（見它的檔頭）：power 是「亮度倍數」，1 ＝ 那種燈的正常亮度，會被夾在 0.3–1.6；
     kind 'pendant'／'ceiling'／'under' 是往下打的聚光，'floor'／'table'／'wall' 是四面八方的點光。
     真燈數量固定（燈池），每 0.2 秒依「人在哪間、離多近」重排 ── 登記順序不影響誰拿到燈。
     吊燈是 'pendant'（重點燈），lighting 仍會在餐廳另放一盞房間吸頂燈（它只看 'ceiling'）。 */
  const TX = 6.95, TZ = 5.55;                     // 餐桌中心
  const LX = 5.585 + 1.026, LZ = 0.42, LAMP_Y = FT + 1.50;  // 客廳落地燈（西北角、電視櫃北端前；電視沙發對調後鏡射過來）與燈球中心高
  const PEND_Y = 1.82;                            // 餐桌吊燈燈球中心（離地 1.82，球底約 1.65）
  lamps.push({ pos: new THREE.Vector3(TX, PEND_Y - .05, TZ), kind: 'pendant', room: '餐廳', color: 0xffdcb4, power: 0.85 });   // 燈離桌面只有 1 m：比正常再收一點，桌旗與白瓷才不會白掉
  lamps.push({ pos: new THREE.Vector3(LX, LAMP_Y, LZ), kind: 'floor', room: '客廳', color: 0xffd3a4, power: 1.0 });

  /* ============================================================
     2. 幾何小工具：UV 換成公尺、同材質合併
     ============================================================ */
  /** 方塊類：依面的法線方向把 0–1 的 UV 放大成實際公尺（貼圖比例才會一致），再隨機偏移讓木紋不重複 */
  function mUV(g, w, h, d){
    const n = g.attributes.normal, uv = g.attributes.uv, ou = Math.random() * 3, ov = Math.random() * 3;
    for(let i = 0; i < uv.count; i++){
      const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
      let su, sv;
      if(nx >= ny && nx >= nz){ su = d; sv = h; } else if(ny >= nz){ su = w; sv = d; } else { su = w; sv = h; }
      uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov);
    }
    return g;
  }
  function cUV(g, r, h){
    const n = g.attributes.normal, uv = g.attributes.uv, ou = Math.random() * 3;
    for(let i = 0; i < uv.count; i++){
      if(Math.abs(n.getY(i)) < .5) uv.setXY(i, uv.getX(i) * 2 * Math.PI * r + ou, uv.getY(i) * h);
      else uv.setXY(i, uv.getX(i) * 2 * r, uv.getY(i) * 2 * r);
    }
    return g;
  }
  /**
   * 一件家具：零件先在局部座標拼，done() 時套上 (x, z, rotY) 再依材質合併成幾個 mesh。
   * rot = [rx, ry, rz]，套用順序 rz → rx → ry（ry 最後，方便先傾斜再繞垂直軸轉）
   * into = 另一件 item：done() 時不自己建 mesh，而是把零件（已套好位置）併進那一件 → 四張椅子合成一組、少畫幾次
   */
  // 手機（low）圓角方塊的圓角段數一律 2（沙發、抱枕那些 seg 3 的在手機上看不出差別）
  function item(name, { x = 0, z = 0, rotY = 0, into = null } = {}){
    const parts = [];
    const base = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, 0, z);
    const add = (g, mat, px, py, pz, rot) => {
      if(rot){ if(rot[2]) g.rotateZ(rot[2]); if(rot[0]) g.rotateX(rot[0]); if(rot[1]) g.rotateY(rot[1]); }
      g.translate(px, py, pz);
      parts.push({ g: g.index ? g.toNonIndexed() : g, mat });
    };
    const it = {
      box(w, h, d, mat, px, py, pz, o = {}){ const g = new THREE.BoxGeometry(w, h, d); if(o.uv !== false) mUV(g, w, h, d); add(g, mat, px, py, pz, o.rot); return it; },
      rbox(w, h, d, r, mat, px, py, pz, o = {}){ const g = new RoundedBoxGeometry(w, h, d, LOW ? 2 : o.seg ?? 2, r); if(o.uv !== false) mUV(g, w, h, d); add(g, mat, px, py, pz, o.rot); return it; },
      cyl(rt, rb, h, mat, px, py, pz, o = {}){ const g = new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 20, 1, !!o.open); cUV(g, Math.max(rt, rb), h); add(g, mat, px, py, pz, o.rot); return it; },
      torus(R, r, mat, px, py, pz, o = {}){ const g = new THREE.TorusGeometry(R, r, o.rs ?? 8, o.ts ?? 24, o.arc ?? Math.PI * 2); add(g, mat, px, py, pz, o.rot); return it; },
      geo(g, mat, px, py, pz, rot){ add(g, mat, px, py, pz, rot); return it; },
      _push(g, mat){ parts.push({ g, mat }); },
      done(){
        if(into){ for(const p of parts) into._push(p.g.applyMatrix4(base), p.mat); return null; }
        const by = new Map();
        for(const p of parts){ if(!by.has(p.mat)) by.set(p.mat, []); by.get(p.mat).push(p.g.applyMatrix4(base)); }
        const grp = new THREE.Group(); grp.name = name; grp.userData.pub = name;   // pub：公共區家具的標記（檢查腳本用）
        for(const [mat, gs] of by){
          const m = new THREE.Mesh(mergeGeometries(gs), mat);
          m.castShadow = !mat.transparent; m.receiveShadow = true; grp.add(m);
        }
        scene.add(grp); return grp;
      },
    };
    return it;
  }
  /** 碰撞框（世界座標）；y1 預設 1.0 → 矮家具也擋人，不會直接穿過去 */
  const collide = (x0, z0, x1, z1, y1 = 1.0) => colliders.push({ x0, x1, z0, z1, y1, pub: 1 });

  /* ============================================================
     3. 模型（Poly Haven CC0，貼圖縮到 512；存成 glTF 描述檔 .model.json＋幾何圖檔 .geom.png（core.js 的 loadModel 會自己解開）＋外部貼圖檔：claude.ai 只收特定副檔名，公開分享審查也讀不動大檔）
     ============================================================ */
  const MODELS = './assets/public/models/';
  /* 盆栽：目標圖的植物都是「細碎小葉、橄欖綠」＋「白色圓筒盆」。
     葉子用 potted_plant_01 的枝葉（原本的陶甕盆與鵝卵石已在站外拿掉），盆子在這裡做：
     模型座標裡原盆高 0.53、半徑 0.23、枝幹從 0.41 長出來 → 白瓷圓筒盆（上寬下略窄）＋一層深色土，整組一起縮放 */
  const POT_GEO = (() => {
    const g = new THREE.CylinderGeometry(.205, .175, .50, 28, 1, true); g.translate(0, .25, 0);           // 盆身（開口）
    const lip = new THREE.TorusGeometry(.196, .009, 6, 28); lip.rotateX(Math.PI / 2); lip.translate(0, .50, 0);   // 圓潤的盆口
    const bottom = new THREE.CircleGeometry(.175, 28); bottom.rotateX(Math.PI / 2);                       // 盆底
    return mergeGeometries([g, lip, bottom].map(q => q.index ? q.toNonIndexed() : q));
  })();
  const SOIL_GEO = (() => { const g = new THREE.CircleGeometry(.19, 24); g.rotateX(-Math.PI / 2); g.translate(0, .455, 0); return g; })();
  const POT = Std({ color: 0xf2efe9, roughness: .42, side: THREE.DoubleSide });   // 雙面：從上往下看得到盆口內壁
  const SOIL = Std({ color: 0x3b3129, roughness: 1 });
  let leafMat = null;
  // 模型載不到（網路掉一下、檔案被擋）只少那一件，不要讓後面整個公共區的家具都不見（跟私領域模組同一個做法）
  const tryModel = url => loadModel(url).catch(e => { console.warn('public model missing', url, e && e.message || e); return null; });
  async function plant(x, z, y, h, rotY, { small = false } = {}){
    const o = await tryModel(MODELS + 'potted_plant_01_foliage/potted_plant_01_foliage.model.json');
    if(!o) return null;
    // 檔案裡有三份葉子、兩份枝幹（共用貼圖），只留要用的那一份：
    //   大盆栽 → 電腦 leaves_hi（1.49 萬面）／手機 leaves_lo（7.1 千面）＋ stem（1.75 千面）
    //   桌上 0.3 m 的小盆栽 → leaves_xs（2.5 千面的疏葉版）＋ stem_xs（556 面），電腦手機都一樣
    const keep = small ? ['leaves_xs', 'stem_xs'] : [LOW ? 'leaves_lo' : 'leaves_hi', 'stem'], gone = [];
    o.traverse(n => {
      const part = /_(leaves_hi|leaves_lo|leaves_xs|stem_xs|stem)$/.exec(n.name);
      if(part && !keep.includes(part[1])){ gone.push(n); return; }
      if(!n.isMesh || !/leaves/i.test(n.material.name)) return;
      if(!leafMat){ leafMat = n.material.clone(); leafMat.color.setHex(0xd4dcc0); leafMat.roughness = .8; }   // 葉色收斂成橄欖綠（不要鮮綠）
      n.material = leafMat;
    });
    for(const n of gone) n.removeFromParent();
    const pot = new THREE.Mesh(POT_GEO, POT), soil = new THREE.Mesh(SOIL_GEO, SOIL);
    pot.castShadow = pot.receiveShadow = soil.receiveShadow = true;
    o.add(pot, soil); o.userData.pub = 'plant';
    return place(o, { x, z, y, rotY, fit: { h } });
  }
  const vase = async (x, z, y, h, rotY = 0) => { const o = await tryModel(MODELS + 'ceramic_vase_01/ceramic_vase_01.model.json'); if(!o) return null; o.userData.pub = 'vase'; return place(o, { x, z, y, rotY, fit: { h } }); };
  /** 掛畫：Poly Haven 的畫框模型（正面朝 +z），把海報面換成 canvas 畫的版畫
   *  （站外已處理：玻璃層與示意海報的貼圖都拿掉了、畫框減到約 1 千面；萬一檔案裡還有玻璃就不畫） */
  async function framedPrint(map, x, z, y, rotY, h){
    const pic = await tryModel(MODELS + 'hanging_picture_frame_01/hanging_picture_frame_01.model.json');
    if(!pic) return null;
    pic.traverse(n => {
      if(!n.isMesh) return;
      const mn = n.material && n.material.name || '';
      if(/glass/i.test(mn)) n.visible = false;
      else if(/artwork/i.test(mn)) n.material = Std({ map, roughness: .85 });
    });
    pic.userData.pub = 'print';
    return place(pic, { x, z, y, rotY, fit: { h } });
  }

  /* ============================================================
     4. 客廳（x 5.585–8.95, z 0–4.04；圖：336.5 寬）：電視掛西牆（臥室二隔間）、L 型沙發靠東牆朝西看電視
        2026-09-19 Andy：「電視跟沙發交換位置」→ 整組左右鏡射（貴妃椅仍在北端靠窗）
        鏡射做法：沙發照原本「靠西牆」的寫法算座標，再用 mx() 翻到東牆；零件的 ry、rz 轉角變號（rx 不變）
        ⛔ 不用 scale.x = −1：手機版會把幾何合併（§8），負縮放合併後面會翻到裡面去
     ============================================================ */
  {
    const WW = 5.585, EW = 8.95;                  // 西牆（臥室二隔間東面）、東牆內面
    const mx = x => WW + EW - x;                  // 「離西牆 d」→「離東牆 d」
    const mr = r => r ? [r[0], -(r[1] || 0), -(r[2] || 0)] : r;
    // 地毯 2.35 × 3.15（沙發下到電視櫃前）
    const rug = new THREE.Mesh(new RoundedBoxGeometry(2.35, 0.012, 3.15, 2, 0.006), M.RUG);
    rug.position.set(mx(WW + 1.551), FT + 0.006, 1.825); rug.receiveShadow = true; rug.name = 'rug'; rug.userData.pub = 'rug'; scene.add(rug);
    M.RUG.normalMap && M.RUG.normalMap.repeat.set(2.35 / .55, 3.15 / .55);

    // ---- L 型沙發：主體靠東牆，北端往西延伸成貴妃椅 ----
    const s = item('sofa');
    const sb = (w, h, d, r, m, px, py, pz, o = {}) => s.rbox(w, h, d, r, m, mx(px), py, pz, { ...o, rot: mr(o.rot) });
    const X0 = WW + 0.06, X1 = X0 + 0.92, Z0 = 0.32, Z1 = 2.80, CX = WW + 1.456, CZ = 1.22;  // 主體 / 貴妃椅範圍（鏡射前）
    const yB0 = FT + 0.08, yB1 = FT + 0.28;                                    // 底座下緣、上緣（坐墊放在上面 → 坐面約 0.47 m、背墊頂約 0.90 m，一般沙發的高度）
    // 橡木短腳
    for(const [px, pz] of [[X0 + .07, Z0 + .07], [X0 + .07, Z1 - .07], [X1 - .07, Z1 - .07], [X1 - .07, (Z0 + Z1) / 2], [CX - .07, Z0 + .07], [CX - .07, CZ - .07], [X0 + .07, (Z0 + Z1) / 2]])
      s.cyl(.022, .018, yB0 - FT, M.OAKL, mx(px), FT + (yB0 - FT) / 2, pz, { seg: 12 });
    // 底座
    sb(X1 - X0, yB1 - yB0, Z1 - Z0, .03, M.FABB, (X0 + X1) / 2, (yB0 + yB1) / 2, (Z0 + Z1) / 2);
    sb(CX - X1 + .05, yB1 - yB0, CZ - Z0, .03, M.FABB, (X1 - .05 + CX) / 2, (yB0 + yB1) / 2, (Z0 + CZ) / 2);
    // 硬背框（東側整條 + 北側貴妃椅端）＋ 南側矮扶手；背墊另外做（目標圖的沙發是一塊塊鼓鼓的背墊）
    const FB = .11;
    sb(FB, .46, Z1 - Z0, .03, M.FABB, X0 + FB / 2, yB1 + .23 - .02, (Z0 + Z1) / 2, { seg: 3 });
    sb(CX - X0 - FB, .42, FB, .03, M.FABB, (X0 + FB + CX) / 2, yB1 + .21 - .02, Z0 + FB / 2, { seg: 3 });
    sb(X1 - X0, .27, .18, .05, M.FAB, (X0 + X1) / 2, yB1 + .135 - .02, Z1 - .09, { seg: 3 });
    // 坐墊：貴妃椅一大塊 + 兩塊；ST = 坐墊上緣
    const cushion = (x0, x1, z0, z1) => sb(x1 - x0 - .015, .15, z1 - z0 - .015, .055, M.FAB, (x0 + x1) / 2, yB1 + .075 - .005, (z0 + z1) / 2, { seg: 3 });
    const ST = yB1 + .145, zm = CZ + (Z1 - .18 - CZ) / 2;
    cushion(X0 + FB, CX, Z0 + FB, CZ);
    cushion(X0 + FB, X1, CZ, zm);
    cushion(X0 + FB, X1, zm, Z1 - .18);
    // 背墊：厚 0.17、高 0.44、往後仰 8°，坐在坐墊上——東側三塊、北側兩塊
    const BT = .17, BH = .44, TILT = .14, by = ST - .02 + BH / 2;
    const zs0 = Z0 + FB, zs1 = Z1 - .18, seg = (zs1 - zs0) / 3;
    for(let i = 0; i < 3; i++) sb(BT, BH, seg - .012, .06, M.FAB, X0 + FB + BT / 2 - .012, by, zs0 + seg * (i + .5), { seg: 3, rot: [0, 0, TILT] });
    const xs0 = X0 + FB + BT, xs1 = CX, segx = (xs1 - xs0) / 2;
    for(let i = 0; i < 2; i++) sb(segx - .012, BH, BT, .06, M.FAB, xs0 + segx * (i + .5), by, Z0 + FB + BT / 2 - .012, { seg: 3, rot: [-TILT, 0, 0] });
    // 抱枕（米白 ×2、灰褐 ×1）靠在背墊前 ＋ 折好的灰褐毯放在南端坐墊上
    const PF = X0 + FB + BT;                    // 背墊前緣
    sb(.46, .46, .13, .06, M.FAB, PF + .30, ST + .21, Z0 + FB + BT + .10, { seg: 3, rot: [-.22, .30, 0] });
    sb(.44, .44, .12, .06, M.TAUPE, PF + .09, ST + .20, zs0 + seg * 1.5, { seg: 3, rot: [.12, 1.45, 0] });
    sb(.46, .46, .13, .06, M.FAB, PF + .09, ST + .21, Z1 - .52, { seg: 3, rot: [.1, 1.62, 0] });
    sb(.40, .035, .34, .012, M.TAUPE, PF + .26, ST + .0175, Z1 - .45, { rot: [0, .12, 0] });
    sb(.34, .03, .28, .012, M.TAUPE, PF + .28, ST + .05, Z1 - .47, { rot: [0, -.1, 0] });
    s.done();
    collide(mx(X1), Z0, mx(X0), Z1, 1.0); collide(mx(CX), Z0, mx(X1), CZ, 1.0);

    // ---- 圓形橡木茶几 ⌀0.80（離沙發坐墊前緣 0.35、離電視櫃 0.82 → 走道 ≥ 0.8）----
    const CTX = mx(WW + 1.726), CTZ = 2.05;
    const t = item('coffee_table', { x: CTX, z: CTZ });
    t.cyl(.40, .40, .035, M.OAK, 0, FT + .40 + .0175, 0, { seg: 48 });
    t.cyl(.36, .36, .012, M.OAKL, 0, FT + .39, 0, { seg: 48 });                // 桌面下的托板
    for(let i = 0; i < 3; i++){ const a = Math.PI / 2 + i * Math.PI * 2 / 3; t.cyl(.020, .015, .40, M.OAKL, Math.cos(a) * .29, FT + .20, Math.sin(a) * .29, { seg: 12, rot: [0, -a, .13] }); }
    t.rbox(.32, .014, .22, .006, M.OAKL, -.07, FT + .442, .10, { rot: [0, -.3, 0] });  // 淺橡木托盤 + 兩個白瓷杯（目標圖茶几上是淺色小物，不要黑塊）
    t.cyl(.038, .032, .07, M.CER, -.03, FT + .484, .08, { seg: 16 }); t.cyl(.038, .032, .07, M.CER, -.13, FT + .484, .13, { seg: 16 });
    t.rbox(.22, .018, .16, .003, M.WHT, .02, FT + .444, -.20, { rot: [0, .25, 0] });   // 兩本疊著的書（米白＋灰褐）
    t.rbox(.20, .016, .15, .003, M.TAUPE, .02, FT + .461, -.20, { rot: [0, .1, 0] });
    t.done();
    collide(CTX - .40, CTZ - .40, CTX + .40, CTZ + .40, 1.0);

    // ---- 電視櫃（西牆）2.6 m 淺橡木、直條格柵門（門片朝東）----
    const cz0 = 0.30, cz1 = 2.90, cx0 = WW + .018, cx1 = WW + .42;
    const c = item('tv_console');
    c.box(cx1 - cx0 - .06, .05, cz1 - cz0 - .10, M.DARKW, (cx0 + cx1) / 2 - .03, FT + .025, (cz0 + cz1) / 2);   // 內縮踢腳
    c.rbox(cx1 - cx0, .36, cz1 - cz0, .008, M.OAK, (cx0 + cx1) / 2, FT + .05 + .18, (cz0 + cz1) / 2);
    c.rbox(cx1 - cx0 + .02, .028, cz1 - cz0 + .02, .006, M.OAK, (cx0 + cx1) / 2, FT + .41 + .014, (cz0 + cz1) / 2);   // 頂板
    for(let zz = cz0 + .035; zz < cz1 - .03; zz += .062) c.box(.012, .30, .028, M.OAKL, cx1 + .006, FT + .05 + .18, zz);  // 格柵
    c.box(.014, .30, .006, M.DARKW, cx1 + .002, FT + .05 + .18, (cz0 + cz1) / 2);  // 中間門縫
    // 頂上的書 + 小音響
    const tx = WW + .226;
    c.rbox(.16, .022, .22, .004, M.WHT, tx, FT + .44 + .011, 2.45); c.rbox(.15, .02, .21, .004, M.TAUPE, tx, FT + .462 + .01, 2.44, { rot: [0, -.08, 0] }); c.rbox(.14, .018, .20, .004, M.OLIVE, tx, FT + .482 + .009, 2.46);
    c.rbox(.12, .16, .12, .01, M.TAUPE, WW + .216, FT + .44 + .08, 0.62, { seg: 2 });
    c.done();
    collide(cx0, cz0, cx1, cz1, 1.0);
    // 壁掛電視 65"（1.45 × 0.83），畫面朝東；壁掛架背面貼西牆面（WW＝臥室二隔間東面；踢腳板只到 0.125 m 高，這個高度沒有）
    const tvz = 1.55, tvy = FT + 1.20;
    const tv = item('tv');
    tv.box(.02, .30, .25, M.BLK, WW + .01, tvy, tvz);                           // 壁掛架
    tv.rbox(.035, .83, 1.45, .006, M.BLK, WW + .02 + .0175, tvy, tvz);          // 機身
    tv.box(.004, .80, 1.42, M.TV, WW + .055 + .001, tvy, tvz, { uv: false });   // 畫面
    tv.done();

    // ---- 落地燈（西北角、電視櫃北端前）：目標圖是黃銅細桿頂著一顆乳白玻璃球（燈已在最前面登記）----
    const l = item('floor_lamp', { x: LX, z: LZ });
    const stemTop = LAMP_Y - .15;
    l.cyl(.13, .14, .02, M.BLK, 0, FT + .01, 0, { seg: 32 });                                   // 霧黑圓底座
    l.cyl(.010, .010, stemTop - FT - .02, M.BRASS, 0, (FT + .02 + stemTop) / 2, 0, { seg: 12 });  // 黃銅細桿
    l.cyl(.034, .028, .05, M.BRASS, 0, stemTop + .015, 0, { seg: 16 });                          // 燈座
    l.geo(new THREE.SphereGeometry(.13, LOW ? 20 : 32, LOW ? 14 : 20), M.GLOBE, 0, LAMP_Y, 0);    // 乳白燈球 ⌀0.26
    l.done();
    collide(LX - .14, LZ - .14, LX + .14, LZ + .14, 1.5);

    // ---- 沙發南端（東牆邊）：矮的橡木方几當花架 + 大盆栽（目標圖是一個比沙發扶手再矮一點的橡木方塊，上面一盆白盆植栽）----
    //      用同一種淺橡木做（Poly Haven 的 side_table_01 木色偏紅棕，跟整組橡木對不起來，不用）
    const SX = EW - .276, SZ = 3.24, SW = .44, SD = .44, SHT = .38;
    const st = item('plant_stand', { x: SX, z: SZ });
    for(const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) st.box(.035, SHT - .03, .035, M.OAKL, px * (SW / 2 - .03), FT + (SHT - .03) / 2, pz * (SD / 2 - .03));
    st.rbox(SW, .03, SD, .006, M.OAK, 0, FT + SHT - .015, 0);                     // 頂板
    st.rbox(SW - .05, .02, SD - .05, .004, M.OAK, 0, FT + .10, 0);                 // 下層板
    st.rbox(.24, .03, .18, .004, M.WHT, .02, FT + .10 + .025, .04, { rot: [0, .1, 0] });   // 下層放兩本書
    st.rbox(.22, .026, .17, .004, M.TAUPE, .02, FT + .10 + .053, .04, { rot: [0, -.06, 0] });
    st.done();
    await plant(SX, SZ, FT + SHT, .82, 0.6);
    collide(SX - SW / 2, SZ - SD / 2, SX + SW / 2, SZ + SD / 2, 1.3);
    // 茶几上的小盆栽、電視櫃上的白瓷瓶
    await plant(CTX + .18, CTZ + .02, FT + .435, .30, 2.1, { small: true });   // 托盤在西南、書在北、盆栽在東 → 三樣不互相壓到
    await vase(tx, 1.05, FT + .44, .30);
  }

  /* ============================================================
     5. 餐廳（x 4.85–8.95, z 4.04–8.20）＋玄關（東牆大門 z 6.996–8.064）
     ============================================================ */
  {
    const TW = 1.50, TD = 0.85, TH = FT + 0.74;           // TX / TZ 在最前面（登記吊燈時）就定好了
    // ---- 橡木餐桌 1.5 × 0.85 ----
    const d = item('dining_table', { x: TX, z: TZ });
    d.rbox(TW, .035, TD, .008, M.OAK, 0, TH - .0175, 0);
    d.box(TW - .24, .07, .03, M.OAK, 0, TH - .035 - .035, -TD / 2 + .075); d.box(TW - .24, .07, .03, M.OAK, 0, TH - .07, TD / 2 - .075);
    d.box(.03, .07, TD - .24, M.OAK, -TW / 2 + .075, TH - .07, 0); d.box(.03, .07, TD - .24, M.OAK, TW / 2 - .075, TH - .07, 0);
    for(const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]])
      d.cyl(.027, .019, TH - FT - .03, M.OAKL, sx * (TW / 2 - .09), FT + (TH - FT - .03) / 2, sz * (TD / 2 - .09), { seg: 14, rot: [-sz * .03, 0, sx * .03] });
    d.rbox(.95, .006, .36, .003, M.LINEN, 0, TH + .003, 0);                          // 亞麻桌旗
    d.cyl(.09, .07, .04, M.CER, .34, TH + .02, .02, { seg: 24 });                     // 白瓷淺碗
    d.done();
    collide(TX - TW / 2, TZ - TD / 2, TX + TW / 2, TZ + TD / 2, 1.0);
    await vase(TX - .28, TZ + .02, TH, .26);
    await plant(TX + .02, TZ - .03, TH, .34, 1.0, { small: true });

    // ---- 四張北歐橡木餐椅（目標圖：一體弧形實木椅背包住後半圈、灰褐布坐墊、四支圓腳）----
    // 椅子局部座標：+z＝坐的人面向的方向（前）、椅背在 −z。平面形狀用 Shape 畫（x, y），擠出後
    // rotateX(−90°)：形狀的 y → 世界 −z、擠出方向 → 世界 +y。坐墊後緣與椅背是同心圓弧（圓心在 z = +0.02）
    const ZC = .02;
    function seatShape(inset){
      const R = .235 - inset, hw = .22 - inset, zf = .21 - inset, r = .04;   // 後緣圓弧半徑、半寬、前緣
      const yc = -ZC, ya = Math.sqrt(R * R - hw * hw), aS = Math.atan2(ya, hw);
      const sh = new THREE.Shape();
      sh.moveTo(-hw + r, -zf); sh.lineTo(hw - r, -zf); sh.quadraticCurveTo(hw, -zf, hw, -zf + r);   // 前緣＋右前圓角
      sh.lineTo(hw, yc + ya); sh.absarc(0, yc, R, aS, Math.PI - aS, false);                          // 右側 → 後緣圓弧
      sh.lineTo(-hw, -zf + r); sh.quadraticCurveTo(-hw, -zf, -hw + r, -zf);                           // 左側＋左前圓角
      return sh;
    }
    const upright = g => { g.rotateX(-Math.PI / 2); return g; };
    const SH = FT + .42;                                                     // 座框高（布墊上緣約離地 0.46）
    const CS = LOW ? 8 : 16;                                                 // 弧線段數（手機減半）
    const SEAT_FRAME = upright(new THREE.ExtrudeGeometry(seatShape(0), { depth: .026, bevelEnabled: true, bevelThickness: .004, bevelSize: .004, bevelSegments: 1, curveSegments: CS }));
    const SEAT_PAD = upright(new THREE.ExtrudeGeometry(seatShape(.012), { depth: .03, bevelEnabled: true, bevelThickness: .012, bevelSize: .012, bevelSegments: LOW ? 2 : 3, curveSegments: CS }));
    const BACK = (() => {                                                    // 弧形椅背：平面上是一段 150° 的圓環
      const R = .265, T = .022, a0 = Math.PI / 12, a1 = Math.PI - a0, sh = new THREE.Shape();
      sh.absarc(0, -ZC, R, a0, a1, false); sh.absarc(0, -ZC, R - T, a1, a0, true);
      return upright(new THREE.ExtrudeGeometry(sh, { depth: .11, bevelEnabled: true, bevelThickness: .008, bevelSize: .006, bevelSegments: LOW ? 1 : 2, curveSegments: LOW ? 10 : 20 }));
    })();
    const BY0 = FT + .66;                                                    // 椅背下緣高（上緣約 0.78）
    const legAt = a => [Math.cos(a) * .254, ZC - Math.sin(a) * .254];        // 後腳立在椅背圓環的中線上
    const chairs = item('chairs');
    function chair(x, z, rotY){
      const ch = item('chair', { x, z, rotY, into: chairs });
      ch.geo(SEAT_FRAME.clone(), M.OAK, 0, SH - .045, 0);
      ch.geo(SEAT_PAD.clone(), M.SEAT, 0, SH - .019 + .012, 0);
      ch.geo(BACK.clone(), M.OAK, 0, BY0, 0);
      for(const sx of [-1, 1]){
        ch.cyl(.017, .013, SH - .045 - FT, M.OAKL, sx * .185, FT + (SH - .045 - FT) / 2, .16, { seg: 12, rot: [.04, 0, sx * .03] });   // 前腳
        const [lx, lz] = legAt(sx < 0 ? Math.PI * .78 : Math.PI * .22), h = BY0 + .07 - FT;
        ch.cyl(.017, .014, h, M.OAKL, lx, FT + h / 2, lz, { seg: 12, rot: [-.04, 0, sx * .02] });                                   // 後腳（穿到椅背裡）
      }
      ch.box(.37, .022, .022, M.OAKL, 0, FT + .17, .16); ch.box(.39, .022, .022, M.OAKL, 0, FT + .17, -.14);   // 椅腳橫檔
      ch.done();
    }
    // 北側兩張面朝南（rotY 0）、南側兩張面朝北（rotY π）；坐墊前緣剛好收進桌緣 1.5 cm
    const CZOFF = TD / 2 + .21 - .015;
    for(const [x, z, r] of [[TX - .38, TZ - CZOFF, 0], [TX + .38, TZ - CZOFF, 0], [TX - .38, TZ + CZOFF, Math.PI], [TX + .38, TZ + CZOFF, Math.PI]]){
      chair(x, z, r);
      const zb = ZC - .265 - .006, s = r ? -1 : 1, edge = TZ + s * -TD / 2;   // 碰撞框：從椅背到桌緣（坐墊前緣收在桌下的那 1.5 cm 算桌子的）
      collide(x - .27, Math.min(z + s * zb, edge), x + .27, Math.max(z + s * zb, edge), 1.0);
    }
    chairs.done();

    // ---- 餐桌吊燈：乳白玻璃球 ⌀0.34（燈已在最前面登記）----
    const p = item('pendant', { x: TX, z: TZ });
    p.cyl(.055, .055, .02, M.BLK, 0, H - .01, 0, { seg: 24 });
    p.cyl(.0025, .0025, H - .04 - (PEND_Y + .165), M.BLK, 0, (H - .02 + PEND_Y + .165) / 2, 0, { seg: 6 });
    p.cyl(.03, .035, .05, M.BRASS, 0, PEND_Y + .165, 0, { seg: 16 });
    p.geo(new THREE.SphereGeometry(.17, LOW ? 20 : 32, LOW ? 12 : 20), M.GLOBE, 0, PEND_Y, 0);
    p.done();

    // ---- 玄關：東牆 DD 電箱（規格書 z 6.108–6.724，跟大門的距離不變；圖上是符號、深度不照比例）→ 嵌壁式：箱體在牆裡，
    //      牆面只看到一圈 1.2 cm 的白框＋平的門片（總共凸出牆面約 1.8 cm），背面貼牆面 x 8.95 ----
    const EW = 8.95, DY = FT + 1.60, DZ = 6.416;
    const dd = item('dd_panel');
    dd.rbox(.012, .50, .616, .003, M.WHT, EW - .006, DY, DZ);                       // 外框（嵌壁箱的收邊框）
    dd.box(.006, .44, .556, M.DD, EW - .012 - .003, DY, DZ, { uv: false });          // 平門片（畫著門縫與 DD 字樣）
    dd.box(.004, .10, .012, M.BLK, EW - .018 - .002, DY, DZ - .24);                  // 門片上的小把手
    dd.done();

    // ---- 玄關櫃：東牆、電箱北側的一道細長矮橡木櫃（目標圖這面牆就是一條長矮櫃）1.55 × 0.34 × 0.95 ----
    //      北端 z 4.49、南端 z 6.04（離電箱 6.8 cm、離大門開門弧線 1 m 以上）；櫃面到餐椅 ≥ 1.0 m
    const sc = item('entry_cabinet');
    const sx0 = EW - .356, sx1 = EW - .018, sz0 = 4.49, sz1 = 6.04, sH = .95, nD = 4, dw = (sz1 - sz0) / nD;
    for(const [px, pz] of [[sx0 + .05, sz0 + .05], [sx0 + .05, sz1 - .05], [sx1 - .05, sz0 + .05], [sx1 - .05, sz1 - .05]]) sc.cyl(.013, .011, .10, M.BLK, px, FT + .05, pz, { seg: 10 });
    sc.rbox(sx1 - sx0, sH - .10 - .025, sz1 - sz0, .006, M.OAK, (sx0 + sx1) / 2, FT + .10 + (sH - .125) / 2, (sz0 + sz1) / 2);
    for(let i = 1; i < nD; i++) sc.box(.006, sH - .16, .004, M.DARKW, sx0 - .002, FT + .10 + (sH - .125) / 2, sz0 + dw * i);     // 門片縫
    for(let i = 0; i < nD; i++) sc.box(.006, .012, dw - .07, M.DARKW, sx0 - .002, FT + sH - .06, sz0 + dw * (i + .5));             // 上緣拉手溝
    sc.rbox(sx1 - sx0 + .02, .025, sz1 - sz0 + .02, .005, M.OAK, (sx0 + sx1) / 2, FT + sH - .0125, (sz0 + sz1) / 2);         // 頂板
    const TOPY = FT + sH;
    sc.cyl(.075, .06, .025, M.CER, (sx0 + sx1) / 2, TOPY + .0125, 5.56, { seg: 24 });                                          // 白瓷鑰匙碟
    sc.rbox(.17, .022, .23, .004, M.WHT, (sx0 + sx1) / 2 + .02, TOPY + .011, 5.89, { rot: [0, .06, 0] });                     // 兩本書
    sc.rbox(.16, .02, .22, .004, M.TAUPE, (sx0 + sx1) / 2 + .02, TOPY + .032, 5.89, { rot: [0, -.05, 0] });
    sc.done();
    collide(sx0, sz0, sx1, sz1, 1.1);
    await vase((sx0 + sx1) / 2, 4.72, TOPY, .30);
    // 櫃子上方一面圓鏡 ⌀0.55（橡木細框），鏡心離地 1.62 m；目標圖這面牆上有一個圓形的東西
    const mr = item('entry_mirror', { x: EW - .012, z: 5.39 });   // 背板 x 8.938–8.95 貼牆面
    mr.cyl(.275, .275, .012, M.DARKW, .006, FT + 1.62, 0, { seg: 48, rot: [0, 0, Math.PI / 2] });
    mr.geo(new THREE.CircleGeometry(.262, 48), M.MIRROR, -.009, FT + 1.62, 0, [0, -Math.PI / 2, 0]);   // 鏡面朝西（UV 0–1 才貼得到整張假反射）
    mr.torus(.268, .011, M.OAK, -.006, FT + 1.62, 0, { rot: [0, Math.PI / 2, 0], ts: 48, rs: 10 });
    mr.done();
    // 客廳與餐廳交界、東牆邊一盆高的橄欖綠植栽（電視櫃南端花架與玄關櫃之間）
    await plant(8.544, 4.08, FT, 1.15, 2.4);         // 枝葉寬約 0.74 m：中心退到離牆 0.41，葉尖才不會插進東牆（8.95）
    collide(8.334, 3.87, 8.754, 4.29, 1.0);
    // 餐廳西側 L 牆上一幅簡約掛畫（Poly Haven 模型），面向餐桌
    await framedPrint(artMap, 4.85 + .012 + .01, 5.55, FT + 1.05, Math.PI / 2, .84);
  }

  /* ============================================================
     5b. 走道（x 2.865–5.585, z 3.14–4.04）：只有 0.90 m 寬（圖：90）、三個房門都開在這裡 → 地上什麼都不放，
         只在北牆（臥室二南牆、x 2.985–4.565 那段沒有開口的牆）掛一幅小版畫，讓走進去時不是一面白牆
     ============================================================ */
  await framedPrint(artMap2, 3.775, 3.14 + .02, FT + 1.12, 0, .62);

  /* ============================================================
     6. 廚房（x 3.225–6.015, z 8.32–10.35；圖：279 寬）：南牆流理台（西爐東槽）、北牆矮櫃＋冰箱
        v5：櫃體跟著最近那道牆移動（西段 +0.6 cm、水槽段 +3.3 cm、南牆 −2.6 cm），尺寸不變
     ============================================================ */
  {
    const KX0 = 3.225 + .003, KX1 = 6.015 - .003, KZ1 = 10.35 - .003;   // 牆內面往內 3 mm：櫃子背板／側板不跟牆面同一個平面（俯瞰剖切時才不會一條一條閃）
    const CX0 = 3.319, CX1 = 5.889, CZ0 = 9.874;         // 規格書的流理台框（南牆）
    const CH = 0.86, TOP = FT + CH, TT = 0.04;            // 櫃高、檯面厚
    const UY0 = FT + 1.50, UY1 = FT + 2.25, UZ0 = KZ1 - .35;   // 吊櫃：底、頂、前緣（深 0.35）
    const k = item('kitchen_base');
    // 櫃體（規格框）＋ 兩端到牆的封板 ＋ 內縮踢腳
    k.box(CX1 - CX0, .60, KZ1 - CZ0 - .02, M.OAK, (CX0 + CX1) / 2, FT + .10 + .30, (CZ0 + .02 + KZ1) / 2);   // 櫃體只到 0.70（水槽底 0.75 以下），門片＋檯面把它包住
    k.box(CX1 - CX0, .10, KZ1 - CZ0 - .07, M.DARKW, (CX0 + CX1) / 2, FT + .05, (CZ0 + .07 + KZ1) / 2);
    k.box(CX0 - KX0, CH, KZ1 - CZ0, M.OAK, (KX0 + CX0) / 2, FT + CH / 2, (CZ0 + KZ1) / 2);
    k.box(KX1 - CX1, CH, KZ1 - CZ0, M.OAK, (CX1 + KX1) / 2, FT + CH / 2, (CZ0 + KZ1) / 2);
    // 門片／抽屜面板（3 mm 縫、上緣黑色拉手溝）：爐下兩抽、中間兩門、水槽下兩門
    const fronts = [[CX0, 4.006, 'drawer'], [4.006, 4.496, 'door'], [4.496, 4.986, 'door'], [4.986, 5.451, 'door'], [5.451, CX1, 'door']];
    for(const [a, b, kind] of fronts){
      if(kind === 'drawer'){
        k.rbox(b - a - .004, .38 - .004, .018, .002, M.OAK, (a + b) / 2, FT + .10 + .19, CZ0 + .009);
        k.rbox(b - a - .004, CH - .10 - .38 - .004, .018, .002, M.OAK, (a + b) / 2, FT + .48 + (CH - .10 - .38) / 2, CZ0 + .009);
        k.box(b - a - .06, .012, .004, M.BLK, (a + b) / 2, FT + .10 + .38 - .012, CZ0 + .001);
      }else k.rbox(b - a - .004, CH - .10 - .004, .018, .002, M.OAK, (a + b) / 2, FT + .10 + (CH - .10) / 2, CZ0 + .009);
      k.box(b - a - .06, .012, .004, M.BLK, (a + b) / 2, FT + CH - .014, CZ0 + .001);
    }
    // 石英石檯面（牆到牆，前緣出 1.5 cm），水槽處留洞：規格 sink x 5.071–5.836, z 9.883–10.295
    const SX0 = 5.093, SX1 = 5.813, SZ0 = 9.909, SZ1 = 10.274, TZ0 = CZ0 - .015;
    k.box(SX0 - KX0, TT, KZ1 - TZ0, M.QTZ, (KX0 + SX0) / 2, TOP + TT / 2, (TZ0 + KZ1) / 2);
    k.box(KX1 - SX1, TT, KZ1 - TZ0, M.QTZ, (SX1 + KX1) / 2, TOP + TT / 2, (TZ0 + KZ1) / 2);
    k.box(SX1 - SX0, TT, SZ0 - TZ0, M.QTZ, (SX0 + SX1) / 2, TOP + TT / 2, (TZ0 + SZ0) / 2);
    k.box(SX1 - SX0, TT, KZ1 - SZ1, M.QTZ, (SX0 + SX1) / 2, TOP + TT / 2, (SZ1 + KZ1) / 2);
    // 不鏽鋼雙槽：底板 + 四壁 + 中隔 + 檯面上一圈細邊
    const SB = TOP + TT - .19;
    k.box(SX1 - SX0, .006, SZ1 - SZ0, M.STLD, (SX0 + SX1) / 2, SB, (SZ0 + SZ1) / 2);
    k.box(.006, .19, SZ1 - SZ0, M.STLD, SX0 + .003, SB + .095, (SZ0 + SZ1) / 2); k.box(.006, .19, SZ1 - SZ0, M.STLD, SX1 - .003, SB + .095, (SZ0 + SZ1) / 2);
    k.box(SX1 - SX0, .19, .006, M.STLD, (SX0 + SX1) / 2, SB + .095, SZ0 + .003); k.box(SX1 - SX0, .19, .006, M.STLD, (SX0 + SX1) / 2, SB + .095, SZ1 - .003);
    k.box(.02, .17, SZ1 - SZ0 - .02, M.STLD, (SX0 + SX1) / 2, SB + .085, (SZ0 + SZ1) / 2);
    for(const [px, pz, w, dd] of [[(SX0 + SX1) / 2, SZ0 - .012, SX1 - SX0 + .05, .025], [(SX0 + SX1) / 2, SZ1 + .012, SX1 - SX0 + .05, .025], [SX0 - .012, (SZ0 + SZ1) / 2, .025, SZ1 - SZ0], [SX1 + .012, (SZ0 + SZ1) / 2, .025, SZ1 - SZ0]])
      k.box(w, .004, dd, M.STL, px, TOP + TT + .002, pz);
    k.cyl(.02, .02, .004, M.BLK, SX0 + (SX1 - SX0) / 4, SB + .005, (SZ0 + SZ1) / 2, { seg: 16 }); k.cyl(.02, .02, .004, M.BLK, SX1 - (SX1 - SX0) / 4, SB + .005, (SZ0 + SZ1) / 2, { seg: 16 });
    // 鵝頸龍頭（後緣中央）：彎頂離地 1.26，低於窗台 1.30（龍頭就在南窗前面）
    //   底座後緣 z 10.36，離背板面（10.361）還有 1 mm；撥桿從側邊的轂往前伸，不碰背板與牆
    const fx = (SX0 + SX1) / 2, fz = SZ1 + .035;
    k.cyl(.022, .025, .03, M.STL, fx, TOP + TT + .015, fz, { seg: 16 });
    k.cyl(.012, .012, .19, M.STL, fx, TOP + TT + .03 + .095, fz, { seg: 12 });
    k.torus(.085, .011, M.STL, fx, TOP + TT + .22, fz - .085, { arc: Math.PI, rot: [0, Math.PI / 2, 0], ts: 20 });
    k.cyl(.011, .011, .06, M.STL, fx, TOP + TT + .19, fz - .17, { seg: 12 });
    k.cyl(.01, .01, .025, M.STL, fx + .022, TOP + TT + .08, fz, { seg: 12, rot: [0, 0, Math.PI / 2] });   // 撥桿的轂（接在龍頭側面）
    k.box(.01, .01, .065, M.STL, fx + .032, TOP + TT + .08, fz - .02);                                   // 撥桿（往前）
    // 黑玻璃四口爐（規格 hob x 3.385–3.981、z 9.888–10.282 → 0.59 × 0.40，完全落在檯面內）
    const HX = 3.683, HZ = 10.085;
    k.rbox(.59, .008, .40, .003, M.GLB, HX, TOP + TT + .004, HZ);
    for(const [ox, oz] of [[-.14, -.095], [.14, -.095], [-.14, .10], [.14, .10]]){
      k.torus(.062, .006, M.BLK, HX + ox, TOP + TT + .009, HZ + oz, { rot: [Math.PI / 2, 0, 0], rs: 6, ts: 28 });
      k.cyl(.035, .035, .006, M.BLK, HX + ox, TOP + TT + .011, HZ + oz, { seg: 20 });
    }
    // 檯面後方的防濺背板：跟檯面同一塊淺暖灰石英石（無印式的簡單一片），從檯面到吊櫃底
    //   窗（x 5.017–5.845、窗台 1.30）前面有 arch 的石材窗台板（兩端各多 2 cm、y 1.28–1.31）→ 背板在窗台板下緣收邊、兩端繞開
    const BY = TOP + TT, WX0 = 5.017, WX1 = 5.845, SL0 = 1.28, SL1 = 1.31;
    k.box(WX0 - .02 - KX0, UY0 - BY, .012, M.QTZ, (KX0 + WX0 - .02) / 2, (BY + UY0) / 2, KZ1 - .006);
    k.box(WX1 - WX0 + .04, SL0 - BY, .012, M.QTZ, (WX0 + WX1) / 2, (BY + SL0) / 2, KZ1 - .006);
    k.box(KX1 - WX1 - .02, UY0 - BY, .012, M.QTZ, (WX1 + .02 + KX1) / 2, (BY + UY0) / 2, KZ1 - .006);
    for(const xm of [WX0 - .01, WX1 + .01]) k.box(.02, UY0 - SL1, .012, M.QTZ, xm, (SL1 + UY0) / 2, KZ1 - .006);   // 窗台板兩端上方
    // 吊櫃（白色）x 3.225–4.906，y 1.50–2.25，深 0.35；爐上是抽油煙機（不鏽鋼罩 + 上方櫃）
    k.box(3.383 - KX0, UY1 - UY0, .35, M.WHT, (KX0 + 3.383) / 2, (UY0 + UY1) / 2, (UZ0 + KZ1) / 2);
    k.box(4.906 - 3.983, UY1 - UY0, .33, M.WHT, (3.983 + 4.906) / 2, (UY0 + UY1) / 2, (UZ0 + .02 + KZ1) / 2);
    for(const [a, b] of [[3.983, 4.446], [4.446, 4.906]]) k.rbox(b - a - .004, UY1 - UY0 - .004, .018, .002, M.WHT, (a + b) / 2, (UY0 + UY1) / 2, UZ0 + .009);
    k.box(.60, UY1 - (UY0 + .20), .35, M.WHT, HX, (UY0 + .20 + UY1) / 2, (UZ0 + KZ1) / 2);              // 煙機上櫃
    k.rbox(.60, .10, .40, .006, M.STL, HX, UY0 + .05, KZ1 - .20);                                          // 煙機罩
    k.box(.56, .012, .30, M.BLK, HX, UY0 + .003, KZ1 - .18, { uv: false });                                // 罩底黑濾網
    const LEDZ = UZ0 + .04;                                                                                   // LED 燈條靠吊櫃前緣（離背板 0.32 m）
    k.box(4.906 - 3.996, .012, .02, M.LED, (3.996 + 4.906) / 2, UY0 - .006, LEDZ, { uv: false });          // 櫃下 LED 燈條
    // 檯面上的小物：霧黑水壺、橡木砧板、兩個白瓷罐（爐與水槽之間）
    const KY = TOP + TT;
    k.cyl(.075, .085, .17, M.BLK, 4.366, KY + .085, 10.174, { seg: 24 });
    k.cyl(.012, .016, .11, M.BLK, 4.366 - .085, KY + .13, 10.174, { seg: 8, rot: [0, 0, .9] });             // 壺嘴
    k.torus(.06, .009, M.BLK, 4.366, KY + .20, 10.174, { arc: Math.PI, rot: [0, 0, 0], ts: 20 });              // 提把
    k.rbox(.38, .016, .26, .004, M.OAKL, 4.726, KY + .008, 10.184, { rot: [0, .18, 0] });
    k.cyl(.048, .045, .15, M.CER, 4.106, KY + .075, 10.244, { seg: 20 }); k.cyl(.042, .040, .12, M.CER, 4.216, KY + .06, 10.264, { seg: 20 });
    k.done();
    collide(KX0, CZ0, KX1, KZ1, 1.0);
    // 櫃下燈：'under' ＝ 往下打的寬角聚光；放在 LED 燈條正下方（燈條中心 x 4.445），照檯面與背板下半
    //   一盞點狀聚光打在 0.32 m 外的背板上會是一圈圓亮斑（真的燈條是一整條）→ 亮度收到 0.75，亮斑不會白掉
    lamps.push({ pos: new THREE.Vector3(4.451, UY0 - .015, LEDZ), kind: 'under', room: '廚房', color: 0xfff1dc, power: 0.75 });

    // ---- 北牆：靠西實線櫃（規格 x 3.228–4.005, z 8.338–8.765）→ 橡木矮櫃 + 微波爐 ----
    const NX0 = KX0, NX1 = 4.005, NZ0 = 8.338, NZ1 = 8.765;
    const n = item('kitchen_north_cabinet');
    n.box(NX1 - NX0, .10, NZ1 - NZ0 - .05, M.DARKW, (NX0 + NX1) / 2, FT + .05, (NZ0 + NZ1 - .05) / 2);
    n.box(NX1 - NX0, CH - .10, NZ1 - NZ0 - .02, M.OAK, (NX0 + NX1) / 2, FT + .10 + (CH - .10) / 2, (NZ0 + NZ1 - .02) / 2);
    for(const [a, b] of [[NX0, (NX0 + NX1) / 2], [(NX0 + NX1) / 2, NX1]]){
      n.rbox(b - a - .004, CH - .10 - .004, .018, .002, M.OAK, (a + b) / 2, FT + .10 + (CH - .10) / 2, NZ1 - .009);
      n.box(b - a - .06, .012, .004, M.BLK, (a + b) / 2, FT + CH - .014, NZ1 - .001);
    }
    // 檯面：前緣出 1.5 cm（到 z 8.78）；陽台門的門框線板從 z 8.815 起 → 碰不到，不用切缺口（v4 門洞比較北時要切）
    const QX0 = NX0, QX1 = NX1 + .01, QZ1 = NZ1 + .015;
    n.rbox(QX1 - QX0, .03, QZ1 - NZ0, .004, M.QTZ, (QX0 + QX1) / 2, TOP + .015, (NZ0 + QZ1) / 2);
    // 微波爐（黑玻璃門 + 不鏽鋼把手）
    const mx = (NX0 + NX1) / 2, mz = (NZ0 + NZ1) / 2 + .02;
    n.rbox(.46, .27, .34, .008, M.GRY, mx, TOP + .03 + .135, mz);
    n.box(.32, .22, .004, M.GLB, mx - .05, TOP + .03 + .135, mz + .17 + .002, { uv: false });
    n.box(.09, .22, .004, M.BLK, mx + .17, TOP + .03 + .135, mz + .17 + .002, { uv: false });
    n.cyl(.006, .006, .18, M.STL, mx + .09, TOP + .03 + .135, mz + .17 + .02, { seg: 8 });
    n.done();
    collide(NX0, NZ0, NX1, NZ1, 1.2);

    // ---- 冰箱（虛線冰箱位 x 4.071–4.782, z 8.331–8.993）：無印式霧面白、上冷藏門＋下冷凍抽屜、平面內嵌把手 ----
    // 深度做 0.62（在虛線框內）；把手做成平的溝槽、不凸出 → 冰箱門面到檯面前緣 0.9 m，走道保持 ≥ 0.8
    const FX0 = 4.081, FX1 = 4.771, FZ0 = 8.336, FZ1 = 8.956, FH = 1.80;
    const f = item('fridge');
    f.rbox(FX1 - FX0, FH - .08, FZ1 - FZ0, .012, M.FRG, (FX0 + FX1) / 2, FT + .08 + (FH - .08) / 2, (FZ0 + FZ1) / 2);
    f.box(FX1 - FX0 - .04, .08, FZ1 - FZ0 - .06, M.DARKW, (FX0 + FX1) / 2, FT + .04, (FZ0 + FZ1) / 2 - .03);    // 內縮底座
    f.box(FX1 - FX0 - .02, .006, .004, M.DARKW, (FX0 + FX1) / 2, FT + .72, FZ1 + .001);                         // 冷藏門／冷凍抽屜分縫
    f.box(FX1 - FX0 - .12, .014, .004, M.GRY, (FX0 + FX1) / 2, FT + .70, FZ1 + .001);                           // 抽屜上緣的內嵌把手溝
    f.box(.014, .50, .004, M.GRY, FX1 - .035, FT + 1.10, FZ1 + .001);                                            // 冷藏門邊的直向把手溝（門鉸在西側）
    f.done();
    collide(FX0, FZ0, FX1, FZ1, FH);
  }

  /* ============================================================
     7. 陽台（x 0–3.075, z 8.35–10.025；圖：307.5 寬、到女兒牆 182.5）：洗衣機、洗衣槽在北牆下，AC 室外機在百葉後
     ============================================================ */
  {
    // 洗衣機（虛線 X 框 x 0–0.743, z 8.357–9.127）：滾筒式、門朝南
    const WX = 0.375, WZ0 = 8.376, WD = .62, WW = .60, WH = .85;
    const w = item('washer');
    w.rbox(WW, WH - .03, WD, .02, M.WHT, WX, FT + .03 + (WH - .03) / 2, WZ0 + WD / 2);
    w.box(WW - .06, .03, WD - .06, M.DARKW, WX, FT + .015, WZ0 + WD / 2);
    w.torus(.20, .022, M.GRY, WX, FT + .40, WZ0 + WD + .01, { rot: [0, 0, 0], ts: 40, rs: 10 });
    w.cyl(.185, .185, .012, M.GLB, WX, FT + .40, WZ0 + WD + .004, { seg: 40, rot: [Math.PI / 2, 0, 0] });
    w.box(WW - .06, .06, .006, M.GLB, WX, FT + WH - .07, WZ0 + WD + .003, { uv: false });           // 面板
    w.cyl(.028, .028, .012, M.GRY, WX + .18, FT + WH - .07, WZ0 + WD + .01, { seg: 20, rot: [Math.PI / 2, 0, 0] });
    w.done();
    collide(WX - WW / 2, WZ0, WX + WW / 2, WZ0 + WD, WH);

    // 洗衣槽（虛線 x 0.832–1.364, z 8.376–8.796）：淺灰櫃 + 不鏽鋼槽 + 壁式龍頭
    const LX0 = 0.832, LX1 = 1.362, LZ0 = 8.376, LZ1 = 8.796, LH = .82;
    const s = item('laundry_sink');
    s.rbox(LX1 - LX0, LH - .08 - .24, LZ1 - LZ0, .008, M.GRY, (LX0 + LX1) / 2, FT + .08 + (LH - .08 - .24) / 2, (LZ0 + LZ1) / 2);
    s.box(LX1 - LX0, .24, .012, M.GRY, (LX0 + LX1) / 2, FT + LH - .12, LZ1 - .006); s.box(LX1 - LX0, .24, .012, M.GRY, (LX0 + LX1) / 2, FT + LH - .12, LZ0 + .006);
    s.box(.012, .24, LZ1 - LZ0, M.GRY, LX0 + .006, FT + LH - .12, (LZ0 + LZ1) / 2); s.box(.012, .24, LZ1 - LZ0, M.GRY, LX1 - .006, FT + LH - .12, (LZ0 + LZ1) / 2);
    s.box(LX1 - LX0 - .04, .08, LZ1 - LZ0 - .05, M.DARKW, (LX0 + LX1) / 2, FT + .04, (LZ0 + LZ1) / 2 - .025);
    s.box(.004, LH - .16, .008, M.DARKW, (LX0 + LX1) / 2, FT + .08 + (LH - .08) / 2, LZ1 + .002);
    const lt = FT + LH, bx0 = LX0 + .05, bx1 = LX1 - .05, bz0 = LZ0 + .05, bz1 = LZ1 - .05, bb = lt - .20;
    // 白色檯面：一圈框（中間是槽口），跟廚房檯面留水槽洞的做法一樣；槽壁頂在檯面下 1 cm（下嵌式）
    const ex0 = LX0 - .005, ex1 = LX1 + .005, ez0 = LZ0 - .005, ez1 = LZ1 + .005;
    s.box(bx0 - ex0, .03, ez1 - ez0, M.WHT, (ex0 + bx0) / 2, lt + .015, (ez0 + ez1) / 2);
    s.box(ex1 - bx1, .03, ez1 - ez0, M.WHT, (bx1 + ex1) / 2, lt + .015, (ez0 + ez1) / 2);
    s.box(bx1 - bx0, .03, bz0 - ez0, M.WHT, (bx0 + bx1) / 2, lt + .015, (ez0 + bz0) / 2);
    s.box(bx1 - bx0, .03, ez1 - bz1, M.WHT, (bx0 + bx1) / 2, lt + .015, (bz1 + ez1) / 2);
    s.box(bx1 - bx0, .006, bz1 - bz0, M.STLD, (bx0 + bx1) / 2, bb, (bz0 + bz1) / 2);
    s.box(.006, .22, bz1 - bz0, M.STLD, bx0 + .003, bb + .11, (bz0 + bz1) / 2); s.box(.006, .22, bz1 - bz0, M.STLD, bx1 - .003, bb + .11, (bz0 + bz1) / 2);
    s.box(bx1 - bx0, .22, .006, M.STLD, (bx0 + bx1) / 2, bb + .11, bz0 + .003); s.box(bx1 - bx0, .22, .006, M.STLD, (bx0 + bx1) / 2, bb + .11, bz1 - .003);
    s.cyl(.018, .018, .004, M.BLK, (bx0 + bx1) / 2, bb + .004, (bz0 + bz1) / 2, { seg: 14 });
    s.cyl(.014, .014, .12, M.STL, (LX0 + LX1) / 2, lt + .28, LZ0 - .026 + .07, { seg: 12, rot: [Math.PI / 2, 0, 0] });   // 壁式龍頭
    s.cyl(.03, .03, .012, M.STL, (LX0 + LX1) / 2, lt + .28, LZ0 - .02, { seg: 16, rot: [Math.PI / 2, 0, 0] });
    s.cyl(.012, .012, .07, M.STL, (LX0 + LX1) / 2, lt + .245, LZ0 - .026 + .13, { seg: 12 });
    s.done();
    collide(LX0, LZ0, LX1, LZ1, LH);

    // AC 室外機（虛線 x 0.247–1.176 → 女兒牆內面 10.025 前）：架高 10 cm，風扇朝百葉
    const AX0 = 0.265, AX1 = 1.165, AZ0 = 9.718, AZ1 = 10.0, AY0 = FT + .10, AH = .62;   // 風扇護網凸出 1.8 cm → 本體前緣收到 10.0，護網剛好不碰女兒牆（10.025）
    const a = item('ac_unit');
    a.rbox(AX1 - AX0, AH, AZ1 - AZ0, .012, M.GRY, (AX0 + AX1) / 2, AY0 + AH / 2, (AZ0 + AZ1) / 2);
    a.cyl(.235, .235, .006, M.BLK, AX0 + .33, AY0 + AH / 2, AZ1 + .002, { seg: 36, rot: [Math.PI / 2, 0, 0] });
    a.torus(.24, .012, M.GRY, AX0 + .33, AY0 + AH / 2, AZ1 + .006, { ts: 40 });
    for(let i = 0; i < 3; i++) a.box(.47, .012, .006, M.GRY, AX0 + .33, AY0 + AH / 2, AZ1 + .008, { rot: [0, 0, i * Math.PI / 3] });
    for(let y = AY0 + .08; y < AY0 + AH - .06; y += .045) a.box(.008, .012, AZ1 - AZ0 - .06, M.BLK, AX1 + .002, y, (AZ0 + AZ1) / 2);   // 側面進風格柵
    for(const px of [AX0 + .10, AX1 - .10]) a.box(.05, .10, AZ1 - AZ0 - .04, M.STL, px, FT + .05, (AZ0 + AZ1) / 2);                    // 腳架
    a.cyl(.012, .012, AX0, M.GRY, AX0 / 2, AY0 + .12, AZ0 + .06, { seg: 8, rot: [0, 0, Math.PI / 2] });                                  // 冷媒管往牆
    a.done();
    collide(AX0, AZ0, AX1, AZ1, AY0 + AH);
  }

  /* ============================================================
     8. 手機（low）：同一間房、同一種材質的零件併成一個 mesh（公共區 mesh 104 → 55；手機俯瞰整格 draw call 347 → 292）
        電腦版不併：每件家具留著自己的 Group（名字＋userData.pub），檢查腳本逐件量牆、門弧、淨寬要用
        高過 1.3 m 的東西另外成一組 → lighting 俯瞰剖切時的「切口補色」只會套在真的高過切線的那幾件上
     ============================================================ */
  if(LOW) batchByRoom();
  function batchByRoom(){
    const ZONES = ['客廳', '餐廳', '走道', '廚房', '陽台'];
    const zoneOf = (x, z) => ZONES.find(k => ctx.R[k].rects.some(q => x >= q[0] && x <= q[2] && z >= q[1] && z <= q[3])) || '其他';
    // 手機版沒有法線貼圖：下面這些素色材質彼此只差顏色（粗糙度差不到 0.1）→ 換成「頂點色 ＋ 共用材質」，
    // 同一間房裡就能併成同一個 mesh（不這樣做的話，一間房有二十幾種材質，合併幾乎省不到 draw call）
    const SH = { matte: Std({ vertexColors: true, roughness: .95 }), satin: Std({ vertexColors: true, roughness: .45 }),
                 metal: Std({ vertexColors: true, roughness: .35, metalness: .85 }) };
    const TINT = new Map([[M.FAB, 'matte'], [M.FABB, 'matte'], [M.TAUPE, 'matte'], [M.LINEN, 'matte'], [M.SEAT, 'matte'], [M.OLIVE, 'matte'], [M.DARKW, 'matte'], [SOIL, 'matte'],
                          [M.WHT, 'satin'], [M.GRY, 'satin'], [M.FRG, 'satin'], [M.CER, 'satin'],
                          [M.STL, 'metal'], [M.STLD, 'metal'], [M.BRASS, 'metal']]);
    const bb = new THREE.Box3(), c = new THREE.Vector3(), buckets = new Map();
    for(const o of scene.children.filter(n => n.userData.pub && !n.userData.batched)){
      o.updateWorldMatrix(true, true);
      bb.setFromObject(o).getCenter(c);
      const zone = zoneOf(c.x, c.z) + (bb.max.y > 1.3 ? '·高' : '');
      o.traverse(m => {
        if(!m.isMesh || !m.visible || Array.isArray(m.material)) return;
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();   // 模型的幾何是快取共用的 → 一律先複製
        for(const k of Object.keys(g.attributes)) if(!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        if(!g.attributes.normal) g.computeVertexNormals();
        if(!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        g.applyMatrix4(m.matrixWorld);
        let mat = m.material;
        const t = TINT.get(mat);
        if(t){   // 頂點色 ＝ 原材質的顏色（three 的 Color 本來就存線性值，頂點色也是線性）
          const n = g.attributes.position.count, col = new Float32Array(n * 3);
          for(let i = 0; i < n; i++){ col[i * 3] = mat.color.r; col[i * 3 + 1] = mat.color.g; col[i * 3 + 2] = mat.color.b; }
          g.setAttribute('color', new THREE.BufferAttribute(col, 3));
          mat = SH[t];
        }
        const key = zone + '|' + mat.uuid;
        if(!buckets.has(key)) buckets.set(key, { zone, mat, cast: !mat.transparent, list: [] });
        buckets.get(key).list.push(g);
      });
      o.removeFromParent();
    }
    const groups = new Map();
    for(const b of buckets.values()){
      const g = b.list.length === 1 ? b.list[0] : mergeGeometries(b.list);
      if(b.list.length > 1) b.list.forEach(x => x.dispose());
      if(!g) continue;
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, b.mat); mesh.castShadow = b.cast; mesh.receiveShadow = true;
      if(!groups.has(b.zone)){
        const grp = new THREE.Group(); grp.name = 'public-' + b.zone; grp.userData.pub = 'batch:' + b.zone; grp.userData.batched = true;
        scene.add(grp); groups.set(b.zone, grp);
      }
      groups.get(b.zone).add(mesh);
    }
  }
}
