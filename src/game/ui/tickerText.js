import { HudChannels } from '../core/events.js';
import warnOnce from '../utils/warnOnce.js';
import { TickerEvent } from './ticker/events.js';

export const DEFAULT_TICKER_TEXT = 'NEON DRIFT — SURVIVE 10 LEVELS — DODGE, WEAVE, WIN — POWERUPS ONLINE — GOOD LUCK, PILOT ▸▸▸';

const HUD_TICKER_WARN_TAG = 'ticker-hud-service-missing';
const PAUSE_BANNER_TEXT = '***PAUSED***';

function requireDocument(doc) {
  if (doc && typeof doc === 'object') {
    return doc;
  }
  throw new TypeError('Ticker text controller requires an explicit document reference.');
}

function resolveHud(hud) {
  if (typeof hud === 'function') {
    try {
      return hud();
    } catch (_) {
      return null;
    }
  }
  return hud || null;
}

function normaliseTickerText(value) {
  const raw = value == null ? '' : String(value);
  const trimmed = raw.trim();
  return trimmed ? raw : DEFAULT_TICKER_TEXT;
}

function resolveDomAccessor(dom) {
  if (!dom || typeof dom !== 'object') {
    return {};
  }
  return dom;
}

function resolveTickerScheduler(schedule) {
  if (!schedule || typeof schedule !== 'object') {
    throw new TypeError('Ticker text controller requires scheduling utilities.');
  }
  const mutate = typeof schedule.mutate === 'function'
    ? schedule.mutate
    : typeof schedule.write === 'function'
      ? schedule.write
      : null;
  if (!mutate) {
    throw new TypeError('Ticker text controller requires a mutate/write scheduler function.');
  }
  const read = typeof schedule.read === 'function'
    ? schedule.read
    : typeof schedule.measure === 'function'
      ? schedule.measure
      : (fn) => fn();
  const microtask = typeof schedule.microtask === 'function'
    ? schedule.microtask
    : typeof schedule.defer === 'function'
      ? schedule.defer
      : (fn) => fn();
  return { mutate, read, microtask };
}

function resolveTickerTextNode(domAccessor, doc) {
  if (typeof domAccessor.getTickerText === 'function') {
    try { return domAccessor.getTickerText(); } catch (_) { return null; }
  }
  if (typeof domAccessor.get === 'function') {
    try { return domAccessor.get('tickerText'); } catch (_) { return null; }
  }
  if (domAccessor.tickerText) {
    return domAccessor.tickerText;
  }
  if (doc && typeof doc.getElementById === 'function') {
    try { return doc.getElementById('tickerText'); } catch (_) {
      return null;
    }
  }
  return null;
}

function resolveTickerHudNode(domAccessor, doc) {
  if (typeof domAccessor.getTickerHud === 'function') {
    try { return domAccessor.getTickerHud(); } catch (_) { return null; }
  }
  if (typeof domAccessor.get === 'function') {
    try { return domAccessor.get('tickerHud'); } catch (_) { return null; }
  }
  if (domAccessor.tickerHud) {
    return domAccessor.tickerHud;
  }
  if (doc && typeof doc.getElementById === 'function') {
    try { return doc.getElementById('tickerHUD'); } catch (_) {
      return null;
    }
  }
  return null;
}

function isRendererDrivenTrack(track) {
  if (!track || typeof track !== 'object') {
    return false;
  }
  try {
    if (track.dataset && (track.dataset.driven === 'true' || track.dataset.driven === true)) {
      return true;
    }
  } catch (_) {}
  try {
    if (typeof track.getAttribute === 'function') {
      return track.getAttribute('data-driven') === 'true';
    }
  } catch (_) {}
  try {
    if (track.attributes && track.attributes['data-driven']) {
      const attr = track.attributes['data-driven'];
      if (attr === 'true' || (attr && attr.value === 'true')) {
        return true;
      }
    }
  } catch (_) {}
  try {
    if (track.attributes && typeof track.attributes.getNamedItem === 'function') {
      const attr = track.attributes.getNamedItem('data-driven');
      if (attr && attr.value === 'true') {
        return true;
      }
    }
  } catch (_) {}
  return false;
}

