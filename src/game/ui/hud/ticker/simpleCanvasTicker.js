import {
  setTickerDimensions,
  setTextMetrics,
  computeTickerSpeed,
} from './state.js';
import { createCanvasDriver as createCanvasDriverFactory } from './canvasDriver.js';

function readCanvas(dom, key) {
  if (!dom || typeof dom.get !== 'function') {
    return null;
  }
  try {
    return dom.get(key);
  } catch (_err) {
    return null;
  }
}

function resolveDimension(value, fallback) {
  if (typeof value === 'number' && value > 0 && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}

function resolveCanvasDimensions(state, dom) {
  const marquee = readCanvas(dom, 'tickerCanvas');
  const defaultWidth = resolveDimension(state?.width, state?.design?.defaultWidth || 640);
  const defaultHeight = resolveDimension(state?.height, state?.design?.defaultHeight || 72);
  const widthCandidate = resolveDimension(marquee?.clientWidth, null)
    ?? resolveDimension(marquee?.width, null)
    ?? defaultWidth;
  const heightCandidate = resolveDimension(marquee?.clientHeight, null)
    ?? resolveDimension(marquee?.height, null)
    ?? defaultHeight;
  return {
    width: Math.max(1, Math.round(widthCandidate)),
    height: Math.max(1, Math.round(heightCandidate)),
  };
}

function measureTextWidth(driver, state, text, { centered = false } = {}) {
  if (!driver || typeof driver.measureTextWidth !== 'function') {
    return (text || '').length * 24;
  }
  const width = driver.measureTextWidth(text, { centered });
  if (typeof width === 'number' && Number.isFinite(width) && width >= 0) {
    return width;
  }
  return (text || '').length * 24;
}

export function createSimpleCanvasTicker({
  state,
  dom,
  createCanvasDriver = createCanvasDriverFactory,
} = {}) {
  if (!state || typeof state !== 'object') {
    throw new TypeError('Simple canvas ticker requires a ticker state object.');
  }

  const canvasDriver = createCanvasDriver({ state });
  let domRef = dom || null;
  let lastTimestamp = null;

  function ensureAttachedDom() {
    if (!canvasDriver || typeof canvasDriver.attach !== 'function') {
      return { ready: false };
    }
    return canvasDriver.attach(domRef);
  }

  function updateLayout() {
    ensureAttachedDom();
    const { width, height } = resolveCanvasDimensions(state, domRef);
    setTickerDimensions(state, { width, height });
    state.infoWidth = 0;
    state.marqueeLeft = 0;
    state.marqueeWidth = width;
    state.marqueeGap = Math.max(40, Math.round(width * 0.28));
    computeTickerSpeed(state);
    const resizeResult = canvasDriver && typeof canvasDriver.resize === 'function'
      ? canvasDriver.resize()
      : { ready: true };
    if (!resizeResult || resizeResult.ready === false) {
      state.needsLayout = true;
      state.needsRedraw = true;
    } else {
      state.needsLayout = false;
      state.needsRedraw = true;
    }
    return resizeResult || { ready: false };
  }

  function refreshTextMetrics({ resetOffset = false } = {}) {
    const width = measureTextWidth(canvasDriver, state, state.text, { centered: state.centered });
    setTextMetrics(state, { width, length: state.text.length });
    computeTickerSpeed(state, { resetOffset });
  }

  function setText(text, options = {}) {
    const resolved = String(text ?? '');
    state.text = resolved;
    if (resolved && (options.markAsDefault || !state.defaultText)) {
      state.defaultText = resolved;
    }
    if (!state.paused) {
      state.centered = false;
    }
    refreshTextMetrics({ resetOffset: true });
    state.offset = state.marqueeWidth;
    state.needsRedraw = true;
  }

  function init(options = {}) {
    if (options.dom) {
      domRef = options.dom;
    }
    if (typeof options.durationSec === 'number' && options.durationSec > 0) {
      state.duration = options.durationSec;
    }
    state.paused = false;
    state.centered = false;
    state.needsLayout = true;
    ensureAttachedDom();
    updateLayout();
    const initialText = options.text ?? state.text ?? state.defaultText ?? '';
    setText(initialText, { markAsDefault: !state.defaultText });
    lastTimestamp = null;
  }

  function step(ts = 0) {
    if (state.needsLayout) {
      const layoutResult = updateLayout();
      if (!layoutResult || layoutResult.ready === false) {
        return;
      }
    }

    if (!state.paused && !state.centered) {
      const delta = lastTimestamp === null ? 16 : Math.max(0, ts - lastTimestamp);
      state.offset -= state.speed * (delta / 1000);
      const wrap = state.textWidth + state.marqueeGap;
      if (wrap > 0) {
        while (state.offset <= -wrap) {
          state.offset += wrap;
        }
      }
      state.needsRedraw = true;
    }

    lastTimestamp = ts;

    if (!state.needsRedraw && state.canvasReady) {
      return;
    }

    if (canvasDriver && typeof canvasDriver.draw === 'function') {
      const drawResult = canvasDriver.draw();
      if (!drawResult || drawResult.ready === false) {
        state.needsLayout = true;
        state.needsRedraw = true;
        return;
      }
    }
    state.needsRedraw = false;
  }

  function pause() {
    state.paused = true;
  }

  function resume() {
    state.paused = false;
    lastTimestamp = null;
    state.needsRedraw = true;
  }

  function dispose() {
    if (canvasDriver && typeof canvasDriver.detach === 'function') {
      canvasDriver.detach();
    }
  }

  return {
    init,
    setText,
    step,
    updateLayout,
    pause,
    resume,
    dispose,
  };
}

export default {
  createSimpleCanvasTicker,
};
