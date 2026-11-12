import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Image, Platform, Pressable, Text, View } from 'react-native'
import type { ImageSourcePropType } from 'react-native'
import { typeColors } from '../catalog'
import { usePreferences } from '../preferences'
import { Button, Chip, Copy, Panel, PokeballIcon, colors, fonts, retro, styles, themedStyles } from '../ui'
import { lairArt } from '../generated/lair-art.js'
import { planWalk } from './safari-zone'
import type { Direction, Point } from './safari-zone'
import { fitTile } from './safari-view'
import { TileWorld } from './TileWorld'
import type { TileChunks } from './TileWorld'
import { useStepWalker } from './step-walker'
import { DPad, useKeyboardDirections } from './DPad'
import { useGameLoop } from './hooks'
import { OverworldSprite } from './OverworldSprite'
import { Pixels } from './Pixels'
import { STRIKE, STRIKE_COLOURS, WARNING, WARNING_COLOURS } from './pixel-sprites'
import { Sparkles } from './SafariEncounter'
import { ShinyGlow, ShinyStars } from './ShinyAura'
import { LairAmbience } from './LairAmbience'
import { hitSheet } from './MoveFx'
import type { LairId } from './lairs'
import { CAPTURE, CAPTURE_MS, FOE_HP, battleOver, battleTick, battleWalk, facingToward, legendaryHeight, legendarySize, maxHearts, moveWait, pauseBattle,
  resumeBattle, startBattle, strikeWith, throwBall, weakened } from './lair-battle'
import type { LairBattle as Battle, LairLayout } from './lair-battle'

type Strip = { source: ImageSourcePropType, frames: number, width: number, height: number }
const art = lairArt as Record<LairId, { ground: number, top: number }>
const typeColor = typeColors as Record<string, string>
const native = Platform.OS !== 'web'
const pixelated = Platform.OS === 'web' ? { imageRendering: 'pixelated' as const } : {}
const REVEAL_MS = 3500
// How long the portal ripples before the Legendary is met anew (the save's own pacing is RESET_COOLDOWN).
const RIPPLE_MS = 1600
const hpColor = (hp: number) => hp <= 20 ? '#E83820' : hp <= 50 ? '#F0B828' : '#48C058'
type Confirm = 'none' | 'shiny' | 'shiny-final'

type Props = {
  foe: { name: string, shiny: boolean }, partner: { name: string, shiny: boolean }, reduced: boolean, busy: boolean, error: string, weekKm: number,
  // The battle had already begun on an earlier visit: the portal is sealed and the Legendary is ready.
  engaged: boolean,
  // Saves that the battle has begun (the first move), the shiny reset at the portal, and the catch.
  onEngage: () => Promise<void>, onReset: (discardShiny: boolean) => Promise<void>, onCaught: () => Promise<void>,
  onDone: () => void, onLeave: () => void,
  // A Shrine Revisit's lair: nothing is saved but a rematch win, and the Legendary stays in the form it was caught.
  practice?: boolean
}

