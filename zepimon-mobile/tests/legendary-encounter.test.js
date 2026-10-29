import test from 'node:test'
import assert from 'node:assert/strict'
import { RESET_COOLDOWN, RESONANCE_SEALS, SHINY_ODDS, activateSeal, activeEncounter, catchEncounter, enterLair, finishTrial, leaveLair, legacyEncounters,
  readyToBattle, restoreEncounters, rollLegendaryShiny, saveCheckpoint, stabilizeResonance } from '../src/expedition-encounter.ts'
import { emptyQuest } from '../src/expedition-quest.ts'
import { startRun } from '../src/games/trials.ts'
import { stepRoom } from '../src/games/trial.ts'
import { trialStages } from '../src/generated/trial-maps.js'
import { expeditionEncounter, expeditionKey, legendarySpecies } from '../src/generated/expedition.js'
import { LANTERN_SIDE, lanternBoard, lanternsLit, pressLantern, questTheme } from '../src/games/lanterns.ts'
import { BATTLE_BALLS, FOE_HP, attackWith, catchChance, chooseMenu, finishAttack, finishIntro, finishThrow, runFromBattle, startBattle,
  throwBall } from '../src/games/legendary-battle.ts'

const NOW = Date.UTC(2026, 9, 28, 12)
const trail = { seed: 11, startedAt: 1000, meters: 30000, claimed: 0 }
const key = expeditionKey(trail)
const play = (encounters = {}, changes = {}) => ({ expeditions: { trails: { [key]: { ...trail, ...changes } }, dex: {} }, quest: emptyQuest(), encounters })
const SHINY = () => 0.001
const NORMAL = () => 0.5
const lair = (random = NORMAL) => enterLair(play(finishTrial(play(), key, 0)), key, 0, NOW, random)
// Writing to storage and reading back, as reopening the app does.
const reopen = encounters => restoreEncounters(JSON.parse(JSON.stringify(encounters)), play().expeditions, emptyQuest())
// The Resonance Trial in the lair, before the catch: switch on every seal and stabilize (tests/resonance-encounter.test.js).
const resonated = encounters => stabilizeResonance(play(RESONANCE_SEALS.reduce((saved, seal) => activateSeal(play(saved), key, 0, seal),
  encounters)), key, 0)

test('the trial must be finished first, and the first entry into the lair makes exactly one 1-in-100 roll', () => {
  assert.throws(() => enterLair(play(), key, 0, NOW, NORMAL), /trial/)
  assert.throws(() => finishTrial(play({}, { meters: 24999 }), key, 0), /not ready/)
  let rolls = 0
  const counted = () => { rolls++; return 0.5 }
  const opened = enterLair(play(finishTrial(play(), key, 0)), key, 0, NOW, counted)
  assert.equal(rolls, 1)
  assert.deepEqual(opened[key], { index: 0, name: expeditionEncounter(trail, 0).name, trial: true, shiny: false, attempt: 1,
    resetPending: false, nextResetAllowedAt: 0 })
  for (const random of [SHINY, NORMAL]) {
    assert.equal(enterLair(play(opened), key, 0, NOW + 60000, random), opened, 'Coming back without walking out never rerolls')
    assert.equal(enterLair(play(reopen(opened)), key, 0, NOW, random)[key].shiny, false, 'Neither does reopening the app')
  }
  assert.equal(lair(SHINY)[key].shiny, true)
  assert.equal(SHINY_ODDS, 100)
  assert.equal(rollLegendaryShiny(() => 0.0099), true)
  assert.equal(rollLegendaryShiny(() => 0.01), false)
  // mulberry32: a small, well-mixed seeded generator.
  let seed = 1, shiny = 0
  const random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = 0; i < 100000; i++) shiny += Number(rollLegendaryShiny(random))
  assert.ok(shiny > 850 && shiny < 1150, `1-in-100, not the canonical 1-in-50 draw (${shiny})`)
})

