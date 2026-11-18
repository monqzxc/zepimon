import test from 'node:test'
import assert from 'node:assert/strict'
import { VIBRATE, buzzFor, cueAt, remainingText, spokenCue } from '../src/training-cues.ts'
import { sessionsOf } from '../src/training-plans.ts'

const startedAt = 1_800_000_000_000
const firstRun = sessionsOf('first-hatch')[0] // 5 walk, 8 × (1 jog, 2 walk), 5 walk
const hatchDay = sessionsOf('first-hatch').at(-1)
// A steady 6 min/km: a mark every 36 s.
const steady = (marks, start = 0) => ({ start, at: Array.from({ length: marks }, (_, i) => i * 36), moving: Array.from({ length: marks }, (_, i) => i * 36) })
const recorded = (seconds, meters = seconds / 0.36) => ({ startedAt, meters, pace: steady(Math.floor(meters / 100) + 1) })
const at = seconds => startedAt + seconds * 1000

test('timed steps follow the clock', () => {
  const warm = cueAt(firstRun, recorded(60), at(60))
  assert.deepEqual([warm.index, warm.step.kind, warm.remainingSeconds, warm.next.kind], [0, 'warmup', 240, 'jog'])
  const jog = cueAt(firstRun, recorded(330), at(330))
  assert.deepEqual([jog.index, jog.step.kind, jog.remainingSeconds], [1, 'jog', 30])
  const walk = cueAt(firstRun, recorded(360), at(360))
  assert.deepEqual([walk.index, walk.step.kind, walk.remainingSeconds], [2, 'walk', 120])
  const cool = cueAt(firstRun, recorded(29 * 60 + 1), at(29 * 60 + 1))
  assert.equal(cool.step.kind, 'cooldown')
  const done = cueAt(firstRun, recorded(34 * 60), at(34 * 60))
  assert.equal(done.done, true)
  assert.equal(done.total, 18)
})

test('a measured step follows the distance', () => {
  const half = cueAt(hatchDay, recorded(900, 2500), at(900))
  assert.deepEqual([half.done, half.remainingMeters, half.remainingSeconds], [false, 2500, null])
  assert.equal(remainingText(half), '2.50 km')
  assert.equal(remainingText(cueAt(hatchDay, recorded(1700, 4960), at(1700))), '40 m')
  assert.equal(cueAt(hatchDay, recorded(1800, 5000), at(1800)).done, true)
})

test('a measured step after a timed one starts from the distance reached then', () => {
  const session = { ...firstRun, steps: [{ kind: 'warmup', seconds: 360 }, { kind: 'run', meters: 1000 }, { kind: 'cooldown', seconds: 120 }] }
  // 6 min of warm-up at 6 min/km reaches 1 km; the run step then ends at 2 km.
  const run = cueAt(session, recorded(500, 1400), at(500))
  assert.deepEqual([run.step.kind, Math.round(run.remainingMeters)], ['run', 600])
  const cool = cueAt(session, recorded(780, 2166), at(780))
  assert.equal(cool.step.kind, 'cooldown')
  assert.ok(Math.abs(cool.remainingSeconds - 60) < 1, 'the cool-down runs from when 2 km was reached (720 s)')
})

test('buzzes: two pulses into an effort, one into a walk, a tap before a change, a fanfare at the end', () => {
  const cue = seconds => cueAt(firstRun, recorded(seconds), at(seconds))
  assert.equal(buzzFor(null, cue(10)), null)
  assert.equal(buzzFor(cue(100), cue(101)), null)
  assert.deepEqual(buzzFor(cue(289), cue(291)), VIBRATE.warning)
  assert.equal(buzzFor(cue(291), cue(292)), null, 'the warning taps once')
  assert.deepEqual(buzzFor(cue(299), cue(301)), VIBRATE.effort)
  assert.deepEqual(buzzFor(cue(359), cue(361)), VIBRATE.easy)
  assert.deepEqual(buzzFor(cue(34 * 60 - 1), cue(34 * 60 + 1)), VIBRATE.done)
})

test('what a screen reader hears', () => {
  assert.equal(spokenCue(cueAt(firstRun, recorded(301), at(301))), 'Jog for 1 minute. Then walk.')
  const second = sessionsOf('first-hatch')[3] // 6 × (90 s jog, 2 min walk)
  assert.equal(spokenCue(cueAt(second, recorded(301), at(301))), 'Jog for 90 seconds. Then walk.')
  assert.equal(spokenCue(cueAt(hatchDay, recorded(10, 20), at(10))), 'Run for 5 kilometres.')
  assert.equal(spokenCue(cueAt(hatchDay, recorded(1800, 5000), at(1800))), 'Session complete. Great work!')
})
