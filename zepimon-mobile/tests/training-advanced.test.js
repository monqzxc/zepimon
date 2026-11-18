import test from 'node:test'
import assert from 'node:assert/strict'
import { entryTrial, gyms, sessionMeters, sessionsOf } from '../src/training-plans.ts'
import { baselineFrom, countSession, emptyTraining, entryCheck, eggAllowed, isOpen, matchCandidates, maxStars, nextSession, paceZones,
  planSessions, refreshOffer, refreshZones, retryClosed, scoreStars, startPlan, starsOf, suggestGym, unlockAt, dayStart } from '../src/training.ts'

const day = 864e5
const start = new Date(2026, 10, 2, 7, 0).getTime()
const at = (days, hour = 7) => new Date(2026, 10, 2 + days, hour, 0).getTime()
const egg = ['Charmander', 'Charmeleon', 'Charizard']
let next = 0

// A phone adventure run through segments of { meters | seconds, pace (s/km) }, with a mark every 100 m as the
// tracker logs it.
function simulate(startedAt, segments, family = ['Eevee', 'Vaporeon']) {
  const marks = [0]
  let meters = 0, seconds = 0
  for (const segment of segments) {
    const length = segment.meters ?? segment.seconds / segment.pace * 1000
    const end = meters + length
    while ((marks.length) * 100 <= end + 1e-9) {
      const mark = marks.length * 100
      marks.push(seconds + (mark - meters) / 1000 * segment.pace)
    }
    seconds += length / 1000 * segment.pace
    meters = end
  }
  return { id: `phone-${next++}`, family, movingSeconds: Math.round(seconds),
    pace: { start: 0, at: marks, moving: marks },
    record: { meters: Math.floor(meters), steps: 0, shiny: false, activity: 'running', startedAt,
      finishedAt: new Date(startedAt + seconds * 1000).toISOString(), elapsedSeconds: Math.round(seconds) } }
}
const steady = (startedAt, km, pace, family) => simulate(startedAt, [{ meters: km * 1000, pace }], family)
const begin = (gym, baseline = 1500, family = egg, mega = null) => startPlan(emptyTraining(), gym, family, mega, start, baseline)
const fill = (training, upto) => {
  for (const item of planSessions(training.active).slice(0, upto)) training.active.done[item.id] = { at: at(0), adventureId: `x-${item.id}`, stars: 3 }
  return training
}

test('the new plans match the spec: weeks, graduations and a gentle build', () => {
  const total = id => gyms[id].weeks.map(week => week.reduce((sum, item) => sum + sessionMeters(item), 0) / 1000)
  assert.deepEqual(total('mega-trial').map(Math.round), [27, 31, 34, 29, 37, 39, 41, 33, 44, 44, 34, 31])
  assert.deepEqual(total('evolution-road').slice(0, 7).map(km => Math.round(km * 10) / 10), [18.6, 20, 22.5, 18.6, 24, 25.5, 26])
  for (const id of ['evolution-road', 'speed-gym', 'mega-trial']) {
    const weeks = total(id)
    for (let i = 1; i < weeks.length - 1; i++) assert.ok(weeks[i] <= Math.max(...weeks.slice(0, i)) * 1.15 + 1e-9, `${id} week ${i + 1} rises over 15%`)
    const all = sessionsOf(id)
    assert.equal(all.at(-1).kind, 'graduation')
    assert.equal(all.filter(item => item.kind === 'graduation').length, 1)
    assert.equal(sessionMeters(all.at(-1)), gyms[id].graduationMeters === 21098 ? 21100 : gyms[id].graduationMeters)
    for (const item of all) assert.ok(item.steps.every(s => (s.seconds > 0) !== (s.meters > 0)), item.id)
  }
  assert.deepEqual(gyms['speed-gym'].weeks.map(week => week.length), [4, 4, 4, 4, 4, 3])
  assert.deepEqual(gyms['mega-trial'].weeks.map(week => week.length), [...Array(11).fill(4), 3])
  assert.equal(gyms['mega-trial'].graduationMeters, 21098, 'Mega at 21 km, the half marathon to the metre')
})

test('pace zones from a 25:00 5 km, as in the spec', () => {
  const zones = paceZones(1500)
  assert.deepEqual(zones.easy.map(Math.round), [360, 420])
  assert.deepEqual(zones.tempo.map(Math.round), [315, 327])
  assert.deepEqual(zones.interval.map(Math.round), [291, 300])
  assert.deepEqual(zones.half.map(Math.round), [321, 333])
  assert.ok(Math.abs(zones.halfEstimate - 6900) < 15, 'about 1:55')
})

