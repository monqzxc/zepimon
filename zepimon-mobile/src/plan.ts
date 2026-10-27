import { validatePlan } from './generated/companion.js'
import { eggs, megaChoices } from './phone-adventure.ts'
import type { Activity } from './phone-adventure.ts'

// The plan this phone shares with the watch through the cloud: the egg chosen here (eggAt is when) and the adventure
// this phone is recording, if any. The watch offers the egg on its title screen and warns before recording while the
// phone is. Validated by validatePlan from the watch contract (src/generated/companion.js) on both ends.
export type Plan = {
  egg: { family: string[], mega: string | null } | null, eggAt: number,
  phone: { family: string[], activity: Activity, startedAt: number } | null, updatedAt: number
}

export function restorePlan(raw: unknown): Plan | null {
  try { return validatePlan(raw) as Plan | null } catch { return null }
}

// Every change gets a newer time than the last, even if the clock steps back, so the cloud keeps the latest.
const stamp = (plan: Plan | null, now: number) => Math.max(now, (plan?.updatedAt ?? 0) + 1)
const empty: Plan = { egg: null, eggAt: 0, phone: null, updatedAt: 0 }

export function withEgg(plan: Plan | null, family: string[], mega: string | null, now = Date.now()): Plan {
  const at = stamp(plan, now)
  return { ...(plan ?? empty), egg: { family: [...family], mega: mega && megaChoices(family).includes(mega) ? mega : null }, eggAt: at, updatedAt: at }
}

// The chosen egg was started (on the watch, or taken over from it), so neither device offers it again.
export function withoutEgg(plan: Plan | null, now = Date.now()): Plan | null {
  if (!plan?.egg) return plan
  const at = stamp(plan, now)
  return { ...plan, egg: null, eggAt: at, updatedAt: at }
}

// Starting here uses up the chosen egg, so the watch moves on; finishing clears the phone adventure.
export function withPhone(plan: Plan | null, phone: Plan['phone'], now = Date.now()): Plan {
  const at = stamp(plan, now)
  return phone ? { ...(plan ?? empty), egg: null, eggAt: 0, phone: { ...phone, family: [...phone.family] }, updatedAt: at }
    : { ...(plan ?? empty), phone: null, updatedAt: at }
}

// The egg family a Pokemon hatches from, for "Hatch this next" in the Dex. Mega forms come from their family's egg
// with that Mega chosen. Expedition Legendaries have no egg.
export function eggOf(name: string): { family: string[], mega: string | null } | null {
  const plain = name.replace(/^Shiny /, '')
  const family = eggs.find(item => item.includes(plain)) ?? eggs.find(item => megaChoices(item).includes(plain))
  return family ? { family, mega: megaChoices(family).includes(plain) ? plain : null } : null
}
