// @ts-check

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {string[]} errors
 * @property {string[]} warnings
 */

/**
 * @callback PayloadValidator
 * @param {unknown} payload
 * @returns {ValidationResult}
 */

/**
 * Normalise a validator-like value into a function.
 *
 * @param {unknown} value
 * @returns {PayloadValidator | null}
 */
function toValidator(value) {
  if (typeof value === 'function') {
    return /** @type {PayloadValidator} */ (value);
  }
  if (value && typeof value === 'object') {
    const maybeValidate = /** @type {{ validate?: unknown, validator?: unknown }} */ (value);
    if (typeof maybeValidate.validate === 'function') {
      return /** @type {PayloadValidator} */ (maybeValidate.validate);
    }
    if (typeof maybeValidate.validator === 'function') {
      return /** @type {PayloadValidator} */ (maybeValidate.validator);
    }
  }
  return null;
}

/**
 * @typedef {Object} ChannelDefinition
 * @property {string} alias
 * @property {string} event
 * @property {string} name
 * @property {PayloadValidator | null} [validate]
 * @property {PayloadValidator | null} [validator]
 */

/**
 * Build frozen channel descriptors pairing event names with their validators.
 *
 * @param {Record<string, string | { event?: string, name?: string, channel?: string, validate?: PayloadValidator | null | undefined, validator?: PayloadValidator | null | undefined } | [string, PayloadValidator | null | undefined]>} definitions
 * @returns {Record<string, ChannelDefinition>}
 */
function createChannels(definitions) {
  const channels = {};
  for (const [alias, config] of Object.entries(definitions || {})) {
    let event = '';
    let validator = null;
    if (typeof config === 'string') {
      event = config;
    } else if (Array.isArray(config)) {
      event = typeof config[0] === 'string' ? config[0] : '';
      validator = toValidator(config[1]);
    } else if (config && typeof config === 'object') {
      const descriptor = /** @type {{ event?: unknown, name?: unknown, channel?: unknown, validate?: unknown, validator?: unknown }} */ (config);
      event = typeof descriptor.event === 'string'
        ? descriptor.event
        : typeof descriptor.name === 'string'
          ? descriptor.name
          : typeof descriptor.channel === 'string'
            ? descriptor.channel
            : '';
      validator = toValidator(descriptor.validate) || toValidator(descriptor.validator);
    }

    if (typeof event !== 'string' || !event) {
      continue;
    }

    const channel = {
      alias,
      event,
      name: event,
      validate: validator,
      validator
    };

    Object.defineProperty(channel, 'alias', { value: alias, enumerable: true, configurable: false, writable: false });
    Object.defineProperty(channel, 'event', { value: event, enumerable: true, configurable: false, writable: false });
    Object.defineProperty(channel, 'name', { value: event, enumerable: true, configurable: false, writable: false });
    Object.defineProperty(channel, 'validate', { value: validator, enumerable: !!validator, configurable: false, writable: false });
    Object.defineProperty(channel, 'validator', { value: validator, enumerable: false, configurable: false, writable: false });
    Object.defineProperty(channel, 'toString', {
      value() { return event; },
      enumerable: false
    });
    Object.defineProperty(channel, Symbol.toPrimitive, {
      value() { return event; },
      enumerable: false
    });

    channels[alias] = Object.freeze(channel);
  }
  return Object.freeze(channels);
}

/**
 * Collect validators from one or more channel groups keyed by event name.
 *
 * @param {...Record<string, ChannelDefinition>} groups
 * @returns {Record<string, PayloadValidator>}
 */
function collectValidators(...groups) {
  const validators = {};
  for (const group of groups) {
    if (!group || typeof group !== 'object') continue;
    for (const descriptor of Object.values(group)) {
      if (!descriptor || typeof descriptor !== 'object') continue;
      if (descriptor.validate) {
        validators[descriptor.event] = descriptor.validate;
      }
    }
  }
  return validators;
}

/**
 * Project channel definitions into a simple alias -> event name map.
 *
 * @param {...Record<string, ChannelDefinition>} groups
 * @returns {Record<string, string>}
 */
function collectEvents(...groups) {
  const events = {};
  for (const group of groups) {
    if (!group || typeof group !== 'object') continue;
    for (const [alias, descriptor] of Object.entries(group)) {
      if (!descriptor || typeof descriptor !== 'object') continue;
      events[alias] = descriptor.event;
    }
  }
  return events;
}

