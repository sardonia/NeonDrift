const { test, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let levelElement = { textContent: '' };

function createCanvasContextStub() {
  const ctx = {
    canvas: { width: 800, height: 600 },
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fillRect() {},
    clearRect() {},
    drawImage() {},
    setLineDash() {},
    arc() {},
    translate() {},
    scale() {},
    rotate() {},
    setTransform() {},
    fill() {},
    strokeRect() {},
    rect() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; }
  };
  ctx.globalCompositeOperation = '';
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#000000';
  ctx.fillStyle = '#000000';
  ctx.shadowBlur = 0;
  ctx.shadowColor = '#000000';
  ctx.lineCap = 'round';
  return ctx;
}

function createCanvasStub() {
  const ctx = createCanvasContextStub();
  return {
    width: 800,
    height: 600,
    getContext: () => ctx
  };
}

function setupDomEnvironment() {
  levelElement = { textContent: '' };
  const documentStub = {
    documentElement: {},
    getElementById: (id) => (id === 'level' ? levelElement : null),
    createElement: () => createCanvasStub(),
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  const windowStub = {
    document: documentStub,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {}
  };
  global.document = documentStub;
  global.window = windowStub;
}

function createDomService() {
  return {
    board: createCanvasStub(),
    trails: createCanvasStub(),
    fx: createCanvasStub(),
    wallsGlow: createCanvasStub(),
    borderFx: createCanvasStub(),
    paths: createCanvasStub(),
    level: levelElement
  };
}

function createModuleUrl(relativePath, tag) {
  const absolutePath = path.join(__dirname, relativePath);
  const url = pathToFileURL(absolutePath);
  if (tag) {
    url.searchParams.set('test', tag);
  }
  return url.href;
}

function importOrchestrator(tag) {
  return import(createModuleUrl('../../orchestrator.js', tag));
}

beforeEach(() => {
  global.__NEON_MAIN_AUTOSTART__ = false;
  setupDomEnvironment();
});

afterEach(() => {
  mock.restoreAll();
});

function registerBaseServices(servicesModule, domService, audioService, uiService) {
  const { registerInstance, TOKENS } = servicesModule;
  const constantsModulePromise = import('../../Constants.js');
  return constantsModulePromise.then((constantsModule) => {
    registerInstance(TOKENS.BUS, { emit() {} });
    registerInstance(TOKENS.CONSTANTS, constantsModule);
    registerInstance(TOKENS.DOM, domService);
    registerInstance(TOKENS.AUDIO, audioService);
    registerInstance(TOKENS.RNG, () => 0.5);
    registerInstance(TOKENS.DEBUG_STATE, { ai: {}, aug: {} });
    registerInstance(TOKENS.UI, uiService);
    registerInstance(TOKENS.LOOP, { start() {}, pause() {}, resume() {}, stop() {} });
    registerInstance(TOKENS.INPUT, { initInput() {} });
  });
}

test('orchestrator init resolves state and context when bootstrap succeeds', async () => {
  const servicesModule = await import('../../services/index.js');
  servicesModule.resetServices();

  const domService = createDomService();
  const audioCalls = [];
  const audioService = { init: (opts) => audioCalls.push(opts) };
  let hudInitCalls = 0;
  const uiService = { initHudSubscriptions: () => { hudInitCalls += 1; } };

  await registerBaseServices(servicesModule, domService, audioService, uiService);

  const orchestrator = await importOrchestrator('success');

  servicesModule.registerInstance(servicesModule.TOKENS.AUDIO, audioService, { force: true });
  servicesModule.registerInstance(servicesModule.TOKENS.UI, uiService, { force: true });
  servicesModule.registerInstance(servicesModule.TOKENS.DOM, domService, { force: true });

  const result = orchestrator.init();

  assert.ok(result.state, 'bootstrap should return a game state');
  assert.ok(result.context, 'bootstrap should return an engine context');
  assert.strictEqual(orchestrator.getLevel(), 1);
  assert.ok(result.context.render, 'engine context should expose render bindings');
  assert.strictEqual(audioCalls.length, 1, 'audio.init should be invoked once');
  assert.strictEqual(levelElement.textContent, '1', 'UI level element should be updated');
  assert.strictEqual(hudInitCalls, 1, 'HUD service should be initialised');
});

test('orchestrator init falls back when a required service is invalid', async () => {
  const servicesModule = await import('../../services/index.js');
  servicesModule.resetServices();

  const domService = createDomService();
  const audioService = { init: () => {} };
  const uiService = { initHudSubscriptions: () => {} };

  await registerBaseServices(servicesModule, domService, audioService, uiService);

  const orchestrator = await importOrchestrator('fallback');

  servicesModule.registerInstance(servicesModule.TOKENS.AUDIO, audioService, { force: true });
  servicesModule.registerInstance(servicesModule.TOKENS.UI, uiService, { force: true });
  servicesModule.registerInstance(servicesModule.TOKENS.DOM, null, { force: true });

  const consoleErrorMock = mock.method(console, 'error', () => {});

  const result = orchestrator.init();

  assert.ok(result.state, 'fallback should supply a game state');
  assert.deepStrictEqual(result.context, {}, 'fallback should provide an empty context');
  assert.strictEqual(orchestrator.getLevel(), 1, 'fallback should keep level at default');
  assert.strictEqual(levelElement.textContent, '1', 'fallback should update UI level');
});
