import { collectPowerUp } from '../powerups.js';
import { turnSide } from '../utils.js';
export function commitMoves(ctx, params) {
  const state = ctx && ctx.state;
  const render = ctx && ctx.render;
  const audio = ctx && ctx.audio;
  if (!state || !render || !render.drawTrailSegment) return false;
  const renderTrailPlayer = Array.isArray(render.trailPlayer) ? render.trailPlayer : null;
  const renderTrailEnemy  = Array.isArray(render.trailEnemy) ? render.trailEnemy : null;
  let needRebuild = false;
  const {
    playerWillMove,
    enemyWillMove,
    px0, py0, pnx, pny,
    ex0, ey0, enx, eny,
    prevEnemyDir,
    enemyDir,
    preset
  } = params || {};
  if (playerWillMove) {
    try {
      state.grid[py0][px0] = true;
      const tctx = render.tctx;
      const cols = render.colors || {};
      const pCore = cols.playerCore;
      const pGlow = cols.playerGlow;
      render.drawTrailSegment(tctx, px0, py0, pnx, pny, pCore, pGlow, 'player');
      if (Array.isArray(state.trailPlayer)) {
        state.trailPlayer.push([pnx, pny]);
      }
      if (renderTrailPlayer && renderTrailPlayer !== state.trailPlayer) {
        renderTrailPlayer.push([pnx, pny]);
      }
      needRebuild = true;
      state.player.x = pnx;
      state.player.y = pny;
      const pu = state.powerUp;
      if (pu && state.player.x === pu.x && state.player.y === pu.y) {
        try { collectPowerUp(pu); } catch (_e) {}
        state.powerUp = null;
      }
    } catch (_e) {
    }
  }
  if (enemyWillMove) {
    try {
      state.grid[ey0][ex0] = true;
      const tctx = render.tctx;
      const cols = render.colors || {};
      const eCore = cols.enemyCore;
      const eGlow = cols.enemyGlow;
      render.drawTrailSegment(tctx, ex0, ey0, enx, eny, eCore, eGlow, 'enemy');
      if (Array.isArray(state.trailEnemy)) {
        state.trailEnemy.push([enx, eny]);
      }
      if (renderTrailEnemy && renderTrailEnemy !== state.trailEnemy) {
        renderTrailEnemy.push([enx, eny]);
      }
      needRebuild = true;
      state.enemy.x = enx;
      state.enemy.y = eny;
      state.enemy.dir = enemyDir;
      if (enemyDir && prevEnemyDir && enemyDir !== prevEnemyDir) {
        try {
          const side = turnSide(prevEnemyDir, enemyDir);
          if (audio && typeof audio.turnChirp === 'function') {
            audio.turnChirp(side, preset);
          }
        } catch (_e) {
        }
      }
    } catch (_e) {
    }
  }
  return needRebuild;
}
