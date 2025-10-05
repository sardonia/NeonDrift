import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCrashOutcome } from '../engine/crashHandlers.js';
import { registerInstance, resetServices, TOKENS } from '../services/index.js';
import { processMovementSubsteps } from '../engine/substepProcessor.js';
import * as C from '../Constants.js';

test('enemy crash before final level shows next level overlay and updates state', () => {
  const detection = { playerDead: false, enemyDead: true };
  const showPauseCalls = [];
  const addedClasses = [];
  let nextLevelHandler = null;
  const panel = {
    innerHTML: '',
    classList: {
      add(cls) { addedClasses.push(cls); },
      remove() {}
    },
    querySelector(selector) {
      if (selector === '#nextLevelBtn') {
        return {
          addEventListener(event, handler) {
            if (event === 'click') {
              nextLevelHandler = handler;
            }
          }
        };
      }
      return null;
    }
  };
  const overlay = { style: {} };
  const startingScore = 400;
  const level = 3;
  const gameState = {
    level,
    score: startingScore,
    persistentScore: startingScore,
    running: true,
    gameEnded: true,
    nextLevelCarryScore: 0,
    levelTransitionPending: false
  };
  let proceedCalls = 0;
  const result = handleCrashOutcome(detection, {
    audio: { crash() {}, cutAll() {}, stopEngines() {} },
    draw() {},
    gameOver: () => {},
    resetPowerUps: () => {},
    updateScore: () => {},
    hidePausePanel: () => {},
    showPausePanel: () => { showPauseCalls.push(true); },
    panel,
    overlay,
    proceedToNextLevel: () => { proceedCalls += 1; },
    gameState,
    LEVEL: level,
    MAX_LEVEL: C.MAX_LEVEL,
    COLS: C.COLS,
    pnx: 0,
    enx: 0,
    playerEngineRef: { current: {} },
    enemyEngineRef: { current: {} },
    intervalRef: null
  });

  const expectedScore = startingScore + (200 * level);
  assert.equal(result, true);
  assert.equal(showPauseCalls.length, 1);
  assert.equal(panel.innerHTML,
    '<div class="go-title">NEXT LEVEL</div>' +
    '<div class="go-msg go-plot">Level ' + level + ' secure — the grid is re-stabilizing for the next assault.</div>' +
    '<div class="go-columns go-columns--stats">' +
      '<div class="go-column">' +
        '<div class="go-subheading">Cleared</div>' +
        '<div class="go-stat">Level ' + level + '</div>' +
        '<div class="go-stat-label">Sector Purged</div>' +
      '</div>' +
      '<div class="go-column">' +
        '<div class="go-subheading">Bonus</div>' +
        '<div class="go-stat">+' + (200 * level) + '</div>' +
        '<div class="go-stat-label">Energy Credits</div>' +
      '</div>' +
    '</div>' +
    '<div class="go-msg">Initiate countermeasures and prepare for Level ' + (level + 1) + '.</div>' +
    '<button class="btn btn-big" id="nextLevelBtn">Start Level ' + (level + 1) + '</button>'
  );
  assert.ok(addedClasses.includes('panel-go'));
  assert.equal(overlay.style.display, 'flex');
  assert.equal(overlay.style.pointerEvents, 'auto');
  assert.equal(typeof nextLevelHandler, 'function');
  nextLevelHandler();
  assert.equal(proceedCalls, 1);
  assert.equal(gameState.level, level);
  assert.equal(gameState.running, false);
  assert.equal(gameState.gameEnded, false);
  assert.equal(gameState.levelTransitionPending, true);
  assert.equal(gameState.nextLevelCarryScore, expectedScore);
  assert.equal(gameState.score, expectedScore);
  assert.equal(gameState.persistentScore, expectedScore);
});

test('enemy crash still reveals overlay when pause hook is absent', () => {
  const detection = { playerDead: false, enemyDead: true };
  let addedClass = null;
  const panel = {
    innerHTML: '',
    classList: {
      add(cls) { addedClass = cls; },
      remove() {}
    }
  };
  const overlay = { style: {} };
  const level = 2;
  const gameState = {
    level,
    score: 0,
    persistentScore: 0,
    running: true,
    gameEnded: false,
    nextLevelCarryScore: 0,
    levelTransitionPending: false
  };

  const result = handleCrashOutcome(detection, {
    audio: { crash() {}, cutAll() {}, stopEngines() {} },
    draw() {},
    gameOver: () => {},
    resetPowerUps: () => {},
    updateScore: () => {},
    hidePausePanel: () => {},
    showPausePanel: undefined,
    panel,
    overlay,
    proceedToNextLevel: () => {},
    gameState,
    LEVEL: level,
    MAX_LEVEL: C.MAX_LEVEL,
    COLS: C.COLS,
    pnx: 0,
    enx: 0,
    playerEngineRef: { current: {} },
    enemyEngineRef: { current: {} },
    intervalRef: null
  });

  assert.equal(result, true);
  assert.equal(overlay.style.display, 'flex');
  assert.equal(addedClass, 'panel-go');
  assert.equal(panel.innerHTML.includes('NEXT LEVEL'), true);
  assert.equal(gameState.levelTransitionPending, true);
});

