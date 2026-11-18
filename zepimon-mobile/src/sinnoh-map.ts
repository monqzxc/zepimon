// Sinnoh on the Adventure tab: the town map art (assets/route/sinnoh.jpg) and the walkthrough across it (src/town-map.ts),
// one milestone at each town, city and route in the order the journey visits them, from Twinleaf Town to Route 223 and
// the sea road to the League (Diamond, Pearl and Platinum: Roark, Gardenia, Maylene, Crasher Wake, Fantina, Byron,
// Candice, then Volkner). The walk comes in from Hoenn by boat off the south edge. Places a later leg passes through
// again are walked over, not counted twice. Points are pixels on the map art.
import { nearestOf, roadPoint, roadTrail, townRoad, townStop as stop } from './town-map.ts'
import type { Point, TownStop } from './town-map.ts'

export const SINNOH_WIDTH = 1536
export const SINNOH_HEIGHT = 1024

// Where the walk comes in from the region before: off the map's south edge, by sea.
const entry: Point = [341, 1024]

export const sinnohStops: TownStop[] = [
  stop('Twinleaf Town', [341, 765], [[341, 874]]),
  stop('Route 201', [410, 700], [[371, 737], [375, 700]]),
  stop('Sandgem Town', [478, 666], [[471, 700]]),
  stop('Route 202', [481, 612]),
  stop('Jubilife City', [485, 567]),
  stop('Route 203', [594, 563], [[539, 563]]),
  stop('Oreburgh City', [683, 567]),
  // Back through Jubilife and north.
  stop('Route 204', [485, 492], [[594, 563], [485, 567], [485, 532]]),
  stop('Floaroma Town', [485, 444]),
  stop('Route 205', [563, 399], [[519, 410]]),
  stop('Eterna City', [689, 314], [[546, 341], [642, 335]]),
  // South down the Cycling Road and into Mt. Coronet.
  stop('Route 206', [689, 396], [[689, 348]]),
  stop('Route 207', [730, 508], [[689, 451], [696, 492]]),
  stop('Route 208', [826, 498]),
  stop('Hearthome City', [908, 489]),
  stop('Route 209', [976, 467]),
  stop('Solaceon Town', [1044, 457]),
  stop('Route 210', [1010, 366], [[1051, 410]]),
  stop('Celestic Town', [942, 341]),
  stop('Route 211', [853, 321]),
  // From Celestic back past Hearthome and south through the rain to Pastoria.
  stop('Route 212', [972, 737], [[942, 341], [908, 410], [908, 489], [942, 614]]),
  stop('Pastoria City', [1047, 912], [[997, 799], [1035, 881]]),
  stop('Route 213', [1154, 713], [[1035, 881], [1085, 812]]),
  stop('Route 214', [1208, 683]),
  stop('Veilstone City', [1222, 639]),
  stop('Route 215', [1092, 471], [[1174, 601], [1133, 546]]),
  // West across Mt. Coronet and Jubilife to the sea route and Canalave.
  stop('Route 218', [380, 494], [[1044, 457], [976, 467], [908, 489], [826, 498], [730, 508], [683, 567], [594, 563], [485, 567], [423, 546]]),
  stop('Canalave City', [321, 478]),
  // Back east and up into the snow.
  stop('Route 216', [601, 246], [[380, 494], [485, 492], [485, 444], [519, 410], [546, 341], [587, 294]]),
  stop('Route 217', [642, 191]),
  stop('Snowpoint City', [730, 153]),
  // Down the mountain and past Veilstone to the coast road east.
  stop('Route 222', [1311, 669], [[819, 205], [887, 287], [942, 341], [1038, 403], [1092, 471], [1133, 546], [1174, 601], [1222, 639]]),
  stop('Sunyshore City', [1447, 608], [[1379, 669]]),
  // North by sea to the Pokemon League.
  stop('Route 223', [1427, 440], [[1454, 546]])
]

export const sinnohPlaces = sinnohStops.map(item => item.name)
export const sinnohRoad = townRoad(sinnohStops, entry)

// Where a distance from the edge where the walk comes in stands on the map, and the walk split there.
export const sinnohPoint = (meters: number, milestone: number) => roadPoint(sinnohRoad, meters, milestone)
export const sinnohTrail = (meters: number, milestone: number) => roadTrail(sinnohRoad, meters, milestone)
export const nearestSinnoh = (point: Point) => nearestOf(sinnohStops, point)
