import test from 'node:test'
import assert from 'node:assert/strict'
import { GRASS_COOLDOWN, confirmLeave, startZone, stayInZone, tileAt, walk, zoneAction, zoneBudget } from '../src/games/safari-zone.ts'
import { ZONES, pauseSafari, runAway, throwBall } from '../src/games/safari.ts'
import { wildPool } from '../src/games/roster.ts'

const always = value => () => value
const rolls = (...values) => () => values.shift() ?? 0.5
// A test map: every start sits on '@', and areas default to meadow ('m') with the gate area ('g') on '@' and 'G' rows.
function fixture(tiles, areas = tiles.map(row => [...row].map(c => '@G#'.includes(c) ? 'g' : 'm').join(''))) {
  const y = tiles.findIndex(row => row.includes('@')), at = { x: tiles[y].indexOf('@'), y }
  return { cols: tiles[0].length, rows: tiles.length, chunk: 8, tiles, areas, chunks: {},
    starts: { gate: at, meadow: at, lake: at, mountain: at, night: at } }
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
const go = (game, direction, map = ROOM) => walk(game, direction, always(0.99), map)

test('budget: 400 steps and 12 balls, plus 50 steps and 3 balls per km up to 3 km', () => {
  assert.deepEqual(zoneBudget(0), { steps: 400, balls: 12 })
  assert.deepEqual(zoneBudget(2), { steps: 500, balls: 18 })
  assert.deepEqual(zoneBudget(7), { steps: 550, balls: 21 })
  assert.deepEqual(zoneBudget(1.9), { steps: 450, balls: 15 })
  assert.deepEqual(zoneBudget(-1), { steps: 400, balls: 12 })
  const start = startZone('gate', 2, 0, ROOM)
  assert.deepEqual([start.steps, start.balls, start.at, start.status], [500, 18, { x: 3, y: 6 }, 'playing'])
  assert.equal(start.message, 'Welcome to the Safari Zone! You have 500 steps and 18 Safari Balls.')
})

test('a step moves one tile and costs one step; the buddy takes the old tile', () => {
  const { game, move, events } = go(g, 'north')
  assert.equal(move, 'step')
  assert.deepEqual([game.at, game.buddy, game.buddyFacing], [{ x: 3, y: 5 }, { x: 3, y: 6 }, 'north'])
  assert.deepEqual([game.steps, game.taken], [399, 1])
  assert.ok(events.includes('area'))
  assert.equal(game.message, 'You entered the Sunny meadow.')
})

test('bumping costs nothing and names what is in the way', () => {
  const tree = go(place(g, 1, 1), 'north')
  assert.deepEqual([tree.move, tree.game.steps, tree.game.facing, tree.game.message], ['bump', 400, 'north', 'A tree is in the way.'])
  assert.equal(go(place(g, 2, 1), 'south').game.message, 'A boulder is in the way.')
  assert.equal(go(place(g, 5, 1), 'south').game.message, 'The water is too deep to cross.')
  const edge = fixture(['@.'])
  const outside = go(startZone('gate', 0, 0, edge), 'north', edge)
  assert.deepEqual([outside.move, outside.game.message], ['bump', 'A wall is in the way.'])
})

test('ledges are crossed downhill only, two tiles for one step', () => {
  const hop = go(place(g, 3, 2), 'south')
  assert.deepEqual([hop.move, hop.game.at, hop.game.buddy, hop.game.steps], ['hop', { x: 3, y: 4 }, { x: 3, y: 3 }, 399])
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
    ['none', 'gate', ['gate'], 400, 'south'])
  assert.equal(asked.game.message, 'Leave the Safari Zone?')
  assert.equal(go(asked.game, 'north').move, 'none')
  assert.equal(stayInZone(asked.game).prompt, null)
  const left = confirmLeave(asked.game)
  assert.deepEqual([left.status, left.message, left.prompt], ['complete', 'You left the Safari Zone.', null])
})

test('nothing moves during an encounter, a prompt, a pause or after the round', () => {
  for (const frozen of [{ ...g, encounter: { name: 'Pidgey', shiny: false, mood: 'calm', since: 0 } }, { ...g, prompt: 'gate' },
    pauseSafari(g, 5), { ...g, status: 'complete' }, { ...g, steps: 0 }]) {
    const result = go(frozen, 'north')
    assert.equal(result.move, 'none')
    assert.strictEqual(result.game, frozen)
  }
})