/**
 * Canonical overlay types for HUD.SHOW_OVERLAY payloads.
 */
export const OverlayTypes = Object.freeze({
  COUNTDOWN: 'countdown',
  PAUSE: 'pause',
  GAMEOVER: 'gameover',
  LEVELUP: 'levelup'
});

/**
 * @typedef {'countdown' | 'pause' | 'gameover' | 'levelup'} KnownOverlayKind
 */

/**
 * @typedef {KnownOverlayKind | string} HudOverlayKind
 */

/**
 * @typedef {Object} HudOverlayPayload
 * @property {HudOverlayKind} kind
 * @property {Record<string, unknown>} [data]
 */

/**
 * @typedef {Object} HudHideOverlayPayload
 * @property {HudOverlayKind} [kind]
 */

/**
 * @typedef {Object} HudScoreUpdatePayload
 * @property {number} [score]
 * @property {number} [value]
 */

/**
 * @typedef {Object} HudLevelUpdatePayload
 * @property {number} [level]
 * @property {number} [value]
 */

/**
 * @typedef {Object} HudTickerTextPayload
 * @property {string} [text]
 */

/**
 * @typedef {Object} AudioCountdownPayload
 * @property {HTMLAudioElement | null | undefined} [bgm]
 * @property {HTMLAudioElement | null | undefined} [audioElement]
 * @property {number} [volume]
 */

/**
 * @typedef {Object} AudioBgmResetPayload
 * @property {HTMLAudioElement | null | undefined} [bgm]
 * @property {HTMLAudioElement | null | undefined} [audioElement]
 * @property {number} [volume]
 */

/**
 * @typedef {Object} AudioMixPayload
 * @property {number} [master]
 * @property {number} [music]
 * @property {number} [sfx]
 * @property {Record<string, unknown>} [channels]
 */

/**
 * @typedef {Object} GameRoundLifecyclePayload
 * @property {number} [level]
 * @property {number} [score]
 * @property {string} [reason]
 * @property {Record<string, unknown>} [meta]
 */

const OVERLAY_KIND_SET = new Set(Object.values(OverlayTypes));

function createValidationResult() {
  return { valid: true, errors: [], warnings: [] };
}

function pushError(result, message) {
  result.valid = false;
  result.errors.push(message);
}

function pushWarning(result, message) {
  result.warnings.push(message);
}

/**
 * @param {unknown} payload
 * @returns {ValidationResult}
 */
function validateHudShowOverlayPayload(payload) {
  const result = createValidationResult();
  if (!payload || typeof payload !== 'object') {
    pushError(result, 'HUD.SHOW_OVERLAY expects an object payload');
    return result;
  }
  const { kind, data } = /** @type {HudOverlayPayload} */ (payload);
  if (typeof kind !== 'string' || !kind.trim()) {
    pushError(result, 'HUD.SHOW_OVERLAY requires a non-empty "kind" string');
  } else {
    const normalized = kind.trim().toLowerCase();
    if (!OVERLAY_KIND_SET.has(normalized)) {
      pushWarning(result, `HUD overlay kind "${kind}" is not recognised`);
    }
    if (normalized === OverlayTypes.COUNTDOWN) {
      const seconds = data && typeof data === 'object' ? data.seconds : undefined;
      if (typeof seconds !== 'number') {
        pushWarning(result, 'Countdown overlays typically provide a numeric data.seconds value');
      }
    }
  }
  if (data !== undefined && (typeof data !== 'object' || data === null)) {
    pushError(result, 'HUD.SHOW_OVERLAY "data" must be an object when provided');
  }
  return result;
}

/**
 * @param {unknown} payload
 * @returns {ValidationResult}
 */
function validateHudHideOverlayPayload(payload) {
  const result = createValidationResult();
  if (payload === undefined || payload === null) {
    return result;
  }
  if (typeof payload !== 'object') {
    pushError(result, 'HUD.HIDE_OVERLAY payload must be an object when provided');
    return result;
  }
  const { kind } = /** @type {HudHideOverlayPayload} */ (payload);
  if (kind !== undefined) {
    if (typeof kind !== 'string' || !kind.trim()) {
      pushError(result, 'HUD.HIDE_OVERLAY "kind" must be a non-empty string when supplied');
    } else if (!OVERLAY_KIND_SET.has(kind.trim().toLowerCase())) {
      pushWarning(result, `HUD overlay kind "${kind}" is not recognised`);
    }
  }
  return result;
}

