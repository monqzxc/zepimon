"""Zepimon's running outfit for Brendan and May, drawn over Emerald's 16 x 32 overworld frames (walking and running).

Both get black hair, a purple running visor (a band with an open top, so the hair spikes out through it), no bag, white
running shoes and a sporty kit: Brendan a black tee with purple trim, May a purple top over a black pleated skirt.

Emerald's sheets reuse palette indices across body parts (the same red is a glove, a stripe and a shoe), so each pixel
is sorted by its index and where it is in its frame: the head (rows to HEAD_END), the body and the feet. A few frames
need a hand-placed touch, listed in PATCHES.
"""

# New colours.
HAIR_OUT, HAIR, HAIR_HI = (0x10, 0x10, 0x18), (0x2C, 0x2C, 0x3A), (0x5A, 0x5C, 0x74)
PURPLE_LIGHT, PURPLE, PURPLE_DARK = (0xA4, 0x74, 0xEE), (0x6A, 0x3F, 0xC8), (0x45, 0x27, 0x8E)
BLACK, DARK_GREY = (0x28, 0x28, 0x30), (0x48, 0x48, 0x56)
WHITE, WHITE_SHADE, SOLE = (0xF8, 0xF8, 0xF8), (0xCE, 0xCE, 0xDE), (0x9A, 0x9A, 0xAE)
OUTLINE = (0x00, 0x00, 0x00)

CLEAR, KEEP = None, 'keep'
F = 15            # Emerald's black outline index
HEAD_END = 21     # the last row that can be head (hat, hair, face) in any frame


def recolour(name, sheet, frame, indices, palette, standing_top):
    """indices: 32 rows of 16 palette indices (0 is clear); standing_top: the first row the standing frame facing the
    same way starts on (a stepping frame bobs a row lower, face and all). Returns 32 rows of RGB tuples or None."""
    rows = [list(row) for row in indices]
    base = [[tuple(palette[i * 3:i * 3 + 3]) if i else None for i in row] for row in rows]
    head_end = HEAD_END + top(rows) - standing_top
    out = (brendan if name == 'brendan' else may)(sheet, frame, rows, base, head_end)
    for (x, y), colour in PATCHES.get((name, sheet, frame), {}).items():
        out[y][x] = colour
    return out


def top(rows):
    return min(y for y, row in enumerate(rows) if any(row))


def bottom(rows):
    return max(y for y, row in enumerate(rows) if any(row))


def band_span(row, members):
    xs = [x for x, i in enumerate(row) if i in members]
    return (min(xs), max(xs)) if xs else None


def tidy_outline(out, removed):
    """After clearing pixels (a bag): drop outline left floating, then outline the newly bare edge."""
    h, w = len(out), len(out[0])
    near = lambda x, y: [(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                         if (dx or dy) and 0 <= x + dx < w and 0 <= y + dy < h]
    for _ in range(2):
        for y in range(h):
            for x in range(w):
                if out[y][x] == OUTLINE and any(p in removed for p in near(x, y)) and \
                        not any(out[j][i] not in (None, OUTLINE) for i, j in near(x, y)):
                    out[y][x] = None
                    removed.add((x, y))
    for x, y in list(removed):
        if out[y][x] is None and any(out[j][i] not in (None, OUTLINE)
                                     for i, j in [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)] if 0 <= i < w and 0 <= j < h):
            out[y][x] = OUTLINE


def visor(rows, out, band, light, dark, logo, logo_shade, head_end, dark_bill=True):
    """The band of Emerald's hat or bandana becomes the visor: light above, its bill dark along the bottom row, with
    the hat's emblem kept as a white mark. Returns the bottom row of the band."""
    band_rows = [y for y in range(head_end + 1) if band_span(rows[y], band)]
    if not band_rows:
        return None
    last = band_rows[-1]
    for y in band_rows:
        left, right = band_span(rows[y], band)
        for x in range(left, right + 1):
            i = rows[y][x]
            if i in band:
                out[y][x] = PURPLE_DARK if y == last and dark_bill else (PURPLE_LIGHT if i == light else PURPLE)
            elif i == logo:
                out[y][x] = WHITE
            elif i == logo_shade:
                out[y][x] = PURPLE_DARK if y == last else PURPLE
    return last


def brim(rows, out, last, facing_left):
    """A side view's bill, poking out a pixel or two in front of the band, where the frame has room."""
    left, right = band_span(rows[last], {10, 11, 12, 13, 14, 9}) or (None, None)
    if left is None:
        return
    x = left if facing_left else right
    step = -1 if facing_left else 1
    for k in (1, 2):
        nx = x + step * k
        if 0 <= nx < 16 and out[last][nx] is None:
            out[last][nx] = PURPLE_DARK if k == 1 else OUTLINE


