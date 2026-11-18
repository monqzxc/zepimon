import type { SavedRun } from './progress.ts'
import type { Adventure } from './adventures.ts'
import type { PaceLog } from './phone-adventure.ts'
import { averagePace, bestEffort, negativeSplit, splits } from './running.ts'
import { markSpans, stepSpans } from './training-cues.ts'
import type { Mark } from './training-cues.ts'
import { entryTrial, gymOrder, gyms, sessionMeters, sessionSeconds, sessionsOf } from './training-plans.ts'
import type { GymId, PaceZone, Session } from './training-plans.ts'

// The player's Gym Training (src/training-plans.ts): the plan under way, the badges earned, and adventures they said
// were not a session. Sessions are counted from saved adventures: one started from the plan on this phone counts as
// it is saved, any other (a watch adventure, a phone one started normally) when the player taps Count it. Everything
// here is pure, so it is tested without the app (tests/training.test.js).
// stars: 1 to 3 for how well the paces were kept (scoreStars); a skipped session has none.
export type SessionResult = { at: number, adventureId: string | null, skipped?: boolean, stars?: number }
// A Speed Gym trial that did not beat the baseline: one retry is allowed within 14 days.
export type TrialAttempt = { at: number, seconds: number | null, adventureId: string }
export type ActivePlan = {
  gym: GymId, startedAt: number, egg: { family: string[], mega: string | null },
  done: Record<string, SessionResult>,
  pausedAt: number | null, pausedMs: number,     // the current pause, and the total of earlier ones
  baseline5k: number | null,                     // seconds: the 5 km best the paces come from
  entry: boolean,                                // Speed Gym without a baseline starts with its entry trial
  trials: TrialAttempt[], refreshed: boolean,    // Speed Gym: missed trials; whether the paces were refreshed (Speed Gym, Marathon)
  runWalk: number | null                         // Gigantamax Ultra: minutes between 1 minute walking breaks, null when off
}
// time: the Speed Gym trial's 5 km. perfect: every session at its most stars. pacer: a Mega Trial with a negative split.
// wall: a marathon whose second half was no more than 5% slower than its first (Wall Breaker). steady: an ultra with every
// long run and back-to-back kept easy (Ultra Steady).
export type GymBadge = { at: number, adventureId: string, warm: boolean, perfect: boolean, time?: number, pacer?: boolean, wall?: boolean, steady?: boolean }
// finished: how the latest plan ended, for the screen after saving its last adventure (badge false: a Speed Gym trial
// that never beat the baseline).
export type Finished = { gym: GymId, adventureId: string, badge: boolean, time?: number }
export type Training = { active: ActivePlan | null, badges: Partial<Record<GymId, GymBadge>>, declined: string[], finished?: Finished }
export const emptyTraining = (): Training => ({ active: null, badges: {}, declined: [] })
// An adventure as counting needs it: phone ones bring their pace log, which stars and trial times are read from.
// training.marks: the step marks recorded while it ran (src/training-cues.ts), which judge efforts precisely.
export type Counted = SavedRun & { pace?: PaceLog, movingSeconds?: number, training?: { marks?: Mark[] } }

const DAY = 864e5
export const MAX_PAUSE = 28 * DAY
export const TRIAL_RETRY_DAYS = 14
const AWAY_REPEAT = 10   // days without a session before a week is suggested again
const AWAY_BACK = 21     // ... and two weeks
const SKIPS_PER_WEEK = 1
const TIME_SHARE = 0.9   // a timed session counts from 90% of its time
const DISTANCE_SHARE = 0.95
const BASELINE_DAYS = 84 // a 5 km best older than 12 weeks does not set the paces

// Local midnight, `days` after the day of `time`.
export function dayStart(time: number, days = 0): number {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return date.getTime()
}

const validTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
const isGym = (value: unknown): value is GymId => typeof value === 'string' && (gymOrder as string[]).includes(value)
const asAdventure = (adventure: Counted) => adventure as Adventure

