import * as C from '../Constants.js';
import { chooseEnemyDirection } from './aiHelpers.js';
import { detectDeaths } from './collisionHandlers.js';
import { handleCrashOutcome } from './crashHandlers.js';
import { commitMoves } from './commitMoves.js';
import { rebuildPulsePaths } from '../render/pulsePaths.js';
import debugState from '../debug/debugController.js';
export function processMovementSubsteps(args) {
  const {
    engineContext,
    gameState,
    audio,
    draw,
    gameOver,
    resetPowerUps,
    updateScore,
    hidePausePanel,
    showPausePanel,
    panel,
    overlay,
    proceedToNextLevel,
    LEVEL,
    MAX_LEVEL,
    COLS,
    preset,
    playerEngine,
    enemyEngine,
    interval,
    trailPlayer,
    trailEnemy,
    pulseP,
    pulseE
  } = args;
  let playerProgress = gameState.playerProgress || 0;
  let enemyProgress  = gameState.enemyProgress  || 0;
  let substeps = 0;
  let localPulseP = pulseP;
  let localPulseE = pulseE;
  const playerEngineRef = { current: playerEngine };
  const enemyEngineRef  = { current: enemyEngine };
  while ((playerProgress >= 1 || enemyProgress >= 1) && substeps < C.MAX_SUBSTEPS) {
    substeps++;
    const player = gameState.player;
    const enemy  = gameState.enemy;
    const grid   = gameState.grid;
const playerWillMove = (playerProgress >= 1);
    const enemyWillMove  = (enemyProgress >= 1);
    const px0 = player.x, py0 = player.y;
    const ex0 = enemy.x,  ey0 = enemy.y;
    let pnx = px0, pny = py0;
    if (playerWillMove) {
      const deltas = C.DIR_DELTAS[player.dir] || [0, 0];
      pnx += deltas[0];
      pny += deltas[1];
    }
    let enemyDir = enemy.dir;
    if (enemyWillMove) {
      enemyDir = chooseEnemyDirection(engineContext.ai, grid, enemy, player);
    }
    let enx = ex0, eny = ey0;
    if (enemyWillMove) {
      const edeltas = C.DIR_DELTAS[enemyDir] || [0, 0];
      enx += edeltas[0];
      eny += edeltas[1];
    }
    const { playerDead, enemyDead } = detectDeaths(
      engineContext,
      pnx, pny,
      enx, eny,
      px0, py0,
      ex0, ey0,
      playerWillMove,
      enemyWillMove
    );
    const aborted = handleCrashOutcome(
      { playerDead, enemyDead },
      {
        audio,
        draw,
        gameOver,
        resetPowerUps,
        updateScore,
        hidePausePanel,
        showPausePanel,
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
        intervalRef: interval
      }
    );
    if (aborted) {
      return {
        aborted: true,
        playerProgress,
        enemyProgress,
        pulseP: localPulseP,
        pulseE: localPulseE,
        playerEngine: playerEngineRef.current,
        enemyEngine: enemyEngineRef.current,
        lastSubsteps: substeps
      };
    }
    const needRebuild = commitMoves(engineContext, {
      playerWillMove,
      enemyWillMove,
      px0,
      py0,
      pnx,
      pny,
      ex0,
      ey0,
      enx,
      eny,
      prevEnemyDir: enemy.dir,
      enemyDir,
      preset
    });
    if (playerWillMove) playerProgress -= 1;
    if (enemyWillMove) enemyProgress -= 1;
    if (needRebuild) {
      const result = rebuildPulsePaths(trailPlayer, trailEnemy);
      localPulseP = result.pulseP;
      localPulseE = result.pulseE;
    }
  }
  try {
    debugState.performance.lastSubsteps = substeps;
  } catch (_e) {
  }
  return {
    aborted: false,
    playerProgress,
    enemyProgress,
    pulseP: localPulseP,
    pulseE: localPulseE,
    playerEngine: playerEngineRef.current,
    enemyEngine: enemyEngineRef.current,
    lastSubsteps: substeps
  };
}
