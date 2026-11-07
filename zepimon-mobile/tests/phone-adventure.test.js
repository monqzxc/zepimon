import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { addFix, allEggs, changeVerb, currentForm, pendingForm, shownForm, currentPace, decodePath, distanceBetween, earnedForms, eggOpen, eggs, encodePath, expeditionNews, finishAdventure, liveText, megaChoices,
  newAdventure, nextMilestone, openEggs, phoneTrail, restoreActive, restorePhoneRuns, runsToShare, saveActive, simplifyPath, withPhoneRuns, withPhoneTrail } from '../src/phone-adventure.ts'
import { parseJournal, personalBests } from '../src/journal.ts'
import { emptyExpeditions } from '../src/expeditions.ts'
import { mergeRuns } from '../src/progress.ts'

const bulbasaur = ['Bulbasaur', 'Ivysaur', 'Venusaur']
const start = Date.UTC(2026, 9, 26, 6, 0)
// Walks north from a fixed spot: each step moves `meters` metres in `seconds` seconds.
function walk(active, steps, meters = 10, seconds = 7, accuracy = 5) {
  const metersPerDegree = 111195
  let at = active.last?.at ?? start
  let lat = active.last?.lat ?? 14.5
  for (let i = 0; i < steps; i++) {
    lat += meters / metersPerDegree
    at += seconds * 1000
    active = addFix(active, { lat, lng: 121, accuracy, at })
  }
  return active
}

test('eggs, forms and milestones follow the watch rules', () => {
  assert.ok(eggs.some(family => family[0] === 'Bulbasaur'))
  assert.ok(!eggs.some(family => family[0] === 'Mewtwo'), 'Legendary families are Expedition encounters, not eggs')
  assert.deepEqual(earnedForms(bulbasaur, 4999, null), [])
  assert.equal(currentForm(bulbasaur, 5000, null), 'Bulbasaur')
  assert.equal(currentForm(bulbasaur, 15000, null), 'Venusaur')
  assert.deepEqual(megaChoices(bulbasaur), ['Mega Venusaur'])
  assert.equal(currentForm(bulbasaur, 21000, null), 'Mega Venusaur')
})

test('a Legendary or Mythical egg opens once it is caught on a Legendary Expedition', () => {
  const caught = (key, shiny = key.startsWith('Shiny ')) => ({ [key]: { meters: 25000, steps: 0, shiny, form: key.replace(/^Shiny /, ''),
    source: 'expedition', finishedAt: '2026-11-01T08:00:00.000Z' } })
  const mewtwo = allEggs.find(family => family[0] === 'Mewtwo')
  assert.ok(mewtwo, 'Every Legendary family has an egg in the full list')
  assert.equal(allEggs.length, eggs.length + 39)
  assert.ok(!eggOpen(mewtwo, {}), 'Locked before the catch')
  assert.ok(!eggOpen(mewtwo, caught('Mew')), 'Catching another Legendary does not open it')
  assert.ok(eggOpen(mewtwo, caught('Mewtwo')))
  assert.ok(eggOpen(mewtwo, caught('Shiny Mewtwo')), 'A Shiny catch opens it too')
  assert.ok(eggOpen(bulbasaur, {}), 'Other eggs are always open')
  assert.deepEqual(openEggs({}), eggs)
  const opened = openEggs({ ...caught('Mewtwo'), ...caught('Zeraora') })
  assert.equal(opened.length, eggs.length + 2)
  assert.ok(opened.includes(mewtwo))
  assert.deepEqual(opened, allEggs.filter(family => opened.includes(family)), 'Kept in catalog order')
  assert.deepEqual([0, 5000, 14999, 15000, 21000, 42000, 50000].map(m => nextMilestone(bulbasaur, m)), [5000, 10000, 15000, 21000, 42000, 50000, null])
  assert.equal(nextMilestone(['Rattata', 'Raticate'], 10000), 42000)
  assert.equal(nextMilestone(['Rattata', 'Raticate'], 42000), null)
})

