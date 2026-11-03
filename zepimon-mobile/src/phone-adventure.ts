import { megaForms, routes as catalogRoutes } from './generated/catalog.js'
import { clueMilestones, expeditionGoal, expeditionKey, legendarySpecies } from './generated/expedition.js'
import { bestRecords, parseJournal } from './journal.ts'
import type { BestRecord, DexRecord, Journal } from './journal.ts'
import type { Expedition, ExpeditionProgress } from './expeditions.ts'
import { decodePath, encodePath } from './polyline.ts'

export { decodePath, encodePath }

// Adventures recorded on this phone, the phone version of the watch's walk: carry an egg, and every 5 km it hatches
// or evolves, with a Mega form at 21 km. Distance comes from GPS instead of the watch's sensors, and the route is
// kept as a line of GPS points, drawn on a map (src/RouteMap.tsx). The rules mirror hatdog-app/page/pokemon.js so
// both devices grow Pokemon the same way.

export type Activity = 'walking' | 'running'
// altitude is metres above sea level and altitudeAccuracy its error, when the GPS reports them.
export type Fix = { lat: number, lng: number, accuracy: number | null, at: number, altitude?: number | null, altitudeAccuracy?: number | null }
// When each 100 m was reached, in seconds from the start: by the clock (at) and in moving time (moving), for the
// splits, the fastest pace and best efforts (src/running.ts). start is the first mark's distance in 100 m: 0 from the
// start, or the first 100 m after this phone took the adventure over from the watch, which keeps no marks. elev is
// the smoothed altitude in metres at each mark (null where the GPS gave none), for each split's climb; adventures
// recorded before it was kept have none.
export type PaceLog = { start: number, at: number[], moving: number[], elev?: (number | null)[] }
export type ActiveAdventure = {
  family: string[], activity: Activity, startedAt: number, shiny: boolean, mega: string | null,
  meters: number, hatchSeconds: number | null,
  points: [number, number][],   // the route so far, one [latitude, longitude] per accepted fix
  anchor: Fix | null,           // the last accepted fix: the next distance is measured from here
  last: Fix | null,             // the latest fix of any quality, for the GPS status
  recent: [number, number][],   // [time, meters] over the last minute, for the current pace
  movingSeconds: number | null, // time spent moving, without stops; null when part of it went unrecorded
  altitude: number | null,      // the smoothed altitude so far, null until the GPS gives one
  pace: PaceLog,
  shareId: string,              // the adventure shared with the watch (see src/shared-adventure.ts)
  deviceAt: number              // when this phone started it or took it over
}
// A saved phone adventure. record has the same shape the watch saves; path is the route as an encoded polyline.
// movingSeconds and pace are kept beside the record, which the watch's format has no room for; older adventures have neither.
export type PhoneRun = { id: string, family: string[], record: DexRecord, path: string, movingSeconds?: number, pace?: PaceLog }

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

// What the live notification shows while an adventure records (modules/zepimon-live): the kind of workout, the
// distance and the Pokemon being raised, named as on the Adventure tab ("Shiny Bulbasaur egg", "Ivysaur"). sprite is
// the form whose sprite goes beside it. The time ticks in the notification itself.
export function liveText(active: ActiveAdventure): { activity: string, distance: string, pokemon: string, sprite: string } {
  const form = currentForm(active.family, active.meters, active.mega)
  const name = form === 'Egg' ? `${active.family[0]} egg` : form
  return { activity: active.activity === 'running' ? 'Run' : 'Walk', distance: `${(Math.max(0, active.meters) / 1000).toFixed(2)} km`,
    pokemon: (active.shiny ? 'Shiny ' : '') + name, sprite: form }
}

