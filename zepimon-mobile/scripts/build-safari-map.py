"""Build the Safari Zone's art from pokeemerald-expansion: trainer and effect strips and battle backgrounds.

Usage: python scripts/build-safari-map.py   (needs Pillow; reads hatdog-app/data/walk-source and downloads any source
missing from that cache at the pinned pokeemerald-expansion revision)

Writes assets/safari/*.png and src/generated/safari-assets.js. Everything is enlarged 4x with nearest-neighbour scaling,
so one 16 px tile is 64 px and the pixels stay crisp. Brendan and May wear a Zepimon outfit: RECOLOUR swaps palette
colours inside the cap and shirt rows only, so the same colour elsewhere (bags, shoes, skin) keeps Emerald's look.
Credits: see SPRITE-CREDITS.md.
"""
import json
import urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT.parent / 'hatdog-app' / 'data' / 'walk-source'
REV = '0ecb1115129ccb7eb3a7e0dc3718dc263ab84011'
BASE = f'https://raw.githubusercontent.com/rh-hideout/pokeemerald-expansion/{REV}/'
OUT = ROOT / 'assets' / 'safari'
GENERATED = ROOT / 'src' / 'generated' / 'safari-assets.js'
SCALE = 4

# Trainer outfit: (first row, last row, {palette index: colour}) on the 16 x 32 frame, applied before enlarging.
PURPLE_LIGHT, PURPLE = (0xA4, 0x74, 0xEE), (0x6A, 0x3F, 0xC8)
BLACK, DARK_GREY = (0x28, 0x28, 0x30), (0x48, 0x48, 0x56)
WHITE_SHADE, WHITE = (0xCE, 0xCE, 0xDE), (0xF8, 0xF8, 0xF8)
RECOLOUR = {
    'brendan': [(0, 19, {10: PURPLE_LIGHT, 11: PURPLE}),
                (21, 27, {8: BLACK, 4: DARK_GREY, 13: WHITE_SHADE, 12: WHITE})],
    'may': [(0, 17, {10: PURPLE_LIGHT, 11: PURPLE}),
            (21, 27, {13: BLACK, 12: DARK_GREY})],
}
# Emerald's walking sheet: S, N, W standing, then two steps each for S, N and W. East mirrors west.
WALK_ORDER = {'south': (0, 3, 4), 'north': (1, 5, 6), 'west': (2, 7, 8)}

# key: (file, crop boxes in source pixels as (x, y, width, height)). Object and effect sheets carry their own palette.
SPRITES = {
    'grass': ('graphics/field_effects/pics/tall_grass.png', [(i * 16, 0, 16, 16) for i in range(5)]),
    'dust': ('graphics/field_effects/pics/ground_impact_dust.png', [(i * 16, 0, 16, 8) for i in range(3)]),
    'shadow': ('graphics/field_effects/pics/shadow_medium.png', [(0, 0, 16, 8)]),
    # The item ball's first 16 x 32 cell holds a still ball in its lower half.
    'item': ('graphics/object_events/pics/misc/ball_poke.png', [(0, 16, 16, 16)]),
    'safariBall': ('graphics/balls/safari.png', [(0, 0, 16, 16)]),
}
SHEET_SIZES = {'graphics/field_effects/pics/tall_grass.png': (80, 16), 'graphics/field_effects/pics/ground_impact_dust.png': (48, 8),
               'graphics/field_effects/pics/shadow_medium.png': (16, 8), 'graphics/object_events/pics/misc/ball_poke.png': (80, 32),
               'graphics/balls/safari.png': (16, 48)}
BATTLES = {'battleGrass': 'long_grass', 'battlePond': 'pond_water'}
FILES = {'safariBall': 'safari-ball', 'battleGrass': 'battle-grass', 'battlePond': 'battle-pond'}


def fetch(path):
    target = CACHE / path
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(urllib.request.urlopen(BASE + path, timeout=30).read())
    return target


def indexed(path, size):
    image = Image.open(fetch(path))
    assert image.mode == 'P' and image.size == size, (path, image.mode, image.size)
    return image


def palette_file(path):
    lines = fetch(path).read_text().splitlines()
    assert lines[:2] == ['JASC-PAL', '0100'], path
    return [tuple(int(c) for c in row.split()) for row in lines[3:3 + int(lines[2])]]


def rgba(image, colour_at):
    """An RGBA copy of an indexed image; colour_at(index, x, y) gives each opaque pixel's colour, index 0 is clear."""
    out = Image.new('RGBA', image.size)
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            index = pixels[x, y]
            if index:
                out.putpixel((x, y), colour_at(index, x, y) + (255,))
    return out


