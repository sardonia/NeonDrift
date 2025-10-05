import test from 'node:test';
import assert from 'node:assert/strict';

const modulesPromise = (async () => {
  const rafHandles = new Map();
  let rafSeq = 0;

  if (typeof global.requestAnimationFrame !== 'function') {
    global.requestAnimationFrame = (cb) => {
      rafSeq += 1;
      const id = rafSeq;
      const handle = setTimeout(() => {
        rafHandles.delete(id);
        cb(Date.now());
      }, 4);
      rafHandles.set(id, handle);
      return id;
    };
  }
  if (typeof global.cancelAnimationFrame !== 'function') {
    global.cancelAnimationFrame = (id) => {
      const handle = rafHandles.get(id);
      if (handle) {
        clearTimeout(handle);
        rafHandles.delete(id);
      }
    };
  }

  if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
      addEventListener() {},
      removeEventListener() {},
      requestAnimationFrame: global.requestAnimationFrame,
      cancelAnimationFrame: global.cancelAnimationFrame,
      devicePixelRatio: 1,
      Image: class {},
      document: {
        getElementById() { return null; },
        createElement(tag) { return { tagName: tag }; }
      }
    };
  }
  if (!globalThis.window.document) {
    globalThis.window.document = {
      getElementById() { return null; },
      createElement(tag) { return { tagName: tag }; }
    };
  }
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = globalThis.window.document;
  }

  const stateModule = await import('../ticker/state.js');
  const telemetryModule = await import('../pointer/telemetry.js');
  const countdownModule = await import('../countdown/controller.js');
  const facadeModule = await import('../facade.js');
  const servicesModule = await import('../../../services/index.js');

  return {
    createTickerState: stateModule.createTickerState,
    computeTickerLayout: stateModule.computeTickerLayout,
    resolvePowerupWindow: stateModule.resolvePowerupWindow,
    updateMetricDigits: stateModule.updateMetricDigits,
    createPointerTelemetry: telemetryModule.createPointerTelemetry,
    createCountdownController: countdownModule.createCountdownController,
    createHudService: facadeModule.createHudService,
    TOKENS: servicesModule.TOKENS,
    resetServices: servicesModule.resetServices,
    createScopeContext: servicesModule.createScopeContext,
    registerInstance: servicesModule.registerInstance,
    registerFactory: servicesModule.registerFactory,
    LIFETIMES: servicesModule.LIFETIMES
  };
})();
test('ticker layout adapts to metric digits and available width', async () => {
  const {
    createTickerState,
    computeTickerLayout,
    resolvePowerupWindow,
    updateMetricDigits
  } = await modulesPromise;
  const state = createTickerState();
  const layout = computeTickerLayout(state, 900, 72);
  assert.ok(layout.infoWidth >= state.design.infoMin && layout.infoWidth <= state.design.infoMax);
  assert.ok(layout.marqueeWidth >= state.design.minMarquee);
  const beforeWidth = state.scoreColumnWidth;
  updateMetricDigits(state, 'score', 987654);
  assert.ok(state.scoreColumnWidth > beforeWidth);
  const powerWindow = resolvePowerupWindow(state, layout.infoWidth);
  assert.ok(powerWindow.iconsAreaWidth >= state.design.powerMinWidth || powerWindow.iconsAreaWidth === 0);
});

test('pointer telemetry smooths velocity and flags forced events', async () => {
  const { createPointerTelemetry } = await modulesPromise;
  const telemetry = createPointerTelemetry({ decay: 0.5 });
  telemetry.start();
  telemetry.updateFromEvent({ timeStamp: 10, movementX: 10, movementY: 0, type: 'pointermove' });
  const first = telemetry.getSnapshot();
  assert.ok(first.instant > 0);
  telemetry.updateFromEvent({ timeStamp: 26, movementX: 0, movementY: 8, type: 'pointerdown' });
  const second = telemetry.getSnapshot();
  assert.ok(second.smooth >= first.instant * 0.5);
  assert.equal(second.forced, true);
  telemetry.stop();
});

test('countdown controller schedules completion callbacks', async () => {
  const { createCountdownController } = await modulesPromise;
  const controller = createCountdownController();
  let called = false;
  await new Promise((resolve) => {
    controller.start({ seconds: 0.02, onComplete: () => { called = true; resolve(); } });
  });
  assert.equal(controller.isActive(), false);
  assert.equal(called, true);
  controller.dispose();
});
 
