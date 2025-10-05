import { createSharedFrameStateReader } from '../core/sharedFrameState.js';

const defaultDesign = {
  defaultWidth: 870,
  defaultHeight: 72,
  marqueeGapLeft: 5,
  rightPadding: 5,
  minMarquee: 280,
  infoMin: 220,
  infoMax: 432,
  infoFactor: 0.32,
  infoOffset: 8,
  infoPadding: 16,
  scoreReserve: 80,
  levelReserve: 68,
  powerMinWidth: 100,
  powerMaxWidth: 192,
  iconSpacing: 18,
  glowPadding: 18,
  metricPadding: 26,
  valueDigitWidth: 28,
  marqueeEdgePad: 6
};
let design = Object.assign({}, defaultDesign);
let fonts = {
  label: "700 14px 'Orbitron','Rajdhani','Exo 2','Segoe UI',sans-serif",
  value: "600 32px 'Orbitron','Rajdhani','Exo 2','Segoe UI',sans-serif",
  power: "600 24px 'Orbitron','Rajdhani','Exo 2','Segoe UI',sans-serif",
  marquee: "600 38px 'Orbitron','Rajdhani','Exo 2','Segoe UI',sans-serif"
};
const state = {
  width: design.defaultWidth,
  height: design.defaultHeight,
  infoWidth: 0,
  marqueeLeft: 0,
  marqueeWidth: 0,
  marqueeGap: 80,
  duration: 20,
  speed: 80,
  offset: 0,
  lastTimestamp: null,
  paused: false,
  centered: false,
  score: 0,
  level: 1,
  powerups: [],
  text: '',
  textWidth: 0,
  dpr: 1,
  needsLayout: true,
  needsRedraw: true,
  scoreColumnWidth: design.scoreReserve,
  levelColumnWidth: design.levelReserve,
  scoreDigits: 1,
  levelDigits: 1,
  powerLayout: null,
  powerLayoutKey: '',
  powerLayoutDirty: true
};
const spriteCache = {
  canvas: null,
  ctx: null,
  width: 0,
  height: 0,
  dpr: 1,
  text: '',
  offsetX: 0,
  baseline: 0
};
const hudCache = {
  canvas: null,
  ctx: null,
  width: 0,
  height: 0,
  dpr: 1,
  bitmap: null,
  infoWidth: 0,
  marqueeLeft: 0,
  marqueeWidth: 0,
  dirty: true,
  usingBitmap: false
};
let spriteDirty = true;
const powerupMap = {
  accel: { icon: '⚡', label: 'Acceleration', dataset: 'accel' }
};
let sharedMetricsBuffer = null;
let sharedMetricsInts = null;
let sharedMetricsData = null;
let sharedMetricsVersion = 0;
let sharedFrameReader = null;
let sharedFrameVersion = 0;
const sharedFrameScratch = {
  player: { x: 0, y: 0, dir: 'right', vx: 0, vy: 0, progress: 0, speed: 0 },
  enemy: { x: 0, y: 0, dir: 'left', vx: 0, vy: 0, progress: 0, speed: 0 },
  powerUp: null,
  score: 0,
  level: 1,
  duration: 0,
  tick: 0,
  flags: 0,
  paused: false,
  centered: false,
  boostActive: false,
  timestamp: 0,
  hud: { scorePending: 0, scoreCooldown: 0, scoreLastBroadcast: 0 }
};
let canvas = null;
let ctx = null;
let animationHandle = null;
let frameLoopSuspended = false;
let sharedMetricsWaitHandle = null;
let pointerTelemetryAnnounced = false;
let bitmapMode = false;
const raf = (typeof self !== 'undefined' && typeof self.requestAnimationFrame === 'function') ? self.requestAnimationFrame.bind(self) : null;
const caf = (typeof self !== 'undefined' && typeof self.cancelAnimationFrame === 'function') ? self.cancelAnimationFrame.bind(self) : null;
const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
function escapePowerupString(value){
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function formatPowerupsForDom(list){
  const bag = Array.isArray(list) ? list : [];
  const entries = [];
  const display = [];
  const spoken = [];
  const rawTokens = [];
  for (let i = 0; i < bag.length && entries.length < 6; i += 1) {
    const raw = bag[i];
    if (raw === undefined || raw === null) continue;
    const base = String(raw).trim();
    if (!base) continue;
    const key = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
    const preset = powerupMap[key];
    const icon = preset ? preset.icon : (base.toUpperCase().replace(/[^A-Z0-9+]/g, ' ').trim() || base.toUpperCase());
    const label = preset ? preset.label : (base.replace(/\s+/g, ' ').trim() || icon);
    const dataset = preset ? preset.dataset : key;
    rawTokens.push(base);
    display.push(icon);
    spoken.push(label);
    const safeIcon = escapePowerupString(icon);
    const safeLabel = escapePowerupString(label);
    const safeDataset = escapePowerupString(dataset);
    entries.push('<span class="hud-powerup" data-powerup="' + safeDataset + '" title="' + safeLabel + '">' + safeIcon + '</span>');
  }
  return {
    markup: entries.join(''),
    display,
    text: spoken.join(', '),
    raw: rawTokens
  };
}
function broadcastPowerups(formatted){
  if (!formatted || typeof self === 'undefined' || typeof self.postMessage !== 'function') return;
  try {
    self.postMessage({
      type: 'powerupsMarkup',
      html: formatted.markup || '',
      text: formatted.text || '',
      display: Array.isArray(formatted.display) ? formatted.display.slice(0, 6) : [],
      raw: Array.isArray(formatted.raw) ? formatted.raw.slice(0, 6) : []
    });
  } catch (_err) {}
}
function finite(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}
let lastHudMetrics = null;
function collectHudMetrics(){
  return {
    width: finite(state.width, design.defaultWidth),
    height: finite(state.height, design.defaultHeight),
    infoWidth: finite(state.infoWidth, 0),
    marqueeLeft: finite(state.marqueeLeft, 0),
    marqueeWidth: finite(state.marqueeWidth, 0),
    marqueeGap: finite(state.marqueeGap, 0),
    duration: finite(state.duration, 0),
    speed: finite(state.speed, 0),
    offset: finite(state.offset, 0),
    dpr: finite(state.dpr, 1),
    textLength: (state.text || '').length,
    textWidth: finite(state.textWidth, 0),
    scoreDigits: finite(state.scoreDigits, 1),
    levelDigits: finite(state.levelDigits, 1),
    scoreWidth: finite(state.scoreColumnWidth, design.scoreReserve),
    levelWidth: finite(state.levelColumnWidth, design.levelReserve),
    marqueeCacheWidth: finite(spriteCache.width, 0),
    marqueeCacheHeight: finite(spriteCache.height, 0),
    marqueeCacheBaseline: finite(spriteCache.baseline, spriteCache.height ? spriteCache.height / 2 : 0),
    paused: !!state.paused,
    centered: !!state.centered
  };
}
function metricsSimilar(a, b) {
  if (!a || !b) return false;
  const numericKeys = ['width', 'height', 'infoWidth', 'marqueeLeft', 'marqueeWidth', 'marqueeGap', 'duration', 'speed', 'offset', 'dpr', 'textWidth', 'scoreDigits', 'levelDigits', 'scoreWidth', 'levelWidth', 'marqueeCacheWidth', 'marqueeCacheHeight', 'marqueeCacheBaseline'];
  for (let i = 0; i < numericKeys.length; i += 1) {
    const key = numericKeys[i];
    const tolerance = (key === 'offset') ? 0.5 : 0.05;
    if (Math.abs(finite(a[key]) - finite(b[key])) > tolerance) {
      return false;
    }
  }
  if (a.textLength !== b.textLength) return false;
  if (!!a.paused !== !!b.paused) return false;
  if (!!a.centered !== !!b.centered) return false;
  return true;
}
function broadcastHudMetrics(force){
  if (typeof self === 'undefined' || typeof self.postMessage !== 'function') return;
  const metrics = collectHudMetrics();
  if (!force && metricsSimilar(metrics, lastHudMetrics)) {
    return;
  }
  lastHudMetrics = Object.assign({}, metrics);
  try {
    self.postMessage({ type: 'hudMetrics', metrics });
  } catch (_err) {}
}
function syncSharedMetrics(force){
  if (!sharedMetricsInts || !sharedMetricsData) return false;
  let version = 0;
  try {
    version = Atomics.load(sharedMetricsInts, 0);
  } catch (_err) {
    version = sharedMetricsInts[0] || 0;
  }
  if (!force && version === sharedMetricsVersion) return false;
  sharedMetricsVersion = version;
  let changed = false;
  let flags = 0;
  try {
    flags = Atomics.load(sharedMetricsInts, 1);
  } catch (_err) {
    flags = sharedMetricsInts[1] || 0;
  }
  const paused = !!(flags & 1);
  const centered = !!(flags & 2);
  if (paused !== state.paused) {
    state.paused = paused;
    changed = true;
    state.lastTimestamp = null;
  }
  if (centered !== state.centered) {
    state.centered = centered;
    changed = true;
    state.lastTimestamp = null;
  }
  try {
    const score = sharedMetricsData.getFloat64(8, true);
    if (Number.isFinite(score) && score !== state.score) {
      state.score = score;
      updateMetricDigits('score', state.score);
      changed = true;
    }
  } catch (_err) {}
  try {
    const level = sharedMetricsData.getFloat64(16, true);
    if (Number.isFinite(level) && level !== state.level) {
      state.level = level;
      updateMetricDigits('level', state.level);
      changed = true;
    }
  } catch (_err) {}
  try {
    const duration = sharedMetricsData.getFloat64(24, true);
    if (Number.isFinite(duration) && duration > 0 && duration !== state.duration) {
      state.duration = duration;
      updateSpeed();
      changed = true;
      state.lastTimestamp = null;
    }
  } catch (_err) {}
  return changed;
}

function syncSharedFrameSnapshot(force){
  if (!sharedFrameReader) return false;
  let version = sharedFrameVersion;
  try {
    version = sharedFrameReader.getVersion();
  } catch (_) {}
  if (!force && version === sharedFrameVersion) {
    return false;
  }
  const frame = sharedFrameReader.readLatest(sharedFrameScratch);
  if (!frame) {
    return false;
  }
  sharedFrameVersion = frame.version || version || sharedFrameVersion;
  let changed = false;
  if (Number.isFinite(frame.score) && frame.score !== state.score) {
    state.score = frame.score;
    updateMetricDigits('score', state.score);
    changed = true;
  }
  if (Number.isFinite(frame.level) && frame.level !== state.level) {
    state.level = frame.level;
    updateMetricDigits('level', state.level);
    changed = true;
  }
  if (Number.isFinite(frame.duration) && frame.duration > 0 && frame.duration !== state.duration) {
    state.duration = frame.duration;
    updateSpeed();
    state.lastTimestamp = null;
    changed = true;
  }
  const paused = !!frame.paused;
  if (paused !== state.paused) {
    state.paused = paused;
    changed = true;
    state.lastTimestamp = null;
  }
  const centered = !!frame.centered;
  if (centered !== state.centered) {
    state.centered = centered;
    changed = true;
    state.lastTimestamp = null;
  }
  return changed;
}
function cancelSharedMetricsWait(){
  const handle = sharedMetricsWaitHandle;
  if (!handle) return;
  sharedMetricsWaitHandle = null;
  handle.cancelled = true;
  if (handle.type === 'timeout' && typeof clearTimeout === 'function') {
    try {
      clearTimeout(handle.id);
    } catch (_err) {}
  }
}
function wakeFrameLoop(){
  if (!ctx) return;
  frameLoopSuspended = false;
  if (animationHandle === null) {
    scheduleFrame();
  }
}
function waitForSharedMetricsChange(version){
  if (!sharedMetricsInts) return;
  cancelSharedMetricsWait();
  if (typeof Atomics === 'object' && Atomics && typeof Atomics.waitAsync === 'function') {
    try {
      const waitResult = Atomics.waitAsync(sharedMetricsInts, 0, version);
      const promise = waitResult && typeof waitResult.value === 'object' && typeof waitResult.value.then === 'function'
        ? waitResult.value
        : (waitResult && typeof waitResult.then === 'function') ? waitResult : null;
      if (promise) {
        const handle = { type: 'promise', promise, cancelled: false };
        sharedMetricsWaitHandle = handle;
        promise.then(() => {
          if (!handle.cancelled && sharedMetricsWaitHandle === handle) {
            sharedMetricsWaitHandle = null;
            wakeFrameLoop();
          }
        }, () => {
          if (!handle.cancelled && sharedMetricsWaitHandle === handle) {
            sharedMetricsWaitHandle = null;
            wakeFrameLoop();
          }
        });
        return;
      }
    } catch (_err) {}
  }
  if (typeof setTimeout === 'function') {
    const handle = { type: 'timeout', cancelled: false, id: setTimeout(() => {
      if (!handle.cancelled && sharedMetricsWaitHandle === handle) {
        sharedMetricsWaitHandle = null;
        wakeFrameLoop();
      }
    }, 120) };
    sharedMetricsWaitHandle = handle;
  }
}
function scheduleFrame(){
  if (animationHandle !== null) return;
  frameLoopSuspended = false;
  cancelSharedMetricsWait();
  if (raf) {
    animationHandle = raf(step);
  } else {
    animationHandle = setTimeout(() => {
      animationHandle = null;
      step(now());
    }, 16);
  }
}
function sendBitmapFrame(meta){
  if (!bitmapMode || !canvas) return;
  if (typeof canvas.transferToImageBitmap !== 'function') {
    bitmapMode = false;
    try { self.postMessage({ type: 'fallbackMain' }); } catch (_err) {}
    return;
  }
  let bitmap = null;
  try {
    bitmap = canvas.transferToImageBitmap();
  } catch (_err) {
    bitmapMode = false;
    if (bitmap && typeof bitmap.close === 'function') {
      try { bitmap.close(); } catch (_closeErr) {}
    }
    try { self.postMessage({ type: 'fallbackMain' }); } catch (_err2) {}
    return;
  }
  if (!bitmap) return;
  const payload = {
    type: 'frameBitmap',
    bitmap,
    width: state.width,
    height: state.height,
    hudDirty: !!(meta && meta.hudDirty),
    marqueeDirty: !!(meta && meta.marqueeDirty)
  };
  try {
    self.postMessage(payload, [bitmap]);
  } catch (_err) {
    if (bitmap && typeof bitmap.close === 'function') {
      try { bitmap.close(); } catch (_closeErr) {}
    }
    bitmapMode = false;
    try { self.postMessage({ type: 'fallbackMain' }); } catch (_err2) {}
  }
}
function step(timestamp){
  animationHandle = null;
  if (!ctx) return;
  const metricsChanged = syncSharedMetrics(false);
  const frameChanged = syncSharedFrameSnapshot(false);
  if (metricsChanged || frameChanged) {
    state.needsRedraw = true;
  }
  const layoutDirty = state.needsLayout;
  if (state.needsLayout) {
    updateLayout();
  }
  if (state.lastTimestamp === null) {
    state.lastTimestamp = timestamp;
  }
  const deltaMs = timestamp - (state.lastTimestamp || timestamp);
  const delta = Math.max(0, Math.min(0.12, deltaMs / 1000));
  state.lastTimestamp = timestamp;
  const shouldAnimate = !state.paused && !state.centered && state.marqueeWidth > 0 && state.textWidth > 0;
  if (shouldAnimate) {
    const speed = state.speed || 0;
    if (speed > 0) {
      state.offset -= speed * delta;
      const textWidth = state.textWidth || 0;
      const gap = state.marqueeGap || 0;
      const totalWidth = textWidth + gap;
      if (totalWidth > 0) {
        const minOffset = -totalWidth;
        if (state.offset < minOffset) {
          const cycles = Math.ceil((minOffset - state.offset) / totalWidth);
          if (isFinite(cycles) && cycles > 0) {
            state.offset += totalWidth * cycles;
          } else {
            state.offset = minOffset + totalWidth;
          }
        }
      } else if (state.offset < -state.marqueeWidth) {
        state.offset = state.marqueeWidth;
      }
    }
    const maxOffset = state.marqueeWidth;
    if (state.offset > maxOffset) {
      state.offset = maxOffset;
    }
    state.needsRedraw = true;
  }
  let frameMeta = null;
  if (state.needsRedraw) {
    frameMeta = drawTicker();
    state.needsRedraw = false;
    if (bitmapMode) {
      const dirty = {};
      dirty.redraw = true;
      if (layoutDirty) dirty.layout = true;
      if (metricsChanged) dirty.metrics = true;
      if (shouldAnimate) dirty.animate = true;
      emitBitmapFrame(shouldAnimate, dirty);
    }
  }
  broadcastHudMetrics(false);
  if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
    try {
      self.postMessage({
        type: 'frameProgress',
        timestamp,
        offset: state.offset,
        paused: state.paused,
        centered: state.centered
      });
    } catch (_err) {}
  }
  if (shouldAnimate || state.needsRedraw || state.needsLayout) {
    scheduleFrame();
  } else {
    frameLoopSuspended = true;
    if (sharedMetricsInts) {
      waitForSharedMetricsChange(sharedMetricsVersion);
    }
  }
}
function markTextDirty(){
  spriteDirty = true;
}
function releaseHudBitmap(){
  if (hudCache.bitmap && typeof hudCache.bitmap.close === 'function') {
    try {
      hudCache.bitmap.close();
    } catch (_err) {}
  }
  hudCache.bitmap = null;
  hudCache.usingBitmap = false;
}
function markHudDirty(){
  hudCache.dirty = true;
  releaseHudBitmap();
}
function getTextSprite(){
  const currentText = String(state.text || '');
  if (!currentText) return null;
  let spriteCanvas = spriteCache.canvas;
  if (!spriteCanvas) {
    spriteCanvas = new OffscreenCanvas(1, 1);
    spriteCache.canvas = spriteCanvas;
    spriteCache.ctx = spriteCanvas.getContext('2d');
    spriteDirty = true;
  }
  const spriteCtx = spriteCache.ctx;
  if (!spriteCtx) return null;
  const dpr = (typeof state.dpr === 'number' && state.dpr > 0) ? state.dpr : 1;
  const glowPadding = design.glowPadding || 24;
  const destWidth = Math.max(1, Math.ceil((state.textWidth || 0) + glowPadding * 2));
  const destHeight = Math.max(1, Math.ceil(state.height || design.defaultHeight));
  const scaledWidth = Math.max(1, Math.ceil(destWidth * dpr));
  const scaledHeight = Math.max(1, Math.ceil(destHeight * dpr));
  if (spriteCanvas.width !== scaledWidth || spriteCanvas.height !== scaledHeight) {
    spriteCanvas.width = scaledWidth;
    spriteCanvas.height = scaledHeight;
    spriteDirty = true;
  }
  if (spriteCache.width !== destWidth || spriteCache.height !== destHeight) {
    spriteCache.width = destWidth;
    spriteCache.height = destHeight;
    spriteDirty = true;
  }
  if (spriteCache.dpr !== dpr) {
    spriteCache.dpr = dpr;
    spriteDirty = true;
  }
  if (spriteCache.text !== currentText) {
    spriteCache.text = currentText;
    spriteDirty = true;
  }
  if (spriteDirty) {
    if (typeof spriteCtx.resetTransform === 'function') {
      spriteCtx.resetTransform();
    } else if (typeof spriteCtx.setTransform === 'function') {
      spriteCtx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (dpr !== 1) {
      spriteCtx.scale(dpr, dpr);
    }
    spriteCtx.clearRect(0, 0, destWidth, destHeight);
    spriteCtx.font = fonts.marquee;
    spriteCtx.textAlign = 'left';
    spriteCtx.textBaseline = 'middle';
    spriteCtx.fillStyle = '#ffd6f4';
    spriteCtx.shadowColor = 'rgba(246, 108, 218, 0.74)';
    spriteCtx.shadowBlur = 18;
    const baseline = destHeight / 2;
    spriteCtx.fillText(currentText, glowPadding, baseline);
    spriteCtx.shadowBlur = 0;
    spriteCache.offsetX = glowPadding;
    spriteCache.baseline = baseline;
    spriteDirty = false;
  }
  return {
    canvas: spriteCanvas,
    width: spriteCache.width,
    height: spriteCache.height,
    offsetX: spriteCache.offsetX
  };
}
function computeLayout(width, height){
  const gap = design.marqueeGapLeft;
  const rightPad = design.rightPadding;
  const minMarquee = design.minMarquee;
  const available = Math.max(0, width - gap - rightPad);
  const scoreReserve = Math.max(design.scoreReserve, Math.ceil(state.scoreColumnWidth || design.scoreReserve));
  const levelReserve = Math.max(design.levelReserve, Math.ceil(state.levelColumnWidth || design.levelReserve));
  const minContentWidth = scoreReserve + levelReserve + design.powerMinWidth + design.infoPadding * 2 + design.iconSpacing;
  let infoWidth = Math.round(width * design.infoFactor + design.infoOffset);
  infoWidth = Math.max(design.infoMin, Math.min(design.infoMax, infoWidth));
  if (available > 0 && minContentWidth > 0) {
    const minInfo = Math.max(design.infoMin, Math.min(design.infoMax, minContentWidth));
    infoWidth = Math.max(infoWidth, Math.min(available, minInfo));
  }
  if (available > 0) {
    const maxInfo = Math.max(design.infoMin, available - minMarquee);
    infoWidth = Math.min(infoWidth, maxInfo);
  }
  if (!(infoWidth > 0)) {
    infoWidth = Math.min(design.infoMax, Math.max(design.infoMin, available));
  }
  const marqueeLeft = infoWidth + gap;
  const marqueeWidth = Math.max(minMarquee, width - marqueeLeft - rightPad);
  return { infoWidth, marqueeLeft, marqueeWidth };
}
function resolvePowerupWindow(infoWidth){
  const infoPadding = design.infoPadding;
  const innerLeft = infoPadding;
  const innerRight = Math.max(innerLeft, infoWidth - infoPadding);
  const innerWidth = Math.max(0, innerRight - innerLeft);
  const scoreReserve = Math.min(
    innerWidth,
    Math.max(design.scoreReserve, Math.ceil(state.scoreColumnWidth || design.scoreReserve))
  );
  const levelReserve = Math.min(
    innerWidth,
    Math.max(design.levelReserve, Math.ceil(state.levelColumnWidth || design.levelReserve))
  );
  const guard = Math.max(10, Math.round(infoPadding * 0.55));
  const baseLeft = innerLeft + scoreReserve;
  const baseRight = innerRight - levelReserve;
  const baseSpan = Math.max(0, baseRight - baseLeft);
  const minCenterLeft = baseLeft + guard;
  const maxCenterRight = baseRight - guard;
  const availableSpan = Math.max(0, maxCenterRight - minCenterLeft);
  let centerWidth = Math.max(design.powerMinWidth, Math.min(design.powerMaxWidth, baseSpan));
  if (availableSpan > 0) {
    centerWidth = Math.min(centerWidth, availableSpan);
  } else {
    centerWidth = Math.min(centerWidth, Math.max(0, innerWidth - guard * 2));
  }
  if (!(centerWidth > 0)) {
    centerWidth = Math.max(0, availableSpan);
  }
  let iconsLeft;
  let iconsRight;
  if (availableSpan > 0) {
    const center = (minCenterLeft + maxCenterRight) / 2;
    iconsLeft = Math.round(center - centerWidth / 2);
    iconsRight = iconsLeft + centerWidth;
  } else {
    const center = innerLeft + innerWidth / 2;
    iconsLeft = Math.round(center - centerWidth / 2);
    iconsRight = iconsLeft + centerWidth;
  }
  const guardLeft = innerLeft + guard;
  const guardRight = innerRight - guard;
  if (iconsLeft < guardLeft) {
    iconsLeft = guardLeft;
    iconsRight = iconsLeft + centerWidth;
  }
  if (iconsRight > guardRight) {
    iconsRight = guardRight;
    iconsLeft = iconsRight - centerWidth;
  }
  const minBound = innerLeft + scoreReserve + guard;
  if (iconsLeft < minBound) {
    iconsLeft = minBound;
    iconsRight = iconsLeft + centerWidth;
  }
  const maxBound = innerRight - levelReserve - guard;
  if (iconsRight > maxBound) {
    iconsRight = maxBound;
    iconsLeft = iconsRight - centerWidth;
  }
  if (!(iconsRight > iconsLeft)) {
    const fallbackWidth = Math.max(0, Math.min(centerWidth, guardRight - guardLeft));
    const center = innerLeft + innerWidth / 2;
    iconsLeft = Math.round(center - fallbackWidth / 2);
    iconsLeft = Math.max(guardLeft, Math.min(iconsLeft, guardRight));
    iconsRight = Math.max(iconsLeft, Math.min(guardRight, iconsLeft + fallbackWidth));
  }
  const iconsAreaWidth = Math.max(0, iconsRight - iconsLeft);
  return {
    innerLeft,
    innerRight,
    iconsAreaLeft: iconsLeft,
    iconsAreaRight: iconsRight,
    iconsAreaWidth,
    labelX: iconsAreaWidth > 0 ? (iconsLeft + iconsRight) / 2 : (innerLeft + innerRight) / 2
  };
}
function invalidatePowerLayout(){
  state.powerLayout = null;
  state.powerLayoutKey = '';
  state.powerLayoutDirty = true;
  markHudDirty();
}
function computeMetricReserve(digits, base){
  const widthPerDigit = design.valueDigitWidth || 24;
  const padding = design.metricPadding || 0;
  const computed = Math.max(1, digits) * widthPerDigit + padding;
  return Math.max(base || 0, Math.ceil(computed));
}
function updateMetricDigits(kind, value){
  markHudDirty();
  const digitsProp = (kind === 'level') ? 'levelDigits' : 'scoreDigits';
  const widthProp = (kind === 'level') ? 'levelColumnWidth' : 'scoreColumnWidth';
  const base = (kind === 'level') ? design.levelReserve : design.scoreReserve;
  const digits = Math.max(1, String(value).length);
  const prevDigits = Math.max(1, state[digitsProp] || 1);
  const maxDigits = Math.max(digits, prevDigits);
  if (maxDigits !== prevDigits) {
    state[digitsProp] = maxDigits;
  }
  const nextWidth = computeMetricReserve(maxDigits, base);
  if (!(state[widthProp] >= nextWidth)) {
    state[widthProp] = nextWidth;
    invalidatePowerLayout();
    state.needsLayout = true;
  }
}
function preparePowerLayout(interior){
  const icons = Array.isArray(state.powerups) ? state.powerups : [];
  const key = String(Math.round(interior.iconsAreaLeft)) + '|' + String(Math.round(interior.iconsAreaRight)) + '|' + String(Math.round(interior.labelX * 10)) + '|' + icons.join('\u0001');
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
  ctx.save();
  try {
    ctx.font = fonts.power;
    const spacing = design.iconSpacing;
    const entries = [];
    let totalWidth = 0;
    for (let i = 0; i < icons.length; i += 1) {
      const icon = String(icons[i] || '');
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
    let startX = interior.labelX - totalWidth / 2;
    if (startX < interior.iconsAreaLeft) {
      startX = interior.iconsAreaLeft;
    }
    if (startX + totalWidth > interior.iconsAreaRight) {
      startX = Math.max(interior.iconsAreaLeft, interior.iconsAreaRight - totalWidth);
    }
    let drawX = startX;
    for (let i = 0; i < entries.length; i += 1) {
      layout.entries.push({ text: entries[i].text, x: drawX });
      drawX += entries[i].width;
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
function drawStaticHud(targetCtx, width, height, infoWidth){
  if (!targetCtx) return;
  targetCtx.clearRect(0, 0, width, height);
  if (infoWidth > 0) {
    targetCtx.save();
    try {
      const grad = targetCtx.createLinearGradient(0, 0, infoWidth, height);
      grad.addColorStop(0, 'rgba(70, 12, 74, 0.9)');
      grad.addColorStop(1, 'rgba(34, 6, 56, 0.94)');
      targetCtx.fillStyle = grad;
    } catch (_err) {
      targetCtx.fillStyle = 'rgba(44,12,60,0.9)';
    }
    targetCtx.fillRect(0, 0, infoWidth, height);
    targetCtx.restore();
  }
  const labelTop = 10;
  const valueTop = 28;
  const interior = resolvePowerupWindow(infoWidth);
  const innerLeft = interior.innerLeft;
  const innerRight = interior.innerRight;
  targetCtx.textBaseline = 'top';
  targetCtx.font = fonts.label;
  targetCtx.fillStyle = 'rgba(255, 214, 242, 0.86)';
  targetCtx.textAlign = 'left';
  targetCtx.fillText('SCORE', innerLeft, labelTop);
  targetCtx.font = fonts.value;
  targetCtx.fillStyle = '#ffe6f8';
  targetCtx.shadowColor = 'rgba(246, 108, 218, 0.48)';
  targetCtx.shadowBlur = 12;
  targetCtx.fillText(String(state.score || 0), innerLeft, valueTop);
  targetCtx.shadowBlur = 0;
  targetCtx.font = fonts.label;
  targetCtx.fillStyle = 'rgba(255, 214, 242, 0.86)';
  targetCtx.textAlign = 'right';
  targetCtx.fillText('LEVEL', innerRight, labelTop);
  targetCtx.font = fonts.value;
  targetCtx.fillStyle = '#ffe6f8';
  targetCtx.shadowColor = 'rgba(246, 108, 218, 0.48)';
  targetCtx.shadowBlur = 12;
  targetCtx.fillText(String(state.level || 1), innerRight, valueTop);
  targetCtx.shadowBlur = 0;
  const powerLayout = preparePowerLayout(interior);
  const centerX = (powerLayout && typeof powerLayout.centerX === 'number') ? powerLayout.centerX : interior.labelX;
  targetCtx.textAlign = 'center';
  targetCtx.font = fonts.label;
  targetCtx.fillStyle = 'rgba(255, 204, 238, 0.84)';
  targetCtx.fillText('POWER UPS', centerX, labelTop);
  targetCtx.font = fonts.power;
  targetCtx.fillStyle = '#ffd2f2';
  targetCtx.shadowColor = 'rgba(214, 56, 178, 0.5)';
  targetCtx.shadowBlur = 10;
  const iconsTop = valueTop;
  if (!powerLayout || powerLayout.placeholder) {
    targetCtx.globalAlpha = 0.7;
    targetCtx.fillText('— — —', centerX, iconsTop);
    targetCtx.globalAlpha = 1;
  } else {
    targetCtx.textAlign = 'left';
    const entries = Array.isArray(powerLayout.entries) ? powerLayout.entries : [];
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      targetCtx.fillText(entry.text, entry.x, iconsTop);
    }
  }
  targetCtx.shadowBlur = 0;
  targetCtx.textAlign = 'left';
}
function getHudStaticLayer(width, height, infoWidth, marqueeLeft, marqueeWidth){
  if (typeof OffscreenCanvas === 'undefined') return null;
  if (!hudCache.canvas) {
    try {
      hudCache.canvas = new OffscreenCanvas(1, 1);
    } catch (_err) {
      hudCache.canvas = null;
      return null;
    }
  }
  const dpr = (typeof state.dpr === 'number' && state.dpr > 0) ? state.dpr : 1;
  const scaledWidth = Math.max(1, Math.round(width * dpr));
  const scaledHeight = Math.max(1, Math.round(height * dpr));
  let hudCtx = hudCache.ctx;
  if (!hudCtx && hudCache.canvas) {
    try {
      hudCtx = hudCache.canvas.getContext('2d');
    } catch (_err) {
      hudCtx = null;
    }
    if (!hudCtx) {
      hudCache.canvas = null;
      return null;
    }
    hudCache.ctx = hudCtx;
    hudCache.dirty = true;
  }
  if (!hudCtx) return null;
  if (hudCache.canvas.width !== scaledWidth || hudCache.canvas.height !== scaledHeight) {
    hudCache.canvas.width = scaledWidth;
    hudCache.canvas.height = scaledHeight;
    hudCache.dirty = true;
  }
  if (hudCache.dpr !== dpr) {
    hudCache.dpr = dpr;
    hudCache.dirty = true;
  }
  if (hudCache.width !== width || hudCache.height !== height) {
    hudCache.width = width;
    hudCache.height = height;
    hudCache.dirty = true;
  }
  if (hudCache.infoWidth !== infoWidth || hudCache.marqueeLeft !== marqueeLeft || hudCache.marqueeWidth !== marqueeWidth) {
    hudCache.infoWidth = infoWidth;
    hudCache.marqueeLeft = marqueeLeft;
    hudCache.marqueeWidth = marqueeWidth;
    hudCache.dirty = true;
  }
  if (hudCache.dirty) {
    if (typeof hudCtx.resetTransform === 'function') {
      hudCtx.resetTransform();
    } else if (typeof hudCtx.setTransform === 'function') {
      hudCtx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (dpr !== 1) {
      hudCtx.scale(dpr, dpr);
    }
    drawStaticHud(hudCtx, width, height, infoWidth);
    releaseHudBitmap();
    if (typeof hudCache.canvas.transferToImageBitmap === 'function') {
      try {
        hudCache.bitmap = hudCache.canvas.transferToImageBitmap();
        hudCache.usingBitmap = true;
      } catch (_err) {
        hudCache.bitmap = null;
        hudCache.usingBitmap = false;
      }
    } else {
      hudCache.bitmap = null;
      hudCache.usingBitmap = false;
    }
    hudCache.dirty = false;
  }
  if (hudCache.usingBitmap && hudCache.bitmap) {
    return { image: hudCache.bitmap, width: hudCache.bitmap.width, height: hudCache.bitmap.height, isBitmap: true };
  }
  if (!hudCache.usingBitmap && hudCache.canvas) {
    return { image: hudCache.canvas, width: hudCache.canvas.width, height: hudCache.canvas.height, isBitmap: false };
  }
  return null;
}
function updateLayout(){
  const width = state.width;
  const height = state.height;
  const layout = computeLayout(width, height);
  state.infoWidth = layout.infoWidth;
  state.marqueeLeft = layout.marqueeLeft;
  state.marqueeWidth = layout.marqueeWidth;
  state.marqueeGap = Math.max(80, Math.round((state.marqueeWidth || 0) * 0.28));
  state.needsLayout = false;
  if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
    try {
      self.postMessage({
        type: 'layoutProgress',
        width,
        height,
        infoWidth: state.infoWidth,
        marqueeWidth: state.marqueeWidth,
        duration: state.duration
      });
    } catch (_err) {}
  }
  updateSpeed();
  invalidatePowerLayout();
  state.needsRedraw = true;
}
function updateSpeed(){
  const marqueeWidth = state.marqueeWidth || 0;
  const textWidth = state.textWidth || 0;
  const duration = (typeof state.duration === 'number' && state.duration > 0) ? state.duration : 20;
  const distance = marqueeWidth + textWidth + (state.marqueeGap || 0);
  state.speed = (duration > 0) ? (distance / duration) : 80;
  if (!state.paused && !state.centered) {
    state.offset = state.marqueeWidth;
  }
}
function measureText(){
  if (!ctx) return;
  try {
    ctx.save();
    ctx.font = fonts.marquee;
    const metrics = ctx.measureText(state.text || '');
    const width = metrics && typeof metrics.width === 'number' ? metrics.width : 0;
    state.textWidth = width;
    ctx.restore();
  } catch (_err) {
    state.textWidth = (state.text || '').length * 24;
  }
  markTextDirty();
  if (!state.centered) {
    state.offset = state.marqueeWidth;
  }
  updateSpeed();
  state.needsRedraw = true;
}
function drawTicker(){
  if (!ctx) return null;
  const width = state.width || design.defaultWidth;
  const height = state.height || design.defaultHeight;
  const frameInfo = { hudDirty: !!hudCache.dirty, marqueeDirty: !!spriteDirty };
  let infoWidth = (typeof state.infoWidth === 'number') ? state.infoWidth : 0;
  let marqueeLeft = (typeof state.marqueeLeft === 'number') ? state.marqueeLeft : 0;
  let marqueeWidth = (typeof state.marqueeWidth === 'number') ? state.marqueeWidth : 0;
  if (!(infoWidth > 0) || !(marqueeWidth >= 0)) {
    const layout = computeLayout(width, height);
    infoWidth = Math.min(width, Math.max(0, layout.infoWidth || 0));
    marqueeLeft = layout.marqueeLeft || (infoWidth + design.marqueeGapLeft);
    marqueeWidth = Math.max(0, layout.marqueeWidth || (width - marqueeLeft - design.rightPadding));
    state.infoWidth = infoWidth;
    state.marqueeLeft = marqueeLeft;
    state.marqueeWidth = marqueeWidth;
  }
  const staticLayer = getHudStaticLayer(width, height, infoWidth, marqueeLeft, marqueeWidth);
  if (staticLayer && staticLayer.image) {
    const src = staticLayer.image;
    const srcWidth = (typeof staticLayer.width === 'number' && staticLayer.width > 0) ? staticLayer.width : ((src && src.width) || width);
    const srcHeight = (typeof staticLayer.height === 'number' && staticLayer.height > 0) ? staticLayer.height : ((src && src.height) || height);
    ctx.drawImage(src, 0, 0, srcWidth, srcHeight, 0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
    drawStaticHud(ctx, width, height, infoWidth);
  }
  if (marqueeWidth <= 0) return frameInfo;
  const edgePad = Math.max(0, design.marqueeEdgePad || 0);
  const clipLeft = marqueeLeft - edgePad;
  const clipRight = marqueeLeft + marqueeWidth + edgePad;
  const overlayWidth = clipRight - clipLeft;
  const infoBoundary = Math.max(0, infoWidth);
  const clearLeft = Math.max(0, Math.min(width, Math.max(infoBoundary, clipLeft)));
  const clearRight = Math.max(clearLeft, Math.min(width, clipRight));
  if (clearRight > clearLeft) {
    ctx.clearRect(clearLeft, 0, clearRight - clearLeft, height);
  }
  if (infoWidth > 0) {
    ctx.fillStyle = 'rgba(240, 150, 226, 0.34)';
    ctx.fillRect(infoWidth - 1.5, 6, 2.5, height - 12);
  }
  ctx.save();
  try {
    const grad = ctx.createLinearGradient(clipLeft - 6, 0, clipRight + 6, 0);
    grad.addColorStop(0, 'rgba(48, 8, 52, 0.44)');
    grad.addColorStop(0.5, 'rgba(70, 18, 68, 0.28)');
    grad.addColorStop(1, 'rgba(48, 8, 52, 0.44)');
    ctx.fillStyle = grad;
  } catch (_err) {
    ctx.fillStyle = 'rgba(38,10,48,0.38)';
  }
  ctx.globalAlpha = 0.65;
  ctx.fillRect(clipLeft, 8, overlayWidth, height - 16);
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(clipLeft, 0, overlayWidth, height);
  ctx.clip();
  const text = String(state.text || '');
  if (!text) {
    ctx.restore();
    return frameInfo;
  }
  const textWidth = state.textWidth || 0;
  const totalWidth = textWidth + (state.marqueeGap || 0);
  const textY = height / 2;
  const sprite = getTextSprite();
  const usingSprite = !!(sprite && sprite.canvas && sprite.width > 0 && sprite.height > 0);
  if (usingSprite) {
    const srcCanvas = sprite.canvas;
    const srcWidth = srcCanvas.width;
    const srcHeight = srcCanvas.height;
    const destWidth = sprite.width;
    const destHeight = sprite.height;
    const offsetX = sprite.offsetX || 0;
    const renderSprite = (drawX) => {
      ctx.drawImage(srcCanvas, 0, 0, srcWidth, srcHeight, drawX - offsetX, 0, destWidth, destHeight);
    };
    if (state.centered && textWidth > 0 && textWidth < marqueeWidth) {
      const startX = marqueeLeft + (marqueeWidth - textWidth) / 2;
      renderSprite(startX);
    } else if (state.centered) {
      renderSprite(marqueeLeft);
    } else if (totalWidth > 0) {
      let drawX = marqueeLeft + (state.offset || 0);
      while (drawX > marqueeLeft - totalWidth) {
        renderSprite(drawX);
        drawX -= totalWidth;
      }
      drawX = marqueeLeft + (state.offset || 0) + totalWidth;
      while (drawX < marqueeLeft + marqueeWidth) {
        renderSprite(drawX);
        drawX += totalWidth;
      }
    } else {
      renderSprite(marqueeLeft);
    }
  } else {
    ctx.font = fonts.marquee;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd6f4';
    ctx.shadowColor = 'rgba(246, 108, 218, 0.74)';
    ctx.shadowBlur = 18;
    if (state.centered && textWidth > 0 && textWidth < marqueeWidth) {
      const startX = marqueeLeft + (marqueeWidth - textWidth) / 2;
      ctx.fillText(text, startX, textY);
    } else if (state.centered) {
      ctx.fillText(text, marqueeLeft, textY);
    } else if (totalWidth > 0) {
      let drawX = marqueeLeft + (state.offset || 0);
      while (drawX > marqueeLeft - totalWidth) {
        ctx.fillText(text, drawX, textY);
        drawX -= totalWidth;
      }
      drawX = marqueeLeft + (state.offset || 0) + totalWidth;
      while (drawX < marqueeLeft + marqueeWidth) {
        ctx.fillText(text, drawX, textY);
        drawX += totalWidth;
      }
    } else {
      ctx.fillText(text, marqueeLeft, textY);
    }
    ctx.shadowBlur = 0;
  }
  ctx.restore();
  return frameInfo;
}
function applyPowerups(list){
  const formatted = formatPowerupsForDom(list);
  state.powerups = Array.isArray(formatted.display) ? formatted.display : [];
  invalidatePowerLayout();
  state.needsRedraw = true;
  broadcastPowerups(formatted);
  scheduleFrame();
}
function emitBitmapFrame(shouldAnimate, dirty){
  if (!bitmapMode || !canvas) return;
  if (typeof canvas.transferToImageBitmap !== 'function') {
    bitmapMode = false;
    try { self.postMessage({ type: 'fallbackMain' }); } catch (_err) {}
    return;
  }
  let bitmap = null;
  try {
    bitmap = canvas.transferToImageBitmap();
  } catch (_err) {
    bitmapMode = false;
    if (bitmap && typeof bitmap.close === 'function') {
      try { bitmap.close(); } catch (_closeErr) {}
    }
    try { self.postMessage({ type: 'fallbackMain' }); } catch (_postErr) {}
    return;
  }
  const payload = {
    type: 'frameBitmap',
    bitmap,
    cssWidth: state.width || canvas.width || 0,
    cssHeight: state.height || canvas.height || 0,
    pixelWidth: canvas.width || 0,
    pixelHeight: canvas.height || 0,
    dpr: state.dpr || 1,
    animate: !!shouldAnimate
  };
  if (dirty && typeof dirty === 'object') {
    payload.dirty = dirty;
  }
  try {
    self.postMessage(payload, [bitmap]);
    return;
  } catch (_err) {
    if (bitmap && typeof bitmap.close === 'function') {
      try { bitmap.close(); } catch (_closeErr) {}
    }
  }
  bitmapMode = false;
  try {
    self.postMessage({ type: 'fallbackMain' });
  } catch (_err) {}
}
function initTicker(payload){
  bitmapMode = !!payload.bitmapMode;
  if (bitmapMode) {
    if (typeof OffscreenCanvas === 'undefined') {
      bitmapMode = false;
      self.postMessage({ type: 'fallbackMain' });
      try { self.postMessage({ type: 'unavailable', reason: 'fallbackMain' }); } catch (_err) {}
      return;
    }
    try {
      canvas = new OffscreenCanvas(1, 1);
    } catch (_err) {
      bitmapMode = false;
      self.postMessage({ type: 'fallbackMain' });
      try { self.postMessage({ type: 'unavailable', reason: 'fallbackMain' }); } catch (_err) {}
      return;
    }
  } else {
    canvas = payload.canvas;
  }
  if (!canvas) {
    bitmapMode = false;
    self.postMessage({ type: 'fallbackMain' });
    try { self.postMessage({ type: 'unavailable', reason: 'fallbackMain' }); } catch (_err) {}
    return;
  }
  ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmapMode = false;
    self.postMessage({ type: 'fallbackMain' });
    try { self.postMessage({ type: 'unavailable', reason: 'fallbackMain' }); } catch (_err) {}
    return;
  }
  cancelSharedMetricsWait();
  if (payload.design) {
    design = Object.assign({}, design, payload.design);
    markHudDirty();
  }
  if (payload.fonts) {
    fonts = Object.assign({}, fonts, payload.fonts);
    markHudDirty();
  }
  if (payload.frameStateBuffer && typeof payload.frameStateBuffer.byteLength === 'number') {
    try {
      sharedFrameReader = createSharedFrameStateReader(payload.frameStateBuffer);
      sharedFrameVersion = 0;
    } catch (_err) {
      sharedFrameReader = null;
      sharedFrameVersion = 0;
    }
  } else {
    sharedFrameReader = null;
    sharedFrameVersion = 0;
  }
  if (payload.sharedMetricsBuffer && typeof payload.sharedMetricsBuffer.byteLength === 'number') {
    try {
      sharedMetricsBuffer = payload.sharedMetricsBuffer;
      sharedMetricsInts = new Int32Array(sharedMetricsBuffer);
      sharedMetricsData = new DataView(sharedMetricsBuffer);
      sharedMetricsVersion = 0;
    } catch (_err) {
      sharedMetricsBuffer = null;
      sharedMetricsInts = null;
      sharedMetricsData = null;
      sharedMetricsVersion = 0;
    }
  } else {
    sharedMetricsBuffer = null;
    sharedMetricsInts = null;
    sharedMetricsData = null;
    sharedMetricsVersion = 0;
  }
  state.width = payload.width || design.defaultWidth;
  state.height = payload.height || design.defaultHeight;
  state.dpr = (typeof payload.dpr === 'number' && payload.dpr > 0) ? payload.dpr : 1;
  const pixelWidth = Math.max(1, Math.round(state.width * state.dpr));
  const pixelHeight = Math.max(1, Math.round(state.height * state.dpr));
  if (bitmapMode) {
    if (typeof OffscreenCanvas === 'undefined') {
      bitmapMode = false;
      self.postMessage({ type: 'fallbackMain' });
      return;
    }
    try {
      canvas = new OffscreenCanvas(pixelWidth, pixelHeight);
    } catch (_err) {
      bitmapMode = false;
      canvas = null;
      self.postMessage({ type: 'fallbackMain' });
      return;
    }
  } else {
    canvas = payload.canvas;
    if (!canvas) {
      self.postMessage({ type: 'fallbackMain' });
      return;
    }
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  ctx = canvas ? canvas.getContext('2d') : null;
  if (!ctx) {
    bitmapMode = false;
    canvas = null;
    self.postMessage({ type: 'fallbackMain' });
    return;
  }
  if (bitmapMode && typeof canvas.transferToImageBitmap !== 'function') {
    bitmapMode = false;
    self.postMessage({ type: 'fallbackMain' });
    return;
  }
  if (typeof ctx.resetTransform === 'function') {
    ctx.resetTransform();
  } else if (typeof ctx.setTransform === 'function') {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  if (state.dpr !== 1) {
    ctx.scale(state.dpr, state.dpr);
  }
  if (payload.state) {
    const s = payload.state;
    if (typeof s.score === 'number') state.score = s.score;
    if (typeof s.level === 'number') state.level = s.level;
    if (typeof s.text === 'string') state.text = s.text;
    if (typeof s.paused === 'boolean') state.paused = s.paused;
    if (typeof s.centered === 'boolean') state.centered = s.centered;
    if (typeof s.duration === 'number' && s.duration > 0) state.duration = s.duration;
    if (Array.isArray(s.powerups)) {
      applyPowerups(s.powerups);
    }
  }
  if (sharedMetricsInts && sharedMetricsData) {
    if (syncSharedMetrics(true)) {
      state.needsRedraw = true;
    }
  }
  if (sharedFrameReader) {
    if (syncSharedFrameSnapshot(true)) {
      state.needsRedraw = true;
    }
  }
  if (!Array.isArray(payload.state && payload.state.powerups)) {
    broadcastPowerups(formatPowerupsForDom(state.powerups));
  }
  updateMetricDigits('score', state.score);
  updateMetricDigits('level', state.level);
  state.needsLayout = true;
  measureText();
  state.lastTimestamp = null;
  state.needsRedraw = true;
  wakeFrameLoop();
  if (!pointerTelemetryAnnounced) {
    const pointerVelocitySupported = (typeof SharedArrayBuffer === 'function')
      && (typeof Atomics === 'object' && !!Atomics);
    if (pointerVelocitySupported) {
      pointerTelemetryAnnounced = true;
      try { self.postMessage({ type: 'telemetryProgress', pointerVelocity: true }); } catch (_err) {}
    }
  }
  self.postMessage({ type: 'ready' });
  broadcastHudMetrics(true);
}
self.onmessage = (event) => {
  const msg = event && event.data ? event.data : {};
  switch (msg.type) {
    case 'init':
      initTicker(msg);
      break;
    case 'setDuration':
      if (typeof msg.value === 'number' && msg.value > 0) {
        state.duration = msg.value;
        updateSpeed();
        state.lastTimestamp = null;
        state.needsRedraw = true;
        wakeFrameLoop();
      }
      break;
    case 'setText':
      state.text = String(msg.text ?? '');
      if (typeof msg.centered === 'boolean') state.centered = msg.centered;
      if (typeof msg.paused === 'boolean') state.paused = msg.paused;
      measureText();
      state.lastTimestamp = null;
      wakeFrameLoop();
      break;
    case 'setPaused':
      state.paused = !!msg.value;
      state.needsRedraw = true;
      state.lastTimestamp = null;
      wakeFrameLoop();
      break;
    case 'setOffset':
      if (typeof msg.value === 'number' && Number.isFinite(msg.value)) {
        state.offset = msg.value;
        state.needsRedraw = true;
        state.lastTimestamp = null;
        wakeFrameLoop();
      }
      break;
    case 'setCentered':
      state.centered = !!msg.value;
      state.needsRedraw = true;
      wakeFrameLoop();
      break;
    case 'updateScore':
      if (typeof msg.value === 'number') {
        state.score = msg.value;
        updateMetricDigits('score', state.score);
        state.needsRedraw = true;
        wakeFrameLoop();
      }
      break;
    case 'updateLevel':
      if (typeof msg.value === 'number') {
        state.level = msg.value;
        updateMetricDigits('level', state.level);
        state.needsRedraw = true;
        wakeFrameLoop();
      }
      break;
    case 'updatePowerups':
      applyPowerups(msg.list);
      break;
    case 'forceRedraw':
      state.needsRedraw = true;
      wakeFrameLoop();
      break;
    case 'layout':
      state.needsLayout = true;
      wakeFrameLoop();
      break;
    case 'frame':
      wakeFrameLoop();
      break;
    case 'telemetry':
      try {
        self.postMessage({ type: 'telemetryProgress', pointerVelocity: pointerTelemetryAnnounced });
      } catch (_err) {}
      break;
    default:
      break;
  }
};
