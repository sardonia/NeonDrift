import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeWithDiagnostics,
  getDiagnosticsLog,
  clearDiagnosticsLog
} from '../safe.js';
import { DiagnosticsChannels } from '../../core/events.js';

test('executeWithDiagnostics reports recoverable errors', () => {
  clearDiagnosticsLog();
  const busEvents = [];
  const loggerCalls = [];
  const bus = {
    emit(event, payload) {
      busEvents.push({ event, payload });
    }
  };
  const logger = {
    error(...args) {
      loggerCalls.push(args);
    }
  };

  const fallback = Symbol('fallback');
  const result = executeWithDiagnostics('test.scope.operation', () => {
    throw new Error('failure');
  }, {
    context: { flow: 'unit-test' },
    bus,
    logger,
    fallback
  });

  assert.strictEqual(result, fallback);
  const entries = getDiagnosticsLog();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].label, 'test.scope.operation');
  assert.deepEqual(entries[0].context, { flow: 'unit-test' });
  assert.equal(busEvents.length, 1);
  assert.equal(busEvents[0].event, DiagnosticsChannels.REPORT.event);
  assert.equal(busEvents[0].payload.label, 'test.scope.operation');
  assert.equal(busEvents[0].payload.context.flow, 'unit-test');
  assert.equal(loggerCalls.length > 0, true);
});

test('executeWithDiagnostics rethrows critical errors', () => {
  clearDiagnosticsLog();
  const bus = { emit() {} };
  assert.throws(() => {
    executeWithDiagnostics('test.scope.critical', () => {
      const error = new Error('critical');
      error.critical = true;
      throw error;
    }, { bus });
  }, /critical/);
  const entries = getDiagnosticsLog();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].severity, 'critical');
});
