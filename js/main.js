/* ============================================================
   main.js — 組裝全部模組 + 操作控制 + 介面 + 畫面迴圈
   ============================================================ */
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCore } from './core.js';
import buildArch from './arch.js';
import buildPublic from './furniture_public.js';
import buildPrivate from './furniture_private.js';
import buildLighting from './lighting.js';
import buildPhoto from './photo.js';
import setupAudio from './audio.js';

const $ = id => document.getElementById(id);
const QS = new URLSearchParams(location.search);

/* ---------- 載入進度（下載程式的那段由 index.html 顯示；這裡接著報「蓋到哪了」） ---------- */
const loadEl = $('loading'), barEl = $('loadbar'), loadSub = $('loadsub');
const stage = t => { if(loadSub) loadSub.textContent = t; };
let activeUntil = 0;                                   // 畫面「最近有變化」的期限（見 §迴圈 的省電）
const poke = (ms = 1500) => { activeUntil = Math.max(activeUntil, performance.now() + ms); };
THREE.DefaultLoadingManager.onProgress = (url, done, total)=>{
  if(barEl) barEl.style.width = Math.round(100*done/Math.max(1,total))+'%';
  poke();                                              // 晚到的貼圖／模型：要重畫才看得到
};

const ctx = createCore();
const { scene, camera, renderer, EYE, TOUCH } = ctx;
window.__a8 = { ctx, THREE };   // 給自動截圖測試用的把手（不影響使用者）
// 給主題房（theme_*.js）用：有東西在動就 poke()，省電迴圈才會一直畫；getMode() ＝ 'walk'｜'bird'
ctx.poke = poke;
ctx.getMode = () => mode;
setupAudio(ctx);   // 🔊 聲音總開關（預設關；手機規定要使用者點一下才能出聲）

/* ---------- 蓋房子 → 擺家具 → 打燈 ---------- */
stage('蓋牆、開門窗');
await buildArch(ctx);
stage('擺家具');
// 主題房（臥室二＝賽博龐克×文藝復興音樂廳、臥室三＝陰兒房）用動態載入：某一間壞掉只少那一間，不會整個網頁打不開
//   ⚠️ 一定要在 buildLighting 之前建好：lighting 建好時才會替場景裡的材質掛上俯瞰剖切的切平面
const theme = f => import(f).then(m => m.default(ctx));
const results = await Promise.allSettled([buildPublic(ctx), buildPrivate(ctx), theme('./theme_br2.js'), theme('./theme_br3.js')]);
results.forEach((r,i)=>{ if(r.status==='rejected') console.error('furniture module '+i+' failed:', r.reason); });
stage('打燈');
const light = await buildLighting(ctx);

/* ---------- 房間表：arch 可以整份換掉（ctx.R），這裡統一整理成「多個矩形」的格式 ----------
   每間房：{rects:[[x0,z0,x1,z1],...], area, label:[x,z], spawn:[x,z], look:[x,z(,y)], teleport:true/false} */
const R = ctx.R, W = ctx.W, D = ctx.D;
for(const k in R){
  const r = R[k];
  if(!r.rects) r.rects = [[r.x0, r.z0, r.x1, r.z1]];
  const b = r.rects.reduce((a,q)=>[Math.min(a[0],q[0]),Math.min(a[1],q[1]),Math.max(a[2],q[2]),Math.max(a[3],q[3])],[1e9,1e9,-1e9,-1e9]);
  r.bbox = b;
  if(!r.label) r.label = [(b[0]+b[2])/2, (b[1]+b[3])/2];
  if(!r.spawn) r.spawn = r.label;
  if(r.area == null) r.area = r.rects.reduce((a,q)=>a+(q[2]-q[0])*(q[3]-q[1]),0);
}
const BOUNDS = ctx.bounds || {x0:0, z0:0, x1:W, z1:D};
stage('準備拍照模式');
const photo = await buildPhoto(ctx);
const pingText = a => a.toFixed(1)+' ㎡・'+(a/3.305785).toFixed(1)+' 坪';

/* ============================================================
   房間名稱標籤（俯瞰用）
   用網頁文字畫（不是 3D 貼片）：字的大小固定在螢幕上（手機也讀得到）、不受夜間曝光影響（晚上不會被洗白）；
   位置由 3D 裡的一個「錨點」（放在地板上的房間標籤點）每格投影到畫面上
   ⚠️ ctx.labels 仍然是 3D 物件（錨點）：拍照模組會把它們 visible=false（拍照時不要標籤），lighting 會調高度
   ============================================================ */
