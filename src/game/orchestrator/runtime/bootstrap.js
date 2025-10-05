import { getService, requireService, hasService, TOKENS } from '../../services/index.js';
import { ensureCoreServices, initializeUiSubscriptions } from '../startup.js';
import { registerDefaultRuntimeServices } from '../../config/defaultServices.js';

let servicesValidated = false;
let runtimeDefaultsAttempted = false;

export function ensureDefaultRuntimeServices() {
  const requiredTokens = [TOKENS.BUS, TOKENS.CONSTANTS, TOKENS.DOM, TOKENS.AUDIO];
  const needsRegistration = requiredTokens.some((token) => {
    try {
      return !hasService(token);
    } catch (_err) {
      return true;
    }
  });

  if (!needsRegistration && runtimeDefaultsAttempted) {
    return;
  }

  runtimeDefaultsAttempted = true;

  try {
    if (typeof registerDefaultRuntimeServices === 'function') {
      registerDefaultRuntimeServices(undefined, { force: false });
    }
  } catch (error) {
    try {
      console.error('[orchestrator] Failed to ensure default runtime services', error);
    } catch (_) {}
  }
}

export function ensureServicesReady() {
  if (servicesValidated) {
    return;
  }

  ensureDefaultRuntimeServices();
  ensureCoreServices({ logger: typeof console !== 'undefined' ? console : null });

  const busSvc = typeof getService === 'function' ? getService(TOKENS.BUS) : null;
  if (!busSvc || typeof busSvc.emit !== 'function') {
    throw new Error('[orchestrator] Bus service must expose an emit() function');
  }

  const domSvc = typeof getService === 'function' ? getService(TOKENS.DOM) : null;
  if (!domSvc || typeof domSvc !== 'object') {
    throw new Error('[orchestrator] DOM service must be an object');
  }

  const audioSvc = typeof getService === 'function' ? getService(TOKENS.AUDIO) : null;
  if (!audioSvc || typeof audioSvc !== 'object') {
    throw new Error('[orchestrator] Audio service must be an object');
  }

  const constantsSvc = typeof getService === 'function' ? getService(TOKENS.CONSTANTS) : null;
  if (!constantsSvc || typeof constantsSvc !== 'object') {
    throw new Error('[orchestrator] Constants service must be an object');
  }

  initializeUiSubscriptions();
  servicesValidated = true;
}

export function requireOrchestratorService(token, label = token) {
  ensureServicesReady();
  return requireService(token, () => new Error(`[orchestrator] Missing required service: ${String(label)}`));
}

export function getOptionalService(token) {
  ensureServicesReady();
  return typeof getService === 'function' ? getService(token) : undefined;
}

export function resetBootstrapState() {
  servicesValidated = false;
  runtimeDefaultsAttempted = false;
}

export default {
  ensureDefaultRuntimeServices,
  ensureServicesReady,
  requireOrchestratorService,
  getOptionalService,
  resetBootstrapState
};
