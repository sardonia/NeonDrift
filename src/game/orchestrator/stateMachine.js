export const GameState = Object.freeze({
  IDLE: 'IDLE',
  COUNTDOWN: 'COUNTDOWN',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  GAME_OVER: 'GAME_OVER'
});

export const AllowedTransitions = Object.freeze({
  IDLE: ['COUNTDOWN'],
  COUNTDOWN: ['RUNNING', 'PAUSED'],
  RUNNING: ['PAUSED', 'GAME_OVER', 'COUNTDOWN'],
  PAUSED: ['RUNNING', 'GAME_OVER'],
  GAME_OVER: ['IDLE', 'COUNTDOWN']
});

const warnedTransitions = new Set();
let currentState = GameState.IDLE;

export function getGameState() {
  return currentState;
}

export function canTransition(from, to) {
  const allowed = AllowedTransitions[from] || [];
  return allowed.indexOf(to) !== -1;
}

function warnIllegalTransition(from, to, allowed) {
  if (typeof console === 'undefined' || typeof console.warn !== 'function') {
    return;
  }
  const key = `${from}->${to}`;
  if (warnedTransitions.has(key)) {
    return;
  }
  warnedTransitions.add(key);
  console.warn('[fsm] Illegal state transition', { from, to, allowed });
}

export function _setState(nextState) {
  try {
    const from = currentState;
    const to = nextState;
    const allowed = AllowedTransitions[from] || [];
    if (!canTransition(from, to)) {
      warnIllegalTransition(from, to, allowed);
    }
  } catch (_) {
    // guard rails should not block transition execution
  }
  currentState = nextState;
  return currentState;
}

export function transitionToIdle() {
  return _setState(GameState.IDLE);
}

export function transitionToCountdown() {
  return _setState(GameState.COUNTDOWN);
}

export function transitionToRunning() {
  return _setState(GameState.RUNNING);
}

export function transitionToPaused() {
  return _setState(GameState.PAUSED);
}

export function transitionToGameOver() {
  return _setState(GameState.GAME_OVER);
}

export function resetStateMachine(initialState = GameState.IDLE) {
  warnedTransitions.clear();
  currentState = initialState;
  return currentState;
}

export default {
  GameState,
  AllowedTransitions,
  getGameState,
  canTransition,
  _setState,
  transitionToIdle,
  transitionToCountdown,
  transitionToRunning,
  transitionToPaused,
  transitionToGameOver,
  resetStateMachine
};