function ensureTickerTrack(domAccessor, doc, trackState) {
  const hud = resolveTickerHudNode(domAccessor, doc);
  if (!hud) {
    trackState.track = null;
    trackState.inner = null;
    trackState.primary = null;
    trackState.repeat = null;
    return null;
  }

  if (trackState.track && trackState.track.isConnected === false) {
    trackState.track = null;
    trackState.inner = null;
    trackState.primary = null;
    trackState.repeat = null;
  }

  const docRef = doc;

  if (!trackState.track) {
    let existing = null;
    try {
      if (typeof hud.querySelector === 'function') {
        existing = hud.querySelector('.ticker-track');
      }
    } catch (_) {
      existing = null;
    }
    if (existing) {
      trackState.track = existing;
    }
  }

  if (!trackState.track && docRef) {
    try {
      const track = docRef.createElement('div');
      track.className = 'ticker-track';
      if (typeof track.setAttribute === 'function') {
        track.setAttribute('aria-hidden', 'true');
        track.setAttribute('data-driven', 'false');
      }
      if (track.style) {
        track.style.pointerEvents = 'none';
        track.style.display = '';
      }
      hud.appendChild(track);
      trackState.track = track;
    } catch (_) {
      trackState.track = null;
    }
  }

  const track = trackState.track;
  if (!track) {
    return null;
  }

  if (isRendererDrivenTrack(track)) {
    trackState.track = null;
    trackState.inner = null;
    trackState.primary = null;
    trackState.repeat = null;
    trackState.lastTrackText = null;
    return null;
  }

  try {
    if (typeof track.setAttribute === 'function') {
      track.setAttribute('aria-hidden', 'true');
      track.setAttribute('data-driven', 'false');
    }
  } catch (_) {}
  try {
    if (track.style) {
      if (track.style.pointerEvents !== 'none') {
        track.style.pointerEvents = 'none';
      }
      if (track.style.display !== '') {
        track.style.display = '';
      }
    }
  } catch (_) {}

  if (!trackState.inner && docRef) {
    try {
      let inner = null;
      try { inner = track.querySelector('.ticker-track-inner'); } catch (_) { inner = null; }
      if (!inner) {
        inner = docRef.createElement('div');
        inner.className = 'ticker-track-inner';
        inner.setAttribute('aria-hidden', 'true');
        inner.style.pointerEvents = 'none';
        track.appendChild(inner);
      }
      trackState.inner = inner;
    } catch (_) {
      trackState.inner = null;
    }
  }

  const inner = trackState.inner;
  if (!inner) {
    return null;
  }

  try {
    if (inner.style && inner.style.pointerEvents !== 'none') {
      inner.style.pointerEvents = 'none';
    }
    if (typeof inner.setAttribute === 'function') {
      inner.setAttribute('aria-hidden', 'true');
    }
  } catch (_) {}

  if ((!trackState.primary || trackState.primary.isConnected === false) && docRef) {
    try {
      let primary = null;
      try { primary = inner.querySelector('.ticker-text--primary'); } catch (_) { primary = null; }
      if (!primary) {
        primary = docRef.createElement('span');
        primary.className = 'ticker-text ticker-text--primary';
        primary.style.pointerEvents = 'none';
        inner.appendChild(primary);
      }
      trackState.primary = primary;
    } catch (_) {
      trackState.primary = null;
    }
  }

  if ((!trackState.repeat || trackState.repeat.isConnected === false) && docRef) {
    try {
      let repeat = null;
      try { repeat = inner.querySelector('.ticker-text--repeat'); } catch (_) { repeat = null; }
      if (!repeat) {
        repeat = docRef.createElement('span');
        repeat.className = 'ticker-text ticker-text--repeat';
        repeat.setAttribute('aria-hidden', 'true');
        repeat.style.pointerEvents = 'none';
        repeat.style.display = 'none';
        inner.appendChild(repeat);
      }
      trackState.repeat = repeat;
    } catch (_) {
      trackState.repeat = null;
    }
  }

  const primary = trackState.primary;
  try {
    if (primary && primary.style && primary.style.pointerEvents !== 'none') {
      primary.style.pointerEvents = 'none';
    }
  } catch (_) {}

  const repeat = trackState.repeat;
  try {
    if (repeat) {
      if (typeof repeat.setAttribute === 'function') {
        repeat.setAttribute('aria-hidden', 'true');
      }
      if (repeat.style) {
        if (repeat.style.pointerEvents !== 'none') {
          repeat.style.pointerEvents = 'none';
        }
        if (repeat.style.display == null) {
          repeat.style.display = 'none';
        }
      }
    }
  } catch (_) {}

  return trackState.primary && trackState.primary.isConnected !== false ? trackState.primary : null;
}

