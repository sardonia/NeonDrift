import { registerDefaultRuntimeServices } from './config/defaultServices.js';
import * as orchestrator from './orchestrator.js';
import createGameFacade from './Game.js';
import {
  cellCenter as _cellCenter,
  pulseAABB as _pulseAABB,
  unionAABB as _unionAABB,
  isOpposite as _isOpposite
} from './utils.js';
import { updateScore } from './ui/score.js';
import * as C from './Constants.js';
import { setLevel, getState as getGameStateFromStore } from './state/index.js';
import { resetPowerBag } from './powerups.js';
import {
  showPausePanel,
  hidePausePanel,
  updatePauseMessage
} from './ui/overlays.js';
import { gameOverHelper } from './engine/gameOverHandlers.js';
import { createResetPowerUps } from './orchestrator/controllers/powerController.js';

const GameFacade = createGameFacade();

const AUTOSTART_DISABLED = typeof globalThis !== 'undefined'
  && globalThis.__NEON_MAIN_AUTOSTART__ === false;

let __offscreenGuardApplied = false;

const OFFSCREEN_TRANSFER_PATCHED = Symbol('neon.offscreen.transferPatched');
const OFFSCREEN_TRANSFER_ORIGINALS = Symbol('neon.offscreen.transferOriginals');

const DISABLED_OFFSCREEN_TRANSFER = function neonDisabledTransferControlToOffscreen() {
  return null;
};

const OFFSCREEN_TRANSFER_ALIASES = [
  'transferControlToOffscreen',
  'mozTransferControlToOffscreen',
  'webkitTransferControlToOffscreen',
  'msTransferControlToOffscreen'
];

function patchTransferControlToOffscreen(global) {
  const CanvasCtor = typeof global.HTMLCanvasElement === 'function'
    ? global.HTMLCanvasElement
    : null;
  if (!CanvasCtor || !CanvasCtor.prototype) {
    return false;
  }
  const proto = CanvasCtor.prototype;
  if (proto[OFFSCREEN_TRANSFER_PATCHED]) {
    return true;
  }
  const originals = {};
  let applied = false;
  for (const method of OFFSCREEN_TRANSFER_ALIASES) {
    const current = proto[method];
    if (typeof current !== 'function') {
      continue;
    }
    originals[method] = current;
    try {
      Object.defineProperty(proto, method, {
        value: DISABLED_OFFSCREEN_TRANSFER,
        configurable: true,
        writable: true
      });
      applied = true;
    } catch (_) {
      // If we cannot redefine the property we skip it, but still keep going
      // for any remaining aliases.
    }
  }
  if (!applied) {
    return false;
  }
  try {
    Object.defineProperty(proto, OFFSCREEN_TRANSFER_ORIGINALS, {
      value: originals,
      configurable: true
    });
  } catch (_) {
    try {
      proto[OFFSCREEN_TRANSFER_ORIGINALS] = originals;
    } catch (_) {}
  }
  try {
    Object.defineProperty(proto, OFFSCREEN_TRANSFER_PATCHED, {
      value: true,
      configurable: true
    });
  } catch (_) {
    try {
      proto[OFFSCREEN_TRANSFER_PATCHED] = true;
    } catch (_) {}
  }
  return true;
}

function ensureOffscreenSentinel(global) {
  try {
    global.OffscreenCanvas = null;
    if (typeof global.OffscreenCanvas !== 'function') {
      return true;
    }
  } catch (_) {}
  try {
    Object.defineProperty(global, 'OffscreenCanvas', {
      value: null,
      configurable: true,
      writable: true
    });
    return typeof global.OffscreenCanvas !== 'function';
  } catch (_) {}
  try {
    Object.defineProperty(global, 'OffscreenCanvas', {
      configurable: true,
      get() { return null; }
    });
    return typeof global.OffscreenCanvas !== 'function';
  } catch (_) {}
  return false;
}

function trySetOffscreenNull(global) {
  try {
    global.OffscreenCanvas = null;
  } catch (_) {
    return false;
  }
  return typeof global.OffscreenCanvas !== 'function';
}

