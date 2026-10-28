import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Animated, Easing, Platform, Pressable, Text, View } from 'react-native'
import { pokemonType } from '../catalog'
import type { DexRecord } from '../journal'
import { Button, Copy, Eyebrow, Heading, Panel, colors, fonts, styles, themedStyles, typeTints } from '../ui'
import { PATCHES, SAFARI_DURATION, ZONES, approachPatch, pauseSafari, readySafari, resumeSafari, ringScale, runAway, shinyOdds,
  startSafari, throwBait, throwBall, throwQuality, throwRock, tickSafari } from './safari'
import type { SafariGame, Zone } from './safari'
import { PixelSprite } from './TeamPicker'
import { useGameLoop, useReducedMotion } from './hooks'
import { TICK } from './battle'

const native = Platform.OS !== 'web'
const qualityColor = (quality: 'excellent' | 'great' | 'nice') => ({ excellent: colors.success, great: colors.gold, nice: colors.ink })[quality]
const qualityText = { excellent: 'Excellent!', great: 'Great!', nice: 'Nice' }
const throwText = { excellent: 'Excellent throw!', great: 'Great throw!', nice: 'Nice throw.' }
type Props = {
  zone?: Zone, bonusBalls: number, bonusNote: string, record: string, goal?: string, dex: Record<string, DexRecord>,
  onCatch: (name: string, shiny: boolean) => Promise<void>, onComplete: (catches: number) => void
}

