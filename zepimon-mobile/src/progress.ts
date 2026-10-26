import { dexEntries, parseJournal, recordForm, speciesName } from './journal.ts'
import type { DexRecord, Journal } from './journal.ts'

export type SavedRun = { id: string, family: string[], record: DexRecord }
export type Progress = { runs: SavedRun[], unlocked: Record<string, number> }
export type Mission = { id: string, title: string, description: string, value: number, goal: number, unit: string, hidden?: boolean, weekly?: boolean }
export const emptyProgress = (): Progress => ({ runs: [], unlocked: {} })

const runId = (family: string[], record: DexRecord) => JSON.stringify([family, Date.parse(record.finishedAt), record.shiny])

export function mergeRuns(previous: SavedRun[], journal: Journal): SavedRun[] {
  const runs = new Map(previous.map(run => [run.id, run]))
  // The watch retains one run per family and three bests; Dex stages repeat those same runs.
  const candidates = [...Object.values(journal.snapshot.personalBests || {}),
    ...Object.entries(journal.snapshot.records).map(([route, record]) => ({ ...record, route: Number(route) }))]
  for (const { route, ...record } of candidates) {
    const family = journal.routes[route]
    const id = runId(family, record)
    const existing = runs.get(id)
    runs.set(id, { id, family: [...family], record: { ...existing?.record, ...record } })
  }
  return [...runs.values()].sort((a, b) => Date.parse(b.record.finishedAt) - Date.parse(a.record.finishedAt))
}

export function dayKey(time: number): string {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function weekStart(now: number): number {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - (date.getDay() + 6) % 7)
  return date.getTime()
}

export function completedRuns(progress: Progress, now = Date.now()): SavedRun[] {
  return progress.runs.filter(({ record }) => record.meters > 0 && Date.parse(record.finishedAt) <= now)
}

