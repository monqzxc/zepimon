"""Cuts the tab bar's fitness art (src/TabBar.tsx) from sheets in pokemon_data/: the six poses Gengar and Deoxys take
turns in while floating over the Adventure button, and the Deoxys that peeks over the bar in the Deoxys theme. (Gengar's
peeking art is drawn by scripts/build-nav-gengar.mjs.)

Usage: python scripts/build-nav-poses.py   (needs Pillow and numpy)

Each sheet shows the Pokemon in a cap, T-shirt and shorts on a pale background, gridded or plain. Writes transparent PNGs:
- assets/nav/<pokemon>/float-stand, float-wave, float-lift, float-tired, float-pushup and float-situp: each pose on a
  320 x 256 canvas (wider than tall, so lifted dumbbells fit) at one scale per Pokemon, centered with the ground on
  one line, so the Pokemon keeps its size as it changes pose.
- assets/nav/deoxys/head-idle, head-blink and head-boo: the head peeking over the bar, on the 120 x 100 grid at two
  pixels per unit with row 72 at the bar's top edge. The standing pose's head; the waving pose's, whose eyes are shut,
  for blinking; and the standing one's with the lifting pose's sweat drop for the surprised pop-up.
- assets/nav/deoxys/paws: Gengar's paw shapes (scripts/build-nav-gengar.mjs) in Deoxys's teal, at the same spots.
"""
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SHEETS = ROOT / 'pokemon_data'
NAV = ROOT / 'zepimon-mobile' / 'assets' / 'nav'
CANVAS = (320, 256)

# Each pose's sheet and its region there.
POSES = {
    'deoxys': {
        'stand': ('deoxys-fitness.png', (80, 20, 340, 385)), 'wave': ('deoxys-fitness.png', (505, 20, 865, 385)),
        'lift': ('deoxys-fitness.png', (975, 20, 1340, 385)), 'tired': ('deoxys-fitness.png', (40, 400, 360, 768)),
        'pushup': ('deoxys-fitness.png', (480, 400, 880, 768)), 'situp': ('deoxys-fitness.png', (950, 400, 1350, 768))
    },
    'gengar': {
        'stand': ('gengar-fitness-1.png', (30, 0, 330, 287)), 'wave': ('gengar-fitness-1.png', (360, 0, 680, 287)),
        'lift': ('gengar-fitness-1.png', (700, 0, 1024, 287)), 'tired': ('gengar-fitness-2.png', (6, 0, 150, 235)),
        'pushup': ('gengar-fitness-2.png', (150, 0, 312, 235)), 'situp': ('gengar-fitness-2.png', (312, 0, 476, 235))
    }
}
# A sheet drawn smaller than its Pokemon's first is enlarged by this much first: at 1.4 the second Gengar sheet's caps
# and heads match the first's.
SHEET_SCALE = {'gengar-fitness-2.png': 1.4}

# Deoxys's peeking head: the standing pose's cap, which lines up the waving and lifting heads with it, the sheet row
# below its chin where the crop stops, and the row at the chin that sits on the bar's edge (grid row 72), so the whole
# face shows above the bar.
CAP = (140, 30, 270, 110)
HEAD_BOTTOM = 205
EDGE_ROW = 186
TEAL, TEAL_LIGHT, INK = (110, 154, 146), (150, 190, 182), (52, 14, 20)


def regions(mask):
    """The connected regions (4-neighbour) of a boolean mask, each as a (rows, columns) index pair."""
    seen = np.zeros(mask.shape, dtype=bool)
    height, width = mask.shape
    found = []
    for y, x in zip(*np.nonzero(mask)):
        if seen[y, x]: continue
        seen[y, x] = True
        stack, rows, columns = [(y, x)], [], []
        while stack:
            cy, cx = stack.pop()
            rows.append(cy); columns.append(cx)
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        found.append((np.array(rows), np.array(columns)))
    return found


