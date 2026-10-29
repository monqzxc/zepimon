import test from 'node:test'
import assert from 'node:assert/strict'
import { RESONANCE_SEALS, activateSeal, catchEncounter, finishReset, finishTrial, openChamber, readyToCapture, requestReset, resonanceStage,
  restoreEncounters, stabilizeResonance, startResonance } from '../src/expedition-encounter.ts'
import { emptyQuest } from '../src/expedition-quest.ts'
import { expeditionEncounter, expeditionKey, legendarySpecies } from '../src/generated/expedition.js'

// The Legendary Resonance Trial sits between the chamber and the catch. Its progress lives on the saved encounter, beside
// the trial and the chamber roll, and follows the same rules: one encounter per trail, nothing claimed until the catch.
const NOW = Date.UTC(2026, 9, 29, 12)
const trail = { seed: 23, startedAt: 1000, meters: 30000, claimed: 0 }
const key = expeditionKey(trail)
const play = (encounters = {}) => ({ expeditions: { trails: { [key]: { ...trail } }, dex: {} }, quest: emptyQuest(), encounters })
const NORMAL = () => 0.5
const SHINY = () => 0.001
const chamber = (random = NORMAL) => openChamber(play(finishTrial(play(), key, 0)), key, 0, NOW, random)
const reopen = encounters => restoreEncounters(JSON.parse(JSON.stringify(encounters)), play().expeditions, emptyQuest())
const allSeals = encounters => RESONANCE_SEALS.reduce((saved, seal) => activateSeal(play(saved), key, 0, seal), encounters)
const stabilized = (random = NORMAL) => stabilizeResonance(play(allSeals(startResonance(play(chamber(random)), key, 0))), key, 0)

test('there are four seals, and the species is still the canonical draw', () => {
  assert.deepEqual([...RESONANCE_SEALS], ['wave', 'runes', 'pulse', 'stones'])
  assert.equal(legendarySpecies.length, 39)
  assert.equal(stabilized()[key].name, legendarySpecies[(trail.seed + 0) % 39])
  assert.equal(stabilized()[key].name, expeditionEncounter(trail, 0).name)
})

test('the trial starts only from a settled chamber, once, and keeps the chamber result', () => {
  assert.throws(() => startResonance(play(), key, 0), /chamber/, 'Not before the trial')
  assert.throws(() => startResonance(play(finishTrial(play(), key, 0)), key, 0), /chamber/, 'Not before the first roll')
  const pending = requestReset(play(chamber()), key, 0, false, NOW)
  assert.throws(() => startResonance(play(pending), key, 0), /chamber/, 'Not while a reset gathers energy')
  const opened = chamber(SHINY)
  const started = startResonance(play(opened), key, 0)
  assert.deepEqual(started[key].resonance, { started: true, seals: [], stabilized: false })
  for (const field of ['name', 'shiny', 'attempt', 'nextResetAllowedAt', 'trial']) assert.equal(started[key][field], opened[key][field], field)
  assert.equal(startResonance(play(started), key, 0), started, 'Starting again changes nothing')
  assert.equal(resonanceStage(opened[key]), 'ready')
  assert.equal(resonanceStage(started[key]), 'active')
})

test('once the trial has started the encounter can no longer be reset or rerolled', () => {
  const started = startResonance(play(chamber(SHINY)), key, 0)
  assert.throws(() => requestReset(play(started), key, 0, true, NOW), /Resonance Trial/)
  assert.throws(() => requestReset(play(started), key, 0, false, NOW + 60000), /Resonance Trial/)
  // Reopening the chamber or finishing a (non-existent) reset never rolls again.
  assert.equal(openChamber(play(started), key, 0, NOW + 60000, () => 0.9), started)
  assert.equal(finishReset(play(started), key, 0, NOW + 60000, () => 0.9), started)
  assert.equal(reopen(started)[key].shiny, true, 'The Shiny survives a restart')
})

