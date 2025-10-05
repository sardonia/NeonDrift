const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function createBus(events) {
  return {
    emit(event, payload) {
      events.push({ event, payload });
      return true;
    }
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

const previousDocument = globalThis.document;
const previousWindow = globalThis.window;

function ensureDomGlobals() {
  if (!globalThis.document) {
    globalThis.document = {
      getElementById() {
        return null;
      }
    };
  }
  if (!globalThis.window) {
    globalThis.window = {};
  }
}

test.after(() => {
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
});

test('GameRuntimeContext exposes typed sub-contexts', async () => {
  const { createGameRuntimeContext } = await import('../context.js');

  const gameState = { level: 2, score: 10 };
  const render = {
    boardCtx: {},
    tctx: {},
    pctx: {},
    board: {},
    trails: {},
    fx: {},
    trailPlayer: [],
    trailEnemy: [],
    PULSE_SPAN: 5,
    colors: {
      playerCore: '#fff',
      playerGlow: '#0ff',
      enemyCore: '#f00',
      enemyGlow: '#0f0'
    },
    drawFrame: ({ gameState: gs }) => {
      // Basic sanity check to ensure fallback draw works.
      assert.ok(gs === render.state || gs === gameState);
    },
    state: gameState
  };
  const engineContext = { render, state: gameState, keysHeld: {} };
  const orchestratorCtx = {
    gameStateRef: gameState,
    engineContextRef: engineContext,
    playerEngineRef: { current: { id: 'player' } },
    enemyEngineRef: { current: { id: 'enemy' } }
  };

  let spawnArgs = null;
  const uiService = {
    showCountdown() {},
    hidePausePanel() {},
    showPausePanel() {},
    updatePauseMessage() {}
  };

  const context = createGameRuntimeContext({
    orchestratorCtx,
    services: {
      audio: { name: 'audio-service' },
      dom: { powerBagList: {} },
      ui: uiService,
      constants: { PULSE_SPAN: 3, MAX_LEVEL: 9 },
      bus: createBus([])
    },
    selectors: {
      getState: () => gameState,
      getLevel: () => gameState.level
    },
    controllers: {
      startLoop: () => {},
      pauseLoop: () => {},
      startGame: () => {},
      pauseGame: () => {},
      controllerSetEngineActive: () => {},
      debugController: { recordFrame() {} }
    },
    helpers: {
      spawnRound: (params) => {
        spawnArgs = params;
      },
      createResetPowerUps: () => () => {},
      resetPowerBag: () => {},
      updateLevel: () => {},
      updateScore: () => {},
      startRoundHelper: () => {},
      nextLevelHelper: () => {},
      cycleColours: {
        PLAYER_CYCLE_CORE: '#111',
        PLAYER_CYCLE_GLOW: '#222',
        ENEMY_CYCLE_CORE: '#333',
        ENEMY_CYCLE_GLOW: '#444'
      }
    }
  });

  assert.ok(context.loop);
  assert.strictEqual(typeof context.loop.start, 'function');
  assert.strictEqual(typeof context.loop.setEngineActive, 'function');
  assert.ok(context.audio);
  assert.strictEqual(context.audio.service.name, 'audio-service');
  assert.ok(context.hud);
  assert.strictEqual(context.hud.service, uiService);
  assert.strictEqual(context.hud.service, context.hud.controller);
  assert.ok(context.hud.dom);
  assert.ok(context.round);
  assert.strictEqual(typeof context.round.spawn, 'function');
  context.round.spawn();
  assert.ok(spawnArgs);
  assert.strictEqual(spawnArgs.engineContext, engineContext);
  assert.strictEqual(spawnArgs.gameState, gameState);
  assert.strictEqual(typeof context.round.getResetPowerUps(), 'function');
  assert.strictEqual(context.state.getLevel(), 2);
});

test('startRoundFlow consumes runtime context slices', async () => {
  const { createGameRuntimeContext } = await import('../context.js');
  const { startRoundFlow } = await import('../controllers/roundController.js');

  const gameState = { score: 5, level: 1 };
  const orchestratorCtx = {
    gameStateRef: gameState,
    engineContextRef: { render: {}, keysHeld: {} },
    playerEngineRef: { current: null },
    enemyEngineRef: { current: null }
  };

  const spawnCalls = [];
  const updateScores = [];
  const levelUpdates = [];
  const resetPayloads = [];
  const audioCalls = [];
  let helperArgs = null;
  let countdownPayload = null;
  let startGameCalls = 0;

  const uiService = {
    showCountdown: (payload) => {
      countdownPayload = payload;
      if (payload && typeof payload.onDone === 'function') {
        payload.onDone();
      }
    }
  };

  const context = createGameRuntimeContext({
    orchestratorCtx,
    services: {
      audio: {
        prepareCountdown: () => audioCalls.push('prepare')
      },
      dom: { bgm: { tag: 'audio' }, powerBagList: {} },
      ui: uiService,
      constants: { PULSE_SPAN: 3 },
      bus: null
    },
    selectors: {
      getState: () => gameState
    },
    controllers: {
      startGame: () => {
        startGameCalls += 1;
      }
    },
    helpers: {
      spawnRound: (params) => spawnCalls.push(params),
      updateScore: (score) => updateScores.push(score),
      updateLevel: (level) => levelUpdates.push(level),
      createResetPowerUps: ({ gameState: gs }) => (payload) => {
        resetPayloads.push({ payload, score: gs.score });
      },
      resetPowerBag: () => {},
      startRoundHelper: (args) => {
        helperArgs = args;
        return { newLevel: 3 };
      },
      computeEnemySpeed: (level) => level * 10,
      cycleColours: {}
    }
  });

  const intervalRef = { current: null };
  const playerRef = { current: null };
  const enemyRef = { current: null };

  startRoundFlow({
    intervalRef,
    playerEngineRef: playerRef,
    enemyEngineRef: enemyRef,
    startGame: () => {
      startGameCalls += 5;
    },
    resetLevel1: true
  }, context);

  assert.ok(helperArgs);
  assert.strictEqual(helperArgs.intervalRef, intervalRef);
  assert.strictEqual(helperArgs.playerEngineRef, playerRef);
  assert.strictEqual(helperArgs.enemyEngineRef, enemyRef);
  assert.strictEqual(helperArgs.resetLevel1, true);
  assert.strictEqual(typeof helperArgs.resetPowerUps, 'function');
  assert.strictEqual(typeof helperArgs.spawn, 'function');
  assert.strictEqual(helperArgs.audio, context.audio.service);
  assert.strictEqual(helperArgs.bgm.tag, 'audio');
  assert.strictEqual(helperArgs.showCountdown, context.hud.showCountdown);
  assert.strictEqual(context.hud.service, uiService);
  assert.strictEqual(levelUpdates.includes(3), true);
  assert.strictEqual(spawnCalls.length >= 1, true);
  assert.strictEqual(updateScores.includes(gameState.score), true);
  assert.strictEqual(resetPayloads.some((entry) => entry.payload && entry.payload.clearPickup === true), true);
  assert.strictEqual(audioCalls.includes('prepare'), true);
  assert.ok(countdownPayload);
  assert.strictEqual(typeof countdownPayload.onDone, 'function');
  assert.ok(startGameCalls > 0);
});

test('proceedToNextLevelFlow coordinates loop and round slices', async () => {
  const { createGameRuntimeContext } = await import('../context.js');
  const { proceedToNextLevelFlow } = await import('../controllers/roundController.js');
  const { HudChannels } = await import('../../core/events.js');

  const gameState = { level: 2, score: 50, persistentScore: 120 };
  const playerEngineRef = { current: { id: 'p' } };
  const enemyEngineRef = { current: { id: 'e' } };
  const orchestratorCtx = {
    gameStateRef: gameState,
    engineContextRef: { render: {}, keysHeld: {} },
    playerEngineRef,
    enemyEngineRef
  };

  const loopCalls = [];
  const audioCalls = [];
  const engineActiveCalls = [];
  const resetPayloads = [];
  const spawnCalls = [];
  const updateScores = [];
  const setLevelCalls = [];
  let helperArgs = null;
  const busEvents = [];

  const context = createGameRuntimeContext({
    orchestratorCtx,
    services: {
      audio: {
        cutAll: () => audioCalls.push('cutAll'),
        stopEngines: () => audioCalls.push('stopEngines'),
        killEngines: () => audioCalls.push('killEngines')
      },
      dom: { powerBagList: {} },
      ui: { hidePausePanel: () => {} },
      constants: { MAX_LEVEL: 9, computeEnemySpeed: (level) => level * 5 },
      bus: createBus(busEvents)
    },
    selectors: {
      getState: () => gameState,
      getLevel: () => gameState.level
    },
    controllers: {
      pauseLoop: () => loopCalls.push('pauseLoop'),
      controllerSetEngineActive: (on, refs) => {
        engineActiveCalls.push({ on, refs });
      },
      startRound: () => loopCalls.push('startRound')
    },
    helpers: {
      createResetPowerUps: ({ gameState: gs }) => (payload) => resetPayloads.push({ payload, score: gs.score }),
      resetPowerBag: () => {},
      spawnRound: (params) => spawnCalls.push(params),
      updateScore: (score) => updateScores.push(score),
      updateLevel: (level) => setLevelCalls.push(level),
      nextLevelHelper: (args) => {
        helperArgs = args;
        return { newLevel: 4 };
      },
      cycleColours: {},
      computeEnemySpeed: (level) => level * 4
    }
  });

  const result = proceedToNextLevelFlow({}, context);

  assert.ok(helperArgs);
  assert.strictEqual(helperArgs.gameState, gameState);
  assert.strictEqual(typeof helperArgs.computeEnemySpeed, 'function');
  assert.strictEqual(helperArgs.LEVEL, 2);
  assert.strictEqual(helperArgs.MAX_LEVEL, 9);
  assert.strictEqual(loopCalls.includes('pauseLoop'), true);
  assert.strictEqual(engineActiveCalls.length, 1);
  assert.strictEqual(engineActiveCalls[0].on, false);
  assert.strictEqual(engineActiveCalls[0].refs.playerEngineRef, playerEngineRef);
  assert.strictEqual(engineActiveCalls[0].refs.enemyEngineRef, enemyEngineRef);
  assert.strictEqual(audioCalls.includes('cutAll'), true);
  assert.strictEqual(audioCalls.includes('stopEngines'), true);
  assert.strictEqual(audioCalls.includes('killEngines'), true);
  assert.strictEqual(resetPayloads.some((entry) => entry.payload && entry.payload.clearPickup === true), true);
  assert.strictEqual(spawnCalls.length >= 1, true);
  assert.strictEqual(updateScores.includes(gameState.persistentScore), true);
  assert.strictEqual(setLevelCalls.includes(4), true);
  assert.strictEqual(busEvents.some((evt) => evt.event === HudChannels.HIDE_OVERLAY.event), true);
  assert.ok(result);
  assert.strictEqual(result.newLevel, 4);
  assert.strictEqual(typeof result.newEnemySpeed !== 'undefined', true);
});

test('gameFlowController guards require runtime slices', async () => {
  ensureDomGlobals();
  const gameFlow = await import(createModuleUrl('../controllers/gameFlowController.js', 'guard'));

  const baseStartContext = /** @type {import('../context.js').GameRuntimeContext} */ ({
    state: {},
    engines: {},
    audio: {},
    hud: {}
  });
  assert.throws(() => gameFlow.startGameFull({}, baseStartContext), /context\.loop/);

  const basePauseContext = /** @type {import('../context.js').GameRuntimeContext} */ ({
    state: {},
    engines: {},
    loop: {}
  });
  assert.throws(() => gameFlow.pauseGameFull({}, basePauseContext), /context\.hud/);

  const baseRoundContext = /** @type {import('../context.js').GameRuntimeContext} */ ({
    engines: {},
    loop: {}
  });
  assert.throws(() => gameFlow.startRound({}, baseRoundContext), /context\.round/);

  const baseNextContext = /** @type {import('../context.js').GameRuntimeContext} */ ({
    state: {}
  });
  assert.throws(() => gameFlow.proceedToNextLevel({}, baseNextContext), /context\.round/);
});

test('roundController guards require runtime slices', async () => {
  const roundFlow = await import('../controllers/roundController.js');

  const startContext = /** @type {import('../context.js').GameRuntimeContext} */ ({
    round: {},
    audio: {},
    hud: {}
  });
  assert.throws(() => roundFlow.startRoundFlow({}, startContext), /context\.state/);

  const nextContext = /** @type {import('../context.js').GameRuntimeContext} */ ({
    state: {},
    audio: {},
    round: {},
    hud: {}
  });
  assert.throws(() => roundFlow.proceedToNextLevelFlow({}, nextContext), /context\.loop/);
});

test('startRoundFlow rejects invalid option payloads', async () => {
  const roundFlow = await import('../controllers/roundController.js');

  const runtimeContext = /** @type {import('../context.js').GameRuntimeContext} */ ({
    state: {},
    round: {},
    audio: {},
    hud: {}
  });

  const baseOptions = {
    intervalRef: { current: null },
    playerEngineRef: { current: null },
    enemyEngineRef: { current: null }
  };

  assert.throws(() => {
    roundFlow.startRoundFlow({ ...baseOptions, unexpected: true }, runtimeContext);
  }, /Unexpected option key/);

  assert.throws(() => {
    const { playerEngineRef, ...rest } = baseOptions;
    roundFlow.startRoundFlow(rest, runtimeContext);
  }, /playerEngineRef is required/);
});

test('startRound enforces callback contracts', async () => {
  const gameFlow = await import('../controllers/gameFlowController.js');

  const runtimeContext = /** @type {import('../context.js').GameRuntimeContext} */ ({
    engines: {
      player: { current: null },
      enemy: { current: null },
      cloneRefs() {
        return { player: { current: null }, enemy: { current: null } };
      }
    },
    loop: {
      flows: {},
      actions: {},
      start: () => {},
      pause: () => {}
    },
    round: {}
  });

  assert.throws(() => {
    gameFlow.startRound({ onStartGame: 'not-a-function' }, runtimeContext);
  }, /onStartGame must be a function/);
});

test('startGameFlow validates tick dependencies', async () => {
  const rootFlow = await import('../controllers/rootGameFlowController.js');

  const bus = { emit() { return true; } };

  assert.throws(() => {
    rootFlow.startGameFlow({
      hidePausePanel: () => {},
      orchestratorStartGame: () => {},
      playerEngineRef: { current: null },
      enemyEngineRef: { current: null },
      gameState: {},
      engineContext: {},
      startLoopController: () => {},
      draw: () => {},
      onFrame: () => {},
      tickDeps: { draw: () => {} },
      bus
    });
  }, /Missing tickDeps\.audio/);
});
