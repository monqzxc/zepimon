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
export function pokemonGeneration(name: string): number {
  const catalog = species as Record<string, { id: number, gen: number }>
  const megas = megaForms as Record<string, string[]>
  const base = catalog[name] ? name : Object.keys(megas).find(key => megas[key].includes(name))
  return base ? catalog[base]?.gen || 0 : 0
}
export const habitatColors: Record<string, string> = {
  normal: '#303148', grass: '#164336', bug: '#35441f', fire: '#61332c', water: '#16465e',
  electric: '#514c25', ice: '#255563', fighting: '#573436', poison: '#493358', ground: '#504431',
  flying: '#334861', psychic: '#593048', rock: '#494833', ghost: '#37294f', dragon: '#29355c',
  dark: '#272d3b', steel: '#344950', fairy: '#573b54'
}