test('walking out seals the entrance for 1.5 seconds, then the next entry rolls once, keeping species, trial, distance and claims', () => {
  const opened = lair()
  assert.throws(() => leaveLair(play(finishTrial(play(), key, 0)), key, 0, false, NOW), /lair/, 'Nothing to reroll before the first roll')
  const pending = leaveLair(play(opened), key, 0, false, NOW)
  assert.deepEqual(pending[key], { ...opened[key], resetPending: true, nextResetAllowedAt: NOW + RESET_COOLDOWN })
  assert.equal(RESET_COOLDOWN, 1500)
  assert.equal(readyToBattle(pending[key]), false, 'Nothing to challenge while you are outside')
  assert.equal(leaveLair(play(pending), key, 0, false, NOW + 1000), pending, 'Walking out again neither extends nor restarts the wait')
  assert.throws(() => enterLair(play(pending), key, 0, NOW + 1499, SHINY), /sealed/, 'Too early: the entrance is still sealed')
  let rolls = 0
  const done = enterLair(play(pending), key, 0, NOW + 1500, () => { rolls++; return 0.001 })
  assert.equal(rolls, 1)
  assert.deepEqual(done[key], { index: 0, name: opened[key].name, trial: true, shiny: true, attempt: 2, resetPending: false, nextResetAllowedAt: NOW + 1500 })
  assert.equal(enterLair(play(done), key, 0, NOW + 9000, NORMAL), done, 'One roll per walk out')
  assert.deepEqual(play(done).expeditions, play().expeditions, 'Distance and claims are untouched')
})

test('the wait survives closing the app; a turned-back clock cannot freeze it', () => {
  const pending = reopen(leaveLair(play(lair()), key, 0, false, NOW))
  assert.equal(pending[key].resetPending, true)
  assert.equal(pending[key].nextResetAllowedAt, NOW + RESET_COOLDOWN)
  assert.throws(() => enterLair(play(pending), key, 0, NOW + 1000, SHINY), /sealed/, 'Back too early: still sealed')
  const resumed = enterLair(play(pending), key, 0, NOW + 60000, SHINY)
  assert.deepEqual([resumed[key].shiny, resumed[key].attempt, resumed[key].resetPending], [true, 2, false])
  const backwards = enterLair(play(pending), key, 0, NOW - 3600000, NORMAL)
  assert.equal(backwards[key].resetPending, false)
})

test('leaving a Shiny behind needs its own confirmation', () => {
  const shiny = lair(SHINY)
  assert.throws(() => leaveLair(play(shiny), key, 0, false, NOW), /Shiny/)
  assert.equal(leaveLair(play(shiny), key, 0, true, NOW)[key].resetPending, true)
})

test('the first seal sets the result: walking out after that rerolls nothing', () => {
  const sealed = activateSeal(play(lair(SHINY)), key, 0, 'pulse')
  assert.deepEqual(sealed[key].resonance, { started: true, seals: ['pulse'], stabilized: false })
  assert.throws(() => leaveLair(play(sealed), key, 0, true, NOW), /seal/)
  assert.equal(enterLair(play(sealed), key, 0, NOW + 60000, NORMAL), sealed, 'Coming back finds the same Shiny')
})

test('only a successful catch claims, once, with the result from the lair; failing or leaving keeps everything', () => {
  assert.throws(() => catchEncounter(play(finishTrial(play(), key, 0)), key, 0, NOW), /lair/, 'No catch before the roll')
  const shiny = lair(SHINY)
  assert.throws(() => catchEncounter(play(leaveLair(play(shiny), key, 0, true, NOW)), key, 0, NOW), /lair/, 'No catch after walking out')
  // A failed catch or leaving does not call the claim at all: the saved encounter is unchanged and can be caught later.
  assert.deepEqual(reopen(shiny), shiny)
  assert.throws(() => catchEncounter(play(shiny), key, 0, NOW), /Resonance/, 'No catch before the Resonance Trial')
  const { expeditions, encounters } = catchEncounter(play(resonated(shiny)), key, 0, NOW)
  const name = expeditionEncounter(trail, 0).name
  assert.equal(expeditions.trails[key].claimed, 1)
  assert.deepEqual(Object.keys(expeditions.dex), [`Shiny ${name}`])
  assert.equal(expeditions.dex[`Shiny ${name}`].source, 'expedition')
  assert.deepEqual(encounters, {})
  assert.throws(() => catchEncounter({ expeditions, quest: emptyQuest(), encounters: shiny }, key, 0, NOW), /not ready/, 'A second catch cannot claim again')
  assert.deepEqual(restoreEncounters(shiny, expeditions, emptyQuest()), {}, 'A stale encounter is dropped on reopen')
})

