import { LAIRS, lairOf } from './lairs.ts'
import type { LairId } from './lairs.ts'
import { MOVES } from './battle.ts'
import { signatureMove } from './legendary-moves.ts'
import { battleType, eggMovesOf } from './roster.ts'
import { STEPS, isWalkable, pointKey, tileAt } from './safari-zone.ts'
import type { Direction, Point, SafariMap } from './safari-zone.ts'

// The Legendary battle, fought where the Legendary lives, with no cut to a battle screen. Kept free of React so its
// rules can be tested. The lair (src/games/lairs.ts) is a room from Pokemon Emerald, walked the Safari Zone's way
// (src/games/safari-zone.ts), with the Legendary standing in it at its real size (legendarySize). Until the battle
// begins the Legendary only watches, and stepping back onto the one-way portal you came through is the shiny reset
// (move 'reset'). The first move or Poke Ball begins the battle and sets the result for good (onward the portal is a wall).
//
//   watch → fight → down (its HP is gone) → throw (the ball's capture plays out) → caught
// caught is final.
//
// Your partner's moves wear the Legendary down to 0 HP. Then it is weakened: it stops attacking and stays down, and only
// then can a Poke Ball be thrown, which always holds. While you fight, the Legendary answers with telegraphed attacks: a
// ring around you or a line through you, marked for WARN_MS before they land, hitting only the marked tiles. A hit
// costs a heart and a short stagger; at none, the Legendary holds back while you recover in full. You never faint.
// Times are passed in (ms), so the rules run on a test clock as well as the screen's.
export const FOE_HP = 100
export const WARN_MS = 1800
export const STRIKE_MS = 500
export const STAGGER_MS = 700
export const RECOVER_MS = 3500
export const FIRST_ATTACK_MS = 2500
// The capture, as the screen plays it (src/games/LairBattle.tsx): the ball flies from the trainer and hits, bounces back
// and opens, a red beam draws the Legendary inside, the ball drops, swings three times, then a star pops.
export const CAPTURE = { fly: 500, bounce: 450, beam: 750, drop: 350, swing: 700, swings: 3, star: 700 } as const
export const CAPTURE_MS = CAPTURE.fly + CAPTURE.bounce + CAPTURE.beam + CAPTURE.drop + CAPTURE.swing * CAPTURE.swings + CAPTURE.star
// After any move, every move waits this long, so two can't land at once.
export const MOVE_GAP_MS = 700
const GAP_MS = 2600
const GAP_SPREAD_MS = 1400
const BACK: Record<Direction, Direction> = { north: 'south', south: 'north', west: 'east', east: 'west' }

export type LairLayout = {
  lair: LairId, label: string, cols: number, rows: number, background: string, legendary: Point, start: Point, entrance: Point,
  out: Direction, map: SafariMap, ground: Point[]
}

function buildLayout(lair: LairId): LairLayout {
  const room = LAIRS[lair]
  // Only the play area is walkable: the Legendary's tile, the entrance and everything else are walls here.
  const map = { cols: room.cols, rows: room.rows, chunk: Math.max(room.cols, room.rows), tiles: room.tiles, areas: [], starts: {}, chunks: {} } as unknown as SafariMap
  const ground: Point[] = []
  room.tiles.forEach((row, y) => [...row].forEach((tile, x) => { if (isWalkable(tile)) ground.push({ x, y }) }))
  return { lair, label: room.name, cols: room.cols, rows: room.rows, background: room.background, legendary: room.legendary, start: room.start,
    entrance: room.entrance, out: room.out, map, ground }
}
export const LAYOUTS = Object.fromEntries((Object.keys(LAIRS) as LairId[]).map(lair => [lair, buildLayout(lair)])) as Record<LairId, LairLayout>

// The layout for a Legendary: its own lair.
export const lairFor = (name: string): LairLayout => LAYOUTS[lairOf(name)]

