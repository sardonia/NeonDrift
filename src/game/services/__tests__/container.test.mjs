import test from 'node:test';
import assert from 'node:assert/strict';

import {
  registerInstance,
  registerFactory,
  getService,
  requireService,
  disposeService,
  resetServices,
  createScope,
  disposeScope,
  createScopeContext,
  withScope,
  LIFETIMES,
  TOKENS
} from '../index.js';

test('registerInstance stores singleton instances', (t) => {
  resetServices();
  t.after(() => resetServices());
  const bus = { emit() {} };
  registerInstance(TOKENS.BUS, bus, { force: true });
  assert.strictEqual(getService(TOKENS.BUS), bus);
  assert.strictEqual(requireService(TOKENS.BUS), bus);
});

test('singleton factory caches results and disposes on reset', (t) => {
  resetServices();
  t.after(() => resetServices());
  let factoryCalls = 0;
  let disposeCalls = 0;
  registerFactory(
    TOKENS.AUDIO,
    () => {
      factoryCalls += 1;
      return {
        dispose() {
          disposeCalls += 1;
        }
      };
    },
    { force: true }
  );
  const first = getService(TOKENS.AUDIO);
  const second = getService(TOKENS.AUDIO);
  assert.strictEqual(first, second);
  assert.equal(factoryCalls, 1);
  disposeService(TOKENS.AUDIO);
  assert.equal(disposeCalls, 1);
  const third = getService(TOKENS.AUDIO);
  assert.notStrictEqual(third, first);
  assert.equal(factoryCalls, 2);
});

test('factory lifetime always produces a new instance', (t) => {
  resetServices();
  t.after(() => resetServices());
  let count = 0;
  registerFactory(
    TOKENS.UI,
    () => ({ id: ++count }),
    { force: true, lifetime: LIFETIMES.FACTORY }
  );
  const a = getService(TOKENS.UI);
  const b = getService(TOKENS.UI);
  assert.notStrictEqual(a, b);
  assert.equal(count, 2);
});

test('scoped lifetime caches per scope and disposes when scope is cleared', (t) => {
  resetServices();
  t.after(() => resetServices());
  let disposed = 0;
  registerFactory(
    TOKENS.THEME,
    () => ({
      dispose() {
        disposed += 1;
      }
    }),
    { force: true, lifetime: LIFETIMES.SCOPED }
  );
  const scopeA = createScope();
  const scopeB = createScope();
  const a1 = getService(TOKENS.THEME, scopeA);
  const a2 = getService(TOKENS.THEME, scopeA);
  const b1 = getService(TOKENS.THEME, scopeB);
  assert.strictEqual(a1, a2);
  assert.notStrictEqual(a1, b1);
  disposeScope(scopeA);
  assert.equal(disposed, 1);
  const a3 = getService(TOKENS.THEME, scopeA);
  assert.notStrictEqual(a3, a1);
  disposeService(TOKENS.THEME);
  assert.equal(disposed, 3);
  disposeScope(scopeB);
  assert.equal(disposed, 3);
});

test('disposeService can target scoped instances', (t) => {
  resetServices();
  t.after(() => resetServices());
  let disposeCount = 0;
  registerFactory(
    TOKENS.DEBUG_STATE,
    () => ({
      dispose() {
        disposeCount += 1;
      }
    }),
    { force: true, lifetime: LIFETIMES.SCOPED }
  );
  const scopeOne = createScope();
  const scopeTwo = createScope();
  const instOne = getService(TOKENS.DEBUG_STATE, scopeOne);
  const instTwo = getService(TOKENS.DEBUG_STATE, scopeTwo);
  disposeService(TOKENS.DEBUG_STATE, { scope: scopeOne });
  assert.equal(disposeCount, 1);
  assert.strictEqual(getService(TOKENS.DEBUG_STATE, scopeTwo), instTwo);
  const newInstOne = getService(TOKENS.DEBUG_STATE, scopeOne);
  assert.notStrictEqual(newInstOne, instOne);
  disposeService(TOKENS.DEBUG_STATE, { remove: true });
  disposeScope(scopeTwo);
  assert.equal(disposeCount, 3);
});

test('registerFactory force replaces singleton and disposes previous instance', (t) => {
  resetServices();
  t.after(() => resetServices());
  let disposeCalls = 0;
  registerFactory(
    TOKENS.UI,
    () => ({
      dispose() {
        disposeCalls += 1;
      }
    }),
    { force: true }
  );
  const first = getService(TOKENS.UI);
  registerFactory(
    TOKENS.UI,
    () => ({
      dispose() {
        disposeCalls += 1;
      }
    }),
    { force: true }
  );
  assert.equal(disposeCalls, 1);
  const second = getService(TOKENS.UI);
  assert.notStrictEqual(first, second);
});

test('requireService throws when a service is missing', (t) => {
  resetServices();
  t.after(() => resetServices());
  assert.throws(
    () => requireService(TOKENS.RNG),
    /Missing required service/
  );
});

test('createScopeContext resolves scoped services and disposes on demand', (t) => {
  resetServices();
  t.after(() => resetServices());
  let createCount = 0;
  let disposeCount = 0;

  registerFactory(
    TOKENS.DEBUG_STATE,
    () => ({
      id: ++createCount,
      dispose() {
        disposeCount += 1;
      }
    }),
    { force: true, lifetime: LIFETIMES.SCOPED }
  );

  const scopeA = createScopeContext();
  const scopeB = createScopeContext();

  const instA1 = scopeA.get(TOKENS.DEBUG_STATE);
  const instA2 = scopeA.require(TOKENS.DEBUG_STATE);
  const instB = scopeB.get(TOKENS.DEBUG_STATE);

  assert.strictEqual(instA1, instA2);
  assert.notStrictEqual(instA1, instB);
  assert.equal(createCount, 2);

  scopeA.dispose();
  assert.equal(disposeCount, 1);

  scopeB.dispose();
  assert.equal(disposeCount, 2);
});

test('withScope wraps callbacks and disposes scoped services automatically', async (t) => {
  resetServices();
  t.after(() => resetServices());
  let disposeCount = 0;

  registerFactory(
    TOKENS.THEME,
    () => ({
      dispose() {
        disposeCount += 1;
      }
    }),
    { force: true, lifetime: LIFETIMES.SCOPED }
  );

  const value = await withScope(async (ctx) => {
    const scopedTheme = ctx.require(TOKENS.THEME);
    assert.ok(scopedTheme);
    return 'scoped';
  });

  assert.equal(value, 'scoped');
  assert.equal(disposeCount, 1);
});