// Anything unreadable is dropped: a damaged plan is lost rather than counting sessions it should not.
export function restoreTraining(raw: unknown): Training {
  const value = raw && typeof raw === 'object' ? raw as Partial<Training> : {}
  const badges: Training['badges'] = {}
  if (value.badges && typeof value.badges === 'object') {
    for (const [gym, badge] of Object.entries(value.badges)) {
      if (!isGym(gym) || !badge || !validTime(badge.at) || typeof badge.adventureId !== 'string') continue
      badges[gym] = { at: badge.at, adventureId: badge.adventureId, warm: badge.warm === true, perfect: badge.perfect === true,
        ...validTime(badge.time) ? { time: badge.time } : {}, ...badge.pacer ? { pacer: true } : {}, ...badge.wall ? { wall: true } : {},
        ...badge.steady ? { steady: true } : {} }
    }
  }
  const declined = Array.isArray(value.declined) ? value.declined.filter((id): id is string => typeof id === 'string').slice(-500) : []
  const finished = value.finished && isGym(value.finished.gym) && typeof value.finished.adventureId === 'string'
    ? { finished: { gym: value.finished.gym, adventureId: value.finished.adventureId, badge: value.finished.badge === true,
      ...validTime(value.finished.time) ? { time: value.finished.time } : {} } } : {}
  return { active: restorePlan(value.active), badges, declined, ...finished }
}
function restorePlan(raw: unknown): ActivePlan | null {
  if (!raw || typeof raw !== 'object') return null
  const plan = raw as Partial<ActivePlan>
  if (!isGym(plan.gym) || !validTime(plan.startedAt) || !plan.egg || !Array.isArray(plan.egg.family) || !plan.egg.family.length ||
    !plan.egg.family.every(name => typeof name === 'string')) return null
  const entry = plan.gym === 'speed-gym' && plan.entry === true
  const ids = new Set([...sessionsOf(plan.gym).map(item => item.id), ...entry ? [entryTrial.id] : []])
  const done: Record<string, SessionResult> = {}
  for (const [id, result] of Object.entries(plan.done ?? {})) {
    if (ids.has(id) && result && validTime(result.at) && (result.adventureId === null || typeof result.adventureId === 'string')) {
      done[id] = { at: result.at, adventureId: result.adventureId, ...result.skipped ? { skipped: true } : {},
        ...Number.isInteger(result.stars) && result.stars! >= 1 && result.stars! <= 3 ? { stars: result.stars } : {} }
    }
  }
  const trials = Array.isArray(plan.trials) ? plan.trials.filter(item => item && validTime(item.at) && typeof item.adventureId === 'string')
    .map(item => ({ at: item.at, adventureId: item.adventureId, seconds: validTime(item.seconds) ? item.seconds : null })).slice(0, 2) : []
  return { gym: plan.gym, startedAt: plan.startedAt, egg: { family: [...plan.egg.family], mega: typeof plan.egg.mega === 'string' ? plan.egg.mega : null },
    done, pausedAt: validTime(plan.pausedAt) ? plan.pausedAt : null, pausedMs: Number.isFinite(plan.pausedMs) && plan.pausedMs! > 0 ? plan.pausedMs! : 0,
    baseline5k: validTime(plan.baseline5k) ? plan.baseline5k : null, entry, trials, refreshed: plan.refreshed === true,
    runWalk: plan.gym === 'gigantamax-ultra' && Number.isInteger(plan.runWalk) && plan.runWalk! >= 5 && plan.runWalk! <= 25 ? plan.runWalk! : null }
}

