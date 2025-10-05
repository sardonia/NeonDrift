import { drawFrame } from '../renderer.js';
import { initGame } from '../initGame.js';
import { initPowerups, spawnPowerUpImpl, drawPowerUpImpl, collectPowerUpImpl } from '../powerups.js';
import { drawTrailSegment as drawTrailSegmentSprite } from '../render/sprites.js';
import { drawAccelGlyph } from '../render/fx.js';
import { drawHaloRing } from '../render/neon.js';
import { cellCenter as baseCellCenter } from '../utils.js';
import { rebuildPulsePaths } from '../render/pulsePaths.js';
import { createSharedFrameStateReader } from '../core/sharedFrameState.js';

const state = {
  canvases: {
    board: null,
    trails: null,
    fx: null,
    wallsGlow: null
  },
  contexts: {
    board: null,
    trails: null,
    fx: null,
    wallsGlow: null
  },
  colors: {
    playerCore: '#ffffff',
    playerGlow: '#ffffff',
    enemyCore: '#ff0033',
    enemyGlow: '#ff99a8',
    playerCycleCore: '#ffffff',
    playerCycleGlow: '#ffffff',
    enemyCycleCore: '#ff0033',
    enemyCycleGlow: '#ff99a8'
  },
  constants: {
    CELL: 32,
    COLS: 32,
    ROWS: 24,
    SCALE: 1,
    ACCEL_CORE: '#ffb36a',
    ACCEL_GLOW: '#ffb36a'
  },
  pulseSpan: 0,
  trails: {
    player: [],
    enemy: []
  },
  powerUp: null,
  gameState: {
    player: { x: 0, y: 0, dir: 'right', vx: 0, vy: 0, progress: 0, speed: 0 },
    enemy: { x: 0, y: 0, dir: 'left', vx: 0, vy: 0, progress: 0, speed: 0 },
    powerUp: null,
    score: 0,
    level: 1,
    tick: 0,
    playerProgress: 0,
    enemyProgress: 0,
    boostActive: false,
    paused: true,
    centered: false,
    duration: 0,
    flags: 0,
    timestamp: 0,
    hudScorePending: 0,
    hudScoreCooldown: 0,
    hudScoreLastBroadcast: 0
  },
  engineContext: {
    render: {}
  },
  ready: false
};

let sharedFrameReader = null;
const sharedFrameScratch = {
  player: { x: 0, y: 0, dir: 'right', vx: 0, vy: 0, progress: 0, speed: 0 },
  enemy: { x: 0, y: 0, dir: 'left', vx: 0, vy: 0, progress: 0, speed: 0 },
  powerUp: null,
  score: 0,
  level: 1,
  duration: 0,
  tick: 0,
  flags: 0,
  paused: false,
  centered: false,
  boostActive: false,
  timestamp: 0,
  hud: { scorePending: 0, scoreCooldown: 0, scoreLastBroadcast: 0 }
};

function cloneTrail(trail) {
  if (!Array.isArray(trail)) {
    return [];
  }
  const result = [];
  for (const point of trail) {
    if (!point) continue;
    if (Array.isArray(point)) {
      const x = Number(point[0]);
      const y = Number(point[1]);
      result.push([Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0]);
    } else if (typeof point === 'object') {
      const x = Number(point.x ?? point.col ?? point.c ?? 0);
      const y = Number(point.y ?? point.row ?? point.r ?? 0);
      result.push([Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0]);
    }
  }
  return result;
}

function ensureHelpers(cellSize) {
  const size = Number(cellSize) > 0 ? Number(cellSize) : 1;
  return {
    ctx: state.contexts.board,
    cellCenter: (col, row) => baseCellCenter(col, row, size),
    drawAccelGlyph,
    drawHaloRing,
    getPowerUp: () => state.powerUp,
    setPowerUp: (pu) => {
      state.powerUp = pu;
    },
    clearPowerUp: () => {
      state.powerUp = null;
    },
    updatePowerUpsUI: () => {},
    powerBagPush: () => {},
    incScore: () => {},
    playPowerupSplash: () => {},
    getGrid: () => null,
    getPlayer: () => state.gameState.player,
    getEnemy: () => state.gameState.enemy,
    isOccupied: () => true,
    rng: Math.random
  };
}

function applyTheme(themeMap = {}) {
  return {
    get(prop) {
      if (!prop) return '';
      const value = themeMap[prop];
      return typeof value === 'string' ? value : '';
    }
  };
}

