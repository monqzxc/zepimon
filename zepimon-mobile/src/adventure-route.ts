// The Adventure tab's route: every kilometre you have walked or run, laid along one endless Hoenn-style path with a
// milestone every 2 km. The trailhead (0 km, by a Pokemon Center) is at the bottom; above it two strips of route take
// turns, four milestones each (scripts/build-adventure-route.py). Positions here are in tiles, from the top of what is
// drawn.
import { kantoPlaces } from './kanto-map.ts'
import { johtoPlaces } from './johto-map.ts'

export const MILESTONE = 3000
export const STRIP_METERS = 4 * MILESTONE

export type StripKind = 'start' | 'a' | 'b'
export type StripShape = { rows: number, pads: { x: number, y: number }[] }
export type PlacedStrip = { kind: StripKind, index: number, top: number, rows: number }
export type Milestone = { meters: number, x: number, y: number }
export type RouteLayout = { strips: PlacedStrip[], rows: number, milestones: Milestone[] }

// Every milestone is a town, city or route, in the order the games visit them: Kanto, then Johto, Hoenn, Sinnoh and
// Unova. 0 km is Pallet Town; the 2 km leading up to a milestone are that place, so you walk Route 1 to reach 2 km.
// Kanto and Johto follow the story's walkthrough across their own maps (src/kanto-map.ts, src/johto-map.ts). After
// Unova the journey starts over in Pallet Town, one tour further on.
export const regions: { name: string, places: string[] }[] = [
  { name: 'Kanto', places: kantoPlaces },
  { name: 'Johto', places: johtoPlaces },
  { name: 'Hoenn', places: ['Littleroot Town', 'Route 101', 'Oldale Town', 'Route 103', 'Route 102', 'Petalburg City', 'Route 104',
    'Rustboro City', 'Route 116', 'Route 105', 'Route 106', 'Dewford Town', 'Route 107', 'Route 108', 'Route 109', 'Slateport City',
    'Route 110', 'Mauville City', 'Route 117', 'Verdanturf Town', 'Route 111', 'Route 112', 'Route 113', 'Fallarbor Town', 'Route 114',
    'Lavaridge Town', 'Route 118', 'Route 119', 'Fortree City', 'Route 120', 'Route 121', 'Lilycove City', 'Route 124', 'Mossdeep City',
    'Route 125', 'Route 127', 'Route 128', 'Sootopolis City', 'Route 129', 'Route 130', 'Route 131', 'Pacifidlog Town', 'Route 132',
    'Route 133', 'Route 134', 'Ever Grande City'] },
  { name: 'Sinnoh', places: ['Twinleaf Town', 'Route 201', 'Sandgem Town', 'Route 202', 'Jubilife City', 'Route 203', 'Oreburgh City',
    'Route 204', 'Floaroma Town', 'Route 205', 'Eterna City', 'Route 206', 'Route 207', 'Route 208', 'Hearthome City', 'Route 209',
    'Solaceon Town', 'Route 210', 'Celestic Town', 'Route 211', 'Route 212', 'Pastoria City', 'Route 213', 'Route 214', 'Veilstone City',
    'Route 215', 'Route 218', 'Canalave City', 'Route 216', 'Route 217', 'Snowpoint City', 'Route 222', 'Sunyshore City', 'Route 223'] },
  { name: 'Unova', places: ['Nuvema Town', 'Route 1', 'Accumula Town', 'Route 2', 'Striaton City', 'Route 3', 'Nacrene City',
    'Castelia City', 'Route 4', 'Nimbasa City', 'Route 5', 'Driftveil City', 'Route 6', 'Mistralton City', 'Route 7', 'Icirrus City',
    'Route 8', 'Opelucid City', 'Route 9', 'Route 10', 'Route 11', 'Route 12', 'Lacunosa Town', 'Route 13', 'Undella Town', 'Route 14',
    'Route 15', 'Route 16', 'Route 17', 'Route 18'] }
]
// Milestones in one tour of every region.
export const tourLength = regions.reduce((sum, region) => sum + region.places.length, 0)

export type Place = { index: number, name: string, region: string, regionIndex: number, tour: number, meters: number }
// The place at milestone `index` (0 is Pallet Town at 0 km); tour counts from 1.
export function placeFor(index: number): Place {
  const step = Math.max(0, Math.floor(index))
  let i = step % tourLength
  for (const [regionIndex, region] of regions.entries()) {
    if (i < region.places.length) return { index: step, name: region.places[i], region: region.name, regionIndex, tour: Math.floor(step / tourLength) + 1, meters: step * MILESTONE }
    i -= region.places.length
  }
  throw new Error('unreachable')
}
// The place a distance is in: the one whose milestone comes next, or the one it stands on.
export const placeAt = (meters: number) => placeFor(Math.ceil(Math.max(0, meters) / MILESTONE))