test('old saves keep a Shiny they were already showing; other encounters roll fresh', () => {
  let shinySeed, normalSeed
  for (let seed = 0; seed < 5000 && (shinySeed === undefined || normalSeed === undefined); seed++) {
    if (expeditionEncounter({ seed }, 0).shiny) shinySeed ??= seed
    else normalSeed ??= seed
  }
  const trails = {}
  for (const [seed, meters] of [[shinySeed, 26000], [normalSeed, 26000], [shinySeed + 39 * 3, 24000]]) {
    const value = { seed, startedAt: 1, meters, claimed: 0 }
    trails[expeditionKey(value)] = value
  }
  const legacy = legacyEncounters({ trails, dex: {} })
  assert.deepEqual(Object.keys(legacy), [expeditionKey({ seed: shinySeed, startedAt: 1 })])
  const kept = Object.values(legacy)[0]
  assert.deepEqual([kept.shiny, kept.attempt, kept.trial], [true, 1, false])
  const restored = restoreEncounters(JSON.parse(JSON.stringify(legacy)), { trails, dex: {} }, emptyQuest())
  assert.deepEqual(restored, legacy)
  const key0 = Object.keys(legacy)[0]
  const quest = emptyQuest()
  const opened = enterLair({ expeditions: { trails, dex: {} }, quest, encounters: finishTrial({ expeditions: { trails, dex: {} }, quest, encounters: legacy }, key0, 0) },
    key0, 0, NOW, NORMAL)
  assert.equal(opened[key0].shiny, true, 'The kept Shiny is not rerolled when its lair is entered')
})

test('saved encounters must match their trail: wrong species, index or fields are dropped', () => {
  const opened = lair()[key]
  for (const changed of [{ name: 'Mew' === opened.name ? 'Lugia' : 'Mew' }, { index: 1 }, { shiny: null }, { attempt: -1 }, { trial: 'yes' },
    { nextResetAllowedAt: Infinity }, { shiny: null, attempt: 0, resetPending: true }]) {
    assert.deepEqual(restoreEncounters({ [key]: { ...opened, ...changed } }, play().expeditions, emptyQuest()), {})
  }
  assert.deepEqual(restoreEncounters({ elsewhere: opened }, play().expeditions, emptyQuest()), {})
  assert.deepEqual(restoreEncounters('nope', play().expeditions, emptyQuest()), {})
  assert.equal(activeEncounter(play({ [key]: { ...opened, index: 3 } }), key, 0).shiny, null, 'An entry for another index never leaks in')
})

test('the shrine lanterns start dimmed, the same each time, and can always be lit', () => {
  const solvable = board => {
    for (let mask = 0; mask < 512; mask++) {
      let next = board
      for (let i = 0; i < 9; i++) if (mask & (1 << i)) next = pressLantern(next, i)
      if (lanternsLit(next)) return true
    }
    return false
  }
  for (let number = 0; number < 40; number++) {
    const board = lanternBoard(number)
    assert.deepEqual(lanternBoard(number), board)
    assert.equal(board.lit.length, LANTERN_SIDE ** 2)
    assert.equal(lanternsLit(board), false)
    assert.ok(solvable(board), `quest ${number}`)
    assert.ok(questTheme(number).title)
  }
  const dark = { lit: Array(9).fill(false), presses: 0 }
  assert.deepEqual(pressLantern(dark, 4).lit, [false, true, false, true, true, true, false, true, false])
  assert.deepEqual(pressLantern(dark, 0).lit, [true, true, false, true, false, false, false, false, false])
  assert.equal(pressLantern(dark, 9), dark)
})