// Pace zones in seconds per km, from a 5 km best (standard rules of thumb; the half from Riegel's formula, about 1.09 ×).
export type Zones = Record<Exclude<PaceZone, 'any'>, [number, number]> & { halfEstimate: number, marathonEstimate: number }
// The marathon from Riegel's formula comes out at about 1.14 × the 5 km pace, and is often too fast for anyone without
// the long runs yet, which the screen says.
export function paceZones(baseline5k: number): Zones {
  const p = baseline5k / 5
  return { easy: [p * 1.20, p * 1.40], tempo: [p * 1.05, p * 1.09], interval: [p * 0.97, p * 1.00], half: [p * 1.07, p * 1.11],
    marathon: [p * 1.12, p * 1.16], halfEstimate: riegel(baseline5k, 5, 21.0975), marathonEstimate: riegel(baseline5k, 5, 42.195) }
}
// Riegel's formula: the time over `to` km from a time over `from` km.
export const riegel = (seconds: number, from: number, to: number) => seconds * Math.pow(to / from, 1.06)

// The fastest 5 km in saved adventures of the last 12 weeks, the baseline paces come from; null without one.
export function baselineFrom(adventures: Counted[], now: number, since = now - BASELINE_DAYS * DAY): number | null {
  let best: number | null = null
  for (const adventure of adventures) {
    const finished = Date.parse(adventure.record.finishedAt)
    if (!(finished >= since && finished <= now)) continue
    const effort = bestEffort(asAdventure(adventure), 5000)
    if (effort && (best === null || effort < best)) best = effort
  }
  return best
}

// Whether an egg can be a Gym's plan egg: Evolution Road needs one that evolves at 10 km, Mega Trial one with a Mega form.
export function eggAllowed(gym: GymId, family: string[], forms: { megas: string[], gigantamax: string[] }): boolean {
  const rule = gyms[gym].eggRule
  return rule === 'any' || (rule === 'evolves' ? family.length >= 2 : rule === 'mega' ? forms.megas.length > 0 : forms.gigantamax.length > 0)
}

// Whether a Gym is recommended now, and why not. These are soft gates: the player can start anyway after a confirm.
// The ultra is stricter: it stays locked until the Titan Badge or a saved 42 km, or a confirmed marathon elsewhere with
// about 50 km a week now (confirm: the statement to agree to before starting).
export type EntryCheck = { ok: boolean, reason: string, locked?: boolean, confirm?: string }
export function entryCheck(gym: GymId, adventures: Counted[], badges: Training['badges'], now: number): EntryCheck {
  const within = (days: number) => adventures.filter(item => Date.parse(item.record.finishedAt) >= now - days * DAY && Date.parse(item.record.finishedAt) <= now)
  const longest = (days: number) => Math.max(0, ...within(days).map(item => item.record.meters))
  const weekly = within(28).reduce((sum, item) => sum + item.record.meters, 0) / 4
  if (gym === 'evolution-road' && !badges['first-hatch'] && longest(56) < 5000) {
    return { ok: false, reason: 'Recommended once you have covered 5 km in one go in the last 8 weeks, or earned the Hatch Badge.' }
  }
  if (gym === 'mega-trial' && !badges['evolution-road'] && (longest(42) < 10000 || weekly < 15000)) {
    return { ok: false, reason: 'Recommended once you have run 10 km in one go in the last 6 weeks and about 15 km a week, or earned the Stride Badge.' }
  }
  if (gym === 'dynamax-marathon' && !badges['mega-trial'] && (longest(56) < 16000 || weekly < 30000)) {
    return { ok: false, reason: 'Recommended once you have run 16 km in one go in the last 8 weeks and about 30 km a week, or earned the Summit Badge.' }
  }
  if (gym === 'gigantamax-ultra' && !badges['dynamax-marathon'] && !adventures.some(item => item.record.meters >= 42000)) {
    return weekly >= 50000
      ? { ok: false, locked: true, reason: 'Opens after a marathon: the Titan Badge, or a saved run of 42 km.', confirm: "I've run a marathon in the last 12 months" }
      : { ok: false, locked: true, reason: 'Opens after a marathon: the Titan Badge, or a saved run of 42 km. Running a marathon elsewhere counts too, once you run about 50 km a week.' }
  }
  return { ok: true, reason: '' }
}

