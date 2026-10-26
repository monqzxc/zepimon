import { useState } from 'react'
import { Text, View } from 'react-native'
import Svg, { Circle, Line, Path } from 'react-native-svg'
import { colors, fonts } from './ui'

// A recorded route drawn as a line on a plain grid, like Strava without the map: north is up and both directions
// share one scale. Small routes are drawn as if they spanned at least MIN_SPAN metres, so GPS wobble at the start
// does not fill the box. live marks the current position; otherwise the end gets a finish dot.
const MIN_SPAN = 60
const METRES_PER_DEGREE = 111195
const SCALES = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000]
const routeColor = '#1374B8'
const startColor = '#16B5A0'

export function RouteView({ points, height, live = false, compact = false, label }: {
  points: [number, number][], height: number, live?: boolean, compact?: boolean, label: string
}) {
  const [width, setWidth] = useState(0)
  const pad = compact ? 8 : 22
  let path = '', start: number[] | null = null, end: number[] | null = null, scale = 0
  if (width > 0 && points.length) {
    const cos = Math.cos(points[0][0] * Math.PI / 180)
    const xy = points.map(([lat, lng]) => [lng * cos * METRES_PER_DEGREE, -lat * METRES_PER_DEGREE])
    const xs = xy.map(p => p[0]), ys = xy.map(p => p[1])
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    scale = Math.min((width - 2 * pad) / Math.max(maxX - minX, MIN_SPAN), (height - 2 * pad) / Math.max(maxY - minY, MIN_SPAN))
    const centre = [(minX + maxX) / 2, (minY + maxY) / 2]
    const screen = xy.map(([x, y]) => [width / 2 + (x - centre[0]) * scale, height / 2 + (y - centre[1]) * scale])
    path = screen.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
    start = screen[0]
    end = screen.length > 1 || live ? screen[screen.length - 1] : null
  }
  // A scale bar about a quarter of the width, at a round distance.
  const bar = scale ? SCALES.filter(metres => metres * scale <= width / 3).at(-1) : undefined
  const grid = compact ? 16 : 28
  const stroke = compact ? 2.5 : 4
  return <View accessible accessibilityRole="image" accessibilityLabel={label} onLayout={event => setWidth(event.nativeEvent.layout.width)}
    style={{ height, borderRadius: compact ? 12 : 18, overflow: 'hidden', backgroundColor: colors.sunken, borderWidth: 1, borderColor: colors.line }}>
    {width > 0 && <Svg width={width} height={height}>
      {Array.from({ length: Math.ceil(width / grid) }, (_, i) => <Line key={`x${i}`} x1={i * grid} y1={0} x2={i * grid} y2={height} stroke={colors.line} strokeWidth={1} />)}
      {Array.from({ length: Math.ceil(height / grid) }, (_, i) => <Line key={`y${i}`} x1={0} y1={i * grid} x2={width} y2={i * grid} stroke={colors.line} strokeWidth={1} />)}
      {!!path && <Path d={path} fill="none" stroke="#FFFFFF" strokeWidth={stroke + 3} strokeLinecap="round" strokeLinejoin="round" />}
      {!!path && <Path d={path} fill="none" stroke={routeColor} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />}
      {start && <Circle cx={start[0]} cy={start[1]} r={compact ? 3.5 : 6} fill={startColor} stroke="#FFFFFF" strokeWidth={2} />}
      {end && live && <Circle cx={end[0]} cy={end[1]} r={13} fill={routeColor} opacity={0.18} />}
      {end && <Circle cx={end[0]} cy={end[1]} r={compact ? 3.5 : 7} fill={live ? routeColor : colors.ink} stroke="#FFFFFF" strokeWidth={2} />}
      {!compact && bar && <Line x1={12} y1={height - 12} x2={12 + bar * scale} y2={height - 12} stroke={colors.muted} strokeWidth={3} strokeLinecap="round" />}
    </Svg>}
    {!compact && bar && <Text style={{ position: 'absolute', left: 12, bottom: 17, fontFamily: fonts.bold, fontSize: 11, color: colors.muted }}>
      {bar >= 1000 ? `${bar / 1000} km` : `${bar} m`}
    </Text>}
    {!compact && !points.length && <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.muted }}>{live ? 'Waiting for GPS…' : 'No route recorded'}</Text>
    </View>}
  </View>
}
