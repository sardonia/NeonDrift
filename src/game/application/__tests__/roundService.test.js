// @ts-check

/**
 * Interface describing the HUD interactions required by the round service.
 * Implementations live in the presentation/infrastructure layer.
 *
 * @typedef {Object} HudPort
 * @property {(kind: string, payload?: any) => void} [showOverlay]
 * @property {(kind: string) => void} [hideOverlay]
 * @property {(config: { seconds: number, onDone?: Function }) => void} [showCountdown]
 * @property {() => any} [getBgm]
 */

/**
 * Interface describing the audio interactions required by the round service.
 *
 * @typedef {Object} RoundAudioPort
 * @property {() => any} [getService]
 * @property {(any) => void} [prepareCountdown]
 * @property {() => void} [stopEngines]
 * @property {() => void} [cutAll]
 * @property {() => void} [killEngines]
 */

/**
 * Interface describing access to the round subsystem of the runtime context.
 *
 * @typedef {Object} RoundRuntimePort
 * @property {() => any} [getState]
 * @property {{ start?: Function, next?: Function }} [helpers]
 * @property {() => any} [getResetPowerUps]
 * @property {() => void} [spawn]
 * @property {(number) => void} [setLevel]
 * @property {(number) => number | void} [computeEnemySpeed]
 * @property {(number) => void} [updateScore]
 * @property {{ MAX_LEVEL?: number } | null} [constants]
 */

/**
 * Interface describing state selectors used by the service.
 *
 * @typedef {Object} StateRuntimePort
 * @property {() => number | undefined} [getLevel]
 * @property {any} [ref]
 */

/**
 * Loop control interactions required by the round service.
 *
 * @typedef {Object} LoopRuntimePort
 * @property {() => void} [pause]
 * @property {(boolean) => void} [setEngineActive]
 */

/**
 * Optional engine coordinator used for clearing references when transitioning
 * between rounds.
 *
 * @typedef {Object} EngineCoordinator
 * @property {() => void} [clearAudioRefs]
 * @property {(boolean) => void} [setActive]
 */

/**
 * State transition helpers.
 *
 * @typedef {Object} RoundTransitions
 * @property {() => void} [toCountdown]
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

function resolveGameState(round, state) {
  if (round && typeof round.getState === 'function') {
    try {
      return round.getState();
    } catch (_) {}
  }
  if (state && typeof state.get === 'function') {
    try {
      return state.get();
    } catch (_) {}
  }
  if (state && state.ref) {
    return state.ref;
  }
  return undefined;
}

function resolveLevel(state, gameState) {
  if (state && typeof state.getLevel === 'function') {
    try {
      return state.getLevel();
    } catch (_) {}
  }
  if (gameState && typeof gameState.level === 'number') {
    return gameState.level;
  }
  return undefined;
}

function resolveScore(gameState) {
  if (!gameState || typeof gameState !== 'object') {
    return undefined;
  }
  if (typeof gameState.persistentScore === 'number') {
    return gameState.persistentScore;
  }
  if (typeof gameState.nextLevelCarryScore !== 'undefined') {
    return gameState.nextLevelCarryScore;
  }
  if (typeof gameState.score === 'number') {
    return gameState.score;
  }
  return undefined;
}

/**
 * Factory producing the round service responsible for start/next-level flows.
 *
 * @param {Object} deps
 * @param {HudPort} [deps.hud]
 * @param {RoundAudioPort} [deps.audio]
 * @param {RoundRuntimePort} [deps.round]
 * @param {StateRuntimePort} [deps.state]
 * @param {LoopRuntimePort} [deps.loop]
 * @param {EngineCoordinator} [deps.engines]
 * @param {RoundTransitions} [deps.transitions]
 * @param {SafeInvoker} [deps.safe]
 */
