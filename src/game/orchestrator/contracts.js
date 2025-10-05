// @ts-check

/**
 * @typedef {import('./types').StartGameFullOptions} StartGameFullOptions
 * @typedef {import('./types').StartRoundOptions} StartRoundOptions
 * @typedef {import('./types').ProceedToNextLevelOptions} ProceedToNextLevelOptions
 * @typedef {import('./types').StartRoundFlowOptions} StartRoundFlowOptions
 * @typedef {import('./types').ProceedToNextLevelFlowOptions} ProceedToNextLevelFlowOptions
 * @typedef {import('./types').TickDependencies} TickDependencies
 * @typedef {import('./types').StartRoundFlowTransitions} StartRoundFlowTransitions
 */

const DEV_ASSERTIONS = typeof process !== 'undefined'
  ? process.env == null || process.env.NODE_ENV !== 'production'
  : true;

const NO_OP = () => undefined;

const START_GAME_FULL_KEYS = new Set([
  'draw',
  'gameOver',
  'resetPowerUps',
  'updateScore',
  'hidePausePanel',
  'showPausePanel',
  'panel',
  'overlay',
  'proceedToNextLevel',
  'preset',
  'onFrame'
]);

const START_ROUND_KEYS = new Set(['resetLevel1', 'onStartGame', 'transitions', 'transitionToCountdown']);

const PROCEED_TO_NEXT_LEVEL_KEYS = new Set(['onStartGame']);

const START_ROUND_FLOW_KEYS = new Set([
  'intervalRef',
  'resetLevel1',
  'playerEngineRef',
  'enemyEngineRef',
  'startGame',
  'transitions',
  'transitionToCountdown',
  'safe'
]);

const ROUND_TRANSITION_KEYS = new Set(['toCountdown']);

const PROCEED_TO_NEXT_LEVEL_FLOW_KEYS = new Set(['safe']);

const TICK_DEP_KEYS = new Set([
  'audio',
  'draw',
  'gameOver',
  'resetPowerUps',
  'updateScore',
  'hidePausePanel',
  'showPausePanel',
  'panel',
  'overlay',
  'proceedToNextLevel',
  'LEVEL',
  'MAX_LEVEL',
  'COLS',
  'preset',
  'interval',
  'trailPlayer',
  'trailEnemy',
  'keysHeld'
]);

/**
 * @param {string} namespace
 * @param {unknown} value
 * @param {Set<string>} allowedKeys
 * @returns {Record<string, any>}
 */
function sanitizeOptions(namespace, value, allowedKeys) {
  if (value == null) {
    return {};
  }
  if (typeof value !== 'object') {
    if (DEV_ASSERTIONS) {
      throw new Error(`[${namespace}] options must be an object`);
    }
    return {};
  }
  const record = /** @type {Record<string, any>} */ (value);
  if (DEV_ASSERTIONS) {
    const keys = Object.keys(record);
    const unknown = keys.filter((key) => !allowedKeys.has(key));
    if (unknown.length) {
      throw new Error(`[${namespace}] Unexpected option key(s): ${unknown.join(', ')}`);
    }
  }
  return record;
}

/**
 * @param {string} namespace
 * @param {string} key
 * @param {unknown} value
 * @param {boolean} [optional]
 */
function assertFunction(namespace, key, value, optional = true) {
  if (!DEV_ASSERTIONS) {
    return;
  }
  if (value == null) {
    if (!optional) {
      throw new Error(`[${namespace}] ${key} must be a function`);
    }
    return;
  }
  if (typeof value !== 'function') {
    throw new Error(`[${namespace}] ${key} must be a function`);
  }
}

/**
 * @param {string} namespace
 * @param {string} key
 * @param {unknown} ref
 * @param {boolean} [required]
 */
function assertMutableRef(namespace, key, ref, required = false) {
  if (!DEV_ASSERTIONS) {
    return;
  }
  if (ref == null) {
    if (required) {
      throw new Error(`[${namespace}] ${key} is required`);
    }
    return;
  }
  if (typeof ref !== 'object' || !('current' in ref)) {
    throw new Error(`[${namespace}] ${key} must be an object with a current property`);
  }
}

/**
 * @param {string} namespace
 * @param {StartRoundFlowTransitions | undefined} transitions
 */
