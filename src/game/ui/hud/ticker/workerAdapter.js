import { createWorkerController } from './workerController.js';

function resolveEmitter(factory) {
  if (factory && typeof factory === 'object') {
    return factory;
  }
  if (typeof factory === 'function') {
    try {
      return factory();
    } catch (_err) {
      return null;
    }
  }
  return null;
}

function defaultWorkerFactory() {
  return null;
}

export function createWorkerAdapter({ workerFactory = defaultWorkerFactory, emitter } = {}) {
  const controller = createWorkerController({
    workerFactory,
    emitter: resolveEmitter(emitter)
  });

  let active = false;
  const unsubs = [];

  function track(subscription) {
    if (typeof subscription === 'function') {
      unsubs.push(subscription);
    }
  }

  track(controller.on('ready', () => { active = true; }));
  track(controller.on('unavailable', () => { active = false; }));
  track(controller.on('error', () => { active = false; }));

  return {
    isActive() {
      return active || controller.isActive();
    },
    init(options) {
      const started = controller.init(options);
      if (!started) {
        active = false;
      }
      return started;
    },
    postMessage(payload) {
      controller.postMessage(payload);
    },
    on(event, handler) {
      const dispose = controller.on(event, handler);
      track(dispose);
      return dispose;
    },
    dispose() {
      active = false;
      while (unsubs.length) {
        const dispose = unsubs.pop();
        try { dispose(); } catch (_err) {}
      }
      controller.dispose();
    }
  };
}

export default {
  createWorkerAdapter
};
