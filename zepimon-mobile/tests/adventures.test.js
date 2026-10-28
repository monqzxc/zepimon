import test from 'node:test'
import assert from 'node:assert/strict'
import { adventureFacts, allAdventures, findAdventure } from '../src/adventures.ts'
import { addFix, finishAdventure, newAdventure, withPhoneRuns } from '../src/phone-adventure.ts'
import { emptyProgress, importProgress } from '../src/progress.ts'

const start = Date.UTC(2026, 9, 26, 6, 0)
// A phone adventure walking north `steps` × 10 m from `from`, as src/tracker.ts records one.
function phoneRun(family, from, steps) {
  let active = newAdventure(family, 'walking', null, from, () => 0.5)
  for (let i = 0; i <= steps; i++) active = addFix(active, { lat: 14.5 + i * 10 / 111195, lng: 121, accuracy: 5, at: from + i * 7000 })
  return finishAdventure(active, from + steps * 7000)
}
const watchRun = (family, finishedAt, meters) => ({ id: `watch-${finishedAt}`, family,
  record: { meters, steps: meters * 1.3, shiny: false, finishedAt: new Date(finishedAt).toISOString(), elapsedSeconds: meters / 1.4 } })
// Progress the way the store builds it: each phone adventure imported as it is saved.
function progressWith(phoneRuns, watchRuns = []) {
  let progress = { ...emptyProgress(), runs: watchRuns }
  for (let i = 1; i <= phoneRuns.length; i++) progress = importProgress(progress, withPhoneRuns(null, phoneRuns.slice(0, i)), start + 864e5)
  return progress
}

test('every adventure is listed newest first, phone ones with their routes', () => {
  const walk = phoneRun(['Bulbasaur', 'Ivysaur', 'Venusaur'], start, 600)
  const again = phoneRun(['Bulbasaur', 'Ivysaur', 'Venusaur'], start + 36e5, 300)
  const watch = watchRun(['Pichu', 'Pikachu', 'Raichu'], start + 2 * 36e5, 7000)
  const list = allAdventures(progressWith([walk, again], [watch]), [walk, again], start + 864e5)
  assert.deepEqual(list.map(item => [item.device, item.record.meters]), [['watch', 7000], ['phone', again.record.meters], ['phone', walk.record.meters]])
  assert.equal(list[1].path, again.path)
  assert.equal(list[2].path, walk.path)
  assert.equal(list[0].path, undefined)
})

test('a phone adventure missing from progress is still listed from the phone', () => {
  const walk = phoneRun(['Togepi', 'Togetic', 'Togekiss'], start, 200)
  const [only] = allAdventures(emptyProgress(), [walk], start + 864e5)
  assert.deepEqual([only.id, only.device, only.path], [walk.id, 'phone', walk.path])
})

test('an adventure is found by its phone id or its Journal id, with its route', () => {
  const walk = phoneRun(['Gible', 'Gabite', 'Garchomp'], start, 400)
  const watch = watchRun(['Pichu', 'Pikachu', 'Raichu'], start + 36e5, 5200)
  const progress = progressWith([walk], [watch])
  const journalId = allAdventures(progress, [walk], start + 864e5).find(item => item.device === 'phone').id
  assert.notEqual(journalId, walk.id)
  for (const id of [walk.id, journalId]) assert.equal(findAdventure(id, progress, [walk]).path, walk.path)
  assert.deepEqual([findAdventure(watch.id, progress, [walk]).device, findAdventure(watch.id, progress, [walk]).path], ['watch', undefined])
  assert.equal(findAdventure('missing', progress, [walk]), undefined)
  assert.equal(findAdventure(undefined, progress, [walk]), undefined)
})

test('facts list the hatch time, steps, start, forms reached and personal bests an adventure has', () => {
  const long = phoneRun(['Charmander', 'Charmeleon', 'Charizard'], start, 1100)
  const short = phoneRun(['Togepi', 'Togetic', 'Togekiss'], start + 864e5, 100)
  const journal = withPhoneRuns(null, [long, short])
  const facts = adventureFacts(long, journal)
  assert.equal(facts.hatchSeconds, long.record.hatchSeconds)
  assert.ok(facts.hatchSeconds > 0)
  assert.equal(facts.steps, null, 'phones count distance, not steps')
  assert.equal(facts.started, long.record.startedAt)
  assert.deepEqual(facts.evolution, ['Charmander', 'Charmeleon'])
  assert.deepEqual(facts.bests, ['distance', 'elapsed', 'hatch'])
  assert.deepEqual(adventureFacts(short, journal), { hatchSeconds: null, steps: null, started: short.record.startedAt, evolution: [], bests: [] })
  const watch = watchRun(['Pichu', 'Pikachu', 'Raichu'], start, 7000)
  assert.deepEqual([adventureFacts(watch, null).steps, adventureFacts(watch, null).started, adventureFacts(watch, null).bests], [9100, null, []])
})
