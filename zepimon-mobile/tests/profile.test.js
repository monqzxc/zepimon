import test from 'node:test'
import assert from 'node:assert/strict'
import { LEVEL_ORDER, bestTimes, checkRun, emptyProfile, levelFor, levelName, levelOffer, newBest, restoreProfile, waitingOffer } from '../src/profile.ts'

let next = 0
// A saved adventure of `meters` that took `elapsedSeconds`. A 5000 to 5500 m run's 5 km effort is its elapsed time, a 10000 m run's 10 km effort too.
const adventure = (meters, elapsedSeconds, extra = {}) => ({ id: `run-${next++}`, family: ['Pidgey'], device: 'phone',
  record: { meters, steps: 0, shiny: false, finishedAt: new Date(Date.UTC(2026, 9, 1 + next)).toISOString(),
    ...elapsedSeconds === undefined ? {} : { elapsedSeconds } }, ...extra })
const min = (m, s = 0) => m * 60 + s

test('levelFor reaches Intermediate under 33:00 or 1:10:00, and Advanced under 26:30 or 1:00:00', () => {
  assert.equal(levelFor({ five: null, ten: null }), 'beginner')
  assert.equal(levelFor({ five: min(33), ten: null }), 'beginner', '33:00 itself is not under 33:00')
  assert.equal(levelFor({ five: min(32, 59), ten: null }), 'intermediate')
  assert.equal(levelFor({ five: null, ten: min(69, 59) }), 'intermediate')
  assert.equal(levelFor({ five: min(26, 30), ten: null }), 'intermediate')
  assert.equal(levelFor({ five: min(26, 29), ten: null }), 'advanced')
  assert.equal(levelFor({ five: null, ten: min(60) }), 'intermediate')
  assert.equal(levelFor({ five: null, ten: min(59, 59) }), 'advanced')
  assert.equal(levelName.advanced, 'Advanced')
  assert.deepEqual(LEVEL_ORDER, ['beginner', 'intermediate', 'advanced'])
})

test('bestTimes takes the fastest 5 km and 10 km across adventures and null where there is none', () => {
  assert.deepEqual(bestTimes([]), { five: null, ten: null })
  assert.deepEqual(bestTimes([adventure(5100, min(30)), adventure(5000, min(27)), adventure(3000, min(15))]), { five: min(27), ten: null })
  assert.deepEqual(bestTimes([adventure(10000, min(64)), adventure(10000, min(61))]).ten, min(61))
})

test('levelOffer offers only the next level, never skips, and nothing without a level', () => {
  const fast = { five: min(25), ten: null }
  assert.equal(levelOffer({ level: 'beginner', declined: null }, fast), 'intermediate', 'a Beginner with an Advanced time is offered one step')
  assert.equal(levelOffer({ level: 'intermediate', declined: null }, fast), 'advanced')
  assert.equal(levelOffer({ level: 'advanced', declined: null }, fast), null)
  assert.equal(levelOffer({ level: 'intermediate', declined: null }, { five: min(28), ten: null }), null, 'Intermediate already')
  assert.equal(levelOffer(emptyProfile, fast), null)
})

test('levelOffer after Not now waits for a better time', () => {
  const profile = { level: 'intermediate', declined: { five: 1580, ten: null } }
  assert.equal(levelOffer(profile, { five: 1580, ten: null }), null, 'the same best again')
  assert.equal(levelOffer(profile, { five: 1570, ten: null }), 'advanced')
  assert.equal(levelOffer(profile, { five: 1580, ten: 3500 }), 'advanced', 'a 10 km time where there was none')
})

test('waitingOffer shows the offer that was put off, whether or not it was beaten again, until it is kept or taken', () => {
  const best = { five: 1580, ten: null }
  assert.equal(waitingOffer({ level: 'intermediate', declined: best, waiting: true }, best), 'advanced')
  assert.equal(waitingOffer({ level: 'intermediate', declined: best, waiting: false }, best), null, 'Keep in Settings hides it')
  assert.equal(waitingOffer({ level: 'intermediate', declined: null, waiting: false }, best), null, 'nothing was put off, so nothing waits')
  assert.equal(waitingOffer({ level: 'advanced', declined: best, waiting: true }, best), null)
})

test('newBest names the distance a run improved and its time, or null when it improved nothing', () => {
  const before = { five: 1620, ten: 3900 }
  assert.deepEqual(newBest({ five: 1560, ten: 3900 }, before), { label: '5 km', seconds: 1560 })
  assert.deepEqual(newBest({ five: 1620, ten: 3800 }, before), { label: '10 km', seconds: 3800 })
  assert.equal(newBest({ five: 1620, ten: 3900 }, before), null, 'the same bests')
  assert.deepEqual(newBest({ five: 1500, ten: null }, { five: null, ten: null }), { label: '5 km', seconds: 1500 }, 'a first time at a distance is a best')
  assert.equal(newBest({ five: null, ten: null }, { five: null, ten: null }), null)
})

