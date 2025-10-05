const NO_OP = () => {};

let _worker = null;
let _ready = false;
let _queue = [];
let _supports = null;
let _onError = NO_OP;

function detectSupport() {
  if (_supports != null) {
    return _supports;
  }
  try {
    const hasWorker = typeof Worker === 'function';
    const offscreenDisabled = typeof globalThis !== 'undefined'
      && globalThis.__NEON_OFFSCREEN_DISABLED__ === true;
    const hasOffscreen = !offscreenDisabled && typeof OffscreenCanvas === 'function';
    const hasTransfer = typeof document !== 'undefined'
      ? typeof HTMLCanvasElement !== 'undefined'
      : true;
    _supports = hasWorker && hasOffscreen && hasTransfer;
  } catch (_) {
    _supports = false;
  }
  return _supports;
}

function ensureWorker() {
  if (!detectSupport()) {
    return null;
  }
  if (_worker) {
    return _worker;
  }
  try {
    const url = new URL('../../workers/renderWorker.js', import.meta.url);
    _worker = new Worker(url, { type: 'module' });
    _worker.addEventListener('message', (event) => {
      const data = event && event.data;
      if (!data || typeof data !== 'object') {
        return;
      }
      if (data.type === 'ready') {
        _ready = true;
        const queue = _queue;
        _queue = [];
        for (const entry of queue) {
          try {
            _worker.postMessage(entry.message, entry.transferables || []);
          } catch (error) {
            _onError(error);
          }
        }
      } else if (data.type === 'error') {
        if (data.error instanceof Error) {
          _onError(data.error);
        } else if (data.error && typeof data.error.message === 'string') {
          _onError(new Error(data.error.message));
        }
      }
    });
  } catch (error) {
    _worker = null;
    _supports = false;
    _onError(error);
  }
  return _worker;
}

function postMessage(message, transferables) {
  const worker = ensureWorker();
  if (!worker) {
    return false;
  }
  try {
    if (_ready) {
      worker.postMessage(message, transferables || []);
    } else {
      _queue.push({ message, transferables });
    }
    return true;
  } catch (error) {
    _onError(error);
    return false;
  }
}

export function createOffscreenRenderBridge({ onError } = {}) {
  if (typeof onError === 'function') {
    _onError = onError;
  } else {
    _onError = NO_OP;
  }
  return {
    get supported() {
      return detectSupport();
    },
    init(payload = {}) {
      _ready = false;
      const worker = ensureWorker();
      if (!worker) {
        return false;
      }
      const transferables = [];
      const canvases = payload.canvases || {};
      if (canvases.board) transferables.push(canvases.board);
      if (canvases.trails) transferables.push(canvases.trails);
      if (canvases.fx) transferables.push(canvases.fx);
      if (canvases.wallsGlow) transferables.push(canvases.wallsGlow);
      const message = {
        type: 'init',
        payload: {
          canvases,
          colors: payload.colors || {},
          pulseSpan: payload.pulseSpan,
          trails: payload.trails || {},
          constants: payload.constants || {},
          theme: payload.theme || {}
        }
      };
      return postMessage(message, transferables);
    },
    postFrame(frame) {
      if (!frame) return false;
      return postMessage({ type: 'frame', payload: frame });
    },
    drawTrailSegment(segment) {
      if (!segment) return false;
      return postMessage({ type: 'trailSegment', payload: segment });
    },
    syncTrails(trails) {
      if (!trails) return false;
      return postMessage({ type: 'syncTrails', payload: trails });
    },
    updatePulseSpan(value) {
      return postMessage({ type: 'pulseSpan', payload: { value } });
    },
    updateColors(colors) {
      return postMessage({ type: 'colors', payload: colors || {} });
    },
    dispose() {
      if (_worker) {
        try {
          _worker.postMessage({ type: 'dispose' });
        } catch (_) {
        }
        try {
          _worker.terminate();
        } catch (_) {
        }
      }
      _worker = null;
      _ready = false;
      _queue = [];
    }
  };
}

export function __resetOffscreenSupportCacheForTests() {
  _supports = null;
}
