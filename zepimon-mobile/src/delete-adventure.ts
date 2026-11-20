import type { BestRecord, DexRecord, Journal, Metric } from './journal.ts'
import { earnedForms, phoneTrail } from './phone-adventure.ts'
import type { TrailBase } from './phone-adventure.ts'
import { missions } from './progress.ts'
import { collectionOf, extrasOf, walkedJournal } from './collection.ts'
import type { CollectionState } from './collection.ts'
import { baselineFrom, uncountAdventure } from './training.ts'
import type { Training } from './training.ts'
import { QUEST_SESSIONS, questSessions, trailPermits } from './expedition-quest.ts'
import type { Quest } from './expedition-quest.ts'
import { unlockedEncounters } from './expeditions.ts'
import type { ExpeditionProgress } from './expeditions.ts'
import type { Progress, SavedRun } from './progress.ts'
import { allAdventures } from './adventures.ts'
import { bestEffort, runningTickets } from './running.ts'
import { expeditionKey } from './generated/expedition.js'

export type { TrailBase }

// Deleting an adventure recorded on this phone (see docs/superpowers/specs/2026-11-19-delete-adventure-design.md). The phone
// shares each run with the watch through the cloud, and the watch keeps it in its own journal, so a deleted run is
// remembered by its key and filtered out of every watch journal that comes back.

// The key src/adventures.ts already uses for a run: its family and when it finished.
export const runKey = (family: string[], finishedAt: string): string => `${family.join('>')}@${finishedAt}`
const finishOf = (key: string) => key.slice(key.lastIndexOf('@') + 1)

const MAX_DELETED = 500
const MAX_KEY = 200
export function restoreDeleted(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((key): key is string => typeof key === 'string' && key.length <= MAX_KEY).slice(-MAX_DELETED)
}

// The trail's seed (a 32-bit whole number) and start time as saved, or null when either is not one.
export function restoreTrailBase(raw: unknown): TrailBase | null {
  if (!raw || typeof raw !== 'object') return null
  const { seed, startedAt } = raw as Partial<TrailBase>
  return Number.isSafeInteger(seed) && seed! >= 0 && seed! <= 0xffffffff && Number.isSafeInteger(startedAt) && startedAt! >= 0 && startedAt! <= 8.64e15
    ? { seed: seed!, startedAt: startedAt! } : null
}

// The journal without the deleted runs: from the watch's latest record per family, its recent log, its personal bests
// and its Dex. Dex records carry no family, so they go by finish time alone. The watch overwrites a form's Dex record with
// each newer adventure that reached it, so a Pokemon that an older adventure in history (the Journal runs) also earned
// keeps that adventure's record instead of vanishing. Returns the same journal when nothing goes.
export function withoutDeleted(journal: Journal, deleted: string[], history: SavedRun[] = []): Journal {
  if (!deleted.length) return journal
  const keys = new Set(deleted)
  const finishes = new Set(deleted.map(finishOf))
  const gone = (route: number, finishedAt: string) => keys.has(runKey(journal.routes[route] ?? [], finishedAt))
  const { snapshot } = journal
  const records = Object.fromEntries(Object.entries(snapshot.records).filter(([route, record]) => !gone(Number(route), record.finishedAt)))
  const dropped = Object.keys(snapshot.dex).filter(name => finishes.has(snapshot.dex[name].finishedAt))
  const dex: Record<string, DexRecord> = Object.fromEntries(Object.entries(snapshot.dex).filter(([, record]) => !finishes.has(record.finishedAt)))
  for (const name of dropped) {
    const replacement = standIn(name, history, keys)
    if (replacement) dex[name] = replacement
  }
  const recent = snapshot.recent?.filter(record => !gone(record.route, record.finishedAt))
  const bests = Object.entries(snapshot.personalBests ?? {}).filter(([, record]) => !gone(record.route, record.finishedAt))
  const changed = Object.keys(records).length !== Object.keys(snapshot.records).length ||
    dropped.length > 0 ||
    (recent?.length ?? 0) !== (snapshot.recent?.length ?? 0) || bests.length !== Object.keys(snapshot.personalBests ?? {}).length
  if (!changed) return journal
  const next: Journal['snapshot'] = { ...snapshot, records: records as Record<string, DexRecord>, dex: dex as Record<string, DexRecord> }
  if (recent) next.recent = recent
  if (snapshot.personalBests) next.personalBests = Object.fromEntries(bests) as Partial<Record<Metric, BestRecord>>
  return { ...journal, snapshot: next }
}

