const test = require('node:test');
const assert = require('node:assert/strict');

const { createTickerRenderer } = require('../hud/ticker/renderer.js');
const { createTickerState, createTickerDomQueue } = require('../hud/ticker/state.js');
const { TickerOrchestrator } = require('../hud/ticker/orchestrator.js');
const { TickerTrackEvent } = require('../hud/ticker/tickerTrackFacade.js');

function createStubDomAdapter() {
  return {
    get() {
      return null;
    }
  };
}

function createMockTrackFacade(overrides = {}) {
  const listeners = new Map();
  const events = {
    on(event, handler) {
      if (typeof handler !== 'function') {
        return () => {};
      }
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      const handlers = listeners.get(event);
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
        if (!handlers.size) {
          listeners.delete(event);
        }
      };
    }
  };
  const facade = {
    events,
    emit(event, payload) {
      const handlers = listeners.get(event);
      if (!handlers) return;
      for (const handler of [...handlers]) {
        handler(payload);
      }
    },
    getListenerCount(event) {
      const handlers = listeners.get(event);
      return handlers ? handlers.size : 0;
    },
    measurePrimaryWidth(fallback) {
      return fallback;
    },
    setMode() {},
    updateLayout() {},
    setText() {},
    syncFromIntent() {},
    dispose() {}
  };
  return Object.assign(facade, overrides);
}

test('renderer publishes scroll intent through provided emitter', () => {
  const state = createTickerState();
  state.text = 'HELLO PILOT';
  state.marqueeWidth = 320;
  state.marqueeGap = 60;
  const domQueue = createTickerDomQueue();

  const intents = [];
  const scrollEmitter = { emit(payload) { intents.push(payload); } };

  const trackFacade = createMockTrackFacade({
    measurePrimaryWidth() { return 480; }
  });

  const renderer = createTickerRenderer({
    state,
    dom: createStubDomAdapter(),
    domQueue,
    marqueeCache: {},
    metrics: null,
    worker: null,
    pointerTelemetry: null,
    trackFacade,
    scrollEmitter
  });

  renderer.step(16);

  assert.strictEqual(intents.length, 1);
  assert.strictEqual(intents[0].centered, false);
  assert.strictEqual(intents[0].reset, false);
  assert.strictEqual(intents[0].text, 'HELLO PILOT');
});

test('TickerOrchestrator schedules frames via requestAnimationFrame', () => {
  const state = createTickerState();
  const domQueue = createTickerDomQueue();
  const trackFacade = createMockTrackFacade();
  const steps = [];

  const renderer = {
    init() {},
    updateLayout() {},
    setText() {},
    updateScore() {},
    updateLevel() {},
    updatePowerups() {},
    syncTextMetrics() {},
    pause() { state.paused = true; },
    resume() { state.paused = false; },
    showPauseTicker() { state.paused = true; },
    hidePauseTicker() { state.paused = false; },
    dispose() {},
    step() {
      steps.push(true);
      state.paused = true;
    }
  };

  const orchestrator = new TickerOrchestrator({
    renderer,
    state,
    worker: null,
    domQueue,
    trackFacade
  });

  let scheduledCallback = null;
  const originalRaf = global.requestAnimationFrame;
  const originalCancelRaf = global.cancelAnimationFrame;
  global.requestAnimationFrame = (cb) => {
    scheduledCallback = cb;
    return 99;
  };
  global.cancelAnimationFrame = () => {
    scheduledCallback = null;
  };

  orchestrator.resume();

  assert.ok(typeof scheduledCallback === 'function');
  scheduledCallback(120);
  assert.strictEqual(steps.length, 1);
  assert.strictEqual(scheduledCallback, null);

  orchestrator.dispose();
  global.requestAnimationFrame = originalRaf;
  global.cancelAnimationFrame = originalCancelRaf;
});

test('orchestrator dispose preserves dom fallback when facade is retained', () => {
  const state = createTickerState();
  state.text = 'READY FOR LAUNCH';
  const domQueue = createTickerDomQueue();

  const intents = [];
  const scrollEmitter = { emit(payload) { intents.push(payload); } };

  const trackFacade = createMockTrackFacade();

  const renderer = createTickerRenderer({
    state,
    dom: createStubDomAdapter(),
    domQueue,
    marqueeCache: {},
    metrics: null,
    worker: null,
    pointerTelemetry: null,
    trackFacade,
    scrollEmitter
  });

  const orchestrator = new TickerOrchestrator({
    renderer,
    state,
    worker: null,
    domQueue,
    trackFacade,
    scrollEmitter
  });

  trackFacade.emit(TickerTrackEvent.TRACK_READY, { active: true });
  assert.strictEqual(state.domTrackActive, true);

  const intentsBeforeDispose = intents.length;

  orchestrator.dispose({ disposeTrackFacade: false });

  assert.strictEqual(state.domTrackActive, true);
  assert.ok(trackFacade.getListenerCount(TickerTrackEvent.TRACK_READY) > 0);

  trackFacade.emit(TickerTrackEvent.TRACK_READY, { active: false });
  assert.strictEqual(state.domTrackActive, false);

  trackFacade.emit(TickerTrackEvent.TRACK_READY, { active: true });
  assert.strictEqual(state.domTrackActive, true);
  assert.ok(intents.length >= intentsBeforeDispose + 1);
});
