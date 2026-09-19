/* ============================================================
   theme_br3.js — 主題房：臥室三「陰兒房」
   嬰兒房 × 陰兒房（電影《Insidious》的台灣片名）的諧音梗 —— 一間向那部片致敬、真的會讓人發毛的嬰兒房。
   只有這一間刻意打破全屋的無印風。看得出是嬰兒房：舊嬰兒床（上面有會轉的吊飾）、搖椅、尿布台、玩具架、布偶、小朋友的蠟筆畫。
   氣氛（白天也一樣暗）：
     ・窗簾幾乎全拉上，只剩一道冷冷的細縫；房間自己的材質把整棟共用的天光壓暗、把隔壁穿牆來的燈擋掉（§19b）
     ・吊燈是病懨懨的暗綠色，不規則地亂閃、嗡嗡響，每十幾二十秒整個斷電 1–3 秒 —— 那時只剩紅門的光、監視器的綠光、天花板的夜光星星
     ・發灰剝落的舊壁紙、從天花板流下來的水漬、霉斑、角落的蜘蛛網、牆角牆腳一圈暗、紅門邊和嬰兒床上方的抓痕、
       一路從嬰兒床走到紅門的灰腳印、窗玻璃和天花板上的小手印、牆上的塗鴉「不要關燈」、地上一層低低的霧
     ・人在這間時，畫面四周壓暗、偏冷又褪色、有底片顆粒（網頁上的 CSS 氣氛層；俯瞰／拍照不出現）
   致敬＋會動的東西（全部自己設計，沒有沿用電影的任何造型、畫面、音樂）：
     ・紅門：北牆上一扇舊式四片鑲板紅門（牆後其實是主浴，什麼都沒有）。人一靠近就自己「吱——」慢慢往房內打開，
       門洞是一片貼在牆上的「虛空」：深紅的光＋會飄的黑霧（有視差，看起來很深），偶爾深處亮起一對眼睛；門開著時紅光是房間的主光
     ・老留聲機放著壞掉的音樂盒搖籃曲（布拉姆斯〈搖籃曲〉1868，公有領域）：拖拍、走音、酸掉、倒著放、卡住又往前衝；
       底下不和諧的低鳴、遠遠的小孩哼唱、慢慢變快變大的心跳；那個東西出現前一刻全部安靜
     ・自己搖的搖椅（沒在看時會轉過來對著你）、會轉會停會倒轉的吊飾、閃雜訊的嬰兒監視器（偶爾拍到床邊站著一個人）、
       窗外走過的黑影、角落裡只在眼角餘光看得到的影子、會換位置的瓷娃娃（頭會轉向你）、會自己彈出來又收回去的小丑盒
     ・跳嚇（屋主選的）：人在房裡待幾秒後，背後會站著一個高瘦的黑影（原創：焦黑的皮、手抹上去乾掉的紅漆、很深的眼窩、
       枯枝一樣的角、破爛的袍子）—— 轉身面向它的那一刻：燈猛地一閃一閃地亮、刺耳的音效（有開聲音才有）＋紅色閃光＋畫面震一下，約 1 秒就消失。
       只在走動模式；離開房間滿 30 秒才會再來一次；網址加 ?noscare=1 關掉；測試把手 ctx.themeBr3.scare()
   規矩（見 lighting.js 檔頭、main.js、core.js）：
     ・所有物件、幾何、貼圖都在載入時一次建好（之後只改位置／旋轉／顯示／材質數值，或重畫小張 CanvasTexture）
       → 開場先把這間所有的網格畫一次（藏著的東西先放到地板下面），之後才藏起來：之後不會多出新幾何、也不會卡在編譯 shader
     ・位置全部由 ctx.R['臥室三'].rects、ctx.doors、ctx.windows、ctx.archWalls 推出來（牆還會微調 1–8 cm，不寫死座標）
     ・會動的網格不投影；純特效標 userData.noPhoto；燈只登記兩盞（ctx.lamps）
     ・人在房裡／門口附近（或俯瞰）才動畫＋ctx.poke；走遠了就完全不動、不叫畫面重畫
     ・聲音全部現場合成（Web Audio），音量看人在哪：房裡全開、門外漸弱（像隔著門）、其他地方幾乎聽不到；這間自己有限幅器
   ============================================================ */
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const ROOM = '臥室三';

