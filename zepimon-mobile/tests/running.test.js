import test from 'node:test'
import assert from 'node:assert/strict'
import { achievements, averagePace, bestEffort, clock, earnedBy, evenlyPaced, fastestPace, movingTime, negativeSplit, nonStop, paceSummary,
  paceText, raceRecords, runningPoints, runningTickets, currentStreak, splits, strongFinish } from '../src/running.ts'

const day = (date, hour = 7) => new Date(2026, 9, date, hour).toISOString()
// A phone adventure run at these paces (seconds per km, one per kilometre, the last may be part of one), logged every
// 100 m. stops adds clock time that is not moving time.
// climbs, when given, is the metres gained over each kilometre.
function phone(id, paces, { finishedAt = day(1), stops = 0, partial = 1, climbs = null } = {}) {
  const at = [0], moving = [0], elev = [climbs ? 50 : null]
  paces.forEach((pace, i) => {
    const marks = i === paces.length - 1 ? Math.round(partial * 10) : 10
    for (let m = 0; m < marks; m++) {
      moving.push(moving.at(-1) + pace / 10)
      at.push(at.at(-1) + pace / 10 + (m === 0 && i === 1 ? stops : 0))
      elev.push(climbs ? elev.at(-1) + climbs[i] / 10 : null)
    }
  })
  const meters = (at.length - 1) * 100
  return { id, device: 'phone', family: ['Pikachu', 'Raichu'], movingSeconds: moving.at(-1), pace: { start: 0, at, moving, elev },
    record: { meters, steps: 0, shiny: false, activity: 'running', finishedAt, elapsedSeconds: at.at(-1) } }
}
const watch = (id, meters, elapsedSeconds, extra = {}) => ({ id, device: 'watch', family: ['Pikachu', 'Raichu'],
  record: { meters, steps: 6000, shiny: false, finishedAt: day(2), elapsedSeconds, ...extra } })

test('moving time leaves out stops and falls back to the whole time; average pace is over moving time', () => {
  const run = phone('a', [300, 300, 300], { stops: 120 })
  assert.equal(run.record.elapsedSeconds, 1020)
  assert.equal(movingTime(run), 900)
  assert.equal(averagePace(run), 300)
  assert.equal(movingTime(watch('w', 3000, 1500)), 1500)
  assert.equal(movingTime(watch('w', 3000, null)), null)
})

test('splits are each kilometre in moving time, then the part kilometre at its own pace', () => {
  const run = phone('a', [330, 310, 320, 300], { partial: 0.5, stops: 60 })
  assert.deepEqual(splits(run).map(split => [split.km, split.meters, Math.round(split.seconds), Math.round(split.pace)]),
    [[1, 1000, 330, 330], [2, 1000, 310, 310], [3, 1000, 320, 320], [4, 500, 150, 300]])
  assert.deepEqual(splits(run).map(split => split.elev), [null, null, null, null], 'No altitude, no climb')
  const hilly = splits(phone('h', [330, 310, 320, 300], { partial: 0.5, climbs: [25, -75, 5, 8] }))
  assert.deepEqual(hilly.map(split => Math.round(split.elev)), [25, -75, 5, 4], 'Each split climbs from its start to its end')
  assert.deepEqual(splits(watch('w', 5000, 1500)), [], 'Watches log no splits')
  assert.deepEqual(splits({ ...run, pace: { ...run.pace, start: 30 } }), [], 'Nor does a log that starts part way')
})

test('the fastest pace is the fastest kilometre anywhere, even across two splits', () => {
  const run = phone('a', [360, 300, 300, 360])
  assert.ok(Math.abs(fastestPace(run) - 300) < 1e-6)
  assert.equal(fastestPace(watch('w', 5000, 1500)), 300, 'Without a log, the average pace held over the whole way')
  assert.equal(fastestPace(watch('w', 800, 300)), null, 'Under a kilometre has none')
})

