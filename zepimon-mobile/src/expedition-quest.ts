import { completedRuns } from './progress.ts'
import type { Progress, SavedRun } from './progress.ts'
import { expeditionGoal, unlockedEncounters } from './expeditions.ts'
import type { ExpeditionProgress, Trail } from './expeditions.ts'
import { ARCADE_PERMIT_POINTS } from './games/achievements.ts'

// The Expedition Quest: the other way to open the next Legendary encounter, for anyone short of 25 km. Three saved
// walks or runs of at least 1 km, plus the shrine challenge (src/games/lanterns.ts), earn one Expedition Permit. A
// permit opens the next encounter on a trail early, and that encounter is met exactly like a 25 km one: the same
// species, trial, chamber, battle and catch. The quest lives beside the trails, never inside them, so the watch/phone
// trail contract and its merge rules stay as they are.
export const QUEST_SESSIONS = 3
export const QUEST_SESSION_METERS = 1000

// number: permits earned so far. since: sessions finished at or after it count toward this quest; null means since the
// first trail began, so the first quest counts the same saved adventures as the distance route. challenge: this quest's
// shrine challenge is done. arcade: permits traded for arcade achievement points (src/games/achievements.ts).
// permits: earned either way and not yet used. unlocks: per trail key, encounters opened with a permit.
export type Quest = { number: number, since: number | null, challenge: boolean, arcade: number, permits: number, unlocks: Record<string, number> }
export const emptyQuest = (): Quest => ({ number: 0, since: null, challenge: false, arcade: 0, permits: 0, unlocks: {} })

// The saved sessions counting toward this quest, oldest first. Only completed, saved adventures are in progress.runs,
// keyed by a stable id, and completedRuns counts one adventure saved by both devices once, so importing the same
// watch journal or phone adventure again never adds a session.
export function questSessions(quest: Quest, progress: Progress, expeditions: ExpeditionProgress, now = Date.now()): SavedRun[] {
  const since = quest.since ?? Math.min(...Object.values(expeditions.trails).map(trail => trail.startedAt))
  return completedRuns(progress, now)
    .filter(run => run.record.meters >= QUEST_SESSION_METERS && Date.parse(run.record.finishedAt) >= since)
    .sort((a, b) => Date.parse(a.record.finishedAt) - Date.parse(b.record.finishedAt))
}

export const completeChallenge = (quest: Quest): Quest => quest.challenge ? quest : { ...quest, challenge: true }

// Awards one permit and starts the next quest after the last session it used, so no session counts twice. Sessions
// beyond the three carry over, like extra distance does.
export function earnPermit(quest: Quest, sessions: SavedRun[]): Quest {
  if (!quest.challenge || sessions.length < QUEST_SESSIONS) throw new Error('Finish all three sessions and the shrine challenge first.')
  const last = Date.parse(sessions[QUEST_SESSIONS - 1].record.finishedAt)
  return { ...quest, number: quest.number + 1, since: last + 1, challenge: false, permits: quest.permits + 1 }
}

// Arcade points never run out once earned, so the permits they can buy are counted against those already taken.
export const arcadePointsLeft = (quest: Quest, points: number) => Math.max(0, points - quest.arcade * ARCADE_PERMIT_POINTS)

export function earnArcadePermit(quest: Quest, points: number): Quest {
  if (arcadePointsLeft(quest, points) < ARCADE_PERMIT_POINTS) throw new Error(`Collect ${ARCADE_PERMIT_POINTS} achievement points for a permit.`)
  return { ...quest, arcade: quest.arcade + 1, permits: quest.permits + 1 }
}

export const trailPermits = (quest: Quest, key: string) => quest.unlocks[key] || 0
export const trailUnlocked = (quest: Quest, key: string, trail: Trail) => unlockedEncounters(trail, trailPermits(quest, key))
export const encounterReady = (quest: Quest, key: string, trail: Trail) => trail.claimed < trailUnlocked(quest, key, trail)

// Opens the trail's next encounter with a permit. Only when nothing is already waiting there: a permit never stacks
// on an encounter that distance (or another permit) has opened.
export function spendPermit(quest: Quest, expeditions: ExpeditionProgress, key: string): Quest {
  const trail = expeditions.trails[key]
  if (quest.permits < 1) throw new Error('You have no Expedition Permit to use.')
  if (!trail || encounterReady(quest, key, trail) || trailUnlocked(quest, key, trail) >= 4000) throw new Error('This encounter is already open.')
  return { ...quest, permits: quest.permits - 1, unlocks: { ...quest.unlocks, [key]: trailPermits(quest, key) + 1 } }
}

// Distance toward the trail's next encounter, 0 to 25 km. Encounters opened by permits do not use up distance.
export function distanceLeg(quest: Quest, key: string, trail: Trail): number {
  return Math.min(expeditionGoal, trail.meters - Math.max(0, trail.claimed - trailPermits(quest, key)) * expeditionGoal)
}

const count = (value: unknown, max: number) => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max ? value as number : 0

export function restoreQuest(raw: unknown): Quest {
  const quest = emptyQuest()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return quest
  const value = raw as Record<string, unknown>
  quest.number = count(value.number, 1000000)
  quest.since = typeof value.since === 'number' && Number.isFinite(value.since) && value.since >= 0 && value.since <= 8.64e15 ? value.since : null
  quest.challenge = value.challenge === true
  quest.arcade = count(value.arcade, 1000)
  quest.permits = count(value.permits, 4000)
  if (value.unlocks && typeof value.unlocks === 'object' && !Array.isArray(value.unlocks)) {
    for (const [key, permits] of Object.entries(value.unlocks)) {
      if (/^\d{1,16}:\d{1,10}$/.test(key) && count(permits, 4000) > 0) quest.unlocks[key] = permits as number
    }
  }
  return quest
}
