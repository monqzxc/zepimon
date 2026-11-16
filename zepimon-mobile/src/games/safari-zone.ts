import { SAFARI_BALLS, ZONES, rollWild, startSafari } from './safari.ts'
import type { SafariGame, Zone } from './safari.ts'
import { BALLS_PER_KM, BONUS_KM_CAP } from './adventure.ts'
import { safariMap as generatedMap } from '../generated/safari-map.js'

// Walking rules for the Safari Zone: a trainer on a tile map, a step budget, ledges, items, signs and the gate, and the
// wild Pokemon that roam it. It is an open world: Pokemon walk about in plain sight, a few at a time near the trainer,
// and nothing happens until you walk into one. It then turns to you (the encounter), and the screen opens the battle
// (legendary-battle.ts). A ZoneGame is a SafariGame with the walking state added. Times are passed in (ms).
export type Direction = 'north' | 'south' | 'west' | 'east'
export type Point = { x: number, y: number }
export type AreaId = 'gate' | Zone
export type SafariMap = { cols: number, rows: number, chunk: number, tiles: readonly string[], areas: readonly string[],
  starts: Record<AreaId, Point>, chunks: Record<string, { top: boolean }> }
export const safariMap = generatedMap as SafariMap

export const ZONE_STEPS = 800, STEPS_PER_KM = 100, ITEM_COUNT = 12, ITEM_BALLS = 3
// At most MAX_WILD Pokemon are out at once, so the map stays light to draw. One walks out SPAWN_MS after there is room,
// SPAWN_NEAR to SPAWN_FAR tiles from the trainer; one left more than WANDER_OFF tiles behind is gone.
export const MAX_WILD = 3, SPAWN_NEAR = 3, SPAWN_FAR = 6, WANDER_OFF = 10, SPAWN_MS = 1500
// Each Pokemon thinks again every ROAM_MS to ROAM_MS + ROAM_SPREAD_MS: it rests REST of the time, or tries a step.
export const ROAM_MS = 900, ROAM_SPREAD_MS = 900, REST = 0.3
// steps: how many it has taken (its walking frame). moveAt: when it thinks next.
export type Wild = { id: number, name: string, shiny: boolean, at: Point, facing: Direction, steps: number, moveAt: number }
export type ZoneGame = SafariGame & { at: Point, facing: Direction, buddy: Point, buddyFacing: Direction, steps: number,
  taken: number, items: string[], wilds: Wild[], spawned: number, spawnAt: number, area: AreaId, prompt: 'gate' | null }
export type ZoneEvent = 'item' | 'sign' | 'area' | 'encounter' | 'gate' | 'out-of-steps'
export type WalkResult = { game: ZoneGame, move: 'step' | 'hop' | 'bump' | 'none', events: ZoneEvent[] }

export const pointKey = (point: Point) => `${point.x},${point.y}`
export const STEPS: Record<Direction, Point> = { north: { x: 0, y: -1 }, south: { x: 0, y: 1 }, west: { x: -1, y: 0 }, east: { x: 1, y: 0 } }
export const LEDGES: Record<string, Direction> = { v: 'south', '<': 'west', '>': 'east' }
const AREAS: Record<string, AreaId> = { g: 'gate', m: 'meadow', l: 'lake', k: 'mountain', n: 'night' }
const ORDER: Direction[] = ['north', 'south', 'west', 'east']
const OPPOSITE: Record<Direction, Direction> = { north: 'south', south: 'north', west: 'east', east: 'west' }
const move = (point: Point, direction: Direction) => ({ x: point.x + STEPS[direction].x, y: point.y + STEPS[direction].y })
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y
const apart = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
const called = (wild: { name: string, shiny: boolean }) => `${wild.shiny ? 'Shiny ' : ''}${wild.name}`

export const isWalkable = (tile: string) => '.go@1234'.includes(tile)
// Where a wild Pokemon may stand: open ground and tall grass, never an item ball or the gate's doorstep.
const isRoamable = (tile: string) => '.g1234'.includes(tile)

export function tileAt(point: Point, map = safariMap): string {
  return map.tiles[point.y]?.[point.x] ?? '#'
}

export function areaAt(point: Point, map = safariMap): AreaId {
  return AREAS[map.areas[point.y]?.[point.x]] ?? 'gate'
}

// Each km walked this week (up to the cap) adds steps as well as balls.
export function zoneBudget(bonusKm: number): { steps: number, balls: number } {
  const km = Number.isFinite(bonusKm) ? Math.min(BONUS_KM_CAP, Math.max(0, Math.floor(bonusKm))) : 0
  return { steps: ZONE_STEPS + STEPS_PER_KM * km, balls: SAFARI_BALLS + BALLS_PER_KM * km }
}

