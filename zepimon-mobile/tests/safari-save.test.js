import test from 'node:test'
import assert from 'node:assert/strict'
import { SAVE_VERSION, canSave, restoreRound, saveRound } from '../src/games/safari-save.ts'
import { ROAM_MS, SPAWN_MS, pointKey, roam, safariMap, startZone, tileAt, walk } from '../src/games/safari-zone.ts'

const always = value => () => value
const find = tile => safariMap.tiles.flatMap((row, y) => [...row].flatMap((t, x) => t === tile ? [{ x, y }] : []))
// A round a little way in: walked, with Pokemon out, a catch, an item found and Lapras helping, facing a Pokemon.
function played() {
  let game = startZone('gate', 0, 0)
  for (let t = 0; t <= 4000; t += 100) game = roam(game, t, always(0.05))
  game = walk(game, 'south').game
  const [item] = find('o')
  const wild = game.wilds[0]
  return { ...game, catches: [{ name: 'Pidgey', shiny: true }], chain: { name: 'Pidgey', count: 1 }, items: [pointKey(item)], helps: ['ride'],
    encounter: { id: wild.id, name: wild.name, shiny: wild.shiny, mood: 'angry', since: 3000 }, status: 'paused' }
}
const viaDisk = round => JSON.parse(JSON.stringify(round))

test('a round can be saved while it has steps and Safari Balls left', () => {
  const game = startZone('gate', 0, 0)
  assert.equal(canSave(game), true)
  assert.equal(canSave({ ...game, status: 'paused' }), true)
  for (const done of [null, { ...game, status: 'complete' }, { ...game, steps: 0 }, { ...game, balls: 0 }]) assert.equal(canSave(done), false)
})

test('a saved round comes back as it was, ready to play, with its clocks started again from now', () => {
  const game = played()
  const saved = saveRound({ ...game, prompt: 'gate', act: { id: 3 } }, 1700000000000)
  assert.deepEqual([saved.version, saved.savedAt, saved.game.prompt, saved.game.act], [SAVE_VERSION, 1700000000000, null, null])
  const back = restoreRound(viaDisk(saved), 5000)
  for (const key of ['at', 'facing', 'buddy', 'buddyFacing', 'steps', 'balls', 'taken', 'items', 'helps', 'catches', 'chain', 'zone', 'area', 'spawned']) {
    assert.deepEqual(back[key], game[key], key)
  }
  assert.deepEqual(back.wilds.map(({ moveAt, ...wild }) => wild), game.wilds.map(({ moveAt, ...wild }) => wild))
  assert.ok(back.wilds.every(wild => wild.moveAt === 5000 + ROAM_MS))
  assert.deepEqual(back.encounter, { ...game.encounter, since: 5000 }, 'Still facing the Pokemon, in the same mood')
  assert.deepEqual([back.status, back.spawnAt, back.prompt, back.act], ['playing', 5000 + SPAWN_MS, null, null])
  assert.equal(back.message, `Welcome back! You have ${game.steps} steps and ${game.balls} Safari Balls left.`)
})

test('nothing playable, nothing to continue', () => {
  const saved = viaDisk(saveRound(played(), 0))
  const [tree] = find('T')
  for (const raw of [null, undefined, 'round', [], {}, { ...saved, version: 0 }, { ...saved, game: null },
    { ...saved, game: { ...saved.game, steps: 0 } }, { ...saved, game: { ...saved.game, balls: -1 } }, { ...saved, game: { ...saved.game, steps: 2.5 } },
    { ...saved, game: { ...saved.game, at: tree } }, { ...saved, game: { ...saved.game, at: { x: 999, y: 0 } } },
    { ...saved, game: { ...saved.game, facing: 'up' } }, { ...saved, game: { ...saved.game, zone: 'volcano' } }]) {
    assert.equal(restoreRound(raw, 0), null, JSON.stringify(raw)?.slice(0, 60))
  }
})

test('pieces that no longer fit are dropped and the rest is kept', () => {
  const saved = viaDisk(saveRound(played(), 0))
  const game = saved.game
  const [tree] = find('T')
  const back = restoreRound({ ...saved, game: { ...game,
    wilds: [...game.wilds, { ...game.wilds[0], id: 99 }, { id: 98, name: 'Rattata', shiny: false, at: tree, facing: 'south', steps: 0 }, { id: 'x' }],
    items: [...game.items, pointKey(tree), 'nope', game.items[0]], helps: ['ride', 'teleport'],
    catches: [...game.catches, { name: 7 }, null], chain: { name: '', count: 4 }, buddy: tree } }, 0)
  assert.deepEqual(back.wilds.map(wild => wild.id), game.wilds.map(wild => wild.id), 'No one on a tree, or on a tile someone already stands on')
  assert.deepEqual([back.items, back.helps, back.catches], [game.items, ['ride'], game.catches])
  assert.deepEqual([back.chain, back.buddy], [{ name: '', count: 0 }, back.at], 'A buddy that cannot stand there falls in on the trainer')
  const lost = restoreRound({ ...saved, game: { ...game, wilds: [] } }, 0)
  assert.deepEqual([lost.encounter, lost.steps], [null, game.steps], 'Facing a Pokemon that is gone: back to walking')
})

test('the steps, balls and position on the real map can be walked from', () => {
  const back = restoreRound(viaDisk(saveRound(played(), 0)), 100)
  const free = { ...back, encounter: null }
  const moved = ['north', 'south', 'west', 'east'].map(direction => walk(free, direction).move)
  assert.ok(moved.includes('step'), moved.join())
  assert.equal(tileAt(back.at) === '#', false)
})
