import { STEPS, pointKey } from './safari-zone.ts'
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

const WALKABLE = '.,g@*w_'

function blockedText(tile: string): string {
  if (tile === '~') return 'The water is too deep to cross.'
  if (tile === 'R') return 'A boulder is in the way.'
  return 'A wall is in the way.'
}

export function startRoom(stage: Stage): Room {
  let at: Point = { x: 0, y: 0 }
  stage.tiles.forEach((row, y) => { const x = row.indexOf('@'); if (x >= 0) at = { x, y } })
  const boulders: string[] = []
  stage.tiles.forEach((row, y) => [...row].forEach((tile, x) => { if (tile === 'O') boulders.push(pointKey({ x, y })) }))
  const room: Room = { stage: stage.id, at, facing: 'south', buddy: at, buddyFacing: 'south', moves: 0, relics: [], open: stage.open, boulders, holes: [],
    doorsOpen: false, seen: [], warpsUsed: [], lit: [...(stage.star?.startLit ?? [])].sort(), pattern: 0, attunes: 0, cluesRead: [], status: 'playing', message: '' }
  return { ...room, seen: around(stage, at, stage.dark ? LIGHT : SIGHT) }
}

// Every relic is collected. (Later rules add the cracked-floor and meteorite goals.) `leaving` is the exit tile being stepped onto.
export function goalsMet(room: Room, stage: Stage, _leaving?: Point): boolean {
  return room.relics.length >= relicsIn(stage)
}

// Tiles you can see right now: around you, and in a dark room also around every wall torch.
export function lit(room: Room, stage: Stage): Set<string> {
  const tiles = new Set(around(stage, room.at, stage.dark ? LIGHT : SIGHT))
  if (stage.dark) stage.tiles.forEach((row, y) => [...row].forEach((tile, x) => { if (tile === '!') around(stage, { x, y }, TORCH).forEach(key => tiles.add(key)) }))
  return tiles
}

// One press of a direction. Facing always turns; a bump costs no move; nothing happens once the room is over.
export function stepRoom(room: Room, stage: Stage, direction: Direction): RoomResult {
  if (room.status !== 'playing') return { room, move: 'none', events: [] }
  const turned = { ...room, facing: direction }
  const next = { x: room.at.x + STEPS[direction].x, y: room.at.y + STEPS[direction].y }
  const tile = tileAt(stage, next)
  const events: RoomEvent[] = []
  if (tile === 'X' && !goalsMet(room, stage, next)) {
    const left = relicsIn(stage) - room.relics.length
    return { room: { ...turned, message: `The seal holds. ${left} ${left === 1 ? 'relic remains' : 'relics remain'}.` }, move: 'bump', events: ['locked'] }
  }
  if (tile !== 'X' && !WALKABLE.includes(tile)) return { room: { ...turned, message: blockedText(tile) }, move: 'bump', events }
  let walked: Room = { ...turned, at: next, buddy: room.at, buddyFacing: direction, moves: room.moves + 1 }
  let message = ''
  const key = pointKey(next)
  if (tile === '*' && !room.relics.includes(key)) {
    walked = { ...walked, relics: [...room.relics, key] }
    events.push('relic')
    const left = relicsIn(stage) - walked.relics.length
    message = left ? `You found a relic! ${left} to go.` : 'You found the last relic! The seal opens.'
  }
  if (tile === 'X') {
    walked = { ...walked, status: 'cleared' }
    events.push('clear')
    message = 'The seal breaks. The way is open!'
  }
  walked = { ...walked, seen: merge(walked.seen, around(stage, next, stage.dark ? LIGHT : SIGHT)), message }
  return { room: walked, move: 'step', events }
}
