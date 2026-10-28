"""Cuts the tab bar's fitness art (src/TabBar.tsx) from sheets in pokemon_data/: the six poses each Pokemon takes turns
in while floating over the Adventure button, and the Deoxys and Pikachu that peek over the bar in their themes. (Gengar's
peeking art is drawn by scripts/build-nav-gengar.mjs.)

Usage: python scripts/build-nav-poses.py   (needs Pillow and numpy)

Each sheet shows the Pokemon in a cap, T-shirt and shorts on a pale background, gridded or plain. Writes transparent PNGs:
- assets/nav/<pokemon>/float-stand, float-wave, float-lift, float-tired, float-pushup and float-situp: each pose on a
  320 x 256 canvas (wider than tall, so lifted dumbbells fit) at one scale per Pokemon, centered with the ground on
  one line, so the Pokemon keeps its size as it changes pose.
- assets/nav/<pokemon>/head-idle, head-blink and head-boo, for Deoxys and Pikachu: the head peeking over the bar, on
  the 120 x 100 grid at two pixels per unit with the chin on row 72, the bar's top edge. Idle is the standing pose's
  head; blink and boo (the surprised pop-up) come from other poses or are drawn, as HEADS says.
- assets/nav/<pokemon>/paws: Gengar's paw shapes (scripts/build-nav-gengar.mjs) in the Pokemon's colors, at the same
  spots on the grid.
"""
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SHEETS = ROOT / 'pokemon_data'
NAV = ROOT / 'zepimon-mobile' / 'assets' / 'nav'
CANVAS = (320, 256)
INK = (52, 14, 20)              # the sheets' dark outlines, for softening cut edges

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
    },
    'pikachu': {
        'stand': ('pikachu-fitness.png', (40, 0, 330, 290)), 'wave': ('pikachu-fitness.png', (390, 0, 690, 290)),
        'lift': ('pikachu-fitness.png', (700, 0, 1024, 290)), 'tired': ('pikachu-fitness.png', (20, 290, 345, 559)),
        'pushup': ('pikachu-fitness.png', (360, 290, 680, 559)), 'situp': ('pikachu-fitness.png', (700, 290, 1024, 559))
    }
}
# A sheet drawn smaller than its Pokemon's first is enlarged by this much first: at 1.4 the second Gengar sheet's caps
# and heads match the first's.
SHEET_SCALE = {'gengar-fitness-2.png': 1.4}
# Sheets on pure white, where the shirts are greyer: there, pure white shut in by an arm or tail is background too.
WHITE_POCKETS = {'pikachu-fitness.png'}

# The peeking heads. cap: the standing pose's cap in its sheet, which lines up the other poses' heads with it. bottom:
# the sheet row below the chin where the head crop stops. edge: the chin's row, which sits on the bar's edge so the
# whole face shows. blink and boo: a pose whose head is used as it is ('wave': Deoxys's shut eyes, Pikachu's open-mouthed
# cheer), the standing head with another pose's sweat drop ('sweat'), or the standing head with its eyes drawn shut
# ('shut', for a sheet with no shut-eyed face). paws: fill, shine and outline.
HEADS = {
    'deoxys': {'cap': (140, 30, 270, 110), 'bottom': 205, 'edge': 186, 'blink': 'wave', 'boo': 'sweat',
               'paws': ((110, 154, 146), (150, 190, 182), (52, 14, 20))},
    'pikachu': {'cap': (118, 28, 208, 92), 'bottom': 165, 'edge': 150, 'blink': 'shut', 'boo': 'wave',
                'paws': ((240, 196, 40), (255, 226, 120), (58, 30, 22))}
}


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


def cut_out(sheet, pockets=False):
    """The sheet as RGBA with the background, its grid lines and the ground shadows made transparent, and with pockets,
    the pure white patches the fill cannot reach."""
    rgb = np.asarray(sheet, dtype=np.int16)
    light, spread = rgb.max(axis=2), rgb.max(axis=2) - rgb.min(axis=2)
    # The background, grid lines and shadows are light, nearly colorless greys, filled from the corner. Every figure has
    # a closed dark outline, so the fill never reaches the white shirts, brims, teeth or eyes.
    greyish = (spread < 22) & (light > 140)
    mask = Image.fromarray(np.where(greyish, 255, 0).astype(np.uint8)).copy()   # fromarray is read-only; floodfill needs a copy
    ImageDraw.floodfill(mask, (0, 0), 128, thresh=0)
    removed = np.asarray(mask) == 128
    if pockets:
        for region in regions((rgb.min(axis=2) >= 246) & ~removed):
            if len(region[0]) >= 25: removed[region] = True
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


