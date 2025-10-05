import { COLS, ROWS } from './Constants.js';
export function outOfBounds(x, y){
  return x < 0 || x >= COLS || y < 0 || y >= ROWS;
}
export function isOccupied(grid, x, y){
  return !!(grid && grid[y] && grid[y][x]);
}
export function resolveHeadOnAndOvertakes(pnx, pny, enx, eny, px0, py0, ex0, ey0, playerWillMove, enemyWillMove){
  let playerDead = false, enemyDead = false;
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
}
