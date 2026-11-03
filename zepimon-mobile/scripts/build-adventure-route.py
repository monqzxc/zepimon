"""Build the Adventure tab's route map from pokeemerald-expansion: three strips of an endless Hoenn-style route.

Usage: python scripts/build-adventure-route.py   (needs Pillow; shares the source cache with build-safari-map.py)

Each strip is drawn from scripts/adventure-route/<name>.txt, one character per tile, with Emerald's General tileset:
  . ground   g tall grass   f flowers   T tree (aligned 2 x 2 blocks)   ~ water (pond shapes, no 1-wide water)
  R rock     S sign         s path      0-4 a milestone on the path     P / G the Pokemon Center and its door
The path is two tiles wide; a milestone digit sits on its left tile, so the pad's centre is the digit tile's right edge.
'start' is the trailhead at the bottom of the map (0 km, by the Pokemon Center). 'a' and 'b' take turns above it, 20
km each, with milestones 1-4 every 5 km. The strips repeat, so a strip's top row meets the next strip's bottom row:
they keep water in the same columns there and no trees in their top two rows.

Each strip is one image (ground and top layers together: nothing walks under a tree here), enlarged 4x with
nearest-neighbour scaling. Writes assets/route/*.png and src/generated/adventure-route.js. Credits: see SPRITE-CREDITS.md.
"""
import importlib.util
import json
from PIL import Image
from emerald_tiles import ROOT, SCALE, Tilesets

spec = importlib.util.spec_from_file_location('safari', ROOT / 'scripts' / 'build-safari-map.py')
safari = importlib.util.module_from_spec(spec)
spec.loader.exec_module(safari)

LAYOUT = ROOT / 'scripts' / 'adventure-route'
OUT = ROOT / 'assets' / 'route'
GENERATED = ROOT / 'src' / 'generated' / 'adventure-route.js'
STRIPS = {'start': 1, 'a': 4, 'b': 4}
FLOWERS = 0x004
PATH = 's01234'
# Emerald's Pokemon Center front, four metatiles square; the door is the second tile of the bottom row.
CENTER = ((0x048, 0x049, 0x04A, 0x04B), (0x050, 0x051, 0x052, 0x053), (0x058, 0x059, 0x05A, 0x05B), (0x060, 0x061, 0x062, 0x063))


def read(name):
    tiles = (LAYOUT / f'{name}.txt').read_text().splitlines()
    rows, cols = len(tiles), len(tiles[0])
    assert all(len(row) == cols for row in tiles), f'{name}: rows differ in length'
    assert rows % 2 == 0, f'{name}: an even number of rows keeps trees aligned when strips repeat'
    wraps = name != 'start'
    at = lambda x, y: tiles[(y % rows) if wraps else max(0, min(rows - 1, y))][max(0, min(cols - 1, x))]
    pads = {}
    for y in range(rows):
        for x in range(cols):
            char = tiles[y][x]
            assert char in '.gfT~RSsPG01234', f'{name}: unsupported tile {char!r} at {x},{y}'
            if char.isdigit():
                assert char not in pads and at(x + 1, y) == 's', f'{name}: milestone {char} must be once, left of a path tile'
                pads[char] = {'x': x + 1, 'y': y + 0.5}
            if char == 'T':
                left, top = x - x % 2, y - y % 2
                assert all(tiles[top + dy][left + dx] == 'T' for dx in (0, 1) for dy in (0, 1)), f'{name}: trees are aligned 2 x 2 blocks: {x},{y}'
                assert not wraps or y > 1, f'{name}: no trees in the top two rows, where the strip below would need their crowns'
            if char == '~':
                land = tuple(int(at(px, py) != '~') for px, py in ((x, y - 1), (x, y + 1), (x - 1, y), (x + 1, y)))
                assert land in safari.POND, f'{name}: water needs a pond shape (no 1-wide water) at {x},{y}'
    expected = ['0'] if name == 'start' else ['1', '2', '3', '4']
    assert sorted(pads) == expected, f'{name}: milestones {sorted(pads)}, expected {expected}'
    if wraps:
        assert [c == '~' for c in tiles[0]] == [c == '~' for c in tiles[-1]], f'{name}: water must meet itself where strips join'
    center = [(x, y) for y in range(rows) for x in range(cols) if tiles[y][x] in 'PG']
    if center:
        left, top = min(x for x, _ in center), min(y for _, y in center)
        assert len(center) == 16 and all(tiles[top + dy][left + dx] == ('G' if (dx, dy) == (1, 3) else 'P') for dx in range(4) for dy in range(4)), \
            f'{name}: the Pokemon Center is one 4 x 4 block with its door (G) second from the left on the bottom row'
    return tiles, at, pads, (left, top) if center else None


