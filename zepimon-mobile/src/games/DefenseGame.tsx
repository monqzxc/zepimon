import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Animated, Easing, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { ImageSourcePropType, ViewStyle } from 'react-native'
import { spriteSource } from '../catalog'
import { typeTheme } from '../HabitatScene'
import { Button, Copy, Eyebrow, Heading, IconButton, Panel, Title, colors, fonts, shadows, styles, themedStyles } from '../ui'
import { useGameScreen } from './fullscreen'
import { BerryIcon } from './BerryCatch'
import { LANES, PATHS, TICK, actedRecently, battleScore, battleStars, callAssist, canPlace, cardReadyAt, collectDrop, eggPerk, enemyHeading, enemyPoint, evolveUnit,
  facingToward, gridSize, unitTarget, moveOf,
  kitFor, nextForm, nextWaveIn, pauseBattle, placeUnit, placedForm, refundFor, removeUnit, resumeBattle, sendNextWave, startBattle, tickBattle } from './battle'
import type { Battle, BattleSpec, Heading as Facing, Layout } from './battle'
import { ShotSprite, StrikeSprite } from './MoveFx'
import { TrailTerrain } from './TrailTerrain'
import { trailWalkers } from '../generated/trail-walkers.js'
import { autoTeam, cardKey } from './roster'
import type { TeamCard } from './roster'
import { PixelSprite, TeamPicker } from './TeamPicker'
import { useGameLoop, useReducedMotion } from './hooks'

export type BattleResult = { won: boolean, score: number, stars: number }
// preview shows a fixed trail before the battle; initialTeam and onStart let Trail Defense levels keep one team;
// next adds a button after a win (the next level).
type Props = {
  layout: Layout, makeSpec: () => BattleSpec, title: string, intro: string, choices: TeamCard[], assists: string[],
  bonus: number, bonusNote: string, record: string, showStars?: boolean, onFinish: (result: BattleResult) => void,
  preview?: BattleSpec, initialTeam?: TeamCard[], onStart?: (team: TeamCard[]) => void, next?: { title: string, onPress: () => void }
}

// The board fits between the top bar and the card tray. Squares never shrink below MIN_CELL so they stay easy to
// tap: a map too tall for that scrolls on its own while the bar and the tray stay put.
const MIN_CELL = 36
const native = Platform.OS !== 'web'
// The battle board keeps its own colors: its terrain art is darker than the light app theme around it.
const onBoard = { ink: '#f4ebcf', gold: '#ffe08d', dark: '#071b2c' }
const fxColors = { super: onBoard.gold, berries: '#ff92af', guard: onBoard.ink, assist: onBoard.gold, leak: '#ff8a8a' }
// Walking strips (src/generated/trail-walkers.js), Normal and Shiny: two steps each facing south, north, west, east.
const walkers = trailWalkers as Record<string, ImageSourcePropType>
const facing: Record<Facing, number> = { S: 0, N: 2, W: 4, E: 6 }
const STEP_MS = 220

export function starText(stars: number) {
  return '★'.repeat(stars) + '☆'.repeat(3 - stars)
}