test('enemy crash falls back to DOM service when overlay references are missing', () => {
  const detection = { playerDead: false, enemyDead: true };
  const overlay = { style: {} };
  const panel = { innerHTML: '', classList: { add() {}, remove() {} } };
  registerInstance(TOKENS.DOM, { overlay, panel });

  try {
    const result = handleCrashOutcome(detection, {
      audio: { crash() {}, cutAll() {}, stopEngines() {} },
      draw() {},
      gameOver: () => {},
      resetPowerUps: () => {},
      updateScore: () => {},
      hidePausePanel: () => {},
      showPausePanel: undefined,
      panel: undefined,
      overlay: undefined,
      proceedToNextLevel: () => {},
      gameState: { level: 1, score: 0, persistentScore: 0 },
      LEVEL: 1,
      MAX_LEVEL: C.MAX_LEVEL,
      COLS: C.COLS,
      pnx: 0,
      enx: 0,
      playerEngineRef: { current: {} },
      enemyEngineRef: { current: {} },
      intervalRef: null
    });

    assert.equal(result, true);
    assert.equal(overlay.style.display, 'flex');
    assert.equal(overlay.style.pointerEvents, 'auto');
    assert.equal(panel.innerHTML.includes('NEXT LEVEL'), true);
  } finally {
    resetServices();
  }
});

test('enemy crash on final level triggers game over flow even with stale level deps', () => {
  const detection = { playerDead: false, enemyDead: true };
  let gameOverMessage = null;
  const showPauseCalls = [];
  const panel = { innerHTML: '', classList: { add() {}, remove() {} } };
  const overlay = { style: {} };
  const gameState = { level: C.MAX_LEVEL, score: 0, persistentScore: 0 };
  const result = handleCrashOutcome(detection, {
    audio: { crash() {}, cutAll() {}, stopEngines() {} },
    draw() {},
    gameOver: (msg) => { gameOverMessage = msg; },
    resetPowerUps: () => {},
    updateScore: () => {},
    hidePausePanel: () => {},
    showPausePanel: () => { showPauseCalls.push(true); },
    panel,
    overlay,
    proceedToNextLevel: () => {},
    gameState,
    LEVEL: 1,
    MAX_LEVEL: C.MAX_LEVEL,
    COLS: C.COLS,
    pnx: 0,
    enx: 0,
    playerEngineRef: { current: {} },
    enemyEngineRef: { current: {} },
    intervalRef: null
  });

  assert.equal(result, true);
  assert.equal(gameOverMessage, 'Enemy crashed. You beat all 10 levels!');
  assert.equal(showPauseCalls.length, 0);
  assert.equal(panel.innerHTML, '');
});

test('enemy crash treats dependency level as authoritative when game state lags', () => {
  const detection = { playerDead: false, enemyDead: true };
  let gameOverMessage = null;
  const showPauseCalls = [];
  const updateScoreCalls = [];
  const panel = { innerHTML: '', classList: { add() {}, remove() {} } };
  const overlay = { style: {} };
  const startingScore = 1000;
  const gameState = { level: C.MAX_LEVEL - 1, score: startingScore, persistentScore: startingScore };
  const result = handleCrashOutcome(detection, {
    audio: { crash() {}, cutAll() {}, stopEngines() {} },
    draw() {},
    gameOver: (msg) => { gameOverMessage = msg; },
    resetPowerUps: () => {},
    updateScore: (value) => { updateScoreCalls.push(value); },
    hidePausePanel: () => {},
    showPausePanel: () => { showPauseCalls.push(true); },
    panel,
    overlay,
    proceedToNextLevel: () => {},
    gameState,
    LEVEL: C.MAX_LEVEL,
    MAX_LEVEL: C.MAX_LEVEL,
    COLS: C.COLS,
    pnx: 0,
    enx: 0,
    playerEngineRef: { current: {} },
    enemyEngineRef: { current: {} },
    intervalRef: null
  });

  const expectedScore = startingScore + (200 * C.MAX_LEVEL);
  assert.equal(result, true);
  assert.equal(gameOverMessage, `Enemy crashed. You beat all ${C.MAX_LEVEL} levels!`);
  assert.equal(showPauseCalls.length, 0);
  assert.equal(panel.innerHTML, '');
  assert.equal(gameState.score, expectedScore);
  assert.equal(gameState.persistentScore, expectedScore);
  assert.deepEqual(updateScoreCalls, [expectedScore]);
});

test('processMovementSubsteps forwards overlay and shows it when enemy crashes mid-round', () => {
  const overlay = { style: {} };
  const panel = { innerHTML: '', classList: { add() {}, remove() {} } };
  const gameState = {
    level: 1,
    score: 0,
    persistentScore: 0,
    running: true,
    gameEnded: false,
    nextLevelCarryScore: 0,
    levelTransitionPending: false,
    playerProgress: 0,
    enemyProgress: 1,
    player: { x: 0, y: 0, dir: 'right' },
    enemy: { x: 0, y: 0, dir: 'right' },
    grid: {},
    trailPlayer: [],
    trailEnemy: []
  };
  const engineContext = {
    ai: null,
    state: gameState,
    collisions: {
      outOfBounds: () => false,
      isOccupied: (_grid, x, y) => (x === 1 && y === 0),
      resolveHeadOnAndOvertakes: () => ({ playerDead: false, enemyDead: false })
    }
  };
  const result = processMovementSubsteps({
    engineContext,
    gameState,
    audio: { crash() {}, cutAll() {}, stopEngines() {} },
    draw() {},
    gameOver: () => {},
    resetPowerUps: () => {},
    updateScore: () => {},
    hidePausePanel: () => {},
    showPausePanel: () => {},
    panel,
    overlay,
    proceedToNextLevel: () => {},
    LEVEL: 1,
    MAX_LEVEL: C.MAX_LEVEL,
    COLS: C.COLS,
    preset: 'arcade',
    playerEngine: {},
    enemyEngine: {},
    interval: null,
    trailPlayer: [],
    trailEnemy: [],
    pulseP: {},
    pulseE: {}
  });

  assert.equal(result.aborted, true);
  assert.equal(overlay.style.display, 'flex');
  assert.equal(gameState.levelTransitionPending, true);
});