const labels = [], labelEls = [];
{
  const layer = $('labels');
  for(const k in R){
    const r = R[k];
    const a = new THREE.Object3D(); a.name = 'label-anchor:'+k;
    a.position.set(r.label[0], 0.12, r.label[1]);   // 地板上：透視斜看時標籤就落在房間正中，不會往北飄到隔壁房
    a.visible = false; a.userData.noPhoto = true;
    scene.add(a); labels.push(a);
    const el = document.createElement('div'); el.className = 'lb';
    const b = document.createElement('b'); b.textContent = k;
    const sm = document.createElement('small'); sm.textContent = pingText(r.area);
    el.append(b, sm); layer.appendChild(el);
    labelEls.push({ el, a, shown:false, tf:'' });
  }
}
ctx.labels = labels;
const _lp = new THREE.Vector3();
function updateLabels(){
  const on = mode !== 'walk' && !photo.active;      // 拍照級畫面裡不放標籤（跟存下來的照片一致）
  const w = innerWidth, h = innerHeight;
  for(const L of labelEls){
    let show = on && L.a.visible;
    if(show){
      L.a.getWorldPosition(_lp).project(camera);
      show = _lp.z < 1 && _lp.z > -1 && Math.abs(_lp.x) < 1.2 && Math.abs(_lp.y) < 1.2;
      if(show){
        const tf = 'translate('+((_lp.x*.5+.5)*w).toFixed(1)+'px,'+((-_lp.y*.5+.5)*h).toFixed(1)+'px) translate(-50%,-50%)';
        if(tf !== L.tf){ L.el.style.transform = tf; L.tf = tf; }
      }
    }
    if(show !== L.shown){ L.el.style.display = show ? 'block' : 'none'; L.shown = show; }
  }
}

/* ============================================================
   控制
   ============================================================ */
const pl = new PointerLockControls(camera, renderer.domElement);
// ⚠️ iPhone／iPad 的 Safari（含 LINE 內建瀏覽器）沒有「鎖住滑鼠」功能：document.exitPointerLock 不存在，
//    直接呼叫 pl.unlock() 會丟錯、整個網頁卡在載入畫面（2026-09-19 Andy 的朋友實際遇到）→ 一律走這個安全版
const CAN_LOCK = typeof document.exitPointerLock === 'function' && typeof renderer.domElement.requestPointerLock === 'function';
function unlockPointer(){ if(CAN_LOCK && pl.isLocked){ try{ pl.unlock(); }catch(e){} } }
scene.add(pl.object);
// 滑鼠鎖不能用（例如被嵌在不允許鎖滑鼠的框框裡）時，我們自己改成「按住拖曳轉頭」→ 不要 three 那行紅字錯誤
renderer.domElement.ownerDocument.removeEventListener('pointerlockerror', pl._onPointerlockError);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enabled=false; orbit.enableDamping=true; orbit.dampingFactor=.07;
// 不會轉到跟地面平（剖切後只剩一面外牆）、不會鑽進牆裡、不會拉太遠
orbit.maxPolarAngle=1.1; orbit.minDistance=7; orbit.maxDistance=60;
orbit.target.set((BOUNDS.x0+BOUNDS.x1)/2,0,(BOUNDS.z0+BOUNDS.z1)/2);
// 平移不能把房子推出畫面：目標點夾在房子中間那一塊（離外牆至少 2 m），高度也夾住
orbit.addEventListener('change', ()=>{
  const t = orbit.target, C = THREE.MathUtils.clamp;
  const cx = C(t.x, BOUNDS.x0 + 2, BOUNDS.x1 - 2), cz = C(t.z, BOUNDS.z0 + 2, BOUNDS.z1 - 2), cy = C(t.y, 0, 2);
  if(cx !== t.x || cz !== t.z || cy !== t.y){ const dx = cx - t.x, dy = cy - t.y, dz = cz - t.z; t.set(cx, cy, cz); camera.position.x += dx; camera.position.y += dy; camera.position.z += dz; }
});
let birdTouched = false;                                    // 使用者自己轉過／拉過俯瞰視角 → 之後收合說明框時不要把他的視角重置
orbit.addEventListener('start', ()=>{ birdTouched = true; });

let mode='walk';
const keys={};
const MOVE_KEYS = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight']);
addEventListener('keydown',e=>{
  keys[e.code]=true; poke();
  // 走動中：空白鍵／方向鍵不要去捲頁面、也不要去按到剛剛點過的按鈕、拉到時間滑桿
  if(walking() && MOVE_KEYS.has(e.code)){ e.preventDefault(); const f = document.activeElement; if(f && f !== document.body && f.blur) f.blur(); }
});
addEventListener('keyup',e=>{keys[e.code]=false});
addEventListener('blur',()=>{ for(const k in keys) keys[k]=false; });   // 切走視窗時放開所有鍵，不會一直往前走
// 按鈕點完就放掉焦點：之後按空白鍵（站高看）不會又按到同一顆按鈕
document.addEventListener('click', e=>{ const b = e.target && e.target.closest && e.target.closest('button'); if(b) b.blur(); });