function applyTickerTrackText(domAccessor, doc, trackState, text) {
  const primary = ensureTickerTrack(domAccessor, doc, trackState);
  if (!primary) {
    trackState.repeat = null;
    trackState.lastTrackText = null;
    return;
  }

  const value = String(text ?? '');
  if (trackState.lastTrackText === value) {
    return;
  }
  trackState.lastTrackText = value;

  try {
    if (primary.textContent !== value) {
      primary.textContent = value;
    }
  } catch (_) {}

  const repeat = trackState.repeat && trackState.repeat.isConnected !== false ? trackState.repeat : null;
  const shouldMirror = value.trim().length > 0;
  if (repeat) {
    try {
      if (repeat.textContent !== value) {
        repeat.textContent = value;
      }
      if (repeat.style) {
        const visible = repeat.style.display !== 'none';
        if (visible !== shouldMirror) {
          repeat.style.display = shouldMirror ? '' : 'none';
        }
      }
    } catch (_) {}
  }
}

function disposeTickerTrack(trackState) {
  if (trackState.track && trackState.track.parentNode) {
    try { trackState.track.parentNode.removeChild(trackState.track); } catch (_) {}
  }
  trackState.track = null;
  trackState.inner = null;
  trackState.primary = null;
  trackState.repeat = null;
  trackState.lastTrackText = null;
}

export function createTickerTrackFacade({ dom, document } = {}) {
  const domAccessor = resolveDomAccessor(dom);
  const doc = requireDocument(document);
  const trackState = {
    track: null,
    inner: null,
    primary: null,
    repeat: null,
    lastTrackText: null
  };

  return {
    applyText(text) {
      applyTickerTrackText(domAccessor, doc, trackState, text);
    },
    dispose() {
      disposeTickerTrack(trackState);
    }
  };
}

function extractTextPayload(payload) {
  if (typeof payload === 'string') {
    return payload;
  }
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  if (typeof payload.text === 'string') {
    return payload.text;
  }
  if (typeof payload.message === 'string') {
    return payload.message;
  }
  if (typeof payload.value === 'string') {
    return payload.value;
  }
  return undefined;
}

