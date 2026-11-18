import test from 'node:test'
import assert from 'node:assert/strict'
import { LEVELS, buddyAt, emptyFriendship, friendshipLevel, friendshipMeters, heartsFor, heartsText, levelUps, logBuddy, markSeen,
  restoreFriendship } from '../src/friendship.ts'
import { allAdventures } from '../src/adventures.ts'
import { emptyProgress } from '../src/progress.ts'

const day = 864e5
const start = Date.UTC(2026, 10, 17, 6, 0)
const run = (id, startedAt, meters, finishedAt = startedAt + 36e5) => ({ id, family: ['Pichu', 'Pikachu', 'Raichu'],
  record: { meters, steps: 0, shiny: false, startedAt, finishedAt: new Date(finishedAt).toISOString() } })

test('the log records each change once, in time order', () => {
  let friendship = logBuddy(emptyFriendship(), 'Pikachu', start)
  friendship = logBuddy(friendship, 'Pikachu', start + day)
  assert.equal(friendship.log.length, 1, 'choosing the same buddy again adds nothing')
  friendship = logBuddy(friendship, 'Shiny Pikachu', start + 2 * day)
  friendship = logBuddy(friendship, null, start + day)
  assert.deepEqual(friendship.log.map(row => row.key), ['Pikachu', 'Shiny Pikachu', null])
  assert.equal(friendship.log[2].at, start + 2 * day, 'a clock that stepped back never reorders the log')
  assert.deepEqual(logBuddy(emptyFriendship(), null, start).log, [{ key: null, at: start }], 'the first row starts the log, even without a buddy')
})

test('an adventure belongs to the buddy you had when it started', () => {
  const log = [{ key: 'Pikachu', at: start }, { key: 'Eevee', at: start + 2 * day }, { key: null, at: start + 4 * day }]
  assert.equal(buddyAt(log, start - 1), null, 'before the log began')
  assert.equal(buddyAt(log, start), 'Pikachu')
  assert.equal(buddyAt(log, start + 3 * day), 'Eevee')
  assert.equal(buddyAt(log, start + 5 * day), null)
  const meters = friendshipMeters([
    run('before', start - day, 9000),
    run('a', start + 36e5, 5000),
    run('b', start + day, 3000),
    // Started with Pikachu, finished after the change: still Pikachu's.
    run('c', start + 2 * day - 36e5, 4000, start + 2 * day + 36e5),
    run('d', start + 3 * day, 7000),
    run('alone', start + 5 * day, 2000),
    run('empty', start + day, 0)
  ], log)
  assert.deepEqual(meters, { Pikachu: 12000, Eevee: 7000 })
})

test('a watch adventure synced later still counts for the buddy it walked with', () => {
  const log = [{ key: 'Pikachu', at: start }, { key: 'Eevee', at: start + 3 * day }]
  const synced = run('watch', start + day, 6000)
  assert.deepEqual(friendshipMeters([synced], log), { Pikachu: 6000 })
})

test('without a start time, the finish decides; nothing counts before the log', () => {
  const log = [{ key: 'Pikachu', at: start }]
  const noStart = { ...run('x', start, 4000), record: { ...run('x', start, 4000).record, startedAt: null } }
  const badStart = { ...run('y', start, 1000), record: { ...run('y', start, 1000).record, startedAt: start + 9 * day } }
  assert.deepEqual(friendshipMeters([noStart, badStart], log), { Pikachu: 5000 })
  assert.deepEqual(friendshipMeters([noStart], []), {})
})

test('Normal and Shiny are separate friends', () => {
  const log = [{ key: 'Pikachu', at: start }, { key: 'Shiny Pikachu', at: start + day }]
  assert.deepEqual(friendshipMeters([run('a', start, 5000), run('b', start + 2 * day, 8000)], log), { Pikachu: 5000, 'Shiny Pikachu': 8000 })
})

test('an adventure saved on both devices counts once', () => {
  const log = [{ key: 'Pikachu', at: start }]
  const watch = run('watch', start + 36e5, 5000)
  const progress = { ...emptyProgress(), runs: [watch, { ...watch, id: 'phone-copy', record: { ...watch.record, meters: 5100 } }] }
  assert.deepEqual(friendshipMeters(allAdventures(progress, [], start + day), log), { Pikachu: 5100 })
})

test('hearts and levels at their boundaries', () => {
  assert.deepEqual(LEVELS.map(level => level.meters), [5000, 25000, 75000, 150000, 300000])
  assert.equal(heartsFor(0), 0)
  assert.equal(heartsFor(4999), 0)
  assert.equal(heartsFor(5000), 1)
  assert.equal(heartsFor(74999), 2)
  assert.equal(heartsFor(300000), 5)
  assert.equal(heartsFor(900000), 5)
  assert.deepEqual(friendshipLevel(15000), { hearts: 1, title: 'Walking pals', next: LEVELS[1], toNext: 10000, progress: 0.5 })
  assert.deepEqual(friendshipLevel(0).title, 'Just met')
  const best = friendshipLevel(400000)
  assert.deepEqual([best.hearts, best.next, best.toNext, best.progress], [5, null, null, 1])
  assert.equal(heartsText(2), '♥♥♡♡♡')
})

test('a level-up is celebrated once', () => {
  const meters = { Pikachu: 26000, Eevee: 4000, Mew: 80000 }
  const ups = levelUps(meters, {})
  assert.deepEqual(ups, [{ key: 'Mew', hearts: 3, title: 'Great friends' }, { key: 'Pikachu', hearts: 2, title: 'Good friends' }])
  const friendship = markSeen(emptyFriendship(), meters)
  assert.deepEqual(levelUps(meters, friendship.seen), [])
  assert.deepEqual(levelUps({ ...meters, Pikachu: 76000 }, friendship.seen), [{ key: 'Pikachu', hearts: 3, title: 'Great friends' }])
})

test('saved friendship is read back safely', () => {
  const saved = { log: [{ key: 'Eevee', at: start + day }, { key: 'Pikachu', at: start }, { key: 5, at: start }, { key: 'X', at: -1 }, null],
    seen: { Pikachu: 2, Eevee: 9, Mew: 'a' } }
  assert.deepEqual(restoreFriendship(saved), { log: [{ key: 'Pikachu', at: start }, { key: 'Eevee', at: start + day }], seen: { Pikachu: 2 } })
  assert.deepEqual(restoreFriendship(undefined), emptyFriendship())
  assert.deepEqual(restoreFriendship('nonsense'), emptyFriendship())
})
