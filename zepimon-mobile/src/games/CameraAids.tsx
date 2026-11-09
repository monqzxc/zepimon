import { useEffect, useState } from 'react'
import type { MutableRefObject } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { typeTheme } from '../HabitatScene'
import { PokeballIcon, fonts } from '../ui'
import { PATHS, enemyPoint, pathPoint } from './battle'
import type { Battle } from './battle'
import { TrailTerrain } from './TrailTerrain'
import type { Camera } from './ZoomPan'

// Helpers for a Trail Defense map bigger than the screen, over the camera (src/games/ZoomPan.tsx):
// - arrows on the edges point at foes out of view, grouped by where they are, red when one is close to the Poke Ball;
//   tap one to look there;
// - a mini-map of the whole trail in the corner, with foes, your Pokemon and the part in view; tap it to look there;
// - buttons to follow the lead foe (any pan stops following), and to look at the cave or the Poke Ball.
// cell is a square's size on the board, in board pixels. They all hide while the whole map is in view.

const EDGE = 20
// A foe this far along the trail (a share of it) is close to the Poke Ball.
const CLOSE = 0.75
const MINI = { width: 84, height: 128 }

export function CameraAids({ game, cell, area, camera, follow, onFollow }: {
  game: Battle, cell: number, area: { width: number, height: number }, camera: MutableRefObject<Camera | null>,
  follow: boolean, onFollow: (on: boolean) => void
}) {
  // The camera moves without the battle knowing (a finger, a glide): look again a few times a second, paused or not.
  const [, setLook] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setLook(value => value + 1), 250)
    return () => clearInterval(timer)
  }, [])
  // Following: the camera keeps the foe closest to the Poke Ball in view.
  const lead = game.enemies.reduce<Battle['enemies'][number] | null>((best, enemy) => !best || enemy.progress > best.progress ? enemy : best, null)
  const leadAt = lead ? enemyPoint(game, lead) : null
  useEffect(() => {
    if (follow && leadAt) camera.current?.centerOn(leadAt.x * cell, leadAt.y * cell)
  }, [follow, leadAt?.x, leadAt?.y, cell, camera]) // eslint-disable-line react-hooks/exhaustive-deps
  const view = camera.current?.view()
  const path = PATHS[game.spec.path]
  if (!view) return null
  const { cols, rows, length } = path
  const all = view.width >= cols * cell - 1 && view.height >= rows * cell - 1
  const look = (x: number, y: number) => { onFollow(false); camera.current?.centerOn(x * cell, y * cell) }
  const cave = pathPoint(game.spec.path, 0.5), ball = pathPoint(game.spec.path, length - 0.5)

  // Foes out of view, grouped by the spot on the edge their arrow would sit.
  const groups = new Map<string, { x: number, y: number, angle: number, count: number, close: boolean, at: { x: number, y: number } }>()
  for (const enemy of game.enemies) {
    const at = enemyPoint(game, enemy)
    const sx = (at.x * cell - view.left) * view.zoom, sy = (at.y * cell - view.top) * view.zoom
    if (sx >= 0 && sx <= area.width && sy >= 0 && sy <= area.height) continue
    const x = Math.min(area.width - EDGE, Math.max(EDGE, sx)), y = Math.min(area.height - EDGE, Math.max(EDGE, sy))
    const key = Math.round(x / 36) + ',' + Math.round(y / 36)
    const close = enemy.progress / length >= CLOSE || enemy.boss
    const group = groups.get(key)
    if (group) { group.count++; group.close ||= close; if (close) group.at = at }
    else groups.set(key, { x, y, angle: Math.atan2(sy - area.height / 2, sx - area.width / 2), count: 1, close, at })
  }

  const scale = Math.min(MINI.width / cols, MINI.height / rows)
  const box = { left: view.left / cell * scale, top: view.top / cell * scale, width: view.width / cell * scale, height: view.height / cell * scale }
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    {!all && [...groups.values()].map(group => <Pressable key={`${Math.round(group.x)},${Math.round(group.y)}`} accessibilityRole="button"
      accessibilityLabel={`${group.count} ${group.count === 1 ? 'foe' : 'foes'} out of view${group.close ? ', close to the Poke Ball' : ''}. Show them`}
      hitSlop={8} onPress={() => look(group.at.x, group.at.y)}
      style={[aids.arrow, group.close && aids.arrowClose, { left: group.x - 14, top: group.y - 14 }]}>
      <Text style={[aids.arrowMark, { transform: [{ rotate: `${group.angle}rad` }] }]}>➤</Text>
      {group.count > 1 && <Text style={aids.count}>{group.count}</Text>}
    </Pressable>)}

    {!all && <Pressable accessibilityRole="button" accessibilityLabel="Map of the whole trail. Tap a spot to look there"
      onPress={event => look(event.nativeEvent.locationX / scale, event.nativeEvent.locationY / scale)}
      style={[aids.mini, { width: cols * scale, height: rows * scale }]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <MiniTerrain path={game.spec.path} habitat={game.spec.habitat} scale={scale} />
        {game.units.map(unit => <View key={unit.id} style={[aids.dot, aids.ally, { left: (unit.col + 0.5) * scale - 2, top: (unit.row + 0.5) * scale - 2 }]} />)}
        {game.enemies.map(enemy => { const at = enemyPoint(game, enemy), size = enemy.boss ? 7 : 4
          return <View key={enemy.id} style={[aids.dot, aids.foe, { width: size, height: size, left: at.x * scale - size / 2, top: at.y * scale - size / 2 }]} /> })}
        <View style={[aids.view, box]} />
      </View>
    </Pressable>}

    {!all && <View style={aids.buttons}>
      <AidButton label={follow ? 'Stop following the lead foe' : 'Follow the lead foe'} on={follow} onPress={() => onFollow(!follow)}>
        <Text style={[aids.glyph, follow && { color: '#1A1200' }]}>◎</Text>
      </AidButton>
      <AidButton label="Look at the cave, where foes come from" onPress={() => look(cave.x, cave.y)}>
        <View style={aids.cave} />
      </AidButton>
      <AidButton label="Look at the Poke Ball" onPress={() => look(ball.x, ball.y)}>
        <PokeballIcon size={20} color="#FFFFFF" />
      </AidButton>
    </View>}
  </View>
}

