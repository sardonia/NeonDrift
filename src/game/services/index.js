import TOKENS from './tokens.js';
export { TOKENS };
export * from './tokens.js';

export const LIFETIMES = Object.freeze({
  SINGLETON: 'singleton',
  FACTORY: 'factory',
  SCOPED: 'scoped'
});

const _registry = new Map();
const _scopeCache = new WeakMap();
const _scopes = new Set();

function createScopeInternal(parent) {
  const scope = { parent: parent ?? null };
  _scopeCache.set(scope, new Map());
  _scopes.add(scope);
  return scope;
}

const _rootScope = createScopeInternal(null);

function isRecognisedScope(scope) {
  if (!scope) return false;
  if (_scopeCache.has(scope)) return true;
  if (typeof scope === 'object' && 'scope' in scope && scope.scope) {
    return isRecognisedScope(scope.scope);
  }
  return false;
}

function ensureScope(scopeOrOptions) {
  if (!scopeOrOptions) {
    return _rootScope;
  }
  if (_scopeCache.has(scopeOrOptions)) {
    return scopeOrOptions;
  }
  if (typeof scopeOrOptions === 'object' && scopeOrOptions !== null) {
    if ('scope' in scopeOrOptions) {
      return ensureScope(scopeOrOptions.scope);
    }
  }
  return _rootScope;
}

function getScopeCache(scope) {
  const resolved = ensureScope(scope);
  return _scopeCache.get(resolved);
}

function normaliseLifetime(input) {
  if (input === LIFETIMES.SINGLETON || input === LIFETIMES.FACTORY || input === LIFETIMES.SCOPED) {
    return input;
  }
  if (typeof input === 'string') {
    const value = input.toLowerCase();
    if (value === LIFETIMES.FACTORY) return LIFETIMES.FACTORY;
    if (value === LIFETIMES.SCOPED) return LIFETIMES.SCOPED;
  }
  return LIFETIMES.SINGLETON;
}

function formatToken(token) {
  if (typeof token === 'symbol') {
    return token.description ? `Symbol(${token.description})` : token.toString();
  }
  if (typeof token === 'object' && token && typeof token.description === 'string') {
    return token.description;
  }
  return String(token);
}

function safeDispose(value) {
  if (!value || typeof value !== 'object') {
    return;
  }
  try {
    if (typeof value.dispose === 'function') {
      value.dispose();
    }
  } catch (error) {
    try { console.error('[services] dispose error for', value, error); } catch (_) {}
  }
}

function parseRequireArgs(arg1, arg2) {
  const options = {};
  if (typeof arg1 === 'function') {
    options.errorFactory = arg1;
    if (arg2 && typeof arg2 === 'object') {
      Object.assign(options, arg2);
    } else if (arg2 !== undefined) {
      options.scope = arg2;
    }
    return options;
  }
  if (arg1 && typeof arg1 === 'object') {
    Object.assign(options, arg1);
    if (arg2 && typeof arg2 === 'object') {
      Object.assign(options, arg2);
    } else if (arg2 !== undefined) {
      options.scope = arg2;
    }
    return options;
  }
  if (arg1 !== undefined) {
    options.scope = arg1;
    if (arg2 && typeof arg2 === 'object') {
      Object.assign(options, arg2);
    }
    return options;
  }
  if (arg2 && typeof arg2 === 'object') {
    Object.assign(options, arg2);
  }
  return options;
}

function callFactory(record, scope) {
  const effectiveScope = ensureScope(scope);
  const context = {
    getService: (token, scopeOrOptions) => {
      const targetScope = scopeOrOptions === undefined ? effectiveScope : scopeOrOptions;
      return getService(token, targetScope);
    },
    requireService: (token, arg1, arg2) => {
      const options = parseRequireArgs(arg1, arg2);
      if (options.scope === undefined) {
        options.scope = effectiveScope;
      }
      return requireService(token, options);
    },
    hasService,
    createScope
  };
  try {
    return record.factory(context);
  } catch (error) {
    try { console.error('[services] factory error for', formatToken(record.token), error); } catch (_) {}
    throw error;
  }
}

function clearScopedCache(scope, token) {
  const cache = getScopeCache(scope);
  if (!cache) return;
  if (token) {
    if (cache.has(token)) {
      safeDispose(cache.get(token));
      cache.delete(token);
    }
    return;
  }
  for (const [cachedToken, instance] of cache.entries()) {
    const rec = _registry.get(cachedToken);
    if (!rec || rec.kind !== 'factory' || rec.lifetime !== LIFETIMES.SCOPED) continue;
    safeDispose(instance);
    cache.delete(cachedToken);
  }
}

