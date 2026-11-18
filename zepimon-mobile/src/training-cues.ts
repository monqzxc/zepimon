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

// Where each step started and ended in a saved adventure, in seconds from its start and metres, for the steps it
// finished. Stars are scored from these (src/training.ts scoreStars).
export type Span = { index: number, step: Step, from: { seconds: number, meters: number }, to: { seconds: number, meters: number } }
export function stepSpans(session: Session, recorded: Recorded, elapsed: number): Span[] {
  const spans: Span[] = []
  let seconds = 0
  let meters = recorded.pace.start * 100
  for (let index = 0; index < session.steps.length; index++) {
    const step = session.steps[index]
    const from = { seconds, meters }
    if (step.seconds) {
      const end = seconds + step.seconds
      if (elapsed < end) break
      seconds = end
      meters = metersAt(recorded, end)
    } else {
      const end = meters + (step.meters ?? 0)
      if (recorded.meters < end) break
      meters = end
      seconds = secondsAt(recorded, end, elapsed)
    }
    spans.push({ index, step, from, to: { seconds, meters } })
  }
  return spans
}

// Step marks: where each step began, as [step index, seconds from the start, metres], recorded on the phone from GPS fix
// to fix (src/tracker.ts), so a boundary is found between two fixes 2-3 s apart rather than between the pace log's 100 m
// marks. A mark at the step count means the session is done. They drive the cues while recording and score the stars.
export type Mark = [number, number, number]
type Point = { seconds: number, meters: number }

// The marks after the adventure moved from `before` to `after`: every step boundary crossed in between, placed by
// straight-line interpolation between the two fixes. A timed step ends at its exact second, a measured one at its
// exact metre.
export function advanceMarks(session: Session, marks: Mark[], before: Point, after: Point): Mark[] {
  const next = marks.length ? [...marks] : [[0, 0, before.meters] as Mark]
  const total = session.steps.length
  const span = { seconds: after.seconds - before.seconds, meters: after.meters - before.meters }
  for (;;) {
    const [index, seconds, meters] = next[next.length - 1]
    if (index >= total) return next
    const step = session.steps[index]
    if (step.seconds) {
      const end = seconds + step.seconds
      if (after.seconds < end) return next
      const share = span.seconds > 0 ? Math.min(1, Math.max(0, (end - before.seconds) / span.seconds)) : 1
      next.push([index + 1, end, Math.max(meters, before.meters + share * span.meters)])
    } else {
      const end = meters + (step.meters ?? 0)
      if (after.meters < end) return next
      const share = span.meters > 0 ? Math.min(1, Math.max(0, (end - before.meters) / span.meters)) : 1
      next.push([index + 1, Math.max(seconds, before.seconds + share * span.seconds), end])
    }
  }
}

// Spans from marks: step k from its mark to the next one.
export function markSpans(session: Session, marks: Mark[]): Span[] {
  const spans: Span[] = []
  for (let i = 0; i + 1 < marks.length; i++) {
    const [index, seconds, meters] = marks[i]
    const [, toSeconds, toMeters] = marks[i + 1]
    const step = session.steps[index]
    if (step) spans.push({ index, step, from: { seconds, meters }, to: { seconds: toSeconds, meters: toMeters } })
  }
  return spans
}

// marks: the step marks recorded so far, when there are any; the cue then starts from the last one.
export function cueAt(session: Session, recorded: Recorded, now: number, marks: Mark[] = []): Cue {
  const elapsed = Math.max(0, (now - recorded.startedAt) / 1000)
  const total = session.steps.length
  const last = marks[marks.length - 1]
  let seconds = last ? last[1] : 0
  let meters = last ? last[2] : 0
  for (let index = last ? last[0] : 0; index < total; index++) {
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
  return { index: total - 1, step: session.steps[total - 1], next: null, remainingSeconds: 0, remainingMeters: 0, done: true, total }
}

const labels: Record<StepKind, string> = { warmup: 'Warm-up walk', walk: 'Walk', brisk: 'Brisk walk', jog: 'Jog', run: 'Run', cooldown: 'Cool-down walk',
  easy: 'Easy run', tempo: 'Tempo', interval: 'Fast', half: 'Half pace', stride: 'Stride', recover: 'Recovery jog', race: 'Race' }
// A warm-up or cool-down measured in metres is a jog; a timed one, in the beginner plans, a walk.
export const stepLabel = (step: Step) => step.meters && step.kind === 'warmup' ? 'Warm-up jog'
  : step.meters && step.kind === 'cooldown' ? 'Cool-down jog' : labels[step.kind]
const efforts: StepKind[] = ['jog', 'run', 'brisk', 'tempo', 'interval', 'half', 'stride', 'race']
// Whether a step is an effort (two pulses) or an easy stretch (one).
export const isEffort = (step: Step) => efforts.includes(step.kind)

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
