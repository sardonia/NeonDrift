import hudController from '../controllers/hudController.js';
import { disposeHudSubscriptions } from '../controllers/uiController.js';
import { createScopeContext, TOKENS } from '../../services/index.js';
import { runDiagnostic } from './diagnostics.js';

/**
 * Creates an initUi function bound to the orchestrator runtime context.
 * @param {{
 *   getServicesRef: () => Record<string, any> | null | undefined,
 *   getDomService: () => any,
 *   getAudioService: () => any,
 *   getState: () => any,
 *   orchestratorCtx: Record<string, any>
 * }} deps
 */
export function createHudInitializer({
  getServicesRef,
  getDomService,
  getAudioService,
  getState,
  orchestratorCtx
}) {
  let hudScopeContext = null;

  const teardownScope = () => {
    if (!hudScopeContext) {
      return;
    }
    try {
      hudScopeContext.dispose();
    } catch (_) {}
    hudScopeContext = null;
  };

  const initUi = function initUi({
    startRound: startRoundCb,
    pauseGame: pauseGameCb,
    startGame: startGameCb,
    proceedToNextLevel: nextLevelCb
  } = {}) {
    teardownScope();

    hudScopeContext = createScopeContext({
      onDispose: () => {
        try { disposeHudSubscriptions(); } catch (_) {}
      }
    });

    const services = typeof getServicesRef === 'function' ? getServicesRef() : undefined;
    const context = {
      hasDom: !!(services && services.dom),
      hasAudio: !!(services && services.audio)
    };

    runDiagnostic('orchestrator.initUi.hudController', () => {
      const domSvc = typeof getDomService === 'function' ? getDomService() : undefined;
      const audioSvc = typeof getAudioService === 'function' ? getAudioService() : undefined;
      const debugStateSvc = services && services.debugState
        ? services.debugState
        : hudScopeContext.get(TOKENS.DEBUG_STATE);
      const themeSvc = services && services.theme
        ? services.theme
        : hudScopeContext.get(TOKENS.THEME);
      const rngSvc = services && services.rng
        ? services.rng
        : hudScopeContext.get(TOKENS.RNG);
      const collisionsSvc = services && services.collisions
        ? services.collisions
        : hudScopeContext.get(TOKENS.COLLISIONS);
      const hudSvc = hudScopeContext.get(TOKENS.HUD);
      const uiSvc = hudScopeContext.get(TOKENS.UI);

      if (uiSvc && typeof uiSvc.initHudSubscriptions === 'function') {
        try { uiSvc.initHudSubscriptions(); } catch (_) {}
      }

      const resolveGameStateRef = () => {
        try {
          return orchestratorCtx.gameStateRef;
        } catch (_) {
          return undefined;
        }
      };

      hudController.init({
        DOM: domSvc,
        startRound: startRoundCb,
        pauseGame: pauseGameCb,
        startGame: startGameCb,
        proceedToNextLevel: nextLevelCb,
        getState,
        gameStateRef: resolveGameStateRef,
        audio: audioSvc,
        debugState: debugStateSvc,
        theme: themeSvc,
        rng: rngSvc,
        collisions: collisionsSvc,
        hud: hudSvc
      });
    }, { context: { ...context, hasScope: true } });
  };

  initUi.dispose = () => {
    if (hudScopeContext) {
      teardownScope();
      return;
    }
    try { disposeHudSubscriptions(); } catch (_) {}
  };

  return initUi;
}

export default {
  createHudInitializer
};
