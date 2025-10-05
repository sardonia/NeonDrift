import { updateBoost } from './boostHandlers.js';
import { applyBufferedTurnAndChirp } from './turnHandler.js';
import { processMovementSubsteps } from './substepProcessor.js';
import { updateEngineIntensities, incrementSurviveScore, syncProgressAndBoost } from './postStepHandlers.js';
export function runTick(args) {
  const {
    gameState,
    engineContext,
    audio,
    draw,
    gameOver,
    resetPowerUps,
    updateScore,
    hidePausePanel,
    showPausePanel,
    panel,
    overlay,
    proceedToNextLevel,
    LEVEL,
    MAX_LEVEL,
    COLS,
    preset,
    playerEngineRef,
    enemyEngineRef,
    interval,
    trailPlayer,
    trailEnemy,
    pulsePRef,
    pulseERef,
    keysHeld,
    delta
  } = args;
  const stepDelta = Number.isFinite(delta) ? delta : 1;
  if (!gameState || !gameState.running) {
    return { aborted: true, lastSubsteps: 0 };
  }
  applyBufferedTurnAndChirp(gameState && gameState.player, audio, preset);
  let boostActive = updateBoost(gameState, playerEngineRef.current, keysHeld);
  const substepResult = processMovementSubsteps({
    engineContext,
    gameState,
    audio,
    draw,
    gameOver,
    resetPowerUps,
    updateScore,
    hidePausePanel,
    showPausePanel,
    panel,
    overlay,
    proceedToNextLevel,
    LEVEL,
    MAX_LEVEL,
    COLS,
    preset,
    playerEngine: playerEngineRef.current,
    enemyEngine: enemyEngineRef.current,
    interval,
    trailPlayer,
    trailEnemy,
    pulseP: pulsePRef.current,
    pulseE: pulseERef.current
  });
  playerEngineRef.current = substepResult.playerEngine;
  enemyEngineRef.current = substepResult.enemyEngine;
  pulsePRef.current = substepResult.pulseP;
  pulseERef.current = substepResult.pulseE;
  if (substepResult.aborted) {
    return { aborted: true, lastSubsteps: substepResult.lastSubsteps };
  }
  updateEngineIntensities(gameState, playerEngineRef.current, enemyEngineRef.current);
  incrementSurviveScore(gameState, updateScore, stepDelta);
  syncProgressAndBoost(
    gameState,
    substepResult.playerProgress,
    substepResult.enemyProgress,
    boostActive
  );
  return { aborted: false, lastSubsteps: substepResult.lastSubsteps };
}
