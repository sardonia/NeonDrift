(function(){
       const _rand = () => {
         try {
           if (typeof window !== 'undefined' && window.neonServices && typeof window.neonServices.rng === 'function') {
             const v = window.neonServices.rng();
             if (typeof v === 'number') return v;
           }
         } catch (_) {}
         return Math.random();
       };
       class SFXCrashPro {
         constructor(ac, opts = {}) {
           this.ac = ac;
           this.master = ac.createGain();
           this.master.gain.value = opts.masterGain ?? 0.9;
           this.comp = ac.createDynamicsCompressor();
           this.comp.threshold.value = -18;
           this.comp.knee.value = 12;
           this.comp.ratio.value = 4;
           this.comp.attack.value = 0.003;
           this.comp.release.value = 0.15;
           this.fxIn = ac.createGain(); this.fxIn.gain.value = 1.0;
           this.reverb = ac.createConvolver();
           this.reverb.buffer = this.#makeNoiseIR({ seconds: 3.2, decay: 3.8 });
           this.reverbGain = ac.createGain(); this.reverbGain.gain.value = 0.62;
           const maxDelay = 4.0;
           this.split = ac.createChannelSplitter(2);
           this.merge = ac.createChannelMerger(2);
           this.delayL = ac.createDelay(maxDelay);
           this.delayR = ac.createDelay(maxDelay);
           this.delayL.delayTime.value = 0.21;
           this.delayR.delayTime.value = 0.34;
           this.fbL = ac.createGain(); this.fbR = ac.createGain();
           this.fbL.gain.value = this.fbR.gain.value = 0.40;
           this.toneL = ac.createBiquadFilter(); this.toneR = ac.createBiquadFilter();
           this.toneL.type = this.toneR.type = "lowpass";
           this.toneL.frequency.value = this.toneR.frequency.value = 2000;
           this.echoMix = ac.createGain(); this.echoMix.gain.value = 0.50;
           this.fxIn.connect(this.reverb);
           this.reverb.connect(this.reverbGain);
           this.reverbGain.connect(this.master);
           this.fxIn.connect(this.split);
           this.split.connect(this.delayL, 0);
           this.split.connect(this.delayR, 1);
           this.delayL.connect(this.toneL); this.toneL.connect(this.merge, 0, 0);
           this.delayR.connect(this.toneR); this.toneR.connect(this.merge, 0, 1);
           this.delayL.connect(this.fbL); this.fbL.connect(this.delayR);
           this.delayR.connect(this.fbR); this.fbR.connect(this.delayL);
           this.merge.connect(this.echoMix);
           this.echoMix.connect(this.master);
           this.master.connect(this.comp);
           this.comp.connect(ac.destination);
         }
         play({ intensity = 1.0, pan = 0, dry = 0.95, fxSend = 0.90, time = this.ac.currentTime } = {}) {
           const ac = this.ac;
           const t0 = time;
           const mix = ac.createGain(); mix.gain.value = intensity;
           const panner = ac.createStereoPanner ? ac.createStereoPanner() : null;
           if (panner) panner.pan.value = pan;
           const dryGain = ac.createGain(); dryGain.gain.value = dry;
           const send = ac.createGain(); send.gain.value = fxSend;
           if (panner) { mix.connect(panner); panner.connect(dryGain); panner.connect(send); }
           else { mix.connect(dryGain); mix.connect(send); }
           dryGain.connect(this.master);
           send.connect(this.fxIn);
           { const osc = ac.createOscillator(); osc.type = "sine";
             const g = ac.createGain();
             const f0 = 240 + _rand()*70, f1 = 55 + _rand()*20;
             osc.frequency.setValueAtTime(f0, t0);
             osc.frequency.exponentialRampToValueAtTime(f1, t0 + 0.14);
             g.gain.setValueAtTime(0.0, t0);
             g.gain.linearRampToValueAtTime(1.0, t0 + 0.004);
             g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
             osc.connect(g); g.connect(mix);
             osc.start(t0); osc.stop(t0 + 0.25);
           }
           { const dur = 0.35;
             const noise = this.#whiteNoise(dur);
             const src = ac.createBufferSource(); src.buffer = noise;
             const bp = ac.createBiquadFilter(); bp.type="bandpass"; bp.Q.value = 8;
             bp.frequency.setValueAtTime(2000, t0);
             bp.frequency.linearRampToValueAtTime(4200, t0 + 0.22);
             const hp = ac.createBiquadFilter(); hp.type="highpass"; hp.frequency.value = 600;
             const g = ac.createGain();
             g.gain.setValueAtTime(0.0, t0);
             g.gain.linearRampToValueAtTime(0.95, t0 + 0.01);
             g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
             src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(mix);
             src.start(t0); src.stop(t0 + dur + 0.01);
           }
           { const c = ac.createOscillator(); c.type="triangle";
             const m = ac.createOscillator(); m.type="sine";
             const fm = ac.createGain(); fm.gain.value = 380 + _rand()*120;
             const g = ac.createGain();
             const c0 = 1100 + _rand()*300, c1 = 140 + _rand()*40;
             c.frequency.setValueAtTime(c0, t0);
             c.frequency.exponentialRampToValueAtTime(c1, t0 + 0.22);
             m.frequency.setValueAtTime(120 + _rand()*80, t0);
             m.connect(fm); fm.connect(c.frequency);
             g.gain.setValueAtTime(0.0, t0);
             g.gain.linearRampToValueAtTime(0.8, t0 + 0.015);
             g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.24);
             c.connect(g); g.connect(mix);
             m.start(t0); c.start(t0);
             m.stop(t0 + 0.25); c.stop(t0 + 0.28);
           }
           { const grains = Math.floor(24 + intensity*36);
             for(let i=0;i<grains;i++){
               const when = t0 + 0.02 + _rand()*0.12;
               const dur  = 0.015 + _rand()*0.018;
               const b = this.#whiteNoise(dur);
               const src = ac.createBufferSource(); src.buffer = b;
               const crush = this.#bitcrushCurve(5 + Math.floor(_rand()*3));
               const crushWS = ac.createWaveShaper(); crushWS.curve = crush;
               const hp = ac.createBiquadFilter(); hp.type="highpass"; hp.frequency.value = 1200 + _rand()*1800;
               const g = ac.createGain(); g.gain.value = 0.0;
               src.connect(crushWS); crushWS.connect(hp); hp.connect(g); g.connect(mix);
               g.gain.setValueAtTime(0.0, when);
               g.gain.linearRampToValueAtTime(0.6 + _rand()*0.3, when + 0.002);
               g.gain.exponentialRampToValueAtTime(0.001, when + dur);
               src.start(when); src.stop(when + dur + 0.01);
             }
           }
           { const dur = 0.22 + 0.1*intensity;
             const noise = this.#whiteNoise(dur);
             const src = ac.createBufferSource(); src.buffer = noise;
             const hp = ac.createBiquadFilter(); hp.type="highpass"; hp.frequency.value = 1800;
             const am = ac.createOscillator(); am.type="sine"; am.frequency.value = 70 + _rand()*70;
             const depth = ac.createGain(); depth.gain.value = 0.8;
             const g = ac.createGain(); g.gain.value = 0.0;
             am.connect(depth); depth.connect(g.gain);
             src.connect(hp); hp.connect(g); g.connect(mix);
             const when = t0 + 0.03;
             g.gain.setValueAtTime(0.0, when);
             g.gain.linearRampToValueAtTime(0.5, when + 0.015);
             g.gain.exponentialRampToValueAtTime(0.001, when + dur);
             am.start(when); src.start(when);
             src.stop(when + dur + 0.02); am.stop(when + dur + 0.03);
           }
         }
         #whiteNoise(seconds) {
           const ac = this.ac;
           const length = Math.max(1, Math.floor(ac.sampleRate * seconds));
           const buffer = ac.createBuffer(2, length, ac.sampleRate);
           for (let ch = 0; ch < 2; ch++) {
             const data = buffer.getChannelData(ch);
             for (let i = 0; i < length; i++) {
               const env = Math.pow(1 - i / length, 3.0);
               data[i] = (_rand()*2 - 1) * env;
             }
           }
           return buffer;
         }
         #bitcrushCurve(bits){
           const steps = Math.pow(2, Math.max(2, Math.min(16, bits)));
           const curve = new Float32Array(65536);
           for(let i=0;i<curve.length;i++){
             const x = i/32768 - 1;
             curve[i] = Math.round(x * steps) / steps;
           }
           return curve;
         }
         #makeNoiseIR({ seconds = 2.5, decay = 3.0 } = {}) {
           const ac = this.ac;
           const len = Math.max(1, Math.floor(ac.sampleRate * seconds));
           const buffer = ac.createBuffer(2, len, ac.sampleRate);
           for (let ch = 0; ch < 2; ch++) {
             const data = buffer.getChannelData(ch);
             for (let i = 0; i < len; i++) {
               const env = Math.pow(1 - i / len, decay);
               data[i] = (_rand()*2 - 1) * env;
             }
           }
           return buffer;
         }
       }
       const AC = window.AudioContext || window.webkitAudioContext;
       if(!AC){ console.warn('[TronSFX PRO] WebAudio not supported'); return; }
       const ac = new AC({ latencyHint: 'interactive' });
       const engine = new SFXCrashPro(ac, {});
       let unlocked = false;
       function unlock(){
         if(unlocked) return Promise.resolve();
         return ac.resume().then(()=>{ unlocked = true; window.dispatchEvent(new Event('tron:sfx-ready')); }).catch(()=>{});
       }
       function setVolume(v){
         const vol = Math.max(0, Math.min(1, +v || 0));
         try { engine.master.gain.setTargetAtTime(vol, ac.currentTime, 0.01); } catch(e){}
       }
       function crash(opts={}){
         const { intensity=0.8, stereo=null, x, width } = opts || {};
         let st = stereo;
         if((st===null || st===undefined) && Number.isFinite(x) && Number.isFinite(width) && width>0){
           st = (x/width)*2 - 1;
         }
         const pan = Number.isFinite(st) ? Math.max(-1, Math.min(1, st)) : 0;
         engine.play({
           intensity: Math.max(0.2, Math.min(1, +intensity || 0.8)),
           pan,
           dry: 0.95,
           fxSend: 0.90
         });
       }
       window.tronSfx = { unlock, setVolume, crash, setMaxSpeed(){}, createPanner(){} };
       const unlockOnce = () => { unlock(); window.removeEventListener('pointerdown', unlockOnce, { capture: true }); };
       window.addEventListener('pointerdown', unlockOnce, { capture: true, once: true });
       window.addEventListener('tron:collision', (e)=>{
         const d = (e && e.detail) || {};
         let intensity = 0.8;
         if(Number.isFinite(d.speed) && Number.isFinite(window.__maxSpeed)){
           intensity = Math.max(0.2, Math.min(1, d.speed / window.__maxSpeed));
         }
         const stereo = (Number.isFinite(d.x) && Number.isFinite(d.width) && d.width>0)
           ? Math.max(-1, Math.min(1, (d.x/d.width)*2-1)) : 0;
         crash({ intensity, stereo });
       });
       })();
const __tronExport = (typeof window !== 'undefined' ? window.tronSfx : undefined);
export default __tronExport;
