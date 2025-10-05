import {
  startGameFull,
  pauseGameFull,
  startRound,
  proceedToNextLevel,
  getLevel as getLevelFromOrchestrator
} from '../orchestrator.js';
import { getState as getStateFromState } from '../state/index.js';
export function init() {
  return {
    start(opts = {}) {
      return startGameFull(opts);
    },
    pause(opts = {}) {
      return pauseGameFull(opts);
    },
    startRound(opts = {}) {
      return startRound(opts);
    },
    nextLevel(opts = {}) {
      return proceedToNextLevel(opts);
    },
    getState() {
      return getStateFromState();
    },
    getLevel() {
      try {
        return getLevelFromOrchestrator();
      } catch (_) {
        const s = getStateFromState();
        return s && typeof s.level === 'number' ? s.level : 1;
      }
    }
  };
}
export default { init };
