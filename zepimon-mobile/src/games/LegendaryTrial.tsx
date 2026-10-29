import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Platform, Text, View } from 'react-native'
import { pokemonType } from '../catalog'
import { setPreference, usePreferences } from '../preferences'
import { Button, Chip, Copy, Eyebrow, Heading, Panel, colors, fonts, styles, themedStyles, typeTints } from '../ui'
import { trialStages } from '../generated/trial-maps.js'
import { hintTier, planRoomWalk, resetAlignment, stepRoom } from './trial'
import { KIND_NAMES, nextRoom, restartRoom, restartRun, startRun, trialFor } from './trials'
import type { TrialRun } from './trials'
import type { Direction, Point } from './safari-zone'
import { useStepWalker } from './step-walker'
import { DPad, useKeyboardDirections } from './DPad'
import { useGameLoop } from './hooks'
import { StarReveal, TrialMap, TrialWorld } from './TrialWorld'
import type { TrialMove, TrialStage } from './TrialWorld'

const stages = trialStages as Record<string, TrialStage>
const native = Platform.OS !== 'web'
const relicCount = (stage: TrialStage) => stage.tiles.join('').split('*').length - 1
// play: walking. fall: dropping through a hole. fade: between rooms. finish: the last exit opened. reveal: the Shattered Star wakes.
type Phase = 'play' | 'fall' | 'fade' | 'finish' | 'reveal'
// A run saved mid-fall starts its room again; one saved between rooms goes on to the next room. (A cleared last room finishes on mount.)
const resume = (run: TrialRun) => run.room.status === 'fell' ? restartRoom(run)
  : run.room.status === 'cleared' && run.index < run.stages.length - 1 ? nextRoom(run) : run

