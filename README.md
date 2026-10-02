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
    descriptions.json   lore text, species, NPCs, groups/unlocks,
                         image and track references
    hotspots.json        map hotspot shapes + settlement light positions

source-assets/    Large working files, not part of the published site
  MAP_Druskenvald_Sources.xcf        GIMP source — the main map's paths/vectors
  MAP_Wickermoor_Hollow_Sources.xcf  GIMP source — Wickermoor Hollow's
  crooked_moon_reference.md     full lore/rules reference document

build.js          Combines src/* into docs/index.html — run after any edit
                   under src/: `node build.js`
extract_xcf.py     Syncs src/data/hotspots.json from source-assets/*.xcf
                   whenever the map's lights/outlines are edited in GIMP:
                   `python extract_xcf.py` (dry run) or `--apply` to write
```

## Building

```
node build.js
```

Regenerates `docs/index.html` from everything under `src/`. Run this after
editing `template.html`, `styles.css`, anything in `js/`, or either file in
`src/data/`.

## GitHub Pages

Repo Settings → Pages → Source: **Deploy from a branch**, branch `main`,
folder **`/docs`**.