// The newest adventure in history, not deleted, that reached the Dex form named by this key ("Shiny " first for a Shiny),
// as the record the watch would have kept for it.
function standIn(name: string, history: SavedRun[], deleted: Set<string>): DexRecord | null {
  const shiny = name.startsWith('Shiny '), form = shiny ? name.slice(6) : name
  let best: SavedRun | null = null
  for (const run of history) {
    if (run.record.shiny !== shiny || deleted.has(runKey(run.family, run.record.finishedAt)) ||
        !earnedForms(run.family, run.record.meters, run.record.mega ?? null).includes(form)) continue
    if (!best || Date.parse(run.record.finishedAt) > Date.parse(best.record.finishedAt)) best = run
  }
  if (!best) return null
  const { form: _form, mega: _mega, ...record } = best.record
  return record
}

// What deleting needs from the store's saved state.
export type DeleteState = CollectionState & { buddy: string | null, deleted: string[], trailBase: TrailBase | null, quest: Quest }
export class DeleteRefused extends Error {}

// The ids of the non-weekly missions already completed by the data in this state.
const satisfied = (state: CollectionState, now: number) => new Set(missions(walkedJournal(state), state.progress, now, extrasOf(state))
  .filter(mission => !mission.weekly && mission.value >= mission.goal).map(mission => mission.id))

// Deletes a phone adventure and takes back what it fed: its place in the Journal, Dex, bests and trail, the badges only it
// earned, its Gym sessions and a buddy only it gave. The state given is never changed.
export function deleteRun<S extends DeleteState>(state: S, id: string, now: number): S {
  const run = state.phoneRuns.find(item => item.id === id)
  if (!run) throw new Error('That adventure is not on this phone.')
  const key = runKey(run.family, run.record.finishedAt)
  const sameRun = (item: { family: string[], record: { finishedAt: string } }) => runKey(item.family, item.record.finishedAt) === key
  const ids = [run.id, ...state.progress.runs.filter(sameRun).map(item => item.id)]
  const deleted = [...state.deleted.filter(item => item !== key), key].slice(-MAX_DELETED)
  const phoneRuns = state.phoneRuns.filter(item => item.id !== id)
  // The trail keeps its key whichever adventure seeded it, and loses the metres of this one.
  const trail = phoneTrail(state.phoneRuns, state.trailBase)!
  const trailBase = { seed: trail.seed, startedAt: trail.startedAt }
  const trailKey = expeditionKey(trail)
  const old = state.expeditions.trails[trailKey]
  const expeditions = old ? { ...state.expeditions, trails: { ...state.expeditions.trails,
    [trailKey]: { ...old, meters: Math.max(0, old.meters - run.record.meters) } } } : state.expeditions
  const progress = { ...state.progress, runs: state.progress.runs.filter(item => !sameRun(item)) }
  const journal = state.journal && withoutDeleted(state.journal, deleted, progress.runs)
  const effort = bestEffort(allAdventures(state.progress, state.phoneRuns, now).find(item => ids.includes(item.id))!, 5000)
  const training = forgetEffort(uncountAdventure(state.training, ids), effort, allAdventures(progress, phoneRuns, now), now)
  const after = { ...state, journal, phoneRuns, expeditions, training, progress }
  // A badge goes only when this adventure was what completed it.
  const before = satisfied(state, now), still = satisfied(after, now)
  const unlocked = { ...progress.unlocked }
  // A badge unlocked before this adventure finished was not earned by it.
  for (const mission of before) if (!still.has(mission) && !(unlocked[mission] < Date.parse(run.record.finishedAt))) delete unlocked[mission]
  const buddy = state.buddy && collectionOf(after).dex[state.buddy] ? state.buddy : null
  const settled = { ...after, progress: { ...progress, unlocked } }
  const quest = revokePermits(state, settled, now)
  // Taking permits back must not leave an encounter that was already met without what opened it: the saved trails would
  // not load. Nothing is changed in that case.
  for (const [trailKey, trail] of Object.entries(expeditions.trails)) {
    if (trail.claimed > unlockedEncounters(trail, trailPermits(quest, trailKey))) {
      throw new DeleteRefused('This adventure helped open a Legendary encounter you already met, so it cannot be deleted.')
    }
  }
  return { ...settled, quest, buddy, deleted, trailBase }
}

