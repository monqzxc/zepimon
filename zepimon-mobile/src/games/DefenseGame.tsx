import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Animated, Easing, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { ImageSourcePropType, ViewStyle } from 'react-native'
import { spriteSource } from '../catalog'
import { typeTheme } from '../HabitatScene'
import { Button, Copy, Heading, IconButton, Title, colors, fonts, shadows, styles, themedStyles } from '../ui'
import { useGameScreen } from './fullscreen'
import { BerryIcon } from './BerryCatch'
import { EVOLVE_MS, LANES, bossCharging, conditionsOf, untouchable, PATHS, TICK, WEATHER, WEATHER_POWER, WEATHER_WEAK, tileAt, unitWeather, actedRecently, battleScore, battleStars, callAssist, canPlace, cardReadyAt, collectDrop, eggPerk, enemyHeading, enemyPoint, evolveUnit,
  facingToward, gridSize, unitTarget, moveOf,
  kitFor, nextForm, nextWaveIn, pauseBattle, placeUnit, placedForm, refundFor, removeUnit, resumeBattle, sendNextWave, startBattle, tickBattle } from './battle'
import type { Battle, BattleSpec, Heading as Facing, Layout, Weather } from './battle'
import { ShotSprite, StrikeSprite } from './MoveFx'
import { AssistMove } from './AssistMove'
import { TrailTerrain } from './TrailTerrain'
import { trailWalkers } from '../generated/trail-walkers.js'
import { autoTeam, battleType, cardKey } from './roster'
import type { TeamCard } from './roster'
import { PixelSprite } from './TeamPicker'
import { suggestTeam } from './suggest'
import { ZoomPan } from './ZoomPan'
import { EvolveFx, Impact } from './BattleFx'
import { WeatherLayer } from './Weather'
import { BattleBrief } from './BattleBrief'
import type { Brief } from './BattleBrief'
import { BOSS_CHARGE, SKILL_MARKS, SKILL_TEXT } from './boss'
import { CONDITIONS, ORDER, inflictText } from './status'
import type { Condition } from './status'
import { useGameLoop, useReducedMotion } from './hooks'

export type BattleResult = { won: boolean, score: number, stars: number }
// preview shows a fixed trail before the battle; initialTeam and onStart let Trail Defense levels keep one team;
// next adds a button after a win (the next level).
type Props = {
  layout: Layout, makeSpec: () => BattleSpec, brief: Brief, choices: TeamCard[], assists: string[],
  bonus: number, showStars?: boolean, onFinish: (result: BattleResult) => void,
  preview?: BattleSpec, initialTeam?: TeamCard[], onStart?: (team: TeamCard[]) => void, next?: { title: string, onPress: () => void }
}

// The board fits between the top bar and the card tray. Squares never shrink below MIN_CELL so they stay easy to
// tap: a map too tall for that scrolls on its own while the bar and the tray stay put.
const MIN_CELL = 36
// Trail Defense draws its squares at least this big, so zooming in stays crisp, and zooms in as far as MAX_CELL.
const DRAWN_CELL = 48, MAX_CELL = 68
const label = (type: string) => type[0].toUpperCase() + type.slice(1)
// "Harsh sunlight: Fire foes are tougher."
const types = (list: string[]) => list.map(label).join(', ')
const weatherLine = (weather: Weather) => `${WEATHER[weather].name}: ${types(WEATHER[weather].types)} foes tougher · your ${types(WEATHER[weather].types)} ▲, ${types(WEATHER[weather].weakens)} ▼`
// What the weather does to your Pokemon, for the level's panel and a Pokemon's details.
const POWER_UP = Math.round((WEATHER_POWER - 1) * 100), POWER_DOWN = Math.round((1 - WEATHER_WEAK) * 100)
const native = Platform.OS !== 'web'
// The battle board keeps its own colors: its terrain art is darker than the light app theme around it.
const onBoard = { ink: '#f4ebcf', gold: '#ffe08d', dark: '#071b2c' }
const fxColors = { super: onBoard.gold, berries: '#ff92af', guard: onBoard.ink, assist: onBoard.gold, leak: '#ff8a8a', boss: '#ff8c42', hurt: '#ff6b6b',
  heal: '#7ef29a', status: '#ffffff' }
