import { battleType, cardKey, eggMovesOf, isLegendary, pickWeighted, stageOf, wildPool } from './roster.ts'
import type { TeamCard } from './roster.ts'
import { TRAIL_MAPS } from './trails.ts'
import { BLAST_DAMAGE, BLAST_REACH, BOSS_CHARGE, BOSS_DASH, BOSS_EVERY, BOSS_FIRST, DASH_MS, HEAL_SHARE, SHIELD_MS, SHIELD_SHARE, STUN_MS, STUN_REACH,
  SUMMONS, bossMoves } from './boss.ts'
import type { BossMove } from './boss.ts'
import { BOSS_MAX, CALM_MS, CONDITIONS, DOT, LASTS, MIN_PACE, ORDER, PACE, REFRESHES, immunities, rollCondition } from './status.ts'
import type { Condition } from './status.ts'

// One engine for Route Guard (five lanes, enemies walk down) and Trail Defense (enemies follow a path).
// Positions are in grid cells; the game advances in fixed 100 ms steps so results do not depend on timer jitter.
export const TICK = 100
export const LANES = 5
export const ROWS = 6
export const START_LIVES = 10
export const PLACE_COOLDOWN = 5000
export const ASSIST_DAMAGE = 250
export const START_BERRIES = { lanes: 150, trail: 250 }
const PREP = { lanes: 12000, trail: 8000 }
const WAVE_GAP = { lanes: 22000, trail: 16000 }
const SKY_FIRST = 4000
const SKY_EVERY = 7000
const DROP_LIFE = 9000
const SHOT_SPEED = 9
const BITE = 20
const BRAWLER_REACH = 2
const MAX_CATCH_UP = 3000
// Egg move perks for Pokemon hatched on the watch.
export const EGG_HARVEST = { lanes: 10, trail: 5 }
export const EGG_TOUGHNESS = 1.3
export const EGG_POWER = 1.2

export type Layout = 'lanes' | 'trail'
export type PathId = keyof typeof TRAIL_MAPS
export type Effect = 'produce' | 'wall' | 'splash' | 'chain' | 'slow' | 'poison' | 'push' | 'line' | 'none'
export type Kit = { label: string, effect: Effect, cost: number, hp: number, damage: number, cooldown: number, range: number, power: number }
export type BattleSpec = { layout: Layout, waves: number, difficulty: number, habitat: string, foes: string[], path: PathId, boss?: string, weather?: Weather }

// Weather (Trail Defense's harder stages): it powers up foes of its types, as in the games, with more health and a
// little more speed, and brings those types into the waves if the stage's foes lack them. Your Pokemon feel it too:
// those of its types hit harder (WEATHER_POWER), and those it weakens (weakens) hit softer (WEATHER_WEAK): water and ice
// moves in harsh sunlight and fire in rain, as in the games; and the types weak to what sand, hail and fog bring: flying
// and bug pelted by sand, grass, flying and dragon in hail, psychic in a fog full of ghosts. Growers and blockers deal
// no damage, so the weather leaves them be.
export type Weather = 'sun' | 'rain' | 'sandstorm' | 'hail' | 'fog'
export const WEATHER: Record<Weather, { name: string, mark: string, types: string[], weakens: string[] }> = {
  sun: { name: 'Harsh sunlight', mark: '☀\uFE0E', types: ['fire'], weakens: ['water', 'ice'] },
  rain: { name: 'Heavy rain', mark: '☂\uFE0E', types: ['water'], weakens: ['fire'] },
  sandstorm: { name: 'Sandstorm', mark: '≋', types: ['rock', 'ground', 'steel'], weakens: ['flying', 'bug'] },
  hail: { name: 'Hail', mark: '❄\uFE0E', types: ['ice'], weakens: ['grass', 'flying', 'dragon'] },
  fog: { name: 'Thick fog', mark: '☁\uFE0E', types: ['ghost', 'dark'], weakens: ['psychic'] }
}
export const WEATHER_HEALTH = 1.3, WEATHER_SPEED = 1.1, WEATHER_POWER = 1.3, WEATHER_WEAK = 0.7
// Whether the weather powers up a foe of this type.
export const boostedBy = (weather: Weather | undefined, type: string) => !!weather && WEATHER[weather].types.includes(type)
// What the weather does to one of your Pokemon of this type: 'boosted', 'weakened' or nothing.
export function weatherOn(weather: Weather | undefined, type: string): 'boosted' | 'weakened' | null {
  if (!weather) return null
  return WEATHER[weather].types.includes(type) ? 'boosted' : WEATHER[weather].weakens.includes(type) ? 'weakened' : null
}
// The weather's factor on the damage your Pokemon of this type deal.
export function weatherPower(weather: Weather | undefined, type: string): number {
  const on = weatherOn(weather, type)
  return on === 'boosted' ? WEATHER_POWER : on === 'weakened' ? WEATHER_WEAK : 1
}
// What the weather does to one of your Pokemon on the board, by its form: growers and blockers deal no damage, so none.
export function unitWeather(weather: Weather | undefined, name: string, layout: Layout): 'boosted' | 'weakened' | null {
  return ['produce', 'wall'].includes(kitFor(name, layout).effect) ? null : weatherOn(weather, battleType(name))
}
export type Spawn = { at: number, name: string, wave: number, boss: boolean, lane: number }
// from and evolvedAt: the form it last evolved from, and when (game time), for the board's evolution animation.
export type Unit = { id: number, name: string, shiny: boolean, col: number, row: number, hp: number, maxHp: number, ready: number,
  family: string[], evolves: boolean, spent: number, egg: boolean, from?: string, evolvedAt?: number,
  stunnedUntil?: number }   // stunned by a boss (src/games/boss.ts): it does nothing until then
// How long the board plays an evolution.
export const EVOLVE_MS = 1500
export type Enemy = { id: number, name: string, type: string, wave: number, boss: boolean, hp: number, maxHp: number, speed: number,
  lane: number, progress: number, slowUntil: number, poisonUntil: number, poisonDps: number, reward: number, boosted?: boolean,
  // A boss's skills (src/games/boss.ts): when it next charges one, which of its moves is next, until when it is charging
  // (standing still), its shield and when that fades, until when it dashes, and the move it last used.
  nextSkill?: number, skillIndex?: number, chargeUntil?: number, shield?: number, shieldUntil?: number, dashUntil?: number,
  lastSkill?: BossMove & { at: number },
  // Status conditions from your Pokemon's attacks (src/games/status.ts), each until when and its damage each second;
  // until when it cannot be frozen or put to sleep again, or confused again; and when it last showed it was immune.
  conditions?: Partial<Record<Condition, { until: number, dps: number }>>, calmUntil?: number, unconfusedUntil?: number, immuneShownAt?: number }