export function DefenseGame({ layout, makeSpec, title, intro, choices, assists, bonus, bonusNote, record, showStars = false, onFinish,
  preview, initialTeam, onStart, next }: Props) {
  const [team, setTeam] = useState(() => initialTeam?.length ? initialTeam : autoTeam(choices))
  const [helper, setHelper] = useState<string | null>(assists[0] ?? null)
  const [game, setGame] = useState<Battle | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [inspect, setInspect] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [area, setArea] = useState({ width: 0, height: 0 })
  const { full, setFull, setFill } = useGameScreen()
  const reduced = useReducedMotion()
  const current = useRef<Battle | null>(null)
  const finish = useRef(onFinish)
  useEffect(() => { finish.current = onFinish }, [onFinish])
  const update = useCallback((next: Battle | null) => {
    const previous = current.current
    if (previous === next) return
    current.current = next
    setGame(next)
    if (previous && next && ['playing', 'paused'].includes(previous.status) && ['won', 'lost'].includes(next.status)) {
      finish.current({ won: next.status === 'won', score: battleScore(next), stars: battleStars(next) })
    }
  }, [])
  const act = (change: (game: Battle) => Battle) => { if (current.current) update(change(current.current)) }
  const pause = () => act(battle => pauseBattle(battle, performance.now()))
  const resume = () => act(battle => resumeBattle(battle, performance.now()))
  useGameLoop(() => act(battle => tickBattle(battle, performance.now())), pause)
  // A running battle lays itself out to the screen; choosing a team scrolls like any page.
  const active = game !== null
  useEffect(() => {
    if (!active) return
    setFill(true)
    return () => setFill(false)
  }, [active, setFill])
  // Hints float over the board, so they clear themselves.
  useEffect(() => {
    if (!note) return
    const timer = setTimeout(() => setNote(''), 2600)
    return () => clearTimeout(timer)
  }, [note])

  function start() {
    setPicked(null); setInspect(null); setNote('')
    onStart?.(team)
    update(startBattle(makeSpec(), team, { bonus, assist: helper }, performance.now()))
  }

  if (!game) return <View style={{ gap: 14 }}>
    <Heading>{title}</Heading>
    <Copy>{intro}</Copy>
    <Panel>
      <Copy color={colors.gold}>{record}</Copy>
      <Copy small>{bonusNote}</Copy>
    </Panel>
    {preview?.layout === 'trail' && <MapPreview spec={preview} />}
    {assists.length > 0 && <Panel>
      <Eyebrow>LEGENDARY HELPER</Eyebrow>
      <Copy small>Once per battle, your Expedition friend strikes every foe on the field and slows them down.</Copy>
      <View style={styles.row}>{assists.map(name => <Button key={name} title={name} secondary={helper !== name} onPress={() => setHelper(name)} />)}</View>
    </Panel>}
    <TeamPicker layout={layout} choices={choices} team={team} onChange={setTeam} />
    <Button title={team.length ? `Start ${title}` : 'Choose at least one Pokemon'} disabled={!team.length} onPress={start} />
    <HowTo layout={layout} />
  </View>

  const spec = game.spec
  const theme = typeTheme(spec.habitat)
  const { cols, rows } = gridSize(game)
  // Lanes add a strip of sky above the board (0.7 squares) and Snorlax's row below it (0.8).
  const units = layout === 'lanes' ? rows + 1.5 : rows
  const cell = Math.min(area.width / cols, Math.max(area.height / units, MIN_CELL))
  const fieldWidth = cols * cell
  const top = layout === 'lanes' ? cell * 0.7 : 0
  const height = top + rows * cell + (layout === 'lanes' ? cell * 0.8 : 0)
  const scrolls = height > area.height + 0.5
  // Where the board shows inside its area, for the pause screen to cover just the board.
  const shown = { left: (area.width - fieldWidth) / 2, top: Math.max(0, (area.height - height) / 2), width: fieldWidth, height: Math.min(height, area.height) }
  const playing = game.status === 'playing'
  const over = game.status === 'won' || game.status === 'lost'
  const wait = nextWaveIn(game)
  const pathCells = layout === 'trail' ? PATHS[spec.path].cells : null
  const selected = game.units.find(unit => unit.id === inspect)
  const guards = game.guards.filter(Boolean).length
  const pickedCard = game.team.find(card => cardKey(card) === picked)
  const pickedForm = pickedCard && placedForm(game, pickedCard)
  const hint = pickedForm ? `${pickedForm} · ${kitFor(pickedForm, layout).label} — now tap a free square`
    : `Tap a card, then a free square${layout === 'trail' ? ' beside the trail' : ''}`
  const status = over ? 'Battle over.' : game.status === 'paused' ? 'Paused.'
    : wait !== null ? `${game.wave ? 'Next wave' : 'First wave'} in ${Math.ceil(wait / 1000)}s${game.wave ? '' : ' — place your team!'}`
    : game.spawns.length ? 'A wave is arriving!' : 'The last foes are on the field!'

  function pressCell(col: number, row: number) {
    const battle = current.current
    if (!battle) return
    const unit = battle.units.find(item => item.col === col && item.row === row)
    if (unit) { setPicked(null); setInspect(unit.id); setNote(''); return }
    setInspect(null)
    if (!picked) { setNote('Choose a Pokemon card below, then tap a free square.'); return }
    const card = battle.team.find(item => cardKey(item) === picked)!
    const next = placeUnit(battle, picked, col, row)
    if (next !== battle) {
      update(next)
      setNote('')
      if (layout === 'lanes') setPicked(null)
      return
    }
    const cost = kitFor(placedForm(battle, card), layout).cost
    setNote(battle.status !== 'playing' ? 'Resume the battle to place Pokemon.' : !canPlace(battle, col, row) ? (pathCells?.has(col + ',' + row) ? 'Pokemon stand beside the trail, not on it.' : 'That square is taken.')
      : cardReadyAt(battle, card) > battle.elapsed ? `${card.name} is recharging.` : `You need ◉ ${cost - battle.berries} more berries.`)
  }

  // The top bar and the card tray stay on screen; only an oversized board scrolls between them.
  return <View style={play.root}>
    <View style={play.bar}>
      <View style={play.barRow}>
        <View style={play.stats}>
          <Stat label="BERRIES" value={`◉ ${game.berries}`} spoken={`${game.berries} berries`} />
          <Stat label="WAVE" value={`${Math.max(1, game.wave)}/${spec.waves}`} spoken={`Wave ${Math.max(1, game.wave)} of ${spec.waves}`} />
          {layout === 'lanes' ? <Stat label="SNORLAX" value={`${guards}/${LANES}`} spoken={`${guards} of ${LANES} Snorlax awake`} />
            : <Stat label="LIVES" value={`♥ ${game.lives}`} spoken={`${game.lives} lives`} />}
        </View>
        {!over && <IconButton name={playing ? 'pause' : 'resume'} label={playing ? 'Pause' : 'Resume battle'} size={40} onPress={playing ? pause : resume} />}
        <IconButton name={full ? 'fullscreenExit' : 'fullscreen'} label={full ? 'Exit full screen' : 'Full screen'} size={40} onPress={() => setFull(!full)} />
      </View>
      <Text numberOfLines={1} style={play.status}>{status}</Text>
    </View>

    {/* The area takes whatever the bar and the tray leave. Its contents are all absolutely placed, so they never
        stretch it: a board measured in full screen would otherwise keep the area that tall after leaving it. */}
    <View style={play.area} onLayout={event => { const { width, height } = event.nativeEvent.layout; setArea({ width, height }) }}>
      {area.width > 0 && <ScrollView style={StyleSheet.absoluteFill} scrollEnabled={scrolls} nestedScrollEnabled showsVerticalScrollIndicator={scrolls}
        contentContainerStyle={{ minHeight: area.height, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[board.field, { width: fieldWidth, height, backgroundColor: theme.sky }]}>
        {layout === 'trail' && <TrailTerrain path={spec.path} cell={cell} theme={theme} />}
        {layout === 'trail' && selected && <View pointerEvents="none" style={[board.range, {
          left: (selected.col + 0.5 - kitFor(selected.name, layout).range) * cell, top: (selected.row + 0.5 - kitFor(selected.name, layout).range) * cell,
          width: kitFor(selected.name, layout).range * 2 * cell, height: kitFor(selected.name, layout).range * 2 * cell,
          borderRadius: kitFor(selected.name, layout).range * cell }]} />}
        {Array.from({ length: cols * rows }, (_, index) => {
          const col = index % cols, row = Math.floor(index / cols)
          const onPath = !!pathCells?.has(col + ',' + row)
          const unit = game.units.find(item => item.col === col && item.row === row)
          const free = !!picked && playing && !unit && !onPath
          const where = layout === 'lanes' ? `Lane ${col + 1}, row ${row + 1}` : `Column ${col + 1}, row ${row + 1}`
          return <Pressable key={index} disabled={onPath} onPress={() => pressCell(col, row)}
            accessibilityRole="button" accessibilityState={{ disabled: onPath, selected: unit?.id === inspect }}
            accessibilityLabel={`${where}: ${unit ? `${unit.name}, ${Math.ceil(unit.hp / unit.maxHp * 100)}% health` : onPath ? 'trail' : 'empty'}`}
            style={[board.cell, { left: col * cell, top: top + row * cell, width: cell, height: cell,
              backgroundColor: layout === 'trail' ? 'transparent' : (col + row) % 2 ? theme.ground : theme.near },
              free && board.free, unit?.id === inspect && board.inspected]}>
            {unit && <>
              <View style={[board.shadow, { width: cell * 0.46, height: cell * 0.1, borderRadius: cell, bottom: cell * 0.14 }]} />
              <Ally unit={unit} game={game} size={cell * 0.82} reduced={reduced} />
              {unit.hp < unit.maxHp && <Health ratio={unit.hp / unit.maxHp} width={cell * 0.7} />}
              {unit.egg && <Text accessible={false} style={board.egg}>EGG</Text>}
            </>}
          </Pressable>
        })}
        {layout === 'lanes' && game.guards.map((awake, lane) => <View key={lane} pointerEvents="none"
          style={[board.snorlax, { left: lane * cell, top: top + rows * cell, width: cell, height: cell * 0.8, opacity: awake ? 1 : 0.25 }]}>
          <PixelSprite name="Snorlax" size={cell * 0.7} />
        </View>)}
        {game.strikes.filter(strike => strike.kind === 'wave').map(strike => <Mover key={strike.id} x={strike.x * cell} y={top + strike.y * cell} size={0} reduced={reduced}>
          <StrikeSprite strike={strike} elapsed={game.elapsed} cell={cell} reduced={reduced} />
        </Mover>)}
        {game.enemies.map(enemy => {
          const at = enemyPoint(game, enemy)
          const size = cell * (enemy.boss ? 1.25 : 0.9)
          const slowed = enemy.slowUntil > game.elapsed
          // Two-step walk cycle from the game clock, offset per foe so a wave does not march in lockstep.
          const step = reduced ? 0 : (Math.floor(game.elapsed / (slowed ? STEP_MS * 2 : STEP_MS)) + enemy.id) % 2
          return <Mover key={enemy.id} x={at.x * cell - size / 2} y={top + at.y * cell - size / 2} size={size} reduced={reduced}>
            <Foe name={enemy.name} size={size} ratio={enemy.hp / enemy.maxHp} boss={enemy.boss} slowed={slowed}
              poisoned={enemy.poisonUntil > game.elapsed} heading={enemyHeading(game, enemy)} step={step} />
          </Mover>
        })}
        {game.shots.map(shot => <Mover key={shot.id} x={shot.x * cell} y={top + shot.y * cell} size={0} reduced={reduced}>
          <ShotSprite shot={shot} game={game} cell={cell} reduced={reduced} />
        </Mover>)}
        {game.strikes.filter(strike => strike.kind !== 'wave').map(strike => <Mover key={strike.id} x={strike.x * cell} y={top + strike.y * cell} size={0} reduced={reduced}>
          <StrikeSprite strike={strike} elapsed={game.elapsed} cell={cell} reduced={reduced} />
        </Mover>)}
        {game.drops.map(drop => <Pressable key={drop.id} accessibilityRole="button" accessibilityLabel={`Collect ${drop.value} berries`}
          hitSlop={8} onPress={() => act(battle => collectDrop(battle, drop.id))}
          style={[board.drop, { left: drop.col * cell + cell * 0.38, top: top + drop.row * cell - cell * 0.02, width: cell * 0.62, height: cell * 0.62 }]}>
          <BerryIcon />
        </Pressable>)}
        {game.effects.map(fx => <Text key={fx.id} pointerEvents="none" accessible={false}
          style={[board.fx, { left: fx.x * cell - cell, top: top + fx.y * cell - cell * 0.6, width: cell * 2, color: fxColors[fx.kind],
            fontSize: fx.kind === 'guard' || fx.kind === 'assist' ? 22 : 16 }]}>{fx.text}</Text>)}
      </View>
      </ScrollView>}
      {!!note && <View pointerEvents="none" style={play.note}><Text accessibilityLiveRegion="polite" style={play.noteText}>{note}</Text></View>}
      {/* Details float over the half of the board away from the Pokemon you tapped. */}
      {selected && <UnitPanel unit={selected} layout={layout} playing={playing} berries={game.berries}
        style={selected.row >= rows / 2 ? { top: 8 } : { bottom: 8 }}
        onEvolve={() => act(battle => evolveUnit(battle, selected.id))}
        onRelease={() => { act(battle => removeUnit(battle, selected.id)); setInspect(null) }} onClose={() => setInspect(null)} />}
      {game.status === 'paused' && <View style={[play.scrim, shown]}>
        <View style={play.sheet}>
          <Title>Paused</Title>
          <Copy small>Your team, berries and the next wave are waiting.</Copy>
          <Button title="Resume battle" onPress={resume} />
        </View>
      </View>}
      {over && <View style={[play.scrim, StyleSheet.absoluteFill]}><ScrollView contentContainerStyle={play.scrimScroll}>
        <View style={[play.sheet, { borderColor: colors.star, borderWidth: 1.5 }]}>
          <Heading>{game.status === 'won' ? 'Victory!' : layout === 'lanes' ? 'A foe slipped past Snorlax.' : 'The trail was overrun.'}</Heading>
          <Copy color={colors.ink}>{game.status === 'won' ? `All ${spec.waves} waves cleared.` : `You cleared ${battleScore(game)} of ${spec.waves} waves.`} {game.defeated} Shadow Pokemon calmed.</Copy>
          {showStars && <Text accessibilityLabel={`${battleStars(game)} of 3 stars`} style={board.stars}>{starText(battleStars(game))}</Text>}
          {game.status === 'won' && next && <Button title={next.title} onPress={next.onPress} />}
          <Button title="Play again" secondary={game.status === 'won' && !!next} onPress={start} />
          <Button title="Change team" secondary onPress={() => update(null)} />
        </View>
      </ScrollView></View>}
    </View>

    {!over && <View style={play.tray}>
      <Text numberOfLines={1} style={play.hint}>{hint}</Text>
      <View style={play.cards}>{game.team.map(card => {
        const key = cardKey(card)
        const form = placedForm(game, card)
        const kit = kitFor(form, layout)
        const recharge = Math.max(0, cardReadyAt(game, card) - game.elapsed)
        const ready = playing && !recharge && game.berries >= kit.cost
        return <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: picked === key, disabled: !playing }} disabled={!playing}
          accessibilityLabel={`${form}, ${kit.label}, ${kit.cost} berries${recharge ? `, recharging for ${Math.ceil(recharge / 1000)} seconds` : game.berries < kit.cost ? ', not enough berries yet' : ''}`}
          onPress={() => { setInspect(null); setNote(''); setPicked(picked === key ? null : key) }}
          style={({ pressed }) => [play.card, picked === key && play.picked, { opacity: pressed ? 0.7 : ready ? 1 : 0.5 }]}>
          <PixelSprite name={form} shiny={card.shiny} size={34} />
          <Text numberOfLines={1} style={play.cost}>{recharge ? `${Math.ceil(recharge / 1000)}s` : `◉ ${kit.cost}`}</Text>
        </Pressable>
      })}</View>
      {/* Always laid out, so the board does not jump when a button comes and goes. */}
      {(layout === 'trail' || game.assist) && <View style={play.actions}>
        {layout === 'trail' && <SmallButton title="Send next wave · +◉ 10" disabled={!playing || wait === null || wait <= 1000} onPress={() => act(sendNextWave)} />}
        {game.assist && <SmallButton primary title={game.assist.used ? `${game.assist.name} helped!` : `Call ${game.assist.name}`}
          disabled={!playing || game.assist.used} onPress={() => act(callAssist)} />}
      </View>}
    </View>}
  </View>
}

