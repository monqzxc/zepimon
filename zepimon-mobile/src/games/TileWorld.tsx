import { memo, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Animated, Easing, Image, Platform, Pressable, View } from 'react-native'
import type { ImageSourcePropType } from 'react-native'
import { safariSprites } from '../generated/safari-assets.js'
import { trailWalkers } from '../generated/trail-walkers.js'
import { PixelSprite } from './TeamPicker'
import type { Direction, Point } from './safari-zone'
import { STEP_MS, buddyFrame, cameraOffset, chunksAround, tapPoint, tileFromTap, tileSizeFor, trainerFrame } from './safari-view'

export type Strip = { source: ImageSourcePropType, frames: number, width: number, height: number }
export type TileMap = { cols: number, rows: number, chunk: number }
export type TileChunks = Record<string, { ground: ImageSourcePropType, top?: ImageSourcePropType }>
type Move = { kind: 'step' | 'hop' | 'bump' | 'none', id: number }
const sprites = safariSprites as Record<'brendan' | 'may' | 'grass' | 'dust' | 'shadow' | 'item', Strip>
const walkers = trailWalkers as Record<string, ImageSourcePropType>
const native = Platform.OS !== 'web'
const pixelated = Platform.OS === 'web' ? { imageRendering: 'pixelated' as const } : {}

type Props = {
  map: TileMap, chunks: TileChunks, at: Point, facing: Direction, buddyAt: Point, buddyFacing: Direction, move: Move,
  trainer: 'brendan' | 'may', buddy: { name: string, shiny: boolean } | null, onGrass: boolean, width: number, height: number,
  reduced: boolean, jump: number, background: string, tapToWalk: boolean, onTapTile: (tile: Point) => void,
  children?: ReactNode, cover?: ReactNode, falling?: boolean
}

// A tile map seen GBA-style. The trainer stays in the middle and the map glides under them one tile per step.
// Layers, bottom to top: ground chunks, `children` (items, marks), the buddy, the trainer, the top chunks (tree crowns
// and roofs) so the trainer walks behind them, then `cover`. Only chunks near the view are loaded. A new `jump` value
// (a warp, a room change) snaps the camera and buddy into place instead of gliding. `falling` drops the trainer out of sight.
export function TileWorld({ map, chunks, at, facing, buddyAt, buddyFacing, move, trainer, buddy, onGrass, width, height, reduced, jump, background,
  tapToWalk, onTapTile, children, cover, falling = false }: Props) {
  const tile = tileSizeFor(width)
  const [camera] = useState(() => new Animated.ValueXY(cameraOffset(at, tile, width, height)))
  const target = cameraOffset(at, tile, width, height)
  const jumped = useRef(jump)
  useEffect(() => {
    if (reduced || jumped.current !== jump) { jumped.current = jump; camera.setValue(target); return }
    const glide = Animated.timing(camera, { toValue: target, duration: STEP_MS, easing: Easing.linear, useNativeDriver: native })
    glide.start()
    return () => glide.stop()
  }, [camera, target.x, target.y, reduced, jump]) // eslint-disable-line react-hooks/exhaustive-deps
  const keys = chunksAround(at, tile, width, height, map)
  const layer = (content: ReactNode) => <Animated.View pointerEvents="none"
    style={{ position: 'absolute', left: 0, top: 0, transform: camera.getTranslateTransform() }}>{content}</Animated.View>
  const view = <View pointerEvents="none" style={{ width, height, overflow: 'hidden', backgroundColor: background }}>
    {layer(<>
      <Chunks map={map} chunks={chunks} keys={keys} tile={tile} layer="ground" />
      {children}
      {buddy && (buddyAt.x !== at.x || buddyAt.y !== at.y) &&
        <Buddy name={buddy.name} shiny={buddy.shiny} at={buddyAt} frame={buddyFrame(buddyFacing, (move.id % 2) as 0 | 1)} tile={tile} reduced={reduced} jump={jump} />}
    </>)}
    <Trainer trainer={trainer} facing={facing} move={move} onGrass={onGrass} tile={tile}
      left={width / 2 - tile / 2} top={height / 2 - tile / 2} reduced={reduced} falling={falling} />
    {layer(<Chunks map={map} chunks={chunks} keys={keys} tile={tile} layer="top" />)}
    {!!cover && layer(cover)}
  </View>
  if (!tapToWalk) return view
  return <Pressable accessibilityRole="button" accessibilityLabel="Map. Tap a spot to walk there."
    onPress={event => onTapTile(tileFromTap(tapPoint(event.nativeEvent), at, tile, width, height))}>
    {view}
  </Pressable>
}

const Chunks = memo(function Chunks({ map, chunks, keys, tile, layer }: { map: TileMap, chunks: TileChunks, keys: string[], tile: number, layer: 'ground' | 'top' }) {
  const size = map.chunk * tile
  return <>{keys.map(key => {
    const source = chunks[key]?.[layer]
    if (!source) return null
    const [cx, cy] = key.split(',').map(Number)
    const across = Math.min(map.chunk, map.cols - cx * map.chunk), down = Math.min(map.chunk, map.rows - cy * map.chunk)
    return <Image key={key} source={source} fadeDuration={0} resizeMode="stretch"
      style={{ position: 'absolute', left: cx * size, top: cy * size, width: across * tile, height: down * tile, ...pixelated }} />
  })}</>
})

