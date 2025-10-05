import { resetServices, TOKENS } from './services/index.js';
import { getState, dispatch, Actions, subscribe } from './state/index.js';
import { initInputController } from './orchestrator/controllers/keyboardController.js';
import * as C from './Constants.js';
import { hudBus } from './core/events.js';
import * as bootstrapController from './orchestrator/controllers/bootstrapController.js';
import { setCollisions } from './utils.js';
import {
  WALL_CORE,
  WALL_GLOW,
  PLAYER_CYCLE_CORE,
  PLAYER_CYCLE_GLOW,
  ENEMY_CYCLE_CORE,
  ENEMY_CYCLE_GLOW
} from './ui/theme.js';
import { spawnRound } from './spawner.js';
import { drawBackground } from './render/background.js';
import { drawWallsGlow } from './render/wallsGlow.js';
import { drawFrame as __drawFrame } from './renderer.js';
import { disposeHudSubscriptions } from './orchestrator/controllers/uiController.js';
import {
  startGameFlow as _startGameFlow,
  pauseGameFlow as _pauseGameFlow
} from './orchestrator/controllers/rootGameFlowController.js';
import gameFlowController from './orchestrator/controllers/gameFlowController.js';
import inputAdapterController from './orchestrator/controllers/inputController.js';
import { proceedToNextLevelFlow, startRoundFlow } from './orchestrator/controllers/roundController.js';
import { proceedToNextLevel as nextLevelHelper } from './engine/levelHandlers.js';
import { startRoundHelper } from './engine/roundHandlers.js';
import { createResetPowerUps } from './orchestrator/controllers/powerController.js';
import { resetPowerBag, spawnPowerUp } from './powerups.js';
import { updateScore } from './ui/score.js';
import { configureOverlayTickerFacade } from './ui/overlays.js';
import debugController from './orchestrator/controllers/debugController.js';
import { renderFrame } from './engine/step.js';
import { createGameRuntimeContext } from './orchestrator/context.js';
import {
  GameState,
  getGameState,
  transitionToIdle,
  transitionToCountdown,
  transitionToRunning,
  transitionToPaused
} from './orchestrator/stateMachine.js';
import { createOrchestratorFlows } from './orchestrator/flows/index.js';
import { runDiagnostic, safe } from './orchestrator/runtime/diagnostics.js';
import {
  requireOrchestratorService,
  getOptionalService,
  resetBootstrapState
} from './orchestrator/runtime/bootstrap.js';
import {
  startLoop as runtimeStartLoop,
  pauseLoop as runtimePauseLoop,
  resumeLoop as runtimeResumeLoop,
  setEngineActive as runtimeSetEngineActive
} from './orchestrator/runtime/loop.js';
import { createHudInitializer } from './orchestrator/runtime/hud.js';

var _gameStateRef = null;
var _currentLevel = 1;
var _enemySpeed = 0;
var _servicesRef = null;
var _engineContextRef = null;

function syncGameStateRefFromStore() {
  try {
    // Pull the latest immutable snapshot from the Redux-style store.  We do
    // *not* replace the engine's state object with this snapshot because
    // engine state is mutable and contains runtime data (player position,
    // progress, etc.).  Instead, capture the snapshot separately and
    // update select properties on the engine state as needed.
    const latest = getState();
    if (latest) {
      _gameStateRef = latest;
      // If an engine context and state exist, update the level on the
      // mutable engine state to reflect the current store level.  Avoid
      // overwriting the entire state, which would freeze runtime
      // properties and prevent movement.
      if (_engineContextRef && typeof _engineContextRef.state === 'object') {
        const engineState = _engineContextRef.state;
        const newLevel = typeof latest.level === 'number' ? latest.level : undefined;
        if (newLevel !== undefined) {
          try {
            engineState.level = newLevel;
          } catch (_) {
            // ignore assignment errors (e.g. if engineState is frozen)
          }
        }
        // Propagate the enemySpeed from the store state onto the engine state.
        // The engine updateProgress() reads this field if present, providing a
        // consistent enemy speed even when computeEnemySpeed() is not invoked.
        const es = typeof latest.enemySpeed === 'number' ? latest.enemySpeed : undefined;
        if (es !== undefined) {
          try {
            engineState.enemySpeed = es;
          } catch (_) {
            // ignore assignment errors
          }
        }
      }
    }
  } catch (_) {
    // ignore sync errors; consumers will fall back to getState()
  }
}

syncGameStateRefFromStore();

