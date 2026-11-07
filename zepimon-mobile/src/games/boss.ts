import { battleType } from './roster.ts'

// Boss skills (Route Guard and Trail Defense): every boss has a few moves it uses in turn. It stops, charges for a
// moment (BOSS_CHARGE, a ring on the board shows it coming), then uses one, and charges the next BOSS_EVERY later. Rules
// in battle.ts; this file is only which boss knows what, and the words for it.
//   dash: rushes ahead at BOSS_DASH times its speed for a while.
//   shield: a shield that soaks up hits (not poison) until it breaks or fades.
//   blast: strikes your Pokemon nearby; they can faint.
//   stun: your Pokemon nearby cannot act for a while.
//   heal: recovers health and shakes off slow and poison.
//   summon: calls two foes to its side.
export type BossSkill = 'dash' | 'shield' | 'blast' | 'stun' | 'heal' | 'summon'
export type BossMove = { skill: BossSkill, move: string }

export const BOSS_FIRST = 3000, BOSS_EVERY = 5500, BOSS_CHARGE = 900
export const BOSS_DASH = 2.4, DASH_MS = 2000
export const SHIELD_SHARE = 0.3, SHIELD_MS = 6000
export const BLAST_REACH = 2.3, BLAST_DAMAGE = 30
export const STUN_REACH = 2.5, STUN_MS = 2500
export const HEAL_SHARE = 0.15
export const SUMMONS = 2

// What each skill does, as the battle says it ("Moltres used Heat Wave: it blasts nearby Pokemon!").
export const SKILL_TEXT: Record<BossSkill, string> = {
  dash: 'it rushes ahead', shield: 'it is shielded', blast: 'it blasts nearby Pokemon',
  stun: 'nearby Pokemon are stunned', heal: 'it recovers health', summon: 'it calls for help'
}
// The board's mark for each, on the boss while it charges.
export const SKILL_MARKS: Record<BossSkill, string> = { dash: '»', shield: '◈', blast: '✸', stun: '✷', heal: '✚', summon: '❖' }

// A boss's two moves by its type, and the type's blast and stun moves.
const BY_TYPE: Record<string, [BossSkill, BossSkill]> = {
  fire: ['blast', 'dash'], water: ['blast', 'shield'], grass: ['heal', 'summon'], electric: ['dash', 'stun'], ice: ['stun', 'shield'],
  rock: ['shield', 'blast'], ground: ['blast', 'shield'], steel: ['shield', 'stun'], psychic: ['stun', 'shield'], ghost: ['stun', 'dash'],
  dark: ['dash', 'stun'], dragon: ['blast', 'dash'], fighting: ['dash', 'blast'], poison: ['blast', 'heal'], bug: ['summon', 'dash'],
  flying: ['dash', 'blast'], fairy: ['heal', 'shield'], normal: ['heal', 'blast']
}
const BLASTS: Record<string, string> = {
  fire: 'Flamethrower', water: 'Hydro Pump', grass: 'Solar Beam', electric: 'Thunder', ice: 'Blizzard', rock: 'Rock Slide',
  ground: 'Earthquake', steel: 'Flash Cannon', psychic: 'Psychic', ghost: 'Shadow Ball', dark: 'Dark Pulse', dragon: 'Dragon Pulse',
  fighting: 'Close Combat', poison: 'Sludge Bomb', bug: 'Bug Buzz', flying: 'Hurricane', fairy: 'Moonblast', normal: 'Hyper Beam'
}
const STUNS: Record<string, string> = { electric: 'Thunder Wave', psychic: 'Hypnosis', ice: 'Icy Wind', grass: 'Sleep Powder', ghost: 'Confuse Ray' }
const NAMES: Record<Exclude<BossSkill, 'blast' | 'stun'>, string> = { dash: 'Agility', shield: 'Protect', heal: 'Recover', summon: 'Call for Help' }

// The Legendaries that lead a stage's last level as bosses, with three moves of their own (Arceus, the last, four).
const LEGENDARY: Record<string, BossMove[]> = {
  Celebi: [{ skill: 'heal', move: 'Recover' }, { skill: 'stun', move: 'Future Sight' }, { skill: 'summon', move: 'Leaf Storm' }],
  Lugia: [{ skill: 'blast', move: 'Aeroblast' }, { skill: 'shield', move: 'Protect' }, { skill: 'heal', move: 'Recover' }],
  Moltres: [{ skill: 'blast', move: 'Heat Wave' }, { skill: 'dash', move: 'Agility' }, { skill: 'heal', move: 'Roost' }],
  Giratina: [{ skill: 'shield', move: 'Shadow Force' }, { skill: 'stun', move: 'Scary Face' }, { skill: 'blast', move: 'Dragon Pulse' }],
  Arceus: [{ skill: 'blast', move: 'Judgment' }, { skill: 'shield', move: 'Protect' }, { skill: 'dash', move: 'Extreme Speed' },
    { skill: 'heal', move: 'Recover' }]
}

// The moves a boss uses, in turn.
export function bossMoves(name: string): BossMove[] {
  if (Object.hasOwn(LEGENDARY, name)) return LEGENDARY[name]
  const type = battleType(name)
  return (BY_TYPE[type] ?? BY_TYPE.normal).map(skill => ({ skill,
    move: skill === 'blast' ? BLASTS[type] ?? BLASTS.normal : skill === 'stun' ? STUNS[type] ?? 'Scary Face' : NAMES[skill] }))
}