def keep(image, test):
    """image with only the opaque regions that pass test(size, largest size) left."""
    opaque = np.asarray(image.getchannel('A')) > 0
    found = regions(opaque)
    largest = max((len(region[0]) for region in found), default=0)
    rgba = np.asarray(image).copy()
    for region in found:
        if not test(len(region[0]), largest): rgba[region] = 0
    return Image.fromarray(rgba, 'RGBA')


def trimmed(image):
    """image without stray specks under 8 pixels (bits of grid line at a sheet's edge), cropped to what is left."""
    clean = keep(image, lambda size, largest: size >= 8)
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


def offset(pokemon, sheet, pose):
    """Where pose's copy of the standing pose's cap is, relative to it: found by matching the cap's pixels."""
    rgb = np.asarray(sheet, dtype=np.int32)
    x0, y0, x1, y1 = HEADS[pokemon]['cap']
    cap = rgb[y0:y1, x0:x1]
    nominal = POSES[pokemon][pose][1][0] - POSES[pokemon]['stand'][1][0]
    best = min(((np.abs(rgb[y0 + dy:y1 + dy, x0 + nominal + dx:x1 + nominal + dx] - cap).sum(), nominal + dx, dy)
                for dy in range(-20, 21) for dx in range(-80, 81)
                if 0 <= y0 + dy and y1 + dy <= rgb.shape[0] and 0 <= x0 + nominal + dx and x1 + nominal + dx <= rgb.shape[1]))
    return best[1], best[2]


def sweat(idle, sweaty):
    """idle with sweaty's sweat drop: the largest patch of light blue (a dumbbell's shine is light blue too, in specks)
    and the outline around it."""
    rgb = np.asarray(sweaty.convert('RGB'), dtype=np.int16)
    blue = (rgb[..., 2] - rgb[..., 0] > 35) & (rgb[..., 2] > 150)
    largest = max(regions(blue), key=lambda region: len(region[0]))
    patch = np.zeros(blue.shape, dtype=np.uint8)
    patch[largest] = 255
    out = idle.copy()
    out.paste(sweaty, (0, 0), Image.fromarray(patch).filter(ImageFilter.MaxFilter(9)))
    return out


def shut(idle):
    """idle with its eyes shut: each eye (a dark, roundish patch, set in the face rather than on its outline) is painted
    over in the skin color around it, then drawn as a lid line curving down, in the eye's own dark."""
    rgba = np.asarray(idle).copy()
    rgb = rgba[..., :3].astype(np.int16)
    dark = (rgb.max(axis=2) < 70) & (rgba[..., 3] > 0)
    height, width = dark.shape
    eyes = []
    for rows, columns in regions(dark):
        top, bottom, left, right = rows.min(), rows.max(), columns.min(), columns.max()
        h, w = bottom - top + 1, right - left + 1
        # Each eye is shut in by skin on every side; outline pieces run on into the background.
        ring = rgba[max(0, top - 3):bottom + 4, max(0, left - 3):right + 4]
        if 80 <= len(rows) <= 600 and 0.6 <= h / w <= 1.6 and ring[..., 3].min() == 255 and top > height * 0.25:
            eyes.append((top, bottom, left, right, np.median(rgb[rows, columns], axis=0)))
    out = Image.fromarray(rgba, 'RGBA')
    k = 8
    lines = Image.new('RGBA', (width * k, height * k))
    draw = ImageDraw.Draw(lines)
    for top, bottom, left, right, pupil in eyes:
        cy, cx = (top + bottom) / 2, (left + right) / 2
        ry, rx = (bottom - top) / 2 + 2.5, (right - left) / 2 + 2.5
        around = rgb[max(0, top - 5):bottom + 6, max(0, left - 5):right + 6].reshape(-1, 3)
        skin = np.median(around[around.max(axis=1) > 150], axis=0)
        cover = Image.new('L', (width, height))
        ImageDraw.Draw(cover).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)
        out.paste(Image.new('RGBA', out.size, tuple(int(c) for c in skin) + (255,)), (0, 0), cover.filter(ImageFilter.GaussianBlur(0.8)))
        span = (right - left) / 2 + 1
        draw.arc(((cx - span) * k, (cy - span * 0.9) * k, (cx + span) * k, (cy + span * 0.7) * k), 20, 160,
                 fill=tuple(int(c) for c in pupil) + (255,), width=round(2.6 * k))
    out.alpha_composite(lines.resize((width, height), Image.LANCZOS))
    print(f'  shut {len(eyes)} eyes')
    return out


