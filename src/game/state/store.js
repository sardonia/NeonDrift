import { COLS, ROWS, MAX_LEVEL, STARTING_LEVEL, computeEnemySpeed } from '../Constants.js';
import { Types as ActionTypes } from './actions.js';

function clampLevel(value) {
  const lvl = Number.isFinite(value) ? Math.floor(value) : STARTING_LEVEL;
  if (!Number.isFinite(lvl)) {
    return STARTING_LEVEL;
  }
  if (lvl < 1) return 1;
  if (lvl > MAX_LEVEL) return MAX_LEVEL;
  return lvl;
}

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

export function createGameState({ cols = COLS, rows = ROWS } = {}) {
  const width = Math.max(1, cols | 0);
  const height = Math.max(1, rows | 0);
  const startPlayerX = Math.floor(width * 0.25);
  const startEnemyX = Math.floor(width * 0.75);
  const startY = Math.floor(height / 2);
  return {
    grid: cloneGrid(null, height, width),
    player: { x: startPlayerX, y: startY, dir: 'right', nextDir: 'right', alive: true },
    enemy:  { x: startEnemyX, y: startY, dir: 'left', alive: true },
    trailPlayer: [[startPlayerX, startY]],
    trailEnemy:  [[startEnemyX, startY]],
    powerBag: [],
    powerUp: null,
    score: 0,
    scoreAccumulator: 0,
    hudScorePending: 0,
    hudScoreCooldown: 0,
    hudScoreLastBroadcast: 0,
    persistentScore: 0,
    level: STARTING_LEVEL,
    // Track the current enemy speed explicitly in the game state.  Initialise
    // this value based on the starting level so that the enemy moves from
    // the very first frame.  The orchestrator will update this field
    // whenever the level changes.
    enemySpeed: (typeof computeEnemySpeed === 'function'
      ? computeEnemySpeed(STARTING_LEVEL)
      : 0),
    running: false,
    gameEnded: false,
    initialStartPending: true,
    levelTransitionPending: false,
    countdownActive: false,
    nextLevelCarryScore: 0,
    tick: 0,
    playerProgress: 0,
    enemyProgress: 0,
    boostActive: false,
    initialised: false
  };
}

function snapshotState(state) {
  try {
    if (typeof structuredClone === 'function') {
      return Object.freeze(structuredClone(state));
    }
  } catch (_) {
  }
  try {
    return Object.freeze(JSON.parse(JSON.stringify(state)));
  } catch (_) {
  }
  return Object.freeze({ ...state });
}

function resetInternalState(state, { preservePersistentScore = false, preserveLevel = false } = {}) {
  const rows = state && Array.isArray(state.grid) ? state.grid.length : ROWS;
  const cols = state && Array.isArray(state.grid) && state.grid[0] ? state.grid[0].length : COLS;
  const next = createGameState({ rows, cols });
  // Preserve the current level if requested.
  let preservedLevel;
  if (preserveLevel) {
    try {
      const lvl = state && typeof state.level === 'number' ? clampLevel(state.level) : STARTING_LEVEL;
      next.level = lvl;
      preservedLevel = lvl;
    } catch (_) {}
  }
  // Always recompute the enemy speed for the resulting level.  If preserveLevel is
  // true, use the preserved level; otherwise use the starting level set in
  // createGameState().  This ensures the enemy speed matches the correct level
  // after a round reset or game restart.  When computeEnemySpeed is not
  // available, fall back to leaving next.enemySpeed as it was created.
  try {
    const lvl = preservedLevel || next.level;
    if (typeof computeEnemySpeed === 'function') {
      const speed = computeEnemySpeed(lvl);
      if (Number.isFinite(speed)) {
        next.enemySpeed = speed;
      }
    }
  } catch (_) {
    // ignore failures computing enemy speed
  }
  if (preservePersistentScore) {
    const score = state && typeof state.persistentScore === 'number' ? state.persistentScore : 0;
    next.persistentScore = score;
    next.score = score;
    next.hudScorePending = 0;
    next.hudScoreCooldown = 0;
    next.hudScoreLastBroadcast = score;
  }
  return next;
}

