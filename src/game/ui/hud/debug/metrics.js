const NOOP_OBJECT = Object.freeze({});

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function boolFlag(value) {
  return value === true;
}

export function createDebugMetricsTracker({
  tickerState = NOOP_OBJECT,
  domAdapter = null,
  marqueeCache = NOOP_OBJECT,
  pointerTelemetry = null,
  countdown = null,
  worker = null
} = {}) {
  const history = [];
  let lastFrameTs = 0;
  let pausedFrames = 0;
  let frames = 0;
  let lastPause = false;
  let prePauseSnapshot = null;

  const readTickerMetrics = () => {
    const state = tickerState || NOOP_OBJECT;
    const powerups = Array.isArray(state.powerups) ? state.powerups : [];
    const hasWorker = !!(worker && typeof worker.isActive === 'function' && worker.isActive());
    const mode = hasWorker ? 'worker' : 'main-thread';
    const layoutDirty = !!(state.needsLayout || state.powerLayoutDirty);
    const cache = marqueeCache || NOOP_OBJECT;
    return {
      mode,
      paused: !!state.paused,
      centered: !!state.centered,
      width: toNumber(state.width, null),
      height: toNumber(state.height, null),
      infoWidth: toNumber(state.infoWidth, null),
      marqueeLeft: toNumber(state.marqueeLeft, null),
      marqueeWidth: toNumber(state.marqueeWidth, null),
      marqueeGap: toNumber(state.marqueeGap, null),
      duration: toNumber(state.duration, null),
      speed: toNumber(state.speed, null),
      offset: toNumber(state.offset, null),
      dpr: toNumber(state.dpr, null),
      scoreDigits: toNumber(state.scoreDigits, null),
      levelDigits: toNumber(state.levelDigits, null),
      textLength: toNumber(state.textLength, null),
      powerupCount: powerups.length,
      layoutKey: state.powerLayoutKey || '',
      layoutDirty,
      canvasAttached: !!state.canvasAttached,
      hudAttached: !!state.hudAttached,
      marqueeCacheWidth: toNumber(cache.width, null),
      marqueeCacheHeight: toNumber(cache.height, null),
      marqueeCacheBaseline: toNumber(cache.baseline, null)
    };
  };

  const readWorkerMetrics = () => {
    const state = tickerState || NOOP_OBJECT;
    const hasWorker = !!(worker && typeof worker.isActive === 'function' && worker.isActive());
    const ready = typeof worker?.isReady === 'function' ? !!worker.isReady() : hasWorker;
    const queueSizeRaw = typeof worker?.getQueueSize === 'function' ? worker.getQueueSize() : 0;
    const sharedBuffer = typeof worker?.hasSharedBuffer === 'function' ? !!worker.hasSharedBuffer() : false;
    const sharedFlags = (state.paused ? 1 : 0) | (state.centered ? 2 : 0);
    return {
      hasWorker,
      ready,
      queueSize: toNumber(queueSizeRaw, 0),
      animationId: state.animationId ?? null,
      needsLayout: !!state.needsLayout,
      needsRedraw: !!state.needsRedraw,
      fallbackMode: hasWorker ? 'worker' : 'main-thread',
      sharedBuffer,
      sharedSnapshot: {
        score: toNumber(state.score, 0),
        level: toNumber(state.level, 0),
        duration: toNumber(state.duration, 0),
        flags: sharedFlags
      }
    };
  };

  const readPointerMetrics = () => {
    if (!pointerTelemetry || typeof pointerTelemetry.getSnapshot !== 'function') {
      return {
        hasWorker: false,
        ready: false,
        listenersAttached: false,
        sharedBuffer: false,
        sharedFlags: 0,
        sharedVersion: 0,
        sharedReadyIndex: -1,
        sharedCapacity: 0,
        lastTypeLabel: 'inactive',
        lastButtons: 0,
        lastX: null,
        lastY: null,
        lastMovementX: 0,
        lastMovementY: 0,
        lastEventFlags: 'none',
        lastInstantSpeed: 0,
        lastSmoothSpeed: 0,
        lastTimestamp: 0,
        needsWorkerPoke: false
      };
    }
    const snap = pointerTelemetry.getSnapshot() || {};
    const wallClock = toNumber(snap.lastWallClock, 0);
    const now = Date.now();
    const needsPoke = !!(snap.active && wallClock && now - wallClock > 500);
    const typeLabel = snap.lastType || snap.lastEventType || (snap.active ? 'pointer' : 'inactive');
    return {
      hasWorker: false,
      ready: false,
      listenersAttached: !!snap.listenersAttached,
      sharedBuffer: false,
      sharedFlags: 0,
      sharedVersion: 0,
      sharedReadyIndex: -1,
      sharedCapacity: 0,
      lastTypeLabel: String(typeLabel),
      lastButtons: toNumber(snap.lastButtons, 0),
      lastX: Number.isFinite(snap.lastX) ? snap.lastX : null,
      lastY: Number.isFinite(snap.lastY) ? snap.lastY : null,
      lastMovementX: toNumber(snap.lastMovementX, 0),
      lastMovementY: toNumber(snap.lastMovementY, 0),
      lastEventFlags: snap.forced ? 'forced' : 'none',
      lastInstantSpeed: toNumber(snap.instant, 0),
      lastSmoothSpeed: toNumber(snap.smooth, 0),
      lastTimestamp: toNumber(snap.lastTimestamp, 0),
      needsWorkerPoke: needsPoke
    };
  };

  const readDomMetrics = () => {
    if (!domAdapter || typeof domAdapter.get !== 'function') {
      return {};
    }
    const resolve = (key) => !!domAdapter.get(key);
    return {
      overlay: resolve('overlay'),
      panel: resolve('panel'),
      ticker: resolve('tickerHud'),
      scoreEl: resolve('tickerScore'),
      levelEl: resolve('tickerLevel'),
      powerupsList: resolve('tickerPowerupsList'),
      tickerCanvas: resolve('tickerCanvas'),
      tickerText: resolve('tickerText')
    };
  };

  const readCountdownMetrics = () => {
    if (!countdown || typeof countdown.getSnapshot !== 'function') {
      return {
        timerActive: false,
        handlerCount: 0,
        resetGuard: false
      };
    }
    const snap = countdown.getSnapshot() || {};
    return {
      timerActive: !!snap.timerActive,
      handlerCount: toNumber(snap.handlerCount, 0),
      resetGuard: boolFlag(snap.resetGuard)
    };
  };

  const capturePrePause = () => ({
    ticker: readTickerMetrics(),
    worker: readWorkerMetrics(),
    pointer: readPointerMetrics(),
    dom: readDomMetrics(),
    countdown: readCountdownMetrics()
  });

  return {
    recordFrame({ timestamp, paused }) {
      if (typeof timestamp === 'number') {
        const delta = lastFrameTs ? timestamp - lastFrameTs : 0;
        lastFrameTs = timestamp;
        history.push({ timestamp, delta, paused: !!paused });
        if (history.length > 120) {
          history.shift();
        }
      }
      if (paused) {
        if (!lastPause) {
          prePauseSnapshot = capturePrePause();
        }
        pausedFrames += 1;
        lastPause = true;
      } else {
        if (lastPause) {
          prePauseSnapshot = null;
        }
        frames += 1;
        lastPause = false;
      }
    },
    snapshot() {
      return {
        frames,
        pausedFrames,
        lastFrameTs,
        recent: history.slice(),
        ticker: readTickerMetrics(),
        worker: readWorkerMetrics(),
        pointer: readPointerMetrics(),
        dom: readDomMetrics(),
        countdown: readCountdownMetrics(),
        prePause: prePauseSnapshot ? {
          ticker: { ...prePauseSnapshot.ticker },
          worker: { ...prePauseSnapshot.worker },
          pointer: { ...prePauseSnapshot.pointer },
          dom: { ...prePauseSnapshot.dom },
          countdown: { ...prePauseSnapshot.countdown }
        } : null
      };
    },
    reset() {
      history.length = 0;
      lastFrameTs = 0;
      pausedFrames = 0;
      frames = 0;
      lastPause = false;
      prePauseSnapshot = null;
    }
  };
}

export default {
  createDebugMetricsTracker
};
