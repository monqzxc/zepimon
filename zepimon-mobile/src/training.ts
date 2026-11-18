import type { SavedRun } from './progress.ts'
import { gymOrder, gyms, sessionSeconds, sessionMeters, sessionsOf } from './training-plans.ts'
import type { GymId, Session } from './training-plans.ts'

// The player's Gym Training (src/training-plans.ts): the plan under way, the badges earned, and adventures they said
// were not a session. Sessions are counted from saved adventures: one started from the plan on this phone counts as
// it is saved, any other (a watch adventure, a phone one started normally) when the player taps Count it. Everything
// here is pure, so it is tested without the app (tests/training.test.js).
export type SessionResult = { at: number, adventureId: string | null, skipped?: boolean }
export type ActivePlan = {
  gym: GymId, startedAt: number, egg: { family: string[], mega: string | null },
  done: Record<string, SessionResult>,
  pausedAt: number | null, pausedMs: number      // the current pause, and the total of earlier ones
}
export type GymBadge = { at: number, adventureId: string, warm: boolean }
export type Training = { active: ActivePlan | null, badges: Partial<Record<GymId, GymBadge>>, declined: string[] }
export const emptyTraining = (): Training => ({ active: null, badges: {}, declined: [] })

const DAY = 864e5
export const MAX_PAUSE = 28 * DAY
const AWAY_REPEAT = 10   // days without a session before a week is suggested again
const AWAY_BACK = 21     // ... and two weeks
const SKIPS_PER_WEEK = 1
const TIME_SHARE = 0.9   // a timed session counts from 90% of its time
const DISTANCE_SHARE = 0.95

// Local midnight, `days` after the day of `time`.
export function dayStart(time: number, days = 0): number {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return date.getTime()
}

const validTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
const isGym = (value: unknown): value is GymId => typeof value === 'string' && (gymOrder as string[]).includes(value)

// Anything unreadable is dropped: a damaged plan is lost rather than counting sessions it should not.
export function restoreTraining(raw: unknown): Training {
  const value = raw && typeof raw === 'object' ? raw as Partial<Training> : {}
  const badges: Training['badges'] = {}
  if (value.badges && typeof value.badges === 'object') {
    for (const [gym, badge] of Object.entries(value.badges)) {
      if (isGym(gym) && badge && validTime(badge.at) && typeof badge.adventureId === 'string') badges[gym] = { at: badge.at, adventureId: badge.adventureId, warm: badge.warm === true }
    }
  }
  const declined = Array.isArray(value.declined) ? value.declined.filter((id): id is string => typeof id === 'string').slice(-500) : []
  return { active: restorePlan(value.active), badges, declined }
}
function restorePlan(raw: unknown): ActivePlan | null {
  if (!raw || typeof raw !== 'object') return null
  const plan = raw as Partial<ActivePlan>
  if (!isGym(plan.gym) || !validTime(plan.startedAt) || !plan.egg || !Array.isArray(plan.egg.family) || !plan.egg.family.length ||
    !plan.egg.family.every(name => typeof name === 'string')) return null
  const ids = new Set(sessionsOf(plan.gym).map(item => item.id))
  const done: Record<string, SessionResult> = {}
  for (const [id, result] of Object.entries(plan.done ?? {})) {
    if (ids.has(id) && result && validTime(result.at) && (result.adventureId === null || typeof result.adventureId === 'string')) {
      done[id] = { at: result.at, adventureId: result.adventureId, ...result.skipped ? { skipped: true } : {} }
    }
  }
  return { gym: plan.gym, startedAt: plan.startedAt, egg: { family: [...plan.egg.family], mega: typeof plan.egg.mega === 'string' ? plan.egg.mega : null },
    done, pausedAt: validTime(plan.pausedAt) ? plan.pausedAt : null, pausedMs: Number.isFinite(plan.pausedMs) && plan.pausedMs! > 0 ? plan.pausedMs! : 0 }
}

export function startPlan(training: Training, gym: GymId, family: string[], mega: string | null, now: number): Training {
  if (training.active) throw new Error('Finish or quit your current Gym first.')
  return { ...training, active: { gym, startedAt: now, egg: { family: [...family], mega }, done: {}, pausedAt: null, pausedMs: 0 } }
}
export const quitPlan = (training: Training): Training => ({ ...training, active: null })

// The next session to do, or null once the plan is complete.
export const nextSession = (plan: ActivePlan): Session | null => sessionsOf(plan.gym).find(item => !plan.done[item.id]) ?? null
export const currentWeek = (plan: ActivePlan) => nextSession(plan)?.week ?? gyms[plan.gym].weeks.length - 1

// The latest counted (not skipped) session, which the rest rules follow.
function lastCounted(plan: ActivePlan): { session: Session, result: SessionResult } | null {
  let last: { session: Session, result: SessionResult } | null = null
  for (const session of sessionsOf(plan.gym)) {
    const result = plan.done[session.id]
    if (result && !result.skipped && (!last || result.at >= last.result.at)) last = { session, result }
  }
  return last
}

// When the next session opens: one session a day, and a rest day between two hard sessions.
export function unlockAt(plan: ActivePlan): number {
  const next = nextSession(plan)
  const last = lastCounted(plan)
  if (!next || !last) return plan.startedAt
  return dayStart(last.result.at, next.hard && last.session.hard ? 2 : 1)
}
export const isOpen = (plan: ActivePlan, now: number) => !plan.pausedAt && !!nextSession(plan) && now >= unlockAt(plan)

// When an adventure counts from: its start, or its finish without one.
const startOf = ({ record }: SavedRun) => validTime(record.startedAt) ? record.startedAt : Date.parse(record.finishedAt)

