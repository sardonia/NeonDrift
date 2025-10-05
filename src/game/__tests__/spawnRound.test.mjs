import test from 'node:test';
import assert from 'node:assert/strict';

import { spawnRound } from '../spawner.js';
import { getState } from '../state/index.js';

test('spawnRound clears the trails canvas before drawing a new round', () => {
  const state = getState();
  const clearCalls = [];
  const trailsCanvas = { width: 160, height: 120 };
  const tctx = {
    canvas: trailsCanvas,
    clearRect(...args) {
      clearCalls.push(args);
    }
  };

  const engineContext = {
    state,
    render: {
      trails: trailsCanvas,
      trailPlayer: [],
      trailEnemy: [],
      colors: {},
      drawFrame() {}
    }
  };

  spawnRound({
    gameState: state,
    engineContext,
    ctx: {},
    tctx,
    pctx: {},
    board: {},
    trails: trailsCanvas,
    fx: { width: 160, height: 120 },
    trailPlayer: [],
    trailEnemy: [],
    PLAYER_CYCLE_CORE: '#fff',
    PLAYER_CYCLE_GLOW: '#fff',
    ENEMY_CYCLE_CORE: '#fff',
    ENEMY_CYCLE_GLOW: '#fff',
    PULSE_SPAN: 0
  });

  assert.equal(clearCalls.length > 0, true, 'expected trails context to be cleared');
  const [x, y, width, height] = clearCalls[0];
  assert.equal(x, 0);
  assert.equal(y, 0);
  assert.equal(width, trailsCanvas.width);
  assert.equal(height, trailsCanvas.height);
});
