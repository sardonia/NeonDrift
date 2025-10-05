import { hudBus, audioBus } from '../../core/events.js';
import { createGameFlowService } from '../../application/gameFlowService.js';

function createHudPort(getBus) {
  return {
    showOverlay(kind, payload) {
      const bus = typeof getBus === 'function' ? getBus() : null;
      hudBus.showOverlay(bus, { kind, data: payload });
    },
    hideOverlay(kind) {
      const bus = typeof getBus === 'function' ? getBus() : null;
      hudBus.hideOverlay(bus, { kind });
    }
  };
}

function createAudioPort(getAudioService, getBus, getDomService) {
  return {
    stopEngines() {
      const svc = typeof getAudioService === 'function' ? getAudioService() : null;
      if (svc && typeof svc.stopEngines === 'function') {
        svc.stopEngines();
      }
    },
    cutAll() {
      const bus = typeof getBus === 'function' ? getBus() : null;
      audioBus.cutAll(bus);
    },
    pauseGameplayBgm() {
      const svc = typeof getAudioService === 'function' ? getAudioService() : null;
      const dom = typeof getDomService === 'function' ? getDomService() : null;
      const bgmEl = dom && typeof dom === 'object' ? dom.bgm || null : null;
      if (svc && typeof svc.pauseBgm === 'function') {
        svc.pauseBgm(bgmEl);
      }
      if (bgmEl && typeof bgmEl.pause === 'function') {
        bgmEl.pause();
      }
    }
  };
}

function createEngineCoordinator(engineRefs, controllerSetEngineActive) {
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
    },
    setActive(active) {
      if (typeof controllerSetEngineActive === 'function') {
        controllerSetEngineActive(active, {
          playerEngineRef: playerRef,
          enemyEngineRef: enemyRef
        });
      }
    }
  };
}

export function createPauseGameFlow({
  transitionToPaused,
  getBus,
  getAudioService,
  getDomService,
  dispatchPauseGame,
  controllerSetEngineActive,
  safe,
  engineRefs
}) {
  const service = createGameFlowService({
    hud: createHudPort(getBus),
    audio: createAudioPort(getAudioService, getBus, getDomService),
    engines: createEngineCoordinator(engineRefs, controllerSetEngineActive),
    transitions: { toPaused: transitionToPaused },
    dispatcher: { pauseGame: () => dispatchPauseGame() },
    safe
  });

  return function pauseGame() {
    service.pauseGame();
  };
}

export default { createPauseGameFlow };
