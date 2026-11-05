// Johto on the Adventure tab: the town map art (assets/route/johto.jpg) and the walkthrough across it (src/town-map.ts),
// one milestone at each town, city and route in the order the story visits them, from New Bark Town to Route 26 and
// the road to the League (HeartGold and SoulSilver: Falkner, Bugsy, Whitney, Morty, Chuck, Jasmine, Pryce, then Clair).
// The walk comes in from Kanto off the east edge. Places a later leg passes through again are walked over, not counted
// twice. Points are pixels on the map art.
import { nearestOf, roadPoint, roadTrail, townRoad, townStop as stop } from './town-map.ts'
import type { Point, TownStop } from './town-map.ts'

export const JOHTO_WIDTH = 1536
export const JOHTO_HEIGHT = 1024

// Where the walk comes in from Kanto: the road off the map's east edge, by the town there.
const entry: Point = [1536, 405]

// Roads that later legs walk again, named for the stretch they cover.
const coastEast: Point[] = [[1125, 635], [1230, 640], [1400, 640]]
const toLake: Point[] = [[885, 286], [862, 250], [856, 190]]
const westRoad: Point[] = [[415, 285], [480, 287], [575, 292]]
const harbour: Point[] = [[300, 470], [360, 480], [405, 440]]

export const johtoStops: TownStop[] = [
  stop('New Bark Town', [1435, 625], [[1478, 408], [1462, 470], [1462, 560]]),
  stop('Route 29', [1290, 637], [[1400, 640]]),
  stop('Cherrygrove City', [1150, 642], [[1230, 640]]),
  stop('Route 30', [1000, 628], [[1100, 632]]),
  stop('Route 31', [922, 505], [[935, 625], [922, 600]]),
  stop('Violet City', [800, 405], [[920, 440], [918, 405]]),
  // South past Union Cave to the peninsula.
  stop('Route 32', [762, 500], [[765, 420]]),
  stop('Route 33', [760, 600], [[762, 560]]),
  stop('Azalea Town', [735, 755], [[752, 660], [745, 700]]),
  // Through Ilex Forest.
  stop('Route 34', [665, 580], [[700, 705], [665, 650]]),
  stop('Goldenrod City', [615, 425], [[665, 500], [640, 485]]),
  stop('Route 35', [595, 335], [[595, 400]]),
  stop('Route 36', [700, 292], [[595, 292]]),
  stop('Route 37', [575, 245], [[575, 292]]),
  stop('Ecruteak City', [640, 262]),
  stop('Route 38', [480, 287], [[640, 290], [575, 292]]),
  stop('Route 39', [412, 325], [[415, 285]]),
  stop('Olivine City', [410, 385]),
  // Surfing west across the bay.
  stop('Route 40', [360, 480], [[405, 440]]),
  stop('Route 41', [270, 420], [[300, 470]]),
  stop('Cianwood City', [160, 405], [[230, 410]]),
  // With the medicine for the lighthouse's Ampharos, back across the bay and east past Ecruteak.
  stop('Route 42', [800, 292], [[230, 410], [270, 420], ...harbour, [410, 385], [412, 325], ...westRoad, [700, 292]]),
  stop('Mahogany Town', [930, 300], [[880, 292]]),
  // North to the Lake of Rage, then back through Mahogany and over the Ice Path.
  stop('Route 43', [858, 150], toLake),
  stop('Route 44', [1035, 300], [...toLake.slice().reverse(), [965, 302]]),
  stop('Blackthorn City', [1165, 258], [[1118, 300]]),
  // Down the valley to the coast, then home past New Bark Town and north to the League.
  stop('Route 45', [1118, 420], [[1118, 300]]),
  stop('Route 46', [1120, 560]),
  stop('Route 27', [1462, 520], [...coastEast, [1435, 625], [1462, 580]]),
  stop('Route 26', [1395, 300], [[1462, 470], [1420, 420], [1420, 340], [1395, 335]])
]

export const johtoPlaces = johtoStops.map(item => item.name)
export const johtoRoad = townRoad(johtoStops, entry)

// Where a distance from the edge where the walk comes in stands on the map, and the walk split there.
export const johtoPoint = (meters: number, milestone: number) => roadPoint(johtoRoad, meters, milestone)
export const johtoTrail = (meters: number, milestone: number) => roadTrail(johtoRoad, meters, milestone)
export const nearestJohto = (point: Point) => nearestOf(johtoStops, point)