/**
 * @param {unknown} payload
 * @returns {ValidationResult}
 */
function validateHudScoreUpdatePayload(payload) {
  const result = createValidationResult();
  if (!payload || typeof payload !== 'object') {
    pushError(result, 'HUD.SCORE_UPDATE expects an object payload');
    return result;
  }
  const { score, value } = /** @type {HudScoreUpdatePayload} */ (payload);
  if (typeof score !== 'number' && typeof value !== 'number') {
    pushError(result, 'HUD.SCORE_UPDATE requires a numeric "score" or "value"');
  }
  return result;
}

/**
 * @param {unknown} payload
 * @returns {ValidationResult}
 */
function validateHudLevelUpdatePayload(payload) {
  const result = createValidationResult();
  if (!payload || typeof payload !== 'object') {
    pushError(result, 'HUD.LEVEL_UPDATE expects an object payload');
    return result;
  }
  const { level, value } = /** @type {HudLevelUpdatePayload} */ (payload);
  if (typeof level !== 'number' && typeof value !== 'number') {
    pushError(result, 'HUD.LEVEL_UPDATE requires a numeric "level" or "value"');
  }
  return result;
}

/**
 * @param {unknown} payload
 * @returns {ValidationResult}
 */
function validateHudTickerTextPayload(payload) {
  const result = createValidationResult();
  if (payload === undefined || payload === null) {
    return result;
  }
  if (typeof payload === 'string') {
    return result;
  }
  if (typeof payload !== 'object') {
    pushError(result, 'HUD.TICKER_TEXT expects a string or object payload');
    return result;
  }
  const { text } = /** @type {HudTickerTextPayload} */ (payload);
  if (text !== undefined && typeof text !== 'string') {
    pushError(result, 'HUD.TICKER_TEXT "text" must be a string when provided');
  }
  return result;
}

/**
 * @param {unknown} payload
 * @returns {ValidationResult}
 */
function validateAudioCountdownPayload(payload) {
  const result = createValidationResult();
  if (payload === undefined || payload === null) {
    return result;
  }
  if (typeof payload !== 'object') {
    pushError(result, 'AUDIO.PREPARE_COUNTDOWN expects an object payload when provided');
    return result;
  }
  const { volume } = /** @type {AudioCountdownPayload} */ (payload);
  if (volume !== undefined && typeof volume !== 'number') {
    pushWarning(result, 'AUDIO.PREPARE_COUNTDOWN volume should be numeric');
  }
  return result;
}

/**
 * @param {unknown} payload
 * @returns {ValidationResult}
 */
function validateAudioNoPayload(payload) {
  const result = createValidationResult();
  if (payload !== undefined) {
    pushWarning(result, 'Audio event payload will be ignored');
  }
  return result;
}

/**
 * @param {unknown} payload
 * @returns {ValidationResult}
 */
function validateAudioBgmResetPayload(payload) {
  const result = createValidationResult();
  if (payload === undefined || payload === null) {
    pushWarning(result, 'AUDIO.BGM_RESET_PLAY typically provides a payload describing the audio element');
    return result;
  }
  if (typeof payload !== 'object') {
    pushError(result, 'AUDIO.BGM_RESET_PLAY expects an object payload');
    return result;
  }
  const { volume } = /** @type {AudioBgmResetPayload} */ (payload);
  if (volume !== undefined && typeof volume !== 'number') {
    pushWarning(result, 'AUDIO.BGM_RESET_PLAY volume should be numeric');
  }
  return result;
}

/**
 * @param {unknown} payload
 * @returns {ValidationResult}
 */
function validateAudioMixPayload(payload) {
  const result = createValidationResult();
  if (!payload || typeof payload !== 'object') {
    pushError(result, 'AUDIO.SET_MIX expects an object payload');
  }
  return result;
}

/**
 * @param {unknown} payload
 * @returns {ValidationResult}
 */
function validateGameRoundPayload(payload) {
  const result = createValidationResult();
  if (payload === undefined || payload === null) {
    return result;
  }
  if (typeof payload !== 'object') {
    pushError(result, 'ROUND events expect an object payload when provided');
  }
  return result;
}

/**
 * @param {unknown} payload
 * @returns {ValidationResult}
 */
