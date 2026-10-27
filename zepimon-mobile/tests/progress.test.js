import assert from 'node:assert/strict'
import test from 'node:test'
import { parseJournal } from '../src/journal.ts'
import { completedRuns, dayKey, emptyProgress, importProgress, missions, restoreProgress, weekStart } from '../src/progress.ts'

const time = (day, hour = 12) => new Date(2026, 9, day, hour).getTime()
const now = time(18)
const run = (day = 16, extra = {}) => ({ meters: 5500, steps: 7000, shiny: false,
  startedAt: time(day, 6), finishedAt: new Date(time(day, 7)).toISOString(), elapsedSeconds: 3600, hatchSeconds: 3200, ...extra })
const journal = (records = { 0: run() }, extra = {}) => parseJournal(JSON.stringify({
  exportVersion: 1, app: 'Zepimon', exportedAt: new Date(now).toISOString(), receivedAt: now,
  routes: [['Bulbasaur', 'Ivysaur', 'Venusaur'], ['Gible', 'Gabite', 'Garchomp']],
  snapshot: { schemaVersion: 1, capturedAt: now, dex: {}, records, active: null, ...extra },
}))
const value = (list, id) => list.find(item => item.id === id).value

test('same run in route records, personal bests and repeat exports counts once', () => {
  const source = journal(undefined, { dex: { Bulbasaur: run(), Ivysaur: run(16, { meters: 10000 }) },
    personalBests: { distance: { ...run(), route: 0 }, elapsed: { ...run(), route: 0 }, hatch: { ...run(), route: 0 } } })
  const first = importProgress(emptyProgress(), source, now)
  const again = importProgress(first, source, now + 1000)
  assert.equal(first.runs.length, 1)
  assert.equal(value(missions(source, first, now), 'fifty-km'), 5.5)
  assert.deepEqual(again, first)
  assert.equal(first.unlocked['early-bird'], now)
})

test('retains earlier runs when a new watch run replaces the same family', () => {
  const before = importProgress(emptyProgress(), journal(), now)
  const source = journal({ 0: run(17, { meters: 6000 }), 1: run(17, { shiny: true }) })
  const after = importProgress(before, source, now)
  assert.equal(after.runs.length, 3)
  assert.equal(value(missions(source, after, now), 'fifty-km'), 17)
  assert.equal(value(missions(source, after, now), 'week-days'), 2)
  assert.equal(before.runs.length, 1, 'Import does not mutate the saved state before persistence succeeds')
})

test('keeps every watch adventure in the recent log, even two with the same egg between syncs', () => {
  // Walked Bulbasaur on the 15th and again on the 16th before the phone synced: the record holds only the second.
  const recent = [{ ...run(15, { meters: 3200, hatchSeconds: undefined, activity: 'walking' }), route: 0 },
    { ...run(16, { activity: 'running' }), route: 0 }]
  const source = journal({ 0: recent[1] }, { recent })
  assert.equal(source.snapshot.recent.length, 2, 'The importer keeps the log')
  const imported = importProgress(emptyProgress(), source, now)
  assert.deepEqual(imported.runs.map(item => item.record.meters), [5500, 3200])
  assert.equal(imported.runs[1].record.activity, 'walking')
  assert.equal(importProgress(imported, source, now + 1000).runs.length, 2, 'The same log again adds nothing')
  assert.equal(importProgress(emptyProgress(), journal(), now).runs.length, 1, 'An older watch without the log still counts its records')
  assert.throws(() => journal({ 0: run() }, { recent: [{ ...run(), route: 7 }] }), /missing Pokemon route/)
})

test('dedup uses family names instead of numeric route IDs or export timestamps', () => {
  const source = journal()
  const before = importProgress(emptyProgress(), source, now)
  const reordered = { ...source, routes: [...source.routes].reverse(), snapshot: { ...source.snapshot, capturedAt: now + 1, records: { 1: run() } } }
  assert.equal(importProgress(before, reordered, now).runs.length, 1)
  const legacy = journal({ 0: run(16, { startedAt: undefined }) })
  assert.equal(importProgress(importProgress(emptyProgress(), legacy, now), source, now).runs.length, 1)
})

test('active, zero-distance and future runs cannot complete running missions', () => {
  const source = journal({ 0: run(16, { meters: 0, hatchSeconds: undefined }), 1: run(20) },
    { active: { ...run(), route: 0, meters: 50000 } })
  const progress = importProgress(emptyProgress(), source, now)
  assert.equal(completedRuns(progress, now).length, 0)
  assert.deepEqual(progress.unlocked, {})
  assert.equal(value(missions(source, progress, now), 'first-walk'), 0)
})

test('weekly totals use local Monday boundaries and distinct finish dates', () => {
  const source = journal({ 0: run(11), 1: run(12) })
  const progress = importProgress(emptyProgress(), source, now)
  assert.equal(weekStart(time(18, 23)), time(12, 0))
  assert.equal(dayKey(time(12)), '2026-10-12')
  assert.equal(value(missions(source, progress, now), 'week-distance'), 5.5)
  assert.equal(value(missions(source, progress, time(19)), 'week-distance'), 0)
  assert.ok(progress.unlocked['first-hatch'], 'Permanent badges survive the week changing')
  assert.equal(progress.unlocked['week-distance'], undefined)
})

test('hidden badges unlock once, preserve variants, and remain earned after a later empty snapshot', () => {
  const source = journal({ 1: run(16, { meters: 21000, form: 'Mega Garchomp' }) },
    { dex: { Gible: run(), 'Shiny Gible': run(17, { shiny: true }) } })
  const first = importProgress(emptyProgress(), source, now)
  for (const id of ['mega-friend', 'both-variants', 'shiny-friend', 'patient-explorer']) assert.equal(first.unlocked[id], now)
  const empty = journal({})
  const next = importProgress(first, empty, now + 1000)
  assert.deepEqual(next.unlocked, first.unlocked)
  assert.equal(next.runs.length, 1)
})

test('does not invent legacy start times or an unselected Mega form', () => {
  const source = journal({ 1: run(16, { meters: 21000, startedAt: undefined }) })
  const progress = importProgress(emptyProgress(), source, now)
  assert.equal(progress.unlocked['early-bird'], undefined)
  assert.equal(progress.unlocked['mega-friend'], undefined)
})

test('Mega and Shiny variants do not inflate the ten-species mission', () => {
  const names = ['Charizard', 'Mega Charizard X', 'Mega Charizard Y', 'Shiny Charizard',
    'Mewtwo', 'Mega Mewtwo X', 'Mega Mewtwo Y', 'Venusaur', 'Mega Venusaur', 'Garchomp', 'Mega Garchomp']
  const source = journal({}, { dex: Object.fromEntries(names.map(name => [name, run()])) })
  const progress = importProgress(emptyProgress(), source, now)
  assert.equal(value(missions(source, progress, now), 'ten-friends'), 4)
  assert.equal(progress.unlocked['ten-friends'], undefined)
})

test('restores and validates saved progress; recomputes identities and ignores unknown badge keys', () => {
  const progress = importProgress(emptyProgress(), journal(), now)
  const raw = JSON.parse(JSON.stringify(progress))
  raw.runs.push({ ...raw.runs[0], id: 'duplicate-wrong-id' })
  raw.unlocked.unknown = 1
  assert.deepEqual(restoreProgress(raw), progress)
  assert.deepEqual(restoreProgress(undefined), emptyProgress())
  raw.runs[0].record.meters = -1
  assert.throws(() => restoreProgress(raw))
})
