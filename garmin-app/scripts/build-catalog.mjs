// Writes resources/data/catalog.json for the Garmin app from the Zepp watch app's catalog, so both offer the same
// eggs: every family except the Legendary and Mythical ones met on Expeditions. Each egg is [route, family, megas]:
// route is its index in hatdog-app's routes (records and the cloud key adventures by it), megas the Mega forms its
// last stage can reach at 21 km.
// Usage: node garmin-app/scripts/build-catalog.mjs
import { writeFileSync } from 'node:fs'
import { routes, megaForms } from '../../hatdog-app/page/catalog.js'
import { legendarySpecies } from '../../hatdog-app/shared/expedition.js'

const eggs = routes.map((family, route) => [route, family, megaForms[family[family.length - 1]] || []])
  .filter(([, family]) => !legendarySpecies.includes(family[0]))
writeFileSync(new URL('../resources/data/catalog.json', import.meta.url), JSON.stringify({ eggs }) + '\n')
console.log(`Wrote ${eggs.length} eggs`)
