import test from 'node:test'
import assert from 'node:assert/strict'
import { gyms, sessionMeters, sessionsOf } from '../src/training-plans.ts'
import { countSession, emptyTraining, entryCheck, evenHalves, meetsSession, paceZones, planSessions, refreshOffer, riegel, setRunWalk,
  startPlan, suggestGym, takesBreaks, unlockAt, dayStart } from '../src/training.ts'
import { cueAt, spokenCue, walkBreak } from '../src/training-cues.ts'
import { cueEvents } from '../src/cue-events.ts'

const day = 864e5
const at = (days, hour = 7) => new Date(2026, 10, 2 + days, hour, 0).getTime()
const start = at(0)
const egg = ['Charmander', 'Charmeleon', 'Charizard']
let next = 0
function simulate(startedAt, segments, family = ['Eevee', 'Vaporeon']) {
  const marks = [0]
  let meters = 0, seconds = 0
  for (const segment of segments) {
    const end = meters + segment.meters
    while (marks.length * 100 <= end + 1e-9) marks.push(seconds + (marks.length * 100 - meters) / 1000 * segment.pace)
    seconds += segment.meters / 1000 * segment.pace
    meters = end
  }
  return { id: `phone-${next++}`, family, pace: { start: 0, at: marks, moving: marks },
    record: { meters: Math.floor(meters), steps: 0, shiny: false, activity: 'running', startedAt, finishedAt: new Date(startedAt + seconds * 1000).toISOString(),
      elapsedSeconds: Math.round(seconds) } }
}
const steady = (startedAt, km, pace, family) => simulate(startedAt, [{ meters: km * 1000, pace }], family)
const fill = (training, upto) => {
  for (const item of planSessions(training.active).slice(0, upto)) training.active.done[item.id] = { at: at(0), adventureId: `x-${item.id}`, stars: 3 }
  return training
}

test('the marathon and the ultra match the spec', () => {
  const total = id => gyms[id].weeks.map(week => Math.round(week.reduce((sum, item) => sum + sessionMeters(item), 0) / 1000))
  assert.deepEqual(total('dynamax-marathon'), [34, 37, 42, 35, 48, 55, 59, 46, 61, 67, 68, 54, 71, 65, 47, 61])
  assert.deepEqual(total('gigantamax-ultra'), [62, 66, 73, 55, 76, 81, 85, 61, 90, 86, 62, 69])
  for (const id of ['dynamax-marathon', 'gigantamax-ultra']) {
    const weeks = total(id)
    for (let i = 1; i < weeks.length - 1; i++) assert.ok(weeks[i] <= Math.max(...weeks.slice(0, i)) * 1.15 + 1e-9, `${id} week ${i + 1}`)
  }
  assert.deepEqual(gyms['dynamax-marathon'].weeks.map(week => week.length), [4, 4, 4, 4, ...Array(11).fill(5), 4])
  const longs = sessionsOf('dynamax-marathon').filter(item => item.kind === 'long')
  assert.equal(Math.max(...longs.map(sessionMeters)), 32000, 'long runs stop at 32 km')
  assert.ok(longs.every(item => item.capSeconds === 195 * 60))
  assert.ok(sessionsOf('gigantamax-ultra').filter(item => item.kind === 'long').every(item => item.capSeconds === 270 * 60))
  assert.equal(Math.max(...sessionsOf('gigantamax-ultra').filter(item => item.kind === 'long').map(sessionMeters)), 38000)
  for (const item of sessionsOf('gigantamax-ultra').filter(item => item.kind === 'backtoback')) {
    assert.equal(sessionsOf('gigantamax-ultra').find(other => other.id === item.pairedWith).kind, 'long', 'every back-to-back follows a long run')
  }
  assert.equal(gyms['dynamax-marathon'].graduationMeters, 42195)
  assert.equal(gyms['gigantamax-ultra'].graduationMeters, 50000)
})

test('marathon pace and the marathon estimate, from a 25:00 5 km', () => {
  const zones = paceZones(1500)
  assert.deepEqual(zones.marathon.map(Math.round), [336, 348])
  assert.ok(Math.abs(zones.marathonEstimate - 14387) < 30, 'about 4:00 (3:59:47)')
  assert.ok(Math.abs(riegel(riegel(1500, 5, 21.0975), 21.0975, 5) - 1500) < 1e-6)
})

test('a long run counts at its time cap, a graduation never does', () => {
  const plan = startPlan(emptyTraining(), 'dynamax-marathon', egg, null, start, 1500).active
  const long = sessionsOf('dynamax-marathon').find(item => item.kind === 'long' && sessionMeters(item) === 32000)
  const slow = steady(at(1), 27, 435)
  assert.ok(slow.record.elapsedSeconds >= 195 * 60)
  assert.equal(meetsSession(long, plan, slow), true, '27 km in 3 h 15 counts for the 32 km')
  assert.equal(meetsSession(long, plan, steady(at(1), 20, 400)), false)
  const graduation = sessionsOf('dynamax-marathon').at(-1)
  assert.equal(meetsSession(graduation, plan, steady(at(1), 40, 435, egg)), false)
  const capped = cueAt(long, { startedAt: start, meters: 26000, pace: { start: 0, at: [0], moving: [0] } }, start + 195 * 60e3)
  assert.equal(capped.done, true)
  assert.equal(spokenCue(capped), "That's the long run done. Time on your feet counts, not just the distance.")
})

