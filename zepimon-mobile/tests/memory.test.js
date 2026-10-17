import assert from 'node:assert/strict'
import test from 'node:test'
import { createMemoryGame, hideMismatch, isComplete, revealCard, shuffle } from '../src/memory.ts'

const entries = [
  { key: 'Bulbasaur', name: 'Bulbasaur', shiny: false },
  { key: 'Shiny Bulbasaur', name: 'Bulbasaur', shiny: true },
  { key: 'Gible', name: 'Gible', shiny: false },
]
const fixed = () => 0.5

test('requires two unique variants and creates exactly two cards for each selected variant', () => {
  assert.equal(createMemoryGame([]).cards.length, 0)
  assert.equal(createMemoryGame([entries[0], entries[0]]).cards.length, 0)
  const original = JSON.stringify(entries)
  const game = createMemoryGame([...entries, entries[0]], fixed)
  assert.equal(game.cards.length, 6)
  assert.equal(new Set(game.cards.map(card => card.id)).size, 6)
  for (const entry of entries) assert.equal(game.cards.filter(card => card.key === entry.key).length, 2)
  assert.equal(JSON.stringify(entries), original)
  assert.equal(game.moves, 0)
  assert.equal(isComplete(game), false)
})

test('caps the game at six randomly selected pairs and shuffles without mutating input', () => {
  const many = Array.from({ length: 20 }, (_, index) => ({ key: String(index), name: 'Pokemon ' + index, shiny: false }))
  const game = createMemoryGame(many, () => 0)
  assert.equal(game.cards.length, 12)
  assert.equal(new Set(game.cards.map(card => card.key)).size, 6)
  assert.deepEqual(shuffle([1, 2, 3, 4], () => 0), [2, 3, 4, 1])
  assert.deepEqual(shuffle([1, 2, 3, 4], () => 0.999), [1, 2, 3, 4])
  assert.equal(many[0].key, '0')
})

test('normal and shiny cards cannot match, and mismatches block extra taps until hidden', () => {
  const game = createMemoryGame(entries, fixed)
  const normal = game.cards.find(card => card.key === 'Bulbasaur')
  const shiny = game.cards.find(card => card.key === 'Shiny Bulbasaur')
  const first = revealCard(game, normal.id)
  assert.equal(first.moves, 0)
  assert.strictEqual(revealCard(first, normal.id), first, 'Selecting the same card twice does not count')
  assert.strictEqual(revealCard(first, 'missing'), first)
  const mismatch = revealCard(first, shiny.id)
  assert.equal(mismatch.moves, 1)
  assert.equal(mismatch.matched.length, 0)
  assert.equal(mismatch.revealed.length, 2)
  assert.strictEqual(revealCard(mismatch, game.cards.find(card => card.name === 'Gible').id), mismatch)
  const hidden = hideMismatch(mismatch)
  assert.equal(hidden.revealed.length, 0)
  assert.equal(hidden.moves, 1)
  assert.strictEqual(hideMismatch(first), first, 'A single revealed card is not a pending mismatch')
})

test('matched pairs stay visible, cannot be selected again, and complete only once all pairs match', () => {
  let game = createMemoryGame(entries, fixed)
  for (const [index, entry] of entries.entries()) {
    const pair = game.cards.filter(card => card.key === entry.key)
    game = revealCard(revealCard(game, pair[0].id), pair[1].id)
    assert.equal(game.moves, index + 1)
    assert.equal(game.matched.length, (index + 1) * 2)
    assert.equal(game.revealed.length, 0)
    assert.strictEqual(revealCard(game, pair[0].id), game)
    assert.strictEqual(hideMismatch(game), game)
    assert.equal(isComplete(game), index === entries.length - 1)
  }
  assert.equal(isComplete(createMemoryGame([])), false)
  const restarted = createMemoryGame(entries, fixed)
  assert.equal(restarted.moves, 0)
  assert.equal(restarted.matched.length, 0)
  assert.equal(isComplete(restarted), false)
})
