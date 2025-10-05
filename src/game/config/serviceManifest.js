import {
  registerInstance,
  registerFactory,
  getService,
  hasService,
  TOKENS,
  LIFETIMES
} from '../services/index.js';
import * as Constants from '../Constants.js';
import { bus as defaultBus } from '../core/bus-instance.js';
import { el as defaultDom } from '../dom.js';
import { createUIController } from '../orchestrator/controllers/uiController.js';
// Replace the complex HUD facade with a simplified DOM‑based
// implementation.  The simple HUD drives the ticker using
// CSS animations and avoids offscreen canvas and workers.
import { createHudService } from '../ui/hud/simpleHud.js';
import { initInputController } from '../orchestrator/controllers/keyboardController.js';
import * as loopController from '../orchestrator/controllers/loopController.js';
import AudioController from '../orchestrator/controllers/AudioController.class.js';
import AudioFX from '../../audio/AudioFX.js';
import tronSfx from '../../audio/SFXCrashPro.js';

const DEFAULT_AUDIO_DEPS = (() => {
  try {
    return { AudioFX, tronSfx };
  } catch (_err) {
    return null;
  }
})();

function createFallbackAudioController() {
  const noop = () => undefined;
  const noopEngine = () => ({ setActive: noop, stop: noop });
  return {
    setBus: noop,
    init: noop,
    resume: noop,
    restoreMaster: noop,
    setMuted: noop,
    resetVolumes: noop,
    cutAll: noop,
    killEngines: noop,
    mkEngine: noopEngine,
    turnChirp: noop,
    powerupSplash: noop,
    crash: noop,
    unlockSfx: noop,
    setSfxVolume: noop,
    setMix: noop,
    startEngines: () => ({ player: noopEngine(), enemy: noopEngine() }),
    stopEngines: noop,
    resumeAndUnlock: noop,
    prepareCountdown: noop,
    prepareGameplay: noop,
    resetBgm: noop,
    playBgm: noop,
    pauseBgm: noop
  };
}

function resolveLoopService(config) {
  if (config.loop) {
    return config.loop;
  }
  return {
    start: loopController.start,
    pause: loopController.pause,
    resume: loopController.resume,
    stop: loopController.stop
  };
}

function resolveInputService(config) {
  if (config.input) {
    return config.input;
  }
  return {
    initInput: initInputController
  };
}

function resolveAudioService({ config, getResolved }) {
  if (config.audio) {
    return config.audio;
  }

  const bus = getResolved(TOKENS.BUS);
  const audioDeps = config.audioDeps ?? DEFAULT_AUDIO_DEPS;

  if (audioDeps && audioDeps.AudioFX && audioDeps.tronSfx) {
    const controller = new AudioController({
      bus,
      AudioFX: audioDeps.AudioFX,
      tronSfx: audioDeps.tronSfx
    });
    if (typeof controller.setBus === 'function' && bus) {
      try { controller.setBus(bus); } catch (_err) {}
    }
    if (typeof controller.init === 'function') {
      try {
        controller.init({
          AudioFX: audioDeps.AudioFX,
          tronSfx: audioDeps.tronSfx
        });
      } catch (_err) {}
    }
    return controller;
  }

  const fallback = createFallbackAudioController();
  if (typeof fallback.setBus === 'function' && bus) {
    try { fallback.setBus(bus); } catch (_err) {}
  }
  return fallback;
}

const BASE_RUNTIME_MANIFEST = [
  {
    token: TOKENS.BUS,
    description: 'Game event bus service.',
    exportKey: 'bus',
    required: true,
    resolve: ({ config }) => config.bus ?? defaultBus
  },
  {
    token: TOKENS.CONSTANTS,
    description: 'Gameplay constants available to flows and adapters.',
    exportKey: 'constants',
    required: true,
    resolve: ({ config }) => config.constants ?? Constants
  },
  {
    token: TOKENS.DOM,
    description: 'DOM service containing key runtime elements.',
    exportKey: 'dom',
    required: true,
    resolve: ({ config }) => config.dom ?? defaultDom
  },
  {
    token: TOKENS.LOOP,
    description: 'Main loop controller used by orchestrator flows.',
    exportKey: 'loop',
    resolve: ({ config }) => resolveLoopService(config)
  },
  {
    token: TOKENS.INPUT,
    description: 'Input controller wrapper.',
    exportKey: 'input',
    resolve: ({ config }) => resolveInputService(config)
  },
  {
    token: TOKENS.UI,
    description: 'HUD/UI controller instance.',
    exportKey: 'ui',
    resolve: ({ config }) => config.ui ?? createUIController()
  },
  {
    token: TOKENS.HUD,
    description: 'Heads-up-display facade service.',
    exportKey: 'hud',
    dependsOn: [
      TOKENS.DOM,
      TOKENS.BUS,
      TOKENS.AUDIO,
      TOKENS.DEBUG_STATE,
      TOKENS.THEME,
      TOKENS.RNG,
      TOKENS.COLLISIONS
    ],
    lifetime: LIFETIMES.SCOPED,
    resolve: ({ config, getResolved }) => createHudService({
      dom: config.dom ?? getResolved(TOKENS.DOM),
      bus: config.bus ?? getResolved(TOKENS.BUS),
      audio: config.audio ?? getResolved(TOKENS.AUDIO),
      debugState: config.debugState ?? getResolved(TOKENS.DEBUG_STATE),
      theme: config.theme ?? getResolved(TOKENS.THEME),
      rng: config.rng ?? getResolved(TOKENS.RNG),
      collisions: config.collisions ?? getResolved(TOKENS.COLLISIONS)
      ,
      /*
       * Use the full ticker renderer rather than the simple fallback.  The full
       * renderer supports the info panel (score, level and power‑ups), the
       * scrolling marquee and the centred pause banner.  A previous revision
       * forced useSimpleTicker: true which disabled these features by
       * allocating zero width to the info panel and omitting the pause
       * controls.  Restoring the default behaviour here allows the game to
       * render the HUD and ticker correctly on page load while still
       * benefiting from the updated fonts and power‑up icons defined
       * elsewhere.  Should the environment not support offscreen canvas or
       * workers, the HUD will gracefully fall back to the built‑in DOM
       * implementation.
       */
      useSimpleTicker: false
    })
  },
  {
    token: TOKENS.AUDIO,
    description: 'Audio controller for runtime playback.',
    exportKey: 'audio',
    required: true,
    dependsOn: [TOKENS.BUS],
    resolve: (context) => resolveAudioService(context)
  }
];

