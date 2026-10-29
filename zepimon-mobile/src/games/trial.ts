import { STEPS, pointKey, routeSearch, routeTo } from './safari-zone.ts'
import type { Direction, Point } from './safari-zone.ts'

// Rules for a Legendary trial room: one tile per press on a grid of characters, the same walk as the Safari Zone.
// A stage is authored data; a Room is the saved state of a run through it and is JSON-safe (points are pointKey strings).
export type TrialKind = 'switch' | 'crumble' | 'dark' | 'temple' | 'warp' | 'star'
export type StarNode = { id: string, at: [number, number], links: string[], turns: number, opens?: string }
export type StarRules = { nodes: StarNode[], patterns: number, startLit: string[], target: { lit: string[], pattern: number }, resetOnFail: boolean,
  clues: { at: [number, number], text: string, reveals: string[] }[], hints: [string, string, string] }
export type Stage = { id: string, kind: TrialKind, tiles: readonly string[], warps: Record<string, string>, open: string, crackAll: boolean,
  dark: boolean, par: number, hint: string, star: StarRules | null }
export type Room = { stage: string, at: Point, facing: Direction, buddy: Point, buddyFacing: Direction, moves: number, relics: string[], open: string,
  boulders: string[], holes: string[], doorsOpen: boolean, seen: string[], warpsUsed: string[], lit: string[], pattern: number, attunes: number,
  cluesRead: string[], status: 'playing' | 'fell' | 'cleared', message: string }
export type RoomEvent = 'relic' | 'switch' | 'plates' | 'crack' | 'fall' | 'warp' | 'locked' | 'node' | 'clue' | 'attune' | 'clear'
export type RoomResult = { room: Room, move: 'step' | 'push' | 'warp' | 'bump' | 'none', events: RoomEvent[] }

// How far you see in a lit room, by your own light in a dark one, and around a wall torch. A tile is within radius r when dx² + dy² ≤ r² + r.
export const SIGHT = 4, LIGHT = 2, TORCH = 1

const tileAt = (stage: Stage, point: Point) => stage.tiles[point.y]?.[point.x] ?? '#'
const near = (a: Point, b: Point, radius: number) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= radius * radius + radius
const around = (stage: Stage, center: Point, radius: number): string[] => {
  const found: string[] = []
  stage.tiles.forEach((row, y) => [...row].forEach((_, x) => { if (near(center, { x, y }, radius)) found.push(pointKey({ x, y })) }))
  return found
}
const relicsIn = (stage: Stage) => stage.tiles.reduce((total, row) => total + [...row].filter(tile => tile === '*').length, 0)
const merge = (seen: string[], more: string[]) => [...new Set([...seen, ...more])]

const WALKABLE = '.,g@*w_abc:O123456789'
// Ground a boulder can rest on (the grid's own `O` is a boulder on ground).
const GROUND = '.,g@w_O'

function blockedText(tile: string): string {
  if (tile === '~') return 'The water is too deep to cross.'
  if (tile === '=') return 'The stone door is sealed.'
  if (tile === 'R') return 'A boulder is in the way.'
  if ('ABC'.includes(tile)) return 'The gate is shut.'
  return 'A wall is in the way.'
}

const plates = (stage: Stage) => stage.tiles.flatMap((row, y) => [...row].flatMap((tile, x) => tile === '_' ? [pointKey({ x, y })] : []))

