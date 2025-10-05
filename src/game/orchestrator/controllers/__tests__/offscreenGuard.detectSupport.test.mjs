import test from 'node:test';
import assert from 'node:assert/strict';

test('read-only OffscreenCanvas forces detectSupport() to return false', async () => {
  const global = globalThis;

  const originalDescriptor = Object.getOwnPropertyDescriptor(global, 'OffscreenCanvas');
  const originalWorker = global.Worker;
  const originalHTMLCanvas = global.HTMLCanvasElement;
  const originalDocument = global.document;
  const originalAutostart = global.__NEON_MAIN_AUTOSTART__;
  const originalDisabledFlag = global.__NEON_OFFSCREEN_DISABLED__;
  const originalWindow = global.window;

  global.__NEON_MAIN_AUTOSTART__ = false;

  if (typeof global.window === 'undefined') {
    global.window = {
      addEventListener: () => {},
      removeEventListener: () => {}
    };
  }

  try {
    class FakeCanvas {}
    Object.defineProperty(FakeCanvas.prototype, 'transferControlToOffscreen', {
      value() {
        return { offscreen: true };
      },
      configurable: true,
      writable: true
    });

    let offscreenValue = function OffscreenCanvas() {};
    Object.defineProperty(global, 'OffscreenCanvas', {
      configurable: true,
      get() {
        return offscreenValue;
      },
      set() {
        // Ignore attempts to reassign the constructor so we simulate a
        // read-only property that silently rejects writes.
      }
    });

    global.HTMLCanvasElement = FakeCanvas;
    global.document = {
      createElement() {
        return new FakeCanvas();
      }
    };
    global.Worker = function Worker() {};

    const mainModule = await import('../../../main.js');
    const disabled = mainModule.disableOffscreenCanvasSupport();
    assert.equal(disabled, true);

    const controllerModule = await import('../mainRenderWorkerController.js');
    controllerModule.__resetOffscreenSupportCacheForTests();

    const bridge = controllerModule.createOffscreenRenderBridge();
    assert.equal(bridge.supported, false);
    assert.notEqual(typeof global.OffscreenCanvas, 'function');
    assert.equal(global.OffscreenCanvas, null);
    assert.equal(global.__NEON_OFFSCREEN_DISABLED__, true);

    const transfer = FakeCanvas.prototype.transferControlToOffscreen;
    assert.equal(typeof transfer, 'function');
    assert.equal(transfer.call(new FakeCanvas()), null);

    const storedOriginals = Object.getOwnPropertySymbols(FakeCanvas.prototype)
      .map((symbol) => FakeCanvas.prototype[symbol])
      .find((value) => value && typeof value === 'object'
        && typeof value.transferControlToOffscreen === 'function');
    assert.ok(storedOriginals, 'original transfer function should be preserved for debugging');

    controllerModule.__resetOffscreenSupportCacheForTests();
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(global, 'OffscreenCanvas', originalDescriptor);
    } else {
      delete global.OffscreenCanvas;
    }
    global.Worker = originalWorker;
    global.HTMLCanvasElement = originalHTMLCanvas;
    if (originalDocument === undefined) {
      delete global.document;
    } else {
      global.document = originalDocument;
    }
    if (originalAutostart === undefined) {
      delete global.__NEON_MAIN_AUTOSTART__;
    } else {
      global.__NEON_MAIN_AUTOSTART__ = originalAutostart;
    }
    if (originalDisabledFlag === undefined) {
      delete global.__NEON_OFFSCREEN_DISABLED__;
    } else {
      global.__NEON_OFFSCREEN_DISABLED__ = originalDisabledFlag;
    }
    if (originalWindow === undefined) {
      delete global.window;
    } else {
      global.window = originalWindow;
    }
  }
});
