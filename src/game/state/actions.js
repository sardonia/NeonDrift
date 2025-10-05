export const Types = {
  START_GAME: 'START_GAME',
  PAUSE_GAME: 'PAUSE_GAME',
  RESET_GAME: 'RESET_GAME',
  LEVEL_UP: 'LEVEL_UP',
  SET_LEVEL: 'SET_LEVEL',
  SET_COUNTDOWN_ACTIVE: 'SET_COUNTDOWN_ACTIVE',
  SET_RUNNING: 'SET_RUNNING',
  SET_GAME_ENDED: 'SET_GAME_ENDED',
  SET_INITIAL_START_PENDING: 'SET_INITIAL_START_PENDING',
  SET_LEVEL_TRANSITION_PENDING: 'SET_LEVEL_TRANSITION_PENDING',
  SET_SCORE: 'SET_SCORE',
  ADD_SCORE: 'ADD_SCORE',
  SET_PERSISTENT_SCORE: 'SET_PERSISTENT_SCORE',
  ADD_PERSISTENT_SCORE: 'ADD_PERSISTENT_SCORE',
  SET_NEXT_LEVEL_CARRY_SCORE: 'SET_NEXT_LEVEL_CARRY_SCORE',
  SET_POWER_UP: 'SET_POWER_UP',
  CLEAR_POWER_UP: 'CLEAR_POWER_UP',
  SET_POWER_BAG: 'SET_POWER_BAG',
  ADD_POWER_BAG_ITEM: 'ADD_POWER_BAG_ITEM',
  CLEAR_POWER_BAG: 'CLEAR_POWER_BAG',
  SET_TICK: 'SET_TICK',
  SET_PLAYER_PROGRESS: 'SET_PLAYER_PROGRESS',
  SET_ENEMY_PROGRESS: 'SET_ENEMY_PROGRESS',
  SET_BOOST_ACTIVE: 'SET_BOOST_ACTIVE'
};

export function startGame() {
  return { type: Types.START_GAME };
}

export function pauseGame() {
  return { type: Types.PAUSE_GAME };
}

export function resetGame(options = {}) {
  const { preservePersistentScore = false } = options || {};
  return { type: Types.RESET_GAME, preservePersistentScore: !!preservePersistentScore };
}

export function levelUp() {
  return { type: Types.LEVEL_UP };
}

export function setLevel(level) {
  return { type: Types.SET_LEVEL, level: Math.floor(level || 1) };
}

export function setCountdownActive(value) {
  return { type: Types.SET_COUNTDOWN_ACTIVE, value: !!value };
}

export function setRunning(value) {
  return { type: Types.SET_RUNNING, value: !!value };
}

export function setGameEnded(value) {
  return { type: Types.SET_GAME_ENDED, value: !!value };
}

export function setInitialStartPending(value) {
  return { type: Types.SET_INITIAL_START_PENDING, value: !!value };
}

export function setLevelTransitionPending(value) {
  return { type: Types.SET_LEVEL_TRANSITION_PENDING, value: !!value };
}

export function setScore(value) {
  return { type: Types.SET_SCORE, value: Number(value) || 0 };
}

export function addScore(delta) {
  return { type: Types.ADD_SCORE, delta: Number(delta) || 0 };
}

export function setPersistentScore(value) {
  return { type: Types.SET_PERSISTENT_SCORE, value: Number(value) || 0 };
}

export function addPersistentScore(delta) {
  return { type: Types.ADD_PERSISTENT_SCORE, delta: Number(delta) || 0 };
}

export function setNextLevelCarryScore(value) {
  return { type: Types.SET_NEXT_LEVEL_CARRY_SCORE, value: Number(value) || 0 };
}

export function setPowerUp(powerUp) {
  return { type: Types.SET_POWER_UP, powerUp: powerUp ?? null };
}

export function clearPowerUp() {
  return { type: Types.CLEAR_POWER_UP };
}

export function setPowerBag(items) {
  return { type: Types.SET_POWER_BAG, items: Array.isArray(items) ? items : [] };
}

export function addPowerBagItem(item) {
  return { type: Types.ADD_POWER_BAG_ITEM, item };
}

export function clearPowerBag() {
  return { type: Types.CLEAR_POWER_BAG };
}

export function setTick(value) {
  return { type: Types.SET_TICK, value: Number(value) || 0 };
}

export function setPlayerProgress(value) {
  return { type: Types.SET_PLAYER_PROGRESS, value: Number(value) || 0 };
}

export function setEnemyProgress(value) {
  return { type: Types.SET_ENEMY_PROGRESS, value: Number(value) || 0 };
}

export function setBoostActive(value) {
  return { type: Types.SET_BOOST_ACTIVE, value: !!value };
}
