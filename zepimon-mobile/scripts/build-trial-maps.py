"""Build the Legendary trial rooms from pokeemerald-expansion: each room's baked terrain and the overlay sprites.

Usage: python scripts/build-trial-maps.py   (needs Pillow; reads hatdog-app/data/walk-source and downloads any source
missing from that cache at the pinned pokeemerald-expansion revision)
       python scripts/build-trial-maps.py --reference <primary> <secondary>   (metatile contact sheets in ../tmp, for THEMES)

Rooms are authored in scripts/trials/stages.json as rows of characters (the tile legend is in src/games/trial.ts and the
plan). Each kind takes the tileset pair of one Emerald map (THEMES); the static terrain (ground, path, grass, water,
rock, walls) is baked into 8 x 8-tile chunks like the Safari Zone's, and everything that changes during play (relics,
switches, gates, plates, doors, boulders, fragile floor, warp pads, the exit, torches and the Shattered Star's pieces) is
baked as the room's ground and drawn over it from the strips in SPRITES. A stage that breaks a rule (see read_stages)
stops the build before anything is written.

Writes assets/trials/*.png, src/generated/trial-maps.js (plain stage data) and src/generated/trial-assets.js (image
requires). Everything is enlarged 4x with nearest-neighbour scaling. Credits: see SPRITE-CREDITS.md.
"""
import json
import math
import re
import sys
from PIL import Image
from emerald_tiles import ROOT, Tilesets, chunk_images, enlarge, fetch, indexed, reference, rgba, save_scaled

STAGES = ROOT / 'scripts' / 'trials' / 'stages.json'
OUT = ROOT / 'assets' / 'trials'
MAP_DATA = ROOT / 'src' / 'generated' / 'trial-maps.js'
ASSETS = ROOT / 'src' / 'generated' / 'trial-assets.js'
CHUNK = 8
MAX_SIZE = 16
KINDS = ('switch', 'crumble', 'dark', 'temple', 'warp', 'star')
LEGEND = '.,g~R#!@X*abcABC_=O:123456789w%?M'
STAR_ONLY = '%?M'
WALLS = '#!'

# One Emerald map per kind, its tileset pair as data/layouts/layouts.json gives it at REV (checked on every build), and
# the metatiles picked off `--reference` sheets. Walls draw a cap where open floor is above, a face where open floor is
# below, and fill inside. `pond` themes use the General tileset's rounded pond set for water.
THEMES = {
    # Mauville Gym. No grass or water in the gym: grass is the plain floor, water the black void. Rocks are the barrier poles.
    'switch': dict(map='MauvilleCity_Gym', primary='building', secondary='mauville_gym', ground=0x20A, path=0x225, grass=0x20A,
                   water=0x001, shore=0x20A, rock=0x210, cap=0x213, face=0x20E, fill=0x001, pond=False),
    # Sky Pillar 1F. Grass is the floor's edge-lit variant; rocks are the fallen rubble.
    'crumble': dict(map='SkyPillar_1F', primary='general', secondary='pacifidlog', ground=0x2BD, path=0x234, grass=0x2BE,
                    water=None, shore=0x2BD, rock=0x207, cap=0x227, face=0x22F, fill=0x241, pond=True),
    # Granite Cave B1F. Path is the cracked dark floor; grass the cave's speckled ground.
    'dark': dict(map='GraniteCave_B1F', primary='general', secondary='cave', ground=0x201, path=0x22F, grass=0x2DD,
                 water=None, shore=0x201, rock=0x203, cap=0x21B, face=0x219, fill=0x2E1, pond=True),
    # Desert Ruins' pair, but warm: the pair's bright desert sand and stone columns, so a temple never reads as Granite Cave.
    # Path is the speckled sand, grass the edged sand; rocks are the ruins' boulders.
    'temple': dict(map='DesertRuins', primary='general', secondary='cave', ground=0x2A1, path=0x29F, grass=0x2A9,
                   water=None, shore=0x2A1, rock=0x2D5, cap=0x2C3, face=0x2BB, fill=0x2E0, pond=True),
    # Mossdeep Gym. Path is the shaded floor; grass the plain floor; water the blue pool block.
    'warp': dict(map='MossdeepCity_Gym', primary='building', secondary='mossdeep_gym', ground=0x20A, path=0x203, grass=0x20A,
                 water=0x221, shore=0x20A, rock=0x204, cap=0x20E, face=0x216, fill=0x208, pond=False),
    # Birth Island's exterior: grass ground, the pale summit path, tall grass, the sea, a shallow pond tile, the cliffs.
    # path_glow washes the path toward starlight (colour, strength) so the constellation lines clue 2 points to stand out.
    'star': dict(map='BirthIsland_Exterior', primary='general', secondary='dewford', ground=0x001, path=0x1D9, grass=0x00D,
                 water=0x170, shore=0x0D1, rock=0x0E0, cap=0x06C, face=0x07C, fill=0x074, pond=False,
                 path_glow=((255, 246, 200), 0.4)),
}
# The General tileset's pond by which sides are land: (north, south, west, east); other shapes use the middle.
POND = {(1, 0, 1, 0): 0x0C8, (1, 0, 0, 0): 0x0C9, (1, 0, 0, 1): 0x0CA, (0, 0, 1, 0): 0x0D0, (0, 0, 0, 0): 0x0D1,
        (0, 0, 0, 1): 0x0D2, (0, 1, 1, 0): 0x0D8, (0, 1, 0, 0): 0x0D9, (0, 1, 0, 1): 0x0DA}