const startEl=$('start'), crossEl=$('cross');

/* ---------- 手機 / 平板支援 ---------- */
const stickEl=document.createElement('div'); stickEl.id='stick';
stickEl.innerHTML='<div id="knob"></div>';
document.body.appendChild(stickEl);
const knobEl=stickEl.firstElementChild;

let mobF=0, mobS=0, stickId=null;
function stickAt(t){
  const r=stickEl.getBoundingClientRect();
  let dx=t.clientX-(r.left+r.width/2), dy=t.clientY-(r.top+r.height/2);
  const max=r.width/2-24, d=Math.hypot(dx,dy);
  if(d>max && d>0){ dx*=max/d; dy*=max/d; }
  knobEl.style.left=(r.width/2-24+dx)+'px';
  knobEl.style.top =(r.height/2-24+dy)+'px';
  mobS=dx/max; mobF=-dy/max;
}
function stickReset(){ stickId=null; mobF=mobS=0; knobEl.style.left='38px'; knobEl.style.top='38px'; }
stickEl.addEventListener('touchstart',e=>{ const t=e.changedTouches[0]; stickId=t.identifier; stickAt(t); e.preventDefault(); },{passive:false});
stickEl.addEventListener('touchmove', e=>{ for(const t of e.changedTouches) if(t.identifier===stickId) stickAt(t); e.preventDefault(); },{passive:false});
const stickEnd=e=>{ for(const t of e.changedTouches) if(t.identifier===stickId) stickReset(); };
stickEl.addEventListener('touchend',stickEnd); stickEl.addEventListener('touchcancel',stickEnd);

// 手指拖曳＝轉頭
let lookId=null, lx=0, ly=0;
function turn(dx, dy, k){
  camera.rotation.y -= dx*k;
  camera.rotation.x  = Math.max(-1.35, Math.min(1.35, camera.rotation.x-dy*k));
}
renderer.domElement.addEventListener('touchstart',e=>{
  poke();
  if(!TOUCH || !walking()) return;
  const t=e.changedTouches[0]; lookId=t.identifier; lx=t.clientX; ly=t.clientY;
},{passive:true});
renderer.domElement.addEventListener('touchmove',e=>{
  poke();
  if(lookId===null || mode!=='walk') return;
  for(const t of e.changedTouches){
    if(t.identifier!==lookId) continue;
    turn(t.clientX-lx, t.clientY-ly, 0.005);
    lx=t.clientX; ly=t.clientY;
  }
},{passive:true});
const lookEnd=()=>{ lookId=null; };
renderer.domElement.addEventListener('touchend',lookEnd);
renderer.domElement.addEventListener('touchcancel',lookEnd);

// 電腦版沒有鎖住滑鼠時（瀏覽器／外框不讓鎖）：按住滑鼠拖曳＝轉頭
let dragId=null, dmx=0, dmy=0;
renderer.domElement.addEventListener('pointerdown', e=>{
  poke();
  if(e.pointerType==='touch' && TOUCH) return;          // 手指交給上面的觸控處理
  if(e.button!==0 || pl.isLocked || !walking()) return;
  dragId=e.pointerId; dmx=e.clientX; dmy=e.clientY;
  try{ renderer.domElement.setPointerCapture(e.pointerId); }catch(err){}
});
renderer.domElement.addEventListener('pointermove', e=>{
  poke();
  if(e.pointerId!==dragId) return;
  if(!walking() || pl.isLocked){ dragId=null; return; }
  turn(e.clientX-dmx, e.clientY-dmy, 0.0045);
  dmx=e.clientX; dmy=e.clientY;
});
const dragEnd=e=>{ if(e.pointerId===dragId) dragId=null; };
renderer.domElement.addEventListener('pointerup',dragEnd);
renderer.domElement.addEventListener('pointercancel',dragEnd);
addEventListener('wheel', ()=>poke(), {passive:true});

// 走動中：開場框收起來了就可以走（電腦版鎖住滑鼠、鎖不了就改拖曳轉頭；手機用搖桿）
function walking(){ return mode==='walk' && startEl.style.display==='none' && !photo.active; }

