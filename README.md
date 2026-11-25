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
  explore/         the Crooked House's floor plan
  vendor/          three-explore.min.js, a trimmed three.js for the game
  crooked-house.html  the Crooked House game; generated, like index.html

src/              Source files that get combined into docs/index.html
  template.html    HTML skeleton
  styles.css       all CSS
  js/              all JS logic, joined in the order listed in build.js
    util.js          storage wrapper and small helpers
    music.js         background music and location ambience tracks
    lighting.js      map layers, night lighting, light mode, hover reveal;
                     drops to a lighter quality on slow devices (remembered)
    ambient.js       sparks rising from the lights and drifting wisps at night
    map.js           hotspots, zoom & pan, switching maps
    panels.js        lore / species / NPC panels and lore images
    unlocks.js       character-name recognition and group unlocks
    main.js          entry point and page-wide listeners
  data/
    descriptions.json   lore text, species, NPCs, groups/unlocks, image
                         and track references, chapters, locked teasers
    bestiary.json        the Codex's creatures (text, images, who's met them)
    hotspots.json        map hotspot shapes + settlement light positions
    map-previews.json    tiny blurred copies of the two maps, shown while the
                         real ones download (made by optimize_assets.py)
    explore.json         the Crooked House: walls, rooms, things to inspect, lights

source-assets/    Large working files, not part of the published site
  MAP_Druskenvald_Sources.xcf        GIMP source — the main map's paths/vectors
  MAP_Wickermoor_Hollow_Sources.xcf  GIMP source — Wickermoor Hollow's
  crooked_moon_reference.md     full lore/rules reference document
  originals/       full-quality masters of everything optimize_assets.py
                   has compressed (same folder layout as docs/)