// Walking strips (src/generated/trail-walkers.js), Normal and Shiny: two steps each facing south, north, west, east.
const walkers = trailWalkers as Record<string, ImageSourcePropType>
const facing: Record<Facing, number> = { S: 0, N: 2, W: 4, E: 6 }
const STEP_MS = 220

export function starText(stars: number) {
  return '★'.repeat(stars) + '☆'.repeat(3 - stars)
}

export function DefenseGame({ layout, makeSpec, brief, choices, assists, bonus, showStars = false, onFinish,
  preview, initialTeam, onStart, next }: Props) {
  // A level suggests a team for its map and foes (src/games/suggest.ts); one with element tiles starts on it.
  const suggestion = useMemo(() => preview ? suggestTeam(choices, preview) : undefined, [preview, choices])
  const [team, setTeam] = useState(() => initialTeam?.length ? initialTeam
    : suggestion && preview && PATHS[preview.path].tiles.size ? suggestion.team : autoTeam(choices))
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
  // The Legendary's move plays over the board once, when it answers the call (src/games/AssistMove.tsx).
  const [answer, setAnswer] = useState<{ name: string, id: number } | null>(null)
  const endAnswer = useCallback(() => setAnswer(null), [])
  const callFriend = () => {
    const before = current.current
    act(callAssist)
    if (before?.assist && !before.assist.used && before.status === 'playing') setAnswer({ name: before.assist.name, id: Date.now() })
  }
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

  if (!game) return <BattleBrief layout={layout} brief={brief} preview={preview} bonus={bonus} assists={assists} helper={helper} onHelper={setHelper}
    choices={choices} team={team} onTeam={setTeam} suggestion={suggestion} onStart={start} />

  const spec = game.spec
  const theme = typeTheme(spec.habitat)
  const { cols, rows } = gridSize(game)
  // Lanes add a strip of sky above the board (0.7 squares) and Snorlax's row below it (0.8).
  const units = layout === 'lanes' ? rows + 1.5 : rows
  // Route Guard's board fits as it always has (a tall one scrolls). Trail Defense draws its board once at a crisp size
  // and puts a camera over it (src/games/ZoomPan.tsx): it opens at the size it always had, and pinches out to the whole
  // map or in to big squares.
  const sized = Math.min(area.width / cols, Math.max(area.height / units, MIN_CELL))
  const cell = layout === 'trail' ? Math.max(sized, DRAWN_CELL) : sized
  const zoom = { start: sized / cell, least: Math.min(area.width / cols, area.height / units) / cell, most: Math.max(1, MAX_CELL / cell) }
  const fieldWidth = cols * cell
  const top = layout === 'lanes' ? cell * 0.7 : 0
  const height = top + rows * cell + (layout === 'lanes' ? cell * 0.8 : 0)
  const scrolls = height > area.height + 0.5
  // Where the board shows inside its area, for the pause screen to cover just the board.
  const shown = layout === 'trail' ? { left: 0, top: 0, width: area.width, height: area.height }
    : { left: (area.width - fieldWidth) / 2, top: Math.max(0, (area.height - height) / 2), width: fieldWidth, height: Math.min(height, area.height) }
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
  // A boss's move takes over the status line while it charges and just after: what is coming, then what it did.
  const boss = game.enemies.find(enemy => enemy.boss)
  const charging = boss && bossCharging(game, boss)
  const used = boss?.lastSkill && game.elapsed - boss.lastSkill.at < 2500 ? boss.lastSkill : null
  const status = over ? 'Battle over.' : game.status === 'paused' ? 'Paused.'
    : boss && charging ? `${boss.name} is charging ${charging.move}…`
    : boss && used ? `${boss.name} used ${used.move}: ${SKILL_TEXT[used.skill]}!`
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
    const tile = tileAt(battle, col, row)
    setNote(battle.status !== 'playing' ? 'Resume the battle to place Pokemon.' : !canPlace(battle, col, row) ? (pathCells?.has(col + ',' + row) ? 'Pokemon stand beside the trail, not on it.' : 'That square is taken.')
      : tile && !canPlace(battle, col, row, placedForm(battle, card)) ? `Only ${label(tile)} Pokemon can stand on ${label(tile)} tiles.`
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
      <Text numberOfLines={2} style={play.status}>{status}</Text>
      {spec.weather && <Text numberOfLines={2} style={play.weather}>{WEATHER[spec.weather].mark} {weatherLine(spec.weather)}</Text>}
    </View>

    {/* The area takes whatever the bar and the tray leave. Its contents are all absolutely placed, so they never
        stretch it: a board measured in full screen would otherwise keep the area that tall after leaving it. */}
    <View style={play.area} onLayout={event => { const { width, height } = event.nativeEvent.layout; setArea({ width, height }) }}>
      {area.width > 0 && <BoardFrame camera={layout === 'trail'} area={area} width={fieldWidth} height={height} zoom={zoom} scrolls={scrolls} reduced={reduced}>
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
          const tile = tileAt(game, col, row)
          // With a card picked, only squares it may take light up; element tiles of another type dim.
          const fits = !pickedForm || tile === null || battleType(pickedForm) === tile
          const free = !!picked && playing && !unit && !onPath && fits
          const where = (layout === 'lanes' ? `Lane ${col + 1}, row ${row + 1}` : `Column ${col + 1}, row ${row + 1}`) + (tile ? `, ${label(tile)} tile` : '')
          return <Pressable key={index} disabled={onPath} onPress={() => pressCell(col, row)}
            accessibilityRole="button" accessibilityState={{ disabled: onPath, selected: unit?.id === inspect }}
            accessibilityLabel={`${where}: ${unit ? `${unit.name}, ${Math.ceil(unit.hp / unit.maxHp * 100)}% health${skyNote(unitWeather(spec.weather, unit.name, layout))}${(unit.stunnedUntil ?? 0) > game.elapsed ? ', stunned' : ''}` : onPath ? 'trail' : 'empty'}`}
            style={[board.cell, { left: col * cell, top: top + row * cell, width: cell, height: cell,
              backgroundColor: layout === 'trail' ? 'transparent' : (col + row) % 2 ? theme.ground : theme.near },
              free && board.free, !!picked && !unit && !fits && board.blocked, unit?.id === inspect && board.inspected]}>
            {unit && <>
              <View style={[board.shadow, { width: cell * 0.46, height: cell * 0.1, borderRadius: cell, bottom: cell * 0.14 }]} />
              <Ally unit={unit} game={game} size={cell * 0.82} reduced={reduced} />
              {unit.hp < unit.maxHp && <Health ratio={unit.hp / unit.maxHp} width={cell * 0.7} />}
              {unit.egg && <Text accessible={false} style={board.egg}>EGG</Text>}
              <WeatherArrow sky={unitWeather(spec.weather, unit.name, layout)} size={cell} />
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
          // Its conditions, strongest first, with the Toxic role's poison among them.
          const held = conditionsOf(game, enemy)
          const conditions = enemy.poisonUntil > game.elapsed && !held.includes('poison') ? ORDER.filter(item => item === 'poison' || held.includes(item)) : held
          // Two-step walk cycle from the game clock, offset per foe so a wave does not march in lockstep. Frozen or
          // asleep, it holds still.
          const still = reduced || conditions.includes('freeze') || conditions.includes('sleep')
          const step = still ? 0 : (Math.floor(game.elapsed / (slowed ? STEP_MS * 2 : STEP_MS)) + enemy.id) % 2
          return <Mover key={enemy.id} x={at.x * cell - size / 2} y={top + at.y * cell - size / 2} size={size} reduced={reduced}>
            <Foe name={enemy.name} size={size} ratio={enemy.hp / enemy.maxHp} boss={enemy.boss} slowed={slowed} reduced={reduced}
              mark={enemy.boosted && spec.weather ? WEATHER[spec.weather].mark : ''}
              hurt={game.strikes.some(strike => strike.foe === enemy.id && strike.kind !== 'wave' && game.elapsed - strike.start < 200)}
              poisoned={enemy.poisonUntil > game.elapsed} heading={enemyHeading(game, enemy)} step={step}
              conditions={conditions.join(',')}
              flicker={reduced ? 1 : Math.floor(game.elapsed / 150) % 2}
              {...bossLook(game, enemy)} />
          </Mover>
        })}
        {game.shots.map(shot => <Mover key={shot.id} x={shot.x * cell} y={top + shot.y * cell} size={0} reduced={reduced}>
          <ShotSprite shot={shot} game={game} cell={cell} reduced={reduced} />
        </Mover>)}
        {game.strikes.filter(strike => strike.kind !== 'wave').map(strike => <Mover key={strike.id} x={strike.x * cell} y={top + strike.y * cell} size={0} reduced={reduced}>
          <Impact move={strike.move} cell={cell} small={strike.kind === 'spread'} reduced={reduced} />
          <StrikeSprite strike={strike} elapsed={game.elapsed} cell={cell} reduced={reduced} />
        </Mover>)}
        {game.drops.map(drop => <Pressable key={drop.id} accessibilityRole="button" accessibilityLabel={`Collect ${drop.value} berries`}
          hitSlop={8} onPress={() => act(battle => collectDrop(battle, drop.id))}
          style={[board.drop, { left: drop.col * cell + cell * 0.38, top: top + drop.row * cell - cell * 0.02, width: cell * 0.62, height: cell * 0.62 }]}>
          <BerryIcon />
        </Pressable>)}
        {/* While the Legendary's move plays, its banner says what the assist pop-up would. */}
        {game.effects.filter(fx => !(answer && fx.kind === 'assist')).map(fx => <Text key={fx.id} pointerEvents="none" accessible={false}
          // Kept inside the board's edges, so a callout by the side of the map reads in full.
          style={[board.fx, { left: Math.max(0, Math.min(fieldWidth - cell * 2.6, fx.x * cell - cell * 1.3)), top: top + fx.y * cell - cell * 0.6, width: cell * 2.6,
            color: fx.tint ?? fxColors[fx.kind],
            fontSize: fx.kind === 'guard' || fx.kind === 'assist' ? 22 : fx.kind === 'boss' ? 17 : 16 }]}>{fx.text}</Text>)}
        {spec.weather && <WeatherLayer weather={spec.weather} width={fieldWidth} height={height} reduced={reduced} />}
        {answer && <AssistMove key={answer.id} name={answer.name} width={fieldWidth} height={height} reduced={reduced} onDone={endAnswer} />}
      </View>
      </BoardFrame>}
      {!!note && <View pointerEvents="none" style={play.note}><Text accessibilityLiveRegion="polite" style={play.noteText}>{note}</Text></View>}
      {/* Details float over the half of the board away from the Pokemon you tapped. */}
      {selected && <UnitPanel unit={selected} layout={layout} weather={spec.weather} playing={playing} berries={game.berries}
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
          disabled={!playing || game.assist.used} onPress={callFriend} />}
      </View>}
    </View>}
  </View>
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