let lockFailed=false;                                   // 這個頁面鎖不了滑鼠（外框不允許）→ 之後改用拖曳轉頭，不再一直試
function startNoLock(){
  startEl.style.display='none';
  crossEl.style.display = TOUCH ? 'block' : 'none';
  if(TOUCH) stickEl.style.display='block';
  setHints();
}
function lockFail(){
  if(pl.isLocked) return;
  if(!lockFailed && !TOUCH) toast('這裡不能鎖定滑鼠：改成「按住滑鼠拖曳」轉頭，W A S D 或方向鍵走路', 7000);
  lockFailed=true;
  if(mode==='walk' && !photo.active) startNoLock();
}
document.addEventListener('pointerlockerror', lockFail);
function enterWalk(fromCard){
  if(mode!=='walk') return;
  foldHudOnce();
  if(TOUCH || (lockFailed && !fromCard)){ startNoLock(); return; }
  let p;
  try{ p = renderer.domElement.requestPointerLock(); }catch(e){ lockFail(); return; }
  if(p && typeof p.catch==='function') p.catch(()=>lockFail());
}
startEl.addEventListener('click', ()=>enterWalk(true));
// 電腦版：開場框收起來之後，直接點畫面也能進入走動
renderer.domElement.addEventListener('click',()=>{ if(!TOUCH && mode==='walk' && !pl.isLocked && startEl.style.display!=='none') enterWalk(false); });
pl.addEventListener('lock',()=>{ startEl.style.display='none'; crossEl.style.display='block'; lockFailed=false; setHints(); });
pl.addEventListener('unlock',()=>{ if(mode==='walk'&&!TOUCH){startEl.style.display='flex';crossEl.style.display='none'} setHints(); });

/* ---------- 左上說明框：依裝置與模式換操作說明；可以收起來 ---------- */
const hudEl=$('hud'), hintEl=$('hint'), foldBtn=$('hudfold');
function setHints(){
  const k = t => '<span class="k">'+t+'</span>';
  let h;
  if(mode!=='walk') h = TOUCH
    ? k('單指拖')+'旋轉<br>'+k('兩指')+'縮放、平移<br>'+k('右上角')+'回到走動'
    : k('左鍵拖曳')+'旋轉<br>'+k('滾輪')+'拉近拉遠<br>'+k('右鍵拖曳')+'平移<br>'+'再按一次「俯瞰全屋」＝回正';
  else if(TOUCH) h = k('單指拖')+'轉頭看<br>'+k('左下搖桿')+'走動<br>'+k('右上角')+'俯瞰／傳送到各房間';
  else h = k('W A S D')+'或'+k('方向鍵')+'走動<br>'+
           (pl.isLocked || !lockFailed ? k('滑鼠')+'轉頭看<br>' : k('按住滑鼠拖曳')+'轉頭看<br>')+
           k('Shift')+'快走　'+k('空白')+'站高看<br>'+
           (pl.isLocked || !lockFailed ? k('Esc')+'放開滑鼠' : '');
  hintEl.innerHTML = h;
}
function setFold(f){
  hudEl.classList.toggle('folded', f);
  foldBtn.textContent = f ? '說明 ▾' : '收起 ▴';
  if(mode!=='walk' && !birdTouched) frameBird(); else if(mode!=='walk') updateBirdOffset();
}
foldBtn.addEventListener('click', ()=>setFold(!hudEl.classList.contains('folded')));
let hudFoldedOnce=false;
function foldHudOnce(){ if(TOUCH && !hudFoldedOnce){ hudFoldedOnce=true; if(!hudEl.classList.contains('folded')) setFold(true); } }

if(TOUCH){
  document.querySelector('#start .box').innerHTML =
    '<h2>🏠 準備進入彥武天祥洗很大的家</h2>'+
    '<p>手指<b>拖曳畫面</b>＝轉頭看<br>左下角<b>搖桿</b>＝前後左右走動</p>'+
    '<p style="color:#6b7a8d">想看整體格局，右上角有「俯瞰全屋」<br>（可以用兩指縮放、單指旋轉）</p>'+
    '<div class="go">點擊進入</div>';
}

// 起始位置：客廳
camera.rotation.order='YXZ';
let lastRoomName='客廳';
function goRoom(name){
  const r=R[name]; if(!r) return;
  camera.position.set(r.spawn[0], EYE, r.spawn[1]);
  let lk=r.look || [r.bbox[0]+r.bbox[2]-r.spawn[0], r.bbox[1]+r.bbox[3]-r.spawn[1]];  // 沒指定就看向房間另一頭
  if(Math.hypot(lk[0]-r.spawn[0], lk[1]-r.spawn[1]) < 0.3) lk=[r.spawn[0], r.spawn[1]+3];
  camera.lookAt(lk[0], lk[2] ?? EYE, lk[1]);
  lastRoomName=name;
  poke();
}
goRoom(R['客廳'] ? '客廳' : Object.keys(R)[0]);

/* 俯瞰模式取景：像參考圖那樣「北在上、從南邊斜斜往下看」，用比較窄的鏡頭（變形少、像模型屋），
   並依螢幕比例自動拉遠拉近，讓整間房子剛好塞滿「沒被按鈕、說明框蓋到的那塊」畫面：
   在「說明框右邊到按鈕左邊」「說明框與按鈕下面」「整個畫面」三塊裡挑房子能畫最大的那塊，
   再用鏡頭偏移（view offset）把房子中心移到那塊的正中間（轉動時仍然繞著房子中心轉） */
