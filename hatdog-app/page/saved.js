// Storage keys, kept apart so each screen reads and writes only what it needs. The journal (Dex, records, bests)
// changes only when an adventure is saved. The adventure in progress is small and saved every few seconds of a walk.
// The next-egg note holds what the title screen offers and the latest plan from the phone, so the title screen never
// loads the Pokemon catalog. This file must not import the catalog.
import { validatePlan } from '../shared/companion'

export const JOURNAL_KEY = 'zepimon-v1'
export const ACTIVE_KEY = 'zepimon-active'
export const NEXT_KEY = 'zepimon-next'
// A phone adventure older than this is treated as forgotten rather than still recording.
const PHONE_FRESH_MS = 12 * 3600000

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
export function phoneAdventure(next, now = Date.now()) {
  const phone = next && next.plan && next.plan.phone
  return phone && family(phone.family) && now - phone.startedAt < PHONE_FRESH_MS && phone.startedAt <= now + 300000 ? phone : null
}

// Keeps a plan received from the phone, if it is valid and newer than the one already kept.
export function withPlan(next, value) {
  const plan = validatePlan(value)
  if (!plan || (next.plan && next.plan.updatedAt >= plan.updatedAt)) return next
  return { ...next, plan }
}
