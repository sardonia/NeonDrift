import * as loopCtrl from './loopController.js';
const startLoop = loopCtrl.start;
const pauseLoop = loopCtrl.pause;
const resumeLoop = loopCtrl.resume;
const stopLoop = loopCtrl.stop || loopCtrl.pause;
import { step as engineStep } from '../../engine.js';
import { hudBus } from '../../core/events.js';
import { assertTickDependencies } from '../contracts.js';

/**
 * @typedef {import('../types').TickDependencies} TickDependencies
 * @typedef {import('../types').MutableRef<any>} AnyRef
 */
/**
 * @param {{
 *   hidePausePanel?: () => void,
 *   orchestratorStartGame?: () => void,
 *   playerEngineRef?: AnyRef,
 *   enemyEngineRef?: AnyRef,
 *   gameState?: any,
 *   engineContext?: Record<string, any>,
 *   startLoopController?: Function,
 *   draw?: Function,
 *   onFrame?: (dt: number) => void,
 *   tickDeps: TickDependencies,
 *   bus?: any
 * }} params
 */
export function startGameFlow({
  hidePausePanel,
  orchestratorStartGame,
  playerEngineRef,
  enemyEngineRef,
  gameState,
  engineContext,
  startLoopController,
  draw,
  onFrame,
  tickDeps,
  bus
}) {
  const resolvedTickDeps = assertTickDependencies('rootGameFlowController.startGameFlow', tickDeps);
  // Centralized pause overlay hide on start
  hudBus.hideOverlay(bus, { kind: 'pause' });

  try {
    if (typeof hidePausePanel === 'function') hidePausePanel();
  } catch (_e) {}
  try {
    if (typeof orchestratorStartGame === 'function') orchestratorStartGame();
  } catch (_e) {}
  try {
    if (engineContext && resolvedTickDeps) {
      engineContext.tickDeps = resolvedTickDeps;
    }
  } catch (_e) {}
  try {
    if (playerEngineRef && engineContext && 'playerEngine' in engineContext) {
      playerEngineRef.current = engineContext.playerEngine;
    }
    if (enemyEngineRef && engineContext && 'enemyEngine' in engineContext) {
      enemyEngineRef.current = engineContext.enemyEngine;
    }
  } catch (_e) {}
  try {
    if (typeof startLoopController === 'function') {
      startLoopController({ gameState, engineContext, draw, onFrame });
    }
  } catch (_e) {}
}
export function pauseGameFlow({
  orchestratorPauseGame,
  gameState,
  intervalRef,
  playerEngineRef,
  enemyEngineRef,
  pauseLoopController,
  showPausePanel,
  updatePauseMessage,
  bus
}) {
  try {
    if (typeof orchestratorPauseGame === 'function') {
      orchestratorPauseGame();
    }
  } catch (_e) {}
  try {
    if (typeof pauseLoopController === 'function') {
      pauseLoopController();
    }
  } catch (_e) {}
  try {
    if (intervalRef && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  } catch (_e) {}
  try {
    if (playerEngineRef) playerEngineRef.current = null;
    if (enemyEngineRef)  enemyEngineRef.current  = null;
  } catch (_e) {}
  hudBus.showOverlay(bus, { kind: 'pause', data: { title: 'PAUSED', message: 'Press Space to continue' } });
}
export function gameOverFlow({
  message = '',
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
  gameOverHelper,
  pauseLoop,
  showGameOver
}) {
  try {
    gameOverHelper({
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
    });
  } catch (_e) {}
  try {
    if (typeof pauseLoop === 'function') pauseLoop();
  } catch (_e) {}
}
export default {
  startGameFlow,
  pauseGameFlow,
  gameOverFlow
};