# Overlay sprites: Emerald metatiles (tileset pair, ids) and object, field-effect and battle sheets.
MAUVILLE, PACIFIDLOG, CAVE, MOSSDEEP = ('building', 'mauville_gym'), ('general', 'pacifidlog'), ('general', 'cave'), ('building', 'mossdeep_gym')
GYM_FLOOR, SWITCH_OFF, SWITCH_ON, BEAMS = 0x20A, 0x205, 0x206, (0x228, 0x220, 0x248)
# Gate groups A, B and C read as red, blue and gold: the accent colours (dark to light) swapped onto Mauville's barrier and switch.
GROUPS = {
    'a': ((0x60, 0x08, 0x10), (0xC8, 0x18, 0x20), (0xF8, 0x60, 0x50)),
    'b': ((0x08, 0x18, 0x68), (0x18, 0x50, 0xD8), (0x58, 0x98, 0xF8)),
    'c': ((0x38, 0x20, 0x00), (0x98, 0x58, 0x00), (0xE8, 0xA0, 0x10)),
}
# Metatile sprites keep only what differs from their own tileset's floor (or, for the clue, the wall it is set in).
SKY_FLOOR, FRAGILE, HOLE = 0x234, 0x236, 0x237      # Sky Pillar's floor, its cracks and its hole
RUINS_FLOOR, RUINS_WALL = 0x201, 0x229               # the Desert Ruins' floor and cobbled wall
PLATE, DOOR_SEALED = 0x259, 0x234                    # the Desert Ruins' stone slab and sealed braille slab
PLATE_EDGE = (0x48, 0x30, 0x20)                      # the plate's outline
MOSSDEEP_FLOOR, WARP_PAD = 0x20A, 0x25C      # Mossdeep Gym's floor and blue floor button
EXIT_SEAL, EXIT_STAIRS = 0x2CA, 0x244        # Sky Pillar's sealed hatch, sliding off its stairs
CLUE = 0x232                                 # Desert Ruins' braille stone
MISC = 'graphics/object_events/pics/misc/'
ANIMS = 'graphics/battle_anims/sprites/'
GLOW = (0xB8, 0x78, 0xF8)                    # the meteorite's pattern light
PATTERNS = 3                                 # meteorite pattern frames (the island's `patterns`)


def check(condition, message=''):
    """A check that survives `python -O`, which strips assert."""
    if not condition:
        sys.exit(f'build-trial-maps: {message}')


