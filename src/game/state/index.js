import { createStore, createGameState } from './store.js';
import * as Actions from './actions.js';
import * as Selectors from './selectors.js';

const store = createStore({ preloadedState: createGameState() });

export function getStore() {
  return store;
}

export function getState() {
  return store.getMutableState();
}

export function getSnapshot() {
  return store.getState();
}

export function dispatch(action) {
  if (!action || typeof action !== 'object') {
    throw new Error('[state] dispatch expects an action object');
  }
  return store.dispatch(action);
}

export function subscribe(listener) {
  return store.subscribe(listener);
}

export function resetGameState(state, opts = {}) {
  dispatch(Actions.resetGame(opts));
  const current = getState();
  if (state && state !== current) {
    Object.assign(state, current);
  }
  return current;
}

export function setLevel(level) {
  dispatch(Actions.setLevel(level));
  const current = getState();
  return current && typeof current.level === 'number' ? current.level : undefined;
}

export { Actions, Selectors };
