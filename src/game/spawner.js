import { resetGameState, getState, dispatch as reduxDispatch, Actions } from './state/index.js';
import { spawnPowerUp } from './powerups.js';
import { resetPulseDashOffset as _resetPulseDashOffset } from './render/sprites.js';

// Moved to top-level for exporting and proper scope
function clampLevel(value) {
  const STARTING_LEVEL = 1;
  const MAX_LEVEL = 10; // Assuming a MAX_LEVEL, define if not present
  const lvl = Number.isFinite(value) ? Math.floor(value) : STARTING_LEVEL;
  if (!Number.isFinite(lvl)) {
    return STARTING_LEVEL;
  }
  if (lvl < 1) return 1;
  if (lvl > MAX_LEVEL) return MAX_LEVEL;
  return lvl;
}

export function spawnRound({
  gameState,
  engineContext,
  ctx,
  tctx,
  pctx,
  board,
  trails,
  fx,
  trailPlayer,
  trailEnemy,
  PLAYER_CYCLE_CORE,
  PLAYER_CYCLE_GLOW,
  ENEMY_CYCLE_CORE,
  ENEMY_CYCLE_GLOW,
  PULSE_SPAN
}) {
  const stateRef = engineContext && engineContext.state ? engineContext.state : null;
  const resetState = stateRef && typeof resetGameState === 'function'
    ? resetGameState(stateRef, { preservePersistentScore: true, preserveLevel: true }) || stateRef
    : null;
  const baseState = resetState || gameState || stateRef || null;

  if (engineContext) {
    engineContext.pulseP = null;
    engineContext.pulseE = null;
  }

  if (tctx && typeof tctx.clearRect === 'function') {
    const canvas = trails || (tctx.canvas || null);
    const width = (() => {
      if (canvas && typeof canvas.width === 'number' && canvas.width > 0) {
        return canvas.width;
      }
      if (canvas && typeof canvas.bitmapWidth === 'number' && canvas.bitmapWidth > 0) {
        return canvas.bitmapWidth;
      }
      if (tctx.canvas && typeof tctx.canvas.width === 'number' && tctx.canvas.width > 0) {
        return tctx.canvas.width;
      }
      return 0;
    })();
    const height = (() => {
      if (canvas && typeof canvas.height === 'number' && canvas.height > 0) {
        return canvas.height;
      }
      if (canvas && typeof canvas.bitmapHeight === 'number' && canvas.bitmapHeight > 0) {
        return canvas.bitmapHeight;
      }
      if (tctx.canvas && typeof tctx.canvas.height === 'number' && tctx.canvas.height > 0) {
        return tctx.canvas.height;
      }
      return 0;
    })();
    if (width > 0 && height > 0) {
      try { tctx.clearRect(0, 0, width, height); } catch (_) {}
    } else {
      try {
        if (typeof tctx.reset === 'function') {
          tctx.reset();
        }
      } catch (_) {}
    }
  }

  try { _resetPulseDashOffset(); } catch (_) {}

  function cloneGrid(template, rows, cols) {
    const height = Math.max(1, rows | 0);
    const width = Math.max(1, cols | 0);
    const result = new Array(height);
    for (let y = 0; y < height; y++) {
      const row = new Array(width);
      for (let x = 0; x < width; x++) {
        row[x] = template && template[y] ? Boolean(template[y][x]) : false;
      }
      result[y] = row;
    }
    return result;
  }

  const carryScore = (() => {
    const candidates = [
      baseState && baseState.persistentScore,
      stateRef && stateRef.persistentScore,
      gameState && gameState.persistentScore
    ];
    for (let i = 0; i < candidates.length; i += 1) {
      const value = candidates[i];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
    }
    return 0;
  })();

  const scoreboardSeed = {
    gameEnded: false,
    tick: 0,
    score: carryScore,
    scoreAccumulator: 0,
    hudScorePending: 0,
    hudScoreCooldown: 0,
    hudScoreLastBroadcast: carryScore,
    persistentScore: carryScore,
    enemyProgress: 0,
    playerProgress: 0,
    boostActive: false
  };

  const mutateState = (target) => {
    if (target && typeof target === 'object') {
      Object.assign(target, scoreboardSeed);
    }
  };

  mutateState(baseState);
  if (stateRef && stateRef !== baseState) {
    mutateState(stateRef);
  }
  if (gameState && gameState !== baseState && gameState !== stateRef) {
    mutateState(gameState);
  }

  if (typeof dispatch === 'function' && Actions) {
    try {
      if (typeof Actions.setGameEnded === 'function') dispatch(Actions.setGameEnded(false));
      if (typeof Actions.setTick === 'function') dispatch(Actions.setTick(0));
      if (typeof Actions.setScore === 'function') dispatch(Actions.setScore(carryScore));
      if (typeof Actions.setPersistentScore === 'function') dispatch(Actions.setPersistentScore(carryScore));
      if (typeof Actions.setEnemyProgress === 'function') dispatch(Actions.setEnemyProgress(0));
      if (typeof Actions.setPlayerProgress === 'function') dispatch(Actions.setPlayerProgress(0));
      if (typeof Actions.setBoostActive === 'function') dispatch(Actions.setBoostActive(false));
    } catch (_e) {
      mutateState(stateRef || baseState || gameState);
    }
  }

  const audioCtx = engineContext && engineContext.audio;
  if (audioCtx) {
    if (typeof audioCtx.resetVolumes === 'function') {
      audioCtx.resetVolumes();
    }
  }

  if (typeof spawnPowerUp === 'function') {
    spawnPowerUp();
  }

  const resolveTrail = (state, key) => (state && Array.isArray(state[key]) ? state[key] : null);
  const sourcePlayerTrail = resolveTrail(baseState, 'trailPlayer')
    || resolveTrail(gameState, 'trailPlayer')
    || [];
  const sourceEnemyTrail = resolveTrail(baseState, 'trailEnemy')
    || resolveTrail(gameState, 'trailEnemy')
    || [];

  if (Array.isArray(trailPlayer) && trailPlayer !== sourcePlayerTrail) {
    trailPlayer.length = 0;
    trailPlayer.push(...sourcePlayerTrail);
  }

  if (Array.isArray(trailEnemy) && trailEnemy !== sourceEnemyTrail) {
    trailEnemy.length = 0;
    trailEnemy.push(...sourceEnemyTrail);
  }

  const renderContext = engineContext && engineContext.render;
  if (renderContext && typeof renderContext.drawFrame === 'function') {
    const renderColors = renderContext.colors || {};
    const resolvedPlayerTrail = resolveTrail(baseState, 'trailPlayer')
      || (Array.isArray(trailPlayer) ? trailPlayer : []);
    const resolvedEnemyTrail = resolveTrail(baseState, 'trailEnemy')
      || (Array.isArray(trailEnemy) ? trailEnemy : []);

    if (typeof renderContext.syncTrails === 'function') {
      try {
        renderContext.syncTrails(resolvedPlayerTrail, resolvedEnemyTrail, { clear: true });
      } catch (_syncErr) {}
    }

    renderContext.drawFrame({
      ctx,
      pctx,
      fx,
      gameState: baseState || gameState || stateRef,
      engineContext,
      PLAYER_CYCLE_CORE: renderColors.playerCore !== undefined ? renderColors.playerCore : PLAYER_CYCLE_CORE,
      PLAYER_CYCLE_GLOW: renderColors.playerGlow !== undefined ? renderColors.playerGlow : PLAYER_CYCLE_GLOW,
      ENEMY_CYCLE_CORE: renderColors.enemyCore !== undefined ? renderColors.enemyCore : ENEMY_CYCLE_CORE,
      ENEMY_CYCLE_GLOW: renderColors.enemyGlow !== undefined ? renderColors.enemyGlow : ENEMY_CYCLE_GLOW,
      trailPlayer: resolvedPlayerTrail,
      trailEnemy: resolvedEnemyTrail,
      PULSE_SPAN: renderContext.PULSE_SPAN !== undefined ? renderContext.PULSE_SPAN : PULSE_SPAN
    });
  }
}

