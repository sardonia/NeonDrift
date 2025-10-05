// One-time DI registration of the shared event bus into the game/services container
import { bus } from '../../game/core/bus-instance.js';
import { register, TOKENS } from './index.js';
try { register(TOKENS.BUS, bus, { force: true }); } catch {}