// The Gym the picker suggests, from saved adventures.
export function suggestGym(adventures: Counted[], badges: Training['badges'], now: number): GymId {
  const recent = adventures.filter(item => Date.parse(item.record.finishedAt) >= now - 56 * DAY)
  const longest = Math.max(0, ...recent.map(item => item.record.meters))
  const weekly = recent.filter(item => Date.parse(item.record.finishedAt) >= now - 28 * DAY).reduce((sum, item) => sum + item.record.meters, 0) / 4
  if ((longest >= 16000 && weekly >= 30000) || badges['mega-trial']) return 'dynamax-marathon'
  if (longest >= 10000 || badges['evolution-road']) return 'mega-trial'
  if (baselineFrom(adventures, now) && weekly >= 15000) return 'speed-gym'
  if (longest >= 5000 || badges['first-hatch']) return 'evolution-road'
  const runner = adventures.some(item => item.record.activity === 'running')
  return runner || !adventures.length ? 'first-hatch' : 'steady-steps'
}

export function startPlan(training: Training, gym: GymId, family: string[], mega: string | null, now: number, baseline5k: number | null = null): Training {
  if (training.active) throw new Error('Finish or quit your current Gym first.')
  const paced = gyms[gym].paced
  return { ...training, active: { gym, startedAt: now, egg: { family: [...family], mega }, done: {}, pausedAt: null, pausedMs: 0,
    baseline5k: paced ? baseline5k : null, entry: gym === 'speed-gym' && !baseline5k, trials: [], refreshed: false,
    runWalk: gym === 'gigantamax-ultra' ? 10 : null } }
}
export const quitPlan = (training: Training): Training => ({ ...training, active: null })

// Every session of this plan in order: Speed Gym's entry trial first when it has one.
export const planSessions = (plan: ActivePlan): Session[] => plan.entry ? [entryTrial, ...sessionsOf(plan.gym)] : sessionsOf(plan.gym)
// The next session to do, or null once the plan is complete.
export const nextSession = (plan: ActivePlan): Session | null => planSessions(plan).find(item => !plan.done[item.id]) ?? null
export const currentWeek = (plan: ActivePlan) => Math.max(0, nextSession(plan)?.week ?? gyms[plan.gym].weeks.length - 1)

// The latest counted (not skipped) session, which the rest rules follow.
function lastCounted(plan: ActivePlan): { session: Session, at: number } | null {
  let last: { session: Session, at: number } | null = null
  for (const session of planSessions(plan)) {
    const result = plan.done[session.id]
    if (result && !result.skipped && (!last || result.at >= last.at)) last = { session, at: result.at }
  }
  const trial = plan.trials.at(-1)
  if (trial && (!last || trial.at >= last.at)) last = { session: sessionsOf(plan.gym).at(-1)!, at: trial.at }
  return last
}

// When the next session opens: one session a day, a rest day between two hard sessions, and two before a trial retry.
export function unlockAt(plan: ActivePlan): number {
  const next = nextSession(plan)
  const last = lastCounted(plan)
  if (!next || !last) return plan.startedAt
  if (plan.trials.length && next.kind === 'graduation') return dayStart(plan.trials.at(-1)!.at, 3)
  // A back-to-back is meant for the day after its long run.
  if (next.pairedWith && last.session.id === next.pairedWith) return dayStart(last.at, 1)
  return dayStart(last.at, next.hard && last.session.hard ? 2 : 1)
}
// After a missed Speed Gym trial: the last day the retry can be run, or null.
export const retryUntil = (plan: ActivePlan): number | null => plan.trials.length ? plan.trials[0].at + TRIAL_RETRY_DAYS * DAY : null
export const retryClosed = (plan: ActivePlan, now: number) => { const until = retryUntil(plan); return until !== null && now > until }
export const isOpen = (plan: ActivePlan, now: number) => !plan.pausedAt && !!nextSession(plan) && now >= unlockAt(plan) && !retryClosed(plan, now)

// When an adventure counts from: its start, or its finish without one.
const startOf = ({ record }: SavedRun) => validTime(record.startedAt) ? record.startedAt : Date.parse(record.finishedAt)