// A paced Gym's zones come from the fastest 5 km in saved adventures, and a Speed Gym badge keeps its fastest trial time:
// when either was the deleted adventure's 5 km (`effort`), the zones come from the fastest 5 km left (a Speed Gym with none
// runs its entry trial again) and the badge loses that time. Anything that came from another run stays.
function forgetEffort(training: Training, effort: number | null, remaining: Parameters<typeof baselineFrom>[0], now: number): Training {
  if (effort === null) return training
  const same = (seconds: number | undefined | null) => typeof seconds === 'number' && Math.abs(seconds - effort) < 1
  let next = training
  const plan = training.active
  if (plan && same(plan.baseline5k)) {
    const baseline5k = baselineFrom(remaining, now)
    next = { ...next, active: { ...plan, baseline5k, entry: plan.gym === 'speed-gym' && baseline5k === null ? true : plan.entry } }
  }
  const timed = Object.entries(training.badges).filter(([, badge]) => same(badge?.time))
  if (timed.length) {
    const badges = { ...next.badges }
    for (const [gym, badge] of timed) {
      const { time: _time, ...rest } = badge!
      badges[gym as keyof typeof badges] = rest
    }
    next = { ...next, badges }
  }
  return next
}

// How many quests the saved adventures complete when played from the first trail: three saved 1 km walks or runs each, the
// next quest starting just after the third of the last. since is where the quest after those starts, null for the first.
function replayQuests(quest: Quest, progress: Progress, expeditions: ExpeditionProgress, now: number, limit: number): { done: number, since: number | null } {
  let since: number | null = null, done = 0
  while (done < limit) {
    const sessions = questSessions({ ...quest, since }, progress, expeditions, now)
    if (sessions.length < QUEST_SESSIONS) break
    since = Date.parse(sessions[QUEST_SESSIONS - 1].record.finishedAt) + 1
    done++
  }
  return { done, since }
}

// Recounts every way a permit was earned against what is left, and takes back what this deletion lost: first from the
// unspent permits, then from encounters a permit had opened. The shrine challenge flag is left as it was.
function revokePermits(before: DeleteState, after: DeleteState, now: number): Quest {
  const { quest } = before
  const tickets = runningTickets(allAdventures(after.progress, after.phoneRuns)).length
  const badges = Object.keys(after.training.badges).length
  const wasDone = replayQuests(quest, before.progress, before.expeditions, now, quest.number).done
  const replayed = replayQuests(quest, after.progress, after.expeditions, now, quest.number)
  const lostQuests = Math.max(0, wasDone - replayed.done)
  const running = Math.min(quest.running, tickets), gyms = Math.min(quest.gyms, badges)
  const lost = lostQuests + (quest.running - running) + (quest.gyms - gyms)
  // A quest that later runs refilled now uses one more run, so the next quest starts after it (else that run counts twice).
  const since = !lostQuests && quest.number > 0 && replayed.done === quest.number && replayed.since !== null && replayed.since > (quest.since ?? 0)
    ? replayed.since : null
  if (!lost) return since === null ? quest : { ...quest, since }
  const fromPermits = Math.min(quest.permits, lost)
  let rest = lost - fromPermits
  const unlocks = { ...quest.unlocks }
  // Trails with an encounter opened by a permit and not yet met go first, so a met encounter keeps what opened it; the
  // newest trail first (a key is its start time, then its seed). Only then anything else, which the guard may refuse.
  const newestFirst = Object.keys(unlocks).sort((a, b) => Number.parseInt(b) - Number.parseInt(a))
  const room = (key: string) => {
    const trail = after.expeditions.trails[key]
    return trail ? Math.max(0, unlockedEncounters(trail, unlocks[key]) - trail.claimed) : 0
  }
  for (const limit of [room, () => Infinity]) {
    for (const key of newestFirst) {
      if (!unlocks[key]) continue
      const take = Math.min(rest, unlocks[key], limit(key))
      rest -= take
      if (unlocks[key] - take > 0) unlocks[key] -= take
      else delete unlocks[key]
    }
  }
  return { ...quest, running, gyms, permits: quest.permits - fromPermits, unlocks,
    ...lostQuests ? { number: quest.number - lostQuests, since: replayed.done ? replayed.since : null } : since === null ? {} : { since } }
}
