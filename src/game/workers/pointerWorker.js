const POINTER_META_VERSION_IDX = 0;
const POINTER_META_WRITE_IDX = 1;
const POINTER_META_READY_IDX = 2;
const POINTER_META_CAPACITY_IDX = 3;
const POINTER_META_FLAGS_IDX = 4;
const POINTER_META_RESERVED0_IDX = 5;
const POINTER_META_RESERVED1_IDX = 6;
const POINTER_META_RESERVED2_IDX = 7;
const POINTER_META_INTS = 8;
const POINTER_META_BYTES = POINTER_META_INTS * 4;
const POINTER_FRAME_BYTES = 48;
const POINTER_FRAME_OFFSETS = Object.freeze({
  TYPE: 0,
  BUTTONS: 4,
  FLAGS: 8,
  RESERVED: 12,
  X: 16,
  Y: 20,
  MOVE_X: 24,
  MOVE_Y: 28,
  TIMESTAMP: 32,
  SPEED_INSTANT: 40,
  SPEED_SMOOTH: 44
});
const POINTER_STATE_FLAGS = Object.freeze({
  LISTENERS_ATTACHED: 1 << 0,
  WORKER_ATTACHED: 1 << 1,
  WORKER_READY: 1 << 2,
  NEEDS_POKE: 1 << 3,
  BUFFER_ACTIVE: 1 << 4
});
let pointerMeta = null;
let pointerData = null;
let pointerCapacity = 0;
let pointerVersion = 0;
let pointerLoopRunning = false;
let pointerAbort = false;
let pointerWaitSupported = typeof Atomics === 'object' && Atomics && typeof Atomics.wait === 'function';
let pointerSampleInterval = 16;
const pointerState = {
  lastX: 0,
  lastY: 0,
  lastTimestamp: 0,
  velocityEMA: 0,
  velocityInstant: 0,
  pointerType: 0,
  buttons: 0,
  lastFlags: 0
};
function pointerNow(){
  if (typeof self !== 'undefined' && self.performance && typeof self.performance.now === 'function') {
    return self.performance.now();
  }
  return Date.now();
}
function atomicLoad(ints, index){
  if (!ints) return 0;
  if (typeof Atomics === 'object' && Atomics && typeof Atomics.load === 'function') {
    try {
      return Atomics.load(ints, index);
    } catch (_err) {}
  }
  return ints[index] || 0;
}
function atomicCompareExchange(ints, index, expected, replacement){
  if (!ints) return expected;
  if (typeof Atomics === 'object' && Atomics && typeof Atomics.compareExchange === 'function') {
    try {
      return Atomics.compareExchange(ints, index, expected, replacement);
    } catch (_err) {}
  }
  const current = ints[index] || 0;
  if (current === expected) {
    ints[index] = replacement;
  }
  return current;
}
function updateFlag(flag, enabled){
  if (!pointerMeta || !flag) return;
  if (typeof Atomics === 'object' && Atomics && typeof Atomics.compareExchange === 'function') {
    let guard = 0;
    while (guard < 16) {
      guard += 1;
      const current = atomicLoad(pointerMeta, POINTER_META_FLAGS_IDX);
      const next = enabled ? (current | flag) : (current & ~flag);
      if (current === next) return;
      const prev = atomicCompareExchange(pointerMeta, POINTER_META_FLAGS_IDX, current, next);
      if (prev === current) {
        return;
      }
    }
  }
  try {
    const current = pointerMeta[POINTER_META_FLAGS_IDX] || 0;
    const next = enabled ? (current | flag) : (current & ~flag);
    if (current !== next) {
      pointerMeta[POINTER_META_FLAGS_IDX] = next;
    }
  } catch (_err) {}
}
function readSnapshot(force){
  if (!pointerMeta || !pointerData) return null;
  let version = atomicLoad(pointerMeta, POINTER_META_VERSION_IDX);
  if (!force && version === pointerVersion) return null;
  const capacity = pointerCapacity > 0 ? pointerCapacity : Math.max(1, atomicLoad(pointerMeta, POINTER_META_CAPACITY_IDX) | 0);
  if (capacity <= 0) return null;
  const readyIndex = atomicLoad(pointerMeta, POINTER_META_READY_IDX);
  if (readyIndex < 0) return null;
  const slot = readyIndex % capacity;
  const baseOffset = slot * POINTER_FRAME_BYTES;
  let pointerType = 0;
  let buttons = 0;
  let x = 0;
  let y = 0;
  let movementX = 0;
  let movementY = 0;
  let timestamp = pointerNow();
  let instantSpeed = pointerState.velocityInstant;
  let smoothSpeed = pointerState.velocityEMA;
  let flags = 0;
  try {
    pointerType = pointerData.getInt32(baseOffset + POINTER_FRAME_OFFSETS.TYPE, true);
    buttons = pointerData.getInt32(baseOffset + POINTER_FRAME_OFFSETS.BUTTONS, true);
    flags = pointerData.getInt32(baseOffset + POINTER_FRAME_OFFSETS.FLAGS, true);
    x = pointerData.getFloat32(baseOffset + POINTER_FRAME_OFFSETS.X, true);
    y = pointerData.getFloat32(baseOffset + POINTER_FRAME_OFFSETS.Y, true);
    movementX = pointerData.getFloat32(baseOffset + POINTER_FRAME_OFFSETS.MOVE_X, true);
    movementY = pointerData.getFloat32(baseOffset + POINTER_FRAME_OFFSETS.MOVE_Y, true);
    const ts = pointerData.getFloat64(baseOffset + POINTER_FRAME_OFFSETS.TIMESTAMP, true);
    if (Number.isFinite(ts)) timestamp = ts;
    const inst = pointerData.getFloat32(baseOffset + POINTER_FRAME_OFFSETS.SPEED_INSTANT, true);
    if (Number.isFinite(inst)) instantSpeed = inst;
    const smooth = pointerData.getFloat32(baseOffset + POINTER_FRAME_OFFSETS.SPEED_SMOOTH, true);
    if (Number.isFinite(smooth)) smoothSpeed = smooth;
  } catch (_err) {}
  pointerVersion = version;
  return {
    pointerType,
    buttons,
    x,
    y,
    movementX,
    movementY,
    timestamp,
    instantSpeed,
    smoothSpeed,
    flags
  };
}
function processSnapshot(snapshot){
  if (!snapshot) return;
  pointerState.pointerType = snapshot.pointerType;
  pointerState.buttons = snapshot.buttons;
  pointerState.lastFlags = snapshot.flags || 0;
  const timestamp = Number.isFinite(snapshot.timestamp) ? snapshot.timestamp : pointerNow();
  const lastTimestamp = pointerState.lastTimestamp;
  let instantVelocity = Number.isFinite(snapshot.instantSpeed) ? snapshot.instantSpeed : null;
  if (instantVelocity === null && lastTimestamp > 0) {
    const dt = timestamp - lastTimestamp;
    if (dt > 0 && dt < 2000) {
      const dx = snapshot.x - pointerState.lastX;
      const dy = snapshot.y - pointerState.lastY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      instantVelocity = distance / dt;
    }
  }
  if (Number.isFinite(instantVelocity)) {
    pointerState.velocityInstant = instantVelocity;
  }
  let smoothVelocity = Number.isFinite(snapshot.smoothSpeed) ? snapshot.smoothSpeed : null;
  if (smoothVelocity === null) {
    if (Number.isFinite(pointerState.velocityInstant) && lastTimestamp > 0) {
      smoothVelocity = pointerState.velocityEMA * 0.68 + pointerState.velocityInstant * 0.32;
    } else if (pointerState.velocityEMA) {
      smoothVelocity = pointerState.velocityEMA * 0.6;
    }
  }
  if (Number.isFinite(smoothVelocity)) {
    pointerState.velocityEMA = smoothVelocity;
  }
  pointerState.lastX = snapshot.x;
  pointerState.lastY = snapshot.y;
  pointerState.lastTimestamp = timestamp;
  if (!pointerState.buttons && pointerState.velocityEMA < 0.002) {
    pointerState.velocityEMA *= 0.4;
  }
}
function pollLoop(){
  if (pointerAbort) {
    pointerLoopRunning = false;
    return;
  }
  const snapshot = readSnapshot(false);
  if (snapshot) {
    processSnapshot(snapshot);
  }
  self.setTimeout(pollLoop, pointerSampleInterval);
}
function waitLoop(){
  if (!pointerMeta) {
    pointerLoopRunning = false;
    return;
  }
  while (!pointerAbort) {
    let version = 0;
    try {
      version = atomicLoad(pointerMeta, POINTER_META_VERSION_IDX);
      Atomics.wait(pointerMeta, POINTER_META_VERSION_IDX, version);
    } catch (_err) {
      pointerWaitSupported = false;
      break;
    }
    if (pointerAbort) break;
    const snapshot = readSnapshot(true);
    if (snapshot) {
      processSnapshot(snapshot);
    }
  }
  pointerLoopRunning = false;
  if (!pointerAbort && !pointerWaitSupported) {
    pointerLoopRunning = true;
    pollLoop();
  }
}
function ensureLoop(){
  if (pointerLoopRunning || !pointerMeta) return;
  pointerLoopRunning = true;
  pointerAbort = false;
  if (pointerWaitSupported && typeof Atomics.wait === 'function') {
    waitLoop();
  } else {
    pollLoop();
  }
}
self.onmessage = (event) => {
  const data = event && event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'init') {
    const buffer = data.buffer;
    if (!(buffer instanceof SharedArrayBuffer)) return;
    try {
      pointerMeta = new Int32Array(buffer, 0, POINTER_META_INTS);
      pointerData = new DataView(buffer, POINTER_META_BYTES);
    } catch (_err) {
      pointerMeta = null;
      pointerData = null;
      pointerCapacity = 0;
      return;
    }
    pointerCapacity = Math.max(1, atomicLoad(pointerMeta, POINTER_META_CAPACITY_IDX) | 0);
    pointerVersion = atomicLoad(pointerMeta, POINTER_META_VERSION_IDX) || 0;
    if (typeof data.sampleRate === 'number' && data.sampleRate > 0) {
      pointerSampleInterval = Math.max(4, Math.min(1000, Math.round(data.sampleRate)));
    }
    pointerAbort = false;
    updateFlag(POINTER_STATE_FLAGS.WORKER_ATTACHED, true);
    updateFlag(POINTER_STATE_FLAGS.WORKER_READY, false);
    ensureLoop();
    try {
      updateFlag(POINTER_STATE_FLAGS.WORKER_READY, true);
      self.postMessage({ type: 'ready' });
    } catch (_err) {}
  } else if (data.type === 'poke') {
    if (pointerMeta && pointerWaitSupported) {
      try { Atomics.notify(pointerMeta, POINTER_META_VERSION_IDX, 1); } catch (_err) {}
    }
    updateFlag(POINTER_STATE_FLAGS.NEEDS_POKE, false);
  } else if (data.type === 'dispose') {
    pointerAbort = true;
    updateFlag(POINTER_STATE_FLAGS.WORKER_READY, false);
    updateFlag(POINTER_STATE_FLAGS.WORKER_ATTACHED, false);
    updateFlag(POINTER_STATE_FLAGS.NEEDS_POKE, false);
    if (pointerMeta && pointerWaitSupported) {
      try { Atomics.notify(pointerMeta, POINTER_META_VERSION_IDX, 1); } catch (_err) {}
    }
  } else if (data.type === 'configure' && typeof data.sampleRate === 'number') {
    pointerSampleInterval = Math.max(4, Math.min(1000, Math.round(data.sampleRate)));
  }
};
