import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BACKUP_VERSION, backupFileName, backupSummary, createBackup, hasBackupData } from '../src/backup.ts'
import { parseJournal } from '../src/journal.ts'
import { emptyProgress } from '../src/progress.ts'
import { emptyExpeditions } from '../src/expeditions.ts'
import { emptyQuest } from '../src/expedition-quest.ts'
import { addSafariCatch } from '../src/games/safari.ts'

const journal = parseJournal(readFileSync(new URL('../examples/demo-export.json', import.meta.url), 'utf8'))
const now = Date.UTC(2026, 9, 26, 1, 30)
const phoneRun = { id: 'phone-1', family: ['Pidgey', 'Pidgeotto', 'Pidgeot'], path: '_p~iF~ps|U_ulLnnqC',
  record: { meters: 5200, steps: 0, shiny: false, activity: 'walking', finishedAt: new Date(now).toISOString(), startedAt: now - 3600000, elapsedSeconds: 3600, form: 'Pidgey' } }
const data = (extra = {}) => ({ journal, buddy: 'Shiny Bulbasaur', bestMoves: { 4: 9 }, progress: emptyProgress(), arcadeScores: { quiz: 7, safari: 5 },
  expeditions: emptyExpeditions(), quest: { ...emptyQuest(), permits: 1 }, encounters: {}, safari: addSafariCatch({}, 'Pidgey', false, now), adventure: { 'route-1': 3, 'viridian-forest': 2 },
  trailLevels: { 'level-1': 3, 'level-2': 1 }, phoneRuns: [phoneRun], ...extra })

test('a backup is a normal export that the importer accepts, plus this phone’s own data', () => {
  const text = createBackup({ ...data(), cloudOwner: 'someone@example.com' }, now, '1.6.0')
  const backup = JSON.parse(text)
  const imported = parseJournal(text)
  assert.deepEqual(imported.snapshot, journal.snapshot, 'The watch journal comes back unchanged')
  assert.deepEqual(imported.routes, journal.routes)
  assert.equal(imported.receivedAt, journal.receivedAt)
  assert.equal(backup.exportedAt, new Date(now).toISOString())
  assert.deepEqual(Object.keys(backup.phoneBackup).sort(), ['adventure', 'appVersion', 'arcadeScores', 'backupVersion', 'bestMoves', 'buddy',
    'createdAt', 'encounters', 'expeditions', 'phoneRuns', 'progress', 'quest', 'safari', 'trailLevels'].sort())
  assert.equal(backup.phoneBackup.quest.permits, 1, 'Unused Expedition Permits are kept')
  assert.deepEqual(backup.phoneBackup.phoneRuns, [phoneRun], 'Phone adventures keep their routes')
  assert.equal(backup.phoneBackup.backupVersion, BACKUP_VERSION)
  assert.equal(backup.phoneBackup.appVersion, '1.6.0')
  assert.deepEqual(backup.phoneBackup.safari, data().safari)
  assert.deepEqual(backup.phoneBackup.adventure, { 'route-1': 3, 'viridian-forest': 2 })
  assert.deepEqual(backup.phoneBackup.trailLevels, { 'level-1': 3, 'level-2': 1 })
  assert.ok(!text.includes('someone@example.com'), 'Account links are never exported')
  assert.ok(!Object.keys(backup.snapshot.dex).some(key => backup.snapshot.dex[key].source), 'Safari catches stay out of the watch journal')
})

test('phones without a watch journal still back up their own data', () => {
  const text = createBackup(data({ journal: null }), now)
  const backup = JSON.parse(text)
  assert.equal(backup.app, 'Zepimon')
  assert.equal(backup.snapshot, undefined)
  assert.equal(backup.phoneBackup.safari.Pidgey.source, 'safari')
  assert.throws(() => parseJournal(text), /Zepimon Export JSON/, 'The journal importer politely refuses a phone-only backup')
})

test('backup summary counts what will be saved, and empty phones have nothing to back up', () => {
  assert.deepEqual(backupSummary(data()), { watchRecords: Object.keys(journal.snapshot.dex).length, runs: 0, friends: 0, safari: 1, stars: 9, scores: 3 }, 'Adventure and Trail Defense level stars')
  const blank = backupSummary(data({ journal: null, bestMoves: {}, arcadeScores: {}, safari: {}, adventure: {}, trailLevels: {} }))
  assert.equal(hasBackupData(blank), false)
  assert.equal(hasBackupData(backupSummary(data())), true)
  assert.match(backupFileName(new Date(2026, 9, 26, 9, 5).getTime()), /^zepimon-backup-2026-10-26-0905\.json$/)
})
