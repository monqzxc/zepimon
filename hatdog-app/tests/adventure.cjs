const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const context = vm.createContext({})
vm.runInContext('(function(){' + fs.readFileSync('page/catalog.js', 'utf8').replace(/export /g, '') +
  '\nglobalThis.catalog = { routes, species, megaForms, sprites, shinySprites, legacyRoutes } })()', context)
Object.assign(context, { catalogRoutes: context.catalog.routes, species: context.catalog.species,
  megaForms: context.catalog.megaForms, sprites: context.catalog.sprites, shinySprites: context.catalog.shinySprites })
vm.runInContext(fs.readFileSync('page/types.js', 'utf8').replace(/export /g, '') , context)
vm.runInContext(fs.readFileSync('page/pokemon.js', 'utf8').replace(/^import .*\r?\n/gm, '').replace(/export /g, '') +
  '\nglobalThis.logic = { routes, speciesCount, generation, megaChoices, rollShiny, collectionCount, dexPokemon, primaryType, spritePath, nextMilestone, acquiredForms, currentForm, elapsedSeconds, elapsedLabel, paceLabel, currentPace, updateSession, finishSession, refreshPersonalBests, repairDexRecords, hasDexDistance }', context)
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
assert.equal(context.logic.primaryType('Charizard'), 'fire')
assert.equal(context.logic.primaryType('Shiny Gengar'), 'ghost')
assert.equal(context.logic.dexPokemon({ Bulbasaur: {}, 'Shiny Bulbasaur': {} }).length, 1)
assert.equal(Array.from({ length: 100 }, (_, i) => context.logic.rollShiny(() => (i + 0.5) / 100)).filter(Boolean).length, 1)
assert.equal(context.logic.rollShiny(() => 0.00999), true)
assert.equal(context.logic.rollShiny(() => 0.01), false)
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
let timerId = 0
let phoneSyncs = 0
let pageBacks = 0
class Sensor {
  constructor() { sensors.push(this) }
  onChange(callback) { this.callback = callback }
  offChange(callback) { assert.equal(this.callback, callback); this.callback = null }
}
class Distance extends Sensor { getCurrent() { return distance } }
class Step extends Sensor { getCurrent() { return steps } }
class LocalStorage {
  getItem(key, fallback) { return stored ? JSON.parse(stored) : fallback }
  setItem(key, value) { stored = JSON.stringify(value) }
}
Object.assign(context, {
  ...context.logic, Distance, Step, LocalStorage, console,
  getApp: () => ({ _options: { syncToPhone() { phoneSyncs++ } } }),
  back: () => { pageBacks++ },
  widget: { TEXT: 1, BUTTON: 2, IMG: 3, FILL_RECT: 4 }, align: { CENTER_H: 1 }, prop: { TEXT: 1, MORE: 2 }, text_style: { WRAP: 1 }, event: { CLICK_UP: 1 },
  setInterval(callback) { const id = ++timerId; timers.set(id, callback); return id },
  clearInterval(id) { timers.delete(id) },
  createWidget: (type, options) => {
    assert.ok(options.x >= 0 && options.x + options.w <= 320, 'Widget outside watch width')
    assert.ok(options.y >= 64 && options.y + options.h <= 380, 'Widget overlaps system header or screen edge')
    if (type === 3) imageUpdates.push(options)
    return { ...options, setProperty(property, value) {
      if (property === 2) {
        if (type === 3) imageUpdates.push(value)
        Object.assign(this, value)
      } else this.text = value
    }, addEventListener(_, callback) { this.click_func = callback } }
  },
  deleteWidget: () => {}, setWakeUpRelaunch: () => {}, Page: (definition) => { page = definition }
})
context.shinyRolls = 0
vm.runInContext('Math.random = () => { shinyRolls++; return 0.5 }', context)
context.testNow = 100000
vm.runInContext('Date.now = () => testNow', context)
vm.runInContext(fs.readFileSync('page/adventure.js', 'utf8').replace(/^import .*\r?\n/gm, ''), context)
page.build()
const click = (label) => {
  const button = page.widgets.find(item => item.text === label && item.click_func)
  assert.ok(button, 'Missing button: ' + label)
  button.click_func()
}
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
for (const generation of ['Generation 1', 'Generation 2', 'Generation 3', 'Generation 4', 'Extra Mega families']) {
  click(generation)
  assert.equal(page.view, 'choose')
  click('Back')
  assert.equal(page.view, 'new')
  assert.equal(timers.size, 0)
}
click('Back to title')
assert.equal(pageBacks, 2, 'New Egg generation selection can return directly to title')
assert.equal(page.state.active, null, 'Leaving selection must not start an adventure')
openFromTitle('home')
click('New Egg')
click('Generation 1')
click('>')
const megaButton = page.widgets.find(item => item.text && item.text.endsWith(' @21km') && item.click_func)
assert.ok(megaButton)
megaButton.click_func()
const selectedEgg = page.index
const selectedMega = page.megaIndex
const rollsBeforeMode = context.shinyRolls
click('Start')
assert.equal(page.view, 'activity')
assert.equal(page.state.active, null, 'Choosing an activity must not start the adventure yet')
assert.equal(context.shinyRolls, rollsBeforeMode, 'The shiny chance waits until an activity is chosen')
click('Back')
assert.equal(page.view, 'choose')
assert.equal(page.index, selectedEgg, 'Activity Back keeps the selected egg')
assert.equal(page.megaIndex, selectedMega, 'Activity Back keeps the selected Mega form')
click('Back')
click('Generation 1')
click('Start')
click('Walking')
assert.equal(page.state.active.activity, 'walking')
assert.equal(context.shinyRolls, rollsBeforeMode + 1, 'Starting an adventure rolls exactly once')
assert.equal(JSON.parse(stored).active.activity, 'walking')
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
assert.equal(page.portrait.y, baseY - 2)
assert.equal(page.portrait.x, (320 - page.portrait.w) / 2, 'Animation must keep the larger sprite centered')
assert.equal(page.clockStats[0].text, 'Time 00:01:01')
assert.equal(page.clockStats[1].text, 'Est. pace --:-- /km')
for (let frame = 0; frame < 6; frame++) {
  Array.from(timers.values())[0]()
  assert.ok(page.portrait.y >= 64)
  assert.ok(page.portrait.y + page.portrait.h < page.stats[1].y, 'Bouncing sprite must not cover distance')
  assert.equal(page.portrait.x, (320 - page.portrait.w) / 2)
}
distance += 5000
steps += 7000
page.distance.callback()
assert.equal(page.state.active.meters, 5000)
assert.equal(page.stats[0].text, 'Bulbasaur')
assert.ok(page.portrait.w > 96, 'Hatching must retain the large run sprite')
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
openFromTitle('dex')
assert.ok(page.widgets.some(item => item.text === 'Bulbasaur'))
click('Bulbasaur')
click('Shiny')
assert.ok(page.widgets.some(item => item.text === 'Not acquired'))
assert.equal(timers.size, 0)
click('Normal')
assert.ok(page.widgets.some(item => item.text === '5.50 km'))
assert.equal(timers.size, 1)
click('Back')
click('Back')
openFromTitle('home')
click('Continue Adventure')
click('Start')
click('Back')
assert.equal(page.view, 'existing', 'Activity Back also returns to the saved-route chooser')
click('Start')
click('Running')
assert.equal(page.state.active.activity, 'running')
assert.ok(page.stats[2].text.startsWith('Run: '))
assert.equal(page.state.active.meters, 0)
assert.equal(page.state.records[0].meters, 5500)
openFromTitle('home')
assert.equal(page.state.active.activity, 'running', 'Reopening retains the selected activity')
click('Finish & save')
click('Keep running')
assert.equal(page.view, 'session')
distance += 6000
page.sync()
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
openFromTitle('dex')
click('Bulbasaur')
click('Shiny')
assert.ok(page.widgets.some(item => item.text === '5.00 km'))
click('Normal')
assert.ok(page.widgets.some(item => item.text === '6.00 km'))
click('Back')
click('Back')
openFromTitle('home')
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
assert.ok(!stored.includes('checkedAt'), 'Transient pace samples must not be written to saves')
distance = 1
page.sync()
assert.equal(page.pace.samples.length, 1, 'A daily counter reset clears recent speed history')
assert.equal(page.clockStats[1].text, 'Est. pace --:-- /km')
page.onDestroy()
assert.equal(timers.size, 0)
// Explicit History must work during an active adventure without resetting it.
const activeForHistory = JSON.parse(stored).active
stored = JSON.stringify({ ...historyState, active: activeForHistory })
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
assert.equal(page.view, 'dex', 'An active adventure must not redirect a requested Dex view')
assert.equal(JSON.stringify(page.state.active), JSON.stringify(activeForHistory))
click('Bulbasaur')
click('Back')
assert.equal(page.view, 'dex', 'Detail Back returns to the Dex list')
const beforeDexBack = pageBacks
click('Back')
assert.equal(pageBacks, beforeDexBack + 1, 'Dex list Back returns to title')
openFromTitle('home')
assert.equal(page.view, 'session', 'The title adventure button resumes an active run')
assert.equal(JSON.stringify(page.state.active), JSON.stringify(activeForHistory))
page.onDestroy()
stored = JSON.stringify({ dex: {}, records: {}, active: null })
page.onInit({ view: 'history' })
page.build()
for (const label of historyButtons) {
  click(label)
  assert.ok(page.widgets.some(item => item.text === 'No record yet'))
  click('Back')
}
openFromTitle('dex')
assert.ok(page.widgets.some(item => item.text === 'No Pokemon acquired yet'))
const beforeEmptyDexBack = pageBacks
click('Back')
assert.equal(pageBacks, beforeEmptyDexBack + 1, 'Empty Dex also returns to title')
page.onDestroy()
stored = JSON.stringify({ dex: { Bulbasaur: { ...broken } }, records: {}, active: null })
page.onInit({ view: 'home' })
page.build()
page.openDex('Bulbasaur')
assert.ok(page.widgets.some(item => item.text === 'Distance unavailable'))
assert.ok(page.widgets.some(item => item.src === context.logic.spritePath('Bulbasaur')))
page.onDestroy()
stored = JSON.stringify({ dex: { Bulbasaur: { ...broken } }, records: { 0: record(6000, 3600, 3000, 'Bulbasaur') }, active: null })
page.build()
page.openDex('Bulbasaur')
assert.ok(page.widgets.some(item => item.text === '6.00 km'))
assert.ok(page.widgets.some(item => item.text === 'Time 01:00:00'))
assert.equal(JSON.parse(stored).dex.Bulbasaur.meters, 6000, 'Opening the watch persists recovered acquisition details')
page.onDestroy()
// A centered widget alone does not make its small source image fill that area.
// Check creation, movement, and hatching/evolution updates all request fitting.
for (const update of imageUpdates) {
  assert.equal(update.auto_scale, true)
  assert.equal(update.auto_scale_obj_fit, true, 'Sprite updates must explicitly fill the image widget')
  assert.equal(update.pos_x, 0)
  assert.equal(update.pos_y, 0)
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

// Title screen navigation, daily distance and cleanup.
const bootDrawn = []
let destination
let navigationParams
let titlePage
let titleSavedState = null
const bootTimers = new Map()
const bootContext = vm.createContext({
  Page(definition) { titlePage = definition; definition.build() }, Distance,
  LocalStorage: class { getItem() { return titleSavedState } },
  widget: { TEXT: 1, BUTTON: 2, FILL_RECT: 3, IMG: 4 }, align: { CENTER_H: 1 },
  text_style: { NONE: 0 }, prop: { TEXT: 1 },
  setInterval(callback) { bootTimers.set(1, callback); return 1 }, clearInterval(id) { bootTimers.delete(id) },
  createWidget(type, options) {
    assert.ok(options.x >= 0 && options.x + options.w <= 320)
    assert.ok(options.y >= 64 && options.y + options.h <= 380, 'Title content overlaps system header or screen edge')
    bootDrawn.push(options)
    return { setProperty(_, value) { options.text = value } }
  },
  push(options) { destination = options.url; navigationParams = options.params }, console
})
const entry = fs.readFileSync('page/index.js', 'utf8')
assert.ok(!/hmUI|hmApp/.test(entry))
vm.runInContext(entry.replace(/^import .*\r?\n/gm, ''), bootContext)
assert.ok(!bootDrawn.some(item => item.text === 'Zepimon'))
assert.ok(bootDrawn.some(item => item.src === 'pokemon/443.png' && item.auto_scale && item.auto_scale_obj_fit))
assert.equal(titlePage.distanceText !== undefined, true)
assert.ok(bootDrawn.some(item => item.text === (distance / 1000).toFixed(2)))
bootDrawn.find(item => item.text === 'Start Adventure  >').click_func()
assert.equal(destination, 'page/adventure')
assert.equal(navigationParams.view, 'home')
bootDrawn.find(item => item.text === 'History  >').click_func()
assert.equal(navigationParams.view, 'history')
bootDrawn.find(item => item.text === 'Dex  >').click_func()
assert.equal(navigationParams.view, 'dex')
assert.equal(bootDrawn.filter(item => item.click_func).length, 3)
titlePage.onDestroy()
bootDrawn.length = 0
titleSavedState = { dex: {}, records: {}, active: activeForHistory }
const activeBeforeTitle = JSON.stringify(titleSavedState)
titlePage.build()
assert.ok(bootDrawn.some(item => item.text === 'Adventure in progress'))
assert.ok(!bootDrawn.some(item => item.text === 'Start Adventure  >'))
bootDrawn.find(item => item.text === 'Continue adventure  >').click_func()
assert.equal(navigationParams.view, 'home')
assert.equal(JSON.stringify(titleSavedState), activeBeforeTitle, 'Showing Continue must not change saved progress')
titlePage.onDestroy()
bootDrawn.length = 0
titleSavedState = { dex: {}, records: {}, active: null }
titlePage.build()
assert.ok(bootDrawn.some(item => item.text === 'Start Adventure  >'), 'Returning after finishing must restore Start Adventure')
assert.ok(bootDrawn.some(item => item.text === 'Ready to start'))
titlePage.onDestroy()
bootDrawn.length = 0
bootContext.LocalStorage = class { getItem() { throw new Error('Storage unavailable') } }
titlePage.build()
assert.ok(bootDrawn.some(item => item.text === 'Start Adventure  >'), 'A storage read failure must not hide title navigation')
titlePage.onDestroy()
assert.equal(bootTimers.size, 0)
console.log('Title screen checks passed')
