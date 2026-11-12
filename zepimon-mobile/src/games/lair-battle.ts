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
// then can a Poke Ball be thrown, which always holds. A move sends your partner out in front, toward the Legendary:
// it holds its ground there for the whole attack (ATTACK_MS, the move landing at LAND_MS) while you are free to walk,
// then runs back to your heels. Once the battle begins the Legendary is the boss of its lair: it leaves its perch and
// hunts you across the open ground a tile at a time (ROAM_MS), closing in but never nearer than KEEP_AWAY tiles, and you
// cannot walk through it. While you fight, it answers with its signature move (src/games/legendary-moves.ts),
// telegraphed: a ring around you, a beam from it through you, or a band along your row or column, marked for WARN_MS
// before it lands and hitting only the marked tiles. At half HP or less it is enraged: it strikes more often, its ring
// grows and it can strike a cross. A hit costs a heart and a short stagger; at none, the Legendary holds back while you
// recover in full, and gets RECOVER_HP back. You never faint.
// Times are passed in (ms), so the rules run on a test clock as well as the screen's.
export const FOE_HP = 150
// About six steps of warning: every attack leaves a safe tile ESCAPE steps away at most.
export const WARN_MS = 1300
export const ESCAPE = 3
export const STRIKE_MS = 700
export const STAGGER_MS = 700
export const RECOVER_MS = 3500
export const FIRST_ATTACK_MS = 2000
// The capture, as the screen plays it (src/games/LairBattle.tsx): the ball flies from the trainer and hits, bounces back
// and opens, a red beam draws the Legendary inside, the ball drops, swings three times, then a star pops.
export const CAPTURE = { fly: 500, bounce: 450, beam: 750, drop: 350, swing: 700, swings: 3, star: 700 } as const
export const CAPTURE_MS = CAPTURE.fly + CAPTURE.bounce + CAPTURE.beam + CAPTURE.drop + CAPTURE.swing * CAPTURE.swings + CAPTURE.star
// A partner's attack: it stays out in front this long (at least a second), and the move lands this far in.
export const ATTACK_MS = 1200
export const LAND_MS = 450
// After any move, every move waits until the partner is back, so two never overlap.
export const MOVE_GAP_MS = ATTACK_MS
// The Legendary takes a step this often while it prowls, and holds still while it charges and strikes.
export const ROAM_MS = 600
// It never comes nearer to the trainer than this many tiles, so it cannot pen you in.
export const KEEP_AWAY = 3
// The breath between its attacks, shorter once it is enraged (at half HP or less).
const GAP_MS = 1500
const GAP_SPREAD_MS = 900
const ENRAGED_GAP_MS = 900
const ENRAGED_SPREAD_MS = 500
// Run out of hearts and the Legendary gets its breath back too: it recovers this much HP.
export const RECOVER_HP = 30
// Every lair is played at twice its Emerald size: each tile of the room is a 2 x 2 block here, so there is twice the
// room to move in each way, with the trainer, the partner and the Legendary at the same size beside each other.
export const LAIR_SCALE = 2
const BACK: Record<Direction, Direction> = { north: 'south', south: 'north', west: 'east', east: 'west' }

export type LairLayout = {
  lair: LairId, label: string, cols: number, rows: number, background: string, legendary: Point, start: Point, entrance: Point,
  out: Direction, map: SafariMap, ground: Point[]
}

