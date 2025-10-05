import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameFlowService } from '../gameFlowService.js';

test('gameFlowService.startGame orchestrates state, dispatch and audio ports in order', () => {
  const calls = [];
  const service = createGameFlowService({
    hud: {
      hideOverlay: (kind) => calls.push(['hud.hide', kind])
    },
    audio: {
      prepareForGameplay: () => calls.push('audio.prepare'),
      resumeBus: () => calls.push('audio.resume'),
      startEngines: () => {
        calls.push('audio.startEngines');
        return { player: 'p', enemy: 'e' };
      },
      onEnginesStarted: (snapshot) => calls.push(['audio.onStarted', snapshot]),
      playGameplayBgm: () => calls.push('audio.playBgm')
    },
    engines: {
      updateAudioRefs: (snapshot) => calls.push(['engine.update', snapshot])
    },
    transitions: { toRunning: () => calls.push('transition.running') },
    dispatcher: { startGame: () => calls.push('dispatch.start') },
    safe: (fn) => fn()
  });

  service.startGame();

  assert.deepEqual(calls, [
    ['hud.hide', 'countdown'],
    'transition.running',
    ['hud.hide', 'pause'],
    'dispatch.start',
    'audio.prepare',
    'audio.resume',
    'audio.startEngines',
    ['engine.update', { player: 'p', enemy: 'e' }],
    ['audio.onStarted', { player: 'p', enemy: 'e' }],
    'audio.playBgm'
  ]);
});

test('gameFlowService.pauseGame pauses audio, clears engines and shows overlay', () => {
  const calls = [];
  const service = createGameFlowService({
    hud: {
      showOverlay: (kind, payload) => calls.push(['hud.show', kind, payload])
    },
    audio: {
      stopEngines: () => calls.push('audio.stopEngines'),
      cutAll: () => calls.push('audio.cutAll'),
      pauseGameplayBgm: () => calls.push('audio.pauseBgm')
    },
    engines: {
      setActive: (active) => calls.push(['engine.setActive', active]),
      clearAudioRefs: () => calls.push('engine.clearRefs')
    },
    transitions: { toPaused: () => calls.push('transition.paused') },
    dispatcher: { pauseGame: () => calls.push('dispatch.pause') },
    safe: (fn) => fn()
  });

  service.pauseGame();

  assert.deepEqual(calls, [
    'transition.paused',
    ['hud.show', 'pause', { title: 'PAUSED', message: 'Press Space to continue' }],
    'dispatch.pause',
    ['engine.setActive', false],
    'audio.stopEngines',
    'audio.cutAll',
    'engine.clearRefs',
    'audio.pauseBgm'
  ]);
});
