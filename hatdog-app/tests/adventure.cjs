const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const context = vm.createContext({})
vm.runInContext('(function(){' + fs.readFileSync('page/catalog.js', 'utf8').replace(/export /g, '') +
  '\nglobalThis.catalog = { routes, species, megaForms, sprites, shinySprites, legacyRoutes } })()', context)
Object.assign(context, { catalogRoutes: context.catalog.routes, species: context.catalog.species,
  megaForms: context.catalog.megaForms, sprites: context.catalog.sprites, shinySprites: context.catalog.shinySprites })
vm.runInContext(fs.readFileSync('page/types.js', 'utf8').replace(/export /g, '') , context)
vm.runInContext(fs.readFileSync('shared/expedition.js', 'utf8').replace(/export /g, '') +
  '\nglobalThis.expeditionTools = { legendarySpecies, ensureExpedition, expeditionGoal, clueMilestones, expeditionEncounter, validateExpedition }', context)
Object.assign(context, context.expeditionTools)
vm.runInContext(fs.readFileSync('page/pokemon.js', 'utf8').replace(/^import .*\r?\n/gm, '').replace(/export /g, '') +
  '\nglobalThis.logic = { routes, speciesCount, generation, megaChoices, rollShiny, collectionCount, dexPokemon, primaryType, spritePath, nextMilestone, acquiredForms, currentForm, elapsedSeconds, elapsedLabel, paceLabel, currentPace, updateSession, finishSession, refreshPersonalBests, repairDexRecords, hasDexDistance, applyPhoneRun }', context)
const { routes, currentForm, updateSession, finishSession } = context.logic
assert.equal(context.logic.elapsedSeconds({ startedAt: 1000 }, 62000), 61)
assert.equal(context.logic.elapsedSeconds({ startedAt: 1000 }, 500), 0)
assert.equal(context.logic.elapsedSeconds({}, 62000), null)
assert.equal(context.logic.elapsedLabel(3661), '01:01:01')
assert.equal(context.logic.elapsedLabel(360061), '100:01:01')
assert.equal(context.logic.paceLabel(3600, 10000), '6:00 /km')
assert.equal(context.logic.paceLabel(3599, 10000), '6:00 /km')
assert.equal(context.logic.paceLabel(10, 0), '--:-- /km')
assert.equal(context.logic.paceLabel(null, 1000), '--:-- /km')
assert.equal(context.logic.paceLabel(5, Number.MIN_VALUE), '--:-- /km')
// Current pace uses recent motion even after a long adventure, then expires at rest.
const paceTracker = {}
let paceAt = 1000
let paceMeters = 10000
const livePace = (activity = 'walking') => context.logic.currentPace(paceTracker, paceMeters, paceAt, activity)
const moveFor = (seconds, metersPerSecond, activity) => {
  for (let i = 0; i < seconds; i++) {
    paceAt += 1000
    paceMeters += metersPerSecond
    livePace(activity)
  }
  return livePace(activity)
}
assert.equal(livePace(), '--:-- /km')
assert.equal(moveFor(4, 2), '--:-- /km', 'Wait for enough fresh observations')
assert.equal(moveFor(1, 2), '8:20 /km')
assert.equal(moveFor(15, 4), '4:10 /km', 'Running replaces the earlier walking pace')
assert.equal(moveFor(15, 1), '16:40 /km', 'Slowing down must increase min/km')
assert.equal(moveFor(15, 0), '--:-- /km', 'Stopping must not keep a stale moving pace')
assert.equal(moveFor(15, 2), '8:20 /km')
const sampleCount = paceTracker.samples.length
for (let i = 0; i < 20; i++) assert.equal(livePace(), '8:20 /km')
assert.equal(paceTracker.samples.length, sampleCount, 'Duplicate step/distance callbacks add no samples')
assert.ok(paceTracker.samples.length <= 17, 'The rolling buffer stays bounded')
assert.equal(moveFor(8, 4, 'running'), '4:10 /km', 'Running adapts within eight seconds of fresh distance updates')
paceAt += 60000
paceMeters += 500
assert.equal(livePace(), '--:-- /km', 'Distance recovered after suspension cannot become a speed spike')
assert.equal(moveFor(6, 2), '8:20 /km')
paceMeters = 0
assert.equal(livePace(), '--:-- /km', 'A distance counter reset starts fresh')
moveFor(5, 2)
paceAt -= 10000
assert.equal(livePace(), '--:-- /km', 'A backward clock change starts fresh')
assert.equal(context.logic.currentPace(paceTracker, NaN, paceAt), '--:-- /km')
assert.equal(paceTracker.samples.length, 0)
// Batched daily distance updates must use their actual interval, not the last draw frame.
const batchedPace = {}
let batchMeters = 0
context.logic.currentPace(batchedPace, batchMeters, 0, 'running')
for (let second = 1; second <= 48; second++) {
  if (second % 12 === 0) batchMeters += 40
  const pace = context.logic.currentPace(batchedPace, batchMeters, second * 1000, 'running')
  assert.equal(pace, second < 12 ? '--:-- /km' : '5:00 /km', 'Keep a steady reading between twelve-second sensor batches')
}
for (let second = 49; second <= 63; second++) {
  const pace = context.logic.currentPace(batchedPace, batchMeters, second * 1000, 'running')
  if (second === 63) assert.equal(pace, '--:-- /km', 'A held estimate expires after fifteen seconds without fresh distance')
}
// Some watches publish distance less often than the old 15-second stale cutoff.
for (const activity of ['walking', 'running']) {
  const slow = {}
  context.logic.currentPace(slow, 0, 0, activity)
  for (let second = 1; second <= 80; second++) {
    const meters = Math.floor(second / 20) * 60
    const pace = context.logic.currentPace(slow, meters, second * 1000, activity)
    assert.equal(pace, second < 20 ? '--:-- /km' : '5:33 /km', 'Twenty-second batches must produce and hold recent pace')
  }
  for (let second = 81; second <= 110; second++) {
    const pace = context.logic.currentPace(slow, 240, second * 1000, activity)
    if (second === 110) assert.equal(pace, '--:-- /km', 'Slow sensor estimates must still expire when stopped')
  }
  // A long stop cannot be displayed as a current moving pace on the first new batch.
  for (let second = 111; second <= 160; second++) context.logic.currentPace(slow, 240, second * 1000, activity)
  assert.equal(context.logic.currentPace(slow, 300, 161000, activity), '--:-- /km')
  for (let second = 162; second < 181; second++) context.logic.currentPace(slow, 300, second * 1000, activity)
  assert.equal(context.logic.currentPace(slow, 360, 181000, activity), '5:33 /km')
}
for (const interval of [30, 45, 60]) {
  const slow = {}
  context.logic.currentPace(slow, 0, 0, 'running')
  for (let second = 1; second <= interval * 3; second++) {
    const pace = context.logic.currentPace(slow, Math.floor(second / interval) * interval * 3, second * 1000, 'running')
    if (second % interval === 0) assert.equal(pace, '5:33 /km', 'Slow batches must not be discarded before calculating pace')
  }
}
// Distance can arrive after a minute, even while steps update normally.
const stepFallback = {}
context.logic.currentPace(stepFallback, 150, 0, 'running', 200)
for (let second = 1; second <= 20; second++) {
  const pace = context.logic.currentPace(stepFallback, 150, second * 1000, 'running', 200 + second * 2)
  if (second >= 5) assert.equal(pace, '11:07 /km', 'Fresh steps use the measured distance per step while distance is delayed')
}
for (let second = 21; second <= 28; second++) {
  const pace = context.logic.currentPace(stepFallback, 150, second * 1000, 'running', 240 + (second - 20) * 3)
  if (second === 28) assert.equal(pace, '7:24 /km', 'Step fallback must adapt to running cadence, not session average speed')
}
for (let second = 29; second <= 43; second++) {
  const pace = context.logic.currentPace(stepFallback, 150, second * 1000, 'running', 264)
  if (second === 43) assert.equal(pace, '--:-- /km', 'Step-based pace expires when motion stops')
}
assert.equal(context.logic.currentPace(stepFallback, 500, 110000, 'running', 700), '--:-- /km', 'Recovered step totals cannot become current pace')
assert.equal(context.logic.currentPace(stepFallback, NaN, 111000, 'running', 703), '--:-- /km', 'Invalid distance must not reuse a calibrated stride')
assert.equal(stepFallback.stride, null)
const delayedSteps = {}
context.logic.currentPace(delayedSteps, 100, 0, 'running', 10)
context.logic.currentPace(delayedSteps, 100, 1000, 'running', 100)
assert.equal(delayedSteps.stride, 1, 'A temporarily mismatched counter pair must not prevent later calibration')
const noDistance = {}
for (let second = 0; second <= 20; second++) {
  assert.equal(context.logic.currentPace(noDistance, 0, second * 1000, 'running', second * 3), '--:-- /km', 'Do not invent a stride length before any distance is measured')
}
for (const interval of [61, 90]) {
  const slow = {}
  context.logic.currentPace(slow, 0, 0, 'running', 0)
  for (let second = 1; second <= interval * 3; second++) {
    const meters = Math.floor(second / interval) * interval * 3
    const pace = context.logic.currentPace(slow, meters, second * 1000, 'running', meters)
    if (second >= interval * 2 && second % interval === 0) assert.equal(pace, '5:33 /km', 'Repeated batches over sixty seconds must eventually establish pace')
  }
}
assert.equal(context.logic.primaryType('Charizard'), 'fire')
assert.equal(context.logic.primaryType('Shiny Gengar'), 'ghost')
assert.equal(context.logic.dexPokemon({ Bulbasaur: {}, 'Shiny Bulbasaur': {} }).length, 1)
assert.equal(Array.from({ length: 100 }, (_, i) => context.logic.rollShiny(() => (i + 0.5) / 100)).filter(Boolean).length, 2)
assert.equal(context.logic.rollShiny(() => 0.01999), true)
assert.equal(context.logic.rollShiny(() => 0.02), false)
// The catalog builds its sprite paths from Dex numbers; every one must be a real file.
for (const path of Object.values(context.catalog.sprites)) assert.ok(fs.existsSync('assets/bip-5-unity/' + path), path)
for (const path of Object.values(context.catalog.shinySprites)) assert.ok(fs.existsSync('assets/bip-5-unity/' + path))
assert.equal(new Set(routes.flat()).size, 552)
for (let id = 1; id <= 493; id++) assert.ok(Object.values(context.catalog.species).some(s => s.id === id))
assert.equal(Object.keys(context.catalog.megaForms).length, 87)
for (const [base, variants] of Object.entries(context.catalog.megaForms)) {
  const route = routes.findIndex(r => r[r.length - 1] === base)
  assert.ok(route >= 0, 'Missing selectable Mega route: ' + base)
  for (const form of variants) {
    assert.equal(currentForm(route, 20999, form), base)
    assert.equal(currentForm(route, 21000, form), form)
    assert.equal(context.logic.nextMilestone(route, 20000), 21000)
    assert.equal(context.logic.nextMilestone(route, 21000), null)
    assert.ok(fs.existsSync('assets/bip-5-unity/' + context.logic.spritePath(form)))
  }
}
context.catalog.legacyRoutes.forEach((old, i) => {
  assert.equal(routes[i].slice(0, old.length).join(','), old.join(','), 'Legacy route changed: ' + i)
})
for (const name of routes.flat()) assert.ok(fs.existsSync('assets/bip-5-unity/' + context.logic.spritePath(name)))
for (const [meters, form] of [[0, 'Egg'], [4999, 'Egg'], [5000, 'Bulbasaur'],
  [9999, 'Bulbasaur'], [10000, 'Ivysaur'], [14999, 'Ivysaur'], [15000, 'Venusaur']]) {
  assert.equal(currentForm(0, meters), form)
}
assert.equal(currentForm(routes.findIndex(r => r[0] === 'Pikachu'), 15000), 'Raichu')
assert.equal(currentForm(routes.findIndex(r => r[0] === 'Mew'), 10000), 'Mew')
const active = { route: 0, meters: 0, steps: 0, lastMeters: 2000, lastSteps: 3000, day: 'day1' }
updateSession(active, 2500, 3700, 'day1')
assert.equal(active.meters, 500)
assert.equal(active.steps, 700)
updateSession(active, 2500, 3700, 'day1')
assert.equal(active.meters, 500)
updateSession(active, 100, 150, 'day2')
assert.equal(active.meters, 600)
assert.equal(active.steps, 850)
updateSession(active, NaN, 150, 'day2')
assert.equal(active.meters, 600)
const state = { active: { ...active, meters: 15000 }, records: {}, dex: {} }
finishSession(state, '2026-10-14T00:00:00Z')
assert.equal(Object.keys(state.dex).length, 3)
assert.equal(state.active, null)
state.active = { ...active, meters: 5500 }
finishSession(state, '2026-10-15T00:00:00Z')
assert.equal(state.records[0].meters, 5500)
assert.equal(state.dex.Bulbasaur.meters, 5500)
assert.ok(state.dex.Venusaur)
assert.equal(state.dex.Venusaur.meters, 15000, 'A repeat hatch must not replace an evolution that was not reached')
state.active = { ...active, meters: 21000, mega: 'Mega Venusaur' }
finishSession(state, '2026-10-16T00:00:00Z')
assert.equal(state.dex['Mega Venusaur'].meters, 21000)
assert.equal(state.records[0].form, 'Mega Venusaur')
state.active = { ...active, meters: 1000, mega: 'Mega Venusaur' }
finishSession(state, '2026-10-17T00:00:00Z')
assert.ok(state.dex['Mega Venusaur'])
assert.equal(state.dex['Mega Venusaur'].meters, 21000, 'An unhatched repeat must preserve the Mega record')
assert.equal(state.records[0].meters, 1000)
assert.equal(context.logic.nextMilestone(routes.findIndex(r => r[0] === 'Mew'), 15000), null)
assert.equal(currentForm(0, 21000, 'Mega Mewtwo X'), 'Venusaur')
state.active = { ...active, meters: 21000, mega: 'Mega Venusaur', shiny: true }
finishSession(state, '2026-10-18T00:00:00Z')
assert.ok(state.dex['Shiny Bulbasaur'])
assert.ok(state.dex['Shiny Mega Venusaur'])
assert.equal(state.records[0].shiny, true)
assert.ok(state.dex.Bulbasaur)
assert.equal(context.logic.collectionCount(state.dex), 3)
const earnedBeforeZeroRun = JSON.stringify(state.dex)
state.active = { ...active, meters: 0, shiny: true }
finishSession(state, '2026-10-19T00:00:00Z')
assert.equal(JSON.stringify(state.dex), earnedBeforeZeroRun, 'A zero-distance save preserves both acquired variants')
assert.equal(state.records[0].meters, 0, 'The latest route journey still replaces its predecessor')
assert.deepEqual(Array.from(state.recent, item => item.meters), [15000, 5500, 21000, 1000, 21000, 0],
  'Every saved adventure is logged for the phone, even when the same egg is walked again')