function HowTo({ layout }: { layout: Layout }) {
  return <Panel>
    <Eyebrow>HOW TO PLAY</Eyebrow>
    {layout === 'lanes' ? <>
      <Copy small>Tap a card, then a free square. Shadow Pokemon walk down the five lanes and stop to nibble the first Pokemon in their way.</Copy>
      <Copy small>Grass types grow berries: tap them to collect. Rock, Ground and Steel types block. Everyone else attacks foes above them in their lane.</Copy>
      <Copy small>If a foe reaches the bottom, that lane’s Snorlax wakes up once and rolls it away. A second breach in the same lane ends the battle.</Copy>
    </> : <>
      <Copy small>Tap a card, then a free square beside the trail. Each Pokemon attacks foes within its range; defeated foes pay berries.</Copy>
      <Copy small>Every family starts at its first stage. Tap a placed Pokemon to evolve it with berries, all the way to its final stage.</Copy>
      <Copy small>Foes that reach the end of the trail cost a life (a boss costs three). Keep all ten for three stars.</Copy>
    </>}
    <Copy small>Type matchups matter: super-effective hits do double damage and show ×2.</Copy>
    <Copy small>Pokemon hatched on your watch are marked EGG and know their family’s real egg moves: an extra attack type, harder hits or more health, a bigger harvest for Grass types, or extra health for blockers. Loaners and Safari catches have none.</Copy>
    <Copy small>Switching tabs or leaving the app pauses the battle. Returning to the arcade ends it.</Copy>
  </Panel>
}