// One frame of a sprite strip, `scale` tiles wide, with its bottom on the tile at `at`.
export function Sprite({ strip, frame, at, tile, scale = 1 }: { strip: Strip, frame: number, at: Point, tile: number, scale?: number }) {
  const width = tile * scale, height = width * strip.height / strip.width
  return <View style={{ position: 'absolute', left: at.x * tile + (tile - width) / 2, top: (at.y + 1) * tile - height }}>
    <Frame strip={strip} frame={frame} width={width} height={height} />
  </View>
}

export function Frame({ strip, frame, width, height }: { strip: Strip, frame: number, width: number, height: number }) {
  return <View style={{ width, height, overflow: 'hidden' }}>
    <Image source={strip.source} fadeDuration={0} resizeMode="stretch"
      style={{ position: 'absolute', top: 0, left: -frame * width, width: width * strip.frames, height, ...pixelated }} />
  </View>
}

function Buddy({ name, shiny, at, frame, tile, reduced, jump }: { name: string, shiny: boolean, at: Point, frame: number, tile: number, reduced: boolean, jump: number }) {
  const [position] = useState(() => new Animated.ValueXY({ x: at.x * tile, y: at.y * tile }))
  const jumped = useRef(jump)
  useEffect(() => {
    const toValue = { x: at.x * tile, y: at.y * tile }
    if (reduced || jumped.current !== jump) { jumped.current = jump; position.setValue(toValue); return }
    const glide = Animated.timing(position, { toValue, duration: STEP_MS, easing: Easing.linear, useNativeDriver: native })
    glide.start()
    return () => glide.stop()
  }, [position, at.x, at.y, tile, reduced, jump])
  const strip = walkers[(shiny ? 'Shiny ' : '') + name]
  return <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: tile, height: tile, transform: position.getTranslateTransform() }}>
    {strip ? <Frame strip={{ source: strip, frames: 8, width: 44, height: 44 }} frame={frame} width={tile} height={tile} />
      : <PixelSprite name={name} shiny={shiny} size={tile} />}
  </Animated.View>
}

// The trainer, fixed in the middle of the view: a step frame on each step, a hop with a shadow and a dust puff over
// ledges, tall grass over their feet while they stand in it, and a 300 ms drop through the floor while falling.
function Trainer({ trainer, facing, move, onGrass, tile, left, top, reduced, falling }: {
  trainer: 'brendan' | 'may', facing: Direction, move: Move, onGrass: boolean, tile: number, left: number, top: number, reduced: boolean, falling: boolean
}) {
  // The step frame shows until this move has settled; a hop lasts until it has landed. Both are set by timers.
  const [settled, setSettled] = useState(move.id)
  const [landed, setLanded] = useState(move.id)
  const [dust, setDust] = useState(-1)
  const [grass, setGrass] = useState(0)
  const [lift] = useState(() => new Animated.Value(0))
  const [sink] = useState(() => new Animated.Value(0))
  useEffect(() => {
    if (!falling || reduced) { sink.setValue(0); return }
    const drop = Animated.timing(sink, { toValue: 1, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: native })
    drop.start()
    return () => drop.stop()
  }, [falling, reduced, sink])
  const phase = move.kind !== 'none' && move.id !== settled ? (move.id % 2 ? 1 : 2) : 0
  const hopping = move.kind === 'hop' && !reduced && move.id !== landed
  useEffect(() => {
    if (move.kind === 'none') return
    const timers = [setTimeout(() => setSettled(move.id), STEP_MS / 2)]
    if (move.kind === 'hop' && !reduced) {
      Animated.sequence([
        Animated.timing(lift, { toValue: -tile / 2, duration: STEP_MS / 2, easing: Easing.out(Easing.quad), useNativeDriver: native }),
        Animated.timing(lift, { toValue: 0, duration: STEP_MS / 2, easing: Easing.in(Easing.quad), useNativeDriver: native })
      ]).start()
      timers.push(setTimeout(() => { setLanded(move.id); setDust(0) }, STEP_MS),
        setTimeout(() => setDust(1), STEP_MS + 60), setTimeout(() => setDust(2), STEP_MS + 120), setTimeout(() => setDust(-1), STEP_MS + 180))
    }
    if (onGrass && move.kind !== 'bump' && !reduced) {
      ;[1, 2, 3, 4].forEach((frame, i) => timers.push(setTimeout(() => setGrass(frame), (STEP_MS / 4) * i)))
      timers.push(setTimeout(() => setGrass(0), STEP_MS))
    }
    return () => timers.forEach(clearTimeout)
  }, [move.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const strip = sprites[trainer]
  return <View pointerEvents="none" style={{ position: 'absolute', left, top: top - tile, width: tile, height: tile * 2 }}>
    {hopping && <View style={{ position: 'absolute', left: 0, top: tile * 1.6 }}>
      <Frame strip={sprites.shadow} frame={0} width={tile} height={tile / 2} />
    </View>}
    <Animated.View style={{ opacity: sink.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
      transform: [{ translateY: Animated.add(lift, sink.interpolate({ inputRange: [0, 1], outputRange: [0, tile * 0.75] })) }, { scale: sink.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }) }] }}>
      <Frame strip={strip} frame={trainerFrame(facing, phase)} width={tile} height={tile * 2} />
    </Animated.View>
    {onGrass && !hopping && <View style={{ position: 'absolute', left: 0, top: tile * 1.5, width: tile, height: tile / 2, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', top: -tile / 2 }}><Frame strip={sprites.grass} frame={grass} width={tile} height={tile} /></View>
    </View>}
    {dust >= 0 && <View style={{ position: 'absolute', left: 0, top: tile * 1.5 }}>
      <Frame strip={sprites.dust} frame={dust} width={tile} height={tile / 2} />
    </View>}
  </View>
}
