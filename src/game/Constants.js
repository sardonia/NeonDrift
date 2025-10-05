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
export const DIR_DELTAS = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0]
};
export const MAX_SUBSTEPS = 4;
export function computeEnemySpeed(level) {
  // Adjust enemy speed to scale by a fixed percentage each round.
  // Previously, the enemy speed increased linearly with the level which
  // equated to a fixed additive increase each level.  This caused the enemy
  // to remain roughly 60% of the player's speed for most of the game, rather
  // than accelerating by a constant percentage per level.
  //
  // To ensure the enemy speed scales by a constant *percentage* each round,
  // multiply the starting ratio (60% of the player's speed) by a growth
  // factor of 1.05 for every level beyond the first.  This yields an enemy
  // that gains 5% additional speed each level while remaining capped at the
  // player's base speed.
  const lvl = Math.max(1, Math.min(MAX_LEVEL, level | 0));
  const startRatio = 0.60;
  const growthPerLevel = 0.05;
  const steps = Math.max(0, lvl - 1);
  const growthFactor = 1 + growthPerLevel;
  // Compute the ratio for the given level.  Clamp to a maximum of 1.0 to
  // avoid exceeding the player's speed at extremely high levels.
  const ratio = Math.min(1.0, startRatio * Math.pow(growthFactor, steps));
  return PLAYER_BASE_SPEED * ratio;
}
