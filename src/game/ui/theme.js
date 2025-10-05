import { getService, TOKENS } from '../services/index.js';
export function getCSS(prop) {
  try {
    const themeSvc = typeof getService === 'function' ? getService(TOKENS.THEME) : undefined;
    if (themeSvc && typeof themeSvc.get === 'function') {
      const val = themeSvc.get(prop);
      if (val) return String(val).trim();
    }
  } catch (_) {}
  try {
    if (typeof window !== 'undefined' && window.getComputedStyle) {
      const root = document.documentElement;
      return getComputedStyle(root).getPropertyValue(prop).trim();
    }
  } catch (_) {}
  return '';
}
export const PLAYER_CORE  = getCSS('--player-core') || '#ffffff';
export const PLAYER_GLOW  = getCSS('--player-glow') || PLAYER_CORE;
export const ENEMY_CORE   = getCSS('--enemy-core')  || PLAYER_CORE;
export const ENEMY_GLOW   = getCSS('--enemy-glow')  || ENEMY_CORE;
export const WALL_CORE    = getCSS('--wall-core') || PLAYER_CORE;
export const WALL_GLOW    = getCSS('--wall-glow') || WALL_CORE;
export const PLAYER_CYCLE_CORE = getCSS('--player-cycle-core') || PLAYER_CORE;
export const PLAYER_CYCLE_GLOW = getCSS('--player-cycle-glow') || PLAYER_GLOW;
export const ENEMY_CYCLE_CORE  = getCSS('--enemy-cycle-core')  || ENEMY_CORE;
export const ENEMY_CYCLE_GLOW  = getCSS('--enemy-cycle-glow')  || ENEMY_GLOW;
export const ACCEL_CORE = getCSS('--accent2') || '#ffb36a';
export const ACCEL_GLOW = ACCEL_CORE;
