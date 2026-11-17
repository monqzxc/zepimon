import test from 'node:test'
import assert from 'node:assert/strict'
import { HELPERS, terrain, MAX_WILD, ROAM_MS, ROAM_SPREAD_MS, SPAWN_FAR, SPAWN_MS, SPAWN_NEAR, WANDER_OFF, areaAt, confirmLeave, isWalkable,
  planHunt, planWalk, pointKey, reachableFrom, roam, runAway, safariMap, startZone, stayInZone, throwBall, throwBerry, throwRock, tileAt, walk, zoneBudget,
  routeSearch, routeTo } from '../src/games/safari-zone.ts'
import { RING_MS, ZONES, likesBerry, livesInWater, pauseSafari } from '../src/games/safari.ts'
import { wildPool } from '../src/games/roster.ts'

const always = value => () => value
const rolls = (...values) => () => values.shift() ?? 0.5
// A test map: every start sits on '@', and areas default to meadow ('m') with the gate area ('g') on '@' and 'G' rows.
function fixture(tiles, areas = tiles.map(row => [...row].map(c => '@G#'.includes(c) ? 'g' : 'm').join(''))) {
  const y = tiles.findIndex(row => row.includes('@')), at = { x: tiles[y].indexOf('@'), y }
  return { cols: tiles[0].length, rows: tiles.length, chunk: 8, tiles, areas, chunks: {},
    starts: { gate: at, meadow: at, lake: at, desert: at, night: at, cave: at } }
}
const place = (game, x, y, facing = 'north') => ({ ...game, at: { x, y }, buddy: { x, y }, facing })
const ROOM = fixture([
  'TTTTTTTT',
  'T......T',
  'T.R..~.T',
  'T.vvv..T',
  'T....>.T',
  'T.o...ST',
  'TTT@TTTT',
  'TTTGTTTT'])
const g = startZone('gate', 0, 0, ROOM)
const go = (game, direction, map = ROOM) => walk(game, direction, map)

test('budget: 800 steps and 24 balls, plus 100 steps and 6 balls per km up to 3 km', () => {
  assert.deepEqual(zoneBudget(0), { steps: 800, balls: 24 })
  assert.deepEqual(zoneBudget(2), { steps: 1000, balls: 36 })
  assert.deepEqual(zoneBudget(7), { steps: 1100, balls: 42 })
  assert.deepEqual(zoneBudget(1.9), { steps: 900, balls: 30 })
  assert.deepEqual(zoneBudget(-1), { steps: 800, balls: 24 })
  const start = startZone('gate', 2, 0, ROOM)
  assert.deepEqual([start.steps, start.balls, start.at, start.status, start.wilds], [1000, 36, { x: 3, y: 6 }, 'playing', []])
  assert.equal(start.message, 'Welcome to the Safari Zone! You have 1000 steps and 36 Safari Balls.')
})

test('the gate start faces away from the gate house door, as if just stepped out; area starts face north', () => {
  assert.equal(startZone('gate', 0, 0, ROOM).facing, 'south')
  assert.equal(startZone('meadow', 0, 0, ROOM).facing, 'north')
})

test('a step moves one tile and costs one step; the buddy takes the old tile', () => {
  const { game, move, events } = go(g, 'north')
  assert.equal(move, 'step')
  assert.deepEqual([game.at, game.buddy, game.buddyFacing], [{ x: 3, y: 5 }, { x: 3, y: 6 }, 'north'])
  assert.deepEqual([game.steps, game.taken], [799, 1])
  assert.ok(events.includes('area'))
  assert.equal(game.message, 'You entered the Sunny meadow.')
})

test('bumping costs nothing and names what is in the way', () => {
  const tree = go(place(g, 1, 1), 'north')
  assert.deepEqual([tree.move, tree.game.steps, tree.game.facing, tree.game.message], ['bump', 800, 'north', 'A tree is in the way.'])
  assert.equal(go(place(g, 2, 1), 'south').game.message, 'A boulder is in the way.')
  assert.equal(go(place(g, 5, 1), 'south').game.message, 'The water is too deep to cross. Lapras, by the river, could carry you.')
  const edge = fixture(['@.'])
  const outside = go(startZone('gate', 0, 0, edge), 'north', edge)
  assert.deepEqual([outside.move, outside.game.message], ['bump', 'A wall is in the way.'])
})

test('ledges are crossed downhill only, two tiles for one step', () => {
  const hop = go(place(g, 3, 2), 'south')
  assert.deepEqual([hop.move, hop.game.at, hop.game.buddy, hop.game.steps], ['hop', { x: 3, y: 4 }, { x: 3, y: 3 }, 799])
  const climb = go(place(g, 3, 4), 'north')
  assert.deepEqual([climb.move, climb.game.message], ['bump', "You can't climb the ledge."])
  assert.equal(go(place(g, 1, 3, 'east'), 'east').move, 'bump')
  const east = go(place(g, 4, 4), 'east')
  assert.deepEqual([east.move, east.game.at], ['hop', { x: 6, y: 4 }])
  assert.equal(go(east.game, 'west').move, 'bump')
})

