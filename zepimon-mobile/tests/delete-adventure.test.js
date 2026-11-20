import test from 'node:test'
import assert from 'node:assert/strict'
import { DeleteRefused, deleteRun, restoreDeleted, restoreTrailBase, runKey, withoutDeleted } from '../src/delete-adventure.ts'
import { allAdventures } from '../src/adventures.ts'
import { runningTickets } from '../src/running.ts'
import { encodePath, phoneTrail, restorePhoneRuns, withPhoneTrail } from '../src/phone-adventure.ts'
import { parseJournal } from '../src/journal.ts'
import { collectionOf, walkedJournal } from '../src/collection.ts'
import { emptyExpeditions, restoreExpeditions } from '../src/expeditions.ts'
import { emptyProgress, importProgress, restoreProgress } from '../src/progress.ts'
import { emptyFriendship } from '../src/friendship.ts'
import { emptyTraining, startPlan } from '../src/training.ts'
import { emptyQuest } from '../src/expedition-quest.ts'
import { expeditionKey } from '../src/generated/expedition.js'

const BULBASAUR = ['Bulbasaur', 'Ivysaur', 'Venusaur']
const CHARMANDER = ['Charmander', 'Charmeleon', 'Charizard']
const NOW = Date.UTC(2026, 10, 18)
const iso = n => new Date(NOW - n * 3600000).toISOString()
const record = (finishedAt, meters = 5000, extra = {}) => ({ meters, steps: 0, shiny: false, finishedAt, ...extra })

// A watch journal that holds the bugged run (finished at `bad`) in every place the watch keeps it, beside other runs.
const BAD = iso(1)
const journalWith = () => parseJournal(JSON.stringify({
  exportVersion: 1, app: 'Zepimon', exportedAt: new Date(NOW).toISOString(), receivedAt: NOW, routes: [BULBASAUR, CHARMANDER],
  snapshot: { schemaVersion: 1, capturedAt: NOW, active: null,
    dex: { Bulbasaur: record(BAD), Ivysaur: record(BAD), Charmander: record(iso(50)) },
    records: { 0: record(BAD), 1: record(BAD, 3000) },
    personalBests: { distance: { ...record(BAD), route: 0 }, elapsed: { ...record(iso(60), 4000, { elapsedSeconds: 9000 }), route: 0 } },
    recent: [{ ...record(BAD), route: 0 }, { ...record(BAD, 3000), route: 1 }, { ...record(iso(70), 2000), route: 0 }] }
}))
const deleted = [runKey(BULBASAUR, BAD)]

test('runKey joins the family and the finish time', () => {
  assert.equal(runKey(BULBASAUR, BAD), `Bulbasaur>Ivysaur>Venusaur@${BAD}`)
})

test('withoutDeleted removes a deleted run from the records, recent log, personal bests and dex', () => {
  const after = withoutDeleted(journalWith(), deleted).snapshot
  assert.equal(after.records[0], undefined)
  assert.equal(after.personalBests.distance, undefined)
  assert.equal(after.dex.Bulbasaur, undefined)
  assert.equal(after.dex.Ivysaur, undefined)
  assert.ok(!after.recent.some(item => item.route === 0 && item.finishedAt === BAD))
})

test('withoutDeleted keeps the other records, bests and dex entries', () => {
  const after = withoutDeleted(journalWith(), deleted).snapshot
  assert.ok(after.personalBests.elapsed)
  assert.ok(after.dex.Charmander)
  assert.equal(after.recent.length, 2)
})

test('withoutDeleted leaves another family that finished at the same time', () => {
  const after = withoutDeleted(journalWith(), deleted).snapshot
  assert.equal(after.records[1].meters, 3000)
  assert.ok(after.recent.some(item => item.route === 1 && item.finishedAt === BAD))
})

test('withoutDeleted leaves the same family finished at another time', () => {
  const after = withoutDeleted(journalWith(), [runKey(BULBASAUR, iso(999))]).snapshot
  assert.ok(after.records[0])
  assert.ok(after.personalBests.distance)
})

test('withoutDeleted returns the same journal when there is nothing to remove', () => {
  const journal = journalWith()
  assert.equal(withoutDeleted(journal, []), journal)
  assert.equal(withoutDeleted(journal, [runKey(BULBASAUR, iso(999))]), journal)
})

