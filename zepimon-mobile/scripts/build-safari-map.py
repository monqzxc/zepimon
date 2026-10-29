"""Build the Safari Zone from pokeemerald-expansion: the tile map, trainer and effect strips and battle backgrounds.

Usage: python scripts/build-safari-map.py   (needs Pillow; reads hatdog-app/data/walk-source and downloads any source
missing from that cache at the pinned pokeemerald-expansion revision)
       python scripts/build-safari-map.py --reference [secondary]   (metatile contact sheets in ../tmp, for METATILES)

The map is drawn from scripts/safari/layout.txt (one character per tile) and areas.txt (one area letter per tile) with
Emerald's General + Lilycove tilesets, the pair its own Safari Zone uses. It is cut into 8 x 8-tile chunks: a ground
layer, and a top layer (tree crowns, roofs) only where there is one, drawn over the trainer. The Night Forest is tinted.
A layout that breaks a rule (see read_layout) stops the build before anything is written.

Writes assets/safari/*.png, src/generated/safari-map.js (plain data) and src/generated/safari-assets.js (image
requires). Everything is enlarged 4x with nearest-neighbour scaling,
so one 16 px tile is 64 px and the pixels stay crisp. Brendan and May wear a Zepimon outfit: RECOLOUR swaps palette
colours inside the cap and shirt rows only, so the same colour elsewhere (bags, shoes, skin) keeps Emerald's look.
Credits: see SPRITE-CREDITS.md.
"""
import json
import sys
from PIL import Image
from emerald_tiles import ROOT, Tilesets, chunk_images, enlarge, indexed, palette_file, reference, rgba, save_scaled, fetch

OUT = ROOT / 'assets' / 'safari'
GENERATED = ROOT / 'src' / 'generated' / 'safari-assets.js'
# Emerald's own Safari Zone maps use General + Lilycove (data/layouts/layouts.json at REV).
PRIMARY = 'general'
SECONDARY = 'lilycove'
LAYOUT = ROOT / 'scripts' / 'safari'
MAP_DATA = ROOT / 'src' / 'generated' / 'safari-map.js'
CHUNK = 8
ITEMS = 6
WALKABLE_GROUND = '.o@1234'
# Area letters (areas.txt) and the start digit each area must hold once.
AREA_NAMES = {'g': 'gate', 'm': 'meadow', 'l': 'lake', 'k': 'mountain', 'n': 'night'}
STARTS = {'@': 'g', '1': 'm', '2': 'l', '3': 'k', '4': 'n'}

# Metatile ids, read off Emerald's Safari Zone layouts. Trees are 2 x 2 blocks: tops (edge variants where the side
# isn't forest), bottoms over another tree or over open ground (edge variants), and a crown tip that overlaps the
# ground tile above. Ponds use the rounded set (corners, edges, middle). South ledges have end caps.
GROUND, TALL_GRASS, SIGN, ROCK, SAND_ROCK = 0x001, 0x00D, 0x01B, 0x0E0, 0x0E2
TREE_TOP, TREE_TOP_EDGE = (0x1D4, 0x1D5), (0x1D6, 0x1D7)
TREE_OVER_TREE, TREE_BOTTOM, TREE_BOTTOM_EDGE, CROWN = (0x1DC, 0x1DD), (0x1E4, 0x1E5), (0x1E6, 0x1E7), (0x1CE, 0x1CF)
# Pond by which sides are land: (north, south, west, east).
POND = {(1, 0, 1, 0): 0x0C8, (1, 0, 0, 0): 0x0C9, (1, 0, 0, 1): 0x0CA, (0, 0, 1, 0): 0x0D0, (0, 0, 0, 0): 0x0D1,
        (0, 0, 0, 1): 0x0D2, (0, 1, 1, 0): 0x0D8, (0, 1, 0, 0): 0x0D9, (0, 1, 0, 1): 0x0DA}
