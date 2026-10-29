import test from 'node:test'
import assert from 'node:assert/strict'
import { deadCells, goalsMet, hintTier, lit, planRoomWalk, resetAlignment, resonance, startRoom, stepRoom } from '../src/games/trial.ts'
import { STAR } from './star-fixture.js'

const stage = (tiles, extra = {}) => ({ id: 't', kind: 'switch', tiles, warps: {}, open: '', crackAll: false, dark: false, par: 99, hint: '', star: null, ...extra })
const press = (room, st, ...directions) => directions.reduce((result, direction) => stepRoom(result.room, st, direction), { room, move: 'none', events: [] })

test('walls, water and rocks block and cost no move', () => {
  const st = stage(['@#', '~R'])
  const east = stepRoom(startRoom(st), st, 'east')
  assert.equal(east.move, 'bump')
  assert.equal(east.room.moves, 0)
  assert.equal(east.room.facing, 'east')
  assert.equal(east.room.message, 'A wall is in the way.')
  assert.equal(stepRoom(startRoom(st), st, 'south').room.message, 'The water is too deep to cross.')
})

test('the buddy follows one tile behind', () => {
  const st = stage(['@..'])
  const { room } = press(startRoom(st), st, 'east', 'east')
  assert.deepEqual(room.buddy, { x: 1, y: 0 })
})

test('the exit waits for every relic', () => {
  const st = stage(['*@X'])
  const locked = stepRoom(startRoom(st), st, 'east')
  assert.deepEqual(locked.events, ['locked'])
  assert.equal(locked.room.message, 'The seal holds. 1 relic remains.')
  assert.deepEqual(locked.room.at, { x: 1, y: 0 })
  assert.equal(goalsMet(locked.room, st), false)
  const got = stepRoom(locked.room, st, 'west')
  assert.ok(got.events.includes('relic'))
  assert.deepEqual(got.room.relics, ['0,0'])
  assert.equal(goalsMet(got.room, st), true)
  const done = press(got.room, st, 'east', 'east')
  assert.equal(done.room.status, 'cleared')
  assert.ok(done.events.includes('clear'))
})

test('a relic is collected once', () => {
  const st = stage(['*@.'])
  const first = press(startRoom(st), st, 'west')
  assert.deepEqual(first.events, ['relic'])
  const back = press(first.room, st, 'east', 'west')
  assert.deepEqual(back.events, [])
  assert.deepEqual(back.room.relics, ['0,0'])
})

test('sight reveals a radius and remembers it', () => {
  const row = ['@' + '.'.repeat(9)]
  const seen = startRoom(stage(row)).seen
  assert.ok(seen.includes('4,0'))
  assert.ok(!seen.includes('5,0'))
  const dark = stage(row, { dark: true })
  const near = startRoom(dark).seen
  assert.ok(near.includes('2,0'))
  assert.ok(!near.includes('3,0'))
  const walked = press(startRoom(dark), dark, 'east', 'east', 'east').room
  assert.ok(walked.seen.includes('0,0'))
  assert.ok(walked.seen.includes('5,0'))
})

test('torches light their own tiles in the dark', () => {
  const st = stage(['@......!.'], { dark: true })
  const tiles = lit(startRoom(st), st)
  assert.ok(tiles.has('8,0'))
  assert.ok(tiles.has('7,0'))
  assert.ok(!tiles.has('5,0'))
})

test('a switch opens its gate group', () => {
  const st = stage(['@aA.X'])
  const first = stepRoom(startRoom(st), st, 'east')
  assert.deepEqual(first.events, ['switch'])
  assert.equal(first.room.open, 'A')
  const done = press(first.room, st, 'east', 'east', 'east')
  assert.equal(done.room.status, 'cleared')
})

test('stepping onto it again shuts the gate', () => {
  const st = stage(['@aA'])
  const shut = press(startRoom(st), st, 'east', 'west', 'east')
  assert.equal(shut.room.open, '')
  const bump = stepRoom(shut.room, st, 'east')
  assert.equal(bump.move, 'bump')
  assert.equal(bump.room.message, 'The gate is shut.')
})

test('standing or bumping never toggles', () => {
  const st = stage(['@a#'])
  const first = stepRoom(startRoom(st), st, 'east')
  const second = stepRoom(first.room, st, 'east')
  assert.equal(second.room.open, 'A')
  assert.deepEqual(first.events, ['switch'])
  assert.deepEqual(second.events, [])
})

test('gates listed in open start open', () => {
  const st = stage(['@A.'], { open: 'A' })
  assert.equal(stepRoom(startRoom(st), st, 'east').move, 'step')
})

