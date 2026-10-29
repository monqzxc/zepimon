import { battleType } from './roster.ts'

// The Legendary battle at the end of an Expedition, in the style of the Gen III games: FIGHT, BAG, POKéMON and RUN.
// It is a catch, not a contest. Moves wear the Legendary down but always leave it at least 1 HP, nothing can faint,
// and the encounter is only claimed after a Poké Ball holds. Battle state is never saved: running, running out of
// balls or closing the app all leave the encounter waiting, with its trial done and the result from its lair unchanged.
//
//   intro → choose ⇄ attack (a move lands, then back to choose)
//                  ⇄ throw  (the ball shakes, then caught, or back to choose, or out of balls)
//                  → fled
// caught, out and fled are final.
export const BATTLE_BALLS = 5
export const FOE_HP = 100

export type BattleMenu = 'main' | 'fight' | 'bag' | 'party'
export type BattlePhase = 'intro' | 'choose' | 'attack' | 'throw' | 'caught' | 'out' | 'fled'
export type Move = { name: string, type: string, min: number, max: number }
export type LegendaryBattle = {
  foe: { name: string, shiny: boolean, level: number, hp: number },
  partner: { name: string, shiny: boolean, level: number },
  moves: Move[], phase: BattlePhase, menu: BattleMenu, balls: number, message: string, turn: number,
  hit: { move: Move, damage: number } | null,
  ball: { shakes: number, caught: boolean } | null
}

const MOVES: Record<string, string> = { normal: 'Headbutt', fire: 'Ember', water: 'Water Gun', electric: 'Thunder Shock', grass: 'Razor Leaf',
  ice: 'Ice Shard', fighting: 'Karate Chop', poison: 'Sludge', ground: 'Mud Shot', flying: 'Wing Attack', psychic: 'Confusion', bug: 'Bug Bite',
  rock: 'Rock Throw', ghost: 'Shadow Ball', dragon: 'Dragon Breath', dark: 'Bite', steel: 'Metal Claw', fairy: 'Fairy Wind' }
const MIGHTY = ['Mewtwo', 'Lugia', 'Ho-Oh', 'Kyogre', 'Groudon', 'Rayquaza', 'Deoxys', 'Dialga', 'Palkia', 'Giratina', 'Arceus', 'Zygarde']
const SMALL = ['Mew', 'Celebi', 'Jirachi', 'Phione', 'Manaphy', 'Shaymin']
// What a failed ball says after shaking 0, 1, 2 or 3 times, as in Emerald.
const BROKE_FREE = ['Oh, no! The Pokémon broke free!', 'Aww! It appeared to be caught!', 'Aargh! Almost had it!', 'Shoot! It was so close, too!']

export const legendaryLevel = (name: string) => MIGHTY.includes(name) ? 70 : SMALL.includes(name) ? 30 : 50

// The partner's own type move, plus False Swipe, which is gentle enough to weaken a Legendary safely.
export function partnerMoves(name: string): Move[] {
  const type = battleType(name)
  return [{ name: MOVES[type] ?? MOVES.normal, type, min: 18, max: 30 }, { name: 'False Swipe', type: 'normal', min: 8, max: 14 }]
}

// Lower HP makes a catch likelier: about 1 in 8 at full HP, close to 7 in 8 at 1 HP.
export const catchChance = (hp: number) => 0.12 + 0.75 * (1 - Math.max(1, Math.min(FOE_HP, hp)) / FOE_HP)

export function startBattle(foe: { name: string, shiny: boolean }, partner: { name: string, shiny: boolean }): LegendaryBattle {
  return { foe: { ...foe, level: legendaryLevel(foe.name), hp: FOE_HP }, partner: { ...partner, level: 50 }, moves: partnerMoves(partner.name),
    phase: 'intro', menu: 'main', balls: BATTLE_BALLS, turn: 0, hit: null, ball: null,
    message: `${foe.shiny ? 'A Shiny' : 'Wild'} ${foe.name} appeared!` }
}

const prompt = (battle: LegendaryBattle) => `What will ${battle.partner.name} do?`

export function finishIntro(battle: LegendaryBattle): LegendaryBattle {
  return battle.phase === 'intro' ? { ...battle, phase: 'choose', menu: 'main', message: prompt(battle) } : battle
}

const MENU_TEXT: Record<BattleMenu, (battle: LegendaryBattle) => string> = {
  main: prompt,
  fight: battle => `Choose a move for ${battle.partner.name}.`,
  bag: battle => battle.balls ? `Poké Balls left: ${battle.balls}. Lower HP makes a catch likelier.` : 'Your Bag has no Poké Balls left.',
  party: battle => `${battle.partner.name} is your only partner on this Expedition.`
}

export function chooseMenu(battle: LegendaryBattle, menu: BattleMenu): LegendaryBattle {
  return battle.phase === 'choose' ? { ...battle, menu, message: MENU_TEXT[menu](battle) } : battle
}

export function attackWith(battle: LegendaryBattle, index: number, random = Math.random): LegendaryBattle {
  const move = battle.moves[index]
  if (battle.phase !== 'choose' || battle.menu !== 'fight' || !move) return battle
  const damage = move.min + Math.floor(random() * (move.max - move.min + 1))
  return { ...battle, phase: 'attack', turn: battle.turn + 1, hit: { move, damage },
    foe: { ...battle.foe, hp: Math.max(1, battle.foe.hp - damage) }, message: `${battle.partner.name} used ${move.name}!` }
}

export function finishAttack(battle: LegendaryBattle): LegendaryBattle {
  if (battle.phase !== 'attack') return battle
  const { hp, name } = battle.foe
  const note = hp <= 1 ? `${name} is barely standing. Now’s the time for a Poké Ball!` : hp <= 30 ? `${name} is getting tired.` : `${name} shrugged off some of the blow.`
  return { ...battle, phase: 'choose', menu: 'main', message: `${note} ${prompt(battle)}` }
}

export function throwBall(battle: LegendaryBattle, random = Math.random): LegendaryBattle {
  if (battle.phase !== 'choose' || battle.menu !== 'bag' || battle.balls < 1) return battle
  const caught = random() < catchChance(battle.foe.hp)
  return { ...battle, phase: 'throw', turn: battle.turn + 1, balls: battle.balls - 1,
    ball: { caught, shakes: caught ? 3 : Math.floor(random() * 4) }, message: 'You threw a Poké Ball!' }
}

export function finishThrow(battle: LegendaryBattle): LegendaryBattle {
  if (battle.phase !== 'throw' || !battle.ball) return battle
  const { name, shiny } = battle.foe
  if (battle.ball.caught) return { ...battle, phase: 'caught', message: `Gotcha! ${shiny ? 'Shiny ' : ''}${name} was caught!` }
  const broke = BROKE_FREE[battle.ball.shakes]
  if (!battle.balls) return { ...battle, phase: 'out', message: `${broke} You’re out of Poké Balls, but ${name} will wait for you at the shrine.` }
  return { ...battle, phase: 'choose', menu: 'main', message: `${broke} ${prompt(battle)}` }
}

export function runFromBattle(battle: LegendaryBattle): LegendaryBattle {
  return battle.phase === 'choose' ? { ...battle, phase: 'fled', message: 'Got away safely! The Legendary will wait at the shrine.' } : battle
}