def read_stages():
    """stages.json, checked so a broken room never reaches the app."""
    stages = json.loads(STAGES.read_text(encoding='utf-8'))
    for sid, stage in stages.items():
        kind, tiles = stage.get('kind'), stage.get('tiles')
        check(kind in KINDS, f'{sid}: unknown kind {kind!r}')
        check(re.fullmatch(r'star' if kind == 'star' else rf'{kind}-(tutorial|1|2|3)', sid), f'{sid}: ids are <kind>-tutorial, <kind>-1|2|3 or star')
        check(tiles and all(isinstance(row, str) for row in tiles), f'{sid}: tiles are rows of characters')
        rows, cols = len(tiles), len(tiles[0])
        check(all(len(row) == cols for row in tiles), f'{sid}: rows must have equal length')
        check(rows <= MAX_SIZE and cols <= MAX_SIZE, f'{sid}: at most {MAX_SIZE} x {MAX_SIZE} tiles')
        grid = ''.join(tiles)
        count = grid.count
        for y, row in enumerate(tiles):
            for x, char in enumerate(row):
                check(char in LEGEND, f'{sid}: unsupported tile {char!r} at {x},{y}')
                check(kind == 'star' or char not in STAR_ONLY, f'{sid}: only the star island may use {char!r} ({x},{y})')
        check(count('@') == 1, f'{sid}: exactly one start @')
        par = stage.get('par')
        check(isinstance(par, int) and not isinstance(par, bool) and par > 0, f'{sid}: par is a positive integer')
        check(isinstance(stage.get('hint'), str) and stage['hint'], f'{sid}: needs a hint line')
        warps = stage.get('warps', {})
        check(isinstance(warps, dict), f'{sid}: warps maps pad digits to pad digits')
        for pad, target in warps.items():
            check(re.fullmatch('[1-9]', pad) and pad in grid, f'{sid}: warp {pad!r} is not a pad in the grid')
            check(isinstance(target, str), f'{sid}: warp {pad} leads to {target!r}; targets are pad digits as strings')
            check(re.fullmatch('[1-9]', target) and target in grid, f'{sid}: warp {pad} leads to {target!r}, not a pad in the grid')
        check(all(count(pad) <= 1 for pad in '123456789'), f'{sid}: each warp pad digit is used once')
        check(count('O') >= count('_'), f'{sid}: a room with plates needs at least as many boulders')
        check(not stage.get('crackAll') or ':' in grid, f'{sid}: crackAll needs fragile floor')
        open_ = stage.get('open', '')
        check(isinstance(open_, str) and all(gate in 'ABC' and gate in grid for gate in open_), f'{sid}: open lists gate letters A-C that are in the grid')
        star = stage.get('star')
        opened = {node.get('opens') for node in star['nodes']} if star else set()
        for gate in 'ABC':
            check(gate not in grid or gate.lower() in grid or gate in opened, f'{sid}: gate {gate} has no switch')
            check(gate.lower() not in grid or gate in grid, f'{sid}: switch {gate.lower()} has no gate')
        if kind == 'star':
            read_star(sid, tiles, star)
        else:
            check(star is None, f'{sid}: only the star island has star rules')
            check(count('X') == 1, f'{sid}: exactly one exit X')
    return stages


def read_star(sid, tiles, star):
    check(star, f'{sid}: the star island needs its rules')
    cells = lambda char: [(x, y) for y, row in enumerate(tiles) for x, c in enumerate(row) if c == char]
    check(not cells('X'), f'{sid}: the island has no exit X')
    block = cells('M')
    check(len(block) == 4 and {(x - block[0][0], y - block[0][1]) for x, y in block} == {(0, 0), (1, 0), (0, 1), (1, 1)},
        f'{sid}: exactly one 2 x 2 meteorite M')
    crystals, nodes = cells('%'), star['nodes']
    check(3 <= len(crystals) <= 5, f'{sid}: 3-5 crystals')
    ids = [node['id'] for node in nodes]
    check(len(set(ids)) == len(ids), f'{sid}: node ids are unique')
    for x, y in crystals:
        check(sum(1 for node in nodes if tuple(node['at']) == (x, y)) == 1, f'{sid}: crystal {x},{y} needs exactly one node')
    gates = {char for row in tiles for char in row if char in 'ABC'}
    for node in nodes:
        check(tuple(node['at']) in crystals, f'{sid}: node {node["id"]} is not on a crystal')
        check(all(link in ids for link in node['links']), f'{sid}: node {node["id"]} links an unknown id')
        check(isinstance(node['turns'], int) and node['turns'] >= 0, f'{sid}: node {node["id"]} turns')
        check('opens' not in node or node['opens'] in gates, f'{sid}: node {node["id"]} opens a gate not in the grid')
    patterns = star['patterns']
    check(isinstance(patterns, int) and patterns > 0 and 0 <= star['target']['pattern'] < patterns, f'{sid}: 0 <= target.pattern < patterns')
    check(all(i in ids for i in star['startLit'] + star['target']['lit']), f'{sid}: startLit and target.lit are node ids')
    check(isinstance(star['resetOnFail'], bool), f'{sid}: resetOnFail is true or false')
    stones = cells('?')
    for x, y in stones:
        check(sum(1 for clue in star['clues'] if tuple(clue['at']) == (x, y)) == 1, f'{sid}: clue stone {x},{y} needs exactly one clue')
    for clue in star['clues']:
        check(tuple(clue['at']) in stones, f'{sid}: clue at {clue["at"]} is not on a stone')
        check(all(r in ids or r == 'pattern' for r in clue['reveals']), f'{sid}: a clue reveals an unknown id')
    check(len(star['hints']) == 3, f'{sid}: exactly 3 hints')