test('GPS fixes add distance only when they are accurate, real moves', () => {
  let active = newAdventure(bulbasaur, 'walking', null, start, () => 0.5)
  assert.equal(active.shiny, false)
  assert.equal(active.mega, 'Mega Venusaur')
  active = addFix(active, { lat: 14.5, lng: 121, accuracy: 5, at: start + 1000 })
  assert.equal(active.points.length, 1, 'The first accurate fix starts the route')
  const before = active.meters
  const blurry = addFix(active, { lat: 14.5005, lng: 121, accuracy: 80, at: start + 8000 })
  assert.equal(blurry.meters, before, 'A blurry fix only updates the GPS status')
  assert.equal(blurry.last.accuracy, 80)
  const jitter = addFix(active, { lat: 14.50002, lng: 121, accuracy: 5, at: start + 8000 })
  assert.equal(jitter.meters, before, 'Standing still does not collect distance')
  const teleport = addFix(active, { lat: 14.51, lng: 121, accuracy: 5, at: start + 8000 })
  assert.equal(teleport.meters, before, 'A jump of a kilometre in seven seconds is a glitch')
  active = walk(active, 20)
  assert.ok(Math.abs(active.meters - 200) < 1, `20 steps of 10 m make 200 m, got ${active.meters}`)
  assert.equal(active.points.length, 21)
  const pace = currentPace(active, active.last.at)
  assert.ok(Math.abs(pace - 700) < 1, 'Ten metres every seven seconds is a 11:40 /km pace')
  assert.equal(currentPace(active, active.last.at + 120000), null, 'No pace after standing still for two minutes')
})

test('the egg hatches at 5 km and saving produces a valid watch-style record', () => {
  let active = newAdventure(bulbasaur, 'running', null, start, () => 0)
  assert.equal(active.shiny, true)
  active = addFix(active, { lat: 14.5, lng: 121, accuracy: 4, at: start })
  active = walk(active, 505, 10, 3)
  assert.ok(active.meters >= 5000)
  assert.equal(active.hatchSeconds, 500 * 3, 'Hatched on the fix that crossed 5 km')
  const run = finishAdventure(active, active.last.at + 30000)
  assert.equal(run.record.form, 'Bulbasaur')
  assert.equal(run.record.activity, 'running')
  assert.equal(run.record.elapsedSeconds, 505 * 3 + 30)
  assert.equal(run.record.steps, 0)
  assert.deepEqual(restorePhoneRuns(JSON.parse(JSON.stringify([run]))), [run], 'A saved adventure survives the same checks as watch records')
  assert.deepEqual(restorePhoneRuns([{ ...run, id: 'oops' }, { ...run, path: '\u0001' }, null]), [], 'Damaged adventures are dropped')
})

test('moving time leaves out stops, and every 100 m is timed for pacing', () => {
  let active = newAdventure(bulbasaur, 'running', null, start, () => 0.5)
  active = addFix(active, { lat: 14.5, lng: 121, accuracy: 4, at: start })
  active = walk(active, 25, 10, 3)
  assert.deepEqual(active.pace.at.slice(0, 3), [0, 30, 60], 'Ten 10 m steps every 3 s: a mark each 30 s')
  // Waiting two minutes at a crossing, then on again: the first step back counts only the time it would take to walk it.
  active = walk(active, 1, 10, 120)
  active = walk(active, 24, 10, 3)
  assert.ok(Math.abs(active.meters - 500) < 1)
  assert.equal(active.pace.at.length, 6)
  assert.equal(active.pace.at[3] - active.pace.at[2], 147, 'The clock keeps the stop')
  assert.ok(active.pace.moving[3] - active.pace.moving[2] < 45, 'Moving time does not')
  assert.ok(Math.abs(active.movingSeconds - (49 * 3 + 10 / 0.6)) < 0.01, "49 steps of 3 s and the step after the stop")
  const run = finishAdventure(active, active.last.at)
  assert.equal(run.movingSeconds, Math.floor(active.movingSeconds))
  assert.deepEqual(run.pace, active.pace)
  assert.deepEqual(restorePhoneRuns(JSON.parse(JSON.stringify([run]))), [run])
  const [damaged] = restorePhoneRuns([{ ...run, pace: { start: 0, at: [0, 30, 20], moving: [0, 30, 20] }, movingSeconds: -1 }])
  assert.deepEqual([damaged.id, damaged.pace, damaged.movingSeconds], [run.id, undefined, undefined], 'A damaged pace log is dropped, the adventure kept')
  const restored = restoreActive(saveActive(active))
  assert.deepEqual([restored.movingSeconds, restored.pace], [active.movingSeconds, active.pace])
  const older = JSON.parse(saveActive(active)); delete older.pace; delete older.movingSeconds
  const resumed = restoreActive(JSON.stringify(older))
  assert.deepEqual([resumed.movingSeconds, resumed.pace], [null, { start: Math.floor(active.meters / 100) + 1, at: [], moving: [], elev: [] }], 'An adventure from before pacing logs from here on')
})