test('withoutDeleted still gives a journal parseJournal accepts', () => {
  const after = withoutDeleted(journalWith(), deleted)
  assert.doesNotThrow(() => parseJournal(JSON.stringify(after)))
})

test('restoreDeleted drops anything that is not a short string and keeps the last 500', () => {
  assert.deepEqual(restoreDeleted(undefined), [])
  assert.deepEqual(restoreDeleted('nope'), [])
  assert.deepEqual(restoreDeleted(['a', 3, null, 'b', 'x'.repeat(201)]), ['a', 'b'])
  const many = Array.from({ length: 600 }, (_, i) => `k${i}`)
  const kept = restoreDeleted(many)
  assert.equal(kept.length, 500)
  assert.equal(kept[0], 'k100')
})

const phoneRun = (startedAt, meters) => ({ id: `phone-${startedAt}`, family: BULBASAUR, path: '',
  record: record(new Date(startedAt + 1800000).toISOString(), meters, { startedAt, elapsedSeconds: 1800 }) })

test('phoneTrail with a base keeps its seed and start after the first run is gone', () => {
  const base = { seed: 7, startedAt: 1 }
  const trail = phoneTrail([phoneRun(2000, 3000)], base)
  assert.deepEqual({ seed: trail.seed, startedAt: trail.startedAt, meters: trail.meters }, { seed: 7, startedAt: 1, meters: 3000 })
})

test('phoneTrail with a base exists with no runs left, at zero metres', () => {
  const trail = phoneTrail([], { seed: 7, startedAt: 1 })
  assert.equal(expeditionKey(trail), expeditionKey({ seed: 7, startedAt: 1 }))
  assert.equal(trail.meters, 0)
})

test('phoneTrail without a base is unchanged: no runs, no trail', () => {
  assert.equal(phoneTrail([]), null)
  assert.ok(phoneTrail([phoneRun(2000, 3000)]).seed >= 0)
})

test('withPhoneTrail with a base keeps one trail and never raises it above what is left', () => {
  const base = { seed: 7, startedAt: 1 }
  const key = expeditionKey(base)
  const progress = { trails: { [key]: { ...base, meters: 1000, claimed: 0 } }, dex: {} }
  const next = withPhoneTrail(progress, [phoneRun(2000, 500)], base)
  assert.deepEqual(Object.keys(next.trails), [key])
  assert.equal(next.trails[key].meters, 1000)
})

// ---- deleteRun ----
const ROUTE = encodePath([[51.5, -0.1], [51.51, -0.11]])
// A phone adventure of `meters` that started at `startedAt` and took `minutes`.
const run = (startedAt, meters, minutes = 30, extra = {}) => ({ id: `phone-${startedAt}`, family: BULBASAUR, path: ROUTE,
  record: record(new Date(startedAt + minutes * 60000).toISOString(), meters, { startedAt, elapsedSeconds: minutes * 60, activity: 'walking', ...extra }) })
const T1 = Date.UTC(2026, 9, 1, 12), T2 = Date.UTC(2026, 9, 2, 12), T3 = Date.UTC(2026, 9, 3, 12)
// The state the store would hold after saving these phone adventures (savePhoneRun's own steps).
function saved(runs, extra = {}) {
  const state = { journal: null, expeditions: emptyExpeditions(), safari: {}, phoneRuns: [...runs].reverse(), progress: emptyProgress(),
    friendship: emptyFriendship(), training: emptyTraining(), quest: emptyQuest(), buddy: null, deleted: [], trailBase: null, ...extra }
  // One save at a time, oldest first, as the store does: each save adds what the collection holds to the Journal runs.
  const order = [...runs].sort((a, b) => Date.parse(a.record.finishedAt) - Date.parse(b.record.finishedAt))
  order.forEach((_, i) => {
    const so_far = { ...state, phoneRuns: order.slice(0, i + 1).reverse() }
    state.expeditions = withPhoneTrail(state.expeditions, so_far.phoneRuns)
    state.progress = importProgress(state.progress, walkedJournal({ ...so_far, expeditions: state.expeditions }), NOW)
  })
  return state
}
const keyOf = item => runKey(item.family, item.record.finishedAt)
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze) } return value }

