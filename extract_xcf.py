#!/usr/bin/env python3
"""
Syncs src/data/hotspots.json from the .xcf files in source-assets/ — one per
map (see SOURCES below): the main Druskenvald map and Wickermoor Hollow.

Each .xcf's GIMP *paths/vectors* are the design source for two things this
project generates by hand today:

  - Light markers: paths named like "Nerukhet_Light_Arakir" — usually a
    single degenerate point (a *_LIGHTS entry's x/y), but a light can also
    be traced as a full multi-point shape, in which case its glow should
    follow that shape instead of being a plain circle (that entry's
    `shape` field, an SVG path `d` string).
  - Province/feature/location outlines: long, closed multi-point paths named
    like "Ardengloom", "Moon", "Hartsblight_Forest" — the source shapes for
    a *_HOTSPOTS_SVG entry's `d` string.

Nothing here depends on GIMP being installed — it's a small, from-scratch
parser against the public XCF format (see xcfspec.txt / devel-docs/xcf.txt).
Two formats are supported because GIMP switches between them depending on
path complexity:

  - PROP_PATHS (type 23): the older, simpler format. Used only while every
    path in the image is a single continuous Bezier stroke.
  - PROP_VECTORS (type 25): the newer, general format (multiple strokes per
    path, parasites, etc). GIMP switches *all* paths in the file to this
    format as soon as even one path needs it — e.g. the first time a light
    gets traced as a real shape instead of a single point.

(A PyPI library, gimpformats, was tried first and crashed on this file's
property encoding — hence the hand-rolled parser.)

Usage:
  python extract_xcf.py                 # dry run: prints a change report only
  python extract_xcf.py --apply          # writes the changes into src/data/hotspots.json

Whenever the artist adds/moves/renames a light, retraces a light as a full
shape (or back to a point), or redraws a province/location outline in one of
the source-assets/*.xcf files: re-run this (with --apply once the report
looks right) and then `node build.js` to regenerate docs/index.html.

What it does NOT do automatically, by design:
  - Add brand-new lights or outlines (needs a human to pick color/tier/id/
    etc.) — these are only reported, never invented.
  - Remove entries no longer present in the .xcf — also only reported, in
    case the path was just temporarily hidden/renamed rather than deleted.
  - Bootstrap a source's *_LIGHTS/*_HOTSPOTS_SVG arrays the first time (see
    SOURCES) — sync only runs once those keys already exist in hotspots.json.
"""

import argparse
import json
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).parent
HOTSPOTS_JSON = ROOT / "src" / "data" / "hotspots.json"

# One entry per XCF source this tool keeps in sync. id_prefix is stripped
# from existing hotspot ids before matching against XCF path names (e.g.
# Wickermoor hotspot ids are "wm_hartsblight" but the traced path is just
# named "Hartsblight_Forest").
SOURCES = [
    {
        "name": "main map",
        "xcf_path": ROOT / "source-assets" / "MAP_Druskenvald_Sources.xcf",
        "lights_key": "SETTLEMENT_LIGHTS",
        "outlines_key": "MAIN_HOTSPOTS_SVG",
        "id_prefix": "",
        "outline_aliases": {
            "Moon": "crooked_moon",
            "Crescent Court": "crescent_court",
            "Ghostlight Express": "ghostlight_express",
        },
    },
    {
        "name": "Wickermoor Hollow",
        "xcf_path": ROOT / "source-assets" / "MAP_Wickermoor_Hollow_Sources.xcf",
        "lights_key": "WICKERMOOR_LIGHTS",
        "outlines_key": "WICKERMOOR_HOTSPOTS",
        "id_prefix": "wm_",
        "outline_aliases": {
            # "wm_crimson"/"wm_drowned" are abbreviated ids (not the full
            # name), and "Maidnemist_Cemetery" is a typo in the .xcf itself
            # (vs. the correctly-spelled "Maidenmist Cemetery" label) — map
            # each XCF path name to whatever normalized string actually
            # matches the existing id/label so sync doesn't flag them as
            # MISSING/NEW every run.
            "Crimson_Monastery": "crimson",
            "Drowned_Crossroads": "drowned",
            "Maidnemist_Cemetery": "maidenmist",
        },
    },
]