assert.deepEqual(JSON.parse(JSON.stringify(state.recent.at(-1))), JSON.parse(JSON.stringify({ ...state.records[0], route: 0 })))
for (let i = 0; i < 40; i++) { state.active = { ...active, meters: 100 + i }; finishSession(state, '2026-10-20T00:00:00Z') }
assert.equal(state.recent.length, 30, 'The log keeps the latest 30')
assert.equal(state.recent.at(-1).meters, 139)

const timed = { dex: {}, records: {}, active: { ...active, meters: 5000,
  startedAt: Date.parse('2026-10-15T01:00:00.000Z') } }
finishSession(timed, '2026-10-15T02:00:00.000Z')
assert.equal(timed.records[0].elapsedSeconds, 3600)
assert.equal(timed.records[0].startedAt, Date.parse('2026-10-15T01:00:00.000Z'))
assert.equal(timed.dex.Bulbasaur.elapsedSeconds, 3600, 'Dex stores the same completed journey timing')
assert.equal(context.logic.paceLabel(timed.records[0].elapsedSeconds, timed.records[0].meters), '12:00 /km')
assert.equal(state.records[0].elapsedSeconds, null, 'Legacy sessions must not invent timing')

// Hatch timing is the first detected 5 km crossing, not the eventual finish time.
const hatching = { ...active, meters: 4999, lastMeters: 4999, startedAt: 1000 }
updateSession(hatching, 4999, 7000, hatching.day, 1701000)
assert.equal(hatching.hatchSeconds, undefined)
updateSession(hatching, 5000, 7001, hatching.day, 1801000)
assert.equal(hatching.hatchSeconds, 1800)
const reopenedHatch = JSON.parse(JSON.stringify(hatching))
updateSession(reopenedHatch, 8000, 10000, reopenedHatch.day, 2501000)
assert.equal(reopenedHatch.hatchSeconds, 1800)
const hatchedSave = { dex: {}, records: {}, active: reopenedHatch }
finishSession(hatchedSave, new Date(3601000).toISOString())
assert.equal(hatchedSave.records[0].hatchSeconds, 1800)
assert.equal(hatchedSave.records[0].elapsedSeconds, 3600)
assert.equal(hatchedSave.dex.Bulbasaur.hatchSeconds, 1800)
const legacyHatched = { ...active, meters: 6000, lastMeters: 6000, startedAt: 1000 }
updateSession(legacyHatched, 6500, 9000, legacyHatched.day, 1801000)
assert.equal(legacyHatched.hatchSeconds, undefined, 'Do not backfill already-hatched legacy sessions')
const noStartTime = { ...active, meters: 4999, lastMeters: 4999 }
updateSession(noStartTime, 5000, 7000, noStartTime.day, 1801000)
assert.equal(noStartTime.hatchSeconds, undefined)
const lateObservation = { ...active, meters: 4000, lastMeters: 4000, startedAt: 1000 }
updateSession(lateObservation, 8000, 10000, lateObservation.day, 3601000)
assert.equal(lateObservation.hatchSeconds, 3600, 'A delayed update uses detection time, not an invented crossing time')

const finishAt = Date.parse('2026-10-16T02:00:00.000Z')
const record = (meters, elapsedSeconds, hatchSeconds, form) => ({ meters, elapsedSeconds, hatchSeconds,
  steps: Math.floor(meters * 1.4), finishedAt: new Date(finishAt - 86400000).toISOString(), shiny: false, form })
const historyState = { dex: {}, records: {
  0: record(25000, 20000, 3000, 'Mega Venusaur'),
  1: record(30000, 10000, 2500, currentForm(1, 30000))
}, active: { ...active, route: 0, meters: 5000, startedAt: finishAt - 1800000, hatchSeconds: 1200, shiny: true } }
finishSession(historyState, new Date(finishAt).toISOString())
assert.equal(historyState.personalBests.distance.route, 1)
assert.equal(historyState.personalBests.elapsed.route, 0)
assert.equal(historyState.personalBests.elapsed.elapsedSeconds, 20000, 'Seed the old record before replacing its route')
assert.equal(historyState.personalBests.hatch.hatchSeconds, 1200)
assert.equal(historyState.personalBests.hatch.shiny, true)
historyState.records[1].meters = 1000
context.logic.refreshPersonalBests(historyState)
assert.equal(historyState.personalBests.distance.meters, 30000, 'Best must be a copy independent of the latest record')
historyState.records[2] = record(30000, 20000, 1200, currentForm(2, 30000))
context.logic.refreshPersonalBests(historyState)
assert.equal(historyState.personalBests.distance.route, 1, 'Ties retain the existing winner')
assert.equal(historyState.personalBests.elapsed.route, 0)
assert.equal(historyState.personalBests.hatch.route, 0)
const invalidBests = { records: { 0: record(6000, null, null, 'Bulbasaur'),
  1: record(4000, 0, 1, 'Egg'), 2: record(6000, 100, 200, 'Squirtle') },
  active: { meters: 999999, elapsedSeconds: 999999, hatchSeconds: 1 } }
