import { getService, TOKENS } from '../services/index.js';
import warnOnce from '../utils/warnOnce.js';
function getDom() {
  try {
    const svc = typeof getService === 'function' ? getService(TOKENS.DOM) : undefined;
    if (svc) return svc;
  } catch (_) {}
  try {
    if (typeof document !== 'undefined' && document.getElementById) {
      return {
        tickerPowerupsList: document.getElementById('tickerPowerupsList'),
      };
    }
  } catch (_) {}
  warnOnce('powerupsUI-getDom', 'Failed to resolve DOM for powerupsUI');
  return {};
}
export function updatePowerUpsUI(bag, listEl, options){
  const opts = options && typeof options === 'object' ? options : {};
  const skipFacade = opts.skipFacade === true;
  try {
    const dom = getDom();
    const candidates = [];
    if (listEl) candidates.push(listEl);
    if (dom) {
      if (dom.tickerPowerupsList) candidates.push(dom.tickerPowerupsList);
    }
    if (typeof document !== 'undefined' && document.getElementById) {
      const ticker = document.getElementById('tickerPowerupsList');
      if (ticker) candidates.push(ticker);
    }
    const targets = candidates.filter((el, idx, arr) => el && arr.indexOf(el) === idx);
    let handled = false;
    if (!skipFacade) {
      try {
        const hud = (() => {
          try { return getService(TOKENS.HUD); } catch (_) { return undefined; }
        })();
        if (hud && typeof hud.updateTickerPowerups === 'function') {
          handled = !!hud.updateTickerPowerups(Array.isArray(bag) ? bag : []);
        }
      } catch (_) {}
      if (!handled) {
        warnOnce('powerups-hud-service-missing', 'HUD service unavailable for powerup updates; falling back to DOM.');
      }
    }
    if (handled) return;
    if (!targets.length) return;
    for (const target of targets) {
      try { target.innerHTML = ''; } catch (_) {}
    }
    if (!bag || bag.length === 0) return;
    for (const k of bag){
      for (const target of targets) {
        const doc = target && target.ownerDocument ? target.ownerDocument : (typeof document !== 'undefined' ? document : null);
        if (!doc) continue;
        const span = doc.createElement('span');
        span.className = 'hud-powerup';
        span.textContent = (k === 'accel' ? '⚡' : k);
        span.title = (k === 'accel' ? 'Acceleration' : k);
        try { span.dataset.powerup = k; } catch(_) {}
        target.appendChild(span);
      }
    }
  } catch (_e) {
  }
}
