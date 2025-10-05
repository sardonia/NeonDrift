let _board = null;
let _wallsGlow = null;
let _wallFrames = null;
let CELL, WALL_CORE, WALL_GLOW, neonStroke;
let board, wallsGlow;
let SCALE;
const WALLS = { frames: [], idx: 0 };

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
function drawNeonWallsTo(c, glowW){
         const x1=CELL/2, y1=CELL/2, x2=board.width-CELL/2, y2=board.height-CELL/2;
         const coreW = 2;
         neonStroke(c, x1,y1, x2,y1, WALL_CORE, WALL_GLOW, coreW, glowW);
         neonStroke(c, x1,y2, x2,y2, WALL_CORE, WALL_GLOW, coreW, glowW);
         neonStroke(c, x1,y1, x1,y2, WALL_CORE, WALL_GLOW, coreW, glowW);
         neonStroke(c, x2,y1, x2,y2, WALL_CORE, WALL_GLOW, coreW, glowW);
       }
function drawGlowLineTo(c, x1,y1, x2,y2, glowColor, coreColor, coreW, glowW){
        c.save();
        try { c.globalCompositeOperation = 'lighter'; } catch(e){}
        c.lineCap = 'round';
        c.strokeStyle = glowColor;
        c.globalAlpha = 1.0;
        c.lineWidth = glowW;
        c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.stroke();
        c.globalAlpha = 1.0;
        c.strokeStyle = coreColor;
        c.lineWidth = coreW;
        c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.stroke();
        c.restore();
      }
function drawNeonWalls(t){
  const pulse = 0.5 + 0.5 * Math.sin(t * 2*Math.PI * 0.75);
  const glowW = (14 + pulse * 12);
  drawNeonWallsTo(board, glowW);
}
function buildWallFrames(N=24){
         const MARGIN = 40; 
         WALLS.frames.length = 0;
         for(let i=0;i<N;i++){
           const t = i/N;
           const pulse = 0.5 + 0.5 * Math.sin(t * 2*Math.PI * 0.75);
           const glowW = (14 + pulse * 12);
           const blurPx = (12 + 10 * pulse) * SCALE;
           const tmp = createSurface(
             Math.max(1, Math.floor((board.width + MARGIN*2) * SCALE)),
             Math.max(1, Math.floor((board.height + MARGIN*2) * SCALE))
           );
           if (!tmp) continue;
           const tc = tmp.getContext('2d');
           tc.setTransform(SCALE, 0, 0, SCALE, MARGIN * SCALE, MARGIN * SCALE);
           tc.globalCompositeOperation = 'lighter';
           tc.lineCap = 'round';
           tc.strokeStyle = WALL_GLOW;
           tc.globalAlpha = 1.0;
           tc.lineWidth = glowW;
           const x1=CELL/2, y1=CELL/2, x2=board.width-CELL/2, y2=board.height-CELL/2;
           tc.beginPath(); tc.moveTo(x1,y1); tc.lineTo(x2,y1); tc.stroke();
           tc.beginPath(); tc.moveTo(x1,y2); tc.lineTo(x2,y2); tc.stroke();
           tc.beginPath(); tc.moveTo(x1,y1); tc.lineTo(x1,y2); tc.stroke();
           tc.beginPath(); tc.moveTo(x2,y1); tc.lineTo(x2,y2); tc.stroke();
           const cv = createSurface(tmp.width, tmp.height);
           if (!cv) continue;
           const c = cv.getContext('2d');
           c.globalCompositeOperation = 'lighter';
           c.globalAlpha = 0.5;
           c.filter = `blur(${blurPx}px)`;
           c.drawImage(tmp, 0, 0);
           c.filter = 'none';
           WALLS.frames.push(cv);
         }
         WALLS.idx = 0;
         WALLS._phase = 0;
         WALLS._ts = performance.now();
         if (wallsGlow){
           wallsGlow.width  = board.width + MARGIN*2;
           wallsGlow.height = board.height + MARGIN*2;
           wallsGlow.style.inset = `-${MARGIN}px`;
         }
  try {
    if (window.createImageBitmap) {
      Promise.all(WALLS.frames.map(cv => { try { return createImageBitmap(cv); } catch(e){ return cv; } }))
        .then(bmps => { if (bmps && bmps.length===WALLS.frames.length) WALLS.bitmaps = bmps; })
        .catch(()=>{});
    }
  } catch(e){}
}
export function initWalls({ board: _b, wallsGlow: _wg, CELL: _CELL, WALL_CORE: _WCORE, WALL_GLOW: _WGLOW, neonStroke: _NS, SCALE: _SCALE } = {}) {
  _board = _b; _wallsGlow = _wg;
  board = _b; wallsGlow = _wg;
  CELL = (typeof _CELL !== 'undefined') ? _CELL : CELL;
  WALL_CORE = (typeof _WCORE !== 'undefined') ? _WCORE : WALL_CORE;
  WALL_GLOW = (typeof _WGLOW !== 'undefined') ? _WGLOW : WALL_GLOW;
  neonStroke = (typeof _NS !== 'undefined') ? _NS : neonStroke;
  SCALE = (typeof _SCALE !== 'undefined') ? _SCALE : SCALE;
  _board = _b; _wallsGlow = _wg;
  board = _b; wallsGlow = _wg;
  CELL = (typeof _CELL !== 'undefined') ? _CELL : CELL;
  WALL_CORE = (typeof _WCORE !== 'undefined') ? _WCORE : WALL_CORE;
  WALL_GLOW = (typeof _WGLOW !== 'undefined') ? _WGLOW : WALL_GLOW;
  neonStroke = (typeof _NS !== 'undefined') ? _NS : neonStroke;
  _board = board;
  _wallsGlow = wallsGlow;
}
export function drawWalls({ t }) {
  return drawNeonWalls(t);
}
export function rebuildWallFrames(n) {
  return buildWallFrames(n);
}
export function setWallFrames(frames) {
  try {
    if (!frames || !Array.isArray(frames) || !frames.length) return;
    WALLS.frames = frames;
    WALLS.bitmaps = frames;
    WALLS.idx = 0;
  } catch (_e) {
  }
}
export { drawGlowLineTo, drawNeonWallsTo }
export function getWallFrameCache() {
  return WALLS;
}
