const hasRAF = typeof requestAnimationFrame === 'function';
const hasCAF = typeof cancelAnimationFrame === 'function';

const states = new Map();
const Path2DRef = typeof Path2D === 'function' ? Path2D : null;

function getOwnerDocument(canvas) {
  if (canvas && canvas.ownerDocument) {
    return canvas.ownerDocument;
  }
  if (typeof document !== 'undefined') {
    return document;
  }
  return null;
}

function getOwnerWindow(canvas) {
  const doc = getOwnerDocument(canvas);
  if (doc && doc.defaultView) {
    return doc.defaultView;
  }
  if (typeof window !== 'undefined') {
    return window;
  }
  return null;
}

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function wrap(value, max) {
  if (max <= 0) return 0;
  const mod = value % max;
  return mod < 0 ? mod + max : mod;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function createOffscreenCanvas(width, height) {
  try {
    if (typeof OffscreenCanvas === 'function') {
      return new OffscreenCanvas(width, height);
    }
  } catch (_e) {}
  const doc = typeof document !== 'undefined' ? document : null;
  if (doc && typeof doc.createElement === 'function') {
    const surface = doc.createElement('canvas');
    surface.width = width;
    surface.height = height;
    return surface;
  }
  return null;
}

function resolveColor(value, fallback) {
  return typeof value === 'string' && value.trim().length
    ? value.trim()
    : fallback;
}

function clampRadius(width, height, radius) {
  const maxRadius = Math.min(width / 2, height / 2);
  if (maxRadius <= 0) {
    return 0;
  }
  if (radius == null) {
    return maxRadius;
  }
  const r = Number(radius);
  if (Number.isNaN(r) || r <= 0) {
    return 0;
  }
  return Math.min(maxRadius, r);
}

function createRoundedPath(marginX, marginY, width, height, radius) {
  if (!Path2DRef) {
    return null;
  }
  const path = new Path2DRef();
  const r = clampRadius(width, height, radius);
  if (typeof path.roundRect === 'function') {
    path.roundRect(marginX, marginY, width, height, r);
    return path;
  }
  if (r <= 0) {
    path.rect(marginX, marginY, width, height);
    return path;
  }
  const right = marginX + width;
  const bottom = marginY + height;
  path.moveTo(marginX + r, marginY);
  path.lineTo(right - r, marginY);
  path.quadraticCurveTo(right, marginY, right, marginY + r);
  path.lineTo(right, bottom - r);
  path.quadraticCurveTo(right, bottom, right - r, bottom);
  path.lineTo(marginX + r, bottom);
  path.quadraticCurveTo(marginX, bottom, marginX, bottom - r);
  path.lineTo(marginX, marginY + r);
  path.quadraticCurveTo(marginX, marginY, marginX + r, marginY);
  path.closePath();
  return path;
}

function beginRoundedRectPath(ctx, x, y, width, height, radius) {
  const r = clampRadius(width, height, radius);
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, r);
    return r;
  }
  if (r <= 0) {
    ctx.rect(x, y, width, height);
    return 0;
  }
  const right = x + width;
  const bottom = y + height;
  ctx.moveTo(x + r, y);
  ctx.lineTo(right - r, y);
  ctx.quadraticCurveTo(right, y, right, y + r);
  ctx.lineTo(right, bottom - r);
  ctx.quadraticCurveTo(right, bottom, right - r, bottom);
  ctx.lineTo(x + r, bottom);
  ctx.quadraticCurveTo(x, bottom, x, bottom - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  return r;
}

function sanitizeSparkPalette(source, fallback) {
  const base = fallback || {};
  const palette = {};
  palette.glow = resolveColor(source && source.glow, base.glow);
  palette.glowSoft = resolveColor(source && source.glowSoft, base.glowSoft);
  palette.coreMid = resolveColor(source && source.coreMid, base.coreMid);
  palette.core = resolveColor(source && source.core, base.core);
  palette.coreGlow = resolveColor(source && source.coreGlow, base.coreGlow);
  palette.head = resolveColor(source && source.head, base.head);
  palette.headGlow = resolveColor(source && source.headGlow, base.headGlow);
  return palette;
}