// Whether an adventure does a session: enough of its time or distance; for a graduation the plan egg's family over the
// full distance, exactly as the game needs it to hatch; for a time trial, a 5 km that can be timed.
export function meetsSession(session: Session, plan: ActivePlan, adventure: Counted): boolean {
  const { record } = adventure
  const sameEgg = adventure.family.join('>') === plan.egg.family.join('>')
  if (session.kind === 'trial') return record.meters >= 5000 && bestEffort(asAdventure(adventure), 5000) !== null
  if (session.kind === 'graduation') {
    return sameEgg && record.meters >= gyms[plan.gym].graduationMeters && (plan.gym !== 'speed-gym' || bestEffort(asAdventure(adventure), 5000) !== null)
  }
  const meters = sessionMeters(session)
  // A long run with a time cap also counts once the cap has passed.
  if (session.capSeconds && (record.elapsedSeconds ?? 0) >= session.capSeconds) return true
  if (meters && record.meters < meters * DISTANCE_SHARE) return false
  const seconds = sessionSeconds(session)
  return !!meters || !seconds || (record.elapsedSeconds ?? 0) >= seconds * TIME_SHARE
}

// The most stars a session can earn: beginner sessions 2 (finishing is the win), paced sessions 3 once there are
// zones to pace from, and graduations and trials 1 (they are judged by the distance or the time).
export function maxStars(session: Session, plan: ActivePlan): number {
  if (session.kind === 'graduation' || session.kind === 'trial') return 1
  if (session.kind === 'walk' || session.kind === 'runwalk' || session.kind === 'run') return 2
  // Hills are run by effort, not pace: finishing them is the star.
  if (session.kind === 'hills') return 1
  return plan.baseline5k ? 3 : 1
}
const QUALITY: PaceZone[] = ['tempo', 'interval', 'half']
const TOLERANCE = 0.03
// How well an adventure kept the session's paces, from its pace log. Without a log (a watch adventure) or zones, 1.
// Quality sessions: ★★ when at least two in three efforts were in their zone, ★★★ when all were and the last was no
// more than 3% slower than the first. Easy and long runs: ★★ when the average was no faster than easy, ★★★ when every
// kilometre was. Beginner sessions: ★★ for doing every minute.
export function scoreStars(session: Session, plan: ActivePlan, adventure: Counted): number {
  const most = maxStars(session, plan)
  if (most === 1) return 1
  if (most === 2) return (adventure.record.elapsedSeconds ?? 0) >= sessionSeconds(session) ? 2 : 1
  const pace = adventure.pace
  if (!pace || !plan.baseline5k || !validTime(adventure.record.startedAt)) return 1
  const zones = paceZones(plan.baseline5k)
  const quality = session.steps.some(item => item.zone && QUALITY.includes(item.zone))
  if (!quality) {
    const floor = zones.easy[0] * (1 - TOLERANCE)
    const average = averagePace(asAdventure(adventure))
    if (average === null || average < floor) return 1
    const kms = splits(asAdventure(adventure)).filter(split => split.meters === 1000)
    return kms.length && kms.every(split => split.pace >= floor) ? 3 : 2
  }
  const efforts = session.steps.filter(item => item.zone && QUALITY.includes(item.zone)).length
  const isEffort = (span: { step: { zone?: PaceZone } }) => !!span.step.zone && QUALITY.includes(span.step.zone)
  // Step marks recorded fix by fix place each effort to within a few metres; without them (or when they stop short) the
  // efforts are found in the pace log.
  const marked = adventure.training?.marks ? markSpans(session, adventure.training.marks).filter(isEffort) : []
  const precise = marked.length >= efforts
  const spans = precise ? marked : stepSpans(session, { startedAt: adventure.record.startedAt, meters: adventure.record.meters, pace },
    adventure.record.elapsedSeconds ?? 0).filter(isEffort)
  if (!spans.length || spans.length < efforts) return 1
  const paces = spans.map(span => span.to.meters > span.from.meters ? (span.to.seconds - span.from.seconds) / (span.to.meters - span.from.meters) * 1000 : Infinity)
  // The pace log has a mark every 100 m, so there an effort's edges blend with the jog either side: short efforts get
  // more room (3% plus 25 m's worth: about 9% on 400 m, 5.5% on 1 km, under 4% on a 3 km tempo). Marked efforts get 3%.
  const room = spans.map(span => TOLERANCE + (precise ? 0 : 25 / Math.max(100, span.to.meters - span.from.meters)))
  const inZone = spans.map((span, i) => {
    const [fast, slow] = zones[span.step.zone as Exclude<PaceZone, 'any'>]
    return paces[i] >= fast * (1 - room[i]) && paces[i] <= slow * (1 + room[i])
  })
  const kept = inZone.filter(Boolean).length
  // The fade allows 3% plus the blending room of both efforts compared.
  if (kept === spans.length && paces.at(-1)! <= paces[0] * (1 + room[0] + room.at(-1)! - TOLERANCE)) return 3
  return kept * 3 >= spans.length * 2 ? 2 : 1
}

