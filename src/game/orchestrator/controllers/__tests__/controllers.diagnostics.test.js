import test from 'node:test';
import assert from 'node:assert/strict';
import { DiagnosticsChannels } from '../../../core/events.js';
import {
  clearDiagnosticsLog,
  getDiagnosticsLog
} from '../../../utils/safe.js';

if (typeof global.window === 'undefined') {
  global.window = {};
}

if (typeof global.document === 'undefined') {
  global.document = {
    getElementById: () => null
  };
}

function createBusRecorder() {
  const events = [];
  return {
    events,
    emit(event, payload) {
      events.push({ event, payload });
    }
  };
}

test('roundController flow reports loop pause failures', async () => {
  clearDiagnosticsLog();
  const { proceedToNextLevelFlow } = await import('../roundController.js');
  const bus = createBusRecorder();
  const runtime = {
    state: {
      getLevel: () => 1,
      ref: { level: 1, score: 0 }
    },
    loop: {
      pause: () => { throw new Error('pause failed'); },
      setEngineActive: () => {}
    },
    audio: { service: {} },
    round: {
      getState: () => ({ level: 1, score: 0 }),
      helpers: { next: () => ({ newLevel: 2, newEnemySpeed: 3 }) },
      setLevel: () => {},
      getResetPowerUps: () => () => {},
      spawn: () => {},
      updateScore: () => {},
      computeEnemySpeed: () => 2
    },
    hud: { bus }
  };

  proceedToNextLevelFlow({}, runtime);

  assert.equal(bus.events.some(evt => evt.event === DiagnosticsChannels.REPORT.event), true);
  const entries = getDiagnosticsLog();
  assert.equal(entries.some(entry => entry.label === 'roundController.proceedToNextLevel.pauseLoop'), true);
});

