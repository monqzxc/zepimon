import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Animated, Easing, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import type { ImageSourcePropType } from 'react-native'
import { spriteSource } from '../catalog'
import { typeTheme } from '../HabitatScene'
import { Button, Copy, Eyebrow, Heading, Panel, colors, styles } from '../ui'
import { BerryIcon } from './BerryCatch'
import { LANES, PATHS, TICK, battleScore, battleStars, callAssist, canPlace, cardReadyAt, collectDrop, eggPerk, enemyHeading, enemyPoint, evolveUnit, gridSize,
  kitFor, nextForm, nextWaveIn, pauseBattle, placeUnit, placedForm, refundFor, removeUnit, resumeBattle, sendNextWave, startBattle, tickBattle } from './battle'
import type { Battle, BattleSpec, Heading as Facing, Layout, PathId } from './battle'
import { TrailTerrain } from './TrailTerrain'
import { trailWalkers } from '../generated/trail-walkers.js'
import { autoTeam, cardKey } from './roster'
import type { TeamCard } from './roster'
import { PixelSprite, TeamPicker } from './TeamPicker'
import { useGameLoop, useReducedMotion } from './hooks'

export type BattleResult = { won: boolean, score: number, stars: number }
type Props = {
  layout: Layout, makeSpec: () => BattleSpec, title: string, intro: string, choices: TeamCard[], assists: string[],
  bonus: number, bonusNote: string, record: string, showStars?: boolean, onFinish: (result: BattleResult) => void
}

const MAX_FIELD = 440
const native = Platform.OS !== 'web'
const shotColors: Record<string, string> = {
  normal: '#f4ebcf', fire: '#ff8a3d', water: '#57b8ff', electric: '#ffe14d', grass: '#7ddc6b', ice: '#a8f0ff', fighting: '#ff6b5b',
  poison: '#c77dff', ground: '#d9b77a', flying: '#bfe3ff', psychic: '#ff7fc8', bug: '#b6d84c', rock: '#d9b77a', ghost: '#9d8cff',
  dragon: '#8f7dff', dark: '#a3a3b8', steel: '#c8d6de', fairy: '#ffb3e0'
}
const fxColors = { super: colors.gold, zap: '#ffe14d', berries: '#ff92af', guard: colors.ink, assist: colors.gold, leak: '#ff8a8a' }
const trailNames: Record<PathId, string> = { switchback: 'SWITCHBACK TRAIL', canyon: 'CANYON TRAIL', spiral: 'SPIRAL TRAIL' }
// Gen 1-4 walking strips (src/generated/trail-walkers.js): two steps each facing south, north, west, east.
const walkers = trailWalkers as Record<string, ImageSourcePropType>
const facing: Record<Facing, number> = { S: 0, N: 2, W: 4, E: 6 }
const STEP_MS = 220

export function starText(stars: number) {
  return '★'.repeat(stars) + '☆'.repeat(3 - stars)
}

