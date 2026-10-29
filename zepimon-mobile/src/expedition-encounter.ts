import { claimExpedition, expeditionEncounter, unlockedEncounters } from './expeditions.ts'
import type { ExpeditionProgress } from './expeditions.ts'
import { encounterReady, trailPermits, trailUnlocked } from './expedition-quest.ts'
import type { Quest } from './expedition-quest.ts'
import { restoreRun } from './games/trials.ts'
import type { TrialRun } from './games/trials.ts'

export const SHINY_ODDS = 100
export const RESET_COOLDOWN = 5000

// The Legendary waiting at a trail's next encounter, kept beside the trail rather than in it. Its species comes from
// the canonical draw (generated/expedition.js) and never changes. Whether it is Shiny is this encounter's own roll,
// 1 in 100: made the first time the chamber opens after the trial, and again only after a confirmed reset and its
// five-second wait. shiny is null until that first roll. nextResetAllowedAt is a clock time, so leaving, refreshing or
// reopening the app cannot skip the wait or reroll. checkpoint is the trial in progress and exists only until the trial is finished.
// resonance is the Legendary Resonance Trial after the chamber (src/games/resonance.ts): started once the player walks
// into its arena, which ends any chance of a reset; the seals switched on so far, kept whatever happens; and stabilized
// once all four are on, which is what unlocks the catch.
export const RESONANCE_SEALS = ['wave', 'runes', 'pulse', 'stones'] as const
export type SealId = typeof RESONANCE_SEALS[number]
export type ResonanceProgress = { started: boolean, seals: SealId[], stabilized: boolean }
export type ActiveEncounter = { index: number, name: string, trial: boolean, shiny: boolean | null, attempt: number,
  resetPending: boolean, nextResetAllowedAt: number, checkpoint?: TrialRun, resonance?: ResonanceProgress }
export type Encounters = Record<string, ActiveEncounter>
type Play = { expeditions: ExpeditionProgress, quest: Quest, encounters: Encounters }

export const rollLegendaryShiny = (random = Math.random) => Math.floor(random() * SHINY_ODDS) === 0

// A reset is due once its time comes, or straight away if the clock was turned back past its start.
export const resetDue = (encounter: ActiveEncounter, now: number) =>
  now >= encounter.nextResetAllowedAt || encounter.nextResetAllowedAt - now > RESET_COOLDOWN
export const readyToBattle = (encounter: ActiveEncounter | undefined): encounter is ActiveEncounter & { shiny: boolean } =>
  !!encounter && encounter.trial && encounter.shiny !== null && !encounter.resetPending
// The catch opens only after the Resonance Trial has stabilized.
export const readyToCapture = (encounter: ActiveEncounter | undefined): encounter is ActiveEncounter & { shiny: boolean } =>
  readyToBattle(encounter) && !!encounter.resonance?.stabilized

// Where the Resonance Trial stands: locked until the chamber is settled, ready to enter, active while seals remain,
// stabilizing once all four are on, and capture-ready after that. (Captured encounters are gone from the saved list.)
export type ResonanceStage = 'locked' | 'ready' | 'active' | 'stabilizing' | 'capture-ready'
export function resonanceStage(encounter: ActiveEncounter | undefined): ResonanceStage {
  if (!readyToBattle(encounter)) return 'locked'
  const progress = encounter.resonance
  if (!progress?.started) return 'ready'
  if (progress.stabilized) return 'capture-ready'
  return progress.seals.length === RESONANCE_SEALS.length ? 'stabilizing' : 'active'
}

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
  if (encounter.trial) return play.encounters
  const { checkpoint: _run, ...rest } = encounter
  return save(play, key, { ...rest, trial: true })
}