test('deleteRun removes the run from the phone runs and the Journal runs, and remembers its key', () => {
  const bad = run(T1, 5000, 16), good = run(T2, 3000)
  const after = deleteRun(saved([bad, good]), bad.id, NOW)
  assert.deepEqual(after.phoneRuns.map(item => item.id), [good.id])
  assert.ok(!after.progress.runs.some(item => keyOf(item) === keyOf(bad)))
  assert.ok(after.progress.runs.some(item => keyOf(item) === keyOf(good)))
  assert.deepEqual(after.deleted, [keyOf(bad)])
})

test("deleteRun takes its personal best and Dex form with it but keeps another run's", () => {
  const bad = run(T1, 5000, 16), good = run(T2, 3000)
  const before = saved([bad, good])
  assert.ok(walkedJournal(before).snapshot.dex.Bulbasaur, 'the 5 km run hatched Bulbasaur')
  const after = walkedJournal(deleteRun(before, bad.id, NOW)).snapshot
  assert.equal(after.dex.Bulbasaur, undefined)
  assert.equal(after.personalBests.distance.meters, 3000)
})

test('deleteRun keeps the same single trail, smaller, when the first run was the one deleted', () => {
  const first = run(T1, 2000), second = run(T2, 3000)
  const before = saved([first, second])
  const [key] = Object.keys(before.expeditions.trails)
  assert.equal(before.expeditions.trails[key].meters, 5000)
  const after = deleteRun(before, first.id, NOW)
  assert.deepEqual(Object.keys(after.expeditions.trails), [key])
  assert.equal(after.expeditions.trails[key].meters, 3000)
  const again = withPhoneTrail(after.expeditions, after.phoneRuns, after.trailBase)
  assert.deepEqual(Object.keys(again.trails), [key], 'saving or loading afterwards makes no second trail')
  assert.equal(again.trails[key].meters, 3000)
})

test('deleteRun revokes a badge only this run earned', () => {
  const only = saved([run(T1, 5000)])
  assert.ok(only.progress.unlocked['first-hatch'] && only.progress.unlocked['first-walk'])
  const after = deleteRun(only, only.phoneRuns[0].id, NOW)
  assert.equal(after.progress.unlocked['first-hatch'], undefined)
  assert.equal(after.progress.unlocked['first-walk'], undefined)
})

test('deleteRun keeps a badge another run also earned', () => {
  const bad = run(T1, 5000, 16), other = run(T2, 6000)
  const before = saved([bad, other])
  const after = deleteRun(before, bad.id, NOW)
  assert.equal(after.progress.unlocked['first-hatch'], before.progress.unlocked['first-hatch'])
})

test('deleteRun keeps a badge it cannot account for', () => {
  const before = saved([run(T1, 5000), run(T2, 1000)])
  before.progress.unlocked['night-owl'] = 123
  const after = deleteRun(before, `phone-${T1}`, NOW)
  assert.equal(after.progress.unlocked['night-owl'], 123)
})

test('deleteRun clears a buddy only this run gave and keeps one another run gave', () => {
  const bad = run(T1, 5000, 16), other = run(T2, 5000)
  assert.equal(deleteRun(saved([bad], { buddy: 'Bulbasaur' }), bad.id, NOW).buddy, null)
  assert.equal(deleteRun(saved([bad, other], { buddy: 'Bulbasaur' }), bad.id, NOW).buddy, 'Bulbasaur')
})

test('deleteRun counts nothing for the Gym once the run is deleted, whichever id the Gym held', () => {
  const bad = run(T1, 5000, 16)
  for (const held of [bad.id, saved([bad]).progress.runs[0].id]) {
    const training = { ...emptyTraining(), badges: { 'first-hatch': { at: T1, adventureId: held, warm: true, perfect: false } } }
    const after = deleteRun(saved([bad], { training }), bad.id, NOW)
    assert.deepEqual(after.training.badges, {})
  }
})