def tileset_name(name):
    return 'gTileset_' + ''.join(part.capitalize() for part in name.split('_'))


def check_themes():
    """Each theme's pair is its Emerald map's own (data/layouts/layouts.json at REV)."""
    layouts = {layout.get('name'): layout for layout in json.loads(fetch('data/layouts/layouts.json').read_text())['layouts']}
    for kind, theme in THEMES.items():
        layout = layouts[theme['map'] + '_Layout']
        pair = (layout['primary_tileset'], layout['secondary_tileset'])
        check(pair == (tileset_name(theme['primary']), tileset_name(theme['secondary'])), (kind, pair))


def map_metatile(theme, tiles, x, y):
    """The metatile for one tile: objects bake as ground and torches as wall."""
    rows, cols = len(tiles), len(tiles[0])
    at = lambda px, py: tiles[py][px] if 0 <= px < cols and 0 <= py < rows else '#'
    char = at(x, y)
    if char in WALLS:
        if at(x, y + 1) not in WALLS:
            return theme['face']
        return theme['fill'] if at(x, y - 1) in WALLS else theme['cap']
    if char == '~':
        if theme['pond']:
            land = tuple(int(at(px, py) != '~') for px, py in ((x, y - 1), (x, y + 1), (x - 1, y), (x + 1, y)))
            return POND.get(land, POND[(0, 0, 0, 0)])
        return theme['water']
    return theme[{',': 'path', 'g': 'grass', 'R': 'rock', 'w': 'shore'}.get(char, 'ground')]


def build_rooms(stages):
    """Chunk images and the stage data for every room, all in memory until everything passed."""
    sets, rooms = {}, {}
    for sid, stage in stages.items():
        theme = THEMES[stage['kind']]
        pair = (theme['primary'], theme['secondary'])
        if pair not in sets:
            sets[pair] = (Tilesets(*pair), {})
        tilesets, cache = sets[pair]
        tiles = stage['tiles']

        def metatile_for(x, y):
            number = map_metatile(theme, tiles, x, y)
            if number not in cache:
                cache[number] = tilesets.metatile(number)
            below, above = (layer.copy() for layer in cache[number])
            if 'path_glow' in theme and tiles[y][x] == ',':
                colour, strength = theme['path_glow']
                lit = Image.blend(below, Image.new('RGBA', below.size, colour + (255,)), strength)
                lit.putalpha(below.getchannel('A'))
                below = lit
            return below, above
        images, chunks = chunk_images(tiles, CHUNK, metatile_for)
        data = dict(id=sid, kind=stage['kind'], tiles=tiles, warps=stage.get('warps', {}), open=''.join(sorted(stage.get('open', ''))),
                    crackAll=bool(stage.get('crackAll', False)), dark=bool(stage.get('dark', False)), par=stage['par'], hint=stage['hint'],
                    star=stage.get('star'), chunk=CHUNK, chunks=chunks)
        rooms[sid] = (data, images)
    return rooms


# ---- sprites ----

_sets = {}


def metatile(pair, number):
    """One metatile as a single 16 x 16 image (both layers)."""
    if pair not in _sets:
        _sets[pair] = Tilesets(*pair)
    ground, top = _sets[pair].metatile(number)
    ground.alpha_composite(top)
    return ground


def sheet(path, size):
    image = indexed(path, size)
    palette = image.getpalette()
    return rgba(image, lambda index, x, y: tuple(palette[index * 3:index * 3 + 3]))


def saturated(colour):
    return max(colour[:3]) - min(colour[:3]) >= 48


