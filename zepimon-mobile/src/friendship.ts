import type { SavedRun } from './progress.ts'

// Buddy Friendship: the distance you walked or ran with each buddy. It is never counted up as you go: it is worked
// out from the saved adventures (watch and phone, each counted once, see allAdventures) and a log of who your buddy
// was when. An adventure belongs to the buddy you had when it started, so a watch adventure that syncs days later still
// goes to the right friend, and syncing or importing again can never add to it. Normal and Shiny are separate friends,
// matching the buddy key ('Pikachu', 'Shiny Pikachu'). The log begins when this version first opens: nobody can know who
// walked with you before that, so earlier adventures count for no one.
export type BuddyChange = { key: string | null, at: number }
// log: every buddy change, oldest first. seen: the hearts already celebrated per buddy, so a level-up is shown once.
export type Friendship = { log: BuddyChange[], seen: Record<string, number> }
export const emptyFriendship = (): Friendship => ({ log: [], seen: {} })

export type Level = { hearts: number, title: string, meters: number }
export const LEVELS: Level[] = [
  { hearts: 1, title: 'Walking pals', meters: 5000 },
  { hearts: 2, title: 'Good friends', meters: 25000 },
  { hearts: 3, title: 'Great friends', meters: 75000 },
  { hearts: 4, title: 'Trusted partners', meters: 150000 },
  { hearts: 5, title: 'Best buddies', meters: 300000 }
]
export const MAX_HEARTS = LEVELS.length
// The hearts that unlock each perk (see the Pokemon page and docs/superpowers/specs).
export const PERKS = { counter: 1, hello: 2, share: 3, cheer: 4, ribbon: 5 } as const

const validTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0

// Anything unreadable is dropped, and the log is kept in time order.
export function restoreFriendship(raw: unknown): Friendship {
  const value = raw && typeof raw === 'object' ? raw as Partial<Friendship> : {}
  const log = (Array.isArray(value.log) ? value.log : [])
    .filter((row): row is BuddyChange => !!row && typeof row === 'object' && validTime(row.at) && (row.key === null || typeof row.key === 'string'))
    .map(({ key, at }) => ({ key, at }))
    .sort((a, b) => a.at - b.at)
  const seen: Record<string, number> = {}
  if (value.seen && typeof value.seen === 'object') {
    for (const [key, hearts] of Object.entries(value.seen)) if (Number.isInteger(hearts) && hearts > 0 && hearts <= MAX_HEARTS) seen[key] = hearts
  }
  return { log, seen }
}

// Records the buddy from now on. Nothing is added when it did not change, except the first row, which starts the log.
export function logBuddy(friendship: Friendship, key: string | null, at: number): Friendship {
  const last = friendship.log.at(-1)
  if (last && last.key === key) return friendship
  return { ...friendship, log: [...friendship.log, { key, at: Math.max(at, last?.at ?? 0) }] }
}

// Who your buddy was at a time, or null before the log began or while you had none.
export function buddyAt(log: BuddyChange[], time: number): string | null {
  let key: string | null = null
  for (const row of log) {
    if (row.at > time) break
    key = row.key
  }
  return key
}

// When an adventure counts from: its start, or its finish when the start is missing or makes no sense.
function startOf({ record }: SavedRun): number | null {
  const finished = Date.parse(record.finishedAt)
  if (validTime(record.startedAt) && (!Number.isFinite(finished) || record.startedAt <= finished)) return record.startedAt
  return Number.isFinite(finished) ? finished : null
}

// The buddy an adventure was walked with, or null.
export function friendOf(adventure: SavedRun, log: BuddyChange[]): string | null {
  const at = startOf(adventure)
  return at === null ? null : buddyAt(log, at)
}

// The share image's line for the buddy an adventure was walked with, from three hearts (null below).
export function shareLine(adventure: SavedRun, log: BuddyChange[], meters: Record<string, number>): string | null {
  const key = friendOf(adventure, log)
  if (!key || heartsFor(meters[key] ?? 0) < PERKS.share) return null
  return `With ${key} · ${Math.floor((meters[key] ?? 0) / 1000)} km together ${'♥'.repeat(heartsFor(meters[key] ?? 0))}`
}

// Metres together per buddy key. adventures must already count each adventure once (allAdventures does).
export function friendshipMeters(adventures: SavedRun[], log: BuddyChange[]): Record<string, number> {
  const meters: Record<string, number> = {}
  if (!log.length) return meters
  for (const adventure of adventures) {
    const at = startOf(adventure)
    const distance = adventure.record.meters
    if (at === null || !(distance > 0)) continue
    const key = buddyAt(log, at)
    if (key) meters[key] = (meters[key] ?? 0) + distance
  }
  return meters
}

export function heartsFor(meters: number): number {
  return LEVELS.filter(level => meters >= level.meters).length
}

// Where a friendship stands: its hearts and title, and how far it is to the next level (null at Best buddies).
export function friendshipLevel(meters: number): { hearts: number, title: string, next: Level | null, toNext: number | null, progress: number } {
  const hearts = heartsFor(meters)
  const next = LEVELS[hearts] ?? null
  const from = hearts ? LEVELS[hearts - 1].meters : 0
  return { hearts, title: hearts ? LEVELS[hearts - 1].title : 'Just met', next,
    toNext: next ? next.meters - meters : null, progress: next ? Math.min(1, (meters - from) / (next.meters - from)) : 1 }
}

// The friends whose hearts went up since they were last celebrated, highest first.
export function levelUps(meters: Record<string, number>, seen: Record<string, number>): { key: string, hearts: number, title: string }[] {
  return Object.entries(meters)
    .map(([key, value]) => ({ key, hearts: heartsFor(value) }))
    .filter(({ key, hearts }) => hearts > (seen[key] ?? 0))
    .sort((a, b) => b.hearts - a.hearts || a.key.localeCompare(b.key))
    .map(({ key, hearts }) => ({ key, hearts, title: LEVELS[hearts - 1].title }))
}

// Marks every friend's current hearts as celebrated.
export function markSeen(friendship: Friendship, meters: Record<string, number>): Friendship {
  const seen = { ...friendship.seen }
  for (const [key, value] of Object.entries(meters)) seen[key] = Math.max(seen[key] ?? 0, heartsFor(value))
  return { ...friendship, seen }
}

// When friendship started counting, for "Friendship counts from ...".
export const countingSince = (friendship: Friendship): number | null => friendship.log[0]?.at ?? null

export const heartsText = (hearts: number) => '♥'.repeat(hearts) + '♡'.repeat(MAX_HEARTS - hearts)
