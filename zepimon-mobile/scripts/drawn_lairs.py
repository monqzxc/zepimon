"""Lairs drawn for this app, for Legendaries whose home Emerald has no room for (used by build-lairs.py): Deoxys in
outer space, Rayquaza in the ozone layer, Giratina in the Distortion World, Darkrai in a nightmare, Mew in a bubble
playroom, Zygarde among its cells and Mewtwo in the lab it broke out of. Each is a layout (one character per 16 px
tile) and a theme that paints it in Emerald's pixel style: the void or walls around, the floor, obstacles (with a top
layer that the trainer walks behind), hazards, the entrance and the spot where the Legendary waits.

Layout characters: . floor, # void or wall, X obstacle, ~ hazard, L the Legendary (floor under it, but blocked),
E the entrance (blocked; the start is the floor tile just inside it).
"""
import math
from PIL import Image

T = 16

# 11 x 11, the Legendary near the middle and the entrance at the bottom.
LAYOUTS = {
    'outer-space': ['###########', '##...#...##', '#.........#', '#..X...X..#', '#....L....#', '#~.......~#',
                    '#.........#', '#..X...X..#', '##.......##', '###.....###', '#####E#####'],
    'ozone-layer': ['###########', '#...###...#', '#.........#', '##..X.X..##', '#....L....#', '#.........#',
                    '##.~...~.##', '#.........#', '#..X...X..#', '##.......##', '#####E#####'],
    'distortion-world': ['###########', '#..#...#..#', '#.........#', '#.X.....X.#', '#...~L~...#', '#.........#',
                         '##..X.X..##', '#.........#', '#.~.....~.#', '##.......##', '#####E#####'],
    'nightmare-realm': ['###########', '##.......##', '#..X...X..#', '#.........#', '#.~..L..~.#', '#.........#',
                        '#..X...X..#', '#.........#', '##.~...~.##', '##.......##', '#####E#####'],
    'bubble-playroom': ['###########', '#.........#', '#.X.....X.#', '#.........#', '#..~.L.X..#', '#.........#',
                        '#.X.....~.#', '#....X....#', '#.........#', '#.........#', '#####E#####'],
    'cell-hollow': ['###########', '#...X.X...#', '#.........#', '#X..~.~..X#', '#....L....#', '#.........#',
                    '#..X...X..#', '#.~.....~.#', '#.........#', '##.......##', '#####E#####'],
    'cinnabar-lab': ['###########', '#XX.....XX#', '#.........#', '#..~...~..#', '#....L....#', '#X.......X#',
                     '#.........#', '#..X...X..#', '#.........#', '#.........#', '#####E#####'],
}
NAMES = {'outer-space': 'Meteor Field', 'ozone-layer': 'Ozone Layer', 'distortion-world': 'Distortion World',
         'nightmare-realm': 'Nightmare Realm', 'bubble-playroom': 'Bubble Playroom', 'cell-hollow': 'Cell Hollow',
         'cinnabar-lab': 'Cinnabar Lab'}


def hex_rgb(value):
    value = value.lstrip('#')
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def noise(x, y, salt=0):
    """A steady pseudo-random number in [0, 1) for a pixel, the same on every build."""
    n = (x * 374761393 + y * 668265263 + salt * 2147483647) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65536


def smooth(x, y, scale, salt=0):
    """Soft value noise for clouds, nebulae and fog."""
    gx, gy = x / scale, y / scale
    x0, y0 = math.floor(gx), math.floor(gy)
    fx, fy = gx - x0, gy - y0
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = noise(x0, y0, salt), noise(x0 + 1, y0, salt)
    c, d = noise(x0, y0 + 1, salt), noise(x0 + 1, y0 + 1, salt)
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3)) + (255,)


class Canvas:
    def __init__(self, cols, rows):
        self.ground = Image.new('RGBA', (cols * T, rows * T))
        self.top = Image.new('RGBA', (cols * T, rows * T))
        self.width, self.height = cols * T, rows * T

    def px(self, x, y, colour, layer='ground'):
        image = self.ground if layer == 'ground' else self.top
        if 0 <= x < self.width and 0 <= y < self.height:
            if len(colour) == 4 and colour[3] < 255:
                image.alpha_composite(Image.new('RGBA', (1, 1), colour), (x, y))
            else:
                image.putpixel((x, y), colour)

    def rect(self, x0, y0, x1, y1, colour, layer='ground'):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.px(x, y, colour, layer)

    def disc(self, cx, cy, radius, colour, layer='ground', squash=1.0):
        for y in range(math.floor(cy - radius), math.ceil(cy + radius) + 1):
            for x in range(math.floor(cx - radius), math.ceil(cx + radius) + 1):
                if (x - cx) ** 2 + ((y - cy) / squash) ** 2 <= radius * radius:
                    self.px(x, y, colour, layer)

    def ring(self, cx, cy, radius, colour, layer='ground', width=1.0, squash=1.0):
        for y in range(math.floor(cy - radius - 1), math.ceil(cy + radius) + 2):
            for x in range(math.floor(cx - radius - 1), math.ceil(cx + radius) + 2):
                d = math.sqrt((x - cx) ** 2 + ((y - cy) / squash) ** 2)
                if radius - width <= d <= radius:
                    self.px(x, y, colour, layer)