function assertRoundTransitions(namespace, transitions) {
  if (!DEV_ASSERTIONS || transitions == null) {
    return;
  }
  if (typeof transitions !== 'object') {
    throw new Error(`[${namespace}] transitions must be an object`);
  }
  const record = /** @type {Record<string, any>} */ (transitions);
  const unknown = Object.keys(record).filter((key) => !ROUND_TRANSITION_KEYS.has(key));
  if (unknown.length) {
    throw new Error(`[${namespace}] Unexpected transitions key(s): ${unknown.join(', ')}`);
  }
  if ('toCountdown' in record) {
    assertFunction(namespace, 'transitions.toCountdown', record.toCountdown);
  }
}

/**
 * @param {string} namespace
 * @param {unknown} deps
 * @returns {TickDependencies}
 */
export function assertTickDependencies(namespace, deps) {
  if (!DEV_ASSERTIONS) {
    return /** @type {TickDependencies} */ (deps || {});
  }
  if (!deps || typeof deps !== 'object') {
    throw new Error(`[${namespace}] tickDeps must be an object`);
  }
  const record = /** @type {Record<string, any>} */ (deps);
  const keys = Object.keys(record);
  const unknown = keys.filter((key) => !TICK_DEP_KEYS.has(key));
  if (unknown.length) {
    throw new Error(`[${namespace}] Unexpected tickDeps key(s): ${unknown.join(', ')}`);
  }
  for (const key of TICK_DEP_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Error(`[${namespace}] Missing tickDeps.${key}`);
    }
  }
  if (typeof record.draw !== 'function') {
    throw new Error(`[${namespace}] tickDeps.draw must be a function`);
  }
  const interval = record.interval;
  if (interval != null && typeof interval !== 'object') {
    throw new Error(`[${namespace}] tickDeps.interval must be null or an object`);
  }
  if (interval && typeof interval === 'object') {
    const hasCurrent = Object.prototype.hasOwnProperty.call(interval, 'current');
    const hasClear = typeof interval.clear === 'function';
    if (!hasCurrent && !hasClear) {
      throw new Error(`[${namespace}] tickDeps.interval must expose a current property or clear() method`);
    }
  }
  if (record.preset != null && typeof record.preset !== 'string') {
    throw new Error(`[${namespace}] tickDeps.preset must be a string when provided`);
  }
  return /** @type {TickDependencies} */ (record);
}

/**
 * @param {any} target
 * @param {readonly string[]} names
 * @returns {Function | null}
 */
function pickHandler(target, names) {
  if (!target || typeof target !== 'object') {
    return null;
  }
  for (const name of names) {
    if (!name || !(name in target)) continue;
    const candidate = target[name];
    if (typeof candidate === 'function') {
      return candidate;
    }
  }
  return null;
}

/**
 * @param {any} target
 * @param {readonly string[]} names
 * @param {Function | undefined} fallback
 * @returns {Function}
 */
function delegate(target, names, fallback) {
  const handler = pickHandler(target, names);
  if (handler) {
    return typeof handler === 'function' ? handler.bind(target) : NO_OP;
  }
  if (typeof fallback === 'function') {
    return fallback;
  }
  return NO_OP;
}

/**
 * @param {Record<string, any> | undefined} orchestrator
 * @param {Record<string, Function> | undefined} [previous]
 */
export function createFacadeContract(orchestrator, previous) {
  const source = orchestrator && typeof orchestrator === 'object' ? orchestrator : {};
  const fallback = previous && typeof previous === 'object' ? previous : {};

  const start = delegate(source, ['start', 'startGameFull', 'startGame', 'startGameFlow'], fallback.start);
  const pause = delegate(source, ['pause', 'pauseGameFull', 'pauseGame', 'pauseGameFlow'], fallback.pause);
  const resume = delegate(
    source,
    ['resume', 'resumeGameFull', 'resumeGame', 'resumeGameFlow'],
    fallback.resume || start
  );
  const startRound = delegate(source, ['startRound', 'roundStart', 'startRoundFlow'], fallback.startRound);
  const proceedToNextLevel = delegate(
    source,
    ['proceedToNextLevel', 'nextLevel'],
    fallback.proceedToNextLevel || fallback.nextLevel
  );
  const startGameFull = delegate(
    source,
    ['startGameFull', 'start', 'startGame', 'startGameFlow'],
    fallback.startGameFull || fallback.start || start
  );
  const pauseGameFull = delegate(
    source,
    ['pauseGameFull', 'pause', 'pauseGame', 'pauseGameFlow'],
    fallback.pauseGameFull || fallback.pause || pause
  );

  return {
    start,
    pause,
    resume: resume || start,
    startRound,
    nextLevel: proceedToNextLevel,
    proceedToNextLevel,
    startGameFull: startGameFull || start,
    pauseGameFull: pauseGameFull || pause
  };
}

