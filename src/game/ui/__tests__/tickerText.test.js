const test = require('node:test');
const assert = require('node:assert/strict');

const previousDocument = globalThis.document;
const previousWindow = globalThis.window;

function restoreGlobals() {
  if (typeof previousDocument === 'undefined') {
    delete globalThis.document;
  } else {
    globalThis.document = previousDocument;
  }
  if (typeof previousWindow === 'undefined') {
    delete globalThis.window;
  } else {
    globalThis.window = previousWindow;
  }
}

function createTestScheduler() {
  return {
    read: (fn) => fn(),
    mutate: (fn) => fn(),
    microtask: (fn) => fn()
  };
}

function createNoopTrackFacade() {
  return {
    applyText() {},
    dispose() {}
  };
}

test.beforeEach(() => {
  globalThis.document = { getElementById: () => null, createElement: () => ({}) };
  globalThis.window = {};
});

test.after(() => {
  restoreGlobals();
});

test('controller setText delegates to HUD facade when available', async () => {
  const { createTickerTextController } = await import('../tickerText.js');
  const { createTickerEvents } = await import('../ticker/events.js');

  const events = createTickerEvents();
  let captured = null;
  const controller = createTickerTextController({
    hud: {
      setTickerText(value) {
        captured = value;
      }
    },
    dom: {
      getTickerText: () => null,
      getTickerHud: () => null
    },
    document: { getElementById: () => null, createElement: () => ({}) },
    tickerTrackFacade: createNoopTrackFacade(),
    schedule: createTestScheduler(),
    events
  });

  controller.setText('MISSION READY');

  assert.strictEqual(captured, 'MISSION READY');
});

test('controller falls back to DOM default when HUD unavailable', async () => {
  const { createTickerTextController, DEFAULT_TICKER_TEXT } = await import('../tickerText.js');
  const { createTickerEvents } = await import('../ticker/events.js');

  const attributes = {};
  const tickerNode = {
    textContent: '',
    setAttribute(name, value) {
      attributes[name] = value;
    }
  };

  const doc = {
    getElementById: (id) => (id === 'tickerText' ? tickerNode : null),
    createElement: () => ({ appendChild() {}, setAttribute() {}, style: {} })
  };

  let warned = false;
  const controller = createTickerTextController({
    dom: {
      getTickerText: () => tickerNode,
      getTickerHud: () => null
    },
    document: doc,
    tickerTrackFacade: createNoopTrackFacade(),
    schedule: createTestScheduler(),
    events: createTickerEvents(),
    warn: () => {
      warned = true;
    }
  });

  controller.setText('');

  assert.strictEqual(tickerNode.textContent, DEFAULT_TICKER_TEXT);
  assert.strictEqual(attributes['aria-label'], DEFAULT_TICKER_TEXT.replace(/\s+/g, ' ').trim());
  assert.ok(warned);
});

test('controller subscribes to ticker events for DOM updates', async () => {
  const { createTickerTextController, DEFAULT_TICKER_TEXT } = await import('../tickerText.js');
  const { createTickerEvents, TickerEvent } = await import('../ticker/events.js');

  const tickerNode = {
    textContent: '',
    setAttribute() {},
    style: {}
  };

  const events = createTickerEvents();
  const controller = createTickerTextController({
    dom: {
      getTickerText: () => tickerNode,
      getTickerHud: () => null
    },
    document: {
      getElementById: () => null,
      createElement: () => ({ appendChild() {}, setAttribute() {}, style: {} })
    },
    tickerTrackFacade: createNoopTrackFacade(),
    schedule: createTestScheduler(),
    events
  });

  controller.subscribe();

  events.emit(TickerEvent.TEXT, { text: 'GRID ONLINE' });
  assert.strictEqual(tickerNode.textContent, 'GRID ONLINE');

  events.emit(TickerEvent.TEXT, {});
  assert.strictEqual(tickerNode.textContent, DEFAULT_TICKER_TEXT);

  controller.unsubscribe();
});

function createMockElement(tagName = 'div') {
  return {
    tagName,
    className: '',
    children: [],
    parentNode: null,
    attributes: {},
    style: {},
    dataset: {},
    appendChild(child) {
      if (child) {
        child.parentNode = this;
        this.children.push(child);
      }
      return child;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
      if (name === 'class' || name === 'className') {
        this.className = value;
      }
      if (name.startsWith('data-')) {
        const key = name.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        this.dataset[key] = value;
      }
    },
    getAttribute(name) {
      return this.attributes[name];
    },
    querySelector(selector) {
      if (!selector || selector[0] !== '.') {
        return null;
      }
      const className = selector.slice(1);
      const stack = [...this.children];
      while (stack.length) {
        const node = stack.shift();
        if (typeof node.className === 'string' && node.className.split(/\s+/).includes(className)) {
          return node;
        }
        if (node.children && node.children.length) {
          stack.push(...node.children);
        }
      }
      return null;
    }
  };
}