context.logic.refreshPersonalBests(invalidBests)
assert.equal(invalidBests.personalBests.distance.meters, 6000, 'Unsaved active session must not compete')
assert.equal(invalidBests.personalBests.elapsed.elapsedSeconds, 100)
assert.equal(invalidBests.personalBests.hatch, undefined, 'Missing, zero, unhatched and inconsistent timing must not win')

// Repair only acquired variants with evidence from a surviving completed journey.
const broken = { meters: 0, steps: 0, finishedAt: new Date(finishAt).toISOString(), shiny: false }
const recovery = { dex: {
  Bulbasaur: { ...broken }, Ivysaur: { ...broken }, Venusaur: { ...broken },
  'Mega Venusaur': { ...broken }, 'Shiny Bulbasaur': { ...broken, shiny: true }, Squirtle: { ...broken },
  Pikachu: { ...broken, meters: 5000 }
}, records: { 0: { ...record(5500, 3600, 3000, 'Bulbasaur'), finishedAt: new Date(finishAt).toISOString() } },
personalBests: {
  distance: { ...record(21000, 10000, 3000, 'Mega Venusaur'), route: 0, finishedAt: new Date(finishAt - 2 * 86400000).toISOString() },
  elapsed: { ...record(16000, 11000, 4000, 'Venusaur'), route: 0 },
  hatch: { ...record(6000, 3500, 2000, 'Bulbasaur'), route: 0, shiny: true }
}, active: { ...active, route: 2, meters: 7000 } }
assert.equal(context.logic.repairDexRecords(recovery), true)
assert.equal(recovery.dex.Bulbasaur.meters, 5500, 'Recover the newest qualifying run, not the longest one')
assert.equal(recovery.dex.Venusaur.meters, 16000)
assert.equal(recovery.dex.Ivysaur.meters, 16000)
assert.equal(recovery.dex['Mega Venusaur'].meters, 21000)
assert.equal(recovery.dex['Shiny Bulbasaur'].meters, 6000)
assert.equal(recovery.dex['Shiny Bulbasaur'].hatchSeconds, 2000)
assert.equal(recovery.dex.Squirtle.meters, 0, 'An unsaved active run is not recovery evidence')
assert.equal(context.logic.hasDexDistance('Squirtle', recovery.dex.Squirtle), false)
assert.equal(context.logic.hasDexDistance('Pikachu', recovery.dex.Pikachu), true, 'Legacy Pikachu can hatch at 5 km')
assert.equal(recovery.dex.Pikachu.finishedAt, broken.finishedAt)
assert.equal(context.logic.repairDexRecords(recovery), false, 'Recovery is idempotent')
assert.equal(context.logic.collectionCount(recovery.dex), 5, 'Unrecoverable stats must not delete acquisitions')
const charizardRoute = routes.findIndex(route => route[route.length - 1] === 'Charizard')
const megaRecovery = { dex: { 'Mega Charizard X': { ...broken }, 'Mega Charizard Y': { ...broken } },
  records: { [charizardRoute]: { ...record(21000, 10000, 3000, 'Mega Charizard Y') } } }
context.logic.repairDexRecords(megaRecovery)
assert.equal(megaRecovery.dex['Mega Charizard X'].meters, 0)
assert.equal(megaRecovery.dex['Mega Charizard Y'].meters, 21000)
delete megaRecovery.records[charizardRoute].form
assert.equal(context.logic.repairDexRecords(megaRecovery), false, 'Ambiguous old Mega records cannot imply the default variant')
const vaporeonRoute = routes.findIndex(route => route.includes('Vaporeon'))
const branchRecovery = { dex: { Vaporeon: { ...broken }, Flareon: { ...broken } },
  records: { [vaporeonRoute]: record(10000, 5000, 3000, 'Vaporeon') } }
context.logic.repairDexRecords(branchRecovery)
assert.equal(branchRecovery.dex.Vaporeon.meters, 10000)
assert.equal(branchRecovery.dex.Flareon.meters, 0, 'A different evolution branch cannot prove acquisition details')
assert.equal(branchRecovery.dex.Eevee, undefined, 'Recovery does not add previously absent acquisitions')
for (const invalid of [{ steps: -1 }, { steps: 1.5 }, { meters: Infinity }, { finishedAt: 'invalid' }, { shiny: 'yes' }]) {
  const badRecovery = { dex: { Bulbasaur: { ...broken } }, records: { 0: { ...record(5000, 1000, 800, 'Bulbasaur'), ...invalid } } }
  assert.equal(context.logic.repairDexRecords(badRecovery), false)
}
const sameJourney = record(5500, 3600, 3000, 'Bulbasaur')
const timingRecovery = { dex: { Bulbasaur: { ...sameJourney, elapsedSeconds: undefined, hatchSeconds: undefined } }, records: { 0: sameJourney } }
assert.equal(context.logic.repairDexRecords(timingRecovery), true)
assert.equal(timingRecovery.dex.Bulbasaur.elapsedSeconds, 3600)
assert.equal(timingRecovery.dex.Bulbasaur.hatchSeconds, 3000)

// Exercise page navigation, sensor callbacks, storage and reopen without a watch.
let page
let distance = 1000
let steps = 1500
let stored
const sensors = []
const imageUpdates = []
const timers = new Map()
const timeouts = new Map()
const live = new Set()
let timerId = 0
let phoneSyncs = 0
// What the adventure screen shares with the phone, and the shared adventure the cloud answers with.
const shares = []
let shareReply = null
let pageBacks = 0
let widgetsCreated = 0
let widgetsDeleted = 0
let propertyWrites = 0
class Sensor {
  constructor() { sensors.push(this) }
  onChange(callback) { this.callback = callback }
  offChange(callback) { assert.equal(this.callback, callback); this.callback = null }
}
class Distance extends Sensor { getCurrent() { return distance } }
class Step extends Sensor { getCurrent() { return steps } }
// stored is the journal ('zepimon-v1'); the adventure in progress and the next-egg note have keys of their own.
const keys = new Map()
let journalWrites = 0
let activeWrites = 0
class LocalStorage {
  getItem(key, fallback) {
    const value = key === 'zepimon-v1' ? stored : keys.get(key)
    return value === undefined ? fallback : JSON.parse(value)
  }
  setItem(key, value) {
    if (key === 'zepimon-v1') { stored = JSON.stringify(value); journalWrites++ }
    else { keys.set(key, JSON.stringify(value)); if (key === 'zepimon-active') activeWrites++ }
  }
}
const savedActive = () => JSON.parse(keys.get('zepimon-active') ?? 'null')
const savedNext = () => JSON.parse(keys.get('zepimon-next') ?? '{}')
Object.assign(context, {
  ...context.logic, Distance, Step, LocalStorage, console,
  getApp: () => ({ _options: { syncToPhone() { phoneSyncs++ }, shareAdventure(adventure, done = () => {}) { shares.push(JSON.parse(JSON.stringify(adventure))); done(shareReply) } } }),
  back: () => { pageBacks++ },
  widget: { TEXT: 1, BUTTON: 2, IMG: 3, FILL_RECT: 4, CANVAS: 5 }, align: { CENTER_H: 1 }, prop: { TEXT: 1, MORE: 2 }, text_style: { WRAP: 1 }, event: { CLICK_UP: 1 },
  setInterval(callback) { const id = ++timerId; timers.set(id, callback); return id },
  clearInterval(id) { timers.delete(id) },
  setTimeout(callback) { const id = ++timerId; timeouts.set(id, callback); return id },
  clearTimeout(id) { timeouts.delete(id) },
  createWidget: (type, options) => {
    widgetsCreated++
    assert.ok(options.x >= 0 && options.x + options.w <= 320, 'Widget outside watch width')
    assert.ok(options.y >= 64 && options.y + options.h <= 380, 'Widget overlaps system header or screen edge')
    if (type === 3) imageUpdates.push(options)
    const item = { ...options, clear() {}, drawImage(value) { this.src = value.image; this.drawn = value; imageUpdates.push(value) }, setProperty(property, value) {
      propertyWrites++
      if (property === 2) {
        if (type === 2) {
          for (const key of ['x', 'y', 'w', 'h']) assert.ok(Number.isFinite(value[key]), 'Button updates must include geometry')
          assert.ok(value.x >= 0 && value.x + value.w <= 320)
          assert.ok(value.y >= 64 && value.y + value.h <= 380)
        }
        if (type === 3) imageUpdates.push(value)
        Object.assign(this, value)
      } else this.text = value
    }, addEventListener(_, callback) { this.click_func = callback } }
    live.add(item)
    return item
  },
  deleteWidget: (item) => { widgetsDeleted++; live.delete(item) }, setWakeUpRelaunch: () => {}, Page: (definition) => { page = definition }
})
// Loader frames run one at a time, like the watch's timer queue.
const stepTimeout = () => {
  const [id, callback] = timeouts.entries().next().value
  timeouts.delete(id)
  callback()
}
const flushTimeouts = () => { while (timeouts.size) stepTimeout() }
context.shinyRolls = 0
context.randomValue = 0.5
vm.runInContext('Math.random = () => { shinyRolls++; return randomValue }', context)
context.testNow = 100000
vm.runInContext('Date.now = () => testNow', context)
vm.runInContext(fs.readFileSync('page/walk-sprites.js', 'utf8').replace(/export /g, '') + '\nglobalThis.walkSprites = walkSprites', context)
for (const name of Object.keys(context.walkSprites)) {
  for (const shiny of [false, true]) {
    const png = fs.readFileSync('assets/bip-5-unity/' + context.logic.spritePath(name, shiny))
    assert.equal(png.readUInt32BE(16), 48, 'Two walking poses share the original image path')
    assert.equal(png.readUInt32BE(20), 24)
  }
}
vm.runInContext(fs.readFileSync('page/sprite.js', 'utf8').replace(/^import .*\r?\n/gm, '').replace(/export /g, '') + '\nglobalThis.createSprite = createSprite; globalThis.drawSprite = drawSprite', context)
const fallbackCanvas = { clear() {}, drawImage(value) { this.drawn = value } }
context.drawSprite(fallbackCanvas, 'Mega Zygarde', false, 176, 1)
assert.equal(fallbackCanvas.drawn.w, 352, 'A fallback that shares a sheet must still crop one pose')
assert.ok(fallbackCanvas.drawn.x === 0, 'Unsupported forms keep the first pose of their fallback artwork')
context.drawSprite(fallbackCanvas, 'Egg', false, 176, 1)
assert.equal(fallbackCanvas.drawn.w, 176)
vm.runInContext(fs.readFileSync('shared/companion.js', 'utf8').replace(/^import .*\r?\n/gm, '').replace(/export /g, ''), context)
vm.runInContext(fs.readFileSync('page/saved.js', 'utf8').replace(/^import .*\r?\n/gm, '').replace(/export /g, '') +
  '\nglobalThis.saved = { nextEgg, phoneAdventure, withPlan, readActive, readPhoneRuns, withReceivedRuns }', context)
