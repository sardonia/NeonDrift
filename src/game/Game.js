import { createRootAdapter } from './adapters/rootAdapter.js';
import * as Events from './core/events.js';
import { createStateAccess, setStateAccess } from './facade/stateAccess.js';
import { createFacadeContract } from './orchestrator/contracts.js';

const NO_OP = () => {};
const FLOW_EVENTS = {
  start: 'game:start',
  pause: 'game:pause',
  resume: 'game:resume',
  nextLevel: 'game:next',
  dispose: 'game:dispose'
};
const INTERNAL_ADAPTER_FLAG = '__fromAdapter';
// Keep in sync with adapters/rootAdapter.js
const INTERNAL_EVENT_FLAG = '__gameFacadeHandled__';

function asFunction(fn, fallback = NO_OP) {
  return typeof fn === 'function' ? fn : fallback;
}

function optionalFunction(fn) {
  return typeof fn === 'function' ? fn : null;
}

function pickFunction(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'function') {
      return candidate;
    }
  }
  return NO_OP;
}

function cloneWithoutInternalKeys(options) {
  if (!options || typeof options !== 'object') {
    return {};
  }
  const result = {};
  for (const [key, value] of Object.entries(options)) {
    if (key.startsWith('__')) continue;
    result[key] = value;
  }
  return result;
}

function createStubBus() {
  return {
    on: NO_OP,
    off: NO_OP,
    emit: NO_OP
  };
}

export class GameFacade {
  constructor({
    createRootAdapter: adapterFactory = createRootAdapter,
    events = Events,
    defaultPreset = 'arcade'
  } = {}) {
    this._createRootAdapter = adapterFactory;
    this._eventModule = events;
    this._defaultPreset = defaultPreset;
    this._bus = createStubBus();
    this._adapter = null;
    this._services = null;
    this._flowHandlers = createFacadeContract();
    this._stateAccess = createStateAccess();
    this._errorReporter = this._createDefaultErrorReporter();
    this._disposed = false;
    this._initialized = false;
    this._root = null;
    this._lastStatus = 'idle';
  }

  init(rootOrOptions, maybeOptions) {
    const { root, options } = this._parseInitArgs(rootOrOptions, maybeOptions);
    const {
      bus,
      events,
      orchestrator,
      state,
      selectors,
      onError
    } = options;

    if (this._adapter && typeof this._adapter.dispose === 'function') {
      this._safeCall(() => this._adapter.dispose(), 'adapter.dispose');
    }

    this._services = null;
    this._disposed = false;
    this._initialized = true;
    this._root = root ?? null;
    this._errorReporter = typeof onError === 'function' ? onError : this._createDefaultErrorReporter();

    const eventModule = events || this._eventModule;
    const resolvedBus = bus || this._createBus(eventModule);
    this._bus = this._ensureBus(resolvedBus);

    setStateAccess(this._stateAccess, state, selectors);
    this._flowHandlers = createFacadeContract(orchestrator, this._flowHandlers);

    this._services = this._buildServices();
    this._adapter = this._createAdapter(this._bus, this._services);

    return this;
  }

  start(options = {}) {
    if (!this._assertReady()) return undefined;
    return this._services.flow.start(options);
  }

  pause(options = {}) {
    if (!this._assertReady()) return undefined;
    return this._services.flow.pause(options);
  }

  resume(options = {}) {
    if (!this._assertReady()) return undefined;
    return this._services.flow.resume(options);
  }

  startRound(options = {}) {
    if (!this._assertReady()) return undefined;
    return this._services.flow.startRound(options);
  }

  nextLevel(options = {}) {
    if (!this._assertReady()) return undefined;
    return this._services.flow.nextLevel(options);
  }

