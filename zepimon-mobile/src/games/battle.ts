import { battleType, cardKey, eggMovesOf, pickWeighted, stageOf, wildPool } from './roster.ts'
import type { TeamCard } from './roster.ts'

// One engine for Route Guard (five lanes, enemies walk down) and Trail Defense (enemies follow a path).
// Positions are in grid cells; the game advances in fixed 100 ms steps so results do not depend on timer jitter.
export const TICK = 100
export const LANES = 5
export const ROWS = 6
export const TRAIL_COLS = 6
export const TRAIL_ROWS = 8
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
export type PathId = 'switchback' | 'canyon' | 'spiral'
export type Effect = 'produce' | 'wall' | 'splash' | 'chain' | 'slow' | 'poison' | 'push' | 'line' | 'none'
export type Kit = { label: string, effect: Effect, cost: number, hp: number, damage: number, cooldown: number, range: number, power: number }
export type BattleSpec = { layout: Layout, waves: number, difficulty: number, habitat: string, foes: string[], path: PathId, boss?: string }
export type Spawn = { at: number, name: string, wave: number, boss: boolean, lane: number }
export type Unit = { id: number, name: string, shiny: boolean, col: number, row: number, hp: number, maxHp: number, ready: number,
  family: string[], evolves: boolean, spent: number, egg: boolean }
export type Enemy = { id: number, name: string, type: string, wave: number, boss: boolean, hp: number, maxHp: number, speed: number,
  lane: number, progress: number, slowUntil: number, poisonUntil: number, poisonDps: number, reward: number }
export type Shot = { id: number, x: number, y: number, target: number, damage: number, type: string, coverage: string | null, effect: Effect }
export type Drop = { id: number, col: number, row: number, value: number, until: number }
export type Fx = { id: number, kind: 'super' | 'zap' | 'berries' | 'guard' | 'assist' | 'leak', x: number, y: number, until: number, text: string }
export type Battle = {
  layout: Layout, spec: BattleSpec, status: 'playing' | 'paused' | 'won' | 'lost', elapsed: number, lastTick: number,
  berries: number, lives: number, guards: boolean[], team: TeamCard[], units: Unit[], enemies: Enemy[], shots: Shot[],
  drops: Drop[], effects: Fx[], spawns: Spawn[], wave: number, nextId: number, nextSky: number,
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
export function effectiveness(attack: string, defend: string): number {
  return strong[attack]?.includes(defend) ? 2 : weak[attack]?.includes(defend) ? 0.5 : 1
}

// A hatched attacker uses whichever of its own type and its egg move's type hits harder.
const bestOf = (type: string, coverage: string | null, defend: string) =>
  Math.max(effectiveness(type, defend), coverage ? effectiveness(coverage, defend) : 0)

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

// Trail waypoints are cell centers; each path enters from outside the 6 x 8 grid.
type Point = { x: number, y: number }
const waypoints: Record<PathId, [number, number][]> = {
  switchback: [[0.5, -0.5], [0.5, 1.5], [4.5, 1.5], [4.5, 3.5], [1.5, 3.5], [1.5, 5.5], [4.5, 5.5], [4.5, 8.5]],
  canyon: [[2.5, -0.5], [2.5, 2.5], [0.5, 2.5], [0.5, 5.5], [3.5, 5.5], [3.5, 3.5], [5.5, 3.5], [5.5, 8.5]],
  spiral: [[-0.5, 0.5], [4.5, 0.5], [4.5, 6.5], [0.5, 6.5], [0.5, 2.5], [2.5, 2.5], [2.5, 4.5]]
}
export const PATHS = Object.fromEntries(Object.entries(waypoints).map(([id, raw]) => {
  const points = raw.map(([x, y]) => ({ x, y }))
  const cells = new Set<string>()
  let length = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    const segment = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
    length += segment
    for (let s = 0; s <= segment * 2; s++) {
      const col = Math.floor(a.x + (b.x - a.x) * s / (segment * 2)), row = Math.floor(a.y + (b.y - a.y) * s / (segment * 2))
      if (col >= 0 && col < TRAIL_COLS && row >= 0 && row < TRAIL_ROWS) cells.add(col + ',' + row)
    }
  }
  return [id, { points, cells, length }]
})) as Record<PathId, { points: Point[], cells: Set<string>, length: number }>

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
  const hp = Math.round((lanes ? 70 : 50) * (1 + (lanes ? 0.25 : 0.22) * spawn.wave) * spec.difficulty * [1, 1.7, 2.6][stage] * (spawn.boss ? 7 : 1))
  return { id, name: spawn.name, type: battleType(spawn.name), wave: spawn.wave, boss: spawn.boss, hp, maxHp: hp,
    speed: (lanes ? 0.26 : 0.6) * [1.15, 1, 0.85][stage] * (spawn.boss ? 0.7 : 1), lane: spawn.lane, progress: lanes ? -0.5 : 0,
    slowUntil: 0, poisonUntil: 0, poisonDps: 0, reward: lanes ? 0 : (10 + spawn.wave * 2) * (spawn.boss ? 5 : 1) }
}

