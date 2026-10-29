"""Build the Legendary lairs for the Resonance Trial from Pokemon Emerald's own rooms (pokeemerald-expansion).

Usage: python scripts/build-lairs.py            (needs Pillow; reads hatdog-app/data/walk-source, downloading any
                                                 source missing from that cache at the pinned revision)
       python scripts/build-lairs.py --grid Room[:x:y:w:h] ...   (prints a room's walkable tiles, for choosing windows)
       python scripts/build-lairs.py --preview   (also writes ../tmp/lair-<id>.png with walkable tiles marked)

Each lair is a window of a real Emerald room (LAIRS below): the Seafloor Cavern pool where Kyogre sleeps, the Cave of
Origin's magma chamber, the top of Sky Pillar, the Regis' chamber, Southern Island, Faraway Island, Birth Island, and
fitting rooms for the Legendaries Emerald doesn't have. Legendaries whose home no Emerald room fits (Deoxys in space,
Mewtwo's lab and others) get a lair drawn in Emerald's style by scripts/drawn_lairs.py instead. A lair names its room and window, where the Legendary waits,
the start tile just inside the entrance and the way out (the direction from the start onto the entrance). A few edits
copy one of the room's own blocks onto another tile, to clear a boulder from the middle or close a side passage, so the
art stays Emerald's.

A tile is walkable when its collision bits are clear, it is not water (elevation 1) and its metatile behaviour is not
water, a waterfall, a current or a hole (include/constants/metatile_behaviors.h). The play area is every walkable tile
reachable from the start, so passages leading out of the window are closed off by the window's edge.

Writes assets/lairs/<id>-ground.png and <id>-top.png (ground under the trainer, the metatiles' top layer over them),
enlarged 4x with nearest-neighbour scaling like the Safari Zone; src/generated/lair-maps.js (plain data: tiles,
positions) and src/generated/lair-art.js (image requires). Credits: see SPRITE-CREDITS.md.
"""
import json
import re
import sys
from collections import deque
from PIL import Image, ImageDraw
import drawn_lairs
from emerald_tiles import ROOT, SCALE, Tilesets, fetch

OUT = ROOT / 'assets' / 'lairs'
MAP_DATA = ROOT / 'src' / 'generated' / 'lair-maps.js'
ART = ROOT / 'src' / 'generated' / 'lair-art.js'
PREVIEW = ROOT.parent / 'tmp'
STEPS = {'north': (0, -1), 'south': (0, 1), 'west': (-1, 0), 'east': (1, 0)}

# Behaviours that stop a walk: water you would need Surf or Dive for, waterfalls, currents and holes.
BLOCKING = re.compile(r'MB_(POND_WATER|INTERIOR_DEEP_WATER|DEEP_WATER|WATERFALL|SOOTOPOLIS_DEEP_WATER|OCEAN_WATER|'
                      r'UNUSED_SOOTOPOLIS_DEEP_WATER.*|FAST_WATER|CYCLING_ROAD_WATER|\w+_CURRENT|CRACKED_FLOOR_HOLE|MT_PYRE_HOLE|'
                      r'WATER_DOOR|WATER_SOUTH_ARROW_WARP|NO_SURFACING|IMPASSABLE_\w+|SECRET_BASE_IMPASSABLE|TRASH_CAN)$')

# id: (name shown in the app, Emerald room, window (x, y, width, height), Legendary tile, start tile, way out, edits).
#      Positions are room coordinates. The entrance is the tile one step from the start in the way out; it may be
#      walkable (stairs, a mat) but is never part of the play area. Edits are {(x, y): (source x, source y)}, or a
#      function of the room that returns them.
def clear(left, top, right, bottom, floor, keep=()):
    """Edits that turn every unwalkable tile in the box (boulders, holes) into the room's floor tile, except keep."""
    return lambda room: {(x, y): floor for y in range(top, bottom + 1) for x in range(left, right + 1)
                         if (x, y) not in keep and not room.walkable(x, y)}


