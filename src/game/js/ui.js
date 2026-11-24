// What's drawn over the 3D view: the message log, the prompt for whatever
// you're facing, dialogue with choices, the Dread meter, and the journal
// and map overlays. (The séance board and the harpsichord have their own
// overlays, in story.js.)

const $ = id => document.getElementById(id);
const DREAD_MAX = 10;

// Who has a face to show when they speak: the official artwork (art.js).
const PORTRAITS = {
  'The Crooked Man': CHARACTER_ART.crookedManClose,
  'Filthy Jasper': CHARACTER_ART.jasper,
  'Joseph Patrini': CHARACTER_ART.joseph,
};

const ui = {
  overlay: null,   // the open overlay's id, if any: blocks movement
  selected: null,  // the item picked up from the inventory bar, if any

  // ─── The inventory bar ───
  // A slot per item; click (or press its number) to pick it up; with one
  // picked up, clicking another combines them, and Space uses it on what
  // you're facing. Teeth are counted at the end.
  drawInventory() {
    const slots = $('inv-slots');
    slots.innerHTML = '';
    game.items.forEach((id, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'inv-slot' + (ui.selected === id ? ' selected' : '');
      b.dataset.item = id;
      b.title = ITEMS[id].name;
      b.setAttribute('aria-label', `${ITEMS[id].name}${i < 9 ? ` (${i + 1})` : ''}`);
      b.setAttribute('aria-pressed', String(ui.selected === id));
      b.innerHTML = `<img src="${itemIcon(id)}" alt=""><span class="inv-key">${i < 9 ? i + 1 : ''}</span>`;
      b.addEventListener('click', () => ui.pickSlot(id));
      slots.appendChild(b);
    });
    $('inv-teeth').hidden = !game.teeth;
    $('inv-teeth-count').textContent = String(game.teeth);
    $('inventory').hidden = !game.items.length && !game.teeth;
    ui.drawItemInfo();
  },

  pickSlot(id) {
    if (game.busy || ui.overlay) return;
    if (ui.selected && ui.selected !== id) { const a = ui.selected; return useThingCombine(a, id); }
    ui.select(ui.selected === id ? null : id);
  },

  select(id) {
    ui.selected = id;
    document.querySelectorAll('.inv-slot').forEach(b => {
      b.classList.toggle('selected', b.dataset.item === id);
      b.setAttribute('aria-pressed', String(b.dataset.item === id));
    });
    ui.drawItemInfo();
  },

  drawItemInfo() {
    const info = $('inv-info');
    if (!ui.selected) { info.hidden = true; return; }
    info.hidden = false;
    $('inv-info-name').textContent = ITEMS[ui.selected].name;
  },

  flashSlot(id) {
    const b = document.querySelector(`.inv-slot[data-item="${id}"]`);
    if (!b) return;
    b.classList.remove('new'); void b.offsetWidth; b.classList.add('new');
  },

  log(text, kind = '') {
    const log = $('log');
    const p = document.createElement('p');
    p.textContent = text;
    if (kind) p.className = kind;
    log.appendChild(p);
    while (log.children.length > 4) log.firstChild.remove();
    setTimeout(() => p.classList.add('old'), 9000);
  },

  setPrompt(thing) {
    const el = $('prompt');
    if (!thing) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = `${thing.verb || 'Look at'} ${thing.name.replace(/^The /, 'the ')}`;
  },

  setRoom(name) {
    const el = $('room-name');
    if (el.textContent === name) return;
    el.textContent = name;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  },

  setOil(v) {
    const el = $('oil-fill');
    el.style.width = `${Math.round(clamp01(v) * 100)}%`;
    $('oil').classList.toggle('low', v < 0.2);
  },

  setLanternMode(low) {
    const b = $('btn-lantern');
    b.textContent = low ? 'Lantern: low' : 'Lantern: bright';
    b.setAttribute('aria-pressed', String(low));
    b.title = (low ? 'Turn the lantern up (L)' : 'Turn the lantern down (L)');
  },

  setDread(value) {
    const pips = $('dread-pips');
    if (pips.children.length !== DREAD_MAX) {
      pips.innerHTML = '';
      for (let i = 0; i < DREAD_MAX; i++) pips.appendChild(document.createElement('span'));
    }
    [...pips.children].forEach((s, i) => s.classList.toggle('on', i < value));
    $('dread').classList.toggle('high', value >= 7);
    $('dread').setAttribute('aria-valuenow', String(value));
  },

  flash(colour = '#fff', ms = 500) {
    const f = $('flash');
    f.style.background = colour;
    f.style.transition = 'none'; f.style.opacity = '0.85';
    requestAnimationFrame(() => { f.style.transition = `opacity ${ms}ms ease-out`; f.style.opacity = '0'; });
  },

  // Dialogue: shows text (and who's speaking) with numbered choices, and
  // resolves with the chosen id. With no choices, a single "Continue".
  say(speaker, text, choices = [{ id: 'ok', text: 'Continue' }]) {
    return new Promise(resolve => {
      const box = $('dialog');
      $('dialog-speaker').textContent = speaker || '';
      $('dialog-speaker').hidden = !speaker;
      const face = PORTRAITS[speaker];
      $('dialog-portrait').hidden = !face;
      if (face) $('dialog-portrait').src = face;
      box.classList.toggle('has-portrait', !!face);
      $('dialog-text').textContent = text;
      const list = $('dialog-choices');
      list.innerHTML = '';
      choices.forEach((c, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = `<span class="key">${i + 1}</span>`;
        b.appendChild(document.createTextNode(c.text));
        if (c.dark) b.classList.add('dark');
        b.addEventListener('click', () => done(c.id));
        list.appendChild(b);
      });
      // Keys answering the dialogue go no further: the Enter or Space that
      // closes it mustn't also reach the game and use whatever is in front
      // of you.
      const onKey = e => {
        const n = Number(e.key);
        if (n >= 1 && n <= choices.length) { e.preventDefault(); e.stopImmediatePropagation(); done(choices[n - 1].id); }
        else if (choices.length === 1 && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopImmediatePropagation(); done(choices[0].id); }
        else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); }
      };
      let answered = false;
      const done = id => {
        if (answered) return;      // a double click answers once
        answered = true;
        ui.cancelSay = null;
        document.removeEventListener('keydown', onKey, true);
        box.hidden = true;
        ui.overlay = null;
        lockInput(300);
        resolve(id);
      };
      // Wait a moment before listening, so the key that opened the
      // dialogue doesn't also answer it.
      // (Unless it's already been answered, by a quick click: a listener
      // added after that would never be removed, and would swallow those
      // number keys for good.)
      setTimeout(() => { if (!answered) document.addEventListener('keydown', onKey, true); }, 150);
      box.hidden = false;
      ui.overlay = 'dialog';
      // Closes it unanswered (resolving with null): for skipping a scene.
      ui.cancelSay = () => done(null);
      list.querySelector('button')?.focus({ preventScroll: true });
    });
  },

  open(id) {
    ['journal', 'map'].forEach(o => { if (o !== id) $(o).hidden = true; });
    $(id).hidden = false;
    ui.overlay = id;
    if (id === 'journal') ui.drawJournal();
    if (id === 'map') ui.drawMap();
    $(id).querySelector('.close')?.focus({ preventScroll: true });
  },
  close() {
    if (ui.overlay === 'journal' || ui.overlay === 'map') { $(ui.overlay).hidden = true; ui.overlay = null; lockInput(150); }
  },
  toggle(id) { if (ui.overlay === id) ui.close(); else if (!ui.overlay) ui.open(id); },

  drawJournal() {
    const slots = $('memento-slots');
    slots.innerHTML = '';
    const known = game.clues.has('mementos');
    MEMENTOS.forEach(m => {
      const have = game.mementos.has(m.id);
      const li = document.createElement('li');
      li.className = have ? (game.tainted.includes(m.id) ? 'have tainted' : 'have') : '';
      li.innerHTML = `<span class="glyph">${have ? m.glyph : '?'}</span><span class="label"></span>`;
      li.querySelector('.label').textContent = have ? m.name : known ? `${m.hint}` : 'Unknown';
      slots.appendChild(li);
    });
    const clues = $('clue-list');
    clues.innerHTML = '';
    const list = CLUES.filter(c => game.clues.has(c.id));
    if (!list.length) clues.innerHTML = '<li class="none">Nothing yet. Look around; ask questions.</li>';
    list.forEach(c => { const li = document.createElement('li'); li.textContent = c.text; clues.appendChild(li); });
  },

  // The map: the floor plan, hidden except where you've been (and what you
  // could see from there), with an arrow for where you stand.
  drawMap() {
    const canvas = $('map-canvas');
    const img = ui.mapImage;
    if (!img || !img.complete) { img?.addEventListener('load', () => ui.drawMap(), { once: true }); return; }
    const box = canvas.parentElement.getBoundingClientRect();
    const scale = Math.min(box.width / FLOOR.width, box.height / FLOOR.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(FLOOR.width * scale * dpr); canvas.height = Math.round(FLOOR.height * scale * dpr);
    canvas.style.width = `${FLOOR.width * scale}px`; canvas.style.height = `${FLOOR.height * scale}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.drawImage(img, 0, 0, FLOOR.width, FLOOR.height);
    const fog = document.createElement('canvas');
    fog.width = canvas.width; fog.height = canvas.height;
    const f = fog.getContext('2d');
    f.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    f.fillStyle = '#07060a'; f.fillRect(0, 0, FLOOR.width, FLOOR.height);
    f.globalCompositeOperation = 'destination-out';
    f.filter = `blur(${Math.round(10 * scale * dpr)}px)`;
    game.seen.forEach(k => {
      const [cx, cy] = k.split(',').map(Number);
      f.fillRect(GRID.ox + cx * CELL - 6, GRID.oy + cy * CELL - 6, CELL + 12, CELL + 12);
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(fog, 0, 0);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    const c = GRID.at(game.cx, game.cy);
    ctx.save();
    ctx.translate(c.x, c.y); ctx.rotate(game.dir * Math.PI / 2);
    ctx.fillStyle = '#f0c870'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(15, 16); ctx.lineTo(0, 8); ctx.lineTo(-15, 16); ctx.closePath();
    ctx.stroke(); ctx.fill();
    ctx.restore();
  },
};