def heads(pokemon, sheet, art):
    """The peeking head in three faces, cropped from the top of the sheet to below the chin and placed on the grid."""
    spec = HEADS[pokemon]
    x0, _, x1, _ = POSES[pokemon]['stand'][1]
    def crop(pose):
        """pose's head region, moved by how far its cap sits from the standing pose's."""
        dx, dy = (0, 0) if pose == 'stand' else offset(pokemon, sheet, pose)
        return art.crop((x0 + dx, dy, x1 + dx, spec['bottom'] + dy))
    def head(pose):
        """Only the head itself: the largest piece (a tail or raised arm beside it is another piece)."""
        return keep(crop(pose), lambda size, largest: size == largest)
    idle = head('stand')
    def within(image):
        """image cut to the standing head's outline, so the two swap cleanly."""
        image.putalpha(Image.fromarray(np.minimum(np.asarray(image.getchannel('A')), np.asarray(idle.getchannel('A')))))
        return image
    faces = {'wave': lambda: within(head('wave')), 'sweat': lambda: sweat(idle, crop('lift')), 'shut': lambda: shut(idle)}
    blink, boo = faces[spec['blink']](), faces[spec['boo']]()
    top = idle.getbbox()[1]
    scale = min(1.0, (144 - 4) / (spec['edge'] - top))     # the head's top stays at least two rows inside the grid
    for image, name in ((idle, 'head-idle'), (blink, 'head-blink'), (boo, 'head-boo')):
        small = resized(image, scale)
        canvas = Image.new('RGBA', (240, 200))
        canvas.alpha_composite(small, (round(120 - small.width / 2), round(144 - spec['edge'] * scale)))
        canvas.save(NAV / pokemon / f'{name}.png')
        print(f'assets/nav/{pokemon}/{name}.png')


def bezier(points, steps=24):
    """A cubic Bezier from four points, sampled into a polyline."""
    (ax, ay), (bx, by), (cx, cy), (dx, dy) = points
    return [((1 - t) ** 3 * ax + 3 * (1 - t) ** 2 * t * bx + 3 * (1 - t) * t * t * cx + t ** 3 * dx,
             (1 - t) ** 3 * ay + 3 * (1 - t) ** 2 * t * by + 3 * (1 - t) * t * t * cy + t ** 3 * dy) for t in (i / steps for i in range(steps + 1))]


def paws(pokemon):
    """Gengar's paw outline, toe lines and shine, tilted out to follow the bar's shoulders, in the Pokemon's colors."""
    fill, shine_color, ink = HEADS[pokemon]['paws']
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
        draw.polygon(shape, fill=fill + (255,))
        shine = place([(13 + 3.5 * math.cos(a), 65 + 1.6 * math.sin(a)) for a in (i * math.pi / 12 for i in range(25))], mirror)
        draw.polygon(shine, fill=shine_color + (255,))
        draw.line(shape + [shape[0]], fill=ink + (255,), width=round(2.6 * k), joint='curve')
        for toe in toes: draw.line(place(toe, mirror), fill=ink + (255,), width=round(1.8 * k))
    image.convert('RGBa').resize((240, 200), Image.LANCZOS).convert('RGBA').save(NAV / pokemon / 'paws.png')
    print(f'assets/nav/{pokemon}/paws.png')


for pokemon in POSES:
    (NAV / pokemon).mkdir(parents=True, exist_ok=True)
    for old in (NAV / pokemon).glob('*.png'): old.unlink()      # each folder holds exactly what this script writes
sources = {path.name: Image.open(path).convert('RGB') for path in SHEETS.glob('*-fitness*.png')}
cut = {name: cut_out(sheet, name in WHITE_POCKETS) for name, sheet in sources.items()}
for pokemon in POSES: floats(pokemon, cut)
for pokemon in HEADS:
    sheet = POSES[pokemon]['stand'][0]
    heads(pokemon, sources[sheet], cut[sheet])
    paws(pokemon)