  createRuntimeBindings(options = {}) {
    if (!this._assertReady()) {
      return {
        startGame: () => undefined,
        pauseGame: () => undefined,
        startRound: () => undefined,
        proceedToNextLevel: () => undefined,
        setEngineActive: () => undefined,
        gameOver: () => undefined
      };
    }

    const {
      orchestrator = {},
      gameState,
      getGameState,
      engineContext = {},
      dom = {},
      audio,
      gameOverHelper,
      resetPowerBag,
      createResetPowerUps,
      updateScore,
      showPausePanel,
      hidePausePanel,
      updatePauseMessage,
      preset
    } = options || {};

    const facade = this;
    const overlay = dom && typeof dom === 'object' ? dom.overlay ?? null : null;
    const panel = dom && typeof dom === 'object' ? dom.panel ?? null : null;
    const bgm = dom && typeof dom === 'object' ? dom.bgm ?? null : null;
    const powerupsList = dom && typeof dom === 'object'
      ? (dom.tickerPowerupsList ?? dom.powerupsList ?? dom.powerBagList ?? null)
      : null;

    const defaultPreset = typeof preset === 'string' && preset.length ? preset : this._defaultPreset;
    const stateGetters = [];
    if (typeof getGameState === 'function') {
      stateGetters.push(getGameState);
    }
    if (typeof gameState === 'function') {
      stateGetters.push(gameState);
    }
    const fallbackState = stateGetters.length === 0 ? (gameState ?? null) : null;

    const getRuntimeState = () => {
      const facadeState = facade._safeCall(() => facade.getState(), 'bindings.getState');
      if (facadeState != null) {
        return facadeState;
      }
      for (const getter of stateGetters) {
        const resolved = facade._safeCall(() => getter(), 'bindings.getState');
        if (resolved != null) {
          return resolved;
        }
      }
      return fallbackState;
    };

    const targetState = getRuntimeState();
    const audioService = audio ?? (engineContext && engineContext.audio) ?? null;
    const pauseLoop = pickFunction(orchestrator.pauseLoop);
    const orchestratorSetEngineActive = pickFunction(orchestrator.setEngineActive);
    const orchestratorGameOverFlow = pickFunction(orchestrator.gameOverFlow, orchestrator.gameOver);

    const resetPowerUps = this._createResetPowerUpsBinding(createResetPowerUps, {
      gameState: getRuntimeState,
      resetPowerBag,
      listEl: powerupsList
    });

    const intervalRef = { current: null };
    const gameOverHelperFn = asFunction(gameOverHelper);

    function createEngineRefs() {
      const playerEngine = engineContext && typeof engineContext === 'object'
        ? engineContext.playerEngine ?? null
        : null;
      const enemyEngine = engineContext && typeof engineContext === 'object'
        ? engineContext.enemyEngine ?? null
        : null;
      return {
        playerEngineRef: { current: playerEngine },
        enemyEngineRef: { current: enemyEngine }
      };
    }

    function syncEngineRefs(refs) {
      if (!refs || typeof engineContext !== 'object' || engineContext === null) {
        return;
      }
      if (refs.playerEngineRef && 'current' in refs.playerEngineRef) {
        engineContext.playerEngine = refs.playerEngineRef.current;
      }
      if (refs.enemyEngineRef && 'current' in refs.enemyEngineRef) {
        engineContext.enemyEngine = refs.enemyEngineRef.current;
      }
    }

    const setEngineActive = (active) => {
      const refs = createEngineRefs();
      const result = facade._safeCall(() => {
        if (typeof orchestratorSetEngineActive === 'function') {
          return orchestratorSetEngineActive(active, refs);
        }
        return undefined;
      }, 'setEngineActive');
      syncEngineRefs(refs);
      return result;
    };

    const gameOver = (message = '') => {
      const refs = createEngineRefs();
      const runtimeState = getRuntimeState();
      const result = facade._safeCall(() => {
        if (typeof orchestratorGameOverFlow === 'function') {
          return orchestratorGameOverFlow({
            message,
            gameState: runtimeState,
            intervalRef,
            playerEngineRef: refs.playerEngineRef,
            enemyEngineRef: refs.enemyEngineRef,
            audio: audioService,
            resetPowerUps,
            setEngineActive,
            overlay,
            panel,
            onAgain: () => startRound({ resetLevel1: true }),
            bgm,
            gameOverHelper: gameOverHelperFn,
            pauseLoop
          });
        }
        return undefined;
      }, 'gameOver');
      syncEngineRefs(refs);
      return result;
    };

    const updateScoreFn = asFunction(updateScore);
    const hidePausePanelFn = asFunction(hidePausePanel);
    const showPausePanelFn = asFunction(showPausePanel);
    const updatePauseMessageFn = asFunction(updatePauseMessage);

    function startGame(options = {}) {
      const opts = { ...options };
      const resolvedPreset = typeof opts.preset === 'string' && opts.preset.length ? opts.preset : defaultPreset;
      opts.gameOver = opts.gameOver ?? gameOver;
      opts.resetPowerUps = opts.resetPowerUps ?? resetPowerUps;
      opts.updateScore = opts.updateScore ?? updateScoreFn;
      opts.hidePausePanel = opts.hidePausePanel ?? hidePausePanelFn;
      opts.panel = opts.panel ?? panel;
      opts.proceedToNextLevel = opts.proceedToNextLevel ?? proceedToNextLevel;
      opts.preset = resolvedPreset;
      return facade.start(opts);
    }

    function pauseGame(options = {}) {
      const opts = { ...options };
      opts.showPausePanel = opts.showPausePanel ?? showPausePanelFn;
      opts.updatePauseMessage = opts.updatePauseMessage ?? updatePauseMessageFn;
      return facade.pause(opts);
    }

    function startRound(options = {}) {
      const opts = { ...options };
      if (!opts.onStartGame) {
        opts.onStartGame = startGame;
      }
      return facade.startRound(opts);
    }

    function proceedToNextLevel(options = {}) {
      const opts = { ...options };
      if (!opts.onStartGame) {
        opts.onStartGame = startGame;
      }
      return facade.nextLevel(opts);
    }

    return {
      startGame,
      pauseGame,
      startRound,
      proceedToNextLevel,
      setEngineActive,
      gameOver
    };
  }

