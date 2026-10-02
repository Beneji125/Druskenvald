// The single site-wide audio channel (#bg-music): the looping default
// track, mute/volume, the waveform seek bar, and per-location ambience
// tracks that temporarily take it over.
//
// Part of the site script: build.js concatenates src/js/*.js (in the
// order listed in build.js) after the data constants, into one <script>.

const MUSIC_VOLUME_DEFAULT = 0.1;
const MUSIC_MUTED_STORAGE_KEY = 'druskenvald_music_muted';
const MUSIC_VOLUME_STORAGE_KEY = 'druskenvald_music_volume';
const DEFAULT_TRACK_SRC = 'audio/Creaking_Bones.mp3';
const DEFAULT_TRACK_TITLE = 'Creaking Bones';
let musicMuted = false;

function initMusic() {
  const audio = document.getElementById('bg-music');
  const slider = document.getElementById('music-volume-slider');
  if (!audio) return;

  const storedVolume = parseFloat(store.get(MUSIC_VOLUME_STORAGE_KEY));
  audio.volume = Number.isFinite(storedVolume) ? storedVolume : MUSIC_VOLUME_DEFAULT;
  if (slider) slider.value = audio.volume;

  musicMuted = store.get(MUSIC_MUTED_STORAGE_KEY) === 'true';
  updateMusicButton();
  updateNowPlayingLabel(DEFAULT_TRACK_TITLE);
  setupMusicProgressBar();
  if (!musicMuted) {
    audio.play().catch(() => {
      // Autoplay can still be refused in some browsers/settings even after
      // a user gesture — leave it paused silently; the toggle button lets
      // the visitor start it manually.
    });
  }
}

// Single place that changes the muted state, so the topbar icon, the
// remembered preference, and an open panel's location-track button (see
// trackButtonHtml) can't drift out of step with what's actually playing.
function setMusicMuted(muted) {
  const audio = document.getElementById('bg-music');
  if (!audio) return;
  musicMuted = muted;
  if (muted) {
    audio.pause();
  } else {
    audio.play().catch(() => {});
  }
  store.set(MUSIC_MUTED_STORAGE_KEY, String(muted));
  updateMusicButton();
  if (currentTrackId) setTrackButtonState(currentTrackId, !muted);
}

function toggleMusic() {
  setMusicMuted(!musicMuted);
}

function setMusicVolume(value) {
  const audio = document.getElementById('bg-music');
  if (!audio) return;
  audio.volume = value;
  store.set(MUSIC_VOLUME_STORAGE_KEY, String(value));
  // Dragging the slider implies wanting to hear it, so unmute if needed.
  if (musicMuted && value > 0) setMusicMuted(false);
}

function updateMusicButton() {
  const btn = document.getElementById('music-toggle-btn');
  if (!btn) return;
  btn.textContent = musicMuted ? '🔇' : '🔊';
  btn.title = musicMuted ? 'Unmute music' : 'Mute music';
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}

// Number of bars in the stylized waveform seek bar (see buildWaveformBars).
// Purely decorative — there's no per-track amplitude data to visualize, so
// every track shows the same bar pattern; only how much of it is "played"
// (recolored) changes.
const WAVEFORM_BAR_COUNT = 42;

// Draws the waveform's bars once into #music-waveform-bars. Heights come
// from a small sum of two sine waves seeded by bar index — the same
// "looks organic without being truly random" trick used for the map's
// torch/lantern flicker (see flickerMultiplier) — rather than uniform
// bars (a flat "barcode") or literal Math.random() (would look noisy and
// re-roll differently if this ever got called twice).
function buildWaveformBars() {
  const group = document.getElementById('music-waveform-bars');
  if (!group) return;
  const ns = 'http://www.w3.org/2000/svg';
  const viewW = 200, viewH = 28;
  const barW = 2.6, gap = 2.1, unit = barW + gap;

  for (let i = 0; i < WAVEFORM_BAR_COUNT; i++) {
    const h = 5 + 9 * (0.5 + 0.5 * Math.sin(i * 0.7)) + 6 * (0.5 + 0.5 * Math.sin(i * 1.9 + 1.3));
    const x = i * unit;
    const y = (viewH - h) / 2;
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('class', 'wf-bar');
    rect.setAttribute('x', x.toFixed(2));
    rect.setAttribute('y', y.toFixed(2));
    rect.setAttribute('width', barW);
    rect.setAttribute('height', h.toFixed(2));
    rect.setAttribute('rx', barW / 2);
    group.appendChild(rect);
  }
  // viewBox width covers exactly the bars drawn, so preserveAspectRatio
  // "none" (set in the markup) stretches this cleanly to the CSS width.
  const svg = document.getElementById('music-waveform');
  if (svg) svg.setAttribute('viewBox', `0 0 ${(WAVEFORM_BAR_COUNT * unit).toFixed(2)} ${viewH}`);
}

// Recolors bars up to the playback fraction as "played" rather than
// resizing anything — cheap (a class toggle per bar) and avoids any
// layout/reflow cost on every timeupdate tick.
function updateWaveformProgress(fraction) {
  const bars = document.querySelectorAll('#music-waveform-bars .wf-bar');
  if (!bars.length) return;
  const playedCount = Math.round(clamp01(fraction) * bars.length);
  bars.forEach((bar, i) => bar.classList.toggle('played', i < playedCount));
}

function seekMusicFromEvent(e) {
  const audio = document.getElementById('bg-music');
  const svg = document.getElementById('music-waveform');
  if (!audio || !svg || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0) return;
  const fraction = clamp01((e.clientX - rect.left) / rect.width);
  audio.currentTime = fraction * audio.duration;
  updateWaveformProgress(fraction); // instant feedback; timeupdate will confirm shortly after
}

