const DOM_IDS = Object.freeze({
  overlay: 'overlay',
  panel: 'panel',
  tickerHud: 'tickerHUD',
  tickerInfoCanvas: 'tickerInfoCanvas',
  tickerCanvas: 'tickerCanvas',
  tickerText: 'tickerText',
  tickerScore: 'tickerScore',
  tickerLevel: 'tickerLevel',
  tickerPowerupsList: 'tickerPowerupsList',
  muteBtn: 'muteBtn',
  bgm: 'bgm'
});

function safeDocument() {
  try {
    return typeof document !== 'undefined' ? document : null;
  } catch (_err) {
    return null;
  }
}

function queryById(id) {
  if (!id) return null;
  const doc = safeDocument();
  if (!doc || typeof doc.getElementById !== 'function') {
    return null;
  }
  try {
    return doc.getElementById(id);
  } catch (_err) {
    return null;
  }
}

export function createDomAdapter(domService = {}) {
  const cache = new Map();

  const resolveFromService = (key) => {
    if (!key) return null;
    const value = domService && typeof domService === 'object' ? domService[key] : undefined;
    if (value) {
      return value;
    }
    return null;
  };

  const get = (key) => {
    if (!key) return null;
    const cached = cache.get(key);
    if (cached && cached.isConnected !== false) {
      return cached;
    }
    const fromService = resolveFromService(key);
    if (fromService) {
      cache.set(key, fromService);
      return fromService;
    }
    const id = DOM_IDS[key] ?? key;
    const el = queryById(id);
    if (el) {
      cache.set(key, el);
      return el;
    }
    cache.delete(key);
    return null;
  };

  const assign = (key, value) => {
    if (!key) return;
    if (value) {
      cache.set(key, value);
    } else {
      cache.delete(key);
    }
    if (domService && typeof domService === 'object' && key in domService) {
      domService[key] = value;
    }
  };

  const query = (id) => {
    const el = queryById(id);
    if (el) {
      for (const [key, domId] of Object.entries(DOM_IDS)) {
        if (domId === id) {
          assign(key, el);
        }
      }
    }
    return el;
  };

  return Object.freeze({
    get,
    assign,
    query,
    ids: DOM_IDS
  });
}

export default createDomAdapter;
