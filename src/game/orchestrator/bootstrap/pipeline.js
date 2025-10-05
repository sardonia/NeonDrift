const DEFAULT_STAGE_NAME = 'stage';

function defaultReporter(failure) {
  if (!failure || !failure.error) {
    return;
  }
  const { stage, error, detail } = failure;
  const scope = detail && detail.scope ? ` (${detail.scope})` : '';
  try {
    if (typeof console !== 'undefined' && console && typeof console.error === 'function') {
      console.error(`[bootstrap] stage "${stage}" failed${scope}`, error);
    }
  } catch (_) {
    // ignore logging failures
  }
}

function mergeAccumulator(acc, result = {}) {
  let next = acc;
  if (Object.prototype.hasOwnProperty.call(result, 'state')) {
    next = { ...next, state: result.state };
  }
  if (Object.prototype.hasOwnProperty.call(result, 'context')) {
    next = { ...next, context: result.context };
  }
  if (result.services && typeof result.services === 'object') {
    next = {
      ...next,
      services: { ...(next.services || {}), ...result.services }
    };
  }
  if (result.shared && typeof result.shared === 'object') {
    next = {
      ...next,
      shared: { ...(next.shared || {}), ...result.shared }
    };
  }
  if (result.meta && typeof result.meta === 'object') {
    next = {
      ...next,
      meta: { ...(next.meta || {}), ...result.meta }
    };
  }
  return next;
}

export function runBootstrapPipeline(initial = {}, stages = [], reporter = defaultReporter) {
  let accumulator = {
    state: initial.state ?? null,
    context: initial.context ?? null,
    services: { ...(initial.services || {}) },
    shared: { ...(initial.shared || {}) },
    meta: { ...(initial.meta || {}) }
  };
  const failures = [];
  const reportFailure = typeof reporter === 'function' ? reporter : defaultReporter;

  for (const stageDef of stages) {
    if (!stageDef) {
      continue;
    }
    const stageName = typeof stageDef.name === 'string' && stageDef.name.trim().length > 0
      ? stageDef.name
      : DEFAULT_STAGE_NAME;
    const execute = typeof stageDef.execute === 'function'
      ? stageDef.execute
      : (typeof stageDef.run === 'function' ? stageDef.run : (typeof stageDef === 'function' ? stageDef : null));
    if (!execute) {
      continue;
    }
    const tools = {
      report(error, detail) {
        if (!error) {
          return;
        }
        const failure = { stage: stageName, error, detail, handled: true };
        failures.push(failure);
        try {
          reportFailure(failure);
        } catch (_) {}
      }
    };
    try {
      const result = execute(accumulator, tools) || {};
      accumulator = mergeAccumulator(accumulator, result);
    } catch (error) {
      const failure = { stage: stageName, error, detail: undefined, handled: false };
      failures.push(failure);
      try {
        reportFailure(failure);
      } catch (_) {}
    }
  }

  return {
    state: accumulator.state,
    context: accumulator.context,
    services: accumulator.services,
    shared: accumulator.shared,
    meta: accumulator.meta,
    failures
  };
}

export { defaultReporter };
