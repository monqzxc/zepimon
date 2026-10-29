import { RESONANCE_SEALS } from '../expedition-encounter.ts'
import type { SealId } from '../expedition-encounter.ts'
import { pokemonTypes } from '../generated/types.js'
import { ZONES } from './safari.ts'
import type { Zone } from './safari.ts'
import { LEDGES, STEPS, isWalkable, pointKey, reachableFrom, safariMap, tileAt } from './safari-zone.ts'
import type { Direction, Point, SafariMap } from './safari-zone.ts'

// The Legendary Resonance Trial's arena, kept free of React so its rules can be tested. It is a 9 × 9 clearing of the
// real Safari Zone map in the area where the Legendary's type lives, as the Safari Zone's own wild Pokemon do (ZONES in
// src/games/safari.ts): the meadow for Grass, Bug, Normal, Electric and Fairy, the lakeside for Water and Ice, the rocky
// mountain for Rock, Ground, Fighting, Steel, Fire and Dragon, and the night forest for Ghost, Dark, Poison and Psychic.
// The same terrain, collision, walking and tap-to-walk (src/games/safari-zone.ts), with everything outside the clearing
// walled off and the Legendary standing in its middle. The player switches on four ancient seals, each a small, gentle
// challenge, while the Legendary sends readable, telegraphed attacks:
// - wave: touching the seal calls an energy wave over the whole clearing but one safe tile (◎); stand on it when it lands.
// - runes: touching the seal lights three numbered runes; step on them in order (a rune out of turn simply doesn't count).
// - pulse: stand on the seal and press Resonate while its shrinking ring is in the gold band. The Legendary holds still.
// - stones: touching the seal wakes three guardian stones; step on each, in any order.
// Attacks are a ring around you or a line through you, marked for WARN_MS before they land, and they only hit the exact
// tiles marked, at the moment they land. A hit costs one resonance and a short stagger; at none, the Legendary holds back
// while you recover in full. Nothing here ever turns a seal off. Times are passed in (ms), so the rules run on a test
// clock as well as the screen's.
export const ARENA_SIZE = 9
export type ArenaLayout = {
  zone: Zone, label: string, left: number, top: number, legendary: Point, start: Point, seals: Record<SealId, Point>,
  runes: Point[], stones: Point[], waveSafe: Point[], map: SafariMap, ground: Point[]
}
// Each area's clearing, by its top-left corner.
const CLEARINGS: Record<Zone, Point> = { meadow: { x: 5, y: 29 }, lake: { x: 32, y: 20 }, mountain: { x: 7, y: 2 }, night: { x: 24, y: 10 } }
// Where each mark goes, from the clearing's corner: the Legendary in the middle, a seal near each corner, the runes and
// the wave's safe tiles around the Legendary, the stones in three corners. A mark that lands on a tree or rock moves to
// the nearest open tile instead, so every clearing keeps the same shape of challenge.
const PLAN = {
  legendary: [4, 4], start: [4, 8], seals: { wave: [1, 1], runes: [7, 1], pulse: [1, 7], stones: [7, 7] } as Record<SealId, [number, number]>,
  runes: [[3, 6], [5, 2], [6, 5]], stones: [[0, 0], [8, 0], [8, 8]], waveSafe: [[4, 0], [1, 4], [3, 3]]
} as const
export const SEAL_NAMES: Record<SealId, string> = { wave: 'Wave', runes: 'Rune', pulse: 'Pulse', stones: 'Stone' }

export const WARN_MS = 1800
export const STRIKE_MS = 500
export const WAVE_WARN_MS = 3200
export const STAGGER_MS = 700
export const RECOVER_MS = 3500
export const FIRST_ATTACK_MS = 3000
export const PULSE_PERIOD = 2400
// The gold band, as a share of the ring's cycle: about 0.8 s of every 2.4 s.
export const PULSE_WINDOW: [number, number] = [0.55, 0.9]
const GAP_MS = 2600
const GAP_SPREAD_MS = 1400

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y
export const insideArena = (layout: Pick<ArenaLayout, 'left' | 'top'>, point: Point) =>
  point.x >= layout.left && point.x < layout.left + ARENA_SIZE && point.y >= layout.top && point.y < layout.top + ARENA_SIZE