// The Legendary's lair (src/games/lairs.ts) and the battle fought in it (rules in src/games/lair-battle.ts), with no cut
// to a battle screen. The shrine trial's last door is a one-way portal into it: coming in shows the Legendary, Shiny or
// not, standing at its real size. Until your first move it only watches, and stepping back onto the portal is the shiny
// reset: the lair ripples and the Legendary is met anew (a Shiny asks twice first). Your partner's moves are listed on
// the right: tap one and it lands; the Legendary answers with attacks marked on the ground, which you walk out of. At
// 0 HP it is weakened: it slumps with stars circling its head, and only then can a Poké Ball be thrown. The ball flies
// from wherever the trainer stands, bounces off and opens, a red beam draws the Legendary in, and it swings three times
// before a star pops (Capture). onCaught saves the catch, once, only after that. Leaving
// keeps the encounter waiting; the battle itself is never saved. In practice (a Shrine Revisit) the same battle plays
// out as a rematch: the portal holds and a held ball only counts a win.
export function LairBattle({ foe, partner, reduced, busy, error, weekKm, engaged, onEngage, onReset, onCaught, onDone, onLeave, practice = false }: Props) {
  const [battle, setBattle] = useState(() => startBattle(foe, partner.name, maxHearts(weekKm), Date.now(), { engaged: engaged || practice, canReset: !practice }))
  const { layout } = battle
  const [move, setMove] = useState<{ kind: 'step' | 'bump' | 'none', id: number }>({ kind: 'none', id: 0 })
  const [area, setArea] = useState({ width: 0, height: 0 })
  const [clock, setClock] = useState(() => Date.now())
  const [help, setHelp] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>('none')
  const [rippling, setRippling] = useState(false)
  const [revealing, setRevealing] = useState(true)
  const [note, setNote] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const { safariControls, safariTrainer } = usePreferences()
  const current = useRef(battle)
  const update = (next: Battle) => { if (next !== current.current) { current.current = next; setBattle(next) } }
  const name = `${foe.shiny ? 'Shiny ' : ''}${foe.name}`

  // The battle beginning is saved once, and again on the next tick if saving failed.
  const began = useRef<'no' | 'saving' | 'saved'>(engaged || practice ? 'saved' : 'no')
  const saveBegan = () => {
    if (began.current !== 'no') return
    began.current = 'saving'
    onEngage().then(() => { began.current = 'saved'; setSaveError('') })
      .catch(() => { began.current = 'no'; setSaveError('The battle could not be saved yet. It will try again in a moment.') })
  }
  const caught = useRef(onCaught)
  useEffect(() => { caught.current = onCaught })
  const saveCatch = () => {
    setSaving('saving')
    caught.current().then(() => setSaving('saved')).catch(reason => { setSaving('failed'); setSaveError(reason instanceof Error ? reason.message : '') })
  }
  const savedOnce = useRef(false)
  useEffect(() => {
    if (battle.phase !== 'caught' || savedOnce.current) return
    savedOnce.current = true
    saveCatch()
  }, [battle.phase])

  // The portal ripples, then the reset is saved; the parent remounts this lair with the new meeting.
  const ripple = (discardShiny: boolean) => {
    setConfirm('none'); setRippling(true)
    setTimeout(() => { onReset(discardShiny).catch(() => setRippling(false)) }, reduced ? RIPPLE_MS / 2 : RIPPLE_MS)
  }
  const stepOnPortal = () => {
    if (practice) { setNote(`On a revisit the portal holds: this ${name} stays as you caught it.`); return }
    if (rippling) return
    if (foe.shiny) setConfirm('shiny')
    else ripple(false)
  }

  const walkOnce = (direction: Direction) => {
    const result = battleWalk(current.current, direction, Date.now())
    update(result.battle)
    if (result.move === 'reset') { stepOnPortal(); return { moved: false, stop: true } }
    if (result.move === 'step') setNote('')
    if (result.move !== 'none') setMove(previous => ({ kind: result.move === 'bump' ? 'bump' : 'step', id: previous.id + 1 }))
    return { moved: result.move === 'step', stop: result.move !== 'step' }
  }
  const acting = !battle.paused && (battle.phase === 'watch' || battle.phase === 'fight' || battle.phase === 'down') && confirm === 'none' && !rippling
  const walker = useStepWalker(walkOnce, acting)
  const { press, release } = walker
  useKeyboardDirections(press, release, acting, walker.drop)
  const act = (play: (battle: Battle, now: number) => { battle: Battle, began: boolean }) => {
    if (!acting) return
    const result = play(current.current, Date.now())
    if (result.battle !== current.current) setNote('')
    update(result.battle)
    if (result.began) saveBegan()
  }
  const use = (index: number) => act((state, now) => strikeWith(state, index, now, Math.random))
  const throwIt = () => act((state, now) => ({ battle: throwBall(state, now), began: false }))
  // Ten times a second while the screen is open; leaving the screen or the app pauses (src/games/hooks.ts).
  useGameLoop(() => {
    const now = Date.now()
    update(battleTick(current.current, now, Math.random))
    if (current.current.phase !== 'watch' && !battleOver(current.current)) { saveBegan(); setClock(now) }
  }, () => { walker.drop(); update(pauseBattle(current.current, Date.now())) })
  // On the web, 1 to 4 use a move and Space or Enter throws a ball.
  const keys = useRef({ use, throwIt })
  useEffect(() => { keys.current = { use, throwIt } })
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const key = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key >= '1' && event.key <= '4') keys.current.use(Number(event.key) - 1)
      else if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); keys.current.throwIt() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  // Who waits here, across the lair as you come in.
  useEffect(() => {
    const timer = setTimeout(() => setRevealing(false), REVEAL_MS)
    return () => clearTimeout(timer)
  }, [])

  const tile = fitTile(area.width, area.height, layout.map)
  const chunks: TileChunks = { '0,0': art[layout.lair] }
  const over = battleOver(battle)
  const begun = battle.phase !== 'watch'
  const down = weakened(battle)
  // The beam has drawn it in: the Legendary is inside the ball while it swings, and stays there once caught.
  const inBall = battle.phase === 'caught' || (battle.phase === 'throw' && !!battle.ball && clock >= battle.ball.since + CAPTURE.fly + CAPTURE.bounce + CAPTURE.beam)
  const size = legendarySize(foe.name) * tile
  // Where things are in the lair, in pixels: the Legendary's middle, the ground at its feet, and where the ball hangs
  // open after bouncing off it, back toward wherever the trainer threw from.
  const body = { x: (layout.legendary.x + 0.5) * tile, y: (layout.legendary.y + 1) * tile - size / 2 }
  const ground = { x: body.x, y: (layout.legendary.y + 0.5) * tile }
  const thrower = battle.ball?.from ?? battle.at
  const reach = Math.hypot(thrower.x - layout.legendary.x, thrower.y - layout.legendary.y) || 1
  const hover = { x: body.x + (thrower.x - layout.legendary.x) / reach * tile * 1.4, y: body.y + (thrower.y - layout.legendary.y) / reach * tile * 0.6 - tile * 0.9 }
  const resting = clock < battle.recoverUntil
  return <View style={{ flex: 1, gap: 8 }}>
    <View style={look.hud}>
      <Text numberOfLines={1} style={[look.place, foe.shiny && { color: colors.gold }]}>
        {practice ? 'REMATCH · ' : ''}{layout.label.toUpperCase()} · {foe.shiny ? `✦ SHINY ${foe.name.toUpperCase()} ✦` : foe.name.toUpperCase()}</Text>
      <View style={styles.row}>
        <Chip label={battle.paused ? 'Resume' : 'Pause'} selected={battle.paused} disabled={over || battle.phase === 'throw' || rippling || confirm !== 'none'}
          onPress={() => { walker.drop(); update(battle.paused ? resumeBattle(current.current, Date.now()) : pauseBattle(current.current, Date.now())) }} />
        <Chip label={help ? 'Hide help' : 'How to play'} selected={help} onPress={() => setHelp(!help)} />
        <Chip label="Leave" selected={false} disabled={rippling || saving === 'saving'} onPress={() => { walker.drop(); onLeave() }} />
      </View>
    </View>
    <View style={[look.map, { backgroundColor: layout.background }]} onLayout={event => { const { width, height } = event.nativeEvent.layout; setArea({ width, height }) }}
      accessible={safariControls !== 'tap'} accessibilityRole="image"
      accessibilityLabel={`${layout.label}, ${name}'s lair. You are at row ${battle.at.y + 1}, column ${battle.at.x + 1}. ${battle.danger ? 'Danger is marked on the ground.' : ''}`}>
      {area.width > 0 && <View style={{ position: 'absolute', left: 0, top: 0 }}>
        <TileWorld map={layout.map} chunks={chunks} at={battle.at} facing={battle.facing} buddyAt={battle.buddy} buddyFacing={battle.buddyFacing}
          move={move} trainer={safariTrainer} buddy={partner} onGrass={false} width={area.width} height={area.height}
          reduced={reduced} jump={0} background={layout.background} fit tapToWalk={safariControls === 'tap' && acting}
          onTapTile={(to: Point) => {
            // Tapping the portal walks to the doorway and steps onto it (the reset, before the battle begins).
            const portal = to.x === layout.entrance.x && to.y === layout.entrance.y
            const route = planWalk(current.current.at, portal ? layout.start : to, layout.map)
            if (route) walker.follow(portal ? [...route, layout.out] : route)
          }}
          cover={<>
            <SealedPortal layout={layout} tile={tile} reduced={reduced} open={!begun && !practice} />
            {battle.strike && !battle.ball && <HitBurst key={battle.strike.id} sheet={hitSheet(battle.strike.move.type) as Strip} tile={tile}
              centre={{ x: body.x, y: (layout.legendary.y + 1) * tile - Math.min(size, tile * 2) / 2 }} reduced={reduced} />}
            {battle.ball && <Capture key={battle.ball.since} from={{ x: (battle.ball.from.x + 0.5) * tile, y: (battle.ball.from.y + 0.2) * tile }}
              body={body} hover={hover} ground={ground} tile={tile} reduced={reduced} />}
          </>}>
          <Legendary at={layout.legendary} name={foe.name} shiny={foe.shiny} tile={tile} facing={facingToward(layout.legendary, battle.at)}
            hidden={inBall} struck={battle.strike?.id ?? 0} weak={down || battle.phase === 'throw'} drawnTo={battle.ball ? hover : null} reduced={reduced} />
          <Marks battle={battle} tile={tile} clock={clock} reduced={reduced} />
        </TileWorld>
      </View>}
      <LairAmbience lair={layout.lair} width={area.width} height={area.height} reduced={reduced} />
      <View pointerEvents="none" accessible accessibilityLabel={`${name}, ${legendaryHeight(foe.name)} metres tall, ${battle.foe.hp ? `HP ${Math.round(battle.foe.hp)} percent` : 'weakened, no HP left'}`} style={look.status}>
        <Text numberOfLines={1} style={look.statusName}>{foe.name.toUpperCase()}{foe.shiny ? ' ✦' : ''} <Text style={look.statusHeight}>{legendaryHeight(foe.name)} m</Text></Text>
        <View style={look.hpRow}>
          <Text style={look.hpLabel}>{battle.foe.hp ? 'HP' : 'WEAKENED'}</Text>
          <View style={look.hpTrack}><View style={{ width: `${battle.foe.hp / FOE_HP * 100}%`, height: '100%', backgroundColor: hpColor(battle.foe.hp) }} /></View>
        </View>
      </View>
      <Text pointerEvents="none" accessibilityLabel={`${battle.hearts} of ${battle.maxHearts} hearts${resting ? ', catching your breath' : ''}`} style={look.hearts}>
        {'♥'.repeat(battle.hearts)}<Text style={{ color: 'rgba(255, 255, 255, 0.45)' }}>{'♥'.repeat(battle.maxHearts - battle.hearts)}</Text></Text>
      {revealing && !battle.paused && !over && <View pointerEvents="none" style={[look.reveal, layout.start.y < layout.rows / 2 ? { bottom: 34 } : { top: 60 }]}>
        <Text accessibilityLiveRegion="polite" style={[look.revealTitle, foe.shiny && { color: '#FFE27A' }]}>
          {practice ? `${name} is ready for a rematch.` : engaged ? `${name} is ready for you.` : foe.shiny ? `✦ A Shiny ${foe.name} appeared! ✦` : `A wild ${foe.name} appeared!`}</Text>
      </View>}
      {rippling && <PortalRipple reduced={reduced} name={foe.name} />}
      {battle.paused && confirm === 'none' && !rippling && <View style={look.pause}>
        <Text style={look.pauseTitle}>Paused</Text>
        <Copy color="#FFFFFF">{name} waits, just as it is.</Copy>
        <Button title="Resume" onPress={() => update(resumeBattle(current.current, Date.now()))} />
      </View>}
      {confirm !== 'none' && <View style={look.pause}>
        {confirm === 'shiny' ? <>
          <Text style={[look.pauseTitle, { color: '#FFE27A' }]}>✦ This {foe.name} is Shiny ✦</Text>
          <Copy color="#FFFFFF">Stepping onto the portal meets it anew, and the next one may not be Shiny.</Copy>
          <Button title="I understand, reset" secondary onPress={() => setConfirm('shiny-final')} />
        </> : <>
          <Text style={look.pauseTitle}>Let the Shiny {foe.name} go?</Text>
          <Copy color="#FFFFFF">This cannot be undone.</Copy>
          <Button title="Reset the encounter" loading={busy} onPress={() => ripple(true)} />
        </>}
        <Button title="Stay with the Shiny" onPress={() => setConfirm('none')} />
      </View>}
      {battle.phase === 'caught' && <View style={look.pause}>
        <Text accessibilityLiveRegion="polite" style={[look.pauseTitle, { color: '#FFE27A' }]}>{practice ? '★ You won the rematch! ★' : '★ Captured! ★'}</Text>
        {saving === 'saved' ? <>
          <Copy color="#FFFFFF">{practice ? `${name} returns to your team.` : `${name} was caught, and its data was added to your Dex.`}</Copy>
          <Button title={practice ? 'Back to Shrine Revisits' : 'Continue'} onPress={onDone} />
        </> : saving === 'failed' ? <>
          <Copy color="#FFB4A8">{saveError || (practice ? 'Could not save this win. Try again.' : 'Could not save your catch. Try again.')}</Copy>
          <Button title="Try saving again" onPress={saveCatch} />
        </> : <Button title={practice ? 'Saving your win…' : 'Saving your new friend…'} loading onPress={() => {}} />}
      </View>}
    </View>
    <Text accessibilityLiveRegion="polite" numberOfLines={2} style={[look.message, battle.feedback === 'hit' ? { color: colors.danger }
      : battle.feedback === 'dodge' || battle.feedback === 'recover' ? { color: colors.success } : battle.feedback === 'warn' ? { color: colors.gold } : null]}>
      {error || (saving === 'failed' ? '' : saveError) || note || battle.message}</Text>
    {help && <Panel style={{ gap: 6 }}>
      <Copy small color={colors.ink}>Walk with the D-pad, arrow keys or WASD, or tap a spot with Tap to walk (as in the Safari Zone).</Copy>
      <Copy small>Your partner’s moves are on the right. Tap one and it lands on {foe.name}; each needs a moment before it can be used again. Wear its HP down to nothing: it slumps, weakened, with stars circling its head. Only then can you throw a Poké Ball, and it always holds.</Copy>
      <Copy small>⚠ marks where {foe.name}’s attack will land, ✸ is it landing. Walk off the marked tiles before it lands. A hit costs a heart; at none you catch your breath and it waits.</Copy>
      {practice ? <Copy small>A rematch: nothing is caught and {foe.name} stays as you caught it. Capturing it counts a rematch win.</Copy>
        : <Copy small>Until your first move, {foe.name} only watches, and stepping back onto the portal ◎ meets it anew, with a new chance to be Shiny. Your first move sets it for good. Leave keeps it waiting here for next time.</Copy>}
    </Panel>}
    <View style={look.controls}>
      {safariControls === 'dpad' ? <DPad onPress={press} onRelease={release} disabled={!acting} />
        : <View style={{ width: 156 }}><Copy small>Tap a spot on the map to walk there. Arrow keys / WASD also work.</Copy></View>}
      <View accessibilityLabel={`${partner.name}’s moves`} style={look.moves}>
        {battle.moves.map((item, index) => {
          const wait = moveWait(battle, index, clock)
          const off = !acting || down || resting || wait > 0
          return <Pressable key={item.name} accessibilityRole="button" accessibilityState={{ disabled: off }} disabled={off} onPress={() => use(index)}
            accessibilityLabel={`${item.name}, ${item.type} move, ${item.min} to ${item.max} damage${wait > 0 ? ', getting ready' : ''}`}
            style={({ pressed }) => [look.move, { borderLeftColor: typeColor[item.type] ?? colors.edge }, pressed && { opacity: 0.7 }, off && { opacity: 0.45 }]}>
            <Text numberOfLines={1} style={look.moveName}>{item.name}</Text>
            <Text style={look.moveNote}>{wait > 0 ? `${(wait / 1000).toFixed(1)} s` : `${item.min}–${item.max}`}</Text>
          </Pressable>
        })}
        <Pressable accessibilityRole="button" accessibilityLabel={down ? 'Throw a Poké Ball' : `Poké Ball. Weaken ${foe.name} first`}
          accessibilityState={{ disabled: !acting || !down }} disabled={!acting} onPress={throwIt}
          style={({ pressed }) => [look.move, look.ball, pressed && { opacity: 0.7 }, (!acting || !down) && { opacity: 0.45 }]}>
          <PokeballIcon size={18} color={colors.onEdge} />
          <Text numberOfLines={1} style={[look.moveName, { color: colors.onEdge }]}>Poké Ball</Text>
          <Text style={[look.moveNote, { color: colors.onEdge }]}>{down ? 'Throw!' : 'at 0 HP'}</Text>
        </Pressable>
      </View>
    </View>
  </View>
}

