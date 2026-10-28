import test from 'node:test'
import assert from 'node:assert/strict'
import { claimExpedition, emptyExpeditions, importExpeditions, restoreExpeditions } from '../src/expeditions.ts'
import { QUEST_SESSIONS, arcadePointsLeft, completeChallenge, distanceLeg, earnArcadePermit, earnPermit, emptyQuest, encounterReady, questSessions, restoreQuest, spendPermit,
  trailUnlocked } from '../src/expedition-quest.ts'
import { catchEncounter, finishTrial, openChamber } from '../src/expedition-encounter.ts'
import { emptyProgress, importProgress } from '../src/progress.ts'
import { parseJournal } from '../src/journal.ts'
import { ARCADE_PERMIT_POINTS, achieved, arcadeAchievements, arcadePoints } from '../src/games/achievements.ts'
import { saveBestScore } from '../src/games/scores.ts'
import { saveStars } from '../src/games/adventure.ts'
import { addSafariCatch } from '../src/games/safari.ts'
import { expeditionEncounter, expeditionKey } from '../src/generated/expedition.js'

const START = Date.UTC(2026, 9, 1)
const NOW = Date.UTC(2026, 9, 28)
const day = n => START + n * 86400000
const trailOf = (meters, claimed = 0, seed = 7) => ({ seed, startedAt: START, meters, claimed })
const keyOf = trail => expeditionKey(trail)
const progressWith = (...trails) => ({ trails: Object.fromEntries(trails.map(trail => [keyOf(trail), trail])), dex: {} })
// A watch journal whose recent log holds these saved adventures.
const journalOf = (runs, meters = 0) => parseJournal(JSON.stringify({
  exportVersion: 1, app: 'Zepimon', exportedAt: new Date(NOW).toISOString(), receivedAt: NOW, routes: [['Bulbasaur', 'Ivysaur', 'Venusaur']],
  snapshot: { schemaVersion: 1, capturedAt: NOW, dex: {}, records: {}, active: null, expedition: { seed: 7, startedAt: START, meters },
    recent: runs.map(([at, runMeters]) => ({ route: 0, meters: runMeters, steps: 100, shiny: false, startedAt: at - 3600000, finishedAt: new Date(at).toISOString() })) }
}))
const sessionsFor = (quest, progress, expeditions) => questSessions(quest, progress, expeditions, NOW)

test('the distance route opens at exactly 25,000 m of saved distance', () => {
  for (const [meters, ready] of [[24999, false], [25000, true]]) {
    const trail = trailOf(meters)
    assert.equal(encounterReady(emptyQuest(), keyOf(trail), trail), ready)
    const progress = progressWith(trail)
    if (ready) assert.equal(claimExpedition(progress, keyOf(trail), 0, NOW).trails[keyOf(trail)].claimed, 1)
    else assert.throws(() => claimExpedition(progress, keyOf(trail), 0, NOW), /not ready/)
  }
  assert.equal(distanceLeg(emptyQuest(), keyOf(trailOf(24999)), trailOf(24999)), 24999)
  assert.equal(distanceLeg(emptyQuest(), keyOf(trailOf(60000, 1)), trailOf(60000, 1)), 25000, 'A second encounter waits at 50 km')
})

test('quest sessions count only saved walks and runs of 1 km or more, once each, from the quest window', () => {
  const expeditions = progressWith(trailOf(4000))
  const journal = journalOf([[day(-1), 5000], [day(1), 999], [day(2), 1000], [day(3), 3000], [Date.UTC(2027, 0, 1), 5000]])
  let progress = importProgress(emptyProgress(), journal, NOW)
  const counted = sessionsFor(emptyQuest(), progress, expeditions)
  assert.deepEqual(counted.map(run => run.record.meters), [1000, 3000],
    'Before the trail began, under 1 km and future-dated adventures do not count')
  for (let i = 0; i < 3; i++) progress = importProgress(progress, journal, NOW)
  assert.equal(sessionsFor(emptyQuest(), progress, expeditions).length, 2, 'Importing the same journal again adds nothing')
  // The phone saved the same shared adventure the watch did (same family and start): it counts once.
  const shared = progress.runs.find(run => run.record.meters === 3000)
  progress = { ...progress, runs: [...progress.runs, { ...shared, id: 'phone-copy', record: { ...shared.record, meters: 3200, finishedAt: new Date(day(3) + 60000).toISOString() } }] }
  assert.equal(sessionsFor(emptyQuest(), progress, expeditions).length, 2)
  assert.equal(sessionsFor(emptyQuest(), progress, emptyExpeditions()).length, 0, 'No trail yet, so no quest window')
})