test('three groups are independent', () => {
  const st = stage(['@abcABC'])
  const all = press(startRoom(st), st, 'east', 'east', 'east')
  assert.equal(all.room.open, 'ABC')
  assert.equal(stepRoom(all.room, st, 'west').room.open, 'AC')
})

test('leaving a fragile tile makes a hole', () => {
  const st = stage(['@:.'])
  const { room, events } = press(startRoom(st), st, 'east', 'east')
  assert.deepEqual(events, ['crack'])
  assert.deepEqual(room.holes, ['1,0'])
})

test('stepping into a hole falls', () => {
  const st = stage(['@:.'])
  const fell = press(startRoom(st), st, 'east', 'east', 'west')
  assert.equal(fell.room.status, 'fell')
  assert.deepEqual(fell.events, ['fall'])
  assert.equal(fell.room.message, 'The floor gave way!')
  assert.equal(stepRoom(fell.room, st, 'east').move, 'none')
})

test('crackAll rooms open only when every fragile tile is gone', () => {
  const st = stage(['@:X', '.:#'], { crackAll: true })
  const locked = press(startRoom(st), st, 'east', 'east')
  assert.deepEqual(locked.events, ['locked'])
  assert.equal(locked.room.message, 'Cross every cracked tile to open the way.')
  const done = press(startRoom(st), st, 'south', 'east', 'north', 'east')
  assert.equal(done.room.status, 'cleared')
})

test('restart is a fresh room', () => {
  const st = stage(['@:.'])
  const fell = press(startRoom(st), st, 'east', 'east', 'west').room
  assert.equal(fell.status, 'fell')
  assert.deepEqual(startRoom(st), startRoom(stage(['@:.'])))
  assert.deepEqual(startRoom(st).holes, [])
})

test('open gates start sorted', () => {
  assert.equal(startRoom(stage(['@AB'], { open: 'BA' })).open, 'AB')
})

test('walking into a boulder pushes it', () => {
  const st = stage(['@O._'])
  const pushed = stepRoom(startRoom(st), st, 'east')
  assert.equal(pushed.move, 'push')
  assert.deepEqual(pushed.room.boulders, ['2,0'])
  assert.deepEqual(pushed.room.at, { x: 1, y: 0 })
  assert.equal(pushed.room.moves, 1)
  assert.deepEqual(pushed.room.buddy, { x: 0, y: 0 })
})

test('every plate held opens the doors for good', () => {
  const st = stage(['@O._'])
  const done = press(startRoom(st), st, 'east', 'east')
  assert.deepEqual(done.room.boulders, ['3,0'])
  assert.equal(done.room.doorsOpen, true)
  assert.ok(done.events.includes('plates'))
  const row = stage(['.@O_..'])
  const off = press(startRoom(row), row, 'east', 'east')
  assert.equal(off.room.doorsOpen, true)
  assert.deepEqual(off.room.boulders, ['4,0'])
})

test('a sealed door blocks until then', () => {
  const st = stage(['@=X'])
  const bump = stepRoom(startRoom(st), st, 'east')
  assert.equal(bump.move, 'bump')
  assert.equal(bump.room.message, 'The stone door is sealed.')
  const open = stage(['@=X'])
  assert.equal(stepRoom({ ...startRoom(open), doorsOpen: true }, open, 'east').move, 'step')
})

test('a boulder will not go where it would be stuck', () => {
  const st = stage(['#####', '#@O.#', '#...#', '#._.#', '#####'])
  const dead = deadCells(st)
  assert.ok(dead.has('3,1'))
  assert.ok(!dead.has('2,2'))
  const start = startRoom(st)
  const bump = stepRoom(start, st, 'east')
  assert.equal(bump.move, 'bump')
  assert.equal(bump.room.message, 'The boulder would get stuck there.')
  assert.deepEqual(bump.room.boulders, start.boulders)
})

test('boulders never enter gates or doors', () => {
  for (const tile of ['A', '=', 'a', '1', ':', '*', 'X', 'R', '~']) {
    const st = stage([`@O${tile}`], { open: 'A' })
    const bump = stepRoom(startRoom(st), st, 'east')
    assert.equal(bump.move, 'bump', tile)
    assert.equal(bump.room.message, "The boulder won't fit through there.", tile)
  }
  const wall = stage(['@O#'])
  assert.equal(stepRoom(startRoom(wall), wall, 'east').room.message, 'A wall is in the way.')
})

test('two boulders in a row do not move', () => {
  const st = stage(['@OO.'])
  const bump = stepRoom(startRoom(st), st, 'east')
  assert.equal(bump.move, 'bump')
  assert.deepEqual(bump.room.boulders, ['1,0', '2,0'])
})

