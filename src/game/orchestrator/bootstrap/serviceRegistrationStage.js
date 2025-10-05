import { createEngineContext } from '../../engineContext.js';
import debugController from '../controllers/debugController.js';
import { keysHeld } from '../../input.js';

function ensureRenderReference(engineContext, render) {
  if (!engineContext) {
    return;
  }
  if (!engineContext.render) {
    engineContext.render = {};
  }
  if (render && typeof render === 'object') {
    Object.assign(engineContext.render, render);
  }
}

function ensureAudioReference(engineContext, audio) {
  if (!engineContext) {
    return;
  }
  engineContext.audio = audio;
}

export function createServiceRegistrationStage({
  createContext = createEngineContext,
  debug = debugController,
  keyState = keysHeld
} = {}) {
  return {
    name: 'service-registration',
    execute(acc = {}, tools = {}) {
      const { services = {}, shared = {}, state } = acc;
      const report = typeof tools.report === 'function' ? tools.report : () => {};
      const audio = services.audio || null;
      const render = shared.render || {};
      const ai = shared.ai || services.ai || {};
      const collisions = services.collisions || shared.collisions || {};
      const constants = services.constants || {};

      if (audio && typeof audio.init === 'function') {
        try {
          audio.init({ muted: false });
        } catch (error) {
          report(error, { scope: 'audio.init' });
        }
      }

      if (debug && typeof debug.init === 'function') {
        try {
          debug.init(state);
        } catch (error) {
          report(error, { scope: 'debug.init' });
        }
      }

      let engineContext;
      try {
        engineContext = createContext({
          state,
          ai,
          collisions,
          render,
          constants,
          audio
        });
      } catch (error) {
        report(error, { scope: 'engineContext.create' });
        engineContext = {
          state,
          ai,
          collisions,
          render: { ...render },
          constants,
          audio
        };
      }

      try {
        if (engineContext) {
          engineContext.keysHeld = keyState;
        }
      } catch (error) {
        report(error, { scope: 'engineContext.keysHeld' });
      }

      ensureRenderReference(engineContext, render);
      ensureAudioReference(engineContext, audio);

      return {
        context: engineContext,
        services: { ai, collisions },
        shared: { render }
      };
    }
  };
}
