import { megaForms, species } from './generated/catalog.js'
import { pokemonTypes } from './generated/types.js'
import type { DexEntry } from './journal.ts'

// Pokedex-style sorting and filtering for the Dex tab and the egg picker: by National Dex number or name, by
// generation (region), by type, and a search that takes a name, a type or a number. Generations and types come from
// the Pokemon listed, so a new generation added to the catalog gets its own filter without code changes.

export type SortOrder = 'number' | 'number-desc' | 'az' | 'za'
export const sortOrders: [SortOrder, string][] = [['number', 'Lowest No.'], ['number-desc', 'Highest No.'], ['az', 'A–Z'], ['za', 'Z–A']]
const regions = ['', 'Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Paldea']
// The order the games list types in.
const typeOrder = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
  'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy']

const catalog = species as Record<string, { id: number, gen: number }>
const types = pokemonTypes as Record<string, string>
const megaBase = new Map(Object.entries(megaForms as Record<string, string[]>).flatMap(([base, forms]) => forms.map(form => [form, base])))

// The species a Pokemon belongs to, with its National Dex number and generation; a Mega form counts as its base.
export function speciesOf(name: string): { id: number, gen: number } | undefined {
  const plain = name.replace(/^Shiny /, '')
  return catalog[plain] ?? catalog[megaBase.get(plain) ?? '']
}
export const speciesNumber = (name: string) => speciesOf(name)?.id ?? 0
export const generationOf = (name: string) => speciesOf(name)?.gen ?? 0
export const typeOf = (name: string) => types[name.replace(/^Shiny /, '')] || 'normal'
export const regionName = (generation: number) => regions[generation] || `Gen ${generation}`

// The generations among these Pokemon, with region names, in order.
export function generationsOf(names: string[]): { generation: number, label: string }[] {
  const present = new Set(names.map(generationOf).filter(Boolean))
  return [...present].sort((a, b) => a - b).map(generation => ({ generation, label: `Gen ${generation} · ${regionName(generation)}` }))
}

// The types among these Pokemon, in the games' order (an unknown type goes last).
export function typesOf(names: string[]): string[] {
  const rank = (type: string) => typeOrder.includes(type) ? typeOrder.indexOf(type) : typeOrder.length
  return [...new Set(names.map(typeOf))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

// Accents and case don't matter: "flabebe" finds Flabébé.
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
// Digits ("25", "#25", "No. 025") find a National Dex number; other text finds names, or types by their start.
function searcher(query: string): (name: string) => boolean {
  const text = fold(query.trim())
  const number = /^(?:#|no\.?\s*)?(\d+)$/.exec(text)
  if (number) return name => speciesNumber(name) === Number(number[1])
  return name => fold(name).includes(text) || typeOf(name).startsWith(text)
}

const byName = (a: string, b: string) => a.localeCompare(b)
const byNumber = (a: string, b: string) => (speciesNumber(a) || Infinity) - (speciesNumber(b) || Infinity) || byName(a, b)
const reversed = (order: SortOrder) => order === 'number-desc' || order === 'za'
function sorter(order: SortOrder): (a: string, b: string) => number {
  const compare = order === 'number' || order === 'number-desc' ? byNumber : byName
  return reversed(order) ? (a, b) => compare(b, a) : compare
}

type Filter = { query: string, sort: SortOrder, generation: number, type: string | null }
export function isFiltered(filter: Filter & { status?: EggStatus, variant?: DexVariant }) {
  return !!filter.query.trim() || !!filter.generation || !!filter.type || (filter.status ?? 'all') !== 'all' || (filter.variant ?? 'all') !== 'all'
}
// Search, generation and type filters, matching when any of the names does.
function matcher(filter: Filter): (names: string[]) => boolean {
  const search = filter.query.trim() ? searcher(filter.query) : null
  return names => (!search || names.some(search)) && (!filter.generation || names.some(name => generationOf(name) === filter.generation)) &&
    (!filter.type || names.some(name => typeOf(name) === filter.type))
}

// Eggs. missing: a family with a Pokemon not in your Dex yet. caught: every Pokemon of the family is in it.
export type EggStatus = 'all' | 'missing' | 'caught'
export type EggFilter = Filter & { status: EggStatus }
export const defaultEggFilter: EggFilter = { query: '', sort: 'number', generation: 0, type: null, status: 'all' }
export const caughtCount = (family: string[], caught: (name: string) => boolean) => family.filter(caught).length

// A family matches when any of its Pokemon does, so the Pichu egg shows under Kanto (Pikachu) and Electric. Families
// that start alike (the Eevee branches) are ordered by the whole family, so every order is exact both ways.
export function filterEggs(eggs: string[][], filter: EggFilter, caught: (name: string) => boolean): string[][] {
  const matches = matcher(filter)
  const compare = sorter(filter.sort)
  const tie = reversed(filter.sort) ? -1 : 1
  return eggs.filter(family => {
    if (!matches(family)) return false
    if (filter.status === 'all') return true
    const complete = caughtCount(family, caught) === family.length
    return filter.status === 'caught' ? complete : !complete
  }).sort((a, b) => compare(a[0], b[0]) || tie * a.join(' ').localeCompare(b.join(' ')))
}

// The Dex. safari: caught in Safari Hunt, with no walking record yet.
export type DexVariant = 'all' | 'normal' | 'shiny' | 'safari'
export type DexFilter = Filter & { variant: DexVariant }
export const defaultDexFilter: DexFilter = { query: '', sort: 'number', generation: 0, type: null, variant: 'all' }
export const fromSafari = (entry: DexEntry) => entry.normal?.source === 'safari' || entry.shiny?.source === 'safari'

export function filterDex(entries: DexEntry[], filter: DexFilter): DexEntry[] {
  const matches = matcher(filter)
  const compare = sorter(filter.sort)
  return entries.filter(entry => matches([entry.name]) && (filter.variant === 'all' ||
    (filter.variant === 'safari' ? fromSafari(entry) : filter.variant === 'shiny' ? !!entry.shiny : !!entry.normal)))
    .sort((a, b) => compare(a.name, b.name))
}
