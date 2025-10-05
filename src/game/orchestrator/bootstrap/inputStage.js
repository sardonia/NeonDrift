import inputAdapterController from '../controllers/inputController.js';
import { getState as getMutableState } from '../../state/index.js';

function defaultGetDocument() {
  if (typeof document !== 'undefined') {
    return document;
  }
  return null;
}

export function createInputStage({ getDocument = defaultGetDocument } = {}) {
  return {
    name: 'input-adapters',
    execute(acc = {}, tools = {}) {
      const meta = acc.meta || {};
      const opts = meta.opts || {};
      const inputCfg = opts.inputConfig;
      if (!inputCfg) {
        return {};
      }
      const doc = inputCfg.doc || getDocument();
      if (!doc) {
        return {};
      }
      const report = typeof tools.report === 'function' ? tools.report : () => {};
      const audio = (acc.context && acc.context.audio) || acc.services.audio || null;
      const resolveGameState = () => {
        try {
          const latest = getMutableState();
          if (latest != null) {
            return latest;
          }
        } catch (_) {}
        return acc.state;
      };
      const ctx = {
        gameState: acc.state,
        getGameState: resolveGameState,
        audio,
        ...inputCfg
      };
      try {
        if (typeof inputAdapterController.initInput === 'function') {
          inputAdapterController.initInput(doc, ctx);
        }
      } catch (error) {
        report(error, { scope: 'inputAdapter.init' });
      }
      return {};
    }
  };
}
