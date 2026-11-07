import { useEffect, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Button, Copy, Eyebrow, Heading, Panel, colors, fonts, themedStyles, typeInks, typeTints } from '../ui'
import { LANTERN_SIDE, lanternBoard, lanternsLit, pressLantern, questTheme } from './lanterns'
import { useReducedMotion } from './hooks'
import { Pixels } from './Pixels'
import { LANTERN_FRAMES, lanternColours } from './pixel-sprites'

// The Expedition Quest's shrine challenge: light all nine lanterns. Touching one flips it and its neighbours. Each is a
// stone tōrō (src/games/pixel-sprites.ts) roofed in the quest's type colour; lit, its flame flickers and a warm glow
// spreads round it. With reduced motion the flame holds still.
export function ShrineLanterns({ number, busy, onSolved, onLeave }: { number: number, busy: boolean, onSolved: () => void, onLeave: () => void }) {
  const theme = questTheme(number)
  const [board, setBoard] = useState(() => lanternBoard(number))
  const solved = lanternsLit(board)
  const finish = useRef(onSolved)
  useEffect(() => { finish.current = onSolved })
  useEffect(() => { if (solved) finish.current() }, [solved])
  const ink = typeInks[theme.type]
  const reduced = useReducedMotion()
  const [flicker, setFlicker] = useState(0)
  useEffect(() => {
    if (reduced) return
    const timer = setInterval(() => setFlicker(current => current + 1), 380)
    return () => clearInterval(timer)
  }, [reduced])
  return <Panel style={{ backgroundColor: typeTints[theme.type] || colors.panel }}>
    <Eyebrow>EXPEDITION QUEST {number + 1} · SHRINE CHALLENGE</Eyebrow>
    <Heading>{theme.title}</Heading>
    <Copy color={colors.ink}>{theme.lore}</Copy>
    <View style={{ alignSelf: 'center', gap: 8 }}>
      {Array.from({ length: LANTERN_SIDE }, (_, row) => <View key={row} style={{ flexDirection: 'row', gap: 8 }}>
        {Array.from({ length: LANTERN_SIDE }, (_, col) => {
          const index = row * LANTERN_SIDE + col
          const lit = board.lit[index]
          return <Pressable key={col} accessibilityRole="button" disabled={solved || busy}
            accessibilityLabel={`Lantern ${index + 1}, ${lit ? 'lit' : 'dark'}`} onPress={() => setBoard(current => pressLantern(current, index))}
            style={({ pressed }) => [lamp.lantern, lit ? lamp.lit : lamp.dark, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
            {lit && <><View style={lamp.glow} /><View style={lamp.core} /></>}
            {/* Neighbours flicker out of step, so the row never pulses as one. */}
            <Pixels art={LANTERN_FRAMES[lit && !reduced ? (flicker + index) % 2 : 0]} palette={lanternColours(ink, lit)} height={60} />
          </Pressable>
        })}
      </View>)}
    </View>
    <Text accessibilityLiveRegion="polite" style={lamp.status}>
      {solved ? 'Every lantern burns! The shrine keeper smiles.' : `${board.lit.filter(Boolean).length} of 9 lit · ${board.presses} touches`}
    </Text>
    <Button title="Start over" secondary disabled={solved || busy} onPress={() => setBoard(lanternBoard(number))} />
    <Button title="Back to Expeditions" secondary disabled={busy} onPress={onLeave} />
    <Copy small>Touching a lantern flips it and the lanterns beside it. This challenge is separate from each Legendary’s maze.</Copy>
  </Panel>
}

const lamp = themedStyles(() => ({
  lantern: { width: 72, height: 76, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  dark: { backgroundColor: '#1E2226', borderColor: '#3A4046' },
  lit: { backgroundColor: '#2E1F12', borderColor: '#F2C230' },
  glow: { position: 'absolute', width: 66, height: 66, borderRadius: 33, backgroundColor: 'rgba(255, 170, 60, 0.22)' },
  core: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255, 214, 120, 0.3)' },
  status: { color: colors.ink, fontFamily: fonts.heavy, fontSize: 15, lineHeight: 21, textAlign: 'center' }
}))