try {
  subscribe(() => {
    syncGameStateRefFromStore();
  });
} catch (_) {
  // Subscription is best-effort; orchestrator will rely on getState() fallback otherwise.
}

const _playerEngineRef = { current: null };
const _enemyEngineRef = { current: null };

const cycleColours = {
  PLAYER_CYCLE_CORE,
  PLAYER_CYCLE_GLOW,
  ENEMY_CYCLE_CORE,
  ENEMY_CYCLE_GLOW
};

const engineRefs = {
  playerRef: _playerEngineRef,
  enemyRef: _enemyEngineRef,
  updateContextEngines(player, enemy) {
    if (_engineContextRef) {
      _engineContextRef.playerEngine = player;
      _engineContextRef.enemyEngine = enemy;
    }
  }
};

const startLoop = runtimeStartLoop;
const pauseLoop = runtimePauseLoop;
const resumeLoop = runtimeResumeLoop;
const setEngineActive = runtimeSetEngineActive;
const _controllerSetEngineActive = runtimeSetEngineActive;

export const orchestratorCtx = {
  get gameStateRef() {
    return _gameStateRef;
  },
  set gameStateRef(val) {
    _gameStateRef = val;
  },
  get engineContextRef() {
    return _engineContextRef;
  },
  set engineContextRef(val) {
    _engineContextRef = val;
  },
  get playerEngineRef() {
    return _playerEngineRef;
  },
  set playerEngineRef(val) {
    if (val) {
      _playerEngineRef.current = val.current;
    }
  },
  get enemyEngineRef() {
    return _enemyEngineRef;
  },
  set enemyEngineRef(val) {
    if (val) {
      _enemyEngineRef.current = val.current;
    }
  },
  get currentLevel() {
    return _currentLevel;
  },
  set currentLevel(val) {
    _currentLevel = val;
  },
  get enemySpeed() {
    return _enemySpeed;
  },
  set enemySpeed(val) {
    _enemySpeed = val;
  }
};

function getBus() {
  return requireOrchestratorService(TOKENS.BUS, 'bus');
}

function getConstantsService() {
  return requireOrchestratorService(TOKENS.CONSTANTS, 'constants');
}

function getAudioService() {
  return requireOrchestratorService(TOKENS.AUDIO, 'audio');
}

function getDomService() {
  return requireOrchestratorService(TOKENS.DOM, 'dom');
}

function getUiControllerService() {
  return getOptionalService(TOKENS.UI);
}

function updateLevelDomLabel(level) {
  let levelEl = null;
  try {
    const domSvc = getOptionalService(TOKENS.DOM);
    if (domSvc && typeof domSvc === 'object' && domSvc.level) {
      levelEl = domSvc.level;
    }
  } catch (_) {
    // If optional services are not ready (e.g. fallback bootstrap),
    // fall through to DOM lookup.
  }

  if (!levelEl && typeof document !== 'undefined' && document && document.getElementById) {
    try {
      levelEl = document.getElementById('level');
    } catch (_) {
      levelEl = null;
    }
  }

  if (levelEl && typeof levelEl.textContent !== 'undefined') {
    try {
      levelEl.textContent = String(level);
    } catch (_) {}
  }
}

const dispatchStartGame = () => dispatch(Actions.startGame());
const dispatchPauseGame = () => dispatch(Actions.pauseGame());

const {
  startGame,
  pauseGame,
  startRound,
  proceedToNextLevel
} = createOrchestratorFlows({
  transitions: {
    transitionToRunning,
    transitionToPaused,
    transitionToCountdown
  },
  services: {
    getBus,
    getConstants: getConstantsService,
    getAudioService,
    getDomService,
    getUiController: getUiControllerService
  },
  dispatchers: {
    dispatchStartGame,
    dispatchPauseGame
  },
  controllers: {
    controllerSetEngineActive: _controllerSetEngineActive
  },
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
  computeEnemySpeedFallback: C.computeEnemySpeed,
  cycleColours,
  gameFlowController,
  safe,
  engineRefs,
  pauseLoop,
  getLevel
});

export { GameState, getGameState };
export { startGame, pauseGame, startRound, proceedToNextLevel };
export { startLoop, pauseLoop, resumeLoop, setEngineActive };

export function getLevel() {
  return _currentLevel;
}

export function getEnemySpeed() {
  return _enemySpeed;
}

export function resetGame() {
  transitionToIdle();
  runDiagnostic('orchestrator.resetGame.dispatch', () => dispatch(Actions.resetGame()), {
    context: { action: 'RESET_GAME' }
  });
}

