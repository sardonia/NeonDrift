const noop = () => {};

export const TickerEvent = Object.freeze({
  TEXT: 'ticker:text',
  POWERUPS: 'ticker:powerups'
});

function normaliseHandler(handler) {
  if (typeof handler === 'function') {
    return handler;
  }
  return noop;
}

export function createTickerEvents() {
  const listeners = new Map();

  function on(event, handler) {
    const key = typeof event === 'string' ? event : '';
    if (!key) {
      return noop;
    }
    const fn = normaliseHandler(handler);
    if (!listeners.has(key)) {
      listeners.set(key, new Set());
    }
    const bucket = listeners.get(key);
    bucket.add(fn);
    return () => {
      bucket.delete(fn);
      if (bucket.size === 0) {
        listeners.delete(key);
      }
    };
  }

  function off(event, handler) {
    const key = typeof event === 'string' ? event : '';
    if (!key || !listeners.has(key)) {
      return;
    }
    if (handler && typeof handler === 'function') {
      const bucket = listeners.get(key);
      bucket.delete(handler);
      if (bucket.size === 0) {
        listeners.delete(key);
      }
    } else {
      listeners.delete(key);
    }
  }

  function emit(event, payload) {
    const key = typeof event === 'string' ? event : '';
    if (!key) {
      return false;
    }
    const bucket = listeners.get(key);
    if (!bucket || bucket.size === 0) {
      return false;
    }
    for (const handler of Array.from(bucket)) {
      try {
        handler(payload);
      } catch (_) {
        // Swallow listener errors; ticker events are best-effort.
      }
    }
    return true;
  }

  function clear(event) {
    if (typeof event === 'string' && event) {
      listeners.delete(event);
      return;
    }
    listeners.clear();
  }

  function dispose() {
    listeners.clear();
  }

  return Object.freeze({ on, off, emit, clear, dispose });
}

export default {
  createTickerEvents,
  TickerEvent
};
