// @ts-check

/**
 * @callback PayloadValidator
 * @param {unknown} payload
 * @returns {{ valid?: boolean, warnings?: string[] | undefined, errors?: string[] | undefined }}
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
 * @param {Record<string, string | { event?: string, name?: string, validate?: PayloadValidator | null | undefined, validator?: PayloadValidator | null | undefined } | [string, PayloadValidator | null | undefined]>} definitions
 * @returns {Record<string, ChannelDefinition>}
 */
export function createChannels(definitions) {
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
export function collectValidators(...groups) {
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
export function collectEvents(...groups) {
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

export default {
  createChannels,
  collectValidators,
  collectEvents
};
