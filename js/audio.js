/* ============================================================
   audio.js — 🔊 聲音總開關（預設關）
   為什麼預設關：朋友可能在辦公室、捷運上打開；而且 iPhone／Android 規定「使用者點一下」之後網頁才能出聲 →
   右上角的 🔊 按鈕本身就是那一下。聲音全部由程式現場合成（Web Audio），不下載任何音檔、沒有版權問題。

   給主題房用的介面：
     ctx.audio.register((ac, out) => { … })   第一次打開聲音時呼叫一次：在 ac（AudioContext）上接好自己的聲音，最後接到 out
                                                （之後再開關只調總音量，不會重建）
     ctx.audio.on                               目前開著嗎（關著的時候主題房不要排程音符，省電）
     ctx.audio.ac                               AudioContext（還沒開過聲音＝null）
   ============================================================ */
export default function setupAudio(ctx){
  const btn = document.getElementById('m-sound');
  let ac = null, master = null, on = false;
  const inits = [];

  function ensure(){
    if(ac) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return false;
    // iPhone 的「靜音開關」預設也會讓網頁靜音；iOS 17 起可以宣告成「播放」類型（跟看影片一樣）
    try{ if(navigator.audioSession) navigator.audioSession.type = 'playback'; }catch(e){}
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0;
    // 輕輕壓一下峰值：幾個主題的聲音同時響起（例如跨房間走動）也不會爆音
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = .005; comp.release.value = .25;
    master.connect(comp); comp.connect(ac.destination);
    for(const f of inits){ try{ f(ac, master); }catch(e){ console.warn('audio init failed', e); } }
    return true;
  }
  function paint(){
    if(!btn) return;
    btn.textContent = on ? '🔊 聲音：開' : '🔇 聲音：關';
    btn.classList.toggle('on', on);
  }
  function set(v){
    if(v && !ensure()){ on = false; paint(); return; }
    on = v;
    if(ac){
      if(on && ac.state !== 'running') ac.resume().catch(() => {});
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, .12);
    }
    paint();
    if(ctx.poke) ctx.poke(500);
  }
  if(btn){ btn.onclick = e => { e.stopPropagation(); set(!on); btn.blur(); }; paint(); }
  // 切到別的 App／分頁就暫停，回來再接著放（手機省電、也不會在背景一直出聲）
  document.addEventListener('visibilitychange', () => {
    if(!ac) return;
    if(document.hidden) ac.suspend().catch(() => {});
    else if(on) ac.resume().catch(() => {});
  });

  ctx.audio = {
    get on(){ return on; },
    get ac(){ return ac; },
    register(f){ inits.push(f); if(ac){ try{ f(ac, master); }catch(e){ console.warn('audio init failed', e); } } },
    set,
  };
}
