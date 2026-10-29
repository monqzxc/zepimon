import test from 'node:test'
import assert from 'node:assert/strict'
import { goalsMet, lit, startRoom, stepRoom } from '../src/games/trial.ts'

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