// The first Pokemon walks out on the first roam after `now`.
export function startZone(start: AreaId, bonusKm: number, now: number, map = safariMap): ZoneGame {
  const { steps, balls } = zoneBudget(bonusKm)
  const at = map.starts[start]
  // At the gate you have just stepped out of the gate house, so you face away from its door.
  const facing: Direction = start === 'gate' ? 'south' : 'north'
  return { ...startSafari(start === 'gate' ? 'meadow' : start, balls - SAFARI_BALLS), at, facing, buddy: at,
    buddyFacing: facing, steps, taken: 0, items: [], wilds: [], spawned: 0, spawnAt: now,
    area: areaAt(at, map), prompt: null, message: `Welcome to the Safari Zone! You have ${steps} steps and ${balls} Safari Balls.` }
}

function signText(point: Point, map: SafariMap): string {
  const area = areaAt(point, map)
  return area === 'gate' ? 'Safari Zone · Four areas to explore' : `${ZONES[area].label} · ${ZONES[area].blurb}`
}

function signNear(point: Point, map: SafariMap): Point | null {
  for (const direction of Object.keys(STEPS) as Direction[]) {
    const next = move(point, direction)
    if (tileAt(next, map) === 'S') return next
  }
  return null
}

function blockedText(point: Point, map: SafariMap): string {
  const tile = tileAt(point, map)
  if (tile === 'T') return 'A tree is in the way.'
  if (tile === '~') return 'The water is too deep to cross.'
  if (tile === 'R') return 'A boulder is in the way.'
  if (tile === 'F') return 'A fence is in the way.'
  if (tile === 'S') return signText(point, map)
  if (LEDGES[tile]) return "You can't climb the ledge."
  return 'A wall is in the way.'
}

// One press of a direction. Facing always turns; a bump, the gate prompt and frozen states cost no step. Walking into
// a wild Pokemon is how you interact with it: it stops, turns to you and the encounter begins, at no cost.
export function walk(game: ZoneGame, direction: Direction, map = safariMap): WalkResult {
  if (game.status !== 'playing' || game.encounter || game.prompt || game.steps <= 0) return { game, move: 'none', events: [] }
  const turned = { ...game, facing: direction }
  const bump = (message: string): WalkResult => ({ game: { ...turned, message }, move: 'bump', events: [] })
  const next = move(game.at, direction)
  const tile = tileAt(next, map)
  if (tile === 'G') return { game: { ...turned, prompt: 'gate', message: 'Leave the Safari Zone?' }, move: 'none', events: ['gate'] }
  const met = game.wilds.find(wild => same(wild.at, next))
  if (met) {
    const zone = areaAt(met.at, map)
    return { game: { ...turned, zone: zone === 'gate' ? game.zone : zone, encounter: { id: met.id, name: met.name, shiny: met.shiny },
      wilds: game.wilds.map(wild => wild === met ? { ...wild, facing: OPPOSITE[direction] } : wild), message: `${called(met)} noticed you!` },
    move: 'bump', events: ['encounter'] }
  }
  let landing = next
  if (LEDGES[tile]) {
    if (LEDGES[tile] !== direction) return bump("You can't climb the ledge.")
    landing = move(next, direction)
    if (!isWalkable(tileAt(landing, map))) return bump(blockedText(landing, map))
    const below = game.wilds.find(wild => same(wild.at, landing))
    if (below) return bump(`${called(below)} is in the way below the ledge.`)
  } else if (!isWalkable(tile)) {
    return bump(blockedText(next, map))
  }
  const hop = tile in LEDGES
  let walked: ZoneGame = { ...turned, at: landing, buddy: hop ? next : game.at, buddyFacing: direction,
    steps: game.steps - 1, taken: game.taken + 1 }
  const events: ZoneEvent[] = []
  const messages: Partial<Record<ZoneEvent | 'grass', string>> = {}
  const area = areaAt(landing, map)
  if (area !== game.area) {
    walked = { ...walked, area }
    events.push('area')
    messages.area = area === 'gate' ? 'You are back at the gate.' : `You entered the ${ZONES[area].label}.`
  }
  const sign = signNear(landing, map)
  if (sign && pointKey(sign) !== pointKey(signNear(game.at, map) ?? { x: -1, y: -1 })) {
    events.push('sign')
    messages.sign = signText(sign, map)
  }
  const key = pointKey(landing)
  if (tileAt(landing, map) === 'o' && !game.items.includes(key)) {
    walked = { ...walked, balls: walked.balls + ITEM_BALLS, items: [...walked.items, key] }
    events.push('item')
    messages.item = `You found ${ITEM_BALLS} Safari Balls!`
  }
  if (tileAt(landing, map) === 'g' && tileAt(game.at, map) !== 'g') messages.grass = 'You stepped into tall grass.'
  if (walked.steps <= 0) {
    walked = { ...walked, status: 'complete' }
    events.push('out-of-steps')
    messages['out-of-steps'] = TIME_UP
  }
  const shown = (['out-of-steps', 'item', 'sign', 'area', 'grass'] as const).find(event => messages[event])
  return { game: shown ? { ...walked, message: messages[shown]! } : walked, move: hop ? 'hop' : 'step', events }
}

