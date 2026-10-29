import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Animated, Easing, Platform, View } from 'react-native'
import { trialChunks, trialSprites } from '../generated/trial-assets.js'
import { goalsMet, lit } from './trial'
import type { Room, Stage } from './trial'
import type { TrialRun } from './trials'
import type { Point } from './safari-zone'
import { cameraOffset, tileSizeFor } from './safari-view'
import { Frame, Sprite, TileWorld } from './TileWorld'
import type { Strip, TileChunks } from './TileWorld'
import { PixelSprite } from './TeamPicker'

export type TrialStage = Stage & { chunk: number }
export type TrialMove = { kind: 'step' | 'bump' | 'none', id: number, warp?: boolean }
const sprites = trialSprites as Record<string, Strip>
const chunkImages = trialChunks as Record<string, TileChunks>
const native = Platform.OS !== 'web'
const DARK = '#0b0b14'
const key = (x: number, y: number) => `${x},${y}`
const cells = (stage: Stage, chars: string) => stage.tiles.flatMap((row, y) => [...row].flatMap((tile, x) => chars.includes(tile) ? [{ x, y, tile }] : []))
const meteoriteAt = (stage: Stage): Point | null => cells(stage, 'M')[0] ?? null

type Props = {
  run: TrialRun, stage: TrialStage, move: TrialMove, jump: number, trainer: 'brendan' | 'may', buddy: { name: string, shiny: boolean } | null,
  width: number, height: number, reduced: boolean, tapToWalk: boolean, onTapTile: (tile: Point) => void, falling?: boolean, revealing?: boolean
}

// One trial room on the shared tile world: the baked terrain from trialChunks, every object tile drawn in its current state on
// top, and in dark rooms a cover that hides what was never seen and dims what is out of the light. `revealing` leaves the
// meteorite to StarReveal.
export function TrialWorld({ run, stage, move, jump, trainer, buddy, width, height, reduced, tapToWalk, onTapTile, falling = false, revealing = false }: Props) {
  const room = run.room
  const tile = tileSizeFor(width)
  const tick = useTicker(!reduced && (cells(stage, '!').length > 0 || room.lit.length > 0), 250)
  const exit = useExitFrame(goalsMet(room, stage), reduced)
  const glow = useWarpGlow(room, stage, move, reduced)
  const [pulse] = useState(() => new Animated.Value(1))
  useEffect(() => {
    if (reduced) { pulse.setValue(1); return }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
      Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: native })]))
    loop.start()
    return () => loop.stop()
  }, [pulse, reduced])

  const at = (x: number, y: number, strip: string, frame: number) => <Sprite key={`${strip}:${key(x, y)}`} strip={sprites[strip]} frame={frame} at={{ x, y }} tile={tile} />
  const objects: ReactNode[] = []
  const relics: ReactNode[] = []
  for (const { x, y, tile: char } of cells(stage, '*_=:!X123456789abcABC%?')) {
    const here = key(x, y)
    if (char === '*') { if (!room.relics.includes(here)) relics.push(at(x, y, 'relic', 0)) }
    else if (char === '_') objects.push(at(x, y, 'plate', 0))
    else if (char === '=') objects.push(at(x, y, 'door', room.doorsOpen ? 1 : 0))
    else if (char === ':') objects.push(at(x, y, 'fragile', room.holes.includes(here) ? 1 : 0))
    else if (char === '!') objects.push(at(x, y, 'torch', tick % 2))
    else if (char === 'X') objects.push(at(x, y, 'exit', exit))
    else if (/[1-9]/.test(char)) objects.push(at(x, y, 'warp', glow.pads.includes(char) ? glow.frame : 0))
    else if ('abc'.includes(char)) objects.push(at(x, y, `switch-${char}`, room.open.includes(char.toUpperCase()) ? 1 : 0))
    else if ('ABC'.includes(char)) objects.push(at(x, y, `gate-${char.toLowerCase()}`, room.open.includes(char) ? 1 : 0))
    else if (char === '%') {
      const node = stage.star?.nodes.find(n => n.at[0] === x && n.at[1] === y)
      const on = !!node && room.lit.includes(node.id)
      objects.push(at(x, y, 'crystal', on ? reduced ? 1 : [1, 2, 3, 2][tick % 4] : 0))
    } else if (char === '?') objects.push(at(x, y, 'clue', 0))
  }
  const rock = meteoriteAt(stage)
  return <TileWorld map={{ cols: stage.tiles[0].length, rows: stage.tiles.length, chunk: stage.chunk }} chunks={chunkImages[stage.id] ?? {}}
    at={room.at} facing={room.facing} buddyAt={room.buddy} buddyFacing={room.buddyFacing} move={move} trainer={trainer} buddy={buddy} onGrass={false}
    width={width} height={height} reduced={reduced} jump={jump} background={DARK} tapToWalk={tapToWalk} onTapTile={onTapTile} falling={falling}
    cover={stage.dark ? <Cover room={room} stage={stage} tile={tile} /> : undefined}>
    {objects}
    {relics.length > 0 && <Animated.View style={{ position: 'absolute', left: 0, top: 0, opacity: pulse }}>{relics}</Animated.View>}
    {room.boulders.map((spot, i) => <Boulder key={i} at={spot} tile={tile} reduced={reduced} jump={jump} />)}
    {rock && !revealing && <View style={{ position: 'absolute', left: rock.x * tile, top: rock.y * tile }}>
      <Frame strip={sprites.meteorite} frame={room.pattern} width={tile * 2} height={tile * 2} />
    </View>}
  </TileWorld>
}

