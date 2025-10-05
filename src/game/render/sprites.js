import { cellCenter } from '../utils.js';
let SPRITES = {
  seg: {
    player: { h: null, v: null },
    enemy: { h: null, v: null }
  },
  cycle: {
    player: {},
    enemy: {}
  }
};
let CELL, SCALE;
let CYCLE_LEN, CYCLE_THK;
let PLAYER_CORE, PLAYER_GLOW, ENEMY_CORE, ENEMY_GLOW, RIBBON_CORE, RIBBON_GLOW, ACCEL_CORE, ACCEL_GLOW;
const PLAYER_PULSE_CORE_HEX = '#009BB8';
const PLAYER_PULSE_GLOW_HEX = '#1FC4DB';
const SPRITE_PAD = new WeakMap();

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

function setSpritePad(surface, pad) {
  if (!surface) return;
  try {
    surface._pad = pad;
  } catch (_) {
    try { SPRITE_PAD.set(surface, pad); } catch (_) {}
  }
}

function getSpritePad(surface) {
  if (!surface) return 0;
  if (typeof surface._pad === 'number') {
    return surface._pad;
  }
  return SPRITE_PAD.get(surface) || 0;
}

function hasSegments(path) {
  if (!path) {
    return false;
  }
  if (Array.isArray(path)) {
    for (let i = 0; i < path.length; i++) {
      if (path[i]) {
        return true;
      }
    }
    return false;
  }
  return true;
}

function strokeSegments(ctx, path) {
  if (!path) {
    return;
  }
  if (Array.isArray(path)) {
    for (let i = 0; i < path.length; i++) {
      const seg = path[i];
      if (seg) {
        ctx.stroke(seg);
      }
    }
  } else {
    ctx.stroke(path);
  }
}