// Where the Legendary's attack will land, in map coordinates on TileWorld's map layer. The tint marks the whole tile and
// the sprite says which moment it is, so nothing relies on color alone. Warnings blink gently unless motion is reduced.
function Marks({ battle, tile, clock, reduced }: { battle: Battle, tile: number, clock: number, reduced: boolean }) {
  const danger = battle.danger
  if (!danger) return null
  const striking = clock >= danger.warnUntil
  const blink = !reduced && !striking && Math.floor(clock / 300) % 2 === 1
  return <>{danger.tiles.map(key => {
    const [x, y] = key.split(',').map(Number)
    return <View key={key} style={[{ left: x * tile, top: y * tile, width: tile, height: tile }, striking ? look.strike : look.warn, { opacity: blink ? 0.6 : 1 }]}>
      <Pixels art={striking ? STRIKE : WARNING} palette={striking ? STRIKE_COLOURS : WARNING_COLOURS} size={tile * 0.72} />
    </View>
  })}</>
}

// The Legendary as its Emerald overworld sprite at its real size beside the trainer (legendarySize), standing on its
// tile with a shadow and stepping in place facing you. It is drawn under the trainer, so a towering one never hides you.
// A Shiny stands in a gold glow with stars around it and sparkles every few seconds. It flickers when a move lands.
// weak: its HP is gone, so it slumps, holds still and stars circle its head. drawnTo: a Poké Ball hangs open there; once
// the ball has bounced the Legendary turns to red light and is drawn into it. hidden: it is inside the ball.
function Legendary({ at, name, shiny, tile, facing, hidden, struck, weak, drawnTo, reduced }: {
  at: Point, name: string, shiny: boolean, tile: number, facing: Direction, hidden: boolean, struck: number, weak: boolean, drawnTo: Point | null, reduced: boolean
}) {
  const size = tile * legendarySize(name)
  const left = at.x * tile + tile / 2 - size / 2, top = (at.y + 1) * tile - size
  const [glint, setGlint] = useState(0)
  const [flicker] = useState(() => new Animated.Value(1))
  const [pull] = useState(() => new Animated.Value(0))
  const [red, setRed] = useState(false)
  const drawn = !!drawnTo
  useEffect(() => {
    if (!shiny || reduced || weak) return
    const timer = setInterval(() => setGlint(value => value + 1), 3000)
    return () => clearInterval(timer)
  }, [shiny, reduced, weak])
  useEffect(() => {
    if (!struck || reduced) return
    const blink = (toValue: number) => Animated.timing(flicker, { toValue, duration: 70, useNativeDriver: native })
    const run = Animated.sequence([Animated.delay(120), ...[0, 1, 2].flatMap(() => [blink(0.15), blink(1)])])
    run.start()
    return () => { run.stop(); flicker.setValue(1) }
  }, [struck, reduced, flicker])
  useEffect(() => {
    if (!drawn) return
    const opened = CAPTURE.fly + CAPTURE.bounce
    const timer = setTimeout(() => setRed(true), opened)
    const run = Animated.sequence([Animated.delay(opened + CAPTURE.beam * 0.25),
      Animated.timing(pull, { toValue: 1, duration: reduced ? 1 : CAPTURE.beam * 0.75, easing: Easing.in(Easing.quad), useNativeDriver: native })])
    run.start()
    return () => { clearTimeout(timer); run.stop() }
  }, [drawn, reduced, pull])
  if (hidden) return null
  const to = drawnTo ?? { x: left + size / 2, y: top + size / 2 }
  return <Animated.View pointerEvents="none" style={{ position: 'absolute', left, top, opacity: flicker,
    transform: [{ translateX: pull.interpolate({ inputRange: [0, 1], outputRange: [0, to.x - (left + size / 2)] }) },
      { translateY: pull.interpolate({ inputRange: [0, 1], outputRange: [0, to.y - (top + size / 2)] }) },
      { scale: pull.interpolate({ inputRange: [0, 1], outputRange: [1, 0.05] }) }] }}>
    {!red && <View style={{ position: 'absolute', left: size * 0.2, top: size * 0.86, width: size * 0.6, height: size * 0.16, borderRadius: size, backgroundColor: 'rgba(0, 0, 0, 0.3)' }} />}
    {shiny && !weak && <ShinyGlow size={size} reduced={reduced} />}
    {/* Weakened, it leans over and sinks a little, and stops stepping. */}
    <View style={weak && !red ? { opacity: 0.85, transform: [{ translateY: size * 0.04 }, { rotate: '9deg' }] } : null}>
      <OverworldSprite name={name} shiny={shiny} size={size} facing={facing} still={weak} tint={red ? '#FF3B30' : undefined} />
    </View>
    {shiny && !weak && <ShinyStars size={size} reduced={reduced} />}
    {shiny && !weak && <Sparkles key={glint} centre={{ x: size / 2, y: size / 2 }} size={size} reduced={reduced} />}
    {weak && !red && <DizzyStars size={size} tile={tile} reduced={reduced} />}
  </Animated.View>
}