function validateDiagnosticsReportPayload(payload) {
  const result = createValidationResult();
  if (!payload || typeof payload !== 'object') {
    pushError(result, 'DIAGNOSTICS.REPORT payload must be an object');
    return result;
  }

  const {
    label,
    message,
    severity,
    error,
    context,
    meta,
    timestamp
  } = /** @type {Record<string, unknown>} */ (payload);

  if (typeof label !== 'string' || !label.trim()) {
    pushError(result, 'DIAGNOSTICS.REPORT requires a non-empty string label');
  }
  if (typeof message !== 'string' || !message.trim()) {
    pushError(result, 'DIAGNOSTICS.REPORT requires a non-empty string message');
  }
  if (severity !== undefined && typeof severity !== 'string') {
    pushWarning(result, 'DIAGNOSTICS.REPORT severity should be a string');
  }
  if (error !== undefined && (typeof error !== 'object' || error === null)) {
    pushWarning(result, 'DIAGNOSTICS.REPORT error should be an object when provided');
  }
  if (context !== undefined && context !== null && typeof context !== 'object') {
    pushWarning(result, 'DIAGNOSTICS.REPORT context should be an object when provided');
  }
  if (meta !== undefined && meta !== null && typeof meta !== 'object') {
    pushWarning(result, 'DIAGNOSTICS.REPORT meta should be an object when provided');
  }
  if (timestamp !== undefined && !Number.isFinite(/** @type {number} */(timestamp))) {
    pushWarning(result, 'DIAGNOSTICS.REPORT timestamp should be numeric when provided');
  }

  return result;
}

export const HudChannels = Object.freeze(createChannels({
  SHOW_OVERLAY: { event: 'HUD.SHOW_OVERLAY', validate: validateHudShowOverlayPayload },
  HIDE_OVERLAY: { event: 'HUD.HIDE_OVERLAY', validate: validateHudHideOverlayPayload },
  SCORE_UPDATE: { event: 'HUD.SCORE_UPDATE', validate: validateHudScoreUpdatePayload },
  LEVEL_UPDATE: { event: 'HUD.LEVEL_UPDATE', validate: validateHudLevelUpdatePayload },
  TICKER_TEXT: { event: 'HUD.TICKER_TEXT', validate: validateHudTickerTextPayload }
}));

export const AudioChannels = Object.freeze(createChannels({
  PREPARE_COUNTDOWN: { event: 'AUDIO.PREPARE_COUNTDOWN', validate: validateAudioCountdownPayload },
  RESUME_AND_UNLOCK: { event: 'AUDIO.RESUME_AND_UNLOCK', validate: validateAudioNoPayload },
  CUT_ALL: { event: 'AUDIO.CUT_ALL', validate: validateAudioNoPayload },
  START_ENGINES: { event: 'AUDIO.START_ENGINES', validate: validateAudioNoPayload },
  KILL_ENGINES: { event: 'AUDIO.KILL_ENGINES', validate: validateAudioNoPayload },
  BGM_RESET_PLAY: { event: 'AUDIO.BGM_RESET_PLAY', validate: validateAudioBgmResetPayload },
  SET_MIX: { event: 'AUDIO.SET_MIX', validate: validateAudioMixPayload }
}));

export const GameChannels = Object.freeze(createChannels({
  ROUND_START: { event: 'ROUND.START', validate: validateGameRoundPayload },
  ROUND_PAUSE: { event: 'ROUND.PAUSE', validate: validateGameRoundPayload },
  ROUND_RESUME: { event: 'ROUND.RESUME', validate: validateGameRoundPayload },
  ROUND_CRASHED: { event: 'ROUND.CRASHED', validate: validateGameRoundPayload },
  ROUND_NEXT_LEVEL: { event: 'ROUND.NEXT_LEVEL', validate: validateGameRoundPayload }
}));

export const DiagnosticsChannels = Object.freeze(createChannels({
  REPORT: { event: 'DIAGNOSTICS.REPORT', validate: validateDiagnosticsReportPayload }
}));

const LOG_PREFIX = '[events]';

function log(level, message, details) {
  try {
    const logger = console && typeof console[level] === 'function' ? console[level] : console.log;
    if (details !== undefined) {
      logger(`${LOG_PREFIX} ${message}`, details);
    } else {
      logger(`${LOG_PREFIX} ${message}`);
    }
  } catch (_) {
    /* noop */
  }
}