export function initSprites({
  SPRITES: _SPRITES,
  CELL: _CELL,
  SCALE: _SCALE,
  PLAYER_CORE: _PCORE,
  PLAYER_GLOW: _PGLOW,
  ENEMY_CORE: _ECORE,
  ENEMY_GLOW: _EGLOW,
  RIBBON_CORE: _RCORE,
  RIBBON_GLOW: _RGLOW,
  ACCEL_CORE: _ACORE,
  ACCEL_GLOW: _AGLOW,
  CYCLE_LEN: _CYCLE_LEN,
  CYCLE_THK: _CYCLE_THK
} = {}) {
  if (typeof _SPRITES === 'object' && _SPRITES) {
    SPRITES = _SPRITES;
  }
  CELL = _CELL;
  SCALE = _SCALE;
  PLAYER_CORE = _PCORE;
  PLAYER_GLOW = _PGLOW;
  ENEMY_CORE = _ECORE;
  ENEMY_GLOW = _EGLOW;
  RIBBON_CORE = _RCORE;
  RIBBON_GLOW = _RGLOW;
  ACCEL_CORE = _ACORE;
  ACCEL_GLOW = _AGLOW;
  CYCLE_LEN = _CYCLE_LEN;
  CYCLE_THK = _CYCLE_THK;
}
export function drawPulseTrailsFast(ctx, pulseP, pulseE, maskCanvas) {
  const hasPulseP = hasSegments(pulseP);
  const hasPulseE = hasSegments(pulseE);
  if (!hasPulseP && !hasPulseE) {
    return;
  }
  _pulseDashOffset = (_pulseDashOffset - 1.0) % 2048;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.setLineDash([CELL * 1.0, CELL * 2.0]);
  ctx.lineDashOffset = _pulseDashOffset;
  if (hasPulseP) {
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = PLAYER_PULSE_GLOW_HEX;
    ctx.lineWidth   = RIBBON_GLOW * 1.35;
    ctx.shadowBlur  = 12;
    ctx.shadowColor = PLAYER_PULSE_GLOW_HEX;
    strokeSegments(ctx, pulseP);
    ctx.shadowBlur  = 0;
  }
  if (hasPulseE) {
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = ENEMY_GLOW;
    ctx.lineWidth   = RIBBON_GLOW * 1.20;
    strokeSegments(ctx, pulseE);
  }
  ctx.setLineDash([CELL * 0.46, CELL * 2.2]);
  if (hasPulseP) {
    ctx.globalAlpha = 0.40;
    ctx.lineWidth   = RIBBON_GLOW * 1.00;
    ctx.strokeStyle = PLAYER_PULSE_GLOW_HEX;
    strokeSegments(ctx, pulseP);
  }
  if (hasPulseE) {
    ctx.globalAlpha = 0.35;
    ctx.lineWidth   = RIBBON_GLOW * 0.90;
    ctx.strokeStyle = ENEMY_GLOW;
    strokeSegments(ctx, pulseE);
  }
  ctx.setLineDash([CELL * 0.25, CELL * 1.2]);
  if (hasPulseP) {
    ctx.globalAlpha = 1.00;
    ctx.lineWidth   = Math.max(2, RIBBON_CORE * 2.40);
    ctx.strokeStyle = PLAYER_PULSE_CORE_HEX;
    strokeSegments(ctx, pulseP);
    ctx.save();
    ctx.globalAlpha = 0.60;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    strokeSegments(ctx, pulseP);
    ctx.restore();
  }
  if (hasPulseE) {
    ctx.globalAlpha = 0.95;
    ctx.lineWidth   = Math.max(2, RIBBON_CORE * 2.20);
    ctx.strokeStyle = ENEMY_CORE;
    strokeSegments(ctx, pulseE);
  }
  ctx.restore();
  if (maskCanvas && maskCanvas !== ctx.canvas) {
    try {
      const srcW = maskCanvas.width || (maskCanvas.bitmapWidth || 0);
      const srcH = maskCanvas.height || (maskCanvas.bitmapHeight || 0);
      const dst = ctx.canvas || {};
      const dstW = dst.width || srcW;
      const dstH = dst.height || srcH;
      if (srcW && srcH && dstW && dstH) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(maskCanvas, 0, 0, srcW, srcH, 0, 0, dstW, dstH);
        ctx.restore();
      }
    } catch (_) {}
  }
}
let _pulseDashOffset = 0;
export function resetPulseDashOffset() {
  _pulseDashOffset = 0;
}
export function drawTrailSegment(ctx, x0, y0, x1, y1, core, glow) {
  const [sx, sy] = cellCenter(x0, y0, CELL);
  const [ex, ey] = cellCenter(x1, y1, CELL);
  const isH = (sy === ey);
  const who = (core === PLAYER_CORE ? 'player' : 'enemy');
  const sprite = SPRITES.seg[who][isH ? 'h' : 'v'];
  if (!sprite) return;
  if (isH) {
    const pad = getSpritePad(sprite);
    const left = Math.min(sx, ex) - pad;
    ctx.drawImage(
      sprite,
      Math.floor(left) + 0.5,
      Math.floor(sy - sprite.height / 2) + 0.5
    );
  } else {
    const pad = getSpritePad(sprite);
    const top = Math.min(sy, ey) - pad;
    ctx.drawImage(
      sprite,
      Math.floor(sx - sprite.width / 2) + 0.5,
      Math.floor(top) + 0.5
    );
  }
}
function makeSegmentBitmap(width, height, orient, CELL, core, glow){
        const len = CELL;
        const pad = Math.max(8, Math.ceil(10 * 1.25)); 
        const w = (orient==='h') ? (len + pad*2) : Math.max(6, Math.ceil(10*2 + 3*2 + 2));
        const h = (orient==='v') ? (len + pad*2) : Math.max(6, Math.ceil(10*2 + 3*2 + 2));
        const tmp = new OffscreenCanvas(w, h);
        const tctx = tmp.getContext('2d');
        const midX = w/2, midY = h/2;
        const x1 = (orient==='h') ? (pad) : midX;
        const y1 = (orient==='h') ? midY : (pad);
        const x2 = (orient==='h') ? (w-pad) : midX;
        const y2 = (orient==='h') ? midY : (h-pad);
        const glowCv = new OffscreenCanvas(w, h);
        const glowCtx = glowCv.getContext('2d');
        try { glowCtx.filter = 'blur(6px)'; } catch(e){}
        drawGlowLineTo(glowCtx, x1,y1, x2,y2, glow, core, 2, 14);
        try { glowCtx.filter = 'none'; } catch(e){}
        const cv = new OffscreenCanvas(w, h);
        const c = cv.getContext('2d');
        try { c.globalCompositeOperation = 'lighter'; } catch(e){}
        c.drawImage(glowCv, 0, 0);
        c.save();
        c.lineCap = 'round';
        c.strokeStyle = core;
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.stroke();
        c.restore();
        try { return cv.transferToImageBitmap(); } catch(e){
          try { return createImageBitmap(cv); } catch(_){ return null; }
        }
      }
