import { useEffect, useRef } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { colors, fonts, themedStyles } from '../ui'
import type { Direction } from './safari-zone'

const BUTTONS: { direction: Direction, glyph: string, label: string, row: number, column: number }[] = [
  { direction: 'north', glyph: '▲', label: 'Walk north', row: 0, column: 1 },
  { direction: 'west', glyph: '◀', label: 'Walk west', row: 1, column: 0 },
  { direction: 'east', glyph: '▶', label: 'Walk east', row: 1, column: 2 },
  { direction: 'south', glyph: '▼', label: 'Walk south', row: 2, column: 1 }
]
const SIZE = 52
const KEYS: Record<string, Direction> = { ArrowUp: 'north', ArrowDown: 'south', ArrowLeft: 'west', ArrowRight: 'east',
  w: 'north', s: 'south', a: 'west', d: 'east', W: 'north', S: 'south', A: 'west', D: 'east' }

// A GBA-style D-pad. Holding a button keeps walking (the screen repeats the step); a quick tap still takes one step.
export function DPad({ onPress, onRelease, disabled }: { onPress: (direction: Direction) => void, onRelease: (direction: Direction) => void, disabled: boolean }) {
  return <View style={pad.cross}>
    {BUTTONS.map(({ direction, glyph, label, row, column }) => <Pressable key={direction} accessibilityRole="button" accessibilityLabel={label}
      disabled={disabled} onPressIn={() => onPress(direction)} onPressOut={() => onRelease(direction)}
      style={({ pressed }) => [pad.button, { top: row * SIZE, left: column * SIZE }, pressed && pad.pressed, disabled && { opacity: 0.45 }]}>
      <Text accessible={false} style={pad.glyph}>{glyph}</Text>
    </Pressable>)}
  </View>
}

// Arrow keys and WASD on the web, pressed and released like the D-pad. Holding a key repeats through the screen's own
// step loop, so the browser's key repeat is ignored.
export function useKeyboardDirections(onPress: (direction: Direction) => void, onRelease: (direction: Direction) => void, enabled: boolean) {
  const handlers = useRef({ onPress, onRelease })
  useEffect(() => { handlers.current = { onPress, onRelease } })
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || typeof window === 'undefined') return
    const down = (event: KeyboardEvent) => {
      const direction = KEYS[event.key]
      if (!direction) return
      event.preventDefault()
      if (!event.repeat) handlers.current.onPress(direction)
    }
    const up = (event: KeyboardEvent) => {
      const direction = KEYS[event.key]
      if (direction) handlers.current.onRelease(direction)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [enabled])
}

const pad = themedStyles(() => ({
  cross: { width: SIZE * 3, height: SIZE * 3 },
  button: { position: 'absolute', width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center', borderRadius: 14,
    backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.line },
  pressed: { backgroundColor: colors.mint, borderColor: colors.edge },
  glyph: { color: colors.ink, fontSize: 22, fontFamily: fonts.black }
}))
