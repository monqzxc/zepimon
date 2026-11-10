"""Paints the Trail Defense level maps as pixel-art places, one picture per level.

Usage: python scripts/build-trail-scenes.py   (needs Pillow, numpy and node)

Each level (src/games/levels.ts) has a trail (src/games/trails.ts) and a habitat. This paints the whole board for it:
ground with soft patches instead of tiles, the trail as a worn road with wobbly banks, and the habitat's scenery
(trees, rocks, ponds, lava, gravestones, crystals...) thicker away from the trail and along the board's edges. Big
things stand on the corners between squares, so every square off the trail stays free to build on.

Painted at 16 px a square and saved 3 times that (48 px, the size the board draws a square), so it stays crisp.
Writes assets/trail-scenes/<trail>.png and src/generated/trail-scenes.js. The same seed gives the same picture.
"""
import json, math, random, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'trail-scenes'
INDEX = ROOT / 'src' / 'generated' / 'trail-scenes.js'
CELL, SCALE = 16, 3

def rgb(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
def shade(c, k): return tuple(max(0, min(255, int(v * k))) for v in c)
def blend(a, b, t): return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))

# Each habitat as a place: ground shades (dark, base, light), the trail, what grows or stands there (weights), small
# things underfoot, a pool, and what the board's edge is.
BIOMES = {
    'grass': dict(ground=['#559548', '#5fa052', '#6cb05d'], path='#d9b77a', props={'tree': 5, 'bush': 2, 'rock': 1, 'stump': 1},
                  deco=['#f4e06a', '#f08aa8', '#ffffff'], pool='water', leaf='#3f8a3c'),
    'bug': dict(ground=['#3f7a3e', '#488646', '#549450'], path='#c9a66e', props={'tree': 7, 'bush': 3, 'stump': 1, 'rock': 1},
                deco=['#e8584a', '#f4e06a', '#c9a0f0'], pool='water', leaf='#2f6e34'),
    'water': dict(ground=['#dcc688', '#e6d29a', '#efdcaa'], path='#b9976a', props={'palm': 4, 'rock': 2, 'bush': 1},
                  deco=['#f4a08a', '#ffffff', '#f0c060'], pool='water', leaf='#4f9a52', edge='sea'),
    'electric': dict(ground=['#a9a650', '#b8b45a', '#c6c268'], path='#8f8676', props={'rock': 3, 'bush': 2, 'pylon': 2, 'tree': 1},
                     deco=['#ffe14d', '#fff6a8', '#ffffff'], pool='water', leaf='#8f9a3a'),
    'ice': dict(ground=['#dbe8f5', '#e8f1fa', '#f6faff'], path='#a3bcd6', props={'pine': 5, 'rock': 2, 'crystal': 2},
                deco=['#ffffff', '#bfe4ff', '#9fd0f5'], pool='ice', leaf='#3f7a6a', snow=True, gem='#8fd0f5'),
    'fire': dict(ground=['#43333a', '#4c3b3c', '#58443f'], path='#8f7361', props={'rock': 4, 'deadtree': 2, 'vent': 1},
                 deco=['#ff8a3c', '#ffc24d', '#e8502c'], pool='lava', leaf='#1f1519', stone='#7a6470'),
    'rock': dict(ground=['#7d684f', '#8a7358', '#988064'], path='#cbb99c', props={'rock': 6, 'bush': 1, 'deadtree': 1},
                 deco=['#b8a488', '#6a5842', '#d8c8a8'], pool='lava', leaf='#7a7a48'),
    'ghost': dict(ground=['#433d5d', '#4b4466', '#564e74'], path='#a79bbf', props={'grave': 4, 'deadtree': 3, 'rock': 1},
                  deco=['#9fe8f0', '#c9a0f0', '#e8e0ff'], pool='mire', leaf='#2e2944', stone='#6f688a'),
    'dark': dict(ground=['#283338', '#2f3a40', '#38454b'], path='#7d8790', props={'tree': 4, 'deadtree': 2, 'rock': 1, 'bush': 1},
                 deco=['#7ef2c8', '#5cc8f0', '#c9a0f0'], pool='mire', leaf='#1f4a48', stone='#4a565c'),
    'psychic': dict(ground=['#51426f', '#5a4a7a', '#655487'], path='#d8cfe8', props={'crystal': 4, 'column': 3, 'rock': 1},
                    deco=['#ff9ad8', '#ffffff', '#c9a0f0'], pool='mire', leaf='#3a2f55', stone='#8f84ac', gem='#f08ad0'),
    'dragon': dict(ground=['#557062', '#5d7a6a', '#698877'], path='#c4b99a', props={'rock': 3, 'pine': 3, 'crystal': 1, 'bones': 1},
                   deco=['#e8e0c8', '#8fd0f5', '#f4e06a'], pool='water', leaf='#2f5a4a', gem='#6aa0f0'),
}
POOLS = {'water': ('#4a8fd0', '#6fb0e8', '#c8e6ff'), 'ice': ('#9fc8e8', '#c4e0f5', '#ffffff'), 'lava': ('#e8502c', '#ff8a3c', '#ffd24d'),
         'mire': ('#2a2444', '#3d3462', '#8f7ac8')}


