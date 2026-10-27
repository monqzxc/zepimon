import test from 'node:test'
import assert from 'node:assert/strict'
import { eggOf, restorePlan, withEgg, withPhone } from '../src/plan.ts'
import { validatePlan } from '../src/generated/companion.js'

const charmander = ['Charmander', 'Charmeleon', 'Charizard']

test('choosing an egg makes a plan the watch accepts, and every change is newer than the last', () => {
  const chosen = withEgg(null, charmander, 'Mega Charizard Y', 1000)
  assert.deepEqual(chosen, { egg: { family: charmander, mega: 'Mega Charizard Y' }, eggAt: 1000, phone: null, updatedAt: 1000 })
  assert.deepEqual(validatePlan(JSON.parse(JSON.stringify(chosen))), chosen, 'The watch contract accepts it unchanged')
  const later = withEgg(chosen, ['Eevee'], 'Mega Charizard X', 500)
  assert.equal(later.updatedAt, 1001, 'A clock that steps back still moves the plan forward')
  assert.equal(later.egg.mega, null, 'A Mega from another family is dropped')
})

test('recording on the phone uses up the chosen egg; finishing clears it', () => {
  const chosen = withEgg(null, charmander, null, 1000)
  const recording = withPhone(chosen, { family: charmander, activity: 'running', startedAt: 2000 }, 2000)
  assert.equal(recording.egg, null, 'The watch stops offering an egg the phone took')
  assert.equal(recording.phone.activity, 'running')
  assert.deepEqual(validatePlan(JSON.parse(JSON.stringify(recording))), recording)
  const done = withPhone(recording, null, 3000)
  assert.equal(done.phone, null)
  assert.equal(done.updatedAt, 3000)
})

test('saved plans are checked, and the Dex finds the egg a Pokemon hatches from', () => {
  assert.equal(restorePlan(undefined), null)
  assert.equal(restorePlan({ updatedAt: 1, egg: { family: [] }, eggAt: 1 }), null, 'A damaged plan is dropped')
  assert.deepEqual(eggOf('Charmeleon'), { family: charmander, mega: null })
  assert.deepEqual(eggOf('Shiny Mega Charizard X'), { family: charmander, mega: 'Mega Charizard X' })
  assert.equal(eggOf('Mewtwo'), null, 'Expedition Legendaries do not come from eggs')
})
