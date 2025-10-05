import { AudioChannels } from '../../core/events.js';

function safeCall(obj, fn, ...args) {
  try {
    const f = obj && obj[fn];
    if (typeof f === 'function') return f.apply(obj, args);
  } catch (_e) {}
  return undefined;
}

export default class AudioController {

  // User-gesture gating to avoid killing engines before unlock
  static _ndHasGesture = false;
  static markGesture() { try { AudioController._ndHasGesture = true; } catch {} }

  constructor({ bus, AudioFX, tronSfx } = {}) {
    this._bus = bus || null;
    this._AudioFX = AudioFX || {};
    this._tronSfx = tronSfx || {};
    this._offs = [];
    this._bound = false;
  }

  /** Optional init to update dependencies post-construct */
  init(deps = {}) {
    const { AudioFX, tronSfx } = deps || {};
    if (AudioFX) this._AudioFX = AudioFX;
    if (tronSfx) this._tronSfx = tronSfx;
    // if bus already present and not bound, bind now
    if (!this._bound && this._bus) this._bind();
  }

  setBus(bus) {
    this._bus = bus;
    if (!this._bound && this._bus) this._bind();
  }

  /** ————— Core API (mirrors previous audioController object) ————— */

  resume()             { return safeCall(this._AudioFX, 'resume'); }
  restoreMaster()      { return safeCall(this._AudioFX, 'restoreMaster'); }
  setMuted(m)          { return safeCall(this._AudioFX, 'setMuted', !!m); }
  resetVolumes()       { return safeCall(this._AudioFX, 'resetVolumes'); }
  cutAll()             { return safeCall(this._AudioFX, 'cutAll'); }
  killEngines()        { if (!AudioController._ndHasGesture) { try { return this.cutAll(); } catch {} /* nd_kill_guard */ return; } return safeCall(this._AudioFX, 'killEngines'); }
  mkEngine(name)       { return safeCall(this._AudioFX, 'mkEngine', name); }
  turnChirp(side,p)    { return safeCall(this._AudioFX, 'turnChirp', side, p); }
  powerupSplash()      { return safeCall(this._AudioFX, 'powerupSplash'); }
  crash(opts)          { return safeCall(this._tronSfx, 'crash', opts); }
  unlockSfx()          { return safeCall(this._tronSfx, 'unlock'); }
  setSfxVolume(vol)    { return safeCall(this._tronSfx, 'setVolume', vol); }

  setMix(m)            { return safeCall(this._AudioFX, 'setMix', m || {}); }

  startEngines() {    try { this.restoreMaster(); } catch {}
    try { this.resetVolumes && this.resetVolumes(); } catch {}


    const player = this.mkEngine('player');
    const enemy  = this.mkEngine('enemy');
    try { if (player && typeof player.setActive === 'function') player.setActive(true); } catch {}
    try { if (enemy  && typeof enemy.setActive  === 'function') enemy.setActive(true); } catch {}
    try { this.setSfxVolume(0.8); } catch {}
    return { player, enemy };

  }
  stopEngines()  { return this.killEngines(); }

  resumeAndUnlock() {
    try { AudioController.markGesture(); } catch {} try { this.restoreMaster(); } catch {}
    try { this.resume(); } catch {}
    this.unlockSfx();
  }

  prepareCountdown(payload = {}) {
    const bgmEl = (payload && (payload.bgm || payload.audioElement)) || undefined;
    const volume = (payload && typeof payload.volume === 'number') ? payload.volume : 0.65;
    this.resetBgm(bgmEl, volume);
    this.playBgm(bgmEl);
    try { safeCall(this._AudioFX, 'racingStart3s'); } catch {}
  }

  prepareGameplay() {
    this.restoreMaster();
    this.resume();
    this.unlockSfx();
  }

  resetBgm(bgmEl, volume = 0.65) {
    try {
      if (bgmEl) {
        bgmEl.currentTime = 0;
        bgmEl.volume = volume;
      }
    } catch (_e) {}
  }

  playBgm(bgmEl) {
    try {
      if (!bgmEl || typeof bgmEl.play !== 'function') return undefined;
      try { bgmEl.muted = false; } catch(_) {}
      const p = bgmEl.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
      return p;
    } catch (_e) {
    }
    return undefined;
  }
  /** ————— Event Bus Binding ————— */
  _bind() {
    if (!this._bus || this._bound || typeof this._bus.on !== 'function') return;
    const bus = this._bus;
    this._offs.push(bus.on(AudioChannels.PREPARE_COUNTDOWN.event, (payload = {}) => {
      try { this.prepareCountdown(payload); } catch (_) {}
    }));
    this._offs.push(bus.on(AudioChannels.RESUME_AND_UNLOCK.event, () => {
      try { this.resumeAndUnlock(); } catch (_) {}
    }));
    this._offs.push(bus.on(AudioChannels.START_ENGINES.event, () => {
      try { this.startEngines(); } catch (_) {}
    }));
    this._offs.push(bus.on(AudioChannels.KILL_ENGINES.event, () => {
      try { this.stopEngines(); } catch (_) {}
    }));
    this._offs.push(bus.on(AudioChannels.CUT_ALL.event, () => {
      try { this.cutAll(); } catch (_) {}
    }));
    this._offs.push(bus.on(AudioChannels.BGM_RESET_PLAY.event, (payload = {}) => {
      try {
        const domSvc = null; // consumer may pass bgm via payload
        const bgmEl = (payload && (payload.bgm || payload.audioElement)) || (domSvc && domSvc.bgm) || null;
        const vol = (payload && typeof payload.volume === 'number') ? payload.volume : 0.65;
        this.resetBgm(bgmEl, vol);
        this.playBgm(bgmEl);
      } catch (_) {}
    }));
    this._offs.push(bus.on(AudioChannels.SET_MIX.event, (payload = {}) => { try { this.setMix(payload); } catch (_) {} }));
    this._bound = true;
  }

  dispose() {
    try {
      for (const off of this._offs) {
        try { if (typeof off === 'function') off(); } catch {}
      }
    } catch {}
    this._offs = [];
    this._bound = false;
  }
}