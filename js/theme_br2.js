/* ============================================================
   theme_br2.js — 臥室二主題房：「我賽博龐克家文藝復興音樂風」（屋主原話）
   全屋只有這一間刻意打破無印風：文藝復興的大理石、鍍金雕框、濕壁畫、管風琴 ×
   賽博龐克的霓虹、全像環、故障掃描線、合成器。

   配置全部由 ctx.R['臥室二'] 的房間矩形、ctx.doors 的 O_BRN、ctx.windows 推出來（⛔ 不寫死座標：牆還可能再移 1–5 cm）
     ・西牆：霓虹管風琴（管子跟著音樂像等化器一樣亮）＋琴凳；西北角：戴 VR 面罩的大理石胸像（慢慢轉、台座發光、全像環繞著轉）；
       西牆北段掛金框「合成器夕陽」（網格地面往前捲）；西南角：霓虹燭台
     ・東牆：單人床（床頭靠北窗下、床底打光像浮起來）；床上方掛橢圓金框：達文西多面體草圖＋浮在框前轉的 3D 霓虹線框
     ・天花板：喬托藍金星＋曼帖那式天窗欄杆的濕壁畫，故障掃描線從上面掃過；四周金色線板＋霓虹燈帶
     ・地板：黑大理石＋霓虹玫瑰窗與菱格（跟著鼓點脈動）；牆：深紫石榴錦緞壁紙＋漆黑護牆板＋金色腰線
     ・北牆窗上：霓虹拉丁字「MVSICA · VNIVERSALIS」（天體音樂）
     ・門片迴轉區（門往房內開 90°、貼東牆）與從門口往北的走道全部留空
   聲音（右上 🔊 打開才有；全部現場合成、沒有音檔）：16 世紀英格蘭民謠〈綠袖子〉（公有領域）→
     撥弦大鍵琴旋律＋合成器貝斯＋鋪底和弦＋鼓機，副歌加一條鋸齒波主奏；
     人在房裡最大聲、出門口越遠越小越悶、俯瞰時小聲
   規矩（見 lighting.js 檔頭）：建好後不增減物件與幾何；動的東西不投影；沒人看（走動模式離很遠）就不動、不 poke；
     燈只登記 2 盞（一盞淡紫吸頂 spot、一盞跟著音樂脈動的洋紅點光）；純假的光暈標 noPhoto；
     胸像、全像環與飄的音符標 noCut（俯瞰剖切時照樣完整：胸像只比切線高約 20 cm，音符像從房間飄出來）；
     效能（M4、1440×900 實測）：站在房裡 GPU 每格多約 1.0 ms、CPU 約 0.2 ms；看不到這間房時會動的整組直接藏起來
   ============================================================ */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';

