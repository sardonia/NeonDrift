import { diagnosticsBus } from '../core/events.js';
import { getService, TOKENS } from '../services/index.js';

const LOG_CAP = 200;
const _logs = [];
let _reporter = null;

function normaliseLabel(label) {
  if (typeof label === 'string' && label.trim()) {
    return label.trim();
  }
  if (Array.isArray(label)) {
    return label.filter(Boolean).join('.');
  }
  return 'diagnostics.unknown';
}

function serialiseError(error, depth = 0) {
  if (error === undefined || error === null) {
    return { name: 'Error', message: 'Unknown error' };
  }
  if (typeof error === 'string') {
    return { name: 'Error', message: error };
  }
  if (typeof error !== 'object') {
    return { name: 'Error', message: String(error) };
  }

  const message = typeof error.message === 'string'
    ? error.message
    : String(error);

  const result = {
    name: typeof error.name === 'string' && error.name ? error.name : (error.constructor && error.constructor.name) || 'Error',
    message
  };

  if (typeof error.stack === 'string' && error.stack) {
    result.stack = error.stack;
  }

  if (typeof error.code !== 'undefined') {
    result.code = error.code;
  }

  if ('cause' in error && error.cause && depth < 3) {
    result.cause = serialiseError(error.cause, depth + 1);
  }

  return result;
}

function pushLog(entry) {
  _logs.push(entry);
  if (_logs.length > LOG_CAP) {
    _logs.splice(0, _logs.length - LOG_CAP);
  }
}

function resolveBus(explicitBus) {
  if (explicitBus && typeof explicitBus === 'object' && typeof explicitBus.emit === 'function') {
    return explicitBus;
  }
  try {
    const serviceBus = typeof getService === 'function' ? getService(TOKENS.BUS) : null;
    if (serviceBus && typeof serviceBus.emit === 'function') {
      return serviceBus;
    }
  } catch (_err) {
    // best-effort only
  }
  return null;
}

function resolveFallback(fallback, error) {
  if (typeof fallback === 'function') {
    try {
      return fallback(error);
    } catch (_err) {
      return undefined;
    }
  }
  return fallback;
}

function shouldRethrow(error, options) {
  if (!error) {
    return false;
  }
  if (options && (options.critical || options.rethrow)) {
    return true;
  }
  if (typeof error === 'object' && (error.critical || error.isCritical === true || error.fatal === true)) {
    return true;
  }
  return false;
}

function emitDiagnostics(payload, entry, options) {
  let handled = false;
  const { reporter, bus } = options || {};
  const reporterFn = typeof reporter === 'function' ? reporter : _reporter;
  if (reporterFn) {
    try {
      reporterFn(payload, entry);
      handled = true;
    } catch (reportError) {
      pushLog({
        label: `${entry.label}:reporter`,
        error: reportError,
        context: { stage: 'reporter', payload },
        severity: 'error',
        timestamp: Date.now()
      });
    }
  }

  if (!handled) {
    const resolvedBus = resolveBus(bus);
    if (resolvedBus) {
      diagnosticsBus.report(resolvedBus, payload);
    }
  }
}

export function setDiagnosticsReporter(fn) {
  _reporter = typeof fn === 'function' ? fn : null;
}

export function clearDiagnosticsLog() {
  _logs.splice(0, _logs.length);
}

export function getDiagnosticsLog() {
  return _logs.slice();
}

export function executeWithDiagnostics(label, fn, options = {}) {
  const {
    context,
    meta,
    logger = typeof console !== 'undefined' ? console : null,
    severity,
    fallback,
    bus,
    reporter,
    onReport,
    critical,
    rethrow
  } = options;

  const resolvedLabel = normaliseLabel(label);

  try {
    return fn();
  } catch (error) {
    const level = typeof severity === 'string' && severity
      ? severity
      : (critical || shouldRethrow(error, { critical: false, rethrow: false }))
        ? 'critical'
        : 'error';

    const entry = {
      label: resolvedLabel,
      error,
      context,
      meta,
      severity: level,
      timestamp: Date.now()
    };

    pushLog(entry);

    const errorInfo = serialiseError(error);

    if (logger && typeof logger.error === 'function') {
      try {
        logger.error(`[diagnostics] ${resolvedLabel}`, {
          error: errorInfo,
          context,
          meta,
          severity: level
        });
      } catch (_logErr) {
        // ignore logger failures
      }
    }

    const payload = {
      label: resolvedLabel,
      message: errorInfo.message,
      error: errorInfo,
      context: context ?? null,
      meta: meta ?? null,
      severity: level,
      timestamp: entry.timestamp
    };

    emitDiagnostics(payload, entry, { reporter, bus });

    if (typeof onReport === 'function') {
      try {
        onReport(payload, entry);
      } catch (_notifyErr) {
        // swallow listener failures to avoid recursive loops
      }
    }

    if (shouldRethrow(error, { critical: critical === true, rethrow: rethrow === true })) {
      throw error;
    }

    return resolveFallback(fallback, error);
  }
}

export default {
  executeWithDiagnostics,
  getDiagnosticsLog,
  clearDiagnosticsLog,
  setDiagnosticsReporter
};