function setColors(colors = {}) {
  const resolved = state.colors;
  if (typeof colors.playerCore === 'string') resolved.playerCore = colors.playerCore;
  if (typeof colors.playerGlow === 'string') resolved.playerGlow = colors.playerGlow;
  if (typeof colors.enemyCore === 'string') resolved.enemyCore = colors.enemyCore;
  if (typeof colors.enemyGlow === 'string') resolved.enemyGlow = colors.enemyGlow;
  if (typeof colors.playerCycleCore === 'string') resolved.playerCycleCore = colors.playerCycleCore;
  if (typeof colors.playerCycleGlow === 'string') resolved.playerCycleGlow = colors.playerCycleGlow;
  if (typeof colors.enemyCycleCore === 'string') resolved.enemyCycleCore = colors.enemyCycleCore;
  if (typeof colors.enemyCycleGlow === 'string') resolved.enemyCycleGlow = colors.enemyCycleGlow;
}

function setConstants(constants = {}) {
  const target = state.constants;
  const keys = ['CELL', 'COLS', 'ROWS', 'SCALE', 'ACCEL_CORE', 'ACCEL_GLOW'];
  for (const key of keys) {
    if (constants[key] != null) {
      target[key] = constants[key];
    }
  }
}

function resetTrailCanvas(ctx, canvas) {
  if (!ctx || !canvas) return;
  try {
    const width = typeof canvas.width === 'number' ? canvas.width : (canvas.bitmapWidth || 0);
    const height = typeof canvas.height === 'number' ? canvas.height : (canvas.bitmapHeight || 0);
    if (width > 0 && height > 0) {
      ctx.clearRect(0, 0, width, height);
    }
  } catch (_) {}
}

function drawTrailSequence(role, trail) {
  if (!Array.isArray(trail) || trail.length < 2) {
    return;
  }
  const ctx = state.contexts.trails;
  if (!ctx) {
    return;
  }
  const colors = state.colors;
  const core = role === 'enemy' ? colors.enemyCore : colors.playerCore;
  const glow = role === 'enemy' ? colors.enemyGlow : colors.playerGlow;
  for (let i = 0; i < trail.length - 1; i++) {
    const [x0, y0] = trail[i];
    const [x1, y1] = trail[i + 1];
    try {
      drawTrailSegmentSprite(ctx, x0, y0, x1, y1, core, glow);
    } catch (_) {}
  }
}

function syncTrails(trails = {}, { clear = false } = {}) {
  const player = cloneTrail(trails.player);
  const enemy = cloneTrail(trails.enemy);
  state.trails.player = player;
  state.trails.enemy = enemy;
  if (clear) {
    resetTrailCanvas(state.contexts.trails, state.canvases.trails);
  }
  drawTrailSequence('player', player);
  drawTrailSequence('enemy', enemy);
}

function ensureEngineRenderRef() {
  const engine = state.engineContext;
  if (!engine.render) {
    engine.render = {};
  }
  engine.render.trails = state.canvases.trails;
}

function handleInit(payload = {}) {
  state.ready = false;
  if (payload.frameStateBuffer && typeof payload.frameStateBuffer.byteLength === 'number') {
    try {
      sharedFrameReader = createSharedFrameStateReader(payload.frameStateBuffer);
    } catch (_) {
      sharedFrameReader = null;
    }
  } else {
    sharedFrameReader = null;
  }
  const { canvases = {}, colors, pulseSpan, trails, constants, theme } = payload;
  state.canvases.board = canvases.board || null;
  state.canvases.trails = canvases.trails || null;
  state.canvases.fx = canvases.fx || null;
  state.canvases.wallsGlow = canvases.wallsGlow || null;
  state.contexts.board = state.canvases.board ? state.canvases.board.getContext('2d') : null;
  state.contexts.trails = state.canvases.trails ? state.canvases.trails.getContext('2d') : null;
  state.contexts.fx = state.canvases.fx ? state.canvases.fx.getContext('2d') : null;
  state.contexts.wallsGlow = state.canvases.wallsGlow ? state.canvases.wallsGlow.getContext('2d') : null;
  setColors(colors || {});
  setConstants(constants || {});
  state.pulseSpan = Number.isFinite(pulseSpan) ? pulseSpan : state.pulseSpan;
  try {
    initGame({
      board: state.canvases.board,
      trails: state.canvases.trails,
      fx: state.canvases.fx,
      wallsGlow: state.canvases.wallsGlow,
      ctx: state.contexts.board,
      theme: applyTheme(theme || {})
    });
  } catch (_) {}
  try {
    const helpers = ensureHelpers(state.constants.CELL);
    initPowerups({
      consts: {
        ACCEL_CORE: state.constants.ACCEL_CORE,
        ACCEL_GLOW: state.constants.ACCEL_GLOW,
        CELL: state.constants.CELL,
        COLS: state.constants.COLS,
        ROWS: state.constants.ROWS,
        SCALE: state.constants.SCALE
      },
      helpers,
      drawPowerUp: drawPowerUpImpl,
      spawnPowerUp: spawnPowerUpImpl,
      collectPowerUp: collectPowerUpImpl
    });
  } catch (_) {}
  syncTrails(trails || {}, { clear: true });
  ensureEngineRenderRef();
  state.ready = true;
  self.postMessage({ type: 'ready' });
}