// Cells a boulder can never be pushed to a plate from, found by pulling a boulder backwards from every plate: a pull from c to c+d
// needs c+2d to stand on. Rooms with no plates have none (boulders are only obstacles there). Cached per stage (id and grid, so edited data never reads a stale answer).
const deadCache = new Map<string, Set<string>>()
export function deadCells(stage: Stage): ReadonlySet<string> {
  const id = `${stage.id}|${stage.tiles.join('/')}`
  const cached = deadCache.get(id)
  if (cached) return cached
  const ground = (point: Point) => GROUND.includes(tileAt(stage, point))
  // The boulder rests on ground; the player pulling it may stand on anything that is not solid (over-approximating keeps 'dead' safe).
  const standable = (point: Point) => !'#!~R?M'.includes(tileAt(stage, point))
  const good = new Set(plates(stage))
  const queue = [...good]
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i].split(',').map(Number)
    for (const step of Object.values(STEPS)) {
      const to = { x: x + step.x, y: y + step.y }, stand = { x: x + 2 * step.x, y: y + 2 * step.y }
      if (!ground(to) || !standable(stand) || good.has(pointKey(to))) continue
      good.add(pointKey(to))
      queue.push(pointKey(to))
    }
  }
  const dead = new Set<string>()
  if (good.size) stage.tiles.forEach((row, y) => [...row].forEach((_, x) => { if (ground({ x, y }) && !good.has(pointKey({ x, y }))) dead.add(pointKey({ x, y })) }))
  deadCache.set(id, dead)
  return dead
}

// Passages of every lit crystal are open, and stay open: this only ever adds letters.
const openedBy = (star: StarRules, litIds: string[], open: string) =>
  [...new Set(open + star.nodes.flatMap(n => n.opens && litIds.includes(n.id) ? [n.opens] : []).join(''))].sort().join('')

export function startRoom(stage: Stage): Room {
  let at: Point = { x: 0, y: 0 }
  stage.tiles.forEach((row, y) => { const x = row.indexOf('@'); if (x >= 0) at = { x, y } })
  const boulders: string[] = []
  stage.tiles.forEach((row, y) => [...row].forEach((tile, x) => { if (tile === 'O') boulders.push(pointKey({ x, y })) }))
  const room: Room = { stage: stage.id, at, facing: 'south', buddy: at, buddyFacing: 'south', moves: 0, relics: [], open: [...stage.open].sort().join(''), boulders, holes: [],
    doorsOpen: false, seen: [], warpsUsed: [], lit: [...(stage.star?.startLit ?? [])].sort(), pattern: 0, attunes: 0, cluesRead: [], status: 'playing', message: '' }
  return { ...room, open: stage.star ? openedBy(stage.star, room.lit, room.open) : room.open, seen: around(stage, at, stage.dark ? LIGHT : SIGHT) }
}

const fragileLeft = (room: Room, stage: Stage, leaving?: Point) => stage.tiles.reduce((total, row, y) => total + [...row].filter((tile, x) =>
  tile === ':' && !room.holes.includes(pointKey({ x, y })) && !(leaving && leaving.x === x && leaving.y === y)).length, 0)

// Every relic is collected and, in crackAll rooms, every fragile tile is a hole. (Later rules add the meteorite goal.)
// `leaving` is the tile being stepped off, which crumbles as the trainer goes and so counts as gone.
export function goalsMet(room: Room, stage: Stage, leaving?: Point): boolean {
  return room.relics.length >= relicsIn(stage) && (!stage.crackAll || fragileLeft(room, stage, leaving) === 0)
}

// Tiles you can see right now: around you, and in a dark room also around every wall torch.
export function lit(room: Room, stage: Stage): Set<string> {
  const tiles = new Set(around(stage, room.at, stage.dark ? LIGHT : SIGHT))
  if (stage.dark) stage.tiles.forEach((row, y) => [...row].forEach((tile, x) => { if (tile === '!') around(stage, { x, y }, TORCH).forEach(key => tiles.add(key)) }))
  return tiles
}

const padAt = (stage: Stage, pad?: string): Point | null => {
  if (!pad) return null
  for (let y = 0; y < stage.tiles.length; y++) { const x = stage.tiles[y].indexOf(pad); if (x >= 0) return { x, y } }
  return null
}