test('hud facade updates ticker text and powerups when dependencies are injected', async () => {
  const { createHudService } = await modulesPromise;
  const { TickerEvent } = await import('../../ticker/events.js');

  const tickerEventsLog = [];
  const fakeEventsFactory = () => {
    const listeners = new Map();
    return {
      on(event, handler) {
        const handlers = listeners.get(event) || [];
        handlers.push(handler);
        listeners.set(event, handlers);
        return () => {
          const current = listeners.get(event);
          if (!current) return;
          const index = current.indexOf(handler);
          if (index >= 0) {
            current.splice(index, 1);
          }
        };
      },
      emit(event, payload) {
        tickerEventsLog.push({ event, payload });
        const handlers = listeners.get(event);
        if (handlers) {
          handlers.slice().forEach((fn) => {
            try { fn(payload); } catch (_) {}
          });
        }
      },
      dispose() {
        listeners.clear();
      }
    };
  };

  const rendererState = { text: null, powerups: [] };
  const fakeRendererFactory = () => ({
    init({ text }) { rendererState.text = text || ''; },
    setText(value) { rendererState.text = value; },
    pause() { rendererState.paused = true; },
    resume() { rendererState.paused = false; },
    updateScore(value) { rendererState.score = value; },
    updateLevel(value) { rendererState.level = value; },
    updatePowerups(list) { rendererState.powerups = Array.isArray(list) ? list.slice() : []; },
    showPauseTicker() { rendererState.pausedText = true; rendererState.text = '***PAUSED***'; },
    hidePauseTicker() { rendererState.pausedText = false; },
    dispose() { rendererState.disposed = true; }
  });

  const fakeWorkerFactory = () => ({
    isActive: () => false,
    isReady: () => true,
    getQueueSize: () => 0,
    dispose() {}
  });

  const tickerText = {
    textContent: 'NEON DRIFT READY',
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  };
  const tickerHud = {
    classList: { add() {}, remove() {} },
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    }
  };
  const doc = {
    created: [],
    getElementById: (id) => (id === 'tickerText' ? tickerText : null),
    createElement(tag) {
      const el = { tagName: tag, className: '', style: {}, setAttribute() {}, appendChild() {} };
      this.created.push(el);
      return el;
    }
  };

  const dom = {
    tickerText,
    tickerHud,
    tickerPowerupsList: { innerHTML: '', setAttribute() {} },
    tickerScore: { textContent: '' },
    tickerLevel: { textContent: '' },
    muteBtn: { __neonBound: true },
    bgm: { muted: true }
  };

  const hud = createHudService({
    dom,
    bus: { on() { return () => {}; } },
    audio: {},
    debugState: { exposeHudGlobal: false },
    document: doc,
    createWorker: fakeWorkerFactory,
    createTickerRenderer: fakeRendererFactory,
    createTickerEvents: fakeEventsFactory,
    tickerSchedule: {
      read: (fn) => fn(),
      mutate: (fn) => fn(),
      microtask: (fn) => fn()
    }
  });

  hud.initHud({ pointerTelemetry: false });
  assert.equal(rendererState.text, 'NEON DRIFT READY');
  assert.equal(tickerText.textContent, 'NEON DRIFT READY');

  const controller = hud.getTickerController();
  controller.setText('MISSION READY');
  assert.equal(rendererState.text, 'MISSION READY');
  assert.equal(tickerText.textContent, 'MISSION READY');
  assert.equal(tickerText.attributes['aria-label'], 'MISSION READY');

  const tickerFacade = hud.getTickerFacade();
  assert.ok(tickerFacade);
  tickerFacade.updatePowerups(['accel']);
  assert.deepEqual(rendererState.powerups, ['accel']);

  hud.updateTickerPowerups(['shield']);
  const powerupEvents = tickerEventsLog.filter((entry) => entry.event === TickerEvent.POWERUPS);
  const powerupEvent = powerupEvents.at(-1);
  assert.ok(powerupEvent, 'powerup channel should emit via injected events');
  assert.deepEqual(powerupEvent.payload.list, ['shield']);

  hud.dispose();
});

test('ticker renderer keeps DOM track visible until canvases draw', async () => {
  const { createHudService } = await modulesPromise;
  const rendererModule = await import('../ticker/renderer.js');
  const trackModule = await import('../tickerTrackFacade.js');

  const originalRaf = global.requestAnimationFrame;
  const originalCancel = global.cancelAnimationFrame;
  const rafHandles = new Map();
  let rafSeq = 0;
  global.requestAnimationFrame = (cb) => {
    rafSeq += 1;
    rafHandles.set(rafSeq, cb);
    return rafSeq;
  };
  global.cancelAnimationFrame = (id) => {
    rafHandles.delete(id);
  };

  function createContextStub(canvas) {
    const ctx = {
      canvas,
      clearCount: 0,
      fillCount: 0,
      save() {},
      restore() {},
      resetTransform() {},
      scale() {},
      clearRect() {
        ctx.clearCount += 1;
      },
      fillRect() {
        ctx.fillCount += 1;
      },
      fillText() {},
      measureText(text) {
        return { width: (text || '').length * 12 };
      },
      createLinearGradient() {
        return { addColorStop() {} };
      }
    };
    return ctx;
  }

  function createCanvasStub({ width = 420, height = 72 } = {}) {
    const style = {};
    let enabled = false;
    const canvas = {
      width,
      height,
      clientWidth: width,
      clientHeight: height,
      style,
      isConnected: true,
      _ctx: null,
      enable() {
        enabled = true;
        return canvas.getContext('2d');
      },
      disable() {
        enabled = false;
      },
      getContext(type) {
        if (type !== '2d' || !enabled) {
          return null;
        }
        if (!canvas._ctx) {
          canvas._ctx = createContextStub(canvas);
        }
        return canvas._ctx;
      }
    };
    return canvas;
  }

  function createElementStub({ className = '', tagName = 'div' } = {}) {
    const el = {
      tagName,
      className,
      style: {},
      attributes: {},
      children: [],
      parentNode: null,
      isConnected: true,
      textContent: '',
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      appendChild(child) {
        if (!child) return child;
        child.parentNode = this;
        child.isConnected = true;
        this.children.push(child);
        return child;
      },
      querySelector(selector) {
        if (!selector) return null;
        const targetClass = selector.startsWith('.') ? selector.slice(1) : selector;
        const queue = [...this.children];
        while (queue.length) {
          const node = queue.shift();
          if (!node) continue;
          const nodeClasses = String(node.className || '').split(/\s+/).filter(Boolean);
          if (selector.startsWith('.')) {
            if (nodeClasses.includes(targetClass)) {
              return node;
            }
          } else if (String(node.tagName || '').toLowerCase() === targetClass.toLowerCase()) {
            return node;
          }
          if (Array.isArray(node.children)) {
            queue.push(...node.children);
          }
        }
        return null;
      },
      classList: {
        add(...names) {
          const current = new Set(String(el.className || '').split(/\s+/).filter(Boolean));
          names.forEach((name) => { if (name) current.add(name); });
          el.className = Array.from(current).join(' ');
        },
        remove(...names) {
          const current = new Set(String(el.className || '').split(/\s+/).filter(Boolean));
          names.forEach((name) => current.delete(name));
          el.className = Array.from(current).join(' ');
        },
        contains(name) {
          return String(el.className || '').split(/\s+/).filter(Boolean).includes(name);
        }
      }
    };
    return el;
  }

  const infoCanvas = createCanvasStub({ width: 320, height: 72 });
  const marqueeCanvas = createCanvasStub({ width: 640, height: 72 });
  const tickerHud = createElementStub({ className: 'ticker-hud', tagName: 'div' });
  const tickerText = createElementStub({ tagName: 'span' });
  tickerText.textContent = 'READY TO RACE';
  const tickerScore = createElementStub({ tagName: 'span' });
  const tickerLevel = createElementStub({ tagName: 'span' });
  const tickerPowerupsList = createElementStub({ tagName: 'ul' });

  const elementsById = {
    tickerHUD: tickerHud,
    tickerInfoCanvas: infoCanvas,
    tickerCanvas: marqueeCanvas,
    tickerText,
    tickerScore,
    tickerLevel,
    tickerPowerupsList
  };

  const documentStub = {
    getElementById(id) {
      return elementsById[id] || null;
    },
    createElement(tag) {
      return createElementStub({ tagName: tag });
    }
  };

  let capturedRenderer = null;
  let capturedTrackFacade = null;
  let capturedState = null;

  const hud = createHudService({
    document: documentStub,
    dom: {
      tickerHud,
      tickerInfoCanvas: infoCanvas,
      tickerCanvas: marqueeCanvas,
      tickerText,
      tickerScore,
      tickerLevel,
      tickerPowerupsList
    },
    createTickerRenderer: (options) => {
      capturedState = options?.state || null;
      const renderer = rendererModule.createTickerRenderer(options);
      capturedRenderer = renderer;
      return renderer;
    },
    createTickerTrack: (options) => {
      const trackFacade = trackModule.createTickerTrackFacade(options);
      capturedTrackFacade = trackFacade;
      return trackFacade;
    },
    createWorker: () => ({
      init: () => true,
      postMessage() {},
      dispose() {}
    })
  });

  try {
    hud.initHud();

    assert.ok(capturedRenderer, 'renderer should be created');
    assert.ok(capturedTrackFacade, 'track facade should be created');

    capturedTrackFacade.ensureReady();

    capturedRenderer.step(0);

    assert.ok(capturedState, 'ticker state should be captured');
    assert.equal(capturedState.canvasAttached, false);
    assert.equal(capturedState.canvasReady, false);
    assert.equal(capturedState.domTrackActive, true);
    assert.equal(capturedState.renderMode, 'dom');

    const infoCtx = infoCanvas.enable();
    const marqueeCtx = marqueeCanvas.enable();
    capturedState.needsLayout = true;
    capturedState.needsRedraw = true;

    capturedRenderer.step(16);

    assert.equal(infoCtx.clearCount > 0, true);
    assert.equal(marqueeCtx.clearCount > 0, true);
    assert.equal(capturedState.canvasAttached, true);
    assert.equal(capturedState.canvasReady, true);
    assert.equal(capturedState.domTrackActive, false);
    assert.equal(capturedState.renderMode, 'canvas');

    const firstInfoClears = infoCtx.clearCount;
    capturedRenderer.step(32);

    assert.equal(infoCtx.clearCount, firstInfoClears + 1);
    assert.equal(capturedState.canvasAttached, true);
    assert.equal(capturedState.canvasReady, true);
    assert.equal(capturedState.domTrackActive, false);
    assert.equal(capturedState.renderMode, 'canvas');

    infoCanvas.disable();
    marqueeCanvas.disable();
    capturedState.needsLayout = true;
    capturedState.needsRedraw = true;

    capturedRenderer.step(64);

    assert.equal(capturedState.canvasReady, false);
    assert.equal(capturedState.domTrackActive, true);
    assert.equal(capturedState.renderMode, 'dom');
  } finally {
    hud.dispose();
    global.requestAnimationFrame = originalRaf;
    global.cancelAnimationFrame = originalCancel;
    rafHandles.clear();
  }
});

