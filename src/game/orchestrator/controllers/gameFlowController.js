import uiController from './uiController.js';
import { gameOverFlow as _gameOverFlow } from './rootGameFlowController.js';
import { startRoundFlow, proceedToNextLevelFlow } from './roundController.js';
import { executeWithDiagnostics } from '../../utils/safe.js';
import {
  enforceStartGameFullOptions,
  enforceStartRoundOptions,
  enforceProceedToNextLevelOptions,
  assertTickDependencies
} from '../contracts.js';

/**
 * @typedef {import('../context.js').GameRuntimeContext} GameRuntimeContext
 * @typedef {import('../types').StartGameFullOptions} StartGameFullOptions
 * @typedef {import('../types').StartRoundOptions} StartRoundOptions
 * @typedef {import('../types').ProceedToNextLevelOptions} ProceedToNextLevelOptions
 * @typedef {import('../types').TickDependencies} TickDependencies
 * @typedef {import('../types').RoundLevelResult} RoundLevelResult
 */

/**
 * Ensure the runtime context exposes the required slices before executing a
 * controller.
 *
 * @param {GameRuntimeContext | undefined} context
 * @param {string[]} slices
 * @param {string} caller
 * @returns {GameRuntimeContext}
 */
function ensureRuntimeSlices(context, slices, caller) {
  if (!context || typeof context !== 'object') {
    throw new Error(`[gameFlowController] ${caller} requires a GameRuntimeContext`);
  }
  for (const slice of slices) {
    if (!context[slice]) {
      throw new Error(`[gameFlowController] ${caller} requires context.${slice}`);
    }
  }
  return context;
}

function runGameFlowDiagnostic(flow, action, fn, options = {}) {
  const { context, ...rest } = options || {};
  const mergedContext = {
    controller: 'gameFlowController',
    flow,
    action,
    ...(context || {})
  };
  return executeWithDiagnostics(`gameFlowController.${flow}.${action}`, fn, {
    context: mergedContext,
    ...rest
  });
}
export function gameOverFlow(opts = {}) {
  const showGameOverFn = runGameFlowDiagnostic('gameOver', 'resolveHandler', () => {
    if (typeof opts.showGameOver === 'function') {
      return opts.showGameOver;
    }
    if (typeof uiController.showGameOverOverlay === 'function') {
      return (args) => runGameFlowDiagnostic('gameOver', 'showOverlay', () => {
        uiController.showGameOverOverlay(args);
      }, { context: { hasArgs: !!args } });
    }
    return undefined;
  }, { context: { hasCustomHandler: typeof opts.showGameOver === 'function' } });

  runGameFlowDiagnostic('gameOver', 'invokeFlow', () => {
    _gameOverFlow({ ...opts, showGameOver: showGameOverFn });
  });
}
export default {
  gameOverFlow,
  startGameFull,
  pauseGameFull,
  startRound,
  proceedToNextLevel
};
/**
 * @param {StartGameFullOptions | undefined} opts
 * @param {GameRuntimeContext | undefined} context
 */