export function DefenseGame({ layout, makeSpec, title, intro, choices, assists, bonus, bonusNote, record, showStars = false, onFinish }: Props) {
  const [team, setTeam] = useState(() => autoTeam(choices))
  const [helper, setHelper] = useState<string | null>(assists[0] ?? null)
  const [game, setGame] = useState<Battle | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [inspect, setInspect] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [width, setWidth] = useState(0)
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
  useGameLoop(() => act(battle => tickBattle(battle, performance.now())), pause)

  function start() {
    setPicked(null); setInspect(null); setNote('')
    update(startBattle(makeSpec(), team, { bonus, assist: helper }, performance.now()))
  }

  if (!game) return <View style={{ gap: 14 }}>
    <Heading>{title}</Heading>
    <Copy>{intro}</Copy>
    <Panel>
      <Copy color={colors.gold}>{record}</Copy>
      <Copy small>{bonusNote}</Copy>
    </Panel>
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
  const { cols, rows } = gridSize(layout)
  const fieldWidth = Math.min(width, MAX_FIELD)
  const cell = fieldWidth / cols
  const top = layout === 'lanes' ? cell * 0.7 : 0
  const height = top + rows * cell + (layout === 'lanes' ? cell * 0.8 : 0)
  const playing = game.status === 'playing'
  const over = game.status === 'won' || game.status === 'lost'
  const wait = nextWaveIn(game)
  const pathCells = layout === 'trail' ? PATHS[spec.path].cells : null
  const selected = game.units.find(unit => unit.id === inspect)
  const guards = game.guards.filter(Boolean).length

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

  return <View style={{ gap: 12 }}>
    <Heading>{title}</Heading>
    <Panel>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Stat label="BERRIES" value={`◉ ${game.berries}`} />
        <Stat label="WAVE" value={`${Math.max(1, game.wave)} / ${spec.waves}`} />
        {layout === 'lanes' ? <Stat label="SNORLAX" value={`${guards} / ${LANES}`} /> : <Stat label="LIVES" value={`♥ ${game.lives}`} />}
      </View>
      <Copy small>{over ? 'Battle over.' : wait !== null ? `${game.wave ? 'Next wave' : 'First wave'} in ${Math.ceil(wait / 1000)}s${game.wave ? '' : ' — place your team!'}` : game.spawns.length ? 'A wave is arriving!' : 'The last foes are on the field!'}</Copy>
    </Panel>

    {layout === 'trail' && <Eyebrow>{theme.label.toUpperCase()} · {trailNames[spec.path]}</Eyebrow>}
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ width: '100%', alignItems: 'center' }}>
      {width > 0 && <View style={[board.field, { width: fieldWidth, height, backgroundColor: theme.sky }]}>
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
              <PixelSprite name={unit.name} shiny={unit.shiny} size={cell * 0.86} />
              {unit.hp < unit.maxHp && <Health ratio={unit.hp / unit.maxHp} width={cell * 0.7} />}
              {unit.egg && <Text accessible={false} style={board.egg}>EGG</Text>}
            </>}
          </Pressable>
        })}
        {layout === 'lanes' && game.guards.map((awake, lane) => <View key={lane} pointerEvents="none"
          style={[board.snorlax, { left: lane * cell, top: top + rows * cell, width: cell, height: cell * 0.8, opacity: awake ? 1 : 0.25 }]}>
          <PixelSprite name="Snorlax" size={cell * 0.7} />
        </View>)}
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
        {game.shots.map(shot => <Mover key={shot.id} x={shot.x * cell - cell * 0.1} y={top + shot.y * cell - cell * 0.1} size={cell * 0.2} reduced={reduced}>
          <View style={[board.shot, { backgroundColor: shotColors[shot.type] || colors.ink }]} />
        </Mover>)}
        {game.drops.map(drop => <Pressable key={drop.id} accessibilityRole="button" accessibilityLabel={`Collect ${drop.value} berries`}
          hitSlop={8} onPress={() => act(battle => collectDrop(battle, drop.id))}
          style={[board.drop, { left: drop.col * cell + cell * 0.38, top: top + drop.row * cell - cell * 0.02, width: cell * 0.62, height: cell * 0.62 }]}>
          <BerryIcon />
        </Pressable>)}
        {game.effects.map(fx => <Text key={fx.id} pointerEvents="none" accessible={false}
          style={[board.fx, { left: fx.x * cell - cell, top: top + fx.y * cell - cell * 0.6, width: cell * 2, color: fxColors[fx.kind],
            fontSize: fx.kind === 'guard' || fx.kind === 'assist' ? 22 : 16 }]}>{fx.text}</Text>)}
      </View>}
    </View>
    {layout === 'trail' && !over && <Copy small>Foes come out of the cave and follow the arrows to the Poke Ball. Each one that reaches it costs a life.</Copy>}

    {!!note && <Copy color={colors.gold}>{note}</Copy>}
    {selected && <UnitPanel unit={selected} layout={layout} playing={playing} berries={game.berries}
      onEvolve={() => act(battle => evolveUnit(battle, selected.id))}
      onRelease={() => { act(battle => removeUnit(battle, selected.id)); setInspect(null) }} onClose={() => setInspect(null)} />}

    {!over && <>
      <Eyebrow>{picked ? 'NOW TAP A FREE SQUARE' : 'TAP A CARD TO PLACE A POKEMON'}</Eyebrow>
      <View style={board.tray}>{game.team.map(card => {
        const key = cardKey(card)
        const form = placedForm(game, card)
        const kit = kitFor(form, layout)
        const recharge = Math.max(0, cardReadyAt(game, card) - game.elapsed)
        const ready = playing && !recharge && game.berries >= kit.cost
        return <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: picked === key, disabled: !playing }} disabled={!playing}
          accessibilityLabel={`${form}, ${kit.label}, ${kit.cost} berries${recharge ? `, recharging for ${Math.ceil(recharge / 1000)} seconds` : game.berries < kit.cost ? ', not enough berries yet' : ''}`}
          onPress={() => { setInspect(null); setNote(''); setPicked(picked === key ? null : key) }}
          style={({ pressed }) => [board.card, picked === key && board.picked, { opacity: pressed ? 0.7 : ready ? 1 : 0.55 }]}>
          <PixelSprite name={form} shiny={card.shiny} size={40} />
          <Text style={board.cost}>◉ {kit.cost}</Text>
          <Text numberOfLines={1} style={board.role}>{recharge ? `${Math.ceil(recharge / 1000)}s` : kit.label}</Text>
        </Pressable>
      })}</View>
      <View style={styles.row}>
        {playing && <Button title="Pause" secondary onPress={pause} />}
        {game.status === 'paused' && <Button title="Resume battle" onPress={() => act(battle => resumeBattle(battle, performance.now()))} />}
        {layout === 'trail' && playing && wait !== null && wait > 1000 && <Button title="Send next wave · +◉ 10" secondary onPress={() => act(sendNextWave)} />}
        {game.assist && <Button title={game.assist.used ? `${game.assist.name} helped!` : `Call ${game.assist.name}`} disabled={!playing || game.assist.used}
          onPress={() => act(callAssist)} />}
      </View>
      {game.status === 'paused' && <Copy>Paused. Your team, berries and the next wave are waiting.</Copy>}
    </>}

    {over && <Panel style={{ borderColor: colors.gold }}>
      <Heading>{game.status === 'won' ? 'Victory!' : layout === 'lanes' ? 'A foe slipped past Snorlax.' : 'The trail was overrun.'}</Heading>
      <Copy color={colors.ink}>{game.status === 'won' ? `All ${spec.waves} waves cleared.` : `You cleared ${battleScore(game)} of ${spec.waves} waves.`} {game.defeated} Shadow Pokemon calmed.</Copy>
      {showStars && <Text accessibilityLabel={`${battleStars(game)} of 3 stars`} style={board.stars}>{starText(battleStars(game))}</Text>}
      <Button title="Play again" onPress={start} />
      <Button title="Change team" secondary onPress={() => update(null)} />
    </Panel>}
    <Copy small>Switching tabs or leaving the app pauses the battle. Returning to the arcade ends it.</Copy>
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
  </Panel>
}

