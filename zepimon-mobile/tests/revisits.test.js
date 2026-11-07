import test from 'node:test'
import assert from 'node:assert/strict'
import { legendarySpecies } from '../src/generated/expedition.js'
import { trialStages } from '../src/generated/trial-maps.js'
import { emptyQuest } from '../src/expedition-quest.ts'
import { caughtLegendaries, canRevisit, journeyRoom, practiceClear, rematchWin, restoreRematchWins, revisitKey, revisitRooms, roomLine, roomsExplored } from '../src/games/revisits.ts'

const record = shiny => ({ meters: 25000, steps: 0, shiny, form: '', source: 'expedition', finishedAt: '2026-10-01T00:00:00.000Z' })
// A player mid-way through an expedition: a trail with claims, two friends (one Shiny), a permit and a waiting encounter
// with a saved checkpoint.
const saved = () => ({
  expeditions: {
    trails: { '1767225600000:12345': { meters: 60000, seed: 12345, startedAt: 1767225600000, claimed: 2 } },
    dex: { Jirachi: record(false), 'Shiny Rayquaza': record(true) }
  },
  quest: { ...emptyQuest(), permits: 1, unlocks: { '1767225600000:12345': 1 } },
  encounters: { '1767225600000:12345': { index: 2, name: 'Uxie', shiny: null, trial: false, resetPending: false,
    checkpoint: { stages: ['warp-1'], index: 0, results: {} } } },
  trialRecords: { 'switch-1': 80, star: 120 },
  rematchWins: { Jirachi: 2 }
})
// Everything a revisit must leave alone, by reference.
const untouched = (before, after) => {
  assert.equal(after.expeditions, before.expeditions, 'expeditions (trails and dex) unchanged')
  assert.equal(after.expeditions.trails, before.expeditions.trails)
  assert.equal(after.expeditions.dex, before.expeditions.dex)
  assert.equal(after.quest, before.quest, 'quest and permits unchanged')
  assert.equal(after.encounters, before.encounters, 'encounters, Shiny rolls and checkpoints unchanged')
}

test('caught Legendaries are listed in species order, a Shiny catch as its own entry', () => {
  const dex = { 'Shiny Rayquaza': record(true), Jirachi: record(false), Rayquaza: record(false), Pikachu: record(false), 'Shiny Mew': record(true) }
  assert.deepEqual(caughtLegendaries(dex), [
    { name: 'Mew', shiny: true, key: 'Shiny Mew' },
    { name: 'Rayquaza', shiny: false, key: 'Rayquaza' },
    { name: 'Rayquaza', shiny: true, key: 'Shiny Rayquaza' },
    { name: 'Jirachi', shiny: false, key: 'Jirachi' }
  ])
  assert.deepEqual(caughtLegendaries({}), [], 'Nothing caught, nothing to revisit')
})

test('a Legendary revisits every room of its kind, and Deoxys only the island', () => {
  assert.deepEqual(revisitRooms('Jirachi'), ['switch-tutorial', 'switch-1', 'switch-2', 'switch-3'])
  assert.deepEqual(revisitRooms('Latias'), ['crumble-tutorial', 'crumble-1', 'crumble-2', 'crumble-3'])
  assert.deepEqual(revisitRooms('Articuno'), ['crumble-tutorial', 'sig-articuno'], 'A signature room replaces the main rooms')
  assert.deepEqual(revisitRooms('Zapdos'), ['switch-tutorial', 'sig-zapdos'])
  assert.deepEqual(revisitRooms('Deoxys'), ['star'])
  for (const name of legendarySpecies) {
    const rooms = revisitRooms(name)
    assert.ok(rooms.length > 0, name)
    for (const id of rooms) assert.ok(Object.hasOwn(trialStages, id), `${name}: ${id} is a room`)
  }
})

test('rooms explored counts the rooms of its own shrine that have a best', () => {
  const { trialRecords } = saved()
  assert.deepEqual(roomsExplored('Jirachi', trialRecords), { explored: 1, rooms: 4 })
  assert.deepEqual(roomsExplored('Latias', trialRecords), { explored: 0, rooms: 4 }, 'Another kind’s rooms do not count')
  assert.deepEqual(roomsExplored('Moltres', { 'sig-moltres': 60 }), { explored: 1, rooms: 2 })
  assert.deepEqual(roomsExplored('Deoxys', trialRecords), { explored: 1, rooms: 1 })
  assert.deepEqual(roomsExplored('Jirachi', {}), { explored: 0, rooms: 4 })
})

test('only caught Legendaries can be revisited, in the form they were caught', () => {
  const dex = saved().expeditions.dex
  assert.equal(canRevisit(dex, 'Jirachi', false), true)
  assert.equal(canRevisit(dex, 'Rayquaza', true), true)
  assert.equal(canRevisit(dex, 'Jirachi', true), false, 'A Normal catch does not open a Shiny rematch')
  assert.equal(canRevisit(dex, 'Rayquaza', false), false, 'A Shiny catch does not open a Normal rematch')
  assert.equal(canRevisit(dex, 'Mewtwo', false), false, 'Never caught')
  assert.equal(canRevisit({ Pikachu: record(false) }, 'Pikachu', false), false, 'Only Legendaries have shrines')
  assert.equal(revisitKey('Rayquaza', true), 'Shiny Rayquaza')
})

