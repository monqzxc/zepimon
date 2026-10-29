import { lairMaps } from '../generated/lair-maps.js'
import { pokemonTypes } from '../generated/types.js'
import type { Direction, Point } from './safari-zone.ts'

// Each Legendary's lair: a room from Pokemon Emerald (scripts/build-lairs.py), the Legendary waiting in it and the
// entrance the player comes in by. Walking back out of that entrance before any seal is on means the next entry rolls
// the Legendary's Shiny chance again (src/expedition-encounter.ts). Rooms are Emerald's own: the Seafloor Cavern pool
// where Kyogre sleeps, the Cave of Origin's magma chamber, the top of Sky Pillar, the Regis' sealed chambers, Southern
// Island, Faraway Island and Birth Island, with fitting Emerald places standing in for Legendaries Emerald doesn't have.
// Where no Emerald room fits a Legendary's story, the lair is drawn for it (scripts/drawn_lairs.py): Deoxys among the
// meteorites of outer space, Rayquaza on the clouds of the ozone layer, Giratina in the Distortion World, Darkrai in a
// nightmare, Mew in a bubble playroom, Zygarde among its crystallised cells and Mewtwo in the lab it broke out of.
export type LairId = keyof typeof lairMaps
export type LairMap = { name: string, room: string, cols: number, rows: number, tiles: string[], legendary: Point, start: Point,
  entrance: Point, out: Direction, background: string }
export const LAIRS = lairMaps as Record<LairId, LairMap>

export const LAIR_OF: Record<string, LairId> = {
  Kyogre: 'seafloor-cavern', Lugia: 'seafloor-cavern', Manaphy: 'seafloor-cavern', Phione: 'seafloor-cavern',
  Groudon: 'cave-of-origin', Heatran: 'cave-of-origin', Entei: 'cave-of-origin', Moltres: 'cave-of-origin',
  Rayquaza: 'ozone-layer', 'Ho-Oh': 'sky-pillar',
  Regirock: 'regi-chamber', Regice: 'regi-chamber', Registeel: 'regi-chamber',
  Regigigas: 'sealed-chamber',
  Latias: 'southern-island', Latios: 'southern-island', Suicune: 'southern-island', Uxie: 'southern-island',
  Mesprit: 'southern-island', Azelf: 'southern-island',
  Mew: 'bubble-playroom', Celebi: 'faraway-island', Shaymin: 'faraway-island', Zygarde: 'cell-hollow',
  Deoxys: 'outer-space', Jirachi: 'birth-island', Cresselia: 'birth-island',
  Articuno: 'shoal-cave',
  Zapdos: 'new-mauville', Raikou: 'new-mauville', Zeraora: 'new-mauville', Magearna: 'new-mauville',
  Dialga: 'mt-pyre-summit', Palkia: 'mt-pyre-summit', Arceus: 'mt-pyre-summit',
  Giratina: 'distortion-world', Darkrai: 'nightmare-realm',
  Mewtwo: 'cinnabar-lab', Diancie: 'crystal-cavern'
}

// A Legendary no lair lists yet (a future addition) meets in the lair of its type.
const BY_TYPE: Record<string, LairId> = {
  water: 'seafloor-cavern', fire: 'cave-of-origin', ground: 'cave-of-origin', dragon: 'sky-pillar', flying: 'sky-pillar',
  rock: 'regi-chamber', steel: 'regi-chamber', normal: 'sealed-chamber', grass: 'faraway-island', bug: 'faraway-island',
  fairy: 'faraway-island', psychic: 'birth-island', ice: 'shoal-cave', electric: 'new-mauville', ghost: 'mt-pyre',
  dark: 'mt-pyre', poison: 'mt-pyre', fighting: 'crystal-cavern'
}

export function lairOf(name: string): LairId {
  const species = name.replace(/^Shiny /, '')
  return LAIR_OF[species] ?? BY_TYPE[(pokemonTypes as Record<string, string>)[species]] ?? 'regi-chamber'
}

// What drifts through each lair over Emerald's art: rising bubbles, embers, wind, dust, falling snow, leaves or sparks,
// or twinkling motes. Drawn by src/games/LairAmbience.tsx; nothing moves with reduced motion.
export type Ambience = { kind: 'rise' | 'fall' | 'drift' | 'twinkle', colors: string[], count: number, size: number }
export const AMBIENCE: Record<LairId, Ambience> = {
  'seafloor-cavern': { kind: 'rise', colors: ['#bfe8ff', '#7cc7f2'], count: 12, size: 6 },
  'cave-of-origin': { kind: 'rise', colors: ['#ffb347', '#ff6a2b', '#ffd27a'], count: 14, size: 4 },
  'sky-pillar': { kind: 'drift', colors: ['#ffffff', '#dff1ff'], count: 8, size: 5 },
  'regi-chamber': { kind: 'drift', colors: ['#e8cfa0', '#c9a26b'], count: 10, size: 3 },
  'sealed-chamber': { kind: 'twinkle', colors: ['#f5e6b8', '#cfd8ff'], count: 10, size: 4 },
  'southern-island': { kind: 'twinkle', colors: ['#ffffff', '#ffd6f0', '#c7ecff'], count: 12, size: 4 },
  'faraway-island': { kind: 'fall', colors: ['#ffc4e1', '#fff3a8', '#bff2a1'], count: 10, size: 5 },
  'birth-island': { kind: 'twinkle', colors: ['#ffffff', '#ffd27a', '#9fd8ff'], count: 14, size: 3 },
  'shoal-cave': { kind: 'fall', colors: ['#ffffff', '#e6f6ff'], count: 16, size: 4 },
  'new-mauville': { kind: 'twinkle', colors: ['#fff27a', '#9fe8ff'], count: 10, size: 4 },
  'mt-pyre-summit': { kind: 'drift', colors: ['#ffffff', '#e9e1ff'], count: 9, size: 5 },
  'mt-pyre': { kind: 'drift', colors: ['#b8a8ff', '#8fd9c8'], count: 9, size: 6 },
  'crystal-cavern': { kind: 'twinkle', colors: ['#ff8fa3', '#8fc8ff', '#ffffff'], count: 12, size: 4 },
  'outer-space': { kind: 'twinkle', colors: ['#ffffff', '#9fc4ff', '#ffd27a'], count: 16, size: 3 },
  'ozone-layer': { kind: 'drift', colors: ['#ffffff', '#e6f3ff'], count: 10, size: 7 },
  'distortion-world': { kind: 'drift', colors: ['#7a3cff', '#c2304a', '#ffcf5a'], count: 10, size: 4 },
  'nightmare-realm': { kind: 'drift', colors: ['#4a4f9a', '#8e8fd8', '#ff3048'], count: 10, size: 6 },
  'bubble-playroom': { kind: 'rise', colors: ['#c6ecff', '#ffc4e1', '#fff2a8'], count: 12, size: 7 },
  'cell-hollow': { kind: 'rise', colors: ['#3cff7a', '#b8ffcf'], count: 12, size: 4 },
  'cinnabar-lab': { kind: 'twinkle', colors: ['#a46bff', '#c08cff', '#5ff2e0'], count: 12, size: 4 }
}