test('items give 3 Safari Balls once per round', () => {
  const found = go(place(g, 3, 5), 'west')
  assert.deepEqual([found.game.balls, found.game.items], [g.balls + 3, ['2,5']])
  assert.ok(found.events.includes('item'))
  assert.equal(found.game.message, 'You found 3 Safari Balls!')
  const again = go(go(found.game, 'east').game, 'west')
  assert.equal(again.game.balls, g.balls + 3)
  assert.ok(!again.events.includes('item'))
})

test('walking up to a sign reads it each time you arrive next to it', () => {
  const read = go(place(g, 4, 5), 'east')
  assert.ok(read.events.includes('sign'))
  assert.equal(read.game.message, 'Sunny meadow · Grass, Bug, Normal, Electric and Fairy types')
  const away = go(read.game, 'west')
  assert.ok(!away.events.includes('sign'))
  assert.ok(go(away.game, 'east').events.includes('sign'))
})

test('the gate asks before you leave, and staying costs nothing', () => {
  const asked = go(g, 'south')
  assert.deepEqual([asked.move, asked.game.prompt, asked.events, asked.game.steps, asked.game.facing],
    ['none', 'gate', ['gate'], 800, 'south'])
  assert.equal(asked.game.message, 'Leave the Safari Zone?')
  assert.equal(go(asked.game, 'north').move, 'none')
  assert.equal(stayInZone(asked.game).prompt, null)
  const left = confirmLeave(asked.game)
  assert.deepEqual([left.status, left.message, left.prompt], ['complete', 'You left the Safari Zone.', null])
})

test('nothing moves during an encounter, a prompt, a pause or after the round', () => {
  for (const frozen of [{ ...g, encounter: { id: 1, name: 'Pidgey', shiny: false } }, { ...g, prompt: 'gate' },
    pauseSafari(g), { ...g, status: 'complete' }, { ...g, steps: 0 }]) {
    const result = go(frozen, 'north')
    assert.equal(result.move, 'none')
    assert.strictEqual(result.game, frozen)
  }
})

const FIELD = fixture(['TTTTTTTTT', 'T.ggggggT', 'T.ggggggT', 'T...@...T', 'TTTTGTTTT'])
const f = startZone('gate', 0, 0, FIELD)
const east = (game, map = FIELD) => walk(game, 'east', map)
const wild = (x, y, more = {}) => ({ id: 1, name: 'Pidgey', shiny: false, at: { x, y }, facing: 'south', steps: 0, moveAt: 0, ...more })
const far = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))

test('stepping into grass is announced, and never starts an encounter by itself', () => {
  const into = walk({ ...place(f, 2, 3), area: 'meadow' }, 'north', FIELD)
  assert.equal(into.game.message, 'You stepped into tall grass.')
  let game = place(f, 1, 1)
  for (let i = 0; i < 6; i++) {
    const result = east(game)
    assert.deepEqual([result.move, result.game.encounter], ['step', null])
    game = result.game
  }
})

test('the first roam brings a Pokemon out near the trainer, then one more every 1.5 s, three at most', () => {
  const start = { ...place(f, 4, 3), area: 'gate' }
  const waiting = { ...start, spawnAt: 500 }
  assert.strictEqual(roam(waiting, 499, always(0.5), FIELD), waiting)
  let game = roam(start, 0, always(0.5), FIELD)
  assert.equal(game.wilds.length, 1)
  const [first] = game.wilds
  assert.deepEqual([first.id, first.shiny, first.steps, game.spawnAt], [1, false, 0, SPAWN_MS])
  assert.ok(wildPool(ZONES.meadow.types).some(item => item.name === first.name))
  assert.ok(far(first.at, game.at) >= SPAWN_NEAR && far(first.at, game.at) <= SPAWN_FAR)
  assert.ok('.g'.includes(tileAt(first.at, FIELD)) && areaAt(first.at, FIELD) !== 'gate')
  // Rolls of 0.1 make every Pokemon rest, so only the spawns change the map.
  for (let now = 100; now <= 20000; now += 100) game = roam(game, now, always(0.1), FIELD)
  assert.equal(game.wilds.length, MAX_WILD)
  assert.deepEqual(game.wilds.map(item => item.id), [1, 2, 3])
  assert.equal(new Set(game.wilds.map(item => pointKey(item.at))).size, MAX_WILD, 'No two share a tile')
})

