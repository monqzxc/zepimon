// Hand-drawn pixel sprites for the expedition's puzzle pieces (the lair's seals and marks, the shrine lanterns) and the
// mission badges, drawn on the GBA's 16-pixel grid so they sit beside the Emerald art. Kept free of React so their
// shapes can be tested: each sprite is layers of equal-length rows, one character per pixel, '.' transparent, and a
// palette maps every other character to a colour. Later layers draw over earlier ones. Swapping the palette gives a
// sprite's states (a seal off and on, a lantern dark and lit), so the outline never changes between them.
export type Palette = Record<string, string>
export type PixelSprite = { width: number, height: number, layers: string[][] }
// One horizontal run of a colour: what the renderer draws, so a 16 x 16 sprite is a few dozen rectangles, not 256.
export type Run = { x: number, y: number, length: number, char: string }

const sprite = (...layers: string[][]): PixelSprite => ({ width: layers[0][0].length, height: layers[0].length, layers })

// The runs of every non-transparent pixel, top layer last so it draws on top.
export function runsOf(art: PixelSprite): Run[] {
  const runs: Run[] = []
  for (const layer of art.layers) layer.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const char = row[x]
      let end = x + 1
      while (end < row.length && row[end] === char) end++
      if (char !== '.') runs.push({ x, y, length: end - x, char })
      x = end
    }
  })
  return runs
}

// An 8 x 8 glyph set into the middle of a 16 x 16 sprite.
const centred = (glyph: string[]) => [
  ...Array.from({ length: 4 }, () => '.'.repeat(16)),
  ...glyph.map(row => `....${row}....`),
  ...Array.from({ length: 4 }, () => '.'.repeat(16))
]
// A 3 x 5 digit doubled to 6 x 10, set into the middle of a 16 x 16 sprite.
const DIGITS: Record<string, string[]> = {
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.']
}
const digit = (n: number, char: string) => {
  const big = DIGITS[n].flatMap(row => {
    const wide = [...row].map(cell => (cell === '#' ? char : '.').repeat(2)).join('')
    return [wide, wide]
  })
  return [
    ...Array.from({ length: 3 }, () => '.'.repeat(16)),
    ...big.map(row => `.....${row}.....`),
    ...Array.from({ length: 3 }, () => '.'.repeat(16))
  ]
}

// ---- The lair (src/games/ResonanceTrial.tsx) ----

// A carved seal tablet: outline o, lit edge L, face M, shadow side D; the seal's own glyph (g, highlight h) on top.
const TABLET = [
  '................',
  '.....oooooo.....',
  '...ooLLLLLLoo...',
  '..oLLLLLLLLLLo..',
  '.oLLMMMMMMMMLLo.',
  '.oLMMMMMMMMMMDo.',
  'oLLMMMMMMMMMMDDo',
  'oLMMMMMMMMMMMMDo',
  'oLMMMMMMMMMMMMDo',
  'oLMMMMMMMMMMMMDo',
  'oLLMMMMMMMMMMDDo',
  '.oLMMMMMMMMMMDo.',
  '.oDDMMMMMMMMDDo.',
  '..oDDDDDDDDDDo..',
  '...ooDDDDDDoo...',
  '.....oooooo.....'
]
const SEAL_GLYPHS = {
  wave: ['........', '.gg..gg.', 'g..gg..g', '........', '.gg..gg.', 'g..gg..g', '........', '........'],
  runes: ['...gg...', '..g..g..', '.g....g.', '..g..g..', '...gg...', '..g..g..', '.g....g.', 'g......g'],
  pulse: ['..gggg..', '.g....g.', 'g..hh..g', 'g.h..h.g', 'g.h..h.g', 'g..hh..g', '.g....g.', '..gggg..'],
  stones: ['...gg...', '...hg...', '..ghgg..', '..hggg..', '.ghgggg.', '.hggggg.', 'gggggggg', '........']
}
export const SEAL_SPRITES = Object.fromEntries(Object.entries(SEAL_GLYPHS).map(([id, glyph]) => [id, sprite(TABLET, centred(glyph))])) as
  Record<keyof typeof SEAL_GLYPHS, PixelSprite>
export const SEAL_OFF: Palette = { o: '#2C3833', L: '#C3CDBF', M: '#93A196', D: '#5D6B62', g: '#3E4A44', h: '#2C3833' }
export const SEAL_ON: Palette = { o: '#5A3A00', L: '#FFE9A0', M: '#F2C230', D: '#B7861A', g: '#FFFFFF', h: '#FFF4B8' }

