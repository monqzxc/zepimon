// Legendary/Mythical flags from the bundled PokeAPI pokemon_species.csv.
// Keep this order stable: expedition rewards use these indices across app versions.
export const legendarySpecies = ['Articuno', 'Zapdos', 'Moltres', 'Mewtwo', 'Mew',
  'Raikou', 'Entei', 'Suicune', 'Lugia', 'Ho-Oh', 'Celebi', 'Regirock', 'Regice',
  'Registeel', 'Latias', 'Latios', 'Kyogre', 'Groudon', 'Rayquaza', 'Jirachi', 'Deoxys',
  'Uxie', 'Mesprit', 'Azelf', 'Dialga', 'Palkia', 'Heatran', 'Regigigas', 'Giratina',
  'Cresselia', 'Phione', 'Manaphy', 'Darkrai', 'Shaymin', 'Arceus', 'Zygarde', 'Diancie',
  'Magearna', 'Zeraora']
export const expeditionGoal = 25000
export const clueMilestones = [5000, 15000, 25000]

export function validateExpedition(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !Number.isSafeInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff ||
      !Number.isSafeInteger(value.startedAt) || value.startedAt < 0 || value.startedAt > 8.64e15 ||
      !Number.isFinite(value.meters) || value.meters < 0 || value.meters > 100000000) {
    throw new Error('Invalid expedition progress')
  }
  return { seed: value.seed, startedAt: value.startedAt, meters: value.meters }
}

export function ensureExpedition(state, now = Date.now()) {
  if (!state.expedition) state.expedition = { seed: Math.floor(Math.random() * 0x100000000), startedAt: now, meters: 0 }
  state.expedition = validateExpedition(state.expedition)
  return state.expedition
}

export function expeditionKey(value) { return value.startedAt + ':' + value.seed }

export function expeditionEncounter(value, index) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= 4000) throw new Error('Invalid expedition encounter')
  // Stable seeded draw: reopening, importing twice or restoring on another phone
  // cannot reroll a reward. Only the compact seed and distance need to sync.
  let draw = (value.seed + Math.imul(index + 1, 0x9e3779b9)) >>> 0
  draw = Math.imul(draw ^ (draw >>> 16), 0x85ebca6b)
  draw = Math.imul(draw ^ (draw >>> 13), 0xc2b2ae35)
  draw = (draw ^ (draw >>> 16)) >>> 0
  return { name: legendarySpecies[(value.seed + index) % legendarySpecies.length],
    shiny: Math.floor(draw / 0x100000000 * 50) === 0 }
}
