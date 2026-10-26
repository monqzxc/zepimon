import { megaForms, routes as catalogRoutes } from './generated/catalog.js'
import { clueMilestones, expeditionGoal, expeditionKey, legendarySpecies } from './generated/expedition.js'
import { bestRecords, parseJournal } from './journal.ts'
import type { BestRecord, DexRecord, Journal } from './journal.ts'
import type { Expedition, ExpeditionProgress } from './expeditions.ts'

// Adventures recorded on this phone, the phone version of the watch's walk: carry an egg, and every 5 km it hatches
// or evolves, with a Mega form at 21 km. Distance comes from GPS instead of the watch's sensors, and the route is
// kept as a line (no map). The rules mirror hatdog-app/page/pokemon.js so both devices grow Pokemon the same way.

export type Activity = 'walking' | 'running'
export type Fix = { lat: number, lng: number, accuracy: number | null, at: number }
export type ActiveAdventure = {
  family: string[], activity: Activity, startedAt: number, shiny: boolean, mega: string | null,
  meters: number, hatchSeconds: number | null,
  points: [number, number][],   // the route so far, one [latitude, longitude] per accepted fix
  anchor: Fix | null,           // the last accepted fix: the next distance is measured from here
  last: Fix | null,             // the latest fix of any quality, for the GPS status
  recent: [number, number][]    // [time, meters] over the last minute, for the current pace
}
// A saved phone adventure. record has the same shape the watch saves; path is the route as an encoded polyline.
export type PhoneRun = { id: string, family: string[], record: DexRecord, path: string }

const families = catalogRoutes as string[][]
const megas = megaForms as Record<string, string[]>
// The eggs the watch offers: every family except the Legendary and Mythical ones met on Expeditions.
export const eggs = families.filter(family => !legendarySpecies.includes(family[0]))
export const megaChoices = (family: string[]) => megas[family[family.length - 1]] || []
export const rollShiny = (random = Math.random) => Math.floor(random() * 50) === 0

export function earnedForms(family: string[], meters: number, mega: string | null): string[] {
  const earned = family.slice(0, Math.min(family.length, Math.floor(meters / 5000)))
  const choices = megaChoices(family)
  const chosen = mega || choices[0]
  if (meters >= 21000 && chosen && choices.includes(chosen)) earned.push(chosen)
  return earned
}
export const currentForm = (family: string[], meters: number, mega: string | null) => earnedForms(family, meters, mega).at(-1) ?? 'Egg'

// The distance of the next hatch, evolution or Mega form, or null once the final form is reached.
export function nextMilestone(family: string[], meters: number): number | null {
  if (meters < family.length * 5000) return (Math.floor(meters / 5000) + 1) * 5000
  return megaChoices(family).length && meters < 21000 ? 21000 : null
}

export function newAdventure(family: string[], activity: Activity, mega: string | null, now: number, random = Math.random): ActiveAdventure {
  const choices = megaChoices(family)
  return { family: [...family], activity, startedAt: now, shiny: rollShiny(random), mega: mega && choices.includes(mega) ? mega : choices[0] ?? null,
    meters: 0, hatchSeconds: null, points: [], anchor: null, last: null, recent: [] }
}

