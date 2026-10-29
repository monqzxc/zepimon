/**
 * Reference helpers for Zepimon Legendary Expeditions.
 *
 * IMPORTANT: the existing hatdog-app/shared/expedition.js is the canonical
 * cross-device contract. Do not replace it with this file without comparing
 * the seed/hash logic byte-for-byte and preserving existing player rewards.
 */

export const EXPEDITION_GOAL_METERS = 25_000;
export const CLUE_MILESTONES_METERS = [5_000, 15_000, 25_000] as const;
export const MAX_EXPEDITION_METERS = 100_000_000;

export const LEGENDARY_SPECIES = [
  "Articuno", "Zapdos", "Moltres", "Mewtwo", "Mew",
  "Raikou", "Entei", "Suicune", "Lugia", "Ho-Oh",
  "Celebi", "Regirock", "Regice", "Registeel", "Latias",
  "Latios", "Kyogre", "Groudon", "Rayquaza", "Jirachi",
  "Deoxys", "Uxie", "Mesprit", "Azelf", "Dialga",
  "Palkia", "Heatran", "Regigigas", "Giratina", "Cresselia",
  "Phione", "Manaphy", "Darkrai", "Shaymin", "Arceus",
  "Zygarde", "Diancie", "Magearna", "Zeraora",
] as const;

export type LegendarySpecies = (typeof LEGENDARY_SPECIES)[number];

export interface Expedition {
  seed: number;
  startedAt: number;
  meters: number;
}

export interface Trail extends Expedition {
  claimed: number;
}

export interface Encounter {
  species: LegendarySpecies;
  shiny: boolean;
  index: number;
}

export interface ExpeditionProgress {
  trails: Record<string, Trail>;
  dex: Record<string, {
    meters: number;
    steps: number;
    shiny: boolean;
    form: string;
    source: "expedition";
    finishedAt: number;
  }>;
}

export function expeditionKey(expedition: Pick<Expedition, "seed" | "startedAt">): string {
  return `${expedition.startedAt}:${expedition.seed}`;
}

export function validateExpedition(value: unknown): Expedition {
  if (!value || typeof value !== "object") throw new Error("Invalid expedition");
  const candidate = value as Record<string, unknown>;
  const seed = candidate.seed;
  const startedAt = candidate.startedAt;
  const meters = candidate.meters;

  if (!Number.isInteger(seed) || (seed as number) < 0 || (seed as number) > 0xffff_ffff) {
    throw new Error("Invalid expedition seed");
  }
  if (!Number.isFinite(startedAt) || (startedAt as number) < 0) {
    throw new Error("Invalid expedition startedAt");
  }
  if (!Number.isFinite(meters) || (meters as number) < 0 || (meters as number) > MAX_EXPEDITION_METERS) {
    throw new Error("Invalid expedition meters");
  }
  return { seed: seed as number, startedAt: startedAt as number, meters: meters as number };
}

/**
 * Reference-only deterministic hash for a 1-in-50 shiny draw.
 * Compare this function with the canonical hash in hatdog-app/shared/expedition.js
 * before using it for real rewards. Never change the existing production hash.
 */
function mix32(input: number): number {
  let x = input >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

export function expeditionEncounter(trail: Expedition, index: number): Encounter {
  if (!Number.isInteger(index) || index < 0 || index >= 4000) {
    throw new Error("Invalid encounter index");
  }
  const species = LEGENDARY_SPECIES[(trail.seed + index) % LEGENDARY_SPECIES.length];
  const hashInput = (trail.seed + Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  const shiny = mix32(hashInput) % 50 === 0;
  return { species, shiny, index };
}

export function metersIntoCurrentLeg(trail: Trail): number {
  return Math.max(0, Math.min(
    EXPEDITION_GOAL_METERS,
    trail.meters - trail.claimed * EXPEDITION_GOAL_METERS,
  ));
}

export function readyEncounterCount(trail: Trail): number {
  return Math.min(4000, Math.floor(trail.meters / EXPEDITION_GOAL_METERS));
}

export function clueState(trail: Trail): { fiveKm: boolean; fifteenKm: boolean; encounterReady: boolean } {
  const legMeters = metersIntoCurrentLeg(trail);
  return {
    fiveKm: legMeters >= CLUE_MILESTONES_METERS[0],
    fifteenKm: legMeters >= CLUE_MILESTONES_METERS[1],
    encounterReady: trail.meters >= (trail.claimed + 1) * EXPEDITION_GOAL_METERS,
  };
}

/** Idempotent import: max meters, preserve claimed count. */
export function mergeTrail(previous: Trail | undefined, incoming: Expedition): Trail {
  if (!previous) return { ...validateExpedition(incoming), claimed: 0 };
  const clean = validateExpedition(incoming);
  if (previous.seed !== clean.seed || previous.startedAt !== clean.startedAt) {
    throw new Error("Cannot merge different expedition trails");
  }
  return { ...previous, meters: Math.max(previous.meters, clean.meters) };
}

/**
 * Minimal claim helper. The caller should persist the returned progress through
 * the app's existing store/persist queue.
 */
export function claimEncounter(
  progress: ExpeditionProgress,
  key: string,
  index: number,
  finishedAt = Date.now(),
): ExpeditionProgress {
  const trail = progress.trails[key];
  if (!trail || index !== trail.claimed ||
      trail.meters < (index + 1) * EXPEDITION_GOAL_METERS) {
    throw new Error("This encounter is already befriended or is not ready yet.");
  }

  const encounter = expeditionEncounter(trail, index);
  const name = encounter.shiny ? `Shiny ${encounter.species}` : encounter.species;
  const dex = {
    ...progress.dex,
    [name]: {
      meters: EXPEDITION_GOAL_METERS,
      steps: 0,
      shiny: encounter.shiny,
      form: encounter.species,
      source: "expedition" as const,
      finishedAt,
    },
  };
  return {
    trails: { ...progress.trails, [key]: { ...trail, claimed: trail.claimed + 1 } },
    dex,
  };
}
