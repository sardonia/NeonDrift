import { resetGameState, dispatch, Actions } from '../state/index.js';
export function spawn(ctx) {
  if (!ctx || !ctx.state) return;
  let carryScore = 0;
  try {
    if (ctx && ctx.state && typeof ctx.state.persistentScore === 'number') {
      carryScore = ctx.state.persistentScore;
    }
  } catch (_e) {
    carryScore = 0;
  }
  try {
    resetGameState(ctx.state, { preservePersistentScore: true, preserveLevel: true });
  } catch (e) {
  }
  try {
    dispatch(Actions.setGameEnded(false));
    dispatch(Actions.setTick(0));
    dispatch(Actions.setScore(carryScore));
    dispatch(Actions.setPersistentScore(carryScore));
    dispatch(Actions.setEnemyProgress(0));
    dispatch(Actions.setPlayerProgress(0));
    dispatch(Actions.setBoostActive(false));
  } catch (_) {
    const state = ctx.state;
    if (state) {
      try {
        state.gameEnded = false;
        state.tick = 0;
        state.score = carryScore;
        state.hudScorePending = 0;
        state.hudScoreCooldown = 0;
        state.hudScoreLastBroadcast = carryScore;
        state.persistentScore = carryScore;
        state.enemyProgress = 0;
        state.playerProgress = 0;
        state.boostActive = false;
      } catch (__e) {}
    }
  }
}
