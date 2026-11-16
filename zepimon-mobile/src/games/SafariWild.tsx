import { memo, useEffect, useMemo, useState } from 'react'
import { Animated, Easing, Image, Platform, Text, View } from 'react-native'
import type { ImageSourcePropType } from 'react-native'
import { safariSprites } from '../generated/safari-assets.js'
import { moveSprites } from '../generated/move-sprites.js'
import { colors } from '../ui'
import { ringScale, throwQuality } from './safari'
import type { Encounter, SafariAct, SafariGame } from './safari'
import type { Direction, Point } from './safari-zone'
import { ABSORB_MS, BREAK_MS, VANISH_MS, WOBBLES, WOBBLE_MS, actTimes } from './safari-view'
import type { ActTimes } from './safari-view'
import { OverworldSprite } from './OverworldSprite'
import { Frame } from './TileWorld'
import { TICK } from './battle'

type Strip = { source: ImageSourcePropType, frames: number, width: number, height: number }
const native = Platform.OS !== 'web'
const pixelated = Platform.OS === 'web' ? { imageRendering: 'pixelated' as const } : {}
const sprites = safariSprites as Record<'grass' | 'safariBall', Strip>
const sparkle = (moveSprites as Record<string, Strip>)['fairy-sparkle']
const SPARKLES = [[-0.32, -0.28], [0.34, -0.16], [-0.05, 0.3]]
const APPEAR_MS = 500
const qualityColor = (quality: 'excellent' | 'great' | 'nice') => ({ excellent: colors.success, great: colors.gold, nice: '#ffffff' })[quality]

// A wild Pokemon met on the map, with what is needed to draw it: the act being played out (if any) and the clocks that
// drive it. clock runs from 0 to the act's `done` while it plays, and rests at `done` otherwise; pop runs 0 to 1 as the
// Pokemon springs out of the grass.
export type WildScene = { wild: Encounter & { at: Point }, act: SafariAct | null, times: ActTimes | null, live: boolean,
  clock: Animated.Value, pop: Animated.Value, key: string }

// The wild Pokemon on the map is the current encounter, or the one that just left (so it can be seen vanishing).
// playing: the id of the act the screen is playing out, or null.
export function useWildScene(game: SafariGame, playing: number | null, reduced: boolean): WildScene | null {
  const act = game.act
  const wild = game.encounter ?? (act?.left ? act.wild : null)
  const [clock] = useState(() => new Animated.Value(0))
  const [pop] = useState(() => new Animated.Value(1))
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
  const fresh = game.encounter ? `${game.encounter.since}:${game.encounter.name}` : null
  useEffect(() => {
    if (!fresh) return
    if (reduced) { pop.setValue(1); return }
    pop.setValue(0)
    const run = Animated.timing(pop, { toValue: 1, duration: APPEAR_MS, easing: Easing.linear, useNativeDriver: native })
    run.start()
    return () => run.stop()
  }, [pop, fresh, reduced])
  if (!wild?.at) return null
  return { wild: wild as Encounter & { at: Point }, act, times, live, clock, pop, key: `${wild.since}:${wild.name}` }
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

function towards(from: Point, to: Point): Direction {
  const dx = to.x - from.x, dy = to.y - from.y
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'south' : 'north')
}

// The wild Pokemon standing on its tile, facing the trainer, in the map layer under the trainer. It springs up out of
// the grass, hops when it likes a berry, shakes when it dislikes one, is angry or breaks free, shrinks into a ball,
// runs off when it flees and fades away when you walk off.
export const WildPokemon = memo(function WildPokemon({ scene, trainerAt, tile, onGrass }: { scene: WildScene, trainerAt: Point, tile: number, onGrass: boolean }) {
  const { wild, act, times, clock, pop } = scene
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
        // A Pokemon that flees bounds away from the trainer; one you walk away from just fades.
        if (act.left === 'fled') {
          const away = { x: Math.sign(wild.at.x - trainerAt.x), y: Math.sign(wild.at.y - trainerAt.y) }
          x.push([leave, 0], [leave + VANISH_MS, away.x * tile * 0.8])
          y.push([leave, 0], [leave + VANISH_MS / 2, -tile * 0.3 + away.y * tile * 0.4], [leave + VANISH_MS, away.y * tile * 0.8])
        }
      }
    }
    return {
      x: track(clock, x),
      y: Animated.add(pop.interpolate({ inputRange: [0, 0.6, 1], outputRange: [tile * 0.5, 0, 0] }), track(clock, y)),
      opacity: Animated.multiply(pop.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] }), track(clock, seen.length ? seen : [[0, 1]])),
      scale: track(clock, size.length ? size : [[0, 1]])
    }
  }, [act, times, clock, pop, tile, wild.at, trainerAt])
  return <>
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: wild.at.x * tile, top: wild.at.y * tile, width: tile, height: tile,
      opacity: motion.opacity, transform: [{ translateX: motion.x }, { translateY: motion.y }, { scale: motion.scale }] }}>
      <OverworldSprite name={wild.name} shiny={wild.shiny} size={tile} facing={towards(wild.at, trainerAt)} />
    </Animated.View>
    {/* Tall grass over its feet, as over the trainer's (less of it: a Pokemon is one tile tall, not two). */}
    {onGrass && <View pointerEvents="none" style={{ position: 'absolute', left: wild.at.x * tile, top: wild.at.y * tile + tile * 0.7, width: tile, height: tile * 0.3, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', top: -tile * 0.7 }}><Frame strip={sprites.grass} frame={0} width={tile} height={tile} /></View>
    </View>}
  </>
})

