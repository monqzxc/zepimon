import test from 'node:test'
import assert from 'node:assert/strict'
import { routes } from '../src/generated/catalog.js'
import { currentForm, earnedForms, eggs, formChoices, formStages, milestoneLabel, newAdventure, nextMilestone, previousMilestone } from '../src/phone-adventure.ts'
import { hasAcquisitionDistance, parseJournal, recordForm, recordForms, speciesName } from '../src/journal.ts'
import { generationOf, speciesNumber, typeOf } from '../src/pokedex.ts'
import { eggOf } from '../src/plan.ts'
import { sharedPokemon } from '../src/shared-adventure.ts'
import { missions } from '../src/progress.ts'

const charmander = ['Charmander', 'Charmeleon', 'Charizard']
const pichu = ['Pichu', 'Pikachu', 'Raichu']
const kubfu = ['Kubfu', 'Urshifu']

test('every generation is in the catalog, and Gen 5-9 Legendaries hatch from ordinary eggs for now', () => {
  const species = new Set(routes.flat())
  assert.equal(species.size, 1025)
  for (const name of ['Snivy', 'Froakie', 'Rowlet', 'Grookey', 'Sprigatito', 'Pecharunt', 'Melmetal']) assert.ok(species.has(name), name)
  for (const name of ['Victini', 'Zacian', 'Koraidon', 'Meltan', 'Kubfu']) assert.ok(eggs.some(family => family[0] === name), name)
  assert.equal(generationOf('Sprigatito'), 9)
  assert.ok(eggs.some(family => family.join('>') === 'Teddiursa>Ursaring>Ursaluna'), 'An older line goes on to its later evolution')
})

test('an egg Megas at 21 km, Dynamaxes at 42 km and Gigantamaxes at 50 km', () => {
  assert.deepEqual(earnedForms(charmander, 41999, 'Mega Charizard Y'), [...charmander, 'Mega Charizard Y'])
  assert.deepEqual(earnedForms(charmander, 50000, 'Mega Charizard Y'),
    [...charmander, 'Mega Charizard Y', 'Dynamax Charizard', 'Gigantamax Charizard'])
  assert.deepEqual([15000, 21000, 42000, 50000].map(m => nextMilestone(charmander, m)), [21000, 42000, 50000, null])
  assert.deepEqual([4999, 15000, 30000, 45000].map(m => previousMilestone(charmander, m)), [0, 15000, 21000, 42000])
  assert.deepEqual([5000, 10000, 21000, 42000, 50000].map(milestoneLabel), ['hatch', 'evolve', 'Mega', 'Dynamax', 'Gigantamax'])
  // No Mega, no Gigantamax: it Dynamaxes and that is its last form.
  assert.deepEqual(earnedForms(['Rattata', 'Raticate'], 60000, null), ['Rattata', 'Raticate', 'Dynamax Raticate'])
  // Gigantamax belongs to the latest stage that has it.
  assert.equal(currentForm(pichu, 50000, 'Mega Raichu X'), 'Gigantamax Pikachu')
  assert.equal(currentForm(['Eevee', 'Umbreon'], 50000, null), 'Gigantamax Eevee')
})

test('Urshifu and Toxtricity pick their Gigantamax form before setting off', () => {
  assert.deepEqual(formChoices(kubfu), ['Gigantamax Urshifu Single Strike', 'Gigantamax Urshifu Rapid Strike'])
  assert.deepEqual(formChoices(['Toxel', 'Toxtricity']), ['Gigantamax Toxtricity Amped', 'Gigantamax Toxtricity Low Key'])
  assert.deepEqual(formChoices(['Lapras']), [], 'One Gigantamax form needs no choice')
  assert.deepEqual(formChoices(charmander), ['Mega Charizard X', 'Mega Charizard Y'], 'A Mega choice comes first')
  assert.equal(newAdventure(kubfu, 'running', 'Gigantamax Urshifu Rapid Strike', 0).mega, 'Gigantamax Urshifu Rapid Strike')
  assert.equal(newAdventure(kubfu, 'running', 'Mega Charizard X', 0).mega, 'Gigantamax Urshifu Single Strike')
  assert.equal(currentForm(kubfu, 21000, 'Gigantamax Urshifu Rapid Strike'), 'Urshifu')
  assert.equal(currentForm(kubfu, 50000, 'Gigantamax Urshifu Rapid Strike'), 'Gigantamax Urshifu Rapid Strike')
  assert.deepEqual(formStages(kubfu, 'Mega Venusaur').map(stage => stage.name), ['Kubfu', 'Urshifu', 'Dynamax Urshifu', null])
})

