import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Easing, Platform, Text, View } from 'react-native'
import type { DexRecord } from '../journal'
import { setPreference, usePreferences } from '../preferences'
import { Button, Chip, Copy, Eyebrow, Heading, IconButton, Panel, colors, fonts, styles, themedStyles } from '../ui'
import { ZONES, pauseSafari, resumeSafari, shinyOdds, tickSafari } from './safari'
import type { SafariGame, Zone } from './safari'
import { confirmLeave, planWalk, startZone, stayInZone, walk, zoneAction, zoneBudget } from './safari-zone'
import type { Direction, Point, WalkResult, ZoneEvent, ZoneGame } from './safari-zone'
import { STEP_MS, followPath, noInput, pressDirection, releaseDirection, takeInput } from './safari-view'
import type { Input } from './safari-view'
import { SafariWorld } from './SafariWorld'
import { SafariEncounter } from './SafariEncounter'
import { DPad, useKeyboardDirections } from './DPad'
import { PixelSprite } from './TeamPicker'
import { useGameScreen } from './fullscreen'
import { useGameLoop, useReducedMotion } from './hooks'

const native = Platform.OS !== 'web'
const throwText = { excellent: 'Excellent throw!', great: 'Great throw!', nice: 'Nice throw.' }
// A tap route stops at anything worth a look, and at any bump.
const STOPS: ZoneEvent[] = ['encounter', 'item', 'gate', 'out-of-steps']
type Props = {
  zone?: Zone, bonusKm: number, bonusNote: string, record: string, goal?: string, dex: Record<string, DexRecord>,
  buddy: { name: string, shiny: boolean } | null, onCatch: (name: string, shiny: boolean) => Promise<void>, onComplete: (catches: number) => void
}