// move is the type whose move the shot shows: the attacker's own, or its egg move's when that hits the target harder.
export type Shot = { id: number, x: number, y: number, target: number, damage: number, type: string, coverage: string | null, effect: Effect, move: string }
export type Drop = { id: number, col: number, row: number, value: number, until: number }
export type Fx = { id: number, kind: 'super' | 'berries' | 'guard' | 'assist' | 'leak' | 'boss' | 'hurt' | 'heal' | 'status', x: number, y: number, until: number,
  text: string, tint?: string }
// A move landing, for the board to animate: a hit on a foe, a smaller one on a foe caught by a splash or chain, or a wave
// around a Pokemon whose move strikes everything within reach (a grower's harvest has reach 0). foe is the foe hit, or -1.
export type Strike = { id: number, move: string, kind: 'hit' | 'spread' | 'wave', x: number, y: number, foe: number, reach: number, start: number, until: number }
export type Battle = {
  layout: Layout, spec: BattleSpec, status: 'playing' | 'paused' | 'won' | 'lost', elapsed: number, lastTick: number,
  berries: number, lives: number, guards: boolean[], team: TeamCard[], units: Unit[], enemies: Enemy[], shots: Shot[],
  drops: Drop[], effects: Fx[], strikes: Strike[], spawns: Spawn[], wave: number, nextId: number, nextSky: number,
  cooldowns: Record<string, number>, assist: { name: string, used: boolean } | null, defeated: number
}

const kits: Record<string, Omit<Kit, 'power'>> = {
  produce: { label: 'Berry grower', effect: 'produce', cost: 50, hp: 80, damage: 0, cooldown: 7000, range: 0 },
  wall: { label: 'Blocker', effect: 'wall', cost: 50, hp: 480, damage: 0, cooldown: 0, range: 0 },
  quake: { label: 'Quake', effect: 'line', cost: 75, hp: 200, damage: 18, cooldown: 1600, range: 1.6 },
  splash: { label: 'Splash fire', effect: 'splash', cost: 125, hp: 90, damage: 22, cooldown: 1600, range: 2 },
  chain: { label: 'Chain zap', effect: 'chain', cost: 125, hp: 80, damage: 20, cooldown: 1300, range: 2.2 },
  slow: { label: 'Freeze', effect: 'slow', cost: 100, hp: 90, damage: 12, cooldown: 1300, range: 2 },
  poison: { label: 'Toxic', effect: 'poison', cost: 100, hp: 90, damage: 8, cooldown: 1500, range: 2 },
  push: { label: 'Push back', effect: 'push', cost: 100, hp: 100, damage: 16, cooldown: 1200, range: 2.2 },
  line: { label: 'Psy wave', effect: 'line', cost: 150, hp: 80, damage: 16, cooldown: 1800, range: 2 },
  brawler: { label: 'Brawler', effect: 'none', cost: 75, hp: 170, damage: 40, cooldown: 1000, range: 1.3 },
  sniper: { label: 'Sniper', effect: 'none', cost: 100, hp: 70, damage: 34, cooldown: 2000, range: 3.4 },
  rapid: { label: 'Rapid', effect: 'none', cost: 50, hp: 70, damage: 9, cooldown: 600, range: 1.8 },
  heavy: { label: 'Heavy hitter', effect: 'none', cost: 175, hp: 140, damage: 60, cooldown: 2200, range: 2.4 },
  shooter: { label: 'Shooter', effect: 'none', cost: 75, hp: 100, damage: 20, cooldown: 1200, range: 2.2 }
}
const roles: Record<string, string> = { grass: 'produce', rock: 'wall', ground: 'wall', steel: 'wall', fire: 'splash', electric: 'chain',
  ice: 'slow', poison: 'poison', ghost: 'poison', water: 'push', psychic: 'line', fighting: 'brawler', flying: 'sniper', bug: 'rapid', dragon: 'heavy' }
const POWER = [1, 1.5, 2.1]
const TOUGH = [1, 1.4, 1.8]
const PRICE = [1, 1.4, 1.8]

// Blockers have nothing to block on a trail, so rock, ground and steel shake the ground there instead.
function roleOf(name: string, layout: Layout): string {
  const role = roles[battleType(name)] || 'shooter'
  return layout === 'trail' && role === 'wall' ? 'quake' : role
}

const kitCache = new Map<string, Kit>()
export function kitFor(name: string, layout: Layout): Kit {
  const cacheKey = layout + ':' + name
  const cached = kitCache.get(cacheKey)
  if (cached) return cached
  const kit = kits[roleOf(name, layout)]
  const stage = stageOf(name) - 1
  const result = { ...kit, power: POWER[stage], hp: Math.round(kit.hp * TOUGH[stage]), damage: kit.damage * POWER[stage],
    cost: layout === 'lanes' ? Math.round(kit.cost * PRICE[stage] / 5) * 5 : kit.cost }
  kitCache.set(cacheKey, result)
  return result
}

// Attacker type against defender type. Immunities are softened to resistances so no Pokemon is useless.
const strong: Record<string, string[]> = {
  fire: ['grass', 'ice', 'bug', 'steel'], water: ['fire', 'ground', 'rock'], electric: ['water', 'flying'],
  grass: ['water', 'ground', 'rock'], ice: ['grass', 'ground', 'flying', 'dragon'], fighting: ['normal', 'ice', 'rock', 'dark', 'steel'],
  poison: ['grass', 'fairy'], ground: ['fire', 'electric', 'poison', 'rock', 'steel'], flying: ['grass', 'fighting', 'bug'],
  psychic: ['fighting', 'poison'], bug: ['grass', 'psychic', 'dark'], rock: ['fire', 'ice', 'flying', 'bug'], ghost: ['psychic', 'ghost'],
  dragon: ['dragon'], dark: ['psychic', 'ghost'], steel: ['ice', 'rock', 'fairy'], fairy: ['fighting', 'dragon', 'dark']
}
const weak: Record<string, string[]> = {
  normal: ['rock', 'steel', 'ghost'], fire: ['fire', 'water', 'rock', 'dragon'], water: ['water', 'grass', 'dragon'],
  electric: ['electric', 'grass', 'dragon', 'ground'], grass: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'],
  ice: ['fire', 'water', 'ice', 'steel'], fighting: ['poison', 'flying', 'psychic', 'bug', 'fairy', 'ghost'],
  poison: ['poison', 'ground', 'rock', 'ghost', 'steel'], ground: ['grass', 'bug', 'flying'], flying: ['electric', 'rock', 'steel'],
  psychic: ['psychic', 'steel', 'dark'], bug: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'],
  rock: ['fighting', 'ground', 'steel'], ghost: ['dark', 'normal'], dragon: ['steel', 'fairy'], dark: ['fighting', 'dark', 'fairy'],
  steel: ['fire', 'water', 'electric', 'steel'], fairy: ['fire', 'poison', 'steel']
}
// The games' immunities: these moves do nothing at all to these types.
const immune: Record<string, string[]> = {
  normal: ['ghost'], fighting: ['ghost'], ghost: ['normal'], poison: ['steel'], ground: ['flying'], electric: ['ground'], psychic: ['dark'], dragon: ['fairy']
}
export function effectiveness(attack: string, defend: string): number {
  return immune[attack]?.includes(defend) ? 0 : strong[attack]?.includes(defend) ? 2 : weak[attack]?.includes(defend) ? 0.5 : 1
}
// The types a Pokemon's moves cannot touch: its own type's immunities, less what its egg move (coverage) can hit.
export function untouchable(name: string, layout: Layout, egg: boolean): string[] {
  const type = battleType(name)
  const perk = egg ? eggPerk(name, layout) : null
  const coverage = perk?.kind === 'coverage' ? perk.type : null
  return (immune[type] ?? []).filter(defend => !coverage || effectiveness(coverage, defend) === 0)
}