test('roam changes nothing, and returns the same game, until something is due', () => {
  const quiet = { ...place(f, 4, 3), wilds: [wild(2, 1, { moveAt: 900 })], spawnAt: 5000 }
  assert.strictEqual(roam(quiet, 899, always(0.5), FIELD), quiet)
  for (const frozen of [{ ...quiet, encounter: { id: 1, name: 'Pidgey', shiny: false } }, { ...quiet, prompt: 'gate' }, pauseSafari(quiet),
    { ...quiet, status: 'complete' }]) assert.strictEqual(roam(frozen, 99999, always(0.5), FIELD), frozen)
})

test('a wild Pokemon strolls one tile at a time over open ground and grass, or rests', () => {
  const game = { ...place(f, 4, 3), wilds: [wild(2, 1, { moveAt: 900 })], spawnAt: 99999 }
  // Rolls: rest?, the wait, then the direction (north, south, west, east by quarter).
  const stepped = roam(game, 900, rolls(0.9, 0.5, 0.6), FIELD).wilds[0]
  assert.deepEqual([stepped.at, stepped.facing, stepped.steps], [{ x: 1, y: 1 }, 'west', 1])
  assert.ok(stepped.moveAt >= 900 + ROAM_MS && stepped.moveAt < 900 + ROAM_MS + ROAM_SPREAD_MS)
  const rested = roam(game, 900, rolls(0.29, 0.5), FIELD).wilds[0]
  assert.deepEqual([rested.at, rested.facing, rested.steps], [{ x: 2, y: 1 }, 'south', 0])
  const blocked = roam(game, 900, rolls(0.9, 0.5, 0), FIELD).wilds[0]
  assert.deepEqual([blocked.at, blocked.facing, blocked.steps], [{ x: 2, y: 1 }, 'north', 0], 'A tree: it only turns')
})

test('a wild Pokemon never steps onto the trainer, the buddy or another Pokemon, or out of its area', () => {
  const south = [0.9, 0.5, 0.3]
  const at = (game, random) => roam(game, 900, rolls(...random), FIELD).wilds[0].at
  const base = { ...place(f, 6, 1), buddy: { x: 6, y: 1 }, spawnAt: 99999 }
  assert.deepEqual(at({ ...base, wilds: [wild(2, 1, { moveAt: 900 })] }, south), { x: 2, y: 2 })
  assert.deepEqual(at({ ...base, at: { x: 2, y: 2 }, wilds: [wild(2, 1, { moveAt: 900 })] }, south), { x: 2, y: 1 })
  assert.deepEqual(at({ ...base, buddy: { x: 2, y: 2 }, wilds: [wild(2, 1, { moveAt: 900 })] }, south), { x: 2, y: 1 })
  assert.deepEqual(at({ ...base, wilds: [wild(2, 1, { moveAt: 900 }), wild(2, 2, { id: 2, moveAt: 99999 })] }, south), { x: 2, y: 1 })
  assert.deepEqual(at({ ...base, wilds: [wild(3, 2, { moveAt: 900 })] }, south), { x: 3, y: 3 }, 'Open ground in the meadow')
  const gated = fixture(['TTTTT', 'T.g.T', 'T.@.T', 'TTGTT'])
  const moved = roam({ ...place(startZone('gate', 0, 0, gated), 1, 2), wilds: [wild(2, 1, { moveAt: 900 })], spawnAt: 99999 }, 900, rolls(...south), gated)
  assert.deepEqual(moved.wilds[0].at, { x: 2, y: 1 }, 'It stays in the area it lives in')
})

test('a Pokemon left more than 10 tiles behind wanders off, making room for a new one', () => {
  const wide = fixture(['T' + '.'.repeat(20) + 'T', 'T@' + '.'.repeat(19) + 'T', 'TG' + 'T'.repeat(20)])
  const game = { ...place(startZone('gate', 0, 0, wide), 2, 0), wilds: [wild(2 + WANDER_OFF, 0, { moveAt: 99999 }), wild(3 + WANDER_OFF, 0, { id: 2, moveAt: 99999 })], spawnAt: 0, spawned: 2 }
  const next = roam(game, 100, always(0.5), wide)
  assert.deepEqual(next.wilds.map(item => item.id), [1])
  assert.equal(next.spawnAt, 100 + SPAWN_MS)
  const later = roam(next, 100 + SPAWN_MS, always(0.5), wide)
  assert.deepEqual(later.wilds.map(item => item.id), [1, 3])
})

test('with nowhere to stand nearby, nothing comes out', () => {
  const tiny = fixture(['TTTT', 'T@.T', 'TGTT'])
  const game = roam(startZone('gate', 0, 0, tiny), 0, always(0.5), tiny)
  assert.deepEqual([game.wilds, game.spawnAt], [[], SPAWN_MS])
})

