import test from 'node:test'
import assert from 'node:assert/strict'
import { SAFARI_BALLS, ZONES, addSafariCatch, pauseSafari, readySafari, restoreSafariDex, resumeSafari, rollWild, shinyOdds, startSafari,
  wildRules, withSafariCatches } from '../src/games/safari.ts'
import { catchChance, FOE_HP } from '../src/games/legendary-battle.ts'
import { wildPool } from '../src/games/roster.ts'
import { dexEntries } from '../src/journal.ts'
import { emptyProgress, missions } from '../src/progress.ts'

const always = value => () => value
const rolls = (...values) => () => values.shift() ?? 0.5

test('rounds start with 24 Safari Balls plus the bonus, and pause without losing anything', () => {
  assert.equal(SAFARI_BALLS, 24)
  assert.equal(readySafari('lake', 6).balls, SAFARI_BALLS + 6)
  const game = startSafari('meadow', 3)
  assert.deepEqual([game.status, game.balls, game.encounter, game.catches], ['playing', SAFARI_BALLS + 3, null, []])
  const paused = pauseSafari(game)
  assert.equal(paused.status, 'paused')
  assert.strictEqual(pauseSafari(paused), paused)
  assert.deepEqual(resumeSafari(paused), game)
  assert.strictEqual(resumeSafari(game), game)
})

test('Shiny odds start at 1 in 100 and a chain improves them to 1 in 8', () => {
  const game = startSafari('meadow', 0)
  const chained = count => ({ ...game, chain: { name: 'Pidgey', count } })
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(count => shinyOdds(chained(count), 'Pidgey')), [100, 77, 54, 31, 8, 8])
  assert.equal(shinyOdds(chained(3), 'Rattata'), 100)
})

test('a wild Pokemon comes from its zone pool, and is Shiny when the roll is under the odds', () => {
  const game = startSafari('meadow', 0)
  for (const zone of Object.keys(ZONES)) {
    const wild = rollWild(game, zone, always(0.5))
    assert.ok(wildPool(ZONES[zone].types).some(item => item.name === wild.name), `${wild.name} lives in the ${zone}`)
    assert.equal(wild.shiny, false)
  }
  assert.equal(rollWild(game, 'lake', rolls(0.5, 0.0099)).shiny, true)
  assert.equal(rollWild(game, 'lake', rolls(0.5, 0.01)).shiny, false)
})

test('the chained species comes back 35% of the time when it lives in that zone, with its better Shiny odds', () => {
  const lake = wildPool(ZONES.lake.types)
  const name = lake.at(-1).name
  assert.notEqual(lake[0].name, name)
  const chained = { ...startSafari('lake', 0), chain: { name, count: 2 } }
  assert.deepEqual(rollWild(chained, 'lake', rolls(0.34, 0.99)), { name, shiny: false })
  assert.equal(rollWild(chained, 'lake', rolls(0.35, 0, 0.99)).name, lake[0].name)
  assert.equal(rollWild(chained, 'lake', rolls(0.34, 1 / 54 - 0.001)).shiny, true)
  assert.equal(rollWild(chained, 'meadow', rolls(0, 0.99)).name, wildPool(ZONES.meadow.types)[0].name, 'Not in a zone it does not live in')
})

test('evolved Pokemon are higher level and harder to catch at full HP; weakening helps them all', () => {
  const [first, middle, last, single] = ['Bulbasaur', 'Ivysaur', 'Venusaur', "Farfetch'd"].map(wildRules)
  assert.ok(first.level < middle.level && middle.level < last.level)
  assert.ok(first.ease > middle.ease && middle.ease > last.ease)
  assert.deepEqual(single, middle, 'A Pokemon that never evolves counts as a middle stage')
  for (const { ease } of [first, middle, last]) {
    assert.equal(catchChance(FOE_HP, ease), ease)
    assert.ok(catchChance(1, ease) > 0.85 && catchChance(50, ease) > ease)
  }
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