test('a GPS clock behind the phone, or an old first fix, still leaves a pace log that survives a restart', () => {
  // The GPS timestamps its fixes by its own clock, here 20 s behind the phone's, and hands over a cached fix first.
  let active = newAdventure(bulbasaur, 'running', null, start, () => 0.5)
  active = addFix(active, { lat: 14.5, lng: 121, accuracy: 4, at: start - 60000 })
  active = addFix(active, { lat: 14.5, lng: 121, accuracy: 4, at: start - 20000 })
  const metersPerDegree = 111195
  for (let i = 1; i <= 60; i++) active = addFix(active, { lat: 14.5 + i * 10 / metersPerDegree, lng: 121, accuracy: 4, at: start - 20000 + i * 3000 })
  const { at, moving } = active.pace
  assert.equal(at.length, 7)
  assert.ok(at.every((time, i) => time >= (i ? at[i - 1] : 0)), `The clock never runs back or below zero, got ${at}`)
  assert.ok(moving.every((time, i) => time <= at[i]), `Moving time never passes the clock, got ${moving} against ${at}`)
  const run = finishAdventure(active, active.last.at)
  assert.deepEqual(restorePhoneRuns(JSON.parse(JSON.stringify([run])))[0].pace, run.pace, 'The saved adventure keeps its splits')
  assert.deepEqual(restoreActive(saveActive(active)).pace, active.pace, 'An adventure reloaded mid-way keeps logging from the start')
  // Logs saved before this was fixed, with moving time a little ahead of the clock, are mended rather than dropped.
  const skewed = { start: 0, at: [0, 25, 55, 85], moving: [0, 30, 60, 85], elev: [null, null, null, null] }
  assert.deepEqual(restorePhoneRuns([{ ...run, pace: skewed }])[0].pace, { ...skewed, moving: [0, 25, 55, 85] })
})

test('altitude is smoothed and kept at every 100 m for the splits', () => {
  let active = newAdventure(bulbasaur, 'running', null, start, () => 0.5)
  const metersPerDegree = 111195
  // 10 m steps every 3 s, climbing a metre a step, with a wild altitude the GPS is unsure of half way.
  for (let i = 0; i <= 60; i++) {
    const unsure = i === 30
    active = addFix(active, { lat: 14.5 + i * 10 / metersPerDegree, lng: 121, accuracy: 4, at: start + i * 3000,
      altitude: unsure ? 900 : 20 + i, altitudeAccuracy: unsure ? 60 : 4 })
  }
  assert.equal(active.pace.elev.length, active.pace.at.length)
  assert.equal(active.pace.elev[0], 20, 'The start mark takes the first altitude')
  const climbs = active.pace.elev.slice(1).map((height, i) => height - active.pace.elev[i])
  // Smoothing lags a few metres behind a steady climb, so the first 100 m reads a little low.
  assert.ok(climbs.every(climb => climb > 5 && climb < 12), `Each 100 m climbs about 10 m, got ${climbs}`)
  const total = active.pace.elev.at(-1) - active.pace.elev[0]
  assert.ok(total > 50 && total <= 60, `60 m climbed in all, less the lag, got ${total}`)
  assert.ok(active.pace.elev.at(-1) < 80, 'The unsure 900 m fix is ignored')
  const run = finishAdventure(active, active.last.at)
  assert.deepEqual(restorePhoneRuns(JSON.parse(JSON.stringify([run])))[0].pace, run.pace)
  assert.equal(restorePhoneRuns([{ ...run, pace: { ...run.pace, elev: [1] } }])[0].pace, undefined, 'A mismatched elevation log is dropped')
  const flat = walk(newAdventure(bulbasaur, 'walking', null, start, () => 0.5), 30)
  assert.ok(flat.pace.elev.every(height => height === null), 'Without altitude the marks have none')
})