function neonStroke(c, x1, y1, x2, y2, coreColor, glowColor, coreW, glowW){
  try{
    c.save();
    c.lineCap = 'round';
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = glowColor;
    c.shadowColor = glowColor;
    c.shadowBlur = glowW;
    c.globalAlpha = 0.18;
    c.lineWidth = glowW*1.8;
    c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.stroke();
    c.shadowBlur = glowW*0.6;
    c.globalAlpha = 0.35;
    c.lineWidth = glowW*0.9;
    c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.stroke();
    c.shadowBlur = 0;
    c.globalAlpha = 1;
    c.strokeStyle = coreColor;
    c.lineWidth = coreW;
    c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.stroke();
    c.restore();
  }catch(_e){}
}
function makeSegmentSprite(core, glow, orient ){
         const len = CELL;
         const pad = Math.max(8, Math.ceil(RIBBON_GLOW * 1.25));
         const w = (orient==='h') ? (len + pad*2) : Math.max(6, Math.ceil(RIBBON_GLOW*2 + RIBBON_CORE*2 + 2));
         const h = (orient==='v') ? (len + pad*2) : Math.max(6, Math.ceil(RIBBON_GLOW*2 + RIBBON_CORE*2 + 2));
         const cv = createSurface(w, h);
         if (!cv) return null;
         cv.width=w; cv.height=h;
         const c = cv.getContext('2d');
         c.translate(0.5, 0.5);
         if(orient==='h'){
           const y = Math.floor(h/2);
           neonStroke(c, pad, y, w - pad, y, core, glow, RIBBON_CORE, RIBBON_GLOW);
         } else {
           const x = Math.floor(w/2);
           neonStroke(c, x, pad, x, h - pad, core, glow, RIBBON_CORE, RIBBON_GLOW);
         }
         setSpritePad(cv, pad);
         return cv;
       }
function hexA(hex,a){
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if(!m) return hex; const r=parseInt(m[1],16), g=parseInt(m[2],16), b=parseInt(m[3],16);
  return `rgba(${r},${g},${b},${a})`;
}
function pathCapsule(c, x, y, w, h, r){
  c.beginPath();
  c.moveTo(x+r, y);
  c.lineTo(x+w-r, y);
  c.arcTo(x+w, y,   x+w, y+r, r);
  c.lineTo(x+w, y+h-r);
  c.arcTo(x+w, y+h, x+w-r, y+h, r);
  c.lineTo(x+r, y+h);
  c.arcTo(x, y+h,   x, y+h-r, r);
  c.lineTo(x, y+r);
  c.arcTo(x, y,     x+r, y, r);
}
function makeCycleBitmap(dir, core, glow, CELL){
        const W = Math.max(24, CELL*2.0), H = Math.max(16, CELL*1.2);
        const cv = new OffscreenCanvas(W, H);
        const c = cv.getContext('2d');
        c.save();
        const angle = (dir==='right') ? 0 : (dir==='down') ? Math.PI/2 : (dir==='left') ? Math.PI : -Math.PI/2;
        c.translate(W/2, H/2);
        c.rotate(angle);
        c.translate(-W/2, -H/2);
        try { c.filter = 'blur(4px)'; } catch(e){}
        c.fillStyle = hexA(glow, 0.12);
        c.strokeStyle = glow;
        c.lineWidth = 10;
        c.lineCap = 'round';
        pathCapsule(c, 2, 2, W-4, H-4, Math.min(H/2, 10));
        c.fill(); c.stroke();
        try { c.filter = 'none'; } catch(e){}
        c.fillStyle = hexA(core, 0.8);
        c.strokeStyle = core;
        c.lineWidth = 2;
        pathCapsule(c, 4, 4, W-8, H-8, Math.min(H/2-2, 9));
        c.fill(); c.stroke();
        c.restore();
        try { return cv.transferToImageBitmap(); } catch(e){
          try { return createImageBitmap(cv); } catch(_){ return null; }
        }
      }
function neonCapsule(c, x, y, w, h, core, glow){
         const r = Math.min(h/2, 10);
         c.save();
         c.fillStyle = hexA(glow, 0.05);
         c.shadowColor = glow;
         c.shadowBlur = 14;
         pathCapsule(c, x, y, w, h, r); c.fill();
         c.shadowBlur = 0;
         const grd = c.createLinearGradient(x, y, x+w, y);
         grd.addColorStop(0.0, hexA(core, .30));
         grd.addColorStop(0.5, hexA('#ffffff', .42));
         grd.addColorStop(1.0, hexA(core, .30));
         c.fillStyle = grd;
         pathCapsule(c, x, y, w, h, r); c.fill();
         c.lineWidth = 2;
         c.strokeStyle = hexA(glow, .45);
         pathCapsule(c, x, y, w, h, r); c.stroke();
         const prevComp = c.globalCompositeOperation;
         c.globalCompositeOperation = 'source-over';
         c.lineWidth = 1.4;
         c.strokeStyle = 'rgba(0,0,0,0.55)';
         pathCapsule(c, x, y, w, h, r); c.stroke();
         c.globalCompositeOperation = prevComp;
         c.restore();
       }