// A small, still picture of the trail so players can see the map before choosing a team.
function MapPreview({ spec }: { spec: BattleSpec }) {
  const { cols, rows, name } = PATHS[spec.path]
  const theme = typeTheme(spec.habitat)
  const cell = Math.min(18, 162 / cols, 240 / rows)
  return <Panel>
    <Eyebrow>THE MAP · {cols} × {rows} · {theme.label.toUpperCase()}</Eyebrow>
    <View accessible accessibilityLabel={`Map of ${name}: ${cols} by ${rows} squares`}
      style={[board.field, { alignSelf: 'center', width: cols * cell, height: rows * cell, backgroundColor: theme.sky }]}>
      <TrailTerrain path={spec.path} cell={cell} theme={theme} />
    </View>
    <Copy small>Foes leave the cave and follow the trail to the Poke Ball.</Copy>
  </Panel>
}

// A compact counter in the battle's top bar.
function Stat({ label, value, spoken }: { label: string, value: string, spoken: string }) {
  return <View accessible accessibilityLabel={spoken}>
    <Text style={play.statLabel}>{label}</Text>
    <Text style={play.statValue}>{value}</Text>
  </View>
}

// A pill button small enough for the card tray and the floating details panel.
function SmallButton({ title, onPress, primary = false, disabled = false }: { title: string, onPress: () => void, primary?: boolean, disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [play.button, primary ? play.primary : play.secondary, { opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }]}>
    <Text numberOfLines={1} style={[play.buttonText, primary && { color: colors.onEdge }]}>{title}</Text>
  </Pressable>
}

