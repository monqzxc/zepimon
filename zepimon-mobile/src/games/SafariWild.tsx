import { memo, useEffect, useMemo, useState } from 'react'
import { Animated, Easing, Image, Platform, Text, View } from 'react-native'
import type { ImageSourcePropType } from 'react-native'
import { safariSprites } from '../generated/safari-assets.js'
import { colors } from '../ui'
import { RING_MS } from './safari'
import type { Encounter } from './safari'
import type { Direction, Point, Wild, WildAct, ZoneGame } from './safari-zone'
import { ABSORB_MS, BREAK_MS, VANISH_MS, WOBBLES, WOBBLE_MS, actTimes } from './safari-view'
import type { ActTimes } from './safari-view'
import { OverworldSprite } from './OverworldSprite'
import { ShinyStars } from './ShinyAura'
import { Frame } from './TileWorld'

type Strip = { source: ImageSourcePropType, frames: number, width: number, height: number }
const native = Platform.OS !== 'web'
const pixelated = Platform.OS === 'web' ? { imageRendering: 'pixelated' as const } : {}
const sprites = safariSprites as Record<'grass' | 'safariBall', Strip>
// How long the Pokemon you walked into takes to notice you: it hops back a tile (if it had room) with a "!" overhead.
const NOTICE_MS = 700

// The wild Pokemon you are dealing with on the map, and what is needed to draw it: the act being played out (if any) and
// the clocks that drive it. clock runs from 0 to the act's `done` while it plays, and rests at `done` otherwise; notice
// runs 0 to 1 as it notices you. from: the tile it stood on when you walked into it.
export type WildScene = { wild: Wild, encounter: Encounter | null, act: WildAct | null, times: ActTimes | null, live: boolean,
  clock: Animated.Value, notice: Animated.Value, from: Point }

const step = (point: Point, direction: Direction) =>
  ({ x: point.x + (direction === 'east' ? 1 : direction === 'west' ? -1 : 0), y: point.y + (direction === 'south' ? 1 : direction === 'north' ? -1 : 0) })
const OPPOSITE: Record<Direction, Direction> = { north: 'south', south: 'north', west: 'east', east: 'west' }

// The Pokemon is the encounter's, or the one that just left (so it can be seen going). playing: the id of the act the
// screen is playing out, or null.
export function useWildScene(game: ZoneGame, playing: number | null, reduced: boolean): WildScene | null {
  const act = game.act
  const met = game.encounter ? game.wilds.find(wild => wild.id === game.encounter!.id) ?? null : null
  const wild = met ?? (act?.left ? act.wild : null)
  const [clock] = useState(() => new Animated.Value(0))
  const [notice] = useState(() => new Animated.Value(1))
  const times = useMemo(() => act ? actTimes(act) : null, [act])
  const live = !!act && playing === act.id && !reduced
  useEffect(() => {
    if (!times) { clock.setValue(0); return }
    if (!live) { clock.setValue(times.done); return }
    clock.setValue(0)
    const run = Animated.timing(clock, { toValue: times.done, duration: times.done, easing: Easing.linear, useNativeDriver: native })
    run.start()
    return () => run.stop()
  }, [clock, times, live])
  const fresh = game.encounter?.id ?? null
  useEffect(() => {
    if (fresh === null) return
    if (reduced) { notice.setValue(1); return }
    notice.setValue(0)
    const run = Animated.timing(notice, { toValue: 1, duration: NOTICE_MS, easing: Easing.linear, useNativeDriver: native })
    run.start()
    return () => run.stop()
  }, [notice, fresh, reduced])
  if (!wild) return null
  // You walked into it from the tile next to you, the way you face.
  return { wild, encounter: met ? game.encounter : null, act, times, live, clock, notice, from: met ? step(game.at, game.facing) : wild.at }
}

// Keyframes [ms, value] on the act clock, clamped at both ends. Times are nudged to rise strictly, so a jump is 1 ms long.
function track(clock: Animated.Value, keys: [number, number][]) {
  const points = keys.length ? keys : [[0, 0]] as [number, number][]
  const input: number[] = [], output: number[] = []
  for (const [time, value] of points) {
    input.push(input.length ? Math.max(time, input[input.length - 1] + 1) : time)
    output.push(value)
  }
  if (input.length === 1) { input.push(input[0] + 1); output.push(output[0]) }
  return clock.interpolate({ inputRange: input, outputRange: output, extrapolate: 'clamp' })
}

