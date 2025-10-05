function createEmitter() {
  const listeners = new Map();
  return {
    on(event, handler) {
      if (typeof handler !== 'function') {
        return () => {};
      }
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      const handlers = listeners.get(event);
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    off(event, handler) {
      const handlers = listeners.get(event);
      if (!handlers) return;
      handlers.delete(handler);
    },
    emit(event, payload) {
      const handlers = listeners.get(event);
      if (!handlers) return;
      for (const handler of [...handlers]) {
        try {
          handler(payload);
        } catch (_err) {
          // swallow listener errors to keep facade resilient
        }
      }
    }
  };
}

function safeDocument() {
  try {
    return typeof document !== 'undefined' ? document : null;
  } catch (_err) {
    return null;
  }
}

export const ScrollIntentEvent = 'scrollIntent';

export const TickerTrackEvent = Object.freeze({
  TRACK_READY: 'trackReady',
  OFFSET_CHANGED: 'offsetChanged',
  VISIBILITY_CHANGED: 'visibilityChanged'
});

export function createScrollIntentEmitter() {
  const emitter = createEmitter();
  return Object.freeze({
    emit(payload) {
      emitter.emit(ScrollIntentEvent, payload);
    },
    on(handler) {
      return emitter.on(ScrollIntentEvent, handler);
    },
    off(handler) {
      emitter.off(ScrollIntentEvent, handler);
    }
  });
}

export function createTickerTrackFacade({
  dom,
  domQueue,
  scrollEmitter,
  documentRef
} = {}) {
  const events = createEmitter();
  const docProvider = () => documentRef || safeDocument();

  let track = null;
  let inner = null;
  let primary = null;
  let repeat = null;
  let trackVisible = true;
  let lastOffset = null;
  let lastMode = null;
  let lastReadyActive = null;

  function emitReady(active) {
    if (active === lastReadyActive && track === domQueue.tickerTrack) {
      return;
    }
    lastReadyActive = active;
    events.emit(TickerTrackEvent.TRACK_READY, {
      active,
      track,
      inner,
      primary,
      repeat
    });
  }

  function emitOffset(offset) {
    events.emit(TickerTrackEvent.OFFSET_CHANGED, { offset });
  }

  function emitVisibility(visible) {
    if (trackVisible === visible) {
      return;
    }
    trackVisible = visible;
    events.emit(TickerTrackEvent.VISIBILITY_CHANGED, { visible });
  }

  function ensureTrack() {
    if (track && track.isConnected === false) {
      track = null;
    }
    if (inner && inner.isConnected === false) {
      inner = null;
    }
    if (primary && primary.isConnected === false) {
      primary = null;
    }
    if (repeat && repeat.isConnected === false) {
      repeat = null;
    }

    if (track && inner && primary) {
      emitReady(true);
      return track;
    }

    const hud = dom && typeof dom.get === 'function' ? dom.get('tickerHud') : null;
    if (!hud) {
      track = null;
      inner = null;
      primary = null;
      repeat = null;
      domQueue.tickerTrack = null;
      domQueue.tickerTrackInnerEl = null;
      domQueue.tickerTrackTextEl = null;
      domQueue.tickerTrackRepeatEl = null;
      emitReady(false);
      return null;
    }

    try {
      track = hud.querySelector('.ticker-track');
    } catch (_err) {
      track = null;
    }

    const doc = docProvider();
    if (!track && doc) {
      try {
        const el = doc.createElement('div');
        el.className = 'ticker-track';
        el.setAttribute('aria-hidden', 'true');
        el.setAttribute('data-driven', 'true');
        el.style.pointerEvents = 'none';
        hud.appendChild(el);
        track = el;
      } catch (_err) {
        track = null;
      }
    }

    if (!track) {
      inner = null;
      primary = null;
      repeat = null;
      domQueue.tickerTrack = null;
      domQueue.tickerTrackInnerEl = null;
      domQueue.tickerTrackTextEl = null;
      domQueue.tickerTrackRepeatEl = null;
      emitReady(false);
      return null;
    }

    try { track.setAttribute('data-driven', 'true'); } catch (_err) {}
    try { track.style.pointerEvents = 'none'; } catch (_err) {}

    domQueue.tickerTrack = track;

    try {
      inner = track.querySelector('.ticker-track-inner');
    } catch (_err) {
      inner = null;
    }

    if ((!inner || inner.isConnected === false) && doc) {
      try {
        const el = doc.createElement('div');
        el.className = 'ticker-track-inner';
        el.setAttribute('aria-hidden', 'true');
        el.style.pointerEvents = 'none';
        track.appendChild(el);
        inner = el;
      } catch (_err) {
        inner = null;
      }
    }

    domQueue.tickerTrackInnerEl = inner && inner.isConnected !== false ? inner : null;

    const docInner = inner || null;
    if (docInner) {
      try {
        primary = docInner.querySelector('.ticker-text--primary');
      } catch (_err) {
        primary = null;
      }
      try {
        repeat = docInner.querySelector('.ticker-text--repeat');
      } catch (_err) {
        repeat = null;
      }
    }

    if ((!primary || primary.isConnected === false) && doc) {
      try {
        const el = doc.createElement('span');
        el.className = 'ticker-text ticker-text--primary';
        el.style.pointerEvents = 'none';
        docInner && docInner.appendChild(el);
        primary = el;
      } catch (_err) {
        primary = null;
      }
    }

    if ((!repeat || repeat.isConnected === false) && doc) {
      try {
        const el = doc.createElement('span');
        el.className = 'ticker-text ticker-text--repeat';
        el.setAttribute('aria-hidden', 'true');
        el.style.pointerEvents = 'none';
        docInner && docInner.appendChild(el);
        repeat = el;
      } catch (_err) {
        repeat = null;
      }
    }

    domQueue.tickerTrackTextEl = primary && primary.isConnected !== false ? primary : null;
    domQueue.tickerTrackRepeatEl = repeat && repeat.isConnected !== false ? repeat : null;

    emitReady(!!(domQueue.tickerTrackInnerEl && domQueue.tickerTrackTextEl));
    return track;
  }

  function applyJustify(centered) {
    if (!inner || !inner.style) return;
    const mode = centered ? 'center' : 'flex-start';
    if (domQueue.tickerTrackCentered === mode) {
      return;
    }
    try { inner.style.justifyContent = mode; } catch (_err) {}
    domQueue.tickerTrackCentered = mode;
  }

  function applyOffset(offset) {
    if (!inner || !inner.style) return;
    if (lastOffset === offset) {
      return;
    }
    lastOffset = offset;
    domQueue.lastTickerTrackOffset = offset;
    try {
      inner.style.transform = `translate3d(${offset}px, 0, 0)`;
    } catch (_err) {}
    emitOffset(offset);
  }

  function updateRepeat({ shouldMirror, text }) {
    if (!repeat) return;
    let mirrorVisible = false;
    if (shouldMirror && typeof text === 'string' && text.trim()) {
      try {
        if (repeat.textContent !== text) {
          repeat.textContent = text;
        }
      } catch (_err) {}
      mirrorVisible = true;
    } else {
      try {
        if (repeat.textContent) {
          repeat.textContent = '';
        }
      } catch (_err) {}
    }
    domQueue.tickerTrackRepeatVisible = mirrorVisible;
    if (repeat.style) {
      try {
        repeat.style.display = mirrorVisible ? '' : 'none';
      } catch (_err) {}
    }
  }

  function syncFromIntent(intent = {}) {
    if (!ensureTrack()) {
      return;
    }
    const centered = !!intent.centered;
    applyJustify(centered);
    const text = typeof intent.text === 'string' ? intent.text : (domQueue.lastTickerTrackText || '');
    updateRepeat({ shouldMirror: !!intent.shouldMirror, text });
    const offset = centered ? 0 : (Number.isFinite(intent.offset) ? intent.offset : 0);
    if (intent.reset) {
      lastOffset = null;
      domQueue.lastTickerTrackOffset = null;
    }
    applyOffset(offset);
  }

  const scrollUnsubscribe = scrollEmitter && typeof scrollEmitter.on === 'function'
    ? scrollEmitter.on(syncFromIntent)
    : () => {};

  function setMode(mode) {
    if (!ensureTrack()) return;
    const previous = lastMode;
    const nextMode = mode || 'scroll';
    if (previous === nextMode) {
      return;
    }
    lastMode = nextMode;
    domQueue.tickerTrackMode = nextMode;
    try { track.setAttribute('data-mode', nextMode); } catch (_err) {}
    if (nextMode === 'scroll' && previous === 'paused') {
      resetOffset();
    }
    if (nextMode === 'scroll') {
      syncFromIntent({ offset: domQueue.lastTickerTrackOffset || 0 });
    }
  }

  function updateLayout({ infoWidth, hudHeight, duration, gap, canvasAttached }) {
    const target = ensureTrack();
    const hud = dom && typeof dom.get === 'function' ? dom.get('tickerHud') : null;
    const width = Math.max(0, Math.round(infoWidth || 0));
    const height = Math.max(24, Math.round(hudHeight || 0));

    if (hud && hud.style) {
      try { hud.style.setProperty('--ticker-info-width', `${width}px`); } catch (_err) {}
      try { hud.style.setProperty('--ticker-height', `${height}px`); } catch (_err) {}
    }

    if (!target) {
      emitReady(false);
      return;
    }

    const style = target.style || null;
    const resolvedGap = Math.max(0, Math.round(gap || 0));
    const resolvedDuration = Math.max(4, Number(duration) || 0);

    if (style) {
      try { style.setProperty('--ticker-info-width', `${width}px`); } catch (_err) {}
      try { style.setProperty('--ticker-gap', `${resolvedGap}px`); } catch (_err) {}
      try { style.setProperty('--ticker-duration', `${resolvedDuration}s`); } catch (_err) {}
    }

    domQueue.lastTickerTrackInfoWidth = width;
    domQueue.lastTickerTrackGap = resolvedGap;
    domQueue.lastTickerTrackDuration = resolvedDuration;

    if (canvasAttached) {
      if (style) {
        try { style.display = 'none'; } catch (_err) {}
      }
      emitVisibility(false);
    } else if (style) {
      try { style.display = ''; } catch (_err) {}
      emitVisibility(true);
    }
  }

  function setText(value) {
    const text = String(value ?? '');
    domQueue.lastTickerTrackText = text;
    if (!ensureTrack()) {
      return;
    }
    if (primary) {
      try {
        if (primary.textContent !== text) {
          primary.textContent = text;
        }
      } catch (_err) {}
    }
    if (repeat && !domQueue.tickerTrackRepeatVisible) {
      try { repeat.textContent = text; } catch (_err) {}
    }
  }

  function measurePrimaryWidth(fallback) {
    if (!ensureTrack() || !primary) {
      return fallback;
    }
    try {
      const rect = typeof primary.getBoundingClientRect === 'function'
        ? primary.getBoundingClientRect()
        : null;
      if (rect && rect.width) {
        return rect.width;
      }
      if (typeof primary.offsetWidth === 'number') {
        return primary.offsetWidth;
      }
    } catch (_err) {}
    return fallback;
  }

  function resetOffset() {
    lastOffset = null;
    domQueue.lastTickerTrackOffset = null;
  }

  function dispose() {
    scrollUnsubscribe();
    track = null;
    inner = null;
    primary = null;
    repeat = null;
    domQueue.tickerTrack = null;
    domQueue.tickerTrackInnerEl = null;
    domQueue.tickerTrackTextEl = null;
    domQueue.tickerTrackRepeatEl = null;
    domQueue.lastTickerTrackText = null;
    domQueue.lastTickerTrackDuration = null;
    domQueue.lastTickerTrackInfoWidth = null;
    domQueue.lastTickerTrackGap = null;
    domQueue.lastTickerTrackOffset = null;
    domQueue.tickerTrackRepeatVisible = false;
    domQueue.tickerTrackCentered = null;
    domQueue.tickerTrackMode = null;
    emitReady(false);
  }

  return {
    ensureReady: ensureTrack,
    setMode,
    setText,
    updateLayout,
    measurePrimaryWidth,
    resetOffset,
    syncFromIntent,
    events,
    dispose
  };
}

export default {
  createTickerTrackFacade,
  createScrollIntentEmitter,
  TickerTrackEvent,
  ScrollIntentEvent
};

