import { adventuresIn, periodRange, startOfDay } from './journal-calendar.ts'
import type { Adventure } from './adventures.ts'
import type { Slice } from './journal-stats.ts'

// What Your stats (and Compare) look at: a week, month or year you pick, or any range of days. A window is [start, end)
// in the phone's local time; weeks run Monday to Sunday. The chart cuts it into days, weeks or months by its length.

export type StatsKind = 'week' | 'month' | 'year' | 'range'
export type Window = { kind: StatsKind, start: number, end: number }
export type Unit = 'day' | 'week' | 'month'
export const statsKinds: [StatsKind, string][] = [['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['range', 'Range']]

const DAY = 86400000
const addDays = (time: number, days: number) => { const date = new Date(time); date.setDate(date.getDate() + days); return date.getTime() }
const addMonths = (time: number, months: number) => { const date = new Date(time); date.setMonth(date.getMonth() + months); return date.getTime() }
// Whole calendar days between two midnights, steady across clock changes.
const daysBetween = (from: number, to: number) => Math.round((to - from) / DAY)

// The week, month or year around a day.
export function windowFor(kind: 'week' | 'month' | 'year', day: number): Window {
  const [start, end] = periodRange(day, kind)
  return { kind, start, end }
}

// The days from one date to another, both included, whichever order they come in.
export function rangeWindow(from: number, to: number): Window {
  const start = startOfDay(Math.min(from, to))
  return { kind: 'range', start, end: addDays(startOfDay(Math.max(from, to)), 1) }
}

// A window of the same kind as w, around day: the week, month or year it falls in, or for a range, the same number of
// days starting there.
export function windowAt(w: Window, day: number): Window {
  return w.kind === 'range' ? { kind: 'range', start: startOfDay(day), end: addDays(startOfDay(day), daysBetween(w.start, w.end)) } : windowFor(w.kind, day)
}

// The window before (step -1) or after (step 1): the previous or next week, month or year, or the same number of days.
export function shiftWindow(w: Window, step: 1 | -1): Window {
  if (w.kind !== 'range') return windowFor(w.kind, step > 0 ? w.end : w.start - 1)
  const length = daysBetween(w.start, w.end)
  return { kind: 'range', start: addDays(w.start, step * length), end: addDays(w.end, step * length) }
}

// Whether the window after w has begun yet; the stats never step into the future.
export const canGoForward = (w: Window, now: number) => shiftWindow(w, 1).start <= startOfDay(now)

// How the chart cuts a window: days for a week, a month or a range of up to two months, weeks for up to a year,
// months beyond that and for a year.
export function unitFor(w: Window): Unit {
  if (w.kind === 'week' || w.kind === 'month') return 'day'
  if (w.kind === 'year') return 'month'
  const days = daysBetween(w.start, w.end)
  return days <= 62 ? 'day' : days <= 371 ? 'week' : 'month'
}

// The window cut into its days, weeks (from the window's first day) or calendar months, each with the distance walked
// in it. Slices starting after today are future, so the chart stops at today.
export function windowSlices(adventures: Adventure[], w: Window, now: number): Slice[] {
  const unit = unitFor(w)
  const today = startOfDay(now)
  const slices: Slice[] = []
  for (let from = w.start; from < w.end;) {
    const next = unit === 'day' ? addDays(from, 1) : unit === 'week' ? addDays(from, 7)
      : new Date(new Date(from).getFullYear(), new Date(from).getMonth() + 1, 1).getTime()
    const to = Math.min(next, w.end)
    const runs = adventuresIn(adventures, [from, to])
    const date = new Date(from)
    const short = unit === 'month' ? date.toLocaleDateString([], { month: 'short' })
      : unit === 'week' ? date.toLocaleDateString([], { day: 'numeric', month: 'short' })
      : w.kind === 'week' ? date.toLocaleDateString([], { weekday: 'short' }) : String(date.getDate())
    slices.push({ start: from, end: to, label: sliceName(from, to, unit), short, meters: runs.reduce((sum, run) => sum + run.record.meters, 0),
      count: runs.length, future: from > today })
    from = to
  }
  return slices
}

// A slice as the line under the chart names it: a day, a week's dates or a month.
export function sliceName(start: number, end: number, unit: Unit): string {
  if (unit === 'day') return new Date(start).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
  if (unit === 'month') return new Date(start).toLocaleDateString([], { month: 'long', year: 'numeric' })
  return span(start, end)
}

// First to last day, with the year once (or on both ends when they differ): "26 Oct – 1 Nov 2026".
function span(start: number, end: number): string {
  const first = new Date(start), last = new Date(end - 1)
  const same = first.getFullYear() === last.getFullYear()
  const from = first.toLocaleDateString([], { day: 'numeric', month: 'short', ...(same ? {} : { year: 'numeric' }) })
  const to = last.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
  return start === addDays(end, -1) ? to : `${from} – ${to}`
}

// The window's name: "This week" and "This month" while they run, otherwise its dates, month or year.
export function windowName(w: Window, now: number): string {
  if (w.kind === 'week') return windowFor('week', now).start === w.start ? 'This week' : span(w.start, w.end)
  if (w.kind === 'month') return windowFor('month', now).start === w.start ? 'This month'
    : new Date(w.start).toLocaleDateString([], { month: 'long', year: 'numeric' })
  if (w.kind === 'year') return String(new Date(w.start).getFullYear())
  return span(w.start, w.end)
}

// The days of the window so far (all of them once it has ended), at least one.
export function daysSoFar(w: Window, now: number): number {
  return Math.max(1, daysBetween(w.start, Math.min(w.end, addDays(startOfDay(now), 1))))
}

// Quick ranges for the range picker, each ending today.
export function rangePresets(now: number): [string, Window][] {
  const today = startOfDay(now)
  return [['Last 7 days', rangeWindow(addDays(today, -6), today)], ['Last 30 days', rangeWindow(addDays(today, -29), today)],
    ['Last 90 days', rangeWindow(addDays(today, -89), today)], ['Year to date', rangeWindow(new Date(new Date(now).getFullYear(), 0, 1).getTime(), today)]]
}

// The years the pickers offer, newest first: this year back to the first adventure's, and always last year too, which
// Compare opens on when A is this year.
export function statsYears(adventures: Adventure[], now: number): number[] {
  const first = Math.min(now, ...adventures.map(run => Date.parse(run.record.finishedAt)).filter(Number.isFinite))
  const to = new Date(now).getFullYear(), from = Math.min(new Date(first).getFullYear(), to - 1)
  return Array.from({ length: to - from + 1 }, (_, i) => to - i)
}

// A window as route params and back, so Compare opens on what Your stats showed.
export const windowParams = (w: Window) => ({ kind: w.kind, start: String(w.start), end: String(w.end) })
export function windowFromParams(params: { kind?: string, start?: string, end?: string }, now: number): Window {
  const start = Number(params.start), end = Number(params.end)
  if (!statsKinds.some(([kind]) => kind === params.kind) || !Number.isFinite(start) || !(end > start)) return windowFor('month', now)
  return params.kind === 'range' ? rangeWindow(start, end - 1) : windowFor(params.kind as 'week' | 'month' | 'year', start)
}

// The default window for each tab when you switch to it: the one around the day you were looking at, or the last 30
// days for a range.
export function switchKind(w: Window, kind: StatsKind, now: number): Window {
  if (kind === w.kind) return w
  if (kind === 'range') return w.kind === 'week' || w.kind === 'month' ? rangeWindow(w.start, Math.min(w.end - 1, now)) : rangePresets(now)[1][1]
  return windowFor(kind, Math.min(w.end - 1, now))
}

export const monthStart = (time: number) => new Date(new Date(time).getFullYear(), new Date(time).getMonth(), 1).getTime()
export { addMonths }
