import { expeditionEncounter, expeditionGoal } from './expeditions.ts'
import type { ExpeditionProgress } from './expeditions.ts'
import { QUEST_SESSIONS, distanceLeg, encounterReady, questSessions, trailUnlocked } from './expedition-quest.ts'
import type { Quest } from './expedition-quest.ts'
import type { Progress } from './progress.ts'
import { trialFor } from './games/trials.ts'

// The Legendary Gate (src/LegendaryGate.tsx), the way into Legendary Expeditions on Home, Adventure and the Expeditions
// header. This works out what it shows from the saved progress, and only reads it:
// - waiting: an encounter is open. The next one's Legendary is named and shown in full; its Shiny is the chamber's to reveal.
// - permit: nothing is open, but a permit is in hand, or the Expedition Quest is done and one is ready to claim.
// - walking: the distance left to the next encounter on the newest trail.
// - none: no trail yet; saving an adventure starts one.
// Away from waiting, the gate shows the last Legendary caught as a dark silhouette, or none if nothing is caught yet.
export type GateState = 'waiting' | 'permit' | 'walking' | 'none'
export type GateStatus = { state: GateState, name: string | null, shiny: boolean, line: string, waiting: number, remaining: number }

// Encounters every trail has opened (by distance or permit) and not yet claimed.
export function waitingEncounters(expeditions: ExpeditionProgress, quest: Quest): number {
  return Object.entries(expeditions.trails).reduce((sum, [key, trail]) => sum + trailUnlocked(quest, key, trail) - trail.claimed, 0)
}

// The newest Legendary in the Expedition Dex, keyed 'Name' or 'Shiny Name'.
function lastCaught(expeditions: ExpeditionProgress): { name: string, shiny: boolean } | null {
  const latest = Object.entries(expeditions.dex).sort((a, b) => Date.parse(b[1].finishedAt) - Date.parse(a[1].finishedAt))[0]
  return latest ? { name: latest[0].replace(/^Shiny /, ''), shiny: latest[1].shiny } : null
}

// Kilometres to one decimal, rounded up so a few metres left never reads as 0 km.
const kmLeft = (meters: number) => `${Math.max(0.1, Math.ceil(meters / 100) / 10)} km`

export function gateStatus(expeditions: ExpeditionProgress, quest: Quest, progress: Progress, now = Date.now()): GateStatus {
  const trails = Object.entries(expeditions.trails).sort((a, b) => b[1].startedAt - a[1].startedAt)
  const waiting = waitingEncounters(expeditions, quest)
  const open = trails.find(([key, trail]) => encounterReady(quest, key, trail))
  if (open) {
    const { name } = expeditionEncounter(open[1], open[1].claimed)
    const more = waiting > 1 ? ` · ${waiting} encounters waiting` : ''
    return { state: 'waiting', name, shiny: false, line: `${name} is waiting at ${trialFor(name, {}).title}${more}`, waiting, remaining: 0 }
  }
  const caught = lastCaught(expeditions)
  const shown = { name: caught?.name ?? null, shiny: caught?.shiny ?? false }
  // A permit only opens a trail that still has encounters to give (each holds up to 4000).
  const spendable = trails.some(([key, trail]) => trailUnlocked(quest, key, trail) < 4000)
  if (!trails.length || !spendable) return { state: 'none', ...shown, line: 'Save an adventure to find the gate’s first clue', waiting: 0, remaining: 0 }
  const claimable = quest.challenge && questSessions(quest, progress, expeditions, now).length >= QUEST_SESSIONS
  if (quest.permits > 0 || claimable) return { state: 'permit', ...shown, line: 'Permit ready — open the gate', waiting: 0, remaining: 0 }
  const [key, newest] = trails[0]
  const remaining = Math.max(0, expeditionGoal - distanceLeg(quest, key, newest))
  return { state: 'walking', ...shown, line: `${kmLeft(remaining)} to your next encounter`, waiting: 0, remaining }
}
