import { familyOf, isLegendary, pickWeighted, stageOf, wildPool } from './roster.ts'
import type { DexRecord, Journal } from '../journal.ts'

export const SAFARI_BALLS = 24

export type Zone = 'meadow' | 'lake' | 'mountain' | 'night'
// The wild Pokemon that has noticed you (safari-zone.ts keeps where it stands), until its battle ends.
export type Encounter = { id: number, name: string, shiny: boolean }
export type SafariCatch = { name: string, shiny: boolean }
export type SafariGame = {
  status: 'ready' | 'playing' | 'paused' | 'complete', zone: Zone, balls: number,
  encounter: Encounter | null, catches: SafariCatch[], chain: { name: string, count: number }, message: string
}

export const ZONES: Record<Zone, { label: string, habitat: string, types: string[], blurb: string }> = {
  meadow: { label: 'Sunny meadow', habitat: 'grass', types: ['normal', 'grass', 'bug', 'electric', 'fairy'], blurb: 'Grass, Bug, Normal, Electric and Fairy types' },
  lake: { label: 'Lakeside', habitat: 'water', types: ['water', 'ice'], blurb: 'Water and Ice types' },
  mountain: { label: 'Rocky mountain', habitat: 'rock', types: ['rock', 'ground', 'fighting', 'steel', 'fire', 'dragon'], blurb: 'Rock, Ground, Fighting, Steel, Fire and Dragon types' },
  night: { label: 'Night forest', habitat: 'ghost', types: ['ghost', 'dark', 'poison', 'psychic'], blurb: 'Ghost, Dark, Poison and Psychic types' }
}
const pools = Object.fromEntries(Object.entries(ZONES).map(([zone, { types }]) => [zone, wildPool(types)])) as Record<Zone, ReturnType<typeof wildPool>>

export function readySafari(zone: Zone = 'meadow', bonusBalls = 0): SafariGame {
  return { status: 'ready', zone, balls: SAFARI_BALLS + bonusBalls, encounter: null, catches: [], chain: { name: '', count: 0 }, message: '' }
}

export function startSafari(zone: Zone, bonusBalls: number): SafariGame {
  return { ...readySafari(zone, bonusBalls), status: 'playing' }
}

export const SHINY_BASE = 100

// Repeated catches of the same species raise its Shiny chance from 1 in 100 to as good as 1 in 8.
export function shinyOdds(game: SafariGame, name: string): number {
  return game.chain.name === name ? Math.max(8, SHINY_BASE - 23 * game.chain.count) : SHINY_BASE
}

// A wild Pokemon from the zone's pool, Shiny or not, as it walks out onto the map. A chained species comes back 35% of
// the time when it lives in that zone.
export function rollWild(game: SafariGame, zone: Zone, random = Math.random): SafariCatch {
  const pool = pools[zone]
  const chained = game.chain.count > 0 && pool.some(wild => wild.name === game.chain.name) && random() < 0.35
  const name = chained ? game.chain.name : pickWeighted(pool, random).name
  return { name, shiny: random() < 1 / shinyOdds(game, name) }
}

// How a Safari Pokemon battles (legendary-battle.ts): a ball thrown at full HP holds about 4 times in 10 for a first
// stage, 1 in 4 for a middle stage or a Pokemon that never evolves, and 1 in 7 for a final stage. Weakening it first
// raises that, as with a Legendary.
export function wildRules(name: string): { level: number, ease: number } {
  const stage = familyOf(name).length === 1 ? 2 : stageOf(name)
  return { level: [12, 28, 44][stage - 1] ?? 28, ease: [0.4, 0.25, 0.14][stage - 1] ?? 0.25 }
}

export function pauseSafari<T extends SafariGame>(game: T): T {
  return game.status === 'playing' ? { ...game, status: 'paused' } : game
}

export function resumeSafari<T extends SafariGame>(game: T): T {
  return game.status === 'paused' ? { ...game, status: 'playing' } : game
}

// Safari catches join the Dex on this phone with no distance, steps or time: those only come from the watch.
export type SafariDex = Record<string, DexRecord>
const safariSpecies = new Set(Object.values(pools).flat().map(wild => wild.name))

export function addSafariCatch(dex: SafariDex, name: string, shiny: boolean, now = Date.now()): SafariDex {
  const key = (shiny ? 'Shiny ' : '') + name
  if (!safariSpecies.has(name) || dex[key]) return dex
  return { ...dex, [key]: { meters: 0, steps: 0, shiny, source: 'safari', finishedAt: new Date(now).toISOString() } }
}

export function restoreSafariDex(raw: unknown): SafariDex {
  const dex: SafariDex = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return dex
  for (const [key, record] of Object.entries(raw as Record<string, DexRecord>)) {
    const name = key.replace(/^Shiny /, '')
    if (!safariSpecies.has(name) || isLegendary(name) || !record || record.source !== 'safari' || record.shiny !== key.startsWith('Shiny ') ||
        typeof record.finishedAt !== 'string' || !Number.isFinite(Date.parse(record.finishedAt))) continue
    dex[key] = { meters: 0, steps: 0, shiny: record.shiny, source: 'safari', finishedAt: record.finishedAt }
  }
  return dex
}

// Watch and expedition records win when both exist, so walking details are never hidden by a Safari catch.
export function withSafariCatches(journal: Journal | null, dex: SafariDex): Journal | null {
  if (!journal || !Object.keys(dex).length) return journal
  return { ...journal, snapshot: { ...journal.snapshot, dex: { ...dex, ...journal.snapshot.dex } } }
}