// The Safari Zone: walk the map with the D-pad (or by tapping a tile), step into tall grass, and catch what appears.
// The rules live in safari-zone.ts and safari.ts; this screen only turns input into steps and draws the result.
export function SafariZone({ zone, bonusKm, bonusNote, record, goal, dex, buddy, onCatch, onComplete }: Props) {
  const [game, setGame] = useState<ZoneGame | null>(null)
  const [move, setMove] = useState<{ kind: WalkResult['move'], id: number }>({ kind: 'none', id: 0 })
  const [miss, setMiss] = useState<{ tile: Point, id: number } | null>(null)
  const [news, setNews] = useState('')
  const [area, setArea] = useState({ width: 0, height: 0 })
  const [fade] = useState(() => new Animated.Value(1))
  const reduced = useReducedMotion()
  const { safariControls, safariTrainer } = usePreferences()
  const { setFill } = useGameScreen()
  const current = useRef<ZoneGame | null>(null)
  const input = useRef<Input>(noInput)
  const lastStep = useRef(0)
  const known = useRef(dex)
  const handlers = useRef({ onCatch, onComplete })
  useEffect(() => { known.current = dex; handlers.current = { onCatch, onComplete } })

  const update = useCallback((next: ZoneGame) => {
    const previous = current.current
    if (previous === next) return
    current.current = next
    setGame(next)
    if (!previous) return
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
  const act = (change: (game: SafariGame, now: number) => SafariGame) => {
    if (current.current) update(zoneAction(current.current, round => change(round, performance.now())))
  }
  const pause = () => { input.current = noInput; act(pauseSafari) }
  useGameLoop(() => act(tickSafari), pause)

  // One step from the input queue, at most once per STEP_MS. Polling faster than that lets a fresh press move at once.
  const step = useCallback(() => {
    const round = current.current
    if (!round || performance.now() - lastStep.current < STEP_MS) return
    const taken = takeInput(input.current)
    input.current = taken.input
    if (!taken.direction) return
    const result = walk(round, taken.direction)
    if (result.move === 'bump' || result.events.some(event => STOPS.includes(event))) input.current = { ...input.current, path: [] }
    if (result.move !== 'none') {
      lastStep.current = performance.now()
      setMove(previous => ({ kind: result.move, id: previous.id + 1 }))
    }
    update(result.game)
  }, [update])
  const walking = game?.status === 'playing' && !game.encounter && !game.prompt
  // Whatever was held or planned when walking stopped (an encounter, the gate prompt, a pause) is dropped: the D-pad
  // unmounts mid-press and a key can be let go while nothing listens, so a release could otherwise be missed.
  useEffect(() => {
    if (!walking) { input.current = noInput; return }
    const timer = setInterval(step, 50)
    return () => clearInterval(timer)
  }, [walking, step])
  const press = (direction: Direction) => {
    if (!walking) return
    input.current = pressDirection(input.current, direction)
    step()
  }
  const release = (direction: Direction) => { input.current = releaseDirection(input.current, direction) }
  function tapTile(tile: Point) {
    const round = current.current
    if (!round || !walking) return
    const route = planWalk(round.at, tile)
    if (!route) { setMiss({ tile, id: Date.now() }); return }
    input.current = followPath(input.current, route)
    step()
  }

  // Walking lays itself out to the screen; the start and results panels scroll like any page.
  const active = !!game && game.status !== 'complete'
  useKeyboardDirections(press, release, active)
  useEffect(() => {
    if (!active) return
    setFill(true)
    return () => setFill(false)
  }, [active, setFill])

  function begin() {
    setNews(''); setMiss(null)
    input.current = noInput
    lastStep.current = 0
    if (!reduced) {
      fade.setValue(0)
      Animated.timing(fade, { toValue: 1, duration: 300, easing: Easing.linear, useNativeDriver: native }).start()
    }
    current.current = null
    update(startZone(zone ?? 'gate', bonusKm, performance.now()))
  }

  const budget = zoneBudget(bonusKm)
  if (!game) return <View style={{ gap: 14 }}>
    <Heading>Safari Zone</Heading>
    <Copy>Walk the Safari Zone with your buddy. Step into tall grass to find wild Pokemon, and throw when the ring is small. Catches join your Dex with a ◎ Safari mark.</Copy>
    <Copy small>Switching tabs or leaving the app pauses the hunt. Returning to the arcade ends it.</Copy>
    <Panel>
      <Copy color={colors.gold}>{record}</Copy>
      {!!goal && <Copy small color={colors.ink}>{goal}</Copy>}
      <Copy small>{bonusNote}</Copy>
      <Text style={zoneLook.budget}>{budget.steps} steps · {budget.balls} Safari Balls</Text>
    </Panel>
    <Eyebrow>YOUR TRAINER</Eyebrow>
    <View style={styles.row}>
      <Chip label="Brendan" selected={safariTrainer === 'brendan'} onPress={() => setPreference('safariTrainer', 'brendan')} />
      <Chip label="May" selected={safariTrainer === 'may'} onPress={() => setPreference('safariTrainer', 'may')} />
    </View>
    <Button title="Enter the Safari Zone" onPress={begin} />
  </View>

  if (game.status === 'complete') return <View style={{ gap: 14 }}>
    {!!game.message && <Text accessibilityLiveRegion="polite" style={zoneLook.message}>{game.message}</Text>}
    {!!news && <Copy color={colors.gold}>{news}</Copy>}
    <Panel style={{ borderColor: colors.star, borderWidth: 1.5 }}>
      <Heading>{game.catches.length ? `${game.catches.length} caught!` : 'No catches this time.'}</Heading>
      {game.catches.length > 0 && <View style={[styles.row, { gap: 4 }]}>{game.catches.map((item, index) =>
        <View key={index} accessible accessibilityLabel={(item.shiny ? 'Shiny ' : '') + item.name}><PixelSprite name={item.name} shiny={item.shiny} size={48} /></View>)}</View>}
      <Copy small>Safari catches stay on this phone and appear in your Dex with a ◎ Safari mark. They have no walking record and do not count toward missions.</Copy>
      <Button title="Hunt again" onPress={begin} />
    </Panel>
  </View>

  const playing = game.status === 'playing'
  const chainOdds = game.chain.count ? shinyOdds(game, game.chain.name) : 0
  return <View style={{ flex: 1, gap: 10 }}>
    <View style={zoneLook.bar}>
      <View style={[styles.row, { flexWrap: 'nowrap', justifyContent: 'space-between' }]}>
        <Stat label="STEPS" value={String(game.steps)} spoken={`Steps left: ${game.steps}`} />
        <Stat label="BALLS" value={String(game.balls)} spoken={`Safari Balls: ${game.balls}`} />
        <Stat label="CAUGHT" value={String(game.catches.length)} spoken={`Caught: ${game.catches.length}`} />
        <IconButton name={playing ? 'pause' : 'resume'} label={playing ? 'Pause' : 'Resume the Safari Zone'} size={40}
          onPress={playing ? pause : () => act(resumeSafari)} />
      </View>
      <Text style={zoneLook.area}>{game.area === 'gate' ? 'Gate' : ZONES[game.area].label}{playing ? '' : ' · Paused'}</Text>
      {!!chainOdds && <Copy small color={colors.gold}>Chain: {game.chain.name} ×{game.chain.count} · Shiny chance 1 in {chainOdds}</Copy>}
    </View>

    {game.encounter ? <SafariEncounter game={game} reduced={reduced} onAction={act} /> : <>
      <Animated.View style={[zoneLook.map, { opacity: fade }]}
        onLayout={event => { const { width, height } = event.nativeEvent.layout; setArea({ width, height }) }}>
        {/* Absolutely placed, so a map measured while there was more room never holds the area open later. */}
        {area.width > 0 && <View style={{ position: 'absolute', left: 0, top: 0 }}>
          <SafariWorld game={game} move={move} trainer={safariTrainer} buddy={buddy} width={area.width} height={area.height}
            reduced={reduced} tapToWalk={safariControls === 'tap' && walking} onTapTile={tapTile} miss={miss} />
        </View>}
      </Animated.View>
    </>}

    {!!game.message && !game.prompt && <Text accessibilityLiveRegion="polite" numberOfLines={2} style={zoneLook.message}>
      {game.lastThrow && game.encounter ? `${throwText[game.lastThrow]} ` : ''}{game.message}</Text>}
    {!!news && <Copy small color={colors.gold}>{news}</Copy>}
    {game.prompt === 'gate' ? <Panel>
      <Text accessibilityLiveRegion="polite" style={zoneLook.message}>Leave the Safari Zone?</Text>
      <View style={styles.row}>
        <Button title="Leave" onPress={() => update(confirmLeave(game))} />
        <Button title="Stay" secondary onPress={() => update(stayInZone(game))} />
      </View>
    </Panel> : !game.encounter && <View style={zoneLook.controls}>
      {safariControls === 'dpad' ? <DPad onPress={press} onRelease={release} disabled={!walking} />
        : <Copy small>Tap a spot on the map to walk there.</Copy>}
      <View style={{ gap: 8 }}>
        <Chip label="D-pad" selected={safariControls === 'dpad'} onPress={() => setPreference('safariControls', 'dpad')} />
        <Chip label="Tap to walk" selected={safariControls === 'tap'} onPress={() => setPreference('safariControls', 'tap')} />
      </View>
    </View>}
  </View>
}

function Stat({ label, value, spoken }: { label: string, value: string, spoken: string }) {
  return <View accessible accessibilityLabel={spoken}><Eyebrow>{label}</Eyebrow><Text style={styles.stat}>{value}</Text></View>
}

const zoneLook = themedStyles(() => ({
  bar: { gap: 4 },
  area: { color: colors.ink, fontFamily: fonts.heavy, fontSize: 15, lineHeight: 20 },
  map: { flex: 1, minHeight: 160, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000000' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  budget: { color: colors.ink, fontFamily: fonts.heavy, fontSize: 15, lineHeight: 20 },
  message: { color: colors.ink, fontSize: 15, lineHeight: 22, fontFamily: fonts.bold }
}))
