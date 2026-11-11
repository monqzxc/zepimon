import { useEffect, useState } from 'react'
import { Animated, Pressable, Text, View } from 'react-native'
import type { ViewStyle } from 'react-native'
import { Backdrop, typeTheme } from '../HabitatScene'
import { typeColors } from '../catalog'
import { Button, Copy, Icon, PokeballIcon, TypeBadge, colors, displayFont, fonts, motionReduced, pressDepth, retro, themedStyles } from '../ui'
import { STAR_GOALS } from './AdventureMap'
import { PATHS, WEATHER } from './battle'
import { TrailArt } from './GameArt'
import { LEVELS, STAGES, levelUnlocked } from './levels'
import type { Level } from './levels'
import { PixelSprite } from './TeamPicker'
import { mix } from './TrailTerrain'

// Trail Defense's stage select, in two steps: the five stages as cards, each showing its habitat with the stage's
// Legendary boss standing in it (a silhouette until beaten), then one stage's levels as stops along a trail.
// Stage cards keep their habitat's colors in every theme, like type badges; the page around them follows the theme.

const NIGHT = '#0a0d18'
const GOLD = '#f7c531'
const ART_WIDTH = 148
const CARD_HEIGHT = 116

const dims = (level: Level) => `${PATHS[level.spec.path].cols} × ${PATHS[level.spec.path].rows}`
const stageLevels = (stage: number) => LEVELS.filter(level => level.stage === stage)
const earned = (stars: Record<string, number>, levels: Level[]) => levels.reduce((sum, level) => sum + (stars[level.id] || 0), 0)
// Card fill and rim from the habitat's type color, deep enough for white text (over 7:1 for every stage).
const stageFill = (stage: number) => mix(typeColors[STAGES[stage].habitat] ?? typeColors.normal, NIGHT, 0.3)
const stageRim = (stage: number) => mix(typeColors[STAGES[stage].habitat] ?? typeColors.normal, '#ffffff', 0.3)

export function TrailLevels({ stars, stage, freeBest, onStage, onPlay, onFreePlay }: {
  stars: Record<string, number>, stage: number | null, freeBest: string,
  onStage: (stage: number) => void, onPlay: (level: Level) => void, onFreePlay: () => void
}) {
  const next = LEVELS.find((level, index) => levelUnlocked(stars, index) && !stars[level.id])
  return stage === null ? <StageList stars={stars} next={next} freeBest={freeBest} onStage={onStage} onFreePlay={onFreePlay} />
    : <StageTrail stage={stage} stars={stars} next={next} onPlay={onPlay} />
}

function StageList({ stars, next, freeBest, onStage, onFreePlay }: {
  stars: Record<string, number>, next?: Level, freeBest: string, onStage: (stage: number) => void, onFreePlay: () => void
}) {
  return <View style={{ gap: 14 }}>
    <View style={look.header}>
      <PokeballIcon size={30} color={colors.ink} />
      <Text accessibilityRole="header" style={look.headerTitle}>Stage Select</Text>
      <View accessible accessibilityLabel={`${earned(stars, LEVELS)} of ${LEVELS.length * 3} stars`} style={look.total}>
        <PixelStar size={18} color={colors.star} />
        <Text style={look.totalText}>{earned(stars, LEVELS)} / {LEVELS.length * 3}</Text>
      </View>
    </View>
    <Copy small>{LEVELS.length} levels in {STAGES.length} stages, each ending with a Legendary boss. A star on a level opens the next.</Copy>
    {STAGES.map((_, index) => <StageCard key={index} stage={index} stars={stars} next={next} onPress={() => onStage(index)} />)}
    <Pressable accessibilityRole="button" accessibilityLabel={`Free play. Twelve waves on a random trail. ${freeBest}`} onPress={onFreePlay}
      style={({ pressed }) => [look.card, { backgroundColor: colors.brandFrom, borderColor: mix(colors.brandFrom, '#ffffff', 0.3) },
        cardDepth(colors.brandFrom), pressFeedback(pressed)]}>
      <View style={look.art}><TrailArt width={ART_WIDTH} height={CARD_HEIGHT} /></View>
      <Slant color={colors.brandFrom} />
      <View style={look.body}>
        <Text style={[look.name, { color: colors.onBrand }]}>Free Play</Text>
        <Text style={[look.line, { color: colors.onBrand }]}>12 waves of every type on a random trail.</Text>
        <Text style={[look.line, { color: colors.onBrand, fontFamily: fonts.heavy }]}>{freeBest}</Text>
      </View>
      <Icon name="chevron" size={26} color={colors.onBrand} />
    </Pressable>
  </View>
}

