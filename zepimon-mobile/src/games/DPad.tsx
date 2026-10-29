import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Platform, Pressable, Text, View } from 'react-native'
import { colors, fonts, themedStyles } from '../ui'
import type { Direction } from './safari-zone'
import { DPAD_BUTTON, OVERLAY_IDLE, OVERLAY_PRESSED } from './immersive'

const BUTTONS: { direction: Direction, glyph: string, label: string, row: number, column: number }[] = [
  { direction: 'north', glyph: '▲', label: 'Walk north', row: 0, column: 1 },
  { direction: 'west', glyph: '◀', label: 'Walk west', row: 1, column: 0 },
  { direction: 'east', glyph: '▶', label: 'Walk east', row: 1, column: 2 },
  { direction: 'south', glyph: '▼', label: 'Walk south', row: 2, column: 1 }
]
const SIZE = DPAD_BUTTON
const native = Platform.OS !== 'web'
const KEYS: Record<string, Direction> = { ArrowUp: 'north', ArrowDown: 'south', ArrowLeft: 'west', ArrowRight: 'east',
  w: 'north', s: 'south', a: 'west', d: 'east', W: 'north', S: 'south', A: 'west', D: 'east' }

// A GBA-style D-pad. Holding a button keeps walking (the screen repeats the step); a quick tap still takes one step.
// `overlay` is the see-through look drawn over the map in immersive play: the same buttons and touch areas, faded to
// OVERLAY_IDLE and brought up to OVERLAY_PRESSED on the button being pressed (instantly with reduced motion).
export function DPad({ onPress, onRelease, disabled, overlay = false, reduced = false }: {
  onPress: (direction: Direction) => void, onRelease: (direction: Direction) => void, disabled: boolean, overlay?: boolean, reduced?: boolean
}) {
  return <View pointerEvents="box-none" style={pad.cross}>
    {BUTTONS.map(button => overlay
      ? <OverlayButton key={button.direction} button={button} disabled={disabled} reduced={reduced} onPress={onPress} onRelease={onRelease} />
      : <Pressable key={button.direction} accessibilityRole="button" accessibilityLabel={button.label}
        disabled={disabled} onPressIn={() => onPress(button.direction)} onPressOut={() => onRelease(button.direction)}
        style={({ pressed }) => [pad.button, { top: button.row * SIZE, left: button.column * SIZE }, pressed && pad.pressed, disabled && { opacity: 0.45 }]}>
        <Text accessible={false} style={pad.glyph}>{button.glyph}</Text>
      </Pressable>)}
  </View>
}

// The Pressable keeps the full button size and opacity; only the face inside it fades.
function OverlayButton({ button: { direction, glyph, label, row, column }, disabled, reduced, onPress, onRelease }: {
  button: typeof BUTTONS[number], disabled: boolean, reduced: boolean, onPress: (direction: Direction) => void, onRelease: (direction: Direction) => void
}) {
  const [shade] = useState(() => new Animated.Value(OVERLAY_IDLE))
  const [pressed, setPressed] = useState(false)
  const show = (value: number, duration: number) => {
    shade.stopAnimation()
    if (reduced) shade.setValue(value)
    else Animated.timing(shade, { toValue: value, duration, easing: Easing.out(Easing.quad), useNativeDriver: native }).start()
  }
  // Walking can stop mid-press (a fall, an encounter): the button goes back to idle.
  if (disabled && pressed) setPressed(false)
  useEffect(() => { if (disabled) { shade.stopAnimation(); shade.setValue(OVERLAY_IDLE) } }, [disabled, shade])
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
    onPressIn={() => { setPressed(true); show(OVERLAY_PRESSED, 80); onPress(direction) }}
    onPressOut={() => { setPressed(false); show(OVERLAY_IDLE, 160); onRelease(direction) }}
    style={[pad.hit, { top: row * SIZE, left: column * SIZE }]}>
    <Animated.View style={[pad.button, pad.face, pressed && pad.pressed, { opacity: disabled ? OVERLAY_IDLE / 2 : shade }]}>
      <Text accessible={false} style={pad.glyph}>{glyph}</Text>
    </Animated.View>
  </Pressable>
}

// The direction a key walks, or null. With Ctrl, Cmd or Alt held the key belongs to the browser (Ctrl+S, Cmd+W, ...).
export function keyDirection(event: { key: string, ctrlKey: boolean, metaKey: boolean, altKey: boolean }): Direction | null {
  return event.ctrlKey || event.metaKey || event.altKey ? null : KEYS[event.key] ?? null
}

// Arrow keys and WASD on the web, pressed and released like the D-pad. Holding a key repeats through the screen's own
// step loop, so the browser's key repeat is ignored. Leaving the window with a key held never sends its keyup, so
// losing focus calls onLost to let go of everything.
export function useKeyboardDirections(onPress: (direction: Direction) => void, onRelease: (direction: Direction) => void, enabled: boolean,
  onLost: () => void = () => {}) {
  const handlers = useRef({ onPress, onRelease, onLost })
  useEffect(() => { handlers.current = { onPress, onRelease, onLost } })
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || typeof window === 'undefined') return
    const down = (event: KeyboardEvent) => {
      const direction = keyDirection(event)
      if (!direction) return
      event.preventDefault()
      if (!event.repeat) handlers.current.onPress(direction)
    }
    const up = (event: KeyboardEvent) => {
      const direction = KEYS[event.key]
      if (direction) handlers.current.onRelease(direction)
    }
    const lost = () => handlers.current.onLost()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', lost)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', lost) }
  }, [enabled])
}

const pad = themedStyles(() => ({
  cross: { width: SIZE * 3, height: SIZE * 3 },
  button: { position: 'absolute', width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center', borderRadius: 14,
    backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.line },
  pressed: { backgroundColor: colors.mint, borderColor: colors.edge },
  hit: { position: 'absolute', width: SIZE, height: SIZE },
  face: { left: 0, top: 0 },
  glyph: { color: colors.ink, fontSize: 22, fontFamily: fonts.black }
}))
