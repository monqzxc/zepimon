import type { PaceLog } from './phone-adventure.ts'
import type { Session, Step, StepKind } from './training-plans.ts'

// Where you are in a Gym session while recording, worked out afresh each time from the adventure itself: the clock
// since it started, the distance so far and its pace log (when each 100 m was reached). Nothing is kept between calls,
// so closing the app, a restart or the screen going off never loses your place. Timed steps follow the clock (stops
// included, as the session's time is); measured steps follow the distance.
export type Recorded = { startedAt: number, meters: number, pace: PaceLog }
export type Cue = { index: number, step: Step, next: Step | null, remainingSeconds: number | null, remainingMeters: number | null,
  done: boolean, total: number }

// The distance reached at `seconds` into the adventure, from the pace log; the latest distance beyond it.
function metersAt(recorded: Recorded, seconds: number): number {
  const { start, at } = recorded.pace
  if (!at.length || seconds >= at[at.length - 1]) return recorded.meters
  if (seconds <= at[0]) return start * 100
  let i = 0
  while (at[i + 1] < seconds) i++
  const share = at[i + 1] > at[i] ? (seconds - at[i]) / (at[i + 1] - at[i]) : 0
  return (start + i + share) * 100
}
// The time a distance was reached, from the pace log; `now` for a distance beyond it.
function secondsAt(recorded: Recorded, meters: number, now: number): number {
  const { start, at } = recorded.pace
  const mark = meters / 100 - start
  if (mark < 0 || !at.length) return 0
  if (mark >= at.length - 1) return mark === at.length - 1 ? at[at.length - 1] : now
  const i = Math.floor(mark)
  return at[i] + (mark - i) * (at[i + 1] - at[i])
}

export function cueAt(session: Session, recorded: Recorded, now: number): Cue {
  const elapsed = Math.max(0, (now - recorded.startedAt) / 1000)
  const total = session.steps.length
  let seconds = 0
  let meters = 0
  for (let index = 0; index < total; index++) {
    const step = session.steps[index]
    const next = session.steps[index + 1] ?? null
    if (step.seconds) {
      const end = seconds + step.seconds
      if (elapsed < end) return { index, step, next, remainingSeconds: end - elapsed, remainingMeters: null, done: false, total }
      seconds = end
      meters = metersAt(recorded, end)
    } else {
      const end = meters + (step.meters ?? 0)
      if (recorded.meters < end) return { index, step, next, remainingSeconds: null, remainingMeters: end - recorded.meters, done: false, total }
      meters = end
      seconds = secondsAt(recorded, end, elapsed)
    }
  }
  const last = session.steps[total - 1]
  return { index: total - 1, step: last, next: null, remainingSeconds: 0, remainingMeters: 0, done: true, total }
}

const labels: Record<StepKind, string> = { warmup: 'Warm-up walk', walk: 'Walk', brisk: 'Brisk walk', jog: 'Jog', run: 'Run', cooldown: 'Cool-down walk' }
export const stepLabel = (step: Step) => labels[step.kind]
// Whether a step is an effort (two pulses) or an easy stretch (one).
export const isEffort = (step: Step) => step.kind === 'jog' || step.kind === 'run' || step.kind === 'brisk'

export function remainingText(cue: Cue): string {
  if (cue.remainingMeters !== null) return cue.remainingMeters >= 1000 ? `${(cue.remainingMeters / 1000).toFixed(2)} km` : `${Math.ceil(cue.remainingMeters)} m`
  const seconds = Math.ceil(cue.remainingSeconds ?? 0)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
function amount(step: Step): string {
  if (step.meters) return step.meters >= 1000 ? `${step.meters / 1000} kilometres` : `${step.meters} metres`
  const seconds = step.seconds ?? 0
  if (seconds < 120 && seconds % 60) return `${seconds} seconds`
  return `${Math.round(seconds / 60)} minute${seconds === 60 ? '' : 's'}`
}
// What a screen reader says when a step starts: "Jog for 90 seconds".
export function spokenCue(cue: Cue): string {
  if (cue.done) return 'Session complete. Great work!'
  return `${stepLabel(cue.step)} for ${amount(cue.step)}.${cue.next ? ` Then ${stepLabel(cue.next).toLowerCase()}.` : ''}`
}

// Vibration patterns (wait, buzz, wait, buzz… in ms) for React Native's Vibration: two pulses into an effort, one long
// pulse into an easy stretch, a short tap 10 s or 50 m before a change, and a little fanfare at the end.
export const VIBRATE = { effort: [0, 400, 200, 400], easy: [0, 700], warning: [0, 120], done: [0, 200, 100, 200, 100, 600] }
export const WARN_SECONDS = 10
export const WARN_METERS = 50
// The pattern for a change from one cue to the next, or null when nothing changed worth a buzz.
export function buzzFor(before: Cue | null, after: Cue): number[] | null {
  if (!before) return null
  if (after.done && !before.done) return VIBRATE.done
  if (after.index !== before.index) return isEffort(after.step) ? VIBRATE.effort : VIBRATE.easy
  if (after.next && !after.done) {
    const warned = (cue: Cue) => cue.remainingSeconds !== null ? cue.remainingSeconds <= WARN_SECONDS : (cue.remainingMeters ?? Infinity) <= WARN_METERS
    if (warned(after) && !warned(before)) return VIBRATE.warning
  }
  return null
}