function AidButton({ label, on = false, onPress, children }: { label: string, on?: boolean, onPress: () => void, children: React.ReactNode }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} hitSlop={6} onPress={onPress}
    style={({ pressed }) => [aids.button, on && aids.buttonOn, { opacity: pressed ? 0.7 : 1 }]}>{children}</Pressable>
}

// The mini-map's still picture of the trail; it only changes with the map.
function MiniTerrain({ path, habitat, scale }: { path: Battle['spec']['path'], habitat: string, scale: number }) {
  const theme = typeTheme(habitat)
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.sky }]}><TrailTerrain path={path} cell={scale} theme={theme} /></View>
}

const aids = StyleSheet.create({
  arrow: { position: 'absolute', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(8, 14, 24, 0.72)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.35)' },
  arrowClose: { backgroundColor: 'rgba(200, 40, 40, 0.88)', borderColor: '#ffb3b3' },
  arrowMark: { color: '#FFFFFF', fontSize: 13, lineHeight: 16, fontFamily: fonts.black },
  count: { position: 'absolute', top: -6, right: -6, minWidth: 16, paddingHorizontal: 3, borderRadius: 8, overflow: 'hidden', textAlign: 'center',
    backgroundColor: '#ffe08d', color: '#1A1200', fontSize: 10, lineHeight: 15, fontFamily: fonts.black },
  mini: { position: 'absolute', left: 8, top: 8, borderRadius: 8, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.6)',
    backgroundColor: 'rgba(8, 14, 24, 0.6)' },
  dot: { position: 'absolute', width: 4, height: 4, borderRadius: 4 },
  ally: { backgroundColor: '#FFFFFF' },
  foe: { backgroundColor: '#ff4d4d' },
  view: { position: 'absolute', borderWidth: 1.5, borderColor: '#ffe08d', borderRadius: 2 },
  buttons: { position: 'absolute', right: 8, top: 8, gap: 6 },
  button: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8, 14, 24, 0.72)',
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.35)' },
  buttonOn: { backgroundColor: '#ffe08d', borderColor: '#ffe08d' },
  glyph: { color: '#FFFFFF', fontSize: 20, lineHeight: 24, fontFamily: fonts.black },
  cave: { width: 18, height: 14, borderTopLeftRadius: 9, borderTopRightRadius: 9, backgroundColor: '#2a1240', borderWidth: 2, borderColor: '#b88cff' }
})