export function registerInstance(token, instance, opts = {}) {
  const { force = false } = opts;
  if (!token) return;
  if (!force) {
    const existing = _registry.get(token);
    if (existing && existing.kind === 'instance' && existing.value === instance) {
      return;
    }
  }
  if (force) {
    disposeService(token, { remove: true });
  }
  _registry.set(token, {
    kind: 'instance',
    lifetime: LIFETIMES.SINGLETON,
    value: instance,
    token
  });
}

export function registerFactory(token, factoryFn, opts = {}) {
  const { force = false, lifetime = LIFETIMES.SINGLETON } = opts;
  if (!token || typeof factoryFn !== 'function') return;
  const normalisedLifetime = normaliseLifetime(lifetime);
  if (!force) {
    const existing = _registry.get(token);
    if (existing && existing.kind === 'factory' && existing.factory === factoryFn && existing.lifetime === normalisedLifetime) {
      return;
    }
  }
  if (force) {
    disposeService(token, { remove: true });
  }
  _registry.set(token, {
    kind: 'factory',
    factory: factoryFn,
    lifetime: normalisedLifetime,
    cache: undefined,
    hasCache: false,
    token
  });
}

export function register(token, impl, opts = {}) {
  return registerInstance(token, impl, opts);
}

export function getService(token, scopeOrOptions) {
  const record = _registry.get(token);
  if (!record) return undefined;
  if (record.kind === 'instance') {
    return record.value;
  }
  if (record.lifetime === LIFETIMES.FACTORY) {
    return callFactory(record, scopeOrOptions);
  }
  if (record.lifetime === LIFETIMES.SCOPED) {
    const scope = ensureScope(scopeOrOptions);
    const cache = getScopeCache(scope);
    if (cache.has(token)) {
      return cache.get(token);
    }
    const created = callFactory(record, scope);
    cache.set(token, created);
    return created;
  }
  if (record.hasCache) {
    return record.cache;
  }
  const created = callFactory(record, _rootScope);
  record.cache = created;
  record.hasCache = true;
  return created;
}

export function hasService(token) {
  return _registry.has(token);
}

export function requireService(token, arg1, arg2) {
  const options = parseRequireArgs(arg1, arg2);
  const scope = isRecognisedScope(options.scope) ? options.scope : ensureScope(options.scope);
  const service = getService(token, scope);
  if (service !== undefined && service !== null) {
    return service;
  }
  const errorFactory = typeof options.errorFactory === 'function' ? options.errorFactory : undefined;
  const error = errorFactory
    ? errorFactory(token)
    : new Error(`[services] Missing required service: ${formatToken(token)}`);
  throw error;
}

export function disposeService(token, options = {}) {
  const record = _registry.get(token);
  if (!record) return;
  const remove = options && options.remove === true;
  if (record.kind === 'instance') {
    safeDispose(record.value);
    _registry.delete(token);
    return;
  }
  if (record.lifetime === LIFETIMES.SINGLETON) {
    if (record.hasCache) {
      safeDispose(record.cache);
      record.cache = undefined;
      record.hasCache = false;
    }
    if (remove) {
      _registry.delete(token);
    }
    return;
  }
  if (record.lifetime === LIFETIMES.SCOPED) {
    const scope = options && options.scope ? options.scope : null;
    if (scope) {
      clearScopedCache(scope, token);
    } else {
      for (const scoped of _scopes) {
        clearScopedCache(scoped, token);
      }
    }
    if (remove) {
      _registry.delete(token);
    }
    return;
  }
  if (remove) {
    _registry.delete(token);
  }
}

export function createScope(parentScope) {
  const parent = isRecognisedScope(parentScope) ? ensureScope(parentScope) : _rootScope;
  return createScopeInternal(parent);
}

/**
 * @typedef {Object} ScopeContext
 * @property {any} scope - The underlying scope token used by the container cache.
 * @property {(token: any, scopeOrOptions?: any) => any} get - Resolve a service within the context scope.
 * @property {(token: any, scopeOrOptions?: any) => any} optional - Resolve a service or return undefined when missing.
 * @property {(token: any, errorFactoryOrOptions?: any, maybeOptions?: any) => any} require - Require a service within the scope.
 * @property {() => void} dispose - Dispose the scope and all scoped services cached beneath it.
 * @property {(fn: (context: ScopeContext) => any) => any} run - Execute a function with the context and return its result.
 */

/**
 * Create a managed scope context that exposes helper methods for resolving
 * services tied to that scope. This is especially useful when orchestrators or
 * controllers need to provision short-lived graphs (e.g. per-round HUD
 * adapters) without manually wiring `createScope`/`disposeScope`.
 *
 * @param {Object} [options]
 * @param {any} [options.parent] - Optional parent scope to inherit cached services from.
 * @param {any} [options.scope] - Alias for parent scope; primarily for ergonomic call-sites.
 * @param {(details: { scope: any }) => void} [options.onDispose] - Invoked once when the context is disposed.
 * @returns {ScopeContext}
 */
