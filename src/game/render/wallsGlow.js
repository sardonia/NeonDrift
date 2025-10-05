import { getWallFrameCache } from './walls.js';
let __impl = { draw: null, state: {} };
export function initWallsGlow(bindings = {}){
  __impl = { ...__impl, ...bindings };
}
export function drawWallsGlow(t){
  const H = __impl || {};
  const wgl = H.ctx;
  const canvas = H.canvas;
  const C = H.consts || {};
  const WALLS = (C && C.WALLS) || getWallFrameCache();
  if (!wgl || !canvas || !WALLS || !WALLS.frames || !WALLS.frames.length) return;
  try {
    if (WALLS._ts == null) WALLS._ts = performance.now();
    if (WALLS._phase == null) WALLS._phase = 0;
    const now = performance.now();
    const dt = Math.min(0.25, (now - WALLS._ts) / 1000);
    WALLS._ts = now;
    const HZ = 0.12; 
    WALLS._phase = (WALLS._phase + HZ * dt * WALLS.frames.length) % WALLS.frames.length;
    WALLS.idx = Math.floor(WALLS._phase);
    const f = WALLS.frames[WALLS.idx];
    wgl.save();
    (function(){
      const len = WALLS.frames.length;
      const fBM = (WALLS.bitmaps && WALLS.bitmaps.length===len) ? WALLS.bitmaps[WALLS.idx] : null;
      const src = fBM || f;
      const prev = wgl.globalCompositeOperation;
      wgl.globalCompositeOperation = 'copy';
      try {
        wgl.drawImage(src, 0, 0, (src.width||src.bitmapWidth||canvas.width), (src.height||src.bitmapHeight||canvas.height),
                          0, 0, canvas.width, canvas.height);
      } catch(e) {
        try { wgl.globalCompositeOperation = 'source-over'; wgl.drawImage(src, 0, 0); } catch(_){}
      }
      wgl.globalCompositeOperation = prev;
    })();
    wgl.restore();
  } catch(_e){}
}
export const WG = {
  get state(){ return __impl.state || {}; }
};
