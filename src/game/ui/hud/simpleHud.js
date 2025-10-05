// Simple HUD service for Neon Drift.
//
// This implementation replaces the complex off‑screen canvas and worker
// based ticker with a straightforward DOM and CSS ticker.  It updates
// score, level and power‑ups in the info panel, drives a scrolling
// marquee using CSS animations, and shows a centred “PAUSE” banner
// when the game is paused.  All ticker methods that were previously
// supported are stubbed to no‑ops, so that existing calls in the
// orchestrator do not throw errors.

import { createDomAdapter } from './domAdapter.js';

/**
 * Create a simple HUD service.  This service exposes a subset of
 * methods expected by the game orchestrator and UI controllers.  It
 * manipulates DOM elements directly instead of drawing into
 * canvases or spawning workers.
 *
 * @param {Object} options Options passed by the service manifest.
 * @param {Object} options.dom A DOM service providing optional
 *   element references.  If not provided, elements are resolved by
 *   their id from the global document.
 * @param {Object} [options.bus] Event bus (unused here but kept for
 *   API parity).
 * @param {Object} [options.audio] Audio controller used for mute
 *   toggling.
 * @returns {Object} HUD facade with methods used by the orchestrator.
 */
export function createHudService({ dom, bus, audio } = {}) {
  const domAdapter = createDomAdapter(dom);
  // Internal state for ticker text and pause status
  let currentMessage = '';
  let paused = false;

  /**
   * Update the text of the marquee in both the primary and repeat
   * spans.  Also update the hidden accessible span with id
   * `tickerText` so screen readers announce the current message.
   *
   * @param {string} message The message to scroll.
   */
  function updateMarquee(message) {
    currentMessage = message || '';
    // Locate the primary and repeat text elements
    const primary = document.querySelector('.ticker-text.ticker-text--primary');
    const repeat = document.querySelector('.ticker-text.ticker-text--repeat');
    if (primary) {
      primary.textContent = currentMessage;
    }
    if (repeat) {
      repeat.textContent = currentMessage;
    }
    // Update the hidden accessible text node if present
    const idNode = domAdapter.get('tickerText');
    if (idNode && idNode !== primary) {
      idNode.textContent = currentMessage;
    }
  }

  /**
   * Render a "PAUSE" banner centred on the ticker by switching
   * the ticker track to paused mode and replacing both message
   * spans with a pause string.  This does not modify the saved
   * message, so it can be resumed later.
   */
  function renderPauseBanner() {
    const track = document.querySelector('.ticker-track');
    if (track) {
      track.setAttribute('data-mode', 'paused');
    }
    const pauseMessage = '*** PAUSE ***';
    const primary = document.querySelector('.ticker-text.ticker-text--primary');
    const repeat = document.querySelector('.ticker-text.ticker-text--repeat');
    if (primary) primary.textContent = pauseMessage;
    if (repeat) repeat.textContent = pauseMessage;
    // Update accessible text
    const idNode = domAdapter.get('tickerText');
    if (idNode && idNode !== primary) {
      idNode.textContent = pauseMessage;
    }
  }

  /**
   * Restore the ticker to scrolling mode and replace the pause banner
   * with the current message.
   */
  function clearPauseBanner() {
    const track = document.querySelector('.ticker-track');
    if (track) {
      track.setAttribute('data-mode', 'scroll');
    }
    updateMarquee(currentMessage);
  }

  /**
   * Update the displayed score.  The game may call this with
   * different element references; we always synchronise the DOM
   * element with id `tickerScore`.
   *
   * @param {Object} param0
   * @param {HTMLElement} [param0.scoreEl] An explicit element to
   *   update alongside the default one.
   * @param {number} param0.value The numeric score.
   */
  function setScore({ scoreEl, value } = {}) {
    const v = Number.isFinite(value) ? (value | 0) : 0;
    const targets = [];
    if (scoreEl) targets.push(scoreEl);
    const domScore = domAdapter.get('tickerScore');
    if (domScore) targets.push(domScore);
    const unique = targets.filter((el, idx, arr) => el && arr.indexOf(el) === idx);
    const text = String(v);
    unique.forEach((el) => {
      try { el.textContent = text; } catch (_) {}
    });
  }

  /**
   * Update the displayed level.  Similar to setScore, but for the
   * element id `tickerLevel`.
   *
   * @param {Object} param0
   * @param {HTMLElement} [param0.levelEl] An explicit element to
   *   update alongside the default one.
   * @param {number} param0.value The numeric level.
   */
  function setLevel({ levelEl, value } = {}) {
    const v = Number.isFinite(value) ? (value | 0) : 0;
    const targets = [];
    if (levelEl) targets.push(levelEl);
    const domLevel = domAdapter.get('tickerLevel');
    if (domLevel) targets.push(domLevel);
    const unique = targets.filter((el, idx, arr) => el && arr.indexOf(el) === idx);
    const text = String(v);
    unique.forEach((el) => {
      try { el.textContent = text; } catch (_) {}
    });
  }

  /**
   * Update the power‑up icons in the info panel.  Accepts a list of
   * strings representing the raw power‑up names and converts them to
   * human‑readable labels or icons.  The special key `accel` maps to
   * a lightning bolt glyph.  Unknown keys are upper‑cased.
   *
   * @param {Array<string>} list A list of power‑up identifiers.
   */
  function updateTickerPowerups(list) {
    const container = domAdapter.get('tickerPowerupsList');
    if (!container) return true;
    // Clear existing contents
    while (container.firstChild) container.removeChild(container.firstChild);
    if (Array.isArray(list) && list.length) {
      list.forEach((item) => {
        const span = document.createElement('span');
        span.className = 'hud-powerup';
        // Normalise the identifier once for both text content and dataset
        const key = (typeof item === 'string' ? item.toLowerCase() : String(item)).trim();
        // Use a lightning bolt glyph for the accel power‑up, fall back to
        // upper‑cased keys for other power‑ups.  Always set a data
        // attribute so CSS can target specific power‑ups (e.g. enlarge
        // the accel bolt).  
        if (key === 'accel') {
          span.textContent = '⚡';
        } else {
          span.textContent = String(key).toUpperCase();
        }
        try {
          span.dataset.powerup = key;
        } catch (_) {}
        container.appendChild(span);
      });
    }
    return true;
  }

  /**
   * Initialises the HUD.  This method binds the mute button and
   * synchronises the marquee with any initial text content present
   * in the accessible ticker node.  It also applies the current
   * muted state to the mute button label.
   *
   * @param {Object} opts Options including mute button overrides.
   */
  function initHud({ muteBtn, bgm, toggleMute, isMuted } = {}) {
    const muteEl = muteBtn || domAdapter.get('muteBtn');
    const bgmEl = bgm || domAdapter.get('bgm');
    // Bind mute button once
    if (muteEl && !muteEl.__neonBound) {
      muteEl.__neonBound = true;
      const readMuted = () => {
        if (typeof isMuted === 'function') {
          try { return !!isMuted(); } catch (_) {}
        }
        if (audio && typeof audio.isMuted === 'function') {
          try { return !!audio.isMuted(); } catch (_) {}
        }
        if (bgmEl) {
          try { return !!bgmEl.muted; } catch (_) {}
        }
        return false;
      };
      const applyLabel = (flag) => {
        try { muteEl.textContent = flag ? '🔇 Off' : '🔊 On'; } catch (_) {}
      };
      applyLabel(readMuted());
      muteEl.addEventListener('click', () => {
        let nowMuted = null;
        if (typeof toggleMute === 'function') {
          try { nowMuted = toggleMute(); } catch (_) {}
        } else if (audio && typeof audio.toggleMute === 'function') {
          try { nowMuted = audio.toggleMute(); } catch (_) {}
        }
        if (nowMuted === null) {
          nowMuted = !readMuted();
          if (bgmEl) {
            try { bgmEl.muted = nowMuted; } catch (_) {}
          }
        }
        applyLabel(!!nowMuted);
      }, { passive: true });
    }
    // Initialise the marquee with any initial text in tickerText
    const initialNode = domAdapter.get('tickerText');
    let initial = '';
    if (initialNode && typeof initialNode.textContent === 'string') {
      initial = initialNode.textContent.trim();
    }
    updateMarquee(initial);
  }

  /**
   * Initialise the ticker.  For compatibility with the previous
   * interface, this method accepts options but simply forwards the
   * text to updateMarquee.
   *
   * @param {Object} opts
   * @param {string} [opts.text] The message to display.
   */
  function initTicker(opts = {}) {
    if (opts && typeof opts.text === 'string') {
      updateMarquee(opts.text.trim());
    }
  }

  /**
   * Set the marquee text.  Delegates to updateMarquee.
   * @param {string} text The message to display.
   */
  function setTickerText(text) {
    updateMarquee(text);
  }

  /** Pause the marquee and display the pause banner. */
  function pauseTicker() {
    paused = true;
    // Keep the info panel visible when paused and just update the
    // marquee to show the pause banner.  The track will centre the
    // text automatically when data-mode="paused" is set.
    renderPauseBanner();
  }

  /** Resume scrolling if previously paused. */
  function resumeTicker() {
    if (!paused) return;
    paused = false;
    clearPauseBanner();
  }

  /**
   * Stub methods to maintain API compatibility.  These methods are
   * no‑ops in the simplified ticker.
   */
  function updateTickerScore(v) {}
  function updateTickerLevel(v) {}

  /**
   * Show the pause banner.  Alias for pauseTicker.
   */
  function showPauseTicker() {
    pauseTicker();
  }

  /**
   * Hide the pause banner and resume scrolling.  Alias for
   * resumeTicker.
   */
  function hidePauseTicker() {
    resumeTicker();
  }

  /**
   * Return an empty ticker events object.  The complex ticker used
   * an event emitter to communicate text updates; the simple ticker
   * does not emit any events.
   */
  function getTickerEvents() {
    return {
      on() {},
      off() {},
      emit() {},
      dispose() {},
    };
  }

  /**
   * Return empty debug metrics.  The complex implementation
   * collected metrics for diagnostics; the simple ticker does not.
   */
  function getDebugMetrics() {
    return {};
  }

  /** Dispose resources.  The simple ticker allocates no workers or
   * subscriptions, so there is nothing to clean up.
   */
  function dispose() {}

  // Expose API matching the original HUD facade.  Unused
  // parameters are accepted for compatibility.
  return {
    initHud,
    initTicker,
    setTickerText,
    pauseTicker,
    resumeTicker,
    updateTickerScore,
    updateTickerLevel,
    updateTickerPowerups,
    showPauseTicker,
    hidePauseTicker,
    setScore,
    setLevel,
    getTickerEvents,
    getDebugMetrics,
    dispose,
  };
}

export default { createHudService };