test('checkRun flags a 5 km far faster than the player\'s best, and says why', () => {
  const others = [adventure(5000, min(27)), adventure(5200, min(33))]
  const verdict = checkRun(adventure(5000, min(16)), others, 'intermediate')
  assert.deepEqual(verdict, { ok: false, reason: 'history', note: 'Your 5 km took 16:00, much faster than your best of 27:00.' })
})

test('checkRun lets ordinary progress through, and the 10% is a strict "under"', () => {
  const others = [adventure(5000, 1620)]
  assert.deepEqual(checkRun(adventure(5000, min(26)), others, 'intermediate'), { ok: true })
  assert.equal(checkRun(adventure(5000, 1457), others, 'intermediate').ok, false)
  assert.equal(checkRun(adventure(5000, 1458), others, 'intermediate').ok, true)
})

test('checkRun checks a 10 km against the best 10 km', () => {
  const others = [adventure(10000, min(64))]
  const verdict = checkRun(adventure(10000, min(50)), others, 'intermediate')
  assert.equal(verdict.ok, false)
  assert.match(verdict.note, /^Your 10 km took 50:00, much faster than your best of 1:04:00\.$/)
})

test('checkRun never compares a run with itself', () => {
  const run = adventure(5000, min(27))
  assert.deepEqual(checkRun(run, [], 'advanced'), { ok: true })
})

test('checkRun uses the believable pace when there is no earlier effort', () => {
  const sprint = adventure(5000, min(16))
  assert.deepEqual(checkRun(sprint, [], 'beginner'), { ok: false, reason: 'floor', note: 'An average pace of 3:12 /km is much faster than usual for a Beginner.' })
  assert.deepEqual(checkRun(sprint, [], 'advanced'), { ok: true })
  assert.equal(checkRun(adventure(3000, min(9)), [], 'beginner').ok, false, '3:00 /km over 3 km')
})

test('checkRun holds a 3 to 5 km run to the player\'s own 5 km pace once they have one, not the level\'s floor', () => {
  const history = [adventure(5000, min(21))]
  assert.deepEqual(checkRun(adventure(4000, min(16, 40)), history, 'beginner'), { ok: true }, '4:10 /km is under the 4:24 floor but near their 4:12 best')
  const verdict = checkRun(adventure(4000, min(13)), history, 'beginner')
  assert.deepEqual(verdict, { ok: false, reason: 'history', note: 'An average pace of 3:15 /km is much faster than your best 5 km pace of 4:12 /km.' })
})

test('the floor note says "an" before Intermediate and Advanced and "a" before Beginner', () => {
  assert.match(checkRun(adventure(5000, min(12)), [], 'intermediate').note, /for an Intermediate\.$/)
  assert.match(checkRun(adventure(5000, min(10)), [], 'advanced').note, /for an Advanced\.$/)
  assert.match(checkRun(adventure(5000, min(16)), [], 'beginner').note, /for a Beginner\.$/)
})

test('checkRun never checks under 3 km or a profile with no level', () => {
  assert.deepEqual(checkRun(adventure(2900, min(5)), [], 'beginner'), { ok: true })
  assert.deepEqual(checkRun(adventure(5000, min(16)), [adventure(5000, min(27))], null), { ok: true })
})

test('checkRun trusts a run it cannot time and a watch run with no pace log', () => {
  assert.deepEqual(checkRun(adventure(5000, undefined), [adventure(5000, min(27))], 'beginner'), { ok: true })
  assert.deepEqual(checkRun({ ...adventure(5000, min(27)), device: 'watch' }, [], 'beginner'), { ok: true })
})

test('restoreProfile reads back what a JSON round trip saved and gives the empty profile for anything else', () => {
  const profile = { level: 'advanced', declined: { five: 1580, ten: null }, waiting: true }
  assert.deepEqual(restoreProfile(JSON.parse(JSON.stringify(profile))), profile)
  for (const bad of [undefined, null, 'x', 3, [], { level: 'expert' }]) assert.deepEqual(restoreProfile(bad), emptyProfile)
  assert.deepEqual(restoreProfile({ level: 'beginner', declined: { five: -1, ten: 'x' } }), { level: 'beginner', declined: { five: null, ten: null }, waiting: false })
  assert.deepEqual(restoreProfile({ level: 'beginner', declined: 5, waiting: true }), { level: 'beginner', declined: null, waiting: false }, 'nothing waits without a declined offer')
  assert.deepEqual(restoreProfile({ level: 'beginner' }), { level: 'beginner', declined: null, waiting: false }, 'a save from before the flag')
})
