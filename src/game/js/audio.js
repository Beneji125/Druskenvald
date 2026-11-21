// Sound, all made in the browser with Web Audio: rain, thunder, a plucked
// harpsichord (the music room's cursed waltz and Patrini's tune), and a low
// drone under the séance. Nothing to download.

const SOUND_KEY = 'crooked_house_sound';
const NOTE = { C: 261.63, D: 293.66, E: 329.63, F: 349.23, G: 392.0, A: 440.0, B: 493.88, c: 523.25 };

const sound = {
  ctx: null, master: null, noise: null, on: store.get(SOUND_KEY) !== 'off',
  discordTimer: null, drone: null,

  // Must be called from a click or key press (browsers only allow sound
  // to start from one).
  start() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try { this.ctx = new Ctx(); } catch { return; }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.on ? 0.7 : 0;
    this.master.connect(ctx.destination);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < ch.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; ch[i] = w * 0.6 + last * 3; }
    this.noise = buf;
    const rain = ctx.createBufferSource();
    rain.buffer = buf; rain.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.4;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0.12;
    rain.connect(f).connect(this.rainGain).connect(this.master);
    rain.start();
  },

  setOn(on) {
    this.on = on;
    store.set(SOUND_KEY, on ? 'on' : 'off');
    if (!this.ctx) return;
    if (on && this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.3);
  },

  // Indoors the rain is muffled; on the porch it's loud.
  setOutdoors(outdoors) {
    if (this.rainGain) this.rainGain.gain.setTargetAtTime(outdoors ? 0.3 : 0.1, this.ctx.currentTime, 0.6);
  },

  thunder(strength = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(260 + strength * 500, t); lp.frequency.exponentialRampToValueAtTime(70, t + 2.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9 * strength, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.25 * strength, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t, Math.random()); src.stop(t + 3.6);
  },

  // A plucked string: bright attack, quick decay — close enough to a
  // harpsichord for a haunted house.
  pluck(freq, when = 0, dur = 0.9, vol = 0.22, detune = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator();
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.value = freq; o2.frequency.value = freq * 2;
    o.detune.value = detune; o2.detune.value = detune + 4;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(900, t + dur);
    const g = ctx.createGain(), g2 = ctx.createGain();
    g2.gain.value = 0.25;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(this.master);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  },

  // The cursed waltz: a lurching three-beat figure, out of tune and
  // getting worse, until something stops it.
  startDiscord() {
    if (!this.ctx || this.discordTimer) return;
    let beat = 0;
    const roots = [NOTE.C / 2, NOTE.F / 2, NOTE.G / 2, NOTE.E / 2];
    this.discordTimer = setInterval(() => {
      const root = roots[Math.floor(beat / 3) % roots.length];
      const sour = 30 + Math.min(70, beat * 2);
      if (beat % 3 === 0) this.pluck(root, 0, 1.2, 0.26, -sour);
      else { this.pluck(root * 2.52, 0, 0.5, 0.12, sour); this.pluck(root * 3.0, 0.01, 0.5, 0.1, -sour / 2); }
      beat++;
    }, 330);
  },
  stopDiscord() { clearInterval(this.discordTimer); this.discordTimer = null; },

  startDrone() {
    if (!this.ctx || this.drone) return;
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(this.master);
    const oscs = [55, 55.7, 82.4].map(f => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); o.start(); return o; });
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 2);
    this.drone = { g, oscs };
  },
  stopDrone() {
    if (!this.drone) return;
    const { g, oscs } = this.drone, t = this.ctx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    oscs.forEach(o => o.stop(t + 1.6));
    this.drone = null;
  },

  // A soft scrape for the planchette moving across the board.
  scrape() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, Math.random()); src.stop(t + 0.4);
  },
};
