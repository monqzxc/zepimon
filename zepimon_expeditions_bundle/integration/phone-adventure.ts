/**
 * Reference adapter for phone-only GPS adventures.
 * Prefer adapting the existing zepimon-mobile/src/phone-adventure.ts instead
 * of maintaining a parallel source of truth.
 */

import {
  EXPEDITION_GOAL_METERS,
  type Expedition,
  type Trail,
  mergeTrail,
} from "./expedition";

export interface SavedPhoneRun {
  id: string;
  startedAt: number;
  finishedAt: number;
  meters: number;
}

/** FNV-1a, matching the design described in the implementation guide. */
export function hashRunId(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Build the phone trail from saved phone runs only; unsaved/live distance is excluded. */
export function phoneTrail(runs: SavedPhoneRun[]): Expedition | null {
  const saved = runs
    .filter((run) => Number.isFinite(run.meters) && run.meters > 0 && run.finishedAt > 0)
    .sort((a, b) => a.startedAt - b.startedAt);
  if (saved.length === 0) return null;

  return {
    seed: hashRunId(saved[0].id),
    startedAt: saved[0].startedAt,
    meters: Math.min(
      100_000_000,
      saved.reduce((sum, run) => sum + run.meters, 0),
    ),
  };
}

export function withPhoneTrail(
  previous: Trail | undefined,
  runs: SavedPhoneRun[],
): Trail | undefined {
  const incoming = phoneTrail(runs);
  if (!incoming) return previous;
  if (!previous) return { ...incoming, claimed: 0 };
  return mergeTrail(previous, incoming);
}

export function expeditionNews(beforeMeters: number, afterMeters: number): string[] {
  const notices: string[] = [];
  const firstNewFive = Math.floor(beforeMeters / 5_000) < Math.floor(afterMeters / 5_000);
  const firstNewFifteen = Math.floor(beforeMeters / 15_000) < Math.floor(afterMeters / 15_000);
  const crossedEncounter = Math.floor(beforeMeters / EXPEDITION_GOAL_METERS) <
    Math.floor(afterMeters / EXPEDITION_GOAL_METERS);

  if (firstNewFive) notices.push("A mysterious clue appeared!");
  if (firstNewFifteen) notices.push("A deeper clue has been uncovered!");
  if (crossedEncounter) notices.push("Legendary encounter ready!");
  return notices;
}
