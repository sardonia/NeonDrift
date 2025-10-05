let __impl = {
  spawnPowerUp: null,
  drawPowerUp: null,
  collectPowerUp: null,
  consts: undefined,
  helpers: undefined
};
export function initPowerups(bindings = {}) {
  __impl = { ...__impl, ...bindings };
  if (!__impl.consts) __impl.consts = {};
  if (!__impl.helpers) __impl.helpers = {};
}
export function spawnPowerUp(){
  if (__impl.spawnPowerUp) return __impl.spawnPowerUp();
  return undefined;
}
export function drawPowerUp(t){
  if (__impl.drawPowerUp) return __impl.drawPowerUp(t);
  return undefined;
}
export function collectPowerUp(pu){
  if (__impl.collectPowerUp) return __impl.collectPowerUp(pu);
  return undefined;
}
export const P = {
  get consts() {
    return __impl.consts || {};
  },
  get helpers() {
    return __impl.helpers || {};
  },
};
export function computeSpawnCandidate(grid, player, enemy, isOccupied){
  const { COLS, ROWS } = P.consts;
  const helpers = P.helpers || {};
  const rngFn = (helpers && typeof helpers.rng === 'function') ? helpers.rng : Math.random;
  for (let tries = 0; tries < 400; tries++) {
    const x = Math.floor(rngFn() * COLS);
    const y = Math.floor(rngFn() * ROWS);
    if (!isOccupied(grid, x, y) &&
        !(player && x === player.x && y === player.y) &&
        !(enemy && x === enemy.x && y === enemy.y)) {
      return { x, y, kind: 'accel' };
    }
  }
  return null;
}
export function drawPowerUpImpl(t){
  const { ACCEL_CORE, ACCEL_GLOW, CELL } = P.consts;
  const H = (__impl.helpers || {});
  const pu = H.getPowerUp ? H.getPowerUp() : null;
  if(!pu) return;
  const [cx, cy] = H.cellCenter(pu.x, pu.y);
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.6);
  const ringR = CELL * (0.55 + 0.05 * Math.sin(t * 3.2));
  const ringW = Math.max(2, CELL * 0.20);
  H.drawHaloRing(H.ctx, cx, cy, ringR, ringW, ACCEL_CORE, ACCEL_GLOW);
  H.drawAccelGlyph(H.ctx, cx, cy, t, ACCEL_CORE, ACCEL_GLOW);
}
export function collectPowerUpImpl(pu) {
  const H = (__impl.helpers || {});
  try {
    if (H.powerBagPush) H.powerBagPush(pu && pu.kind);
    if (H.updatePowerUpsUI) H.updatePowerUpsUI();
    try {
      if (H.playPowerupSplash) H.playPowerupSplash();
      try {
        if (H.incScore) H.incScore(300);
      } catch(_e) {}
    } catch(_e) {}
  } catch(_e) {}
  try {
    if (H.clearPowerUp) {
      H.clearPowerUp();
    } else if (H.setPowerUp) {
      H.setPowerUp(null);
    }
  } catch(_e) {}
}
export function resetPowerBag(bag, opts = {}, listEl){
  try { bag.length = 0; } catch {}
  if (opts && opts.clearPickup) {
  }
  try { if (listEl) listEl.innerHTML = ''; } catch {}
  return null;
}
export function spawnPowerUpImpl() {
  const H = __impl.helpers || {};
  try {
    const grid   = H.getGrid    ? H.getGrid()    : null;
    const player = H.getPlayer  ? H.getPlayer()  : null;
    const enemy  = H.getEnemy   ? H.getEnemy()   : null;
    const occFn  = H.isOccupied || ((g, x, y) => true);
    const candidate = computeSpawnCandidate(grid, player, enemy, occFn);
    if (candidate && H.setPowerUp) {
      H.setPowerUp(candidate);
    }
  } catch (_e) {
  }
}
