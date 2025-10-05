const test = require('node:test');
const assert = require('node:assert/strict');

const { createTickerRenderer } = require('../hud/ticker/renderer.js');
const { createTickerState, createTickerDomQueue } = require('../hud/ticker/state.js');

function createStubDomAdapter() {
  return {
    get() {
      return null;
    }
  };
}

test('syncTextMetrics measures width from DOM when canvas context is unavailable', () => {
  const state = createTickerState();
  state.text = 'NEON DRIFT';
  const domQueue = createTickerDomQueue();

  const trackFacade = {
    events: { on() { return () => {}; } },
    measurePrimaryWidth() { return 420; },
    setMode() {},
    updateLayout() {},
    setText() {}
  };

  const scrollEmitter = { emit() {} };

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

  renderer.syncTextMetrics({ resetOffset: true });

  assert.strictEqual(state.textWidth, 420);
  const expectedSpeed = (state.marqueeWidth + 420 + state.marqueeGap) / state.duration;
  assert.ok(Math.abs(state.speed - expectedSpeed) < 1e-9);
});