# ---- Themes ---------------------------------------------------------------------------------------------------------
# Each paints one kind of tile at pixel (x0, y0); `around` says which neighbours are open floor, for edges and cliffs.

class Theme:
    platform = True          # floor floating over a void (cliff faces drawn under its edges)
    face, face_dark = '#444', '#222'

    def void(self, c, x, y):
        pass

    def floor(self, c, x0, y0, tx, ty):
        pass

    def obstacle(self, c, x0, y0, tx, ty):
        pass

    def hazard(self, c, x0, y0, tx, ty):
        """Paints a hazard tile; True leaves it open to the void (a gap in the platform) instead."""
        return True

    def entrance(self, c, x0, y0):
        pass

    def legendary(self, c, x0, y0, tx, ty):
        self.floor(c, x0, y0, tx, ty)

    def wall(self, c, x0, y0, tx, ty):
        pass

    def decorate(self, c, rows):
        pass


def cliff(c, x0, y0, face, dark, depth=6):
    """The rock face under a platform's edge, ragged at the bottom, over the void below it."""
    for x in range(x0, x0 + T):
        bottom = depth - 1 + int(noise(x, y0, 9) * 3)
        for y in range(y0, y0 + bottom):
            c.px(x, y, mix(hex_rgb(face), hex_rgb(dark), (y - y0) / max(1, bottom)))
        c.px(x, y0 + bottom, hex_rgb(dark))


