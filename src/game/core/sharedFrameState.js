const META_VERSION_INDEX = 0;
const META_WRITE_INDEX = 1;
const META_READY_INDEX = 2;
const META_CAPACITY_INDEX = 3;
const META_FLAGS_INDEX = 4;
const META_RESERVED0_INDEX = 5;
const META_RESERVED1_INDEX = 6;
const META_RESERVED2_INDEX = 7;

const META_INTS = 8;
const META_BYTES = META_INTS * 4;

export const FrameStateOffsets = Object.freeze({
  TIMESTAMP: 0,
  PLAYER_X: 8,
  PLAYER_Y: 12,
  PLAYER_VX: 16,
  PLAYER_VY: 20,
  PLAYER_DIR: 24,
  PLAYER_PROGRESS: 28,
  ENEMY_X: 32,
  ENEMY_Y: 36,
  ENEMY_VX: 40,
  ENEMY_VY: 44,
  ENEMY_DIR: 48,
  ENEMY_PROGRESS: 52,
  SCORE: 56,
  LEVEL: 64,
  DURATION: 68,
  TICK: 72,
  POWER_X: 76,
  POWER_Y: 80,
  POWER_KIND: 84,
  FLAGS: 88,
  PLAYER_SPEED: 92,
  ENEMY_SPEED: 96,
  HUD_PENDING: 100,
  HUD_COOLDOWN: 104,
  HUD_LAST_BROADCAST: 108
});

export const FRAME_BYTES = 112;

export const FrameStateFlags = Object.freeze({
  NONE: 0,
  PAUSED: 1 << 0,
  CENTERED: 1 << 1,
  BOOST_ACTIVE: 1 << 2,
  POWER_ACTIVE: 1 << 3
});

const DIRECTION_TO_CODE = Object.freeze({
  up: 1,
  right: 2,
  down: 3,
  left: 4
});

const CODE_TO_DIRECTION = Object.freeze({
  1: 'up',
  2: 'right',
  3: 'down',
  4: 'left'
});

const POWER_TO_CODE = Object.freeze({
  accel: 1
});

const CODE_TO_POWER = Object.freeze({
  1: 'accel'
});

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function encodeDirection(dir) {
  if (!dir) return 0;
  return DIRECTION_TO_CODE[String(dir).toLowerCase()] || 0;
}

function decodeDirection(code) {
  return CODE_TO_DIRECTION[code] || 'right';
}

function encodePowerKind(kind) {
  if (!kind) return 0;
  const code = POWER_TO_CODE[String(kind).toLowerCase()];
  return typeof code === 'number' ? code : 0;
}

function decodePowerKind(code) {
  return CODE_TO_POWER[code] || 'accel';
}

