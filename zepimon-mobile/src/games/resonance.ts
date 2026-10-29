import { RESONANCE_SEALS } from '../expedition-encounter.ts'
import type { SealId } from '../expedition-encounter.ts'
import { STEPS, isWalkable, pointKey, safariMap, tileAt } from './safari-zone.ts'
import type { Direction, Point, SafariMap } from './safari-zone.ts'

// The Legendary Resonance Trial's arena, kept free of React so its rules can be tested. It is a 9 × 9 clearing of the
// real Safari Zone map by the lake: the same terrain, collision, walking and tap-to-walk (src/games/safari-zone.ts), with
// everything outside the clearing walled off and the Legendary standing in its middle. The player switches on four
// ancient seals, each a small, gentle challenge, while the Legendary sends readable, telegraphed attacks:
// - wave: touching the seal calls an energy wave over the whole clearing but one safe tile (◎); stand on it when it lands.
// - runes: touching the seal lights three numbered runes; step on them in order (a rune out of turn simply doesn't count).
// - pulse: stand on the seal and press Resonate while its shrinking ring is in the gold band. The Legendary holds still.
// - stones: touching the seal wakes three guardian stones; step on each, in any order.
// Attacks are a ring around you or a line through you, marked for WARN_MS before they land, and they only hit the exact
// tiles marked, at the moment they land. A hit costs one resonance and a short stagger; at none, the Legendary holds back
// while you recover in full. Nothing here ever turns a seal off. Times are passed in (ms), so the rules run on a test
// clock as well as the screen's.
export const ARENA = { left: 32, top: 20, width: 9, height: 9 }
export const LEGENDARY_AT: Point = { x: 36, y: 24 }
export const ARENA_START: Point = { x: 36, y: 28 }
export const SEAL_AT: Record<SealId, Point> = { wave: { x: 33, y: 21 }, runes: { x: 39, y: 21 }, pulse: { x: 33, y: 27 }, stones: { x: 39, y: 27 } }
export const RUNES: Point[] = [{ x: 35, y: 26 }, { x: 37, y: 22 }, { x: 38, y: 25 }]
export const STONES: Point[] = [{ x: 32, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 28 }]
// The wave's safe tile is one of these, three or four steps from its seal.
export const WAVE_SAFE: Point[] = [{ x: 36, y: 20 }, { x: 33, y: 24 }, { x: 35, y: 23 }]
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

const inArena = (point: Point) => point.x >= ARENA.left && point.x < ARENA.left + ARENA.width && point.y >= ARENA.top && point.y < ARENA.top + ARENA.height
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y
// The Safari map with everything outside the clearing, and the Legendary's own tile, turned to wall.
export const arenaMap: SafariMap = { ...safariMap,
  tiles: safariMap.tiles.map((row, y) => [...row].map((tile, x) => inArena({ x, y }) && !same({ x, y }, LEGENDARY_AT) ? tile : '#').join('')) }
const ground: Point[] = []
for (let y = ARENA.top; y < ARENA.top + ARENA.height; y++) for (let x = ARENA.left; x < ARENA.left + ARENA.width; x++) {
  if (isWalkable(tileAt({ x, y }, arenaMap))) ground.push({ x, y })
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
  at: Point, facing: Direction, buddy: Point, buddyFacing: Direction, seals: SealId[], resonance: number, maxResonance: number,
  staggerUntil: number, recoverUntil: number, danger: Danger | null, nextAttackAt: number,
  wave: { safe: Point } | null, pulse: { since: number } | null, runes: number | null, stones: number[] | null,
  paused: boolean, message: string, feedback: Feedback, feedbackId: number
}
export type ArenaResult = { arena: Arena, completed: SealId | null }

export function startArena(seals: readonly SealId[], max: number, now: number): Arena {
  const arena: Arena = { at: ARENA_START, facing: 'north', buddy: ARENA_START, buddyFacing: 'north', seals: [...seals], resonance: max, maxResonance: max,
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
  if (arena.stones !== null) parts.push(`${STONES.length - arena.stones.length} guardian stone${STONES.length - arena.stones.length === 1 ? '' : 's'} still asleep`)
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
    const safe = WAVE_SAFE[Math.min(WAVE_SAFE.length - 1, Math.floor(random() * WAVE_SAFE.length))]
    const tiles = ground.filter(point => !same(point, safe)).map(pointKey)
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
  if (!isWalkable(tileAt(next, arenaMap))) {
    const why = same(next, LEGENDARY_AT) ? 'The Legendary stands its ground. Switch on the seals around it.'
      : inArena(next) ? 'Something is in the way.' : 'The seals’ glow keeps you inside the clearing.'
    return { arena: say(turned, why), completed: null, move: 'bump' }
  }
  let moved: Arena = { ...turned, at: next, buddy: arena.at, buddyFacing: direction }
  if (moved.pulse && !same(next, SEAL_AT.pulse)) moved = say({ ...moved, pulse: null }, 'You stepped off the Pulse Seal. Stand on it to try again.')
  const seal = RESONANCE_SEALS.find(id => same(next, SEAL_AT[id]))
  if (seal && !(moved.wave && seal !== 'wave')) moved = touchSeal(moved, seal, now, random)
  const rune = RUNES.findIndex(point => same(point, next))
  if (rune >= 0 && moved.runes !== null) {
    if (rune === moved.runes) {
      moved = { ...moved, runes: rune + 1 }
      if (moved.runes === RUNES.length) return { ...switchOn(moved, 'runes'), move: 'step' }
      moved = say(moved, `Rune ${rune + 1} glows. ${objective(moved)}`)
    } else if (rune > moved.runes) moved = say(moved, `That is rune ${rune + 1}: find rune ${moved.runes + 1} first.`)
  }
  const stone = STONES.findIndex(point => same(point, next))
  if (stone >= 0 && moved.stones !== null && !moved.stones.includes(stone)) {
    const stones = [...moved.stones, stone]
    moved = { ...moved, stones }
    if (stones.length === STONES.length) return { ...switchOn(moved, 'stones'), move: 'step' }
    moved = say(moved, `A guardian stone wakes. ${objective(moved)}`)
  }
  return { arena: moved, completed: null, move: 'step' }
}

// The Legendary's next attack, aimed where you stand: a ring around you or a line through you.
function aim(arena: Arena, now: number, random: () => number): Danger {
  const roll = random()
  const tiles = ground.filter(point => roll < 0.5 ? Math.abs(point.x - arena.at.x) <= 1 && Math.abs(point.y - arena.at.y) <= 1
    : roll < 0.75 ? point.y === arena.at.y : point.x === arena.at.x).map(pointKey)
  return { kind: roll < 0.5 ? 'ring' : 'line', tiles, safe: null, warnUntil: now + WARN_MS, strikeUntil: now + WARN_MS + STRIKE_MS, struck: false }
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
  if (arena.paused || !arena.pulse || !same(arena.at, SEAL_AT.pulse)) return { arena: say(arena, 'Stand on the Pulse Seal to resonate.'), completed: null }
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