export function createTickerTextController({
  hud,
  dom,
  document: doc,
  tickerTrackFacade,
  schedule,
  events,
  bus,
  warn = warnOnce,
  disposeTrackFacade = false
} = {}) {
  const domAccessor = resolveDomAccessor(dom);
  const documentRef = requireDocument(doc);
  const scheduler = resolveTickerScheduler(schedule);
  if (!tickerTrackFacade || typeof tickerTrackFacade.applyText !== 'function') {
    throw new TypeError('Ticker text controller requires a tickerTrackFacade with an applyText method.');
  }
  const trackFacade = tickerTrackFacade;
  const state = {
    lastDomText: null,
    lastAriaLabel: null,
    lastAppliedText: null,
    pendingLocal: null,
    pausedSnapshot: null,
    unsubscribers: []
  };

  function applyTickerDomText(text, options = {}) {
    const { updateTrack = true } = options || {};
    scheduler.mutate(() => {
      const el = resolveTickerTextNode(domAccessor, documentRef);
      if (el) {
        try {
          if (el.textContent !== text) {
            el.textContent = text;
          }
        } catch (_) {}
        const ariaLabel = text.trim().replace(/\s+/g, ' ') || text;
        if (state.lastAriaLabel !== ariaLabel) {
          state.lastAriaLabel = ariaLabel;
          try {
            if (typeof el.setAttribute === 'function') {
              el.setAttribute('aria-label', ariaLabel);
            } else if ('ariaLabel' in el) {
              el.ariaLabel = ariaLabel;
            }
          } catch (_) {}
        }
      }
      if (updateTrack) {
        try {
          trackFacade.applyText(text);
        } catch (_) {}
      }
      state.lastDomText = text;
    });
  }

  function broadcastFallback(text) {
    applyTickerDomText(text, { updateTrack: true });
    state.lastAppliedText = text;
  }

  function setText(value) {
    const next = normaliseTickerText(value);
    const facade = resolveHud(hud);
    state.pendingLocal = next;
    let applied = false;
    if (facade && typeof facade.setTickerText === 'function') {
      try {
        facade.setTickerText(next);
        applied = true;
      } catch (_) {
        applied = false;
      }
    }
    if (!applied) {
      warn(HUD_TICKER_WARN_TAG, 'HUD service unavailable for ticker text updates; falling back to DOM.');
      broadcastFallback(next);
      state.pendingLocal = null;
    } else {
      applyTickerDomText(next, { updateTrack: false });
      state.lastAppliedText = next;
      state.pendingLocal = null;
    }
    return applied;
  }

  function showPauseTicker() {
    const facade = resolveHud(hud);
    let applied = false;
    if (facade && typeof facade.showPauseTicker === 'function') {
      try {
        facade.showPauseTicker();
        applied = true;
      } catch (_) {
        applied = false;
      }
    }
    if (!applied) {
      state.pausedSnapshot = state.lastDomText || state.pausedSnapshot || DEFAULT_TICKER_TEXT;
      broadcastFallback(PAUSE_BANNER_TEXT);
    }
    return applied;
  }

  function hidePauseTicker() {
    const facade = resolveHud(hud);
    let applied = false;
    if (facade && typeof facade.hidePauseTicker === 'function') {
      try {
        facade.hidePauseTicker();
        applied = true;
      } catch (_) {
        applied = false;
      }
    }
    if (!applied) {
      const restore = state.pausedSnapshot || DEFAULT_TICKER_TEXT;
      state.pausedSnapshot = null;
      broadcastFallback(restore);
    }
    return applied;
  }

  function handleExternalTextUpdate(payload) {
    const textValue = extractTextPayload(payload);
    const resolved = normaliseTickerText(textValue);
    if (state.pendingLocal && state.pendingLocal === resolved) {
      state.pendingLocal = null;
      return;
    }
    if (state.lastAppliedText === resolved) {
      return;
    }
    broadcastFallback(resolved);
    state.pendingLocal = null;
  }

  function subscribe() {
    unsubscribe();
    if (events && typeof events.on === 'function') {
      const off = events.on(TickerEvent.TEXT, handleExternalTextUpdate);
      if (typeof off === 'function') {
        state.unsubscribers.push(off);
      }
    }
    if (bus && typeof bus.on === 'function') {
      try {
        const offBus = bus.on(HudChannels.TICKER_TEXT.event, handleExternalTextUpdate);
        if (typeof offBus === 'function') {
          state.unsubscribers.push(offBus);
        }
      } catch (_) {
        // ignore bus subscription errors
      }
    }
    return unsubscribe;
  }

  function unsubscribe() {
    if (!state.unsubscribers.length) {
      return;
    }
    for (const off of state.unsubscribers.splice(0, state.unsubscribers.length)) {
      try {
        if (typeof off === 'function') {
          off();
        }
      } catch (_) {
        // ignore unsubscription errors
      }
    }
  }

  function dispose() {
    unsubscribe();
    if (!disposeTrackFacade) {
      return;
    }
    try {
      if (typeof trackFacade.dispose === 'function') {
        trackFacade.dispose();
      }
    } catch (_) {}
  }

  return Object.freeze({
    setText,
    showPauseTicker,
    hidePauseTicker,
    subscribe,
    unsubscribe,
    dispose,
    applyDomText: broadcastFallback
  });
}

export default {
  createTickerTextController,
  createTickerTrackFacade,
  DEFAULT_TICKER_TEXT
};