// Stars circling the head of a weakened Legendary: three on a flat ring, going round every 1.6 s, dimmer and smaller as
// they pass behind. They hold still with reduced motion.
const RING = Array.from({ length: 13 }, (_, i) => i / 12)
function DizzyStars({ size, tile, reduced }: { size: number, tile: number, reduced: boolean }) {
  const [turn] = useState(() => new Animated.Value(0))
  useEffect(() => {
    if (reduced) return
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: native }))
    loop.start()
    return () => loop.stop()
  }, [reduced, turn])
  const glyph = Math.max(12, Math.min(tile * 0.75, size * 0.32))
  const wide = Math.max(tile * 0.45, size * 0.26), flat = wide * 0.32
  const around = (offset: number, value: (angle: number) => number) =>
    turn.interpolate({ inputRange: RING, outputRange: RING.map(step => value((step + offset) * Math.PI * 2)) })
  return <View accessible accessibilityLabel="Stars circle its head: it is weakened" style={{ position: 'absolute', left: size / 2 - glyph / 2, top: size * 0.2 - glyph / 2 }}>
    {[0, 1 / 3, 2 / 3].map(offset => <Animated.Text key={offset} style={{ position: 'absolute', width: glyph, textAlign: 'center', fontSize: glyph, lineHeight: glyph * 1.15,
      color: '#FFE27A', textShadowColor: 'rgba(90, 58, 0, 0.9)', textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 },
      opacity: around(offset, angle => 0.7 + 0.3 * Math.sin(angle)),
      transform: [{ translateX: around(offset, angle => Math.cos(angle) * wide) }, { translateY: around(offset, angle => Math.sin(angle) * flat) },
        { scale: around(offset, angle => 0.85 + 0.25 * Math.sin(angle)) }] }}>★</Animated.Text>)}
  </View>
}