test('a back-to-back opens the day after its long run', () => {
  let training = startPlan(emptyTraining(), 'gigantamax-ultra', ['Charmander', 'Charmeleon', 'Charizard'], 'Gigantamax Charizard', start, 1500)
  training = fill(training, 3)
  training = countSession(training, steady(at(3), 24, 400), at(3, 12))
  assert.equal(planSessions(training.active)[4].kind, 'backtoback')
  assert.equal(unlockAt(training.active), dayStart(at(3), 1), 'not the day after next, as two hard sessions would be')
})

test('the marathon is the summit: suggested from half marathon fitness; the ultra never is, and stays locked', () => {
  const month = Array.from({ length: 14 }, (_, i) => steady(at(-2 * i - 1), 8, 330))
  const fit = [...month, steady(at(-3), 17, 350)]
  assert.equal(suggestGym(fit, {}, at(0)), 'dynamax-marathon')
  assert.equal(suggestGym([], { 'mega-trial': { at: 1 } }, at(0)), 'dynamax-marathon')
  assert.notEqual(suggestGym([...fit, steady(at(-5), 45, 360)], { 'dynamax-marathon': { at: 1 } }, at(0)), 'gigantamax-ultra')

  assert.equal(entryCheck('dynamax-marathon', month, {}, at(0)).ok, false)
  assert.equal(entryCheck('dynamax-marathon', fit, {}, at(0)).ok, true)
  const locked = entryCheck('gigantamax-ultra', fit, {}, at(0))
  assert.deepEqual([locked.locked, locked.confirm], [true, undefined], 'no way in at 30 km a week')
  const big = Array.from({ length: 20 }, (_, i) => steady(at(-i - 1), 11, 330))
  assert.equal(entryCheck('gigantamax-ultra', big, {}, at(0)).confirm, "I've run a marathon in the last 12 months")
  assert.equal(entryCheck('gigantamax-ultra', [], { 'dynamax-marathon': { at: 1 } }, at(0)).ok, true)
  assert.equal(entryCheck('gigantamax-ultra', [steady(at(-200), 42.2, 400)], {}, at(0)).ok, true)
})

test('the marathon refreshes its paces from a half marathon, from week 9', () => {
  const training = fill(startPlan(emptyTraining(), 'dynamax-marathon', egg, null, start, 1500), 36)
  const half = steady(at(1), 21.2, 320)
  const offer = refreshOffer(training.active, [half], at(2))
  assert.equal(offer.from, 'half marathon')
  assert.ok(Math.abs(offer.seconds - 21097.5 * 0.32) < 40)
  assert.ok(Math.abs(offer.baseline - riegel(offer.seconds, 21.0975, 5)) < 1e-6)
  assert.equal(refreshOffer(fill(startPlan(emptyTraining(), 'dynamax-marathon', egg, null, start, 1500), 20).active, [half], at(2)), null, 'not before week 9')
})

test('Dynamax Day graduates at 42.2 km; an even race is a Wall Breaker', () => {
  let training = fill(startPlan(emptyTraining(), 'dynamax-marathon', egg, null, start, 1500), 74)
  assert.equal(planSessions(training.active).length, 75)
  assert.equal(planSessions(training.active)[74].kind, 'graduation')
  assert.throws(() => countSession(training, steady(at(3), 42, 340, egg), at(3, 12)), /not enough/, '42.0 km is short of a marathon')
  const even = simulate(at(3), [{ meters: 21100, pace: 340 }, { meters: 21100, pace: 350 }], egg)
  assert.equal(evenHalves(even), true)
  const done = countSession(training, even, at(3, 12))
  assert.equal(done.badges['dynamax-marathon'].wall, true)
  const wall = simulate(at(3), [{ meters: 21100, pace: 330 }, { meters: 21100, pace: 380 }], egg)
  assert.equal(countSession(training, wall, at(3, 12)).badges['dynamax-marathon'].wall, undefined)
})

test('Gigantamax Day at 50 km, Ultra Steady for easy long runs, and walking breaks', () => {
  let training = startPlan(emptyTraining(), 'gigantamax-ultra', egg, 'Gigantamax Charizard', start, 1500)
  assert.equal(training.active.runWalk, 10, 'walking breaks on by default, every 10 minutes')
  assert.equal(setRunWalk(training, null).active.runWalk, null)
  assert.equal(setRunWalk(training, 40).active.runWalk, null)
  training = fill(training, 58)
  assert.equal(planSessions(training.active)[58].kind, 'graduation')
  assert.ok(takesBreaks(planSessions(training.active)[58]))
  const done = countSession(training, steady(at(3), 50, 420, egg), at(3, 18))
  assert.equal(done.badges['gigantamax-ultra'].steady, true)
  assert.equal(done.active, null)

  assert.deepEqual(walkBreak(10, 0), { walking: false, remaining: 600 })
  assert.deepEqual(walkBreak(10, 630), { walking: true, remaining: 30 })
  assert.deepEqual(walkBreak(10, 660), { walking: false, remaining: 600 })
  assert.equal(walkBreak(undefined, 630), null)
  const long = sessionsOf('gigantamax-ultra')[3]
  const cue = cueAt(long, { startedAt: start, meters: 2000, pace: { start: 0, at: [0], moving: [0] } }, start + 630e3)
  const options = { native: false, splits: false }
  const first = cueEvents(null, start, cue, 2000, 590, options, () => false, false)
  const walking = cueEvents(first.state, start, cue, 2100, 601, options, () => false, true)
  assert.deepEqual(walking.speech, ['Walk for 1 minute.'])
  const running = cueEvents(walking.state, start, cue, 2200, 661, { native: true, splits: false }, () => false, false)
  assert.deepEqual([running.speech, running.buzz], [['Run again.'], null], 'Android buzzes the end of the break itself')
})