function shouldDisableOffscreenTransfer() {
  if (__offscreenGuardApplied) {
    return false;
  }
  try {
    if (typeof document === 'undefined') {
      return false;
    }
    const doc = document;
    if (typeof doc.createElement !== 'function') {
      return false;
    }
    const probe = doc.createElement('canvas');
    if (!probe || typeof probe.transferControlToOffscreen !== 'function') {
      return false;
    }
    // First confirm that the environment reports basic OffscreenCanvas support.
    try {
      const blank = doc.createElement('canvas');
      if (blank && typeof blank.transferControlToOffscreen === 'function') {
        blank.transferControlToOffscreen();
      }
    } catch (_) {
      // If the platform rejects a simple transfer we do not need an extra guard.
      return false;
    }

    const canvas = doc.createElement('canvas');
    if (!canvas || typeof canvas.getContext !== 'function') {
      return false;
    }
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return false;
    }
    try {
      canvas.transferControlToOffscreen();
      return false;
    } catch (error) {
      const name = typeof error?.name === 'string' ? error.name : '';
      const message = typeof error?.message === 'string' ? error.message : '';
      if (name === 'InvalidStateError' || message.includes('transferControlToOffscreen')) {
        return true;
      }
    }
  } catch (_) {}
  return false;
}

function disableOffscreenCanvasSupport() {
  if (__offscreenGuardApplied) {
    return true;
  }
  let offscreenDisabled = false;
  try {
    const global = typeof globalThis === 'undefined' ? null : globalThis;
    if (!global) {
      return false;
    }
    const markOffscreenDisabled = () => {
      if (offscreenDisabled) {
        return;
      }
      offscreenDisabled = true;
      try { global.__NEON_OFFSCREEN_DISABLED__ = true; } catch (_) {}
    };
    if ('OffscreenCanvas' in global) {
      const assignmentDisabledOffscreen = trySetOffscreenNull(global);
      if (assignmentDisabledOffscreen) {
        markOffscreenDisabled();
      } else {
        const patched = patchTransferControlToOffscreen(global);
        if (patched) {
          markOffscreenDisabled();
        }
        let sentinelApplied = ensureOffscreenSentinel(global);
        if (!sentinelApplied) {
          sentinelApplied = trySetOffscreenNull(global);
        }
        if (sentinelApplied) {
          markOffscreenDisabled();
        } else if (!patched) {
          markOffscreenDisabled();
        }
      }
    } else {
      markOffscreenDisabled();
    }
  } catch (_) {
    offscreenDisabled = false;
  }
  __offscreenGuardApplied = __offscreenGuardApplied || offscreenDisabled;
  return __offscreenGuardApplied;
}

function ensureSafeOffscreenUsage() {
  if (shouldDisableOffscreenTransfer()) {
    disableOffscreenCanvasSupport();
  }
}

let runtimeServicesRegistration = null;
let DOM = null;
let gameState = null;
let engineContext = {};
let audio = null;
const preset = 'arcade';
const noop = () => {};
let proceedToNextLevelImpl = noop;
let startRoundImpl = noop;
let startGameImpl = noop;
let pauseGameImpl = noop;
let setEngineActiveImpl = () => {};
let gameOverImpl = () => {};

if (!AUTOSTART_DISABLED) {
  ensureSafeOffscreenUsage();
  try {
    runtimeServicesRegistration = registerDefaultRuntimeServices();
  } catch (error) {
    try {
      console.error('Failed to register default runtime services', error);
    } catch (_) {}
  }
  DOM = (runtimeServicesRegistration && runtimeServicesRegistration.dom)
    ? runtimeServicesRegistration.dom
    : orchestrator.getDomRefs();
}
const {
  COLS,
  ROWS,
  CELL,
  MAX_LEVEL,
  RIBBON_CORE,
  RIBBON_GLOW,
  PULSE_SPAN,
  PULSE_RATE,
  SCALE,
  TICK_MS,
  PLAYER_BASE_SPEED,
  HEAD_HIT_RADIUS,
  STARTING_LEVEL
} = C;

