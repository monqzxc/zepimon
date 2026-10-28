import { claimExpedition, expeditionEncounter, unlockedEncounters } from './expeditions.ts'
import type { ExpeditionProgress } from './expeditions.ts'
import { encounterReady, trailPermits, trailUnlocked } from './expedition-quest.ts'
import type { Quest } from './expedition-quest.ts'

export const SHINY_ODDS = 100
export const RESET_COOLDOWN = 5000

// The Legendary waiting at a trail's next encounter, kept beside the trail rather than in it. Its species comes from
// the canonical draw (generated/expedition.js) and never changes. Whether it is Shiny is this encounter's own roll,
// 1 in 100: made the first time the chamber opens after the trial, and again only after a confirmed reset and its
// five-second wait. shiny is null until that first roll. nextResetAllowedAt is a clock time, so leaving, refreshing or
// reopening the app cannot skip the wait or reroll.
export type ActiveEncounter = { index: number, name: string, trial: boolean, shiny: boolean | null, attempt: number,
  resetPending: boolean, nextResetAllowedAt: number }
export type Encounters = Record<string, ActiveEncounter>
type Play = { expeditions: ExpeditionProgress, quest: Quest, encounters: Encounters }

export const rollLegendaryShiny = (random = Math.random) => Math.floor(random() * SHINY_ODDS) === 0

// A reset is due once its time comes, or straight away if the clock was turned back past its start.
export const resetDue = (encounter: ActiveEncounter, now: number) =>
  now >= encounter.nextResetAllowedAt || encounter.nextResetAllowedAt - now > RESET_COOLDOWN
export const readyToBattle = (encounter: ActiveEncounter | undefined): encounter is ActiveEncounter & { shiny: boolean } =>
  !!encounter && encounter.trial && encounter.shiny !== null && !encounter.resetPending

// The trail's next encounter, as saved or fresh, once it is open. Anything else (an older index, a claimed one) throws.
export function activeEncounter(play: Play, key: string, index: number): ActiveEncounter {
  const trail = play.expeditions.trails[key]
  if (!trail || index !== trail.claimed || !encounterReady(play.quest, key, trail)) throw new Error('This encounter is not ready yet.')
  const saved = play.encounters[key]
  return saved?.index === index ? saved : { index, name: expeditionEncounter(trail, index).name, trial: false, shiny: null, attempt: 0,
    resetPending: false, nextResetAllowedAt: 0 }
}

const save = (play: Play, key: string, encounter: ActiveEncounter): Encounters => ({ ...play.encounters, [key]: encounter })

// The trial stays finished whatever happens next: leaving, resetting or losing the catch never asks for it again.
export function finishTrial(play: Play, key: string, index: number): Encounters {
  const encounter = activeEncounter(play, key, index)
  return encounter.trial ? play.encounters : save(play, key, { ...encounter, trial: true })
}

function settle(encounter: ActiveEncounter, now: number, random: () => number): ActiveEncounter {
  if (encounter.shiny === null) return { ...encounter, shiny: rollLegendaryShiny(random), attempt: 1 }
  if (encounter.resetPending && resetDue(encounter, now)) {
    return { ...encounter, shiny: rollLegendaryShiny(random), attempt: encounter.attempt + 1, resetPending: false, nextResetAllowedAt: now }
  }
  return encounter
}

// Entering the chamber rolls only the first time, or finishes a reset whose wait is over. Coming back otherwise keeps
// the result exactly as it was.
export function openChamber(play: Play, key: string, index: number, now = Date.now(), random = Math.random): Encounters {
  const encounter = activeEncounter(play, key, index)
  if (!encounter.trial) throw new Error('Finish the trial to open the chamber.')
  const next = settle(encounter, now, random)
  return next === encounter ? play.encounters : save(play, key, next)
}

// A confirmed reset: the shrine waits five seconds, then rolls once. Discarding a Shiny needs its own confirmation.
export function requestReset(play: Play, key: string, index: number, discardShiny: boolean, now = Date.now()): Encounters {
  const encounter = activeEncounter(play, key, index)
  if (!encounter.trial || encounter.shiny === null) throw new Error('Open the chamber before resetting.')
  if (encounter.resetPending) return play.encounters
  if (encounter.shiny && !discardShiny) throw new Error('Confirm that you want to give up this Shiny.')
  return save(play, key, { ...encounter, resetPending: true, nextResetAllowedAt: now + RESET_COOLDOWN })
}

export function finishReset(play: Play, key: string, index: number, now = Date.now(), random = Math.random): Encounters {
  const encounter = activeEncounter(play, key, index)
  if (!encounter.resetPending) return play.encounters
  const next = settle(encounter, now, random)
  return next === encounter ? play.encounters : save(play, key, next)
}

// A successful catch is the only thing that claims an encounter: once, with the rolled result, and only after the
// trial and a settled chamber roll. The claim advances the trail, so a second call throws instead of adding twice.
export function catchEncounter(play: Play, key: string, index: number, now = Date.now()): Pick<Play, 'expeditions' | 'encounters'> {
  const encounter = activeEncounter(play, key, index)
  if (!readyToBattle(encounter)) throw new Error('Finish the trial and the chamber before the battle.')
  const expeditions = claimExpedition(play.expeditions, key, index, now, { shiny: encounter.shiny, permits: trailPermits(play.quest, key) })
  const { [key]: _caught, ...encounters } = play.encounters
  return { expeditions, encounters }
}

// Saves from before encounter rolls: an encounter that was already open was shown with its seeded 1-in-50 result, so a
// Shiny shown there stays Shiny as that encounter's first roll. Everything else rolls 1 in 100 when its chamber opens.
// Claimed rewards are never touched.
export function legacyEncounters(expeditions: ExpeditionProgress): Encounters {
  const encounters: Encounters = {}
  for (const [key, trail] of Object.entries(expeditions.trails)) {
    if (trail.claimed >= unlockedEncounters(trail)) continue
    const { name, shiny } = expeditionEncounter(trail, trail.claimed)
    if (shiny) encounters[key] = { index: trail.claimed, name, trial: false, shiny: true, attempt: 1, resetPending: false, nextResetAllowedAt: 0 }
  }
  return encounters
}

// Keeps each saved encounter that still matches its trail's next open encounter and species; drops anything else.
export function restoreEncounters(raw: unknown, expeditions: ExpeditionProgress, quest: Quest): Encounters {
  const encounters: Encounters = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return encounters
  for (const [key, value] of Object.entries(raw as Record<string, ActiveEncounter>)) {
    const trail = expeditions.trails[key]
    if (!trail || !value || typeof value !== 'object' || value.index !== trail.claimed || trail.claimed >= trailUnlocked(quest, key, trail) ||
        value.name !== expeditionEncounter(trail, trail.claimed).name || typeof value.trial !== 'boolean' || typeof value.resetPending !== 'boolean' ||
        !(value.shiny === null || typeof value.shiny === 'boolean') || !Number.isSafeInteger(value.attempt) || value.attempt < 0 || value.attempt > 1000000 ||
        (value.shiny === null) !== (value.attempt === 0) || (value.shiny === null && value.resetPending) ||
        !Number.isFinite(value.nextResetAllowedAt) || value.nextResetAllowedAt < 0 || value.nextResetAllowedAt > 8.64e15) continue
    encounters[key] = { index: value.index, name: value.name, trial: value.trial, shiny: value.shiny, attempt: value.attempt,
      resetPending: value.resetPending, nextResetAllowedAt: value.nextResetAllowedAt }
  }
  return encounters
}
