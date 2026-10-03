#!/usr/bin/env python3
"""
Shrinks the published media in docs/ without visible/audible quality loss,
keeping every original as a full-quality master. Run it whenever new art or
music has been dropped into docs/, then `node build.js`.

  python optimize_assets.py            # dry run: report what would change
  python optimize_assets.py --apply    # do it

Requires ffmpeg on the PATH (https://ffmpeg.org/download.html).

What it does:
  - Images (.png/.jpg/.jpeg): re-encoded as WebP at quality 90 next to the
    original (same name, .webp extension). Checked side by side at 100%
    zoom, the difference isn't visible, and the site shows these images at
    roughly half size anyway. Transparency is kept. An image is only
    converted when that saves at least 15%.
  - Music (.mp3): re-encoded with LAME's highest-quality VBR setting (V0,
    ~245 kbps) when it's above that bitrate or carries embedded cover art
    (which browsers never show); song tags are kept.
  - Originals are MOVED (never deleted) to source-assets/originals/<same
    path>, which is not part of the published site.
  - Updating an existing image or track works either way:
      * replace its master in source-assets/originals/ (same name), or
      * drop the new version into docs/ under the same name as before
        (e.g. docs/npc/NPC_Vex.png next to the published NPC_Vex.webp).
    Either way the published copy is rebuilt from the new master. The script
    tells which masters changed by keeping a fingerprint of each in
    source-assets/originals/manifest.json (commit that file too).
  - References to a converted image are rewritten in src/data/*.json,
    src/template.html and src/js/*.js, so nothing else needs updating.
    [[image]] tags in lore don't name an extension, so they keep working.

Left alone on purpose (see KEEP): the two maps, which can be zoomed to 4x
and are the site's centrepiece, and the cover image, which stays a JPEG for
link previews.
"""

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).parent
DOCS = ROOT / "docs"
ORIGINALS = ROOT / "source-assets" / "originals"
MANIFEST = ORIGINALS / "manifest.json"
REFERENCE_FILES = [
    *sorted((ROOT / "src" / "data").glob("*.json")),
    ROOT / "src" / "template.html",
    *sorted((ROOT / "src" / "js").glob("*.js")),
]

KEEP = {"MAP_Druskenvald.jpeg", "MAP_Wickermoor_Hollow.jpeg", "CrookedMoon_Cover.jpg"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg"}
WEBP_QUALITY = 90
MIN_SAVING = 0.15
MP3_VBR_QUALITY = 0          # LAME -V0
MP3_MAX_BITRATE = 260_000    # above this (or with cover art) gets re-encoded


def run(cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def probe(path):
    return json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format",
                           "-of", "json", str(path)]))


def human(n):
    return f"{n / 1_048_576:.1f} MB"


def encode_webp(src, dst):
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-frames:v", "1",
         "-c:v", "libwebp", "-quality", str(WEBP_QUALITY), "-compression_level", "6",
         "-preset", "drawing", str(dst)])


def encode_mp3(src, dst):
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-map", "0:a", "-map_metadata", "0",
         "-c:a", "libmp3lame", "-q:a", str(MP3_VBR_QUALITY), "-id3v2_version", "3", str(dst)])


def mp3_needs_work(path):
    info = probe(path)
    has_cover = any(s.get("codec_type") == "video" for s in info["streams"])
    bitrate = int(info["format"].get("bit_rate", 0))
    return has_cover or bitrate > MP3_MAX_BITRATE


def move_original(path, apply, replace=False):
    """Move a docs/ file to be the master in source-assets/originals/.
    `replace` allows overwriting an older master (a deliberate update — the
    previous version stays in git history)."""
    rel = path.relative_to(DOCS)
    dest = ORIGINALS / rel
    if apply:
        if dest.exists() and not replace:
            sys.exit(f"refusing to overwrite existing master: {dest}")
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(path), str(dest))
    return dest


def fingerprint(path):
    return hashlib.sha1(path.read_bytes()).hexdigest()


