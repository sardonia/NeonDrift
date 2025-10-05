let _collisions = null;
export function setCollisions(collisions) {
  _collisions = collisions || null;
}
export function cellCenter(col, row, cellSize) {
  const x = col * cellSize + cellSize / 2;
  const y = row * cellSize + cellSize / 2;
  return [x, y];
}
export function pulseAABB(trail, n, ribbonGlow, cellSize) {
  if (!trail || !trail.length) return null;
  const start = Math.max(0, trail.length - n - 1);
  let xMin = Infinity,
    yMin = Infinity,
    xMax = -Infinity,
    yMax = -Infinity;
  for (let i = start; i < trail.length; i++) {
    const seg = trail[i];
    const col = Array.isArray(seg) ? seg[0] : seg.x || seg.col || seg.c || 0;
    const row = Array.isArray(seg) ? seg[1] : seg.y || seg.row || seg.r || 0;
    const [cx, cy] = cellCenter(col, row, cellSize);
    if (cx < xMin) xMin = cx;
    if (cy < yMin) yMin = cy;
    if (cx > xMax) xMax = cx;
    if (cy > yMax) yMax = cy;
  }
  if (!isFinite(xMin)) return null;
  const m = Math.max(8, ribbonGlow * 2);
  return [
    Math.floor(xMin - m),
    Math.floor(yMin - m),
    Math.ceil(xMax - xMin + m * 2),
    Math.ceil(yMax - yMin + m * 2)
  ];
}
export function unionAABB(a, b) {
  if (!a) return b;
  if (!b) return a;
  const x1 = Math.min(a[0], b[0]);
  const y1 = Math.min(a[1], b[1]);
  const x2 = Math.max(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.max(a[1] + a[3], b[1] + b[3]);
  return [x1, y1, x2 - x1, y2 - y1];
}
export function minDist2Moving(ax0, ay0, ax1, ay1, bx0, by0, bx1, by1) {
  const r0x = ax0 - bx0;
  const r0y = ay0 - by0;
  const dvx = (ax1 - ax0) - (bx1 - bx0);
  const dvy = (ay1 - ay0) - (by1 - by0);
  const den = dvx * dvx + dvy * dvy;
  if (den < 1e-9) {
    const enddx = ax1 - bx1;
    const enddy = ay1 - by1;
    const d0 = r0x * r0x + r0y * r0y;
    const d1 = enddx * enddx + enddy * enddy;
    return d0 < d1 ? d0 : d1;
  }
  let t = -(r0x * dvx + r0y * dvy) / den;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const dx = r0x + dvx * t;
  const dy = r0y + dvy * t;
  return dx * dx + dy * dy;
}
export function mapCorridorToIntensity(len) {
  const clamped = len < 0 ? 0 : len > 12 ? 12 : len;
  return 0.55 + (clamped / 12) * 0.40;
}
export function isOpposite(a, b) {
  return (
    (a === 'up' && b === 'down') ||
    (a === 'down' && b === 'up') ||
    (a === 'left' && b === 'right') ||
    (a === 'right' && b === 'left')
  );
}
export function corridorAhead(grid, x, y, dir) {
  const deltas = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
  const d = deltas[dir] || [0, 0];
  const coll = _collisions || {};
  const outB = (typeof coll.outOfBounds === 'function')
    ? coll.outOfBounds
    : (cx, cy) => {
        const rows = Array.isArray(grid) ? grid.length : 0;
        const cols = rows && Array.isArray(grid[0]) ? grid[0].length : 0;
        return cy < 0 || cy >= rows || cx < 0 || cx >= cols;
      };
  const isOcc = (typeof coll.isOccupied === 'function')
    ? ((g, cx, cy) => coll.isOccupied(g, cx, cy))
    : (g, cx, cy) => {
        const row = Array.isArray(g) ? g[cy] : undefined;
        return !!(row && row[cx]);
      };
  let n = 0;
  let cx = x;
  let cy = y;
  while (true) {
    cx += d[0];
    cy += d[1];
    if (outB(cx, cy) || isOcc(grid, cx, cy)) break;
    n++;
    if (n > 20) break;
  }
  return n;
}
export function turnSide(prev, now) {
  if (now === prev) return 'straight';
  const dirs = ['up', 'right', 'down', 'left'];
  return (now === dirs[(dirs.indexOf(prev) + 3) % 4]) ? 'left' : 'right';
}
