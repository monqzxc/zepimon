// Status conditions your Pokemon's attacks can leave on foes in Route Guard and Trail Defense, as a move's secondary
// effect in the games: a chance on each hit, by the type of the move that lands (an egg move's own type counts). Rules
// in battle.ts; this file is which move causes what, for how long, and how it reads on the board.
//   burn, frostbite, poison: damage over time (frostbite also slows a little).
//   freeze: frozen solid, standing still; a Fire hit thaws it.
//   sleep: standing still.
//   paralysis: moving at half speed.
//   confusion: stumbling back the way it came.
// A foe can carry several at once, each once. Another hit of burn, frostbite, poison or paralysis resets its time; freeze,
// sleep and confusion run their course without resetting, one of freeze and sleep at a time, and once over the foe
// cannot get that again for a moment (CALM_MS), so nothing locks a foe down for good. Slows add up but never below
// MIN_PACE. Every foe is immune to some by type, as in the games. Bosses shake conditions off twice as fast, carry at
// most BOSS_MAX at once and are immune to more, the Legendaries and Mythicals to several (immunities).
export type Condition = 'burn' | 'freeze' | 'frostbite' | 'paralysis' | 'sleep' | 'poison' | 'confusion'

// The three-letter tag the games show, its colour, and the word called out when it lands.
export const CONDITIONS: Record<Condition, { tag: string, color: string, word: string }> = {
  burn: { tag: 'BRN', color: '#E8673C', word: 'Burned!' },
  freeze: { tag: 'FRZ', color: '#5CC8F0', word: 'Frozen!' },
  frostbite: { tag: 'FRB', color: '#8FB8DE', word: 'Frostbite!' },
  paralysis: { tag: 'PAR', color: '#E8C42C', word: 'Paralyzed!' },
  sleep: { tag: 'SLP', color: '#9A9AB0', word: 'Asleep!' },
  poison: { tag: 'PSN', color: '#A453C8', word: 'Poisoned!' },
  confusion: { tag: 'CNF', color: '#E26AA8', word: 'Confused!' }
}

// What a move of each type may cause on a hit, and how likely. Types not listed cause nothing.
export const INFLICTS: Record<string, [Condition, number][]> = {
  fire: [['burn', 0.2]],
  ice: [['freeze', 0.1], ['frostbite', 0.2]],
  electric: [['paralysis', 0.25]],
  dragon: [['paralysis', 0.15]],
  normal: [['paralysis', 0.1]],
  grass: [['sleep', 0.15]],
  fairy: [['sleep', 0.15]],
  poison: [['poison', 0.3]],
  bug: [['poison', 0.15]],
  psychic: [['confusion', 0.2]],
  ghost: [['confusion', 0.15]]
}

// How long each lasts on a foe, in ms (a boss: half).
export const LASTS: Record<Condition, number> = { burn: 5000, freeze: 2000, frostbite: 5000, paralysis: 3500, sleep: 2000, poison: 5000, confusion: 2000 }
// Damage each second, as a share of the hit that caused it.
export const DOT: Partial<Record<Condition, number>> = { burn: 0.375, frostbite: 0.3, poison: 0.375 }
// How fast a foe moves under each (1 is its own speed; a negative one walks back).
export const PACE: Partial<Record<Condition, number>> = { freeze: 0, sleep: 0, paralysis: 0.5, frostbite: 0.75, confusion: -0.5 }
export const CALM_MS = 3000
export const MIN_PACE = 0.35
export const BOSS_MAX = 2
// Conditions that reset their time on another hit; the rest run their course.
export const REFRESHES: Condition[] = ['burn', 'frostbite', 'poison', 'paralysis']
// The order a foe shows them in, the strongest first: what stops it, then what hurts it, then what slows or turns it.
export const ORDER: Condition[] = ['freeze', 'sleep', 'burn', 'poison', 'frostbite', 'paralysis', 'confusion']

// What every foe of a type shrugs off, as in the games: Fire cannot be burned or frozen, Ice cannot be frozen or
// frostbitten, Electric cannot be paralyzed, Poison and Steel cannot be poisoned, and Grass shakes off sleep powders.
const TYPE_IMMUNE: Record<string, Condition[]> = {
  fire: ['burn', 'freeze'], ice: ['freeze', 'frostbite'], electric: ['paralysis'], poison: ['poison'], steel: ['poison'], grass: ['sleep']
}
// And what a boss of a type shrugs off besides, after the abilities its kind tends to have: Ground stays grounded
// (paralysis), Water puts out burns, Rock is too hard to burn, the steadier types keep their heads (confusion), Ghosts
// do not sleep, Fairies shake off poison, and Dragons stay on their feet (paralysis).
const BOSS_TYPE: Record<string, Condition[]> = {
  ground: ['paralysis'], water: ['burn'], rock: ['burn'], psychic: ['confusion'], fighting: ['confusion'], dark: ['confusion'], ghost: ['sleep'],
  fairy: ['poison'], dragon: ['paralysis']
}
// The Legendary and Mythical bosses, each by its nature: Moltres, a bird of flame, can be neither burned nor chilled;
// Celebi heals itself of what nature brings (Natural Cure); Arceus answers to almost nothing.
const LEGENDARY: Record<string, Condition[]> = {
  Celebi: ['sleep', 'poison', 'confusion'],
  Lugia: ['confusion', 'sleep', 'paralysis'],
  Moltres: ['burn', 'freeze', 'frostbite'],
  Mewtwo: ['confusion', 'sleep', 'paralysis'],
  Giratina: ['sleep', 'confusion', 'paralysis'],
  Arceus: ['sleep', 'freeze', 'confusion', 'poison']
}

// What a foe is immune to: its type's (TYPE_IMMUNE); a boss, its type's boss ones besides; a Legendary boss, the list
// above as well (or, for one not listed, sleep and confusion).
export function immunities(name: string, type: string, boss: boolean, legendary: boolean): Condition[] {
  const own = TYPE_IMMUNE[type] ?? []
  if (!boss) return own
  const extra = Object.hasOwn(LEGENDARY, name) ? LEGENDARY[name] : legendary ? ['sleep', 'confusion'] as Condition[] : []
  return ORDER.filter(condition => [...own, ...BOSS_TYPE[type] ?? [], ...extra].includes(condition))
}

// Rolls what one hit causes: the first of its type's conditions to come up, or null. random gives one number per roll.
export function rollCondition(type: string, random: () => number): Condition | null {
  for (const [condition, chance] of INFLICTS[type] ?? []) if (random() < chance) return condition
  return null
}

// What a move type may cause, in words for a Pokemon's details ("may burn (20%)").
export function inflictText(type: string): string {
  const verbs: Record<Condition, string> = { burn: 'burn', freeze: 'freeze', frostbite: 'frostbite', paralysis: 'paralyze', sleep: 'put to sleep',
    poison: 'poison', confusion: 'confuse' }
  const list = INFLICTS[type] ?? []
  return list.length ? 'may ' + list.map(([condition, chance]) => `${verbs[condition]} (${Math.round(chance * 100)}%)`).join(' or ') : ''
}