// A move landing on the Legendary: its Gen III strip plays once, or shows a still frame for a moment with reduced motion.
function HitBurst({ sheet, centre, tile, reduced }: { sheet: Strip, centre: Point, tile: number, reduced: boolean }) {
  const [frame, setFrame] = useState(reduced ? Math.floor((sheet.frames - 1) / 2) : 0)
  const [done, setDone] = useState(false)
  useEffect(() => {
    const end = setTimeout(() => setDone(true), reduced ? 500 : sheet.frames * 90)
    const play = reduced ? null : setInterval(() => setFrame(value => Math.min(sheet.frames - 1, value + 1)), 90)
    return () => { clearTimeout(end); if (play) clearInterval(play) }
  }, [reduced, sheet.frames])
  if (done) return null
  const width = tile * 1.8, height = width * sheet.height / sheet.width
  return <View pointerEvents="none" style={{ position: 'absolute', left: centre.x - width / 2, top: centre.y - height / 2, width, height, overflow: 'hidden' }}>
    <Image source={sheet.source} fadeDuration={0} resizeMode="stretch" accessible={false}
      style={{ position: 'absolute', top: 0, left: -frame * width, width: width * sheet.frames, height, ...pixelated }} />
  </View>
}

// The capture, on one clock (CAPTURE in src/games/lair-battle.ts), all in lair pixels:
// 1. fly: the ball spins in an arc from the trainer (from) and hits the Legendary (body);
// 2. bounce: it springs back off to hang in the air (hover) and bursts open in white light;
// 3. beam: a jagged red beam crackles from the ball to the Legendary, which turns to red light and is drawn in (Legendary);
// 4. drop: the ball shuts and falls to the ground where the Legendary stood (ground), with a small bounce;
// 5. swing: it rocks three times, its button pulsing red each time;
// 6. star: it clicks shut and a star pops out with a ring of sparks.
// With reduced motion nothing flies or rocks: the ball simply rests on the ground and the star shows at the end.
function Capture({ from, body, hover, ground, tile, reduced }: { from: Point, body: Point, hover: Point, ground: Point, tile: number, reduced: boolean }) {
  const [time] = useState(() => new Animated.Value(reduced ? CAPTURE_MS : 0))
  useEffect(() => {
    if (reduced) return
    const run = Animated.timing(time, { toValue: CAPTURE_MS, duration: CAPTURE_MS, easing: Easing.linear, useNativeDriver: native })
    run.start()
    return () => run.stop()
  }, [time, reduced])
  const size = Math.max(16, tile * 0.62)
  const hit = CAPTURE.fly, open = hit + CAPTURE.bounce, shut = open + CAPTURE.beam, landed = shut + CAPTURE.drop
  const swings = Array.from({ length: CAPTURE.swings }, (_, i) => landed + i * CAPTURE.swing)
  const still = landed + CAPTURE.swings * CAPTURE.swing
  const at = (input: number[], output: number[] | string[]) => time.interpolate({ inputRange: input, outputRange: output as number[], extrapolate: 'clamp' })
  const peak = Math.min(from.y, body.y) - tile * 1.6
  const x = at([0, hit, open, shut, landed], [from.x, body.x, hover.x, hover.x, ground.x])
  const y = at([0, hit * 0.5, hit, hit + CAPTURE.bounce * 0.5, open, shut, shut + CAPTURE.drop * 0.6, shut + CAPTURE.drop * 0.8, landed],
    [from.y, peak, body.y, hover.y - tile * 0.5, hover.y, hover.y, ground.y, ground.y - tile * 0.25, ground.y])
  const rock = CAPTURE.swing
  const rotate = at([0, hit, hit + 1, ...swings.flatMap(start => [start + rock * 0.1, start + rock * 0.3, start + rock * 0.6, start + rock * 0.85])],
    ['0deg', '720deg', '0deg', ...swings.flatMap(() => ['0deg', '-30deg', '30deg', '0deg'])])
  const pulse = at(swings.flatMap(start => [start + rock * 0.1, start + rock * 0.45, start + rock * 0.85]), swings.flatMap(() => [0, 0.9, 0]))
  const burst = at([hit, open - 60, open + 180, open + 360], [0, 1, 0.6, 0])
  // The beam crackles: it flickers as it holds, then is gone as the ball shuts.
  const beam = at([open, open + 60, open + 180, open + 260, open + 380, open + 460, shut - 120, shut], [0, 1, 0.55, 1, 0.6, 1, 1, 0])
  const star = at([still, still + 180, still + 340], [0, 1.5, 1])
  const sparks = at([still, still + 120, still + CAPTURE.star], [0, 1, 0])
  const spread = at([still, still + CAPTURE.star], [0.2, 1])
  // The beam's zigzag from the open ball to the Legendary: straight pieces through points nudged to either side.
  const dx = body.x - hover.x, dy = body.y - hover.y, length = Math.hypot(dx, dy) || 1
  const points = [0, 0.2, 0.4, 0.6, 0.8, 1].map((part, i) => {
    const nudge = i === 0 || i === 5 ? 0 : (i % 2 ? 1 : -1) * tile * 0.22
    return { x: hover.x + dx * part - dy / length * nudge, y: hover.y + dy * part + dx / length * nudge }
  })
  const thick = Math.max(3, tile * 0.12)
  return <>
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, opacity: beam }}>
      {points.slice(1).map((point, i) => {
        const before = points[i]
        const span = Math.hypot(point.x - before.x, point.y - before.y)
        return <View key={i} style={{ position: 'absolute', left: (before.x + point.x) / 2 - span / 2, top: (before.y + point.y) / 2 - thick / 2, width: span, height: thick,
          borderRadius: thick, backgroundColor: '#FF2D2D', borderWidth: 1, borderColor: '#FFD0C8', boxShadow: '0px 0px 8px #FF2D2D',
          transform: [{ rotate: `${Math.atan2(point.y - before.y, point.x - before.x)}rad` }] }} />
      })}
    </Animated.View>
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: -size / 2, top: -size / 2, width: size, height: size, transform: [{ translateX: x }, { translateY: y }] }}>
      <Animated.View style={{ position: 'absolute', left: -size, top: -size, width: size * 3, height: size * 3, borderRadius: size * 1.5, backgroundColor: '#FFFFFF', opacity: burst }} />
      <Animated.View style={{ position: 'absolute', left: -size * 0.45, top: -size * 0.45, width: size * 1.9, height: size * 1.9, borderRadius: size, backgroundColor: '#FF2D2D', opacity: pulse }} />
      <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#FFFFFF', transform: [{ rotate }] }}>
        <PokeballIcon size={size} color="#283850" />
        <Animated.View style={{ position: 'absolute', left: size * 0.34, top: size * 0.34, width: size * 0.32, height: size * 0.32, borderRadius: size, backgroundColor: '#FF2D2D', opacity: pulse }} />
      </Animated.View>
      {[0, 1, 2, 3, 4, 5].map(i => <Animated.Text key={i} style={{ position: 'absolute', left: 0, top: 0, width: size, textAlign: 'center', fontSize: size * 0.5, lineHeight: size,
        color: '#FFF4B8', opacity: sparks, transform: [{ translateX: Animated.multiply(spread, Math.cos(i * Math.PI / 3) * size * 1.5) },
          { translateY: Animated.multiply(spread, Math.sin(i * Math.PI / 3) * size * 1.5 - size * 0.4) }] }}>✦</Animated.Text>)}
      <Animated.Text style={{ position: 'absolute', left: -size, top: -size * 1.9, width: size * 3, textAlign: 'center', fontSize: size * 1.5, lineHeight: size * 1.8,
        color: '#FFD23F', textShadowColor: '#5A3A00', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 }, transform: [{ scale: star }] }}>★</Animated.Text>
    </Animated.View>
  </>
}