function StageCard({ stage, stars, next, onPress }: { stage: number, stars: Record<string, number>, next?: Level, onPress: () => void }) {
  const levels = stageLevels(stage)
  const open = levelUnlocked(stars, LEVELS.indexOf(levels[0]))
  const total = earned(stars, levels)
  const current = next?.stage === stage
  const fill = open ? stageFill(stage) : '#272b3d'
  const status = !open ? `Clear Level ${levels[0].number - 1} to open`
    : current ? `Next: Level ${next!.number}` : `All ${levels.length} cleared`
  return <Pressable disabled={!open} onPress={onPress} accessibilityRole="button" accessibilityState={{ disabled: !open }}
    accessibilityLabel={open ? `Stage ${stage + 1}, ${STAGES[stage].name}, ${total} of ${levels.length * 3} stars. ${status}.`
      : `Stage ${stage + 1}, locked. ${status}.`}
    style={({ pressed }) => [look.card, { backgroundColor: fill, borderColor: current ? GOLD : open ? stageRim(stage) : '#464b66' },
      current && look.current, cardDepth(fill), pressFeedback(pressed && open)]}>
    <View style={look.art}><StageScene stage={stage} stars={stars} open={open} size={64} /></View>
    <Slant color={fill} />
    <View style={look.body}>
      <Text numberOfLines={2} style={[look.name, !open && { color: 'rgba(255, 255, 255, 0.6)', letterSpacing: 3 }]}>
        {open ? STAGES[stage].name : '? ? ? ? ? ?'}
      </Text>
      <View style={look.starRow}>
        <PixelStar size={18} color={GOLD} empty={!open} />
        <Text style={[look.count, !open && { color: 'rgba(255, 255, 255, 0.6)' }]}>{total} / {levels.length * 3}</Text>
      </View>
      <Text style={[look.line, !open && { color: 'rgba(255, 255, 255, 0.72)' }]}>{status}</Text>
    </View>
    {open && <Icon name="chevron" size={26} color="#ffffff" />}
  </Pressable>
}

// The stage's habitat with its Legendary boss on the stand: dark until the boss level has a star, then in full color.
// Locked stages stay dimmed behind a padlock.
function StageScene({ stage, stars, open, size }: { stage: number, stars: Record<string, number>, open: boolean, size: number }) {
  const theme = typeTheme(STAGES[stage].habitat)
  const boss = stageLevels(stage).at(-1)!
  const beaten = !!stars[boss.id]
  return <View style={{ flex: 1, backgroundColor: theme.sky }}>
    <Backdrop theme={theme} />
    {open ? <View style={[look.boss, { bottom: size * 0.06 }]}>
      <PixelSprite name={boss.spec.boss!} size={size} tint={beaten ? undefined : '#10142a'} />
    </View> : <View style={look.locked}>
      <View style={look.padlock}><Icon name="lock" size={26} color="#ffffff" /></View>
    </View>}
  </View>
}

// The card's fill cut diagonally across the right edge of its art, as in the game's menus.
function Slant({ color }: { color: string }) {
  return <View pointerEvents="none" style={[look.slant, { backgroundColor: color }]} />
}

function StageTrail({ stage, stars, next, onPlay }: { stage: number, stars: Record<string, number>, next?: Level, onPlay: (level: Level) => void }) {
  const levels = stageLevels(stage)
  const fill = stageFill(stage)
  const boss = levels.at(-1)!
  const here = next?.stage === stage ? next : undefined
  return <View style={{ gap: 16 }}>
    <View style={[look.banner, { backgroundColor: fill, borderColor: stageRim(stage) }, cardDepth(fill)]}>
      <View style={{ height: 172 }}><StageScene stage={stage} stars={stars} open size={104} /></View>
      <View style={look.bannerBody}>
        <Text accessibilityRole="header" style={look.bannerTitle}>{STAGES[stage].name}</Text>
        <Text style={look.bannerCopy}>Stage {stage + 1} · Levels {levels[0].number}–{boss.number}. {STAGES[stage].blurb}</Text>
        <View style={look.foes}>{STAGES[stage].foes.map(type => <TypeBadge key={type} type={type} />)}</View>
        <View style={look.bannerFoot}>
          <View accessible accessibilityLabel={`${earned(stars, levels)} of ${levels.length * 3} stars`} style={look.starRow}>
            <PixelStar size={18} color={GOLD} />
            <Text style={look.count}>{earned(stars, levels)} / {levels.length * 3}</Text>
          </View>
          <Text style={look.bannerCopy}>Boss: Shadow {boss.spec.boss}</Text>
        </View>
      </View>
    </View>
    {here && <Button title={`Play Level ${here.number} · ${here.name}`} onPress={() => onPlay(here)} />}
    <Copy small>{STAR_GOALS.trail}</Copy>
    <View>
      {levels.map((level, index) => <LevelStop key={level.id} level={level} stars={stars[level.id] || 0} rim={stageRim(stage)} fill={fill}
        open={levelUnlocked(stars, level.number - 1)} current={level === next} first={index === 0} last={index === levels.length - 1}
        onPress={() => onPlay(level)} />)}
    </View>
  </View>
}