test('best efforts are the fastest stretch by the clock, with what watches really record', () => {
  const run = phone('a', [330, 300, 300, 300, 300, 300, 330])
  assert.ok(Math.abs(bestEffort(run, 5000) - 1500) < 1e-6, 'The five 5:00 kilometres in the middle')
  assert.equal(bestEffort(run, 10000), null, 'Too short for 10 km')
  const stopped = phone('b', [300, 300, 300, 300, 300], { stops: 90 })
  assert.equal(Math.round(bestEffort(stopped, 5000)), 1590, 'Race time keeps the stops')
  const half = phone('c', Array(22).fill(300), { partial: 0.1 })
  assert.ok(Math.abs(bestEffort(half, 21097.5) - 6329.25) < 1e-6, 'A half marathon is timed between marks')
  assert.equal(bestEffort(watch('w', 12000, 4000, { hatchSeconds: 1700 }), 5000), 1700, 'A watch hatch is its first 5 km')
  assert.equal(bestEffort(watch('w', 10500, 3300), 10000), 3300, 'About 10 km counts its whole time')
  assert.equal(bestEffort(watch('w', 11500, 3300), 10000), null, 'More than 10% over does not')
})

test('pacing feats: negative split, even pacing, strong finish, non-stop', () => {
  assert.equal(negativeSplit(phone('a', [320, 315, 310, 300, 295])), true)
  assert.equal(negativeSplit(phone('b', [295, 300, 310, 315, 320])), false)
  assert.equal(negativeSplit(phone('c', [320, 300, 290])), false, 'Needs 5 km')
  assert.equal(evenlyPaced(phone('a', [300, 305, 298, 302, 300])), true)
  assert.equal(evenlyPaced(phone('b', [300, 340, 298, 302, 300])), false)
  assert.equal(strongFinish(phone('a', [310, 305, 290])), true)
  assert.equal(strongFinish(phone('b', [310, 285, 290])), false)
  assert.equal(nonStop(phone('a', [300, 300, 300, 300, 300])), true)
  assert.equal(nonStop(phone('b', [300, 300, 300, 300, 300], { stops: 120 })), false)
  assert.equal(nonStop(watch('w', 6000, 1800)), false, 'Without moving time it cannot be told')
})

test('times read as a race clock and paces as minutes a km', () => {
  assert.equal(clock(1471), '24:31')
  assert.equal(clock(6727), '1:52:07')
  assert.equal(clock(null), '--:--')
  assert.equal(paceText(312.4), '5:12')
})

test('race records keep the fastest, and the first to set a time keeps a tie', () => {
  const first = phone('a', Array(5).fill(300), { finishedAt: day(1) })
  const faster = phone('b', Array(5).fill(290), { finishedAt: day(3) })
  const tie = phone('c', Array(5).fill(290), { finishedAt: day(5) })
  const records = raceRecords([tie, first, faster])
  assert.equal(records['5k'].adventure.id, 'b')
  assert.equal(records['10k'], null)
  assert.deepEqual(Object.keys(records), ['5k', '10k', '15k', 'half', 'marathon'])
})

test('the period pace summary adds moving time and keeps the fastest kilometre', () => {
  const summary = paceSummary([phone('a', [300, 300], { stops: 100 }), watch('w', 2000, 800)])
  assert.equal(summary.moving, 1400)
  assert.equal(summary.pace, 350)
  assert.ok(Math.abs(summary.fastest - 300) < 1e-6)
  assert.deepEqual(paceSummary([]), { moving: 0, pace: null, fastest: null })
})

test('achievements are earned by the first adventure to reach them and show progress until then', () => {
  const weeks = [1, 8, 15, 22].map((date, i) => phone(`w${i}`, Array(6).fill(290 - i), { finishedAt: day(date) }))
  const all = achievements(weeks)
  const find = id => all.find(item => item.id === id)
  assert.equal(find('sub-5k-1800').earned.adventure.id, 'w0')
  assert.equal(find('sub-5k-1800').earned.detail, '5 km in 24:10', 'Says what the adventure did')
  assert.equal(find('streak-4').earned.detail, 'An adventure every week for 4 weeks')
  assert.equal(find('first-5k').earned.detail, 'Your first time past 5 km')
  assert.equal(find('sub-5k-1500').earned.adventure.id, 'w0')
  assert.equal(find('sub-5k-1200').earned, null)
  assert.equal(find('sub-5k-1200').note, 'Best 23:55')
  assert.equal(find('first-5k').earned.adventure.id, 'w0')
  assert.equal(find('first-10k').earned, null)
  assert.equal(find('first-10k').note, 'Longest 6.0 km')
  assert.equal(find('streak-4').earned.adventure.id, 'w3', 'Four Mondays in a row')
  assert.equal(find('streak-12').fraction, 4 / 12)
  assert.equal(find('total-100').note, '24.0 / 100 km')
  assert.equal(find('metronome').earned.adventure.id, 'w0')
  assert.equal(find('count-10').note, '4 / 10')
  assert.ok(all.every(item => ['feat', 'milestone'].includes(item.group)))
  assert.equal(new Set(all.map(item => item.id)).size, all.length)
})

