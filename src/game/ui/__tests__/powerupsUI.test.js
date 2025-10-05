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
  const doc = {
    getElementById: () => null,
    createElement: (tag) => ({
      tag,
      className: '',
      textContent: '',
      title: '',
      dataset: {},
      appendChild: () => {}
    })
  };
  globalThis.document = doc;
  globalThis.window = {};
  console.warn = () => {};
});

test.after(() => {
  restoreGlobals();
});

function createListStub() {
  const doc = globalThis.document;
  return {
    innerHTML: '',
    ownerDocument: doc,
    children: [],
    appendChild(node) {
      this.children.push(node);
    }
  };
}

test('updatePowerUpsUI delegates to HUD facade when available', async () => {
  const services = await servicesModulePromise;
  const { register, disposeService, TOKENS } = services;
  const { updatePowerUpsUI } = await import('../powerupsUI.js');

  const calls = [];
  const hudFacade = {
    updateTickerPowerups: (list) => {
      calls.push(list);
      return true;
    }
  };

  register(TOKENS.HUD, hudFacade, { force: true });

  const listEl = createListStub();
  updatePowerUpsUI(['accel', 'shield'], listEl);

  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0], ['accel', 'shield']);
  assert.strictEqual(listEl.children.length, 0);

  disposeService(TOKENS.HUD, { remove: true });
});

test('updatePowerUpsUI falls back to DOM when HUD missing', async () => {
  const services = await servicesModulePromise;
  const { disposeService, TOKENS } = services;
  const { updatePowerUpsUI } = await import('../powerupsUI.js');

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
      updateTickerPowerups: () => {
        globalCalled = true;
      }
    }
  };

  const listEl = createListStub();
  updatePowerUpsUI(['accel'], listEl);

  assert.strictEqual(globalCalled, false);
  assert.strictEqual(listEl.children.length, 1);
  assert.ok(warned);
  assert.ok(Array.from(warnings).some((msg) => String(msg).includes('HUD service unavailable for powerup updates')));
});

test('updatePowerUpsUI skips HUD facade when requested', async () => {
  const { updatePowerUpsUI } = await import('../powerupsUI.js');

  let warned = false;
  console.warn = () => {
    warned = true;
  };

  const listEl = createListStub();
  updatePowerUpsUI(['shield'], listEl, { skipFacade: true });

  assert.strictEqual(listEl.children.length, 1);
  assert.strictEqual(listEl.children[0].dataset.powerup, 'shield');
  assert.strictEqual(warned, false);
});
