import type { ImageSourcePropType } from 'react-native'
import { species, megaForms, sprites, shinySprites } from './generated/catalog.js'
import { pokemonTypes } from './generated/types.js'
import { spriteSources } from './generated/sprites.js'

const normal = sprites as Record<string, string>
const shiny = shinySprites as Record<string, string>
const images = spriteSources as Record<string, ImageSourcePropType>
export const speciesTotal = Object.keys(species).length

export function spriteSource(name: string, isShiny = false): ImageSourcePropType {
  if (name.startsWith('Shiny ')) { name = name.slice(6); isShiny = true }
  return images[(isShiny ? shiny[name] : normal[name]) || normal[name] || normal.Egg]
}
export function pokemonType(name: string): string {
  return (pokemonTypes as Record<string, string>)[name.replace(/^Shiny /, '')] || 'normal'
}
function baseSpecies(name: string) {
  const catalog = species as Record<string, { id: number, gen: number }>
  const megas = megaForms as Record<string, string[]>
  const plain = name.replace(/^Shiny /, '')
  const base = catalog[plain] ? plain : Object.keys(megas).find(key => megas[key].includes(plain))
  return base ? catalog[base] : undefined
}
export function pokemonGeneration(name: string): number {
  return baseSpecies(name)?.gen || 0
}
// National Dex number (Mega forms share their base species' number), 0 when unknown.
export function pokemonNumber(name: string): number {
  return baseSpecies(name)?.id || 0
}
export const dexNumber = (name: string) => {
  const id = pokemonNumber(name)
  return id ? 'No. ' + String(id).padStart(4, '0') : 'No. ----'
}
// Official type colors, darkened where needed so white badge text stays readable (4.5:1).
export const typeColors: Record<string, string> = {
  normal: '#747674', fire: '#e42829', water: '#2574d9', electric: '#937100', grass: '#358722', ice: '#268097',
  fighting: '#ba5d00', poison: '#9141cb', ground: '#915121', flying: '#557a9e', psychic: '#d53a6c', bug: '#707c13',
  rock: '#7a765a', ghost: '#704170', dragon: '#5060e1', dark: '#624d4e', steel: '#4a7c8e', fairy: '#ae52ae'
}
// Pale tints of the same type colors for card backgrounds; dark text stays above 11:1 on all of them.
export const typeTints: Record<string, string> = {
  normal: '#f0f0f0', fire: '#fbdddd', water: '#ddebfc', electric: '#fef5d6', grass: '#e0f0dd', ice: '#e0f7fd',
  fighting: '#ffebd6', poison: '#ede1f7', ground: '#ede3db', flying: '#ebf4fc', psychic: '#fce1ea', bug: '#edf0da',
  rock: '#f2f1eb', ghost: '#e8e1e8', dragon: '#e3e6fa', dark: '#e6e3e3', steel: '#e6f0f4', fairy: '#fce8fc'
}