test('the baseline is the fastest 5 km of the last 12 weeks', () => {
  const runs = [steady(at(-100), 5, 280), steady(at(-20), 5, 300), steady(at(-10), 6, 310), steady(at(-5), 3, 250)]
  assert.equal(Math.round(baselineFrom(runs, at(0))), 1500)
  assert.equal(baselineFrom([steady(at(-5), 4, 250)], at(0)), null)
})

test('stars: efforts in their zone, and easy runs kept easy', () => {
  const plan = begin('speed-gym').active
  const repeats = sessionsOf('speed-gym')[0] // 2 km warm-up, 6 × 400 m fast with 90 s jogs, 1.5 km cool-down
  const intervals = pace => simulate(at(0), [{ meters: 2000, pace: 390 }, ...Array.from({ length: 6 }, (_, i) =>
    [{ meters: 400, pace: typeof pace === 'function' ? pace(i) : pace }, { seconds: 90, pace: 420 }]).flat(), { meters: 1500, pace: 390 }])
  assert.equal(scoreStars(repeats, plan, intervals(296)), 3)
  assert.equal(scoreStars(repeats, plan, intervals(i => i < 4 ? 296 : 330)), 2, '4 of 6 in the zone')
  // 100 m marks can't judge a 400 m rep finely: it needs to be well off the zone to lose its star.
  assert.equal(scoreStars(repeats, plan, intervals(220)), 1, 'far too fast')
  assert.equal(scoreStars(repeats, plan, intervals(360)), 1, 'jogged')
  assert.equal(scoreStars(repeats, plan, intervals(i => 292 + i * 2)), 3, 'fading 3% is fine')
  const easy = sessionsOf('speed-gym')[1] // easy 6 km
  assert.equal(scoreStars(easy, plan, steady(at(0), 6, 390)), 3)
  assert.equal(scoreStars(easy, plan, steady(at(0), 6, 330)), 1, 'an easy run at tempo')
  assert.equal(scoreStars(easy, plan, simulate(at(0), [{ meters: 1000, pace: 340 }, { meters: 5000, pace: 400 }])), 2, 'one quick kilometre')
  const watch = { ...steady(at(0), 6, 390), pace: undefined }
  assert.equal(scoreStars(easy, plan, watch), 1, 'no pace log: no pace stars')
  const unpaced = begin('evolution-road', null).active
  assert.equal(maxStars(sessionsOf('evolution-road')[0], unpaced), 1, 'without a 5 km best there are no zones')
  assert.equal(maxStars(sessionsOf('first-hatch')[0], begin('first-hatch').active), 2)
})

test('Speed Gym without a baseline starts with an entry trial that sets it', () => {
  let training = begin('speed-gym', null)
  assert.equal(nextSession(training.active).id, entryTrial.id)
  assert.equal(planSessions(training.active).length, 24)
  training = countSession(training, steady(at(0), 5.2, 310), at(0, 9))
  assert.equal(Math.round(training.active.baseline5k), 1550)
  assert.equal(nextSession(training.active).id, 'speed-gym-w1-s1')
  assert.equal(unlockAt(training.active), dayStart(at(0), 2), 'a trial is hard, so are intervals')
})

test('the Speed Gym trial: a new best earns the badge, a miss gets one retry within 14 days', () => {
  const trial = (days, pace) => steady(at(days), 5.1, pace, egg)
  let training = fill(begin('speed-gym'), 22)
  assert.equal(nextSession(training.active).kind, 'graduation')
  const won = countSession(training, trial(1, 290), at(1, 9))
  assert.equal(won.active, null)
  assert.equal(Math.round(won.badges['speed-gym'].time), 1450)
  assert.equal(won.badges['speed-gym'].perfect, true)

  training = countSession(training, trial(1, 305), at(1, 9))
  assert.equal(training.badges['speed-gym'], undefined)
  assert.equal(training.active.trials.length, 1)
  assert.equal(nextSession(training.active).kind, 'graduation', 'the trial again')
  assert.equal(unlockAt(training.active), dayStart(at(1), 3), 'after two rest days')
  assert.equal(isOpen(training.active, at(3)), false)
  assert.equal(isOpen(training.active, at(4)), true)
  assert.equal(retryClosed(training.active, at(16)), true)
  assert.throws(() => countSession(training, trial(16, 280), at(16, 9)), /retry window/)
  const retried = countSession(training, trial(5, 295), at(5, 9))
  assert.ok(retried.badges['speed-gym'])
  const missedTwice = countSession(training, trial(5, 310), at(5, 9))
  assert.equal(missedTwice.active, null)
  assert.equal(missedTwice.badges['speed-gym'], undefined, 'complete, but no badge this time')
})

