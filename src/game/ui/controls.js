import { getService, TOKENS } from '../services/index.js';
import warnOnce from '../utils/warnOnce.js';
let _bound = false;
function _getFallbackDom() {
  try {
    if (typeof document !== 'undefined' && document.getElementById) {
      return {
        startBtn: document.getElementById('startBtn'),
        board: document.getElementById('board'),
      };
    }
  } catch (_) {
  }
  return {};
}
export function initControls({
  onStartButton,
  onAudioUnlock,
  isCountdownActive,
  dom
} = {}){
  if (_bound) return;
  _bound = true;
  let source;
  try {
    source = dom || getService(TOKENS.DOM);
    if (!source) {
      warnOnce('controls-dom', 'controls.js: no injected dom or dom service; falling back to document.getElementById');
      source = _getFallbackDom();
    }
  } catch (_e) {
    source = _getFallbackDom();
  }
  const {
    startBtn,
    board
  } = source;
  if (board && !board.__neonBoundFocus) {
    board.__neonBoundFocus = true;
    board.addEventListener('click', () => {
      try { board.focus(); } catch (_) {}
    }, { passive: true });
  }
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      try {
        if (typeof onAudioUnlock === 'function') {
          await onAudioUnlock();
        }
      } catch (_e) {
      }
      try {
        if (typeof isCountdownActive === 'function' && isCountdownActive()) {
          return;
        }
      } catch (_e) {
      }
      try {
        if (typeof onStartButton === 'function') {
          onStartButton();
        }
      } catch (_e) {
      }
    });
  }
}
