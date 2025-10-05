// @ts-check

/**
 * Interface describing the HUD interactions required by the game flow
 * service. Implementations live in the presentation layer and are injected at
 * runtime.
 *
 * @typedef {Object} HudPort
 * @property {(kind: string, payload?: any) => void} [showOverlay]
 * @property {(kind: string) => void} [hideOverlay]
 */

/**
 * Interface describing the audio interactions required by the game flow
 * service. Implementations abstract the concrete audio bus/service wiring so
 * that the application layer remains decoupled.
 *
 * @typedef {Object} GameAudioPort
 * @property {() => void} [prepareForGameplay]
 * @property {() => void} [resumeBus]
 * @property {() => (Record<string, any> | void)} [startEngines]
 * @property {(Record<string, any> | void) => void} [onEnginesStarted]
 * @property {() => void} [playGameplayBgm]
 * @property {() => void} [stopEngines]
 * @property {() => void} [cutAll]
 * @property {() => void} [pauseGameplayBgm]
 */

/**
 * Interface describing coordination of engine references shared between the
 * orchestrator and the audio layer.
 *
 * @typedef {Object} EngineCoordinator
 * @property {(Record<string, any> | void) => void} [updateAudioRefs]
 * @property {() => void} [clearAudioRefs]
 * @property {(boolean) => void} [setActive]
 */

/**
 * State transition helpers for the finite state machine managing the game
 * lifecycle.
 *
 * @typedef {Object} StateTransitions
 * @property {() => void} [toRunning]
 * @property {() => void} [toPaused]
 */

/**
 * Dispatch helpers for updating the game state store.
 *
 * @typedef {Object} FlowDispatchers
 * @property {() => void} [startGame]
 * @property {() => void} [pauseGame]
 */

/**
 * @typedef {(fn: Function, label?: string) => void} SafeInvoker
 */

function createSafeInvoker(safe) {
  if (typeof safe === 'function') {
    return (fn, label) => {
      try {
        safe(fn, label);
      } catch (_) {
        try {
          fn();
        } catch (_) {}
      }
    };
  }
  return (fn) => {
    try {
      fn();
    } catch (_) {}
  };
}

/**
 * Create the application-layer service coordinating the start/pause flows of
 * the game. The service is constructed with ports describing the side-effect
 * boundaries so that infrastructure adapters can be swapped independently of
 * this module.
 *
 * @param {Object} deps
 * @param {HudPort} [deps.hud]
 * @param {GameAudioPort} [deps.audio]
 * @param {EngineCoordinator} [deps.engines]
 * @param {StateTransitions} [deps.transitions]
 * @param {FlowDispatchers} [deps.dispatcher]
 * @param {SafeInvoker} [deps.safe]
 * @param {Object} [deps.pauseOverlay]
 */
export function createGameFlowService({
  hud,
  audio,
  engines,
  transitions,
  dispatcher,
  safe,
  pauseOverlay
} = {}) {
  const invoke = createSafeInvoker(safe);
  const pauseOverlayPayload = pauseOverlay || {
    title: 'PAUSED',
    message: 'Press Space to continue'
  };

  function startGame() {
    if (hud && typeof hud.hideOverlay === 'function') {
      hud.hideOverlay('countdown');
    }

    if (transitions && typeof transitions.toRunning === 'function') {
      transitions.toRunning();
    }

    if (hud && typeof hud.hideOverlay === 'function') {
      hud.hideOverlay('pause');
    }

    invoke(() => {
      if (dispatcher && typeof dispatcher.startGame === 'function') {
        dispatcher.startGame();
      }
    }, 'gameFlow.start:dispatchStart');

    invoke(() => {
      if (audio && typeof audio.prepareForGameplay === 'function') {
        audio.prepareForGameplay();
      }
      if (audio && typeof audio.resumeBus === 'function') {
        audio.resumeBus();
      }
    }, 'gameFlow.start:primeAudio');

    let engineSnapshot;
    invoke(() => {
      if (audio && typeof audio.startEngines === 'function') {
        engineSnapshot = audio.startEngines();
      }
      if (engines && typeof engines.updateAudioRefs === 'function') {
        engines.updateAudioRefs(engineSnapshot);
      }
    }, 'gameFlow.start:engines');

    invoke(() => {
      if (audio && typeof audio.onEnginesStarted === 'function') {
        audio.onEnginesStarted(engineSnapshot);
      }
    }, 'gameFlow.start:onEnginesStarted');

    invoke(() => {
      if (audio && typeof audio.playGameplayBgm === 'function') {
        audio.playGameplayBgm();
      }
    }, 'gameFlow.start:playBgm');
  }

  function pauseGame() {
    if (transitions && typeof transitions.toPaused === 'function') {
      transitions.toPaused();
    }

    if (hud && typeof hud.showOverlay === 'function') {
      hud.showOverlay('pause', pauseOverlayPayload);
    }

    invoke(() => {
      if (dispatcher && typeof dispatcher.pauseGame === 'function') {
        dispatcher.pauseGame();
      }
    }, 'gameFlow.pause:dispatchPause');

    invoke(() => {
      if (engines && typeof engines.setActive === 'function') {
        engines.setActive(false);
      }
    }, 'gameFlow.pause:setInactive');

    invoke(() => {
      if (audio && typeof audio.stopEngines === 'function') {
        audio.stopEngines();
      }
      if (audio && typeof audio.cutAll === 'function') {
        audio.cutAll();
      }
    }, 'gameFlow.pause:stopAudio');

    invoke(() => {
      if (engines && typeof engines.clearAudioRefs === 'function') {
        engines.clearAudioRefs();
      }
    }, 'gameFlow.pause:clearRefs');

    invoke(() => {
      if (audio && typeof audio.pauseGameplayBgm === 'function') {
        audio.pauseGameplayBgm();
      }
    }, 'gameFlow.pause:pauseBgm');
  }

  return {
    startGame,
    pauseGame
  };
}

export default { createGameFlowService };
