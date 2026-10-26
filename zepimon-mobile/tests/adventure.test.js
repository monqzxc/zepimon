import test from 'node:test'
import assert from 'node:assert/strict'
import { BALLS_PER_KM, BERRIES_PER_KM, STOPS, freePlaySpec, restoreStars, safariStars, saveStars, stopUnlocked, walkingBonus } from '../src/games/adventure.ts'
import { SCORE_LIMITS, restoreScores, saveBestScore } from '../src/games/scores.ts'
import { emptyProgress } from '../src/progress.ts'

const now = new Date(2026, 9, 28, 12).getTime()
const run = (day, meters) => ({ id: String(day) + meters, family: ['Bulbasaur'],
  record: { meters, steps: 0, shiny: false, finishedAt: new Date(2026, 9, day, 9).toISOString() } })

test('the map alternates all three games and unlocks one stop at a time', () => {
  assert.equal(new Set(STOPS.map(stop => stop.id)).size, STOPS.length)
  for (const mode of ['guard', 'trail', 'safari']) assert.equal(STOPS.filter(stop => stop.mode === mode).length, 3)
  assert.ok(STOPS.every((stop, i) => !i || stop.mode !== STOPS[i - 1].mode))
  assert.equal(stopUnlocked({}, 0), true)
  assert.equal(stopUnlocked({}, 1), false)
  assert.equal(stopUnlocked({ 'route-1': 1 }, 1), true)
  assert.equal(stopUnlocked({ 'route-1': 3 }, 2), false)
  assert.equal(stopUnlocked({}, STOPS.length), false)
  const battles = STOPS.filter(stop => stop.mode !== 'safari')
  assert.ok(battles.every((stop, i) => !i || stop.spec.difficulty >= battles[i - 1].spec.difficulty), 'Difficulty only rises')
  assert.equal(STOPS.at(-1).spec.boss, 'Mewtwo')
})

test('stars keep the best result and ignore unknown or invalid saves', () => {
  const saved = saveStars({}, 'route-1', 2)
  assert.strictEqual(saveStars(saved, 'route-1', 1), saved)
  assert.deepEqual(saveStars(saved, 'route-1', 3), { 'route-1': 3 })
  assert.strictEqual(saveStars(saved, 'mt-moon', 0), saved)
  for (const [id, stars] of [['nowhere', 1], ['route-1', 4], ['route-1', 1.5], ['route-1', -1]]) assert.throws(() => saveStars(saved, id, stars), /Invalid/)
  assert.deepEqual(restoreStars({ 'route-1': 3, 'mt-moon': 0, 'pewter-trail': 2.5, nowhere: 3, 'victory-road': '3' }), { 'route-1': 3 })
  assert.deepEqual(restoreStars(null), {})
  assert.deepEqual([0, 2, 3, 4, 5, 6, 7, 20].map(safariStars), [0, 0, 1, 1, 2, 2, 3, 3])
})

test('walking this week adds a capped bonus and never removes anything', () => {
  assert.deepEqual(walkingBonus(emptyProgress(), now), { meters: 0, km: 0, balls: 0, berries: 0 })
  const progress = { ...emptyProgress(), runs: [run(26, 1500), run(27, 900), run(19, 9000)] }
  assert.deepEqual(walkingBonus(progress, now), { meters: 2400, km: 2, balls: 2 * BALLS_PER_KM, berries: 2 * BERRIES_PER_KM },
    'Only Monday-Sunday of this week counts')
  const long = { ...emptyProgress(), runs: [run(26, 15000)] }
  assert.equal(walkingBonus(long, now).km, 3)
  assert.equal(walkingBonus({ ...emptyProgress(), runs: [run(29, 5000)] }, now).km, 0, 'Future runs do not count')
})

test('free play covers every type and new arcade scores stay within their limits', () => {
  const spec = freePlaySpec('trail', () => 0.99)
  assert.equal(spec.waves, SCORE_LIMITS.trail)
  assert.equal(freePlaySpec('lanes', () => 0).waves, SCORE_LIMITS.guard)
  assert.equal(spec.foes.length, 17)
  assert.equal(spec.path, 'spiral')
  assert.deepEqual(saveBestScore({}, 'safari', SCORE_LIMITS.safari), { safari: SCORE_LIMITS.safari })
  assert.throws(() => saveBestScore({}, 'guard', 11), /Invalid/)
  assert.deepEqual(restoreScores({ guard: 10, trail: 13, safari: 4, quiz: 3 }), { guard: 10, safari: 4, quiz: 3 })
})
