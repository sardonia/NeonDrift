import { REFERENCE_TICK_MS } from './Constants.js';
import debugState from './debug/debugController.js';

const MAX_CATCH_UP_MS = REFERENCE_TICK_MS;
const MAX_ACCUMULATED_MS = REFERENCE_TICK_MS * 4;
const MAX_FRAME_DT = 200;
const now = () => ((typeof performance !== 'undefined' && typeof performance.now === 'function')
  ? performance.now()
  : Date.now());
let rafId = 0;
let acc = 0;
let lastTs = 0;

function publishPerformanceMetrics({
  frameBudget = 0,
  debt = 0,
  dropped = 0,
  stepTime = 0,
  drawTime = 0,
  overrun = 0
} = {}) {
  try {
    const perf = debugState && debugState.performance;
    if (!perf) return;
    perf.catchUpBudget = frameBudget;
    perf.catchUpDebt = debt;
    perf.catchUpDropped = dropped;
    perf.stepTime = stepTime;
    perf.drawTime = drawTime;
    perf.frameOverrun = overrun;
  } catch (_e) {
  }
}

export function startLoop(stepFn, drawFn, shouldContinue, onFrame){
  cancelAnimationFrame(rafId);
  acc = 0;
  lastTs = performance.now();
  publishPerformanceMetrics();
  function frame(ts){
    if (typeof shouldContinue === 'function' && !shouldContinue()) {
      return;
    }
    let dt = ts - lastTs;
    if (!Number.isFinite(dt)) dt = 0;
    if (dt < 0) dt = 0;
    if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;
    if (typeof onFrame === 'function') {
      try { onFrame(dt); } catch(_e){}
    }
    lastTs = ts;

    const total = acc + dt;
    let dropped = 0;
    if (total > MAX_ACCUMULATED_MS) {
      dropped = total - MAX_ACCUMULATED_MS;
      acc = MAX_ACCUMULATED_MS;
    } else {
      acc = total;
    }

    const frameBudget = Math.min(acc, MAX_CATCH_UP_MS);
    let stepTime = 0;
    if (frameBudget > 0) {
      const normalized = frameBudget / REFERENCE_TICK_MS;
      const t0 = now();
      try { if (stepFn) stepFn(normalized); } catch(_e){}
      stepTime = now() - t0;
      acc -= frameBudget;
      if (acc < 1e-4) acc = 0;
    }
    const tDraw0 = now();
    try { if (drawFn) drawFn(); } catch(_e){}
    const drawTime = now() - tDraw0;
    const overrun = Math.max(0, dt - frameBudget);
    publishPerformanceMetrics({
      frameBudget,
      debt: acc,
      dropped,
      stepTime,
      drawTime,
      overrun
    });
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
}
export function stopLoop(){
  cancelAnimationFrame(rafId);
  rafId = 0;
}
