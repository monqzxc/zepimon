export type MemoryEntry = { key: string; name: string; shiny: boolean }
export type MemoryCard = MemoryEntry & { id: string }
export type MemoryGame = {
  cards: MemoryCard[]
  revealed: string[]
  matched: string[]
  moves: number
}

export function shuffle<T>(items: readonly T[], random = Math.random): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1))
    ;[result[index], result[swap]] = [result[swap], result[index]]
  }
  return result
}

export function createMemoryGame(entries: readonly MemoryEntry[], random = Math.random): MemoryGame {
  const unique = [...new Map(entries.map(entry => [entry.key, entry])).values()]
  const selected = unique.length < 2 ? [] : shuffle(unique, random).slice(0, 6)
  const cards = selected.flatMap((entry, index) => [
    { ...entry, id: index + ':0' },
    { ...entry, id: index + ':1' },
  ])
  return { cards: shuffle(cards, random), revealed: [], matched: [], moves: 0 }
}

export function revealCard(game: MemoryGame, id: string): MemoryGame {
  if (game.revealed.length === 2 || game.revealed.includes(id) || game.matched.includes(id)) return game
  const card = game.cards.find(candidate => candidate.id === id)
  if (!card) return game
  const first = game.cards.find(candidate => candidate.id === game.revealed[0])
  if (!first) return { ...game, revealed: [id] }
  if (first.key === card.key) {
    return { ...game, revealed: [], matched: [...game.matched, first.id, id], moves: game.moves + 1 }
  }
  return { ...game, revealed: [first.id, id], moves: game.moves + 1 }
}

export function hideMismatch(game: MemoryGame): MemoryGame {
  return game.revealed.length === 2 ? { ...game, revealed: [] } : game
}

export function isComplete(game: MemoryGame): boolean {
  return game.cards.length > 0 && game.matched.length === game.cards.length
}