LAIRS = {
    'seafloor-cavern': ('Seafloor Cavern', 'SeafloorCavern_Room9', (8, 33, 15, 12), (15, 39), (9, 42), 'west', {}),
    'cave-of-origin': ('Cave of Origin', 'CaveOfOrigin_Unused_B4F_Lava', (4, 4, 11, 11), (9, 9), (12, 5), 'north', {}),
    # Sky Pillar's summit is strewn with boulders and holes; the middle is cleared for the trial, two boulders flank
    # Rayquaza and the edges keep their cracked floor.
    'sky-pillar': ('Sky Pillar', 'SkyPillar_Top', (7, 3, 11, 11), (12, 6), (12, 12), 'south',
                   clear(9, 4, 15, 12, (13, 11), keep=((10, 8), (15, 8)))),
    'regi-chamber': ('Sealed Ruins', 'DesertRuins', (3, 2, 11, 11), (8, 6), (8, 11), 'south', {}),
    'sealed-chamber': ('Sealed Chamber', 'SealedChamber_InnerRoom', (5, 9, 11, 12), (10, 12), (10, 19), 'south', {}),
    'southern-island': ('Southern Island', 'SouthernIsland_Interior', (8, 7, 11, 12), (13, 11), (13, 17), 'south', {}),
    'faraway-island': ('Faraway Island', 'FarawayIsland_Interior', (7, 9, 11, 11), (12, 13), (12, 18), 'south', {}),
    'birth-island': ('Birth Island', 'BirthIsland_Exterior', (10, 7, 11, 11), (15, 10), (15, 16), 'south', {}),
    'shoal-cave': ('Shoal Cave', 'ShoalCave_LowTideIceRoom', (7, 9, 12, 13), (14, 13), (17, 11), 'north', {}),
    'new-mauville': ('New Mauville', 'NewMauville_Inside', (24, 1, 15, 9), (33, 4), (25, 5), 'west', {}),
    'mt-pyre-summit': ('Mt. Pyre Summit', 'MtPyre_Summit', (18, 1, 11, 11), (23, 4), (23, 10), 'south', {}),
    'mt-pyre': ('Mt. Pyre', 'MtPyre_1F', (11, 2, 11, 12), (16, 8), (17, 12), 'south', {}),
    'crystal-cavern': ('Crystal Cavern', 'CaveOfOrigin_B1F', (4, 2, 11, 13), (9, 9), (9, 3), 'north', {}),
}


def behaviours():
    text = fetch('include/constants/metatile_behaviors.h').read_text()
    body = text[text.index('enum {') + 6:text.index('};', text.index('enum {'))]
    names, value = {}, -1
    for line in body.splitlines():
        match = re.match(r'\s*(MB_[A-Z0-9_]+)\s*(?:=\s*(\w+))?\s*,?', line)
        if not match:
            continue
        value = int(match.group(2), 0) if match.group(2) else value + 1
        names[value] = match.group(1)
    return names


def snake(name):
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()


