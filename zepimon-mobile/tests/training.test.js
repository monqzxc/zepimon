import test from 'node:test'
import assert from 'node:assert/strict'
import { clockText, gyms, sessionMeters, sessionSeconds, sessionsOf } from '../src/training-plans.ts'
import { canSkip, countSession, countStarted, currentWeek, dayStart, daysAway, decline, emptyTraining, goBack, isOpen, matchCandidates,
  nextSession, pause, progressOf, restoreTraining, resume, skipSession, startPlan, unlockAt, warmth, welcomeBack } from '../src/training.ts'

const egg = ['Pichu', 'Pikachu', 'Raichu']
const start = new Date(2026, 10, 2, 7, 0).getTime() // a Monday morning, local time
const day = 864e5
const at = (days, hour = 7) => new Date(2026, 10, 2 + days, hour, 0).getTime()
let next = 0
const adventure = (startedAt, minutes, meters, family = ['Eevee', 'Vaporeon']) => ({ id: `run-${next++}`, family,
  record: { meters, steps: 0, shiny: false, startedAt, finishedAt: new Date(startedAt + minutes * 60e3).toISOString(), elapsedSeconds: minutes * 60 } })
const begin = gym => startPlan(emptyTraining(), gym, egg, null, start)

test('the plans match the spec tables', () => {
  const walks = gyms['steady-steps'].weeks.map(week => week.map(item => item.kind === 'graduation' ? 'hatch' : sessionSeconds(item) / 60))
  assert.deepEqual(walks, [[20, 20, 25], [25, 25, 30], [30, 30, 35], [30, 35, 40], [35, 40, 50], [30, 40, 'hatch']])
  const hatch = sessionsOf('first-hatch')
  assert.equal(hatch.length, 24)
  assert.equal(sessionSeconds(hatch[0]) / 60, 5 + 8 * 3 + 5, 'week 1: 8 × (1 jog, 2 walk) between 5 min walks')
  assert.equal(sessionSeconds(hatch[22]) / 60, 40, 'week 8 session 2: 30 min jog plus the walks')
  for (const id of ['steady-steps', 'first-hatch']) {
    const all = sessionsOf(id)
    assert.equal(all.at(-1).kind, 'graduation')
    assert.equal(sessionMeters(all.at(-1)), 5000)
    assert.equal(all.filter(item => item.kind === 'graduation').length, 1)
    assert.equal(new Set(all.map(item => item.id)).size, all.length)
    for (const item of all) assert.ok(item.steps.length && item.steps.every(s => (s.seconds > 0) !== (s.meters > 0)), item.id)
  }
  assert.ok(sessionsOf('steady-steps').every(item => item.kind === 'graduation' || !item.hard), 'walks can be on back-to-back days')
  assert.ok(sessionsOf('first-hatch').every(item => item.hard))
  assert.deepEqual([clockText(1), clockText(1.5), clockText(2), clockText(0.5)], ['1 min', '90 s', '2 min', '30 s'])
})

test('one session a day, and a rest day between hard sessions', () => {
  let training = begin('first-hatch')
  assert.equal(unlockAt(training.active), start)
  training = countSession(training, adventure(at(0), 34, 3000), at(0, 9))
  assert.equal(nextSession(training.active).id, 'first-hatch-w1-s2')
  assert.equal(unlockAt(training.active), dayStart(at(0), 2), 'run/walk is hard: the next opens the day after tomorrow')
  assert.equal(isOpen(training.active, at(1)), false)
  assert.equal(isOpen(training.active, at(2)), true)
  assert.throws(() => countSession(training, adventure(at(1), 34, 3000), at(1, 9)), /before this session opened/)

  let walks = begin('steady-steps')
  walks = countSession(walks, adventure(at(0), 21, 1800), at(0, 9))
  assert.equal(unlockAt(walks.active), dayStart(at(0), 1), 'walks only need a new day')
  assert.throws(() => countSession(walks, adventure(at(0, 18), 21, 1800), at(0, 19)), /before this session opened/)
})

test('a session needs 90% of its time; the graduation needs the plan egg over 5 km', () => {
  let training = begin('steady-steps')
  assert.throws(() => countSession(training, adventure(at(0), 17, 1500), at(0, 9)), /not enough/)
  training = countSession(training, adventure(at(0), 18, 1500), at(0, 9))
  // Jump to Hatch Day.
  for (const item of sessionsOf('steady-steps').slice(1, -1)) training.active.done[item.id] = { at: at(0), adventureId: null }
  const hatch = nextSession(training.active)
  assert.equal(hatch.kind, 'graduation')
  assert.throws(() => countSession(training, adventure(at(2), 70, 6000), at(2, 9)), /not enough/, 'another egg does not graduate')
  assert.throws(() => countSession(training, adventure(at(2), 70, 4990, egg), at(2, 9)), /not enough/, 'nor 4.99 km')
  const done = countSession(training, adventure(at(2), 70, 5000, egg), at(2, 9))
  assert.equal(done.active, null)
  assert.equal(done.badges['steady-steps'].warm, true, 'nothing skipped: Warm Welcome')
})

