export function detectDeaths(ctx, pnx, pny, enx, eny, px0, py0, ex0, ey0, playerWillMove, enemyWillMove) {
  const res = { playerDead: false, enemyDead: false };
  if (!ctx || !ctx.state || !ctx.collisions) return res;
  const grid = ctx.state.grid;
  const { outOfBounds, isOccupied, resolveHeadOnAndOvertakes } = ctx.collisions;
  if (playerWillMove) {
    try {
      if (outOfBounds(pnx, pny) || isOccupied(grid, pnx, pny)) {
        res.playerDead = true;
      }
    } catch (_e) {
    }
  }
  if (enemyWillMove) {
    try {
      if (outOfBounds(enx, eny) || isOccupied(grid, enx, eny)) {
        res.enemyDead = true;
      }
    } catch (_e) {
    }
  }
  if (!res.playerDead && !res.enemyDead) {
    try {
      const result = resolveHeadOnAndOvertakes(pnx, pny, enx, eny,
        px0, py0, ex0, ey0, playerWillMove, enemyWillMove);
      if (result && result.playerDead) res.playerDead = true;
      if (result && result.enemyDead) res.enemyDead = true;
    } catch (_e) {
    }
  }
  return res;
}
