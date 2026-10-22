import { validateSnapshot } from './generated/companion.js';
import { megaForms } from './generated/catalog.js';

export type DexRecord = {
  meters: number;
  steps: number;
  shiny: boolean;
  activity?: 'walking' | 'running';
  finishedAt: string;
  startedAt?: number | null;
  elapsedSeconds?: number | null;
  hatchSeconds?: number | null;
  form?: string;
  mega?: string;
  source?: 'expedition';
};

export type Metric = 'distance' | 'elapsed' | 'hatch';
export type BestRecord = DexRecord & { route: number };
export type Snapshot = {
  schemaVersion: 1;
  capturedAt: number;
  dex: Record<string, DexRecord>;
  records: Record<string, DexRecord>;
  active: (Omit<DexRecord, 'finishedAt'> & { route: number }) | null;
  personalBests?: Partial<Record<Metric, BestRecord>>;
  expedition?: { seed: number, startedAt: number, meters: number };
};
export type Journal = {
  exportVersion: 1;
  app: 'Zepimon';
  exportedAt: string;
  receivedAt: number | null;
  snapshot: Snapshot;
  routes: string[][];
};
export type DexEntry = { name: string; normal?: DexRecord; shiny?: DexRecord };

const MAX_BYTES = 2 * 1024 * 1024;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 8.64e15;
const date = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 32 && Number.isFinite(Date.parse(value));
const pokemonName = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 80 &&
  value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value) &&
  !['__proto__', 'prototype', 'constructor'].includes(value);
const knownMegas = megaForms as Record<string, string[]>;

export function speciesName(name: string): string {
  const normal = name.replace(/^Shiny /, '');
  return Object.keys(knownMegas).find(base => knownMegas[base].includes(normal)) || normal;
}

export function parseJournal(text: string, current?: Journal | null): Journal {
  if (typeof text !== 'string' || text.length > MAX_BYTES) throw new Error('Choose a JSON export smaller than 2 MB.');
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes > MAX_BYTES) throw new Error('Choose a JSON export smaller than 2 MB.');
  }
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error('This file is not valid JSON.'); }
  if (!object(value) || value.exportVersion !== 1 || value.app !== 'Zepimon' ||
      !date(value.exportedAt) || (value.receivedAt !== null && !timestamp(value.receivedAt))) {
    throw new Error('Choose a Zepimon Export JSON file.');
  }
  if (!Array.isArray(value.routes) || !value.routes.length || value.routes.length > 512 ||
      value.routes.some((route) => !Array.isArray(route) || !route.length || route.length > 3 ||
        route.some((name) => !pokemonName(name)) || new Set(route).size !== route.length)) {
    throw new Error('This export has invalid Pokemon routes.');
  }
  const routes = (value.routes as string[][]).map((route) => [...route]);
  const snapshot = validateSnapshot(value.snapshot) as Snapshot;
  const hasRoute = (route: number) => Number.isInteger(route) && route >= 0 && route < routes.length;
  if (!timestamp(snapshot.capturedAt) || Object.keys(snapshot.records).some((key) => !hasRoute(Number(key))) ||
      (snapshot.active && !hasRoute(snapshot.active.route)) ||
      Object.values(snapshot.personalBests || {}).some((record) => !hasRoute(record.route))) {
    throw new Error('This export references a missing Pokemon route or invalid capture time.');
  }
  if (Object.keys(snapshot.dex).some((name) => !pokemonName(name.replace(/^Shiny /, '')))) {
    throw new Error('This export has an invalid Pokemon name.');
  }
  const records = [...Object.values(snapshot.dex), ...Object.values(snapshot.records),
    ...Object.values(snapshot.personalBests || {}), ...(snapshot.active ? [snapshot.active] : [])];
  if (records.some((record) =>
    (record.startedAt != null && !timestamp(record.startedAt)) ||
    (record.form !== undefined && !pokemonName(record.form)) ||
    (record.mega !== undefined && !pokemonName(record.mega)))) {
    throw new Error('This export has invalid adventure details.');
  }
  if (current && snapshot.capturedAt < current.snapshot.capturedAt) {
    throw new Error('This export is older than your saved journal. Import a newer watch sync.');
  }
  return { exportVersion: 1, app: 'Zepimon', exportedAt: value.exportedAt,
    receivedAt: value.receivedAt, snapshot, routes };
}

