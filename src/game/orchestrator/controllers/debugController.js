import { instrument as _instrumentDebug, recordFrameDT as _recordFrameDT } from '../../debug/instrumentation.js';
export function init(gameState) {
  try {
    _instrumentDebug(gameState);
  } catch (e) {
  }
}
export function recordFrame(onFrame) {
  try {
    _recordFrameDT(onFrame);
  } catch (e) {
  }
}
export default { init, recordFrame };