// Whether an adventure does a session: enough of its time or distance, and for a graduation the plan egg's family
// over the full distance, exactly as the game needs it to hatch.
export function meetsSession(session: Session, plan: ActivePlan, adventure: SavedRun): boolean {
  const { record } = adventure
  if (session.kind === 'graduation') {
    return adventure.family.join('>') === plan.egg.family.join('>') && record.meters >= gyms[plan.gym].graduationMeters
  }
  const meters = sessionMeters(session)
  if (meters && record.meters < meters * DISTANCE_SHARE) return false
  const seconds = sessionSeconds(session)
  return !seconds || (record.elapsedSeconds ?? 0) >= seconds * TIME_SHARE
}

// Saved adventures that could be the next session, oldest first: done since the last session (and on a day it was
// open), not already counted, not turned down, and enough for it.
export function matchCandidates<T extends SavedRun>(training: Training, adventures: T[], now: number): T[] {
  const plan = training.active
  const next = plan && !plan.pausedAt ? nextSession(plan) : null
  if (!plan || !next) return []
  const used = new Set(Object.values(plan.done).map(result => result.adventureId))
  const after = Math.max(plan.startedAt, lastCounted(plan)?.result.at ?? 0)
  const open = unlockAt(plan)
  return adventures
    .filter(item => !used.has(item.id) && !training.declined.includes(item.id) && startOf(item) >= after && startOf(item) >= open &&
      Date.parse(item.record.finishedAt) <= now && meetsSession(next, plan, item))
    .sort((a, b) => startOf(a) - startOf(b))
}

// Counts an adventure as the next session. A graduation ends the plan with its badge (kept if earned before).
export function countSession(training: Training, adventure: SavedRun, now: number): Training {
  const plan = training.active
  const next = plan ? nextSession(plan) : null
  if (!plan || !next) throw new Error('There is no session to count.')
  if (plan.pausedAt) throw new Error('Resume your Gym first.')
  if (startOf(adventure) < unlockAt(plan)) throw new Error('That adventure was before this session opened.')
  if (!meetsSession(next, plan, adventure)) throw new Error('That adventure is not enough for this session.')
  if (Object.values(plan.done).some(result => result.adventureId === adventure.id)) throw new Error('That adventure already counted.')
  const done = { ...plan.done, [next.id]: { at: Date.parse(adventure.record.finishedAt) || now, adventureId: adventure.id } }
  if (next.kind !== 'graduation') return { ...training, active: { ...plan, done } }
  const badge = training.badges[plan.gym] ?? { at: now, adventureId: adventure.id, warm: warmth({ ...plan, done }) === 1 }
  return { ...training, active: null, badges: { ...training.badges, [plan.gym]: badge } }
}

// A phone adventure started from the plan counts as soon as it is saved, if it did the session it was started for.
export function countStarted(training: Training, adventure: SavedRun, session: string | undefined, now: number): Training {
  const plan = training.active
  if (!plan || !session || nextSession(plan)?.id !== session) return training
  try { return countSession(training, adventure, now) } catch { return training }
}

export const decline = (training: Training, adventureId: string): Training =>
  training.declined.includes(adventureId) ? training : { ...training, declined: [...training.declined, adventureId].slice(-500) }

// Skips the next session: done, but no warmth. One a week, never the graduation.
export function canSkip(plan: ActivePlan): boolean {
  const next = nextSession(plan)
  if (!next || next.kind === 'graduation' || plan.pausedAt) return false
  const week = gyms[plan.gym].weeks[next.week]
  return week.filter(item => plan.done[item.id]?.skipped).length < SKIPS_PER_WEEK
}
export function skipSession(training: Training, now: number): Training {
  const plan = training.active
  if (!plan || !canSkip(plan)) throw new Error('This session cannot be skipped.')
  const next = nextSession(plan)!
  return { ...training, active: { ...plan, done: { ...plan.done, [next.id]: { at: now, adventureId: null, skipped: true } } } }
}

// Goes back `weeks` weeks from the current one: those weeks' sessions are to do again.
export function goBack(training: Training, weeks: number): Training {
  const plan = training.active
  if (!plan) return training
  const from = Math.max(0, currentWeek(plan) - weeks)
  const done = Object.fromEntries(Object.entries(plan.done).filter(([id]) => (sessionsOf(plan.gym).find(item => item.id === id)?.week ?? 0) < from))
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

// Days since the last session (or the start), not counting up to 28 days of pauses.
export function daysAway(plan: ActivePlan, now: number): number {
  const since = lastCounted(plan)?.result.at ?? plan.startedAt
  const paused = plan.pausedMs + (plan.pausedAt ? Math.min(MAX_PAUSE, Math.max(0, now - plan.pausedAt)) : 0)
  return Math.max(0, Math.floor((now - since - paused) / DAY))
}
// After time away, the weeks to go back: 1 after 10 days, 2 after 21 (never before the first week).
export function welcomeBack(plan: ActivePlan, now: number): number {
  const away = daysAway(plan, now)
  const week = currentWeek(plan)
  if (week === 0 || away < AWAY_REPEAT) return 0
  return away >= AWAY_BACK ? Math.min(2, week) : 1
}

// How warm the plan egg is: sessions done (not skipped) out of all before the graduation.
export function warmth(plan: ActivePlan): number {
  const before = sessionsOf(plan.gym).filter(item => item.kind !== 'graduation')
  return before.filter(item => plan.done[item.id] && !plan.done[item.id].skipped).length / before.length
}
export const progressOf = (plan: ActivePlan) => {
  const all = sessionsOf(plan.gym)
  return { done: all.filter(item => plan.done[item.id]).length, total: all.length }
}
