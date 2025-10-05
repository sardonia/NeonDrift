import { getService, register as registerService, TOKENS } from '../services/index.js';
import warnOnce from '../utils/warnOnce.js';
function getDom(){
  try {
    const svc = typeof getService === 'function' ? getService(TOKENS.DOM) : undefined;
    if (svc) return svc;
  } catch (_) {}
  try {
    if (typeof document !== 'undefined' && document.getElementById) {
      return {
        tickerScore: document.getElementById('tickerScore'),
        tickerLevel: document.getElementById('tickerLevel'),
      };
    }
  } catch (_) {}
  warnOnce('score-getDom', 'Failed to resolve DOM elements for score module');
  return {};
}
import { HudChannels } from '../core/events.js';

const HUD_SCORE_WARN_TAG = 'score-hud-service-missing';
const HUD_LEVEL_WARN_TAG = 'level-hud-service-missing';

function getHudFacade() {
  try {
    const svc = getService(TOKENS.HUD);
    if (svc) return svc;
  } catch (_) {}
  return null;
}

function applyHudScore({ value, scoreEl }) {
  try {
    const hud = getHudFacade();
    if (!hud) return false;
    if (typeof hud.setScore === 'function') {
      hud.setScore({ scoreEl, value });
      return true;
    }
    if (typeof hud.updateTickerScore === 'function') {
      hud.updateTickerScore(value);
      return true;
    }
  } catch (_) {}
  return false;
}

function applyHudLevel({ value, levelEl }) {
  try {
    const hud = getHudFacade();
    if (!hud) return false;
    if (typeof hud.setLevel === 'function') {
      hud.setLevel({ levelEl, value });
      return true;
    }
    if (typeof hud.updateTickerLevel === 'function') {
      hud.updateTickerLevel(value);
      return true;
    }
  } catch (_) {}
  return false;
}
export function updateScore(value, scoreEl) {
  try {
    const v = parseInt(value, 10) || 0;
    if (applyHudScore({ value: v, scoreEl })) {
      return;
    }
    warnOnce(HUD_SCORE_WARN_TAG, 'HUD service unavailable for score updates; falling back to DOM.');
    const dom = getDom();
    const candidates = [];
    if (scoreEl) candidates.push(scoreEl);
    if (dom) {
      if (dom.tickerScore) candidates.push(dom.tickerScore);
    }
    if (typeof document !== 'undefined' && document.getElementById) {
      const ticker = document.getElementById('tickerScore');
      if (ticker) candidates.push(ticker);
    }
    const targets = candidates.filter((el, idx, arr) => el && arr.indexOf(el) === idx);
    if (!targets.length) return;
    const text = String(v);
    for (const el of targets) {
      try {
        el.textContent = text;
      } catch (_) {}
    }
  } catch (_e) {
  }
}
export function updateLevel(value, levelEl) {
  try {
    const v = parseInt(value, 10) || 0;
    if (applyHudLevel({ value: v, levelEl })) {
      return;
    }
    warnOnce(HUD_LEVEL_WARN_TAG, 'HUD service unavailable for level updates; falling back to DOM.');
    const dom = getDom();
    const candidates = [];
    if (levelEl) candidates.push(levelEl);
    if (dom) {
      if (dom.tickerLevel) candidates.push(dom.tickerLevel);
    }
    if (typeof document !== 'undefined' && document.getElementById) {
      const ticker = document.getElementById('tickerLevel');
      if (ticker) candidates.push(ticker);
    }
    const targets = candidates.filter((el, idx, arr) => el && arr.indexOf(el) === idx);
    if (!targets.length) return;
    const text = String(v);
    for (const el of targets) {
      try {
        el.textContent = text;
      } catch (_) {}
    }
  } catch (_) {
  }
}
let __scoreOff = null;
let __levelOff = null;
export function subscribeScoreUpdates() {
  try {
    const bus = typeof getService === 'function' ? getService(TOKENS.BUS) : undefined;
    if (!bus || typeof bus.on !== 'function') return;
    if (__scoreOff) {
      try {
        __scoreOff();
      } catch {}
      __scoreOff = null;
    }
    __scoreOff = bus.on(HudChannels.SCORE_UPDATE.event, (payload) => {
      if (!payload) return;
      const v = (typeof payload.value === 'number') ? payload.value : payload.score;
      updateScore(v);
    });
  } catch (_subErr) {
  }
}
export function subscribeLevelUpdates() {
  try {
    const bus = typeof getService === 'function' ? getService(TOKENS.BUS) : undefined;
    if (!bus || typeof bus.on !== 'function') return;
    if (__levelOff) {
      try { __levelOff(); } catch (_) {}
      __levelOff = null;
    }
    __levelOff = bus.on(HudChannels.LEVEL_UPDATE.event, (payload) => {
      if (!payload) return;
      const lvl = (typeof payload.level === 'number') ? payload.level : (payload.value | 0);
      updateLevel(lvl);
    });
  } catch (_) {
  }
}
export function unsubscribeLevelUpdates() {
  try {
    if (typeof __levelOff === 'function') {
      try { __levelOff(); } catch (_) {}
      __levelOff = null;
    }
  } catch (_) {
  }
}
export function unsubscribeScoreUpdates() {
  try {
    if (typeof __scoreOff === 'function') {
      try { __scoreOff(); } catch (_) {}
      __scoreOff = null;
    }
  } catch (_) {
  }
}

// --- DI Class wrapper (back-compat facade) ---
class ScoreController {
  subscribeScoreUpdates(){ try { return subscribeScoreUpdates(); } catch(_){ return () => {}; } }
  unsubscribeScoreUpdates(){ try { return unsubscribeScoreUpdates(); } catch(_){ } }
  subscribeLevelUpdates(){ try { return subscribeLevelUpdates(); } catch(_){ return () => {}; } }
  unsubscribeLevelUpdates(){ try { return unsubscribeLevelUpdates(); } catch(_){ } }
}
const __scoreDI = new ScoreController();
try { registerService('score', __scoreDI, { force: true }); } catch(_){}
export default __scoreDI;