// A hatched attacker uses whichever of its own type and its egg move's type hits harder.
const hitType = (type: string, coverage: string | null, defend: string) =>
  coverage && effectiveness(coverage, defend) > effectiveness(type, defend) ? coverage : type
const bestOf = (type: string, coverage: string | null, defend: string) => effectiveness(hitType(type, coverage, defend), defend)

// The move each type attacks with, an early move of that type from the games. Growers and blockers do not attack.
export const MOVES: Record<string, string> = { normal: 'Swift', fire: 'Ember', water: 'Water Gun', electric: 'Thunder Shock',
  grass: 'Razor Leaf', ice: 'Ice Shard', fighting: 'Mach Punch', poison: 'Sludge', ground: 'Magnitude', flying: 'Air Cutter',
  psychic: 'Confusion', bug: 'Pin Missile', rock: 'Rock Throw', ghost: 'Shadow Ball', dragon: 'Dragon Breath', dark: 'Bite',
  steel: 'Metal Claw', fairy: 'Fairy Wind' }
export function moveOf(name: string, layout: Layout): string | null {
  const { effect } = kitFor(name, layout)
  return effect === 'produce' || effect === 'wall' ? null : MOVES[battleType(name)] ?? MOVES.normal
}

// What a hatched Pokemon's egg moves do in battle. Growers harvest more and blockers are tougher. Attackers use the
// damaging egg move that improves the most matchups over their own type (then the strongest); with only same-type
// damaging moves they hit harder, and with only status moves (Haze, Wish...) they are tougher. No egg moves, no perk.
export type EggPerk = { move: string, type: string, kind: 'harvest' | 'toughness' | 'coverage' | 'power' | 'guard', text: string }
const allTypes = Object.keys(weak)
const label = (type: string) => type[0].toUpperCase() + type.slice(1)
const perkCache = new Map<string, EggPerk | null>()
export function eggPerk(name: string, layout: Layout): EggPerk | null {
  const cacheKey = layout + ':' + name
  if (perkCache.has(cacheKey)) return perkCache.get(cacheKey)!
  const moves = eggMovesOf(name)
  const own = battleType(name)
  const { effect } = kitFor(name, layout)
  const gain = (type: string) => allTypes.filter(defend => effectiveness(type, defend) > effectiveness(own, defend)).length
  const damaging = moves.filter(move => move.power > 0)
  const coverage = damaging.filter(move => gain(move.type) > 0)
    .sort((a, b) => gain(b.type) - gain(a.type) || b.power - a.power || a.name.localeCompare(b.name))[0]
  const strongest = [...damaging].sort((a, b) => b.power - a.power || a.name.localeCompare(b.name))[0]
  const signature = coverage ?? strongest ?? moves[0]
  const tough = `+${Math.round((EGG_TOUGHNESS - 1) * 100)}% health`
  const perk: EggPerk | null = !signature ? null
    : effect === 'produce' ? { move: signature.name, type: signature.type, kind: 'harvest', text: `+${EGG_HARVEST[layout]} berries per harvest` }
    : effect === 'wall' ? { move: signature.name, type: signature.type, kind: 'toughness', text: tough }
    : coverage ? { move: coverage.name, type: coverage.type, kind: 'coverage', text: `${label(coverage.type)} coverage: each hit uses whichever type is stronger` }
    : strongest ? { move: strongest.name, type: strongest.type, kind: 'power', text: `+${Math.round((EGG_POWER - 1) * 100)}% damage` }
    : { move: signature.name, type: signature.type, kind: 'guard', text: tough }
  perkCache.set(cacheKey, perk)
  return perk
}

function unitHealth(name: string, layout: Layout, egg: boolean): number {
  const kind = egg ? eggPerk(name, layout)?.kind : undefined
  return Math.round(kitFor(name, layout).hp * (kind === 'toughness' || kind === 'guard' ? EGG_TOUGHNESS : 1))
}

// Each trail map has its own board size (src/games/trails.ts); waypoints are cell centers.
type Point = { x: number, y: number }
// tiles: element tiles by square ("col,row" to type), where only that type may stand.
export type TrailPath = { name: string, cols: number, rows: number, points: Point[], cells: Set<string>, length: number, tiles: Map<string, string> }
export const PATHS = Object.fromEntries(Object.entries(TRAIL_MAPS).map(([id, map]) => {
  const { name, cols, rows, route } = map
  const tiles = new Map<string, string>()
  for (const [type, spots] of Object.entries(('tiles' in map ? map.tiles : undefined) ?? {})) for (const [col, row] of spots ?? []) tiles.set(col + ',' + row, type)
  const points = route.map(([x, y]) => ({ x, y }))
  const cells = new Set<string>()
  let length = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    const segment = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
    length += segment
    for (let s = 0; s <= segment * 2; s++) {
      const col = Math.floor(a.x + (b.x - a.x) * s / (segment * 2)), row = Math.floor(a.y + (b.y - a.y) * s / (segment * 2))
      if (col >= 0 && col < cols && row >= 0 && row < rows) cells.add(col + ',' + row)
    }
  }
  return [id, { name, cols, rows, points, cells, length, tiles }]
})) as Record<PathId, TrailPath>