def luma(colour):
    return 0.3 * colour[0] + 0.59 * colour[1] + 0.11 * colour[2]


def swap(image, base, ramp):
    """A palette swap: the accent colours (saturated pixels that differ from base) take the ramp's colours by brightness rank."""
    out, pixels, under = image.copy(), image.load(), base.load()
    accent = lambda x, y: pixels[x, y][3] and pixels[x, y] != under[x, y] and saturated(pixels[x, y])
    colours = sorted({pixels[x, y] for y in range(16) for x in range(16) if accent(x, y)}, key=luma)
    mapping = {c: ramp[round(i * (len(ramp) - 1) / max(1, len(colours) - 1))] + (255,) for i, c in enumerate(colours)}
    for y in range(16):
        for x in range(16):
            if accent(x, y):
                out.putpixel((x, y), mapping[pixels[x, y]])
    return out


def blend(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (a[3],)


def cut(pair, number, floor):
    """A metatile with its source floor taken out: pixels that match the floor metatile underneath are clear, so the
    object sits on any room's ground."""
    image, under = metatile(pair, number), metatile(pair, floor)
    for y in range(16):
        for x in range(16):
            if image.getpixel((x, y)) == under.getpixel((x, y)):
                image.putpixel((x, y), (0, 0, 0, 0))
    return image


def outline(image, colour):
    """A one-pixel outline around the opaque pixels, so a piece reads on any floor."""
    out = image.copy()
    for y in range(16):
        for x in range(16):
            if not image.getpixel((x, y))[3] and any(0 <= x + dx < 16 and 0 <= y + dy < 16 and image.getpixel((x + dx, y + dy))[3]
                                                     for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                out.putpixel((x, y), colour + (255,))
    return out


def gate_frames(ramp):
    """Mauville's electric barrier in the group's colours, its two crossing and one upright beam on one tile, outlined in
    the group's darkest colour so it reads on any floor; open leaves a faint trace of the beams."""
    beams = Image.new('RGBA', (16, 16))
    for number in BEAMS:
        image = cut(MAUVILLE, number, GYM_FLOOR)
        beams.alpha_composite(image)
    shut = swap(beams, Image.new('RGBA', (16, 16)), ramp)
    outlined = outline(shut, ramp[0])
    trace = shut.copy()
    trace.putalpha(shut.getchannel('A').point(lambda a: 96 if a else 0))
    return [outlined, trace]


def warp_frames():
    """Mossdeep's floor button, then its square brightening three times."""
    pad = cut(MOSSDEEP, WARP_PAD, MOSSDEEP_FLOOR)
    frames = [pad]
    for t in (0.25, 0.5, 0.75):
        frame = pad.copy()
        for y in range(16):
            for x in range(16):
                colour = pad.getpixel((x, y))
                if colour[3] and saturated(colour):
                    frame.putpixel((x, y), blend(colour, (0xF8, 0xF8, 0xF8, 255), t))
        frames.append(frame)
    return frames


def exit_frames():
    """Sky Pillar's sealed hatch sliding off its stairs, in four steps (both are whole-tile objects; only floor pixels are cut)."""
    seal, stairs = cut(PACIFIDLOG, EXIT_SEAL, SKY_FLOOR), cut(PACIFIDLOG, EXIT_STAIRS, SKY_FLOOR)
    frames = []
    for step in range(4):
        frame = stairs.copy()
        shift = round(step * 16 / 3)
        if shift < 16:
            frame.alpha_composite(seal.crop((0, 0, 16 - shift, 16)), (shift, 0))
        frames.append(frame)
    return frames


def plate():
    """The Desert Ruins' stone slab (the top seven rows of its metatile, on a different sand from the floor), keeping only
    colours the floor doesn't use, moved to the middle of the tile and outlined."""
    slab, floor = metatile(CAVE, PLATE), metatile(CAVE, RUINS_FLOOR)
    sand = {floor.getpixel((x, y)) for y in range(16) for x in range(16)}
    out = Image.new('RGBA', (16, 16))
    for y in range(7):
        for x in range(16):
            if slab.getpixel((x, y)) not in sand:
                out.putpixel((x, y + 4), slab.getpixel((x, y)))
    return outline(out, PLATE_EDGE)


def door_frames():
    """The Desert Ruins' sealed braille slab; open, only its outer two pixels stay, as the doorway's frame."""
    sealed = metatile(CAVE, DOOR_SEALED)
    doorway = sealed.copy()
    for y in range(2, 14):
        for x in range(2, 14):
            doorway.putpixel((x, y), (0, 0, 0, 0))
    return [sealed, doorway]


def torch_frames():
    """Two flickers of the Ember battle sprite, each cut to a 16 x 16 tile, flame base at the bottom."""
    ember = sheet(ANIMS + 'small_ember.png', (32, 160))
    frames = []
    for i in (1, 4):
        cell = ember.crop((0, i * 32, 32, i * 32 + 32))
        left, _, right, bottom = cell.getbbox()
        middle = (left + right) // 2
        frames.append(cell.crop((middle - 8, bottom - 16, middle + 8, bottom)))
    return frames


def crystal_frames():
    """The Ice Crystals battle sprite: dim, lit, then two glows."""
    lit = sheet(ANIMS + 'ice_crystals_0.png', (16, 16))
    dim = lit.copy()
    for y in range(16):
        for x in range(16):
            r, g, b, a = lit.getpixel((x, y))
            if a:
                grey = round(luma((r, g, b)) * 0.55)
                dim.putpixel((x, y), (grey, grey, round(grey * 1.15), a))
    glows = []
    for t in (0.3, 0.55):
        glow = lit.copy()
        for y in range(16):
            for x in range(16):
                if lit.getpixel((x, y))[3]:
                    glow.putpixel((x, y), blend(lit.getpixel((x, y)), (0xFF, 0xFF, 0xFF, 255), t))
        glows.append(glow)
    return [dim, lit] + glows


def meteorite_frames():
    """The Rock Throw boulder (32 x 32): one frame per pattern, a third of it lit and turning, then three shatter frames."""
    rock = sheet(ANIMS + 'rocks.png', (32, 192)).crop((0, 0, 32, 32))
    frames = []
    for pattern in range(PATTERNS):
        frame = rock.copy()
        for y in range(32):
            for x in range(32):
                colour = rock.getpixel((x, y))
                angle = (math.degrees(math.atan2(y - 15.5, x - 15.5)) + 90) % 360
                if colour[3] and int(angle // (360 / PATTERNS)) == pattern and luma(colour) > 60:
                    frame.putpixel((x, y), blend(colour, GLOW + (255,), 0.6))
        frames.append(frame)
    for step, alpha in ((1, 1.0), (2, 0.7), (3, 0.4)):
        frame = Image.new('RGBA', (32, 32))
        for qx in (0, 1):
            for qy in (0, 1):
                piece = rock.crop((qx * 16, qy * 16, qx * 16 + 16, qy * 16 + 16))
                piece.putalpha(piece.getchannel('A').point(lambda a: round(a * alpha)))
                offset = step * 3
                layer = Image.new('RGBA', (48, 48))
                layer.alpha_composite(piece, (8 + qx * 16 + (offset if qx else -offset), 8 + qy * 16 + (offset if qy else -offset)))
                frame.alpha_composite(layer.crop((8, 8, 40, 40)))
        frames.append(frame)
    return frames


def build_sprites():
    floor = metatile(MAUVILLE, GYM_FLOOR)
    built = {
        'relic': enlarge([sheet(MISC + 'ruby.png', (16, 16))]),
        'plate': enlarge([plate()]),
        'door': enlarge(door_frames()),
        'boulder': enlarge([sheet(MISC + 'pushable_boulder.png', (16, 16))]),
        'fragile': enlarge([cut(PACIFIDLOG, FRAGILE, SKY_FLOOR), cut(PACIFIDLOG, HOLE, SKY_FLOOR)]),
        'warp': enlarge(warp_frames()),
        'exit': enlarge(exit_frames()),
        'torch': enlarge(torch_frames()),
        'crystal': enlarge(crystal_frames()),
        'clue': enlarge([cut(CAVE, CLUE, RUINS_WALL)]),
        'meteorite': enlarge(meteorite_frames()),
    }
    for group, ramp in GROUPS.items():
        switches = [swap(metatile(MAUVILLE, number), floor, ramp) for number in (SWITCH_OFF, SWITCH_ON)]
        for image in switches:
            for y in range(16):
                for x in range(16):
                    if image.getpixel((x, y)) == floor.getpixel((x, y)):
                        image.putpixel((x, y), (0, 0, 0, 0))
        built[f'switch-{group}'] = enlarge(switches)
        built[f'gate-{group}'] = enlarge(gate_frames(ramp))
    return built


# ---- output ----

def write_rooms(rooms):
    for old in list(OUT.glob('*-ground-*.png')) + list(OUT.glob('*-top-*.png')):
        old.unlink()
    for sid, (_data, images) in rooms.items():
        for key, layers in images.items():
            for prefix, image in zip(('ground', 'top'), layers):
                save_scaled(image, OUT / f'{sid}-{prefix}-{key.replace(",", "-")}.png')
    js = lambda value: json.dumps(value, ensure_ascii=False)
    entries = []
    for sid, (data, _images) in rooms.items():
        tiles = '[\n' + ',\n'.join(f'      {js(row)}' for row in data['tiles']) + '\n    ]'
        chunks = ', '.join(f'{js(key)}: {{ top: {"true" if top else "false"} }}' for key, top in data['chunks'].items())
        warps = ', '.join(f'{js(k)}: {js(v)}' for k, v in data['warps'].items())
        entries.append(
            f'  {js(sid)}: {{\n    id: {js(sid)}, kind: {js(data["kind"])},\n    tiles: {tiles},\n'
            f'    warps: {{{" " + warps + " " if warps else ""}}}, open: {js(data["open"])}, crackAll: {js(data["crackAll"])}, dark: {js(data["dark"])},'
            f' par: {data["par"]}, hint: {js(data["hint"])},\n    star: {js(data["star"])},\n'
            f'    chunk: {data["chunk"]}, chunks: {{ {chunks} }}\n  }}')
    MAP_DATA.write_text(
        '// Generated by scripts/build-trial-maps.py from scripts/trials/stages.json. Plain data, no images, so tests and the\n'
        '// trial rules can import it; the chunk images and sprites are in trial-assets.js.\n'
        "/** @type {Record<string, import('../games/trial.ts').Stage & { chunk: number, chunks: Record<string, { top: boolean }> }>} */\n"
        'export const trialStages = {\n' + ',\n'.join(entries) + '\n}\n', encoding='utf-8')


def require(name):
    return f"require('../../assets/trials/{name}.png')"


def write_assets(sprites, rooms):
    lines = [f'  {json.dumps(key)}: {{ source: {require(key)}, frames: {frames}, width: {width}, height: {height} }}'
             for key, (frames, width, height) in sprites.items()]
    rooms_out = []
    for sid, (data, _images) in rooms.items():
        chunk_lines = [f"    {json.dumps(key)}: {{ ground: {require(f'{sid}-ground-{key.replace(',', '-')}')}"
                       + (f", top: {require(f'{sid}-top-{key.replace(',', '-')}')}" if top else '') + ' }'
                       for key, top in data['chunks'].items()]
        rooms_out.append(f'  {json.dumps(sid)}: {{\n' + ',\n'.join(chunk_lines) + '\n  }')
    ASSETS.write_text(
        '// Generated by scripts/build-trial-maps.py. Chunks are each room\'s baked terrain by "cx,cy"; sprite frames run\n'
        '// left to right, width and height are output pixels per frame. See SPRITE-CREDITS.md.\n'
        'export const trialChunks = {\n' + ',\n'.join(rooms_out) + '\n}\n'
        'export const trialSprites = {\n' + ',\n'.join(lines) + '\n}\n', encoding='utf-8')


def main():
    if sys.argv[1:2] == ['--reference']:
        check(len(sys.argv) == 4, 'usage: --reference <primary> <secondary>')
        reference(sys.argv[2], sys.argv[3], ROOT.parent / 'tmp')
        return
    stages = read_stages()
    check_themes()
    rooms = build_rooms(stages)
    built = build_sprites()
    OUT.mkdir(parents=True, exist_ok=True)
    for key, (image, *_shape) in built.items():
        image.save(OUT / f'{key}.png', optimize=True)
    sprites = {key: shape for key, (_image, *shape) in built.items()}
    write_rooms(rooms)
    write_assets(sprites, rooms)
    chunks = sum(len(images) for _data, images in rooms.values())
    print(f'Built {len(rooms)} trial rooms in {chunks} chunks and {len(sprites)} trial sprites.')


if __name__ == '__main__':
    main()