// Where the board sits: Trail Defense's under a camera that pans and zooms; Route Guard's as it always was, scrolling
// when it is taller than the room it has.
function BoardFrame({ camera, area, width, height, zoom, scrolls, reduced, children }: {
  camera: boolean, area: { width: number, height: number }, width: number, height: number,
  zoom: { start: number, least: number, most: number }, scrolls: boolean, reduced: boolean, children: ReactNode
}) {
  if (camera) return <ZoomPan frame={area} width={width} height={height} start={zoom.start} least={zoom.least} most={zoom.most} reduced={reduced}>
    {children}
  </ZoomPan>
  return <ScrollView style={StyleSheet.absoluteFill} scrollEnabled={scrolls} nestedScrollEnabled showsVerticalScrollIndicator={scrolls}
    contentContainerStyle={{ minHeight: area.height, alignItems: 'center', justifyContent: 'center' }}>{children}</ScrollView>
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

// One frame of a walking strip: the 8-frame row is clipped to a single square. A tint repaints the visible pixels;
// `solid` paints the silhouette in the tint alone (the foes' outline).
function Strip({ source, size, frame, tint, solid = false }: { source: ImageSourcePropType, size: number, frame: number, tint?: string, solid?: boolean }) {
  const style = { position: 'absolute' as const, top: 0, left: -frame * size, width: size * 8, height: size,
    ...(Platform.OS === 'web' ? { imageRendering: 'pixelated' } : {}) }
  return <View style={{ width: size, height: size, overflow: 'hidden' }}>
    {!solid && <Image source={source} resizeMode="stretch" fadeDuration={0} style={style} />}
    {!!tint && <Image source={source} resizeMode="stretch" fadeDuration={0} style={[style, { tintColor: tint, opacity: solid ? 1 : 0.55 }]} />}
  </View>
}

// What marks a foe as an enemy at a glance, whatever its species: a dark violet aura on the ground with wisps rising
// off it (they flicker with the walk cycle; still with reduced motion), and a red outline - the silhouette drawn in red
// one sprite pixel out in each direction, under the sprite itself.
const OUTLINE: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]
const FOE_RED = '#ff2a3d'
function ShadowAura({ size, step, boss }: { size: number, step: number, boss: boolean }) {
  const glow = size * (boss ? 1.05 : 0.9)
  const wisp = (x: number, rise: number, scale: number, key: string) => <View key={key} style={[board.wisp, {
    left: size / 2 + x * size - size * 0.05 * scale, top: size * (0.18 - rise), width: size * 0.1 * scale, height: size * 0.22 * scale,
    borderRadius: size }]} />
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <View style={[board.aura, { left: (size - glow) / 2, top: size * 0.32, width: glow, height: glow * 0.62, borderRadius: glow }]} />
    <View style={[board.auraCore, { left: size * 0.22, top: size * 0.5, width: size * 0.56, height: size * 0.3, borderRadius: size }]} />
    {step ? [wisp(-0.28, 0.02, 1, 'a'), wisp(0.22, 0.1, 0.8, 'b'), wisp(-0.02, -0.04, 0.7, 'c')]
      : [wisp(-0.22, 0.1, 0.8, 'a'), wisp(0.28, 0.02, 1, 'b'), wisp(0.04, 0.06, 0.7, 'c')]}
  </View>
}

