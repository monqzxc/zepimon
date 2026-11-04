import type { ImageSourcePropType } from 'react-native'
import { species, sprites, shinySprites } from './generated/catalog.js'
import { spriteForm } from './generated/forms.js'
import { spriteSources } from './generated/sprites.js'
import { generationOf, speciesNumber, typeOf } from './pokedex'

const normal = sprites as Record<string, string>
const shiny = shinySprites as Record<string, string>
const images = spriteSources as Record<string, ImageSourcePropType>
export const speciesTotal = Object.keys(species).length

// A Dynamax form uses its species' artwork (drawn larger with a red glow by src/Sprite.tsx).
export function spriteSource(name: string, isShiny = false): ImageSourcePropType {
  name = spriteForm(name)
  if (name.startsWith('Shiny ')) { name = name.slice(6); isShiny = true }
  return images[(isShiny ? shiny[name] : normal[name]) || normal[name] || normal.Egg]
}
export const isDynamax = (name: string) => name.replace(/^Shiny /, '').startsWith('Dynamax ')
export const pokemonType = typeOf
export const pokemonGeneration = generationOf
// National Dex number (Mega, Dynamax and Gigantamax forms share their base species' number), 0 when unknown.
export const pokemonNumber = speciesNumber
export const dexNumber = (name: string) => {
  const id = pokemonNumber(name)
  return id ? 'No. ' + String(id).padStart(4, '0') : 'No. ----'
}
// Type colors and their card tints, one set per theme, are in src/palettes.ts.
export { typeColors } from './palettes'
