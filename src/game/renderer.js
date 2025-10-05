import { clearFXSmart } from './render/fx.js';
import { drawBackground as __bg_draw } from './render/background.js';
import { drawWallsGlow as __wallsGlow_draw } from './render/wallsGlow.js';
import { drawPulseTrailsFast as _drawPulseTrailsFast } from './render/sprites.js';
import { drawCycle as _drawCycle } from './render/sprites.js';
import { drawPowerUp as __pu_draw } from './powerups.js';
import { getPulseSegments as __getPulseSegments } from './render/pulsePaths.js';
export function drawFrame({
  ctx,
  pctx,
  fx,
  gameState,
  engineContext,
  PLAYER_CYCLE_CORE,
  PLAYER_CYCLE_GLOW,
  ENEMY_CYCLE_CORE,
  ENEMY_CYCLE_GLOW,
  trailPlayer,
  trailEnemy,
  PULSE_SPAN
}) {
  try {
    clearFXSmart(pctx, fx, trailPlayer, trailEnemy, PULSE_SPAN);
  } catch (_e) {
    try {
      pctx.clearRect(0, 0, fx.width, fx.height);
    } catch (_) {}
  }
  try {
    __bg_draw();
  } catch (_) {}
  try {
    __wallsGlow_draw(performance.now() / 1000);
  } catch (_) {}
  try {
    let pPulse = engineContext && engineContext.pulseP;
    let ePulse = engineContext && engineContext.pulseE;
    const span = (typeof PULSE_SPAN === 'number' && PULSE_SPAN > 0) ? PULSE_SPAN : 0;
    if (!pPulse && Array.isArray(trailPlayer) && trailPlayer.length > 1 && span > 0) {
      pPulse = __getPulseSegments(trailPlayer, span);
    }
    if (!ePulse && Array.isArray(trailEnemy) && trailEnemy.length > 1 && span > 0) {
      ePulse = __getPulseSegments(trailEnemy, span);
    }
    const trailMask = (engineContext && engineContext.render) ? engineContext.render.trails : null;
    _drawPulseTrailsFast(pctx, pPulse || null, ePulse || null, trailMask || null);
  } catch (_) {
    try { _drawPulseTrailsFast(pctx, null, null, null); } catch (_) {}
  }
  try {
    const t = performance.now() / 1000;
    __pu_draw(t);
  } catch (_) {}
  try {
    const gp = gameState.player;
    const ge = gameState.enemy;
    _drawCycle(ctx, gp.x, gp.y, gp.dir, PLAYER_CYCLE_CORE, PLAYER_CYCLE_GLOW, 'player');
    _drawCycle(ctx, ge.x, ge.y, ge.dir, ENEMY_CYCLE_CORE, ENEMY_CYCLE_GLOW, 'enemy');
  } catch (_) {}
}