test('walking into a wild Pokemon makes it notice you: it hops back a tile, turns to face you and the encounter begins, at no cost', () => {
  const game = { ...place(f, 2, 2), wilds: [wild(3, 2, { shiny: true }), wild(6, 1, { id: 2, name: 'Rattata' })] }
  const met = walk(game, 'east', FIELD, 1234)
  assert.deepEqual([met.move, met.events, met.game.steps, met.game.at, met.game.facing], ['bump', ['encounter'], 800, { x: 2, y: 2 }, 'east'])
  assert.deepEqual(met.game.encounter, { id: 1, name: 'Pidgey', shiny: true, mood: 'calm', since: 1234 })
  assert.deepEqual([met.game.wilds[0].facing, met.game.wilds[0].at, met.game.wilds[1].facing], ['west', { x: 4, y: 2 }, 'south'])
  assert.equal(met.game.act, null, 'A new encounter starts with nothing thrown')
  const walled = east({ ...place(f, 6, 2), wilds: [wild(7, 2)] }).game
  assert.deepEqual(walled.wilds[0].at, { x: 7, y: 2 }, 'With no room behind it, it stays put')
  const crowded = east({ ...place(f, 2, 2), wilds: [wild(3, 2), wild(4, 2, { id: 2 })] }).game
  assert.deepEqual(crowded.wilds[0].at, { x: 3, y: 2 }, 'Nor does it hop onto another Pokemon')
  assert.equal(met.game.message, 'Shiny Pidgey noticed you!')
  assert.equal(met.game.zone, 'meadow')
  assert.equal(east(met.game).move, 'none', 'Nothing moves until the battle is over')
  assert.strictEqual(roam(met.game, 99999, always(0.5), FIELD), met.game)
})

test('a Pokemon standing below a ledge blocks the hop', () => {
  const hop = go({ ...place(g, 3, 2), wilds: [wild(3, 4)] }, 'south')
  assert.deepEqual([hop.move, hop.game.at, hop.game.encounter, hop.game.message], ['bump', { x: 3, y: 2 }, null, 'Pidgey is in the way below the ledge.'])
})

const met = east({ ...place(f, 2, 2), wilds: [wild(3, 2), wild(6, 1, { id: 2, name: 'Rattata' })] }).game

// m meadow, k desert, c cave; L Lapras, F Ampharos, D Flygon.
const WILDS = fixture([
  'TTTTTTTTTT',
  'T..~~....T',
  'T.L~~.D..T',
  'T..~~....T',
  'T@....F..T',
  'TGTTTTTTTT'], ['mmmmmmmkkk', 'mmmmmmmkkk', 'mmmmmmmkkk', 'mmmmmmmccc', 'mgmmmmmccc', 'mgmmmmmmmm'])
const w = { ...startZone('gate', 0, 0, WILDS), area: 'meadow' }
const step = (game, direction) => walk(game, direction, WILDS)

test('walking into a helper Pokemon gets its help for the round, once, at no cost', () => {
  assert.deepEqual(w.helps, [])
  const asked = step(place(w, 1, 2), 'east')
  assert.deepEqual([asked.move, asked.events, asked.game.helps, asked.game.steps, asked.game.at], ['bump', ['help'], ['ride'], 800, { x: 1, y: 2 }])
  assert.equal(asked.game.message, HELPERS.L.offer)
  const again = step(asked.game, 'east')
  assert.deepEqual([again.move, again.events, again.game.helps, again.game.message], ['bump', [], ['ride'], 'Lapras is already helping you.'])
  assert.deepEqual(step(place(asked.game, 5, 4), 'east').game.helps, ['ride', 'flash'])
  assert.deepEqual(step(place(w, 6, 3), 'north').game.helps, ['goggles'])
  assert.deepEqual(startZone('gate', 0, 0, WILDS).helps, [], 'A new round starts with no help')
})

test('water is crossed only on Lapras; the buddy waits out of sight and falls in behind after landing', () => {
  const dry = step(place(w, 2, 1), 'east')
  assert.deepEqual([dry.move, dry.game.at], ['bump', { x: 2, y: 1 }])
  const rider = { ...place(w, 2, 1), helps: ['ride'] }
  const afloat = step(rider, 'east')
  assert.deepEqual([afloat.move, afloat.game.at, afloat.game.buddy, afloat.game.steps, afloat.game.message], ['step', { x: 3, y: 1 }, { x: 3, y: 1 }, 799, 'You climbed onto Lapras.'])
  const across = step(step(afloat.game, 'east').game, 'east')
  assert.deepEqual([across.game.at, across.game.buddy], [{ x: 5, y: 1 }, { x: 5, y: 1 }], 'Just landed')
  assert.deepEqual(step(across.game, 'east').game.buddy, { x: 5, y: 1 })
})