// Shadow Pokemon are the normal strip under a dark tint, facing the way they walk; forms without walking art stay still.
// What a boss shows of its skills (src/games/boss.ts): how far it has charged its next move (-1 when not charging) and
// that move's mark, its shield, and whether it is dashing.
function bossLook(game: Battle, enemy: Battle['enemies'][number]) {
  const move = bossCharging(game, enemy)
  return { charge: move ? 1 - (enemy.chargeUntil! - game.elapsed) / BOSS_CHARGE : -1, chargeMark: move ? SKILL_MARKS[move.skill] : '',
    shielded: (enemy.shield ?? 0) > 0, dashing: (enemy.dashUntil ?? 0) > game.elapsed }
}

// How a status condition tints a foe (src/games/status.ts): colour, strength, and whether it flickers on and off.
const CONDITION_TINT: Record<Condition, [string, number, boolean]> = {
  freeze: ['#9fdcff', 0.6, false], frostbite: ['#bfe4ff', 0.3, false], burn: ['#ff7a3c', 0.4, true], paralysis: ['#ffe14d', 0.45, true],
  poison: ['#b25fd9', 0.35, true], sleep: ['#6b6b86', 0.25, false], confusion: ['#e26aa8', 0.2, true]
}

const Foe = memo(function Foe({ name, size, ratio, boss, slowed, poisoned, heading, step, hurt, reduced, mark, charge = -1, chargeMark = '', shielded = false,
  dashing = false, conditions = '', flicker = 0 }: {
  name: string, size: number, ratio: number, boss: boolean, slowed: boolean, poisoned: boolean, heading: Facing, step: number, hurt: boolean, reduced: boolean,
  mark: string, charge?: number, chargeMark?: string, shielded?: boolean, dashing?: boolean, conditions?: string, flicker?: number
}) {
  // conditions: its status conditions, strongest first, joined by commas (a string keeps this component memoized).
  const held = (conditions ? conditions.split(',') : []) as Condition[]
  const strongest = held[0]
  // The strongest condition colours it; up to three tags show, then how many more.
  const tint = strongest && (!CONDITION_TINT[strongest][2] || flicker) ? CONDITION_TINT[strongest] : null
  const shown = held.slice(0, 3), more = held.length - shown.length
  const strip = walkers[name]
  const sprite = { width: size, height: size, ...(Platform.OS === 'web' ? { imageRendering: 'pixelated' } : {}) }
  const px = Math.max(1, size / 44)
  const frame = facing[heading] + step
  const [backX, backY] = lungeOffset[heading]
  return <View style={{ width: size, height: size, alignItems: 'center' }}>
    <ShadowAura size={size} step={step} boss={boss} />
    {/* Charging a move: a ring closing in on it, brighter as the move comes, with the move's mark above. */}
    {charge >= 0 && <View pointerEvents="none" style={[board.charge, { width: size * 1.5, height: size * 1.5, borderRadius: size, left: -size * 0.25, top: -size * 0.25,
      borderWidth: Math.max(2, size * 0.05), opacity: 0.45 + 0.55 * charge, transform: [{ scale: reduced ? 1 : 1.35 - 0.4 * charge }] }]} />}
    {/* Dashing: a fading trail behind it. */}
    {dashing && !reduced && [1, 2].map(i => <View key={i} pointerEvents="none" style={{ position: 'absolute', left: -backX * size * 0.2 * i, top: -backY * size * 0.2 * i,
      opacity: 0.35 / i }}>
      {strip ? <Strip source={strip} size={size} frame={frame} tint="#ff8c42" solid />
        : <Image source={spriteSource(name)} resizeMode="contain" fadeDuration={0} style={[sprite, { tintColor: '#ff8c42' }]} />}
    </View>)}
    <View style={[board.shadow, { width: size * 0.5, height: size * 0.11, borderRadius: size, bottom: size * 0.04 }]} />
    {OUTLINE.map(([dx, dy]) => <View key={`${dx},${dy}`} style={{ position: 'absolute', left: dx * px, top: dy * px }}>
      {strip ? <Strip source={strip} size={size} frame={frame} tint={FOE_RED} solid />
        : <Image source={spriteSource(name)} resizeMode="contain" fadeDuration={0} style={[sprite, { tintColor: FOE_RED }]} />}
    </View>)}
    {/* Struck just now: a white flash over the foe, and a jolt unless motion is reduced. */}
    <View style={{ position: 'absolute', left: 0, top: 0, transform: [{ translateX: hurt && !reduced ? (step ? 1 : -1) * size * 0.06 : 0 }] }}>
      {strip ? <Strip source={strip} size={size} frame={frame} tint="#2a1240" /> : <>
        <Image source={spriteSource(name)} resizeMode="contain" fadeDuration={0} style={sprite} />
        <Image source={spriteSource(name)} resizeMode="contain" fadeDuration={0} style={[sprite, { position: 'absolute', tintColor: '#2a1240', opacity: 0.55 }]} />
      </>}
      {/* A status condition's colour over it: frozen ice-blue, a burn's flicker of orange, and so on. */}
      {tint && <View style={{ position: 'absolute', left: 0, top: 0, opacity: tint[1] }}>
        {strip ? <Strip source={strip} size={size} frame={frame} tint={tint[0]} solid />
          : <Image source={spriteSource(name)} resizeMode="contain" fadeDuration={0} style={[sprite, { tintColor: tint[0] }]} />}
      </View>}
      {hurt && <View style={{ position: 'absolute', left: 0, top: 0, opacity: 0.8 }}>
        {strip ? <Strip source={strip} size={size} frame={frame} tint="#ffffff" solid />
          : <Image source={spriteSource(name)} resizeMode="contain" fadeDuration={0} style={[sprite, { tintColor: '#ffffff' }]} />}
      </View>}
    </View>
    {/* Shielded: a bubble around it until the shield breaks or fades. */}
    {shielded && <View pointerEvents="none" style={[board.shield, { width: size * 1.2, height: size * 1.2, borderRadius: size, left: -size * 0.1, top: -size * 0.1,
      borderWidth: Math.max(2, size * 0.04) }]} />}
    <View style={{ position: 'absolute', bottom: 0 }}><Health ratio={ratio} width={size * 0.7} /></View>
    {boss && <Text style={board.boss}>BOSS</Text>}
    {!!chargeMark && <Text accessible={false} style={[board.chargeMark, { fontSize: Math.max(14, size * 0.36), top: size * 0.05, left: size * 0.92 }]}>{chargeMark}</Text>}
    {/* Powered up by the weather: its mark on a gold chip. */}
    {!!mark && <Text accessible={false} style={[board.weatherMark, { fontSize: Math.max(9, size * 0.24) }]}>{mark}</Text>}
    {/* Its status as the games tag it (BRN, FRZ...), with confusion's CNF beside it and slow or dash marks before. */}
    {(slowed || dashing || held.length > 0) && <View style={board.status}>
      {(slowed || dashing) && <Text style={board.statusMark}>{dashing ? '»' : ''}{slowed ? '❄' : ''}</Text>}
      <View style={{ gap: 1, alignItems: 'flex-end' }}>
        {shown.map(item => <Text key={item} style={[board.tag, { backgroundColor: CONDITIONS[item].color }]}>{CONDITIONS[item].tag}</Text>)}
        {more > 0 && <Text style={[board.tag, { backgroundColor: '#4a4a5e' }]}>+{more}</Text>}
      </View>
    </View>}
    {held.includes('sleep') && <Text accessible={false} style={[board.zzz, { fontSize: Math.max(10, size * 0.24), top: -size * (flicker ? 0.12 : 0.04) }]}>z Z</Text>}
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
  // Evolving: the evolution plays over it for EVOLVE_MS (src/games/BattleFx.tsx), facing you. The Pokemon itself stays
  // mounted underneath, hidden, so its new form is loaded and takes over without a blank frame.
  const evolving = !!unit.from && unit.evolvedAt !== undefined && game.elapsed - unit.evolvedAt < EVOLVE_MS
  const from = unit.from ?? unit.name
  // Stunned by a boss: dimmed and still, stars circling over it.
  const stunned = (unit.stunnedUntil ?? 0) > game.elapsed
  return <View style={{ width: size, height: size }}>
    {stunned && <Text accessible={false} style={[board.stunned, { fontSize: Math.max(10, size * 0.26), top: -size * 0.12,
      transform: [{ rotate: reduced ? '0deg' : `${(game.elapsed / 4) % 360}deg` }] }]}>✦ ✦</Text>}
    <View style={{ opacity: evolving ? 0 : stunned ? 0.5 : 1 }}>
      <AllySprite name={unit.name} shiny={unit.shiny} size={size} frame={facing[heading] + step} dx={dx * size * 0.1} dy={dy * size * 0.1} />
    </View>
    {evolving && <View style={StyleSheet.absoluteFill}>
      <EvolveFx key={unit.evolvedAt} to={unit.name} size={size} reduced={reduced} draw={(form, white) => {
        const name = form === 'from' ? from : unit.name
        const strip = walkers[(unit.shiny ? 'Shiny ' : '') + name]
        return strip ? <Strip source={strip} size={size} frame={facing.S} tint={white ? '#ffffff' : undefined} solid={white} />
          : <PixelSprite name={name} shiny={unit.shiny} size={size} tint={white ? '#ffffff' : undefined} />
      }} />
    </View>}
  </View>
}
const AllySprite = memo(function AllySprite({ name, shiny, size, frame, dx, dy }: { name: string, shiny: boolean, size: number, frame: number, dx: number, dy: number }) {
  const strip = walkers[(shiny ? 'Shiny ' : '') + name]
  return <View style={{ width: size, height: size, transform: [{ translateX: dx }, { translateY: dy }] }}>
    {strip ? <Strip source={strip} size={size} frame={frame} /> : <PixelSprite name={name} shiny={shiny} size={size} />}
  </View>
})

const skyNote = (sky: 'boosted' | 'weakened' | null) => sky === 'boosted' ? ', powered up by the weather' : sky === 'weakened' ? ', weakened by the weather' : ''
// The weather's mark on one of your Pokemon: a gold ▲ when it powers it up, a blue ▼ when it weakens it.
function WeatherArrow({ sky, size }: { sky: 'boosted' | 'weakened' | null, size: number }) {
  if (!sky) return null
  return <Text accessible={false} style={[board.arrow, sky === 'weakened' && board.arrowWeak, { fontSize: Math.max(9, size * 0.2), lineHeight: Math.max(12, size * 0.26) }]}>
    {sky === 'boosted' ? '▲' : '▼'}</Text>
}

function UnitPanel({ unit, layout, weather, playing, berries, style, onEvolve, onRelease, onClose }: {
  unit: Battle['units'][number], layout: Layout, weather?: Weather, playing: boolean, berries: number, style: ViewStyle,
  onEvolve: () => void, onRelease: () => void, onClose: () => void
}) {
  const kit = kitFor(unit.name, layout)
  const next = nextForm(unit)
  const perk = eggPerk(unit.name, layout)
  const move = moveOf(unit.name, layout)
  const sky = unitWeather(weather, unit.name, layout)
  // What its move can leave on a foe: "Ember may burn (20%)".
  const causes = move ? inflictText(battleType(unit.name)) : ''
  // The foes its moves cannot touch ("Can't hit Ghost foes"): it leaves them for the rest of the team.
  const blind = move ? untouchable(unit.name, layout, unit.egg) : []
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
    {!!causes && <Copy small color={colors.ink}>{`${move} ${causes}.`}</Copy>}
    {blind.length > 0 && <Copy small color={colors.danger}>{`Can't hit ${types(blind)} foes.`}</Copy>}
    {weather && sky && <Copy small color={sky === 'boosted' ? colors.gold : colors.danger}>{sky === 'boosted'
      ? `${WEATHER[weather].mark} ${WEATHER[weather].name} powers it up: ${POWER_UP}% more damage.`
      : `${WEATHER[weather].mark} ${WEATHER[weather].name} weakens it: ${POWER_DOWN}% less damage.`}</Copy>}
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
  blocked: { backgroundColor: 'rgba(2, 8, 16, 0.45)' },
  shadow: { position: 'absolute', backgroundColor: 'rgba(2, 16, 27, 0.22)' },
  aura: { position: 'absolute', backgroundColor: 'rgba(96, 18, 150, 0.42)' },
  auraCore: { position: 'absolute', backgroundColor: 'rgba(36, 4, 60, 0.55)' },
  wisp: { position: 'absolute', backgroundColor: 'rgba(132, 40, 196, 0.62)' },
  range: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(84, 199, 196, 0.85)', backgroundColor: 'rgba(84, 199, 196, 0.14)' },
  inspected: { borderWidth: 2, borderColor: onBoard.gold },
  snorlax: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  health: { position: 'absolute', bottom: 2, height: 4, backgroundColor: 'rgba(7, 27, 44, 0.8)', borderRadius: 2, overflow: 'hidden' },
  drop: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  fx: { position: 'absolute', textAlign: 'center', fontFamily: fonts.black, textShadowColor: onBoard.dark, textShadowRadius: 3, textShadowOffset: { width: 1, height: 1 } },
  boss: { position: 'absolute', top: -2, fontSize: 10, fontFamily: fonts.black, color: onBoard.dark, backgroundColor: onBoard.gold, paddingHorizontal: 5, borderRadius: 999, overflow: 'hidden' },
  status: { position: 'absolute', top: 0, right: -4, flexDirection: 'row', alignItems: 'center', gap: 2 },
  statusMark: { fontSize: 12 },
  tag: { fontSize: 8, lineHeight: 11, fontFamily: fonts.black, color: '#ffffff', paddingHorizontal: 3, borderRadius: 3, overflow: 'hidden',
    textShadowColor: 'rgba(0, 0, 0, 0.45)', textShadowRadius: 1 },
  zzz: { position: 'absolute', right: 0, fontFamily: fonts.black, color: '#e8ecff', textShadowColor: onBoard.dark, textShadowRadius: 2 },
  charge: { position: 'absolute', borderColor: '#ff8c42', backgroundColor: 'rgba(255, 140, 66, 0.12)' },
  chargeMark: { position: 'absolute', fontFamily: fonts.black, color: '#ffb36b', textShadowColor: onBoard.dark, textShadowRadius: 3,
    textShadowOffset: { width: 1, height: 1 } },
  shield: { position: 'absolute', borderColor: 'rgba(140, 220, 255, 0.95)', backgroundColor: 'rgba(120, 200, 255, 0.22)' },
  stunned: { position: 'absolute', alignSelf: 'center', left: 0, right: 0, textAlign: 'center', fontFamily: fonts.black, color: onBoard.gold,
    textShadowColor: onBoard.dark, textShadowRadius: 2 },
  arrow: { position: 'absolute', top: 2, right: 3, fontFamily: fonts.black, color: onBoard.gold, textShadowColor: onBoard.dark, textShadowRadius: 2,
    textShadowOffset: { width: 1, height: 1 } },
  arrowWeak: { color: '#8FC8FF' },
  weatherMark: { position: 'absolute', top: 0, left: 0, color: '#1A1200', backgroundColor: onBoard.gold, borderRadius: 999, overflow: 'hidden',
    paddingHorizontal: 3, fontFamily: fonts.black },
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
  weather: { fontFamily: fonts.heavy, color: colors.gold, fontSize: 13, lineHeight: 18, paddingHorizontal: 2 },
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
