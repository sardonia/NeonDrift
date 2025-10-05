let _offThreadWorker = null;
export function initOffThreadWorkers() {
  if (_offThreadWorker) return true;
  try {
    const url = new URL('../../workers/wallSpriteWorker.js', import.meta.url);
    _offThreadWorker = new Worker(url, { type: 'module' });
    return true;
  } catch (_e) {
    _offThreadWorker = null;
    return false;
  }
}
export function terminateOffThreadWorkers() {
  if (_offThreadWorker) {
    try {
      _offThreadWorker.terminate();
    } catch (_) {
    }
    _offThreadWorker = null;
    return true;
  }
  return false;
}
export function isOffThreadWorkerReady() {
  return !!_offThreadWorker;
}
export const initWorker = initOffThreadWorkers;
export const terminateWorker = terminateOffThreadWorkers;
export const isWorkerReady = isOffThreadWorkerReady;
export function buildWallFramesOffThread(cfg = {}) {
  return new Promise((resolve, reject) => {
    if (!_offThreadWorker) {
      reject(new Error('off‑thread worker not initialised'));
      return;
    }
    const handler = (e) => {
      const msg = (e && e.data) || {};
      if (msg.type === 'wallFrames') {
        _offThreadWorker.removeEventListener('message', handler);
        resolve(msg);
      }
    };
    _offThreadWorker.addEventListener('message', handler);
    try {
      _offThreadWorker.postMessage({ type: 'buildWalls', ...cfg });
    } catch (err) {
      _offThreadWorker.removeEventListener('message', handler);
      reject(err);
    }
  });
}
export function buildSpritesOffThread(cfg = {}) {
  return new Promise((resolve, reject) => {
    if (!_offThreadWorker) {
      reject(new Error('off‑thread worker not initialised'));
      return;
    }
    const handler = (e) => {
      const msg = (e && e.data) || {};
      if (msg.type === 'sprites') {
        _offThreadWorker.removeEventListener('message', handler);
        resolve(msg);
      }
    };
    _offThreadWorker.addEventListener('message', handler);
    try {
      _offThreadWorker.postMessage({ type: 'buildSprites', ...cfg });
    } catch (err) {
      _offThreadWorker.removeEventListener('message', handler);
      reject(err);
    }
  });
}