function buildLayout(zone: Zone): ArenaLayout {
  const { x: left, y: top } = CLEARINGS[zone]
  const at = ([dx, dy]: readonly [number, number]): Point => ({ x: left + dx, y: top + dy })
  const legendary = at(PLAN.legendary)
  // The Safari map with everything outside the clearing, any ledge in it and the Legendary's own tile turned to wall.
  const map: SafariMap = { ...safariMap, tiles: safariMap.tiles.map((row, y) => [...row].map((tile, x) =>
    insideArena({ left, top }, { x, y }) && !same({ x, y }, legendary) && !(tile in LEDGES) ? tile : '#').join('')) }
  const ground: Point[] = []
  for (let y = top; y < top + ARENA_SIZE; y++) for (let x = left; x < left + ARENA_SIZE; x++) if (isWalkable(tileAt({ x, y }, map))) ground.push({ x, y })
  const used = new Set<string>()
  const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
  // The open, reachable tile nearest a planned spot, not already taken (ties go to the upper-left, so it never varies).
  const place = (planned: readonly [number, number], reach?: Set<string>): Point => {
    const wanted = at(planned)
    const spot = ground.filter(point => !used.has(pointKey(point)) && (!reach || reach.has(pointKey(point))))
      .sort((a, b) => distance(a, wanted) - distance(b, wanted) || a.y - b.y || a.x - b.x)[0]
    if (!spot) throw new Error(`No room for every mark in the ${zone} arena.`)
    used.add(pointKey(spot))
    return spot
  }
  const start = place(PLAN.start)
  const reach = reachableFrom(start, map)
  const seals = Object.fromEntries(RESONANCE_SEALS.map(seal => [seal, place(PLAN.seals[seal], reach)])) as Record<SealId, Point>
  const runes = PLAN.runes.map(spot => place(spot, reach))
  const stones = PLAN.stones.map(spot => place(spot, reach))
  const waveSafe = PLAN.waveSafe.map(spot => place(spot, reach))
  return { zone, label: ZONES[zone].label, left, top, legendary, start, seals, runes, stones, waveSafe, map, ground }
}
export const ARENAS: Record<Zone, ArenaLayout> = { meadow: buildLayout('meadow'), lake: buildLayout('lake'), mountain: buildLayout('mountain'), night: buildLayout('night') }

// The arena for a Legendary: the Safari Zone area its type lives in. Any type no area lists (none of today's Legendaries)
// meets in the meadow.
export function arenaFor(name: string): ArenaLayout {
  const type = (pokemonTypes as Record<string, string>)[name.replace(/^Shiny /, '')]
  const zone = (Object.keys(ZONES) as Zone[]).find(id => ZONES[id].types.includes(type)) ?? 'meadow'
  return ARENAS[zone]
}

// Three resonance to start, and one more for each km of saved adventures this week (src/games/adventure.ts walkingBonus),
// up to five. Only saved, completed adventures count there, never distance still being recorded.
export function maxResonance(weekKm: number): number {
  return 3 + (Number.isFinite(weekKm) ? Math.min(2, Math.max(0, Math.floor(weekKm))) : 0)
}

// danger: the attack being telegraphed or landing. tiles are point keys; safe is the wave's one safe tile.
export type Danger = { kind: 'ring' | 'line' | 'wave', tiles: string[], safe: string | null, warnUntil: number, strikeUntil: number, struck: boolean }
export type Feedback = 'warn' | 'strike' | 'hit' | 'dodge' | 'seal' | 'miss' | 'recover' | null
// wave and pulse run one at a time; runes (the next rune's index) and stones (those awake) keep going while you roam.
export type Arena = {
  layout: ArenaLayout, at: Point, facing: Direction, buddy: Point, buddyFacing: Direction, seals: SealId[], resonance: number, maxResonance: number,
  staggerUntil: number, recoverUntil: number, danger: Danger | null, nextAttackAt: number,
  wave: { safe: Point } | null, pulse: { since: number } | null, runes: number | null, stones: number[] | null,
  paused: boolean, message: string, feedback: Feedback, feedbackId: number
}
export type ArenaResult = { arena: Arena, completed: SealId | null }