function countClass(root, className) {
  if (!root) {
    return 0;
  }
  let count = 0;
  const stack = [root];
  while (stack.length) {
    const node = stack.shift();
    if (typeof node.className === 'string' && node.className.split(/\s+/).includes(className)) {
      count += 1;
    }
    if (node.children && node.children.length) {
      stack.push(...node.children);
    }
  }
  return count;
}

test('controller reuses an existing ticker track scaffold', async () => {
  const { createTickerTextController, createTickerTrackFacade } = await import('../tickerText.js');

  const doc = {
    getElementById: () => null,
    createElement: (tag) => createMockElement(tag)
  };

  const tickerNode = {
    textContent: '',
    setAttribute() {}
  };

  const hud = createMockElement('div');
  const track = createMockElement('div');
  track.className = 'ticker-track';
  track.style.pointerEvents = 'auto';
  track.style.display = 'block';
  track.setAttribute('data-driven', 'false');
  hud.appendChild(track);

  const inner = createMockElement('div');
  inner.className = 'ticker-track-inner';
  inner.style.pointerEvents = 'auto';
  track.appendChild(inner);

  const primary = createMockElement('span');
  primary.className = 'ticker-text ticker-text--primary';
  inner.appendChild(primary);

  const repeat = createMockElement('span');
  repeat.className = 'ticker-text ticker-text--repeat';
  repeat.style.display = 'block';
  inner.appendChild(repeat);

  const domAccess = {
    getTickerText: () => tickerNode,
    getTickerHud: () => hud
  };
  const controller = createTickerTextController({
    dom: domAccess,
    document: doc,
    tickerTrackFacade: createTickerTrackFacade({ dom: domAccess, document: doc }),
    schedule: createTestScheduler()
  });

  controller.setText('STATUS ONLINE');

  assert.strictEqual(countClass(hud, 'ticker-track'), 1, 'should only have one ticker-track element');
  assert.strictEqual(track.style.pointerEvents, 'none');
  assert.strictEqual(track.style.display, '');
  assert.strictEqual(track.getAttribute('data-driven'), 'false');
});

test('successful HUD updates aria text without forcing DOM track', async () => {
  const { createTickerTextController, createTickerTrackFacade } = await import('../tickerText.js');

  const tickerNode = createMockElement('div');
  tickerNode.textContent = '';

  const track = createMockElement('div');
  track.className = 'ticker-track';
  track.style.display = 'none';

  const hudRoot = createMockElement('div');
  hudRoot.appendChild(track);

  const doc = {
    getElementById: (id) => (id === 'tickerText' ? tickerNode : null),
    createElement: (tag) => createMockElement(tag)
  };

  const facade = {
    setTickerText: (value) => {
      track.lastFacadeValue = value;
    }
  };

  const domAccess = {
    getTickerText: () => tickerNode,
    getTickerHud: () => hudRoot
  };
  const controller = createTickerTextController({
    hud: () => facade,
    dom: domAccess,
    document: doc,
    tickerTrackFacade: createTickerTrackFacade({ dom: domAccess, document: doc }),
    schedule: createTestScheduler()
  });

  const applied = controller.setText('HUD ONLINE');

  assert.ok(applied, 'HUD facade should report applied');
  assert.strictEqual(tickerNode.textContent, 'HUD ONLINE');
  assert.strictEqual(tickerNode.getAttribute('aria-label'), 'HUD ONLINE');
  assert.strictEqual(track.lastFacadeValue, 'HUD ONLINE');
  assert.strictEqual(countClass(hudRoot, 'ticker-track'), 1);
  assert.strictEqual(track.style.display, 'none');
});

test('fallback respects renderer-driven ticker track ownership', async () => {
  const { createTickerTextController, createTickerTrackFacade } = await import('../tickerText.js');
  const { createTickerEvents, TickerEvent } = await import('../ticker/events.js');

  const tickerNode = createMockElement('div');
  tickerNode.textContent = '';

  const track = createMockElement('div');
  track.className = 'ticker-track';
  track.setAttribute('data-driven', 'true');
  track.style.display = 'none';

  const hudRoot = createMockElement('div');
  hudRoot.appendChild(track);

  const doc = {
    getElementById: (id) => (id === 'tickerText' ? tickerNode : null),
    createElement: (tag) => createMockElement(tag)
  };

  const events = createTickerEvents();
  const domAccess = {
    getTickerText: () => tickerNode,
    getTickerHud: () => hudRoot
  };
  const controller = createTickerTextController({
    dom: domAccess,
    document: doc,
    tickerTrackFacade: createTickerTrackFacade({ dom: domAccess, document: doc }),
    schedule: createTestScheduler(),
    events
  });

  controller.subscribe();

  events.emit(TickerEvent.TEXT, { text: 'REACTOR STABLE' });

  assert.strictEqual(tickerNode.textContent, 'REACTOR STABLE');
  assert.strictEqual(tickerNode.getAttribute('aria-label'), 'REACTOR STABLE');
  assert.strictEqual(track.getAttribute('data-driven'), 'true');
  assert.strictEqual(track.style.display, 'none');
  assert.strictEqual(track.children.length, 0);
  assert.strictEqual(countClass(hudRoot, 'ticker-track'), 1);

  controller.unsubscribe();
});
