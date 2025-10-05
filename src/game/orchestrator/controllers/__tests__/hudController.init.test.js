const test = require('node:test');
const assert = require('node:assert/strict');

const previousWindow = globalThis.window;
const previousDocument = globalThis.document;

let servicesModulePromise;

test.before(async () => {
  servicesModulePromise = import('../../../services/index.js');
});

test.beforeEach(() => {
  globalThis.window = {
    NeonHUD: {
      initHud: () => {
        throw new Error('global HUD should not be used');
      }
    }
  };
  globalThis.document = {
    getElementById: () => null
  };
});

test.after(() => {
  if (typeof previousWindow === 'undefined') {
    delete globalThis.window;
  } else {
    globalThis.window = previousWindow;
  }
  if (typeof previousDocument === 'undefined') {
    delete globalThis.document;
  } else {
    globalThis.document = previousDocument;
  }
});

function createButton() {
  return {
    addEventListener: () => {}
  };
}

function createDomShell() {
  return {
    startBtn: createButton(),
    againBtn: createButton(),
    nextLevelBtn: createButton(),
    board: {
      addEventListener: () => {},
      focus: () => {}
    },
    muteBtn: {},
    bgm: { id: 'bgm' }
  };
}

test('hudController.init wires HUD facade with audio controls', async () => {
  const services = await servicesModulePromise;
  const { register, disposeService, TOKENS } = services;
  const { init } = await import('../hudController.js');

  const dom = createDomShell();
  register(TOKENS.DOM, dom, { force: true });

  const audio = {
    toggleMuteCalls: 0,
    toggleMute() {
      this.toggleMuteCalls += 1;
    },
    isMutedCalls: 0,
    isMuted() {
      this.isMutedCalls += 1;
      return true;
    },
    prepareCountdownCalls: [],
    prepareCountdown(arg) {
      this.prepareCountdownCalls.push(arg);
      return 'prepared';
    }
  };

  let payload = null;
  const hudFacade = {
    initHud: (opts) => {
      payload = opts;
    }
  };

  init({
    DOM: dom,
    audio,
    hud: hudFacade,
    gameStateRef: { running: false }
  });

  assert.ok(payload);
  payload.toggleMute();
  assert.strictEqual(audio.toggleMuteCalls, 1);
  assert.strictEqual(payload.isMuted(), true);
  assert.strictEqual(audio.isMutedCalls, 1);
  payload.prepareCountdown({ id: 'custom' });
  assert.deepStrictEqual(audio.prepareCountdownCalls, [{ id: 'custom' }]);

  disposeService(TOKENS.DOM, { remove: true });
});

test('hudController.init resolves HUD facade from services when not provided', async () => {
  const services = await servicesModulePromise;
  const { register, disposeService, TOKENS } = services;
  const { init } = await import('../hudController.js');

  const dom = createDomShell();
  register(TOKENS.DOM, dom, { force: true });

  let payload = null;
  const hudFacade = {
    initHud: (opts) => {
      payload = opts;
    }
  };

  register(TOKENS.HUD, hudFacade, { force: true });

  init({
    DOM: dom,
    audio: {},
    gameStateRef: { running: false }
  });

  assert.ok(payload);

  disposeService(TOKENS.DOM, { remove: true });
  disposeService(TOKENS.HUD, { remove: true });
});
