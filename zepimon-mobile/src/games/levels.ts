import { PATHS, WEATHER } from './battle.ts'
import type { BattleSpec, PathId, Weather } from './battle.ts'

// Trail Defense levels: five stages of five. Maps grow from 6 x 8 to 12 x 20, waves get longer and foes tougher, and
// every stage ends on a spiral with a Legendary boss at its heart. Stage 5 adds element tiles (src/games/trails.ts),
// squares where only a Pokemon of their type can stand. Each level unlocks once the one before has a star.
// Difficulty is tuned per map (bigger maps leave more room to build), so it does not rise in a straight line.
export type Stage = { name: string, habitat: string, foes: string[], blurb: string }
export type Level = { id: string, number: number, stage: number, name: string, blurb: string, spec: BattleSpec }
export const LEVELS_PER_STAGE = 5

export const STAGES: Stage[] = [
  { name: 'Viridian Meadows', habitat: 'grass', foes: ['normal', 'bug', 'flying', 'grass'], blurb: 'Gentle forest trails to learn the ropes.' },
  { name: 'Cerulean Coast', habitat: 'water', foes: ['water', 'electric', 'ice', 'flying'], blurb: 'Bigger shores and longer waves.' },
  { name: 'Ember Peaks', habitat: 'fire', foes: ['fire', 'rock', 'ground', 'fighting', 'poison'], blurb: 'Volcanic ridges where tough foes march.' },
  { name: 'Shadow Summit', habitat: 'ghost', foes: ['ghost', 'psychic', 'dark', 'ice', 'dragon'], blurb: 'Big, twisting trails through the dark.' },
  { name: 'Elemental Wilds', habitat: 'dragon', foes: ['dragon', 'steel', 'fairy', 'fighting', 'water', 'fire'],
    blurb: 'The biggest maps, with element tiles only their own type can stand on.' }
]

// The level maps are drawn bigger than the screen, so foes have farther to walk. From stage 2 on they walk faster to make
// up for it (stage 1 is for learning and keeps its pace), never quite as much as the longer walk adds.
const STAGE_PACE = [1, 1.1, 1.2, 1.25, 1.3]
type Plan = [path: PathId, habitat: string, waves: number, difficulty: number, blurb: string, boss?: string]
// Weather from stage 3 on (src/games/battle.ts WEATHER), by level number: it powers up foes of its types and brings
// them into the waves.
const WEATHER_BY_LEVEL: Record<number, Weather> = {
  11: 'sun', 12: 'sun', 13: 'sandstorm', 14: 'sun', 15: 'sun',
  16: 'fog', 17: 'fog', 18: 'fog', 19: 'hail', 20: 'fog',
  21: 'rain', 22: 'rain', 23: 'hail', 24: 'sandstorm', 25: 'sun'
}
const plans: Plan[] = [
  ['sprout-path', 'grass', 4, 0.8, 'A short trail through the trees. Place attackers right beside it.'],
  ['pidgey-bend', 'grass', 5, 1, 'Foes come in from the west this time. Cover both long straights.'],
  ['caterpie-crawl', 'bug', 6, 1.1, 'Three sweeps across the wood. A Pokemon between two sweeps hits both.'],
  ['weedle-woods', 'bug', 6, 1.3, 'Two long straights on a wider map. Evolve your best attackers.'],
  ['celebi-grove', 'grass', 7, 1.8, 'The trail spirals into the grove, where a Shadow Celebi waits.', 'Celebi'],
  ['tide-pools', 'water', 7, 1.75, 'Foes wade in from the east and leave the same way. Electric and Rock types shine.'],
  ['spark-shore', 'electric', 8, 2.2, 'Two long climbs along the shore, with room for a big team.'],
  ['seafoam-steps', 'ice', 8, 2, 'Four icy sweeps. Fire and Rock types make short work of Ice foes.'],
  ['harbor-hook', 'water', 9, 2.35, 'The trail hooks back into the harbor and ends in the middle.'],
  ['whirl-islands', 'water', 9, 2.75, 'A whirlpool spiral. Shadow Lugia rises from the deep.', 'Lugia'],
  ['ember-climb', 'fire', 9, 2.15, 'Foes climb up from the foot of the volcano this time.'],
  ['magma-hook', 'fire', 10, 2.7, 'A long hook around a lava field. Water and Ground types help.'],
  ['cinder-ridge', 'rock', 10, 3.15, 'Five sweeps across a nine-column ridge. Spread your team out.'],
  ['lava-fork', 'fire', 10, 3, 'Four lava channels side by side. The gaps between them are prime spots.'],
  ['mt-ember', 'fire', 11, 2.95, 'The crater spirals down to a Shadow Moltres.', 'Moltres'],
  ['haunted-wall', 'ghost', 11, 3.2, 'Ghosts weave over the battlements, then down a long road.'],
  ['phantom-fork', 'ghost', 11, 3.8, 'Five short tunnels, then two long sweeps home.'],
  ['shadow-maze', 'dark', 12, 3.3, 'Sweeps on top, a maze of tunnels below. Ghost and Dark types are strong here.'],
  ['turnback-cave', 'psychic', 12, 3.85, 'Five long tunnels through the cave: the longest trail of all.'],
  ['distortion-world', 'ghost', 13, 3.6, 'The spiral’s end. Shadow Giratina leads the last wave.', 'Giratina'],
  ['verdant-delta', 'grass', 13, 3.3, 'Water and Grass tiles sit between the sweeps. Only their own types can stand on them.'],
  ['thunder-plateau', 'electric', 13, 3.55, 'Three long columns. Electric tiles reach two of them at once; Rock tiles hold the turns.'],
  ['glacier-pass', 'ice', 14, 3.75, 'Ice tiles line the pass and Fire tiles warm the middle. Bring both if you have them.'],
  ['dragons-spine', 'dragon', 14, 4, 'Four ridges and the rarest tiles yet: Dragon, Fire and Rock.'],
  ['hall-of-origin', 'psychic', 15, 4.2, 'One tile of seven types around the final spiral. Shadow Arceus waits at its heart.', 'Arceus']
]

export const LEVELS: Level[] = plans.map(([path, habitat, waves, difficulty, blurb, boss], index) => {
  const stage = Math.floor(index / LEVELS_PER_STAGE)
  const weather = WEATHER_BY_LEVEL[index + 1]
  const foes = weather ? [...new Set([...STAGES[stage].foes, ...WEATHER[weather].types])] : STAGES[stage].foes
  return { id: `level-${index + 1}`, number: index + 1, stage, name: PATHS[path].name, blurb,
    spec: { layout: 'trail', waves, difficulty, habitat, foes, path, ...(boss ? { boss } : {}), ...(weather ? { weather } : {}), pace: STAGE_PACE[stage] } }
})

export function levelUnlocked(stars: Record<string, number>, index: number): boolean {
  return index === 0 || (index > 0 && index < LEVELS.length && (stars[LEVELS[index - 1].id] || 0) >= 1)
}

export function saveLevelStars(previous: Record<string, number>, id: string, stars: number): Record<string, number> {
  if (!LEVELS.some(level => level.id === id) || !Number.isInteger(stars) || stars < 0 || stars > 3) throw new Error('Invalid level stars')
  return stars > (previous[id] || 0) ? { ...previous, [id]: stars } : previous
}

export function restoreLevelStars(raw: unknown): Record<string, number> {
  const stars: Record<string, number> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return stars
  for (const { id } of LEVELS) {
    const value = (raw as Record<string, unknown>)[id]
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 3) stars[id] = value
  }
  return stars
}
