// Sound. The storm and the music are recordings (MUSIC, below), streamed
// as they play. Everything else is made in the browser with Web Audio:
// thunder to match the lightning, the harpsichord notes of the melody
// puzzle, the séance drone, doors, the planchette.

const SOUND_KEY = 'crooked_house_sound';
const VOLUME_KEY = 'crooked_house_volume';
const MUSIC_VOLUME_KEY = 'crooked_house_music_volume';

// What plays where (see musicFor() in main.js):
//   house   while you explore
//   dread   when Dread runs high
//   waltz   the music room's cursed waltz
//   echoes  Patrini's song: once, straight after the harpsichord puzzle is
//           solved, and only until you leave the music room
// A list with more than one track plays them in turn. `once` themes don't
// loop: when the track ends, musicFor() decides what comes next.
const MUSIC = {
  storm: 'audio/crooked-house/Dark and Stormy.mp3',
  house: ['audio/crooked-house/Silent Hours.mp3'],
  dread: ['audio/crooked-house/These Splitting Walls.mp3'],
  waltz: ['audio/crooked-house/The Harpsichord.mp3'],
  echoes: ['audio/04 The Echoes.mp3'],
};
const MUSIC_ONCE = new Set(['echoes']);
const MUSIC_VOLUME = 0.55;
const FADE_S = 2.5;
const readLevel = (key, fallback) => { const v = parseFloat(store.get(key)); return Number.isFinite(v) ? clamp01(v) : fallback; };

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
  volume: readLevel(VOLUME_KEY, 0.7), musicVolume: readLevel(MUSIC_VOLUME_KEY, 0.75),
  drone: null, onThemeEnded: null,
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
    this.master.gain.value = this.on ? this.volume : 0;
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

    // Music: its own volume (the Music slider), and a duck for scenes
    // that want quiet.
    this.musicGain = ctx.createGain(); this.musicGain.gain.value = MUSIC_VOLUME * this.musicVolume;
    this.duckGain = ctx.createGain();
    this.duckGain.connect(this.musicGain).connect(this.master);
    // Browsers (iOS especially) only let audio start from a click or key
    // press: touch every track now, during the one that started the game,
    // so they can start later on their own.
    [...MUSIC.house, ...MUSIC.dread, ...MUSIC.waltz, ...MUSIC.echoes].forEach(src => {
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

  // Crossfades to a theme (a key of MUSIC), or to silence with null.
  // `fade` is in seconds; `restart` starts the track from the top.
  setTheme(name, { fade = FADE_S, restart = false } = {}) {
    if (!this.ctx || name === this.theme) return;
    this.theme = name;
    const t = this.ctx.currentTime;
    const old = this.current;
    if (old) {
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + fade);
      setTimeout(() => { if (old !== this.current) old.el.pause(); }, fade * 1000 + 100);
    }
    this.current = null;
    if (!name) return;
    const list = MUSIC[name];
    this.playlistPos = this.playlistPos || {};
    const pos = this.playlistPos[name] || 0;
    const next = this.track(list[pos % list.length], null, false);
    next.el.loop = list.length === 1 && !MUSIC_ONCE.has(name);
    next.el.onended = () => {
      if (this.current !== next) return;
      this.playlistPos[name] = (pos + 1) % list.length;
      this.theme = null;
      this.current = null;
      if (this.onThemeEnded) this.onThemeEnded(name);
    };
    if (restart || next.el.ended) next.el.currentTime = 0;
    next.gain.gain.cancelScheduledValues(t);
    next.gain.gain.setValueAtTime(next.gain.gain.value, t);
    next.gain.gain.linearRampToValueAtTime(1, t + fade);
    this.current = next;
    this.playEl(next.el);
  },

  // Turns the music down (0–1) under a scene, without changing the theme.
  duck(level, seconds = 1.2) {
    if (!this.ctx || level === this.duckLevel) return;
    this.duckLevel = level;
    this.duckGain.gain.setTargetAtTime(level, this.ctx.currentTime, seconds / 3);
  },

  // The two sliders: overall volume, and music on its own (0–1 each).
  setVolume(v) {
    this.volume = clamp01(v);
    store.set(VOLUME_KEY, this.volume.toFixed(2));
    if (this.ctx && this.on) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
  },
  setMusicVolume(v) {
    this.musicVolume = clamp01(v);
    store.set(MUSIC_VOLUME_KEY, this.musicVolume.toFixed(2));
    if (this.ctx) this.musicGain.gain.setTargetAtTime(MUSIC_VOLUME * this.musicVolume, this.ctx.currentTime, 0.05);
  },

  setOn(on) {
    this.on = on;
    store.set(SOUND_KEY, on ? 'on' : 'off');
    if (!this.ctx) return;
    if (on && this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.3);
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

  // Dread you can hear: soft whispers now and then when uneasy; a slow
  // heartbeat, and whispers more often, when terrified.
  setDreadBand(band) {
    if (!this.ctx || band === this.band) return;
    this.band = band;
    clearInterval(this.heartTimer); clearTimeout(this.whisperTimer);
    if (band === 'terrified' || band === 'breaking') this.heartTimer = setInterval(() => this.heartbeat(), 950);
    const whisperEvery = band === 'uneasy' ? 14000 : band === 'calm' ? 0 : 6000;
    const next = () => { this.whisperTimer = setTimeout(() => { this.whisper(); next(); }, whisperEvery * (0.6 + Math.random() * 0.8)); };
    if (whisperEvery) next();
  },
  heartbeat() {
    const t = this.ctx.currentTime;
    [0, 0.22].forEach((d, i) => {
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(i ? 52 : 60, t + d); o.frequency.exponentialRampToValueAtTime(32, t + d + 0.15);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(i ? 0.25 : 0.4, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.2);
      o.connect(g).connect(this.master); o.start(t + d); o.stop(t + d + 0.22);
    });
  },
  // A breathy, wordless murmur from one side.
  whisper() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, dur = 1.2 + Math.random() * 1.2;
    const src = this.ctx.createBufferSource(); src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9;
    bp.frequency.setValueAtTime(900 + Math.random() * 600, t);
    for (let k = 0.15; k < dur; k += 0.18) bp.frequency.linearRampToValueAtTime(700 + Math.random() * 1500, t + k);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    let node = src.connect(bp).connect(g);
    if (pan) { pan.pan.value = Math.random() < 0.5 ? -0.8 : 0.8; node = node.connect(pan); }
    node.connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  },

  // Hit in an encounter: a dull, cold thump.
  hit() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.32);
  },

  // Picking something up: two soft wooden taps.
  pickup() {
    if (!this.ctx) return;
    [0, 0.07].forEach((d, i) => {
      const t = this.ctx.currentTime + d;
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = i ? 660 : 440;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.2);
    });
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
