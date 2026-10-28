import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { AppState, Platform, Pressable, Text, View } from 'react-native'
import { Button, Copy, Eyebrow, Heading, Panel, colors, fonts, styles, themedStyles } from '../ui'
import { BERRY_DURATION, BERRY_ROUNDS, catchBerry, pauseBerries, readyBerries, resumeBerries, startBerries, tickBerries } from './berries'
import type { BerryGame } from './berries'

export function BerryIcon() {
  return <View accessible={false} style={berryStyles.berry}>
    <View style={berryStyles.leaf} /><View style={berryStyles.shine} /><View style={berryStyles.seed} />
  </View>
}

export function BerryCatch({ best, onComplete }: { best?: number, onComplete: (score: number) => void }) {
  const [game, setGame] = useState(readyBerries)
  const current = useRef(game)
  const complete = useRef(onComplete)
  useEffect(() => { complete.current = onComplete }, [onComplete])
  const update = useCallback((next: BerryGame) => {
    const previous = current.current
    if (previous === next) return
    current.current = next
    setGame(next)
    if (previous.status !== 'complete' && next.status === 'complete') complete.current(next.score)
  }, [])
  const pause = useCallback(() => update(pauseBerries(current.current, performance.now())), [update])
  useFocusEffect(useCallback(() => {
    const timer = setInterval(() => update(tickBerries(current.current, performance.now())), 100)
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') pause() })
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', pause) : null
    return () => { clearInterval(timer); subscription.remove(); blur?.remove(); pause() }
  }, [pause, update]))

  const playing = game.status === 'playing'
  return <View style={{ gap: 14 }}>
    <Heading>Berry Catch</Heading>
    <Copy>Tap the berry before it moves! One berry appears every 1.5 seconds. Catch up to {BERRY_ROUNDS} in 30 seconds.</Copy>
    <Panel>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <View><Eyebrow>BASKET</Eyebrow><Text style={styles.stat}>{game.score} / {BERRY_ROUNDS}</Text></View>
        <View><Eyebrow>TIME LEFT</Eyebrow><Text style={styles.stat}>{Math.ceil((BERRY_DURATION - game.elapsed) / 1000)}s</Text></View>
      </View>
      <Copy color={colors.gold}>Best: {best === undefined ? 'Not set' : `${best} berries`}</Copy>
    </Panel>
    <View style={berryStyles.garden}>
      {Array.from({ length: 9 }, (_, cell) => {
        const target = playing && game.target === cell && !game.caught
        return <Pressable key={cell} accessibilityRole="button" accessibilityLabel={`Garden plot ${cell + 1}, ${target ? 'berry ready' : 'empty'}`}
          accessibilityState={{ disabled: !playing }} disabled={!playing}
          onPress={() => update(catchBerry(current.current, cell, game.round, performance.now()))}
          style={({ pressed }) => [berryStyles.plot, target && berryStyles.ripe, pressed && { opacity: 0.7 }]}>
          {target ? <BerryIcon /> : <Text accessible={false} style={{ color: game.caught && game.target === cell ? colors.gold : '#3E7F4A', fontSize: 23, fontFamily: fonts.heavy }}>{game.caught && game.target === cell ? '✓' : '·'}</Text>}
        </Pressable>
      })}
    </View>
    <Copy>{game.status === 'ready' ? 'Your garden is ready.' : game.status === 'paused' ? 'Paused. Your berries and remaining time are safe.' : game.status === 'complete' ? `Basket complete! You caught ${game.score} berries.` : game.caught ? 'Got it! Watch for the next berry…' : 'A berry is ready. Tap to collect it!'}</Copy>
    {game.status === 'ready' && <Button title="Start Berry Catch" onPress={() => update(startBerries(performance.now()))} />}
    {playing && <Button title="Pause game" secondary onPress={pause} />}
    {game.status === 'paused' && <Button title="Resume Berry Catch" onPress={() => update(resumeBerries(current.current, performance.now()))} />}
    {game.status === 'complete' && <Button title="Play Berry Catch again" onPress={() => update(startBerries(performance.now()))} />}
    <Copy small>Switching tabs or leaving the app pauses your round. Returning to the arcade ends an unfinished game.</Copy>
  </View>
}

const berryStyles = themedStyles(() => ({
  garden: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8, padding: 10, borderRadius: 20, backgroundColor: '#8FD18A', borderWidth: 1.5, borderColor: '#73BE6D' },
  plot: { width: '31%', aspectRatio: 1.15, minHeight: 56, maxHeight: 108, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#78C171', borderRadius: 14, backgroundColor: '#B4E3AD' },
  ripe: { borderColor: colors.star, borderWidth: 2.5, backgroundColor: '#D7F2D1' },
  berry: { width: 34, height: 36, backgroundColor: '#ed5c86', borderWidth: 3, borderColor: '#732b50', borderRadius: 10, transform: [{ rotate: '-8deg' }] },
  leaf: { position: 'absolute', width: 20, height: 10, left: 4, top: -8, backgroundColor: '#8bd685', borderWidth: 2, borderColor: '#326241', borderRadius: 2 },
  shine: { position: 'absolute', width: 6, height: 8, left: 5, top: 5, backgroundColor: '#ffd5cf' },
  seed: { position: 'absolute', width: 4, height: 4, right: 4, bottom: 5, backgroundColor: '#ffd5cf' },
}))
