import { executeWithDiagnostics } from '../../utils/safe.js';

export function runDiagnostic(label, fn, options = {}) {
  const { context, ...rest } = options || {};
  const mergedContext = { scope: 'orchestrator', ...(context || {}) };
  return executeWithDiagnostics(label, fn, { context: mergedContext, ...rest });
}

export function safe(fn, label, ctx) {
  const diagnosticLabel = typeof label === 'string' && label.trim() ? label.trim() : 'orchestrator.safe';
  return runDiagnostic(diagnosticLabel, fn, { context: ctx });
}

export default {
  runDiagnostic,
  safe
};