function canvasIsVisible(canvas) {
  if (!canvas) {
    return true;
  }
  try {
    if (typeof canvas.offsetParent !== 'undefined' && canvas.offsetParent === null) {
      return false;
    }
  } catch (_e) {}
  try {
    if (typeof canvas.offsetWidth === 'number' && typeof canvas.offsetHeight === 'number') {
      if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) {
        return false;
      }
    }
  } catch (_e) {}
  try {
    if (typeof canvas.getBoundingClientRect === 'function') {
      const rect = canvas.getBoundingClientRect();
      if (rect && (rect.width === 0 || rect.height === 0)) {
        return false;
      }
    }
  } catch (_e) {}
  return true;
}

function pickSparkPalette(stateRef) {
  const { sparkPalettes } = stateRef || {};
  if (!Array.isArray(sparkPalettes) || !sparkPalettes.length) {
    return stateRef && stateRef.palette ? stateRef.palette : null;
  }
  const idx = Math.floor(Math.random() * sparkPalettes.length);
  return sparkPalettes[idx] || sparkPalettes[0];
}

function buildSpark(stateRef) {
  const { perimeter, config } = stateRef;
  return {
    distance: rand(0, perimeter),
    direction: Math.random() < 0.5 ? 1 : -1,
    speed: rand(config.minSpeed, config.maxSpeed),
    length: rand(config.minLength, config.maxLength),
    life: rand(config.minLife, config.maxLife),
    rampUp: rand(0.08, 0.2),
    fadeOut: rand(0.18, 0.4),
    width: rand(config.minWidth, config.maxWidth),
    jitter: rand(3.5, 9.5),
    seed: rand(0, Math.PI * 2),
    age: 0,
    palette: pickSparkPalette(stateRef)
  };
}

