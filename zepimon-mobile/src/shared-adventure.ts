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

// A watch adventure to announce on this phone (src/AdventureBanner.tsx): one the watch is recording that was not
// announced yet (last is the id announced last), and not one it took over from this phone, which the Adventure tab
// tells about instead.
export function newOnWatch(shared: SharedAdventure | null, handedOver: SharedAdventure | null, last: string | null, now = Date.now()): SharedAdventure | null {
  const live = onWatch(shared, now)
  return live && live.id !== last && live.id !== handedOver?.id ? live : null
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

// The watch's adventure as this phone heard it, for its current pace: [at, meters] of each share, oldest first, over
// the last few minutes. The watch shares about every half minute and the open app checks every 15 seconds, so a
// pace needs a couple of shares; the phone does not keep them.
export type SharedTrail = { id: string, samples: [number, number][] }
const TRAIL_MS = 180000
const PACE_MS = 120000

export function followShared(trail: SharedTrail | null, shared: SharedAdventure | null): SharedTrail | null {
  if (!shared || shared.ended || shared.device !== 'watch') return null
  const samples = trail?.id === shared.id ? trail.samples : []
  const last = samples.at(-1)
  if (last && shared.at <= last[0]) return trail
  const kept = last && shared.meters < last[1] ? [] : samples.filter(([at]) => shared.at - at <= TRAIL_MS)
  return { id: shared.id, samples: [...kept, [shared.at, shared.meters]] }
}

// Seconds per km between the shares heard over the last two minutes, like the phone's own pace over the last minute.
// null until two shares far enough apart arrive, and once the watch has gone quiet.
export function sharedPace(trail: SharedTrail | null, now: number): number | null {
  const samples = trail?.samples ?? []
  const last = samples.at(-1)
  if (!last || now - last[0] > TRAIL_MS) return null
  const first = samples.find(([at]) => last[0] - at <= PACE_MS) ?? last
  const meters = last[1] - first[1], elapsed = last[0] - first[0]
  return meters >= 15 && elapsed >= 20000 ? elapsed / meters : null
}
