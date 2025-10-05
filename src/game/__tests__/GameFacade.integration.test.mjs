import test from 'node:test';
import assert from 'node:assert/strict';
import { GameFacade } from '../Game.js';

test('createRuntimeBindings coordinates orchestrator flows and UI hooks', () => {
  const state = { level: 1, running: false };
  const engineContext = {
    playerEngine: { id: 'player-initial' },
    enemyEngine: { id: 'enemy-initial' },
    audio: { id: 'audio-service' }
  };
  const dom = {
    overlay: { id: 'overlay' },
    panel: { id: 'panel' },
    tickerPowerupsList: { id: 'powerups' },
    bgm: { id: 'bgm', paused: false }
  };

  const calls = {
    start: [],
    pause: [],
    startRound: [],
    nextLevel: [],
    engineActive: [],
    gameOver: [],
    pauseLoop: 0,
    resetPowerUps: [],
    resetPowerBag: 0,
    pausePanels: [],
    pauseMessages: [],
    scores: [],
    gameOverHelper: [],
    createResetArgs: null,
    gameOverTriggered: false
  };

  const orchestrator = {
    start: (options) => {
      calls.start.push(options);
      if (typeof options.updateScore === 'function') options.updateScore(9001);
      if (typeof options.resetPowerUps === 'function') options.resetPowerUps({ clearPickup: true });
      if (typeof options.hidePausePanel === 'function') options.hidePausePanel();
      return 'start-result';
    },
    pause: (options) => {
      calls.pause.push(options);
      if (typeof options.showPausePanel === 'function') options.showPausePanel();
      if (typeof options.updatePauseMessage === 'function') options.updatePauseMessage('paused');
      return 'pause-result';
    },
    startRound: (options) => {
      calls.startRound.push(options);
      if (typeof options.onStartGame === 'function') {
        options.onStartGame({ preset: 'story' });
      }
      return 'round-result';
    },
    nextLevel: (options) => {
      calls.nextLevel.push(options);
      if (typeof options.onStartGame === 'function') {
        options.onStartGame({});
      }
      return 'next-result';
    },
    setEngineActive: (active, refs) => {
      refs.playerEngineRef.current = active ? { id: 'player-active' } : { id: 'player-idle' };
      refs.enemyEngineRef.current = active ? { id: 'enemy-active' } : { id: 'enemy-idle' };
      calls.engineActive.push({
        active,
        refs: {
          playerEngineRef: { current: refs.playerEngineRef.current },
          enemyEngineRef: { current: refs.enemyEngineRef.current }
        }
      });
      return 'toggle-result';
    },
    gameOverFlow: (payload) => {
      calls.gameOver.push(payload);
      if (payload.setEngineActive) payload.setEngineActive(false);
      if (payload.gameOverHelper) payload.gameOverHelper(payload);
      if (payload.pauseLoop) payload.pauseLoop();
      if (!calls.gameOverTriggered && payload.onAgain) {
        calls.gameOverTriggered = true;
        payload.onAgain();
      }
      return 'gameOver-result';
    },
    pauseLoop: () => {
      calls.pauseLoop += 1;
    }
  };

  const createResetPowerUps = ({ gameState, resetPowerBag, listEl }) => {
    calls.createResetArgs = { gameState, resetPowerBag, listEl };
    return (opts) => {
      calls.resetPowerUps.push(opts);
      if (typeof resetPowerBag === 'function') resetPowerBag();
    };
  };

  const facade = new GameFacade();
  facade.init({ orchestrator, state: { getState: () => state } });

  const bindings = facade.createRuntimeBindings({
    orchestrator,
    gameState: state,
    engineContext,
    dom,
    audio: engineContext.audio,
    gameOverHelper: ({ message }) => calls.gameOverHelper.push(message),
    resetPowerBag: () => { calls.resetPowerBag += 1; },
    createResetPowerUps,
    updateScore: (value) => calls.scores.push(value),
    showPausePanel: () => calls.pausePanels.push('show'),
    hidePausePanel: () => calls.pausePanels.push('hide'),
    updatePauseMessage: (msg) => calls.pauseMessages.push(msg),
    preset: 'arcade'
  });

  assert.ok(bindings);

  const { startGame, pauseGame, startRound, proceedToNextLevel, setEngineActive, gameOver } = bindings;
  assert.equal(typeof startGame, 'function');
  assert.equal(typeof pauseGame, 'function');
  assert.equal(typeof startRound, 'function');
  assert.equal(typeof proceedToNextLevel, 'function');
  assert.equal(typeof setEngineActive, 'function');
  assert.equal(typeof gameOver, 'function');

  const startResult = startGame();
  assert.equal(startResult, 'start-result');
  assert.equal(calls.start.length, 1);
  const firstStart = calls.start[0];
  assert.equal(firstStart.preset, 'arcade');
  assert.equal(typeof firstStart.gameOver, 'function');
  assert.equal(typeof firstStart.resetPowerUps, 'function');
  assert.equal(calls.resetPowerBag, 1);
  assert.deepEqual(calls.resetPowerUps, [{ clearPickup: true }]);
  assert.equal(calls.pausePanels[0], 'hide');
  assert.equal(calls.scores[0], 9001);
  assert.ok(calls.createResetArgs);
  assert.equal(calls.createResetArgs.gameState, state);
  assert.equal(calls.createResetArgs.listEl, dom.tickerPowerupsList);

  const pauseResult = pauseGame();
  assert.equal(pauseResult, 'pause-result');
  assert.equal(calls.pause.length, 1);
  assert.equal(calls.pausePanels.includes('show'), true);
  assert.deepEqual(calls.pauseMessages, ['paused']);

  const roundResult = startRound({ resetLevel1: true });
  assert.equal(roundResult, 'round-result');
  assert.equal(calls.startRound.length >= 1, true);
  assert.equal(calls.startRound[0].resetLevel1, true);
  assert.equal(calls.start.length >= 2, true);
  assert.equal(calls.start[1].preset, 'story');

  const nextResult = proceedToNextLevel();
  assert.equal(nextResult, 'next-result');
  assert.equal(calls.nextLevel.length, 1);
  assert.equal(calls.start.length >= 3, true);

  const toggleResult = setEngineActive(true);
  assert.equal(toggleResult, 'toggle-result');
  assert.equal(calls.engineActive.length, 1);
  assert.equal(calls.engineActive[0].active, true);
  assert.deepEqual(calls.engineActive[0].refs.playerEngineRef.current, { id: 'player-active' });
  assert.equal(engineContext.playerEngine.id, 'player-active');
  assert.equal(engineContext.enemyEngine.id, 'enemy-active');

  const gameOverResult = gameOver('defeat');
  assert.equal(gameOverResult, 'gameOver-result');
  assert.equal(calls.gameOver.length, 1);
  const payload = calls.gameOver[0];
  assert.equal(payload.message, 'defeat');
  assert.equal(payload.overlay, dom.overlay);
  assert.equal(payload.panel, dom.panel);
  assert.equal(payload.bgm, dom.bgm);
  assert.equal(calls.pauseLoop, 1);
  assert.deepEqual(calls.gameOverHelper, ['defeat']);
  assert.equal(calls.engineActive.length, 2);
  const lastToggle = calls.engineActive[calls.engineActive.length - 1];
  assert.equal(lastToggle.active, false);
  assert.deepEqual(lastToggle.refs.playerEngineRef.current, { id: 'player-idle' });
  assert.deepEqual(lastToggle.refs.enemyEngineRef.current, { id: 'enemy-idle' });
  assert.equal(calls.startRound.some((entry) => entry.resetLevel1), true);
  assert.equal(calls.scores.length, calls.start.length);
});
