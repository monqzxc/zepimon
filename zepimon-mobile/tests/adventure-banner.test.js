import test from 'node:test'
import assert from 'node:assert/strict'
import { newOnWatch } from '../src/shared-adventure.ts'

const now = Date.UTC(2026, 9, 27, 8, 0)
const watch = { id: 'watch-1', family: ['Gastly', 'Haunter', 'Gengar'], mega: null, shiny: false, activity: 'running', startedAt: now - 60000,
  device: 'watch', deviceAt: now - 60000, meters: 120, hatchSeconds: null, at: now - 30000, ended: false }

test('a watch adventure is news once, while the watch records it', () => {
  assert.equal(newOnWatch(watch, null, null, now), watch)
  assert.equal(newOnWatch(watch, null, 'watch-1', now), null, 'already announced')
  assert.equal(newOnWatch({ ...watch, id: 'watch-2' }, null, 'watch-1', now)?.id, 'watch-2', 'the next one is news again')
  assert.equal(newOnWatch({ ...watch, ended: true }, null, null, now), null, 'finished')
  assert.equal(newOnWatch({ ...watch, device: 'phone' }, null, null, now), null, 'recorded on this phone')
  assert.equal(newOnWatch({ ...watch, at: now - 13 * 3600000 }, null, null, now), null, 'forgotten on the watch')
  assert.equal(newOnWatch(null, null, null, now), null)
})

test('an adventure the watch took over from this phone is not announced as new', () => {
  assert.equal(newOnWatch(watch, watch, null, now), null)
})