test('hud renderer waits for canvas frame before hiding dom ticker', async () => {
  const { createHudService } = await modulesPromise;
  const rendererModule = await import('../ticker/renderer.js');

  const createContextRecorder = (log) => {
    const ctx = {
      canvas: null,
      save() {},
      restore() {},
      resetTransform() {},
      scale() {},
      clearRect() {},
      fillRect: (...args) => {
        log.push({ type: 'fillRect', args });
      },
      fillText: (text, ...rest) => {
        log.push({ type: 'fillText', text, args: [text, ...rest] });
      },
      beginPath() {},
      rect() {},
      clip() {},
      measureText: (text) => ({ width: String(text || '').length * 20 }),
      createLinearGradient: () => ({ addColorStop() {} })
    };
    return ctx;
  };

  const createCanvasStub = (log, { width, height, initialEnabled = true }) => {
    const ctx = createContextRecorder(log);
    let enabled = !!initialEnabled;
    const canvas = {
      clientWidth: width,
      clientHeight: height,
      width: 0,
      height: 0,
      style: {
        width: '',
        height: '',
        setProperty(name, value) {
          this[name] = value;
        }
      },
      isConnected: true,
      getContext(type) {
        if (type === '2d' && enabled) {
          ctx.canvas = canvas;
          return ctx;
        }
        return null;
      }
    };
    return {
      canvas,
      ctx,
      enable() { enabled = true; },
      disable() { enabled = false; }
    };
  };

  const infoCommands = [];
  const marqueeCommands = [];
  const infoCanvasStub = createCanvasStub(infoCommands, { width: 360, height: 72, initialEnabled: false });
  const marqueeCanvasStub = createCanvasStub(marqueeCommands, { width: 600, height: 72, initialEnabled: false });
  const { canvas: infoCanvas } = infoCanvasStub;
  const { canvas: marqueeCanvas } = marqueeCanvasStub;

  const createElement = (tag = 'div') => {
    const element = {
      tagName: String(tag).toUpperCase(),
      className: '',
      style: {
        display: '',
        setProperty(name, value) {
          this[name] = value;
        }
      },
      attributes: {},
      children: [],
      isConnected: false,
      appendChild(child) {
        if (!child) return null;
        child.parentNode = this;
        child.isConnected = true;
        this.children.push(child);
        return child;
      },
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      querySelector(selector) {
        const className = typeof selector === 'string' && selector.startsWith('.')
          ? selector.slice(1)
          : selector;
        if (!className) return null;
        const match = (node) => {
          if (!node) return null;
          const classes = typeof node.className === 'string' ? node.className.split(/\s+/).filter(Boolean) : [];
          if (classes.includes(className)) {
            return node;
          }
          if (Array.isArray(node.children)) {
            for (const child of node.children) {
              const found = match(child);
              if (found) {
                return found;
              }
            }
          }
          return null;
        };
        return match(this);
      }
    };
    return element;
  };

  const tickerHud = createElement('div');
  tickerHud.className = 'ticker-hud';
  tickerHud.classList = { add() {}, remove() {} };
  tickerHud.clientWidth = 960;
  tickerHud.clientHeight = 72;
  tickerHud.offsetWidth = 960;
  tickerHud.offsetHeight = 72;

  const doc = {
    getElementById: () => null,
    createElement(tag) {
      return createElement(tag);
    }
  };

  const tickerText = {
    textContent: 'HUD READY',
    style: {},
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  };

  const dom = {
    tickerHud,
    tickerInfoCanvas: infoCanvas,
    tickerCanvas: marqueeCanvas,
    tickerText,
    tickerPowerupsList: { innerHTML: '', setAttribute() {} },
    tickerScore: { textContent: '' },
    tickerLevel: { textContent: '' },
    muteBtn: { addEventListener() {} },
    bgm: { muted: false }
  };

  let detachScroll = null;
  const scrollEvents = [];
  let capturedState = null;

  const hud = createHudService({
    dom,
    bus: { on() { return () => {}; } },
    audio: {},
    debugState: { exposeHudGlobal: false },
    document: doc,
    createWorker: () => ({
      isActive: () => false,
      isReady: () => true,
      getQueueSize: () => 0,
      dispose() {}
    }),
    tickerSchedule: {
      read: (fn) => fn(),
      mutate: (fn) => fn(),
      microtask: (fn) => {
        if (typeof queueMicrotask === 'function') {
          queueMicrotask(fn);
        } else {
          Promise.resolve().then(fn);
        }
      }
    },
    createTickerRenderer: (options) => {
      capturedState = options?.state || null;
      if (options?.scrollEmitter && typeof options.scrollEmitter.on === 'function') {
        detachScroll = options.scrollEmitter.on((payload) => {
          scrollEvents.push(payload);
        });
      }
      return rendererModule.createTickerRenderer(options);
    }
  });

  hud.initHud({ pointerTelemetry: false });

  const track = tickerHud.querySelector('.ticker-track');
  assert.ok(track, 'dom ticker track should be created');
  assert.notEqual(track.style.display, 'none', 'dom ticker should remain visible before first canvas frame');

  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.ok(scrollEvents.length > 0, 'dom ticker should publish scroll intents while canvases are unavailable');
  assert.equal(infoCommands.length, 0, 'info canvas should not draw while contexts are unavailable');
  assert.equal(marqueeCommands.length, 0, 'marquee canvas should not draw while contexts are unavailable');
  assert.equal(capturedState.renderMode, 'dom', 'render mode should remain dom until canvas draws');

  infoCanvasStub.enable();
  marqueeCanvasStub.enable();

  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.ok(infoCommands.some((entry) => entry.type === 'fillRect'), 'info canvas should draw panel background');
  assert.ok(infoCommands.some((entry) => entry.type === 'fillText' && /SCORE|LEVEL|POWER UPS/.test(entry.text)), 'info canvas should render labels');
  assert.ok(marqueeCommands.some((entry) => entry.type === 'fillRect'), 'marquee canvas should draw background');
  assert.ok(marqueeCommands.some((entry) => entry.type === 'fillText' && /HUD READY/.test(entry.text)), 'marquee canvas should render ticker text');
  assert.equal(track.style.display, 'none', 'dom ticker should hide after successful canvas frame');
  const scrollEventsAfterFrame = scrollEvents.length;
  await new Promise((resolve) => setTimeout(resolve, 20));
  const scrollEventsFinal = scrollEvents.length;
  assert.equal(scrollEventsFinal, scrollEventsAfterFrame, 'scroll intents should pause once canvas rendering takes over');
  assert.ok(capturedState && capturedState.canvasAttached, 'ticker state should report canvas attachment after first frame');
  assert.ok(capturedState && capturedState.canvasReady, 'ticker state should report canvas readiness after first frame');
  assert.equal(capturedState.domTrackActive, false, 'dom ticker should be inactive once canvas attached');
  assert.equal(capturedState.renderMode, 'canvas', 'render mode should switch to canvas once drawing succeeds');

  hud.dispose();
  if (typeof detachScroll === 'function') {
    detachScroll();
  }
});

