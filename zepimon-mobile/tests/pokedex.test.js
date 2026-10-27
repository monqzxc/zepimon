import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultDexFilter, defaultEggFilter, filterDex, filterEggs, generationsOf, isFiltered, regionName, speciesNumber, typesOf } from '../src/pokedex.ts'
import { eggs } from '../src/phone-adventure.ts'

const none = () => false
const find = (filter, caught = none) => filterEggs(eggs, { ...defaultEggFilter, ...filter }, caught)
const firsts = families => families.map(family => family[0])

test('sorts eggs by National Dex number either way, and by name', () => {
  const lowest = find({})
  assert.equal(lowest.length, eggs.length)
  assert.deepEqual(firsts(lowest.slice(0, 3)), ['Bulbasaur', 'Charmander', 'Squirtle'])
  const numbers = lowest.map(family => speciesNumber(family[0]))
  assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b))
  assert.deepEqual(find({ sort: 'number-desc' }), [...lowest].reverse())
  const names = firsts(find({ sort: 'az' }))
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)))
  assert.deepEqual(find({ sort: 'za' }), [...find({ sort: 'az' })].reverse())
})

test('searches names (ignoring case and accents), types and Dex numbers in any family member', () => {
  assert.deepEqual(firsts(find({ query: 'pikachu' })), ['Pikachu', 'Pichu'])
  assert.deepEqual(firsts(find({ query: 'flabebe' })), ['Flabébé'])
  for (const query of ['25', '#25', 'No. 025', 'no 25']) assert.deepEqual(firsts(find({ query })), ['Pikachu', 'Pichu'], query)
  assert.deepEqual(find({ query: 'fire' }), find({ type: 'fire' }))
  assert.deepEqual(find({ query: '9999' }), [])
})

test('filters eggs by generation and type through any family member', () => {
  const kanto = firsts(find({ generation: 1 }))
  assert.ok(kanto.includes('Bulbasaur') && kanto.includes('Pichu'), 'Pichu hatches into Pikachu, a Kanto Pokemon')
  assert.ok(!kanto.includes('Treecko'))
  const fire = firsts(find({ type: 'fire' }))
  assert.ok(fire.includes('Charmander') && !fire.includes('Squirtle'))
  assert.deepEqual(firsts(find({ generation: 3, type: 'grass' })).slice(0, 1), ['Treecko'])
})

test('filters eggs by what the Dex still misses', () => {
  const caught = name => ['Bulbasaur', 'Ivysaur', 'Venusaur', 'Charmander'].includes(name)
  assert.deepEqual(firsts(find({ status: 'caught' }, caught)), ['Bulbasaur'])
  const missing = firsts(find({ status: 'missing' }, caught))
  assert.ok(missing.includes('Charmander') && !missing.includes('Bulbasaur'))
  assert.equal(missing.length, eggs.length - 1)
})

test('lists the generations and types present, in order', () => {
  const generations = generationsOf(eggs.flat())
  assert.deepEqual(generations.slice(0, 2), [{ generation: 1, label: 'Gen 1 · Kanto' }, { generation: 2, label: 'Gen 2 · Johto' }])
  assert.deepEqual(generations.map(item => item.generation), [...generations.map(item => item.generation)].sort((a, b) => a - b))
  assert.equal(regionName(12), 'Gen 12')
  const types = typesOf(eggs.flat())
  assert.deepEqual(types.slice(0, 4), ['normal', 'fire', 'water', 'grass'])
  assert.equal(new Set(types).size, types.length)
  assert.deepEqual(generationsOf(['Mega Charizard X', 'Treecko']).map(item => item.generation), [1, 3])
})

const walked = { meters: 5000, source: 'watch' }
const safari = { meters: 0, source: 'safari' }
const dex = [
  { name: 'Treecko', normal: walked },
  { name: 'Mega Charizard X', normal: walked },
  { name: 'Charizard', shiny: walked },
  { name: 'Bulbasaur', normal: walked, shiny: walked },
  { name: 'Pikachu', normal: safari }
]
const findDex = filter => filterDex(dex, { ...defaultDexFilter, ...filter }).map(entry => entry.name)

test('sorts the Dex by number (Megas beside their species) or by name', () => {
  assert.deepEqual(findDex({}), ['Bulbasaur', 'Charizard', 'Mega Charizard X', 'Pikachu', 'Treecko'])
  assert.deepEqual(findDex({ sort: 'number-desc' }), ['Treecko', 'Pikachu', 'Mega Charizard X', 'Charizard', 'Bulbasaur'])
  assert.deepEqual(findDex({ sort: 'az' }), ['Bulbasaur', 'Charizard', 'Mega Charizard X', 'Pikachu', 'Treecko'])
  assert.deepEqual(findDex({ sort: 'za' }), ['Treecko', 'Pikachu', 'Mega Charizard X', 'Charizard', 'Bulbasaur'])
})

test('filters the Dex by search, generation, type and variant', () => {
  assert.deepEqual(findDex({ query: '6' }), ['Charizard', 'Mega Charizard X'])
  assert.deepEqual(findDex({ query: 'char' }), ['Charizard', 'Mega Charizard X'])
  assert.deepEqual(findDex({ generation: 3 }), ['Treecko'])
  assert.deepEqual(findDex({ type: 'grass' }), ['Bulbasaur', 'Treecko'])
  assert.deepEqual(findDex({ query: 'gras' }), ['Bulbasaur', 'Treecko'])
  assert.deepEqual(findDex({ variant: 'shiny' }), ['Bulbasaur', 'Charizard'])
  assert.deepEqual(findDex({ variant: 'normal' }), ['Bulbasaur', 'Mega Charizard X', 'Pikachu', 'Treecko'])
  assert.deepEqual(findDex({ variant: 'safari' }), ['Pikachu'])
  assert.deepEqual(findDex({ generation: 1, type: 'fire', variant: 'shiny' }), ['Charizard'])
})

test('knows when a filter is on', () => {
  assert.equal(isFiltered(defaultEggFilter), false)
  assert.equal(isFiltered({ ...defaultEggFilter, sort: 'za' }), false)
  assert.equal(isFiltered({ ...defaultEggFilter, type: 'fire' }), true)
  assert.equal(isFiltered({ ...defaultEggFilter, query: '  ' }), false)
  assert.equal(isFiltered(defaultDexFilter), false)
  assert.equal(isFiltered({ ...defaultDexFilter, variant: 'shiny' }), true)
})
