// Kanto on the Adventure tab: the town map art (assets/route/kanto.jpg) and the walkthrough across it (src/town-map.ts),
// one milestone at each town, city and route in the order the story visits them, from Pallet Town to the Indigo Plateau
// (FireRed and LeafGreen: Brock, Misty, Lt. Surge, Erika, Koga, Sabrina, Blaine, Giovanni, then Victory Road). Places
// a later leg passes through again are walked over, not counted twice. Points are pixels on the map art.
import { cameraBounds, clampCamera, nearestOf, roadPoint, roadTrail, townRoad, townStop } from './town-map.ts'
import type { Point, TownStop } from './town-map.ts'
export { cameraBounds, clampCamera }
export type { Camera, CameraBounds, Point } from './town-map.ts'
export type KantoStop = TownStop

export const KANTO_WIDTH = 1472
export const KANTO_HEIGHT = 1069

const stop = townStop

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
export const kantoRoad = townRoad(kantoStops)

// Where a distance stands on the map: at a stop, or the share of the way along the road to the next one. Past the
// Indigo Plateau it stays there.
export const kantoPoint = (meters: number, milestone: number) => roadPoint(kantoRoad, meters, milestone)
// The walkthrough split at a distance: the roads walked so far, and the roads still ahead, each one line of points.
export const kantoTrail = (meters: number, milestone: number) => roadTrail(kantoRoad, meters, milestone)
// The stop nearest a point on the map, for naming the place in view.
export const nearestStop = (point: Point) => nearestOf(kantoStops, point)