# Light paths are named "Foo_Light", "Foo_Light_Bar", etc. — this matches
# "_light" as a whole underscore-delimited token, not just the substring
# "light" (which would otherwise also match outline names like "Ghostlight
# Express"). A couple of paths are lights without following that
# convention (an artist naming inconsistency); listed explicitly here
# rather than guessed at.
LIGHT_NAME_RE = re.compile(r"(^|_)light($|_)", re.IGNORECASE)
LIGHT_NAME_OVERRIDES = {"Druskenvald"}  # intended as "Druskenvald_Light"


def is_light_name(name):
    return bool(LIGHT_NAME_RE.search(name)) or name in LIGHT_NAME_OVERRIDES


# A light whose position moved by less than this (in canvas px, out of the
# 3000x1953 space) is treated as unchanged — well above the ~0.07px rounding
# noise from round-tripping through 1-decimal JSON, but far below any
# deliberate reposition.
MOVE_EPSILON = 0.5


# ── Low-level XCF binary parsing ─────────────────────────────────────────
# Reference: https://github.com/j-jorge/xcftools/blob/master/xcfspec.txt

class XcfReader:
    def __init__(self, data: bytes):
        self.data = data

    def u32(self, off):
        return struct.unpack_from(">I", self.data, off)[0]

    def i32(self, off):
        return struct.unpack_from(">i", self.data, off)[0]

    def f32(self, off):
        return struct.unpack_from(">f", self.data, off)[0]

    def string(self, off):
        length = self.u32(off)
        if length == 0:
            return "", off + 4
        raw = self.data[off + 4: off + 4 + length]
        s = raw[:-1].decode("utf-8") if raw and raw[-1] == 0 else raw.decode("utf-8")
        return s, off + 4 + length


def _nodes_from_prop_paths_triples(points):
    """PROP_PATHS stores each node as up to 3 points: (anchor, handle_out,
    next-node's handle_in) — the anchor is the *first* element of each group.

    Closed paths repeat this in full 3-point groups (npoints = 3*N), wrapping
    the last node's trailing handle back to the first. Open paths' last node
    has no "next" node to hand a trailing handle to, so it only contributes 2
    points (npoints = 3*(N-1) + 2) — a plain single-anchor point marker (a
    light's position, no curve) is just the open-path N=1 case of that: 2
    points, no wrap.
    """
    n = len(points)
    nodes = []
    i = 0
    while i < n:
        remaining = n - i
        if remaining == 2:
            # Final node of an open path: anchor + handle_out only, no
            # trailing handle_in (there's no next node to receive one).
            nodes.append({"anchor": points[i][1:], "handle_out": points[i + 1][1:], "handle_in": None})
            i += 2
        else:
            nodes.append({"anchor": points[i][1:], "handle_out": points[i + 1][1:], "handle_in": None,
                          "_next_handle_in": points[i + 2][1:]})
            i += 3
    for idx, node in enumerate(nodes):
        pending = node.pop("_next_handle_in", None)
        if pending is not None:
            nodes[(idx + 1) % len(nodes)]["handle_in"] = pending
    for node in nodes:
        if node["handle_in"] is None:
            node["handle_in"] = node["anchor"]
    return nodes


def _nodes_from_prop_vectors_triples(points):
    """PROP_VECTORS stores each node as (handle_in, anchor, handle_out) —
    the anchor is the *middle* element of each 3-group, and each group is
    self-contained (no cross-referencing the next group needed)."""
    n = len(points)
    if n % 3 != 0:
        raise ValueError(f"point count {n} isn't a multiple of 3")
    groups = [points[i:i + 3] for i in range(0, n, 3)]
    return [{"handle_in": g[0][1:], "anchor": g[1][1:], "handle_out": g[2][1:]} for g in groups]


