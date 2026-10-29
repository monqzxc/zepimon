import { useEffect, useRef, useState } from 'react'
import { Platform, Text, View } from 'react-native'
import { RESONANCE_SEALS, resonanceStage } from '../expedition-encounter'
import type { ActiveEncounter, SealId } from '../expedition-encounter'
import { usePreferences } from '../preferences'
import { Button, Chip, Copy, Eyebrow, Panel, Title, colors, fonts, styles, themedStyles } from '../ui'
import { lairArt } from '../generated/lair-art.js'
import { pointKey } from './safari-zone'
import type { Direction, Point } from './safari-zone'
import { fitTile } from './safari-view'
import { TileWorld } from './TileWorld'
import type { TileChunks } from './TileWorld'
import { useStepWalker } from './step-walker'
import { DPad, useKeyboardDirections } from './DPad'
import { useGameLoop } from './hooks'
import { OverworldSprite } from './OverworldSprite'
import { Sparkles } from './SafariEncounter'
import { LairAmbience } from './LairAmbience'
import type { LairId } from './lairs'
import { PULSE_WINDOW, SEAL_NAMES, arenaFor, arenaTick, arenaWalk, maxResonance, objective, pauseArena, pulsePhase, resonate,
  resumeArena, routeTo, startArena } from './resonance'
import type { Arena, ArenaLayout } from './resonance'

const art = lairArt as Record<LairId, { ground: number, top: number }>
const STEADY_MS = 3000
const REVEAL_MS = 3500
const SEAL_HELP: Record<SealId, string> = {
  wave: 'Wave ◇: an energy wave fills the lair. Reach the safe tile ◎ before it lands.',
  runes: 'Rune ◇: three numbered runes light up. Step on 1, then 2, then 3.',
  pulse: 'Pulse ◇: stand on it and press Resonate while the ring is in the gold band.',
  stones: 'Stone ◇: three guardian stones ▲ stir. Step on each, in any order.'
}
const ARROWS: Record<Direction, string> = { north: '▲', south: '▼', west: '◀', east: '▶' }

type Props = {
  encounter: ActiveEncounter & { shiny: boolean }, number: number, partner: { name: string, shiny: boolean }, reduced: boolean, busy: boolean,
  error: string, weekKm: number, onSeal: (seal: SealId) => Promise<void>, onStabilize: () => void, onCapture: () => void,
  onWalkOut: (discardShiny: boolean) => void, onLeave: () => void
}

// The Legendary's lair (src/games/lairs.ts), where the Resonance Trial happens (rules in src/games/resonance.ts, saved
// progress in src/expedition-encounter.ts). Coming in shows the Legendary, Shiny or not. Until a seal is on, walking
// back out of the entrance means the next entry meets it anew (a Shiny asks twice first); the first seal sets it for
// good. Four seals switched on steady it, and the existing battle and catch open. Every seal is saved the moment it
// switches on, so leaving, a failed catch or a restart keeps it.
export function ResonanceTrial(props: Props) {
  const { encounter, number, onCapture, onLeave } = props
  const name = `${encounter.shiny ? 'Shiny ' : ''}${encounter.name}`
  if (resonanceStage(encounter) === 'capture-ready') return <Panel>
    <Eyebrow>EXPEDITION {number} · {arenaFor(encounter.name).label.toUpperCase()} · STABILIZED</Eyebrow>
    <Title>{name} is calm</Title>
    <View style={{ alignItems: 'center' }}><OverworldSprite name={encounter.name} shiny={encounter.shiny} size={132} /></View>
    <Copy color={colors.ink}>All four seals hold {encounter.name} steady. The catch is open: weaken it, then throw your Poké Balls. If it breaks free, the seals stay on and you can try again.</Copy>
    <Button title="Begin the catch" onPress={onCapture} />
    <Button title="Back to Expeditions" secondary onPress={onLeave} />
  </Panel>
  return <ArenaPlay {...props} />
}

type Confirm = 'none' | 'shiny' | 'shiny-final'