// One press of a direction. Facing always turns; a bump costs no move; nothing happens once the room is over.
export function stepRoom(room: Room, stage: Stage, direction: Direction): RoomResult {
  if (room.status !== 'playing') return { room, move: 'none', events: [] }
  const turned = { ...room, facing: direction }
  const next = { x: room.at.x + STEPS[direction].x, y: room.at.y + STEPS[direction].y }
  const tile = tileAt(stage, next)
  const events: RoomEvent[] = []
  const star = stage.star
  if (star && tile === '?') {
    const clue = star.clues.find(c => c.at[0] === next.x && c.at[1] === next.y)
    if (clue) return { room: { ...turned, cluesRead: merge(room.cluesRead, [pointKey(next)]), message: clue.text }, move: 'bump', events: ['clue'] }
  }
  if (star && tile === 'M') {
    if (sameSet(room.lit, star.target.lit) && room.pattern === star.target.pattern) {
      return { room: { ...turned, status: 'cleared', message: 'The meteorite wakes. The island remembers!' }, move: 'bump', events: ['clear'] }
    }
    const { matching, total } = resonance(room, stage)
    const message = `The meteorite flickers. ${matching} of ${total} lights answer.`
    const failed = { ...turned, attunes: room.attunes + 1, message }
    return { room: star.resetOnFail ? resetAlignment(failed, stage) : failed, move: 'bump', events: ['attune'] }
  }
  if (tile === 'X' && !goalsMet(room, stage, room.at)) {
    const left = relicsIn(stage) - room.relics.length
    const message = left ? `The seal holds. ${left} ${left === 1 ? 'relic remains' : 'relics remain'}.` : 'Cross every cracked tile to open the way.'
    return { room: { ...turned, message }, move: 'bump', events: ['locked'] }
  }
  const key = pointKey(next)
  let boulders = room.boulders
  let pushed = false
  if (room.boulders.includes(key)) {
    const far = { x: next.x + STEPS[direction].x, y: next.y + STEPS[direction].y }, farTile = tileAt(stage, far)
    let refusal = ''
    if (room.boulders.includes(pointKey(far))) refusal = "The boulder won't budge."
    else if (farTile === '#' || farTile === '!') refusal = blockedText(farTile)
    else if (!GROUND.includes(farTile)) refusal = "The boulder won't fit through there."
    else if (deadCells(stage).has(pointKey(far))) refusal = 'The boulder would get stuck there.'
    if (refusal) return { room: { ...turned, message: refusal }, move: 'bump', events }
    boulders = room.boulders.map(at => at === key ? pointKey(far) : at)
    pushed = true
  }
  const gate = 'ABC'.includes(tile) && room.open.includes(tile)
  const door = tile === '=' && room.doorsOpen
  if (tile !== 'X' && !gate && !door && !pushed && !WALKABLE.includes(tile) && tile !== '%') return { room: { ...turned, message: blockedText(tile) }, move: 'bump', events }
  let walked: Room = { ...turned, at: next, buddy: room.at, buddyFacing: direction, moves: room.moves + 1, boulders }
  let message = ''
  if (pushed && !room.doorsOpen && plates(stage).length && plates(stage).every(plate => boulders.includes(plate))) {
    walked = { ...walked, doorsOpen: true }
    events.push('plates')
    message = 'A stone door grinds open.'
  }
  if (tileAt(stage, room.at) === ':') {
    walked = { ...walked, holes: [...room.holes, pointKey(room.at)] }
    events.push('crack')
  }
  if (tile === ':' && room.holes.includes(key)) {
    walked = { ...walked, status: 'fell' }
    events.push('fall')
    message = 'The floor gave way!'
  }
  if (tile === '*' && !room.relics.includes(key)) {
    walked = { ...walked, relics: [...room.relics, key] }
    events.push('relic')
    const left = relicsIn(stage) - walked.relics.length
    message = left ? `You found a relic! ${left} to go.` : 'You found the last relic! The seal opens.'
  }
  if ('abc'.includes(tile)) {
    const group = tile.toUpperCase()
    walked = { ...walked, open: [...(room.open.includes(group) ? room.open.replace(group, '') : room.open + group)].sort().join('') }
    events.push('switch')
    message = room.open.includes(group) ? 'A gate swings shut.' : 'A gate swings open.'
  }
  const node = star && tile === '%' ? star.nodes.find(n => n.at[0] === next.x && n.at[1] === next.y) : undefined
  if (star && node) {
    const flip = new Set(room.lit)
    for (const id of [node.id, ...node.links]) { if (!flip.delete(id)) flip.add(id) }
    const lit = [...flip].sort()
    const open = openedBy(star, lit, room.open)
    walked = { ...walked, lit, open, pattern: (room.pattern + node.turns) % star.patterns }
    events.push('node')
  }
  if (tile === 'X') {
    walked = { ...walked, status: 'cleared' }
    events.push('clear')
    message = 'The seal breaks. The way is open!'
  }
  let move: RoomResult['move'] = pushed ? 'push' : 'step'
  const pair = /[1-9]/.test(tile) ? padAt(stage, stage.warps[tile]) : null
  if (pair) {
    walked = { ...walked, at: pair, buddy: pair, warpsUsed: walked.warpsUsed.includes(tile) ? walked.warpsUsed : [...walked.warpsUsed, tile] }
    events.push('warp')
    move = 'warp'
    message = 'The pad whisks you across the chamber.'
  }
  walked = { ...walked, seen: merge(merge(walked.seen, around(stage, next, stage.dark ? LIGHT : SIGHT)), around(stage, walked.at, stage.dark ? LIGHT : SIGHT)), message }
  return { room: walked, move, events }
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i])