class Room:
    layouts = None
    tilesets = {}
    behaviour_names = None

    def __init__(self, name, edits=None):
        if Room.layouts is None:
            Room.layouts = {l['name']: l for l in json.loads(fetch('data/layouts/layouts.json').read_text())['layouts'] if 'name' in l}
            Room.behaviour_names = behaviours()
        layout = Room.layouts[name + '_Layout']
        self.name, self.width, self.height = name, layout['width'], layout['height']
        key = (layout['primary_tileset'], layout['secondary_tileset'])
        if key not in Room.tilesets:
            Room.tilesets[key] = Tilesets(*(snake(part.replace('gTileset_', '')) for part in key))
        self.sets = Room.tilesets[key]
        data = fetch(layout['blockdata_filepath']).read_bytes()
        self.blocks = [int.from_bytes(data[i:i + 2], 'little') for i in range(0, len(data), 2)]
        for (x, y), (sx, sy) in (edits or {}).items():
            self.blocks[y * self.width + x] = self.blocks[sy * self.width + sx]

    def block(self, x, y):
        return self.blocks[y * self.width + x] if 0 <= x < self.width and 0 <= y < self.height else 0x0C00

    def behaviour(self, metatile):
        which, local = (0, metatile) if metatile < 512 else (1, metatile - 512)
        attributes = self.sets.sets[which]['attributes']
        if local * 2 + 2 > len(attributes):
            return 'MB_NORMAL'
        return Room.behaviour_names.get(int.from_bytes(attributes[local * 2:local * 2 + 2], 'little') & 0xFF, 'MB_NORMAL')

    def walkable(self, x, y):
        value = self.block(x, y)
        return not (value >> 10) & 3 and value >> 12 != 1 and not BLOCKING.match(self.behaviour(value & 0x3FF))

    def grid(self, x0=0, y0=0, w=None, h=None):
        w, h = w or self.width - x0, h or self.height - y0
        lines = [f'{self.name}: x {x0}..{x0 + w - 1}', '    ' + ''.join(str((x0 + i) % 10) for i in range(w))]
        for y in range(y0, y0 + h):
            lines.append(f'{y:3d} ' + ''.join('.' if self.walkable(x, y) else '~' if 'WATER' in self.behaviour(self.block(x, y) & 0x3FF)
                                              or self.block(x, y) >> 12 == 1 else '#' for x in range(x0, x0 + w)))
        return '\n'.join(lines)

    def draw(self, x0, y0, w, h):
        ground, top = Image.new('RGBA', (w * 16, h * 16)), Image.new('RGBA', (w * 16, h * 16))
        for y in range(h):
            for x in range(w):
                below, above = self.sets.metatile(self.block(x0 + x, y0 + y) & 0x3FF)
                ground.alpha_composite(below, (x * 16, y * 16))
                top.alpha_composite(above, (x * 16, y * 16))
        return ground, top


# Emerald's rule for a step between two heights: the same elevation, or either is a transition (0) or multi-level (15).
def same_level(a, b):
    return a == b or a in (0, 15) or b in (0, 15)


def reachable(walkable, elevation, start):
    seen, queue = {start}, deque([start])
    while queue:
        x, y = queue.popleft()
        for dx, dy in STEPS.values():
            nxt = (x + dx, y + dy)
            if nxt not in seen and walkable(*nxt) and same_level(elevation(x, y), elevation(*nxt)):
                seen.add(nxt)
                queue.append(nxt)
    return seen


def build(lair_id, spec, preview=False):
    name, room_name, (x0, y0, w, h), legendary, start, out, edits = spec
    room = Room(room_name, edits(Room(room_name)) if callable(edits) else edits)
    inside = lambda x, y: x0 <= x < x0 + w and y0 <= y < y0 + h
    # Inside the window, a walkable tile that isn't the Legendary's.
    open_tile = lambda x, y: inside(x, y) and (x, y) != legendary and room.walkable(x, y)
    assert open_tile(*start), (lair_id, 'start', start)
    entrance = (start[0] + STEPS[out][0], start[1] + STEPS[out][1])
    assert inside(*entrance), (lair_id, 'entrance', entrance)
    assert inside(*legendary), (lair_id, 'legendary')
    elevation = lambda x, y: room.block(x, y) >> 12
    area = reachable(lambda x, y: open_tile(x, y) and (x, y) != entrance, elevation, start)
    # The game only checks one tile at a time, so two neighbours in the area must also be a legal step for each other.
    for (x, y) in area:
        for dx, dy in STEPS.values():
            if (x + dx, y + dy) in area:
                assert same_level(elevation(x, y), elevation(x + dx, y + dy)), (lair_id, 'height step', (x, y))
    ground, top = room.draw(x0, y0, w, h)
    # Around the art, the colour most common along its outer edge, so the lair seems to carry on past the screen.
    edge = edge_pixels(ground)
    background = '#%02x%02x%02x' % max(set(edge), key=edge.count)
    shift = lambda p: (p[0] - x0, p[1] - y0)
    return save(lair_id, name, room_name, ground, top, {shift(p) for p in area}, shift(legendary), shift(start),
                shift(entrance), out, background, preview)


