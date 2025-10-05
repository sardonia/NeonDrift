import {
  computeTickerLayout,
  computeTickerSpeed,
  updateMetricDigits,
  setTickerDimensions,
  setTextMetrics,
  invalidatePowerLayout
} from './state.js';
import { createCanvasDriver } from './canvasDriver.js';
import { createDomFallback } from './domFallback.js';

const RAF_FALLBACK_LIMIT = 200;
const PAUSE_BANNER_TEXT = '***PAUSED***';

function logDebug(label, details) {
  try {
    if (typeof console === 'undefined' || !console) return;
    const logger = typeof console.debug === 'function' ? console.debug : console.log;
    if (typeof logger !== 'function') return;
    logger.call(console, `[TickerRenderer] ${label}`, details);
  } catch (_err) {}
}

function isPauseBanner(value) {
  if (typeof value !== 'string') {
    return false;
  }
  return value.trim() === PAUSE_BANNER_TEXT;
}

// Use a lightning bolt glyph for the acceleration power‑up.  This replaces the
// literal text “ACCEL”, giving a more intuitive visual cue to the player.
const POWERUP_PRESETS = Object.freeze({
  accel: { icon: '⚡', label: 'Acceleration', dataset: 'accel' }
});

function escapePowerupString(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function updatePowerupsDom(domQueue, dom, payload) {
  if (!payload) return;
  const target = dom.get('tickerPowerupsList');
  if (!target) return;
  const html = payload.html ?? '';
  const text = payload.text ?? '';
  if (domQueue.lastPowerupsHtml !== html) {
    domQueue.lastPowerupsHtml = html;
    try { target.innerHTML = html; } catch (_err) {}
  }
  if (domQueue.lastPowerupsText !== text) {
    domQueue.lastPowerupsText = text;
    try { target.setAttribute('aria-label', text); } catch (_err) {}
  }
}

function updateTickerTextDom(domQueue, dom, value) {
  const target = dom.get('tickerText');
  if (!target) return;
  const text = String(value ?? '');
  if (domQueue.lastTickerText !== text) {
    domQueue.lastTickerText = text;
    try {
      if (target.textContent !== text) {
        target.textContent = text;
      }
    } catch (_err) {}
  }
  const ariaLabel = text.trim().replace(/\s+/g, ' ');
  if (domQueue.lastTickerTextAria !== ariaLabel) {
    domQueue.lastTickerTextAria = ariaLabel;
    try {
      if (typeof target.setAttribute === 'function') {
        target.setAttribute('aria-label', ariaLabel);
      } else if ('ariaLabel' in target) {
        target.ariaLabel = ariaLabel;
      }
    } catch (_err) {}
  }
}

function normalisePowerups(list) {
  if (!Array.isArray(list)) {
    return { display: [], html: '', text: '', raw: [] };
  }
  const entries = [];
  const spoken = [];
  const raw = [];
  const display = [];
  for (const candidate of list) {
    if (candidate === undefined || candidate === null) continue;
    const base = String(candidate).trim();
    if (!base) continue;
    const key = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
    const preset = POWERUP_PRESETS[key];
    const icon = preset
      ? preset.icon
      : base.toUpperCase().replace(/[^A-Z0-9+]/g, ' ').trim() || base.toUpperCase();
    const label = preset ? preset.label : (base.replace(/\s+/g, ' ').trim() || icon);
    const dataset = preset ? preset.dataset : key;
    raw.push(base);
    display.push(icon);
    spoken.push(label);
    const safeIcon = escapePowerupString(icon);
    const safeLabel = escapePowerupString(label);
    const safeDataset = escapePowerupString(dataset);
    entries.push(`<span class="hud-powerup" data-powerup="${safeDataset}" title="${safeLabel}">${safeIcon}</span>`);
    if (entries.length >= 6) break;
  }
  return {
    display: entries.length ? display : [],
    html: entries.join(''),
    text: spoken.join(', '),
    raw
  };
}

function updateScoreDom(domQueue, dom, value) {
  const target = dom.get('tickerScore');
  if (!target) return;
  const text = String(value);
  if (target.textContent !== text) {
    target.textContent = text;
  }
  domQueue.score = value;
  domQueue.scoreDirty = false;
}

function updateLevelDom(domQueue, dom, value) {
  const target = dom.get('tickerLevel');
  if (!target) return;
  const text = String(value);
  if (target.textContent !== text) {
    target.textContent = text;
  }
  domQueue.level = value;
  domQueue.levelDirty = false;
}

function preparePowerLayout(ctx, state, interior) {
  const icons = Array.isArray(state.powerups) ? state.powerups : [];
  const key = [
    Math.round(interior.iconsAreaLeft || 0),
    Math.round(interior.iconsAreaRight || 0),
    Math.round((interior.labelX || 0) * 10),
    icons.join('\u0001')
  ].join('|');
  if (!state.powerLayoutDirty && state.powerLayout && state.powerLayoutKey === key) {
    return state.powerLayout;
  }

  const layout = {
    centerX: interior.labelX,
    iconsAreaLeft: interior.iconsAreaLeft,
    iconsAreaRight: interior.iconsAreaRight,
    iconsAreaWidth: interior.iconsAreaWidth,
    entries: [],
    placeholder: icons.length === 0
  };

  if (!ctx || !icons.length || !(interior.iconsAreaWidth > 0)) {
    state.powerLayout = layout;
    state.powerLayoutKey = key;
    state.powerLayoutDirty = false;
    return layout;
  }

  const spacing = state.design.iconSpacing ?? 18;
  const entries = [];
  let totalWidth = 0;

  ctx.save();
  try {
    ctx.font = TICKER_FONTS.power;
    for (const token of icons) {
      const icon = String(token ?? '');
      let metricsWidth = 0;
      try {
        const metrics = ctx.measureText(icon);
        metricsWidth = metrics && typeof metrics.width === 'number' ? metrics.width : 0;
      } catch (_err) {
        metricsWidth = icon.length * 18;
      }
      const width = Math.max(24, Math.ceil(metricsWidth));
      entries.push({ text: icon, width });
      totalWidth += width;
    }
    if (entries.length > 1) {
      totalWidth += spacing * (entries.length - 1);
    }
    while (entries.length > 1 && totalWidth > interior.iconsAreaWidth) {
      const removed = entries.pop();
      totalWidth -= removed.width;
      totalWidth -= spacing;
    }
    let startX = (interior.labelX || 0) - totalWidth / 2;
    if (startX < interior.iconsAreaLeft) {
      startX = interior.iconsAreaLeft;
    }
    if (startX + totalWidth > interior.iconsAreaRight) {
      startX = Math.max(interior.iconsAreaLeft, interior.iconsAreaRight - totalWidth);
    }
    let drawX = startX;
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      layout.entries.push({ text: entry.text, x: drawX });
      drawX += entry.width;
      if (i < entries.length - 1) {
        drawX += spacing;
      }
    }
    layout.placeholder = layout.entries.length === 0;
  } finally {
    ctx.restore();
  }

  state.powerLayout = layout;
  state.powerLayoutKey = key;
  state.powerLayoutDirty = false;
  return layout;
}

