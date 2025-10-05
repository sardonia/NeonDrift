import { pulseAABB, unionAABB } from '../utils.js';
import { RIBBON_GLOW, CELL } from '../Constants.js';
import augState from '../debug/augState.js';
export function clearFXSmart(ctx, fxCanvas, trailP, trailE, span) {
  try {
    if (!ctx || !fxCanvas) {
      return;
    }

    const lenP = Array.isArray(trailP) ? trailP.length : 0;
    const lenE = Array.isArray(trailE) ? trailE.length : 0;
    if (lenP <= 1 && lenE <= 1) {
      const width = typeof fxCanvas.width === 'number' ? fxCanvas.width : 0;
      const height = typeof fxCanvas.height === 'number' ? fxCanvas.height : 0;
      if (width > 0 && height > 0) {
        try {
          if (augState && augState.render) {
            augState.render.fxArea = (width | 0) * (height | 0);
          }
        } catch (_e) {}
        ctx.clearRect(0, 0, width, height);
        return;
      }
    }

    const glow = typeof RIBBON_GLOW === 'number' && RIBBON_GLOW > 0 ? RIBBON_GLOW : 0;
    const cell = typeof CELL === 'number' && CELL > 0 ? CELL : 1;
    const safeSpan = Number.isFinite(span) ? span : 0;
    const a = pulseAABB(trailP, safeSpan, glow, cell);
    const b = pulseAABB(trailE, safeSpan, glow, cell);
    const u = unionAABB(a, b);
    if (u) {
      try {
        if (augState && augState.render) {
          augState.render.fxArea = (u[2] | 0) * (u[3] | 0);
        }
      } catch (_e) {}
      ctx.clearRect(u[0], u[1], u[2], u[3]);
    } else {
      ctx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    }
  } catch (e) {
    try {
      ctx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    } catch (_e) {}
  }
}
import { PATHS } from './paths.js';
const __CHEVRON = (() => {
  try {
    const ch = new Path2D();
    ch.moveTo(-0.50, -1.00);
    ch.lineTo( 0.02,  0.00);
    ch.lineTo(-0.50,  1.00);
    ch.closePath();
    return ch;
  } catch (_e) { return null; }
})();
export function drawAccelGlyph(c, x, y, t, core, glow){
  const CELL = (PATHS && PATHS.consts && PATHS.consts.CELL) ? PATHS.consts.CELL : (typeof CELL !== 'undefined' ? CELL : 32);
  c.save();
  c.translate(x, y);
  c.rotate(Math.sin(t * 2.0) * 0.18);
  const scale = 0.95 + 0.12 * Math.sin(t * 4.0);
  const sx = CELL * 0.40 * scale;
  const sy = CELL * 0.28 * scale;
  const spacing = CELL * 0.25 * scale;
  const offsets = [-spacing, 0, spacing];
  try { c.globalCompositeOperation = 'lighter'; } catch(_){}
  c.shadowColor = glow;
  c.shadowBlur = Math.max(6, CELL * 0.80 * scale);
  c.globalAlpha = 0.28;
  c.fillStyle = glow;
  for (const o of offsets){
    c.save(); c.translate(o, 0); c.scale(sx, sy);
    if (__CHEVRON) c.fill(__CHEVRON);
    c.restore();
  }
  c.shadowBlur = Math.max(2, CELL * 0.40 * scale);
  c.globalAlpha = 0.55;
  for (const o of offsets){
    c.save(); c.translate(o, 0); c.scale(sx, sy);
    if (__CHEVRON) c.fill(__CHEVRON);
    c.restore();
  }
  c.globalAlpha = 1.0;
  c.shadowBlur = 0;
  c.fillStyle = core;
  for (const o of offsets){
    c.save(); c.translate(o, 0); c.scale(sx, sy);
    if (__CHEVRON) c.fill(__CHEVRON);
    c.restore();
  }
  const prev = c.globalCompositeOperation;
  try { c.globalCompositeOperation = 'source-over'; } catch(_){}
  const inv = 1 / Math.max(sx, sy);
  c.lineWidth = 1.2 * inv;
  c.strokeStyle = 'rgba(0,0,0,0.55)';
  for (const o of offsets){
    c.save(); c.translate(o, 0); c.scale(sx, sy);
    if (__CHEVRON) c.stroke(__CHEVRON);
    c.restore();
  }
  try { c.globalCompositeOperation = prev; } catch(_){}
  c.restore();
}