function updateGameState(snapshot = {}) {
  const player = snapshot.player || {};
  const enemy = snapshot.enemy || {};
  state.gameState.player = {
    x: Number.isFinite(player.x) ? player.x : 0,
    y: Number.isFinite(player.y) ? player.y : 0,
    dir: typeof player.dir === 'string' ? player.dir : 'right',
    vx: Number.isFinite(player.vx) ? player.vx : 0,
    vy: Number.isFinite(player.vy) ? player.vy : 0,
    progress: Number.isFinite(player.progress) ? player.progress : 0,
    speed: Number.isFinite(player.speed) ? player.speed : 0
  };
  state.gameState.enemy = {
    x: Number.isFinite(enemy.x) ? enemy.x : 0,
    y: Number.isFinite(enemy.y) ? enemy.y : 0,
    dir: typeof enemy.dir === 'string' ? enemy.dir : 'left',
    vx: Number.isFinite(enemy.vx) ? enemy.vx : 0,
    vy: Number.isFinite(enemy.vy) ? enemy.vy : 0,
    progress: Number.isFinite(enemy.progress) ? enemy.progress : 0,
    speed: Number.isFinite(enemy.speed) ? enemy.speed : 0
  };
  const pu = (snapshot.powerUp && typeof snapshot.powerUp === 'object') ? snapshot.powerUp : null;
  if (pu) {
    state.powerUp = {
      x: Number.isFinite(pu.x) ? pu.x : 0,
      y: Number.isFinite(pu.y) ? pu.y : 0,
      kind: typeof pu.kind === 'string' ? pu.kind : 'accel'
    };
  } else {
    state.powerUp = null;
  }
  state.gameState.powerUp = state.powerUp;
  const score = Number(snapshot.score);
  if (Number.isFinite(score)) state.gameState.score = score;
  const level = Number(snapshot.level);
  if (Number.isFinite(level)) state.gameState.level = level;
  const tick = Number(snapshot.tick);
  if (Number.isFinite(tick)) state.gameState.tick = tick;
  const playerProgress = Number(snapshot.playerProgress);
  if (Number.isFinite(playerProgress)) state.gameState.playerProgress = playerProgress;
  const enemyProgress = Number(snapshot.enemyProgress);
  if (Number.isFinite(enemyProgress)) state.gameState.enemyProgress = enemyProgress;
  if (typeof snapshot.boostActive === 'boolean') state.gameState.boostActive = snapshot.boostActive;
  if (typeof snapshot.paused === 'boolean') state.gameState.paused = snapshot.paused;
  if (typeof snapshot.centered === 'boolean') state.gameState.centered = snapshot.centered;
  const duration = Number(snapshot.duration);
  if (Number.isFinite(duration)) state.gameState.duration = duration;
  const flags = Number(snapshot.flags);
  if (Number.isFinite(flags)) state.gameState.flags = flags;
  const timestamp = Number(snapshot.timestamp);
  if (Number.isFinite(timestamp)) state.gameState.timestamp = timestamp;
  const hudPending = Number(snapshot.hudScorePending ?? (snapshot.hud && snapshot.hud.scorePending));
  if (Number.isFinite(hudPending)) state.gameState.hudScorePending = hudPending;
  const hudCooldown = Number(snapshot.hudScoreCooldown ?? (snapshot.hud && snapshot.hud.scoreCooldown));
  if (Number.isFinite(hudCooldown)) state.gameState.hudScoreCooldown = hudCooldown;
  const hudLast = Number(snapshot.hudScoreLastBroadcast ?? (snapshot.hud && snapshot.hud.scoreLastBroadcast));
  if (Number.isFinite(hudLast)) state.gameState.hudScoreLastBroadcast = hudLast;
}