// Saved adventures that could be the next session, oldest first: done since the last session (and on a day it was
// open), not already counted, not turned down, and enough for it.
export function matchCandidates<T extends Counted>(training: Training, adventures: T[], now: number): T[] {
  const plan = training.active
  const next = plan && !plan.pausedAt && !retryClosed(plan, now) ? nextSession(plan) : null
  if (!plan || !next) return []
  const used = new Set([...Object.values(plan.done).map(result => result.adventureId), ...plan.trials.map(item => item.adventureId)])
  const after = Math.max(plan.startedAt, lastCounted(plan)?.at ?? 0)
  const open = unlockAt(plan)
  return adventures
    .filter(item => !used.has(item.id) && !training.declined.includes(item.id) && startOf(item) >= after && startOf(item) >= open &&
      Date.parse(item.record.finishedAt) <= now && meetsSession(next, plan, item))
    .sort((a, b) => startOf(a) - startOf(b))
}

// The second half no more than 5% slower than the first, by the clock, from a pace log logged from the start.
export function evenHalves(adventure: Counted): boolean {
  const pace = adventure.pace
  if (!pace || pace.start !== 0 || pace.at.length < 51) return false
  const last = pace.at.length - 1
  const half = pace.at[Math.floor(last / 2)] + (last % 2 ? (pace.at[Math.ceil(last / 2)] - pace.at[Math.floor(last / 2)]) / 2 : 0)
  return pace.at[last] - half <= half * 1.05
}

function perfectRun(plan: ActivePlan): boolean {
  return planSessions(plan).filter(item => item.kind !== 'graduation' && item.kind !== 'trial')
    .every(item => plan.done[item.id] && !plan.done[item.id].skipped && (plan.done[item.id].stars ?? 1) >= maxStars(item, plan))
}