test('disposing ticker controller keeps dom ticker scroll intents active', async () => {
  const { createHudService } = await modulesPromise;
  const rendererModule = await import('../ticker/renderer.js');

  function createElementStub({ className = '', tagName = 'div' } = {}) {
    const el = {
      tagName,
      className,
      style: {},
      attributes: {},
      children: [],
      parentNode: null,
      isConnected: true,
      textContent: '',
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      getAttribute(name) {
        return this.attributes[name];
      },
      appendChild(child) {
        if (!child) return child;
        child.parentNode = this;
        child.isConnected = true;
        this.children.push(child);
        return child;
      },
      removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) {
          this.children.splice(index, 1);
        }
        if (child) {
          child.parentNode = null;
          child.isConnected = false;
        }
        return child;
      },
      querySelector(selector) {
        if (!selector) return null;
        const targetClass = selector.startsWith('.') ? selector.slice(1) : selector;
        const queue = [...this.children];
        while (queue.length) {
          const node = queue.shift();
          if (!node) continue;
          const nodeClasses = String(node.className || '').split(/\s+/).filter(Boolean);
          if (selector.startsWith('.')) {
            if (nodeClasses.includes(targetClass)) {
              return node;
            }
          } else if (String(node.tagName || '').toLowerCase() === targetClass.toLowerCase()) {
            return node;
          }
          if (Array.isArray(node.children)) {
            queue.push(...node.children);
          }
        }
        return null;
      },
      classList: {
        add(...names) {
          const current = new Set(String(el.className || '').split(/\s+/).filter(Boolean));
          names.forEach((name) => { if (name) current.add(name); });
          el.className = Array.from(current).join(' ');
        },
        remove(...names) {
          const current = new Set(String(el.className || '').split(/\s+/).filter(Boolean));
          names.forEach((name) => current.delete(name));
          el.className = Array.from(current).join(' ');
        },
        contains(name) {
          return String(el.className || '').split(/\s+/).filter(Boolean).includes(name);
        }
      }
    };
    return el;
  }

  function createCanvasStub({ width = 420, height = 72 } = {}) {
    return {
      width,
      height,
      clientWidth: width,
      clientHeight: height,
      style: {},
      isConnected: true,
      classList: { add() {}, remove() {}, contains() { return false; } },
      getContext() {
        return null;
      }
    };
  }

  const tickerHud = createElementStub({ className: 'ticker-hud', tagName: 'div' });
  const tickerText = createElementStub({ tagName: 'span' });
  const infoCanvas = createCanvasStub({ width: 320, height: 72 });
  const marqueeCanvas = createCanvasStub({ width: 640, height: 72 });

  const elementsById = {
    tickerHUD: tickerHud,
    tickerText,
    tickerInfoCanvas: infoCanvas,
    tickerCanvas: marqueeCanvas
  };

  const doc = {
    getElementById(id) {
      return elementsById[id] || null;
    },
    createElement(tag) {
      return createElementStub({ tagName: tag });
    }
  };

  const dom = {
    tickerHud,
    tickerText,
    tickerInfoCanvas: infoCanvas,
    tickerCanvas: marqueeCanvas,
    tickerPowerupsList: { innerHTML: '', setAttribute() {} },
    tickerScore: { textContent: '' },
    tickerLevel: { textContent: '' },
    muteBtn: { addEventListener() {}, removeEventListener() {}, classList: { add() {}, remove() {}, contains() { return false; } } },
    bgm: { muted: false }
  };

  const scrollEvents = [];
  let detachScroll = null;

  const hud = createHudService({
    dom,
    bus: { on() { return () => {}; } },
    audio: {},
    debugState: { exposeHudGlobal: false },
    document: doc,
    createWorker: () => ({
      isActive: () => false,
      isReady: () => true,
      getQueueSize: () => 0,
      dispose() {}
    }),
    tickerSchedule: {
      read: (fn) => fn(),
      mutate: (fn) => fn(),
      microtask: (fn) => fn()
    },
    createTickerRenderer: (options) => {
      if (options?.scrollEmitter && typeof options.scrollEmitter.on === 'function') {
        detachScroll = options.scrollEmitter.on((payload) => {
          scrollEvents.push(payload);
        });
      }
      return rendererModule.createTickerRenderer(options);
    }
  });

  hud.initHud({ pointerTelemetry: false });

  await new Promise((resolve) => setTimeout(resolve, 10));
  const eventsBeforeDispose = scrollEvents.length;

  const controller = hud.getTickerController();
  controller.dispose();

  await new Promise((resolve) => setTimeout(resolve, 30));
  const eventsAfterDispose = scrollEvents.length;

  const track = tickerHud.querySelector('.ticker-track');
  assert.ok(track, 'dom ticker track should remain after controller dispose');
  assert.ok(eventsAfterDispose > eventsBeforeDispose, 'scroll intents should continue after controller dispose');

  hud.dispose();
  if (typeof detachScroll === 'function') {
    detachScroll();
  }
});

