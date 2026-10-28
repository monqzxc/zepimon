import { familyOf, isLegendary, pickWeighted, stageOf, wildPool } from './roster.ts'
import type { DexRecord, Journal } from '../journal.ts'

export const SAFARI_DURATION = 120000
export const SAFARI_BALLS = 12
export const PATCHES = 9
export const RUSTLE_MS = 2400
export const RING_MS = 1400
export const BAIT_FLEE = 0.45
export const ROCK_CATCH = 1.5

export type Zone = 'meadow' | 'lake' | 'mountain' | 'night'
export type Mood = 'calm' | 'eating' | 'angry'
export type ThrowQuality = 'excellent' | 'great' | 'nice'
export type Encounter = { name: string, shiny: boolean, mood: Mood, since: number }
export type SafariCatch = { name: string, shiny: boolean }
export type SafariGame = {
  status: 'ready' | 'playing' | 'paused' | 'complete', zone: Zone, elapsed: number, lastTick: number, balls: number,
  rustle: number, nextRustle: number, encounter: Encounter | null, catches: SafariCatch[],
  chain: { name: string, count: number }, message: string, lastThrow: ThrowQuality | null
}

export const ZONES: Record<Zone, { label: string, habitat: string, types: string[], blurb: string }> = {
  meadow: { label: 'Sunny meadow', habitat: 'grass', types: ['normal', 'grass', 'bug', 'electric', 'fairy'], blurb: 'Grass, Bug, Normal, Electric and Fairy types' },
  lake: { label: 'Lakeside', habitat: 'water', types: ['water', 'ice'], blurb: 'Water and Ice types' },
  mountain: { label: 'Rocky mountain', habitat: 'rock', types: ['rock', 'ground', 'fighting', 'steel', 'fire', 'dragon'], blurb: 'Rock, Ground, Fighting, Steel, Fire and Dragon types' },
  night: { label: 'Night forest', habitat: 'ghost', types: ['ghost', 'dark', 'poison', 'psychic'], blurb: 'Ghost, Dark, Poison and Psychic types' }
}
const pools = Object.fromEntries(Object.entries(ZONES).map(([zone, { types }]) => [zone, wildPool(types)])) as Record<Zone, ReturnType<typeof wildPool>>
const QUALITY = { excellent: 1.6, great: 1.25, nice: 1 }
const MOOD_CATCH = { calm: 1, eating: 0.85, angry: ROCK_CATCH }
const MOOD_FLEE = { calm: 1, eating: BAIT_FLEE, angry: 1.8 }

export function readySafari(zone: Zone = 'meadow', bonusBalls = 0): SafariGame {
  return { status: 'ready', zone, elapsed: 0, lastTick: 0, balls: SAFARI_BALLS + bonusBalls, rustle: -1, nextRustle: 0,
    encounter: null, catches: [], chain: { name: '', count: 0 }, message: '', lastThrow: null }
}

export function startSafari(zone: Zone, bonusBalls: number, now: number, random = Math.random): SafariGame {
  return { ...readySafari(zone, bonusBalls), status: 'playing', lastTick: now, rustle: Math.floor(random() * PATCHES), nextRustle: RUSTLE_MS,
    message: 'Watch for rustling grass.' }
}

// The ring shrinks from full size to 30% every RING_MS, then starts over. Smaller rings make better throws.
export function ringScale(game: SafariGame): number {
  if (!game.encounter) return 1
  return 1 - 0.7 * ((game.elapsed - game.encounter.since) % RING_MS) / RING_MS
}

export function throwQuality(scale: number): ThrowQuality {
  return scale <= 0.45 ? 'excellent' : scale <= 0.7 ? 'great' : 'nice'
}

export const SHINY_BASE = 100

// Repeated catches of the same species raise its Shiny chance from 1 in 100 to as good as 1 in 8.
export function shinyOdds(game: SafariGame, name: string): number {
  return game.chain.name === name ? Math.max(8, SHINY_BASE - 23 * game.chain.count) : SHINY_BASE
}

export function catchChance(name: string, mood: Mood, quality: ThrowQuality): number {
  const single = familyOf(name).length === 1
  const base = single ? 0.22 : [0.36, 0.22, 0.12][stageOf(name) - 1]
  return Math.min(0.95, base * QUALITY[quality] * MOOD_CATCH[mood])
}

export function fleeChance(name: string, mood: Mood): number {
  const single = familyOf(name).length === 1
  return Math.min(0.9, (single ? 0.25 : [0.15, 0.25, 0.35][stageOf(name) - 1]) * MOOD_FLEE[mood])
}

