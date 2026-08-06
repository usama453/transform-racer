export class SoundManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineReady = false;
    this.wasBoost = false;
    this.wasDrift = false;
    this.airGain = null;
    this.engineGain = null;
    this.osc1 = null;
    this.osc2 = null;
    this.driftGain = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.master.connect(ctx.destination);

    // ---- engine: two oscillators through lowpass ----
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 400;
    this.engineFilter.Q.value = 2;
    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc1.frequency.value = 60;
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    this.osc2.frequency.value = 30;
    this.osc2Gain = ctx.createGain();
    this.osc2Gain.gain.value = 0.6;
    this.osc3 = ctx.createOscillator();
    this.osc3.type = 'sine';
    this.osc3.frequency.value = 300;
    this.osc3Gain = ctx.createGain();
    this.osc3Gain.gain.value = 0;
    this.osc1.connect(this.engineFilter);
    this.osc2.connect(this.osc2Gain).connect(this.engineFilter);
    this.osc3.connect(this.osc3Gain).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.osc1.start();
    this.osc2.start();
    this.osc3.start();

    // ---- air / wind noise ----
    const airGainNode = ctx.createGain();
    airGainNode.gain.value = 0;
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'lowpass';
    airFilter.frequency.value = 900;
    this._noiseSource(airGainNode, () => {
      this.airGain = airGainNode;
      airGainNode.connect(airFilter).connect(this.master);
    });

    // ---- drift squeal: bandpassed noise ----
    const driftNode = ctx.createGain();
    driftNode.gain.value = 0;
    const driftFilter = ctx.createBiquadFilter();
    driftFilter.type = 'bandpass';
    driftFilter.frequency.value = 1000;
    driftFilter.Q.value = 4;
    this._noiseSource(driftNode, () => {
      this.driftGain = driftNode;
      driftNode.connect(driftFilter).connect(this.master);
    });

    this.engineReady = true;
  }

  _noiseSource(gainNode, cb) {
    const ctx = this.ctx;
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(gainNode);
    src.start();
    cb();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.03);
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  updateEngine({ mode, speed, nitroActive, throttle, overboost }) {
    if (!this.engineReady) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const inCar = mode === 'car';
    const boostKick = nitroActive ? speed * 1.2 : 0;
    const overkick = overboost ? 60 : 0;

    if (inCar) {
      // piston engine: low saw + square sub + sine sub-bass (reduced volume)
      const freq = 65 + speed * 3.4 + boostKick + overkick;
      this.osc1.frequency.setTargetAtTime(freq, t, 0.06);
      this.osc2.frequency.setTargetAtTime(freq * 0.5, t, 0.06);
      this.osc2Gain.gain.setTargetAtTime(0.035, t, 0.06);
      this.osc3.frequency.setTargetAtTime(freq * 0.25, t, 0.06);
      this.osc3Gain.gain.setTargetAtTime(0.02, t, 0.06);
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.setTargetAtTime(220 + speed * 6 + (nitroActive ? 320 : 0) + overkick * 2.5, t, 0.08);
      this.engineFilter.Q.setTargetAtTime(2.5, t, 0.08);
    } else {
      // jet: high whine + rumble (reduced volume)
      const whine = 300 + speed * 2.1 + boostKick + overkick * 1.4;
      const rumb = 70 + speed * 1.1;
      this.osc1.frequency.setTargetAtTime(rumb, t, 0.06);
      this.osc2.frequency.setTargetAtTime(rumb * 0.5, t, 0.06);
      this.osc2Gain.gain.setTargetAtTime(0.015, t, 0.06);
      this.osc3.frequency.setTargetAtTime(whine, t, 0.05);
      this.osc3Gain.gain.setTargetAtTime(0.015, t, 0.05);
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.setTargetAtTime(900 + speed * 9 + (nitroActive ? 500 : 0) + overkick * 4, t, 0.08);
      this.engineFilter.Q.setTargetAtTime(1, t, 0.08);
    }

    let level = 0.12;
    if (inCar) {
      level = 0.005 + Math.abs(throttle) * 0.008 + Math.min(0.008, speed / 800);
    } else {
      level = Math.min(0.06, 0.01 + speed / 4800);
    }
    this.engineGain.gain.setTargetAtTime(level, t, 0.08);

    const air = inCar ? Math.min(0.15, (speed / 140) * 0.14) : Math.min(0.15, 0.05 + speed / 800);
    this.airGain.gain.setTargetAtTime(air, t, 0.1);

    // boost whoosh edge
    if (nitroActive && !this.wasBoost) this.boostSfx();
    this.wasBoost = nitroActive;
  }

  setDrift(active, speed) {
    if (!this.engineReady || !this.driftGain) return;
    if (active && !this.wasDrift) this.driftStart();
    this.wasDrift = active;
    if (!active) {
      this.driftGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    }
  }

  driftStart() {
    if (!this.driftGain) return;
    this.driftGain.gain.setTargetAtTime(0.18, this.ctx.currentTime, 0.05);
  }

  boostSfx() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  launchSfx() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(1600, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(lp).connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.5);
  }

  transform(nextMode) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const up = nextMode === 'plane';

    if (up) {
      this._playTransformSound(ctx, t);
    } else {
      this._playTransformSoundCar(ctx, t);
    }

    if (!up) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(160, t + 0.55);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.65);

      // mechanical clunk
      const clunk = ctx.createOscillator();
      clunk.type = 'triangle';
      clunk.frequency.setValueAtTime(120, t + 0.05);
      clunk.frequency.exponentialRampToValueAtTime(60, t + 0.12);
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.12, t + 0.05);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      clunk.connect(cg).connect(this.master);
      clunk.start(t + 0.05);
      clunk.stop(t + 0.25);
    }
  }

  _playTransformSound(ctx, t) {
    // load transform.wav from the public folder
    const req = new XMLHttpRequest();
    req.open('GET', '/transform.wav', true);
    req.responseType = 'arraybuffer';
    req.onload = () => {
      if (req.status !== 200) return;
      const now = ctx.currentTime;
      ctx.decodeAudioData(req.response, (buffer) => {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const g = ctx.createGain();
        g.gain.setValueAtTime(1.0, now);
        src.connect(g).connect(this.master);
        src.start(now);
      }, () => {});
    };
    req.send();
  }

  _playTransformSoundCar(ctx, t) {
    // mechanical transformation sound for plane->car
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.55);
  }

  boomSfx() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;

    // sub thump: fast pitch drop
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(160, t);
    sub.frequency.exponentialRampToValueAtTime(38, t + 0.45);
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.9, t);
    subG.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    sub.connect(subG).connect(this.master);
    sub.start(t);
    sub.stop(t + 0.65);

    // punch: lowpassed noise crack
    const burst = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.35);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const e = Math.exp(-i / (ctx.sampleRate * 0.09));
      data[i] = (Math.random() * 2 - 1) * e;
    }
    burst.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.3);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.7, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    burst.connect(lp).connect(bg).connect(this.master);
    burst.start(t);
  }

  land() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  crashSfx(intensity) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const k = Math.min(1, intensity / 80);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.25);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22 * k, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(lp).connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.35);

    const len = Math.floor(ctx.sampleRate * 0.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.045));
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.18 * k, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    noise.connect(ng).connect(this.master);
    noise.start(t);
    noise.stop(t + 0.3);
  }

  breakSfx() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.7);

    const len = Math.floor(ctx.sampleRate * 0.4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.08));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.25, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    noise.connect(hp).connect(ng).connect(this.master);
    noise.start(t);
    noise.stop(t + 0.45);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
}
