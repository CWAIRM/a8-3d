/* ============================================================
   core.js — 共用地基（場景、相機、材質、尺寸、房間表、小工具）
   其他模組一律透過 ctx 取用這裡的東西，不要自己再建 renderer / scene。
   ============================================================ */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* ---------- 尺寸（依 layout/spec_final.json，平面圖經兩位讀圖者＋裁判校正）----------
   室內 27 坪 = 89.26 ㎡（外牆中心線）／ 工作陽台 1.8 坪
   樓高 H = 3.25 m（屋主提供）
   座標：原點 = 西向外牆內面 × 北向外牆內面；X 向東（平面圖右）、Z 向南（平面圖下）、Y 向上；單位公尺
   室內淨盒 8.976 × 10.376 m（牆內面到牆內面） */
export const H  = 3.25;            // 樓高
export const TW = 0.15;            // 外牆窗牆厚（北、西）；RC 牆另見 arch.js 逐道尺寸
export const IW = 0.12;            // 隔間牆厚（斜線牆 0.12–0.15）
export const W  = 8.976, D = 10.376; // 室內淨盒（東牆內面、南牆內面）
export const EYE = 1.62;           // 眼睛高度

/* ---------- 房間表（公尺）— 逐間對照 spec_final.json，⛔ 不要改格局 ----------
   rects = 淨地板矩形（牆面到牆面）；area = 規格書淨面積；
   label = 俯瞰標籤點；spawn / look = 走進去時的站點與視線（站在門口往房裡看；look 可給第三個數＝視線落點的高度，沒給就是平視）
   x0..z1 = 外框（給舊版 lighting.js 用，main.js 也會再算 bbox）
   順序 = 快速傳送按鈕順序；走道／前室 teleport:false（不出按鈕） */
function room(rects, area, label, spawn, look, teleport = true){
  const b = rects.reduce((a,q)=>[Math.min(a[0],q[0]),Math.min(a[1],q[1]),Math.max(a[2],q[2]),Math.max(a[3],q[3])],[1e9,1e9,-1e9,-1e9]);
  return { rects, area, label, spawn, look, teleport, x0:b[0], z0:b[1], x1:b[2], z1:b[3] };
}
export const R = {
  '客廳'   : room([[5.574, 0.000, 8.976, 4.090]], 13.90, [7.0, 2.3], [6.15, 3.55], [7.9, 1.0]),
  '餐廳'   : room([[4.850, 4.090, 8.976, 8.260]], 17.20, [7.0, 6.2], [8.35, 7.60], [6.2, 5.5]),
  '主臥室' : room([[0.000, 0.000, 2.841, 4.095]], 11.63, [1.4, 2.0], [2.40, 3.65], [0.9, 1.1]),
  '臥室二' : room([[2.964, 0.000, 5.437, 2.999]],  7.42, [4.2, 1.5], [4.95, 2.60], [3.9, 0.7]),   // 上排中間那間
  '臥室三' : room([[0.000, 5.888, 3.221, 8.260], [3.221, 6.426, 4.700, 8.260]], 10.34, [1.6, 7.1], [4.20, 7.75], [0.9, 6.9]), // 西南 L 形那間
  '主浴廁' : room([[0.000, 4.245, 3.214, 5.738]],  4.47, [1.6, 5.0], [2.85, 5.32], [0.7, 5.0]),
  '次浴廁' : room([[6.132, 8.410, 7.736, 10.376], [7.736, 9.179, 8.898, 10.376]], 4.09, [7.0, 9.4], [6.95, 8.66], [7.75, 10.1, 0.9]),   // look 第三個數＝視線高度（稍微往下看，馬桶、洗手台、淋浴間才進得了畫面）
  '廚房'   : room([[3.219, 8.424, 5.982, 10.376]],  5.40, [4.6, 9.4], [5.50, 8.95], [3.9, 9.9]),
  '陽台'   : room([[0.055, 8.424, 3.056, 9.987]],  4.70, [1.5, 9.2], [2.55, 9.20], [0.8, 9.6]),
  '走道'   : room([[2.841, 3.149, 5.574, 4.090]],  2.57, [4.2, 3.6], [4.90, 3.62], [3.0, 3.6], false),
  '前室'   : room([[3.364, 4.240, 4.700, 6.289]],  2.74, [4.0, 5.3], [4.30, 5.30], [3.4, 5.3], false),
};

/* ---------- 裝置偵測 ---------- */
// 加 ?touch=1 可強制手機模式、?touch=0 可強制電腦模式（偵測失準時的備用開關）
export const TOUCH = /[?&]touch=1/.test(location.search) ? true
            : /[?&]touch=0/.test(location.search) ? false
            : ( matchMedia('(pointer:coarse)').matches          // 主要輸入是手指（手機、平板）
             || matchMedia('(hover:none)').matches
             || !('requestPointerLock' in document.documentElement) );
