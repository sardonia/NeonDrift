const test = require('node:test');
const assert = require('node:assert/strict');

if (typeof global.window === 'undefined') {
  global.window = {
    AudioContext: undefined,
    webkitAudioContext: undefined,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {}
  };
}
if (typeof global.document === 'undefined') {
  global.document = {
    getElementById: () => null,
    documentElement: {},
    createElement: () => ({ classList: { add() {}, remove() {} }, remove() {}, parentElement: null, appendChild() {} })
  };
}

test('startGame flow emits HUD and audio hooks', async () => {
  const { createStartGameFlow } = await import('../orchestrator/flows/startGame.js');
  const { HudChannels, AudioChannels } = await import('../core/events.js');

  const transitions = [];
  const busEvents = [];
  const dispatches = [];
  const audioCalls = [];
  const context = { player: null, enemy: null };

  const engineRefs = {
    playerRef: { current: null },
    enemyRef: { current: null },
    updateContextEngines(player, enemy) {
      context.player = player;
      context.enemy = enemy;
    }
  };

  const dom = { bgm: { paused: false, pause() { this.paused = true; } } };
  const audio = {
    prepareGameplay: () => audioCalls.push('prepareGameplay'),
    startEngines: () => {
      audioCalls.push('startEngines');
      return { player: { engine: 'player' }, enemy: { engine: 'enemy' } };
    },
    resetBgm: (_bgm, volume) => audioCalls.push(['resetBgm', volume]),
    playBgm: () => audioCalls.push('playBgm')
  };

  const startGame = createStartGameFlow({
    transitionToRunning: () => transitions.push('RUNNING'),
    getBus: () => ({ emit: (event, payload) => busEvents.push({ event, payload }) }),
    getAudioService: () => audio,
    getDomService: () => dom,
    dispatchStartGame: () => dispatches.push('START_GAME'),
    safe: (fn) => fn(),
    engineRefs
  });

  startGame();

  assert.deepStrictEqual(transitions, ['RUNNING']);
  assert.deepStrictEqual(
    busEvents.map((evt) => evt.event),
    [
      HudChannels.HIDE_OVERLAY.event,
      HudChannels.HIDE_OVERLAY.event,
      AudioChannels.RESUME_AND_UNLOCK.event,
      AudioChannels.START_ENGINES.event,
      AudioChannels.BGM_RESET_PLAY.event
    ]
  );
  assert.deepStrictEqual(dispatches, ['START_GAME']);
  assert.deepStrictEqual(audioCalls, [
    'prepareGameplay',
    'startEngines',
    ['resetBgm', 0.65],
    'playBgm'
  ]);
  assert.deepStrictEqual(engineRefs.playerRef.current, { engine: 'player' });
  assert.deepStrictEqual(engineRefs.enemyRef.current, { engine: 'enemy' });
  assert.deepStrictEqual(context, {
    player: { engine: 'player' },
    enemy: { engine: 'enemy' }
  });
  assert.strictEqual(dom.bgm.paused, false);
});

test('pauseGame flow restores overlay and quiets engines', async () => {
  const { createPauseGameFlow } = await import('../orchestrator/flows/pauseGame.js');
  const { HudChannels, AudioChannels } = await import('../core/events.js');

  const transitions = [];
  const busEvents = [];
  const dispatches = [];
  const audioCalls = [];
  const controllerCalls = [];
  const context = { player: { engine: 'player' }, enemy: { engine: 'enemy' } };

  const engineRefs = {
    playerRef: { current: { engine: 'player' } },
    enemyRef: { current: { engine: 'enemy' } },
    updateContextEngines(player, enemy) {
      context.player = player;
      context.enemy = enemy;
    }
  };

  const dom = { bgm: { paused: false, pause() { this.paused = true; } } };
  const audio = {
    stopEngines: () => audioCalls.push('stopEngines'),
    pauseBgm: (bgm) => audioCalls.push(['pauseBgm', bgm])
  };

  const pauseGame = createPauseGameFlow({
    transitionToPaused: () => transitions.push('PAUSED'),
    getBus: () => ({ emit: (event, payload) => busEvents.push({ event, payload }) }),
    getAudioService: () => audio,
    getDomService: () => dom,
    dispatchPauseGame: () => dispatches.push('PAUSE_GAME'),
    controllerSetEngineActive: () => controllerCalls.push('setEngineActive(false)'),
    safe: (fn) => fn(),
    engineRefs
  });

  pauseGame();

  assert.deepStrictEqual(transitions, ['PAUSED']);
  assert.deepStrictEqual(
    busEvents.map((evt) => evt.event),
    [HudChannels.SHOW_OVERLAY.event, AudioChannels.CUT_ALL.event]
  );
  assert.deepStrictEqual(dispatches, ['PAUSE_GAME']);
  assert.deepStrictEqual(audioCalls, [
    'stopEngines',
    ['pauseBgm', dom.bgm]
  ]);
  assert.deepStrictEqual(controllerCalls, ['setEngineActive(false)']);
  assert.strictEqual(dom.bgm.paused, true);
  assert.strictEqual(engineRefs.playerRef.current, null);
  assert.strictEqual(engineRefs.enemyRef.current, null);
  assert.deepStrictEqual(context, { player: null, enemy: null });
});

