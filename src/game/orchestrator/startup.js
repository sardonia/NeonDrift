import { hasService, getService, TOKENS } from '../services/index.js';
import { initUiSubscriptions } from '../ui/subscriptions.js';
import {
  createRuntimeServiceManifest,
  applyServiceManifest,
  DEFAULT_REQUIRED_SERVICE_TOKENS
} from '../config/serviceManifest.js';

const RUNTIME_MANIFEST = createRuntimeServiceManifest();

export function registerDefaultServices({ constants, bus, dom } = {}) {
  const tokens = [];
  if (constants !== undefined && constants !== null) tokens.push(TOKENS.CONSTANTS);
  if (bus !== undefined && bus !== null) tokens.push(TOKENS.BUS);
  if (dom !== undefined && dom !== null) tokens.push(TOKENS.DOM);

  if (tokens.length === 0) {
    return {};
  }

  return applyServiceManifest(RUNTIME_MANIFEST, {
    config: { constants, bus, dom },
    force: false,
    filter: tokens
  });
}

const DEFAULT_REQUIRED_SERVICES = DEFAULT_REQUIRED_SERVICE_TOKENS;

export function ensureCoreServices({
  required = DEFAULT_REQUIRED_SERVICES,
  logger = typeof console !== 'undefined' ? console : null,
  validators
} = {}) {
  const missing = required.filter((serviceName) => !hasService(serviceName));
  const shapeValidators = validators || {
    [TOKENS.BUS]: (svc) => svc && typeof svc.emit === 'function',
    [TOKENS.AUDIO]: (svc) => svc && typeof svc === 'object',
    [TOKENS.CONSTANTS]: (svc) => svc && typeof svc === 'object',
    [TOKENS.DOM]: (svc) => svc && typeof svc === 'object'
  };
  const invalid = required
    .filter((serviceName) => !missing.includes(serviceName))
    .filter((serviceName) => {
      const validator = shapeValidators && shapeValidators[serviceName];
      if (typeof validator !== 'function') {
        return false;
      }
      try {
        const service = getService(serviceName);
        return !validator(service);
      } catch (_err) {
        return true;
      }
    });

  if (missing.length === 0 && invalid.length === 0) {
    return;
  }
  const parts = [];
  const formatToken = (token) => {
    if (typeof token === 'symbol') {
      return token.description || token.toString();
    }
    if (token && typeof token === 'object' && 'description' in token) {
      return token.description;
    }
    return String(token);
  };
  if (missing.length > 0) {
    parts.push(`Missing required services: ${missing.map(formatToken).join(', ')}`);
  }
  if (invalid.length > 0) {
    parts.push(`Invalid services: ${invalid.map(formatToken).join(', ')}`);
  }
  const error = new Error(`[orchestrator] ${parts.join('; ')}`);
  if (logger && typeof logger.error === 'function') {
    logger.error(String(error));
  }
  throw error;
}

export function initializeUiSubscriptions(init = initUiSubscriptions) {
  if (typeof init === 'function') {
    init();
  }
}

export function bootstrapServices({ constants, bus, required, logger } = {}) {
  registerDefaultServices({ constants, bus });
  ensureCoreServices({ required, logger });
  initializeUiSubscriptions();
}

export default {
  registerDefaultServices,
  ensureCoreServices,
  initializeUiSubscriptions,
  bootstrapServices
};
