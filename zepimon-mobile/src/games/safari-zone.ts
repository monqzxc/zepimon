import { SAFARI_BALLS, ZONES, meetWild, startSafari } from './safari.ts'
import type { SafariGame, Zone } from './safari.ts'
import { BALLS_PER_KM, BONUS_KM_CAP } from './adventure.ts'
import { safariMap as generatedMap } from '../generated/safari-map.js'

// Walking rules for the Safari Zone: a trainer on a tile map, a step budget, ledges, items, signs and the gate.
// Catching stays in safari.ts; a ZoneGame is a SafariGame with the walking state added.
export type Direction = 'north' | 'south' | 'west' | 'east'
export type Point = { x: number, y: number }
export type AreaId = 'gate' | Zone
export type SafariMap = { cols: number, rows: number, chunk: number, tiles: readonly string[], areas: readonly string[],
  starts: Record<AreaId, Point>, chunks: Record<string, { top: boolean }> }
export const safariMap = generatedMap as SafariMap

export const ZONE_STEPS = 400, STEPS_PER_KM = 50, ITEM_COUNT = 6, ITEM_BALLS = 3, GRASS_RATE = 0.1, GRASS_COOLDOWN = 3, RUSTLE_EVERY = 25
// `rustling`, not `rustle`: SafariGame still has a numeric `rustle` for Safari Hunt, and the intersection must not clash.
export type ZoneGame = SafariGame & { at: Point, facing: Direction, buddy: Point, buddyFacing: Direction, steps: number,
  taken: number, items: string[], rustling: Point | null, nextRustleAt: number, cooldown: number, area: AreaId, prompt: 'gate' | null }
export type ZoneEvent = 'item' | 'sign' | 'area' | 'rustle' | 'encounter' | 'gate' | 'out-of-steps'
export type WalkResult = { game: ZoneGame, move: 'step' | 'hop' | 'bump' | 'none', events: ZoneEvent[] }

export const pointKey = (point: Point) => `${point.x},${point.y}`
export const STEPS: Record<Direction, Point> = { north: { x: 0, y: -1 }, south: { x: 0, y: 1 }, west: { x: -1, y: 0 }, east: { x: 1, y: 0 } }
export const LEDGES: Record<string, Direction> = { v: 'south', '<': 'west', '>': 'east' }
const AREAS: Record<string, AreaId> = { g: 'gate', m: 'meadow', l: 'lake', k: 'mountain', n: 'night' }
const move = (point: Point, direction: Direction) => ({ x: point.x + STEPS[direction].x, y: point.y + STEPS[direction].y })

export const isWalkable = (tile: string) => '.go@1234'.includes(tile)

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

