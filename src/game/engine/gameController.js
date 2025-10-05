import * as C from '../Constants.js';
import { dispatch, Actions } from '../state/index.js';
export function pauseGameHelper({
  gameState,
  pauseLoopController,
  intervalRef,
  setEngineActive,
  audio,
  playerEngineRef,
  enemyEngineRef,
  bgm,
  hidePausePanel
}){
  try {
    dispatch(Actions.setRunning(false));
  } catch(_e) {}
  try {
    if (typeof hidePausePanel === 'function') hidePausePanel();
  } catch(_e) {}
  try {
    if (typeof pauseLoopController === 'function') pauseLoopController();
  } catch(_e) {}
  try {
    if (intervalRef && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  } catch(_e) {}
  try {
    if (typeof setEngineActive === 'function') setEngineActive(false);
  } catch(_e) {}
  try {
    if (audio && typeof audio.cutAll === 'function') audio.cutAll();
  } catch(_e) {}
  try {
    if (audio && typeof audio.stopEngines === 'function') audio.stopEngines();
  } catch(_e) {}
  if (playerEngineRef) playerEngineRef.current = null;
  if (enemyEngineRef)  enemyEngineRef.current  = null;
  try {
    if (audio && typeof audio.pauseBgm === 'function') audio.pauseBgm(bgm);
  } catch(_e) {}
}
export function startGameHelper({
  gameState,
  engineContext,
  audio,
  bgm,
  playerEngineRef,
  enemyEngineRef,
  setEngineActive,
  startLoopController,
  draw,
  onFrame,
  tickDeps
}){
  try {
    dispatch(Actions.setGameEnded(false));
    dispatch(Actions.setInitialStartPending(false));
    dispatch(Actions.setRunning(true));
  } catch(_e) {}
  try {
    if (audio && typeof audio.prepareGameplay === 'function') {
      audio.prepareGameplay();
    }
  } catch(_e) {}
  try {
    if (!playerEngineRef.current || !enemyEngineRef.current) {
      if (audio && typeof audio.startEngines === 'function') {
        const res = audio.startEngines();
        if (res) {
          const { player, enemy } = res;
          if (!playerEngineRef.current) playerEngineRef.current = player;
          if (!enemyEngineRef.current)  enemyEngineRef.current  = enemy;
        }
      }
      try {
        if (engineContext) {
          engineContext.playerEngine = playerEngineRef.current;
          engineContext.enemyEngine  = enemyEngineRef.current;
        }
      } catch(_e) {}
    }
  } catch(_e) {}
  try {
    if (typeof setEngineActive === 'function') setEngineActive(true);
  } catch(_e) {}
  try {
    if (audio && typeof audio.playBgm === 'function') audio.playBgm(bgm);
  } catch(_e) {}
  try {
    if (engineContext && tickDeps) {
      engineContext.tickDeps = tickDeps;
    }
  } catch(_e) {}
  try {
    if (typeof startLoopController === 'function') {
      startLoopController({ gameState, engineContext, draw, onFrame });
    }
  } catch(_e) {}
}
export function setEngineActive(on, refs = {}) {
  const { playerEngineRef, enemyEngineRef } = refs || {};
  try {
    const player = playerEngineRef && playerEngineRef.current;
    const enemy  = enemyEngineRef && enemyEngineRef.current;
    if (player && typeof player.setActive === 'function') player.setActive(on);
    if (enemy  && typeof enemy.setActive === 'function') enemy.setActive(on);
    if (on) {
      try {
        if (player && typeof player.setIntensity === 'function') player.setIntensity(C.PLAYER_ENGINE_INTENSITY_BASE);
      } catch(_e) {}
      try {
        if (enemy && typeof enemy.setIntensity === 'function') enemy.setIntensity(C.ENEMY_ENGINE_INTENSITY_BASE);
      } catch(_e) {}
    }
    if (!on) {
      try {
        if (player && typeof player.setBoost === 'function') player.setBoost(false);
      } catch(_e) {}
    }
  } catch (_e) {
  }
}
