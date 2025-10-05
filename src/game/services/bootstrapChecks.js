// Verify required services are registered at boot. Fail fast with clear messages.
import { hasService, getService, TOKENS } from './index.js';

const REQUIRED = [
  TOKENS.BUS,
  TOKENS.UI,
  TOKENS.AUDIO,
  TOKENS.DOM,
  TOKENS.CONSTANTS
];

export function verifyRequiredServices() {
  const missing = [];
  for (const token of REQUIRED) {
    try {
      if (!hasService(token) || !getService(token)) missing.push(token);
    } catch (_) {
      missing.push(token);
    }
  }
  if (missing.length) {
    const list = missing.map((token) => {
      if (typeof token === 'symbol') {
        return token.description || token.toString();
      }
      if (token && typeof token === 'object' && 'description' in token) {
        return token.description;
      }
      return String(token);
    }).join(', ');
    throw new Error(`[services/bootstrap] Missing required services: ${list}`);
  }
  return true;
}
export default { verifyRequiredServices };