/**
 * @param {unknown} bus
 * @returns {bus is { emit: Function }}
 */
function hasEmitter(bus) {
  return !!bus && typeof bus === 'object' && typeof bus.emit === 'function';
}

/**
 * @param {unknown} bus
 * @param {string} event
 * @param {unknown} payload
 * @param {PayloadValidator | undefined} validator
 * @param {string} domain
 * @returns {boolean}
 */
function safeEmit(bus, event, payload, validator, domain) {
  if (!hasEmitter(bus)) {
    log('warn', `${domain} emit skipped for ${event}: invalid bus instance`);
    return false;
  }

  if (validator) {
    const { valid, errors, warnings } = validator(payload);
    for (const warning of warnings) {
      log('warn', `${domain} ${warning}`, { event, payload });
    }
    if (!valid) {
      for (const error of errors) {
        log('error', `${domain} ${error}`, { event, payload });
      }
      return false;
    }
  }

  try {
    bus.emit(event, payload);
    return true;
  } catch (error) {
    log('error', `${domain} failed to emit ${event}`, error);
    return false;
  }
}

function createEmitter(channels, domain) {
  const byEvent = new Map();
  for (const descriptor of Object.values(channels || {})) {
    if (descriptor && typeof descriptor.event === 'string') {
      byEvent.set(descriptor.event, descriptor);
    }
  }

  return function emit(bus, channel, payload) {
    let descriptor = null;
    let event = null;

    if (channel && typeof channel === 'object' && typeof channel.event === 'string') {
      descriptor = channel;
      event = channel.event;
    } else if (typeof channel === 'string') {
      event = channel;
      descriptor = byEvent.get(channel) || null;
    }

    if (!event) {
      log('warn', `${domain} emit skipped: invalid event`, { channel });
      return false;
    }

    if (!descriptor) {
      log('warn', `${domain} unknown event ${event}`);
    }

    const validator = descriptor && typeof descriptor.validate === 'function' ? descriptor.validate : undefined;
    return safeEmit(bus, event, payload, validator, domain);
  };
}

const emitHudEvent = createEmitter(HudChannels, 'HUD');
const emitAudioEvent = createEmitter(AudioChannels, 'AUDIO');
const emitGameEvent = createEmitter(GameChannels, 'GAME');
const emitDiagnosticsEvent = createEmitter(DiagnosticsChannels, 'DIAGNOSTICS');

export const hudBus = Object.freeze({
  /**
   * @param {unknown} bus
   * @param {HudOverlayPayload} payload
   * @returns {boolean}
   */
  showOverlay(bus, payload) {
    return emitHudEvent(bus, HudChannels.SHOW_OVERLAY, payload);
  },
  /**
   * @param {unknown} bus
   * @param {HudHideOverlayPayload} [payload]
   * @returns {boolean}
   */
  hideOverlay(bus, payload) {
    return emitHudEvent(bus, HudChannels.HIDE_OVERLAY, payload);
  },
  /**
   * @param {unknown} bus
   * @param {HudScoreUpdatePayload} payload
   * @returns {boolean}
   */
  updateScore(bus, payload) {
    return emitHudEvent(bus, HudChannels.SCORE_UPDATE, payload);
  },
  /**
   * @param {unknown} bus
   * @param {HudLevelUpdatePayload} payload
   * @returns {boolean}
   */
  updateLevel(bus, payload) {
    return emitHudEvent(bus, HudChannels.LEVEL_UPDATE, payload);
  },
  /**
   * @param {unknown} bus
   * @param {HudTickerTextPayload | string} payload
   * @returns {boolean}
   */
  updateTickerText(bus, payload) {
    return emitHudEvent(bus, HudChannels.TICKER_TEXT, payload);
  }
});