test('the sandstorm keeps you out of the desert until Flygon gives you goggles', () => {
  const stopped = step(place(w, 6, 1), 'east')
  assert.deepEqual([stopped.move, stopped.game.at, stopped.game.steps], ['bump', { x: 6, y: 1 }, 800])
  assert.equal(stopped.game.message, 'The sandstorm is too fierce to walk into. Flygon, by the desert path, has goggles to spare.')
  const lurking = { ...place(w, 6, 1), wilds: [wild(7, 1)] }
  assert.equal(step(lurking, 'east').game.encounter, null, 'Nor can you reach a Pokemon inside it')
  const entered = step({ ...place(w, 6, 1), helps: ['goggles'] }, 'east')
  assert.deepEqual([entered.move, entered.game.area, entered.game.message], ['step', 'desert', 'You entered the Sandstorm desert.'])
  const inside = { ...place(w, 8, 1), area: 'desert' }
  assert.equal(step(inside, 'south').move, 'step', 'A round that starts in the desert walks it freely')
})

test('the cave can be entered in the dark, and says who knows Flash', () => {
  const lit = step({ ...place(w, 6, 3), helps: ['flash'] }, 'east')
  assert.deepEqual([lit.move, lit.game.area, lit.game.message], ['step', 'cave', 'You entered the Dark cave.'])
  const unlit = step(place(w, 6, 3), 'east')
  assert.equal(unlit.game.message, 'You entered the Dark cave. It is pitch dark! Ampharos, by the cave door, knows Flash.')
})

test('Pokemon only come out where you can get to, and tap routes use water and desert only with the right help', () => {
  const start = { ...place(w, 1, 1), spawnAt: 0 }
  for (let seed = 0; seed < 20; seed++) {
    const out = roam(start, 0, always(seed / 20), WILDS).wilds[0]
    assert.equal(tileAt(out.at, WILDS), '.', `${pointKey(out.at)} is open ground`)
    assert.notEqual(areaAt(out.at, WILDS), 'desert', `${pointKey(out.at)} is outside the sandstorm`)
  }
  assert.equal(planHunt(place(w, 1, 1), { x: 5, y: 1 }, WILDS).length, 10, 'Round by the south bank')
  assert.deepEqual(planHunt({ ...place(w, 1, 1), helps: ['ride'] }, { x: 5, y: 1 }, WILDS), ['east', 'east', 'east', 'east'])
  assert.equal(planHunt(place(w, 5, 1), { x: 8, y: 1 }, WILDS), null)
  assert.deepEqual(planHunt({ ...place(w, 5, 1), helps: ['goggles'] }, { x: 8, y: 1 }, WILDS), ['east', 'east', 'east'])
  const toLapras = planHunt(place(w, 1, 4), { x: 2, y: 2 }, WILDS)
  const asked = toLapras.reduce((game, direction) => step(game, direction).game, place(w, 1, 4))
  assert.deepEqual(asked.helps, ['ride'], 'Tapping a helper walks up to it and into it')
})

test('a ball holds more often when the ring is small; caught, the Pokemon leaves the map and builds the Shiny chain', () => {
  const caught = throwBall(met, 5000, always(0))
  assert.deepEqual([caught.encounter, caught.catches, caught.chain, caught.status, caught.balls], [null, [{ name: 'Pidgey', shiny: false }], { name: 'Pidgey', count: 1 }, 'playing', 23])
  assert.deepEqual([caught.wilds.map(item => item.id), caught.spawnAt, caught.steps], [[2], 5000 + SPAWN_MS, 800])
  assert.equal(caught.message, 'Gotcha! Pidgey was caught!')
  assert.deepEqual([caught.act.id, caught.act.thrown, caught.act.reaction, caught.act.left, caught.act.wild.at], [1, 'ball', 'caught', 'caught', { x: 4, y: 2 }])
  assert.strictEqual(throwBall(caught, 6000), caught)
  const again = throwBall({ ...met, chain: caught.chain, encounter: { ...met.encounter, shiny: true } }, 0, always(0))
  assert.deepEqual([again.chain.count, again.message], [2, 'Gotcha! Shiny Pidgey was caught!'])
  assert.equal(throwBall({ ...met, chain: { name: 'Rattata', count: 3 } }, 0, always(0)).chain.count, 1, 'Another species starts a new chain')
  // Pidgey holds 4 times in 10 from a plain throw, and about 6 in 10 when the ring is small.
  assert.deepEqual([throwBall(met, 0, always(0.45)).act.quality, throwBall(met, 0, always(0.45)).act.reaction], ['nice', 'broke-free'])
  assert.deepEqual([throwBall(met, RING_MS * 0.9, always(0.45)).act.quality, throwBall(met, RING_MS * 0.9, always(0.45)).act.reaction], ['excellent', 'caught'])
  assert.strictEqual(throwBall(pauseSafari(met), 0, always(0)).encounter, met.encounter, 'Nothing is thrown while paused')
})

