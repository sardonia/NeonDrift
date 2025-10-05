import { getState as getDefaultState } from '../state/index.js';
import * as StateSelectors from '../state/selectors.js';

const NO_OP = () => {};

function asFunction(fn, fallback = NO_OP) {
  return typeof fn === 'function' ? fn : fallback;
}

function resolveStateGetter(stateInput) {
  if (typeof stateInput === 'function') {
    return stateInput;
  }
  if (stateInput && typeof stateInput.getState === 'function') {
    return stateInput.getState.bind(stateInput);
  }
  return getDefaultState;
}

export function createSelectors(overrides = {}) {
  return {
    isRunning: asFunction(overrides.isRunning ?? StateSelectors.isRunning, () => false),
    isGameEnded: asFunction(overrides.isGameEnded ?? StateSelectors.isGameEnded, () => false),
    isCountdownActive: asFunction(overrides.isCountdownActive ?? StateSelectors.isCountdownActive, () => false),
    isInitialStartPending: asFunction(
      overrides.isInitialStartPending ?? StateSelectors.isInitialStartPending,
      () => false
    ),
    isLevelTransitionPending: asFunction(
      overrides.isLevelTransitionPending ?? StateSelectors.isLevelTransitionPending,
      () => false
    ),
    getLevel: asFunction(
      overrides.getLevel ?? StateSelectors.getLevel,
      (state) => (state && typeof state.level === 'number' ? state.level : undefined)
    )
  };
}

export function createStateAccess(stateInput, selectorOverrides) {
  return {
    getState: resolveStateGetter(stateInput),
    selectors: createSelectors(selectorOverrides)
  };
}

export function setStateAccess(target, stateInput, selectorOverrides) {
  const access = createStateAccess(stateInput, selectorOverrides);
  if (!target || typeof target !== 'object') {
    return access;
  }
  target.getState = access.getState;
  target.selectors = access.selectors;
  return target;
}
