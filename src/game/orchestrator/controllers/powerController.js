import { resetPowerUpsHelper } from '../../engine/powerHandlers.js';
import { dispatch, getState, Actions } from '../../state/index.js';
export function createResetPowerUps({ gameState, resetPowerBag, listEl }) {
  return function resetPowerUps(opts) {
    const state = getState();
    const targetState = state || gameState || { powerBag: [] };
    try {
      const newPowerUp = resetPowerUpsHelper({
        gameState: targetState,
        resetPowerBag,
        options: opts || {},
        listEl
      });
      const bagSnapshot = targetState && Array.isArray(targetState.powerBag) ? targetState.powerBag : [];
      dispatch(Actions.setPowerBag(bagSnapshot));
      if (opts && opts.clearPickup) {
        dispatch(Actions.setPowerUp(newPowerUp));
      }
      if (gameState && gameState !== targetState) {
        try { gameState.powerBag = bagSnapshot.slice(); } catch (_) {}
        if (opts && opts.clearPickup) {
          try { gameState.powerUp = newPowerUp; } catch (_) {}
        }
      }
    } catch (_e) {
    }
  };
}
import { spawnPowerUpImpl, drawPowerUpImpl, collectPowerUpImpl } from '../../powerups.js';
export function createInitPowerupsBindings({
  engineContext,
  ctx,
  cellCenter,
  drawAccelGlyph,
  drawHaloRing,
  updatePowerUpsUI,
  audio,
  consts,
  rng
}) {
  const helpers = {
    cellCenter,
    ctx,
    drawAccelGlyph,
    drawHaloRing,
    getPowerUp: () => {
      const state = getState();
      try { return state ? state.powerUp : null; } catch (_e) { return null; }
    },
    incScore: (n) => {
      const delta = Number(n) || 0;
      try {
        dispatch(Actions.addScore(delta));
        dispatch(Actions.addPersistentScore(delta));
      } catch (_e) {
        const state = getState();
        if (state) {
          try {
            state.score = (state.score || 0) + delta;
            if (typeof state.persistentScore === 'number') {
              state.persistentScore = state.persistentScore + delta;
            }
          } catch (_) {}
        }
      }
      try {
        if (typeof updatePowerUpsUI === 'function') {
          const state = getState();
          updatePowerUpsUI(state && Array.isArray(state.powerBag) ? state.powerBag : []);
        }
      } catch (_e) {}
    },
    playPowerupSplash: () => {
      try { if (audio && typeof audio.powerupSplash === 'function') audio.powerupSplash(); } catch (_e) {}
    },
    powerBagPush: (kind) => {
      try {
        dispatch(Actions.addPowerBagItem(kind));
      } catch (_e) {
        const state = getState();
        if (state && state.powerBag && typeof state.powerBag.push === 'function') {
          try { state.powerBag.push(kind); } catch (_) {}
        }
      }
    },
    updatePowerUpsUI: () => {
      try {
        const state = getState();
        updatePowerUpsUI && updatePowerUpsUI(state && Array.isArray(state.powerBag) ? state.powerBag : []);
      } catch (_e) {}
    },
    getGrid: () => {
      const state = getState();
      try { return state ? state.grid : null; } catch (_e) { return null; }
    },
    getPlayer: () => {
      const state = getState();
      try { return state ? state.player : null; } catch (_e) { return null; }
    },
    getEnemy: () => {
      const state = getState();
      try { return state ? state.enemy : null; } catch (_e) { return null; }
    },
    isOccupied: (grid, x, y) => {
      try { return engineContext.collisions.isOccupied(grid, x, y); } catch (_e) { return true; }
    },
    setPowerUp: (pu) => {
      try {
        dispatch(Actions.setPowerUp(pu));
      } catch (_e) {
        const state = getState();
        if (state) {
          try { state.powerUp = pu; } catch (_) {}
        }
      }
    },
    clearPowerUp: () => {
      try {
        dispatch(Actions.clearPowerUp());
      } catch (_e) {
        const state = getState();
        if (state) {
          try { state.powerUp = null; } catch (_) {}
        }
      }
    }
  };
  if (typeof rng === 'function') {
    helpers.rng = rng;
  }
  return {
    spawnPowerUp: spawnPowerUpImpl,
    drawPowerUp: drawPowerUpImpl,
    collectPowerUp: collectPowerUpImpl,
    consts,
    helpers
  };
}
export default { createResetPowerUps, createInitPowerupsBindings };