test('disposing ticker orchestrator keeps dom ticker scroll intents active', async () => {
  const { createHudService } = await modulesPromise;
  const rendererModule = await import('../ticker/renderer.js');
  const trackModule = await import('../tickerTrackFacade.js');

  function createElementStub({ className = '', tagName = 'div' } = {}) {
    const el = {
      tagName,
      className,
      style: {},
      attributes: {},
      children: [],
      parentNode: null,
      isConnected: true,
      textContent: '',
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      getAttribute(name) {
        return this.attributes[name];
      },
      appendChild(child) {
        if (!child) return child;
        child.parentNode = this;
        child.isConnected = true;
        this.children.push(child);
        return child;
      },
      removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) {
          this.children.splice(index, 1);
        }
        if (child) {
          child.parentNode = null;
          child.isConnected = false;
        }
        return child;
      },
      querySelector(selector) {
        if (!selector) return null;
        const targetClass = selector.startsWith('.') ? selector.slice(1) : selector;
        const queue = [...this.children];
        while (queue.length) {
          const node = queue.shift();
          if (!node) continue;
          const nodeClasses = String(node.className || '').split(/\s+/).filter(Boolean);
          if (selector.startsWith('.')) {
            if (nodeClasses.includes(targetClass)) {
              return node;
            }
          } else if (String(node.tagName || '').toLowerCase() === targetClass.toLowerCase()) {
            return node;
          }
          if (Array.isArray(node.children)) {
            queue.push(...node.children);
          }
        }
        return null;
      },
      classList: {
        add(...names) {
          const current = new Set(String(el.className || '').split(/\s+/).filter(Boolean));
          names.forEach((name) => { if (name) current.add(name); });
          el.className = Array.from(current).join(' ');
        },
        remove(...names) {
          const current = new Set(String(el.className || '').split(/\s+/).filter(Boolean));
          names.forEach((name) => current.delete(name));
          el.className = Array.from(current).join(' ');
        },
        contains(name) {
          return String(el.className || '').split(/\s+/).filter(Boolean).includes(name);
        }
      }
    };
    return el;
  }

  function createCanvasStub({ width = 420, height = 72 } = {}) {
    return {
      width,
      height,
      clientWidth: width,
      clientHeight: height,
      style: {},
      isConnected: true,
      classList: { add() {}, remove() {}, contains() { return false; } },
      getContext() {
        return null;
      }
    };
  }

  const tickerHud = createElementStub({ className: 'ticker-hud', tagName: 'div' });
  const tickerText = createElementStub({ tagName: 'span' });
  const infoCanvas = createCanvasStub({ width: 320, height: 72 });
  const marqueeCanvas = createCanvasStub({ width: 640, height: 72 });

  const elementsById = {
    tickerHUD: tickerHud,
    tickerText,
    tickerInfoCanvas: infoCanvas,
    tickerCanvas: marqueeCanvas
  };

  const doc = {
    getElementById(id) {
      return elementsById[id] || null;
    },
    createElement(tag) {
      return createElementStub({ tagName: tag });
    }
  };

  const dom = {
    tickerHud,
    tickerText,
    tickerInfoCanvas: infoCanvas,
    tickerCanvas: marqueeCanvas,
    tickerPowerupsList: { innerHTML: '', setAttribute() {} },
    tickerScore: { textContent: '' },
    tickerLevel: { textContent: '' },
    muteBtn: { addEventListener() {}, removeEventListener() {}, classList: { add() {}, remove() {}, contains() { return false; } } },
    bgm: { muted: false }
  };

  const scrollEvents = [];
  let detachScroll = null;
  let trackFacadeDisposeCount = 0;
  let capturedState = null;

  const hud = createHudService({
    dom,
    bus: { on() { return () => {}; } },
    audio: {},
    debugState: { exposeHudGlobal: false },
    document: doc,
    createWorker: () => ({
      isActive: () => false,
      isReady: () => true,
      getQueueSize: () => 0,
      dispose() {}
    }),
    tickerSchedule: {
      read: (fn) => fn(),
      mutate: (fn) => fn(),
      microtask: (fn) => fn()
    },
    createTickerRenderer: (options) => {
      capturedState = options?.state || null;
      if (options?.scrollEmitter && typeof options.scrollEmitter.on === 'function') {
        detachScroll = options.scrollEmitter.on((payload) => {
          scrollEvents.push(payload);
        });
      }
      return rendererModule.createTickerRenderer(options);
    },
    createTickerTrack: (options) => {
      const facade = trackModule.createTickerTrackFacade(options);
      const originalDispose = typeof facade.dispose === 'function' ? facade.dispose.bind(facade) : null;
      facade.dispose = () => {
        trackFacadeDisposeCount += 1;
        if (originalDispose) {
          return originalDispose();
        }
        return undefined;
      };
      return facade;
    }
  });

  hud.initHud({ pointerTelemetry: false });

  await new Promise((resolve) => setTimeout(resolve, 10));
  const eventsBeforeDispose = scrollEvents.length;

  const tickerFacade = hud.getTickerFacade();
  tickerFacade.dispose();
  const eventsAfterDisposeSync = scrollEvents.length;

  assert.ok(
    capturedState && capturedState.renderMode === 'dom' && capturedState.trackVisible !== false,
    'ticker state should remain in dom render mode after orchestrator dispose'
  );

  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 40));
  const eventsAfterDispose = scrollEvents.length;

  assert.equal(trackFacadeDisposeCount, 0, 'track facade should remain after orchestrator dispose');
  assert.ok(eventsAfterDisposeSync >= eventsBeforeDispose, 'scroll intents should not regress during orchestrator dispose');
  assert.ok(
    eventsAfterDispose > eventsAfterDisposeSync,
    `scroll intents should continue after orchestrator dispose (counts: ${eventsAfterDisposeSync} -> ${eventsAfterDispose})`
  );

  hud.dispose();

  assert.ok(trackFacadeDisposeCount > 0, 'track facade should dispose during hud teardown');

  if (typeof detachScroll === 'function') {
    detachScroll();
  }
});

