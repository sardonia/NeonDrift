import { getService, TOKENS } from '../services/index.js';
import { HudChannels } from '../core/events.js';
import { bus as busInstance } from '../core/bus-instance.js';
import warnOnce from '../utils/warnOnce.js';
function getDom() {
  try {
    const svc = typeof getService === 'function' ? getService(TOKENS.DOM) : undefined;
    if (svc) return svc;
  } catch (_) {}
  try {
    if (typeof document !== 'undefined' && document.getElementById) {
      return {
        board: document.getElementById('board'),
        trails: document.getElementById('trails'),
        fx: document.getElementById('fx'),
        wallsGlow: document.getElementById('wallsGlow'),
        overlay: document.getElementById('overlay'),
        panel: document.getElementById('panel'),
        startBtn: document.getElementById('startBtn'),
        bgm: document.getElementById('bgm'),
        debugBtn: document.getElementById('debugBtn'),
        debugPanel: document.getElementById('debugPanel'),
        againBtn: document.getElementById('againBtn'),
        again: document.getElementById('againBtn'),
        nextLevelBtn: document.getElementById('nextLevelBtn'),
      };
    }
  } catch (_) {}
  return {};
}
const DOM = getDom();
import { dispatch, getState, Actions } from '../state/index.js';
let _overlayBusOffFns = [];
let _countdownTimerId = null;
let _countdownCompletionHandlers = [];
let _countdownResetActive = null;
export function subscribeOverlayEvents() {
  const svcBus = (typeof getService === 'function') ? getService(TOKENS.BUS) : undefined;
  const bus = (svcBus && typeof svcBus.on === 'function') ? svcBus : busInstance;
  if (!bus || typeof bus.on !== 'function') return;
  if (_overlayBusOffFns.length > 0) return;
  const showOff = bus.on(HudChannels.SHOW_OVERLAY.event, (payload = {}) => {
    try {
      const { kind, data } = payload || {};
      switch (kind) {
        case 'pause':
          showPauseOnTicker();
          break;
        case 'countdown':
          showCountdown(data || {});
          break;
        case 'gameover':
          showGameOverOverlay(data || {});
          break;
        default:
          break;
      }
    } catch (_) {
    }
  });
  const hideOff = bus.on(HudChannels.HIDE_OVERLAY.event, (payload = {}) => {
    try {
      const { kind } = payload || {};
      switch (kind) {
        case 'pause':
          hidePauseOnTicker();
          break;
        case 'countdown':
          hideCountdown();
          break;
        default:
          hidePausePanel();
          hideCountdown();
          break;
      }
    } catch (_) {
    }
  });
  _overlayBusOffFns.push(showOff, hideOff);
}
export function unsubscribeOverlayEvents() {
  for (const off of _overlayBusOffFns) {
    try {
      if (typeof off === 'function') off();
    } catch (_) {
    }
  }
  _overlayBusOffFns = [];
}
export function showPausePanel(){
  const d = getDom();
  try { if (d.overlay) d.overlay.style.display = 'flex'; } catch(e){}
  try { if (d.panel) d.panel.classList.add('panel-go'); } catch(e){}
}
export function hidePausePanel(){
  const d = getDom();
  try {
    if (d.overlay) d.overlay.style.display = 'none';
  } catch(e){}
  try { if (d.panel) d.panel.classList.remove('panel-go'); } catch(e){}
}
export function updatePauseMessage(title = '', message = ''){
  try {
    const t = String(title || '').trim();
    const m = String(message || '').trim();
    const html =
      '<div class="go-title">' + (t || '') + '</div>' +
      '<div class="go-msg">' + (m || '') + '</div>';
    const d = getDom();
    const panelEl = (d && d.panel) || (DOM && DOM.panel);
    if (panelEl) {
      panelEl.innerHTML = html;
    }
  } catch (e) {
  }
}
export function showCountdown(opts = {}) {
  try {
    const d = getDom();
    const audioSvc = (typeof getService === 'function') ? getService(TOKENS.AUDIO) : undefined;
    let seconds;
    let onDone;
    let overlay;
    let panel;
    let setCountdownActive;
    let prepareCountdownFn;
    let bgm;

    if (typeof opts === 'number') {
      seconds = opts;
      onDone = arguments.length > 1 && typeof arguments[1] === 'function' ? arguments[1] : undefined;
      overlay = (d && d.overlay) || undefined;
      panel = (d && d.panel) || undefined;
      setCountdownActive = (v) => {
        try { dispatch(Actions.setCountdownActive(!!v)); } catch (_) {}
      };
      prepareCountdownFn = (bgmEl) => {
        if (audioSvc && typeof audioSvc.prepareCountdown === 'function') {
          return audioSvc.prepareCountdown(bgmEl || (d && d.bgm));
        }
        return undefined;
      };
      bgm = (d && d.bgm) || undefined;
    } else {
      const obj = opts || {};
      seconds = obj.seconds || 3;
      onDone = obj.onDone;
      overlay = obj.overlay || (d && d.overlay);
      panel = obj.panel || (d && d.panel);
      setCountdownActive = obj.setCountdownActive || ((v) => {
        try { dispatch(Actions.setCountdownActive(!!v)); } catch (_) {}
      });
      prepareCountdownFn = obj.prepareCountdown || ((bgmEl) => {
        if (audioSvc && typeof audioSvc.prepareCountdown === 'function') {
          return audioSvc.prepareCountdown(bgmEl || (d && d.bgm));
        }
        return undefined;
      });
      bgm = obj.bgm || (d && d.bgm);
    }

    const registerHandler = (handler) => {
      if (typeof handler === 'function' && _countdownCompletionHandlers.indexOf(handler) === -1) {
        _countdownCompletionHandlers.push(handler);
      }
    };

    const applyCountdownActive = (setter, value) => {
      if (typeof setter === 'function') {
        try { setter(value); } catch (_) {}
      }
    };

    registerHandler(onDone);

    const timerRunning = _countdownTimerId !== null;
    if (!timerRunning) {
      try {
        const st = (typeof getState === 'function') ? getState() : null;
        if (st && st.countdownActive) {
          if (typeof setCountdownActive === 'function') {
            applyCountdownActive(setCountdownActive, false);
          } else {
            try { dispatch(Actions.setCountdownActive(false)); } catch (_) {}
          }
          _countdownResetActive = null;
        }
      } catch (_) {}
    }

    if (timerRunning) {
      if (typeof setCountdownActive === 'function') {
        try { setCountdownActive(true); } catch (_) {}
        _countdownResetActive = setCountdownActive;
      }
      try {
        if (overlay) overlay.style.display = 'none';
        if (panel) panel.classList.remove('panel-go');
      } catch (_) {}
      return;
    }

    applyCountdownActive(setCountdownActive, true);
    if (typeof setCountdownActive === 'function') {
      _countdownResetActive = setCountdownActive;
    } else {
      _countdownResetActive = null;
    }

    try {
      if (overlay) overlay.style.display = 'none';
      if (panel) panel.classList.remove('panel-go');
    } catch (_) {}

    try {
      const bus = (typeof getService === 'function') ? getService(TOKENS.BUS) : undefined;
      if (bus && typeof bus.emit === 'function') {
        try { __A && __A.prepareCountdown && __A.prepareCountdown(bgm); } catch (_) {}
      }
    } catch (_) {}

    try {
      const p = prepareCountdownFn && prepareCountdownFn(bgm);
      if (p && typeof p.then === 'function') {
        p.catch(() => {});
      }
    } catch (_) {}

    const duration = (seconds || 3) * 1000;
    _countdownTimerId = setTimeout(() => {
      _countdownTimerId = null;
      const handlers = _countdownCompletionHandlers.slice();
      _countdownCompletionHandlers.length = 0;
      const resetFn = _countdownResetActive;
      _countdownResetActive = null;
      if (resetFn || setCountdownActive) {
        applyCountdownActive(resetFn || setCountdownActive, false);
      } else {
        try { dispatch(Actions.setCountdownActive(false)); } catch (_) {}
      }
      for (const handler of handlers) {
        try { handler(); } catch (_) {}
      }
    }, duration);
  } catch (_e) {
  }
}
export function hideCountdown(){
  try {
    const d = getDom();
    if (d && d.overlay) {
      d.overlay.style.display = 'none';
    }
  } catch(e) {}
  try {
    const d = getDom();
    if (d && d.panel && d.panel.classList) {
      d.panel.classList.remove('panel-go');
    }
  } catch(e) {}
  try {
    dispatch(Actions.setCountdownActive(false));
  } catch (_) {}
}
export function showGameOverOverlay({ message = '', totalScore = 0, overlay, panel, onAgain } = {}) {
  try {
    const d = getDom();
    const ov = overlay || (d && d.overlay);
    const pn = panel || (d && d.panel);
    if (!ov || !pn) return;
    try {
      ov.style.display = 'flex';
    } catch (_) {}
    try {
      pn.classList.add('panel-go');
    } catch (_) {}
    const total = (totalScore | 0);
    pn.innerHTML =
      '<div class="go-title">GAME OVER</div>' +
      '<div class="go-msg go-plot">' + String(message || '') + '</div>' +
      '<div class="go-label">Total Score</div>' +
      '<div class="go-score">' + total + '</div>' +
      '<div class="go-msg">Route diagnostics, recalibrate your turns, and light the grid again.</div>' +
      '<button class="btn btn-big" id="againBtn">Reboot Run</button>';
    try {
      const againNow = (pn && pn.querySelector && pn.querySelector('#againBtn')) || (typeof document !== 'undefined' && document.getElementById && document.getElementById('againBtn'));
      if (againNow) {
        againNow.addEventListener('click', () => {
          try { if (typeof onAgain === 'function') onAgain(); } catch (_) {}
        }, { once: true });
      }
    } catch (_) {}
  } catch (_) {
  }
}
export function toggleDebug(on){
  try {
    const d = getDom();
    if (d && d.debugPanel) d.debugPanel.style.display = on ? 'block' : '';
  } catch(e){}
}
let _bound = false;
export function bindOverlayButtons({
  onStart = null,
  onAgain = null,
  onNextLevel = null,
} = {}){
  if (_bound) return;
  _bound = true;
  try {
    const d = getDom();
    if (d.startBtn && onStart) d.startBtn.addEventListener('click', onStart, { once: false });
    if (d.againBtn && onAgain) d.againBtn.addEventListener('click', onAgain, { once: false });
    if (d.nextLevelBtn && onNextLevel) d.nextLevelBtn.addEventListener('click', onNextLevel, { once: false });
  } catch(e){}
}


// === Pause-as-LED ticker helpers (no overlay) ================================
let __overlayHudTicker = null;

export function configureOverlayTickerFacade(facade) {
  __overlayHudTicker = facade || null;
}

function resolveOverlayHud() {
  if (typeof __overlayHudTicker === 'function') {
    try { return __overlayHudTicker(); } catch (_) { return null; }
  }
  return __overlayHudTicker;
}

function callHudTickerMethod(methodName, warnTag) {
  const hud = resolveOverlayHud();
  if (hud && typeof hud[methodName] === 'function') {
    try { hud[methodName](); } catch (_) {}
    return true;
  }
  warnOnce(warnTag, 'HUD service unavailable for pause ticker updates; no global fallback will run.');
  return false;
}

export function showPauseOnTicker(){
  callHudTickerMethod('showPauseTicker', 'overlays-hud-show-missing');
}

export function hidePauseOnTicker(){
  callHudTickerMethod('hidePauseTicker', 'overlays-hud-hide-missing');
}

// === End pause-as-LED ticker helpers ========================================
