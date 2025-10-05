let __impl = { draw: null, state: {} };

function createSurface(width, height) {
  if (typeof OffscreenCanvas === 'function') {
    try {
      const w = Math.max(1, Number(width) || 1);
      const h = Math.max(1, Number(height) || 1);
      return new OffscreenCanvas(w, h);
    } catch (_) {}
  }
  if (typeof document !== 'undefined' && document && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    if (typeof width === 'number') canvas.width = width;
    if (typeof height === 'number') canvas.height = height;
    return canvas;
  }
  return null;
}
export function initBackground(bindings = {}){
  __impl = { ...__impl, ...bindings };
  try {
    computeBgCache();
  } catch (_) {}
}
export function drawBackground(){
  if (__impl.draw) return __impl.draw();
}
export const BG = {
  get state(){ return __impl.state || {}; }
};
export function drawBackgroundImpl(){
  const H = __impl || {};
  const ctx = H.ctx;
  const board = H.canvas || H.board;
  let cache = undefined;
  try {
    if (ctx && board && typeof ensureBgCacheBG==='function' && typeof getBgCacheBG==='function') {
      ensureBgCacheBG();
      cache = getBgCacheBG();
    }
  } catch(_e){}
  if (!ctx || !board) return;
  if (cache) {
    try {
      ctx.clearRect(0,0,board.width,board.height);
      ctx.drawImage(cache, 0, 0);
    } catch(_e){}
  } else {
    try { if (typeof window !== 'undefined' && typeof window.__LOCAL_BG === 'function') return window.__LOCAL_BG(); } catch(_e){};
    return;
  }
  try {
    if (typeof window !== 'undefined') {
      } } catch(_e){} }
let __bgCacheCanvas = null;
function computeBgCache() {
  if (__bgCacheCanvas) return;
  try {
    const board = (__impl && (__impl.canvas || __impl.board)) || null;
    const C = (__impl && __impl.consts) || {};
    const CELL = C.CELL;
    const COLS = C.COLS;
    const ROWS = C.ROWS;
    if (!board || typeof CELL === 'undefined' || typeof COLS === 'undefined' || typeof ROWS === 'undefined') {
      return;
    }
    const cv = createSurface(board.width, board.height);
    if (!cv) {
      return;
    }
    cv.width = board.width;
    cv.height = board.height;
    const bc = cv.getContext('2d');
    bc.globalAlpha = 0.11;
    bc.fillStyle = '#d9e7ff';
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cx = x * CELL + CELL / 2;
        const cy = y * CELL + CELL / 2;
        bc.fillRect(cx - 1, cy - 1, 2, 2);
      }
    }
    bc.globalAlpha = 1.0;
    try {
      bc.save();
      const x1 = CELL / 2;
      const y1 = CELL / 2;
      const x2 = board.width - CELL / 2;
      const y2 = board.height - CELL / 2;
      bc.strokeStyle = '#a8caff';
      bc.globalAlpha = 0.06;
      bc.lineWidth = 1;
      const xStart = CELL / 2;
      const yStart = CELL / 2;
      for (let j = 1; j < COLS; j++) {
        const x = xStart + j * CELL;
        bc.beginPath();
        bc.moveTo(x, y1);
        bc.lineTo(x, y2);
        bc.stroke();
      }
      for (let i = 1; i < ROWS; i++) {
        const y = yStart + i * CELL;
        bc.beginPath();
        bc.moveTo(x1, y);
        bc.lineTo(x2, y);
        bc.stroke();
      }
      bc.restore();
    } catch (_) {
    }
    __bgCacheCanvas = cv;
    if (__impl && __impl.state) {
      try { __impl.state.bgCache = __bgCacheCanvas; } catch (_) {}
    }
  } catch (_) {
  }
}
export function ensureBgCacheBG(){
  if (__bgCacheCanvas) return __bgCacheCanvas;
  try {
    computeBgCache();
  } catch (_) {}
  if (__bgCacheCanvas) return __bgCacheCanvas;
  try {
    const H = __impl || {};
    const helpers = H.helpers || {};
    if (typeof helpers.ensureBgCache === 'function') {
      try { helpers.ensureBgCache(); } catch (_) {}
    }
    if (typeof helpers.getBgCache === 'function') {
      try {
        const cache = helpers.getBgCache();
        if (cache) {
          __bgCacheCanvas = cache;
          if (__impl && __impl.state) __impl.state.bgCache = __bgCacheCanvas;
          return __bgCacheCanvas;
        }
      } catch (_) {}
    }
  } catch (_) {}
  return __bgCacheCanvas;
}
export function getBgCacheBG(){
  return __bgCacheCanvas || ((__impl && __impl.state) ? __impl.state.bgCache : undefined);
}