// One level as a stop on the trail: a marker on the dotted path (its number, a padlock, or the boss) and a card to play it.
function LevelStop({ level, stars, rim, fill, open, current, first, last, onPress }: {
  level: Level, stars: number, rim: string, fill: string, open: boolean, current: boolean, first: boolean, last: boolean, onPress: () => void
}) {
  const boss = level.spec.boss
  const weather = level.spec.weather && WEATHER[level.spec.weather].name
  const facts = [`${dims(level)} map`, `${level.spec.waves} waves`, weather].filter(Boolean).join(' · ')
  const walked = stars > 0
  return <View style={look.stop}>
    <View style={look.rail}>
      <Dots color={walked || current ? rim : colors.line} hidden={first} />
      <Marker number={level.number} boss={boss} beaten={walked} open={open} current={current} fill={fill} />
      <Dots color={walked ? rim : colors.line} hidden={last} />
    </View>
    <Pressable disabled={!open} onPress={onPress} accessibilityRole="button" accessibilityState={{ disabled: !open }}
      accessibilityLabel={open ? `Level ${level.number}, ${level.name}${boss ? `, boss: Shadow ${boss}` : ''}. ${facts}. ${stars} of 3 stars.`
        : `Level ${level.number}, locked. Clear Level ${level.number - 1} first.`}
      style={({ pressed }) => [look.level, current && look.levelCurrent, !open && look.levelShut, pressFeedback(pressed && open)]}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text numberOfLines={1} style={[look.levelName, !open && { color: colors.muted }]}>{level.name}</Text>
        <Text style={look.levelFacts}>{open ? `${boss ? `Boss: Shadow ${boss} · ` : ''}${facts}` : `Clear Level ${level.number - 1} first`}</Text>
        {open && <View style={look.levelStars}>
          {[0, 1, 2].map(index => <PixelStar key={index} size={15} color={colors.star} empty={index >= stars} />)}
        </View>}
      </View>
      {current ? <View style={look.play}><Icon name="resume" size={20} color={colors.onEdge} /></View>
        : open && <Icon name="chevron" size={22} color={colors.muted} />}
    </Pressable>
  </View>
}

function Marker({ number, boss, beaten, open, current, fill }: {
  number: number, boss?: string, beaten: boolean, open: boolean, current: boolean, fill: string
}) {
  const [pulse] = useState(() => new Animated.Value(1))
  useEffect(() => {
    if (!current || motionReduced()) return
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.1, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true })
    ]))
    loop.start()
    return () => loop.stop()
  }, [current, pulse])
  const style: ViewStyle = !open ? { backgroundColor: colors.sunken, borderColor: colors.line }
    : current ? { backgroundColor: colors.panel, borderColor: GOLD } : { backgroundColor: fill, borderColor: mix(fill, '#ffffff', 0.35) }
  return <Animated.View accessible={false} style={[look.marker, style, { transform: [{ scale: pulse }] }]}>
    {!open ? <Icon name="lock" size={20} color={colors.muted} />
      : boss ? <PixelSprite name={boss} size={46} tint={beaten ? undefined : current ? colors.ink : '#10142a'} />
        : <Text style={[look.markerText, current && { color: colors.ink }]}>{number}</Text>}
  </Animated.View>
}

// The path between stops, as footprints of square pixels.
function Dots({ color, hidden }: { color: string, hidden: boolean }) {
  return <View style={look.dots}>
    {!hidden && [0, 1, 2].map(index => <View key={index} style={[look.dot, { backgroundColor: color }]} />)}
  </View>
}

