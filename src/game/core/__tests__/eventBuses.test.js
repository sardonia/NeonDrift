import test from 'node:test';
import assert from 'node:assert/strict';
import EventBus from '../EventBus.js';
import { hudBus, audioBus, diagnosticsBus, HudChannels, AudioChannels, DiagnosticsChannels } from '../events.js';
import { clearDiagnosticsLog, getDiagnosticsLog } from '../../utils/safe.js';

function createMockBus() {
  const calls = [];
  return {
    calls,
    emit(event, payload) {
      calls.push({ event, payload });
    }
  };
}

function captureConsole(fn) {
  const originalWarn = console.warn;
  const originalError = console.error;
  const warnings = [];
  const errors = [];
  console.warn = (...args) => {
    warnings.push(args.map(String).join(' '));
  };
  console.error = (...args) => {
    errors.push(args.map(String).join(' '));
  };
  try {
    const result = fn();
    return { warnings, errors, result };
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
}

test('hudBus.showOverlay emits for valid payloads', () => {
  const bus = createMockBus();
  const { warnings, errors, result } = captureConsole(() =>
    hudBus.showOverlay(bus, { kind: 'pause', data: { title: 'Pause' } })
  );

  assert.equal(result, true);
  assert.deepEqual(warnings, []);
  assert.deepEqual(errors, []);
  assert.equal(bus.calls.length, 1);
  assert.equal(bus.calls[0].event, HudChannels.SHOW_OVERLAY.event);
  assert.deepEqual(bus.calls[0].payload, { kind: 'pause', data: { title: 'Pause' } });
});

test('hudBus.showOverlay rejects missing kind', () => {
  const bus = createMockBus();
  const { warnings, errors, result } = captureConsole(() =>
    hudBus.showOverlay(bus, { data: { seconds: 3 } })
  );

  assert.equal(result, false);
  assert.equal(bus.calls.length, 0);
  assert.equal(errors.length > 0, true);
  assert.deepEqual(warnings, []);
});

test('hudBus.showOverlay warns for unknown overlay kinds', () => {
  const bus = createMockBus();
  const { warnings, errors, result } = captureConsole(() =>
    hudBus.showOverlay(bus, { kind: 'mystery' })
  );

  assert.equal(result, true);
  assert.equal(bus.calls.length, 1);
  assert.equal(bus.calls[0].event, HudChannels.SHOW_OVERLAY.event);
  assert.equal(warnings.length > 0, true);
  assert.deepEqual(errors, []);
});

test('audioBus.resetAndPlayBgm validates payload shape', () => {
  const bus = createMockBus();
  const { warnings, errors, result } = captureConsole(() =>
    audioBus.resetAndPlayBgm(bus, 'not-an-object')
  );

  assert.equal(result, false);
  assert.equal(bus.calls.length, 0);
  assert.equal(errors.length > 0, true);
  assert.deepEqual(warnings, []);
});

test('audioBus.startEngines emits without payload and warns when provided', () => {
  const bus = createMockBus();
  const { warnings, errors, result } = captureConsole(() =>
    audioBus.startEngines(bus, { unexpected: true })
  );

  assert.equal(result, true);
  assert.equal(bus.calls.length, 1);
  assert.equal(bus.calls[0].event, AudioChannels.START_ENGINES.event);
  assert.equal(errors.length, 0);
  assert.equal(warnings.length > 0, true);
});

test('diagnosticsBus.report emits structured events', () => {
  const bus = createMockBus();
  const payload = {
    label: 'controller.step',
    message: 'failed to execute',
    error: { message: 'failed to execute' },
    context: { scope: 'test' },
    severity: 'error',
    timestamp: Date.now()
  };
  const { warnings, errors, result } = captureConsole(() =>
    diagnosticsBus.report(bus, payload)
  );

  assert.equal(result, true);
  assert.deepEqual(warnings, []);
  assert.deepEqual(errors, []);
  assert.equal(bus.calls.length, 1);
  assert.equal(bus.calls[0].event, DiagnosticsChannels.REPORT.event);
  assert.equal(bus.calls[0].payload.label, 'controller.step');
});

test('diagnosticsBus.report rejects invalid payloads', () => {
  const bus = createMockBus();
  const { warnings, errors, result } = captureConsole(() =>
    diagnosticsBus.report(bus, null)
  );

  assert.equal(result, false);
  assert.equal(bus.calls.length, 0);
  assert.equal(errors.length > 0, true);
  assert.deepEqual(warnings, []);
});

test('EventBus emit rejects invalid payloads and records diagnostics', () => {
  clearDiagnosticsLog();
  const issues = [];
  const bus = new EventBus({
    validators: {
      FOO: () => ({ valid: false, errors: ['expected object'] })
    },
    onValidationIssue: (issue) => { issues.push(issue); },
    diagnosticsLabel: 'testbus'
  });

  let invoked = false;
  bus.on('FOO', () => { invoked = true; });

  const { warnings, errors, result } = captureConsole(() => bus.emit('FOO', 'invalid'));

  assert.equal(result, false);
  assert.equal(invoked, false);
  assert.equal(errors.length > 0, true);
  assert.deepEqual(warnings, []);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].level, 'error');
  assert.equal(issues[0].event, 'FOO');

  const logs = getDiagnosticsLog();
  assert.equal(logs.length > 0, true);
  const lastLog = logs[logs.length - 1];
  assert.equal(lastLog.label, 'testbus.FOO');

  clearDiagnosticsLog();
});

test('EventBus emit allows payloads with warnings', () => {
  const issues = [];
  const bus = new EventBus({
    validators: {
      BAR: () => ({ valid: true, warnings: ['missing optional property'] })
    },
    onValidationIssue: (issue) => { issues.push(issue); }
  });

  const calls = [];
  bus.on('BAR', (payload) => { calls.push(payload); });

  const { warnings, errors, result } = captureConsole(() => bus.emit('BAR', { value: 1 }));

  assert.equal(result, true);
  assert.equal(errors.length, 0);
  assert.equal(warnings.length > 0, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].value, 1);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].level, 'warn');
  assert.equal(issues[0].event, 'BAR');
});