// Everything over the map for an encounter: a "!" over the trainer as it appears, a Shiny's sparkle, the shrinking ring
// while you aim, and the thrown ball, berry or rock with the Pokemon's reaction bubble while an act plays out.
export function WildCover({ scene, game, trainerAt, tile, reduced }: { scene: WildScene, game: SafariGame, trainerAt: Point, tile: number, reduced: boolean }) {
  const { wild, pop, live, key } = scene
  const centre = { x: (wild.at.x + 0.5) * tile, y: (wild.at.y + 0.5) * tile }
  const ring = tile * 2.4
  const scale = ringScale(game)
  return <>
    {!!game.encounter && <Animated.View pointerEvents="none" style={{ position: 'absolute', left: (trainerAt.x + 0.5) * tile - tile * 0.35, top: (trainerAt.y - 1.55) * tile,
      opacity: pop.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }) }}>
      <Bubble mark="!" color="#d83a3a" size={tile * 0.7} />
    </Animated.View>}
    {!!game.encounter && wild.shiny && <Sparkles key={key} centre={centre} size={tile * 1.4} reduced={reduced} />}
    {!!game.encounter && !live && <View pointerEvents="none" style={{ position: 'absolute', left: centre.x - ring / 2, top: centre.y - ring / 2, width: ring, height: ring,
      alignItems: 'center', justifyContent: 'center' }}>
      <Ring scale={scale} next={ringScale({ ...game, elapsed: game.elapsed + TICK })} color={qualityColor(throwQuality(scale))} size={ring} reduced={reduced} />
    </View>}
    {live && scene.act && scene.times && <ThrowEffects act={scene.act} times={scene.times} clock={scene.clock} from={trainerAt} to={wild.at} tile={tile} />}
  </>
}

const ThrowEffects = memo(function ThrowEffects({ act, times, clock, from, to, tile }: {
  act: SafariAct, times: ActTimes, clock: Animated.Value, from: Point, to: Point, tile: number
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
    {bubble && shown && <Animated.View pointerEvents="none" style={{ position: 'absolute', left: (to.x + 0.5) * tile - tile * 0.35, top: (to.y - 0.75) * tile, opacity: shown }}>
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

// Emerald's sparkle around a Shiny as it appears: three times through the strip, or one still frame with reduced motion.
export function Sparkles({ centre, size, reduced }: { centre: { x: number, y: number }, size: number, reduced: boolean }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (reduced) return
    const timer = setInterval(() => setTick(current => current + 1), 100)
    return () => clearInterval(timer)
  }, [reduced])
  if (!reduced && tick >= sparkle.frames * 3) return null
  const frame = reduced ? 1 : tick % sparkle.frames
  const side = size * 0.32
  return <>{SPARKLES.map(([dx, dy], i) => <View key={i} pointerEvents="none"
    style={{ position: 'absolute', left: centre.x + dx * size - side / 2, top: centre.y + dy * size - side / 2, width: side, height: side, overflow: 'hidden' }}>
    <Image source={sparkle.source} fadeDuration={0} resizeMode="stretch"
      style={{ position: 'absolute', top: 0, left: -frame * side, width: side * sparkle.frames, height: side, ...pixelated }} />
  </View>)}</>
}

// Follows the game clock one step ahead so the ring you see matches the throw you get.
export function Ring({ scale, next, color, size, reduced }: { scale: number, next: number, color: string, size: number, reduced: boolean }) {
  const [value] = useState(() => new Animated.Value(scale))
  useEffect(() => {
    if (reduced || next > scale) { value.setValue(scale); return }
    const shrink = Animated.timing(value, { toValue: next, duration: TICK, easing: Easing.linear, useNativeDriver: native })
    shrink.start()
    return () => shrink.stop()
  }, [value, scale, next, reduced])
  return <Animated.View pointerEvents="none" style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 3,
    borderColor: color, transform: [{ scale: value }] }} />
}