vm.runInContext(fs.readFileSync('page/adventure.js', 'utf8').replace(/^import .*\r?\n/gm, ''), context)
page.build()
assert.equal(journalWrites, 1, 'A first start saves the new journal once')
assert.ok(savedNext().egg.family.length > 0, 'A first start suggests an egg for the title screen')
assert.equal(savedNext().egg.from, 'suggested')
const click = (label) => {
  const button = page.widgets.find(item => item.text === label && item.click_func)
  assert.ok(button, 'Missing button: ' + label)
  button.click_func()
  flushTimeouts()
}
// Screens open at once, without a loading animation in between.
page.widgets.find(item => item.text === 'New Egg' && item.click_func).click_func()
assert.equal(page.view, 'new', 'The next screen opens straight away')
assert.equal(timeouts.size, 0, 'Nothing waits on a loader')
assert.equal(live.size, page.widgets.length, 'Only the new screen is on the watch')
page.show('home')
const openFromTitle = (view) => {
  page.onDestroy()
  page.onInit({ view })
  page.build()
}
assert.ok(!page.widgets.some(item => item.text === 'Dex'), 'Dex belongs on the title screen')
click('Back')
assert.equal(pageBacks, 1, 'The adventure hub can return to title')
openFromTitle('home')
click('New Egg')
const catalogBeforePicking = JSON.stringify(routes)
const savedBeforePicking = stored
const rollsBeforePicking = context.shinyRolls
const reachableRoutes = new Set()
for (const generation of ['Generation 1', 'Generation 2', 'Generation 3', 'Generation 4', 'Extra Mega families']) {
  const imagesBeforeMenus = imageUpdates.length
  click(generation)
  assert.equal(page.view, 'letters')
  assert.equal(imageUpdates.length, imagesBeforeMenus, 'Letter shortcuts must not load sprites')
  for (const group of ['A-F', 'G-L', 'M-R', 'S-Z']) {
    const imagesBeforeList = imageUpdates.length
    click(group)
    assert.equal(page.view, 'choose')
    assert.equal(imageUpdates.length, imagesBeforeList, 'Name lists must not load sprites')
    if (!page.listItems.length) {
      assert.ok(page.widgets.some(item => item.text === 'No eggs in this group'))
    } else {
      const labels = []
      click('< Prev')
      assert.equal(page.listPage, 0, 'Previous on the first page must stay in bounds')
      for (let listPage = 0; listPage < Math.ceil(page.listItems.length / 4); listPage++) {
        assert.equal(page.listPage, listPage)
        assert.equal(page.listRows.length, 4, 'The list uses only four reusable rows')
        for (let slot = 0; slot < 4; slot++) {
          const row = page.listRows[slot]
          const label = row.text
          row.click_func()
          flushTimeouts()
          if (!label) {
            assert.equal(page.view, 'choose', 'Empty slots must not open a stale route')
            continue
          }
          labels.push(label)
          assert.equal(page.view, 'preview')
          const route = page.index
          assert.ok(!reachableRoutes.has(route), 'Each catalog route appears exactly once across the picker')
          reachableRoutes.add(route)
          const names = routes[route]
          assert.equal(label, names.length > 1 ? names[0] + ' > ' + names[names.length - 1] : names[0])
          assert.ok(names[0][0] >= group[0] && names[0][0] <= group[2])
          assert.ok(page.selectedGeneration === 5 ? context.logic.generation(route) > 4 : context.logic.generation(route) === page.selectedGeneration)
          assert.ok(page.widgets.some(item => item.text === names[0] + ' egg'), 'Tapped name must open its own preview')
          assert.equal(imageUpdates.at(-1).image, context.logic.spritePath(names[0]), 'Preview loads the selected Pokemon sprite')
          click('Back')
          assert.equal(page.view, 'choose')
          assert.equal(page.listPage, listPage, 'Preview Back restores the same list page')
        }
        const createsBeforePage = widgetsCreated
        const deletesBeforePage = widgetsDeleted
        const imagesBeforePage = imageUpdates.length
        const rowsBeforePage = [...page.listRows]
        const lastPage = listPage === Math.ceil(page.listItems.length / 4) - 1
        click('Next >')
        assert.equal(page.listPage, lastPage ? listPage : listPage + 1)
        click('< Prev')
        const previousPage = lastPage ? Math.max(0, listPage - 1) : listPage
        assert.equal(page.listPage, previousPage)
        click('Next >')
        assert.equal(page.listPage, lastPage ? listPage : listPage + 1)
        assert.equal(widgetsCreated, createsBeforePage, 'Paging must not create widgets')
        assert.equal(widgetsDeleted, deletesBeforePage, 'Paging must not delete widgets')
        assert.equal(imageUpdates.length, imagesBeforePage, 'Paging must not load sprites')
        assert.deepEqual([...page.listRows], rowsBeforePage, 'Page changes keep the same four row widgets')
      }
      assert.deepEqual(labels, [...labels].sort(), 'Names and evolution branches are alphabetically ordered')
    }
    click('Back')
    assert.equal(page.view, 'letters')
  }
  click('Back')
  assert.equal(page.view, 'new')
  assert.equal(timers.size, 0)
}
const selectableEggs = routes.map((_, i) => i).filter(i => !context.legendarySpecies.includes(routes[i][0]))
assert.equal(reachableRoutes.size, selectableEggs.length, 'All regular families and branching routes remain selectable')
for (const i of reachableRoutes) assert.ok(!context.legendarySpecies.includes(routes[i][0]), 'Legendaries come from expeditions, not new eggs')
assert.equal(JSON.stringify(routes), catalogBeforePicking, 'Alphabetical browsing must never reorder saved route IDs')
assert.equal(stored, savedBeforePicking, 'Browsing and cancelling must leave progress untouched')
assert.equal(context.shinyRolls, rollsBeforePicking, 'Browsing must not roll shiny chances')
click('Back to title')
assert.equal(pageBacks, 2, 'New Egg generation selection can return directly to title')
assert.equal(page.state.active, null, 'Leaving selection must not start an adventure')
openFromTitle('home')
assert.ok(!page.widgets.some(item => item.text === 'Continue Adventure'), 'The egg menu replaces Continue Adventure with Random Egg')
const savedBeforeRandom = stored
for (const value of [0, 1.5 / selectableEggs.length, 0.5, 1 - Number.EPSILON]) {
  context.randomValue = value
  const drawsBeforeRandom = context.shinyRolls
  click('Random Egg')
  const route = selectableEggs[Math.floor(value * selectableEggs.length)]
  assert.equal(page.view, 'random')
  assert.equal(page.index, route, 'Random Egg can choose any route, including the first and last')
  assert.ok(page.widgets.some(item => item.text === routes[route][0] + ' egg'), 'Preview must match the chosen route')
  assert.equal(page.megaIndex, 0, 'A fresh random choice resets the previous Mega selection')
  const mega = page.widgets.find(item => item.text && item.text.endsWith(' @21km') && item.click_func)
  if (mega) mega.click_func()
  const chosenMega = page.megaIndex
  click('Start')
  assert.equal(page.pendingRoute, route)
  assert.equal(page.state.active, null, 'Random selection still waits for Walking or Running')
  assert.equal(context.shinyRolls, drawsBeforeRandom + 1, 'Preview draws only a route, not a shiny chance')
  click('Back')
  assert.equal(page.view, 'random')
  assert.equal(page.index, route, 'Activity Back keeps the random egg')
  assert.equal(page.megaIndex, chosenMega, 'Activity Back keeps its chosen Mega form')
  click('Back')
  assert.equal(page.view, 'home', 'Random egg Back returns to the egg menu')
  assert.equal(context.shinyRolls, drawsBeforeRandom + 1, 'Going back must not reroll')
  assert.equal(stored, savedBeforeRandom, 'Previewing or cancelling random eggs must not change saved progress')
}
context.randomValue = 0.5
click('New Egg')
click('Generation 1')
click('A-F')
const chooseNamedEgg = label => {
  while (!page.listRows.some(row => row.text === label)) {
    const before = page.listPage
    click('Next >')
    assert.ok(page.listPage > before, 'Cannot find egg: ' + label)
  }
  click(label)
}
chooseNamedEgg('Charmander > Charizard')
const megaButton = page.widgets.find(item => item.text && item.text.endsWith(' @21km') && item.click_func)
assert.ok(megaButton)
const widgetsBeforeMega = widgetsCreated
const imagesBeforeMega = imageUpdates.length
megaButton.click_func()
assert.equal(widgetsCreated, widgetsBeforeMega, 'Changing Mega choice must reuse the preview')
assert.equal(imageUpdates.length, imagesBeforeMega, 'Changing Mega choice must not reload the sprite')
const selectedEgg = page.index
const selectedMega = page.megaIndex
const rollsBeforeMode = context.shinyRolls
click('Start')
assert.equal(page.view, 'activity')
assert.equal(page.pendingRoute, 1, 'The alphabetically selected Charmander keeps its original route ID')
assert.equal(page.state.active, null, 'Choosing an activity must not start the adventure yet')
assert.equal(context.shinyRolls, rollsBeforeMode, 'The shiny chance waits until an activity is chosen')
click('Back')
assert.equal(page.view, 'preview')
assert.equal(page.index, selectedEgg, 'Activity Back keeps the selected egg')
assert.equal(page.megaIndex, selectedMega, 'Activity Back keeps the selected Mega form')
click('Back')
assert.equal(page.view, 'choose')
while (page.listPage > 0) click('< Prev')
chooseNamedEgg('Bulbasaur > Venusaur')
click('Start')
click('Walking')
assert.equal(page.state.active.activity, 'walking')
assert.equal(context.shinyRolls, rollsBeforeMode + 1, 'Starting an adventure rolls exactly once')
assert.equal(savedActive().activity, 'walking', 'Starting saves the adventure in progress at once')
assert.equal(JSON.parse(stored).active, null, 'The journal never holds the adventure in progress')
assert.ok(page.stats[2].text.startsWith('Walk: '))
const beforeDuplicateStart = JSON.stringify(page.state.active)
page.start(1, 'running')
assert.equal(JSON.stringify(page.state.active), beforeDuplicateStart, 'A duplicate start must preserve the active adventure')
assert.equal(context.shinyRolls, rollsBeforeMode + 1)
click('Finish & save')
click('Keep walking')
assert.equal(timers.size, 1)
assert.ok(page.portrait.w > 96 && page.portrait.h > 96, 'Run sprite should be larger than selection sprites')
assert.equal(page.portrait.x, (320 - page.portrait.w) / 2)
assert.ok(page.stats[1].y >= page.portrait.y + page.portrait.h, 'Distance must stay below the sprite')
const baseY = page.portrait.y
const startedAt = page.state.active.startedAt
context.testNow += 61000
Array.from(timers.values())[0]()
assert.equal(page.portrait.y, baseY, 'Eggs must not jump')
assert.equal(page.portrait.x, (320 - page.portrait.w) / 2, 'Animation must keep the larger sprite centered')
assert.equal(page.clockStats[0].text, 'Time 00:01:01')
assert.equal(page.clockStats[1].text, 'Est. pace --:-- /km')
for (let frame = 0; frame < 6; frame++) {
  Array.from(timers.values())[0]()
  assert.ok(page.portrait.y >= 64)
  assert.ok(page.portrait.y + page.portrait.h < page.stats[1].y, 'Sprite must not cover distance')
  assert.equal(page.portrait.x, (320 - page.portrait.w) / 2)
}
distance += 5000
steps += 7000
page.distance.callback()
assert.equal(page.state.active.meters, 5000)
assert.equal(savedActive().meters, 5000, 'Hatching saves straight away')
assert.equal(page.stats[0].text, 'Bulbasaur')
assert.ok(page.portrait.w > 96, 'Hatching must retain the large run sprite')
const stillPortrait = page.portrait.src
Array.from(timers.values())[0]()
assert.equal(page.portrait.src, stillPortrait, 'Walking frames share one image file')
const firstPose = page.portrait.drawn.x
context.testNow += 400
Array.from(timers.values())[0]()
assert.notEqual(page.portrait.drawn.x, firstPose, 'Walking alternates poses by clipping the shared sheet')
assert.equal(page.portrait.drawn.w, 352)
assert.equal(page.portrait.drawn.h, 176)
assert.equal(page.portrait.y, baseY)
page.state.active.shiny = true
page.state.active.meters = 10000
page.refreshStats()
assert.equal(page.portrait.src, context.logic.spritePath('Ivysaur', true), 'Evolution and shiny artwork still update')
page.state.active.meters = 5000
page.state.active.shiny = false
page.refreshStats()
assert.ok(!fs.existsSync('assets/bip-5-unity/walk') || fs.readdirSync('assets/bip-5-unity/walk').length === 0, 'Recovery build must exclude extra animation images')
page.onDestroy()
distance += 500
page.build()
assert.equal(page.state.active.meters, 5500)
assert.equal(page.state.active.startedAt, startedAt)
assert.equal(page.clockStats[0].text, 'Time 00:01:01')
assert.equal(page.clockStats[1].text, 'Est. pace --:-- /km', 'Reopen recovers distance without reusing old pace')
click('Finish & save')
click('Save & finish')
assert.equal(page.state.records[0].meters, 5500)
assert.ok(phoneSyncs >= 2, 'Starting and finishing should trigger phone sync')
assert.equal(page.state.dex.Bulbasaur.meters, 5500)
openFromTitle('home')
context.randomValue = 0
click('Random Egg')
context.randomValue = 0.5
const rollsBeforeRandomStart = context.shinyRolls
click('Start')
click('Back')
assert.equal(page.view, 'random', 'Activity Back also returns to the random egg preview')
click('Start')
click('Running')
assert.equal(context.shinyRolls, rollsBeforeRandomStart + 1, 'Starting a random egg rolls shiny exactly once')
assert.equal(page.state.active.route, 0, 'The run uses the previewed random route')
assert.equal(page.state.active.shiny, false, 'The shiny roll is independent of the random route draw')
assert.equal(page.state.active.activity, 'running')
assert.ok(page.stats[2].text.startsWith('Run: '))
assert.equal(page.state.active.meters, 0)
assert.equal(page.state.records[0].meters, 5500)
openFromTitle('home')
assert.equal(page.state.active.activity, 'running', 'Reopening retains the selected activity')
click('Finish & save')
click('Keep running')
assert.equal(page.view, 'session')
// Sensor and clock refreshes only write what changed: the same reading redraws nothing, a new step only its count.
page.sync()
const writesBefore = propertyWrites
page.sync()
assert.equal(propertyWrites, writesBefore, 'An unchanged reading writes no widget property')
steps += 1
page.sync()
assert.equal(propertyWrites, writesBefore + 1, 'One more step rewrites only the step count')
assert.ok(page.stats[2].text.endsWith(' steps'))
assert.equal(page.stats[0].text, 'Bulbasaur egg')
distance += 6000
page.sync()
assert.equal(page.stats[0].text, 'Bulbasaur', 'A hatch still shows at once')
click('Finish & save')
click('Save & finish')
assert.equal(page.state.records[0].meters, 6000)
assert.equal(page.state.records[0].activity, 'running')
assert.equal(page.state.dex.Bulbasaur.meters, 6000)
assert.equal(page.state.dex.Bulbasaur.activity, 'running', 'Acquired Pokemon retains the activity with its journey')
page.onDestroy()
// A fresh page load must preserve saved data.
context.LocalStorage = LocalStorage
page.build()
assert.equal(page.ready, true)
assert.equal(page.state.dex.Bulbasaur.meters, 6000)
page.onDestroy()
// Roll once per start; opening the same adventure again must never reroll.
page.build()
vm.runInContext('Math.random = () => 0', context)
context.testNow += 1000 // a new adventure never starts in the same millisecond as the last one
page.start(0)
assert.equal(page.state.active.shiny, true)
assert.equal(page.stats[0].text, 'Shiny Bulbasaur egg')
page.onDestroy()
vm.runInContext('Math.random = () => 0.5', context)
page.build()
assert.equal(page.state.active.shiny, true)
distance += 5000
page.sync()
assert.equal(page.stats[0].text, 'Shiny Bulbasaur')
click('Finish & save')
click('Save & finish')
assert.ok(page.state.dex['Shiny Bulbasaur'])
assert.ok(page.state.dex.Bulbasaur)
assert.equal(page.state.dex['Shiny Bulbasaur'].meters, 5000)
assert.equal(page.state.dex.Bulbasaur.meters, 6000)
openFromTitle('home')
context.testNow += 1000 // a new adventure never starts in the same millisecond as the last one
page.start(0)
assert.equal(page.state.active.shiny, false)
page.state.active.startedAt = context.testNow - 3600000
for (let second = 0; second < 20; second++) {
  context.testNow += 1000
  distance += 2
  steps += 3
  page.sync()
}
assert.equal(page.clockStats[1].text, 'Est. pace 8:20 /km', 'The actual watch widget must use recent speed, not the hour-long session average')
page.state.active.activity = 'running'
for (let second = 0; second < 8; second++) {
  context.testNow += 1000
  distance += 4
  // Some firmware updates getCurrent before delivering an onChange callback.
  Array.from(timers.values())[0]()
}
assert.equal(page.clockStats[1].text, 'Est. pace 4:10 /km', 'Polling picks up running speed without a distance callback')
page.state.active.activity = 'walking'
context.testNow += 60000
Array.from(timers.values())[0]()
page.sync() // A step callback can wake before the distance counter catches up.
assert.equal(page.clockStats[1].text, 'Est. pace --:-- /km')
context.testNow += 100
distance += 500
steps += 700
page.sync()
for (let second = 0; second < 5; second++) {
  context.testNow += 1000
  Array.from(timers.values())[0]()
}
assert.equal(page.clockStats[1].text, 'Est. pace --:-- /km', 'Timer-before-sensor wake order must not turn recovered distance into current speed')
for (let second = 0; second < 15; second++) {
  context.testNow += 1000
  distance += 2
  page.sync()
}
assert.equal(page.clockStats[1].text, 'Est. pace 8:20 /km', 'Fresh walking establishes pace again after suspension')
for (let second = 0; second < 15; second++) {
  context.testNow += 1000
  Array.from(timers.values())[0]()
}
assert.equal(page.clockStats[1].text, 'Est. pace --:-- /km', 'The timer expires pace without a sensor callback')
page.saveActive(true)
assert.ok(!stored.includes('checkedAt') && !keys.get('zepimon-active').includes('checkedAt'), 'Transient pace samples must not be written to saves')
// Exercise the live widget when steps move but the distance total stays unchanged.
page.pace = {}
page.state.active.meters = 150
page.state.active.steps = 200
page.state.active.activity = 'running'
page.sync()
for (let second = 1; second <= 20; second++) {
  context.testNow += 1000
  steps += 2
  Array.from(timers.values())[0]()
}
assert.equal(page.clockStats[1].text, 'Est. pace 11:07 /km', 'The watch passes live steps to the pace fallback')
assert.equal(page.state.active.meters, 150, 'Estimated pace must not add invented adventure distance')
for (let second = 1; second <= 8; second++) {
  context.testNow += 1000
  steps += 3
  page.step.callback()
}
assert.equal(page.clockStats[1].text, 'Est. pace 7:24 /km', 'The step sensor callback updates the running pace')
page.saveActive(true)
for (const save of [stored, keys.get('zepimon-active')]) {
  assert.ok(!save.includes('stepTracker') && !save.includes('strideMeters'), 'Calibration stays out of saved progress')
}
distance = 1
page.sync()
assert.equal(page.pace.samples.length, 1, 'A daily counter reset clears recent speed history')
assert.equal(page.clockStats[1].text, 'Est. pace --:-- /km')
page.onDestroy()
assert.equal(timers.size, 0)
// Explicit History must work during an active adventure without resetting it.
const activeForHistory = savedActive()
stored = JSON.stringify({ ...historyState, active: null })
page.onInit(JSON.stringify({ view: 'history' }))
page.build()
assert.equal(page.view, 'history')
assert.equal(page.state.active.startedAt, activeForHistory.startedAt)
assert.equal(timers.size, 0)
const historyButtons = ['Highest distance', 'Longest elapsed time', 'Fastest 5 km hatch']
assert.equal(page.widgets.filter(item => item.click_func && item.text !== 'Back').length, 3)
for (const [i, label] of historyButtons.entries()) {
  click(label)
  assert.equal(page.view, 'history-detail')
  const expected = ['30.00 km', '05:33:20', '00:20:00'][i]
  assert.ok(page.widgets.some(item => item.text === expected), 'Missing History value: ' + expected)
  if (i === 2) assert.ok(page.widgets.some(item => item.text === 'Shiny Bulbasaur'), 'Hatch record should show the hatched species')
  click('Back')
  assert.equal(page.view, 'history')
  assert.equal(timers.size, 0)
}
const beforeHistoryBack = pageBacks
click('Back')
assert.equal(pageBacks, beforeHistoryBack + 1)
openFromTitle('dex')
assert.equal(page.view, 'session', 'Removed Dex routes safely resume the adventure')
assert.equal(JSON.stringify(page.state.active), JSON.stringify(activeForHistory))
openFromTitle('home')
assert.equal(page.view, 'session', 'The title adventure button resumes an active run')
assert.equal(JSON.stringify(page.state.active), JSON.stringify(activeForHistory))
page.onDestroy()
stored = JSON.stringify({ dex: {}, records: {}, active: null })
keys.delete('zepimon-active')
page.onInit({ view: 'history' })
page.build()
for (const label of historyButtons) {
  click(label)
  assert.ok(page.widgets.some(item => item.text === 'No record yet'))
  click('Back')
}
page.onDestroy()
stored = JSON.stringify({ dex: { Bulbasaur: { ...broken } }, records: { 0: record(6000, 3600, 3000, 'Bulbasaur') }, active: null })
page.onInit({ view: 'home' })
page.build()
assert.equal(JSON.parse(stored).dex.Bulbasaur.meters, 6000, 'Dex repair persists for phone sync without a watch Dex screen')
page.onDestroy()
// The walk in progress is saved apart from the journal, at most every 20 seconds while it changes.
stored = JSON.stringify({ dex: {}, records: {}, active: null })
keys.clear()
page.onInit({ view: 'home' })
page.build()
context.testNow += 1000
page.start(0, 'walking')
const journalAtStart = journalWrites
const activeAtStart = activeWrites
for (let second = 0; second < 19; second++) { context.testNow += 1000; distance += 2; steps += 3; page.sync() }
assert.equal(activeWrites, activeAtStart, 'Small changes wait for the next save')
assert.equal(journalWrites, journalAtStart, 'Walking never rewrites the journal')
context.testNow += 1000
distance += 2
page.sync()
assert.equal(activeWrites, activeAtStart + 1, 'The walk is saved again after 20 seconds')
distance += 2
page.sync()
page.onDestroy()
assert.equal(savedActive().meters, page.state.active.meters, 'Closing saves the latest numbers')
const journalBeforeReopen = journalWrites
page.build()
assert.equal(journalWrites, journalBeforeReopen, 'Opening without changes does not rewrite the journal')
page.onDestroy()
// After an update, an adventure kept inside the journal moves to its own key once.
const legacy = { ...savedActive(), startedAt: context.testNow - 5000 }
stored = JSON.stringify({ dex: {}, records: {}, active: legacy })
keys.delete('zepimon-active')
page.build()
assert.equal(page.state.active.startedAt, legacy.startedAt)
assert.equal(JSON.parse(stored).active, null, 'The journal no longer holds it')
assert.equal(savedActive().startedAt, legacy.startedAt, 'It has its own key now')
page.onDestroy()
// If the watch stopped after saving the record but before clearing the adventure, it is not saved twice.
stored = JSON.stringify({ dex: {}, records: { [legacy.route]: { meters: 7000, steps: 9000, shiny: false,
  finishedAt: new Date(context.testNow).toISOString(), startedAt: legacy.startedAt } }, active: null })
