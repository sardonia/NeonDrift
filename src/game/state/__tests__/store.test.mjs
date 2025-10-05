import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, createGameState } from '../store.js';
import * as Actions from '../actions.js';
import { MAX_LEVEL } from '../../Constants.js';

test('dispatching startGame sets running flag and snapshots are immutable', () => {
  const store = createStore({ preloadedState: createGameState() });
  const before = store.getState();
  assert.equal(before.running, false);
  assert.equal(Object.isFrozen(before), true);

  store.dispatch(Actions.startGame());

  const after = store.getState();
  assert.notStrictEqual(after, before);
  assert.equal(after.running, true);
  assert.equal(store.getMutableState().running, true);
  assert.equal(Object.isFrozen(after), true);
});

test('subscriptions receive snapshots with action metadata', () => {
  const store = createStore({ preloadedState: createGameState() });
  const events = [];
  const unsubscribe = store.subscribe((state, action) => {
    events.push({ state, action });
  });

  store.dispatch(Actions.pauseGame());
  unsubscribe();

  assert.equal(events.length, 1);
  assert.equal(events[0].state.running, false);
  assert.equal(events[0].action.type, Actions.Types.PAUSE_GAME);
  assert.equal(Object.isFrozen(events[0].state), true);
});

test('resetGame preserves persistent score when requested', () => {
  const store = createStore({ preloadedState: createGameState() });
  store.dispatch(Actions.setPersistentScore(200));
  store.dispatch(Actions.setScore(200));
  store.dispatch(Actions.resetGame({ preservePersistentScore: true }));

  const state = store.getMutableState();
  assert.equal(state.persistentScore, 200);
  assert.equal(state.score, 200);
  assert.equal(state.running, false);
  assert.equal(state.player.x, Math.floor(state.grid[0].length * 0.25));
});

test('setLevel clamps to maximum level and levelUp respects the cap', () => {
  const store = createStore({ preloadedState: createGameState() });
  store.dispatch(Actions.setLevel(MAX_LEVEL + 5));
  assert.equal(store.getMutableState().level, MAX_LEVEL);

  store.dispatch(Actions.levelUp());
  assert.equal(store.getMutableState().level, MAX_LEVEL);
});
