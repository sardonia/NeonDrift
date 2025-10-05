import { createStartGameFlow } from './startGame.js';
import { createPauseGameFlow } from './pauseGame.js';
import { createRoundStartFlow } from './round/start.js';
import { createNextLevelFlow } from './round/nextLevel.js';

export function createOrchestratorFlows({
  transitions = {},
  services = {},
  dispatchers = {},
  controllers = {},
  orchestratorCtx,
  getState,
  spawnRound,
  startRoundFlow,
  proceedToNextLevelFlow,
  updateLevel,
  createResetPowerUps,
  resetPowerBag,
  updateScore,
  startRoundHelper,
  nextLevelHelper,
  computeEnemySpeedFallback,
  cycleColours,
  gameFlowController,
  safe,
  engineRefs,
  pauseLoop,
  getLevel
}) {
  const startGame = createStartGameFlow({
    transitionToRunning: transitions.transitionToRunning,
    getBus: services.getBus,
    getAudioService: services.getAudioService,
    getDomService: services.getDomService,
    dispatchStartGame: dispatchers.dispatchStartGame,
    safe,
    engineRefs
  });

  const pauseGame = createPauseGameFlow({
    transitionToPaused: transitions.transitionToPaused,
    getBus: services.getBus,
    getAudioService: services.getAudioService,
    getDomService: services.getDomService,
    dispatchPauseGame: dispatchers.dispatchPauseGame,
    controllerSetEngineActive: controllers.controllerSetEngineActive,
    safe,
    engineRefs
  });

  const startRound = createRoundStartFlow({
    transitionToCountdown: transitions.transitionToCountdown,
    getBus: services.getBus,
    getConstants: services.getConstants,
    getAudioService: services.getAudioService,
    getDomService: services.getDomService,
    getUiController: services.getUiController,
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
  });

  const proceedToNextLevel = createNextLevelFlow({
    getConstants: services.getConstants,
    getAudioService: services.getAudioService,
    getDomService: services.getDomService,
    getUiController: services.getUiController,
    getBus: services.getBus,
    orchestratorCtx,
    getState,
    pauseLoop,
    controllerSetEngineActive: controllers.controllerSetEngineActive,
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
  });

  return {
    startGame,
    pauseGame,
    startRound,
    proceedToNextLevel
  };
}

export default { createOrchestratorFlows };
