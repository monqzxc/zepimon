import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { emptyExpeditions, importExpeditions, claimExpedition, restoreExpeditions, expeditionJournal } from '../src/expeditions.ts'
import { expeditionEncounter, expeditionKey, legendarySpecies, validateExpedition } from '../src/generated/expedition.js'
import { parseJournal, dexEntries } from '../src/journal.ts'

const snapshot = (meters, seed = 0, startedAt = 1000) => parseJournal(JSON.stringify({
  exportVersion: 1, app: 'Zepimon', exportedAt: '2026-10-22T00:00:00.000Z', receivedAt: 2000,
  routes: [['Bulbasaur', 'Ivysaur', 'Venusaur']], snapshot: { schemaVersion: 1, capturedAt: 2000,
    dex: {}, records: {}, active: null, expedition: { meters, seed, startedAt } }
}))

test('watch credits only completed distance, survives replacement, and does not retro-credit old records', () => {
  const context = vm.createContext({})
  for (const file of ['page/catalog.js', 'page/types.js', 'shared/expedition.js']) {
    vm.runInContext(fs.readFileSync('../hatdog-app/' + file, 'utf8').replace(/export /g, ''), context)
  }
  vm.runInContext('const catalogRoutes = routes', context)
  // Isolate the re-exported routes declaration from catalog bindings.
  vm.runInContext('(function(){' + fs.readFileSync('../hatdog-app/page/pokemon.js', 'utf8').replace(/^import .*\r?\n/gm, '').replace(/export /g, '') +
    '\nglobalThis.finish = finishSession; globalThis.init = ensureExpedition; })()', context)
  const state = { dex: {}, records: { 0: { meters: 50000, steps: 1, finishedAt: '2026-10-20T00:00:00Z', shiny: false } }, active: null }
  context.init(state, 1000)
  assert.equal(state.expedition.meters, 0)
  const seed = state.expedition.seed
  for (const meters of [5000, 10000, 12000]) {
    state.active = { route: 0, meters, steps: 1000, startedAt: 1000, shiny: false }
    context.finish(state, '2026-10-22T00:00:00Z')
  }
  assert.equal(state.expedition.meters, 27000)
  assert.equal(state.records[0].meters, 12000)
  context.finish(state, '2026-10-22T00:00:00Z')
  assert.equal(state.expedition.meters, 27000, 'Duplicate save cannot credit twice')
  assert.equal(state.expedition.seed, seed)
})

test('new snapshot field is optional, validated, and survives JSON reimport without double credit', () => {
  let progress = importExpeditions(emptyExpeditions(), snapshot(25000))
  const key = expeditionKey(snapshot(0).snapshot.expedition)
  progress = importExpeditions(progress, snapshot(10000))
  assert.equal(progress.trails[key].meters, 25000)
  assert.deepEqual(importExpeditions(progress, snapshot(25000)), progress)
  const legacy = snapshot(0)
  delete legacy.snapshot.expedition
  assert.deepEqual(importExpeditions(progress, parseJournal(JSON.stringify(legacy))), progress)
  for (const changed of [{ seed: -1 }, { meters: -1 }, { meters: Infinity }, { seed: 2 ** 32 }, { startedAt: NaN }]) {
    assert.throws(() => validateExpedition({ seed: 0, meters: 0, startedAt: 1, ...changed }))
  }
})

test('encounters stay fixed across reloads, cover the catalog, and use a 2% shiny draw', () => {
  const value = { seed: 42, meters: 1000000, startedAt: 1 }
  const cycle = Array.from({ length: legendarySpecies.length }, (_, i) => expeditionEncounter(value, i).name)
  assert.equal(new Set(cycle).size, legendarySpecies.length)
  assert.deepEqual(expeditionEncounter(value, 1), expeditionEncounter({ ...value, meters: 50000 }, 1))
  let shiny = 0
  for (let seed = 0; seed < 50000; seed++) shiny += Number(expeditionEncounter({ ...value, seed }, 0).shiny)
  assert.ok(shiny > 850 && shiny < 1150, 'Stable seed draw must remain near 2%, not the old 1% rate')
  assert.throws(() => expeditionEncounter(value, -1))
  assert.throws(() => expeditionEncounter(value, 4000))
})

test('befriending checks unlocks, keeps both variants, and survives old/new watch syncs and reloads', () => {
  let normalSeed, shinySeed
  for (let seed = 0; seed < 10000; seed += legendarySpecies.length) {
    if (expeditionEncounter({ seed }, 0).shiny) shinySeed ??= seed
    else normalSeed ??= seed
  }
  assert.notEqual(shinySeed, undefined)
  let progress = emptyExpeditions()
  for (const seed of [normalSeed, shinySeed]) {
    const journal = snapshot(24999, seed)
    const key = expeditionKey(journal.snapshot.expedition)
    progress = importExpeditions(progress, journal)
    assert.throws(() => claimExpedition(progress, key, 0), /not ready/)
    progress = importExpeditions(progress, snapshot(50001, seed))
    progress = claimExpedition(progress, key, 0, 4000)
    assert.throws(() => claimExpedition(progress, key, 0), /already/)
    assert.equal(progress.trails[key].claimed, 1)
  }
  assert.ok(progress.dex.Articuno)
  assert.ok(progress.dex['Shiny Articuno'])
  const after = restoreExpeditions(JSON.parse(JSON.stringify(progress)))
  assert.deepEqual(after, progress)
  const imported = importExpeditions(after, snapshot(0, normalSeed))
  assert.equal(imported.trails[expeditionKey(snapshot(0, normalSeed).snapshot.expedition)].meters, 50001)
  const collection = expeditionJournal(snapshot(0), imported)
  const entry = dexEntries(collection).find(p => p.name === 'Articuno')
  assert.ok(entry.normal && entry.shiny)
  assert.equal(entry.shiny.source, 'expedition')
  assert.equal(collection.snapshot.records[0], undefined, 'An encounter is not a fake workout')
  assert.throws(() => restoreExpeditions({ trails: { bad: { seed: 0, startedAt: 1, meters: 25000, claimed: 2 } }, dex: {} }))
})