export default async function buildTheme(ctx){
  const { scene, camera, QUALITY } = ctx;
  const H = ctx.H || 3.25;
  const LOW = QUALITY === 'low';
  const QS = new URLSearchParams(location.search);
  const NOSCARE = QS.get('noscare') === '1';
  const RM = ctx.R && ctx.R[ROOM];
  if(!RM || !(RM.rects && RM.rects.length)){ console.warn('[theme_br3] 找不到「' + ROOM + '」，主題房不蓋'); return; }

  const FLOOR = 0.045;                 // 地板完成面（arch 慣例）
  const COL0 = ctx.colliders.length;   // 這之後登記的碰撞都是這間的（整個建造過程是同步的，別的模組插不進來）
  const SEG = LOW ? 12 : 22;           // 圓柱／車削件的圓周分段
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // 蓋房子用「固定種子」的亂數：每次載入長得一樣（截圖比對才穩）；執行期的閃爍、時機才用 Math.random
  let seed = 20260919;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const rr = (a, b) => a + (b - a) * rnd();
  const mr = (a, b) => a + (b - a) * Math.random();
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const ANISO = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy());

  /* ============================================================
     1. 房間外形：由 rects 推出每一面牆（L 形也行），再貼齊 arch 真正的牆面
        side = { axis:'x'|'z'（牆沿哪個軸走）, c（牆面座標）, a0..a1（沿牆範圍）, n:[nx,nz]（朝房內的法線）, holes:[] }
     ============================================================ */
  const rects = RM.rects.map(q => q.slice(0, 4));
  const inRoom = (x, z, m = 0) => rects.some(q => x >= q[0] + m && x <= q[2] - m && z >= q[1] + m && z <= q[3] - m);
  const areaOf = q => (q[2] - q[0]) * (q[3] - q[1]);
  const main = rects.reduce((a, q) => areaOf(q) > areaOf(a) ? q : a);
  const [X0, Z0, X1, Z1] = main;
  const BB = rects.reduce((a, q) => [Math.min(a[0], q[0]), Math.min(a[1], q[1]), Math.max(a[2], q[2]), Math.max(a[3], q[3])], [1e9, 1e9, -1e9, -1e9]);

  const sides = (() => {
    const uniq = arr => { arr.sort((a, b) => a - b); const o = []; for(const v of arr) if(!o.length || v - o[o.length - 1] > 1e-4) o.push(v); return o; };
    const xs = uniq(rects.flatMap(q => [q[0], q[2]])), zs = uniq(rects.flatMap(q => [q[1], q[3]]));
    const cell = (i, j) => i >= 0 && j >= 0 && i < xs.length - 1 && j < zs.length - 1 && inRoom((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2);
    const seg = [];
    for(let i = 0; i < xs.length; i++) for(let j = 0; j < zs.length - 1; j++){
      const L = cell(i - 1, j), Rt = cell(i, j);
      if(L !== Rt) seg.push({ axis: 'z', c: xs[i], a0: zs[j], a1: zs[j + 1], n: [Rt ? 1 : -1, 0] });
    }
    for(let j = 0; j < zs.length; j++) for(let i = 0; i < xs.length - 1; i++){
      const U = cell(i, j - 1), D = cell(i, j);
      if(U !== D) seg.push({ axis: 'x', c: zs[j], a0: xs[i], a1: xs[i + 1], n: [0, D ? 1 : -1] });
    }
    seg.sort((p, q) => (p.axis < q.axis ? -1 : p.axis > q.axis ? 1 : 0) || p.c - q.c || (p.n[0] + p.n[1]) - (q.n[0] + q.n[1]) || p.a0 - q.a0);
    const out = [];
    for(const s of seg){
      const l = out[out.length - 1];
      if(l && l.axis === s.axis && Math.abs(l.c - s.c) < 1e-4 && l.n[0] === s.n[0] && l.n[1] === s.n[1] && Math.abs(l.a1 - s.a0) < 1e-4) l.a1 = s.a1;
      else out.push({ ...s });
    }
    // 貼齊 arch 的牆面（房間矩形跟牆面可能差幾 mm，例如 L 形轉角那道牆）
    for(const s of out){
      s.o = s.c; s.oa0 = s.a0; s.oa1 = s.a1;
      let best = null;
      for(const w of ctx.archWalls || []){
        if(w.box || w.axis !== s.axis || w.glass) continue;
        if(Math.min(w.b, s.a1) - Math.max(w.a, s.a0) < 0.05) continue;
        const face = (s.axis === 'x' ? s.n[1] : s.n[0]) > 0 ? w.c1 : w.c0;
        const d = Math.abs(face - s.o);
        if(d < 0.06 && (!best || d < best.d)) best = { d, face };
      }
      if(best) s.c = best.face;
      s.holes = [];
    }
    // 端點跟著相鄰那道牆的新位置走
    for(const s of out) for(const k of ['a0', 'a1']){
      const v = k === 'a0' ? s.oa0 : s.oa1;
      const p = out.find(o => o.axis !== s.axis && Math.abs(o.o - v) < 1e-4 && s.o >= Math.min(o.oa0, o.oa1) - 1e-4 && s.o <= Math.max(o.oa0, o.oa1) + 1e-4);
      if(p) s[k] = p.c;
    }
    return out;
  })();
  const sideAt = (axis, nx, nz) => sides.filter(s => s.axis === axis && s.n[0] === nx && s.n[1] === nz);
  // 這個牆角是「凹進去」的嗎（房間兩面牆相接，會積灰、會暗）；L 形轉角那個凸出來的不算
  const concave = (s, end) => {
    const a = s[end], t = end === 'a0' ? 1 : -1, e = .06;
    const qx = s.axis === 'x' ? a - t * e + s.n[0] * e : s.c + s.n[0] * e;
    const qz = s.axis === 'x' ? s.c + s.n[1] * e : a - t * e + s.n[1] * e;
    return !inRoom(qx, qz);
  };
  // 北牆（主浴那面）：主矩形北緣那一段；紅門掛在這裡
  const northS = sideAt('x', 0, 1).reduce((a, s) => (!a || Math.abs(s.o - Z0) < Math.abs(a.o - Z0)) && s.oa0 <= X0 + 1e-3 ? s : a, null)
              || sideAt('x', 0, 1)[0];
  const southS = sideAt('x', 0, -1).reduce((a, s) => !a || (s.a1 - s.a0) > (a.a1 - a.a0) ? s : a, null);
  const westS  = sideAt('z', 1, 0).reduce((a, s) => !a || s.c < a.c ? s : a, null);
  const ZN = northS ? northS.c : Z0, ZS = southS ? southS.c : Z1, XW = westS ? westS.c : X0;

  // 門（O_BR2：凹室東牆南段，往房內開、門片停靠在南牆上）
  const door = (ctx.doors || []).find(d => d.id === 'O_BR2') || (ctx.doors || []).find(d => (d.rooms || []).includes(ROOM));
  let doorPt = [BB[2], (BB[1] + BB[3]) / 2], doorIn = [-1, 0];
  const keepOut = [];   // 家具不能碰的區域（門片迴轉扇形、進門的走道）
  if(door){
    const side = door.axis === 'z'
      ? sides.find(s => s.axis === 'z' && Math.min(Math.abs(s.o - door.c0), Math.abs(s.o - door.c1)) < 0.03 && s.oa0 <= door.at1 && s.oa1 >= door.at0)
      : sides.find(s => s.axis === 'x' && Math.min(Math.abs(s.o - door.c0), Math.abs(s.o - door.c1)) < 0.03 && s.oa0 <= door.at1 && s.oa1 >= door.at0);
    if(side){
      side.holes.push({ a0: door.at0, a1: door.at1, y0: 0, y1: door.h || 2.1, door: true });
      doorPt = side.axis === 'z' ? [side.c, (door.at0 + door.at1) / 2] : [(door.at0 + door.at1) / 2, side.c];
      doorIn = side.n.slice();
    }
    // 門片迴轉扇形（關 → 開）的外框
    const sw = door.swing || {};
    if(sw.hinge && sw.leafWidth){
      const [hx, hz] = sw.hinge, lw = sw.leafWidth + 0.05;
      const toC = [doorPt[0] - hx, doorPt[1] - hz], l0 = Math.hypot(...toC) || 1;
      const d0 = [toC[0] / l0, toC[1] / l0], d1 = sw.dir || doorIn;
      const pts = [[hx, hz]];
      for(let k = 0; k <= 8; k++){ const t = k / 8, vx = lerp(d0[0], d1[0], t), vz = lerp(d0[1], d1[1], t), l = Math.hypot(vx, vz) || 1; pts.push([hx + lw * vx / l, hz + lw * vz / l]); }
      keepOut.push({ x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])), z0: Math.min(...pts.map(p => p[1])), z1: Math.max(...pts.map(p => p[1])), why: '門片迴轉' });
    }
    // 進門的走道：門洞往房內 1.4 m
    const w2 = Math.abs(door.at1 - door.at0) / 2 - 0.05;
    if(Math.abs(doorIn[0]) > 0.5){ const xa = doorPt[0], xb = doorPt[0] + doorIn[0] * 1.4; keepOut.push({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: doorPt[1] - w2, z1: doorPt[1] + w2, why: '進門走道' }); }
    else { const za = doorPt[1], zb = doorPt[1] + doorIn[1] * 1.4; keepOut.push({ z0: Math.min(za, zb), z1: Math.max(za, zb), x0: doorPt[0] - w2, x1: doorPt[0] + w2, why: '進門走道' }); }
  }
  // 窗戶：同一面牆的窗合成一條「玻璃帶」洞（西窗牆整條 0.90–2.45 都是玻璃）
  const wins = (ctx.windows || []).filter(w => w.room === ROOM);
  for(const w of wins){
    const s = sides.find(o => o.axis === w.axis && Math.min(Math.abs(o.o - w.c0), Math.abs(o.o - w.c1)) < 0.05 && o.oa0 <= w.at1 && o.oa1 >= w.at0);
    if(!s) continue;
    const h = s.holes.find(q => q.win);
    if(h){ h.a0 = Math.min(h.a0, w.at0); h.a1 = Math.max(h.a1, w.at1); h.y0 = Math.min(h.y0, w.y0); h.y1 = Math.max(h.y1, w.y1); }
    else s.holes.push({ a0: w.at0, a1: w.at1, y0: w.y0, y1: w.y1, win: true });
  }
  const winBand = westS && westS.holes.find(h => h.win);
  const SILL = winBand ? winBand.y0 : 0.90, HEAD = winBand ? winBand.y1 : 2.45;

  /* ============================================================
     2. 場景節點、網格小工具、合併
     ============================================================ */
  const root = new THREE.Group(); root.name = 'theme_br3'; scene.add(root);
  const stat = new THREE.Group(); stat.name = 'br3-static'; root.add(stat);      // 不會動（最後依材質合併）
  const ceilG = new THREE.Group(); ceilG.name = 'br3-ceiling'; root.add(ceilG);  // 天花板上的東西：跟著屋頂開關一起顯示／隱藏
  const anim = new THREE.Group(); anim.name = 'br3-anim'; root.add(anim);        // 會動的東西（不投影）
  const fx = new THREE.Group(); fx.name = 'br3-fx'; root.add(fx);                // 純特效（拍照模式藏起來）
  fx.userData.noPhoto = true;

  const grp = (x = 0, y = 0, z = 0, ry = 0, parent = stat) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); return g; };
  const M = (geo, mat, x = 0, y = 0, z = 0, parent = stat) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const Bx = (w, h, d, mat, x, y, z, parent) => M(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  const RB = (w, h, d, r, mat, x, y, z, parent, seg = 2) => M(new RoundedBoxGeometry(w, h, d, seg, r), mat, x, y, z, parent);
  const Cyl = (r0, r1, h, mat, x, y, z, parent, seg = SEG, open = false) => M(new THREE.CylinderGeometry(r0, r1, h, seg, 1, open), mat, x, y, z, parent);
  const Sph = (r, mat, x, y, z, parent, sx = 1, sy = 1, sz = 1, ws = LOW ? 12 : 18, hs = LOW ? 8 : 12) => { const m = M(new THREE.SphereGeometry(r, ws, hs), mat, x, y, z, parent); m.scale.set(sx, sy, sz); return m; };
  const lathe = (pts, mat, x, y, z, parent, seg = SEG) => M(new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg), mat, x, y, z, parent);
  /** 漸細的管子（角、手指、吊飾支架）：pts 世界／局部點列，半徑 r0 → r1 */
  function taperTube(pts, r0, r1, tub = 16, rad = LOW ? 6 : 8){
    const curve = new THREE.CatmullRomCurve3(pts.map(p => V3(...p)));
    const g = new THREE.TubeGeometry(curve, tub, 1, rad, false);
    const P = g.attributes.position, N = g.attributes.normal;
    const frames = curve.computeFrenetFrames(tub, false), c = new THREE.Vector3();
    for(let i = 0; i <= tub; i++){
      const t = i / tub, r = lerp(r0, r1, t);
      curve.getPointAt(t, c);
      for(let j = 0; j <= rad; j++){
        const k = i * (rad + 1) + j;
        P.setXYZ(k, c.x + N.getX(k) * r, c.y + N.getY(k) * r, c.z + N.getZ(k) * r);
      }
    }
    g.computeVertexNormals();
    return g;
  }
  /** 給「頂點色」材質用：整個幾何塗成一個顏色 */
  function paint(g, hex){
    const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for(let i = 0; i < n; i++){ a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  }
  /** 把 group 底下的網格依材質合併（座標轉成 group 的局部座標）；會動的組也能用（合併後照樣一起轉） */
  function mergeInto(group, { cast = true, recv = true } = {}){
    group.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), mm = new THREE.Matrix4();
    const byKey = new Map(), doomed = [];
    group.traverse(o => {
      if(!o.isMesh || o === group || o.userData.noBake || Array.isArray(o.material)) return;
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      const vc = !!o.material.vertexColors;
      for(const k of Object.keys(g.attributes)) if(!['position', 'normal', 'uv', ...(vc ? ['color'] : [])].includes(k)) g.deleteAttribute(k);
      if(!g.attributes.normal) g.computeVertexNormals();
      if(!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if(vc && !g.attributes.color) paint(g, 0xffffff);
      g.morphAttributes = {};
      mm.multiplyMatrices(inv, o.matrixWorld);
      g.applyMatrix4(mm);
      if(mm.determinant() < 0){   // 鏡射過的零件：三角形繞向翻回來
        const P = g.attributes;
        for(const k in P){ const a = P[k], s = a.itemSize; for(let i = 0; i < a.count; i += 3) for(let e = 0; e < s; e++){ const t = a.array[(i + 1) * s + e]; a.array[(i + 1) * s + e] = a.array[(i + 2) * s + e]; a.array[(i + 2) * s + e] = t; } }
      }
      const key = o.material.uuid + '|' + (o.castShadow && cast ? 1 : 0) + (o.receiveShadow && recv ? 1 : 0) + '|' + (o.renderOrder || 0);
      if(!byKey.has(key)) byKey.set(key, { m: o.material, list: [], cast: o.castShadow && cast, recv: o.receiveShadow && recv, ro: o.renderOrder || 0, noPhoto: !!o.userData.noPhoto });
      byKey.get(key).list.push(g); doomed.push(o);
    });
    for(const o of doomed){ o.removeFromParent(); o.geometry.dispose(); }
    const out = [];
    for(const { m, list, cast: c, recv: r, ro, noPhoto } of byKey.values()){
      const g = BGU.mergeGeometries(list, false); list.forEach(x => x.dispose());
      if(!g) continue;
      g.computeBoundingSphere(); g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = c; mesh.receiveShadow = r; mesh.renderOrder = ro; mesh.name = group.name + '-merged';
      if(noPhoto) mesh.userData.noPhoto = true;
      group.add(mesh); out.push(mesh);
    }
    const prune = o => { for(let i = o.children.length - 1; i >= 0; i--){ const c = o.children[i]; if(c.isGroup && !c.userData.keep){ prune(c); if(!c.children.length) o.remove(c); } } };
    prune(group);
    return out;
  }
  /** 碰撞：用物件外框登記；pad 外擴 */
  const collide = (obj, y1, pad = 0) => ctx.addCollider ? ctx.addCollider(obj, { y1, pad }) : null;

  /* ============================================================
     3. 程式畫的貼圖（全部 ≤1024，動態的 ≤512）
     ============================================================ */
  function canvasTex(w, h, paintFn, { repeat = [1, 1], srgb = true, wrap = true, aniso = ANISO } = {}){
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    paintFn(c, w, h, cv);
    const t = new THREE.CanvasTexture(cv);
    if(wrap){ t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.repeat.set(repeat[0], repeat[1]); t.anisotropy = aniso;
    if(srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  /** 畫一個會在四邊無縫接起來的東西（f(dx,dy) 在 9 個位移各畫一次） */
  const wrap9 = (w, h, f) => { for(const dx of [-w, 0, w]) for(const dy of [-h, 0, h]) f(dx, dy); };
  const blob = (c, x, y, r, col, a0) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col.replace('A', a0)); g.addColorStop(1, col.replace('A', 0)); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };
  function star(c, x, y, r0, r1, n = 5, rot = -Math.PI / 2){
    c.beginPath();
    for(let i = 0; i < n * 2; i++){ const r = i % 2 ? r1 : r0, a = rot + i * Math.PI / n; i ? c.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)) : c.moveTo(x + r * Math.cos(a), y + r * Math.sin(a)); }
    c.closePath();
  }
  function crescent(c, x, y, r, bg, fg){
    c.fillStyle = fg; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.fillStyle = bg; c.beginPath(); c.arc(x + r * 0.42, y - r * 0.28, r * 0.86, 0, TAU); c.fill();
  }

  // 3a. 壁紙：褪到發灰的舊壁紙（灰褐底、淡淡的直條、若有似無的月亮／星星／小羊，其中一格是一隻眼睛）＋往下流的水痕、霉點；一張 0.64 m
  const PAPER_M = 0.64;
  const paperTex = canvasTex(512, 512, (c, W) => {
    c.fillStyle = '#2d2926'; c.fillRect(0, 0, W, W);
    for(let x = 0; x < W; x += 64){
      c.fillStyle = '#332e2a'; c.fillRect(x + 14, 0, 36, W);
      c.fillStyle = 'rgba(140,126,104,.14)'; c.fillRect(x + 12, 0, 1.4, W); c.fillRect(x + 50.6, 0, 1.4, W);
    }
    const FG = 'rgba(122,110,92,.30)', BG = '#332e2a';
    for(let k = 0; k < 8; k++) for(let j = 0; j < 4; j++){
      const x = k * 64 + 32, y = (k % 2 ? 64 : 0) + j * 128 + 32, kind = (k + j * 2) % 3;
      if(k === 5 && j === 2){   // 眼睛（藏在圖案裡的那一格）
        c.fillStyle = 'rgba(150,138,116,.45)'; c.beginPath(); c.moveTo(x - 12, y); c.quadraticCurveTo(x, y - 10, x + 12, y); c.quadraticCurveTo(x, y + 10, x - 12, y); c.fill();
        c.fillStyle = '#140807'; c.beginPath(); c.arc(x, y, 4.2, 0, TAU); c.fill();
        continue;
      }
      if(kind === 0) crescent(c, x, y, 10, BG, FG);
      else if(kind === 1){ c.fillStyle = FG; star(c, x, y, 10, 4.2); c.fill(); }
      else {                  // 小羊
        c.fillStyle = FG;
        for(const [dx, dy, r] of [[-5, 0, 5], [0, -3, 5.5], [5, 0, 5], [0, 2, 5.5]]){ c.beginPath(); c.arc(x + dx, y + dy, r, 0, TAU); c.fill(); }
        c.fillStyle = 'rgba(20,16,14,.55)'; c.beginPath(); c.ellipse(x + 10, y - 2, 3.4, 2.6, 0.3, 0, TAU); c.fill();
        c.fillRect(x - 5, y + 6, 1.4, 5); c.fillRect(x + 4, y + 6, 1.4, 5);
      }
    }
    for(let i = 0; i < 5000; i++){ const v = rnd() < .6 ? 10 : 105; c.fillStyle = `rgba(${v},${v - 4},${v - 10},${.04 + rnd() * .07})`; c.fillRect(rnd() * W, rnd() * W, 1 + rnd() * 2, 1 + rnd() * 2); }
    for(let i = 0; i < 26; i++){   // 往下流的水痕（上下無縫）
      const x = rnd() * W, y0 = rnd() * W, L = 40 + rnd() * 220, w = 1 + rnd() * 3;
      for(const dy of [0, -W]){ const g = c.createLinearGradient(0, y0 + dy, 0, y0 + dy + L); g.addColorStop(0, 'rgba(24,15,7,.26)'); g.addColorStop(1, 'rgba(24,15,7,0)'); c.fillStyle = g; c.fillRect(x, y0 + dy, w, L); }
    }
    for(let i = 0; i < 10; i++){ const x = rnd() * W, y = rnd() * W, r = 8 + rnd() * 22, a = .25 + rnd() * .2; wrap9(W, W, (dx, dy) => blob(c, x + dx, y + dy, r, 'rgba(14,18,10,A)', a)); }   // 霉點
  }, { repeat: [1 / PAPER_M, 1 / PAPER_M] });
  // 3b. 大範圍的髒污（水漬、手摸過的黑）→ 當 aoMap 用；一張 2.7 m
  const grimeTex = canvasTex(256, 256, (c, W) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, W);
    for(let i = 0; i < 20; i++){
      const x = rnd() * W, y = rnd() * W, r = 18 + rnd() * 60, a = .3 + rnd() * .35;
      wrap9(W, W, (dx, dy) => blob(c, x + dx, y + dy, r, 'rgba(40,32,24,A)', a));
    }
    for(let i = 0; i < 5; i++){   // 水漬的邊：不規則、淡淡的
      const x = rnd() * W, y = rnd() * W, r = 14 + rnd() * 28, n = 22, ph = [rnd() * TAU, rnd() * TAU];
      const pts = Array.from({ length: n + 1 }, (_, k) => { const a = k / n * TAU, q = r * (1 + .22 * Math.sin(3 * a + ph[0]) + .12 * Math.sin(5 * a + ph[1])); return [q * Math.cos(a), q * Math.sin(a) * .75]; });
      wrap9(W, W, (dx, dy) => { c.strokeStyle = 'rgba(95,72,45,.22)'; c.lineWidth = 3; c.beginPath(); pts.forEach(([px, py], k) => k ? c.lineTo(x + dx + px, y + dy + py) : c.moveTo(x + dx + px, y + dy + py)); c.stroke(); });
    }
  }, { srgb: false, repeat: [1 / 2.7, 1 / 2.7] });
  grimeTex.channel = 0;
  // 3c. 護牆板：燻黑的舊木鑲板、刮痕、手摸出來的髒，一格 0.60 m 寬 × 地板到腰線（不上下重複）
  const WAIN_W = 0.60;
  const wainTex = canvasTex(512, 512, (c, W) => {
    c.fillStyle = '#1f1611'; c.fillRect(0, 0, W, W);
    for(let x = 0; x < W; x++){ const v = 8 * Math.sin(x * .19) * Math.sin(x * .031 + 2) + (rnd() - .5) * 10; c.fillStyle = `rgba(${v > 0 ? 80 : 0},${v > 0 ? 58 : 0},${v > 0 ? 38 : 0},${Math.abs(v) / 70})`; c.fillRect(x, 0, 1, W); }
    const fx0 = 58, fx1 = W - 58, fy0 = 64, fy1 = W - 96;
    c.fillStyle = 'rgba(48,34,24,.55)'; c.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
    c.fillStyle = 'rgba(95,72,50,.28)'; c.fillRect(fx0, fy0, fx1 - fx0, 10); c.fillRect(fx0, fy0, 10, fy1 - fy0);
    c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(fx0, fy1 - 10, fx1 - fx0, 10); c.fillRect(fx1 - 10, fy0, 10, fy1 - fy0);
    c.strokeStyle = 'rgba(6,4,2,.85)'; c.lineWidth = 3; c.strokeRect(fx0 + 22, fy0 + 22, fx1 - fx0 - 44, fy1 - fy0 - 44);
    c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 4; c.beginPath(); c.moveTo(1, 0); c.lineTo(1, W); c.stroke();
    for(let i = 0; i < 90; i++){ c.strokeStyle = `rgba(170,140,105,${.05 + rnd() * .09})`; c.lineWidth = .8 + rnd(); c.beginPath(); const x = rnd() * W, y = rnd() * W; c.moveTo(x, y); c.lineTo(x + (rnd() - .5) * 60, y + (rnd() - .5) * 18); c.stroke(); }
    for(let i = 0; i < 8; i++) blob(c, rnd() * W, W * (.4 + rnd() * .6), 30 + rnd() * 50, 'rgba(0,0,0,A)', .35);
  }, { repeat: [1, 1] });
  // 3d. 深色舊地板：寬 15 cm 的長條木板、長短不一的接縫、刮痕、積灰；一張 1.2 m
  const FLOOR_M = 1.2;
  const floorTex = canvasTex(512, 512, (c, W) => {
    c.fillStyle = '#0c0806'; c.fillRect(0, 0, W, W);
    for(let r = 0; r < 8; r++){
      const y = r * 64; let x = rnd() * W, left = W;
      while(left > 0){
        const L = Math.min(left, 150 + rnd() * 260), k = .78 + rnd() * .4;
        const col = `rgb(${44 * k | 0},${31 * k | 0},${23 * k | 0})`;
        for(const dx of [0, -W]){ c.fillStyle = col; c.fillRect(x + dx + 1, y + 1, L - 2, 62); }
        for(let g = 0; g < 7; g++){ const gy = y + 4 + rnd() * 56, a = .05 + rnd() * .1; for(const dx of [0, -W]){ c.fillStyle = `rgba(12,7,5,${a})`; c.fillRect(x + dx, gy, L, 1 + rnd() * 1.5); } }
        x += L; left -= L;
      }
    }
    for(let i = 0; i < 110; i++){ c.strokeStyle = `rgba(150,125,100,${.05 + rnd() * .09})`; c.lineWidth = .8; c.beginPath(); const x = rnd() * W, y = rnd() * W; c.moveTo(x, y); c.lineTo(x + (rnd() - .5) * 90, y + (rnd() - .5) * 10); c.stroke(); }
    for(let i = 0; i < 8; i++){ const x = rnd() * W, y = rnd() * W; wrap9(W, W, (dx, dy) => blob(c, x + dx, y + dy, 40 + rnd() * 50, 'rgba(0,0,0,A)', .3)); }
    for(let i = 0; i < 14; i++){ const x = rnd() * W, y = rnd() * W, r = 20 + rnd() * 60; wrap9(W, W, (dx, dy) => blob(c, x + dx, y + dy, r, 'rgba(120,110,95,A)', .07)); }   // 積灰
  }, { repeat: [1 / FLOOR_M, 1 / FLOOR_M] });
  // 3e. 編織圓地毯（一圈一圈的舊布條）
  const rugTex = canvasTex(256, 256, (c, W) => {
    c.fillStyle = '#3a2a24'; c.fillRect(0, 0, W, W);
    const cols = ['#5e2f2b', '#4d5646', '#7a6a4f', '#3a3440', '#6b4a3a', '#55504a'];
    let i = 0;
    for(let r = 127; r > 4; r -= 7, i++){
      c.strokeStyle = cols[(i * 7 + (i >> 2)) % cols.length]; c.lineWidth = 6.5; c.beginPath(); c.arc(128, 128, r, 0, TAU); c.stroke();
      c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1;
      for(let a = 0; a < TAU; a += 7 / r){ c.beginPath(); c.moveTo(128 + (r - 3) * Math.cos(a), 128 + (r - 3) * Math.sin(a)); c.lineTo(128 + (r + 3) * Math.cos(a + 2.5 / r), 128 + (r + 3) * Math.sin(a + 2.5 / r)); c.stroke(); }
    }
    blob(c, 150, 100, 40, 'rgba(20,10,8,A)', .35);
  }, { wrap: false });
  // 3f. 嬰兒床的舊白漆（掉漆、露出木頭）
  const chipTex = canvasTex(256, 256, (c, W) => {
    c.fillStyle = '#d2c8b4'; c.fillRect(0, 0, W, W);
    for(let i = 0; i < 1500; i++){ const v = 150 + rnd() * 90; c.fillStyle = `rgba(${v},${v - 6},${v - 18},.12)`; c.fillRect(rnd() * W, rnd() * W, 2, 2); }
    for(let i = 0; i < 90; i++){
      const x = rnd() * W, y = rnd() * W, r = 1 + rnd() * 4;
      c.fillStyle = rnd() < .6 ? '#6a543f' : '#8e7a62';
      c.beginPath(); for(let k = 0; k < 7; k++){ const a = k / 7 * TAU, q = r * (.5 + rnd()); k ? c.lineTo(x + q * Math.cos(a), y + q * Math.sin(a)) : c.moveTo(x + q * Math.cos(a), y + q * Math.sin(a)); } c.fill();
    }
    for(let i = 0; i < 9; i++) wrap9(W, W, (dx, dy) => blob(c, rnd() * W + dx, rnd() * W + dy, 20 + rnd() * 30, 'rgba(70,52,34,A)', .28));
    for(let i = 0; i < 30; i++){ const x = rnd() * W, y0 = rnd() * W; c.fillStyle = 'rgba(60,44,28,.18)'; c.fillRect(x, y0, 1 + rnd() * 2, 20 + rnd() * 60); }
  }, { repeat: [2, 2] });
  // 3g. 紅門的舊漆（龜裂紋、掉漆）
  const redTex = canvasTex(256, 512, (c, W, Hh) => {
    c.fillStyle = '#9c1512'; c.fillRect(0, 0, W, Hh);
    for(let x = 0; x < W; x += 2){ c.fillStyle = `rgba(${rnd() < .5 ? '60,0,0' : '255,120,100'},${rnd() * .06})`; c.fillRect(x, 0, 2, Hh); }
    c.strokeStyle = 'rgba(40,4,4,.55)'; c.lineWidth = .8;
    for(let i = 0; i < 70; i++){ let x = rnd() * W, y = rnd() * Hh; c.beginPath(); c.moveTo(x, y); for(let k = 0; k < 6; k++){ x += (rnd() - .5) * 22; y += (rnd() - .5) * 22; c.lineTo(x, y); } c.stroke(); }
    for(let i = 0; i < 40; i++){ c.fillStyle = rnd() < .5 ? '#3a2014' : '#5a1210'; c.beginPath(); c.arc(rnd() * W, rnd() * Hh, .8 + rnd() * 2.5, 0, TAU); c.fill(); }
  }, { repeat: [1, 1] });
  // 3h. 燈罩：舊布、印著褪色的小月亮星星
  const shadeTex = canvasTex(256, 128, (c, W, Hh) => {
    c.fillStyle = '#d6c3a0'; c.fillRect(0, 0, W, Hh);
    for(let i = 0; i < 26; i++){ const x = (i * 37) % W + 8, y = 18 + ((i * 53) % (Hh - 36)); if(i % 2){ c.fillStyle = 'rgba(96,112,140,.55)'; star(c, x, y, 7, 3); c.fill(); } else crescent(c, x, y, 7, '#d6c3a0', 'rgba(96,112,140,.55)'); }
    blob(c, 190, 118, 40, 'rgba(80,40,10,A)', .45);
  }, { repeat: [1, 1] });
  // 3i. 床單：褪色的淡藍格子
  const sheetTex = canvasTex(128, 128, (c, W) => {
    c.fillStyle = '#b9c3c4'; c.fillRect(0, 0, W, W);
    c.fillStyle = 'rgba(120,140,150,.45)'; for(let i = 0; i < W; i += 32){ c.fillRect(i, 0, 12, W); c.fillRect(0, i, W, 12); }
    blob(c, 80, 60, 30, 'rgba(120,100,60,A)', .3);
  }, { repeat: [3, 3] });
  // 3j. 手印（小孩的，暗紅發黑、抹開的）
  const handTex = canvasTex(128, 128, (c) => {
    c.fillStyle = 'rgba(58,10,8,.85)';
    for(let p = 0; p < 3; p++){
      const j = () => (rnd() - .5) * 3;
      c.globalAlpha = .45 + rnd() * .3;
      c.beginPath(); c.ellipse(64 + j(), 80 + j(), 23, 27, 0, 0, TAU); c.fill();
      for(const [x, y, rx, ry, a] of [[36, 64, 7, 15, -.9], [47, 34, 6.5, 17, -.2], [62, 26, 6.5, 19, 0], [77, 30, 6.5, 17, .15], [90, 46, 6, 13, .45]]){ c.beginPath(); c.ellipse(x + j(), y + j(), rx, ry, a, 0, TAU); c.fill(); }
    }
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(58,10,8,.35)'; for(let i = 0; i < 6; i++) c.fillRect(56 + i * 3, 104, 2, 10 + rnd() * 18);   // 往下流的一點
  }, { wrap: false });

  // 3k. 小朋友的蠟筆畫（一張 768×672 的圖集，3×2 格，每格 256×336）
  function crayon(c, pts, color, w = 5, passes = 3, jit = 1.4){
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = color;
    for(let p = 0; p < passes; p++){
      c.globalAlpha = .45 + .35 * rnd(); c.lineWidth = w * (.55 + .5 * rnd());
      c.beginPath();
      pts.forEach(([x, y], i) => { const X = x + (rnd() - .5) * 2 * jit, Y = y + (rnd() - .5) * 2 * jit; i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
      c.stroke();
    }
    c.globalAlpha = 1;
  }
  const circlePts = (x, y, rx, ry = rx, n = 18, a0 = 0) => Array.from({ length: n + 1 }, (_, i) => [x + rx * Math.cos(a0 + i / n * TAU), y + ry * Math.sin(a0 + i / n * TAU)]);
  function scribble(c, x0, y0, x1, y1, color, step = 5, w = 4){
    const pts = []; let flip = false;
    for(let y = y0; y <= y1; y += step){ pts.push(flip ? [x1, y] : [x0, y]); pts.push(flip ? [x0, y + step / 2] : [x1, y + step / 2]); flip = !flip; }
    crayon(c, pts, color, w, 2, 2.2);
  }
  function crayonText(c, str, x, y, size, color){
    c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle';
    const chars = [...str], adv = size * 1.05;
    chars.forEach((ch, i) => {
      for(let p = 0; p < 3; p++){
        c.save(); c.globalAlpha = .45 + .3 * rnd();
        c.translate(x + (i - (chars.length - 1) / 2) * adv + (rnd() - .5) * 2, y + (rnd() - .5) * 4 + Math.sin(i * 1.7) * 2);
        c.rotate((rnd() - .5) * .28 + Math.sin(i * 2.3) * .06);
        c.font = `bold ${size * (.9 + rnd() * .2)}px "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif`;
        c.fillText(ch, 0, 0); c.restore();
      }
    });
    c.globalAlpha = 1;
  }
  const stick = (c, x, y, s, col, arms = 0) => {   // 火柴人：頭在 (x,y)
    crayon(c, circlePts(x, y, 7 * s, 8 * s, 10), col, 3);
    crayon(c, [[x, y + 8 * s], [x, y + 34 * s]], col, 3);
    crayon(c, [[x, y + 34 * s], [x - 9 * s, y + 52 * s]], col, 3); crayon(c, [[x, y + 34 * s], [x + 9 * s, y + 52 * s]], col, 3);
    crayon(c, [[x - 14 * s, y + 18 * s + arms], [x, y + 16 * s], [x + 14 * s, y + 18 * s + arms]], col, 3);
  };
  const ART_W = 256, ART_H = 336;
  const artTex = canvasTex(ART_W * 3, ART_H * 2, (c) => {
    const cells = [
      c => {   // 0 我的家：房子、一家三口、屋後一個很高的黑色的東西
        crayon(c, [[50, 190], [50, 120], [130, 70], [210, 120], [210, 190], [50, 190]], '#8a5a2b', 5);
        crayon(c, [[115, 190], [115, 150], [140, 150], [140, 190]], '#8a5a2b', 4);
        crayon(c, [[70, 140], [95, 140], [95, 160], [70, 160], [70, 140]], '#3a6fb0', 4);
        scribble(c, 170, 36, 205, 110, '#111', 4, 5);
        crayon(c, [[188, 36], [150, 70], [138, 96]], '#111', 5); crayon(c, [[196, 40], [236, 80], [240, 118]], '#111', 5);
        scribble(c, 176, 20, 200, 40, '#c21a14', 3, 4);
        c.fillStyle = '#ffe14a'; c.fillRect(181, 27, 3, 3); c.fillRect(191, 27, 3, 3);
        crayon(c, circlePts(40, 40, 18), '#e8b21c', 5); for(let k = 0; k < 8; k++){ const a = k / 8 * TAU; crayon(c, [[40 + 22 * Math.cos(a), 40 + 22 * Math.sin(a)], [40 + 32 * Math.cos(a), 40 + 32 * Math.sin(a)]], '#e8b21c', 3); }
        stick(c, 70, 215, 1.1, '#2c4c8c'); stick(c, 110, 222, 1, '#b0306a'); stick(c, 145, 238, .7, '#2f7a3a');
        crayon(c, [[40, 300], [220, 300]], '#3f8a3a', 7);
        crayonText(c, '我的家', 128, 318, 26, '#222');
      },
      c => {   // 1 紅門：黑色塗滿、中間一扇紅門、門前一個小孩；「不要開」
        scribble(c, 14, 14, 242, 262, '#161412', 6, 7);
        c.fillStyle = 'rgba(245,240,228,1)'; c.fillRect(78, 60, 100, 190);
        scribble(c, 82, 64, 174, 246, '#c8161a', 5, 6);
        crayon(c, [[78, 250], [78, 60], [178, 60], [178, 250]], '#6a0a0a', 5);
        crayon(c, circlePts(160, 160, 6), '#e0b020', 4);
        stick(c, 60, 205, .75, '#2c4c8c');
        crayonText(c, '不要開', 128, 300, 34, '#b3120f');
      },
      c => {   // 2 晚上：小床、窗外月亮、角落一個高高的黑影、兩個紅點；「它每天晚上都來」
        crayon(c, [[30, 240], [150, 240], [150, 200], [30, 200], [30, 240]], '#3a6fb0', 5);
        crayon(c, [[30, 200], [30, 180]], '#3a6fb0', 5); crayon(c, [[150, 200], [150, 190]], '#3a6fb0', 5);
        crayon(c, circlePts(55, 188, 9), '#b0306a', 3); crayon(c, [[64, 196], [140, 196]], '#b0306a', 4);
        crayon(c, [[40, 50], [110, 50], [110, 120], [40, 120], [40, 50]], '#444', 4);
        crayon(c, circlePts(80, 82, 16, 16, 12, .4), '#e8c21c', 4);
        scribble(c, 186, 40, 232, 250, '#111', 4, 6);
        scribble(c, 196, 18, 224, 44, '#111', 3, 5);
        c.fillStyle = '#e0141a'; c.beginPath(); c.arc(203, 32, 3.5, 0, TAU); c.arc(216, 32, 3.5, 0, TAU); c.fill();
        crayonText(c, '它每天晚上', 128, 286, 22, '#222'); crayonText(c, '都來', 128, 314, 24, '#222');
      },
      c => {   // 3 那張臉：紅黑裂紋的臉，被打了一個大叉；「走開」
        scribble(c, 58, 60, 198, 230, '#111', 5, 6);
        crayon(c, circlePts(128, 145, 72, 88, 20), '#111', 6);
        for(let k = 0; k < 9; k++){ const a = -2.6 + k * .55; crayon(c, [[128 + 18 * Math.cos(a), 120 + 18 * Math.sin(a)], [128 + 48 * Math.cos(a + .2), 120 + 55 * Math.sin(a + .2)], [128 + 66 * Math.cos(a - .1), 130 + 78 * Math.sin(a - .1)]], '#d0201a', 4); }
        c.fillStyle = '#ffd23a'; c.beginPath(); c.ellipse(100, 125, 9, 5, -.3, 0, TAU); c.ellipse(156, 125, 9, 5, .3, 0, TAU); c.fill();
        crayon(c, [[82, 190], [100, 200], [128, 204], [156, 200], [174, 190]], '#d0201a', 5);
        crayon(c, [[30, 40], [226, 250]], '#222', 9); crayon(c, [[226, 40], [30, 250]], '#222', 9);
        crayonText(c, '走開', 128, 300, 36, '#b3120f');
      },
      c => {   // 4 給媽媽：彩虹、花、太陽 —— 花叢裡藏著一個紅眼睛的小黑影
        const rb = ['#d8281f', '#f08a1c', '#f1d21c', '#3f9a3a', '#2c5cb0', '#6a3aa0'];
        rb.forEach((col, k) => crayon(c, Array.from({ length: 16 }, (_, i) => [128 + (100 - k * 9) * Math.cos(Math.PI + i / 15 * Math.PI), 170 + (100 - k * 9) * Math.sin(Math.PI + i / 15 * Math.PI)]), col, 7));
        for(let k = 0; k < 6; k++){ const x = 30 + k * 40, y = 240 + (k % 2) * 10; crayon(c, [[x, y], [x, y + 36]], '#3f8a3a', 4); crayon(c, circlePts(x, y - 4, 9), ['#e04a8a', '#f1d21c', '#e8751c'][k % 3], 6); }
        scribble(c, 148, 226, 162, 268, '#111', 3, 4); c.fillStyle = '#e0141a'; c.fillRect(151, 232, 2.5, 2.5); c.fillRect(157, 232, 2.5, 2.5);
        crayonText(c, '給媽媽', 128, 312, 26, '#b0306a');
      },
      c => {   // 5 我會飛：小孩躺在床上，另一個自己飄出去、一條虛線連著，飄向一扇紅門
        crayon(c, [[20, 270], [120, 270], [120, 240], [20, 240], [20, 270]], '#3a6fb0', 5);
        crayon(c, circlePts(40, 232, 8), '#2f7a3a', 3); crayon(c, [[48, 236], [110, 236]], '#2f7a3a', 4);
        c.globalAlpha = .5; stick(c, 150, 110, .8, '#6a8ab0'); c.globalAlpha = 1;
        c.setLineDash([4, 7]); crayon(c, [[48, 232], [80, 190], [120, 150], [150, 125]], '#555', 2, 2); c.setLineDash([]);
        scribble(c, 196, 40, 236, 118, '#c8161a', 4, 5); crayon(c, [[196, 118], [196, 40], [236, 40], [236, 118]], '#5a0a0a', 4);
        crayonText(c, '我會飛', 128, 312, 28, '#222');
      },
    ];
    cells.forEach((f, i) => {
      const ox = (i % 3) * ART_W, oy = Math.floor(i / 3) * ART_H;
      c.save(); c.translate(ox, oy);
      c.fillStyle = '#efe6d2'; c.fillRect(0, 0, ART_W, ART_H);
      for(let k = 0; k < 900; k++){ const v = 200 + rnd() * 50; c.fillStyle = `rgba(${v},${v - 6},${v - 20},.25)`; c.fillRect(rnd() * ART_W, rnd() * ART_H, 1.5, 1.5); }
      blob(c, rnd() * ART_W, rnd() * ART_H, 70, 'rgba(160,120,60,A)', .18);
      c.beginPath(); c.rect(0, 0, ART_W, ART_H); c.clip();
      f(c);
      c.fillStyle = 'rgba(214,200,160,.75)'; c.fillRect(ART_W / 2 - 26, -4, 52, 22);   // 紙膠帶
      c.strokeStyle = 'rgba(120,100,70,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, ART_H * .52); c.lineTo(ART_W, ART_H * .5); c.stroke();   // 摺痕
      c.restore();
    });
  }, { wrap: false });

  // 3l. 虛空：深處往外透出來的紅光（固定）＋飄動的黑霧（捲動）＋深處的眼睛
  // 虛空的底：一條往深處去的紅色霧道 —— 遠方一團紅光落在霧濛濛的「地面」上，光從那裡一道道放射出來（比門洞大，可以跟著視角平移）
  const voidTex = canvasTex(256, 512, (c, W, Hh) => {
    const cx = W / 2, cy = Hh * .56;
    c.fillStyle = '#050000'; c.fillRect(0, 0, W, Hh);
    const g = c.createRadialGradient(cx, cy, 2, cx, cy, Hh * .55);
    g.addColorStop(0, '#ffe2b0'); g.addColorStop(.025, '#ff9048'); g.addColorStop(.08, '#e8301a'); g.addColorStop(.22, '#8c0a06'); g.addColorStop(.48, '#2c0103'); g.addColorStop(1, 'rgba(6,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, Hh);
    c.globalCompositeOperation = 'lighter';                                    // 光束
    for(let i = 0; i < 12; i++){
      const a = rnd() * TAU, w = .012 + rnd() * .03, L = Hh * (.25 + rnd() * .35);
      const gr = c.createRadialGradient(cx, cy, 0, cx, cy, L); gr.addColorStop(0, `rgba(255,80,36,${.05 + rnd() * .07})`); gr.addColorStop(1, 'rgba(255,40,10,0)');
      c.fillStyle = gr; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, L, a - w, a + w); c.closePath(); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    const fl = c.createLinearGradient(0, cy, 0, Hh); fl.addColorStop(0, 'rgba(0,0,0,0)'); fl.addColorStop(.12, 'rgba(20,0,0,.45)'); fl.addColorStop(1, 'rgba(0,0,0,.92)');   // 地面：光的下方較暗
    c.fillStyle = fl; c.fillRect(0, cy, W, Hh - cy);
    c.fillStyle = 'rgba(255,120,70,.25)'; c.fillRect(0, cy + 6, W, 2);         // 遠方的地平線反光
    c.fillStyle = 'rgba(255,60,20,.10)'; c.fillRect(0, cy + 2, W, 12);
  }, { wrap: false });
  // 霧：一縷一縷彎曲的煙（多層粗細不同的線疊出柔邊），四邊無縫
  const smokeTex = canvasTex(256, 256, (c, W) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, W, W); c.lineCap = 'round';
    for(let i = 0; i < (LOW ? 26 : 42); i++){
      const x = rnd() * W, y = rnd() * W, L = 60 + rnd() * 150, a0 = -Math.PI / 2 + (rnd() - .5) * 1.4, bend = (rnd() - .5) * 2.4;
      const pts = []; let px = 0, py = 0, a = a0; for(let k = 0; k < 10; k++){ pts.push([px, py]); a += bend / 10 + (rnd() - .5) * .3; px += L / 10 * Math.cos(a); py += L / 10 * Math.sin(a); }
      for(const [w, al] of [[34, .035], [20, .06], [9, .10], [3, .16]]){
        wrap9(W, W, (dx, dy) => { c.strokeStyle = `rgba(255,255,255,${al})`; c.lineWidth = w; c.beginPath(); pts.forEach(([u, v], k) => k ? c.lineTo(x + dx + u, y + dy + v) : c.moveTo(x + dx + u, y + dy + v)); c.stroke(); });
      }
    }
  }, { srgb: false });
  const smokeTex2 = smokeTex.clone(); smokeTex2.needsUpdate = true;
  const mistTex = smokeTex.clone(); mistTex.needsUpdate = true;
  // 門洞邊緣的暗框（貼在門口：越靠邊越黑 → 看起來門後是一條很深的通道）
  const vigTex = canvasTex(128, 256, (c, W, Hh) => {   // alphaMap 讀的是綠色版 → 黑底白字（白＝不透明）
    c.fillStyle = '#000'; c.fillRect(0, 0, W, Hh);
    const e = c.createLinearGradient(0, 0, W, 0); e.addColorStop(0, 'rgba(255,255,255,1)'); e.addColorStop(.14, 'rgba(255,255,255,.6)'); e.addColorStop(.32, 'rgba(255,255,255,0)'); e.addColorStop(.68, 'rgba(255,255,255,0)'); e.addColorStop(.86, 'rgba(255,255,255,.6)'); e.addColorStop(1, 'rgba(255,255,255,1)');
    c.fillStyle = e; c.fillRect(0, 0, W, Hh);
    const t = c.createLinearGradient(0, 0, 0, Hh); t.addColorStop(0, 'rgba(255,255,255,1)'); t.addColorStop(.12, 'rgba(255,255,255,.55)'); t.addColorStop(.28, 'rgba(255,255,255,0)'); t.addColorStop(.88, 'rgba(255,255,255,0)'); t.addColorStop(1, 'rgba(255,255,255,.75)');
    c.fillStyle = t; c.fillRect(0, 0, W, Hh);
  }, { wrap: false, srgb: false });
  const eyesTex = canvasTex(128, 64, (c) => {
    for(const x of [44, 84]){
      const g = c.createRadialGradient(x, 32, 0, x, 32, 18); g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(.25, 'rgba(255,190,80,.9)'); g.addColorStop(.6, 'rgba(255,60,10,.35)'); g.addColorStop(1, 'rgba(255,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(x, 32, 18, 12, 0, 0, TAU); c.fill();
    }
  }, { wrap: false });
  // 3m. 地上的低霧（無縫）
  const fogTex = canvasTex(256, 256, (c, W) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, W, W);
    for(let i = 0; i < (LOW ? 40 : 70); i++){
      const x = rnd() * W, y = rnd() * W, r = 16 + rnd() * 50, a = .10 + rnd() * .35;
      wrap9(W, W, (dx, dy) => { c.save(); c.translate(x + dx, y + dy); c.scale(2.2, 1); blob(c, 0, 0, r, 'rgba(255,255,255,A)', a); c.restore(); });
    }
  }, { srgb: false, repeat: [1 / 2.4, 1 / 2.4] });
  const fogTex2 = fogTex.clone(); fogTex2.repeat.set(1 / 1.7, 1 / 1.7); fogTex2.needsUpdate = true;

  // 3n. 髒污貼花圖集（4×2 格，每格 256）：0 剝落的壁紙、1 水漬、2 抓痕、3 蜘蛛網、4 小手印、5 小腳印、6 塗鴉「不要關燈」、7 霉斑
  const DEC_C = 4, DEC_R = 2, DEC_S = 256;
  const decalTex = canvasTex(DEC_S * DEC_C, DEC_S * DEC_R, (c0) => {
    const cell = (i, f) => { c0.save(); c0.translate((i % DEC_C) * DEC_S, Math.floor(i / DEC_C) * DEC_S); c0.beginPath(); c0.rect(0, 0, DEC_S, DEC_S); c0.clip(); f(c0, DEC_S); c0.restore(); };
    cell(0, (c, S) => {   // 剝落：一條從接縫撕開的壁紙（參差的邊），露出底下發霉的灰色底漆
      const L = [], R = [];
      for(let k = 0; k <= 14; k++){ const y = S * (.04 + .92 * k / 14), w = S * (.16 + .1 * Math.sin(k * 1.3) + rnd() * .07); L.push([S / 2 - w - rnd() * 10, y]); R.push([S / 2 + w * (.7 + rnd() * .4), y]); }
      const hole = () => { c.beginPath(); L.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); for(let i = R.length - 1; i >= 0; i--) c.lineTo(...R[i]); c.closePath(); };
      c.save(); c.translate(S * .5, S * .5); c.scale(1.07, 1.02); c.translate(-S * .5, -S * .5); c.fillStyle = 'rgba(70,64,54,.9)'; hole(); c.fill(); c.restore();   // 紙背（撕開的白邊，很髒）
      c.fillStyle = '#34302a'; hole(); c.fill();
      for(let i = 0; i < 700; i++){ c.fillStyle = rnd() < .55 ? 'rgba(12,11,9,.25)' : 'rgba(90,84,72,.16)'; c.fillRect(S * .25 + rnd() * S * .5, rnd() * S, 2, 2); }
      for(let i = 0; i < 6; i++) blob(c, S * (.35 + rnd() * .3), S * (.2 + rnd() * .7), 12 + rnd() * 20, 'rgba(10,16,8,A)', .5);   // 霉
      c.strokeStyle = 'rgba(8,7,5,.75)'; c.lineWidth = 1;
      for(let i = 0; i < 6; i++){ let x = S * (.4 + rnd() * .2), y = S * rnd(); c.beginPath(); c.moveTo(x, y); for(let k = 0; k < 5; k++){ x += (rnd() - .5) * 18; y += 10 + rnd() * 14; c.lineTo(x, y); } c.stroke(); }
    });
    cell(1, (c, S) => {   // 水漬：從上面流下來、上濃下淡的褐色痕跡
      const g0 = c.createLinearGradient(0, 0, 0, S * .25); g0.addColorStop(0, 'rgba(52,34,16,.55)'); g0.addColorStop(1, 'rgba(52,34,16,0)'); c.fillStyle = g0; c.fillRect(S * .1, 0, S * .8, S * .25);
      for(let i = 0; i < 11; i++){
        const x = S * (.16 + rnd() * .68), w = 5 + rnd() * 15, L = S * (.35 + rnd() * .6);
        const g = c.createLinearGradient(0, 0, 0, L); g.addColorStop(0, `rgba(52,34,16,${.35 + rnd() * .3})`); g.addColorStop(1, 'rgba(52,34,16,0)');
        c.fillStyle = g; c.beginPath(); c.moveTo(x - w, 0); c.quadraticCurveTo(x - w * .3, L * .6, x, L); c.quadraticCurveTo(x + w * .3, L * .6, x + w, 0); c.fill();
      }
    });
    cell(2, (c, S) => {   // 抓痕：四道平行、刮掉壁紙露出底漆（亮）＋兩邊的陰影
      for(let k = 0; k < 4; k++){
        const x0 = S * .26 + k * 24 + rnd() * 6, pts = [[x0, S * .1], [x0 + 10 + rnd() * 8, S * .45], [x0 + 22 + rnd() * 10, S * .9]];
        const line = () => { c.beginPath(); c.moveTo(...pts[0]); c.quadraticCurveTo(...pts[1], ...pts[2]); c.stroke(); };
        c.lineCap = 'round'; c.strokeStyle = 'rgba(8,6,4,.75)'; c.lineWidth = 9; line();
        c.strokeStyle = 'rgba(150,138,118,.9)'; c.lineWidth = 4; line();
        c.strokeStyle = 'rgba(210,198,176,.55)'; c.lineWidth = 1.2; line();
      }
    });
    cell(3, (c, S) => {   // 蜘蛛網：從左上角放射出去，一圈一圈垂下來的絲
      c.strokeStyle = 'rgba(215,212,205,.55)'; c.lineWidth = 1.1;
      const rays = []; for(let k = 0; k <= 8; k++) rays.push(k / 8 * Math.PI / 2);
      for(const a of rays){ c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * S * 1.1, Math.sin(a) * S * 1.1); c.stroke(); }
      for(let r = 26; r < S; r += 17 + rnd() * 10){
        c.lineWidth = .7 + rnd() * .6; c.beginPath();
        rays.forEach((a, k) => { const x = Math.cos(a) * r, y = Math.sin(a) * r; if(!k) c.moveTo(x, y); else { const pa = rays[k - 1], m = (a + pa) / 2, sag = r * .82; c.quadraticCurveTo(Math.cos(m) * sag, Math.sin(m) * sag, x, y); } });
        c.stroke();
      }
      c.fillStyle = 'rgba(200,196,188,.25)'; for(let i = 0; i < 40; i++) c.fillRect(rnd() * S * .8, rnd() * S * .8, 2, 2);
    });
    cell(4, (c, S) => {   // 小手印：灰黑、抹開的（玻璃、天花板、牆上）
      c.translate(S * .5, S * .52); c.scale(S / 128, S / 128); c.translate(-64, -64);
      c.fillStyle = 'rgba(22,16,13,.9)';
      for(let p = 0; p < 3; p++){
        const j = () => (rnd() - .5) * 3; c.globalAlpha = .4 + rnd() * .3;
        c.beginPath(); c.ellipse(64 + j(), 80 + j(), 23, 27, 0, 0, TAU); c.fill();
        for(const [x, y, rx, ry, a] of [[36, 64, 7, 15, -.9], [47, 34, 6.5, 17, -.2], [62, 26, 6.5, 19, 0], [77, 30, 6.5, 17, .15], [90, 46, 6, 13, .45]]){ c.beginPath(); c.ellipse(x + j(), y + j(), rx, ry, a, 0, TAU); c.fill(); }
      }
      c.globalAlpha = 1;
    });
    cell(5, (c, S) => {   // 小腳印（光腳、沾了灰）
      c.translate(S * .5, S * .52); c.scale(3.0, 1.3);
      c.fillStyle = 'rgba(150,140,122,.55)';
      c.beginPath(); c.ellipse(0, 30, 24, 52, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(-3, -32, 28, 30, 0, 0, TAU); c.fill();
      for(const [x, y, r] of [[-22, -70, 9], [-6, -78, 8], [8, -76, 7], [20, -70, 6], [29, -60, 5.5]]){ c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
      c.fillStyle = 'rgba(12,10,8,.35)'; c.beginPath(); c.ellipse(0, 30, 16, 40, 0, 0, TAU); c.fill();
    });
    cell(6, (c, S) => {   // 塗鴉：「不要關燈」寫了三次，越寫越亂
      crayonText(c, '不要關燈', S / 2, S * .2, 40, '#8a0e0c');
      c.save(); c.translate(S / 2, S * .5); c.rotate(-.06); crayonText(c, '不要關燈', 0, 0, 44, '#6a0a08'); c.restore();
      c.save(); c.translate(S / 2 + 6, S * .8); c.rotate(.1); crayonText(c, '不要關燈', 0, 0, 52, '#1a0a08'); c.restore();
      c.strokeStyle = 'rgba(100,10,8,.7)'; c.lineWidth = 3; c.beginPath(); c.moveTo(S * .12, S * .93); c.lineTo(S * .9, S * .9); c.stroke();
    });
    cell(7, (c, S) => {   // 霉斑：一團一團發黑發綠的點
      for(let i = 0; i < 60; i++){ const a = rnd() * TAU, r = Math.pow(rnd(), .6) * S * .42; blob(c, S / 2 + r * Math.cos(a), S / 2 + r * Math.sin(a), 6 + rnd() * 22, rnd() < .4 ? 'rgba(20,30,14,A)' : 'rgba(8,10,6,A)', .35 + rnd() * .35); }
    });
  }, { wrap: false });
  // 3o. 其他小貼圖：角落的暗（橫向漸層）、柔和的圓光暈
  const gradTex = canvasTex(64, 64, (c, W) => { const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#fff'); g.addColorStop(.3, '#9a9a9a'); g.addColorStop(.65, '#303030'); g.addColorStop(1, '#000'); c.fillStyle = g; c.fillRect(0, 0, W, W); }, { wrap: false, srgb: false });
  const haloTex = canvasTex(64, 64, (c, W) => { c.fillStyle = '#000'; c.fillRect(0, 0, W, W); blob(c, W / 2, W / 2, W / 2, 'rgba(255,255,255,A)', 1); }, { wrap: false, srgb: false });

  /* ============================================================
     4. 材質
     ============================================================ */
  const Std = o => new THREE.MeshStandardMaterial(o);
  const Phy = o => {   // 手機不用 Physical 的 sheen／clearcoat（少一大段 shader）
    if(!LOW) return new THREE.MeshPhysicalMaterial(o);
    const { sheen, sheenRoughness, sheenColor, clearcoat, clearcoatRoughness, ...rest } = o;
    return new THREE.MeshStandardMaterial(rest);
  };
  const ENV = 0.18;   // 這間的東西環境反射壓低（窗簾拉上的房間）
  const MT = {
    paper : Std({ color: 0xffffff, map: paperTex, aoMap: grimeTex, aoMapIntensity: 1, roughness: .92, envMapIntensity: ENV }),
    wain  : Std({ color: 0xffffff, map: wainTex, bumpMap: wainTex, bumpScale: 1.2, roughness: .62, envMapIntensity: ENV }),
    trim  : Std({ color: 0x2c1f17, roughness: .5, envMapIntensity: ENV }),
    floor : Std({ color: 0xffffff, map: floorTex, bumpMap: floorTex, bumpScale: 1.5, roughness: .72, envMapIntensity: ENV }),
    ceil  : Std({ color: 0x3a3530, aoMap: grimeTex, aoMapIntensity: 1, roughness: .95, envMapIntensity: ENV }),
    rug   : Std({ color: 0xffffff, map: rugTex, bumpMap: rugTex, bumpScale: 2, roughness: 1, envMapIntensity: ENV }),
    velvet: Phy({ color: 0x2a080c, roughness: .92, sheen: .8, sheenRoughness: .5, sheenColor: new THREE.Color(0x6a2030), side: THREE.DoubleSide, envMapIntensity: ENV }),
    bronze: Std({ color: 0x5a4630, roughness: .38, metalness: .85 }),
    brass : Std({ color: 0xa8843e, roughness: .3, metalness: 1 }),
    cribW : Std({ color: 0xbdb3a0, map: chipTex, roughness: .6, envMapIntensity: ENV }),
    sheet : Std({ color: 0x9c998f, map: sheetTex, roughness: .95, envMapIntensity: ENV }),
    wood  : Std({ color: 0x3a261b, roughness: .5, envMapIntensity: ENV }),
    black : Std({ color: 0x0c0b0b, roughness: .25, metalness: .1 }),
    plast : Std({ color: 0xcfc6ae, roughness: .55 }),
    shelf : Std({ color: 0x55615f, map: chipTex, roughness: .7, envMapIntensity: ENV }),
    toy   : Std({ color: 0xffffff, vertexColors: true, roughness: .75, envMapIntensity: ENV }),
    fur   : Std({ color: 0xffffff, vertexColors: true, roughness: 1, envMapIntensity: ENV }),
    redP  : Phy({ color: 0xffffff, map: redTex, roughness: .42, clearcoat: .45, clearcoatRoughness: .35, envMapIntensity: .7 }),
    redC  : Phy({ color: 0x8a4a48, map: redTex, roughness: .5, clearcoat: .3, clearcoatRoughness: .4, envMapIntensity: .6 }),
    art   : Std({ color: 0xffffff, map: artTex, roughness: 1, side: THREE.DoubleSide, envMapIntensity: ENV }),
    hand  : Std({ color: 0xffffff, map: handTex, transparent: true, depthWrite: false, roughness: .6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    shade : Std({ color: 0xa8a288, map: shadeTex, emissive: 0xa8c878, emissiveMap: shadeTex, emissiveIntensity: .7, roughness: 1, side: THREE.DoubleSide }),   // 燈罩：發黃的舊布、透出病懨懨的綠光
    bulb  : Std({ color: 0xe8f0d0, emissive: 0xc0e098, emissiveIntensity: 2.0 }),
    glowS : Std({ color: 0xb8c8a0, emissive: 0x9fe07a, emissiveIntensity: .5, roughness: .8 }),   // 天花板夜光星星貼紙
    night : Std({ color: 0x806850, emissive: 0xff7a30, emissiveIntensity: .5, roughness: .6 }),   // 小夜燈（快壞了，忽明忽暗）
    led   : Std({ color: 0x300000, emissive: 0xff2010, emissiveIntensity: 2 }),
    porc  : Std({ color: 0xefe6da, roughness: .28, envMapIntensity: .8 }),
    decal : Std({ color: 0xffffff, map: decalTex, transparent: true, depthWrite: false, roughness: .9, envMapIntensity: .15, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    voidBk: Std({ color: 0x050303, roughness: 1, envMapIntensity: .05 }),   // 紅門門洞後面的黑底（拍照模式看到的就是它）
  };
  MT.flap = MT.paper.clone(); MT.flap.side = THREE.DoubleSide; MT.flap.aoMap = null;   // 翹起來的壁紙（兩面都看得到）
  // 會發光的材質：拍照模式把燈罩當成「不擋光」；夜光貼紙／小夜燈是 screen（白天也微亮）
  ctx.emissives.push({ mat: MT.shade, base: .7, kind: 'lamp' }, { mat: MT.bulb, base: 2.0, kind: 'lamp' },
                     { mat: MT.glowS, base: .5, kind: 'screen' }, { mat: MT.night, base: .5, kind: 'screen' }, { mat: MT.led, base: 2, kind: 'screen' });

  /* ============================================================
     5. 房間殼：壁紙、護牆板、踢腳板、腰線、頂角線、地板、天花板
        全部貼在房間矩形／arch 牆面的「房內側」幾 mm，不伸進隔壁
     ============================================================ */
  /** 在 side 那面牆前 off 公尺放一片平面（沿牆 a0..a1、高 y0..y1）；uv 以公尺計（u 朝觀看者右手邊）；uvFn 可改寫 */
  function wallQuad(s, a0, a1, y0, y1, off, mat, parent = stat, uvFn = null){
    if(a1 - a0 < 1e-3 || y1 - y0 < 1e-3) return null;
    const sign = s.axis === 'x' ? s.n[1] : -s.n[0];
    const P = (a, y) => s.axis === 'x' ? [a, y, s.c + s.n[1] * off] : [s.c + s.n[0] * off, y, a];
    const uL = Math.min(a0 * sign, a1 * sign), uR = Math.max(a0 * sign, a1 * sign);
    const aL = uL * sign, aR = uR * sign;
    const pos = [...P(aL, y0), ...P(aR, y0), ...P(aR, y1), ...P(aL, y1)];
    const uv = uvFn ? [...uvFn(uL, y0), ...uvFn(uR, y0), ...uvFn(uR, y1), ...uvFn(uL, y1)] : [uL, y0, uR, y0, uR, y1, uL, y1];
    const nrm = [s.n[0], 0, s.n[1]];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([...nrm, ...nrm, ...nrm, ...nrm], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const m = new THREE.Mesh(g, mat); m.castShadow = false; m.receiveShadow = true; parent.add(m);
    return m;
  }
  /** 貼牆的長條（踢腳板、腰線、頂角線）：從牆面往房內 d、沿牆 a0..a1、高 y0..y1 */
  function wallStrip(s, a0, a1, y0, y1, d, mat){
    if(a1 - a0 < 1e-3) return;
    const L = a1 - a0, am = (a0 + a1) / 2, cm = s.c + (s.axis === 'x' ? s.n[1] : s.n[0]) * d / 2;
    if(s.axis === 'x') Bx(L, y1 - y0, d, mat, am, (y0 + y1) / 2, cm);
    else Bx(d, y1 - y0, L, mat, cm, (y0 + y1) / 2, am);
  }
  /** 把 a0..a1 扣掉洞（每個洞外擴 pad）之後剩下的段落 */
  function spans(a0, a1, holes, pad = 0){
    let out = [[a0, a1]];
    for(const h of holes){
      const hp = h.pad ?? pad, h0 = h.a0 - hp, h1 = h.a1 + hp, nx = [];
      for(const [s, e] of out){ if(h1 <= s || h0 >= e){ nx.push([s, e]); continue; } if(h0 > s) nx.push([s, h0]); if(h1 < e) nx.push([h1, e]); }
      out = nx;
    }
    return out.filter(([s, e]) => e - s > 1e-3);
  }
  // 紅門的尺寸與位置（要先知道：北牆的壁紙、護牆板要替它挖洞）：北牆中段偏東（西邊留給嬰兒床）
  const DW = 0.82, DH = 2.04, CW = 0.095, CD = 0.058, LT = 0.045, LW = DW - 0.008;
  const RX0 = X1 - X0;
  const doorCX = clamp(XW + RX0 * 0.575, XW + 1.30 + DW / 2, (northS ? northS.a1 : X1) - 0.75 - DW / 2);
  if(northS) northS.holes.push({ a0: doorCX - DW / 2 - CW + 0.02, a1: doorCX + DW / 2 + CW - 0.02, y0: 0, y1: DH + CW - 0.02, door: true, pad: 0 });
  const WAIN_TOP = Math.min(0.90, SILL);            // 護牆板＋腰線（跟窗台同高）
  const CROWN = 0.10;                                // 頂角線高
  const OFF = 0.004;                                 // 壁紙離牆 4 mm
  for(const s of sides){
    const winH = s.holes.filter(h => h.win), doorH = s.holes.filter(h => h.door);
    const e0 = concave(s, 'a0') ? 0 : OFF + .002, e1 = concave(s, 'a1') ? 0 : OFF + .002;   // 凸出來的轉角：兩片壁紙各多伸出一點點，接起來不露白縫
    // 壁紙：腰線以上（窗帶、門洞挖掉）
    for(const [p0, p1] of spans(s.a0 - e0, s.a1 + e1, [...winH, ...doorH])) wallQuad(s, p0, p1, WAIN_TOP, H - 0.002, OFF, MT.paper);
    for(const h of winH){ wallQuad(s, Math.max(h.a0, s.a0), Math.min(h.a1, s.a1), Math.max(h.y1, WAIN_TOP), H - 0.002, OFF, MT.paper); if(h.y0 > WAIN_TOP + .01) wallQuad(s, Math.max(h.a0, s.a0), Math.min(h.a1, s.a1), WAIN_TOP, h.y0, OFF, MT.paper); }
    for(const h of doorH) wallQuad(s, Math.max(h.a0, s.a0), Math.min(h.a1, s.a1), h.y1, H - 0.002, OFF, MT.paper);
    // 護牆板：地板到腰線（門洞挖掉；窗下照樣有）
    const wuv = (u, y) => [u / WAIN_W, (y - FLOOR) / (WAIN_TOP - FLOOR)];
    for(const [p0, p1] of spans(s.a0 - e0, s.a1 + e1, doorH)) wallQuad(s, p0, p1, FLOOR, winH.length ? Math.min(WAIN_TOP, SILL - 0.02) : WAIN_TOP, OFF, MT.wain, stat, wuv);
    // 踢腳板、腰線（窗台那段不做腰線：石材窗台就是腰線）、頂角線（門框兩邊留 6 cm 給 arch 的門框線板）
    for(const [p0, p1] of spans(s.a0, s.a1, doorH, 0.06)) wallStrip(s, p0, p1, FLOOR - 0.002, FLOOR + 0.15, 0.022, MT.trim);
    for(const [p0, p1] of spans(s.a0, s.a1, [...doorH, ...winH], 0.06)) wallStrip(s, p0, p1, WAIN_TOP - 0.035, WAIN_TOP + 0.005, 0.026, MT.trim);
    wallStrip(s, s.a0, s.a1, H - CROWN, H - 0.003, 0.05, MT.trim);
  }
  // 地板（深色舊木地板）與天花板（燻黃的舊漆）：每個矩形一片
  for(const q of rects){
    const w = q[2] - q[0], d = q[3] - q[1];
    const f = new THREE.PlaneGeometry(w, d); f.rotateX(-Math.PI / 2);
    { const P = f.attributes.position, U = f.attributes.uv; for(let i = 0; i < P.count; i++) U.setXY(i, (P.getX(i) + (q[0] + q[2]) / 2), -(P.getZ(i) + (q[1] + q[3]) / 2)); }
    const fm = M(f, MT.floor, (q[0] + q[2]) / 2, FLOOR + 0.0025, (q[1] + q[3]) / 2); fm.castShadow = false;
    const cg = new THREE.PlaneGeometry(w, d); cg.rotateX(Math.PI / 2);
    { const P = cg.attributes.position, U = cg.attributes.uv; for(let i = 0; i < P.count; i++) U.setXY(i, (P.getX(i) + (q[0] + q[2]) / 2), (P.getZ(i) + (q[1] + q[3]) / 2)); }
    const cm = M(cg, MT.ceil, (q[0] + q[2]) / 2, H - 0.004, (q[1] + q[3]) / 2, ceilG); cm.castShadow = false;
  }

  /* ============================================================
     6. 家具位置（全部相對於牆面推出來）
     ============================================================ */
  const RX = X1 - X0, RZ = ZS - ZN;                 // 主要那塊的寬（東西）與深（南北）
  // 6a. 紅門（位置在 §5 前面算好了）
  const OPEN = 78 * DEG, AJAR = 30 * DEG;
  // 6b. 嬰兒床：西牆、靠北（窗簾前面），長邊沿南北
  const CRIB_W = 0.78, CRIB_L = Math.min(1.36, RZ - 0.95), CRIB_H = 1.02;
  const crib = { x: XW + 0.22 + CRIB_W / 2, z: ZN + 0.10 + CRIB_L / 2 };
  // 6c. 搖椅：西南角，面向房間中央（嬰兒床那邊）
  const chairP = { x: XW + 0.70, z: ZS - 0.62 };
  // 6d. 尿布台（五斗櫃）：南牆，搖椅東邊；上面放留聲機、嬰兒監視器
  const DRS_W = 1.02, DRS_D = 0.48, DRS_H = 0.92;
  const drs = { x: XW + 1.45 + DRS_W / 2, z: ZS - 0.006 - DRS_D / 2 };
  // 6e. 玩具架：凹室北牆（沒有凹室就放主要那塊的東端北邊）
  const alcN = sides.filter(s => s.axis === 'x' && s.n[1] === 1 && s !== northS).reduce((a, s) => !a || (s.a1 - s.a0) > (a.a1 - a.a0) ? s : a, null);
  const SHF_W = alcN ? Math.min(1.02, alcN.a1 - alcN.a0 - 0.30) : 0.9, SHF_D = 0.30, SHF_H = 1.06;
  const shelfP = alcN ? { x: alcN.a0 + 0.10 + SHF_W / 2, z: alcN.c + 0.004 + SHF_D / 2 } : { x: X1 - 0.6, z: ZN + 1.2 };
  // 6f. 吊燈：主要那塊正中央
  const lampP = { x: (XW + X1) / 2, z: (ZN + ZS) / 2 };

  /* ============================================================
     7. 窗簾：厚重的暗紅絨布幾乎全拉上，嬰兒床後面只剩一道細縫（冷冷的天光、窗外的人影、玻璃上的小手印都從這裡看到）
     ============================================================ */
  let slit = null;
  if(westS && winBand){
    const x = westS.c + 0.10, y1 = Math.min(H - CROWN - 0.04, HEAD + 0.24), y0 = FLOOR + 0.012;
    const za = Math.max(westS.a0 + 0.012, winBand.a0 - 0.02), zb = Math.min(westS.a1 - 0.012, winBand.a1 + 0.05);
    const gapC = crib.z + 0.05, gapW = 0.11;
    slit = { z: gapC, w: gapW };
    // 桿子＋兩端的球（都在牆面範圍內，不伸進隔壁）
    { const r0 = westS.a0 + 0.035, r1 = westS.a1 - 0.035, g = new THREE.CylinderGeometry(0.014, 0.014, r1 - r0, 10); g.rotateX(Math.PI / 2); M(g, MT.bronze, x, y1 + 0.03, (r0 + r1) / 2);
      for(const z of [r0, r1]) Sph(0.03, MT.bronze, x, y1 + 0.03, z); }
    function drape(z0, z1, gather, phase){
      const w = z1 - z0, nx = Math.max(12, Math.round(w * (LOW ? 30 : 50))), ny = 10;
      const g = new THREE.PlaneGeometry(w, y1 - y0, nx, ny);
      const P = g.attributes.position;
      for(let i = 0; i < P.count; i++){
        const u = P.getX(i) / w + .5, v = P.getY(i) / (y1 - y0) + .5;
        const amp = 0.028 * gather * (1 + .35 * (1 - v));
        const d = amp * Math.sin(u * w * TAU / (0.13 / gather) + phase) + (v < .03 ? .02 : 0);
        P.setXYZ(i, d, P.getY(i), P.getX(i));
      }
      g.computeVertexNormals();
      M(g, MT.velvet, x + 0.02, (y0 + y1) / 2, (z0 + z1) / 2);
    }
    drape(za, gapC - gapW / 2, 1.2, 0);
    drape(gapC + gapW / 2, zb, 1.25, 1.3);
    // 綁帶（窗簾束起來的地方）
    for(const z of [gapC - gapW / 2 - 0.02, gapC + gapW / 2 + 0.02]) Bx(0.06, 0.03, 0.10, MT.bronze, x + 0.03, 1.05, z);
  }

  /* ============================================================
     8. 嬰兒床（舊的白色直條欄杆床）＋床上的東西＋吊飾支架
     ============================================================ */
  let mobileHub = null;
  {
    const g = grp(crib.x, FLOOR, crib.z, 0);
    const W = CRIB_W, L = CRIB_L, P = 0.05;
    for(const sx of [-1, 1]) for(const sz of [-1, 1]){
      Bx(P, CRIB_H, P, MT.cribW, sx * (W / 2 - P / 2), CRIB_H / 2, sz * (L / 2 - P / 2), g);
      Sph(0.034, MT.cribW, sx * (W / 2 - P / 2), CRIB_H + 0.03, sz * (L / 2 - P / 2), g);
    }
    for(const y of [0.30, CRIB_H - 0.04]){
      for(const sx of [-1, 1]) Bx(0.03, 0.045, L - 2 * P, MT.cribW, sx * (W / 2 - P / 2), y, 0, g);
      for(const sz of [-1, 1]) Bx(W - 2 * P, 0.045, 0.03, MT.cribW, 0, y, sz * (L / 2 - P / 2), g);
    }
    const spH = CRIB_H - 0.04 - 0.30 - 0.045, spY = 0.30 + 0.0225 + spH / 2;
    const spG = new THREE.CylinderGeometry(0.011, 0.011, spH, LOW ? 6 : 8);
    for(let z = -L / 2 + P + 0.05; z < L / 2 - P - 0.02; z += 0.068) for(const sx of [-1, 1]) M(spG.clone(), MT.cribW, sx * (W / 2 - P / 2), spY, z, g);
    for(let x = -W / 2 + P + 0.05; x < W / 2 - P - 0.02; x += 0.068) for(const sz of [-1, 1]) M(spG.clone(), MT.cribW, x, spY, sz * (L / 2 - P / 2), g);
    // 床頭板（北端）：拱形的實心板，畫一隻褪色的小羊
    { const sh = new THREE.Shape(); const w = W - 2 * P, h0 = 0.35, h1 = CRIB_H + 0.02;
      sh.moveTo(-w / 2, h0); sh.lineTo(w / 2, h0); sh.lineTo(w / 2, h1 - 0.1); sh.quadraticCurveTo(0, h1 + 0.1, -w / 2, h1 - 0.1); sh.closePath();
      const eg = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false, curveSegments: 10 });
      M(eg, MT.cribW, 0, 0, -L / 2 + P / 2 - 0.01, g); }
    // 床墊＋床單、小枕頭、皺皺的小被子、少一隻耳朵的兔子布偶
    RB(W - 2 * P - 0.02, 0.12, L - 2 * P - 0.02, 0.03, MT.sheet, 0, 0.36, 0, g, 2);
    { const pg = new RoundedBoxGeometry(0.30, 0.06, 0.20, 2, 0.028); M(pg, MT.sheet, 0, 0.45, -L / 2 + 0.2, g); }
    { const bw = W - 0.16, bl = L * 0.5, bg = new THREE.PlaneGeometry(bw, bl, 14, 14); bg.rotateX(-Math.PI / 2);
      const Pp = bg.attributes.position; for(let i = 0; i < Pp.count; i++){ const x = Pp.getX(i), z = Pp.getZ(i); Pp.setY(i, 0.009 * (1 + Math.sin(x * 23 + z * 7)) + 0.012 * (1 + Math.sin(z * 17) * Math.cos(x * 9)) + 0.03 * Math.max(0, 1 - Math.hypot(x - .05, z + .05) / .18)); }
      bg.computeVertexNormals(); const bm = M(bg, MT.velvet, 0, 0.428, L * 0.12, g); bm.castShadow = false; }
    { const rb = grp(0.10, 0.45, 0.05, .6, g);
      const f = (geo, hex) => M(paint(geo, hex), MT.fur, 0, 0, 0, rb);
      const b = f(new THREE.SphereGeometry(0.075, 12, 10), 0x9c948a); b.scale.set(1, .8, 1.25);
      const h = f(new THREE.SphereGeometry(0.058, 12, 10), 0xa39a8f); h.position.set(0, .03, -.11);
      const e = f(new THREE.SphereGeometry(0.02, 8, 8), 0xa39a8f); e.scale.set(1, 1, 4); e.position.set(.03, .045, -.19); e.rotation.x = -.3;
      const t = f(new THREE.SphereGeometry(0.012, 6, 6), 0x5a2a28); t.position.set(-.03, .06, -.14);    // 耳朵斷掉的地方
      const eye = M(paint(new THREE.SphereGeometry(0.008, 6, 6), 0x080808), MT.toy, .022, .045, -.16, rb); }
    // 吊飾支架：從東側欄杆中間伸上去、彎到床的正上方
    const armX = W / 2 - P / 2;
    M(taperTube([[armX, CRIB_H - 0.04, 0], [armX + 0.02, 1.35, 0], [armX - 0.02, 1.72, 0], [armX - 0.18, 1.86, 0], [0.02, 1.84, 0]], 0.011, 0.009, 24), MT.cribW, 0, 0, 0, g);
    Bx(0.05, 0.08, 0.06, MT.cribW, armX, CRIB_H - 0.02, 0, g);
    collide(g, 1.0);
    mobileHub = { x: crib.x + 0.02, y: FLOOR + 1.84, z: crib.z };
  }
  // 吊飾本體（會轉）：兩根十字支架、五條線吊著月亮／星星／雲／小羊……跟一隻黑色的烏鴉
  const mobile = grp(mobileHub.x, mobileHub.y, mobileHub.z, 0, anim);
  {
    const T = (geo, hex, x, y, z, rx = 0, ry = 0) => { const m = M(paint(geo, hex), MT.toy, x, y, z, mobile); m.rotation.set(rx, ry, 0); return m; };
    T(new THREE.CylinderGeometry(0.018, 0.012, 0.05, 10), 0xd2c8b4, 0, -0.02, 0);
    for(const a of [0, Math.PI / 2]){ const g = new THREE.CylinderGeometry(0.004, 0.004, 0.46, 6); g.rotateZ(Math.PI / 2); g.rotateY(a); T(g, 0xd2c8b4, 0, -0.045, 0); }
    const ex = (shape, d = 0.012) => { const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelSize: .003, bevelThickness: .003, bevelSegments: 1, curveSegments: 8 }); g.center(); return g; };
    const moon = new THREE.Shape(); moon.absarc(0, 0, .06, Math.PI * .35, Math.PI * 1.65, false); moon.absarc(.028, 0, .05, Math.PI * 1.55, Math.PI * .45, true);
    const st = new THREE.Shape(); for(let i = 0; i < 10; i++){ const r = i % 2 ? .022 : .055, a = Math.PI / 2 + i * Math.PI / 5; i ? st.lineTo(r * Math.cos(a), r * Math.sin(a)) : st.moveTo(r * Math.cos(a), r * Math.sin(a)); }
    const crow = new THREE.Shape();   // 小蝙蝠：翅膀下緣一扇一扇、頭上兩隻尖耳朵
    crow.moveTo(0, .022); crow.lineTo(.008, .036); crow.lineTo(.013, .02); crow.quadraticCurveTo(.05, .045, .085, .03);
    crow.quadraticCurveTo(.07, .012, .066, -.004); crow.quadraticCurveTo(.052, .006, .044, -.008); crow.quadraticCurveTo(.03, .002, .018, -.016); crow.quadraticCurveTo(.008, -.012, 0, -.022);
    crow.quadraticCurveTo(-.008, -.012, -.018, -.016); crow.quadraticCurveTo(-.03, .002, -.044, -.008); crow.quadraticCurveTo(-.052, .006, -.066, -.004); crow.quadraticCurveTo(-.07, .012, -.085, .03);
    crow.quadraticCurveTo(-.05, .045, -.013, .02); crow.lineTo(-.008, .036); crow.lineTo(0, .022);
    const items = [
      { a: 0,              L: .20, geo: ex(moon), hex: 0xe6d6a0 },
      { a: TAU * .2,       L: .27, geo: ex(st), hex: 0xd9c9a0 },
      { a: TAU * .4,       L: .22, geo: null, hex: 0xc8ccd0, cloud: true },
      { a: TAU * .6,       L: .30, geo: ex(crow, .01), hex: 0x121010 },
      { a: TAU * .8,       L: .24, geo: ex(st), hex: 0xb8c2c8 },
    ];
    for(const it of items){
      const x = .21 * Math.cos(it.a), z = .21 * Math.sin(it.a), y = -.05 - it.L;
      T(new THREE.CylinderGeometry(0.0012, 0.0012, it.L, 3), 0x8a8478, x, -.05 - it.L / 2, z);
      if(it.cloud){ for(const [dx, dy, r] of [[-.035, 0, .03], [0, .012, .038], [.035, 0, .03]]) T(new THREE.SphereGeometry(r, 10, 8), it.hex, x + dx, y + dy - .03, z).scale.set(1, .85, .6); }
      else T(it.geo, it.hex, x, y - .04, z, 0, -it.a + Math.PI / 2);
    }
    mergeInto(mobile, { cast: false });
  }

  /* ============================================================
     9. 搖椅（會自己搖）：舊的深色木頭、直條椅背、扶手、搭著一條毯子
        搖的方式：以弧形椅腳的圓心為軸（半徑 RR）、一邊轉一邊滾（弧腳貼著地板滾，不會穿地）
     ============================================================ */
  const RR = 1.0;
  const chairBase = grp(chairP.x, FLOOR, chairP.z, Math.atan2((crib.x + 0.6) - chairP.x, (crib.z + 0.25) - chairP.z), anim);
  const chairPiv = grp(0, RR, 0, 0, chairBase);
  {
    const c = grp(0, -RR, 0, 0, chairPiv);
    const runner = () => {
      const sh = new THREE.Shape(), a0 = -0.52, a1 = 0.50, ro = RR, ri = RR - 0.035, n = 18;
      for(let i = 0; i <= n; i++){ const a = lerp(a0, a1, i / n); const z = ro * Math.sin(a), y = RR - ro * Math.cos(a); i ? sh.lineTo(z, y) : sh.moveTo(z, y); }
      for(let i = n; i >= 0; i--){ const a = lerp(a0, a1, i / n); sh.lineTo(ri * Math.sin(a), RR - ri * Math.cos(a)); }
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.028, bevelEnabled: false, curveSegments: 4 }); g.rotateY(-Math.PI / 2); g.translate(0.014, 0, 0);
      return g;
    };
    const ry = z => RR - Math.sqrt(RR * RR - z * z) + 0.035;
    for(const sx of [-1, 1]){
      M(runner(), MT.wood, sx * 0.24, 0, 0, c);
      for(const sz of [-1, 1]){ const z = sz * 0.19, y0 = ry(z) - .005; Cyl(.017, .017, 0.43 - y0, MT.wood, sx * 0.22, (y0 + 0.43) / 2, z, c, 8); }
      Cyl(.016, .016, 0.24, MT.wood, sx * 0.22, 0.55, 0.19, c, 8);                                   // 扶手前柱
      { const a = Bx(0.05, 0.025, 0.46, MT.wood, sx * 0.235, 0.675, 0.0, c); a.rotation.x = 0.06; }  // 扶手
      { const p = Cyl(.018, .015, 0.66, MT.wood, sx * 0.21, 0.76, -0.24, c, 8); p.rotation.x = -0.16; }   // 椅背柱
    }
    RB(0.50, 0.045, 0.46, 0.012, MT.wood, 0, 0.45, 0, c);
    { const cr = RB(0.50, 0.075, 0.035, 0.01, MT.wood, 0, 1.06, -0.295, c); cr.rotation.x = -0.16; }
    for(let i = -2; i <= 2; i++){ const s = Cyl(.009, .009, 0.54, MT.wood, i * 0.075, 0.78, -0.255, c, 6); s.rotation.x = -0.16; }
    for(const sx of [-1, 1]) Bx(0.02, 0.02, 0.36, MT.wood, sx * 0.22, 0.18, 0, c);
    // 毯子：搭在椅背上、垂到座位（一片彎折的布）
    { const w = 0.44, n = 18, g = new THREE.PlaneGeometry(w, 0.9, 10, n); const P = g.attributes.position;
      for(let i = 0; i < P.count; i++){ const x = P.getX(i), v = P.getY(i) / 0.9 + .5; // v 1 = 背後下緣 → 0 = 座位前緣
        const t = 1 - v; let y, z;
        if(t < .42){ const k = t / .42; y = lerp(0.62, 1.10, k); z = lerp(-0.34, -0.31, k) - 0.02 * Math.sin(k * Math.PI); }       // 椅背後面
        else if(t < .5){ const k = (t - .42) / .08; y = 1.10 + 0.02 * Math.sin(k * Math.PI); z = lerp(-0.31, -0.26, k); }            // 翻過頂
        else { const k = (t - .5) / .5; y = lerp(1.08, 0.50, k); z = lerp(-0.26, -0.03, k) + 0.03 * Math.sin(k * Math.PI); }         // 椅背前面到座位
        P.setXYZ(i, x * (1 + .06 * Math.sin(v * 9)), y + 0.008 * Math.sin(x * 40 + v * 12), z + 0.006 * Math.sin(x * 31));
      }
      g.computeVertexNormals();
      const bm = M(g, Std({ color: 0x7a6a58, roughness: 1, side: THREE.DoubleSide, map: sheetTex, envMapIntensity: ENV }), 0, 0, 0, c); bm.material.color.setHex(0x8e7a64); }
    mergeInto(c, { cast: false });
    // 碰撞：一個涵蓋任何方向的正方形（搖椅會趁你不注意轉過來對著你）
    ctx.colliders.push({ x0: chairP.x - .6, x1: chairP.x + .6, z0: chairP.z - .6, z1: chairP.z + .6, y1: 1.1 });
  }

  /* ============================================================
     10. 尿布台（五斗櫃）＋留聲機＋嬰兒監視器
     ============================================================ */
  let record = null, monScreen = null;
  const monXf = new THREE.Matrix4();
  const gramoPos = V3(0, 0, 0), monPos = V3(0, 0, 0);
  {
    const g = grp(drs.x, FLOOR, drs.z, Math.PI);   // 局部 +z 朝房內（北）
    const W = DRS_W, D = DRS_D, Hh = DRS_H;
    for(const sx of [-1, 1]) for(const sz of [-1, 1]) lathe([[0, 0], [.028, 0], [.022, .05], [.03, .08], [.02, .1], [0, .1]], MT.wood, sx * (W / 2 - .06), 0, sz * (D / 2 - .06), g, 10);
    Bx(W - .02, Hh - .13, D - .02, MT.wood, 0, .1 + (Hh - .13) / 2, 0, g);
    RB(W + .03, .03, D + .02, .008, MT.wood, 0, Hh - .015, 0, g);
    for(let i = 0; i < 3; i++){
      const y = .16 + i * .235, open = i === 1 ? .07 : 0;
      Bx(W - .07, .205, .022, MT.wood, 0, y + .105, D / 2 - .002 + open, g);
      if(open) Bx(W - .1, .19, open, MT.black, 0, y + .1, D / 2 + open / 2 - .01, g);   // 拉開的抽屜縫（裡面黑的）
      for(const sx of [-1, 1]) Sph(.018, MT.brass, sx * .24, y + .105, D / 2 + .02 + open, g, 1, 1, .7, 10, 8);
    }
    // 桌面上的蕾絲墊
    { const dg = new THREE.CircleGeometry(.2, 24); dg.rotateX(-Math.PI / 2); dg.scale(1.4, 1, 1); M(dg, Std({ color: 0xcfc4ac, roughness: 1 }), -.18, Hh + .002, .02, g).castShadow = false; }
    // 留聲機：木盒＋轉盤＋唱片（會轉）＋唱臂＋大喇叭（花瓣形，朝房內斜上）
    const gx = -.22, gz = -.02, gy = Hh;
    Bx(.30, .14, .30, MT.wood, gx, gy + .07, gz, g);
    Bx(.31, .012, .31, MT.trim, gx, gy + .006, gz, g);
    Cyl(.13, .13, .012, MT.black, gx, gy + .146, gz, g, 28);
    Cyl(.008, .008, .05, MT.brass, gx + .12, gy + .16, gz + .12, g, 8).rotation.z = .8;                       // 發條把手
    Cyl(.01, .012, .06, MT.brass, gx + .11, gy + .17, gz - .11, g, 8);                                         // 唱臂座
    M(taperTube([[gx + .11, gy + .2, gz - .11], [gx + .07, gy + .205, gz - .03], [gx + .02, gy + .19, gz + .06]], .008, .006, 10), MT.brass, 0, 0, 0, g);
    Cyl(.022, .022, .014, MT.brass, gx + .02, gy + .175, gz + .06, g, 12).rotation.z = Math.PI / 2;            // 唱頭
    { // 喇叭：車削後把半徑做成八瓣
      const pts = []; for(let i = 0; i <= 14; i++){ const t = i / 14; pts.push(new THREE.Vector2(.016 + .15 * Math.pow(t, 2.6), t * .34)); }
      const hg = new THREE.LatheGeometry(pts, LOW ? 24 : 40); const P = hg.attributes.position;
      for(let i = 0; i < P.count; i++){ const x = P.getX(i), z = P.getZ(i), y = P.getY(i), a = Math.atan2(z, x), k = 1 + .07 * Math.cos(8 * a) * (y / .34); P.setX(i, x * k); P.setZ(i, z * k); }
      hg.computeVertexNormals();
      const hm = M(hg, Std({ color: 0x7a1a14, roughness: .45, metalness: .5, side: THREE.DoubleSide }), gx + .06, gy + .22, gz - .14, g);
      hm.rotation.x = 1.05; hm.castShadow = true;
      M(taperTube([[gx + .11, gy + .21, gz - .11], [gx + .09, gy + .24, gz - .15], [gx + .065, gy + .225, gz - .145]], .012, .018, 8), MT.brass, 0, 0, 0, g);
    }
    // 嬰兒監視器（接收端）：米色塑膠、小螢幕、天線、紅色指示燈；稍微轉向房間中央
    const mx = .30, mz = .06;
    const mg = grp(mx, Hh, mz, -.45, g);
    { const b = RB(.088, .128, .036, .01, MT.plast, 0, .075, 0, mg); b.rotation.x = -.12; }
    Cyl(.004, .003, .10, MT.black, .03, .18, -.01, mg, 6);
    Sph(.004, MT.led, -.03, .125, .018, mg);
    for(let i = 0; i < 4; i++) Bx(.05, .003, .002, MT.black, 0, .035 + i * .008, .0195, mg);
    // 螢幕（單獨一片，會重畫）
    const scrG = new THREE.PlaneGeometry(.066, .05);
    monScreen = new THREE.Mesh(scrG, null);   // 材質在 §13 建好後掛上
    monScreen.position.set(0, .088, .0195); monScreen.rotation.x = -.12; monScreen.userData.noBake = true;
    mg.add(monScreen);
    // 換尿布的小墊子、一小疊布尿布
    RB(.34, .05, .26, .02, MT.sheet, .08, Hh + .025, -.08, g);
    // 世界座標（聲音用）
    g.updateWorldMatrix(true, true);
    gramoPos.set(gx, gy + .25, gz).applyMatrix4(g.matrixWorld);
    monXf.copy(mg.matrixWorld);
    monPos.set(mx, Hh + .1, mz).applyMatrix4(g.matrixWorld);
    // 唱片（會轉）：放在會動的那一組
    record = grp(0, 0, 0, 0, anim);
    record.position.set(gx, gy + .154, gz).applyMatrix4(g.matrixWorld);
    M(new THREE.CylinderGeometry(.125, .125, .004, 32), MT.black, 0, 0, 0, record);
    M(paint(new THREE.CylinderGeometry(.042, .042, .0045, 20), 0x8a1410), MT.toy, 0, 0, 0, record);
    M(paint(new THREE.BoxGeometry(.02, .005, .006), 0xd8c070), MT.toy, .025, .001, 0, record);   // 標籤上的一點（看得出在轉）
    mergeInto(record, { cast: false });
    collide(g, 0.95);
  }

  /* ============================================================
     11. 玩具架（凹室北牆）：積木、跳出來的小丑盒、少一隻眼睛的熊、書、小鼓、坐在頂上的瓷娃娃（頭會轉）
     ============================================================ */
  let dollHead = null;
  const dollPos = V3(), jackAt = V3();
  {
    const g = grp(shelfP.x, FLOOR, shelfP.z, 0);   // 局部 +z 朝南（房內）
    const W = SHF_W, D = SHF_D, Hh = SHF_H, t = .022;
    for(const sx of [-1, 1]) Bx(t, Hh, D, MT.shelf, sx * (W / 2 - t / 2), Hh / 2, 0, g);
    for(const y of [.06, .40, .73, Hh - t / 2]) Bx(W - 2 * t, t, D - .01, MT.shelf, 0, y, .005, g);
    Bx(W, .06, .02, MT.shelf, 0, .03, D / 2 - .01, g);
    Bx(W - 2 * t, Hh - .04, .01, MT.shelf, 0, Hh / 2, -D / 2 + .005, g);
    const T = (geo, hex, x, y, z, parent = g) => M(paint(geo, hex), MT.toy, x, y, z, parent);
    // 下層：書（斜靠）、小鼓
    for(let i = 0; i < 6; i++){ const b = T(new THREE.BoxGeometry(.03 + rnd() * .012, .19 + rnd() * .04, .15), [0x5a2a24, 0x2c3e4a, 0x6a5a38, 0x3a4a30, 0x4a2a40, 0x7a6a50][i], -W / 2 + .07 + i * .042, .17, -.01); b.rotation.z = i === 5 ? -.35 : (rnd() - .5) * .05; }
    T(new THREE.CylinderGeometry(.08, .08, .10, 18), 0x9a2a22, .25, .125, 0);
    T(new THREE.CylinderGeometry(.082, .082, .012, 18), 0xd8ccb0, .25, .178, 0);
    for(let k = 0; k < 8; k++){ const a = k / 8 * TAU; const s = T(new THREE.CylinderGeometry(.002, .002, .11, 3), 0xd8c070, .25 + .081 * Math.cos(a), .125, .081 * Math.sin(a)); s.rotation.z = .3 * (k % 2 ? 1 : -1); }
    // 頂上：小丑盒（盒子、搖把固定；蓋子、彈簧、小丑頭另外做：趁你沒在看的時候彈出來、又收回去）；中層：泰迪熊
    { const bx = .03, by = Hh; T(new THREE.BoxGeometry(.13, .13, .13), 0x2a5a8a, bx, by + .065, 0);
      T(new THREE.CylinderGeometry(.006, .006, .06, 6), 0xc8a030, bx + .08, by + .08, 0).rotation.z = Math.PI / 2;
      g.updateWorldMatrix(true, false); jackAt.set(bx, by, 0).applyMatrix4(g.matrixWorld); }
    { const tb = grp(-.05, .411, .0, -.25, g);
      const f = (geo, hex, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = M(paint(geo, hex), MT.fur, x, y, z, tb); m.scale.set(sx, sy, sz); return m; };
      f(new THREE.SphereGeometry(.07, 12, 10), 0x6a4a30, 0, .08, 0, 1, 1.1, .9);
      f(new THREE.SphereGeometry(.055, 12, 10), 0x6e4e34, 0, .19, .01);
      for(const s of [-1, 1]){ f(new THREE.SphereGeometry(.022, 8, 8), 0x5a3c26, s * .04, .235, 0); f(new THREE.SphereGeometry(.028, 8, 8), 0x6a4a30, s * .07, .08, .03, 1, 1.4, 1); f(new THREE.SphereGeometry(.03, 8, 8), 0x6a4a30, s * .045, .02, .05, 1, .8, 1.3); }
      f(new THREE.SphereGeometry(.022, 8, 8), 0x8a6a4a, 0, .18, .055, 1, .8, 1);
      f(new THREE.SphereGeometry(.008, 6, 6), 0x050505, .02, .205, .05);                                     // 只剩一隻眼睛
      f(new THREE.CylinderGeometry(.001, .001, .03, 3), 0x303030, -.02, .19, .052).rotation.z = .5; }        // 掉了的那隻：剩一條線
    // 頂上：積木一疊
    for(let i = 0; i < 4; i++){ const b = T(new THREE.BoxGeometry(.055, .055, .055), [0xa8322a, 0x2a5a8a, 0xc8a030, 0x3a7a3a][i], .26 + (i === 3 ? .07 : 0), Hh + .0275 + (i < 3 ? i * .055 : 0), (rnd() - .5) * .02); b.rotation.y = (rnd() - .5) * .5; }
    // 瓷娃娃（整隻另外做，會換位置）：這裡只記下它在架子頂上的位置
    g.updateWorldMatrix(true, true);
    dollPos.set(-.30, Hh, 0).applyMatrix4(g.matrixWorld);
    collide(g, 1.1);
  }
  // 小丑盒會動的部分：打開的蓋子＋彈簧＋小丑頭（一組）、蓋上的蓋子（另一組）
  const jackPop = grp(jackAt.x, jackAt.y, jackAt.z, 0, anim), jackLid = grp(jackAt.x, jackAt.y, jackAt.z, 0, anim);
  {
    const TJ = (geo, hex, x, y, z, parent) => M(paint(geo, hex), MT.toy, x, y, z, parent);
    TJ(new THREE.BoxGeometry(.13, .01, .13), 0xc8a030, 0, .135, -.07, jackPop).rotation.x = -1.2;
    for(let k = 0; k < 7; k++) TJ(new THREE.TorusGeometry(.03, .004, 4, 12), 0x9a9a9a, 0, .15 + k * .018, 0, jackPop).rotation.x = Math.PI / 2;
    TJ(new THREE.SphereGeometry(.045, 12, 10), 0xd8ccb4, 0, .3, .01, jackPop);
    TJ(new THREE.ConeGeometry(.045, .09, 10), 0x8a1a14, 0, .37, 0, jackPop);
    TJ(new THREE.SphereGeometry(.012, 6, 6), 0xb01810, 0, .295, .055, jackPop);
    for(const s of [-1, 1]) TJ(new THREE.SphereGeometry(.007, 6, 6), 0x080606, s * .016, .312, .04, jackPop);
    TJ(new THREE.BoxGeometry(.14, .012, .14), 0xc8a030, 0, .136, 0, jackLid);
    mergeInto(jackPop, { cast: false }); mergeInto(jackLid, { cast: false });
    jackLid.visible = false;
  }
  // 瓷娃娃：洋裝＋手腳（一組，會換位置）、頭（再一組，會轉向你）；局部原點＝坐著的底部、臉朝局部 +z
  const doll = grp(dollPos.x, dollPos.y, dollPos.z, 0, anim);
  {
    const T2 = (geo, hex, x, y, z) => M(paint(geo, hex), MT.toy, x, y, z, doll);
    T2(new THREE.ConeGeometry(.075, .16, 14), 0x3a4652, 0, .08, 0);
    T2(new THREE.CylinderGeometry(.075, .075, .02, 14), 0xb0a898, 0, .01, 0);
    for(const s of [-1, 1]){ const a = T2(new THREE.CylinderGeometry(.011, .009, .085, 6), 0xd8cfc2, s * .052, .105, .02); a.rotation.set(-.35, 0, s * .18); }
    for(const s of [-1, 1]){ const l = T2(new THREE.CylinderGeometry(.012, .01, .1, 6), 0xd8cfc2, s * .03, .015, .06); l.rotation.x = Math.PI / 2; }
    mergeInto(doll, { cast: false });
  }
  // 娃娃的頭（會慢慢轉向你）
  const dollFaceTex = canvasTex(128, 64, (c) => {
    c.fillStyle = '#efe6da'; c.fillRect(0, 0, 128, 64);
    c.fillStyle = '#3a2a22'; c.fillRect(0, 0, 128, 14);   // 頭髮邊
    c.fillStyle = '#0a0808'; c.beginPath(); c.ellipse(26, 30, 4.2, 5, 0, 0, TAU); c.ellipse(38, 30, 4.2, 5, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.8)'; c.fillRect(27, 27, 1.5, 1.5); c.fillRect(39, 27, 1.5, 1.5);
    c.fillStyle = 'rgba(200,90,90,.35)'; c.beginPath(); c.arc(22, 38, 4, 0, TAU); c.arc(42, 38, 4, 0, TAU); c.fill();
    c.fillStyle = '#9a1a1a'; c.beginPath(); c.ellipse(32, 43, 3, 1.6, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(40,30,25,.8)'; c.lineWidth = .8; c.beginPath(); c.moveTo(30, 14); c.lineTo(33, 22); c.lineTo(31, 27); c.lineTo(35, 34); c.lineTo(34, 40); c.stroke();   // 裂痕
  }, { wrap: false });
  {
    dollHead = grp(0, .2, 0, 0, doll);
    const h = M(new THREE.SphereGeometry(.05, 18, 12), Std({ color: 0xffffff, map: dollFaceTex, roughness: .3, envMapIntensity: .8 }), 0, 0, 0, dollHead);
    h.scale.set(1, 1.08, 1);
    const hair = M(new THREE.SphereGeometry(.054, 16, 10, 0, TAU, 0, Math.PI * .5), Std({ color: 0x2e2018, roughness: .8 }), 0, .008, -.008, dollHead);
    hair.rotation.x = -.35;
    for(const s of [-1, 1]){ const c = M(new THREE.CylinderGeometry(.012, .006, .09, 6), hair.material, s * .045, -.03, -.01, dollHead); c.rotation.z = s * .15; }
    for(const m of [h, hair]) m.castShadow = false;
    dollHead.children.forEach(m => { m.castShadow = false; });
  }

  /* ============================================================
     12. 紅門（北牆）：門框、門檻、四片鑲板門片（會開）、門後的虛空
         門框從牆面凸出 5.8 cm，門片關著時跟門框齊平；牆後是主浴 → 虛空只是一片貼在牆面上的特效，不往牆裡挖
     ============================================================ */
  const RD = { a: 0, from: 0, to: 0, t: 0, dur: 1, kind: 'none', phase: 'closed', breath: 0 };
  let leafPiv = null, voidG = null, voidBase = null, voidMist = null, smokeA = null, smokeB = null, voidEyes = null, voidVig = null, doorSide = northS;
  const doorWorld = V3(doorCX, 1.1, ZN + 0.02), redPos = V3(doorCX, .85, ZN + .6), dollDoor = V3();
  let doorYaw = 0;
  {
    const nS = doorSide ? doorSide.n : [0, 1];
    const g = grp(doorCX, FLOOR, ZN, Math.atan2(nS[0], nS[1]));   // 局部 +z 朝房內、+x 面對門時的右手邊
    g.updateWorldMatrix(true, false);
    // 門框（外框線板＋上方的小簷）、腳墩
    for(const sx of [-1, 1]){
      Bx(CW, DH + CW, CD, MT.redC, sx * (DW / 2 + CW / 2), (DH + CW) / 2, CD / 2, g);
      Bx(CW + .012, .20, CD + .01, MT.redC, sx * (DW / 2 + CW / 2), .10, (CD + .01) / 2, g);
      Bx(.012, DH + CW - .1, .012, MT.redC, sx * (DW / 2 + CW - .02), (DH + CW) / 2 + .05, CD + .004, g);
    }
    Bx(DW + 2 * CW + .02, CW, CD, MT.redC, 0, DH + CW / 2, CD / 2, g);
    Bx(DW + 2 * CW + .07, .035, CD + .025, MT.redC, 0, DH + CW + .0175, (CD + .025) / 2, g);
    Bx(DW, .015, CD, MT.trim, 0, .0075, CD / 2, g);
    Bx(DW, .135, .018, MT.black, 0, .0675, .009, g);   // 門洞底的黑色擋板：蓋住 arch 原本的白踢腳板（它在虛空前面）
    { const bk = M(new THREE.PlaneGeometry(DW, DH), MT.voidBk, 0, DH / 2 + .002, .0015, g); bk.castShadow = false; }   // 門洞後的黑底（拍照模式沒有虛空特效，看到的是一片黑）
    collide(g, 2.2);
    // 門片（會動）：局部原點＝鉸鏈（門框內側左前角）；關著時往 +x 伸、厚度往 -z
    const lg = grp(0, 0, 0, 0, anim);
    lg.position.set(-DW / 2 + .004, .012, CD - .004).applyMatrix4(g.matrixWorld);
    lg.rotation.y = g.rotation.y;
    leafPiv = grp(0, 0, 0, 0, lg);
    const L = grp(0, 0, 0, 0, leafPiv);
    const lh = DH - .018, st = .11, rl = .12;
    Bx(LW, lh, LT * .55, MT.redP, LW / 2, lh / 2, -LT / 2, L);                                   // 門板芯
    for(const fz of [-LT + .006, -.006]){                                                         // 兩面的框（梃、冒頭）
      for(const x of [st / 2, LW - st / 2]) Bx(st, lh, .012, MT.redP, x, lh / 2, fz, L);
      for(const y of [rl / 2, lh * .56, lh - rl / 2]) Bx(LW - 2 * st, y === lh * .56 ? .14 : rl, .012, MT.redP, LW / 2, y, fz, L);
      Bx(.08, lh - 2 * rl, .012, MT.redP, LW / 2, lh / 2, fz, L);                                  // 中梃
      const pw = (LW - 2 * st - .08) / 2;                                                           // 四片鑲板（凸起的板面）
      for(const x of [st + pw / 2, LW - st - pw / 2]) for(const [y0, y1] of [[rl, lh * .56 - .07], [lh * .56 + .07, lh - rl]])
        Bx(pw - .05, y1 - y0 - .05, .008, MT.redP, x, (y0 + y1) / 2, fz, L);
    }
    for(const fz of [.012, -LT - .012]){                                                          // 圓門把＋鑰匙孔蓋（兩面）
      const s = Math.sign(fz);
      Sph(.028, MT.brass, LW - .07, .98, fz + s * .03, L, 1, 1, .8, 12, 10);
      Cyl(.008, .008, .03, MT.brass, LW - .07, .98, fz + s * .012, L, 8).rotation.x = Math.PI / 2;
      Bx(.03, .09, .006, MT.bronze, LW - .07, .86, fz, L);
    }
    for(const y of [.25, lh / 2, lh - .25]) Bx(.02, .10, .012, MT.bronze, .0, y, -LT / 2, L);   // 鉸鏈
    mergeInto(L, { cast: false });
    // 虛空（門洞裡，貼在牆面上）：底層紅光 → 兩層黑霧（視差）→ 深處的眼睛
    voidG = grp(0, 0, 0, 0, anim);
    voidG.position.set(0, 0, .0).applyMatrix4(g.matrixWorld); voidG.rotation.y = g.rotation.y;
    const pg = (w, h) => new THREE.PlaneGeometry(w, h);
    voidTex.repeat.set(.72, .72);
    voidBase = new THREE.Mesh(pg(DW, DH), new THREE.MeshBasicMaterial({ map: voidTex, color: new THREE.Color(1.6, 1.0, .95), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    voidBase.position.set(0, DH / 2 + .002, .003); voidG.add(voidBase);
    const layer = (mat, z, ro) => { const m = new THREE.Mesh(pg(DW, DH), mat); m.position.set(0, DH / 2 + .002, z); m.renderOrder = ro; voidG.add(m); return m; };
    const po = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 };
    voidMist = layer(new THREE.MeshBasicMaterial({ color: new THREE.Color(.55, .06, .03), alphaMap: mistTex, blending: THREE.AdditiveBlending, opacity: .5, ...po }), .0045, 2);   // 發光的紅霧
    smokeA = layer(new THREE.MeshBasicMaterial({ color: 0x080000, alphaMap: smokeTex, opacity: .95, ...po }), .005, 3);                                       // 遠的黑煙
    voidEyes = new THREE.Mesh(pg(.20, .10), new THREE.MeshBasicMaterial({ map: eyesTex, color: new THREE.Color(2.2, 1.3, .9), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    voidEyes.position.set(.06, 1.52, .0055); voidEyes.renderOrder = 4; voidG.add(voidEyes);
    smokeB = layer(new THREE.MeshBasicMaterial({ color: 0x030000, alphaMap: smokeTex2, opacity: .85, ...po }), .006, 5);                                      // 近的黑煙
    voidVig = layer(new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: vigTex, opacity: 1, ...po }), .0068, 6);                                         // 門邊的暗框
    smokeTex.repeat.set(1.0, 1.4); smokeTex2.repeat.set(.6, .95); mistTex.repeat.set(.8, 1.1);
    for(const m of [voidBase, voidMist, smokeA, smokeB, voidEyes, voidVig]){ m.castShadow = false; m.receiveShadow = false; m.userData.noPhoto = true; }
    doorWorld.set(0, 1.1, .35).applyMatrix4(g.matrixWorld);
    dollDoor.set(.28, 0, .98).applyMatrix4(g.matrixWorld); doorYaw = g.rotation.y;   // 娃娃會跑到紅門前面、背對房間坐著
    redPos.set(.18, .85, .62).applyMatrix4(g.matrixWorld);   // 紅光：門洞偏東、離牆 0.6 m（不要在門片上打出一塊爆亮）
    // 門片迴轉區：碰撞（人走不進門片會掃到的範圍）
    { const pts = []; for(let k = 0; k <= 6; k++){ const a = OPEN * k / 6; pts.push(V3(-DW / 2 + LW * Math.cos(a), 0, CD + LW * Math.sin(a)).applyMatrix4(g.matrixWorld)); }
      pts.push(V3(-DW / 2, 0, 0).applyMatrix4(g.matrixWorld), V3(DW / 2, 0, 0).applyMatrix4(g.matrixWorld));
      ctx.colliders.push({ x0: Math.min(...pts.map(p => p.x)) - .02, x1: Math.max(...pts.map(p => p.x)) + .02, z0: Math.min(...pts.map(p => p.z)) - .02, z1: Math.max(...pts.map(p => p.z)) + .02, y1: 2.1 }); }
  }
  // 小手印：從嬰兒床邊一路往紅門爬（一左一右交錯），門框上也有幾個
  if(northS){
    const HG = new THREE.PlaneGeometry(.085, .085);
    const add = (x, y, rot, flip) => {
      const g = HG.clone(); if(flip){ const U = g.attributes.uv; for(let i = 0; i < U.count; i++) U.setX(i, 1 - U.getX(i)); }
      g.rotateZ(rot);
      const m = new THREE.Mesh(g, MT.hand); m.position.set(x, y, northS.c + .006 * northS.n[1]); m.rotation.y = Math.atan2(northS.n[0], northS.n[1]); m.castShadow = false; stat.add(m);
    };
    const xa = crib.x - .05, xb = doorCX - DW / 2 - CW - .06;
    const n = 7;
    for(let i = 0; i < n; i++){ const t = i / (n - 1); add(lerp(xa, xb, t) + (i % 2 ? .02 : -.02), lerp(1.08, 1.42, t) + (i % 2 ? .07 : 0) + .12 * Math.sin(t * 3), (i % 2 ? -.35 : .25) - t * .5, i % 2); }
    add(doorCX + DW / 2 + CW + .08, 1.12, .5, 0); add(doorCX + DW / 2 + CW + .14, .86, .2, 1);
  }

  /* ============================================================
     13. 嬰兒監視器的螢幕（128×96，會重畫；最多每秒 12 次，而且只有人在附近才畫）
         平常：綠色夜視畫面的嬰兒床 + 雜訊；偶爾整片雜訊；更偶爾：床邊站著一個高高的人（配一聲氣音）
     ============================================================ */
  const MON = { cv: null, c: null, tex: null, frames: [], nv: null, nvFig: null, t: 0, mode: 'nv', until: 0, next: 0, figNext: 0 };
  {
    const mk = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
    MON.cv = mk(128, 96); MON.c = MON.cv.getContext('2d');
    for(let k = 0; k < 3; k++){
      const cv = mk(128, 96), c = cv.getContext('2d'), im = c.createImageData(128, 96);
      for(let i = 0; i < im.data.length; i += 4){ const v = rnd() * 255; im.data[i] = v * .85; im.data[i + 1] = v; im.data[i + 2] = v * .85; im.data[i + 3] = 255; }
      c.putImageData(im, 0, 0); MON.frames.push(cv);
    }
    const nightVision = fig => {
      const cv = mk(128, 96), c = cv.getContext('2d');
      const g = c.createRadialGradient(64, 50, 5, 64, 50, 80); g.addColorStop(0, '#5a7a58'); g.addColorStop(1, '#0a140a');
      c.fillStyle = g; c.fillRect(0, 0, 128, 96);
      c.fillStyle = '#a8c8a0'; c.fillRect(22, 58, 84, 4); c.fillRect(22, 36, 84, 3);
      for(let x = 24; x < 106; x += 7) c.fillRect(x, 36, 2, 26);
      c.fillStyle = '#88a884'; c.fillRect(20, 30, 4, 34); c.fillRect(104, 30, 4, 34);
      c.fillStyle = '#6a8a66'; c.beginPath(); c.arc(64, 14, 8, 0, TAU); c.fill(); c.fillRect(63, 0, 2, 8);
      if(fig){
        c.fillStyle = '#050805'; c.beginPath(); c.ellipse(100, 20, 6, 8, 0, 0, TAU); c.fill();
        c.fillRect(94, 26, 13, 44); c.fillRect(90, 30, 4, 34); c.fillRect(107, 30, 4, 36);
        c.fillStyle = '#e8ffe0'; c.fillRect(97, 18, 2, 2); c.fillRect(102, 18, 2, 2);
      }
      c.fillStyle = 'rgba(0,0,0,.25)'; for(let y = 0; y < 96; y += 2) c.fillRect(0, y, 128, 1);
      c.fillStyle = '#c8e8c0'; c.font = '8px monospace'; c.fillText('CAM1  03:07', 4, 92);
      return cv;
    };
    MON.nv = nightVision(false); MON.nvFig = nightVision(true);
    MON.c.drawImage(MON.nv, 0, 0);
    MON.tex = new THREE.CanvasTexture(MON.cv); MON.tex.colorSpace = THREE.SRGBColorSpace;
    monScreen.material = new THREE.MeshBasicMaterial({ map: MON.tex, color: new THREE.Color(1.3, 1.3, 1.3) });
    monScreen.castShadow = false;
    MON.next = 3; MON.figNext = 14;
  }
  function monitorDraw(t){
    const c = MON.c;
    if(t > MON.until){
      const r = Math.random();
      if(t > MON.figNext){ MON.mode = 'fig'; MON.until = t + mr(.35, .8); MON.figNext = t + mr(16, 30); whisper(monPos, .7); }
      else if(t > MON.next){ MON.mode = r < .6 ? 'static' : 'roll'; MON.until = t + mr(.25, 1.1); MON.next = t + mr(2.5, 7); }
      else { MON.mode = 'nv'; MON.until = t + .3; }
    }
    const k = (Math.random() * 3) | 0, ox = -((Math.random() * 40) | 0), oy = -((Math.random() * 30) | 0);
    let lvl = .08;
    if(MON.mode === 'static'){ c.globalAlpha = 1; c.drawImage(MON.frames[k], ox, oy, 168, 126); lvl = 1; }
    else if(MON.mode === 'roll'){ const y = (t * 180) % 96; c.globalAlpha = 1; c.drawImage(MON.nv, 0, y - 96); c.drawImage(MON.nv, 0, y); c.globalAlpha = .45; c.drawImage(MON.frames[k], ox, oy, 168, 126); lvl = .5; }
    else { c.globalAlpha = 1; c.drawImage(MON.mode === 'fig' && Math.random() < .85 ? MON.nvFig : MON.nv, 0, 0); c.globalAlpha = MON.mode === 'fig' ? .3 : .16; c.drawImage(MON.frames[k], ox, oy, 168, 126); lvl = MON.mode === 'fig' ? .35 : .08; }
    c.globalAlpha = 1;
    MON.tex.needsUpdate = true;
    return lvl;
  }

  /* ============================================================
     14. 玩具架上方、牆上的蠟筆畫；天花板夜光星星；小夜燈；吊燈
     ============================================================ */
  {
    const AW = .27, AH = AW * ART_H / ART_W;
    const put = (s, a, y, cell, rot = 0) => {
      if(!s) return;
      const g = new THREE.PlaneGeometry(AW, AH);
      const U = g.attributes.uv, cx = cell % 3, cy = Math.floor(cell / 3);
      for(let i = 0; i < U.count; i++) U.setXY(i, (cx + U.getX(i)) / 3, 1 - (cy + 1 - U.getY(i)) / 2);
      g.rotateZ(rot);
      const m = new THREE.Mesh(g, MT.art); m.castShadow = false; m.receiveShadow = true;
      const off = .007;
      if(s.axis === 'x') m.position.set(a, y, s.c + s.n[1] * off); else m.position.set(s.c + s.n[0] * off, y, a);
      m.rotation.y = Math.atan2(s.n[0], s.n[1]);
      stat.add(m);
    };
    // 凹室北牆（玩具架上方）三張
    if(alcN){ const x0 = shelfP.x - SHF_W / 2 + .16; put(alcN, x0, 1.52, 0, .04); put(alcN, x0 + .36, 1.60, 2, -.05); put(alcN, x0 + .70, 1.49, 4, .03); }
    // 北牆紅門東邊兩張
    if(northS){ const xe = Math.min(northS.a1 - .2, doorCX + DW / 2 + CW + .38); put(northS, xe - .02, 1.50, 1, -.03); put(northS, xe + .30 > northS.a1 - .16 ? xe - .02 : xe + .30, xe + .30 > northS.a1 - .16 ? 1.12 : 1.36, 3, .06); }
    // L 形轉角那道短牆
    const jog = sides.find(s => s.axis === 'z' && s.n[0] === -1 && s.a1 - s.a0 > .35 && s !== westS);
    if(jog) put(jog, (jog.a0 + jog.a1) / 2, 1.42, 5, -.04);
  }
  // 天花板的夜光星星貼紙
  {
    const sh = new THREE.Shape(); for(let i = 0; i < 10; i++){ const r = i % 2 ? .016 : .04, a = Math.PI / 2 + i * Math.PI / 5; i ? sh.lineTo(r * Math.cos(a), r * Math.sin(a)) : sh.moveTo(r * Math.cos(a), r * Math.sin(a)); }
    const sg = new THREE.ShapeGeometry(sh); sg.rotateX(Math.PI / 2);
    for(let i = 0; i < (LOW ? 14 : 24); i++){
      const q = rects[i % rects.length];
      const x = rr(q[0] + .25, q[2] - .25), z = rr(q[1] + .25, q[3] - .25);
      if(Math.hypot(x - lampP.x, z - lampP.z) < .35) continue;
      const m = M(sg.clone(), MT.glowS, x, H - .006, z, ceilG); m.rotation.y = rnd() * TAU; m.scale.setScalar(.6 + rnd() * .8); m.castShadow = false;
    }
    // 月亮形的小夜燈：插在嬰兒床旁邊的北牆上
    if(northS){ const x = crib.x + CRIB_W / 2 + .25, z = northS.c + northS.n[1] * .012;
      const moon = new THREE.Shape(); moon.absarc(0, 0, .045, Math.PI * .35, Math.PI * 1.65, false); moon.absarc(.022, 0, .038, Math.PI * 1.55, Math.PI * .45, true);
      const mg = new THREE.ExtrudeGeometry(moon, { depth: .015, bevelEnabled: false, curveSegments: 10 });
      Bx(.06, .08, .012, MT.plast, x, .32, northS.c + northS.n[1] * .006);
      const m = M(mg, MT.night, x, .32, z); m.rotation.y = Math.atan2(northS.n[0], northS.n[1]); }
  }
  // 吊燈：天花板座、電線、舊布燈罩、燈泡（燈罩白天也微微亮：窗簾拉上、燈一直開著）
  const PEND_Y = 2.34;
  {
    Cyl(.07, .07, .025, MT.trim, lampP.x, H - .016, lampP.z, ceilG, 18);
    Cyl(.004, .004, H - .03 - (PEND_Y + .27), MT.black, lampP.x, (H - .03 + PEND_Y + .27) / 2, lampP.z, ceilG, 5);
    const sh = M(new THREE.CylinderGeometry(.17, .21, .26, LOW ? 20 : 32, 1, true), MT.shade, lampP.x, PEND_Y + .13, lampP.z, ceilG); sh.castShadow = false;
    for(const y of [0, .26]) M(new THREE.TorusGeometry(y ? .17 : .21, .004, 4, LOW ? 20 : 32), MT.bronze, lampP.x, PEND_Y + y, lampP.z, ceilG).rotation.x = Math.PI / 2;
    Cyl(.012, .012, .05, MT.bronze, lampP.x, PEND_Y + .245, lampP.z, ceilG, 8);
    Sph(.04, MT.bulb, lampP.x, PEND_Y + .17, lampP.z, ceilG).castShadow = false;
  }


  /* ============================================================
     14b. 髒污貼花（一張圖集、一個材質 → 合併後一個 draw call）
          剝落的壁紙、從天花板流下來的水漬、抓痕（紅門邊、嬰兒床上方）、角落的蜘蛛網、霉斑、
          窗玻璃／天花板上的小手印、一路從嬰兒床走到紅門的灰腳印、牆上的塗鴉「不要關燈」
     ============================================================ */
  function decalGeo(w, h, cell, rot = 0, flip = false){
    const g = new THREE.PlaneGeometry(w, h), U = g.attributes.uv, cx = cell % DEC_C, cy = Math.floor(cell / DEC_C);
    for(let i = 0; i < U.count; i++){ let u = U.getX(i); if(flip) u = 1 - u; U.setXY(i, (cx + u) / DEC_C, 1 - (cy + 1 - U.getY(i)) / DEC_R); }
    if(rot) g.rotateZ(rot);
    return g;
  }
  const onWall = (s, a, y, w, h, cell, { rot = 0, flip = false, off = .0065, mat = MT.decal } = {}) => {
    if(!s) return null;
    const m = new THREE.Mesh(decalGeo(w, h, cell, rot, flip), mat); m.castShadow = false; m.receiveShadow = true;
    if(s.axis === 'x') m.position.set(a, y, s.c + s.n[1] * off); else m.position.set(s.c + s.n[0] * off, y, a);
    m.rotation.y = Math.atan2(s.n[0], s.n[1]); stat.add(m); return m;
  };
  const onFloor = (x, z, w, h, cell, rot = 0, flip = false) => { const g = decalGeo(w, h, cell, 0, flip); g.rotateX(-Math.PI / 2); g.rotateY(rot); const m = new THREE.Mesh(g, MT.decal); m.position.set(x, FLOOR + .0045, z); m.castShadow = false; m.receiveShadow = true; stat.add(m); return m; };
  const onCeil = (x, z, w, h, cell, rot = 0) => { const g = decalGeo(w, h, cell); g.rotateX(Math.PI / 2); g.rotateY(rot); const m = new THREE.Mesh(g, MT.decal); m.position.set(x, H - .0075, z); m.castShadow = false; ceilG.add(m); return m; };
  // 牆的左右端（面對牆時）：L＝左端的座標、r＝往右是 +a 還是 −a
  const endsOf = s => { const sign = s.axis === 'x' ? s.n[1] : -s.n[0]; return sign > 0 ? { L: s.a0, R: s.a1, r: 1 } : { L: s.a1, R: s.a0, r: -1 }; };
  {
    const alcE = sides.find(s => s.axis === 'z' && s.n[0] === -1 && s.holes.some(h => h.door));   // 凹室東牆（有房門那面）
    // 剝落
    if(northS) onWall(northS, crib.x + .3, 2.55, .42, .85, 0);
    if(southS) onWall(southS, drs.x - .1, 2.45, .48, .95, 0, { flip: true });
    if(westS) onWall(westS, westS.a1 - .55, 2.98, .34, .34, 0);
    if(alcN) onWall(alcN, alcN.a1 - .3, 2.55, .4, .8, 0);
    // 水漬（從頂角線往下流）
    if(northS) onWall(northS, Math.min(doorCX + DW / 2 + CW + .45, northS.a1 - .35), H - CROWN - .5, .42, 1.0, 1);
    if(southS) onWall(southS, XW + .55, H - CROWN - .55, .45, 1.1, 1);
    if(alcN) onWall(alcN, alcN.a0 + .35, H - CROWN - .5, .4, .95, 1);
    if(alcE) onWall(alcE, (alcE.a0 + door.at0) / 2, H - CROWN - .45, .36, .85, 1);
    // 抓痕：紅門兩邊（小孩的高度）、嬰兒床上方往紅門那邊抓
    if(northS){
      onWall(northS, doorCX - DW / 2 - CW - .16, .52, .22, .32, 2, { rot: .1 });
      onWall(northS, doorCX + DW / 2 + CW + .16, .6, .22, .32, 2, { rot: -.12, flip: true });
      onWall(northS, crib.x + .14, 1.3, .3, .42, 2, { rot: -.4 });
    }
    // 霉斑
    if(northS) onWall(northS, northS.a1 - .22, 1.05, .38, .38, 7);
    if(southS) onWall(southS, XW + .28, 1.12, .4, .4, 7, { rot: .5 });
    const jog = sides.find(s => s.axis === 'z' && s.n[0] === -1 && s !== alcE && s.a1 - s.a0 > .3);
    if(jog) onWall(jog, (jog.a0 + jog.a1) / 2, 2.72, .36, .36, 7);
    // 塗鴉「不要關燈」（南牆、五斗櫃東邊）
    if(southS) onWall(southS, drs.x + DRS_W / 2 + .3, 1.3, .3, .3, 6);
    // 蜘蛛網：凹進去的上方牆角
    for(const s of sides){
      const E = endsOf(s);
      for(const end of ['a0', 'a1']){
        if(!concave(s, end) || s.a1 - s.a0 < .6) continue;
        const left = s[end] === E.L;
        onWall(s, left ? E.L + E.r * .22 : E.R - E.r * .22, H - CROWN - .22, .44, .44, 3, { flip: !left });
      }
    }
    // 小手印：凹室北牆低處（玩具架旁）
    if(alcN) for(const [da, y, r] of [[.14, .46, .3], [.2, .7, -.2]]) onWall(alcN, alcN.a1 - da, y, .075, .075, 4, { rot: r, flip: da > .15 });
    // 窗玻璃上的小手印（從窗簾縫看得到；貼在固定窗玻璃的室內面）
    const fix = wins.find(w => w.axis === 'z' && w.type === 'fixed' && slit && w.at0 <= slit.z && w.at1 >= slit.z);
    if(fix) for(const [dz, y, r, fl] of [[-.02, 1.34, .25, false], [.025, 1.52, -.2, true], [0, 1.18, .05, false]])
      onWall({ axis: 'z', c: fix.c0 + .064, n: [1, 0] }, slit.z + dz, y, .07, .07, 4, { rot: r, flip: fl, off: 0 });
    // 天花板上、嬰兒床正上方的小手印（有東西爬過天花板）
    for(const [dx, dz, r] of [[-.12, -.2, .4], [.05, .02, -.3], [.18, .28, .9]]) onCeil(crib.x + dx, crib.z + dz, .085, .085, 4, r);
    onCeil(XW + .45, ZN + .45, .9, .9, 7, .7);
    // 灰腳印：從嬰兒床尾一路走到紅門前
    { const p0 = [crib.x + .55, crib.z + .62], p1 = [crib.x + 1.25, crib.z + .7], p2 = [doorCX + .05, ZN + .98];
      const at = t => [(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]];
      const n = 6;
      for(let i = 0; i < n; i++){
        const t = i / (n - 1), [x, z] = at(t), [x2, z2] = at(Math.min(1, t + .05)), dx = x2 - x, dz = z2 - z, l = Math.hypot(dx, dz) || 1, side = i % 2 ? 1 : -1;
        onFloor(x - dz / l * .05 * side, z + dx / l * .05 * side, .07, .14, 5, Math.atan2(-dx, -dz), side > 0);
      }
      onFloor(doorCX + .1, ZN + .9, .3, .42, 2, .35);   // 紅門前地板上的刮痕
    }
  }

  /* ============================================================
     14c. 角落的暗（假的環境光遮蔽：牆角、牆腳、牆頂各一道漸層黑），純特效 → noPhoto
     ============================================================ */
  {
    const aoMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: gradTex, transparent: true, opacity: .82, depthWrite: false, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const darkG = grp(0, 0, 0, 0, fx); darkG.name = 'br3-dark';
    const quad4 = (P, U) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U.flat(), 2)); g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); const m = new THREE.Mesh(g, aoMat); m.castShadow = m.receiveShadow = false; darkG.add(m); };
    const WP = (s, a, y) => s.axis === 'x' ? [a, y, s.c + s.n[1] * .0075] : [s.c + s.n[0] * .0075, y, a];
    const FP = (s, a, d) => s.axis === 'x' ? [a, FLOOR + .0035, s.c + s.n[1] * d] : [s.c + s.n[0] * d, FLOOR + .0035, a];
    for(const s of sides){
      for(const end of ['a0', 'a1']){
        if(!concave(s, end)) continue;
        const a = s[end], t = end === 'a0' ? 1 : -1, w = Math.min(.6, (s.a1 - s.a0) * .5);
        quad4([WP(s, a, FLOOR), WP(s, a + t * w, FLOOR), WP(s, a + t * w, H), WP(s, a, H)], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      }
      for(const [p0, p1] of spans(s.a0, s.a1, s.holes.filter(h => h.door))) quad4([FP(s, p0, 0), FP(s, p1, 0), FP(s, p1, .55), FP(s, p0, .55)], [[0, 0], [0, 1], [1, 1], [1, 0]]);
      quad4([WP(s, s.a0, H - .003), WP(s, s.a1, H - .003), WP(s, s.a1, H - .8), WP(s, s.a0, H - .8)], [[0, 0], [0, 1], [1, 1], [1, 0]]);
    }
    mergeInto(darkG, { cast: false, recv: false });
    darkG.children.forEach(m => { m.userData.noPhoto = true; m.renderOrder = 1; });
  }
  // 監視器的綠光：螢幕周圍一圈、桌面上一片（加法混色的假光，跟著螢幕閃）
  const haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(.22, .75, .42), alphaMap: haloTex, transparent: true, opacity: .45, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  {
    const haloG = grp(0, 0, 0, 0, fx);
    const q1 = new THREE.Mesh(new THREE.PlaneGeometry(.34, .27), haloMat); q1.position.set(0, .088, .024); q1.rotation.x = -.12;
    const q2 = new THREE.Mesh(new THREE.PlaneGeometry(.55, .42), haloMat); q2.rotation.x = -Math.PI / 2; q2.position.set(0, .004, .16);
    haloG.add(q1, q2); haloG.applyMatrix4(monXf);
    mergeInto(haloG, { cast: false, recv: false });
    haloG.children.forEach(m => { m.userData.noPhoto = true; });
  }

  /* ============================================================
     15. 燈（只登記兩盞）
         吊燈：'ceiling'（取代這間預設的吸頂燈）、病懨懨的暗綠、白天也開兩成多（窗簾拉上）、mul 每格亂閃、偶爾整個斷電 1–3 秒
         紅光：'wall'（點光），放在紅門前 0.35 m；門關著 mul＝0，門開了跟著脈動
     ============================================================ */
  const lampCeil = { pos: V3(lampP.x, PEND_Y + .06, lampP.z), kind: 'ceiling', room: ROOM, color: 0x9ec08a, power: .6, always: .2, mul: 1 };
  const lampRed = { pos: redPos, kind: 'wall', room: ROOM, color: 0xff2412, power: 1.6, always: 1, mul: 0 };
  ctx.lamps.push(lampCeil, lampRed);

  /* ============================================================
     16. 地上的低霧：兩層半透明的霧（會受燈光：紅門開著時門前的霧是紅的），在門口那邊淡掉
     ============================================================ */
  const fogMeshes = [];
  {
    const mk = (tex, y, op, col) => {
      const mat = Std({ color: col, alphaMap: tex, transparent: true, opacity: op, depthWrite: false, roughness: 1, vertexColors: true, envMapIntensity: .3 });
      for(const q of rects){
        const w = q[2] - q[0], d = q[3] - q[1], nx = Math.max(2, Math.round(w / .25)), nz = Math.max(2, Math.round(d / .25));
        const g = new THREE.PlaneGeometry(w, d, nx, nz); g.rotateX(-Math.PI / 2); g.translate((q[0] + q[2]) / 2, 0, (q[1] + q[3]) / 2);
        const P = g.attributes.position, U = g.attributes.uv, col4 = new Float32Array(P.count * 4);
        for(let i = 0; i < P.count; i++){
          const x = P.getX(i), z = P.getZ(i);
          U.setXY(i, x, -z);
          const dd = Math.hypot(x - doorPt[0], z - doorPt[1]);
          const edge = Math.min(x - BB[0], BB[2] - x, z - BB[1], BB[3] - z);
          const a = smooth(.25, 1.3, dd) * (.55 + .45 * smooth(0, .5, edge));
          col4.set([1, 1, 1, a], i * 4);
        }
        g.setAttribute('color', new THREE.BufferAttribute(col4, 4));
        const m = new THREE.Mesh(g, mat); m.position.y = y; m.renderOrder = 1; m.castShadow = false; m.receiveShadow = true;
        m.userData.noPhoto = true; m.raycast = () => {};
        fx.add(m); fogMeshes.push(m);
      }
      return mat;
    };
    mk(fogTex, FLOOR + .08, LOW ? .30 : .24, 0x9aa3ad);
    if(!LOW) mk(fogTex2, FLOOR + .22, .13, 0x8e98a2);
  }

  /* ============================================================
     17. 窗外走過的黑影（平常藏著；人在房裡時偶爾從窗外走過，在窗簾縫停一下）
     ============================================================ */
  const silTex = canvasTex(128, 256, (c) => {
    c.fillStyle = '#000';
    c.beginPath(); c.ellipse(64, 30, 15, 19, 0, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(58, 46); c.lineTo(70, 46); c.quadraticCurveTo(100, 58, 104, 80); c.lineTo(110, 190); c.lineTo(100, 192); c.lineTo(92, 110);
    c.lineTo(88, 256); c.lineTo(40, 256); c.lineTo(36, 110); c.lineTo(28, 196); c.lineTo(18, 194); c.lineTo(24, 80); c.quadraticCurveTo(28, 58, 58, 46); c.fill();
  }, { wrap: false });
  // 透明佇列＋renderOrder 10：排在窗玻璃（半透明、不寫深度）之後畫 → 不會被玻璃蒙成灰色；窗簾（不透明）照樣擋得住它
  const sil = new THREE.Mesh(new THREE.PlaneGeometry(.72, 1.95), new THREE.MeshBasicMaterial({ color: 0x06070a, map: silTex, alphaTest: .5, transparent: true, side: THREE.DoubleSide, fog: false }));
  sil.renderOrder = 10;
  sil.rotation.y = Math.PI / 2; sil.castShadow = false; sil.userData.noPhoto = true; sil.visible = false;
  fx.add(sil);
  const SIL = { active: false, t: 0, dur: 4, z0: 0, z1: 0, next: 22, stopAt: .5 };
  const silX = (westS ? westS.c : X0) - 0.15 - 0.55, SIL_Y = FLOOR + 0.15 + 1.95 / 2;

  /* ============================================================
     17b. 角落裡的影子：一個模糊的高瘦人影站在暗角落，只在「眼角餘光」看得到 ——
          一正眼看過去就不見了，過一陣子換個角落（跟跳嚇是兩回事：跳嚇準備中／停電時它不出現）
     ============================================================ */
  const pfTex = canvasTex(128, 256, (c) => {
    c.save(); c.translate(-600, 0); c.shadowColor = 'rgba(0,0,0,1)'; c.shadowBlur = 11; c.shadowOffsetX = 600; c.fillStyle = '#000';
    const body = () => {
      c.beginPath(); c.ellipse(71, 30, 12, 17, .3, 0, TAU); c.fill();                                                             // 頭歪一邊
      c.beginPath(); c.moveTo(56, 45); c.quadraticCurveTo(66, 50, 78, 46); c.quadraticCurveTo(100, 60, 97, 92); c.lineTo(103, 205); c.lineTo(95, 208);
      c.lineTo(87, 112); c.lineTo(83, 256); c.lineTo(47, 256); c.lineTo(43, 112); c.lineTo(35, 210); c.lineTo(27, 207); c.lineTo(31, 92); c.quadraticCurveTo(31, 58, 56, 45); c.fill();
    };
    body(); body(); c.restore();
    for(const x of [66, 77]){ const g = c.createRadialGradient(x, 30, 0, x, 30, 4); g.addColorStop(0, 'rgba(200,190,170,.9)'); g.addColorStop(1, 'rgba(120,20,10,0)'); c.fillStyle = g; c.fillRect(x - 4, 26, 8, 8); }   // 兩點很淡的眼睛
  }, { wrap: false });
  const pfig = new THREE.Mesh(new THREE.PlaneGeometry(.62, 1.9), new THREE.MeshBasicMaterial({ color: 0xffffff, map: pfTex, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  pfig.castShadow = false; pfig.userData.noPhoto = true; pfig.visible = false; pfig.renderOrder = 3; fx.add(pfig);
  const PF = { i: 0, op: 0, cool: 8, corners: [] };

  /* ============================================================
     18. 跳嚇的那個東西（原創設計）：很高、很瘦、往前駝、頭歪一邊；焦黑的皮、臉上一大片用手抹上去後乾掉的暗紅漆（抹痕、往下流、龜裂剝落）、
         燒過的焦痕；瘦長的骷髏臉、很深的眼窩裡兩點燒紅的光、張得很長的嘴；枯枝一樣的細角、幾綹黏在一起的長髮；
         破爛、下擺撕裂有破洞的黑袍（alphaMap 剪出來的，不是一個光滑的罩子）；一隻手伸向你、一隻手垂到膝蓋
     ============================================================ */
  const embers = [];
  const faceTex = canvasTex(512, 256, (c) => {
    c.fillStyle = '#0c0908'; c.fillRect(0, 0, 512, 256);
    for(let i = 0; i < 5000; i++){ const v = 6 + rnd() * 30; c.fillStyle = `rgba(${v + 7 | 0},${v | 0},${v - 2 | 0},.5)`; c.fillRect(rnd() * 512, rnd() * 256, 1 + rnd() * 3, 1 + rnd() * 2); }
    const cx = 128, ey = 116, my = 182;
    for(let i = 0; i < 18; i++) blob(c, cx + (rnd() - .5) * 170, 100 + rnd() * 120, 10 + rnd() * 20, 'rgba(66,30,12,A)', .45);   // 燒焦的褐色斑
    // 手指抹上去的暗紅漆：從額頭往下抹過眼睛
    c.lineCap = 'round';
    // 手掌抹過去的一大片（不規則、左右不對稱：右半邊多、左眼那邊斷掉）
    c.fillStyle = 'rgba(96,11,8,.8)'; c.beginPath(); c.moveTo(cx - 20, 30); c.bezierCurveTo(cx + 40, 22, cx + 70, 60, cx + 58, ey + 30); c.bezierCurveTo(cx + 30, ey + 10, cx + 10, ey + 30, cx - 30, ey - 6); c.bezierCurveTo(cx - 50, 80, cx - 44, 44, cx - 20, 30); c.fill();
    for(let k = 0; k < 6; k++){   // 手指抹痕：斜斜的、粗細長短不一
      const x0 = cx - 40 + rnd() * 90, y0 = 30 + rnd() * 30, ang = -.5 + rnd() * .9, L = 50 + rnd() * 70;
      c.strokeStyle = `rgba(${80 + rnd() * 50 | 0},${6 + rnd() * 10 | 0},6,${.7 + rnd() * .25})`; c.lineWidth = 5 + rnd() * 9;
      c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x0 + Math.sin(ang) * L * .5 + (rnd() - .5) * 20, y0 + L * .5, x0 + Math.sin(ang) * L, y0 + L); c.stroke();
    }
    blob(c, cx - 38, ey + 44, 34, 'rgba(4,2,1,A)', .7);   // 左頰一大塊燒黑
    for(let k = 0; k < 16; k++){   // 往下流、乾掉的漆
      const x = cx - 58 + rnd() * 116, y0 = ey + 10 + rnd() * 26, L = 18 + rnd() * 70;
      c.strokeStyle = 'rgba(92,9,7,.85)'; c.lineWidth = 1.3 + rnd() * 2.4; c.beginPath(); c.moveTo(x, y0); c.lineTo(x + (rnd() - .5) * 3, y0 + L); c.stroke();
      c.fillStyle = 'rgba(92,9,7,.85)'; c.beginPath(); c.arc(x, y0 + L, 1.8, 0, TAU); c.fill();
    }
    c.strokeStyle = 'rgba(6,3,2,.8)'; c.lineWidth = .8;   // 龜裂
    for(let i = 0; i < 150; i++){ let x = cx - 72 + rnd() * 144, y = 28 + rnd() * 130; c.beginPath(); c.moveTo(x, y); for(let k = 0; k < 3; k++){ x += (rnd() - .5) * 10; y += (rnd() - .5) * 10; c.lineTo(x, y); } c.stroke(); }
    for(let i = 0; i < 90; i++){ c.fillStyle = 'rgba(9,5,4,.9)'; c.beginPath(); c.arc(cx - 72 + rnd() * 144, 28 + rnd() * 130, .8 + rnd() * 2.6, 0, TAU); c.fill(); }   // 剝落
    // 很深的眼窩（燻黑的一圈）
    for(const sx of [-1, 1]){ const g = c.createRadialGradient(cx + sx * 30, ey, 2, cx + sx * 30, ey, 27); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.6, 'rgba(0,0,0,.95)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.ellipse(cx + sx * 30, ey, 27, 23, 0, 0, TAU); c.fill(); }
    c.fillStyle = '#000'; c.beginPath(); c.moveTo(cx - 6, ey + 36); c.lineTo(cx + 6, ey + 36); c.lineTo(cx, ey + 17); c.closePath(); c.fill();   // 鼻腔
    // 張得很長的嘴＋稀疏發黃的牙
    c.beginPath(); c.ellipse(cx, my, 16, 30, 0, 0, TAU); c.fill();
    for(let i = 0; i < 13; i++){
      const a = Math.PI + (i / 12) * Math.PI, x = cx + 16 * Math.cos(a), y = my + 30 * Math.sin(a), top = y < my;
      if(rnd() < .25) continue;
      c.fillStyle = rnd() < .5 ? '#a89a6c' : '#7a6c48'; c.beginPath(); c.moveTo(x - 2.4, y); c.lineTo(x + 2.4, y); c.lineTo(x + (rnd() - .5) * 2, y + (top ? 1 : -1) * (5 + rnd() * 6)); c.fill();
    }
    for(let i = 0; i < 12; i++){ const a = Math.PI * (1 + i / 11), x = cx + 16 * Math.cos(a), y = my - 30 * Math.sin(a); if(rnd() < .3) continue; c.fillStyle = rnd() < .5 ? '#a89a6c' : '#6e6040'; c.beginPath(); c.moveTo(x - 2.2, y); c.lineTo(x + 2.2, y); c.lineTo(x + (rnd() - .5) * 2, y - 4 - rnd() * 6); c.fill(); }
    // 眼窩與嘴深處的一點暗紅的光（很淡，在發光貼圖裡畫）
    embers.push({ x: cx, y: my + 4, rx: 10, ry: 22, a: .55 }, { x: cx - 30, y: ey, rx: 11, ry: 8, a: .35 }, { x: cx + 30, y: ey, rx: 11, ry: 8, a: .35 });
  }, { wrap: false, aniso: 4 });
  // 發光貼圖：整張臉只留兩成（暗房間裡還看得出紅黑的臉），眼窩、嘴裡的餘燼全亮
  const faceGlow = canvasTex(512, 256, (c, W, Hh) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, W, Hh);
    c.globalAlpha = .22; c.drawImage(faceTex.image, 0, 0); c.globalAlpha = 1;
    c.lineCap = 'round';
    for(const e of embers){ c.save(); c.translate(e.x, e.y); c.scale(1, e.ry / e.rx); blob(c, 0, 0, e.rx, 'rgba(255,60,16,A)', e.a); c.restore(); }
  }, { wrap: false, aniso: 4 });
  // 破布：下擺撕成一條條、上面有破洞（alphaMap，白＝布、黑＝破掉的地方）
  const tatTex = canvasTex(256, 256, (c, W) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, W);
    c.fillStyle = '#000'; c.beginPath(); c.moveTo(0, W);
    for(let x = 0; x <= W; x += 5){ const deep = rnd() < .28 ? 60 + rnd() * 70 : 6 + rnd() * 30; c.lineTo(x, W - deep); c.lineTo(x + 2.5, W - 4 - rnd() * 10); }
    c.lineTo(W, W); c.closePath(); c.fill();
    for(let i = 0; i < 18; i++){ const x = rnd() * W, y = W * (.3 + rnd() * .55); c.beginPath(); c.ellipse(x, y, 2 + rnd() * 6, 4 + rnd() * 14, (rnd() - .5) * .6, 0, TAU); c.fill(); }
    for(let i = 0; i < 12; i++){ const x = rnd() * W, y = W * (.55 + rnd() * .35); c.fillRect(x, y, 2 + rnd() * 3, W - y); }
  }, { srgb: false, repeat: [3, 1] });
  const fig = grp(0, FLOOR, 0, 0, fx);
  let figHead = null, figEyes = [], faceMat = null;
  const FIG_TILT = .3;   // 頭往一邊歪
  {
    const robe = Std({ color: 0x060505, roughness: 1, envMapIntensity: .06, side: THREE.DoubleSide, alphaMap: tatTex, alphaTest: .5 });
    const rag = Std({ color: 0x080606, roughness: 1, envMapIntensity: .06, side: THREE.DoubleSide, alphaMap: tatTex, alphaTest: .5 });
    const skin = Std({ color: 0x15100e, roughness: .9, envMapIntensity: .1 });
    const horn = Std({ color: 0x0f0a08, roughness: .8, envMapIntensity: .1 });
    // 袍子：車削後往前駝、做成扁的
    const prof = [[.33, 0], [.3, .2], [.25, .6], [.21, 1.0], [.2, 1.25], [.25, 1.44], [.21, 1.54], [.11, 1.61], [.05, 1.65]];
    const rg = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), LOW ? 20 : 44, 0, TAU);
    { const P = rg.attributes.position;
      for(let i = 0; i < P.count; i++){
        let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        const wob = 1 + .06 * Math.sin(Math.atan2(z, x) * 7 + y * 5);   // 布的皺褶
        x *= 1.16 * wob; z *= .7 * wob; z += .21 * smooth(.8, 1.65, y);
        P.setXYZ(i, x, y, z);
      }
      rg.computeVertexNormals(); }
    M(rg, robe, 0, 0, 0, fig);
    // 手臂：右手往前伸（抓向你）、左手垂到膝蓋；破爛的袖子
    M(taperTube([[.21, 1.42, .2], [.30, 1.26, .38], [.26, 1.27, .56], [.22, 1.3, .68]], .075, .04, 12), robe, 0, 0, 0, fig);
    M(taperTube([[.25, 1.28, .6], [.21, 1.31, .72]], .03, .022, 6), skin, 0, 0, 0, fig);
    for(let k = 0; k < 5; k++){ const a = (k - 2) * .34, sp = [.21, 1.31, .72]; M(taperTube([sp, [sp[0] + .07 * Math.sin(a), sp[1] + .04 - Math.abs(k - 2) * .012, sp[2] + .09], [sp[0] + .14 * Math.sin(a), sp[1] + (k === 0 ? -.02 : .03), sp[2] + .18 - Math.abs(k - 2) * .02], [sp[0] + .16 * Math.sin(a), sp[1] - .02, sp[2] + .26 - Math.abs(k - 2) * .03]], .009, .0015, 8), skin, 0, 0, 0, fig); }
    M(taperTube([[-.23, 1.42, .16], [-.30, 1.04, .2], [-.28, .7, .24]], .07, .045, 12), robe, 0, 0, 0, fig);
    for(let k = 0; k < 5; k++){ const sp = [-.28, .7, .24], dx = (k - 2) * .018; M(taperTube([sp, [sp[0] + dx, .54, sp[2] + .02], [sp[0] + dx * 1.3, .36, sp[2] + .05 - Math.abs(k - 2) * .01]], .009, .0015, 6), skin, 0, 0, 0, fig); }
    // 脖子往前伸、臉剛好在你眼睛的高度（頭另外一組，可以抽動）
    M(taperTube([[0, 1.56, .2], [0, 1.6, .3], [0, 1.62, .38]], .045, .034, 6), skin, 0, 0, 0, fig);
    figHead = grp(0, 1.66, .45, 0, fig); figHead.rotation.set(.08, 0, FIG_TILT);
    // 頭：球體捏成瘦長的骷髏臉 —— 很深的眼窩、突出的眉骨與顴骨、凹陷的臉頰、張得很長的嘴、鼻腔一個洞、下巴拉長收尖
    const hg = new THREE.SphereGeometry(1, LOW ? 30 : 48, LOW ? 22 : 34);
    { const P = hg.attributes.position, G = (u, v) => Math.exp(-(u * u + v * v));
      for(let i = 0; i < P.count; i++){
        const x0 = P.getX(i), y0 = P.getY(i), z0 = P.getZ(i), f = Math.max(0, z0);
        let x = x0, y = y0, z = z0;
        for(const sx of [-1, 1]) z -= .42 * G((x0 - sx * .36) / .2, (y0 - .15) / .17) * f;          // 眼窩
        z += .13 * Math.exp(-(((y0 - .34) / .08) ** 2)) * f * (1 - .5 * Math.abs(x0));                // 眉骨
        z += .07 * G((Math.abs(x0) - .55) / .12, (y0 + .02) / .1) * f;                                // 顴骨
        z -= .13 * G((Math.abs(x0) - .48) / .15, (y0 + .32) / .14) * f;                               // 凹頰
        z -= .32 * G(x0 / .15, (y0 + .56) / .2) * f;                                                  // 嘴
        z -= .16 * G(x0 / .07, (y0 + .17) / .08) * f;                                                 // 鼻腔
        if(y0 < 0){ x *= 1 - .42 * Math.pow(-y0, 1.2); y *= 1 + .38 * -y0; }                        // 下巴收窄、拉長
        if(z0 < 0) z *= .92;
        P.setXYZ(i, x, y, z);
      }
      hg.computeVertexNormals(); }
    faceMat = Std({ map: faceTex, emissive: 0xffffff, emissiveMap: faceGlow, emissiveIntensity: .55, roughness: .85, envMapIntensity: .12 });
    const face = new THREE.Mesh(hg, faceMat);
    face.scale.set(.105, .185, .12); figHead.add(face);
    for(const sx of [-1, 1]){   // 眼窩最深處兩點燒紅的光
      const e = new THREE.Mesh(new THREE.SphereGeometry(.0062, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 1.15, .18) }));
      e.position.set(sx * .038, .028, .064); figHead.add(e); figEyes.push(e);
    }
    // 角：枯枝一樣、細細歪歪的
    const twig = (pts, r0) => M(taperTube(pts.map(p => [p[0] + (rnd() - .5) * .012, p[1] + (rnd() - .5) * .012, p[2] + (rnd() - .5) * .012]), r0, .0012, 18), horn, 0, 0, 0, figHead);
    for(const sx of [-1, 1]){
      twig([[sx * .055, .15, -.02], [sx * .09, .24, -.06], [sx * .115, .34, -.04], [sx * .155, .43, -.08], [sx * .145, .52, -.03]], .016);
      twig([[sx * .1, .27, -.05], [sx * .17, .31, -.09], [sx * .22, .37, -.08]], .007);
      twig([[sx * .14, .41, -.07], [sx * .1, .48, -.12], [sx * .085, .54, -.1]], .005);
    }
    // 長髮：幾綹黏在一起的黑髮，從頭頂兩側、後面垂到肩膀
    for(let k = 0; k < (LOW ? 6 : 10); k++){
      const a = -1.5 + (k / ((LOW ? 6 : 10) - 1)) * 3.0, L = .3 + rnd() * .35, w = .025 + rnd() * .025;
      const g = new THREE.PlaneGeometry(w, L, 1, 6); const P = g.attributes.position;
      for(let i = 0; i < P.count; i++){ const v = .5 - P.getY(i) / L; P.setXYZ(i, P.getX(i) * (1 - .6 * v), -v * L, -.05 * v * v + .01 * Math.sin(v * 9 + k)); }
      const m = M(g, rag, .1 * Math.sin(a), .12 - .04 * Math.abs(Math.sin(a)), .09 * Math.cos(a) - .03, figHead);
      m.rotation.y = a;
    }
    // 破布條：從肩膀、手臂垂下來（下緣是撕開的）
    for(let k = 0; k < (LOW ? 10 : 20); k++){
      const a = (k / (LOW ? 10 : 20)) * TAU, L = .3 + rnd() * .6, w = .05 + rnd() * .07;
      const g = new THREE.PlaneGeometry(w, L, 1, 4); const P = g.attributes.position;
      for(let i = 0; i < P.count; i++){ const v = P.getY(i) / L + .5; P.setX(i, P.getX(i) * (.5 + .5 * v)); P.setZ(i, (1 - v) * .04 * Math.sin(k)); }
      g.translate(0, -L / 2, 0);
      const r = .23 + .02 * Math.sin(a * 3), m = M(g, rag, r * 1.15 * Math.sin(a), 1.52 - .05 * Math.abs(Math.cos(a)), r * .72 * Math.cos(a) + .18, fig);
      m.rotation.y = a; m.rotation.x = .08 * Math.cos(a);
    }
    for(const [x, y, z] of [[.3, 1.24, .42], [.27, 1.25, .52], [-.31, 1.0, .22], [-.29, .86, .24], [.2, 1.3, .62]]){ const g = new THREE.PlaneGeometry(.06, .3, 1, 3); g.translate(0, -.15, 0); const m = M(g, rag, x, y, z, fig); m.rotation.y = x > 0 ? 1.2 : -1.2; }
    mergeInto(figHead, { cast: false, recv: false });
    figHead.children.forEach(o => { o.userData.noBake = true; });
    mergeInto(fig, { cast: false, recv: false });
    fig.traverse(o => { if(o.isMesh){ o.castShadow = false; o.receiveShadow = false; o.userData.noPhoto = true; } });
    figEyes = figHead.children.filter(o => o.isMesh && o.material && o.material.isMeshBasicMaterial && o.material.color.r > 1);
    fig.visible = false;
  }

  /* ============================================================
     19. 合併靜態的東西（依材質；天花板那組另外合併，跟著屋頂開關）
     ============================================================ */
  mergeInto(stat);
  mergeInto(ceilG, { cast: false });
  // 家具有沒有擋到門片迴轉區／進門走道（開發用檢查：萬一牆移動後擠到了，console 會說）
  for(const k of keepOut){
    for(const c of ctx.colliders.slice(COL0)){
      if(c.x0 < k.x1 && c.x1 > k.x0 && c.z0 < k.z1 && c.z1 > k.z0 && c.y1 > .5) console.warn('[theme_br3] 家具擋到' + k.why, JSON.stringify(c));
    }
  }

  /* ============================================================
     19b. 「窗簾拉上的暗房間」：只改這間自己的材質（onBeforeCompile，仍是 MeshStandard／Physical）
          ① 環境光（半球天光＋環境光）乘上 uBr3Amb：白天的天光是整棟共用的，不壓的話這間會跟別間一樣亮、平平的
          ② 燈池裡「不在這間房裡」的聚光／點光（窗口的假日光、隔壁房的燈）乘上 uBr3Out ——
             燈光不會被牆擋（three 的點光、聚光沒有陰影），隔壁的燈原本會穿牆照進來；窗光本來就是「窗簾拉上」要擋掉的
          太陽不動（它有陰影，窗簾真的擋得住，只從窗簾縫照進來）；拍照模式用真的光線追蹤，不受影響
     ============================================================ */
  const DIM = { amb: { value: .34 }, out: { value: .15 },
                r0: { value: new THREE.Vector4(rects[0][0] - .05, rects[0][1] - .05, rects[0][2] + .05, rects[0][3] + .05) },
                r1: { value: new THREE.Vector4(...(rects[1] ? [rects[1][0] - .05, rects[1][1] - .05, rects[1][2] + .05, rects[1][3] + .05] : [0, 0, 0, 0])) } };
  {
    // 燈的位置是「相機座標」→ 用這一趟畫面的 viewMatrix 反推回世界座標（剛體變換：轉置＋平移）→ 鏡子的反射探針、正交藍圖也對
    const LIGHT_IN = 'float br3In( vec3 p ){ vec3 w = transpose( mat3( viewMatrix ) ) * ( p - viewMatrix[ 3 ].xyz );\n' +
      '  bool a = w.x > uBr3R0.x && w.x < uBr3R0.z && w.z > uBr3R0.y && w.z < uBr3R0.w;\n' +
      '  bool b = w.x > uBr3R1.x && w.x < uBr3R1.z && w.z > uBr3R1.y && w.z < uBr3R1.w;\n' +
      '  return ( a || b ) ? 1.0 : uBr3Out; }\n';
    const dimmed = new Set();
    root.traverse(o => { if(!o.isMesh) return; for(const m of Array.isArray(o.material) ? o.material : [o.material]) if(m && m.isMeshStandardMaterial) dimmed.add(m); });
    for(const m of dimmed){
      m.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, { uBr3Amb: DIM.amb, uBr3Out: DIM.out, uBr3R0: DIM.r0, uBr3R1: DIM.r1 });
        const chunk = THREE.ShaderChunk.lights_fragment_begin
          .replace('getSpotLightInfo( spotLight, geometryPosition, directLight );', 'getSpotLightInfo( spotLight, geometryPosition, directLight );\n\t\tdirectLight.color *= br3In( spotLight.position );')
          .replace('getPointLightInfo( pointLight, geometryPosition, directLight );', 'getPointLightInfo( pointLight, geometryPosition, directLight );\n\t\tdirectLight.color *= br3In( pointLight.position );');
        sh.fragmentShader = 'uniform float uBr3Amb, uBr3Out;\nuniform vec4 uBr3R0, uBr3R1;\n' + LIGHT_IN +
          sh.fragmentShader.replace('#include <lights_fragment_begin>', chunk + '\n#if defined( RE_IndirectDiffuse )\n\tirradiance *= uBr3Amb;\n#endif\n');
      };
      m.customProgramCacheKey = () => 'br3-dim-v2';
      m.needsUpdate = true;
    }
  }

  /* ============================================================
     20. 紅色閃光（網頁上的一層，不是 3D）
     ============================================================ */
  const flash = document.createElement('div');
  flash.id = 'br3-flash';
  flash.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:60;display:none;opacity:0;' +
    'background:radial-gradient(ellipse at center, rgba(255,40,20,.30) 0%, rgba(170,0,0,.75) 55%, rgba(40,0,0,.95) 100%);mix-blend-mode:normal';
  document.body.appendChild(flash);
  const appEl = document.getElementById('app');
  // 氣氛層（人在這間房裡才淡入，出去就淡出；俯瞰／拍照模式一定不出現）：四周壓暗、偏冷又褪色、底片顆粒、偶爾暗一下
  // 全部是 CSS（沒有每格重畫的畫布）；手機只留「壓暗＋冷色＋顆粒」，不用混色模式
  const mood = document.createElement('div');
  mood.id = 'br3-mood';
  {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d'), im = c.createImageData(128, 128);
    for(let i = 0; i < im.data.length; i += 4){ const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255 * (.3 + .7 * Math.random()); }
    c.putImageData(im, 0, 0);
    const css = document.createElement('style'); css.id = 'br3-mood-css';
    css.textContent = `
#br3-mood{position:fixed;inset:0;pointer-events:none;z-index:3;opacity:0;transition:opacity 1.6s ease;overflow:hidden}
#br3-mood.on{opacity:1}
#br3-mood>div{position:absolute;inset:0}
#br3-mood .t{background:#1c282d;mix-blend-mode:color;opacity:.3}
#br3-mood .c{background:rgba(14,30,38,.16)}
#br3-mood .v{background:radial-gradient(ellipse 72% 68% at 50% 47%,rgba(0,0,0,0) 30%,rgba(0,0,0,.5) 66%,rgba(0,0,0,.9) 100%)}
#br3-mood .b{background:#000;opacity:0;transition:opacity .2s}
#br3-mood.dark .b{opacity:.34}
#br3-mood .g{inset:-80px;background-image:url(${cv.toDataURL()});opacity:${LOW ? .07 : .1};animation:br3g .6s steps(6) infinite}
#br3-mood .f{background:#000;opacity:0;animation:br3f 11s infinite}
#br3-mood:not(.on) .g,#br3-mood:not(.on) .f{animation-play-state:paused}
@keyframes br3g{0%{transform:translate(0,0)}17%{transform:translate(-31px,17px)}33%{transform:translate(23px,-41px)}50%{transform:translate(-47px,-9px)}67%{transform:translate(11px,37px)}83%{transform:translate(39px,-23px)}100%{transform:translate(0,0)}}
@keyframes br3f{0%,46%,49%,72%,75%,100%{opacity:0}47%{opacity:.16}48%{opacity:.05}73%{opacity:.1}}`;
    document.head.appendChild(css);
    mood.innerHTML = (LOW ? '' : '<div class="t"></div>') + '<div class="c"></div><div class="v"></div><div class="b"></div><div class="g"></div>' + (LOW ? '' : '<div class="f"></div>');
    document.body.appendChild(mood);
  }
  let moodOn = false, moodDark = false;
  const setMood = (on, dark) => {
    if(on !== moodOn){ moodOn = on; mood.classList.toggle('on', on); }
    if(dark !== moodDark){ moodDark = dark; mood.classList.toggle('dark', dark); }
  };

  /* ============================================================
     21. 聲音（全部現場合成；只有使用者打開 🔊 才建）
         音樂盒：布拉姆斯〈搖籃曲〉，但壞掉了 —— 很慢而且拖拍、忽快忽慢；好幾根音梳走音，常常一個音酸掉或彎下去；
         偶爾一個音「倒著放」（慢慢長出來、突然切掉）；發條卡住，停在樂句中間，隔幾秒又猛地往前衝；
         底下一直有不和諧的低鳴（A、升 A 小二度、升 D 三全音、一個更低的轟轟聲）；
         有時候遠遠的、有回音的一個小孩的哼唱跟著音樂，但總是慢半拍、音不太準（停電時哼得比較大聲）；
         很小聲的心跳，紅門開著、那個東西快出現時變大變快；它要出現前一刻 —— 全部安靜（死寂），然後才是那一下
         這間自己有一個限幅器：怎麼疊都不會爆音；房間的聲音（除了嚇人的那一下）都經過可以被「死寂」壓掉的一路
     ============================================================ */
  const A = { ready: false };
  // 布拉姆斯〈搖籃曲〉（Wiegenlied Op.49 No.4，1868，公有領域）：[半音（0＝C5）, 拍數]，3/4 拍、兩個八分音符弱起
  const SONG = [
    [4, .5], [4, .5],
    [7, 1.5], [4, .5], [4, 1],
    [7, 2], [4, .5], [7, .5],
    [12, 1], [11, 1.5], [9, .5],
    [9, 1], [7, 1], [2, .5], [4, .5],
    [5, 1], [2, 1], [2, .5], [4, .5],
    [5, 2], [2, .5], [5, .5],
    [11, .5], [9, .5], [7, 1], [11, 1],
    [12, 2], [0, .5], [0, .5],
    [12, 2], [9, .5], [5, .5],
    [7, 2], [4, .5], [0, .5],
    [5, 1], [7, 1], [9, 1],
    [7, 2], [0, .5], [0, .5],
    [12, 2], [9, .5], [5, .5],
    [7, 2], [4, .5], [0, .5],
    [5, 1], [4, 1], [2, 1],
    [0, 3],
  ];
  const OUT_OF_TUNE = { 11: -46, 5: +34, 2: -27, 9: +19, 4: -12 };   // 音梳有好幾根走音了（音級 → cents）
  const BEAT = .8;                                                  // 一拍 0.8 秒（原曲的一半快都不到）
  const MUS = { i: 0, t: 0, run: false, tempo: 1, sag: 0, wind: 0, pauseUntil: 0, stuck: 0, stuckAt: 0, loops: 0, lurch: 0, hum: false, humFrom: 0 };
  const cribPos = V3(crib.x, .8, crib.z);
  function setupAudio(ac, out){
    const bus = ac.createGain(); bus.gain.value = 0;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = .5;
    const lim = ac.createDynamicsCompressor(); lim.threshold.value = -9; lim.knee.value = 3; lim.ratio.value = 14; lim.attack.value = .002; lim.release.value = .2;
    bus.connect(lp); lp.connect(lim); lim.connect(out);
    const room = ac.createGain(); room.gain.value = 1; room.connect(bus);          // 房間的聲音：會被「死寂」壓掉
    const chan = (dest = room) => { const g = ac.createGain(), p = ac.createStereoPanner ? ac.createStereoPanner() : null; if(p){ g.connect(p); p.connect(dest); } else g.connect(dest); return { g, p }; };
    const noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); { const d = noise.getChannelData(0); for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    Object.assign(A, { ac, out, bus, lp, lim, room, noise, gramo: chan(), mon: chan(), door: chan(), hum: chan(), toy: chan(), fig: chan(bus) });
    const osc = (type, f) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; return o; };
    const gain = v => { const g = ac.createGain(); g.gain.value = v; return g; };
    const biq = (type, f, q = .7, gdb = 0) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gdb; return b; };
    // 留聲機：音樂盒 → 很深的抖音（轉盤不穩：調變的延遲線）→ 喇叭的頻率響應（窄、中頻突出）
    const musicIn = gain(.8);
    const dly = ac.createDelay(.4); dly.delayTime.value = .06;
    for(const [f, d] of [[.55, .0026], [.13, .012], [.041, .022]]){ const o = osc('sine', f), g = gain(d); o.connect(g); g.connect(dly.delayTime); o.start(); }
    const hp = biq('highpass', 330), pk = biq('peaking', 1400, 1.1, 7), lp2 = biq('lowpass', 3800);
    musicIn.connect(dly); dly.connect(hp); hp.connect(pk); pk.connect(lp2); lp2.connect(A.gramo.g);
    A.musicIn = musicIn;
    // 唱片的沙沙聲＋爆音（一段 7 秒的循環）
    { const n = ac.sampleRate * 7, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
      for(let i = 0; i < n; i++) d[i] = (Math.random() - .5) * .05;
      for(let k = 0; k < 7 * 16; k++){ const p = (Math.random() * (n - 400)) | 0, a = (.12 + .7 * Math.random() ** 3) * (Math.random() < .5 ? -1 : 1), tau = 8 + Math.random() * 40; for(let j = 0; j < 300; j++) d[p + j] += a * Math.exp(-j / tau) * (j % 2 ? -.6 : 1); }
      for(let k = 0; k < 5; k++){ const p = (Math.random() * (n - 900)) | 0; for(let j = 0; j < 800; j++) d[p + j] += .9 * Math.exp(-j / 90) * (Math.random() - .5); }
      const s = ac.createBufferSource(); s.buffer = b; s.loop = true;
      const f = biq('bandpass', 2400, .5), g = gain(.42);
      s.connect(f); f.connect(g); g.connect(A.gramo.g); s.start(); }
    // 小孩的哼唱：鋸齒波 → 鼻音（「嗯——」的共振）＋一點氣音 → 遠遠的、有回音
    { const o = osc('sawtooth', 523), vib = osc('sine', 5.3), vg = gain(24); vib.connect(vg); vg.connect(o.detune);
      const f1 = biq('lowpass', 900, .8), f2 = biq('peaking', 310, 1.3, 9), env = gain(0);
      const br = ac.createBufferSource(); br.buffer = noise; br.loop = true; const bf = biq('bandpass', 1500, .6), brg = gain(0);
      const far = biq('lowpass', 1900, .5), dry = gain(.6), echo = ac.createDelay(1), fb = gain(.4), wet = gain(.55);
      o.connect(f1); f1.connect(f2); f2.connect(env); env.connect(far); br.connect(bf); bf.connect(brg); brg.connect(far);
      far.connect(dry); dry.connect(A.hum.g); far.connect(echo); echo.delayTime.value = .27; echo.connect(fb); fb.connect(echo); echo.connect(wet); wet.connect(A.hum.g);
      o.start(); vib.start(); br.start();
      Object.assign(A, { humO: o, humEnv: env, humBr: brg }); }
    // 低鳴：A1、升 A1（小二度）、升 D2（三全音）＋更低的轟轟聲，慢慢一起一伏
    { const g = gain(0), breathe = gain(1), lfo = osc('sine', .07), lg = gain(.35), lpD = biq('lowpass', 240, .6);
      lfo.connect(lg); lg.connect(breathe.gain); lfo.start();
      for(const [f, a, type] of [[55, .5, 'sine'], [58.27, .42, 'sine'], [77.78, .2, 'triangle'], [36.7, .55, 'sine']]){ const o = osc(type, f), og = gain(a); o.connect(og); og.connect(lpD); o.start(); }
      const rn = ac.createBufferSource(); rn.buffer = noise; rn.loop = true; const rf = biq('lowpass', 85, .7), rg = gain(.7); rn.connect(rf); rf.connect(rg); rg.connect(lpD); rn.start();
      lpD.connect(breathe); breathe.connect(g); g.connect(room);
      A.drone = g; }
    // 心跳（悶悶的兩下：lub-dub）
    { const g = gain(1), hl = biq('lowpass', 150, .7); hl.connect(g); g.connect(room); A.heartIn = hl; }
    // 監視器的雜訊（跟螢幕的雜訊同步）
    { const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
      const f = biq('bandpass', 2800, .8), g = gain(0);
      s.connect(f); f.connect(g); g.connect(A.mon.g); s.start();
      A.stat = g; }
    // 燈泡的電流聲（閃的時候）
    { const o = osc('sawtooth', 120), f = biq('bandpass', 240, 4), g = gain(0); o.connect(f); f.connect(g); g.connect(room); o.start(); A.buzz = g; }
    A.ready = true;
  }
  if(ctx.audio && ctx.audio.register) ctx.audio.register(setupAudio);
  const audOn = () => !!(A.ready && ctx.audio && ctx.audio.on && A.ac.state === 'running');
  /** 音樂盒的一根音梳：基音＋八度＋不和諧的高泛音（叮的那一下）；bend＝往下彎幾 cents、rev＝倒著放（慢慢長出來、突然切掉） */
  function tine(t, f, vel, bend = 0, rev = false){
    const ac = A.ac;
    for(const [mul, amp, dec] of [[1, 1, 2.3], [2.005, .22, .5], [5.93, .1, .06]]){
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * mul, t);
      const g = ac.createGain();
      if(rev){
        g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vel * amp * .9, t + .5); g.gain.linearRampToValueAtTime(0, t + .53);
        if(bend) o.frequency.exponentialRampToValueAtTime(f * mul * Math.pow(2, bend / 1200), t + .5);
        o.connect(g); g.connect(A.musicIn); o.start(t); o.stop(t + .56);
      }else{
        if(bend) o.frequency.exponentialRampToValueAtTime(f * mul * Math.pow(2, -bend / 1200), t + Math.min(dec, 1.3));
        else if(MUS.sag < -1) o.frequency.linearRampToValueAtTime(f * mul * Math.pow(2, -8 / 1200), t + dec);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * amp, t + .004); g.gain.exponentialRampToValueAtTime(vel * amp * .0015, t + dec);
        o.connect(g); g.connect(A.musicIn); o.start(t); o.stop(t + dec + .05);
      }
    }
  }
  /** 哼唱跟著這個音（晚半拍、音偏低一點，音和音之間滑過去） */
  function humNote(t, f, dur, level){
    const lag = .16 + Math.random() * .14, T = t + lag;
    A.humO.frequency.setTargetAtTime(f * Math.pow(2, -(12 + Math.random() * 25) / 1200), T, .035);
    A.humEnv.gain.setTargetAtTime(level, T, .07); A.humEnv.gain.setTargetAtTime(level * .45, T + dur * .75, .06);
    A.humBr.gain.setTargetAtTime(level * .35, T, .07); A.humBr.gain.setTargetAtTime(level * .12, T + dur * .75, .06);
  }
  function humOff(t){ A.humEnv.gain.setTargetAtTime(0, t, .25); A.humBr.gain.setTargetAtTime(0, t, .25); }
  function playMusic(black){
    const ac = A.ac, now = ac.currentTime;
    if(!MUS.run){ MUS.run = true; MUS.t = now + .4; MUS.i = 0; }
    if(MUS.t < now - .2) MUS.t = now + .05;          // 剛走回來／剛從死寂回來：從現在接著放
    if(now < MUS.pauseUntil) return;
    while(MUS.t < now + .3){
      if(MUS.i >= SONG.length){                       // 一首放完：停一下；三成的機會下一輪發條會沒力；四成多的機會小孩會跟著哼
        MUS.i = 0; MUS.loops++; MUS.t += 2.2; MUS.tempo = 1; MUS.sag = 0; MUS.wind = 0;
        if(Math.random() < .3) MUS.wind = 6 + ((Math.random() * 30) | 0);
        MUS.hum = Math.random() < .45; MUS.humFrom = (Math.random() * 12) | 0;
        humOff(MUS.t - 1.5);
        continue;
      }
      let [st, beats] = SONG[MUS.i];
      if(MUS.wind && MUS.i >= MUS.wind){ MUS.tempo *= 1.12; MUS.sag -= 16; }
      if(MUS.tempo > 2.6){                             // 發條完全沒力：停 4–7 秒，再「喀喀喀」轉緊，從頭放
        MUS.tempo = 1; MUS.sag = 0; MUS.wind = 0; MUS.i = 0;
        MUS.pauseUntil = MUS.t + mr(4, 7); ratchet(MUS.pauseUntil - .9); humOff(MUS.t); MUS.t = MUS.pauseUntil + .3;
        return;
      }
      if(!MUS.wind && !MUS.stuck && MUS.i > 3 && Math.random() < .045){   // 發條卡住：停在樂句中間 1.4–3.8 秒，然後猛地往前衝兩個音
        const p = mr(1.4, 3.8); MUS.pauseUntil = MUS.t + p; MUS.t += p; MUS.lurch = 2; humOff(MUS.t - p + .3);
        return;
      }
      if(!MUS.stuck && MUS.i > 6 && Math.random() < .015){ MUS.stuck = 2; MUS.stuckAt = MUS.i; }   // 跳針：同一小段重複
      if(Math.random() < .06) st += Math.random() < .5 ? 1 : -1;                                    // 錯音（差一個半音）
      let cents = (OUT_OF_TUNE[((st % 12) + 12) % 12] || 0) + MUS.sag + (Math.random() - .5) * 14;
      if(Math.random() < .16) cents += (Math.random() < .5 ? -1 : 1) * mr(40, 110);                 // 酸掉的音
      if(MUS.lurch){ cents += 35; }
      const f = 523.25 * Math.pow(2, st / 12 + cents / 1200);
      const warp = 1 + .16 * Math.sin(now * .23) + .08 * Math.sin(now * .61 + 1);                   // 忽快忽慢
      let dur = beats * BEAT * MUS.tempo * warp * (1 + (Math.random() - .5) * .08);
      if(MUS.lurch){ dur *= .35; MUS.lurch--; }
      else if(Math.random() < .12) dur += BEAT * mr(.3, .7);                                          // 拖一下
      const vel = .5 * (MUS.wind && MUS.i >= MUS.wind ? Math.max(.35, 1.4 - MUS.tempo * .4) : 1) * (.85 + Math.random() * .25);
      const rev = Math.random() < .09, bend = !rev && Math.random() < .2 ? mr(80, 260) : (rev && Math.random() < .5 ? mr(40, 120) : 0);
      tine(MUS.t, f, vel, bend, rev);
      if(Math.random() < .1) tine(MUS.t + .02, f / 2, vel * .35, 0, false);                          // 偶爾低八度的鬼影
      if(MUS.hum && MUS.i >= MUS.humFrom) humNote(MUS.t, f, dur, black ? .14 : .075);
      MUS.t += dur;
      MUS.i++;
      if(MUS.stuck && MUS.i >= MUS.stuckAt + 3){ MUS.i = MUS.stuckAt; MUS.stuck--; }
    }
  }
  function ratchet(t){   // 上發條的喀喀聲
    if(!audOn()) return;
    const ac = A.ac;
    for(let k = 0; k < 7; k++){
      const s = ac.createBufferSource(); s.buffer = A.noise; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 3;
      const g = ac.createGain(); const tt = t + k * .11; g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(.35, tt + .002); g.gain.exponentialRampToValueAtTime(.001, tt + .03);
      s.connect(f); f.connect(g); g.connect(A.gramo.g); s.start(tt, Math.random()); s.stop(tt + .05);
    }
  }
  // 心跳：lub-dub，排在時間軸上（跟音樂一樣提前一點排）
  const HB = { next: 0 };
  function thump(t, f, a){
    if(a < .004) return;
    const ac = A.ac, o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * .6, t + .16);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + .012); g.gain.exponentialRampToValueAtTime(.0008, t + .22);
    o.connect(g); g.connect(A.heartIn); o.start(t); o.stop(t + .26);
  }
  function heartbeat(level, bpm){
    const now = A.ac.currentTime;
    if(HB.next < now) HB.next = now + .05;
    while(HB.next < now + .3){ const t = HB.next, p = 60 / bpm; thump(t, 60, level); thump(t + .27 * Math.min(1, p), 50, level * .62); HB.next += p; }
  }
  /** 氣音（聽不出在講什麼的悄悄話）：雜訊 → 兩個共振峰濾波（母音）＋高頻嘶聲，一個一個音節 */
  function whisper(pos, level = 1, dest = null){
    if(!audOn()) return;
    const ac = A.ac, t0 = ac.currentTime + .05;
    const ch = dest || A.mon;
    const s = ac.createBufferSource(); s.buffer = A.noise; s.loop = true;
    const f1 = ac.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 7;
    const f2 = ac.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 9;
    const f3 = ac.createBiquadFilter(); f3.type = 'highpass'; f3.frequency.value = 3800;
    const g3 = ac.createGain(); g3.gain.value = 0;
    const env = ac.createGain(); env.gain.value = 0;
    s.connect(f1); s.connect(f2); s.connect(f3); f1.connect(env); f2.connect(env); f3.connect(g3); g3.connect(env); env.connect(ch.g);
    const V = [[800, 1250], [500, 1900], [320, 2300], [500, 900], [350, 780]];
    let t = t0; const n = 4 + ((Math.random() * 5) | 0);
    for(let k = 0; k < n; k++){
      const [a, b] = V[(Math.random() * V.length) | 0], d = .10 + Math.random() * .2, hiss = Math.random() < .35;
      f1.frequency.setValueAtTime(a, t); f2.frequency.setValueAtTime(b, t);
      g3.gain.setValueAtTime(hiss ? .9 : .15, t);
      env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(level * (hiss ? .7 : 1.1), t + .04); env.gain.setValueAtTime(level * (hiss ? .6 : 1), t + d); env.gain.linearRampToValueAtTime(0, t + d + .07);
      t += d + .08 + Math.random() * .12;
    }
    s.start(t0); s.stop(t + .2);
  }
  /** 門的吱——聲：鋸齒波的「黏滑」頻率（摩擦）→ 三個木頭共振峰；dur 秒 */
  function creak(dur, level = 1){
    if(!audOn()) return;
    const ac = A.ac, t = ac.currentTime + .02;
    const o = ac.createOscillator(); o.type = 'sawtooth';
    const n = 48, fc = new Float32Array(n), ac2 = new Float32Array(n); let f = 26;
    for(let i = 0; i < n; i++){ f = clamp(f + (Math.random() - .45) * 16, 14, 80); fc[i] = f; ac2[i] = level * (.35 + .65 * Math.random() ** .5) * Math.min(1, i / 3, (n - 1 - i) / 3 + .1); }
    o.frequency.setValueCurveAtTime(fc, t, dur);
    const env = ac.createGain(); env.gain.setValueCurveAtTime(ac2, t, dur);
    for(const [fr, q, g] of [[520, 9, .9], [1250, 7, .6], [2600, 6, .35]]){ const b = ac.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = fr; b.Q.value = q; const gg = ac.createGain(); gg.gain.value = g; o.connect(b); b.connect(gg); gg.connect(env); }
    env.connect(A.door.g); o.start(t); o.stop(t + dur + .05);
  }
  function thud(level = 1){
    if(!audOn()) return;
    const ac = A.ac, t = ac.currentTime + .02;
    const o = ac.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(38, t + .3);
    const g = ac.createGain(); g.gain.setValueAtTime(level * .9, t); g.gain.exponentialRampToValueAtTime(.001, t + .45);
    o.connect(g); g.connect(A.door.g); o.start(t); o.stop(t + .5);
    const s = ac.createBufferSource(); s.buffer = A.noise; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    const g2 = ac.createGain(); g2.gain.setValueAtTime(level * .6, t); g2.gain.exponentialRampToValueAtTime(.001, t + .2);
    s.connect(f); f.connect(g2); g2.connect(A.door.g); s.start(t); s.stop(t + .25);
  }
  /** 停電那一下：「啪」一聲燈絲斷掉＋一點電流聲；回來時嘶嘶地閃幾下 */
  function zap(back = false){
    if(!audOn()) return;
    const ac = A.ac, t = ac.currentTime + .01;
    for(let k = 0; k < (back ? 3 : 1); k++){
      const tt = t + k * .07, s = ac.createBufferSource(); s.buffer = A.noise; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = back ? 3800 : 2600; f.Q.value = 1.4;
      const g = ac.createGain(); g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(back ? .18 : .5, tt + .003); g.gain.exponentialRampToValueAtTime(.001, tt + (back ? .03 : .09));
      s.connect(f); f.connect(g); g.connect(A.room); s.start(tt, Math.random()); s.stop(tt + .12);
    }
    if(!back){ const o = ac.createOscillator(); o.frequency.setValueAtTime(75, t); o.frequency.exponentialRampToValueAtTime(40, t + .12); const g = ac.createGain(); g.gain.setValueAtTime(.4, t); g.gain.exponentialRampToValueAtTime(.001, t + .15); o.connect(g); g.connect(A.room); o.start(t); o.stop(t + .17); }
  }
  /** 小丑彈出來：彈簧「啵嚶」＋一聲金屬 */
  function boing(){
    if(!audOn()) return;
    const ac = A.ac, t = ac.currentTime + .02, ch = A.toy;
    if(ch.p) ch.p.pan.setValueAtTime(panOf(jackAt) * .9, t);
    const o = ac.createOscillator(); o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(430, t + .09); o.frequency.exponentialRampToValueAtTime(290, t + .55);
    const v = ac.createOscillator(); v.frequency.value = 17; const vg = ac.createGain(); vg.gain.value = 40; v.connect(vg); vg.connect(o.detune);
    const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.4, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + .7);
    o.connect(g); g.connect(ch.g); o.start(t); v.start(t); o.stop(t + .72); v.stop(t + .72);
    const tw = ac.createOscillator(); tw.type = 'triangle'; tw.frequency.setValueAtTime(880, t); tw.frequency.linearRampToValueAtTime(862, t + .35);
    const tg = ac.createGain(); tg.gain.setValueAtTime(.12, t); tg.gain.exponentialRampToValueAtTime(.001, t + .38); tw.connect(tg); tg.connect(ch.g); tw.start(t); tw.stop(t + .4);
  }
  /** 嚇人的那一下：低頻一沉＋不和諧的銅管／弦樂群＋尖叫般的高音（顫音）＋一陣風聲（直接進總線，不會被死寂壓掉） */
  function sting(){
    if(!audOn()) return;
    const ac = A.ac, t = ac.currentTime + .005, out = A.fig.g;
    const sub = ac.createOscillator(); sub.frequency.setValueAtTime(70, t); sub.frequency.exponentialRampToValueAtTime(28, t + .9);
    const sg = ac.createGain(); sg.gain.setValueAtTime(.8, t); sg.gain.exponentialRampToValueAtTime(.001, t + 1.1); sub.connect(sg); sg.connect(out); sub.start(t); sub.stop(t + 1.2);
    const lpf = ac.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.setValueAtTime(3200, t); lpf.frequency.exponentialRampToValueAtTime(900, t + 1.1);
    const cg = ac.createGain(); cg.gain.setValueAtTime(0, t); cg.gain.linearRampToValueAtTime(.3, t + .012); cg.gain.exponentialRampToValueAtTime(.001, t + 1.25);
    lpf.connect(cg); cg.connect(out);
    for(const f of [98, 103.8, 146.8, 207.7, 277.2, 293.7]){ const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * .88, t + 1.1); o.detune.value = (Math.random() - .5) * 30; o.connect(lpf); o.start(t); o.stop(t + 1.3); }
    const hi = ac.createOscillator(); hi.type = 'sawtooth'; hi.frequency.setValueAtTime(1660, t); hi.frequency.linearRampToValueAtTime(1480, t + .9);
    const vib = ac.createOscillator(); vib.frequency.value = 13; const vg = ac.createGain(); vg.gain.value = 70; vib.connect(vg); vg.connect(hi.detune);
    const hb = ac.createBiquadFilter(); hb.type = 'bandpass'; hb.frequency.value = 2200; hb.Q.value = 2;
    const hg = ac.createGain(); hg.gain.setValueAtTime(0, t); hg.gain.linearRampToValueAtTime(.2, t + .03); hg.gain.exponentialRampToValueAtTime(.001, t + 1.0);
    hi.connect(hb); hb.connect(hg); hg.connect(out); hi.start(t); vib.start(t); hi.stop(t + 1.05); vib.stop(t + 1.05);
    const s = ac.createBufferSource(); s.buffer = A.noise; s.loop = true;
    const nb = ac.createBiquadFilter(); nb.type = 'bandpass'; nb.Q.value = 1.2; nb.frequency.setValueAtTime(500, t); nb.frequency.exponentialRampToValueAtTime(3500, t + .25); nb.frequency.exponentialRampToValueAtTime(700, t + .9);
    const ng = ac.createGain(); ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(.4, t + .02); ng.gain.exponentialRampToValueAtTime(.001, t + .95);
    s.connect(nb); nb.connect(ng); ng.connect(out); s.start(t); s.stop(t + 1);
  }
  const _f = V3(0, 0, 0), _r = V3(0, 0, 0), _d = V3(0, 0, 0);
  /** 某個點在聽者的左右（-1 左 … +1 右） */
  function panOf(p){
    camera.getWorldDirection(_f); _f.y = 0; _f.normalize();
    _r.set(-_f.z, 0, _f.x);
    _d.set(p.x - camera.position.x, 0, p.z - camera.position.z);
    const l = _d.length() || 1;
    return clamp(_d.dot(_r) / l, -1, 1);
  }
  let mixT = 0;
  const MIXS = { drone: -1, hush: null };
  function mix(aud, t, droneLv, hush){
    if(!A.ready || t - mixT < .066) return;
    mixT = t;
    const ac = A.ac, now = ac.currentTime, on = !!(ctx.audio && ctx.audio.on);
    A.bus.gain.setTargetAtTime(on ? aud : 0, now, .15);
    A.lp.frequency.setTargetAtTime(600 + 15000 * aud * aud, now, .15);
    const cp = camera.position;
    const setCh = (ch, p, base) => {
      const d = Math.hypot(p.x - cp.x, p.z - cp.z);
      ch.g.gain.setTargetAtTime(base / (1 + .45 * d), now, .1);
      if(ch.p) ch.p.pan.setTargetAtTime(panOf(p) * .8, now, .1);
    };
    setCh(A.gramo, gramoPos, 1.1); setCh(A.mon, monPos, 1.0); setCh(A.door, doorWorld, 1.4); setCh(A.hum, cribPos, 1.0);
    A.fig.g.gain.setTargetAtTime(1, now, .05);
    if(Math.abs(droneLv - MIXS.drone) > .004){ MIXS.drone = droneLv; A.drone.gain.setTargetAtTime(droneLv, now, .6); }
    if(hush !== MIXS.hush){ MIXS.hush = hush; A.room.gain.setTargetAtTime(hush ? 0 : 1, now, hush ? .035 : .9); if(hush) humOff(now); }
  }

  /* ============================================================
     22. 執行期
     ============================================================ */
  const startEl = document.getElementById('start');
  const navigating = () => !startEl || startEl.style.display === 'none';
  const photoOn = () => { const p = window.__a8 && window.__a8.photo; if(p) return !!p.active; const b = document.getElementById('m-photo'); return !!(b && b.classList.contains('on')); };
  const hHalf = () => Math.atan(Math.tan(camera.fov * DEG / 2) * camera.aspect);
  let lampVL = null;
  const lampF = () => {   // 吊燈現在開幾成（白天 always、晚上全開；含俯瞰時的 lampK）
    if(!lampVL && ctx.lighting && ctx.lighting.VL) lampVL = ctx.lighting.VL.find(v => v.src === lampCeil) || null;
    return lampVL && lampVL.base > 0 ? lampVL.i / lampVL.base : .22;
  };
  const _f2 = V3(0, 0, 0), _d2 = V3(0, 0, 0);
  const angTo = p => { camera.getWorldDirection(_f2); _f2.y = 0; _f2.normalize(); _d2.set(p.x - camera.position.x, 0, p.z - camera.position.z).normalize(); return Math.acos(clamp(_f2.dot(_d2), -1, 1)); };
  const distTo = p => Math.hypot(p.x - camera.position.x, p.z - camera.position.z);

  // 燈：不規則地亂閃、偶爾暗下來嗡嗡響、每十幾二十秒整個斷電 1–3 秒（先劈啪閃幾下再熄；回來時嘶嘶地閃）
  const FL = { next: 3, until: 0, kind: 'none', level: .8, hold: 0, buzz: 0, black: false, nextBlack: mr(9, 15), pre: 0 };
  function flicker(t, dt){
    if(FL.kind === 'none'){
      if(t > FL.nextBlack){ FL.kind = 'black'; FL.until = t + mr(1.2, 3); FL.pre = t + .4; FL.nextBlack = t + mr(14, 28); }
      else if(t > FL.next){ FL.kind = Math.random() < .3 ? 'brown' : 'flick'; FL.until = t + mr(.25, 1.6); FL.next = t + mr(2, 7); }
    }
    if(FL.kind !== 'none' && t > FL.until){ if(FL.black) zap(true); FL.kind = 'none'; FL.black = false; FL.level = .05; }
    if(FL.kind === 'black'){
      if(t < FL.pre){ if(t > FL.hold){ FL.level = Math.random() < .5 ? .02 : mr(.6, 1); FL.hold = t + mr(.03, .08); } FL.buzz = .1; }
      else { if(!FL.black){ FL.black = true; zap(false); } FL.level = 0; FL.buzz = 0; }
    }else if(FL.kind === 'brown'){ FL.level = .28 + .06 * Math.sin(t * 60) + .05 * Math.random(); FL.buzz = .06; }
    else if(FL.kind === 'flick'){ if(t > FL.hold){ FL.level = Math.random() < .5 ? mr(.02, .3) : mr(.7, 1); FL.hold = t + mr(.03, .11); } FL.buzz = .09; }
    else { const tg = .78 + .12 * Math.sin(t * 7.3) * Math.sin(t * 2.1) + .06 * Math.sin(t * 23) - .05 * Math.random(); FL.level += (tg - FL.level) * Math.min(1, dt * 10); FL.buzz = 0; }
    return FL.level;
  }
  // 吊飾：慢慢轉 → 突然停 → 倒轉 → 停 → 再轉
  const MOB = { w: .35, target: .35, state: 'fwd', until: 9, ang: 0 };
  function mobileStep(t, dt){
    if(t > MOB.until){
      const nx = { fwd: 'halt', halt: 'back', back: 'halt2', halt2: 'fwd' }[MOB.state]; MOB.state = nx;
      MOB.target = nx === 'fwd' ? .35 : nx === 'back' ? -.5 : 0;
      MOB.until = t + (nx === 'fwd' ? mr(7, 14) : nx === 'back' ? mr(3, 6) : nx === 'halt' ? mr(1.5, 3.2) : mr(1, 2.2));
    }
    const k = MOB.target === 0 ? 14 : 1.4;               // 停：一下就停住；轉：慢慢加速
    MOB.w += (MOB.target - MOB.w) * Math.min(1, dt * k);
    MOB.ang += MOB.w * dt;
    mobile.rotation.y = MOB.ang;
    mobile.rotation.z = -.04 * (MOB.target - MOB.w);      // 急停時整串晃一下
  }
  // 搖椅：搖一陣 → 慢慢停 → 又突然開始（像有人坐下）；你沒在看的時候，整張椅子轉過來對著你
  const CH = { amp: .09, target: .09, ph: 0, until: 12, on: true, since: 0, next: mr(18, 30) };
  function chairStep(t, dt, here, hh){
    if(t > CH.until){ CH.on = !CH.on; CH.target = CH.on ? mr(.07, .11) : 0; CH.until = t + (CH.on ? mr(10, 20) : mr(4, 9)); if(CH.on) CH.amp = Math.max(CH.amp, CH.target * .9); }
    CH.amp += (CH.target - CH.amp) * Math.min(1, dt * (CH.on ? 2 : .35));
    CH.ph += dt * TAU / 2.3;
    const th = CH.amp * Math.sin(CH.ph);
    chairPiv.rotation.x = th; chairPiv.position.z = RR * th;
    if(!here) return;
    CH.since += dt;
    const p = chairBase.position;
    if(CH.since > CH.next && angTo(p) > hh + .25 && distTo(p) > 1.2){ chairBase.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z); CH.since = 0; CH.next = mr(20, 40); }
  }
  // 瓷娃娃：玩具架頂 → 搖椅上 → 嬰兒床裡 → 紅門前面背對房間（每次都趁你沒在看、離它也不近的時候）
  const DOLL = { i: 0, since: 0, next: mr(16, 26), spots: [
    { pos: dollPos.clone(), yaw: 0 },
    { chair: true },
    { pos: V3(crib.x + .05, FLOOR + .445, crib.z + .38), yaw: Math.PI / 2 },
    { pos: dollDoor.clone(), yaw: doorYaw + Math.PI },
  ] };
  const _wp = V3(), _wq = new THREE.Quaternion(), _we = new THREE.Euler(0, 0, 0, 'YXZ');
  function dollWorld(i, out){
    const sp = DOLL.spots[i];
    if(sp.chair){ chairPiv.updateWorldMatrix(true, false); return out.set(0, .4725 - RR, .03).applyMatrix4(chairPiv.matrixWorld); }
    return out.copy(sp.pos);
  }
  function placeDoll(){
    const sp = DOLL.spots[DOLL.i];
    if(sp.chair){ dollWorld(DOLL.i, doll.position); chairPiv.getWorldQuaternion(doll.quaternion); }
    else { doll.position.copy(sp.pos); doll.rotation.set(0, sp.yaw, 0); }
  }
  function dollStep(t, dt, here, hh){
    placeDoll();
    if(!here) return;
    DOLL.since += dt;
    if(DOLL.since > DOLL.next){
      const unseen = q => angTo(q) > hh + .3 && distTo(q) > .9;
      if(unseen(doll.position)){
        const cands = [0, 1, 2, 3].filter(i => i !== DOLL.i).sort(() => Math.random() - .5);
        const j = cands.find(i => unseen(dollWorld(i, _wp)));
        if(j !== undefined){ DOLL.i = j; DOLL.since = 0; DOLL.next = mr(18, 35); dollHead.rotation.y = 0; placeDoll(); }
      }
    }
    dollHead.updateWorldMatrix(true, false); _wp.setFromMatrixPosition(dollHead.matrixWorld);
    if(angTo(_wp) > 35 * DEG){   // 你沒在看它：頭慢慢轉過來看你
      doll.getWorldQuaternion(_wq); _we.setFromQuaternion(_wq, 'YXZ');
      let d = Math.atan2(camera.position.x - _wp.x, camera.position.z - _wp.z) - _we.y - dollHead.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      dollHead.rotation.y = clamp(dollHead.rotation.y + clamp(d, -dt * .35, dt * .35), -1.5, 1.5);
    }
  }
  // 小丑盒：你沒在看的時候「啵嚶」彈出來，下次又偷偷收回去
  const JACK = { pop: true, since: 0, next: mr(12, 26) };
  function jackStep(t, dt, here, hh){
    if(!here) return;
    JACK.since += dt;
    if(JACK.since < JACK.next || angTo(jackAt) < hh + .25 || distTo(jackAt) < 1.0) return;
    JACK.pop = !JACK.pop; jackPop.visible = JACK.pop; jackLid.visible = !JACK.pop; JACK.since = 0; JACK.next = mr(14, 32);
    if(JACK.pop) boing();
  }
  // 角落裡的影子：眼角餘光才看得到；正眼一看就不見，換個角落
  {
    const mine = ctx.colliders.slice(COL0);
    const cand = [[(northS ? northS.a1 : X1) - .45, ZN + .45], alcN ? [alcN.a1 - .25, alcN.c + .62] : null, [drs.x + DRS_W / 2 + .38, ZS - .36]].filter(Boolean);
    for(const [x, z] of cand){
      if(!inRoom(x, z, .12) || mine.some(c => x > c.x0 - .15 && x < c.x1 + .15 && z > c.z0 - .15 && z < c.z1 + .15)) continue;
      PF.corners.push(V3(x, 0, z));
    }
    PF.i = PF.corners.length ? (Math.random() * PF.corners.length) | 0 : 0;
  }
  function ghostStep(t, dt, here, hh){
    if(!PF.corners.length) return;
    if(PF.force == null && PF.op < .02 && distTo(PF.corners[PF.i]) < 1.25){   // 太近的角落不站：換一個夠遠的
      const k = PF.corners.findIndex(q => distTo(q) >= 1.25); if(k >= 0) PF.i = k;
    }
    const c = PF.corners[PF.i];
    let target = 0;
    if(PF.force != null) target = PF.op = PF.force;
    else if(here && SC.state !== 'armed' && SC.state !== 'fire' && !FL.black && t > PF.cool && distTo(c) > 1.25){
      const ang = angTo(c);
      if(ang < hh * .5){ if(PF.op > .02){ PF.op = 0; PF.cool = t + mr(7, 16); if(PF.corners.length > 1) PF.i = (PF.i + 1 + ((Math.random() * (PF.corners.length - 1)) | 0)) % PF.corners.length; } }
      else target = .88 * smooth(hh * .5, hh * .85, ang);
    }
    if(PF.force == null) PF.op += (target - PF.op) * Math.min(1, dt * (target > PF.op ? .7 : 14));
    pfig.visible = PF.op > .01;
    if(pfig.visible){ pfig.position.set(c.x, FLOOR + .95, c.z); pfig.rotation.y = Math.atan2(camera.position.x - c.x, camera.position.z - c.z); pfig.material.opacity = PF.op; }
  }
  // 紅門
  function doorGo(to, dur, kind){ RD.from = RD.a; RD.to = to; RD.t = 0; RD.dur = dur; RD.kind = kind; }
  function doorStep(t, dt, want){
    if(want === 'open' && RD.phase !== 'open' && RD.phase !== 'opening'){ RD.phase = 'opening'; doorGo(OPEN, 3.6, 'creak'); creak(3.4, 1); }
    else if(want === 'closed' && RD.phase !== 'closed' && RD.phase !== 'closing'){ RD.phase = 'closing'; doorGo(0, 1.5, 'slam'); creak(1.0, .6); }
    else if(want === 'ajar' && RD.phase !== 'ajar'){ RD.phase = 'ajar'; doorGo(AJAR, 1.8, 'smooth'); }
    if(RD.kind !== 'none'){
      RD.t += dt; const p = clamp(RD.t / RD.dur, 0, 1);
      let e;
      if(RD.kind === 'creak') e = smooth(0, 1, p) + .035 * Math.sin(p * TAU * 2.5) * (1 - p) * p * 4;   // 一頓一頓地開
      else if(RD.kind === 'slam') e = p * p * p;
      else e = smooth(0, 1, p);
      RD.a = lerp(RD.from, RD.to, e);
      if(p >= 1){ RD.kind = 'none'; if(RD.phase === 'opening') RD.phase = 'open'; if(RD.phase === 'closing'){ RD.phase = 'closed'; thud(.8); } }
    }else if(RD.phase === 'open'){ RD.breath += dt; RD.a = OPEN + .035 * Math.sin(RD.breath * .9) * (.5 + .5 * Math.sin(RD.breath * .23)); }
    leafPiv.rotation.y = -RD.a;
    voidG.visible = RD.a > .004;
    return RD.a / OPEN;
  }
  // 虛空：霧往上飄＋視差（越深的層跟著你移動越少，看起來門後很深）
  const _v = V3(0, 0, 0), _inv = new THREE.Matrix4();
  function voidStep(t, open){
    voidG.updateWorldMatrix(true, false);
    _inv.copy(voidG.matrixWorld).invert();
    _v.copy(camera.position).applyMatrix4(_inv);   // 相機在門的局部座標（x 左右、y 高、z 離牆）
    const dz = Math.max(.3, _v.z), dx = _v.x, dy = _v.y - DH / 2;
    const par = (D, tex, vx, vy, ox = 0, oy = 0) => { tex.offset.set(ox + t * vx - (dx * D / (dz + D)) / DW * tex.repeat.x, oy + t * vy - (dy * D / (dz + D)) / DH * tex.repeat.y); };
    par(6.0, voidTex, 0, 0, .14, .14);                       // 最深：遠方那團光幾乎跟著你走
    voidTex.offset.set(clamp(voidTex.offset.x, 0, .28), clamp(voidTex.offset.y, 0, .28));
    par(2.2, mistTex, .018, -.05, .3, .1);
    par(1.4, smokeTex, .012, -.04);
    par(.4, smokeTex2, -.02, -.07);
    voidEyes.position.x = clamp(.06 + dx * 2.6 / (dz + 2.6), -DW / 2 + .12, DW / 2 - .12); voidEyes.position.y = clamp(1.52 + dy * 2.6 / (dz + 2.6), .5, DH - .15);
    const pulse = .82 + .12 * Math.sin(t * 1.7) + .06 * Math.sin(t * 4.3);
    voidBase.material.color.setRGB(1.6 * pulse, 1.0 * pulse, .95 * pulse);
    voidMist.material.opacity = .4 + .15 * Math.sin(t * .8);
    const ep = (t % 23) / 23, eo = smooth(.62, .68, ep) * (1 - smooth(.8, .86, ep)) * (Math.sin(t * 9) > -.95 ? 1 : 0);
    voidEyes.material.opacity = eo * open;
    return pulse;
  }
  function fogStep(t){ fogTex.offset.set(t * .012, t * .005); fogTex2.offset.set(-t * .017, t * .009); }

  // 跳嚇
  const SC = { state: 'idle', dwell: 0, need: mr(6, 9), outside: 999, anchor: V3(0, 0, 0), ok: false, seen: 0, armed: 0, whispered: false, t: 0, hold: 0, forced: false, hush: false };
  function freeSpot(x, z, r = .32){
    if(!inRoom(x, z, r)) return false;
    for(const c of ctx.colliders){
      if(!c || c.y1 < .3) continue;
      if(x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return false;
    }
    const cp = camera.position;   // 相機到那一點之間不能隔著牆（L 形轉角）
    for(let k = 1; k < 6; k++){ const f = k / 6; if(!inRoom(lerp(cp.x, x, f), lerp(cp.z, z, f), .02)) return false; }
    return true;
  }
  function findBehind(){
    camera.getWorldDirection(_f); _f.y = 0; _f.normalize();
    const base = Math.atan2(-_f.x, -_f.z);   // 正後方
    for(const d of [1.2, 1.35, 1.05, 1.5]) for(const off of [0, .35, -.35, .7, -.7, 1.0, -1.0]){
      const a = base + off, x = camera.position.x + d * Math.sin(a), z = camera.position.z + d * Math.cos(a);
      if(freeSpot(x, z)){ SC.anchor.set(x, FLOOR, z); return true; }
    }
    return false;
  }
  function placeFig(extra = 0){
    const cp = camera.position;
    _d.set(cp.x - SC.anchor.x, 0, cp.z - SC.anchor.z); const l = _d.length() || 1; _d.divideScalar(l);
    fig.position.set(SC.anchor.x + _d.x * extra, FLOOR, SC.anchor.z + _d.z * extra);
    fig.rotation.y = Math.atan2(_d.x, _d.z);
  }
  function fire(forced = false, hold = 0){
    SC.state = 'fire'; SC.t = 0; SC.forced = forced; SC.hold = hold / 1000;
    fig.visible = true; placeFig(0);
    sting();
    flash.style.display = 'block';
    const D = 900 + hold, k = x => clamp(x / D, 0, 1);
    const kf = hold > 0 ? [{ opacity: 0 }, { opacity: .8, offset: k(70) }, { opacity: .5, offset: k(70 + hold) }, { opacity: 0 }]
                        : [{ opacity: 0 }, { opacity: .85, offset: .08 }, { opacity: .35, offset: .3 }, { opacity: .6, offset: .42 }, { opacity: 0 }];
    try{ flash.animate(kf, { duration: D, easing: 'ease-out' }).onfinish = () => { flash.style.display = 'none'; flash.style.opacity = 0; }; }
    catch(e){ flash.style.opacity = .5; setTimeout(() => { flash.style.display = 'none'; }, 700); }
    if(appEl && appEl.animate){ try{ appEl.animate([0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ transform: i === 8 ? 'none' : `translate(${(Math.random() - .5) * 18}px,${(Math.random() - .5) * 14}px)` })), { duration: 420, easing: 'linear' }); }catch(e){} }
  }
  function scareStep(t, dt, here, walkingNow){
    if(SC.state === 'fire'){
      SC.t += dt;
      const tt = SC.hold > 0 ? Math.min(SC.t, .12) : SC.t;
      if(SC.hold > 0) SC.hold -= dt;
      placeFig(.18 * (1 - Math.pow(1 - clamp(tt / .22, 0, 1), 3)));
      figHead.rotation.z = FIG_TILT + Math.sin(t * 43) * .12 * (1 - clamp(tt / .9, 0, 1));
      figHead.rotation.x = .08 + Math.sin(t * 31) * .06;
      for(const e of figEyes) e.material.color.setRGB(3.4 + 2.5 * Math.random(), 1.3, .2);
      faceMat.emissiveIntensity = 1.1;
      fig.visible = !(tt > .75 && Math.sin(t * 90) > 0);
      if(tt > 1.05 && SC.hold <= 0){ fig.visible = false; SC.state = 'done'; SC.outside = 0; SC.hush = false; faceMat.emissiveIntensity = .55; }
      return;
    }
    if(!here){
      if(SC.state === 'armed' || SC.state === 'idle'){ SC.state = 'idle'; SC.dwell = 0; fig.visible = false; SC.ok = false; SC.hush = false; }
      SC.outside += dt;
      if(SC.state === 'done' && SC.outside >= 30){ SC.state = 'idle'; SC.dwell = 0; SC.need = mr(6, 9); }
      return;
    }
    SC.outside = 0;
    if(NOSCARE || !walkingNow){ if(SC.state === 'armed'){ fig.visible = false; SC.ok = false; SC.hush = false; } return; }   // 按 Esc 放開滑鼠（開場框出來）時先藏起來
    if(SC.state === 'idle'){ SC.dwell += dt; if(SC.dwell >= SC.need){ SC.state = 'armed'; SC.armed = 0; SC.ok = false; SC.whispered = false; SC.seen = 0; } return; }
    if(SC.state !== 'armed') return;
    SC.armed += dt;
    const hh = hHalf();
    let ang = Math.PI;
    if(SC.ok){
      const d = distTo(SC.anchor);
      if(d < .8 || d > 1.9 || !freeSpot(SC.anchor.x, SC.anchor.z, .28)) SC.ok = false;
      else ang = angTo(SC.anchor);
    }
    // 選好的位置就固定在那裡，只有失效（走遠了、太近、被擋住）才重選 ——
    // （Codex 審查抓到：以前每一格都重新選「正後方」，平順地轉身時它會一直跟著轉到你背後、永遠不會出現）
    if(!SC.ok && findBehind()){ SC.ok = true; ang = angTo(SC.anchor); }
    if(!SC.ok){ fig.visible = false; SC.hush = false; return; }
    SC.hush = ang < hh + 60 * DEG;                    // 快轉過來了：房間的聲音全部停掉（死寂）
    const inView = ang < hh + 20 * DEG;
    fig.visible = inView;
    if(inView){ placeFig(0); SC.seen += dt; } else SC.seen = 0;
    if(inView && (ang < Math.min(hh * .8, 30 * DEG) || SC.seen > 1.0)) fire();
    else if(SC.armed > 14 && !SC.whispered){ SC.whispered = true; const ch = A.ready ? A.fig : null; if(ch && ch.p) ch.p.pan.setValueAtTime(panOf(SC.anchor) * .9, A.ac.currentTime); whisper(SC.anchor, .9, ch); }
  }
  // 窗外的人影
  function silStep(t, dt, here){
    if(!SIL.active){
      if(here && t > SIL.next){ SIL.active = true; SIL.t = 0; SIL.dur = mr(3.5, 5); const dir = Math.random() < .5 ? 1 : -1;
        const za = winBand ? winBand.a0 - .5 : ZN - .5, zb = winBand ? winBand.a1 + .5 : ZS + .5; SIL.z0 = dir > 0 ? za : zb; SIL.z1 = dir > 0 ? zb : za; sil.visible = true; }
      return;
    }
    SIL.t += dt;
    const p = SIL.t / SIL.dur;
    const gz = crib.z + .05, pz = clamp((gz - SIL.z0) / (SIL.z1 - SIL.z0), .05, .95);
    const q = p < .4 ? pz * p / .4 : p < .65 ? pz : pz + (1 - pz) * (p - .65) / .35;   // 走到窗簾縫 → 停下來往裡看 → 走掉
    sil.position.set(silX, SIL_Y + .025 * Math.abs(Math.sin(p * 18)), lerp(SIL.z0, SIL.z1, clamp(q, 0, 1)));
    if(p >= 1 || !here){ SIL.active = false; sil.visible = false; SIL.next = t + mr(30, 70); }
  }

  // 平常藏著的東西：開場先畫一次（幾何上傳、shader 編好），之後才藏起來
  // （這間所有的網格都畫一次：相機開場在客廳、看不到這間，不這樣做的話幾何會等到第一次看過來才上傳 → lighting 會多重算一次陰影）
  const warmList = [], warmHidden = [];
  root.traverse(o => { if(o.isMesh) warmList.push(o); if(!o.visible){ warmHidden.push(o); o.visible = true; } });
  const warmState = warmList.map(o => ({ o, fc: o.frustumCulled }));
  let warm = 0;
  const figY0 = fig.position.y, silY0 = sil.position.y;
  fig.position.y = -6; sil.position.y = -6;
  for(const w of warmState) w.o.frustumCulled = false;

  let active = false, monT = 0, errShown = false, buzzLast = 0, nowT = 0;
  ctx.tick.push((dt, t) => {
    try{
      nowT = t;
      if(warm < 4){   // 暖機：頭幾格讓藏著的東西畫一次
        warm++; if(ctx.poke) ctx.poke(300);
        if(warm < 4) return;
        for(const w of warmState) w.o.frustumCulled = w.fc;
        for(const o of warmHidden) o.visible = false;
        fig.position.y = figY0; sil.position.y = silY0;
      }
      ceilG.visible = ctx.roof ? ctx.roof.visible : true;
      const mode = ctx.getMode ? ctx.getMode() : 'walk', bird = mode !== 'walk';
      const photo = photoOn();
      const cp = camera.position;
      const here = !bird && !photo && inRoom(cp.x, cp.z);
      const dDoor = Math.hypot(cp.x - doorPt[0], cp.z - doorPt[1]);
      const walkingNow = !bird && !photo && navigating();
      // 聲音：房裡全開、門外漸弱（像隔著門）、俯瞰很小聲、其他地方幾乎聽不到
      const aud = photo ? 0 : bird ? .08 : here ? 1 : .5 * Math.pow(clamp(1 - (dDoor - .25) / 3.8, 0, 1), 1.6);
      if(photo){   // 拍照模式：全部停住（跳嚇的計時也暫停），燈維持穩定，氣氛層收掉
        lampCeil.mul = 1; lampRed.mul = RD.a > .01 ? .9 : 0; lampCeil.off = lampRed.off = !inRoom(cp.x, cp.z); active = false; setMood(false, false); mix(aud, t, 0, false);
        if(SC.state === 'fire'){ fig.visible = false; SC.state = 'done'; SC.outside = 0; }
        else if(SC.state === 'armed'){ fig.visible = false; SC.ok = false; }
        SC.hush = false; pfig.visible = false;
        return;
      }
      scareStep(t, dt, here || (SC.state === 'fire'), walkingNow);
      DIM.amb.value = bird ? .5 : .12; DIM.out.value = bird ? .45 : .05;
      const near = bird || here || dDoor < 3.5 || SC.state === 'fire';   // 客廳的站點離這間門口 4.5 m：不要讓它一直重畫
      // 燈只在「人在房裡／站在門口／俯瞰」時開：綠色吊燈和紅光離得遠還開著，會穿過牆照到餐廳、前室（整盞關掉＋讓出燈池）
      lampCeil.off = lampRed.off = !(here || bird || dDoor < 2.5 || SC.state === 'fire');
      if(!near){
        if(active){ active = false; lampCeil.mul = 1; lampRed.mul = 0; if(RD.phase !== 'closed'){ RD.a = 0; RD.phase = 'closed'; RD.kind = 'none'; leafPiv.rotation.y = 0; voidG.visible = false; } if(SIL.active){ SIL.active = false; sil.visible = false; } pfig.visible = false; PF.op = 0; }
        setMood(false, false); mix(aud, t, .05, false);
        return;
      }
      active = true;
      const hh = hHalf();
      // 門：俯瞰時半開（看得到紅光）；走動：走近就開、離開房間就關
      const dNear = Math.hypot(cp.x - doorWorld.x, cp.z - doorWorld.z);
      const want = bird ? 'ajar' : here ? ((RD.phase === 'open' || RD.phase === 'opening' || dNear < 2.35) ? 'open' : RD.phase === 'ajar' ? 'closed' : null) : 'closed';
      const open = clamp(doorStep(t, dt, want), 0, 1.1);
      const pulse = voidG.visible ? voidStep(t, clamp(open, 0, 1)) : 1;
      // 燈：吊燈亂閃／斷電；紅門開著時紅光才是主角（吊燈再暗一半）
      const fl = SC.state === 'fire' ? (SC.t < .12 || Math.sin(SC.t * 75) > .2 ? 1.35 : .02) : flicker(t, dt);   // 那一下：燈猛地亮起、一閃一閃（照亮那張臉）
      lampCeil.mul = fl * (1 - .55 * clamp(open, 0, 1));
      lampRed.mul = bird ? 0 : open * (3.4 * pulse) * (SC.state === 'fire' ? 1.6 : 1);
      const lf = lampF();
      MT.shade.emissiveIntensity = .7 * lf * lampCeil.mul;
      MT.bulb.emissiveIntensity = 2.0 * lf * lampCeil.mul;
      MT.night.emissiveIntensity = Math.random() < .04 ? .04 : .42 + .1 * Math.sin(t * 13);   // 快壞掉的小夜燈
      if(A.ready){ const bz = audOn() && here ? FL.buzz * (FL.level < .5 ? 1 : .4) : 0; if(Math.abs(bz - buzzLast) > .004){ buzzLast = bz; A.buzz.gain.setTargetAtTime(bz, A.ac.currentTime, .02); } }
      setMood(here, here && FL.black);
      // 會動的東西
      mobileStep(t, dt);
      chairStep(t, dt, here, hh);
      if(record) record.rotation.y -= dt * (MUS.run && (!A.ready || A.ac.currentTime >= MUS.pauseUntil) ? 3.6 : 3.6 * .2);
      fogStep(t);
      dollStep(t, dt, here, hh);
      jackStep(t, dt, here, hh);
      ghostStep(t, dt, here, hh);
      // 監視器：人在房裡或門口才重畫（每秒 12 次）；螢幕的綠光跟著閃（停電時是房間裡少數的光）
      if((here || dDoor < 2.5) && t - monT > 1 / 12){ monT = t; const lv = monitorDraw(t); haloMat.opacity = (.28 + .45 * lv) * (FL.black ? 1.6 : 1); if(A.ready) A.stat.gain.setTargetAtTime(audOn() ? lv * .09 : 0, A.ac.currentTime, .03); }
      // 聲音：死寂（那個東西快出現了）、低鳴、心跳、音樂盒（＋哼唱）
      const hush = SC.state === 'fire' || (SC.state === 'armed' && SC.hush);
      const armedK = SC.state === 'armed' ? clamp(SC.armed / 10, 0, 1) : 0;
      mix(aud, t, here ? .035 + .045 * open + (FL.black ? .035 : 0) + (SC.state === 'armed' ? .025 : 0) : .03, hush);
      if(audOn() && aud > .01 && !hush){
        heartbeat(.7 * (here ? .1 + .28 * open + (SC.state === 'armed' ? .2 + .35 * armedK : 0) : .05), 58 + 14 * open + (SC.state === 'armed' ? 20 + 28 * armedK : 0));
        playMusic(FL.black);
      }
      silStep(t, dt, here);
      if(ctx.poke) ctx.poke(250);
    }catch(e){
      if(!errShown){ errShown = true; console.error('[theme_br3] tick 出錯（這間的動畫停住，其他房間不受影響）：', e); }
    }
  });

  /* ============================================================
     23. 測試把手
     ============================================================ */
  ctx.themeBr3 = {
    /** 立刻嚇：front＝擺在相機正前方（截圖用）；hold＝停在最嚇人的那一格多少毫秒 */
    scare({ front = true, hold = 0, dist = 1.25 } = {}){
      if(front){ camera.getWorldDirection(_f); _f.y = 0; _f.normalize(); SC.anchor.set(camera.position.x + _f.x * dist, FLOOR, camera.position.z + _f.z * dist); }
      else if(!findBehind()) return false;
      fire(true, hold); if(ctx.poke) ctx.poke(1500 + hold); return true;
    },
    door(v = 1){ RD.kind = 'none'; RD.phase = v > 0 ? 'open' : 'closed'; RD.a = v > 0 ? OPEN * v : 0; RD.breath = 0; leafPiv.rotation.y = -RD.a; voidG.visible = RD.a > .004; if(ctx.poke) ctx.poke(1000); },
    silhouette(p = .5){ SIL.active = true; SIL.dur = 1e9; SIL.t = 0; SIL.z0 = crib.z + .05; SIL.z1 = crib.z + .05 + 1e-3; sil.visible = true; sil.position.set(silX, SIL_Y, crib.z + .05 + (p - .5) * .2); if(ctx.poke) ctx.poke(1000); },
    monitor(mode = 'fig'){ MON.mode = mode; MON.until = 1e9; },
    blackout(sec = 2.5){ FL.kind = 'black'; FL.until = nowT + sec; FL.pre = nowT + .3; FL.hold = 0; },
    noFlicker(){ FL.next = FL.nextBlack = 1e9; FL.kind = 'none'; },
    dollTo(i = 1){ DOLL.i = clamp(i | 0, 0, DOLL.spots.length - 1); DOLL.since = 0; placeDoll(); },
    jack(pop = true){ JACK.pop = pop; jackPop.visible = pop; jackLid.visible = !pop; },
    ghost(i = 0, op = .6){ if(!PF.corners.length) return false; PF.i = i % PF.corners.length; PF.force = op; PF.op = op; return PF.corners.length; },
    chairFace(){ const p = chairBase.position; chairBase.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z); },
    dim: DIM, _audio: A, _music: MUS,
    reset(){ SC.state = 'idle'; SC.dwell = 0; SC.hush = false; fig.visible = false; SIL.active = false; sil.visible = false; SIL.next = 1e9; MON.until = 0; PF.force = null; },
    state(){ return { mobile: MOB.state, chairAmp: +CH.amp.toFixed(3), scare: SC.state, hush: SC.hush, dwell: +SC.dwell.toFixed(2), outside: +SC.outside.toFixed(1), door: RD.phase, doorDeg: +(RD.a / DEG).toFixed(1), active,
                      lampMul: +lampCeil.mul.toFixed(2), redMul: +lampRed.mul.toFixed(2), black: FL.black, doll: DOLL.i, jack: JACK.pop, ghost: +PF.op.toFixed(2), ghostCorners: PF.corners.length,
                      audio: A.ready, music: MUS.i, hum: MUS.hum, noscare: NOSCARE, mood: moodOn }; },
    info: { sides: sides.map(s => ({ axis: s.axis, c: +s.c.toFixed(3), a0: +s.a0.toFixed(3), a1: +s.a1.toFixed(3), n: s.n, holes: s.holes.length })), doorCX, crib, chairP, drs, shelfP, lampP, keepOut },
  };
}
