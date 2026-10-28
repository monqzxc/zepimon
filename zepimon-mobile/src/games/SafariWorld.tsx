import { memo, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Animated, Easing, Image, Platform, Pressable, Text, View } from 'react-native'
import type { ImageSourcePropType } from 'react-native'
import { safariChunks, safariSprites } from '../generated/safari-assets.js'
import { trailWalkers } from '../generated/trail-walkers.js'
import { PixelSprite } from './TeamPicker'
import { pointKey, safariMap, tileAt } from './safari-zone'
import type { Point, WalkResult, ZoneGame } from './safari-zone'
import { STEP_MS, buddyFrame, cameraOffset, chunksAround, tileFromTap, tileSizeFor, trainerFrame } from './safari-view'

type Strip = { source: ImageSourcePropType, frames: number, width: number, height: number }
const sprites = safariSprites as Record<'brendan' | 'may' | 'grass' | 'dust' | 'shadow' | 'item', Strip>
const chunkImages = safariChunks as Record<string, { ground: ImageSourcePropType, top?: ImageSourcePropType }>
const walkers = trailWalkers as Record<string, ImageSourcePropType>
const native = Platform.OS !== 'web'
const pixelated = Platform.OS === 'web' ? { imageRendering: 'pixelated' as const } : {}
const items = safariMap.tiles.flatMap((row, y) => [...row].flatMap((tile, x) => tile === 'o' ? [{ x, y }] : []))

type Props = {
  game: ZoneGame, move: { kind: WalkResult['move'], id: number }, trainer: 'brendan' | 'may',
  buddy: { name: string, shiny: boolean } | null, width: number, height: number, reduced: boolean,
  tapToWalk: boolean, onTapTile: (tile: Point) => void, miss: { tile: Point, id: number } | null
}

// The Safari Zone map. The trainer stays in the middle and the map glides under them one tile per step, like a GBA.
// Layers, bottom to top: ground chunks, items and rustling grass, the buddy, the trainer, then the top chunks (tree
// crowns and roofs) so the trainer walks behind them. Only chunks near the view are loaded.
export function SafariWorld({ game, move, trainer, buddy, width, height, reduced, tapToWalk, onTapTile, miss }: Props) {
  const tile = tileSizeFor(width)
  const [camera] = useState(() => new Animated.ValueXY(cameraOffset(game.at, tile, width, height)))
  const target = cameraOffset(game.at, tile, width, height)
  useEffect(() => {
    if (reduced) { camera.setValue(target); return }
    const glide = Animated.timing(camera, { toValue: target, duration: STEP_MS, easing: Easing.linear, useNativeDriver: native })
    glide.start()
    return () => glide.stop()
  }, [camera, target.x, target.y, reduced]) // eslint-disable-line react-hooks/exhaustive-deps
  const keys = chunksAround(game.at, tile, width, height)
  const layer = (children: ReactNode) => <Animated.View pointerEvents="none"
    style={{ position: 'absolute', left: 0, top: 0, transform: camera.getTranslateTransform() }}>{children}</Animated.View>
  const map = <View pointerEvents="none" style={{ width, height, overflow: 'hidden', backgroundColor: '#1d3b2a' }}>
    {layer(<>
      <Chunks keys={keys} tile={tile} layer="ground" />
      {items.filter(point => !game.items.includes(pointKey(point))).map(point =>
        <Sprite key={pointKey(point)} strip={sprites.item} frame={0} at={point} tile={tile} />)}
      {game.rustling && <Rustle at={game.rustling} tile={tile} reduced={reduced} />}
      {buddy && pointKey(game.buddy) !== pointKey(game.at) &&
        <Buddy name={buddy.name} shiny={buddy.shiny} at={game.buddy} frame={buddyFrame(game.buddyFacing, (move.id % 2) as 0 | 1)} tile={tile} reduced={reduced} />}
      {miss && <Miss key={miss.id} at={miss.tile} tile={tile} />}
    </>)}
    <Trainer trainer={trainer} facing={game.facing} move={move} onGrass={tileAt(game.at) === 'g'} tile={tile}
      left={width / 2 - tile / 2} top={height / 2 - tile / 2} reduced={reduced} />
    {layer(<Chunks keys={keys} tile={tile} layer="top" />)}
  </View>
  if (!tapToWalk) return map
  return <Pressable accessibilityRole="button" accessibilityLabel="Map. Tap a spot to walk there."
    onPress={event => onTapTile(tileFromTap({ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY }, game.at, tile, width, height))}>
    {map}
  </Pressable>
}