test('three sessions plus the shrine challenge award exactly one permit, and the next quest needs new sessions', () => {
  const expeditions = progressWith(trailOf(9000))
  const progress = importProgress(emptyProgress(), journalOf([[day(1), 2000], [day(2), 2000], [day(3), 2000], [day(4), 1500]]), NOW)
  let quest = emptyQuest()
  assert.throws(() => earnPermit(quest, sessionsFor(quest, progress, expeditions)), /shrine challenge/, 'Sessions alone are not enough')
  const twoSessions = importProgress(emptyProgress(), journalOf([[day(1), 2000], [day(2), 2000]]), NOW)
  assert.throws(() => earnPermit(completeChallenge(quest), sessionsFor(quest, twoSessions, expeditions)), /three sessions/)
  quest = completeChallenge(quest)
  assert.equal(completeChallenge(quest), quest, 'Finishing the challenge again changes nothing')
  quest = earnPermit(quest, sessionsFor(quest, progress, expeditions))
  assert.deepEqual({ permits: quest.permits, number: quest.number, challenge: quest.challenge }, { permits: 1, number: 1, challenge: false })
  assert.throws(() => earnPermit(quest, sessionsFor(quest, progress, expeditions)), /first/, 'The same quest cannot pay out twice')
  assert.throws(() => earnPermit(completeChallenge(quest), sessionsFor(quest, progress, expeditions)), /three sessions/,
    'Sessions used for a permit never count again')
  assert.deepEqual(sessionsFor(quest, progress, expeditions).map(run => run.record.meters), [1500], 'The fourth session carries over')
  const again = importProgress(progress, journalOf([[day(1), 2000], [day(2), 2000], [day(3), 2000], [day(4), 1500]]), NOW)
  assert.equal(sessionsFor(quest, again, expeditions).length, 1, 'A repeated watch or cloud import cannot refill the quest')
  assert.equal(QUEST_SESSIONS, 3)
})

test('a permit opens the same next encounter below 25 km, once, and keeps claim order and the normal catch flow', () => {
  const trail = trailOf(12000)
  const key = keyOf(trail)
  let expeditions = progressWith(trail)
  let quest = { ...emptyQuest(), permits: 1 }
  assert.throws(() => spendPermit(emptyQuest(), expeditions, key), /no Expedition Permit/)
  assert.throws(() => spendPermit(quest, expeditions, 'missing'), /already open/)
  quest = spendPermit(quest, expeditions, key)
  assert.deepEqual({ permits: quest.permits, unlocks: quest.unlocks }, { permits: 0, unlocks: { [key]: 1 } })
  assert.ok(encounterReady(quest, key, trail))
  assert.throws(() => spendPermit({ ...quest, permits: 1 }, expeditions, key), /already open/, 'A second permit cannot stack on an open encounter')
  assert.throws(() => claimExpedition(expeditions, key, 0, NOW), /not ready/, 'Without its permit the claim still needs 25 km')
  // Same species as the distance route would have offered, and still trial → chamber → battle → catch.
  let encounters = {}
  assert.throws(() => catchEncounter({ expeditions, quest, encounters }, key, 0, NOW), /trial/, 'No free catch')
  encounters = finishTrial({ expeditions, quest, encounters }, key, 0)
  encounters = openChamber({ expeditions, quest, encounters }, key, 0, NOW, () => 0.5)
  assert.equal(encounters[key].name, expeditionEncounter(trail, 0).name)
  const caught = catchEncounter({ expeditions, quest, encounters }, key, 0, NOW)
  expeditions = caught.expeditions
  assert.equal(expeditions.trails[key].claimed, 1)
  assert.deepEqual(caught.encounters, {})
  assert.equal(quest.permits, 0, 'Catching does not spend another permit')
  assert.equal(distanceLeg(quest, key, expeditions.trails[key]), 12000, 'Distance already walked still counts toward the next one')
  assert.ok(!encounterReady(quest, key, expeditions.trails[key]))
  // The 25 km route keeps going from where the distance was.
  expeditions = importExpeditions(expeditions, journalOf([], 25000))
  assert.equal(expeditions.trails[key].claimed, 1, 'An import keeps local claims')
  assert.ok(encounterReady(quest, key, expeditions.trails[key]), 'At 25 km the next encounter opens by distance')
  assert.equal(trailUnlocked(quest, key, expeditions.trails[key]), 2)
})