test('ticker defers canvas takeover until a frame renders successfully', async () => {
  const { createHudService } = await modulesPromise;
  const rendererModule = await import('../ticker/renderer.js');
  const trackModule = await import('../tickerTrackFacade.js');

  const createContextStub = () => {
    const record = { clears: 0, fills: 0, texts: [] };
    const ctx = {
      canvas: null,
      save() {},
      restore() {},
      resetTransform() {},
      scale() {},
      beginPath() {},
      rect() {},
      clip() {},
      clearRect: () => { record.clears += 1; },
      fillRect: () => { record.fills += 1; },
      fillText: (text) => { record.texts.push(text); },
      measureText: (text) => ({ width: String(text || '').length * 18 }),
      createLinearGradient: () => ({ addColorStop() {} })
    };
    return { ctx, record };
  };

  const createCanvasStub = ({ width, height, initiallyEnabled = false }) => {
    const { ctx, record } = createContextStub();
    let enabled = !!initiallyEnabled;
    const canvas = {
      clientWidth: width,
      clientHeight: height,
      width: 0,
      height: 0,
      style: {
        width: '',
        height: '',
        setProperty(name, value) {
          this[name] = value;
        }
      },
      isConnected: true,
      parentNode: null,
      getContext(type) {
        if (type !== '2d' || !enabled) {
          return null;
        }
        ctx.canvas = canvas;
        return ctx;
      }
    };
    return {
      canvas,
      ctx,
      record,
      enable() { enabled = true; },
      disable() { enabled = false; }
    };
  };

  const createElement = (tag = 'div') => {
    const element = {
      tagName: String(tag).toUpperCase(),
      className: '',
      style: {
        display: '',
        setProperty(name, value) {
          this[name] = value;
        }
      },
      attributes: {},
      children: [],
      parentNode: null,
      isConnected: false,
      appendChild(child) {
        if (!child) return null;
        child.parentNode = this;
        child.isConnected = true;
        this.children.push(child);
        return child;
      },
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      querySelector(selector) {
        const className = typeof selector === 'string' && selector.startsWith('.')
          ? selector.slice(1)
          : selector;
        if (!className) return null;
        const search = (node) => {
          if (!node) return null;
          const classes = typeof node.className === 'string'
            ? node.className.split(/\s+/).filter(Boolean)
            : [];
          if (classes.includes(className)) {
            return node;
          }
          if (Array.isArray(node.children)) {
            for (const child of node.children) {
              const found = search(child);
              if (found) return found;
            }
          }
          return null;
        };
        return search(this);
      }
    };
    return element;
  };

  const infoStub = createCanvasStub({ width: 320, height: 72, initiallyEnabled: false });
  const marqueeStub = createCanvasStub({ width: 520, height: 72, initiallyEnabled: false });

  const tickerHud = createElement('div');
  tickerHud.className = 'ticker-hud';
  tickerHud.clientWidth = 960;
  tickerHud.clientHeight = 72;
  tickerHud.offsetWidth = 960;
  tickerHud.offsetHeight = 72;
  tickerHud.classList = { add() {}, remove() {} };
  tickerHud.appendChild(infoStub.canvas);
  tickerHud.appendChild(marqueeStub.canvas);

  const tickerText = createElement('span');
  tickerText.textContent = 'DOM MARQUEE';
  tickerText.setAttribute = function setAttribute(name, value) { this.attributes[name] = value; };

  const tickerScore = createElement('span');
  const tickerLevel = createElement('span');
  const tickerPowerupsList = createElement('ul');

  const elementsById = {
    tickerHUD: tickerHud,
    tickerInfoCanvas: infoStub.canvas,
    tickerCanvas: marqueeStub.canvas,
    tickerText,
    tickerScore,
    tickerLevel,
    tickerPowerupsList
  };

  const documentStub = {
    getElementById(id) {
      return elementsById[id] || null;
    },
    createElement(tag) {
      return createElement(tag);
    }
  };

  const dom = {
    tickerHud,
    tickerInfoCanvas: infoStub.canvas,
    tickerCanvas: marqueeStub.canvas,
    tickerText,
    tickerScore,
    tickerLevel,
    tickerPowerupsList,
    muteBtn: { addEventListener() {} },
    bgm: { muted: false }
  };

  let capturedRenderer = null;
  let capturedState = null;
  let capturedTrack = null;

  const hud = createHudService({
    document: documentStub,
    dom,
    bus: { on() { return () => {}; } },
    audio: {},
    debugState: { exposeHudGlobal: false },
    createWorker: () => ({
      init: () => true,
      postMessage() {},
      dispose() {},
      isActive: () => false,
      isReady: () => true,
      getQueueSize: () => 0
    }),
    tickerSchedule: {
      read: (fn) => fn(),
      mutate: (fn) => fn(),
      microtask: (fn) => fn()
    },
    createTickerRenderer: (options) => {
      capturedState = options?.state || null;
      const renderer = rendererModule.createTickerRenderer(options);
      capturedRenderer = renderer;
      return renderer;
    },
    createTickerTrack: (options) => {
      const facade = trackModule.createTickerTrackFacade(options);
      capturedTrack = facade;
      return facade;
    }
  });

  hud.initHud({ pointerTelemetry: false });
  capturedTrack.ensureReady();

  capturedRenderer.step(0);

  const track = tickerHud.querySelector('.ticker-track');
  assert.ok(track, 'dom ticker track should exist');
  assert.equal(track.style.display, '', 'dom ticker should remain visible before canvas contexts succeed');
  assert.equal(capturedState.canvasReady, false);
  assert.equal(capturedState.domTrackActive, true);
  assert.equal(capturedState.renderMode, 'dom');
  assert.equal(infoStub.record.clears, 0);
  assert.equal(marqueeStub.record.clears, 0);

  infoStub.enable();
  marqueeStub.enable();

  capturedState.needsLayout = true;
  capturedState.needsRedraw = true;

  capturedRenderer.step(16);

  assert.ok(infoStub.record.clears > 0, 'info canvas should clear once contexts are available');
  assert.ok(marqueeStub.record.clears > 0, 'marquee canvas should clear once contexts are available');
  assert.equal(capturedState.canvasReady, true);
  assert.equal(capturedState.canvasAttached, true);
  assert.equal(capturedState.domTrackActive, false);
  assert.equal(capturedState.renderMode, 'canvas');
  assert.equal(track.style.display, 'none', 'dom ticker should hide after canvas frame draws');

  const infoClearsAfterFirstFrame = infoStub.record.clears;
  const marqueeClearsAfterFirstFrame = marqueeStub.record.clears;

  capturedRenderer.step(32);

  assert.equal(infoStub.record.clears, infoClearsAfterFirstFrame + 1, 'info canvas should continue animating');
  assert.equal(marqueeStub.record.clears, marqueeClearsAfterFirstFrame + 1, 'marquee canvas should continue animating');
  assert.equal(capturedState.canvasReady, true);
  assert.equal(capturedState.domTrackActive, false);
  assert.equal(capturedState.renderMode, 'canvas');

  hud.dispose();
});

