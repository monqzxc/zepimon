import test from 'node:test'
import assert from 'node:assert/strict'
import { fromShared, onWatch, restoreShared, sharedFrom, sharedPokemon, takenOver } from '../src/shared-adventure.ts'
import { newAdventure, restoreActive, saveActive } from '../src/phone-adventure.ts'
import { completedRuns } from '../src/progress.ts'

const charmander = ['Charmander', 'Charmeleon', 'Charizard']
const now = Date.UTC(2026, 9, 27, 9, 0)
const onTheWatch = { id: 'adv-1000', family: charmander, mega: 'Mega Charizard X', shiny: true, activity: 'running', startedAt: 1000,
  device: 'watch', deviceAt: 1000, meters: 5300, hatchSeconds: 2100, at: now - 60000, ended: false }

test('a phone adventure is shared with its id, egg and distance, and starting one gives it a new id', () => {
  const active = { ...newAdventure(charmander, 'walking', null, now, () => 0.5), meters: 1234.6 }
  assert.equal(active.shareId, `adv-${now}`)
  assert.equal(active.deviceAt, now)
  const shared = sharedFrom(active, now + 5000)
  assert.deepEqual([shared.id, shared.device, shared.deviceAt, shared.meters, shared.at, shared.ended, shared.mega],
    [`adv-${now}`, 'phone', now, 1234, now + 5000, false, 'Mega Charizard X'])
  assert.deepEqual(restoreShared(shared), shared, 'It passes the same check as on the watch and in the cloud')
  assert.equal(sharedFrom(active, now, true).ended, true)
})

test('the watch adventure shows while it is fresh and going, and can be taken over with its distance', () => {
  assert.equal(onWatch(onTheWatch, now)?.id, 'adv-1000')
  assert.equal(onWatch({ ...onTheWatch, ended: true }, now), null)
  assert.equal(onWatch({ ...onTheWatch, device: 'phone' }, now), null, 'The phone does not offer to continue its own')
  assert.equal(onWatch({ ...onTheWatch, at: now - 13 * 3600000 }, now), null, 'A forgotten adventure stops blocking')
  assert.equal(onWatch(null, now), null)
  assert.equal(sharedPokemon(onTheWatch), 'Shiny Charmander')
  assert.equal(sharedPokemon({ ...onTheWatch, meters: 22000 }), 'Shiny Mega Charizard X')
  const active = fromShared(onTheWatch, now)
  assert.deepEqual([active.startedAt, active.meters, active.shiny, active.mega, active.hatchSeconds, active.shareId, active.activity],
    [1000, 5300, true, 'Mega Charizard X', 2100, 'adv-1000', 'running'])
  assert.equal(active.deviceAt, now)
  assert.deepEqual(active.points, [], 'The route starts where the phone took over')
  assert.equal(fromShared({ ...onTheWatch, deviceAt: now + 10 }, now).deviceAt, now + 11, 'Taking over is always newer than the last owner')
  assert.equal(restoreShared({ ...onTheWatch, device: 'tablet' }), null)
  assert.equal(restoreShared(null), null)
})

test('the phone stops only when the watch took over its own adventure', () => {
  const active = fromShared(onTheWatch, now)
  assert.equal(takenOver(active, { ...onTheWatch, deviceAt: now + 60000 }), true)
  assert.equal(takenOver(active, { ...onTheWatch, deviceAt: now - 1 }), false, 'An older watch state is not a takeover')
  assert.equal(takenOver(active, { ...onTheWatch, id: 'adv-2', deviceAt: now + 60000 }), false, 'Another adventure is not this one')
  assert.equal(takenOver(active, { ...onTheWatch, device: 'phone', deviceAt: now + 60000 }), false)
  assert.equal(takenOver(null, onTheWatch), false)
})

test('a recording saved before sharing existed restores with the id it would have had', () => {
  const active = newAdventure(charmander, 'walking', null, now, () => 0.5)
  const legacy = JSON.parse(saveActive(active))
  delete legacy.shareId
  delete legacy.deviceAt
  const restored = restoreActive(JSON.stringify(legacy))
  assert.equal(restored.shareId, `adv-${now}`)
  assert.equal(restored.deviceAt, now)
  assert.equal(restoreActive(saveActive({ ...active, shareId: 'adv-1000', deviceAt: now + 5 })).deviceAt, now + 5)
})

test('one shared adventure saved by both devices counts once, with the longer distance', () => {
  const run = (id, meters, finishedAt, startedAt = 1000, family = charmander) =>
    ({ id, family, record: { meters, steps: 0, shiny: true, finishedAt, startedAt } })
  const progress = { runs: [run('phone', 5300, '2026-10-27T08:00:00.000Z'), run('watch', 5600, '2026-10-27T08:05:00.000Z'),
    run('other', 3000, '2026-10-26T08:00:00.000Z', 500), run('old', 2000, '2026-10-25T08:00:00.000Z', null)], unlocked: {} }
  const runs = completedRuns(progress, now)
  assert.deepEqual(runs.map(item => item.id), ['watch', 'other', 'old'])
})
