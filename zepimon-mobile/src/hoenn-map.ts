// Hoenn on the Adventure tab: the town map art (assets/route/hoenn.jpg) and the walkthrough across it (src/town-map.ts),
// one milestone at each town, city and route in the order the journey visits them, from Littleroot Town to Ever Grande
// City (Ruby, Sapphire and Emerald: Roxanne, Brawly, Wattson, Flannery, Norman, Winona, Tate and Liza, then Wallace).
// The walk comes in from Johto by boat off the south edge. Places a later leg passes through again are walked over, not
// counted twice. Points are pixels on the map art.
import { nearestOf, roadPoint, roadTrail, townRoad, townStop as stop } from './town-map.ts'
import type { Point, TownStop } from './town-map.ts'

export const HOENN_WIDTH = 1449
export const HOENN_HEIGHT = 1024

// Where the walk comes in from the region before: off the map's south edge, by sea.
const entry: Point = [294, 1024]

export const hoennStops: TownStop[] = [
  stop('Littleroot Town', [296, 629], [[294, 824], [294, 696]]),
  stop('Route 101', [251, 631]),
  stop('Oldale Town', [209, 634]),
  // Back past Littleroot to meet the rival north of Oldale, then west to Dad's Gym.
  stop('Route 103', [294, 567], [[251, 631], [294, 629]]),
  stop('Route 102', [142, 634], [[294, 629], [209, 634]]),
  stop('Petalburg City', [119, 547], [[93, 631], [90, 573]]),
  stop('Route 104', [90, 676], [[90, 573], [93, 631]]),
  stop('Rustboro City', [113, 438], [[71, 618], [67, 515], [90, 477]]),
  stop('Route 116', [193, 425], [[152, 425]]),
  // Mr. Briney sails from Route 104 down the west coast to Dewford, then on to Slateport.
  stop('Route 105', [39, 728], [[152, 425], [113, 438], [90, 477], [67, 515], [71, 618], [52, 670]]),
  stop('Route 106', [58, 837], [[32, 786]]),
  stop('Dewford Town', [148, 908], [[84, 889]]),
  stop('Route 107', [238, 889], [[193, 902]]),
  stop('Route 108', [322, 917], [[277, 917]]),
  stop('Route 109', [415, 850], [[399, 917], [415, 895]]),
  stop('Slateport City', [444, 676], [[415, 799], [431, 747]]),
  stop('Route 110', [460, 567], [[451, 618]]),
  stop('Mauville City', [431, 386], [[453, 489], [470, 438], [470, 393]]),
  stop('Route 117', [337, 394], [[386, 393]]),
  stop('Verdanturf Town', [286, 386]),
  // North up the road past Mauville and over the desert to the Mt. Chimney side.
  stop('Route 111', [500, 258], [[337, 394], [431, 392], [470, 386], [470, 296]]),
  stop('Route 112', [435, 219], [[471, 229]]),
  stop('Route 113', [444, 100], [[471, 225], [487, 167], [479, 119]]),
  stop('Fallarbor Town', [213, 119], [[386, 88], [290, 85]]),
  stop('Route 114', [148, 193], [[167, 148]]),
  // Through Meteor Falls, up the cable car to Mt. Chimney and down the Jagged Pass.
  stop('Lavaridge Town', [374, 206], [[225, 174], [296, 135], [350, 113], [367, 161]]),
  // Back down to Mauville and east over the water, then north up the river to Fortree.
  stop('Route 118', [547, 393], [[399, 216], [471, 222], [470, 386]]),
  stop('Route 119', [586, 316], [[580, 386]]),
  stop('Fortree City', [567, 155], [[586, 264], [599, 206]]),
  stop('Route 120', [754, 193], [[605, 165], [696, 174]]),
  stop('Route 121', [844, 222], [[786, 222]]),
  stop('Lilycove City', [953, 229]),
  // Surfing east from Lilycove to the islands.
  stop('Route 124', [1069, 213], [[1018, 245]]),
  stop('Mossdeep City', [1237, 247], [[1146, 232]]),
  stop('Route 125', [1243, 144]),
  stop('Route 127', [1166, 322], [[1237, 247], [1198, 290]]),
  stop('Route 128', [1153, 386]),
  stop('Sootopolis City', [1101, 444]),
  // With the eighth badge, south and east across the open sea past Pacifidlog to Slateport's waters.
  stop('Route 129', [1133, 547], [[1095, 509], [1101, 541]]),
  stop('Route 130', [1237, 573]),
  stop('Route 131', [1294, 638]),
  stop('Pacifidlog Town', [1224, 696]),
  stop('Route 132', [1095, 693]),
  stop('Route 133', [947, 676]),
  stop('Route 134', [773, 641], [[850, 644]]),
  // Back east along the island chain to Victory Road.
  stop('Ever Grande City', [1363, 431], [[850, 644], [947, 676], [1095, 693], [1224, 696], [1294, 638], [1340, 554], [1365, 502]])
]

export const hoennPlaces = hoennStops.map(item => item.name)
export const hoennRoad = townRoad(hoennStops, entry)

// Where a distance from the edge where the walk comes in stands on the map, and the walk split there.
export const hoennPoint = (meters: number, milestone: number) => roadPoint(hoennRoad, meters, milestone)
export const hoennTrail = (meters: number, milestone: number) => roadTrail(hoennRoad, meters, milestone)
export const nearestHoenn = (point: Point) => nearestOf(hoennStops, point)