export function startBattle(spec: BattleSpec, team: readonly TeamCard[], options: { bonus?: number, assist?: string | null }, now: number, random = Math.random): Battle {
  return { layout: spec.layout, spec, status: 'playing', elapsed: 0, lastTick: now, berries: START_BERRIES[spec.layout] + (options.bonus || 0),
    lives: START_LIVES, guards: Array(LANES).fill(true), team: team.slice(0, 6), units: [], enemies: [], shots: [], drops: [], effects: [],
    spawns: planWaves(spec, random), wave: 0, nextId: 1, nextSky: SKY_FIRST, cooldowns: {},
    assist: options.assist ? { name: options.assist, used: false } : null, defeated: 0 }
}

export function gridSize(layout: Layout) {
  return layout === 'lanes' ? { cols: LANES, rows: ROWS } : { cols: TRAIL_COLS, rows: TRAIL_ROWS }
}

export function canPlace(game: Battle, col: number, row: number): boolean {
  const { cols, rows } = gridSize(game.layout)
  return Number.isInteger(col) && Number.isInteger(row) && col >= 0 && col < cols && row >= 0 && row < rows &&
    !game.units.some(unit => unit.col === col && unit.row === row) && !(game.layout === 'trail' && PATHS[game.spec.path].cells.has(col + ',' + row))
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
  if (game.status !== 'playing' || !card || !canPlace(game, col, row) || cardReadyAt(game, card) > game.elapsed) return game
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
  const evolved = { ...unit, name: next.name, hp, maxHp: hp, spent: unit.spent + next.cost }
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
    enemy.hp -= ASSIST_DAMAGE * effectiveness(type, enemy.type)
    enemy.slowUntil = g.elapsed + 3000
  }
  g.assist = { name: game.assist.name, used: true }
  const { cols, rows } = gridSize(g.layout)
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
    shots: game.shots.map(shot => ({ ...shot })), drops: [...game.drops], effects: [...game.effects], spawns: [...game.spawns] }
}

function addFx(g: Battle, kind: Fx['kind'], x: number, y: number, text: string, life = 600) {
  g.effects.push({ id: g.nextId++, kind, x, y, until: g.elapsed + life, text })
}

