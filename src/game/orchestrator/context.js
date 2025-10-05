// @ts-check

import { hudBus } from '../core/events.js';

/**
 * @typedef {Object} LoopContext
 * @property {(options?: unknown) => unknown | undefined} [start]
 * @property {() => unknown | undefined} [pause]
 * @property {() => unknown | undefined} [resume]
 * @property {(args: unknown) => unknown | undefined} [renderFrame]
 * @property {{ start?: Function, pause?: Function }} [flows]
 * @property {(active: boolean, refs?: { playerEngineRef?: { current: unknown } | null, enemyEngineRef?: { current: unknown } |
null }) => unknown | undefined} [setEngineActive]
 * @property {{ startGame?: Function, pauseGame?: Function, startRound?: Function }} [actions]
 */

/**
 * @typedef {Object} AudioContext
 * @property {Record<string, unknown> | null} service
 */

/**
 * @typedef {Object} HudContext
 * @property {Record<string, unknown> | null} controller
 * @property {Record<string, unknown> | null} dom
 * @property {unknown} bus
 * @property {Function | undefined} [showCountdown]
 * @property {Function | undefined} [hidePausePanel]
 * @property {Function | undefined} [showPausePanel]
 * @property {Function | undefined} [updatePauseMessage]
 * @property {(kind: string, payload?: any) => void} [showOverlay]
 * @property {(kind: string) => void} [hideOverlay]
 * @property {() => any} [getBgm]
 */

/**
 * @typedef {Object} RoundContext
 * @property {() => Record<string, unknown>} getSpawnParams
 * @property {() => unknown} spawn
 * @property {() => Function} getResetPowerUps
 * @property {(level: number) => unknown} [computeEnemySpeed]
 * @property {(level: number) => unknown} [setLevel]
 * @property {(score: number) => unknown} [updateScore]
 * @property {{ start?: Function, next?: Function }} [helpers]
 * @property {Function | undefined} [startRound]
 * @property {Function | undefined} [startGame]
 * @property {() => unknown} getState
 * @property {Record<string, unknown> | null} constants
 * @property {Record<string, unknown>} cycleColours
 */

/**
 * @typedef {Object} StateContext
 * @property {Record<string, unknown> | null} ref
 * @property {() => Record<string, unknown> | null} [get]
 * @property {() => number | undefined} [getLevel]
 * @property {(level: number) => unknown} [setLevel]
 */

/**
 * @typedef {Object} EngineContext
 * @property {Record<string, unknown> | null} context
 * @property {{ current: unknown } | null} player
 * @property {{ current: unknown } | null} enemy
 * @property {() => { player: { current: unknown }, enemy: { current: unknown } }} cloneRefs
 * @property {(refs: { player?: { current: unknown }, enemy?: { current: unknown } }) => void} syncRefs
 */

/**
 * @typedef {Object} GameRuntimeContext
 * @property {StateContext} state
 * @property {EngineContext} engines
 * @property {LoopContext} loop
 * @property {AudioContext} audio
 * @property {HudContext} hud
 * @property {RoundContext} round
 * @property {Record<string, unknown> | null} constants
 * @property {Record<string, unknown> | null | undefined} [debug]
 */

/**
 * Bind a method to its host object if it exists.
 *
 * @param {Record<string, any> | null | undefined} target
 * @param {string} key
 * @returns {Function | undefined}
 */
function safeBind(target, key) {
  if (target && typeof target[key] === 'function') {
    try {
      return target[key].bind(target);
    } catch (_) {}
  }
  return undefined;
}

/**
 * Create a safe getter for the orchestrator game state.
 *
 * @param {Object} params
 * @param {Record<string, unknown> | null} params.stateRef
 * @param {Function | undefined} params.getState
 * @returns {() => Record<string, unknown> | null}
 */
function createGameStateGetter({ stateRef, getState }) {
  // Always prefer the selector-based accessor over a captured snapshot.
  // The store returns a new immutable object on each dispatch, so any
  // reference captured at bootstrap time will become stale when the
  // level changes or other state updates occur.  By checking
  // getState() first we ensure callers receive the latest state.
  return () => {
    // Prefer the live store access when available.
    if (typeof getState === 'function') {
      try {
        const latest = getState();
        if (latest) {
          return latest;
        }
      } catch (_) {
        // fall through to stateRef
      }
    }
    // Fall back to a cached reference if present. Note: this may be stale
    // if the caller has not updated it on store changes.
    if (stateRef) {
      return stateRef;
    }
    return null;
  };
}