def load_manifest():
    try:
        return json.loads(MANIFEST.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return {}


def git_time(path):
    """Unix time of the last commit touching `path`, or 0 if unknown."""
    try:
        out = run(["git", "-C", str(ROOT), "log", "-1", "--format=%ct", "--", str(path.relative_to(ROOT))])
        return int(out.strip() or 0)
    except (subprocess.CalledProcessError, FileNotFoundError, ValueError):
        return 0


def published_copy(original):
    """The docs/ file built from a master, or None if it isn't published."""
    rel = original.relative_to(ORIGINALS)
    if original.suffix.lower() in IMAGE_EXTS:
        target = DOCS / rel.with_suffix(".webp")
    elif original.suffix.lower() == ".mp3":
        target = DOCS / rel
    else:
        return None
    return target if target.exists() else None


def stale_masters(manifest):
    """Masters whose published copy was built from an older version. A master
    with no fingerprint yet (first run) counts as stale only if git shows it
    was committed after its published copy."""
    stale = []
    for original in sorted(p for p in ORIGINALS.rglob("*") if p.is_file() and p != MANIFEST):
        target = published_copy(original)
        if not target:
            continue
        key = original.relative_to(ORIGINALS).as_posix()
        known = manifest.get(key)
        if known is None:
            if git_time(original) > git_time(target):
                stale.append((original, target))
        elif known != fingerprint(original):
            stale.append((original, target))
    return stale


def rewrite_references(renames, apply):
    """Replace each old docs-relative path with its new one, matching whole
    paths only (so "npc/A.png" can't match inside some longer path)."""
    changed = {}
    for ref in REFERENCE_FILES:
        text = original = ref.read_text(encoding="utf-8")
        for old, new in renames.items():
            text = re.sub(r"(?<![\w/.-])" + re.escape(old) + r"(?![\w.])", new, text)
        if text != original:
            changed[ref] = text
    if apply:
        for ref, text in changed.items():
            ref.write_text(text, encoding="utf-8")
    return list(changed)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--apply", action="store_true", help="make the changes (default: dry run)")
    args = parser.parse_args()

    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        sys.exit("ffmpeg/ffprobe not found on PATH — install ffmpeg first.")

    renames = {}
    before = after = 0
    manifest = load_manifest()
    refreshed = 0
    tmp = Path(tempfile.mkdtemp())
    try:
        # 1. Masters that were replaced in source-assets/originals/.
        for original, target in stale_masters(manifest):
            rel = original.relative_to(ORIGINALS).as_posix()
            print(f"update {rel}: master changed, rebuilding {target.relative_to(DOCS).as_posix()}")
            refreshed += 1
            if args.apply:
                out = tmp / ("out" + target.suffix)
                (encode_webp if target.suffix == ".webp" else encode_mp3)(original, out)
                shutil.move(str(out), str(target))
                manifest[rel] = fingerprint(original)

        # 2. New (or replacement) files dropped into docs/.
        files = sorted(p for p in DOCS.rglob("*") if p.is_file() and p.name not in KEEP)
        for path in files:
            ext = path.suffix.lower()
            rel = path.relative_to(DOCS).as_posix()

            if ext in IMAGE_EXTS:
                target = path.with_suffix(".webp")
                if target.exists():
                    # A new version of an image that's already published:
                    # it becomes the master and the published copy is rebuilt.
                    print(f"update {rel}: replacing {target.name} and its master")
                    refreshed += 1
                    if args.apply:
                        out = tmp / "out.webp"
                        encode_webp(path, out)
                        shutil.move(str(out), str(target))
                        master = move_original(path, True, replace=True)
                        manifest[master.relative_to(ORIGINALS).as_posix()] = fingerprint(master)
                    continue
                out = tmp / "out.webp"
                encode_webp(path, out)
                old_size, new_size = path.stat().st_size, out.stat().st_size
                if new_size > old_size * (1 - MIN_SAVING):
                    continue
                print(f"image {rel}: {human(old_size)} -> {human(new_size)}")
                before += old_size
                after += new_size
                renames[rel] = target.relative_to(DOCS).as_posix()
                if args.apply:
                    shutil.move(str(out), str(target))
                    master = move_original(path, True)
                    manifest[master.relative_to(ORIGINALS).as_posix()] = fingerprint(master)

            elif ext == ".mp3" and mp3_needs_work(path):
                out = tmp / "out.mp3"
                encode_mp3(path, out)
                old_size, new_size = path.stat().st_size, out.stat().st_size
                if new_size >= old_size:
                    continue
                print(f"audio {rel}: {human(old_size)} -> {human(new_size)}")
                before += old_size
                after += new_size
                if args.apply:
                    master = move_original(path, True, replace=True)
                    manifest[master.relative_to(ORIGINALS).as_posix()] = fingerprint(master)
                    shutil.move(str(out), str(path))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # Record a fingerprint for every master (including ones already up to
    # date on this first run), so the next run can spot changed ones.
    if args.apply:
        for original in sorted(p for p in ORIGINALS.rglob("*") if p.is_file() and p != MANIFEST):
            if published_copy(original):
                manifest.setdefault(original.relative_to(ORIGINALS).as_posix(), fingerprint(original))
        MANIFEST.write_text(json.dumps(dict(sorted(manifest.items())), indent=1) + "\n", encoding="utf-8")

    touched = rewrite_references(renames, args.apply)
    print(f"\n{'Saved' if args.apply else 'Would save'} {human(before - after)} "
          f"({human(before)} -> {human(after)}).")
    if touched:
        print(f"{'Updated' if args.apply else 'Would update'} references in: "
              + ", ".join(str(t.relative_to(ROOT)) for t in touched))
    if refreshed:
        print(f"{'Rebuilt' if args.apply else 'Would rebuild'} {refreshed} published "
              f"file(s) from updated masters.")
    if not args.apply:
        print("Dry run only — re-run with --apply to make these changes.")
    elif before or refreshed:
        print(f"Originals moved to {ORIGINALS.relative_to(ROOT)}/. Now run: node build.js")


if __name__ == "__main__":
    main()