test('saved records keep their saved form and never imply an unchosen one', () => {
  // Saved before Dynamax: it keeps the name it was saved with.
  assert.equal(recordForm(charmander, { meters: 45000, form: 'Mega Charizard X' }), 'Mega Charizard X')
  assert.equal(recordForm(charmander, { meters: 50000, form: 'Gigantamax Charizard', mega: 'Mega Charizard X' }), 'Gigantamax Charizard')
  // An old record that names no Mega shows no Mega.
  assert.deepEqual(recordForms(charmander, { meters: 45000 }), [...charmander, 'Dynamax Charizard'])
  assert.equal(recordForm(charmander, { meters: 30000 }), 'Charizard')
  assert.equal(recordForm(['Teddiursa', 'Ursaring', 'Ursaluna'], { meters: 15000, form: 'Ursaring' }), 'Ursaring')
  assert.ok(hasAcquisitionDistance('Dynamax Charizard', { meters: 42000 }, routes))
  assert.ok(!hasAcquisitionDistance('Gigantamax Charizard', { meters: 49999 }, routes))
})

test('special forms belong to their species in the Dex', () => {
  for (const name of ['Dynamax Charizard', 'Gigantamax Charizard', 'Mega Charizard X', 'Shiny Gigantamax Charizard']) {
    assert.equal(speciesName(name), 'Charizard')
    assert.equal(speciesNumber(name), 6)
  }
  assert.equal(speciesNumber('Gigantamax Urshifu Rapid Strike'), 892)
  assert.equal(typeOf('Dynamax Gengar'), 'ghost')
  assert.equal(typeOf('Gigantamax Lapras'), 'water')
  assert.deepEqual(eggOf('Gigantamax Pikachu'), { family: eggs.find(family => family.includes('Pikachu')), mega: null })
  assert.deepEqual(eggOf('Shiny Gigantamax Toxtricity Low Key'), { family: ['Toxel', 'Toxtricity'], mega: 'Gigantamax Toxtricity Low Key' })
  assert.deepEqual(eggOf('Shiny Gigantamax Urshifu Rapid Strike'), { family: kubfu, mega: 'Gigantamax Urshifu Rapid Strike' })
  assert.equal(eggOf('Dynamax Lapras')?.family.join('>'), 'Lapras')
})

test('a shared adventure is named as the watch grows it', () => {
  const shared = { id: 'adv-1', family: charmander, mega: 'Mega Charizard X', shiny: false, activity: 'running', startedAt: 1,
    device: 'watch', deviceAt: 1, meters: 21000, hatchSeconds: null, at: 2, ended: false }
  assert.equal(sharedPokemon(shared), 'Mega Charizard X')
  assert.equal(sharedPokemon({ ...shared, meters: 42000 }), 'Dynamax Charizard')
  assert.equal(sharedPokemon({ ...shared, meters: 50000, shiny: true }), 'Shiny Gigantamax Charizard')
  assert.equal(sharedPokemon({ ...shared, family: kubfu, mega: 'Gigantamax Urshifu Rapid Strike', meters: 21000 }), 'Urshifu')
  assert.equal(sharedPokemon({ ...shared, family: kubfu, mega: 'Gigantamax Urshifu Rapid Strike', meters: 50000 }), 'Gigantamax Urshifu Rapid Strike')
})

test('Dynamax and Gigantamax badges unlock from what an adventure reached', () => {
  const now = Date.UTC(2026, 10, 4)
  const run = (meters, extra = {}) => ({ id: 'run', family: charmander, record: { meters, steps: 0, shiny: false,
    finishedAt: new Date(now - 3600000).toISOString(), startedAt: now - 7200000, elapsedSeconds: 3600, ...extra } })
  const journal = parseJournal(JSON.stringify({ exportVersion: 1, app: 'Zepimon', exportedAt: new Date(now).toISOString(), receivedAt: now,
    routes: [charmander], snapshot: { schemaVersion: 1, capturedAt: now, dex: {}, records: {}, active: null } }))
  const badges = meters => {
    const progress = { runs: [run(meters, { mega: 'Mega Charizard X', form: meters >= 50000 ? 'Gigantamax Charizard' : 'Dynamax Charizard' })], unlocked: {} }
    return Object.fromEntries(missions(journal, progress, now).map(item => [item.id, item.value]))
  }
  assert.deepEqual([badges(42000)['mega-friend'], badges(42000)['dynamax-friend'], badges(42000)['gigantamax-friend']], [1, 1, 0])
  assert.equal(badges(50000)['gigantamax-friend'], 1)
})
