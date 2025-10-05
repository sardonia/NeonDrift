import { dispatch, Actions } from '../state/index.js';

export function gameOverHelper({
  message,
  gameState,
  intervalRef,
  playerEngineRef,
  enemyEngineRef,
  audio,
  resetPowerUps,
  setEngineActive,
  overlay,
  panel,
  onAgain,
  bgm,
  showGameOver
}){
  try {
    dispatch(Actions.setRunning(false));
  } catch (_e) {
    try {
      if (gameState) gameState.running = false;
    } catch (_) {}
  }
  try {
    if (intervalRef && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  } catch (_e) {}
  try {
    if (audio && typeof audio.stopEngines === 'function') audio.stopEngines();
  } catch (_e) {}
  if (playerEngineRef) playerEngineRef.current = null;
  if (enemyEngineRef)  enemyEngineRef.current  = null;
  try {
    if (typeof resetPowerUps === 'function') resetPowerUps({ clearPickup: true });
  } catch (_e) {}
  try {
    if (typeof showGameOver === 'function') {
      showGameOver({
        message,
        totalScore: gameState && gameState.score,
        overlay,
        panel,
        onAgain
      });
    }
  } catch (_e) {}
  try {
    dispatch(Actions.setGameEnded(true));
    dispatch(Actions.setRunning(false));
  } catch (_e) {
    if (gameState) {
      try {
        gameState.gameEnded = true;
        gameState.running = false;
      } catch (_) {}
    }
  }
  try {
    if (typeof setEngineActive === 'function') setEngineActive(false);
  } catch (_e) {}
  try {
    if (audio && typeof audio.pauseBgm === 'function') audio.pauseBgm(bgm);
  } catch (_e) {}
}
