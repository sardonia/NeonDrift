import { dispatch, Actions } from '../state/index.js';

export function proceedToNextLevel({
  gameState,
  computeEnemySpeed,
  LEVEL,
  MAX_LEVEL
}){
  const nextLevel = Math.min(MAX_LEVEL, (LEVEL | 0) + 1);
  const newEnemySpeed = typeof computeEnemySpeed === 'function'
    ? computeEnemySpeed(nextLevel)
    : undefined;
  try {
    dispatch(Actions.setLevel(nextLevel));
  } catch (_e) {
    try {
      if (gameState) {
        gameState.level = nextLevel;
      }
    } catch (_) {}
  }
  let savedScore = 0;
  if (gameState && typeof gameState.persistentScore === 'number') {
    savedScore = gameState.persistentScore;
  } else if (gameState && typeof gameState.nextLevelCarryScore !== 'undefined') {
    savedScore = gameState.nextLevelCarryScore;
  }
  try {
    dispatch(Actions.setScore(savedScore));
    dispatch(Actions.setPersistentScore(savedScore));
  } catch (_e) {
    if (gameState) {
      try {
        gameState.score = savedScore;
        gameState.persistentScore = savedScore;
      } catch (_) {}
    }
  }
  try {
    dispatch(Actions.setLevelTransitionPending(false));
  } catch (_e) {
    if (gameState) {
      try { gameState.levelTransitionPending = false; } catch (_) {}
    }
  }
  return { newLevel: nextLevel, newEnemySpeed };
}
