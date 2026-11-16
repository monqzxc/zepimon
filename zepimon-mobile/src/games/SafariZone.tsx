import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Easing, Platform, Text, View } from 'react-native'
import type { DexRecord } from '../journal'
import { setPreference, usePreferences } from '../preferences'
import { Button, Chip, Copy, Eyebrow, Heading, IconButton, Panel, colors, fonts, styles, themedStyles } from '../ui'
import { ZONES, pauseSafari, resumeSafari } from './safari'
import type { Zone } from './safari'
import { HELPERS, confirmLeave, planHunt, roam, runAway, safariMap, startZone, stayInZone, throwBall, throwBerry, throwRock, walk, zoneBudget } from './safari-zone'
import type { Direction, Point, WalkResult, WildAct, ZoneEvent, ZoneGame } from './safari-zone'
import { actTimes } from './safari-view'
import { useStepWalker } from './step-walker'
import { SafariWorld } from './SafariWorld'
import { DPad, useKeyboardDirections } from './DPad'
import { PixelSprite } from './TeamPicker'
import { useGameScreen } from './fullscreen'
import { useGameLoop, useReducedMotion } from './hooks'
import { PlayOverlay } from './PlayOverlay'
import { canSave, restoreRound, saveRound } from './safari-save'
import { loadRound, storeRound } from './safari-save-store'
import { ConfirmDialog } from '../ConfirmDialog'

const native = Platform.OS !== 'web'
const throwText = { excellent: 'Excellent throw!', great: 'Great throw!', nice: 'Nice throw.' }
const moodText = { calm: '', eating: 'Eating — calmer, but harder to catch.', angry: 'Angry — easier to catch, but quick to run.' }
// What the status line says while a throw is in the air, so the outcome isn't told before the map shows it.
const thrownText = (act: WildAct) =>
  act.thrown === 'ball' ? (act.quality ? throwText[act.quality] : 'You threw a Safari Ball!') : act.thrown === 'berry' ? 'You threw a berry.' : 'You threw a rock!'
// A playing round is saved at most this often (and at once when the app goes to the background or you leave).
const SAVE_MS = 1000
// A tap route stops at anything worth a look, and at any bump.
const STOPS: ZoneEvent[] = ['encounter', 'help', 'item', 'gate', 'out-of-steps']
type Props = {
  zone?: Zone, bonusKm: number, bonusNote: string, record: string, goal?: string, dex: Record<string, DexRecord>,
  buddy: { name: string, shiny: boolean } | null, onCatch: (name: string, shiny: boolean) => Promise<void>, onComplete: (catches: number) => void,
  // Back to the arcade or the map, from full screen (where the arcade's own back button is hidden).
  onLeave?: () => void,
  // Where the round's save lives: one per place a round starts (the arcade, or an Adventure Map stop).
  saveKey: string,
  // Told whether a round is being played, so leaving can ask first.
  onRunning?: (running: boolean) => void
}