// Click-to-seek and drag-to-seek (via Pointer Events, unifying mouse/touch)
// on the waveform.
function setupWaveformSeek() {
  const svg = document.getElementById('music-waveform');
  if (!svg) return;
  let dragging = false;
  svg.addEventListener('pointerdown', (e) => {
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    seekMusicFromEvent(e);
  });
  svg.addEventListener('pointermove', (e) => { if (dragging) seekMusicFromEvent(e); });
  svg.addEventListener('pointerup', () => { dragging = false; });
  svg.addEventListener('pointercancel', () => { dragging = false; });
}

// Wires the waveform + time readout to #bg-music once; the same listeners
// keep working across src changes (default track <-> a Wickermoor
// location's track, see toggleLocationTrack) since they're on the audio
// element itself, not tied to any one track.
function setupMusicProgressBar() {
  const audio = document.getElementById('bg-music');
  const timeLabel = document.getElementById('music-time');
  if (!audio || !timeLabel) return;

  buildWaveformBars();
  setupWaveformSeek();

  audio.addEventListener('loadedmetadata', () => {
    timeLabel.textContent = formatTime(audio.currentTime) + ' / ' + formatTime(audio.duration);
  });
  audio.addEventListener('timeupdate', () => {
    const fraction = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0;
    updateWaveformProgress(fraction);
    timeLabel.textContent = formatTime(audio.currentTime) + ' / ' + formatTime(audio.duration);
  });
}

function updateNowPlayingLabel(title) {
  const label = document.getElementById('music-now-playing');
  if (!label) return;
  label.textContent = title || '';
}

// ── Per-location ambience tracks ──────────────────────────────────
// WM_TRACKS (data/descriptions.json) maps a Wickermoor id to
// { src, title? }; ids with no entry simply get no player. Starting one
// takes over the single shared #bg-music element/topbar player (see
// setupMusicProgressBar/updateNowPlayingLabel above) rather than playing
// in a second, independent player — so it shows up with the same
// play/pause, volume, and progress controls the background loop normally
// uses. Only one track plays at a time; pausing it (or letting it finish)
// hands #bg-music back to the default looping track.
let currentTrackId = null;

// One button per place it's shown — the location's own panel, and its
// Chronicle entry in the Codex — all kept in step by setTrackButtonState.
// A data attribute plus one delegated click listener (below) rather than an
// inline onclick, so track titles with apostrophes need no escaping.
function trackButtonHtml(id) {
  const track = WM_TRACKS[id];
  if (!track) return '';
  const playing = currentTrackId === id && !musicMuted;
  return `
    <div class="wm-track-player">
      <button class="wm-track-btn${playing ? ' playing' : ''}" data-track="${escAttr(id)}">${trackButtonLabel(id, playing)}</button>
    </div>
  `;
}

function trackButtonLabel(id, playing) {
  const track = WM_TRACKS[id];
  if (playing) return '⏸ Pause';
  return '▶ ' + (track && track.title ? `Play "${track.title}"` : 'Play Ambience');
}

function setTrackButtonState(id, playing) {
  document.querySelectorAll('.wm-track-btn[data-track]').forEach(btn => {
    if (btn.dataset.track !== id) return;
    btn.textContent = trackButtonLabel(id, playing);
    btn.classList.toggle('playing', playing);
  });
}

document.addEventListener('click', e => {
  const btn = e.target.closest?.('.wm-track-btn[data-track]');
  const track = btn && WM_TRACKS[btn.dataset.track];
  if (track) toggleLocationTrack(btn.dataset.track, track.src);
});

function toggleLocationTrack(id, src) {
  const audio = document.getElementById('bg-music');
  if (!audio) return;

  // Clicking the currently-playing track's own button stops it and hands
  // the topbar player back to the default looping track.
  // If it's this track but paused (muted from the topbar), resume it where
  // it left off instead of restarting from the beginning.
  if (currentTrackId === id) {
    if (audio.paused) setMusicMuted(false);
    else revertToDefaultTrack(audio);
    return;
  }

  // Switching away from whatever else was playing (if anything).
  if (currentTrackId) setTrackButtonState(currentTrackId, false);

  currentTrackId = id;
  audio.loop = false;
  audio.src = src;
  audio.currentTime = 0;
  // Pressing play is an explicit request to hear it — clear any mute so the
  // topbar icon matches (setMusicMuted also starts playback).
  if (musicMuted) setMusicMuted(false);
  else audio.play().catch(() => {});
  setTrackButtonState(id, true);
  updateNowPlayingLabel((WM_TRACKS[id] && WM_TRACKS[id].title) || 'Ambience');
  setResetButtonVisible(true);

  audio.onended = () => revertToDefaultTrack(audio);
}

// Public entry point for the topbar's "return to default track" button —
// resetToDefaultTrack() (no args, reads #bg-music itself) vs.
// revertToDefaultTrack(audio) (internal, called with the element already
// in hand by toggleLocationTrack/the 'ended' handler).
function resetToDefaultTrack() {
  const audio = document.getElementById('bg-music');
  if (!audio || currentTrackId === null) return; // nothing to return from
  revertToDefaultTrack(audio);
}

function setResetButtonVisible(visible) {
  const btn = document.getElementById('music-reset-btn');
  if (btn) btn.classList.toggle('visible', visible);
}

function revertToDefaultTrack(audio) {
  const finishedId = currentTrackId;
  currentTrackId = null;
  audio.onended = null;
  if (finishedId) setTrackButtonState(finishedId, false);
  updateNowPlayingLabel(DEFAULT_TRACK_TITLE);
  setResetButtonVisible(false);
  audio.loop = true;
  audio.src = DEFAULT_TRACK_SRC;
  audio.currentTime = 0;
  if (!musicMuted) audio.play().catch(() => {});
}
