const RAF_FALLBACK_MS = 16;

function logDebug(label, details) {
  if (typeof console === 'undefined' || !console) {
    return;
  }
  const logger = typeof console.debug === 'function' ? console.debug : console.log;
  if (typeof logger !== 'function') {
    return;
  }
  try {
    logger.call(console, `[TickerOrchestrator] ${label}`, details);
  } catch (_err) {}
}

export class TickerOrchestrator {
  constructor({
    renderer,
    state,
    worker,
    domQueue,
    trackFacade,
    scrollEmitter
  } = {}) {
    this.renderer = renderer;
    this.state = state;
    this.worker = worker;
    this.domQueue = domQueue;
    this.trackFacade = trackFacade;
    this.scrollEmitter = scrollEmitter;

    this._animationId = null;
    this._timeoutHandle = null;
    this._boundStep = (ts) => this._handleFrame(ts);
  }

  _cancelScheduled() {
    if (this._animationId !== null) {
      try {
        if (typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(this._animationId);
        }
      } catch (_err) {}
      this._animationId = null;
    }
    if (this._timeoutHandle !== null) {
      try {
        clearTimeout(this._timeoutHandle);
      } catch (_err) {}
      this._timeoutHandle = null;
    }
    if (this.state) {
      this.state.animationId = null;
    }
  }

  _scheduleNext() {
    if (!this.renderer || !this.state || typeof this.renderer.step !== 'function') return false;
    logDebug('scheduleNext:start', {
      paused: !!this.state.paused,
      needsRedraw: !!this.state.needsRedraw,
      hasAnimationId: this._animationId !== null,
      hasTimeout: this._timeoutHandle !== null,
    });
    if (this.state.paused) {
      logDebug('scheduleNext:skipped:paused', {
        paused: !!this.state.paused,
      });
      return false;
    }
    if (this._animationId !== null || this._timeoutHandle !== null) {
      logDebug('scheduleNext:skipped:pendingHandle', {
        animationId: this._animationId,
        timeoutHandle: this._timeoutHandle,
      });
      return false;
    }
    try {
      if (typeof requestAnimationFrame === 'function') {
        this._animationId = requestAnimationFrame(this._boundStep);
        this.state.animationId = this._animationId;
        logDebug('scheduleNext:rafScheduled', {
          animationId: this._animationId,
        });
        return true;
      }
    } catch (_err) {}

    try {
      if (typeof setTimeout === 'function') {
        const now = typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
          ? () => performance.now()
          : () => Date.now();
        this._timeoutHandle = setTimeout(() => {
          this._timeoutHandle = null;
          this._handleFrame(now());
        }, RAF_FALLBACK_MS);
        logDebug('scheduleNext:timeoutScheduled', {
          timeoutHandle: this._timeoutHandle,
        });
        return this._timeoutHandle !== null;
      }
    } catch (_err) {}
    logDebug('scheduleNext:failed', {
      animationId: this._animationId,
      timeoutHandle: this._timeoutHandle,
    });
    return false;
  }

  _handleFrame(ts) {
    const beforeDetails = {
      timestamp: ts,
      paused: this.state ? !!this.state.paused : null,
      needsRedraw: this.state ? !!this.state.needsRedraw : null,
      animationId: this._animationId,
      timeoutHandle: this._timeoutHandle,
      stateAnimationId: this.state ? this.state.animationId : null
    };
    logDebug('handleFrame:beforeStep', beforeDetails);
    this._cancelScheduled();
    if (!this.renderer || typeof this.renderer.step !== 'function') {
      logDebug('handleFrame:skipped:noRenderer', { timestamp: ts });
      return;
    }
    try {
      this.renderer.step(ts);
    } catch (err) {
      logDebug('handleFrame:stepError', { timestamp: ts, error: err });
    }
    const afterDetails = {
      timestamp: ts,
      paused: this.state ? !!this.state.paused : null,
      needsRedraw: this.state ? !!this.state.needsRedraw : null,
      animationId: this._animationId,
      timeoutHandle: this._timeoutHandle,
      stateAnimationId: this.state ? this.state.animationId : null
    };
    logDebug('handleFrame:afterStep', afterDetails);
    if (this.worker && typeof this.worker.postMessage === 'function' && this.state && this.state.needsRedraw) {
      try {
        this.worker.postMessage({ type: 'ticker:frame', paused: !!this.state.paused });
      } catch (_err) {}
    }
    let scheduledNext = false;
    if (this.state && !this.state.paused) {
      scheduledNext = this._scheduleNext();
      logDebug('handleFrame:rescheduleAttempt', {
        timestamp: ts,
        scheduledNext,
        animationId: this._animationId,
        timeoutHandle: this._timeoutHandle
      });
    } else {
      logDebug('handleFrame:rescheduleSkipped', {
        timestamp: ts,
        paused: this.state ? !!this.state.paused : null
      });
    }
  }

