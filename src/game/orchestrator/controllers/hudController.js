import { getService, TOKENS } from '../../services/index.js';
import uiController from './uiController.js';
export function init(opts = {}) {
  const {
    DOM,
    startRound,
    pauseGame,
    startGame,
    proceedToNextLevel,
    getState,
    gameStateRef,
    audio,
    debugState,
    theme,
    rng,
    collisions,
    hud
  } = opts;
  let hasStarted = false;
  if (!DOM) return;
  const resolveGameState = () => {
    // Prefer the live store accessor first. Calling getState() will always
    // return the most recent immutable snapshot from the Redux-style store.
    try {
      if (typeof getState === 'function') {
        const state = getState();
        if (state) {
          return state;
        }
      }
    } catch (_) {}
    // Next attempt any provided function reference. This may return a
    // captured snapshot but should be attempted if provided.
    try {
      if (typeof gameStateRef === 'function') {
        const refResult = gameStateRef();
        if (refResult) {
          return refResult;
        }
      }
    } catch (_) {}
    // If the ref itself is an object, return it as a fallback.
    if (gameStateRef && typeof gameStateRef === 'object') {
      return gameStateRef;
    }
    // Finally fall back to a global window binding if present.
    try {
      if (typeof window !== 'undefined' && window.gameState) {
        return window.gameState;
      }
    } catch (_) {}
    return undefined;
  };

  try {
    uiController.initControls({
      onStartButton: () => {
        try {
          const state = resolveGameState();
          if (!state || !state.running) {
            if (state && state.gameEnded) {
              if (typeof startRound === 'function') {
                startRound({ resetLevel1: true });
                hasStarted = true;
              }
            } else if (!hasStarted) {
              if (typeof startRound === 'function') {
                startRound({ resetLevel1: false });
                hasStarted = true;
              }
            } else {
              if (typeof startGame === 'function') {
                startGame();
              } else {
                if (typeof startRound === 'function') startRound({ resetLevel1: false });
              }
            }
          } else {
            if (typeof pauseGame === 'function') pauseGame();
          }
        } catch (_) {
        }
      },
      isCountdownActive: () => {
        try {
          const state = resolveGameState();
          return !!(state && state.countdownActive);
        } catch (_) {
          return false;
        }
      },
      onAudioUnlock: async () => {
        try { await (audio && audio.resumeAndUnlock && audio.resumeAndUnlock()); } catch (_) {}
      },
      dom: DOM
    });
  } catch (_) {
  }
  try {
    const dbgBtn = DOM.debugBtn;
    const dbgPanel = DOM.debugPanel;
    if (dbgBtn && dbgPanel) {
      uiController.initDebugOverlay({
        debugBtn: dbgBtn,
        debugPanel: dbgPanel,
        gameState: resolveGameState,
        debugState,
        pauseGame,
        startGame
      });
    }
  } catch (_) {
  }
  try {
    uiController.bindOverlayButtons({
      onAgain: () => {
        if (typeof startRound === 'function') startRound({ resetLevel1: true });
      },
      onNext: () => {
        if (typeof proceedToNextLevel === 'function') proceedToNextLevel({});
      },
      onStartGame: () => {
        if (typeof startGame === 'function') startGame({});
      }
    });
  } catch (_) {
  }
  const hudFacade = hud || (() => {
    try {
      return getService(TOKENS.HUD);
    } catch (_) {
      return null;
    }
  })();
  if (hudFacade && DOM) {
    try {
      const { muteBtn, bgm } = DOM;
      hudFacade.initHud({
        muteBtn,
        bgm,
        toggleMute: () => { try { audio && audio.toggleMute && audio.toggleMute(); } catch (_) {} },
        isMuted: () => { try { return audio && audio.isMuted && audio.isMuted(); } catch (_) { return false; } },
        prepareCountdown: (bgmEl) => { try { return audio && audio.prepareCountdown && audio.prepareCountdown(bgmEl || bgm); } catch (_) {} }
      });
    } catch (_) {
    }
  }
}
export default { init };