page.build()
assert.equal(page.state.active, null, 'An adventure whose record exists is already saved')
assert.equal(savedActive(), null)
page.onDestroy()
// Walk or Run on the title screen starts at once with the offered egg; the phone's egg is then marked as used.
const charmander = ['Charmander', 'Charmeleon', 'Charizard']
keys.set('zepimon-next', JSON.stringify({ egg: { family: ['Pikachu', 'Raichu'], mega: null, from: 'suggested' },
  plan: { egg: { family: charmander, mega: 'Mega Charizard Y' }, eggAt: 50, phone: null, updatedAt: 60 } }))
context.testNow += 1000
page.onInit({ start: { activity: 'running', family: charmander, mega: 'Mega Charizard Y', planAt: 50 } })
page.build()
assert.equal(page.view, 'session', 'Quick start goes straight to the adventure')
assert.equal(JSON.stringify(routes[page.state.active.route]), JSON.stringify(charmander))
assert.equal(page.state.active.activity, 'running')
assert.equal(page.state.active.mega, 'Mega Charizard Y')
assert.equal(savedNext().usedPlanAt, 50, 'The phone egg is marked as used')
assert.equal(context.saved.nextEgg(savedNext()).from, 'suggested', 'The title screen moves on to its own egg')
const backsBeforeSave = pageBacks
distance += 100
page.sync()
click('Finish & save')
click('Save & finish')
assert.equal(pageBacks, backsBeforeSave + 1, 'Saving returns to the title screen')
assert.equal(savedActive(), null)
assert.equal(savedNext().egg.from, 'suggested', 'Saving suggests a new egg')
page.onDestroy()
// An egg the watch does not know still starts, with a fresh one.
context.testNow += 1000
page.onInit({ start: { activity: 'walking', family: ['Missingno'] } })
page.build()
assert.ok(page.state.active, 'An unknown egg falls back to a fresh egg')
assert.ok(!context.legendarySpecies.includes(routes[page.state.active.route][0]), 'Fallback eggs are never Expedition Legendaries')
click('Finish & save')
click('Save & finish')
page.onDestroy()
// While the phone records, choosing an activity on the watch warns about counting the same steps twice.
keys.set('zepimon-next', JSON.stringify({ plan: { egg: null, eggAt: 0, updatedAt: 70,
  phone: { family: ['Pikachu', 'Raichu'], activity: 'walking', startedAt: context.testNow - 60000 } } }))
