import { createDomAdapter } from './domAdapter.js';
import {
  createTickerState,
  createTickerDomQueue,
  createMarqueeCache,
} from './ticker/state.js';
import { createTickerRenderer } from './ticker/renderer.js';
import { createSimpleCanvasTicker } from './ticker/simpleCanvasTicker.js';
import {
  createTickerTrackFacade,
  createScrollIntentEmitter,
} from './tickerTrackFacade.js';
import { TickerOrchestrator } from './ticker/orchestrator.js';
import { createWorkerAdapter } from './ticker/workerAdapter.js';
import { createPointerTelemetry } from './pointer/telemetry.js';
import { createCountdownController } from './countdown/controller.js';
import { createDebugMetricsTracker } from './debug/metrics.js';
// CORRECTED: Removed duplicate 'createTickerTrackFacade' import.
import { DEFAULT_TICKER_TEXT, createTickerTextController } from '../tickerText.js';
import { createTickerEvents, TickerEvent } from '../ticker/events.js';

function safeWindow() {
  try {
    return typeof window !== 'undefined' ? window : null;
  } catch (_err) {
    return null;
  }
}

function resolveDocumentRef() {
  const win = safeWindow();
  if (win && win.document) {
    return win.document;
  }
  try {
    return typeof document !== 'undefined' ? document : null;
  } catch (_) {
    return null;
  }
}

function toggleElement(el, show) {
  if (!el) return;
  try {
    el.style.display = show ? '' : 'none';
  } catch (_err) {}
}

function applyCountdownActive(target, active) {
  if (!target) return;
  try {
    if (typeof target === 'function') {
      target(active);
      return;
    }
    if (typeof target.classList !== 'undefined') {
      if (active) {
        target.classList.add('countdown-active');
      } else {
        target.classList.remove('countdown-active');
      }
    }
  } catch (_err) {}
}

function renderCountdown({ panel, seconds }) {
  if (!panel) return;
  const duration = Math.max(0, seconds | 0);
  panel.innerHTML =
    '<div class="hud-countdown">' +
    `<div class="hud-countdown-value">${duration}</div>` +
    '<div class="hud-countdown-label">Get Ready!</div>' +
    '</div>';
}

function renderGameOver({ panel, totalScore, message }) {
  if (!panel) return;
  const total = totalScore | 0;
  panel.innerHTML =
    '<div class="go-title">GAME OVER</div>' +
    `<div class="go-msg">${message || ''}</div>` +
    '<div class="go-label">Total Score</div>' +
    `<div class="go-score">${total}</div>` +
    '<button class="btn btn-big" id="againBtn">Play Again</button>';
}

function renderNextLevel({ panel, level }) {
  if (!panel) return;
  const lvl = level | 0;
  panel.innerHTML =
    `<div class="go-title">LEVEL ${lvl}</div>` +
    '<div class="go-msg">Get ready for the next round.</div>' +
    '<button class="btn btn-big" id="startNextBtn">Start</button>';
}

function createDefaultTickerSchedule() {
  const immediate = (fn) => {
    try {
      return fn();
    } catch (err) {
      throw err;
    }
  };
  const microtask =
    typeof queueMicrotask === 'function' ?
    (fn) => queueMicrotask(fn) :
    (fn) => {
      try {
        fn();
      } catch (_) {}
    };
  return {
    read: immediate,
    mutate: immediate,
    microtask,
  };
}