export function updateLevel(level) {
  const lvl = Math.max(1, Math.min(C.MAX_LEVEL, Math.floor(level || 1)));
  _currentLevel = lvl;
  runDiagnostic('orchestrator.updateLevel.computeEnemySpeed', () => {
    const constantsSvc = getConstantsService();
    if (constantsSvc && typeof constantsSvc.computeEnemySpeed === 'function') {
      _enemySpeed = constantsSvc.computeEnemySpeed(lvl);
    } else if (typeof C.computeEnemySpeed === 'function') {
      _enemySpeed = C.computeEnemySpeed(lvl);
    }
  }, { context: { level: lvl } });

  // Immediately mirror the derived enemy speed onto the orchestrator state refs.
  try {
    if (_gameStateRef && typeof _gameStateRef === 'object') {
      _gameStateRef.enemySpeed = _enemySpeed;
    }
  } catch (_) {}
  try {
    if (_engineContextRef && _engineContextRef.state && typeof _engineContextRef.state === 'object') {
      _engineContextRef.state.enemySpeed = _enemySpeed;
    }
  } catch (_) {}

  runDiagnostic('orchestrator.updateLevel.dispatch', () => {
    try {
      dispatch(Actions.setLevel(lvl));
    } catch (e) {
      console.error('Failed to dispatch SET_LEVEL action. Falling back to direct assignment.', e);
      if (_gameStateRef) {
        _gameStateRef.level = lvl;
      }
    }
  }, { context: { level: lvl } });

  // Update the enemySpeed field on the mutable game state.  The game state
  // returned by getState() is the live state object used by the engine and
  // store.  Mutating it here ensures that the engine and debug overlay can
  // read the latest enemy speed even if dispatch() failed or subscribers
  // receive stale snapshots.  This write is intentionally direct rather
  // than dispatched through a reducer because enemySpeed is derived from
  // the level and does not have its own action type.
  try {
    const current = getState();
    if (current && typeof current === 'object') {
      current.enemySpeed = _enemySpeed;
    }
  } catch (_) {
    // ignore failures updating enemySpeed on mutable state
  }

  // Mirror the level update into the engine state.  The engine state
  // represents the mutable runtime game state and must stay in sync with
  // the canonical store level.  Updating it directly ensures that
  // updateProgress() reads the correct level during the next step.
  try {
    if (_engineContextRef && _engineContextRef.state && typeof _engineContextRef.state === 'object') {
      _engineContextRef.state.level = lvl;
    }
  } catch (_) {
    // ignore assignment errors (e.g. if engine state is frozen)
  }

  runDiagnostic('orchestrator.updateLevel.emitHud', () => {
    const bus = getBus();
    hudBus.updateLevel(bus, { level: lvl });
  }, { context: { level: lvl } });

  updateLevelDomLabel(lvl);

  return _currentLevel;
}

function resolveLevelFromState(state) {
  try {
    const lvl = state && typeof state.level === 'number' ? Math.floor(state.level) : 1;
    return Number.isFinite(lvl) && lvl > 0 ? lvl : 1;
  } catch (_) {
    return 1;
  }
}

function resolveEnemySpeedFromServices(services, level) {
  const constants = services && services.constants ? services.constants : null;
  if (constants && typeof constants.computeEnemySpeed === 'function') {
    try {
      return constants.computeEnemySpeed(level);
    } catch (_) {}
  }
  if (typeof C.computeEnemySpeed === 'function') {
    try {
      return C.computeEnemySpeed(level);
    } catch (_) {}
  }
  return undefined;
}