function drawHaloRing(c, x, y, r, ringWidth, core, glow){
         c.save();
         c.translate(x, y);
         c.globalCompositeOperation = 'lighter';
         c.strokeStyle = glow;
         c.shadowColor = glow;
         c.shadowBlur = r * 0.9;
         c.globalAlpha = 0.22;
         c.lineWidth = r * 1.5;
         c.beginPath(); c.arc(0,0, r, 0, Math.PI*2); c.stroke();
         c.shadowBlur = r * 0.45;
         c.globalAlpha = 0.40;
         c.lineWidth = r * 0.85;
         c.beginPath(); c.arc(0,0, r, 0, Math.PI*2); c.stroke();
         c.shadowBlur = 0;
         c.globalAlpha = 1;
         c.strokeStyle = core;
         c.lineWidth = ringWidth;
         c.beginPath(); c.arc(0,0, r, 0, Math.PI*2); c.stroke();
         const prev = c.globalCompositeOperation;
         c.globalCompositeOperation = 'source-over';
         c.lineWidth = Math.max(1, ringWidth * 0.28);
         c.strokeStyle = 'rgba(0,0,0,0.55)';
         c.beginPath(); c.arc(0,0, r, 0, Math.PI*2); c.stroke();
         c.globalCompositeOperation = prev;
         c.restore();
       }
function makeCycleSprite(dir, core, glow){
         const w = Math.ceil(CELL*6), h = Math.ceil(CELL*6);
         const cv = createSurface(w, h);
         if (!cv) return null;
         cv.width = w; cv.height = h;
         const c = cv.getContext('2d');
         c.translate(w/2, h/2);
         const rot = ({up:-Math.PI/2, right:0, down:Math.PI/2, left:Math.PI})[dir];
         c.rotate(rot);
         const bodyLen = CYCLE_LEN;
         const bodyThk = CYCLE_THK;
         const frontW  = bodyThk * 1.05;
         const tailW   = bodyThk * 0.62;
         const haloR   = bodyThk * 0.90;
         const haloThk = Math.max(3, bodyThk * 0.30);
         const haloX   = bodyLen * 0.36;
         neonCapsule(c, -bodyLen*0.15, -frontW/2, bodyLen*0.55, frontW, core, glow);
         neonCapsule(c, -bodyLen*0.58, -tailW/2,  bodyLen*0.46, tailW,  core, glow);
         drawHaloRing(c, haloX, 0, haloR, haloThk, core, glow);
         c.save();
         c.translate(haloX, 0);
         const rg = c.createRadialGradient(0,0,0, 0,0, haloR*0.33);
         rg.addColorStop(0.0, '#ffffffd9');
         rg.addColorStop(1.0, hexA(core, 0.12));
         c.fillStyle = rg;
         c.beginPath(); c.arc(0,0, haloR*0.33, 0, Math.PI*2); c.fill();
         c.restore();
         return cv;
       }
export function rebuildTrailSprites(){
         SPRITES.seg.player.h = makeSegmentSprite(PLAYER_CORE, PLAYER_GLOW, 'h');
         SPRITES.seg.player.v = makeSegmentSprite(PLAYER_CORE, PLAYER_GLOW, 'v');
         SPRITES.seg.enemy.h  = makeSegmentSprite(ENEMY_CORE,  ENEMY_GLOW,  'h');
         SPRITES.seg.enemy.v  = makeSegmentSprite(ENEMY_CORE,  ENEMY_GLOW,  'v');
       }
export function buildCycleSprites(){
         for(const who of ['player','enemy']){
           const core = (who==='player') ? PLAYER_CORE : ENEMY_CORE;
           const glow = (who==='player') ? PLAYER_GLOW : ENEMY_GLOW;
           for(const d of ['up','right','down','left']){
             SPRITES.cycle[who][d] = makeCycleSprite(d, core, glow);
           }
         }
       }
export function rebuildCycleSprites(){ return buildCycleSprites(); }
export function drawCycle(ctx, col, row, dir, core, glow, role) {
  const [x, y] = cellCenter(col, row, CELL);
  let who;
  if (role === 'enemy') {
    who = 'enemy';
  } else if (role === 'player') {
    who = 'player';
  } else {
    who = (core === PLAYER_CORE ? 'player' : 'enemy');
  }
  const sp = SPRITES.cycle?.[who]?.[dir];
  if (!sp) return;
  ctx.drawImage(
    sp,
    Math.floor(x - sp.width / 2) + 0.5,
    Math.floor(y - sp.height / 2) + 0.5
  );
}