  getState() {
    const getter = this._stateAccess.getState;
    if (typeof getter !== 'function') return undefined;
    try {
      return getter();
    } catch (error) {
      this._reportError('getState', error);
      return undefined;
    }
  }

  getLevel() {
    const state = this.getState();
    return this._extractLevel(state);
  }

  getStatus() {
    if (this._disposed) return 'disposed';
    const state = this.getState();
    const status = this._computeStatusFromState(state);
    this._lastStatus = status;
    return status;
  }

  dispose() {
    if (this._disposed) return;
    this._emitFlowEvent(FLOW_EVENTS.dispose, {});
    if (this._adapter && typeof this._adapter.dispose === 'function') {
      this._safeCall(() => this._adapter.dispose(), 'dispose.adapter');
    }
    this._adapter = null;
    if (this._services && typeof this._services.dispose === 'function') {
      this._safeCall(() => this._services.dispose(), 'dispose.services');
    }
    this._services = null;
    this._bus = this._ensureBus(createStubBus());
    this._disposed = true;
    this._initialized = false;
    this._lastStatus = 'disposed';
  }

  _parseInitArgs(arg1, arg2) {
    const hasSecondArg = arguments.length > 1 && typeof arg2 !== 'undefined';
    if (arguments.length === 0) {
      return { root: null, options: {} };
    }
    if (!hasSecondArg) {
      if (this._looksLikeInitOptions(arg1)) {
        const { root = null, ...rest } = arg1 || {};
        return { root, options: rest };
      }
      return { root: arg1 ?? null, options: {} };
    }
    return { root: arg1 ?? null, options: arg2 || {} };
  }

  _looksLikeInitOptions(value) {
    if (!value || typeof value !== 'object') return false;
    const optionKeys = ['orchestrator', 'state', 'selectors', 'bus', 'events', 'onError', 'root'];
    return optionKeys.some((key) => key in value);
  }