def build_drawn(lair_id, preview=False):
    """A lair drawn by scripts/drawn_lairs.py: the layout's floor tiles reachable from the start are the play area."""
    ground, top, layout = drawn_lairs.draw(lair_id)
    rows, legendary, start, entrance = layout['rows'], layout['legendary'], layout['start'], layout['entrance']
    assert rows[start[1]][start[0]] == '.', (lair_id, 'start', start)
    floor = lambda x, y: 0 <= y < len(rows) and 0 <= x < len(rows[0]) and rows[y][x] == '.'
    area = reachable(floor, lambda x, y: 0, start)
    # The art is noisy (stars, fog), so the background is its edge's average colour rather than the most common one.
    edge = edge_pixels(ground)
    background = '#%02x%02x%02x' % tuple(round(sum(p[i] for p in edge) / len(edge)) for i in range(3))
    return save(lair_id, drawn_lairs.NAMES[lair_id], 'drawn', ground, top, area, legendary, start, entrance, 'south',
                background, preview)


def edge_pixels(image):
    w, h = image.size
    return [image.getpixel((x, y))[:3] for x in range(w) for y in (0, h - 1)] + \
           [image.getpixel((x, y))[:3] for y in range(h) for x in (0, w - 1)]


def save(lair_id, name, room_name, ground, top, area, legendary, start, entrance, out, background, preview):
    """Writes the lair's art and returns its map data. Positions are lair tiles."""
    w, h = ground.width // 16, ground.height // 16
    tiles = [''.join('.' if (x, y) in area else '#' for x in range(w)) for y in range(h)]
    OUT.mkdir(parents=True, exist_ok=True)
    for image, layer in ((ground, 'ground'), (top, 'top')):
        image.resize((w * 16 * SCALE, h * 16 * SCALE), Image.Resampling.NEAREST).save(OUT / f'{lair_id}-{layer}.png', optimize=True)
    if preview:
        PREVIEW.mkdir(exist_ok=True)
        sheet = ground.copy()
        sheet.alpha_composite(top)
        sheet = sheet.resize((w * 32, h * 32), Image.Resampling.NEAREST)
        draw = ImageDraw.Draw(sheet)
        for (x, y) in area:
            draw.rectangle([x * 32 + 13, y * 32 + 13, x * 32 + 18, y * 32 + 18], fill=(80, 255, 120, 255))
        for (x, y), colour in ((legendary, (255, 60, 220, 255)), (start, (60, 200, 255, 255)), (entrance, (255, 230, 60, 255))):
            draw.rectangle([x * 32 + 4, y * 32 + 4, x * 32 + 27, y * 32 + 27], outline=colour, width=3)
        sheet.save(PREVIEW / f'lair-{lair_id}.png')
    point = lambda p: {'x': p[0], 'y': p[1]}
    return {'name': name, 'room': room_name, 'cols': w, 'rows': h, 'tiles': tiles, 'legendary': point(legendary), 'start': point(start),
            'entrance': point(entrance), 'out': out, 'background': background}


def main():
    args = sys.argv[1:]
    if args and args[0] == '--grid':
        for arg in args[1:]:
            name, *box = arg.split(':')
            print(Room(name).grid(*[int(b) for b in box]))
        return
    preview = '--preview' in args
    data = {lair_id: build(lair_id, spec, preview) for lair_id, spec in LAIRS.items()}
    data.update({lair_id: build_drawn(lair_id, preview) for lair_id in drawn_lairs.LAYOUTS})
    header = '// Generated by scripts/build-lairs.py from Pokemon Emerald rooms (pokeemerald-expansion) and drawn lairs. Plain data, no images, so tests\n' \
             '// and the game rules can import it; the art is in lair-art.js. tiles: . walkable, # not. Positions are in lair tiles.\n'
    MAP_DATA.write_text(header + 'export const lairMaps = ' + json.dumps(data, indent=2) + '\n')
    requires = ',\n'.join(f"  {json.dumps(lair_id)}: {{ ground: require('../../assets/lairs/{lair_id}-ground.png'), "
                          f"top: require('../../assets/lairs/{lair_id}-top.png') }}" for lair_id in data)
    ART.write_text('// Generated by scripts/build-lairs.py. Each lair is one image per layer, 64 px per tile.\n'
                   f'export const lairArt = {{\n{requires}\n}}\n')
    print(f'Wrote {len(data)} lairs')


if __name__ == '__main__':
    main()