export function createRoundService({
  hud,
  audio,
  round,
  state,
  loop,
  engines,
  transitions,
  safe
} = {}) {
  const invoke = createSafeInvoker(safe);

  function startRound({
    intervalRef,
    resetLevel1 = false,
    playerEngineRef,
    enemyEngineRef,
    startGame
  } = {}) {
    const countdownSeconds = 3;
    const countdownMillis = Math.max(0, Math.round((Number(countdownSeconds) || 0) * 1000));
    const fallbackDelay = countdownMillis + 100;

    let hasStartedGame = false;
    const triggerStartGame = () => {
      if (hasStartedGame) {
        return;
      }
      hasStartedGame = true;
      invoke(() => {
        if (typeof startGame === 'function') {
          startGame();
        }
      }, 'round.start:onCountdownDone');
    };

    if (transitions && typeof transitions.toCountdown === 'function') {
      transitions.toCountdown();
    }

    const gameState = resolveGameState(round, state);
    const resetFactory = round && typeof round.getResetPowerUps === 'function'
      ? round.getResetPowerUps()
      : undefined;
    const resetPowerUps = typeof resetFactory === 'function'
      ? resetFactory
      : () => {};

    const spawn = () => {
      invoke(() => {
        if (round && typeof round.spawn === 'function') {
          round.spawn();
        }
      }, 'round.start:spawn');
      invoke(() => {
        if (round && typeof round.updateScore === 'function') {
          const score = resolveScore(gameState);
          round.updateScore(score);
        }
      }, 'round.start:updateScore');
    };

    let helperResult;
    invoke(() => {
      const helper = round && round.helpers ? round.helpers.start : undefined;
      if (typeof helper === 'function') {
        helperResult = helper({
          gameState,
          intervalRef,
          resetPowerUps,
          setLevel: round ? round.setLevel : undefined,
          computeEnemySpeed: round ? round.computeEnemySpeed : undefined,
          spawn,
          audio: audio && typeof audio.getService === 'function' ? audio.getService() : undefined,
          bgm: hud && typeof hud.getBgm === 'function' ? hud.getBgm() : null,
          showCountdown: hud && typeof hud.showCountdown === 'function' ? hud.showCountdown : undefined,
          startGame,
          resetLevel1,
          playerEngineRef,
          enemyEngineRef
        });
      }
    }, 'round.start:helper');

    invoke(() => {
      resetPowerUps({ clearPickup: true });
    }, 'round.start:resetPowerUps');

    let nextLevel;
    if (helperResult && typeof helperResult.newLevel === 'number') {
      nextLevel = helperResult.newLevel;
    } else if (gameState && typeof gameState.level === 'number') {
      nextLevel = gameState.level;
    } else {
      nextLevel = 1;
    }

    let newEnemySpeed;
    if (helperResult && typeof helperResult.newEnemySpeed !== 'undefined') {
      newEnemySpeed = helperResult.newEnemySpeed;
    } else if (round && typeof round.computeEnemySpeed === 'function') {
      try {
        newEnemySpeed = round.computeEnemySpeed(nextLevel);
      } catch (_) {}
    }

    invoke(() => {
      if (round && typeof round.setLevel === 'function' && typeof nextLevel === 'number') {
        round.setLevel(nextLevel);
      }
    }, 'round.start:setLevel');

    spawn();

    if (hud && typeof hud.showOverlay === 'function') {
      hud.showOverlay('countdown', { seconds: countdownSeconds });
    }

    invoke(() => {
      if (audio && typeof audio.prepareCountdown === 'function') {
        const bgm = hud && typeof hud.getBgm === 'function' ? hud.getBgm() : null;
        audio.prepareCountdown(bgm);
      }
    }, 'round.start:prepareCountdownAudio');

    invoke(() => {
      if (hud && typeof hud.showCountdown === 'function') {
        const scope = typeof globalThis !== 'undefined' ? globalThis : undefined;
        const scheduleTimeout = scope && typeof scope.setTimeout === 'function'
          ? scope.setTimeout.bind(scope)
          : (typeof setTimeout === 'function' ? setTimeout : null);
        const clearScheduledTimeout = scope && typeof scope.clearTimeout === 'function'
          ? scope.clearTimeout.bind(scope)
          : (typeof clearTimeout === 'function' ? clearTimeout : null);
        let fallbackTimer = null;
        if (scheduleTimeout) {
          const delay = Number.isFinite(fallbackDelay) ? fallbackDelay : countdownMillis;
          fallbackTimer = scheduleTimeout(() => {
            fallbackTimer = null;
            triggerStartGame();
          }, delay);
        }
        hud.showCountdown({
          seconds: countdownSeconds,
          onDone: () => {
            if (fallbackTimer !== null && clearScheduledTimeout) {
              try {
                clearScheduledTimeout(fallbackTimer);
              } catch (_) {}
              fallbackTimer = null;
            }
            triggerStartGame();
          }
        });
      } else {
        triggerStartGame();
      }
    }, 'round.start:showCountdown');

    if (helperResult && typeof newEnemySpeed !== 'undefined' && typeof helperResult.newEnemySpeed === 'undefined') {
      helperResult.newEnemySpeed = newEnemySpeed;
    }

    return helperResult;
  }

  function proceedToNextLevel() {
    const gameState = resolveGameState(round, state);

    invoke(() => {
      if (loop && typeof loop.pause === 'function') {
        loop.pause();
      }
    }, 'round.next:pauseLoop');

    invoke(() => {
      if (loop && typeof loop.setEngineActive === 'function') {
        loop.setEngineActive(false);
      } else if (engines && typeof engines.setActive === 'function') {
        engines.setActive(false);
      }
    }, 'round.next:setInactive');

    invoke(() => {
      if (audio && typeof audio.cutAll === 'function') {
        audio.cutAll();
      }
      if (audio && typeof audio.stopEngines === 'function') {
        audio.stopEngines();
      }
      if (audio && typeof audio.killEngines === 'function') {
        audio.killEngines();
      }
    }, 'round.next:audioStop');

    const currentLevel = resolveLevel(state, gameState);
    const maxLevel = round && round.constants && typeof round.constants.MAX_LEVEL === 'number'
      ? round.constants.MAX_LEVEL
      : undefined;

    let helperResult;
    invoke(() => {
      const helper = round && round.helpers ? round.helpers.next : undefined;
      if (typeof helper === 'function') {
        helperResult = helper({
          gameState,
          computeEnemySpeed: round ? round.computeEnemySpeed : undefined,
          LEVEL: currentLevel,
          MAX_LEVEL: maxLevel
        });
      }
    }, 'round.next:helper');

    invoke(() => {
      if (helperResult && typeof helperResult.newLevel === 'number' && round && typeof round.setLevel === 'function') {
        round.setLevel(helperResult.newLevel);
      }
    }, 'round.next:setLevelFromHelper');

    invoke(() => {
      const resetFactory = round && typeof round.getResetPowerUps === 'function'
        ? round.getResetPowerUps()
        : undefined;
      const reset = typeof resetFactory === 'function' ? resetFactory : undefined;
      if (reset) {
        reset({ clearPickup: true });
      }
    }, 'round.next:resetPowerUps');

    let nextLevel = currentLevel;
    if (helperResult && typeof helperResult.newLevel === 'number') {
      nextLevel = helperResult.newLevel;
    } else if (typeof currentLevel === 'number') {
      const tentative = (currentLevel | 0) + 1;
      nextLevel = typeof maxLevel === 'number' ? Math.min(maxLevel, tentative) : tentative;
    }

    let newEnemySpeed;
    if (helperResult && typeof helperResult.newEnemySpeed !== 'undefined') {
      newEnemySpeed = helperResult.newEnemySpeed;
    } else if (round && typeof round.computeEnemySpeed === 'function' && typeof nextLevel === 'number') {
      try {
        newEnemySpeed = round.computeEnemySpeed(nextLevel);
      } catch (_) {}
    }

    invoke(() => {
      if (round && typeof round.setLevel === 'function' && typeof nextLevel === 'number') {
        round.setLevel(nextLevel);
      }
    }, 'round.next:setLevel');

    invoke(() => {
      if (round && typeof round.spawn === 'function') {
        round.spawn();
      }
    }, 'round.next:spawn');

    invoke(() => {
      if (round && typeof round.updateScore === 'function' && gameState) {
        const score = resolveScore(gameState);
        round.updateScore(score);
      }
    }, 'round.next:updateScore');

    invoke(() => {
      if (hud && typeof hud.hideOverlay === 'function') {
        hud.hideOverlay('pause');
      }
    }, 'round.next:hidePauseOverlay');

    if (helperResult && typeof newEnemySpeed !== 'undefined' && typeof helperResult.newEnemySpeed === 'undefined') {
      helperResult.newEnemySpeed = newEnemySpeed;
    }

    return helperResult;
  }

  return {
    startRound,
    proceedToNextLevel
  };
}

export default { createRoundService };
