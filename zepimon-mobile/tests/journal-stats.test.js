import test from 'node:test'
import assert from 'node:assert/strict'
import { change, dailyAverage, estimatedKcal, greeting, hatched, previousRange, slices, steps, streak } from '../src/journal-stats.ts'

const at = (day, hour = 9, month = 9) => new Date(2026, month, day, hour).getTime()
const run = (id, finished, extra = {}) => ({ id, device: 'phone', family: ['Pikachu', 'Raichu'],
  record: { meters: 3000, steps: 0, shiny: false, finishedAt: new Date(finished).toISOString(), elapsedSeconds: 1800, activity: 'walking', ...extra } })
// Wednesday 28 October 2026, mid-afternoon.
const now = at(28, 15)
const runs = [run('a', at(28, 7)), run('b', at(28, 8), { activity: 'running', meters: 5200 }), run('c', at(26), { device: 'watch', steps: 4100, activity: undefined }),
  run('d', at(20)), run('e', at(12)), run('f', at(2))]

test('a week is seven days from Monday with the distance of each, and the days still to come marked', () => {
  const week = slices(runs, now, 'week', now)
  assert.deepEqual(week.map(day => day.label), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  assert.deepEqual(week.map(day => day.meters), [3000, 0, 8200, 0, 0, 0, 0])
  assert.deepEqual(week.map(day => day.count), [1, 0, 2, 0, 0, 0, 0])
  assert.deepEqual(week.map(day => day.future), [false, false, false, true, true, true, true])
})

test('a month has a slice per day and a year one per month', () => {
  const month = slices(runs, now, 'month', now)
  assert.equal(month.length, 31)
  assert.equal(month[27].meters, 8200)
  assert.equal(month.reduce((sum, day) => sum + day.meters, 0), 3000 * 5 + 5200)
  const year = slices(runs, now, 'year', now)
  assert.equal(year.length, 12)
  assert.equal(year[9].count, 6)
  assert.equal(year[10].future, true)
})

test('a running period is compared with the same stretch of the one before', () => {
  const [from, to] = previousRange(now, 'week', now)
  assert.equal(from, at(19, 0))
  assert.equal(to, at(21, 15), 'Monday 19 to this time on Wednesday 21')
  const [past, end] = previousRange(at(14), 'week', now)
  assert.deepEqual([past, end], [at(5, 0), at(12, 0)], 'An ended week is compared whole')
  assert.deepEqual(previousRange(now, 'month', now)[0], at(1, 0, 8))
})

test('changes are whole percents, new from nothing, and nothing from nothing', () => {
  assert.equal(change(150, 100), 50)
  assert.equal(change(80, 100), -20)
  assert.equal(change(5, 0), 'new')
  assert.equal(change(0, 0), null)
})

test('the streak counts weeks in a row and keeps a running week that has no adventure yet', () => {
  assert.deepEqual(streak(runs, now), { weeks: 3, since: at(12, 0), thisWeek: true })
  // The week of 2 November has nothing yet: the streak still stands on the weeks before.
  assert.deepEqual(streak(runs, at(3, 9, 10)), { weeks: 3, since: at(12, 0), thisWeek: false })
  assert.deepEqual(streak(runs, at(17, 9, 10)).weeks, 0, 'A whole empty week ends it')
  assert.deepEqual(streak([], now), { weeks: 0, since: null, thisWeek: false })
})

test('calories are estimated from distance, steps come only from watches, hatches from 5 km', () => {
  const week = runs.slice(0, 3)
  assert.equal(estimatedKcal(week), 660, '3 km walk 150 + 5.2 km run 364 + 3 km watch walk 150 = 664, to 660')
  assert.equal(steps(week), 4100)
  assert.equal(steps(runs.slice(0, 2)), null)
  assert.equal(hatched(runs), 1)
})

test('the daily average divides by the days so far, or the whole period once it has ended', () => {
  assert.equal(dailyAverage(9000, now, 'week', now), 3000, 'Monday to Wednesday')
  assert.equal(dailyAverage(7000, at(14), 'week', now), 1000)
})

test('the greeting follows the clock', () => {
  assert.equal(greeting(at(28, 7)), 'Good morning')
  assert.equal(greeting(at(28, 13)), 'Good afternoon')
  assert.equal(greeting(at(28, 21)), 'Good evening')
  assert.equal(greeting(at(28, 2)), 'Good evening')
})