  _createBus(eventsModule) {
    if (eventsModule && typeof eventsModule.createBus === 'function') {
      try {
        const bus = eventsModule.createBus();
        if (bus) return bus;
      } catch (error) {
        this._reportError('createBus', error);
      }
    }
    if (eventsModule && typeof eventsModule.bus === 'object') {
      return eventsModule.bus;
    }
    if (eventsModule && typeof eventsModule.default === 'object') {
      return eventsModule.default;
    }
    return createStubBus();
  }

  _ensureBus(bus) {
    if (!bus || typeof bus !== 'object') return createStubBus();
    const target = bus;
    if (typeof target.on !== 'function') {
      target.on = NO_OP;
    }
    if (typeof target.off !== 'function') {
      target.off = typeof target.removeListener === 'function'
        ? target.removeListener.bind(target)
        : NO_OP;
    }
    if (typeof target.emit !== 'function') {
      target.emit = NO_OP;
    }
    return target;
  }

  _buildServices() {
    return {
      flow: {
        start: (options) => this._runFlow('start', options, this._normalizeStartOptions),
        pause: (options) => this._runFlow('pause', options, this._normalizePauseOptions),
        resume: (options) => this._runFlow('resume', options, this._normalizeResumeOptions),
        startRound: (options) => this._runFlow('startRound', options, this._normalizeStartRoundOptions),
        nextLevel: (options) => this._runFlow('nextLevel', options, this._normalizeNextLevelOptions)
      },
      state: {
        get: () => this.getState()
      },
      dispose: () => {}
    };
  }

  _runFlow(type, rawOptions, normalizer) {
    const { data, emitEvent } = this._extractFlowInput(rawOptions);
    const normalized = normalizer.call(this, data);
    const result = this._invokeFlow(type, normalized.flow, normalized.meta);
    if (emitEvent) {
      const eventName = FLOW_EVENTS[type];
      if (eventName) {
        this._emitFlowEvent(eventName, normalized.flow);
      }
    }
    return result;
  }

  _extractFlowInput(rawOptions) {
    if (rawOptions && typeof rawOptions === 'object' && rawOptions[INTERNAL_ADAPTER_FLAG]) {
      const { [INTERNAL_ADAPTER_FLAG]: _ignored, ...rest } = rawOptions;
      return { data: rest, emitEvent: false };
    }
    return { data: rawOptions, emitEvent: true };
  }

  _normalizeStartOptions(options) {
    const opts = cloneWithoutInternalKeys(options);
    const meta = {
      onStart: optionalFunction(opts.onStart),
      onAfter: optionalFunction(opts.onAfter),
      onError: optionalFunction(opts.onError)
    };
    delete opts.onStart;
    delete opts.onAfter;
    delete opts.onError;
    const rawShowPausePanel = opts.showPausePanel;
    opts.gameOver = asFunction(opts.gameOver);
    opts.resetPowerUps = asFunction(opts.resetPowerUps);
    opts.updateScore = asFunction(opts.updateScore);
    opts.hidePausePanel = asFunction(opts.hidePausePanel);
    opts.showPausePanel = (typeof rawShowPausePanel === 'function') ? rawShowPausePanel : null;
    opts.proceedToNextLevel = asFunction(opts.proceedToNextLevel);
    opts.panel = opts.panel ?? null;
    opts.overlay = opts.overlay ?? null;
    opts.preset = typeof opts.preset === 'string' && opts.preset.length ? opts.preset : this._defaultPreset;
    return { flow: opts, meta };
  }

  _normalizePauseOptions(options) {
    const opts = cloneWithoutInternalKeys(options);
    const meta = {
      onPause: optionalFunction(opts.onPause),
      onAfter: optionalFunction(opts.onAfter),
      onError: optionalFunction(opts.onError)
    };
    delete opts.onPause;
    delete opts.onAfter;
    delete opts.onError;
    opts.showPausePanel = asFunction(opts.showPausePanel);
    opts.updatePauseMessage = asFunction(opts.updatePauseMessage);
    return { flow: opts, meta };
  }

