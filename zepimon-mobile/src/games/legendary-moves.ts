import { MOVES } from './battle.ts'
import { battleType } from './roster.ts'

// Each Legendary's own move, called out when it answers your call in Route Guard and Trail Defense
// (src/games/AssistMove.tsx). Its signature move where it has one, else the move it is best known for. A Legendary
// missing here (or any other Pokemon) falls back to its type's battle move.
export const SIGNATURE_MOVES: Record<string, string> = {
  Articuno: 'Freeze-Dry', Zapdos: 'Thunder', Moltres: 'Sky Attack', Mewtwo: 'Psystrike', Mew: 'Psychic',
  Raikou: 'Thunder Fang', Entei: 'Sacred Fire', Suicune: 'Aurora Beam', Lugia: 'Aeroblast', 'Ho-Oh': 'Sacred Fire',
  Celebi: 'Leaf Storm', Regirock: 'Stone Edge', Regice: 'Ice Beam', Registeel: 'Flash Cannon', Latias: 'Mist Ball',
  Latios: 'Luster Purge', Kyogre: 'Origin Pulse', Groudon: 'Precipice Blades', Rayquaza: 'Dragon Ascent',
  Jirachi: 'Doom Desire', Deoxys: 'Psycho Boost', Uxie: 'Future Sight', Mesprit: 'Extrasensory', Azelf: 'Zen Headbutt',
  Dialga: 'Roar of Time', Palkia: 'Spacial Rend', Heatran: 'Magma Storm', Regigigas: 'Crush Grip', Giratina: 'Shadow Force',
  Cresselia: 'Moonblast', Phione: 'Water Pulse', Manaphy: 'Hydro Pump', Darkrai: 'Dark Pulse', Shaymin: 'Seed Flare',
  Arceus: 'Judgment', Zygarde: 'Thousand Arrows', Diancie: 'Diamond Storm', Magearna: 'Fleur Cannon', Zeraora: 'Plasma Fists'
}

export const signatureMove = (name: string): string => SIGNATURE_MOVES[name] ?? MOVES[battleType(name)] ?? MOVES.normal