const TIME_UP = "Ding-dong! Time's up!"
const NO_BALLS = "You're out of Safari Balls!"

// The tiles a new Pokemon may walk out on: within a short walk of the trainer (so it can always be reached), SPAWN_NEAR
// to SPAWN_FAR tiles away, outside the gate area and not where anyone stands.
function spawnTiles(game: ZoneGame, map: SafariMap): Point[] {
  const seen = new Set([pointKey(game.at)])
  const found: Point[] = []
  let edge = [game.at]
  for (let step = 0; step < SPAWN_FAR * 2 && edge.length; step++) {
    const further: Point[] = []
    for (const point of edge) {
      for (const [, next] of moves(point, map)) {
        if (seen.has(pointKey(next)) || apart(next, game.at) > SPAWN_FAR) continue
        seen.add(pointKey(next))
        further.push(next)
        if (apart(next, game.at) >= SPAWN_NEAR && isRoamable(tileAt(next, map)) && areaAt(next, map) !== 'gate' && !same(next, game.buddy) &&
            !game.wilds.some(wild => same(wild.at, next))) found.push(next)
      }
    }
    edge = further
  }
  return found
}

// One wild Pokemon thinking: it rests, or turns and steps if that way is open ground or grass with no one on it.
function stroll(game: ZoneGame, wild: Wild, now: number, random: () => number, map: SafariMap): Wild {
  const rested = random() < REST
  const moveAt = now + ROAM_MS + Math.floor(random() * ROAM_SPREAD_MS)
  if (rested) return { ...wild, moveAt }
  const facing = ORDER[Math.min(ORDER.length - 1, Math.floor(random() * ORDER.length))]
  const to = move(wild.at, facing)
  const open = isRoamable(tileAt(to, map)) && areaAt(to, map) !== 'gate' && !same(to, game.at) && !same(to, game.buddy) &&
    !game.wilds.some(other => other !== wild && same(other.at, to))
  return open ? { ...wild, at: to, facing, steps: wild.steps + 1, moveAt } : { ...wild, facing, moveAt }
}

// Time passing on the map: Pokemon left far behind wander off, the others stroll, and while fewer than MAX_WILD are out
// a new one walks out near the trainer (its species from the area it appears in, Shiny by the round's chain). Nothing
// moves during an encounter, the gate prompt, a pause or after the round. Returns the same game when nothing changed,
// so the screen only redraws when something did.
export function roam(game: ZoneGame, now: number, random = Math.random, map = safariMap): ZoneGame {
  if (game.status !== 'playing' || game.encounter || game.prompt) return game
  let next = game
  if (game.wilds.some(wild => apart(wild.at, game.at) > WANDER_OFF)) {
    next = { ...next, wilds: game.wilds.filter(wild => apart(wild.at, game.at) <= WANDER_OFF), spawnAt: Math.max(game.spawnAt, now + SPAWN_MS) }
  }
  for (const wild of next.wilds) {
    if (now < wild.moveAt) continue
    const strolled = stroll(next, wild, now, random, map)
    next = { ...next, wilds: next.wilds.map(other => other === wild ? strolled : other) }
  }
  if (next.wilds.length < MAX_WILD && now >= next.spawnAt) {
    const tiles = spawnTiles(next, map)
    next = { ...next, spawnAt: now + SPAWN_MS }
    if (tiles.length) {
      const at = tiles[Math.min(tiles.length - 1, Math.floor(random() * tiles.length))]
      const wild = rollWild(next, areaAt(at, map) as Zone, random)
      next = { ...next, spawned: next.spawned + 1,
        wilds: [...next.wilds, { ...wild, id: next.spawned + 1, at, facing: 'south', steps: 0, moveAt: now + ROAM_MS + Math.floor(random() * ROAM_SPREAD_MS) }] }
    }
  }
  return next
}

// A round with no balls or steps left ends once nothing is in progress.
function settle(game: ZoneGame, message: string): ZoneGame {
  if (game.balls <= 0) return { ...game, status: 'complete', message: `${message} ${NO_BALLS}` }
  if (game.steps <= 0) return { ...game, status: 'complete', message: `${message} ${TIME_UP}` }
  return { ...game, message }
}

// The battle's Safari Balls are the round's: each throw is taken from it as it happens.
export function spendBalls(game: ZoneGame, balls: number): ZoneGame {
  const left = Math.max(0, Math.min(game.balls, Math.floor(balls)))
  return game.encounter && left !== game.balls ? { ...game, balls: left } : game
}

