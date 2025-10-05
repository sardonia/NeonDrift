// Auto-generated thin adapter for Game facade wiring (slice 22)
const INTERNAL_EVENT_FLAG = '__gameFacadeHandled__';
const INTERNAL_ADAPTER_FLAG = '__fromAdapter';

export function createRootAdapter(bus, services) {
  const subs = [];
  let disposed = false;

  function on(type, fn) {
    if (disposed) return;
    if (typeof bus.on === 'function') {
      bus.on(type, fn);
      subs.push([type, fn]);
    }
  }

  function offAll() {
    while (subs.length) {
      const [t, fn] = subs.pop();
      if (typeof bus.off === 'function') {
        bus.off(t, fn);
      }
    }
  }

  function forward(flowFn, payload) {
    if (!flowFn || disposed) return;
    if (payload && payload[INTERNAL_EVENT_FLAG]) return;
    const options = payload && typeof payload === 'object'
      ? { ...payload, [INTERNAL_ADAPTER_FLAG]: true }
      : { [INTERNAL_ADAPTER_FLAG]: true };
    flowFn(options);
  }

  const flow = services.flow || {};

  on('game:start',   (payload) => forward(flow.start, payload));
  on('game:pause',   (payload) => forward(flow.pause, payload));
  on('game:resume',  (payload) => forward(flow.resume, payload));
  on('game:next',    (payload) => forward(flow.nextLevel, payload));
  on('game:dispose', (payload) => {
    if (payload && payload[INTERNAL_EVENT_FLAG]) return;
    disposed = true;
    offAll();
    if (typeof services.dispose === 'function') {
      services.dispose();
    }
  });

  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      offAll();
    }
  };
}
