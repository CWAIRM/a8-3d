/* ============================================================
   furniture_private.js — 私領域家具：主臥室、前室、主浴廁、次浴廁（臥室二、三是主題房，見 theme_br2.js／theme_br3.js）
   位置全部依 ctx.R / ctx.doors / ctx.windows / ctx.fixtures（公尺，原點＝西外牆內面 × 北外牆內面，
   X 向東、Z 向南、Y 向上）。門的迴轉扇形（ctx.doors[i].swing）一律留空。
   風格：日式無印 × 北歐 — 淺橡木、米白亞麻、灰褐蓋毯、白瓷、霧黑／鍍鉻五金、幾盆綠植。
   床＋床品（鼓起的羽絨被、摺邊、床旗、靠著床頭的枕頭）、床頭櫃、矮櫃、衣櫃、高櫃、書桌、椅子、燈、
   所有衛浴設備都是程式現做；盆栽（白色霧面陶盆）、掛畫、花瓶用 Poly Haven CC0 模型
   （assets/private/，出處見 CREDITS.md）。
   鏡子（兩面：主臥穿衣鏡、主浴洗手台鏡）：手機與電腦都有「反射探針」鏡 —— 在鏡前拍一次 6 面環景、
   用房間盒子做視差校正，看得到這間房；電腦版走進同一間房時再疊一片 three.js Reflector 真反射。
   ⚠️ 平面圖註記兩間浴室的「無框明鏡、毛巾架、衛生紙架、蓮蓬頭」都是「取消」（建商不裝、屋主自己裝）；
      2026-09-19 Andy：兩間都照放（當作屋主之後會自己裝）。次浴依註記「單體馬桶改智能馬桶、換氣機改暖風機」。
   最後把所有靜態網格依材質合併（bake）：俯瞰時每種材質只佔一個 draw call。
   ============================================================ */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from '../assets/private/Reflector.js';