def enlarge(frames):
    width, height = frames[0].size
    out = Image.new('RGBA', (width * SCALE * len(frames), height * SCALE))
    for i, frame in enumerate(frames):
        assert frame.getbbox(), i
        out.paste(frame.resize((width * SCALE, height * SCALE), Image.Resampling.NEAREST), (i * width * SCALE, 0))
    return out, len(frames), width * SCALE, height * SCALE


def trainer(name):
    sheet = indexed(f'graphics/object_events/pics/people/{name}/walking.png', (144, 32))
    palette = sheet.getpalette()

    def colour(index, x, y):
        for top, bottom, swap in RECOLOUR[name]:
            if top <= y <= bottom and index in swap:
                return swap[index]
        return tuple(palette[index * 3:index * 3 + 3])
    poses = rgba(sheet, colour)
    frame = [poses.crop((i * 16, 0, i * 16 + 16, 32)) for i in range(9)]
    order = [frame[i] for direction in ('south', 'north', 'west') for i in WALK_ORDER[direction]]
    order += [frame[i].transpose(Image.Transpose.FLIP_LEFT_RIGHT) for i in WALK_ORDER['west']]
    return enlarge(order)


def sprite(path, boxes):
    sheet = indexed(path, SHEET_SIZES[path])
    palette = sheet.getpalette()
    image = rgba(sheet, lambda index, x, y: tuple(palette[index * 3:index * 3 + 3]))
    frames = [image.crop((x, y, x + w, y + h)) for x, y, w, h in boxes]
    # A hand-picked crop (one frame of a ball sheet) must actually hold the ball, not an empty corner.
    if len(boxes) == 1:
        assert sum(frames[0].getchannel('A').histogram()[1:]) >= 20, path
    return enlarge(frames)


def battle_background(environment):
    """The top 240 x 112 of a battle environment (above the text box). The game loads its palette at BG slot 2, so
    tilemap palette p is bank p - 2 (src/battle_bg.c: LoadPalette(..., BG_PLTT_ID(2), 3 * PLTT_SIZE_4BPP))."""
    folder = f'graphics/battle_environment/{environment}/'
    tiles = indexed(folder + 'tiles.png', (128, 128))
    colours = palette_file(folder + 'palette.pal')
    tilemap = fetch(folder + 'map.bin').read_bytes()
    pixels = tiles.load()
    out = Image.new('RGBA', (240, 112))
    for row in range(14):
        for col in range(30):
            entry = int.from_bytes(tilemap[(row * 32 + col) * 2:(row * 32 + col) * 2 + 2], 'little')
            tile, bank = entry & 0x3FF, (entry >> 12) - 2
            assert tile < 256 and 0 <= bank < len(colours) // 16, (environment, row, col, entry)
            for y in range(8):
                for x in range(8):
                    sx, sy = 7 - x if entry & 0x400 else x, 7 - y if entry & 0x800 else y
                    index = pixels[tile % 16 * 8 + sx, tile // 16 * 8 + sy]
                    out.putpixel((col * 8 + x, row * 8 + y), colours[bank * 16 + index if index else 0] + (255,))
    return enlarge([out])


def require(name):
    return f"require('../../assets/safari/{name}.png')"


def write_assets(sprites, chunks):
    lines = [f"  {json.dumps(key)}: {{ source: {require(FILES.get(key, key))}, frames: {frames}, width: {width}, height: {height} }}"
             for key, (frames, width, height) in sprites.items()]
    chunk_lines = [f"  {json.dumps(key)}: {{ ground: {require(f'ground-{key.replace(',', '-')}')}"
                   + (f", top: {require(f'top-{key.replace(',', '-')}')}" if top else '') + ' }'
                   for key, top in chunks.items()]
    GENERATED.write_text(
        '// Generated by scripts/build-safari-map.py. Frames run left to right; width and height are output pixels per\n'
        '// frame. See SPRITE-CREDITS.md.\nexport const safariSprites = {\n' + ',\n'.join(lines) + '\n}\n'
        'export const safariChunks = {\n' + ',\n'.join(chunk_lines) + ('\n' if chunk_lines else '') + '}\n', encoding='utf-8')


def build_sprites():
    built = {name: trainer(name) for name in RECOLOUR}
    built.update({key: sprite(path, boxes) for key, (path, boxes) in SPRITES.items()})
    built.update({key: battle_background(environment) for key, environment in BATTLES.items()})
    OUT.mkdir(parents=True, exist_ok=True)
    for key, (image, *_shape) in built.items():
        image.save(OUT / f'{FILES.get(key, key)}.png', optimize=True)
    return {key: shape for key, (_image, *shape) in built.items()}


def main():
    sprites = build_sprites()
    write_assets(sprites, {})
    print(f'Built {len(sprites)} Safari sprites.')


if __name__ == '__main__':
    main()
