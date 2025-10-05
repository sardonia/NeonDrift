// Audio service controls enhancer (DI-safe, no globals)
import { requireService, TOKENS } from '../game/services/index.js';
import * as AudioFX from '../audio/AudioFX.js';
import { bus } from '../game/core/bus-instance.js';
import { AudioChannels } from '../game/core/events.js';

function install() {
  let audio;
  try {
    audio = requireService(TOKENS.AUDIO, () => new Error('[audio-controls] Missing audio service'));
  } catch (error) {
    try { console.error(error); } catch (_) {}
    return;
  }
  if (typeof audio.isMuted !== 'function') {
    audio.isMuted = () => { try { return localStorage.getItem('nd_mute') === '1'; } catch { return false; } };
  }
  if (typeof audio.toggleMute !== 'function') {
    audio.toggleMute = (force) => {
      const current = audio.isMuted();
      const next = (typeof force === 'boolean') ? force : !current;
      try { localStorage.setItem('nd_mute', next ? '1' : '0'); } catch {}
      try { AudioFX.setMuted(!!next); } catch {}
      if (next) { try { audio.cutAll && audio.cutAll(); } catch {} }
      else {
        try { bus.emit && bus.emit(AudioChannels.RESUME_AND_UNLOCK.event); } catch {}
        try { audio.resumeAndUnlock && audio.resumeAndUnlock(); } catch {}
        try { audio.resume && audio.resume(); } catch {}
      }
      return next;
    };
  }
}
try { install(); } catch {}
try { setTimeout(install, 0); } catch {}
