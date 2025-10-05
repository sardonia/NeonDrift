import { executeWithDiagnostics } from '../utils/safe.js';

const DEFAULT_DIAGNOSTIC_LABEL = 'eventbus.validation';

function toValidator(entry) {
  if (typeof entry === 'function') {
    return entry;
  }
  if (entry && typeof entry === 'object') {
    if (typeof entry.validate === 'function') {
      return entry.validate;
    }
    if (typeof entry.validator === 'function') {
      return entry.validator;
    }
  }
  return null;
}

function normaliseValidators(validators) {
  const result = new Map();
  if (!validators) return result;
  const entries = validators instanceof Map
    ? Array.from(validators.entries())
    : Object.entries(validators);
  for (const [event, value] of entries) {
    if (!event) continue;
    const validator = toValidator(value);
    if (typeof validator === 'function') {
      result.set(event, validator);
    }
  }
  return result;
}

function normaliseValidationResult(event, rawResult) {
  if (rawResult === undefined) {
    return { valid: true, warnings: [], errors: [], raw: rawResult };
  }
  if (!rawResult || typeof rawResult !== 'object') {
    return {
      valid: false,
      warnings: [],
      errors: [`Validator for ${event} returned an invalid result`],
      raw: rawResult
    };
  }
  const warnings = Array.isArray(rawResult.warnings)
    ? rawResult.warnings.filter(Boolean).map(String)
    : [];
  const errors = Array.isArray(rawResult.errors)
    ? rawResult.errors.filter(Boolean).map(String)
    : [];
  if (rawResult.valid === false && errors.length === 0) {
    errors.push('Validator marked payload invalid');
  }
  const valid = rawResult.valid !== false && errors.length === 0;
  return { valid, warnings, errors, raw: rawResult };
}

function logConsole(level, message, details) {
  const logger = typeof console !== 'undefined' ? console : null;
  if (!logger) return;
  const fn = level === 'warn' ? logger.warn : logger.error;
  if (typeof fn !== 'function') return;
  try {
    if (details !== undefined) {
      fn(message, details);
    } else {
      fn(message);
    }
  } catch (_err) {
    // ignore logger failures
  }
}

function reportDiagnostics(label, event, payload, errors, warnings) {
  const meta = {
    event,
    payload,
    errors: Array.isArray(errors) ? errors.slice() : [],
    warnings: Array.isArray(warnings) ? warnings.slice() : []
  };
  executeWithDiagnostics(label, () => {
    const message = meta.errors.join('; ') || `Invalid payload for ${event}`;
    const error = new Error(message);
    error.name = 'EventBusValidationError';
    throw error;
  }, {
    meta,
    severity: 'error',
    fallback: false,
    rethrow: false,
    critical: false
  });
}

/**
 * EventBus — class-based emitter with wildcard support, listener leak warnings,
 * and optional payload validation contracts.
 */
export default class EventBus {
  constructor({ warnThreshold = 25, validators, diagnosticsLabel, onValidationIssue } = {}) {
    this._map = new Map();
    this._warnThreshold = warnThreshold;
    this._validators = new Map();
    this._diagnosticsLabel = typeof diagnosticsLabel === 'string' && diagnosticsLabel.trim()
      ? diagnosticsLabel.trim()
      : DEFAULT_DIAGNOSTIC_LABEL;
    this._onValidationIssue = typeof onValidationIssue === 'function' ? onValidationIssue : null;
    if (validators) {
      this.addValidators(validators);
    }
  }

  addValidators(validators, options = {}) {
    const incoming = normaliseValidators(validators);
    const overwrite = options && options.overwrite === false ? false : true;
    for (const [event, validator] of incoming.entries()) {
      if (!overwrite && this._validators.has(event)) {
        continue;
      }
      this._validators.set(event, validator);
    }
    return this;
  }

  setValidator(event, validator) {
    if (!event) return this;
    if (typeof validator === 'function') {
      this._validators.set(event, validator);
    } else if (validator === null || validator === undefined) {
      this._validators.delete(event);
    }
    return this;
  }

  getValidator(event) {
    return this._validators.get(event) || null;
  }

  clearValidator(event) {
    if (!event) {
      this._validators.clear();
    } else {
      this._validators.delete(event);
    }
    return this;
  }

  on(evt, fn) {
    if (!evt || typeof fn !== 'function') return () => {};
    let arr = this._map.get(evt);
    if (!arr) {
      arr = [];
      this._map.set(evt, arr);
    }
    arr.push(fn);
    if (arr.length === this._warnThreshold + 1) {
      logConsole('warn', `[Bus] Listener leak? ${evt}`, { listeners: arr.length });
    }
    return () => this.off(evt, fn);
  }

  once(evt, fn) {
    if (!evt || typeof fn !== 'function') return () => {};
    let offFn = () => {};
    const wrapper = (payload) => {
      try { fn(payload); }
      finally { try { offFn(); } catch {} }
    };
    offFn = this.on(evt, wrapper);
    return offFn;
  }

  off(evt, fn) {
    const arr = this._map.get(evt);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx >= 0) {
      arr.splice(idx, 1);
      if (arr.length === 0) this._map.delete(evt);
    }
  }

  emit(evt, payload) {
    if (!evt) {
      return false;
    }

    const validator = this._validators.get(evt);
    if (validator) {
      let validation;
      try {
        validation = normaliseValidationResult(evt, validator(payload));
      } catch (error) {
        this._notifyValidation('error', evt, payload, {
          valid: false,
          warnings: [],
          errors: [`Validator for ${evt} threw: ${error && error.message ? error.message : String(error)}`],
          raw: error
        });
        return false;
      }

      if (validation.warnings.length) {
        this._notifyValidation('warn', evt, payload, validation);
      }
      if (!validation.valid) {
        this._notifyValidation('error', evt, payload, validation);
        return false;
      }
    }

    this._invokeListeners(evt, payload);
    return true;
  }

  _invokeListeners(evt, payload) {
    const arr = this._map.get(evt);
    if (arr) {
      for (const fn of arr.slice()) {
        try { fn(payload); }
        catch (e) { logConsole('error', `[Bus] handler error on ${evt}`, e); }
      }
    }
    const wildcard = this._map.get('*');
    if (wildcard) {
      for (const fn of wildcard.slice()) {
        try { fn({ evt, payload }); }
        catch (e) { logConsole('error', '[Bus:*] handler error', e); }
      }
    }
  }

  _notifyValidation(level, event, payload, validation) {
    const messages = level === 'warn'
      ? validation.warnings
      : (validation.errors && validation.errors.length ? validation.errors : ['Payload failed validation']);
    if (!messages || messages.length === 0) {
      return;
    }

    if (this._onValidationIssue) {
      try {
        this._onValidationIssue({
          level,
          event,
          payload,
          messages: messages.slice(),
          result: validation.raw ?? validation
        });
      } catch (_err) {
        // ignore reporter failures
      }
    }

    const prefix = level === 'warn' ? '[Bus] validation warning for' : '[Bus] validation error for';
    for (const message of messages) {
      logConsole(level === 'warn' ? 'warn' : 'error', `${prefix} ${event}: ${message}`, { event, payload });
    }

    if (level === 'error' && this._diagnosticsLabel) {
      reportDiagnostics(`${this._diagnosticsLabel}.${event}`, event, payload, messages, validation.warnings);
    }
  }
}
