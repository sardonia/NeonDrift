const AudioFX = (function(){
  const __USE_WORKER_SPRITES = false;

  const __mixConfig = {
    master: 1.0,
    reverb: 1.0,
    chirpGain: 1.0,
    engine: { dry: 1.0, wet: 1.0, sub: 1.0, mid: 1.0, whine: 1.0 }
  };
  const __diConfig = {
    baseGain: 0.561,
    ramp: 0.035,
    highpass: 90,
    lowpass: 8400,
    noiseMix: 0.04,
    toneMix: 0.58,
    whineFreq: 1500,
    whineQ: 1.2,
    detuneCents: 4,
    crackleMix: 0.09,
    crackleRate: 6,
    crackleHighpass: 2600,
    crackleDepth: 0.45,
    buzzMix: 0.05,
    butterLowMix: 0.62,
    butterMidMix: 0.4,
    butterNoiseMix: 0.16,
    butterLfoDepth: 0.28,
    butterLfoRate: 0.58
  };

  let ctx, masterGain, comp, reverb, reverbGain;
  const __engines = [];
  let __theme = null;
  let unlocked = false, muted = false;

  function ensure(){
    if(ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    masterGain = ctx.createGain(); masterGain.gain.value = 0.9 * (__mixConfig.master || 1);
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 30; comp.ratio.value = 10;
    comp.attack.value = 0.0015; comp.release.value = 0.12;
    reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx, 0.27, 2.6);
    reverbGain = ctx.createGain(); reverbGain.gain.value = 0.25 * (__mixConfig.reverb || 1);

    masterGain.connect(comp);
    comp.connect(ctx.destination);
    reverb.connect(reverbGain);
    reverbGain.connect(masterGain);
  }

  async function resume(){
    ensure();
    if(ctx.state === 'suspended') await ctx.resume();
    unlocked = true;
  }

  function setMuted(m){
    muted = !!m;
    if(masterGain){
      const n = now();
      masterGain.gain.cancelScheduledValues(n);
      masterGain.gain.linearRampToValueAtTime(muted?0:0.9 * (__mixConfig.master || 1), n+0.06);
    }
  }
  function isMuted(){ return muted; }
  function now(){ return ctx.currentTime; }

  const __clamp = (v, min, max) => Math.min(Math.max(v, min), max);
  const __clamp01 = v => __clamp(v, 0, 1);
  function __rampParam(param, value, time, dur) {
    if (!param) return;
    const target = Number.isFinite(value) ? value : 0;
    const when = Number.isFinite(time) ? time : (ctx ? ctx.currentTime : 0);
    const glide = Math.max(0.001, Number.isFinite(dur) ? dur : (__diConfig.ramp || 0.02));
    try {
      param.cancelScheduledValues(when);
      const current = typeof param.value === 'number' ? param.value : target;
      param.setValueAtTime(current, when);
      param.linearRampToValueAtTime(target, when + glide);
    } catch (_) {}
  }
  function __rampHz(param, value, time, dur) {
    __rampParam(param, Math.max(20, Number.isFinite(value) ? value : 20), time, dur);
  }
  function __rampGain(param, value, time, dur) {
    __rampParam(param, Math.max(0, Number.isFinite(value) ? value : 0), time, dur);
  }
  function __rampDetune(param, value, time, dur) {
    __rampParam(param, Number.isFinite(value) ? value : 0, time, dur);
  }


  function mkEngine(kind='player'){
    ensure();

    const baseFreq = kind === 'player' ? 68 : 62;
    const rampFor = () => Math.max(0.005, __diConfig.ramp || 0.02);

    const engineBus = ctx.createGain();
    engineBus.gain.value = 1.0;

    const toneSum = ctx.createGain();
    toneSum.gain.value = 1.0;

    const corePre = ctx.createGain();
    corePre.gain.value = 1.0;

    const coreFold = ctx.createWaveShaper();
    coreFold.curve = tronFoldCurve(14);
    corePre.connect(coreFold);

    const coreSculpt = ctx.createBiquadFilter();
    coreSculpt.type = 'lowpass';
    coreSculpt.frequency.value = 320;
    coreSculpt.Q.value = 1.0;
    coreFold.connect(coreSculpt);

    const coreTilt = ctx.createBiquadFilter();
    coreTilt.type = 'peaking';
    coreTilt.frequency.value = 640;
    coreTilt.Q.value = 1.0;
    coreTilt.gain.value = 1.3;
    coreSculpt.connect(coreTilt);

    const coreBright = ctx.createBiquadFilter();
    coreBright.type = 'highshelf';
    coreBright.frequency.value = 2600;
    coreBright.gain.value = 0.8;
    coreTilt.connect(coreBright);

    const coreGain = ctx.createGain();
    coreGain.gain.value = 0.0;
    coreBright.connect(coreGain);
    coreGain.connect(toneSum);

    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.value = baseFreq;

    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.7;
    bodyOsc.connect(bodyGain).connect(corePre);

    const shapeOsc = ctx.createOscillator();
    shapeOsc.type = 'sawtooth';
    shapeOsc.frequency.value = baseFreq * 2.02;

    const shapeGain = ctx.createGain();
    shapeGain.gain.value = 0.35;
    shapeOsc.connect(shapeGain).connect(corePre);

    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.value = Math.max(34, baseFreq / 2);

    const subDrive = ctx.createWaveShaper();
    subDrive.curve = tronFoldCurve(10);
    subOsc.connect(subDrive);

    const subFilter = ctx.createBiquadFilter();
    subFilter.type = 'lowpass';
    subFilter.frequency.value = 180;
    subFilter.Q.value = 0.9;
    subDrive.connect(subFilter);

    const subGain = ctx.createGain();
    subGain.gain.value = 0.0;
    subFilter.connect(subGain);
    subGain.connect(toneSum);

    const pulseOsc = ctx.createOscillator();
    pulseOsc.type = 'square';
    pulseOsc.frequency.value = baseFreq * 0.5;

    const pulseFilter = ctx.createBiquadFilter();
    pulseFilter.type = 'bandpass';
    pulseFilter.frequency.value = 120;
    pulseFilter.Q.value = 1.5;
    pulseOsc.connect(pulseFilter);

    const pulseGain = ctx.createGain();
    pulseGain.gain.value = 0.0;
    pulseFilter.connect(pulseGain);
    pulseGain.connect(toneSum);

    const humOscA = ctx.createOscillator();
    humOscA.type = 'sine';
    humOscA.frequency.value = 90;
    humOscA.detune.value = -6;

    const humOscB = ctx.createOscillator();
    humOscB.type = 'sine';
    humOscB.frequency.value = 90 * 1.01;
    humOscB.detune.value = 6;

    const humDetuneLfo = ctx.createOscillator();
    humDetuneLfo.type = 'sine';
    humDetuneLfo.frequency.value = 0.3;

    const humDetuneDepth = ctx.createGain();
    humDetuneDepth.gain.value = 0.0;
    humDetuneLfo.connect(humDetuneDepth);

    const humDetuneInvert = ctx.createGain();
    humDetuneInvert.gain.value = -1;
    humDetuneDepth.connect(humOscB.detune);
    humDetuneDepth.connect(humDetuneInvert);
    humDetuneInvert.connect(humOscA.detune);

    const humAGain = ctx.createGain();
    humAGain.gain.value = 0.5;
    humOscA.connect(humAGain);

    const humBGain = ctx.createGain();
    humBGain.gain.value = 0.5;
    humOscB.connect(humBGain);

    const humBlend = ctx.createGain();
    humBlend.gain.value = 0.0;
    humAGain.connect(humBlend);
    humBGain.connect(humBlend);
    humBlend.connect(toneSum);

    const humTremLfo = ctx.createOscillator();
    humTremLfo.type = 'sine';
    humTremLfo.frequency.value = 0.26;

    const humTremDepth = ctx.createGain();
    humTremDepth.gain.value = 0.0;
    humTremLfo.connect(humTremDepth);
    humTremDepth.connect(humBlend.gain);

    const whirrOscA = ctx.createOscillator();
    whirrOscA.type = 'sawtooth';
    whirrOscA.frequency.value = 120;
    whirrOscA.detune.value = -4;

    const whirrOscB = ctx.createOscillator();
    whirrOscB.type = 'square';
    whirrOscB.frequency.value = 120 * 1.004;
    whirrOscB.detune.value = 4;

    const whirrBlend = ctx.createGain();
    whirrBlend.gain.value = 0.72;
    whirrOscA.connect(whirrBlend);
    whirrOscB.connect(whirrBlend);

    const whirrFilter = ctx.createBiquadFilter();
    whirrFilter.type = 'bandpass';
    whirrFilter.frequency.value = 240;
    whirrFilter.Q.value = 1.2;
    whirrBlend.connect(whirrFilter);

    const whirrGain = ctx.createGain();
    whirrGain.gain.value = 0.0;
    whirrFilter.connect(whirrGain);
    whirrGain.connect(toneSum);

    const whirrVerbTap = ctx.createGain();
    whirrVerbTap.gain.value = 0.0;
    whirrFilter.connect(whirrVerbTap);

    const rawEngineOsc = ctx.createOscillator();
    rawEngineOsc.type = 'sawtooth';
    rawEngineOsc.frequency.value = 75;

    const rawEngineDrive = ctx.createWaveShaper();
    rawEngineDrive.curve = tronFoldCurve(9);
    rawEngineOsc.connect(rawEngineDrive);

    const rawEngineFilter = ctx.createBiquadFilter();
    rawEngineFilter.type = 'bandpass';
    rawEngineFilter.frequency.value = 75;
    rawEngineFilter.Q.value = 1.6;
    rawEngineDrive.connect(rawEngineFilter);

    const rawEngineGain = ctx.createGain();
    rawEngineGain.gain.value = 0.0;
    rawEngineFilter.connect(rawEngineGain);
    rawEngineGain.connect(toneSum);

    const whirrDetuneLfo = ctx.createOscillator();
    whirrDetuneLfo.type = 'sine';
    whirrDetuneLfo.frequency.value = 0.42;

    const whirrDetuneDepth = ctx.createGain();
    whirrDetuneDepth.gain.value = 0.0;
    whirrDetuneLfo.connect(whirrDetuneDepth);

    const whirrDetuneInvert = ctx.createGain();
    whirrDetuneInvert.gain.value = -1;
    whirrDetuneDepth.connect(whirrOscB.detune);
    whirrDetuneDepth.connect(whirrDetuneInvert);
    whirrDetuneInvert.connect(whirrOscA.detune);

    const whirrTremLfo = ctx.createOscillator();
    whirrTremLfo.type = 'sine';
    whirrTremLfo.frequency.value = 0.9;

    const whirrTremDepth = ctx.createGain();
    whirrTremDepth.gain.value = 0.0;
    whirrTremLfo.connect(whirrTremDepth);
    whirrTremDepth.connect(whirrGain.gain);

    const sheenOsc = ctx.createOscillator();
    sheenOsc.type = 'triangle';
    sheenOsc.frequency.value = Math.max(600, (__diConfig.whineFreq || 1500) * 0.7);

    const sheenFilter = ctx.createBiquadFilter();
    sheenFilter.type = 'bandpass';
    sheenFilter.frequency.value = Math.max(900, (__diConfig.whineFreq || 1500));
    sheenFilter.Q.value = (__diConfig.whineQ || 1.2);
    sheenOsc.connect(sheenFilter);

    const sheenGain = ctx.createGain();
    sheenGain.gain.value = 0.0;
    sheenFilter.connect(sheenGain);
    sheenGain.connect(toneSum);

    const sparkNoise = whiteNoise(ctx, 2.4);
    sparkNoise.loop = true;

    const sparkHP = ctx.createBiquadFilter();
    sparkHP.type = 'highpass';
    sparkHP.frequency.value = (__diConfig.crackleHighpass || 2600);
    sparkNoise.connect(sparkHP);

    const sparkBP = ctx.createBiquadFilter();
    sparkBP.type = 'bandpass';
    sparkBP.frequency.value = 3600;
    sparkBP.Q.value = 1.2;
    sparkHP.connect(sparkBP);

    const sparkGain = ctx.createGain();
    sparkGain.gain.value = 0.0;
    sparkBP.connect(sparkGain);
    sparkGain.connect(toneSum);

    const ionNoise = whiteNoise(ctx, 2.8);
    ionNoise.loop = true;

    const ionMetallicPre = ctx.createBiquadFilter();
    ionMetallicPre.type = 'bandpass';
    ionMetallicPre.frequency.value = 130;
    ionMetallicPre.Q.value = 1.5;
    ionNoise.connect(ionMetallicPre);

    const ionMetallicAir = ctx.createBiquadFilter();
    ionMetallicAir.type = 'peaking';
    ionMetallicAir.frequency.value = 2100;
    ionMetallicAir.Q.value = 0.9;
    ionMetallicAir.gain.value = 1.2;
    ionMetallicPre.connect(ionMetallicAir);

    const ionMetallicVerb = ctx.createGain();
    ionMetallicVerb.gain.value = 0.0;
    ionMetallicAir.connect(ionMetallicVerb);
    ionMetallicVerb.connect(reverb);

    const ionHP = ctx.createBiquadFilter();
    ionHP.type = 'highpass';
    ionHP.frequency.value = 220;
    ionNoise.connect(ionHP);

    const ionBP = ctx.createBiquadFilter();
    ionBP.type = 'bandpass';
    ionBP.frequency.value = 520;
    ionBP.Q.value = 0.9;
    ionHP.connect(ionBP);

    const ionColor = ctx.createBiquadFilter();
    ionColor.type = 'peaking';
    ionColor.frequency.value = 1800;
    ionColor.Q.value = 0.9;
    ionColor.gain.value = 3.2;
    ionBP.connect(ionColor);

    const ionGain = ctx.createGain();
    ionGain.gain.value = 0.0;
    ionColor.connect(ionGain);
    ionGain.connect(toneSum);

    const ionVerbSend = ctx.createGain();
    ionVerbSend.gain.value = 0.0;
    ionGain.connect(ionVerbSend);
    ionVerbSend.connect(reverb);

    const ionChorusSend = ctx.createGain();
    ionChorusSend.gain.value = 0.0;
    ionColor.connect(ionChorusSend);

    const gritOsc = ctx.createOscillator();
    gritOsc.type = 'sawtooth';
    gritOsc.frequency.value = baseFreq * 4.6;

    const gritFold = ctx.createWaveShaper();
    gritFold.curve = bitcrushCurve(5);
    gritOsc.connect(gritFold);

    const gritFilter = ctx.createBiquadFilter();
    gritFilter.type = 'bandpass';
    gritFilter.frequency.value = 1800;
    gritFilter.Q.value = 1.3;
    gritFold.connect(gritFilter);

    const gritGain = ctx.createGain();
    gritGain.gain.value = 0.0;
    gritFilter.connect(gritGain);
    gritGain.connect(toneSum);

    const metallicOsc = ctx.createOscillator();
    metallicOsc.type = 'sawtooth';
    metallicOsc.frequency.value = baseFreq * 6.4;

    const metallicFold = ctx.createWaveShaper();
    metallicFold.curve = tronFoldCurve(12);
    metallicOsc.connect(metallicFold);

    const metallicFilter = ctx.createBiquadFilter();
    metallicFilter.type = 'bandpass';
    metallicFilter.frequency.value = 1500;
    metallicFilter.Q.value = 3.0;
    metallicFold.connect(metallicFilter);

    const metallicTilt = ctx.createBiquadFilter();
    metallicTilt.type = 'highpass';
    metallicTilt.frequency.value = 480;
    metallicTilt.Q.value = 0.8;
    metallicFilter.connect(metallicTilt);

    const metallicGain = ctx.createGain();
    metallicGain.gain.value = 0.0;
    metallicTilt.connect(metallicGain);
    metallicGain.connect(toneSum);

    const metallicChorusSend = ctx.createGain();
    metallicChorusSend.gain.value = 0.0;
    metallicTilt.connect(metallicChorusSend);

    const metallicLfo = ctx.createOscillator();
    metallicLfo.type = 'sine';
    metallicLfo.frequency.value = 5.2;

    const metallicDepth = ctx.createGain();
    metallicDepth.gain.value = 0.0;
    metallicLfo.connect(metallicDepth);
    metallicDepth.connect(metallicOsc.detune);

    const toneColor = ctx.createBiquadFilter();
    toneColor.type = 'peaking';
    toneColor.frequency.value = 320;
    toneColor.Q.value = 0.95;
    toneColor.gain.value = 1.2;
    toneSum.connect(toneColor);

    const midColor = ctx.createBiquadFilter();
    midColor.type = 'peaking';
    midColor.frequency.value = 820;
    midColor.Q.value = 1.0;
    midColor.gain.value = 1.1;
    toneColor.connect(midColor);

    const chorusTap = ctx.createGain();
    chorusTap.gain.value = 0.0;
    midColor.connect(chorusTap);

    const chorusDelayA = ctx.createDelay();
    chorusDelayA.delayTime.value = 0.018;
    chorusTap.connect(chorusDelayA);

    const chorusDelayB = ctx.createDelay();
    chorusDelayB.delayTime.value = 0.027;
    chorusTap.connect(chorusDelayB);

    const chorusFilterA = ctx.createBiquadFilter();
    chorusFilterA.type = 'bandpass';
    chorusFilterA.frequency.value = 1500;
    chorusFilterA.Q.value = 0.9;
    chorusDelayA.connect(chorusFilterA);

    const chorusFilterB = ctx.createBiquadFilter();
    chorusFilterB.type = 'bandpass';
    chorusFilterB.frequency.value = 900;
    chorusFilterB.Q.value = 1.2;
    chorusDelayB.connect(chorusFilterB);

    const chorusMixA = ctx.createGain();
    chorusMixA.gain.value = 0.0;
    chorusFilterA.connect(chorusMixA);

    const chorusMixB = ctx.createGain();
    chorusMixB.gain.value = 0.0;
    chorusFilterB.connect(chorusMixB);

    const chorusVerbSend = ctx.createGain();
    chorusVerbSend.gain.value = 0.0;
    chorusFilterA.connect(chorusVerbSend);
    chorusFilterB.connect(chorusVerbSend);
    chorusVerbSend.connect(reverb);

    const chorusLfo = ctx.createOscillator();
    chorusLfo.type = 'sine';
    chorusLfo.frequency.value = 0.6;

    const chorusDepthA = ctx.createGain();
    chorusDepthA.gain.value = 0.0;
    chorusLfo.connect(chorusDepthA);
    chorusDepthA.connect(chorusDelayA.delayTime);

    const chorusDepthB = ctx.createGain();
    chorusDepthB.gain.value = 0.0;
    const chorusInvert = ctx.createGain();
    chorusInvert.gain.value = -1;
    chorusLfo.connect(chorusDepthB);
    chorusDepthB.connect(chorusInvert);
    chorusInvert.connect(chorusDelayB.delayTime);

    metallicChorusSend.connect(chorusTap);
    ionChorusSend.connect(chorusTap);

    const airColor = ctx.createBiquadFilter();
    airColor.type = 'highshelf';
    airColor.frequency.value = 2600;
    airColor.gain.value = 1.0;
    midColor.connect(airColor);

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = __diConfig.highpass || 90;
    highpass.Q.value = 0.85;
    airColor.connect(highpass);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = __diConfig.lowpass || 8400;
    lowpass.Q.value = 0.7;
    highpass.connect(lowpass);

    const dryTap = ctx.createGain();
    dryTap.gain.value = 0.0;
    lowpass.connect(dryTap);

    const wetTap = ctx.createGain();
    wetTap.gain.value = 0.0;
    lowpass.connect(wetTap);

    const wetColor = ctx.createBiquadFilter();
    wetColor.type = 'bandpass';
    wetColor.frequency.value = 1900;
    wetColor.Q.value = 1.3;
    wetTap.connect(wetColor);

    const wetOut = ctx.createGain();
    wetOut.gain.value = 0.0;
    wetColor.connect(wetOut);

    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.0;
    wetColor.connect(reverbSend);
    reverbSend.connect(reverb);

    const shimmerSend = ctx.createGain();
    shimmerSend.gain.value = 0.0;
    sparkGain.connect(shimmerSend);
    sheenGain.connect(shimmerSend);
    whirrVerbTap.connect(shimmerSend);
    metallicGain.connect(shimmerSend);
    shimmerSend.connect(reverb);

    const mixBus = ctx.createGain();
    mixBus.gain.value = 1.0;
    dryTap.connect(mixBus);
    wetOut.connect(mixBus);
    chorusMixA.connect(mixBus);
    chorusMixB.connect(mixBus);

    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

    const envelope = ctx.createGain();
    envelope.gain.value = 0.0;
    if (panner) {
      mixBus.connect(panner);
      panner.connect(envelope);
    } else {
      mixBus.connect(envelope);
    }

    envelope.connect(engineBus);
    engineBus.connect(masterGain);

    const throbLfo = ctx.createOscillator();
    throbLfo.type = 'sine';
    throbLfo.frequency.value = 1.4;

    const throbDepth = ctx.createGain();
    throbDepth.gain.value = 0.0;
    throbLfo.connect(throbDepth);
    throbDepth.connect(corePre.gain);

    const flutterLfo = ctx.createOscillator();
    flutterLfo.type = 'triangle';
    flutterLfo.frequency.value = 12;

    const flutterDepth = ctx.createGain();
    flutterDepth.gain.value = 0.0;
    flutterLfo.connect(flutterDepth);
    flutterDepth.connect(bodyOsc.detune);
    flutterDepth.connect(shapeOsc.detune);
    flutterDepth.connect(pulseOsc.detune);

    const shimmerLfo = ctx.createOscillator();
    shimmerLfo.type = 'sine';
    shimmerLfo.frequency.value = 6;

    const shimmerDepth = ctx.createGain();
    shimmerDepth.gain.value = 0.0;
    shimmerLfo.connect(shimmerDepth);
    shimmerDepth.connect(sparkGain.gain);

    let autoPan = null;
    let autoPanDepth = null;
    if (panner) {
      autoPan = ctx.createOscillator();
      autoPan.type = 'sine';
      autoPan.frequency.value = 0.2;

      autoPanDepth = ctx.createGain();
      autoPanDepth.gain.value = 0.0;
      autoPan.connect(autoPanDepth).connect(panner.pan);
    }

    const stoppables = [];
    function startNode(node){
      try { node.start(); stoppables.push(node); } catch (_) {}
      return node;
    }

    startNode(bodyOsc);
    startNode(shapeOsc);
    startNode(subOsc);
    startNode(pulseOsc);
    startNode(humOscA);
    startNode(humOscB);
    startNode(whirrOscA);
    startNode(whirrOscB);
    startNode(rawEngineOsc);
    startNode(sheenOsc);
    startNode(sparkNoise);
    startNode(ionNoise);
    startNode(gritOsc);
    startNode(metallicOsc);
    startNode(throbLfo);
    startNode(flutterLfo);
    startNode(shimmerLfo);
    startNode(humDetuneLfo);
    startNode(humTremLfo);
    startNode(whirrDetuneLfo);
    startNode(whirrTremLfo);
    startNode(metallicLfo);
    startNode(chorusLfo);
    
    if (autoPan) startNode(autoPan);

    const state = { intensity: 0, boost: 0, active: false };

    function applyState(){
      const t = now();
      const k = __clamp01(state.intensity);
      const boost = state.boost ? 1 : 0;
      const rampTime = rampFor();

      const baseGain = Math.max(0, __diConfig.baseGain || 0.6);
      const toneMix = __clamp(__diConfig.toneMix ?? 0.5, 0, 1);
      const noiseMix = Math.max(0, __diConfig.noiseMix ?? 0.01);
      const midScale = __mixConfig.engine.mid || 1;
      const subScale = __mixConfig.engine.sub || 1;
      const whineScale = __mixConfig.engine.whine || 1;
      const dryScale = __mixConfig.engine.dry || 1;
      const wetScale = __mixConfig.engine.wet || 1;

      const lowMix = Math.max(0, __diConfig.butterLowMix ?? 0.6);
      const midMix = Math.max(0, __diConfig.butterMidMix ?? 0.4);
      const noiseBedMix = Math.max(0, __diConfig.butterNoiseMix ?? 0.12);
      const throbDepthScale = Math.max(0, __diConfig.butterLfoDepth ?? 0.26);
      const throbRateBase = Math.max(0.05, __diConfig.butterLfoRate ?? 0.6);
      const crackleMix = Math.max(0, __diConfig.crackleMix ?? 0.08);
      const crackleDepth = Math.max(0, __diConfig.crackleDepth ?? 0.4);
      const crackleHighpass = Math.max(400, __diConfig.crackleHighpass || 2600);
      const buzzMix = Math.max(0, __diConfig.buzzMix ?? 0.05);
      const whineBase = Math.max(500, __diConfig.whineFreq || 1500);
      const whineQ = Math.max(0.2, __diConfig.whineQ || 1.1);

      const rpmRaw = baseFreq * (0.68 + k * 1.55 + boost * 0.65);
      const rpm = Math.max(40, Math.min(150, rpmRaw));

      __rampHz(bodyOsc.frequency, rpm, t, rampTime);
      __rampHz(shapeOsc.frequency, rpm * (2.02 + k * 0.04), t, rampTime);
      const detune = (__diConfig.detuneCents || 0);
      __rampDetune(bodyOsc.detune, -detune * 0.4, t, rampTime);
      __rampDetune(shapeOsc.detune, detune * 0.6, t, rampTime);

      __rampHz(subOsc.frequency, Math.max(32, rpm / 2.05), t, rampTime);
      __rampHz(pulseOsc.frequency, Math.max(36, rpm * 0.5 + boost * 6), t, rampTime);
      __rampHz(sheenOsc.frequency, whineBase * (0.72 + k * 0.85 + boost * 0.5), t, rampTime);
      __rampParam(sheenFilter.Q, whineQ + k * 0.6 + boost * 0.35, t, rampTime);
      __rampHz(gritOsc.frequency, Math.max(220, rpm * 4.6 + boost * 120), t, rampTime);

      __rampHz(coreSculpt.frequency, 280 + k * 240 + boost * 180, t, rampTime);
      __rampParam(coreSculpt.Q, 0.95 + k * 0.4 + boost * 0.25, t, rampTime);
      __rampHz(coreTilt.frequency, 600 + k * 320 + boost * 200, t, rampTime);
      __rampParam(coreTilt.gain, 1.2 + midMix * 0.8 + k * 1.4 + boost * 0.9, t, rampTime);
      __rampParam(coreBright.gain, 0.5 + toneMix * 0.7 + k * 0.6 + boost * 0.5, t, rampTime);

      __rampHz(subFilter.frequency, 160 + k * 210 + boost * 150, t, rampTime);
      __rampParam(subFilter.Q, 0.85 + k * 0.4 + boost * 0.25, t, rampTime);

      __rampHz(pulseFilter.frequency, Math.max(90, rpm * 1.5 + boost * 120), t, rampTime);
      __rampParam(pulseFilter.Q, 1.2 + k * 0.9 + boost * 0.5, t, rampTime);

      __rampHz(sparkHP.frequency, crackleHighpass * (0.8 + k * 0.4 + boost * 0.26), t, rampTime);
      __rampHz(sparkBP.frequency, 3000 + k * 1600 + boost * 1100, t, rampTime);

      __rampParam(toneColor.gain, 1.1 + lowMix * 0.4 + k * 0.9 + boost * 0.6, t, rampTime);
      __rampParam(midColor.gain, 1.0 + midMix * 0.5 + k * 1.4 + boost * 0.8, t, rampTime);
      __rampParam(airColor.gain, 0.9 + toneMix * 0.6 + k * 0.7 + boost * 0.5, t, rampTime);

      __rampHz(highpass.frequency, Math.max(50, (__diConfig.highpass || 90) + k * 90 + boost * 60), t, rampTime);
      __rampHz(lowpass.frequency, Math.min(14000, (__diConfig.lowpass || 8400) + k * 1600 + boost * 900), t, rampTime);

      __rampGain(corePre.gain, 0.8 + midMix * 0.5 + k * 0.9 + boost * 0.6, t, rampTime);

      const coreLevel = baseGain * midScale * (0.32 + toneMix * (0.62 + k * 0.8 + boost * 0.55));
      const subLevel = baseGain * subScale * lowMix * (0.22 + k * 0.55 + boost * 0.4);
      const pulseLevel = baseGain * midScale * (0.04 + toneMix * (0.16 + k * 0.24 + boost * 0.17));
      const humLevel = baseGain * subScale * (0.08 + lowMix * 0.15 + k * 0.22 + boost * 0.18);
      const humTrem = humLevel * 0.28;
      const humSpread = 4 + k * 8 + boost * 6;
      const humCenter = 92 + k * 4 + boost * 3;
      const rawEngineLevel = baseGain * subScale * (0.06 + lowMix * 0.13 + k * 0.14 + boost * 0.11);
      const rawEngineCenter = 78 + k * 12 + boost * 8;
      const whirrLevel = baseGain * subScale * (0.07 + lowMix * 0.15 + k * 0.16 + boost * 0.14);
      const whirrTrem = whirrLevel * 0.28;
      const whirrSpread = 3 + k * 7 + boost * 5;
      const whirrCenter = 126 + k * 18 + boost * 12;
      const whirrVerbLevel = whirrLevel * 0.24;
      const metallicLevel = baseGain * midScale * (0.05 + toneMix * 0.25 + k * 0.22 + boost * 0.18);
      const metallicMod = 4 + k * 14 + boost * 10;
      const metallicFocus = 1300 + k * 1900 + boost * 1200;
      const ionLevel = baseGain * noiseMix * (0.06 + noiseBedMix * 0.28 + k * 0.12 + boost * 0.1);
      const ionVerbLevel = ionLevel * (0.4 + toneMix * 0.2);
      const ionBand = 420 + k * 420 + boost * 240;
      const ionAir = 1600 + k * 1200 + boost * 800;
      const ionMetallicFocus = 120 + k * 70 + boost * 45;
      const ionMetallicAirFreq = 2100 + k * 1200 + boost * 800;
      const ionMetallicAirLift = 1.2 + toneMix * 0.7 + k * 0.5 + boost * 0.35;
      const ionMetallicVerbLevel = ionLevel * (0.18 + toneMix * 0.16 + k * 0.1 + boost * 0.07);
      const sheenLevel = baseGain * whineScale * (0.03 + k * 0.16 + boost * 0.12);
      const sparkLevel = baseGain * whineScale * noiseMix * (0.009 + crackleMix * 0.28 + k * 0.05 + boost * 0.04);
      const gritLevel = baseGain * whineScale * (buzzMix * 0.7) * (0.012 + k * 0.06 + boost * 0.05);
      const chorusFeed = 0.25 + toneMix * 0.35 + k * 0.25 + boost * 0.2;
      const chorusLevel = baseGain * wetScale * (0.14 + toneMix * 0.18 + k * 0.16 + boost * 0.12);
      const chorusDepthAmount = 0.0012 + k * 0.0038 + boost * 0.003;
      const chorusDelayASet = 0.015 + k * 0.004 + boost * 0.003;
      const chorusDelayBSet = 0.022 + k * 0.005 + boost * 0.0035;

      __rampGain(coreGain.gain, coreLevel, t, rampTime);
      __rampGain(subGain.gain, subLevel, t, rampTime);
      __rampGain(pulseGain.gain, pulseLevel, t, rampTime);
      __rampGain(humBlend.gain, humLevel, t, rampTime);
      __rampGain(rawEngineGain.gain, rawEngineLevel, t, rampTime);
      __rampGain(whirrGain.gain, whirrLevel, t, rampTime);
      __rampGain(whirrVerbTap.gain, whirrVerbLevel, t, rampTime);
      __rampGain(metallicGain.gain, metallicLevel, t, rampTime);
      __rampGain(metallicChorusSend.gain, metallicLevel * 0.85, t, rampTime);
      __rampGain(ionGain.gain, ionLevel, t, rampTime);
      __rampGain(ionVerbSend.gain, ionVerbLevel, t, rampTime);
      __rampGain(ionMetallicVerb.gain, ionMetallicVerbLevel, t, rampTime);
      __rampGain(ionChorusSend.gain, ionLevel * 0.6, t, rampTime);
      __rampGain(sheenGain.gain, sheenLevel, t, rampTime);
      __rampGain(sparkGain.gain, sparkLevel, t, rampTime);
      __rampGain(gritGain.gain, gritLevel, t, rampTime);
      __rampHz(humOscA.frequency, Math.max(40, humCenter * 0.985), t, rampTime);
      __rampHz(humOscB.frequency, Math.max(40, humCenter * 1.015), t, rampTime);
      __rampGain(humDetuneDepth.gain, humSpread * 0.75, t, rampTime);
      __rampParam(humDetuneLfo.frequency, 0.18 + k * 0.36 + boost * 0.3, t, rampTime);
      __rampParam(humTremLfo.frequency, 0.25 + k * 0.45 + boost * 0.35, t, rampTime);
      __rampGain(humTremDepth.gain, humTrem * 0.85, t, rampTime);
      __rampHz(rawEngineOsc.frequency, Math.max(45, rawEngineCenter), t, rampTime);
      __rampHz(rawEngineFilter.frequency, Math.max(70, rawEngineCenter * (1.05 + k * 0.4 + boost * 0.25)), t, rampTime);
      __rampParam(rawEngineFilter.Q, 1.3 + k * 0.4 + boost * 0.25, t, rampTime);
      __rampHz(whirrOscA.frequency, Math.max(50, whirrCenter * 0.99), t, rampTime);
      __rampHz(whirrOscB.frequency, Math.max(50, whirrCenter * 1.01), t, rampTime);
      __rampHz(whirrFilter.frequency, Math.max(140, whirrCenter * (1.3 + k * 0.55 + boost * 0.38)), t, rampTime);
      __rampParam(whirrFilter.Q, 1.05 + k * 0.5 + boost * 0.32, t, rampTime);
      __rampGain(whirrDetuneDepth.gain, whirrSpread * 0.65, t, rampTime);
      __rampParam(whirrDetuneLfo.frequency, 0.32 + k * 0.42 + boost * 0.3, t, rampTime);
      __rampParam(whirrTremLfo.frequency, 0.7 + k * 0.55 + boost * 0.4, t, rampTime);
      __rampGain(whirrTremDepth.gain, whirrTrem * 0.82, t, rampTime);
      __rampHz(metallicOsc.frequency, Math.max(240, rpm * 6.6 + boost * 220), t, rampTime);
      __rampHz(metallicTilt.frequency, 460 + k * 260 + boost * 180, t, rampTime);
      __rampParam(metallicFilter.frequency, metallicFocus, t, rampTime);
      __rampParam(metallicFilter.Q, 2.4 + k * 1.2 + boost * 0.8, t, rampTime);
      __rampParam(metallicLfo.frequency, 3.2 + k * 4.5 + boost * 3.2, t, rampTime);
      __rampGain(metallicDepth.gain, metallicMod, t, rampTime);
      __rampHz(ionHP.frequency, Math.max(120, 200 + k * 220 + boost * 160), t, rampTime);
      __rampHz(ionBP.frequency, Math.max(160, ionBand), t, rampTime);
      __rampHz(ionColor.frequency, ionAir, t, rampTime);
      __rampHz(ionMetallicPre.frequency, Math.max(80, ionMetallicFocus), t, rampTime);
      __rampHz(ionMetallicAir.frequency, ionMetallicAirFreq, t, rampTime);
      __rampParam(ionMetallicAir.gain, ionMetallicAirLift, t, rampTime);
      __rampParam(ionColor.gain, 3.0 + toneMix * 1.6 + k * 1.4 + boost * 1.0, t, rampTime);
      __rampGain(chorusTap.gain, chorusFeed, t, rampTime);
      __rampParam(chorusDelayA.delayTime, chorusDelayASet, t, rampTime);
      __rampParam(chorusDelayB.delayTime, chorusDelayBSet, t, rampTime);
      __rampParam(chorusFilterA.frequency, 1100 + k * 1600 + boost * 1100, t, rampTime);
      __rampParam(chorusFilterB.frequency, 800 + k * 1200 + boost * 900, t, rampTime);
      __rampGain(chorusMixA.gain, chorusLevel, t, rampTime);
      __rampGain(chorusMixB.gain, chorusLevel * 0.88, t, rampTime);
      __rampGain(chorusVerbSend.gain, chorusLevel * 0.42, t, rampTime);
      __rampParam(chorusLfo.frequency, 0.38 + k * 0.9 + boost * 0.55, t, rampTime);
      __rampGain(chorusDepthA.gain, chorusDepthAmount, t, rampTime);
      __rampGain(chorusDepthB.gain, chorusDepthAmount, t, rampTime);
 
      const dryLevel = baseGain * dryScale * (0.46 + k * 0.56 + boost * 0.32);
      const wetLevel = baseGain * wetScale * (0.2 + k * 0.34 + boost * 0.24);
      const verbLevel = baseGain * wetScale * (0.12 + k * 0.28 + boost * 0.2);

      __rampGain(dryTap.gain, dryLevel, t, rampTime);
      __rampGain(wetOut.gain, wetLevel, t, rampTime);
      __rampGain(reverbSend.gain, verbLevel, t, rampTime * 1.15);
      __rampGain(shimmerSend.gain, 0.16 + k * 0.12 + boost * 0.1, t, rampTime);

      __rampHz(throbLfo.frequency, throbRateBase * (0.9 + k * 1.9 + boost * 1.2), t, rampTime);
      __rampGain(throbDepth.gain, throbDepthScale * (0.12 + k * 0.52 + boost * 0.4), t, rampTime);

      __rampHz(flutterLfo.frequency, 10 + k * 12 + boost * 8, t, rampTime);
      __rampGain(flutterDepth.gain, 1 + k * 8 + boost * 6, t, rampTime);

      __rampHz(shimmerLfo.frequency, 4 + (__diConfig.crackleRate || 5) * (0.4 + k * 0.6) + boost * 2, t, rampTime);
      __rampGain(shimmerDepth.gain, crackleDepth * (0.02 + noiseBedMix * 0.2 + k * 0.08 + boost * 0.06), t, rampTime);

      if (autoPan && autoPanDepth) {
        __rampHz(autoPan.frequency, 0.12 + k * 0.28 + boost * 0.22, t, rampTime);
        __rampGain(autoPanDepth.gain, 0.1 + k * 0.24 + boost * 0.18, t, rampTime);
      }
    }

    function setIntensity(v){
      state.intensity = __clamp01(v || 0);
      applyState();
    }

    function setBoost(on){
      state.boost = on ? 1 : 0;
      applyState();
    }

    function setActive(on){
      const t = now();
      state.active = !!on;
      envelope.gain.cancelScheduledValues(t);
      if (state.active) {
        const current = typeof envelope.gain.value === 'number' ? envelope.gain.value : 0;
        envelope.gain.setValueAtTime(current, t);
        envelope.gain.linearRampToValueAtTime(1.0, t + 0.18);
        envelope.gain.linearRampToValueAtTime(0.84, t + 0.6);
        applyState();
      } else {
        const current = typeof envelope.gain.value === 'number' ? envelope.gain.value : 0;
        envelope.gain.setValueAtTime(current, t);
        envelope.gain.linearRampToValueAtTime(0.0, t + 0.5);
        __rampGain(dryTap.gain, 0, t, 0.3);
        __rampGain(wetOut.gain, 0, t, 0.3);
        __rampGain(reverbSend.gain, 0, t, 0.5);
        __rampGain(shimmerSend.gain, 0, t, 0.5);
      }
    }

    function stop(){
      const t = now();
      try { envelope.gain.cancelScheduledValues(t); envelope.gain.setValueAtTime(0, t); } catch (_) {}
      try { dryTap.gain.cancelScheduledValues(t); dryTap.gain.setValueAtTime(0, t); } catch (_) {}
      try { wetOut.gain.cancelScheduledValues(t); wetOut.gain.setValueAtTime(0, t); } catch (_) {}
      try { reverbSend.gain.cancelScheduledValues(t); reverbSend.gain.setValueAtTime(0, t); } catch (_) {}
      try { shimmerSend.gain.cancelScheduledValues(t); shimmerSend.gain.setValueAtTime(0, t); } catch (_) {}
      stoppables.forEach(node => { try { node.stop(t); } catch (_) {} });
    }

    const __handle = { setIntensity, setBoost, setActive, stop, _applyMix: () => applyState() };
    try { __engines.push(__handle); } catch (_) {}

    applyState();

    return __handle;
  }

  function setMix(m = {}){
    if(!m || typeof m !== 'object') return;
    if(typeof m.master === 'number') __mixConfig.master = m.master;
    if(typeof m.reverb === 'number') __mixConfig.reverb = m.reverb;
    if(typeof m.chirpGain === 'number') __mixConfig.chirpGain = m.chirpGain;
    const eng = m.engine && typeof m.engine === 'object' ? m.engine : null;
    if(eng){
      ['dry','wet','sub','mid','whine'].forEach(key => {
        if(typeof eng[key] === 'number') __mixConfig.engine[key] = eng[key];
      });
    }
    if(masterGain){
      const t = ctx ? ctx.currentTime : 0;
      try { masterGain.gain.setValueAtTime(muted ? 0 : 0.9 * (__mixConfig.master || 1), t); } catch(_){}
    }
    if(reverbGain){
      const t = ctx ? ctx.currentTime : 0;
      try { reverbGain.gain.setValueAtTime(0.25 * (__mixConfig.reverb || 1), t); } catch(_){}
    }
    try {
      __engines.forEach(h => { try { if (h && typeof h._applyMix === 'function') h._applyMix(true); } catch(_){} });
    } catch(_){}
  }

  function applyDI(di = {}){
    if(!di || typeof di !== 'object') return;
    const map = [
      ['AUDIO_ENGINE_BASE_GAIN', 'baseGain'],
      ['AUDIO_ENGINE_RAMP', 'ramp'],
      ['AUDIO_ENGINE_GLIDE_S', 'ramp'],
      ['AUDIO_ENGINE_HIGHPASS', 'highpass'],
      ['AUDIO_ENGINE_LOWPASS', 'lowpass'],
      ['AUDIO_ENGINE_NOISE_MIX', 'noiseMix'],
      ['AUDIO_ENGINE_TONE_MIX', 'toneMix'],
      ['AUDIO_ENGINE_WHINE_FREQ', 'whineFreq'],
      ['AUDIO_ENGINE_BAND_Q', 'whineQ'],
      ['AUDIO_ENGINE_DETUNE_CENTS', 'detuneCents'],
      ['AUDIO_ENGINE_CRACKLE_MIX', 'crackleMix'],
      ['AUDIO_ENGINE_CRACKLE_RATE_HZ', 'crackleRate'],
      ['AUDIO_ENGINE_CRACKLE_HIGHPASS', 'crackleHighpass'],
      ['AUDIO_ENGINE_CRACKLE_DEPTH', 'crackleDepth'],
      ['AUDIO_ENGINE_BUZZ_MIX', 'buzzMix'],
      ['AUDIO_ENGINE_BUTTER_LOW_MIX', 'butterLowMix'],
      ['AUDIO_ENGINE_BUTTER_MID_MIX', 'butterMidMix'],
      ['AUDIO_ENGINE_BUTTER_NOISE_MIX', 'butterNoiseMix'],
      ['AUDIO_ENGINE_BUTTER_LFO_DEPTH', 'butterLfoDepth'],
      ['AUDIO_ENGINE_BUTTER_LFO_RATE', 'butterLfoRate']
    ];
    map.forEach(([src, dest]) => {
      const val = di[src];
      if(typeof val !== 'number') return;
      switch(dest){
        case 'ramp':
          __diConfig.ramp = Math.max(0.001, val);
          break;
        case 'noiseMix':
        case 'toneMix':
          __diConfig[dest] = Math.max(0, Math.min(1, val));
          break;
        case 'highpass':
        case 'lowpass':
        case 'whineFreq':
        case 'crackleHighpass':
          __diConfig[dest] = Math.max(20, val);
          break;
        case 'whineQ':
          __diConfig[dest] = Math.max(0.1, val);
          break;
        case 'crackleMix':
        case 'buzzMix':
        case 'crackleDepth':
        case 'butterNoiseMix':
        case 'butterLfoDepth':
          __diConfig[dest] = Math.max(0, val);
          break;
        case 'crackleRate':
          __diConfig[dest] = Math.max(0.1, val);
          break;
        case 'detuneCents':
          __diConfig[dest] = val;
          break;
        case 'butterLowMix':
        case 'butterMidMix':
          __diConfig[dest] = Math.max(0, Math.min(2, val));
          break;
        case 'butterLfoRate':
          __diConfig[dest] = Math.max(0.05, val);
          break;
        default:
          __diConfig[dest] = val;
      }
    });
    try {
      __engines.forEach(h => { try { if (h && typeof h._applyMix === 'function') h._applyMix(true); } catch(_){} });
    } catch(_){}
  }

  function turnChirp(side='left', preset='arcade', startDelayMs = 0) {
    ensure();
    const panNode = (ctx.createStereoPanner? ctx.createStereoPanner() : null);
    if(panNode) panNode.pan.value = (side==='left'?-0.75 : side==='right'?0.75 : 0);

    const tri = ctx.createOscillator(); tri.type='triangle';
    const s  = ctx.createOscillator(); s.type='sawtooth';
    const n  = whiteNoise(ctx, 0.18);
 
    const triG = ctx.createGain(); triG.gain.value = 0.0;
    const sG = ctx.createGain();   sG.gain.value = 0.0;
    const nG = ctx.createGain();   nG.gain.value = 0.0;
 
    const comb = ctx.createDelay(); comb.delayTime.value = 0.0025;
    const combFB = ctx.createGain(); combFB.gain.value = 0.35;
 
    const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.Q.value=11;
    const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=400;
 
    const dist = ctx.createWaveShaper(); dist.curve = distortionCurve(9);
 
    tri.connect(bp); s.connect(bp);
    bp.connect(dist); dist.connect(hp);
    hp.connect(comb); comb.connect(combFB); combFB.connect(comb);
 
    const nbp = ctx.createBiquadFilter(); nbp.type='bandpass'; nbp.frequency.value=2500; nbp.Q.value=1.6;
    n.connect(nbp);
 
    const mix = ctx.createGain();
    const __mixGain = (preset==='softer'?0.42 : preset==='louder'?0.60 : 0.5);
    mix.gain.value = __mixGain * (__mixConfig.chirpGain || 1); // preset-shaped
    comb.connect(mix);
    nbp.connect(mix);
 
    if(panNode){ mix.connect(panNode); panNode.connect(masterGain); }
    else { mix.connect(masterGain); }
 
    const vs = ctx.createGain(); vs.gain.value = 0.22; mix.connect(vs); vs.connect(reverb);
 
    const n0 = now() + (startDelayMs/1000);
    const base = 360;
    tri.frequency.setValueAtTime(base, n0);
    tri.frequency.exponentialRampToValueAtTime(base*3.8, n0+0.05);
    tri.frequency.exponentialRampToValueAtTime(base*1.2, n0+0.12);
 
    s.frequency.setValueAtTime(base*0.75, n0);
    s.frequency.exponentialRampToValueAtTime(base*3.0, n0+0.06);
    s.frequency.exponentialRampToValueAtTime(base*1.1, n0+0.14);
 
    bp.frequency.setValueAtTime(base*2.3, n0);
    bp.frequency.exponentialRampToValueAtTime(base*3.3, n0+0.06);
 
    triG.gain.setValueAtTime(0.0, n0);
    sG.gain.setValueAtTime(0.0, n0);
    nG.gain.setValueAtTime(0.0, n0);
 
    tri.connect(triG); s.connect(sG); n.connect(nG);
    triG.connect(mix); sG.connect(mix); nG.connect(mix);
 
    triG.gain.linearRampToValueAtTime(0.9, n0+0.02);
    sG.gain.linearRampToValueAtTime(0.5, n0+0.035);
    nG.gain.linearRampToValueAtTime(0.35, n0+0.02);
 
    triG.gain.exponentialRampToValueAtTime(0.002, n0+0.20);
    sG.gain.exponentialRampToValueAtTime(0.002, n0+0.20);
    nG.gain.exponentialRampToValueAtTime(0.002, n0+0.18);
 
    tri.start(n0); s.start(n0); n.start(n0);
    tri.stop(n0+0.22); s.stop(n0+0.22); n.stop(n0+0.20);
  }
 
  function whoosh(startDelayMs = 0){
    ensure();
    const noise = whiteNoise(ctx, 0.28);
    const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value = 700;
    const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value = 2200; bp.Q.value = 2.2;
    const g = ctx.createGain(); g.gain.value = 0.0;
 
    noise.connect(hp); hp.connect(bp); bp.connect(g); g.connect(masterGain);
    const vs = ctx.createGain(); vs.gain.value = 0.22; bp.connect(vs); vs.connect(reverb);
    const n0 = now() + (startDelayMs/1000);
    g.gain.linearRampToValueAtTime(0.7, n0+0.03);
    g.gain.exponentialRampToValueAtTime(0.001, n0+0.34);
    noise.start(n0); noise.stop(n0+0.34);
  }
 
  
  function powerupSplash(){
    ensure();
    const t0 = now();

    // --- Short echo bus (coin-like repeats) ---
    const echo = ctx.createDelay(); echo.delayTime.value = 0.15;
    const echoFb = ctx.createGain(); echoFb.gain.value   = 0.57;
    const echoTone = ctx.createBiquadFilter(); echoTone.type = 'lowpass'; echoTone.frequency.value = 4600;
    const echoMix = ctx.createGain(); echoMix.gain.value = 0.75;
    echo.connect(echoFb); echoFb.connect(echo);
    echo.connect(echoTone); echoTone.connect(echoMix); echoMix.connect(masterGain);
    const echoVerb = ctx.createGain(); echoVerb.gain.value = 0.54; echoTone.connect(echoVerb); echoVerb.connect(reverb);

    // --- Sparkle splash (bright filtered noise with rising tone) ---
    const sparkle = whiteNoise(ctx, 0.22);
    const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=1100;
    const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.Q.value=1.4; bp.frequency.value=2000;
    const ng = ctx.createGain(); ng.gain.value = 0.0;
    sparkle.connect(hp); hp.connect(bp); bp.connect(ng); ng.connect(masterGain);
    const vsN = ctx.createGain(); vsN.gain.value = 0.50; bp.connect(vsN); vsN.connect(reverb);
    const esN = ctx.createGain(); esN.gain.value = 0.50; bp.connect(esN); esN.connect(echo);
    ng.gain.setValueAtTime(0.0, t0);
    ng.gain.linearRampToValueAtTime(1.425, t0+0.02);
    ng.gain.exponentialRampToValueAtTime(0.001, t0+0.24);
    bp.frequency.setValueAtTime(2000, t0);
    bp.frequency.exponentialRampToValueAtTime(3800, t0+0.22);
    sparkle.start(t0); sparkle.stop(t0+0.25);

    // --- Fast ascending "coin-up" arpeggio ---
    function coin(freq, when, dur=0.18, amp=1.725){
      const o = ctx.createOscillator(); o.type='square'; o.frequency.value = freq;
      const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.Q.value=5.5; bp.frequency.value = freq*2.2;
      const g = ctx.createGain(); g.gain.value = 0.0;
      o.connect(bp); bp.connect(g); g.connect(masterGain);
      const es = ctx.createGain(); es.gain.value = 0.45; bp.connect(es); es.connect(echo);
      const vs = ctx.createGain(); vs.gain.value = 0.51; bp.connect(vs); vs.connect(reverb);
      g.gain.setValueAtTime(0.0, t0+when);
      g.gain.linearRampToValueAtTime(amp, t0+when+0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t0+when+dur);
      o.start(t0+when); o.stop(t0+when+dur+0.03);
    }

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((f, i)=> coin(f, i*0.06));
  }

  function crash(startDelayMs = 0){
    ensure();
    const noise = whiteNoise(ctx, 1.0);
    const sine = ctx.createOscillator(); sine.type = 'sine';
    const g = ctx.createGain(); g.gain.value = 0.0;
    const dist = ctx.createWaveShaper(); dist.curve = distortionCurve(20);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value=1.2;
 
    const mix = ctx.createGain(); mix.gain.value = 1.0;
    noise.connect(bp); bp.connect(dist); dist.connect(hp);
    sine.connect(mix);
    hp.connect(mix);
    mix.connect(g); g.connect(masterGain);
    const vs = ctx.createGain(); vs.gain.value = 0.45; mix.connect(vs); vs.connect(reverb);
 
    const n0 = now() + (startDelayMs/1000);
    g.gain.linearRampToValueAtTime(1.0, n0+0.02);
    g.gain.exponentialRampToValueAtTime(0.001, n0+1.0);
    sine.frequency.setValueAtTime(300, n0);
    sine.frequency.exponentialRampToValueAtTime(42, n0+0.6);
    sine.start(n0); sine.stop(n0+1.0);
    noise.start(n0); noise.stop(n0+0.9);
  }
 
  function startJingle(){
    ensure();
    beep(392, 0.10, 0.7);
    beep(523.25, 0.12, 0.8, 0.04);
    beep(659.25, 0.18, 0.9, 0.08);
  }

function racingStart3s(startDelayMs = 0){
ensure();
try { restoreMaster(); } catch(e){}
const n0 = now() + (startDelayMs/1000);

// --- Short echo bus for musical hits ---
const echo = ctx.createDelay(); echo.delayTime.value = 0.18;
const echoFb = ctx.createGain(); echoFb.gain.value = 0.28;
const echoTone = ctx.createBiquadFilter(); echoTone.type = 'lowpass'; echoTone.frequency.value = 3600;
const echoMix = ctx.createGain(); echoMix.gain.value = 0.38;
echo.connect(echoFb); echoFb.connect(echo);
echo.connect(echoTone); echoTone.connect(echoMix); echoMix.connect(masterGain);
const echoVerb = ctx.createGain(); echoVerb.gain.value = 0.24; echoTone.connect(echoVerb); echoVerb.connect(reverb);

// === Bass drum (sine drop + transient click) ===
function kick(when){
  const bass = ctx.createOscillator(); bass.type = 'sine';
  const amp  = ctx.createGain(); amp.gain.value = 0.0;
  const lp   = ctx.createBiquadFilter(); lp.type='lowpass'; lp.Q.value = 0.7; lp.frequency.value = 280;
  bass.connect(lp); lp.connect(amp); amp.connect(masterGain);
  const vs = ctx.createGain(); vs.gain.value = 0.22; amp.connect(vs); vs.connect(reverb);
  const es = ctx.createGain(); es.gain.value = 0.18; amp.connect(es); es.connect(echo);

  // Snappy click layer
  const click = whiteNoise(ctx, 0.03);
  const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value = 2200;
  const cg = ctx.createGain(); cg.gain.value = 0.0;
  click.connect(hp); hp.connect(cg); cg.connect(masterGain);

  bass.frequency.setValueAtTime(88, n0+when);
  bass.frequency.exponentialRampToValueAtTime(46, n0+when+0.16);
  amp.gain.setValueAtTime(0.0, n0+when);
  amp.gain.linearRampToValueAtTime(1.0, n0+when+0.006);
  amp.gain.exponentialRampToValueAtTime(0.001, n0+when+0.30);

  cg.gain.setValueAtTime(0.0, n0+when);
  cg.gain.linearRampToValueAtTime(0.42, n0+when+0.004);
  cg.gain.exponentialRampToValueAtTime(0.001, n0+when+0.05);

  bass.start(n0+when); bass.stop(n0+when+0.34);
  click.start(n0+when); click.stop(n0+when+0.07);
}

// === Cymbal (bright noise with high‑pass + band‑pass) ===
function cymbal(when){
  const noise = whiteNoise(ctx, 0.5);
  const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value = 5200;
  const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value = 8800; bp.Q.value = 0.9;
  const amp = ctx.createGain(); amp.gain.value = 0.0;
  noise.connect(hp); hp.connect(bp); bp.connect(amp); amp.connect(masterGain);
  const vs = ctx.createGain(); vs.gain.value = 0.46; amp.connect(vs); vs.connect(reverb);
  const es = ctx.createGain(); es.gain.value = 0.25; amp.connect(es); es.connect(echo);

  amp.gain.setValueAtTime(0.0, n0+when);
  amp.gain.linearRampToValueAtTime(0.95, n0+when+0.004);
  amp.gain.exponentialRampToValueAtTime(0.001, n0+when+0.48);

  noise.start(n0+when); noise.stop(n0+when+0.52);
}

// === Brass stab (detuned saws through low‑pass with filter envelope) ===
function brassStab(freq, when){
  const triad = [1, 5/4, 3/2];   // major triad: root, 3rd, 5th
  const bus = ctx.createGain();  // sum of all voices
  const lp  = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.9; lp.frequency.value = 900;
  const amp = ctx.createGain(); amp.gain.value = 0.0;
  bus.connect(lp); lp.connect(amp); amp.connect(masterGain);
  const vs = ctx.createGain(); vs.gain.value = 0.38; amp.connect(vs); vs.connect(reverb);
  const es = ctx.createGain(); es.gain.value = 0.31; amp.connect(es); es.connect(echo);

  triad.forEach(mult => {
    const f = freq * mult;
    const o1 = ctx.createOscillator(); o1.type='sawtooth'; o1.frequency.value = f;   o1.detune.value = -7;
    const o2 = ctx.createOscillator(); o2.type='sawtooth'; o2.frequency.value = f;   o2.detune.value = +6;
    o1.frequency.exponentialRampToValueAtTime(f*0.98, n0+when+0.28);
    o2.frequency.exponentialRampToValueAtTime(f*0.98, n0+when+0.28);
    o1.connect(bus); o2.connect(bus);
    o1.start(n0+when); o2.start(n0+when);
    o1.stop(n0+when+0.62); o2.stop(n0+when+0.62);
  });

  lp.frequency.setValueAtTime(900, n0+when);
  lp.frequency.exponentialRampToValueAtTime(4200, n0+when+0.04);
  lp.frequency.exponentialRampToValueAtTime(1800, n0+when+0.22);
  lp.frequency.exponentialRampToValueAtTime(1200, n0+when+0.46);

  amp.gain.setValueAtTime(0.0, n0+when);
  amp.gain.linearRampToValueAtTime(1.0, n0+when+0.018);
  amp.gain.linearRampToValueAtTime(0.68, n0+when+0.06);
  amp.gain.exponentialRampToValueAtTime(0.001, n0+when+0.52);
}

// Three hits at 0s, 1s, 2s. Brass rises each beat.
const freqs = [196.00, 220.00, 246.94]; // G3, A3, B3
for(let i=0;i<3;i++){
  const t = i * 1.0;
  kick(t);
  cymbal(t);
  brassStab(freqs[i], t);
}
}
function beep(freq, dur=0.12, amp=0.8, delay=0){
    ensure();
    const o = ctx.createOscillator(); o.type='square'; o.frequency.value=freq;
    const g = ctx.createGain(); g.gain.value = 0.0;
    const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=freq*2; bp.Q.value = 6;
    o.connect(bp); bp.connect(g); g.connect(masterGain);
    const n0 = now()+delay;
    g.gain.linearRampToValueAtTime(amp, n0+0.01);
    g.gain.exponentialRampToValueAtTime(0.001, n0+dur);
    o.start(n0); o.stop(n0+dur+0.02);
    return o;
  }
 
  // Centralised random number generator.  Prefer the injected RNG
  // exposed via window.neonServices when available.  Fall back to
  // Math.random() to preserve legacy behaviour.  Audio modules
  // should use this helper instead of calling Math.random() directly
  // so that deterministic noise can be generated during tests.
  const _rand = () => {
    try {
      if (typeof window !== 'undefined' && window.neonServices && typeof window.neonServices.rng === 'function') {
        const v = window.neonServices.rng();
        if (typeof v === 'number') return v;
      }
    } catch (_) {}
    return Math.random();
  };

  function whiteNoise(ctx, dur=0.2){
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<len;i++){ data[i] = _rand()*2-1; }
    const src = ctx.createBufferSource();
    src.buffer = buffer; src.loop = false;
    return src;
  }
  function createEngineSample(ctx){
    const length = Math.max(1, Math.floor(ctx.sampleRate * 0.6));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const base = 90;
    for(let i=0;i<length;i++){
      const t = i / ctx.sampleRate;
      const wrap = Math.sin(Math.PI * (i / length));
      const env = Math.pow(Math.max(0, wrap), 0.85);
      const pulse = 0.5 + 0.5 * Math.sin(2*Math.PI*2.6*t + 0.4);
      const fundamental = Math.sin(2*Math.PI*base*t);
      const upper = Math.sin(2*Math.PI*base*1.94*t + 0.5);
      const grit = Math.sin(2*Math.PI*base*0.52*t + 1.2);
      const noise = (_rand()*2 - 1) * 0.12;
      data[i] = (fundamental*0.58 + upper*0.28 + grit*0.18 + noise) * (0.35 + env*0.75 * pulse);
    }
  return buffer;
 }

 function makeImpulse(ctx, seconds=0.2, decay=3){
   const rate = ctx.sampleRate;
   const len = rate * seconds;
   const impulse = ctx.createBuffer(2, len, rate);
   for(let ch=0; ch<2; ch++){
     const data = impulse.getChannelData(ch);
     for(let i=0;i<len;i++){
       data[i] = (_rand()*2-1) * Math.pow(1 - i/len, decay);
     }
   }
   return impulse;
 }
 function bitcrushCurve(bits=5){
   const steps = Math.max(2, Math.pow(2, Math.max(1, Math.floor(bits))));
   const curve = new Float32Array(65536);
   for(let i=0;i<curve.length;i++){
     const x = i / 32768 - 1;
     curve[i] = Math.round(x * steps) / steps;
   }
   return curve;
 }
 function distortionCurve(amount=20){
   const k = typeof amount === 'number' ? amount : 20;
   const n_samples = 44100;
   const curve = new Float32Array(n_samples);
   const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i ) {
      const x = i * 2 / n_samples - 1;
      curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  function tronFoldCurve(levels=6){
    const steps = Math.max(2, levels|0);
    const samples = 1024;
    const curve = new Float32Array(samples);
    for(let i=0;i<samples;i++){
      const x = i * 2 / (samples-1) - 1;
      const stepped = Math.round(x * steps) / steps;
      curve[i] = Math.tanh(stepped * 2.2);
    }
    return curve;
  }
 
  function cutAll(){
    ensure();
    const t = now();
    
    try { reverbGain.gain.cancelScheduledValues(t); reverbGain.gain.setValueAtTime(0, t); } catch(e){}
    try { masterGain.gain.cancelScheduledValues(t); masterGain.gain.setValueAtTime(0, t); } catch(e){}
    __engines.forEach(h=>{ try{ h.setActive(false); }catch(e){} });
  }
  function restoreMaster(){
    ensure();
    const t = now();
    if(!muted){
      try { reverbGain.gain.setValueAtTime(0.26 * (__mixConfig.reverb || 1), t); } catch(e){}
      try { masterGain.gain.setValueAtTime(0.72 * (__mixConfig.master || 1), t); } catch(e){}
    }
  }
 
  function resetVolumes(){
    ensure();
    const t = now();
    try { masterGain.gain.cancelScheduledValues(t); masterGain.gain.setValueAtTime(0.9 * (__mixConfig.master || 1), t); } catch(e){}
    try { reverbGain.gain.cancelScheduledValues(t); reverbGain.gain.setValueAtTime(0.25 * (__mixConfig.reverb || 1), t); } catch(e){}
    // Toggle existing engines off/on to clear any accumulated gain state
    try {
      __engines.forEach(h=>{ try { h.setActive(false); } catch(e){} });
      __engines.forEach(h=>{ try { h.setActive(true); } catch(e){} });
    } catch(e){}
    try { if (window.tronSfx && window.tronSfx.setVolume) window.tronSfx.setVolume(0.8); } catch(e){}
  }
 
  function killEngines(){
    try {
      __engines.forEach(h=>{ try{ h.setActive(false); }catch(e){} try{ h.stop(); }catch(e){} });
      __engines.length = 0;
    } catch(e){}
  }
return { resume, setMuted, isMuted, mkEngine, setMix, applyDI, turnChirp, whoosh, crash, startJingle, cutAll, restoreMaster, racingStart3s, resetVolumes, killEngines, powerupSplash };
})();


// Bridge: ensure global access even when loaded via ESM import
try { window.AudioFX = AudioFX; } catch(e) {}

// Export the AudioFX object as the module default.  This allows
// consumers to import the audio API without relying on the global
// window object.  The legacy assignment to window.AudioFX above
// remains for backwards compatibility, but callers should import
// this module directly and pass the exported object into
// audioController.init() instead of reading from window.
export default AudioFX;