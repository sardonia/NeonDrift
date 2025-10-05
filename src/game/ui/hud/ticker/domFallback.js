import { TickerTrackEvent } from '../tickerTrackFacade.js';

function logDebug(label, details) {
  try {
    if (typeof console === 'undefined' || !console) return;
    const logger = typeof console.debug === 'function' ? console.debug : console.log;
    if (typeof logger !== 'function') return;
    logger.call(console, `[TickerDomFallback] ${label}`, details);
  } catch (_err) {}
}

export function createDomFallback({ state, domQueue, trackFacade, scrollEmitter }) {
  let trackActive = false;
  let trackVisible = true;
  let lastLayoutSignature = null;
  let lastIntentSignature = null;
  let hasInitialIntent = false;
  const offFns = [];

  function publishScrollIntent({ resetOffset = false } = {}) {
    const text = typeof state.text === 'string' ? state.text : '';
    const payload = {
      offset: state.centered ? 0 : (Number.isFinite(state.offset) ? state.offset : 0),
      centered: !!state.centered,
      text,
      shouldMirror: !state.centered && !!text.trim(),
      reset: !!resetOffset
    };
    const canEmit = !!(scrollEmitter && typeof scrollEmitter.emit === 'function');
    const usingCanvas = state.renderMode === 'canvas';
    const domActive = !!state.domTrackActive;
    const allowInitial = !hasInitialIntent;
    const allowDomActive = domActive;
    const allowReset = domActive && !!resetOffset;
    const signature = `${payload.offset}|${payload.centered ? 1 : 0}|${payload.reset ? 1 : 0}|${text}`;
    logDebug('publishScrollIntent:attempt', {
      canEmit,
      usingCanvas,
      offset: payload.offset,
      centered: payload.centered,
      reset: payload.reset,
      textPreview: typeof text === 'string' ? text.slice(0, 40) : ''
    });
    if (!canEmit || usingCanvas) {
      return;
    }
    if (!(allowDomActive || allowInitial || allowReset)) {
      logDebug('publishScrollIntent:skipped', {
        reason: 'inactiveTrack',
        domTrackActive: domActive,
        trackActive,
        trackVisible,
        resetRequested: !!resetOffset
      });
      return;
    }
    if (!payload.reset && signature === lastIntentSignature && domActive) {
      logDebug('publishScrollIntent:skipped', {
        reason: 'duplicate',
        signature,
        domTrackActive: domActive
      });
      return;
    }
    scrollEmitter.emit(payload);
    hasInitialIntent = true;
    lastIntentSignature = signature;
  }

  function updateDomTrackState(reason) {
    const usingDom = state.renderMode !== 'canvas';
    const previous = !!state.domTrackActive;
    const next = !!(usingDom && trackActive && trackVisible);
    state.domTrackActive = next;
    if (previous !== next) {
      logDebug('updateDomTrackState:changed', {
        domTrackActive: next,
        trackActive,
        trackVisible,
        renderMode: state.renderMode,
        reason
      });
    } else if (reason) {
      logDebug('updateDomTrackState:checked', {
        domTrackActive: next,
        trackActive,
        trackVisible,
        renderMode: state.renderMode,
        reason
      });
    }
    return next;
  }

  function setMode(mode) {
    const nextMode = mode === 'canvas' ? 'canvas' : 'dom';
    if (state.renderMode !== nextMode) {
      state.renderMode = nextMode;
    }
    updateDomTrackState('setMode');
    logDebug('setMode', {
      nextMode,
      domTrackActive: !!state.domTrackActive,
      trackActive,
      trackVisible
    });
    if (nextMode === 'canvas') {
      hasInitialIntent = false;
      lastIntentSignature = null;
    }
    if (nextMode === 'dom') {
      publishScrollIntent();
    }
    return state.renderMode;
  }

  function updateLayout() {
    if (!trackFacade) {
      updateDomTrackState('updateLayout:skippedFacade');
      return { active: state.domTrackActive };
    }
    const previousSignature = lastLayoutSignature;
    const infoWidth = Math.max(0, Math.round(state.infoWidth || 0));
    const hudHeight = Math.max(24, Math.round(state.height || state.design.defaultHeight));
    const duration = Math.max(4, Number.isFinite(state.duration) ? state.duration : 20);
    const gap = Math.max(0, Math.round(state.marqueeGap || 0));
    trackFacade.updateLayout({
      infoWidth,
      hudHeight,
      duration,
      gap,
      canvasAttached: state.renderMode === 'canvas'
    });
    updateDomTrackState('updateLayout');
    const signature = `${infoWidth}|${duration}|${gap}|${state.centered ? '1' : '0'}|${state.renderMode}`;
    if (lastLayoutSignature !== signature) {
      lastLayoutSignature = signature;
      if (state.renderMode !== 'canvas') {
        publishScrollIntent({ resetOffset: true });
      }
    }
    logDebug('updateLayout', {
      infoWidth,
      hudHeight,
      duration,
      gap,
      signature,
      signatureChanged: previousSignature !== signature,
      domTrackActive: !!state.domTrackActive
    });
    return { active: state.domTrackActive };
  }

  function updateTrackMode() {
    if (!trackFacade) {
      updateDomTrackState('updateTrackMode:skippedFacade');
      logDebug('updateTrackMode:skippedFacade', {
        domTrackActive: !!state.domTrackActive,
        centered: !!state.centered
      });
      return;
    }
    const mode = state.centered ? 'paused' : 'scroll';
    trackFacade.setMode(mode);
    logDebug('updateTrackMode', {
      mode,
      domTrackActive: !!state.domTrackActive,
      centered: !!state.centered
    });
    if (state.renderMode !== 'canvas') {
      publishScrollIntent();
    }
  }

  if (trackFacade && trackFacade.events && typeof trackFacade.events.on === 'function') {
    offFns.push(trackFacade.events.on(TickerTrackEvent.TRACK_READY, (payload) => {
      const previousActive = trackActive;
      const previousDomActive = !!state.domTrackActive;
      trackActive = !!(payload && payload.active);
      logDebug('event:TRACK_READY', {
        payload: {
          active: trackActive,
          hasTrack: !!(payload && payload.track),
          hasInner: !!(payload && payload.inner),
          hasPrimary: !!(payload && payload.primary),
          hasRepeat: !!(payload && payload.repeat)
        },
        previousActive,
        trackActive,
        trackVisible,
        domTrackActive: previousDomActive
      });
      const nextDomActive = updateDomTrackState('event:TRACK_READY');
      if (!trackActive) {
        hasInitialIntent = false;
        lastIntentSignature = null;
      }
      if (!previousDomActive && nextDomActive && state.renderMode !== 'canvas') {
        logDebug('event:TRACK_READY:reactivated', {
          renderMode: state.renderMode,
          previousDomActive,
          nextDomActive
        });
        publishScrollIntent({ resetOffset: true });
      }
    }));
    offFns.push(trackFacade.events.on(TickerTrackEvent.VISIBILITY_CHANGED, (payload) => {
      const previousVisible = trackVisible;
      const previousDomActive = !!state.domTrackActive;
      trackVisible = !(payload && payload.visible === false);
      logDebug('event:VISIBILITY_CHANGED', {
        payload: {
          visible: trackVisible
        },
        previousVisible,
        trackActive,
        trackVisible,
        domTrackActive: previousDomActive
      });
      const nextDomActive = updateDomTrackState('event:VISIBILITY_CHANGED');
      if (!previousDomActive && nextDomActive && state.renderMode !== 'canvas') {
        logDebug('event:VISIBILITY_CHANGED:reactivated', {
          renderMode: state.renderMode,
          previousDomActive,
          nextDomActive
        });
        publishScrollIntent({ resetOffset: true });
      }
      if (!trackVisible) {
        hasInitialIntent = false;
        lastIntentSignature = null;
      }
    }));
    offFns.push(trackFacade.events.on(TickerTrackEvent.OFFSET_CHANGED, (payload) => {
      if (payload && Number.isFinite(payload.offset)) {
        domQueue.lastTickerTrackOffset = payload.offset;
      }
      logDebug('event:OFFSET_CHANGED', {
        payload: {
          offset: payload && Number.isFinite(payload.offset) ? payload.offset : null
        },
        storedOffset: domQueue.lastTickerTrackOffset
      });
    }));
  }

  function dispose(options = {}) {
    const { preserveFacade = false } = options || {};
    if (preserveFacade) {
      return;
    }
    while (offFns.length) {
      const off = offFns.pop();
      try {
        if (typeof off === 'function') {
          off();
        }
      } catch (_err) {}
    }
    lastLayoutSignature = null;
    lastIntentSignature = null;
    hasInitialIntent = false;
    trackActive = false;
    trackVisible = true;
    state.domTrackActive = false;
  }

  return {
    setMode,
    updateLayout,
    updateTrackMode,
    publishScrollIntent,
    dispose
  };
}

export default {
  createDomFallback
};
