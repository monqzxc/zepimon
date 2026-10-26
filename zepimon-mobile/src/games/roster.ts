import { megaForms, routes, species } from '../generated/catalog.js'
import { pokemonTypes } from '../generated/types.js'
import { legendarySpecies } from '../generated/expedition.js'
import { eggMoveData } from '../generated/egg-moves.js'

const types = pokemonTypes as Record<string, string>
const megas = megaForms as Record<string, string[]>
const catalog = species as Record<string, { id: number, gen: number }>
const families = routes as string[][]
const eggData = eggMoveData as unknown as { moves: Record<string, [string, string, number]>, lists: string[][], species: Record<string, number> }

// family is the evolution route a card follows: Route Guard places the owned form directly, Trail Defense starts at
// family[0] and can evolve to the end. hatched cards came from a watch egg, so, like bred Pokemon, they know egg moves.
export type TeamCard = { name: string, shiny: boolean, family: string[], loaner?: boolean, hatched?: boolean }
export type EggMove = { name: string, type: string, power: number }
export type WildPokemon = { name: string, stage: number, weight: number }

// Everyone can play before importing a journal.
export const LOANERS = ['Bulbasaur', 'Charmander', 'Squirtle', 'Pikachu', 'Geodude', 'Gastly']
export const TEAM_SIZE = 6

const plain = (name: string) => name.replace(/^Shiny /, '')
const megaBase = (name: string) => Object.keys(megas).find(base => megas[base].includes(name))
export const cardKey = (card: { name: string, shiny: boolean }) => (card.shiny ? 'Shiny ' : '') + card.name
export const isLegendary = (name: string) => legendarySpecies.includes(plain(name))

export function familyOf(name: string): string[] {
  const own = megaBase(plain(name)) ?? plain(name)
  return families.find(route => route.includes(own)) ?? [own]
}

export function stageOf(name: string): number {
  const own = plain(name)
  if (megaBase(own)) return 3
  return Math.min(3, Math.max(1, familyOf(own).indexOf(own) + 1))
}

export function battleType(name: string): string {
  const own = plain(name)
  return types[own] || types[megaBase(own) ?? ''] || 'normal'
}

// Gen II-IV egg moves (src/generated/egg-moves.js), shared by the whole evolution chain. Power is 0 for status moves.
export function eggMovesOf(name: string): EggMove[] {
  const own = plain(name)
  const index = eggData.species[megaBase(own) ?? own] ?? eggData.species[familyOf(own)[0]]
  return index === undefined ? [] : eggData.lists[index].map(key => {
    const [moveName, type, power] = eggData.moves[key]
    return { name: moveName, type, power }
  })
}

// Loaners plus every non-Legendary Dex form; Normal and Shiny cards are separate but look the same in battle.
// caught lists Dex keys that did not hatch from a watch egg (Safari catches): they join teams without egg moves.
export function teamChoices(dexKeys: readonly string[], caught: readonly string[] = []): TeamCard[] {
  const cards = new Map<string, TeamCard>()
  for (const name of LOANERS) cards.set(name, { name, shiny: false, family: familyOf(name), loaner: true })
  for (const key of dexKeys) {
    const name = plain(key)
    if (name === 'Egg' || isLegendary(name) || (!types[name] && !megaBase(name))) continue
    const card = { name, shiny: key.startsWith('Shiny '), family: familyOf(name), hatched: !caught.includes(key) }
    cards.set(cardKey(card), card)
  }
  return [...cards.values()]
}

// A balanced default: a berry grower, a blocker, then the strongest cards with different types.
export function autoTeam(choices: readonly TeamCard[], size = TEAM_SIZE): TeamCard[] {
  // Owned evolved forms first (Route Guard places them as they are), then hatched cards with egg moves.
  const ranked = [...choices].sort((a, b) => stageOf(b.name) - stageOf(a.name) || Number(!!b.hatched) - Number(!!a.hatched) ||
    Number(!!a.loaner) - Number(!!b.loaner) || a.name.localeCompare(b.name))
  const team: TeamCard[] = []
  const add = (card?: TeamCard) => { if (card && team.length < size && !team.includes(card)) team.push(card) }
  add(ranked.find(card => battleType(card.name) === 'grass'))
  add(ranked.find(card => ['rock', 'ground', 'steel'].includes(battleType(card.name))))
  for (const card of ranked) if (!team.some(other => battleType(other.name) === battleType(card.name))) add(card)
  for (const card of ranked) if (!team.some(other => other.family === card.family)) add(card)
  for (const card of ranked) add(card)
  return team
}

export function legendaryAssists(dexKeys: readonly string[]): string[] {
  return [...new Set(dexKeys.map(plain).filter(isLegendary))].sort()
}

// Gen 1-4 wild Pokemon of the given types. Later evolutions are rarer; single-stage Pokemon sit in between.
export function wildPool(foeTypes: readonly string[]): WildPokemon[] {
  const pool = new Map<string, WildPokemon>()
  for (const route of families) {
    route.forEach((name, index) => {
      if (!foeTypes.includes(types[name]) || (catalog[name]?.gen ?? 99) > 4 || isLegendary(name)) return
      const weight = route.length === 1 ? 3 : [10, 3, 1][index] ?? 1
      const stage = Math.min(3, index + 1)
      if (!pool.has(name) || pool.get(name)!.weight < weight) pool.set(name, { name, stage, weight })
    })
  }
  return [...pool.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function pickWeighted<T extends { weight: number }>(items: readonly T[], random = Math.random): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0)
  let roll = random() * total
  for (const item of items) {
    roll -= item.weight
    if (roll < 0) return item
  }
  return items[items.length - 1]
}