  _normalizeResumeOptions(options) {
    const opts = cloneWithoutInternalKeys(options);
    const meta = {
      onResume: optionalFunction(opts.onResume),
      onAfter: optionalFunction(opts.onAfter),
      onError: optionalFunction(opts.onError)
    };
    delete opts.onResume;
    delete opts.onAfter;
    delete opts.onError;
    return { flow: opts, meta };
  }

  _normalizeStartRoundOptions(options) {
    const opts = cloneWithoutInternalKeys(options);
    const meta = {
      onRoundReady: optionalFunction(opts.onRoundReady),
      onAfter: optionalFunction(opts.onAfter),
      onError: optionalFunction(opts.onError)
    };
    delete opts.onRoundReady;
    delete opts.onAfter;
    delete opts.onError;
    const startGame = optionalFunction(opts.onStartGame) ?? ((payload) => this.start(payload));
    opts.onStartGame = (payload) => this._safeCall(() => startGame(payload), 'startRound.onStartGame');
    opts.resetLevel1 = !!opts.resetLevel1;
    return { flow: opts, meta };
  }

  _normalizeNextLevelOptions(options) {
    const opts = cloneWithoutInternalKeys(options);
    const meta = {
      onRoundReady: optionalFunction(opts.onRoundReady),
      onAfter: optionalFunction(opts.onAfter),
      onError: optionalFunction(opts.onError)
    };
    delete opts.onRoundReady;
    delete opts.onAfter;
    delete opts.onError;
    const startGame = optionalFunction(opts.onStartGame) ?? ((payload) => this.start(payload));
    opts.onStartGame = (payload) => this._safeCall(() => startGame(payload), 'nextLevel.onStartGame');
    return { flow: opts, meta };
  }

  _invokeFlow(type, flowOptions, meta = {}) {
    const handler = this._flowHandlers[type];
    if (typeof handler !== 'function') {
      return undefined;
    }
    const onError = this._createErrorHandler(type, meta.onError, flowOptions);
    try {
      const result = handler(flowOptions || {});
      if (result && typeof result.then === 'function') {
        return result
          .then((value) => {
            this._afterFlow(type, flowOptions, meta, value);
            return value;
          })
          .catch((error) => {
            onError(error);
            return undefined;
          });
      }
      this._afterFlow(type, flowOptions, meta, result);
      return result;
    } catch (error) {
      onError(error);
      return undefined;
    }
  }

  _createErrorHandler(type, provided, flowOptions) {
    if (typeof provided !== 'function') {
      return (error) => this._reportError(type, error);
    }
    return (error) => {
      const context = this._createCallbackContext(type, flowOptions, undefined);
      context.error = error;
      this._safeCall(() => provided(error, context), `${type}.onError`);
    };
  }

  _afterFlow(type, flowOptions, meta, result) {
    const context = this._createCallbackContext(type, flowOptions, result);
    switch (type) {
      case 'start':
        this._safeCall(meta.onStart, 'start.onStart', context);
        break;
      case 'pause':
        this._safeCall(meta.onPause, 'pause.onPause', context);
        break;
      case 'resume':
        this._safeCall(meta.onResume, 'resume.onResume', context);
        break;
      case 'startRound':
      case 'nextLevel':
        this._safeCall(meta.onRoundReady, `${type}.onRoundReady`, context);
        break;
      default:
        break;
    }
    this._safeCall(meta.onAfter, `${type}.onAfter`, context);
  }

  _createCallbackContext(type, flowOptions, result) {
    const state = this.getState();
    const level = this._extractLevel(state);
    const status = this._computeStatusFromState(state);
    this._lastStatus = status;
    return {
      type,
      options: flowOptions,
      result,
      state,
      level,
      status
    };
  }

  _computeStatusFromState(state) {
    if (!state) return 'unknown';
    const selectors = this._stateAccess.selectors;
    try {
      if (selectors.isGameEnded(state)) return 'ended';
      if (selectors.isLevelTransitionPending(state)) return 'transition';
      if (selectors.isCountdownActive(state)) return 'countdown';
      if (selectors.isRunning(state)) return 'running';
      if (selectors.isInitialStartPending(state)) return 'ready';
    } catch (error) {
      this._reportError('status', error);
      return 'unknown';
    }
    return 'idle';
  }

