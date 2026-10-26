import test from 'node:test'
import assert from 'node:assert/strict'
import { PATCHES, RING_MS, RUSTLE_MS, SAFARI_BALLS, SAFARI_DURATION, ZONES, addSafariCatch, approachPatch, catchChance, fleeChance,
  pauseSafari, readySafari, restoreSafariDex, resumeSafari, ringScale, runAway, shinyOdds, startSafari, throwBait, throwBall,
  throwQuality, throwRock, tickSafari, withSafariCatches } from '../src/games/safari.ts'
import { wildPool } from '../src/games/roster.ts'
import { dexEntries } from '../src/journal.ts'
import { emptyProgress, missions } from '../src/progress.ts'

const always = value => () => value
const rolls = (...values) => () => values.shift() ?? 0.5
const meet = (game = startSafari('meadow', 0, 0, always(0)), now = 100, random = always(0)) => approachPatch(game, game.rustle, now, random)

test('rounds start with bonus balls and rustle a different patch every few seconds', () => {
  assert.equal(readySafari('lake', 6).balls, SAFARI_BALLS + 6)
  let game = startSafari('meadow', 3, 1000, always(0.5))
  assert.equal(game.status, 'playing')
  assert.equal(game.balls, SAFARI_BALLS + 3)
  const seen = [game.rustle]
  for (let i = 1; i <= 20; i++) {
    game = tickSafari(game, 1000 + i * RUSTLE_MS, always((i % 7) / 7))
    assert.notEqual(game.rustle, seen.at(-1), 'The same patch never rustles twice in a row')
    assert.ok(game.rustle >= 0 && game.rustle < PATCHES)
    seen.push(game.rustle)
  }
})

test('only the rustling patch hides a Pokemon, and a new one waits until the encounter ends', () => {
  const game = startSafari('meadow', 0, 0, always(0))
  const quiet = approachPatch(game, (game.rustle + 1) % PATCHES, 100)
  assert.equal(quiet.encounter, null)
  const found = meet(game)
  assert.ok(found.encounter)
  assert.ok(wildPool(ZONES.meadow.types).some(wild => wild.name === found.encounter.name))
  assert.match(found.message, /appeared/)
  assert.strictEqual(approachPatch(found, found.rustle, 100), found)
  const left = runAway(found, 200)
  assert.equal(left.encounter, null)
  assert.equal(left.rustle, -1)
  assert.equal(left.balls, found.balls, 'Running costs nothing')
})

test('the ring shrinks on a loop and smaller rings make better throws', () => {
  const found = meet()
  assert.equal(ringScale(found), 1)
  assert.equal(throwQuality(ringScale({ ...found, elapsed: found.elapsed + RING_MS * 0.9 })), 'excellent')
  assert.equal(throwQuality(ringScale({ ...found, elapsed: found.elapsed + RING_MS * 0.6 })), 'great')
  assert.equal(throwQuality(ringScale({ ...found, elapsed: found.elapsed + RING_MS * 0.1 })), 'nice')
  assert.equal(ringScale({ ...found, elapsed: found.elapsed + RING_MS }), 1, 'The ring starts over')
  assert.ok(catchChance('Bulbasaur', 'calm', 'excellent') > catchChance('Bulbasaur', 'calm', 'nice'))
  assert.ok(catchChance('Bulbasaur', 'calm', 'nice') > catchChance('Venusaur', 'calm', 'nice'), 'Evolved Pokemon are harder to catch')
})

test('bait calms a Pokemon but makes it harder to catch; rocks do the opposite', () => {
  assert.ok(fleeChance('Pidgey', 'eating') < fleeChance('Pidgey', 'calm'))
  assert.ok(catchChance('Pidgey', 'eating', 'nice') < catchChance('Pidgey', 'calm', 'nice'))
  assert.ok(fleeChance('Pidgey', 'angry') > fleeChance('Pidgey', 'calm'))
  assert.ok(catchChance('Pidgey', 'angry', 'nice') > catchChance('Pidgey', 'calm', 'nice'))
  const found = meet()
  const fed = throwBait(found, 200, always(0.99))
  assert.equal(fed.encounter.mood, 'eating')
  assert.equal(fed.balls, found.balls, 'Bait and rocks do not use balls')
  assert.equal(throwRock(fed, 300, always(0.99)).encounter.mood, 'angry')
  assert.equal(throwRock(found, 300, always(0)).encounter, null, 'A rock can scare the Pokemon away')
})