test('a Pokemon that breaks free may stay, or run off and break the chain', () => {
  const free = throwBall(met, 0, always(0.99))
  assert.deepEqual([free.encounter.id, free.balls, free.act.reaction, free.act.left, free.message], [1, 23, 'broke-free', null, 'Oh no! Pidgey broke free!'])
  assert.deepEqual(free.wilds.map(item => item.id), [1, 2], 'It is still there')
  const fled = throwBall({ ...met, chain: { name: 'Pidgey', count: 2 } }, 0, rolls(0.99, 0))
  assert.deepEqual([fled.encounter, fled.act.left, fled.chain, fled.wilds.map(item => item.id), fled.message], [null, 'fled', { name: '', count: 0 }, [2], 'Pidgey ran away!'])
})

const meadow = wildPool(ZONES.meadow.types).map(item => item.name)
const fan = meadow.find(likesBerry), fussy = meadow.find(name => !likesBerry(name))
const named = name => ({ ...met, encounter: { ...met.encounter, name } })

test('a liked berry calms the Pokemon, a disliked one changes nothing, and a rock makes it angry; none uses a ball', () => {
  const fed = throwBerry(named(fan), 0, always(0.99))
  assert.deepEqual([fed.encounter.mood, fed.act.thrown, fed.act.reaction, fed.act.left, fed.balls], ['eating', 'berry', 'likes', null, 24])
  assert.equal(fed.message, `${fan} loves the berry! It is less likely to run, but harder to catch.`)
  const snubbed = throwBerry(named(fussy), 0, always(0.99))
  assert.deepEqual([snubbed.encounter.mood, snubbed.act.reaction, snubbed.message], ['calm', 'dislikes', `${fussy} sniffed the berry and turned away.`])
  const angry = throwRock(fed, 0, always(0.99))
  assert.deepEqual([angry.encounter.mood, angry.act.id, angry.act.thrown, angry.act.reaction, angry.balls], ['angry', 2, 'rock', 'angry', 24])
  const scared = throwRock(met, 0, always(0))
  assert.deepEqual([scared.encounter, scared.act.reaction, scared.act.left, scared.wilds.map(item => item.id)], [null, 'angry', 'fled', [2]])
  assert.equal(throwBerry(named(fussy), 0, always(0)).act.left, 'fled', 'It may run after a berry it does not like')
})

test('running makes the Pokemon disappear from the map, costs nothing and keeps the chain', () => {
  const left = runAway({ ...met, chain: { name: 'Pidgey', count: 2 } }, 5000)
  assert.deepEqual([left.encounter, left.catches, left.chain.count, left.status, left.balls], [null, [], 2, 'playing', 24])
  assert.equal(left.message, 'You backed away, and Pidgey disappeared.')
  assert.deepEqual([left.wilds.map(item => item.id), left.spawnAt], [[2], 5000 + SPAWN_MS])
  assert.deepEqual([left.act.thrown, left.act.reaction, left.act.left], [null, null, 'ran'])
  assert.strictEqual(runAway(left, 6000), left)
})

test('the round ends when the last Safari Ball is gone, caught or not', () => {
  const last = { ...met, balls: 1 }
  const lost = throwBall(last, 0, rolls(0.99, 0.99))
  assert.deepEqual([lost.status, lost.balls, lost.act.left, lost.message], ['complete', 0, 'wandered', "Pidgey wandered off. You're out of Safari Balls!"])
  const won = throwBall(last, 0, always(0))
  assert.deepEqual([won.status, won.catches.length, won.message], ['complete', 1, "Gotcha! Pidgey was caught! You're out of Safari Balls!"])
})

test('the round ends when the steps run out', () => {
  const result = east({ ...place(f, 4, 3), steps: 1 })
  assert.equal(result.game.status, 'complete')
  assert.ok(result.events.includes('out-of-steps'))
  assert.equal(result.game.message, "Ding-dong! Time's up!")
})