test('deleteRun on the only run, with no watch journal, leaves state the app can load again', () => {
  const only = run(T1, 5000, 16)
  const after = deleteRun(saved([only]), only.id, NOW)
  assert.deepEqual(after.phoneRuns, [])
  const through = JSON.parse(JSON.stringify(after))
  assert.doesNotThrow(() => restoreProgress(through.progress))
  assert.deepEqual(restorePhoneRuns(through.phoneRuns), [])
  assert.doesNotThrow(() => restoreExpeditions(through.expeditions, through.quest.unlocks))
  assert.equal(collectionOf(after).dex.Bulbasaur, undefined)
})

test('deleteRun refuses an id that is not on this phone', () => {
  assert.throws(() => deleteRun(saved([run(T1, 5000)]), 'phone-1', NOW), /not on this phone/)
})

test('deleteRun does not change the state it was given', () => {
  const state = freeze(saved([run(T1, 5000, 16), run(T2, 3000)]))
  assert.doesNotThrow(() => deleteRun(state, `phone-${T1}`, NOW))
})

test('a watch journal that still holds a deleted run does not bring it back', () => {
  const bad = run(T1, 5000, 16)
  const after = deleteRun(saved([bad]), bad.id, NOW)
  const watch = parseJournal(JSON.stringify({ exportVersion: 1, app: 'Zepimon', exportedAt: new Date(NOW).toISOString(), receivedAt: NOW, routes: [BULBASAUR],
    snapshot: { schemaVersion: 1, capturedAt: NOW, active: null, dex: { Bulbasaur: bad.record }, records: { 0: bad.record },
      personalBests: { distance: { ...bad.record, route: 0 } }, recent: [{ ...bad.record, route: 0 }] } }))
  const filtered = withoutDeleted(watch, after.deleted)
  const progress = importProgress(after.progress, filtered, NOW)
  assert.ok(!progress.runs.some(item => keyOf(item) === keyOf(bad)))
  assert.equal(filtered.snapshot.dex.Bulbasaur, undefined)
})

// ---- permits and the guard ----
const WEEK = 7 * 86400000
const weekly = (count, meters = 1500) => Array.from({ length: count }, (_, i) => run(T1 + i * WEEK, meters))
const tickets = state => runningTickets(allAdventures(state.progress, state.phoneRuns)).length
const trailKeyOf = state => Object.keys(state.expeditions.trails)[0]

test('deleteRun takes back a permit that a running ticket gave', () => {
  const runs = weekly(4)
  const before = saved(runs, { quest: { ...emptyQuest(), running: 1, permits: 1 } })
  assert.equal(tickets(before), 1, 'four weeks in a row earn a ticket')
  const after = deleteRun(before, runs[3].id, NOW)
  assert.equal(tickets(after), 0)
  assert.equal(after.quest.running, 0)
  assert.equal(after.quest.permits, 0)
})

test('deleteRun keeps a ticket permit when the run was not what earned the ticket', () => {
  const runs = [...weekly(4), run(T1 + 5 * WEEK, 1500)]
  const before = saved(runs, { quest: { ...emptyQuest(), running: 1, permits: 1 } })
  const after = deleteRun(before, runs[4].id, NOW)
  assert.deepEqual([after.quest.running, after.quest.permits], [1, 1])
})

test('deleteRun takes back a Gym badge, and the permit that badge gave', () => {
  const bad = run(T1, 5000, 16), other = run(T2, 3000)
  const training = { ...emptyTraining(), badges: { 'first-hatch': { at: T1, adventureId: bad.id, warm: true, perfect: false } } }
  const after = deleteRun(saved([bad, other], { training, quest: { ...emptyQuest(), gyms: 1, permits: 1 } }), bad.id, NOW)
  assert.deepEqual(after.training.badges, {})
  assert.deepEqual([after.quest.gyms, after.quest.permits], [0, 0])
})

test('deleteRun takes back a quest permit when the run was one of its three sessions', () => {
  const [r1, r2, r3] = weekly(3)
  const quest = { ...emptyQuest(), number: 1, permits: 1, since: Date.parse(r3.record.finishedAt) + 1 }
  const after = deleteRun(saved([r1, r2, r3], { quest }), r2.id, NOW)
  assert.deepEqual([after.quest.number, after.quest.permits, after.quest.since], [0, 0, null])
})