page.onInit({ view: 'home' })
page.build()
click('Random Egg')
click('Start')
assert.ok(page.widgets.some(item => item.text === 'Your phone is recording an adventure'))
page.onDestroy()
// The next-egg note: the phone's egg until the watch uses it, newer plans only, and stale phone adventures expire.
{
  const { nextEgg, phoneAdventure, withPlan } = context.saved
  assert.equal(nextEgg({}), null)
  const plan = { egg: { family: ['Eevee'], mega: null }, eggAt: 10, phone: null, updatedAt: 20 }
  const fromPhone = withPlan({ egg: { family: ['Pikachu', 'Raichu'], from: 'suggested' } }, plan)
  assert.equal(nextEgg(fromPhone).from, 'phone')
  assert.equal(nextEgg({ ...fromPhone, usedPlanAt: 10 }).from, 'suggested')
  assert.equal(withPlan(fromPhone, { ...plan, updatedAt: 19 }), fromPhone, 'An older plan is ignored')
  assert.equal(withPlan(fromPhone, null), fromPhone, 'No plan keeps the last one')
  assert.throws(() => withPlan({}, { updatedAt: 1, egg: { family: [] }, eggAt: 1 }), 'A broken plan is rejected')
  const recording = { plan: { phone: { family: ['Eevee'], activity: 'walking', startedAt: 1000 } } }
  assert.ok(phoneAdventure(recording, 2000))
  assert.equal(phoneAdventure(recording, 1000 + 13 * 3600000), null, 'A forgotten phone adventure stops blocking')
}
// Adventures recorded on Zepimon mobile join the journal when this screen opens, each once, without moving the watch's
// own Expedition trail. The newer record wins, and an older phone adventure can still be a personal best.
{
  const { readPhoneRuns, withReceivedRuns } = context.saved
  const routeOf = family => routes.findIndex(item => item.join('>') === family.join('>'))
  const pikachu = ['Pikachu', 'Raichu']
  const phoneRecord = (meters, finishedAt, extra = {}) => ({ meters, steps: 0, shiny: false, activity: 'running', finishedAt,
    startedAt: Date.parse(finishedAt) - 3600000, elapsedSeconds: 3600, form: 'Charmeleon', ...extra })
  const watchRecord = { meters: 5100, steps: 6500, shiny: false, finishedAt: '2026-10-25T03:00:00.000Z', elapsedSeconds: 4000, form: 'Charmander' }
  stored = JSON.stringify({ dex: { Charmander: watchRecord }, records: { [routeOf(charmander)]: watchRecord }, active: null,
    expedition: { seed: 1, startedAt: 1000, meters: 4000 } })
  keys.clear()
  const runs = [
    { id: 'phone-old', seq: 3, family: charmander, record: phoneRecord(10400, '2026-10-20T03:00:00.000Z', { hatchSeconds: 1500 }) },
    { id: 'phone-new', seq: 4, family: pikachu, record: phoneRecord(5300, '2026-10-26T03:00:00.000Z', { shiny: true, form: 'Pikachu' }) },
    { id: 'phone-unknown', seq: 5, family: ['Missingno'], record: phoneRecord(5000, '2026-10-26T04:00:00.000Z') }]
  const received = withReceivedRuns(readPhoneRuns(new LocalStorage()), runs)
  assert.equal(received.after, 5)
  assert.equal(withReceivedRuns(received, runs.slice(0, 1)).pending.length, 3, 'The same adventure arriving twice waits once')
  keys.set('zepimon-phone-runs', JSON.stringify(received))
  const writesBefore = journalWrites
  page.onInit({ view: 'home' })
  page.build()
  let journal = JSON.parse(stored)
  assert.equal(journalWrites, writesBefore + 1, 'Phone adventures are saved into the journal once')
  assert.equal(journal.records[routeOf(charmander)].meters, 5100, "The watch's newer record stays the family's latest")
  assert.equal(journal.dex.Charmander.meters, 5100, 'A newer Dex record is kept')
  assert.equal(journal.dex.Charmeleon.meters, 10400, 'Pokemon evolved on the phone join the Dex')
  assert.equal(journal.records[routeOf(pikachu)].meters, 5300, 'A newer phone adventure becomes the latest record')
  assert.equal(journal.dex['Shiny Pikachu'].steps, 0)
  assert.equal(journal.dex['Shiny Raichu'], undefined)
  assert.equal(journal.personalBests.distance.meters, 10400, 'An older phone adventure can still be the longest')
  assert.equal(journal.personalBests.hatch.hatchSeconds, 1500)
  assert.equal(journal.expedition.meters, 4000, 'Phone distance stays on the phone trail')
  assert.deepEqual(JSON.parse(keys.get('zepimon-phone-runs')), { after: 5, pending: [] })
  page.onDestroy()
  page.build()
  journal = JSON.parse(stored)
  assert.equal(journalWrites, writesBefore + 1, 'Reopening adds nothing again')
  assert.equal(journal.personalBests.distance.meters, 10400, 'The personal best stays')
  page.onDestroy()
}
// The adventure is shared with the phone as it starts and about once a minute while it records. If the phone takes
// it over, the watch stops without saving.
{
  stored = JSON.stringify({ dex: {}, records: {}, active: null, expedition: { seed: 1, startedAt: 1000, meters: 0 } })
  keys.clear()
  shares.length = 0
  shareReply = null
  context.testNow += 1000
  page.onInit({ start: { activity: 'walking', family: charmander } })
  page.build()
  const startedAt = page.state.active.startedAt
  assert.equal(shares.length, 1, 'Starting shares the adventure')
  assert.deepEqual([shares[0].id, shares[0].device, shares[0].deviceAt, shares[0].meters, shares[0].ended], ['adv-' + startedAt, 'watch', startedAt, 0, false])
  assert.deepEqual(shares[0].family, charmander)
  context.testNow += 20000; distance += 300; page.sync()
  assert.equal(shares.length, 1, 'Progress waits half a minute')
  context.testNow += 11000; distance += 10; page.sync()
  assert.equal(shares.length, 2)
  assert.equal(shares[1].meters, 310)
  const writes = journalWrites
  shareReply = { ...shares[1], device: 'phone', deviceAt: startedAt + 70000, at: context.testNow }
  context.testNow += 61000; distance += 10; page.sync()
  assert.equal(page.view, 'handed-over', 'The phone took over')
  assert.ok(page.widgets.some(item => item.text === 'Continued on your phone'))
  assert.equal(page.state.active, null)
  assert.equal(savedActive(), null, 'Nothing is left recording here')
  assert.equal(journalWrites, writes, 'The watch does not save what the phone continues')
  page.onDestroy()
}
// Continue here: the watch takes over the phone's adventure with its egg, start and distance so far, and finishing
// shares it as ended and saves it here.
{
  shares.length = 0
  shareReply = null
  const onPhone = { id: 'adv-5000', family: charmander, mega: 'Mega Charizard X', shiny: true, activity: 'running', startedAt: 5000,
    device: 'phone', deviceAt: 5000, meters: 4800, hatchSeconds: null, at: context.testNow - 30000, ended: false }
  keys.set('zepimon-next', JSON.stringify({ adventure: onPhone }))
  page.onInit({ takeover: true })
  page.build()
  const session = page.state.active
  assert.equal(page.view, 'session')
  assert.deepEqual([routes[session.route][0], session.startedAt, session.meters, session.shiny, session.mega, session.shareId, session.activity],
    ['Charmander', 5000, 4800, true, 'Mega Charizard X', 'adv-5000', 'running'])
  assert.ok(session.deviceAt > 5000)
  assert.deepEqual([shares[0].device, shares[0].meters, shares[0].deviceAt], ['watch', 4800, session.deviceAt], 'The cloud learns the watch took it')
  distance += 300
  page.sync()
  assert.equal(page.state.active.meters, 5100, 'Only new distance counts here')
  assert.ok(page.state.active.hatchSeconds > 0, 'The egg hatches on the watch')
  click('Finish & save')
  click('Save & finish')
  assert.equal(shares.at(-1).ended, true)
  assert.equal(shares.at(-1).meters, 5100)
  const saved = JSON.parse(stored).records[routes.findIndex(item => item.join('>') === charmander.join('>'))]
  assert.deepEqual([saved.meters, saved.startedAt, saved.shiny], [5100, 5000, true])
  page.onDestroy()
}
// An adventure started before sharing existed gets the id it would have had, and is shared from then on.
{
  shares.length = 0
  shareReply = null
  const older = { route: 0, activity: 'walking', startedAt: context.testNow - 600000, shiny: false, mega: null, meters: 900, steps: 1200,
    day: 'old', lastMeters: distance, lastSteps: steps }
  keys.set('zepimon-active', JSON.stringify(older))
  page.onInit({ view: 'home' })
  page.build()
  assert.equal(page.state.active.shareId, 'adv-' + older.startedAt)
  assert.equal(page.state.active.deviceAt, older.startedAt)
  assert.equal(savedActive().shareId, 'adv-' + older.startedAt, 'The id is saved with it')
  context.testNow += 61000
  distance += 5
  page.sync()
  assert.equal(shares.length, 1, 'It is shared on the next update')
  assert.equal(shares[0].id, 'adv-' + older.startedAt)
  page.onDestroy()
  keys.delete('zepimon-active')
}
// Finishing an adventure the phone has taken over meanwhile saves nothing here.
{
  shares.length = 0
  context.testNow += 1000
  page.onInit({ start: { activity: 'walking', family: charmander } })
  page.build()
  const active = page.state.active
  keys.set('zepimon-next', JSON.stringify({ ...savedNext(), adventure: { ...shares[0], device: 'phone', deviceAt: active.deviceAt + 1000 } }))
  const writes = journalWrites
  click('Finish & save')
  click('Save & finish')
  assert.equal(page.view, 'handed-over')
  assert.equal(journalWrites, writes)
  page.onDestroy()
}
// Canvas scaling keeps the visible pose large without drawing outside its bounds.
for (const update of imageUpdates) {
  assert.ok(update.w === update.h || update.w === update.h * 2)
  assert.ok(update.x === 0 || update.x === -update.h)
  assert.equal(update.y, 0)
  assert.ok(update.w > 48 && update.h > 48)
}
// Startup failures must display an actionable error instead of a blank page.
context.LocalStorage = class { getItem() { throw new Error('Storage unavailable') } }
const drawn = []
context.createWidget = (type, options) => {
  drawn.push(options)
  return { ...options, setProperty() {} }
}
page.build()
assert.equal(page.ready, false)
assert.ok(drawn.some(item => item.text === 'Zepimon startup error'))
assert.ok(drawn.some(item => item.text.includes('Storage unavailable')))
page.onDestroy()
console.log('Adventure logic and page flow checks passed')