const BIRD_FOV = 38, WALK_FOV = 72, BIRD_ELEV = 58 * Math.PI/180;
let birdRect = null;
function freeRect(){
  const W2 = innerWidth, H2 = innerHeight, M = 10;
  const rectOf = el => { if(!el || getComputedStyle(el).display === 'none') return null; const r = el.getBoundingClientRect(); return r.width > 0 ? r : null; };
  const hud = rectOf(hudEl), md = rectOf($('modes')), note = rectOf($('note'));
  const x0A = (hud ? hud.right : 0) + M, x1A = (md ? md.left : W2) - M;
  // 左下角的小字說明：房子左下角真的會碰到它才讓開（大部分螢幕房子離它很遠，讓開只會白白縮小）
  let y1A = H2 - M;
  if(note){ const need = birdNeed(), s = Math.min((x1A - x0A)/need.w, (y1A - M)/need.h); if((x0A + x1A)/2 - s*need.w/2 < note.right + 4) y1A = note.top - 6; }
  const cands = [
    // 說明框與按鈕中間那一條
    { x0:x0A, x1:x1A, y0:M, y1:y1A, pen:0 },
    // 說明框與按鈕下面
    { x0:M, x1:W2-M, y0:Math.max(hud ? hud.bottom : 0, md ? md.bottom : 0)+M, y1:(note ? note.top - 6 : H2 - M), pen:0 },
    // 整個畫面（會被說明框或按鈕蓋到，要大很多才選它）
    { x0:M, x1:W2-M, y0:M, y1:H2-M, pen:0.45 },
  ];
  return { cands, W2, H2 };
}
function birdNeed(){
  const wM=(BOUNDS.x1-BOUNDS.x0)+1.2, dM=(BOUNDS.z1-BOUNDS.z0)+1.2;          // 含外凸的柱子
  return { w: wM*1.02, h: dM*Math.sin(BIRD_ELEV)+1.6 };                      // 畫面要容納的寬、高（公尺，在房子中心那個距離）
}
function pickRect(){
  const { cands, W2, H2 } = freeRect(), need = birdNeed();
  let best = null;
  for(const c of cands){
    const w = c.x1 - c.x0, h = c.y1 - c.y0;
    if(w < 120 || h < 120) continue;
    const s = Math.min(w/need.w, h/need.h) * (1 - c.pen);
    if(!best || s > best.s) best = { ...c, s };
  }
  if(!best) best = { x0:0, x1:W2, y0:0, y1:H2, s:Math.min(W2/need.w, H2/need.h) };
  return { ...best, W2, H2 };
}
function updateBirdOffset(){
  if(!birdRect) return;
  const r = birdRect;
  camera.setViewOffset(r.W2, r.H2, r.W2/2 - (r.x0+r.x1)/2, r.H2/2 - (r.y0+r.y1)/2, r.W2, r.H2);
}
function frameBird(){
  camera.aspect = innerWidth/innerHeight;
  birdRect = pickRect();
  const need = birdNeed();
  const rw = birdRect.x1 - birdRect.x0, rh = birdRect.y1 - birdRect.y0;
  const s = Math.min(rw/need.w, rh/need.h);                                   // 每公尺幾像素
  const visV = innerHeight / s;                                               // 整個畫面高度對應幾公尺
  const dist = visV/2/Math.tan(BIRD_FOV/2*Math.PI/180) * 1.06;
  const cx=(BOUNDS.x0+BOUNDS.x1)/2, cz=(BOUNDS.z0+BOUNDS.z1)/2;
  camera.position.set(cx, 0.6 + dist*Math.sin(BIRD_ELEV), cz + dist*Math.cos(BIRD_ELEV));   // 繞著離地 0.6 m 的房子中心看
  orbit.target.set(cx, 0.6, cz);
  orbit.maxDistance = Math.max(60, dist*1.6);
  updateBirdOffset();
  camera.updateProjectionMatrix();
  orbit.update();
  birdTouched = false;
  poke();
}
function setFov(f){ if(camera.fov!==f){ camera.fov=f; camera.updateProjectionMatrix(); } }

/* ---------- 碰撞 ---------- */
const RAD=0.22;
// ⚠️ 一律用「站著的眼睛高度」判斷：按住空白鍵只是把視線抬高，不能因此跨過沙發、餐桌、流理台
function hitsFurniture(x,z){
  for(const c of ctx.colliders){
    if(c.y1 < EYE-0.85) continue;            // 矮過膝的東西可跨過
    if(x>c.x0-RAD && x<c.x1+RAD && z>c.z0-RAD && z<c.z1+RAD) return true;
  }
  return false;
}
function blocked(x,z){ return !inside(x,z) || hitsFurniture(x,z); }