// The portal you came in by: a stone ring with a violet swirl turning slowly (still with reduced motion). Before the
// battle it glows and reads RESET, the way to meet the Legendary anew; once it has begun it dims, crossed by a bar, and
// reads SEALED. The bar and the label tell the two apart without color.
function SealedPortal({ layout, tile, reduced, open }: { layout: LairLayout, tile: number, reduced: boolean, open: boolean }) {
  const { entrance } = layout
  const [spin] = useState(() => new Animated.Value(0))
  useEffect(() => {
    if (reduced) return
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: open ? 3000 : 6000, easing: Easing.linear, useNativeDriver: native }))
    loop.start()
    return () => loop.stop()
  }, [reduced, spin, open])
  const size = tile - 4
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  return <View pointerEvents="none" accessibilityLabel={open ? 'The portal: step onto it to meet the Legendary anew' : 'The portal behind you, sealed'}
    style={[look.portal, open && look.portalOpen, { left: entrance.x * tile + 2, top: entrance.y * tile + 2, width: size, height: size, borderRadius: size / 2 }]}>
    <Animated.View style={[look.portalSwirl, open && look.portalSwirlOpen, { width: size * 0.7, height: size * 0.7, borderRadius: size, transform: [{ rotate }] }]} />
    {open ? <Text style={[look.portalMark, { fontSize: tile * 0.34 }]}>↺</Text>
      : <View style={[look.portalBar, { width: size * 0.62, height: Math.max(3, size * 0.1) }]} />}
    {tile >= 34 && <Text style={[look.portalLabel, { fontSize: Math.max(8, tile * 0.16) }]}>{open ? 'RESET' : 'SEALED'}</Text>}
  </View>
}

