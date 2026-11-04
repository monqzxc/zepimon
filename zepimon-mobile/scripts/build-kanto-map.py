"""Bake the Kanto walkthrough's road into the Adventure tab's town map.

Usage: python scripts/build-kanto-map.py   (needs Pillow and Node; rerun after changing the roads in src/kanto-map.ts)

The whole walkthrough is drawn once onto the clean art (scripts/kanto/town-map.jpg) as the road still ahead: a dark
line under white dashes, as the app drew it live before. The app then draws only the gold line you have walked, which
is wider and covers it, so the map needs no full-size vector layer (a bitmap of tens of megabytes on a phone) and
nothing to redraw while it pans and zooms. Lines are drawn 4x and scaled down, for smooth edges.

The open sea around the map (scripts/kanto/sea.jpg, a seamless tile cut from the map's sea) is laid out 4 x 4 into one
block: the app places a few blocks around the map rather than repeating the tile, as an image set to repeat on Android
allocates a bitmap the size of the whole view.

Writes assets/route/kanto.jpg and assets/route/kanto-sea.jpg.
"""
import json
import math
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'scripts' / 'kanto' / 'town-map.jpg'
SEA_SOURCE = ROOT / 'scripts' / 'kanto' / 'sea.jpg'
OUT = ROOT / 'assets' / 'route' / 'kanto.jpg'
SEA_OUT = ROOT / 'assets' / 'route' / 'kanto-sea.jpg'
SEA_TILES = 4
SS = 4
# In pixels of the art, as the app's polylines were: a 7 px dark line at 55%, white 3 px dashes of 7 on and 9 off.
OUTLINE = (7, (24, 32, 48), 0.55)
DASH = (3, (255, 255, 255), 1.0)
ON, OFF = 7, 9


def road():
    script = "import('./src/kanto-map.ts').then(m => console.log(JSON.stringify(m.kantoTrail(0, 5000).ahead)))"
    return json.loads(subprocess.run(['node', '-e', script], cwd=ROOT, check=True, capture_output=True, text=True).stdout)


def stroke(mask, points, width):
    # A polyline with round joins and caps, like strokeLinejoin/strokeLinecap="round".
    draw = ImageDraw.Draw(mask)
    scaled = [(x * SS, y * SS) for x, y in points]
    r = width * SS / 2
    if len(scaled) > 1:
        draw.line(scaled, fill=255, width=round(width * SS), joint='curve')
    for x, y in scaled:
        draw.ellipse((x - r, y - r, x + r, y + r), fill=255)


def dashes(points):
    # The road cut into dashes along its length, each dash a short polyline (a dash can turn a corner).
    pieces, current, on, left = [], [points[0]], True, ON
    for (ax, ay), (bx, by) in zip(points, points[1:]):
        length, at = math.hypot(bx - ax, by - ay), 0.0
        while length - at > left:
            at += left
            point = (ax + (bx - ax) * at / length, ay + (by - ay) * at / length)
            if on:
                pieces.append(current + [point])
            current, on = [point], not on
            left = ON if on else OFF
        left -= length - at
        current.append((bx, by))
    if on and len(current) > 1:
        pieces.append(current)
    return pieces


def layer(art, size, draw_mask, color, alpha):
    mask = Image.new('L', (size[0] * SS, size[1] * SS), 0)
    draw_mask(mask)
    mask = mask.resize(size, Image.LANCZOS).point(lambda value: round(value * alpha))
    art.paste(Image.new('RGB', size, color), (0, 0), mask)


def main():
    art = Image.open(SOURCE).convert('RGB')
    points = road()
    layer(art, art.size, lambda mask: stroke(mask, points, OUTLINE[0]), OUTLINE[1], OUTLINE[2])
    layer(art, art.size, lambda mask: [stroke(mask, piece, DASH[0]) for piece in dashes(points)], DASH[1], DASH[2])
    art.save(OUT, quality=90, subsampling=0, optimize=True)
    print(f'{OUT.relative_to(ROOT)}: {art.size[0]}x{art.size[1]}, {len(points)} road points, {OUT.stat().st_size // 1024} KB')

    tile = Image.open(SEA_SOURCE).convert('RGB')
    sea = Image.new('RGB', (tile.width * SEA_TILES, tile.height * SEA_TILES))
    for row in range(SEA_TILES):
        for col in range(SEA_TILES):
            sea.paste(tile, (col * tile.width, row * tile.height))
    sea.save(SEA_OUT, quality=80, optimize=True)
    print(f'{SEA_OUT.relative_to(ROOT)}: {sea.size[0]}x{sea.size[1]}, {SEA_OUT.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