let roofOn=true, walkPose=null;
const roofBtn=$('m-roof');
function roofUI(){
  roofBtn.textContent = roofOn ? '🔲 屋頂：開' : '🔳 屋頂：關';
  roofBtn.classList.toggle('on', !roofOn);
  roofBtn.disabled = (mode!=='walk');
  roofBtn.title = mode!=='walk' ? '俯瞰時本來就看不到屋頂' : '走動時要不要天花板';
}
function inside(x,z,m=0.2){ return x>=BOUNDS.x0+m && x<=BOUNDS.x1-m && z>=BOUNDS.z0+m && z<=BOUNDS.z1-m; }
function setMode(m){
  if(photo.active) photo.exit();
  const was=mode;
  if(was==='walk' && m!=='walk') walkPose={ p:camera.position.clone(), q:camera.quaternion.clone(), room:lastRoomName };
  mode=m;
  const walk = (m==='walk');
  orbit.enabled = !walk;
  $('m-walk').classList.toggle('on',walk);
  $('m-bird').classList.toggle('on',!walk);
  labels.forEach(l=>l.visible=!walk);
  ctx.roof.visible = walk ? roofOn : false;
  $('jump').style.display = walk?'block':'none';
  $('room').style.display = walk?'block':'none';
  if(walk){
    camera.clearViewOffset(); birdRect = null;
    setFov(WALK_FOV);
    if(was!=='walk'){
      // 從俯瞰回來：站回離開前的位置與方向（沒有、或那個位置不在屋內就到客廳）——不然會停在半空中、屋子外面動不了
      if(walkPose && inside(walkPose.p.x, walkPose.p.z) && !hitsFurniture(walkPose.p.x, walkPose.p.z)){
        camera.position.set(walkPose.p.x, EYE, walkPose.p.z); camera.quaternion.copy(walkPose.q);
        lastRoomName = walkPose.room || lastRoomName;
      }else goRoom(R[lastRoomName] ? lastRoomName : '客廳');
    }
    scene.fog.near=30;
    startEl.style.display='flex';
    stickEl.style.display='none'; stickReset();
  }else{
    unlockPointer(); crossEl.style.display='none'; startEl.style.display='none';
    stickEl.style.display='none'; stickReset();
    scene.fog.near=60;
    setFov(BIRD_FOV);
    frameBird();
  }
  light.setMode(m);
  roofUI(); setHints();
  layoutPanels();
  poke();
}
$('m-walk').onclick=()=>{ foldHudOnce(); setMode('walk'); };
$('m-bird').onclick=()=>{ foldHudOnce(); setMode('bird'); };
roofBtn.onclick=()=>{ if(mode!=='walk') return; roofOn=!roofOn; ctx.roof.visible = roofOn; roofUI(); poke(); };

/* ---------- 時間滑桿：拉一下，看一整天的光線 ---------- */
const todEl=$('tod'), todV=$('todv');
function fmt(h){ const hh=Math.floor(h), mm=Math.round((h-hh)*60); return String(hh).padStart(2,'0')+':'+String(mm===60?0:mm).padStart(2,'0'); }
function applyTime(){ const h=+todEl.value; todV.textContent=fmt(h); light.setTime(h); if(photo.active) photo.exit(); poke(2000); }
todEl.addEventListener('input', applyTime);
todEl.addEventListener('change', ()=>todEl.blur());   // 拉完就放掉焦點：之後的方向鍵是走路，不是拉時間
applyTime();

/* ---------- 拍照級渲染 ---------- */
const photoBtn=$('m-photo');
if(photo.available){
  photoBtn.style.display='';
  photoBtn.onclick=()=>{ foldHudOnce(); if(photo.active) photo.exit(); else { unlockPointer(); photo.enter(); } photoBtn.classList.toggle('on', photo.active); };
}

/* ---------- 快速傳送（手機預設收成一顆小按鈕，點開才展開清單） ---------- */
const jumpEl=$('jump'), jumpList=jumpEl.querySelector('.jl'), jumpHead=jumpEl.querySelector('.jh');
function setJumpOpen(o){ jumpEl.classList.toggle('closed', !o); jumpHead.textContent = TOUCH ? (o ? '📍 快速傳送 ▴' : '📍 傳送 ▾') : '📍 快速傳送'; layoutPanels(); }
jumpHead.addEventListener('click', ()=>{ if(TOUCH) setJumpOpen(jumpEl.classList.contains('closed')); });
if(!TOUCH) jumpHead.style.cursor='default';
for(const k in R){
  if(R[k].teleport===false) continue;
  const b=document.createElement('button'); b.type='button'; b.textContent=k; b.dataset.go=k; jumpList.appendChild(b);
  b.onclick=()=>{
    foldHudOnce();
    if(mode!=='walk') setMode('walk');
    if(photo.active) photo.exit();
    goRoom(k);
    if(TOUCH){ startNoLock(); setJumpOpen(false); }
  };
}
setJumpOpen(!TOUCH);

