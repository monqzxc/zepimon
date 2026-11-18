import type { Activity } from './phone-adventure.ts'

// Gym Training (docs/superpowers/specs/2026-11-17-gym-training-and-buddy-friendship-design.md): guided plans that end
// in a graduation adventure carrying the plan egg. This file only describes the plans; src/training.ts keeps the
// player's progress. Sessions are lists of steps, timed or measured in metres, that src/training-cues.ts walks through
// while recording. Every recovery is moving (a walk or a jog), never standing still: GPS fixes only arrive while you move.
export type GymId = 'steady-steps' | 'first-hatch' | 'evolution-road' | 'speed-gym' | 'mega-trial'
export type StepKind = 'warmup' | 'walk' | 'brisk' | 'jog' | 'run' | 'cooldown' | 'easy' | 'tempo' | 'interval' | 'half' | 'stride' | 'recover' | 'race'
// The pace a step is run at, from your 5 km best (src/training.ts paceZones); 'any' has no target.
export type PaceZone = 'easy' | 'tempo' | 'interval' | 'half' | 'any'
export type Step = { kind: StepKind, seconds?: number, meters?: number, zone?: PaceZone }
export type SessionKind = 'walk' | 'runwalk' | 'run' | 'easy' | 'strides' | 'long' | 'fartlek' | 'tempo' | 'intervals' | 'half' | 'trial' | 'graduation'
// hard: needs a rest day before the next hard session. week and index are 0-based; id is unique across Gyms.
// meters: the distance the whole session covers, warm-up, recoveries and cool-down included, which it is counted by.
export type Session = { id: string, gym: GymId, week: number, index: number, kind: SessionKind, title: string, detail: string, hard: boolean,
  steps: Step[], meters?: number }
export type Level = 'beginner' | 'intermediate' | 'advanced'
// eggRule: which eggs the plan egg can be. evolves: one that evolves at 10 km. mega: one with a Mega form, chosen at the start.
export type Gym = { id: GymId, name: string, badge: string, level: Level, blurb: string, activity: Activity, weeks: Session[][],
  graduationMeters: number, eggRule: 'any' | 'evolves' | 'mega', paced: boolean }

const MIN = 60
const step = (kind: StepKind, minutes: number, zone?: PaceZone): Step => ({ kind, seconds: Math.round(minutes * MIN), ...zone ? { zone } : {} })
const run = (kind: StepKind, km: number, zone?: PaceZone): Step => ({ kind, meters: Math.round(km * 1000), ...zone ? { zone } : {} })
const repeat = (times: number, ...steps: Step[]) => Array.from({ length: times }, () => steps).flat()

// Total time of a session's timed steps, in seconds.
export const sessionSeconds = (session: Session) => session.steps.reduce((sum, item) => sum + (item.seconds ?? 0), 0)
// The distance a session is counted by: its whole distance when it has one, else its measured steps.
export const sessionMeters = (session: Session) => session.meters ?? session.steps.reduce((sum, item) => sum + (item.meters ?? 0), 0)

type Draft = Omit<Session, 'id' | 'gym' | 'week' | 'index'>
function weeks(gym: GymId, drafts: Draft[][]): Session[][] {
  return drafts.map((sessions, week) => sessions.map((draft, index) => ({ ...draft, id: `${gym}-w${week + 1}-s${index + 1}`, gym, week, index })))
}