test('tapping a wild Pokemon walks up to it and into it; other routes go round the Pokemon in the way', () => {
  const game = { ...place(f, 1, 3), wilds: [wild(3, 3), wild(6, 3, { id: 2, name: 'Rattata' })] }
  const hunt = planHunt(game, { x: 3, y: 3 }, FIELD)
  assert.deepEqual(hunt, ['east', 'east'])
  const walked = hunt.reduce((current, direction) => walk(current, direction, FIELD).game, game)
  assert.deepEqual([walked.at, walked.encounter?.id], [{ x: 2, y: 3 }, 1])
  const round = planHunt(game, { x: 5, y: 3 }, FIELD)
  assert.equal(round.length, 6, 'Two steps longer than straight through')
  const end = round.reduce((current, direction) => {
    const result = walk(current, direction, FIELD)
    assert.equal(result.move, 'step')
    return result.game
  }, game)
  assert.deepEqual([end.at, end.encounter], [{ x: 5, y: 3 }, null])
  assert.deepEqual(planHunt({ ...game, wilds: [] }, { x: 5, y: 3 }, FIELD), planWalk(game.at, { x: 5, y: 3 }, FIELD))
  const corridor = fixture(['TTTTTT', 'T@...T', 'TGTTTT'])
  const boxed = { ...startZone('gate', 0, 0, corridor), wilds: [wild(3, 1)] }
  assert.deepEqual(planHunt(boxed, { x: 4, y: 1 }, corridor), ['east', 'east', 'east'], 'With no way round, the route goes up to it')
})

// Walks a planned route with the real rules: every step must go through, never bump.
function replay(game, directions, map = ROOM) {
  return directions.reduce((current, direction) => {
    const result = walk(current, direction, map)
    assert.notEqual(result.move, 'bump', `bumped going ${direction} from ${pointKey(current.at)}`)
    return result.game
  }, game)
}

test('planWalk finds the shortest route', () => {
  assert.deepEqual(planWalk({ x: 1, y: 1 }, { x: 6, y: 1 }, ROOM), ['east', 'east', 'east', 'east', 'east'])
})

test('planWalk never climbs a ledge', () => {
  const route = planWalk({ x: 3, y: 4 }, { x: 3, y: 2 }, ROOM)
  assert.ok(route && route[0] !== 'north')
  assert.deepEqual(replay(place(g, 3, 4), route).at, { x: 3, y: 2 })
})

test('tapping a wall walks next to it, tapping the gate ends at the prompt', () => {
  const end = replay(place(g, 6, 1), planWalk({ x: 6, y: 1 }, { x: 2, y: 2 }, ROOM)).at
  assert.equal(Math.abs(end.x - 2) + Math.abs(end.y - 2), 1)
  const out = planWalk({ x: 1, y: 1 }, { x: 3, y: 7 }, ROOM)
  assert.equal(out.at(-1), 'south')
  assert.equal(replay(place(g, 1, 1), out).prompt, 'gate')
  assert.deepEqual(planWalk({ x: 3, y: 5 }, { x: 3, y: 5 }, ROOM), [])
})

test('unreachable targets give null', () => {
  const walled = fixture(['TTTTTTT', 'T@T.T.T', 'TGTTTTT'])
  assert.equal(planWalk(walled.starts.gate, { x: 3, y: 1 }, walled), null)
})

const everywhere = char => safariMap.tiles.flatMap((row, y) => [...row].flatMap((c, x) => c === char ? [{ x, y }] : []))

const ALL = ['ride', 'flash', 'goggles']
const helped = terrain({ helps: ALL, at: safariMap.starts.gate })

test('on the real map, every helper Pokemon can be walked up to with no help at all', () => {
  const bare = reachableFrom(safariMap.starts.gate, terrain({ helps: [], at: safariMap.starts.gate }))
  for (const char of Object.keys(HELPERS)) {
    const [at] = everywhere(char)
    assert.ok([[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => bare.has(`${at.x + dx},${at.y + dy}`)), `${HELPERS[char].name} can be reached`)
  }
  assert.ok(everywhere('o').filter(point => bare.has(pointKey(point))).length < everywhere('o').length, 'Some items need a helper')
  assert.ok(!bare.has(pointKey(safariMap.starts.desert)), 'The desert is closed without goggles')
  assert.ok(bare.has(pointKey(safariMap.starts.cave)), 'The cave is only dark')
  const far = everywhere('g').filter(point => point.x > 55 && point.y > 30)
  assert.ok(far.length > 0 && far.every(point => !bare.has(pointKey(point))), 'The far bank needs Lapras')
})

test('on the real map, every grass tile, item and start can be reached from the gate with the helpers', () => {
  const reachable = reachableFrom(safariMap.starts.gate, helped)
  for (const point of [...everywhere('g'), ...everywhere('o'), ...Object.values(safariMap.starts)]) {
    assert.ok(reachable.has(pointKey(point)), `${pointKey(point)} (${tileAt(point)}) is unreachable`)
  }
  for (const start of Object.values(safariMap.starts)) assert.ok(isWalkable(tileAt(start)))
})

test('on the real map, no ledge traps you: the gate is reachable from everywhere you can go', () => {
  const gate = everywhere('G')[0]
  for (const key of reachableFrom(safariMap.starts.gate, helped)) {
    const [x, y] = key.split(',').map(Number)
    assert.ok(planWalk({ x, y }, gate, helped), `no way back to the gate from ${key}`)
  }
})

test('routeSearch walks any grid through its own neighbours', () => {
  const deltas = [['north', 0, -1], ['south', 0, 1], ['west', -1, 0], ['east', 1, 0]]
  const neighbours = ({ x, y }) => deltas.map(([d, dx, dy]) => [d, { x: x + dx, y: y + dy }]).filter(([, p]) => p.x >= 0 && p.y >= 0 && p.x < 3 && p.y < 3 && !(p.x === 1 && p.y === 1))
  const trail = routeSearch({ x: 0, y: 0 }, neighbours)
  assert.equal(routeTo(trail, '2,2').length, 4)
  assert.equal(trail.has('1,1'), false)
})

test('on the real map, Pokemon come out in every area but the gate, each from its own pool', () => {
  for (const zone of Object.keys(ZONES)) {
    let game = startZone(zone, 0, 0)
    let seed = 7
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let now = 0; now <= 30000; now += 100) game = roam(game, now, random)
    assert.equal(game.wilds.length, MAX_WILD, zone)
    for (const item of game.wilds) {
      const area = areaAt(item.at)
      assert.notEqual(area, 'gate')
      assert.ok(wildPool(ZONES[area].types).some(found => found.name === item.name), `${item.name} in the ${area}`)
      assert.ok(planWalk(game.at, item.at), `${item.name} can be reached`)
    }
  }
})