// A rune circle on the floor (ring q, outline p, a dim fill f) with its number n.
const RUNE_PLATE = [
  '................',
  '.....pppppp.....',
  '...ppqqqqqqpp...',
  '..pqqffffffqqp..',
  '..pqffffffffqp..',
  '.pqffffffffffqp.',
  '.pqffffffffffqp.',
  '.pqffffffffffqp.',
  '.pqffffffffffqp.',
  '.pqffffffffffqp.',
  '.pqffffffffffqp.',
  '..pqffffffffqp..',
  '..pqqffffffqqp..',
  '...ppqqqqqqpp...',
  '.....pppppp.....',
  '................'
]
export const RUNE_SPRITES = [1, 2, 3].map(n => sprite(RUNE_PLATE, digit(n, 'n')))
export const RUNE_WAITING: Palette = { p: '#2A1550', q: '#B58CFF', f: 'rgba(60, 30, 110, 0.6)', n: '#FFFFFF' }
export const RUNE_DONE: Palette = { p: '#173D22', q: '#7FE0A0', f: 'rgba(30, 90, 50, 0.6)', n: '#D8FFE4' }

// A guardian stone: a standing obelisk with an eye e that wakes, on a shadow s.
export const GUARDIAN_STONE = sprite([
  '................',
  '......oooo......',
  '.....oLLMDo.....',
  '.....oLMMDo.....',
  '....oLLMMDDo....',
  '....oLMMMMDo....',
  '....oLMeeMDo....',
  '....oLMeeMDo....',
  '....oLMMMMDo....',
  '...oLLMMMMDDo...',
  '...oLMMMMMMDo...',
  '...oLMMMMMMDo...',
  '..oLLMMMMMMDDo..',
  '..oooooooooooo..',
  '.ssssssssssssss.',
  '................'
])
export const STONE_ASLEEP: Palette = { o: '#2C3833', L: '#A9B3A6', M: '#7D8A80', D: '#4E5A52', e: '#3A453F', s: 'rgba(0, 0, 0, 0.3)' }
export const STONE_AWAKE: Palette = { o: '#0E3B36', L: '#B8F5E6', M: '#5FCDB4', D: '#2E8C7A', e: '#FFFFFF', s: 'rgba(95, 205, 180, 0.35)' }

// Danger: a warning sign (⚠, marked before an attack lands) and the strike's burst (✸, as it lands).
export const WARNING = sprite([
  '................',
  '.......oo.......',
  '......oyyo......',
  '......oyyo......',
  '.....oyyyyo.....',
  '.....oyKKyo.....',
  '....oyyKKyyo....',
  '....oyyKKyyo....',
  '...oyyyKKyyyo...',
  '...oyyyKKyyyo...',
  '..oyyyyyyyyyyo..',
  '..oyyyyKKyyyyo..',
  '.oyyyyyKKyyyyyo.',
  '.oyyyyyyyyyyyyo.',
  '.oooooooooooooo.',
  '................'
])
export const WARNING_COLOURS: Palette = { o: '#5A2A00', y: '#FFC93C', K: '#1A1200' }
export const STRIKE = sprite([
  '................',
  '.......w........',
  '..r....w....r...',
  '...r...w...r....',
  '....r.RwR.r.....',
  '.....RRWRR......',
  '....RRWWWRR.....',
  '.wwwwWWWWWwwwww.',
  '....RRWWWRR.....',
  '.....RRWRR......',
  '....r.RwR.r.....',
  '...r...w...r....',
  '..r....w....r...',
  '.......w........',
  '................',
  '................'
])
export const STRIKE_COLOURS: Palette = { w: '#FFE27A', W: '#FFFFFF', R: '#FF5A3C', r: '#C8261E' }
// The wave's safe tile (◎): two bright rings around a calm centre.
export const SAFE = sprite([
  '................',
  '.....cccccc.....',
  '...ccCCCCCCcc...',
  '..cCC......CCc..',
  '..cC..cccc..Cc..',
  '.cC..cCCCCc..Cc.',
  '.cC.cC....Cc.Cc.',
  '.cC.cC.WW.Cc.Cc.',
  '.cC.cC.WW.Cc.Cc.',
  '.cC.cC....Cc.Cc.',
  '.cC..cCCCCc..Cc.',
  '..cC..cccc..Cc..',
  '..cCC......CCc..',
  '...ccCCCCCCcc...',
  '.....cccccc.....',
  '................'
])
export const SAFE_COLOURS: Palette = { c: '#0F5F4A', C: '#7FFFD4', W: '#FFFFFF' }

