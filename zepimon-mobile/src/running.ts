import { dayKey, weekStart } from './progress.ts'
import type { Adventure } from './adventures.ts'

// Pacing and running records, worked out from saved adventures: moving time, pace per km (splits), the fastest pace,
// best efforts over race distances (5 km to the marathon) and the achievements they earn. Phone adventures recorded
// since pacing was added carry a pace log, the time at every 100 m (src/phone-adventure.ts); for the rest, only whole
// figures that were really recorded count: a watch's time to hatch is its first 5 km, and an adventure of about a race
// distance (up to 10% over) counts its whole time for it. Nothing is projected from an average.

export type RaceId = '5k' | '10k' | '15k' | 'half' | 'marathon'
export const races: { id: RaceId, meters: number, name: string }[] = [
  { id: '5k', meters: 5000, name: '5 km' }, { id: '10k', meters: 10000, name: '10 km' }, { id: '15k', meters: 15000, name: '15 km' },
  { id: 'half', meters: 21097.5, name: 'Half marathon' }, { id: 'marathon', meters: 42195, name: 'Marathon' }
]

const positive = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null

// Time spent moving, without stops. Adventures that did not record it (watches, older phone adventures) count their
// whole time, which is all they know.
export const movingTime = (adventure: Adventure): number | null => positive(adventure.movingSeconds) ?? positive(adventure.record.elapsedSeconds)

// Average pace in seconds per km, over the moving time.
export function averagePace(adventure: Adventure): number | null {
  const seconds = movingTime(adventure)
  return seconds && adventure.record.meters >= 100 ? seconds / adventure.record.meters * 1000 : null
}

// The time a log reached a distance, between its marks by interpolation; null outside the log.
function timeAt(log: number[], start: number, meters: number): number | null {
  const x = meters / 100 - start
  if (x < 0 || x > log.length - 1 + 1e-9) return null
  const i = Math.min(log.length - 1, Math.floor(x)), f = x - i
  return f > 1e-9 ? log[i] + f * (log[i + 1] - log[i]) : log[i]
}

// The fastest stretch of a distance in a log, starting at any mark.
function fastestStretch(log: number[], start: number, meters: number): number | null {
  let best: number | null = null
  for (let i = 0; i < log.length; i++) {
    const end = timeAt(log, start, (start + i) * 100 + meters)
    if (end === null) break
    const seconds = end - log[i]
    if (seconds > 0 && (best === null || seconds < best)) best = seconds
  }
  return best
}

// The fastest time over a distance within one adventure, by the clock as in a race; null if it cannot be told.
export function bestEffort(adventure: Adventure, meters: number): number | null {
  const { record, pace } = adventure
  const elapsed = positive(record.elapsedSeconds)
  const hatch = positive(record.hatchSeconds)
  const candidates = [
    pace ? fastestStretch(pace.at, pace.start, meters) : null,
    meters === 5000 && record.meters >= 5000 && hatch && (!elapsed || hatch <= elapsed) ? hatch : null,
    record.meters >= meters && record.meters < meters * 1.1 ? elapsed : null
  ].filter((value): value is number => value !== null)
  return candidates.length ? Math.min(...candidates) : null
}

// The fastest pace held over a whole kilometre, in seconds per km: from the pace log's fastest kilometre in moving
// time, or the adventure's average pace when it has no log.
export function fastestPace(adventure: Adventure): number | null {
  const { pace, record } = adventure
  const average = record.meters >= 1000 ? averagePace(adventure) : null
  const stretch = pace ? fastestStretch(pace.moving, pace.start, 1000) : null
  return stretch !== null && average !== null ? Math.min(stretch, average) : stretch ?? average
}

// elev is the climb (or, below zero, the drop) in metres from the split's start to its end; null without altitude.
export type Split = { km: number, meters: number, seconds: number, pace: number, elev: number | null }