// ⚠️ 不看 'ontouchstart' / maxTouchPoints：Windows 觸控筆電用滑鼠操作時也會回報有觸控，會被誤判成手機（低畫質、滑鼠不能轉頭）
// 畫質：手機預設 low；?q=high / ?q=low 可強制
export const QUALITY = /[?&]q=high/.test(location.search) ? 'high'
              : /[?&]q=low/.test(location.search) ? 'low'
              : (TOUCH ? 'low' : 'high');

export function createCore(){
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1218);
  scene.fog = new THREE.Fog(0x0e1218, 30, 70);

  const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.05, 250);
  const renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY==='high' ? 2 : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.getElementById('app').appendChild(renderer.domElement);

  /* ---------- 環境光照（IBL）：讓材質有真實的反射與漫射 ---------- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.035);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.85;

  /* ---------- 真實材質貼圖（Poly Haven, CC0 可商用） ---------- */
  const ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const TL = new THREE.TextureLoader();
  function tx(f, srgb){
    const t = TL.load('./lib/tex/'+f);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = ANISO;
    if(srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const TEX = {};
  // 淺橡木長條地板（Poly Haven laminate_floor_02，1.7 m 一張、板寬約 0.19 m）
  TEX.wood = {d:tx('oak_Diffuse.jpg',true), n:tx('oak_nor_gl.jpg'), a:tx('oak_arm.jpg')};
  // 大片暖灰石材磚（Poly Haven marble_01，1.5 m 一張）
  TEX.tile = {d:tx('stone_Diffuse.jpg',true), n:tx('stone_nor_gl.jpg'), a:tx('stone_arm.jpg')};
  TEX.wall = {n:tx('wall_nor_gl.jpg')};   // 油漆牆只用凹凸，不載髒污花紋
  // arm 貼圖（AO/粗糙/金屬）用第 0 組 UV，BoxGeometry 沒有 uv1
  TEX.wood.a.channel = 0; TEX.tile.a.channel = 0;
  // 一張貼圖對應幾公尺（＝素材的真實尺寸，紋理才會是 1:1）
  const TSCALE = {wood:1.70, tile:1.50, wall:2.10};
  const pbrCache = new Map();
  /** 依實際尺寸產生不變形的 PBR 材質；u 對應 w、v 對應 h（單位：公尺） */
  function pbr(kind, w, h, extra){
    const s = TSCALE[kind];
    const rx = Math.max(.25,+(w/s).toFixed(2)), ry = Math.max(.25,+(h/s).toFixed(2));
    const key = kind+'|'+rx+'|'+ry+'|'+(extra?JSON.stringify(extra):'');
    if(pbrCache.has(key)) return pbrCache.get(key);
    const t = TEX[kind];
    const c = o=>{ const n=o.clone(); n.repeat.set(rx,ry); return n; };
    let base;
    if(kind==='wall'){          // 室內油漆牆：只要細微凹凸，不要水泥髒污花紋
      base = { normalMap:c(t.n), normalScale:new THREE.Vector2(.28,.28), roughness:.93, metalness:0 };
    }else{
      base = { map:c(t.d), normalMap:c(t.n), aoMap:c(t.a), roughnessMap:c(t.a), metalnessMap:c(t.a),
               roughness:1, metalness:1 };
    }
    const m = new THREE.MeshStandardMaterial(Object.assign(base, extra||{}));
    m.userData.kind = kind;
    pbrCache.set(key, m);
    return m;
  }

  /* ---------- 基本材質 ---------- */
  const M = {
    wall  : new THREE.MeshStandardMaterial({color:0xf3efe7, roughness:.95}),
    wallO : new THREE.MeshStandardMaterial({color:0xe6e1d8, roughness:.95}),
    woodF : new THREE.MeshStandardMaterial({color:0xd8b98c, roughness:.62}),
    tileF : new THREE.MeshStandardMaterial({color:0xd9d5cd, roughness:.42, metalness:.02}),
    wetF  : new THREE.MeshStandardMaterial({color:0xd3d0ca, roughness:.35}),
    balcF : new THREE.MeshStandardMaterial({color:0xc4c1ba, roughness:.7}),
    glass : new THREE.MeshPhysicalMaterial({color:0xbfe0f5, transparent:true, opacity:.20,
             roughness:.03, metalness:0, transmission:.85, side:THREE.DoubleSide}),
    frame : new THREE.MeshStandardMaterial({color:0x3a3f45, roughness:.5, metalness:.5}),
    wood  : new THREE.MeshStandardMaterial({color:0x8a6240, roughness:.6}),
    woodD : new THREE.MeshStandardMaterial({color:0x5d4230, roughness:.6}),
    fab   : new THREE.MeshStandardMaterial({color:0x6f7f93, roughness:.92}),
    fabL  : new THREE.MeshStandardMaterial({color:0xe8e2d6, roughness:.95}),
    white : new THREE.MeshStandardMaterial({color:0xfbfbfa, roughness:.35}),
    metal : new THREE.MeshStandardMaterial({color:0xb9c0c7, roughness:.28, metalness:.85}),
    dark  : new THREE.MeshStandardMaterial({color:0x22262b, roughness:.45}),
    stone : new THREE.MeshStandardMaterial({color:0x33383f, roughness:.35}),
    green : new THREE.MeshStandardMaterial({color:0x4a7c52, roughness:.85}),
  };
  // 標記哪些材質要換成真實貼圖（色調用 tint 保留原本配色）
  M.wall.kind  = 'wall';  M.wall.tint  = 0xf3efe7;
  M.wallO.kind = 'wall';  M.wallO.tint = 0xe6e1d8;
  M.woodF.kind = 'wood';  M.woodF.tint = 0xf2ddbd;   // 淺蜜色橡木（貼圖本身偏灰，靠色調拉暖）
  M.tileF.kind = 'tile';  M.tileF.tint = 0xe0deda;   // 暖淺灰大石磚
  M.wetF.kind  = 'tile';  M.wetF.tint  = 0xe2e0dc;
  M.balcF.kind = 'tile';  M.balcF.tint = 0xcfcdc8;
  /** 有 kind 的話換成同尺寸的真實貼圖材質 */
  function skin(mat, w, h){
    return mat && mat.kind ? pbr(mat.kind, w, h, {color:mat.tint}) : mat;
  }

  /* ---------- 碰撞 ---------- */
  const colliders = [];  // 碰撞用 AABB：{x0,x1,z0,z1,y1}
  /** 用物件實際外框登記碰撞（任何旋轉都取世界座標外框）；pad 可內縮/外擴 */
  function addCollider(obj, {pad=0, y1}={}){
    obj.updateWorldMatrix(true, true);
    const b = new THREE.Box3().setFromObject(obj);
    if(b.isEmpty()) return null;
    const c = {x0:b.min.x-pad, x1:b.max.x+pad, z0:b.min.z-pad, z1:b.max.z+pad, y1: y1 ?? b.max.y};
    colliders.push(c);
    return c;
  }

  /* ---------- 幾何小工具 ---------- */
  function box(w,h,d,mat,x,y,z,solid=true,rotY=0){
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    m.position.set(x,y,z); m.rotation.y = rotY;
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    if(solid && rotY===0) colliders.push({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,y1:y+h/2});
    return m;
  }

  /* ---------- 3D 模型（glTF / GLB）---------- */
  const gltfLoader = new GLTFLoader();
  const modelCache = new Map();
  /**
   * *.model.json＝glTF 描述檔；幾何資料放在同資料夾的 *.geom.png（buffers[0].extras.geomPng，附長度與 CRC32 檢查），
   * 舊格式（base64 內嵌在 buffers[0].uri）也還讀得懂。
   * 為什麼這樣存：claude.ai 只收特定副檔名（.gltf／.bin 不收），而且公開分享前的內容審查讀不動超大的文字檔或二進位雜檔。
   * 這裡自己解出幾何資料、在記憶體裡組成一個 GLB 再交給 GLTFLoader，不讓它去 fetch data: 網址；
   * 貼圖仍是同資料夾的一般 jpg／webp 檔，照一般圖片網址載入。
   */
  const CRC_T = (()=>{ const t = new Uint32Array(256); for(let n = 0; n < 256; n++){ let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for(let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  /** 幾何資料存在無損 PNG 裡（RGB 每像素 3 bytes，前 4 bytes＝長度）：公開分享審查讀得動，也不是二進位雜檔 */
  async function readGeomPng(url, info){
    const blob = await (await fetch(url)).blob();
    let src;
    try{ src = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }); }
    catch(e){ src = await new Promise((res, rej)=>{ const im = new Image(); im.onload = ()=>res(im); im.onerror = rej; im.src = URL.createObjectURL(blob); }); }
    const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
    const c2 = cv.getContext('2d', { willReadFrequently: true });
    c2.drawImage(src, 0, 0);
    const px = c2.getImageData(0, 0, cv.width, cv.height).data;
    const rgb = new Uint8Array(cv.width * cv.height * 3);
    for(let i = 0, j = 0; i < px.length; i += 4){ rgb[j++] = px[i]; rgb[j++] = px[i + 1]; rgb[j++] = px[i + 2]; }
    const n = rgb[0] | rgb[1] << 8 | rgb[2] << 16 | rgb[3] << 24;
    const bin = rgb.slice(4, 4 + n);
    if(n !== info.byteLength || crc32(bin) !== info.crc32) throw new Error('幾何圖檔解碼不一致（瀏覽器改了顏色？）：' + url);
    return bin;
  }
  async function fetchPackedModel(url){
    const json = await (await fetch(url)).json();
    const buf = json.buffers && json.buffers[0];
    const base = url.slice(0, url.lastIndexOf('/') + 1);
    let bin;
    const png = buf && buf.extras && buf.extras.geomPng;
    const m = buf && /^data:[^,]*;base64,(.*)$/.exec(buf.uri || '');
    if(png) bin = await readGeomPng(base + png, buf.extras);
    else if(m){ const b64 = atob(m[1]); bin = new Uint8Array(b64.length); for(let i = 0; i < b64.length; i++) bin[i] = b64.charCodeAt(i); }
    else throw new Error('model.json 找不到幾何資料：' + url);
    delete buf.uri; delete buf.extras;                        // GLB 的第 0 個 buffer＝BIN 區塊
    const pad4 = n => (n + 3) & ~3;
    const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
    const jLen = pad4(jsonBytes.length), bLen = pad4(bin.length);
    const glb = new Uint8Array(12 + 8 + jLen + 8 + bLen);
    const dv = new DataView(glb.buffer);
    dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, glb.length, true);
    dv.setUint32(12, jLen, true); dv.setUint32(16, 0x4E4F534A, true);
    glb.set(jsonBytes, 20); glb.fill(0x20, 20 + jsonBytes.length, 20 + jLen);   // JSON 區塊用空白補齊 4 bytes
    const b0 = 20 + jLen;
    dv.setUint32(b0, bLen, true); dv.setUint32(b0 + 4, 0x004E4942, true);
    glb.set(bin, b0 + 8);                                     // BIN 區塊用 0 補齊（Uint8Array 預設就是 0）
    return new Promise((res, rej)=>gltfLoader.parse(glb.buffer, base, g=>res(g.scene), rej));
  }
  /** 載入模型，回傳一份可放進場景的複本（材質共用、幾何共用） */
  function loadModel(url){
    if(!modelCache.has(url)){
      modelCache.set(url, /\.model\.json$/.test(url) ? fetchPackedModel(url)
        : new Promise((res, rej)=>gltfLoader.load(url, g=>res(g.scene), undefined, rej)));
    }
    return modelCache.get(url).then(src=>{
      const o = src.clone(true);
      o.traverse(n=>{ if(n.isMesh){ n.castShadow = true; n.receiveShadow = true; } });
      return o;
    });
  }
  /**
   * 把模型擺到指定位置並縮放到真實尺寸。
   * fit: {w|d|h} 擇一或多個（公尺），只給一個就等比例縮放；都不給就不縮放
   * 物件底部會貼齊 y（預設地板 0.04）
   */
  function place(obj, {x, z, y=0.04, rotY=0, fit, scale}={}){
    obj.rotation.set(0, 0, 0);
    obj.position.set(0, 0, 0);
    obj.scale.setScalar(scale ?? 1);
    obj.updateWorldMatrix(true, true);
    if(fit){
      const s = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
      const k = [];
      if(fit.w) k.push(fit.w / s.x);
      if(fit.h) k.push(fit.h / s.y);
      if(fit.d) k.push(fit.d / s.z);
      if(k.length) obj.scale.multiplyScalar(Math.min(...k));
    }
    obj.rotation.y = rotY;
    obj.updateWorldMatrix(true, true);
    const b = new THREE.Box3().setFromObject(obj);
    const cx = (b.min.x+b.max.x)/2, cz = (b.min.z+b.max.z)/2;
    obj.position.set(x - cx, y - b.min.y, z - cz);
    scene.add(obj);
    obj.updateWorldMatrix(true, true);
    return obj;
  }

  /* ---------- 模組之間的登記簿（誰放了什麼，讓別的模組知道） ---------- */
  const registry = {
    windows: [],    // arch 登記：{axis, at, w, y0, y1, fixed, room, normal:[x,z]} 法線朝室外
    doors: [],      // arch 登記：{axis, at, w, fixed, h, rooms:[a,b]}
    lamps: [],      // 家具模組登記會發光的燈：{pos:THREE.Vector3, kind:'pendant'|'floor'|'table'|'ceiling'|'wall', room, color?, power?}
    emissives: [],  // 家具模組登記會發光的材質：{mat, base:emissiveIntensity, kind:'lamp'|'screen'}
    tick: [],       // 每格畫面要跑的小動畫：fn(dt, t)
  };

  return {
    THREE, scene, camera, renderer, pmrem,
    H, TW, IW, W, D, R, EYE, TOUCH, QUALITY,
    M, TEX, pbr, skin,
    colliders, addCollider, box,
    loadModel, place,
    ...registry, registry,
    roof: null,     // arch 會設定：天花板（屋頂開關用）
    time: 14,       // 目前時間（小時，0–24），由時間滑桿控制
  };
}
