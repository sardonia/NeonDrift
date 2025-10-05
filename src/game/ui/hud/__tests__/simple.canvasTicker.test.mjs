import test from 'node:test';
import assert from 'node:assert/strict';

import { createHudService } from '../facade.js';
import { createSimpleCanvasTicker } from '../ticker/simpleCanvasTicker.js';

test('simple canvas ticker drives marquee canvas without DOM track scaffolding', async () => {
  const originalRaf = global.requestAnimationFrame;
  const originalCancel = global.cancelAnimationFrame;

  const rafQueue = [];
  global.requestAnimationFrame = (cb) => {
    rafQueue.push(cb);
    return rafQueue.length;
  };
  global.cancelAnimationFrame = (id) => {
    const index = id - 1;
    if (index >= 0 && index < rafQueue.length) {
      rafQueue.splice(index, 1);
    }
  };

  const drawCalls = [];

  function createStubCanvasDriver({ state }) {
    return {
      attach() {
        return { ready: true };
      },
      resize() {
        return { ready: true };
      },
      draw() {
        drawCalls.push({ text: state.text, offset: state.offset });
        state.canvasReady = true;
        return { ready: true, drewFrame: true };
      },
      measureTextWidth(text) {
        return (text || '').length * 12 + 24;
      },
      detach() {},
    };
  }

  const tickerCanvas = {
    width: 640,
    height: 72,
    clientWidth: 640,
    clientHeight: 72,
    style: {},
  };

  let appendCount = 0;
  const tickerHud = {
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild() {
      appendCount += 1;
      return null;
    },
  };

  const tickerText = {
    textContent: 'READY TO ROLL',
    setAttribute() {},
  };

  const dom = {
    tickerCanvas,
    tickerHud,
    tickerText,
  };

  const doc = {
    getElementById(id) {
      if (id === 'tickerText') return tickerText;
      if (id === 'tickerHUD') return tickerHud;
      if (id === 'tickerCanvas') return tickerCanvas;
      return null;
    },
    createElement() {
      throw new Error('DOM track scaffolding should not be created');
    },
  };

  const fakeWorkerFactory = () => ({
    isActive: () => false,
    isReady: () => true,
    getQueueSize: () => 0,
    dispose() {},
    postMessage() {},
  });

  const hud = createHudService({
    dom,
    bus: { on() { return () => {}; } },
    audio: {},
    debugState: { exposeHudGlobal: false },
    document: doc,
    createWorker: fakeWorkerFactory,
    useSimpleTicker: true,
    createSimpleTicker: (options) => createSimpleCanvasTicker({
      ...options,
      createCanvasDriver: createStubCanvasDriver,
    }),
    tickerSchedule: {
      read: (fn) => fn(),
      mutate: (fn) => fn(),
      microtask: (fn) => fn(),
    },
  });

  function runNextFrame() {
    const cb = rafQueue.shift();
    if (cb) {
      cb(Date.now());
    }
  }

  hud.initHud({ pointerTelemetry: false });
  runNextFrame();

  assert.ok(drawCalls.length >= 1, 'expected an initial canvas draw call');
  assert.equal(drawCalls[0].text, 'READY TO ROLL');

  hud.setTickerText('MISSION READY');
  runNextFrame();

  const lastCall = drawCalls.at(-1);
  assert.ok(lastCall, 'expected a draw call after updating text');
  assert.equal(lastCall.text, 'MISSION READY');
  assert.equal(appendCount, 0, 'no track nodes should be appended when using the simple ticker');

  if (typeof hud.dispose === 'function') {
    hud.dispose();
  }

  global.requestAnimationFrame = originalRaf;
  global.cancelAnimationFrame = originalCancel;
});