export default async function buildPrivate(ctx){
  const { scene, QUALITY, addCollider, loadModel, place, lamps, emissives } = ctx;
  const LOW = QUALITY === 'low';
  const FLOOR = 0.045;                 // 地板完成面（arch 慣例）
  const SEG = LOW ? 18 : 32;           // 車削件圓周分段
  const root = new THREE.Group(); root.name = 'furniture_private'; scene.add(root);
  const reflectors = [];               // 真反射鏡（電腦版）：{mesh, room}
  const probes = [];                   // 反射探針鏡（全部）：{mesh, room}

  /* ============================================================
     1. 材質（小張程式產生的貼圖：亞麻織紋、羊毛地毯、橡木直紋、掛畫圖案）
     ============================================================ */
  const ANISO = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy());
  function canvasTex(size, paint, repeat = 1, srgb = true){
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    paint(cv.getContext('2d'), size);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = ANISO;
    if(srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const linen = canvasTex(256, (c, s) => {          // 亞麻：細細的十字織紋
    c.fillStyle = '#ececec'; c.fillRect(0, 0, s, s);
    for(let y = 0; y < s; y += 2){ const v = 214 + Math.random() * 40; c.fillStyle = `rgba(${v},${v},${v},.55)`; c.fillRect(0, y, s, 1); }
    for(let x = 0; x < s; x += 2){ const v = 214 + Math.random() * 40; c.fillStyle = `rgba(${v},${v},${v},.45)`; c.fillRect(x, 0, 1, s); }
  }, 6);
  const weave = canvasTex(256, (c, s) => {          // 蓋毯：粗一點的斜紋織法
    c.fillStyle = '#e6e6e6'; c.fillRect(0, 0, s, s);
    for(let y = 0; y < s; y += 4){ for(let x = 0; x < s; x += 4){ const v = 200 + Math.random() * 55 + ((x + y) % 8 === 0 ? -18 : 0); c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(x, y, 3, 3); } }
  }, 8);
  const wool = canvasTex(256, (c, s) => {           // 羊毛地毯：柔和的斑點絨毛
    c.fillStyle = '#e4e4e4'; c.fillRect(0, 0, s, s);
    for(let i = 0; i < 14000; i++){ const v = 190 + Math.random() * 65; c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5 + Math.random() * 2); }
  }, 4);
  // 淺橡木直紋：低對比、不規則（只用整數倍頻率 → 上下左右都能無縫重複；避免規則條紋看起來像溝槽板）
  const grain = canvasTex(512, (c, s) => {
    const TAU = Math.PI * 2, ph = [Math.random() * TAU, Math.random() * TAU, Math.random() * TAU];
    for(let x = 0; x < s; x++){
      const u = x / s, n = .5 * Math.sin(TAU * 3 * u + ph[0]) + .3 * Math.sin(TAU * 7 * u + ph[1]) + .2 * Math.sin(TAU * 17 * u + ph[2]);
      const v = 236 + 5 * n + (Math.random() - .5) * 3;
      c.fillStyle = `rgb(${v | 0},${(v - 4) | 0},${(v - 11) | 0})`; c.fillRect(x, 0, 1, s);
    }
    c.strokeStyle = '#9c7f5c'; c.lineWidth = 1;
    for(let i = 0; i < 110; i++){                       // 細紋：稍微彎曲的細線，深淺不一
      const x0 = Math.random() * s, amp = 1 + Math.random() * 4, k = 1 + (Math.random() * 3 | 0), p0 = Math.random() * TAU;
      c.globalAlpha = .04 + Math.random() * .09; c.beginPath();
      for(let y = 0; y <= s; y += 8){ const x = x0 + amp * Math.sin(TAU * k * y / s + p0); y ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
    }
    c.globalAlpha = 1;
  }, 1.5);
  /** 掛畫圖案：三款柔和的無印／北歐幾何 */
  function artTex(kind){
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 724;
    const c = cv.getContext('2d'); c.fillStyle = '#f4f0e8'; c.fillRect(0, 0, 512, 724);
    if(kind === 0){ c.fillStyle = '#d9ccb6'; c.beginPath(); c.arc(256, 330, 175, Math.PI, 0); c.fill();
      c.fillStyle = '#f4f0e8'; c.fillRect(0, 330, 512, 50);
      c.fillStyle = '#a9ae98'; c.beginPath(); c.arc(256, 520, 118, 0, Math.PI * 2); c.fill(); }
    else if(kind === 1){ c.strokeStyle = '#8b8377'; c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(60, 540); c.quadraticCurveTo(190, 300, 330, 480); c.quadraticCurveTo(400, 570, 460, 470); c.stroke();
      c.fillStyle = '#cbbb9f'; c.beginPath(); c.arc(350, 250, 72, 0, Math.PI * 2); c.fill(); }
    else { ['#d7ccb9', '#b9ad98', '#e3ddd0'].forEach((col, i) => { c.fillStyle = col; c.fillRect(110 + i * 100, 150, 72, 430); }); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 4;
    return t;
  }
  /** 淋浴間地面：5 cm 小方磚馬賽克（暖灰、細白縫） */
  const mosaic = canvasTex(256, (c, s) => {
    c.fillStyle = '#f4f2ee'; c.fillRect(0, 0, s, s);
    const n = 8, q = s / n;
    for(let i = 0; i < n; i++) for(let j = 0; j < n; j++){ const v = 200 + Math.random() * 22; c.fillStyle = `rgb(${v},${v - 3},${v - 8})`; c.fillRect(i * q + 2, j * q + 2, q - 4, q - 4); }
  });
  const Std = o => new THREE.MeshStandardMaterial(o);
  // 手機（low）不用 Physical 的 sheen／clearcoat：少一大段 shader，外觀差很少
  const Phy = o => {
    if(!LOW) return new THREE.MeshPhysicalMaterial(o);
    const { sheen, sheenRoughness, sheenColor, clearcoat, clearcoatRoughness, transmission, ...rest } = o;
    return new THREE.MeshStandardMaterial(rest);
  };
  const fabric = (color, extra, tex = linen, bump = .0025) => Phy({ color, roughness: 1, metalness: 0, map: tex, bumpMap: tex, bumpScale: bump,
                                        sheen: .55, sheenRoughness: .85, sheenColor: new THREE.Color(0xffffff), ...extra });
  const MT = {
    oak    : Std({ color: 0xdcc39c, roughness: .5, map: grain }),                      // 淺橡木家具
    oakD   : Std({ color: 0xcdb289, roughness: .55, map: grain }),                     // 稍深的橡木（櫃體側板）
    cream  : fabric(0xf0eadf, { side: THREE.DoubleSide }),                             // 米白被子
    white  : fabric(0xf8f6f1),                                                         // 白床包／枕頭
    taupe  : fabric(0xb5a289, { side: THREE.DoubleSide }, weave, .006),                // 灰褐床旗（粗織）
    sandF  : fabric(0xcdb08a, {}, weave, .004),                                       // 沙米色抱枕（比床旗暖一點，照參考圖取色）
    rug    : Std({ color: 0xd4bf9e, roughness: 1, map: wool, bumpMap: wool, bumpScale: .004 }),   // 米色羊毛地毯
    rugR   : Std({ color: 0xcdbfa6, roughness: 1, map: wool, bumpMap: wool, bumpScale: .004 }),   // 圓地毯（偏灰）
    mat    : Std({ color: 0xe6dfd2, roughness: 1, map: wool, bumpMap: wool, bumpScale: .003 }),   // 浴室腳踏墊
    paint  : Std({ color: 0xf1ede6, roughness: .55 }),                                 // 米白烤漆（椅面）
    paintD : Std({ color: 0xf1ede6, roughness: .55, side: THREE.DoubleSide }),
    ceramic: Phy({ color: 0xfbfbf9, roughness: .16, metalness: 0, clearcoat: .55, clearcoatRoughness: .12 }),   // 白瓷
    ceramD : Phy({ color: 0xfbfbf9, roughness: .16, metalness: 0, clearcoat: .55, clearcoatRoughness: .12, side: THREE.DoubleSide }),
    chrome : Std({ color: 0xe4e4e2, metalness: 1, roughness: .14 }),
    black  : Std({ color: 0x26262a, roughness: .6, metalness: .2 }),
    grey   : Std({ color: 0x5b5f63, roughness: .5, metalness: .6 }),                   // 排水孔
    tray   : Std({ color: 0xffffff, roughness: .75, map: mosaic }),                     // 淋浴間地面（馬賽克小磚）
    towel  : fabric(0xefe9dd, { side: THREE.DoubleSide }, weave, .004),                // 毛巾（燕麥白、粗織）
    potW   : Std({ color: 0xece8e0, roughness: .55 }),                                 // 白色霧面陶盆（換掉模型原本的赤陶盆）
    soil   : Std({ color: 0x4a3c30, roughness: 1 }),                                   // 盆土
    shade  : Std({ color: 0xf6f0e4, roughness: 1, map: linen, emissive: 0xffdcb0, emissiveIntensity: .35, side: THREE.DoubleSide }),
    bulb   : Std({ color: 0xfff7ea, emissive: 0xffe6c2, emissiveIntensity: 1.3 }),
    led    : Std({ color: 0xffffff, emissive: 0xfff3e2, emissiveIntensity: 1.0 }),
    mirror : Std({ color: 0xf4f5f5, metalness: .6, roughness: .12 }),                // 探針拍好之前的暫用鏡面（只出現開場零點幾秒）
    back   : Std({ color: 0xb9b7b2, roughness: .6 }),                                  // 鏡子背板
    paper  : Std({ color: 0xf3efe6, roughness: .9 }),
    screen : Std({ color: 0x2a2d32, roughness: .35, metalness: .5 }),
    sage   : Std({ color: 0x9aa48f, roughness: .85 }), sand: Std({ color: 0xd8c8ad, roughness: .85 }), clay: Std({ color: 0xb98f70, roughness: .85 }),
    amber  : Phy({ color: 0xc98a3a, roughness: .1, transmission: 0, opacity: .9, transparent: true }),
  };
  emissives.push({ mat: MT.shade, base: .35, kind: 'lamp' }, { mat: MT.bulb, base: 1.3, kind: 'lamp' }, { mat: MT.led, base: 1.0, kind: 'lamp' });

  /* ============================================================
     2. 幾何小工具（座標都是各物件的局部座標）
     ============================================================ */
  const grp = (x, y, z, rotY = 0, parent = root) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; parent.add(g); return g; };
  /** 群組局部座標 → 世界座標（先更新矩陣，燈位登記用） */
  const worldPos = (g, x, y, z) => { g.updateWorldMatrix(true, false); return g.localToWorld(new THREE.Vector3(x, y, z)); };
  const M = (geo, mat, x = 0, y = 0, z = 0, parent = root) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const Bx = (w, h, d, mat, x, y, z, parent) => M(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  const RB = (w, h, d, r, mat, x, y, z, parent, seg = 2) => M(new RoundedBoxGeometry(w, h, d, seg, r), mat, x, y, z, parent);
  const Cyl = (r0, r1, h, mat, x, y, z, parent, seg = SEG, open = false) => M(new THREE.CylinderGeometry(r0, r1, h, seg, 1, open), mat, x, y, z, parent);
  /** 車削件：pts = [[半徑, 高度], …]，繞 Y 軸；sx/sz 拉成橢圓 */
  const lathe = (pts, mat, x, y, z, parent, sx = 1, sz = 1, seg = SEG) => {
    const m = M(new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg), mat, x, y, z, parent);
    m.scale.set(sx, 1, sz); return m;
  };
  /** 圓角矩形路徑（中心在原點；Shape 的 y 之後會對到 −z） */
  function rrect(w, d, r, x0 = 0, y0 = 0, P = THREE.Shape){
    const p = new P(), a = x0 - w / 2, b = y0 - d / 2;
    p.moveTo(a + r, b); p.lineTo(a + w - r, b); p.quadraticCurveTo(a + w, b, a + w, b + r);
    p.lineTo(a + w, b + d - r); p.quadraticCurveTo(a + w, b + d, a + w - r, b + d);
    p.lineTo(a + r, b + d); p.quadraticCurveTo(a, b + d, a, b + d - r);
    p.lineTo(a, b + r); p.quadraticCurveTo(a, b, a + r, b); return p;
  }
  /** 平放的板子（厚 t、朝上）：Shape 擠出後立起來；shape 的 y ↦ −z；看得到的圓弧（盆孔、缸緣）另外傳 curveSegments */
  function slab(shape, t, opts = {}){
    const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: Math.round(SEG / 3), ...opts });
    g.rotateX(-Math.PI / 2); return g;
  }
  /** 布料：從床頭 head 蓋到床尾 L，兩側／床尾垂下；局部 x 沿床長（0 = 床頭）、z 左右、y 從床墊面算起
      fold = 床頭這端翻摺回來的一道被邊（寬度，公尺）；swing = 垂下部分的波浪幅度；
      loft = 被子中央鼓起的高度（羽絨感）；foot = false 時是橫放的床旗（到 L 就結束、床尾不垂） */
  function cloth({ L, W, T, head = 0, dropSide = .3, dropFoot = .25, r = .06, wrinkle = .012, fold = 0, swing = .008, phase = 0, loft = 0, foot = true, nx = LOW ? 30 : 48, nz = LOW ? 22 : 36 }){
    const arc = r * Math.PI / 2;
    const zLen = W / 2 + arc + Math.max(0, dropSide - r), xLen = foot ? L + arc + Math.max(0, dropFoot - r) : L;
    const wrap = (s, edge) => {   // 弧長 s → [超出邊緣的距離, 高度]
      if(s <= edge) return [s, T];
      const t = s - edge;
      if(t <= arc){ const a = t / r; return [edge + r * Math.sin(a), T - r * (1 - Math.cos(a))]; }
      const u = t - arc; return [edge + r + swing * Math.sin(u * 9 + phase), T - r - u];
    };
    const pos = [], uv = [], idx = [];
    for(let i = 0; i <= nx; i++) for(let j = 0; j <= nz; j++){
      const cx = head + (xLen - head) * i / nx, cz = -zLen + 2 * zLen * j / nz;
      const [px, yx] = wrap(cx, L), [pz0, yz] = wrap(Math.abs(cz), W / 2);
      let y = Math.min(yx, yz);
      const fx = Math.max(0, Math.min(1, (L - cx) / 0.10)), fz = Math.max(0, Math.min(1, (W / 2 - Math.abs(cz)) / 0.10));
      y += wrinkle * fx * fz * (Math.sin(cx * 7.3 + phase) * Math.sin(cz * 8.1 + phase * .5) + .5 * Math.sin(cx * 15 + 2 * phase) * Math.sin(cz * 3.3));
      if(loft > 0){                                             // 羽絨鼓起：離邊 0.3 m 內慢慢收平，接回圓滾的被緣
        const gx = foot ? Math.max(0, Math.min(1, (L - cx) / .30)) : 1, gz = Math.max(0, Math.min(1, (W / 2 - Math.abs(cz)) / .30));
        const sx = gx * gx * (3 - 2 * gx), sz = gz * gz * (3 - 2 * gz);
        y += loft * sx * sz * (.85 + .15 * Math.sin(cx * 3.1 + phase) * Math.cos(cz * 2.3));
      }
      if(fold > 0){                                             // 翻摺的被邊：圓滾的前緣、平的一段、再慢慢收掉
        const d = cx - head, lip = Math.min(1, d / .06), tail = Math.max(0, Math.min(1, (fold - d) / .10));
        y += .042 * Math.sqrt(Math.max(0, 1 - (1 - lip) ** 2)) * tail * fz;
      }
      pos.push(px, y, Math.sign(cz) * pz0); uv.push(i / nx, j / nz);
    }
    for(let i = 0; i < nx; i++) for(let j = 0; j < nz; j++){
      const a = i * (nz + 1) + j, b = a + nz + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  /** 枕頭／抱枕：立面 faceH（局部 x）× faceW（局部 z）；超橢球（球體網格往方形推），中央鼓到約 1.65 t、四邊收薄到約 0.55 t。
      先合併接縫頂點再算法線 → 整顆平滑；UV 用正面投影（亞麻織紋用） */
  function cushionGeo(faceH, t, faceW){
    let g = new THREE.SphereGeometry(1, LOW ? 20 : 28, LOW ? 12 : 16);
    g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = BGU.mergeVertices(g, 1e-4);
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for(let i = 0; i < p.count; i++){
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const sx = Math.sign(x) * Math.abs(x) ** .35, sz = Math.sign(z) * Math.abs(z) ** .35, sy = Math.sign(y) * Math.abs(y) ** .8;
      const e = Math.max(0, (1 - Math.abs(sx) ** 4) * (1 - Math.abs(sz) ** 4));
      p.setXYZ(i, sx * faceH / 2, sy * t / 2 * (.55 + 1.1 * Math.sqrt(e)), sz * faceW / 2);
      uv[i * 2] = sx * .5 + .5; uv[i * 2 + 1] = sz * .5 + .5;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeVertexNormals(); return g;
  }

  /* ============================================================
     3. 家具零件
     ============================================================ */
  /** 平台床：局部原點 = 床頭板貼牆處、床寬中心的地板；+x 往床尾、z 左右
      ledge = 床板比床墊寬出的橡木邊；枕頭靠著床頭板、抱枕靠著枕頭；被子床頭端有翻摺、蓋毯橫在床尾 */
  function bed({ x, z, rotY = 0, W, L, hb = .88, ledge = .08, pillows = 2, cushions = 0, throwOn = true, phase = 1.3 }){
    const g = grp(x, FLOOR, z, rotY);
    const PH = .20, PT = .10, MTK = .22;            // 床腳 0.20、床板 0.10、床墊 0.22 → 床墊面 0.52
    const pw = W + 2 * ledge, pl = L + .04 + ledge;
    Bx(.04, hb, pw, MT.oak, .02, hb / 2, 0, g);                                   // 床頭板（低於窗台 0.90）
    Bx(pl, PT, pw, MT.oak, .04 + pl / 2, PH + PT / 2, 0, g);                      // 床板（露出一圈橡木邊）
    for(const [dx, dz] of [[.10, -pw / 2 + .10], [.10, pw / 2 - .10], [pl - .06, -pw / 2 + .10], [pl - .06, pw / 2 - .10]])
      Bx(.06, PH, .06, MT.oakD, .04 + dx, PH / 2, dz, g);                           // 四支方腳
    RB(L, MTK, W, .04, MT.white, .06 + L / 2, PH + PT + MTK / 2, 0, g, 3);         // 床墊＋床包
    const top = PH + PT + MTK;
    M(cloth({ L, W, T: .06, head: .50, dropSide: .30, dropFoot: .24, r: .07, fold: .30, loft: .035, phase }), MT.cream, .06, top, 0, g);
    // 灰褐床旗：橫跨床的中段偏床尾（像參考圖），兩側垂下、床尾露出白被
    if(throwOn) M(cloth({ L: L - .22, W: W + .03, T: .076, head: L - .84, dropSide: .40, r: .07, wrinkle: .014, swing: .012, loft: .035, foot: false, phase, nx: 20 }), MT.taupe, .06, top, 0, g);
    /** 靠著的枕頭：立面高 h、厚 t、後仰 phi；上緣貼在 x0（床頭板前面或前一顆枕頭） */
    const lean = (geo, mat, h, t, phi, zc, yaw, x0) => {
      const c = Math.cos(phi), s = Math.sin(phi);
      const m = M(geo, mat, x0 + c * t / 2 + s * h / 2, top + c * h / 2 - s * t / 2 + .01, zc, g);
      m.rotation.z = Math.PI / 2 + phi; m.rotation.y = yaw; return m;
    };
    const slot = W / pillows, pw2 = Math.min(.68, slot - .06);
    for(let i = 0; i < pillows; i++){
      const zc = -W / 2 + slot * (i + .5);
      lean(cushionGeo(.42, .065, pw2), MT.white, .42, .065, .50, zc, (i ? -1 : 1) * .04, .07);
    }
    for(let i = 0; i < cushions; i++){
      const zc = -W / 2 + slot * (i + .5) + (cushions > 1 ? (i ? -.04 : .04) : 0);
      lean(cushionGeo(.40, .05, .42), MT.sandF, .40, .05, .64, zc, (i ? 1 : -1) * .08, .24);
    }
    addCollider(g, { y1: 1.0 });
    return g;
  }
  /** 無印風橡木床頭櫃：細方腳、上層一個抽屜（木頭挖槽把手）、下層開放格；正面朝局部 +z，回傳桌面高度 */
  function nightstand(x, z, rotY, w = .44, d = .36, h = .52){
    const g = grp(x, FLOOR, z, rotY), leg = .10, t = .018;
    for(const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) Bx(.03, leg, .03, MT.oakD, sx * (w / 2 - .03), leg / 2, sz * (d / 2 - .03), g);
    RB(w, t, d, .004, MT.oak, 0, h - t / 2, 0, g);                                     // 頂板
    Bx(w - .004, t, d - .004, MT.oak, 0, leg + t / 2, 0, g);                            // 底板
    for(const s of [-1, 1]) Bx(t, h - leg - t, d - .004, MT.oakD, s * (w / 2 - t / 2 - .002), leg + (h - leg - t) / 2, 0, g);   // 側板
    Bx(w - 2 * t, h - leg - t, .01, MT.oakD, 0, leg + (h - leg - t) / 2, -d / 2 + .007, g);   // 背板
    const dh = .15, dy = h - t - dh / 2 - .004;
    Bx(w - 2 * t - .006, dh, t, MT.oak, 0, dy, d / 2 - t / 2 - .002, g);                // 抽屜面板
    Bx(w - 2 * t, .012, d - .03, MT.oakD, 0, dy - dh / 2 - .006, 0, g);                // 抽屜下隔板
    Bx(.10, .014, .012, MT.black, 0, dy + dh / 2 - .03, d / 2 - .001, g);              // 挖槽把手（深色陰影條）
    addCollider(g, { y1: 0.9 });
    return FLOOR + h;
  }
  /** 床頭後面的長條矮櫃（參考圖臥室三那種）：沿牆一整排、開放格；正面朝局部 +z，回傳櫃面高度 */
  function lowShelf(x, z, rotY, w, d = .26, h = .56){
    const g = grp(x, FLOOR, z, rotY), t = .02, n = Math.max(2, Math.round(w / .55));
    RB(w, t, d, .004, MT.oak, 0, h - t / 2, 0, g);
    Bx(w - .01, .06, d - .03, MT.black, 0, .03, -.01, g);                               // 內縮踢腳
    Bx(w, t, d, MT.oak, 0, .06 + t / 2, 0, g);
    Bx(w, h - .06 - t, .01, MT.oakD, 0, .06 + (h - .06 - t) / 2, -d / 2 + .005, g);     // 背板
    for(let i = 0; i <= n; i++) Bx(t, h - .06 - 2 * t, d - .01, MT.oakD, -w / 2 + t / 2 + i * (w - t) / n, .06 + t + (h - .06 - 2 * t) / 2, .005, g);
    Bx(w - .02, t * .8, d - .02, MT.oakD, 0, .06 + (h - .06) / 2, .005, g);             // 中層板
    addCollider(g, { y1: 0.9 });
    return FLOOR + h;
  }
  /** 桌上小燈：橡木底座＋白瓷燈柱＋亞麻燈罩 */
  function tableLamp(x, z, ySurf, room){
    const g = grp(x, ySurf, z);
    Cyl(.06, .065, .02, MT.oak, 0, .01, 0, g, 24);
    Cyl(.02, .026, .15, MT.ceramic, 0, .095, 0, g, 16);
    Cyl(.005, .005, .07, MT.black, 0, .205, 0, g, 8);
    M(new THREE.SphereGeometry(.03, 12, 8), MT.bulb, 0, .26, 0, g);
    Cyl(.10, .115, .17, MT.shade, 0, .285, 0, g, SEG, true);
    lamps.push({ pos: worldPos(g, 0, .20, 0), kind: 'table', room, color: 0xffe3bf, power: 1.2 });   // 光源放在燈罩下半：床頭櫃就在 0.9 m 窗台下，放高了會把窗台、窗框打出一圈爆白
  }
  /** 霧黑工作燈：燈頭朝 +x 前下方 */
  function deskLamp(x, z, ySurf, room, rotY = 0){
    const g = grp(x, ySurf, z, rotY);
    Cyl(.07, .075, .012, MT.black, 0, .006, 0, g, 24);
    const post = Cyl(.008, .008, .34, MT.black, -.02, .17, 0, g, 10); post.rotation.z = .06;
    const arm = Cyl(.007, .007, .30, MT.black, .10, .288, 0, g, 10); arm.rotation.z = -1.918;
    const head = Cyl(.02, .055, .09, MT.black, .252, .219, 0, g, 20); head.rotation.z = .524;
    const disc = Cyl(.05, .05, .004, MT.bulb, .270, .190, 0, g, 16); disc.rotation.z = .524;
    lamps.push({ pos: worldPos(g, .27, .19, 0), kind: 'table', room, color: 0xfff1dc, power: 1.0 });
  }
  /** 橡木書桌：薄桌板＋細方腳＋桌沿 */
  function desk(x, z, w, d, rotY = 0){
    const g = grp(x, FLOOR, z, rotY), h = .74;
    RB(w, .03, d, .006, MT.oak, 0, h - .015, 0, g);
    for(const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) Bx(.04, h - .03, .04, MT.oakD, sx * (w / 2 - .05), (h - .03) / 2, sz * (d / 2 - .05), g);
    for(const sz of [-1, 1]) Bx(w - .14, .06, .02, MT.oakD, 0, h - .06, sz * (d / 2 - .06), g);
    addCollider(g, { y1: 1.0 });
    return g;
  }
  /** 淺色餐椅式書桌椅：橡木圓腳、米白椅面、弧形靠背；面向局部 +x */
  function chair(x, z, rotY){
    const g = grp(x, FLOOR, z, rotY), SH = .45;
    for(const [dx, dz] of [[-.17, -.17], [-.17, .17], [.17, -.17], [.17, .17]]){
      const l = Cyl(.015, .02, SH, MT.oak, dx * 1.06, SH / 2, dz * 1.06, g, 10);
      l.rotation.z = dx > 0 ? -.05 : .05; l.rotation.x = dz > 0 ? .05 : -.05;
    }
    RB(.42, .035, .40, .012, MT.paint, 0, SH + .017, 0, g);
    for(const dz of [-.15, .15]) Cyl(.013, .013, .40, MT.oak, -.19, SH + .20, dz, g, 10);
    M(new THREE.CylinderGeometry(.32, .32, .14, 20, 1, true, -Math.PI / 2 - .5, 1.0), MT.paintD, .13, SH + .36, 0, g);
    addCollider(g, { y1: 1.0 });
    return g;
  }
  /** 衣櫃：橡木櫃體、doors 片門、直式霧黑把手（兩兩相對）；門面朝局部 +z */
  function wardrobe(x, z, w, d, h, rotY = 0, doors = 2){
    const g = grp(x, FLOOR, z, rotY);
    Bx(w, h - .08, d - .024, MT.oakD, 0, .06 + (h - .08) / 2, -.012, g);            // 櫃體（頂面在頂板底下、前面離門片背 4 mm，都不共面 → 俯瞰剖切時櫃頂不會閃）
    Bx(w - .06, .06, d - .06, MT.black, 0, .03, -.03, g);                           // 內縮踢腳
    Bx(w, .02, d, MT.oak, 0, h - .01, 0, g);                                        // 頂板
    const dw = (w - .006 * (doors - 1)) / doors;
    for(let i = 0; i < doors; i++){
      const cx = -w / 2 + dw / 2 + i * (dw + .006);
      const hs = (i === doors - 1 && doors % 2) ? -1 : (i % 2 === 0 ? 1 : -1);      // 把手靠向相鄰那片門
      Bx(dw, h - .10, .02, MT.oak, cx, .06 + (h - .10) / 2 + .01, d / 2 - .01, g);   // 門片
      Bx(.012, .32, .014, MT.black, cx + hs * (dw / 2 - .035), h * .5, d / 2 + .007, g);   // 把手
    }
    addCollider(g);
    return g;
  }
  const rug = (x0, z0, x1, z1, mat = MT.rug) => RB(x1 - x0, .012, z1 - z0, .005, mat, (x0 + x1) / 2, FLOOR + .006, (z0 + z1) / 2, root, 1);
  const roundRug = (cx, cz, r, mat = MT.rugR) => Cyl(r, r, .012, mat, cx, FLOOR + .006, cz, root, LOW ? 40 : 64);
  /** 幾本書疊在桌面上 */
  function books(x, ySurf, z, rotY = 0){
    const g = grp(x, ySurf, z, rotY); let y = 0;
    for(const [w, t, d, m] of [[.21, .028, .15, MT.sage], [.19, .022, .14, MT.sand], [.17, .018, .12, MT.clay]]){
      const c = .0025;                                                                // 封面厚
      Bx(w, c, d, m, 0, y + c / 2, 0, g); Bx(w, c, d, m, 0, y + t - c / 2, 0, g);    // 下、上封面
      Bx(c, t, d, m, -w / 2 + c / 2, y + t / 2, 0, g);                                // 書背
      Bx(w - c - .004, t - 2 * c, d - .006, MT.paper, c / 2 - .002, y + t / 2, 0, g); // 內頁（比封面縮 2–3 mm）
      y += t;
    }
    return g;
  }
  /** 鏡面：貼在 parent 的局部 z=0 平面、朝 +z。
      底層＝反射探針鏡（手機、電腦都有）：鏡前拍一次 6 面環景，畫的時候用房間盒子做視差校正（見第 11 節）；
      電腦版再疊一片 Reflector 真反射，只有人走進同一間房、站在鏡子前面才打開。 */
  function mirrorPlane(parent, w, h, room){
    const m = M(new THREE.PlaneGeometry(w, h), MT.mirror, 0, 0, .011, parent);
    m.castShadow = false; m.userData.noBake = true;
    probes.push({ mesh: m, room });
    if(LOW) return;
    // 反射貼圖的尺寸在第 11 節跟著畫面走（Reflector 是用主相機的投影去取樣，貼圖必須跟畫面同比例）；
    // color 0xb4b4b4 ≈ linear 0.46：overlay 混色下 ≈ 反射率 91%、不改色相（原本 0x8e9295 會把橡木地板壓成赤陶色）
    const r = new Reflector(new THREE.PlaneGeometry(w, h), { textureWidth: 256, textureHeight: 256, color: 0xb4b4b4, multisample: 2, clipBias: .003 });
    r.position.z = .013; r.visible = false; r.userData.noBake = true; parent.add(r);
    reflectors.push({ mesh: r, room });
  }
  /** 斜靠牆上的穿衣鏡（橡木框）；背面貼局部 z=0、鏡面朝 +z */
  function leanMirror(x, z, w, h, rotY, room){
    const g = grp(x, FLOOR, z, rotY), f = grp(0, 0, h * Math.sin(.07), 0, g); f.rotation.x = -.07;   // 底部離牆 11 cm、頂端靠牆
    const t = .025, fw = .035;
    Bx(w, fw, t, MT.oak, 0, fw / 2, t / 2, f); Bx(w, fw, t, MT.oak, 0, h - fw / 2, t / 2, f);
    Bx(fw, h, t, MT.oak, -w / 2 + fw / 2, h / 2, t / 2, f); Bx(fw, h, t, MT.oak, w / 2 - fw / 2, h / 2, t / 2, f);
    Bx(w - 2 * fw, h - 2 * fw, .01, MT.back, 0, h / 2, t / 2 - .006, f);
    mirrorPlane(grp(0, h / 2, t - .015, 0, f), w - 2 * fw, h - 2 * fw, room);
    addCollider(g);
  }

  /* ---------- 衛浴零件 ---------- */
  /** 單體馬桶：局部 z=0 是水箱背面貼牆處、便座開口朝 +z（總深 0.72、寬 0.40，同規格書） */
  function toilet(x, z, rotY){
    const g = grp(x, FLOOR, z, rotY);
    RB(.40, .42, .17, .02, MT.ceramic, 0, .40 + .21, .085, g, 3);                  // 水箱 z 0–0.17
    RB(.34, .30, .34, .04, MT.ceramic, 0, .16, .26, g, 3);                         // 連接體
    lathe([[0, 0], [.13, 0], [.16, .06], [.185, .20], [.19, .36], [.185, .39], [.16, .395], [.13, .37], [.10, .30], [.05, .26], [0, .25]],
          MT.ceramD, 0, 0, .41, g, 1, 1.35);                                        // 便盆（橢圓，前緣到 z 0.67）
    lathe([[.12, 0], [.19, 0], [.197, .018], [.19, .035], [.12, .035]], MT.ceramic, 0, .395, .41, g, 1, 1.35);   // 便座
    lathe([[0, 0], [.18, 0], [.196, .014], [.19, .03], [0, .03]], MT.ceramic, 0, .43, .41, g, 1, 1.35);         // 蓋子（蓋著）
    Cyl(.022, .022, .006, MT.chrome, 0, .823, .085, g, 20);                        // 沖水按鈕
    addCollider(g, { y1: 1.0 });
    return g;
  }
  /** 智能馬桶（一體式、無水箱、包覆式底座＋免治便座；次浴，平面圖註記「單體馬桶改智能馬桶」）：
      局部 z=0 貼牆、便座開口朝 +z（總深 0.70、寬 0.40，跟原本的單體馬桶同一塊地） */
  function smartToilet(x, z, rotY){
    const g = grp(x, FLOOR, z, rotY);
    lathe([[0, 0], [.165, 0], [.182, .02], [.19, .12], [.192, .30], [.186, .33], [.17, .34], [0, .34]],
          MT.ceramD, 0, 0, .45, g, 1, 1.26);                                        // 包覆式底座：橢圓、上寬下略收（前緣到 z 0.69）
    RB(.40, .40, .24, .05, MT.ceramic, 0, .20, .13, g, 3);                          // 後方機身（免治機組＋水路）z 0.01–0.25、頂 0.40
    lathe([[.12, 0], [.19, 0], [.197, .018], [.19, .035], [.12, .035]], MT.ceramic, 0, .34, .45, g, 1, 1.25);   // 便座
    lathe([[0, 0], [.18, 0], [.196, .014], [.19, .03], [0, .03]], MT.ceramic, 0, .375, .45, g, 1, 1.25);        // 蓋子（蓋著）
    RB(.30, .03, .12, .012, MT.ceramic, 0, .415, .15, g, 2);                         // 機身頂蓋（略高一階）
    Bx(.14, .004, .03, MT.grey, 0, .432, .15, g);                                    // 頂上的一條感應窗
    Cyl(.006, .006, .004, MT.led, .10, .432, .15, g, 10);                            // 待機小燈
    addCollider(g, { y1: 1.0 });
    return g;
  }
  /** 智能馬桶的牆上遙控器（白色薄片＋幾顆按鍵）：局部 z=0 貼牆、朝 +z */
  function toiletRemote(x, y, z, rotY){
    const g = grp(x, y, z, rotY);
    RB(.18, .07, .018, .006, MT.ceramic, 0, 0, .009, g, 2);
    for(let i = 0; i < 4; i++) Cyl(.009, .009, .004, i === 0 ? MT.grey : MT.paper, -.06 + i * .04, 0, .019, g, 14).rotation.x = Math.PI / 2;
  }
  /** 天花板暖風機（次浴，平面圖註記「換氣機改暖風機」）：白色方形面板＋格柵＋小顯示窗 */
  function ceilingHeater(x, z, H){
    const g = grp(x, H, z, 0);
    RB(.34, .02, .30, .006, MT.paint, 0, -.01, 0, g, 2);
    for(let i = -4; i <= 4; i++) Bx(.24, .004, .012, MT.grey, -.02, -.021, i * .026, g);
    Bx(.05, .004, .03, MT.screen, .13, -.021, .10, g);
  }
  /** 浴缸：圓角矩形外殼、圓角內槽（擠出＋倒角＝圓潤缸緣） */
  function tub(x0, z0, x1, z1, h = .56){
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const shape = rrect(w - .04, d - .04, .05);
    shape.holes.push(rrect(w - .16, d - .17, .14, 0, 0, THREE.Path));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: h - .04, bevelEnabled: true, bevelThickness: .02, bevelSize: .02, bevelSegments: 3, curveSegments: 24 });   // 缸緣圓角：手機也要圓，不省這幾百個三角形
    geo.rotateX(-Math.PI / 2); geo.translate(0, .02, 0);
    const body = M(geo, MT.ceramD, cx, FLOOR, cz);
    Bx(w - .18, .02, d - .19, MT.ceramic, cx, FLOOR + .11, cz);                    // 槽底
    // 缸緣北端（寬邊）：鍍鉻出水口＋兩個把手
    const tz = z0 + .045;
    const sp = Cyl(.014, .014, .16, MT.chrome, cx, FLOOR + h + .075, tz + .08); sp.rotation.x = Math.PI / 2;
    Cyl(.014, .014, .10, MT.chrome, cx, FLOOR + h + .04, tz);
    for(const s of [-1, 1]) Cyl(.02, .024, .035, MT.chrome, cx + s * .10, FLOOR + h + .017, tz, root, 20);
    RB(.26, .04, .18, .015, MT.towel, cx, FLOOR + h + .02, z1 - .085, root, 2);       // 摺好的毛巾搭在缸緣南端
    addCollider(body, { y1: 1.0 });
  }
  /** 淋浴組：局部 z=0 是背牆、器材朝 +z；含恆溫龍頭、滑桿、手持花灑、軟管、頂噴 */
  function showerSet(x, z, rotY){
    const g = grp(x, FLOOR, z, rotY);
    const bar = Cyl(.024, .024, .34, MT.chrome, 0, 1.05, .055, g, 20); bar.rotation.z = Math.PI / 2;   // 恆溫龍頭橫桿
    for(const s of [-1, 1]){ const b = Cyl(.02, .02, .05, MT.chrome, s * .11, 1.05, .025, g, 12); b.rotation.x = Math.PI / 2;
      const k = Cyl(.026, .03, .04, MT.chrome, s * .19, 1.05, .055, g, 20); k.rotation.z = Math.PI / 2; }
    Cyl(.011, .011, .95, MT.chrome, 0, 1.65, .05, g, 12);                          // 滑桿
    for(const y of [1.20, 2.10]){ const b = Cyl(.012, .012, .05, MT.chrome, 0, y, .025, g, 10); b.rotation.x = Math.PI / 2; }
    RB(.04, .07, .05, .01, MT.chrome, 0, 1.78, .06, g);                            // 滑座
    const hh = Cyl(.05, .04, .03, MT.chrome, 0, 1.94, .11, g, 24); hh.rotation.x = -.45;   // 手持花灑頭
    const hd = Cyl(.012, .015, .20, MT.chrome, 0, 1.83, .07, g, 12); hd.rotation.x = -.35;  // 花灑握把
    if(!LOW){                                                                     // 軟管（下垂再接回龍頭）
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1.72, .07), new THREE.Vector3(.02, 1.35, .09), new THREE.Vector3(.05, .95, .10), new THREE.Vector3(.02, .62, .09), new THREE.Vector3(-.03, .78, .08), new THREE.Vector3(-.04, 1.0, .07)]);
      M(new THREE.TubeGeometry(curve, 40, .007, 8), MT.chrome, 0, 0, 0, g);
    }
    const arm = Cyl(.012, .012, .38, MT.chrome, 0, 2.18, .19, g, 12); arm.rotation.x = Math.PI / 2;   // 頂噴橫臂
    Cyl(.12, .12, .012, MT.chrome, 0, 2.15, .38, g, 32);                            // 頂噴
    Cyl(.10, .10, .004, MT.grey, 0, 2.142, .38, g, 32);
  }
  /** 地板排水孔（方形格柵） */
  function drain(x, z){
    Bx(.12, .006, .12, MT.grey, x, FLOOR + .003, z);
    for(let i = -2; i <= 2; i++) Bx(.10, .002, .008, MT.black, x, FLOOR + .0065, z + i * .022);
  }
  /** 牆掛毛巾桿：沿局部 x、離牆 7 cm */
  function towelBar(x, y, z, len, rotY){
    const g = grp(x, y, z, rotY);
    for(const s of [-1, 1]){ const p = Cyl(.008, .008, .07, MT.chrome, s * (len / 2 - .02), 0, .035, g, 10); p.rotation.x = Math.PI / 2; }
    const b = Cyl(.009, .009, len, MT.chrome, 0, 0, .07, g, 10); b.rotation.z = Math.PI / 2;
    // 掛著的毛巾：繞過桿子的半圓＋前長後短兩片垂下
    const tw = Math.min(.42, len - .10), tr = .016;
    const fold = M(new THREE.CylinderGeometry(tr, tr, tw, 12, 1, true, 0, Math.PI), MT.towel, 0, 0, .07, g); fold.rotation.z = Math.PI / 2;
    Bx(tw, .40, .008, MT.towel, 0, -.20, .07 + tr - .004, g);
    Bx(tw, .28, .008, MT.towel, 0, -.14, .07 - tr + .004, g);
  }
  /** 淋浴間地面：馬賽克小磚，UV 換算成公尺（每 0.4 m 一張貼圖 = 5 cm 一塊磚） */
  function showerFloor(x0, z0, x1, z1){
    const geo = new THREE.BoxGeometry(x1 - x0, .004, z1 - z0), uv = geo.attributes.uv;
    for(let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / .4, uv.getY(i) * (z1 - z0) / .4);
    M(geo, MT.tray, (x0 + x1) / 2, FLOOR + .002, (z0 + z1) / 2);
  }
  /** 衛生紙架：局部 z=0 貼牆、朝 +z */
  function tpHolder(x, y, z, rotY){
    const g = grp(x, y, z, rotY);
    Bx(.05, .05, .01, MT.chrome, 0, 0, .005, g);
    const a = Cyl(.006, .006, .08, MT.chrome, 0, 0, .05, g, 8); a.rotation.x = Math.PI / 2;
    const r = Cyl(.055, .055, .10, MT.paper, 0, -.01, .10, g, 20); r.rotation.z = Math.PI / 2;
    const c = Cyl(.02, .02, .102, MT.paper, 0, -.01, .10, g, 12); c.rotation.z = Math.PI / 2;
  }
  /** 無框明鏡＋鏡上 LED 燈條：局部 z=0 貼牆、朝 +z */
  function mirror(x, y, z, w, h, rotY, room, parent = root){
    const g = grp(x, y, z, rotY, parent);
    Bx(w + .01, h + .01, .01, MT.back, 0, 0, .005, g);
    mirrorPlane(g, w, h, room);
    Bx(w * .8, .025, .04, MT.led, 0, h / 2 + .09, .02, g);
    lamps.push({ pos: worldPos(g, 0, h / 2 + .09, .05), kind: 'wall', room, color: 0xfff4e6, power: 1.0 });
  }
  /** 淋浴間角落鍍鉻置物架＋兩瓶沐浴用品 */
  function bottleShelf(x, y, z, rotY){
    const g = grp(x, y, z, rotY);
    RB(.22, .008, .22, .004, MT.chrome, .11, 0, .11, g);
    Cyl(.03, .03, .17, MT.paint, .07, .09, .08, g, 16); Cyl(.012, .012, .03, MT.black, .07, .19, .08, g, 10);
    Cyl(.026, .026, .14, MT.amber, .15, .074, .12, g, 16); Cyl(.014, .014, .02, MT.black, .15, .154, .12, g, 10);
  }
  /** 主浴洗手台：吊櫃＋白瓷檯面＋橢圓下嵌盆＋單槍龍頭；局部 z=0 貼牆、檯面朝 +z */
  function vanityOval(x, z, rotY, room, w = .76, d = .45, bx = -.09, mw = .70){
    const g = grp(x, FLOOR, z, rotY);
    // 吊櫃做成中空：櫃體只到 0.68，上面一圈 14 cm 的圍板接到檯面 —— 從檯面的盆孔往下看是白瓷盆，不會看到木頭頂板
    const cw = w - .02, cd = d - .04, zc = cd / 2 + .005;
    RB(cw, .26, cd, .01, MT.oak, 0, .55, zc, g);
    Bx(cw, .14, .018, MT.oak, 0, .75, zc + cd / 2 - .009, g);                        // 前圍板（上抽屜面）
    Bx(cw, .14, .018, MT.oak, 0, .75, zc - cd / 2 + .009, g);                        // 後圍板
    for(const s of [-1, 1]) Bx(.018, .14, cd - .036, MT.oak, s * (cw / 2 - .009), .75, zc, g);   // 側圍板
    Bx(w - .06, .004, .006, MT.black, 0, .68, d - .03, g);                          // 兩抽屜的溝縫（剛好在圍板接縫）
    Bx(.30, .012, .012, MT.black, 0, .76, d - .025, g);                              // 上抽屜把手
    Bx(.30, .012, .012, MT.black, 0, .60, d - .025, g);
    const sh = rrect(w, d, .01, 0, -d / 2); sh.holes.push(new THREE.Path().absellipse(bx, -.24, .21, .16, 0, Math.PI * 2, true));
    M(slab(sh, .02, { curveSegments: 24 }), MT.ceramic, 0, .82, 0, g);                // 檯面（橢圓孔 48 邊，手機也圓）
    lathe([[0, 0], [.08, .004], [.14, .035], [.175, .085], [.195, .125], [.20, .135]], MT.ceramD, bx, .82 - .135, .24, g, 1.05, .8);   // 盆
    Cyl(.02, .02, .15, MT.chrome, bx, .82 + .075, .07, g, 16);
    const sp = Cyl(.011, .011, .15, MT.chrome, bx, .96, .14, g, 12); sp.rotation.x = Math.PI / 2;
    Bx(.05, .01, .02, MT.chrome, bx, .975, .06, g);                                   // 撥桿
    Cyl(.03, .03, .14, MT.paint, w / 2 - .10, .82 + .07, .12, g, 16); Cyl(.01, .01, .04, MT.chrome, w / 2 - .10, .98, .12, g, 8);   // 給皂器（壓頭在瓶頂 0.96 之上）
    RB(.22, .05, .16, .02, MT.towel, w / 2 - .14, .82 + .025, .30, g, 2);            // 摺好的毛巾
    mirror(0, 1.50, .001, mw, .80, 0, room, g);
    addCollider(g, { y1: 0.9 });
    return g;
  }
  /** 次浴洗手台：方形一體式面盆（建商規格，平面圖註記 2）＋單槍龍頭；withMirror = 要不要鏡子 */
  function vanitySquare(x, z, rotY, room, withMirror, w = .78, d = .42, mw = .60){
    const g = grp(x, FLOOR, z, rotY);
    RB(w - .02, .36, d - .06, .01, MT.oak, 0, .60, (d - .06) / 2 + .005, g);
    Bx(.30, .012, .012, MT.black, 0, .74, d - .045, g);
    const sh = rrect(w, d, .02, 0, -d / 2); sh.holes.push(rrect(.46, .30, .04, 0, -.23, THREE.Path));
    M(slab(sh, .10, { curveSegments: 12 }), MT.ceramD, 0, .78, 0, g);                // 面盆本體（帶方形內槽）
    Bx(.47, .02, .31, MT.ceramic, 0, .80, .23, g);                                     // 槽底（略大於槽口，邊緣藏在瓷身裡）
    Cyl(.02, .02, .15, MT.chrome, 0, .88 + .075, .06, g, 16);
    const sp = Cyl(.011, .011, .15, MT.chrome, 0, 1.02, .13, g, 12); sp.rotation.x = Math.PI / 2;
    Bx(.05, .01, .02, MT.chrome, 0, 1.035, .05, g);
    Cyl(.028, .028, .12, MT.paint, w / 2 - .09, .88 + .06, .10, g, 16); Cyl(.01, .01, .04, MT.chrome, w / 2 - .09, 1.02, .10, g, 8);   // 給皂器（瓶頂 1.00）
    if(withMirror) mirror(0, 1.52, .001, mw, .80, 0, room, g);
    addCollider(g, { y1: 0.9 });
    return g;
  }
  const bathMat = (cx, cz, w, d) => RB(w, .012, d, .005, MT.mat, cx, FLOOR + .006, cz, root, 1);
  const brush = (x, z) => { Cyl(.045, .04, .12, MT.paint, x, FLOOR + .06, z, root, 16); Cyl(.006, .006, .30, MT.black, x, FLOOR + .25, z, root, 8); };

  /* ============================================================
     4. 模型（Poly Haven CC0）
     ============================================================ */
  const URL = './assets/private/';
  const names = ['potted_plant_02', 'potted_plant_04', 'hanging_picture_frame_01', 'ceramic_vase_01'];
  const models = {}, used = {};
  await Promise.all(names.map(n => loadModel(URL + n + '/' + n + '.model.json').then(o => { models[n] = o; }, e => { console.warn('private model missing', n, e); models[n] = null; })));
  /** 放模型：place() 會縮放到真實尺寸、底部貼 y；放完搬進 root 好一起 bake；collide 給 y1 就登記碰撞 */
  async function put(name, opt, collide){
    if(!models[name]) return null;
    const o = used[name] ? await loadModel(URL + name + '/' + name + '.model.json') : models[name]; used[name] = true;   // 第二份起再拿複本
    place(o, { y: FLOOR, ...opt }); root.add(o);
    if(name === 'potted_plant_02'){          // 檔案裡已換成素面陶盆＋一片土面（碎石土網格、盆子貼圖在站外就拿掉了，見 CREDITS.md）
      o.traverse(n => {                        // 盆子、土面改用共用材質（bake 時併在一起）；葉子稍微偏橄欖、降一點彩度
        if(!n.isMesh) return;
        if(/_pot$/.test(n.name)) n.material = MT.potW;
        else if(/_soil$/.test(n.name)) n.material = MT.soil;
        else if(/leaves/.test(n.name) && !n.material.userData.muji){ n.material.color.setHex(0xdfe2c9); n.material.userData.muji = true; }
      });
    }
    if(collide != null) addCollider(o, { y1: collide });
    return o;
  }
  /** 掛畫：wall = 牆面座標、at = 沿牆位置、y = 畫中心高度、facing = 畫面朝哪個方向（模型畫面原本朝 +z）；
      外框背面推到離牆 2 mm；換上自己的圖案；玻璃片拿掉（轉檔後不透明） */
  async function picture({ wall, facing, at, y, kind }){
    const rot = { south: 0, west: -Math.PI / 2, north: Math.PI, east: Math.PI / 2 }[facing];
    const alongX = facing === 'north' || facing === 'south';           // 掛在東西向的牆上
    const o = await put('hanging_picture_frame_01', { x: alongX ? at : wall, z: alongX ? wall : at, y: y - .42, rotY: rot });
    if(!o) return;
    const b = new THREE.Box3().setFromObject(o), sgn = (facing === 'south' || facing === 'east') ? 1 : -1;
    if(alongX) o.position.z += (wall + sgn * .002) - (sgn > 0 ? b.min.z : b.max.z);
    else       o.position.x += (wall + sgn * .002) - (sgn > 0 ? b.min.x : b.max.x);
    const glass = [];
    o.traverse(n => {
      if(!n.isMesh) return;
      const nm = n.material.name || '';
      if(/artwork/.test(nm)){ n.material = n.material.clone(); n.material.map = artTex(kind); n.material.roughnessMap = null; n.material.metalnessMap = null; n.material.roughness = 1; n.material.metalness = 0; n.material.needsUpdate = true; }
      else if(/glass/.test(nm)) glass.push(n);
    });
    glass.forEach(n => n.removeFromParent());
  }

  /* ============================================================
     5. 主臥室（x 0–2.865, z 0–4.04；圖：286.5 × 404）
        床頭靠西窗牆：床頭板離牆 5 cm、頂端 0.845（室內窗台板在 0.88–0.91、凸出 4.5 cm，兩者不相碰）；
        衣櫃在南牆（磁磚實牆）x 0.60–1.95 —— 西端讓開西面外開窗（z 3.18–4.07），東端讓開門扇迴轉區 x 2.01–2.87
     ============================================================ */
  {
    const R = '主臥室';
    rug(.62, .55, 2.70, 3.00);
    bed({ x: .05, z: 1.70, W: 1.52, L: 1.88, hb: .80, pillows: 2, cushions: 2 });   // 床板 z 0.86–2.54、x 0.05–2.09
    const t1 = nightstand(.20, .56, Math.PI / 2), t2 = nightstand(.20, 2.84, Math.PI / 2);   // 兩個橡木床頭櫃（面朝東）
    tableLamp(.19, .47, t1, R); tableLamp(.19, 2.94, t2, R);
    await put('potted_plant_04', { x: .23, z: .67, y: t1, fit: { h: .20 } });         // 北床頭櫃上的小盆栽
    books(.24, t2, 2.72, .2);
    wardrobe(1.275, 4.04 - .012 - .30, 1.35, .60, 2.30, Math.PI, 3);                  // 南牆三門衣櫃 x 0.60–1.95
    await put('potted_plant_02', { x: .31, z: 3.72, fit: { w: .52 } }, .9);           // 西南角落地盆栽（衣櫃旁、矮於窗台；東北角會擋住去床北側的走道）
    await picture({ wall: 2.865, facing: 'west', at: 1.35, y: 1.60, kind: 0 });      // 東牆掛畫（床上看得到）
    leanMirror(2.865 - .002, 2.75, .50, 1.60, -Math.PI / 2, R);                       // 斜靠東牆的穿衣鏡（門邊、牆端 3.14 以內）
  }

  /* ============================================================
     6–7. 臥室二、臥室三：2026-09-19 起改成主題房，整間（床、燈、裝飾、動畫、聲音）由獨立模組蓋
          臥室二 → js/theme_br2.js（「我賽博龐克家文藝復興音樂風」）
          臥室三 → js/theme_br3.js（「陰兒房」嬰兒房）
     ============================================================ */

  /* ============================================================
     8. 前室（x 3.364–4.7, z 4.16–6.289）— 保持通透（參考圖這裡是空的）：只在南端（死巷那面牆）放一座
        42 cm 深的橡木高櫃、東牆一幅畫；門扇迴轉區 x 3.40–4.08 / z 4.22–4.89、主浴門口 z 4.92–5.72 都留空
     ============================================================ */
  {
    wardrobe(4.032, 6.289 - .012 - .21, 1.26, .42, 2.30, Math.PI, 2);               // 高櫃 x 3.40–4.66、z 5.86–6.28，面朝北
    await put('ceramic_vase_01', { x: 3.70, z: 6.07, y: FLOOR + 2.30, fit: { h: .30 } });   // 花瓶放高櫃頂上
    await picture({ wall: 4.7, facing: 'west', at: 5.15, y: 1.60, kind: 0 });
  }

  /* ============================================================
     9. 主浴廁（x 0–3.214, z 4.16–5.69；圖：153 深）— 規格書設備位置（跟著北牆一起挪）
        西→東：浴缸（西窗牆下）→ 淋浴間（管道間南側、玻璃隔屏）→ 馬桶（水箱靠北牆）→ 東北角洗手台
     ============================================================ */
  {
    const R = '主浴廁';
    tub(.03, 4.175, .735, 5.69);                                                     // F_tub；缸體填滿北牆到南牆、西牆到玻璃隔屏，不留積水縫
    showerFloor(.78, 4.51, 1.68, 5.677);                                              // 淋浴間地面（馬賽克小磚）
    showerSet(1.23, 4.502, 0);                                                       // 龍頭在管道間南面（規格書 T 記號）
    drain(1.23, 4.95);
    bottleShelf(.78, FLOOR + 1.05, 4.515, 0);                                         // 淋浴間西北角（浴缸隔屏旁）
    toilet(2.08, 4.16, 0);                                                           // F_mbath_toilet 1.88–2.281，水箱靠北牆
    brush(1.80, 4.535);
    vanityOval(2.831, 4.16, 0, R);                                                    // F_mbath_vanity 2.449–3.213（含鏡子，Andy：照放）
    tpHolder(2.46, .66, 4.465, -Math.PI / 2);                                         // 掛在洗手台櫃西側板
    towelBar(1.70, 1.20, 4.77, .40, Math.PI / 2);                                     // 掛在固定玻璃隔屏外側
    bathMat(2.05, 5.40, .60, .40);
  }

  /* ============================================================
     10. 次浴廁（x 6.135–7.736 / z 8.30–10.35 ＋ 東側 x 7.736–8.95 / z 9.116–10.35；圖：281.5 × 205）
         西牆洗手台、南牆窗下智能馬桶、東側淋浴帶（花灑在東牆）、西南角管道間、天花板暖風機
     ============================================================ */
  {
    const R = '次浴廁';
    // 平面圖註記「次浴廁 1.無框明鏡、毛巾架及衛生紙架取消」＝建商不裝；2026-09-19 Andy 選「照放」（屋主之後自己裝）
    //   → 鏡子（連鏡燈）、毛巾桿、衛生紙架都放；要拿掉就把 BATH2_ACC 改成 false
    const BATH2_ACC = true;
    vanitySquare(6.135, 8.99, Math.PI / 2, R, BATH2_ACC);                             // 北牆到管道間（8.30–9.673）的正中間
    smartToilet(7.075, 10.35, Math.PI);                                               // 圖上註記 4：單體馬桶改智能馬桶（南牆窗下）
    toiletRemote(6.617, .78, 10.05, Math.PI / 2);                                     // 遙控器貼在管道間東面（坐著伸手就到）
    ceilingHeater(7.10, 9.30, ctx.H || 3.25);                                         // 圖上註記 4：換氣機改暖風機
    brush(7.36, 10.274);
    showerFloor(8.03, 9.122, 8.944, 10.344);                                          // 淋浴帶地面（馬賽克小磚）
    showerSet(8.95, 9.74, -Math.PI / 2);                                              // 花灑在東牆
    drain(8.40, 10.234);                                                             // 規格書：排水格柵在南牆前
    bottleShelf(8.95, FLOOR + 1.05, 10.35, Math.PI);                                  // 東南角
    if(BATH2_ACC){
      tpHolder(6.617, .68, 9.80, Math.PI / 2);                                        // 管道間東面（遙控器北側）
      towelBar(6.47, 1.20, 8.30, .45, 0);                                             // 北牆（門西側）
    }
    bathMat(7.72, 9.44, .40, .55);                                                    // 淋浴門出口前
  }

  /* ============================================================
     11. 鏡子的執行期
     (a) 反射探針（手機、電腦都有）：燈建好之後在每面鏡子前 6 cm 拍一次 6 面環景（CubeCamera，每格最多拍一面鏡子）；
         時間滑桿或屋頂開關停下 0.4 秒後重拍。畫的時候把反射線打到房間的盒子（地板～天花板、牆面～牆面）上再去查環景
         （box projection）→ 鏡中的牆、窗、地板會跟著視角正確移動；每個像素只多一次貼圖取樣，手機也扛得住。
     (b) Reflector 真反射（電腦版）：人在同一間房、站在鏡子前 5 m 內才開（每片開著＝多畫一次場景）；俯瞰（相機高於 3 m）一律關。
         它是用主相機的投影去取樣貼圖 → 貼圖必須跟「畫面」同比例：取畫面的繪圖緩衝尺寸、長邊上限 1600，視窗變了就跟著改
     ============================================================ */
  if(probes.length){
    const renderer = ctx.renderer, H = ctx.H || 3.25;
    const pv = new THREE.Vector3(), pn = new THREE.Vector3();
    const VS = `varying vec3 vW; varying vec3 vN;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w; }`;
    const FS = `uniform samplerCube env; uniform vec3 bmin, bmax, ppos; uniform float tint; varying vec3 vW; varying vec3 vN;
      void main(){
        vec3 r = reflect(normalize(vW - cameraPosition), normalize(vN));
        vec3 sg = sign(r); sg += 1.0 - abs(sg);                         // 0 當成 +1，避免 0/0
        vec3 ir = sg / max(abs(r), vec3(1e-4));
        vec3 f = max((bmax - vW) * ir, (bmin - vW) * ir);               // 每個軸往前打到的那道牆
        float t = min(min(f.x, f.y), f.z);
        gl_FragColor = vec4(textureCube(env, vW + r * t - ppos).rgb * tint, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`;
    for(const p of probes){
      const rs = (ctx.R[p.room] && ctx.R[p.room].rects) || [];
      p.mesh.getWorldPosition(pv); p.mesh.getWorldDirection(pn);          // 鏡面朝局部 +z
      const b = rs.length ? rs.reduce((a, q) => [Math.min(a[0], q[0]), Math.min(a[1], q[1]), Math.max(a[2], q[2]), Math.max(a[3], q[3])], [1e9, 1e9, -1e9, -1e9])
                          : [pv.x - 1.5, pv.z - 1.5, pv.x + 1.5, pv.z + 1.5];
      // 半浮點（窗外的亮光不會被截掉）；一面 320（手機）／512（電腦）：手機兩面鏡含深度緩衝共約 15 MB 顯存
      p.rt = new THREE.WebGLCubeRenderTarget(LOW ? 320 : 512, { type: THREE.HalfFloatType });
      p.cam = new THREE.CubeCamera(.03, 120, p.rt);                       // far 120：窗外的天空圓頂（半徑 90）也要拍到
      p.cam.position.copy(pv).addScaledVector(pn, .06);
      p.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: {
        env: { value: p.rt.texture }, ppos: { value: p.cam.position }, tint: { value: .92 },   // 一般銀鏡反射率約 9 成
        bmin: { value: new THREE.Vector3(b[0], 0, b[1]) }, bmax: { value: new THREE.Vector3(b[2], H, b[3]) } } });
    }
    const mirrorsOff = () => [...probes.map(q => q.mesh), ...reflectors.map(r => r.mesh)].map(o => { const v = o.visible; o.visible = false; return () => { o.visible = v; }; });
    function capture(p){
      const restore = mirrorsOff(), au = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;                              // 陰影貼圖沿用主畫面那一份，不要重算 6 次
      p.cam.update(renderer, scene);
      renderer.shadowMap.autoUpdate = au;
      restore.forEach(f => f());
      p.mesh.material = p.mat;
    }
    const key = () => Math.round((ctx.time ?? 12) * 4) + (ctx.roof && ctx.roof.visible ? 1000 : 0);
    let lastKey = null, changedAt = 0, pending = false, queue = [];
    ctx.tick.push((dt, t) => {
      const k = key();
      if(k !== lastKey){ lastKey = k; changedAt = t; pending = true; queue = []; }
      if(pending && t - changedAt > .4){ pending = false; queue = probes.slice(); }
      if(queue.length) capture(queue.shift());
    });
  }
  if(reflectors.length){
    const cam = ctx.camera, v = new THREE.Vector3(), n = new THREE.Vector3(), buf = new THREE.Vector2(), cur = new THREE.Vector2();
    /** 反射貼圖只有「鏡子在畫面上佔的那塊」會被取樣：鏡面上一點在反射相機裡的位置＝它在主畫面的位置左右翻過來
        （Reflector 的虛擬相機是鏡像相機再左右翻一次，才能是正常的右手座標）
        → 用 scissor 只畫那一塊（外擴 3 px 給線性取樣），鏡子只佔畫面一成時，多畫的像素也只有一成；
        鏡角跑到相機後面（貼著鏡子斜看）就整張畫 */
    function scissorToMirror(r){
      const rt = r.mesh.getRenderTarget(), gp = r.mesh.geometry.parameters;
      let x0 = 1, x1 = -1, y0 = 1, y1 = -1;
      for(const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]){
        v.set(sx * gp.width / 2, sy * gp.height / 2, 0).applyMatrix4(r.mesh.matrixWorld).applyMatrix4(cam.matrixWorldInverse);
        if(v.z > -cam.near){ rt.scissorTest = false; return; }
        v.applyMatrix4(cam.projectionMatrix);
        x0 = Math.min(x0, -v.x); x1 = Math.max(x1, -v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);   // x 左右翻
      }
      const X0 = Math.max(0, Math.floor((Math.max(-1, x0) * .5 + .5) * rt.width) - 3), X1 = Math.min(rt.width, Math.ceil((Math.min(1, x1) * .5 + .5) * rt.width) + 3);
      const Y0 = Math.max(0, Math.floor((Math.max(-1, y0) * .5 + .5) * rt.height) - 3), Y1 = Math.min(rt.height, Math.ceil((Math.min(1, y1) * .5 + .5) * rt.height) + 3);
      rt.scissor.set(X0, Y0, Math.max(1, X1 - X0), Math.max(1, Y1 - Y0)); rt.scissorTest = true;
    }
    ctx.tick.push(() => {
      ctx.renderer.getDrawingBufferSize(buf);
      const k = Math.min(1, 1600 / Math.max(buf.x, buf.y)), w = Math.max(64, Math.round(buf.x * k)), h = Math.max(64, Math.round(buf.y * k));
      if(w !== cur.x || h !== cur.y){ cur.set(w, h); for(const r of reflectors) r.mesh.getRenderTarget().setSize(w, h); }
      const p = cam.position;
      cam.updateMatrixWorld();                                          // 這格剛移動過的相機（scissor 要用這一格的位置）
      for(const r of reflectors){
        let on = p.y < 3.0;
        if(on){
          const rs = (ctx.R[r.room] && ctx.R[r.room].rects) || []; on = false;
          for(let i = 0; i < rs.length && !on; i++){ const q = rs[i]; on = p.x > q[0] - .35 && p.x < q[2] + .35 && p.z > q[1] - .35 && p.z < q[3] + .35; }
        }
        if(on){ r.mesh.getWorldDirection(n); r.mesh.getWorldPosition(v); v.subVectors(p, v); on = v.dot(n) > 0 && v.length() < 5; }
        r.mesh.visible = on;
        if(on) scissorToMirror(r);
      }
    });
  }

  /* ============================================================
     12. 合併：所有靜態網格依材質合成一個 mesh（俯瞰實測多 39 個 draw call）；Reflector 不合併
     ============================================================ */
  bake();
  function bake(){
    root.updateWorldMatrix(true, true);
    const byMat = new Map(), doomed = [];
    root.traverse(o => {
      if(!o.isMesh || o.userData.noBake || !o.geometry || !o.geometry.attributes.position || Array.isArray(o.material)) return;
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for(const k of Object.keys(g.attributes)) if(!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if(!g.attributes.normal) g.computeVertexNormals();
      if(!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(o.matrixWorld);
      if(!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(g); doomed.push(o);
    });
    for(const o of doomed) o.removeFromParent();
    for(const [m, list] of byMat){
      const g = BGU.mergeGeometries(list, false); list.forEach(x => x.dispose());
      if(!g) continue;
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = !m.transparent; mesh.receiveShadow = true; mesh.name = 'private-baked';
      root.add(mesh);
    }
    // 清掉空的 Group（留著 Reflector 的那幾個）
    const prune = o => { for(let i = o.children.length - 1; i >= 0; i--){ const c = o.children[i]; if(c.isGroup){ prune(c); if(c.children.length === 0) o.remove(c); } } };
    prune(root);
  }
}