const Chunks = memo(function Chunks({ keys, tile, layer }: { keys: string[], tile: number, layer: 'ground' | 'top' }) {
  const size = safariMap.chunk * tile
  return <>{keys.map(key => {
    const source = chunkImages[key]?.[layer]
    if (!source) return null
    const [cx, cy] = key.split(',').map(Number)
    const across = Math.min(safariMap.chunk, safariMap.cols - cx * safariMap.chunk), down = Math.min(safariMap.chunk, safariMap.rows - cy * safariMap.chunk)
    return <Image key={key} source={source} fadeDuration={0} resizeMode="stretch"
      style={{ position: 'absolute', left: cx * size, top: cy * size, width: across * tile, height: down * tile, ...pixelated }} />
  })}</>
})

// One frame of a sprite strip, `scale` tiles wide, with its bottom on the tile at `at`.
function Sprite({ strip, frame, at, tile, scale = 1 }: { strip: Strip, frame: number, at: Point, tile: number, scale?: number }) {
  const width = tile * scale, height = width * strip.height / strip.width
  return <View style={{ position: 'absolute', left: at.x * tile + (tile - width) / 2, top: (at.y + 1) * tile - height }}>
    <Frame strip={strip} frame={frame} width={width} height={height} />
  </View>
}

function Frame({ strip, frame, width, height }: { strip: Strip, frame: number, width: number, height: number }) {
  return <View style={{ width, height, overflow: 'hidden' }}>
    <Image source={strip.source} fadeDuration={0} resizeMode="stretch"
      style={{ position: 'absolute', top: 0, left: -frame * width, width: width * strip.frames, height, ...pixelated }} />
  </View>
}

// Frames 1-4 of the tall grass effect over and over: something is hiding there.
function Rustle({ at, tile, reduced }: { at: Point, tile: number, reduced: boolean }) {
  const [frame, setFrame] = useState(1)
  useEffect(() => {
    if (reduced) return
    const timer = setInterval(() => setFrame(current => current % 4 + 1), 120)
    return () => clearInterval(timer)
  }, [reduced])
  return <Sprite strip={sprites.grass} frame={reduced ? 2 : frame} at={at} tile={tile} />
}

function Buddy({ name, shiny, at, frame, tile, reduced }: { name: string, shiny: boolean, at: Point, frame: number, tile: number, reduced: boolean }) {
  const [position] = useState(() => new Animated.ValueXY({ x: at.x * tile, y: at.y * tile }))
  useEffect(() => {
    const toValue = { x: at.x * tile, y: at.y * tile }
    if (reduced) { position.setValue(toValue); return }
    const glide = Animated.timing(position, { toValue, duration: STEP_MS, easing: Easing.linear, useNativeDriver: native })
    glide.start()
    return () => glide.stop()
  }, [position, at.x, at.y, tile, reduced])
  const strip = walkers[(shiny ? 'Shiny ' : '') + name]
  return <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: tile, height: tile, transform: position.getTranslateTransform() }}>
    {strip ? <Frame strip={{ source: strip, frames: 8, width: 44, height: 44 }} frame={frame} width={tile} height={tile} />
      : <PixelSprite name={name} shiny={shiny} size={tile} />}
  </Animated.View>
}

function Miss({ at, tile }: { at: Point, tile: number }) {
  const [shown, setShown] = useState(true)
  useEffect(() => { const timer = setTimeout(() => setShown(false), 600); return () => clearTimeout(timer) }, [])
  if (!shown) return null
  return <Text style={{ position: 'absolute', left: at.x * tile, top: at.y * tile, width: tile, height: tile, lineHeight: tile, textAlign: 'center',
    fontSize: tile * 0.6, fontWeight: '900', color: '#ffffff', textShadowColor: '#000000', textShadowRadius: 3 }}>✕</Text>
}

// The trainer, fixed in the middle of the view: a step frame on each step, a hop with a shadow and a dust puff over
// ledges, and tall grass over their feet while they stand in it.
function Trainer({ trainer, facing, move, onGrass, tile, left, top, reduced }: {
  trainer: 'brendan' | 'may', facing: ZoneGame['facing'], move: Props['move'], onGrass: boolean, tile: number, left: number, top: number, reduced: boolean
}) {
  // The step frame shows until this move has settled; a hop lasts until it has landed. Both are set by timers.
  const [settled, setSettled] = useState(move.id)
  const [landed, setLanded] = useState(move.id)
  const [dust, setDust] = useState(-1)
  const [grass, setGrass] = useState(0)
  const [lift] = useState(() => new Animated.Value(0))
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
    <Animated.View style={{ transform: [{ translateY: lift }] }}>
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