// Unseen: dark. Seen but out of the light: dimmed. Lit: clear.
function Cover({ room, stage, tile }: { room: Room, stage: Stage, tile: number }) {
  const light = lit(room, stage)
  const seen = new Set(room.seen)
  return <>{stage.tiles.flatMap((row, y) => [...row].flatMap((_, x) => {
    const here = key(x, y)
    if (light.has(here)) return []
    return [<View key={here} style={{ position: 'absolute', left: x * tile, top: y * tile, width: tile, height: tile, backgroundColor: DARK,
      opacity: seen.has(here) ? 0.6 : 1 }} />]
  }))}</>
}

// A boulder glides to its new tile when pushed (it keeps its index in room.boulders), and snaps on a room change.
function Boulder({ at, tile, reduced, jump }: { at: string, tile: number, reduced: boolean, jump: number }) {
  const [x, y] = at.split(',').map(Number)
  const [position] = useState(() => new Animated.ValueXY({ x: x * tile, y: y * tile }))
  const jumped = useRef(jump)
  useEffect(() => {
    const toValue = { x: x * tile, y: y * tile }
    if (reduced || jumped.current !== jump) { jumped.current = jump; position.setValue(toValue); return }
    const glide = Animated.timing(position, { toValue, duration: 220, easing: Easing.linear, useNativeDriver: native })
    glide.start()
    return () => glide.stop()
  }, [position, x, y, tile, reduced, jump])
  return <Animated.View style={{ position: 'absolute', left: 0, top: 0, transform: position.getTranslateTransform() }}>
    <Frame strip={sprites.boulder} frame={0} width={tile} height={tile} />
  </Animated.View>
}

function useTicker(running: boolean, interval: number) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setTick(current => current + 1), interval)
    return () => clearInterval(timer)
  }, [running, interval])
  return tick
}

// The exit's seal slides off its stairs once the room's goals are met (frames 0-3), and slides back on a restart.
function useExitFrame(open: boolean, reduced: boolean) {
  const [frame, setFrame] = useState(open ? 3 : 0)
  useEffect(() => {
    if (!open || reduced) return
    const timers = [1, 2, 3].map((value, i) => setTimeout(() => setFrame(value), i * 120))
    return () => { timers.forEach(clearTimeout); setFrame(0) }
  }, [open, reduced])
  return !open ? 0 : reduced ? 3 : frame
}