// Each Legendary's height in metres, from the Pokedex.
const HEIGHTS: Record<string, number> = {
  Articuno: 1.7, Zapdos: 1.6, Moltres: 2, Mewtwo: 2, Mew: 0.4, Raikou: 1.9, Entei: 2.1, Suicune: 2, Lugia: 5.2, 'Ho-Oh': 3.8,
  Celebi: 0.6, Regirock: 1.7, Regice: 1.8, Registeel: 1.9, Latias: 1.4, Latios: 2, Kyogre: 4.5, Groudon: 3.5, Rayquaza: 7,
  Jirachi: 0.3, Deoxys: 1.7, Uxie: 0.3, Mesprit: 0.3, Azelf: 0.3, Dialga: 5.4, Palkia: 4.2, Heatran: 1.7, Regigigas: 3.7,
  Giratina: 4.5, Cresselia: 1.5, Phione: 0.4, Manaphy: 0.3, Darkrai: 1.5, Shaymin: 0.2, Arceus: 3.2, Zygarde: 5, Diancie: 0.7,
  Magearna: 1, Zeraora: 1.5
}
// The trainer stands about 1.3 tiles tall and 1.5 m, so a metre is close to 0.9 of a tile.
const TILES_PER_METRE = 0.9
const TALLEST = 6
export const legendaryHeight = (name: string) => HEIGHTS[name] ?? 1.7
// How many tiles tall the Legendary stands, true to its height beside the trainer: Rayquaza (7 m) towers at six tiles,
// Lugia at close to five, Mewtwo is a head taller than you. The smallest (Shaymin, 0.2 m) are drawn no smaller than
// 0.8 of a tile so they can be seen, and none is taller than TALLEST so the lair stays in view.
export const legendarySize = (name: string): number => Math.min(TALLEST, Math.max(0.8, legendaryHeight(name) * TILES_PER_METRE))

// A move's damage range and how long it takes before it can be used again.
export type Move = { name: string, type: string, min: number, max: number, cooldown: number }
const fromPower = (name: string, type: string, power: number): Move =>
  ({ name, type, min: Math.round(power * 0.25), max: Math.round(power * 0.4), cooldown: 1200 + power * 15 })

// Up to four moves: the partner's own type move, False Swipe (quick and gentle), and its two strongest egg moves.
export function partnerMoves(name: string): Move[] {
  const type = battleType(name)
  const own: Move = { name: MOVES[type] ?? MOVES.normal, type, min: 18, max: 30, cooldown: 2200 }
  const swipe: Move = { name: 'False Swipe', type: 'normal', min: 8, max: 14, cooldown: 1200 }
  const egg = eggMovesOf(name).filter(move => move.power > 0 && move.name !== own.name && move.name !== swipe.name)
    .sort((a, b) => b.power - a.power || a.name.localeCompare(b.name)).slice(0, 2).map(move => fromPower(move.name, move.type, move.power))
  return [own, swipe, ...egg]
}

// Three hearts to start, and one more for each km of saved adventures this week (src/games/adventure.ts walkingBonus),
// up to five. Only saved, completed adventures count there, never distance still being recorded.
export function maxHearts(weekKm: number): number {
  return 3 + (Number.isFinite(weekKm) ? Math.min(2, Math.max(0, Math.floor(weekKm))) : 0)
}

// danger: the attack being telegraphed or landing. tiles are point keys.
export type Danger = { kind: 'ring' | 'line', tiles: string[], warnUntil: number, strikeUntil: number, struck: boolean }
export type Feedback = 'warn' | 'hit' | 'dodge' | 'move' | 'ball' | 'recover' | null
export type Phase = 'watch' | 'fight' | 'down' | 'throw' | 'caught'
// readyAt: when each move can next be used. strike: the partner's last move, for the screen to draw (id changes each time).
// ball: the capture in flight, thrown from where the trainer stood.
export type LairBattle = {
  layout: LairLayout, at: Point, facing: Direction, buddy: Point, buddyFacing: Direction,
  foe: { name: string, shiny: boolean, hp: number }, partner: string, moves: Move[], readyAt: number[],
  phase: Phase, hearts: number, maxHearts: number, staggerUntil: number, recoverUntil: number,
  danger: Danger | null, nextAttackAt: number, strike: { move: Move, damage: number, id: number } | null,
  ball: { from: Point, since: number, until: number } | null,
  paused: boolean, pausedAt: number, message: string, feedback: Feedback
}
// began: this call began the battle (the first move), which the screen saves.
export type BattleResult = { battle: LairBattle, began: boolean }

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y
const say = (battle: LairBattle, message: string, feedback: Feedback = null): LairBattle => ({ ...battle, message, feedback })
const prompt = (battle: LairBattle) => battle.foe.hp <= 0 ? `${battle.foe.name} is weakened and can’t fight on. Throw a Poké Ball!`
  : battle.foe.hp <= 30 ? `${battle.foe.name} is getting tired. Keep going!` : 'Pick a move to wear it down.'