// The ball held: the Pokemon leaves the map and joins the round's catches. Catching the same species again and again
// builds the chain that makes its next one likelier to be Shiny.
export function catchWild(game: ZoneGame, now: number): ZoneGame {
  const { encounter } = game
  if (!encounter) return game
  const chain = { name: encounter.name, count: game.chain.name === encounter.name ? game.chain.count + 1 : 1 }
  return settle({ ...game, encounter: null, chain, catches: [...game.catches, { name: encounter.name, shiny: encounter.shiny }],
    wilds: game.wilds.filter(wild => wild.id !== encounter.id), spawnAt: now + SPAWN_MS }, `Gotcha! ${called(encounter)} was caught!`)
}

// Running, or running out of balls: the Pokemon loses interest and goes back to roaming where it stood, a moment later.
export function leaveWild(game: ZoneGame, now: number): ZoneGame {
  const { encounter } = game
  if (!encounter) return game
  return settle({ ...game, encounter: null, wilds: game.wilds.map(wild => wild.id === encounter.id ? { ...wild, moveAt: now + 2 * ROAM_MS } : wild) },
    game.balls > 0 ? 'You got away safely.' : `${called(encounter)} wandered off.`)
}

export function confirmLeave(game: ZoneGame): ZoneGame {
  return game.prompt === 'gate' ? { ...game, status: 'complete', prompt: null, message: 'You left the Safari Zone.' } : game
}

export function stayInZone(game: ZoneGame): ZoneGame {
  return game.prompt ? { ...game, prompt: null } : game
}

export type Trail = Map<string, { from: string, direction: Direction } | null>
export type Neighbours = (point: Point) => [Direction, Point][]

// Where one press of each direction takes you: a step onto open ground, a hop down a ledge, or nowhere.
function moves(point: Point, map: SafariMap): [Direction, Point][] {
  const found: [Direction, Point][] = []
  for (const direction of ORDER) {
    const next = move(point, direction)
    const tile = tileAt(next, map)
    if (isWalkable(tile)) found.push([direction, next])
    else if (LEDGES[tile] === direction && isWalkable(tileAt(move(next, direction), map))) found.push([direction, move(next, direction)])
  }
  return found
}

// Breadth-first over presses (a hop is one press), trying neighbours in the order given (safari: north, south, west, east) so routes are deterministic.
export function routeSearch(start: Point, neighbours: Neighbours): Trail {
  const trail: Trail = new Map([[pointKey(start), null]])
  const queue = [start]
  for (let i = 0; i < queue.length; i++) {
    for (const [direction, next] of neighbours(queue[i])) {
      if (trail.has(pointKey(next))) continue
      trail.set(pointKey(next), { from: pointKey(queue[i]), direction })
      queue.push(next)
    }
  }
  return trail
}

export function routeTo(trail: Trail, key: string): Direction[] {
  const route: Direction[] = []
  for (let step = trail.get(key); step; step = trail.get(step.from)) route.unshift(step.direction)
  return route
}

export function reachableFrom(start: Point, map = safariMap): Set<string> {
  return new Set(routeSearch(start, point => moves(point, map)).keys())
}

// Tap-to-walk: the presses that reach a tapped tile. A wall, water or ledge walks to its nearest reachable side; the
// gate walks up to its door and steps into it, which asks before leaving. Null when there is no way there.
export function planWalk(from: Point, to: Point, map = safariMap): Direction[] | null {
  if (from.x === to.x && from.y === to.y) return []
  const trail = routeSearch(from, point => moves(point, map))
  const target = tileAt(to, map)
  if (isWalkable(target)) return trail.has(pointKey(to)) ? routeTo(trail, pointKey(to)) : null
  let best: Direction[] | null = null, into: Direction = 'north'
  for (const direction of ORDER) {
    const side = move(to, direction)
    if (!isWalkable(tileAt(side, map)) || !trail.has(pointKey(side))) continue
    const route = routeTo(trail, pointKey(side))
    if (!best || route.length < best.length) [best, into] = [route, OPPOSITE[direction]]
  }
  return best && target === 'G' ? [...best, into] : best
}

// Tap-to-walk on the open map. Tapping a wild Pokemon walks up to it and into it, which is how you interact with it;
// any other route goes round the Pokemon in the way where it can, so a walk across the map doesn't start an encounter
// you didn't ask for (one that strolls into your path still does).
export function planHunt(game: ZoneGame, to: Point, map = safariMap): Direction[] | null {
  const others = new Set(game.wilds.filter(wild => !same(wild.at, to)).map(wild => pointKey(wild.at)))
  if (!others.size) return planWalk(game.at, to, map)
  const around = { ...map, tiles: map.tiles.map((row, y) => [...row].map((tile, x) => others.has(`${x},${y}`) ? 'R' : tile).join('')) }
  return planWalk(game.at, to, around) ?? planWalk(game.at, to, map)
}
