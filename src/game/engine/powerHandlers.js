export function resetPowerUpsHelper({ gameState, resetPowerBag, options = {}, listEl }) {
  if (!gameState || typeof resetPowerBag !== 'function') return null;
  let newPU = null;
  try {
    newPU = resetPowerBag(gameState.powerBag, options, listEl);
  } catch (_e) {
    newPU = null;
  }
  return newPU;
}