export function newAdventure(family: string[], activity: Activity, mega: string | null, now: number, random = Math.random): ActiveAdventure {
  const choices = megaChoices(family)
  return { family: [...family], activity, startedAt: now, shiny: rollShiny(random), mega: mega && choices.includes(mega) ? mega : choices[0] ?? null,
    meters: 0, hatchSeconds: null, points: [], anchor: null, last: null, recent: [], movingSeconds: 0, altitude: null,
    pace: { start: 0, at: [0], moving: [0], elev: [null] },
    shareId: `adv-${now}`, deviceAt: now }
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
// Slower than this (about 28 min/km) is standing about, not moving: a step after a stop counts only the time it would
// take at this speed, so waiting at a crossing stays out of the moving time.
const MOVING_SPEED = 0.6
// A pace log holds up to 500 km.
const MAX_MARKS = 5000
const tenth = (value: number) => Math.round(value * 10) / 10
// GPS altitude wanders by several metres from fix to fix, so it is smoothed: each fix moves it a fifth of the way.
// Fixes whose altitude is less certain than ALTITUDE_ACCURACY leave it alone.
const ALTITUDE_SMOOTHING = 0.2
const ALTITUDE_ACCURACY = 25
function smoothAltitude(previous: number | null, fix: Fix): number | null {
  const { altitude, altitudeAccuracy } = fix
  if (typeof altitude !== 'number' || !Number.isFinite(altitude) || Math.abs(altitude) > 10000 ||
      (typeof altitudeAccuracy === 'number' && !(altitudeAccuracy <= ALTITUDE_ACCURACY))) return previous
  return previous === null ? altitude : previous + (altitude - previous) * ALTITUDE_SMOOTHING
}

// Adds the 100 m marks passed between two points of the adventure ([meters, clock, moving, altitude]), each timed and
// placed by interpolating along the step.
function addMarks(pace: PaceLog, from: [number, number, number, number | null], to: [number, number, number, number | null]): PaceLog {
  const [m0, t0, v0, a0] = from, [m1, t1, v1, a1] = to
  let next = pace.start + pace.at.length
  if (next * 100 > m1 || m1 <= m0 || pace.at.length >= MAX_MARKS) return pace
  const at = [...pace.at], moving = [...pace.moving], elev = pace.elev && [...pace.elev]
  for (; next * 100 <= m1 && at.length < MAX_MARKS; next++) {
    const f = Math.max(0, (next * 100 - m0) / (m1 - m0))
    at.push(tenth(t0 + f * (t1 - t0)))
    moving.push(tenth(v0 + f * (v1 - v0)))
    elev?.push(a0 !== null && a1 !== null ? tenth(a0 + f * (a1 - a0)) : a1 ?? a0)
  }
  return { start: pace.start, at, moving, ...elev ? { elev } : {} }
}

export function addFix(active: ActiveAdventure, fix: Fix): ActiveAdventure {
  if (![fix.lat, fix.lng, fix.at].every(Number.isFinite) || Math.abs(fix.lat) > 90 || Math.abs(fix.lng) > 180) return active
  const seen = { ...active, last: fix }
  if (fix.accuracy !== null && !(fix.accuracy <= MAX_ACCURACY)) return seen
  // Accurate fixes smooth the altitude even while standing still; the start mark takes the first one.
  const altitude = smoothAltitude(active.altitude, fix)
  const startElev = active.pace.start === 0 && active.pace.at.length === 1 && active.pace.elev?.[0] === null && altitude !== null
  const next = { ...seen, altitude, ...startElev ? { pace: { ...active.pace, elev: [tenth(altitude)] } } : {} }
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
  const moved = Math.min(seconds, step / MOVING_SPEED)
  const movingBefore = active.movingSeconds ?? 0
  const movingSeconds = active.movingSeconds === null ? null : movingBefore + moved
  const pace = addMarks(next.pace, [active.meters, (anchor.at - active.startedAt) / 1000, movingBefore, active.altitude ?? altitude],
    [meters, (fix.at - active.startedAt) / 1000, movingBefore + moved, altitude])
  return { ...next, meters, hatchSeconds, anchor: fix, points: [...active.points, [round(fix.lat), round(fix.lng)]], recent, movingSeconds, pace }
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
  const moving = active.movingSeconds === null ? {} : { movingSeconds: Math.min(elapsedSeconds, Math.floor(active.movingSeconds)) }
  const pace = active.pace.at.length > 1 ? { pace: active.pace } : {}
  return { id: `phone-${active.startedAt}`, family: [...active.family], record, path: encodePath(simplifyPath(active.points)), ...moving, ...pace }
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

// The adventures to share with the watch through the cloud, without their routes (the watch draws none): the ones
// not sent yet, oldest first, at most 50 at a time as the cloud accepts. Sharing one twice changes nothing.
export function runsToShare(runs: PhoneRun[], sent: ReadonlySet<string>, limit = 50): Omit<PhoneRun, 'path'>[] {
  return runs.filter(run => !sent.has(run.id))
    .sort((a, b) => Date.parse(a.record.finishedAt) - Date.parse(b.record.finishedAt))
    .slice(-limit)
    .map(({ id, family, record }) => ({ id, family, record }))
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
      const record = journal.snapshot.records[0]
      const moving = Number.isFinite(item.movingSeconds) && item.movingSeconds >= 0 && item.movingSeconds <= (record.elapsedSeconds ?? Infinity)
        ? { movingSeconds: item.movingSeconds } : {}
      const pace = validPace(item.pace) ? { pace: item.pace as PaceLog } : {}
      runs.set(item.id, { id: item.id, family: journal.routes[0], record, path: item.path, ...moving, ...pace })
    } catch { /* skip a damaged adventure, keep the rest */ }
  }
  return [...runs.values()]
}

// A pace log as addMarks writes it: marks in step, never going back in time, moving time never ahead of the clock.
// A damaged one is dropped, keeping the adventure.
function validPace(value: unknown): value is PaceLog {
  if (!value || typeof value !== 'object') return false
  const { start, at, moving, elev } = value as PaceLog
  if (elev !== undefined && !(Array.isArray(elev) && elev.length === at?.length &&
    elev.every(height => height === null || (Number.isFinite(height) && Math.abs(height) <= 10000)))) return false
  return Number.isSafeInteger(start) && start >= 0 && Array.isArray(at) && Array.isArray(moving) && at.length === moving.length &&
    at.length <= MAX_MARKS && at.every((time, i) => Number.isFinite(time) && time >= (i ? at[i - 1] : 0) &&
      Number.isFinite(moving[i]) && moving[i] >= (i ? moving[i - 1] : 0) && moving[i] <= time + 0.1)
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
      recent: Array.isArray(value.recent) ? value.recent.filter((pair: unknown) => Array.isArray(pair) && pair.length === 2 && pair.every(Number.isFinite)) : [],
      // Adventures saved before moving time and pace were kept go on without them from here.
      movingSeconds: value.movingSeconds === null || Number.isFinite(value.movingSeconds) ? value.movingSeconds : null,
      altitude: Number.isFinite(value.altitude) ? value.altitude : null,
      pace: validPace(value.pace) ? value.pace : { start: Math.floor(value.meters / 100) + 1, at: [], moving: [], elev: [] },
      // Adventures saved before sharing existed get the id they would have had.
      shareId: typeof value.shareId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value.shareId) ? value.shareId : `adv-${value.startedAt}`,
      deviceAt: Number.isFinite(value.deviceAt) ? value.deviceAt : value.startedAt }
  } catch {
    return null
  }
}
