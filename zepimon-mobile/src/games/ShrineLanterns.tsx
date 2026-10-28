import { useEffect, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Button, Copy, Eyebrow, Heading, Panel, colors, fonts, themedStyles, typeInks, typeTints } from '../ui'
import { LANTERN_SIDE, lanternBoard, lanternsLit, pressLantern, questTheme } from './lanterns'

// The Expedition Quest's shrine challenge: light all nine lanterns. Touching one flips it and its neighbours.
export function ShrineLanterns({ number, busy, onSolved, onLeave }: { number: number, busy: boolean, onSolved: () => void, onLeave: () => void }) {
  const theme = questTheme(number)
  const [board, setBoard] = useState(() => lanternBoard(number))
  const solved = lanternsLit(board)
  const finish = useRef(onSolved)
  useEffect(() => { finish.current = onSolved })
  useEffect(() => { if (solved) finish.current() }, [solved])
  const ink = typeInks[theme.type]
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
            style={({ pressed }) => [lamp.lantern, { borderColor: ink, backgroundColor: lit ? ink : colors.sunken, opacity: pressed ? 0.75 : 1 }]}>
            <Text accessible={false} style={[lamp.glyph, { color: lit ? colors.goldTint : colors.muted }]}>{lit ? '✦' : '·'}</Text>
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
  lantern: { width: 72, height: 72, borderRadius: 18, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 30, lineHeight: 36, fontFamily: fonts.black },
  status: { color: colors.ink, fontFamily: fonts.heavy, fontSize: 15, lineHeight: 21, textAlign: 'center' }
}))