export function startGameFull(opts = {}, context = /** @type {GameRuntimeContext} */ ({}) ) {
  const runtime = ensureRuntimeSlices(context, ['state', 'engines', 'loop', 'audio', 'hud'], 'startGameFull');
  const options = enforceStartGameFullOptions(opts);
  const {
    state = {},
    engines = {},
    loop = {},
    audio = {},
    hud = {},
    constants: Consts = null,
    debug: dbgCtrl
  } = runtime;

  const {
    draw,
    gameOver,
    resetPowerUps,
    updateScore: updScore,
    hidePausePanel: hidePauseOpt,
    showPausePanel: showPauseOpt,
    panel,
    overlay,
    proceedToNextLevel: procNext,
    preset = 'arcade',
    onFrame
  } = options;

  const hidePause = typeof hidePauseOpt === 'function'
    ? hidePauseOpt
    : (hud.hidePausePanel || (hud.controller && hud.controller.hidePausePanel));
  const showPause = typeof showPauseOpt === 'function'
    ? showPauseOpt
    : (hud.showPausePanel || (hud.controller && hud.controller.showPausePanel));

  const gameState = state.ref || (typeof state.get === 'function' ? state.get() : undefined);
  const engineContext = engines.context;
  const bus = hud && hud.bus;

  const drawFn = typeof draw === 'function'
    ? draw
    : function() {
        runGameFlowDiagnostic('startGameFull', 'drawFrame', () => {
          if (engineContext && engineContext.render && typeof engineContext.render.drawFrame === 'function') {
            const render = engineContext.render;
            const gs = engineContext.state || gameState;
            render.drawFrame({
              ctx: render.boardCtx,
              pctx: render.pctx,
              fx: render.fx,
              gameState: gs,
              engineContext,
              PLAYER_CYCLE_CORE: render.colors && render.colors.playerCore,
              PLAYER_CYCLE_GLOW: render.colors && render.colors.playerGlow,
              ENEMY_CYCLE_CORE: render.colors && render.colors.enemyCore,
              ENEMY_CYCLE_GLOW: render.colors && render.colors.enemyGlow,
              trailPlayer: gs && Array.isArray(gs.trailPlayer) ? gs.trailPlayer : render.trailPlayer,
              trailEnemy: gs && Array.isArray(gs.trailEnemy) ? gs.trailEnemy : render.trailEnemy,
              PULSE_SPAN: render.PULSE_SPAN
            });
          }
        }, { context: { hasRender: !!(engineContext && engineContext.render) }, bus });
      };

  const onFrameFn = typeof onFrame === 'function'
    ? onFrame
    : function(dt) {
        runGameFlowDiagnostic('startGameFull', 'recordFrame', () => {
          if (dbgCtrl && typeof dbgCtrl.recordFrame === 'function') {
            dbgCtrl.recordFrame(dt);
          }
        }, { context: { hasRecorder: !!(dbgCtrl && dbgCtrl.recordFrame) }, bus });
      };

  const tickDeps = assertTickDependencies('gameFlowController.startGameFull', {
    audio: audio.service,
    draw: drawFn,
    gameOver,
    resetPowerUps,
    updateScore: updScore,
    hidePausePanel: hidePause,
    showPausePanel: showPause,
    panel,
    overlay,
    proceedToNextLevel: procNext,
    LEVEL: typeof state.getLevel === 'function' ? state.getLevel() : undefined,
    MAX_LEVEL: Consts ? Consts.MAX_LEVEL : undefined,
    COLS: Consts ? Consts.COLS : undefined,
    preset,
    interval: null,
    trailPlayer: engineContext && engineContext.render ? engineContext.render.trailPlayer : undefined,
    trailEnemy: engineContext && engineContext.render ? engineContext.render.trailEnemy : undefined,
    keysHeld: engineContext && engineContext.keysHeld ? engineContext.keysHeld : undefined
  });

  runGameFlowDiagnostic('startGameFull', 'startLoopFlow', () => {
    const startFlow = loop.flows ? loop.flows.start : undefined;
    if (typeof startFlow === 'function') {
      startFlow({
        hidePausePanel: hidePause,
        orchestratorStartGame: loop.actions ? loop.actions.startGame : undefined,
        playerEngineRef: engines.player,
        enemyEngineRef: engines.enemy,
        gameState,
        engineContext,
        startLoopController: loop.start,
        draw: drawFn,
        onFrame: onFrameFn,
        tickDeps,
        bus
      });
    }
  }, { context: { hasStartFlow: !!(loop.flows && loop.flows.start) }, bus });

  runGameFlowDiagnostic('startGameFull', 'syncEngineRefs', () => {
    if (typeof engines.syncRefs === 'function') {
      engines.syncRefs({ player: engines.player, enemy: engines.enemy });
    }
  }, { context: { hasSyncRefs: typeof engines.syncRefs === 'function' }, bus });

  runGameFlowDiagnostic('startGameFull', 'setEngineActive', () => {
    if (typeof loop.setEngineActive === 'function') {
      loop.setEngineActive(true);
    }
  }, { context: { active: true, hasSetter: typeof loop.setEngineActive === 'function' }, bus });
}
export function pauseGameFull(opts = {}, context = /** @type {GameRuntimeContext} */ ({}) ) {
  const runtime = ensureRuntimeSlices(context, ['state', 'engines', 'loop', 'hud'], 'pauseGameFull');
  const { showPausePanel: showPauseOpt, updatePauseMessage: updPauseOpt } = opts;
  const { state = {}, engines = {}, loop = {}, hud = {} } = runtime;

  const showPause = typeof showPauseOpt === 'function'
    ? showPauseOpt
    : (hud.showPausePanel || (hud.controller && hud.controller.showPausePanel));
  const updatePauseMsg = typeof updPauseOpt === 'function'
    ? updPauseOpt
    : (hud.updatePauseMessage || (hud.controller && hud.controller.updatePauseMessage));

  const gameState = state.ref || (typeof state.get === 'function' ? state.get() : undefined);
  const intervalRef = { current: null };
  const bus = hud && hud.bus;

  runGameFlowDiagnostic('pauseGameFull', 'pauseLoopFlow', () => {
    const pauseFlow = loop.flows ? loop.flows.pause : undefined;
    if (typeof pauseFlow === 'function') {
      pauseFlow({
        orchestratorPauseGame: loop.actions ? loop.actions.pauseGame : undefined,
        gameState,
        intervalRef,
        playerEngineRef: engines.player,
        enemyEngineRef: engines.enemy,
        pauseLoopController: loop.pause,
        showPausePanel: showPause,
        updatePauseMessage: updatePauseMsg,
        bus
      });
    }
  }, { context: { hasPauseFlow: !!(loop.flows && loop.flows.pause) }, bus });

  runGameFlowDiagnostic('pauseGameFull', 'syncEngineRefs', () => {
    if (typeof engines.syncRefs === 'function') {
      engines.syncRefs({ player: engines.player, enemy: engines.enemy });
    }
  }, { context: { hasSyncRefs: typeof engines.syncRefs === 'function' }, bus });
}
/**
 * @param {StartRoundOptions | undefined} opts
 * @param {GameRuntimeContext | undefined} context
 */
