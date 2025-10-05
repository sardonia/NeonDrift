import { createRoundService } from '../../application/roundService.js';
import {
  enforceStartRoundFlowOptions,
  enforceProceedToNextLevelFlowOptions
} from '../contracts.js';
import { executeWithDiagnostics } from '../../utils/safe.js';

/**
 * @typedef {import('../context.js').GameRuntimeContext} GameRuntimeContext
 * @typedef {import('../types').StartRoundFlowOptions} StartRoundFlowOptions
 * @typedef {import('../types').ProceedToNextLevelFlowOptions} ProceedToNextLevelFlowOptions
 * @typedef {import('../types').RoundLevelResult} RoundLevelResult
 */

/**
 * Guard helpers for the runtime context.
 *
 * @param {GameRuntimeContext | undefined} context
 * @param {string[]} slices
 * @param {string} caller
 * @returns {GameRuntimeContext}
 */
function ensureRuntimeSlices(context, slices, caller) {
  if (!context || typeof context !== 'object') {
    throw new Error(`[roundController] ${caller} requires a GameRuntimeContext`);
  }
  for (const slice of slices) {
    if (!context[slice]) {
      throw new Error(`[roundController] ${caller} requires context.${slice}`);
    }
  }
  return context;
}

function createAudioPort(audioCtx = {}) {
  const getService = () => (audioCtx && audioCtx.service) || null;
  return {
    getService,
    prepareCountdown(bgm) {
      const svc = getService();
      if (svc && typeof svc.prepareCountdown === 'function') {
        svc.prepareCountdown(bgm);
      }
    },
    stopEngines() {
      const svc = getService();
      if (svc && typeof svc.stopEngines === 'function') {
        svc.stopEngines();
      }
    },
    cutAll() {
      const svc = getService();
      if (svc && typeof svc.cutAll === 'function') {
        svc.cutAll();
      }
    },
    killEngines() {
      const svc = getService();
      if (svc && typeof svc.killEngines === 'function') {
        svc.killEngines();
      }
    }
  };
}

/**
 * @param {ProceedToNextLevelFlowOptions | undefined} opts
 * @param {GameRuntimeContext | undefined} context
 * @returns {RoundLevelResult | undefined}
 */
export function proceedToNextLevelFlow(opts = {}, context = /** @type {GameRuntimeContext} */ ({})) {
  const runtime = ensureRuntimeSlices(context, ['state', 'loop', 'audio', 'round', 'hud'], 'proceedToNextLevelFlow');
  const options = enforceProceedToNextLevelFlowOptions(opts);
  const bus = runtime && runtime.hud ? runtime.hud.bus : undefined;
  const safeInvoker = options && typeof options.safe === 'function'
    ? options.safe
    : (fn, label) => {
        const raw = typeof label === 'string' ? label : '';
        const suffix = raw.includes(':') ? raw.split(':').pop() : (raw || 'unknown');
        const diagnosticLabel = `roundController.proceedToNextLevel.${suffix}`;
        executeWithDiagnostics(diagnosticLabel, () => {
          fn();
        }, { bus });
      };
  const service = createRoundService({
    hud: runtime.hud,
    audio: createAudioPort(runtime.audio),
    round: runtime.round,
    state: runtime.state,
    loop: runtime.loop,
    safe: safeInvoker
  });

  return service.proceedToNextLevel();
}

/**
 * @param {StartRoundFlowOptions | undefined} opts
 * @param {GameRuntimeContext | undefined} context
 * @returns {RoundLevelResult | undefined}
 */
export function startRoundFlow(opts = {}, context = /** @type {GameRuntimeContext} */ ({})) {
  const runtime = ensureRuntimeSlices(context, ['state', 'round', 'audio', 'hud'], 'startRoundFlow');
  const options = enforceStartRoundFlowOptions(opts);
  const {
    intervalRef,
    resetLevel1 = false,
    playerEngineRef,
    enemyEngineRef,
    startGame,
    transitions: explicitTransitions,
    transitionToCountdown,
    safe
  } = options;

  const transitions = explicitTransitions
    ? explicitTransitions
    : (typeof transitionToCountdown === 'function'
      ? { toCountdown: transitionToCountdown }
      : undefined);

  const service = createRoundService({
    hud: runtime.hud,
    audio: createAudioPort(runtime.audio),
    round: runtime.round,
    state: runtime.state,
    safe: safe,
    transitions
  });

  return service.startRound({
    intervalRef,
    resetLevel1,
    playerEngineRef,
    enemyEngineRef,
    startGame
  });
}



