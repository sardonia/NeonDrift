import { initInput as orchestratorInitInput } from './orchestrator.js';
import { dispatch, Actions } from './state/index.js';
export function initInputAdapter(doc, {
  gameState,
  getGameState,
  proceedToNextLevel,
  startRound,
  startGame,
  pauseGame,
  isOpposite,
  audio
}) {
  function readState() {
    if (typeof getGameState === 'function') {
      try {
        const latest = getGameState();
        if (latest != null) {
          return latest;
        }
      } catch (_) {}
    }
    return gameState;
  }

  function readBoolean(selector) {
    try {
      const state = readState();
      if (!state) {
        return false;
      }
      return !!selector(state);
    } catch (_) {
      return false;
    }
  }

  function readNumber(selector, fallback = 0) {
    try {
      const state = readState();
      if (!state) {
        return fallback;
      }
      const value = selector(state);
      return typeof value === 'number' ? value : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function readValue(selector, fallback = null) {
    try {
      const state = readState();
      if (!state) {
        return fallback;
      }
      const value = selector(state);
      return value === undefined ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  const ctx = {
    getLevelTransitionPending: () => readBoolean((state) => state.levelTransitionPending),
    proceedToNextLevel: () => {
      try { proceedToNextLevel(); } catch (_e) {}
    },
    getCountdownActive: () => readBoolean((state) => state.countdownActive),
    getInitialStartPending: () => readBoolean((state) => state.initialStartPending),
    clearInitialStart: () => {
      try {
        dispatch(Actions.setInitialStartPending(false));
      } catch (_e) {
        const state = readState();
        try {
          if (state) state.initialStartPending = false;
        } catch (__e) {}
      }
    },
    getRunning: () => readBoolean((state) => state.running),
    getGameEnded: () => readBoolean((state) => state.gameEnded),
    getTick: () => readNumber((state) => state.tick, 0),
    startRound: (opts) => {
      try { return startRound(opts); } catch (_e) { return undefined; }
    },
    startGame: () => {
      try { return startGame(); } catch (_e) { return undefined; }
    },
    pauseGame: () => {
      try { return pauseGame(); } catch (_e) { return undefined; }
    },
    getPlayer: () => readValue((state) => state.player, null),
    isOpposite: (a, b) => {
      try { return isOpposite(a, b); } catch (_e) { return false; }
    },
    ensureAudioUnlocked: async () => {
      try {
        if (audio && typeof audio.resumeAndUnlock === 'function') {
          await audio.resumeAndUnlock();
        }
      } catch (_e) {}
    }
  };
  try {
    orchestratorInitInput(doc, ctx);
  } catch (_e) {
  }
}