function Health({ ratio, width }: { ratio: number, width: number }) {
  return <View style={[board.health, { width }]}>
    <View style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%`, height: '100%', backgroundColor: ratio > 0.5 ? '#7ddc6b' : ratio > 0.25 ? onBoard.gold : '#ff6b5b' }} />
  </View>
}

// Moves smoothly from the previous position to the new one over one game step. Reduced motion jumps instead.
function Mover({ x, y, size, reduced, children }: { x: number, y: number, size: number, reduced: boolean, children: ReactNode }) {
  const [position] = useState(() => new Animated.ValueXY({ x, y }))
  useEffect(() => {
    if (reduced) { position.setValue({ x, y }); return }
    const move = Animated.timing(position, { toValue: { x, y }, duration: TICK, easing: Easing.linear, useNativeDriver: native })
    move.start()
    return () => move.stop()
  }, [position, x, y, reduced])
  return <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, transform: position.getTranslateTransform() }}>
    {children}
  </Animated.View>
}

// One frame of a walking strip: the 8-frame row is clipped to a single square. A tint repaints the visible pixels.
function Strip({ source, size, frame, tint }: { source: ImageSourcePropType, size: number, frame: number, tint?: string }) {
  const style = { position: 'absolute' as const, top: 0, left: -frame * size, width: size * 8, height: size,
    ...(Platform.OS === 'web' ? { imageRendering: 'pixelated' } : {}) }
  return <View style={{ width: size, height: size, overflow: 'hidden' }}>
    <Image source={source} resizeMode="stretch" fadeDuration={0} style={style} />
    {!!tint && <Image source={source} resizeMode="stretch" fadeDuration={0} style={[style, { tintColor: tint, opacity: 0.55 }]} />}
  </View>
}

// Shadow Pokemon are the normal strip under a dark tint, facing the way they walk; forms without walking art stay still.
const Foe = memo(function Foe({ name, size, ratio, boss, slowed, poisoned, heading, step }: {
  name: string, size: number, ratio: number, boss: boolean, slowed: boolean, poisoned: boolean, heading: Facing, step: number
}) {
  const strip = walkers[name]
  const sprite = { width: size, height: size, ...(Platform.OS === 'web' ? { imageRendering: 'pixelated' } : {}) }
  return <View style={{ width: size, height: size, alignItems: 'center' }}>
    <View style={[board.shadow, { width: size * 0.5, height: size * 0.11, borderRadius: size, bottom: size * 0.04 }]} />
    {strip ? <Strip source={strip} size={size} frame={facing[heading] + step} tint="#2a1240" /> : <>
      <Image source={spriteSource(name)} resizeMode="contain" fadeDuration={0} style={sprite} />
      <Image source={spriteSource(name)} resizeMode="contain" fadeDuration={0} style={[sprite, { position: 'absolute', tintColor: '#2a1240', opacity: 0.55 }]} />
    </>}
    <View style={{ position: 'absolute', bottom: 0 }}><Health ratio={ratio} width={size * 0.7} /></View>
    {boss && <Text style={board.boss}>BOSS</Text>}
    {(slowed || poisoned) && <Text style={board.status}>{slowed ? '❄' : ''}{poisoned ? '☠' : ''}</Text>}
  </View>
})

// Your Pokemon turn to face the foe they attack (or face you while idle), step in place - faster when a foe is in
// range - and lunge toward the target right after attacking. Growers hop when they harvest. Reduced motion holds still.
const lungeOffset: Record<Facing, [number, number]> = { E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1] }
function Ally({ unit, game, size, reduced }: { unit: Battle['units'][number], game: Battle, size: number, reduced: boolean }) {
  const target = unitTarget(game, unit)
  const heading: Facing = target ? facingToward({ x: unit.col + 0.5, y: unit.row + 0.5 }, enemyPoint(game, target)) : 'S'
  const step = reduced ? 0 : (Math.floor(game.elapsed / (target ? STEP_MS : STEP_MS * 2)) + unit.id) % 2
  const acted = !reduced && actedRecently(game, unit)
  const [dx, dy] = !acted ? [0, 0] : target ? lungeOffset[heading] : [0, -1]
  return <AllySprite name={unit.name} shiny={unit.shiny} size={size} frame={facing[heading] + step} dx={dx * size * 0.1} dy={dy * size * 0.1} />
}
const AllySprite = memo(function AllySprite({ name, shiny, size, frame, dx, dy }: { name: string, shiny: boolean, size: number, frame: number, dx: number, dy: number }) {
  const strip = walkers[(shiny ? 'Shiny ' : '') + name]
  return <View style={{ width: size, height: size, transform: [{ translateX: dx }, { translateY: dy }] }}>
    {strip ? <Strip source={strip} size={size} frame={frame} /> : <PixelSprite name={name} shiny={shiny} size={size} />}
  </View>
})

function UnitPanel({ unit, layout, playing, berries, style, onEvolve, onRelease, onClose }: {
  unit: Battle['units'][number], layout: Layout, playing: boolean, berries: number, style: ViewStyle,
  onEvolve: () => void, onRelease: () => void, onClose: () => void
}) {
  const kit = kitFor(unit.name, layout)
  const next = nextForm(unit)
  const perk = eggPerk(unit.name, layout)
  const move = moveOf(unit.name, layout)
  return <View style={[play.floating, style]}>
    <View style={[styles.row, { flexWrap: 'nowrap' }]}>
      <PixelSprite name={unit.name} shiny={unit.shiny} size={44} />
      <View style={{ flex: 1 }}>
        <Title>{unit.shiny ? 'Shiny ' : ''}{unit.name}</Title>
        <Copy small>{kit.label}{move ? ` · ${move}` : ''}{unit.egg && perk?.kind === 'coverage' ? ` or ${perk.move}` : ''} · Health {Math.ceil(unit.hp)} / {unit.maxHp}{layout === 'trail' && !next ? ' · Fully evolved' : ''}</Copy>
      </View>
    </View>
    <Copy small color={unit.egg && perk ? colors.gold : colors.muted}>{!unit.egg ? 'No egg moves: only Pokemon hatched on your watch know them.'
      : perk ? `Hatched from an egg · Egg move ${perk.move}: ${perk.text}.` : 'Hatched from an egg, but this family has no Gen II–IV egg moves.'}</Copy>
    <View style={play.actions}>
      {layout === 'trail' && next && <SmallButton primary title={`Evolve to ${next.name} · ◉ ${next.cost}`} disabled={!playing || berries < next.cost} onPress={onEvolve} />}
      <SmallButton title={`Release · +◉ ${refundFor(unit)}`} disabled={!playing} onPress={onRelease} />
      <SmallButton title="Close" onPress={onClose} />
    </View>
  </View>
}

const board = themedStyles(() => ({
  field: { borderRadius: 16, overflow: 'hidden', ...shadows.card },
  cell: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  free: { borderWidth: 1, borderColor: 'rgba(255, 224, 141, 0.45)', backgroundColor: 'rgba(255, 224, 141, 0.12)' },
  shadow: { position: 'absolute', backgroundColor: 'rgba(2, 16, 27, 0.22)' },
  range: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(84, 199, 196, 0.85)', backgroundColor: 'rgba(84, 199, 196, 0.14)' },
  inspected: { borderWidth: 2, borderColor: onBoard.gold },
  snorlax: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  health: { position: 'absolute', bottom: 2, height: 4, backgroundColor: 'rgba(7, 27, 44, 0.8)', borderRadius: 2, overflow: 'hidden' },
  drop: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  fx: { position: 'absolute', textAlign: 'center', fontFamily: fonts.black, textShadowColor: onBoard.dark, textShadowRadius: 3, textShadowOffset: { width: 1, height: 1 } },
  boss: { position: 'absolute', top: -2, fontSize: 10, fontFamily: fonts.black, color: onBoard.dark, backgroundColor: onBoard.gold, paddingHorizontal: 5, borderRadius: 999, overflow: 'hidden' },
  status: { position: 'absolute', top: 0, right: 0, fontSize: 12 },
  egg: { position: 'absolute', top: 2, left: 2, fontSize: 8, fontFamily: fonts.black, color: onBoard.dark, backgroundColor: onBoard.gold, paddingHorizontal: 3, borderRadius: 999, overflow: 'hidden' },
  stars: { color: colors.star, fontSize: 26, letterSpacing: 4 }
}))

// The running battle's screen: a top bar, the board area (with anything that floats over it) and the card tray.
const play = themedStyles(() => ({
  root: { flex: 1, gap: 8 },
  bar: { backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 8, gap: 4, ...shadows.card },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stats: { flex: 1, flexDirection: 'row', gap: 16, paddingLeft: 4 },
  statLabel: { fontFamily: fonts.heavy, color: colors.muted, fontSize: 10, lineHeight: 13, letterSpacing: 0.8 },
  statValue: { fontFamily: fonts.black, color: colors.ink, fontSize: 17, lineHeight: 22 },
  status: { fontFamily: fonts.bold, color: colors.muted, fontSize: 13, lineHeight: 18, paddingHorizontal: 2 },
  area: { flex: 1, minHeight: 160 },
  note: { position: 'absolute', top: 8, left: 12, right: 12, alignItems: 'center' },
  noteText: { overflow: 'hidden', textAlign: 'center', fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: '#FFFFFF',
    backgroundColor: 'rgba(31, 42, 54, 0.88)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  scrim: { position: 'absolute', backgroundColor: 'rgba(31, 42, 54, 0.45)', borderRadius: 16, justifyContent: 'center', padding: 12 },
  scrimScroll: { flexGrow: 1, justifyContent: 'center' },
  sheet: { backgroundColor: colors.panel, borderRadius: 20, padding: 16, gap: 10, ...shadows.card },
  floating: { position: 'absolute', left: 8, right: 8, backgroundColor: colors.panel, borderRadius: 18, borderWidth: 1, borderColor: colors.line,
    padding: 12, gap: 8, boxShadow: '0px 8px 24px rgba(31, 61, 89, 0.22)' },
  tray: { backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: 18, padding: 8, gap: 6,
    boxShadow: '0px -2px 16px rgba(31, 61, 89, 0.10)' },
  hint: { fontFamily: fonts.heavy, color: colors.edge, fontSize: 12, lineHeight: 16, paddingHorizontal: 4 },
  cards: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  card: { flex: 1, maxWidth: 76, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 1, paddingVertical: 4,
    borderWidth: 1.5, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.panel },
  picked: { borderColor: colors.edge, borderWidth: 2.5, backgroundColor: colors.mint },
  cost: { color: colors.ink, fontFamily: fonts.heavy, fontSize: 12, lineHeight: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  button: { flexGrow: 1, minHeight: 40, borderRadius: 999, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: colors.edge },
  secondary: { backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.line },
  buttonText: { fontFamily: fonts.heavy, fontSize: 13, lineHeight: 17, color: colors.edge }
}))
