import { createGameRuntimeContext } from '../../context.js';

export function createNextLevelFlow({
  getConstants,
  getAudioService,
  getDomService,
  getUiController,
  getBus,
  orchestratorCtx,
  getState,
  pauseLoop,
  controllerSetEngineActive,
  nextLevelHelper,
  proceedToNextLevelFlow,
  updateLevel,
  updateScore,
  createResetPowerUps,
  resetPowerBag,
  spawnRound,
  startRound,
  getLevel,
  cycleColours,
  gameFlowController
}) {
  return function proceedToNextLevel({ onStartGame } = {}) {
    const constantsSvc = typeof getConstants === 'function' ? getConstants() : null;
    const audioSvc = typeof getAudioService === 'function' ? getAudioService() : null;
    const domSvc = typeof getDomService === 'function' ? getDomService() : null;
    const uiSvc = typeof getUiController === 'function' ? getUiController() : null;
    const bus = typeof getBus === 'function' ? getBus() : null;

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
        getState,
        getLevel
      },
      controllers: {
        pauseLoop,
        controllerSetEngineActive,
        startRound
      },
      helpers: {
        createResetPowerUps,
        resetPowerBag,
        spawnRound,
        updateLevel,
        updateScore,
        nextLevelHelper,
        cycleColours
      }
    });

    gameFlowController.proceedToNextLevel({ onStartGame }, context);
  };
}

export default { createNextLevelFlow };