// How many of the star's lights answer: crystals in their target state, plus the pattern, out of crystals + 1.
export function resonance(room: Room, stage: Stage): { matching: number, total: number } {
  const star = stage.star
  if (!star) return { matching: 0, total: 0 }
  const matching = star.nodes.filter(n => room.lit.includes(n.id) === star.target.lit.includes(n.id)).length + (room.pattern === star.target.pattern ? 1 : 0)
  return { matching, total: star.nodes.length + 1 }
}

// Reset the crystals: the alignment only. Position, seen tiles, clues, opened passages and attunes stay.
export const resetAlignment = (room: Room, stage: Stage): Room => ({ ...room, lit: [...(stage.star?.startLit ?? [])].sort(), pattern: 0 })

// A hint tier unlocks for every two failed attunes, up to three.
export const hintTier = (room: Room): 0 | 1 | 2 | 3 => Math.min(3, Math.floor(room.attunes / 2)) as 0 | 1 | 2 | 3

const ORDER: Direction[] = ['north', 'south', 'west', 'east']

// 'free' tiles can be crossed without side effects; 'end' tiles (switches, fragile floor, live pads, crystals, the exit) only end a route.
function crossing(room: Room, stage: Stage, point: Point): 'free' | 'end' | null {
  const tile = tileAt(stage, point), key = pointKey(point)
  if (room.boulders.includes(key)) return null
  if ('.,g@w_O*'.includes(tile)) return 'free'
  if ('ABC'.includes(tile)) return room.open.includes(tile) ? 'free' : null
  if (tile === '=') return room.doorsOpen ? 'free' : null
  if (tile === ':') return room.holes.includes(key) ? null : 'end'
  if ('abcX%'.includes(tile)) return 'end'
  if (/[1-9]/.test(tile)) return stage.warps[tile] ? 'end' : 'free'
  return null
}

// Tap-to-walk: the presses that reach a tapped tile without stepping on anything that acts (see crossing); a tile that acts can be the
// last step. A wall, boulder or other blocked tile walks to its nearest reachable side. Null when there is no way there.
export function planRoomWalk(room: Room, stage: Stage, to: Point): Direction[] | null {
  if (room.at.x === to.x && room.at.y === to.y) return []
  const trail = routeSearch(room.at, point => {
    if (pointKey(point) !== pointKey(room.at) && crossing(room, stage, point) !== 'free') return []
    return ORDER.flatMap((direction): [Direction, Point][] => {
      const next = { x: point.x + STEPS[direction].x, y: point.y + STEPS[direction].y }
      return crossing(room, stage, next) ? [[direction, next]] : []
    })
  })
  if (crossing(room, stage, to)) return trail.has(pointKey(to)) ? routeTo(trail, pointKey(to)) : null
  let best: Direction[] | null = null
  for (const direction of ORDER) {
    const side = { x: to.x + STEPS[direction].x, y: to.y + STEPS[direction].y }, key = pointKey(side)
    if (!trail.has(key) || (key !== pointKey(room.at) && crossing(room, stage, side) !== 'free')) continue
    const route = routeTo(trail, key)
    if (!best || route.length < best.length) best = route
  }
  return best
}