test('the battle never knocks the Legendary out and reaches a catch only through a Poké Ball', () => {
  let battle = startBattle({ name: 'Rayquaza', shiny: true }, { name: 'Pikachu', shiny: false })
  assert.deepEqual([battle.phase, battle.foe.hp, battle.balls, battle.foe.level], ['intro', FOE_HP, BATTLE_BALLS, 70])
  assert.equal(attackWith(battle, 0, () => 0.99), battle, 'Nothing happens during the intro')
  battle = finishIntro(battle)
  assert.equal(attackWith(battle, 0), battle, 'Moves need the FIGHT menu')
  assert.deepEqual(battle.moves.map(move => move.name), ['Thunder Shock', 'False Swipe'])
  for (let turn = 0; turn < 20; turn++) {
    battle = attackWith(chooseMenu(battle, 'fight'), turn % 2, () => 0.99)
    assert.equal(battle.phase, 'attack')
    assert.ok(battle.foe.hp >= 1)
    assert.equal(finishThrow(battle), battle)
    battle = finishAttack(battle)
  }
  assert.equal(battle.foe.hp, 1)
  assert.ok(catchChance(1) > catchChance(50) && catchChance(50) > catchChance(FOE_HP))
  assert.equal(throwBall(battle, () => 0), battle, 'Balls come from the Bag')
  let missed = throwBall(chooseMenu(battle, 'bag'), () => 0.999)
  assert.deepEqual([missed.phase, missed.balls, missed.ball.caught], ['throw', BATTLE_BALLS - 1, false])
  missed = finishThrow(missed)
  assert.deepEqual([missed.phase, missed.foe.hp], ['choose', 1], 'A failed throw keeps the battle going')
  let out = missed
  for (let i = 0; i < BATTLE_BALLS - 1; i++) out = finishThrow(throwBall(chooseMenu(out, 'bag'), () => 0.999))
  assert.equal(out.phase, 'out')
  assert.equal(chooseMenu(out, 'bag'), out)
  const caught = finishThrow(throwBall(chooseMenu(missed, 'bag'), () => 0))
  assert.deepEqual([caught.phase, caught.ball.shakes], ['caught', 3])
  assert.match(caught.message, /Gotcha! Shiny Rayquaza/)
  for (const action of [b => runFromBattle(b), b => chooseMenu(b, 'fight'), b => throwBall(b, () => 0), b => finishThrow(b)]) {
    assert.equal(action(caught), caught, 'Caught is final')
  }
  const fled = runFromBattle(missed)
  assert.equal(fled.phase, 'fled')
  assert.equal(throwBall(chooseMenu(fled, 'bag'), () => 0), fled, 'Running ends the battle without a catch')
})

const stepRun = (run, ...directions) => directions.reduce((current, direction) => ({ ...current, room: stepRoom(current.room, trialStages[current.stages[current.index]], direction).room }), run)
const TRIAL_RUN = () => stepRun(startRun(['switch-tutorial', 'switch-1']), 'east', 'east')

test('a checkpoint is kept until the trial is done', () => {
  const run = TRIAL_RUN()
  const saved = saveCheckpoint(play(), key, 0, run)
  assert.deepEqual(saved[key].checkpoint, run)
  assert.equal(saved[key].trial, false)
  assert.deepEqual(activeEncounter(play(saved), key, 0).checkpoint, run)
  const done = finishTrial(play(saved), key, 0)
  assert.equal(Object.hasOwn(done[key], 'checkpoint'), false)
  assert.equal(done[key].trial, true)
  assert.deepEqual(done[key], { index: 0, name: expeditionEncounter(trail, 0).name, trial: true, shiny: null, attempt: 0, resetPending: false, nextResetAllowedAt: 0 })
})

test('reopening keeps a good checkpoint and drops a broken one', () => {
  const run = TRIAL_RUN()
  const saved = saveCheckpoint(play(), key, 0, run)
  assert.deepEqual(reopen(saved)[key].checkpoint, run)
  const broken = JSON.parse(JSON.stringify(saved))
  broken[key].checkpoint.room.at = { x: -1, y: 0 }
  const restored = restoreEncounters(broken, play().expeditions, emptyQuest())
  assert.ok(restored[key], 'The encounter itself is kept')
  assert.equal(restored[key].checkpoint, undefined)
  assert.equal(Object.hasOwn(restored[key], 'checkpoint'), false)
  assert.equal(restored[key].index, 0)
  const finished = JSON.parse(JSON.stringify(finishTrial(play(saved), key, 0)))
  finished[key].checkpoint = JSON.parse(JSON.stringify(run))
  assert.equal(restoreEncounters(finished, play().expeditions, emptyQuest())[key].checkpoint, undefined, 'No checkpoint survives a finished trial')
  const garbage = JSON.parse(JSON.stringify(saved))
  garbage[key].checkpoint = 'nope'
  assert.equal(restoreEncounters(garbage, play().expeditions, emptyQuest())[key].checkpoint, undefined)
})

test('no checkpoint after the trial', () => {
  const finished = finishTrial(play(), key, 0)
  assert.throws(() => saveCheckpoint(play(finished), key, 0, TRIAL_RUN()), /finished/)
})