function buildLayout(lair: LairId): LairLayout {
  const room = LAIRS[lair]
  const scale = LAIR_SCALE
  const tiles = room.tiles.flatMap(row => Array<string>(scale).fill([...row].map(tile => tile.repeat(scale)).join('')))
  const cols = room.cols * scale, rows = room.rows * scale
  // The start is the corner of its block that touches the entrance, so the way out still leads straight onto it.
  const out = STEPS[room.out]
  const start = { x: room.start.x * scale + (out.x > 0 ? scale - 1 : 0), y: room.start.y * scale + (out.y > 0 ? scale - 1 : 0) }
  const entrance = { x: start.x + out.x, y: start.y + out.y }
  // The Legendary's perch: the bottom row of its block, so it stands where it always did.
  const legendary = { x: room.legendary.x * scale, y: room.legendary.y * scale + scale - 1 }
  // Only the play area is walkable: the Legendary's perch, the entrance and everything else are walls here.
  const map = { cols, rows, chunk: Math.max(cols, rows), tiles, areas: [], starts: {}, chunks: {} } as unknown as SafariMap
  const ground: Point[] = []
  tiles.forEach((row, y) => [...row].forEach((tile, x) => { if (isWalkable(tile)) ground.push({ x, y }) }))
  return { lair, label: room.name, cols, rows, background: room.background, legendary, start, entrance, out: room.out, map, ground }
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
// readyAt: when each move can next be used. strike: the partner's attack: it stands at `at` from `since` to `until`,
// facing the Legendary, and the move lands (its damage counts) at landsAt; the id changes each time, for the screen.
// behind: the tile the trainer last left, where the partner runs back to. foeAt: where the Legendary stands; foeFacing:
// the way it last stepped. ball: the capture in flight, thrown from where the trainer stood.
export type Strike = { move: Move, damage: number, id: number, at: Point, since: number, landsAt: number, until: number, landed: boolean }
export type LairBattle = {
  layout: LairLayout, at: Point, facing: Direction, buddy: Point, buddyFacing: Direction, behind: Point,
  foeAt: Point, foeFacing: Direction, nextRoamAt: number,
  foe: { name: string, shiny: boolean, hp: number }, partner: string, moves: Move[], readyAt: number[],
  phase: Phase, hearts: number, maxHearts: number, staggerUntil: number, recoverUntil: number,
  danger: Danger | null, nextAttackAt: number, strike: Strike | null,
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
  return { layout, at: layout.start, facing: inward, buddy: layout.start, buddyFacing: inward, behind: layout.start,
    foeAt: layout.legendary, foeFacing: layout.out, nextRoamAt: now + FIRST_ATTACK_MS, foe: { ...foe, hp: FOE_HP }, partner, moves,
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
  if (!isWalkable(tileAt(next, layout.map)) || same(next, battle.foeAt)) {
    const why = same(next, battle.foeAt) ? `${battle.foe.name} stands its ground.`
      : same(next, layout.entrance) ? 'The portal sealed behind you. It only goes one way: into the lair.' : 'Something is in the way.'
    return { battle: say(turned, why), move: 'bump' }
  }
  // The partner follows a step behind, unless it is out in front attacking: then it holds its ground until it is done.
  const held = partnerOut(battle)
  return { battle: { ...turned, at: next, behind: battle.at, ...(!held && { buddy: battle.at, buddyFacing: direction }) }, move: 'step' }
}

// When the move can next be used, or 0 if it is ready.
export const moveWait = (battle: LairBattle, index: number, now: number) => Math.max(0, (battle.readyAt[index] ?? 0) - now)

// The partner is out in front, in the middle of an attack.
export const partnerOut = (battle: LairBattle) => !!battle.strike && battle.strike.until > 0
const apart = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

// Where the partner attacks from: the open tile within two steps of the trainer that is nearest the Legendary (ties go
// to the upper-left, so it never varies), never the trainer's own tile or the Legendary's. With nowhere to go, it stays put.
export function attackSpot(battle: LairBattle): Point {
  const spot = battle.layout.ground.filter(point => apart(point, battle.at) <= 2 && !same(point, battle.at) && !same(point, battle.foeAt))
    .sort((a, b) => apart(a, battle.foeAt) - apart(b, battle.foeAt) || a.y - b.y || a.x - b.x)[0]
  return spot ?? battle.buddy
}

// Your partner uses a move: it runs out in front and attacks from there. The first one begins the battle. The damage
// counts when the move lands (battleTick), and the one that takes the last HP leaves the Legendary weakened.
export function strikeWith(battle: LairBattle, index: number, now: number, random: () => number): BattleResult {
  const move = battle.moves[index]
  if (!move || !fighting(battle) || partnerOut(battle) || now < battle.recoverUntil || moveWait(battle, index, now) > 0) return { battle, began: false }
  const damage = move.min + Math.floor(random() * (move.max - move.min + 1))
  const began = battle.phase === 'watch'
  const at = attackSpot(battle)
  const next: LairBattle = { ...battle, phase: 'fight', buddy: at, buddyFacing: facingToward(at, battle.foeAt),
    readyAt: battle.readyAt.map((ready, i) => i === index ? now + Math.max(move.cooldown, MOVE_GAP_MS) : Math.max(ready, now + MOVE_GAP_MS)),
    strike: { move, damage, id: (battle.strike?.id ?? 0) + 1, at, since: now, landsAt: now + LAND_MS, until: now + ATTACK_MS, landed: false },
    ...(began && { nextAttackAt: now + FIRST_ATTACK_MS, nextRoamAt: now + ROAM_MS }) }
  return { battle: say(next, `${battle.partner} used ${move.name}!`, 'move'), began }
}

// The Legendary's next step as the boss of its lair. From its perch it comes down onto the nearest open ground; from
// there it steps to a neighbouring open tile, most often the one that closes on the trainer. It never steps onto the
// trainer or the partner, nor within KEEP_AWAY of the trainer; with no such step it holds still.
function roam(battle: LairBattle, random: () => number): LairBattle {
  const { layout, foeAt, at } = battle
  const free = (point: Point) => !same(point, at) && !same(point, battle.buddy) && apart(point, at) >= KEEP_AWAY
  const onGround = layout.ground.some(point => same(point, foeAt))
  const options = onGround
    ? (Object.keys(STEPS) as Direction[]).map(direction => ({ x: foeAt.x + STEPS[direction].x, y: foeAt.y + STEPS[direction].y }))
      .filter(point => isWalkable(tileAt(point, layout.map)) && free(point))
    : layout.ground.filter(free).sort((a, b) => apart(a, foeAt) - apart(b, foeAt) || a.y - b.y || a.x - b.x).slice(0, 1)
  if (!options.length) return battle
  const closing = [...options].sort((a, b) => apart(a, at) - apart(b, at) || a.y - b.y || a.x - b.x)[0]
  const to = random() < 0.9 ? closing : options[Math.min(options.length - 1, Math.floor(random() * options.length))]
  return { ...battle, foeAt: to, foeFacing: facingToward(foeAt, to) }
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
  return say({ ...battle, phase: 'throw', facing: facingToward(battle.at, battle.foeAt), danger: null,
    ball: { from: battle.at, since: now, until: now + CAPTURE_MS } }, 'You threw a Poké Ball!', 'ball')
}

// The Legendary's next attack, aimed at you: a ring around you, a beam from it straight through you, or a band along
// your row or column, three tiles wide. Enraged (at half HP or less) its ring grows and it can strike a cross as well.
type Shape = 'ring' | 'beam' | 'row' | 'column' | 'cross'
function aim(battle: LairBattle, now: number, random: () => number): Danger {
  const roll = random()
  const { at, layout, foeAt } = battle
  const enraged = battle.foe.hp <= FOE_HP / 2
  const reach = enraged ? 3 : 2
  const vx = at.x - foeAt.x, vy = at.y - foeAt.y, length = Math.hypot(vx, vy) || 1
  const shapes: Record<Shape, (point: Point) => boolean> = {
    ring: point => Math.max(Math.abs(point.x - at.x), Math.abs(point.y - at.y)) <= reach,
    // From the Legendary through you and on: every tile within a tile of that line, ahead of the Legendary.
    beam: point => {
      const wx = point.x - foeAt.x, wy = point.y - foeAt.y
      return wx * vx + wy * vy > 0 && Math.abs(wx * vy - wy * vx) / length <= 1.2
    },
    row: point => Math.abs(point.y - at.y) <= 1,
    column: point => Math.abs(point.x - at.x) <= 1,
    cross: point => point.x === at.x || point.y === at.y || Math.max(Math.abs(point.x - at.x), Math.abs(point.y - at.y)) <= 1
  }
  const rolled: Shape = enraged && roll < 0.2 ? 'cross' : roll < 0.4 ? 'beam' : roll < 0.7 ? 'ring' : roll < 0.85 ? 'row' : 'column'
  // Rocks and water can leave a nook a band would fill from end to end; there the Legendary aims another way, so every
  // attack leaves an unmarked tile ESCAPE steps away at most.
  const order: Shape[] = [rolled, 'beam', 'ring', 'row', 'column', 'cross']
  const shape = order.map(id => ({ id, tiles: new Set(layout.ground.filter(shapes[id]).map(pointKey)) }))
    .find(({ tiles }) => tiles.size && clearWithin(layout.map, at, tiles, ESCAPE))
    ?? { id: 'ring' as Shape, tiles: new Set(layout.ground.filter(point => same(point, at)).map(pointKey)) }
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
  // The partner's move lands, and once the attack is over it runs back to the trainer's heels.
  const strike = next.strike
  if (strike && !strike.landed && now >= strike.landsAt) {
    const hp = Math.max(0, next.foe.hp - strike.damage)
    next = { ...next, foe: { ...next.foe, hp }, strike: { ...strike, landed: true }, ...(!hp && { phase: 'down' as const, danger: null }) }
    next = say(next, `${next.partner} used ${strike.move.name}! ${prompt(next)}`, 'move')
  }
  if (next.strike && next.strike.until > 0 && now >= next.strike.until) {
    const back = same(next.behind, next.at) ? next.buddy : next.behind
    next = { ...next, strike: { ...next.strike, until: 0 }, buddy: back, buddyFacing: facingToward(back, next.at) }
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
        hearts ? 'Hit! You lost a heart.' : `Hit! Out of hearts: ${next.foe.name} recovers ${RECOVER_HP} HP while you catch your breath.`, 'hit')
      if (!hearts) next = { ...next, foe: { ...next.foe, hp: Math.min(FOE_HP, next.foe.hp + RECOVER_HP) } }
    } else next = say(next, `Dodged! ${prompt(next)}`, 'dodge')
  }
  if (next.danger?.struck && now >= next.danger.strikeUntil) {
    const enraged = next.foe.hp <= FOE_HP / 2
    next = { ...next, danger: null, nextAttackAt: now + (enraged ? ENRAGED_GAP_MS : GAP_MS) + Math.floor(random() * (enraged ? ENRAGED_SPREAD_MS : GAP_SPREAD_MS)) }
  }
  // The boss prowls between its attacks: it holds still while one is charging or landing.
  if (next.phase === 'fight' && !next.danger && now >= next.nextRoamAt) next = { ...roam(next, random), nextRoamAt: now + ROAM_MS }
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
  const strike = battle.strike && { ...battle.strike, since: battle.strike.since + away, landsAt: battle.strike.landsAt + away, until: later(battle.strike.until) }
  return { ...battle, paused: false, nextAttackAt: now + FIRST_ATTACK_MS, nextRoamAt: now + ROAM_MS, recoverUntil: later(battle.recoverUntil),
    readyAt: battle.readyAt.map(later), strike }
}
