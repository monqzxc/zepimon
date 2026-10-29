import type { DexRecord, Journal } from './journal.ts'
import type { Progress } from './progress.ts'
import type { ExpeditionProgress } from './expeditions.ts'
import type { Quest } from './expedition-quest.ts'
import type { Encounters } from './expedition-encounter.ts'
import type { ArcadeScores } from './games/scores.ts'
import type { TrialRecords } from './games/trials.ts'
import type { PhoneRun } from './phone-adventure.ts'

export const BACKUP_VERSION = 1
export type PhoneData = {
  journal: Journal | null, buddy: string | null, bestMoves: Record<string, number>, progress: Progress,
  arcadeScores: ArcadeScores, expeditions: ExpeditionProgress, quest: Quest, encounters: Encounters, safari: Record<string, DexRecord>, adventure: Record<string, number>,
  trailLevels: Record<string, number>, trialRecords: TrialRecords, phoneRuns: PhoneRun[]
}

// A backup is an ordinary Zepimon Export JSON, so "Choose JSON file" can bring the watch journal back, with this
// phone's own data (missions, scores, stars, Expedition friends, permits and waiting encounters, Safari catches and
// phone adventures with their routes) under phoneBackup.
// Account links and sign-in sessions are never included.
export function createBackup(data: PhoneData, now = Date.now(), appVersion = ''): string {
  const createdAt = new Date(now).toISOString()
  const journal = data.journal ? { exportVersion: 1, app: 'Zepimon', exportedAt: createdAt, receivedAt: data.journal.receivedAt,
    snapshot: data.journal.snapshot, routes: data.journal.routes } : { app: 'Zepimon' }
  return JSON.stringify({ ...journal, phoneBackup: { backupVersion: BACKUP_VERSION, createdAt, appVersion, buddy: data.buddy,
    bestMoves: data.bestMoves, progress: data.progress, arcadeScores: data.arcadeScores, expeditions: data.expeditions,
    quest: data.quest, encounters: data.encounters,
    safari: data.safari, adventure: data.adventure, trailLevels: data.trailLevels, trialRecords: data.trialRecords, phoneRuns: data.phoneRuns } }, null, 2)
}

export function backupFileName(now = Date.now()): string {
  const date = new Date(now)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `zepimon-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.json`
}

export function backupSummary(data: PhoneData) {
  return {
    watchRecords: data.journal ? Object.keys(data.journal.snapshot.dex).length : 0,
    runs: data.progress.runs.length,
    friends: Object.keys(data.expeditions.dex).length,
    safari: Object.keys(data.safari).length,
    stars: [...Object.values(data.adventure), ...Object.values(data.trailLevels)].reduce((sum, stars) => sum + stars, 0),
    scores: Object.keys(data.arcadeScores).length + Object.keys(data.bestMoves).length
  }
}

export function hasBackupData(summary: ReturnType<typeof backupSummary>): boolean {
  return Object.values(summary).some(count => count > 0)
}
