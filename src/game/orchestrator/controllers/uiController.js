import { initControls } from '../../ui/controls.js';
import { initDebugOverlay } from '../../ui/detailedDebugOverlay.js';
import {
  bindOverlayButtons,
  hidePausePanel,
  showPausePanel,
  updatePauseMessage,
  showCountdown,
  showGameOverOverlay
} from '../../ui/overlays.js';
import { initUiSubscriptions, disposeUiSubscriptions } from '../../ui/subscriptions.js';
export default {
  initControls,
  initDebugOverlay,
  bindOverlayButtons,
  hidePausePanel,
  showPausePanel,
  updatePauseMessage,
  showCountdown,
  showGameOverOverlay
};
export function initHudSubscriptions(deps) {
  try {
    initUiSubscriptions(deps);
  } catch (_) {
  }
}
export function disposeHudSubscriptions() {
  try {
    disposeUiSubscriptions();
  } catch (_) {
  }
}

// --- DI Class wrapper (back-compat) ---
class UIController {
  initControls(){ try { return initControls(); } catch(_){} }
  initDebugOverlay(){ try { return initDebugOverlay(); } catch(_){} }
  bindOverlayButtons(opts){ try { var o = opts||{}; if (!o.onStart && o.onStartGame) o.onStart = o.onStartGame; return bindOverlayButtons(o); } catch(_){} }
  hidePausePanel(){ try { return hidePausePanel(); } catch(_){} }
  showPausePanel(){ try { return showPausePanel(); } catch(_){} }
  updatePauseMessage(msg){ try { return updatePauseMessage(msg); } catch(_){} }
  showCountdown(...args){ try { return showCountdown(...args); } catch(_){} }
  showGameOverOverlay(p){ try { return showGameOverOverlay(p); } catch(_){} }
  initHudSubscriptions(deps){ try { return initHudSubscriptions(deps); } catch(_){} }
  disposeHudSubscriptions(){ try { return disposeHudSubscriptions(); } catch(_){} }
}

export function createUIController() {
  return new UIController();
}
