"""Build the move animation strips for Route Guard and Trail Defense from the Gen III battle animation sprites.

Usage: python scripts/build-move-sprites.py   (needs Pillow; reads hatdog-app/data/walk-source and downloads any
battle animation sheet missing from that cache at the pinned pokeemerald-expansion revision)

Each strip in SPRITES becomes assets/moves/<key>.png: its frames in a row, upscaled by a whole number (at least 2, up
to 96 px on the long side) so the pixels stay crisp. Sheets are indexed PNGs read frame by frame, left to right and
then top to bottom, and coloured with the palette the game loads for them (see PALETTES). Directional sprites are turned
to point east so the board can rotate them toward the target. Credits: see SPRITE-CREDITS.md.
"""
import json
import urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT.parent / 'hatdog-app' / 'data' / 'walk-source'
REV = '0ecb1115129ccb7eb3a7e0dc3718dc263ab84011'
BASE = f'https://raw.githubusercontent.com/rh-hideout/pokeemerald-expansion/{REV}/'
SHEETS = 'graphics/battle_anims/sprites/'
OUT = ROOT / 'assets' / 'moves'
LONG_SIDE = 96

# Sheets the game colours with another sheet's palette (src/data/battle_anim.h at REV).
PALETTES = {'fire_plume': 'fire', 'lightning': 'lightning_2', 'red_fist': 'humanoid_foot', 'electricity': 'electric_orbs',
            'water_orb': 'water_impact'}

# key: sheet, frame size in source pixels, frames to use (in reading order), turn = degrees counter-clockwise that point
# the sprite east, hue = degrees to shift the colours, for the moves that recolour a shared sheet as the games do, and
# jaws = gaps in pixels between the upper teeth and their flipped copy, closing like the game's Bite.
# The keys are what src/games/MoveFx.tsx draws.
SPRITES = {
    'swift': dict(sheet='yellow_star', size=(32, 32), frames=[0]),
    'hit': dict(sheet='hit', size=(32, 32), frames=[0, 1, 2, 3, 4]),
    'ember': dict(sheet='embers', size=(32, 32), frames=[2, 3, 4, 3]),
    'fire-plume': dict(sheet='fire_plume', size=(32, 32), frames=[0, 1, 2, 3, 4]),
    'small-ember': dict(sheet='small_ember', size=(32, 32), frames=[1, 2, 3, 4]),
    'water-gun': dict(sheet='hydro_pump', size=(16, 16), frames=[0, 1, 2, 3]),
    'water-splash': dict(sheet='water_droplet', size=(32, 32), frames=[4, 5, 6, 7]),
    'electricity': dict(sheet='electricity', size=(32, 32), frames=[0, 1, 2, 3]),
    'lightning': dict(sheet='lightning', size=(32, 160), frames=[0]),
    'razor-leaf': dict(sheet='razor_leaf', size=(32, 16), frames=[0]),
    'icicle': dict(sheet='icicle_spear', size=(32, 32), frames=[0], turn=-90),
    'ice-chunk': dict(sheet='ice_chunk', size=(32, 32), frames=[0, 1, 2, 3]),
    'fist': dict(sheet='red_fist', size=(32, 32), frames=[0]),
    'punch-impact': dict(sheet='punch_impact', size=(32, 32), frames=[0]),
    'sludge': dict(sheet='poison_bubble', size=(16, 16), frames=[0]),
    'sludge-splat': dict(sheet='poison_bubble', size=(16, 16), frames=[1, 2]),
    'mound': dict(sheet='dirt_mound', size=(32, 16), frames=[0, 1]),
    'air-cutter': dict(sheet='air_wave', size=(32, 16), frames=[0]),
    'gust': dict(sheet='gust', size=(32, 32), frames=[0, 1]),
    'ring': dict(sheet='thin_ring', size=(64, 64), frames=[0]),
    'spiral': dict(sheet='spiral', size=(64, 64), frames=[0]),
    'pin': dict(sheet='green_spike', size=(16, 16), frames=[0]),
    'rock': dict(sheet='rocks', size=(32, 32), frames=[0]),
    'shadow-ball': dict(sheet='shadow_ball', size=(32, 32), frames=[0]),
    'claw': dict(sheet='claw_slash', size=(32, 32), frames=[0, 1, 2, 3, 4]),
    'metal': dict(sheet='metal_ball', size=(16, 16), frames=[0]),
    'bite': dict(sheet='teeth_new', size=(64, 64), frames=[0], jaws=[12, 5, -3, -3]),
    'dragon-flame': dict(sheet='embers', size=(32, 32), frames=[2, 3, 4, 3], hue=230),
    'dragon-plume': dict(sheet='fire_plume', size=(32, 32), frames=[0, 1, 2, 3, 4], hue=230),
    'fairy-sparkle': dict(sheet='sparkle_3', size=(16, 16), frames=[0, 1, 2, 3], hue=130),
    'heart': dict(sheet='pink_heart_2', size=(32, 32), frames=[2, 3, 4]),
    'growth': dict(sheet='green_sparkle', size=(16, 16), frames=[0, 1, 2, 3]),
}