test('each room shows its best and par when known', () => {
  const par = trialStages['switch-2'].par
  assert.equal(roomLine('switch-2', { 'switch-2': 64 }), `Room 2 · best 64 · par ${par}`)
  assert.equal(roomLine('switch-2', {}), `Room 2 · par ${par}`)
  assert.equal(roomLine('sig-moltres', { 'sig-moltres': 61 }), `Ember Caldera · best 61 · par ${trialStages['sig-moltres'].par}`, 'A signature room goes by its trial’s name')
  assert.equal(roomLine('switch-tutorial', { 'switch-tutorial': 9 }), `Tutorial · best 9 · par ${trialStages['switch-tutorial'].par}`)
  assert.equal(roomLine('star', {}), `The island · par ${trialStages.star.par}`)
})

test('a practice clear changes only trialRecords, keeping the lower moves', () => {
  const before = saved()
  const better = practiceClear(before, 'Jirachi', false, { 'switch-1': 70 })
  untouched(before, better)
  assert.equal(better.rematchWins, before.rematchWins)
  assert.deepEqual(better.trialRecords, { 'switch-1': 70, star: 120 })
  assert.deepEqual(Object.keys(better).sort(), Object.keys(before).sort(), 'No new fields')

  const worse = practiceClear(before, 'Jirachi', false, { 'switch-1': 95 })
  assert.deepEqual(worse.trialRecords, { 'switch-1': 80, star: 120 }, 'A slower clear keeps the old best')
  const fresh = practiceClear(before, 'Jirachi', false, { 'switch-tutorial': 12 })
  assert.deepEqual(fresh.trialRecords, { 'switch-1': 80, star: 120, 'switch-tutorial': 12 }, 'A first clear is saved')
  const island = practiceClear(before, 'Rayquaza', true, { 'sig-rayquaza': 140 })
  untouched(before, island)
  assert.deepEqual(before.trialRecords, { 'switch-1': 80, star: 120 }, 'The old state is never mutated')
})

test('a practice clear for an uncaught Legendary or another kind of room is refused', () => {
  const before = saved()
  assert.throws(() => practiceClear(before, 'Mewtwo', false, { 'warp-1': 10 }), /caught/)
  assert.throws(() => practiceClear(before, 'Jirachi', true, { 'switch-1': 10 }), /caught/, 'Shiny form not caught')
  assert.throws(() => practiceClear(before, 'Jirachi', false, { 'warp-1': 10 }), /room/, "Not one of Jirachi's rooms")
  assert.throws(() => practiceClear(before, 'Jirachi', false, { 'switch-1': -3 }), /room/)
  assert.throws(() => practiceClear(before, 'Jirachi', false, { 'switch-1': 2.5 }), /room/)
  assert.deepEqual(before, saved(), 'Nothing changed')
})

test('a rematch win changes only rematchWins, and only for a caught Legendary', () => {
  const before = saved()
  const won = rematchWin(before, 'Jirachi', false)
  untouched(before, won)
  assert.equal(won.trialRecords, before.trialRecords)
  assert.deepEqual(won.rematchWins, { Jirachi: 3 })
  assert.deepEqual(rematchWin(before, 'Rayquaza', true).rematchWins, { Jirachi: 2, 'Shiny Rayquaza': 1 }, 'Keyed like the Dex')
  assert.throws(() => rematchWin(before, 'Mewtwo', false), /caught/)
  assert.throws(() => rematchWin(before, 'Rayquaza', false), /caught/)
  assert.deepEqual(before, saved())
})

test('saved rematch wins keep only Legendary keys with positive whole counts', () => {
  assert.deepEqual(restoreRematchWins({ Jirachi: 3, 'Shiny Rayquaza': 1, Pikachu: 4, Mew: 0, Mewtwo: -1, Lugia: 1.5, 'Shiny Shiny Mew': 2, Celebi: '2' }),
    { Jirachi: 3, 'Shiny Rayquaza': 1 })
  assert.deepEqual(restoreRematchWins(undefined), {})
  assert.deepEqual(restoreRematchWins([1, 2]), {})
  assert.deepEqual(restoreRematchWins(null), {})
})

test("a revisit's journey plays the Legendary's own room, never a tutorial, and its moves can be saved", () => {
  assert.equal(journeyRoom('Articuno', {}), 'sig-articuno', 'Its signature room, even before the tutorial is cleared')
  assert.equal(journeyRoom('Deoxys', {}), 'star')
  assert.equal(journeyRoom('Jirachi', {}), 'switch-1', 'A shared trial plays the main room it would play next')
  assert.equal(journeyRoom('Jirachi', { 'switch-tutorial': 9, 'switch-1': 70 }), 'switch-2')
  for (const name of legendarySpecies) {
    const room = journeyRoom(name, {})
    assert.ok(!room.endsWith('-tutorial'), `${name}: ${room}`)
    assert.ok(revisitRooms(name).includes(room), `${name}: a journey's clear is a room of its own shrine`)
  }
})