export function createScopeContext(options = {}) {
  const parent = options && (options.scope || options.parent);
  const scope = createScope(parent);
  let disposed = false;

  const mergeScopeIntoOptions = (opts) => {
    if (!opts || typeof opts !== 'object') {
      return { scope };
    }
    if (Object.prototype.hasOwnProperty.call(opts, 'scope')) {
      return opts;
    }
    return { ...opts, scope };
  };

  const context = {
    scope,
    get(token, scopeOrOptions) {
      const targetScope = scopeOrOptions !== undefined ? scopeOrOptions : scope;
      try {
        return getService(token, targetScope);
      } catch (_err) {
        return undefined;
      }
    },
    optional(token, scopeOrOptions) {
      return context.get(token, scopeOrOptions);
    },
    require(token, errorFactoryOrOptions, maybeOptions) {
      if (typeof errorFactoryOrOptions === 'function') {
        return requireService(token, errorFactoryOrOptions, mergeScopeIntoOptions(maybeOptions));
      }
      if (errorFactoryOrOptions && typeof errorFactoryOrOptions === 'object') {
        const merged = mergeScopeIntoOptions(errorFactoryOrOptions);
        if (maybeOptions !== undefined) {
          return requireService(token, merged, mergeScopeIntoOptions(maybeOptions));
        }
        return requireService(token, merged);
      }
      if (maybeOptions && typeof maybeOptions === 'object') {
        return requireService(token, errorFactoryOrOptions, mergeScopeIntoOptions(maybeOptions));
      }
      if (errorFactoryOrOptions !== undefined) {
        return requireService(token, errorFactoryOrOptions, mergeScopeIntoOptions());
      }
      return requireService(token, mergeScopeIntoOptions());
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      try {
        disposeScope(scope);
      } finally {
        if (typeof options.onDispose === 'function') {
          try {
            options.onDispose({ scope });
          } catch (_err) {}
        }
      }
    },
    run(fn) {
      if (typeof fn !== 'function') {
        return undefined;
      }
      return fn(context);
    }
  };

  return context;
}

/**
 * Execute a callback within a temporary scope context. The scope is disposed
 * automatically when the callback completes (and after any returned promise
 * settles) unless {@link options.autoDispose} is explicitly set to `false`.
 *
 * @param {(context: ScopeContext) => any} callback
 * @param {Object} [options]
 * @param {boolean} [options.autoDispose=true]
 * @param {any} [options.parent]
 * @param {(details: { scope: any }) => void} [options.onDispose]
 * @returns {any}
 */
export function withScope(callback, options = {}) {
  if (typeof callback !== 'function') {
    return undefined;
  }
  const { autoDispose = true, ...rest } = options || {};
  const context = createScopeContext(rest);

  const disposeIfNeeded = () => {
    if (autoDispose !== false) {
      try {
        context.dispose();
      } catch (_err) {}
    }
  };

  try {
    const result = callback(context);
    if (result && typeof result.then === 'function') {
      return result.finally(disposeIfNeeded);
    }
    disposeIfNeeded();
    return result;
  } catch (error) {
    disposeIfNeeded();
    throw error;
  }
}

export function disposeScope(scope) {
  if (!scope) {
    clearScopedCache(_rootScope);
    const rootCache = _scopeCache.get(_rootScope);
    if (rootCache) rootCache.clear();
    return;
  }
  if (!_scopeCache.has(scope)) {
    return;
  }
  clearScopedCache(scope);
  if (scope === _rootScope) {
    const cache = _scopeCache.get(scope);
    if (cache) cache.clear();
    return;
  }
  _scopeCache.delete(scope);
  _scopes.delete(scope);
}

export function resetServices() {
  for (const token of Array.from(_registry.keys())) {
    disposeService(token, { remove: true });
  }
  _registry.clear();
  for (const scope of Array.from(_scopes)) {
    disposeScope(scope);
  }
  if (!_scopeCache.has(_rootScope)) {
    _scopeCache.set(_rootScope, new Map());
  }
  _scopes.clear();
  _scopes.add(_rootScope);
}

export function list() {
  const out = {};
  for (const [token, record] of _registry.entries()) {
    const key = formatToken(token);
    if (record.kind === 'instance') {
      out[key] = record.value;
    } else if (record.lifetime === LIFETIMES.SINGLETON && record.hasCache) {
      out[key] = record.cache;
    } else {
      out[key] = record.factory;
    }
  }
  return out;
}

export default {
  TOKENS,
  LIFETIMES,
  register,
  registerInstance,
  registerFactory,
  getService,
  hasService,
  requireService,
  disposeService,
  createScope,
  disposeScope,
  createScopeContext,
  withScope,
  resetServices,
  list
};