export default async function buildTheme(ctx){
  const ROOM = '臥室二';
  const RM = ctx.R && ctx.R[ROOM];
  if(!RM) return;
  const { scene, camera } = ctx;
  const H = ctx.H || 3.25;
  const LOW = ctx.QUALITY === 'low';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  let seed = 919;                                     // 固定亂數種子：每次開都長一樣
  const rand = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  /* ============================================================
     0. 配置（全部從房間矩形／門／窗推）
     ============================================================ */
  const rects = RM.rects || [[RM.x0, RM.z0, RM.x1, RM.z1]];
  const [X0, Z0, X1, Z1] = rects.reduce((a, q) => [Math.min(a[0], q[0]), Math.min(a[1], q[1]), Math.max(a[2], q[2]), Math.max(a[3], q[3])], [1e9, 1e9, -1e9, -1e9]);
  const RW = X1 - X0, RD = Z1 - Z0, CXR = (X0 + X1) / 2, CZR = (Z0 + Z1) / 2;
  const FL = 0.051;                                   // 主題地板面：arch 的木地板 0.045 上再鋪 6 mm 黑大理石
  const door = (ctx.doors || []).find(d => d.id === 'O_BRN') || (ctx.doors || []).find(d => d.rooms && d.rooms.includes(ROOM));
  const dA0 = door ? door.at0 : X1 - 0.94, dA1 = door ? door.at1 : X1, dH = door ? door.h : 2.10;
  const ARCH = 0.06;                                  // arch.js 門框線板寬 5.5 cm（多留 5 mm）
  // 門片迴轉區（四分之一圓的外框）：鉸鏈點 ± 門片寬，沿「關門方向」與「開門方向」
  let keep = { x0: dA0, x1: dA1, z0: Z1 - (dA1 - dA0), z1: Z1 };
  if(door && door.swing && door.swing.hinge){
    const [hx, hz] = door.swing.hinge, lw = door.swing.leafWidth || door.leafWidth || 0.85;
    const od = door.swing.dir || [0, -1];
    const cd = door.axis === 'x' ? [Math.sign(door.at - hx) || -1, 0] : [0, Math.sign(door.at - hz) || -1];
    const xs = [hx, hx + lw * od[0], hx + lw * cd[0]], zs = [hz, hz + lw * od[1], hz + lw * cd[1]];
    keep = { x0: Math.min(...xs) - 0.05, x1: Math.max(...xs) + 0.05, z0: Math.min(...zs) - 0.05, z1: Math.max(...zs) + 0.05 };
  }
  const wins = (ctx.windows || []).filter(w => w.room === ROOM);
  const SILL = wins.length ? Math.min(...wins.map(w => w.y0)) : 0.90;
  const HEAD = wins.length ? Math.max(...wins.map(w => w.y1)) : 2.45;
  // 床：東牆、床頭朝北（靠窗下），床尾停在門片迴轉區前
  const BED_W = 0.985, bedX1 = X1 - 0.004, bedX0 = bedX1 - BED_W, bedXc = (bedX0 + bedX1) / 2;
  const bedZ0 = Z0 + 0.05, bedZ1 = Math.min(Z0 + 2.08, keep.z0 - 0.03);
  // 管風琴：西牆（面朝東），北端留給胸像、南端留給燭台
  const ORG_W = Math.min(1.36, RD - 1.55), ORG_KEY = 0.52;
  const orgZ0 = Z0 + 1.02, orgZ1 = orgZ0 + ORG_W, orgZc = (orgZ0 + orgZ1) / 2;
  // 胸像台座（西北角）、燭台（西南角）
  const bustX = X0 + 0.40, bustZ = Z0 + 0.50;
  const candX = X0 + 0.25, candZ = Math.min((orgZ1 + Z1) / 2 + 0.02, Z1 - 0.2);
  // 地板玫瑰窗：管風琴鍵盤與床之間那條走道的正中
  const roseX = (X0 + ORG_KEY + bedX0) / 2, roseZ = clamp(CZR, Z0 + 0.7, Z1 - 0.7);
  const roseR = clamp((bedX0 - X0 - ORG_KEY) / 2 - 0.04, 0.25, 0.46);
  const PED_TOP = FL + 0.885;                         // 胸像台座頂

  /* ============================================================
     1. 小工具
     ============================================================ */
  const ANISO = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy());
  const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const ctex = (cv, o = {}) => {
    const t = new THREE.CanvasTexture(cv);
    if(o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = o.aniso ?? ANISO;
    if(o.wrap){ t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return t;
  };
  const root = new THREE.Group(); root.name = 'theme_br2'; scene.add(root);
  const stat = new THREE.Group(); stat.name = 'br2-static'; root.add(stat);   // 靜態：最後依材質合併
  const dyn  = new THREE.Group(); dyn.name  = 'br2-anim';   root.add(dyn);    // 會動的：不合併、不投影
  const grp = (x, y, z, rotY = 0, parent = stat) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; parent.add(g); return g; };
  const M = (geo, mat, x = 0, y = 0, z = 0, parent = stat) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const A = (geo, mat, x = 0, y = 0, z = 0, parent = dyn) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = false; m.receiveShadow = false; m.userData.noBake = true; parent.add(m); return m; };
  const Bx = (w, h, d, mat, x, y, z, parent) => M(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  const SEG = LOW ? 16 : 28;
  // 霓虹配色：洋紅 ↔ 青，沿房間一圈漸變（線性色）；mixAt＝在這條漸層上的位置（0 洋紅 → 1 青）
  const C_MAG = new THREE.Color(0xff2bd0), C_CYAN = new THREE.Color(0x22e4ff), C_VIO = new THREE.Color(0x8b5cff), C_GOLD = new THREE.Color(0xffb84a);
  const mixAt = (x, z) => 0.5 + 0.5 * Math.sin(Math.atan2(z - CZR, x - CXR) + 0.6);
  const colorAt = (x, z, out = new THREE.Color()) => out.copy(C_MAG).lerp(C_CYAN, mixAt(x, z));
  /** 霓虹管的顏色寫進 UV（u＝漸層位置）；材質用一張洋紅→青的漸層貼圖。
      不用頂點色：📸 拍照模式把 MeshBasic 的 map 轉成發光貼圖，頂點色會被丟掉（霓虹管會變成白光）
      col：0–1 的漸層位置，或 (世界座標)=>位置 */
  const tint = (g, col) => {
    const p = g.attributes.position, uv = new Float32Array(p.count * 2), v = new THREE.Vector3();
    for(let i = 0; i < p.count; i++){ uv[i * 2] = typeof col === 'function' ? col(v.fromBufferAttribute(p, i)) : col; uv[i * 2 + 1] = 0.5; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  };
  const NEON_M = 0, NEON_C = 1;

  /* ============================================================
     2. 程式畫的貼圖
     ============================================================ */
  // 2a. 天花板濕壁畫：喬托藍金星 → 天窗（曼帖那式欄杆一圈）→ 天空＋雲＋光芒；外圈金色蛋箭紋框
  function cloud(c, x, y, R){
    for(let k = 0; k < 10; k++){
      const px = x + (rand() - 0.5) * R * 1.7, py = y + (rand() - 0.5) * R * 0.9, r = R * (0.32 + rand() * 0.45);
      const g = c.createRadialGradient(px - r * 0.25, py - r * 0.3, r * 0.05, px, py, r);
      g.addColorStop(0, 'rgba(255,255,255,.97)'); g.addColorStop(0.5, 'rgba(252,238,238,.72)');
      g.addColorStop(0.82, 'rgba(214,186,214,.32)'); g.addColorStop(1, 'rgba(200,176,214,0)');
      c.fillStyle = g; c.beginPath(); c.arc(px, py, r, 0, TAU); c.fill();
    }
  }
  function rosette(c, x, y, r){
    c.fillStyle = '#b8903f'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.fillStyle = '#f0cf78';
    for(let k = 0; k < 8; k++){ const a = k / 8 * TAU; c.beginPath(); c.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.38, r * 0.16, a, 0, TAU); c.fill(); }
    c.fillStyle = '#6d4f1c'; c.beginPath(); c.arc(x, y, r * 0.22, 0, TAU); c.fill();
  }
  function paintFresco(c, W, Hh){
    const s = W / 512, cx = W / 2, cy = Hh / 2, m = Math.min(W, Hh);
    const Ro = m * 0.43, Ri = Ro * 0.80;
    let g = c.createRadialGradient(cx, cy, Ro, cx, cy, Math.hypot(W, Hh) * 0.6);
    g.addColorStop(0, '#2c49ad'); g.addColorStop(1, '#162470');
    c.fillStyle = g; c.fillRect(0, 0, W, Hh);
    // 金星（斯克羅威尼禮拜堂那種藍底金星）
    const star = (x, y, r) => { c.beginPath(); for(let k = 0; k < 16; k++){ const a = k * Math.PI / 8, rr = k % 2 ? r * 0.36 : r; c.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); } c.closePath(); c.fill(); };
    c.fillStyle = '#efcb6e';
    const sp = 34 * s;
    for(let j = 0, y = sp * 0.6; y < Hh; y += sp * 0.866, j++) for(let x = (j % 2 ? sp / 2 : 0) + sp * 0.3; x < W; x += sp){
      if(Math.hypot(x - cx, y - cy) < Ro + 12 * s) continue;
      c.globalAlpha = 0.7 + 0.3 * rand(); star(x, y, (4.2 + rand() * 2) * s);
    }
    c.globalAlpha = 1;
    // 天窗裡的天空
    c.save(); c.beginPath(); c.arc(cx, cy, Ri, 0, TAU); c.clip();
    g = c.createRadialGradient(cx, cy, 0, cx, cy, Ri);
    g.addColorStop(0, '#fff8e4'); g.addColorStop(0.2, '#ffe6b4'); g.addColorStop(0.55, '#a9cdf0'); g.addColorStop(1, '#6a98d6');
    c.fillStyle = g; c.fillRect(cx - Ri, cy - Ri, Ri * 2, Ri * 2);
    for(let k = 0; k < 44; k++){ const a = k / 44 * TAU; c.fillStyle = k % 2 ? 'rgba(255,236,196,.12)' : 'rgba(255,250,232,.05)'; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, Ri, a, a + TAU / 88); c.closePath(); c.fill(); }
    for(let k = 0; k < 12; k++){ const a = k / 12 * TAU + rand() * 0.3, rr = Ri * (0.64 + rand() * 0.22); cloud(c, cx + rr * Math.cos(a), cy + rr * Math.sin(a), Ri * (0.19 + rand() * 0.09)); }
    for(let k = 0; k < 4; k++){ const a = rand() * TAU, rr = Ri * (0.25 + rand() * 0.2); cloud(c, cx + rr * Math.cos(a), cy + rr * Math.sin(a), Ri * 0.11); }
    c.restore();
    // 石欄杆（從下往上看：欄杆柱由外圈指向圓心）
    c.beginPath(); c.arc(cx, cy, Ro, 0, TAU); c.arc(cx, cy, Ri, 0, TAU, true); c.closePath();
    g = c.createRadialGradient(cx, cy, Ri, cx, cy, Ro); g.addColorStop(0, '#9fb6d8'); g.addColorStop(0.5, '#7f8fa8'); g.addColorStop(1, '#4d4a52');
    c.fillStyle = g; c.fill();
    const NB = 44;
    for(let k = 0; k < NB; k++){
      const a = k / NB * TAU, L = Ro - Ri, w = TAU * Ri / NB * 0.40;
      c.save(); c.translate(cx, cy); c.rotate(a); c.translate(Ri, 0);
      c.beginPath();
      c.moveTo(L, -w * 0.6); c.quadraticCurveTo(L * 0.62, -w * 1.3, L * 0.38, -w * 0.42); c.quadraticCurveTo(L * 0.18, -w * 0.28, 0, -w * 0.5);
      c.lineTo(0, w * 0.5); c.quadraticCurveTo(L * 0.18, w * 0.28, L * 0.38, w * 0.42); c.quadraticCurveTo(L * 0.62, w * 1.3, L, w * 0.6); c.closePath();
      const bg = c.createLinearGradient(0, -w, 0, w); bg.addColorStop(0, '#f4ead4'); bg.addColorStop(0.55, '#d2c4a4'); bg.addColorStop(1, '#8a7d64');
      c.fillStyle = bg; c.fill();
      c.restore();
    }
    c.lineWidth = 8 * s; c.strokeStyle = '#ece2c9'; c.beginPath(); c.arc(cx, cy, Ri + 3 * s, 0, TAU); c.stroke();
    c.lineWidth = 2 * s; c.strokeStyle = '#8c7b58'; c.beginPath(); c.arc(cx, cy, Ri - 1 * s, 0, TAU); c.stroke();
    c.lineWidth = 10 * s; c.strokeStyle = '#caa24e'; c.beginPath(); c.arc(cx, cy, Ro + 3 * s, 0, TAU); c.stroke();
    c.lineWidth = 2 * s; c.strokeStyle = '#5e4414'; c.beginPath(); c.arc(cx, cy, Ro + 9 * s, 0, TAU); c.stroke();
    // 外圈金框：蛋與箭
    const bw = 18 * s;
    const gg = (x0, y0, x1, y1) => { const q = c.createLinearGradient(x0, y0, x1, y1); q.addColorStop(0, '#6d4f1c'); q.addColorStop(0.35, '#ecc970'); q.addColorStop(0.62, '#b8903f'); q.addColorStop(1, '#5a3f14'); return q; };
    c.fillStyle = gg(0, 0, 0, bw); c.fillRect(0, 0, W, bw);
    c.fillStyle = gg(0, Hh, 0, Hh - bw); c.fillRect(0, Hh - bw, W, bw);
    c.fillStyle = gg(0, 0, bw, 0); c.fillRect(0, 0, bw, Hh);
    c.fillStyle = gg(W, 0, W - bw, 0); c.fillRect(W - bw, 0, bw, Hh);
    c.fillStyle = 'rgba(78,52,14,.55)';
    const egg = (x, y, hz) => { c.beginPath(); c.ellipse(x, y, (hz ? 4.4 : 2.6) * s, (hz ? 2.6 : 4.4) * s, 0, 0, TAU); c.fill(); };
    for(let x = bw + 6 * s; x < W - bw; x += 12 * s){ egg(x, bw * 0.55, true); egg(x, Hh - bw * 0.55, true); }
    for(let y = bw + 6 * s; y < Hh - bw; y += 12 * s){ egg(bw * 0.55, y, false); egg(W - bw * 0.55, y, false); }
    c.strokeStyle = '#f5dc92'; c.lineWidth = 1.5 * s; c.strokeRect(bw + 2 * s, bw + 2 * s, W - 2 * bw - 4 * s, Hh - 2 * bw - 4 * s);
    for(const [x, y] of [[bw * 2.2, bw * 2.2], [W - bw * 2.2, bw * 2.2], [bw * 2.2, Hh - bw * 2.2], [W - bw * 2.2, Hh - bw * 2.2]]) rosette(c, x, y, 16 * s);
  }
  const FW = LOW ? 512 : 1024, FH = Math.round(FW * RD / RW);
  const frescoCv = cnv(FW, FH); paintFresco(frescoCv.getContext('2d'), FW, FH);
  const frescoTex = ctex(frescoCv, { wrap: true });

  // 2b. 地板：黑大理石（底色）＋霓虹線（自發光貼圖）。畫布上＝北、左＝西
  const GW = LOW ? 512 : 1024, GH = Math.round(GW * RD / RW), PPM = GW / RW;
  const gx = x => (x - X0) * PPM, gz = z => (z - Z0) * PPM;
  function paintMarble(c, W, Hh){
    const k = W / 1024;
    c.fillStyle = '#0d0b12'; c.fillRect(0, 0, W, Hh);
    for(let i = 0; i < 70; i++){
      const x = rand() * W, y = rand() * Hh, r = (40 + rand() * 130) * k;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${38 + rand() * 22 | 0},${28 + rand() * 14 | 0},${52 + rand() * 26 | 0},.35)`); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    for(let i = 0; i < 26; i++){
      let x = rand() * W, y = rand() * Hh, a = rand() * TAU; const gold = i % 4 === 0;
      c.strokeStyle = gold ? `rgba(200,158,74,${0.14 + rand() * 0.16})` : `rgba(190,180,215,${0.04 + rand() * 0.08})`;
      c.lineWidth = (0.5 + rand() * (gold ? 0.9 : 1.6)) * k;
      c.beginPath(); c.moveTo(x, y);
      const n = 30 + rand() * 60 | 0;
      for(let q = 0; q < n; q++){ a += (rand() - 0.5) * 0.7; x += Math.cos(a) * 9 * k; y += Math.sin(a) * 9 * k; c.lineTo(x, y); }
      c.stroke();
    }
  }
  function paintFloorGlow(c, W, Hh){
    c.fillStyle = '#000'; c.fillRect(0, 0, W, Hh);
    const k = PPM, line = (x0, y0, x1, y1) => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
    // 斜向菱格（文藝復興宮殿地坪的格線，改成霓虹細線）
    c.strokeStyle = 'rgba(150,92,255,.55)'; c.lineWidth = Math.max(1, 0.005 * k);
    const S = 0.42 * k;
    for(let d = -Hh; d < W + Hh; d += S){ line(d, 0, d + Hh, Hh); line(d, 0, d - Hh, Hh); }
    // 外框雙線（離牆 12 cm）
    c.strokeStyle = 'rgba(40,230,255,.95)'; c.lineWidth = Math.max(1.3, 0.008 * k); c.strokeRect(0.12 * k, 0.12 * k, W - 0.24 * k, Hh - 0.24 * k);
    c.strokeStyle = 'rgba(40,230,255,.45)'; c.lineWidth = Math.max(1, 0.004 * k); c.strokeRect(0.16 * k, 0.16 * k, W - 0.32 * k, Hh - 0.32 * k);
    // 玫瑰窗（Cosmati 風：同心圓＋十二角星＋八瓣）
    const x = gx(roseX), y = gz(roseZ), R = roseR * k;
    c.fillStyle = '#000'; c.beginPath(); c.arc(x, y, R * 1.08, 0, TAU); c.fill();
    const ring = (r, col, w) => { c.strokeStyle = col; c.lineWidth = Math.max(1, w * k); c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); };
    ring(R, 'rgba(255,60,210,1)', 0.009); ring(R * 0.93, 'rgba(255,60,210,.6)', 0.004);
    c.strokeStyle = 'rgba(40,230,255,.95)'; c.lineWidth = Math.max(1, 0.005 * k); c.beginPath();
    for(let i = 0; i <= 12; i++){ const a = (i * 5 % 12) / 12 * TAU - Math.PI / 2; const px = x + Math.cos(a) * R * 0.9, py = y + Math.sin(a) * R * 0.9; i ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.stroke();
    ring(R * 0.44, 'rgba(255,60,210,.95)', 0.006);
    c.strokeStyle = 'rgba(40,230,255,.9)'; c.lineWidth = Math.max(1, 0.004 * k);
    for(let i = 0; i < 8; i++){ const a = i / 8 * TAU; c.beginPath(); c.ellipse(x + Math.cos(a) * R * 0.25, y + Math.sin(a) * R * 0.25, R * 0.17, R * 0.065, a, 0, TAU); c.stroke(); }
    c.fillStyle = 'rgba(255,200,120,1)'; c.beginPath(); c.arc(x, y, R * 0.05, 0, TAU); c.fill();
  }
  const marbleCv = cnv(GW, GH); paintMarble(marbleCv.getContext('2d'), GW, GH);
  const floorGlowCv = cnv(GW, GH); paintFloorGlow(floorGlowCv.getContext('2d'), GW, GH);
  const marbleTex = ctex(marbleCv), floorGlowTex = ctex(floorGlowCv);

  // 2c. 壁紙：深紫石榴錦緞（半錯位連續圖樣；一張 0.64 m）
  function paintDamask(c, S){
    c.fillStyle = '#1b1431'; c.fillRect(0, 0, S, S);
    for(let x = 0; x < S; x += 2){ c.fillStyle = `rgba(255,255,255,${0.012 + 0.01 * Math.sin(x * 0.7)})`; c.fillRect(x, 0, 1, S); }
    const motif = (ox, oy) => {
      const u = S / 2;
      c.save(); c.translate(ox, oy);
      // 尖拱菱格（ogee）
      c.strokeStyle = 'rgba(176,136,62,.34)'; c.lineWidth = S / 170;
      c.beginPath(); c.moveTo(0, -u); c.bezierCurveTo(u * 0.55, -u * 0.55, u * 0.2, -u * 0.1, u, 0); c.bezierCurveTo(u * 0.2, u * 0.1, u * 0.55, u * 0.55, 0, u);
      c.bezierCurveTo(-u * 0.55, u * 0.55, -u * 0.2, u * 0.1, -u, 0); c.bezierCurveTo(-u * 0.2, -u * 0.1, -u * 0.55, -u * 0.55, 0, -u); c.stroke();
      // 石榴
      c.fillStyle = '#251b45';
      c.beginPath(); c.ellipse(0, u * 0.06, u * 0.26, u * 0.30, 0, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(-u * 0.12, -u * 0.2); c.lineTo(-u * 0.07, -u * 0.36); c.lineTo(0, -u * 0.26); c.lineTo(u * 0.07, -u * 0.36); c.lineTo(u * 0.12, -u * 0.2); c.fill();
      for(const sd of [-1, 1]){ c.beginPath(); c.moveTo(0, u * 0.3); c.bezierCurveTo(sd * u * 0.5, u * 0.34, sd * u * 0.58, u * 0.02, sd * u * 0.44, -u * 0.2); c.bezierCurveTo(sd * u * 0.34, u * 0.08, sd * u * 0.2, u * 0.26, 0, u * 0.3); c.fill(); }
      c.strokeStyle = 'rgba(190,148,70,.5)'; c.lineWidth = S / 260;
      c.beginPath(); c.ellipse(0, u * 0.06, u * 0.26, u * 0.30, 0, 0, TAU); c.stroke();
      c.fillStyle = 'rgba(200,158,78,.32)';
      for(let i = 0; i < 9; i++){ const a = i / 9 * TAU; c.beginPath(); c.arc(Math.cos(a) * u * 0.12, u * 0.08 + Math.sin(a) * u * 0.14, S / 150, 0, TAU); c.fill(); }
      c.restore();
    };
    for(const [ox, oy] of [[S / 2, S / 2], [0, 0], [S, 0], [0, S], [S, S]]) motif(ox, oy);
  }
  const DS = LOW ? 256 : 512;
  const damaskCv = cnv(DS, DS); paintDamask(damaskCv.getContext('2d'), DS);
  const damaskTex = ctex(damaskCv, { wrap: true }); damaskTex.repeat.set(1 / 0.64, 1 / 0.64);

  // 2d. 床罩：紫絲絨＋金色花紋
  const duvetCv = cnv(256, 256);
  {
    const c = duvetCv.getContext('2d'), S = 256;
    c.fillStyle = '#3a1464'; c.fillRect(0, 0, S, S);
    for(let i = 0; i < 9000; i++){ const v = rand(); c.fillStyle = `rgba(${v > 0.5 ? '120,60,170' : '20,6,40'},.22)`; c.fillRect(rand() * S, rand() * S, 1, 1 + rand() * 2); }
    // 金色百合紋（fleur-de-lis）＋小點，半錯位排列
    const lily = (ox, oy, k) => {
      c.save(); c.translate(ox, oy); c.scale(k, k);
      c.fillStyle = 'rgba(226,176,84,.92)';
      c.beginPath(); c.moveTo(0, -30); c.bezierCurveTo(9, -18, 9, -4, 0, 6); c.bezierCurveTo(-9, -4, -9, -18, 0, -30); c.fill();
      for(const sd of [-1, 1]){ c.beginPath(); c.moveTo(sd * 3, 4); c.bezierCurveTo(sd * 16, 2, sd * 24, -14, sd * 14, -22); c.bezierCurveTo(sd * 16, -10, sd * 10, -2, sd * 2, 8); c.fill(); }
      c.fillRect(-11, 7, 22, 4);
      c.beginPath(); c.moveTo(-5, 11); c.lineTo(5, 11); c.lineTo(2, 22); c.lineTo(-2, 22); c.fill();
      c.restore();
    };
    for(const [ox, oy] of [[S / 2, S / 2], [0, 0], [S, 0], [0, S], [S, S]]) lily(ox, oy, 1.25);
    c.fillStyle = 'rgba(226,176,84,.7)';
    for(const [ox, oy] of [[S / 2, 0], [0, S / 2], [S, S / 2], [S / 2, S]]){ c.beginPath(); c.arc(ox, oy, 4, 0, TAU); c.fill(); }
  }
  const duvetTex = ctex(duvetCv, { wrap: true }); duvetTex.repeat.set(4, 4);

  // 2e. 霓虹招牌字（北牆窗上）
  const signCv = cnv(LOW ? 512 : 1024, LOW ? 64 : 128);
  {
    const c = signCv.getContext('2d'), W = signCv.width, Hh = signCv.height;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, Hh);
    const text = 'MVSICA · VNIVERSALIS', fs = Hh * 0.56;
    c.font = `600 ${fs}px "Trajan Pro", "Cinzel", "Times New Roman", Georgia, serif`;
    c.textBaseline = 'middle';
    const gap = fs * 0.2, widths = [...text].map(ch => c.measureText(ch).width);
    let total = widths.reduce((a, b) => a + b, 0) + gap * (text.length - 1);
    const sc = Math.min(1, (W * 0.94) / total);
    let x = (W - total * sc) / 2;
    c.save(); c.translate(0, Hh / 2); c.scale(sc, 1);
    x /= sc;
    const chars = [...text];
    for(const pass of [0, 1, 2]){
      let xx = x;
      for(let i = 0; i < chars.length; i++){
        if(pass === 0){ c.shadowColor = '#ff2bd0'; c.shadowBlur = Hh * 0.28; c.strokeStyle = 'rgba(255,60,210,.9)'; c.lineWidth = Hh * 0.07; c.strokeText(chars[i], xx, 0); }
        else if(pass === 1){ c.shadowBlur = 0; c.strokeStyle = '#ff7ae6'; c.lineWidth = Hh * 0.04; c.strokeText(chars[i], xx, 0); }
        else { c.strokeStyle = '#fff0fb'; c.lineWidth = Hh * 0.014; c.strokeText(chars[i], xx, 0); }
        xx += widths[i] + gap;
      }
    }
    c.restore();
  }
  const signTex = ctex(signCv);

  // 2f. 小貼圖：柔光、漸層、音符、虛線環、樂譜、面罩條、鍵盤、掃描線
  const glowRadial = (() => { const cv = cnv(128, 128), c = cv.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    for(const [t, a] of [[0, 1], [0.2, 0.75], [0.45, 0.32], [0.7, 0.1], [1, 0]]) g.addColorStop(t, `rgba(255,255,255,${a})`);
    c.fillStyle = g; c.fillRect(0, 0, 128, 128); return ctex(cv, { srgb: false }); })();
  const gradV = (() => { const cv = cnv(4, 128), c = cv.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 128);   // 上亮下透明
    for(const [t, a] of [[0, 1], [0.12, 0.7], [0.4, 0.25], [0.75, 0.06], [1, 0]]) g.addColorStop(t, `rgba(255,255,255,${a})`);
    c.fillStyle = g; c.fillRect(0, 0, 4, 128); return ctex(cv, { srgb: false }); })();
  function noteTex(kind){
    const cv = cnv(64, 64), c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineWidth = 4; c.shadowColor = '#fff'; c.shadowBlur = 6;
    if(kind === 0){ c.beginPath(); c.ellipse(24, 48, 10, 7, -0.4, 0, TAU); c.fill(); c.fillRect(31, 12, 4, 36); c.beginPath(); c.moveTo(35, 12); c.quadraticCurveTo(50, 22, 46, 36); c.quadraticCurveTo(44, 26, 35, 24); c.fill(); }
    else { c.beginPath(); c.ellipse(16, 50, 8.5, 6, -0.4, 0, TAU); c.fill(); c.beginPath(); c.ellipse(44, 44, 8.5, 6, -0.4, 0, TAU); c.fill(); c.fillRect(22, 14, 4, 36); c.fillRect(50, 8, 4, 36); c.beginPath(); c.moveTo(22, 14); c.lineTo(54, 8); c.lineTo(54, 16); c.lineTo(22, 22); c.fill(); }
    return ctex(cv, { srgb: false });
  }
  const dashTex = (() => { const cv = cnv(256, 4), c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, 256, 4);
    let x = 0; while(x < 256){ const L = 4 + rand() * 26, gap = 3 + rand() * 14; c.fillStyle = `rgba(255,255,255,${0.5 + rand() * 0.5})`; c.fillRect(x, 0, Math.min(L, 256 - x), 4); x += L + gap; }
    const t = ctex(cv, { srgb: false }); t.wrapS = THREE.RepeatWrapping; return t; })();
  const staffTex = (() => {   // 文藝復興定量記譜法（菱形音符）的五線譜，水平可以無縫接
    const W = LOW ? 256 : 512, Hh = W / 8, cv = cnv(W, Hh), c = cv.getContext('2d');
    c.fillStyle = '#000'; c.fillRect(0, 0, W, Hh);
    const top = Hh * 0.2, sp = Hh * 0.14;
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = Math.max(1, Hh / 64);
    for(let i = 0; i < 5; i++){ c.beginPath(); c.moveTo(0, top + i * sp); c.lineTo(W, top + i * sp); c.stroke(); }
    c.fillStyle = '#fff';
    for(let x = W * 0.06; x < W * 0.97; x += W * (0.045 + rand() * 0.03)){
      const step = rand() * 9 | 0, y = top + 4 * sp - step * sp / 2, r = sp * 0.55;
      c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r * 0.8, y); c.lineTo(x, y + r); c.lineTo(x - r * 0.8, y); c.closePath();
      if(rand() < 0.5) c.fill(); else { c.lineWidth = Math.max(1, Hh / 48); c.strokeStyle = '#fff'; c.stroke(); }
      if(rand() < 0.6) c.fillRect(x + r * 0.62, y - sp * 3, Math.max(1, Hh / 70), sp * 3);
    }
    const t = ctex(cv, { srgb: false }); t.wrapS = THREE.RepeatWrapping; return t; })();
  const visorTex = (() => { const cv = cnv(256, 16), c = cv.getContext('2d'), g = c.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, '#22e4ff'); g.addColorStop(0.5, '#ff2bd0'); g.addColorStop(1, '#22e4ff');
    c.fillStyle = g; c.fillRect(0, 0, 256, 16);
    c.fillStyle = 'rgba(0,0,0,.55)'; for(let x = 0; x < 256; x += 8) c.fillRect(x, 0, 2, 16);
    c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(0, 7, 256, 2);
    const t = ctex(cv); t.wrapS = THREE.RepeatWrapping; return t; })();
  const keysTex = (() => { const cv = cnv(512, 32), c = cv.getContext('2d'); c.fillStyle = '#efe7d3'; c.fillRect(0, 0, 512, 32);
    c.fillStyle = '#6d6558'; for(let i = 0; i <= 29; i++) c.fillRect(Math.round(i * 512 / 29) - 1, 0, 2, 32);
    return ctex(cv); })();
  const scanTex = (() => { const cv = cnv(8, 32), c = cv.getContext('2d'); c.clearRect(0, 0, 8, 32);
    c.fillStyle = 'rgba(0,0,0,.34)'; for(let y = 0; y < 32; y += 4) c.fillRect(0, y, 8, 1);
    const t = ctex(cv, { srgb: false }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  const sweepTex = (() => { const cv = cnv(4, 128), c = cv.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 128);
    for(const [t, a] of [[0, 0], [0.55, 0.12], [0.86, 0.45], [0.93, 1], [0.96, 0.35], [1, 0]]) g.addColorStop(t, `rgba(255,255,255,${a})`);
    c.fillStyle = g; c.fillRect(0, 0, 4, 128); return ctex(cv, { srgb: false }); })();
  const fluteTex = (() => { const cv = cnv(256, 8), c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, 256, 8);
    for(let k = 0; k < 24; k++){ const x = (k + 0.5) / 24 * 256; const g = c.createLinearGradient(x - 4, 0, x + 4, 0); g.addColorStop(0, 'rgba(255,40,200,0)'); g.addColorStop(0.5, 'rgba(255,90,220,1)'); g.addColorStop(1, 'rgba(255,40,200,0)'); c.fillStyle = g; c.fillRect(x - 4, 0, 8, 8); }
    return ctex(cv); })();

  /* ============================================================
     3. 材質
     ============================================================ */
  const Std = o => new THREE.MeshStandardMaterial(o);
  const Phy = o => {                                  // 手機不用 Physical 的 sheen／clearcoat
    if(!LOW) return new THREE.MeshPhysicalMaterial(o);
    const { sheen, sheenRoughness, sheenColor, clearcoat, clearcoatRoughness, ...rest } = o;
    return new THREE.MeshStandardMaterial(rest);
  };
  const MT = {
    gold   : Std({ color: 0xd8aa52, metalness: 1, roughness: 0.3 }),
    lacq   : Std({ color: 0x0d0a12, roughness: 0.26, metalness: 0.15 }),
    wall   : Std({ map: damaskTex, roughness: 0.8, color: 0xffffff }),
    wains  : Std({ color: 0x170b1b, roughness: 0.34 }),
    floor  : Std({ map: marbleTex, roughness: 0.34, metalness: 0, envMapIntensity: 0.35, emissive: 0xffffff, emissiveMap: floorGlowTex, emissiveIntensity: 0.6 }),   // 環境反射壓低：俯瞰斜看才不會變成一片灰白
    velvet : Phy({ color: 0xffffff, map: duvetTex, roughness: 1, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xff78d8), side: THREE.DoubleSide }),
    velvetH: Phy({ color: 0x2a0f4a, roughness: 1, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xb88cff) }),
    velvetM: Phy({ color: 0x5c0d3e, roughness: 1, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xff7ac8) }),
    ivory  : Std({ color: 0xefe6d6, roughness: 0.92 }),
    chrome : Std({ color: 0xe1e4ea, metalness: 1, roughness: 0.15 }),
    black  : Std({ color: 0x09080c, roughness: 0.3 }),
    marbleK: Std({ color: 0x131018, roughness: 0.2 }),
    flute  : Std({ color: 0x131018, roughness: 0.22, emissive: 0xffffff, emissiveMap: fluteTex, emissiveIntensity: 1 }),
    keysW  : Std({ map: keysTex, roughness: 0.35 }),
    fresco : Std({ map: frescoTex, emissiveMap: frescoTex, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.92 }),
    neon   : new THREE.MeshBasicMaterial({ map: (() => { const cv = cnv(256, 1), c = cv.getContext('2d'), g = c.createLinearGradient(0, 0, 256, 0); g.addColorStop(0, '#' + C_MAG.getHexString()); g.addColorStop(1, '#' + C_CYAN.getHexString()); c.fillStyle = g; c.fillRect(0, 0, 256, 1); const t = ctex(cv); t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return t; })() }),   // 所有靜態霓虹管（合併成一個網格）
    // 胸像專用（noCut：不能跟會被剖切的物件共用材質 —— 切平面是掛在材質上的）
    bustM  : Std({ color: 0xffffff, vertexColors: true, roughness: 0.32 }),
    bustG  : Std({ color: 0xd8aa52, metalness: 1, roughness: 0.3 }),
    visor  : Phy({ color: 0x06060a, metalness: 0.6, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }),
  };
  const addGlow = (map, color, opacity = 1, side = THREE.FrontSide) => new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side });
  const noPhoto = o => { o.userData.noPhoto = true; o.traverse && o.traverse(n => { n.userData.noPhoto = true; }); return o; };
  const neonGeos = [];                                  // 靜態霓虹管：各自塗頂點色，最後合併
  const neonTube = (geo, col) => { neonGeos.push(tint(geo, col)); };
  /** 沿著世界座標兩點的方形霓虹管（粗 t） */
  function neonBar(x0, y0, z0, x1, y1, z1, t, col){
    const L = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    const g = new THREE.BoxGeometry(t, t, L);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1), new THREE.Vector3(0, 1, 0));
    if(Math.abs(y1 - y0) > 0.99 * L) m.lookAt(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1), new THREE.Vector3(1, 0, 0));
    m.setPosition((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    g.applyMatrix4(m);
    neonTube(g, col ?? (v => mixAt(v.x, v.z)));
  }

  /* ============================================================
     4. 房間外殼：地板、壁紙、護牆板、腰線、踢腳板、金色頂線板、霓虹燈帶＋牆上暈光、招牌字、濕壁畫
     ============================================================ */
  // 地板（頂面＝黑大理石＋霓虹線；邊緣一圈薄邊，從門口看不到縫）
  {
    const g = new THREE.PlaneGeometry(RW, RD); g.rotateX(-Math.PI / 2);
    const f = M(g, MT.floor, CXR, FL, CZR); f.castShadow = false;
    f.name = 'br2-floor'; f.userData.noBake = true; f.renderOrder = -1;   // 發光強度會跟著鼓點變（整片一個材質，不必合併）
    const e = Bx(RW - 0.002, FL - 0.045, RD - 0.002, MT.black, CXR, (FL + 0.045) / 2 - 0.0005, CZR); e.castShadow = false;
    // ⚠️ 不能併進黑色那一大包：那包比剖切線高 → 俯瞰時 lighting 會替它補「切口分身」（畫背面）；
    //    這片只有 5 mm 厚，底面會被切口的 polygonOffset 拉到地板前面 → 俯瞰時整片地板變成一塊米灰色
    e.userData.noBake = true;
  }
  // 牆面：{軸、牆面座標、朝房內方向、範圍}
  const WALLS = {
    N: { axis: 'x', fixed: Z0, dir: 1,  a0: X0, a1: X1 },
    S: { axis: 'x', fixed: Z1, dir: -1, a0: X0, a1: X1 },
    W: { axis: 'z', fixed: X0, dir: 1,  a0: Z0, a1: Z1 },
    E: { axis: 'z', fixed: X1, dir: -1, a0: Z0, a1: Z1 },
  };
  /** 牆上一片平面（離牆 off），UV＝世界公尺（壁紙在牆與牆之間連續） */
  function wallQuad(w, a0, a1, y0, y1, mat, off = 0.003, parent = stat){
    if(a1 - a0 < 1e-3 || y1 - y0 < 1e-3) return null;
    const g = new THREE.PlaneGeometry(a1 - a0, y1 - y0), p = g.attributes.position, uv = g.attributes.uv;
    const sg = w.axis === 'x' ? w.dir : -w.dir;        // 平面本地 +x 對到世界的哪個方向（看下面的轉向）
    for(let i = 0; i < p.count; i++) uv.setXY(i, (a0 + a1) / 2 + sg * p.getX(i), (y0 + y1) / 2 + p.getY(i));
    const m = new THREE.Mesh(g, mat); m.castShadow = false; m.receiveShadow = true; parent.add(m);
    if(w.axis === 'x'){ m.position.set((a0 + a1) / 2, (y0 + y1) / 2, w.fixed + w.dir * off); m.rotation.y = w.dir > 0 ? 0 : Math.PI; }
    else { m.position.set(w.fixed + w.dir * off, (y0 + y1) / 2, (a0 + a1) / 2); m.rotation.y = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    return m;
  }
  /** 沿牆的長條方塊（踢腳板、腰線、頂線板）：沿牆 a0..a1、高 y0..y1、從牆面往房內 d0..d1 */
  function wallBar(w, a0, a1, y0, y1, d0, d1, mat, parent = stat){
    if(a1 - a0 < 1e-3) return null;
    const c0 = w.fixed + w.dir * d0, c1 = w.fixed + w.dir * d1, cm = (c0 + c1) / 2, cd = Math.abs(c1 - c0);
    return w.axis === 'x' ? Bx(a1 - a0, y1 - y0, cd, mat, (a0 + a1) / 2, (y0 + y1) / 2, cm, parent)
                          : Bx(cd, y1 - y0, a1 - a0, mat, cm, (y0 + y1) / 2, (a0 + a1) / 2, parent);
  }
  function wallNeon(w, a0, a1, y, d, t){
    if(a1 - a0 < 1e-3) return;
    const c = w.fixed + w.dir * d;
    if(w.axis === 'x') neonBar(a0, y, c, a1, y, c, t); else neonBar(c, y, a0, c, y, a1, t);
  }
  const WAIN = 0.92;                                   // 護牆板高（腰線）
  const doorL = dA0 - ARCH;                            // 南牆：門框線板西緣
  const eastStop = keep.z0 - 0.02;                     // 東牆：門片靠牆的那段不做凸出物
  // 壁紙與護牆板
  wallQuad(WALLS.N, X0, X1, FL, SILL - 0.02, MT.wains);
  wallQuad(WALLS.N, X0, X1, HEAD, H, MT.wall);
  wallQuad(WALLS.S, X0, doorL, FL, WAIN, MT.wains); wallQuad(WALLS.S, X0, doorL, WAIN, H, MT.wall);
  wallQuad(WALLS.S, doorL, X1, dH + ARCH, H, MT.wall);
  for(const k of ['W', 'E']){ wallQuad(WALLS[k], Z0, Z1, FL, WAIN, MT.wains); wallQuad(WALLS[k], Z0, Z1, WAIN, H, MT.wall); }
  // 腰線（金）、踢腳板（黑漆＋金邊）
  const railRuns = [[WALLS.S, X0, doorL], [WALLS.W, Z0, Z1], [WALLS.E, Z0, eastStop]];
  for(const [w, a0, a1] of railRuns){
    wallBar(w, a0, a1, WAIN - 0.02, WAIN + 0.02, 0, 0.018, MT.gold);
    wallBar(w, a0, a1, WAIN - 0.028, WAIN - 0.02, 0, 0.012, MT.gold);
  }
  const baseRuns = [[WALLS.N, X0, X1], [WALLS.S, X0, doorL - 0.002], [WALLS.W, Z0, Z1], [WALLS.E, Z0, eastStop]];
  for(const [w, a0, a1] of baseRuns){
    wallBar(w, a0, a1, FL - 0.006, 0.135, 0, 0.022, MT.lacq);
    wallBar(w, a0, a1, 0.135, 0.145, 0, 0.018, MT.gold);
  }
  // 地腳霓虹：只在看得到的牆段（床後、管風琴後不做）
  wallNeon(WALLS.N, X0, bedX0 - 0.02, 0.152, 0.012, 0.01);
  wallNeon(WALLS.S, X0, doorL - 0.002, 0.152, 0.012, 0.01);
  wallNeon(WALLS.W, Z0, orgZ0 - 0.01, 0.152, 0.012, 0.01); wallNeon(WALLS.W, orgZ1 + 0.01, Z1, 0.152, 0.012, 0.01);
  wallNeon(WALLS.E, bedZ1 + 0.02, eastStop, 0.152, 0.012, 0.01);
  // 頂線板（金）＋藏在下面的霓虹燈帶
  for(const k in WALLS){
    const w = WALLS[k];
    wallBar(w, w.a0, w.a1, H - 0.068, H, 0, 0.036, MT.gold);
    wallBar(w, w.a0, w.a1, H - 0.124, H - 0.108, 0, 0.02, MT.gold);
    wallNeon(w, w.a0 + 0.01, w.a1 - 0.01, H - 0.090, 0.03, 0.016);
  }
  // 霓虹在牆上、天花板上的暈光（假的光：加法混色的漸層片，全部合併成一個網格）
  const haloMat = addGlow(gradV, 0xffffff, 1); haloMat.vertexColors = true;
  {
    const pos = [], col = [], uv = [], idx = [], c = new THREE.Color();
    const quad = (P, V) => {   // P：四個角（世界座標）、V：四個角的漸層座標（1＝最亮）
      const b = pos.length / 3;
      for(let i = 0; i < 4; i++){ pos.push(...P[i]); uv.push(0.5, V[i]); colorAt(P[i][0], P[i][2], c); col.push(c.r, c.g, c.b); }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    const SEGS = 6;
    for(const k in WALLS){
      const w = WALLS[k];
      for(let s = 0; s < SEGS; s++){
        const a0 = lerp(w.a0, w.a1, s / SEGS), a1 = lerp(w.a0, w.a1, (s + 1) / SEGS);
        const off = w.fixed + w.dir * 0.006, inn = w.fixed + w.dir * 0.44, yT = H - 0.1, yB = H - 0.62, yc = H - 0.008;
        const P = (a, y, cc) => w.axis === 'x' ? [a, y, cc] : [cc, y, a];
        quad([P(a0, yT, off), P(a1, yT, off), P(a1, yB, off), P(a0, yB, off)], [1, 1, 0, 0]);        // 牆上往下淡
        quad([P(a0, yc, off), P(a1, yc, off), P(a1, yc, inn), P(a0, yc, inn)], [1, 1, 0, 0]);        // 天花板往內淡
      }
    }
    // gradV：v＝1 在畫布頂（最亮）
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeBoundingSphere();
    const halo = A(g, haloMat); halo.name = 'br2-neon-halo'; halo.renderOrder = 3; noPhoto(halo);
    haloMat.side = THREE.DoubleSide;
  }
  // 霓虹招牌字：北牆窗上
  const signMat = addGlow(signTex, 0xffffff, 1);
  const SIGN_W = Math.min(2.0, RW - 0.4), SIGN_H = SIGN_W * signCv.height / signCv.width * 1.08;
  const signY = clamp((HEAD + H - 0.13) / 2, HEAD + SIGN_H / 2 + 0.03, H - 0.14 - SIGN_H / 2);
  { const s = A(new THREE.PlaneGeometry(SIGN_W, SIGN_H), signMat, CXR, signY, Z0 + 0.008); s.name = 'br2-sign'; s.renderOrder = 4; noPhoto(s); }
  // 天花板濕壁畫＋故障效果（跟著屋頂開關一起顯示／隱藏）
  const ceil = new THREE.Group(); ceil.name = 'br2-ceiling'; dyn.add(ceil);
  // 天花板上所有平面共用一個 1×1 幾何（用縮放撐開）：故障切片平常藏著，第一次出現時不會多出一個新幾何（lighting 會以為場景變了）
  const ceilGeo = new THREE.PlaneGeometry(1, 1); ceilGeo.rotateX(Math.PI / 2);   // 面朝下；UV v=0 在北
  const fresco = A(ceilGeo, MT.fresco, CXR, H - 0.004, CZR, ceil); fresco.scale.set(RW, 1, RD); fresco.name = 'br2-fresco'; fresco.renderOrder = -1;
  const scanMat = new THREE.MeshBasicMaterial({ map: scanTex, transparent: true, depthWrite: false, color: 0xffffff });
  scanTex.repeat.set(RW / 0.12, RD / 0.12 * 2);
  { const s = A(ceilGeo, scanMat, CXR, H - 0.0058, CZR, ceil); s.scale.set(RW, 1, RD); s.renderOrder = 2; noPhoto(s); }
  const sweepMat = addGlow(sweepTex, 0x40f0ff, 0.9);
  const sweep = A(ceilGeo, sweepMat, CXR, H - 0.0068, CZR, ceil); sweep.scale.set(RW, 1, 0.34); sweep.renderOrder = 3; noPhoto(sweep);
  // 故障切片：一條一條橫帶，拿濕壁畫的同一張圖（各自一份位移），顏色偏洋紅／青（RGB 分離的感覺）
  const slices = [0xff5ae6, 0x46f2ff, 0xffffff].map((hex, i) => {
    const t = frescoTex.clone(); t.needsUpdate = true;
    const m = new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(hex).multiplyScalar(0.9) });
    const s = A(ceilGeo, m, CXR, H - 0.0048 - i * 0.0002, CZR, ceil); s.visible = false; noPhoto(s);
    return { s, m, t, next: 0 };
  });

  /* ============================================================
     5. 床（東牆，床頭朝北）：黑漆平台＋內縮底座（床底打光→像浮起來）、紫絲絨金紋床罩、巴洛克床頭板＋霓虹輪廓
     ============================================================ */
  function cloth({ L, W, T, head = 0, dropSide = .3, dropFoot = .25, r = .06, wrinkle = .012, fold = 0, swing = .008, phase = 0, loft = 0, foot = true, nx = LOW ? 30 : 48, nz = LOW ? 22 : 36 }){
    const arc = r * Math.PI / 2;
    const zLen = W / 2 + arc + Math.max(0, dropSide - r), xLen = foot ? L + arc + Math.max(0, dropFoot - r) : L;
    const wrap = (s, edge) => {
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
      if(loft > 0){
        const gx2 = foot ? Math.max(0, Math.min(1, (L - cx) / .30)) : 1, gz2 = Math.max(0, Math.min(1, (W / 2 - Math.abs(cz)) / .30));
        const sx = gx2 * gx2 * (3 - 2 * gx2), sz = gz2 * gz2 * (3 - 2 * gz2);
        y += loft * sx * sz * (.85 + .15 * Math.sin(cx * 3.1 + phase) * Math.cos(cz * 2.3));
      }
      if(fold > 0){
        const d = cx - head, lip = Math.min(1, d / .06), tail = Math.max(0, Math.min(1, (fold - d) / .10));
        y += .042 * Math.sqrt(Math.max(0, 1 - (1 - lip) ** 2)) * tail * fz;
      }
      pos.push(px, y, Math.sign(cz) * pz0); uv.push(i / nx, j / nz);
    }
    for(let i = 0; i < nx; i++) for(let j = 0; j < nz; j++){ const a = i * (nz + 1) + j, b = a + nz + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
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
  const HB_T = 0.075;                                  // 床頭板厚
  const platZ0 = bedZ0 + HB_T, platL = bedZ1 - platZ0, platZc = (platZ0 + bedZ1) / 2;
  const PLINTH = 0.17, PLAT = 0.08, MATT = 0.20;
  const platTop = FL + PLINTH + PLAT, mattTop = platTop + MATT;
  {
    // 內縮的底座（床底的光從這圈陰影裡打出來）
    Bx(BED_W - 0.26, PLINTH, platL - 0.24, MT.lacq, bedXc + 0.06, FL + PLINTH / 2, platZc - 0.02);
    // 平台＋金邊（西側、床尾兩條看得到的上緣）
    const plat = new RoundedBoxGeometry(BED_W, PLAT, platL, 2, 0.012);
    M(plat, MT.lacq, bedXc, FL + PLINTH + PLAT / 2, platZc);
    Bx(0.012, 0.012, platL - 0.02, MT.gold, bedX0 + 0.004, platTop - 0.004, platZc);
    Bx(BED_W - 0.02, 0.012, 0.012, MT.gold, bedXc, platTop - 0.004, bedZ1 - 0.004);
    // 床底霓虹（平台下緣內縮 3 cm，低角度看得到燈管）
    neonBar(bedX0 + 0.05, FL + PLINTH - 0.006, platZ0 + 0.06, bedX0 + 0.05, FL + PLINTH - 0.006, bedZ1 - 0.05, 0.012, NEON_M);
    neonBar(bedX0 + 0.05, FL + PLINTH - 0.006, bedZ1 - 0.05, bedX1 - 0.04, FL + PLINTH - 0.006, bedZ1 - 0.05, 0.012, NEON_M);
    // 床墊
    M(new RoundedBoxGeometry(0.90, MATT, platL - 0.04, 3, 0.035), MT.ivory, bedXc, platTop + MATT / 2, platZc);
    // 床罩（局部 x 沿床長、0＝床頭）：group 轉 -90°（局部 +x → 世界 +z）
    const bg = grp(bedXc, mattTop, platZ0 + 0.02, -Math.PI / 2);
    const L = platL - 0.06;
    M(cloth({ L, W: 0.9, T: 0.055, head: 0.44, dropSide: 0.15, dropFoot: 0.13, r: 0.06, fold: 0.28, loft: 0.04, phase: 2.1 }), MT.velvet, 0, 0, 0, bg);
    const lean = (geo, mat, h, t, phi, zc, yaw, x0) => {
      const c = Math.cos(phi), s = Math.sin(phi);
      const m = M(geo, mat, x0 + c * t / 2 + s * h / 2, c * h / 2 - s * t / 2 + 0.01, zc, bg);
      m.rotation.z = Math.PI / 2 + phi; m.rotation.y = yaw; return m;
    };
    lean(cushionGeo(0.42, 0.07, 0.72), MT.ivory, 0.42, 0.07, 0.52, 0, 0.03, 0.02);
    lean(cushionGeo(0.34, 0.06, 0.40), MT.velvetM, 0.34, 0.06, 0.66, -0.12, -0.12, 0.2);
    // 巴洛克床頭板：扇貝形上緣（中央拱起），紫絲絨＋金色背框＋拉扣＋霓虹輪廓
    const hw = BED_W, hs = 0.80, hp = 0.98;               // 寬、兩側高、中央最高
    const outline = (w, sH, pH) => {
      const s = new THREE.Shape();
      s.moveTo(-w / 2, 0); s.lineTo(-w / 2, sH - 0.05);
      s.quadraticCurveTo(-w / 2, sH, -w / 2 + 0.05, sH);
      s.bezierCurveTo(-w * 0.28, sH, -w * 0.22, sH + (pH - sH) * 0.2, -w * 0.14, sH + (pH - sH) * 0.55);
      s.bezierCurveTo(-w * 0.08, pH - 0.01, -0.03, pH, 0, pH);
      s.bezierCurveTo(0.03, pH, w * 0.08, pH - 0.01, w * 0.14, sH + (pH - sH) * 0.55);
      s.bezierCurveTo(w * 0.22, sH + (pH - sH) * 0.2, w * 0.28, sH, w / 2 - 0.05, sH);
      s.quadraticCurveTo(w / 2, sH, w / 2, sH - 0.05); s.lineTo(w / 2, 0); s.closePath();
      return s;
    };
    const hg = grp(bedXc, FL, bedZ0, 0);
    const back = new THREE.ExtrudeGeometry(outline(hw, hs, hp), { depth: 0.03, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 16 });
    M(back, MT.gold, 0, 0, 0.006, hg);
    const pad = new THREE.ExtrudeGeometry(outline(hw - 0.08, hs - 0.06, hp - 0.07), { depth: 0.02, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.022, bevelSegments: LOW ? 2 : 4, curveSegments: 16 });
    M(pad, MT.velvetH, 0, 0.03, 0.036, hg);
    // 拉扣（菱形格）
    const btn = new THREE.SphereGeometry(0.011, 10, 8), btns = [];
    for(let r = 0; r < 4; r++) for(let i = -3; i <= 3; i++){
      const x = i * 0.12 + (r % 2 ? 0.06 : 0), y = 0.40 + r * 0.11;
      if(Math.abs(x) > hw / 2 - 0.1 || y > (Math.abs(x) < 0.12 ? hp - 0.12 : hs - 0.1)) continue;
      btns.push(btn.clone().translate(x, y, 0.08));
    }
    if(btns.length) M(BGU.mergeGeometries(btns), MT.gold, 0, 0, 0, hg);
    // 霓虹輪廓：沿上緣
    const pts = [];
    for(const p of outline(hw + 0.02, hs + 0.012, hp + 0.012).getPoints(40)){
      if(p.y <= 0.3) continue;
      const v = new THREE.Vector3(bedXc + p.x, FL + p.y, bedZ0 + 0.03);
      if(!pts.length || pts[pts.length - 1].distanceTo(v) > 0.004) pts.push(v);   // 曲線接點會有重複的點（管子會算出 NaN）
    }
    if(pts.length > 3) neonTube(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.006, 6, false), NEON_C);
    ctx.colliders.push({ x0: bedX0, x1: X1, z0: Z0, z1: bedZ1, y1: 1.0 });
  }
  // 床底光暈（地板上的加法光：底座一圈最亮、往外淡）＋東牆腳一條
  const bedGlowMat = addGlow(null, 0xff2bd0, 1);
  {
    const m = 0.36, x0 = bedX0 - m, x1 = X1, z0 = platZ0, z1 = bedZ1 + m;
    const W = 256, Hh = Math.round(256 * (z1 - z0) / (x1 - x0)), cv = cnv(W, Hh), c = cv.getContext('2d');
    const sx = W / (x1 - x0), sz = Hh / (z1 - z0);
    const img = c.createImageData(W, Hh), px = img.data;
    const rx0 = bedX0 + 0.13, rx1 = X1, rz0 = platZ0 + 0.1, rz1 = bedZ1 - 0.13;   // 內縮底座的外框（燈藏在這圈陰影裡）
    for(let j = 0; j < Hh; j++) for(let i = 0; i < W; i++){
      const x = x0 + (i + 0.5) / sx, z = z0 + (j + 0.5) / sz;
      const dx = Math.max(rx0 - x, 0, x - rx1), dz = Math.max(rz0 - z, 0, z - rz1), d = Math.hypot(dx, dz);
      const a = (x > rx0 && x < rx1 && z > rz0 && z < rz1) ? 0.4 : Math.exp(-d / 0.12) * 0.75 + Math.exp(-d / 0.03) * 0.12;
      const o = (j * W + i) * 4; px[o] = px[o + 1] = px[o + 2] = Math.round(255 * Math.min(1, a)); px[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    const t = ctex(cv, { srgb: false }); bedGlowMat.map = t;
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2);
    const o = A(g, bedGlowMat, (x0 + x1) / 2, FL + 0.003, (z0 + z1) / 2); o.renderOrder = 2; noPhoto(o);
  }

  /* ============================================================
     6. 霓虹管風琴（西牆，面朝東）
        局部座標：x 沿琴寬（面對琴時左低音、右高音）、z 從牆往房內、y 從地板往上；group 轉 +90°（局部 +z → 世界 +x）
     ============================================================ */
  const og  = grp(X0 + 0.004, FL, orgZc, Math.PI / 2);
  const ogA = grp(X0 + 0.004, FL, orgZc, Math.PI / 2, dyn);
  const OW = ORG_W, CD = 0.36;
  const KEY_W = 0.80, KEY_LO = 36, KEY_HI = 84;        // 鍵盤 C2–C6
  const whiteOf = m => { const o = Math.floor(m / 12), n = m % 12, map = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; return o * 7 + map[n]; };
  const isBlack = m => [1, 3, 6, 8, 10].includes(m % 12);
  const NW_KEYS = whiteOf(KEY_HI) - whiteOf(KEY_LO) + 1, WK = KEY_W / NW_KEYS;
  const keyX = m => {
    const w = whiteOf(m) - whiteOf(KEY_LO);
    return isBlack(m) ? -KEY_W / 2 + (w + 1) * WK : -KEY_W / 2 + (w + 0.5) * WK;
  };
  const pipes = [];                                    // {x, r, h, mouth, len, b}
  const orgNeonIdx = [];                               // 用管風琴局部座標建的霓虹管（合併前轉到世界座標）
  const orgNeon = (...a) => { neonBar(...a); orgNeonIdx.push(neonGeos.length - 1); };
  {
    // 底座、琴箱下段
    Bx(OW + 0.03, 0.07, CD + 0.03, MT.lacq, 0, 0.035, (CD + 0.03) / 2, og);
    Bx(OW + 0.03, 0.01, CD + 0.035, MT.gold, 0, 0.074, (CD + 0.035) / 2, og);
    Bx(OW, 0.67, CD, MT.lacq, 0, 0.075 + 0.335, CD / 2, og);
    // 正面兩片金線板框
    for(const sx of [-1, 1]){
      const pw = OW / 2 - 0.14, cx = sx * (OW / 4 + 0.01), y0 = 0.17, y1 = 0.62, z = CD + 0.004;
      Bx(pw, 0.018, 0.01, MT.gold, cx, y0, z, og); Bx(pw, 0.018, 0.01, MT.gold, cx, y1, z, og);
      Bx(0.018, y1 - y0, 0.01, MT.gold, cx - pw / 2, (y0 + y1) / 2, z, og); Bx(0.018, y1 - y0, 0.01, MT.gold, cx + pw / 2, (y0 + y1) / 2, z, og);
      // 框中央：金色圓花
      M(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 24).rotateX(Math.PI / 2), MT.gold, cx, (y0 + y1) / 2, z + 0.004, og);
      M(new THREE.TorusGeometry(0.07, 0.006, 8, 32), MT.gold, cx, (y0 + y1) / 2, z + 0.004, og);
    }
    // 鍵盤台、兩側擋板
    Bx(KEY_W + 0.14, 0.035, 0.22, MT.lacq, 0, 0.7625, 0.40, og);
    for(const sx of [-1, 1]){
      Bx(0.06, 0.13, 0.24, MT.lacq, sx * (KEY_W / 2 + 0.035), 0.745 + 0.065, 0.39, og);
      Bx(0.064, 0.012, 0.244, MT.gold, sx * (KEY_W / 2 + 0.035), 0.745 + 0.13 + 0.006, 0.39, og);
      M(new THREE.TorusGeometry(0.035, 0.009, 8, 20, Math.PI * 1.5).rotateY(Math.PI / 2), MT.gold, sx * (KEY_W / 2 + 0.035), 0.83, 0.51, og);   // 渦卷
    }
    // 兩層手鍵盤：白鍵面（貼圖畫鍵縫）＋黑鍵
    const manual = (y, z0, z1, bz1) => {
      Bx(KEY_W, 0.015, z1 - z0, MT.black, 0, y - 0.0075, (z0 + z1) / 2, og);
      const top = new THREE.PlaneGeometry(KEY_W, z1 - z0); top.rotateX(-Math.PI / 2);
      M(top, MT.keysW, 0, y + 0.0005, (z0 + z1) / 2, og);
      const bk = [];
      for(let m = KEY_LO; m <= KEY_HI; m++) if(isBlack(m)) bk.push(new THREE.BoxGeometry(WK * 0.56, 0.011, bz1 - z0).translate(keyX(m), y + 0.0055, (z0 + bz1) / 2));
      M(BGU.mergeGeometries(bk), MT.black, 0, 0, 0, og);
    };
    manual(0.792, 0.37, 0.50, 0.45);
    Bx(KEY_W, 0.045, 0.03, MT.lacq, 0, 0.8175, 0.385, og);   // 上層鍵盤的台
    manual(0.852, 0.29, 0.40, 0.355);
    orgNeon(-KEY_W / 2 - 0.06, 0.748, 0.513, KEY_W / 2 + 0.06, 0.748, 0.513, 0.008, NEON_C);
    // 琴箱上段、譜架
    Bx(OW, 0.36, 0.25, MT.lacq, 0, 0.745 + 0.18, 0.125, og);
    Bx(OW, 0.03, 0.008, MT.gold, 0, 1.075, 0.254, og);
    const desk = new THREE.Group(); desk.position.set(0, 0.99, 0.29); desk.rotation.x = -0.26; og.add(desk);
    Bx(0.62, 0.27, 0.014, MT.lacq, 0, 0, 0, desk);
    Bx(0.64, 0.014, 0.03, MT.gold, 0, -0.14, 0.012, desk);
    // 管子架（impost）
    Bx(OW + 0.06, 0.05, 0.34, MT.lacq, 0, 1.125, 0.17, og);
    Bx(OW + 0.06, 0.02, 0.012, MT.gold, 0, 1.135, 0.346, og);
    orgNeon(-OW / 2 - 0.03, 1.094, 0.35, OW / 2 + 0.03, 1.094, 0.35, 0.012, NEON_M);
    // 管子：中央高塔、兩側平台低、最外兩邊又升起（M 字形）；鉻亮面
    const N = 17, span = OW - 0.08, base = 1.15, PS = LOW ? 12 : 18;   // 管子很細：18 段就夠圓
    const pipeGeos = [], mouthGeos = [];
    for(let i = 0; i < N; i++){
      const t = (i - (N - 1) / 2) / ((N - 1) / 2);
      const h = 0.72 + 0.98 * Math.exp(-((t / 0.30) ** 2)) + 0.52 * Math.exp(-(((Math.abs(t) - 0.88) / 0.13) ** 2));
      const r = 0.013 + 0.017 * clamp((h - 0.7) / 1.0, 0, 1);
      const x = -span / 2 + (i + 0.5) * span / N;
      const foot = 0.14 + 0.05 * (h - 0.7);
      pipeGeos.push(new THREE.CylinderGeometry(r * 0.98, r * 0.32, foot, PS, 1).translate(x, base + foot / 2, 0.17));
      pipeGeos.push(new THREE.CylinderGeometry(r, r, h - foot, PS, 1).translate(x, base + foot + (h - foot) / 2, 0.17));
      pipeGeos.push(new THREE.TorusGeometry(r, r * 0.08, 3, PS).rotateX(Math.PI / 2).translate(x, base + h, 0.17));
      mouthGeos.push(new THREE.BoxGeometry(r * 1.25, 0.04, 0.004).translate(x, base + foot + 0.02, 0.17 + r * 0.97));
      pipes.push({ x, r, h, mouth: base + foot + 0.045, len: h - foot - 0.07, b: 0 });
    }
    M(BGU.mergeGeometries(pipeGeos), MT.chrome, 0, 0, 0, og);
    M(BGU.mergeGeometries(mouthGeos), MT.black, 0, 0, 0, og);
    // 管子依高度排「頻段」：最高＝低音（0）→ 最矮＝高音（1）
    const byH = pipes.map((p, i) => [p.h, i]).sort((a, b) => b[0] - a[0]);
    byH.forEach(([, i], k) => { pipes[i].b = k / (N - 1); });
    // 兩側金色壁柱＋頂端瓶飾
    for(const sx of [-1, 1]){
      const x = sx * (OW / 2 + 0.005), top = 2.36;
      Bx(0.05, top - 1.15, 0.05, MT.gold, x, (1.15 + top) / 2, 0.3, og);
      M(new THREE.LatheGeometry([[0, 0], [0.04, 0], [0.04, 0.02], [0.025, 0.04], [0.045, 0.09], [0.03, 0.13], [0.012, 0.15], [0.02, 0.17], [0, 0.2]].map(p => new THREE.Vector2(p[0], p[1])), SEG), MT.gold, x, top, 0.3, og);
    }
    // 琴凳（圓、紫紅絲絨、金腳）：低於膝，可以跨過去
    const st = grp(0, 0, 0.74, 0, og);
    M(new THREE.CylinderGeometry(0.17, 0.165, 0.07, SEG), MT.velvetM, 0, 0.44, 0, st);
    M(new THREE.TorusGeometry(0.168, 0.008, 6, SEG).rotateX(Math.PI / 2), MT.gold, 0, 0.41, 0, st);
    M(new THREE.LatheGeometry([[0, 0], [0.13, 0], [0.13, 0.015], [0.05, 0.05], [0.028, 0.12], [0.04, 0.2], [0.025, 0.3], [0.06, 0.4], [0, 0.4]].map(p => new THREE.Vector2(p[0], p[1])), SEG), MT.gold, 0, 0.0, 0, st);
    ctx.colliders.push({ x0: X0, x1: X0 + ORG_KEY, z0: orgZ0, z1: orgZ1, y1: 2.9 });
    ctx.colliders.push({ x0: X0 + 0.74 - 0.17, x1: X0 + 0.74 + 0.17, z0: orgZc - 0.17, z1: orgZc + 0.17, y1: FL + 0.47 });   // 琴凳（矮於膝，照全站規矩可以跨過）
  }
  // 管子前面那片會亮的弧面（等化器）：一個 InstancedMesh，每支管子的長度＝音量
  const eqGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true, -0.85, 1.7).translate(0, 0.5, 0);
  const eqMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eq = new THREE.InstancedMesh(eqGeo, eqMat, pipes.length);
  eq.castShadow = eq.receiveShadow = false; eq.userData.noBake = true; eq.name = 'br2-organ-eq';
  eq.userData.noPhoto = true;   // 📸 路徑追蹤不展開 InstancedMesh（會把 1×1 m 的原型幾何當成一片白光）
  eq.frustumCulled = false; ogA.add(eq);
  const eqLv = new Float32Array(pipes.length);
  const eqCol = pipes.map(p => new THREE.Color().copy(C_CYAN).lerp(C_MAG, p.b));
  {   // 建好時就把每一份的矩陣與顏色填好（顏色屬性一開始就在 → 之後不必重編 shader）
    const m4 = new THREE.Matrix4();
    pipes.forEach((p, i) => { m4.compose(new THREE.Vector3(p.x, p.mouth, 0.17), new THREE.Quaternion(), new THREE.Vector3(p.r * 1.05, p.len * 0.07, p.r * 1.05)); eq.setMatrixAt(i, m4); eq.setColorAt(i, eqCol[i]); });
  }
  // 管子後面牆上的光暈（跟著整體音量亮）
  const wallGlowMat = addGlow(glowRadial, 0xb04dff, 0.8);
  { const o = A(new THREE.PlaneGeometry(OW + 0.5, 2.2), wallGlowMat, 0, 1.95, 0.004, ogA); o.renderOrder = 2; noPhoto(o); }
  // 鍵盤上正在彈的那兩個鍵（旋律＝上層、貝斯＝下層）
  const keyGlowMat = [addGlow(null, 0x44f0ff, 1), addGlow(null, 0xff4fd8, 1)];
  const keyGeo = new THREE.BoxGeometry(1, 0.006, 1);
  const keyGlow = [A(keyGeo, keyGlowMat[0], 0, 0.857, 0.345, ogA), A(keyGeo, keyGlowMat[1], 0, 0.797, 0.435, ogA)];
  keyGlow[0].scale.set(WK * 0.9, 1, 0.1); keyGlow[1].scale.set(WK * 0.9, 1, 0.12);
  keyGlow.forEach(k => { k.renderOrder = 4; noPhoto(k); });
  // 譜架上的全像樂譜
  const deskScoreMat = addGlow(staffTex.clone(), 0x5ef0ff, 0.95, THREE.DoubleSide);
  deskScoreMat.map.needsUpdate = true; deskScoreMat.map.repeat.set(0.5, 1); deskScoreMat.map.wrapS = THREE.RepeatWrapping;
  {
    const d = new THREE.Group(); d.position.set(0, 0.99, 0.30); d.rotation.x = -0.26; ogA.add(d);
    const s = A(new THREE.PlaneGeometry(0.56, 0.22), deskScoreMat, 0, 0.005, 0.01, d); s.renderOrder = 4; noPhoto(s);
  }

  /* ============================================================
     7. 大理石胸像（戴 VR 面罩）＋發光台座＋全像環
     ============================================================ */
  // 台座：黑大理石方座、凹槽柱身（槽裡是洋紅光）、金色柱頭
  {
    const pg = grp(bustX, FL, bustZ, 0);
    Bx(0.40, 0.07, 0.40, MT.marbleK, 0, 0.035, 0, pg);
    Bx(0.41, 0.012, 0.41, MT.gold, 0, 0.076, 0, pg);
    M(new THREE.CylinderGeometry(0.15, 0.17, 0.05, SEG * 2), MT.marbleK, 0, 0.107, 0, pg);
    const shaftH = 0.66, shaft = new THREE.CylinderGeometry(0.125, 0.125, shaftH, 96, 1, true);
    { const p = shaft.attributes.position, uv = shaft.attributes.uv;   // 24 道凹槽：槽心對齊貼圖的發光線
      for(let i = 0; i < p.count; i++){ const u = uv.getX(i), th = u * TAU, d = 0.5 - 0.5 * Math.cos(24 * th), k = 1 - 0.07 * Math.pow(d, 1.5); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
      shaft.computeVertexNormals(); }
    M(shaft, MT.flute, 0, 0.132 + shaftH / 2, 0, pg);
    M(new THREE.CylinderGeometry(0.14, 0.125, 0.04, SEG * 2), MT.gold, 0, 0.812, 0, pg);
    Bx(0.34, 0.05, 0.34, MT.marbleK, 0, 0.857, 0, pg);
    Bx(0.345, 0.01, 0.345, MT.gold, 0, 0.879, 0, pg);
    neonTube(new THREE.TorusGeometry(0.133, 0.005, 6, 48).rotateX(Math.PI / 2).translate(bustX, FL + 0.14, bustZ), NEON_M);
    neonTube(new THREE.TorusGeometry(0.133, 0.005, 6, 48).rotateX(Math.PI / 2).translate(bustX, FL + 0.785, bustZ), NEON_C);
    ctx.colliders.push({ x0: bustX - 0.21, x1: bustX + 0.21, z0: bustZ - 0.21, z1: bustZ + 0.21, y1: 1.5 });
  }
  const pedGlowMat = addGlow(glowRadial, 0xff2bd0, 0.9);
  { const g = new THREE.PlaneGeometry(0.95, 0.95); g.rotateX(-Math.PI / 2); const o = A(g, pedGlowMat, bustX, FL + 0.004, bustZ); o.renderOrder = 2; noPhoto(o); }

  // 大理石紋（頂點色）：3D 湍流 → 細灰紋；座標用胸像自己的局部座標（整尊紋路連續）
  function marbleColors(g){
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for(let i = 0; i < p.count; i++){
      const x = p.getX(i) * 16, y = p.getY(i) * 16, z = p.getZ(i) * 16;
      const tb = Math.sin(x * 1.7 + Math.sin(y * 2.3 + Math.sin(z * 1.9)) * 1.6) + 0.5 * Math.sin(z * 3.1 + x);
      const vein = Math.exp(-Math.pow(Math.sin(x * 0.9 + y * 1.3 + tb * 1.4) * 4.0, 2));
      const k = 1 - 0.20 * vein - 0.025 * Math.sin(y * 5 + z * 3);
      col[i * 3] = 0.86 * k; col[i * 3 + 1] = 0.835 * k; col[i * 3 + 2] = 0.80 * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
  function headGeo(){
    let g = new THREE.SphereGeometry(1, LOW ? 64 : 100, LOW ? 48 : 76);
    g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = BGU.mergeVertices(g, 1e-6);
    const p = g.attributes.position;
    const a = 0.073, b = 0.112, c = 0.097;
    for(let i = 0; i < p.count; i++){
      const nx = p.getX(i), ny = p.getY(i), nz = p.getZ(i);
      let x = a * nx, y = b * ny, z = c * nz;
      const low = smooth(0.1, -0.95, ny);                           // 下半部（兩頰→下巴）收窄
      x *= 1 - 0.36 * low * low;
      z *= nz < 0 ? 1 - 0.42 * low : 1 - 0.05 * low;
      if(ny > 0) z -= 0.016 * ny * ny;                             // 後腦勺往後凸
      if(nz < 0) z *= 1.04;
      const fm = smooth(0.25, 0.75, nz);                            // 臉的正面
      z += 0.020 * fm * smooth(0.15, -0.55, ny);                    // 下半臉往前（嘴、下巴）
      if(ny > 0.1) z -= 0.006 * fm * ny;                            // 額頭稍平
      z += 0.006 * fm * Math.exp(-(((y - 0.030) / 0.011) ** 2)) * Math.max(0, 1 - (x / 0.06) ** 2);   // 眉骨
      z -= 0.010 * fm * Math.exp(-(((Math.abs(x) - 0.031) / 0.017) ** 2 + ((y - 0.010) / 0.013) ** 2));   // 眼窩
      const tn = clamp((0.020 - y) / 0.056, 0, 1);                  // 鼻子：0＝鼻根、1＝鼻尖
      const prot = y >= -0.036 ? 0.024 * Math.pow(tn, 1.25) : 0.024 * Math.pow(Math.max(0, 1 - (-0.036 - y) / 0.013), 1.6);
      const sx = 0.0075 + 0.008 * tn;
      z += prot * Math.exp(-(x * x) / (sx * sx)) * fm;
      z += 0.005 * fm * Math.exp(-(((Math.abs(x) - 0.012) / 0.006) ** 2 + ((y + 0.040) / 0.007) ** 2));   // 鼻翼
      z += 0.0045 * fm * Math.exp(-((x / 0.021) ** 2 + ((y + 0.060) / 0.0055) ** 2));                     // 上唇
      z += 0.0050 * fm * Math.exp(-((x / 0.018) ** 2 + ((y + 0.071) / 0.0060) ** 2));                     // 下唇
      z -= 0.0025 * fm * Math.exp(-((x / 0.022) ** 2 + ((y + 0.0655) / 0.0020) ** 2));                    // 唇縫
      z += 0.007 * fm * Math.exp(-((x / 0.022) ** 2 + ((y + 0.094) / 0.012) ** 2));                       // 下巴
      z += 0.004 * smooth(0.0, 0.5, nz) * Math.exp(-(((Math.abs(x) - 0.046) / 0.016) ** 2 + ((y + 0.012) / 0.02) ** 2));   // 顴骨
      // 捲髮：額頭髮際 → 耳上 → 後頸
      const line = nz >= 0 ? lerp(0.22, 0.60, clamp(nz * 1.6, 0, 1)) : lerp(0.22, -0.42, clamp(-nz * 1.7, 0, 1));
      const ear = Math.exp(-(((Math.abs(nx) - 0.97) / 0.12) ** 2 + (ny / 0.22) ** 2));
      const hm = smooth(line - 0.07, line + 0.07, ny) * (1 - ear);
      if(hm > 0){
        const c1 = Math.sin(21 * nx + 3.5 * Math.sin(9 * ny + 1)), c2 = Math.sin(23 * ny + 3.1 * Math.sin(8 * nz + 2)), c3 = Math.sin(20 * nz + 3.3 * Math.sin(10 * nx + 3));
        const d = hm * (0.009 + 0.0075 * Math.pow(Math.abs(c1 * c2 * c3), 0.45));
        x += nx * d; y += ny * d; z += nz * d;
      }
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  }
  function torsoGeo(){
    let g = new THREE.SphereGeometry(1, LOW ? 40 : 64, LOW ? 28 : 44);
    g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = BGU.mergeVertices(g, 1e-6);
    const p = g.attributes.position;
    for(let i = 0; i < p.count; i++){
      const nx = p.getX(i), ny = p.getY(i), nz = p.getZ(i);
      // 上半部用超橢圓（肩線平、肩頭圓）；下半部照原本的橢球
      const sy = ny > 0 ? Math.pow(ny, 0.5) : ny;
      let x = 0.205 * Math.sign(nx) * Math.pow(Math.abs(nx), 0.85), y = 0.12 * sy, z = 0.098 * nz;
      const ax = Math.abs(x), fr = smooth(0.15, 0.7, nz);
      if(ny > 0) y -= 0.062 * smooth(0.045, 0.2, ax) * Math.pow(ny, 0.7);   // 斜方肌：從脖子往肩頭斜下
      if(ny > 0) z *= 1 - 0.35 * smooth(0.12, 0.205, ax);                   // 肩頭前後變薄（圓肩）
      if(nz < 0) z *= 0.8;                                                   // 背比較平
      z += 0.013 * fr * Math.exp(-(((ax - 0.068) / 0.052) ** 2 + ((y - 0.0) / 0.042) ** 2));          // 胸肌
      z -= 0.006 * fr * Math.exp(-((x / 0.02) ** 2 + ((y + 0.01) / 0.06) ** 2));                       // 胸口中線
      z -= 0.004 * fr * Math.exp(-(((ax - 0.05) / 0.04) ** 2 + ((y - 0.07) / 0.012) ** 2));            // 鎖骨凹
      // 托加袍：從右肩斜到左胸的一道布褶（兩道凸、中間一道凹）
      const d = ((x - 0.12) * 0.55 + (y - 0.09) * 0.835);                    // 到斜線的距離（線的法向）
      const along = (x - 0.12) * -0.835 + (y - 0.09) * 0.55;
      const span = smooth(-0.02, 0.03, along) * smooth(0.32, 0.22, along);
      z += fr * span * (0.009 * Math.exp(-((d / 0.012) ** 2)) + 0.006 * Math.exp(-(((d + 0.03) / 0.011) ** 2)) - 0.003 * Math.exp(-(((d + 0.015) / 0.006) ** 2)));
      const cut = -0.05 + 0.058 * (x / 0.205) ** 2;                          // 底部 U 形切口：以下壓平
      if(y < cut) y = cut;
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  }
  const bust = new THREE.Group(); bust.name = 'br2-bust'; bust.position.set(bustX, PED_TOP, bustZ); dyn.add(bust);
  const HEAD_C = new THREE.Vector3(0, 0.43, 0.018);
  {
    const parts = [];
    // 底座（車削）
    parts.push(new THREE.LatheGeometry([[0, 0], [0.085, 0], [0.085, 0.014], [0.078, 0.02], [0.07, 0.024], [0.06, 0.03], [0.05, 0.045], [0.045, 0.06], [0.05, 0.07], [0.07, 0.076], [0.08, 0.085], [0.08, 0.1], [0, 0.1]].map(q => new THREE.Vector2(q[0], q[1])), SEG * 2));
    parts.push(torsoGeo().translate(0, 0.15, 0));
    const neck = new THREE.CylinderGeometry(0.052, 0.062, 0.16, 32, 1, true); neck.rotateX(0.1); neck.translate(0, 0.30, 0.004);
    parts.push(neck);
    const head = headGeo(); head.rotateX(0.06); head.rotateY(0.18); head.translate(HEAD_C.x, HEAD_C.y, HEAD_C.z);
    parts.push(head);
    for(const sx of [-1, 1]){ const e = new THREE.SphereGeometry(1, 16, 12); e.scale(0.009, 0.028, 0.017); e.rotateY(sx * 0.3); e.translate(sx * 0.071, -0.004, -0.008); e.rotateX(0.06); e.rotateY(0.18); e.translate(HEAD_C.x, HEAD_C.y, HEAD_C.z); parts.push(e); }
    // 各零件先各自算好平滑法線（在有索引時算），再拆成無索引合併 —— 合併後不要重算（會變成一面一面的）
    const clean = parts.map(g => { if(!g.attributes.normal) g.computeVertexNormals(); const q = g.index ? g.toNonIndexed() : g; for(const k of Object.keys(q.attributes)) if(k !== 'position' && k !== 'normal') q.deleteAttribute(k); return q; });
    const merged = BGU.mergeGeometries(clean); marbleColors(merged);
    const m = A(merged, MT.bustM, 0, 0, 0, bust); m.name = 'br2-bust-marble';
    // 底座金環、胸針（青霓虹小環）
    A(new THREE.TorusGeometry(0.081, 0.004, 6, 40).rotateX(Math.PI / 2), MT.bustG, 0, 0.086, 0, bust);
  }
  // VR 面罩：黑亮外殼＋會流動的霓虹條＋綁帶（跟頭一起轉）
  const headPivot = new THREE.Group(); headPivot.position.copy(HEAD_C); headPivot.rotation.set(0.06, 0.18, 0, 'YXZ'); bust.add(headPivot);
  const visorStripMat = new THREE.MeshBasicMaterial({ map: visorTex, color: 0xffffff });
  {
    const shell = new THREE.CylinderGeometry(0.089, 0.089, 0.046, 48, 1, true, -1.25, 2.5); shell.scale(1, 1, 1.13);
    const s = A(shell, MT.visor, 0, 0.010, 0.010, headPivot); s.material.side = THREE.DoubleSide;
    const strip = new THREE.CylinderGeometry(0.0905, 0.0905, 0.011, 48, 1, true, -1.12, 2.24); strip.scale(1, 1, 1.13);
    A(strip, visorStripMat, 0, 0.010, 0.010, headPivot);
    const strapPts = [[0.083, 0.045], [0.091, 0.0], [0.084, -0.06], [0.05, -0.108], [0, -0.124], [-0.05, -0.108], [-0.084, -0.06], [-0.091, 0.0], [-0.083, 0.045]].map(q => new THREE.Vector3(q[0], 0.010, q[1] + 0.006));
    A(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(strapPts), 40, 0.006, 6, false).scale(1, 1.6, 1), MT.visor, 0, 0, 0, headPivot);
  }
  const brooch = A(new THREE.TorusGeometry(0.018, 0.004, 6, 20), new THREE.MeshBasicMaterial({ color: C_CYAN.clone().multiplyScalar(1.6) }), 0.125, 0.225, 0.07, bust);
  brooch.rotation.set(0.35, 0.5, 0);
  bust.traverse(o => { if(o.isMesh) o.userData.noCut = true; });
  // 全像環（不跟胸像轉，自己繞）：三道虛線環＋一圈流動的樂譜帶
  const holo = new THREE.Group(); holo.name = 'br2-holo'; holo.position.set(bustX, PED_TOP + HEAD_C.y, bustZ); dyn.add(holo);
  const ringDefs = [[0.25, 0x44f0ff, 1.15, 0.9], [0.285, 0xff4fd8, 1.75, -0.6], [0.32, 0xa77bff, 0.55, 0.4]];
  const rings = ringDefs.map(([r, hex, tilt, spd], i) => {
    const pivot = new THREE.Group(); holo.add(pivot);
    const t = dashTex.clone(); t.needsUpdate = true; t.repeat.set(2 + i, 1);
    const mat = addGlow(t, hex, 1, THREE.DoubleSide);
    const m = A(new THREE.TorusGeometry(r, 0.0028, 4, 128), mat, 0, 0, 0, pivot); m.rotation.x = tilt; m.renderOrder = 4; noPhoto(m);
    return { pivot, m, mat, base: new THREE.Color(hex), spd };
  });
  const bandMat = addGlow(staffTex, 0x66f4ff, 0.9, THREE.DoubleSide); staffTex.repeat.set(3, 1);
  const band = A(new THREE.CylinderGeometry(0.27, 0.27, 0.075, 64, 1, true), bandMat, 0, -0.30, 0, holo); band.renderOrder = 4; noPhoto(band);
  holo.traverse(o => { if(o.isMesh) o.userData.noCut = true; });

  /* ============================================================
     8. 鍍金巴洛克畫框（西牆：合成器夕陽；東牆：達文西多面體）
        ⚠️ 畫面不用「每格重畫畫布」：畫布上傳成貼圖在 Chrome 實測一次約 0.8 ms（跟畫布大小、翻不翻轉、GPU／CPU 畫布都無關）→
           夕陽＝靜態的畫＋一條「網格橫線」帶子（UV 照透視深度排：捲動貼圖位移＝橫線一條條往觀眾這邊跑，只改一個 uniform）；
           多面體＝真的 3D 霓虹線框（浮在橢圓框前面慢慢轉，走動時有視差）
     ============================================================ */
  function rrectShape(w, h, r, P = THREE.Shape){
    const s = new P(), a = -w / 2, b = -h / 2;
    s.moveTo(a + r, b); s.lineTo(a + w - r, b); s.quadraticCurveTo(a + w, b, a + w, b + r); s.lineTo(a + w, b + h - r); s.quadraticCurveTo(a + w, b + h, a + w - r, b + h);
    s.lineTo(a + r, b + h); s.quadraticCurveTo(a, b + h, a, b + h - r); s.lineTo(a, b + r); s.quadraticCurveTo(a, b, a + r, b); return s;
  }
  function ellShape(rx, ry, P = THREE.Shape){ const s = new P(); s.absellipse(0, 0, rx, ry, 0, TAU, false, 0); return s; }
  /** 畫框：局部 xy 平面、正面朝 +z、背面貼牆（z=0）；回傳畫面的材質、跟著畫框的動態群組、畫面尺寸 */
  function baroqueFrame(parent, w, h, oval, tex){
    const bs = 0.014, br = oval ? 0.075 : 0.085;
    const ring = (ow, oh, iw, ih, depth, bev, mat, z) => {
      const s = oval ? ellShape(ow / 2 - bev, oh / 2 - bev) : rrectShape(ow - 2 * bev, oh - 2 * bev, 0.006);
      s.holes.push(oval ? ellShape(iw / 2 + bev, ih / 2 + bev, THREE.Path) : rrectShape(iw + 2 * bev, ih + 2 * bev, 0.003, THREE.Path));
      const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: oval ? (LOW ? 24 : 36) : 3 });
      g.translate(0, 0, bev + z);
      return M(g, mat, 0, 0, 0, parent);
    };
    ring(w, h, w - 2 * br, h - 2 * br, 0.02, bs, MT.gold, 0);                               // 主線板（圓潤）
    ring(w - 2 * br + 0.036, h - 2 * br + 0.036, w - 2 * br, h - 2 * br, 0.03, 0.005, MT.gold, 0.004);   // 內緣一道細珠邊
    // 裝飾：上方扇貝＋下方垂飾＋（方框）四角的圓花
    const shell = [];
    for(let k = -4; k <= 4; k++){ const e = new THREE.SphereGeometry(1, 10, 8); e.scale(0.011, 0.055, 0.012); e.translate(0, 0.045, 0); e.rotateZ(k * 0.3); shell.push(e); }
    const sh = BGU.mergeGeometries(shell.map(q => { q.deleteAttribute('uv'); return q; }));
    M(sh, MT.gold, 0, h / 2 - 0.02, 0.05, parent);
    M(new THREE.SphereGeometry(0.02, 12, 10), MT.gold, 0, h / 2 - 0.02, 0.055, parent);
    M(new THREE.SphereGeometry(0.018, 12, 10).scale(1, 1.4, 0.7), MT.gold, 0, -h / 2 + 0.005, 0.05, parent);
    if(!oval) for(const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]){
      M(new THREE.SphereGeometry(0.03, 12, 10).scale(1, 1, 0.45), MT.gold, sx * (w / 2 - 0.035), sy * (h / 2 - 0.035), 0.045, parent);
      M(new THREE.TorusGeometry(0.03, 0.006, 6, 16), MT.gold, sx * (w / 2 - 0.035), sy * (h / 2 - 0.035), 0.04, parent);
    }
    // 畫面（自己發光的螢幕：MeshBasic）＋深色襯底
    const iw = w - 2 * br - 0.01, ih = h - 2 * br - 0.01;
    const back = oval ? new THREE.CircleGeometry(0.5, 48).scale(iw + 0.02, ih + 0.02, 1) : new THREE.PlaneGeometry(iw + 0.02, ih + 0.02);
    M(back, MT.black, 0, 0, 0.004, parent);
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff });
    const scr = oval ? new THREE.CircleGeometry(0.5, 48).scale(iw, ih, 1) : new THREE.PlaneGeometry(iw, ih);
    const pg = new THREE.Group(); pg.position.copy(parent.position); pg.rotation.copy(parent.rotation); dyn.add(pg);
    A(scr, mat, 0, 0, 0.012, pg);
    return { mat, pg, iw, ih };
  }
  // 8a. 合成器夕陽（托斯卡尼：柏樹＋布魯內萊斯基圓頂的剪影，站在霓虹網格地平線上）
  function paintSunset(W, Hh){
    const cv = cnv(W, Hh), c = cv.getContext('2d'), k = W / 384, hor = Math.round(Hh * 0.62);
    let g = c.createLinearGradient(0, 0, 0, hor);
    g.addColorStop(0, '#0b0326'); g.addColorStop(0.45, '#3a0a60'); g.addColorStop(0.8, '#a3186f'); g.addColorStop(1, '#ff527a');
    c.fillStyle = g; c.fillRect(0, 0, W, hor);
    for(let i = 0; i < 80; i++){ c.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.7})`; c.fillRect(rand() * W, rand() * hor * 0.55, rand() < 0.15 ? 2 : 1, 1); }
    // 太陽：光暈 → 圓盤（下半截一條條橫縫，越往下越寬）
    const sunR = Hh * 0.24, sunX = W * 0.5, sunY = hor - Hh * 0.07;
    g = c.createRadialGradient(sunX, sunY, sunR * 0.6, sunX, sunY, sunR * 2.1); g.addColorStop(0, 'rgba(255,90,160,.45)'); g.addColorStop(1, 'rgba(255,60,140,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, hor);
    const sun = cnv(W, Hh), q = sun.getContext('2d');
    g = q.createLinearGradient(0, sunY - sunR, 0, sunY + sunR); g.addColorStop(0, '#fff27a'); g.addColorStop(0.5, '#ffa04a'); g.addColorStop(1, '#ff2f8e');
    q.fillStyle = g; q.beginPath(); q.arc(sunX, sunY, sunR, 0, TAU); q.fill();
    q.globalCompositeOperation = 'destination-out';
    const P = 8 * k;
    for(let y0 = sunY - sunR * 0.15; y0 < sunY + sunR; y0 += P){ const gap = clamp((y0 + P / 2 - sunY + sunR * 0.15) / (sunR * 1.15), 0, 1) * P * 0.75; q.fillRect(0, y0, W, gap); }
    c.drawImage(sun, 0, 0);
    // 地面底色＋往消失點收的直線（靜態；橫線另外用會捲的帶子）
    g = c.createLinearGradient(0, hor, 0, Hh); g.addColorStop(0, '#2c0543'); g.addColorStop(1, '#06010e');
    c.fillStyle = g; c.fillRect(0, hor, W, Hh - hor);
    c.strokeStyle = 'rgba(255,70,200,.85)'; c.lineWidth = 1.1 * k; c.beginPath();
    for(let i = -14; i <= 14; i++){ c.moveTo(W / 2 + i * W * 0.018, hor); c.lineTo(W / 2 + i * W * 0.16, Hh); }
    c.stroke();
    // 前景：線框遠山（青）→ 山丘 → 圓頂與柏樹剪影
    const mt = [];
    for(let x = 0; x <= W; x += W / 14) mt.push([x, hor - (10 + rand() * 34 * (0.4 + 0.6 * Math.abs(Math.sin(x / W * 5)))) * k]);
    c.fillStyle = '#16042b'; c.beginPath(); c.moveTo(0, hor); mt.forEach(p => c.lineTo(p[0], p[1])); c.lineTo(W, hor); c.fill();
    c.strokeStyle = 'rgba(60,230,255,.9)'; c.lineWidth = 1.2 * k; c.beginPath(); mt.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
    c.strokeStyle = 'rgba(60,230,255,.35)'; c.lineWidth = 0.8 * k; c.beginPath();
    for(let i = 1; i < mt.length; i++){ c.moveTo(mt[i][0], mt[i][1]); c.lineTo((mt[i][0] + mt[i - 1][0]) / 2, hor); c.lineTo(mt[i - 1][0], mt[i - 1][1]); }
    c.stroke();
    c.fillStyle = '#0c0118';
    c.beginPath(); c.moveTo(0, hor); c.quadraticCurveTo(W * 0.25, hor - 16 * k, W * 0.55, hor - 6 * k); c.quadraticCurveTo(W * 0.8, hor - 1 * k, W, hor - 10 * k); c.lineTo(W, hor + 1); c.lineTo(0, hor + 1); c.fill();
    const dx = W * 0.64, dy = hor - 7 * k;                                    // 圓頂：鼓座＋尖拱穹頂＋頂塔；旁邊一座鐘樓
    c.fillRect(dx - 22 * k, dy - 16 * k, 44 * k, 16 * k);
    c.beginPath(); c.moveTo(dx - 20 * k, dy - 16 * k); c.bezierCurveTo(dx - 20 * k, dy - 40 * k, dx - 5 * k, dy - 50 * k, dx, dy - 52 * k); c.bezierCurveTo(dx + 5 * k, dy - 50 * k, dx + 20 * k, dy - 40 * k, dx + 20 * k, dy - 16 * k); c.fill();
    c.fillRect(dx - 4 * k, dy - 62 * k, 8 * k, 11 * k); c.beginPath(); c.moveTo(dx - 3 * k, dy - 62 * k); c.lineTo(dx, dy - 72 * k); c.lineTo(dx + 3 * k, dy - 62 * k); c.fill();
    c.fillRect(dx + 32 * k, dy - 34 * k, 9 * k, 34 * k);
    for(const [x, hh] of [[W * 0.2, 46], [W * 0.235, 34], [W * 0.27, 52], [W * 0.84, 40], [W * 0.875, 30]]){ c.beginPath(); c.ellipse(x, hor - 8 * k - hh * k / 2, 4.5 * k, hh * k / 2, 0, 0, TAU); c.fill(); }
    return { cv, horFrac: hor / Hh };
  }
  // 網格橫線帶：一列一列頂點，v＝透視深度（越靠地平線越擠）；貼圖每一格一條亮線 → 捲動位移＝線往觀眾跑
  const rowTex = (() => { const cv = cnv(4, 32), c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, 4, 32); c.fillStyle = '#fff'; c.fillRect(0, 0, 4, 3);
    const t = ctex(cv, { srgb: false }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  function gridRowsGeo(iw, gh){
    const K = 40, pos = [], uv = [], col = [], idx = [];
    for(let k = 0; k <= K; k++){
      const sv = Math.max(0.018, Math.pow(k / K, 1.8)), y = gh / 2 - sv * gh, v = 0.35 / (0.6 * sv), a = clamp(sv * 3.5, 0, 1);
      pos.push(-iw / 2, y, 0, iw / 2, y, 0); uv.push(0, v, 1, v); col.push(a, a, a, a, a, a);
      if(k){ const b = (k - 1) * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeBoundingSphere(); return g;
  }
  // 8b. 達文西替《神聖比例》畫的「空心」菱形立方八面體（VIGINTISEX BASIUM VACUUM）：背景是靜態的金色草圖，前面浮一個真的 3D 霓虹線框
  const RS = 1 + Math.SQRT2, PV = [], PE = [];
  for(const [i, j, l] of [[0, 1, 2], [1, 2, 0], [2, 0, 1]]) for(const a of [-1, 1]) for(const bb of [-1, 1]) for(const cc of [-1, 1]){ const v = [0, 0, 0]; v[i] = a; v[j] = bb; v[l] = cc * RS; PV.push(v); }
  for(let i = 0; i < PV.length; i++) for(let j = i + 1; j < PV.length; j++) if(Math.abs(Math.hypot(PV[i][0] - PV[j][0], PV[i][1] - PV[j][1], PV[i][2] - PV[j][2]) - 2) < 1e-3) PE.push([i, j]);
  function paintPoly(W, Hh){
    const cv = cnv(W, Hh), c = cv.getContext('2d'), k = W / 256;
    const g = c.createRadialGradient(W / 2, Hh * 0.45, 10, W / 2, Hh / 2, Hh * 0.7); g.addColorStop(0, '#16204a'); g.addColorStop(1, '#04060f');
    c.fillStyle = g; c.fillRect(0, 0, W, Hh);
    for(let i = 0; i < 2500; i++){ c.fillStyle = `rgba(255,230,180,${rand() * 0.03})`; c.fillRect(rand() * W, rand() * Hh, 1, 1); }
    c.strokeStyle = 'rgba(214,170,80,.22)'; c.lineWidth = 1 * k;
    c.beginPath(); c.arc(W / 2, Hh * 0.46, W * 0.36, 0, TAU); c.stroke();
    c.beginPath(); c.moveTo(W / 2, Hh * 0.06); c.lineTo(W / 2, Hh * 0.86); c.moveTo(W * 0.08, Hh * 0.46); c.lineTo(W * 0.92, Hh * 0.46); c.stroke();
    // 金色墨線的草圖（固定角度），跟前面轉動的霓虹立體疊在一起
    const ay = 0.6, ax = 0.5, cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax), sc = W * 0.118;
    const P = PV.map(([x, y, z]) => { const x1 = x * cy + z * sy, z1 = -x * sy + z * cy, y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx, pp = 7 / (7 - z2); return [W / 2 + x1 * sc * pp, Hh * 0.46 - y1 * sc * pp]; });
    c.strokeStyle = 'rgba(222,178,96,.5)'; c.lineWidth = 1.2 * k; c.beginPath();
    for(const [a, b] of PE){ c.moveTo(P[a][0], P[a][1]); c.lineTo(P[b][0], P[b][1]); }
    c.stroke();
    c.fillStyle = 'rgba(226,186,98,.85)'; c.font = `italic ${11 * k}px "Times New Roman", Georgia, serif`; c.textAlign = 'center';
    c.fillText('VIGINTISEX  BASIUM  VACUUM', W / 2, Hh * 0.93);
    return cv;
  }
  function polyStrutGeos(SC){
    const core = [], glow = [], dots = [], m4 = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), SIDE = new THREE.Vector3(1, 0, 0);
    for(const [i, j] of PE){
      a.fromArray(PV[i]).multiplyScalar(SC); b.fromArray(PV[j]).multiplyScalar(SC);
      const L = a.distanceTo(b), up = Math.abs(b.y - a.y) > 0.99 * L ? SIDE : UP;
      const mk = t => { const g = new THREE.BoxGeometry(t, t, L); m4.lookAt(a, b, up); m4.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return g.applyMatrix4(m4); };
      core.push(mk(0.0034)); glow.push(mk(0.012));
    }
    for(const v of PV) dots.push(new THREE.SphereGeometry(0.0058, 8, 6).translate(v[0] * SC, v[1] * SC, v[2] * SC));
    return [core, glow, dots].map(l => BGU.mergeGeometries(l));
  }
  const paintings = [];
  const sun = paintSunset(LOW ? 256 : 384, LOW ? 172 : 256), sunsetTex = ctex(sun.cv);
  const gridMat = new THREE.MeshBasicMaterial({ map: rowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: C_MAG.clone() });
  {
    const zc = clamp((Z0 + orgZ0) / 2, Z0 + 0.46, orgZ0 - 0.46);
    const g = grp(X0 + 0.004, 2.04, zc, Math.PI / 2);
    const { mat, pg, iw, ih } = baroqueFrame(g, 0.84, 0.62, false, sunsetTex);
    const gh = ih * (1 - sun.horFrac);
    const rows = A(gridRowsGeo(iw, gh), gridMat, 0, -ih / 2 + gh / 2, 0.0135, pg); rows.renderOrder = 4; noPhoto(rows);
    paintings.push(mat);
  }
  const polyTex = ctex(paintPoly(LOW ? 192 : 256, LOW ? 268 : 358));
  const polyCoreMat = new THREE.MeshBasicMaterial({ color: C_CYAN.clone() });
  const polyGlowMat = new THREE.MeshBasicMaterial({ color: C_CYAN.clone(), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
  const polyDotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc45e) });
  const polyG = new THREE.Group(); polyG.name = 'br2-poly';
  {
    const zc = clamp((bedZ0 + bedZ1) / 2, Z0 + 0.45, eastStop - 0.45);
    const g = grp(X1 - 0.004, 1.68, zc, -Math.PI / 2);
    const { mat, pg } = baroqueFrame(g, 0.56, 0.72, true, polyTex);
    paintings.push(mat);
    polyG.position.set(0, 0.03, 0.17); pg.add(polyG);
    const [core, glow, dots] = polyStrutGeos(0.05);
    A(core, polyCoreMat, 0, 0, 0, polyG); A(dots, polyDotMat, 0, 0, 0, polyG);
    const gl = A(glow, polyGlowMat, 0, 0, 0, polyG); gl.renderOrder = 4; noPhoto(gl);
  }

  /* ============================================================
     9. 霓虹燭台（西南角）：金色車削燭台、三支霓虹蠟燭、會閃的火光
     ============================================================ */
  const flames = [];
  {
    const cg = grp(candX, FL, candZ, 0.5);
    M(new THREE.LatheGeometry([[0, 0], [0.12, 0], [0.12, 0.012], [0.09, 0.03], [0.05, 0.05], [0.03, 0.09], [0.022, 0.2], [0.045, 0.24], [0.02, 0.28], [0.016, 0.62], [0.035, 0.66], [0.018, 0.7], [0.014, 1.12], [0.04, 1.16], [0.02, 1.2], [0.03, 1.3], [0, 1.31]].map(p => new THREE.Vector2(p[0], p[1])), SEG), MT.gold, 0, 0, 0, cg);
    const arms = [];
    for(const sx of [-1, 1]){
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 1.26, 0), new THREE.Vector3(sx * 0.2, 1.22, 0), new THREE.Vector3(sx * 0.2, 1.42, 0));
      arms.push(new THREE.TubeGeometry(curve, 16, 0.009, 6, false));
    }
    M(BGU.mergeGeometries(arms), MT.gold, 0, 0, 0, cg);
    const cups = [[0, 1.31, 0], [-0.2, 1.42, 0], [0.2, 1.42, 0]];
    cg.updateWorldMatrix(true, false);
    cups.forEach(([x, y, z], i) => {
      M(new THREE.CylinderGeometry(0.035, 0.018, 0.035, 16), MT.gold, x, y + 0.017, z, cg);
      const top = y + 0.035, h = i === 0 ? 0.2 : 0.16;
      const wp = cg.localToWorld(new THREE.Vector3(x, top, z));
      neonTube(new THREE.CylinderGeometry(0.011, 0.011, h, 10).translate(wp.x, wp.y + h / 2, wp.z), i === 1 ? NEON_M : NEON_C);
      flames.push({ pos: new THREE.Vector3(wp.x, wp.y + h + 0.035, wp.z), col: i === 1 ? NEON_M : NEON_C });
    });
    ctx.colliders.push({ x0: candX - 0.16, x1: candX + 0.16, z0: candZ - 0.16, z1: candZ + 0.16, y1: 1.7 });
  }
  const flameMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowRadial, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), flames.length);
  flameMesh.name = 'br2-flames'; flameMesh.castShadow = false; flameMesh.frustumCulled = false; flameMesh.renderOrder = 5;
  flameMesh.userData.noBake = true; flameMesh.userData.noPhoto = true; dyn.add(flameMesh);
  flames.forEach((f, i) => { f.col = (f.col === NEON_M ? C_MAG : C_CYAN).clone().lerp(new THREE.Color(1, 1, 1), 0.35); flameMesh.setMatrixAt(i, new THREE.Matrix4().compose(f.pos, new THREE.Quaternion(), new THREE.Vector3(0.1, 0.15, 1))); flameMesh.setColorAt(i, f.col); });

  /* ============================================================
     10. 飄的音符（從管風琴飄出來、往上往房內飄、淡掉）＋地板玫瑰窗的鼓點波紋
     ============================================================ */
  const NOTE_N = LOW ? 6 : 10;
  const noteMeshes = [0, 1].map(k => {
    const mat = new THREE.MeshBasicMaterial({ map: noteTex(k), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, NOTE_N);
    im.userData.noBake = true; im.userData.noPhoto = true; im.userData.noCut = true; im.castShadow = false; im.frustumCulled = false; im.renderOrder = 5;
    im.name = 'br2-notes-' + k; dyn.add(im);
    for(let i = 0; i < NOTE_N; i++){ im.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); im.setColorAt(i, new THREE.Color(0, 0, 0)); }
    return im;
  });
  const notes = [];
  for(let k = 0; k < 2; k++) for(let i = 0; i < NOTE_N; i++) notes.push({ im: noteMeshes[k], i, age: 9, life: 0, s: 0.07, shown: false, p: new THREE.Vector3(), v: new THREE.Vector3(), col: new THREE.Color(), ph: 0 });
  const rippleMat = [0, 1].map(() => addGlow(null, 0xff3ad8, 0));
  const ringGeo = new THREE.RingGeometry(0.93, 1, 64); ringGeo.rotateX(-Math.PI / 2);
  const ripples = rippleMat.map(m => { const o = A(ringGeo, m, roseX, FL + 0.005, roseZ); o.renderOrder = 3; o.scale.setScalar(roseR); noPhoto(o); return { o, m, age: 9 }; });

  /* ============================================================
     11. 燈（最多 2 盞）與碰撞
     ============================================================ */
  const lampCeil = { pos: new THREE.Vector3(CXR, H - 0.12, CZR), kind: 'ceiling', room: ROOM, color: 0xbba6ff, power: 0.8, always: 0.4, mul: 1 };
  const lampOrg  = { pos: new THREE.Vector3(X0 + 0.62, 1.85, orgZc), kind: 'floor', room: ROOM, color: 0xd35cff, power: 1.1, always: 0.55, mul: 1 };
  ctx.lamps.push(lampCeil, lampOrg);

  /* ============================================================
     12. 合併：靜態網格依材質合成一個（每種材質一個 draw call）；霓虹管合成一個
     ============================================================ */
  og.updateWorldMatrix(true, true); ogA.updateWorldMatrix(true, true);
  for(const i of orgNeonIdx) neonGeos[i].applyMatrix4(og.matrixWorld);   // 管風琴局部座標建的那兩條霓虹 → 世界座標
  let neonMesh = null;
  if(neonGeos.length){
    const list = neonGeos.map(g => { const q = g.index ? g.toNonIndexed() : g; for(const k of Object.keys(q.attributes)) if(!['position', 'normal', 'uv'].includes(k)) q.deleteAttribute(k); if(!q.attributes.normal) q.computeVertexNormals(); return q; });
    const g = BGU.mergeGeometries(list);
    if(g){ g.computeBoundingSphere(); neonMesh = new THREE.Mesh(g, MT.neon); neonMesh.name = 'br2-neon'; neonMesh.castShadow = false; neonMesh.receiveShadow = false; neonMesh.userData.noBake = true; root.add(neonMesh); }
  }
  bake();
  function bake(){
    stat.updateWorldMatrix(true, true);
    const byMat = new Map(), doomed = [];
    stat.traverse(o => {
      if(!o.isMesh || o.userData.noBake || !o.geometry || !o.geometry.attributes.position || Array.isArray(o.material)) return;
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      const keepC = !!o.material.vertexColors;
      for(const k of Object.keys(g.attributes)) if(!['position', 'normal', 'uv', ...(keepC ? ['color'] : [])].includes(k)) g.deleteAttribute(k);
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
      mesh.castShadow = !m.transparent && m !== MT.wall && m !== MT.wains && m !== MT.flute; mesh.receiveShadow = true; mesh.name = 'br2-baked';   // 柱身發光強度每格在變 → 不投影
      // 先畫（在 arch 的牆／地板之前）：被這些面擋住的 arch 像素會被深度測試直接丟掉，不必著色兩次（壁紙、地板都貼在 arch 面前 3–6 mm）
      mesh.renderOrder = -1;
      stat.add(mesh);
    }
    const prune = o => { for(let i = o.children.length - 1; i >= 0; i--){ const c = o.children[i]; if(c.isGroup){ prune(c); if(c.children.length === 0) o.remove(c); } } };
    prune(stat);
  }

  /* ============================================================
     13. 音樂：〈綠袖子〉（16 世紀英格蘭民謠，公有領域）
         3/4 拍、八分音符 0.22 秒；前奏 4 小節（大鍵琴分解和弦）→ 主歌 16 → 副歌 16，循環（一輪約 47.5 秒）
         鼓照 6/8 的感覺打：每小節第 1 個八分音符大鼓、第 4 個小鼓；貝斯每個八分音符一下（合成器浪潮那種推進感）
         同一份樂譜同時驅動畫面（管子、琴鍵、地板、音符、燈）→ 聲音關著時畫面照樣「在演奏」，打開聲音後畫面跟聲音對拍
     ============================================================ */
  const E8 = 0.22, BAR = 6 * E8;
  // 旋律：每小節「MIDI 音高:幾個八分音符」；r＝休止
  const MEL = [
    '72:4 74:2', '76:3 77:1 76:2', '74:4 71:2', '67:3 69:1 71:2', '72:4 69:2', '69:3 68:1 69:2', '71:4 68:2', '64:4 69:2',
    '72:4 74:2', '76:3 77:1 76:2', '74:4 71:2', '67:3 69:1 71:2', '72:3 71:1 69:2', '68:3 66:1 68:2', '69:6', '69:4 r:2',
    '79:6', '79:3 78:1 76:2', '74:4 71:2', '67:3 69:1 71:2', '72:4 69:2', '69:3 68:1 69:2', '71:4 68:2', '64:6',
    '79:6', '79:3 78:1 76:2', '74:4 71:2', '67:3 69:1 71:2', '72:3 71:1 69:2', '68:3 66:1 68:2', '69:6', '69:4 r:2',
  ];
  const CH = ('Am F G E ' +                                              // 前奏
              'Am C G Em Am F E E Am C G Em F E Am Am ' +                 // 主歌
              'C C G Em Am F E Am C C G Em F E Am Am').split(' ');       // 副歌
  const CHORD = { Am: { r: 45, v: [57, 60, 64] }, F: { r: 41, v: [57, 60, 65] }, G: { r: 43, v: [55, 59, 62] },
                  E: { r: 40, v: [56, 59, 64] }, C: { r: 48, v: [55, 60, 64] }, Em: { r: 40, v: [55, 59, 64] } };
  const NBAR = CH.length, LOOP = NBAR * BAR;
  const EV = [];
  for(let b = 0; b < NBAR; b++){
    const t0 = b * BAR, c = CHORD[CH[b]];
    EV.push({ t: t0, k: 'p', n: c.v, d: BAR });
    if(b >= 2) for(let i = 0; i < 6; i++){
      EV.push({ t: t0 + i * E8, k: 'b', m: c.r + [0, 0, 12, 0, 12, 7][i], d: E8 * 0.8, v: [1, .7, .85, .9, .75, .7][i] });
      EV.push({ t: t0 + i * E8, k: 'x', v: i % 3 === 0 ? 1 : 0.55, open: b >= 20 && i === 5 && b % 2 === 0 });
    }
    if(b >= 4){
      EV.push({ t: t0, k: 'k', v: 1 });
      EV.push({ t: t0 + 3 * E8, k: 's', v: 1 });
      if(b % 2 === 1) EV.push({ t: t0 + 5 * E8, k: 'k', v: 0.7 });
      c.v.forEach((m, i) => EV.push({ t: t0 + i * 0.022, k: 'h', m: m - 12, d: BAR * 0.9, v: 0.3 }));   // 大鍵琴每小節撥一次和弦
    }else{
      const arp = [c.v[0], c.v[1], c.v[2], c.v[0] + 12, c.v[2], c.v[1]];
      for(let i = 0; i < (b === 3 ? 4 : 6); i++) EV.push({ t: t0 + i * E8, k: 'h', m: arp[i], d: E8 * 1.6, v: 0.62, mel: true });
    }
  }
  EV.push({ t: 3 * BAR + 4 * E8, k: 'h', m: 69, d: 2 * E8, v: 1, mel: true });   // 弱起音
  MEL.forEach((bar, i) => {
    let e = 0; const t0 = (4 + i) * BAR;
    for(const tok of bar.split(' ')){
      const [m, d] = tok.split(':'), dd = +d;
      if(m !== 'r'){
        EV.push({ t: t0 + e * E8, k: 'h', m: +m, d: dd * E8, v: 1, mel: true });
        if(i >= 16) EV.push({ t: t0 + e * E8, k: 'l', m: +m, d: dd * E8 });   // 副歌：加一條低八度的鋸齒波主奏
      }
      e += dd;
    }
  });
  EV.sort((a, b) => a.t - b.t);
  const TR = { k: [], s: [], x: [], b: [], mel: [] };
  for(const e of EV){ if(e.k === 'h'){ if(e.mel) TR.mel.push(e); } else if(TR[e.k]) TR[e.k].push(e); }
  const lastOf = (arr, lt) => { let lo = 0, hi = arr.length - 1, r = -1; while(lo <= hi){ const m = (lo + hi) >> 1; if(arr[m].t <= lt){ r = m; lo = m + 1; } else hi = m - 1; } return r; };
  const ago = (arr, lt) => { const i = lastOf(arr, lt); return i < 0 ? (arr.length ? lt + LOOP - arr[arr.length - 1].t : 99) : lt - arr[i].t; };

  // ---------- 合成器（第一次按 🔊 才建；之後只調音量） ----------
  let AU = null;
  if(ctx.audio && typeof ctx.audio.register === 'function') ctx.audio.register((ac, out) => {
    try{ AU = initAudio(ac, out); }catch(e){ console.warn('[theme_br2] 聲音初始化失敗', e); AU = null; }
  });
  function initAudio(ac, out){
    const U = { ac, live: false, started: false, t0: 0, idx: 0, loopBase: 0, lastPos: -1 };
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    const G = v => { const g = ac.createGain(); g.gain.value = v; return g; };
    // 位置音量 → 悶聲濾波（出了房門越遠越悶）→ 總開關
    U.pos = G(0); U.lp = ac.createBiquadFilter(); U.lp.type = 'lowpass'; U.lp.frequency.value = 18000; U.lp.Q.value = 0.5;
    U.pos.connect(U.lp); U.lp.connect(out);
    const mix = G(0.72); mix.connect(U.pos);
    // 殘響（像在石造教堂裡）：程式產生的衝激響應
    const sr = ac.sampleRate, len = Math.floor(sr * (LOW ? 1.8 : 2.8)), ir = ac.createBuffer(2, len, sr);
    for(let ch = 0; ch < 2; ch++){ const d = ir.getChannelData(ch); for(let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < sr * 0.01 ? i / (sr * 0.01) : 1); }
    const rev = ac.createConvolver(); rev.buffer = ir;
    const revIn = G(1), revOut = G(0.32); revIn.connect(rev); rev.connect(revOut); revOut.connect(mix);
    // 迴聲：附點八分音符、每次回來暗一點
    const dl = ac.createDelay(1.0); dl.delayTime.value = 1.5 * E8;
    const fb = G(0.3), dlp = ac.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2600;
    dl.connect(dlp); dlp.connect(fb); fb.connect(dl);
    const dlOut = G(0.45); dlp.connect(dlOut); dlOut.connect(mix);
    const dlIn = G(1); dlIn.connect(dl);
    const bus = (toRev, toDl) => { const g = G(1); g.connect(mix); if(toRev){ const s = G(toRev); g.connect(s); s.connect(revIn); } if(toDl){ const s = G(toDl); g.connect(s); s.connect(dlIn); } return g; };
    U.harp = bus(0.35, 0.2); U.lead = bus(0.3, 0.25); U.drum = bus(0.1, 0);
    U.snareRev = G(0.45); U.snareRev.connect(revIn);
    U.duck = G(1); U.duck.connect(mix); { const s = G(0.12); U.duck.connect(s); s.connect(revIn); }   // 側鏈：大鼓時貝斯與和弦讓一下
    U.bass = G(1); U.bass.connect(U.duck); U.pad = G(1); U.pad.connect(U.duck);
    // 大鍵琴音色：在弦長 12% 處撥弦 → 泛音有梳狀缺口（鼻音、亮）
    const NH = 40, re = new Float32Array(NH + 1), im = new Float32Array(NH + 1);
    for(let n = 1; n <= NH; n++) im[n] = Math.pow(n, -0.8) * Math.abs(Math.sin(n * Math.PI * 0.12)) * (n === 1 ? 1.4 : 1);
    U.wave = ac.createPeriodicWave(re, im);
    const nb = ac.createBuffer(1, sr, sr), nd = nb.getChannelData(0); for(let i = 0; i < sr; i++) nd[i] = Math.random() * 2 - 1;
    const noise = (t, dur, type, f, q, peak, dest) => {
      const s = ac.createBufferSource(); s.buffer = nb;
      const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const e = G(0); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(peak, t + 0.002); e.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      s.connect(fl); fl.connect(e); e.connect(dest);
      s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    };
    const osc = (type, f, t, stopAt, dest, detune = 0) => {
      const o = ac.createOscillator(); if(type === 'harp') o.setPeriodicWave(U.wave); else o.type = type;
      o.frequency.value = f; o.detune.value = detune; o.connect(dest); o.start(t); o.stop(stopAt); return o;
    };
    U.play = (e, t) => {
      switch(e.k){
        case 'h': {   // 大鍵琴：撥下去就一路衰減，放鍵時制音器很快壓掉
          const f = mtof(e.m), off = t + e.d, dec = 1.5 * Math.pow(2, -(e.m - 60) / 24);
          const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
          lp.frequency.setValueAtTime(Math.min(15000, f * 16), t); lp.frequency.exponentialRampToValueAtTime(Math.max(1000, f * 3.2), t + 0.35);
          const env = G(0), pk = 0.34 * e.v;
          env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(pk, t + 0.003); env.gain.setTargetAtTime(0, t + 0.003, dec / 4); env.gain.setTargetAtTime(0, off, 0.03);
          const g2 = G(0.28); g2.connect(lp);
          osc('harp', f, t, off + 0.25, lp); osc('harp', f * 2, t, off + 0.25, g2, 4);   // 8 呎＋4 呎兩組弦
          lp.connect(env); env.connect(U.harp);
          noise(t, 0.018, 'highpass', 2800, 0.7, 0.09 * e.v, U.harp);                   // 撥片「喀」一聲
          break;
        }
        case 'b': {   // 合成器貝斯：兩支鋸齒波＋低八度方波，濾波器一撥就關
          const f = mtof(e.m), off = t + e.d;
          const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 5;
          lp.frequency.setValueAtTime(Math.min(3000, f * 14), t); lp.frequency.exponentialRampToValueAtTime(Math.max(160, f * 2.2), t + 0.14);
          const env = G(0), pk = 0.1 * e.v;
          env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(pk, t + 0.004); env.gain.setTargetAtTime(pk * 0.6, t + 0.004, 0.07); env.gain.setTargetAtTime(0, off, 0.02);
          osc('sawtooth', f, t, off + 0.15, lp, -7); osc('sawtooth', f, t, off + 0.15, lp, 7);
          const sub = G(0.35); sub.connect(lp); osc('square', f / 2, t, off + 0.15, sub);
          lp.connect(env); env.connect(U.bass);
          break;
        }
        case 'p': {   // 鋪底和弦：左右兩支微走音的鋸齒波
          const off = t + e.d, lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 0.4;
          const env = G(0); env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.035, t + 0.3); env.gain.setTargetAtTime(0, off, 0.25);
          lp.connect(env); env.connect(U.pad);
          let L = lp, Rr = lp;
          if(ac.createStereoPanner){ L = ac.createStereoPanner(); Rr = ac.createStereoPanner(); L.pan.value = -0.6; Rr.pan.value = 0.6; L.connect(lp); Rr.connect(lp); }
          for(const m of e.n){ const f = mtof(m); osc('sawtooth', f, t, off + 1.2, L, -9); osc('sawtooth', f, t, off + 1.2, Rr, 9); }
          break;
        }
        case 'l': {   // 副歌主奏（低八度、帶顫音）
          const f = mtof(e.m - 12), off = t + e.d;
          const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 1;
          const env = G(0); env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.045, t + 0.03); env.gain.setTargetAtTime(0.033, t + 0.03, 0.2); env.gain.setTargetAtTime(0, Math.max(t + 0.04, off - 0.02), 0.06);
          const o1 = osc('sawtooth', f, t, off + 0.4, lp, -5), o2 = osc('square', f, t, off + 0.4, lp, 5);
          if(e.d > 0.4){ const lfo = ac.createOscillator(), lg = G(0); lfo.frequency.value = 5.4; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(7, t + 0.35); lfo.connect(lg); lg.connect(o1.detune); lg.connect(o2.detune); lfo.start(t); lfo.stop(off + 0.4); }
          lp.connect(env); env.connect(U.lead);
          break;
        }
        case 'k': {   // 大鼓
          const o = ac.createOscillator(), env = G(0); o.type = 'sine';
          o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
          env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.66 * e.v, t + 0.003); env.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
          o.connect(env); env.connect(U.drum); o.start(t); o.stop(t + 0.45);
          noise(t, 0.012, 'bandpass', 1800, 1, 0.16 * e.v, U.drum);
          U.duck.gain.setTargetAtTime(0.4, t, 0.006); U.duck.gain.setTargetAtTime(1, t + 0.05, 0.12);
          break;
        }
        case 's': {   // 小鼓（大殘響，八〇年代那種）
          noise(t, 0.24, 'bandpass', 1900, 0.7, 0.56 * e.v, U.drum);
          noise(t, 0.3, 'bandpass', 1600, 0.6, 0.34 * e.v, U.snareRev);
          const o = ac.createOscillator(), env = G(0); o.type = 'triangle'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.1);
          env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.26, t + 0.002); env.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          o.connect(env); env.connect(U.drum); o.start(t); o.stop(t + 0.14);
          break;
        }
        case 'x': noise(t, e.open ? 0.22 : 0.045, 'highpass', 7200, 0.7, 0.12 * e.v, U.drum); break;
      }
    };
    return U;
  }
  let musicT = 0;                                       // 樂曲時間（秒，一直往前走；取 % LOOP 得到這一輪的位置）
  function resync(){                                     // 聲音剛打開／分頁切回來：從畫面目前演到的地方接著排程
    const U = AU, t0 = U.ac.currentTime - musicT;
    // 畫面時鐘跟 AudioContext 還對得上（差不到 0.15 秒）→ 沿用原本的起點（不然已排進去的音的時間會整批位移）
    if(!U.started || Math.abs(t0 - U.t0) >= 0.15) U.t0 = t0;
    // 排程游標＝樂譜上的絕對位置（第幾輪＋第幾個音），⛔ 只往前、不往回：
    // 游標前面的音已經排進 AudioContext 了，往回拉就會重響（卡一格、關開聲音時實測過）；落後（例如靜音很久）就直接跳到現在
    const start = U.ac.currentTime - U.t0 + 0.06, cur = U.started ? U.loopBase + EV[U.idx].t : -1;
    U.started = true;
    if(cur >= start) return;
    U.loopBase = Math.floor(start / LOOP) * LOOP;
    const lt = start - U.loopBase;
    let i = 0; while(i < EV.length && EV[i].t < lt) i++;
    if(i >= EV.length){ i = 0; U.loopBase += LOOP; }
    U.idx = i;
  }
  function schedule(){                                   // 往前排 0.25 秒內要響的音
    const U = AU, now = U.ac.currentTime, horizon = now + 0.25;
    for(let guard = 0; guard < 400; guard++){
      const e = EV[U.idx], at = U.t0 + U.loopBase + e.t;
      if(at > horizon) break;
      if(at >= now - 0.02) U.play(e, Math.max(at, now));
      if(++U.idx >= EV.length){ U.idx = 0; U.loopBase += LOOP; }
    }
  }
  const doorC = new THREE.Vector3((dA0 + dA1) / 2, 1.1, Z1);
  // 門洞走道側那一面（牆厚 c0..c1 的 c1）
  const DOOR_C1 = door && door.c1 > Z1 ? door.c1 : Z1 + 0.15;
  const _ap = [0, 1, 2, 3].map(() => new THREE.Vector3());     // 門洞口四個角（每格重用）
  function posAudio(){                                   // 人在哪 → 多大聲、多悶
    const U = AU, now = U.ac.currentTime;
    if(now - U.lastPos < 0.08) return; U.lastPos = now;
    const p = camera.position; let g, f;
    if(ctx.getMode && ctx.getMode() === 'bird'){ g = 0.3; f = 6000; }
    else if(p.x >= X0 && p.x <= X1 && p.z >= Z0 && p.z <= Z1){ g = 1; f = 18000; }
    else { const d = Math.hypot(p.x - doorC.x, p.z - doorC.z); g = 0.6 * Math.exp(-d / 1.1); f = 600 + 5000 * Math.exp(-d / 1.3); if(g < 0.012) g = 0; }   // 門口 0.5 → 1.3 m 外 0.18 → 3 m 外 0.04
    U.pos.gain.setTargetAtTime(g, now, 0.18); U.lp.frequency.setTargetAtTime(f, now, 0.18);
  }

  /* ============================================================
     14. 每格：看得到才動（走動模式人在房裡／門口看得到房門、或俯瞰）→ poke；否則什麼都不做
     ============================================================ */
  const DEG = Math.PI / 180, LAT = 25.03 * DEG, DECL = 8 * DEG, NOON = 12.15;   // 跟 lighting.js 同一條太陽公式
  const nightOf = h => { const ha = (h - NOON) * 15 * DEG; const e = Math.asin(clamp(Math.sin(LAT) * Math.sin(DECL) + Math.cos(LAT) * Math.cos(DECL) * Math.cos(ha), -1, 1)) / DEG; return 1 - smooth(-3, 9, e); };
  const S = { vis: -1, t: 0, acc: 0, skip: 0, rip: 0, photoNight: -1, lastKick: -2, lastMel: -2, level: 0, glitchNext: 1.2, glitchEnd: 0, gN: 1, flickNext: 8, flickEnd: 0 };
  const _m = new THREE.Matrix4(), _q0 = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _sph = new THREE.Sphere();
  const frustum = new THREE.Frustum(), pvm = new THREE.Matrix4();
  const WHITE = new THREE.Color(1, 1, 1);
  function updFrustum(){ camera.updateMatrixWorld(); pvm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pvm); }
  const roomBox = new THREE.Box3(new THREE.Vector3(X0, 0, Z0), new THREE.Vector3(X1, H, Z1));
  let tallCol = null;                                    // 高過 2 m 的碰撞盒（牆、高櫃）：擋視線用；第一次用到時才收（那時所有模組都蓋好了）
  const segHits = (ax, az, bx, bz, c) => {               // 平面上的線段 vs 方框（slab 法）
    let t0 = 0, t1 = 1;
    for(const [p, d, lo, hi] of [[ax, bx - ax, c.x0, c.x1], [az, bz - az, c.z0, c.z1]]){
      if(Math.abs(d) < 1e-9){ if(p <= lo || p >= hi) return false; continue; }
      let u = (lo - p) / d, v = (hi - p) / d; if(u > v){ const w = u; u = v; v = w; }
      t0 = Math.max(t0, u); t1 = Math.min(t1, v); if(t0 >= t1) return false;
    }
    return true;
  };
  function worth(){
    if(ctx.getMode && ctx.getMode() === 'bird') return 2;
    const p = camera.position;
    if(p.x > X0 && p.x < X1 && p.z > Z0 && p.z < Z1) return 1;          // 人在房裡
    const dx = p.x - doorC.x, dz = p.z - doorC.z;
    if(dx * dx + dz * dz > 49) return 0;
    updFrustum();
    if(!frustum.intersectsBox(roomBox)) return 0;                      // 房間本身不在視野方向上（例如背對房間）
    if(p.x > dA0 && p.x < dA1 && p.z >= Z1 && p.z <= DOOR_C1) return 1;   // 人就站在門洞裡、面向房間
    // 走道側的門洞口（z＝DOOR_C1 的長方形）拿視錐的上下左右四個面去切（Sutherland–Hodgman；不切近平面 → 貼著門口也算）。
    // 切完還有剩 → 門洞有一塊在畫面裡；再從剩下那塊的角與中心，看平面上的視線（到房內 5 cm）有沒有被高的牆／櫃擋住
    let poly = [_ap[0].set(dA0, FL, DOOR_C1), _ap[1].set(dA1, FL, DOOR_C1), _ap[2].set(dA1, dH, DOOR_C1), _ap[3].set(dA0, dH, DOOR_C1)];
    for(let k = 0; k < 4 && poly.length; k++){
      const pl = frustum.planes[k], out = [];
      for(let i = 0; i < poly.length; i++){
        const a = poly[i], b = poly[(i + 1) % poly.length], da = pl.distanceToPoint(a), db = pl.distanceToPoint(b);
        if(da >= 0) out.push(a);
        if((da >= 0) !== (db >= 0)) out.push(new THREE.Vector3().lerpVectors(a, b, da / (da - db)));
      }
      poly = out;
    }
    if(!poly.length) return 0;
    if(!tallCol) tallCol = ctx.colliders.filter(c => c.y1 > 2.0);
    let cx = 0; for(const q of poly) cx += q.x / poly.length;
    for(const x of [cx, ...poly.map(q => q.x)]){
      const xs = clamp(x, dA0 + 0.03, dA1 - 0.03);
      let blocked = false;
      for(const c of tallCol) if(segHits(p.x, p.z, xs, Z1 - 0.05, c)){ blocked = true; break; }
      if(!blocked) return 1;
    }
    return 0;
  }
  function spawnNote(e, b){
    let n = null; for(const q of notes) if(q.age >= q.life){ n = q; break; }
    if(!n) return;
    let best = 0, bd = 9; for(let i = 0; i < pipes.length; i++){ const d = Math.abs(pipes[i].b - b) + rand() * 0.06; if(d < bd){ bd = d; best = i; } }
    const p = pipes[best];
    n.p.set(p.x, p.mouth + p.len * (0.35 + rand() * 0.3), 0.24); ogA.localToWorld(n.p);
    n.v.set(0.14 + rand() * 0.14, 0.12 + rand() * 0.1, (rand() - 0.5) * 0.16);
    n.age = 0; n.life = 3.0 + rand() * 1.2; n.ph = rand() * TAU; n.s = 0.055 + rand() * 0.035;
    n.col.copy(C_CYAN).lerp(C_MAG, rand()); if(rand() < 0.2) n.col.lerp(C_GOLD, 0.7);
  }
  function animate(dt, vis){
    const t = S.t, night = nightOf(ctx.time ?? 14), bird = vis === 2;
    updFrustum();
    // ---- 樂譜 → 包絡 ----
    const lt = ((musicT % LOOP) + LOOP) % LOOP;
    const kick = Math.exp(-ago(TR.k, lt) / 0.16), hat = Math.exp(-ago(TR.x, lt) / 0.06), bassE = Math.exp(-ago(TR.b, lt) / 0.2);
    let mi = lastOf(TR.mel, lt), mAgo;
    if(mi < 0){ mi = TR.mel.length - 1; mAgo = lt + LOOP - TR.mel[mi].t; } else mAgo = lt - TR.mel[mi].t;
    const me = TR.mel[mi];
    const melE = mAgo < me.d ? 1 - 0.35 * mAgo / me.d : 0.65 * Math.exp(-(mAgo - me.d) / 0.2);
    const bm = clamp((me.m - 57) / 24, 0.3, 1);
    const bi = lastOf(TR.b, lt), be = TR.b[bi < 0 ? TR.b.length - 1 : bi];
    const ki = lastOf(TR.k, lt);
    if(ki !== S.lastKick){ const fresh = S.lastKick !== -2 && ago(TR.k, lt) < 0.12; S.lastKick = ki; if(fresh){ S.rip = (S.rip + 1) % 2; ripples[S.rip].age = 0; } }
    if(mi !== S.lastMel){ const fresh = S.lastMel !== -2 && mAgo < 0.12; S.lastMel = mi; if(fresh) spawnNote(me, bm); }
    const tgt = Math.max(kick * 0.9, melE * 0.5, bassE * 0.4);
    S.level = tgt > S.level ? tgt : Math.max(tgt, S.level - dt * 1.5);
    // ---- 日夜強度 ----
    const kN = LOW ? lerp(1.0, 1.7, night) : lerp(1.25, 3.6, night);   // 霓虹管（晚上＞1 才會觸發泛光）
    const kG = lerp(0.4, 1.0, night);                                   // 假光暈
    if(Math.abs(night - S.photoNight) > 0.02){ S.photoNight = night; for(const m of photoBasics) m.needsUpdate = true; }
    MT.neon.color.setScalar(kN);                          // 不跟鼓點閃：📸 的替身只在日夜變時更新（鼓點交給旁邊的暈光）
    haloMat.color.setScalar(kG * (0.9 + 0.2 * kick));
    MT.floor.emissiveIntensity = lerp(0.5, 1.05, night) * (0.75 + 0.7 * kick);
    MT.flute.emissiveIntensity = lerp(0.8, 1.9, night) * (0.7 + 0.6 * kick);
    MT.fresco.emissiveIntensity = lerp(0.3, 0.46, night);
    // 招牌字：偶爾像老霓虹管一樣閃兩下
    if(t > S.flickNext){ S.flickEnd = t + 0.45; S.flickNext = t + 7 + rand() * 10; }
    signMat.color.setScalar(lerp(1.0, 2.3, night) * (t < S.flickEnd && Math.sin(t * 83) < 0.2 ? 0.18 : 1));
    // ---- 管風琴：等化器、牆上光暈、琴鍵、譜架 ----
    const kEq = LOW ? lerp(1.0, 1.6, night) : lerp(1.15, 2.8, night);
    for(let i = 0; i < pipes.length; i++){
      const p = pipes[i], b = p.b;
      const target = Math.max(0.07,
        kick * Math.exp(-((b / 0.16) ** 2)),
        bassE * 0.85 * Math.exp(-(((b - 0.2) / 0.13) ** 2)),
        melE * Math.exp(-(((b - bm) / 0.075) ** 2)),
        0.28 * Math.exp(-(((b - 0.5) / 0.3) ** 2)) * (0.6 + 0.4 * Math.sin(t * 1.3 + i)),
        hat * 0.5 * Math.exp(-(((b - 1) / 0.1) ** 2)));
      eqLv[i] = target > eqLv[i] ? target : Math.max(target, eqLv[i] - dt * 2.6);
      const lv = eqLv[i];
      _v.set(p.x, p.mouth, 0.17); _s.set(p.r * 1.05, Math.max(0.002, p.len * lv), p.r * 1.05);
      _m.compose(_v, _q0, _s); eq.setMatrixAt(i, _m);
      _c.copy(eqCol[i]).multiplyScalar((0.35 + 1.4 * lv) * kEq); eq.setColorAt(i, _c);
    }
    eq.instanceMatrix.needsUpdate = true; eq.instanceColor.needsUpdate = true;
    wallGlowMat.color.copy(C_VIO).multiplyScalar(kG * (0.35 + 0.8 * S.level));
    {
      const k0 = keyGlow[0], blk = isBlack(me.m);
      k0.position.set(keyX(me.m), blk ? 0.867 : 0.856, blk ? 0.3225 : 0.345); k0.scale.set(WK * (blk ? 0.56 : 0.9), 1, blk ? 0.065 : 0.1);
      keyGlowMat[0].color.copy(C_CYAN).multiplyScalar(melE * 1.8 * kG);
      const k1 = keyGlow[1], bb = isBlack(be.m), bEnv = Math.exp(-(bi < 0 ? 1 : lt - be.t) / 0.15);
      k1.position.set(keyX(be.m), bb ? 0.807 : 0.796, bb ? 0.41 : 0.435); k1.scale.set(WK * (bb ? 0.56 : 0.9), 1, bb ? 0.08 : 0.13);
      keyGlowMat[1].color.copy(C_MAG).multiplyScalar(bEnv * 1.6 * kG);
    }
    deskScoreMat.map.offset.x = (t * 0.035) % 1; deskScoreMat.color.setScalar(lerp(0.8, 1.5, night)).multiply(C_CYAN);
    // ---- 胸像、全像環 ----
    bust.rotation.y = t * 0.3;
    visorTex.offset.x = (t * 0.35) % 1; visorStripMat.color.setScalar(lerp(1.1, 2.6, night));
    brooch.material.color.copy(C_CYAN).multiplyScalar(lerp(1.1, 2.4, night));
    for(const r of rings){ r.pivot.rotation.y = t * r.spd; r.m.rotation.z = t * 0.7; r.mat.color.copy(r.base).multiplyScalar(lerp(0.9, 1.8, night) * (0.8 + 0.4 * kick)); }
    band.rotation.y = -t * 0.18; staffTex.offset.x = (t * 0.03) % 1; bandMat.color.copy(C_CYAN).multiplyScalar(lerp(0.6, 1.2, night));
    pedGlowMat.color.copy(C_MAG).lerp(C_VIO, 0.5 + 0.5 * Math.sin(t * 0.4)).multiplyScalar(kG * (0.7 + 0.5 * kick));
    // ---- 床底光、地板波紋、燭火 ----
    bedGlowMat.color.copy(C_MAG).lerp(C_CYAN, 0.5 + 0.5 * Math.sin(t * 0.25)).multiplyScalar(lerp(0.55, 1.25, night) * (0.9 + 0.2 * bassE));
    for(const r of ripples){
      if(r.age < 1){ r.age += dt; const k = Math.min(1, r.age); r.o.scale.setScalar(roseR * (0.35 + 1.15 * k)); r.m.opacity = (1 - k) * (1 - k); r.m.color.copy(C_MAG).lerp(C_CYAN, k).multiplyScalar(kG * 1.3); }
      else r.m.opacity = 0;
    }
    flames.forEach((fl, i) => {
      const f = 0.85 + 0.15 * Math.sin(t * 11 + i * 2) + 0.08 * Math.sin(t * 23 + i);
      _s.set(0.1 * f, 0.15 * f * (1 + 0.1 * Math.sin(t * 7 + i)), 1); _m.compose(fl.pos, camera.quaternion, _s); flameMesh.setMatrixAt(i, _m);
      _c.copy(fl.col).multiplyScalar(lerp(0.55, 1, night) * f); flameMesh.setColorAt(i, _c);
    });
    flameMesh.instanceMatrix.needsUpdate = true; flameMesh.instanceColor.needsUpdate = true;
    // ---- 飄的音符（對著相機）----
    const cq = camera.quaternion;
    for(const n of notes){
      if(n.age >= n.life){ if(n.shown){ _m.makeScale(0, 0, 0); n.im.setMatrixAt(n.i, _m); n.shown = false; } continue; }
      n.age += dt;
      n.p.addScaledVector(n.v, dt); n.p.z += Math.sin(t * 2.2 + n.ph) * 0.05 * dt;
      if(n.p.y > H - 0.3 || n.p.x > X1 - 0.2) n.life = Math.min(n.life, n.age + 0.35);
      const a = Math.min(1, n.age / 0.25) * clamp((n.life - n.age) / 0.7, 0, 1);
      _s.setScalar(n.s * (0.75 + 0.25 * a)); _m.compose(n.p, cq, _s); n.im.setMatrixAt(n.i, _m);
      _c.copy(n.col).multiplyScalar(a * kG * 1.6); n.im.setColorAt(n.i, _c); n.shown = true;
    }
    for(const im of noteMeshes){ im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
    // ---- 天花板：掃描線、掃描光帶、故障切片（俯瞰時天花板是關的，不必算）----
    if(!bird && ceil.visible){
      scanTex.offset.y = (t * 0.04) % 1;
      const ph = (t % 6) / 6; sweep.position.z = Z0 - 0.2 + ph * (RD + 0.4); sweepMat.opacity = 0.75 * kG + 0.25;
      if(t > S.glitchNext){ S.glitchEnd = t + 0.1 + rand() * 0.25; S.glitchNext = t + 1.2 + rand() * 3.5; S.gN = 1 + (rand() * 3 | 0); }
      const on = t < S.glitchEnd;
      slices.forEach((sl, i) => {
        if(!on || i >= S.gN){ sl.s.visible = false; return; }
        if(t > sl.next || !sl.s.visible){
          sl.next = t + 0.04 + rand() * 0.06;
          const d = 0.03 + rand() * 0.2, z = Z0 + rand() * (RD - d);
          sl.s.scale.set(RW, 1, d); sl.s.position.z = z + d / 2;
          sl.t.repeat.set(1, d / RD); sl.t.offset.set((rand() - 0.5) * 0.12, (z - Z0) / RD);
          sl.s.visible = true;
        }
      });
    }else slices.forEach(sl => { sl.s.visible = false; });
    // ---- 畫框：夕陽的網格橫線往前捲、多面體轉（都只改位移／旋轉，沒有貼圖上傳）----
    if(!bird){
      for(const m of paintings) m.color.setScalar(lerp(1.0, 1.35, night));
      rowTex.offset.y = (t * 0.9) % 1; gridMat.color.copy(C_MAG).multiplyScalar(lerp(0.9, 2.0, night) * (0.6 + 0.6 * kick));
      polyG.rotation.set(0.45 + 0.25 * Math.sin(t * 0.21), t * 0.35, 0, 'XYZ'); polyG.scale.setScalar(1 + 0.05 * kick);
      polyCoreMat.color.copy(C_CYAN).multiplyScalar(lerp(1.3, 2.8, night)); polyGlowMat.color.copy(C_CYAN).multiplyScalar(kG);
    }
    // ---- 燈：管風琴那盞跟著音樂脈動 ----
    lampOrg.mul = 0.72 + 0.6 * S.level;
    lampCeil.mul = 0.96 + 0.04 * Math.sin(t * 0.7);
  }
  // 會被 📸 拍進去、而且顏色跟著日夜變的 MeshBasic：photo.js 用 material.version 判斷替身要不要重做
  const photoBasics = [MT.neon, ...paintings, polyCoreMat, brooch.material, visorStripMat];
  let broken = false;
  ctx.tick.push(dt => {
    if(broken) return;
    try{
      // 音樂時鐘：聲音開著且在跑 → 以 AudioContext 為準（畫面跟聲音對拍）；否則照真實時間走
      const U = AU;
      if(U && ctx.audio && ctx.audio.on && U.ac.state === 'running'){
        if(!U.live){ resync(); U.live = true; }
        musicT = U.ac.currentTime - U.t0;
        schedule(); posAudio();
      }else{
        if(U) U.live = false;
        musicT += dt;
      }
      if(ctx.roof) ceil.visible = ctx.roof.visible;    // 屋頂關掉（走動時看天空）→ 濕壁畫也一起收
      const vis = worth();
      // 看不到這間房 → 兩盞彩色燈整盞關掉並讓出燈池（不然洋紅光會穿過隔間牆，打在客廳電視櫃上）
      if(!vis){ if(S.vis !== 0){ S.vis = 0; lampOrg.mul = 1; lampCeil.mul = 1; lampOrg.off = lampCeil.off = true; dyn.visible = false; if(neonMesh) neonMesh.visible = false; } return; }
      if(S.vis <= 0){ lampOrg.off = lampCeil.off = false; dyn.visible = true; if(neonMesh) neonMesh.visible = true; }
      S.vis = vis; S.acc += dt;
      if(LOW && (++S.skip & 1)) return;                // 手機：動畫半速（每秒 30 格），也只要求畫這一格
      const d = Math.min(S.acc, 0.1); S.acc = 0; S.t += d;
      animate(d, vis);
      if(ctx.poke) ctx.poke(LOW ? 8 : 250);
    }catch(e){
      broken = true; lampOrg.mul = 1; lampCeil.mul = 1; lampOrg.off = lampCeil.off = false;
      console.error('[theme_br2] 動畫出錯，這間房停止動畫（其他房間不受影響）：', e);
    }
  });
  /** 測試用（不會自己跑）：用離線 AudioContext 把 sec 秒的音樂算出來，回傳峰值／RMS／NaN 數（wav:true 時附 16-bit WAV 的 base64） */
  async function offline(sec = 12, from = 0, wav = false, only = null){
    const sr = 44100, OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const oac = new OAC(2, Math.ceil(sr * sec), sr);
    const comp = oac.createDynamicsCompressor();   // 跟 audio.js 總開關後面那顆一樣
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.25; comp.connect(oac.destination);
    const U = initAudio(oac, comp); U.pos.gain.value = 1;
    for(let base = 0; base < from + sec + LOOP; base += LOOP) for(const e of EV){ if(only && !only.includes(e.k)) continue; const at = base + e.t - from; if(at >= 0 && at < sec - 0.05) U.play(e, at); }
    const buf = await oac.startRendering();
    let peak = 0, sum = 0, n = 0, nan = 0;
    for(let ch = 0; ch < 2; ch++){ const d = buf.getChannelData(ch); for(let i = 0; i < d.length; i++){ const v = d[i]; if(v !== v){ nan++; continue; } peak = Math.max(peak, Math.abs(v)); sum += v * v; n++; } }
    const out = { peak, rms: Math.sqrt(sum / n), nan, sec };
    if(wav){
      const L = buf.getChannelData(0), R = buf.getChannelData(1), N = L.length, ab = new ArrayBuffer(44 + N * 4), dv = new DataView(ab);
      const w = (o, s) => { for(let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); dv.setUint32(4, 36 + N * 4, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
      dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, N * 4, true);
      for(let i = 0; i < N; i++){ dv.setInt16(44 + i * 4, clamp(L[i], -1, 1) * 32767, true); dv.setInt16(46 + i * 4, clamp(R[i], -1, 1) * 32767, true); }
      let bin = ''; const u8 = new Uint8Array(ab); for(let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      out.wav = btoa(bin);
    }
    return out;
  }
  // 測試／量效能用的把手
  ctx.br2 = { root, S, EV, LOOP, get musicT(){ return musicT; }, get audio(){ return AU; }, lamps: [lampCeil, lampOrg], offline };
}