def parse_xcf(xcf_path: Path):
    """Returns a list of {"name": str, "strokes": [{"closed": bool, "nodes": [...]}]}.

    Each node is {"anchor": (x,y), "handle_in": (x,y), "handle_out": (x,y)},
    already normalized regardless of which on-disk property format it came from.
    """
    data = xcf_path.read_bytes()
    r = XcfReader(data)

    if data[:9] != b"gimp xcf ":
        raise ValueError(f"Not an XCF file: {xcf_path}")

    pos = 14  # "gimp xcf " (9) + version, e.g. "v011" (4) + NUL (1)
    pos += 4  # width (unused here)
    pos += 4  # height (unused here)
    pos += 4  # base image type (unused)
    pos += 4  # precision (unused) — present for the v7+ format this file uses

    paths = []
    while True:
        ptype = r.u32(pos)
        plen = r.u32(pos + 4)
        if ptype == 0:  # PROP_END
            break

        if ptype == 23:  # PROP_PATHS (older/simpler format)
            p = pos + 8
            p += 4  # active path index
            n = r.u32(p); p += 4
            for _ in range(n):
                name, p = r.string(p)
                p += 4  # locked
                p += 1  # state
                closed = r.u32(p); p += 4
                npoints = r.u32(p); p += 4
                version = r.u32(p); p += 4
                if version >= 2:
                    p += 4  # dummy, always 1
                if version == 3:
                    p += 4  # tattoo
                points = []
                for _ in range(npoints):
                    pt_type = r.i32(p); p += 4
                    x = r.f32(p); p += 4
                    y = r.f32(p); p += 4
                    points.append((pt_type, x, y))
                if npoints > 0:
                    nodes = _nodes_from_prop_paths_triples(points)
                    paths.append({"name": name, "strokes": [{"closed": bool(closed), "nodes": nodes}]})

        elif ptype == 25:  # PROP_VECTORS (newer/general format)
            p = pos + 8
            p += 4  # version tag
            p += 4  # active path index
            n = r.u32(p); p += 4
            for _ in range(n):
                name, p = r.string(p)
                p += 4  # tattoo
                p += 4  # visible
                p += 4  # linked
                m = r.u32(p); p += 4  # parasite count
                k = r.u32(p); p += 4  # stroke count
                for _ in range(m):
                    _, p = r.string(p)
                    p += 4  # flags
                    size = r.u32(p); p += 4
                    p += size
                strokes = []
                for _ in range(k):
                    p += 4  # stroke type (always 1: Bezier)
                    closed = r.u32(p); p += 4
                    na = r.u32(p); p += 4
                    npoints = r.u32(p); p += 4
                    points = []
                    for _ in range(npoints):
                        pt_type = r.i32(p); p += 4
                        x = r.f32(p); p += 4
                        y = r.f32(p); p += 4
                        p += 4 * (na - 2)  # skip pressure/xtilt/ytilt/wheel, unused
                        points.append((pt_type, x, y))
                    if npoints > 0:
                        strokes.append({"closed": bool(closed), "nodes": _nodes_from_prop_vectors_triples(points)})
                if strokes:
                    paths.append({"name": name, "strokes": strokes})

        pos += 8 + plen

    return paths


# ── Interpreting parsed paths ────────────────────────────────────────────

def total_points(path):
    return sum(len(s["nodes"]) for s in path["strokes"])


def fmt(v):
    return f"{v:.1f}"


def stroke_to_svg_d(stroke):
    nodes = stroke["nodes"]
    n = len(nodes)
    ax, ay = nodes[0]["anchor"]
    d = f"M {fmt(ax)},{fmt(ay)}"
    count = n if stroke["closed"] else n - 1
    for i in range(count):
        cur, nxt = nodes[i], nodes[(i + 1) % n]
        hx, hy = cur["handle_out"]
        ix, iy = nxt["handle_in"]
        nx, ny = nxt["anchor"]
        d += f" C {fmt(hx)},{fmt(hy)} {fmt(ix)},{fmt(iy)} {fmt(nx)},{fmt(ny)}"
    if stroke["closed"]:
        d += " Z"
    return d