/* ---------- 右側面板排版：快速傳送永遠排在模式按鈕下面，不會互蓋；太矮的畫面裡面可以捲 ---------- */
function layoutPanels(){
  const narrow = matchMedia('(max-width:760px)').matches;
  const b=$('modes').getBoundingClientRect();
  if(narrow){
    jumpEl.style.top='';
    const bottomGap = innerHeight - jumpEl.getBoundingClientRect().bottom;
    jumpEl.style.maxHeight = Math.max(60, innerHeight - b.bottom - 10 - Math.max(14, bottomGap)) + 'px';
  }else{
    const top = Math.round(b.bottom + 10);
    jumpEl.style.top = top + 'px';
    jumpEl.style.maxHeight = Math.max(60, innerHeight - top - 14) + 'px';
  }
}
addEventListener('resize', layoutPanels);
layoutPanels();

// 手機／平板：預設先給「俯瞰全屋」，比較好上手；左上的說明先收起來（只留標題和時間滑桿），才不會擋住房子
if(TOUCH){ hudFoldedOnce=true; setFold(true); setMode('bird'); }
else { setHints(); roofUI(); }

/* ---------- 房間偵測（站在門洞裡時不屬於任何房間 → 沿用剛剛那間，不會突然跳成「走道」） ---------- */
const roomEl=$('room');
function whichRoom(x,z){
  for(const k in R) for(const q of R[k].rects)
    if(x>=q[0]&&x<=q[2]&&z>=q[1]&&z<=q[3]) return k;
  return null;
}

/* ---------- 迴圈 ----------
   省電：畫面沒有任何變化（沒在走、沒在轉、沒拉時間、燈沒在淡入淡出、沒有東西在載入）超過 1.5 秒 → 每 0.4 秒才重畫一次
   （手機放著不動就不會一直全速跑 GPU）；拍照模式照常每格跑。?idle=0 關掉 */
const IDLE_OK = QS.get('idle') !== '0';
const clock=new THREE.Clock();
let shownRoom=null, elapsed=0, lastDraw=0;
const camSig = new Float64Array(20), camNow = new Float64Array(20);
function cameraChanged(){
  const p=camera.position, q=camera.quaternion, v=camera.view;
  camNow.set([p.x,p.y,p.z,q.x,q.y,q.z,q.w,camera.fov,camera.aspect, v&&v.enabled?v.offsetX:0, v&&v.enabled?v.offsetY:0, innerWidth, innerHeight]);
  let ch=false; for(let i=0;i<13;i++) if(Math.abs(camNow[i]-camSig[i])>1e-5){ ch=true; break; }
  if(ch) camSig.set(camNow);
  return ch;
}
function tick(){
  requestAnimationFrame(tick);
  const dt=Math.min(clock.getDelta(),0.05);
  elapsed+=dt;
  if(walking()){
    const px=camera.position.x, pz=camera.position.z;
    if(!inside(px,pz,0.05)) goRoom(R[lastRoomName] ? lastRoomName : '客廳');   // 保險：人不在屋內（不該發生）→ 送回房間
    const sp=(keys['ShiftLeft']||keys['ShiftRight']?3.4:1.65)*dt;
    let f=(keys['KeyW']||keys['ArrowUp']?1:0)-(keys['KeyS']||keys['ArrowDown']?1:0);
    let s=(keys['KeyD']||keys['ArrowRight']?1:0)-(keys['KeyA']||keys['ArrowLeft']?1:0);
    if(TOUCH){ f=Math.max(-1,Math.min(1,f+mobF)); s=Math.max(-1,Math.min(1,s+mobS)); }
    if(f||s){
      const p=camera.position.clone();
      const dir=new THREE.Vector3(); camera.getWorldDirection(dir); dir.y=0; dir.normalize();
      const right=new THREE.Vector3().crossVectors(dir,new THREE.Vector3(0,1,0)).normalize();
      const mv=dir.multiplyScalar(f*sp).add(right.multiplyScalar(s*sp));
      // 萬一已經卡在家具裡（例如從別的地方瞬移進來）：先讓人走出來，不要整個動不了
      const stuck=hitsFurniture(p.x,p.z);
      const ok=(x,z)=> stuck ? inside(x,z) : !blocked(x,z);
      if(ok(p.x+mv.x,p.z)) camera.position.x+=mv.x;
      if(ok(camera.position.x,p.z+mv.z)) camera.position.z+=mv.z;
    }
    const target = keys['Space']? 2.45 : EYE;
    camera.position.y += (target-camera.position.y)*Math.min(1,dt*7);
  }else if(mode!=='walk' && !photo.active){ orbit.update(); }
  if(mode==='walk'){
    const rm=whichRoom(camera.position.x,camera.position.z);
    if(rm) lastRoomName=rm;
    const show = rm || (shownRoom===null ? '' : shownRoom);
    if(show!==shownRoom){
      shownRoom=show;
      const r=R[show];
      roomEl.innerHTML = r ? show + '<small>' + r.area.toFixed(1)+' ㎡ ／ '+(r.area/3.305785).toFixed(1)+' 坪</small>' : '門口<small>通道</small>';
    }
  }
  for(const fn of ctx.tick) fn(dt, elapsed);
  const now=performance.now();
  if(cameraChanged() || f_keysDown() || stickId!==null) poke();
  const L=ctx.lighting;
  if(L && L.slots && L.slots.some(s=>s.want!==s.vl || (s.vl && s.f<1))) poke(500);
  if(photo.active){ photo.render(); lastDraw=now; }
  else if(!IDLE_OK || now<activeUntil || now-lastDraw>400){ light.render(); lastDraw=now; }
  updateLabels();
}
function f_keysDown(){ for(const k in keys) if(keys[k]) return true; return false; }

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
  light.resize(innerWidth,innerHeight);
  photo.resize(innerWidth,innerHeight);
  if(mode!=='walk') frameBird();   // 轉橫／轉直時重新取景
  poke();
});
addEventListener('visibilitychange', ()=>poke());

