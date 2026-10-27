import { completedRuns } from './progress.ts'
import type { Progress, SavedRun } from './progress.ts'
import type { PhoneRun } from './phone-adventure.ts'

// Every saved adventure in one list, from the watch and this phone, for the Journal, All adventures and the
// details and share screens. Only phone adventures have a route (path); watches count steps instead.
export type Adventure = SavedRun & { device: 'phone' | 'watch', path?: string }

// A phone adventure reaches the Journal's runs (progress) with the same family and finish time, under another id.
const key = ({ family, record }: { family: string[], record: { finishedAt: string } }) => `${family.join('>')}@${record.finishedAt}`

// Newest first. Saving a phone adventure adds it to progress; one missing there (say, from an older backup) is still
// listed from the phone. An adventure both devices saved counts once, as everywhere else (see completedRuns).
export function allAdventures(progress: Progress, phoneRuns: PhoneRun[], now = Date.now()): Adventure[] {
  const phones = new Map(phoneRuns.map(run => [key(run), run]))
  const saved = new Set(progress.runs.map(key))
  const runs = [...progress.runs, ...phoneRuns.filter(run => !saved.has(key(run))).map(({ id, family, record }) => ({ id, family, record }))]
    .sort((a, b) => Date.parse(b.record.finishedAt) - Date.parse(a.record.finishedAt))
  return completedRuns({ ...progress, runs }, now).map((run): Adventure => {
    const phone = phones.get(key(run))
    return phone ? { ...run, device: 'phone', path: phone.path } : { ...run, device: 'watch' }
  })
}

// The adventure a link names: a phone adventure's own id (the Adventure tab links those) or a Journal run's id.
export function findAdventure(id: string | undefined, progress: Progress, phoneRuns: PhoneRun[]): Adventure | undefined {
  const phone = phoneRuns.find(run => run.id === id)
  if (phone) return { id: phone.id, family: phone.family, record: phone.record, device: 'phone', path: phone.path }
  const run = progress.runs.find(item => item.id === id)
  if (!run) return undefined
  const match = phoneRuns.find(item => key(item) === key(run))
  return match ? { ...run, device: 'phone', path: match.path } : { ...run, device: 'watch' }
}