# Sand (the Rocky Mountain's ground) by row (top, middle, bottom) and column (left, middle, right).
SAND = ((0x118, 0x119, 0x11A), (0x120, 0x121, 0x122), (0x128, 0x129, 0x12A))
LEDGE_SOUTH = (0x0D5, 0x087, 0x0D6)
LEDGE_WEST, LEDGE_EAST = 0x085, 0x086
# The gate is the Safari rest house; its door (G) is the second tile of the bottom row.
HOUSE = ((0x008, 0x009, 0x009, 0x00A), (0x010, 0x011, 0x011, 0x012), (0x018, 0x019, 0x00B, 0x01A), (0x020, 0x021, 0x013, 0x022))
NIGHT_TINT = (0.55, 0.6, 0.8)

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


def read_layout():
    """layout.txt and areas.txt as row strings, checked so a broken map never reaches the app."""
    tiles = (LAYOUT / 'layout.txt').read_text().splitlines()
    areas = (LAYOUT / 'areas.txt').read_text().splitlines()
    rows, cols = len(tiles), len(tiles[0])
    assert len(areas) == rows and all(len(row) == cols for row in tiles + areas), 'layout.txt and areas.txt must be the same size'
    at = lambda x, y: tiles[y][x] if 0 <= x < cols and 0 <= y < rows else '#'
    found = {}
    for y in range(rows):
        for x in range(cols):
            char, area = tiles[y][x], areas[y][x]
            assert char in '.gT~Rvo<>SG#@1234', f'unsupported tile {char!r} at {x},{y}'
            assert area in AREA_NAMES, f'unknown area {area!r} at {x},{y}'
            assert not (char == 'g' and area == 'g'), f'grass in the gate area at {x},{y}'
            if char in STARTS:
                assert char not in found and area == STARTS[char], f'start {char} must be once, in area {STARTS[char]}'
                found[char] = {'x': x, 'y': y}
            if char == 'T':
                left, top = x - x % 2, y - y % 2
                assert all(at(left + dx, top + dy) == 'T' for dx in (0, 1) for dy in (0, 1)), f'trees are aligned 2 x 2 blocks: {x},{y}'
            if char == '~':
                land = [at(x, y - 1) != '~', at(x, y + 1) != '~', at(x - 1, y) != '~', at(x + 1, y) != '~']
                assert tuple(int(side) for side in land) in POND, f'water needs a pond shape (no 1-wide water) at {x},{y}'
    assert len(found) == len(STARTS), f'missing starts: {set(STARTS) - set(found)}'
    assert sum(row.count('o') for row in tiles) == ITEMS, f'the map needs {ITEMS} items'
    house = [(x, y) for y in range(rows) for x in range(cols) if tiles[y][x] in '#G']
    left, top = min(x for x, _ in house), min(y for _, y in house)
    assert len(house) == 16 and all(tiles[top + dy][left + dx] == ('G' if (dx, dy) == (1, 3) else '#') for dx in range(4) for dy in range(4)), \
        'the gate is one 4 x 4 house with its door (G) second from the left on the bottom row'
    starts = {AREA_NAMES[STARTS[char]]: point for char, point in found.items()}
    return tiles, areas, starts, (left, top)


