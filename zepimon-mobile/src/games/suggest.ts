import { PATHS, effectiveness, kitFor } from './battle.ts'
import type { BattleSpec } from './battle.ts'
import { TEAM_SIZE, battleType, stageOf } from './roster.ts'
import type { TeamCard } from './roster.ts'

// A team suggested for one Trail Defense level, from the cards you have: a berry grower, Pokemon for the map's element
// tiles (two of a type when it has three or more tiles), a blocker for the turns, then the attackers that hit this
// stage's foes and its boss hardest, with types spread out. Each pick says why; tile types you have no Pokemon for are
// listed, as those tiles stay empty.
export type Suggestion = { team: TeamCard[], notes: string[], missing: string[] }
const label = (type: string) => type[0].toUpperCase() + type.slice(1)
const BLOCKERS = ['rock', 'ground', 'steel']

export function suggestTeam(choices: readonly TeamCard[], spec: BattleSpec, size = TEAM_SIZE): Suggestion {
  // Trail Defense places every family at its first stage, so that form's type is the one that counts.
  const typeOf = (card: TeamCard) => battleType(card.family[0])
  const foes = [...spec.foes, ...(spec.boss ? [battleType(spec.boss)] : [])]
  const strongAgainst = (card: TeamCard) => [...new Set(foes.filter(foe => effectiveness(typeOf(card), foe) > 1))]
  const offense = (card: TeamCard) => foes.reduce((sum, foe) => sum + effectiveness(typeOf(card), foe) - 1, 0)
  const rank = (card: TeamCard) => offense(card) * 3 + stageOf(card.name) + (card.hatched ? 0.5 : 0) - (card.loaner ? 0.25 : 0)
  const ranked = [...choices].sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name))
  const team: TeamCard[] = [], notes: string[] = [], missing: string[] = []
  const take = (card: TeamCard | undefined) => { if (card && team.length < size && !team.includes(card)) { team.push(card); return card } }
  const first = (card: TeamCard) => card.family[0]

  const grower = take(ranked.find(card => kitFor(first(card), 'trail').effect === 'produce'))
  if (grower) notes.push(`${first(grower)} grows berries to pay for the rest.`)

  const counts = new Map<string, number>()
  for (const type of PATHS[spec.path].tiles.values()) counts.set(type, (counts.get(type) ?? 0) + 1)
  for (const [type, count] of [...counts].sort((a, b) => b[1] - a[1])) {
    const fits = ranked.filter(card => typeOf(card) === type)
    const picked = fits.filter(card => !team.includes(card)).slice(0, count >= 3 ? 2 : 1).map(take).filter((card): card is TeamCard => !!card)
    const all = [...new Set([...team.filter(card => typeOf(card) === type)])]
    if (all.length) notes.push(`${all.map(first).join(' and ')} for the ${count} ${label(type)} tile${count === 1 ? '' : 's'}.`)
    else if (!picked.length) missing.push(type)
  }

  if (!team.some(card => BLOCKERS.includes(typeOf(card)))) {
    const blocker = take(ranked.find(card => BLOCKERS.includes(typeOf(card))))
    if (blocker) notes.push(`${first(blocker)} holds the turns.`)
  }

  const before = team.length
  for (const card of ranked) if (!team.some(other => typeOf(other) === typeOf(card) || other.family[0] === card.family[0])) take(card)
  for (const card of ranked) take(card)
  const attackers = team.slice(before).filter(card => strongAgainst(card).length)
  if (attackers.length) notes.push(attackers.slice(0, 3).map(card => `${first(card)} hits ${strongAgainst(card).map(label).join(', ')} foes hard`).join('; ') + '.')
  return { team, notes, missing }
}
