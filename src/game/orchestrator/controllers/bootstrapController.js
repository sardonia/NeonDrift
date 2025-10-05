import { getState } from '../../state/index.js';
import * as C from '../../Constants.js';
import debugState from '../../debug/debugController.js';
import { runBootstrapPipeline, defaultReporter } from '../bootstrap/pipeline.js';
import { createRenderStage } from '../bootstrap/renderStage.js';
import { createAiCollisionsStage } from '../bootstrap/aiCollisionsStage.js';
import { createServiceRegistrationStage } from '../bootstrap/serviceRegistrationStage.js';
import { createPowerupsStage } from '../bootstrap/powerupsStage.js';
import { createInputStage } from '../bootstrap/inputStage.js';

const DEFAULT_DEBUG_STATE = debugState;

function createCssVariableReader() {
  return (prop) => {
    try {
      const win = typeof window !== 'undefined' ? window : undefined;
      const doc = typeof document !== 'undefined' ? document : undefined;
      if (!win || !doc || typeof win.getComputedStyle !== 'function') {
        return '';
      }
      const root = doc.documentElement;
      if (!root) {
        return '';
      }
      const value = win.getComputedStyle(root).getPropertyValue(prop);
      return typeof value === 'string' ? value.trim() : '';
    } catch (_) {
      return '';
    }
  };
}

function resolveCurrentLevel(state) {
  try {
    const lvl = state && typeof state.level === 'number' ? Math.floor(state.level) : 1;
    return Number.isFinite(lvl) && lvl > 0 ? lvl : 1;
  } catch (_) {
    return 1;
  }
}

function resolveEnemySpeed(constants, level) {
  const source = constants && typeof constants.computeEnemySpeed === 'function'
    ? constants.computeEnemySpeed
    : (typeof C.computeEnemySpeed === 'function' ? C.computeEnemySpeed : null);
  if (!source) {
    return undefined;
  }
  try {
    return source(level);
  } catch (_) {
    return undefined;
  }
}

export function init(opts = {}, { services: injectedServices = {}, reporter } = {}) {
  const state = getState();
  const audioService = injectedServices.audio ?? null;
  const domService = injectedServices.dom ?? null;
  const themeService = injectedServices.theme ?? null;
  const debugStateService = (() => {
    const svc = injectedServices.debugState ?? DEFAULT_DEBUG_STATE;
    if (!svc || typeof svc !== 'object') {
      return DEFAULT_DEBUG_STATE;
    }
    if (!svc.aug) {
      svc.aug = DEFAULT_DEBUG_STATE.aug;
    }
    if (!svc.ai) {
      svc.ai = DEFAULT_DEBUG_STATE.ai;
    }
    if (!svc.performance) {
      svc.performance = DEFAULT_DEBUG_STATE.performance;
    }
    return svc;
  })();
  const rngService = typeof injectedServices.rng === 'function' ? injectedServices.rng : () => Math.random();
  const constantsSource = injectedServices.constants ?? C;
  const constants = { ...(constantsSource || C) };
  const collisionsOverride = injectedServices.collisions;
  const aiOverride = injectedServices.ai;

  const readCssVariable = createCssVariableReader();

  const services = {
    audio: audioService,
    dom: domService,
    theme: themeService || { get: readCssVariable },
    debugState: debugStateService || DEFAULT_DEBUG_STATE,
    rng: rngService,
    constants
  };

  if (collisionsOverride) {
    services.collisions = collisionsOverride;
  }
  if (aiOverride) {
    services.ai = aiOverride;
  }

  const currentLevel = resolveCurrentLevel(state);
  const enemySpeed = resolveEnemySpeed(constants, currentLevel);

  const initial = {
    state,
    context: null,
    services,
    shared: {},
    meta: {
      opts,
      currentLevel,
      enemySpeed
    }
  };

  const stages = [
    createRenderStage({ readCssVariable }),
    createAiCollisionsStage(),
    createServiceRegistrationStage(),
    createPowerupsStage({ readCssVariable }),
    createInputStage()
  ];

  const result = runBootstrapPipeline(initial, stages, reporter || defaultReporter);

  return {
    state: result.state,
    context: result.context || {},
    services: result.services,
    meta: result.meta,
    failures: result.failures
  };
}
