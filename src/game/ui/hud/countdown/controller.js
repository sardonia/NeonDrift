function safeWindow() {
  try {
    return typeof window !== 'undefined' ? window : null;
  } catch (_err) {
    return null;
  }
}

export function createCountdownController() {
  let timer = null;
  let active = false;
  const handlers = new Set();
  let resetGuard = false;

  function clearTimer() {
    if (timer !== null) {
      try {
        const win = safeWindow();
        if (win && typeof win.clearTimeout === 'function') {
          win.clearTimeout(timer);
        } else if (typeof clearTimeout === 'function') {
          clearTimeout(timer);
        }
      } catch (_err) {}
      timer = null;
    }
  }

  function schedule(durationMs) {
    clearTimer();
    const win = safeWindow();
    const scheduleFn = (win && typeof win.setTimeout === 'function') ? win.setTimeout.bind(win) : setTimeout;
    timer = scheduleFn(() => {
      timer = null;
      active = false;
      for (const handler of handlers) {
        try { handler(); } catch (_err) {}
      }
      handlers.clear();
      resetGuard = false;
    }, durationMs);
  }

  return {
    isActive() {
      return active;
    },
    start({ seconds = 3, onComplete } = {}) {
      const duration = Math.max(0, seconds) * 1000;
      active = true;
      resetGuard = timer !== null;
      if (typeof onComplete === 'function') {
        handlers.add(onComplete);
      }
      schedule(duration);
    },
    cancel() {
      clearTimer();
      active = false;
      handlers.clear();
      resetGuard = false;
    },
    onComplete(handler) {
      if (typeof handler === 'function') {
        handlers.add(handler);
      }
      return () => { handlers.delete(handler); };
    },
    getSnapshot() {
      return {
        timerActive: active,
        handlerCount: handlers.size,
        resetGuard
      };
    },
    dispose() {
      this.cancel();
    }
  };
}

export default {
  createCountdownController
};
