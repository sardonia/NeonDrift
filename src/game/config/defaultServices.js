import { hasService } from '../services/index.js';
import {
  createRuntimeServiceManifest,
  applyServiceManifest
} from './serviceManifest.js';

export function registerDefaultRuntimeServices(config = {}, options = {}) {
  const { force = true, manifest, overrides, filter } = options || {};
  const manifestEntries = Array.isArray(manifest)
    ? manifest.map((entry) => ({ ...entry }))
    : createRuntimeServiceManifest(overrides);

  return applyServiceManifest(manifestEntries, {
    config,
    force,
    filter
  });
}

export function isRuntimeServiceRegistered(token) {
  return hasService(token);
}

export default {
  registerDefaultRuntimeServices,
  isRuntimeServiceRegistered
};
