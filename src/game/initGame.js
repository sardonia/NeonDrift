import * as C from './Constants.js';
import { initPaths, buildPathCaches } from './render/paths.js';
import { initSprites, rebuildTrailSprites, rebuildCycleSprites } from './render/sprites.js';
import { initWalls, rebuildWallFrames, drawGlowLineTo, drawNeonWallsTo } from './render/walls.js';
import { initWallsGlow, drawWallsGlow } from './render/wallsGlow.js';
import { drawBackground as __bg_draw, drawBackgroundImpl, initBackground } from './render/background.js';
import { neonStroke, drawHaloRing } from './render/neon.js';
import { drawAccelGlyph } from './render/fx.js';
import {
  PLAYER_CORE,
  PLAYER_GLOW,
  ENEMY_CORE,
  ENEMY_GLOW,
  WALL_CORE,
  WALL_GLOW,
  ACCEL_CORE,
  ACCEL_GLOW
} from './ui/theme.js';
import { cellCenter as _cellCenter } from './utils.js';
export function initGame({ board, trails, fx, wallsGlow, ctx, theme } = {}) {
  if (!board || !ctx) {
    return;
  }
  const {
    CELL,
    SCALE,
    RIBBON_CORE,
    RIBBON_GLOW,
    COLS,
    ROWS,
    CYCLE_LEN,
    CYCLE_THK
  } = C;
  const getThemeProp = theme && typeof theme.get === 'function'
    ? (prop) => {
        try { return theme.get(prop); } catch (_e) { return ''; }
      }
    : (_prop) => '';
  const PLAYER_CORE_VAL = getThemeProp('--player-core') || PLAYER_CORE;
  const PLAYER_GLOW_VAL = getThemeProp('--player-glow') || PLAYER_GLOW || PLAYER_CORE_VAL;
  const ENEMY_CORE_VAL  = getThemeProp('--enemy-core')  || ENEMY_CORE  || PLAYER_CORE_VAL;
  const ENEMY_GLOW_VAL  = getThemeProp('--enemy-glow')  || ENEMY_GLOW  || ENEMY_CORE_VAL;
  const WALL_CORE_VAL   = getThemeProp('--wall-core')   || WALL_CORE   || PLAYER_CORE_VAL;
  const WALL_GLOW_VAL   = getThemeProp('--wall-glow')   || WALL_GLOW   || WALL_CORE_VAL;
  const ACCEL_CORE_VAL  = getThemeProp('--accent2')      || ACCEL_CORE;
  const ACCEL_GLOW_VAL  = ACCEL_GLOW || ACCEL_CORE_VAL;
  try {
    const bg_bind = {};
    const bg_consts = {};
    bg_consts.WALL_CORE = WALL_CORE_VAL;
    bg_consts.CELL = CELL;
    bg_consts.COLS = COLS;
    bg_consts.ROWS = ROWS;
    bg_consts.SCALE = SCALE;
    bg_bind.consts = bg_consts;
    bg_bind.ctx = ctx;
    try { bg_bind.canvas = board; } catch (_e) {}
    bg_bind.draw = drawBackgroundImpl;
    initBackground(bg_bind);
  } catch (_e) {
  }
  try {
    buildPathCaches({ board, CELL });
  } catch (_e) {
  }
  try {
    const paths_bind = {};
    const paths_consts = {};
    paths_consts.CELL = CELL;
    paths_consts.RIBBON_CORE = RIBBON_CORE;
    paths_consts.RIBBON_GLOW = RIBBON_GLOW;
    paths_bind.consts = paths_consts;
    paths_bind.ctx = ctx;
    const paths_helpers = {};
    paths_helpers.neonStroke = neonStroke;
    paths_helpers.cellCenter = function(col, row) { return _cellCenter(col, row, CELL); };
    paths_helpers.drawHaloRing = drawHaloRing;
    paths_helpers.drawAccelGlyph = drawAccelGlyph;
    paths_bind.helpers = paths_helpers;
    initPaths(paths_bind);
  } catch (_e) {
  }
  try {
    const wg_bind = {};
    const wg_consts = {};
    wg_consts.CELL = CELL;
    wg_consts.WALL_CORE = WALL_CORE_VAL;
    wg_consts.WALL_GLOW = WALL_GLOW_VAL;
    wg_bind.consts = wg_consts;
    if (wallsGlow && typeof wallsGlow.getContext === 'function') {
      wg_bind.ctx = wallsGlow.getContext('2d');
      try { wg_bind.canvas = wallsGlow; } catch (_e) {}
    }
    const wg_helpers = {};
    wg_helpers.neonStroke = neonStroke;
    wg_helpers.drawGlowLineTo = drawGlowLineTo;
    wg_helpers.drawNeonWallsTo = drawNeonWallsTo;
    wg_bind.helpers = wg_helpers;
    initWallsGlow(wg_bind);
  } catch (_e) {
  }
  try {
    initSprites({
      CELL,
      SCALE,
      PLAYER_CORE: PLAYER_CORE_VAL,
      PLAYER_GLOW: PLAYER_GLOW_VAL,
      ENEMY_CORE: ENEMY_CORE_VAL,
      ENEMY_GLOW: ENEMY_GLOW_VAL,
      RIBBON_CORE,
      RIBBON_GLOW,
      ACCEL_CORE: ACCEL_CORE_VAL,
      ACCEL_GLOW: ACCEL_GLOW_VAL,
      CYCLE_LEN,
      CYCLE_THK
    });
    try { rebuildTrailSprites(); } catch (_e) {}
    try { rebuildCycleSprites(); } catch (_e) {}
  } catch (_e) {
  }
  try {
    initWalls({ board, wallsGlow, CELL, WALL_CORE: WALL_CORE_VAL, WALL_GLOW: WALL_GLOW_VAL, neonStroke: neonStroke, SCALE });
  } catch (_e) {
  }
  try {
    rebuildWallFrames(24);
  } catch (_e) {
  }
  try {
    if (typeof __bg_draw === 'function') {
      __bg_draw();
    }
    if (typeof drawWallsGlow === 'function') {
      drawWallsGlow(performance.now() / 1000);
    }
  } catch (_e) {
  }
}
