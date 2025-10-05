// Single source of truth: register a concrete AudioController instance into game DI
import { register, TOKENS } from './index.js';
import { bus } from '../core/bus-instance.js';
import AudioController from '../orchestrator/controllers/AudioController.class.js';
import AudioFX from '../../audio/AudioFX.js';
import tronSfx from '../../audio/SFXCrashPro.js';
try { register(TOKENS.AUDIO, new AudioController({ bus, AudioFX, tronSfx }), { force: true }); } catch {}