// The trial in progress, kept so leaving or reopening the app resumes it. Not allowed once the trial is finished.
export function saveCheckpoint(play: Play, key: string, index: number, run: TrialRun): Encounters {
  const encounter = activeEncounter(play, key, index)
  if (encounter.trial) throw new Error('This trial is already finished.')
  return save(play, key, { ...encounter, checkpoint: run })
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

// A confirmed reset: the shrine waits five seconds, then rolls once. Discarding a Shiny needs its own confirmation. Once
// the Resonance Trial has started, the encounter is set and can no longer be reset.
export function requestReset(play: Play, key: string, index: number, discardShiny: boolean, now = Date.now()): Encounters {
  const encounter = activeEncounter(play, key, index)
  if (!encounter.trial || encounter.shiny === null) throw new Error('Open the chamber before resetting.')
  if (encounter.resonance?.started) throw new Error('The Resonance Trial has begun, so this encounter can no longer be reset.')
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

// Walking into the Resonance Trial's arena: only from a settled chamber, and only once. From here the result is set.
export function startResonance(play: Play, key: string, index: number): Encounters {
  const encounter = activeEncounter(play, key, index)
  if (!readyToBattle(encounter)) throw new Error('Finish the trial and the chamber before the Resonance Trial.')
  if (encounter.resonance?.started) return play.encounters
  return save(play, key, { ...encounter, resonance: { started: true, seals: [], stabilized: false } })
}

// A seal switched on stays on: leaving, losing focus or a failed catch never turns it off. Switching it on again changes nothing.
export function activateSeal(play: Play, key: string, index: number, seal: SealId): Encounters {
  const encounter = activeEncounter(play, key, index)
  if (!RESONANCE_SEALS.includes(seal)) throw new Error('There is no such seal.')
  const progress = encounter.resonance
  if (!readyToBattle(encounter) || !progress?.started) throw new Error('Start the Resonance Trial first.')
  if (progress.seals.includes(seal)) return play.encounters
  return save(play, key, { ...encounter, resonance: { ...progress, seals: [...progress.seals, seal] } })
}

// With every seal on, the Legendary steadies and the catch opens, once.
export function stabilizeResonance(play: Play, key: string, index: number): Encounters {
  const encounter = activeEncounter(play, key, index)
  const progress = encounter.resonance
  if (!readyToBattle(encounter) || !progress?.started || progress.seals.length !== RESONANCE_SEALS.length) throw new Error('Switch on every seal first.')
  if (progress.stabilized) return play.encounters
  return save(play, key, { ...encounter, resonance: { ...progress, stabilized: true } })
}

// A successful catch is the only thing that claims an encounter: once, with the rolled result, and only after the
// trial, a settled chamber roll and a stabilized Resonance Trial. The claim advances the trail, so a second call throws
// instead of adding twice.
export function catchEncounter(play: Play, key: string, index: number, now = Date.now()): Pick<Play, 'expeditions' | 'encounters'> {
  const encounter = activeEncounter(play, key, index)
  if (!readyToBattle(encounter)) throw new Error('Finish the trial and the chamber before the battle.')
  if (!readyToCapture(encounter)) throw new Error('Stabilize the Resonance Trial before the catch.')
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
    const checkpoint = value.trial ? null : restoreRun(value.checkpoint)
    const restored: ActiveEncounter = { index: value.index, name: value.name, trial: value.trial, shiny: value.shiny, attempt: value.attempt,
      resetPending: value.resetPending, nextResetAllowedAt: value.nextResetAllowedAt, ...(checkpoint && { checkpoint }) }
    const resonance = readyToBattle(restored) ? restoreResonance(value.resonance) : null
    encounters[key] = resonance ? { ...restored, resonance } : restored
  }
  return encounters
}

// Saved Resonance Trial progress, kept only if it adds up: started, known seals each once, and stabilized only with all four.
function restoreResonance(raw: unknown): ResonanceProgress | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const { started, seals, stabilized } = raw as Record<string, unknown>
  if (started !== true || typeof stabilized !== 'boolean' || !Array.isArray(seals)) return null
  if (seals.some((seal, i) => !RESONANCE_SEALS.includes(seal) || seals.indexOf(seal) !== i)) return null
  if (stabilized && seals.length !== RESONANCE_SEALS.length) return null
  return { started, seals: seals as SealId[], stabilized }
}
