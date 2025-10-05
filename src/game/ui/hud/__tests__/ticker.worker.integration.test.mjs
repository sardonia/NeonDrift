import test from 'node:test';
import assert from 'node:assert/strict';

import { createTickerRenderer } from '../ticker/renderer.js';
import {
  createTickerState,
  createTickerDomQueue,
  createMarqueeCache
} from '../ticker/state.js';

function createMockWorkerAdapter() {
  const listeners = new Map();
  let active = false;
  const posts = [];
  return {
    initCalls: 0,
    get posts() {
      return posts;
    },
    init() {
      this.initCalls += 1;
      active = true;
      return true;
    },
    isActive() {
      return active;
    },
    postMessage(payload) {
      posts.push(payload);
    },
    on(event, handler) {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      const handlers = listeners.get(event);
      handlers.push(handler);
      return () => {
        const list = listeners.get(event);
        if (!list) return;
        const index = list.indexOf(handler);
        if (index >= 0) {
          list.splice(index, 1);
        }
        if (!list.length) {
          listeners.delete(event);
        }
      };
    },
    emit(event, payload) {
      const handlers = listeners.get(event);
      if (!handlers) return;
      for (const handler of handlers.slice()) {
        handler(payload);
      }
    }
  };
}

function createStubContext() {
  return {
    resetTransform() {},
    scale() {},
    save() {},
    restore() {},
    clearRect() {},
    fillText() {},
    measureText(text) {
      return { width: (text ? String(text).length : 0) * 12 };
    },
    shadowColor: '',
    shadowBlur: 0,
    textBaseline: 'middle',
    fillStyle: '#fff',
    globalAlpha: 1,
    font: '16px sans-serif',
    textAlign: 'left'
  };
}

test('worker frame progress updates ticker state without DOM mutations', () => {
  const worker = createMockWorkerAdapter();
  const state = createTickerState();
  const domQueue = createTickerDomQueue();
  const marqueeCache = createMarqueeCache();
  const ctx = createStubContext();
  const infoCanvas = {
    clientWidth: 320,
    clientHeight: 72,
    width: 0,
    height: 0,
    isConnected: true,
    getContext() {
      return ctx;
    }
  };
  const marqueeCanvas = {
    clientWidth: 870,
    clientHeight: 72,
    width: 0,
    height: 0,
    isConnected: true,
    getContext() {
      return ctx;
    }
  };
  const hud = {
    clientWidth: 870,
    clientHeight: 72,
    classList: { add() {}, remove() {} }
  };
  const tickerText = {
    textContent: 'NEON READY',
    setAttribute() {}
  };
  const domCalls = [];
  const dom = {
    get(id) {
      domCalls.push(id);
      switch (id) {
        case 'tickerHud':
          return hud;
        case 'tickerInfoCanvas':
          return infoCanvas;
        case 'tickerCanvas':
          return marqueeCanvas;
        case 'tickerText':
          return tickerText;
        default:
          return null;
      }
    }
  };

  const renderer = createTickerRenderer({
    state,
    dom,
    domQueue,
    marqueeCache,
    metrics: null,
    worker,
    pointerTelemetry: null
  });

  renderer.init({ text: 'RUNNER ONLINE', durationSec: 10 });
  assert.equal(worker.initCalls, 1);
  assert.ok(worker.posts.some((msg) => msg && msg.type === 'frame'));

  domCalls.length = 0;
  worker.emit('ready', { timestamp: 0 });
  worker.emit('layoutProgress', { width: state.width, height: state.height });
  worker.emit('frameProgress', { offset: 240, timestamp: 16, paused: false });

  assert.equal(domCalls.length, 0, 'worker events should not touch DOM lookups');
  assert.equal(state.offset, 240);
  assert.ok(worker.posts.filter((msg) => msg && msg.type === 'frame').length >= 1);
});