def levels():
    script = ("const { LEVELS } = await import('./src/games/levels.ts'); const { PATHS } = await import('./src/games/battle.ts');"
              "console.log(JSON.stringify(LEVELS.map(l => { const p = PATHS[l.spec.path]; return { id: l.spec.path, habitat: l.spec.habitat,"
              " cols: p.cols, rows: p.rows, points: p.points, cells: [...p.cells] } })))")
    done = subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, capture_output=True, text=True)
    if done.returncode: sys.exit(done.stderr)
    return json.loads(done.stdout)


def smooth(rng, w, h, grain):
    """Soft noise in 0..1: random values on a coarse grid, stretched smooth."""
    small = Image.fromarray((rng.random((max(2, h // grain + 2), max(2, w // grain + 2))) * 255).astype('uint8'))
    return np.asarray(small.resize((w, h), Image.BICUBIC), dtype='float32') / 255


def distance_to_trail(points, w, h):
    ys, xs = np.mgrid[0:h, 0:w].astype('float32') + 0.5
    best = np.full((h, w), 1e9, dtype='float32')
    for a, b in zip(points, points[1:]):
        ax, ay, bx, by = a['x'] * CELL, a['y'] * CELL, b['x'] * CELL, b['y'] * CELL
        dx, dy = bx - ax, by - ay
        t = np.clip(((xs - ax) * dx + (ys - ay) * dy) / max(1e-6, dx * dx + dy * dy), 0, 1)
        best = np.minimum(best, np.hypot(xs - (ax + t * dx), ys - (ay + t * dy)))
    return best


# Scenery, each drawn with its foot at (x, y). They are small pixel pictures made of a few shapes.
def shadow(d, x, y, w): pass  # shadows are laid under all the scenery at once (paint)

def tree(d, x, y, b, r):
    leaf = rgb(b['leaf']); shadow(d, x, y, 6)
    d.rectangle([x - 1, y - 6, x + 1, y], fill=(96, 66, 44))
    d.ellipse([x - 7, y - 17, x + 7, y - 4], fill=shade(leaf, 0.72))
    d.ellipse([x - 6, y - 17, x + 5, y - 7], fill=leaf)
    d.ellipse([x - 5, y - 16, x + 1, y - 11], fill=shade(leaf, 1.28))
    if b.get('snow'): d.ellipse([x - 5, y - 17, x + 3, y - 13], fill=(246, 250, 255))

def pine(d, x, y, b, r):
    leaf = rgb(b['leaf']); shadow(d, x, y, 5)
    d.rectangle([x - 1, y - 4, x + 1, y], fill=(88, 62, 44))
    for i, (half, top) in enumerate([(6, 9), (5, 14), (3, 19)]):
        d.polygon([(x - half, y - 3 - i * 5), (x + half, y - 3 - i * 5), (x, y - top)], fill=shade(leaf, 0.8 + 0.2 * i))
        if b.get('snow'): d.polygon([(x - half // 2, y - top + 3), (x + half // 2, y - top + 3), (x, y - top)], fill=(246, 250, 255))

def palm(d, x, y, b, r):
    leaf = rgb(b['leaf']); shadow(d, x, y, 5)
    for i in range(10): d.point((x + (1 if i > 5 else 0), y - i), fill=(150, 112, 70)); d.point((x + 1 + (1 if i > 5 else 0), y - i), fill=(120, 88, 56))
    for dx, dy in [(-7, 2), (7, 2), (-5, -4), (6, -4), (0, -6)]:
        d.line([(x + 1, y - 10), (x + 1 + dx, y - 10 + dy)], fill=leaf, width=2)
        d.line([(x + 1, y - 11), (x + 1 + dx, y - 11 + dy)], fill=shade(leaf, 1.25))
    d.point((x, y - 9), fill=(110, 70, 40)); d.point((x + 2, y - 9), fill=(110, 70, 40))

def deadtree(d, x, y, b, r):
    bark = rgb(b['leaf']); shadow(d, x, y, 4)
    d.rectangle([x - 1, y - 9, x, y], fill=bark)
    for dx, dy in [(-5, -14), (4, -13), (-3, -8), (5, -8)]: d.line([(x, y - 7), (x + dx, y + dy)], fill=bark)
    d.point((x - 1, y - 9), fill=shade(bark, 1.5))

def rock(d, x, y, b, r):
    stone = rgb(b.get('stone', '#8a8c94')); shadow(d, x, y, 6)
    big = r.random() < 0.5
    w, h = (6, 8) if big else (4, 5)
    d.polygon([(x - w, y), (x - w + 1, y - h + 2), (x - 1, y - h), (x + w - 1, y - h + 3), (x + w, y)], fill=shade(stone, 0.75))
    d.polygon([(x - w + 1, y - h + 2), (x - 1, y - h), (x + w - 2, y - h + 3), (x - 1, y - h + 4)], fill=shade(stone, 1.25))
    if b.get('snow'): d.line([(x - w + 2, y - h + 2), (x + w - 3, y - h + 3)], fill=(246, 250, 255))

def bush(d, x, y, b, r):
    leaf = rgb(b['leaf']); shadow(d, x, y, 4)
    d.ellipse([x - 5, y - 7, x + 5, y], fill=shade(leaf, 0.85)); d.ellipse([x - 4, y - 7, x + 2, y - 3], fill=shade(leaf, 1.2))
    for _ in range(2): d.point((x + r.randint(-3, 3), y - r.randint(1, 5)), fill=rgb(b['deco'][0]))

def stump(d, x, y, b, r):
    shadow(d, x, y, 4); d.rectangle([x - 3, y - 4, x + 3, y], fill=(110, 78, 50)); d.ellipse([x - 3, y - 6, x + 3, y - 3], fill=(198, 160, 110))
    d.point((x, y - 5), fill=(150, 112, 70))

def grave(d, x, y, b, r):
    stone = rgb(b.get('stone', '#8a8c94')); shadow(d, x, y, 4)
    d.rounded_rectangle([x - 3, y - 9, x + 3, y], radius=3, fill=stone); d.line([(x - 3, y - 6), (x - 3, y)], fill=shade(stone, 0.7))
    d.line([(x, y - 7), (x, y - 3)], fill=shade(stone, 0.6)); d.line([(x - 1, y - 6), (x + 1, y - 6)], fill=shade(stone, 0.6))

def crystal(d, x, y, b, r):
    gem = rgb(b.get('gem', '#c9a0f0')); shadow(d, x, y, 5)
    for dx, h, w in [(-3, 8, 2), (1, 13, 3), (5, 7, 2)]:
        d.polygon([(x + dx - w, y), (x + dx, y - h), (x + dx + w, y)], fill=shade(gem, 0.8))
        d.polygon([(x + dx - w, y), (x + dx, y - h), (x + dx, y)], fill=shade(gem, 1.25))
    d.point((x + 1, y - 11), fill=(255, 255, 255))

def column(d, x, y, b, r):
    stone = (214, 208, 228); shadow(d, x, y, 5)
    h = r.choice([8, 12, 15])
    d.rectangle([x - 4, y - 2, x + 4, y], fill=shade(stone, 0.75)); d.rectangle([x - 3, y - h, x + 3, y - 2], fill=stone)
    d.line([(x - 1, y - h), (x - 1, y - 3)], fill=shade(stone, 0.82)); d.line([(x + 2, y - h), (x + 2, y - 3)], fill=shade(stone, 0.7))
    if h == 15: d.rectangle([x - 4, y - h - 2, x + 4, y - h], fill=shade(stone, 1.05))
    else: d.polygon([(x - 3, y - h), (x - 1, y - h - 2), (x + 1, y - h), (x + 3, y - h - 1), (x + 3, y - h)], fill=stone)

def pylon(d, x, y, b, r):
    shadow(d, x, y, 4); d.rectangle([x - 1, y - 14, x, y], fill=(96, 92, 84)); d.line([(x - 4, y - 12), (x + 3, y - 12)], fill=(70, 66, 60))
    d.polygon([(x + 2, y - 11), (x - 1, y - 6), (x + 1, y - 6), (x - 1, y - 2), (x + 4, y - 8), (x + 2, y - 8)], fill=(255, 225, 77))

def vent(d, x, y, b, r):
    shadow(d, x, y, 6); d.polygon([(x - 6, y), (x - 2, y - 7), (x + 2, y - 7), (x + 6, y)], fill=(58, 44, 51))
    d.ellipse([x - 2, y - 8, x + 2, y - 5], fill=(255, 138, 60)); d.point((x, y - 7), fill=(255, 210, 77))
    for i in range(3): d.point((x + r.randint(-2, 2), y - 10 - i * 2), fill=(150, 132, 132))

def bones(d, x, y, b, r):
    bone = (232, 224, 200)
    for i in range(4): d.arc([x - 6 + i * 3, y - 8, x + i * 3, y + 2], 180, 300, fill=bone)
    d.line([(x - 6, y - 1), (x + 7, y - 1)], fill=shade(bone, 0.85))

DRAW = dict(tree=tree, pine=pine, palm=palm, deadtree=deadtree, rock=rock, bush=bush, stump=stump, grave=grave, crystal=crystal,
            column=column, pylon=pylon, vent=vent, bones=bones)


def paint(level):
    seed = sum(ord(c) * (i + 1) for i, c in enumerate(level['id']))
    r, rng = random.Random(seed), np.random.default_rng(seed)
    b = BIOMES.get(level['habitat'], BIOMES['grass'])
    cols, rows = level['cols'], level['rows']
    w, h = cols * CELL, rows * CELL
    dist = distance_to_trail(level['points'], w, h)
    wobble = smooth(rng, w, h, 5)
    trail = dist < 6.6 + wobble * 1.6
    bank = (dist < 8.6 + wobble * 1.6) & ~trail

    # Ground: three shades in soft patches, flecked.
    dark, base, light = (np.array(rgb(c), dtype='float32') for c in b['ground'])
    patch = smooth(rng, w, h, 22) * 0.7 + smooth(rng, w, h, 7) * 0.3
    img = np.where((patch < 0.42)[..., None], dark, np.where((patch > 0.6)[..., None], light, base))
    fleck = rng.random((h, w))
    img = np.where((fleck < 0.03)[..., None], img * 0.9, np.where((fleck > 0.975)[..., None], np.minimum(255, img * 1.1), img))

    # The sea around a shore: water past a wavering line near the board's edge, foam where it meets the sand.
    ys, xs = np.mgrid[0:h, 0:w]
    rim = np.minimum.reduce([xs, ys, w - 1 - xs, h - 1 - ys]).astype('float32')
    if b.get('edge') == 'sea':
        reach = 5 + smooth(rng, w, h, 14) * 9
        sea = (rim < reach) & (dist > 11)
        foam = (rim < reach + 1.4) & ~sea & (dist > 11)
        deep, mid, pale = (np.array(rgb(c), dtype='float32') for c in POOLS['water'])
        img = np.where(sea[..., None], np.where((smooth(rng, w, h, 4) > 0.62)[..., None], mid, deep), img)
        img = np.where(foam[..., None], pale, img)
    else:
        sea = np.zeros((h, w), dtype=bool)

    # The trail: worn earth, darker toward its banks, with pebbles and a shaded bank outside it.
    road = np.array(rgb(b['path']), dtype='float32')
    wear = smooth(rng, w, h, 6)
    road_px = road * (0.93 + wear[..., None] * 0.14)
    road_px = np.where(((dist > 4.8 + wobble * 1.6) & trail)[..., None], road * 0.84, road_px)
    road_px = np.where((rng.random((h, w)) < 0.035)[..., None], road * 0.72, road_px)
    img = np.where(bank[..., None], img * 0.78, img)
    img = np.where(trail[..., None], road_px, img)

    canvas = Image.fromarray(np.clip(img, 0, 255).astype('uint8'), 'RGB').convert('RGBA')
    d = ImageDraw.Draw(canvas, 'RGBA')
    free = lambda x, y, gap: 0 <= x < w and 0 <= y < h and dist[int(y), int(x)] > gap and not sea[int(y), int(x)]

    # Small things underfoot: flowers, pebbles, sparks, shells.
    for _ in range(cols * rows * 2):
        x, y = r.randrange(w), r.randrange(h)
        if not free(x, y, 10): continue
        colour = rgb(r.choice(b['deco']))
        if r.random() < 0.5: d.point((x, y), fill=colour); d.point((x + 1, y), fill=shade(colour, 0.8))
        else:
            for dx, dy in [(0, 0), (2, 1), (1, 3)]: d.point((x + dx, y + dy), fill=colour)

    # Pools on corners well away from the trail, a few to a map.
    taken = []
    corners = [(i * CELL, j * CELL) for i in range(1, cols) for j in range(1, rows)]
    r.shuffle(corners)
    deep, mid, pale = (rgb(c) for c in POOLS[b['pool']])
    for x, y in corners:
        if len(taken) >= max(1, cols * rows // 70): break
        if not free(x, y, 30) or any(math.hypot(x - tx, y - ty) < 60 for tx, ty in taken): continue
        taken.append((x, y))
        rx, ry = r.randint(9, 13), r.randint(6, 9)
        d.ellipse([x - rx - 1, y - ry - 1, x + rx + 1, y + ry + 1], fill=shade(rgb(b['ground'][0]), 0.72))
        d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=deep)
        d.ellipse([x - rx + 2, y - ry + 1, x + rx - 3, y + ry - 3], fill=mid)
        for _ in range(3):
            sx, sy = x + r.randint(-rx + 4, rx - 6), y + r.randint(-ry + 3, ry - 3)
            d.line([(sx, sy), (sx + 3, sy)], fill=pale)

    # Scenery on the corners between squares, thicker away from the trail and thickest along the edges; drawn back to front.
    kinds, weights = list(b['props']), list(b['props'].values())
    spots = []
    for i in range(cols + 1):
        for j in range(rows + 1):
            x, y = i * CELL + r.randint(-2, 2), j * CELL + r.randint(-2, 2)
            cx, cy = min(w - 1, max(0, x)), min(h - 1, max(0, y))
            away = dist[cy, cx]
            if away < 17 or sea[cy, cx] or any(math.hypot(x - tx, y - ty) < 18 for tx, ty in taken): continue
            edge = i in (0, cols) or j in (0, rows)
            if r.random() < (0.85 if edge else min(0.6, 0.1 + (away - 17) / 90)): spots.append((y, x))
    # Soft shadows under all of it first, blended into the ground.
    shade_layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    under = ImageDraw.Draw(shade_layer)
    for y, x in spots: under.ellipse([x - 6, y + 1, x + 6, y + 5], fill=(0, 0, 0, 70))
    canvas.alpha_composite(shade_layer)
    d = ImageDraw.Draw(canvas, 'RGBA')
    for y, x in sorted(spots):
        DRAW[r.choices(kinds, weights)[0]](d, x, y + 3, b, r)

    big = canvas.convert('RGB').resize((w * SCALE, h * SCALE), Image.NEAREST)
    return big.quantize(colors=96, method=Image.MEDIANCUT, dither=Image.NONE)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.png'): old.unlink()
    made = levels()
    for level in made:
        paint(level).save(OUT / f"{level['id']}.png", optimize=True)
    INDEX.write_text('// Generated by scripts/build-trail-scenes.py: each Trail Defense level\'s map painted as a place, 48 px a square.\n'
                     'export const trailScenes = {\n' + ',\n'.join(f"  '{l['id']}': require('../../assets/trail-scenes/{l['id']}.png')" for l in made) + '\n}\n',
                     encoding='utf-8')
    size = sum(f.stat().st_size for f in OUT.glob('*.png'))
    print(f'Painted {len(made)} maps, {size // 1024} KB in all.')


if __name__ == '__main__':
    main()
