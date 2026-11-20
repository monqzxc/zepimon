import type { DexRecord, Journal } from './journal.ts'
import type { Progress } from './progress.ts'
import { expeditionJournal } from './expeditions.ts'
import type { ExpeditionProgress } from './expeditions.ts'
import { allAdventures } from './adventures.ts'
import { withPhoneRuns } from './phone-adventure.ts'
import type { PhoneRun } from './phone-adventure.ts'
import { withSafariCatches } from './games/safari.ts'
import type { SafariDex } from './games/safari.ts'
import { friendshipMeters } from './friendship.ts'
import type { Friendship } from './friendship.ts'
import type { Training } from './training.ts'

// What the phone's collection is built from. The store keeps more; these are the parts the helpers below read, so they
// are pure and tested without React.
export type CollectionState = {
  journal: Journal | null, expeditions: ExpeditionProgress, safari: SafariDex, phoneRuns: PhoneRun[],
  progress: Progress, friendship: Friendship, training: Training
}

// Watch records with this phone's own adventures layered on top; missions and Expeditions count both.
export const walkedJournal = (saved: Pick<CollectionState, 'journal' | 'expeditions' | 'phoneRuns'>) =>
  expeditionJournal(withPhoneRuns(saved.journal, saved.phoneRuns), saved.expeditions)
// Everything shown in the Dex: watch and phone adventures and expedition friends, plus Safari catches (which also work before any import).
export function collectionOf(saved: Pick<CollectionState, 'journal' | 'expeditions' | 'safari' | 'phoneRuns'>): { journal: Journal | null, dex: Record<string, DexRecord> } {
  const journal = withSafariCatches(walkedJournal(saved), saved.safari)
  return { journal, dex: journal?.snapshot.dex ?? { ...saved.safari } }
}
export const friendsOf = (saved: Pick<CollectionState, 'progress' | 'phoneRuns' | 'friendship'>) =>
  friendshipMeters(allAdventures(saved.progress, saved.phoneRuns), saved.friendship.log)
export const most = (friends: Record<string, number>) => Math.max(0, ...Object.values(friends))
// Figures outside progress that missions count (src/progress.ts MissionExtras).
export const gymExtras = (training: Training) => {
  const badges = Object.values(training.badges)
  return { gymBadges: badges.length, warmWelcome: badges.some(badge => badge?.warm) }
}
export const extrasOf = (saved: CollectionState) => ({ bestFriend: most(friendsOf(saved)), ...gymExtras(saved.training) })