// A used warp link brightens both of its pads for a moment (frames 3, 2, 1), then they rest at frame 0.
function useWarpGlow(room: Room, stage: Stage, move: TrialMove, reduced: boolean) {
  const [glow, setGlow] = useState<{ pads: string[], frame: number }>({ pads: [], frame: 0 })
  useEffect(() => {
    if (!move.warp || reduced) return
    const arrived = stage.tiles[room.at.y]?.[room.at.x] ?? ''
    const pads = [arrived, ...Object.keys(stage.warps).filter(pad => stage.warps[pad] === arrived)]
    const timers = [3, 2, 1, 0].map((frame, i) => setTimeout(() => setGlow({ pads, frame }), i * 110))
    return () => timers.forEach(clearTimeout)
  }, [move.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return glow
}

const MAP_TILE = 6
const mapColour = (char: string) => '#!'.includes(char) ? '#4a4458' : char === '~' ? '#2b5d9c' : 'RM?'.includes(char) ? '#7a6a58' : '#d9cfb8'

// The minimap: only tiles you have seen, with relics still to take, the exit, used warp pads, crystals (lit ones bright) and you.
export function TrialMap({ run, stage }: { run: TrialRun, stage: Stage }) {
  const room = run.room
  const seen = new Set(room.seen)
  const cols = stage.tiles[0].length, rows = stage.tiles.length
  const used = new Set(room.warpsUsed.flatMap(pad => [pad, stage.warps[pad]]))
  const marks: { x: number, y: number, colour: string }[] = []
  stage.tiles.forEach((row, y) => [...row].forEach((char, x) => {
    if (!seen.has(key(x, y))) return
    if (char === '*' && !room.relics.includes(key(x, y))) marks.push({ x, y, colour: '#f8c030' })
    else if (char === 'X') marks.push({ x, y, colour: goalsMet(room, stage) ? '#40d870' : '#e05050' })
    else if (used.has(char)) marks.push({ x, y, colour: '#58a8f8' })
    else if (char === '%') {
      const node = stage.star?.nodes.find(n => n.at[0] === x && n.at[1] === y)
      marks.push({ x, y, colour: node && room.lit.includes(node.id) ? '#b8f0ff' : '#506070' })
    }
  }))
  const found = marks.filter(mark => mark.colour === '#f8c030').length
  return <View accessible accessibilityRole="image" accessibilityLabel={`Map of the explored room: ${seen.size} of ${cols * rows} tiles seen${found ? `, ${found} relic${found === 1 ? '' : 's'} spotted` : ''}.`}
    style={{ width: cols * MAP_TILE + 4, height: rows * MAP_TILE + 4, padding: 2, borderRadius: 4, backgroundColor: DARK, alignSelf: 'center' }}>
    {stage.tiles.flatMap((row, y) => [...row].flatMap((char, x) => seen.has(key(x, y))
      ? [<View key={key(x, y)} style={{ position: 'absolute', left: 2 + x * MAP_TILE, top: 2 + y * MAP_TILE, width: MAP_TILE, height: MAP_TILE, backgroundColor: mapColour(char) }} />] : []))}
    {marks.map(({ x, y, colour }) => <View key={`m${key(x, y)}`} style={{ position: 'absolute', left: 3 + x * MAP_TILE, top: 3 + y * MAP_TILE,
      width: MAP_TILE - 2, height: MAP_TILE - 2, borderRadius: MAP_TILE, backgroundColor: colour }} />)}
    <View style={{ position: 'absolute', left: 2 + room.at.x * MAP_TILE, top: 2 + room.at.y * MAP_TILE, width: MAP_TILE, height: MAP_TILE,
      borderWidth: 1.5, borderColor: '#ffffff', backgroundColor: '#e83030' }} />
  </View>
}

// Twinkle spots across the view, as fractions of its width and height.
const STARS = [[0.12, 0.18], [0.3, 0.08], [0.52, 0.22], [0.78, 0.12], [0.9, 0.34], [0.08, 0.5], [0.24, 0.72], [0.44, 0.88], [0.68, 0.7],
  [0.86, 0.84], [0.62, 0.42], [0.36, 0.4]]

// The Shattered Star wakes: the meteorite plays its three shatter frames (150 ms each), a pale-violet flash and a dozen
// twinkling stars fill the view for 1.2 s, then Deoxys fades and rises in on the meteorite over 800 ms; onDone at 2.5 s.
// With reduced motion it shows Deoxys on the opened meteorite for 700 ms. Drawn over TrialWorld (which hides its meteorite).
export function StarReveal({ stage, at, width, height, reduced, onDone }: {
  stage: Stage, at: Point, width: number, height: number, reduced: boolean, onDone: () => void
}) {
  const [frame, setFrame] = useState(reduced ? -1 : 3)
  const [flash] = useState(() => new Animated.Value(0))
  const [twinkle] = useState(() => new Animated.Value(0))
  const [rise] = useState(() => new Animated.Value(reduced ? 1 : 0))
  const done = useRef(onDone)
  useEffect(() => { done.current = onDone })
  useEffect(() => {
    if (reduced) {
      const timer = setTimeout(() => done.current(), 700)
      return () => clearTimeout(timer)
    }
    const timers = [setTimeout(() => setFrame(4), 150), setTimeout(() => setFrame(5), 300), setTimeout(() => setFrame(-1), 450),
      setTimeout(() => done.current(), 2500)]
    const show = Animated.sequence([
      Animated.delay(450),
      Animated.parallel([
        Animated.sequence([
          Animated.timing(flash, { toValue: 0.8, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: native }),
          Animated.timing(flash, { toValue: 0, duration: 1050, easing: Easing.in(Easing.quad), useNativeDriver: native })]),
        Animated.timing(twinkle, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: native })]),
      Animated.timing(rise, { toValue: 1, duration: 800, easing: Easing.out(Easing.quad), useNativeDriver: native })])
    show.start()
    return () => { timers.forEach(clearTimeout); show.stop() }
  }, [reduced, flash, twinkle, rise])
  const rock = meteoriteAt(stage)
  if (!rock) return null
  const tile = tileSizeFor(width)
  const offset = cameraOffset(at, tile, width, height)
  const left = offset.x + rock.x * tile, top = offset.y + rock.y * tile, size = tile * 2
  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height, overflow: 'hidden' }}>
    {frame >= 0 && <View style={{ position: 'absolute', left, top }}><Frame strip={sprites.meteorite} frame={frame} width={size} height={size} /></View>}
    <Animated.View style={{ position: 'absolute', left: 0, top: 0, width, height, backgroundColor: '#d8c8ff', opacity: flash }} />
    {!reduced && STARS.map(([fx, fy], i) => {
      const start = (i % 6) / 8
      return <Animated.View key={i} style={{ position: 'absolute', left: fx * width, top: fy * height, width: 5, height: 5, borderRadius: 3,
        backgroundColor: '#ffffff', opacity: twinkle.interpolate({ inputRange: [0, start, start + 0.12, start + 0.25, 1], outputRange: [0, 0, 1, 0.2, 0] }) }} />
    })}
    <Animated.View style={{ position: 'absolute', left: left - size * 0.15, top: top - size * 0.3, opacity: rise,
      transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [tile, 0] }) }] }}>
      <PixelSprite name="Deoxys" size={size * 1.3} />
    </Animated.View>
  </View>
}
