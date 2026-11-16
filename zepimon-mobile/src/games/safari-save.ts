import { ZONES } from './safari.ts'
import type { Encounter, Mood, SafariCatch, Zone } from './safari.ts'
import { HELPERS, ROAM_MS, SPAWN_MS, areaAt, isRoamable, isWalkable, pointKey, safariMap, startZone, terrain, tileAt } from './safari-zone.ts'
import type { Direction, Help, Point, SafariMap, Wild, ZoneGame } from './safari-zone.ts'

// Continuing a Safari Zone round later, even after the phone restarts. A round is saved while it can still be played
// (steps and Safari Balls left) and dropped once it ends. Saved rounds are checked piece by piece when they come back,
// so a round saved by an older version, or on a map that has since changed, loses what no longer fits (or is not
// offered at all if the trainer can't stand where they were) instead of breaking the game.
export const SAVE_VERSION = 1
export type SavedRound = { version: typeof SAVE_VERSION, savedAt: number, game: ZoneGame }

export function canSave(game: ZoneGame | null): game is ZoneGame {
  return !!game && game.status !== 'complete' && game.steps > 0 && game.balls > 0
}

// What is kept: everything but what only means something on the screen it was played on (a throw being played out, the
// gate question). savedAt is the wall clock, for the record.
export function saveRound(game: ZoneGame, savedAt: number): SavedRound {
  return { version: SAVE_VERSION, savedAt, game: { ...game, act: null, prompt: null } }
}

const DIRECTIONS: readonly Direction[] = ['north', 'south', 'west', 'east']
const MOODS: readonly Mood[] = ['calm', 'eating', 'angry']
const HELPS = Object.values(HELPERS).map(helper => helper.help)
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const whole = (value: unknown, min = 0): value is number => Number.isInteger(value) && (value as number) >= min
const named = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length < 40
const facing = (value: unknown): value is Direction => DIRECTIONS.includes(value as Direction)
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : []

function point(value: unknown, map: SafariMap): Point | null {
  const raw = record(value)
  return raw && whole(raw.x) && whole(raw.y) && (raw.x as number) < map.cols && (raw.y as number) < map.rows ? { x: raw.x as number, y: raw.y as number } : null
}

// A saved round, ready to play at `now`: the game's clocks (when Pokemon next stroll or walk out, the aiming ring) start
// again from now, since the phone's clock may have restarted. Null when there is nothing playable to continue.
export function restoreRound(raw: unknown, now: number, map = safariMap): ZoneGame | null {
  const saved = record(raw)
  const game = record(saved?.game)
  if (!saved || saved.version !== SAVE_VERSION || !game) return null
  const at = point(game.at, map)
  if (!at || !whole(game.steps, 1) || !whole(game.balls, 1) || !whole(game.taken) || !facing(game.facing) || !(String(game.zone) in ZONES)) return null
  const helps = HELPS.filter(help => list(game.helps).includes(help)) as Help[]
  const land = terrain({ helps, at }, map)
  if (!isWalkable(tileAt(at, land))) return null
  const buddy = point(game.buddy, map)
  const buddyOk = !!buddy && isWalkable(tileAt(buddy, land)) && Math.abs(buddy.x - at.x) + Math.abs(buddy.y - at.y) <= 2
  const items = [...new Set(list(game.items).filter((key): key is string => typeof key === 'string' &&
    /^\d+,\d+$/.test(key) && tileAt({ x: Number(key.split(',')[0]), y: Number(key.split(',')[1]) }, map) === 'o'))]
  const catches: SafariCatch[] = list(game.catches).flatMap(item => {
    const raw = record(item)
    return raw && named(raw.name) && typeof raw.shiny === 'boolean' ? [{ name: raw.name, shiny: raw.shiny }] : []
  })
  const chainRaw = record(game.chain)
  const chain = chainRaw && typeof chainRaw.name === 'string' && whole(chainRaw.count) && (chainRaw.count === 0) === !chainRaw.name
    ? { name: chainRaw.name, count: chainRaw.count as number } : { name: '', count: 0 }
  const taken = new Set([pointKey(at), ...(buddyOk ? [pointKey(buddy!)] : [])])
  const wilds: Wild[] = list(game.wilds).flatMap(item => {
    const raw = record(item)
    const spot = point(raw?.at, map)
    if (!raw || !spot || !whole(raw.id, 1) || !named(raw.name) || typeof raw.shiny !== 'boolean' || !facing(raw.facing) || !whole(raw.steps) ||
        !isRoamable(tileAt(spot, map)) || taken.has(pointKey(spot))) return []
    taken.add(pointKey(spot))
    return [{ id: raw.id as number, name: raw.name, shiny: raw.shiny, at: spot, facing: raw.facing, steps: raw.steps as number, moveAt: now + ROAM_MS }]
  })
  const met = record(game.encounter)
  const foe = met ? wilds.find(wild => wild.id === met.id && wild.name === met.name && wild.shiny === met.shiny) : undefined
  const encounter: Encounter | null = met && foe
    ? { id: foe.id, name: foe.name, shiny: foe.shiny, mood: MOODS.includes(met.mood as Mood) ? met.mood as Mood : 'calm', since: now } : null
  const steps = game.steps as number, balls = game.balls as number
  return { ...startZone('gate', 0, now, map), status: 'playing', zone: game.zone as Zone, balls, encounter, catches, chain,
    message: `Welcome back! You have ${steps} steps and ${balls} Safari Balls left.`,
    at, facing: game.facing, buddy: buddyOk ? buddy! : at, buddyFacing: facing(game.buddyFacing) ? game.buddyFacing : game.facing,
    steps, taken: game.taken as number, items, helps, wilds, spawned: Math.max(whole(game.spawned) ? game.spawned as number : 0, ...wilds.map(wild => wild.id)),
    spawnAt: now + SPAWN_MS, area: areaAt(at, map), prompt: null, act: null }
}
