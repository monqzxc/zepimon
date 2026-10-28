import test from 'node:test'
import assert from 'node:assert/strict'
import { adventuresByDay, adventuresIn, adventuresOn, bento, calendarMonths, describeAdventure, monthGrid, periodRange, recentDays, shortDuration, summary } from '../src/journal-calendar.ts'

const at = (day, hour = 9, month = 9) => new Date(2026, month, day, hour).getTime()
const run = (id, finished, extra = {}) => ({ id, device: 'phone', family: ['Pikachu', 'Raichu'],
  record: { meters: 3000, steps: 0, shiny: false, finishedAt: new Date(finished).toISOString(), elapsedSeconds: 1800, activity: 'walking', ...extra } })
const now = at(28, 15)
const runs = [run('a', at(28, 7)), run('b', at(28, 8), { activity: 'running', meters: 5200, elapsedSeconds: 1500 }), run('c', at(26)),
  run('d', at(20)), run('e', at(2)), run('f', at(15, 9, 3))]

test('the strip starts today and goes back day by day, marking days with adventures', () => {
  const days = recentDays(runs, now, 10)
  assert.equal(days.length, 10)
  assert.equal(days[0].start, at(28, 0))
  assert.equal(days[1].start, at(27, 0))
  assert.deepEqual(days.filter(day => day.has).map(day => new Date(day.start).getDate()), [28, 26, 20])
})

test('a day holds the adventures that finished on it, and adds them up', () => {
  const today = adventuresOn(runs, at(28, 12))
  assert.deepEqual(today.map(item => item.id), ['b', 'a'], 'Newest first')
  assert.deepEqual(summary(today), { meters: 8200, seconds: 3300, count: 2, walks: 1, runs: 1 })
  assert.deepEqual(adventuresOn(runs, at(27)), [])
  assert.deepEqual(summary([]), { meters: 0, seconds: 0, count: 0, walks: 0, runs: 0 })
})

test('week, month and year are calendar periods around the chosen day', () => {
  // 28 Oct 2026 is a Wednesday: its week runs Monday 26 to Sunday 1 Nov.
  const [weekStart, weekEnd] = periodRange(at(28), 'week')
  assert.equal(new Date(weekStart).getDate(), 26)
  assert.equal(new Date(weekEnd).getDate(), 2)
  assert.deepEqual(adventuresIn(runs, periodRange(at(28), 'week')).map(item => item.id), ['b', 'a', 'c'])
  assert.deepEqual(adventuresIn(runs, periodRange(at(28), 'month')).map(item => item.id), ['b', 'a', 'c', 'd', 'e'])
  assert.deepEqual(adventuresIn(runs, periodRange(at(28), 'year')).map(item => item.id), ['b', 'a', 'c', 'd', 'e', 'f'])
  assert.deepEqual(adventuresIn(runs, periodRange(at(10, 9, 3), 'week')), [], 'An earlier week shows only its own')
})

test('bento tiles fill two columns that stay about level, every third one tall', () => {
  const [left, right] = bento(runs)
  assert.equal(left.length + right.length, runs.length)
  assert.deepEqual(left.map(tile => [tile.adventure.id, tile.tall]), [['a', true], ['d', true]])
  assert.deepEqual(right.map(tile => [tile.adventure.id, tile.tall]), [['b', false], ['c', false], ['e', false], ['f', false]])
  const height = column => column.reduce((sum, tile) => sum + (tile.tall ? 2 : 1), 0)
  assert.ok(Math.abs(height(left) - height(right)) <= 1)
  assert.deepEqual(bento([]), [[], []])
})

test('durations read the way people say them', () => {
  assert.equal(shortDuration(45), '45 s')
  assert.equal(shortDuration(46 * 60 + 12), '46 min')
  assert.equal(shortDuration(72 * 60), '1 h 12 min')
  assert.equal(shortDuration(2 * 3600), '2 h')
  assert.equal(shortDuration(null), '--')
})

test('an adventure describes itself: where, how far, and what the egg became', () => {
  const facts = (evolution, hatchSeconds = null) => ({ hatchSeconds, steps: null, started: null, evolution, bests: [] })
  assert.equal(describeAdventure(run('a', at(28)), facts([])),
    'A walk with this phone, 3.00 km with your Pikachu egg. 2.00 km more and it would have hatched.')
  const long = { ...run('b', at(28), { activity: 'running', meters: 10400, shiny: true }), device: 'watch' }
  assert.equal(describeAdventure(long, facts(['Pikachu', 'Raichu'], 1900)),
    'A run on your watch, 10.40 km with your Pikachu egg. It hatched into a shiny Pikachu after 31 min, then grew into Raichu.')
  assert.equal(describeAdventure(run('c', at(28), { activity: undefined, meters: 5000 }), facts(['Pikachu'])),
    'An adventure with this phone, 5.00 km with your Pikachu egg. It hatched into Pikachu.')
})

test('a month is calendar weeks from Monday, blank before the 1st and after the last day', () => {
  // 1 Oct 2026 is a Thursday: three blanks, then five weeks in all.
  const october = monthGrid(at(28))
  assert.equal(october.length, 5)
  assert.ok(october.every(week => week.length === 7))
  assert.deepEqual(october[0].slice(0, 4), [null, null, null, at(1, 0)])
  assert.equal(october[4][5], at(31, 0))
  assert.equal(october[4][6], null)
  // February 2027 starts on a Monday and fills four weeks exactly.
  const february = monthGrid(new Date(2027, 1, 10).getTime())
  assert.equal(february.length, 4)
  assert.equal(february[0][0], new Date(2027, 1, 1).getTime())
  assert.equal(february[3][6], new Date(2027, 1, 28).getTime())
})

test('adventures group by the day they finished, newest first', () => {
  const days = adventuresByDay(runs)
  assert.deepEqual(days.get('2026-10-28').map(item => item.id), ['b', 'a'])
  assert.deepEqual(days.get('2026-04-15').map(item => item.id), ['f'])
  assert.equal(days.has('2026-10-27'), false)
})

test('the calendar offers this month back to the first adventure, at least a year', () => {
  const months = calendarMonths(runs, now)
  assert.equal(months.length, 12, 'April to October is under a year, so a year is offered')
  assert.equal(months[0], new Date(2026, 9, 1).getTime())
  assert.equal(months[11], new Date(2025, 10, 1).getTime())
  const older = calendarMonths([...runs, run('g', new Date(2024, 5, 3).getTime())], now)
  assert.equal(older.length, 29, 'June 2024 to October 2026')
  assert.equal(older.at(-1), new Date(2024, 5, 1).getTime())
  assert.equal(calendarMonths([], now).length, 12)
})
