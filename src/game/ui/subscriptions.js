import {
  subscribeScoreUpdates,
  unsubscribeScoreUpdates,
  subscribeLevelUpdates,
  unsubscribeLevelUpdates
} from './score.js';
import { subscribeOverlayEvents, unsubscribeOverlayEvents } from './overlays.js';
import { updatePowerUpsUI } from './powerupsUI.js';
import { TickerEvent } from './ticker/events.js';

let _bound = false;
let _tickerController = null;
let _tickerUnsubscribe = null;
let _tickerEvents = null;
let _tickerPowerupsOff = null;

function unsubscribeTickerController() {
  if (typeof _tickerUnsubscribe === 'function') {
    try { _tickerUnsubscribe(); } catch (_) {}
  } else if (_tickerController && typeof _tickerController.unsubscribe === 'function') {
    try { _tickerController.unsubscribe(); } catch (_) {}
  }
  _tickerController = null;
  _tickerUnsubscribe = null;
}

function unsubscribeTickerEvents() {
  if (typeof _tickerPowerupsOff === 'function') {
    try { _tickerPowerupsOff(); } catch (_) {}
  } else if (_tickerEvents && typeof _tickerEvents.off === 'function') {
    try { _tickerEvents.off(TickerEvent.POWERUPS); } catch (_) {}
  }
  _tickerEvents = null;
  _tickerPowerupsOff = null;
}

function normalisePowerupList(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  if (Array.isArray(payload.list)) {
    return payload.list;
  }
  if (Array.isArray(payload.display)) {
    return payload.display;
  }
  if (Array.isArray(payload.raw)) {
    return payload.raw;
  }
  return [];
}

export function initUiSubscriptions({ tickerController, tickerEvents } = {}) {
  if (_bound) {
    try { unsubscribeScoreUpdates(); } catch (_) {}
    try { unsubscribeOverlayEvents(); } catch (_) {}
    unsubscribeTickerController();
    unsubscribeTickerEvents();
    _bound = false;
  }
  try { subscribeScoreUpdates(); } catch (_) {}
  try { subscribeLevelUpdates(); } catch (_) {}
  try { subscribeOverlayEvents(); } catch (_) {}
  if (tickerController && typeof tickerController.subscribe === 'function') {
    _tickerController = tickerController;
    try {
      _tickerUnsubscribe = tickerController.subscribe();
    } catch (_) {
      _tickerUnsubscribe = null;
    }
  }
  if (tickerEvents && typeof tickerEvents.on === 'function') {
    const handler = (payload) => {
      try {
        updatePowerUpsUI(normalisePowerupList(payload), undefined, { skipFacade: true });
      } catch (_) {}
    };
    _tickerEvents = tickerEvents;
    try {
      _tickerPowerupsOff = tickerEvents.on(TickerEvent.POWERUPS, handler);
    } catch (_) {
      _tickerPowerupsOff = null;
    }
  }
  _bound = true;
  return () => {
    disposeUiSubscriptions();
  };
}

export function disposeUiSubscriptions() {
  try { unsubscribeScoreUpdates(); } catch (_) {}
  try { unsubscribeLevelUpdates(); } catch (_) {}
  try { unsubscribeOverlayEvents(); } catch (_) {}
  unsubscribeTickerController();
  unsubscribeTickerEvents();
  _bound = false;
}