/**
 * @param {unknown} rawOptions
 * @returns {StartGameFullOptions}
 */
export function enforceStartGameFullOptions(rawOptions) {
  const namespace = 'gameFlowController.startGameFull';
  const options = sanitizeOptions(namespace, rawOptions, START_GAME_FULL_KEYS);
  assertFunction(namespace, 'draw', options.draw);
  assertFunction(namespace, 'gameOver', options.gameOver);
  assertFunction(namespace, 'resetPowerUps', options.resetPowerUps);
  assertFunction(namespace, 'updateScore', options.updateScore);
  assertFunction(namespace, 'hidePausePanel', options.hidePausePanel);
  assertFunction(namespace, 'showPausePanel', options.showPausePanel);
  assertFunction(namespace, 'proceedToNextLevel', options.proceedToNextLevel);
  assertFunction(namespace, 'onFrame', options.onFrame);
  if (DEV_ASSERTIONS && options.preset != null && typeof options.preset !== 'string') {
    throw new Error(`[${namespace}] preset must be a string when provided`);
  }
  return /** @type {StartGameFullOptions} */ (options);
}

/**
 * @param {unknown} rawOptions
 * @returns {StartRoundOptions}
 */
export function enforceStartRoundOptions(rawOptions) {
  const namespace = 'gameFlowController.startRound';
  const options = sanitizeOptions(namespace, rawOptions, START_ROUND_KEYS);
  if (DEV_ASSERTIONS && 'resetLevel1' in options && typeof options.resetLevel1 !== 'boolean') {
    throw new Error(`[${namespace}] resetLevel1 must be a boolean`);
  }
  assertFunction(namespace, 'onStartGame', options.onStartGame);
  assertRoundTransitions(namespace, options.transitions);
  if ('transitionToCountdown' in options) {
    assertFunction(namespace, 'transitionToCountdown', options.transitionToCountdown, false);
  }
  return /** @type {StartRoundOptions} */ (options);
}

/**
 * @param {unknown} rawOptions
 * @returns {ProceedToNextLevelOptions}
 */
export function enforceProceedToNextLevelOptions(rawOptions) {
  const namespace = 'gameFlowController.proceedToNextLevel';
  const options = sanitizeOptions(namespace, rawOptions, PROCEED_TO_NEXT_LEVEL_KEYS);
  assertFunction(namespace, 'onStartGame', options.onStartGame);
  return /** @type {ProceedToNextLevelOptions} */ (options);
}

/**
 * @param {unknown} rawOptions
 * @returns {StartRoundFlowOptions}
 */
export function enforceStartRoundFlowOptions(rawOptions) {
  const namespace = 'roundController.startRoundFlow';
  const options = sanitizeOptions(namespace, rawOptions, START_ROUND_FLOW_KEYS);
  if (DEV_ASSERTIONS && 'resetLevel1' in options && typeof options.resetLevel1 !== 'boolean') {
    throw new Error(`[${namespace}] resetLevel1 must be a boolean`);
  }
  assertMutableRef(namespace, 'intervalRef', options.intervalRef, true);
  assertMutableRef(namespace, 'playerEngineRef', options.playerEngineRef, true);
  assertMutableRef(namespace, 'enemyEngineRef', options.enemyEngineRef, true);
  assertFunction(namespace, 'startGame', options.startGame);
  assertFunction(namespace, 'safe', options.safe);
  if ('transitionToCountdown' in options) {
    assertFunction(namespace, 'transitionToCountdown', options.transitionToCountdown, false);
  }
  assertRoundTransitions(namespace, options.transitions);
  return /** @type {StartRoundFlowOptions} */ (options);
}

/**
 * @param {unknown} rawOptions
 * @returns {ProceedToNextLevelFlowOptions}
 */
export function enforceProceedToNextLevelFlowOptions(rawOptions) {
  const namespace = 'roundController.proceedToNextLevelFlow';
  const options = sanitizeOptions(namespace, rawOptions, PROCEED_TO_NEXT_LEVEL_FLOW_KEYS);
  assertFunction(namespace, 'safe', options.safe);
  return /** @type {ProceedToNextLevelFlowOptions} */ (options);
}

export const __DEV_ASSERTIONS__ = DEV_ASSERTIONS;