test('watch adventures are offered as matches, never counted on their own', () => {
  let training = begin('steady-steps')
  const early = adventure(start - day, 30, 2000)
  const short = adventure(at(0, 8), 10, 800)
  const good = adventure(at(0, 9), 25, 2000)
  const later = adventure(at(0, 18), 25, 2000)
  const list = [later, early, short, good]
  assert.deepEqual(matchCandidates(training, list, at(1)).map(item => item.id), [good.id, later.id])
  training = decline(training, good.id)
  assert.deepEqual(matchCandidates(training, list, at(1)).map(item => item.id), [later.id])
  training = countSession(training, later, at(1))
  assert.deepEqual(matchCandidates(training, list, at(2)), [], 'a counted adventure is used up, and the next opens tomorrow')
  assert.throws(() => countSession(training, later, at(2)), /before this session opened|already counted/)
})

test('a phone adventure started for the session counts as it is saved', () => {
  const training = begin('first-hatch')
  const run = adventure(at(0), 35, 3200)
  assert.equal(nextSession(countStarted(training, run, 'first-hatch-w1-s1', at(0, 9)).active).id, 'first-hatch-w1-s2')
  assert.equal(countStarted(training, adventure(at(0), 10, 900), 'first-hatch-w1-s1', at(0, 9)), training, 'stopped early: not counted')
  assert.equal(countStarted(training, run, 'first-hatch-w2-s1', at(0, 9)), training, 'a session that is not next')
  assert.equal(countStarted(training, run, undefined, at(0, 9)), training)
})

test('one skip a week, never the graduation, and skips give no warmth', () => {
  let training = begin('steady-steps')
  assert.equal(canSkip(training.active), true)
  training = skipSession(training, at(0))
  assert.equal(canSkip(training.active), false, 'one a week')
  assert.throws(() => skipSession(training, at(0)))
  assert.equal(warmth(training.active), 0)
  assert.equal(unlockAt(training.active), start, 'a skip needs no rest')
  for (const item of sessionsOf('steady-steps').slice(1, -1)) training.active.done[item.id] = { at: at(0), adventureId: `x-${item.id}` }
  assert.equal(canSkip(training.active), false, 'the graduation cannot be skipped')
  assert.ok(warmth(training.active) < 1)
  const done = countSession(training, adventure(at(2), 70, 5200, egg), at(2, 9))
  assert.equal(done.badges['steady-steps'].warm, false)
})

test('going back a week, pausing, and the welcome back after time away', () => {
  let training = begin('first-hatch')
  for (const item of sessionsOf('first-hatch').slice(0, 13)) training.active.done[item.id] = { at: at(20), adventureId: `x-${item.id}` }
  assert.equal(currentWeek(training.active), 4)
  assert.deepEqual(progressOf(training.active), { done: 13, total: 24 })
  const back = goBack(training, 1)
  assert.equal(nextSession(back.active).id, 'first-hatch-w4-s1', 'week 5 has its own session done; back to the start of week 4')
  assert.equal(welcomeBack(training.active, at(25)), 0)
  assert.equal(welcomeBack(training.active, at(31)), 1)
  assert.equal(welcomeBack(training.active, at(42)), 2)
  training = pause(training, at(21))
  assert.equal(isOpen(training.active, at(40)), false, 'paused')
  assert.equal(daysAway(training.active, at(41)), 1, 'only the day before the pause counts as time away')
  training = resume(training, at(41))
  assert.equal(daysAway(training.active, at(45)), 5)
  // Pauses count for at most 28 days.
  const long = resume(pause(begin('first-hatch'), start), start + 60 * day)
  assert.equal(long.active.pausedMs, 28 * day)
})

test('saved training is read back safely', () => {
  let training = countSession(begin('first-hatch'), adventure(at(0), 34, 3000), at(0, 9))
  training = { ...training, badges: { 'steady-steps': { at: start, adventureId: 'a', warm: true }, nope: { at: 1, adventureId: 'b' } }, declined: ['z', 3] }
  const restored = restoreTraining(JSON.parse(JSON.stringify(training)))
  assert.deepEqual(restored.active, training.active)
  assert.deepEqual(Object.keys(restored.badges), ['steady-steps'])
  assert.deepEqual(restored.declined, ['z'])
  assert.deepEqual(restoreTraining({ active: { gym: 'mystery', startedAt: 1, egg: { family: egg } } }).active, null)
  assert.deepEqual(restoreTraining(null), emptyTraining())
  assert.deepEqual(restoreTraining({ active: { ...training.active, done: { 'first-hatch-w9-s9': { at: 1, adventureId: 'x' } } } }).active.done, {})
  assert.throws(() => startPlan(training, 'steady-steps', egg, null, start), /Finish or quit/)
})