test('routes are compressed for storage and simplified to a bounded size', () => {
  const points = [[14.5, 121], [14.50123, 121.00456], [14.49877, 120.99544], [-33.86882, 151.20929]]
  assert.deepEqual(decodePath(encodePath(points)), points)
  const wiggly = Array.from({ length: 3000 }, (_, i) => [14.5 + i * 0.00005, 121 + Math.sin(i / 7) * 0.0002])
  const simple = simplifyPath(wiggly, 400)
  assert.ok(simple.length <= 400 && simple.length > 50)
  assert.deepEqual(simple[0], wiggly[0])
  assert.deepEqual(simple.at(-1), wiggly.at(-1))
  const straight = Array.from({ length: 100 }, (_, i) => [14.5 + i * 0.0001, 121])
  assert.equal(simplifyPath(straight).length, 2, 'A straight line keeps only its ends')
  assert.ok(Math.abs(distanceBetween({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) - 111195) < 1)
})

test('phone adventures fill a journal even without a watch import', () => {
  let active = addFix(newAdventure(bulbasaur, 'walking', null, start, () => 0.5), { lat: 14.5, lng: 121, accuracy: 5, at: start })
  active = walk(active, 1100, 10, 7)
  const run = finishAdventure(active, active.last.at)
  const journal = withPhoneRuns(null, [run])
  assert.equal(journal.snapshot.capturedAt, 0)
  assert.deepEqual(Object.keys(journal.snapshot.dex).sort(), ['Bulbasaur', 'Ivysaur'])
  assert.equal(journal.snapshot.dex.Ivysaur.form, undefined, 'Dex records carry the journey, not the family form')
  const route = journal.routes.findIndex(family => family[0] === 'Bulbasaur')
  assert.equal(journal.snapshot.records[route].meters, run.record.meters)
  assert.equal(personalBests(journal).distance.meters, run.record.meters)
  assert.equal(withPhoneRuns(null, []), null)
})

test('a watch journal keeps its own data, and the newest record per family wins', () => {
  const watch = parseJournal(readFileSync(new URL('../examples/demo-export.json', import.meta.url), 'utf8'))
  const copy = JSON.stringify(watch)
  const route = watch.routes.findIndex(family => family[0] === 'Bulbasaur')
  const older = { id: 'phone-1', family: bulbasaur, path: '', record: { meters: 7000, steps: 0, shiny: false, activity: 'walking',
    finishedAt: '2020-01-01T00:00:00.000Z', startedAt: 1, elapsedSeconds: 4000, form: 'Bulbasaur' } }
  const newer = { ...older, id: 'phone-2', record: { ...older.record, meters: 2000, finishedAt: '2030-01-01T00:00:00.000Z', startedAt: 2, form: 'Egg' } }
  const merged = withPhoneRuns(watch, [newer, older])
  assert.equal(JSON.stringify(watch), copy, 'The stored watch journal is never changed')
  assert.equal(merged.snapshot.records[route].finishedAt, newer.record.finishedAt)
  assert.deepEqual(merged.snapshot.dex.Bulbasaur, watch.snapshot.dex.Bulbasaur, 'An older phone adventure does not replace a newer watch record')
  const odd = withPhoneRuns(watch, [{ ...newer, family: ['Missingno'] }])
  assert.deepEqual(odd.routes.at(-1), ['Missingno'], 'Unknown families get their own route')
})

test('adventures go to the watch without routes, and come back from it counted once', () => {
  const run = (id, meters, finishedAt) => ({ id, family: bulbasaur, path: 'abc', record: { meters, steps: 0, shiny: false, activity: 'walking',
    finishedAt, startedAt: Date.parse(finishedAt) - 3600000, elapsedSeconds: 3600, form: meters >= 5000 ? 'Bulbasaur' : 'Egg' } })
  const runs = [run('phone-2', 6000, '2026-10-21T03:00:00.000Z'), run('phone-1', 3000, '2026-10-20T03:00:00.000Z'), run('phone-3', 5200, '2026-10-22T03:00:00.000Z')]
  const shared = runsToShare(runs, new Set(['phone-3']))
  assert.deepEqual(shared.map(item => item.id), ['phone-1', 'phone-2'], 'Not sent yet, oldest first')
  assert.ok(shared.every(item => !('path' in item)), 'Routes stay on the phone')
  assert.deepEqual(runsToShare(runs, new Set(), 2).map(item => item.id), ['phone-2', 'phone-3'], 'With many to send, the newest go first')
  assert.deepEqual(runsToShare(runs, new Set(runs.map(item => item.id))), [])
  // phone-2 is saved here; then the watch adds it to its journal, as its latest Bulbasaur record and longest adventure,
  // and syncs that journal back.
  const watch = parseJournal(readFileSync(new URL('../examples/demo-export.json', import.meta.url), 'utf8'))
  const route = watch.routes.findIndex(family => family.join('>') === bulbasaur.join('>'))
  const synced = { ...watch, snapshot: { ...watch.snapshot, records: { ...watch.snapshot.records, [route]: { ...runs[0].record } },
    personalBests: { ...watch.snapshot.personalBests, distance: { ...runs[0].record, route } } } }
  const saved = mergeRuns([], withPhoneRuns(watch, [runs[0]]))
  assert.equal(saved.filter(item => item.record.finishedAt === runs[0].record.finishedAt).length, 1)
  const after = mergeRuns(saved, withPhoneRuns(synced, [runs[0]]))
  assert.deepEqual(after.map(item => item.id), saved.map(item => item.id), 'A phone adventure that came back from the watch is still one adventure')
})

test('phone adventures walk their own expedition trail', () => {
  const run = (id, meters, startedAt) => ({ id, family: bulbasaur, path: '', record: { meters, steps: 0, shiny: false, finishedAt: new Date(startedAt + 1000).toISOString(), startedAt } })
  const first = phoneTrail([run('phone-5', 4000, 5)])
  const later = phoneTrail([run('phone-9', 3000, 9), run('phone-5', 4000, 5)])
  assert.equal(later.seed, first.seed, 'The first adventure fixes the seed')
  assert.equal(later.meters, 7000)
  const progress = withPhoneTrail(emptyExpeditions(), [run('phone-5', 4000, 5)])
  const key = Object.keys(progress.trails)[0]
  const claimed = { ...progress, trails: { [key]: { ...progress.trails[key], claimed: 1 } } }
  assert.equal(withPhoneTrail(claimed, [run('phone-9', 30000, 9), run('phone-5', 4000, 5)]).trails[key].claimed, 1, 'Claims survive new adventures')
  assert.deepEqual([expeditionNews(4000, 6000), expeditionNews(6000, 7000), expeditionNews(24000, 26000)], ['clue', null, 'encounter'])
})

test('the adventure in progress survives a restart', () => {
  let active = addFix(newAdventure(bulbasaur, 'walking', 'Mega Venusaur', start, () => 0.5), { lat: 14.5, lng: 121, accuracy: 5, at: start })
  active = walk(active, 30)
  const restored = restoreActive(saveActive(active))
  assert.equal(restored.meters, active.meters)
  assert.deepEqual(restored.points, active.points)
  assert.deepEqual(restored.anchor, active.anchor)
  assert.equal(restoreActive('{"family":"oops"}'), null)
  assert.equal(restoreActive('not json'), null)
})

test('the live notification names the workout, the distance and the Pokemon being raised', () => {
  const egg = { ...newAdventure(bulbasaur, 'running', null, start, () => 0.5), meters: 1234 }
  assert.deepEqual(liveText(egg), { activity: 'Run', distance: '1.23 km', pokemon: 'Bulbasaur egg', sprite: 'Egg' })
  const hatched = { ...newAdventure(bulbasaur, 'walking', null, start, () => 0), meters: 10400, seen: 'Ivysaur' }
  assert.deepEqual(liveText(hatched), { activity: 'Walk', distance: '10.40 km', pokemon: 'Shiny Ivysaur', sprite: 'Ivysaur' })
  // An evolution not yet seen on the Adventure screen stays off the lock screen.
  assert.deepEqual(liveText({ ...hatched, seen: 'Egg' }).pokemon, 'Shiny Bulbasaur egg')
  assert.equal(liveText({ ...egg, meters: 0 }).distance, '0.00 km')
})

test('a hatch or evolution reached with the screen off waits to be seen on the Adventure screen, one form at a time', () => {
  const active = { ...newAdventure(bulbasaur, 'walking', null, start, () => 0.5), meters: 10400 }
  assert.equal(active.seen, 'Egg')
  assert.equal(shownForm(active), 'Egg')
  assert.equal(pendingForm(active), 'Bulbasaur')
  assert.equal(pendingForm({ ...active, seen: 'Bulbasaur' }), 'Ivysaur')
  assert.equal(pendingForm({ ...active, seen: 'Ivysaur' }), null)
  assert.equal(pendingForm({ ...active, meters: 1200 }), null)
  // Taken over from the watch or saved before forms were seen: nothing waits.
  const older = { ...active }
  delete older.seen
  assert.equal(shownForm(older), 'Ivysaur')
  assert.equal(pendingForm(older), null)
  // A seen form that is not one of this egg's falls back to the form reached.
  assert.equal(shownForm({ ...active, seen: 'Pikachu' }), 'Ivysaur')
  assert.equal(restoreActive(saveActive({ ...active, seen: 'Bulbasaur' })).seen, 'Bulbasaur')
  assert.equal(changeVerb('Egg', 'Bulbasaur'), 'hatched')
  assert.equal(changeVerb('Bulbasaur', 'Ivysaur'), 'evolved')
  assert.equal(changeVerb('Venusaur', 'Mega Venusaur'), 'Mega Evolved')
})
