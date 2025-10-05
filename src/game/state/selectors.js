export function isRunning(state) {
  return !!(state && state.running);
}
export function isGameEnded(state) {
  return !!(state && state.gameEnded);
}
export function isCountdownActive(state) {
  return !!(state && state.countdownActive);
}
export function isInitialStartPending(state) {
  return !!(state && state.initialStartPending);
}
export function isLevelTransitionPending(state) {
  return !!(state && state.levelTransitionPending);
}
export function getLevel(state) {
  return state ? state.level : undefined;
}
