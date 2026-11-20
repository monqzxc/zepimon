import type { Adventure } from './adventures.ts'
import { averagePace, bestEffort, clock } from './running.ts'

// The runner profile (docs/superpowers/specs/2026-11-19-runner-profile-design.md): a level the player picks, level-up offers
// from their records, and a check that a saved run is believable. Everything here is pure, so it is tested without the app
// (tests/profile.test.js). A level only ever changes when the player taps.
export type Level = 'beginner' | 'intermediate' | 'advanced'
export const LEVEL_ORDER: Level[] = ['beginner', 'intermediate', 'advanced']
export const levelName: Record<Level, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }
export const levelDetail: Record<Level, string> = { beginner: 'About 33 min or more for 5 km', intermediate: '26 to 33 min for 5 km', advanced: 'Under 26 min for 5 km' }

// The fastest 5 km and 10 km, in seconds, across saved adventures; null where there is none.
export type Best = { five: number | null, ten: number | null }
// declined: the bests when the player last put off a level-up (Not now), or chose a level by hand: a level-up comes back only
// once a best beats these. waiting: the put-off offer is still waiting in Settings (Keep there, or taking it, clears it).
export type Profile = { level: Level | null, declined: Best | null, waiting: boolean }
export const emptyProfile: Profile = { level: null, declined: null, waiting: false }
// "a Beginner", "an Intermediate", "an Advanced".
export const withArticle = (level: Level) => `${level === 'beginner' ? 'a' : 'an'} ${levelName[level]}`

// The only place the numbers live. five and ten: the level is reached by a best under either time, in seconds. pace: the
// fastest believable average pace in seconds per km, for runs with no earlier effort to compare with.
const TABLE: Record<Level, { five: number, ten: number, pace: number }> = {
  beginner: { five: Infinity, ten: Infinity, pace: 4 * 60 + 24 },
  intermediate: { five: 33 * 60, ten: 70 * 60, pace: 3 * 60 + 48 },
  advanced: { five: 26 * 60 + 30, ten: 60 * 60, pace: 3 * 60 + 6 }
}
// A run this much faster than the player's own best is much faster than usual (under 0.9 ×), and nothing under 3 km is checked.
const FASTER = 0.9
const MIN_METERS = 3000

const fastest = (adventures: Adventure[], meters: number): number | null =>
  adventures.reduce<number | null>((best, adventure) => {
    const effort = bestEffort(adventure, meters)
    return effort !== null && (best === null || effort < best) ? effort : best
  }, null)

export const bestTimes = (adventures: Adventure[]): Best => ({ five: fastest(adventures, 5000), ten: fastest(adventures, 10000) })

const rank = (level: Level) => LEVEL_ORDER.indexOf(level)
// The highest level either time reaches.
export function levelFor(best: Best): Level {
  for (const level of [...LEVEL_ORDER].reverse()) {
    const { five, ten } = TABLE[level]
    if ((best.five !== null && best.five < five) || (best.ten !== null && best.ten < ten)) return level
  }
  return 'beginner'
}

// The level above the profile's, when the records reach it. After Not now, only once a best beats the declined one: a time
// under the declined time, or any time where the declined one was none.
const beats = (now: number | null, then: number | null) => now !== null && (then === null || now < then)
const above = (profile: Profile, best: Best): Level | null => {
  if (!profile.level) return null
  const next = LEVEL_ORDER[rank(profile.level) + 1]
  return next && rank(levelFor(best)) >= rank(next) ? next : null
}
export function levelOffer(profile: Profile, best: Best): Level | null {
  const next = above(profile, best)
  const { declined } = profile
  return next && (!declined || beats(best.five, declined.five) || beats(best.ten, declined.ten)) ? next : null
}
// The offer a player put off, still there for Settings whether or not it has been beaten again, until they keep their level
// there or take it.
export const waitingOffer = (profile: Profile, best: Best): Level | null => profile.waiting ? above(profile, best) : null

// The distance a run improved the player's best at, with the new time: its 5 km first, then its 10 km; null when it improved
// neither. `before` is their bests without this run. A first time at a distance counts.
export function newBest(now: Best, before: Best): { label: '5 km' | '10 km', seconds: number } | null {
  if (now.five !== null && beats(now.five, before.five)) return { label: '5 km', seconds: now.five }
  if (now.ten !== null && beats(now.ten, before.ten)) return { label: '10 km', seconds: now.ten }
  return null
}

export type Verdict = { ok: true } | { ok: false, reason: 'history' | 'floor', note: string }
// Whether a saved adventure is believable for this player. others are all their other saved adventures, never the run itself.
// Against their own best at 5 km and 10 km first. A run of 3 km or more that covers neither is held to their own best 5 km pace
// (the same 10%), and only with no 5 km at all to the level's believable pace. Stops never flag a run, and one that cannot be
// timed is trusted.
export function checkRun(adventure: Adventure, others: Adventure[], level: Level | null): Verdict {
  if (!level || adventure.record.meters < MIN_METERS) return { ok: true }
  let decided = false
  for (const [meters, label] of [[5000, '5 km'], [10000, '10 km']] as const) {
    if (adventure.record.meters < meters) continue
    const effort = bestEffort(adventure, meters), prior = fastest(others, meters)
    if (effort === null || prior === null) continue
    decided = true
    if (effort < prior * FASTER) {
      return { ok: false, reason: 'history', note: `Your ${label} took ${clock(effort)}, much faster than your best of ${clock(prior)}.` }
    }
  }
  if (decided) return { ok: true }
  const pace = averagePace(adventure)
  if (pace === null) return { ok: true }
  const reference = fastest(others, 5000)
  if (reference !== null) {
    const own = reference / 5
    return pace < own * FASTER
      ? { ok: false, reason: 'history', note: `An average pace of ${clock(pace)} /km is much faster than your best 5 km pace of ${clock(own)} /km.` }
      : { ok: true }
  }
  if (pace < TABLE[level].pace) {
    return { ok: false, reason: 'floor', note: `An average pace of ${clock(pace)} /km is much faster than usual for ${withArticle(level)}.` }
  }
  return { ok: true }
}

const seconds = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
// Anything unreadable is the empty profile; a damaged declined time is dropped alone.
export function restoreProfile(raw: unknown): Profile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyProfile
  const value = raw as { level?: unknown, declined?: unknown, waiting?: unknown }
  if (!LEVEL_ORDER.includes(value.level as Level)) return emptyProfile
  const declined = value.declined && typeof value.declined === 'object' && !Array.isArray(value.declined)
    ? { five: seconds((value.declined as Best).five), ten: seconds((value.declined as Best).ten) } : null
  return { level: value.level as Level, declined, waiting: declined !== null && value.waiting === true }
}