export function receiveCloudJournal(text: string, current: Journal | null, currentOwner: string | null, owner: string): Journal {
  if (currentOwner && currentOwner !== owner) throw new Error('This journal is linked to another account.')
  const incoming = parseJournal(text)
  if (current && incoming.snapshot.capturedAt < current.snapshot.capturedAt) return current
  // Retain previously imported normal/shiny discoveries, including before cloud linking.
  incoming.snapshot.dex = { ...current?.snapshot.dex, ...incoming.snapshot.dex }
  return parseJournal(JSON.stringify(incoming))
}

export function km(meters: number): string {
  return Number.isFinite(meters) && meters >= 0 ? (meters / 1000).toFixed(2) + ' km' : '-- km';
}

export function duration(seconds?: number | null): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '--:--:--';
  const total = Math.floor(seconds);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

export function averagePace(seconds: number | null | undefined, meters: number): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(meters) || meters <= 0) return '--:-- /km';
  const pace = Math.round(seconds / meters * 1000);
  if (!Number.isFinite(pace)) return '--:-- /km';
  return `${Math.floor(pace / 60)}:${String(pace % 60).padStart(2, '0')} /km`;
}

export function dexEntries(journal: Journal): DexEntry[] {
  const entries = new Map<string, DexEntry>();
  Object.entries(journal.snapshot.dex).forEach(([key, record]) => {
    const shiny = key.startsWith('Shiny ');
    const name = shiny ? key.slice(6) : key;
    const entry = entries.get(name) || { name };
    entry[shiny ? 'shiny' : 'normal'] = record;
    entries.set(name, entry);
  });
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function recordForm(route: string[], record: { meters: number; form?: string; mega?: string }): string {
  if (!route.length || !Number.isFinite(record.meters) || record.meters < 5000) return 'Egg';
  const earned = route.slice(0, Math.min(route.length, Math.floor(record.meters / 5000)));
  if (record.meters >= 21000) {
    const variants = knownMegas[route[route.length - 1]] || [];
    if (record.form && variants.includes(record.form)) return record.form;
    if (record.mega && variants.includes(record.mega)) return record.mega;
  }
  if (record.form && earned.includes(record.form)) return record.form;
  return earned[earned.length - 1];
}

export function hasAcquisitionDistance(name: string, record: DexRecord | undefined, routes: string[][]): boolean {
  const species = name.replace(/^Shiny /, '');
  const isMega = Object.values(knownMegas).some((forms) => forms.includes(species));
  const minimum = isMega ? 21000 : routes.reduce((lowest, route) => {
    const stage = route.indexOf(species);
    return stage < 0 ? lowest : Math.min(lowest, (stage + 1) * 5000);
  }, Infinity);
  return !!record && Number.isFinite(record.meters) && record.meters >= minimum;
}

export function personalBests(journal: Journal): Partial<Record<Metric, BestRecord>> {
  const winners: Partial<Record<Metric, BestRecord>> = {};
  const fields = { distance: 'meters', elapsed: 'elapsedSeconds', hatch: 'hatchSeconds' } as const;
  const metrics: Metric[] = ['distance', 'elapsed', 'hatch'];
  const score = (record: BestRecord, metric: Metric) => {
    const value = record[fields[metric]];
    if (typeof value !== 'number' || !Number.isFinite(value) || (metric === 'distance' ? value < 0 : value <= 0)) return null;
    if (metric === 'hatch' && (record.meters < 5000 || typeof record.elapsedSeconds !== 'number' || value > record.elapsedSeconds)) return null;
    return value;
  };
  const consider = (record: BestRecord, metric: Metric) => {
    const value = score(record, metric);
    const previous = winners[metric];
    const previousValue = previous ? score(previous, metric) : null;
    if (value !== null && (previousValue === null || (metric === 'hatch' ? value < previousValue : value > previousValue))) {
      winners[metric] = { ...record };
    }
  };
  metrics.forEach((metric) => {
    const saved = journal.snapshot.personalBests?.[metric];
    if (saved) consider(saved, metric);
  });
  Object.entries(journal.snapshot.records).forEach(([route, record]) => {
    metrics.forEach((metric) => consider({ ...record, route: Number(route) }, metric));
  });
  return winners;
}
