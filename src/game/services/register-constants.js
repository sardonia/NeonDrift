// Register Constants via DI
import { register as registerService, TOKENS } from './index.js';
import * as C from '../Constants.js';
try { registerService(TOKENS.CONSTANTS, C, { force: true }); } catch {}