// Game state is initialised via the orchestrator; facade will derive level/status from it
function cellCenter(col, row) {
  return _cellCenter(col, row, CELL);
}
function pulseAABB(trail, n) {
  return _pulseAABB(trail, n, RIBBON_GLOW, CELL);
}
function unionAABB(a, b) {
  return _unionAABB(a, b);
}
if (!AUTOSTART_DISABLED) {
  const boot = orchestrator.init({
    inputConfig: {
      doc: typeof document !== 'undefined' ? document : undefined,
      proceedToNextLevel,
      startRound,
      startGame,
      pauseGame,
      isOpposite: _isOpposite
    }
  });

  gameState = boot.state;
  engineContext = boot.context || {};

  GameFacade.init({
    orchestrator: {
      start: orchestrator.startGameFull,
      pause: orchestrator.pauseGameFull,
      startRound: orchestrator.startRound,
      nextLevel: orchestrator.proceedToNextLevel
    },
    state: { getState: getGameStateFromStore }
  });

  const initialLevel = GameFacade.getLevel();
  if (typeof initialLevel === 'number') {
    setLevel(initialLevel);
  }

  audio = engineContext && engineContext.audio ? engineContext.audio : null;
  const bindings = GameFacade.createRuntimeBindings({
    orchestrator,
    gameState,
    getGameState: getGameStateFromStore,
    engineContext,
    dom: DOM || {},
    audio,
    gameOverHelper,
    resetPowerBag,
    createResetPowerUps,
    updateScore,
    showPausePanel,
    hidePausePanel,
    updatePauseMessage,
    preset
  }) || {};

  const {
    startGame: startBinding,
    pauseGame: pauseBinding,
    startRound: startRoundBinding,
    proceedToNextLevel: nextLevelBinding,
    setEngineActive: setEngineActiveBinding,
    gameOver: gameOverBinding
  } = bindings;

  const asFn = (fn) => (typeof fn === 'function' ? fn : noop);

  startGameImpl = asFn(startBinding);
  pauseGameImpl = asFn(pauseBinding);
  startRoundImpl = asFn(startRoundBinding);
  proceedToNextLevelImpl = asFn(nextLevelBinding);
  setEngineActiveImpl = asFn(setEngineActiveBinding);
  gameOverImpl = asFn(gameOverBinding);

  try {
    orchestrator.initUi({ startRound, pauseGame, startGame, proceedToNextLevel });
  } catch (e) {}
}

function proceedToNextLevel(options) {
  return proceedToNextLevelImpl(options);
}

function startRound(options = {}) {
  return startRoundImpl(options);
}

function startGame() {
  return startGameImpl();
}

function pauseGame() {
  return pauseGameImpl();
}

function setEngineActive(on) {
  return setEngineActiveImpl(on);
}

const gameOver = (message = '') => gameOverImpl(message);
function getCSS(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}
export {
  startGame,
  pauseGame,
  setEngineActive,
  gameOver,
  disableOffscreenCanvasSupport,
  shouldDisableOffscreenTransfer
};

// nd one-shot audio unlock (gesture-safe, DI-correct)
import { getService, TOKENS } from './services/index.js';
import { bus as __busInstance } from './core/bus-instance.js';
import { AudioChannels } from './core/events.js';
(function registerRuntime() {
  try {
    registerDefaultRuntimeServices();
  } catch (error) {
    try { console.error('Failed to register default runtime services', error); } catch (_) {}
  }
})();
(function() {
  let armed = true;
  function fireUnlock() {
    if (!armed) return;
    armed = false;
    try { const bus = (getService && getService(TOKENS.BUS)) || __busInstance; if (bus && bus.emit) bus.emit(AudioChannels.RESUME_AND_UNLOCK.event); } catch {}
    try { const audio = getService && getService(TOKENS.AUDIO); if (audio && audio.resumeAndUnlock) audio.resumeAndUnlock(); } catch {}
    try { window.removeEventListener('pointerdown', fireUnlock, true); window.removeEventListener('touchend', fireUnlock, true); window.removeEventListener('keydown', fireUnlock, true); } catch {}
  }
  try { window.addEventListener('pointerdown', fireUnlock, true); window.addEventListener('touchend', fireUnlock, true); window.addEventListener('keydown', fireUnlock, true); } catch {}
})();