import { claimExpedition, expeditionEncounter, unlockedEncounters } from './expeditions.ts'
import { legendarySpecies } from './generated/expedition.js'
import type { ExpeditionProgress } from './expeditions.ts'
import { encounterReady, trailPermits, trailUnlocked } from './expedition-quest.ts'
import type { Quest } from './expedition-quest.ts'
import { restoreRun } from './games/trials.ts'
import type { TrialRun } from './games/trials.ts'

export const SHINY_ODDS = 100
// After walking out of a Legendary's lair, its entrance stays sealed this long before the next try.
export const RESET_COOLDOWN = 1500

// The Legendary waiting at a trail's next encounter, kept beside the trail rather than in it. Its species is the one
// nextLegendaries picks for the trail, and once saved here it never changes. Whether it is Shiny is this encounter's own roll,
// 1 in 100, made as the player enters its lair after the trial (src/games/lairs.ts). Walking back out through the
// lair's entrance (a Shiny asks twice) seals the entrance for RESET_COOLDOWN; the next entry after that rolls again.
// shiny is null until the first roll; resetPending is set while the player is out and the next entry should roll.
// nextResetAllowedAt is a clock time, so leaving, refreshing or reopening the app cannot skip the wait or reroll, and
// leaving any other way (the Leave button, closing the app) keeps the result. checkpoint is the trial in progress and
// exists only until the trial is finished. engaged is set by the first move or Poke Ball of the battle in the lair
// (src/games/lair-battle.ts), which sets the result for good: no more resets. The battle itself is never saved.
export type ActiveEncounter = { index: number, name: string, trial: boolean, shiny: boolean | null, attempt: number,
  resetPending: boolean, nextResetAllowedAt: number, checkpoint?: TrialRun, engaged?: true }
export type Encounters = Record<string, ActiveEncounter>
type Play = { expeditions: ExpeditionProgress, quest: Quest, encounters: Encounters }

export const rollLegendaryShiny = (random = Math.random) => Math.floor(random() * SHINY_ODDS) === 0

// A reset is due once its time comes, or straight away if the clock was turned back past its start.
export const resetDue = (encounter: ActiveEncounter, now: number) =>
  now >= encounter.nextResetAllowedAt || encounter.nextResetAllowedAt - now > RESET_COOLDOWN
export const readyToBattle = (encounter: ActiveEncounter | undefined): encounter is ActiveEncounter & { shiny: boolean } =>
  !!encounter && encounter.trial && encounter.shiny !== null && !encounter.resetPending
const plain = (key: string) => key.replace(/^Shiny /, '')

// The Legendary waiting at each trail's next encounter. The canonical draw (generated/expedition.js) is where the trail
// starts in the cycle of Legendaries; from there it moves on past any Legendary already caught (Normal or Shiny) or
// already waiting on another trail, so none is met twice and no two trails wait with the same one. A saved encounter
// keeps its Legendary, and those are set aside first. Then trails with an open encounter pick, oldest first, so the
// one the Expeditions screen shows never changes under you, and the trails still walking pick last. Once every
// Legendary is caught, any not waiting elsewhere comes round again.
export function nextLegendaries(play: Play): Record<string, string> {
  const caught = new Set(Object.keys(play.expeditions.dex).map(plain))
  const waiting = new Set<string>()
  const names: Record<string, string> = {}
  const trails = Object.entries(play.expeditions.trails).filter(([, trail]) => trail.claimed < 4000)
  for (const [key, trail] of trails) {
    const saved = play.encounters[key]
    if (saved?.index === trail.claimed) { names[key] = saved.name; waiting.add(saved.name) }
  }
  const open = ([key, trail]: typeof trails[number]) => Number(encounterReady(play.quest, key, trail))
  const rest = trails.filter(([key]) => !Object.hasOwn(names, key))
    .sort((a, b) => open(b) - open(a) || a[1].startedAt - b[1].startedAt || a[1].seed - b[1].seed)
  for (const [key, trail] of rest) {
    const first = legendarySpecies.indexOf(expeditionEncounter(trail, trail.claimed).name)
    const cycle = legendarySpecies.map((_, i) => legendarySpecies[(first + i) % legendarySpecies.length])
    const name = cycle.find(name => !caught.has(name) && !waiting.has(name)) ?? cycle.find(name => !waiting.has(name)) ?? cycle[0]
    names[key] = name
    waiting.add(name)
  }
  return names
}

