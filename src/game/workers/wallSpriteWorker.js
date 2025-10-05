function hexA(hex, a) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${a})`;
}
function drawGlowLineTo(c, x1, y1, x2, y2, glowColor, coreColor, coreW, glowW) {
  c.save();
  try {
    c.globalCompositeOperation = 'lighter';
  } catch (_) {
  }
  c.lineCap = 'round';
  c.strokeStyle = glowColor;
  c.globalAlpha = 1.0;
  c.lineWidth = glowW;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
  c.globalAlpha = 1.0;
  c.strokeStyle = coreColor;
  c.lineWidth = coreW;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
  c.restore();
}
function pathCapsule(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h - r);
  c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h);
  c.arcTo(x, y + h, x, y + h - r, r);
  c.lineTo(x, y + r);
  c.arcTo(x, y, x + r, y, r);
  c.closePath();
}
const _pathCapsule = pathCapsule;
function makeSegmentBitmap(width, height, orient, CELL, core, glow) {
  const len = CELL;
  const pad = Math.max(8, Math.ceil(10 * 1.25));
  const w = (orient === 'h') ? (len + pad * 2) : Math.max(6, Math.ceil(10 * 2 + 3 * 2 + 2));
  const h = (orient === 'v') ? (len + pad * 2) : Math.max(6, Math.ceil(10 * 2 + 3 * 2 + 2));
  const tmp = new OffscreenCanvas(w, h);
  const tctx = tmp.getContext('2d');
  const midX = w / 2;
  const midY = h / 2;
  const x1 = (orient === 'h') ? pad : midX;
  const y1 = (orient === 'h') ? midY : pad;
  const x2 = (orient === 'h') ? (w - pad) : midX;
  const y2 = (orient === 'h') ? midY : (h - pad);
  const glowCv = new OffscreenCanvas(w, h);
  const glowCtx = glowCv.getContext('2d');
  try {
    glowCtx.filter = 'blur(6px)';
  } catch (_) {
  }
  drawGlowLineTo(glowCtx, x1, y1, x2, y2, glow, core, 2, 14);
  try {
    glowCtx.filter = 'none';
  } catch (_) {
  }
  const cv = new OffscreenCanvas(w, h);
  const c = cv.getContext('2d');
  try {
    c.globalCompositeOperation = 'lighter';
  } catch (_) {
  }
  c.drawImage(glowCv, 0, 0);
  c.save();
  c.lineCap = 'round';
  c.strokeStyle = core;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
  c.restore();
  try {
    return cv.transferToImageBitmap();
  } catch (_) {
    try {
      return createImageBitmap(cv);
    } catch (__unused) {
      return null;
    }
  }
}
function makeCycleBitmap(dir, core, glow, CELL) {
  const W = Math.max(24, CELL * 2.0);
  const H = Math.max(16, CELL * 1.2);
  const cv = new OffscreenCanvas(W, H);
  const c = cv.getContext('2d');
  c.save();
  const angle = (dir === 'right') ? 0 : (dir === 'down') ? Math.PI / 2 : (dir === 'left') ? Math.PI : -Math.PI / 2;
  c.translate(W / 2, H / 2);
  c.rotate(angle);
  c.translate(-W / 2, -H / 2);
  try {
    c.filter = 'blur(4px)';
  } catch (_) {
  }
  c.fillStyle = hexA(glow, 0.12);
  c.strokeStyle = glow;
  c.lineWidth = 10;
  c.lineCap = 'round';
  _pathCapsule(c, 2, 2, W - 4, H - 4, Math.min(H / 2, 10));
  c.fill();
  c.stroke();
  try {
    c.filter = 'none';
  } catch (_) {
  }
  c.fillStyle = hexA(core, 0.8);
  c.strokeStyle = core;
  c.lineWidth = 2;
  _pathCapsule(c, 4, 4, W - 8, H - 8, Math.min(H / 2 - 2, 9));
  c.fill();
  c.stroke();
  c.restore();
  try {
    return cv.transferToImageBitmap();
  } catch (_) {
    try {
      return createImageBitmap(cv);
    } catch (__unused) {
      return null;
    }
  }
}
async function buildSprites(payload) {
  const { CELL, playerSegCore, playerSegGlow, enemySegCore, enemySegGlow,
          playerCycleCore, playerCycleGlow, enemyCycleCore, enemyCycleGlow } = payload;
  const seg = { player: {}, enemy: {} };
  seg.player.h = await makeSegmentBitmap(0, 0, 'h', CELL, playerSegCore, playerSegGlow);
  seg.player.v = await makeSegmentBitmap(0, 0, 'v', CELL, playerSegCore, playerSegGlow);
  seg.enemy.h  = await makeSegmentBitmap(0, 0, 'h', CELL, enemySegCore, enemySegGlow);
  seg.enemy.v  = await makeSegmentBitmap(0, 0, 'v', CELL, enemySegCore, enemySegGlow);
  const dirs = ['up', 'right', 'down', 'left'];
  const cycle = { player: {}, enemy: {} };
  for (const d of dirs) {
    cycle.player[d] = await makeCycleBitmap(d, playerCycleCore, playerCycleGlow, CELL);
    cycle.enemy[d]  = await makeCycleBitmap(d, enemyCycleCore,  enemyCycleGlow,  CELL);
  }
  const transferables = [];
  for (const who of ['player', 'enemy']) {
    for (const k of ['h', 'v']) {
      if (seg[who][k]) transferables.push(seg[who][k]);
    }
    for (const d of dirs) {
      if (cycle[who][d]) transferables.push(cycle[who][d]);
    }
  }
  try {
    self.postMessage({ type: 'sprites', seg, cycle }, transferables);
  } catch (_) {
    self.postMessage({ type: 'sprites', seg, cycle });
  }
}
self.onmessage = async (e) => {
  const msg = e.data || {};
  if (msg.type === 'buildWalls') {
    const { width, height, CELL, MARGIN, SCALE, N, WALL_CORE, WALL_GLOW } = msg;
    const frames = [];
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const pulse  = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 0.75);
      const glowW  = (14 + pulse * 12);
      const blurPx = (12 + 10 * pulse) * SCALE;
      const tmp = new OffscreenCanvas(Math.max(1, Math.floor((width + MARGIN * 2) * SCALE)),
                                      Math.max(1, Math.floor((height + MARGIN * 2) * SCALE)));
      const tc  = tmp.getContext('2d');
      tc.setTransform(SCALE, 0, 0, SCALE, MARGIN * SCALE, MARGIN * SCALE);
      tc.globalCompositeOperation = 'lighter';
      tc.lineCap = 'round';
      tc.strokeStyle = WALL_GLOW;
      tc.globalAlpha = 1.0;
      tc.lineWidth = glowW;
      const x1 = CELL / 2;
      const y1 = CELL / 2;
      const x2 = width - CELL / 2;
      const y2 = height - CELL / 2;
      tc.beginPath(); tc.moveTo(x1, y1); tc.lineTo(x2, y1); tc.stroke();
      tc.beginPath(); tc.moveTo(x1, y2); tc.lineTo(x2, y2); tc.stroke();
      tc.beginPath(); tc.moveTo(x1, y1); tc.lineTo(x1, y2); tc.stroke();
      tc.beginPath(); tc.moveTo(x2, y1); tc.lineTo(x2, y2); tc.stroke();
      const cv = new OffscreenCanvas(tmp.width, tmp.height);
      const c  = cv.getContext('2d');
      try {
        c.globalCompositeOperation = 'lighter';
      } catch (_) {
      }
      c.globalAlpha = 0.5;
      try {
        c.filter = `blur(${blurPx}px)`;
      } catch (_) {
      }
      c.drawImage(tmp, 0, 0);
      try {
        c.filter = 'none';
      } catch (_) {
      }
      let bmp = null;
      try {
        bmp = await cv.transferToImageBitmap();
      } catch (_) {
        try {
          bmp = await createImageBitmap(cv);
        } catch (__unused) {
          bmp = null;
        }
      }
      frames.push(bmp);
    }
    try {
      self.postMessage({ type: 'wallFrames', frames, meta: { MARGIN: SCALE ? (1 / SCALE) : 0 } }, frames.filter(Boolean));
    } catch (_) {
      self.postMessage({ type: 'wallFrames', frames, meta: {} });
    }
    return;
  }
  if (msg.type === 'buildSprites') {
    try {
      await buildSprites(msg);
    } catch (_) {
    }
    return;
  }
};
