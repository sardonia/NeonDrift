import { runTick } from './tickHandler.js';
import { isOpposite } from '../utils.js';
import { collectPowerUp } from '../powerups.js';
import * as C from '../Constants.js';
import { detectDeaths } from './collisionHandlers.js';
import { commitMoves } from './commitMoves.js';
import { rebuildPulsePaths } from '../render/pulsePaths.js';
import { clearFXSmart } from '../render/fx.js';
import { drawCycle as _drawCycle } from '../render/sprites.js';
import { drawPowerUp } from '../powerups.js';
import { handleCrashOutcome } from './crashHandlers.js';
import debugState from '../debug/debugController.js';
function updateProgress(state, delta) {
  if (!state) return;
  const scale = Number.isFinite(delta) ? delta : 1;
  if (scale <= 0) {
    return;
  }
  let playerProgress = state.playerProgress || 0;
  let enemyProgress = state.enemyProgress || 0;
  const boostActive = state.boostActive || false;
  const PLAYER_BASE_SPEED = C.PLAYER_BASE_SPEED;
  const BOOST_MULT = C.BOOST_MULT;
  const currentLevel = typeof state.level === 'number' ? state.level : C.STARTING_LEVEL;
  // Determine the enemy speed from the current level.  Always derive the
  // speed using the constants service to avoid stale values lingering in
  // state.  This ensures that as soon as the level changes, the enemy
  // acceleration reflects the new level without relying on external
  // orchestrator updates.  Should the constants service be unavailable,
  // fall back to the shared multiplicative ratio computation.
  const computeFallbackEnemySpeed = (level) => {
    if (typeof C.computeEnemySpeedRatio === 'function') {
      try {
        const ratio = C.computeEnemySpeedRatio(level);
        if (Number.isFinite(ratio)) {
          return PLAYER_BASE_SPEED * ratio;
        }
      } catch (_) {}
    }

    const lvl = (() => {
      const maxLevel = typeof C.MAX_LEVEL === 'number' && C.MAX_LEVEL > 0
        ? C.MAX_LEVEL
        : 1;
      const numeric = Number(level);
      if (!Number.isFinite(numeric)) {
        return 1;
      }
      const floored = Math.floor(numeric);
      if (!Number.isFinite(floored)) {
        return 1;
      }
      return Math.max(1, Math.min(maxLevel, floored));
    })();

    const startRatio = typeof C.ENEMY_SPEED_START_RATIO === 'number' && C.ENEMY_SPEED_START_RATIO > 0
      ? C.ENEMY_SPEED_START_RATIO
      : 0.60;
    const growth = typeof C.ENEMY_SPEED_GROWTH_PER_LEVEL === 'number'
      ? C.ENEMY_SPEED_GROWTH_PER_LEVEL
      : 0.05;
    const growthFactorRaw = 1 + growth;
    const growthFactor = Number.isFinite(growthFactorRaw) && growthFactorRaw > 0
      ? growthFactorRaw
      : 1.05;
    const maxRatio = typeof C.ENEMY_SPEED_MAX_RATIO === 'number' && C.ENEMY_SPEED_MAX_RATIO > 0
      ? C.ENEMY_SPEED_MAX_RATIO
      : 1.0;
    const steps = Math.max(0, lvl - 1);
    const scaled = startRatio * (growthFactor ** steps);
    const ratio = Math.min(maxRatio, Number.isFinite(scaled) && scaled > 0 ? scaled : startRatio);
    return PLAYER_BASE_SPEED * ratio;
  };

  let ENEMY_SPEED = 0;
  try {
    if (C && typeof C.computeEnemySpeed === 'function') {
      const result = C.computeEnemySpeed(currentLevel);
      if (Number.isFinite(result)) {
        ENEMY_SPEED = result;
      } else {
        // fall back to ratio if computeEnemySpeed returned non-finite
        ENEMY_SPEED = computeFallbackEnemySpeed(currentLevel);
      }
    } else {
      // Fallback: start at 60% of the player's speed and grow 5% per level (compounding).
      ENEMY_SPEED = computeFallbackEnemySpeed(currentLevel);
    }
  } catch (_) {
    ENEMY_SPEED = computeFallbackEnemySpeed(currentLevel);
  }
  // Mirror the computed enemy speed back onto the mutable state so that
  // observers (e.g. debug overlay) can read the most recent value without
  // needing to recompute.  Failure to assign is ignored if state is
  // immutable or frozen.
  try {
    state.enemySpeed = ENEMY_SPEED;
  } catch (_) {
    // ignore assignment errors
  }
  const playerStep = boostActive ? BOOST_MULT : PLAYER_BASE_SPEED;
  playerProgress += playerStep * scale;
  enemyProgress += ENEMY_SPEED * scale;
  state.playerProgress = playerProgress;
  state.enemyProgress = enemyProgress;
}
function handleCollisions(ctx) {
  if (!ctx || !ctx.state || !ctx.collisions) return;
  const state = ctx.state;
  const { outOfBounds, isOccupied, resolveHeadOnAndOvertakes } = ctx.collisions;
  const constants = ctx.constants || {};
  const DIR_DELTAS = constants.DIR_DELTAS || {};
  const MAX_SUBSTEPS = typeof constants.MAX_SUBSTEPS === 'number' ? constants.MAX_SUBSTEPS : 4;
  let needRebuild = false;
  let substeps = 0;
  let playerProgress = typeof state.playerProgress === 'number' ? state.playerProgress : 0;
  let enemyProgress  = typeof state.enemyProgress  === 'number' ? state.enemyProgress  : 0;
  while ((playerProgress >= 1 || enemyProgress >= 1) && substeps < MAX_SUBSTEPS) {
    substeps++;
    const player = state.player;
    const enemy  = state.enemy;
    const grid   = state.grid;
    const playerWillMove = (playerProgress >= 1);
    const enemyWillMove  = (enemyProgress >= 1);
    const px0 = player && typeof player.x === 'number' ? player.x : 0;
    const py0 = player && typeof player.y === 'number' ? player.y : 0;
    const ex0 = enemy  && typeof enemy.x  === 'number' ? enemy.x  : 0;
    const ey0 = enemy  && typeof enemy.y  === 'number' ? enemy.y  : 0;
    let pnx = px0;
    let pny = py0;
    if (playerWillMove) {
      const deltas = DIR_DELTAS[player.dir] || [0, 0];
      pnx += deltas[0];
      pny += deltas[1];
    }
    let enemyDir = enemy && enemy.dir;
    if (enemyWillMove) {
      if (ctx.ai && typeof ctx.ai.chooseMove === 'function') {
        try {
          enemyDir = ctx.ai.chooseMove({ grid, ai: enemy, player });
        } catch (_e) {
        }
      }
    }
    let enx = ex0;
    let eny = ey0;
    if (enemyWillMove) {
      const edeltas = DIR_DELTAS[enemyDir] || [0, 0];
      enx += edeltas[0];
      eny += edeltas[1];
    }
    const deaths = detectDeaths(
      ctx,
      pnx, pny,
      enx, eny,
      px0, py0,
      ex0, ey0,
      playerWillMove,
      enemyWillMove
    );
    if (deaths.playerDead || deaths.enemyDead) {
      let aborted = false;
      try {
        const deps = ctx.tickDeps || {};
        const playerEngineRef = { current: ctx.playerEngine };
        const enemyEngineRef  = { current: ctx.enemyEngine  };
        aborted = handleCrashOutcome(
          deaths,
          {
            audio: deps.audio,
            draw: deps.draw,
            gameOver: deps.gameOver,
            resetPowerUps: deps.resetPowerUps,
            updateScore: deps.updateScore,
            hidePausePanel: deps.hidePausePanel,
            panel: deps.panel,
            proceedToNextLevel: deps.proceedToNextLevel,
            gameState: state,
            LEVEL: deps.LEVEL,
            MAX_LEVEL: deps.MAX_LEVEL,
            COLS: deps.COLS,
            pnx,
            enx,
            playerEngineRef,
            enemyEngineRef,
            intervalRef: deps.interval
          }
        );
        ctx.playerEngine = playerEngineRef.current;
        ctx.enemyEngine  = enemyEngineRef.current;
      } catch (_e) {
      }
      try {
        state.running = false;
        state.playerProgress = 0;
        state.enemyProgress  = 0;
      } catch (_e) {}
      try { state.playerDead = !!deaths.playerDead; } catch (_e) {}
      try { state.enemyDead  = !!deaths.enemyDead;  } catch (_e) {}
      if (aborted) {
        break;
      }
      break;
    }
    const changed = commitMoves(ctx, {
      playerWillMove,
      enemyWillMove,
      px0,
      py0,
      pnx,
      pny,
      ex0,
      ey0,
      enx,
      eny,
      prevEnemyDir: enemy && enemy.dir,
      enemyDir,
      preset: undefined
    });
    if (changed) {
      needRebuild = true;
    }
    if (playerWillMove) playerProgress -= 1;
    if (enemyWillMove)  enemyProgress  -= 1;
  }
  try {
    state.playerProgress = playerProgress;
    state.enemyProgress  = enemyProgress;
  } catch (_e) {}
  if (needRebuild) {
    try {
      const result = rebuildPulsePaths(state.trailPlayer, state.trailEnemy);
      if (result) {
        ctx.pulseP = result.pulseP;
        ctx.pulseE = result.pulseE;
      }
    } catch (_e) {
    }
  }
}
export function renderFrame(ctx) {
  if (!ctx || !ctx.state || !ctx.render) return;
  const r = ctx.render;
  const gs = ctx.state;
  try {
    if (typeof r.drawFrame === 'function') {
      r.drawFrame({
        ctx: r.boardCtx,
        pctx: r.pctx,
        fx: r.fx,
        gameState: gs,
        engineContext: ctx,
        PLAYER_CYCLE_CORE: r.colors && r.colors.playerCore,
        PLAYER_CYCLE_GLOW: r.colors && r.colors.playerGlow,
        ENEMY_CYCLE_CORE: r.colors && r.colors.enemyCore,
        ENEMY_CYCLE_GLOW: r.colors && r.colors.enemyGlow,
        trailPlayer: gs && Array.isArray(gs.trailPlayer) ? gs.trailPlayer : r.trailPlayer,
        trailEnemy: gs && Array.isArray(gs.trailEnemy) ? gs.trailEnemy : r.trailEnemy,
        PULSE_SPAN: r.PULSE_SPAN
      });
    }
  } catch (_e) {
  }
}
function computeMoves(ctx) {
  if (!ctx || !ctx.state) return;
  const state = ctx.state;
  const constants = ctx.constants || {};
  const DIR_DELTAS = (constants && constants.DIR_DELTAS) || {};
  const MAX_SUBSTEPS = (typeof constants.MAX_SUBSTEPS === 'number' ? constants.MAX_SUBSTEPS : 4);
  let substeps = 0;
  while ((state.playerProgress >= 1 || state.enemyProgress >= 1) && substeps < MAX_SUBSTEPS) {
    substeps++;
    const player = state.player;
    const enemy = state.enemy;
    const grid = state.grid;
    const nextDir = player && player.nextDir;
    if (nextDir && player && typeof player.dir === 'string' && !isOpposite(nextDir, player.dir)) {
      player.dir = nextDir;
    }
    const playerWillMove = (state.playerProgress >= 1);
    const enemyWillMove = (state.enemyProgress >= 1);
    let pnx = player && typeof player.x === 'number' ? player.x : 0;
    let pny = player && typeof player.y === 'number' ? player.y : 0;
    if (playerWillMove) {
      const deltas = DIR_DELTAS[player.dir] || [0, 0];
      pnx += deltas[0];
      pny += deltas[1];
    }
    let enemyDir = enemy && enemy.dir;
    if (enemyWillMove) {
      if (ctx.ai && typeof ctx.ai.chooseMove === 'function') {
        try {
          enemyDir = ctx.ai.chooseMove({ grid, ai: enemy, player });
        } catch (_e) {
        }
      }
    }
    let enx = enemy && typeof enemy.x === 'number' ? enemy.x : 0;
    let eny = enemy && typeof enemy.y === 'number' ? enemy.y : 0;
    if (enemyWillMove) {
      const edeltas = DIR_DELTAS[enemyDir] || [0, 0];
      enx += edeltas[0];
      eny += edeltas[1];
    }
    if (playerWillMove) {
      state.playerProgress -= 1;
    }
    if (enemyWillMove) {
      state.enemyProgress -= 1;
    }
    if (playerWillMove) {
      if (player) {
        player.x = pnx;
        player.y = pny;
      }
    }
    if (enemy) {
      enemy.dir = enemyDir;
      if (enemyWillMove) {
        enemy.x = enx;
        enemy.y = eny;
      }
    }
  }
}
export function step(ctx, delta = 1) {
  const state = ctx && ctx.state;
  if (!state || !state.running) {
    return;
  }
  const rawDelta = Number.isFinite(delta) ? delta : 1;
  const stepDelta = Math.max(0, rawDelta);
  if (stepDelta <= 0) {
    return;
  }
  try {
    state.tick = (state.tick || 0) + stepDelta;
    debugState.performance.tick = state.tick;
  } catch (_e) {
  }
  updateProgress(state, stepDelta);
  if (!ctx || !ctx.tickDeps) {
    return;
  }
  const playerEngineRef = { current: ctx.playerEngine };
  const enemyEngineRef  = { current: ctx.enemyEngine };
  const pulsePRef       = { current: ctx.pulseP };
  const pulseERef       = { current: ctx.pulseE };
  const deps = ctx.tickDeps;
  const result = runTick({
    gameState: state,
    engineContext: ctx,
    audio: deps.audio,
    draw: deps.draw,
    gameOver: deps.gameOver,
    resetPowerUps: deps.resetPowerUps,
    updateScore: deps.updateScore,
    hidePausePanel: deps.hidePausePanel,
    showPausePanel: deps.showPausePanel,
    panel: deps.panel,
    overlay: deps.overlay,
    proceedToNextLevel: deps.proceedToNextLevel,
    LEVEL: deps.LEVEL,
    MAX_LEVEL: deps.MAX_LEVEL,
    COLS: deps.COLS,
    preset: deps.preset,
    playerEngineRef,
    enemyEngineRef,
    interval: deps.interval,
    trailPlayer: deps.trailPlayer,
    trailEnemy: deps.trailEnemy,
    pulsePRef,
    pulseERef,
    keysHeld: deps.keysHeld,
    delta: stepDelta
  });
  ctx.playerEngine = playerEngineRef.current;
  ctx.enemyEngine  = enemyEngineRef.current;
  ctx.pulseP       = pulsePRef.current;
  ctx.pulseE       = pulseERef.current;
  try {
    debugState.performance.lastSubsteps = result.lastSubsteps;
  } catch (_e) {
  }
  if (result.aborted) {
    return;
  }
}