// The trail's next encounter, as saved or fresh, once it is open. Anything else (an older index, a claimed one) throws.
export function activeEncounter(play: Play, key: string, index: number): ActiveEncounter {
  const trail = play.expeditions.trails[key]
  if (!trail || index !== trail.claimed || !encounterReady(play.quest, key, trail)) throw new Error('This encounter is not ready yet.')
  const saved = play.encounters[key]
  return saved?.index === index ? saved : { index, name: nextLegendaries(play)[key], trial: false, shiny: null, attempt: 0,
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

// Entering the lair rolls the first time, and again on the first entry after walking out once the entrance has
// opened. Coming back otherwise (after Leave, a restart, a lost catch) keeps the result exactly as it was. While the
// entrance is still sealed, entering is refused.
export function enterLair(play: Play, key: string, index: number, now = Date.now(), random = Math.random): Encounters {
  const encounter = activeEncounter(play, key, index)
  if (!encounter.trial) throw new Error('Finish the trial to reach the lair.')
  if (encounter.resetPending && !resetDue(encounter, now)) throw new Error('The entrance is still sealed. Try again in a moment.')
  const next = settle(encounter, now, random)
  return next === encounter ? play.encounters : save(play, key, next)
}

// Walking back out through the lair's entrance: the entrance seals for RESET_COOLDOWN, and the next entry rolls once.
// Leaving a Shiny behind needs its own confirmation. Once the battle has begun, the result is set and walking out rerolls nothing.
export function leaveLair(play: Play, key: string, index: number, discardShiny: boolean, now = Date.now()): Encounters {
  const encounter = activeEncounter(play, key, index)
  if (!encounter.trial || encounter.shiny === null) throw new Error('Enter the lair first.')
  if (encounter.engaged) throw new Error('The battle has begun, so this Legendary stays as it is.')
  if (encounter.resetPending) return play.encounters
  if (encounter.shiny && !discardShiny) throw new Error('Confirm that you want to leave this Shiny behind.')
  return save(play, key, { ...encounter, resetPending: true, nextResetAllowedAt: now + RESET_COOLDOWN })
}

// The shiny reset, from inside the lair: stepping back onto the sealed portal you came through, before the battle begins,
// meets the Legendary anew there and then, in one save (so closing the app midway can never leave it half reset).
// A Shiny needs discardShiny. Resets are paced by RESET_COOLDOWN from the last one; a clock turned back never blocks.
export function resetInLair(play: Play, key: string, index: number, discardShiny: boolean, now = Date.now(), random = Math.random): Encounters {
  const encounter = activeEncounter(play, key, index)
  if (!encounter.trial || encounter.shiny === null) throw new Error('Enter the lair first.')
  if (encounter.engaged) throw new Error('The battle has begun, so this Legendary stays as it is.')
  if (encounter.shiny && !discardShiny) throw new Error('Confirm that you want to leave this Shiny behind.')
  if (!resetDue(encounter, now)) throw new Error('The portal is still settling. Try again in a moment.')
  return save(play, key, { ...encounter, shiny: rollLegendaryShiny(random), attempt: encounter.attempt + 1, resetPending: false,
    nextResetAllowedAt: now + RESET_COOLDOWN })
}

// The first move or Poke Ball begins the battle, which sets the result for good. Doing it again changes nothing.
export function engageLegendary(play: Play, key: string, index: number): Encounters {
  const encounter = activeEncounter(play, key, index)
  if (!readyToBattle(encounter)) throw new Error('Enter the lair first.')
  return encounter.engaged ? play.encounters : save(play, key, { ...encounter, engaged: true })
}

// A successful catch is the only thing that claims an encounter: once, with the rolled result, and only after the
// trial and a settled roll in the lair. The claim advances the trail, so a second call throws instead of adding twice.
export function catchEncounter(play: Play, key: string, index: number, now = Date.now()): Pick<Play, 'expeditions' | 'encounters'> {
  const encounter = activeEncounter(play, key, index)
  if (!readyToBattle(encounter)) throw new Error('Finish the trial and meet the Legendary in its lair before the battle.')
  const expeditions = claimExpedition(play.expeditions, key, index, now, { name: encounter.name, shiny: encounter.shiny,
    permits: trailPermits(play.quest, key) })
  const { [key]: _caught, ...encounters } = play.encounters
  return { expeditions, encounters }
}

// Saves from before encounter rolls: an encounter that was already open was shown with its seeded 1-in-50 result, so a
// Shiny shown there stays Shiny as that encounter's first roll. Everything else rolls 1 in 100 as its lair is entered.
// Claimed rewards are never touched, and a Legendary already caught or kept for another trail is left for a fresh pick.
export function legacyEncounters(expeditions: ExpeditionProgress): Encounters {
  const encounters: Encounters = {}
  const taken = new Set(Object.keys(expeditions.dex).map(plain))
  for (const [key, trail] of Object.entries(expeditions.trails)) {
    if (trail.claimed >= unlockedEncounters(trail)) continue
    const { name, shiny } = expeditionEncounter(trail, trail.claimed)
    if (!shiny || taken.has(name)) continue
    taken.add(name)
    encounters[key] = { index: trail.claimed, name, trial: false, shiny: true, attempt: 1, resetPending: false, nextResetAllowedAt: 0 }
  }
  return encounters
}

// Keeps each saved encounter that still matches its trail's next open encounter, with a Legendary not yet caught and
// not kept for another trail; drops anything else, and that trail picks again (nextLegendaries).
export function restoreEncounters(raw: unknown, expeditions: ExpeditionProgress, quest: Quest): Encounters {
  const encounters: Encounters = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return encounters
  const taken = new Set(Object.keys(expeditions.dex).map(plain))
  for (const [key, value] of Object.entries(raw as Record<string, ActiveEncounter>)) {
    const trail = expeditions.trails[key]
    if (!trail || !value || typeof value !== 'object' || value.index !== trail.claimed || trail.claimed >= trailUnlocked(quest, key, trail) ||
        !legendarySpecies.includes(value.name) || taken.has(value.name) || typeof value.trial !== 'boolean' || typeof value.resetPending !== 'boolean' ||
        !(value.shiny === null || typeof value.shiny === 'boolean') || !Number.isSafeInteger(value.attempt) || value.attempt < 0 || value.attempt > 1000000 ||
        (value.shiny === null) !== (value.attempt === 0) || (value.shiny === null && value.resetPending) ||
        !Number.isFinite(value.nextResetAllowedAt) || value.nextResetAllowedAt < 0 || value.nextResetAllowedAt > 8.64e15) continue
    taken.add(value.name)
    const checkpoint = value.trial ? null : restoreRun(value.checkpoint)
    const restored: ActiveEncounter = { index: value.index, name: value.name, trial: value.trial, shiny: value.shiny, attempt: value.attempt,
      resetPending: value.resetPending, nextResetAllowedAt: value.nextResetAllowedAt, ...(checkpoint && { checkpoint }) }
    // Saves from the Resonance Trial (four seals in the lair) had begun once their first seal was on.
    const engaged = readyToBattle(restored) && (value.engaged === true || (value as { resonance?: { started?: unknown } }).resonance?.started === true)
    encounters[key] = engaged ? { ...restored, engaged: true } : restored
  }
  return encounters
}