def map_metatile(tiles, areas, house, x, y):
    """The metatile for one tile, from its character, its area and its neighbours."""
    rows, cols = len(tiles), len(tiles[0])
    at = lambda px, py: tiles[py][px] if 0 <= px < cols and 0 <= py < rows else 'T'
    char, area = tiles[y][x], areas[y][x]
    side = x % 2
    if char == 'T':
        if y % 2 == 0:
            return (TREE_TOP_EDGE if at(x + (1 if side else -1), y) != 'T' else TREE_TOP)[side]
        if at(x, y + 1) == 'T':
            return TREE_OVER_TREE[side]
        return (TREE_BOTTOM_EDGE if at(x + (1 if side else -1), y) != 'T' else TREE_BOTTOM)[side]
    if char == '~':
        return POND[tuple(int(at(px, py) != '~') for px, py in ((x, y - 1), (x, y + 1), (x - 1, y), (x + 1, y)))]
    if char in '#G':
        return HOUSE[y - house[1]][x - house[0]]
    if char == 'g':
        return TALL_GRASS
    if char == 'S':
        return SIGN
    if char == 'v':
        return LEDGE_SOUTH[0 if at(x - 1, y) != 'v' else 2 if at(x + 1, y) != 'v' else 1]
    if char in '<>':
        return LEDGE_WEST if char == '<' else LEDGE_EAST
    sandy = lambda px, py: 0 <= px < cols and 0 <= py < rows and areas[py][px] == 'k' and tiles[py][px] in WALKABLE_GROUND + 'R'
    if area == 'k' and char in WALKABLE_GROUND + 'R':
        if char == 'R':
            return SAND_ROCK
        row = 0 if not sandy(x, y - 1) else 2 if not sandy(x, y + 1) else 1
        column = 0 if not sandy(x - 1, y) else 2 if not sandy(x + 1, y) else 1
        return SAND[row][column]
    if char == 'R':
        return ROCK
    # Open ground right above a tree block carries that tree's crown tip.
    if at(x, y + 1) == 'T' and (y + 1) % 2 == 0:
        return CROWN[side]
    return GROUND


def tint(image):
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a:
                pixels[x, y] = (round(r * NIGHT_TINT[0]), round(g * NIGHT_TINT[1]), round(b * NIGHT_TINT[2]), a)
    return image


def build_map():
    """Chunk images (ground and, where there is any, top) and the map data, all in memory until everything passed."""
    tiles, areas, starts, house = read_layout()
    rows, cols = len(tiles), len(tiles[0])
    sets = Tilesets(PRIMARY, SECONDARY)
    cache = {}

    def metatile_for(x, y):
        number = map_metatile(tiles, areas, house, x, y)
        if number not in cache:
            cache[number] = sets.metatile(number)
        below, above = (layer.copy() for layer in cache[number])
        return (tint(below), tint(above)) if areas[y][x] == 'n' else (below, above)
    images, chunks = chunk_images(tiles, CHUNK, metatile_for)
    return dict(cols=cols, rows=rows, chunk=CHUNK, tiles=tiles, areas=areas, starts=starts, chunks=chunks), images


def write_map(data, images):
    for old in list(OUT.glob('ground-*.png')) + list(OUT.glob('top-*.png')):
        old.unlink()
    for key, layers in images.items():
        name = key.replace(',', '-')
        for prefix, image in zip(('ground', 'top'), layers):
            save_scaled(image, OUT / f'{prefix}-{name}.png')
    rows = lambda values: '[\n' + ',\n'.join(f'    {json.dumps(row)}' for row in values) + '\n  ]'
    chunks = ', '.join(f'{json.dumps(key)}: {{ top: {"true" if top else "false"} }}' for key, top in data['chunks'].items())
    starts = ', '.join(f'{name}: {{ x: {p["x"]}, y: {p["y"]} }}' for name, p in data['starts'].items())
    MAP_DATA.write_text(
        '// Generated by scripts/build-safari-map.py from scripts/safari/layout.txt and areas.txt. Plain data, no images,\n'
        '// so tests and the game rules can import it; the chunk images are in safari-assets.js.\n'
        f'export const safariMap = {{\n  cols: {data["cols"]},\n  rows: {data["rows"]},\n  chunk: {data["chunk"]},\n'
        f'  tiles: {rows(data["tiles"])},\n  areas: {rows(data["areas"])},\n  starts: {{ {starts} }},\n  chunks: {{ {chunks} }}\n}}\n',
        encoding='utf-8')


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
    if sys.argv[1:2] == ['--reference']:
        reference(PRIMARY, sys.argv[2] if len(sys.argv) > 2 else SECONDARY, ROOT.parent / 'tmp')
        return
    data, images = build_map()
    sprites = build_sprites()
    write_map(data, images)
    write_assets(sprites, data['chunks'])
    print(f'Built {len(sprites)} Safari sprites and a {data["cols"]} x {data["rows"]} map in {len(images)} chunks.')


if __name__ == '__main__':
    main()
