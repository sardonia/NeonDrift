import test from 'node:test';
import assert from 'node:assert/strict';
import { initPowerups, collectPowerUpImpl, P } from '../powerups.js';

test('collectPowerUpImpl clears the active pickup without spawning a replacement', () => {
  const prevHelpers = { ...P.helpers };
  const calls = {
    bag: [],
    updateUI: 0,
    splash: 0,
    score: 0,
    clear: 0,
    set: 0,
    grid: 0,
    player: 0,
    enemy: 0,
    occupied: 0
  };

  const stubs = {
    powerBagPush: (kind) => { calls.bag.push(kind); },
    updatePowerUpsUI: () => { calls.updateUI++; },
    playPowerupSplash: () => { calls.splash++; },
    incScore: (amount) => { calls.score += amount || 0; },
    clearPowerUp: () => { calls.clear++; },
    setPowerUp: () => { calls.set++; },
    getGrid: () => { calls.grid++; return { id: 'grid' }; },
    getPlayer: () => { calls.player++; return { id: 'player' }; },
    getEnemy: () => { calls.enemy++; return { id: 'enemy' }; },
    isOccupied: () => { calls.occupied++; return false; }
  };

  initPowerups({ helpers: stubs });

  try {
    collectPowerUpImpl({ kind: 'accel' });
  } finally {
    const restore = {};
    for (const key of Object.keys(stubs)) {
      restore[key] = prevHelpers[key];
    }
    initPowerups({ helpers: restore });
  }

  assert.deepEqual(calls.bag, ['accel']);
  assert.equal(calls.updateUI, 1);
  assert.equal(calls.splash, 1);
  assert.equal(calls.score, 300);
  assert.equal(calls.clear, 1);
  assert.equal(calls.set, 0);
  assert.equal(calls.grid, 0);
  assert.equal(calls.player, 0);
  assert.equal(calls.enemy, 0);
  assert.equal(calls.occupied, 0);
});

test('collectPowerUpImpl falls back to setPowerUp(null) when clear helper is missing', () => {
  const prevHelpers = { ...P.helpers };
  const calls = {
    bag: 0,
    set: [],
    clear: 0,
    ui: 0
  };

  const stubs = {
    powerBagPush: () => { calls.bag++; },
    updatePowerUpsUI: () => { calls.ui++; },
    playPowerupSplash: () => {},
    incScore: () => {},
    setPowerUp: (value) => { calls.set.push(value); }
  };

  initPowerups({ helpers: stubs });

  try {
    collectPowerUpImpl({ kind: 'shield' });
  } finally {
    initPowerups({ helpers: prevHelpers });
  }

  assert.equal(calls.bag, 1);
  assert.equal(calls.ui, 1);
  assert.deepEqual(calls.set, [null]);
  assert.equal(calls.clear, 0);
});