test('Mega Trial graduates at 21.1 km with the plan egg, and a negative split is a Mega Pacer', () => {
  const lucario = ['Riolu', 'Lucario']
  let training = fill(begin('mega-trial', 1500, lucario, 'Mega Lucario'), 46)
  assert.equal(training.active.egg.mega, 'Mega Lucario')
  const even = simulate(at(3), [{ meters: 10600, pace: 330 }, { meters: 10600, pace: 320 }], lucario)
  const short = simulate(at(3), [{ meters: 21000, pace: 330 }], lucario)
  assert.throws(() => countSession(training, short, at(3, 12)), /not enough/, '21.0 km is not a half marathon')
  const done = countSession(training, even, at(3, 12))
  assert.equal(done.badges['mega-trial'].pacer, true)
  const faded = countSession(training, simulate(at(3), [{ meters: 10600, pace: 320 }, { meters: 10600, pace: 340 }], lucario), at(3, 12))
  assert.equal(faded.badges['mega-trial'].pacer, undefined)
})

test('egg rules, entry checks and the suggested Gym', () => {
  const forms = (megas = [], gigantamax = []) => ({ megas, gigantamax })
  assert.equal(eggAllowed('evolution-road', ['Tauros'], forms()), false, 'no evolution at 10 km')
  assert.equal(eggAllowed('evolution-road', egg, forms()), true)
  assert.equal(eggAllowed('mega-trial', egg, forms()), false)
  assert.equal(eggAllowed('mega-trial', egg, forms(['Mega Charizard X'])), true)
  assert.equal(eggAllowed('gigantamax-ultra', egg, forms(['Mega Charizard X'])), false)
  assert.equal(eggAllowed('gigantamax-ultra', egg, forms([], ['Gigantamax Charizard'])), true)
  assert.equal(eggAllowed('speed-gym', ['Tauros'], forms()), true)

  assert.equal(entryCheck('evolution-road', [steady(at(-3), 3, 400)], {}, at(0)).ok, false)
  assert.equal(entryCheck('evolution-road', [steady(at(-3), 5, 400)], {}, at(0)).ok, true)
  assert.equal(entryCheck('evolution-road', [], { 'first-hatch': { at: 1 } }, at(0)).ok, true)
  const month = Array.from({ length: 8 }, (_, i) => steady(at(-3 * i - 1), 8, 330))
  assert.equal(entryCheck('mega-trial', month, {}, at(0)).ok, false, 'no 10 km yet')
  assert.equal(entryCheck('mega-trial', [...month, steady(at(-2), 10.5, 340)], {}, at(0)).ok, true)

  assert.equal(suggestGym([], {}, at(0)), 'first-hatch')
  assert.equal(suggestGym([{ ...steady(at(-2), 2, 700), record: { ...steady(at(-2), 2, 700).record, activity: 'walking' } }], {}, at(0)), 'steady-steps')
  assert.equal(suggestGym([steady(at(-2), 6, 360)], {}, at(0)), 'evolution-road')
  assert.equal(suggestGym(Array.from({ length: 16 }, (_, i) => steady(at(-i - 1), 5, 300)), {}, at(0)), 'speed-gym', 'the user: 5 km a day')
  assert.equal(suggestGym([steady(at(-2), 12, 330)], {}, at(0)), 'mega-trial')
})

test('Speed Gym offers to refresh its paces once, from week 4, after a faster 5 km', () => {
  let training = fill(begin('speed-gym'), 12)
  const faster = steady(at(1), 5, 290)
  assert.deepEqual(refreshOffer(training.active, [faster], at(2)), { baseline: 1450, from: '5 km', seconds: 1450 })
  assert.equal(refreshOffer(training.active, [steady(at(1), 5, 310)], at(2)), null)
  training = refreshZones(training, 1450)
  assert.equal(training.active.baseline5k, 1450)
  assert.equal(refreshOffer(training.active, [steady(at(3), 5, 280)], at(4)), null, 'once')
  assert.equal(refreshOffer(fill(begin('speed-gym'), 4).active, [faster], at(2)), null, 'not before week 4')
})

test('stars add up, and matches offer only adventures that do the session', () => {
  let training = begin('speed-gym')
  const run = steady(at(0), 6.7, 390)
  assert.deepEqual(matchCandidates(training, [run, steady(at(0, 12), 4, 390)], at(1)).map(item => item.id), [run.id])
  training = countSession(training, run, at(0, 9))
  assert.deepEqual(starsOf(training.active), { earned: 1, possible: 3 }, 'an easy jog is not the intervals')
})