function applyFallbackState(bootstrapDeps) {
  const fallbackState = getState();
  const fallbackContext = {};
  const fallbackServices = { ...(bootstrapDeps && bootstrapDeps.services ? bootstrapDeps.services : {}) };
  const fallbackLevel = resolveLevelFromState(fallbackState);
  const fallbackEnemySpeed = resolveEnemySpeedFromServices(fallbackServices, fallbackLevel);

  try { _gameStateRef = fallbackState; } catch (_) {}
  try { _engineContextRef = fallbackContext; } catch (_) {}
  try { _currentLevel = fallbackLevel; } catch (_) {}
  if (fallbackEnemySpeed !== undefined) {
    try { _enemySpeed = fallbackEnemySpeed; } catch (_) {}
  }

  // Ensure the fallback enemy speed is reflected on the game state and engine state.
  try {
    if (_gameStateRef && typeof _gameStateRef === 'object' && typeof fallbackEnemySpeed === 'number') {
      _gameStateRef.enemySpeed = fallbackEnemySpeed;
    }
  } catch (_) {}
  try {
    if (_engineContextRef && _engineContextRef.state && typeof _engineContextRef.state === 'object' && typeof fallbackEnemySpeed === 'number') {
      _engineContextRef.state.enemySpeed = fallbackEnemySpeed;
    }
  } catch (_) {}

  try { _servicesRef = fallbackServices; } catch (_) {}
  if (_servicesRef && _servicesRef.collisions && typeof setCollisions === 'function') {
    setCollisions(_servicesRef.collisions);
  }

  runDiagnostic('orchestrator.applyFallbackState.setLevel', () => {
    dispatch(Actions.setLevel(fallbackLevel));
    const bus = getBus();
    hudBus.updateLevel(bus, { level: fallbackLevel });
  }, { context: { level: fallbackLevel } });
  updateLevelDomLabel(fallbackLevel);
  return { state: fallbackState, context: fallbackContext };
}

export function init(opts = {}) {
  let bootstrapDeps;
  try {
    bootstrapDeps = {
      services: {
        audio: getAudioService(),
        dom: getDomService(),
        theme: getOptionalService(TOKENS.THEME),
        debugState: getOptionalService(TOKENS.DEBUG_STATE),
        rng: getOptionalService(TOKENS.RNG),
        constants: getConstantsService(),
        collisions: getOptionalService(TOKENS.COLLISIONS)
      }
    };

    const bootstrapResult = bootstrapController.init(opts, bootstrapDeps) || {};
    const state = bootstrapResult.state || getState();
    const context = bootstrapResult.context || {};
    const services = { ...(bootstrapDeps.services || {}), ...(bootstrapResult.services || {}) };
    const meta = bootstrapResult.meta || {};

    _gameStateRef = state;
    _engineContextRef = context;
    _servicesRef = services;

    const derivedLevel = Number.isFinite(meta.currentLevel) && meta.currentLevel > 0
      ? Math.floor(meta.currentLevel)
      : resolveLevelFromState(state);
    _currentLevel = derivedLevel;

    const derivedEnemySpeed = meta.enemySpeed !== undefined
      ? meta.enemySpeed
      : resolveEnemySpeedFromServices(services, derivedLevel);
    _enemySpeed = derivedEnemySpeed;

    if (services && services.collisions && typeof setCollisions === 'function') {
      setCollisions(services.collisions);
    }

    runDiagnostic('orchestrator.init.setLevel', () => {
      dispatch(Actions.setLevel(_currentLevel));
      const bus = getBus();
      hudBus.updateLevel(bus, { level: _currentLevel });
    }, { context: { level: _currentLevel } });
    updateLevelDomLabel(_currentLevel);

    const hudService = services.hud ?? getOptionalService(TOKENS.HUD);
    let tickerFacade = null;
    if (hudService) {
      if (!services.hud) {
        services.hud = hudService;
      }
      tickerFacade = typeof hudService.getTickerFacade === 'function'
        ? hudService.getTickerFacade()
        : hudService;
      try { configureOverlayTickerFacade(tickerFacade); } catch (_) {}
    }

    const tickerController = tickerFacade && typeof tickerFacade.getController === 'function'
      ? tickerFacade.getController()
      : (hudService && typeof hudService.getTickerController === 'function'
        ? hudService.getTickerController()
        : null);
    const tickerEvents = tickerFacade && typeof tickerFacade.getEvents === 'function'
      ? tickerFacade.getEvents()
      : (hudService && typeof hudService.getTickerEvents === 'function'
        ? hudService.getTickerEvents()
        : null);

    const uiSvc = getUiControllerService();
    if (uiSvc && typeof uiSvc.initHudSubscriptions === 'function') {
      uiSvc.initHudSubscriptions({ tickerController, tickerEvents });
    }

    const render = (context && context.render) || {};
    if (render.board && render.boardCtx) {
      spawnRound({
        gameState: state,
        engineContext: context,
        ctx: render.boardCtx,
        tctx: render.tctx,
        pctx: render.pctx,
        board: render.board,
        trails: render.trails,
        fx: render.fx,
        trailPlayer: render.trailPlayer,
        trailEnemy: render.trailEnemy,
        PLAYER_CYCLE_CORE,
        PLAYER_CYCLE_GLOW,
        ENEMY_CYCLE_CORE,
        ENEMY_CYCLE_GLOW,
        PULSE_SPAN: C.PULSE_SPAN
      });
      if (typeof updateScore === 'function') {
        const scoreValue = state && typeof state.score === 'number' ? state.score : 0;
        updateScore(scoreValue);
      }
      if (typeof spawnPowerUp === 'function') {
        spawnPowerUp();
      }
    }

    if (context && context.render) {
      if (typeof C.PULSE_SPAN !== 'undefined') {
        context.render.PULSE_SPAN = C.PULSE_SPAN;
        if (render.offscreen && typeof render.offscreen.updatePulseSpan === 'function') {
          try { render.offscreen.updatePulseSpan(C.PULSE_SPAN); } catch (_) {}
        }
      }
      context.render.drawBackground = drawBackground;
      context.render.drawWallsGlow = drawWallsGlow;
      if (!render.offscreen || typeof render.offscreen.postFrame !== 'function') {
        context.render.drawFrame = __drawFrame;
      }
    }
    return { state, context };
  } catch (_bootstrapErr) {
    console.error('Critical error during game initialization. Starting with fallback state.', _bootstrapErr);
    return applyFallbackState(bootstrapDeps);
  }
}

