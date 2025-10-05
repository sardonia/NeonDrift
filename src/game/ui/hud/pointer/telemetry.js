const DEFAULT_DECAY = 0.92;

function resolveWindow() {
  try {
    return typeof window !== 'undefined' ? window : null;
  } catch (_err) {
    return null;
  }
}

export function createPointerTelemetry({ decay = DEFAULT_DECAY } = {}) {
  let active = false;
  let lastTimestamp = 0;
  let instant = 0;
  let smooth = 0;
  let forced = false;
  let listenersAttached = false;
  let lastButtons = 0;
  let lastX = null;
  let lastY = null;
  let lastMovementX = 0;
  let lastMovementY = 0;
  let lastType = '';
  let lastEventType = '';
  let lastWallClock = 0;

  const snapshot = () => ({
    active,
    instant,
    smooth,
    lastTimestamp,
    forced,
    listenersAttached,
    lastButtons,
    lastX,
    lastY,
    lastMovementX,
    lastMovementY,
    lastType,
    lastEventType,
    lastWallClock
  });

  const update = (event) => {
    if (!event) return;
    const now = typeof event.timeStamp === 'number' ? event.timeStamp : Date.now();
    const dx = typeof event.movementX === 'number' ? event.movementX : 0;
    const dy = typeof event.movementY === 'number' ? event.movementY : 0;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const dt = lastTimestamp ? Math.max(0, now - lastTimestamp) : 16;
    instant = dt > 0 ? distance / dt : 0;
    smooth = smooth * decay + instant * (1 - decay);
    lastTimestamp = now;
    lastWallClock = Date.now();
    if (typeof event.buttons === 'number' && Number.isFinite(event.buttons)) {
      lastButtons = event.buttons;
    }
    if (typeof event.clientX === 'number' && Number.isFinite(event.clientX)) {
      lastX = event.clientX;
    }
    if (typeof event.clientY === 'number' && Number.isFinite(event.clientY)) {
      lastY = event.clientY;
    }
    if (Number.isFinite(dx)) {
      lastMovementX = dx;
    }
    if (Number.isFinite(dy)) {
      lastMovementY = dy;
    }
    const pointerType = (typeof event.pointerType === 'string' && event.pointerType)
      ? event.pointerType
      : '';
    if (pointerType) {
      lastType = pointerType;
    }
    if (typeof event.type === 'string' && event.type) {
      lastEventType = event.type;
      if (!pointerType) {
        lastType = event.type;
      }
    }
    forced = !!(event.type && event.type.startsWith('pointer') && event.type !== 'pointermove');
    active = true;
  };

  const attach = () => {
    if (listenersAttached) return;
    const win = resolveWindow();
    if (!win || typeof win.addEventListener !== 'function') return;
    listenersAttached = true;
    win.addEventListener('pointermove', update, { passive: true });
    win.addEventListener('pointerdown', update, { passive: true });
    win.addEventListener('pointerup', update, { passive: true });
  };

  const detach = () => {
    if (!listenersAttached) return;
    const win = resolveWindow();
    if (!win || typeof win.removeEventListener !== 'function') return;
    listenersAttached = false;
    win.removeEventListener('pointermove', update, { passive: true });
    win.removeEventListener('pointerdown', update, { passive: true });
    win.removeEventListener('pointerup', update, { passive: true });
  };

  return {
    start() {
      attach();
      active = true;
      lastTimestamp = 0;
      lastWallClock = Date.now();
    },
    stop() {
      detach();
      active = false;
    },
    getSnapshot() {
      return snapshot();
    },
    dispose() {
      detach();
    },
    updateFromEvent: update
  };
}

export default {
  createPointerTelemetry
};
