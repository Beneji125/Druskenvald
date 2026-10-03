# Druskenvald — The Land Between Life and Death

An interactive lore map for the Druskenvald setting: a self-contained,
single-page HTML site with a hand-drawn map, clickable province/species
lore panels, day/night lighting effects, and ambient music.

## Layout

```
docs/            The published site — this is what GitHub Pages serves
  index.html       generated; never edit directly (see Building, below)
  MAP_*.jpeg       map art
  CrookedMoon_Cover.jpg
  scenes/          province/story illustrations
  chapter-art/     chapter header art
  species/         species portraits
  npc/             NPC portraits (NPCS / WM_PORTRAITS)
  monsters/        monster, boss and familiar art
  audio/           background music and location ambience tracks

src/              Source files that get combined into docs/index.html
  template.html    HTML skeleton
  styles.css       all CSS
  js/              all JS logic, joined in the order listed in build.js
    util.js          storage wrapper and small helpers
    music.js         background music and location ambience tracks
    lighting.js      map layers, night lighting, light mode, hover reveal
    map.js           hotspots, zoom & pan, switching maps
    panels.js        lore / species / NPC panels and lore images
    unlocks.js       character-name recognition and group unlocks
    main.js          entry point and page-wide listeners
  data/
    descriptions.json   lore text, species, NPCs, groups/unlocks, image
                         and track references, chapters, locked teasers
    bestiary.json        the Codex's creatures (text, images, who's met them)
    hotspots.json        map hotspot shapes + settlement light positions

source-assets/    Large working files, not part of the published site
  MAP_Druskenvald_Sources.xcf        GIMP source — the main map's paths/vectors
  MAP_Wickermoor_Hollow_Sources.xcf  GIMP source — Wickermoor Hollow's
  crooked_moon_reference.md     full lore/rules reference document
  originals/       full-quality masters of everything optimize_assets.py
                   has compressed (same folder layout as docs/)

build.js          Combines src/* into docs/index.html — run after any edit
                   under src/: `node build.js`
extract_xcf.py     Syncs src/data/hotspots.json from source-assets/*.xcf
                   whenever the map's lights/outlines are edited in GIMP:
                   `python extract_xcf.py` (dry run) or `--apply` to write
```

## Using the site

- **Links:** the address follows what's on screen, e.g. `#ardengloom` or
  `#wickermoor/wm_crimson`, so any page can be shared (🔗 in a panel copies
  it). Back/Forward step through panels and maps. A link to a location the
  visitor's group hasn't unlocked just shows its locked "???" panel.
- **Search:** 🔍 (or press `/`) lists provinces, discovered Wickermoor
  locations, species, and people met in readable lore.
- **Who am I:** 👤 shows which character the visitor is recognised as,
  lets them switch, or "Forget me".
- **New lore:** Wickermoor locations with lore the visitor hasn't read yet
  (or that has changed since) get a pulsing outline until opened.
- **The Codex (📜):** Bestiary, Rogues' Gallery and Chronicle (see below).
- **Lighting:** the 🌙 button cycles night, dusk and day (no darkness).
- **Phones:** in portrait the map opens zoomed to fill the screen (swipe
  to explore, pinch out for the whole map, ⟲ to return). First tap on a
  place shows its name, second tap opens it; double-tap empty map to zoom
  in. Swipe a panel back the way it came in to close it.
- **Keyboard:** Tab moves between places on the map, Enter opens, Escape
  closes the top-most panel.

## Keeping the Codex up to date

- **A party meets a creature:** add its group id to that creature's
  `groups` in `src/data/bestiary.json` (e.g. `"groups": ["1", "2"]`).
  Creatures a group hasn't met don't appear at all (only a count of how
  many remain unseen). Link to one from lore with `{{creature:id}}`.
- **Rogues' Gallery:** fills itself — an NPC appears once they're
  mentioned (`{{npc:id}}`) in lore the visitor can read — grouped by
  each NPC's `location` in `NPCS` (a Wickermoor id like `wm_village`; if
  left out, the first place their name comes up). Bios are each entry's
  `body`.
- **Chronicle:** lists a group's unlocked Wickermoor locations, ordered
  by `WM_CHAPTERS` (chapter number, title, art) — renumber freely if your
  parties went another way. A homebrew session that isn't one of the
  book's chapters can have its own `heading` (e.g. "Interlude · The
  Webwoods") with a decimal `chapter` like 14.5 to slot it in between; places in the same chapter keep the order
  they're listed in. It quotes the group's own `byGroup` tale when there
  is one, and offers the place's ambience track if it has one in
  `WM_TRACKS` (not every place needs one).
- **Locked teasers:** `WM_TEASERS` holds the rumour (`text` and `source`)
  shown on each locked location.

## Adding art or music

Drop new files into the right `docs/` folder, reference them in
`src/data/descriptions.json`, then run:

```
python optimize_assets.py           # dry run: shows what it would compress
python optimize_assets.py --apply   # compress, keep originals, fix references
node build.js
```

It needs [ffmpeg](https://ffmpeg.org/download.html). Images become WebP
(quality 90; no visible difference at the size the site shows them) and
music is re-encoded at LAME V0 with embedded cover art stripped. Originals
are moved to `source-assets/originals/`, never deleted, and references in
`src/` are updated automatically. The two maps and the cover image are
left untouched.

## Building

```
node build.js
```

Regenerates `docs/index.html` from everything under `src/`. Run this after
editing `template.html`, `styles.css`, anything in `js/`, or either file in
`src/data/`.

The build first checks the data and stops with a clear message if anything
is broken (unknown NPC/species ids, missing images or audio, `[[image]]`
tags not listed for that location, a name in two groups…). Other options:

```
node build.js --report     to-do list: unused art/audio, NPCs without bios,
                           locations no group has unlocked yet, etc.
node build.js --force      build even if the checks found errors
node build.js --hash WORD  print the hash for a new admin password
                           (paste into ADMIN_PASSWORD_HASH in src/js/unlocks.js)
```

### Writing lore

Link to an NPC or species with `{{npc:id}}`, `{{npc:id|shown text}}`,
`{{species:id}}` or `{{species:id|shown text}}` (ids are the keys in
`NPCS` / `SPECIES`). Place a location's image inside its text with
`[[filename without extension]]`.

Character names in `GROUPS` and the admin password reach the page only as
hashes, and locked lore is never rendered until unlocked — enough to keep
casual spoilers hidden, though the lore text itself is still in the page
source for anyone determined.

## GitHub Pages

Repo Settings → Pages → Source: **Deploy from a branch**, branch `main`,
folder **`/docs`**.