// Pace per kilometre, in moving time: each whole km, then the last part km if it is at least 100 m (its climb runs to
// its last 100 m mark). Only adventures logged from the start have splits.
export function splits(adventure: Adventure): Split[] {
  const { pace, record } = adventure
  if (!pace || pace.start !== 0) return []
  const climb = (from: number, to: number) => {
    const a = pace.elev?.[from], b = pace.elev?.[to]
    return typeof a === 'number' && typeof b === 'number' ? b - a : null
  }
  const result: Split[] = []
  for (let k = 1; k * 10 < pace.moving.length; k++) {
    const seconds = pace.moving[k * 10] - pace.moving[(k - 1) * 10]
    if (seconds > 0) result.push({ km: k, meters: 1000, seconds, pace: seconds, elev: climb((k - 1) * 10, k * 10) })
  }
  const whole = Math.floor((pace.moving.length - 1) / 10)
  const rest = record.meters - whole * 1000
  const moving = positive(adventure.movingSeconds)
  const seconds = moving !== null ? moving - pace.moving[whole * 10] : 0
  if (rest >= 100 && rest < 1000 && seconds > 0) result.push({ km: whole + 1, meters: rest, seconds, pace: seconds / rest * 1000,
    elev: pace.moving.length - 1 > whole * 10 ? climb(whole * 10, pace.moving.length - 1) : null })
  return result
}

// Second half faster than the first, in moving time, over at least 5 km logged from the start.
export function negativeSplit(adventure: Adventure): boolean {
  const { pace } = adventure
  if (!pace || pace.start !== 0 || pace.moving.length < 51) return false
  const end = (pace.moving.length - 1) * 100
  const half = timeAt(pace.moving, 0, end / 2)!
  return pace.moving[pace.moving.length - 1] - half < half
}

// Every whole kilometre within 5% of their average, over at least five.
export function evenlyPaced(adventure: Adventure): boolean {
  const whole = splits(adventure).filter(split => split.meters === 1000)
  if (whole.length < 5) return false
  const mean = whole.reduce((sum, split) => sum + split.seconds, 0) / whole.length
  return whole.every(split => Math.abs(split.seconds - mean) <= mean * 0.05)
}

// The last whole kilometre the fastest of at least three.
export function strongFinish(adventure: Adventure): boolean {
  const whole = splits(adventure).filter(split => split.meters === 1000)
  return whole.length >= 3 && whole.slice(0, -1).every(split => split.seconds > whole[whole.length - 1].seconds)
}

// Moving nearly the whole time (97%) over at least 5 km, so no real stops.
export function nonStop(adventure: Adventure): boolean {
  const moving = positive(adventure.movingSeconds), elapsed = positive(adventure.record.elapsedSeconds)
  return adventure.record.meters >= 5000 && moving !== null && elapsed !== null && moving >= elapsed * 0.97
}