function nowTimestamp(snapshotTs) {
  if (Number.isFinite(snapshotTs)) {
    return snapshotTs;
  }
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function atomicLoad(ints, index) {
  if (typeof Atomics === 'object' && Atomics && typeof Atomics.load === 'function') {
    try {
      return Atomics.load(ints, index);
    } catch (_) {}
  }
  return ints[index];
}

function atomicStore(ints, index, value) {
  if (typeof Atomics === 'object' && Atomics && typeof Atomics.store === 'function') {
    try {
      Atomics.store(ints, index, value);
      return;
    } catch (_) {}
  }
  ints[index] = value;
}

function atomicNotify(ints, index) {
  if (typeof Atomics === 'object' && Atomics && typeof Atomics.notify === 'function') {
    try {
      Atomics.notify(ints, index, 1);
    } catch (_) {}
  }
}

export function createSharedFrameState({ capacity = 8 } = {}) {
  if (typeof SharedArrayBuffer !== 'function') {
    return null;
  }
  const requested = Number.isFinite(capacity) ? capacity : 8;
  const slots = Math.max(1, requested | 0);
  const totalBytes = META_BYTES + slots * FRAME_BYTES;
  let buffer = null;
  try {
    buffer = new SharedArrayBuffer(totalBytes);
  } catch (_) {
    return null;
  }
  const meta = new Int32Array(buffer, 0, META_INTS);
  meta[META_VERSION_INDEX] = 0;
  meta[META_WRITE_INDEX] = 0;
  meta[META_READY_INDEX] = -1;
  meta[META_CAPACITY_INDEX] = slots;
  meta[META_FLAGS_INDEX] = 0;
  meta[META_RESERVED0_INDEX] = 0;
  meta[META_RESERVED1_INDEX] = 0;
  meta[META_RESERVED2_INDEX] = 0;
  const dataView = new DataView(buffer, META_BYTES);
  const history = {
    timestamp: 0,
    playerX: 0,
    playerY: 0,
    enemyX: 0,
    enemyY: 0
  };
  function writeFrame(snapshot = {}) {
    const index = atomicLoad(meta, META_WRITE_INDEX) % slots;
    const baseOffset = index * FRAME_BYTES;
    const timestamp = nowTimestamp(snapshot.timestamp);
    const dtSeconds = history.timestamp > 0 ? (timestamp - history.timestamp) / 1000 : 0;
    const player = snapshot.player || {};
    const enemy = snapshot.enemy || {};
    const playerX = safeNumber(player.x);
    const playerY = safeNumber(player.y);
    const enemyX = safeNumber(enemy.x);
    const enemyY = safeNumber(enemy.y);
    const playerVX = dtSeconds > 0 ? (playerX - history.playerX) / dtSeconds : 0;
    const playerVY = dtSeconds > 0 ? (playerY - history.playerY) / dtSeconds : 0;
    const enemyVX = dtSeconds > 0 ? (enemyX - history.enemyX) / dtSeconds : 0;
    const enemyVY = dtSeconds > 0 ? (enemyY - history.enemyY) / dtSeconds : 0;
    const playerProgress = Number.isFinite(snapshot.playerProgress)
      ? snapshot.playerProgress
      : Number.isFinite(player.progress) ? player.progress : 0;
    const enemyProgress = Number.isFinite(snapshot.enemyProgress)
      ? snapshot.enemyProgress
      : Number.isFinite(enemy.progress) ? enemy.progress : 0;
    const score = safeNumber(snapshot.score);
    const level = safeNumber(snapshot.level, 1);
    const duration = safeNumber(snapshot.duration, 0);
    const tick = safeNumber(snapshot.tick, 0);
    const hudScorePending = safeNumber(snapshot.hudScorePending, 0);
    const hudScoreCooldown = safeNumber(snapshot.hudScoreCooldown, 0);
    const hudScoreLastBroadcast = safeNumber(snapshot.hudScoreLastBroadcast, 0);
    const paused = !!snapshot.paused;
    const centered = !!snapshot.centered;
    const boostActive = !!snapshot.boostActive;
    let flags = FrameStateFlags.NONE;
    if (paused) flags |= FrameStateFlags.PAUSED;
    if (centered) flags |= FrameStateFlags.CENTERED;
    if (boostActive) flags |= FrameStateFlags.BOOST_ACTIVE;
    const power = snapshot.powerUp && typeof snapshot.powerUp === 'object' ? snapshot.powerUp : null;
    const powerX = power ? safeNumber(power.x) : 0;
    const powerY = power ? safeNumber(power.y) : 0;
    const powerKindCode = power ? encodePowerKind(power.kind) : 0;
    if (power) {
      flags |= FrameStateFlags.POWER_ACTIVE;
    }
    const playerSpeed = Math.hypot(playerVX, playerVY);
    const enemySpeed = Math.hypot(enemyVX, enemyVY);
    dataView.setFloat64(baseOffset + FrameStateOffsets.TIMESTAMP, timestamp, true);
    dataView.setFloat32(baseOffset + FrameStateOffsets.PLAYER_X, playerX, true);
    dataView.setFloat32(baseOffset + FrameStateOffsets.PLAYER_Y, playerY, true);
    dataView.setFloat32(baseOffset + FrameStateOffsets.PLAYER_VX, playerVX, true);
    dataView.setFloat32(baseOffset + FrameStateOffsets.PLAYER_VY, playerVY, true);
    dataView.setInt32(baseOffset + FrameStateOffsets.PLAYER_DIR, encodeDirection(player.dir), true);
    dataView.setFloat32(baseOffset + FrameStateOffsets.PLAYER_PROGRESS, playerProgress, true);
    dataView.setFloat32(baseOffset + FrameStateOffsets.ENEMY_X, enemyX, true);
    dataView.setFloat32(baseOffset + FrameStateOffsets.ENEMY_Y, enemyY, true);
    dataView.setFloat32(baseOffset + FrameStateOffsets.ENEMY_VX, enemyVX, true);
    dataView.setFloat32(baseOffset + FrameStateOffsets.ENEMY_VY, enemyVY, true);
    dataView.setInt32(baseOffset + FrameStateOffsets.ENEMY_DIR, encodeDirection(enemy.dir), true);
    dataView.setFloat32(baseOffset + FrameStateOffsets.ENEMY_PROGRESS, enemyProgress, true);
    dataView.setFloat64(baseOffset + FrameStateOffsets.SCORE, score, true);
    dataView.setFloat32(baseOffset + FrameStateOffsets.LEVEL, level, true);
    dataView.setFloat32(baseOffset + FrameStateOffsets.DURATION, duration, true);
    dataView.setFloat32(baseOffset + FrameStateOffsets.TICK, tick, true);
    dataView.setFloat32(baseOffset + FrameStateOffsets.POWER_X, powerX, true);
    dataView.setFloat32(baseOffset + FrameStateOffsets.POWER_Y, powerY, true);
    dataView.setInt32(baseOffset + FrameStateOffsets.POWER_KIND, powerKindCode, true);
    dataView.setInt32(baseOffset + FrameStateOffsets.FLAGS, flags, true);
    dataView.setFloat32(baseOffset + FrameStateOffsets.PLAYER_SPEED, playerSpeed, true);
    dataView.setFloat32(baseOffset + FrameStateOffsets.ENEMY_SPEED, enemySpeed, true);
    dataView.setFloat32(baseOffset + FrameStateOffsets.HUD_PENDING, hudScorePending, true);
    dataView.setFloat32(baseOffset + FrameStateOffsets.HUD_COOLDOWN, hudScoreCooldown, true);
    dataView.setFloat32(baseOffset + FrameStateOffsets.HUD_LAST_BROADCAST, hudScoreLastBroadcast, true);
    history.timestamp = timestamp;
    history.playerX = playerX;
    history.playerY = playerY;
    history.enemyX = enemyX;
    history.enemyY = enemyY;
    const readyIndex = index;
    const nextIndex = (index + 1) % slots;
    const currentVersion = atomicLoad(meta, META_VERSION_INDEX);
    let nextVersion = (currentVersion + 1) & 0x7fffffff;
    if (nextVersion === 0) nextVersion = 1;
    atomicStore(meta, META_FLAGS_INDEX, flags);
    atomicStore(meta, META_READY_INDEX, readyIndex);
    atomicStore(meta, META_WRITE_INDEX, nextIndex);
    atomicStore(meta, META_VERSION_INDEX, nextVersion);
    atomicNotify(meta, META_VERSION_INDEX);
    return { index: readyIndex, version: nextVersion, timestamp, flags };
  }
  return {
    buffer,
    meta,
    frameBytes: FRAME_BYTES,
    capacity: slots,
    descriptor: Object.freeze({ frameBytes: FRAME_BYTES, capacity: slots }),
    writeFrame
  };
}

export function createSharedFrameStateReader(buffer) {
  if (!(buffer instanceof SharedArrayBuffer)) {
    return null;
  }
  let meta = null;
  try {
    meta = new Int32Array(buffer, 0, META_INTS);
  } catch (_) {
    return null;
  }
  const capacity = Math.max(1, atomicLoad(meta, META_CAPACITY_INDEX) | 0);
  const dataView = new DataView(buffer, META_BYTES);
  const resultHolder = {
    index: -1,
    version: 0,
    timestamp: 0,
    player: { x: 0, y: 0, dir: 'right', vx: 0, vy: 0, progress: 0, speed: 0 },
    enemy: { x: 0, y: 0, dir: 'left', vx: 0, vy: 0, progress: 0, speed: 0 },
    powerUp: null,
    score: 0,
    level: 0,
    duration: 0,
    tick: 0,
    flags: 0,
    paused: false,
    centered: false,
    boostActive: false,
    hud: {
      scorePending: 0,
      scoreCooldown: 0,
      scoreLastBroadcast: 0
    }
  };
  function readFrame(index, target = resultHolder) {
    if (index < 0) {
      return null;
    }
    const slot = index % capacity;
    let attempts = 0;
    let versionBefore = 0;
    let versionAfter = 0;
    const offset = slot * FRAME_BYTES;
    do {
      attempts += 1;
      versionBefore = atomicLoad(meta, META_VERSION_INDEX);
      const timestamp = dataView.getFloat64(offset + FrameStateOffsets.TIMESTAMP, true);
      const playerX = dataView.getFloat32(offset + FrameStateOffsets.PLAYER_X, true);
      const playerY = dataView.getFloat32(offset + FrameStateOffsets.PLAYER_Y, true);
      const playerVX = dataView.getFloat32(offset + FrameStateOffsets.PLAYER_VX, true);
      const playerVY = dataView.getFloat32(offset + FrameStateOffsets.PLAYER_VY, true);
      const playerDir = decodeDirection(dataView.getInt32(offset + FrameStateOffsets.PLAYER_DIR, true));
      const playerProgress = dataView.getFloat32(offset + FrameStateOffsets.PLAYER_PROGRESS, true);
      const enemyX = dataView.getFloat32(offset + FrameStateOffsets.ENEMY_X, true);
      const enemyY = dataView.getFloat32(offset + FrameStateOffsets.ENEMY_Y, true);
      const enemyVX = dataView.getFloat32(offset + FrameStateOffsets.ENEMY_VX, true);
      const enemyVY = dataView.getFloat32(offset + FrameStateOffsets.ENEMY_VY, true);
      const enemyDir = decodeDirection(dataView.getInt32(offset + FrameStateOffsets.ENEMY_DIR, true));
      const enemyProgress = dataView.getFloat32(offset + FrameStateOffsets.ENEMY_PROGRESS, true);
      const score = dataView.getFloat64(offset + FrameStateOffsets.SCORE, true);
      const level = dataView.getFloat32(offset + FrameStateOffsets.LEVEL, true);
      const duration = dataView.getFloat32(offset + FrameStateOffsets.DURATION, true);
      const tick = dataView.getFloat32(offset + FrameStateOffsets.TICK, true);
      const powerX = dataView.getFloat32(offset + FrameStateOffsets.POWER_X, true);
      const powerY = dataView.getFloat32(offset + FrameStateOffsets.POWER_Y, true);
      const powerKindCode = dataView.getInt32(offset + FrameStateOffsets.POWER_KIND, true);
      const flags = dataView.getInt32(offset + FrameStateOffsets.FLAGS, true);
      const playerSpeed = dataView.getFloat32(offset + FrameStateOffsets.PLAYER_SPEED, true);
      const enemySpeed = dataView.getFloat32(offset + FrameStateOffsets.ENEMY_SPEED, true);
      const hudPending = dataView.getFloat32(offset + FrameStateOffsets.HUD_PENDING, true);
      const hudCooldown = dataView.getFloat32(offset + FrameStateOffsets.HUD_COOLDOWN, true);
      const hudLast = dataView.getFloat32(offset + FrameStateOffsets.HUD_LAST_BROADCAST, true);
      versionAfter = atomicLoad(meta, META_VERSION_INDEX);
      if (versionBefore !== versionAfter && attempts < 3) {
        continue;
      }
      target.index = slot;
      target.version = versionAfter;
      target.timestamp = timestamp;
      target.player.x = playerX;
      target.player.y = playerY;
      target.player.vx = playerVX;
      target.player.vy = playerVY;
      target.player.dir = playerDir;
      target.player.progress = playerProgress;
      target.player.speed = playerSpeed;
      target.enemy.x = enemyX;
      target.enemy.y = enemyY;
      target.enemy.vx = enemyVX;
      target.enemy.vy = enemyVY;
      target.enemy.dir = enemyDir;
      target.enemy.progress = enemyProgress;
      target.enemy.speed = enemySpeed;
      target.score = score;
      target.level = level;
      target.duration = duration;
      target.tick = tick;
      target.flags = flags;
      target.paused = !!(flags & FrameStateFlags.PAUSED);
      target.centered = !!(flags & FrameStateFlags.CENTERED);
      target.boostActive = !!(flags & FrameStateFlags.BOOST_ACTIVE);
      if (flags & FrameStateFlags.POWER_ACTIVE) {
        target.powerUp = target.powerUp || {};
        target.powerUp.x = powerX;
        target.powerUp.y = powerY;
        target.powerUp.kind = decodePowerKind(powerKindCode);
      } else {
        target.powerUp = null;
      }
      target.hud.scorePending = hudPending;
      target.hud.scoreCooldown = hudCooldown;
      target.hud.scoreLastBroadcast = hudLast;
      return target;
    } while (attempts < 3);
    return target;
  }
  function readLatest(target) {
    const latest = atomicLoad(meta, META_READY_INDEX);
    if (latest < 0) {
      return null;
    }
    return readFrame(latest, target);
  }
  return {
    buffer,
    meta,
    capacity,
    frameBytes: FRAME_BYTES,
    readFrame,
    readLatest,
    getVersion() {
      return atomicLoad(meta, META_VERSION_INDEX);
    },
    getFlags() {
      return atomicLoad(meta, META_FLAGS_INDEX);
    }
  };
}