function ArenaPlay({ encounter, partner, reduced, busy, error, weekKm, onSeal, onStabilize, onWalkOut, onLeave }: Props) {
  const saved = encounter.resonance?.seals ?? []
  const [arena, setArena] = useState(() => startArena(arenaFor(encounter.name), saved, maxResonance(weekKm), Date.now()))
  const { layout } = arena
  const [move, setMove] = useState<{ kind: 'step' | 'bump' | 'none', id: number }>({ kind: 'none', id: 0 })
  const [area, setArea] = useState({ width: 0, height: 0 })
  const [clock, setClock] = useState(() => Date.now())
  const [help, setHelp] = useState(false)
  const [steadying, setSteadying] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>('none')
  const [revealing, setRevealing] = useState(true)
  const { safariControls, safariTrainer } = usePreferences()
  const current = useRef(arena)
  // Seals already saved, or being saved: each is sent once, and again only if saving failed.
  const sent = useRef(new Set<SealId>(saved))
  const [saveError, setSaveError] = useState('')
  const update = (next: Arena) => { current.current = next; setArena(next) }
  const report = (seals: SealId[]) => {
    for (const seal of seals) {
      if (sent.current.has(seal)) continue
      sent.current.add(seal)
      onSeal(seal).then(() => setSaveError(''))
        .catch(() => { sent.current.delete(seal); setSaveError('A seal could not be saved yet. It will try again in a moment.') })
    }
  }
  // Set for good once a seal is on: walking out then is just leaving, and nothing rerolls.
  const settled = saved.length > 0 || arena.seals.length > 0
  const name = `${encounter.shiny ? 'Shiny ' : ''}${encounter.name}`
  // Walking out of the entrance: before any seal, the next entry meets the Legendary anew (a Shiny asks twice first);
  // after, it is leaving.
  const walkOut = () => {
    if (settled) onLeave()
    else if (encounter.shiny) setConfirm('shiny')
    else onWalkOut(false)
  }

  const walkOnce = (direction: Direction) => {
    const result = arenaWalk(current.current, direction, Date.now(), Math.random)
    if (result.move === 'exit') { update(result.arena); walkOut(); return { moved: false, stop: true } }
    if (result.move !== 'none') setMove(previous => ({ kind: result.move === 'bump' ? 'bump' : 'step', id: previous.id + 1 }))
    update(result.arena)
    if (result.completed) report(result.arena.seals)
    // A tap route stops at a bump, a seal or anything that switched on.
    const onSeal = RESONANCE_SEALS.some(seal => pointKey(layout.seals[seal]) === pointKey(result.arena.at))
    return { moved: result.move === 'step', stop: result.move !== 'step' || !!result.completed || onSeal }
  }
  const walking = !arena.paused && !steadying && confirm === 'none'
  const walker = useStepWalker(walkOnce, walking)
  const { press, release } = walker
  useKeyboardDirections(press, release, walking, walker.drop)
  // Ten times a second while the screen is open; leaving the screen or the app pauses (src/games/hooks.ts).
  useGameLoop(() => {
    const now = Date.now()
    const result = arenaTick(current.current, now, Math.random)
    if (result.arena !== current.current) update(result.arena)
    report(result.arena.seals)
    if (result.arena.danger || result.arena.pulse || result.arena.recoverUntil) setClock(now)
  }, () => { walker.drop(); update(pauseArena(current.current)) })
  // Space or Enter resonates on the web, like the button.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const key = (event: KeyboardEvent) => {
      if (event.key !== ' ' && event.key !== 'Enter') return
      event.preventDefault()
      const result = resonate(current.current, Date.now())
      update(result.arena)
      if (result.completed) report(result.arena.seals)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // The short stabilization: the seals' light flows into the Legendary, then the catch opens.
  useEffect(() => {
    if (!steadying) return
    const timer = setTimeout(onStabilize, reduced ? STEADY_MS / 2 : STEADY_MS)
    return () => clearTimeout(timer)
  }, [steadying, reduced, onStabilize])
  // Who waits here, across the top of the lair as you come in.
  useEffect(() => {
    const timer = setTimeout(() => setRevealing(false), REVEAL_MS)
    return () => clearTimeout(timer)
  }, [])

  const allSaved = RESONANCE_SEALS.every(seal => saved.includes(seal))
  const tile = fitTile(area.width, area.height, layout.map)
  const pulseOn = !!arena.pulse
  const phase = arena.pulse ? pulsePhase(arena.pulse, clock) : 0
  const inWindow = pulseOn && phase >= PULSE_WINDOW[0] && phase <= PULSE_WINDOW[1]
  const chunks: TileChunks = { '0,0': art[layout.lair] }
  return <View style={{ flex: 1, gap: 8 }}>
    <View style={look.hud}>
      <View accessible accessibilityLabel={`Seals on: ${arena.seals.length} of 4`} style={look.seals}>
        {RESONANCE_SEALS.map(seal => <Text key={seal} style={[look.seal, arena.seals.includes(seal) && look.sealOn]}>
          {arena.seals.includes(seal) ? '◆' : '◇'} {SEAL_NAMES[seal]}</Text>)}
      </View>
      <Text accessibilityLabel={`Resonance ${arena.resonance} of ${arena.maxResonance}${arena.recoverUntil ? ', recovering' : ''}`} style={look.resonance}>
        RESONANCE {'●'.repeat(arena.resonance)}{'○'.repeat(arena.maxResonance - arena.resonance)}{arena.recoverUntil ? ' · RECOVERING' : ''}
      </Text>
      <Text style={[look.place, encounter.shiny && { color: colors.gold }]}>{layout.label.toUpperCase()} · {encounter.shiny ? `✦ SHINY ${encounter.name.toUpperCase()} ✦` : encounter.name.toUpperCase()}</Text>
      <Text numberOfLines={2} style={look.objective}>{steadying ? `The seals’ light flows into ${encounter.name}…` : objective(arena)}</Text>
    </View>
    <View style={[look.map, { backgroundColor: layout.background }]} onLayout={event => { const { width, height } = event.nativeEvent.layout; setArea({ width, height }) }}
      accessible={safariControls !== 'tap'} accessibilityRole="image"
      accessibilityLabel={`${layout.label}, ${name}'s lair. You are at row ${arena.at.y + 1}, column ${arena.at.x + 1}. ${arena.danger ? 'Danger is marked on the ground.' : ''}`}>
      {area.width > 0 && <View style={{ position: 'absolute', left: 0, top: 0 }}>
        <TileWorld map={layout.map} chunks={chunks} at={arena.at} facing={arena.facing} buddyAt={arena.buddy} buddyFacing={arena.buddyFacing}
          move={move} trainer={safariTrainer} buddy={partner} onGrass={false} width={area.width} height={area.height}
          reduced={reduced} jump={0} background={layout.background} fit tapToWalk={safariControls === 'tap' && walking}
          onTapTile={(to: Point) => {
            // Tapping the entrance walks to the doorway and out.
            const out = to.x === layout.entrance.x && to.y === layout.entrance.y
            const route = routeTo(current.current, out ? layout.start : to)
            if (route) walker.follow(out ? [...route, layout.out] : route)
          }}
          cover={<ExitMark layout={layout} tile={tile} settled={settled} />}>
          <Marks arena={arena} tile={tile} clock={clock} reduced={reduced} />
          {pulseOn && <PulseRing at={layout.seals.pulse} tile={tile} phase={phase} lit={inWindow} />}
          <Legendary at={layout.legendary} name={encounter.name} shiny={encounter.shiny} tile={tile} facing={facingToward(arena.at, layout.legendary)}
            glowing={steadying || arena.seals.length === 4} reduced={reduced} />
        </TileWorld>
      </View>}
      <LairAmbience lair={layout.lair} width={area.width} height={area.height} reduced={reduced} />
      {/* Away from the doorway, so it never hides where you came in. */}
      {revealing && !arena.paused && <View pointerEvents="none" style={[look.reveal, layout.start.y < layout.rows / 2 ? { bottom: 10 } : { top: 10 }]}>
        <Text style={look.revealPlace}>{layout.label.toUpperCase()}</Text>
        <Text accessibilityLiveRegion="polite" style={[look.revealTitle, encounter.shiny && { color: '#FFE27A' }]}>
          {settled ? `${name} waits, ${arena.seals.length} of 4 seals on.` : encounter.shiny ? `✦ A Shiny ${encounter.name} appeared! ✦` : `A wild ${encounter.name} appeared!`}</Text>
      </View>}
      {arena.paused && confirm === 'none' && <View style={look.pause}>
        <Text style={look.pauseTitle}>Paused</Text>
        <Copy color="#FFFFFF">{settled ? 'Your seals are safe. The Legendary waits.' : 'The Legendary waits, just as it is.'}</Copy>
        <Button title="Resume" onPress={() => update(resumeArena(current.current, Date.now()))} />
      </View>}
      {confirm !== 'none' && <View style={look.pause}>
        {confirm === 'shiny' ? <>
          <Text style={[look.pauseTitle, { color: '#FFE27A' }]}>✦ This {encounter.name} is Shiny ✦</Text>
          <Copy color="#FFFFFF">Walking out leaves it behind. The next time you come in, the Legendary is met anew: a 1 in 100 chance of a Shiny.</Copy>
          <Button title="I understand, walk out" secondary onPress={() => setConfirm('shiny-final')} />
        </> : <>
          <Text style={look.pauseTitle}>Leave the Shiny {encounter.name} behind?</Text>
          <Copy color="#FFFFFF">This cannot be undone.</Copy>
          <Button title="Leave it behind" loading={busy} onPress={() => { setConfirm('none'); onWalkOut(true) }} />
        </>}
        <Button title="Stay with the Shiny" onPress={() => setConfirm('none')} />
      </View>}
    </View>
    <Text accessibilityLiveRegion="polite" numberOfLines={2} style={[look.message, feedbackStyle(arena)]}>
      {error || saveError || (arena.message === objective(arena) ? '' : `${feedbackMark(arena)}${arena.message}`)}</Text>
    {help && <Panel style={{ gap: 6 }}>
      <Copy small color={colors.ink}>Walk with the D-pad, arrow keys or WASD, or tap a spot with Tap to walk (as in the Safari Zone).</Copy>
      <Copy small>Until a seal is on, {encounter.name} only watches. Walk back out of the entrance {ARROWS[layout.out]} to come in again and meet it anew (1 in 100 Shiny); the entrance seals for a moment. Leave keeps it just as it is. Once a seal is on, it stays as it is.</Copy>
      {RESONANCE_SEALS.map(seal => <Copy key={seal} small>{SEAL_HELP[seal]}</Copy>)}
      <Copy small>⚠ marks where an attack will land, ✸ is it landing. Step off before it lands. Hits only count on the marked tiles.</Copy>
    </Panel>}
    <View style={look.controls}>
      {safariControls === 'dpad' ? <DPad onPress={press} onRelease={release} disabled={!walking} />
        : <View style={{ width: 156 }}><Copy small>Tap a spot on the map to walk there. Arrow keys / WASD also work.</Copy></View>}
      <View style={{ flex: 1, gap: 8 }}>
        {arena.seals.length === 4
          ? <Button title={steadying ? 'Steadying…' : 'Steady the Legendary'} loading={steadying || busy} disabled={!allSaved} onPress={() => setSteadying(true)} />
          : <Button title={inWindow ? 'Resonate — now!' : 'Resonate'} disabled={!pulseOn || arena.paused} onPress={() => {
            const result = resonate(current.current, Date.now())
            update(result.arena)
            if (result.completed) report(result.arena.seals)
          }} />}
        <View style={styles.row}>
          <Chip label={arena.paused ? 'Resume' : 'Pause'} selected={arena.paused} disabled={steadying || confirm !== 'none'}
            onPress={() => { walker.drop(); update(arena.paused ? resumeArena(current.current, Date.now()) : pauseArena(current.current)) }} />
          <Chip label={help ? 'Hide help' : 'How to play'} selected={help} onPress={() => setHelp(!help)} />
          <Chip label="Leave" selected={false} disabled={steadying} onPress={() => { walker.drop(); onLeave() }} />
        </View>
      </View>
    </View>
  </View>
}

