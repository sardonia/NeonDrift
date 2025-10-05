const ID_LOOKUP = {
  board: 'board',
  trails: 'trails',
  fx: 'fx',
  wallsGlow: 'wallsGlow',
  borderFx: 'borderFX',
  overlay: 'overlay',
  panel: 'panel',
  startBtn: 'startBtn',
  muteBtn: 'muteBtn',
  bgm: 'bgm',
  tickerHUD: 'tickerHUD',
  tickerInfoCanvas: 'tickerInfoCanvas',
  tickerCanvas: 'tickerCanvas',
  tickerBorderFx: 'tickerBorderFX',
  tickerText: 'tickerText',
  tickerScore: 'tickerScore',
  tickerLevel: 'tickerLevel',
  tickerPowerupsList: 'tickerPowerupsList',
  debugBtn: 'debugBtn',
  debugPanel: 'debugPanel',
  againBtn: 'againBtn',
  again: 'againBtn',
  nextLevelBtn: 'nextLevelBtn'
};

function getDocument() {
  try {
    return typeof document !== 'undefined' ? document : null;
  } catch (_err) {
    return null;
  }
}

function queryElement(id) {
  if (!id) return null;
  const doc = getDocument();
  if (!doc || typeof doc.getElementById !== 'function') {
    return null;
  }
  try {
    return doc.getElementById(id);
  } catch (_err) {
    return null;
  }
}

const cache = new Map();

function resolve(id) {
  if (!id) return null;
  const cached = cache.get(id);
  if (cached) {
    try {
      if (cached.ownerDocument === getDocument() && cached.isConnected !== false) {
        return cached;
      }
    } catch (_err) {
      return cached;
    }
  }
  const el = queryElement(id);
  if (el) {
    cache.set(id, el);
  } else {
    cache.delete(id);
  }
  return el;
}

function assign(id, value) {
  if (!id) {
    return;
  }
  if (value) {
    cache.set(id, value);
  } else {
    cache.delete(id);
  }
}

export const el = {};

for (const [key, id] of Object.entries(ID_LOOKUP)) {
  Object.defineProperty(el, key, {
    enumerable: true,
    configurable: true,
    get() {
      return resolve(id);
    },
    set(value) {
      assign(id, value);
    }
  });
}

export default el;
