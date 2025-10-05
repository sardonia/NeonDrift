import { hudBus, audioBus } from '../../core/events.js';
import { createGameFlowService } from '../../application/gameFlowService.js';

function createHudPort(getBus) {
  return {
    hideOverlay(kind) {
      const bus = typeof getBus === 'function' ? getBus() : null;
      hudBus.hideOverlay(bus, { kind });
    }
  };
}

function createAudioPort(getAudioService, getBus, getDomService) {
  return {
    prepareForGameplay() {
      const svc = typeof getAudioService === 'function' ? getAudioService() : null;
      if (svc && typeof svc.prepareGameplay === 'function') {
        svc.prepareGameplay();
      }
    },
    resumeBus() {
      const bus = typeof getBus === 'function' ? getBus() : null;
      audioBus.resumeAndUnlock(bus);
    },
    startEngines() {
      const svc = typeof getAudioService === 'function' ? getAudioService() : null;
      if (svc && typeof svc.startEngines === 'function') {
        return svc.startEngines();
      }
      return undefined;
    },
    onEnginesStarted() {
      const bus = typeof getBus === 'function' ? getBus() : null;
      audioBus.startEngines(bus);
    },
    playGameplayBgm() {
      const bus = typeof getBus === 'function' ? getBus() : null;
      const dom = typeof getDomService === 'function' ? getDomService() : null;
      const bgmEl = dom && typeof dom === 'object' ? dom.bgm || null : null;
      audioBus.resetAndPlayBgm(bus, { bgm: bgmEl, volume: 0.65 });
      const svc = typeof getAudioService === 'function' ? getAudioService() : null;
      if (svc && typeof svc.resetBgm === 'function') {
        svc.resetBgm(bgmEl, 0.65);
      }
      if (svc && typeof svc.playBgm === 'function') {
        svc.playBgm(bgmEl);
      }
    }
  };
}

function createEngineCoordinator(engineRefs) {
  const playerRef = engineRefs && engineRefs.playerRef ? engineRefs.playerRef : null;
  const enemyRef = engineRefs && engineRefs.enemyRef ? engineRefs.enemyRef : null;
  const updateContext = engineRefs && typeof engineRefs.updateContextEngines === 'function'
    ? engineRefs.updateContextEngines
    : () => {};

  return {
    updateAudioRefs(snapshot) {
      const result = snapshot && typeof snapshot === 'object' ? snapshot : {};
      const player = result && Object.prototype.hasOwnProperty.call(result, 'player') ? result.player : null;
      const enemy = result && Object.prototype.hasOwnProperty.call(result, 'enemy') ? result.enemy : null;
      if (playerRef) {
        playerRef.current = player ?? null;
      }
      if (enemyRef) {
        enemyRef.current = enemy ?? null;
      }
      updateContext(player ?? null, enemy ?? null);
    },
    clearAudioRefs() {
      if (playerRef) {
        playerRef.current = null;
      }
      if (enemyRef) {
        enemyRef.current = null;
      }
      updateContext(null, null);
    }
  };
}

export function createStartGameFlow({
  transitionToRunning,
  getBus,
  getAudioService,
  getDomService,
  dispatchStartGame,
  safe,
  engineRefs
}) {
  const service = createGameFlowService({
    hud: createHudPort(getBus),
    audio: createAudioPort(getAudioService, getBus, getDomService),
    engines: createEngineCoordinator(engineRefs),
    transitions: { toRunning: transitionToRunning },
    dispatcher: { startGame: () => dispatchStartGame() },
    safe
  });

  return function startGame() {
    service.startGame();
  };
}

export default { createStartGameFlow };
