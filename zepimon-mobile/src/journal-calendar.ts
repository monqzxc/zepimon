import { dayKey, weekStart } from './progress.ts'
import { km } from './journal.ts'
import type { Adventure, AdventureFacts } from './adventures.ts'

// The Journal as a calendar: a strip of recent days, the chosen day's summary, and the adventures of its week, month
// or year as bento tiles. Days and periods follow the phone's local time; weeks run Monday to Sunday, as missions do.

export type Period = 'week' | 'month' | 'year'
export const periods: [Period, string][] = [['week', 'Week'], ['month', 'Month'], ['year', 'Year']]

const startOfDay = (time: number) => { const date = new Date(time); date.setHours(0, 0, 0, 0); return date.getTime() }

// Today and the days before it, newest first: the strip under the title. A day "has" adventures when one finished then.
export function recentDays(adventures: Adventure[], now: number, count = 14): { key: string, start: number, has: boolean }[] {
  const finished = new Set(adventures.map(run => dayKey(Date.parse(run.record.finishedAt))))
  const today = startOfDay(now)
  return Array.from({ length: count }, (_, i) => {
    // Calendar days, not 24-hour steps, so a clock change cannot skip or repeat one.
    const date = new Date(today); date.setDate(date.getDate() - i)
    const start = date.getTime()
    return { key: dayKey(start), start, has: finished.has(dayKey(start)) }
  })
}

// The calendar week (from Monday), month or year around a day, as [start, end).
export function periodRange(day: number, period: Period): [number, number] {
  const date = new Date(day)
  if (period === 'week') {
    const start = weekStart(day)
    const end = new Date(start); end.setDate(end.getDate() + 7)
    return [start, end.getTime()]
  }
  if (period === 'month') return [new Date(date.getFullYear(), date.getMonth(), 1).getTime(), new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime()]
  return [new Date(date.getFullYear(), 0, 1).getTime(), new Date(date.getFullYear() + 1, 0, 1).getTime()]
}

// Adventures that finished in [start, end), newest first.
export function adventuresIn(adventures: Adventure[], [start, end]: [number, number]): Adventure[] {
  return adventures.filter(run => { const at = Date.parse(run.record.finishedAt); return at >= start && at < end })
    .sort((a, b) => Date.parse(b.record.finishedAt) - Date.parse(a.record.finishedAt))
}

// Adventures that finished on a day, newest first.
export function adventuresOn(adventures: Adventure[], day: number): Adventure[] {
  const key = dayKey(day)
  return adventuresIn(adventures, [-Infinity, Infinity]).filter(run => dayKey(Date.parse(run.record.finishedAt)) === key)
}

// What a day (or any list of adventures) adds up to.
export function summary(adventures: Adventure[]) {
  return {
    meters: adventures.reduce((sum, run) => sum + run.record.meters, 0),
    seconds: adventures.reduce((sum, run) => sum + (run.record.elapsedSeconds ?? 0), 0),
    count: adventures.length,
    walks: adventures.filter(run => run.record.activity !== 'running').length,
    runs: adventures.filter(run => run.record.activity === 'running').length
  }
}

// A duration as people say it: 45 s, 46 min, 1 h 12 min, 2 h.
export function shortDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '--'
  if (seconds < 60) return `${Math.floor(seconds)} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return minutes % 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes / 60} h`
}

// The adventure's details open with this: what it was, where it was recorded, and what became of the egg.
export function describeAdventure({ family, record, device }: Adventure, facts: AdventureFacts): string {
  const kind = record.activity === 'running' ? 'A run' : record.activity === 'walking' ? 'A walk' : 'An adventure'
  const opening = `${kind} ${device === 'phone' ? 'with this phone' : 'on your watch'}, ${km(record.meters)} with your ${family[0]} egg.`
  const [hatched, ...grew] = facts.evolution
  if (!hatched) return `${opening} ${km(5000 - record.meters)} more and it would have hatched.`
  const after = facts.hatchSeconds ? ` after ${shortDuration(facts.hatchSeconds)}` : ''
  return `${opening} It hatched into ${record.shiny ? 'a shiny ' : ''}${hatched}${after}${grew.length ? `, then grew into ${grew.at(-1)}` : ''}.`
}

// Bento layout: two columns that stay about level. Every third tile is a tall one, and each tile goes to the shorter
// column, so a short list still looks deliberate.
export type Tile = { adventure: Adventure, tall: boolean }
export function bento(adventures: Adventure[]): [Tile[], Tile[]] {
  const columns: [Tile[], Tile[]] = [[], []]
  const heights = [0, 0]
  adventures.forEach((adventure, i) => {
    const tall = i % 3 === 0
    const column = heights[0] <= heights[1] ? 0 : 1
    columns[column].push({ adventure, tall })
    heights[column] += tall ? 2 : 1
  })
  return columns
}
