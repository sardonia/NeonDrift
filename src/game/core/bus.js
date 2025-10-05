/**
 * Back-compat Event Bus facade.
 * Preserves the old named exports (on, once, off, emit) but delegates to a single instance.
 * TODO: remove this shim at Step 11.
 */
import { bus } from './bus-instance.js';
export function on(evt, fn)  { return bus.on(evt, fn); }
export function once(evt, fn){ return bus.once(evt, fn); }
export function off(evt, fn) { return bus.off(evt, fn); }
export function emit(evt, payload) { return bus.emit(evt, payload); }
export default { on, once, off, emit };
