import test from 'node:test'
import assert from 'node:assert/strict'
import { canGoForward, daysSoFar, rangePresets, rangeWindow, shiftWindow, statsYears, switchKind, unitFor, windowAt, windowFor, windowFromParams,
  windowName, windowParams, windowSlices } from '../src/stats-window.ts'

const at = (day, hour = 9, month = 9, year = 2026) => new Date(year, month, day, hour).getTime()
const run = (id, finished, meters = 3000) => ({ id, device: 'phone', family: ['Pikachu', 'Raichu'],
  record: { meters, steps: 0, shiny: false, finishedAt: new Date(finished).toISOString(), elapsedSeconds: 1800, activity: 'walking' } })
// Wednesday 28 October 2026.
const now = at(28, 15)
const runs = [run('a', at(28, 7)), run('b', at(26), 5200), run('c', at(20)), run('d', at(2)), run('e', at(15, 9, 3)), run('f', at(10, 9, 5, 2025), 8000)]

test('a picked month, week or year is its calendar period, and steps back and forward', () => {
  const october = windowFor('month', at(14))
  assert.deepEqual([october.start, october.end], [at(1, 0), at(1, 0, 10)])
  assert.deepEqual(shiftWindow(october, -1), windowFor('month', at(1, 0, 8)))
  assert.deepEqual(shiftWindow(windowFor('week', now), 1).start, at(2, 0, 10))
  assert.equal(windowFor('year', now).start, at(1, 0, 0))
  assert.equal(canGoForward(windowFor('month', now), now), false, 'November has not begun')
  assert.equal(canGoForward(shiftWindow(october, -1), now), true)
})

test('a range holds both ends, in either order, and steps by its own length', () => {
  const range = rangeWindow(at(20, 18), at(11, 7))
  assert.deepEqual([range.start, range.end], [at(11, 0), at(21, 0)])
  assert.deepEqual(shiftWindow(range, -1), rangeWindow(at(1), at(10)))
  assert.deepEqual(windowAt(range, at(3)), rangeWindow(at(3), at(12)))
})

test('the chart cuts a window into days, weeks or months by its length', () => {
  assert.equal(unitFor(windowFor('week', now)), 'day')
  assert.equal(unitFor(windowFor('month', now)), 'day')
  assert.equal(unitFor(windowFor('year', now)), 'month')
  assert.equal(unitFor(rangeWindow(at(1), at(28))), 'day')
  assert.equal(unitFor(rangeWindow(at(1, 9, 6), at(28))), 'week')
  assert.equal(unitFor(rangeWindow(at(1, 9, 0, 2025), at(28))), 'month')
})

test('slices add up the distance walked in each, and stop counting at today', () => {
  const week = windowSlices(runs, windowFor('week', now), now)
  assert.deepEqual(week.map(slice => slice.meters), [5200, 0, 3000, 0, 0, 0, 0])
  assert.deepEqual(week.map(slice => slice.future), [false, false, false, true, true, true, true])
  const weeks = windowSlices(runs, rangeWindow(at(1, 9, 6), at(28)), now)
  assert.equal(weeks.reduce((sum, slice) => sum + slice.meters, 0), 3000 * 3 + 5200, 'Every adventure from July to 28 October, once')
  assert.equal(weeks.at(-1).end, at(29, 0), 'The last week is cut at the range end')
  const year = windowSlices(runs, windowFor('year', at(1, 9, 0, 2025)), now)
  assert.equal(year.length, 12)
  assert.equal(year[5].meters, 8000)
  assert.equal(year[11].future, false, 'A past year has no future months')
})

test('a window is named for what it is', () => {
  assert.equal(windowName(windowFor('week', now), now), 'This week')
  assert.equal(windowName(windowFor('month', now), now), 'This month')
  assert.match(windowName(windowFor('month', at(5, 9, 8)), now), /September 2026/)
  assert.equal(windowName(windowFor('year', at(5, 9, 8, 2025)), now), '2025')
  assert.match(windowName(rangeWindow(at(30, 9, 11, 2025), at(3, 9, 0)), now), /2025.*2026/, 'Both years when a range crosses one')
})

test('the daily average counts only the days so far', () => {
  assert.equal(daysSoFar(windowFor('week', now), now), 3)
  assert.equal(daysSoFar(windowFor('month', at(5, 9, 8)), now), 30)
  assert.equal(daysSoFar(rangeWindow(at(20), at(10, 9, 10)), now), 9, '20 to 28 October')
})

test('presets end today, years go back to the first adventure, and windows survive a round trip as params', () => {
  const [, week] = rangePresets(now)[0]
  assert.deepEqual([week.start, week.end], [at(22, 0), at(29, 0)])
  assert.deepEqual(statsYears(runs, now), [2026, 2025])
  assert.deepEqual(statsYears([run('g', at(2))], now), [2026, 2025], 'Last year is always there to compare with')
  assert.deepEqual(statsYears([run('h', at(2, 9, 3, 2023))], now), [2026, 2025, 2024, 2023])
  for (const w of [windowFor('week', now), windowFor('year', now), rangeWindow(at(3), at(17))]) assert.deepEqual(windowFromParams(windowParams(w), now), w)
  assert.deepEqual(windowFromParams({ kind: 'nonsense' }, now), windowFor('month', now))
})

test('switching tabs keeps you near the day you were looking at', () => {
  const september = windowFor('month', at(5, 9, 8))
  assert.deepEqual(switchKind(september, 'week', now), windowFor('week', at(30, 9, 8)))
  assert.deepEqual(switchKind(september, 'range', now), rangeWindow(at(1, 9, 8), at(30, 9, 8)))
  assert.deepEqual(switchKind(windowFor('month', now), 'year', now), windowFor('year', now))
})