export function startArena(layout: ArenaLayout, seals: readonly SealId[], max: number, now: number): Arena {
  const arena: Arena = { layout, at: layout.start, facing: 'north', buddy: layout.start, buddyFacing: 'north', seals: [...seals], resonance: max, maxResonance: max,
    staggerUntil: 0, recoverUntil: 0, danger: null, nextAttackAt: now + FIRST_ATTACK_MS, wave: null, pulse: null, runes: null, stones: null,
    paused: false, message: '', feedback: null, feedbackId: 0 }
  return { ...arena, message: objective(arena) }
}

const allOn = (arena: Arena) => RESONANCE_SEALS.every(seal => arena.seals.includes(seal))
// A new line for the player. Plain instructions carry no feedback mark, so a calm message never looks like a warning.
const say = (arena: Arena, message: string, feedback: Feedback = null): Arena =>
  ({ ...arena, message, feedback, feedbackId: feedback === arena.feedback && message === arena.message ? arena.feedbackId : arena.feedbackId + 1 })

// What to do next, in one line.
export function objective(arena: Arena): string {
  if (arena.wave) return 'An energy wave is coming: stand on the safe tile ◎ before it lands!'
  if (arena.pulse) return 'Hold still on the seal and press Resonate while the ring is in the gold band.'
  if (allOn(arena)) return 'Every seal is on. Steady the Legendary to open the catch.'
  const left = RESONANCE_SEALS.length - arena.seals.length
  const parts: string[] = []
  if (arena.runes !== null) parts.push(`step on rune ${arena.runes + 1}`)
  const asleep = arena.layout.stones.length - (arena.stones?.length ?? 0)
  if (arena.stones !== null) parts.push(`${asleep} guardian stone${asleep === 1 ? '' : 's'} still asleep`)
  return parts.length ? `${parts.join(' · ')} (${left} seal${left === 1 ? '' : 's'} left)` : `Walk onto a seal ◇ to wake it (${left} left).`
}

function switchOn(arena: Arena, seal: SealId): ArenaResult {
  const on: Arena = { ...arena, seals: [...arena.seals, seal], ...(seal === 'wave' && { wave: null }), ...(seal === 'pulse' && { pulse: null }),
    ...(seal === 'runes' && { runes: null }), ...(seal === 'stones' && { stones: null }) }
  const left = RESONANCE_SEALS.length - on.seals.length
  return { arena: say(on, `The ${SEAL_NAMES[seal]} Seal is on!${left ? ` ${left} to go.` : ' Every seal is glowing.'}`, 'seal'), completed: seal }
}

// Touching a seal that is still off starts its challenge. The wave and the pulse take over while they run.
function touchSeal(arena: Arena, seal: SealId, now: number, random: () => number): Arena {
  if (arena.seals.includes(seal)) return say(arena, `The ${SEAL_NAMES[seal]} Seal is already on. ${objective(arena)}`)
  if (seal === 'wave') {
    const choices = arena.layout.waveSafe
    const safe = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))]
    const tiles = arena.layout.ground.filter(point => !same(point, safe)).map(pointKey)
    const danger: Danger = { kind: 'wave', tiles, safe: pointKey(safe), warnUntil: now + WAVE_WARN_MS, strikeUntil: now + WAVE_WARN_MS + STRIKE_MS, struck: false }
    const next = { ...arena, wave: { safe }, pulse: null, danger }
    return say(next, objective(next), 'warn')
  }
  if (seal === 'pulse') {
    const next = { ...arena, pulse: { since: now }, danger: null, nextAttackAt: Math.max(arena.nextAttackAt, now + FIRST_ATTACK_MS) }
    return say(next, objective(next))
  }
  if (seal === 'runes') {
    if (arena.runes !== null) return say(arena, objective(arena))
    const next = { ...arena, runes: 0 }
    return say(next, `Three runes light up. ${objective(next)}`)
  }
  if (arena.stones !== null) return say(arena, objective(arena))
  const next = { ...arena, stones: [] }
  return say(next, `Three guardian stones ▲ stir. ${objective(next)}`)
}