test('without plates no cell is dead', () => {
  assert.equal(deadCells(stage(['@O.#'])).size, 0)
})
test('a pad sends you to its pair', () => {
  const st = stage(['@1.2X'], { warps: { 1: '2', 2: '1' } })
  const warped = stepRoom(startRoom(st), st, 'east')
  assert.equal(warped.move, 'warp')
  assert.deepEqual(warped.room.at, { x: 3, y: 0 })
  assert.deepEqual(warped.events, ['warp'])
  assert.deepEqual(warped.room.warpsUsed, ['1'])
  assert.deepEqual(warped.room.buddy, { x: 3, y: 0 })
  assert.equal(stepRoom(warped.room, st, 'east').room.status, 'cleared')
})

test('arriving never chains', () => {
  const st = stage(['@1.2.'], { warps: { 1: '2', 2: '1' } })
  const warped = stepRoom(startRoom(st), st, 'east').room
  assert.deepEqual(warped.at, { x: 3, y: 0 })
  const back = press(warped, st, 'east', 'west')
  assert.equal(back.move, 'warp')
  assert.deepEqual(back.room.at, { x: 1, y: 0 })
  assert.deepEqual(back.room.warpsUsed, ['1', '2'])
})

test('a pad with no entry is only a landing', () => {
  const st = stage(['@1.2.'], { warps: { 1: '2' } })
  const warped = stepRoom(startRoom(st), st, 'east').room
  const back = press(warped, st, 'east', 'west')
  assert.equal(back.move, 'step')
  assert.deepEqual(back.room.at, { x: 3, y: 0 })
})

test('tap routes avoid hazards', () => {
  const st = stage(['@:.', '...'])
  const room = startRoom(st)
  assert.deepEqual(planRoomWalk(room, st, { x: 2, y: 0 }), ['south', 'east', 'east', 'north'])
  assert.deepEqual(planRoomWalk(room, st, { x: 1, y: 0 }), ['east'])
  assert.deepEqual(planRoomWalk(room, st, { x: 0, y: 0 }), [])
  const sw = stage(['@a.', '...'])
  assert.deepEqual(planRoomWalk(startRoom(sw), sw, { x: 1, y: 0 }), ['east'])
  assert.deepEqual(planRoomWalk(startRoom(sw), sw, { x: 2, y: 0 }), ['south', 'east', 'east', 'north'])
  const pad = stage(['@1.'], { warps: { 1: '1' } })
  assert.deepEqual(planRoomWalk(startRoom(pad), pad, { x: 1, y: 0 }), ['east'])
})

test('tap routes go around boulders or fail', () => {
  const around = stage(['@O.', '...'])
  assert.deepEqual(planRoomWalk(startRoom(around), around, { x: 2, y: 0 }), ['south', 'east', 'east', 'north'])
  const shut = stage(['@O.'])
  assert.equal(planRoomWalk(startRoom(shut), shut, { x: 2, y: 0 }), null)
})

test('tap on a wall walks to its nearest side', () => {
  const st = stage(['@..#', '....'])
  const room = startRoom(st)
  assert.deepEqual(planRoomWalk(room, st, { x: 3, y: 0 }), ['east', 'east'])
  const sealed = stage(['@#.'])
  assert.equal(planRoomWalk(startRoom(sealed), sealed, { x: 2, y: 0 }), null)
  assert.equal(planRoomWalk(startRoom(sealed), sealed, { x: 1, y: 0 }) !== null, true)
})

test('a relic is fine to stand on while pushing', () => {
  const st = stage(['#.@.#', '#.O.#', '#*._#', '#####'])
  assert.ok(!deadCells(st).has('2,2'))
  const pushed = stepRoom(startRoom(st), st, 'south')
  assert.equal(pushed.move, 'push')
  assert.deepEqual(pushed.room.boulders, ['2,2'])
})

test('a warp reveals around both pads', () => {
  const st = stage(['@1' + '.'.repeat(12) + '2'], { warps: { 1: '2' } })
  const room = stepRoom(startRoom(st), st, 'east').room
  assert.ok(room.seen.includes('5,0'))
  assert.ok(room.seen.includes('14,0'))
})

const toN1 = ['east', 'north', 'north', 'north']
const starWith = (star) => ({ ...STAR, star: { ...STAR.star, ...star } })

test('a clue stone is read by walking into it', () => {
  const first = stepRoom(startRoom(STAR), STAR, 'north')
  assert.equal(first.move, 'bump')
  assert.deepEqual(first.events, ['clue'])
  assert.equal(first.room.message, 'One light alone, one point turned.')
  assert.deepEqual(first.room.cluesRead, ['0,2'])
  const second = stepRoom(first.room, STAR, 'north')
  assert.equal(second.room.message, 'One light alone, one point turned.')
  assert.deepEqual(second.room.cluesRead, ['0,2'])
})

