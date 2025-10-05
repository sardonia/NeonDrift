export function updateBoost(state, playerEngine, keysHeld) {
  if (!state || !state.player) return state && state.boostActive;
  const player = state.player;
  const hasAccel = Array.isArray(state.powerBag) && state.powerBag.includes('accel');
  const wantsBoost = hasAccel && !!(keysHeld && keysHeld[player.dir]);
  let boostActive = !!state.boostActive;
  if (wantsBoost !== boostActive) {
    boostActive = wantsBoost;
    try {
      if (playerEngine && typeof playerEngine.setBoost === 'function') {
        playerEngine.setBoost(boostActive);
      }
    } catch (_e) {
    }
    try {
      state.boostActive = boostActive;
    } catch (_e) {
    }
  }
  return boostActive;
}