// Counts an adventure as the next session. The entry trial sets the paces; a graduation ends the plan with its badge
// (kept if earned before). A Speed Gym trial that does not beat the baseline earns no badge: the plan waits for one
// retry within 14 days, after which it ends without one.
export function countSession(training: Training, adventure: Counted, now: number): Training {
  const plan = training.active
  const next = plan ? nextSession(plan) : null
  if (!plan || !next) throw new Error('There is no session to count.')
  if (plan.pausedAt) throw new Error('Resume your Gym first.')
  if (retryClosed(plan, now)) throw new Error('The retry window for this trial has closed.')
  if (startOf(adventure) < unlockAt(plan)) throw new Error('That adventure was before this session opened.')
  if (!meetsSession(next, plan, adventure)) throw new Error('That adventure is not enough for this session.')
  if (Object.values(plan.done).some(result => result.adventureId === adventure.id) || plan.trials.some(item => item.adventureId === adventure.id)) {
    throw new Error('That adventure already counted.')
  }
  const at = Date.parse(adventure.record.finishedAt) || now
  const result: SessionResult = { at, adventureId: adventure.id, stars: scoreStars(next, plan, adventure) }
  const done = { ...plan.done, [next.id]: result }
  if (next.kind === 'trial') {
    return { ...training, active: { ...plan, done, baseline5k: bestEffort(asAdventure(adventure), 5000) } }
  }
  if (next.kind !== 'graduation') return { ...training, active: { ...plan, done } }
  const finished = { ...plan, done }
  const badge: GymBadge = { at: now, adventureId: adventure.id, warm: warmth(finished) === 1, perfect: perfectRun(finished) }
  if (plan.gym === 'speed-gym') {
    const time = bestEffort(asAdventure(adventure), 5000)!
    if (plan.baseline5k && time >= plan.baseline5k) {
      const trials = [...plan.trials, { at, seconds: time, adventureId: adventure.id }]
      return trials.length >= 2 ? { ...training, active: null, finished: { gym: plan.gym, adventureId: adventure.id, badge: false, time } }
        : { ...training, active: { ...plan, trials } }
    }
    badge.time = time
  }
  if (plan.gym === 'mega-trial' && negativeSplit(asAdventure(adventure))) badge.pacer = true
  if (plan.gym === 'dynamax-marathon' && evenHalves(adventure)) badge.wall = true
  if (plan.gym === 'gigantamax-ultra' && planSessions(finished).filter(item => item.kind === 'long' || item.kind === 'backtoback')
    .every(item => (finished.done[item.id]?.stars ?? 0) >= maxStars(item, finished))) badge.steady = true
  const earned = training.badges[plan.gym]
  return { ...training, active: null, finished: { gym: plan.gym, adventureId: adventure.id, badge: true, ...badge.time ? { time: badge.time } : {} },
    badges: { ...training.badges, [plan.gym]: earned ? { ...earned, ...badge.time && (!earned.time || badge.time < earned.time) ? { time: badge.time } : {} } : badge } }
}

// A phone adventure started from the plan counts as soon as it is saved, if it did the session it was started for.
export function countStarted(training: Training, adventure: Counted, session: string | undefined, now: number): Training {
  const plan = training.active
  if (!plan || !session || nextSession(plan)?.id !== session) return training
  try { return countSession(training, adventure, now) } catch { return training }
}

export const decline = (training: Training, adventureId: string): Training =>
  training.declined.includes(adventureId) ? training : { ...training, declined: [...training.declined, adventureId].slice(-500) }

// Skips the next session: done, but no warmth. One a week, never a trial or the graduation.
export function canSkip(plan: ActivePlan): boolean {
  const next = nextSession(plan)
  if (!next || next.kind === 'graduation' || next.kind === 'trial' || plan.pausedAt) return false
  const week = gyms[plan.gym].weeks[next.week]
  return week.filter(item => plan.done[item.id]?.skipped).length < SKIPS_PER_WEEK
}
export function skipSession(training: Training, now: number): Training {
  const plan = training.active
  if (!plan || !canSkip(plan)) throw new Error('This session cannot be skipped.')
  const next = nextSession(plan)!
  return { ...training, active: { ...plan, done: { ...plan.done, [next.id]: { at: now, adventureId: null, skipped: true } } } }
}

// Goes back `weeks` weeks from the current one: those weeks' sessions are to do again. The entry trial stays done.
export function goBack(training: Training, weeks: number): Training {
  const plan = training.active
  if (!plan) return training
  const from = Math.max(0, currentWeek(plan) - weeks)
  const done = Object.fromEntries(Object.entries(plan.done).filter(([id]) => id === entryTrial.id ||
    (sessionsOf(plan.gym).find(item => item.id === id)?.week ?? 0) < from))
  return { ...training, active: { ...plan, done } }
}

export function pause(training: Training, now: number): Training {
  const plan = training.active
  return plan && !plan.pausedAt ? { ...training, active: { ...plan, pausedAt: now } } : training
}
export function resume(training: Training, now: number): Training {
  const plan = training.active
  if (!plan?.pausedAt) return training
  return { ...training, active: { ...plan, pausedAt: null, pausedMs: plan.pausedMs + Math.min(MAX_PAUSE, Math.max(0, now - plan.pausedAt)) } }
}