/* ---------- 顯示卡「掉線」（手機切 App、記憶體不夠）再回來：環境反射要重做，不然整個畫面暗四成 ---------- */
const toastEl=$('toast');
let toastT=0;
function toast(msg, ms=0){ toastEl.textContent=msg; toastEl.style.display = msg ? 'block' : 'none'; clearTimeout(toastT); if(msg && ms) toastT=setTimeout(()=>{ toastEl.style.display='none'; }, ms); }
renderer.domElement.addEventListener('webglcontextlost', ()=>{
  toast('畫面重新載入中…');
  photoBtn.style.display='none';
}, false);
renderer.domElement.addEventListener('webglcontextrestored', ()=>{
  try{
    const old = scene.environment;
    scene.environment = ctx.pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
    if(old && old.dispose) old.dispose();
  }catch(e){ console.warn('environment rebuild failed', e); }
  if(ctx.lighting && ctx.lighting.dirtyShadows) ctx.lighting.dirtyShadows();
  toast('');
  poke(3000);
}, false);

// 測試把手：切模式、瞬移、看向某處、設定時間
Object.assign(window.__a8, {
  setMode, frameBird, light, photo,
  goRoom,
  /** 正上方俯視的藍圖（正交投影）：北在上、東在右；回傳 {url, x0, z0, pxPerM}，像素 = (x−x0)*pxPerM */
  orthoTop({pxPerM=60, margin=0.6, y=20}={}){
    const b=BOUNDS, w=(b.x1-b.x0)+2*margin, d=(b.z1-b.z0)+2*margin;
    const cx=(b.x0+b.x1)/2, cz=(b.z0+b.z1)/2;
    const cam=new THREE.OrthographicCamera(-w/2,w/2,d/2,-d/2,0.1,y+5);
    cam.position.set(cx,y,cz); cam.up.set(0,0,-1); cam.lookAt(cx,0,cz); cam.updateMatrixWorld();
    const W2=Math.round(w*pxPerM), H2=Math.round(d*pxPerM);
    const roofV=ctx.roof&&ctx.roof.visible, fog=scene.fog; if(ctx.roof) ctx.roof.visible=false; scene.fog=null;
    labels.forEach(l=>l.visible=false);
    const size=renderer.getSize(new THREE.Vector2()), pr=renderer.getPixelRatio();
    renderer.setPixelRatio(1); renderer.setSize(W2,H2,false);
    renderer.render(scene,cam);
    const url=renderer.domElement.toDataURL('image/png');
    renderer.setPixelRatio(pr); renderer.setSize(size.x,size.y);
    if(ctx.roof) ctx.roof.visible=roofV; scene.fog=fog; labels.forEach(l=>l.visible=(mode!=='walk'));
    poke();
    return {url, x0:b.x0-margin, z0:b.z0-margin, pxPerM, width:W2, height:H2};
  },
  view(x,y,z,lx,ly,lz){ camera.position.set(x,y,z); camera.lookAt(lx,ly,lz); poke(); },
  hideStart(){ startEl.style.display='none'; poke(); },
  setTime(h){ todEl.value=h; applyTime(); },
  state(){ return { mode, walking:walking(), locked:pl.isLocked, lockFailed, pos:camera.position.toArray().map(v=>+v.toFixed(3)), room:shownRoom, touch:TOUCH, quality:ctx.QUALITY }; },
  poke,
});

tick();
if(loadEl) loadEl.style.display='none';
window.__ready = true;