test('ticker canvas mode activates with marquee canvas only', async () => {
  const { createHudService } = await modulesPromise;
  const rendererModule = await import('../ticker/renderer.js');
  const trackModule = await import('../tickerTrackFacade.js');

  const createContextStub = () => {
    const record = { clears: 0, fills: 0, texts: [] };
    const ctx = {
      canvas: null,
      save() {},
      restore() {},
      resetTransform() {},
      scale() {},
      beginPath() {},
      rect() {},
      clip() {},
      clearRect: () => { record.clears += 1; },
      fillRect: () => { record.fills += 1; },
      fillText: (text) => { record.texts.push(text); },
      measureText: (text) => ({ width: String(text || '').length * 18 }),
      createLinearGradient: () => ({ addColorStop() {} })
    };
    return { ctx, record };
  };

  const createCanvasStub = ({ width, height, initiallyEnabled = false }) => {
    const { ctx, record } = createContextStub();
    let enabled = !!initiallyEnabled;
    const canvas = {
      clientWidth: width,
      clientHeight: height,
      width: 0,
      height: 0,
      style: {
        width: '',
        height: '',
        setProperty(name, value) {
          this[name] = value;
        }
      },
      isConnected: true,
      parentNode: null,
      getContext(type) {
        if (type !== '2d' || !enabled) {
          return null;
        }
        ctx.canvas = canvas;
        return ctx;
      }
    };
    return {
      canvas,
      ctx,
      record,
      enable() { enabled = true; },
      disable() { enabled = false; }
    };
  };

  const createElement = (tag = 'div') => {
    const element = {
      tagName: String(tag).toUpperCase(),
      className: '',
      style: {
        display: '',
        setProperty(name, value) {
          this[name] = value;
        }
      },
      attributes: {},
      children: [],
      parentNode: null,
      isConnected: false,
      appendChild(child) {
        if (!child) return null;
        child.parentNode = this;
        child.isConnected = true;
        this.children.push(child);
        return child;
      },
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      querySelector(selector) {
        const className = typeof selector === 'string' && selector.startsWith('.')
          ? selector.slice(1)
          : selector;
        if (!className) return null;
        const search = (node) => {
          if (!node) return null;
          const classes = typeof node.className === 'string'
            ? node.className.split(/\s+/).filter(Boolean)
            : [];
          if (classes.includes(className)) {
            return node;
          }
          if (Array.isArray(node.children)) {
            for (const child of node.children) {
              const found = search(child);
              if (found) return found;
            }
          }
          return null;
        };
        return search(this);
      }
    };
    return element;
  };

  const marqueeStub = createCanvasStub({ width: 640, height: 72, initiallyEnabled: false });

  const tickerHud = createElement('div');
  tickerHud.className = 'ticker-hud';
  tickerHud.clientWidth = 870;
  tickerHud.clientHeight = 72;
  tickerHud.offsetWidth = 870;
  tickerHud.offsetHeight = 72;
  tickerHud.classList = { add() {}, remove() {} };
  tickerHud.appendChild(marqueeStub.canvas);

  const tickerText = createElement('span');
  tickerText.textContent = 'DOM MODE';
  tickerText.setAttribute = function setAttribute(name, value) { this.attributes[name] = value; };

  const tickerScore = createElement('span');
  const tickerLevel = createElement('span');
  const tickerPowerupsList = createElement('ul');

  const elementsById = {
    tickerHUD: tickerHud,
    tickerCanvas: marqueeStub.canvas,
    tickerText,
    tickerScore,
    tickerLevel,
    tickerPowerupsList
  };

  const documentStub = {
    getElementById(id) {
      return elementsById[id] || null;
    },
    createElement(tag) {
      return createElement(tag);
    }
  };

  const dom = {
    tickerHud,
    tickerCanvas: marqueeStub.canvas,
    tickerText,
    tickerScore,
    tickerLevel,
    tickerPowerupsList,
    muteBtn: { addEventListener() {} },
    bgm: { muted: false }
  };

  let capturedRenderer = null;
  let capturedState = null;
  let capturedTrack = null;

  const hud = createHudService({
    document: documentStub,
    dom,
    bus: { on() { return () => {}; } },
    audio: {},
    debugState: { exposeHudGlobal: false },
    createWorker: () => ({
      init: () => true,
      postMessage() {},
      dispose() {},
      isActive: () => false,
      isReady: () => true,
      getQueueSize: () => 0
    }),
    tickerSchedule: {
      read: (fn) => fn(),
      mutate: (fn) => fn(),
      microtask: (fn) => fn()
    },
    createTickerRenderer: (options) => {
      capturedState = options?.state || null;
      const renderer = rendererModule.createTickerRenderer(options);
      capturedRenderer = renderer;
      return renderer;
    },
    createTickerTrack: (options) => {
      const facade = trackModule.createTickerTrackFacade(options);
      capturedTrack = facade;
      return facade;
    }
  });

  hud.initHud({ pointerTelemetry: false });
  capturedTrack.ensureReady();

  capturedRenderer.step(0);

  const track = tickerHud.querySelector('.ticker-track');
  assert.ok(track, 'dom ticker track should exist');
  assert.equal(track.style.display, '', 'dom ticker should remain visible before canvas context succeeds');
  assert.equal(capturedState.canvasReady, false);
  assert.equal(capturedState.renderMode, 'dom');

  marqueeStub.enable();

  capturedState.needsLayout = true;
  capturedState.needsRedraw = true;

  capturedRenderer.step(16);

  assert.ok(marqueeStub.record.clears > 0, 'marquee canvas should clear once context is available');
  assert.ok(marqueeStub.record.texts.length > 0, 'marquee canvas should draw ticker text');
  assert.equal(capturedState.canvasReady, true);
  assert.equal(capturedState.canvasAttached, true);
  assert.equal(capturedState.domTrackActive, false);
  assert.equal(capturedState.renderMode, 'canvas');
  assert.equal(track.style.display, 'none', 'dom ticker should hide after marquee frame draws');

  const marqueeClearsAfterFirstFrame = marqueeStub.record.clears;

  capturedRenderer.step(32);

  assert.equal(marqueeStub.record.clears, marqueeClearsAfterFirstFrame + 1, 'marquee canvas should continue animating without info canvas');
  assert.equal(capturedState.canvasReady, true);
  assert.equal(capturedState.renderMode, 'canvas');

  hud.dispose();
});
 
