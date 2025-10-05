const test = require('node:test');
const assert = require('node:assert/strict');

const previousWindow = globalThis.window;
const previousWarn = console.warn;

test.beforeEach(() => {
  globalThis.window = {};
  console.warn = () => {};
});

test.after(() => {
  if (typeof previousWindow === 'undefined') {
    delete globalThis.window;
  } else {
    globalThis.window = previousWindow;
  }
  console.warn = previousWarn;
});

test('pause ticker helpers call HUD facade when available', async () => {
  const { showPauseOnTicker, hidePauseOnTicker, configureOverlayTickerFacade } = await import('../overlays.js');

  const calls = [];
  const hudFacade = {
    showPauseTicker: () => calls.push('show'),
    hidePauseTicker: () => calls.push('hide')
  };

  configureOverlayTickerFacade(hudFacade);

  showPauseOnTicker();
  hidePauseOnTicker();

  assert.deepStrictEqual(calls, ['show', 'hide']);
});

test('pause ticker helpers warn when HUD facade missing', async () => {
  const { showPauseOnTicker, configureOverlayTickerFacade } = await import('../overlays.js');

  configureOverlayTickerFacade(null);

  let warned = false;
  const warnings = new Set();
  console.warn = (msg) => {
    warned = true;
    warnings.add(msg);
  };

  let globalCalled = false;
  globalThis.window = {
    NeonHUD: {
      showPauseTicker: () => {
        globalCalled = true;
      }
    }
  };

  showPauseOnTicker();

  assert.strictEqual(globalCalled, false);
  assert.ok(warned);
  assert.ok(Array.from(warnings).some((msg) => String(msg).includes('HUD service unavailable for pause ticker updates')));
});
