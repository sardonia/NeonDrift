export function chooseEnemyDirection(ai, grid, enemy, player) {
  if (!ai || typeof ai.chooseMove !== 'function') {
    return enemy && enemy.dir;
  }
  try {
    const dir = ai.chooseMove({ grid, ai: enemy, player });
    return dir || (enemy && enemy.dir);
  } catch (_e) {
    return enemy && enemy.dir;
  }
}