  _extractLevel(state) {
    if (!state) return undefined;
    try {
      const selector = this._stateAccess.selectors.getLevel;
      const level = selector ? selector(state) : undefined;
      if (typeof level === 'number') {
        return level;
      }
    } catch (error) {
      this._reportError('level', error);
    }
    return state && typeof state.level === 'number' ? state.level : undefined;
  }

  _emitFlowEvent(eventName, flowOptions) {
    const bus = this._bus;
    if (!bus || typeof bus.emit !== 'function') return;
    let payload;
    if (flowOptions && typeof flowOptions === 'object') {
      payload = { ...flowOptions };
    } else if (typeof flowOptions === 'undefined') {
      payload = {};
    } else {
      payload = { value: flowOptions };
    }
    try {
      Object.defineProperty(payload, INTERNAL_EVENT_FLAG, {
        value: true,
        enumerable: false,
        configurable: true
      });
    } catch (_) {
      payload[INTERNAL_EVENT_FLAG] = true;
    }
    this._safeCall(() => bus.emit(eventName, payload), `emit.${eventName}`);
  }

  _createAdapter(bus, services) {
    const factory = this._createRootAdapter;
    if (typeof factory !== 'function') return null;
    if (!bus || typeof bus.on !== 'function' || typeof bus.emit !== 'function') {
      return null;
    }
    try {
      return factory(bus, services);
    } catch (error) {
      this._reportError('adapter', error);
      return null;
    }
  }

  _safeCall(fn, source, ...args) {
    if (typeof fn !== 'function') return undefined;
    try {
      return fn(...args);
    } catch (error) {
      this._reportError(source, error);
      return undefined;
    }
  }

  _assertReady() {
    if (this._disposed) {
      this._reportError('lifecycle', new Error('Game facade has been disposed'));
      return false;
    }
    if (!this._initialized) {
      this._reportError('lifecycle', new Error('Game facade has not been initialised'));
      return false;
    }
    return true;
  }

  _reportError(source, error) {
    const reporter = this._errorReporter;
    if (typeof reporter !== 'function') return;
    try {
      reporter(error, { source, facade: this });
    } catch (reportError) {
      if (typeof console !== 'undefined' && typeof console.error === 'function') {
        console.error('[GameFacade] error reporter failed', reportError);
      }
    }
  }

  _createDefaultErrorReporter() {
    return (error, context = {}) => {
      if (typeof console === 'undefined' || typeof console.error !== 'function') return;
      const prefix = context.source ? `[GameFacade:${context.source}]` : '[GameFacade]';
      console.error(prefix, error);
    };
  }

  _createResetPowerUpsBinding(factory, context = {}) {
    if (typeof factory !== 'function') {
      return () => {};
    }
    const facade = this;
    const resolveState = typeof context.gameState === 'function'
      ? () => {
          try { return context.gameState(); } catch (_) { return null; }
        }
      : () => context.gameState;
    const baseArgs = {
      resetPowerBag: context.resetPowerBag,
      listEl: context.listEl
    };
    let cachedState;
    let hasCachedState = false;
    let cachedBinding = null;

    function getBinding() {
      const state = resolveState();
      if (hasCachedState && state === cachedState && typeof cachedBinding === 'function') {
        return cachedBinding;
      }
      cachedState = state;
      hasCachedState = true;
      const binding = facade._safeCall(() => factory({
        gameState: state,
        resetPowerBag: baseArgs.resetPowerBag,
        listEl: baseArgs.listEl
      }), 'resetPowerUps');
      cachedBinding = typeof binding === 'function' ? binding : () => {};
      return cachedBinding;
    }

    return function resetPowerUps(opts) {
      const binding = getBinding();
      return binding(opts);
    };
  }
}

const defaultFacadeInstance = new GameFacade();

export function init(...args) {
  defaultFacadeInstance.init(...args);
  return defaultFacadeInstance;
}

export function createGameFacade(options) {
  return new GameFacade(options);
}

export default createGameFacade;