export function initInput(doc, ctx) {
  const iSvc = getOptionalService(TOKENS.INPUT);
  if (iSvc && typeof iSvc.initInput === 'function') {
    iSvc.initInput(doc, ctx);
    return;
  }
  runDiagnostic('orchestrator.initInput.controller', () => initInputController(doc, ctx), {
    context: { hasDocument: !!doc }
  });
}

export function startGameFlow(opts) {
  runDiagnostic('orchestrator.flow.startGame', () => _startGameFlow(opts), {
    context: { hasOptions: !!opts }
  });
}

export function pauseGameFlow(opts) {
  runDiagnostic('orchestrator.flow.pauseGame', () => _pauseGameFlow(opts), {
    context: { hasOptions: !!opts }
  });
}

export const gameOverFlow = gameFlowController.gameOverFlow;

export function initInputAdapter(doc, ctx) {
  const iSvc = getOptionalService(TOKENS.INPUT);
  if (iSvc && typeof iSvc.initInput === 'function') {
    iSvc.initInput(doc, ctx);
    return;
  }
  runDiagnostic('orchestrator.initInputAdapter', () => inputAdapterController.initInput(doc, ctx), {
    context: { hasDocument: !!doc }
  });
}

export function getDomRefs() {
  try {
    return getDomService();
  } catch (_domErr) {
    return {};
  }
}

export const initUi = createHudInitializer({
  getServicesRef: () => _servicesRef,
  getDomService,
  getAudioService,
  getState,
  orchestratorCtx
});

export function startGameFull(opts = {}) {
  const constantsSvc = getConstantsService();
  const audioSvc = getAudioService();
  const uiSvc = getUiControllerService();
  const context = createGameRuntimeContext({
    orchestratorCtx,
    services: {
      audio: audioSvc,
      ui: uiSvc,
      constants: constantsSvc,
      bus: getBus()
    },
    selectors: {
      getState,
      getLevel
    },
    controllers: {
      startGame,
      startLoop,
      renderFrame,
      controllerSetEngineActive: _controllerSetEngineActive,
      debugController
    },
    flows: {
      startGameFlow: _startGameFlow
    }
  });
  gameFlowController.startGameFull(opts, context);
}

export function pauseGameFull(opts = {}) {
  const uiSvc = getUiControllerService();
  const context = createGameRuntimeContext({
    orchestratorCtx,
    services: {
      ui: uiSvc,
      bus: getBus()
    },
    selectors: {
      getState
    },
    controllers: {
      pauseGame,
      pauseLoop
    },
    flows: {
      pauseGameFlow: _pauseGameFlow
    }
  });
  gameFlowController.pauseGameFull(opts, context);
}

export function shutdown() {
  try {
    try {
      if (typeof pauseGameFull === 'function') pauseGameFull({});
    } catch (_) {}
  } catch (_) {}
  try {
    if (initUi && typeof initUi.dispose === 'function') {
      initUi.dispose();
    } else if (typeof disposeHudSubscriptions === 'function') {
      disposeHudSubscriptions();
    }
  } catch (_) {}
  try {
    if (typeof resetServices === 'function') resetServices();
  } catch (_) {}
  try {
    resetBootstrapState();
  } catch (_) {}
  return true;
}
