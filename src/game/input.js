export const keysHeld = { up:false, right:false, down:false, left:false };
let _bound = false;
let _onDown = null;
let _onUp = null;
let _eventTarget = null;
let tronReady = false;
let hasStarted = false;
function dirFromEvent(e){
  const byKey = {
    ArrowUp:'up', ArrowRight:'right', ArrowDown:'down', ArrowLeft:'left',
    w:'up', d:'right', s:'down', a:'left', W:'up', D:'right', S:'down', A:'left'
  };
  const byCode = {
    ArrowUp:'up', ArrowRight:'right', ArrowDown:'down', ArrowLeft:'left',
    KeyW:'up', KeyD:'right', KeyS:'down', KeyA:'left',
    Numpad8:'up', Numpad6:'right', Numpad2:'down', Numpad4:'left'
  };
  if (byKey[e.key] ) return byKey[e.key];
  if (byCode[e.code]) return byCode[e.code];
  return null;
}
export function bindInput(targetDocument, api){
  if (_bound) return;
  const doc = targetDocument || (typeof document !== 'undefined' ? document : undefined);
  let eventTarget = null;
  if (doc && typeof doc.addEventListener === 'function') {
    eventTarget = doc;
  } else if (doc && doc.defaultView && typeof doc.defaultView.addEventListener === 'function') {
    eventTarget = doc.defaultView;
  }
  _onDown = async function onKeyDown(e){
    try{
      if (e && e.repeat) {
        try { e.preventDefault(); } catch (_) {}
        return;
      }
      const d = dirFromEvent(e);
      if (e.code === 'Space'){
        if (api.levelTransitionPending){ api.proceedToNextLevel(); e.preventDefault(); return; }
        if (api.countdownActive){ e.preventDefault(); return; }
        if (!tronReady) {
          tronReady = true;
        }
        if (api.ensureAudioUnlocked) { try { await api.ensureAudioUnlocked(); } catch {} }
            if (!api.running) {
          try {
            if (api.gameEnded) {
              api.startRound({ resetLevel1: true });
              hasStarted = true;
            } else if ((typeof api.tick === 'number' && api.tick > 0) || hasStarted) {
              api.startGame();
            } else {
              api.startRound({ resetLevel1: false });
              hasStarted = true;
            }
            if (typeof api.clearInitialStart === 'function') {
              api.clearInitialStart();
            }
          } catch (_) {}
        } else {
          try { api.pauseGame(); } catch (_) {}
        }
        e.preventDefault();
        return;
      }
      if (d){
        if (api.levelTransitionPending){
          e.preventDefault();
          return;
        }
        if (api.countdownActive){ e.preventDefault(); return; }
        if (!tronReady) {
          tronReady = true;
        }
        if (api.ensureAudioUnlocked) { try { await api.ensureAudioUnlocked(); } catch {} }
        keysHeld[d] = true;
        const p = api.player;
        if (p && !api.isOpposite(d, p.dir)) p.nextDir = d;
        e.preventDefault();
        return;
      }
    }catch(_e){}
  };
  _onUp = function onKeyUp(e){
    const d = dirFromEvent(e);
    if(d){ keysHeld[d] = false; e.preventDefault(); }
  };
  if (eventTarget && typeof eventTarget.addEventListener === 'function') {
    eventTarget.addEventListener('keydown', _onDown, { passive: false });
    eventTarget.addEventListener('keyup', _onUp, { passive: false });
    _eventTarget = eventTarget;
    _bound = true;
  }
}
export function unbindInput(targetDocument){
  if (!_bound) return;
  let eventTarget = _eventTarget;
  if (!eventTarget) {
    const doc = targetDocument || (typeof document !== 'undefined' ? document : undefined);
    if (doc && typeof doc.removeEventListener === 'function') {
      eventTarget = doc;
    } else if (doc && doc.defaultView && typeof doc.defaultView.removeEventListener === 'function') {
      eventTarget = doc.defaultView;
    }
  }
  try {
    if (eventTarget && typeof eventTarget.removeEventListener === 'function') {
      eventTarget.removeEventListener('keydown', _onDown);
      eventTarget.removeEventListener('keyup', _onUp);
    }
  } catch (_) {}
  _onDown = _onUp = null;
  _eventTarget = null;
  _bound = false;
}