def path_to_svg_d(path):
    return " ".join(stroke_to_svg_d(s) for s in path["strokes"])


def centroid(path):
    xs, ys = [], []
    for s in path["strokes"]:
        for node in s["nodes"]:
            x, y = node["anchor"]
            xs.append(x)
            ys.append(y)
    return sum(xs) / len(xs), sum(ys) / len(ys)


def normalize(name):
    return "".join(ch for ch in name.lower() if ch.isalnum())


# ── Syncing SETTLEMENT_LIGHTS ────────────────────────────────────────────

def light_xy(path):
    """A light's position: its single anchor if it's still a plain point,
    otherwise the centroid of its traced shape."""
    if total_points(path) <= 1:
        return path["strokes"][0]["nodes"][0]["anchor"]
    return centroid(path)


def sync_lights(xcf_lights, existing_lights):
    """Returns (report_lines, changed: bool). Mutates existing_lights in place."""
    lines = []
    changed = False

    by_name = {p["name"]: p for p in xcf_lights}
    unmatched_xcf = dict(by_name)
    unmatched_existing = []

    def apply_shape(light, p):
        nonlocal changed
        is_shape = total_points(p) > 1
        new_shape = path_to_svg_d(p) if is_shape else None
        if light.get("shape") != new_shape:
            if new_shape:
                lines.append(f"  SHAPED  {light['name']}: now traced as a {total_points(p)}-point shape")
            else:
                lines.append(f"  UNSHAPED {light['name']}: back to a plain point")
            if new_shape is None:
                light.pop("shape", None)
            else:
                light["shape"] = new_shape
            changed = True

    # Pass 1: match by name (stable across position/color/tier edits).
    for light in existing_lights:
        p = unmatched_xcf.pop(light.get("name"), None)
        if p is None:
            unmatched_existing.append(light)
            continue
        x, y = light_xy(p)
        if abs(x - light["x"]) > MOVE_EPSILON or abs(y - light["y"]) > MOVE_EPSILON:
            lines.append(f"  MOVED   {light['name']}: ({light['x']}, {light['y']}) -> ({x:.1f}, {y:.1f})")
            light["x"], light["y"] = round(x, 1), round(y, 1)
            changed = True
        apply_shape(light, p)

    # Pass 2: nearest-position match between whatever's left (handles renames).
    for light in unmatched_existing:
        best_name, best_d = None, None
        for name, p in unmatched_xcf.items():
            x, y = light_xy(p)
            d = ((x - light["x"]) ** 2 + (y - light["y"]) ** 2) ** 0.5
            if best_d is None or d < best_d:
                best_d, best_name = d, name
        if best_name is not None and best_d < 20:  # px — same marker, renamed
            p = unmatched_xcf.pop(best_name)
            x, y = light_xy(p)
            lines.append(f"  RENAMED {light.get('name')!r} -> {best_name!r} (matched by position, dist={best_d:.1f}px)")
            light["name"] = best_name
            light["x"], light["y"] = round(x, 1), round(y, 1)
            apply_shape(light, p)
            changed = True
        else:
            lines.append(f"  REMOVED? {light.get('name')!r} at ({light['x']}, {light['y']}) has no matching path in the .xcf anymore")

    for name, p in unmatched_xcf.items():
        x, y = light_xy(p)
        shape_note = f", traced as a {total_points(p)}-point shape" if total_points(p) > 1 else ""
        lines.append(f"  NEW     {name!r} at ({x:.1f}, {y:.1f}){shape_note} — not in src/data/hotspots.json; add manually (needs color/r/tier)")

    move_or_rename_or_shape = sum(1 for l in lines if l.lstrip().split()[0] in ("MOVED", "RENAMED", "SHAPED", "UNSHAPED"))
    unchanged = len(existing_lights) - move_or_rename_or_shape
    lines.insert(0, f"  {unchanged} unchanged")
    return lines, changed


# ── Syncing *_HOTSPOTS_SVG-style outline arrays ──────────────────────────