// Entering the lair from its portal, facing in. engaged: the battle had already begun on an earlier visit, so it goes
// straight on; canReset: whether the portal can still meet the Legendary anew (never on a revisit).
export function startBattle(foe: { name: string, shiny: boolean }, partner: string, hearts: number, now: number,
  { engaged = false, canReset = true }: { engaged?: boolean, canReset?: boolean } = {}): LairBattle {
  const layout = lairFor(foe.name)
  const inward = BACK[layout.out]
  const moves = partnerMoves(partner)
  return { layout, at: layout.start, facing: inward, buddy: layout.start, buddyFacing: inward, foe: { ...foe, hp: FOE_HP }, partner, moves,
    readyAt: moves.map(() => 0), phase: engaged ? 'fight' : 'watch', hearts, maxHearts: hearts, staggerUntil: 0, recoverUntil: 0,
    danger: null, nextAttackAt: now + FIRST_ATTACK_MS, strike: null, ball: null, paused: false, pausedAt: 0, feedback: null,
    message: engaged ? `${foe.name} is ready for you. Pick a move to wear it down.`
      : `It watches, calm. Pick a move to begin${canReset ? ', or step back onto the portal to meet it anew' : ''}.` }
}

export const battleOver = (battle: LairBattle) => battle.phase === 'caught'
// Weakened: its HP is gone, it has stopped attacking, and a Poke Ball can be thrown.
export const weakened = (battle: LairBattle) => battle.phase === 'down'
const acting = (battle: LairBattle) => !battle.paused && (battle.phase === 'watch' || battle.phase === 'fight' || battle.phase === 'down')
const fighting = (battle: LairBattle) => !battle.paused && (battle.phase === 'watch' || battle.phase === 'fight')

// One press, from the step walker, the D-pad, the keys or a tap route. Blocked while paused, staggered, recovering or
// while a ball is in the air. The entrance is a one-way portal: it never leads out. From the doorway, before the battle
// begins, a step back into it is the shiny reset (move 'reset'); once it has begun it is only a bump.
export function battleWalk(battle: LairBattle, direction: Direction, now: number): { battle: LairBattle, move: 'step' | 'bump' | 'none' | 'reset' } {
  const { layout } = battle
  if (!acting(battle)) return { battle, move: 'none' }
  if (same(battle.at, layout.start) && direction === layout.out) {
    const turned = { ...battle, facing: direction }
    if (battle.phase === 'watch') return { battle: turned, move: 'reset' }
    return { battle: say(turned, 'The battle has begun: the portal holds the Legendary as it is now.'), move: 'bump' }
  }
  if (now < battle.staggerUntil || now < battle.recoverUntil) return { battle, move: 'none' }
  const turned = { ...battle, facing: direction }
  const next = { x: battle.at.x + STEPS[direction].x, y: battle.at.y + STEPS[direction].y }
  if (!isWalkable(tileAt(next, layout.map))) {
    const why = same(next, layout.legendary) ? `${battle.foe.name} stands its ground.`
      : same(next, layout.entrance) ? 'The portal sealed behind you. It only goes one way: into the lair.' : 'Something is in the way.'
    return { battle: say(turned, why), move: 'bump' }
  }
  return { battle: { ...turned, at: next, buddy: battle.at, buddyFacing: direction }, move: 'step' }
}

// When the move can next be used, or 0 if it is ready.
export const moveWait = (battle: LairBattle, index: number, now: number) => Math.max(0, (battle.readyAt[index] ?? 0) - now)

// Your partner uses a move. The first one begins the battle; the one that takes the last HP leaves the Legendary
// weakened, which drops any attack it was charging.
export function strikeWith(battle: LairBattle, index: number, now: number, random: () => number): BattleResult {
  const move = battle.moves[index]
  if (!move || !fighting(battle) || now < battle.recoverUntil || moveWait(battle, index, now) > 0) return { battle, began: false }
  const damage = move.min + Math.floor(random() * (move.max - move.min + 1))
  const began = battle.phase === 'watch'
  const hp = Math.max(0, battle.foe.hp - damage)
  const next: LairBattle = { ...battle, phase: hp ? 'fight' : 'down', foe: { ...battle.foe, hp },
    readyAt: battle.readyAt.map((at, i) => i === index ? now + move.cooldown : Math.max(at, now + MOVE_GAP_MS)),
    strike: { move, damage, id: (battle.strike?.id ?? 0) + 1 },
    ...(!hp && { danger: null }), ...(began && { nextAttackAt: now + FIRST_ATTACK_MS }) }
  return { battle: say(next, `${battle.partner} used ${move.name}! ${prompt(next)}`, 'move'), began }
}

// The way from one tile toward another, along the longer axis.
export function facingToward(from: Point, to: Point): Direction {
  const dx = to.x - from.x, dy = to.y - from.y
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'east' : 'west'
  return dy < 0 ? 'north' : 'south'
}