function edgePoint(stateRef, dist) {
  const {
    perimeter,
    boardWidth,
    boardHeight,
    marginX,
    marginY,
    cornerRadius,
    innerWidth,
    innerHeight,
    arcLength
  } = stateRef;
  const d = wrap(dist, perimeter);
  const radius = clampRadius(boardWidth, boardHeight, cornerRadius);
  if (radius <= 0) {
    const top = boardWidth;
    const right = top + boardHeight;
    const bottom = right + boardWidth;
    if (d <= top) {
      const x = marginX + d;
      return { x, y: marginY, nx: 0, ny: -1, tx: 1, ty: 0 };
    }
    if (d <= right) {
      const offset = d - top;
      return { x: marginX + boardWidth, y: marginY + offset, nx: 1, ny: 0, tx: 0, ty: 1 };
    }
    if (d <= bottom) {
      const offset = d - right;
      return { x: marginX + boardWidth - offset, y: marginY + boardHeight, nx: 0, ny: 1, tx: -1, ty: 0 };
    }
    const offset = d - bottom;
    return { x: marginX, y: marginY + boardHeight - offset, nx: -1, ny: 0, tx: 0, ty: -1 };
  }

  const left = marginX;
  const top = marginY;
  const right = marginX + boardWidth;
  const bottom = marginY + boardHeight;
  const lineTop = Math.max(0, typeof innerWidth === 'number' ? innerWidth : boardWidth - (radius * 2));
  const lineRight = Math.max(0, typeof innerHeight === 'number' ? innerHeight : boardHeight - (radius * 2));
  const curve = Math.max(0, typeof arcLength === 'number' ? arcLength : radius * (Math.PI / 2));

  let remaining = d;
  if (lineTop > 0) {
    if (remaining <= lineTop) {
      const x = left + radius + remaining;
      return { x, y: top, nx: 0, ny: -1, tx: 1, ty: 0 };
    }
    remaining -= lineTop;
  }

  if (curve > 0) {
    if (remaining <= curve) {
      const t = remaining / curve;
      const theta = (-Math.PI / 2) + (t * (Math.PI / 2));
      const cx = right - radius;
      const cy = top + radius;
      const x = cx + radius * Math.cos(theta);
      const y = cy + radius * Math.sin(theta);
      const nx = Math.cos(theta);
      const ny = Math.sin(theta);
      const tx = -Math.sin(theta);
      const ty = Math.cos(theta);
      return { x, y, nx, ny, tx, ty };
    }
    remaining -= curve;
  }

  if (lineRight > 0) {
    if (remaining <= lineRight) {
      const y = top + radius + remaining;
      return { x: right, y, nx: 1, ny: 0, tx: 0, ty: 1 };
    }
    remaining -= lineRight;
  }

  if (curve > 0) {
    if (remaining <= curve) {
      const t = remaining / curve;
      const theta = 0 + (t * (Math.PI / 2));
      const cx = right - radius;
      const cy = bottom - radius;
      const x = cx + radius * Math.cos(theta);
      const y = cy + radius * Math.sin(theta);
      const nx = Math.cos(theta);
      const ny = Math.sin(theta);
      const tx = -Math.sin(theta);
      const ty = Math.cos(theta);
      return { x, y, nx, ny, tx, ty };
    }
    remaining -= curve;
  }

  if (lineTop > 0) {
    if (remaining <= lineTop) {
      const x = right - radius - remaining;
      return { x, y: bottom, nx: 0, ny: 1, tx: -1, ty: 0 };
    }
    remaining -= lineTop;
  }

  if (curve > 0) {
    if (remaining <= curve) {
      const t = remaining / curve;
      const theta = (Math.PI / 2) + (t * (Math.PI / 2));
      const cx = left + radius;
      const cy = bottom - radius;
      const x = cx + radius * Math.cos(theta);
      const y = cy + radius * Math.sin(theta);
      const nx = Math.cos(theta);
      const ny = Math.sin(theta);
      const tx = -Math.sin(theta);
      const ty = Math.cos(theta);
      return { x, y, nx, ny, tx, ty };
    }
    remaining -= curve;
  }

  if (lineRight > 0) {
    if (remaining <= lineRight) {
      const y = bottom - radius - remaining;
      return { x: left, y, nx: -1, ny: 0, tx: 0, ty: -1 };
    }
    remaining -= lineRight;
  }

  if (curve > 0) {
    if (remaining <= curve) {
      const t = remaining / curve;
      const theta = Math.PI + (t * (Math.PI / 2));
      const cx = left + radius;
      const cy = top + radius;
      const x = cx + radius * Math.cos(theta);
      const y = cy + radius * Math.sin(theta);
      const nx = Math.cos(theta);
      const ny = Math.sin(theta);
      const tx = -Math.sin(theta);
      const ty = Math.cos(theta);
      return { x, y, nx, ny, tx, ty };
    }
  }

  return { x: left + radius, y: top, nx: 0, ny: -1, tx: 1, ty: 0 };
}

function buildSparkPoints(stateRef, spark) {
  const segments = Math.max(4, Math.ceil(spark.length / 24));
  const points = [];
  const tail = spark.distance - spark.direction * spark.length;
  for (let i = 0; i < segments; i += 1) {
    const t = segments === 1 ? 0 : i / (segments - 1);
    const dist = tail + spark.direction * spark.length * t;
    const point = edgePoint(stateRef, dist);
    const atten = 1 - (t * 0.55);
    const flicker = Math.sin((spark.age * 80) + (t * 9) + spark.seed);
    const cross = Math.cos((spark.age * 46) + (t * 11) + spark.seed * 0.35);
    const offsetX = point.nx * flicker * spark.jitter * 0.6 * atten
      + point.tx * cross * spark.jitter * 0.28 * atten;
    const offsetY = point.ny * flicker * spark.jitter * 0.6 * atten
      + point.ty * cross * spark.jitter * 0.28 * atten;
    points.push({ x: point.x + offsetX, y: point.y + offsetY });
  }
  return points;
}

