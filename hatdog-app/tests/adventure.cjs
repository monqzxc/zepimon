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
  '\nglobalThis.logic = { routes, speciesCount, generation, megaChoices, rollShiny, collectionCount, dexPokemon, primaryType, spritePath, nextMilestone, acquiredForms, currentForm, elapsedSeconds, elapsedLabel, paceLabel, updateSession, finishSession }', context)
const { routes, currentForm, updateSession, finishSession } = context.logic
assert.equal(context.logic.elapsedSeconds({ startedAt: 1000 }, 62000), 61)
assert.equal(context.logic.elapsedSeconds({ startedAt: 1000 }, 500), 0)
assert.equal(context.logic.elapsedSeconds({}, 62000), null)
assert.equal(context.logic.elapsedLabel(3661), '01:01:01')
assert.equal(context.logic.paceLabel(3600, 10000), '6:00 /km')
assert.equal(context.logic.paceLabel(3599, 10000), '6:00 /km')
assert.equal(context.logic.paceLabel(10, 0), '--:-- /km')
assert.equal(context.logic.paceLabel(null, 1000), '--:-- /km')
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
assert.equal(state.dex.Venusaur.meters, 5500)
state.active = { ...active, meters: 21000, mega: 'Mega Venusaur' }
finishSession(state, '2026-10-16T00:00:00Z')
assert.equal(state.dex['Mega Venusaur'].meters, 21000)
assert.equal(state.records[0].form, 'Mega Venusaur')
state.active = { ...active, meters: 1000, mega: 'Mega Venusaur' }
finishSession(state, '2026-10-17T00:00:00Z')
assert.ok(state.dex['Mega Venusaur'])
assert.equal(state.dex['Mega Venusaur'].meters, 1000)
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

// Exercise page navigation, sensor callbacks, storage and reopen without a watch.
let page
let distance = 1000
let steps = 1500
let stored
const sensors = []
const timers = new Map()
let timerId = 0
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
  widget: { TEXT: 1, BUTTON: 2, IMG: 3, FILL_RECT: 4 }, align: { CENTER_H: 1 }, prop: { TEXT: 1, MORE: 2 }, text_style: { WRAP: 1 }, event: { CLICK_UP: 1 },
  setInterval(callback) { const id = ++timerId; timers.set(id, callback); return id },
  clearInterval(id) { timers.delete(id) },
  createWidget: (type, options) => {
    assert.ok(options.x >= 0 && options.x + options.w <= 320, 'Widget outside watch width')
    assert.ok(options.y >= 64 && options.y + options.h <= 380, 'Widget overlaps system header or screen edge')
    return { ...options, setProperty(property, value) { if (property === 2) Object.assign(this, value); else this.text = value }, addEventListener(_, callback) { this.click_func = callback } }
  },
  deleteWidget: () => {}, setWakeUpRelaunch: () => {}, Page: (definition) => { page = definition }
})
vm.runInContext('Math.random = () => 0.5', context)
context.testNow = 100000
vm.runInContext('Date.now = () => testNow', context)
vm.runInContext(fs.readFileSync('page/adventure.js', 'utf8').replace(/^import .*\r?\n/gm, ''), context)
page.build()
const click = (label) => {
  const button = page.widgets.find(item => item.text === label && item.click_func)
  assert.ok(button, 'Missing button: ' + label)
  button.click_func()
}
click('New Egg')
for (const generation of ['Generation 1', 'Generation 2', 'Generation 3', 'Generation 4', 'Extra Mega families']) {
  click(generation)
  assert.equal(page.view, 'choose')
  click('Back')
  assert.equal(page.view, 'new')
  assert.equal(timers.size, 0)
}
click('Generation 1')
click('Start')
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
assert.equal(page.clockStats[1].text, 'Pace --:-- /km')
for (let frame = 0; frame < 6; frame++) {
  Array.from(timers.values())[0]()
  assert.ok(page.portrait.y >= 64)
  assert.ok(page.portrait.y + page.portrait.h < page.stats[1].y, 'Bouncing sprite must not cover distance')
  assert.equal(page.portrait.x, (320 - page.portrait.w) / 2)
}
distance += 5000
steps += 7000
sensors[0].callback()
assert.equal(page.state.active.meters, 5000)
assert.equal(page.stats[0].text, 'Bulbasaur')
assert.ok(page.portrait.w > 96, 'Hatching must retain the large run sprite')
page.onDestroy()
distance += 500
page.build()
assert.equal(page.state.active.meters, 5500)
assert.equal(page.state.active.startedAt, startedAt)
assert.equal(page.clockStats[0].text, 'Time 00:01:01')
click('Finish & save')
click('Save & finish')
assert.equal(page.state.records[0].meters, 5500)
click('Dex')
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
click('Continue Adventure')
click('Start')
assert.equal(page.state.active.meters, 0)
assert.equal(page.state.records[0].meters, 5500)
distance += 6000
page.sync()
click('Finish & save')
click('Save & finish')
assert.equal(page.state.records[0].meters, 6000)
assert.equal(page.state.dex.Bulbasaur.meters, 6000)
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
click('Dex')
click('Bulbasaur')
click('Shiny')
assert.ok(page.widgets.some(item => item.text === '5.00 km'))
click('Normal')
assert.ok(page.widgets.some(item => item.text === '6.00 km'))
click('Back')
click('Back')
page.start(0)
assert.equal(page.state.active.shiny, false)
page.onDestroy()
assert.equal(timers.size, 0)
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
const bootTimers = new Map()
const bootContext = vm.createContext({
  Page(definition) { titlePage = definition; definition.build() }, Distance,
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
assert.ok(!/@zos\/storage/.test(entry))
vm.runInContext(entry.replace(/^import .*\r?\n/gm, ''), bootContext)
assert.ok(!bootDrawn.some(item => item.text === 'Zepimon'))
assert.equal(titlePage.distanceText !== undefined, true)
assert.ok(bootDrawn.some(item => item.text === (distance / 1000).toFixed(2)))
bootDrawn.find(item => item.text === 'Start Adventure  >').click_func()
assert.equal(destination, 'page/adventure')
assert.equal(navigationParams.view, 'home')
bootDrawn.find(item => item.text === 'History  >').click_func()
assert.equal(navigationParams.view, 'existing')
titlePage.onDestroy()
assert.equal(bootTimers.size, 0)
console.log('Title screen checks passed')