// A Poke Ball, only once the Legendary is weakened: the trainer turns to it and throws from where they stand, and the
// ball always holds. Before that it says why not.
export function throwBall(battle: LairBattle, now: number): LairBattle {
  if (!acting(battle)) return battle
  if (battle.phase !== 'down') return say(battle, `${battle.foe.name} is still too strong for a Poké Ball. Wear its HP down first.`)
  return say({ ...battle, phase: 'throw', facing: facingToward(battle.at, battle.layout.legendary), danger: null,
    ball: { from: battle.at, since: now, until: now + CAPTURE_MS } }, 'You threw a Poké Ball!', 'ball')
}

// The Legendary's next attack, aimed where you stand: a ring around you or a line through you.
function aim(battle: LairBattle, now: number, random: () => number): Danger {
  const roll = random()
  const { at, layout } = battle
  const shapes: Record<'ring' | 'row' | 'column', (point: Point) => boolean> = {
    ring: point => Math.abs(point.x - at.x) <= 1 && Math.abs(point.y - at.y) <= 1, row: point => point.y === at.y, column: point => point.x === at.x
  }
  const rolled = roll < 0.5 ? 'ring' : roll < 0.75 ? 'row' : 'column'
  // Rocks and trees can leave a nook a line would fill from end to end; there the Legendary aims another way, so every
  // attack leaves an unmarked tile two steps away at most.
  const shape = ([rolled, 'ring', 'row', 'column'] as const).map(id => ({ id, tiles: new Set(layout.ground.filter(shapes[id]).map(pointKey)) }))
    .find(({ tiles }) => clearWithin(layout.map, at, tiles, 2)) ?? { id: rolled, tiles: new Set(layout.ground.filter(shapes[rolled]).map(pointKey)) }
  return { kind: shape.id === 'ring' ? 'ring' : 'line', tiles: [...shape.tiles], warnUntil: now + WARN_MS, strikeUntil: now + WARN_MS + STRIKE_MS, struck: false }
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

// Time passing: a thrown ball's capture finishes, telegraphs land, recovery ends and the next attack is chosen. Nothing while paused.
export function battleTick(battle: LairBattle, now: number, random: () => number): LairBattle {
  if (battle.paused || battleOver(battle)) return battle
  let next = battle
  if (next.phase === 'throw' && next.ball) {
    if (now < next.ball.until) return next
    return say({ ...next, phase: 'caught' }, `Gotcha! ${next.foe.shiny ? 'Shiny ' : ''}${next.foe.name} was caught!`, 'ball')
  }
  if (next.recoverUntil && now >= next.recoverUntil) {
    next = say({ ...next, hearts: next.maxHearts, recoverUntil: 0, nextAttackAt: now + GAP_MS }, `You caught your breath. ${prompt(next)}`, 'recover')
  }
  const danger = next.danger
  if (danger && !danger.struck && now >= danger.warnUntil) {
    next = { ...next, danger: { ...danger, struck: true } }
    if (danger.tiles.includes(pointKey(next.at))) {
      const hearts = Math.max(0, next.hearts - 1)
      next = say({ ...next, hearts, staggerUntil: now + STAGGER_MS, recoverUntil: hearts ? next.recoverUntil : now + RECOVER_MS },
        hearts ? 'Hit! You lost a heart.' : `Hit! Out of hearts: catch your breath, ${next.foe.name} waits.`, 'hit')
    } else next = say(next, `Dodged! ${prompt(next)}`, 'dodge')
  }
  if (next.danger?.struck && now >= next.danger.strikeUntil) {
    next = { ...next, danger: null, nextAttackAt: now + GAP_MS + Math.floor(random() * GAP_SPREAD_MS) }
  }
  // The Legendary only watches until the battle begins, holds back while you recover, and stops once it is weakened.
  if (!next.danger && next.phase === 'fight' && !next.recoverUntil && now >= next.nextAttackAt) {
    next = say({ ...next, danger: aim(next, now, random) }, `${next.foe.name} is charging ${signatureMove(next.foe.name)}: step off the marked tiles ⚠!`, 'warn')
  }
  return next
}

// Leaving the screen or the app: any attack in flight is dropped. Everything else stays. A capture under way is not
// held up: it finishes on its own clock.
export function pauseBattle(battle: LairBattle, now: number): LairBattle {
  if (battle.paused || battleOver(battle) || battle.phase === 'throw') return battle
  return { ...battle, paused: true, danger: null, staggerUntil: 0, pausedAt: now }
}
export function resumeBattle(battle: LairBattle, now: number): LairBattle {
  if (!battle.paused) return battle
  const away = Math.max(0, now - battle.pausedAt)
  const later = (time: number) => time ? time + away : 0
  return { ...battle, paused: false, nextAttackAt: now + FIRST_ATTACK_MS, recoverUntil: later(battle.recoverUntil), readyAt: battle.readyAt.map(later) }
}
