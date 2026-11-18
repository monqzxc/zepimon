import type { Cue } from './training-cues.ts'
import { VIBRATE, WARN_METERS, WARN_SECONDS, isEffort, spokenCue } from './training-cues.ts'

// What a Gym session's cue should do now: buzz, speak, or nothing. Pure, so the rules are tested without a phone
// (tests/cue-events.test.js); src/cue-alerts.ts carries them out. The screen (every second) and the GPS task (every fix,
// also with the screen off) both ask, so each change is announced exactly once.
//
// key: the adventure (its start time), so a new one starts fresh. warned: the tap before this step's end has been given.
// km: whole kilometres already spoken as splits, and when the last one was reached (seconds), for its time.
// walking: inside a planned walking break (Gigantamax Ultra's run/walk).
export type AlertState = { key: number, index: number, done: boolean, warned: boolean, km: number, kmAt: number, walking?: boolean }
// native: this build buzzes timed steps itself (Android's notification, see modules/zepimon-live), so a change out of a
// timed step and the tap before it are left to it. splits: speak each kilometre.
export type AlertOptions = { native: boolean, splits: boolean }
export type AlertEvents = { state: AlertState, buzz: number[] | null, speech: string[], changed: boolean }

const warnedNow = (cue: Cue) => !!cue.next && !cue.done &&
  (cue.remainingSeconds !== null ? cue.remainingSeconds <= WARN_SECONDS : (cue.remainingMeters ?? Infinity) <= WARN_METERS)

// "5 minutes 42 seconds", for a kilometre's time.
export function spokenTime(seconds: number): string {
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60), rest = total % 60
  return `${minutes} minute${minutes === 1 ? '' : 's'}${rest ? ` ${rest} second${rest === 1 ? '' : 's'}` : ''}`
}

// walking: whether a planned walking break is on now (src/training-cues.ts walkBreak), or undefined without breaks.
export function cueEvents(state: AlertState | null, key: number, cue: Cue, meters: number, seconds: number, options: AlertOptions,
  timedBefore: (index: number) => boolean, walking?: boolean): AlertEvents {
  const km = Math.floor(meters / 1000)
  // First sight of this session (it just started, or the app came back): say where we are, without a buzz.
  if (!state || state.key !== key) {
    return { state: { key, index: cue.index, done: cue.done, warned: warnedNow(cue), km, kmAt: seconds, walking: !!walking }, buzz: null,
      speech: [spokenCue(cue)], changed: true }
  }
  const speech: string[] = []
  let buzz: number[] | null = null
  const moved = cue.index !== state.index || cue.done !== state.done
  if (moved) {
    // Out of a timed step, the native side has buzzed already, on the second.
    const handled = options.native && timedBefore(state.index) && !cue.done
    buzz = handled ? null : cue.done ? VIBRATE.done : isEffort(cue.step) ? VIBRATE.effort : VIBRATE.easy
    speech.push(spokenCue(cue))
  } else if (!state.warned && warnedNow(cue) && !(options.native && cue.remainingSeconds !== null)) {
    buzz = VIBRATE.warning
  }
  // A walking break starting or ending, while the session runs.
  if (!moved && !cue.done && walking !== undefined && walking !== !!state.walking) {
    // The end of a break is timed, so on Android the notification buzzes it on the second.
    buzz = walking ? VIBRATE.easy : options.native ? null : VIBRATE.effort
    speech.push(walking ? 'Walk for 1 minute.' : 'Run again.')
  }
  let next = { ...state, index: cue.index, done: cue.done, warned: moved ? warnedNow(cue) : state.warned || warnedNow(cue), walking: !!walking }
  if (km > state.km) {
    if (options.splits) speech.push(`Kilometre ${km}, ${spokenTime((seconds - state.kmAt) / (km - state.km))}.`)
    next = { ...next, km, kmAt: seconds }
  }
  return { state: next, buzz, speech, changed: moved }
}
