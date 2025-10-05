import { isOpposite, turnSide } from '../utils.js';
export function applyBufferedTurnAndChirp(player, audio, preset) {
  if (!player) return undefined;
  const prevDir = player.dir;
  const nextDir = player.nextDir;
  if (nextDir && !isOpposite(nextDir, prevDir)) {
    player.dir = nextDir;
  }
  if (player.dir !== prevDir) {
    try {
      if (audio && typeof audio.turnChirp === 'function') {
        audio.turnChirp(turnSide(prevDir, player.dir), preset);
      }
    } catch (_e) {
    }
  }
  return prevDir;
}