export function SafariHunt({ zone: fixedZone, bonusBalls, bonusNote, record, goal, dex, onCatch, onComplete }: Props) {
  const [zone, setZone] = useState<Zone>(fixedZone ?? 'meadow')
  const [game, setGame] = useState(() => readySafari(zone, bonusBalls))
  const [news, setNews] = useState('')
  const reduced = useReducedMotion()
  const current = useRef(game)
  const known = useRef(dex)
  const handlers = useRef({ onCatch, onComplete })
  useEffect(() => { known.current = dex; handlers.current = { onCatch, onComplete } })
  const update = useCallback((next: SafariGame) => {
    const previous = current.current
    if (previous === next) return
    current.current = next
    setGame(next)
    if (next.catches.length > previous.catches.length) {
      const { name, shiny } = next.catches[next.catches.length - 1]
      const key = (shiny ? 'Shiny ' : '') + name
      const fresh = !known.current[key] && !previous.catches.some(item => item.name === name && item.shiny === shiny)
      handlers.current.onCatch(name, shiny)
        .then(() => setNews(fresh ? `${key} joined your Dex as a ◎ Safari catch!` : `${key} is already in your Dex.`))
        .catch(() => setNews(`Could not save ${key} to your Dex. Your other catches are safe.`))
    }
    if (previous.status !== 'complete' && next.status === 'complete') handlers.current.onComplete(next.catches.length)
  }, [])
  const act = (change: (game: SafariGame, now: number) => SafariGame) => update(change(current.current, performance.now()))
  const pause = () => act(pauseSafari)
  useGameLoop(() => act(tickSafari), pause)

  function start(where = zone) { setNews(''); update(startSafari(where, bonusBalls, performance.now())) }

  const { encounter } = game
  const playing = game.status === 'playing'
  const scale = ringScale(game)
  const quality = throwQuality(scale)
  const chainOdds = game.chain.count ? shinyOdds(game, game.chain.name) : 0
  return <View style={{ gap: 14 }}>
    <Heading>Safari Hunt</Heading>
    <Copy>Tap rustling grass to find a wild Pokemon. Throw when the ring is small for a better chance. Catches join your Dex with a ◎ Safari mark.</Copy>
    <Panel>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Stat label="BALLS" value={String(game.balls)} />
        <Stat label="TIME" value={`${Math.ceil((SAFARI_DURATION - game.elapsed) / 1000)}s`} />
        <Stat label="CAUGHT" value={String(game.catches.length)} />
      </View>
      <Copy small>{ZONES[game.zone].label} · {ZONES[game.zone].blurb}</Copy>
      {!!chainOdds && <Copy small color={colors.gold}>Chain: {game.chain.name} ×{game.chain.count} · Shiny chance 1 in {chainOdds}</Copy>}
    </Panel>

    {game.status === 'ready' && <>
      <Panel>
        <Copy color={colors.gold}>{record}</Copy>
        {!!goal && <Copy small color={colors.ink}>{goal}</Copy>}
        <Copy small>{bonusNote}</Copy>
      </Panel>
      {!fixedZone && <View style={{ gap: 8 }}>
        <Eyebrow>CHOOSE A ZONE</Eyebrow>
        {(Object.keys(ZONES) as Zone[]).map(id => <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: zone === id }}
          accessibilityLabel={`${ZONES[id].label}: ${ZONES[id].blurb}`} onPress={() => { setZone(id); update(readySafari(id, bonusBalls)) }}
          style={({ pressed }) => [hunt.zone, { backgroundColor: typeTints[ZONES[id].habitat] }, zone === id && hunt.zoneOn, pressed && { opacity: 0.7 }]}>
          <Text style={hunt.zoneTitle}>{zone === id ? '● ' : '○ '}{ZONES[id].label}</Text>
          <Text style={hunt.zoneText}>{ZONES[id].blurb}</Text>
        </Pressable>)}
      </View>}
      <Button title={`Enter the ${ZONES[zone].label}`} onPress={() => start()} />
    </>}

    {(playing || game.status === 'paused') && !encounter && <View style={hunt.field}>
      {Array.from({ length: PATCHES }, (_, patch) => {
        const rustling = playing && game.rustle === patch
        return <Pressable key={patch} accessibilityRole="button" accessibilityLabel={`Grass patch ${patch + 1}${rustling ? ', rustling' : ''}`}
          disabled={!playing} onPress={() => act((round, now) => approachPatch(round, patch, now))}
          style={({ pressed }) => [hunt.patch, rustling && hunt.rustling, pressed && { opacity: 0.7 }]}>
          <Shake active={rustling && !reduced}><Grass bright={rustling} /></Shake>
          {rustling && <Text accessible={false} style={hunt.alert}>!</Text>}
        </Pressable>
      })}
    </View>}

    {encounter && <Panel style={{ backgroundColor: typeTints[pokemonType(encounter.name)] || colors.panel, alignItems: 'center' }}>
      <Eyebrow>{encounter.shiny ? '✦ SHINY ENCOUNTER' : 'WILD ENCOUNTER'}</Eyebrow>
      <Text style={hunt.name}>{encounter.shiny ? 'Shiny ' : ''}{encounter.name}</Text>
      <View style={hunt.stage}>
        <PixelSprite name={encounter.name} shiny={encounter.shiny} size={132} />
        <Ring scale={scale} next={ringScale({ ...game, elapsed: game.elapsed + TICK })} color={qualityColor(quality)} reduced={reduced} />
      </View>
      <Text style={[hunt.quality, { color: qualityColor(quality) }]}>Ring: {qualityText[quality]}</Text>
      {encounter.mood !== 'calm' && <Copy small color={colors.ink}>{encounter.mood === 'eating' ? 'Eating bait — calmer, but harder to catch.' : 'Angry — easier to catch, but quick to run.'}</Copy>}
      <View style={{ alignSelf: 'stretch', gap: 10 }}>
        <Button title={`Throw Safari Ball · ${game.balls} left`} disabled={!playing} onPress={() => act(throwBall)} />
        <View style={styles.row}>
          <Button title="Throw bait" secondary disabled={!playing} onPress={() => act(throwBait)} />
          <Button title="Throw rock" secondary disabled={!playing} onPress={() => act(throwRock)} />
          <Button title="Run" secondary disabled={!playing} onPress={() => act(runAway)} />
        </View>
      </View>
    </Panel>}

    {!!game.message && game.status !== 'ready' && <Text accessibilityLiveRegion="polite" style={hunt.message}>
      {game.lastThrow && game.status !== 'complete' ? `${throwText[game.lastThrow]} ` : ''}{game.message}</Text>}
    {!!news && <Copy color={colors.gold}>{news}</Copy>}
    {playing && <Button title="Pause" secondary onPress={pause} />}
    {game.status === 'paused' && <Button title="Resume Safari Hunt" onPress={() => act(resumeSafari)} />}

    {game.status === 'complete' && <Panel style={{ borderColor: colors.star, borderWidth: 1.5 }}>
      <Heading>{game.catches.length ? `${game.catches.length} caught!` : 'No catches this time.'}</Heading>
      {game.catches.length > 0 && <View style={[styles.row, { gap: 4 }]}>{game.catches.map((item, index) =>
        <View key={index} accessible accessibilityLabel={(item.shiny ? 'Shiny ' : '') + item.name}><PixelSprite name={item.name} shiny={item.shiny} size={48} /></View>)}</View>}
      <Copy small>Safari catches stay on this phone and appear in your Dex with a ◎ Safari mark. They have no walking record and do not count toward missions.</Copy>
      <Button title="Hunt again" onPress={() => start(game.zone)} />
      {!fixedZone && <Button title="Choose another zone" secondary onPress={() => update(readySafari(game.zone, bonusBalls))} />}
    </Panel>}
    <Copy small>Switching tabs or leaving the app pauses the hunt. Returning to the arcade ends it.</Copy>
  </View>
}