// A pixel-art star, built from runs of squares so it stays crisp beside the sprites at any size. Rows of [x, width] on a
// 7 by 7 grid; the lower half is shaded.
const STAR: [number, number][][] = [[[3, 1]], [[2, 3]], [[0, 7]], [[1, 5]], [[2, 3]], [[1, 2], [4, 2]], [[0, 2], [5, 2]]]
export function PixelStar({ size, color, empty = false }: { size: number, color: string, empty?: boolean }) {
  const unit = size / 7
  const tone = empty ? 'rgba(127, 127, 127, 0.35)' : color
  const shade = empty ? tone : mix(color.length === 7 ? color : GOLD, '#000000', 0.18)
  return <View accessible={false} style={{ width: size, height: size }}>
    {STAR.flatMap((runs, row) => runs.map(([x, width]) => <View key={`${row}-${x}`} style={{ position: 'absolute', left: x * unit, top: row * unit,
      width: width * unit + 0.5, height: unit + 0.5, backgroundColor: row >= 4 ? shade : tone }} />))}
  </View>
}

function cardDepth(fill: string): ViewStyle {
  return { boxShadow: `0px 4px 0px ${mix(fill.length === 7 ? fill : '#272b3d', '#000000', 0.45)}, 0px 10px 18px ${colors.shadow}` } as ViewStyle
}
function pressFeedback(pressed: boolean): ViewStyle | null {
  if (!pressed) return null
  return pressDepth(true) ?? { opacity: 0.88, transform: [{ scale: 0.985 }] }
}

const look = themedStyles(() => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4 },
  headerTitle: { flex: 1, fontFamily: displayFont(fonts.black), fontSize: retro() ? 28 : 30, lineHeight: 36, color: colors.ink },
  total: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 14, borderRadius: 999,
    backgroundColor: colors.panel, borderWidth: retro() ? 2 : 1, borderColor: retro() ? colors.frameOuter ?? colors.line : colors.line },
  totalText: { fontFamily: fonts.black, fontSize: 16, color: colors.ink, fontVariant: ['tabular-nums'] },
  card: { flexDirection: 'row', alignItems: 'center', height: CARD_HEIGHT, paddingRight: 12, borderWidth: 3, borderRadius: retro() ? 12 : 18,
    overflow: 'hidden' },
  current: { borderWidth: 3.5 },
  art: { width: ART_WIDTH, height: '100%', overflow: 'hidden' },
  slant: { position: 'absolute', left: ART_WIDTH - 16, top: -20, bottom: -20, width: 34, transform: [{ rotate: '10deg' }] },
  body: { flex: 1, gap: 4, paddingLeft: 14, paddingRight: 4 },
  name: { fontFamily: displayFont(fonts.black), fontSize: retro() ? 19 : 20, lineHeight: 24, color: '#ffffff' },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  count: { fontFamily: fonts.black, fontSize: 16, lineHeight: 20, color: '#ffffff', fontVariant: ['tabular-nums'] },
  line: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, color: 'rgba(255, 255, 255, 0.86)' },
  boss: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  locked: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16, 20, 42, 0.62)' },
  padlock: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.16)' },
  banner: { borderWidth: 3, borderRadius: retro() ? 12 : 20, overflow: 'hidden' },
  bannerBody: { padding: 16, gap: 10 },
  bannerTitle: { fontFamily: displayFont(fonts.black), fontSize: retro() ? 26 : 28, lineHeight: 34, color: '#ffffff' },
  bannerCopy: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: 'rgba(255, 255, 255, 0.88)' },
  bannerFoot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  foes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stop: { flexDirection: 'row', gap: 12, minHeight: 96 },
  rail: { width: 58, alignItems: 'center' },
  dots: { flex: 1, minHeight: 14, justifyContent: 'space-evenly', alignItems: 'center' },
  dot: { width: 5, height: 5 },
  marker: { width: 56, height: 56, borderRadius: 28, borderWidth: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  markerText: { fontFamily: displayFont(fonts.black), fontSize: 22, lineHeight: 26, color: '#ffffff', fontVariant: ['tabular-nums'] },
  level: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 6, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: retro() ? 10 : 16, backgroundColor: colors.panel, borderWidth: retro() ? 2 : 1.5,
    borderColor: retro() ? colors.frameOuter ?? colors.line : colors.line },
  levelCurrent: { borderColor: colors.star, borderWidth: 2.5 },
  levelShut: { backgroundColor: colors.sunken },
  levelName: { fontFamily: displayFont(fonts.heavy), fontSize: 17, lineHeight: 22, color: colors.ink },
  levelFacts: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  levelStars: { flexDirection: 'row', gap: 4, marginTop: 2 },
  play: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.edge }
}))