// Each kind of moment has its own mark beside the words, so warning, hit, dodge and recovery read apart without color.
const MARKS: Record<NonNullable<Arena['feedback']>, string> = { warn: '⚠ ', strike: '✸ ', hit: '✖ ', dodge: '✓ ', seal: '★ ', miss: '↺ ', recover: '♥ ' }
const feedbackMark = (arena: Arena) => arena.feedback ? MARKS[arena.feedback] : ''
const feedbackStyle = (arena: Arena) => arena.feedback === 'hit' ? { color: colors.danger } : arena.feedback === 'seal' || arena.feedback === 'dodge' || arena.feedback === 'recover'
  ? { color: colors.success } : arena.feedback === 'warn' ? { color: colors.gold } : null

// Where things are, in map coordinates on TileWorld's map layer: the seals, the runes and stones once woken, the wave's
// safe tile and every marked tile. Each mark has its own glyph, so nothing relies on color alone. Warnings blink gently
// unless motion is reduced.
function Marks({ arena, tile, clock, reduced }: { arena: Arena, tile: number, clock: number, reduced: boolean }) {
  const box = (point: Point) => ({ position: 'absolute' as const, left: point.x * tile, top: point.y * tile, width: tile, height: tile })
  const danger = arena.danger
  const striking = !!danger && clock >= danger.warnUntil
  const blink = !reduced && !striking && Math.floor(clock / 300) % 2 === 1
  const safe = danger?.safe ? danger.safe.split(',').map(Number) : null
  return <>
    {RESONANCE_SEALS.map(seal => {
      const on = arena.seals.includes(seal)
      return <View key={seal} style={[box(arena.layout.seals[seal]), look.mark, on ? look.sealTileOn : look.sealTile]}>
        <Text style={[look.markText, { fontSize: tile * 0.42, color: on ? '#1A1200' : '#FFFFFF' }]}>{on ? '◆' : '◇'}</Text>
        {/* On small tiles (a wide lair) the name shrinks to its first letter. */}
        <Text style={[look.markLabel, { fontSize: Math.max(8, tile * 0.18), color: on ? '#1A1200' : '#FFFFFF' }]}>{tile < 34 ? SEAL_NAMES[seal][0] : SEAL_NAMES[seal].toUpperCase()}</Text>
      </View>
    })}
    {arena.runes !== null && arena.layout.runes.map((point, i) => <View key={`rune-${i}`} style={[box(point), look.mark, i < arena.runes! ? look.runeDone : look.rune]}>
      <Text style={[look.markText, { fontSize: tile * 0.45 }]}>{i + 1}</Text>
    </View>)}
    {arena.stones !== null && arena.layout.stones.map((point, i) => <View key={`stone-${i}`} style={[box(point), look.mark, arena.stones!.includes(i) ? look.stoneAwake : look.stone]}>
      <Text style={[look.markText, { fontSize: tile * 0.45 }]}>▲</Text>
    </View>)}
    {danger?.tiles.map(key => {
      const [x, y] = key.split(',').map(Number)
      return <View key={`danger-${key}`} style={[box({ x, y }), striking ? look.strike : look.warn, { opacity: blink ? 0.6 : 1 }]}>
        <Text style={[look.markText, { fontSize: tile * 0.4, color: striking ? '#FFFFFF' : '#1A1200' }]}>{striking ? '✸' : '⚠'}</Text>
      </View>
    })}
    {safe && <View style={[box({ x: safe[0], y: safe[1] }), look.mark, look.safe]}>
      <Text style={[look.markText, { fontSize: tile * 0.5, color: '#FFFFFF' }]}>◎</Text>
    </View>}
  </>
}