def cut_out(sheet):
    """The sheet as RGBA with the background, its grid lines and the ground shadows made transparent."""
    rgb = np.asarray(sheet, dtype=np.int16)
    light, spread = rgb.max(axis=2), rgb.max(axis=2) - rgb.min(axis=2)
    # The background, grid lines and shadows are light, nearly colorless greys, filled from the corner. Every figure has
    # a closed dark outline, so the fill never reaches the white shirts, brims, teeth or eyes.
    greyish = (spread < 22) & (light > 140)
    mask = Image.fromarray(np.where(greyish, 255, 0).astype(np.uint8)).copy()   # fromarray is read-only; floodfill needs a copy
    ImageDraw.floodfill(mask, (0, 0), 128, thresh=0)
    removed = np.asarray(mask) == 128
    # Edge pixels blend the dark outline with whatever was behind it, so they turn partly transparent: alpha from how
    # far each is from the background next to it, and that background taken back out of its color.
    near = np.asarray(Image.fromarray((removed * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
    edge = near & ~removed
    rgbf = rgb.astype(np.float64)
    weight = removed.astype(np.float64)
    def box(values):
        padded = np.pad(values, ((3, 3), (3, 3)) + ((0, 0),) * (values.ndim - 2))
        total = np.zeros_like(values, dtype=np.float64)
        for dy in range(7):
            for dx in range(7): total += padded[dy:dy + values.shape[0], dx:dx + values.shape[1]]
        return total
    count = box(weight)
    behind = box(rgbf * weight[..., None]) / np.maximum(count, 1)[..., None]
    lum = lambda c: c[..., 0] * 0.299 + c[..., 1] * 0.587 + c[..., 2] * 0.114
    ink = sum(c * w for c, w in zip(INK, (0.299, 0.587, 0.114)))
    alpha = np.ones(removed.shape)
    alpha[removed] = 0
    blend = np.clip((lum(behind) - lum(rgbf)) / np.maximum(lum(behind) - ink, 1), 0, 1)
    alpha[edge] = blend[edge]
    color = np.where(edge[..., None], (rgbf - (1 - alpha[..., None]) * behind) / np.maximum(alpha[..., None], 0.05), rgbf)
    out = np.dstack([np.clip(color, 0, 255), alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def trimmed(image):
    """image without stray specks under 8 pixels (bits of grid line at a sheet's edge), cropped to what is left."""
    opaque = np.asarray(image.getchannel('A')) > 0
    rgba = np.asarray(image).copy()
    for region in regions(opaque):
        if len(region[0]) < 8: rgba[region] = 0
    clean = Image.fromarray(rgba, 'RGBA')
    return clean.crop(clean.getbbox())


def resized(image, scale):
    """Resizes with premultiplied alpha, so edges keep their color instead of picking up the transparent black."""
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    return image.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')


def floats(pokemon, sheets):
    """The six poses at the one scale where the tallest fits 248 pixels and the widest 312, centered, ground on one
    line. Each standing pose's head sits over the middle of its box, so their heads line up too."""
    poses = {name: trimmed(sheets[sheet].crop(region)) for name, (sheet, region) in POSES[pokemon].items()}
    enlarge = {name: SHEET_SCALE.get(sheet, 1) for name, (sheet, _) in POSES[pokemon].items()}
    scale = min(min((CANVAS[1] - 8) / (pose.height * enlarge[name]), (CANVAS[0] - 8) / (pose.width * enlarge[name]))
                for name, pose in poses.items())
    for name, pose in poses.items():
        small = resized(pose, scale * enlarge[name])
        canvas = Image.new('RGBA', CANVAS)
        canvas.alpha_composite(small, (round((CANVAS[0] - small.width) / 2), CANVAS[1] - 4 - small.height))
        canvas.save(NAV / pokemon / f'float-{name}.png')
        print(f'assets/nav/{pokemon}/float-{name}.png')


def offset(sheet, region):
    """Where the region's copy of the standing Deoxys's cap is, relative to the standing pose: found by matching it."""
    rgb = np.asarray(sheet, dtype=np.int32)
    x0, y0, x1, y1 = CAP
    cap = rgb[y0:y1, x0:x1]
    nominal = region[0] - POSES['deoxys']['stand'][1][0]
    best = min(((np.abs(rgb[y0 + dy:y1 + dy, x0 + nominal + dx:x1 + nominal + dx] - cap).sum(), nominal + dx, dy)
                for dy in range(-20, 21) for dx in range(-80, 81)))
    return best[1], best[2]


def heads(sheet, art):
    """Deoxys's peeking head in three faces, cropped from the cap to below the chin and placed on the 240 x 200 grid."""
    x0, _, x1, _ = POSES['deoxys']['stand'][1]
    def head(pose):
        dx, dy = (0, 0) if pose == 'stand' else offset(sheet, POSES['deoxys'][pose][1])
        return art.crop((x0 + dx, dy, x1 + dx, HEAD_BOTTOM + dy))
    idle, blink, sweaty = head('stand'), head('wave'), head('lift')
    # The waving arm reaches into its head crop; only what lies inside the standing head's outline is kept.
    blink.putalpha(Image.fromarray(np.minimum(np.asarray(blink.getchannel('A')), np.asarray(idle.getchannel('A')))))
    # The surprised face is the standing one with the lifting pose's sweat drop: the largest patch of light blue (the
    # dumbbells' shine is light blue too, in specks) and the outline around it.
    sweat_rgb = np.asarray(sweaty.convert('RGB'), dtype=np.int16)
    blue = (sweat_rgb[..., 2] - sweat_rgb[..., 0] > 35) & (sweat_rgb[..., 2] > 150)
    largest = max(regions(blue), key=lambda region: len(region[0]))
    patch = np.zeros(blue.shape, dtype=np.uint8)
    patch[largest] = 255
    boo = idle.copy()
    boo.paste(sweaty, (0, 0), Image.fromarray(patch).filter(ImageFilter.MaxFilter(9)))
    top = idle.getbbox()[1]
    scale = min(1.0, (144 - 4) / (EDGE_ROW - top))         # the cap's top stays at least two rows inside the grid
    for image, name in ((idle, 'head-idle'), (blink, 'head-blink'), (boo, 'head-boo')):
        small = resized(image, scale)
        canvas = Image.new('RGBA', (240, 200))
        canvas.alpha_composite(small, (round(120 - small.width / 2), round(144 - EDGE_ROW * scale)))
        canvas.save(NAV / 'deoxys' / f'{name}.png')
        print(f'assets/nav/deoxys/{name}.png')


def bezier(points, steps=24):
    """A cubic Bezier from four points, sampled into a polyline."""
    (ax, ay), (bx, by), (cx, cy), (dx, dy) = points
    return [((1 - t) ** 3 * ax + 3 * (1 - t) ** 2 * t * bx + 3 * (1 - t) * t * t * cx + t ** 3 * dx,
             (1 - t) ** 3 * ay + 3 * (1 - t) ** 2 * t * by + 3 * (1 - t) * t * t * cy + t ** 3 * dy) for t in (i / steps for i in range(steps + 1))]


def paws():
    """Gengar's paw outline, toe lines and shine, tilted out to follow the bar's shoulders, in Deoxys's colors."""
    k = 16                                                   # supersampled: 16 pixels per grid unit, shrunk to 2
    outline = (bezier([(6.5, 74.5), (4.5, 67), (9, 61), (16, 61)]) + bezier([(16, 61), (23, 61), (28, 65), (27.5, 71.5)])
               + bezier([(27.5, 71.5), (27, 75.5), (24.5, 77.5), (21, 77.5)]) + [(10, 77.5)]
               + bezier([(10, 77.5), (8.2, 77.5), (7, 76.4), (6.5, 74.5)]))
    toes = [[(13.5, 73), (13.5, 77.5)], [(20, 72.5), (20, 77.5)]]
    def place(points, mirror):
        angle = math.radians(-12)
        out = []
        for x, y in points:
            rx = 17 + (x - 17) * math.cos(angle) - (y - 70) * math.sin(angle)
            ry = 70 + (x - 17) * math.sin(angle) + (y - 70) * math.cos(angle)
            out.append(((120 - rx if mirror else rx) * k, ry * k))
        return out
    image = Image.new('RGBA', (120 * k, 100 * k))
    draw = ImageDraw.Draw(image)
    for mirror in (False, True):
        shape = place(outline, mirror)
        draw.polygon(shape, fill=TEAL + (255,))
        shine = place([(13 + 3.5 * math.cos(a), 65 + 1.6 * math.sin(a)) for a in (i * math.pi / 12 for i in range(25))], mirror)
        draw.polygon(shine, fill=TEAL_LIGHT + (255,))
        draw.line(shape + [shape[0]], fill=INK + (255,), width=round(2.6 * k), joint='curve')
        for toe in toes: draw.line(place(toe, mirror), fill=INK + (255,), width=round(1.8 * k))
    image.convert('RGBa').resize((240, 200), Image.LANCZOS).convert('RGBA').save(NAV / 'deoxys' / 'paws.png')
    print('assets/nav/deoxys/paws.png')


for pokemon in POSES:
    (NAV / pokemon).mkdir(parents=True, exist_ok=True)
    for old in (NAV / pokemon).glob('*.png'): old.unlink()      # each folder holds exactly what this script writes
sources = {path.name: Image.open(path).convert('RGB') for path in SHEETS.glob('*-fitness*.png')}
cut = {name: cut_out(sheet) for name, sheet in sources.items()}
for pokemon in POSES: floats(pokemon, cut)
heads(sources['deoxys-fitness.png'], cut['deoxys-fitness.png'])
paws()