test('startup helpers register and verify services', async () => {
  const services = await import('../services/index.js');
  const { registerDefaultServices, ensureCoreServices } = await import('../orchestrator/startup.js');

  services.resetServices();
  const bus = { emit() {} };
  const constants = { SOME: 'value' };
  const dom = { ready: true };

  registerDefaultServices({ constants, bus, dom });

  assert.strictEqual(services.getService(services.TOKENS.BUS), bus);
  assert.strictEqual(services.getService(services.TOKENS.CONSTANTS), constants);
  assert.strictEqual(services.getService(services.TOKENS.DOM), dom);

  assert.throws(() => ensureCoreServices({ logger: null }), /Missing required services/);

  services.register(services.TOKENS.AUDIO, {}, { force: true });

  assert.doesNotThrow(() => ensureCoreServices({ logger: null }));
});

test('ensureCoreServices rejects buses without emit()', async () => {
  const services = await import('../services/index.js');
  const { ensureCoreServices } = await import('../orchestrator/startup.js');
  services.resetServices();

  services.registerInstance(services.TOKENS.CONSTANTS, {}, { force: true });
  services.registerInstance(services.TOKENS.DOM, {}, { force: true });
  services.registerInstance(services.TOKENS.AUDIO, {}, { force: true });
  services.registerInstance(services.TOKENS.BUS, {}, { force: true });

  assert.throws(() => ensureCoreServices({ logger: null }), /Invalid services: bus/);
  services.resetServices();
});

test('ensureCoreServices rejects non-object audio services', async () => {
  const services = await import('../services/index.js');
  const { ensureCoreServices } = await import('../orchestrator/startup.js');
  services.resetServices();

  services.registerInstance(services.TOKENS.BUS, { emit() {} }, { force: true });
  services.registerInstance(services.TOKENS.DOM, {}, { force: true });
  services.registerInstance(services.TOKENS.CONSTANTS, {}, { force: true });
  services.registerInstance(services.TOKENS.AUDIO, 'not-an-audio-service', { force: true });

  assert.throws(() => ensureCoreServices({ logger: null }), /Invalid services: audio/);
  services.resetServices();
});

test('registerDefaultRuntimeServices respects force=false when services exist', async () => {
  const services = await import('../services/index.js');
  const { registerDefaultRuntimeServices } = await import('../config/defaultServices.js');

  services.resetServices();
  const customBus = { emit() {} };
  services.registerInstance(services.TOKENS.BUS, customBus, { force: true });

  const registration = registerDefaultRuntimeServices({}, { force: false });

  assert.strictEqual(services.getService(services.TOKENS.BUS), customBus);
  assert.strictEqual(registration.bus, customBus);
  services.resetServices();
});

test('orchestrator auto-registers runtime defaults on demand', async () => {
  const services = await import('../services/index.js');
  const orchestrator = await import('../orchestrator.js');

  orchestrator.shutdown();
  services.resetServices();

  const domRefs = orchestrator.getDomRefs();
  assert.ok(domRefs && typeof domRefs === 'object');

  assert.ok(services.hasService(services.TOKENS.BUS));
  assert.ok(services.hasService(services.TOKENS.CONSTANTS));
  assert.ok(services.hasService(services.TOKENS.DOM));
  assert.ok(services.hasService(services.TOKENS.AUDIO));

  orchestrator.shutdown();
  services.resetServices();
});