export function createHudService({
  dom,
  bus,
  audio,
  debugState,
  document: explicitDocument = null,
  createWorker = createWorkerAdapter,
  createTickerRenderer: createTickerRendererFactory = createTickerRenderer,
  createSimpleTicker: createSimpleTickerFactory = createSimpleCanvasTicker,
  createTickerTextController: createTickerTextControllerFactory = createTickerTextController,
  createTickerEvents: createTickerEventsFactory = createTickerEvents,
  createTickerTrack: createTickerTrackFacadeFactory = createTickerTrackFacade,
  tickerSchedule,
  useSimpleTicker = false,
} = {}) {
  const domAdapter = createDomAdapter(dom);
  const tickerState = createTickerState();
  const domQueue = createTickerDomQueue();
  const marqueeCache = createMarqueeCache();
  const worker = createWorker();
  const pointerTelemetry = createPointerTelemetry();
  const countdown = createCountdownController();
  const debugMetrics = createDebugMetricsTracker({
    tickerState,
    domAdapter,
    marqueeCache,
    pointerTelemetry,
    countdown,
    worker,
  });

  // CORRECTED: Initialized dependencies before they are used to prevent ReferenceErrors.
  const docRef = explicitDocument || resolveDocumentRef();
  function createNoopScrollEmitter() {
    return {
      emit() {},
      dispose() {},
    };
  }

  function createNoopTrackFacade() {
    return {
      ensureReady() { return { ready: true }; },
      setMode() {},
      applyText() {},
      syncFromIntent() {},
      updateLayout() {},
      dispose() {},
    };
  }

  const preferSimpleTicker = useSimpleTicker === true;

  const scrollEmitter = preferSimpleTicker ? createNoopScrollEmitter() : createScrollIntentEmitter();
  const trackFacade = preferSimpleTicker
    ? createNoopTrackFacade()
    : createTickerTrackFacadeFactory({
      dom: domAdapter,
      domQueue,
      scrollEmitter,
      documentRef: docRef,
    });

  // CORRECTED: Renamed the first 'ticker' declaration to 'renderer' to avoid a SyntaxError.
  const renderer = preferSimpleTicker
    ? createSimpleTickerFactory({
      state: tickerState,
      dom: domAdapter,
    })
    : createTickerRendererFactory({
      state: tickerState,
      dom: domAdapter,
      domQueue,
      marqueeCache,
      metrics: debugMetrics,
      worker,
      pointerTelemetry,
      trackFacade, // Now defined
      scrollEmitter, // Now defined
    });

  // CORRECTED: This is the main ticker orchestrator instance.
  const ticker = new TickerOrchestrator({
    renderer, // Now defined
    state: tickerState,
    worker,
    domQueue,
    trackFacade, // Now defined
    scrollEmitter,
  });

  const tickerEvents = createTickerEventsFactory();
  const schedule = tickerSchedule || createDefaultTickerSchedule();
  let tickerController = null;
  // REMOVED: `tickerTrackFacadeInstance` is no longer needed; using the `trackFacade` constant instead.
  let trackFacadeDisposed = false;

  function disposeTrackFacade() {
    if (trackFacadeDisposed) {
      return;
    }
    trackFacadeDisposed = true;
    if (trackFacade && typeof trackFacade.dispose === 'function') {
      try {
        trackFacade.dispose();
      } catch (_) {}
    }
  }

  function disposeTickerOrchestrator({ disposeTrackFacade: shouldDisposeTrack = false } = {}) {
    ticker.dispose({ disposeTrackFacade: shouldDisposeTrack });
    if (shouldDisposeTrack) {
      disposeTrackFacade();
    }
  }

  function emitTickerText(origin) {
    if (!tickerEvents) {
      return;
    }
    const current = typeof tickerState.text === 'string' ? tickerState.text : '';
    const trimmed = current.trim();
    if (trimmed) {
      tickerEvents.emit(TickerEvent.TEXT, { text: current, origin });
      return;
    }
    let fallback = DEFAULT_TICKER_TEXT;
    const tickerNode = domAdapter.get('tickerText');
    try {
      if (tickerNode && typeof tickerNode.textContent === 'string') {
        const textContent = tickerNode.textContent.trim();
        if (textContent) {
          fallback = tickerNode.textContent;
        }
      }
    } catch (_) {}
    tickerEvents.emit(TickerEvent.TEXT, { text: fallback, origin });
  }

  function emitTickerPowerups(list) {
    if (!tickerEvents) {
      return;
    }
    const raw = Array.isArray(list) ?
      list.slice() :
      Array.isArray(tickerState.powerupsRaw) ?
      tickerState.powerupsRaw.slice() :
      [];
    const display = Array.isArray(tickerState.powerups) ?
      tickerState.powerups.slice() :
      [];
    tickerEvents.emit(TickerEvent.POWERUPS, {
      list: raw.slice(),
      raw,
      display,
    });
  }

  function ensureTickerController() {
    if (tickerController) {
      return tickerController;
    }
    const domAccess = {
      getTickerText: () => domAdapter.get('tickerText'),
      getTickerHud: () => domAdapter.get('tickerHud'),
    };
    // CORRECTED: `trackFacade` is now created earlier, so we just reference it here.
    tickerController = createTickerTextControllerFactory({
      hud: () => ({
        setTickerText,
        showPauseTicker,
        hidePauseTicker,
      }),
      dom: domAccess,
      document: docRef,
      tickerTrackFacade: trackFacade,
      schedule,
      events: tickerEvents,
      bus,
    });
    return tickerController;
  }

  let countdownReset = null;

  function setScore({ scoreEl, value }) {
    const v = Number.isFinite(value) ? value | 0 : 0;
    const targets = [];
    if (scoreEl) targets.push(scoreEl);
    const domScore = domAdapter.get('tickerScore');
    if (domScore) targets.push(domScore);
    const unique = targets.filter((el, idx, arr) => el && arr.indexOf(el) === idx);
    const text = String(v);
    for (const el of unique) {
      try {
        el.textContent = text;
      } catch (_err) {}
    }
    ticker.updateScore(v);
  }

  function setLevel({ levelEl, value }) {
    const v = Number.isFinite(value) ? value | 0 : 0;
    const targets = [];
    if (levelEl) targets.push(levelEl);
    const domLevel = domAdapter.get('tickerLevel');
    if (domLevel) targets.push(domLevel);
    const unique = targets.filter((el, idx, arr) => el && arr.indexOf(el) === idx);
    const text = String(v);
    for (const el of unique) {
      try {
        el.textContent = text;
      } catch (_err) {}
    }
    ticker.updateLevel(v);
  }

  function showCountdown({
    seconds = 3,
    onDone,
    overlay,
    panel,
    setCountdownActive,
    prepareCountdown,
    bgm,
  } = {}) {
    const overlayEl = overlay || domAdapter.get('overlay');
    const panelEl = panel || domAdapter.get('panel');
    if (!overlayEl || !panelEl) return;
    toggleElement(overlayEl, true);
    panelEl.classList.add('panel-go');
    renderCountdown({ panel: panelEl, seconds });
    const resetActive =
      typeof setCountdownActive === 'function' ?
      (value) => setCountdownActive(value) :
      (value) => applyCountdownActive(overlayEl, value);
    resetActive(true);
    countdownReset = () => resetActive(false);
    countdown.start({
      seconds,
      onComplete: () => {
        if (countdownReset) {
          countdownReset();
          countdownReset = null;
        }
        if (typeof onDone === 'function') {
          try {
            onDone();
          } catch (_err) {}
        }
        toggleElement(overlayEl, false);
        panelEl.classList.remove('panel-go');
      },
    });
    if (typeof prepareCountdown === 'function') {
      try {
        prepareCountdown(bgm || domAdapter.get('bgm'));
      } catch (_err) {}
    } else if (audio && typeof audio.prepareCountdown === 'function') {
      try {
        audio.prepareCountdown(bgm || domAdapter.get('bgm'));
      } catch (_err) {}
    }
  }

  function showGameOver({ message, totalScore, overlay, panel, onAgain } = {}) {
    const overlayEl = overlay || domAdapter.get('overlay');
    const panelEl = panel || domAdapter.get('panel');
    if (!overlayEl || !panelEl) return;
    toggleElement(overlayEl, true);
    panelEl.classList.add('panel-go');
    renderGameOver({ panel: panelEl, totalScore, message });
    const doc = safeWindow() ? window.document : null;
    let againBtn = null;
    try {
      if (doc) againBtn = doc.getElementById('againBtn');
    } catch (_err) {}
    if (againBtn) {
      againBtn.addEventListener(
        'click',
        () => {
          toggleElement(overlayEl, false);
          panelEl.classList.remove('panel-go');
          if (typeof onAgain === 'function') {
            try {
              onAgain();
            } catch (_err) {}
          }
        }, { once: true }
      );
    }
  }

  function showNextLevel({ level, overlay, panel, onStart } = {}) {
    const overlayEl = overlay || domAdapter.get('overlay');
    const panelEl = panel || domAdapter.get('panel');
    if (!overlayEl || !panelEl) return;
    toggleElement(overlayEl, true);
    panelEl.classList.add('panel-go');
    renderNextLevel({ panel: panelEl, level });
    const doc = safeWindow() ? window.document : null;
    let startBtn = null;
    try {
      if (doc) startBtn = doc.getElementById('startNextBtn');
    } catch (_err) {}
    if (startBtn) {
      startBtn.addEventListener(
        'click',
        () => {
          toggleElement(overlayEl, false);
          panelEl.classList.remove('panel-go');
          if (typeof onStart === 'function') {
            try {
              onStart();
            } catch (_err) {}
          }
        }, { once: true }
      );
    }
  }

  function initHud({
    pointerTelemetry: enableTelemetry = false,
    muteBtn,
    bgm,
    toggleMute,
    isMuted,
  } = {}) {
    const muteEl = muteBtn || domAdapter.get('muteBtn');
    const bgmEl = bgm || domAdapter.get('bgm');
    if (muteEl && !muteEl.__neonBound) {
      muteEl.__neonBound = true;
      const readMuted = () => {
        if (typeof isMuted === 'function') {
          try {
            return !!isMuted();
          } catch (_err) {}
        }
        if (audio && typeof audio.isMuted === 'function') {
          try {
            return !!audio.isMuted();
          } catch (_err) {}
        }
        if (bgmEl) {
          try {
            return !!bgmEl.muted;
          } catch (_err) {}
        }
        return false;
      };
      const applyLabel = (flag) => {
        try {
          muteEl.textContent = flag ? '🔇 Off' : '🔊 On';
        } catch (_err) {}
      };
      applyLabel(readMuted());
      muteEl.addEventListener(
        'click',
        () => {
          let nowMuted = null;
          if (typeof toggleMute === 'function') {
            try {
              nowMuted = toggleMute();
            } catch (_err) {}
          } else if (audio && typeof audio.toggleMute === 'function') {
            try {
              nowMuted = audio.toggleMute();
            } catch (_err) {}
          }
          if (nowMuted === null) {
            nowMuted = !readMuted();
            if (bgmEl) {
              try {
                bgmEl.muted = nowMuted;
              } catch (_err) {}
            }
          }
          applyLabel(!!nowMuted);
        }, { passive: true }
      );
    }
    if (enableTelemetry) {
      pointerTelemetry.start();
    }
    const initialTickerNode = domAdapter.get('tickerText');
    let initialTickerText = '';
    if (initialTickerNode && typeof initialTickerNode.textContent === 'string') {
      initialTickerText = initialTickerNode.textContent;
    }
    const tickerInitOptions = { durationSec: 20 };
    const resolvedInitial =
      typeof initialTickerText === 'string' && initialTickerText.trim() ?
      initialTickerText :
      DEFAULT_TICKER_TEXT;
    tickerInitOptions.text = resolvedInitial;
    if (typeof console !== 'undefined' && console && typeof console.debug === 'function') {
      try {
        console.debug('[HudFacade:initHud] tickerState.paused before init', {
          paused: !!tickerState.paused,
        });
      } catch (_err) {}
    }
    ticker.init(tickerInitOptions);
    if (typeof console !== 'undefined' && console && typeof console.debug === 'function') {
      try {
        console.debug('[HudFacade:initHud] tickerState.paused after init', {
          paused: !!tickerState.paused,
        });
      } catch (_err) {}
    }
    emitTickerText('initHud');
  }

  function initTicker(options) {
    ticker.init(options);
    emitTickerText('initTicker');
  }

  function setTickerText(text) {
    ticker.setText(text);
    emitTickerText('setTickerText');
  }

  function pauseTicker() {
    ticker.pause();
  }

  function resumeTicker() {
    ticker.resume();
    emitTickerText('resumeTicker');
  }

  function updateTickerScore(value) {
    ticker.updateScore(value);
  }

  function updateTickerLevel(value) {
    ticker.updateLevel(value);
  }

  function updateTickerPowerups(list) {
    ticker.updatePowerups(list);
    emitTickerPowerups(list);
    return true;
  }

  function showPauseTicker() {
    ticker.showPauseTicker();
    emitTickerText('showPauseTicker');
  }

  function hidePauseTicker() {
    ticker.hidePauseTicker();
    emitTickerText('hidePauseTicker');
  }

  function getDebugMetrics() {
    return debugMetrics.snapshot();
  }

  function dispose() {
    countdown.dispose();
    pointerTelemetry.dispose();
    disposeTickerOrchestrator({ disposeTrackFacade: true });
    worker.dispose();
    if (tickerController) {
      try {
        tickerController.dispose();
      } catch (_) {}
      tickerController = null;
    }
    disposeTrackFacade();
    if (scrollEmitter && typeof scrollEmitter.dispose === 'function') {
      try {
        scrollEmitter.dispose();
      } catch (_) {}
    }
    tickerEvents.dispose();
  }

  function getTickerEvents() {
    return tickerEvents;
  }

  function getTickerController() {
    return ensureTickerController();
  }

  // CORRECTED: Removed duplicate properties like 'pauseTicker', 'updateTickerScore', etc.
  const tickerFacade = Object.freeze({
    init: initTicker,
    setText: setTickerText,
    pause: pauseTicker,
    resume: resumeTicker,
    updateScore: updateTickerScore,
    updateLevel: updateTickerLevel,
    updatePowerups: updateTickerPowerups,
    showPauseTicker,
    hidePauseTicker,
    getEvents: () => tickerEvents,
    getController: () => ensureTickerController(),
    dispose: () => disposeTickerOrchestrator({ disposeTrackFacade: false })
  });

  const api = {
    initHud,
    setScore,
    setLevel,
    showCountdown,
    showGameOver,
    showNextLevel,
    initTicker,
    setTickerText,
    pauseTicker,
    resumeTicker,
    updateTickerScore,
    updateTickerLevel,
    updateTickerPowerups,
    showPauseTicker,
    hidePauseTicker,
    getDebugMetrics,
    dispose,
    getTickerEvents,
    getTickerController,
    getTickerFacade: () => tickerFacade,
  };

  const win = safeWindow();
  if (win && debugState && debugState.exposeHudGlobal === true) {
    try {
      win.NeonHUD = api;
    } catch (_err) {}
  }

  return api;
}

export default {
  createHudService,
};