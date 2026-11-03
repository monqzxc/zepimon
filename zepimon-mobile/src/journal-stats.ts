import { dayKey, weekStart } from './progress.ts'
import { adventuresIn, periodRange, startOfDay } from './journal-calendar.ts'
import type { Period } from './journal-calendar.ts'
import type { Adventure } from './adventures.ts'

// The Journal's figures for a week, month or year: its days (or months) for the ring and the chart, what it adds up to,
// how it compares with the period before, the weekly streak and an estimate of the energy spent. Every figure comes
// from saved adventures; calories are the one estimate, and the screen labels them so.

export type Slice = { start: number, end: number, label: string, short: string, meters: number, count: number, future: boolean }

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// The period around day cut into its days (a week or a month) or its months (a year), each with the distance walked in
// it. Slices that start after now are future, so the chart can stop at today.
export function slices(adventures: Adventure[], day: number, period: Period, now: number): Slice[] {
  const [start, end] = periodRange(day, period)
  const bounds: [number, number, string, string][] = []
  const cursor = new Date(start)
  while (cursor.getTime() < end) {
    const from = cursor.getTime()
    if (period === 'year') {
      cursor.setMonth(cursor.getMonth() + 1)
      const name = new Date(from).toLocaleDateString([], { month: 'short' })
      bounds.push([from, cursor.getTime(), name, name[0]])
    } else {
      cursor.setDate(cursor.getDate() + 1)
      const date = new Date(from)
      const weekday = WEEKDAYS[(date.getDay() + 6) % 7]
      bounds.push([from, cursor.getTime(), period === 'week' ? weekday : String(date.getDate()), period === 'week' ? weekday : String(date.getDate())])
    }
  }
  const today = startOfDay(now)
  return bounds.map(([from, to, label, short]) => {
    const runs = adventuresIn(adventures, [from, to])
    return { start: from, end: to, label, short, meters: runs.reduce((sum, run) => sum + run.record.meters, 0), count: runs.length,
      future: from > today }
  })
}

// The stretch to compare a period with: the one before it, cut to the same length when the period is still running
// ("this time last week"), so a Wednesday is not measured against a whole week.
export function previousRange(day: number, period: Period, now: number): [number, number] {
  const [start, end] = periodRange(day, period)
  const before = new Date(start)
  if (period === 'week') before.setDate(before.getDate() - 7)
  else if (period === 'month') before.setMonth(before.getMonth() - 1)
  else before.setFullYear(before.getFullYear() - 1)
  const from = before.getTime()
  const running = now >= start && now < end
  return [from, running ? Math.min(start, from + (now - start)) : start]
}

// A change in whole percent, 'new' when there was nothing before, and null when there is nothing on either side.
export function change(current: number, previous: number): number | 'new' | null {
  if (!previous) return current ? 'new' : null
  return Math.round((current - previous) / previous * 100)
}

// Weeks in a row (Monday to Sunday) with at least one adventure, up to this week. A week still running does not break
// the streak until it ends empty. since is the first week's Monday.
export function streak(adventures: Adventure[], now: number): { weeks: number, since: number | null, thisWeek: boolean } {
  const walked = new Set(adventures.map(run => dayKey(weekStart(Date.parse(run.record.finishedAt)))))
  const monday = new Date(weekStart(now))
  const thisWeek = walked.has(dayKey(monday.getTime()))
  if (!thisWeek) monday.setDate(monday.getDate() - 7)
  let weeks = 0
  let since: number | null = null
  while (walked.has(dayKey(monday.getTime()))) {
    weeks++
    since = monday.getTime()
    monday.setDate(monday.getDate() - 7)
  }
  return { weeks, since, thisWeek }
}

// Energy spent, estimated from distance alone for a 70 kg walker: about 50 kcal a kilometre walking and 70 running.
// Watch adventures do not say which, so they count as walks. Rounded to 10, as an estimate should be.
export const KCAL_PER_KM = { walking: 50, running: 70 }
export function estimatedKcal(adventures: Adventure[]): number {
  const kcal = adventures.reduce((sum, run) => sum + run.record.meters / 1000 * KCAL_PER_KM[run.record.activity === 'running' ? 'running' : 'walking'], 0)
  return Math.round(kcal / 10) * 10
}

// Steps, which only watches count; null when no adventure in the list has any.
export function steps(adventures: Adventure[]): number | null {
  const counted = adventures.filter(run => Number.isFinite(run.record.steps) && run.record.steps > 0)
  return counted.length ? counted.reduce((sum, run) => sum + run.record.steps, 0) : null
}

// Eggs hatched: adventures that reached 5 km.
export const hatched = (adventures: Adventure[]) => adventures.filter(run => run.record.meters >= 5000).length

// The daily average over the days of the period so far (all of them once it has ended).
export function dailyAverage(meters: number, day: number, period: Period, now: number): number {
  const [start, end] = periodRange(day, period)
  const last = Math.min(end, startOfDay(now) + 86400000)
  const days = Math.max(1, Math.round((last - start) / 86400000))
  return meters / days
}

// Good morning, afternoon or evening, by the phone's clock.
export function greeting(now: number): string {
  const hour = new Date(now).getHours()
  return hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 18 ? 'Good afternoon' : 'Good evening'
}