function mutateState(state, type, action) {
  switch (type) {
    case ActionTypes.START_GAME: {
      if (state.running && !state.gameEnded && !state.initialStartPending) {
        return state;
      }
      return {
        ...state,
        running: true,
        gameEnded: false,
        initialStartPending: false
      };
    }
    case ActionTypes.PAUSE_GAME: {
      if (!state.running) {
        return state;
      }
      return {
        ...state,
        running: false
      };
    }
    case ActionTypes.RESET_GAME: {
      const next = resetInternalState(state, action || {});
      return next;
    }
    case ActionTypes.LEVEL_UP: {
      // When levelling up, clamp the next level and recompute the enemy speed.
      const level = clampLevel((state.level || 1) + 1);
      if (level === state.level) {
        return state;
      }
      // Derive the enemy speed for the new level using the constants service.
      let newEnemySpeed;
      try {
        if (typeof computeEnemySpeed === 'function') {
          const speed = computeEnemySpeed(level);
          if (Number.isFinite(speed)) {
            newEnemySpeed = speed;
          }
        }
      } catch (_) {
        // Ignore errors computing enemy speed; fallback to existing value.
      }
      return {
        ...state,
        level,
        // If computeEnemySpeed returned a valid number, update enemySpeed; otherwise retain the current value.
        enemySpeed: newEnemySpeed !== undefined ? newEnemySpeed : state.enemySpeed
      };
    }
    case ActionTypes.SET_LEVEL: {
      // Explicitly set the level, clamping to valid bounds, and recompute enemy speed.
      const level = clampLevel(action && typeof action.level === 'number' ? action.level : state.level);
      if (level === state.level) {
        return state;
      }
      let newEnemySpeed;
      try {
        if (typeof computeEnemySpeed === 'function') {
          const speed = computeEnemySpeed(level);
          if (Number.isFinite(speed)) {
            newEnemySpeed = speed;
          }
        }
      } catch (_) {
        // On failure to compute, leave enemySpeed unchanged.
      }
      return {
        ...state,
        level,
        enemySpeed: newEnemySpeed !== undefined ? newEnemySpeed : state.enemySpeed
      };
    }
    case ActionTypes.SET_COUNTDOWN_ACTIVE: {
      const countdownActive = !!(action && action.value);
      if (state.countdownActive === countdownActive) {
        return state;
      }
      return {
        ...state,
        countdownActive
      };
    }
    case ActionTypes.SET_RUNNING: {
      if (action && typeof action.value !== 'undefined') {
        const running = !!action.value;
        if (state.running === running) {
          return state;
        }
        return {
          ...state,
          running
        };
      }
      return state;
    }
    case ActionTypes.SET_GAME_ENDED: {
      if (action && typeof action.value !== 'undefined') {
        const gameEnded = !!action.value;
        if (state.gameEnded === gameEnded) {
          return state;
        }
        return {
          ...state,
          gameEnded
        };
      }
      return state;
    }
    case ActionTypes.SET_INITIAL_START_PENDING: {
      if (action && typeof action.value !== 'undefined') {
        const initialStartPending = !!action.value;
        if (state.initialStartPending === initialStartPending) {
          return state;
        }
        return {
          ...state,
          initialStartPending
        };
      }
      return state;
    }
    case ActionTypes.SET_LEVEL_TRANSITION_PENDING: {
      if (action && typeof action.value !== 'undefined') {
        const levelTransitionPending = !!action.value;
        if (state.levelTransitionPending === levelTransitionPending) {
          return state;
        }
        return {
          ...state,
          levelTransitionPending
        };
      }
      return state;
    }
    case ActionTypes.SET_SCORE: {
      const value = action && typeof action.value === 'number' ? action.value : 0;
      if (state.score === value) {
        return state;
      }
      return {
        ...state,
        score: value
      };
    }
    case ActionTypes.ADD_SCORE: {
      const delta = action && typeof action.delta === 'number' ? action.delta : 0;
      if (!delta) {
        return state;
      }
      return {
        ...state,
        score: (state.score || 0) + delta
      };
    }
    case ActionTypes.SET_PERSISTENT_SCORE: {
      const value = action && typeof action.value === 'number' ? action.value : 0;
      if (state.persistentScore === value) {
        return state;
      }
      return {
        ...state,
        persistentScore: value
      };
    }
    case ActionTypes.ADD_PERSISTENT_SCORE: {
      const delta = action && typeof action.delta === 'number' ? action.delta : 0;
      if (!delta) {
        return state;
      }
      return {
        ...state,
        persistentScore: (state.persistentScore || 0) + delta
      };
    }
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

export function gameReducer(state = createGameState(), action) {
  if (!action || typeof action.type === 'undefined') {
    return state;
  }
  return mutateState(state, action.type, action);
}

export function createStore({ reducer = gameReducer, preloadedState } = {}) {
  let currentState = preloadedState || createGameState();
  let snapshot = snapshotState(currentState);
  const listeners = new Set();

  function getState() {
    return snapshot;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    listeners.add(listener);
    return () => {
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
    getState,
    subscribe,
    dispatch,
    getMutableState() {
      return currentState;
    }
  };
}

export function resetState(state, options) {
  return resetInternalState(state, options);
}

export { clampLevel };