// A quick side-to-side shake from `start` for `length` ms.
function shake(start: number, length: number, size: number): [number, number][] {
  return Array.from({ length: 9 }, (_, i) => [start + i * length / 8, i === 0 || i === 8 ? 0 : i % 2 ? size : -size])
}

// The Pokemon you are dealing with, on its tile under the trainer layer, facing you. It hops back as it notices you,
// hops when it likes a berry, shakes when it dislikes one, is angry or breaks free, shrinks into a ball, bounds off when
// it flees and fades away when you walk off.
export const WildFoe = memo(function WildFoe({ scene, tile, inGrass, reduced }: { scene: WildScene, tile: number, inGrass: boolean, reduced: boolean }) {
  const { wild, act, times, clock, notice, from } = scene
  const motion = useMemo(() => {
    const x: [number, number][] = [], y: [number, number][] = [], seen: [number, number][] = [], size: [number, number][] = []
    if (act && times) {
      const { hit, out, leave } = times
      if (act.reaction === 'likes') y.push(...[0, 0.25, 0.5, 0.75, 1].map((f, i): [number, number] => [hit + f * (out - hit), i % 2 ? -tile * 0.3 : 0]))
      if (act.reaction === 'dislikes') x.push(...shake(hit, out - hit, tile * 0.08))
      if (act.reaction === 'angry') x.push(...shake(hit, out - hit, tile * 0.14))
      if (act.thrown === 'ball') {
        seen.push([hit, 1], [hit + ABSORB_MS, 0])
        size.push([hit, 1], [hit + ABSORB_MS, 0.2])
        if (act.reaction === 'broke-free') {
          seen.push([out, 0], [out + 150, 1])
          size.push([out, 0.2], [out + 150, 1])
          x.push(...shake(out + 150, BREAK_MS - 150, tile * 0.1))
        }
      }
      if (leave !== null) {
        seen.push([leave, 1], [leave + VANISH_MS, 0])
        // A Pokemon that flees bounds off away from you; one you walk away from just fades.
        if (act.left === 'fled') {
          const away = step({ x: 0, y: 0 }, OPPOSITE[wild.facing])
          x.push([leave, 0], [leave + VANISH_MS, away.x * tile * 0.8])
          y.push([leave, 0], [leave + VANISH_MS / 2, -tile * 0.3 + away.y * tile * 0.4], [leave + VANISH_MS, away.y * tile * 0.8])
        }
      }
    }
    const back = { x: (from.x - wild.at.x) * tile, y: (from.y - wild.at.y) * tile }
    return {
      x: Animated.add(notice.interpolate({ inputRange: [0, 0.4, 1], outputRange: [back.x, 0, 0] }), track(clock, x)),
      y: Animated.add(notice.interpolate({ inputRange: [0, 0.2, 0.4, 1], outputRange: [back.y, back.y / 2 - tile * 0.35, 0, 0] }), track(clock, y)),
      opacity: track(clock, seen.length ? seen : [[0, 1]]),
      scale: track(clock, size.length ? size : [[0, 1]])
    }
  }, [act, times, clock, notice, tile, wild.at, wild.facing, from])
  return <>
    <Animated.View pointerEvents="none" accessible accessibilityLabel={`A wild ${wild.shiny ? 'Shiny ' : ''}${wild.name}, facing you`}
      style={{ position: 'absolute', left: wild.at.x * tile, top: wild.at.y * tile, width: tile, height: tile,
        opacity: motion.opacity, transform: [{ translateX: motion.x }, { translateY: motion.y }, { scale: motion.scale }] }}>
      <OverworldSprite name={wild.name} shiny={wild.shiny} size={tile} facing={wild.facing} />
      {wild.shiny && <View style={{ position: 'absolute', left: 0, top: 0 }}><ShinyStars size={tile} reduced={reduced} /></View>}
    </Animated.View>
    {/* Tall grass over its feet, as over the roaming Pokemon's. */}
    {inGrass && <View pointerEvents="none" style={{ position: 'absolute', left: wild.at.x * tile, top: wild.at.y * tile + tile / 2, width: tile, height: tile / 2, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', top: -tile / 2 }}><Frame strip={sprites.grass} frame={0} width={tile} height={tile} /></View>
    </View>}
  </>
})

// Everything over the map for the encounter: the "!" as the Pokemon notices you, the shrinking ring while you aim, and
// the thrown ball, berry or rock with the Pokemon's reaction bubble while an act plays out.
export function WildCover({ scene, trainerAt, tile, reduced }: { scene: WildScene, trainerAt: Point, tile: number, reduced: boolean }) {
  const { wild, encounter, notice, live } = scene
  const centre = { x: (wild.at.x + 0.5) * tile, y: (wild.at.y + 0.5) * tile }
  const ring = tile * 2.4
  return <>
    {!!encounter && <Animated.View pointerEvents="none" style={{ position: 'absolute', left: centre.x - tile * 0.35, top: (wild.at.y - 0.8) * tile,
      opacity: notice.interpolate({ inputRange: [0, 0.9, 1], outputRange: [1, 1, 0] }) }}>
      <Bubble mark="!" color="#d83a3a" size={tile * 0.7} />
    </Animated.View>}
    {!!encounter && !live && <View pointerEvents="none" style={{ position: 'absolute', left: centre.x - ring / 2, top: centre.y - ring / 2, width: ring, height: ring,
      alignItems: 'center', justifyContent: 'center' }}>
      <Ring since={encounter.since} size={ring} reduced={reduced} />
    </View>}
    {live && scene.act && scene.times && <ThrowEffects act={scene.act} times={scene.times} clock={scene.clock} from={trainerAt} to={wild.at} tile={tile} />}
  </>
}

const ThrowEffects = memo(function ThrowEffects({ act, times, clock, from, to, tile }: {
  act: WildAct, times: ActTimes, clock: Animated.Value, from: Point, to: Point, tile: number
}) {
  const { hit, out, done } = times
  const item = act.thrown === 'ball' ? tile * 0.45 : act.thrown === 'berry' ? tile * 0.34 : tile * 0.32
  const start = { x: (from.x + 0.5) * tile - item / 2, y: (from.y - 0.2) * tile - item / 2 }
  const end = { x: (to.x + 0.5) * tile - item / 2, y: (to.y + 0.75) * tile - item }
  const flight = useMemo(() => {
    const wobble: [number, number][] = [[0, 0]]
    if (act.thrown === 'ball') for (let i = 0; i < WOBBLES; i++) {
      const at = hit + ABSORB_MS + i * WOBBLE_MS
      wobble.push([at, 0], [at + WOBBLE_MS / 4, -22], [at + WOBBLE_MS * 3 / 4, 22], [at + WOBBLE_MS, 0])
    }
    if (wobble.length === 1) wobble.push([1, 0])
    const seen: [number, number][] = act.thrown === 'ball'
      ? (act.reaction === 'caught' ? [[0, 1], [out, 1], [done, 0]] : [[0, 1], [out, 1], [out + 1, 0]])
      : act.thrown === 'berry' ? [[0, 1], [hit, 1], [out, 0]] : [[0, 1], [hit, 1], [hit + 1, 0]]
    return {
      x: track(clock, [[0, start.x], [hit, end.x]]),
      y: track(clock, [[0, start.y], [hit, end.y]]),
      arc: track(clock, [[0, 0], [hit / 2, -tile * 0.9], [hit, 0]]),
      spin: clock.interpolate({ inputRange: wobble.map(([time], i) => time + i * 0.001), outputRange: wobble.map(([, deg]) => `${deg}deg`), extrapolate: 'clamp' }),
      opacity: track(clock, seen)
    }
  }, [act, clock, hit, out, done, start.x, start.y, end.x, end.y, tile])
  const bubble = act.reaction === 'likes' ? { mark: '♥', color: '#e8487a', from: hit, to: out }
    : act.reaction === 'dislikes' ? { mark: '…', color: '#4a4a58', from: hit, to: out }
    : act.reaction === 'angry' ? { mark: '💢', color: '#d83a3a', from: hit, to: out }
    : act.reaction === 'broke-free' ? { mark: '!', color: '#d83a3a', from: out, to: out + BREAK_MS }
    : null
  const shown = useMemo(() => bubble && track(clock, [[bubble.from - 1, 0], [bubble.from, 1], [bubble.to - 1, 1], [bubble.to, 0]]), [clock, bubble?.from, bubble?.to]) // eslint-disable-line react-hooks/exhaustive-deps
  const stars = useMemo(() => act.reaction === 'caught' ? track(clock, [[out - 1, 0], [out, 1], [done, 0]]) : null, [act, clock, out, done])
  return <>
    {act.thrown && <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: item, height: item, opacity: flight.opacity,
      transform: [{ translateX: flight.x }, { translateY: flight.y }] }}>
      <Animated.View style={{ width: item, height: item, transform: [{ translateY: flight.arc }, { rotate: flight.spin }] }}>
        {act.thrown === 'ball' ? <Image source={sprites.safariBall.source} fadeDuration={0} resizeMode="stretch" style={{ width: item, height: item, ...pixelated }} />
          : act.thrown === 'berry' ? <Berry size={item} /> : <Rock size={item} />}
      </Animated.View>
    </Animated.View>}
    {bubble && shown && <Animated.View pointerEvents="none" style={{ position: 'absolute', left: (to.x + 0.5) * tile - tile * 0.35, top: (to.y - 0.8) * tile, opacity: shown }}>
      <Bubble mark={bubble.mark} color={bubble.color} size={tile * 0.7} />
    </Animated.View>}
    {stars && <Animated.View pointerEvents="none" style={{ position: 'absolute', left: end.x - item / 2, top: end.y - item, width: item * 2, opacity: stars,
      flexDirection: 'row', justifyContent: 'space-between' }}>
      {['✦', '✦', '✦'].map((star, i) => <Text key={i} style={{ color: '#ffe066', fontSize: item * 0.5, fontWeight: '900', marginTop: i === 1 ? -item * 0.3 : 0,
        textShadowColor: '#000000', textShadowRadius: 2 }}>{star}</Text>)}
    </Animated.View>}
  </>
})

