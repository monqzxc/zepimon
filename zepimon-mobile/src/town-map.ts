// A region's town map on the Adventure tab (Kanto in src/kanto-map.ts, Johto in src/johto-map.ts): the walkthrough
// across its art as stops, one milestone each, in the order the story visits them. Points are pixels on the map art.
// A region after the first can have an entry, where its walk comes in from the region before at the map's edge: the
// milestone before its first stop is then the entry, so the walk to its first stop is drawn too.
export type Point = [number, number]
// A stop: where its marker stands, the roads walked from the stop before (via), and whether it is a town or city.
export type TownStop = { name: string, at: Point, via: Point[], city: boolean }
// The walk as roads, one per milestone: legs[i] ends at the (i + 1)th milestone from the road's start, which is the
// first stop, or the entry.
export type TownRoad = { stops: TownStop[], legs: Point[][], start: Point }

export const townStop = (name: string, at: Point, via: Point[] = []): TownStop => ({ name, at, via, city: !name.startsWith('Route ') })

export function townRoad(stops: TownStop[], entry?: Point): TownRoad {
  const legs = stops.slice(1).map((item, i) => [stops[i].at, ...item.via, item.at])
  if (entry) legs.unshift([entry, ...stops[0].via, stops[0].at])
  return { stops, legs, start: entry ?? stops[0].at }
}

const length = ([ax, ay]: Point, [bx, by]: Point) => Math.hypot(bx - ax, by - ay)
const lerp = ([ax, ay]: Point, [bx, by]: Point, share: number): Point => [ax + (bx - ax) * share, ay + (by - ay) * share]

// The point a share of the way along a road, by length walked.
function along(road: Point[], share: number): Point {
  const total = road.slice(1).reduce((sum, point, i) => sum + length(road[i], point), 0)
  let left = Math.max(0, Math.min(1, share)) * total
  for (let i = 1; i < road.length; i++) {
    const step = length(road[i - 1], road[i])
    if (left <= step) return step ? lerp(road[i - 1], road[i], left / step) : road[i]
    left -= step
  }
  return road[road.length - 1]
}

// Where a distance from the road's start stands on the map: at a stop, or the share of the way along the road to the
// next one. Before the start it waits there; past the last stop it stays on it.
export function roadPoint({ legs, start }: TownRoad, meters: number, milestone: number): Point {
  const leg = Math.floor(Math.max(0, meters) / milestone)
  if (leg >= legs.length) return legs.length ? legs[legs.length - 1].at(-1)! : start
  return along(legs[leg], (Math.max(0, meters) - leg * milestone) / milestone)
}

// The walk split at a distance from the road's start: the roads walked so far, and the roads still ahead, each one
// line of points.
export function roadTrail(road: TownRoad, meters: number, milestone: number): { walked: Point[], ahead: Point[] } {
  const { legs } = road
  const leg = Math.floor(Math.max(0, meters) / milestone)
  const here = roadPoint(road, meters, milestone)
  const before = legs.slice(0, leg).flatMap((points, i) => i ? points.slice(1) : points)
  if (leg >= legs.length) return { walked: before, ahead: [] }
  const current = legs[leg]
  const share = (Math.max(0, meters) - leg * milestone) / milestone
  // The current leg's points already passed, by how far along they lie.
  const lengths = current.map((point, i) => current.slice(1, i + 1).reduce((sum, next, j) => sum + length(current[j], next), 0))
  const total = lengths[lengths.length - 1]
  const passed = current.filter((_, i) => lengths[i] < share * total)
  const walked = [...before, ...(before.length ? passed.slice(1) : passed), here]
  const ahead = [here, ...current.filter((_, i) => lengths[i] > share * total),
    ...legs.slice(leg + 1).flatMap(next => next.slice(1))]
  return { walked, ahead }
}

// The stop nearest a point on the map, for naming the place in view.
export function nearestOf(stops: TownStop[], [x, y]: Point): number {
  let best = 0
  stops.forEach((item, i) => { if (length(item.at, [x, y]) < length(stops[best].at, [x, y])) best = i })
  return best
}

// How far the map may be dragged at a zoom: its edges no further in than the screen's, its top no lower than `top` and
// its bottom no higher than `bottom`; a map smaller than the screen that way is centred instead. The map is drawn at
// `map` size at zoom 1, from its top left corner. A worklet, as the camera moves on the UI thread.
export type Camera = { x: number, y: number }
export type CameraBounds = { minX: number, maxX: number, minY: number, maxY: number }
export function cameraBounds(zoom: number, map: { width: number, height: number }, view: { width: number, top: number, bottom: number }): CameraBounds {
  'worklet'
  const lowX = view.width - map.width * zoom, lowY = view.bottom - map.height * zoom
  const [minX, maxX] = lowX > 0 ? [lowX / 2, lowX / 2] : [lowX, 0]
  const [minY, maxY] = lowY > view.top ? [(lowY + view.top) / 2, (lowY + view.top) / 2] : [lowY, view.top]
  return { minX, maxX, minY, maxY }
}
export function clampCamera(at: Camera, bounds: CameraBounds): Camera {
  'worklet'
  return { x: Math.max(bounds.minX, Math.min(bounds.maxX, at.x)), y: Math.max(bounds.minY, Math.min(bounds.maxY, at.y)) }
}