export const audioBus = Object.freeze({
  /**
   * @param {unknown} bus
   * @param {AudioCountdownPayload} [payload]
   * @returns {boolean}
   */
  prepareCountdown(bus, payload) {
    return emitAudioEvent(bus, AudioChannels.PREPARE_COUNTDOWN, payload);
  },
  /**
   * @param {unknown} bus
   * @param {unknown} [payload]
   * @returns {boolean}
   */
  resumeAndUnlock(bus, payload) {
    return emitAudioEvent(bus, AudioChannels.RESUME_AND_UNLOCK, payload);
  },
  /**
   * @param {unknown} bus
   * @param {unknown} [payload]
   * @returns {boolean}
   */
  cutAll(bus, payload) {
    return emitAudioEvent(bus, AudioChannels.CUT_ALL, payload);
  },
  /**
   * @param {unknown} bus
   * @param {unknown} [payload]
   * @returns {boolean}
   */
  startEngines(bus, payload) {
    return emitAudioEvent(bus, AudioChannels.START_ENGINES, payload);
  },
  /**
   * @param {unknown} bus
   * @param {unknown} [payload]
   * @returns {boolean}
   */
  killEngines(bus, payload) {
    return emitAudioEvent(bus, AudioChannels.KILL_ENGINES, payload);
  },
  /**
   * @param {unknown} bus
   * @param {AudioBgmResetPayload} [payload]
   * @returns {boolean}
   */
  resetAndPlayBgm(bus, payload) {
    return emitAudioEvent(bus, AudioChannels.BGM_RESET_PLAY, payload);
  },
  /**
   * @param {unknown} bus
   * @param {AudioMixPayload} payload
   * @returns {boolean}
   */
  setMix(bus, payload) {
    return emitAudioEvent(bus, AudioChannels.SET_MIX, payload);
  }
});

export const gameBus = Object.freeze({
  /**
   * @param {unknown} bus
   * @param {GameRoundLifecyclePayload} [payload]
   * @returns {boolean}
   */
  roundStart(bus, payload) {
    return emitGameEvent(bus, GameChannels.ROUND_START, payload);
  },
  /**
   * @param {unknown} bus
   * @param {GameRoundLifecyclePayload} [payload]
   * @returns {boolean}
   */
  roundPause(bus, payload) {
    return emitGameEvent(bus, GameChannels.ROUND_PAUSE, payload);
  },
  /**
   * @param {unknown} bus
   * @param {GameRoundLifecyclePayload} [payload]
   * @returns {boolean}
   */
  roundResume(bus, payload) {
    return emitGameEvent(bus, GameChannels.ROUND_RESUME, payload);
  },
  /**
   * @param {unknown} bus
   * @param {GameRoundLifecyclePayload} [payload]
   * @returns {boolean}
   */
  roundCrashed(bus, payload) {
    return emitGameEvent(bus, GameChannels.ROUND_CRASHED, payload);
  },
  /**
   * @param {unknown} bus
   * @param {GameRoundLifecyclePayload} [payload]
   * @returns {boolean}
   */
  roundNextLevel(bus, payload) {
    return emitGameEvent(bus, GameChannels.ROUND_NEXT_LEVEL, payload);
  }
});

export const diagnosticsBus = Object.freeze({
  /**
   * @param {unknown} bus
   * @param {Record<string, unknown>} payload
   * @returns {boolean}
   */
  report(bus, payload) {
    return emitDiagnosticsEvent(bus, DiagnosticsChannels.REPORT, payload);
  }
});

function collectChannelContracts(...groups) {
  const contracts = {};
  for (const group of groups) {
    if (!group || typeof group !== 'object') continue;
    for (const descriptor of Object.values(group)) {
      if (!descriptor || typeof descriptor !== 'object') continue;
      contracts[descriptor.event] = descriptor.validate
        ? { validate: descriptor.validate }
        : {};
    }
  }
  return contracts;
}

/** @type {Record<string, { validate?: PayloadValidator }>} */
export const PayloadContracts = Object.freeze(
  collectChannelContracts(
    HudChannels,
    AudioChannels,
    GameChannels,
    DiagnosticsChannels
  )
);

/** @type {Record<string, PayloadValidator>} */
export const PayloadValidators = Object.freeze(
  collectValidators(
    HudChannels,
    AudioChannels,
    GameChannels,
    DiagnosticsChannels
  )
);

export const HudEvents = Object.freeze(collectEvents(HudChannels));
export const AudioEvents = Object.freeze(collectEvents(AudioChannels));
export const GameEvents = Object.freeze(collectEvents(GameChannels));
export const DiagnosticsEvents = Object.freeze(collectEvents(DiagnosticsChannels));

export default {
  GameEvents,
  AudioEvents,
  HudEvents,
  DiagnosticsEvents,
  GameChannels,
  AudioChannels,
  HudChannels,
  DiagnosticsChannels
};