// The Legendary's trial: one to two rooms walked like the Safari Zone (D-pad, arrow keys / WASD or tap to walk), then the
// chamber. The rules live in trial.ts and the room order in trials.ts; this screen turns input into steps, times the falls,
// fades and finish, and saves a checkpoint when a room is cleared, when the game pauses and when the player leaves.
export function LegendaryTrial({ name, number, partner, reduced, busy, error = '', trial, checkpoint, onCheckpoint, onSolved, onLeave }: {
  name: string, number: number, partner: { name: string, shiny: boolean }, reduced: boolean, busy: boolean, error?: string,
  trial: ReturnType<typeof trialFor>, checkpoint: TrialRun | undefined, onCheckpoint: (run: TrialRun) => Promise<void>,
  onSolved: (results: Record<string, number>) => void, onLeave: (run: TrialRun) => void
}) {
  const [run, setRun] = useState(() => checkpoint ? resume(checkpoint) : startRun(trial.stages))
  const [move, setMove] = useState<TrialMove>({ kind: 'none', id: 0 })
  const [jump, setJump] = useState(0)
  const [phase, setPhase] = useState<Phase>('play')
  const [status, setStatus] = useState(() => run.room.message || stages[run.stages[run.index]].hint)
  const [showHint, setShowHint] = useState(false)
  const [width, setWidth] = useState(0)
  const [fade] = useState(() => new Animated.Value(1))
  const { safariControls, safariTrainer } = usePreferences()
  const current = useRef(run)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const handlers = useRef({ onCheckpoint, onSolved })
  const dropInput = useRef(() => {})
  useEffect(() => { handlers.current = { onCheckpoint, onSolved } })
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const later = (ms: number, then: () => void) => { timers.current.push(setTimeout(then, ms)) }
  const stage = stages[run.stages[run.index]]
  const star = stage.star
  const room = run.room

  const update = (next: TrialRun) => { current.current = next; setRun(next) }
  const save = (saved: TrialRun) => { handlers.current.onCheckpoint(saved).catch(() => {}) }
  // A fresh room (or the same one again): the camera snaps and the status line goes back to the room's hint.
  const enter = (next: TrialRun) => {
    update(next)
    setJump(value => value + 1)
    setStatus(stages[next.stages[next.index]].hint)
    setShowHint(false)
    setPhase('play')
  }

  function cleared(done: TrialRun) {
    const last = done.index >= done.stages.length - 1
    if (last) {
      setPhase(stages[done.stages[done.index]].star ? 'reveal' : 'finish')
      if (!stages[done.stages[done.index]].star) later(700, () => handlers.current.onSolved(nextRoom(done).results))
      return
    }
    setPhase('fade')
    if (!reduced) Animated.timing(fade, { toValue: 0, duration: 300, easing: Easing.linear, useNativeDriver: native }).start()
    later(300, () => {
      const next = nextRoom(done)
      enter(next)
      save(next)
      if (!reduced) Animated.timing(fade, { toValue: 1, duration: 300, easing: Easing.linear, useNativeDriver: native }).start()
    })
  }

  // One step; the step walker times it. A tap route stops at a bump or anything that happens.
  const walkOnce = (direction: Direction) => {
    const before = current.current
    const result = stepRoom(before.room, stages[before.stages[before.index]], direction)
    if (result.move === 'none') return { moved: false, stop: false }
    setMove(previous => ({ kind: result.move === 'bump' ? 'bump' : 'step', id: previous.id + 1, warp: result.move === 'warp' }))
    // Arriving on a pad stops you there: a held key or button is let go, as a tap route stops on the warp event.
    if (result.move === 'warp') { setJump(value => value + 1); dropInput.current() }
    const next = { ...before, room: result.room }
    update(next)
    if (result.room.message) setStatus(result.room.message)
    if (result.room.status === 'fell') {
      setPhase('fall')
      later(600, () => { update(restartRoom(current.current)); setJump(value => value + 1); setPhase('play') })
    } else if (result.room.status === 'cleared') cleared(next)
    return { moved: result.move !== 'bump', stop: result.move === 'bump' || result.events.length > 0 }
  }
  useEffect(() => { if (current.current.room.status === 'cleared') cleared(current.current) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const walking = phase === 'play' && !busy && room.status === 'playing'
  const walker = useStepWalker(walkOnce, walking)
  const { press, release } = walker
  useEffect(() => { dropInput.current = walker.drop })
  const settled = phase === 'play' || phase === 'fall' || phase === 'fade'
  useGameLoop(() => {}, () => { walker.drop(); if (settled) save(current.current) }, 1000)
  useKeyboardDirections(press, release, walking, walker.drop)

  function tapTile(tile: Point) {
    if (!walking) return
    if (stage.dark && !room.seen.includes(`${tile.x},${tile.y}`)) { setStatus('You haven’t seen that spot yet.'); return }
    const route = planRoomWalk(room, stage, tile)
    if (!route) { setStatus('There’s no way there from here yet.'); return }
    walker.follow(route)
  }

  const type = pokemonType(name)
  const relics = relicCount(stage)
  const height = Math.min(width, 360)
  const tier = hintTier(room)
  const hud = star ? `Moves ${room.moves} · Attempts ${room.attunes}`
    : [run.stages.length > 1 ? `Room ${run.index + 1}/${run.stages.length}` : '', `Moves ${room.moves} (par ${stage.par})`, relics ? `Relics ${room.relics.length}/${relics}` : '']
      .filter(Boolean).join(' · ')
  const where = `${KIND_NAMES[stage.kind]} room. You are at row ${room.at.y + 1}, column ${room.at.x + 1}. ${room.moves} moves.`
  const controls = !busy && phase === 'play'
  return <Panel style={{ backgroundColor: typeTints[type] || colors.panel }}>
    <Eyebrow>EXPEDITION {number} · {name.toUpperCase()} · TRIAL</Eyebrow>
    <Heading>{trial.title}</Heading>
    <Copy color={colors.ink}>{trial.lore}</Copy>
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ alignSelf: 'stretch' }}>
      {width > 0 && <Animated.View accessible={safariControls !== 'tap'} accessibilityRole="image" accessibilityLabel={where}
        style={[look.world, { width, height, opacity: fade }]}>
        <TrialWorld run={run} stage={stage} move={move} jump={jump} trainer={safariTrainer} buddy={partner} width={width} height={height}
          reduced={reduced} tapToWalk={safariControls === 'tap' && walking} onTapTile={tapTile} falling={phase === 'fall'} revealing={phase === 'reveal'} />
        {phase === 'reveal' && <StarReveal stage={stage} at={room.at} width={width} height={height} reduced={reduced}
          onDone={() => handlers.current.onSolved(nextRoom(current.current).results)} />}
      </Animated.View>}
    </View>
    <Text accessibilityLiveRegion="polite" style={[look.status, phase === 'finish' || phase === 'reveal' ? { color: colors.success } : null]}>
      {phase === 'finish' ? 'Trial cleared! The shrine opens… a presence stirs beyond the gate.' : status}</Text>
    {!!error && <Text accessibilityLiveRegion="assertive" style={[look.status, { color: colors.danger }]}>{error}</Text>}
    <Text style={look.hud}>{hud}</Text>
    <TrialMap run={run} stage={stage} />
    <View style={look.controls}>
      {safariControls === 'dpad' ? <DPad onPress={press} onRelease={release} disabled={!walking} />
        : <View style={{ flex: 1 }}><Copy small>Tap a spot on the map to walk there.</Copy></View>}
      <View style={{ gap: 8 }}>
        <Chip label="D-pad" selected={safariControls === 'dpad'} onPress={() => setPreference('safariControls', 'dpad')} />
        <Chip label="Tap to walk" selected={safariControls === 'tap'} onPress={() => setPreference('safariControls', 'tap')} />
      </View>
    </View>
    {safariControls === 'dpad' && <Copy small>Use the D-pad, or the arrow keys / WASD on a keyboard.</Copy>}
    <View style={{ gap: 10 }}>
      {star && <View style={styles.row}>
        <Button title="Hint" secondary disabled={!controls} onPress={() => setShowHint(true)} />
        <Button title="Reset the crystals" secondary disabled={!controls} onPress={() => {
          update({ ...current.current, room: resetAlignment(current.current.room, stage) })
          setStatus('The crystals settle back to how you found them.')
        }} />
      </View>}
      {star && showHint && <Text accessibilityLiveRegion="polite" style={look.hint}>
        {tier ? star.hints[tier - 1] : 'Try attuning the meteorite first. The island answers every attempt.'}</Text>}
      <Button title="Restart room" secondary disabled={!controls} onPress={() => { walker.drop(); enter(restartRoom(current.current)) }} />
      {run.stages.length > 1 && <Button title="Start the trial over" secondary disabled={!controls} onPress={() => { walker.drop(); enter(restartRun(current.current)) }} />}
      {/* Open even after the finish: if saving it failed, leaving keeps the cleared run, and coming back finishes it again. */}
      <Button title="Leave the trial" secondary disabled={busy} onPress={() => { walker.drop(); onLeave(current.current) }} />
    </View>
    <Copy small>Leaving does not use up the encounter, and your progress in the trial is kept. Once you finish the trial, it stays finished.</Copy>
  </Panel>
}

const look = themedStyles(() => ({
  status: { color: colors.ink, fontFamily: fonts.heavy, fontSize: 15, lineHeight: 21, minHeight: 21, textAlign: 'center' },
  world: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#0b0b14' },
  hint: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15, lineHeight: 21 },
  hud: { color: colors.ink, fontFamily: fonts.heavy, fontSize: 15, lineHeight: 20, textAlign: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }
}))