// A lake ('l' area): a pond whose rim touches the bank, with deep water (x 4-7, y 3) out of reach from the shore.
const LAKE = fixture([
  'TTTTTTTTTTTT',
  'T..........T',
  'T..~~~~~~..T',
  'T..~~~~~~..T',
  'T..~~~~~~..T',
  'T@.........T',
  'TGTTTTTTTTTT'], ['gggggggggggg', 'gllllllllllg', 'gllllllllllg', 'gllllllllllg', 'gllllllllllg', 'ggllllllllll', 'gggggggggggg'])
const lk = { ...startZone('gate', 0, 0, LAKE), area: 'lake' }
const deep = point => point.y === 3 && point.x >= 4 && point.x <= 7

test('water Pokemon walk out only on water, land Pokemon only on land, and never out of reach', () => {
  const spawns = helps => Array.from({ length: 40 }, (_, seed) => roam({ ...place(lk, 1, 1), helps, spawnAt: 0 }, 0, always(seed / 40), LAKE).wilds[0])
  const onFoot = spawns([])
  for (const out of onFoot) {
    assert.equal(tileAt(out.at, LAKE), livesInWater(out.name) ? '~' : '.', `${out.name} at ${pointKey(out.at)}`)
    assert.ok(!deep(out.at), `${out.name} at ${pointKey(out.at)} can be reached from the bank`)
  }
  assert.ok(onFoot.some(out => livesInWater(out.name)) && onFoot.some(out => !livesInWater(out.name)), 'Both kinds come out')
  const riding = spawns(['ride'])
  for (const out of riding) assert.equal(tileAt(out.at, LAKE), livesInWater(out.name) ? '~' : '.')
  assert.ok(riding.some(out => deep(out.at)), 'On Lapras the open water is in reach too')
})

test('a water Pokemon swims about the water and never comes ashore', () => {
  const fish = { id: 1, name: 'Magikarp', shiny: false, at: { x: 3, y: 2 }, facing: 'south', steps: 0, moveAt: 900 }
  const game = { ...place(lk, 1, 1), wilds: [fish], spawnAt: 99999 }
  assert.deepEqual(roam(game, 900, rolls(0.9, 0.5, 0.1), LAKE).wilds[0].at, { x: 3, y: 2 }, 'Not onto the bank')
  assert.deepEqual(roam(game, 900, rolls(0.9, 0.5, 0.9), LAKE).wilds[0].at, { x: 4, y: 2 }, 'Along the water')
})

test('you meet a water Pokemon by walking into it from the bank, and tapping it walks you there', () => {
  const fish = { id: 1, name: 'Magikarp', shiny: false, at: { x: 5, y: 2 }, facing: 'south', steps: 0, moveAt: 99999 }
  const met = walk({ ...place(lk, 5, 1), wilds: [fish] }, 'south', LAKE)
  assert.deepEqual([met.events, met.game.encounter?.name, met.game.wilds[0].at], [['encounter'], 'Magikarp', { x: 5, y: 3 }])
  assert.deepEqual(planHunt({ ...place(lk, 1, 1), wilds: [fish] }, { x: 5, y: 2 }, LAKE), ['east', 'east', 'east', 'east', 'south'])
})