// The element tile on a square, if any (Trail Defense only).
export const tileAt = (game: Pick<Battle, 'layout' | 'spec'>, col: number, row: number): string | null =>
  game.layout === 'trail' ? PATHS[game.spec.path].tiles.get(col + ',' + row) ?? null : null

export function pathPoint(id: PathId, distance: number): Point {
  const { points } = PATHS[id]
  let left = Math.max(0, distance)
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    const segment = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
    if (left <= segment) return { x: a.x + (b.x - a.x) * left / segment, y: a.y + (b.y - a.y) * left / segment }
    left -= segment
  }
  return points[points.length - 1]
}

// Which way a foe faces at this distance along the trail: the direction of the segment it is walking.
export type Heading = 'N' | 'S' | 'E' | 'W'
export function pathHeading(id: PathId, distance: number): Heading {
  const { points } = PATHS[id]
  let left = Math.max(0, distance)
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    const segment = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
    if (left < segment || i === points.length - 1) return b.x > a.x ? 'E' : b.x < a.x ? 'W' : b.y < a.y ? 'N' : 'S'
    left -= segment
  }
  return 'S'
}

export function enemyHeading(game: Pick<Battle, 'layout' | 'spec'>, enemy: Enemy): Heading {
  return game.layout === 'lanes' ? 'S' : pathHeading(game.spec.path, enemy.progress)
}

// Which way to look from one point at another, by the larger of the two distances.
export function facingToward(from: Point, to: Point): Heading {
  const dx = to.x - from.x, dy = to.y - from.y
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy < 0 ? 'N' : 'S'
}

// The foe a placed Pokemon is looking at: the one it attacks next, or for a lane blocker the foe nibbling it.
// Berry growers watch no one.
export function unitTarget(game: Battle, unit: Unit): Enemy | null {
  const kit = kitFor(unit.name, game.layout)
  if (kit.effect === 'produce') return null
  if (kit.effect === 'wall') {
    return game.enemies.find(enemy => enemy.hp > 0 && enemy.lane === unit.col && enemy.progress < unit.row + 1 && unit.row - enemy.progress < 1) ?? null
  }
  return targetsFor(game, unit, kit)[0] ?? null
}

// True for a short moment after a Pokemon attacks or harvests (its cooldown has just restarted), so the field can show a lunge.
export function actedRecently(game: Battle, unit: Unit, window = 200): boolean {
  const { cooldown } = kitFor(unit.name, game.layout)
  return cooldown > 0 && unit.ready - game.elapsed > cooldown - window
}

