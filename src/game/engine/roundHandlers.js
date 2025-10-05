import { dispatch, Actions } from '../state/index.js';

export function startRoundHelper({
  gameState,
  intervalRef,
  computeEnemySpeed,
  resetLevel1 = false,
  playerEngineRef,
  enemyEngineRef
}){
  try {
    if (intervalRef && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  } catch(_e) {}
  try {
    dispatch(Actions.setRunning(false));
    dispatch(Actions.setGameEnded(false));
  } catch(_e) {
    try {
      if (gameState) {
        gameState.running = false;
        gameState.gameEnded = false;
      }
    } catch (_) {}
  }
  if (playerEngineRef) playerEngineRef.current = null;
  if (enemyEngineRef)  enemyEngineRef.current  = null;
  let newLevel;
  let newEnemySpeed;
  if (resetLevel1) {
    newLevel = 1;
    try {
      dispatch(Actions.setLevel(newLevel));
    } catch(_e) {
      if (gameState) {
        try { gameState.level = newLevel; } catch (_) {}
      }
    }
    try {
      newEnemySpeed = typeof computeEnemySpeed === 'function'
        ? computeEnemySpeed(newLevel)
        : undefined;
    } catch(_e) {}
    try {
      dispatch(Actions.setPersistentScore(0));
    } catch (_e) {
      if (gameState && typeof gameState.persistentScore === 'number') {
        try { gameState.persistentScore = 0; } catch (_) {}
      }
    }
  }
  return { newLevel, newEnemySpeed };
}