// The reset: violet light washes over the lair from the portal while the Legendary is met anew.
function PortalRipple({ reduced, name }: { reduced: boolean, name: string }) {
  const [wash] = useState(() => new Animated.Value(reduced ? 1 : 0))
  useEffect(() => {
    if (reduced) return
    Animated.timing(wash, { toValue: 1, duration: RIPPLE_MS * 0.8, easing: Easing.out(Easing.quad), useNativeDriver: native }).start()
  }, [reduced, wash])
  return <Animated.View accessibilityLiveRegion="polite" style={[look.pause, look.ripple, { opacity: wash }]}>
    <Text style={[look.pauseTitle, { color: '#F3E9FF' }]}>↺ The portal ripples…</Text>
    <Copy color="#FFFFFF">{name} fades into the light. Meeting it anew…</Copy>
  </Animated.View>
}

const look = themedStyles(() => ({
  hud: { gap: 6 },
  place: { fontFamily: fonts.heavy, fontSize: 11, lineHeight: 15, color: colors.muted, letterSpacing: 0.8 },
  map: { flex: 1, minHeight: 200, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000000' },
  // The Legendary's name, height and HP, in the corner of its lair.
  status: { position: 'absolute', left: 8, top: 8, width: '52%', maxWidth: 220, gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8,
    backgroundColor: 'rgba(248, 248, 240, 0.94)', borderWidth: 2, borderColor: '#283850' },
  statusName: { color: '#303030', fontFamily: fonts.black, fontSize: 12, lineHeight: 16 },
  statusHeight: { color: '#5A6478', fontFamily: fonts.heavy, fontSize: 11 },
  hpRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hpLabel: { color: '#F8B000', fontFamily: fonts.black, fontSize: 9, lineHeight: 12, backgroundColor: '#505050', paddingHorizontal: 3, borderRadius: 2 },
  hpTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: '#505050', overflow: 'hidden' },
  hearts: { position: 'absolute', right: 10, bottom: 6, color: '#FF5A6E', fontSize: 20, lineHeight: 26, letterSpacing: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.85)', textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 } },
  message: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, color: colors.ink, minHeight: 42 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  moves: { flex: 1, gap: 6 },
  move: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: retro() ? 8 : 14,
    backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 6 },
  moveName: { flex: 1, fontFamily: fonts.heavy, color: colors.ink, fontSize: 15, lineHeight: 20 },
  moveNote: { fontFamily: fonts.bold, color: colors.muted, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] },
  ball: { backgroundColor: colors.edge, borderColor: colors.edge, borderLeftWidth: 1 },
  pause: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20,
    backgroundColor: 'rgba(4, 12, 10, 0.72)' },
  pauseTitle: { fontFamily: fonts.black, fontSize: 24, lineHeight: 30, color: '#FFFFFF', textAlign: 'center' },
  warn: { position: 'absolute', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(242, 194, 48, 0.45)', borderWidth: 2,
    borderColor: '#F2C230', borderStyle: 'dashed' },
  strike: { position: 'absolute', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(224, 72, 58, 0.65)', borderWidth: 2, borderColor: '#FFB4A8' },
  portal: { position: 'absolute', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 3,
    borderColor: '#93A196', backgroundColor: 'rgba(30, 10, 48, 0.78)' },
  portalSwirl: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(196, 150, 255, 0.75)', borderTopColor: 'transparent', borderBottomColor: 'transparent' },
  portalBar: { borderRadius: 2, backgroundColor: '#5D6B62', borderWidth: 1, borderColor: '#2C3833' },
  portalMark: { fontFamily: fonts.black, color: '#F3E9FF', textAlign: 'center' },
  portalLabel: { position: 'absolute', bottom: 2, left: 0, right: 0, textAlign: 'center', fontFamily: fonts.heavy, color: '#E6D8FF' },
  portalOpen: { borderColor: '#C3CDBF', backgroundColor: 'rgba(86, 40, 140, 0.85)', shadowColor: '#C496FF', shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  portalSwirlOpen: { borderWidth: 3, borderColor: 'rgba(230, 210, 255, 0.95)', borderTopColor: 'transparent', borderBottomColor: 'transparent' },
  ripple: { backgroundColor: 'rgba(70, 24, 120, 0.82)' },
  reveal: { position: 'absolute', left: 10, right: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: 'rgba(6, 12, 20, 0.78)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.25)' },
  revealTitle: { fontFamily: fonts.black, fontSize: 17, lineHeight: 22, color: '#FFFFFF', textAlign: 'center' }
}))
