let __impl = { draw: null, state: {}, helpers: {}, consts: {} };
export function initPaths(bindings = {}){
  const { draw, state, helpers, consts } = bindings;
  if (typeof draw === 'function') __impl.draw = draw;
  if (state && typeof state === 'object') __impl.state = state;
  if (helpers && typeof helpers === 'object') __impl.helpers = helpers;
  if (consts && typeof consts === 'object') __impl.consts = consts;
  return __impl;
}
export function drawPaths(t){
  if (__impl.draw) return __impl.draw(t);
  return;
}
export const PATHS = {
  get state(){ return __impl.state; },
  get helpers(){ return __impl.helpers; },
  get consts(){ return __impl.consts; }
};
const _pathCaches = {
  chevron: null,
  walls: {
    top: null,
    bottom: null,
    left: null,
    right: null
  }
};
export function buildPathCaches({ board, CELL } = {}) {
  try {
    if (!board || typeof CELL === 'undefined') return _pathCaches;
    const ch = new Path2D();
    ch.moveTo(-0.50, -1.00);
    ch.lineTo(0.02, 0.00);
    ch.lineTo(-0.50, 1.00);
    ch.closePath();
    _pathCaches.chevron = ch;
    const x1 = CELL / 2;
    const y1 = CELL / 2;
    const x2 = board.width - CELL / 2;
    const y2 = board.height - CELL / 2;
    const top = new Path2D(); top.moveTo(x1, y1); top.lineTo(x2, y1);
    const bottom = new Path2D(); bottom.moveTo(x1, y2); bottom.lineTo(x2, y2);
    const left = new Path2D(); left.moveTo(x1, y1); left.lineTo(x1, y2);
    const right = new Path2D(); right.moveTo(x2, y1); right.lineTo(x2, y2);
    _pathCaches.walls.top = top;
    _pathCaches.walls.bottom = bottom;
    _pathCaches.walls.left = left;
    _pathCaches.walls.right = right;
  } catch (_) {
  }
  return _pathCaches;
}
export function getPathCaches() {
  return _pathCaches;
}