export function createTickerRenderer({
  state,
  dom,
  domQueue,
  marqueeCache,
  metrics,
  worker,
  pointerTelemetry,
  trackFacade,
  scrollEmitter
}) {
  const canvasDriver = createCanvasDriver({ state });
  const domFallback = createDomFallback({ state, domQueue, trackFacade, scrollEmitter });
  domFallback.setMode(state.renderMode || 'dom');

  let lastFrame = 0;
  let workerUnavailable = false;
  let resumeSnapshot = null;

  function detachWorker() {
    if (worker && typeof worker.dispose === 'function') {
      try {
        worker.dispose();
      } catch (_err) {}
    }
  }

  function notifyWorkerOfLayout() {
    if (workerUnavailable || !worker) {
      return;
    }
    const payload = {
      type: 'ticker:layout',
      width: state.width,
      height: state.height,
      infoWidth: state.infoWidth,
      marqueeWidth: state.marqueeWidth,
      duration: state.duration
    };
    try {
      if (typeof worker.postMessage === 'function') {
        worker.postMessage(payload);
      } else if (typeof worker.setLayout === 'function') {
        worker.setLayout(payload);
      }
    } catch (_err) {
      workerUnavailable = true;
    }
  }

  function measureDomTextWidth(fallback) {
    if (!trackFacade || typeof trackFacade.measurePrimaryWidth !== 'function') {
      return fallback;
    }
    return trackFacade.measurePrimaryWidth(fallback);
  }

  function updateTickerTrackText(value, { resetOffset = false } = {}) {
    if (!trackFacade) {
      return;
    }
    trackFacade.setText(value);
    domFallback.publishScrollIntent({ resetOffset });
  }

  function updateLayout() {
    canvasDriver.attach(dom);

    const hud = dom.get('tickerHud');
    let hudWidth = 0;
    let hudHeight = 0;
    if (hud) {
      try {
        hudWidth = Math.round(hud.clientWidth || hud.offsetWidth || 0);
        hudHeight = Math.round(hud.clientHeight || hud.offsetHeight || 0);
      } catch (_err) {}
    }
    if (!(hudWidth > 0) || !(hudHeight > 0)) {
      const infoCanvasEl = dom.get('tickerInfoCanvas');
      const marqueeCanvasEl = dom.get('tickerCanvas');
      const infoWidth = infoCanvasEl && typeof infoCanvasEl.clientWidth === 'number'
        ? infoCanvasEl.clientWidth
        : 0;
      const marqueeWidth = marqueeCanvasEl && typeof marqueeCanvasEl.clientWidth === 'number'
        ? marqueeCanvasEl.clientWidth
        : 0;
      const infoHeight = infoCanvasEl && typeof infoCanvasEl.clientHeight === 'number'
        ? infoCanvasEl.clientHeight
        : 0;
      const marqueeHeight = marqueeCanvasEl && typeof marqueeCanvasEl.clientHeight === 'number'
        ? marqueeCanvasEl.clientHeight
        : 0;
      if (!(hudWidth > 0)) {
        hudWidth = Math.round(infoWidth + marqueeWidth);
      }
      if (!(hudHeight > 0)) {
        hudHeight = Math.round(Math.max(infoHeight, marqueeHeight));
      }
    }
    if (!(hudWidth > 0)) {
      hudWidth = Math.round(state.width || state.design.defaultWidth);
    }
    if (!(hudHeight > 0)) {
      hudHeight = Math.round(state.height || state.design.defaultHeight);
    }

    setTickerDimensions(state, { width: hudWidth, height: hudHeight });
    const layout = computeTickerLayout(state, state.width, state.height);
    state.infoWidth = layout.infoWidth;
    state.marqueeLeft = layout.marqueeLeft;
    state.marqueeWidth = layout.marqueeWidth;
    state.marqueeGap = Math.max(80, Math.round((state.marqueeWidth || 0) * 0.28));
    computeTickerSpeed(state);
    state.needsLayout = false;
    notifyWorkerOfLayout();

    const resizeResult = canvasDriver.resize();
    if (!resizeResult.ready) {
      domFallback.setMode('dom');
      domFallback.updateLayout(state);
      return { ready: false };
    }

    domFallback.updateLayout(state);
    return { ready: true };
  }

  function step(ts) {
    const startRenderMode = state.renderMode;
    const offsetBefore = Number.isFinite(state.offset) ? state.offset : null;
    const speedBefore = state.speed;
    const pausedBefore = !!state.paused;
    const centeredBefore = !!state.centered;
    const { ready: layoutReady } = updateLayout();
    let delta = 0;
    if (!state.paused && !state.centered) {
      delta = lastFrame ? Math.max(0, Math.min(ts - lastFrame, RAF_FALLBACK_LIMIT)) : 16;
      state.offset -= state.speed * (delta / 1000);
      const wrap = state.textWidth + state.marqueeGap;
      if (wrap > 0) {
        while (state.offset <= -wrap) {
          state.offset += wrap;
        }
      }
    }
    lastFrame = ts;

    const publishIntents = {
      preDraw: false,
      errorReset: false,
      domMode: false
    };
    if (state.renderMode !== 'canvas') {
      publishIntents.preDraw = true;
      domFallback.publishScrollIntent();
    }

    let drewFrame = false;
    let contextsReady = layoutReady;
    let drawResult = null;
    if (layoutReady) {
      drawResult = canvasDriver.draw();
      contextsReady = drawResult.ready;
      if (!drawResult.ready) {
        domFallback.setMode('dom');
        domFallback.updateLayout(state);
        if (drawResult.error) {
          publishIntents.errorReset = true;
          domFallback.publishScrollIntent({ resetOffset: true });
          state.needsLayout = true;
          state.needsRedraw = true;
        }
      } else if (drawResult.drewFrame || state.canvasReady) {
        domFallback.setMode('canvas');
        domFallback.updateLayout(state);
        domFallback.updateTrackMode();
        if (drawResult.drewFrame) {
          drewFrame = true;
        }
      }
    } else {
      contextsReady = false;
      domFallback.setMode('dom');
      domFallback.updateLayout(state);
    }

    if (state.renderMode === 'dom') {
      publishIntents.domMode = true;
      domFallback.publishScrollIntent();
    }

    if (drewFrame && metrics && typeof metrics.recordFrame === 'function') {
      metrics.recordFrame({ timestamp: ts, paused: state.paused });
    }

    state.needsRedraw = drewFrame ? false : state.needsRedraw;
    logDebug('step:summary', {
      timestamp: ts,
      delta,
      offsetBefore,
      offsetAfter: Number.isFinite(state.offset) ? state.offset : null,
      speedBefore,
      speedAfter: state.speed,
      renderModeStart: startRenderMode,
      renderModeEnd: state.renderMode,
      pausedBefore,
      centeredBefore,
      layoutReady,
      contextsReady,
      drewFrame,
      publishIntents,
      drawResult: drawResult ? {
        ready: !!drawResult.ready,
        drewFrame: !!drawResult.drewFrame,
        error: !!drawResult.error
      } : null,
      needsRedraw: !!state.needsRedraw
    });
    return drewFrame && contextsReady;
  }

  function syncTextMetrics({ resetOffset = true } = {}) {
    const fallbackWidth = typeof state.text === 'string' ? state.text.length * 24 : 0;
    const canvasWidth = canvasDriver.measureTextWidth(state.text, { centered: state.centered });
    const domWidth = measureDomTextWidth(fallbackWidth);
    const width = Number.isFinite(canvasWidth)
      ? canvasWidth
      : (Number.isFinite(domWidth) ? domWidth : fallbackWidth);
    setTextMetrics(state, { width, length: state.text.length });
    computeTickerSpeed(state, { resetOffset });
  }

  function applyPowerups(list) {
    const formatted = normalisePowerups(list);
    state.powerups = formatted.display.slice();
    state.powerupsRaw = formatted.raw.slice();
    updatePowerupsDom(domQueue, dom, formatted);
  }

  function init({ text, durationSec } = {}) {
    if (typeof durationSec === 'number' && durationSec > 0) {
      state.duration = durationSec;
    }
    if (worker && typeof worker.init === 'function') {
      try {
        const started = worker.init({
          width: state.width,
          height: state.height,
          duration: state.duration
        });
        if (!started) {
          workerUnavailable = true;
        }
      } catch (_err) {
        workerUnavailable = true;
      }
    }
    canvasDriver.attach(dom);
    updateLayout();
    const wasPaused = !!state.paused;
    const fallbackDomText = (() => {
      const node = dom.get('tickerText');
      if (!node || typeof node.textContent !== 'string') {
        return '';
      }
      return node.textContent.trim();
    })();
    let baselineText = '';
    if (typeof text === 'string' && text.trim()) {
      baselineText = text;
    } else if (fallbackDomText) {
      baselineText = fallbackDomText;
    } else if (state.defaultText) {
      baselineText = state.defaultText;
    } else if (state.text) {
      baselineText = state.text;
    }
    const shouldMarkDefault = !!(baselineText && (!state.defaultText || state.defaultText === baselineText));
    logDebug('init:resolvedBaseline', {
      baselineText,
      fallbackDomText,
      renderMode: state.renderMode,
      pausedBeforeResume: wasPaused,
      currentPaused: !!state.paused
    });
    setText(baselineText, { markAsDefault: shouldMarkDefault });
    if (wasPaused) {
      logDebug('init:beforeResume', {
        paused: !!state.paused,
        renderMode: state.renderMode
      });
      resume();
      logDebug('init:afterResume', {
        paused: !!state.paused,
        renderMode: state.renderMode
      });
    }
  }

  function setText(
    nextText,
    { preserveOffset = false, offset, markAsDefault = false } = {}
  ) {
    const resolved = String(nextText ?? '');
    state.text = resolved;
    const trimmed = resolved.trim();
    const isPauseText = isPauseBanner(resolved);
    let defaultUpdated = false;
    if (trimmed && !isPauseText && (markAsDefault || !state.defaultText || state.defaultText !== resolved)) {
      state.defaultText = resolved;
      defaultUpdated = true;
    }
    if (!state.paused) {
      state.centered = false;
    }
    if (preserveOffset && Number.isFinite(offset)) {
      state.offset = offset;
    }
    updateTickerTextDom(domQueue, dom, resolved);
    updateTickerTrackText(resolved, { resetOffset: !preserveOffset });
    domFallback.updateLayout(state);
    syncTextMetrics({ resetOffset: !preserveOffset });
    let offsetLog = null;
    if (!preserveOffset || !Number.isFinite(state.offset)) {
      const previousOffset = Number.isFinite(state.offset) ? state.offset : null;
      state.offset = state.marqueeWidth;
      offsetLog = {
        reason: 'resetToMarqueeWidth',
        previousOffset,
        nextOffset: state.offset,
        marqueeWidth: state.marqueeWidth,
        preserveOffset,
        providedOffset: Number.isFinite(offset) ? offset : null
      };
    } else {
      const totalWidth = state.textWidth + state.marqueeGap;
      const maxOffset = state.marqueeWidth;
      const minOffset = maxOffset - totalWidth;
      if (!(state.offset <= maxOffset && state.offset >= minOffset)) {
        const rawOffset = state.offset;
        const clamped = Math.max(minOffset, Math.min(state.offset, maxOffset));
        state.offset = clamped;
        offsetLog = {
          reason: 'clamped',
          previousOffset: rawOffset,
          nextOffset: state.offset,
          minOffset,
          maxOffset
        };
      }
    }
    const shouldRefreshResumeSnapshot = state.paused
      && !isPauseText
      && (resumeSnapshot !== null || state.centered === true);
    if (shouldRefreshResumeSnapshot) {
      const snapshotOffset = Number.isFinite(state.offset) ? state.offset : null;
      resumeSnapshot = {
        text: resolved,
        offset: snapshotOffset
      };
    }
    domFallback.updateTrackMode();
    if (defaultUpdated) {
      logDebug('setText:defaultUpdated', {
        text: resolved,
        markAsDefault,
        paused: !!state.paused
      });
    }
    if (offsetLog) {
      logDebug('setText:offsetReset', {
        ...offsetLog,
        centered: !!state.centered,
        paused: !!state.paused
      });
    }
    state.needsRedraw = true;
  }

  function updateScore(value) {
    const numeric = Number.isFinite(value) ? Math.round(value) : 0;
    if (state.score === numeric) return;
    state.score = numeric;
    updateMetricDigits(state, 'score', numeric);
    updateScoreDom(domQueue, dom, numeric);
    updateLayout();
    state.needsRedraw = true;
  }

  function updateLevel(value) {
    const numeric = Number.isFinite(value) ? Math.round(value) : 0;
    if (state.level === numeric) return;
    state.level = numeric;
    updateMetricDigits(state, 'level', numeric);
    updateLevelDom(domQueue, dom, numeric);
    updateLayout();
    state.needsRedraw = true;
  }

  function updatePowerups(list) {
    applyPowerups(list);
    invalidatePowerLayout(state);
    updateLayout();
    state.needsRedraw = true;
  }

  function pause() {
    state.paused = true;
    state.needsRedraw = false;
    domFallback.updateTrackMode();
  }

  function resume() {
    state.paused = false;
    const trimmed = typeof state.text === 'string' ? state.text.trim() : '';
    if (state.defaultText && (!trimmed || isPauseBanner(trimmed)) && state.defaultText !== state.text) {
      setText(state.defaultText, { markAsDefault: true });
    }
    state.needsRedraw = true;
    lastFrame = 0;
    domFallback.updateTrackMode();
  }

  function showPauseTicker() {
    pause();
    const currentText = typeof state.text === 'string' ? state.text : '';
    const trimmedCurrent = currentText.trim();
    if (!state.defaultText && trimmedCurrent && !isPauseBanner(trimmedCurrent)) {
      state.defaultText = currentText;
    }
    if (!resumeSnapshot) {
      const fallbackText = trimmedCurrent && !isPauseBanner(trimmedCurrent)
        ? currentText
        : (state.defaultText || '');
      resumeSnapshot = {
        text: fallbackText,
        offset: Number.isFinite(state.offset) ? state.offset : null
      };
    }
    const hud = dom.get('tickerHud');
    if (hud && typeof hud.classList !== 'undefined') {
      try { hud.classList.add('paused'); } catch (_err) {}
    }
    state.centered = true;
    setText(PAUSE_BANNER_TEXT);
  }

  function hidePauseTicker() {
    const hud = dom.get('tickerHud');
    if (hud && typeof hud.classList !== 'undefined') {
      try { hud.classList.remove('paused'); } catch (_err) {}
    }
    state.centered = false;
    const snapshot = resumeSnapshot;
    resumeSnapshot = null;
    let restoredText = '';
    let restoredOffset = null;
    if (snapshot && typeof snapshot.text === 'string' && snapshot.text.trim()) {
      restoredText = snapshot.text;
      if (Number.isFinite(snapshot.offset)) {
        restoredOffset = snapshot.offset;
      }
    } else if (state.defaultText && !isPauseBanner(state.defaultText)) {
      restoredText = state.defaultText;
    }
    const trimmedRestored = typeof restoredText === 'string' ? restoredText.trim() : '';
    if ((!trimmedRestored || isPauseBanner(trimmedRestored)) && state.defaultText && !isPauseBanner(state.defaultText)) {
      restoredText = state.defaultText;
    }
    if ((!restoredText || isPauseBanner(restoredText)) && domQueue.lastTickerText) {
      const fallbackText = domQueue.lastTickerText;
      if (typeof fallbackText === 'string' && fallbackText.trim() && !isPauseBanner(fallbackText)) {
        restoredText = fallbackText;
      }
    }
    const markDefault = !!(restoredText && !isPauseBanner(restoredText) && (!state.defaultText || state.defaultText === restoredText));
    const hasOffset = Number.isFinite(restoredOffset);
    setText(restoredText, {
      preserveOffset: hasOffset,
      offset: hasOffset ? restoredOffset : undefined,
      markAsDefault: markDefault
    });
    resume();
  }

  function dispose(options = {}) {
    const { preserveDomFallback = false } = options || {};
    detachWorker();
    workerUnavailable = false;
    if (preserveDomFallback) {
      state.paused = false;
      state.needsRedraw = false;
    } else {
      pause();
    }
    canvasDriver.detach();
    domFallback.setMode('dom');
    if (preserveDomFallback) {
      try {
        domFallback.publishScrollIntent({ resetOffset: true });
      } catch (_err) {}
      if (typeof queueMicrotask === 'function') {
        queueMicrotask(() => {
          try { domFallback.publishScrollIntent(); } catch (_err) {}
        });
      } else if (typeof setTimeout === 'function') {
        setTimeout(() => {
          try { domFallback.publishScrollIntent(); } catch (_err) {}
        }, 0);
      }
    } else {
      domFallback.dispose();
    }
    resumeSnapshot = null;
  }

  return {
    init,
    setText,
    updateScore,
    updateLevel,
    updatePowerups,
    pause,
    resume,
    showPauseTicker,
    hidePauseTicker,
    dispose,
    updateLayout,
    syncTextMetrics,
    step
  };
}

export default {
  createTickerRenderer
};