// Fresher paces, once: Speed Gym from week 4 from a faster 5 km since the plan began; Dynamax Marathon from week 9 from
// a half marathon, a much better guide to the marathon than a 5 km. baseline: the 5 km the zones then come from
// (for the half, its equivalent by Riegel's formula); from, seconds: what it came from, to show.
export type Refresh = { baseline: number, from: '5 km' | 'half marathon', seconds: number }
export function refreshOffer(plan: ActivePlan, adventures: Counted[], now: number): Refresh | null {
  if (plan.refreshed || !plan.baseline5k) return null
  if (plan.gym === 'speed-gym' && currentWeek(plan) >= 3) {
    const best = baselineFrom(adventures, now, plan.startedAt)
    return best && best < plan.baseline5k ? { baseline: best, from: '5 km', seconds: best } : null
  }
  if (plan.gym === 'dynamax-marathon' && currentWeek(plan) >= 8) {
    let half: number | null = null
    for (const adventure of adventures) {
      const finished = Date.parse(adventure.record.finishedAt)
      if (!(finished >= now - BASELINE_DAYS * DAY && finished <= now)) continue
      const effort = bestEffort(asAdventure(adventure), 21097.5)
      if (effort && (half === null || effort < half)) half = effort
    }
    return half ? { baseline: riegel(half, 21.0975, 5), from: 'half marathon', seconds: half } : null
  }
  return null
}
export function refreshZones(training: Training, seconds: number): Training {
  const plan = training.active
  return plan ? { ...training, active: { ...plan, baseline5k: seconds, refreshed: true } } : training
}

// Days since the last session (or the start), not counting up to 28 days of pauses.
export function daysAway(plan: ActivePlan, now: number): number {
  const since = lastCounted(plan)?.at ?? plan.startedAt
  const paused = plan.pausedMs + (plan.pausedAt ? Math.min(MAX_PAUSE, Math.max(0, now - plan.pausedAt)) : 0)
  return Math.max(0, Math.floor((now - since - paused) / DAY))
}
// After time away, the weeks to go back: 1 after 10 days, 2 after 21 (never before the first week).
export function welcomeBack(plan: ActivePlan, now: number): number {
  const away = daysAway(plan, now)
  const week = currentWeek(plan)
  if (week === 0 || away < AWAY_REPEAT || plan.trials.length) return 0
  return away >= AWAY_BACK ? Math.min(2, week) : 1
}

// How warm the plan egg is: sessions done (not skipped) out of all before the graduation.
export function warmth(plan: ActivePlan): number {
  const before = sessionsOf(plan.gym).filter(item => item.kind !== 'graduation')
  return before.filter(item => plan.done[item.id] && !plan.done[item.id].skipped).length / before.length
}
export const progressOf = (plan: ActivePlan) => {
  const all = planSessions(plan)
  return { done: all.filter(item => plan.done[item.id]).length, total: all.length }
}
// Stars earned so far, and the most there were to earn in the sessions done.
export function starsOf(plan: ActivePlan): { earned: number, possible: number } {
  let earned = 0, possible = 0
  for (const session of planSessions(plan)) {
    const result = plan.done[session.id]
    if (!result || result.skipped) continue
    earned += result.stars ?? 1
    possible += maxStars(session, plan)
  }
  return { earned, possible }
}

// Gigantamax Ultra's walking breaks: a minute's walk every `minutes` (5 to 25), or none.
export function setRunWalk(training: Training, minutes: number | null): Training {
  const plan = training.active
  if (!plan || plan.gym !== 'gigantamax-ultra') return training
  return { ...training, active: { ...plan, runWalk: minutes && minutes >= 5 && minutes <= 25 ? Math.round(minutes) : null } }
}
// Sessions that take the walking breaks: the long runs, back-to-backs and the graduation.
export const takesBreaks = (session: Session) => session.kind === 'long' || session.kind === 'backtoback' || session.kind === 'graduation'