function Stat({ label, value }: { label: string, value: string }) {
  return <View><Eyebrow>{label}</Eyebrow><Text style={styles.stat}>{value}</Text></View>
}

function Health({ ratio, width }: { ratio: number, width: number }) {
  return <View style={[board.health, { width }]}>
    <View style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%`, height: '100%', backgroundColor: ratio > 0.5 ? '#7ddc6b' : ratio > 0.25 ? colors.gold : '#ff6b5b' }} />
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

// Shadow Pokemon are the normal sprite under a dark tint. Gen 1-4 foes walk with four-direction strips, clipped to the
// current frame; other forms (and reduced motion) keep a still pose.
const Foe = memo(function Foe({ name, size, ratio, boss, slowed, poisoned, heading, step }: {
  name: string, size: number, ratio: number, boss: boolean, slowed: boolean, poisoned: boolean, heading: Facing, step: number
}) {
  const strip = walkers[name]
  const pixel = Platform.OS === 'web' ? { imageRendering: 'pixelated' } : {}
  const sprite = { width: size, height: size, ...pixel }
  const frame = { position: 'absolute' as const, top: 0, left: -(facing[heading] + step) * size, width: size * 8, height: size, ...pixel }
  return <View style={{ width: size, height: size, alignItems: 'center' }}>
    <View style={[board.shadow, { width: size * 0.5, height: size * 0.11, borderRadius: size, bottom: size * 0.04 }]} />
    {strip ? <View style={{ width: size, height: size, overflow: 'hidden' }}>
      <Image source={strip} resizeMode="stretch" fadeDuration={0} style={frame} />
      <Image source={strip} resizeMode="stretch" fadeDuration={0} style={[frame, { tintColor: '#2a1240', opacity: 0.55 }]} />
    </View> : <>
      <Image source={spriteSource(name)} resizeMode="contain" fadeDuration={0} style={sprite} />
      <Image source={spriteSource(name)} resizeMode="contain" fadeDuration={0} style={[sprite, { position: 'absolute', tintColor: '#2a1240', opacity: 0.55 }]} />
    </>}
    <View style={{ position: 'absolute', bottom: 0 }}><Health ratio={ratio} width={size * 0.7} /></View>
    {boss && <Text style={board.boss}>BOSS</Text>}
    {(slowed || poisoned) && <Text style={board.status}>{slowed ? '❄' : ''}{poisoned ? '☠' : ''}</Text>}
  </View>
})

function UnitPanel({ unit, layout, playing, berries, onEvolve, onRelease, onClose }: {
  unit: Battle['units'][number], layout: Layout, playing: boolean, berries: number, onEvolve: () => void, onRelease: () => void, onClose: () => void
}) {
  const kit = kitFor(unit.name, layout)
  const next = nextForm(unit)
  const perk = eggPerk(unit.name, layout)
  return <Panel>
    <View style={styles.row}>
      <PixelSprite name={unit.name} shiny={unit.shiny} size={56} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800' }}>{unit.shiny ? 'Shiny ' : ''}{unit.name}</Text>
        <Copy small>{kit.label} · Health {Math.ceil(unit.hp)} / {unit.maxHp}</Copy>
      </View>
    </View>
    <Copy small color={unit.egg && perk ? colors.gold : colors.muted}>{!unit.egg ? 'No egg moves: only Pokemon hatched on your watch know them.'
      : perk ? `Hatched from an egg · Egg move ${perk.move}: ${perk.text}.` : 'Hatched from an egg, but this family has no Gen II–IV egg moves.'}</Copy>
    {layout === 'trail' && (next ? <Button title={`Evolve to ${next.name} · ◉ ${next.cost}`} disabled={!playing || berries < next.cost} onPress={onEvolve} />
      : <Copy small>Fully evolved.</Copy>)}
    <View style={styles.row}>
      <Button title={`Release · +◉ ${refundFor(unit)}`} secondary disabled={!playing} onPress={onRelease} />
      <Button title="Close" secondary onPress={onClose} />
    </View>
  </Panel>
}

const board = StyleSheet.create({
  field: { borderWidth: 2, borderColor: colors.edge, borderRadius: 6, overflow: 'hidden' },
  cell: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  free: { borderWidth: 1, borderColor: 'rgba(255, 224, 141, 0.45)', backgroundColor: 'rgba(255, 224, 141, 0.12)' },
  shadow: { position: 'absolute', backgroundColor: 'rgba(2, 16, 27, 0.22)' },
  range: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(84, 199, 196, 0.85)', backgroundColor: 'rgba(84, 199, 196, 0.14)' },
  inspected: { borderWidth: 2, borderColor: colors.gold },
  snorlax: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  health: { position: 'absolute', bottom: 2, height: 4, backgroundColor: 'rgba(7, 27, 44, 0.8)', borderRadius: 2, overflow: 'hidden' },
  shot: { width: '100%', height: '100%', borderRadius: 99, borderWidth: 1, borderColor: colors.bg },
  drop: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  fx: { position: 'absolute', textAlign: 'center', fontWeight: '800', textShadowColor: colors.bg, textShadowRadius: 3, textShadowOffset: { width: 1, height: 1 } },
  boss: { position: 'absolute', top: -2, fontSize: 10, fontWeight: '800', color: colors.bg, backgroundColor: colors.gold, paddingHorizontal: 4, borderRadius: 3, overflow: 'hidden' },
  status: { position: 'absolute', top: 0, right: 0, fontSize: 12 },
  egg: { position: 'absolute', top: 2, left: 2, fontSize: 8, fontWeight: '800', color: colors.bg, backgroundColor: colors.gold, paddingHorizontal: 2, borderRadius: 2, overflow: 'hidden' },
  tray: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { flexBasis: '31%', flexGrow: 1, minHeight: 88, alignItems: 'center', justifyContent: 'center', gap: 2, padding: 6,
    borderWidth: 2, borderColor: '#2d5a70', borderRadius: 5, backgroundColor: colors.panel },
  picked: { borderColor: colors.gold, backgroundColor: '#1a3d52' },
  cost: { color: colors.ink, fontWeight: '800', fontSize: 13 },
  role: { color: colors.muted, fontSize: 11 },
  stars: { color: colors.gold, fontSize: 26, letterSpacing: 4 }
})