test('catches build a Shiny chain; fleeing breaks it', () => {
  let game = meet(undefined, 100, always(0.5))
  assert.equal(game.encounter.shiny, false)
  const name = game.encounter.name
  game = throwBall(game, 200, always(0))
  assert.deepEqual(game.catches, [{ name, shiny: false }])
  assert.deepEqual(game.chain, { name, count: 1 })
  assert.equal(game.balls, SAFARI_BALLS - 1)
  assert.match(game.message, /Gotcha/)
  assert.equal(shinyOdds(game, name), 47)
  assert.equal(shinyOdds({ ...game, chain: { name, count: 9 } }, name), 8, 'Chains top out at 1 in 8')
  assert.equal(shinyOdds(game, 'Somebody else'), 60)
  const again = { ...game, encounter: { name, shiny: false, mood: 'calm', since: game.elapsed } }
  assert.equal(throwBall(again, 300, always(0)).chain.count, 2)
  const fled = throwBall(again, 300, rolls(0.99, 0))
  assert.equal(fled.encounter, null)
  assert.deepEqual(fled.chain, { name: '', count: 0 })
  assert.match(fled.message, /ran away/)
  const shiny = approachPatch({ ...game, rustle: 4 }, 4, 300, always(0))
  assert.equal(shiny.encounter.shiny, true, 'A roll under the odds is Shiny')
})

test('the round ends when the last ball is thrown or time runs out; pause keeps the clock', () => {
  const last = { ...meet(), balls: 1 }
  const missed = throwBall(last, 200, rolls(0.99, 0.99))
  assert.equal(missed.status, 'complete')
  assert.equal(missed.balls, 0)
  assert.strictEqual(throwBall(missed, 300), missed)
  const timeUp = tickSafari(startSafari('night', 0, 0), SAFARI_DURATION + 50)
  assert.equal(timeUp.status, 'complete')
  assert.equal(timeUp.elapsed, SAFARI_DURATION)
  const paused = pauseSafari(startSafari('night', 0, 0), 1000)
  assert.equal(paused.status, 'paused')
  assert.strictEqual(tickSafari(paused, 90000), paused)
  assert.strictEqual(approachPatch(paused, paused.rustle, 90000), paused)
  assert.equal(tickSafari(resumeSafari(paused, 90000), 90500).elapsed, 1500)
})

test('Safari catches join the Dex with no walking record, never hide watch records, and skip walking badges', () => {
  let dex = addSafariCatch({}, 'Pidgey', false, Date.UTC(2026, 9, 26))
  dex = addSafariCatch(dex, 'Pidgey', true, Date.UTC(2026, 9, 26))
  assert.deepEqual(dex.Pidgey, { meters: 0, steps: 0, shiny: false, source: 'safari', finishedAt: '2026-10-26T00:00:00.000Z' })
  assert.equal(dex['Shiny Pidgey'].shiny, true)
  assert.strictEqual(addSafariCatch(dex, 'Pidgey', false), dex, 'A repeat catch changes nothing')
  assert.strictEqual(addSafariCatch(dex, 'Mewtwo', false), dex, 'Legendaries cannot be caught')
  assert.deepEqual(restoreSafariDex(JSON.parse(JSON.stringify(dex))), dex)
  assert.deepEqual(restoreSafariDex({ Pidgey: { ...dex.Pidgey, source: 'expedition' }, Mewtwo: dex.Pidgey, 'Shiny Rattata': dex.Pidgey, Bulbasaur: dex.Pidgey }),
    { Bulbasaur: dex.Pidgey }, 'Invalid entries are skipped without losing the rest')
  assert.deepEqual(restoreSafariDex(undefined), {})
  assert.deepEqual(restoreSafariDex([1]), {})

  const watch = { meters: 6000, steps: 8000, shiny: false, finishedAt: '2026-10-20T08:00:00.000Z' }
  const journal = { exportVersion: 1, app: 'Zepimon', exportedAt: '2026-10-26T00:00:00.000Z', receivedAt: null, routes: [],
    snapshot: { schemaVersion: 1, capturedAt: 0, dex: { Pidgey: watch }, records: {}, active: null } }
  const merged = withSafariCatches(journal, { ...dex, Rattata: dex.Pidgey })
  assert.equal(merged.snapshot.dex.Pidgey, watch, 'The watch record wins')
  assert.equal(merged.snapshot.dex.Rattata.source, 'safari')
  assert.equal(withSafariCatches(null, dex), null)
  assert.strictEqual(withSafariCatches(journal, {}), journal)
  assert.equal(dexEntries(merged).length, 2)
  const team = missions(merged, emptyProgress()).find(mission => mission.id === 'ten-friends')
  const sparkle = missions(merged, emptyProgress()).find(mission => mission.id === 'shiny-friend')
  assert.equal(team.value, 1, 'Only the walked Pidgey counts toward A growing team')
  assert.equal(sparkle.value, 0, 'A Safari Shiny does not earn the Shiny badge')
})
