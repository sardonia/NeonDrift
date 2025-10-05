import { TronAI as TronAIApi } from '../../../ai/TronAI.js';

function createDefaultCollisions(constants = {}) {
  const { COLS = 0, ROWS = 0 } = constants;
  const outOfBounds = (x, y) => x < 0 || x >= COLS || y < 0 || y >= ROWS;
  const isOccupied = (grid, x, y) => !!(grid && grid[y] && grid[y][x]);
  const resolveHeadOnAndOvertakes = (
    pnx,
    pny,
    enx,
    eny,
    px0,
    py0,
    ex0,
    ey0,
    playerWillMove,
    enemyWillMove
  ) => {
    let playerDead = false;
    let enemyDead = false;
    if (playerWillMove && enemyWillMove) {
      if (pnx === enx && pny === eny) { playerDead = true; enemyDead = true; }
      if (pnx === ex0 && pny === ey0) { playerDead = true; }
      if (enx === px0 && eny === py0) { enemyDead = true; }
    } else if (playerWillMove && !enemyWillMove) {
      if (pnx === ex0 && pny === ey0) { playerDead = true; }
    } else if (!playerWillMove && enemyWillMove) {
      if (enx === px0 && eny === py0) { enemyDead = true; }
    }
    return { playerDead, enemyDead };
  };
  return { outOfBounds, isOccupied, resolveHeadOnAndOvertakes };
}

export function createAiCollisionsStage({ tronAI = TronAIApi } = {}) {
  return {
    name: 'ai-collisions',
    execute(acc = {}) {
      const { services = {}, shared = {} } = acc;
      const constants = services.constants || {};

      let ai = services.ai || shared.ai;
      if (!ai) {
        const api = tronAI || {};
        const chooseMove = typeof api.chooseAIMove === 'function'
          ? (...args) => api.chooseAIMove(...args)
          : () => 'left';
        ai = { chooseMove };
      }

      let collisions = services.collisions || shared.collisions;
      if (!collisions) {
        collisions = createDefaultCollisions(constants);
      }

      return {
        services: { ai, collisions },
        shared: { ...shared, ai, collisions }
      };
    }
  };
}