# Brendan: 5 hat outline, 9/14 hat white, 10/11 hat band (and bag), 12/13 red (gloves, stripes, shoes),
# 8 shirt, 4 brown shade, 6/7 dark (running soles), 1-3 skin.
def brendan(sheet, frame, rows, base, head_end):
    out = [r[:] for r in base]
    north = frame in (1, 5, 6)
    west = frame in (2, 7, 8)
    foot = bottom(rows)
    # Head: the white hat becomes black hair, its green band a purple visor.
    last = visor(rows, out, {10, 11}, 10, 11, 14, 9, head_end)
    for y in range(head_end + 1):
        for x in range(16):
            if out[y][x] != base[y][x]:
                continue
            i = rows[y][x]
            if i == 5:
                out[y][x] = HAIR_OUT
            elif i == 9:
                out[y][x] = HAIR
            elif i == 14:
                out[y][x] = HAIR_HI
            elif i == 8:
                out[y][x] = HAIR
            elif i == 4 and (x <= 2 or x >= 13):
                out[y][x] = HAIR
    if north:
        # The visor's strap across the back of the head: the hat's lowest full row.
        for y in range(head_end + 1):
            row = rows[y]
            if sum(i == 9 for i in row) >= 6 and 8 in row:
                left, right = band_span(row, {8, 9})
                for x in range(left, right + 1):
                    out[y][x] = PURPLE_DARK
                for x in range(left, right + 1):
                    if rows[y - 1][x] in (9, 14):
                        out[y - 1][x] = PURPLE
                break
    if west and last is not None:
        brim(rows, out, last, facing_left=True)
    # Body: a black tee and shorts with purple trim, no bag, white shoes.
    removed = set()
    for y in range(head_end + 1, 32):
        for x in range(16):
            i = rows[y][x]
            if not i:
                continue
            shoe = y >= foot - 1 or (y >= foot - 2 and i in (12, 13, 6, 7))
            if shoe and i != F:
                out[y][x] = WHITE if i in (12, 13, 14, 9, 10, 1) else WHITE_SHADE if i in (11, 4, 3, 2, 5) else SOLE
            elif i in (10, 11, 14, 9):
                if north:
                    out[y][x] = PURPLE
                else:
                    out[y][x] = None
                    removed.add((x, y))
            elif i == 8:
                out[y][x] = PURPLE
            elif i == 4:
                out[y][x] = PURPLE_DARK
            elif i == 12:
                out[y][x] = WHITE
            elif i == 13:
                out[y][x] = WHITE_SHADE
            elif i in (6, 7):
                out[y][x] = DARK_GREY
    tidy_outline(out, removed)
    return out


# May: 8 hair outline, 7 hair, 4 hair shade (and skin edge), 10/11 bandana (and bag), 14/9 white (bandana, gloves),
# 12/13 red top (and shoes), 6 shorts, 5 grey, 1-3 skin.
def may(sheet, frame, rows, base, head_end):
    out = [r[:] for r in base]
    north = frame in (1, 5, 6)
    west = frame in (2, 7, 8)
    foot = bottom(rows)
    # Head: brown hair to black, the green bandana to a purple sports band.
    last = visor(rows, out, {10, 11}, 10, 11, 14, 9, head_end, dark_bill=False)
    for y in range(head_end + 1):
        for x in range(16):
            if out[y][x] != base[y][x]:
                continue
            i = rows[y][x]
            if i == 8:
                out[y][x] = HAIR_OUT
            elif i == 7:
                out[y][x] = HAIR
            elif i == 4 and (north or y < 17 or x in (0, 1, 2, 13, 14, 15)):
                out[y][x] = HAIR
            elif i in (1, 2) and 0 < x < 15 and rows[y][x - 1] in (7, 8) and rows[y][x + 1] in (7, 8):
                # Emerald lights her brown hair with skin tones; on black hair that reads as a freckle.
                out[y][x] = HAIR_HI
            elif i in (14, 9) and y < 17:
                out[y][x] = WHITE if i == 14 else WHITE_SHADE
            elif i == 5 and y < 17:
                out[y][x] = HAIR_OUT
    if west and last is not None:
        brim(rows, out, last, facing_left=True)
    # The hole: the band's crown, between the knots, shows hair instead.
    if last is not None:
        for y in range(head_end + 1):
            if y < last:
                for x in range(6, 10):
                    if rows[y][x] in (10, 11, 5, 14, 9):
                        out[y][x] = HAIR_HI if rows[y][x] == 10 else HAIR
    # Body: a purple top, the bag gone, a black pleated skirt from the waist, bare legs, white shoes.
    waist = next((y for y in range(head_end + 2, foot - 1) if band_span(rows[y], {10, 11})), foot - 3)
    skirt_end = min(waist + 2, foot - 2)
    skirt = []
    for y in range(head_end + 1, 32):
        for x in range(16):
            i = rows[y][x]
            if not i:
                continue
            if y >= foot - 1 and i != F:
                out[y][x] = WHITE if i in (12, 13, 14, 9, 10, 1) else WHITE_SHADE if i in (11, 4, 3, 2, 5) else SOLE
            elif waist <= y <= skirt_end and i not in (F, 1, 2, 3, 14, 9):
                out[y][x] = PURPLE if y == skirt_end else (DARK_GREY if (x + y) % 3 == 0 else BLACK)
                skirt.append((x, y))
            elif y > skirt_end and i != F:
                out[y][x] = (0xFF, 0xDE, 0xCD) if i in (1, 9, 14) else (0xDE, 0xA4, 0x94)
            elif i in (10, 11):
                out[y][x] = PURPLE
            elif i == 12:
                out[y][x] = PURPLE_LIGHT
            elif i in (13, 6, 7):
                out[y][x] = PURPLE
            elif i in (8, 4, 5):
                out[y][x] = PURPLE_DARK
    # Flare: the hem a pixel wider each side of each run of skirt.
    hem = sorted(x for x, y in skirt if y == skirt_end)
    if hem:
        for x, step in ((hem[0], -1), (hem[-1], 1)):
            nx = x + step
            if 0 <= nx < 16 and out[skirt_end][nx] in (None, OUTLINE):
                out[skirt_end][nx] = PURPLE
                for ox, oy in ((nx + step, skirt_end), (nx, skirt_end - 1), (nx, skirt_end + 1)):
                    if 0 <= ox < 16 and out[oy][ox] is None:
                        out[oy][ox] = OUTLINE
    return out


# Hand-placed fixes, (name, sheet, frame) -> {(x, y): colour}. None needed yet.
PATCHES = {}
