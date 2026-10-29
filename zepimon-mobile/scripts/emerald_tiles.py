"""Emerald tileset code shared by the map builders (build-safari-map.py, build-trial-maps.py): the pinned pokeemerald-expansion
source cache, palette and indexed-image helpers, the primary + secondary tileset pair, chunk cutting and contact sheets.
Needs Pillow."""
import urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT.parent / 'hatdog-app' / 'data' / 'walk-source'
REV = '0ecb1115129ccb7eb3a7e0dc3718dc263ab84011'
BASE = f'https://raw.githubusercontent.com/rh-hideout/pokeemerald-expansion/{REV}/'
SCALE = 4


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


class Tilesets:
    """Emerald's primary + secondary tileset pair (include/fieldmap.h at REV): tiles 0-511 and metatiles 0-511 are the
    primary's, higher numbers the secondary's; palette slots 0-5 are the primary's and 6-12 the secondary's. A metatile
    is eight u16 entries (bottom layer TL, TR, BL, BR, then top layer): tile = e & 0x3FF, flips 0x400/0x800, palette e >> 12."""

    def __init__(self, primary, secondary):
        self.sets = [self.load('primary', primary), self.load('secondary', secondary)]

    @staticmethod
    def load(kind, name):
        folder = f'data/tilesets/{kind}/{name}/'
        tiles = Image.open(fetch(folder + 'tiles.png'))
        assert tiles.mode == 'P' and tiles.width == 128, folder
        metatiles = fetch(folder + 'metatiles.bin').read_bytes()
        attributes = fetch(folder + 'metatile_attributes.bin').read_bytes()
        assert len(attributes) * 8 == len(metatiles), folder
        palettes = [palette_file(folder + f'palettes/{i:02d}.pal') for i in range(16)]
        return dict(name=name, tiles=tiles, pixels=tiles.load(), metatiles=metatiles, attributes=attributes, palettes=palettes)

    def count(self, which):
        return len(self.sets[which]['metatiles']) // 16

    def metatile(self, number):
        """(ground, top) 16 x 16 RGBA images. Layer type (attr >> 12): 0 NORMAL and 2 SPLIT draw the top layer over
        sprites; 1 COVERED draws both layers under them."""
        which, local = (0, number) if number < 512 else (1, number - 512)
        source = self.sets[which]
        assert local < self.count(which), number
        entries = [int.from_bytes(source['metatiles'][local * 16 + i * 2:local * 16 + i * 2 + 2], 'little') for i in range(8)]
        layer = int.from_bytes(source['attributes'][local * 2:local * 2 + 2], 'little') >> 12
        ground, top = Image.new('RGBA', (16, 16)), Image.new('RGBA', (16, 16))
        for i, entry in enumerate(entries):
            target = ground if i < 4 or layer == 1 else top
            self.draw_tile(target, entry, i % 4 % 2 * 8, i % 4 // 2 * 8)
        return ground, top

    def draw_tile(self, target, entry, left, top):
        tile, slot = entry & 0x3FF, entry >> 12
        which, local = (0, tile) if tile < 512 else (1, tile - 512)
        source = self.sets[which]
        palette = self.sets[0 if slot < 6 else 1]['palettes'][slot]
        columns = source['tiles'].width // 8
        if local >= columns * (source['tiles'].height // 8):
            return
        for y in range(8):
            for x in range(8):
                sx, sy = 7 - x if entry & 0x400 else x, 7 - y if entry & 0x800 else y
                index = source['pixels'][local % columns * 8 + sx, local // columns * 8 + sy]
                if index:
                    target.putpixel((left + x, top + y), palette[index] + (255,))


def reference(primary, secondary, folder):
    """Contact sheets of every metatile with its id, for choosing metatile ids: <folder>/metatiles-<set>-<page>.png."""
    from PIL import ImageDraw
    sets = Tilesets(primary, secondary)
    folder.mkdir(exist_ok=True)
    for which, base in ((0, 0), (1, 512)):
        numbers = list(range(base, base + sets.count(which)))
        for page in range(0, len(numbers), 128):
            sheet = Image.new('RGBA', (16 * 52, 8 * 64), (255, 0, 255, 255))
            draw = ImageDraw.Draw(sheet)
            for i, number in enumerate(numbers[page:page + 128]):
                ground, top = sets.metatile(number)
                ground.alpha_composite(top)
                x, y = i % 16 * 52, i // 16 * 64
                sheet.paste(ground.resize((48, 48), Image.Resampling.NEAREST), (x + 2, y + 14), ground.resize((48, 48)))
                draw.text((x + 2, y + 1), f'{number:03X}', fill=(255, 255, 255, 255))
            name = sets.sets[which]['name']
            sheet.save(folder / f'metatiles-{name}-{page // 128}.png')
    print(f'Reference sheets written to {folder}')


def chunk_images(tiles, chunk, metatile_for):
    """Chunk images (ground and, where there is any, top) and which chunks have a top, for a map of tile rows;
    metatile_for(x, y) gives the (below, above) 16 x 16 images of one tile. All in memory."""
    rows, cols = len(tiles), len(tiles[0])
    images, chunks = {}, {}
    for cy in range((rows + chunk - 1) // chunk):
        for cx in range((cols + chunk - 1) // chunk):
            width, height = min(chunk, cols - cx * chunk), min(chunk, rows - cy * chunk)
            ground, top = Image.new('RGBA', (width * 16, height * 16)), Image.new('RGBA', (width * 16, height * 16))
            for ty in range(height):
                for tx in range(width):
                    below, above = metatile_for(cx * chunk + tx, cy * chunk + ty)
                    ground.alpha_composite(below, (tx * 16, ty * 16))
                    top.alpha_composite(above, (tx * 16, ty * 16))
            key = f'{cx},{cy}'
            has_top = top.getbbox() is not None
            images[key] = [ground] + ([top] if has_top else [])
            chunks[key] = has_top
    return images, chunks


def save_scaled(image, path):
    image.resize((image.width * SCALE, image.height * SCALE), Image.Resampling.NEAREST).save(path, optimize=True)