const FIELD = fixture(['TTTTTTTTT', 'T.ggggggT', 'T.ggggggT', 'T...@...T', 'TTTTGTTTT'])
const f = startZone('gate', 0, 0, FIELD)
const east = (game, random = always(0.99), map = FIELD) => walk(game, 'east', random, map)
let encounterGame

test('each step into tall grass has a 1 in 10 chance of an encounter', () => {
  const met = east(place(f, 2, 2), rolls(0.0999))
  assert.ok(met.events.includes('encounter'))
  assert.ok(wildPool(ZONES.meadow.types).some(wild => wild.name === met.game.encounter.name))
  assert.deepEqual([met.game.zone, met.game.cooldown], ['meadow', GRASS_COOLDOWN])
  assert.equal(east(place(f, 2, 2), always(0.1)).game.encounter, null)
  encounterGame = met.game
})

test('stepping into grass is announced', () => {
  const into = walk({ ...place(f, 2, 3), area: 'meadow' }, 'north', always(0.99), FIELD)
  assert.equal(into.game.message, 'You stepped into tall grass.')
  assert.equal(east(into.game).game.message, 'You stepped into tall grass.')
})

test('after an encounter the next 3 steps cannot roll', () => {
  let game = { ...place(f, 2, 2), cooldown: 3 }
  for (const left of [2, 1, 0]) {
    const result = east(game, always(0))
    assert.ok(!result.events.includes('encounter'))
    assert.equal(result.game.cooldown, left)
    game = result.game
  }
  const fourth = east(game, always(0))
  assert.deepEqual(fourth.game.at, { x: 6, y: 2 })
  assert.ok(fourth.events.includes('encounter'))
})

test('ground never rolls', () => {
  let game = place(f, 1, 3)
  for (let i = 0; i < 6; i++) {
    const result = east(game, always(0))
    assert.ok(!result.events.includes('encounter'))
    game = result.game
  }
})

test('a rustle appears every 25 steps on grass 2-6 tiles away in the same area', () => {
  const result = east({ ...place(f, 4, 3), taken: 24, nextRustleAt: 25 }, always(0))
  assert.ok(result.events.includes('rustle'))
  assert.equal(result.game.message, 'The grass is rustling nearby!')
  assert.equal(result.game.nextRustleAt, 50)
  const { rustling, at } = result.game
  assert.equal(tileAt(rustling, FIELD), 'g')
  const distance = Math.max(Math.abs(rustling.x - at.x), Math.abs(rustling.y - at.y))
  assert.ok(distance >= 2 && distance <= 6, `distance ${distance}`)
})

test('with no grass in range nothing rustles', () => {
  const bare = fixture(['TTTTTTTTTT', 'T@.......T', 'TGTTTTTTTT'])
  const result = walk({ ...place(startZone('gate', 0, 0, bare), 2, 1), taken: 24, nextRustleAt: 25 }, 'east', always(0), bare)
  assert.equal(result.game.rustling, null)
  assert.ok(!result.events.includes('rustle'))
  assert.equal(result.game.nextRustleAt, 50)
})

test('stepping onto rustling grass always starts an encounter, even while cooling down', () => {
  const result = east({ ...place(f, 2, 1), rustling: { x: 3, y: 1 }, cooldown: 3 }, always(0.99))
  assert.ok(result.events.includes('encounter'))
  assert.equal(result.game.rustling, null)
})

test('the round ends when the steps run out', () => {
  const result = east({ ...place(f, 4, 3), steps: 1 })
  assert.equal(result.game.status, 'complete')
  assert.ok(result.events.includes('out-of-steps'))
  assert.equal(result.game.message, "Ding-dong! Time's up!")
})

test('a last step into grass plays the encounter out, then ends the round once', () => {
  const result = east({ ...place(f, 2, 2), steps: 1 }, always(0))
  assert.ok(result.events.includes('encounter'))
  assert.deepEqual([result.game.status, result.game.steps], ['playing', 0])
  const over = zoneAction(result.game, s => runAway(s, 10))
  assert.deepEqual([over.status, over.message], ['complete', "Ding-dong! Time's up!"])
  const again = zoneAction(over, s => runAway(s, 20))
  assert.deepEqual([again.status, again.message], ['complete', "Ding-dong! Time's up!"])
})

test('zoneAction keeps the walking state and does not end a round with steps left', () => {
  const caught = zoneAction({ ...encounterGame, steps: 40 }, s => throwBall(s, 10, always(0)))
  assert.deepEqual([caught.at, caught.steps, caught.items, caught.status], [encounterGame.at, 40, encounterGame.items, 'playing'])
  assert.equal(caught.encounter, null)
})