// Title screen: the next egg with one-tap Walk and Run, daily distance and cleanup.
const bootDrawn = []
let destination
let navigationParams
let titlePage
let planCallback
const titleKeys = new Map()
const bootTimers = new Map()
const bootTimeouts = []
const flushBootTimeouts = () => { while (bootTimeouts.length) bootTimeouts.shift()() }
class TitleStorage {
  getItem(key) { return titleKeys.has(key) ? JSON.parse(titleKeys.get(key)) : undefined }
  setItem(key, value) { titleKeys.set(key, JSON.stringify(value)) }
}
const bootContext = vm.createContext({
  Page(definition) { titlePage = definition; definition.build() }, Distance, LocalStorage: TitleStorage,
  widget: { TEXT: 1, BUTTON: 2, FILL_RECT: 3, IMG: 4, CANVAS: 5 }, align: { CENTER_H: 1 },
  text_style: { NONE: 0 }, prop: { TEXT: 1, MORE: 2 },
  setInterval(callback) { bootTimers.set(1, callback); return 1 }, clearInterval(id) { bootTimers.delete(id) },
  setTimeout(callback) { bootTimeouts.push(callback); return bootTimeouts.length },
  clearTimeout() { bootTimeouts.length = 0 },
  createWidget(type, options) {
    assert.ok(options.x >= 0 && options.x + options.w <= 320)
    assert.ok(options.y >= 64 && options.y + options.h <= 380, 'Title content overlaps system header or screen edge')
    bootDrawn.push(options)
    return { options, clear() {}, drawImage(value) { options.image = value.image; options.drawn = value },
      setProperty(property, value) { if (property === 1) options.text = value; else Object.assign(options, value) } }
  },
  deleteWidget(item) { const index = bootDrawn.indexOf(item.options); if (index >= 0) bootDrawn.splice(index, 1) },
  getApp: () => ({ _options: { fetchPlan(done) { planCallback = done } } }),
  push(options) { destination = options.url; navigationParams = options.params }, console
})
const imports = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(line => line.startsWith('import ')).join('\n')
for (const file of ['page/index.js', 'page/saved.js', 'app.js']) {
  assert.ok(!/catalog|\/pokemon'|\/sprite'|\/types'|walk-sprites/.test(imports(file)), file + ' must not load the Pokemon catalog')
}
bootContext.validateExpedition = context.validateExpedition
vm.runInContext(fs.readFileSync('shared/companion.js', 'utf8').replace(/^import .*\r?\n/gm, '').replace(/export /g, ''), bootContext)
vm.runInContext(fs.readFileSync('page/saved.js', 'utf8').replace(/^import .*\r?\n/gm, '').replace(/export /g, ''), bootContext)
vm.runInContext(fs.readFileSync('page/loader.js', 'utf8').replace(/^import .*\r?\n/gm, '').replace(/export /g, ''), bootContext)
const entry = fs.readFileSync('page/index.js', 'utf8')
assert.ok(!/hmUI|hmApp/.test(entry))
vm.runInContext(entry.replace(/^import .*\r?\n/gm, ''), bootContext)
const shown = (value) => bootDrawn.some(item => item.text === value)
const tap = (label) => {
  const button = bootDrawn.find(item => item.text === label && item.click_func)
  assert.ok(button, 'Missing title button: ' + label)
  button.click_func()
}
let titleOpen = true
const close = () => { if (titleOpen) titlePage.onDestroy(); titleOpen = false }
const reopen = () => { close(); bootDrawn.length = 0; destination = undefined; navigationParams = undefined; titlePage.build(); titleOpen = true }
// A first visit: a surprise egg, and four buttons.
assert.ok(bootDrawn.some(item => item.image === 'pokemon/egg.png' && item.drawn.w === 72), 'The egg is drawn without the catalog')
assert.ok(shown('Surprise egg'))
assert.ok(shown('Ready to start'))
planCallback(undefined, 'no answer from Zepp')
assert.ok(shown('Ready · no answer from Zepp'), 'The title says when the phone could not be checked')
planCallback(undefined, undefined)
assert.ok(shown('Ready to start'))
assert.ok(bootDrawn.some(item => item.text === (distance / 1000).toFixed(2)))
assert.equal(bootDrawn.filter(item => item.click_func).length, 4)
tap('Walk')
assert.equal(destination, undefined, 'The still Pokeball shows before the adventure page loads')
assert.ok(shown('Loading...'))
tap('Run')
flushBootTimeouts()
assert.equal(destination, 'page/adventure')
assert.equal(navigationParams.start.activity, 'walking', 'Taps while loading are ignored')
assert.equal(navigationParams.start.family, null, 'A surprise egg lets the adventure page choose')
reopen()
tap('Change egg')
flushBootTimeouts()
assert.equal(navigationParams.view, 'new')
reopen()
tap('History')
flushBootTimeouts()
assert.equal(navigationParams.view, 'history')
// The watch's suggestion, then the phone's chosen egg, which also arrives while the screen is open.
titleKeys.set('zepimon-next', JSON.stringify({ egg: { family: ['Pikachu', 'Raichu'], mega: null, from: 'suggested' } }))
reopen()
assert.ok(shown('Pikachu'))
assert.ok(shown('A new Pokemon for your Dex'))
const phoneEgg = { egg: { family: ['Charmander', 'Charmeleon', 'Charizard'], mega: 'Mega Charizard X' }, eggAt: 50, phone: null, updatedAt: 60 }
planCallback({ egg: { family: ['Pikachu', 'Raichu'], mega: null, from: 'suggested' }, plan: phoneEgg })
assert.ok(shown('Charmander'), 'A plan arriving from the phone updates the title screen')
assert.ok(shown('Chosen on your phone'))
titleKeys.set('zepimon-next', JSON.stringify({ egg: { family: ['Pikachu', 'Raichu'], mega: null, from: 'suggested' }, plan: phoneEgg }))
reopen()
tap('Run')
flushBootTimeouts()
assert.deepEqual(JSON.parse(JSON.stringify(navigationParams.start)),
  { activity: 'running', family: ['Charmander', 'Charmeleon', 'Charizard'], mega: 'Mega Charizard X', planAt: 50 })
close()
planCallback({ plan: { ...phoneEgg, egg: { family: ['Eevee'], mega: null } } })
assert.ok(!shown('Eevee'), 'A plan arriving after the screen closed changes nothing')
// While the phone records, the first tap warns and the second starts anyway.
titleKeys.set('zepimon-next', JSON.stringify({ plan: { egg: null, eggAt: 0, updatedAt: 70,
  phone: { family: ['Pikachu', 'Raichu'], activity: 'walking', startedAt: Date.now() - 60000 } } }))
reopen()
assert.ok(shown('Your phone is recording an adventure'))
tap('Walk')
flushBootTimeouts()
assert.equal(destination, undefined, 'The first tap only warns')
assert.ok(shown('Tap again to record here too'))
tap('Walk')
flushBootTimeouts()
assert.equal(destination, 'page/adventure')
// An adventure the phone shares: the title shows it and offers Continue here instead of starting a second one.
const sharedOnPhone = { id: 'adv-7000', family: ['Charmander', 'Charmeleon', 'Charizard'], mega: 'Mega Charizard X', shiny: true,
  activity: 'running', startedAt: Date.now() - 3600000, device: 'phone', deviceAt: Date.now() - 3600000, meters: 6200, hatchSeconds: 2400,
  at: Date.now() - 120000, ended: false }
titleKeys.set('zepimon-next', JSON.stringify({ adventure: sharedOnPhone }))
reopen()
assert.ok(shown('ON YOUR PHONE'))
assert.ok(shown('Shiny Charmander'))
assert.ok(shown('Run · 6.20 km'))
assert.ok(shown('Recording on your phone · 2 min ago'))
assert.ok(!shown('Walk') && !shown('Change egg'), 'No second adventure while the phone records one')
tap('Continue here  >')
flushBootTimeouts()
assert.equal(navigationParams.takeover, true)
reopen()
assert.equal(bootTimers.size, 1, 'The open title keeps checking the phone')
planCallback({ adventure: { ...sharedOnPhone, ended: true } })
assert.ok(shown('Walk') && !shown('Continue here  >'), 'Once the phone finishes, Walk and Run return')
assert.ok(shown('NEXT EGG'))
planCallback = null
bootTimers.get(1)()
assert.equal(typeof planCallback, 'function', 'Each minute the open title asks the phone again')
titleKeys.set('zepimon-next', JSON.stringify({}))
// An adventure in progress: Continue and History only, from its own key or, before the first update, the journal.
titleKeys.set('zepimon-active', JSON.stringify(activeForHistory))
const keysBeforeTitle = JSON.stringify([...titleKeys])
reopen()
assert.ok(shown('Adventure in progress'))
assert.ok(!shown('Walk'))
tap('Continue adventure  >')
flushBootTimeouts()
assert.equal(navigationParams.view, 'home')
assert.equal(JSON.stringify([...titleKeys]), keysBeforeTitle, 'Showing Continue must not change saved progress')
titleKeys.delete('zepimon-active')
titleKeys.set('zepimon-v1', JSON.stringify({ dex: {}, records: {}, active: activeForHistory }))
reopen()
assert.ok(shown('Continue adventure  >'), 'An adventure saved by an older version still continues')
titleKeys.set('zepimon-active', 'null')
reopen()
assert.ok(shown('Walk'), 'Returning after finishing restores Walk and Run')
close()
bootDrawn.length = 0
bootContext.LocalStorage = class { getItem() { throw new Error('Storage unavailable') } }
titlePage.build()
assert.ok(shown('Walk') && shown('Change egg'), 'A storage read failure must not hide the title buttons')
titlePage.onDestroy()
assert.equal(bootTimers.size, 0)
console.log('Title screen checks passed')
