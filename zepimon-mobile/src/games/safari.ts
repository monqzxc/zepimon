import { battleType, familyOf, isLegendary, pickWeighted, stageOf, wildPool } from './roster.ts'
import type { DexRecord, Journal } from '../journal.ts'

export const SAFARI_BALLS = 24

export type Zone = 'meadow' | 'lake' | 'desert' | 'night' | 'cave'
export type Mood = 'calm' | 'eating' | 'angry'
export type ThrowQuality = 'excellent' | 'great' | 'nice'
// The wild Pokemon that has noticed you (safari-zone.ts keeps where it stands), until it is caught or leaves. since:
// when it noticed you, which sets the ring's clock.
export type Encounter = { id: number, name: string, shiny: boolean, mood: Mood, since: number }
export type SafariCatch = { name: string, shiny: boolean }
export type SafariGame = {
  status: 'ready' | 'playing' | 'paused' | 'complete', zone: Zone, balls: number,
  encounter: Encounter | null, catches: SafariCatch[], chain: { name: string, count: number }, message: string
}

export const ZONES: Record<Zone, { label: string, habitat: string, types: string[], blurb: string }> = {
  meadow: { label: 'Sunny meadow', habitat: 'grass', types: ['normal', 'grass', 'bug', 'electric', 'fairy'], blurb: 'Grass, Bug, Normal, Electric and Fairy types' },
  lake: { label: 'Lakeside', habitat: 'water', types: ['water', 'ice'], blurb: 'Water and Ice types' },
  desert: { label: 'Sandstorm desert', habitat: 'ground', types: ['ground', 'fire', 'dragon'], blurb: 'Ground, Fire and Dragon types' },
  night: { label: 'Night forest', habitat: 'ghost', types: ['ghost', 'dark', 'poison', 'psychic'], blurb: 'Ghost, Dark, Poison and Psychic types' },
  cave: { label: 'Dark cave', habitat: 'rock', types: ['rock', 'steel', 'fighting'], blurb: 'Rock, Steel and Fighting types' }
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

// Water types live in the water: they only ever walk out onto (and swim about on) water tiles, everyone else on land.
export const livesInWater = (name: string) => battleType(name) === 'water'
export type Habitat = 'water' | 'land'
const habitatPools = Object.fromEntries(Object.entries(pools).map(([zone, pool]) => [zone, {
  water: pool.filter(wild => livesInWater(wild.name)), land: pool.filter(wild => !livesInWater(wild.name)) }])) as Record<Zone, Record<Habitat, typeof pools[Zone]>>
export const hasHabitat = (zone: Zone, habitat: Habitat) => habitatPools[zone][habitat].length > 0

// A wild Pokemon from the zone's pool, Shiny or not, as it walks out onto the map. A chained species comes back 35% of
// the time when it lives in that zone. With a habitat, only the zone's water (or land) Pokemon are rolled.
export function rollWild(game: SafariGame, zone: Zone, random = Math.random, habitat?: Habitat): SafariCatch {
  const pool = habitat ? habitatPools[zone][habitat] : pools[zone]
  const chained = game.chain.count > 0 && pool.some(wild => wild.name === game.chain.name) && random() < 0.35
  const name = chained ? game.chain.name : pickWeighted(pool, random).name
  return { name, shiny: random() < 1 / shinyOdds(game, name) }
}

// Catching happens on the map: a ring around the Pokemon shrinks from full size to 30% every RING_MS, over and over,
// and a ball thrown while it is small holds more often. A berry it likes calms it (it eats: less likely to run, a little
// harder to catch); a rock angers it (easier to catch, quicker to run).
export const RING_MS = 1400
export const BERRY_FLEE = 0.45
export const ROCK_CATCH = 1.5
const QUALITY = { excellent: 1.6, great: 1.25, nice: 1 }
const MOOD_CATCH = { calm: 1, eating: 0.85, angry: ROCK_CATCH }
const MOOD_FLEE = { calm: 1, eating: BERRY_FLEE, angry: 1.8 }
// A Pokemon that never evolves counts as a middle stage.
const stage = (name: string) => familyOf(name).length === 1 ? 2 : stageOf(name)

export function ringScale(since: number, now: number): number {
  return 1 - 0.7 * (Math.max(0, now - since) % RING_MS) / RING_MS
}

export function throwQuality(scale: number): ThrowQuality {
  return scale <= 0.45 ? 'excellent' : scale <= 0.7 ? 'great' : 'nice'
}

// A plain throw at a calm Pokemon holds about 4 times in 10 for a first stage, 1 in 4 for a middle stage, and 1 in 7
// for a final stage; a small ring and an angry Pokemon raise that.
export function catchChance(name: string, mood: Mood, quality: ThrowQuality): number {
  return Math.min(0.95, ([0.4, 0.25, 0.14][stage(name) - 1] ?? 0.25) * QUALITY[quality] * MOOD_CATCH[mood])
}

// After a missed ball, a berry or a rock, the chance it runs off.
export function fleeChance(name: string, mood: Mood): number {
  return Math.min(0.9, ([0.15, 0.25, 0.35][stage(name) - 1] ?? 0.25) * MOOD_FLEE[mood])
}

// Each species has its own taste: about two in three like the Safari Zone's berries. Fixed per species, so you can learn
// who likes them.
export function likesBerry(name: string): boolean {
  let hash = 2166136261
  for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 16777619)
  return (hash >>> 0) % 3 !== 0
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
