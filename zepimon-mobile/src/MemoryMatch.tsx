import { useEffect, useRef, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { spriteSource } from './catalog'
import { colors } from './ui'
import { createMemoryGame, hideMismatch, isComplete, revealCard } from './memory'
import type { MemoryEntry } from './memory'

export type MemoryMatchProps = {
  entries: MemoryEntry[]
  bestMoves: Record<string, number>
  onComplete: (pairs: number, moves: number) => void
}

export function MemoryMatch(props: MemoryMatchProps) {
  const collection = JSON.stringify(props.entries.map(({ key, name, shiny }) => [key, name, shiny])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
  return <MemoryRound key={collection} {...props} />
}

function MemoryRound({ entries, bestMoves, onComplete }: MemoryMatchProps) {
  const [game, setGame] = useState(() => createMemoryGame(entries))
  const current = useRef(game)
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (pending.current !== null) clearTimeout(pending.current)
    }
  }, [])

  function restart() {
    if (pending.current !== null) clearTimeout(pending.current)
    pending.current = null
    const next = createMemoryGame(entries)
    current.current = next
    setGame(next)
  }

  function choose(id: string) {
    if (!mounted.current) return
    const next = revealCard(current.current, id)
    if (next === current.current) return
    current.current = next
    setGame(next)
    if (isComplete(next)) onComplete(next.cards.length / 2, next.moves)
    if (next.revealed.length === 2) {
      pending.current = setTimeout(() => {
        if (!mounted.current || current.current !== next) return
        const hidden = hideMismatch(next)
        current.current = hidden
        pending.current = null
        setGame(hidden)
      }, 800)
    }
  }

  const pairs = game.cards.length / 2
  if (!pairs) return (
    <View style={styles.notice}>
      <Text style={styles.title}>A little memory adventure</Text>
      <Text style={styles.body}>Import a journal with at least two acquired Pokemon variants to play. A Normal and a Shiny Pokemon count separately.</Text>
    </View>
  )

  const complete = isComplete(game)
  const waiting = game.revealed.length === 2
  const best = bestMoves[String(pairs)]
  return (
    <View style={styles.game}>
      <Text style={styles.title}>Memory Match</Text>
      <Text style={styles.body}>Find the matching pairs from your collection. Each two-card turn counts as one move.</Text>
      <View style={styles.score}>
        <Text style={styles.scoreText}>Moves: {game.moves}</Text>
        <Text style={styles.scoreText}>Pairs: {game.matched.length / 2} / {pairs}</Text>
        <Text style={styles.best}>Best for {pairs} pairs: {Number.isInteger(best) && best > 0 ? best : 'Not set'}</Text>
      </View>
      <Text style={[styles.status, complete && styles.win]} accessibilityLiveRegion="polite">
        {complete ? `All ${pairs} pairs found in ${game.moves} moves!`
          : waiting ? 'Not a match. Remember these two!'
            : game.revealed.length ? 'Choose one more card.' : 'Tap a card to begin your next pair.'}
      </Text>
      <View style={styles.grid}>
        {game.cards.map((card, index) => {
          const matched = game.matched.includes(card.id)
          const revealed = matched || game.revealed.includes(card.id)
          const disabled = waiting || revealed
          return (
            <Pressable key={card.id} onPress={() => choose(card.id)} disabled={disabled}
              accessible accessibilityRole="button"
              accessibilityLabel={`Card ${index + 1}, ${revealed ? (card.shiny ? 'Shiny ' : 'Normal ') + card.name + (matched ? ', matched' : ', face up') : 'face down'}`}
              accessibilityHint={disabled ? undefined : 'Reveal this Pokemon to find its matching card.'}
              accessibilityState={{ disabled, selected: revealed }}
              style={({ pressed }) => [styles.card, revealed && styles.face, matched && styles.matched, pressed && styles.pressed]}>
              {revealed ? <>
                <Image source={spriteSource(card.name, card.shiny)} style={styles.sprite} resizeMode="contain" accessible={false} />
                <Text style={styles.name}>{card.name}</Text>
                <Text style={[styles.variant, card.shiny && styles.shiny]}>{card.shiny ? 'Shiny' : 'Normal'}{matched ? ' / Matched' : ''}</Text>
              </> : <>
                <Text style={styles.question}>?</Text>
                <Text style={styles.variant}>Card {index + 1}</Text>
              </>}
            </Pressable>
          )
        })}
      </View>
      <Pressable onPress={restart} accessibilityRole="button" style={({ pressed }) => [styles.restart, pressed && styles.pressed]}>
        <Text style={styles.restartText}>{complete ? 'Play again' : 'Restart game'}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  game: { gap: 14 },
  notice: { padding: 20, gap: 12, backgroundColor: colors.panel, borderWidth: 2, borderColor: colors.edge, borderRadius: 12 },
  title: { color: colors.ink, fontSize: 25, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  score: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 14, backgroundColor: colors.panel, borderRadius: 10 },
  scoreText: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  best: { width: '100%', color: colors.gold, fontSize: 14 },
  status: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  win: { color: colors.gold, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  card: { width: '31%', minHeight: 146, padding: 6, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.edge, borderRadius: 10, backgroundColor: colors.blue },
  face: { backgroundColor: colors.panel },
  matched: { borderColor: colors.gold },
  pressed: { opacity: 0.72 },
  sprite: { width: 72, height: 72 },
  name: { color: colors.ink, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  variant: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 6 },
  shiny: { color: colors.gold },
  question: { color: colors.ink, fontSize: 40, fontWeight: '800' },
  restart: { minHeight: 48, padding: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink, borderRadius: 10 },
  restartText: { color: colors.bg, fontSize: 16, fontWeight: '800' },
})

export default MemoryMatch