function Stat({ label, value }: { label: string, value: string }) {
  return <View><Eyebrow>{label}</Eyebrow><Text style={styles.stat}>{value}</Text></View>
}

// Follows the game clock one step ahead so the ring you see matches the throw you get.
function Ring({ scale, next, color, reduced }: { scale: number, next: number, color: string, reduced: boolean }) {
  const [size] = useState(() => new Animated.Value(scale))
  useEffect(() => {
    if (reduced || next > scale) { size.setValue(scale); return }
    const shrink = Animated.timing(size, { toValue: next, duration: TICK, easing: Easing.linear, useNativeDriver: native })
    shrink.start()
    return () => shrink.stop()
  }, [size, scale, next, reduced])
  return <Animated.View pointerEvents="none" style={[hunt.ring, { borderColor: color, transform: [{ scale: size }] }]} />
}

function Shake({ active, children }: { active: boolean, children: ReactNode }) {
  const [angle] = useState(() => new Animated.Value(0))
  useEffect(() => {
    angle.setValue(0)
    if (!active) return
    const step = (toValue: number, duration: number) => Animated.timing(angle, { toValue, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: native })
    const loop = Animated.loop(Animated.sequence([step(1, 90), step(-1, 180), step(0, 90), Animated.delay(240)]))
    loop.start()
    return () => loop.stop()
  }, [active, angle])
  const rotate = angle.interpolate({ inputRange: [-1, 1], outputRange: ['-8deg', '8deg'] })
  return <Animated.View style={{ transform: [{ rotate }] }}>{children}</Animated.View>
}

function Grass({ bright }: { bright: boolean }) {
  const blade = bright ? '#4FB34C' : '#3E8E4A'
  const dark = bright ? '#2F8F3A' : '#2D6E3A'
  return <View accessible={false} style={{ width: 44, height: 34, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3 }}>
    {[[16, dark], [28, blade], [22, dark], [32, blade], [18, dark]].map(([height, color], index) =>
      <View key={index} style={{ width: 6, height: height as number, backgroundColor: color as string, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />)}
  </View>
}

const hunt = themedStyles(() => ({
  field: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8, padding: 10, borderRadius: 20, backgroundColor: '#8FD18A', borderWidth: 1.5, borderColor: '#73BE6D' },
  patch: { width: '31%', aspectRatio: 1.15, minHeight: 64, maxHeight: 110, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#78C171', borderRadius: 14, backgroundColor: '#B4E3AD' },
  rustling: { borderColor: colors.star, borderWidth: 2.5, backgroundColor: '#D7F2D1' },
  alert: { position: 'absolute', top: 4, right: 8, color: colors.gold, fontSize: 20, fontFamily: fonts.black },
  zone: { minHeight: 56, padding: 14, borderWidth: 1.5, borderColor: colors.line, borderRadius: 16, gap: 2 },
  zoneOn: { borderColor: colors.edge, borderWidth: 2.5 },
  zoneTitle: { color: colors.ink, fontFamily: fonts.heavy, fontSize: 15, lineHeight: 20 },
  zoneText: { color: colors.ink, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  name: { color: colors.ink, fontSize: 22, lineHeight: 28, fontFamily: fonts.heavy },
  stage: { width: 180, height: 180, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 176, height: 176, borderRadius: 88, borderWidth: 4 },
  quality: { fontFamily: fonts.heavy, fontSize: 16 },
  message: { color: colors.ink, fontSize: 15, lineHeight: 22, fontFamily: fonts.bold }
}))