function computeAlpha(spark) {
  const fadeIn = spark.rampUp > 0 ? Math.min(1, spark.age / spark.rampUp) : 1;
  const fadeOut = spark.fadeOut > 0 ? Math.min(1, (spark.life - spark.age) / spark.fadeOut) : 1;
  const alpha = Math.max(0, Math.min(1, fadeIn * fadeOut));
  return alpha;
}

function drawBaseGlow(stateRef, targetCtx) {
  const ctx = targetCtx || stateRef.ctx;
  if (!ctx) {
    return;
  }
  const { marginX, marginY, boardWidth, boardHeight, palette, cornerRadius, basePath } = stateRef;
  const radius = clampRadius(boardWidth, boardHeight, cornerRadius);
  const path = basePath && typeof ctx.stroke === 'function' ? basePath : null;

  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.strokeStyle = palette.base;
  ctx.lineWidth = 6;
  ctx.shadowBlur = 52;
  ctx.shadowColor = palette.baseShadow;
  if (path) {
    ctx.stroke(path);
  } else {
    beginRoundedRectPath(ctx, marginX, marginY, boardWidth, boardHeight, radius);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.strokeStyle = palette.baseInner;
  ctx.lineWidth = 2.4;
  ctx.shadowBlur = 18;
  ctx.shadowColor = palette.baseInner;
  if (path) {
    ctx.stroke(path);
  } else {
    beginRoundedRectPath(ctx, marginX, marginY, boardWidth, boardHeight, radius);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSparks(stateRef) {
  const { ctx, canvas } = stateRef;
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (stateRef.baseLayer && typeof ctx.drawImage === 'function') {
    ctx.drawImage(stateRef.baseLayer, 0, 0);
  } else {
    drawBaseGlow(stateRef, ctx);
  }
  if (!stateRef.sparks.length) {
    ctx.restore();
    return;
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (let i = 0; i < stateRef.sparks.length; i += 1) {
    const spark = stateRef.sparks[i];
    const alpha = computeAlpha(spark);
    if (alpha <= 0) {
      continue;
    }
    const pts = buildSparkPoints(stateRef, spark);
    if (pts.length < 2) {
      continue;
    }
    const head = pts[pts.length - 1];
    const palette = spark.palette || (stateRef.sparkPalettes && stateRef.sparkPalettes[0]) || stateRef.palette;
    ctx.save();
    ctx.globalAlpha = alpha * 0.55;
    ctx.lineWidth = spark.width * 4.6;
    ctx.shadowBlur = 34;
    ctx.shadowColor = palette.glow;
    ctx.strokeStyle = palette.glowSoft;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let p = 1; p < pts.length; p += 1) {
      ctx.lineTo(pts[p].x, pts[p].y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha * 0.78;
    ctx.lineWidth = spark.width * 2.2;
    ctx.shadowBlur = 18;
    ctx.shadowColor = palette.coreGlow;
    ctx.strokeStyle = palette.coreMid;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let p = 1; p < pts.length; p += 1) {
      ctx.lineTo(pts[p].x, pts[p].y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = spark.width * 1.05;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = palette.core;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let p = 1; p < pts.length; p += 1) {
      ctx.lineTo(pts[p].x, pts[p].y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = palette.head;
    ctx.shadowColor = palette.headGlow;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(head.x, head.y, Math.max(1.8, spark.width * 1.8), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function buildBaseLayer(stateRef) {
  if (!stateRef || !stateRef.canvas || typeof stateRef.canvas.width !== 'number') {
    return null;
  }
  const surface = createOffscreenCanvas(stateRef.canvas.width, stateRef.canvas.height);
  if (!surface || typeof surface.getContext !== 'function') {
    return null;
  }
  const layerCtx = surface.getContext('2d');
  if (!layerCtx) {
    return null;
  }
  drawBaseGlow(stateRef, layerCtx);
  return surface;
}

function updateSparks(stateRef, dt) {
  const { sparks, perimeter } = stateRef;
  if (!sparks.length) {
    return;
  }
  for (let i = sparks.length - 1; i >= 0; i -= 1) {
    const spark = sparks[i];
    spark.age += dt;
    if (spark.age >= spark.life) {
      sparks.splice(i, 1);
      continue;
    }
    spark.distance = wrap(spark.distance + spark.direction * spark.speed * dt, perimeter);
  }
}

function maybeSpawn(stateRef, elapsedMs) {
  stateRef.spawnCooldown -= elapsedMs;
  if (stateRef.spawnCooldown > 0) {
    return;
  }
  if (stateRef.sparks.length >= stateRef.config.maxSparks) {
    stateRef.spawnCooldown = rand(stateRef.config.spawnMin, stateRef.config.spawnMax);
    return;
  }
  stateRef.sparks.push(buildSpark(stateRef));
  stateRef.spawnCooldown = rand(stateRef.config.spawnMin, stateRef.config.spawnMax);
}

function scheduleTick(stateRef) {
  if (!hasRAF || !stateRef || !stateRef.running) {
    return;
  }
  if (stateRef.rafId) {
    return;
  }
  stateRef.rafId = requestAnimationFrame(stateRef.tick);
}

function updateSuspension(stateRef, timestamp) {
  if (!stateRef) {
    return false;
  }
  const docHidden = !!(stateRef.doc && stateRef.doc.hidden);
  const windowBlurred = !!stateRef.windowHidden;
  const displayHidden = !canvasIsVisible(stateRef.canvas);
  stateRef.systemHidden = docHidden || windowBlurred;
  stateRef.displayHidden = displayHidden;
  const shouldSuspend = stateRef.systemHidden || displayHidden;
  if (shouldSuspend !== stateRef.suspended) {
    stateRef.suspended = shouldSuspend;
    if (!shouldSuspend) {
      stateRef.lastTs = typeof timestamp === 'number' ? timestamp : nowMs();
      stateRef.spawnCooldown = Math.min(stateRef.spawnCooldown, stateRef.config.spawnMax);
    }
  }
  return stateRef.suspended;
}

function detachState(stateRef) {
  if (!stateRef) {
    return;
  }
  stateRef.running = false;
  if (hasCAF && stateRef.rafId) {
    try {
      cancelAnimationFrame(stateRef.rafId);
    } catch (_e) {}
  }
  if (stateRef.doc && stateRef.visibilityHandler && typeof stateRef.doc.removeEventListener === 'function') {
    try {
      stateRef.doc.removeEventListener('visibilitychange', stateRef.visibilityHandler);
    } catch (_e) {}
  }
  if (stateRef.win && stateRef.blurHandler && typeof stateRef.win.removeEventListener === 'function') {
    try {
      stateRef.win.removeEventListener('blur', stateRef.blurHandler);
    } catch (_e) {}
  }
  if (stateRef.win && stateRef.focusHandler && typeof stateRef.win.removeEventListener === 'function') {
    try {
      stateRef.win.removeEventListener('focus', stateRef.focusHandler);
    } catch (_e) {}
  }
  stateRef.visibilityHandler = null;
  stateRef.blurHandler = null;
  stateRef.focusHandler = null;
  stateRef.baseLayer = null;
  stateRef.windowHidden = false;
  stateRef.systemHidden = false;
  stateRef.displayHidden = false;
  try {
    if (stateRef.canvas && stateRef.canvas.__neonFxState === stateRef) {
      stateRef.canvas.__neonFxState = null;
    }
  } catch (_e) {}
  stateRef.rafId = 0;
}

function runFrame(stateRef, ts) {
  if (!stateRef || !stateRef.running) {
    return;
  }
  stateRef.rafId = 0;
  const timestamp = typeof ts === 'number' ? ts : nowMs();
  if (updateSuspension(stateRef, timestamp)) {
    if (!stateRef.systemHidden) {
      scheduleTick(stateRef);
    }
    return;
  }
  const elapsedMs = timestamp - stateRef.lastTs;
  stateRef.lastTs = timestamp;
  const dt = Math.min(0.08, Math.max(0.001, elapsedMs / 1000));
  updateSparks(stateRef, dt);
  maybeSpawn(stateRef, elapsedMs);
  drawSparks(stateRef);
  scheduleTick(stateRef);
}

export function initBorderElectricFX(canvas, opts = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  if (!hasRAF) {
    return;
  }
  const previous = states.get(canvas);
  if (previous) {
    detachState(previous);
    states.delete(canvas);
  }
  const boardWidth = Math.max(0, Number(opts.boardWidth)) || canvas.width;
  const boardHeight = Math.max(0, Number(opts.boardHeight)) || canvas.height;
  const marginX = opts.marginX != null ? Number(opts.marginX) : Math.max(0, (canvas.width - boardWidth) / 2);
  const marginY = opts.marginY != null ? Number(opts.marginY) : Math.max(0, (canvas.height - boardHeight) / 2);
  const desiredCorner = opts.cornerRadius != null
    ? Number(opts.cornerRadius)
    : Math.min(boardWidth, boardHeight) * 0.045;
  const cornerRadius = clampRadius(boardWidth, boardHeight, desiredCorner);
  const innerWidth = Math.max(0, boardWidth - (cornerRadius * 2));
  const innerHeight = Math.max(0, boardHeight - (cornerRadius * 2));
  const arcLength = cornerRadius * (Math.PI / 2);
  const perimeter = Math.max(1, (innerWidth * 2) + (innerHeight * 2) + (arcLength * 4));

  const sparkFallback = {
    glow: 'rgba(255, 48, 178, 0.92)',
    glowSoft: 'rgba(206, 48, 255, 0.42)',
    coreMid: 'rgba(255, 128, 214, 0.92)',
    core: 'rgba(255, 62, 198, 0.98)',
    coreGlow: 'rgba(255, 82, 208, 0.96)',
    head: 'rgba(255, 158, 228, 0.96)',
    headGlow: 'rgba(255, 102, 216, 0.94)'
  };

  const baseSparkPalette = sanitizeSparkPalette({
    glow: opts.glowColor,
    glowSoft: opts.glowSoftColor,
    coreMid: opts.coreMidColor,
    core: opts.coreColor,
    coreGlow: opts.coreGlowColor,
    head: opts.headColor,
    headGlow: opts.headGlowColor
  }, sparkFallback);

  const palette = {
    base: resolveColor(opts.baseColor, 'rgba(238, 52, 214, 0.48)'),
    baseShadow: resolveColor(opts.baseShadowColor, 'rgba(186, 24, 255, 0.72)'),
    baseInner: resolveColor(opts.baseInnerColor, 'rgba(255, 148, 255, 0.64)'),
    glow: baseSparkPalette.glow,
    glowSoft: baseSparkPalette.glowSoft,
    coreMid: baseSparkPalette.coreMid,
    core: baseSparkPalette.core,
    coreGlow: baseSparkPalette.coreGlow,
    head: baseSparkPalette.head,
    headGlow: baseSparkPalette.headGlow
  };

  const sparkPalettes = Array.isArray(opts.sparkPalettes) && opts.sparkPalettes.length
    ? opts.sparkPalettes.map((entry) => sanitizeSparkPalette(entry, baseSparkPalette))
    : [
        baseSparkPalette,
        sanitizeSparkPalette({
          glow: 'rgba(255, 86, 150, 0.9)',
          glowSoft: 'rgba(255, 54, 118, 0.38)',
          coreMid: 'rgba(255, 190, 214, 0.88)',
          coreGlow: 'rgba(255, 124, 188, 0.94)',
          headGlow: 'rgba(255, 140, 206, 0.92)'
        }, baseSparkPalette),
        sanitizeSparkPalette({
          glow: 'rgba(214, 84, 255, 0.9)',
          glowSoft: 'rgba(184, 58, 255, 0.38)',
          coreMid: 'rgba(228, 190, 255, 0.9)',
          coreGlow: 'rgba(210, 128, 255, 0.94)',
          headGlow: 'rgba(210, 134, 255, 0.92)'
        }, baseSparkPalette)
      ];
  const config = {
    minSpeed: Math.max(100, opts.minSpeed || 180),
    maxSpeed: Math.max(120, opts.maxSpeed || 320),
    minLength: Math.max(30, opts.minLength || 60),
    maxLength: Math.max(opts.minLength || 60, opts.maxLength || 120),
    minLife: Math.max(0.18, opts.minLife || 0.45),
    maxLife: Math.max(opts.minLife || 0.45, opts.maxLife || 1.0),
    minWidth: Math.max(0.5, opts.minWidth || 1.0),
    maxWidth: Math.max(opts.minWidth || 1.0, opts.maxWidth || 1.8),
    maxSparks: Math.max(3, opts.maxSparks || 9),
    spawnMin: Math.max(30, opts.spawnMin || 80),
    spawnMax: Math.max(opts.spawnMin || 80, opts.spawnMax || 180)
  };

  const doc = getOwnerDocument(canvas);
  const win = getOwnerWindow(canvas);
  const basePath = createRoundedPath(marginX, marginY, boardWidth, boardHeight, cornerRadius);

  const state = {
    canvas,
    ctx,
    boardWidth,
    boardHeight,
    marginX,
    marginY,
    cornerRadius,
    innerWidth,
    innerHeight,
    arcLength,
    perimeter,
    palette,
    sparkPalettes,
    config,
    sparks: [],
    spawnCooldown: rand(config.spawnMin, config.spawnMax),
    lastTs: nowMs(),
    running: true,
    rafId: 0,
    basePath,
    baseLayer: null,
    doc,
    win,
    visibilityHandler: null,
    blurHandler: null,
    focusHandler: null,
    windowHidden: false,
    suspended: false,
    systemHidden: false,
    displayHidden: false
  };

  state.tick = (ts) => runFrame(state, ts);
  state.baseLayer = buildBaseLayer(state);
  state.suspended = updateSuspension(state, state.lastTs);
  states.set(canvas, state);
  try {
    canvas.__neonFxState = state;
  } catch (_e) {}
  drawSparks(state);

  if (state.doc && typeof state.doc.addEventListener === 'function') {
    state.visibilityHandler = () => {
      const ts = nowMs();
      updateSuspension(state, ts);
      if (!state.suspended && state.running) {
        scheduleTick(state);
      }
    };
    try {
      state.doc.addEventListener('visibilitychange', state.visibilityHandler, { passive: true });
    } catch (_e) {
      state.doc.addEventListener('visibilitychange', state.visibilityHandler);
    }
  }

  if (state.win && typeof state.win.addEventListener === 'function') {
    state.blurHandler = () => {
      state.windowHidden = true;
      updateSuspension(state, nowMs());
    };
    state.focusHandler = () => {
      state.windowHidden = false;
      const ts = nowMs();
      updateSuspension(state, ts);
      if (!state.suspended && state.running) {
        scheduleTick(state);
      }
    };
    try {
      state.win.addEventListener('blur', state.blurHandler, { passive: true });
    } catch (_e) {
      state.win.addEventListener('blur', state.blurHandler);
    }
    try {
      state.win.addEventListener('focus', state.focusHandler, { passive: true });
    } catch (_e) {
      state.win.addEventListener('focus', state.focusHandler);
    }
  }

  if (!state.suspended) {
    scheduleTick(state);
  }
}

export function resumeBorderElectricFX(canvas) {
  if (!canvas) {
    return;
  }
  const state = states.get(canvas);
  if (!state) {
    return;
  }
  state.windowHidden = false;
  const timestamp = nowMs();
  updateSuspension(state, timestamp);
  if (!state.suspended) {
    scheduleTick(state);
  }
}

export function disposeBorderElectricFX(canvas) {
  if (canvas) {
    const target = states.get(canvas);
    if (!target) {
      return;
    }
    detachState(target);
    try {
      if (canvas.__neonFxState === target) {
        canvas.__neonFxState = null;
      }
    } catch (_e) {}
    states.delete(canvas);
    return;
  }
  for (const entry of states.values()) {
    detachState(entry);
  }
  states.clear();
}