class Space(Theme):
    face, face_dark = '#4b4458', '#1d1828'
    base, shade, light, crater = map(hex_rgb, ('#6e6780', '#5c556c', '#847d96', '#3f394d'))

    def void(self, c, x, y):
        t = smooth(x, y, 40, 1)
        colour = mix(hex_rgb('#060818'), hex_rgb('#1b0f3a'), t * 0.9)
        neb = smooth(x + 300, y, 28, 2)
        if neb > 0.62:
            colour = mix(colour, hex_rgb('#1f5a78'), (neb - 0.62) * 1.6)
        r = noise(x, y, 3)
        if r > 0.993:
            colour = hex_rgb('#ffffff')
        elif r > 0.985:
            colour = hex_rgb('#9fc4ff')
        c.px(x, y, colour)

    def decorate(self, c, rows):
        # Meteors streaking through the dark around the rock, trailing fire.
        for mx, my in ((22, 14), (160, 40), (14, 150), (166, 120), (40, 172)):
            if rows[min(len(rows) - 1, my // T)][min(len(rows[0]) - 1, mx // T)] != '#':
                continue
            for i in range(12):
                c.px(mx - i, my - i // 2, mix(hex_rgb('#ffd27a'), hex_rgb('#3a1440'), i / 12))
                c.px(mx - i, my - i // 2 + 1, mix(hex_rgb('#ff8a3a'), hex_rgb('#1b0f3a'), i / 10))
            c.disc(mx + 1, my + 1, 2.2, hex_rgb('#6b5a52'))
            c.px(mx + 2, my, hex_rgb('#ffe6a8'))

    def floor(self, c, x0, y0, tx, ty):
        for y in range(y0, y0 + T):
            for x in range(x0, x0 + T):
                t = smooth(x, y, 5, 4)
                c.px(x, y, self.light if t > 0.78 else self.shade if t < 0.3 else self.base)
        if noise(tx, ty, 5) < 0.45:
            cx, cy = x0 + 4 + int(noise(tx, ty, 6) * 8), y0 + 4 + int(noise(tx, ty, 7) * 8)
            c.disc(cx, cy, 2.6, self.crater)
            c.ring(cx, cy, 3, self.light, width=1)
            c.disc(cx - 0.5, cy - 0.5, 1.4, hex_rgb('#332d40'))

    def obstacle(self, c, x0, y0, tx, ty):
        self.floor(c, x0, y0, tx, ty)
        # A meteorite that crashed here, still glowing in its cracks; its top rises over the tile above.
        cx, cy = x0 + 8, y0 + 6
        c.disc(cx + 1, y0 + 13, 7.5, (0, 0, 0, 110), squash=0.35)
        c.disc(cx, y0 + 13, 7.5, hex_rgb('#2a2236'), squash=0.35)
        glow = hex_rgb('#ff8a3a') if (tx + ty) % 2 else hex_rgb('#5ff2e0')
        for layer, top in (('ground', y0), ('top', y0 - 4)):
            for y in range(cy - 8, cy + 9):
                for x in range(cx - 8, cx + 9):
                    d = ((x - cx) / 7.5) ** 2 + ((y - cy) / 8.5) ** 2 + (noise(x, y, 8) - 0.5) * 0.25
                    if d > 1 or (layer == 'ground') != (y >= top):
                        continue
                    colour = hex_rgb('#231e2e') if d > 0.8 else hex_rgb('#5a5068') if x + y < cx + cy - 4 else hex_rgb('#3e3848')
                    c.px(x, y, colour, layer)
        for x, y in ((0, -3), (1, -2), (1, -1), (2, 0), (1, 1), (0, 2), (-1, 3), (3, 1), (4, 2), (-2, 0), (-3, -1)):
            c.px(cx + x, cy + y, glow, 'top' if cy + y < y0 else 'ground')

    def entrance(self, c, x0, y0):
        c.ring(x0 + 8, y0 + 8, 7, hex_rgb('#5ff2e0'), width=2, squash=0.55)
        c.ring(x0 + 8, y0 + 8, 5, hex_rgb('#c8fff7'), width=1, squash=0.55)

    def legendary(self, c, x0, y0, tx, ty):
        self.floor(c, x0, y0, tx, ty)
        c.disc(x0 + 8, y0 + 12, 7, hex_rgb('#2b2340'), squash=0.45)
        c.ring(x0 + 8, y0 + 12, 7, hex_rgb('#ff8a5a'), width=1, squash=0.45)
        c.ring(x0 + 8, y0 + 12, 5, hex_rgb('#5ff2e0'), width=1, squash=0.45)


class Sky(Theme):
    face, face_dark = '#c9dcf2', '#7fa6d6'
    cloud, shade, light, deep = map(hex_rgb, ('#f3f8ff', '#d7e6f8', '#ffffff', '#b8cfea'))

    def void(self, c, x, y):
        colour = mix(hex_rgb('#1d3f9c'), hex_rgb('#9fd6ff'), (y / max(1, c.height)) ** 0.8)
        puff = smooth(x, y * 2, 22, 11)
        if puff > 0.66:
            colour = mix(colour, hex_rgb('#ffffff'), (puff - 0.66) * 2.2)
        c.px(x, y, colour)

    def floor(self, c, x0, y0, tx, ty):
        for y in range(y0, y0 + T):
            for x in range(x0, x0 + T):
                t = smooth(x, y, 6, 12)
                c.px(x, y, self.light if t > 0.72 else self.shade if t < 0.3 else self.cloud)

    def obstacle(self, c, x0, y0, tx, ty):
        self.floor(c, x0, y0, tx, ty)
        stone, shade, moss = hex_rgb('#cfc7a8'), hex_rgb('#9d977f'), hex_rgb('#7fae6a')
        c.disc(x0 + 8, y0 + 14, 6, hex_rgb('#b8cfea'), squash=0.35)
        c.rect(x0 + 4, y0 + 2, x0 + 11, y0 + 13, stone)
        c.rect(x0 + 9, y0 + 2, x0 + 11, y0 + 13, shade)
        for y in range(y0 + 2, y0 + 14, 3):
            c.px(x0 + 6, y, shade)
        c.rect(x0 + 4, y0 + 11, x0 + 7, y0 + 13, moss)
        # The broken top of the column, over whoever stands behind it.
        c.rect(x0 + 4, y0 - 6, x0 + 11, y0 + 1, stone, 'top')
        c.rect(x0 + 9, y0 - 6, x0 + 11, y0 + 1, shade, 'top')
        for x in range(x0 + 4, x0 + 12):
            for y in range(y0 - 6, y0 - 6 + int(noise(x, y0, 13) * 4)):
                c.px(x, y, (0, 0, 0, 0), 'top')
        c.top.putpixel((x0 + 5, y0 - 2), moss)

    def entrance(self, c, x0, y0):
        for i, y in enumerate(range(y0, y0 + T, 4)):
            c.rect(x0 + 2 + i, y, x0 + 13 - i, y + 2, hex_rgb('#e8e2c8'))
            c.rect(x0 + 2 + i, y + 3, x0 + 13 - i, y + 3, hex_rgb('#a8a28a'))

    def legendary(self, c, x0, y0, tx, ty):
        self.floor(c, x0, y0, tx, ty)
        c.disc(x0 + 8, y0 + 11, 8, hex_rgb('#d8d0b0'), squash=0.45)
        c.ring(x0 + 8, y0 + 11, 8, hex_rgb('#9d977f'), width=1, squash=0.45)
        c.ring(x0 + 8, y0 + 11, 5, hex_rgb('#6fc27a'), width=1, squash=0.45)


class Distortion(Theme):
    face, face_dark = '#2b2e38', '#0d0b14'
    base, shade, moss, crack = map(hex_rgb, ('#3d414c', '#33363f', '#2f6b62', '#22242c'))

    def void(self, c, x, y):
        swirl = math.sin(x * 0.09 + math.sin(y * 0.07) * 2.2 + smooth(x, y, 30, 21) * 4)
        colour = mix(hex_rgb('#07040c'), hex_rgb('#2c1244'), (swirl + 1) / 2 * 0.8)
        r = noise(x, y, 22)
        if r > 0.994:
            colour = hex_rgb('#ffcf5a')
        elif r > 0.988:
            colour = hex_rgb('#c2304a')
        c.px(x, y, colour)

    def floor(self, c, x0, y0, tx, ty):
        for y in range(y0, y0 + T):
            for x in range(x0, x0 + T):
                t = smooth(x, y, 5, 23)
                colour = self.moss if t > 0.74 else self.shade if noise(x, y, 24) < 0.25 else self.base
                c.px(x, y, colour)
        x, y = x0 + int(noise(tx, ty, 25) * 10), y0 + 3
        for i in range(8):
            c.px(x + i // 2, y + i, self.crack)

    def obstacle(self, c, x0, y0, tx, ty):
        self.floor(c, x0, y0, tx, ty)
        c.disc(x0 + 8, y0 + 14, 6, (0, 0, 0, 110), squash=0.35)
        # A twisted spire of rock, its tip over the tile above.
        for y in range(y0 - 12, y0 + 14):
            half = max(1, round(5 - (y0 + 14 - y) / 5))
            sway = round(math.sin(y * 0.3) * 2.5)
            layer = 'top' if y < y0 + 2 else 'ground'
            left, right = x0 + 8 - half + sway, x0 + 8 + half + sway
            for x in range(left, right):
                colour = hex_rgb('#c2304a') if x == left else hex_rgb('#7a8096') if x < x0 + 8 + sway else hex_rgb('#454a5c')
                c.px(x, y, colour, layer)
        c.px(x0 + 7, y0 + 4, hex_rgb('#ffcf5a'))
        c.px(x0 + 9, y0 - 3, hex_rgb('#ffcf5a'), 'top')

    def entrance(self, c, x0, y0):
        for r, colour in ((7, '#7a3cff'), (5, '#c2304a'), (3, '#ffcf5a')):
            c.ring(x0 + 8, y0 + 8, r, hex_rgb(colour), width=1.4, squash=0.7)

    def legendary(self, c, x0, y0, tx, ty):
        self.floor(c, x0, y0, tx, ty)
        c.disc(x0 + 8, y0 + 11, 7, hex_rgb('#1a1622'), squash=0.45)
        c.ring(x0 + 8, y0 + 11, 7, hex_rgb('#ffcf5a'), width=1, squash=0.45)
        c.ring(x0 + 8, y0 + 11, 4, hex_rgb('#c2304a'), width=1, squash=0.45)


class Nightmare(Theme):
    face, face_dark = '#14163a', '#05060f'
    base, line, star = map(hex_rgb, ('#1f2150', '#2c2f6a', '#8e8fd8'))

    def void(self, c, x, y):
        fog = smooth(x, y, 18, 31)
        colour = mix(hex_rgb('#04050d'), hex_rgb('#232860'), fog * 0.7)
        if noise(x, y, 32) > 0.992:
            colour = hex_rgb('#d8dcff')
        # A pale crescent moon in the upper left.
        dx, dy = x - 20, y - 20
        if dx * dx + dy * dy < 81 and (dx - 3) ** 2 + (dy - 2) ** 2 >= 64:
            colour = hex_rgb('#f2f0d8')
        c.px(x, y, colour)

    def floor(self, c, x0, y0, tx, ty):
        for y in range(y0, y0 + T):
            for x in range(x0, x0 + T):
                wave = math.sin((x + y * 0.6) * 0.35 + smooth(x, y, 9, 33) * 5)
                colour = self.line if wave > 0.82 else self.base
                if noise(x, y, 34) > 0.985:
                    colour = self.star
                c.px(x, y, colour)

    def obstacle(self, c, x0, y0, tx, ty):
        self.floor(c, x0, y0, tx, ty)
        c.disc(x0 + 8, y0 + 13, 6, (0, 0, 0, 120), squash=0.35)
        # A shadow bush of thorns, with a pair of red eyes in some of them.
        for i in range(14):
            angle = math.pi * (0.1 + 0.8 * i / 13)
            length = 5 + noise(tx * 7 + i, ty, 35) * 6
            for s in range(int(length)):
                x = round(x0 + 8 - math.cos(angle) * s)
                y = round(y0 + 13 - math.sin(angle) * s)
                c.px(x, y, hex_rgb('#07070f'), 'top' if y < y0 else 'ground')
        c.disc(x0 + 8, y0 + 9, 4.5, hex_rgb('#07070f'))
        if (tx * 3 + ty) % 2 == 0:
            c.px(x0 + 6, y0 + 8, hex_rgb('#ff3048'))
            c.px(x0 + 10, y0 + 8, hex_rgb('#ff3048'))

    def hazard(self, c, x0, y0, tx, ty):
        # A pit of starry dark in the dream floor.
        self.floor(c, x0, y0, tx, ty)
        for y in range(y0, y0 + T):
            for x in range(x0, x0 + T):
                if ((x - x0 - 7.5) / 7.5) ** 2 + ((y - y0 - 8) / 6.5) ** 2 <= 1:
                    c.px(x, y, hex_rgb('#d8dcff') if noise(x, y, 36) > 0.97 else hex_rgb('#06071a'))
        return False

    def entrance(self, c, x0, y0):
        c.rect(x0 + 3, y0 + 2, x0 + 12, y0 + 15, hex_rgb('#05060f'))
        c.ring(x0 + 8, y0 + 6, 5, hex_rgb('#8e8fd8'), width=1)
        for y in range(y0 + 6, y0 + 16):
            c.px(x0 + 3, y, hex_rgb('#8e8fd8'))
            c.px(x0 + 12, y, hex_rgb('#8e8fd8'))

    def legendary(self, c, x0, y0, tx, ty):
        self.floor(c, x0, y0, tx, ty)
        c.disc(x0 + 8, y0 + 11, 7, hex_rgb('#0a0b1e'), squash=0.45)
        c.ring(x0 + 8, y0 + 11, 7, hex_rgb('#ff3048'), width=1, squash=0.45)


class Playroom(Theme):
    platform = False
    pink, rose, heart, star = map(hex_rgb, ('#ffe3f1', '#fbd0e6', '#ff8fc4', '#fff2a8'))

    def void(self, c, x, y):
        pass

    def wall(self, c, x0, y0, tx, ty):
        # Soft pastel walls with a puffy cloud trim where they meet the floor.
        for y in range(y0, y0 + T):
            for x in range(x0, x0 + T):
                stripe = (x // 4 + y // 4) % 2
                c.px(x, y, hex_rgb('#d9c6ff') if stripe else hex_rgb('#e6d8ff'))
        if noise(tx, ty, 41) > 0.6:
            c.disc(x0 + 8, y0 + 8, 2.2, hex_rgb('#fff2a8'))

    def floor(self, c, x0, y0, tx, ty):
        tile = self.pink if (tx + ty) % 2 else self.rose
        c.rect(x0, y0, x0 + T - 1, y0 + T - 1, tile)
        c.rect(x0, y0, x0 + T - 1, y0, hex_rgb('#ffffff'))
        if noise(tx, ty, 42) < 0.3:
            hx, hy = x0 + 5 + int(noise(tx, ty, 43) * 5), y0 + 5 + int(noise(tx, ty, 44) * 5)
            for x, y in ((0, 0), (2, 0), (-1, 1), (0, 1), (1, 1), (2, 1), (3, 1), (0, 2), (1, 2), (2, 2), (1, 3)):
                c.px(hx + x, hy + y, self.heart)
        elif noise(tx, ty, 45) < 0.2:
            sx, sy = x0 + 8, y0 + 8
            for x, y in ((0, -2), (0, -1), (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0), (0, 1), (-1, 2), (1, 2)):
                c.px(sx + x, sy + y, self.star)

    def obstacle(self, c, x0, y0, tx, ty):
        self.floor(c, x0, y0, tx, ty)
        if (tx + ty) % 2:
            # A big soap bubble, bobbing over the tile above.
            c.disc(x0 + 8, y0 + 14, 5, (180, 120, 170, 90), squash=0.35)
            c.disc(x0 + 8, y0 + 5, 8, (170, 220, 255, 170), 'top')
            c.ring(x0 + 8, y0 + 5, 8, hex_rgb('#6fb8f0'), 'top', width=1.3)
            c.ring(x0 + 8, y0 + 5, 6.7, (255, 150, 215, 230), 'top', width=1)
            c.disc(x0 + 5, y0 + 1, 1.6, hex_rgb('#ffffff'), 'top')
        else:
            # A toy block that toppled over.
            c.rect(x0 + 3, y0 + 4, x0 + 12, y0 + 13, hex_rgb('#7fc8ff'))
            c.rect(x0 + 3, y0 + 4, x0 + 12, y0 + 5, hex_rgb('#b8e2ff'))
            c.rect(x0 + 11, y0 + 4, x0 + 12, y0 + 13, hex_rgb('#4f9fe0'))
            for x, y in ((0, 0), (2, 0), (-1, 1), (0, 1), (1, 1), (2, 1), (3, 1), (0, 2), (1, 2), (2, 2), (1, 3)):
                c.px(x0 + 6 + x, y0 + 7 + y, hex_rgb('#ff6fb0'))

    def hazard(self, c, x0, y0, tx, ty):
        self.floor(c, x0, y0, tx, ty)
        c.disc(x0 + 8, y0 + 8, 7, hex_rgb('#c6ecff'), squash=0.75)
        c.ring(x0 + 8, y0 + 8, 7, hex_rgb('#9fd8ff'), width=1, squash=0.75)
        for bx, by, br in ((5, 7, 1.6), (10, 9, 2.2), (8, 5, 1.2)):
            c.ring(x0 + bx, y0 + by, br, hex_rgb('#ffffff'), width=0.8)
        return False

    def entrance(self, c, x0, y0):
        c.rect(x0 + 3, y0 + 3, x0 + 12, y0 + 15, hex_rgb('#ff8fc4'))
        c.disc(x0 + 8, y0 + 5, 4.5, hex_rgb('#ff8fc4'))
        c.rect(x0 + 5, y0 + 6, x0 + 10, y0 + 15, hex_rgb('#ffd1e8'))
        c.px(x0 + 9, y0 + 11, hex_rgb('#fff2a8'))

    def legendary(self, c, x0, y0, tx, ty):
        self.floor(c, x0, y0, tx, ty)
        c.disc(x0 + 8, y0 + 11, 7.5, hex_rgb('#ff9cc9'), squash=0.5)
        c.disc(x0 + 8, y0 + 10, 6, hex_rgb('#ffc4e1'), squash=0.45)


class Cells(Theme):
    face, face_dark = '#0e1a10', '#020402'
    base, grid, node = map(hex_rgb, ('#0b100b', '#1f7a3a', '#3cff7a'))

    def void(self, c, x, y):
        colour = mix(hex_rgb('#010201'), hex_rgb('#072210'), smooth(x, y, 24, 51) * 0.8)
        if noise(x, y, 52) > 0.99:
            colour = hex_rgb('#3cff7a')
        c.px(x, y, colour)

    def floor(self, c, x0, y0, tx, ty):
        # A honeycomb of green lines over black, glowing where they meet.
        for y in range(y0, y0 + T):
            for x in range(x0, x0 + T):
                q = (x + (y // 8) % 2 * 4) % 8
                edge = q == 0 or y % 8 == 0 and q < 5
                c.px(x, y, self.grid if edge else self.base)
        if noise(tx, ty, 53) < 0.5:
            c.px(x0 + 4, y0 + 8, self.node)
            c.px(x0, y0, self.node)

    def obstacle(self, c, x0, y0, tx, ty):
        self.floor(c, x0, y0, tx, ty)
        c.disc(x0 + 8, y0 + 14, 6, (0, 0, 0, 140), squash=0.35)
        # A crystallised gene cluster: green hexagonal prisms, the tallest reaching over the tile above.
        for ox, height, w in ((-4, 10, 3), (4, 12, 3), (0, 19, 4)):
            for y in range(y0 + 14 - height, y0 + 14):
                for x in range(x0 + 8 + ox - w, x0 + 8 + ox + w):
                    colour = hex_rgb('#b8ffcf') if x == x0 + 8 + ox - w else hex_rgb('#2be36a') if x < x0 + 8 + ox else hex_rgb('#138a3c')
                    c.px(x, y, colour, 'top' if y < y0 + 1 else 'ground')
            tip = y0 + 14 - height
            for i in range(w):
                for x in range(x0 + 8 + ox - w + i, x0 + 8 + ox + w - i):
                    c.px(x, tip - i, hex_rgb('#7dffa8'), 'top' if tip - i < y0 + 1 else 'ground')

    def hazard(self, c, x0, y0, tx, ty):
        for y in range(y0, y0 + T):
            for x in range(x0, x0 + T):
                d = ((x - x0 - 7.5) / 7.5) ** 2 + ((y - y0 - 7.5) / 7.5) ** 2
                c.px(x, y, hex_rgb('#3cff7a') if 0.8 < d <= 1 else hex_rgb('#0f3d1d') if d <= 0.8 else self.base)
        return False

    def entrance(self, c, x0, y0):
        c.ring(x0 + 8, y0 + 8, 7, hex_rgb('#3cff7a'), width=1.5, squash=0.7)
        c.disc(x0 + 8, y0 + 8, 4, hex_rgb('#0f3d1d'), squash=0.7)

    def legendary(self, c, x0, y0, tx, ty):
        self.floor(c, x0, y0, tx, ty)
        c.disc(x0 + 8, y0 + 11, 7.5, hex_rgb('#0f3d1d'), squash=0.45)
        c.ring(x0 + 8, y0 + 11, 7.5, hex_rgb('#3cff7a'), width=1, squash=0.45)
        c.ring(x0 + 8, y0 + 11, 4, hex_rgb('#b8ffcf'), width=1, squash=0.45)


class Lab(Theme):
    platform = False
    plate, seam, rivet, glow = map(hex_rgb, ('#3a3346', '#29233a', '#5a5068', '#a46bff'))

    def wall(self, c, x0, y0, tx, ty):
        # Lab machinery panels: dark purple metal, vents and screens, a lit face where they meet the floor.
        c.rect(x0, y0, x0 + T - 1, y0 + T - 1, hex_rgb('#231d2e'))
        c.rect(x0 + 1, y0 + 1, x0 + T - 2, y0 + T - 2, hex_rgb('#2f2840'))
        kind = int(noise(tx, ty, 61) * 3)
        if kind == 0:
            c.rect(x0 + 3, y0 + 3, x0 + 12, y0 + 9, hex_rgb('#12091f'))
            for x in range(x0 + 4, x0 + 12):
                c.px(x, y0 + 4 + int(noise(x, ty, 62) * 4), hex_rgb('#c08cff'))
        elif kind == 1:
            for y in range(y0 + 3, y0 + 13, 2):
                c.rect(x0 + 3, y, x0 + 12, y, hex_rgb('#1a1424'))
        else:
            c.disc(x0 + 5, y0 + 6, 1.5, hex_rgb('#ff4f6a'))
            c.disc(x0 + 10, y0 + 6, 1.5, hex_rgb('#5ff2e0'))
        c.rect(x0, y0 + T - 2, x0 + T - 1, y0 + T - 1, hex_rgb('#4b4258'))

    def floor(self, c, x0, y0, tx, ty):
        c.rect(x0, y0, x0 + T - 1, y0 + T - 1, self.plate)
        c.rect(x0, y0, x0 + T - 1, y0, self.seam)
        c.rect(x0, y0, x0, y0 + T - 1, self.seam)
        for x, y in ((2, 2), (13, 2), (2, 13), (13, 13)):
            c.px(x0 + x, y0 + y, self.rivet)
        if tx % 3 == 0 and ty % 2 == 0:
            c.rect(x0 + 4, y0 + 7, x0 + 11, y0 + 8, (164, 107, 255, 120))

    def obstacle(self, c, x0, y0, tx, ty):
        self.floor(c, x0, y0, tx, ty)
        if (tx + ty) % 2:
            # A console, its screen over the tile above.
            c.rect(x0 + 2, y0 + 3, x0 + 13, y0 + 14, hex_rgb('#4b4258'))
            c.rect(x0 + 2, y0 + 3, x0 + 13, y0 + 4, hex_rgb('#6a6078'))
            for x in (4, 7, 10):
                c.px(x0 + x, y0 + 9, hex_rgb('#ff4f6a') if x == 7 else hex_rgb('#5ff2e0'))
            c.rect(x0 + 3, y0 - 6, x0 + 12, y0 + 2, hex_rgb('#29233a'), 'top')
            c.rect(x0 + 4, y0 - 5, x0 + 11, y0 + 1, hex_rgb('#12091f'), 'top')
            for x in range(x0 + 4, x0 + 12):
                c.px(x, y0 - 3 + int(noise(x, ty, 63) * 3), hex_rgb('#c08cff'), 'top')
        else:
            # Shards of the broken tank.
            for i in range(6):
                sx, sy = x0 + 2 + int(noise(tx * 9 + i, ty, 64) * 11), y0 + 3 + int(noise(tx, ty * 9 + i, 65) * 10)
                for j in range(3 + i % 3):
                    c.px(sx + j // 2, sy - j, hex_rgb('#cdeeff') if j % 2 else hex_rgb('#8fc8e8'))

    def hazard(self, c, x0, y0, tx, ty):
        self.floor(c, x0, y0, tx, ty)
        c.disc(x0 + 8, y0 + 9, 6.5, hex_rgb('#6b2aa8'), squash=0.6)
        c.disc(x0 + 6, y0 + 8, 2, hex_rgb('#a46bff'), squash=0.6)
        c.px(x0 + 11, y0 + 10, hex_rgb('#cdeeff'))
        return False

    def entrance(self, c, x0, y0):
        c.rect(x0 + 1, y0, x0 + 14, y0 + 15, hex_rgb('#4b4258'))
        c.rect(x0 + 2, y0 + 1, x0 + 13, y0 + 15, hex_rgb('#6a6078'))
        c.rect(x0 + 7, y0 + 1, x0 + 8, y0 + 15, hex_rgb('#29233a'))
        for x in range(x0 + 2, x0 + 14):
            c.px(x, y0 + 1, hex_rgb('#ffd23f') if (x // 2) % 2 else hex_rgb('#1a1424'))

    def legendary(self, c, x0, y0, tx, ty):
        # Mewtwo's containment tank: the base and back glass under it, broken front glass over it.
        self.floor(c, x0, y0, tx, ty)
        c.disc(x0 + 8, y0 + 12, 9, hex_rgb('#6a6078'), squash=0.4)
        c.disc(x0 + 8, y0 + 12, 7.5, hex_rgb('#4b4258'), squash=0.4)
        c.disc(x0 + 8, y0 + 12, 6, hex_rgb('#a46bff'), squash=0.35)
        # The back glass, lit purple from inside, and the pipes feeding the tank.
        for y in range(y0 - 22, y0 + 11):
            for x in range(x0, x0 + 16):
                c.px(x, y, (164, 107, 255, 70))
            for x in (x0, x0 + 15):
                c.px(x, y, (205, 238, 255, 200))
        c.rect(x0 - 1, y0 - 26, x0 + 16, y0 - 22, hex_rgb('#4b4258'), 'top')
        c.rect(x0 - 1, y0 - 26, x0 + 16, y0 - 26, hex_rgb('#6a6078'), 'top')
        c.rect(x0 + 4, y0 - 30, x0 + 5, y0 - 27, hex_rgb('#29233a'), 'top')
        c.rect(x0 + 10, y0 - 30, x0 + 11, y0 - 27, hex_rgb('#29233a'), 'top')
        # What is left of the front glass: jagged shards rising from the base at both sides.
        for x in range(x0, x0 + 16):
            edge = min(x - x0, x0 + 15 - x)
            if edge > 4:
                continue
            height = 4 + int(noise(x, y0, 66) * 8) + (4 - edge) * 3
            for y in range(y0 + 11 - height, y0 + 11):
                c.px(x, y, (205, 238, 255, 170 if edge in (0, 2) else 90), 'top')


THEMES = {'outer-space': Space(), 'ozone-layer': Sky(), 'distortion-world': Distortion(), 'nightmare-realm': Nightmare(),
          'bubble-playroom': Playroom(), 'cell-hollow': Cells(), 'cinnabar-lab': Lab()}


def draw(lair_id):
    """The lair's ground and top images (16 px tiles) and its parsed layout."""
    rows = LAYOUTS[lair_id]
    theme = THEMES[lair_id]
    cols, count = len(rows[0]), len(rows)
    c = Canvas(cols, count)
    at = lambda x, y: rows[y][x] if 0 <= y < count and 0 <= x < cols else '#'
    solid_ground = lambda ch: ch in '.XLE'
    for y in range(c.height):
        for x in range(c.width):
            theme.void(c, x, y)
    theme.decorate(c, rows)
    # Back to front, so a tile's top layer can reach over the row above.
    for ty in range(count):
        for tx in range(cols):
            ch, x0, y0 = at(tx, ty), tx * T, ty * T
            if ch == '#':
                if not theme.platform:
                    theme.wall(c, x0, y0, tx, ty)
                elif solid_ground(at(tx, ty - 1)):
                    cliff(c, x0, y0, theme.face, theme.face_dark)
            elif ch == '~':
                if theme.hazard(c, x0, y0, tx, ty) and solid_ground(at(tx, ty - 1)):
                    cliff(c, x0, y0, theme.face, theme.face_dark)
            elif ch == 'X':
                theme.obstacle(c, x0, y0, tx, ty)
            elif ch == 'L':
                theme.legendary(c, x0, y0, tx, ty)
            elif ch == 'E':
                if not theme.platform:
                    theme.wall(c, x0, y0, tx, ty)
                theme.entrance(c, x0, y0)
            else:
                theme.floor(c, x0, y0, tx, ty)
    find = lambda ch: next((x, y) for y, row in enumerate(rows) for x, value in enumerate(row) if value == ch)
    entrance = find('E')
    return c.ground, c.top, {'rows': rows, 'legendary': find('L'), 'entrance': entrance, 'start': (entrance[0], entrance[1] - 1)}
