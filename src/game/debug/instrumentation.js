import debugState from './debugController.js';
import augState from './augState.js';
import { TronAI } from '../../ai/TronAI.js';
export function instrument(gameState) {
  const A = augState;
  try {
    if (TronAI && typeof TronAI.chooseAIMove === 'function') {
      const wrapped = (A.wrapped = A.wrapped || {});
      if (!wrapped.ai) {
        const orig = TronAI.chooseAIMove;
        TronAI.chooseAIMove = function (...args) {
          const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
          const out = orig.apply(this, args);
          const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
          const dt = t1 - t0;
          A.aiTimes.push(dt);
          if (dt > 2.0) A.aiSpikes++;
          if (A.aiTimes.length > 240) A.aiTimes.shift();
          return out;
        };
        wrapped.ai = true;
      }
    }
  } catch (_e) {
  }
}
export function recordFrameDT(dt) {
  try {
    const A = augState;
    const threshold = 33;
    let missCount = (typeof A.dtMissWindow === 'number') ? A.dtMissWindow : 0;
    const buf = A.dtBuf;
    buf.push(dt);
    if (dt >= threshold) {
      missCount += 1;
    }
    if (buf.length > 120) {
      const removed = buf.shift();
      if (typeof removed === 'number' && removed >= threshold && missCount > 0) {
        missCount -= 1;
      }
    }
    A.dtMissWindow = missCount;
    A.dtMisses = missCount;
    const fps = (dt > 0 ? (1000 / dt) : 0);
    A.fpsEMA = (typeof A.fpsEMA === 'number')
      ? (A.fpsEMA * 0.9 + fps * 0.1)
      : fps;
    if (typeof A.lastDt === 'number') {
      const jitter = Math.abs(dt - A.lastDt);
      A.dtJitterEMA = (typeof A.dtJitterEMA === 'number')
        ? (A.dtJitterEMA * 0.95 + jitter * 0.05)
        : jitter;
    } else {
      A.dtJitterEMA = dt;
      A.dtMissWindow = missCount;
      A.dtMisses = missCount;
    }
    A.lastDt = dt;
    try {
      debugState.performance.lastFrameDT = dt;
      debugState.performance.fpsEMA = A.fpsEMA;
    } catch(_e) {
    }
  } catch (_e) {
  }
}