export function startRound(opts = {}, context = /** @type {GameRuntimeContext} */ ({}) ) {
  const options = enforceStartRoundOptions(opts);
  const {
    resetLevel1 = false,
    onStartGame,
    transitions: startTransitions,
    transitionToCountdown
  } = options;
  const runtime = ensureRuntimeSlices(context, ['engines', 'loop', 'round'], 'startRound');
  const { engines = {}, loop = {}, round = {} } = runtime;

  const intervalRef = { current: null };
  const cloned = typeof engines.cloneRefs === 'function'
    ? engines.cloneRefs()
    : {
        player: { current: engines.player ? engines.player.current : null },
        enemy: { current: engines.enemy ? engines.enemy.current : null }
      };

  const playerRef = cloned.player;
  const enemyRef = cloned.enemy;
  const fallbackStartGame = round.startGame || (loop.actions ? loop.actions.startGame : undefined);
  const startGameCallback = typeof onStartGame === 'function' ? onStartGame : fallbackStartGame;
  const transitions = startTransitions
    ? startTransitions
    : (typeof transitionToCountdown === 'function' ? { toCountdown: transitionToCountdown } : undefined);

  runGameFlowDiagnostic('startRound', 'startFlow', () => {
    if (typeof startRoundFlow === 'function') {
      const startArgs = {
        intervalRef,
        resetLevel1: !!resetLevel1,
        playerEngineRef: playerRef,
        enemyEngineRef: enemyRef,
        startGame: startGameCallback,
        transitions
      };
      if (typeof transitionToCountdown === 'function') {
        startArgs.transitionToCountdown = transitionToCountdown;
      }
      startRoundFlow(startArgs, runtime);
    }
  }, { context: { resetLevel1: !!resetLevel1, hasStartFlow: typeof startRoundFlow === 'function' } });

  runGameFlowDiagnostic('startRound', 'syncEngineRefs', () => {
    if (typeof engines.syncRefs === 'function') {
      engines.syncRefs({ player: playerRef, enemy: enemyRef });
    }
  }, { context: { hasSyncRefs: typeof engines.syncRefs === 'function' } });
}
/**
 * @param {ProceedToNextLevelOptions | undefined} opts
 * @param {GameRuntimeContext | undefined} context
 * @returns {RoundLevelResult | undefined}
 */
export function proceedToNextLevel(opts = {}, context = /** @type {GameRuntimeContext} */ ({}) ) {
  const options = enforceProceedToNextLevelOptions(opts);
  const { onStartGame } = options;
  const runtime = ensureRuntimeSlices(context, ['state', 'round'], 'proceedToNextLevel');
  const { state = {}, round = {}, constants: Consts = null } = runtime;

  const out = runGameFlowDiagnostic('proceedToNextLevel', 'invokeFlow', () => {
    return proceedToNextLevelFlow({ onStartGame }, runtime);
  }, { context: { hasFlow: typeof proceedToNextLevelFlow === 'function' } });

  const currentLevel = runGameFlowDiagnostic('proceedToNextLevel', 'resolveCurrentLevel', () => {
    if (typeof state.getLevel === 'function') {
      return state.getLevel();
    }
    const gs = state.ref || (typeof state.get === 'function' ? state.get() : undefined);
    return gs && typeof gs.level === 'number' ? gs.level : undefined;
  }, { context: { hasStateSelector: typeof state.getLevel === 'function' } });

  const nextLevel = runGameFlowDiagnostic('proceedToNextLevel', 'determineNextLevel', () => {
    if (out && typeof out.newLevel === 'number') {
      return out.newLevel;
    }
    if (typeof currentLevel === 'number') {
      const maxLevel = round.constants && typeof round.constants.MAX_LEVEL === 'number'
        ? round.constants.MAX_LEVEL
        : (Consts && typeof Consts.MAX_LEVEL === 'number' ? Consts.MAX_LEVEL : undefined);
      return typeof maxLevel === 'number'
        ? Math.min(maxLevel, (currentLevel | 0) + 1)
        : (currentLevel | 0) + 1;
    }
    return undefined;
  }, {
    context: { currentLevel, helperLevel: out && out.newLevel },
    fallback: () => (typeof currentLevel === 'number' ? (currentLevel | 0) + 1 : undefined)
  });

  runGameFlowDiagnostic('proceedToNextLevel', 'applyLevel', () => {
    if (typeof round.setLevel === 'function' && typeof nextLevel === 'number') {
      round.setLevel(nextLevel);
    }
  }, { context: { nextLevel, hasSetLevel: typeof round.setLevel === 'function' } });

  runGameFlowDiagnostic('proceedToNextLevel', 'startRound', () => {
    const startRoundFn = typeof round.startRound === 'function' ? round.startRound : undefined;
    if (typeof startRoundFn === 'function') {
      startRoundFn({ resetLevel1: false, onStartGame });
    }
  }, { context: { hasStartRound: typeof round.startRound === 'function' } });

  return out;
}