test('hud service resolves from scope context and disposes with scope', async () => {
  const {
    TOKENS,
    resetServices,
    createScopeContext,
    registerInstance,
    registerFactory,
    LIFETIMES,
    createHudService
  } = await modulesPromise;
  resetServices();
  const dom = {
    tickerCanvas: {
      clientWidth: 870,
      clientHeight: 72,
      width: 0,
      height: 0,
      isConnected: true,
      getContext: () => ({
        resetTransform() {},
        scale() {},
        save() {},
        restore() {},
        clearRect() {},
        fillText() {},
        measureText: () => ({ width: 100 }),
        shadowColor: '',
        shadowBlur: 0,
        textBaseline: '',
        fillStyle: ''
      })
    },
    tickerScore: { textContent: '' },
    tickerLevel: { textContent: '' },
    tickerPowerupsList: { innerHTML: '', setAttribute() {} },
    tickerHud: { classList: { add() {}, remove() {} } },
    muteBtn: { addEventListener() {} }
  };
  const baseConfig = {
    dom,
    bus: {},
    audio: {},
    debugState: { exposeHudGlobal: false },
    theme: {},
    rng: {},
    collisions: {}
  };
  registerInstance(TOKENS.DOM, baseConfig.dom);
  registerInstance(TOKENS.BUS, baseConfig.bus);
  registerInstance(TOKENS.AUDIO, baseConfig.audio);
  registerInstance(TOKENS.DEBUG_STATE, baseConfig.debugState);
  registerInstance(TOKENS.THEME, baseConfig.theme);
  registerInstance(TOKENS.RNG, baseConfig.rng);
  registerInstance(TOKENS.COLLISIONS, baseConfig.collisions);
  registerFactory(TOKENS.HUD, () => createHudService(baseConfig), {
    lifetime: LIFETIMES.SCOPED,
    force: true
  });
  const scope = createScopeContext();
  const hud = scope.get(TOKENS.HUD);
  assert.ok(hud);
  let disposed = false;
  const originalDispose = hud.dispose;
  hud.dispose = () => { disposed = true; if (typeof originalDispose === 'function') originalDispose.call(hud); };
  scope.dispose();
  assert.equal(disposed, true);
  resetServices();
});
