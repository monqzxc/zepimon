import { safariMap } from './safari-zone.ts'
import type { Direction, Point, SafariMap } from './safari-zone.ts'

// View maths for the Safari Zone screen, kept free of React so it can be tested: tile size, camera, which map chunks
// to load, sprite frames, and the queue that turns D-pad presses and tap routes into one step at a time.
export const STEP_MS = 220
const ACROSS = 9
// Chunks stay loaded 2 tiles past the screen edge, enough for a step or hop to glide in without a gap.
const MARGIN = 2
const FACING: Direction[] = ['south', 'north', 'west', 'east']

// How long until the next step may go: held walking lands each step exactly STEP_MS after the last, like the glide.
export const stepDelay = (now: number, lastStep: number) => Math.max(0, lastStep + STEP_MS - now)

// About 9 tiles across, between 40 and 64 px. Given a height too (the immersive map), the 9 tiles go across the shorter
// side, so a short, wide landscape view doesn't zoom in too far. A height under one 40 px tile is no map at all and is
// ignored, so `widths.map(tileSizeFor)` (which passes the index second) still reads the widths alone.
export function tileSizeFor(width: number, height?: number): number {
  const side = height !== undefined && height >= 40 ? Math.min(width, height) : width
  return Math.min(64, Math.max(40, Math.floor(side / ACROSS)))
}

// Where the map layer goes so the trainer's tile sits in the middle of the view.
export function cameraOffset(at: Point, tile: number, width: number, height: number): Point {
  return { x: Math.round(width / 2 - (at.x + 0.5) * tile), y: Math.round(height / 2 - (at.y + 0.5) * tile) }
}

export function tileFromTap(tap: Point, at: Point, tile: number, width: number, height: number): Point {
  const offset = cameraOffset(at, tile, width, height)
  return { x: Math.floor((tap.x - offset.x) / tile), y: Math.floor((tap.y - offset.y) / tile) }
}

// A small map shown whole (a Legendary's lair): the largest whole-pixel tile that fits it in the view, and the offset
// that centres it. The camera then stays put and the trainer walks across the map.
export function fitTile(width: number, height: number, map: Pick<SafariMap, 'cols' | 'rows'>): number {
  return Math.max(8, Math.floor(Math.min(width / map.cols, height / map.rows)))
}
export function fitOffset(tile: number, width: number, height: number, map: Pick<SafariMap, 'cols' | 'rows'>): Point {
  return { x: Math.round((width - map.cols * tile) / 2), y: Math.round((height - map.rows * tile) / 2) }
}

// Where a press landed inside the map. Phones report locationX/Y; on the web the press event is a DOM mouse event, which
// has offsetX/Y instead (relative to the map, since its layers let presses through).
export function tapPoint(event: { locationX?: number, locationY?: number, offsetX?: number, offsetY?: number }): Point {
  const pick = (location?: number, offset?: number) => Number.isFinite(location) ? location! : Number.isFinite(offset) ? offset! : 0
  return { x: pick(event.locationX, event.offsetX), y: pick(event.locationY, event.offsetY) }
}

export function chunksAround(at: Point, tile: number, width: number, height: number, map: Pick<SafariMap, 'cols' | 'rows' | 'chunk'> = safariMap): string[] {
  const offset = cameraOffset(at, tile, width, height)
  const span = (from: number, size: number, count: number) => [
    Math.floor(Math.max(0, Math.floor(-from / tile) - MARGIN) / map.chunk),
    Math.floor(Math.min(count - 1, Math.floor((size - 1 - from) / tile) + MARGIN) / map.chunk)]
  const [left, right] = span(offset.x, width, map.cols)
  const [top, bottom] = span(offset.y, height, map.rows)
  const keys: string[] = []
  for (let cy = top; cy <= bottom; cy++) for (let cx = left; cx <= right; cx++) keys.push(`${cx},${cy}`)
  return keys
}

// Trainer strips: stand, step A, step B for south, north, west, east. Buddy (trail) strips: two steps each, same order.
export const trainerFrame = (facing: Direction, phase: 0 | 1 | 2) => FACING.indexOf(facing) * 3 + phase
export const buddyFrame = (facing: Direction, step: 0 | 1) => FACING.indexOf(facing) * 2 + step

// held: the direction being pressed now. queued: a press not yet walked, so a quick tap still takes its step.
// path: a tap-to-walk route. A press drops the route; a new route drops the press.
export type Input = { held: Direction | null, queued: Direction | null, path: Direction[] }
export const noInput: Input = { held: null, queued: null, path: [] }

export function pressDirection(input: Input, direction: Direction): Input {
  return { held: direction, queued: direction, path: [] }
}

export function releaseDirection(input: Input, direction: Direction): Input {
  return input.held === direction ? { ...input, held: null } : input
}

export function followPath(input: Input, path: Direction[]): Input {
  return { held: null, queued: null, path }
}

export function takeInput(input: Input): { direction: Direction | null, input: Input } {
  if (input.queued) return { direction: input.queued, input: { ...input, queued: null } }
  if (input.held) return { direction: input.held, input }
  if (input.path.length) return { direction: input.path[0], input: { ...input, path: input.path.slice(1) } }
  return { direction: null, input }
}