test('permit claims survive saving, reopening and repeated imports, and nothing else can claim early', () => {
  const trail = trailOf(3000)
  const key = keyOf(trail)
  const quest = spendPermit({ ...emptyQuest(), permits: 2 }, progressWith(trail), key)
  let expeditions = progressWith(trail)
  const encounters = openChamber({ expeditions, quest, encounters: finishTrial({ expeditions, quest, encounters: {} }, key, 0) }, key, 0, NOW, () => 0.5)
  expeditions = catchEncounter({ expeditions, quest, encounters }, key, 0, NOW).expeditions
  const savedQuest = restoreQuest(JSON.parse(JSON.stringify(quest)))
  assert.deepEqual(savedQuest, quest)
  assert.deepEqual(restoreExpeditions(JSON.parse(JSON.stringify(expeditions)), savedQuest.unlocks), expeditions)
  assert.throws(() => restoreExpeditions(JSON.parse(JSON.stringify(expeditions))), /claims/, 'Without the permit record the early claim is refused')
  for (let i = 0; i < 3; i++) expeditions = importExpeditions(expeditions, journalOf([], 3000))
  assert.equal(expeditions.trails[key].claimed, 1)
  assert.equal(savedQuest.permits, 1, 'The unspent permit is still there')
  assert.deepEqual(restoreQuest({ number: -1, since: 'soon', challenge: 'yes', permits: 1.5, unlocks: { bad: 1, [key]: -2 } }), emptyQuest())
  assert.deepEqual(restoreQuest(undefined), emptyQuest())
})

test('arcade achievements add up to points, and every 100 points buys exactly one permit', () => {
  const blank = { arcadeScores: {}, bestMoves: {}, adventure: {}, trailLevels: {}, safari: {} }
  assert.equal(arcadePoints(blank), 0)
  const ids = arcadeAchievements(blank).map(item => item.id)
  assert.equal(new Set(ids).size, ids.length)
  let records = { ...blank, arcadeScores: saveBestScore(saveBestScore({}, 'quiz', 10), 'berries', 12), bestMoves: { 4: 9, 6: 9 } }
  // Quiz 5/8/10 (60), berries 10 (10), memory win/six/perfect (60).
  assert.equal(arcadePoints(records), 130)
  assert.deepEqual(arcadeAchievements(records).filter(achieved).map(item => item.id).sort(),
    ['berries-10', 'memory-perfect', 'memory-six', 'memory-win', 'quiz-10', 'quiz-5', 'quiz-8'])
  assert.equal(arcadePoints({ ...records, arcadeScores: saveBestScore(records.arcadeScores, 'quiz', 3) }), 130, 'A worse replay keeps the best score')
  let quest = emptyQuest()
  quest = earnArcadePermit(quest, arcadePoints(records))
  assert.deepEqual([quest.permits, quest.arcade, arcadePointsLeft(quest, 130)], [1, 1, 30])
  assert.throws(() => earnArcadePermit(quest, arcadePoints(records)), /100 achievement points/, 'The same points cannot buy a second permit')
  assert.equal(quest.number, 0, 'The walking quest is separate')
  records = { ...records, adventure: saveStars({}, 'route-1', 3), safari: addSafariCatch(addSafariCatch({}, 'Pidgey', true, NOW), 'Rattata', false, NOW) }
  assert.equal(arcadePoints(records), 160, 'A Shiny Safari catch is worth 30')
  assert.throws(() => earnArcadePermit(quest, 160))
  quest = earnArcadePermit(quest, 230)
  assert.deepEqual([quest.permits, quest.arcade], [2, 2])
  assert.deepEqual(restoreQuest(JSON.parse(JSON.stringify(quest))), quest)
  assert.equal(ARCADE_PERMIT_POINTS, 100)
  const all = arcadeAchievements(blank).reduce((sum, item) => sum + item.points, 0)
  assert.ok(all >= 5 * ARCADE_PERMIT_POINTS, `Every game together is worth several permits (${all} points)`)
})