export function tickSafari(game: SafariGame, now: number, random = Math.random): SafariGame {
  if (game.status !== 'playing' || now <= game.lastTick) return game
  const elapsed = Math.min(SAFARI_DURATION, game.elapsed + now - game.lastTick)
  if (elapsed >= SAFARI_DURATION) return { ...game, status: 'complete', elapsed, lastTick: now, encounter: null, rustle: -1, message: 'Time is up!' }
  if (game.encounter || elapsed < game.nextRustle) return { ...game, elapsed, lastTick: now }
  const choice = Math.floor(random() * (PATCHES - 1))
  const rustle = game.rustle >= 0 && choice >= game.rustle ? choice + 1 : choice
  return { ...game, elapsed, lastTick: now, rustle, nextRustle: elapsed + RUSTLE_MS }
}

export function approachPatch(game: SafariGame, patch: number, now: number, random = Math.random): SafariGame {
  const next = tickSafari(game, now, random)
  if (next.status !== 'playing' || next.encounter || patch !== next.rustle) return next
  return meetWild(next, next.zone, random)
}

// A wild Pokemon from the zone's pool. A chained species comes back 35% of the time when it lives in that zone.
export function meetWild(game: SafariGame, zone: Zone, random = Math.random): SafariGame {
  if (game.status !== 'playing' || game.encounter) return game
  const pool = pools[zone]
  const chained = game.chain.count > 0 && pool.some(wild => wild.name === game.chain.name) && random() < 0.35
  const name = chained ? game.chain.name : pickWeighted(pool, random).name
  const shiny = random() < 1 / shinyOdds(game, name)
  return { ...game, zone, encounter: { name, shiny, mood: 'calm', since: game.elapsed }, lastThrow: null,
    message: `A wild ${shiny ? 'Shiny ' : ''}${name} appeared!` }
}

function leave(game: SafariGame, message: string, chain = game.chain): SafariGame {
  return { ...game, encounter: null, rustle: -1, nextRustle: game.elapsed + 700, message, chain,
    status: game.balls > 0 ? game.status : 'complete' }
}

// A failed throw, bait or rock gives the Pokemon a chance to run. Fleeing breaks a Shiny chain on that species.
function fleeCheck(game: SafariGame, random: () => number, stayed: string): SafariGame {
  const encounter = game.encounter!
  if (random() < fleeChance(encounter.name, encounter.mood)) {
    return leave(game, `${encounter.name} ran away!`, game.chain.name === encounter.name ? { name: '', count: 0 } : game.chain)
  }
  return game.balls > 0 ? { ...game, message: stayed } : leave(game, `Out of Safari Balls! ${encounter.name} wandered off.`)
}

export function throwBall(game: SafariGame, now: number, random = Math.random): SafariGame {
  const next = tickSafari(game, now, random)
  const encounter = next.encounter
  if (next.status !== 'playing' || !encounter || next.balls <= 0) return next
  const quality = throwQuality(ringScale(next))
  const thrown = { ...next, balls: next.balls - 1, lastThrow: quality }
  if (random() < catchChance(encounter.name, encounter.mood, quality)) {
    const chain = next.chain.name === encounter.name ? { name: encounter.name, count: next.chain.count + 1 } : { name: encounter.name, count: 1 }
    return leave({ ...thrown, catches: [...next.catches, { name: encounter.name, shiny: encounter.shiny }] },
      `Gotcha! ${encounter.shiny ? 'Shiny ' : ''}${encounter.name} was caught!`, chain)
  }
  return fleeCheck(thrown, random, `Oh no! ${encounter.name} broke free!`)
}

export function throwBait(game: SafariGame, now: number, random = Math.random): SafariGame {
  const next = tickSafari(game, now, random)
  if (next.status !== 'playing' || !next.encounter) return next
  return fleeCheck({ ...next, encounter: { ...next.encounter, mood: 'eating' }, lastThrow: null }, random,
    `${next.encounter.name} is eating. It is less likely to run, but harder to catch.`)
}

export function throwRock(game: SafariGame, now: number, random = Math.random): SafariGame {
  const next = tickSafari(game, now, random)
  if (next.status !== 'playing' || !next.encounter) return next
  return fleeCheck({ ...next, encounter: { ...next.encounter, mood: 'angry' }, lastThrow: null }, random,
    `${next.encounter.name} is angry! It is easier to catch, but more likely to run.`)
}

export function runAway(game: SafariGame, now: number): SafariGame {
  const next = tickSafari(game, now)
  return next.status === 'playing' && next.encounter ? leave(next, 'You got away safely.') : next
}

export function pauseSafari(game: SafariGame, now: number): SafariGame {
  const next = tickSafari(game, now)
  return next.status === 'playing' ? { ...next, status: 'paused' } : next
}

export function resumeSafari(game: SafariGame, now: number): SafariGame {
  return game.status === 'paused' ? { ...game, status: 'playing', lastTick: now } : game
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
