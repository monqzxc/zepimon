import { memo, useMemo } from 'react'
import { View } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import { MEDAL, MEDAL_COLOURS, PADLOCK, PADLOCK_COLOURS, runsOf } from './pixel-sprites'
import type { BadgeState, Palette, PixelSprite } from './pixel-sprites'

// Draws a pixel sprite (src/games/pixel-sprites.ts) crisply at any size: one rectangle per run of a colour, scaled
// by the viewBox. Each run is drawn a hair wider and taller so scaled edges never show hairline seams between pixels.
// width defaults to keep the sprite's own aspect ratio from height (or size).
export const Pixels = memo(function Pixels({ art, palette, size, width, height, style }: {
  art: PixelSprite, palette: Palette, size?: number, width?: number, height?: number, style?: StyleProp<ViewStyle>
}) {
  const runs = useMemo(() => runsOf(art), [art])
  const h = height ?? size ?? art.height
  const w = width ?? h * art.width / art.height
  return <Svg width={w} height={h} viewBox={`0 0 ${art.width} ${art.height}`} style={style} pointerEvents="none">
    {runs.map((run, i) => <Rect key={i} x={run.x} y={run.y} width={run.length + 0.04} height={1.04} fill={palette[run.char]} />)}
  </Svg>
})

// A mission badge on a soft round backing: a gold medal once earned, a teal one while in progress, a padlock while a
// secret is still hidden. Decorative: the mission's own words say its state.
export function BadgeSprite({ state, size = 40 }: { state: BadgeState, size?: number }) {
  const backing = state === 'earned' ? 'rgba(242, 194, 48, 0.22)' : state === 'progress' ? 'rgba(95, 205, 180, 0.22)' : 'rgba(120, 130, 125, 0.2)'
  return <View accessible={false} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: backing, alignItems: 'center', justifyContent: 'center' }}>
    {state === 'locked' ? <Pixels art={PADLOCK} palette={PADLOCK_COLOURS} size={size * 0.78} />
      : <Pixels art={MEDAL} palette={MEDAL_COLOURS[state]} size={size * 0.82} />}
  </View>
}