/**
 * Resolve the computeEnemySpeed helper provided by helpers or constants.
 *
 * @param {Object} params
 * @param {Function | undefined} params.computeEnemySpeed
 * @param {Record<string, any> | null} params.constantsSvc
 * @returns {(level: number) => unknown | undefined}
 */
function resolveComputeEnemySpeed({ computeEnemySpeed, constantsSvc }) {
  if (typeof computeEnemySpeed === 'function') {
    return computeEnemySpeed;
  }
  if (constantsSvc && typeof constantsSvc.computeEnemySpeed === 'function') {
    return constantsSvc.computeEnemySpeed.bind(constantsSvc);
  }
  return undefined;
}

/**
 * Build a lazy getter for the power-up reset callback.
 *
 * @param {Object} params
 * @param {Function | undefined} params.createResetPowerUps
 * @param {Function | undefined} params.resetPowerBag
 * @param {Record<string, any> | null} params.domSvc
 * @param {() => Record<string, unknown> | null} params.getGameState
 * @returns {() => Function}
 */
function createResetPowerUpsGetter({ createResetPowerUps, resetPowerBag, domSvc, getGameState, stateRef }) {
  let cachedReset = null;
  return () => {
    if (cachedReset) {
      return cachedReset;
    }
    if (typeof createResetPowerUps === 'function') {
      try {
        const listEl = domSvc && typeof domSvc === 'object' ? domSvc.powerBagList : undefined;
        const fn = createResetPowerUps({
          gameState: getGameState() || stateRef || {},
          resetPowerBag,
          listEl
        });
        if (typeof fn === 'function') {
          cachedReset = fn;
          return cachedReset;
        }
      } catch (_) {}
    }
    cachedReset = () => {};
    return cachedReset;
  };
}

/**
 * Build the spawn parameters getter used by spawner helpers.
 *
 * @param {Object} params
 * @param {Record<string, any> | null} params.engineContext
 * @param {() => Record<string, unknown> | null} params.getGameState
 * @param {Record<string, any> | null} params.constantsSvc
 * @param {Record<string, unknown>} params.cycleColours
 * @returns {() => Record<string, any>}
 */
function createSpawnParamsGetter({ engineContext, getGameState, constantsSvc, cycleColours }) {
  const colours = cycleColours || {};
  return () => {
    const render = engineContext && typeof engineContext === 'object' ? engineContext.render : undefined;
    return {
      gameState: getGameState(),
      engineContext,
      ctx: render && render.boardCtx,
      tctx: render && render.tctx,
      pctx: render && render.pctx,
      board: render && render.board,
      trails: render && render.trails,
      fx: render && render.fx,
      trailPlayer: render && render.trailPlayer,
      trailEnemy: render && render.trailEnemy,
      PLAYER_CYCLE_CORE: colours.PLAYER_CYCLE_CORE,
      PLAYER_CYCLE_GLOW: colours.PLAYER_CYCLE_GLOW,
      ENEMY_CYCLE_CORE: colours.ENEMY_CYCLE_CORE,
      ENEMY_CYCLE_GLOW: colours.ENEMY_CYCLE_GLOW,
      PULSE_SPAN: constantsSvc ? constantsSvc.PULSE_SPAN : undefined
    };
  };
}

/**
 * Create the spawn helper that wraps the provided spawnRound helper.
 *
 * @param {Object} params
 * @param {Function | undefined} params.spawnRound
 * @param {() => Record<string, any>} params.getSpawnParams
 * @returns {() => unknown}
 */
function createSpawn({ spawnRound, getSpawnParams }) {
  return () => {
    if (typeof spawnRound === 'function') {
      try {
        return spawnRound(getSpawnParams());
      } catch (_) {}
    }
    return undefined;
  };
}

/**
 * Construct the loop slice exposed to controllers.
 *
 * @param {Object} params
 * @param {Function | undefined} params.startLoop
 * @param {Function | undefined} params.pauseLoop
 * @param {Function | undefined} params.resumeLoop
 * @param {Function | undefined} params.renderFrame
 * @param {Function | undefined} params.startGameFlow
 * @param {Function | undefined} params.pauseGameFlow
 * @param {Function | undefined} params.controllerSetEngineActive
 * @param {Function | undefined} params.startGame
 * @param {Function | undefined} params.pauseGame
 * @param {Function | undefined} params.startRound
 * @param {{ current: unknown } | null} params.playerEngineRef
 * @param {{ current: unknown } | null} params.enemyEngineRef
 * @returns {LoopContext}
 */
