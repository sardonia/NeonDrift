const _warnedTags = new Set();
export function warnOnce(tag, message) {
  try {
    if (!_warnedTags.has(tag)) {
      _warnedTags.add(tag);
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn(message);
      }
    }
  } catch (_) {
  }
}
export default warnOnce;