export function enemyPoint(game: Pick<Battle, 'layout' | 'spec'>, enemy: Enemy): Point {
  return game.layout === 'lanes' ? { x: enemy.lane + 0.5, y: enemy.progress } : pathPoint(game.spec.path, enemy.progress)
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

// Waves grow in size and strength; evolved foes appear from wave 3 and the last wave brings a boss.
export function planWaves(spec: BattleSpec, random = Math.random): Spawn[] {
  const found = wildPool(spec.foes)
  const pool = found.length ? found : wildPool(['normal'])
  const lanes = spec.layout === 'lanes'
  const spawns: Spawn[] = []
  for (let wave = 0; wave < spec.waves; wave++) {
    const start = PREP[spec.layout] + wave * WAVE_GAP[spec.layout]
    const count = lanes ? 3 + Math.floor(wave * 1.5) : 4 + wave * 2
    const interval = lanes ? Math.max(1200, 3000 - wave * 180) : Math.max(450, 1000 - wave * 50)
    const maxStage = wave < 2 ? 1 : wave < 5 ? 2 : 3
    const allowed = pool.filter(wild => wild.stage <= maxStage)
    for (let i = 0; i < count; i++) {
      spawns.push({ at: start + i * interval, name: pickWeighted(allowed.length ? allowed : pool, random).name, wave, boss: false, lane: Math.floor(random() * LANES) })
    }
    if (wave === spec.waves - 1) {
      const top = Math.max(...pool.map(wild => wild.stage))
      spawns.push({ at: start + (count + 1) * interval, name: spec.boss ?? pickWeighted(pool.filter(wild => wild.stage === top), random).name,
        wave, boss: true, lane: Math.floor(random() * LANES) })
    }
  }
  return spawns
}

function makeEnemy(id: number, spawn: Spawn, spec: BattleSpec): Enemy {
  const stage = stageOf(spawn.name) - 1
  const lanes = spec.layout === 'lanes'
  const type = battleType(spawn.name)
  const boosted = boostedBy(spec.weather, type)
  const hp = Math.round((lanes ? 70 : 50) * (1 + (lanes ? 0.25 : 0.22) * spawn.wave) * spec.difficulty * [1, 1.7, 2.6][stage] * (spawn.boss ? 7 : 1) *
    (boosted ? WEATHER_HEALTH : 1))
  return { id, name: spawn.name, type, wave: spawn.wave, boss: spawn.boss, hp, maxHp: hp,
    speed: (lanes ? 0.26 : 0.6) * [1.15, 1, 0.85][stage] * (spawn.boss ? 0.7 : 1) * (boosted ? WEATHER_SPEED : 1), lane: spawn.lane, progress: lanes ? -0.5 : 0,
    slowUntil: 0, poisonUntil: 0, poisonDps: 0, reward: lanes ? 0 : (10 + spawn.wave * 2) * (spawn.boss ? 5 : 1), ...(boosted ? { boosted } : {}) }
}

export function startBattle(spec: BattleSpec, team: readonly TeamCard[], options: { bonus?: number, assist?: string | null }, now: number, random = Math.random): Battle {
  return { layout: spec.layout, spec, status: 'playing', elapsed: 0, lastTick: now, berries: START_BERRIES[spec.layout] + (options.bonus || 0),
    lives: START_LIVES, guards: Array(LANES).fill(true), team: team.slice(0, 6), units: [], enemies: [], shots: [], drops: [], effects: [], strikes: [],
    spawns: planWaves(spec, random), wave: 0, nextId: 1, nextSky: SKY_FIRST, cooldowns: {},
    assist: options.assist ? { name: options.assist, used: false } : null, defeated: 0 }
}

export function gridSize(game: Pick<Battle, 'layout' | 'spec'>) {
  if (game.layout === 'lanes') return { cols: LANES, rows: ROWS }
  const { cols, rows } = PATHS[game.spec.path]
  return { cols, rows }
}

// A free square off the trail. Given the Pokemon to place, an element tile also needs its type; without one, any free
// square counts (what the board shows before a card is chosen).
export function canPlace(game: Battle, col: number, row: number, name?: string): boolean {
  const { cols, rows } = gridSize(game)
  const tile = tileAt(game, col, row)
  return Number.isInteger(col) && Number.isInteger(row) && col >= 0 && col < cols && row >= 0 && row < rows &&
    !game.units.some(unit => unit.col === col && unit.row === row) && !(game.layout === 'trail' && PATHS[game.spec.path].cells.has(col + ',' + row)) &&
    (name === undefined || tile === null || battleType(name) === tile)
}

// Route Guard places the card's own form; Trail Defense starts every family at its first stage.
export function placedForm(game: Pick<Battle, 'layout'>, card: TeamCard): string {
  return game.layout === 'trail' ? card.family[0] : card.name
}

export function cardReadyAt(game: Battle, card: TeamCard): number {
  return game.cooldowns[cardKey(card)] ?? 0
}

export function placeUnit(game: Battle, key: string, col: number, row: number): Battle {
  const card = game.team.find(item => cardKey(item) === key)
  if (game.status !== 'playing' || !card || !canPlace(game, col, row, placedForm(game, card)) || cardReadyAt(game, card) > game.elapsed) return game
  const name = placedForm(game, card)
  const kit = kitFor(name, game.layout)
  if (game.berries < kit.cost) return game
  const egg = !!card.hatched
  const hp = unitHealth(name, game.layout, egg)
  const unit: Unit = { id: game.nextId, name, shiny: card.shiny, col, row, hp, maxHp: hp, family: card.family, egg,
    ready: game.elapsed + (kit.effect === 'produce' ? kit.cooldown / 2 : 300), evolves: game.layout === 'trail', spent: kit.cost }
  return { ...game, units: [...game.units, unit], berries: game.berries - kit.cost, nextId: game.nextId + 1,
    cooldowns: game.layout === 'lanes' ? { ...game.cooldowns, [key]: game.elapsed + PLACE_COOLDOWN } : game.cooldowns }
}

export function refundFor(unit: Unit): number {
  return Math.floor(unit.spent / 10) * 5
}

export function removeUnit(game: Battle, id: number): Battle {
  const unit = game.units.find(item => item.id === id)
  if (game.status !== 'playing' || !unit) return game
  return { ...game, units: game.units.filter(item => item !== unit), berries: game.berries + refundFor(unit) }
}

// Trail Defense only: every Pokemon can evolve along its family to the final stage, for berries.
export function nextForm(unit: Unit): { name: string, cost: number } | null {
  const stage = unit.family.indexOf(unit.name) + 1
  const name = unit.family[stage]
  if (!unit.evolves || stage < 1 || !name) return null
  return { name, cost: Math.round(kits[roleOf(name, 'trail')].cost * (stage === 1 ? 1 : 1.5) / 5) * 5 }
}

export function evolveUnit(game: Battle, id: number): Battle {
  const unit = game.units.find(item => item.id === id)
  const next = unit && nextForm(unit)
  if (game.status !== 'playing' || !unit || !next || game.berries < next.cost) return game
  const hp = unitHealth(next.name, game.layout, unit.egg)
  const evolved = { ...unit, name: next.name, hp, maxHp: hp, spent: unit.spent + next.cost, from: unit.name, evolvedAt: game.elapsed }
  return { ...game, berries: game.berries - next.cost, units: game.units.map(item => item === unit ? evolved : item) }
}

export function collectDrop(game: Battle, id: number): Battle {
  const drop = game.drops.find(item => item.id === id)
  if (game.status !== 'playing' || !drop) return game
  const g = { ...game, berries: game.berries + drop.value, drops: game.drops.filter(item => item !== drop), effects: [...game.effects] }
  addFx(g, 'berries', drop.col + 0.5, drop.row + 0.5, '+' + drop.value)
  return g
}

// A befriended Legendary strikes every foe on the field once per battle and slows them briefly.
export function callAssist(game: Battle): Battle {
  if (game.status !== 'playing' || !game.assist || game.assist.used) return game
  const g = clone(game)
  const type = battleType(game.assist.name)
  for (const enemy of g.enemies) {
    harm(g, enemy, ASSIST_DAMAGE * effectiveness(type, enemy.type) * weatherPower(g.spec.weather, type))
    enemy.slowUntil = g.elapsed + 3000
  }
  for (const enemy of g.enemies) addStrike(g, type, 'hit', enemyPoint(g, enemy), enemy.id)
  g.assist = { name: game.assist.name, used: true }
  const { cols, rows } = gridSize(g)
  addFx(g, 'assist', cols / 2, rows / 2, game.assist.name + '!', 1500)
  settle(g)
  return g
}

export function nextWaveIn(game: Battle): number | null {
  const next = game.spawns[0]
  return next && next.wave >= game.wave ? Math.max(0, next.at - game.elapsed) : null
}

// Calling the next wave early moves the whole remaining schedule forward and pays a small bonus.
export function sendNextWave(game: Battle): Battle {
  const wait = nextWaveIn(game)
  if (game.status !== 'playing' || wait === null || wait <= 1000) return game
  return { ...game, berries: game.berries + 10, spawns: game.spawns.map(spawn => ({ ...spawn, at: spawn.at - wait })) }
}

export function pauseBattle(game: Battle, now: number): Battle {
  const next = tickBattle(game, now)
  return next.status === 'playing' ? { ...next, status: 'paused' } : next
}

export function resumeBattle(game: Battle, now: number): Battle {
  return game.status === 'paused' ? { ...game, status: 'playing', lastTick: now } : game
}

export function tickBattle(game: Battle, now: number, random = Math.random): Battle {
  if (game.status !== 'playing' || now <= game.lastTick) return game
  const g = clone(game)
  let remaining = Math.min(now - game.lastTick, MAX_CATCH_UP)
  g.lastTick = now
  while (remaining > 0 && g.status === 'playing') {
    const dt = Math.min(TICK, remaining)
    step(g, dt, random)
    remaining -= dt
  }
  return g
}

export function battleScore(game: Battle): number {
  if (game.status === 'won') return game.spec.waves
  let cleared = 0
  while (cleared < game.spec.waves && !game.spawns.some(spawn => spawn.wave === cleared) && !game.enemies.some(enemy => enemy.wave === cleared)) cleared++
  return cleared
}

export function battleStars(game: Battle): number {
  if (game.status !== 'won') return 0
  if (game.layout === 'lanes') {
    const intact = game.guards.filter(Boolean).length
    return intact === LANES ? 3 : intact >= 3 ? 2 : 1
  }
  return game.lives === START_LIVES ? 3 : game.lives >= 6 ? 2 : 1
}

function clone(game: Battle): Battle {
  return { ...game, guards: [...game.guards], units: game.units.map(unit => ({ ...unit })), enemies: game.enemies.map(enemy => ({ ...enemy })),
    shots: game.shots.map(shot => ({ ...shot })), drops: [...game.drops], effects: [...game.effects], strikes: [...game.strikes], spawns: [...game.spawns] }
}

function addFx(g: Battle, kind: Fx['kind'], x: number, y: number, text: string, life = 600, tint?: string) {
  g.effects.push({ id: g.nextId++, kind, x, y, until: g.elapsed + life, text, ...tint ? { tint } : {} })
}

const STRIKE_LIFE = { hit: 500, spread: 400, wave: 500 }
function addStrike(g: Battle, move: string, kind: Strike['kind'], at: Point, foe = -1, reach = 0) {
  g.strikes.push({ id: g.nextId++, move, kind, x: at.x, y: at.y, foe, reach, start: g.elapsed, until: g.elapsed + STRIKE_LIFE[kind] })
}

// The foes a Pokemon can attack now, the furthest along first. It leaves alone any its moves cannot touch (a Ghost foe
// for a Normal or Fighting Pokemon without another egg move), and attacks the next one instead.
function targetsFor(g: Battle, unit: Unit, kit: Kit): Enemy[] {
  const blind = untouchable(unit.name, g.layout, unit.egg)
  return reachable(g, unit, kit).filter(enemy => !blind.includes(enemy.type))
}
function reachable(g: Battle, unit: Unit, kit: Kit): Enemy[] {
  const center = { x: unit.col + 0.5, y: unit.row + 0.5 }
  if (g.layout === 'lanes') {
    // Lane attackers cover everything above them. Short-range brawlers reach two rows, so one standing behind a
    // blocker can still hit the foe nibbling that blocker.
    const reach = kit.range < 1.5 ? BRAWLER_REACH : Infinity
    return g.enemies.filter(enemy => enemy.hp > 0 && enemy.lane === unit.col && enemy.progress < unit.row + 1 && center.y - enemy.progress <= reach)
      .sort((a, b) => b.progress - a.progress)
  }
  return g.enemies.filter(enemy => enemy.hp > 0 && distance(enemyPoint(g, enemy), center) <= kit.range).sort((a, b) => b.progress - a.progress)
}

// Damage to a foe, soaked up first by a boss's shield.
function harm(g: Battle, enemy: Enemy, amount: number) {
  if (enemy.shield && enemy.shield > 0) {
    const soaked = Math.min(enemy.shield, amount)
    enemy.shield -= soaked
    amount -= soaked
    if (enemy.shield <= 0) { enemy.shield = 0; const at = enemyPoint(g, enemy); addFx(g, 'boss', at.x, at.y - 0.6, 'Shield broken!', 900) }
  }
  enemy.hp -= amount
}

// The move a boss is charging (standing still, about to use it), or null.
export function bossCharging(game: Battle, enemy: Enemy): BossMove | null {
  if (!enemy.boss || !enemy.chargeUntil || enemy.chargeUntil <= game.elapsed) return null
  const moves = bossMoves(enemy.name)
  return moves[(enemy.skillIndex ?? 0) % moves.length]
}

// A boss's turn: start charging its next move when it is due, and use it once charged. True while it stands charging.
function bossTurn(g: Battle, enemy: Enemy, random: () => number): boolean {
  const t = g.elapsed
  if (enemy.shieldUntil !== undefined && enemy.shieldUntil <= t) { enemy.shield = 0; enemy.shieldUntil = undefined }
  if (enemy.nextSkill === undefined) return false
  if (enemy.chargeUntil) {
    if (t < enemy.chargeUntil) return true
    enemy.chargeUntil = 0
    const moves = bossMoves(enemy.name)
    castBossMove(g, enemy, moves[(enemy.skillIndex ?? 0) % moves.length], random)
    enemy.skillIndex = (enemy.skillIndex ?? 0) + 1
    enemy.nextSkill = t + BOSS_EVERY
    return false
  }
  if (t >= enemy.nextSkill) { enemy.chargeUntil = t + BOSS_CHARGE; return true }
  return false
}

function castBossMove(g: Battle, enemy: Enemy, { skill, move }: BossMove, random: () => number) {
  const t = g.elapsed
  const at = enemyPoint(g, enemy)
  const near = (reach: number) => g.units.filter(unit => unit.hp > 0 && distance({ x: unit.col + 0.5, y: unit.row + 0.5 }, at) <= reach)
  enemy.lastSkill = { skill, move, at: t }
  // Called out above it, or below it on the board's top row.
  addFx(g, 'boss', at.x, at.y < 1.2 ? at.y + 0.9 : at.y - 0.9, `${move}!`, 1400)
  if (skill === 'dash') {
    enemy.dashUntil = t + DASH_MS
  } else if (skill === 'shield') {
    enemy.shield = Math.round(enemy.maxHp * SHIELD_SHARE)
    enemy.shieldUntil = t + SHIELD_MS
  } else if (skill === 'blast') {
    addStrike(g, enemy.type, 'wave', at, -1, BLAST_REACH)
    const damage = Math.round(BLAST_DAMAGE * (1 + 0.1 * enemy.wave))
    for (const unit of near(BLAST_REACH)) {
      unit.hp -= damage
      addFx(g, 'hurt', unit.col + 0.5, unit.row + 0.2, `−${damage}`, 900)
    }
  } else if (skill === 'stun') {
    addStrike(g, enemy.type, 'wave', at, -1, STUN_REACH)
    for (const unit of near(STUN_REACH)) unit.stunnedUntil = t + STUN_MS
  } else if (skill === 'heal') {
    const gain = Math.min(enemy.maxHp - enemy.hp, Math.round(enemy.maxHp * HEAL_SHARE))
    enemy.hp += gain
    enemy.slowUntil = 0
    enemy.poisonUntil = 0
    enemy.conditions = {}
    if (gain > 0) addFx(g, 'heal', at.x, at.y - 0.4, `+${gain}`, 900)
  } else {
    // Two foes of the battle's own kinds, at most middle forms, appear just behind the boss.
    const pool = wildPool(g.spec.foes).filter(wild => wild.stage <= 2)
    for (let i = 0; i < SUMMONS && pool.length; i++) {
      const minion = makeEnemy(g.nextId++, { at: t, name: pickWeighted(pool, random).name, wave: enemy.wave, boss: false, lane: enemy.lane }, g.spec)
      minion.progress = Math.max(g.layout === 'lanes' ? -0.5 : 0, enemy.progress - 0.35 * (i + 1))
      g.enemies.push(minion)
    }
  }
}

// A foe's status conditions now, strongest first (src/games/status.ts ORDER).
export const conditionsOf = (game: Battle, enemy: Enemy): Condition[] =>
  ORDER.filter(condition => (enemy.conditions?.[condition]?.until ?? 0) > game.elapsed)
const hasCondition = (enemy: Enemy, condition: Condition, t: number) => (enemy.conditions?.[condition]?.until ?? 0) > t
// Sets or clears one condition. The record is replaced, never changed in place: game states share it until then.
function setCondition(enemy: Enemy, condition: Condition, value: { until: number, dps: number } | null) {
  const next = { ...enemy.conditions }
  if (value) next[condition] = value
  else delete next[condition]
  enemy.conditions = next
}

// A hit's status condition: a Fire move thaws a frozen foe, then the move's type may leave one (src/games/status.ts).
function inflict(g: Battle, enemy: Enemy, move: string, dealt: number, random: () => number) {
  const t = g.elapsed
  if (move === 'fire' && hasCondition(enemy, 'freeze', t)) { setCondition(enemy, 'freeze', null); enemy.calmUntil = t + CALM_MS }
  const condition = rollCondition(move, random)
  if (!condition) return
  const at = enemyPoint(g, enemy)
  if (immunities(enemy.name, enemy.type, enemy.boss, isLegendary(enemy.name)).includes(condition)) {
    // Shown now and then, not on every roll.
    if (t - (enemy.immuneShownAt ?? -Infinity) >= 2000) { enemy.immuneShownAt = t; statusCallout(g, at, 'Immune!', '#d6d9ea') }
    return
  }
  const active = hasCondition(enemy, condition, t)
  if (active && !REFRESHES.includes(condition)) return
  if (!active && enemy.boss && conditionsOf(g, enemy).length >= BOSS_MAX) return
  if ((condition === 'freeze' || condition === 'sleep') &&
      (hasCondition(enemy, 'freeze', t) || hasCondition(enemy, 'sleep', t) || (enemy.calmUntil ?? 0) > t)) return
  if (condition === 'confusion' && (enemy.unconfusedUntil ?? 0) > t) return
  if (condition === 'burn' && hasCondition(enemy, 'freeze', t)) return
  // Another hit resets the time; the damage is the stronger of the two hits', never both.
  const dps = Math.max(active ? enemy.conditions![condition]!.dps : 0, (DOT[condition] ?? 0) * dealt)
  setCondition(enemy, condition, { until: t + LASTS[condition] * (enemy.boss ? 0.5 : 1), dps })
  if (!active) statusCallout(g, at, CONDITIONS[condition].word, CONDITIONS[condition].color)
}

// A status callout above a foe, stacked over any other said there just now, so two landing together both read.
function statusCallout(g: Battle, at: Point, text: string, tint: string) {
  const near = g.effects.filter(fx => fx.kind === 'status' && fx.until - g.elapsed > 600 && Math.abs(fx.x - at.x) < 1.2 && Math.abs(fx.y - (at.y - 0.55)) < 1.5).length
  addFx(g, 'status', at.x, at.y - 0.55 - 0.4 * near, text, 900, tint)
}

function hit(g: Battle, enemy: Enemy, damage: number, type: string, coverage: string | null, effect: Effect, random?: () => number) {
  const multiplier = bestOf(type, coverage, enemy.type)
  harm(g, enemy, damage * multiplier)
  if (random && enemy.hp > 0) inflict(g, enemy, hitType(type, coverage, enemy.type), damage * multiplier, random)
  const at = enemyPoint(g, enemy)
  addStrike(g, hitType(type, coverage, enemy.type), 'hit', at, enemy.id)
  if (multiplier > 1) addFx(g, 'super', at.x, at.y, '×2')
  if (effect === 'slow') enemy.slowUntil = g.elapsed + 2500
  if (effect === 'poison') { enemy.poisonUntil = g.elapsed + 3000; enemy.poisonDps = damage * 0.8 }
  if (effect === 'push' && !enemy.boss) enemy.progress = Math.max(g.layout === 'lanes' ? -0.5 : 0, enemy.progress - 0.3)
  if (effect === 'splash' || effect === 'chain') {
    const near = g.enemies.filter(other => other !== enemy && other.hp > 0).map(other => ({ other, gap: distance(enemyPoint(g, other), at) }))
      .filter(({ gap }) => gap <= (effect === 'splash' ? 0.9 : 1.8)).sort((a, b) => a.gap - b.gap)
    for (const { other } of effect === 'splash' ? near : near.slice(0, 1)) {
      harm(g, other, damage * (effect === 'splash' ? 0.5 : 0.6) * bestOf(type, coverage, other.type))
      addStrike(g, hitType(type, coverage, other.type), 'spread', enemyPoint(g, other), other.id)
    }
  }
}

// Collects defeated foes and fallen Pokemon, then decides the outcome.
function settle(g: Battle) {
  // A hit stays on its foe while the foe walks on, and where the foe was once it is gone.
  g.strikes = g.strikes.filter(strike => strike.until > g.elapsed).slice(-40).map(strike => {
    const foe = strike.foe >= 0 ? g.enemies.find(enemy => enemy.id === strike.foe) : undefined
    return foe ? { ...strike, ...enemyPoint(g, foe) } : strike
  })
  const fallen = g.enemies.filter(enemy => enemy.hp <= 0)
  if (fallen.length) {
    g.defeated += fallen.length
    g.berries += fallen.reduce((sum, enemy) => sum + enemy.reward, 0)
    g.enemies = g.enemies.filter(enemy => enemy.hp > 0)
  }
  g.units = g.units.filter(unit => unit.hp > 0)
  g.effects = g.effects.filter(fx => fx.until > g.elapsed).slice(-16)
  if (g.lives <= 0) g.status = 'lost'
  else if (!g.spawns.length && !g.enemies.length) g.status = 'won'
}

function step(g: Battle, dt: number, random: () => number) {
  g.elapsed += dt
  const t = g.elapsed
  const lanes = g.layout === 'lanes'
  while (g.spawns.length && g.spawns[0].at <= t) {
    const spawn = g.spawns.shift()!
    const enemy = makeEnemy(g.nextId++, spawn, g.spec)
    if (enemy.boss) Object.assign(enemy, { nextSkill: t + BOSS_FIRST, skillIndex: 0 })
    g.enemies.push(enemy)
    g.wave = Math.max(g.wave, spawn.wave + 1)
  }
  if (lanes && t >= g.nextSky) {
    g.drops.push({ id: g.nextId++, col: Math.floor(random() * LANES), row: Math.floor(random() * ROWS), value: 25, until: t + DROP_LIFE })
    g.nextSky = t + SKY_EVERY
  }
  g.drops = g.drops.filter(drop => drop.until > t)

  for (const enemy of g.enemies) {
    if (enemy.poisonUntil > t) enemy.hp -= enemy.poisonDps * dt / 1000
    // Status conditions wear off (freeze, sleep and confusion leave it calm for a while), or burn on.
    if (enemy.conditions) {
      const lasting = Object.entries(enemy.conditions).filter(([, value]) => value.until > t)
      if (lasting.length !== Object.keys(enemy.conditions).length) {
        for (const condition of Object.keys(enemy.conditions) as Condition[]) {
          if (hasCondition(enemy, condition, t)) continue
          if (condition === 'freeze' || condition === 'sleep') enemy.calmUntil = t + CALM_MS
          if (condition === 'confusion') enemy.unconfusedUntil = t + CALM_MS
        }
        enemy.conditions = Object.fromEntries(lasting)
      }
      for (const [, value] of lasting) enemy.hp -= value.dps * dt / 1000
    }
    if (enemy.hp <= 0) continue
    // Frozen or asleep, it does nothing at all: no moves, no steps, no bites.
    if (hasCondition(enemy, 'freeze', t) || hasCondition(enemy, 'sleep', t)) continue
    if (enemy.boss && bossTurn(g, enemy, random)) continue
    // Slows add up, never below MIN_PACE; confused, it walks back.
    const pace = Math.max(MIN_PACE, (enemy.slowUntil > t ? 0.5 : 1) * (hasCondition(enemy, 'paralysis', t) ? PACE.paralysis! : 1) *
      (hasCondition(enemy, 'frostbite', t) ? PACE.frostbite! : 1))
    const confused = hasCondition(enemy, 'confusion', t)
    const move = enemy.speed * pace * ((enemy.dashUntil ?? 0) > t ? BOSS_DASH : 1) * (confused ? PACE.confusion! : 1) * dt / 1000
    // Confused, it stumbles back the way it came, never past where it entered.
    if (move < 0) { enemy.progress = Math.max(lanes ? -0.5 : 0, enemy.progress + move); continue }
    if (!lanes) { enemy.progress += move; continue }
    // A foe stops at the first Pokemon below it in its lane and nibbles until that Pokemon faints.
    const blocker = g.units.filter(unit => unit.col === enemy.lane && unit.hp > 0 && unit.row + 1 > enemy.progress).sort((a, b) => a.row - b.row)[0]
    const limit = blocker ? blocker.row - 0.3 : Infinity
    if (blocker && enemy.progress + move >= limit) {
      enemy.progress = Math.max(enemy.progress, limit)
      blocker.hp -= BITE * (1 + 0.1 * enemy.wave) * (enemy.boss ? 3 : 1) * dt / 1000
    } else enemy.progress += move
  }

  if (lanes) {
    for (const enemy of g.enemies) {
      if (enemy.hp <= 0 || enemy.progress < ROWS) continue
      if (!g.guards[enemy.lane]) { g.status = 'lost'; return }
      // Each lane's sleeping Snorlax wakes once and rolls every foe in that lane away.
      g.guards[enemy.lane] = false
      for (const other of g.enemies) if (other.lane === enemy.lane) other.hp = 0
      addFx(g, 'guard', enemy.lane + 0.5, ROWS - 0.5, 'Snorlax!', 1500)
    }
  } else {
    const end = PATHS[g.spec.path].length
    for (const enemy of g.enemies) {
      if (enemy.hp <= 0 || enemy.progress < end) continue
      g.lives = Math.max(0, g.lives - (enemy.boss ? 3 : 1))
      const at = pathPoint(g.spec.path, end)
      addFx(g, 'leak', at.x, at.y, enemy.boss ? '−3 ♥' : '−1 ♥', 900)
    }
    g.enemies = g.enemies.filter(enemy => enemy.progress < end)
  }

  for (const unit of g.units) {
    if (unit.hp <= 0 || t < unit.ready || (unit.stunnedUntil ?? 0) > t) continue
    const kit = kitFor(unit.name, g.layout)
    if (kit.effect === 'wall') continue
    const center = { x: unit.col + 0.5, y: unit.row + 0.5 }
    if (kit.effect === 'produce') {
      const harvest = unit.egg && eggPerk(unit.name, g.layout)?.kind === 'harvest'
      const value = Math.round(kit.power * (lanes ? 25 : 15) / 5) * 5 + (harvest ? EGG_HARVEST[g.layout] : 0)
      if (lanes) g.drops.push({ id: g.nextId++, col: unit.col, row: unit.row, value, until: t + DROP_LIFE })
      else { g.berries += value; addFx(g, 'berries', center.x, center.y, '+' + value) }
      addStrike(g, battleType(unit.name), 'wave', center)
      unit.ready = t + kit.cooldown
      continue
    }
    const targets = targetsFor(g, unit, kit)
    if (!targets.length) continue
    unit.ready = t + kit.cooldown
    const type = battleType(unit.name)
    const perk = unit.egg ? eggPerk(unit.name, g.layout) : null
    const coverage = perk?.kind === 'coverage' ? perk.type : null
    const damage = kit.damage * (perk?.kind === 'power' ? EGG_POWER : 1) * weatherPower(g.spec.weather, type)
    if (kit.effect === 'line') {
      addStrike(g, type, 'wave', center, -1, kit.range)
      for (const target of targets) hit(g, target, damage, type, coverage, 'none', random)
    } else {
      g.shots.push({ id: g.nextId++, x: center.x, y: center.y, target: targets[0].id, damage, type, coverage, effect: kit.effect,
        move: hitType(type, coverage, targets[0].type) })
    }
  }

  const travel = SHOT_SPEED * dt / 1000
  for (const shot of g.shots) {
    const target = g.enemies.find(enemy => enemy.id === shot.target && enemy.hp > 0)
    if (!target) { shot.target = -1; continue }
    const at = enemyPoint(g, target)
    const gap = distance(at, shot)
    if (gap <= travel + 0.2) { hit(g, target, shot.damage, shot.type, shot.coverage, shot.effect, random); shot.target = -1 }
    else { shot.x += (at.x - shot.x) / gap * travel; shot.y += (at.y - shot.y) / gap * travel }
  }
  g.shots = g.shots.filter(shot => shot.target !== -1)
  settle(g)
}
