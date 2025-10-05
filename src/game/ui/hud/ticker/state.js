export const TICKER_DESIGN = Object.freeze({
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
});

export function createTickerState(overrides = {}) {
  const design = { ...TICKER_DESIGN, ...(overrides.design || {}) };
  return {
    design,
    width: design.defaultWidth,
    height: design.defaultHeight,
    infoWidth: 0,
    marqueeLeft: 0,
    marqueeWidth: Math.max(design.minMarquee, design.defaultWidth - design.infoMin),
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
    powerupsRaw: [],
    defaultText: '',
    text: '',
    textWidth: 0,
    textLength: 0,
    dpr: 1,
    scoreColumnWidth: design.scoreReserve,
    levelColumnWidth: design.levelReserve,
    scoreDigits: 1,
    levelDigits: 1,
    powerLayout: null,
    powerLayoutKey: '',
    powerLayoutDirty: true,
    needsLayout: true,
    needsRedraw: false,
    renderMode: 'dom',
    canvasAttached: false,
    canvasReady: false,
    hudAttached: false,
    animationId: null,
    domTrackActive: false
  };
}

export function createTickerDomQueue() {
  return {
    score: null,
    level: null,
    scoreDirty: false,
    levelDirty: false,
    rafHandle: null,
    powerupsHtml: null,
    powerupsText: null,
    powerupsDirty: false,
    idleHandle: null,
    lastPowerupsHtml: null,
    lastPowerupsText: null,
    lastTickerText: null,
    lastTickerTextAria: null,
    tickerTrack: null,
    tickerTrackInnerEl: null,
    tickerTrackTextEl: null,
    tickerTrackRepeatEl: null,
    lastTickerTrackText: null,
    lastTickerTrackDuration: null,
    lastTickerTrackInfoWidth: null,
    lastTickerTrackGap: null,
    lastTickerTrackOffset: null,
    tickerTrackRepeatVisible: false,
    tickerTrackCentered: null,
    tickerTrackMode: null
  };
}

export function createMarqueeCache() {
  return {
    canvas: null,
    ctx: null,
    width: 0,
    height: 0,
    dpr: 1,
    text: '',
    offsetX: 0,
    baseline: 0,
    dirty: true
  };
}

function computeMetricReserve(design, digits, base) {
  const widthPerDigit = design.valueDigitWidth || 24;
  const padding = design.metricPadding || 0;
  const computed = Math.max(1, digits) * widthPerDigit + padding;
  return Math.max(base || 0, Math.ceil(computed));
}

export function updateMetricDigits(state, kind, value, { suppressLayout = false } = {}) {
  const design = state.design;
  const digitsProp = kind === 'level' ? 'levelDigits' : 'scoreDigits';
  const widthProp = kind === 'level' ? 'levelColumnWidth' : 'scoreColumnWidth';
  const base = kind === 'level' ? design.levelReserve : design.scoreReserve;
  const digits = Math.max(1, String(value ?? 0).length);
  const prevDigits = Math.max(1, state[digitsProp] || 1);
  const maxDigits = Math.max(digits, prevDigits);
  if (maxDigits !== prevDigits) {
    state[digitsProp] = maxDigits;
  }
  const nextWidth = computeMetricReserve(design, maxDigits, base);
  if (!(state[widthProp] >= nextWidth)) {
    state[widthProp] = nextWidth;
    invalidatePowerLayout(state);
    if (!suppressLayout) {
      state.needsLayout = true;
    }
  }
}

export function invalidatePowerLayout(state) {
  state.powerLayout = null;
  state.powerLayoutDirty = true;
  state.powerLayoutKey = '';
  state.needsLayout = true;
}

export function computeTickerLayout(state, width, height) {
  const design = state.design;
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

export function resolvePowerupWindow(state, infoWidth) {
  const design = state.design;
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
    scoreX: innerLeft,
    levelX: innerRight,
    labelX: iconsAreaWidth > 0 ? (iconsLeft + iconsRight) / 2 : (innerLeft + innerRight) / 2
  };
}

export function computeTickerSpeed(state, { resetOffset = false } = {}) {
  const marqueeWidth = state.marqueeWidth || 0;
  const textWidth = state.textWidth || 0;
  const duration = typeof state.duration === 'number' && state.duration > 0 ? state.duration : 20;
  const distance = marqueeWidth + textWidth + (state.marqueeGap || 0);
  if (duration > 0) {
    state.speed = distance / duration;
  } else {
    state.speed = 80;
  }
  if (!state.paused && !state.centered) {
    if (resetOffset) {
      state.offset = state.marqueeWidth;
    } else if (Number.isFinite(state.offset)) {
      const maxOffset = state.marqueeWidth;
      const minOffset = maxOffset - distance;
      if (!(state.offset <= maxOffset && state.offset >= minOffset)) {
        state.offset = Math.max(minOffset, Math.min(state.offset, maxOffset));
      }
    } else {
      state.offset = state.marqueeWidth;
    }
  }
}

export function setTickerDimensions(state, { width, height }) {
  if (typeof width === 'number' && width > 0) {
    state.width = width;
  }
  if (typeof height === 'number' && height > 0) {
    state.height = height;
  }
}

export function setDevicePixelRatio(state, dpr) {
  if (typeof dpr === 'number' && isFinite(dpr) && dpr > 0) {
    state.dpr = dpr;
  }
}

export function setTextMetrics(state, { width, length }) {
  if (typeof width === 'number' && isFinite(width)) {
    state.textWidth = Math.max(0, width);
  }
  if (typeof length === 'number' && isFinite(length)) {
    state.textLength = Math.max(0, length | 0);
  }
}

export default {
  TICKER_DESIGN,
  createTickerState,
  createTickerDomQueue,
  createMarqueeCache,
  updateMetricDigits,
  invalidatePowerLayout,
  computeTickerLayout,
  resolvePowerupWindow,
  computeTickerSpeed,
  setTickerDimensions,
  setDevicePixelRatio,
  setTextMetrics
};