test('running achievements are worth Legendary points once earned, more for harder ones', () => {
  assert.ok(achievements([]).every(item => Number.isInteger(item.points) && item.points >= 10 && item.points <= 50))
  assert.equal(runningPoints(achievements([])), 0)
  const all = achievements([phone('a', Array(6).fill(290), { finishedAt: day(1) })])
  const find = id => all.find(item => item.id === id)
  assert.ok(find('sub-5k-1200').points > find('sub-5k-1800').points)
  assert.ok(find('sub-marathon-10800').points > find('sub-marathon-18000').points)
  // Sub-30 and sub-25 5 km (30), first 5 km (10), metronome (20), non-stop (10).
  assert.deepEqual(all.filter(item => item.earned).map(item => item.id).sort(), ['first-5k', 'metronome', 'non-stop', 'sub-5k-1500', 'sub-5k-1800'])
  assert.equal(runningPoints(all), 70)
  const again = achievements([phone('a', Array(6).fill(290), { finishedAt: day(1) }), phone('b', Array(6).fill(290), { finishedAt: day(2) })])
  assert.equal(runningPoints(again), 70, 'The same feat again adds nothing')
})

test('running tickets: a Sub-4 marathon, the Ultra explorer and every 4 weeks in a row', () => {
  assert.deepEqual(achievements([]).filter(item => item.ticket).map(item => item.id).sort(), ['sub-marathon-14400', 'ultra'])
  assert.deepEqual(runningTickets([watch('m', 42195, 14400)]), [], 'Exactly four hours is not under four')
  const marathon = watch('m', 42195, 14000)
  assert.deepEqual(runningTickets([marathon]).map(item => [item.id, item.detail]), [['sub-marathon-14400', 'Marathon in 3:53:20']])
  assert.deepEqual(runningTickets([watch('u', 50000, 30000)]).map(item => item.id), ['ultra'])
  // Weeks 0 to 7, a week off, then weeks 9 to 12: the 4th and 8th weeks of the first streak, the 4th of the second.
  const weekly = [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12].map(week => phone(`w${week}`, [300], { finishedAt: day(1 + week * 7) }))
  const tickets = runningTickets(weekly)
  assert.deepEqual(tickets.map(item => [item.title, item.adventure.id]), [['4 weeks in a row', 'w3'], ['8 weeks in a row', 'w7'], ['4 weeks in a row', 'w12']])
  assert.equal(new Set(tickets.map(item => item.id)).size, 3)
  const twice = [...weekly, phone('extra', [300], { finishedAt: day(2 + 3 * 7) })]
  assert.equal(runningTickets(twice).length, 3, 'A second adventure in a week adds nothing')
  const last = Date.parse(weekly.at(-1).record.finishedAt)
  assert.equal(currentStreak(weekly, last + 2 * 86400000), 4)
  assert.equal(currentStreak(weekly, last + 7 * 86400000), 4, 'Next week the streak is still alive until it ends')
  assert.equal(currentStreak(weekly, last + 21 * 86400000), 0)
  assert.equal(currentStreak([], last), 0)
})

test('an adventure lists the records it holds and what it was first to earn', () => {
  const early = phone('a', Array(5).fill(300), { finishedAt: day(1) })
  const later = phone('b', Array(10).fill(295), { finishedAt: day(4) })
  const earned = earnedBy(later, [early, later])
  assert.deepEqual(earned.filter(item => item.id.startsWith('record')).map(item => [item.title, item.detail]),
    [['Fastest 5 km', 'Personal best · 24:35 · 4:55 /km'], ['Fastest 10 km', 'Personal best · 49:10 · 4:55 /km']])
  assert.deepEqual(earned.find(item => item.id === 'sub-10k-3000').detail, '10 km in 49:10')
  assert.ok(!earned.some(item => item.id === 'first-5k'), 'The first 5 km was the earlier run')
  assert.ok(earnedBy(early, [early, later]).some(item => item.id === 'first-5k'))
})