def metatile(tiles, at, center, x, y):
    char = tiles[y][x]
    side = x % 2
    if char == 'T':
        if y % 2 == 0:
            return (safari.TREE_TOP_EDGE if at(x + (1 if side else -1), y) != 'T' else safari.TREE_TOP)[side]
        if at(x, y + 1) == 'T':
            return safari.TREE_OVER_TREE[side]
        return (safari.TREE_BOTTOM_EDGE if at(x + (1 if side else -1), y) != 'T' else safari.TREE_BOTTOM)[side]
    if char == '~':
        return safari.POND[tuple(int(at(px, py) != '~') for px, py in ((x, y - 1), (x, y + 1), (x - 1, y), (x + 1, y)))]
    if char in 'PG':
        return CENTER[y - center[1]][x - center[0]]
    if char in PATH:
        path = lambda px, py: at(px, py) in PATH
        row = 0 if not path(x, y - 1) else 2 if not path(x, y + 1) else 1
        column = 0 if not path(x - 1, y) else 2 if not path(x + 1, y) else 1
        return safari.SAND[row][column]
    simple = {'g': safari.TALL_GRASS, 'f': FLOWERS, 'R': safari.ROCK, 'S': safari.SIGN}
    if char in simple:
        return simple[char]
    # Open ground right above a tree block carries that tree's crown tip.
    if at(x, y + 1) == 'T' and (y + 1) % 2 == 0:
        return safari.CROWN[side]
    return safari.GROUND


def build(sets, name):
    tiles, at, pads, center = read(name)
    rows, cols = len(tiles), len(tiles[0])
    image = Image.new('RGBA', (cols * 16, rows * 16))
    cache = {}
    for y in range(rows):
        for x in range(cols):
            number = metatile(tiles, at, center, x, y)
            if number not in cache:
                ground, top = sets.metatile(number)
                ground.alpha_composite(top)
                cache[number] = ground
            image.alpha_composite(cache[number], (x * 16, y * 16))
    assert image.getchannel('A').getextrema() == (255, 255), f'{name}: every pixel is drawn'
    return image, dict(cols=cols, rows=rows, pads=[pads[key] for key in sorted(pads)])


def main():
    sets = Tilesets(safari.PRIMARY, safari.SECONDARY)
    built = {name: build(sets, name) for name in STRIPS}
    cols = {data['cols'] for _, data in built.values()}
    assert len(cols) == 1, 'every strip is as wide as the others'
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (image, _) in built.items():
        image.resize((image.width * SCALE, image.height * SCALE), Image.Resampling.NEAREST).save(OUT / f'{name}.png', optimize=True)
    strips = ',\n'.join(
        f"  {name}: {{ source: require('../../assets/route/{name}.png'), rows: {data['rows']}, pads: {json.dumps(data['pads'])} }}"
        for name, (_, data) in built.items())
    # The trainer running, in the Zepimon outfit, for when Run is picked; walking uses the Safari Zone's strips.
    runners = {}
    for name in safari.RECOLOUR:
        image, frames, width, height = safari.trainer(name, 'running')
        image.save(OUT / f'{name}-run.png', optimize=True)
        runners[name] = f"  {name}: {{ source: require('../../assets/route/{name}-run.png'), frames: {frames}, width: {width}, height: {height} }}"
    GENERATED.write_text(
        '// Generated by scripts/build-adventure-route.py from scripts/adventure-route/*.txt. Sizes are in tiles; a pad is\n'
        '// the centre of a milestone on the path, from the top-left of its strip. routeRunners are the trainers\' running\n'
        '// strips, laid out like the Safari Zone\'s walking ones (sizes in pixels). See SPRITE-CREDITS.md.\n'
        f'export const routeCols = {cols.pop()}\nexport const routeStrips = {{\n{strips}\n}}\n'
        f'export const routeRunners = {{\n{",\n".join(runners.values())}\n}}\n', encoding='utf-8')
    print(f'Built {len(built)} route strips and {len(runners)} running trainers.')


if __name__ == '__main__':
    main()