test('deleteRun keeps a quest permit when the run came after the quest', () => {
  const [r1, r2, r3] = weekly(3)
  const later = run(T1 + 5 * WEEK, 1500)
  const quest = { ...emptyQuest(), number: 1, permits: 1, since: Date.parse(r3.record.finishedAt) + 1 }
  const after = deleteRun(saved([r1, r2, r3, later], { quest }), later.id, NOW)
  assert.deepEqual([after.quest.number, after.quest.permits], [1, 1])
})

test('deleteRun takes a lost permit off the trail when it was already used on an encounter not yet met', () => {
  const [r1, r2, r3] = weekly(3)
  const before = saved([r1, r2, r3])
  const key = trailKeyOf(before)
  const quest = { ...emptyQuest(), number: 1, permits: 0, since: Date.parse(r3.record.finishedAt) + 1, unlocks: { [key]: 1 } }
  const after = deleteRun({ ...before, quest }, r2.id, NOW)
  assert.deepEqual(after.quest.unlocks, {})
  assert.equal(after.quest.permits, 0)
})

test('deleteRun refuses, changing nothing, when it helped open an encounter already met', () => {
  const [r1, r2, r3] = weekly(3)
  const before = saved([r1, r2, r3])
  const key = trailKeyOf(before)
  const quest = { ...emptyQuest(), number: 1, permits: 0, since: Date.parse(r3.record.finishedAt) + 1, unlocks: { [key]: 1 } }
  const met = { ...before, quest, expeditions: { ...before.expeditions, trails: { [key]: { ...before.expeditions.trails[key], claimed: 1 } } } }
  freeze(met)
  assert.throws(() => deleteRun(met, r2.id, NOW), error => error instanceof DeleteRefused && /already met/.test(error.message))
})

test('restoreDeleted and restoreTrailBase read back what a JSON round trip saved', () => {
  const state = { deleted: [runKey(BULBASAUR, BAD)], trailBase: { seed: 7, startedAt: 1790856000000 } }
  const through = JSON.parse(JSON.stringify(state))
  assert.deepEqual(restoreDeleted(through.deleted), state.deleted)
  assert.deepEqual(restoreTrailBase(through.trailBase), state.trailBase)
})

test('restoreTrailBase gives null for anything that is not a seed and a start time', () => {
  for (const bad of [undefined, null, 'x', {}, { seed: 7 }, { seed: 'a', startedAt: 1 }, { seed: 7, startedAt: Infinity }, { seed: -1, startedAt: 1 }]) {
    assert.equal(restoreTrailBase(bad), null)
  }
})

const startPlanFor = baseline => ({ ...emptyTraining(), active: startPlan(emptyTraining(), 'speed-gym', BULBASAUR, null, T3, baseline).active })

// ---- review fixes ----
test('deleteRun takes a lost permit from a trail with room for it, not from one whose encounter was met', () => {
  const [r1, r2, r3] = weekly(3)
  const before = saved([r1, r2, r3])
  const phoneKey = trailKeyOf(before)
  const watch = { seed: 5, startedAt: Date.UTC(2026, 9, 20), meters: 0, claimed: 1 }
  const watchKey = expeditionKey(watch)
  const quest = { ...emptyQuest(), number: 1, permits: 0, since: Date.parse(r3.record.finishedAt) + 1, unlocks: { [phoneKey]: 1, [watchKey]: 1 } }
  const state = { ...before, quest, expeditions: { ...before.expeditions, trails: { ...before.expeditions.trails, [watchKey]: watch } } }
  const after = deleteRun(state, r2.id, NOW)
  assert.deepEqual(after.quest.unlocks, { [watchKey]: 1 })
})

test('deleteRun does not count a session for two quests when a later run refills the quest it was in', () => {
  const [r1, r2, r3, r4] = weekly(4)
  const quest = { ...emptyQuest(), number: 1, permits: 1, since: Date.parse(r3.record.finishedAt) + 1 }
  const after = deleteRun(saved([r1, r2, r3, r4], { quest }), r2.id, NOW)
  assert.deepEqual([after.quest.number, after.quest.permits], [1, 1], 'quest 1 is still complete from r1, r3 and r4')
  assert.equal(after.quest.since, Date.parse(r4.record.finishedAt) + 1, 'so quest 2 starts after r4, which quest 1 now uses')
})