// One press, from the step walker, the D-pad, the keys or a tap route. Blocked while paused, staggered or recovering.
export function arenaWalk(arena: Arena, direction: Direction, now: number, random: () => number): ArenaResult & { move: 'step' | 'bump' | 'none' } {
  if (arena.paused || now < arena.staggerUntil || now < arena.recoverUntil) return { arena, completed: null, move: 'none' }
  const turned = { ...arena, facing: direction }
  const next = { x: arena.at.x + STEPS[direction].x, y: arena.at.y + STEPS[direction].y }
  const { layout } = arena
  if (!isWalkable(tileAt(next, layout.map))) {
    const why = same(next, layout.legendary) ? 'The Legendary stands its ground. Switch on the seals around it.'
      : insideArena(layout, next) ? 'Something is in the way.' : 'The seals’ glow keeps you inside the clearing.'
    return { arena: say(turned, why), completed: null, move: 'bump' }
  }
  let moved: Arena = { ...turned, at: next, buddy: arena.at, buddyFacing: direction }
  if (moved.pulse && !same(next, layout.seals.pulse)) moved = say({ ...moved, pulse: null }, 'You stepped off the Pulse Seal. Stand on it to try again.')
  const seal = RESONANCE_SEALS.find(id => same(next, layout.seals[id]))
  if (seal && !(moved.wave && seal !== 'wave')) moved = touchSeal(moved, seal, now, random)
  const rune = layout.runes.findIndex(point => same(point, next))
  if (rune >= 0 && moved.runes !== null) {
    if (rune === moved.runes) {
      moved = { ...moved, runes: rune + 1 }
      if (moved.runes === layout.runes.length) return { ...switchOn(moved, 'runes'), move: 'step' }
      moved = say(moved, `Rune ${rune + 1} glows. ${objective(moved)}`)
    } else if (rune > moved.runes) moved = say(moved, `That is rune ${rune + 1}: find rune ${moved.runes + 1} first.`)
  }
  const stone = layout.stones.findIndex(point => same(point, next))
  if (stone >= 0 && moved.stones !== null && !moved.stones.includes(stone)) {
    const stones = [...moved.stones, stone]
    moved = { ...moved, stones }
    if (stones.length === layout.stones.length) return { ...switchOn(moved, 'stones'), move: 'step' }
    moved = say(moved, `A guardian stone wakes. ${objective(moved)}`)
  }
  return { arena: moved, completed: null, move: 'step' }
}

// The Legendary's next attack, aimed where you stand: a ring around you or a line through you.
function aim(arena: Arena, now: number, random: () => number): Danger {
  const roll = random()
  const { at, layout } = arena
  const shapes: Record<'ring' | 'row' | 'column', (point: Point) => boolean> = {
    ring: point => Math.abs(point.x - at.x) <= 1 && Math.abs(point.y - at.y) <= 1, row: point => point.y === at.y, column: point => point.x === at.x
  }
  const rolled = roll < 0.5 ? 'ring' : roll < 0.75 ? 'row' : 'column'
  // Rocks and trees can leave a nook a line would fill from end to end; there the Legendary aims another way, so every
  // attack leaves an unmarked tile two steps away at most.
  const shape = ([rolled, 'ring', 'row', 'column'] as const).map(id => ({ id, tiles: new Set(layout.ground.filter(shapes[id]).map(pointKey)) }))
    .find(({ tiles }) => clearWithin(layout.map, at, tiles, 2)) ?? { id: rolled, tiles: new Set(layout.ground.filter(shapes[rolled]).map(pointKey)) }
  return { kind: shape.id === 'ring' ? 'ring' : 'line', tiles: [...shape.tiles], safe: null, warnUntil: now + WARN_MS, strikeUntil: now + WARN_MS + STRIKE_MS, struck: false }
}

