function createEmitter(initialEmitter) {
  if (initialEmitter && typeof initialEmitter.on === 'function' && typeof initialEmitter.emit === 'function') {
    return initialEmitter;
  }

  const listeners = new Map();

  function on(event, handler) {
    if (typeof handler !== 'function') {
      return () => {};
    }
    const list = listeners.get(event);
    if (list) {
      list.push(handler);
    } else {
      listeners.set(event, [handler]);
    }
    return () => off(event, handler);
  }

  function off(event, handler) {
    if (!listeners.size) return;
    const list = listeners.get(event);
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx >= 0) {
      list.splice(idx, 1);
      if (!list.length) {
        listeners.delete(event);
      }
    }
  }

  function emit(event, payload) {
    const list = listeners.get(event);
    if (!list || !list.length) return;
    for (let i = 0; i < list.length; i += 1) {
      try {
        list[i](payload);
      } catch (_err) {}
    }
  }

  function clear() {
    listeners.clear();
  }

  return { on, off, emit, clear };
}

function normaliseFactory(factory) {
  if (typeof factory === 'function') return factory;
  return null;
}

export function createWorkerController({ workerFactory, emitter } = {}) {
  const bus = createEmitter(emitter);
  const factory = normaliseFactory(workerFactory);
  let worker = null;
  let active = false;
  let disposed = false;
  let messageHandler = null;
  let errorHandler = null;

  function emit(event, payload) {
    try {
      bus.emit(event, payload);
    } catch (_err) {}
  }

  function handleMessage(event) {
    const data = event && typeof event.data === 'object' ? event.data : null;
    const type = data && typeof data.type === 'string' ? data.type : null;
    if (!type) return;
    if (type === 'ready') {
      active = true;
    } else if (type === 'unavailable' || type === 'error') {
      active = false;
    }
    emit(type, data);
  }

  function handleError(errorEvent) {
    active = false;
    emit('error', { error: errorEvent });
    emit('unavailable', { reason: 'error', error: errorEvent });
  }

  function bindWorker(instance) {
    if (!instance) return false;
    const add = typeof instance.addEventListener === 'function'
      ? instance.addEventListener.bind(instance)
      : null;
    const remove = typeof instance.removeEventListener === 'function'
      ? instance.removeEventListener.bind(instance)
      : null;

    messageHandler = handleMessage;
    errorHandler = handleError;

    if (add) {
      try { add('message', messageHandler); } catch (_err) {}
      try { add('error', errorHandler); } catch (_err) {}
    } else {
      instance.onmessage = messageHandler;
      instance.onerror = errorHandler;
    }

    return () => {
      if (remove && messageHandler) {
        try { remove('message', messageHandler); } catch (_err) {}
      }
      if (remove && errorHandler) {
        try { remove('error', errorHandler); } catch (_err) {}
      }
      if (!remove) {
        if (instance.onmessage === messageHandler) {
          instance.onmessage = null;
        }
        if (instance.onerror === errorHandler) {
          instance.onerror = null;
        }
      }
      messageHandler = null;
      errorHandler = null;
    };
  }

  let unbind = null;

  function init(options) {
    if (disposed) return false;
    if (worker) return true;
    if (!factory) {
      emit('unavailable', { reason: 'no-factory' });
      return false;
    }
    let instance = null;
    try {
      instance = factory(options);
    } catch (error) {
      emit('error', { error });
      emit('unavailable', { reason: 'factory', error });
      return false;
    }
    if (!instance || typeof instance.postMessage !== 'function') {
      emit('unavailable', { reason: 'invalid-worker' });
      return false;
    }
    worker = instance;
    active = false;
    unbind = bindWorker(instance);
    emit('init', options);
    return true;
  }

  function postMessage(payload) {
    if (!worker || disposed) return;
    try {
      worker.postMessage(payload);
    } catch (error) {
      handleError(error);
    }
  }

  function on(event, handler) {
    return bus.on(event, handler);
  }

  function dispose() {
    disposed = true;
    active = false;
    if (unbind) {
      try { unbind(); } catch (_err) {}
      unbind = null;
    }
    if (worker) {
      const terminate = typeof worker.terminate === 'function' ? worker.terminate.bind(worker) : null;
      worker = null;
      if (terminate) {
        try { terminate(); } catch (_err) {}
      }
    }
    if (typeof bus.clear === 'function') {
      bus.clear();
    }
  }

  return {
    init,
    postMessage,
    on,
    dispose,
    isActive() {
      return active;
    }
  };
}

export default {
  createWorkerController
};