// --- State Management Logic ---
// NOTE: This logic was incorrectly mixed into the spawnRound function.
// It has been moved here for correct structure.

function mutateState(state, actionType, action) {
  // Assuming ActionTypes is imported or defined elsewhere
  const ActionTypes = (action && action.type) ? { [action.type]: action.type } : {};

  switch (actionType) {
    case ActionTypes.SET_NEXT_LEVEL_CARRY_SCORE: {
      const value = action && typeof action.value === 'number' ? action.value : 0;
      if (state.nextLevelCarryScore === value) {
        return state;
      }
      return {
        ...state,
        nextLevelCarryScore: value
      };
    }
    case ActionTypes.SET_POWER_UP: {
      const powerUp = action ? action.powerUp ?? null : null;
      if (state.powerUp === powerUp) {
        return state;
      }
      return {
        ...state,
        powerUp
      };
    }
    case ActionTypes.CLEAR_POWER_UP: {
      if (state.powerUp == null) {
        return state;
      }
      return {
        ...state,
        powerUp: null
      };
    }
    case ActionTypes.SET_POWER_BAG: {
      const values = action && Array.isArray(action.items) ? action.items.slice() : [];
      return {
        ...state,
        powerBag: values
      };
    }
    case ActionTypes.ADD_POWER_BAG_ITEM: {
      const next = state.powerBag ? state.powerBag.slice() : [];
      next.push(action ? action.item : undefined);
      return {
        ...state,
        powerBag: next
      };
    }
    case ActionTypes.CLEAR_POWER_BAG: {
      if (!state.powerBag || state.powerBag.length === 0) {
        return state;
      }
      return {
        ...state,
        powerBag: []
      };
    }
    case ActionTypes.SET_TICK: {
      const value = action && typeof action.value === 'number' ? action.value : 0;
      if (state.tick === value) {
        return state;
      }
      return {
        ...state,
        tick: value
      };
    }
    case ActionTypes.SET_PLAYER_PROGRESS: {
      const value = action && typeof action.value === 'number' ? action.value : 0;
      if (state.playerProgress === value) {
        return state;
      }
      return {
        ...state,
        playerProgress: value
      };
    }
    case ActionTypes.SET_ENEMY_PROGRESS: {
      const value = action && typeof action.value === 'number' ? action.value : 0;
      if (state.enemyProgress === value) {
        return state;
      }
      return {
        ...state,
        enemyProgress: value
      };
    }
    case ActionTypes.SET_BOOST_ACTIVE: {
      const boostActive = !!(action && action.value);
      if (state.boostActive === boostActive) {
        return state;
      }
      return {
        ...state,
        boostActive
      };
    }
    default:
      return state;
  }
}

export function gameReducer(state = {}, action) { // Assuming createGameState() is available
  if (!action || typeof action.type === 'undefined') {
    return state;
  }
  return mutateState(state, action.type, action);
}

// NOTE: The simple store creator logic below was also misplaced inside spawnRound.
// It should be in its own file for creating a state store.
function createStore(reducer, initialState) {
  let currentState = initialState;
  let listeners = new Set();
  
  const snapshotState = (s) => JSON.parse(JSON.stringify(s));
  let snapshot = snapshotState(currentState);

  function subscribe(listener) {
    listeners.add(listener);
    return function unsubscribe() {
      listeners.delete(listener);
    };
  }

  function dispatch(action) {
    currentState = reducer(currentState, action);
    snapshot = snapshotState(currentState);
    for (const listener of Array.from(listeners)) {
      try {
        listener(snapshot, action);
      } catch (_) {}
    }
    return action;
  }

  return {
    getState() {
      return snapshot;
    },
    subscribe,
    dispatch,
    getMutableState() {
      return currentState;
    }
  };
}


export { clampLevel };