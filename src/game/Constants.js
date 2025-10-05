export const COLS = 48, ROWS = 36, CELL = 20;
export const MAX_LEVEL = 10;
export const RIBBON_CORE = 3;
export const RIBBON_GLOW = 10;
export const PULSE_SPAN = 24;
export const PULSE_RATE = 0.7;
export const SCALE = 0.5;
// Simulation timings retain the legacy 40ms reference tick for balance.
export const REFERENCE_TICK_MS = 40;
// Keep exporting TICK_MS for debug surfaces; it now mirrors the reference step.
export const TICK_MS = REFERENCE_TICK_MS;
const PLAYER_BASE_SPEED_BASE = 0.5; // per reference tick
const BOOST_MULT_BASE = 0.65; // per reference tick
export const PLAYER_BASE_SPEED = PLAYER_BASE_SPEED_BASE;
export const HEAD_HIT_RADIUS = CELL * 0.02;
export const CYCLE_LEN = CELL * 2.8;
export const CYCLE_THK = Math.max(6, CELL * 0.60);
export const BOOST_MULT = BOOST_MULT_BASE;
export const STARTING_LEVEL = 1;
export const PLAYER_ENGINE_INTENSITY_BASE = 0.55 + (12 / 12) * 0.40;
export const ENEMY_ENGINE_INTENSITY_BASE  = PLAYER_ENGINE_INTENSITY_BASE * 0.96;
export const ENEMY_SPEED_START_RATIO = 0.60;
export const ENEMY_SPEED_GROWTH_PER_LEVEL = 0.05;
export const ENEMY_SPEED_MAX_RATIO = 1.0;
export const DIR_DELTAS = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0]
};
export const MAX_SUBSTEPS = 4;
// Precompute the multiplicative 5% growth curve so every consumer shares the same table.
const ENEMY_SPEED_RATIO_TABLE = (() => {
  const table = new Array(MAX_LEVEL);
  const startRatio = (typeof ENEMY_SPEED_START_RATIO === 'number' && ENEMY_SPEED_START_RATIO > 0)
    ? ENEMY_SPEED_START_RATIO
    : 0.60;
  const growthPerLevel = (typeof ENEMY_SPEED_GROWTH_PER_LEVEL === 'number')
    ? ENEMY_SPEED_GROWTH_PER_LEVEL
    : 0.05;
  const growthFactorRaw = 1 + growthPerLevel;
  const growthFactor = (Number.isFinite(growthFactorRaw) && growthFactorRaw > 0)
    ? growthFactorRaw
    : 1.05;
  const maxRatio = (typeof ENEMY_SPEED_MAX_RATIO === 'number' && ENEMY_SPEED_MAX_RATIO > 0)
    ? ENEMY_SPEED_MAX_RATIO
    : 1.0;
  for (let i = 0; i < MAX_LEVEL; i += 1) {
    const steps = Math.max(0, i);
    let ratio = startRatio;
    if (steps > 0) {
      const scaled = startRatio * (growthFactor ** steps);
      ratio = Number.isFinite(scaled) && scaled > 0 ? scaled : startRatio;
    }
    const clamped = Math.min(maxRatio, ratio);
    table[i] = Number.isFinite(clamped) && clamped > 0 ? clamped : startRatio;
  }
  return Object.freeze(table);
})();

export const ENEMY_SPEED_RATIOS = ENEMY_SPEED_RATIO_TABLE;

function normalizeLevel(level) {
  const numericLevel = Number(level);
  if (!Number.isFinite(numericLevel)) {
    return 1;
  }
  const floored = Math.floor(numericLevel);
  if (!Number.isFinite(floored)) {
    return 1;
  }
  return Math.max(1, Math.min(MAX_LEVEL, floored));
}

export function computeEnemySpeedRatio(level) {
  const lvl = normalizeLevel(level);
  const ratio = ENEMY_SPEED_RATIO_TABLE[lvl - 1];
  return Number.isFinite(ratio) ? ratio : ENEMY_SPEED_START_RATIO;
}

// Return the enemy speed for the provided level as an absolute value, allowing
// optional overrides of the base player speed for simulations.
export function computeEnemySpeed(level, playerBaseSpeed = PLAYER_BASE_SPEED) {
  const base = Number(playerBaseSpeed);
  const baseSpeed = Number.isFinite(base) && base > 0 ? base : PLAYER_BASE_SPEED;
  const ratio = computeEnemySpeedRatio(level);
  return baseSpeed * ratio;
}