// "24:31", "1:52:07".
export function clock(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '--:--'
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

// A pace in seconds per km as "5:12".
export const paceText = (seconds: number | null) => seconds === null ? '--:--' : clock(seconds)

const byFinish = (adventures: Adventure[]) => [...adventures].sort((a, b) => Date.parse(a.record.finishedAt) - Date.parse(b.record.finishedAt))

export type RaceRecord = { race: (typeof races)[number], seconds: number, adventure: Adventure }

// The fastest of each race distance across these adventures. A tie stays with the one that set it first.
export function raceRecords(adventures: Adventure[]): Record<RaceId, RaceRecord | null> {
  const records = Object.fromEntries(races.map(race => [race.id, null])) as Record<RaceId, RaceRecord | null>
  for (const adventure of byFinish(adventures)) {
    for (const race of races) {
      const seconds = bestEffort(adventure, race.meters)
      if (seconds !== null && (!records[race.id] || seconds < records[race.id]!.seconds)) records[race.id] = { race, seconds, adventure }
    }
  }
  return records
}

// What the period's adventures add up to for pacing: moving time, the average pace over it and the fastest pace held
// for a kilometre.
export function paceSummary(adventures: Adventure[]): { moving: number, pace: number | null, fastest: number | null } {
  const timed = adventures.filter(adventure => movingTime(adventure) !== null)
  const moving = timed.reduce((sum, adventure) => sum + movingTime(adventure)!, 0)
  const meters = timed.reduce((sum, adventure) => sum + adventure.record.meters, 0)
  const fastest = adventures.map(fastestPace).filter((pace): pace is number => pace !== null)
  return { moving, pace: meters >= 100 ? moving / meters * 1000 : null, fastest: fastest.length ? Math.min(...fastest) : null }
}

export type AchievementIcon = 'trophy' | 'badge' | 'flame' | 'timer' | 'trendUp' | 'calendar' | 'map' | 'run' | 'star' | 'check'
export type Achievement = {
  id: string, group: 'feat' | 'milestone', title: string, description: string, icon: AchievementIcon,
  // Legendary points it adds once earned (see runningPoints), and whether it also gives a ticket (see runningTickets).
  points: number, ticket: boolean,
  // The adventure that first earned it, and what it did, in words.
  earned: { at: number, adventure: Adventure, detail: string } | null,
  // How far along it is, for a bar (0 to 1), and in words; null where there is nothing to show yet.
  fraction: number | null, note: string | null
}

// Points follow the arcade's scale (src/games/achievements.ts): 10 for a first step, 20 to 30 for real training, 40 to
// 50 for the hardest. They fill the same Legendary points gauge, where every 100 trade for an Expedition Permit.
// Beating a time over a race distance anywhere in one adventure.
const targets: [RaceId, number, string, number][] = [
  ['5k', 1800, 'Sub-30 5 km', 10], ['5k', 1500, 'Sub-25 5 km', 20], ['5k', 1200, 'Sub-20 5 km', 30],
  ['10k', 3600, 'Sub-hour 10 km', 10], ['10k', 3000, 'Sub-50 10 km', 20], ['10k', 2400, 'Sub-40 10 km', 30],
  ['half', 7200, 'Sub-2 half marathon', 20], ['half', 6300, 'Sub-1:45 half marathon', 30], ['half', 5400, 'Sub-1:30 half marathon', 40],
  ['marathon', 18000, 'Sub-5 marathon', 30], ['marathon', 14400, 'Sub-4 marathon', 40], ['marathon', 10800, 'Sub-3 marathon', 50]
]
// Covering a distance in one adventure.
const distances: [number, string, string, number][] = [
  [5000, 'first-5k', 'First 5 km', 10], [10000, 'first-10k', 'First 10 km', 10], [15000, 'first-15k', 'First 15 km', 20],
  [21097.5, 'half-finisher', 'Half marathon finisher', 20], [42195, 'marathon-finisher', 'Marathon finisher', 40], [50000, 'ultra', 'Ultra explorer', 50]
]
// Feats of pacing in one adventure.
const wholeSplits = (adventure: Adventure) => splits(adventure).filter(split => split.meters === 1000)
const pacing: [string, string, string, AchievementIcon, number, (adventure: Adventure) => boolean, (adventure: Adventure) => string][] = [
  ['negative-split', 'Negative split', 'Run the second half faster than the first, over at least 5 km.', 'trendUp', 10, negativeSplit,
    () => 'The second half faster than the first'],
  ['metronome', 'Metronome', 'Hold every kilometre within 5% of your average, over at least five.', 'timer', 20, evenlyPaced, adventure => {
    const whole = wholeSplits(adventure)
    return `${whole.length} kilometres, each within 5% of ${paceText(whole.reduce((sum, split) => sum + split.pace, 0) / whole.length)} /km`
  }],
  ['strong-finish', 'Strong finish', 'Make your last kilometre the fastest, over at least three.', 'flame', 10, strongFinish,
    adventure => `The last kilometre the fastest, at ${paceText(wholeSplits(adventure).at(-1)!.pace)} /km`],
  ['non-stop', 'Non-stop', 'Keep moving the whole way, over at least 5 km.', 'run', 10, nonStop, adventure => `${(adventure.record.meters / 1000).toFixed(1)} km without a stop`],
  ['speed-km', 'Speed demon', 'Hold a pace under 4:00 /km for a whole kilometre.', 'flame', 20, adventure => (fastestPace(adventure) ?? Infinity) < 240,
    adventure => `A kilometre at ${paceText(fastestPace(adventure))} /km`],
  ['two-hours', 'Time on your feet', 'Keep moving for two hours in one adventure.', 'timer', 20, adventure => (movingTime(adventure) ?? 0) >= 7200,
    adventure => `${clock(movingTime(adventure))} on the move`]
]
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
const totals: [number, string, string, number][] = [[100, 'total-100', 'Century', 10], [250, 'total-250', 'Long road', 20], [500, 'total-500', 'Trailblazer', 30], [1000, 'total-1000', 'Thousand-km club', 50]]
const counts: [number, number][] = [[10, 10], [25, 10], [50, 20], [100, 30]]
const streaks: [number, number][] = [[4, 10], [12, 20], [26, 30], [52, 50]]
// The achievements that give a ticket too.
const ticketed = new Set(['sub-marathon-14400', 'ultra'])

// Each week (Monday to Sunday) with an adventure, oldest first: its Monday, the adventure that opened it and how many
// weeks in a row it makes.
function weekRuns(ordered: Adventure[]): { monday: number, adventure: Adventure, run: number }[] {
  const result: { monday: number, adventure: Adventure, run: number }[] = []
  let run = 0, week: number | null = null
  for (const adventure of ordered) {
    const monday = weekStart(Date.parse(adventure.record.finishedAt))
    if (week === monday) continue
    const next = week === null ? null : new Date(week)
    next?.setDate(next.getDate() + 7)
    run = next && dayKey(next.getTime()) === dayKey(monday) ? run + 1 : 1
    week = monday
    result.push({ monday, adventure, run })
  }
  return result
}

// Every achievement, earned or not. Each is earned by the first adventure that reached it, so it keeps its date.
export function achievements(adventures: Adventure[]): Achievement[] {
  const ordered = byFinish(adventures)
  const first = (test: (adventure: Adventure) => boolean, detail: (adventure: Adventure) => string) => {
    const adventure = ordered.find(test)
    return adventure ? reached(adventure, detail(adventure)) : null
  }
  const reached = (adventure: Adventure | null | undefined, detail: string) =>
    adventure ? { at: Date.parse(adventure.record.finishedAt), adventure, detail } : null
  const result: Omit<Achievement, 'ticket'>[] = []

  const records = raceRecords(adventures)
  for (const [race, limit, title, points] of targets) {
    const { meters, name } = races.find(item => item.id === race)!
    const best = records[race]?.seconds ?? null
    result.push({ id: `sub-${race}-${limit}`, group: 'feat', title, icon: 'timer', points,
      description: `Cover ${name === 'Marathon' || name === 'Half marathon' ? `a ${name.toLowerCase()}` : name} in under ${clock(limit)}, within one adventure.`,
      earned: first(adventure => (bestEffort(adventure, meters) ?? Infinity) < limit, adventure => `${name} in ${clock(bestEffort(adventure, meters))}`),
      fraction: best === null ? null : Math.min(1, limit / best), note: best === null ? null : `Best ${clock(best)}` })
  }
  for (const [id, title, description, icon, points, test, detail] of pacing) {
    result.push({ id, group: 'feat', title, description, icon, points, earned: first(test, detail), fraction: null, note: null })
  }

  const longest = ordered.reduce((max, adventure) => Math.max(max, adventure.record.meters), 0)
  for (const [meters, id, title, points] of distances) {
    result.push({ id, group: 'milestone', title, icon: 'map', points,
      description: `Cover ${meters === 21097.5 ? 'a half marathon (21.1 km)' : meters === 42195 ? 'a marathon (42.2 km)' : `${meters / 1000} km`} in one adventure.`,
      earned: first(adventure => adventure.record.meters >= meters, adventure => `Your first time past ${meters === 21097.5 ? '21.1' : meters === 42195 ? '42.2' : meters / 1000} km`),
      fraction: Math.min(1, longest / meters),
      note: `Longest ${(longest / 1000).toFixed(1)} km` })
  }

  // Running totals as each adventure is added.
  let sum = 0
  const crossed = new Map<number, Adventure>()
  ordered.forEach(adventure => {
    const before = sum
    sum += adventure.record.meters
    for (const [km] of totals) if (before < km * 1000 && sum >= km * 1000) crossed.set(km, adventure)
  })
  for (const [km, id, title, points] of totals) {
    const adventure = crossed.get(km)
    result.push({ id, group: 'milestone', title, description: `Cover ${km.toLocaleString()} km across all your adventures.`, icon: 'badge', points,
      earned: reached(adventure, `Passed ${km.toLocaleString()} km in all`),
      fraction: Math.min(1, sum / 1000 / km), note: `${Math.min(km, sum / 1000).toFixed(1)} / ${km.toLocaleString()} km` })
  }
  for (const [count, points] of counts) {
    const adventure = ordered[count - 1]
    result.push({ id: `count-${count}`, group: 'milestone', title: `${count} adventures`, description: `Save ${count} adventures.`, icon: 'check', points,
      earned: reached(adventure, `Your ${ordinal(count)} adventure`),
      fraction: Math.min(1, ordered.length / count), note: `${Math.min(count, ordered.length)} / ${count}` })
  }

  // Weeks in a row (Monday to Sunday) with an adventure: the adventure that made each length first.
  const weekly = weekRuns(ordered)
  const best = weekly.reduce((max, item) => Math.max(max, item.run), 0)
  for (const [weeks, points] of streaks) {
    const adventure = weekly.find(item => item.run === weeks)?.adventure
    result.push({ id: `streak-${weeks}`, group: 'milestone', title: `${weeks}-week streak`, icon: 'calendar', points,
      description: `Go on an adventure every week for ${weeks} weeks in a row.`,
      earned: reached(adventure, `An adventure every week for ${weeks} weeks`),
      fraction: Math.min(1, best / weeks), note: `Longest ${best} ${best === 1 ? 'week' : 'weeks'}` })
  }

  // A calendar month of 100 km.
  const months = new Map<string, number>()
  let monthBest = 0
  let bigMonth: Adventure | null = null
  for (const adventure of ordered) {
    const date = new Date(Date.parse(adventure.record.finishedAt))
    const key = `${date.getFullYear()}-${date.getMonth()}`
    const meters = (months.get(key) ?? 0) + adventure.record.meters
    months.set(key, meters)
    monthBest = Math.max(monthBest, meters)
    if (!bigMonth && meters >= 100000) bigMonth = adventure
  }
  result.push({ id: 'month-100', group: 'milestone', title: '100 km month', description: 'Cover 100 km in one calendar month.', icon: 'star', points: 30,
    earned: reached(bigMonth, `100 km in ${bigMonth ? new Date(Date.parse(bigMonth.record.finishedAt)).toLocaleDateString([], { month: 'long' }) : ''}`),
    fraction: Math.min(1, monthBest / 100000), note: `Best month ${(monthBest / 1000).toFixed(1)} km` })
  return result.map(item => ({ ...item, ticket: ticketed.has(item.id) }))
}

// The Legendary points these achievements have earned. Each is earned once, by the first adventure to reach it, so
// saving, syncing or importing the same adventure again never adds points.
export const runningPoints = (list: Achievement[]) => list.reduce((sum, item) => sum + (item.earned ? item.points : 0), 0)

// Running tickets, each worth one Expedition Permit (src/expedition-quest.ts claimTickets): a Sub-4 marathon and the
// Ultra explorer once each, and every TICKET_STREAK_WEEKS weeks in a row with an adventure (the 4th, 8th, 12th week of
// a streak), starting over when a streak breaks. All are read from saved adventures, oldest first, so the same
// adventure saved or imported again never adds one.
export const TICKET_STREAK_WEEKS = 4
export type Ticket = { id: string, title: string, detail: string, at: number, adventure: Adventure }
export function runningTickets(adventures: Adventure[], list = achievements(adventures)): Ticket[] {
  const feats = list.filter(item => item.ticket && item.earned)
    .map(({ id, title, earned }) => ({ id, title, detail: earned!.detail, at: earned!.at, adventure: earned!.adventure }))
  const weeks = weekRuns(byFinish(adventures)).filter(item => item.run % TICKET_STREAK_WEEKS === 0)
    .map(({ monday, adventure, run }) => ({ id: `weeks-${dayKey(monday)}`, title: `${run} weeks in a row`,
      detail: `An adventure every week for ${run} weeks`, at: Date.parse(adventure.record.finishedAt), adventure }))
  return [...feats, ...weeks].sort((a, b) => a.at - b.at)
}

// The streak still going: weeks in a row up to this week or last week (this week may not have its adventure yet).
export function currentStreak(adventures: Adventure[], now = Date.now()): number {
  const last = weekRuns(byFinish(adventures)).at(-1)
  if (!last) return 0
  const next = new Date(last.monday)
  next.setDate(next.getDate() + 7)
  const thisWeek = dayKey(weekStart(now))
  return dayKey(last.monday) === thisWeek || dayKey(next.getTime()) === thisWeek ? last.run : 0
}

export type Earned = { id: string, icon: AchievementIcon, title: string, detail: string }

// What one adventure earned: the race records it holds now, then the feats and milestones it was first to reach.
export function earnedBy(adventure: Adventure, adventures: Adventure[]): Earned[] {
  const records = Object.values(raceRecords(adventures))
    .filter((record): record is RaceRecord => record?.adventure.id === adventure.id)
    .map(({ race, seconds }) => ({ id: `record-${race.id}`, icon: 'trophy' as const, title: `Fastest ${race.name === 'Half marathon' || race.name === 'Marathon' ? race.name.toLowerCase() : race.name}`,
      detail: `Personal best · ${clock(seconds)} · ${paceText(seconds / race.meters * 1000)} /km` }))
  const reached = achievements(adventures).filter(item => item.earned?.adventure.id === adventure.id)
    .map(({ id, icon, title, earned }) => ({ id, icon, title, detail: earned!.detail }))
  return [...records, ...reached]
}