export const stripOf = (meters: number) => Math.floor(Math.max(0, meters) / STRIP_METERS)
const kindOf = (index: number): StripKind => index % 2 ? 'b' : 'a'

// The strips around your distance, top to bottom: the next route ahead, yours, and the one behind you (or the
// trailhead). Milestones come bottom to top, with the milestone before the lowest strip when the trailhead isn't drawn,
// just below the bottom edge, so the trainer always has a stretch of path on both sides.
export function routeLayout(meters: number, shapes: Record<StripKind, StripShape>): RouteLayout {
  const here = stripOf(meters)
  const low = Math.max(0, here - 1)
  const strips: PlacedStrip[] = []
  let top = 0
  for (let index = here + 1; index >= low; index--) {
    strips.push({ kind: kindOf(index), index, top, rows: shapes[kindOf(index)].rows })
    top += shapes[kindOf(index)].rows
  }
  if (low === 0) {
    strips.push({ kind: 'start', index: -1, top, rows: shapes.start.rows })
    top += shapes.start.rows
  }
  const milestones: Milestone[] = []
  for (const strip of [...strips].reverse()) {
    shapes[strip.kind].pads.forEach((pad, i) => milestones.push({
      meters: strip.kind === 'start' ? 0 : strip.index * STRIP_METERS + (i + 1) * MILESTONE, x: pad.x, y: strip.top + pad.y
    }))
  }
  if (low > 0) {
    const below = shapes[kindOf(low - 1)].pads[3]
    milestones.unshift({ meters: low * STRIP_METERS, x: below.x, y: top + below.y })
  }
  return { strips, rows: top, milestones }
}

// Where on the path a distance falls: between the milestones on either side, as far along as it has come.
export function pointAt(meters: number, milestones: Milestone[]) {
  const after = milestones.findIndex(mark => mark.meters > meters)
  if (after <= 0) {
    const mark = after === 0 ? milestones[0] : milestones[milestones.length - 1]
    return { x: mark.x, y: mark.y }
  }
  const from = milestones[after - 1], to = milestones[after]
  const share = (meters - from.meters) / (to.meters - from.meters)
  return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share }
}

// The other way round: the distance at a height on the map (tiles from the top), held at the ends of the drawn path.
export function metersAt(y: number, milestones: Milestone[]) {
  const above = milestones.findIndex(mark => mark.y < y)
  if (above <= 0) return above === 0 ? milestones[0].meters : milestones[milestones.length - 1].meters
  const from = milestones[above - 1], to = milestones[above]
  return from.meters + (to.meters - from.meters) * (from.y - y) / (from.y - to.y)
}

// The strip at a height in the layout (tiles from the top).
export function stripAt(y: number, layout: RouteLayout) {
  return layout.strips.find(strip => y < strip.top + strip.rows) ?? layout.strips[layout.strips.length - 1]
}

// The adventure that took your running total to a distance, and the total before it; undefined until it is reached.
// The 0 km milestone is reached by your first adventure.
export function reachedBy<T extends { record: { meters: number, finishedAt: string } }>(meters: number, adventures: T[]) {
  const oldest = [...adventures].sort((a, b) => Date.parse(a.record.finishedAt) - Date.parse(b.record.finishedAt))
  let total = 0
  for (const run of oldest) {
    if (total + run.record.meters >= meters) return { run, before: total }
    total += run.record.meters
  }
  return undefined
}

// The route log: every stretch walked, from Route 1 on, with the adventures that walked it, oldest first. A stretch is
// the milestone's distance leading up to its place (Route 1 is 0 to 2 km); one adventure can walk several stretches,
// and one stretch can take several adventures, each with how far of it they walked. The last stretch may be under
// way (walked short of the whole of it).
export type Stretch<T> = { place: Place, from: number, to: number, walked: number, runs: { run: T, meters: number }[] }
export function routeLog<T extends { record: { meters: number, finishedAt: string } }>(adventures: T[]): Stretch<T>[] {
  const oldest = [...adventures].sort((a, b) => Date.parse(a.record.finishedAt) - Date.parse(b.record.finishedAt))
  const stretches: Stretch<T>[] = []
  let total = 0
  for (const run of oldest) {
    const end = total + Math.max(0, run.record.meters)
    while (total < end) {
      const index = Math.floor(total / MILESTONE) + 1
      const to = index * MILESTONE
      const stop = Math.min(end, to), meters = stop - total
      if (!stretches.length || stretches.at(-1)!.to !== to) stretches.push({ place: placeFor(index), from: to - MILESTONE, to, walked: 0, runs: [] })
      const stretch = stretches.at(-1)!
      stretch.walked += meters
      stretch.runs.push({ run, meters })
      total = stop
    }
  }
  return stretches
}