// The Safari Zone, an open world: walk the map with the D-pad (or by tapping a tile) among the wild Pokemon roaming it,
// and walk into one to make it notice you. Then, right there on the map, throw a Safari Ball, a berry or a rock at it,
// or run and it disappears. Each throw plays out on the map (SafariWild.tsx) before the buttons come back. The rules
// live in safari-zone.ts and safari.ts; this screen only turns input into steps and actions and draws the result. In
// full screen the same hunt is drawn through PlayOverlay; the round ending leaves full screen. A round with steps and
// Safari Balls left is saved on the phone (safari-save.ts), and the start screen offers to continue it.
export function SafariZone({ zone, bonusKm, bonusNote, record, goal, dex, buddy, onCatch, onComplete, onLeave, saveKey, onRunning }: Props) {
  const [game, setGame] = useState<ZoneGame | null>(null)
  // The saved round on offer (undefined while it loads), and whether starting over is being asked about.
  const [saved, setSaved] = useState<{ raw: unknown, game: ZoneGame } | null | undefined>(undefined)
  const [startOver, setStartOver] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedAs = useRef('')
  const [move, setMove] = useState<{ kind: WalkResult['move'], id: number }>({ kind: 'none', id: 0 })
  const [miss, setMiss] = useState<{ tile: Point, id: number } | null>(null)
  const [news, setNews] = useState('')
  // The id of the encounter action being played out on the map. Walking, throwing and the results wait for it.
  const [busy, setBusy] = useState<number | null>(null)
  const busyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [area, setArea] = useState({ width: 0, height: 0 })
  const [fade] = useState(() => new Animated.Value(1))
  const reduced = useReducedMotion()
  const { safariControls, safariTrainer } = usePreferences()
  const { full, setFull, setFill } = useGameScreen()
  const current = useRef<ZoneGame | null>(null)
  const known = useRef(dex)
  const handlers = useRef({ onCatch, onComplete })
  const still = useRef(reduced)
  useEffect(() => { known.current = dex; handlers.current = { onCatch, onComplete }; still.current = reduced })
  useEffect(() => () => { if (busyTimer.current) clearTimeout(busyTimer.current) }, [])
  useEffect(() => {
    let live = true
    loadRound(saveKey).then(raw => {
      const restored = restoreRound(raw, performance.now())
      if (live) setSaved(restored ? { raw, game: restored } : null)
    })
    return () => { live = false }
  }, [saveKey])
  // Saving: right away (flush), or once SAVE_MS after the first change since the last save, whatever the round is by
  // then. Only what matters to the round counts as a change, not Pokemon strolling about.
  const flush = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
    const round = current.current
    if (canSave(round)) storeRound(saveKey, saveRound(round, Date.now()))
  }, [saveKey])
  useEffect(() => {
    if (!canSave(game)) return
    const signature = [game.steps, game.balls, game.catches.length, game.items.length, game.helps.join(), game.encounter?.id ?? '',
      game.encounter?.mood ?? '', game.at.x, game.at.y, game.status].join('|')
    if (signature === savedAs.current) return
    savedAs.current = signature
    if (!saveTimer.current) saveTimer.current = setTimeout(flush, SAVE_MS)
  }, [game, flush])
  // Leaving the screen keeps the round for later.
  useEffect(() => () => flush(), [flush])
  const settle = useCallback(() => {
    if (busyTimer.current) clearTimeout(busyTimer.current)
    busyTimer.current = null
    setBusy(null)
  }, [])

  const update = useCallback((next: ZoneGame) => {
    const previous = current.current
    if (previous === next) return
    current.current = next
    setGame(next)
    if (!previous) return
    if (next.act && next.act !== previous.act && !still.current) {
      if (busyTimer.current) clearTimeout(busyTimer.current)
      setBusy(next.act.id)
      busyTimer.current = setTimeout(settle, actTimes(next.act).done)
    }
    if (next.catches.length > previous.catches.length) {
      const { name, shiny } = next.catches[next.catches.length - 1]
      const key = (shiny ? 'Shiny ' : '') + name
      const fresh = !known.current[key] && !previous.catches.some(item => item.name === name && item.shiny === shiny)
      handlers.current.onCatch(name, shiny)
        .then(() => setNews(fresh ? `${key} joined your Dex as a ◎ Safari catch!` : `${key} is already in your Dex.`))
        .catch(() => setNews(`Could not save ${key} to your Dex. Your other catches are safe.`))
    }
    if (previous.status !== 'complete' && next.status === 'complete') {
      // A finished round has nothing left to continue.
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = null
      storeRound(saveKey, null)
      handlers.current.onComplete(next.catches.length)
    }
  }, [settle, saveKey])
  const act = (change: (game: ZoneGame, now: number) => ZoneGame) => {
    if (current.current) update(change(current.current, performance.now()))
  }
  // One step in the game; the step walker times it. A tap route stops at a bump or anything in STOPS.
  const walkOnce = (direction: Direction) => {
    const round = current.current
    if (!round) return { moved: false, stop: false }
    const result = walk(round, direction, safariMap, performance.now())
    if (result.move !== 'none') setMove(previous => ({ kind: result.move, id: previous.id + 1 }))
    update(result.game)
    return { moved: result.move !== 'none', stop: result.move === 'bump' || result.events.some(event => STOPS.includes(event)) }
  }
  const walking = game?.status === 'playing' && !game.encounter && !game.prompt && busy === null
  const walker = useStepWalker(walkOnce, walking)
  const { press, release } = walker
  const pause = () => { walker.drop(); act(pauseSafari); flush() }
  // Ten times a second the wild Pokemon get to stroll; the game only changes (and redraws) when one does.
  useGameLoop(() => act(roam), pause)
  function tapTile(tile: Point) {
    const round = current.current
    if (!round || !walking) return
    const route = planHunt(round, tile)
    if (!route) { setMiss({ tile, id: Date.now() }); return }
    walker.follow(route)
  }

  // Walking lays itself out to the screen; the start and results panels scroll like any page. A round that ended on a
  // throw shows its results once the throw has played out.
  const over = game?.status === 'complete' && busy === null
  const active = !!game && !over
  useKeyboardDirections(press, release, active, walker.drop)
  useEffect(() => {
    if (!active) return
    setFill(true)
    return () => setFill(false)
  }, [active, setFill])
  useEffect(() => { if (over) setFull(false) }, [over, setFull])
  useEffect(() => {
    onRunning?.(active)
    return () => onRunning?.(false)
  }, [active, onRunning])
  const immersive = full && active

  // Into the map: a new round, or `round` (a saved one) where it was left.
  function begin(round?: ZoneGame) {
    setNews(''); setMiss(null); settle()
    walker.drop()
    if (!reduced) {
      fade.setValue(0)
      Animated.timing(fade, { toValue: 1, duration: 300, easing: Easing.linear, useNativeDriver: native }).start()
    }
    current.current = null
    savedAs.current = ''
    setSaved(null)
    if (!round) storeRound(saveKey, null)
    update(round ?? startZone(zone ?? 'gate', bonusKm, performance.now()))
  }
  function continueRound() {
    const round = saved && restoreRound(saved.raw, performance.now())
    if (round) begin(round)
    else setSaved(null)
  }

  const budget = zoneBudget(bonusKm)
  if (!game) return <View style={{ gap: 14 }}>
    <Heading>Safari Zone</Heading>
    <Copy>Walk the Safari Zone with your buddy. Wild Pokemon roam in the open, a few at a time, and some are Shiny. Walk into one to make it notice you, then throw a Safari Ball when the ring is small, a berry (if it likes them, it calms down) or a rock (it gets angry), or run. Catches join your Dex with a ◎ Safari mark.</Copy>
    <Copy small>Three helper Pokemon wait by the places that need them: walk into Lapras by the river to ride across water, Ampharos by the cave to light it with Flash, and Flygon by the desert path for goggles against the sandstorm.</Copy>
    <Copy small>Switching tabs or leaving the app pauses the hunt. A round you leave is saved on this phone until its steps or Safari Balls run out, so you can continue it later, even after a restart.</Copy>
    {!!saved && <Panel style={{ borderColor: colors.star, borderWidth: 1.5 }}>
      <Eyebrow>ROUND IN PROGRESS</Eyebrow>
      <Text style={zoneLook.budget}>{saved.game.steps} steps · {saved.game.balls} Safari Balls · {saved.game.catches.length} caught</Text>
      <Copy small>{saved.game.area === 'gate' ? 'By the gate' : ZONES[saved.game.area].label}{saved.game.encounter ? ` · facing a wild ${saved.game.encounter.name}` : ''}</Copy>
      <Button title="Continue" onPress={continueRound} />
    </Panel>}
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
    <Button title={saved ? 'Start a new round' : 'Enter the Safari Zone'} secondary={!!saved} onPress={() => saved ? setStartOver(true) : begin()} />
    <ConfirmDialog visible={startOver} title="Start a new round?"
      body={saved ? `Your saved round, with ${saved.game.steps} steps and ${saved.game.balls} Safari Balls left, will be lost. Pokemon you caught in it stay in your Dex.` : ''}
      confirm="Start over" cancel="Keep my round" onCancel={() => setStartOver(false)} onConfirm={() => { setStartOver(false); begin() }} />
  </View>

  if (over) return <View style={{ gap: 14 }}>
    {!!game.message && <Text accessibilityLiveRegion="polite" style={zoneLook.message}>{game.message}</Text>}
    {!!news && <Copy color={colors.gold}>{news}</Copy>}
    <Panel style={{ borderColor: colors.star, borderWidth: 1.5 }}>
      <Heading>{game.catches.length ? `${game.catches.length} caught!` : 'No catches this time.'}</Heading>
      {game.catches.length > 0 && <View style={[styles.row, { gap: 4 }]}>{game.catches.map((item, index) =>
        <View key={index} accessible accessibilityLabel={(item.shiny ? 'Shiny ' : '') + item.name}><PixelSprite name={item.name} shiny={item.shiny} size={48} /></View>)}</View>}
      <Copy small>Safari catches stay on this phone and appear in your Dex with a ◎ Safari mark. They have no walking record and do not count toward missions.</Copy>
      <Button title="Hunt again" onPress={() => begin()} />
    </Panel>
  </View>

  const playing = game.status === 'playing'
  const areaName = `${game.area === 'gate' ? 'Gate' : ZONES[game.area].label}${playing ? '' : ' · Paused'}`
  const chain = game.chain.count ? `Chain: ${game.chain.name} ×${game.chain.count}` : ''
  const encounter = game.encounter
  // The Pokemon in front of you: the encounter, or one still being caught or vanishing on the map, so the buttons stay
  // (greyed out) until the throw has played out.
  const facing = encounter ?? (busy !== null && game.act ? game.act.wild : null)
  const throwing = busy !== null && game.act?.thrown ? game.act : null
  const message = game.prompt ? '' : throwing ? thrownText(throwing)
    : `${game.act?.quality && encounter && game.act.reaction === 'broke-free' ? `${throwText[game.act.quality]} ` : ''}${game.message}`
  const mood = encounter && busy === null ? moodText[encounter.mood] : ''
  const shown = busy === null ? news : ''
  const canThrow = playing && !!encounter && busy === null
  const wildName = facing ? `${facing.shiny ? 'Shiny ' : ''}${facing.name}` : ''
  const nearby = game.wilds.length ? `Nearby: ${game.wilds.map(wild => `${wild.shiny ? '✦ Shiny ' : ''}${wild.name}`).join(', ')}` : 'No Pokemon nearby yet'
  const helping = `Helpers: ${Object.values(HELPERS).map(helper => `${game.helps.includes(helper.help) ? '✓ ' : ''}${helper.name}`).join(' · ')}`
  const actions = !!facing && <View style={{ gap: 8 }}>
    <Text style={zoneLook.area}>{facing.shiny ? '✦ ' : ''}Wild {wildName}</Text>
    <Button title={`Throw Safari Ball · ${game.balls} left`} disabled={!canThrow} onPress={() => act(throwBall)} />
    <View style={styles.row}>
      <Button title="Throw berry" secondary disabled={!canThrow} onPress={() => act(throwBerry)} />
      <Button title="Throw rock" secondary disabled={!canThrow} onPress={() => act(throwRock)} />
      <Button title="Run" secondary disabled={!canThrow} onPress={() => act(runAway)} />
    </View>
  </View>
  const gate = <Panel>
    <Text accessibilityLiveRegion="polite" style={zoneLook.message}>Leave the Safari Zone?</Text>
    <View style={styles.row}>
      <Button title="Leave" onPress={() => update(confirmLeave(game))} />
      <Button title="Stay" secondary onPress={() => update(stayInZone(game))} />
    </View>
  </Panel>

  if (immersive) return <PlayOverlay
    map={(width, height, resized) => <Animated.View style={{ width, height, opacity: fade, backgroundColor: '#000000' }}>
      <SafariWorld game={game} move={move} trainer={safariTrainer} buddy={buddy} width={width} height={height} jump={resized} fitHeight
        reduced={reduced} tapToWalk={safariControls === 'tap' && walking} onTapTile={tapTile} miss={miss} playing={busy} />
    </Animated.View>}
    hud={`Steps ${game.steps} · Balls ${game.balls} · Caught ${game.catches.length} · ${areaName}`}
    status={(facing ? [`Wild ${wildName}`, message, mood, shown, chain] : [message, shown, nearby, helping, chain]).filter(Boolean).join('\n')}
    dpad={safariControls === 'dpad' && !facing ? <DPad overlay reduced={reduced} onPress={press} onRelease={release} disabled={!walking} /> : null}
    // The chips stack up from the corner, first lowest: Leave when walking, the ball (nearest the thumb) in an encounter.
    actions={facing ? [
      <Chip key="ball" label={`Ball · ${game.balls}`} selected={false} disabled={!canThrow} onPress={() => act(throwBall)} />,
      <Chip key="berry" label="Berry" selected={false} disabled={!canThrow} onPress={() => act(throwBerry)} />,
      <Chip key="rock" label="Rock" selected={false} disabled={!canThrow} onPress={() => act(throwRock)} />,
      <Chip key="run" label="Run" selected={false} disabled={!canThrow} onPress={() => act(runAway)} />,
      <Chip key="pause" label={playing ? 'Pause' : 'Resume'} selected={!playing} onPress={playing ? pause : () => act(resumeSafari)} />
    ] : [
      onLeave && <Chip key="leave" label="Leave" selected={false} onPress={() => { walker.drop(); onLeave() }} />,
      <Chip key="pause" label={playing ? 'Pause' : 'Resume'} selected={!playing} onPress={playing ? pause : () => act(resumeSafari)} />
    ]}
    prompt={game.prompt === 'gate' ? gate : undefined} />

  return <View style={{ flex: 1, gap: 10 }}>
    <View style={zoneLook.bar}>
      <View style={[styles.row, { flexWrap: 'nowrap', justifyContent: 'space-between' }]}>
        <Stat label="STEPS" value={String(game.steps)} spoken={`Steps left: ${game.steps}`} />
        <Stat label="BALLS" value={String(game.balls)} spoken={`Safari Balls: ${game.balls}`} />
        <Stat label="CAUGHT" value={String(game.catches.length)} spoken={`Caught: ${game.catches.length}`} />
        <IconButton name={playing ? 'pause' : 'resume'} label={playing ? 'Pause' : 'Resume the Safari Zone'} size={40}
          onPress={playing ? pause : () => act(resumeSafari)} />
        <IconButton name="fullscreen" label="Full screen" size={40} onPress={() => setFull(true)} />
      </View>
      <Text style={zoneLook.area}>{areaName}</Text>
      <Text accessibilityLiveRegion="polite" numberOfLines={1} style={zoneLook.nearby}>{nearby}</Text>
      <Text numberOfLines={1} style={zoneLook.nearby}>{helping}</Text>
      {!!chain && <Copy small color={colors.gold}>{chain}</Copy>}
    </View>

    <Animated.View style={[zoneLook.map, { opacity: fade }]}
      onLayout={event => { const { width, height } = event.nativeEvent.layout; setArea({ width, height }) }}>
      {/* Absolutely placed, so a map measured while there was more room never holds the area open later. */}
      {area.width > 0 && <View style={{ position: 'absolute', left: 0, top: 0 }}>
        <SafariWorld game={game} move={move} trainer={safariTrainer} buddy={buddy} width={area.width} height={area.height}
          reduced={reduced} tapToWalk={safariControls === 'tap' && walking} onTapTile={tapTile} miss={miss} playing={busy} />
      </View>}
    </Animated.View>

    {!!message && <Text accessibilityLiveRegion="polite" numberOfLines={2} style={zoneLook.message}>{message}</Text>}
    {!!mood && <Copy small color={colors.ink}>{mood}</Copy>}
    {!!shown && <Copy small color={colors.gold}>{shown}</Copy>}
    {game.prompt === 'gate' ? gate : facing ? actions : <View style={zoneLook.controls}>
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
  nearby: { color: colors.muted, fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
  map: { flex: 1, minHeight: 160, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000000' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  budget: { color: colors.ink, fontFamily: fonts.heavy, fontSize: 15, lineHeight: 20 },
  message: { color: colors.ink, fontSize: 15, lineHeight: 22, fontFamily: fonts.bold }
}))