def sync_outlines(xcf_outlines, existing_hotspots, outline_aliases, id_prefix, target_key):
    lines = []
    changed = False
    unchanged_count = 0

    by_norm = {normalize(outline_aliases.get(p["name"], p["name"])): p for p in xcf_outlines}
    matched_norms = set()

    for hs in existing_hotspots:
        hs_id = hs["id"][len(id_prefix):] if hs["id"].startswith(id_prefix) else hs["id"]
        key = normalize(hs_id)
        p = by_norm.get(key)
        if p is None:
            key = normalize(hs["label"])
            p = by_norm.get(key)
        if p is None:
            lines.append(f"  MISSING  {hs['label']!r} (id={hs['id']}) has no matching path in the .xcf anymore")
            continue
        matched_norms.add(key)
        new_d = path_to_svg_d(p)
        if new_d != hs["d"]:
            lines.append(f"  CHANGED  {hs['label']!r} shape redrawn ({total_points(p)} points)")
            hs["d"] = new_d
            changed = True
        else:
            unchanged_count += 1

    for p in xcf_outlines:
        key = normalize(outline_aliases.get(p["name"], p["name"]))
        if key in matched_norms:
            continue
        if is_light_name(p["name"]):
            # Already handled by sync_lights(); a path can be traced as a
            # light's shape without also being a clickable hotspot outline
            # (e.g. Ghostlight_Express_Light isn't one — Druskenvald is,
            # once it's been added to MAIN_HOTSPOTS_SVG, which is why it's
            # matched above and never reaches this point).
            continue
        lines.append(f"  NEW      {p['name']!r} ({total_points(p)} points) — not in {target_key}; add manually (needs id/label)")

    lines.insert(0, f"  {unchanged_count} unchanged")
    return lines, changed


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="write changes to src/data/hotspots.json (default: dry run / report only)")
    args = parser.parse_args()

    hotspots = json.loads(HOTSPOTS_JSON.read_text(encoding="utf-8"))
    any_changed = False

    for source in SOURCES:
        xcf_path = source["xcf_path"]
        print(f"### {source['name']} ({xcf_path.name}) ###")
        if not xcf_path.exists():
            print(f"  Source file not found: {xcf_path}\n", file=sys.stderr)
            continue
        if source["lights_key"] not in hotspots or source["outlines_key"] not in hotspots:
            print(f"  {source['lights_key']}/{source['outlines_key']} not in hotspots.json yet — skipping "
                  f"(bootstrap this source's initial data first)\n")
            continue

        paths = parse_xcf(xcf_path)
        print(f"Parsed {xcf_path.name}: {len(paths)} paths")

        xcf_lights = [p for p in paths if is_light_name(p["name"])]
        # Not mutually exclusive with xcf_lights: a path can be traced as both
        # a light's glow shape *and* a clickable hotspot outline at once (e.g.
        # "Druskenvald" — see sync_outlines()'s handling of is_light_name paths).
        xcf_outlines = [p for p in paths if total_points(p) >= 3]
        print(f"  -> {len(xcf_lights)} lights, {len(xcf_outlines)} paths long enough to be outlines\n")

        print(f"=== Lights ({source['lights_key']}) ===")
        light_lines, lights_changed = sync_lights(xcf_lights, hotspots[source["lights_key"]])
        print("\n".join(light_lines))

        print(f"\n=== Outlines ({source['outlines_key']}) ===")
        outline_lines, outlines_changed = sync_outlines(
            xcf_outlines, hotspots[source["outlines_key"]],
            source["outline_aliases"], source["id_prefix"], source["outlines_key"],
        )
        print("\n".join(outline_lines))
        print()

        any_changed = any_changed or lights_changed or outlines_changed

    if not any_changed:
        print("No changes to apply.")
        return

    if args.apply:
        HOTSPOTS_JSON.write_text(json.dumps(hotspots, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Wrote changes to {HOTSPOTS_JSON.relative_to(ROOT)}. Run `node build.js` to regenerate docs/index.html.")
    else:
        print("Dry run only — re-run with --apply to write these changes to src/data/hotspots.json.")


if __name__ == "__main__":
    main()
