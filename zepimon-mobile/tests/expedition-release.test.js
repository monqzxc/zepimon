import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyQuest } from '../src/expedition-quest.ts'
import { nextLegendaries, restoreEncounters } from '../src/expedition-encounter.ts'
import { restoreExpeditions } from '../src/expeditions.ts'
import { legendarySpecies } from '../src/generated/expedition.js'
import { eggOpen } from '../src/phone-adventure.ts'
import { canRevisit } from '../src/games/revisits.ts'
import { MAX_PERMITS, releaseLegendaries } from '../src/expedition-release.ts'

const NOW = Date.UTC(2026, 10, 12, 12)
const record = (name, shiny) => ({ meters: 25000, steps: 0, shiny, form: name, source: 'expedition', finishedAt: '2026-10-01T00:00:00.000Z' })
const KEY = '1767225600000:12345'
// A player three catches in, with a permit already spent on this trail, an encounter waiting and a Legendary egg chosen.
const saved = () => ({
  expeditions: { trails: { [KEY]: { meters: 60000, seed: 12345, startedAt: 1767225600000, claimed: 3 } },
    dex: { Jirachi: record('Jirachi', false), Rayquaza: record('Rayquaza', false), 'Shiny Rayquaza': record('Rayquaza', true) } },
  quest: { ...emptyQuest(), permits: 1, unlocks: { [KEY]: 2 } },
  encounters: { [KEY]: { index: 3, name: 'Uxie', trial: true, shiny: true, attempt: 1, resetPending: false, nextResetAllowedAt: 0, engaged: true } },
  trialRecords: { 'sig-jirachi': 80 },
  rematchWins: { Jirachi: 2, 'Shiny Rayquaza': 1 },
  plan: { egg: { family: ['Jirachi'], mega: null }, eggAt: 5, phone: null, updatedAt: 5 },
  buddy: 'Jirachi'
})

test('each released Legendary leaves the Dex and gives one permit', () => {
  const before = saved()
  const after = releaseLegendaries(before, ['Jirachi', 'Rayquaza'], NOW)
  assert.deepEqual(Object.keys(after.expeditions.dex), ['Shiny Rayquaza'])
  assert.equal(after.quest.permits, 3)
  assert.deepEqual(after.rematchWins, { 'Shiny Rayquaza': 1 }, 'Their rematch wins go with them')
  assert.equal(canRevisit(after.expeditions.dex, 'Jirachi', false), false, 'And their shrines')
  // Nothing else moves: the trail and its claims, permits already spent, the waiting encounter, best moves.
  assert.equal(after.expeditions.trails, before.expeditions.trails)
  assert.deepEqual({ ...after.quest, permits: 0 }, { ...before.quest, permits: 0 })
  assert.equal(after.encounters, before.encounters)
  assert.equal(after.trialRecords, before.trialRecords)
  assert.deepEqual(before, saved(), 'The saved data passed in is not changed')
})

test('a Shiny is its own release, and its Normal form stays', () => {
  const after = releaseLegendaries(saved(), ['Shiny Rayquaza'], NOW)
  assert.deepEqual(Object.keys(after.expeditions.dex), ['Jirachi', 'Rayquaza'])
  assert.equal(after.quest.permits, 2)
  assert.deepEqual(after.rematchWins, { Jirachi: 2 })
})

test('only caught Legendaries can be released, each once, and never past the most permits', () => {
  for (const [keys, why] of [[[], /at least one/], [['Mew'], /not one of your caught/], [['Shiny Jirachi'], /not one of your caught/],
    [['Pikachu'], /not one of your caught/], [['Jirachi', 'Jirachi'], /only be released once/], [['Jirachi', 'Mew'], /not one of your caught/],
    [['__proto__'], /not one of your caught/]]) {
    const before = saved()
    assert.throws(() => releaseLegendaries(before, keys, NOW), why)
    assert.deepEqual(before, saved(), 'A refused release changes nothing')
  }
  const full = { ...saved(), quest: { ...saved().quest, permits: MAX_PERMITS - 1 } }
  assert.throws(() => releaseLegendaries(full, ['Jirachi', 'Rayquaza'], NOW), /too many permits/)
  assert.equal(releaseLegendaries(full, ['Jirachi'], NOW).quest.permits, MAX_PERMITS)
})

test('a Legendary egg closes with the last of its family, and a chosen one is dropped', () => {
  const gone = releaseLegendaries(saved(), ['Jirachi'], NOW)
  assert.equal(eggOpen(['Jirachi'], gone.expeditions.dex), false)
  assert.equal(gone.plan.egg, null)
  assert.ok(gone.plan.updatedAt > 5, 'The watch hears of it')
  // While the Shiny is still caught, the family's egg stays open and chosen.
  const rayquaza = { ...saved(), plan: { egg: { family: ['Rayquaza'], mega: null }, eggAt: 5, phone: null, updatedAt: 5 } }
  const kept = releaseLegendaries(rayquaza, ['Rayquaza'], NOW)
  assert.equal(eggOpen(['Rayquaza'], kept.expeditions.dex), true)
  assert.equal(kept.plan, rayquaza.plan)
  assert.equal(releaseLegendaries(rayquaza, ['Rayquaza', 'Shiny Rayquaza'], NOW).plan.egg, null)
  // An ordinary egg, or none, is left alone.
  const pikachu = { ...saved(), plan: { egg: { family: ['Pichu', 'Pikachu', 'Raichu'], mega: null }, eggAt: 5, phone: null, updatedAt: 5 } }
  assert.equal(releaseLegendaries(pikachu, ['Jirachi'], NOW).plan, pikachu.plan)
  assert.equal(releaseLegendaries({ ...saved(), plan: null }, ['Jirachi'], NOW).plan, null)
})

test('a released Legendary can be met again, and the save still restores', () => {
  // Every Legendary caught: the trail's next pick comes round to one already caught.
  const all = Object.fromEntries(legendarySpecies.map(name => [name, record(name, false)]))
  const trail = { meters: 100000, seed: 0, startedAt: 1000, claimed: 0 }
  const play = dex => ({ expeditions: { trails: { '1000:0': trail }, dex }, quest: emptyQuest(), encounters: {}, rematchWins: {}, plan: null })
  const after = releaseLegendaries(play(all), ['Mewtwo'], NOW)
  assert.equal(nextLegendaries(after)['1000:0'], 'Mewtwo', 'The only one not caught is met next')
  assert.equal(after.quest.permits, 1)
  // Releasing leaves claims above the Dex count, which a restore accepts: claims are checked against distance and permits.
  const released = releaseLegendaries(saved(), ['Jirachi', 'Rayquaza', 'Shiny Rayquaza'], NOW)
  const reopened = restoreExpeditions(JSON.parse(JSON.stringify(released.expeditions)), released.quest.unlocks)
  assert.deepEqual(reopened, released.expeditions)
  assert.deepEqual(restoreEncounters(JSON.parse(JSON.stringify(released.encounters)), reopened, released.quest), released.encounters, 'The waiting encounter is kept')
})