export const DEFAULT_RUNTIME_SERVICE_MANIFEST = Object.freeze(
  BASE_RUNTIME_MANIFEST.map((entry) => Object.freeze({ ...entry }))
);

export function createRuntimeServiceManifest(overrides = []) {
  const manifest = DEFAULT_RUNTIME_SERVICE_MANIFEST.map((entry) => ({ ...entry }));
  if (!Array.isArray(overrides) || overrides.length === 0) {
    return manifest;
  }
  const indexByToken = new Map();
  manifest.forEach((entry, index) => {
    indexByToken.set(entry.token, index);
  });
  for (const override of overrides) {
    if (!override || !override.token) {
      continue;
    }
    const token = override.token;
    if (indexByToken.has(token)) {
      const idx = indexByToken.get(token);
      const existing = manifest[idx];
      manifest[idx] = { ...existing, ...override, token };
    } else {
      const clone = { ...override };
      manifest.push(clone);
      indexByToken.set(token, manifest.length - 1);
    }
  }
  return manifest;
}

function normaliseFilter(filter) {
  if (!filter) {
    return null;
  }
  if (typeof filter === 'function') {
    return filter;
  }
  if (Array.isArray(filter)) {
    const set = new Set(filter);
    return (entry) => set.has(entry.token);
  }
  return null;
}

function getResolvedAccessor(resolvedMap) {
  return (token) => {
    if (resolvedMap.has(token)) {
      return resolvedMap.get(token);
    }
    try {
      return getService(token);
    } catch (_err) {
      return undefined;
    }
  };
}

export function applyServiceManifest(manifest, {
  config = {},
  force = true,
  filter,
  resolved = new Map()
} = {}) {
  const entries = Array.isArray(manifest) ? manifest.slice() : [];
  const predicate = normaliseFilter(filter);
  const selected = predicate ? entries.filter((entry) => predicate(entry)) : entries;
  const resolvedMap = resolved instanceof Map ? resolved : new Map();
  const results = {};

  for (const entry of selected) {
    if (!entry || !entry.token) {
      continue;
    }
    const { token, exportKey } = entry;

    if (!force && hasService(token)) {
      try {
        const existing = getService(token);
        resolvedMap.set(token, existing);
        if (exportKey && existing !== undefined) {
          results[exportKey] = existing;
        }
        continue;
      } catch (_err) {
        // fall through to fresh registration below
      }
    }

    const getResolved = getResolvedAccessor(resolvedMap);
    const context = {
      config,
      entry,
      resolved: resolvedMap,
      tokens: TOKENS,
      lifetimes: LIFETIMES,
      getService,
      hasService,
      force,
      getResolved
    };

    const value = typeof entry.resolve === 'function'
      ? entry.resolve(context)
      : entry.value;

    if (value === undefined && entry.optional) {
      resolvedMap.set(token, undefined);
      continue;
    }

    const kind = entry.kind || 'instance';
    const lifetime = entry.lifetime || LIFETIMES.SINGLETON;

    if (kind === 'factory' || lifetime === LIFETIMES.FACTORY || lifetime === LIFETIMES.SCOPED) {
      const factoryFn = typeof value === 'function' ? value : () => value;
      registerFactory(token, factoryFn, { force, lifetime });
      const resolvedValue = lifetime === LIFETIMES.FACTORY ? undefined : getResolved(token);
      resolvedMap.set(token, resolvedValue);
      if (exportKey && resolvedValue !== undefined) {
        results[exportKey] = resolvedValue;
      }
    } else if (value !== undefined) {
      registerInstance(token, value, { force });
      resolvedMap.set(token, value);
      if (exportKey) {
        results[exportKey] = value;
      }
    }
  }

  return results;
}

export function getRequiredServiceTokens(manifest = DEFAULT_RUNTIME_SERVICE_MANIFEST) {
  if (!Array.isArray(manifest)) {
    return [];
  }
  return manifest
    .filter((entry) => entry && entry.required === true)
    .map((entry) => entry.token);
}

export const DEFAULT_REQUIRED_SERVICE_TOKENS = Object.freeze(
  getRequiredServiceTokens()
);

export default {
  DEFAULT_RUNTIME_SERVICE_MANIFEST,
  createRuntimeServiceManifest,
  applyServiceManifest,
  getRequiredServiceTokens,
  DEFAULT_REQUIRED_SERVICE_TOKENS
};