// The pulse: a ring shrinking onto the seal; press while it is inside the gold band.
function PulseRing({ at, tile, phase, lit }: { at: Point, tile: number, phase: number, lit: boolean }) {
  const radius = (p: number) => tile * (2.2 - 1.9 * p)
  const centre = { x: (at.x + 0.5) * tile, y: (at.y + 0.5) * tile }
  const outer = radius(PULSE_WINDOW[0]), inner = radius(PULSE_WINDOW[1])
  const ring = radius(phase)
  return <>
    <View pointerEvents="none" style={{ position: 'absolute', left: centre.x - outer, top: centre.y - outer, width: outer * 2, height: outer * 2,
      borderRadius: outer, borderWidth: outer - inner, borderColor: 'rgba(242, 194, 48, 0.4)' }} />
    <View pointerEvents="none" style={{ position: 'absolute', left: centre.x - ring, top: centre.y - ring, width: ring * 2, height: ring * 2,
      borderRadius: ring, borderWidth: 3, borderColor: lit ? '#F2C230' : '#FFFFFF' }} />
  </>
}

// The way from the Legendary toward the trainer, along the longer axis, so it turns to watch you walk around it.
function facingToward(at: Point, legendary: Point): Direction {
  const dx = at.x - legendary.x, dy = at.y - legendary.y
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'east' : 'west'
  return dy < 0 ? 'north' : 'south'
}

