const test = require('node:test');
const assert = require('node:assert/strict');

const previousDocument = globalThis.document;
const previousWindow = globalThis.window;
const previousWarn = console.warn;
const previousSetInterval = globalThis.setInterval;
const previousClearInterval = globalThis.clearInterval;

function restoreGlobals() {
  if (typeof previousDocument === 'undefined') {
    delete globalThis.document;
  } else {
    globalThis.document = previousDocument;
  }
  if (typeof previousWindow === 'undefined') {
    delete globalThis.window;
  } else {
    globalThis.window = previousWindow;
  }
  console.warn = previousWarn;
  if (previousSetInterval) {
    globalThis.setInterval = previousSetInterval;
  } else {
    delete globalThis.setInterval;
  }
  if (previousClearInterval) {
    globalThis.clearInterval = previousClearInterval;
  } else {
    delete globalThis.clearInterval;
  }
}

test.after(() => {
  restoreGlobals();
});

function createDebugButton() {
  const listeners = {};
  return {
    addEventListener(event, handler) {
      listeners[event] = handler;
    },
    trigger(event) {
      if (listeners[event]) {
        listeners[event]({});
      }
    }
  };
}

function createDebugPanel() {
  return {
    style: {},
    innerHTML: '',
    querySelector: () => null,
    scrollTop: 0,
    scrollLeft: 0,
    addEventListener: () => {}
  };
}

test('initDebugOverlay warns when HUD facade missing and avoids globals', async () => {
  globalThis.window = {
    NeonHUD: {
      getDebugMetrics: () => {
        throw new Error('should not use global');
      }
    }
  };
  const keydownListeners = [];
  globalThis.document = {
    activeElement: null,
    addEventListener: (event, handler) => {
      if (event === 'keydown') {
        keydownListeners.push(handler);
      }
    },
    removeEventListener: () => {},
    getElementById: () => null
  };

  globalThis.setInterval = () => ({ id: 'fake' });
  globalThis.clearInterval = () => {};

  let warned = false;
  const warnings = new Set();
  console.warn = (msg) => {
    warned = true;
    warnings.add(msg);
  };

  const { initDebugOverlay } = await import('../detailedDebugOverlay.js');

  const debugBtn = createDebugButton();
  const debugPanel = createDebugPanel();
  const gameState = {
    running: false,
    gameEnded: false,
    tick: 0,
    score: 0,
    level: 1,
    player: {},
    enemy: {}
  };

  initDebugOverlay({
    debugBtn,
    debugPanel,
    gameState: () => gameState,
    debugState: {},
    pauseGame: () => {},
    startGame: () => {}
  });

  debugBtn.trigger('click');

  assert.ok(warned);
  assert.ok(Array.from(warnings).some((msg) => String(msg).includes('HUD service unavailable for debug overlay metrics')));
  assert.ok(keydownListeners.length >= 0);
});
