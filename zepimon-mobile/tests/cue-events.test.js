import test from 'node:test'
import assert from 'node:assert/strict'
import { VIBRATE, advanceMarks, cueAt, markSpans } from '../src/training-cues.ts'
import { cueEvents, spokenTime } from '../src/cue-events.ts'
import { sessionsOf } from '../src/training-plans.ts'
import { scoreStars, startPlan, emptyTraining } from '../src/training.ts'

const startedAt = 1_800_000_000_000
const firstRun = sessionsOf('first-hatch')[0] // 5 walk, 8 × (1 jog, 2 walk), 5 walk
const repeats = sessionsOf('speed-gym')[0] // 2 km warm-up, 6 × 400 m fast with 90 s jogs, 1.5 km cool-down
const at = seconds => startedAt + seconds * 1000
const steady = seconds => ({ startedAt, meters: seconds / 0.36, pace: { start: 0, at: [0], moving: [0] } })
const timed = session => index => !!session.steps[index]?.seconds

// Runs a session fix by fix: `fixes` is a list of [seconds, metres].
function walkMarks(session, fixes) {
  let marks = []
  for (let i = 1; i < fixes.length; i++) {
    marks = advanceMarks(session, marks, { seconds: fixes[i - 1][0], meters: fixes[i - 1][1] }, { seconds: fixes[i][0], meters: fixes[i][1] })
  }
  return marks
}

test('step marks land on the exact second of a timed step and the exact metre of a measured one', () => {
  // Fixes every 3 s at 3 m/s.
  const fixes = Array.from({ length: 700 }, (_, i) => [i * 3, i * 9])
  const marks = walkMarks(firstRun, fixes)
  assert.deepEqual(marks[1], [1, 300, 900], 'the warm-up ends at 300 s, at 900 m')
  assert.deepEqual(marks[2].slice(0, 2), [2, 360])
  const half = walkMarks(repeats, Array.from({ length: 400 }, (_, i) => [i * 2.5, i * 10]))
  assert.deepEqual(half[1], [1, 500, 2000], 'the 2 km warm-up ends at 2,000 m, at 500 s')
  assert.deepEqual(half[2], [2, 600, 2400], 'the first 400 m ends at 2,400 m')
  assert.equal(half[3][1], 690, 'the 90 s jog')
  assert.equal(markSpans(repeats, half)[1].step.kind, 'interval')
})

test('a boundary between two fixes is placed by interpolation, and several can be crossed at once', () => {
  const marks = advanceMarks(firstRun, [], { seconds: 0, meters: 0 }, { seconds: 480, meters: 1600 })
  assert.deepEqual(marks.map(mark => mark[0]), [0, 1, 2, 3], 'warm-up, a jog and a walk ended between two far-apart fixes')
  assert.deepEqual(marks[1], [1, 300, 1000])
  assert.deepEqual(marks[3], [3, 480, 1600])
})

test('the cue follows the marks once they exist', () => {
  const marks = [[0, 0, 0], [1, 300, 900]]
  const cue = cueAt(firstRun, steady(330), at(330), marks)
  assert.deepEqual([cue.index, cue.step.kind, cue.remainingSeconds], [1, 'jog', 30])
  assert.equal(cueAt(firstRun, steady(2100), at(2100), [[0, 0, 0], [18, 2040, 6000]]).done, true)
})

test('alerts: spoken on first sight, buzzed and spoken once per change, a tap before it', () => {
  const options = { native: false, splits: false }
  const cue = seconds => cueAt(firstRun, steady(seconds), at(seconds))
  let events = cueEvents(null, startedAt, cue(10), 30, 10, options, timed(firstRun))
  assert.deepEqual([events.buzz, events.speech], [null, ['Warm-up walk for 5 minutes. Then jog.']])
  events = cueEvents(events.state, startedAt, cue(11), 33, 11, options, timed(firstRun))
  assert.deepEqual([events.buzz, events.speech, events.changed], [null, [], false])
  events = cueEvents(events.state, startedAt, cue(291), 800, 291, options, timed(firstRun))
  assert.deepEqual(events.buzz, VIBRATE.warning)
  events = cueEvents(events.state, startedAt, cue(292), 803, 292, options, timed(firstRun))
  assert.equal(events.buzz, null, 'the tap comes once')
  events = cueEvents(events.state, startedAt, cue(301), 830, 301, options, timed(firstRun))
  assert.deepEqual([events.buzz, events.speech, events.changed], [VIBRATE.effort, ['Jog for 1 minute. Then walk.'], true])
  events = cueEvents(events.state, startedAt, cue(301.5), 832, 301.5, options, timed(firstRun))
  assert.deepEqual([events.buzz, events.speech], [null, []], 'the screen and the GPS task asking again changes nothing')
  events = cueEvents(events.state, startedAt, cue(361), 1000, 361, options, timed(firstRun))
  assert.deepEqual(events.buzz, VIBRATE.easy)
  const done = cueEvents(events.state, startedAt, cue(2041), 6000, 2041, options, timed(firstRun))
  assert.deepEqual([done.buzz, done.speech], [VIBRATE.done, ['Session complete. Great work!']])
  const another = cueEvents(done.state, startedAt + 1, cue(10), 30, 10, options, timed(firstRun))
  assert.equal(another.speech.length, 1, 'a new adventure starts fresh')
})