// An emote bubble, as Emerald shows over a character's head.
function Bubble({ mark, color, size }: { mark: string, color: string, size: number }) {
  return <View style={{ width: size, height: size, borderRadius: size * 0.3, borderWidth: 2, borderColor: '#202028', backgroundColor: '#ffffff',
    alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color, fontSize: size * 0.58, lineHeight: size * 0.8, fontWeight: '900', textAlign: 'center' }}>{mark}</Text>
  </View>
}

function Berry({ size }: { size: number }) {
  return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }}>
    <View style={{ position: 'absolute', top: 0, width: size * 0.42, height: size * 0.3, borderRadius: size * 0.15, backgroundColor: '#3fae4a',
      borderWidth: 1, borderColor: '#1f5f28' }} />
    <View style={{ width: size * 0.82, height: size * 0.78, borderRadius: size * 0.41, backgroundColor: '#d8345c', borderWidth: 1.5, borderColor: '#6e1028' }} />
  </View>
}

function Rock({ size }: { size: number }) {
  return <View style={{ width: size, height: size * 0.8, marginTop: size * 0.2, borderRadius: size * 0.35, borderTopLeftRadius: size * 0.2,
    backgroundColor: '#9a968e', borderWidth: 1.5, borderColor: '#4a4740' }} />
}