test('seals switch on one at a time, any order, each only once', () => {
  assert.throws(() => activateSeal(play(chamber()), key, 0, 'wave'), /Start/, 'No seals before the trial starts')
  let saved = startResonance(play(chamber()), key, 0)
  assert.throws(() => activateSeal(play(saved), key, 0, 'moon'), /seal/)
  saved = activateSeal(play(saved), key, 0, 'pulse')
  saved = activateSeal(play(saved), key, 0, 'wave')
  assert.deepEqual(saved[key].resonance.seals, ['pulse', 'wave'])
  assert.equal(activateSeal(play(saved), key, 0, 'pulse'), saved, 'A seal already on changes nothing')
  assert.deepEqual(reopen(saved)[key].resonance, saved[key].resonance, 'Seal progress survives a restart')
  assert.throws(() => stabilizeResonance(play(saved), key, 0), /seal/, 'Stabilizing needs every seal')
})

test('stabilizing unlocks the capture once; failing or leaving keeps every seal', () => {
  const done = stabilized()
  assert.equal(done[key].resonance.stabilized, true)
  assert.equal(resonanceStage(done[key]), 'capture-ready')
  assert.equal(readyToCapture(done[key]), true)
  assert.equal(stabilizeResonance(play(done), key, 0), done, 'Stabilizing again changes nothing')
  // A failed catch never calls the claim: the saved encounter, seals and all, comes back exactly as it was.
  assert.deepEqual(reopen(done), done)
  assert.equal(resonanceStage(reopen(done)[key]), 'capture-ready', 'Capture stays unlocked after a restart')
})

test('the catch needs the stabilized trial, claims exactly once, and nothing earlier touches the trail or the Dex', () => {
  const started = startResonance(play(chamber(SHINY)), key, 0)
  assert.throws(() => catchEncounter(play(chamber()), key, 0, NOW), /Resonance/, 'No catch straight from the chamber')
  assert.throws(() => catchEncounter(play(allSeals(started)), key, 0, NOW), /Resonance/, 'No catch before stabilizing')
  // Every step before the catch returns only encounters: the trail's claims and the Dex are never in its hands.
  for (const step of [startResonance, (p, k, i) => activateSeal(p, k, i, 'runes')]) {
    const result = step(play(started), key, 0)
    assert.ok(!('expeditions' in result) && result[key], 'Encounters only')
  }
  const ready = stabilizeResonance(play(allSeals(started)), key, 0)
  const { expeditions, encounters } = catchEncounter(play(ready), key, 0, NOW)
  const name = expeditionEncounter(trail, 0).name
  assert.equal(expeditions.trails[key].claimed, 1)
  assert.deepEqual(Object.keys(expeditions.dex), [`Shiny ${name}`])
  assert.deepEqual(encounters, {})
  assert.throws(() => catchEncounter({ expeditions, quest: emptyQuest(), encounters: ready }, key, 0, NOW), /not ready/, 'A second catch cannot claim again')
  assert.deepEqual(restoreEncounters(ready, expeditions, emptyQuest()), {}, 'The caught encounter is gone after a restart')
})

test('saved resonance progress that does not add up is dropped, keeping the rest of the encounter', () => {
  const base = chamber()
  const saved = progress => reopen({ [key]: { ...base[key], resonance: progress } })[key]
  assert.deepEqual(saved({ started: true, seals: ['wave', 'stones'], stabilized: false }).resonance, { started: true, seals: ['wave', 'stones'], stabilized: false })
  for (const bad of [{ started: true, seals: ['wave', 'wave'], stabilized: false }, { started: true, seals: ['moon'], stabilized: false },
    { started: true, seals: ['wave'], stabilized: true }, { started: false, seals: ['wave'], stabilized: false }, { started: 'yes', seals: [], stabilized: false },
    { started: true, seals: 'wave', stabilized: false }, null, 7]) {
    const encounter = saved(bad)
    assert.equal(encounter.resonance, undefined, JSON.stringify(bad))
    assert.equal(encounter.shiny, base[key].shiny, 'The chamber result is kept')
  }
  // Progress on an encounter whose chamber is not settled cannot be real.
  const unsettled = reopen({ [key]: { ...finishTrial(play(), key, 0)[key], resonance: { started: true, seals: [], stabilized: false } } })[key]
  assert.equal(unsettled.resonance, undefined)
})
