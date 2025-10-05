import { getService, TOKENS } from '../services/index.js';
import { dispatch, Actions } from '../state/index.js';
import { noteScoreBroadcast } from './postStepHandlers.js';

function resolveDomRefs(panel, overlay) {
  let panelEl = panel;
  let overlayEl = overlay;
  if (!panelEl || !overlayEl) {
    try {
      const domSvc = typeof getService === 'function' ? getService(TOKENS.DOM) : null;
      if (domSvc) {
        if (!panelEl && domSvc.panel) panelEl = domSvc.panel;
        if (!overlayEl && domSvc.overlay) overlayEl = domSvc.overlay;
      }
    } catch (_e) {}
  }
  if ((!panelEl || !overlayEl) && typeof document !== 'undefined' && document.getElementById) {
    try { if (!panelEl) panelEl = document.getElementById('panel'); } catch (_e) {}
    try { if (!overlayEl) overlayEl = document.getElementById('overlay'); } catch (_e) {}
  }
  return { panelEl, overlayEl };
}

export function handleCrashOutcome(detection, deps) {
  const { playerDead, enemyDead } = detection || {};
  const {
    audio,
    draw,
    gameOver,
    resetPowerUps,
    updateScore,
    hidePausePanel,
    panel,
    overlay,
    proceedToNextLevel,
    gameState,
    LEVEL,
    MAX_LEVEL,
    COLS,
    pnx,
    enx,
    playerEngineRef,
    enemyEngineRef,
    intervalRef
  } = deps || {};
  const showPausePanel = deps && deps.showPausePanel;
  if (!playerDead && !enemyDead) return false;
  const clearLegacyInterval = () => {
    if (intervalRef && typeof intervalRef.clear === 'function') {
      try { intervalRef.clear(); } catch (_e) {}
    } else if (intervalRef && typeof clearInterval === 'function') {
      try { clearInterval(intervalRef); } catch (_e) {}
    }
  };
  if (playerDead && enemyDead) {
    try {
      audio && typeof audio.crash === 'function' && audio.crash({ intensity: 0.95, stereo: 0 });
      audio && typeof audio.cutAll === 'function' && audio.cutAll();
    } catch (_e) {}
    try { draw && draw(); } catch (_e) {}
    try {
      dispatch(Actions.setNextLevelCarryScore(0));
      dispatch(Actions.setPersistentScore(0));
    } catch (_) {}
    if (gameState) {
      try {
        gameState.nextLevelCarryScore = 0;
        gameState.persistentScore = 0;
      } catch (_) {}
    }
    try { gameOver && gameOver('Tie!'); } catch (_e) {}
    return true;
  }
  if (playerDead) {
    try {
      audio && typeof audio.crash === 'function' && audio.crash({ intensity: 0.9, x: pnx, width: COLS });
      audio && typeof audio.cutAll === 'function' && audio.cutAll();
    } catch (_e) {}
    try { draw && draw(); } catch (_e) {}
    try {
      dispatch(Actions.setNextLevelCarryScore(0));
      dispatch(Actions.setPersistentScore(0));
    } catch (_) {}
    if (gameState) {
      try {
        gameState.nextLevelCarryScore = 0;
        gameState.persistentScore = 0;
      } catch (_) {}
    }
    try { gameOver && gameOver('You crashed!'); } catch (_e) {}
    return true;
  }
  if (enemyDead) {
    const overlayTarget = overlay || (panel && (panel.parentElement || panel.parentNode)) || null;
    try {
      audio && typeof audio.crash === 'function' && audio.crash({ intensity: 0.85, x: enx, width: COLS });
      audio && typeof audio.cutAll === 'function' && audio.cutAll();
    } catch (_e) {}
    try { resetPowerUps && resetPowerUps({ clearPickup: true }); } catch (_e) {}
    try { audio && typeof audio.stopEngines === 'function' && audio.stopEngines(); } catch (_e) {}
    if (playerEngineRef) {
      try { playerEngineRef.current = null; } catch (_e) {}
    }
    if (enemyEngineRef) {
      try { enemyEngineRef.current = null; } catch (_e) {}
    }
    const { panelEl, overlayEl } = resolveDomRefs(panel, overlay);
    const levelFromState = (gameState && typeof gameState.level === 'number' && !Number.isNaN(gameState.level))
      ? gameState.level
      : null;
    const levelFromDeps = (typeof LEVEL === 'number' && !Number.isNaN(LEVEL)) ? LEVEL : null;
    const maxLevelValue = (typeof MAX_LEVEL === 'number' && !Number.isNaN(MAX_LEVEL)) ? MAX_LEVEL : null;
    const highestKnownLevel = Math.max(
      0,
      levelFromState != null ? levelFromState : 0,
      levelFromDeps != null ? levelFromDeps : 0
    );
    const currentLevel = (maxLevelValue != null && highestKnownLevel > maxLevelValue)
      ? maxLevelValue
      : highestKnownLevel;
    const normalizedLevel = (currentLevel > 0)
      ? currentLevel
      : (levelFromState != null ? levelFromState : (levelFromDeps != null ? levelFromDeps : 0));
    const levelInt = Math.max(0, Math.floor(normalizedLevel));
    const pointsAward = 200 * levelInt;
    const totalLevels = (maxLevelValue != null && maxLevelValue > 0)
      ? maxLevelValue
      : (levelInt > 0 ? levelInt : 0);
    const reachedFinalLevel = (maxLevelValue != null)
      ? (currentLevel >= maxLevelValue && maxLevelValue > 0)
      : true;
    const baseScore = gameState && typeof gameState.score === 'number' ? gameState.score : 0;
    const basePersistent = gameState && typeof gameState.persistentScore === 'number'
      ? gameState.persistentScore
      : 0;
    const nextScore = baseScore + pointsAward;
    const nextPersistent = basePersistent + pointsAward;
    try {
      dispatch(Actions.setScore(nextScore));
      dispatch(Actions.setPersistentScore(nextPersistent));
    } catch (_) {}
    if (gameState) {
      try {
        gameState.score = nextScore;
        gameState.persistentScore = nextPersistent;
        noteScoreBroadcast(gameState, nextScore);
      } catch (_) {}
    }
    try { if (typeof updateScore === 'function') updateScore(nextScore); } catch (_) {}
    try { draw && draw(); } catch (_e) {}
    if (!reachedFinalLevel) {
      const clearedLevelLabel = Math.max(1, levelInt || 1);
      const nextLevelLabel = Math.max(
        1,
        totalLevels > 0 ? Math.min(levelInt + 1, totalLevels) : (levelInt + 1)
      );
      try {
        if (typeof showPausePanel === 'function') showPausePanel();
      } catch (_e) {}
      try {
        if (overlayEl && overlayEl.style) {
          overlayEl.style.display = 'flex';
          overlayEl.style.pointerEvents = 'auto';
        }
      } catch (_e) {}
      try {
        if (panelEl && panelEl.classList && typeof panelEl.classList.add === 'function') {
          panelEl.classList.add('panel-go');
        }
      } catch (_e) {}
      let nextLevelButton = null;
      try {
        if (panelEl && panelEl.innerHTML !== undefined) {
          panelEl.innerHTML =
            '<div class="go-title">NEXT LEVEL</div>' +
            '<div class="go-msg go-plot">Level ' + clearedLevelLabel + ' secure — the grid is re-stabilizing for the next assault.</div>' +
            '<div class="go-columns go-columns--stats">' +
              '<div class="go-column">' +
                '<div class="go-subheading">Cleared</div>' +
                '<div class="go-stat">Level ' + clearedLevelLabel + '</div>' +
                '<div class="go-stat-label">Sector Purged</div>' +
              '</div>' +
              '<div class="go-column">' +
                '<div class="go-subheading">Bonus</div>' +
                '<div class="go-stat">+' + pointsAward + '</div>' +
                '<div class="go-stat-label">Energy Credits</div>' +
              '</div>' +
            '</div>' +
            '<div class="go-msg">Initiate countermeasures and prepare for Level ' + nextLevelLabel + '.</div>' +
            '<button class="btn btn-big" id="nextLevelBtn">Start Level ' + nextLevelLabel + '</button>';
          if (panelEl.querySelector) {
            nextLevelButton = panelEl.querySelector('#nextLevelBtn');
          }
        }
      } catch (_e) {}
      if (!nextLevelButton && typeof document !== 'undefined' && document.getElementById) {
        try { nextLevelButton = document.getElementById('nextLevelBtn'); } catch (_) { nextLevelButton = null; }
      }
      if (nextLevelButton && typeof nextLevelButton.addEventListener === 'function') {
        try {
          nextLevelButton.addEventListener('click', () => {
            try { if (typeof proceedToNextLevel === 'function') proceedToNextLevel(); } catch (_) {}
          }, { once: true });
        } catch (_) {}
      }
      try {
        dispatch(Actions.setRunning(false));
        dispatch(Actions.setGameEnded(false));
        dispatch(Actions.setNextLevelCarryScore(nextPersistent));
        dispatch(Actions.setLevelTransitionPending(true));
      } catch (_) {}
      if (gameState) {
        try {
          gameState.running = false;
          gameState.gameEnded = false;
          gameState.nextLevelCarryScore = nextPersistent;
          gameState.levelTransitionPending = true;
        } catch (_) {}
      }
      clearLegacyInterval();
      return true;
    }
    const victoryMessage = totalLevels > 0
      ? 'Enemy crashed. You beat all ' + totalLevels + ' levels!'
      : 'Enemy crashed. You won!';
    try { gameOver && gameOver(victoryMessage); } catch (_e) {}
    return true;
  }
  return false;
}
