// The opening animation's timeline (src/LaunchIntro.tsx), as plain data so tests can check it (tests/launch-intro.test.js).
//
// The trainer sets off at a walk, picks up the pace and is running by RUN_AT, with the scenery speeding up to match. Pace
// is in "units" per millisecond: 1 while walking, 3 while running, rising evenly in between. The trail meter under the
// scene fills with the distance covered, so it too creeps along at a walk and races once they run, full at FILL_MS. The
// intro holds for at least MIN_MS, and after that until the app is ready.

export type IntroPhase = 'walk' | 'run' | 'adventure'

export const WALK_PACE = 1
export const RUN_PACE = 3
// Walking until WALK_END, speeding up until RUN_AT, running after.
export const WALK_END = 1200
export const RUN_AT = 2000
// The word under the logo turns from "Run." to "Adventure!" here.
export const ADVENTURE_AT = 2500
export const FILL_MS = 3000
export const MIN_MS = 3200

// Units covered after ms milliseconds.
export function travelAt(ms: number): number {
  const t = Math.max(0, ms)
  if (t <= WALK_END) return t * WALK_PACE
  const ramp = RUN_AT - WALK_END
  if (t <= RUN_AT) {
    const u = (t - WALK_END) / ramp
    return WALK_END * WALK_PACE + ramp * (WALK_PACE * u + (RUN_PACE - WALK_PACE) * u * u / 2)
  }
  return travelAt(RUN_AT) + (t - RUN_AT) * RUN_PACE
}

// Units covered while speeding up, and the easing that animates them: the fraction of the ramp's distance at a
// fraction u of its time.
export const RAMP_TRAVEL = travelAt(RUN_AT) - travelAt(WALK_END)
export const rampEasing = (u: number) => (travelAt(WALK_END + u * (RUN_AT - WALK_END)) - travelAt(WALK_END)) / RAMP_TRAVEL

// How full the trail meter is, 0 to 1, and the easing that animates it over FILL_MS.
export const fillAt = (ms: number) => Math.min(1, travelAt(ms) / travelAt(FILL_MS))
export const fillEasing = (u: number) => fillAt(u * FILL_MS)

export function phaseAt(ms: number): IntroPhase {
  if (ms < WALK_END) return 'walk'
  return ms < ADVENTURE_AT ? 'run' : 'adventure'
}

// How long one stride of the trainer's four-step cycle lasts at ms: an unhurried walk, quickening to a run.
export function strideMs(ms: number): number {
  if (ms < WALK_END) return 300
  if (ms < RUN_AT) return 300 - 180 * (ms - WALK_END) / (RUN_AT - WALK_END)
  return 120
}

// The intro leaves once it has played MIN_MS and the app is ready under it.
export const canLeave = (ms: number, ready: boolean) => ready && ms >= MIN_MS
