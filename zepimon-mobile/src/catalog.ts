import type { ImageSourcePropType } from 'react-native'
import { species, sprites, shinySprites } from './generated/catalog.js'
import { pokemonTypes } from './generated/types.js'
import { spriteSources } from './generated/sprites.js'
import { generationOf, speciesNumber } from './pokedex'

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
export const pokemonGeneration = generationOf
// National Dex number (Mega forms share their base species' number), 0 when unknown.
export const pokemonNumber = speciesNumber
export const dexNumber = (name: string) => {
  const id = pokemonNumber(name)
  return id ? 'No. ' + String(id).padStart(4, '0') : 'No. ----'
}
// Type colors and their card tints, one set per theme, are in src/palettes.ts.
export { typeColors } from './palettes'
