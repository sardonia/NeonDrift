import { resolvePowerupWindow, setDevicePixelRatio } from './state.js';

// Adjust the HUD and ticker fonts to be thinner and more compact.  The original
// sizes used very large values (e.g. 32px for scores and 38px for the
// marquee).  A thinner aesthetic helps the HUD fit labels like “Score”,
// “Power‑Ups” and “Level” without crowding while still using the same
// futuristic typefaces.  We reduce the font sizes and lighten the weight on
// labels.  Numbers and power‑up icons remain slightly bolder for clarity.
const TICKER_FONTS = Object.freeze({
  // Labels (e.g. “Score”, “Level”): lighter weight and smaller size
  label: "500 12px 'Orbitron','Rajdhani','Exo 2','Segoe UI',sans-serif",
  // Values (score/level numbers): slightly smaller than before but still bold
  value: "600 24px 'Orbitron','Rajdhani','Exo 2','Segoe UI',sans-serif",
  // Power‑up icons: reduced size to harmonise with the new HUD proportions
  power: "600 20px 'Orbitron','Rajdhani','Exo 2','Segoe UI',sans-serif",
  // Ticker marquee: trimmed down from 38px to 28px to avoid overpowering
  marquee: "600 28px 'Orbitron','Rajdhani','Exo 2','Segoe UI',sans-serif",
  // Pause banner: scaled down in line with the marquee and value fonts
  pause: "600 24px 'Orbitron','Rajdhani','Exo 2','Segoe UI',sans-serif"
});

function getDevicePixelRatio() {
  try {
    if (typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number') {
      return window.devicePixelRatio || 1;
    }
  } catch (_err) {}
  return 1;
}

function ensureContext(canvas) {
  if (!canvas) return null;
  try {
    return canvas.getContext('2d');
  } catch (_err) {
    return null;
  }
}

function resizeCanvas(canvas, state, width, height) {
  if (!canvas) return null;
  const dpr = getDevicePixelRatio();
  setDevicePixelRatio(state, dpr);
  const fallbackWidth = canvas.clientWidth || state.design.defaultWidth;
  const fallbackHeight = canvas.clientHeight || state.design.defaultHeight;
  const cssWidth = Math.max(1, Math.round((typeof width === 'number' && width > 0) ? width : fallbackWidth));
  const cssHeight = Math.max(1, Math.round((typeof height === 'number' && height > 0) ? height : fallbackHeight));
  const targetWidth = Math.max(1, Math.round(cssWidth * dpr));
  const targetHeight = Math.max(1, Math.round(cssHeight * dpr));
  const style = canvas.style || null;
  if (style) {
    style.width = `${cssWidth}px`;
    style.height = `${cssHeight}px`;
  }
  if (canvas.width !== targetWidth) {
    canvas.width = targetWidth;
  }
  if (canvas.height !== targetHeight) {
    canvas.height = targetHeight;
  }
  const ctx = ensureContext(canvas);
  if (ctx) {
    try { ctx.resetTransform(); } catch (_err) {}
    try { ctx.scale(dpr, dpr); } catch (_err) {}
  }
  return ctx;
}