// A watch journal that holds an older 6 km Bulbasaur adventure and the bugged one, which overwrote the watch's Bulbasaur Dex record.
function watchWithOlderRun(bad) {
  const older = record(new Date(T1 - 40 * 86400000).toISOString(), 6000, { startedAt: T1 - 41 * 86400000, elapsedSeconds: 2000 })
  return { older, journal: parseJournal(JSON.stringify({ exportVersion: 1, app: 'Zepimon', exportedAt: new Date(NOW).toISOString(), receivedAt: NOW, routes: [BULBASAUR],
    snapshot: { schemaVersion: 1, capturedAt: NOW, active: null, dex: { Bulbasaur: bad.record }, records: { 0: bad.record }, recent: [{ ...older, route: 0 }] } })) }
}

test('deleteRun keeps the Pokemon an older adventure earned when the bugged run had overwritten its Dex record', () => {
  const bad = run(T1, 5000, 16)
  const { older, journal } = watchWithOlderRun(bad)
  const before = saved([bad], { journal, buddy: 'Bulbasaur' })
  assert.ok(before.progress.runs.some(item => item.record.finishedAt === older.finishedAt), 'the older adventure is in the Journal runs')
  const after = deleteRun(before, bad.id, NOW)
  assert.equal(after.buddy, 'Bulbasaur')
  assert.equal(walkedJournal(after).snapshot.dex.Bulbasaur.finishedAt, older.finishedAt)
})

test('the older adventure also stands in when a later watch journal sends the bugged Dex record again', () => {
  const bad = run(T1, 5000, 16)
  const { older, journal } = watchWithOlderRun(bad)
  const filtered = withoutDeleted(journal, [keyOf(bad)], [{ id: 'old', family: BULBASAUR, record: older }])
  assert.equal(filtered.snapshot.dex.Bulbasaur.finishedAt, older.finishedAt)
  assert.equal(filtered.snapshot.dex.Bulbasaur.form, undefined)
})

test('deleteRun keeps a badge that was unlocked before the deleted run finished', () => {
  const bad = run(T1, 5000, 16)
  const before = saved([bad])
  before.progress.unlocked['first-hatch'] = Date.parse(bad.record.finishedAt) - 1
  const after = deleteRun(before, bad.id, NOW)
  assert.equal(after.progress.unlocked['first-hatch'], Date.parse(bad.record.finishedAt) - 1)
})

const GYM_RUN_EFFORT = 960
const fakeFast = () => run(T1, 5000, 16, { hatchSeconds: GYM_RUN_EFFORT })

test('deleteRun gives a paced Gym the pace of the fastest 5 km that is left, not the deleted one', () => {
  const bad = fakeFast(), steady = run(T2, 5200, 31)
  const training = startPlanFor(GYM_RUN_EFFORT)
  const after = deleteRun(saved([bad, steady], { training }), bad.id, NOW)
  assert.equal(after.training.active.baseline5k, 31 * 60)
})

test('deleteRun leaves a Speed Gym without paces to run its entry trial again when no 5 km is left', () => {
  const bad = fakeFast()
  const after = deleteRun(saved([bad, run(T2, 3000)], { training: startPlanFor(GYM_RUN_EFFORT) }), bad.id, NOW)
  assert.equal(after.training.active.baseline5k, null)
  assert.equal(after.training.active.entry, true)
})

test('deleteRun leaves the Gym paces alone when they came from another run', () => {
  const bad = fakeFast(), steady = run(T2, 5200, 31)
  const after = deleteRun(saved([bad, steady], { training: startPlanFor(31 * 60) }), bad.id, NOW)
  assert.equal(after.training.active.baseline5k, 31 * 60)
})

test('deleteRun drops a badge time that came from the deleted run but keeps the badge another run earned', () => {
  const bad = fakeFast()
  const training = { ...emptyTraining(), badges: { 'speed-gym': { at: T3, adventureId: 'run-elsewhere', warm: true, perfect: false, time: GYM_RUN_EFFORT } } }
  const after = deleteRun(saved([bad, run(T2, 3000)], { training }), bad.id, NOW)
  assert.ok(after.training.badges['speed-gym'])
  assert.equal(after.training.badges['speed-gym'].time, undefined)
})
