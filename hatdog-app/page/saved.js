// Storage keys, kept apart so each screen reads and writes only what it needs. The journal (Dex, records, bests)
// changes only when an adventure is saved. The adventure in progress is small and saved every few seconds of a walk.
// The next-egg note holds what the title screen offers and the latest plan from the phone, so the title screen never
// loads the Pokemon catalog. This file must not import the catalog.
// The note also keeps the adventure shared with the phone (adventure, as the cloud last had it) and a share the watch
// could not deliver yet (pendingShare), sent the next time the title screen opens.
import { validateAdventure, validatePhoneRuns, validatePlan } from '../shared/companion'

export const JOURNAL_KEY = 'zepimon-v1'
export const ACTIVE_KEY = 'zepimon-active'
export const NEXT_KEY = 'zepimon-next'
// Adventures recorded on Zepimon mobile that reached the watch, waiting for the adventure screen to add them to the
// journal (it has the catalog). after is the cloud's seq of the newest one received, so each arrives once.
export const PHONE_RUNS_KEY = 'zepimon-phone-runs'
// A phone adventure older than this is treated as forgotten rather than still recording.
const PHONE_FRESH_MS = 12 * 3600000

// The app's companion (app.js), which talks to Zepp. Zepp OS runs the app's onCreate on the app itself, not on
// getApp()._options, so the messaging ZML starts there exists only on the app; a screen calling getApp()._options
// reached no messaging, and every share, sync and plan request it made failed silently. app.js leaves itself in
// globalData, which both share, as ZML does with its messaging. Where they are one object, it is the same.
export function companionApp() {
  const options = getApp()._options
  return (options.globalData && options.globalData.companion) || options
}

export function readKey(storage, key) {
  const value = storage.getItem(key)
  return value === undefined ? null : value
}

// The adventure in progress, from its own key or, after an update, from an older version's journal.
export function readActive(storage, journal) {
  const active = readKey(storage, ACTIVE_KEY)
  if (active && typeof active === 'object') return active
  return journal && journal.active ? journal.active : null
}

export function readNext(storage) {
  const next = readKey(storage, NEXT_KEY)
  return next && typeof next === 'object' ? next : {}
}

const family = (value) => Array.isArray(value) && value.length >= 1 && value.length <= 3 &&
  value.every((name) => typeof name === 'string' && name.length > 0 && name.length <= 80)

// The egg to offer: the phone's chosen egg until the watch starts it, then the watch's own pick or suggestion.
export function nextEgg(next) {
  const plan = next && next.plan
  if (plan && plan.egg && family(plan.egg.family) && plan.eggAt > (next.usedPlanAt || 0)) {
    return { family: plan.egg.family, mega: plan.egg.mega || null, from: 'phone', planAt: plan.eggAt }
  }
  if (next && next.egg && family(next.egg.family)) return { family: next.egg.family, mega: next.egg.mega || null, from: next.egg.from || 'watch' }
  return null
}

// The adventure the phone is recording, as of the last plan the watch received.
// The shared adventure while the phone records it: it can be continued here. Older phone versions only say that
// they are recording (plan.phone).
export function phoneAdventure(next, now = Date.now()) {
  const shared = next && next.adventure
  if (shared) return !shared.ended && shared.device === 'phone' && now - shared.at < PHONE_FRESH_MS && shared.at <= now + 300000 ? shared : null
  const phone = next && next.plan && next.plan.phone
  return phone && family(phone.family) && now - phone.startedAt < PHONE_FRESH_MS && phone.startedAt <= now + 300000 ? phone : null
}

// Keeps the shared adventure as the cloud has it now (null when none).
export function withShared(next, value) {
  const adventure = validateAdventure(value)
  return JSON.stringify(adventure) === JSON.stringify(next.adventure || null) ? next : { ...next, adventure }
}

// Forgets a share once the cloud has it, unless a newer one is waiting.
export function withoutPending(next, sent) {
  const pending = next.pendingShare
  return pending && sent && pending.id === sent.id && pending.at <= sent.at ? { ...next, pendingShare: null } : next
}

export function readPhoneRuns(storage) {
  const value = readKey(storage, PHONE_RUNS_KEY)
  return { after: value && Number.isSafeInteger(value.after) && value.after > 0 ? value.after : 0,
    pending: value && Array.isArray(value.pending) ? value.pending : [] }
}

// Adds the phone adventures that just arrived to the waiting ones, each once.
export function withReceivedRuns(saved, list) {
  const runs = validatePhoneRuns(list)
  if (!runs.length) return saved
  const waiting = {}
  saved.pending.forEach((run) => { waiting[run.id] = true })
  return { after: runs.reduce((after, run) => Math.max(after, run.seq), saved.after),
    pending: saved.pending.concat(runs.filter((run) => !waiting[run.id])).slice(-200) }
}

// Keeps a plan received from the phone, if it is valid and newer than the one already kept.
export function withPlan(next, value) {
  const plan = validatePlan(value)
  if (!plan || (next.plan && next.plan.updatedAt >= plan.updatedAt)) return next
  return { ...next, plan }
}
