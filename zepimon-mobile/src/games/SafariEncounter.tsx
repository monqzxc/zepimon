import { useEffect, useState } from 'react'
import { Animated, Easing, Image, Platform, Text, View } from 'react-native'
import type { ImageSourcePropType } from 'react-native'
import { pokemonType } from '../catalog'
import { safariSprites } from '../generated/safari-assets.js'
import { moveSprites } from '../generated/move-sprites.js'
import { Button, Copy, Eyebrow, Panel, colors, fonts, styles, themedStyles, typeTints } from '../ui'
import { ringScale, runAway, throwBait, throwBall, throwQuality, throwRock } from './safari'
import type { SafariGame } from './safari'
import { PixelSprite } from './TeamPicker'
import { TICK } from './battle'

type Strip = { source: ImageSourcePropType, frames: number, width: number, height: number }
const native = Platform.OS !== 'web'
const pixelated = Platform.OS === 'web' ? { imageRendering: 'pixelated' as const } : {}
const backgrounds = safariSprites as Record<'battleGrass' | 'battlePond', Strip>
const sparkle = (moveSprites as Record<string, Strip>)['fairy-sparkle']
// Where the wild Pokemon's feet go on Emerald's battle background (240 x 112): the middle of the far platform.
const ENEMY_X = 176 / 240
const ENEMY_FEET_Y = 82 / 112
const SPARKLES = [[-0.32, -0.28], [0.34, -0.16], [-0.05, 0.3]]
const qualityColor = (quality: 'excellent' | 'great' | 'nice') => ({ excellent: colors.success, great: colors.gold, nice: colors.ink })[quality]
const qualityText = { excellent: 'Excellent!', great: 'Great!', nice: 'Nice' }

type Props = { game: SafariGame, reduced: boolean, onAction: (change: (game: SafariGame, now: number) => SafariGame) => void }

// A wild encounter in the Safari Zone: a GBA flash and wipe, then Emerald's battle background with the Pokemon on its
// platform, the shrinking ring and the four Safari actions. Shinies arrive with a sparkle.
export function SafariEncounter({ game, reduced, onAction }: Props) {
  const encounter = game.encounter!
  const [width, setWidth] = useState(0)
  const [ready, setReady] = useState(reduced)
  const playing = game.status === 'playing' && ready
  const scale = ringScale(game)
  const quality = throwQuality(scale)
  const height = width * 112 / 240
  const size = Math.round(width * 0.36)
  const feet = { x: width * ENEMY_X, y: height * ENEMY_FEET_Y }
  return <Panel style={{ backgroundColor: typeTints[pokemonType(encounter.name)] || colors.panel, alignItems: 'center' }}>
    <View style={{ alignSelf: 'stretch', height, borderRadius: 12, overflow: 'hidden' }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 && <>
        <Image source={(game.zone === 'lake' ? backgrounds.battlePond : backgrounds.battleGrass).source} fadeDuration={0} resizeMode="stretch"
          style={{ position: 'absolute', left: 0, top: 0, width, height, ...pixelated }} />
        <View style={{ position: 'absolute', left: feet.x - size / 2, top: feet.y - size }}>
          <PixelSprite name={encounter.name} shiny={encounter.shiny} size={size} />
        </View>
        <View style={{ position: 'absolute', left: feet.x - 90, top: feet.y - size / 2 - 90, width: 180, height: 180, alignItems: 'center', justifyContent: 'center' }}>
          <Ring scale={scale} next={ringScale({ ...game, elapsed: game.elapsed + TICK })} color={qualityColor(quality)} reduced={reduced} />
        </View>
        {encounter.shiny && <Sparkles centre={{ x: feet.x, y: feet.y - size / 2 }} size={size} reduced={reduced} />}
        {!reduced && <Transition width={width} height={height} onDone={() => setReady(true)} />}
      </>}
    </View>
    <Eyebrow>{encounter.shiny ? '✦ SHINY ENCOUNTER' : 'WILD ENCOUNTER'}</Eyebrow>
    <Text style={look.name}>{encounter.shiny ? 'Shiny ' : ''}{encounter.name}</Text>
    <Text style={[look.quality, { color: qualityColor(quality) }]}>Ring: {qualityText[quality]}</Text>
    {encounter.mood !== 'calm' && <Copy small color={colors.ink}>{encounter.mood === 'eating' ? 'Eating bait — calmer, but harder to catch.' : 'Angry — easier to catch, but quick to run.'}</Copy>}
    <View style={{ alignSelf: 'stretch', gap: 10 }}>
      <Button title={`Throw Safari Ball · ${game.balls} left`} disabled={!playing} onPress={() => onAction(throwBall)} />
      <View style={styles.row}>
        <Button title="Throw bait" secondary disabled={!playing} onPress={() => onAction(throwBait)} />
        <Button title="Throw rock" secondary disabled={!playing} onPress={() => onAction(throwRock)} />
        <Button title="Run" secondary disabled={!playing} onPress={() => onAction(runAway)} />
      </View>
    </View>
  </Panel>
}

// Two white flashes, then black bars close from the top and bottom and open again, as a GBA battle starts.
function Transition({ width, height, onDone }: { width: number, height: number, onDone: () => void }) {
  const [flash] = useState(() => new Animated.Value(0))
  const [bars] = useState(() => new Animated.Value(0))
  const [done, setDone] = useState(false)
  useEffect(() => {
    const fade = (value: Animated.Value, toValue: number, duration: number) =>
      Animated.timing(value, { toValue, duration, easing: Easing.linear, useNativeDriver: native })
    const run = Animated.sequence([fade(flash, 1, 75), fade(flash, 0, 75), fade(flash, 1, 75), fade(flash, 0, 75),
      fade(bars, 1, 150), fade(bars, 0, 150)])
    run.start(({ finished }) => { if (finished) { setDone(true); onDone() } })
    return () => run.stop()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (done) return null
  const half = height / 2
  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height }}>
    <Animated.View style={{ position: 'absolute', left: 0, top: 0, width, height, backgroundColor: '#ffffff', opacity: flash }} />
    <Animated.View style={{ position: 'absolute', left: 0, top: 0, width, height: half, backgroundColor: '#000000',
      transform: [{ translateY: bars.interpolate({ inputRange: [0, 1], outputRange: [-half, 0] }) }] }} />
    <Animated.View style={{ position: 'absolute', left: 0, top: half, width, height: half, backgroundColor: '#000000',
      transform: [{ translateY: bars.interpolate({ inputRange: [0, 1], outputRange: [half, 0] }) }] }} />
  </View>
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
export function Ring({ scale, next, color, reduced }: { scale: number, next: number, color: string, reduced: boolean }) {
  const [size] = useState(() => new Animated.Value(scale))
  useEffect(() => {
    if (reduced || next > scale) { size.setValue(scale); return }
    const shrink = Animated.timing(size, { toValue: next, duration: TICK, easing: Easing.linear, useNativeDriver: native })
    shrink.start()
    return () => shrink.stop()
  }, [size, scale, next, reduced])
  return <Animated.View pointerEvents="none" style={[look.ring, { borderColor: color, transform: [{ scale: size }] }]} />
}

const look = themedStyles(() => ({
  name: { color: colors.ink, fontSize: 22, lineHeight: 28, fontFamily: fonts.heavy },
  quality: { fontFamily: fonts.heavy, fontSize: 16 },
  ring: { position: 'absolute', width: 176, height: 176, borderRadius: 88, borderWidth: 4 }
}))