function measureTextWidthInternal(ctx, text, font = TICKER_FONTS.marquee) {
  if (!ctx) return 0;
  try {
    ctx.save();
    ctx.font = font;
    const metrics = ctx.measureText(text || '');
    const width = metrics && typeof metrics.width === 'number' ? metrics.width : 0;
    ctx.restore();
    return width;
  } catch (_err) {
    return (text || '').length * 24;
  }
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

function drawInfoPanel(ctx, state, { infoWidth, height }) {
  if (!(infoWidth > 0)) {
    return;
  }

  ctx.save();
  try {
    const gradient = ctx.createLinearGradient(0, 0, infoWidth, height);
    gradient.addColorStop(0, 'rgba(70, 12, 74, 0.9)');
    gradient.addColorStop(1, 'rgba(34, 6, 56, 0.94)');
    ctx.fillStyle = gradient;
  } catch (_err) {
    ctx.fillStyle = 'rgba(44,12,60,0.9)';
  }
  if (typeof ctx.fillRect === 'function') {
    ctx.fillRect(0, 0, infoWidth, height);
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(240, 150, 226, 0.34)';
  if (typeof ctx.fillRect === 'function') {
    ctx.fillRect(infoWidth - 1.5, 6, 2.5, Math.max(0, height - 12));
  }
  ctx.restore();

  const labelTop = 10;
  const valueTop = 28;
  const interior = resolvePowerupWindow(state, infoWidth);

  ctx.save();
  ctx.textBaseline = 'top';
  ctx.font = TICKER_FONTS.label;
  ctx.fillStyle = 'rgba(255, 214, 242, 0.86)';
  ctx.textAlign = 'left';
  ctx.fillText('SCORE', interior.scoreX, labelTop);

  ctx.font = TICKER_FONTS.value;
  ctx.fillStyle = '#ffe6f8';
  ctx.shadowColor = 'rgba(246, 108, 218, 0.48)';
  ctx.shadowBlur = 12;
  const scoreText = String(Number.isFinite(state.score) ? state.score : 0);
  ctx.fillText(scoreText, interior.scoreX, valueTop);
  ctx.shadowBlur = 0;

  ctx.font = TICKER_FONTS.label;
  ctx.fillStyle = 'rgba(255, 214, 242, 0.86)';
  ctx.textAlign = 'right';
  ctx.fillText('LEVEL', interior.levelX, labelTop);

  ctx.font = TICKER_FONTS.value;
  ctx.fillStyle = '#ffe6f8';
  ctx.shadowColor = 'rgba(246, 108, 218, 0.48)';
  ctx.shadowBlur = 12;
  const levelText = String(Number.isFinite(state.level) ? state.level : 1);
  ctx.fillText(levelText, interior.levelX, valueTop);
  ctx.shadowBlur = 0;

  const powerLayout = preparePowerLayout(ctx, state, interior);
  const centerX = powerLayout && typeof powerLayout.centerX === 'number'
    ? powerLayout.centerX
    : interior.labelX;

  ctx.textAlign = 'center';
  ctx.font = TICKER_FONTS.label;
  ctx.fillStyle = 'rgba(255, 204, 238, 0.84)';
  ctx.fillText('POWER UPS', centerX, labelTop);

  ctx.font = TICKER_FONTS.power;
  ctx.fillStyle = '#ffd2f2';
  ctx.shadowColor = 'rgba(214, 56, 178, 0.5)';
  ctx.shadowBlur = 10;
  const iconsTop = valueTop;
  if (!powerLayout || powerLayout.placeholder) {
    ctx.globalAlpha = 0.7;
    ctx.fillText('— — —', centerX, iconsTop);
    ctx.globalAlpha = 1;
  } else {
    ctx.textAlign = 'left';
    for (const entry of powerLayout.entries) {
      ctx.fillText(entry.text, entry.x, iconsTop);
    }
  }
  ctx.restore();
}

function drawMarquee(ctx, state, { width, height }) {
  if (state.domTrackActive) {
    return;
  }
  if (!(width > 0)) {
    return;
  }

  const edgePad = Math.max(0, state.design.marqueeEdgePad || 0);
  const gapLeft = Math.max(0, state.design.marqueeGapLeft || 0);
  const rightPad = Math.max(0, state.design.rightPadding || 0);
  const contentWidth = Math.max(0, width - gapLeft - rightPad);
  const marqueeWidth = Math.max(0, state.marqueeWidth || contentWidth);
  const drawWidth = Math.max(0, Math.min(marqueeWidth, contentWidth));
  const marqueeLeft = gapLeft;
  const marqueeRight = marqueeLeft + drawWidth;

  if (!(drawWidth > 0)) {
    return;
  }

  ctx.save();
  try {
    const grad = ctx.createLinearGradient(
      marqueeLeft - edgePad - 6,
      0,
      marqueeRight + edgePad + 6,
      0
    );
    grad.addColorStop(0, 'rgba(48, 8, 52, 0.44)');
    grad.addColorStop(0.5, 'rgba(70, 18, 68, 0.28)');
    grad.addColorStop(1, 'rgba(48, 8, 52, 0.44)');
    ctx.fillStyle = grad;
  } catch (_err) {
    ctx.fillStyle = 'rgba(38,10,48,0.38)';
  }
  ctx.globalAlpha = 0.65;
  if (typeof ctx.fillRect === 'function') {
    ctx.fillRect(marqueeLeft - edgePad, 8, drawWidth + edgePad * 2, Math.max(0, height - 16));
  }
  ctx.restore();

  ctx.save();
  if (typeof ctx.beginPath === 'function') {
    ctx.beginPath();
  }
  if (typeof ctx.rect === 'function') {
    ctx.rect(marqueeLeft - edgePad, 0, drawWidth + edgePad * 2, height);
    if (typeof ctx.clip === 'function') {
      ctx.clip();
    }
  }

  const baseline = height / 2;
  const text = String(state.text || '');
  const marqueeFont = state.centered ? TICKER_FONTS.pause : TICKER_FONTS.marquee;
  ctx.font = marqueeFont;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd6f4';
  ctx.shadowColor = 'rgba(246, 108, 218, 0.74)';
  ctx.shadowBlur = 18;

  if (!text) {
    ctx.restore();
    return;
  }

  if (state.centered) {
    const textWidth = state.textWidth;
    const startX = marqueeLeft + Math.max(0, (drawWidth - textWidth) / 2);
    ctx.fillText(text, startX, baseline);
    ctx.restore();
    return;
  }

  const totalWidth = state.textWidth + state.marqueeGap;
  if (totalWidth <= 0) {
    ctx.fillText(text, marqueeLeft, baseline);
    ctx.restore();
    return;
  }

  const cycle = totalWidth;
  let offset = state.offset;
  if (!Number.isFinite(offset)) {
    offset = 0;
  } else if (cycle > 0) {
    offset %= cycle;
    if (offset < 0) {
      offset += cycle;
    }
  }
  let drawX = marqueeLeft + offset - cycle;
  while (drawX < marqueeRight) {
    ctx.fillText(text, drawX, baseline);
    drawX += cycle;
  }
  ctx.restore();
}

function drawTickerFrame({ infoCtx, marqueeCtx, state }) {
  const width = state.width;
  const height = state.height;
  const hasInfoCtx = !!infoCtx;
  const rawInfoWidth = Math.min(width, Math.max(0, state.infoWidth || 0));
  const infoWidth = hasInfoCtx ? rawInfoWidth : 0;
  const marqueeCanvasWidth = hasInfoCtx
    ? Math.max(0, width - infoWidth)
    : Math.max(0, width);

  if (infoCtx) {
    const clearWidth = infoCtx.canvas && typeof infoCtx.canvas.width === 'number'
      ? infoCtx.canvas.width
      : infoWidth * (state.dpr || 1);
    const clearHeight = infoCtx.canvas && typeof infoCtx.canvas.height === 'number'
      ? infoCtx.canvas.height
      : height * (state.dpr || 1);
    try { infoCtx.clearRect(0, 0, clearWidth, clearHeight); } catch (_err) {}
    drawInfoPanel(infoCtx, state, { infoWidth, height });
  }

  if (marqueeCtx) {
    const clearWidth = marqueeCtx.canvas && typeof marqueeCtx.canvas.width === 'number'
      ? marqueeCtx.canvas.width
      : marqueeCanvasWidth * (state.dpr || 1);
    const clearHeight = marqueeCtx.canvas && typeof marqueeCtx.canvas.height === 'number'
      ? marqueeCtx.canvas.height
      : height * (state.dpr || 1);
    try { marqueeCtx.clearRect(0, 0, clearWidth, clearHeight); } catch (_err) {}
    drawMarquee(marqueeCtx, state, { width: marqueeCanvasWidth, height });
  }

  state.needsRedraw = false;
}

function safeGet(dom, key) {
  if (!dom || typeof dom.get !== 'function') {
    return null;
  }
  try {
    return dom.get(key);
  } catch (_err) {
    return null;
  }
}

export function createCanvasDriver({ state }) {
  let domRef = null;
  let infoCanvas = null;
  let infoCtx = null;
  let marqueeCanvas = null;
  let marqueeCtx = null;
  let contextsReady = false;
  let infoReady = false;

  function ensureCanvases() {
    if (!domRef) {
      contextsReady = false;
      state.canvasAttached = false;
      state.canvasReady = false;
      return { ready: false };
    }

    const hud = safeGet(domRef, 'tickerHud');
    state.hudAttached = !!hud;

    const nextInfoCanvas = safeGet(domRef, 'tickerInfoCanvas');
    if (!nextInfoCanvas || nextInfoCanvas.isConnected === false) {
      infoCanvas = null;
      infoCtx = null;
    } else {
      if (infoCanvas !== nextInfoCanvas) {
        infoCanvas = nextInfoCanvas;
        infoCtx = ensureContext(infoCanvas);
      } else if (!infoCtx) {
        infoCtx = ensureContext(infoCanvas);
      }
    }

    const nextMarqueeCanvas = safeGet(domRef, 'tickerCanvas');
    if (!nextMarqueeCanvas || nextMarqueeCanvas.isConnected === false) {
      marqueeCanvas = null;
      marqueeCtx = null;
    } else {
      if (marqueeCanvas !== nextMarqueeCanvas) {
        marqueeCanvas = nextMarqueeCanvas;
        marqueeCtx = ensureContext(marqueeCanvas);
      } else if (!marqueeCtx) {
        marqueeCtx = ensureContext(marqueeCanvas);
      }
    }

    infoReady = !!(infoCanvas && infoCtx);
    const marqueeReady = !!(marqueeCanvas && marqueeCtx);
    contextsReady = marqueeReady;
    if (!marqueeReady) {
      state.canvasAttached = false;
      state.canvasReady = false;
    }
    return { ready: contextsReady, infoReady };
  }

  function attach(dom) {
    domRef = dom || null;
    return ensureCanvases();
  }

  function resize() {
    const { ready } = ensureCanvases();
    if (!ready) {
      return { ready: false };
    }

    const infoWidth = Math.max(1, Math.round(Math.min(state.width, Math.max(0, state.infoWidth || 0))));
    const marqueeCanvasWidth = Math.max(1, Math.round(Math.max(0, state.width - infoWidth)));
    const height = Math.max(1, Math.round(state.height));

    if (infoCanvas) {
      infoCtx = resizeCanvas(infoCanvas, state, infoWidth, height);
    }
    if (marqueeCanvas) {
      marqueeCtx = resizeCanvas(marqueeCanvas, state, marqueeCanvasWidth, height);
    }

    infoReady = !!(infoCanvas && infoCtx);
    const marqueeReady = !!(marqueeCanvas && marqueeCtx);
    contextsReady = marqueeReady;
    if (!marqueeReady) {
      state.canvasAttached = false;
      state.canvasReady = false;
    }

    return { ready: contextsReady, infoReady };
  }

  function draw() {
    if (!contextsReady || !marqueeCtx) {
      state.canvasAttached = false;
      state.canvasReady = false;
      return { ready: false, drewFrame: false };
    }

    try {
      drawTickerFrame({ infoCtx, marqueeCtx, state });
      state.canvasAttached = true;
      state.canvasReady = true;
      return { ready: true, drewFrame: true };
    } catch (err) {
      infoCtx = null;
      marqueeCtx = null;
      contextsReady = false;
      infoReady = false;
      state.canvasAttached = false;
      state.canvasReady = false;
      return { ready: false, drewFrame: false, error: err };
    }
  }

  function measureTextWidth(text, { centered = false } = {}) {
    const ctx = marqueeCtx || infoCtx;
    const font = centered ? TICKER_FONTS.pause : TICKER_FONTS.marquee;
    return measureTextWidthInternal(ctx, text, font);
  }

  function detach() {
    infoCanvas = null;
    infoCtx = null;
    marqueeCanvas = null;
    marqueeCtx = null;
    contextsReady = false;
    infoReady = false;
    state.canvasAttached = false;
    state.canvasReady = false;
    return { ready: false };
  }

  return {
    attach,
    resize,
    draw,
    measureTextWidth,
    detach
  };
}

export default {
  createCanvasDriver
};
