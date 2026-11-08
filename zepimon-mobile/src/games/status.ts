// Status conditions your Pokemon's attacks can leave on foes in Route Guard and Trail Defense, as a move's secondary
// effect in the games: a chance on each hit, by the type of the move that lands (an egg move's own type counts). Rules
// in battle.ts; this file is which move causes what, for how long, and how it reads on the board.
//   burn, frostbite, poison: damage over time (frostbite also slows a little).
//   freeze: frozen solid, standing still; a Fire hit thaws it.
//   sleep: standing still.
//   paralysis: moving at half speed.
//   confusion: stumbling back the way it came.
// A foe has one of the first six at a time, as in the games; confusion comes on top. Bosses shake every condition off
// twice as fast. A foe that just thawed or woke cannot be frozen or put to sleep again for a moment (CALM_MS).
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
export const LASTS: Record<Condition, number> = { burn: 4000, freeze: 1500, frostbite: 4000, paralysis: 3000, sleep: 2000, poison: 4000, confusion: 1500 }
// Damage each second, as a share of the hit that caused it.
export const DOT: Partial<Record<Condition, number>> = { burn: 0.5, frostbite: 0.4, poison: 0.5 }
// How fast a foe moves under each (1 is its own speed; a negative one walks back).
export const PACE: Partial<Record<Condition, number>> = { freeze: 0, sleep: 0, paralysis: 0.5, frostbite: 0.75, confusion: -0.5 }
export const CALM_MS = 3000

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
