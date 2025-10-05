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

function logDebug(label, details) {
  try {
    if (typeof console === 'undefined' || !console) return;
    const logger = typeof console.debug === 'function' ? console.debug : console.log;
    if (typeof logger !== 'function') return;
    logger.call(console, `[TickerTrackFacade] ${label}`, details);
  } catch (_err) {}
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
  const queue = domQueue && typeof domQueue === 'object' ? domQueue : {};

  let track = null;
  let inner = null;
  let primary = null;
  let repeat = null;
  let trackVisible = true;
  let lastOffset = null;
  let lastMode = null;
  let lastReadyActive = null;
  let pendingRecovery = null;
  let mutationObserver = null;

  function emitReady(active) {
    if (active === lastReadyActive && track === queue.tickerTrack) {
      return;
    }
    lastReadyActive = active;
    logDebug('emitReady', {
      active,
      hasTrack: !!track,
      hasInner: !!inner,
      hasPrimary: !!primary,
      hasRepeat: !!repeat
    });
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
    const previousVisible = trackVisible;
    trackVisible = visible;
    logDebug('emitVisibility', {
      previousVisible,
      visible,
      hasTrack: !!track
    });
    events.emit(TickerTrackEvent.VISIBILITY_CHANGED, { visible });
  }

  function elementConnected(el) {
    if (!el) return false;
    if (el.isConnected === false) return false;
    if (typeof el.isConnected === 'boolean') {
      return el.isConnected !== false;
    }
    return true;
  }

  function bindQueueFromNodes() {
    queue.tickerTrack = elementConnected(track) ? track : null;
    queue.tickerTrackInnerEl = elementConnected(inner) ? inner : null;
    queue.tickerTrackTextEl = elementConnected(primary) ? primary : null;
    queue.tickerTrackRepeatEl = elementConnected(repeat) ? repeat : null;
  }

  function clearTrackNodes(reason) {
    const previous = {
      hadTrack: !!track,
      hadInner: !!inner,
      hadPrimary: !!primary,
      hadRepeat: !!repeat
    };
    track = null;
    inner = null;
    primary = null;
    repeat = null;
    queue.tickerTrack = null;
    queue.tickerTrackInnerEl = null;
    queue.tickerTrackTextEl = null;
    queue.tickerTrackRepeatEl = null;
    logDebug('ensureTrack:clearNodes', {
      reason,
      previous
    });
  }

  function cancelRecovery(reason) {
    if (!pendingRecovery) {
      return;
    }
    pendingRecovery.cancelled = true;
    if (typeof pendingRecovery.cancel === 'function') {
      try { pendingRecovery.cancel(); } catch (_err) {}
    }
    logDebug('ensureTrack:cancelRecovery', {
      reason,
      pendingReason: pendingRecovery.reason
    });
    pendingRecovery = null;
  }

  function scheduleRecovery(reason) {
    if (pendingRecovery) {
      return;
    }
    const token = {
      reason,
      cancelled: false,
      cancel: null
    };
    pendingRecovery = token;
    logDebug('ensureTrack:scheduleRecovery', {
      reason
    });

    const run = () => {
      if (!pendingRecovery || pendingRecovery !== token || token.cancelled) {
        return;
      }
      pendingRecovery = null;
      logDebug('ensureTrack:retryRecovery', {
        reason: token.reason
      });
      const restored = ensureTrack({ allowRetry: false, reason: token.reason, fromRecovery: true });
      if (!restored) {
        clearTrackNodes(`confirmedMissing:${token.reason || 'unknown'}`);
        emitReady(false);
      }
    };

    if (queue && typeof queue.microtask === 'function') {
      try {
        queue.microtask(run);
        return;
      } catch (_err) {}
    }

    if (typeof queueMicrotask === 'function') {
      queueMicrotask(run);
    } else if (typeof requestAnimationFrame === 'function') {
      const id = requestAnimationFrame(() => run());
      token.cancel = () => {
        try {
          if (typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(id);
          } else if (typeof window !== 'undefined' && window && typeof window.cancelAnimationFrame === 'function') {
            window.cancelAnimationFrame(id);
          }
        } catch (_err) {}
      };
    } else {
      const timeout = setTimeout(run, 16);
      token.cancel = () => {
        clearTimeout(timeout);
      };
    }
  }

  function startMutationObserver() {
    if (mutationObserver || typeof MutationObserver !== 'function') {
      return;
    }
    const doc = docProvider();
    if (!doc) {
      return;
    }
    const root = doc.body || doc.documentElement;
    if (!root) {
      return;
    }
    try {
      mutationObserver = new MutationObserver((mutations) => {
        if (!Array.isArray(mutations) || mutations.length === 0) {
          return;
        }
        logDebug('mutationObserver:detected', {
          count: mutations.length
        });
        ensureTrack({ reason: 'mutationObserver' });
      });
      mutationObserver.observe(root, { childList: true, subtree: true });
      logDebug('mutationObserver:started', {
        hasRoot: !!root
      });
    } catch (_err) {
      mutationObserver = null;
    }
  }

  function ensureTrack(options = {}) {
    const allowRetry = options && options.allowRetry !== false;
    const reason = options && options.reason ? String(options.reason) : null;
    const fromRecovery = !!(options && options.fromRecovery);
    startMutationObserver();

    const hasConnectedTrack = elementConnected(track);
    const hasConnectedInner = elementConnected(inner);
    const hasConnectedPrimary = elementConnected(primary);
    const hasConnectedRepeat = elementConnected(repeat);

    if (hasConnectedTrack && hasConnectedInner && hasConnectedPrimary) {
      bindQueueFromNodes();
      cancelRecovery('connected');
      logDebug('ensureTrack:reuseExisting', {
        reason,
        fromRecovery,
        hasRepeat: hasConnectedRepeat
      });
      emitReady(true);
      return track;
    }

    const hud = dom && typeof dom.get === 'function' ? dom.get('tickerHud') : null;
    if (!hud) {
      logDebug('ensureTrack:hudUnavailable', {
        reason,
        allowRetry,
        fromRecovery
      });
      if (allowRetry) {
        scheduleRecovery('missingHud');
      } else if (!pendingRecovery) {
        clearTrackNodes('missingHud');
        emitReady(false);
      }
      return null;
    }

    const doc = docProvider();
    const previousTrack = track;

    if (!hasConnectedTrack) {
      try {
        track = hud.querySelector('.ticker-track');
      } catch (_err) {
        track = null;
        trackCreationFailed = true;
      }
      if (!track && doc) {
        try {
          const el = doc.createElement('div');
          el.className = 'ticker-track';
          el.setAttribute('aria-hidden', 'true');
          el.setAttribute('data-driven', 'true');
          el.style.pointerEvents = 'none';
          hud.appendChild(el);
          track = el;
          logDebug('ensureTrack:createdTrack', {
            reason,
            fromRecovery
          });
        } catch (_err) {
          track = null;
        }
      }
    }

    if (!elementConnected(track)) {
      logDebug('ensureTrack:trackMissing', {
        reason,
        fromRecovery,
        allowRetry,
        hadPrevious: !!previousTrack
      });
      if (allowRetry) {
        scheduleRecovery('missingTrack');
      } else if (!pendingRecovery) {
        clearTrackNodes('missingTrack');
        emitReady(false);
      }
      return null;
    }

    try { track.setAttribute('data-driven', 'true'); } catch (_err) {}
    try { track.style.pointerEvents = 'none'; } catch (_err) {}

    queue.tickerTrack = track;

    try {
      inner = track.querySelector('.ticker-track-inner');
    } catch (_err) {
      inner = null;
    }

    if (!elementConnected(inner) && doc) {
      try {
        const el = doc.createElement('div');
        el.className = 'ticker-track-inner';
        el.setAttribute('aria-hidden', 'true');
        el.style.pointerEvents = 'none';
        track.appendChild(el);
        inner = el;
        logDebug('ensureTrack:createdInner', {
          reason,
          fromRecovery
        });
      } catch (_err) {
        inner = null;
      }
    }

    queue.tickerTrackInnerEl = elementConnected(inner) ? inner : null;

    const docInner = elementConnected(inner) ? inner : null;
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
    } else {
      primary = null;
      repeat = null;
    }

    if (!elementConnected(primary) && doc && docInner) {
      try {
        const el = doc.createElement('span');
        el.className = 'ticker-text ticker-text--primary';
        el.style.pointerEvents = 'none';
        docInner.appendChild(el);
        primary = el;
        logDebug('ensureTrack:createdPrimary', {
          reason,
          fromRecovery
        });
      } catch (_err) {
        primary = null;
      }
    }

    if (!elementConnected(repeat) && doc && docInner) {
      try {
        const el = doc.createElement('span');
        el.className = 'ticker-text ticker-text--repeat';
        el.setAttribute('aria-hidden', 'true');
        el.style.pointerEvents = 'none';
        docInner.appendChild(el);
        repeat = el;
        logDebug('ensureTrack:createdRepeat', {
          reason,
          fromRecovery
        });
      } catch (_err) {
        repeat = null;
      }
    }

    bindQueueFromNodes();

    const ready = !!(queue.tickerTrackInnerEl && queue.tickerTrackTextEl);
    logDebug('ensureTrack:readyState', {
      ready,
      reason,
      hasTrack: !!queue.tickerTrack,
      hasInner: !!queue.tickerTrackInnerEl,
      hasPrimary: !!queue.tickerTrackTextEl,
      hasRepeat: !!queue.tickerTrackRepeatEl
    });

    if (ready) {
      cancelRecovery('ready');
      emitReady(true);
      return track;
    }

    if (allowRetry) {
      scheduleRecovery('missingChildren');
    } else if (!pendingRecovery) {
      clearTrackNodes('missingChildren');
      emitReady(false);
    }
    return null;
  }

  function applyJustify(centered) {
    if (!elementConnected(inner) || !inner.style) return;
    const mode = centered ? 'center' : 'flex-start';
    if (queue.tickerTrackCentered === mode) {
      return;
    }
    try { inner.style.justifyContent = mode; } catch (_err) {}
    queue.tickerTrackCentered = mode;
  }

  function applyOffset(offset) {
    if (!elementConnected(inner) || !inner.style) return;
    if (lastOffset === offset) {
      return;
    }
    lastOffset = offset;
    queue.lastTickerTrackOffset = offset;
    try {
      inner.style.transform = `translate3d(${offset}px, 0, 0)`;
    } catch (_err) {}
    emitOffset(offset);
  }

  function updateRepeat({ shouldMirror, text }) {
    if (!elementConnected(repeat)) return;
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
    queue.tickerTrackRepeatVisible = mirrorVisible;
    if (repeat.style) {
      try {
        repeat.style.display = mirrorVisible ? '' : 'none';
      } catch (_err) {}
    }
  }

  function syncFromIntent(intent = {}) {
    if (!ensureTrack({ reason: 'syncFromIntent' })) {
      return;
    }
    const centered = !!intent.centered;
    applyJustify(centered);
    const text = typeof intent.text === 'string' ? intent.text : (queue.lastTickerTrackText || '');
    updateRepeat({ shouldMirror: !!intent.shouldMirror, text });
    const offset = centered ? 0 : (Number.isFinite(intent.offset) ? intent.offset : 0);
    if (intent.reset) {
      lastOffset = null;
      queue.lastTickerTrackOffset = null;
    }
    applyOffset(offset);
    logDebug('syncFromIntent', {
      centered,
      offset,
      reset: !!intent.reset,
      textPreview: text ? text.slice(0, 40) : '',
      mode: queue.tickerTrackMode
    });
  }

  const scrollUnsubscribe = scrollEmitter && typeof scrollEmitter.on === 'function'
    ? scrollEmitter.on((payload) => {
      logDebug('scrollIntent:received', {
        hasPayload: !!payload,
        centered: !!payload?.centered,
        reset: !!payload?.reset
      });
      syncFromIntent(payload);
    })
    : () => {};

  function setMode(mode) {
    if (!ensureTrack({ reason: 'setMode' })) return;
    const previous = lastMode;
    const nextMode = mode || 'scroll';
    if (previous === nextMode) {
      return;
    }
    lastMode = nextMode;
    queue.tickerTrackMode = nextMode;
    logDebug('setMode', {
      previousMode: previous,
      nextMode,
      hasTrack: !!track,
      hasInner: !!inner,
      hasPrimary: !!primary
    });
    try { track.setAttribute('data-mode', nextMode); } catch (_err) {}
    if (nextMode === 'scroll' && previous === 'paused') {
      resetOffset();
    }
    if (nextMode === 'scroll') {
      syncFromIntent({ offset: queue.lastTickerTrackOffset || 0 });
    }
  }

  function updateLayout({ infoWidth, hudHeight, duration, gap, canvasAttached }) {
    const target = ensureTrack({ reason: 'updateLayout' });
    const hud = dom && typeof dom.get === 'function' ? dom.get('tickerHud') : null;
    const width = Math.max(0, Math.round(infoWidth || 0));
    const height = Math.max(24, Math.round(hudHeight || 0));

    if (hud && hud.style) {
      try { hud.style.setProperty('--ticker-info-width', `${width}px`); } catch (_err) {}
      try { hud.style.setProperty('--ticker-height', `${height}px`); } catch (_err) {}
    }

    if (!target) {
      logDebug('updateLayout:missingTrack', {
        infoWidth,
        hudHeight,
        duration,
        gap,
        canvasAttached,
        pendingRecovery: !!pendingRecovery
      });
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

    queue.lastTickerTrackInfoWidth = width;
    queue.lastTickerTrackGap = resolvedGap;
    queue.lastTickerTrackDuration = resolvedDuration;

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
    queue.lastTickerTrackText = text;
    if (!ensureTrack({ reason: 'setText' })) {
      return;
    }
    if (elementConnected(primary)) {
      try {
        if (primary.textContent !== text) {
          primary.textContent = text;
        }
      } catch (_err) {}
    }
    if (elementConnected(repeat) && !queue.tickerTrackRepeatVisible) {
      try { repeat.textContent = text; } catch (_err) {}
    }
  }

  function applyText(value) {
    return setText(value);
  }

  function measurePrimaryWidth(fallback) {
    if (!ensureTrack({ reason: 'measurePrimaryWidth' }) || !elementConnected(primary)) {
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
    queue.lastTickerTrackOffset = null;
  }

  function dispose() {
    scrollUnsubscribe();
    cancelRecovery('dispose');
    if (mutationObserver) {
      try { mutationObserver.disconnect(); } catch (_err) {}
      logDebug('mutationObserver:stopped', {});
    }
    mutationObserver = null;
    track = null;
    inner = null;
    primary = null;
    repeat = null;
    queue.tickerTrack = null;
    queue.tickerTrackInnerEl = null;
    queue.tickerTrackTextEl = null;
    queue.tickerTrackRepeatEl = null;
    queue.lastTickerTrackText = null;
    queue.lastTickerTrackDuration = null;
    queue.lastTickerTrackInfoWidth = null;
    queue.lastTickerTrackGap = null;
    queue.lastTickerTrackOffset = null;
    queue.tickerTrackRepeatVisible = false;
    queue.tickerTrackCentered = null;
    queue.tickerTrackMode = null;
    emitReady(false);
  }

  return {
    ensureReady: ensureTrack,
    setMode,
    setText,
    applyText,
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

