import type { Activity } from './phone-adventure.ts'

// Gym Training (docs/superpowers/specs/2026-11-17-gym-training-and-buddy-friendship-design.md): guided plans that end
// in a graduation adventure carrying the plan egg. This file only describes the plans; src/training.ts keeps the
// player's progress. Sessions are lists of steps, timed or measured in metres, that src/training-cues.ts walks through
// while recording. Every recovery is walking, never standing still: GPS fixes only arrive while you move.
export type GymId = 'steady-steps' | 'first-hatch'
export type StepKind = 'warmup' | 'walk' | 'brisk' | 'jog' | 'run' | 'cooldown'
export type Step = { kind: StepKind, seconds?: number, meters?: number }
export type SessionKind = 'walk' | 'runwalk' | 'run' | 'graduation'
// hard: needs a rest day before the next hard session. week and index are 0-based; id is unique across Gyms.
export type Session = { id: string, gym: GymId, week: number, index: number, kind: SessionKind, title: string, detail: string, hard: boolean, steps: Step[] }
export type Gym = { id: GymId, name: string, badge: string, level: 'beginner', blurb: string, activity: Activity, weeks: Session[][],
  graduationMeters: number }

const MIN = 60
const step = (kind: StepKind, minutes: number): Step => ({ kind, seconds: Math.round(minutes * MIN) })
const repeat = (times: number, ...steps: Step[]) => Array.from({ length: times }, () => steps).flat()

// Total time of a session's timed steps, in seconds.
export const sessionSeconds = (session: Session) => session.steps.reduce((sum, item) => sum + (item.seconds ?? 0), 0)
// Total distance of its measured steps, in metres.
export const sessionMeters = (session: Session) => session.steps.reduce((sum, item) => sum + (item.meters ?? 0), 0)

type Draft = Omit<Session, 'id' | 'gym' | 'week' | 'index'>
function weeks(gym: GymId, drafts: Draft[][]): Session[][] {
  return drafts.map((sessions, week) => sessions.map((draft, index) => ({ ...draft, id: `${gym}-w${week + 1}-s${index + 1}`, gym, week, index })))
}

// Steady Steps: walking only, a little longer each week, with brisk stretches from week 3, then a 5 km walk.
// Brisk stretches are 3 minutes at a pace where talking takes effort, each followed by 2 easy minutes.
function walk(minutes: number, brisk = 0): Draft {
  if (!brisk) return { kind: 'walk', title: `Walk ${minutes} min`, detail: 'An easy, steady walk.', hard: false, steps: [step('walk', minutes)] }
  const rest = minutes - 5 - brisk * 5
  return { kind: 'walk', title: `Walk ${minutes} min`, detail: `With ${brisk} × 3 min brisk.`, hard: false,
    steps: [step('warmup', 5), ...repeat(brisk, step('brisk', 3), step('walk', 2)), step('cooldown', rest)] }
}
const hatchDay = (activity: Activity): Draft => ({ kind: 'graduation', title: 'Hatch Day: 5 km', hard: true,
  detail: activity === 'walking' ? 'Walk 5 km in one go with your plan egg. It hatches at 5 km.'
    : 'Cover 5 km in one go with your plan egg. Walk whenever you need to: every metre counts.',
  steps: [{ kind: activity === 'walking' ? 'walk' : 'run', meters: 5000 }] })

// First Hatch: run/walk intervals between a 5 minute walk to warm up and another to cool down, until 30 minutes of
// jogging, then the 5 km Hatch Day.
function runWalk(times: number, jog: number, rest: number): Draft {
  return { kind: 'runwalk', title: `${times} × ${clockText(jog)} jog`, detail: `${times} × (${clockText(jog)} jog, ${clockText(rest)} walk), with 5 min walks either side.`,
    hard: true, steps: [step('warmup', 5), ...repeat(times, step('jog', jog), step('walk', rest)), step('cooldown', 5)] }
}
function jogs(...parts: number[]): Draft {
  // parts alternate jog and walk minutes: [15, 2, 8] is 15 min jog, 2 min walk, 8 min jog.
  const main = parts.map((minutes, i) => step(i % 2 ? 'walk' : 'jog', minutes))
  const jogging = parts.filter((_, i) => i % 2 === 0)
  return { kind: parts.length === 1 ? 'run' : 'runwalk', hard: true, steps: [step('warmup', 5), ...main, step('cooldown', 5)],
    title: parts.length === 1 ? `${parts[0]} min jog` : `${jogging.join(' + ')} min jog`,
    detail: parts.length === 1 ? `${parts[0]} minutes of easy jogging, with 5 min walks either side.`
      : `${parts.map((minutes, i) => `${minutes} min ${i % 2 ? 'walk' : 'jog'}`).join(', ')}, with 5 min walks either side.` }
}
const same = (draft: Draft): Draft[] => [draft, draft, draft]

// "90 s", "2 min", "1:30 min" style durations for titles.
export function clockText(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)} s`
  if (Number.isInteger(minutes)) return `${minutes} min`
  return minutes < 2 ? `${Math.round(minutes * 60)} s` : `${Math.floor(minutes)}:${String(Math.round((minutes % 1) * 60)).padStart(2, '0')} min`
}

export const gyms: Record<GymId, Gym> = {
  'steady-steps': {
    id: 'steady-steps', name: 'Steady Steps', badge: 'Sprout Badge', level: 'beginner', activity: 'walking', graduationMeters: 5000,
    blurb: 'Walking only. Six weeks of walks, a little longer each week, to a 5 km walk that hatches your egg.',
    weeks: weeks('steady-steps', [
      [walk(20), walk(20), walk(25)],
      [walk(25), walk(25), walk(30)],
      [walk(30), walk(30, 3), walk(35)],
      [walk(30), walk(35, 4), walk(40)],
      [walk(35), walk(40, 5), walk(50)],
      [walk(30), walk(40, 4), hatchDay('walking')]
    ])
  },
  'first-hatch': {
    id: 'first-hatch', name: 'First Hatch', badge: 'Hatch Badge', level: 'beginner', activity: 'running', graduationMeters: 5000,
    blurb: 'New to running? Eight weeks of run/walk, from 1 minute jogs to 30 minutes, to a 5 km that hatches your egg.',
    weeks: weeks('first-hatch', [
      same(runWalk(8, 1, 2)),
      same(runWalk(6, 1.5, 2)),
      same(runWalk(5, 2, 1.5)),
      same(runWalk(4, 3, 1.5)),
      [runWalk(3, 5, 2), runWalk(2, 8, 3), runWalk(2, 10, 2)],
      [runWalk(2, 10, 2), jogs(15, 2, 8), jogs(22)],
      [jogs(25), jogs(25), jogs(25)],
      [jogs(28), jogs(30), hatchDay('running')]
    ])
  }
}
export const gymOrder: GymId[] = ['steady-steps', 'first-hatch']

// Every session of a Gym in order, graduation last.
export const sessionsOf = (gym: GymId) => gyms[gym].weeks.flat()
export const findSession = (id: string): Session | undefined => gymOrder.flatMap(sessionsOf).find(item => item.id === id)
// A note shown before a session, where a plan steps up.
export const stepUpNote: Partial<Record<string, string>> = {
  'first-hatch-w5-s1': 'Week 5 is a step up. Repeating week 4 is completely fine.'
}