export function startZone(start: AreaId, bonusKm: number, now: number, map = safariMap): ZoneGame {
  const { steps, balls } = zoneBudget(bonusKm)
  const at = map.starts[start]
  // At the gate you have just stepped out of the gate house, so you face away from its door.
  const facing: Direction = start === 'gate' ? 'south' : 'north'
  return { ...startSafari(start === 'gate' ? 'meadow' : start, balls - SAFARI_BALLS, now), at, facing, buddy: at,
    buddyFacing: facing, steps, taken: 0, items: [], rustling: null, nextRustleAt: RUSTLE_EVERY, cooldown: 0,
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

// One press of a direction. Facing always turns; a bump, the gate prompt and frozen states cost no step.
export function walk(game: ZoneGame, direction: Direction, random = Math.random, map = safariMap): WalkResult {
  if (game.status !== 'playing' || game.encounter || game.prompt || game.steps <= 0) return { game, move: 'none', events: [] }
  const turned = { ...game, facing: direction }
  const bump = (message: string): WalkResult => ({ game: { ...turned, message }, move: 'bump', events: [] })
  const next = move(game.at, direction)
  const tile = tileAt(next, map)
  if (tile === 'G') return { game: { ...turned, prompt: 'gate', message: 'Leave the Safari Zone?' }, move: 'none', events: ['gate'] }
  let landing = next
  if (LEDGES[tile]) {
    if (LEDGES[tile] !== direction) return bump("You can't climb the ledge.")
    landing = move(next, direction)
    if (!isWalkable(tileAt(landing, map))) return bump(blockedText(landing, map))
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
  const grass = tileAt(landing, map) === 'g'
  if (grass && tileAt(game.at, map) !== 'g') messages.grass = 'You stepped into tall grass.'
  // Rustling grass always holds a Pokemon; other tall grass rolls, except for a few steps after an encounter.
  const cooling = game.cooldown > 0
  walked = { ...walked, cooldown: Math.max(0, game.cooldown - 1) }
  const rustled = !!game.rustling && pointKey(game.rustling) === key
  if (rustled) walked = { ...walked, rustling: null }
  if (rustled || (grass && !cooling && random() < GRASS_RATE)) {
    walked = { ...walked, ...meetWild(walked, area as Zone, random), cooldown: GRASS_COOLDOWN }
    events.push('encounter')
    messages.encounter = walked.message
  }
  if (walked.taken >= walked.nextRustleAt) {
    const rustling = placeRustle(walked, random, map)
    walked = { ...walked, rustling, nextRustleAt: walked.nextRustleAt + RUSTLE_EVERY }
    if (rustling) {
      events.push('rustle')
      messages.rustle = 'The grass is rustling nearby!'
    }
  }
  if (walked.steps <= 0 && !walked.encounter) {
    walked = { ...walked, status: 'complete' }
    events.push('out-of-steps')
    messages['out-of-steps'] = TIME_UP
  }
  const shown = (['encounter', 'out-of-steps', 'item', 'rustle', 'sign', 'area', 'grass'] as const).find(event => messages[event])
  return { game: shown ? { ...walked, message: messages[shown]! } : walked, move: hop ? 'hop' : 'step', events }
}

const TIME_UP = "Ding-dong! Time's up!"

// A tall-grass tile in the trainer's area, 2-6 tiles away (and not under the trainer or buddy), or null if none.
function placeRustle(game: ZoneGame, random: () => number, map: SafariMap): Point | null {
  const area = map.areas[game.at.y]?.[game.at.x]
  const candidates: Point[] = []
  for (let y = Math.max(0, game.at.y - 6); y <= Math.min(map.rows - 1, game.at.y + 6); y++) {
    for (let x = Math.max(0, game.at.x - 6); x <= Math.min(map.cols - 1, game.at.x + 6); x++) {
      const distance = Math.max(Math.abs(x - game.at.x), Math.abs(y - game.at.y))
      if (distance < 2 || map.tiles[y][x] !== 'g' || map.areas[y][x] !== area || (x === game.buddy.x && y === game.buddy.y)) continue
      candidates.push({ x, y })
    }
  }
  return candidates.length ? candidates[Math.floor(random() * candidates.length)] : null
}

// Runs a catch action (throw, bait, rock, run, tick, pause) on a zone game. A round whose steps ran out during an
// encounter ends once that encounter is over.
export function zoneAction(game: ZoneGame, change: (game: SafariGame) => SafariGame): ZoneGame {
  const next = change(game)
  if (next === game) return game
  const merged: ZoneGame = { ...game, ...next }
  return merged.status === 'playing' && !merged.encounter && merged.steps <= 0 ? { ...merged, status: 'complete', message: TIME_UP } : merged
}

export function confirmLeave(game: ZoneGame): ZoneGame {
  return game.prompt === 'gate' ? { ...game, status: 'complete', prompt: null, message: 'You left the Safari Zone.' } : game
}

export function stayInZone(game: ZoneGame): ZoneGame {
  return game.prompt ? { ...game, prompt: null } : game
}


const ORDER: Direction[] = ['north', 'south', 'west', 'east']
const OPPOSITE: Record<Direction, Direction> = { north: 'south', south: 'north', west: 'east', east: 'west' }
type Trail = Map<string, { from: string, direction: Direction } | null>

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

// Breadth-first over presses (a hop is one press), exploring north, south, west, east so routes are deterministic.
function search(start: Point, map: SafariMap): Trail {
  const trail: Trail = new Map([[pointKey(start), null]])
  const queue = [start]
  for (let i = 0; i < queue.length; i++) {
    for (const [direction, next] of moves(queue[i], map)) {
      if (trail.has(pointKey(next))) continue
      trail.set(pointKey(next), { from: pointKey(queue[i]), direction })
      queue.push(next)
    }
  }
  return trail
}

function routeTo(trail: Trail, key: string): Direction[] {
  const route: Direction[] = []
  for (let step = trail.get(key); step; step = trail.get(step.from)) route.unshift(step.direction)
  return route
}

export function reachableFrom(start: Point, map = safariMap): Set<string> {
  return new Set(search(start, map).keys())
}

// Tap-to-walk: the presses that reach a tapped tile. A wall, water or ledge walks to its nearest reachable side; the
// gate walks up to its door and steps into it, which asks before leaving. Null when there is no way there.
export function planWalk(from: Point, to: Point, map = safariMap): Direction[] | null {
  if (from.x === to.x && from.y === to.y) return []
  const trail = search(from, map)
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