def fetch(path):
    target = CACHE / path
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(urllib.request.urlopen(BASE + path, timeout=30).read())
    return target


def sheet(name):
    image = Image.open(fetch(SHEETS + name + '.png'))
    assert image.mode == 'P', name
    if name in PALETTES:
        image.putpalette(Image.open(fetch(SHEETS + PALETTES[name] + '.png')).getpalette())
    image.info['transparency'] = 0
    return image.convert('RGBA')


def shift_hue(image, degrees):
    alpha = image.getchannel('A')
    hue, saturation, value = image.convert('RGB').convert('HSV').split()
    hue = hue.point(lambda h: (h + round(degrees * 256 / 360)) % 256)
    result = Image.merge('HSV', (hue, saturation, value)).convert('RGB')
    result.putalpha(alpha)
    return result


def jaws(teeth, gaps):
    teeth = teeth.crop(teeth.getbbox())
    lower = teeth.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    side = max(teeth.width, 2 * (teeth.height + max(gaps)))
    frames = []
    for gap in gaps:
        frame = Image.new('RGBA', (side, side))
        frame.alpha_composite(teeth, ((side - teeth.width) // 2, side // 2 - gap - teeth.height))
        frame.alpha_composite(lower, ((side - teeth.width) // 2, side // 2 + gap))
        frames.append(frame)
    return frames


def strip(spec):
    source = sheet(spec['sheet'])
    if spec.get('hue'):
        source = shift_hue(source, spec['hue'])
    width, height = spec['size']
    columns = source.width // width
    assert columns and source.height // height * columns > max(spec['frames']), spec
    frames = []
    for index in spec['frames']:
        x, y = index % columns * width, index // columns * height
        frame = source.crop((x, y, x + width, y + height))
        if spec.get('turn'):
            frame = frame.rotate(spec['turn'], expand=True)
        frames.append(frame)
    if spec.get('jaws'):
        frames = jaws(frames[0], spec['jaws'])
    width, height = frames[0].size
    scale = max(2, LONG_SIDE // max(width, height))
    out = Image.new('RGBA', (width * scale * len(frames), height * scale))
    for i, frame in enumerate(frames):
        assert frame.getbbox(), (spec, i)
        out.paste(frame.resize((width * scale, height * scale), Image.Resampling.NEAREST), (i * width * scale, 0))
    return out, len(frames), width, height


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    entries = []
    for key, spec in SPRITES.items():
        image, count, width, height = strip(spec)
        image.save(OUT / f'{key}.png', optimize=True)
        entries.append(f"  {json.dumps(key)}: {{ source: require('../../assets/moves/{key}.png'), frames: {count}, "
                       f"width: {width}, height: {height} }}")
    (ROOT / 'src' / 'generated' / 'move-sprites.js').write_text(
        '// Generated by scripts/build-move-sprites.py. Frames run left to right; width and height are source pixels.\n'
        '// See SPRITE-CREDITS.md.\nexport const moveSprites = {\n' + ',\n'.join(entries) + '\n}\n', encoding='utf-8')
    print(f'Built {len(entries)} move animation strips.')


if __name__ == '__main__':
    main()
