import { startLoop as startLoopScheduler, stopLoop as stopLoopScheduler } from '../../loop.js';
import { step as engineStep } from '../../engine.js';
import { dispatch, Actions, getState, subscribe as subscribeToStore } from '../../state/index.js';
let _running = false;
let _gameState = null;
let _engineContext = null;
let _drawFn = null;
let _onFrameFn = null;
let _storeUnsubscribe = null;

function updateRuntimeState(nextState) {
  if (nextState) {
    _gameState = nextState;
  }
  if (_engineContext && typeof _engineContext === 'object') {
    _engineContext.state = _gameState;
  }
}

function ensureStoreSubscription() {
  if (_storeUnsubscribe || typeof subscribeToStore !== 'function') {
    return;
  }
  try {
    _storeUnsubscribe = subscribeToStore(() => {
      syncStateFromStore();
    });
  } catch (_) {
    _storeUnsubscribe = null;
  }
}

function syncStateFromStore() {
  try {
    const latest = getState();
    if (latest) {
      updateRuntimeState(latest);
      return latest;
    }
  } catch (_) {}
  updateRuntimeState(_gameState);
  return _gameState;
}
export function start({ gameState, engineContext, draw, onFrame }) {
  if (!gameState || !engineContext || typeof draw !== 'function') {
    throw new Error('loopController.start() requires gameState, engineContext and draw callback');
  }
  _engineContext = engineContext;
  updateRuntimeState(gameState);
  _drawFn = draw;
  _onFrameFn = onFrame;
  _running = true;

  try {
    dispatch(Actions.setRunning(true));
    syncStateFromStore();
  } catch (_) {
    if (_gameState) {
      try { _gameState.running = true; } catch (_) {}
    }
    updateRuntimeState(_gameState);
  }
  ensureStoreSubscription();
  startLoopScheduler((stepDelta) => {
    const normalizedDelta = typeof stepDelta === 'number' ? stepDelta : 1;
    try {
      engineStep(_engineContext, normalizedDelta);
    } catch (err) {
      console.error('Error during engine step', err);
    }
  }, () => {
    try { _drawFn(); } catch (err) {
      console.error('Error during draw', err);
    }
  }, () => {
    return !!(_gameState && _gameState.running);
  }, (dt) => {
    if (typeof _onFrameFn === 'function') {
      try { _onFrameFn(dt); } catch (err) {
        console.error('Error in onFrame callback', err);
      }
    }
  });
}
export function pause() {
  _running = false;
  try {
    dispatch(Actions.setRunning(false));
    syncStateFromStore();
  } catch (_) {
    if (_gameState) {
      try { _gameState.running = false; } catch (_) {}
    }
    updateRuntimeState(_gameState);
  }
  stopLoopScheduler();
}
export function resume() {
  if (!_gameState || !_engineContext || !_drawFn) return;
  if (_running) return;
  try {
    dispatch(Actions.setRunning(true));
    syncStateFromStore();
  } catch (_) {
    if (_gameState) {
      try { _gameState.running = true; } catch (_) {}
    }
    updateRuntimeState(_gameState);
  }
  _running = true;
  start({ gameState: _gameState, engineContext: _engineContext, draw: _drawFn, onFrame: _onFrameFn });
}
export function tick() {
  if (!_gameState || !_engineContext || !_drawFn) return;
  try { engineStep(_engineContext, 1); } catch (err) {
    console.error('Error during engine tick', err);
  }
  try { _drawFn(); } catch (err) {
    console.error('Error during draw', err);
  }
}
export function stop() {
  pause();
}
export default { start, pause, resume, tick };
