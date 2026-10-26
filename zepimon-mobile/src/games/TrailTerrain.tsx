import { memo } from 'react'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { typeTheme } from '../HabitatScene'
import { PATHS, TRAIL_COLS, TRAIL_ROWS, pathHeading, pathPoint } from './battle'
import type { PathId } from './battle'

type Theme = ReturnType<typeof typeTheme>
const outline = '#02101b'

// Blends two #rrggbb colors; t = 0 keeps a, 1 gives b.
function mix(a: string, b: string, t: number) {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  return '#' + [0, 1, 2].map(i => Math.round(channel(a, i) * (1 - t) + channel(b, i) * t).toString(16).padStart(2, '0')).join('')
}
// Stable per-tile randomness, so decorations never shuffle between renders.
const noise = (col: number, row: number, salt: number) => {
  const value = Math.sin(col * 12.9898 + row * 78.233 + salt * 37.719) * 43758.5453
  return value - Math.floor(value)
}
const rotation = { E: '0deg', S: '90deg', W: '180deg', N: '270deg' }

// Static ground for Trail Defense: textured grass, an edged dirt trail with direction chevrons, a cave where foes
// enter and a Poke Ball goal where they leak. Drawn once per battle and never re-rendered by game ticks.
export const TrailTerrain = memo(function TrailTerrain({ path, cell, theme }: { path: PathId, cell: number, theme: Theme }) {
  const { cells, length } = PATHS[path]
  const onPath = (col: number, row: number) => cells.has(col + ',' + row)
  const inside = (x: number, y: number) => x >= 0 && x < TRAIL_COLS && y >= 0 && y < TRAIL_ROWS
  const entry = pathPoint(path, 0), exit = pathPoint(path, length)
  // Sides of a trail tile that continue off the board stay open instead of getting a curb.
  const open = (col: number, row: number, dx: number, dy: number) => [entry, exit].some(point => !inside(point.x, point.y) &&
    Math.floor(point.x) === col + dx && Math.floor(point.y) === row + dy)
  const grass = [theme.ground, mix(theme.ground, theme.near, 0.28)]
  const blade = mix(theme.edge, theme.ground, 0.35)
  const dirt = theme.platform
  const curb = mix(theme.platform, theme.near, 0.55)
  const rut = mix(theme.platform, theme.near, 0.18)
  const nodes: ReactNode[] = []
  const box = (key: string, x: number, y: number, w: number, h: number, color: string, extra: object = {}) =>
    nodes.push(<View key={key} style={{ position: 'absolute', left: x, top: y, width: w, height: h, backgroundColor: color, ...extra }} />)

  for (let row = 0; row < TRAIL_ROWS; row++) {
    for (let col = 0; col < TRAIL_COLS; col++) {
      const x = col * cell, y = row * cell
      if (!onPath(col, row)) {
        box(`g${col}-${row}`, x, y, cell, cell, grass[(col + row) % 2])
        for (let tuft = 0; tuft < 2; tuft++) {
          const tx = x + cell * (0.12 + 0.68 * noise(col, row, tuft * 2)), ty = y + cell * (0.18 + 0.6 * noise(col, row, tuft * 2 + 1))
          ;[[0, 5], [3, 8], [6, 5]].forEach(([dx, h], i) => box(`t${col}-${row}-${tuft}-${i}`, tx + dx, ty + 8 - h, 2, h, blade))
        }
        const pick = noise(col, row, 9)
        if (pick < 0.2) box(`f${col}-${row}`, x + cell * 0.66, y + cell * 0.62, 5, 5, theme.accent, { borderRadius: 1 })
        else if (pick < 0.32) box(`p${col}-${row}`, x + cell * 0.2, y + cell * 0.7, 7, 5, theme.far, { borderRadius: 2 })
        continue
      }
      box(`d${col}-${row}`, x, y, cell, cell, dirt)
      box(`r${col}-${row}`, x + cell * (0.25 + 0.4 * noise(col, row, 3)), y + cell * (0.3 + 0.4 * noise(col, row, 4)), 4, 3, rut)
      box(`s${col}-${row}`, x + cell * (0.2 + 0.5 * noise(col, row, 5)), y + cell * (0.2 + 0.5 * noise(col, row, 6)), 3, 3, curb)
      const edge = Math.max(3, Math.round(cell * 0.06))
      if (row > 0 ? !onPath(col, row - 1) : !open(col, row, 0, -1)) box(`cn${col}-${row}`, x, y, cell, edge, curb)
      if (row < TRAIL_ROWS - 1 ? !onPath(col, row + 1) : !open(col, row, 0, 1)) box(`cs${col}-${row}`, x, y + cell - edge, cell, edge, curb)
      if (col > 0 ? !onPath(col - 1, row) : !open(col, row, -1, 0)) box(`cw${col}-${row}`, x, y, edge, cell, curb)
      if (col < TRAIL_COLS - 1 ? !onPath(col + 1, row) : !open(col, row, 1, 0)) box(`ce${col}-${row}`, x + cell - edge, y, edge, cell, curb)
    }
  }

  // Chevrons along the trail show which way the foes march.
  for (let d = 1.5; d < length - 0.6; d += 2.5) {
    const point = pathPoint(path, d)
    if (!inside(point.x, point.y)) continue
    nodes.push(<Text key={`v${d}`} style={{ position: 'absolute', left: point.x * cell - cell * 0.25, top: point.y * cell - cell * 0.32,
      width: cell * 0.5, textAlign: 'center', fontSize: cell * 0.42, fontWeight: '900', color: mix(dirt, outline, 0.45), opacity: 0.55,
      transform: [{ rotate: rotation[pathHeading(path, d)] }] }}>›</Text>)
  }

  // The cave mouth sits where the trail enters the board.
  const door = pathPoint(path, 0.5)
  const cave = cell * 0.62
  nodes.push(<View key="cave" style={{ position: 'absolute', left: door.x * cell - cave, top: door.y * cell - cave, width: cave * 2, height: cave * 2,
    borderRadius: cave, backgroundColor: '#140b26', borderWidth: 4, borderColor: mix(theme.far, outline, 0.35), alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: cave, height: cave, borderRadius: cave, borderWidth: 3, borderColor: 'rgba(157, 108, 255, 0.55)' }} />
  </View>)

  // A Poke Ball marks the goal: on the board edge, or at the trail's end when it finishes inside (the spiral).
  const goal = inside(exit.x, exit.y) ? exit : pathPoint(path, length - 0.5)
  const ball = cell * 0.36
  nodes.push(<View key="goal" style={{ position: 'absolute', left: goal.x * cell - ball, top: goal.y * cell - ball, width: ball * 2, height: ball * 2,
    borderRadius: ball, overflow: 'hidden', backgroundColor: '#ffffff', borderWidth: 3, borderColor: outline }}>
    <View style={{ height: '44%', backgroundColor: '#d9483b' }} />
    <View style={{ position: 'absolute', top: '44%', left: 0, right: 0, height: '12%', backgroundColor: outline }} />
    <View style={{ position: 'absolute', left: '33%', top: '33%', width: '34%', height: '34%', borderRadius: ball, backgroundColor: '#ffffff', borderWidth: 2, borderColor: outline }} />
  </View>)

  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: TRAIL_COLS * cell, height: TRAIL_ROWS * cell }}>{nodes}</View>
})