// The aiming ring, on the same clock the rules use (ringScale in safari.ts): it shrinks from full size to 30% every
// RING_MS, starting when the Pokemon noticed you, and turns gold, then green, as a throw gets better. It keeps its own
// time because the map only redraws when something on it moves. With reduced motion it steps a few times a second.
function Ring({ since, size, reduced }: { since: number, size: number, reduced: boolean }) {
  const [progress] = useState(() => new Animated.Value(0))
  useEffect(() => {
    const set = () => progress.setValue((Math.max(0, performance.now() - since) % RING_MS) / RING_MS)
    set()
    if (reduced) { const timer = setInterval(set, 150); return () => clearInterval(timer) }
    let frame = requestAnimationFrame(function tick() { set(); frame = requestAnimationFrame(tick) })
    return () => cancelAnimationFrame(frame)
  }, [progress, since, reduced])
  // The scale is 1 - 0.7p: a great throw from 0.7 (p ≈ 0.43), an excellent one from 0.45 (p ≈ 0.79), as throwQuality says.
  const great = 0.3 / 0.7, excellent = 0.55 / 0.7
  const color = progress.interpolate({ inputRange: [0, great, great + 0.001, excellent, excellent + 0.001, 1],
    outputRange: ['#ffffff', '#ffffff', colors.gold, colors.gold, colors.success, colors.success] })
  return <Animated.View pointerEvents="none" style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 3,
    borderColor: color, transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) }] }} />
}
