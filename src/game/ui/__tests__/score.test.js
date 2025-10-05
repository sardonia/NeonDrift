const test = require('node:test');
const assert = require('node:assert/strict');

const previousDocument = globalThis.document;
const previousWindow = globalThis.window;
const previousWarn = console.warn;

let servicesModulePromise;

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
}

test.before(async () => {
  servicesModulePromise = import('../../services/index.js');
});

test.beforeEach(() => {
  globalThis.document = {
    getElementById: () => null
  };
  globalThis.window = {};
  console.warn = () => {};
});

test.after(() => {
  restoreGlobals();
});

function createElementStub() {
  return {
    textContent: ''
  };
}

test('updateScore prefers HUD facade when available', async () => {
  const services = await servicesModulePromise;
  const { register, disposeService, TOKENS } = services;
  const { updateScore } = await import('../score.js');

  let capturedValue = null;
  const hudFacade = {
    setScore: ({ value }) => {
      capturedValue = value;
    }
  };

  register(TOKENS.HUD, hudFacade, { force: true });

  const el = createElementStub();
  updateScore(42, el);

  assert.strictEqual(capturedValue, 42);
  assert.strictEqual(el.textContent, '');

  disposeService(TOKENS.HUD, { remove: true });
});

test('updateScore falls back to DOM when HUD missing and does not use globals', async () => {
  const services = await servicesModulePromise;
  const { disposeService, TOKENS } = services;
  const { updateScore } = await import('../score.js');

  disposeService(TOKENS.HUD, { remove: true });

  let warned = false;
  const warnings = new Set();
  console.warn = (msg) => {
    warned = true;
    warnings.add(msg);
  };

  let globalCalled = false;
  globalThis.window = {
    NeonHUD: {
      updateTickerScore: () => {
        globalCalled = true;
      }
    }
  };

  const el = createElementStub();
  updateScore(9, el);

  assert.strictEqual(el.textContent, '9');
  assert.strictEqual(globalCalled, false);
  assert.ok(warned);
  assert.ok(Array.from(warnings).some((msg) => String(msg).includes('HUD service unavailable for score updates')));
});

test('subscribeScoreUpdates delegates to HUD facade', async () => {
  const services = await servicesModulePromise;
  const { register, disposeService, TOKENS } = services;
  const { subscribeScoreUpdates, unsubscribeScoreUpdates } = await import('../score.js');

  let handler = null;
  const bus = {
    on: (event, fn) => {
      handler = fn;
      return () => {
        handler = null;
      };
    }
  };

  const received = [];
  const hudFacade = {
    setScore: ({ value }) => {
      received.push(value);
    }
  };

  register(TOKENS.BUS, bus, { force: true });
  register(TOKENS.HUD, hudFacade, { force: true });

  subscribeScoreUpdates();
  assert.ok(handler);
  handler({ value: 77 });
  handler({ score: 88 });

  assert.deepStrictEqual(received, [77, 88]);

  unsubscribeScoreUpdates();
  disposeService(TOKENS.BUS, { remove: true });
  disposeService(TOKENS.HUD, { remove: true });
});

test('updateLevel prefers HUD facade and falls back gracefully', async () => {
  const services = await servicesModulePromise;
  const { register, disposeService, TOKENS } = services;
  const { updateLevel } = await import('../score.js');

  let levelValue = null;
  const hudFacade = {
    setLevel: ({ value }) => {
      levelValue = value;
    }
  };

  register(TOKENS.HUD, hudFacade, { force: true });
  const el = createElementStub();
  updateLevel(5, el);
  assert.strictEqual(levelValue, 5);
  assert.strictEqual(el.textContent, '');

  disposeService(TOKENS.HUD, { remove: true });

  let warned = false;
  console.warn = () => {
    warned = true;
  };
  const fallbackEl = createElementStub();
  updateLevel(12, fallbackEl);
  assert.strictEqual(fallbackEl.textContent, '12');
  assert.ok(warned);
});
