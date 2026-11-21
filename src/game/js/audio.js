// Sound. The storm and the music are recordings (MUSIC, below), streamed
// as they play. Everything else is made in the browser with Web Audio:
// thunder to match the lightning, a plucked harpsichord (the cursed waltz
// and Patrini's tune), the séance drone, doors, the planchette.

const SOUND_KEY = 'crooked_house_sound';
const MUSIC_KEY = 'crooked_house_music';

// What plays where. `house` is a playlist that alternates while you
// explore; `dread` takes over when Dread runs high; `harpsichord` fills
// the music room once its curse is broken. See musicFor() in main.js.
const MUSIC = {
  storm: 'audio/crooked-house/Dark and Stormy.mp3',
  house: ['audio/crooked-house/Silent Hours.mp3', 'audio/04 The Echoes.mp3'],
  dread: ['audio/crooked-house/These Splitting Walls.mp3'],
  harpsichord: ['audio/crooked-house/The Harpsichord.mp3'],
};
const MUSIC_VOLUME = 0.42;
const FADE_S = 2.5;

// How the storm sounds from where you stand: wide open on the porch,
// through glass in the conservatory, muffled everywhere else.
const STORM_PLACES = {
  out:   { cutoff: 16000, gain: 0.5 },
  glass: { cutoff: 2600,  gain: 0.4 },
  in:    { cutoff: 520,   gain: 0.32 },
};
const NOTE = { C: 261.63, D: 293.66, E: 329.63, F: 349.23, G: 392.0, A: 440.0, B: 493.88, c: 523.25 };

const sound = {
  ctx: null, master: null, noise: null, on: store.get(SOUND_KEY) !== 'off',
  musicOn: store.get(MUSIC_KEY) !== 'off',
  discordTimer: null, drone: null,
  tracks: {}, theme: null, duckLevel: 1, place: 'out',

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

    // The storm recording, through a filter that muffles it indoors.
    this.stormFilter = ctx.createBiquadFilter(); this.stormFilter.type = 'lowpass';
    this.stormGain = ctx.createGain(); this.stormGain.gain.value = 0;
    this.stormFilter.connect(this.stormGain).connect(this.master);
    const storm = this.track(MUSIC.storm, this.stormFilter, true);
    storm.el.addEventListener('error', () => this.fallbackRain(), { once: true });
    this.setPlace(this.place);
    this.playEl(storm.el);

    // Music: its own volume (the ♪ button), and a duck for scenes that
    // want quiet.
    this.musicGain = ctx.createGain(); this.musicGain.gain.value = this.musicOn ? MUSIC_VOLUME : 0;
    this.duckGain = ctx.createGain();
    this.duckGain.connect(this.musicGain).connect(this.master);
    // Browsers (iOS especially) only let audio start from a click or key
    // press: touch every track now, during the one that started the game,
    // so they can start later on their own.
    [...MUSIC.house, ...MUSIC.dread, ...MUSIC.harpsichord].forEach(src => {
      const t = this.track(src, null, false);
      t.el.play().then(() => { if (t !== this.current) t.el.pause(); }).catch(() => {});
    });
  },

  // One recording: an <audio> element routed through its own gain.
  track(src, dest, loop) {
    if (this.tracks[src]) return this.tracks[src];
    const el = new Audio();
    el.src = src; el.loop = loop; el.preload = 'none';
    const node = this.ctx.createMediaElementSource(el);
    const gain = this.ctx.createGain(); gain.gain.value = dest ? 1 : 0;
    node.connect(gain).connect(dest || this.duckGain);
    const t = { src, el, gain };
    this.tracks[src] = t;
    return t;
  },
  playEl(el) { const p = el.play(); if (p) p.catch(() => {}); },

  // If the storm recording can't be loaded, fall back to made-up rain.
  fallbackRain() {
    const rain = this.ctx.createBufferSource();
    rain.buffer = this.noise; rain.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.4;
    const g = this.ctx.createGain(); g.gain.value = 0.12;
    rain.connect(f).connect(g).connect(this.stormFilter);
    rain.start();
  },

  // Crossfades to a theme ('house', 'dread', 'harpsichord'), or to silence
  // with null. A playlist moves on to its next track when one ends.
  setTheme(name) {
    if (!this.ctx || name === this.theme) return;
    this.theme = name;
    const t = this.ctx.currentTime;
    const old = this.current;
    if (old) {
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + FADE_S);
      setTimeout(() => { if (old !== this.current) old.el.pause(); }, FADE_S * 1000 + 100);
    }
    this.current = null;
    if (!name) return;
    const list = MUSIC[name];
    this.playlistPos = this.playlistPos || {};
    const pos = this.playlistPos[name] || 0;
    const next = this.track(list[pos % list.length], null, list.length === 1);
    next.el.onended = () => {
      if (this.current !== next) return;
      this.playlistPos[name] = (pos + 1) % list.length;
      this.theme = null;
      this.setTheme(name);
    };
    if (next.el.ended) next.el.currentTime = 0;
    next.gain.gain.cancelScheduledValues(t);
    next.gain.gain.setValueAtTime(next.gain.gain.value, t);
    next.gain.gain.linearRampToValueAtTime(1, t + FADE_S);
    this.current = next;
    this.playEl(next.el);
  },

  // Turns the music down (0–1) under a scene, without changing the theme.
  duck(level, seconds = 1.2) {
    if (!this.ctx || level === this.duckLevel) return;
    this.duckLevel = level;
    this.duckGain.gain.setTargetAtTime(level, this.ctx.currentTime, seconds / 3);
  },

  setMusicOn(on) {
    this.musicOn = on;
    store.set(MUSIC_KEY, on ? 'on' : 'off');
    if (this.ctx) this.musicGain.gain.setTargetAtTime(on ? MUSIC_VOLUME : 0, this.ctx.currentTime, 0.3);
  },

  setOn(on) {
    this.on = on;
    store.set(SOUND_KEY, on ? 'on' : 'off');
    if (!this.ctx) return;
    if (on && this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.3);
  },

  // 'out', 'glass' or 'in': see STORM_PLACES.
  setPlace(place) {
    this.place = place;
    if (!this.stormFilter) return;
    const p = STORM_PLACES[place] || STORM_PLACES.in, t = this.ctx.currentTime;
    this.stormFilter.frequency.setTargetAtTime(p.cutoff, t, 0.5);
    this.stormGain.gain.setTargetAtTime(p.gain, t, 0.5);
  },

  thunder(strength = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(260 + strength * 500, t); lp.frequency.exponentialRampToValueAtTime(70, t + 2.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6 * strength, t + 0.06);
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

  // A door: a long, groaning creak opening; a dull thud closing.
  door(opening) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (opening) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(140, t + 0.35); o.frequency.linearRampToValueAtTime(95, t + 0.7);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6;
      bp.frequency.setValueAtTime(500, t); bp.frequency.linearRampToValueAtTime(1300, t + 0.4); bp.frequency.linearRampToValueAtTime(700, t + 0.75);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      o.connect(bp).connect(g).connect(this.master); o.start(t); o.stop(t + 0.85);
    } else {
      const src = ctx.createBufferSource(); src.buffer = this.noise;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t + 0.35); g.gain.exponentialRampToValueAtTime(0.5, t + 0.37); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      src.connect(lp).connect(g).connect(this.master); src.start(t, Math.random()); src.stop(t + 0.75);
    }
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