export function missions(journal: Journal | null, progress: Progress, now = Date.now()): Mission[] {
  const runs = completedRuns(progress, now)
  const weekly = runs.filter(({ record }) => Date.parse(record.finishedAt) >= weekStart(now))
  // Safari Hunt catches are arcade finds: they appear in the Dex but never count toward walking badges.
  const walked = journal && { ...journal, snapshot: { ...journal.snapshot,
    dex: Object.fromEntries(Object.entries(journal.snapshot.dex).filter(([, record]) => record.source !== 'safari')) } }
  const entries = walked ? dexEntries(walked) : []
  const highest = runs.reduce((max, run) => Math.max(max, run.record.meters), 0)
  const total = runs.reduce((sum, run) => sum + run.record.meters, 0)
  const hasStart = (hour: (h: number) => boolean) => runs.some(({ record }) => record.meters >= 1000 &&
    record.startedAt != null && record.startedAt <= Date.parse(record.finishedAt) && hour(new Date(record.startedAt).getHours()))
  return [
    { id: 'week-distance', title: 'This week: explore 10 km', description: 'Complete a total of 10 km this Monday–Sunday.', value: weekly.reduce((sum, run) => sum + run.record.meters, 0) / 1000, goal: 10, unit: 'km', weekly: true },
    { id: 'week-days', title: 'This week: show up three times', description: 'Save an adventure on three different days.', value: new Set(weekly.map(run => dayKey(Date.parse(run.record.finishedAt)))).size, goal: 3, unit: 'days', weekly: true },
    { id: 'first-walk', title: 'Your journey begins', description: 'Save your first walk or run, on your watch or this phone.', value: runs.length, goal: 1, unit: 'adventure' },
    { id: 'first-hatch', title: 'Hello, little one', description: 'Reach 5 km in one saved adventure.', value: highest / 1000, goal: 5, unit: 'km' },
    { id: 'evolution', title: 'Go a little further', description: 'Reach 10 km in one saved adventure.', value: highest / 1000, goal: 10, unit: 'km' },
    { id: 'five-adventures', title: 'Finding your rhythm', description: 'Finish five adventures with recorded distance.', value: runs.length, goal: 5, unit: 'adventures' },
    { id: 'fifty-km', title: 'Trail explorer', description: 'Collect 50 km across your saved adventures.', value: total / 1000, goal: 50, unit: 'km' },
    { id: 'ten-friends', title: 'A growing team', description: 'Acquire ten different Pokemon. Variants share a species slot.', value: new Set(entries.map(entry => speciesName(entry.name))).size, goal: 10, unit: 'Pokemon' },
    { id: 'early-bird', title: 'Dawn patrol', description: 'Start between 4 AM and 7 AM, then finish at least 1 km.', value: Number(hasStart(hour => hour >= 4 && hour < 7)), goal: 1, unit: 'badge', hidden: true },
    { id: 'night-owl', title: 'Moonlit trail', description: 'Start at or after 8 PM, then finish at least 1 km.', value: Number(hasStart(hour => hour >= 20)), goal: 1, unit: 'badge', hidden: true },
    { id: 'shiny-friend', title: 'A little sparkle', description: 'Acquire your first Shiny Pokemon.', value: Number(entries.some(entry => entry.shiny)), goal: 1, unit: 'badge', hidden: true },
    { id: 'both-variants', title: 'Two of a kind', description: 'Keep both Normal and Shiny versions of the same Pokemon.', value: Number(entries.some(entry => entry.normal && entry.shiny)), goal: 1, unit: 'badge', hidden: true },
    { id: 'mega-friend', title: 'Beyond evolution', description: 'Save an adventure that reached a Mega form at 21 km.', value: Number(runs.some(run => recordForm(run.family, run.record).startsWith('Mega '))), goal: 1, unit: 'badge', hidden: true },
    { id: 'patient-explorer', title: 'The scenic route', description: 'Finish an adventure lasting an hour, with at least 1 km recorded.', value: Number(runs.some(({ record }) => record.meters >= 1000 && (record.elapsedSeconds || 0) >= 3600)), goal: 1, unit: 'badge', hidden: true },
  ]
}

export function unlockMissions(journal: Journal | null, progress: Progress, now = Date.now()): Progress {
  const unlocked = { ...progress.unlocked }
  for (const mission of missions(journal, progress, now)) {
    if (!mission.weekly && mission.value >= mission.goal && !unlocked[mission.id]) unlocked[mission.id] = now
  }
  return { ...progress, unlocked }
}

export function importProgress(previous: Progress, journal: Journal, now = Date.now()): Progress {
  return unlockMissions(journal, { ...previous, runs: mergeRuns(previous.runs, journal) }, now)
}

export function restoreProgress(raw: unknown): Progress {
  if (raw === undefined) return emptyProgress()
  if (!raw || typeof raw !== 'object') throw new Error('Invalid saved missions')
  const value = raw as Progress
  if (!Array.isArray(value.runs) || !value.unlocked || typeof value.unlocked !== 'object') throw new Error('Invalid saved missions')
  const records = new Map<string, SavedRun>()
  for (const run of value.runs) {
    const journal = parseJournal(JSON.stringify({ exportVersion: 1, app: 'Zepimon', exportedAt: new Date(0).toISOString(), receivedAt: null,
      routes: [run.family], snapshot: { schemaVersion: 1, capturedAt: 0, dex: {}, records: { 0: run.record }, active: null } }))
    const record = journal.snapshot.records[0]
    const id = runId(journal.routes[0], record)
    records.set(id, { id, family: journal.routes[0], record })
  }
  const unlocked: Record<string, number> = {}
  for (const { id, weekly } of missions(null, emptyProgress())) {
    const at = value.unlocked[id]
    if (!weekly && typeof at === 'number' && Number.isFinite(at) && at > 0 && at <= 8.64e15) unlocked[id] = at
  }
  return { runs: [...records.values()], unlocked }
}