function createLoopSlice({
  startLoop,
  pauseLoop,
  resumeLoop,
  renderFrame,
  startGameFlow,
  pauseGameFlow,
  controllerSetEngineActive,
  startGame,
  pauseGame,
  startRound,
  playerEngineRef,
  enemyEngineRef
}) {
  return {
    start: typeof startLoop === 'function' ? startLoop : undefined,
    pause: typeof pauseLoop === 'function' ? pauseLoop : undefined,
    resume: typeof resumeLoop === 'function' ? resumeLoop : undefined,
    renderFrame: typeof renderFrame === 'function' ? renderFrame : undefined,
    flows: {
      start: typeof startGameFlow === 'function' ? startGameFlow : undefined,
      pause: typeof pauseGameFlow === 'function' ? pauseGameFlow : undefined
    },
    setEngineActive(active, refs = { playerEngineRef, enemyEngineRef }) {
      if (typeof controllerSetEngineActive === 'function') {
        try {
          return controllerSetEngineActive(active, refs);
        } catch (_) {
          return undefined;
        }
      }
      return undefined;
    },
    actions: {
      startGame: typeof startGame === 'function' ? startGame : undefined,
      pauseGame: typeof pauseGame === 'function' ? pauseGame : undefined,
      startRound: typeof startRound === 'function' ? startRound : undefined
    }
  };
}

/**
 * Construct the audio slice.
 *
 * @param {Object} params
 * @param {Record<string, unknown> | null} params.audioSvc
 * @returns {AudioContext}
 */
function createAudioSlice({ audioSvc }) {
  return {
    service: audioSvc || null
  };
}

/**
 * Construct the HUD slice with bound helpers.
 *
 * @param {Object} params
 * @param {Record<string, any> | null} params.uiController
 * @param {Record<string, any> | null} params.domSvc
 * @param {unknown} params.bus
 * @returns {HudContext}
 */
function createHudSlice({ uiController, domSvc, bus }) {
  return {
    service: uiController || null,
    controller: uiController || null,
    dom: domSvc || null,
    bus,
    showCountdown: safeBind(uiController, 'showCountdown'),
    hidePausePanel: safeBind(uiController, 'hidePausePanel'),
    showPausePanel: safeBind(uiController, 'showPausePanel'),
    updatePauseMessage: safeBind(uiController, 'updatePauseMessage'),
    showOverlay(kind, payload) {
      try {
        hudBus.showOverlay(bus, { kind, data: payload });
      } catch (_) {}
    },
    hideOverlay(kind) {
      try {
        hudBus.hideOverlay(bus, { kind });
      } catch (_) {}
    },
    getBgm() {
      if (domSvc && typeof domSvc === 'object') {
        return domSvc.bgm || null;
      }
      return null;
    }
  };
}

/**
 * Construct the state slice that proxies the orchestrator state refs.
 *
 * @param {Object} params
 * @param {Record<string, unknown> | null} params.stateRef
 * @param {Function | undefined} params.getState
 * @param {Function | undefined} params.getLevel
 * @param {Function | undefined} params.updateLevel
 * @returns {StateContext}
 */
function createStateSlice({ stateRef, getState, getLevel, updateLevel }) {
  return {
    ref: stateRef || null,
    get: typeof getState === 'function'
      ? () => {
          try {
            return getState();
          } catch (_) {
            return stateRef || null;
          }
        }
      : undefined,
    getLevel: typeof getLevel === 'function'
      ? () => {
          try {
            return getLevel();
          } catch (_) {
            return undefined;
          }
        }
      : undefined,
    setLevel: typeof updateLevel === 'function'
      ? (level) => {
          try {
            return updateLevel(level);
          } catch (_) {
            return undefined;
          }
        }
      : undefined
  };
}

/**
 * Construct the engine slice that mirrors the orchestrator refs.
 *
 * @param {Object} params
 * @param {Record<string, any> | null} params.engineContext
 * @param {{ current: unknown } | null} params.playerEngineRef
 * @param {{ current: unknown } | null} params.enemyEngineRef
 * @returns {EngineContext}
 */
