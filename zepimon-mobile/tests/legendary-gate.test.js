import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyExpeditions } from '../src/expeditions.ts'
import { emptyQuest } from '../src/expedition-quest.ts'
import { emptyProgress } from '../src/progress.ts'
import { expeditionEncounter, expeditionKey } from '../src/generated/expedition.js'
import { trialFor } from '../src/games/trials.ts'
import { gateStatus, waitingEncounters } from '../src/legendary-gate.ts'

const START = Date.UTC(2026, 9, 1)
const NOW = Date.UTC(2026, 9, 28)
const trail = (meters, claimed = 0, seed = 7, startedAt = START) => ({ seed, startedAt, meters, claimed })
const keyOf = value => expeditionKey(value)
const withTrails = (...trails) => ({ ...emptyExpeditions(), trails: Object.fromEntries(trails.map(value => [keyOf(value), value])) })
const friend = (name, shiny, day) => ({ meters: 25000, steps: 0, shiny, form: name, source: 'expedition', finishedAt: new Date(Date.UTC(2026, 9, day)).toISOString() })
// A completed saved walk, as progress.runs holds it.
const run = (day, meters = 1500) => ({ id: `run-${day}`, family: ['Pidgey'], record: { meters, steps: 100, shiny: false, form: 'Pidgey',
  startedAt: Date.UTC(2026, 9, day) - 3600000, finishedAt: new Date(Date.UTC(2026, 9, day)).toISOString() } })

test('the waiting count is every trail’s opened encounters not yet claimed, counting permits', () => {
  assert.equal(waitingEncounters(emptyExpeditions(), emptyQuest()), 0)
  const a = trail(60000, 1), b = trail(30000, 0, 9)
  assert.equal(waitingEncounters(withTrails(a, b), emptyQuest()), 2, '50 km opens two on a, one claimed; 25 km opens one on b')
  const quest = { ...emptyQuest(), unlocks: { [keyOf(b)]: 1 } }
  assert.equal(waitingEncounters(withTrails(a, b), quest), 3, 'A permit opens one more')
})

test('waiting: the next Legendary is named, unrevealed Shiny and all, with where it waits', () => {
  const open = trail(26000)
  const { name } = expeditionEncounter(open, 0)
  const status = gateStatus(withTrails(open), emptyQuest(), emptyProgress(), NOW)
  assert.equal(status.state, 'waiting')
  assert.equal(status.name, name)
  assert.equal(status.shiny, false, 'The chamber reveals a Shiny, never the gate')
  assert.equal(status.waiting, 1)
  assert.equal(status.line, `${name} is waiting at ${trialFor(name, {}).title}`)
  const two = gateStatus(withTrails(trail(60000)), emptyQuest(), emptyProgress(), NOW)
  assert.equal(two.waiting, 2)
  assert.match(two.line, / · 2 encounters waiting$/)
})

test('waiting wins over a permit in hand, and a permit-opened encounter counts as waiting', () => {
  const short = trail(4000)
  const opened = gateStatus(withTrails(short), { ...emptyQuest(), unlocks: { [keyOf(short)]: 1 } }, emptyProgress(), NOW)
  assert.equal(opened.state, 'waiting')
  assert.equal(gateStatus(withTrails(trail(26000)), { ...emptyQuest(), permits: 2 }, emptyProgress(), NOW).state, 'waiting')
})

test('permit: a permit in hand, or a finished quest ready to claim one, opens the gate', () => {
  const walked = trail(26000, 1)
  const expeditions = { ...withTrails(walked), dex: { Rayquaza: friend('Rayquaza', false, 5), 'Shiny Zapdos': friend('Zapdos', true, 9) } }
  const held = gateStatus(expeditions, { ...emptyQuest(), permits: 1 }, emptyProgress(), NOW)
  assert.equal(held.state, 'permit')
  assert.equal(held.line, 'Permit ready — open the gate')
  assert.deepEqual([held.name, held.shiny], ['Zapdos', true], 'The last Legendary caught stands in the gate')

  const done = { ...emptyQuest(), challenge: true }
  const progress = { ...emptyProgress(), runs: [run(10), run(11), run(12)] }
  assert.equal(gateStatus(expeditions, done, progress, NOW).state, 'permit', 'Three sessions and the shrine challenge earn one')
  assert.equal(gateStatus(expeditions, done, { ...emptyProgress(), runs: [run(10), run(11)] }, NOW).state, 'walking', 'Two sessions are not enough')
  assert.equal(gateStatus(expeditions, emptyQuest(), progress, NOW).state, 'walking', 'Nor sessions without the challenge')
})

test('walking: the distance left to the next encounter, from the newest trail', () => {
  const status = gateStatus(withTrails(trail(22000)), emptyQuest(), emptyProgress(), NOW)
  assert.equal(status.state, 'walking')
  assert.equal(status.line, '3 km to your next encounter')
  assert.equal(status.remaining, 3000)
  assert.equal(status.name, null, 'Nothing caught yet, so the gate shows no Legendary')
  assert.equal(gateStatus(withTrails(trail(23400)), emptyQuest(), emptyProgress(), NOW).line, '1.6 km to your next encounter')
  assert.equal(gateStatus(withTrails(trail(24990)), emptyQuest(), emptyProgress(), NOW).line, '0.1 km to your next encounter', 'Never rounds down to 0 km')
  const older = trail(10000, 0, 3, START - 1000), newer = trail(49000, 1, 4)
  assert.equal(gateStatus(withTrails(older, newer), emptyQuest(), emptyProgress(), NOW).line, '1 km to your next encounter')
})

test('none: no trail yet', () => {
  const status = gateStatus(emptyExpeditions(), emptyQuest(), emptyProgress(), NOW)
  assert.deepEqual(status, { state: 'none', name: null, shiny: false, line: 'Save an adventure to find the gate’s first clue', waiting: 0, remaining: 0 })
  // A permit means nothing without a trail to spend it on.
  assert.equal(gateStatus(emptyExpeditions(), { ...emptyQuest(), permits: 1 }, emptyProgress(), NOW).state, 'none')
})

test('gateStatus only reads: nothing passed in is changed', () => {
  const expeditions = withTrails(trail(26000), trail(5000, 0, 11))
  const quest = { ...emptyQuest(), permits: 1 }
  const progress = { ...emptyProgress(), runs: [run(10)] }
  const before = JSON.stringify([expeditions, quest, progress])
  gateStatus(expeditions, quest, progress, NOW)
  assert.equal(JSON.stringify([expeditions, quest, progress]), before)
})