// Whether an unmarked tile is at most steps away on foot.
function clearWithin(map: SafariMap, from: Point, marked: Set<string>, steps: number): boolean {
  let edge = [from]
  const seen = new Set([pointKey(from)])
  for (let step = 0; step <= steps; step++) {
    if (edge.some(point => !marked.has(pointKey(point)))) return true
    edge = edge.flatMap(point => Object.values(STEPS).map(({ x, y }) => ({ x: point.x + x, y: point.y + y })))
      .filter(point => isWalkable(tileAt(point, map)) && !seen.has(pointKey(point)) && !!seen.add(pointKey(point)))
  }
  return false
}

function hit(arena: Arena, now: number, message: string): Arena {
  const resonance = Math.max(0, arena.resonance - 1)
  const out = resonance === 0
  return say({ ...arena, resonance, staggerUntil: now + STAGGER_MS, recoverUntil: out ? now + RECOVER_MS : arena.recoverUntil, pulse: null },
    out ? `${message} Out of resonance: catch your breath, the Legendary waits.` : message, 'hit')
}

// Time passing: telegraphs land, the wave resolves, recovery ends and the next attack is chosen. Nothing while paused.
export function arenaTick(arena: Arena, now: number, random: () => number): ArenaResult {
  if (arena.paused) return { arena, completed: null }
  let next = arena
  if (next.recoverUntil && now >= next.recoverUntil) {
    next = say({ ...next, resonance: next.maxResonance, recoverUntil: 0, nextAttackAt: now + GAP_MS }, `Resonance restored. ${objective(next)}`, 'recover')
  }
  const danger = next.danger
  if (danger && !danger.struck && now >= danger.warnUntil) {
    next = { ...next, danger: { ...danger, struck: true } }
    if (danger.kind === 'wave') {
      if (pointKey(next.at) === danger.safe) return switchOn(next, 'wave')
      next = hit({ ...next, wave: null }, now, 'The wave caught you. Step on the Wave Seal to try again.')
    } else if (danger.tiles.includes(pointKey(next.at))) next = hit(next, now, 'Hit! Resonance −1.')
    else next = say(next, `Dodged! ${objective(next)}`, 'dodge')
  }
  if (next.danger?.struck && now >= next.danger.strikeUntil) {
    next = { ...next, danger: null, nextAttackAt: now + GAP_MS + Math.floor(random() * GAP_SPREAD_MS) }
  }
  // The Legendary holds back while you recover, focus on the pulse or once every seal is on.
  if (!next.danger && !next.recoverUntil && !next.pulse && !allOn(next) && now >= next.nextAttackAt) {
    next = say({ ...next, danger: aim(next, now, random) }, 'Danger! The Legendary is charging: step off the marked tiles ⚠.', 'warn')
  }
  return { arena: next, completed: null }
}

// Where the pulse ring is in its cycle, 0 to 1.
export const pulsePhase = (pulse: { since: number }, now: number) => (((now - pulse.since) % PULSE_PERIOD) + PULSE_PERIOD) % PULSE_PERIOD / PULSE_PERIOD

export function resonate(arena: Arena, now: number): ArenaResult {
  if (arena.paused || !arena.pulse || !same(arena.at, arena.layout.seals.pulse)) return { arena: say(arena, 'Stand on the Pulse Seal to resonate.'), completed: null }
  const phase = pulsePhase(arena.pulse, now)
  if (phase >= PULSE_WINDOW[0] && phase <= PULSE_WINDOW[1]) return switchOn(arena, 'pulse')
  return { arena: say(arena, phase < PULSE_WINDOW[0] ? 'A little early: wait for the ring to reach the gold band.' : 'A little late: try on the next ring.', 'miss'), completed: null }
}

// The marked tiles, for drawing and for tests.
export const dangerTiles = (arena: Arena) => new Set(arena.danger?.tiles ?? [])

// Leaving the screen or the app: any attack in flight is dropped and a running wave is tried again later. Progress stays.
export function pauseArena(arena: Arena): Arena {
  return { ...arena, paused: true, danger: null, wave: null, pulse: null, staggerUntil: 0 }
}
export function resumeArena(arena: Arena, now: number): Arena {
  const next: Arena = { ...arena, paused: false, nextAttackAt: now + FIRST_ATTACK_MS, recoverUntil: arena.resonance === 0 ? now + RECOVER_MS : 0 }
  return say(next, objective(next))
}
