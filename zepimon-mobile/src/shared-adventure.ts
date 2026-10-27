import { sharedName, validateAdventure } from './generated/companion.js'
import type { ActiveAdventure, Activity } from './phone-adventure.ts'

// The one adventure this phone and the watch share through the cloud, whichever started it: who records it now
// (device, since deviceAt: its start or the moment it took over) and its distance as of at. The other device shows it
// and can take it over with Continue here; the one taken over stops without saving, so it is saved once. Checked by
// validateAdventure from the watch contract (src/generated/companion.js), like the cloud and the watch do.
export type SharedAdventure = {
  id: string, family: string[], mega: string | null, shiny: boolean, activity: Activity, startedAt: number,
  device: 'phone' | 'watch', deviceAt: number, meters: number, hatchSeconds: number | null, at: number, ended: boolean
}

// One not updated for this long is treated as forgotten, as on the watch.
export const SHARED_FRESH_MS = 12 * 3600000

export function restoreShared(raw: unknown): SharedAdventure | null {
  try { return validateAdventure(raw) as SharedAdventure | null } catch { return null }
}

// The adventure the watch is recording, while it still goes: the phone offers Continue here instead of a second one.
export function onWatch(shared: SharedAdventure | null, now = Date.now()): SharedAdventure | null {
  return shared && !shared.ended && shared.device === 'watch' && now - shared.at < SHARED_FRESH_MS && shared.at <= now + 300000 ? shared : null
}

// This phone's adventure as the watch and Zepp see it.
export function sharedFrom(active: ActiveAdventure, now: number, ended = false): SharedAdventure {
  return { id: active.shareId, family: [...active.family], mega: active.mega, shiny: active.shiny, activity: active.activity,
    startedAt: active.startedAt, device: 'phone', deviceAt: active.deviceAt, meters: Math.floor(active.meters),
    hatchSeconds: active.hatchSeconds, at: now, ended }
}

// Takes over the watch's adventure: the same egg, Shiny roll, start and distance so far. The route starts here.
export function fromShared(shared: SharedAdventure, now: number): ActiveAdventure {
  return { family: [...shared.family], activity: shared.activity, startedAt: shared.startedAt, shiny: shared.shiny, mega: shared.mega,
    meters: shared.meters, hatchSeconds: shared.hatchSeconds, points: [], anchor: null, last: null, recent: [],
    shareId: shared.id, deviceAt: Math.max(now, shared.deviceAt + 1) }
}

// The watch took this phone's adventure over after the phone started it or last took it.
export function takenOver(active: ActiveAdventure | null, shared: SharedAdventure | null): boolean {
  return !!active && !!shared && shared.id === active.shareId && shared.device !== 'phone' && shared.deviceAt > active.deviceAt
}

// The Pokemon so far, as the watch names it: the egg, a form every 5 km, then the chosen Mega at 21 km.
export const sharedPokemon = (shared: SharedAdventure): string => sharedName(shared)
