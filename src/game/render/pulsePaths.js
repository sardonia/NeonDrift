import { cellCenter as _cellCenter } from '../utils.js';
import * as C from '../Constants.js';

function cellCenter(col, row) {
  return _cellCenter(col, row, C.CELL);
}

const _trailCache = new WeakMap();
const _scratchCoords = [0, 0];

function getTrailMeta(trail) {
  if (!Array.isArray(trail)) {
    return null;
  }
  let meta = _trailCache.get(trail);
  if (!meta) {
    meta = {
      segments: [],
      keys: [],
      window: [],
      count: 0
    };
    _trailCache.set(trail, meta);
  }
  return meta;
}

function readCoords(point) {
  const coords = _scratchCoords;
  if (Array.isArray(point)) {
    const cx = Number(point[0]);
    const cy = Number(point[1]);
    coords[0] = Number.isFinite(cx) ? cx : 0;
    coords[1] = Number.isFinite(cy) ? cy : 0;
    return coords;
  }
  if (point && typeof point === 'object') {
    const rawX = point.col ?? point.c ?? point.x;
    const rawY = point.row ?? point.r ?? point.y;
    const cx = Number(rawX);
    const cy = Number(rawY);
    coords[0] = Number.isFinite(cx) ? cx : 0;
    coords[1] = Number.isFinite(cy) ? cy : 0;
    return coords;
  }
  coords[0] = 0;
  coords[1] = 0;
  return coords;
}

function segmentKey(ax, ay, bx, by) {
  return `${ax},${ay}->${bx},${by}`;
}

function buildSegmentPath(ax, ay, bx, by) {
  if (typeof Path2D === 'undefined') {
    return null;
  }
  try {
    const path = new Path2D();
    const [sx, sy] = cellCenter(ax, ay);
    const [ex, ey] = cellCenter(bx, by);
    path.moveTo(sx, sy);
    path.lineTo(ex, ey);
    return path;
  } catch (_e) {
    return null;
  }
}

function syncSegments(trail, meta) {
  const segCount = Math.max(0, (trail.length || 0) - 1);
  const { segments, keys } = meta;
  if (segments.length > segCount) {
    segments.length = segCount;
  }
  if (keys.length > segCount) {
    keys.length = segCount;
  }
  for (let i = 0; i < segCount; i++) {
    const [ax, ay] = readCoords(trail[i]);
    const [bx, by] = readCoords(trail[i + 1]);
    const key = segmentKey(ax, ay, bx, by);
    if (keys[i] !== key || !segments[i]) {
      keys[i] = key;
      segments[i] = buildSegmentPath(ax, ay, bx, by);
    }
  }
  meta.count = segCount;
}

function computePulseSegments(trail, span = C.PULSE_SPAN) {
  if (!Array.isArray(trail) || trail.length < 2) {
    return null;
  }
  const meta = getTrailMeta(trail);
  if (!meta) {
    return null;
  }
  const limit = Number.isFinite(span) ? Math.max(0, span | 0) : Math.max(0, C.PULSE_SPAN | 0);
  if (limit <= 0) {
    meta.window.length = 0;
    return null;
  }
  syncSegments(trail, meta);
  const segCount = meta.count || 0;
  if (!segCount) {
    meta.window.length = 0;
    return null;
  }
  const start = Math.max(0, segCount - limit);
  const window = meta.window;
  window.length = 0;
  for (let i = start; i < segCount; i++) {
    const seg = meta.segments[i];
    if (seg) {
      window.push(seg);
    }
  }
  return window.length ? window : null;
}

export function getPulseSegments(trail, span = C.PULSE_SPAN) {
  return computePulseSegments(trail, span);
}

export function rebuildPulsePaths(trailPlayer, trailEnemy, span = C.PULSE_SPAN) {
  const pulseP = computePulseSegments(trailPlayer, span);
  const pulseE = computePulseSegments(trailEnemy, span);
  return { pulseP, pulseE };
}

export function resetPulsePathCache(trail) {
  if (!trail || !Array.isArray(trail)) {
    return;
  }
  const meta = _trailCache.get(trail);
  if (meta) {
    meta.segments.length = 0;
    meta.keys.length = 0;
    meta.window.length = 0;
    meta.count = 0;
  }
}