  _ensureFrame() {
    if (this.state) {
      this.state.needsRedraw = true;
      logDebug('ensureFrame:markRedraw', {
        paused: !!this.state.paused,
        needsRedraw: !!this.state.needsRedraw,
      });
    }
    this._scheduleNext();
  }

  init(options = {}) {
    if (!this.renderer) return;
    const wasPaused = this.state ? !!this.state.paused : null;
    logDebug('init:beforeRenderer', {
      wasPaused,
    });
    if (typeof this.renderer.init === 'function') {
      this.renderer.init(options);
    }
    if (this.state && this.state.paused) {
      logDebug('init:statePausedPostRenderer', {
        paused: !!this.state.paused,
      });
      try {
        this.renderer.resume();
        this.state.paused = false;
        logDebug('init:rendererResumed', {
          paused: !!this.state.paused,
        });
      } catch (_err) {}
    }
    this._ensureFrame();
  }

  updateLayout() {
    if (!this.renderer) return;
    if (typeof this.renderer.updateLayout === 'function') {
      this.renderer.updateLayout();
    }
    this._ensureFrame();
  }

  setText(text, options) {
    if (!this.renderer) return;
    if (typeof this.renderer.setText === 'function') {
      this.renderer.setText(text, options);
    }
    this._ensureFrame();
  }

  updateScore(value) {
    if (!this.renderer) return;
    if (typeof this.renderer.updateScore === 'function') {
      this.renderer.updateScore(value);
    }
    this._ensureFrame();
  }

  updateLevel(value) {
    if (!this.renderer) return;
    if (typeof this.renderer.updateLevel === 'function') {
      this.renderer.updateLevel(value);
    }
    this._ensureFrame();
  }

  updatePowerups(list) {
    if (!this.renderer) return;
    if (typeof this.renderer.updatePowerups === 'function') {
      this.renderer.updatePowerups(list);
    }
    this._ensureFrame();
  }

  syncTextMetrics(options) {
    if (!this.renderer) return;
    if (typeof this.renderer.syncTextMetrics === 'function') {
      this.renderer.syncTextMetrics(options);
    }
  }

  pause() {
    if (!this.renderer) return;
    if (typeof this.renderer.pause === 'function') {
      this.renderer.pause();
    }
    this._cancelScheduled();
  }

  resume() {
    if (!this.renderer) return;
    if (typeof this.renderer.resume === 'function') {
      this.renderer.resume();
    }
    this._ensureFrame();
  }

  showPauseTicker() {
    if (!this.renderer) return;
    if (typeof this.renderer.showPauseTicker === 'function') {
      this.renderer.showPauseTicker();
    }
    this._cancelScheduled();
  }

  hidePauseTicker() {
    if (!this.renderer) return;
    if (typeof this.renderer.hidePauseTicker === 'function') {
      this.renderer.hidePauseTicker();
    }
    this._ensureFrame();
  }

  dispose(options = {}) {
    const { disposeTrackFacade = false } = options || {};
    this._cancelScheduled();
    if (!disposeTrackFacade && this.trackFacade) {
      try {
        if (typeof this.trackFacade.ensureReady === 'function') {
          this.trackFacade.ensureReady({ reason: 'orchestratorDispose' });
        }
        if (typeof this.trackFacade.setMode === 'function') {
          const mode = this.state && this.state.centered ? 'paused' : 'scroll';
          this.trackFacade.setMode(mode);
        }
        const textFromState = this.state && typeof this.state.text === 'string' ? this.state.text : '';
        const queueText = this.domQueue && typeof this.domQueue.lastTickerTrackText === 'string'
          ? this.domQueue.lastTickerTrackText
          : textFromState;
        const text = queueText || textFromState || '';
        const trimmed = text.trim();
        const offset = this.state && !this.state.centered && Number.isFinite(this.state.offset)
          ? this.state.offset
          : 0;
        const payload = {
          offset,
          centered: !!(this.state && this.state.centered),
          text,
          shouldMirror: !(this.state && this.state.centered) && !!trimmed,
          reset: true
        };
        if (this.scrollEmitter && typeof this.scrollEmitter.emit === 'function') {
          this.scrollEmitter.emit(payload);
        } else if (typeof this.trackFacade.syncFromIntent === 'function') {
          this.trackFacade.syncFromIntent(payload);
        }
      } catch (_err) {}
    }
    if (this.renderer && typeof this.renderer.dispose === 'function') {
      const preserveDomFallback = !disposeTrackFacade;
      this.renderer.dispose({ preserveDomFallback });
    }
    if (disposeTrackFacade && this.trackFacade && typeof this.trackFacade.dispose === 'function') {
      this.trackFacade.dispose();
    }
    this.renderer = null;
    if (disposeTrackFacade) {
      this.trackFacade = null;
    }
  }
}

export default {
  TickerOrchestrator
};