function createEngineSlice({ engineContext, playerEngineRef, enemyEngineRef }) {
  return {
    context: engineContext || null,
    player: playerEngineRef || null,
    enemy: enemyEngineRef || null,
    cloneRefs() {
      return {
        player: { current: playerEngineRef ? playerEngineRef.current : null },
        enemy: { current: enemyEngineRef ? enemyEngineRef.current : null }
      };
    },
    syncRefs({ player, enemy } = {}) {
      const playerRef = playerEngineRef;
      const enemyRef = enemyEngineRef;
      try {
        if (playerRef && player && typeof player === 'object' && 'current' in player) {
          playerRef.current = player.current;
        }
        if (enemyRef && enemy && typeof enemy === 'object' && 'current' in enemy) {
          enemyRef.current = enemy.current;
        }
      } catch (_) {}
      try {
        if (engineContext && typeof engineContext === 'object') {
          if (playerRef) {
            engineContext.playerEngine = playerRef.current;
          }
          if (enemyRef) {
            engineContext.enemyEngine = enemyRef.current;
          }
        }
      } catch (_) {}
    }
  };
}

/**
 * Construct the round slice combining spawn helpers and scoring utilities.
 *
 * @param {Object} params
 * @param {Function | undefined} params.spawnRound
 * @param {Function | undefined} params.startRoundHelper
 * @param {Function | undefined} params.nextLevelHelper
 * @param {Function | undefined} params.startRound
 * @param {Function | undefined} params.startGame
 * @param {Function | undefined} params.updateLevel
 * @param {Function | undefined} params.updateScore
 * @param {Function | undefined} params.computeEnemySpeed
 * @param {Record<string, any> | null} params.constantsSvc
 * @param {() => Record<string, unknown> | null} params.getGameState
 * @param {Record<string, any> | null} params.engineContext
 * @param {Record<string, any> | null} params.domSvc
 * @param {Record<string, unknown>} params.cycleColours
 * @param {Function | undefined} params.resetPowerBag
 * @param {Function | undefined} params.createResetPowerUps
 * @returns {RoundContext}
 */
function createRoundSlice({
  spawnRound,
  startRoundHelper,
  nextLevelHelper,
  startRound,
  startGame,
  updateLevel,
  updateScore,
  computeEnemySpeed,
  constantsSvc,
  getGameState,
  engineContext,
  domSvc,
  cycleColours,
  resetPowerBag,
  createResetPowerUps,
  stateRef
}) {
  const getResetPowerUps = createResetPowerUpsGetter({
    createResetPowerUps,
    resetPowerBag,
    domSvc,
    getGameState,
    stateRef
  });
  const getSpawnParams = createSpawnParamsGetter({
    engineContext,
    getGameState,
    constantsSvc,
    cycleColours: cycleColours || {}
  });
  const spawn = createSpawn({ spawnRound, getSpawnParams });
  const computeEnemySpeedFn = resolveComputeEnemySpeed({ computeEnemySpeed, constantsSvc });
  const setLevel = typeof updateLevel === 'function'
    ? (level) => {
        try {
          return updateLevel(level);
        } catch (_) {
          return undefined;
        }
      }
    : undefined;
  const updateScoreFn = typeof updateScore === 'function'
    ? (score) => {
        try {
          return updateScore(score);
        } catch (_) {
          return undefined;
        }
      }
    : undefined;

  return {
    getSpawnParams,
    spawn,
    getResetPowerUps,
    computeEnemySpeed: computeEnemySpeedFn,
    setLevel,
    updateScore: updateScoreFn,
    helpers: {
      start: typeof startRoundHelper === 'function' ? startRoundHelper : undefined,
      next: typeof nextLevelHelper === 'function' ? nextLevelHelper : undefined
    },
    startRound: typeof startRound === 'function' ? startRound : undefined,
    startGame: typeof startGame === 'function' ? startGame : undefined,
    getState: getGameState,
    constants: constantsSvc || null,
    cycleColours: cycleColours || {}
  };
}