test('crystals follow their rules', () => {
  const a = press(startRoom(STAR), STAR, ...toN1)
  assert.deepEqual(a.events, ['node'])
  assert.deepEqual(a.room.lit, ['n1', 'n2'])
  assert.equal(a.room.pattern, 0)
  const b = press(a.room, STAR, 'east', 'east')
  assert.deepEqual(b.room.lit, ['n1'])
  assert.equal(b.room.pattern, 1)
  const c = press(b.room, STAR, 'west', 'east')
  assert.deepEqual(c.room.lit, ['n1', 'n2'])
  assert.equal(c.room.pattern, 2)
  const d = press(c.room, STAR, 'west', 'east')
  assert.equal(d.room.pattern, 0)
})

test('the right alignment wakes the star', () => {
  const { room, events } = press(startRoom(STAR), STAR, ...toN1, 'east', 'east', 'south')
  assert.equal(room.status, 'cleared')
  assert.ok(events.includes('clear'))
})

test('a wrong attune only counts and answers', () => {
  const before = press(startRoom(STAR), STAR, 'east', 'north').room
  const { room, events, move } = stepRoom(before, STAR, 'east')
  assert.equal(move, 'bump')
  assert.deepEqual(events, ['attune'])
  assert.equal(room.status, 'playing')
  assert.equal(room.attunes, 1)
  assert.equal(room.message, 'The meteorite flickers. 2 of 4 lights answer.')
  assert.deepEqual(room.at, before.at)
  assert.equal(room.moves, before.moves)
  assert.deepEqual(room.seen, before.seen)
  assert.deepEqual(room.cluesRead, before.cluesRead)
  assert.deepEqual(room.lit, before.lit)
})

test('resetOnFail puts only the crystals back', () => {
  const st = starWith({ resetOnFail: true })
  const read = press(startRoom(st), st, 'north').room
  const lit1 = press(read, st, 'east', 'north', 'north', 'north').room
  assert.deepEqual(lit1.lit, ['n1', 'n2'])
  const wrong = press(lit1, st, 'east', 'south').room
  assert.equal(wrong.attunes, 1)
  assert.deepEqual(wrong.lit, [])
  assert.equal(wrong.pattern, 0)
  assert.deepEqual(wrong.cluesRead, ['0,2'])
  assert.deepEqual(wrong.at, { x: 2, y: 0 })
})

test('reset the crystals keeps the island', () => {
  const read = press(startRoom(STAR), STAR, 'north', 'east', 'north', 'north', 'north').room
  const attuned = press(read, STAR, 'east', 'south').room
  assert.equal(attuned.attunes, 1)
  assert.deepEqual(attuned.lit, ['n1', 'n2'])
  const after = resetAlignment(attuned, STAR)
  assert.deepEqual(after.lit, [])
  assert.equal(after.pattern, 0)
  for (const field of ['at', 'seen', 'cluesRead', 'open', 'attunes', 'moves']) assert.deepEqual(after[field], attuned[field])
})

test('a crystal opens its passage for good', () => {
  const st = stage(['@%A.'], { kind: 'star', star: { nodes: [{ id: 'n1', at: [1, 0], links: [], turns: 0, opens: 'A' }], patterns: 1, startLit: [],
    target: { lit: ['n1'], pattern: 0 }, resetOnFail: false, clues: [], hints: ['a', 'b', 'c'] } })
  const on = press(startRoom(st), st, 'east').room
  assert.equal(on.open, 'A')
  const off = press(on, st, 'west', 'east').room
  assert.deepEqual(off.lit, [])
  assert.equal(off.open, 'A')
  assert.equal(resetAlignment(off, st).open, 'A')
})

test('hints unlock every two misses', () => {
  const tier = (attunes) => hintTier({ ...startRoom(STAR), attunes })
  assert.deepEqual([1, 2, 4, 6, 9].map(tier), [0, 1, 2, 3, 3])
})

test('resonance counts crystals and the pattern', () => {
  assert.deepEqual(resonance(startRoom(STAR), STAR), { matching: 2, total: 4 })
  assert.deepEqual(resonance({ ...startRoom(STAR), lit: ['n1'], pattern: 1 }, STAR), { matching: 4, total: 4 })
})

test('tap-to-walk treats crystals as destinations and clues and the meteorite as walls', () => {
  const room = startRoom(STAR)
  assert.ok(planRoomWalk(room, STAR, { x: 1, y: 0 }))
  assert.ok(planRoomWalk(room, STAR, { x: 0, y: 2 }))
  assert.ok(planRoomWalk(room, STAR, { x: 2, y: 2 }))
})
