import { completedRuns, weekStart } from '../progress.ts'
import type { Progress } from '../progress.ts'
import type { BattleSpec, PathId } from './battle.ts'
import type { Zone } from './safari.ts'

export type Stop = { id: string, title: string, blurb: string, habitat: string } &
  ({ mode: 'guard' | 'trail', spec: BattleSpec } | { mode: 'safari', zone: Zone })

const guard = (waves: number, difficulty: number, habitat: string, foes: string[]): BattleSpec =>
  ({ layout: 'lanes', waves, difficulty, habitat, foes, path: 'switchback' })
const trail = (waves: number, difficulty: number, habitat: string, foes: string[], path: PathId, boss?: string): BattleSpec =>
  ({ layout: 'trail', waves, difficulty, habitat, foes, path, ...(boss ? { boss } : {}) })

// Each stop unlocks once the one before it has at least one star.
export const STOPS: Stop[] = [
  { id: 'route-1', title: 'Route 1', mode: 'guard', habitat: 'normal', blurb: 'Rattata and Pidgey are rushing the hedges. Hold all five lanes.',
    spec: guard(4, 0.8, 'normal', ['normal', 'bug']) },
  { id: 'viridian-forest', title: 'Viridian Forest', mode: 'safari', zone: 'meadow', habitat: 'grass', blurb: 'Tall grass everywhere. Catch three Pokemon to earn a star.' },
  { id: 'pewter-trail', title: 'Pewter Trail', mode: 'trail', habitat: 'rock', blurb: 'Shadow Pokemon are marching down the switchback toward the city.',
    spec: trail(6, 1, 'rock', ['rock', 'ground', 'fighting'], 'switchback') },
  { id: 'mt-moon', title: 'Mt. Moon', mode: 'guard', habitat: 'psychic', blurb: 'Something is stirring in the crystal caves.',
    spec: guard(6, 1.1, 'psychic', ['fairy', 'rock', 'poison']) },
  { id: 'cerulean-cape', title: 'Cerulean Cape', mode: 'safari', zone: 'lake', habitat: 'water', blurb: 'Ripples on the water hide rare finds.' },
  { id: 'rock-tunnel', title: 'Rock Tunnel', mode: 'trail', habitat: 'ground', blurb: 'A winding canyon. Watch the long bend in the middle.',
    spec: trail(8, 1.3, 'ground', ['ground', 'rock', 'poison', 'fighting'], 'canyon') },
  { id: 'lavender-tower', title: 'Lavender Tower', mode: 'guard', habitat: 'ghost', blurb: 'Ghosts drift down every lane at night.',
    spec: guard(8, 1.3, 'ghost', ['ghost', 'poison', 'psychic', 'dark']) },
  { id: 'midnight-grove', title: 'Midnight Grove', mode: 'safari', zone: 'night', habitat: 'dark', blurb: 'Only the bravest explorers hunt after dark.' },
  { id: 'victory-road', title: 'Victory Road', mode: 'trail', habitat: 'dragon', blurb: 'The final spiral. A Shadow Mewtwo leads the last wave.',
    spec: trail(10, 1.7, 'dragon', ['dragon', 'fighting', 'rock', 'steel', 'ice'], 'spiral', 'Mewtwo') }
]

const everyType = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy']
const paths: PathId[] = ['switchback', 'canyon', 'spiral']

// Free play mixes every type, in a random habitat and (for Trail Defense) a random trail.
export function freePlaySpec(layout: BattleSpec['layout'], random = Math.random): BattleSpec {
  const habitat = everyType[Math.floor(random() * everyType.length)]
  return layout === 'lanes' ? guard(10, 1.6, habitat, everyType) : trail(12, 1.6, habitat, everyType, paths[Math.floor(random() * paths.length)])
}

export function safariStars(catches: number): number {
  return catches >= 7 ? 3 : catches >= 5 ? 2 : catches >= 3 ? 1 : 0
}

export function stopUnlocked(stars: Record<string, number>, index: number): boolean {
  return index === 0 || (index > 0 && index < STOPS.length && (stars[STOPS[index - 1].id] || 0) >= 1)
}

export function saveStars(previous: Record<string, number>, id: string, stars: number): Record<string, number> {
  if (!STOPS.some(stop => stop.id === id) || !Number.isInteger(stars) || stars < 0 || stars > 3) throw new Error('Invalid adventure stars')
  return stars > (previous[id] || 0) ? { ...previous, [id]: stars } : previous
}

export function restoreStars(raw: unknown): Record<string, number> {
  const stars: Record<string, number> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return stars
  for (const { id } of STOPS) {
    const value = (raw as Record<string, unknown>)[id]
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 3) stars[id] = value
  }
  return stars
}

// Walking this week (Monday-Sunday) adds a little extra to every game. It is a bonus, never a requirement.
export const BONUS_KM_CAP = 3
export const BALLS_PER_KM = 3
export const BERRIES_PER_KM = 25
export function walkingBonus(progress: Progress, now = Date.now()) {
  const meters = completedRuns(progress, now).filter(({ record }) => Date.parse(record.finishedAt) >= weekStart(now))
    .reduce((sum, run) => sum + run.record.meters, 0)
  const km = Math.min(BONUS_KM_CAP, Math.floor(meters / 1000))
  return { meters, km, balls: km * BALLS_PER_KM, berries: km * BERRIES_PER_KM }
}