// ---- The shrine lanterns (src/games/ShrineLanterns.tsx) ----

// A stone tōrō: roof R (in the quest's type colour, highlight r), stone S, outline o; its window w holds a flame f/F
// that flickers between two frames when lit. Dark, the window and flame share one colour.
const LANTERN_TOP = [
  '......oooo......',
  '....ooRRRRoo....',
  '..ooRRrRRrRRoo..',
  '.oRRRRRRRRRRRRo.',
  'oooooooooooooooo',
  '..oSSSSSSSSSSo..'
]
const LANTERN_BASE = [
  '..oSSSSSSSSSSo..',
  '.oooooooooooooo.',
  '......oSSo......',
  '......oSSo......',
  '....ooSSSSoo....',
  '...oSSSSSSSSo...',
  '..oooooooooooo..',
  '................'
]
const flame = (rows: string[]) => [...LANTERN_TOP, ...rows.map(row => `..oSo${row}oSo..`), ...LANTERN_BASE]
export const LANTERN_FRAMES = [
  sprite(flame(['wwwwww', 'wwffww', 'wfFFfw', 'wfFFfw', 'wwffww', 'wwwwww'])),
  sprite(flame(['wwwfww', 'wwfFww', 'wfFFfw', 'wffFfw', 'wwffww', 'wwwwww']))
]
export const lanternColours = (roof: string, lit: boolean): Palette => lit
  ? { o: '#3A2A1A', R: roof, r: 'rgba(255, 255, 255, 0.45)', S: '#D8CFC0', w: '#FFD27A', f: '#FF8A1E', F: '#FFF6D0' }
  : { o: '#2A2420', R: roof, r: 'rgba(255, 255, 255, 0.25)', S: '#9C958A', w: '#1A1410', f: '#1A1410', F: '#1A1410' }

// ---- Mission badges (src/app/missions.tsx, src/QuestTiles.tsx) ----

// A medal on a ribbon: ribbon r/R, rim o, face G with highlight H and shade D, its emblem s (a star) in the middle.
export const MEDAL = sprite([
  '..rr........rr..',
  '..rRr......rRr..',
  '...rRr....rRr...',
  '....rRr..rRr....',
  '.....rRrrRr.....',
  '......oooo......',
  '....ooGGGGoo....',
  '...oGGHHGGGGo...',
  '..oGGHGGsGGGDo..',
  '..oGHGGsssGGDo..',
  '..oGGssssssGDo..',
  '..oGGGsssGGGDo..',
  '..oGGGsGsGGDDo..',
  '...oGGGGGGDDo...',
  '....ooDDDDoo....',
  '......oooo......'
])
// A padlock for a secret badge not found yet.
export const PADLOCK = sprite([
  '................',
  '.....oooooo.....',
  '....oLLLLLLo....',
  '...oLo....oLo...',
  '...oLo....oLo...',
  '...oLo....oLo...',
  '..oooooooooooo..',
  '..oHHHHHHHHHDo..',
  '..oHGGGGGGGGDo..',
  '..oHGGGkkGGGDo..',
  '..oHGGGkkGGGDo..',
  '..oHGGGGkGGGDo..',
  '..oHGGGGGGGGDo..',
  '..oDDDDDDDDDDo..',
  '..oooooooooooo..',
  '................'
])
export type BadgeState = 'earned' | 'progress' | 'locked'
export const MEDAL_COLOURS: Record<Exclude<BadgeState, 'locked'>, Palette> = {
  earned: { r: '#B8322A', R: '#FF7A6E', o: '#5A3A00', G: '#F2C230', H: '#FFF1A8', D: '#B7861A', s: '#FFFFFF' },
  progress: { r: '#2E6F8E', R: '#7CC6E8', o: '#0E3B36', G: '#5FCDB4', H: '#C9F7EA', D: '#2E8C7A', s: '#E8FFF8' }
}
export const PADLOCK_COLOURS: Palette = { o: '#2C3833', L: '#A9B3A6', H: '#C3CDBF', G: '#93A196', D: '#5D6B62', k: '#2C3833' }
