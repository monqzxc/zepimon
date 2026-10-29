import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { IconButton, fonts, themedStyles } from '../ui'
import { playLayout, promptArea } from './immersive'
import type { Rect } from './immersive'
import { useGameScreen } from './fullscreen'
import { canRotate } from './useImmersive'

type Props = {
  // The map at the measured size. `resized` goes up each time the view changes size (a rotation); add it to the map's
  // `jump` so the camera snaps to the trainer instead of gliding across.
  map: (width: number, height: number, resized: number) => ReactNode,
  hud: string, status: string, success?: boolean,
  // The see-through D-pad, or null for tap to walk.
  dpad: ReactNode | null, actions: ReactNode,
  // A question or encounter shown across the map, under the HUD strip.
  prompt?: ReactNode,
  // False hides the rotate button (while a prompt that only fits in portrait is open).
  rotatable?: boolean
}

// Immersive play for the walking games: the map fills the screen, with a translucent HUD and status strip at the top,
// the D-pad floating over the map (bottom-left in portrait, left-centre in landscape), the game's actions in the opposite
// corner, and exit and rotate buttons top-right. Where each piece goes is worked out in immersive.ts.
export function PlayOverlay({ map, hud, status, success = false, dpad, actions, prompt, rotatable = true }: Props) {
  const { setFull, setOverlay, orientation, setOrientation } = useGameScreen()
  const [area, setArea] = useState({ width: 0, height: 0, resized: 0 })
  useEffect(() => {
    setOverlay(true)
    return () => setOverlay(false)
  }, [setOverlay])
  const rotate = canRotate && rotatable
  const layout = playLayout(area.width, area.height, { buttons: rotate ? 2 : 1 })
  const turn = orientation === 'landscape' ? 'portrait' : 'landscape'
  return <View style={look.root} onLayout={event => {
    const { width, height } = event.nativeEvent.layout
    setArea(previous => previous.width === width && previous.height === height ? previous
      : { width, height, resized: previous.width ? previous.resized + 1 : 0 })
  }}>
    {area.width > 0 && <>
      <View style={[look.slot, box(layout.map)]}>{map(layout.map.width, layout.map.height, area.resized)}</View>
      {/* Taps pass through the strip to the map; a screen reader still reads it. */}
      <View pointerEvents="none" style={[look.strip, box(layout.hud)]}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={look.hud}>{hud}</Text>
        <Text accessibilityLiveRegion="polite" numberOfLines={layout.hud.height >= 90 ? 4 : 3} adjustsFontSizeToFit
          style={[look.status, success && { color: '#7ef0a0' }]}>{status}</Text>
      </View>
      {!prompt && dpad && <View pointerEvents="box-none" style={box(layout.dpad)}>{dpad}</View>}
      {!prompt && <View pointerEvents="box-none" style={[look.actions, box(layout.actions)]}>{actions}</View>}
      {!!prompt && <View style={[look.prompt, box(promptArea(layout))]}>
        <ScrollView contentContainerStyle={look.promptContent}>
          <View style={{ width: '100%', maxWidth: layout.landscape ? 440 : 480 }}>{prompt}</View>
        </ScrollView>
      </View>}
      <View style={[look.corner, box(layout.corner)]}>
        {rotate && <IconButton name="rotate" label={turn === 'landscape' ? 'Turn to landscape' : 'Turn to portrait'} onPress={() => setOrientation(turn)} />}
        <IconButton name="fullscreenExit" label="Exit full screen" onPress={() => setFull(false)} />
      </View>
    </>}
  </View>
}

const box = (rect: Rect) => ({ position: 'absolute' as const, left: rect.x, top: rect.y, width: rect.width, height: rect.height })

const look = themedStyles(() => ({
  root: { flex: 1, overflow: 'hidden', backgroundColor: '#000000' },
  slot: { overflow: 'hidden' },
  strip: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, gap: 2, backgroundColor: 'rgba(8, 8, 20, 0.55)' },
  hud: { color: '#ffffff', fontFamily: fonts.heavy, fontSize: 14, lineHeight: 18 },
  status: { color: '#ffffff', fontFamily: fonts.bold, fontSize: 13, lineHeight: 17 },
  // Chips stack up from the bottom corner, first child lowest, and wrap into a second column leftwards if they must.
  actions: { flexDirection: 'column-reverse', flexWrap: 'wrap-reverse', alignContent: 'flex-start', alignItems: 'flex-end', gap: 6 },
  corner: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  prompt: { borderRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(8, 8, 20, 0.45)' },
  promptContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 8, gap: 10 }
}))
