// Kanto on the Adventure tab: the town map art (assets/route/kanto.jpg) and the walkthrough across it, one milestone
// every 5 km at each town, city and route in the order the story visits them, from Pallet Town to the Indigo Plateau
// (FireRed and LeafGreen: Brock, Misty, Lt. Surge, Erika, Koga, Sabrina, Blaine, Giovanni, then Victory Road). Places
// a later leg passes through again are walked over, not counted twice. Points are pixels on the map art.
export const KANTO_WIDTH = 1472
export const KANTO_HEIGHT = 1069

export type Point = [number, number]
// A stop: where its marker stands, the roads walked from the stop before (via), and whether it is a town or city.
export type KantoStop = { name: string, at: Point, via: Point[], city: boolean }

const stop = (name: string, at: Point, via: Point[] = []): KantoStop => ({ name, at, via, city: !name.startsWith('Route ') })

// Roads that later legs walk again, named for the stretch they cover.
const viridianToRoute22: Point[] = [[300, 482]]
const lavenderEast: Point[] = [[1300, 380]]
const saffronToCeladon: Point[] = [[875, 360], [775, 360]]
const celadonToFuchsia: Point[] = [[490, 362], [492, 808], [665, 810]]

export const kantoStops: KantoStop[] = [
  stop('Pallet Town', [320, 672]),
  stop('Route 1', [322, 590], [[322, 640]]),
  stop('Viridian City', [340, 495], [[322, 525]]),
  // The rival waits on Route 22 once Oak has his parcel.
  stop('Route 22', [215, 480], viridianToRoute22),
  stop('Route 2', [345, 360], [...viridianToRoute22, [340, 470], [345, 420]]),
  stop('Pewter City', [340, 215], [[345, 290], [340, 250]]),
  stop('Route 3', [480, 217], [[395, 218]]),
  // Through Mt. Moon.
  stop('Route 4', [790, 167], [[610, 215], [650, 180], [700, 167]]),
  stop('Cerulean City', [945, 175], [[905, 167]]),
  stop('Route 24', [945, 100]),
  stop('Route 25', [1150, 75], [[945, 45], [1065, 45], [1070, 75]]),
  stop('Route 5', [945, 270], [[1070, 75], [1065, 45], [945, 45], [945, 175]]),
  stop('Route 6', [953, 480], [[945, 325], [950, 380], [955, 430]]),
  stop('Vermilion City', [945, 570], [[955, 530]]),
  stop('Route 11', [1160, 590], [[1000, 590]]),
  // Back north through Saffron's roads to Cerulean, then east.
  stop('Route 9', [1150, 165], [[1000, 590], [945, 570], [955, 430], [950, 380], [945, 325], [945, 175], [1005, 165]]),
  stop('Route 10', [1338, 245], [[1335, 165]]),
  stop('Lavender Town', [1330, 385], [[1335, 345]]),
  stop('Route 8', [1150, 372], lavenderEast),
  stop('Route 7', [825, 362], [[1150, 360], [1030, 360], [950, 360], [875, 360]]),
  stop('Celadon City', [690, 360], [[775, 360]]),
  // With the Silph Scope from Celadon, back to Lavender's tower, then south past the sleeping Snorlax.
  stop('Route 12', [1345, 640], [[775, 360], [875, 360], [1030, 360], [1150, 360], ...lavenderEast, [1330, 385], [1340, 415], [1340, 560]]),
  stop('Route 13', [1220, 760], [[1345, 760]]),
  stop('Route 14', [1080, 785], [[1080, 760]]),
  stop('Route 15', [930, 810], [[1080, 810]]),
  stop('Fuchsia City', [720, 820], [[800, 810]]),
  // North again up the Cycling Road.
  stop('Route 18', [560, 808], [[665, 810]]),
  stop('Route 17', [492, 580], [[492, 808]]),
  stop('Route 16', [560, 362], [[490, 362]]),
  stop('Saffron City', [950, 380], [[690, 360], ...saffronToCeladon.slice().reverse()]),
  // Down to Fuchsia's beach to Surf south.
  stop('Route 19', [725, 920], [...saffronToCeladon, [690, 360], ...celadonToFuchsia, [720, 850], [720, 890]]),
  stop('Route 20', [520, 960], [[700, 960]]),
  stop('Cinnabar Island', [280, 975], [[370, 965]]),
  stop('Route 21', [295, 830], [[290, 925]]),
  // Home through Pallet, Viridian's last Gym, and west to Victory Road.
  stop('Route 23', [130, 455], [[295, 740], [320, 672], [322, 590], [322, 525], [340, 495], ...viridianToRoute22, [125, 480]]),
  stop('Indigo Plateau', [133, 35], [[135, 300], [135, 100]])
]

export const kantoPlaces = kantoStops.map(item => item.name)

const length = ([ax, ay]: Point, [bx, by]: Point) => Math.hypot(bx - ax, by - ay)
const lerp = ([ax, ay]: Point, [bx, by]: Point, share: number): Point => [ax + (bx - ax) * share, ay + (by - ay) * share]

// Each leg's road from the stop before to the next, as points; legs[i] ends at stop i + 1.
const legs: Point[][] = kantoStops.slice(1).map((item, i) => [kantoStops[i].at, ...item.via, item.at])

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

// Where a distance stands on the map: at a stop, or the share of the way along the road to the next one. Past the
// Indigo Plateau it stays there.
export function kantoPoint(meters: number, milestone: number): Point {
  const leg = Math.floor(Math.max(0, meters) / milestone)
  if (leg >= legs.length) return kantoStops[kantoStops.length - 1].at
  return along(legs[leg], (Math.max(0, meters) - leg * milestone) / milestone)
}

// The walkthrough split at a distance: the roads walked so far, and the roads still ahead, each one line of points.
export function kantoTrail(meters: number, milestone: number): { walked: Point[], ahead: Point[] } {
  const leg = Math.floor(Math.max(0, meters) / milestone)
  const here = kantoPoint(meters, milestone)
  const before = legs.slice(0, leg).flatMap((road, i) => i ? road.slice(1) : road)
  if (leg >= legs.length) return { walked: before, ahead: [] }
  const road = legs[leg]
  const share = (Math.max(0, meters) - leg * milestone) / milestone
  // The current leg's points already passed, by how far along they lie.
  const lengths = road.map((point, i) => road.slice(1, i + 1).reduce((sum, next, j) => sum + length(road[j], next), 0))
  const total = lengths[lengths.length - 1]
  const passed = road.filter((_, i) => lengths[i] < share * total)
  const walked = [...before, ...(before.length ? passed.slice(1) : passed), here]
  const ahead = [here, ...road.filter((_, i) => lengths[i] > share * total),
    ...legs.slice(leg + 1).flatMap(next => next.slice(1))]
  return { walked, ahead }
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

// The stop nearest a point on the map, for naming the place in view.
export function nearestStop([x, y]: Point): number {
  let best = 0
  kantoStops.forEach((item, i) => { if (length(item.at, [x, y]) < length(kantoStops[best].at, [x, y])) best = i })
  return best
}