test('on Android the notification buzzes timed steps on the second, so the app does not buzz them again', () => {
  const options = { native: true, splits: false }
  const cue = seconds => cueAt(firstRun, steady(seconds), at(seconds))
  let events = cueEvents(null, startedAt, cue(10), 30, 10, options, timed(firstRun))
  events = cueEvents(events.state, startedAt, cue(291), 800, 291, options, timed(firstRun))
  assert.equal(events.buzz, null, 'the native tap before a timed step ends')
  events = cueEvents(events.state, startedAt, cue(301), 830, 301, options, timed(firstRun))
  assert.deepEqual([events.buzz, events.speech.length], [null, 1], 'still spoken')
  // A measured step ends with a GPS fix, so the app buzzes it.
  const fast = seconds => cueAt(repeats, { startedAt, meters: seconds * 4, pace: { start: 0, at: [0], moving: [0] } }, at(seconds))
  let measured = cueEvents(null, startedAt, fast(400), 1600, 400, options, timed(repeats))
  measured = cueEvents(measured.state, startedAt, fast(501), 2004, 501, options, timed(repeats))
  assert.deepEqual(measured.buzz, VIBRATE.effort)
})

test('kilometre splits are spoken when switched on', () => {
  const options = { native: false, splits: true }
  const cue = seconds => cueAt(firstRun, steady(seconds), at(seconds))
  let events = cueEvents(null, startedAt, cue(10), 30, 10, options, timed(firstRun))
  events = cueEvents(events.state, startedAt, cue(200), 1002, 342, options, timed(firstRun))
  assert.deepEqual(events.speech, ['Kilometre 1, 5 minutes 32 seconds.'])
  const quiet = cueEvents(null, startedAt, cue(10), 30, 10, { native: false, splits: false }, timed(firstRun))
  assert.deepEqual(cueEvents(quiet.state, startedAt, cue(200), 1002, 342, { native: false, splits: false }, timed(firstRun)).speech, [])
  assert.equal(spokenTime(61), '1 minute 1 second')
  assert.equal(spokenTime(300), '5 minutes')
})

test('with marks, stars judge 400 m repeats to 3%', () => {
  const plan = startPlan(emptyTraining(), 'speed-gym', ['Eevee'], null, startedAt, 1500).active
  // A fix every 2 s. Warm-up at 6:30, repeats at `pace`, 90 s jogs at 7:00, cool-down at 6:30.
  function run(pace) {
    const fixes = [[0, 0]]
    const go = (meters, secondsPerKm) => {
      const [s0, m0] = fixes.at(-1)
      const seconds = meters / 1000 * secondsPerKm
      for (let t = 2; t <= seconds + 1e-9; t += 2) fixes.push([s0 + t, m0 + meters * t / seconds])
      if (fixes.at(-1)[1] < m0 + meters) fixes.push([s0 + seconds, m0 + meters])
    }
    go(2000, 390)
    for (let i = 0; i < 6; i++) { go(400, typeof pace === 'function' ? pace(i) : pace); go(90 / 420 * 1000, 420) }
    go(1500, 390)
    const [seconds, meters] = fixes.at(-1)
    const marks = walkMarks(repeats, fixes)
    return { id: 'phone-1', family: ['Eevee'], training: { marks }, pace: { start: 0, at: [0], moving: [0] },
      record: { meters: Math.floor(meters), steps: 0, shiny: false, startedAt, finishedAt: new Date(startedAt + seconds * 1000).toISOString(), elapsedSeconds: seconds } }
  }
  assert.equal(scoreStars(repeats, plan, run(296)), 3)
  assert.equal(scoreStars(repeats, plan, run(270)), 1, '9% too fast now loses the stars')
  assert.equal(scoreStars(repeats, plan, run(i => i < 4 ? 296 : 330)), 2)
})
