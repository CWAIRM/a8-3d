/* ============================================================
   arch.js — 建築本體：樓板、天花板、外牆、隔間牆、柱子、管道間、門、窗、玻璃隔屏、女兒牆
   尺寸全部照 layout/spec_final.json（公尺，原點＝西外牆內面 × 北外牆內面；X 東、Z 南、Y 上）。
   做法：所有固定不動的牆體用「同材質合併成一個 mesh」（每種材質一個 draw call），
   UV 直接用世界座標公尺 → 貼圖 1:1、牆段之間沒有接縫。門片、淋浴門是獨立的 Group。
   ============================================================ */
export default async function buildArch(ctx){
  const { THREE, scene, H, R, QUALITY, colliders, addCollider } = ctx;
  const LOW = QUALITY === 'low';

  /* ============================================================
     0. 幾個共同的高度（平面圖上沒有，這裡是假設值，見報告）
     ============================================================ */
  const SILL = 0.90, HEAD = 2.45;        // 北、西窗牆：窗台 0.90 / 窗頂 2.45（玻璃高 1.55）
  const SILL_S = 1.30, HEAD_S = 2.30;    // 南牆廚房／次浴小窗
  const DOOR_H = 2.10, ENTRY_H = 2.15;   // 室內門 2.10、大門 2.15
  const FLOOR_TOP = 0.045;               // 地板完成面（沿用原本慣例：place() 預設 y=0.04）
  const PARAPET_H = 1.10;                // 陽台女兒牆高（假設）
  const SCREEN_H = 2.00;                 // 淋浴玻璃隔屏高

  /* ============================================================
     1. 材質
     ============================================================ */
  const TL = new THREE.TextureLoader();
  const ANISO = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy());
  function tex(file, srgb, metersPerTile){
    const t = TL.load('./lib/tex/' + file);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = ANISO;
    t.repeat.set(1 / metersPerTile, 1 / metersPerTile);   // UV 是公尺 → repeat = 1/貼圖實際尺寸
    t.channel = 0;
    if(srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  /** 小張程式產生的貼圖：斑點（柱子／牆頂）與直紋（橡木門片） */
  function canvasTex(size, paint, metersPerTile){
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    paint(cv.getContext('2d'), size);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO;
    if(metersPerTile) t.repeat.set(1 / metersPerTile, 1 / metersPerTile);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const speckle = canvasTex(256, (c, s) => {
    c.fillStyle = '#e6e6e6'; c.fillRect(0, 0, s, s);
    for(let i = 0; i < 9000; i++){
      const v = 150 + Math.floor(Math.random() * 105);
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5);
    }
  }, 0.8);
  const veneer = canvasTex(256, (c, s) => {           // 橡木直紋：上下方向的細條紋
    c.fillStyle = '#f4f4f4'; c.fillRect(0, 0, s, s);
    for(let x = 0; x < s; x++){
      const v = 232 + 18 * Math.sin(x * 0.35) * Math.sin(x * 0.071 + 1.3) + (Math.random() - 0.5) * 14;
      c.fillStyle = `rgb(${v | 0},${(v - 4) | 0},${(v - 10) | 0})`;
      c.fillRect(x, 0, 1, s);
    }
    c.globalAlpha = 0.18; c.fillStyle = '#b89a70';
    for(let i = 0; i < 40; i++){ c.fillRect(Math.random() * s, Math.random() * s, 1, 20 + Math.random() * 80); }
  });

  // 浴室牆磚（對照 target_muji 兩間浴室的淺灰白磁磚）：近白 30 × 60 cm 橫貼、2 mm 淺灰填縫、每片色調差一點點；
  // 貼圖一張 = 0.6 m 寬 × 0.6 m 高（上下兩片磚）。不用石材貼圖：石材的凹洞與紋路在牆上會變成一片暗灰、看起來像裂縫
  const wallTile = canvasTex(512, (c, s) => {
    const g = Math.max(2, Math.round(s * 0.002 / 0.6));           // 2 mm 縫 ≈ 2 px
    c.fillStyle = '#cfccc6'; c.fillRect(0, 0, s, s);               // 縫的顏色
    const tones = ['#f4f2ee', '#f1efeb'];
    for(let r = 0; r < 2; r++){
      const y0 = r * s / 2;
      c.fillStyle = tones[r]; c.fillRect(g / 2, y0 + g / 2, s - g, s / 2 - g);
      // 釉面很淡的雲紋（幾乎看不出來，只是讓大片牆不要死平）
      for(let i = 0; i < 260; i++){
        const v = 236 + Math.floor(Math.random() * 14);
        c.fillStyle = `rgba(${v},${v - 1},${v - 3},.35)`;
        c.fillRect(g / 2 + Math.random() * (s - g - 18), y0 + g / 2 + Math.random() * (s / 2 - g - 10), 6 + Math.random() * 18, 2 + Math.random() * 6);
      }
    }
  }, 0.6);
  const wallN  = tex('wall_nor_gl.jpg', false, 2.10);
  const oakD   = tex('oak_Diffuse.jpg', true, 1.70), oakN = tex('oak_nor_gl.jpg', false, 1.70), oakA = tex('oak_arm.jpg', false, 1.70);
  const stoneD = tex('stone_Diffuse.jpg', true, 1.50), stoneN = tex('stone_nor_gl.jpg', false, 1.50), stoneA = tex('stone_arm.jpg', false, 1.50);
  const Std = (o) => new THREE.MeshStandardMaterial(o);
  const nmap = LOW ? {} : { normalMap: wallN, normalScale: new THREE.Vector2(.22, .22) };
  const MAT = {
    PL   : Std({ color: 0xf3efe7, roughness: .95, ...nmap }),                          // 室內油漆牆（暖白）
    EX   : Std({ color: 0xd7cfc1, roughness: .93, ...nmap }),                          // 外牆／陽台側（淺米）
    TL   : Std({ color: 0xffffff, roughness: .38, metalness: 0, map: wallTile }),                       // 浴室磁磚牆（淺灰白釉面磚）
    TOP  : Std({ color: 0x2c2e31, roughness: .9, map: speckle }),                      // 牆頂切面（炭黑 poché）
    COL  : Std({ color: 0x35373b, roughness: .92, map: speckle }),                     // RC 柱（炭黑帶斑點）
    FLW  : Std({ color: new THREE.Color(1.14, 1.29, 1.42), roughness: 1, metalness: 0, map: oakD, normalMap: oakN, normalScale: new THREE.Vector2(.6, .6), roughnessMap: oakA, aoMap: oakA }), // 淺橡木地板
    FLT  : Std({ color: 0xe0deda, roughness: 1, metalness: 0, map: stoneD, normalMap: stoneN, normalScale: new THREE.Vector2(.5, .5), roughnessMap: stoneA, aoMap: stoneA }), // 暖灰石磚地板
    FLB  : Std({ color: 0xcfcdc8, roughness: 1, metalness: 0, map: stoneD, normalMap: stoneN, normalScale: new THREE.Vector2(.5, .5), roughnessMap: stoneA, aoMap: stoneA }), // 陽台地磚（稍暗）
    CEIL : Std({ color: 0xf7f4ee, roughness: .96 }),
    SLAB : Std({ color: 0xd2cabc, roughness: .95 }),                                   // 底座樓板
    AL   : Std({ color: 0xc8c7c3, roughness: .42, metalness: .6 }),                    // 淺灰鋁框
    ALD  : Std({ color: 0x3b3b3c, roughness: .5, metalness: .6 }),                     // 深色鋁軌
    STL  : Std({ color: 0xa9a9a6, roughness: .3, metalness: .9 }),                     // 髮絲鋼
    BLK  : Std({ color: 0x26262a, roughness: .6, metalness: .2 }),                     // 霧黑
    STN  : Std({ color: 0xd9d4cc, roughness: .45 }),                                   // 石材窗台／門檻
    BASE : Std({ color: 0xf6f3ed, roughness: .8 }),                                    // 踢腳板
    OAK  : Std({ color: 0xd8bc90, roughness: .55, map: veneer }),                      // 淺橡木門片
    OAKD : Std({ color: 0xc4a47a, roughness: .5, map: veneer }),                       // 大門：比室內門深一階的橡木（target_muji 的大門也是淺木色）
    GL   : new THREE.MeshPhysicalMaterial({ color: 0xd6e6ee, transparent: true, opacity: .26, roughness: .04, metalness: 0,
             envMapIntensity: 1.15, side: THREE.DoubleSide, depthWrite: false }),      // 清玻璃
    // 淋浴間玻璃（隔屏、淋浴門）：中性無色、單面（方塊只畫朝外那面）→ 一片玻璃只有一層，不會疊成一片藍白霧
    GLS  : new THREE.MeshPhysicalMaterial({ color: 0xeef3f3, transparent: true, opacity: .13, roughness: .04, metalness: 0,
             envMapIntensity: 1.2, side: THREE.FrontSide, depthWrite: false }),
    GLF  : new THREE.MeshPhysicalMaterial({ color: 0xeef2f2, transparent: true, opacity: .62, roughness: .55, metalness: 0,
             side: THREE.DoubleSide, depthWrite: false }),                              // 霧玻璃
  };
  ctx.archMaterials = MAT;

  /* ============================================================
     2. 合併幾何的小工具（每種材質一個 bucket）
     ============================================================ */
  const buckets = new Map();
  const bk = (m) => { let b = buckets.get(m); if(!b){ b = { m, p: [], n: [], uv: [] }; buckets.set(m, b); } return b; };
  function face(b, P, n, uv){
    const [p0, p1, p2] = P;
    const ax = p1[0]-p0[0], ay = p1[1]-p0[1], az = p1[2]-p0[2], bx = p2[0]-p0[0], by = p2[1]-p0[1], bz = p2[2]-p0[2];
    const dot = (ay*bz-az*by)*n[0] + (az*bx-ax*bz)*n[1] + (ax*by-ay*bx)*n[2];
    const order = dot >= 0 ? [0,1,2,0,2,3] : [0,2,1,0,3,2];
    for(const i of order){ b.p.push(...P[i]); b.n.push(...n); b.uv.push(...uv[i]); }
  }
  /** 一個方塊，六面各自指定材質（null＝不畫）；UV = 世界座標公尺，從室外看都是由左到右 */
  function boxF(x0, y0, z0, x1, y1, z1, m){
    if(m.px) face(bk(m.px), [[x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0]], [1,0,0],  [[-z0,y0],[-z1,y0],[-z1,y1],[-z0,y1]]);
    if(m.nx) face(bk(m.nx), [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]], [-1,0,0], [[z0,y0],[z1,y0],[z1,y1],[z0,y1]]);
    if(m.py) face(bk(m.py), [[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]], [0,1,0],  [[x0,z0],[x1,z0],[x1,z1],[x0,z1]]);
    if(m.ny) face(bk(m.ny), [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]], [0,-1,0], [[x0,z0],[x1,z0],[x1,z1],[x0,z1]]);
    if(m.pz) face(bk(m.pz), [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]], [0,0,1],  [[x0,y0],[x1,y0],[x1,y1],[x0,y1]]);
    if(m.nz) face(bk(m.nz), [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0]], [0,0,-1], [[-x0,y0],[-x1,y0],[-x1,y1],[-x0,y1]]);
  }
  /** 六面同材質的方塊（top 可另外指定） */
  function boxS(x0, y0, z0, x1, y1, z1, m, top = m, bottom = m){
    boxF(x0, y0, z0, x1, y1, z1, { px: m, nx: m, pz: m, nz: m, py: top, ny: bottom });
  }
  function flushBuckets(parent = scene, tag = 'arch'){
    const meshes = [];
    for(const [m, b] of buckets){
      if(!b.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      g.setAttribute('normal',   new THREE.Float32BufferAttribute(b.n, 3));
      g.setAttribute('uv',       new THREE.Float32BufferAttribute(b.uv, 2));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = !m.transparent; mesh.receiveShadow = true;
      mesh.name = tag; parent.add(mesh); meshes.push(mesh);
    }
    buckets.clear();
    return meshes;
  }
  const collide = (x0, z0, x1, z1, y1 = H) => colliders.push({ x0: Math.min(x0,x1), x1: Math.max(x0,x1), z0: Math.min(z0,z1), z1: Math.max(z0,z1), y1 });

  /* ============================================================
     3. 牆體：沿軸線一段一段蓋，洞口留給門窗
     axis 'x'：沿 X 從 a→b，牆體佔 Z c0..c1（A 面＝北面 c0 側、B 面＝南面 c1 側）
     axis 'z'：沿 Z 從 a→b，牆體佔 X c0..c1（A 面＝西面、B 面＝東面）
     f = {A, B, ends, top}；holes = [{a0, a1, y0, y1}]；base = [A 面要不要踢腳板, B 面…]
     ============================================================ */
  const archWalls = [];   // 給校對 overlay 用：{id, axis, a, b, c0, c1}
  function solid(axis, s, e, c0, c1, y0, y1, f, col){
    let x0, x1, z0, z1;
    if(axis === 'x'){ x0 = s; x1 = e; z0 = c0; z1 = c1; } else { z0 = s; z1 = e; x0 = c0; x1 = c1; }
    const ends = f.ends || f.A, top = f.top || MAT.TOP;
    const m = axis === 'x' ? { nz: f.A, pz: f.B, nx: ends, px: ends, py: top, ny: f.A }
                           : { nx: f.A, px: f.B, nz: ends, pz: ends, py: top, ny: f.A };
    boxF(x0, y0, z0, x1, y1, z1, m);
    if(col) collide(x0, z0, x1, z1, y1);
  }
  function baseboard(axis, s, e, at, dir){   // dir = -1：貼在 c0 面外側；+1：貼在 c1 面外側
    const t = 0.012, y0 = FLOOR_TOP - 0.005, y1 = FLOOR_TOP + 0.08;
    const lo = dir < 0 ? at - t : at, hi = dir < 0 ? at : at + t;
    if(axis === 'x') boxS(s, y0, lo, e, y1, hi, MAT.BASE);
    else             boxS(lo, y0, s, hi, y1, e, MAT.BASE);
  }
  function wall(id, axis, a, b, c0, c1, f, holes = [], base = [false, false]){
    archWalls.push({ id, axis, a, b, c0, c1, holes: holes.map(h => [h.a0, h.a1]) });
    holes = [...holes].sort((p, q) => p.a0 - q.a0);
    const put = (s, e, y0, y1, col) => {
      if(e - s < 1e-4 || y1 - y0 < 1e-4) return;
      solid(axis, s, e, c0, c1, y0, y1, f, col);
      if(y0 < 1e-4){ if(base[0]) baseboard(axis, s, e, c0, -1); if(base[1]) baseboard(axis, s, e, c1, +1); }
    };
    let cur = a;
    for(const h of holes){
      put(cur, h.a0, 0, H, true);
      if(h.y0 > 0) put(h.a0, h.a1, 0, h.y0, true);       // 窗台矮牆
      if(h.y1 < H) put(h.a0, h.a1, h.y1, H, false);      // 門窗上方過樑（不算碰撞，人要走得過）
      cur = h.a1;
    }
    put(cur, b, 0, H, true);
  }

  /* ============================================================
     4. 底座樓板、各房間地板、天花板、天空
     ============================================================ */
  // 底座：整棟的樓板切片（淺米色），柱子腳下另外補墊
  boxS(-0.15, -0.30, -0.15, 9.126, 0.0, 10.571, MAT.SLAB);
  // 四支角柱（規格書尺寸；NW 柱內角由 (0.018,−0.059) 貼齊到 (0,0)、SW 柱北面貼齊臥室三南牆面、SE 柱北面貼齊次浴北牆面，差 ≤2.3 cm）
  const COLS = { NW: [-1.131, -1.16, 0.0, 0.0], NE: [8.2, -1.108, 9.314, 0.023], SW: [-1.108, 8.257, 0.036, 9.399], SE: [7.736, 8.26, 9.077, 9.179] };
  for(const k of ['NW', 'NE', 'SW']){ const c = COLS[k]; boxS(c[0], -0.30, c[1], c[2], -0.006, c[3], MAT.SLAB); }

  // 各房間地板（牆面到牆面，一間一片；同材質相鄰片因為 UV 是世界座標所以看不出接縫）
  const FLOOR = { '客廳': 'FLW', '餐廳': 'FLW', '主臥室': 'FLW', '臥室二': 'FLW', '臥室三': 'FLW', '走道': 'FLW', '前室': 'FLW',
                  '主浴廁': 'FLT', '次浴廁': 'FLT', '廚房': 'FLT', '陽台': 'FLB' };
  const floorRect = (r, mat, top = FLOOR_TOP) => boxF(r[0], top - 0.04, r[1], r[2], top, r[3], { py: mat, nx: mat, px: mat, nz: mat, pz: mat });
  for(const k in R) for(const q of R[k].rects) floorRect(q, MAT[FLOOR[k] || 'FLW']);
  // 門洞地板：木地板連過去的洞口
  floorRect([4.497, 2.999, 5.437, 3.149], MAT.FLW);   // 臥室二門洞
  floorRect([3.364, 4.090, 4.125, 4.240], MAT.FLW);   // 前室門洞
  floorRect([4.700, 7.325, 4.850, 8.260], MAT.FLW);   // 臥室三門洞
  floorRect([5.072, 8.260, 5.982, 8.424], MAT.FLT);   // 廚房拉門洞（磁磚接過去）
  // 石材門檻（略高 5 mm）：大門、兩間浴室、陽台門
  floorRect([8.976, 7.056, 9.126, 8.124], MAT.STN, FLOOR_TOP + 0.005);
  floorRect([3.214, 4.921, 3.364, 5.723], MAT.STN, FLOOR_TOP + 0.005);
  floorRect([6.808, 8.260, 7.587, 8.410], MAT.STN, FLOOR_TOP + 0.005);
  floorRect([3.056, 8.912, 3.219, 9.730], MAT.STN, FLOOR_TOP + 0.005);

  /* ============================================================
     5. 外殼：四支 RC 角柱、窗牆（北、西）、RC 牆（東、南、廚房西、臥室三南、陽台）
     ============================================================ */
  // 柱子側面：朝室外＝淺米、朝室內＝油漆牆／浴室磁磚；只有頂面是炭黑（對照 target：柱身米色、頂部深色）
  const COL_FACES = {
    NW: { px: MAT.EX, nx: MAT.EX, pz: MAT.EX, nz: MAT.EX },
    NE: { px: MAT.EX, nx: MAT.EX, pz: MAT.PL, nz: MAT.EX },   // 南面朝客廳
    SW: { px: MAT.EX, nx: MAT.EX, pz: MAT.EX, nz: MAT.EX },
    SE: { px: MAT.EX, nx: MAT.TL, pz: MAT.TL, nz: MAT.PL },   // 西、南面在次浴廁裡；北面朝玄關
  };
  for(const k in COLS){ const c = COLS[k]; boxF(c[0], 0, c[1], c[2], H, c[3], { ...COL_FACES[k], py: MAT.COL, ny: MAT.COL }); collide(c[0], c[1], c[2], c[3]); }
  // NE 柱佔到客廳角落：它朝室內的那一面補踢腳板
  baseboard('x', 8.2, 8.976, COLS.NE[3], +1);
  ctx.columns = Object.entries(COLS).map(([k, c]) => ({ id: 'C_' + k, rect: [...c] }));

  /* ---- 窗牆（北、西）：矮牆 0–0.90 ＋ 玻璃帶 0.90–2.45 ＋ 上牆 2.45–3.25 ----
     spans：casement＝外開窗扇（關著）、fixed＝固定玻璃、block＝隔間牆／柱子頂到窗牆的直料塊 */
  /* innerRuns = [[s, e, 室內面材質], …] 沿牆分段：主浴那一段室內面要貼磁磚、不做踢腳板 */
  function facade(axis, a, b, c0, c1, spans, roomOf, innerRuns = [[a, b, MAT.PL]]){
    for(const [s, e, m] of innerRuns)
      wall('facade_' + axis + '_' + s.toFixed(2), axis, s, e, c0, c1, { A: MAT.EX, B: m, ends: MAT.EX },
           [{ a0: s, a1: e, y0: SILL, y1: HEAD }], [false, m === MAT.PL]);
    const d0 = c0 + 0.03, d1 = c1 - 0.03, gz = c0 + 0.055;
    // 沿軸 s..e、高 y0..y1、厚 q0..q1 的方塊（q 是另一軸）
    const B = (s, e, y0, y1, q0, q1, m) => axis === 'x' ? boxS(s, y0, q0, e, y1, q1, m) : boxS(q0, y0, s, q1, y1, e, m);
    B(a, b, SILL - 0.01, SILL + 0.05, d0, d1, MAT.AL);           // 下橫料
    B(a, b, HEAD - 0.05, HEAD + 0.01, d0, d1, MAT.AL);           // 上橫料
    B(a, b, SILL - 0.02, SILL + 0.01, c1 - 0.035, c1 + 0.045, MAT.STN);   // 室內窗台板
    const y0 = SILL + 0.05, y1 = HEAD - 0.05, ym = (y0 + y1) / 2;
    const normal = axis === 'x' ? [0, -1] : [-1, 0];
    for(const sp of spans){
      const [s, e, type, id, hinge] = sp;
      if(type === 'block'){ B(s, e, y0, y1, c0 - 0.003, c1 + 0.003, MAT.AL); continue; }
      B(s, s + 0.045, y0, y1, d0, d1, MAT.AL);                   // 左／北直料
      B(e - 0.045, e, y0, y1, d0, d1, MAT.AL);                   // 右／南直料
      const gs = s + 0.045, ge = e - 0.045;
      if(type === 'casement'){
        // 窗扇框（5.5 cm）貼在外側，玻璃在扇框裡；關著
        const q0 = c0 + 0.02, q1 = c0 + 0.075, w = 0.055;
        B(gs, gs + w, y0, y1, q0, q1, MAT.AL); B(ge - w, ge, y0, y1, q0, q1, MAT.AL);
        B(gs, ge, y0, y0 + w, q0, q1, MAT.AL); B(gs, ge, y1 - w, y1, q0, q1, MAT.AL);
        B(gs + w, ge - w, y0 + w, y1 - w, c0 + 0.045, c0 + 0.051, MAT.GL);
        // 把手：在沒有鉸鏈的那一側直料上、朝室內（hinge 'e'/'s' = 高值端）
        const hiHinge = (hinge === 'east' || hinge === 'south');
        const hx = hiHinge ? gs + w / 2 : ge - w / 2;
        B(hx - 0.02, hx + 0.02, ym - 0.03, ym + 0.03, q1, q1 + 0.014, MAT.STL);       // 座
        B(hx - 0.009, hx + 0.009, ym - 0.06, ym + 0.055, q1 + 0.014, q1 + 0.046, MAT.STL); // 把手桿（垂直＝關閉）
      }else{
        B(gs, ge, y0, y1, gz, gz + 0.006, MAT.GL);                 // 固定玻璃
      }
      ctx.windows.push({ id, axis, at: (s + e) / 2, at0: s, at1: e, w: e - s, y0: SILL, y1: HEAD,
                         fixed: (c0 + c1) / 2, c0, c1, room: roomOf((s + e) / 2), type, hinge: hinge || null, normal });
    }
  }
  // 北窗牆：x 0→8.2（NW 柱到 NE 柱），牆體 z −0.15..0；三扇外開窗都是東鉸鏈
  facade('x', 0, 8.2, -0.15, 0, [
    [0.000, 2.029, 'fixed', 'FIX_MBR_N1'],
    [2.029, 2.820, 'casement', 'WIN_MBR_N', 'east'],
    [2.820, 2.964, 'block'],                       // 主臥／臥室二隔間頂到窗牆
    [2.964, 4.598, 'fixed', 'FIX_BRN_N'],
    [4.598, 5.431, 'casement', 'WIN_BRN_N', 'east'],
    [5.431, 5.574, 'block'],                       // 臥室二／客廳隔間
    [5.574, 7.254, 'fixed', 'FIX_LR_N'],
    [7.254, 8.144, 'casement', 'WIN_LR_N', 'east'],
    [8.144, 8.200, 'block'],                       // 窗框端塊，緊貼 NE 柱
  ], x => x < 2.841 ? '主臥室' : x < 5.437 ? '臥室二' : '客廳');
  // 西窗牆：z 0→8.257，牆體 x −0.15..0；三扇外開窗都是南鉸鏈；z≈1.63 有直料記號
  facade('z', 0, 8.257, -0.15, 0, [
    [0.000, 1.590, 'fixed', 'FIX_MBR_W1'],
    [1.590, 1.674, 'block'],                       // MULLION_MBR_W（圖上的直料記號）
    [1.674, 3.175, 'fixed', 'FIX_MBR_W2'],
    [3.175, 4.066, 'casement', 'WIN_MBR_W', 'south'],
    [4.066, 4.245, 'block'],                       // 主浴北牆頂到窗牆
    [4.245, 4.867, 'fixed', 'FIX_MBATH_W'],
    [4.867, 5.741, 'casement', 'WIN_MBATH_W', 'south'],
    [5.741, 5.888, 'block'],                       // 主浴南牆頂到窗牆
    [5.888, 7.307, 'fixed', 'FIX_BR2_W'],
    [7.307, 8.196, 'casement', 'WIN_BR2_W', 'south'],
    [8.196, 8.257, 'block'],                       // 端塊，接臥室三南牆／SW 柱
  ], z => z < 4.095 ? '主臥室' : z < 5.888 ? '主浴廁' : '臥室三',
  [[0, 4.245, MAT.PL], [4.245, 5.738, MAT.TL], [5.738, 8.257, MAT.PL]]);   // 主浴段室內面貼磁磚

  /* ---- RC 外牆 ---- */
  // 東牆（上段）：NE 柱到大門北側 jamb；大門洞 7.056–8.124；再到 SE 柱
  wall('W_east_rc_upper', 'z', 0.023, 8.26, 8.976, 9.126, { A: MAT.PL, B: MAT.EX, ends: MAT.EX },
       [{ a0: 7.056, a1: 8.124, y0: 0, y1: ENTRY_H }], [true, false]);
  // 東牆（下段）：次浴廁東牆，SE 柱到南牆
  wall('W_east_rc_lower', 'z', 9.179, 10.54, 8.898, 9.035, { A: MAT.TL, B: MAT.EX, ends: MAT.EX });
  // 南牆：廚房段（有窗）＋ 次浴廁段（有窗）
  wall('W_south_rc_k', 'x', 3.219, 5.982, 10.376, 10.54, { A: MAT.PL, B: MAT.EX, ends: MAT.EX },
       [{ a0: 4.984, a1: 5.812, y0: SILL_S, y1: HEAD_S }], [true, false]);
  wall('W_south_rc_b', 'x', 5.982, 8.898, 10.376, 10.54, { A: MAT.TL, B: MAT.EX, ends: MAT.EX },
       [{ a0: 6.617, a1: 7.467, y0: SILL_S, y1: HEAD_S }]);
  // 臥室三南牆（對陽台，連續無開口）
  wall('W_bed2_south', 'x', 0.036, 3.056, 8.26, 8.424, { A: MAT.PL, B: MAT.EX, ends: MAT.EX }, [], [true, false]);
  // 廚房西牆（對陽台）：陽台門 8.912–9.73
  wall('W_kitchen_west', 'z', 8.26, 10.54, 3.056, 3.219, { A: MAT.EX, B: MAT.PL, ends: MAT.EX },
       [{ a0: 8.912, a1: 9.73, y0: 0, y1: DOOR_H }], [false, true]);
  // 陽台西牆（SW 柱下方那段黑牆）
  wall('W_balcony_west', 'z', 9.399, 10.571, -0.109, 0.055, { A: MAT.EX, B: MAT.EX });

  /* ---- 陽台女兒牆：x 0.055–1.479 是 AC 百葉，1.479–3.056 是實牆 ---- */
  {
    const z0 = 9.987, z1 = 10.219;
    boxS(1.479, 0, z0, 3.056, PARAPET_H, z1, MAT.EX, MAT.EX); collide(1.479, z0, 3.056, z1, PARAPET_H);
    boxS(1.479 - 0.005, PARAPET_H - 0.005, z0 - 0.01, 3.056, PARAPET_H + 0.03, z1 + 0.01, MAT.STN);     // 壓頂
    // 百葉段：矮踢 + 鋁百葉片 + 兩端立柱 + 上橫料
    boxS(0.055, 0, z0, 1.479, 0.12, z1, MAT.EX, MAT.EX); collide(0.055, z0, 1.479, z1, PARAPET_H);
    const zc = (z0 + z1) / 2;
    boxS(0.055, 0.12, zc - 0.03, 0.105, PARAPET_H + 0.03, zc + 0.03, MAT.AL);
    boxS(1.429, 0.12, zc - 0.03, 1.479, PARAPET_H + 0.03, zc + 0.03, MAT.AL);
    boxS(0.055, PARAPET_H, zc - 0.05, 1.479, PARAPET_H + 0.03, zc + 0.05, MAT.AL);
    for(let y = 0.18; y < PARAPET_H - 0.02; y += 0.075) boxS(0.105, y, zc - 0.045, 1.429, y + 0.018, zc + 0.045, MAT.AL);
    archWalls.push({ id: 'W_balcony_parapet', axis: 'x', a: 0.055, b: 3.056, c0: z0, c1: z1, holes: [] });
  }

  /* ============================================================
     6. 室內隔間（斜線牆 0.12–0.15）與浴室磁磚牆
     ============================================================ */
  const PLPL = { A: MAT.PL, B: MAT.PL };
  wall('P_mbr_east',   'z', 0,     3.149, 2.841, 2.964, PLPL, [], [true, true]);      // 主臥／臥室二
  wall('P_brN_east',   'z', 0,     3.149, 5.437, 5.574, PLPL, [], [true, true]);      // 臥室二／客廳
  wall('P_brN_south',  'x', 2.964, 4.497, 2.999, 3.149, PLPL, [], [true, true]);      // 臥室二南牆（4.497–5.437 是門洞）
  wall('P_stub',       'x', 4.125, 4.850, 4.090, 4.240, PLPL, [], [true, true]);      // 前室門邊的短牆
  wall('P_corridor_L', 'z', 4.240, 7.325, 4.700, 4.850, PLPL, [], [true, true]);      // L 牆（7.325–8.26 是臥室三門洞）
  wall('P_nook_south', 'x', 3.214, 4.700, 6.289, 6.426, PLPL, [], [true, true]);      // 前室／臥室三
  wall('P_bath_se',    'z', 5.888, 6.289, 3.214, 3.364, PLPL, [], [true, true]);      // 主浴東南角往下那一小段
  wall('P_kitchen_north','x', 3.219, 5.072, 8.26, 8.424, PLPL, [], [true, true]);     // 廚房北牆（5.072–5.982 是拉門洞）
  // 主浴廁（磁磚牆）：北、南連續；東牆有門 4.921–5.723
  wall('T_mbath_north', 'x', 0, 3.364, 4.095, 4.245, { A: MAT.PL, B: MAT.TL }, [], [true, false]);
  wall('T_mbath_south', 'x', 0, 3.364, 5.738, 5.888, { A: MAT.TL, B: MAT.PL }, [], [false, true]);
  wall('T_mbath_east',  'z', 4.245, 5.738, 3.214, 3.364, { A: MAT.TL, B: MAT.PL },
       [{ a0: 4.921, a1: 5.723, y0: 0, y1: DOOR_H }], [false, true]);
  // 次浴廁（磁磚牆）：西牆連續；北牆有門 6.808–7.587，頂到 SE 柱
  wall('T_bath2_west',  'z', 8.26, 10.376, 5.982, 6.132, { A: MAT.PL, B: MAT.TL }, [], [true, false]);
  wall('T_bath2_north', 'x', 6.132, 7.736, 8.26, 8.41, { A: MAT.PL, B: MAT.TL },
       [{ a0: 6.808, a1: 7.587, y0: 0, y1: DOOR_H }], [true, false]);
  // 管道間（磁磚包住的 X 框，滿高、封閉）
  const shaft = (id, x0, z0, x1, z1) => { boxS(x0, 0, z0, x1, H, z1, MAT.TL, MAT.TOP); collide(x0, z0, x1, z1); archWalls.push({ id, box: [x0, z0, x1, z1] }); };
  shaft('T_mbath_shaft', 0.763, 4.245, 1.696, 4.587);
  shaft('T_bath2_duct',  6.132, 9.699, 6.617, 10.376);

  /* ============================================================
     7. 淋浴玻璃隔屏（固定片）＋ 浴缸旁的薄片（規格書低信心：玻璃或矮緣，這裡做成玻璃）
     ============================================================ */
  function glassScreen(id, x0, z0, x1, z1, h = SCREEN_H){
    boxS(x0, FLOOR_TOP, z0, x1, h, z1, MAT.GLS); collide(x0, z0, x1, z1, h);
    // 頂端一支細鋁料，讓玻璃有邊
    const dx = x1 - x0 > z1 - z0;
    if(dx) boxS(x0, h, (z0 + z1) / 2 - 0.012, x1, h + 0.02, (z0 + z1) / 2 + 0.012, MAT.AL);
    else   boxS((x0 + x1) / 2 - 0.012, h, z0, (x0 + x1) / 2 + 0.012, h + 0.02, z1, MAT.AL);
    archWalls.push({ id, axis: dx ? 'x' : 'z', a: dx ? x0 : z0, b: dx ? x1 : z1, c0: dx ? z0 : x0, c1: dx ? z1 : x1, holes: [], glass: true });
  }
  glassScreen('G_mbath_shower_fixed', 1.687, 4.587, 1.695, 5.090);   // 主浴淋浴間固定片（門在 5.09–5.725）
  glassScreen('G_mbath_tub_divider',  0.758, 4.587, 0.766, 5.738);   // 浴缸／淋浴間之間
  glassScreen('G_bath2_shower_fixed', 8.020, 9.814, 8.028, 10.376);  // 次浴固定片（門在 9.179–9.814）

  /* ============================================================
     8. 門：門框 + 門片。只有平面圖有畫門（大門、陽台門、兩浴室門框、兩淋浴門）＋
        屋主決定加門的五個開口（主臥、臥室二、前室、臥室三 = 內開推門；廚房 = 拉門）
     ============================================================ */
  const JAMB = 0.04, ARCH = 0.055, ARCH_T = 0.012;
  const doorList = [];
  /** 門框襯板（填滿洞口三邊）＋ 兩面的門框線板 */
  function lining(axis, a0, a1, c0, c1, h, m, jamb = JAMB, arch = ARCH){
    const B = (s, e, y0, y1, q0, q1, mm) => axis === 'x' ? boxS(s, y0, q0, e, y1, q1, mm) : boxS(q0, y0, s, q1, y1, e, mm);
    B(a0, a0 + jamb, 0, h, c0, c1, m); B(a1 - jamb, a1, 0, h, c0, c1, m); B(a0, a1, h - jamb, h, c0, c1, m);
    if(arch > 0){
      for(const [q0, q1] of [[c0 - ARCH_T, c0 + 0.002], [c1 - 0.002, c1 + ARCH_T]]){
        B(a0 - arch, a0, FLOOR_TOP - 0.005, h + arch, q0, q1, m); B(a1, a1 + arch, FLOOR_TOP - 0.005, h + arch, q0, q1, m);
        B(a0 - arch, a1 + arch, h, h + arch, q0, q1, m);
      }
    }
  }
  /** 平板門片：局部原點在鉸鏈邊、往 +x 伸出 w、厚 t、高 h；含一道細溝與把手 */
  function slabLeaf(w, h, t, mat, handleMat, opts = {}){
    const g = new THREE.Group();
    const mesh = (bw, bh, bd, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    mesh(w, h, t, mat, w / 2, h / 2, 0);
    if(opts.groove !== false){   // 距自由邊 0.14 m 的一道直溝（用略深、略凸的細條表示）
      const gm = new THREE.MeshStandardMaterial({ color: 0xb69a70, roughness: .7 });
      for(const s of [-1, 1]) mesh(0.008, h - 0.3, 0.002, gm, w - 0.14, h / 2, s * (t / 2 + 0.001));
    }
    if(opts.handle !== false){   // 水平把手（lever）＋圓座，兩面都有，離自由邊 6 cm、高 1.0 m
      for(const s of [-1, 1]){
        const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.01, 20), handleMat);
        rose.rotation.x = Math.PI / 2; rose.position.set(w - 0.07, 1.0, s * (t / 2 + 0.005)); g.add(rose);
        mesh(0.12, 0.018, 0.02, handleMat, w - 0.07 - 0.045, 1.0, s * (t / 2 + 0.04));          // 桿（往門中央伸）
        mesh(0.02, 0.018, 0.045, handleMat, w - 0.07, 1.0, s * (t / 2 + 0.025));                // 頸
      }
    }
    if(opts.panels){             // 大門：三道水平凹線
      const gm = new THREE.MeshStandardMaterial({ color: 0x3e2f24, roughness: .6 });
      for(const y of [0.55, 1.35, 1.75]) for(const s of [-1, 1]) mesh(w - 0.24, 0.012, 0.002, gm, w / 2, y, s * (t / 2 + 0.001));
    }
    return g;
  }
  /**
   * 推門（鉸鏈門）。axis='x'：門洞沿 X（a0..a1），牆體佔 Z c0..c1；axis='z' 反之。
   * hinge 'lo'|'hi'：鉸鏈在 a0 或 a1 那一側；into '+'|'-'：門往 c1 側或 c0 側開；open＝開幾度（0＝關）
   */
  function swingDoor(o){
    const { id, axis, a0, a1, c0, c1, h, hinge, into, open, rooms, mat = MAT.OAK, handleMat = MAT.BLK, frameMat, type = 'swing' } = o;
    lining(axis, a0, a1, c0, c1, h, frameMat || mat, JAMB, o.arch ?? ARCH);
    const t = o.t || 0.04;
    const lw = (a1 - a0) - 2 * JAMB - 0.008, lh = h - JAMB - 0.01;
    const ha = hinge === 'lo' ? a0 + JAMB : a1 - JAMB;
    const cd = into === '+' ? c1 - 0.005 - t / 2 : c0 + 0.005 + t / 2;
    const dir0 = hinge === 'lo' ? 1 : -1, side = into === '+' ? 1 : -1;
    const th = THREE.MathUtils.degToRad(open);
    // 關門方向 d0（沿軸）、開門方向 p（往房間）；開 θ 度 = cosθ·d0 + sinθ·p
    let dx, dz, hx, hz;
    if(axis === 'x'){ dx = Math.cos(th) * dir0; dz = Math.sin(th) * side; hx = ha; hz = cd; }
    else            { dz = Math.cos(th) * dir0; dx = Math.sin(th) * side; hz = ha; hx = cd; }
    const leaf = o.leaf ? o.leaf(lw, lh, t) : slabLeaf(lw, lh, t, mat, handleMat, o.leafOpts);
    leaf.position.set(hx, FLOOR_TOP + 0.01, hz);
    leaf.rotation.y = Math.atan2(-dz, dx);
    leaf.name = 'door_' + id;
    scene.add(leaf);
    const col = addCollider(leaf, { pad: 0.0 });
    const rec = { id, type, axis, at: (a0 + a1) / 2, at0: a0, at1: a1, w: a1 - a0, fixed: (c0 + c1) / 2, c0, c1, h, rooms,
                  leafWidth: lw, openAngle: open, hinge: [hx, hz], hingeSide: o.hingeSide, into: o.intoRoom,
                  swing: { type, hinge: [hx, hz], leafWidth: lw, openAngle: open, into: o.intoRoom, dir: [dx, dz] },
                  leaf, collider: col };
    ctx.doors.push(rec); doorList.push(rec);
    return rec;
  }
  /** 拉門：吊在 side 面外側的上軌上；parkEdge＝停放時前緣（往 toward 方向）的座標 */
  function slidingDoor(o){
    const { id, axis, a0, a1, c0, c1, h, side, toward, parkEdge, rooms, glass } = o;
    lining(axis, a0, a1, c0, c1, h, MAT.OAK, 0.03, 0);
    const lw = (a1 - a0) + 0.05, t = 0.035, gap = 0.02;
    const face = side === '+' ? c1 : c0, s = side === '+' ? 1 : -1;
    const q0 = Math.min(face + s * gap, face + s * (gap + t)), q1 = Math.max(face + s * gap, face + s * (gap + t));
    const p0 = toward === '+' ? parkEdge - lw : parkEdge, p1 = p0 + lw;          // 停放位置
    const B = (sa, ea, y0, y1, qa, qb, m) => axis === 'x' ? boxS(sa, y0, qa, ea, y1, qb, m) : boxS(qa, y0, sa, qb, y1, ea, m);
    // 上軌（深色鋁）：從門洞到停放處
    const t0 = Math.min(a0, p0) - 0.03, t1 = Math.max(a1, p1) + 0.03;
    B(t0, t1, h + 0.01, h + 0.06, Math.min(face, face + s * 0.07), Math.max(face, face + s * 0.07), MAT.ALD);
    // 門片（獨立 Group，方便家具組要的話再動）
    const g = new THREE.Group();
    const mesh = (bw, bh, bd, m, x, y, z) => { const ob = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), m); ob.position.set(x, y, z); ob.castShadow = ob.receiveShadow = true; g.add(ob); return ob; };
    const lh = h - 0.03, yb = FLOOR_TOP + 0.02;
    if(glass){   // 橡木框 + 霧玻璃（廚房拉門）
      const st = 0.07, rt = 0.09, rb = 0.16;
      mesh(st, lh, t, MAT.OAK, st / 2, lh / 2, 0); mesh(st, lh, t, MAT.OAK, lw - st / 2, lh / 2, 0);
      mesh(lw - 2 * st, rt, t, MAT.OAK, lw / 2, lh - rt / 2, 0); mesh(lw - 2 * st, rb, t, MAT.OAK, lw / 2, rb / 2, 0);
      mesh(lw - 2 * st, lh - rt - rb, 0.006, MAT.GLF, lw / 2, rb + (lh - rt - rb) / 2, 0);
      mesh(lw - 2 * st, 0.03, t, MAT.OAK, lw / 2, lh * 0.62, 0);   // 中橫料
    }else{       // 實木平板（次浴拉門）
      mesh(lw, lh, t, MAT.OAK, lw / 2, lh / 2, 0);
    }
    // 埋入式拉手（霧黑）：靠前緣
    const lead = toward === '+' ? 0.09 : lw - 0.09;
    for(const sg of [-1, 1]) mesh(0.025, 0.14, 0.004, MAT.BLK, lead, 1.05, sg * (t / 2 + 0.002));
    // 擺到世界座標：局部 +x 沿軸
    if(axis === 'x'){ g.position.set(p0, yb, (q0 + q1) / 2); }
    else { g.position.set((q0 + q1) / 2, yb, p0); g.rotation.y = -Math.PI / 2; }
    g.name = 'door_' + id; scene.add(g);
    const col = addCollider(g);
    const clear = toward === '+' ? Math.max(0, p0 - a0) : Math.max(0, a1 - p1);
    const rec = { id, type: 'sliding', axis, at: (a0 + a1) / 2, at0: a0, at1: a1, w: a1 - a0, fixed: (c0 + c1) / 2, c0, c1, h, rooms,
                  leafWidth: lw, openAngle: 0, hinge: null, into: o.intoRoom, hangSide: side, slideToward: toward,
                  parked: [p0, p1], clearWidth: clear,
                  swing: { type: 'sliding', hinge: null, leafWidth: lw, openAngle: 0, into: o.intoRoom, parked: [p0, p1], hangSide: side },
                  leaf: g, collider: col };
    ctx.doors.push(rec); doorList.push(rec);
    return rec;
  }
  /** 淋浴間玻璃旋轉門：無框清玻璃 + 上下鉸鏈塊 + 直桿把手；開 open 度 */
  function pivotGlass(o){
    const { id, a0, a1, c, hinge, into, open, rooms } = o;   // 都在 X = c 的平面上，沿 Z
    const lw = a1 - a0 - 0.012, lh = SCREEN_H - FLOOR_TOP;
    const g = new THREE.Group();
    const mesh = (bw, bh, bd, m, x, y, z) => { const ob = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), m); ob.position.set(x, y, z); ob.castShadow = false; ob.receiveShadow = true; g.add(ob); return ob; };
    mesh(lw, lh - 0.02, 0.008, MAT.GLS, lw / 2, lh / 2, 0);
    mesh(0.05, 0.06, 0.03, MAT.STL, 0.03, lh - 0.04, 0); mesh(0.05, 0.06, 0.03, MAT.STL, 0.03, 0.04, 0);   // 鉸鏈塊
    for(const s of [-1, 1]) mesh(0.018, 0.30, 0.018, MAT.STL, lw - 0.07, 1.05, s * 0.03);              // 直桿把手
    mesh(0.03, 0.018, 0.07, MAT.STL, lw - 0.07, 1.19, 0); mesh(0.03, 0.018, 0.07, MAT.STL, lw - 0.07, 0.91, 0);
    const ha = hinge === 'lo' ? a0 + 0.006 : a1 - 0.006, dir0 = hinge === 'lo' ? 1 : -1, side = into === '+' ? 1 : -1;
    const th = THREE.MathUtils.degToRad(open);
    const dz = Math.cos(th) * dir0, dx = Math.sin(th) * side;
    g.position.set(c, FLOOR_TOP + 0.01, ha); g.rotation.y = Math.atan2(-dz, dx); g.name = 'door_' + id;
    scene.add(g);
    const col = addCollider(g);
    const rec = { id, type: 'shower', axis: 'z', at: (a0 + a1) / 2, at0: a0, at1: a1, w: a1 - a0, fixed: c, c0: c - 0.004, c1: c + 0.004, h: SCREEN_H, rooms,
                  leafWidth: lw, openAngle: open, hinge: [c, ha], into: o.intoRoom,
                  swing: { type: 'shower', hinge: [c, ha], leafWidth: lw, openAngle: open, into: o.intoRoom, dir: [dx, dz] }, leaf: g, collider: col };
    ctx.doors.push(rec); doorList.push(rec);
    return rec;
  }
  /** 陽台鋁門片：鋁框 + 上清玻／下霧玻，局部座標同 slabLeaf */
  function alLeaf(w, h, t){
    const g = new THREE.Group();
    const mesh = (bw, bh, bd, m, x, y, z) => { const ob = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), m); ob.position.set(x, y, z); ob.castShadow = !m.transparent; ob.receiveShadow = true; g.add(ob); return ob; };
    const st = 0.075, rt = 0.09, rb = 0.22, rm = 0.06, ym = 0.95;
    mesh(st, h, t, MAT.AL, st / 2, h / 2, 0); mesh(st, h, t, MAT.AL, w - st / 2, h / 2, 0);
    mesh(w - 2 * st, rt, t, MAT.AL, w / 2, h - rt / 2, 0); mesh(w - 2 * st, rb, t, MAT.AL, w / 2, rb / 2, 0);
    mesh(w - 2 * st, rm, t, MAT.AL, w / 2, ym, 0);
    mesh(w - 2 * st, ym - rm / 2 - rb, 0.006, MAT.GLF, w / 2, rb + (ym - rm / 2 - rb) / 2, 0);   // 下：霧玻
    mesh(w - 2 * st, h - rt - (ym + rm / 2), 0.006, MAT.GL, w / 2, ym + rm / 2 + (h - rt - (ym + rm / 2)) / 2, 0); // 上：清玻
    for(const s of [-1, 1]){ mesh(0.11, 0.02, 0.02, MAT.STL, w - 0.10, 1.0, s * (t / 2 + 0.035)); mesh(0.02, 0.02, 0.04, MAT.STL, w - 0.065, 1.0, s * (t / 2 + 0.02)); }
    return g;
  }

  // 大門：東牆，鉸鏈南、向內（西）開；做成關著、橡木（比室內門深一點）＋髮絲鋼把手；門框深灰鋼
  swingDoor({ id: 'D_ENTRANCE', type: 'entrance', axis: 'z', a0: 7.056, a1: 8.124, c0: 8.976, c1: 9.126, h: ENTRY_H,
              hinge: 'hi', hingeSide: 'south', into: '-', intoRoom: '餐廳', open: 0, rooms: ['餐廳', '室外'],
              mat: MAT.OAKD, handleMat: MAT.STL, frameMat: MAT.ALD, t: 0.05, leafOpts: { groove: false, panels: true } });
  // 陽台門：廚房西牆，鉸鏈南、往陽台（西）開 90°，鋁框玻璃門
  swingDoor({ id: 'D_BALCONY', type: 'swing', axis: 'z', a0: 8.912, a1: 9.73, c0: 3.056, c1: 3.219, h: DOOR_H,
              hinge: 'hi', hingeSide: 'south', into: '-', intoRoom: '陽台', open: 90, rooms: ['廚房', '陽台'],
              frameMat: MAT.AL, arch: 0.03, t: 0.045, leaf: alLeaf });
  // 主臥室門：在 P_mbr_east 牆線上（洞 = 牆端到主浴北牆面 3.149–4.095）；鉸鏈南、往房內（西）開，門片貼在房間南牆上
  swingDoor({ id: 'O_MBR', axis: 'z', a0: 3.149, a1: 4.095, c0: 2.841, c1: 2.964, h: DOOR_H,
              hinge: 'hi', hingeSide: 'south', into: '-', intoRoom: '主臥室', open: 90, rooms: ['走道', '主臥室'] });
  // 臥室二門：南牆洞 4.497–5.437；鉸鏈東、往房內（北）開，門片貼在房間東牆上
  swingDoor({ id: 'O_BRN', axis: 'x', a0: 4.497, a1: 5.437, c0: 2.999, c1: 3.149, h: DOOR_H,
              hinge: 'hi', hingeSide: 'east', into: '-', intoRoom: '臥室二', open: 90, rooms: ['走道', '臥室二'] });
  // 前室門：短牆線上的洞 3.364–4.125；鉸鏈西、往前室（南）開，門片貼在主浴東牆外側（門片尖端離主浴門洞還有 3 cm）
  swingDoor({ id: 'O_ANTE', axis: 'x', a0: 3.364, a1: 4.125, c0: 4.090, c1: 4.240, h: DOOR_H,
              hinge: 'lo', hingeSide: 'west', into: '+', intoRoom: '前室', open: 90, rooms: ['走道', '前室'] });
  // 主浴廁門：東牆洞 4.921–5.723；圖上只有門框沒畫弧 → 做成鉸鏈南、往浴室內（西）開 90°，貼在浴室南牆上
  swingDoor({ id: 'D_MBATH', axis: 'z', a0: 4.921, a1: 5.723, c0: 3.214, c1: 3.364, h: DOOR_H,
              hinge: 'hi', hingeSide: 'south', into: '-', intoRoom: '主浴廁', open: 90, rooms: ['前室', '主浴廁'] });
  // 臥室三門：L 牆下端與廚房牆之間 7.325–8.26；鉸鏈南、往房內（西）開，門片貼在房間南牆（RC）上
  swingDoor({ id: 'O_BR2', axis: 'z', a0: 7.325, a1: 8.26, c0: 4.700, c1: 4.850, h: DOOR_H,
              hinge: 'hi', hingeSide: 'south', into: '-', intoRoom: '臥室三', open: 90, rooms: ['餐廳', '臥室三'] });
  // 廚房拉門：洞 5.072–5.982；橡木框霧玻璃單片拉門，吊在餐廳側，往東滑開（停在次浴門框前 6.79）
  slidingDoor({ id: 'O_KITCHEN', axis: 'x', a0: 5.072, a1: 5.982, c0: 8.26, c1: 8.424, h: DOOR_H,
                side: '-', toward: '+', parkEdge: 6.79, intoRoom: '廚房', rooms: ['餐廳', '廚房'], glass: true });
  // 次浴廁門：北牆洞 6.808–7.587；圖上只有門框沒畫弧 → 做成橡木拉門，吊在玄關側、往東滑到 SE 柱前（全開）
  slidingDoor({ id: 'D_BATH2', axis: 'x', a0: 6.808, a1: 7.587, c0: 8.26, c1: 8.41, h: DOOR_H,
                side: '-', toward: '+', parkEdge: 7.587 + 0.83, intoRoom: '次浴廁', rooms: ['餐廳', '次浴廁'], glass: false });
  // 淋浴玻璃門：主浴（隔屏南端，鉸鏈南，向東開）、次浴（隔屏北端，鉸鏈在柱面，向西開）；都做成半開 40°
  pivotGlass({ id: 'D_MBATH_SHOWER', a0: 5.090, a1: 5.738, c: 1.691, hinge: 'hi', into: '+', open: 40, intoRoom: '主浴廁', rooms: ['主浴廁', '淋浴間'] });
  pivotGlass({ id: 'D_BATH2_SHOWER', a0: 9.179, a1: 9.814, c: 8.024, hinge: 'lo', into: '-', open: 40, intoRoom: '次浴廁', rooms: ['次浴廁', '淋浴間'] });

  /* ============================================================
     9. 南牆兩扇鋁製橫拉窗（型式圖上沒畫：假設橫拉窗）
     ============================================================ */
  function slidingWindow(id, room, x0, x1, z0, z1, y0, y1){
    const d0 = z0 + 0.04, d1 = z1 - 0.04, f = 0.05;
    boxS(x0, y0, d0, x1, y0 + f, d1, MAT.AL); boxS(x0, y1 - f, d0, x1, y1, d1, MAT.AL);
    boxS(x0, y0, d0, x0 + f, y1, d1, MAT.AL); boxS(x1 - f, y0, d0, x1, y1, d1, MAT.AL);
    const xm = (x0 + x1) / 2;
    boxS(xm - 0.02, y0 + f, d0 + 0.005, xm + 0.02, y1 - f, d1 - 0.005, MAT.AL);            // 中梃（兩扇交接）
    boxS(x0 + f, y0 + f, z1 - 0.08, xm + 0.02, y1 - f, z1 - 0.074, MAT.GL);                 // 外扇
    boxS(xm - 0.02, y0 + f, z1 - 0.115, x1 - f, y1 - f, z1 - 0.109, MAT.GL);                // 內扇
    boxS(x0 - 0.02, y0 - 0.02, z0 - 0.045, x1 + 0.02, y0 + 0.01, z0 + 0.03, MAT.STN);       // 室內窗台板
    ctx.windows.push({ id, axis: 'x', at: xm, at0: x0, at1: x1, w: x1 - x0, y0, y1, fixed: (z0 + z1) / 2, c0: z0, c1: z1, room, type: 'sliding', hinge: null, normal: [0, 1] });
  }
  slidingWindow('WIN_KITCHEN_S', '廚房', 4.984, 5.812, 10.376, 10.54, SILL_S, HEAD_S);
  slidingWindow('WIN_BATH2_S',   '次浴廁', 6.617, 7.467, 10.376, 10.54, SILL_S, HEAD_S);

  /* ============================================================
     10. 天花板（走路模式可開關）、天空背景
     ============================================================ */
  flushBuckets(scene, 'arch-static');
  {
    const roof = new THREE.Group(); roof.name = 'roof';
    const rf = { px: MAT.EX, nx: MAT.EX, pz: MAT.EX, nz: MAT.EX, py: MAT.EX, ny: MAT.CEIL };
    boxF(-0.15, H, -0.15, 9.126, H + 0.12, 8.26, rf);      // 北半（含客餐廳、臥室、走道）
    boxF(3.056, H, 8.26, 9.126, H + 0.12, 10.54, rf);      // 廚房＋次浴
    boxF(-0.15, H, 8.26, 3.056, H + 0.12, 10.219, rf);     // 陽台（到女兒牆外緣）
    flushBuckets(roof, 'roof');
    scene.add(roof); ctx.roof = roof;
  }
  {
    // 天空／背景圓頂：讓窗外亮亮的、俯瞰時是米白背景；顏色跟著時間滑桿（ctx.time）變
    const geo = new THREE.SphereGeometry(90, LOW ? 20 : 32, LOW ? 10 : 16);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false });
    const sky = new THREE.Mesh(geo, mat); sky.renderOrder = -10; sky.frustumCulled = false; sky.name = 'sky';
    scene.add(sky); ctx.sky = sky;
    const DAY = { top: new THREE.Color(0xa9c6df), hor: new THREE.Color(0xf3efe6), gnd: new THREE.Color(0xdcd5c9) };
    const NIGHT = { top: new THREE.Color(0x0a1020), hor: new THREE.Color(0x1c2536), gnd: new THREE.Color(0x14171c) };
    const tmp = new THREE.Color(), a = new THREE.Color(), b = new THREE.Color();
    let last = -1;
    function paint(day){
      for(let i = 0; i < pos.count; i++){
        const y = pos.getY(i) / 90;
        if(y >= 0){ a.copy(DAY.hor).lerp(DAY.top, Math.pow(y, 0.6)); b.copy(NIGHT.hor).lerp(NIGHT.top, Math.pow(y, 0.6)); }
        else      { a.copy(DAY.hor).lerp(DAY.gnd, Math.min(1, -y * 3)); b.copy(NIGHT.hor).lerp(NIGHT.gnd, Math.min(1, -y * 3)); }
        tmp.copy(b).lerp(a, day); col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      }
      geo.attributes.color.needsUpdate = true;
    }
    const dayOf = h => Math.max(0, Math.min(1, Math.min(h - 5.5, 19 - h) / 1.5));   // 跟 lighting.js 同一條曲線
    ctx.tick.push(() => { const d = dayOf(ctx.time ?? 14); if(Math.abs(d - last) > 0.01){ last = d; paint(d); } });
    paint(dayOf(ctx.time ?? 14)); last = dayOf(ctx.time ?? 14);
  }

  /* ============================================================
     11. 登記給其他模組：範圍、設備位置、牆表
     ============================================================ */
  ctx.bounds = { x0: 0, z0: 0, x1: 8.976, z1: 10.376 };   // 可走的室內盒（含陽台在內）
  ctx.archWalls = archWalls;
  // 規格書的設備（公尺）：rect 已夾到實際牆面內；spec 是規格書原值
  const FX = [
    ['F_tub',            '主浴廁', 'bathtub',            [0.069, 4.293, 0.700, 5.755]],
    ['F_mbath_shower',   '主浴廁', 'shower_stall',       [0.770, 4.587, 1.687, 5.740]],
    ['F_mbath_toilet',   '主浴廁', 'toilet',             [1.880, 4.242, 2.281, 4.967]],
    ['F_mbath_vanity',   '主浴廁', 'vanity_counter',     [2.449, 4.249, 3.213, 4.706]],
    ['F_mbath_shaft',    '主浴廁', 'pipe_shaft',         [0.763, 4.245, 1.696, 4.587]],
    ['F_bath2_vanity',   '次浴廁', 'vanity_counter',     [6.170, 8.649, 6.613, 9.457]],
    ['F_bath2_toilet',   '次浴廁', 'toilet',             [6.874, 9.696, 7.277, 10.393]],
    ['F_bath2_shower',   '次浴廁', 'shower_stall',       [8.024, 9.169, 8.915, 10.454]],
    ['F_bath2_duct',     '次浴廁', 'duct_shaft',         [6.132, 9.699, 6.617, 10.376]],
    ['F_kitchen_counter','廚房',   'kitchen_counter',    [3.313, 9.900, 5.856, 10.386]],
    ['F_kitchen_sink',   '廚房',   'sink',               [5.038, 9.909, 5.803, 10.321]],
    ['F_kitchen_hob',    '廚房',   'cooktop_assumed',    [3.379, 9.914, 3.975, 10.308]],
    ['F_kitchen_cabinet','廚房',   'tall_cabinet',       [3.211, 8.442, 3.999, 8.881]],
    ['F_kitchen_fridge', '廚房',   'fridge_space',       [4.065, 8.435, 4.776, 9.097]],
    ['F_washer',         '陽台',   'washing_machine',    [0.025, 8.431, 0.798, 9.201]],
    ['F_laundry_sink',   '陽台',   'laundry_sink',       [0.887, 8.450, 1.419, 8.870]],
    ['F_ac_unit',        '陽台',   'ac_outdoor_unit',    [0.302, 9.684, 1.231, 10.041]],
    ['F_DD_box',         '餐廳',   'electrical_panel',   [8.337, 6.168, 8.966, 6.784]],
  ];
  ctx.fixtures = FX.map(([id, room, kind, spec]) => {
    const rects = R[room] ? R[room].rects : null;
    let rect = [...spec];
    if(rects){   // 夾進該房間的外框（規格書量到牆線上會差 1–2 cm）
      const b = rects.reduce((a, q) => [Math.min(a[0], q[0]), Math.min(a[1], q[1]), Math.max(a[2], q[2]), Math.max(a[3], q[3])], [1e9, 1e9, -1e9, -1e9]);
      rect = [Math.max(spec[0], b[0]), Math.max(spec[1], b[1]), Math.min(spec[2], b[2]), Math.min(spec[3], b[3])];
    }
    return { id, room, kind, rect, spec, built: /shaft|duct/.test(kind) };
  });
}