// The Legendary as its Emerald overworld sprite, two tiles tall, standing on its tile with a shadow and stepping in
// place facing you; a Shiny sparkles every few seconds, and it glows as the seals steady it.
function Legendary({ at, name, shiny, tile, facing, glowing, reduced }: { at: Point, name: string, shiny: boolean, tile: number, facing: Direction, glowing: boolean, reduced: boolean }) {
  const size = tile * 2
  const [glint, setGlint] = useState(0)
  useEffect(() => {
    if (!shiny || reduced) return
    const timer = setInterval(() => setGlint(current => current + 1), 4000)
    return () => clearInterval(timer)
  }, [shiny, reduced])
  return <View pointerEvents="none" style={{ position: 'absolute', left: at.x * tile + tile / 2 - size / 2, top: (at.y + 1) * tile - size }}>
    <View style={{ position: 'absolute', left: size * 0.2, top: size * 0.86, width: size * 0.6, height: size * 0.16, borderRadius: size, backgroundColor: 'rgba(0, 0, 0, 0.3)' }} />
    {glowing && <View style={{ position: 'absolute', left: -tile * 0.2, top: -tile * 0.2, width: size + tile * 0.4, height: size + tile * 0.4, borderRadius: size,
      backgroundColor: 'rgba(242, 194, 48, 0.28)' }} />}
    <OverworldSprite name={name} shiny={shiny} size={size} facing={facing} />
    {shiny && <Sparkles key={glint} centre={{ x: size / 2, y: size / 2 }} size={size} reduced={reduced} />}
  </View>
}