function handleFrame(payload = {}) {
  if (!state.ready) return;
  let snapshot = payload.state || {};
  if (sharedFrameReader) {
    try {
      if (typeof payload.index === 'number') {
        const frame = sharedFrameReader.readFrame(payload.index, sharedFrameScratch);
        if (frame) {
          snapshot = frame;
        }
      } else {
        const frame = sharedFrameReader.readLatest(sharedFrameScratch);
        if (frame) {
          snapshot = frame;
        }
      }
    } catch (_) {
      // ignore frame read errors and fall back to payload state
    }
  }
  updateGameState(snapshot || {});
  const pulses = rebuildPulsePaths(state.trails.player, state.trails.enemy, state.pulseSpan);
  state.engineContext.pulseP = pulses ? pulses.pulseP : null;
  state.engineContext.pulseE = pulses ? pulses.pulseE : null;
  ensureEngineRenderRef();
  try {
    drawFrame({
      ctx: state.contexts.board,
      pctx: state.contexts.fx,
      fx: state.canvases.fx,
      gameState: {
        ...state.gameState,
        trailPlayer: state.trails.player,
        trailEnemy: state.trails.enemy
      },
      engineContext: state.engineContext,
      PLAYER_CYCLE_CORE: state.colors.playerCycleCore,
      PLAYER_CYCLE_GLOW: state.colors.playerCycleGlow,
      ENEMY_CYCLE_CORE: state.colors.enemyCycleCore,
      ENEMY_CYCLE_GLOW: state.colors.enemyCycleGlow,
      trailPlayer: state.trails.player,
      trailEnemy: state.trails.enemy,
      PULSE_SPAN: state.pulseSpan
    });
  } catch (error) {
    self.postMessage({ type: 'error', error: error?.message ? { message: error.message } : {} });
  }
}

function handleTrailSegment(payload = {}) {
  if (!state.ready) return;
  const ctx = state.contexts.trails;
  if (!ctx) return;
  const role = payload.role === 'enemy' ? 'enemy' : 'player';
  const from = Array.isArray(payload.from) ? payload.from : [payload.x0, payload.y0];
  const to = Array.isArray(payload.to) ? payload.to : [payload.x1, payload.y1];
  const [x0, y0] = from || [0, 0];
  const [x1, y1] = to || [0, 0];
  const core = typeof payload.core === 'string'
    ? payload.core
    : (role === 'enemy' ? state.colors.enemyCore : state.colors.playerCore);
  const glow = typeof payload.glow === 'string'
    ? payload.glow
    : (role === 'enemy' ? state.colors.enemyGlow : state.colors.playerGlow);
  try {
    drawTrailSegmentSprite(ctx, x0, y0, x1, y1, core, glow);
  } catch (_) {}
  const store = role === 'enemy' ? state.trails.enemy : state.trails.player;
  if (store.length === 0) {
    store.push([x0, y0]);
  }
  const last = store[store.length - 1] || [];
  if (last[0] !== x1 || last[1] !== y1) {
    store.push([x1, y1]);
  }
}

function handleSyncTrails(payload = {}) {
  if (!state.ready) return;
  const opts = { clear: payload.clear !== false };
  syncTrails({
    player: payload.player,
    enemy: payload.enemy
  }, opts);
}

function handlePulseSpan(payload = {}) {
  if (payload && Number.isFinite(payload.value)) {
    state.pulseSpan = payload.value;
  }
}

function handleColors(payload = {}) {
  setColors(payload);
}

self.addEventListener('message', (event) => {
  const data = event && event.data;
  if (!data || typeof data !== 'object') {
    return;
  }
  switch (data.type) {
    case 'init':
      handleInit(data.payload || {});
      break;
    case 'frame':
      handleFrame(data.payload || {});
      break;
    case 'trailSegment':
      handleTrailSegment(data.payload || {});
      break;
    case 'syncTrails':
      handleSyncTrails(data.payload || {});
      break;
    case 'pulseSpan':
      handlePulseSpan(data.payload || {});
      break;
    case 'colors':
      handleColors(data.payload || {});
      break;
    case 'dispose':
      state.ready = false;
      break;
    default:
      break;
  }
});
