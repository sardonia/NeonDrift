import { createGameRuntimeContext } from '../../context.js';

export function createRoundStartFlow({
  transitionToCountdown,
  getBus,
  getConstants,
  getAudioService,
  getDomService,
  getUiController,
  orchestratorCtx,
  getState,
  spawnRound,
  startRoundFlow,
  updateLevel,
  createResetPowerUps,
  resetPowerBag,
  updateScore,
  startGame,
  startRoundHelper,
  computeEnemySpeedFallback,
  cycleColours,
  gameFlowController
}) {
  return function startRound({ resetLevel1 = false, onStartGame } = {}) {
    const bus = typeof getBus === 'function' ? getBus() : null;

    const constantsSvc = typeof getConstants === 'function' ? getConstants() : null;
    const audioSvc = typeof getAudioService === 'function' ? getAudioService() : null;
    const domSvc = typeof getDomService === 'function' ? getDomService() : null;
    const uiSvc = typeof getUiController === 'function' ? getUiController() : null;

    const computeEnemySpeed =
      constantsSvc && typeof constantsSvc.computeEnemySpeed === 'function'
        ? constantsSvc.computeEnemySpeed
        : computeEnemySpeedFallback;

    const context = createGameRuntimeContext({
      orchestratorCtx,
      services: {
        audio: audioSvc,
        dom: domSvc,
        ui: uiSvc,
        constants: constantsSvc,
        bus
      },
      selectors: {
        getState
      },
      controllers: {
        startGame
      },
      helpers: {
        createResetPowerUps,
        resetPowerBag,
        spawnRound,
        startRoundHelper,
        updateLevel,
        updateScore,
        computeEnemySpeed,
        cycleColours
      }
    });

    gameFlowController.startRound({
      resetLevel1,
      onStartGame,
      transitions: { toCountdown: transitionToCountdown }
    }, context);
  };
}

export default { createRoundStartFlow };