const EARTH_RADIUS = 6371008.8
const radians = (degrees: number) => degrees * Math.PI / 180
export function distanceBetween(a: { lat: number, lng: number }, b: { lat: number, lng: number }): number {
  const dLat = radians(b.lat - a.lat), dLng = radians(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Fixes less accurate than this only update the GPS status. Moves shorter than the jitter allowance are held until
// they add up, so standing still does not collect distance. A jump faster than the activity allows is a GPS glitch
// (or a vehicle) and is skipped without moving the anchor.
const MAX_ACCURACY = 35
const MIN_STEP = 5
const MAX_SPEED: Record<Activity, number> = { walking: 7, running: 12 }
const PACE_WINDOW = 60000
const round = (value: number) => Math.round(value * 1e5) / 1e5

export function addFix(active: ActiveAdventure, fix: Fix): ActiveAdventure {
  if (![fix.lat, fix.lng, fix.at].every(Number.isFinite) || Math.abs(fix.lat) > 90 || Math.abs(fix.lng) > 180) return active
  const next = { ...active, last: fix }
  if (fix.accuracy !== null && !(fix.accuracy <= MAX_ACCURACY)) return next
  const anchor = active.anchor
  if (!anchor) return { ...next, anchor: fix, points: [...active.points, [round(fix.lat), round(fix.lng)]], recent: [[fix.at, active.meters]] }
  const step = distanceBetween(anchor, fix)
  if (step < Math.max(MIN_STEP, 0.5 * Math.max(anchor.accuracy ?? 0, fix.accuracy ?? 0))) return next
  const seconds = (fix.at - anchor.at) / 1000
  if (seconds <= 0 || step / seconds > MAX_SPEED[active.activity]) return next
  const meters = active.meters + step
  const hatchSeconds = active.hatchSeconds === null && active.meters < 5000 && meters >= 5000
    ? Math.max(1, Math.floor((fix.at - active.startedAt) / 1000)) : active.hatchSeconds
  const recent = [...active.recent.filter(([at]) => fix.at - at <= PACE_WINDOW), [fix.at, meters] as [number, number]]
  return { ...next, meters, hatchSeconds, anchor: fix, points: [...active.points, [round(fix.lat), round(fix.lng)]], recent }
}

// Seconds per km over the last minute, or null until there is enough recent movement to tell.
export function currentPace(active: ActiveAdventure, now: number): number | null {
  const recent = active.recent.filter(([at]) => now - at <= PACE_WINDOW)
  if (recent.length < 2) return null
  const [[startAt, startMeters], [endAt, endMeters]] = [recent[0], recent[recent.length - 1]]
  const meters = endMeters - startMeters
  return meters >= 15 && endAt - startAt >= 10000 ? (endAt - startAt) / meters : null
}

export function finishAdventure(active: ActiveAdventure, finishedAt: number): PhoneRun {
  const meters = Math.floor(active.meters)
  const elapsedSeconds = Math.max(0, Math.floor((finishedAt - active.startedAt) / 1000))
  const hatchSeconds = meters >= 5000 && active.hatchSeconds && active.hatchSeconds <= elapsedSeconds ? active.hatchSeconds : null
  const record: DexRecord = { meters, steps: 0, shiny: active.shiny, activity: active.activity, finishedAt: new Date(finishedAt).toISOString(),
    startedAt: active.startedAt, elapsedSeconds, ...(hatchSeconds ? { hatchSeconds } : {}), ...(active.mega ? { mega: active.mega } : {}),
    form: currentForm(active.family, meters, active.mega) }
  return { id: `phone-${active.startedAt}`, family: [...active.family], record, path: encodePath(simplifyPath(active.points)) }
}

// Google's encoded polyline format at 5 decimals (about a metre): a long route takes a few kilobytes.
export function encodePath(points: [number, number][]): string {
  let text = '', lastLat = 0, lastLng = 0
  const write = (value: number) => {
    let bits = value < 0 ? ~(value << 1) : value << 1
    while (bits >= 0x20) { text += String.fromCharCode((0x20 | (bits & 0x1f)) + 63); bits >>= 5 }
    text += String.fromCharCode(bits + 63)
  }
  for (const [lat, lng] of points) {
    const y = Math.round(lat * 1e5), x = Math.round(lng * 1e5)
    write(y - lastLat); write(x - lastLng)
    lastLat = y; lastLng = x
  }
  return text
}

export function decodePath(text: string): [number, number][] {
  const points: [number, number][] = []
  let index = 0, lat = 0, lng = 0
  const read = () => {
    let result = 0, shift = 0, byte: number
    do {
      if (index >= text.length) throw new Error('Invalid route')
      byte = text.charCodeAt(index++) - 63
      if (byte < 0 || byte > 63) throw new Error('Invalid route')
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20 && shift < 35)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (index < text.length) {
    lat += read(); lng += read()
    points.push([lat / 1e5, lng / 1e5])
  }
  return points
}

// Douglas-Peucker on a flat local projection, loosened until the route has at most maxPoints points.
export function simplifyPath(points: [number, number][], maxPoints = 500): [number, number][] {
  if (points.length <= 2) return points
  const scale = Math.cos(radians(points[0][0]))
  const xy = points.map(([lat, lng]) => [radians(lng) * scale * EARTH_RADIUS, radians(lat) * EARTH_RADIUS])
  const offset = (p: number[], a: number[], b: number[]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy
    const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
  }
  for (let tolerance = 2; ; tolerance *= 1.5) {
    const keep = new Array(points.length).fill(false)
    keep[0] = keep[points.length - 1] = true
    const stack: [number, number][] = [[0, points.length - 1]]
    while (stack.length) {
      const [first, last] = stack.pop()!
      let worst = -1, distance = tolerance
      for (let i = first + 1; i < last; i++) {
        const d = offset(xy[i], xy[first], xy[last])
        if (d > distance) { worst = i; distance = d }
      }
      if (worst > 0) { keep[worst] = true; stack.push([first, worst], [worst, last]) }
    }
    const result = points.filter((_, i) => keep[i])
    if (result.length <= maxPoints) return result
  }
}

// A journal for phones without a watch import, so phone adventures still fill the Dex, bests and missions.
export function emptyJournal(): Journal {
  return { exportVersion: 1, app: 'Zepimon', exportedAt: new Date(0).toISOString(), receivedAt: null, routes: families.map(family => [...family]),
    snapshot: { schemaVersion: 1, capturedAt: 0, dex: {}, records: {}, active: null } }
}

// Adds phone adventures to the watch journal the way the watch would have saved them: each family keeps its latest
// record, each earned form its latest Dex record, and personal bests count every phone adventure. Kept separate from
// the stored watch journal, so a later watch sync never loses them.
export function withPhoneRuns(journal: Journal | null, runs: PhoneRun[]): Journal | null {
  if (!runs.length) return journal
  const base = journal ?? emptyJournal()
  const routes = base.routes.map(family => [...family])
  const routeOf = (family: string[]) => {
    const index = routes.findIndex(item => item.length === family.length && item.every((name, i) => name === family[i]))
    if (index >= 0) return index
    routes.push([...family])
    return routes.length - 1
  }
  const dex = { ...base.snapshot.dex }
  const records = { ...base.snapshot.records }
  const newer = (a: DexRecord | undefined, b: DexRecord) => !a || Date.parse(a.finishedAt) <= Date.parse(b.finishedAt)
  const sorted = [...runs].sort((a, b) => Date.parse(a.record.finishedAt) - Date.parse(b.record.finishedAt))
  const candidates: BestRecord[] = []
  for (const run of sorted) {
    const route = routeOf(run.family)
    if (newer(records[route], run.record)) records[route] = run.record
    candidates.push({ ...run.record, route })
    for (const name of earnedForms(run.family, run.record.meters, run.record.mega ?? null)) {
      const key = (run.record.shiny ? 'Shiny ' : '') + name
      if (newer(dex[key], run.record)) {
        const { form: _form, mega: _mega, ...record } = run.record
        dex[key] = record
      }
    }
  }
  return { ...base, routes, snapshot: { ...base.snapshot, dex, records, personalBests: bestRecords(candidates, base.snapshot.personalBests) } }
}

// Phone adventures walk their own Legendary Expedition trail beside the watch's: its seed comes from the first phone
// adventure, so the trail and its rewards stay the same however often it is rebuilt.
export function phoneTrail(runs: PhoneRun[]): Expedition | null {
  if (!runs.length) return null
  const first = runs.reduce((earliest, run) => (run.record.startedAt ?? Infinity) < (earliest.record.startedAt ?? Infinity) ? run : earliest)
  let seed = 0x811c9dc5
  for (const character of first.id) seed = Math.imul(seed ^ character.charCodeAt(0), 0x01000193) >>> 0
  const meters = Math.min(100000000, runs.reduce((sum, run) => sum + run.record.meters, 0))
  return { seed, startedAt: Math.floor(first.record.startedAt ?? Date.parse(first.record.finishedAt)), meters }
}

export function withPhoneTrail(progress: ExpeditionProgress, runs: PhoneRun[]): ExpeditionProgress {
  const trail = phoneTrail(runs)
  if (!trail) return progress
  const key = expeditionKey(trail)
  const old = progress.trails[key]
  return { ...progress, trails: { ...progress.trails, [key]: { ...trail, meters: Math.max(old?.meters || 0, trail.meters), claimed: old?.claimed || 0 } } }
}

// What saving moves along on the phone trail: a clue (at 5, 15 and 25 km of each 25 km) or a Legendary encounter.
export function expeditionNews(before: number, after: number): 'encounter' | 'clue' | null {
  if (Math.floor(after / expeditionGoal) > Math.floor(before / expeditionGoal)) return 'encounter'
  return clueMilestones.some(mark => before % expeditionGoal < mark && after % expeditionGoal >= mark) ? 'clue' : null
}

// Checks saved phone adventures with the same rules as watch records; anything unreadable is dropped.
export function restorePhoneRuns(raw: unknown): PhoneRun[] {
  if (!Array.isArray(raw)) return []
  const runs = new Map<string, PhoneRun>()
  for (const item of raw.slice(0, 5000)) {
    try {
      if (!item || typeof item.id !== 'string' || !/^phone-\d{1,16}$/.test(item.id) || typeof item.path !== 'string' || item.path.length > 65536) continue
      decodePath(item.path)
      const journal = parseJournal(JSON.stringify({ exportVersion: 1, app: 'Zepimon', exportedAt: new Date(0).toISOString(), receivedAt: null,
        routes: [item.family], snapshot: { schemaVersion: 1, capturedAt: 0, dex: {}, records: { 0: item.record }, active: null } }))
      runs.set(item.id, { id: item.id, family: journal.routes[0], record: journal.snapshot.records[0], path: item.path })
    } catch { /* skip a damaged adventure, keep the rest */ }
  }
  return [...runs.values()]
}

// The adventure in progress is saved on every GPS batch, with its route encoded to keep each write small.
export function saveActive(active: ActiveAdventure): string {
  return JSON.stringify({ ...active, points: encodePath(active.points) })
}

export function restoreActive(text: string): ActiveAdventure | null {
  try {
    const value = JSON.parse(text)
    const fix = (item: unknown) => item && typeof item === 'object' && [(item as Fix).lat, (item as Fix).lng, (item as Fix).at].every(Number.isFinite) ? item as Fix : null
    if (!Array.isArray(value.family) || !value.family.length || !value.family.every((name: unknown) => typeof name === 'string') ||
        !['walking', 'running'].includes(value.activity) || !Number.isFinite(value.startedAt) || !Number.isFinite(value.meters) || value.meters < 0) return null
    return { family: value.family, activity: value.activity, startedAt: value.startedAt, shiny: value.shiny === true,
      mega: typeof value.mega === 'string' ? value.mega : null, meters: value.meters,
      hatchSeconds: Number.isFinite(value.hatchSeconds) ? value.hatchSeconds : null,
      points: typeof value.points === 'string' ? decodePath(value.points) : [], anchor: fix(value.anchor), last: fix(value.last),
      recent: Array.isArray(value.recent) ? value.recent.filter((pair: unknown) => Array.isArray(pair) && pair.length === 2 && pair.every(Number.isFinite)) : [] }
  } catch {
    return null
  }
}