// "90 s", "2 min", "2:30 min" style durations for titles.
export function clockText(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)} s`
  if (Number.isInteger(minutes)) return `${minutes} min`
  return minutes < 2 ? `${Math.round(minutes * 60)} s` : `${Math.floor(minutes)}:${String(Math.round((minutes % 1) * 60)).padStart(2, '0')} min`
}
const kmText = (km: number) => `${Number.isInteger(km) ? km : km.toFixed(1)} km`

// Beginner sessions: timed walks and run/walk.
function walk(minutes: number, brisk = 0): Draft {
  if (!brisk) return { kind: 'walk', title: `Walk ${minutes} min`, detail: 'An easy, steady walk.', hard: false, steps: [step('walk', minutes)] }
  const rest = minutes - 5 - brisk * 5
  return { kind: 'walk', title: `Walk ${minutes} min`, detail: `With ${brisk} × 3 min brisk.`, hard: false,
    steps: [step('warmup', 5), ...repeat(brisk, step('brisk', 3), step('walk', 2)), step('cooldown', rest)] }
}
const hatchDay = (activity: Activity): Draft => ({ kind: 'graduation', title: 'Hatch Day: 5 km', hard: true,
  detail: activity === 'walking' ? 'Walk 5 km in one go with your plan egg. It hatches at 5 km.'
    : 'Cover 5 km in one go with your plan egg. Walk whenever you need to: every metre counts.',
  steps: [run(activity === 'walking' ? 'walk' : 'run', 5)] })
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

// Running sessions, by distance. Easy and long runs are one step at easy pace; strides are 20 s relaxed-fast with a
// walk back; quality sessions warm up and cool down at easy pace around their efforts.
const easy = (km: number): Draft => ({ kind: 'easy', title: `Easy ${kmText(km)}`, hard: false, meters: km * 1000,
  detail: 'Easy pace: you could chat the whole way. Slower than you think.', steps: [run('easy', km, 'easy')] })
const long = (km: number): Draft => ({ kind: 'long', title: `Long run ${kmText(km)}`, hard: true, meters: km * 1000,
  detail: 'Your longest run of the week, all at easy pace. Time on your feet is the point.', steps: [run('easy', km, 'easy')] })
const strides = (km: number, n: number): Draft => ({ kind: 'strides', title: `${kmText(km)} + ${n} strides`, hard: false, meters: km * 1000 + n * 100,
  detail: `An easy ${kmText(km)}, then ${n} × 20 s strides: quick and relaxed, walking back between.`,
  steps: [run('easy', km, 'easy'), ...repeat(n, step('stride', 1 / 3, 'any'), step('walk', 1))] })
const fartlek = (km: number, n: number, on: number, off: number, zone: 'tempo' = 'tempo'): Draft => ({ kind: 'fartlek', hard: true, meters: km * 1000,
  title: on >= 2 ? `${kmText(km)} with ${n} × ${clockText(on)} tempo` : `${kmText(km)} fartlek`,
  detail: `${n} × (${clockText(on)} ${on >= 2 ? 'at tempo' : 'brisk'}, ${clockText(off)} easy), between an easy warm-up and cool-down.`,
  steps: [run('warmup', 1.5, 'easy'), ...repeat(n, step('tempo', on, zone), step('recover', off, 'easy')), run('cooldown', 1, 'easy')] })
// Track-style repeats with a 2 km warm-up and 1.5 km cool-down (Speed Gym).
// Counted distance: warm-up, cool-down and the repeats, plus the jogs between at a slow 100 m a minute, so a slower
// runner is never short.
const reps = (n: number, meters: number, rest: number): Draft => ({ kind: 'intervals', hard: true,
  meters: 3500 + n * meters + Math.round((n - 1) * rest * 100),
  title: `${n} × ${meters >= 1000 ? kmText(meters / 1000) : `${meters} m`} fast`,
  detail: `${n} × ${meters >= 1000 ? kmText(meters / 1000) : `${meters} m`} at interval pace, ${clockText(rest)} jog between. 2 km warm-up, 1.5 km cool-down.`,
  steps: [run('warmup', 2, 'easy'), ...repeat(n, run('interval', meters / 1000, 'interval'), step('recover', rest, 'easy')), run('cooldown', 1.5, 'easy')] })
// Timed tempo with a 2 km warm-up and 1.5 km cool-down (Speed Gym).
// Counted distance assumes a 6:40/km tempo (150 m a minute), so it never asks a slower runner for more than they ran.
const tempo = (n: number, minutes: number, rest = 2): Draft => ({ kind: 'tempo', hard: true, meters: 3500 + n * minutes * 150 + (n - 1) * rest * 100,
  title: n === 1 ? `${minutes} min tempo` : `${n} × ${minutes} min tempo`,
  detail: `${n === 1 ? `${minutes} minutes` : `${n} × ${minutes} min`} at tempo: comfortably hard${n > 1 ? `, ${clockText(rest)} jog between` : ''}. 2 km warm-up, 1.5 km cool-down.`,
  steps: [run('warmup', 2, 'easy'), ...repeat(n, step('tempo', minutes, 'tempo'), ...n > 1 ? [step('recover', rest, 'easy')] : []).slice(0, n > 1 ? -1 : undefined),
    run('cooldown', 1.5, 'easy')] })
// A run of `total` km with efforts measured in km inside it (Mega Trial): warm-up, n × the effort with jogs between,
// then easy to the total.
function inside(total: number, n: number, km: number, zone: 'tempo' | 'interval' | 'half', rest: number, warm = n > 1 ? 2 : 1): Draft {
  const efforts = repeat(n, run(zone, km, zone), ...rest ? [step('recover', rest, 'easy')] : []).slice(0, rest && n > 1 ? -1 : undefined)
  const cool = Math.max(0.5, total - warm - n * km)
  const what = { tempo: 'tempo', interval: 'interval pace', half: 'half marathon pace' }[zone]
  const kind: SessionKind = zone === 'interval' ? 'intervals' : zone === 'half' ? 'half' : 'tempo'
  return { kind, hard: true, meters: total * 1000,
    title: n === 1 ? `${kmText(total)} with ${kmText(km)} ${zone === 'half' ? 'at half pace' : 'tempo'}` : `${kmText(total)} with ${n} × ${kmText(km)}`,
    detail: n === 1 ? `${kmText(km)} at ${what} inside a ${kmText(total)} run.` : `${n} × ${kmText(km)} at ${what}${rest ? `, ${clockText(rest)} jog between` : ''}, inside a ${kmText(total)} run.`,
    steps: [run('warmup', warm, 'easy'), ...efforts, run('cooldown', cool, 'easy')] }
}
const graduation = (km: number, title: string, detail: string): Draft => ({ kind: 'graduation', title, detail, hard: true, meters: km * 1000,
  steps: [run('run', km, 'any')] })

export const gyms: Record<GymId, Gym> = {
  'steady-steps': {
    id: 'steady-steps', name: 'Steady Steps', badge: 'Sprout Badge', level: 'beginner', activity: 'walking', graduationMeters: 5000, eggRule: 'any', paced: false,
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
    id: 'first-hatch', name: 'First Hatch', badge: 'Hatch Badge', level: 'beginner', activity: 'running', graduationMeters: 5000, eggRule: 'any', paced: false,
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
  },
  'evolution-road': {
    id: 'evolution-road', name: 'Evolution Road', badge: 'Stride Badge', level: 'intermediate', activity: 'running', graduationMeters: 10000,
    eggRule: 'evolves', paced: true,
    blurb: 'From 5 km to 10 km in eight weeks: easy runs, strides, fartlek and a longer run each week, to a 10 km that evolves your egg.',
    weeks: weeks('evolution-road', [
      [easy(4), easy(4), strides(4, 6), long(6)],
      [easy(4), easy(4), fartlek(5, 6, 1, 2), long(7)],
      [easy(5), easy(5), fartlek(5, 8, 1, 1), long(7.5)],
      [easy(4), easy(4), strides(4, 6), long(6)],
      [easy(5), easy(5), fartlek(6, 5, 2, 2), long(8)],
      [easy(5), easy(6), fartlek(6, 4, 3, 2), long(8.5)],
      [easy(5), easy(6), fartlek(6, 3, 4, 2), long(9)],
      [easy(4), strides(4, 4), graduation(10, 'Evolution Day: 10 km', 'Run 10 km in one go with your plan egg. It hatches at 5 km and evolves at 10.')]
    ])
  },
  'speed-gym': {
    id: 'speed-gym', name: 'Speed Gym', badge: 'Spark Badge', level: 'advanced', activity: 'running', graduationMeters: 5000, eggRule: 'any', paced: true,
    blurb: 'Six weeks of intervals, tempo and long runs, paced from your own 5 km best, to a 5 km time trial. The badge needs a new best.',
    weeks: weeks('speed-gym', [
      [reps(6, 400, 1.5), easy(6), tempo(1, 20), long(8)],
      [reps(5, 800, 2), easy(6), tempo(2, 10), long(9)],
      [reps(10, 400, 1.25), easy(7), tempo(1, 25), long(10)],
      [reps(4, 1000, 2.5), easy(5), strides(6, 6), long(8)],
      [reps(6, 800, 1.5), easy(7), tempo(3, 10), long(11)],
      [reps(4, 400, 2), strides(5, 4), graduation(5, 'Gym Trial: 5 km', 'Run 5 km as fast as you can hold, with your plan egg. Beat your best for the Spark Badge.')]
    ])
  },
  'mega-trial': {
    id: 'mega-trial', name: 'Mega Trial', badge: 'Summit Badge', level: 'advanced', activity: 'running', graduationMeters: 21098, eggRule: 'mega', paced: true,
    blurb: 'Twelve weeks to a half marathon: tempo, intervals and long runs building to 18 km, then 21.1 km that Mega Evolves your egg.',
    weeks: weeks('mega-trial', [
      [easy(6), inside(5, 1, 3, 'tempo', 0), easy(6), long(10)],
      [easy(6), inside(8, 5, 1, 'interval', 2), easy(6), long(11)],
      [easy(7), inside(7, 1, 5, 'tempo', 0), easy(7), long(13)],
      [easy(6), strides(6, 6), easy(5), long(11)],
      [easy(7), inside(9, 6, 1, 'interval', 2), easy(7), long(14)],
      [easy(8), inside(9, 1, 6, 'tempo', 0, 2), easy(7), long(15)],
      [easy(8), inside(9, 3, 2, 'tempo', 3), easy(8), long(16)],
      [easy(6), inside(8, 1, 4, 'half', 0, 2), easy(6), long(13)],
      [easy(8), inside(11, 5, 1.6, 'tempo', 2), easy(8), long(17)],
      [easy(8), inside(10, 1, 8, 'half', 0), easy(8), long(18)],
      [easy(6), inside(8, 3, 1.6, 'half', 1.5), easy(6), long(14)],
      [easy(5), { kind: 'half', hard: true, meters: 5000, title: '5 km with 4 × 1 min at half pace',
        detail: '4 × 1 minute at half marathon pace inside an easy 5 km, to keep your legs sharp.',
        steps: [run('warmup', 2, 'easy'), ...repeat(4, step('half', 1, 'half'), step('recover', 2, 'easy')).slice(0, -1), run('cooldown', 1.5, 'easy')] },
      graduation(21.1, 'Summit Day: 21.1 km', 'Run a half marathon with your plan egg. It Mega Evolves at 21 km.')]
    ])
  }
}
export const gymOrder: GymId[] = ['steady-steps', 'first-hatch', 'evolution-road', 'speed-gym', 'mega-trial']

// Speed Gym starts with this 5 km time trial when there is no recent 5 km best to pace it from.
export const entryTrial: Session = { id: 'speed-gym-entry', gym: 'speed-gym', week: 0, index: -1, kind: 'trial', hard: true, meters: 5000,
  title: 'Entry trial: 5 km', detail: 'Run 5 km as hard as you can comfortably hold. Your time sets the paces for the whole plan.',
  steps: [run('race', 5, 'any')] }

// Every session of a Gym in order, graduation last.
export const sessionsOf = (gym: GymId) => gyms[gym].weeks.flat()
export const findSession = (id: string): Session | undefined => id === entryTrial.id ? entryTrial : gymOrder.flatMap(sessionsOf).find(item => item.id === id)
// A note shown before a session, where a plan steps up.
export const stepUpNote: Partial<Record<string, string>> = {
  'first-hatch-w5-s1': 'Week 5 is a step up. Repeating week 4 is completely fine.'
}
