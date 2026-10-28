import test from 'node:test'
import assert from 'node:assert/strict'
import { confirmLeave, startZone, stayInZone, walk, zoneBudget } from '../src/games/safari-zone.ts'
import { pauseSafari } from '../src/games/safari.ts'

const always = value => () => value
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
