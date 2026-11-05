"""Bake a region's walkthrough road into the Adventure tab's town map.

Usage: python scripts/build-town-map.py kanto|johto   (needs Pillow and Node; rerun after changing the roads in
src/kanto-map.ts or src/johto-map.ts)

The whole walkthrough is drawn once onto the clean art (scripts/<region>/town-map.*) as the road still ahead: a dark
line under white dashes, as the app drew it live before. The app then draws only the gold line you have walked, which
is wider and covers it, so the map needs no full-size vector layer (a bitmap of tens of megabytes on a phone) and
nothing to redraw while it pans and zooms. Lines are drawn 4x and scaled down, for smooth edges.

The open sea around the map (scripts/<region>/sea.jpg, a seamless tile cut from the map's sea) is laid out 4 x 4 into
one block: the app places a few blocks around the map rather than repeating the tile, as an image set to repeat on
Android allocates a bitmap the size of the whole view. Johto's tile is cut here from its own open sea (SEA_CUT), its
edges cross-faded into the opposite ones so it repeats without a seam.

Writes assets/route/<region>.jpg and assets/route/<region>-sea.jpg.
"""
import json
import math
import subprocess
import sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
# Each region: its clean art, its map module and the road there, and for Johto where on the art its sea tile is cut
# (left, top, width, height, then how much of each edge is cross-faded).
REGIONS = {
    'kanto': {'art': 'town-map.jpg', 'module': './src/kanto-map.ts', 'road': 'kantoRoad'},
    'johto': {'art': 'town-map.png', 'module': './src/johto-map.ts', 'road': 'johtoRoad', 'sea_cut': (40, 800, 380, 180, 50, 30)},
}
SEA_TILES = 4
SS = 4
# In pixels of the art, as the app's polylines were: a 7 px dark line at 55%, white 3 px dashes of 7 on and 9 off.
OUTLINE = (7, (24, 32, 48), 0.55)
DASH = (3, (255, 255, 255), 1.0)
ON, OFF = 7, 9


def road(region):
    script = (f"Promise.all([import('./src/town-map.ts'), import('{region['module']}')])"
              f".then(([town, map]) => console.log(JSON.stringify(town.roadTrail(map.{region['road']}, 0, 1).ahead)))")
    return json.loads(subprocess.run(['node', '-e', script], cwd=ROOT, check=True, capture_output=True, text=True).stdout)


def cut_sea(art, cut):
    # A tile of the art's open sea whose right and bottom edges fade into the sea just past them, so it wraps cleanly.
    left, top, width, height, fade_x, fade_y = cut
    sea = art.crop((left, top, left + width + fade_x, top + height + fade_y))
    for fade, size, box in ((fade_x, width, lambda i: (i, 0, i + 1, sea.height)), (fade_y, height, lambda i: (0, i, sea.width, i + 1))):
        for i in range(fade):
            sea.paste(Image.blend(sea.crop(box(size + i)), sea.crop(box(i)), i / fade), box(i)[:2])
    return sea.crop((0, 0, width, height))


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
    name = sys.argv[1] if len(sys.argv) > 1 else 'kanto'
    region = REGIONS[name]
    folder = ROOT / 'scripts' / name
    out = ROOT / 'assets' / 'route' / f'{name}.jpg'
    sea_out = ROOT / 'assets' / 'route' / f'{name}-sea.jpg'
    art = Image.open(folder / region['art']).convert('RGB')
    if 'sea_cut' in region:
        cut_sea(art, region['sea_cut']).save(folder / 'sea.jpg', quality=90)
    points = road(region)
    layer(art, art.size, lambda mask: stroke(mask, points, OUTLINE[0]), OUTLINE[1], OUTLINE[2])
    layer(art, art.size, lambda mask: [stroke(mask, piece, DASH[0]) for piece in dashes(points)], DASH[1], DASH[2])
    art.save(out, quality=90, subsampling=0, optimize=True)
    print(f'{out.relative_to(ROOT)}: {art.size[0]}x{art.size[1]}, {len(points)} road points, {out.stat().st_size // 1024} KB')

    tile = Image.open(folder / 'sea.jpg').convert('RGB')
    sea = Image.new('RGB', (tile.width * SEA_TILES, tile.height * SEA_TILES))
    for row in range(SEA_TILES):
        for col in range(SEA_TILES):
            sea.paste(tile, (col * tile.width, row * tile.height))
    sea.save(sea_out, quality=80, optimize=True)
    print(f'{sea_out.relative_to(ROOT)}: {sea.size[0]}x{sea.size[1]}, {sea_out.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
