import { corridorAhead, mapCorridorToIntensity } from '../utils.js';
import { HudChannels } from '../core/events.js';
import { bus as busInstance } from '../core/bus-instance.js';
import { getService, TOKENS } from '../services/index.js';

const SCORE_BROADCAST_INTERVAL_TICKS = 1.5;
const SCORE_FORCE_BROADCAST_THRESHOLD = 12;
export function updateEngineIntensities(state, playerEngine, enemyEngine) {
  if (!state) return;
  const grid = state.grid;
  const player = state.player;
  const enemy = state.enemy;
  if (player && playerEngine && typeof playerEngine.setIntensity === 'function') {
    try {
      const aheadP = corridorAhead(grid, player.x, player.y, player.dir);
      const intensity = mapCorridorToIntensity(aheadP);
      playerEngine.setIntensity(intensity);
    } catch (_e) {
    }
  }
  if (enemy && enemyEngine && typeof enemyEngine.setIntensity === 'function') {
    try {
      const aheadE = corridorAhead(grid, enemy.x, enemy.y, enemy.dir);
      const intensity = mapCorridorToIntensity(aheadE) * 0.96;
      enemyEngine.setIntensity(intensity);
    } catch (_e) {
    }
  }
}

export function noteScoreBroadcast(state, score, cooldown = SCORE_BROADCAST_INTERVAL_TICKS) {
  if (!state) return;
  try {
    const numericScore = Number.isFinite(score) ? score : state.score;
    if (Number.isFinite(numericScore)) {
      state.hudScoreLastBroadcast = numericScore;
    }
    const interval = Number.isFinite(cooldown) ? cooldown : SCORE_BROADCAST_INTERVAL_TICKS;
    state.hudScoreCooldown = Math.max(0, interval);
    state.hudScorePending = 0;
  } catch (_err) {}
}

export function incrementSurviveScore(state, updateScore, delta = 1) {
  if (!state) return;
  try {
    const normalizedDelta = Math.max(0, Number.isFinite(delta) ? delta : 0);
    const carry = typeof state.scoreAccumulator === 'number' ? state.scoreAccumulator : 0;
    const total = carry + normalizedDelta;
    const whole = Math.floor(total);
    state.scoreAccumulator = total - whole;

    if (whole > 0) {
      const baseScore = Number.isFinite(state.score) ? state.score : 0;
      const nextScore = baseScore + whole;
      state.score = nextScore;
      if (typeof state.persistentScore === 'number') {
        state.persistentScore = state.persistentScore + whole;
      } else {
        state.persistentScore = nextScore;
      }
    }

    let pending = Number.isFinite(state.hudScorePending) ? state.hudScorePending : 0;
    if (whole > 0) {
      pending += whole;
    }

    let cooldown = Number.isFinite(state.hudScoreCooldown) ? state.hudScoreCooldown : 0;
    cooldown = Math.max(0, cooldown - normalizedDelta);
    state.hudScoreCooldown = cooldown;

    if (pending <= 0) {
      state.hudScorePending = pending;
      return;
    }

    const broadcastScore = Number.isFinite(state.score) ? state.score : 0;
    const thresholdHit = pending >= SCORE_FORCE_BROADCAST_THRESHOLD;
    const broadcastDue = cooldown <= 0 || thresholdHit;

    if (!broadcastDue) {
      state.hudScorePending = pending;
      return;
    }

    state.hudScorePending = 0;
    noteScoreBroadcast(state, broadcastScore);

    if (typeof updateScore === 'function') {
      updateScore(broadcastScore);
    }
    try {
      const bus = (typeof getService === 'function') ? (getService(TOKENS.BUS) || busInstance) : busInstance;
      if (bus && typeof bus.emit === 'function') {
        bus.emit(HudChannels.SCORE_UPDATE.event, { score: broadcastScore, value: broadcastScore });
      }
    } catch (_busErr) {}
  } catch (_e) {
  }
}
export function syncProgressAndBoost(state, playerProgress, enemyProgress, boostActive) {
  if (!state) return;
  try {
    state.playerProgress = playerProgress;
    state.enemyProgress = enemyProgress;
    state.boostActive = boostActive;
  } catch (_e) {
  }
}