function targetsFor(g: Battle, unit: Unit, kit: Kit): Enemy[] {
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

function hit(g: Battle, enemy: Enemy, damage: number, type: string, coverage: string | null, effect: Effect) {
  const multiplier = bestOf(type, coverage, enemy.type)
  enemy.hp -= damage * multiplier
  const at = enemyPoint(g, enemy)
  if (multiplier > 1) addFx(g, 'super', at.x, at.y, '×2')
  if (effect === 'slow') enemy.slowUntil = g.elapsed + 2500
  if (effect === 'poison') { enemy.poisonUntil = g.elapsed + 3000; enemy.poisonDps = damage * 0.8 }
  if (effect === 'push' && !enemy.boss) enemy.progress = Math.max(g.layout === 'lanes' ? -0.5 : 0, enemy.progress - 0.3)
  if (effect === 'splash' || effect === 'chain') {
    const near = g.enemies.filter(other => other !== enemy && other.hp > 0).map(other => ({ other, gap: distance(enemyPoint(g, other), at) }))
      .filter(({ gap }) => gap <= (effect === 'splash' ? 0.9 : 1.8)).sort((a, b) => a.gap - b.gap)
    for (const { other } of effect === 'splash' ? near : near.slice(0, 1)) {
      other.hp -= damage * (effect === 'splash' ? 0.5 : 0.6) * bestOf(type, coverage, other.type)
      if (effect === 'chain') { const p = enemyPoint(g, other); addFx(g, 'zap', p.x, p.y, 'ϟ') }
    }
  }
}

// Collects defeated foes and fallen Pokemon, then decides the outcome.
function settle(g: Battle) {
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
    g.enemies.push(makeEnemy(g.nextId++, spawn, g.spec))
    g.wave = Math.max(g.wave, spawn.wave + 1)
  }
  if (lanes && t >= g.nextSky) {
    g.drops.push({ id: g.nextId++, col: Math.floor(random() * LANES), row: Math.floor(random() * ROWS), value: 25, until: t + DROP_LIFE })
    g.nextSky = t + SKY_EVERY
  }
  g.drops = g.drops.filter(drop => drop.until > t)

  for (const enemy of g.enemies) {
    if (enemy.poisonUntil > t) enemy.hp -= enemy.poisonDps * dt / 1000
    if (enemy.hp <= 0) continue
    const move = enemy.speed * (enemy.slowUntil > t ? 0.5 : 1) * dt / 1000
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
    if (unit.hp <= 0 || t < unit.ready) continue
    const kit = kitFor(unit.name, g.layout)
    if (kit.effect === 'wall') continue
    const center = { x: unit.col + 0.5, y: unit.row + 0.5 }
    if (kit.effect === 'produce') {
      const harvest = unit.egg && eggPerk(unit.name, g.layout)?.kind === 'harvest'
      const value = Math.round(kit.power * (lanes ? 25 : 15) / 5) * 5 + (harvest ? EGG_HARVEST[g.layout] : 0)
      if (lanes) g.drops.push({ id: g.nextId++, col: unit.col, row: unit.row, value, until: t + DROP_LIFE })
      else { g.berries += value; addFx(g, 'berries', center.x, center.y, '+' + value) }
      unit.ready = t + kit.cooldown
      continue
    }
    const targets = targetsFor(g, unit, kit)
    if (!targets.length) continue
    unit.ready = t + kit.cooldown
    const type = battleType(unit.name)
    const perk = unit.egg ? eggPerk(unit.name, g.layout) : null
    const coverage = perk?.kind === 'coverage' ? perk.type : null
    const damage = kit.damage * (perk?.kind === 'power' ? EGG_POWER : 1)
    if (kit.effect === 'line') for (const target of targets) hit(g, target, damage, type, coverage, 'none')
    else g.shots.push({ id: g.nextId++, x: center.x, y: center.y, target: targets[0].id, damage, type, coverage, effect: kit.effect })
  }

  const travel = SHOT_SPEED * dt / 1000
  for (const shot of g.shots) {
    const target = g.enemies.find(enemy => enemy.id === shot.target && enemy.hp > 0)
    if (!target) { shot.target = -1; continue }
    const at = enemyPoint(g, target)
    const gap = distance(at, shot)
    if (gap <= travel + 0.2) { hit(g, target, shot.damage, shot.type, shot.coverage, shot.effect); shot.target = -1 }
    else { shot.x += (at.x - shot.x) / gap * travel; shot.y += (at.y - shot.y) / gap * travel }
  }
  g.shots = g.shots.filter(shot => shot.target !== -1)
  settle(g)
}