/**
 * Build a runtime context that controllers can rely on without needing to
 * understand how the orchestrator wires services together. The resulting
 * object exposes typed sub-contexts that mirror the responsibilities of the
 * runtime subsystems:
 *
 *   • `loop`    – orchestration around the main game loop and engine toggles.
 *   • `audio`   – the active audio service instance.
 *   • `hud`     – DOM/UI helpers along with the event bus reference.
 *   • `round`   – helpers for spawning entities and round management.
 *   • `state`   – access to the canonical game state and level setters.
 *   • `engines` – references to player/enemy engines and context sync tools.
 *
 * Controllers consume these slices so that call sites only need to construct
 * the context once via this factory.
 *
 * @param {Object} params
 * @param {Object} params.orchestratorCtx
 * @param {Object} [params.services]
 * @param {Record<string, unknown>} [params.services.audio]
 * @param {Record<string, unknown>} [params.services.dom]
 * @param {Record<string, unknown>} [params.services.ui]
 * @param {Record<string, unknown>} [params.services.constants]
 * @param {unknown} [params.services.bus]
 * @param {Object} [params.flows]
 * @param {Function} [params.flows.startGameFlow]
 * @param {Function} [params.flows.pauseGameFlow]
 * @param {Object} [params.controllers]
 * @param {Function} [params.controllers.startLoop]
 * @param {Function} [params.controllers.pauseLoop]
 * @param {Function} [params.controllers.resumeLoop]
 * @param {Function} [params.controllers.renderFrame]
 * @param {Function} [params.controllers.controllerSetEngineActive]
 * @param {Function} [params.controllers.startGame]
 * @param {Function} [params.controllers.pauseGame]
 * @param {Function} [params.controllers.startRound]
 * @param {Object} [params.controllers.debugController]
 * @param {Object} [params.helpers]
 * @param {Function} [params.helpers.createResetPowerUps]
 * @param {Function} [params.helpers.resetPowerBag]
 * @param {Function} [params.helpers.computeEnemySpeed]
 * @param {Function} [params.helpers.updateLevel]
 * @param {Function} [params.helpers.updateScore]
 * @param {Function} [params.helpers.spawnRound]
 * @param {Function} [params.helpers.startRoundHelper]
 * @param {Function} [params.helpers.nextLevelHelper]
 * @param {Record<string, unknown>} [params.helpers.cycleColours]
 * @param {Object} [params.selectors]
 * @param {Function} [params.selectors.getState]
 * @param {Function} [params.selectors.getLevel]
 * @returns {GameRuntimeContext}
 */
export function createGameRuntimeContext({
  orchestratorCtx,
  services = {},
  flows = {},
  controllers = {},
  helpers = {},
  selectors = {}
} = {}) {
  if (!orchestratorCtx) {
    throw new Error('createGameRuntimeContext requires an orchestratorCtx');
  }

  const {
    audio: audioSvc = null,
    dom: domSvc = null,
    ui: uiController = null,
    constants: constantsSvc = null,
    bus
  } = services;

  const {
    startGameFlow,
    pauseGameFlow
  } = flows;

  const {
    startLoop,
    pauseLoop,
    resumeLoop,
    renderFrame,
    controllerSetEngineActive,
    startGame,
    pauseGame,
    startRound,
    debugController
  } = controllers;

  const {
    createResetPowerUps,
    resetPowerBag,
    computeEnemySpeed,
    updateLevel,
    updateScore,
    spawnRound,
    startRoundHelper,
    nextLevelHelper,
    cycleColours = {}
  } = helpers;

  const {
    getState,
    getLevel
  } = selectors;

  const stateRef = orchestratorCtx.gameStateRef || null;
  const engineContext = orchestratorCtx.engineContextRef || null;
  const playerEngineRef = orchestratorCtx.playerEngineRef || null;
  const enemyEngineRef = orchestratorCtx.enemyEngineRef || null;

  const getGameState = createGameStateGetter({ stateRef, getState });

  const state = createStateSlice({ stateRef, getState, getLevel, updateLevel });
  const engines = createEngineSlice({ engineContext, playerEngineRef, enemyEngineRef });
  const loop = createLoopSlice({
    startLoop,
    pauseLoop,
    resumeLoop,
    renderFrame,
    startGameFlow,
    pauseGameFlow,
    controllerSetEngineActive,
    startGame,
    pauseGame,
    startRound,
    playerEngineRef,
    enemyEngineRef
  });
  const audio = createAudioSlice({ audioSvc });
  const hud = createHudSlice({ uiController, domSvc, bus });
  const round = createRoundSlice({
    spawnRound,
    startRoundHelper,
    nextLevelHelper,
    startRound,
    startGame,
    updateLevel,
    updateScore,
    computeEnemySpeed,
    constantsSvc,
    getGameState,
    engineContext,
    domSvc,
    cycleColours,
    resetPowerBag,
    createResetPowerUps,
    stateRef
  });

  return {
    state,
    engines,
    loop,
    audio,
    hud,
    round,
    constants: constantsSvc || null,
    debug: debugController || null
  };
}

export default { createGameRuntimeContext };