// The entrance you came in by, marked with the way out. Before any seal it is also the way to meet the Legendary anew.
function ExitMark({ layout, tile, settled }: { layout: ArenaLayout, tile: number, settled: boolean }) {
  const { entrance, out } = layout
  return <View pointerEvents="none" style={[look.exit, { left: entrance.x * tile + 2, top: entrance.y * tile + 2, width: tile - 4, height: tile - 4 }]}>
    <Text style={[look.markText, { fontSize: tile * 0.36 }]}>{ARROWS[out]}</Text>
    {tile >= 34 && <Text style={[look.markLabel, { fontSize: Math.max(8, tile * 0.17), color: '#FFFFFF' }]}>{settled ? 'LEAVE' : 'OUT'}</Text>}
  </View>
}

const look = themedStyles(() => ({
  hud: { gap: 4 },
  seals: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  seal: { fontFamily: fonts.heavy, fontSize: 13, lineHeight: 18, color: colors.muted },
  sealOn: { color: colors.gold },
  resonance: { fontFamily: fonts.heavy, fontSize: 13, lineHeight: 18, color: colors.edge, letterSpacing: 0.5 },
  place: { fontFamily: fonts.heavy, fontSize: 11, lineHeight: 15, color: colors.muted, letterSpacing: 0.8 },
  objective: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, color: colors.ink },
  map: { flex: 1, minHeight: 200, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000000' },
  message: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, color: colors.ink, minHeight: 42 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pause: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20,
    backgroundColor: 'rgba(4, 12, 10, 0.72)' },
  pauseTitle: { fontFamily: fonts.black, fontSize: 24, lineHeight: 30, color: '#FFFFFF' },
  mark: { alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 2 },
  markText: { fontFamily: fonts.black, color: '#FFFFFF', textAlign: 'center' },
  markLabel: { position: 'absolute', bottom: 1, left: 0, right: 0, textAlign: 'center', fontFamily: fonts.heavy },
  sealTile: { backgroundColor: 'rgba(12, 40, 60, 0.7)', borderColor: '#76BDF4' },
  sealTileOn: { backgroundColor: 'rgba(242, 194, 48, 0.85)', borderColor: '#FFF4B8' },
  rune: { backgroundColor: 'rgba(14, 110, 62, 0.75)', borderColor: '#9BE3BC' },
  runeDone: { backgroundColor: 'rgba(242, 194, 48, 0.85)', borderColor: '#FFF4B8' },
  stone: { backgroundColor: 'rgba(60, 60, 70, 0.75)', borderColor: '#B8B8C8' },
  stoneAwake: { backgroundColor: 'rgba(242, 194, 48, 0.85)', borderColor: '#FFF4B8' },
  warn: { position: 'absolute', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(242, 194, 48, 0.45)', borderWidth: 2,
    borderColor: '#F2C230', borderStyle: 'dashed' },
  strike: { position: 'absolute', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(224, 72, 58, 0.65)', borderWidth: 2, borderColor: '#FFB4A8' },
  safe: { backgroundColor: 'rgba(27, 110, 51, 0.85)', borderColor: '#9BE3BC' },
  exit: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 2, borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.85)', backgroundColor: 'rgba(8, 16, 24, 0.45)' },
  reveal: { position: 'absolute', left: 10, right: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, gap: 2,
    backgroundColor: 'rgba(6, 12, 20, 0.78)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.25)' },
  revealPlace: { fontFamily: fonts.heavy, fontSize: 11, lineHeight: 15, letterSpacing: 1.2, color: '#C9D6E8' },
  revealTitle: { fontFamily: fonts.black, fontSize: 17, lineHeight: 22, color: '#FFFFFF' }
}))
