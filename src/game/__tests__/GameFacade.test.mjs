import test from 'node:test';
import assert from 'node:assert/strict';
import { GameFacade } from '../Game.js';

function createState(overrides = {}) {
  return {
    level: 1,
    running: false,
    gameEnded: false,
    countdownActive: false,
    initialStartPending: true,
    levelTransitionPending: false,
    ...overrides
  };
}

function createBus() {
  const handlers = new Map();
  const events = [];
  return {
    events,
    on(type, handler) {
      const list = handlers.get(type) || [];
      list.push(handler);
      handlers.set(type, list);
    },
    off(type, handler) {
      const list = handlers.get(type);
      if (!list) return;
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
      if (list.length === 0) handlers.delete(type);
    },
    emit(type, payload) {
      events.push({ type, payload });
      const list = handlers.get(type) || [];
      for (const fn of [...list]) {
        fn(payload);
      }
    }
  };
}

test('start normalises options and emits events', async () => {
  const bus = createBus();
  const startCalls = [];
  const orchestrator = {
    start: (opts) => {
      startCalls.push(opts);
    },
    pause: () => {},
    resume: () => {},
    startRound: () => {},
    nextLevel: () => {}
  };
  const state = createState({ running: true, initialStartPending: false });
  const facade = new GameFacade();
  facade.init({ orchestrator, state: { getState: () => state }, bus });

  let callbackContext;
  facade.start({
    preset: 'zen',
    gameOver: null,
    proceedToNextLevel: null,
    onStart: (ctx) => {
      callbackContext = ctx;
    }
  });

  assert.equal(startCalls.length, 1);
  assert.equal(startCalls[0].preset, 'zen');
  assert.equal(typeof startCalls[0].gameOver, 'function');
  assert.equal(typeof startCalls[0].proceedToNextLevel, 'function');
  assert.ok(bus.events.some((evt) => evt.type === 'game:start'));
  assert.ok(callbackContext);
  assert.equal(callbackContext.status, 'running');
});

test('startRound falls back to facade start and triggers onRoundReady', async () => {
  const bus = createBus();
  const startCalls = [];
  const orchestrator = {
    start: (opts) => {
      startCalls.push(opts);
      return 'started';
    },
    pause: () => {},
    resume: () => {},
    startRound: ({ onStartGame }) => {
      onStartGame({ preset: 'story' });
      return 'round-started';
    },
    nextLevel: () => {}
  };
  const state = createState({ running: true, initialStartPending: false });
  const facade = new GameFacade();
  facade.init({ orchestrator, state: { getState: () => state }, bus });

  const readiness = [];
  const result = facade.startRound({
    onRoundReady: (ctx) => readiness.push(ctx)
  });

  assert.equal(result, 'round-started');
  assert.equal(startCalls.length, 1);
  assert.equal(startCalls[0].preset, 'story');
  assert.equal(readiness.length, 1);
  assert.equal(readiness[0].status, 'running');
});

test('nextLevel supports asynchronous orchestrator responses', async () => {
  const bus = createBus();
  const orchestrator = {
    start: () => {},
    pause: () => {},
    resume: () => {},
    startRound: () => {},
    nextLevel: () => Promise.resolve({ level: 5 })
  };
  const state = createState({ running: true, initialStartPending: false, level: 4 });
  const facade = new GameFacade();
  facade.init({ orchestrator, state: { getState: () => state }, bus });

  let readyContext;
  const result = await facade.nextLevel({
    onRoundReady: (ctx) => {
      readyContext = ctx;
    }
  });

  assert.deepEqual(result, { level: 5 });
  assert.ok(readyContext);
  assert.equal(readyContext.status, 'running');
});

test('start flow errors are reported via callbacks without throwing', () => {
  const bus = createBus();
  const error = new Error('boom');
  const orchestrator = {
    start: () => {
      throw error;
    },
    pause: () => {},
    resume: () => {},
    startRound: () => {},
    nextLevel: () => {}
  };
  const state = createState();
  const facade = new GameFacade();
  facade.init({ orchestrator, state: { getState: () => state }, bus });

  let captured;
  const result = facade.start({
    onError: (err, ctx) => {
      captured = { err, ctx };
    }
  });

  assert.equal(result, undefined);
  assert.ok(captured);
  assert.equal(captured.err, error);
  assert.equal(captured.ctx.type, 'start');
});

test('getStatus reflects state flags and disposal', () => {
  const bus = createBus();
  const mutableState = createState();
  const facade = new GameFacade();
  facade.init({ orchestrator: {}, state: { getState: () => mutableState }, bus });

  assert.equal(facade.getStatus(), 'ready');
  mutableState.countdownActive = true;
  assert.equal(facade.getStatus(), 'countdown');
  mutableState.countdownActive = false;
  mutableState.running = true;
  assert.equal(facade.getStatus(), 'running');
  mutableState.running = false;
  mutableState.levelTransitionPending = true;
  assert.equal(facade.getStatus(), 'transition');
  mutableState.levelTransitionPending = false;
  mutableState.gameEnded = true;
  assert.equal(facade.getStatus(), 'ended');
  facade.dispose();
  assert.equal(facade.getStatus(), 'disposed');
});
