"""Builds the watch and phone app icons from pokemon_data/zepimon-icon.png.

Usage: python scripts/build-icons.py   (needs Pillow)

Watch (Zepp OS spec): 248x248 PNG, a perfect circle with a 4px transparent margin, artwork kept inside the circle.
Phone (Expo): 1024x1024 icon on a solid background (iOS rejects transparency), an Android adaptive foreground and
monochrome layer kept inside the 66/108 safe zone, and a 48x48 web favicon.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'pokemon_data' / 'zepimon-icon.png'
WATCH_ASSETS = ROOT / 'hatdog-app' / 'assets'
PHONE_ASSETS = ROOT / 'zepimon-mobile' / 'assets'
BADGE = (28, 13, 63, 255)       # deep purple sampled from the icon's shading
RIM = (109, 59, 214, 255)       # lighter purple ring so the badge reads on a black watch face
BAND_SATURATION = 130           # monochrome layer drops dark, muted pixels: the band and button ring measure about
BAND_VALUE = 140                # saturation 86-99 and value 87-103 (of 255), while the purple body is 185+ saturated


def enclosing_circle(image):
    """Center and radius (source pixels) of the smallest circle around the visible artwork, found on a 1/8 grid."""
    step = 8
    alpha = image.getchannel('A').resize((image.width // step, image.height // step))
    width = alpha.width
    points = [(i % width, i // width) for i, value in enumerate(alpha.tobytes()) if value > 64]
    left, top, right, bottom = alpha.point(lambda v: 255 if v > 64 else 0).getbbox()
    best = None
    for cx in range(left, right + 1):
        for cy in range(top, bottom + 1):
            radius = max((x - cx) ** 2 + (y - cy) ** 2 for x, y in points) ** 0.5
            if best is None or radius < best[2]:
                best = (cx, cy, radius)
    cx, cy, radius = best
    return (cx + 0.5) * step, (cy + 0.5) * step, (radius + 1) * step


def place(image, circle, size, diameter):
    """Scale the artwork so its enclosing circle has `diameter` px, centered on a transparent `size` canvas."""
    cx, cy, radius = circle
    scale = diameter / (2 * radius)
    scaled = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(scaled, (round(size / 2 - cx * scale), round(size / 2 - cy * scale)))
    return canvas


def badge(size, margin, fill, rim, rim_width):
    """Anti-aliased filled circle (drawn at 4x, then reduced)."""
    big = Image.new('RGBA', (size * 4, size * 4), (0, 0, 0, 0))
    draw = ImageDraw.Draw(big)
    box = (margin * 4, margin * 4, (size - margin) * 4 - 1, (size - margin) * 4 - 1)
    draw.ellipse(box, fill=rim)
    inset = rim_width * 4
    draw.ellipse((box[0] + inset, box[1] + inset, box[2] - inset, box[3] - inset), fill=fill)
    return big.resize((size, size), Image.LANCZOS)


def monochrome(layer):
    """White silhouette for Android 13 themed icons. Only the grey band and button ring (dark, colorless) are cut out,
    so the shaded purple body stays solid and the ball reads like a Pokeball glyph."""
    alpha = layer.getchannel('A')
    _, saturation, value = layer.convert('RGB').convert('HSV').split()
    keep = Image.new('L', layer.size, 0)
    keep.putdata([0 if s < BAND_SATURATION and v < BAND_VALUE else a
                  for a, s, v in zip(alpha.tobytes(), saturation.tobytes(), value.tobytes())])
    out = Image.new('RGBA', layer.size, (255, 255, 255, 0))
    out.putalpha(keep)
    return out


def main():
    art = Image.open(SOURCE).convert('RGBA')
    circle = enclosing_circle(art)

    # Watch: 240px circle inside a 4px transparent margin, artwork 8px inside the rim.
    watch = badge(248, 4, BADGE, RIM, 3)
    watch.alpha_composite(place(art, circle, 248, 216))
    for target in sorted(path for path in WATCH_ASSETS.iterdir() if path.is_dir()):
        watch.save(target / 'icon.png', optimize=True)

    # Phone: iOS and legacy Android icon on a solid square; iOS rounds the corners itself.
    phone = Image.new('RGBA', (1024, 1024), BADGE)
    phone.alpha_composite(place(art, circle, 1024, 840))
    phone.convert('RGB').save(PHONE_ASSETS / 'icon.png', optimize=True)

    # Android adaptive icon: launchers crop to the central 72/108; keep the art inside the 66/108 safe zone.
    foreground = place(art, circle, 1024, round(1024 * 62 / 108))
    foreground.save(PHONE_ASSETS / 'android-icon-foreground.png', optimize=True)
    monochrome(foreground).save(PHONE_ASSETS / 'android-icon-monochrome.png', optimize=True)

    place(art, circle, 48, 46).save(PHONE_ASSETS / 'favicon.png', optimize=True)
    print('Built icons from', SOURCE.name, 'enclosing circle', tuple(round(v) for v in circle))


if __name__ == '__main__':
    main()
