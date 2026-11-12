import { legendarySpecies } from './generated/expedition.js'
import type { ExpeditionProgress } from './expeditions.ts'
import type { Quest } from './expedition-quest.ts'
import { eggOpen } from './phone-adventure.ts'
import { withoutEgg } from './plan.ts'
import type { Plan } from './plan.ts'

// Releasing caught Legendaries back to the wild, one Expedition Permit each. A released Legendary leaves the Expedition
// Dex with everything that came with it: its shrine to revisit, its rematch wins and, when none of its family is left,
// its Legendary egg (an egg chosen for the watch and no longer open is dropped). It can be met again on a later
// expedition (src/expedition-encounter.ts nextLegendaries skips only those still caught). Trails, their claims and any
// waiting encounter stay as they are, so a release never reopens or reorders an encounter. It cannot be undone.
export const MAX_PERMITS = 4000

type Saved = { expeditions: ExpeditionProgress, quest: Quest, rematchWins: Record<string, number>, plan: Plan | null }

// keys are Dex keys, 'Name' or 'Shiny Name'. Anything not caught, or listed twice, refuses the whole release.
export function releaseLegendaries<T extends Saved>(saved: T, keys: readonly string[], now = Date.now()): T {
  if (!keys.length) throw new Error('Choose at least one Legendary to release.')
  const chosen = new Set(keys)
  if (chosen.size !== keys.length) throw new Error('A Legendary can only be released once.')
  for (const key of chosen) {
    if (!legendarySpecies.includes(key.replace(/^Shiny /, '')) || !Object.hasOwn(saved.expeditions.dex, key)) throw new Error(`${key} is not one of your caught Legendaries.`)
  }
  if (saved.quest.permits + chosen.size > MAX_PERMITS) throw new Error('You are holding too many permits. Use some first.')
  const without = <V>(record: Record<string, V>) => Object.fromEntries(Object.entries(record).filter(([key]) => !chosen.has(key)))
  const dex = without(saved.expeditions.dex)
  const egg = saved.plan?.egg
  return { ...saved, expeditions: { ...saved.expeditions, dex }, quest: { ...saved.quest, permits: saved.quest.permits + chosen.size },
    rematchWins: without(saved.rematchWins), plan: egg && !eggOpen(egg.family, dex) ? withoutEgg(saved.plan, now) : saved.plan }
}
