import { initInputAdapter as _initInputAdapter } from '../../inputAdapter.js';
export function initInput(doc, ctx) {
  if (!doc) return;
  const localCtx = { ...ctx };
  delete localCtx.doc;
  _initInputAdapter(doc, localCtx);
}
export default { initInput };