build.js          Combines src/* into docs/index.html — run after any edit
                   under src/: `node build.js`
src/game/          The Crooked House game (see below), built into
                   docs/crooked-house.html by build.js
build-three.js     Rebuilds docs/vendor/three-explore.min.js (see below)
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
- **The Codex (📜):** Bestiary, Faces of the Hollow and Chronicle (see below).
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
  Creatures a group hasn't met don't appear at all. A creature with several forms can limit each
  picture to the groups that met that form with `imageGroups` (see the
  Vermin Familiar). Descriptions are written as what an onlooker would
  know — no weaknesses, abilities or secret origins — so keep new ones
  that way. Link to one from lore with `{{creature:id}}`.
- **Faces of the Hollow:** fills itself — an NPC appears once they're
  mentioned (`{{npc:id}}`) in lore the visitor can read — grouped by
  each NPC's `location` in `NPCS` (a Wickermoor id like `wm_village`; if
  left out, the first place their name comes up). Bios are each entry's
  `body`. Someone a group met who isn't named in their story text can be
  added with `metBy`, e.g. `"metBy": ["1", "3"]`.
- **Chronicle:** each group's story in the order it was played, from
  `STORY_ORDER` in `descriptions.json` — one list per group of beats like
  `{ "place": "wm_village", "beat": "Arrival", "date": "14 Mar 2026" }`.
  `beat` is one of the section headings in that group's write-up for the
  place (leave it out to mean the whole place); `date` is optional. The
  build stops if a beat's heading doesn't exist. Places a group has
  unlocked but the list doesn't mention yet appear at the end. Beats are
  filed under chapter headings from `WM_CHAPTERS` (chapter number, title,
  art, or a custom `heading` such as "Interlude · The Webwoods"). Each
  beat is written out in full in the Chronicle, with the `[[image]]`s its
  section names set beside the text (or the chapter art if it names
  none); each picture appears only once, at the first beat that has it,
  and opens full size when clicked.
  Keep a place's sections in the order they happened: each heading in
  the place's panel carries its step number from the timeline. "Show on
  the map" opens the place at that section; signed in as the GM you can
  switch between groups. A "Chapters" list at the top jumps to any
  chapter, and "Continue reading" picks up after the last beat the
  visitor read to the end (remembered in their browser). Reading a
  place's last beat in the Chronicle also clears its "new" glow on the
  map.
- **Locked teasers:** `WM_TEASERS` holds the rumour (`text` and `source`)
  shown on each locked location.

## The Crooked House (the game)

`docs/crooked-house.html` is a small first-person adventure through the
Crooked House's first floor, in the style of old grid-based dungeon
crawlers: step from square to square, turn in quarter turns, and get
through the house's hauntings by choices and wits. There's no combat:
scares add **Dread**, and when it fills your nerve breaks and you flee to
the porch (nothing is lost). It's the same for every group, and progress
is kept in the player's browser.

What's in it so far: the séance (the spirit board's questions fill the
journal), Petunia and her teacup (speak of her children, which the foyer's
portraits name), the music room's cursed waltz (play Patrini's tune back on
the harpsichord for the black ivory key), the Crooked Man in the hall, No
Escape on the porch steps, the map and the journal. The peacock, the oven
and the feast are teasers for the next chapter; the stairs don't go up yet.

- **The way in:** put `{{explore:crooked_house|Enter the Crooked House}}` in
  any lore text, e.g. Wickermoor Village's panel. It becomes a link to the
  game page (the text after `|` is optional).
- **Controls:** WASD or the arrow keys to walk, Q/E or ←/→ to turn, Space to
  look at or use what's in front of you, M for the map, J for the journal.
  On a phone, the on-screen buttons. Doors start closed (except the front
  door): walk into one or press Space to open it, Space again to close it.
  Every doorway on the plan gets a door automatically (`DOORS` in
  `core.js`); two doorways side by side become a double door. Each door
  always swings the same way: into the room rather than the hallway, into
  the house from the porch, and otherwise into the larger room
  (`swingInto`).
- **Where things are:**
  - `src/game/js/` — the game, joined in the order of `GAME_FILES` in
    build.js: `core.js` (the grid), `art.js` (all the placeholder art),
    `audio.js`, `furniture.js` (every piece of furniture, built from simple
    shapes at life size, and `mergeStatic`, which bakes the parts that never
    move into a few meshes so the house draws quickly), `world.js` (the 3D
    house; where the furniture stands is `SCENERY`, and `PICTURES` says how
    many framed pictures hang in which room),
    `ui.js`, `story.js` (every scene, the séance questions, mementos and
    clues), and the rest described below, then `main.js` (movement and the
    loop). They share one scope, so build.js stops if two files declare the
    same top-level name. `src/game/template.html` and
    `game.css` are the page.
  - `src/data/explore.json` — the house itself, in the floor plan's pixels
    (x right, y down): `walls` are centrelines (a gap between two wall lines
    is a doorway), `walkable` the areas you can walk in, `grid` the square
    size and offset, plus `rooms`, `pois` (their descriptions are what the
    game shows when you look at something) and `lights`. The game works out
    its grid of squares from the walls, so moving a wall here moves it in
    the game.
- **Music and the storm:** `MUSIC` at the top of `src/game/js/audio.js` says
  what plays where: the storm recording (*Dark and Stormy*, Tabletop Audio)
  all the time, clearer on the porch and through the conservatory glass;
  *Silent Hours* while you explore; *These Splitting Walls* when Dread
  reaches 7 (until it falls back to 4); *The Harpsichord* as the music
  room's cursed waltz; and *The Echoes* (Puddles the Clown) as Patrini's
  song, once, straight after the harpsichord puzzle is solved, stopping for
  good when you leave the music room. Music drops away for the séance.
  Credits are on the title screen (*Silent Hours* and *These Splitting
  Walls*: The Blasting Company; *The Harpsichord* is deliberately not
  credited). The tracks are in
  `docs/audio/crooked-house/` (masters in `source-assets/originals/`); the
  🔊 button opens Volume and Music sliders and Mute, kept between visits.
- **The spirit board:** the séance uses the official board and planchette
  art (`docs/explore/Ouija_Board.webp`, `Planchette.webp`). `OUIJA_SPOTS`
  in `story.js` is where each letter, number and word sits in the board
  picture, in its pixels; if the board art changes, those need re-measuring.
- **Items:** everything you can carry, search, combine and use is data in
  `src/game/js/items.js`: `ITEMS` (names and examine texts), `SEARCHES`
  (places to search and what each holds; an empty one gives a tooth, as in
  the book), `COMBOS` and `USES` (an item used on a thing). Furniture for a
  search spot is drawn by its `prop` and stands against the nearest wall
  of its square. Item pictures are drawn by `itemIcon()` in `art.js`. In
  the game: click an item or press 1–9 to pick it up, pick a second to
  combine them, Space to use it on what you face, X to examine it.
- **Encounters:** when a haunting turns on you (`encounter.js`). No
  fighting: you take turns. On yours you pick Act, Item, Release (once Calm
  is full: the peaceful end) or Flee; Acts and items say in small print
  what they do to the next round. Then, after a moment to get ready, a
  short round of that encounter's own challenge (`challenges.js`): the
  Feast's courses (take the right dish, in Mrs Patrini's order, which the
  menu card in the kitchen gives), Petunia's teacup (keep it level through
  the waves of her grief), the peacock's gaze (cross the gallery behind
  the busts, and raise the mirror as its eye finds you; with your eyes shut
  you go by the hum), the boogleswarm (herd them into the crack with your
  light), and the oven fire (get to the door; the pump fills a bucket).
  Every hit adds Dread; some items and acts are the dark way out, and
  raise Crookedness. Full Dread breaks your nerve: back to the porch, and
  the encounter starts over next time. Each encounter is data in
  `ENCOUNTERS` (`rooms.js`) with a `round(st)`; what you did on your turn
  reaches the round through `st.flags`. "Gentler encounters" in the 🔊
  panel slows things down and halves the Dread they cost. The music room's
  waltz has a beat bar at the top (the coming beats, the timing window,
  the weasels' beats in red), a soft tick on each beat, and says how close
  each step was.
- **Dread** (`dread.js`) is how you see the house, not just a meter: Calm
  (0–3) is safe and blind to its secrets, Uneasy (4–6) brings whispers and
  starts to show what's hidden, Terrified (7–9) shows its true face, and 10
  breaks your nerve. L (or the HUD button) turns the lantern up or down:
  bright keeps you calm but burns oil faster; low lets Dread creep up (never
  past 8 on its own) and reveals things. Oil runs out after about 15 minutes
  bright (never, in Gentler mode); in the dark Dread climbs to breaking. You
  calm down by the lit parlour fire, by drinking tea, and by freeing ghosts.
  A thing can be `minDread` (only there when frightened enough) or have a
  `dreadText`; the hallway's scratches and the cracked mirror are examples.
- **Filthy Jasper** (`jasper.js`), the hag's weasel-familiar: glimpsed at
  the edge of your view when you're uneasy; waiting in the room, ready to
  talk, when you're terrified. He trades in teeth (stolen things back, a
  hint for 1 tooth) and offers to "take the fear away" for a bit of your
  soul (Crookedness). When your nerve breaks he steals something you carry,
  mementos included; his nest under the foyer stairs (visible only when
  you're terrified, until you've found it) has everything he took.
- **The look** (`finish.js`, art.js): the house is drawn through one
  finishing pass that gives everything the characters' inked look (ink
  lines where shapes meet, a few tones, film grain, a vignette, a grade that
  goes cold with Dread); it's off on low-powered devices and can be turned
  off in the volume panel ("Film look"). Floors, wood, plaster, stone,
  fabric, the roof and the weatherboards are photographs from Poly Haven
  (polyhaven.com, CC0) in `docs/explore/textures/`, recoloured to each
  room's palette (`FLOOR_PHOTOS`, `photoAs`, `photoGrime`); until one has
  loaded, the drawn version shows. The lantern in your hand is drawn
  (`heldLanternArt`) and swayed by `tickHeld` in main.js. Skirting,
  cornices, cobwebs, rugs and small objects are `addDetails` in
  furniture.js; candle and hearth flicker, the chandelier's sway and the
  dust in the lantern light are `tickAmbient` in main.js. Footsteps change
  with the floor (`FLOOR_SOUND`), the house creaks now and then, and
  Jasper's scurrying comes from his side (`panTo`).
- **The official artwork** (`docs/explore/characters/`, full-size masters
  in `source-assets/originals/explore/characters/`): the painting of the
  house (title screen), the Crooked Man (the full figure wherever he stands
  in the house, the doorway painting as his face in dialogue), Filthy
  Jasper, the boogleswarm (its encounter), and Joseph Patrini, Gail Patrini
  and Sally Lockwood (the first three foyer portraits, and Joseph and Gail
  in Joseph's memory; a head-and-shoulders portrait becomes a whole person
  by fading into a soft body, `paintFigure` in art.js). Standing in the
  house, every character is stylized to sit in its light (`stylizePainting`:
  a few tones, ink edges, lit by the lantern, with accents like the grin
  and Jasper's eye kept bright; settings in `STYLE`); the paintings
  themselves appear as they are beside the dialogue, on the encounter
  screens and on the title screen. `CHARACTER_ART` in
  art.js lists them; `PORTRAITS` in ui.js says whose face shows when they
  speak. Vessla Browntooth's portrait is kept for a later floor.
- **The arrival** (`arrival.js`): a new game opens outside at dusk, at the
  estate's gate (the book's "Meet the Jenkins" and "There Was a Crooked
  Man"): the village lamps below, the Jenkins (Walter, Gilly, Dani and
  Shuck) on their way to town, Wisp the grey cat, then the manor twisting
  into the Crooked House as you walk up, the Crooked Man's welcome and
  chat on the porch, and the storm. Skip it with the Skip button or Esc;
  click the narration (or Space) to move it on. It's never shown for a
  saved game. The grounds it builds (hillside, pond, barns, fence and gate,
  the house's upper storeys, roof and turret, the porch roof and garden)
  stay for every game, twisted, out in the dark beyond the porch; `bend()`
  is how the house twists, `ARRIVAL` where everything stands.
- **Flashbacks** (`flashback.js`): freeing a ghost plays their last
  minutes, in the house as it was seventy years ago (warm, sepia, every door
  open, no storm, the family alive). You can walk and look within the
  memory but not change how it ends. A ghost you destroyed is remembered
  through Eustace's eyes instead, in red. Each memory is a short script in
  `FLASHBACKS`, and each leaves a clue for upstairs: Petunia's (where
  Sally's doll and Arthur's bear are) and Joseph Patrini's (where Gail hid,
  with her hairpin).
- **The music room** (`rhythm.js`): stepping onto the dance floor starts
  the cursed waltz (The Harpsichord). While it plays you can only move in
  time: each step or turn must land on a beat (one per beat; the beat is
  read from the track, 108 a minute), or you stumble and Dread rises.
  Weasels move on every other beat and bite; landing on one in time stomps
  it (the dark way). At the harpsichord, play Patrini's tune to end it: with
  his hand guiding yours (after the séance), from his sheet music (both
  halves), or by ear. Or smash the harpsichord with the hatchet: the key
  comes out tainted, and his memory plays through Eustace's eyes.
- **More of the first floor** (`rooms.js`): the kitchen's oven (undo its
  glyph from memory, or force it and flee the fire), Petunia's encounter if
  you snatch her cup (the green ribbon is the dark way), the gallery
  (Keziah's paintings hide a weasel, a centipede and a pigeon for
  frightened eyes; the peacock's gaze can be turned with the mirror shard;
  Keziah's memory follows), the foyer portraits' curse (the next time your
  Dread reaches 6, a swarm comes out of the walls), and spirit-board hints
  after the séance (a word at a time, for a point of Dread). Destroying
  hauntings raises Crookedness: your view leans, your portrait grins, the
  Crooked Man whispers. With the gem, key and cup the stairs let you up:
  the end of the first floor, with a tally of whom you freed.
- **Light:** `ROOM_MOOD` in `world.js` gives each room its own base light
  (a colour and a level), easing in as you walk between rooms; `LANTERN`
  sets the lantern you carry.
- **What you can use:** anything in `THINGS` (`story.js`) shows a soft glint
  when you're near (its height is in `THING_HEIGHTS`), brighter when you're
  facing it and faint once you've looked at it; a closed door you face
  glints at its handle.
- **Replacing the placeholder art:** every texture and figure is drawn by
  one function in `art.js` (`SPRITES` for the upright figures and furniture,
  `wallTexture`, `floorTexture` and so on). To use a real drawing, put the
  image in `docs/explore/` and have that function load it instead
  (`new THREE.TextureLoader().load('explore/your-image.png')`), keeping
  transparent backgrounds for figures.
- **three.js:** `docs/vendor/three-explore.min.js` holds only the parts of
  three.js the game uses. If the game starts using another part, `node
  build.js` says which is missing; run `node build-three.js` to rebuild it,
  then `node build.js`.

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
left untouched, but if a map changes the script remakes its blurred
preview (`src/data/map-previews.json`); the build warns when one is out of
date.

To **update** an existing image or track, either replace its master in
`source-assets/originals/` (same name) or drop the new version into `docs/`
under the same name as before — then run the same two commands. The script
rebuilds the published copy; it spots changed masters through
`source-assets/originals/manifest.json`, so commit that file too.

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

On every push, GitHub also runs `tests/smoke.js`: it opens the built site
in a headless browser as one character of each group and goes through
every panel they can read, the Bestiary, the Gallery and the Chronicle,
failing on script errors, missing images or tracks, leftover `{{…}}` /
`[[…]]` tags, or a Chronicle beat with no text. To run it yourself:
`npm install --no-save playwright && npx playwright install chromium`,
then `node tests/smoke.js`.

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
