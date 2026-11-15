import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, BackHandler, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import type { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { closeWelcome, useTour } from './tour'
import { hopTrack, slides } from './tour-plan'
import type { SlideId } from './tour-plan'
import { FEET, GUIDE, TourGuide } from './TourGuide'
import { usePreferences } from './preferences'
import { useReducedMotion } from './games/hooks'
import type { Direction } from './games/safari-zone'
import { PixelSprite } from './games/TeamPicker'
import { OverworldSprite } from './games/OverworldSprite'
import { SafariArt, TrailArt } from './games/GameArt'
import { Button, GradientFill, Icon, PokeballIcon, colors, displayFont, fonts, glass, retro, themedStyles, useTheme } from './ui'

// The welcome tour: five slides over the whole app, swiped or stepped through with Next. Each has a small picture of
// one part of the app (the adventure's milestones, the Journal's rising days, the Dex's cards, the games) and a few
// words under it. The guide Pokemon (src/TourGuide.tsx) hops from each picture to the next as the slides go by, in step
// with your finger: it faces the way it is going, rises in an arc over the gap and lands on the next picture's spot
// (src/tour-plan.ts). With reduced motion the slides change at once and it steps across without the arc.
// It opens on the first launch and from Settings → Welcome tour.

const native = Platform.OS !== 'web'
const MAX_WIDTH = 560
const SIDE = 16
// The room kept under the picture for the words.
const WORDS = 190

export function WelcomeTour() {
  const { welcome } = useTour()
  return welcome ? <Slides /> : null
}

function Slides() {
  useTheme()
  const reduced = useReducedMotion()
  const { name } = usePreferences()
  const [pager, setPager] = useState({ width: 0, height: 0 })
  const [page, setPage] = useState(0)
  const [facing, setFacing] = useState<Direction>('south')
  const [scrollX] = useState(() => new Animated.Value(0))
  const [fade] = useState(() => new Animated.Value(0))
  const [land] = useState(() => new Animated.Value(0))
  const scroller = useRef<ScrollView>(null)
  const last = page === slides.length - 1

  useEffect(() => {
    if (reduced) { fade.setValue(1); return }
    Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: native }).start()
  }, [fade, reduced])

  // The picture takes the room the words leave, up to a little taller than it is wide.
  const stage = { width: pager.width - 2 * SIDE, height: Math.round(Math.max(180, Math.min((pager.width - 2 * SIDE) * 1.2, pager.height - WORDS))) }
  const go = (to: number) => scroller.current?.scrollTo({ x: Math.max(0, Math.min(slides.length - 1, to)) * pager.width, animated: !reduced })
  // A new width (a turned tablet, a resized window) keeps the same slide.
  const shownPage = useRef(0)
  useEffect(() => { shownPage.current = page }, [page])
  useEffect(() => { if (pager.width) scroller.current?.scrollTo({ x: shownPage.current * pager.width, animated: false }) }, [pager.width])

  // Android's back button goes back a slide, and leaves the tour from the first.
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (shownPage.current > 0) scroller.current?.scrollTo({ x: (shownPage.current - 1) * pager.width, animated: !reduced })
      else closeWelcome()
      return true
    })
    return () => back.remove()
  }, [pager.width, reduced])

  // Landing: a quick squash as the guide comes to rest facing you.
  useEffect(() => {
    if (facing !== 'south' || reduced) return
    land.setValue(1)
    Animated.spring(land, { toValue: 0, stiffness: 260, damping: 11, mass: 0.6, useNativeDriver: native }).start()
  }, [facing, reduced, land])

  // The slide in view, and which way the guide faces: the way the slides are moving, then towards you at rest.
  useEffect(() => {
    if (!pager.width) return
    let lastX = shownPage.current * pager.width
    let facingNow: Direction = 'south'
    const listener = scrollX.addListener(({ value: x }) => {
      const at = x / pager.width
      const nearest = Math.round(at)
      if (nearest !== shownPage.current) { shownPage.current = nearest; setPage(nearest) }
      const next: Direction = Math.abs(at - nearest) <= 0.03 ? 'south' : x > lastX ? 'east' : x < lastX ? 'west' : facingNow
      lastX = x
      if (next !== facingNow) { facingNow = next; setFacing(next) }
    })
    return () => scrollX.removeListener(listener)
  }, [pager.width, scrollX])

  // The guide's path over all the slides, in the pager's own coordinates.
  const track = useMemo(() => {
    if (!pager.width) return null
    const path = hopTrack(slides.map(slide => slide.spot), pager.width, reduced ? 0 : 0.3)
    const left = (share: number) => SIDE + share * stage.width - GUIDE / 2
    const top = (share: number) => share * stage.height - GUIDE + FEET
    const along = (values: number[], place: (share: number) => number) =>
      scrollX.interpolate({ inputRange: path.input, outputRange: values.map(place), extrapolate: 'clamp' })
    return {
      x: along(path.x, left), y: along(path.y, top), ground: along(path.ground, top),
      // Stretched in the air, the shadow small and faint under it.
      stretch: scrollX.interpolate({ inputRange: path.input, outputRange: path.air.map(air => 1 + (reduced ? 0 : 0.1 * air)), extrapolate: 'clamp' }),
      shadow: scrollX.interpolate({ inputRange: path.input, outputRange: path.air.map(air => 1 - 0.55 * air), extrapolate: 'clamp' })
    }
  }, [pager.width, stage.width, stage.height, reduced, scrollX])

  return <Animated.View accessibilityViewIsModal style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, opacity: fade }]}>
    <SafeAreaView style={look.safe}>
      <View style={look.top}>
        {page > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Previous slide" hitSlop={6} onPress={() => go(page - 1)}
          style={({ pressed }) => [look.round, { opacity: pressed ? 0.6 : 1 }]}>
          <Icon name="back" size={22} color={colors.ink} />
        </Pressable>}
        <View style={{ flex: 1 }} />
        {!last && <Pressable accessibilityRole="button" accessibilityLabel="Skip the tour" hitSlop={6} onPress={closeWelcome}
          style={({ pressed }) => [look.skip, { opacity: pressed ? 0.6 : 1 }]}>
          <Text style={look.skipText}>Skip</Text>
        </Pressable>}
      </View>
      <View style={look.pager} onLayout={event => setPager({ width: Math.round(event.nativeEvent.layout.width), height: Math.round(event.nativeEvent.layout.height) })}>
        {pager.width > 0 && <Animated.ScrollView ref={scroller} horizontal pagingEnabled showsHorizontalScrollIndicator={false} bounces={false}
          scrollEventThrottle={16} onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: native })}>
          {slides.map((slide, index) => <View key={slide.id} style={{ width: pager.width, paddingHorizontal: SIDE }}
            aria-hidden={index !== page} importantForAccessibility={index === page ? 'auto' : 'no-hide-descendants'}>
            <View accessible={false} importantForAccessibility="no-hide-descendants" style={[look.stage, stage]}>
              <Scene id={slide.id} width={stage.width} height={stage.height} name={name} />
            </View>
            <View style={look.words}>
              <Text style={look.eyebrow}>{slide.eyebrow}</Text>
              <Text accessibilityRole="header" style={look.title}>{slide.title}</Text>
              <Text style={look.body}>{slide.body}</Text>
            </View>
          </View>)}
        </Animated.ScrollView>}
        {track && <>
          <Animated.View pointerEvents="none" style={[look.shadow, { transform: [{ translateX: track.x }, { translateY: track.ground }, { scale: track.shadow }] }]} />
          <Animated.View pointerEvents="none" style={[look.guide, { transform: [{ translateX: track.x }, { translateY: track.y }] }]}>
            <Animated.View style={{ transformOrigin: 'center bottom', transform: [
              { scaleY: Animated.multiply(track.stretch, land.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] })) },
              { scaleX: land.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] }}>
              <TourGuide facing={facing} />
            </Animated.View>
          </Animated.View>
        </>}
      </View>
      <View style={look.foot}>
        <View accessible accessibilityLabel={`Slide ${page + 1} of ${slides.length}`} style={look.dots}>
          {slides.map((slide, index) => <View key={slide.id} style={[look.dot, index === page && look.dotOn]} />)}
        </View>
        <Button title={last ? 'Start exploring' : 'Next'} onPress={() => last ? closeWelcome() : go(page + 1)} />
      </View>
    </SafeAreaView>
  </Animated.View>
}

type SceneProps = { width: number, height: number }
function Scene({ id, name, ...size }: SceneProps & { id: SlideId, name: string }) {
  if (id === 'welcome') return <WelcomeScene {...size} name={name} />
  if (id === 'adventure') return <AdventureScene {...size} />
  if (id === 'journal') return <JournalScene {...size} />
  if (id === 'dex') return <DexScene {...size} />
  return <PlayScene {...size} />
}

// A greeting over the ground the guide stands on, between an egg and a Poke Ball.
function WelcomeScene({ width, height, name }: SceneProps & { name: string }) {
  const mark = Math.round(height * 0.86)
  return <>
    <View style={{ position: 'absolute', left: (width - mark) / 2, top: height * 0.06, opacity: 0.55 }}><PokeballIcon size={mark} color={colors.mintLine} stroke={Math.round(mark / 12)} /></View>
    <View style={[art.ground, { left: width * 0.14, right: width * 0.14, top: height * 0.76, height: height * 0.15 }]} />
    <View style={[art.bubble, { top: Math.max(10, height * 0.84 - GUIDE - 54) }]}>
      <Text numberOfLines={1} style={art.bubbleText}>Hi, {name || 'Trainer'}!</Text>
      <View style={art.tail} />
    </View>
    <View style={{ position: 'absolute', left: width * 0.2 - 28, top: height * 0.84 - 52 }}><PixelSprite name="Egg" size={56} /></View>
    <View style={{ position: 'absolute', left: width * 0.8 - 20, top: height * 0.84 - 42 }}><PokeballIcon size={40} color={colors.edge} stroke={4} /></View>
    <View style={{ position: 'absolute', left: width * 0.1, top: height * 0.2 }}><Icon name="sparkle" size={22} color={colors.star} /></View>
    <View style={{ position: 'absolute', right: width * 0.1, top: height * 0.34 }}><Icon name="sparkle" size={16} color={colors.star} /></View>
  </>
}

// One adventure's milestones, an egg hatching and evolving every 5 km, over the trail the guide sets off along.
const MILESTONES: [form: string, at: string][] = [['Egg', 'Start'], ['Charmander', '5 km'], ['Charmeleon', '10 km'], ['Charizard', '15 km']]
function AdventureScene({ width, height }: SceneProps) {
  const column = (width - 32) / 4
  const box = Math.min(60, Math.round(column - 8))
  const dashes = Math.floor((width * 0.84) / 22)
  const pad = Math.min(14, height * 0.04)
  return <>
    <View style={[art.card, { left: 12, right: 12, top: 12, paddingVertical: pad }]}>
      {/* Through the middle of the milestones' dots, which sit above their captions. */}
      <View style={[art.rule, { bottom: pad + 24.5 }]} />
      {MILESTONES.map(([form, at], index) => <View key={form} style={art.milestone}>
        {/* Battle sprites carry empty space around the Pokemon, so they are drawn larger than their box, which crops them. */}
        <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <PixelSprite name={form} size={form === 'Egg' ? Math.round(box * 0.86) : Math.round(box * 1.35)} />
        </View>
        <View style={[art.node, index > 0 && { backgroundColor: colors.edge, borderColor: colors.edge }]} />
        <Text numberOfLines={1} style={art.caption}>{at}</Text>
      </View>)}
    </View>
    <View style={{ position: 'absolute', left: width * 0.08, top: height * 0.9 - 3, flexDirection: 'row', gap: 10 }}>
      {Array.from({ length: dashes }, (_, index) => <View key={index} style={art.dash} />)}
    </View>
    <View style={{ position: 'absolute', right: width * 0.07, top: height * 0.9 - 30 }}><Icon name="missions" size={28} color={colors.alt} /></View>
  </>
}

// The Journal's days as rising bars; the guide lands on the tallest.
const BARS = [0.76, 0.66, 0.56, 0.46]
function JournalScene({ width, height }: SceneProps) {
  const bar = width * 0.2025
  return <>
    <View style={{ position: 'absolute', left: width * 0.05, top: 14, gap: 8 }}>
      <View style={art.pill}><View style={[art.coin, { backgroundColor: colors.dangerTint }]}><Icon name="flame" size={15} color={colors.danger} /></View><Text style={art.pillText}>Streak</Text></View>
      <View style={art.pill}><View style={[art.coin, { backgroundColor: colors.goldTint }]}><Icon name="trophy" size={15} color={colors.gold} /></View><Text style={art.pillText}>Records</Text></View>
    </View>
    {BARS.map((top, index) => <View key={top} style={[art.bar, { left: width * (0.05 + index * 0.2325), width: bar, top: height * top, height: height * (0.93 - top) },
      index < BARS.length - 1 && { backgroundColor: colors.mintLine }]}>
      {index === BARS.length - 1 && <GradientFill radius={retro() ? 4 : 10} />}
    </View>)}
    <View style={[art.base, { left: width * 0.03, right: width * 0.03, top: height * 0.93 }]} />
  </>
}

// Three Dex cards; the middle one is the buddy's, where the guide lands.
function DexScene({ width, height }: SceneProps) {
  const card = { width: width * 0.28, height: height * 0.64, top: height * 0.17 }
  // The same overworld art and size as the guide, standing still so the guide is the lively one.
  const side = (name: string, number: string, left: number) => <View style={[art.dex, card, { left, overflow: 'hidden' }]}>
    <Text style={art.number}>{number}</Text>
    <View style={[art.cushion, { left: card.width * 0.14, right: card.width * 0.14, top: card.height * 0.74, height: card.height * 0.13 }]} />
    <View style={{ position: 'absolute', left: (card.width - GUIDE) / 2 - 2, top: height * 0.7 - card.top - GUIDE + FEET - 2 }}>
      <OverworldSprite name={name} size={GUIDE} still />
    </View>
  </View>
  return <>
    {side('Bulbasaur', '#001', width * 0.05)}
    <View style={[art.dex, art.dexOn, card, { left: width * 0.36 }]}>
      <View style={art.tag}><Text style={art.tagText}>Buddy</Text></View>
      <View style={[art.cushion, { left: card.width * 0.14, right: card.width * 0.14, top: card.height * 0.74, height: card.height * 0.13 }]} />
    </View>
    {side('Squirtle', '#007', width * 0.67)}
  </>
}

// Two of the games beside the winner's stand the guide lands on.
function PlayScene({ width, height }: SceneProps) {
  const tile = { width: Math.round(width * 0.46), height: Math.round(height * 0.38) }
  return <>
    <View style={[art.tile, tile, { left: 12, top: 12 }]}><TrailArt {...tile} /></View>
    <View style={[art.tile, tile, { left: 12, top: height - 12 - tile.height }]}><SafariArt {...tile} /></View>
    {[[0.63, 0.2, 20], [0.76, 0.1, 28], [0.89, 0.2, 20]].map(([x, y, size]) => <View key={x} style={{ position: 'absolute', left: width * x - size / 2, top: height * y }}>
      <Icon name="star" size={size} color={colors.star} />
    </View>)}
    <View style={[art.stand, { left: width * 0.6, width: width * 0.32, top: height * 0.78, height: height * 0.22 - 10 }]}>
      <GradientFill radius={retro() ? 4 : 10} />
    </View>
  </>
}

const look = themedStyles(() => ({
  safe: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  top: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SIDE },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunken, borderWidth: 1, borderColor: colors.line },
  skip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 },
  skipText: { fontFamily: fonts.heavy, fontSize: 15, lineHeight: 20, color: colors.edge },
  pager: { flex: 1 },
  // In Emerald, framed like the game's text boxes.
  stage: retro()
    ? { backgroundColor: colors.mint, borderRadius: 10, borderWidth: 2, borderColor: colors.frameOuter ?? colors.edge, overflow: 'hidden' }
    : { backgroundColor: colors.mint, borderRadius: 28, borderWidth: 1, borderColor: colors.mintLine, overflow: 'hidden' },
  words: { alignItems: 'center', gap: 6, paddingTop: 22, paddingHorizontal: 8 },
  eyebrow: { fontFamily: displayFont(), fontSize: 12, lineHeight: 16, letterSpacing: retro() ? 1.4 : 1.1, color: colors.edge, textTransform: 'uppercase' },
  title: { fontFamily: displayFont(fonts.black), fontSize: retro() ? 24 : 26, lineHeight: 32, color: colors.ink, textAlign: 'center' },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center', maxWidth: 420 },
  guide: { position: 'absolute', left: 0, top: 0, width: GUIDE, height: GUIDE },
  shadow: { position: 'absolute', left: GUIDE / 2 - 24, top: GUIDE - FEET - 6, width: 48, height: 12, borderRadius: 6, backgroundColor: 'rgba(10, 20, 30, 0.22)' },
  foot: { paddingHorizontal: SIDE, paddingTop: 8, paddingBottom: 16, gap: 16 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, height: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line },
  dotOn: { width: 24, backgroundColor: colors.edge }
}))

const art = themedStyles(() => ({
  ground: { position: 'absolute', borderRadius: 999, backgroundColor: colors.mintLine },
  bubble: { position: 'absolute', alignSelf: 'center', maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 7, borderRadius: retro() ? 8 : 16,
    backgroundColor: colors.panel, borderWidth: retro() ? 2 : 1, borderColor: retro() ? colors.frameOuter ?? colors.edge : colors.line },
  bubbleText: { fontFamily: displayFont(), fontSize: 15, lineHeight: 20, color: colors.ink },
  tail: { position: 'absolute', alignSelf: 'center', bottom: -6, width: 10, height: 10, backgroundColor: colors.panel, transform: [{ rotate: '45deg' }],
    borderRightWidth: retro() ? 2 : 1, borderBottomWidth: retro() ? 2 : 1, borderColor: retro() ? colors.frameOuter ?? colors.edge : colors.line },
  card: { position: 'absolute', flexDirection: 'row', backgroundColor: colors.panel, borderRadius: retro() ? 8 : 18, borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: 4 },
  milestone: { flex: 1, alignItems: 'center', gap: 4 },
  rule: { position: 'absolute', left: '12.5%', right: '12.5%', height: 3, borderRadius: 2, backgroundColor: colors.mintLine },
  node: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.panel, borderWidth: 3, borderColor: colors.mintLine },
  caption: { fontFamily: displayFont(fonts.bold), fontSize: 12, lineHeight: 16, color: colors.ink },
  dash: { width: 12, height: 5, borderRadius: 3, backgroundColor: colors.mintLine },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', paddingLeft: 5, paddingRight: 12, height: 32, borderRadius: retro() ? 8 : 16,
    backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  coin: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 17, color: colors.ink },
  bar: { position: 'absolute', borderTopLeftRadius: retro() ? 4 : 10, borderTopRightRadius: retro() ? 4 : 10, backgroundColor: colors.brandFrom, overflow: 'hidden' },
  base: { position: 'absolute', height: 3, borderRadius: 2, backgroundColor: colors.mintLine },
  dex: { position: 'absolute', backgroundColor: colors.panel, borderRadius: retro() ? 8 : 16, borderWidth: retro() ? 2 : 1,
    borderColor: retro() ? colors.frameOuter ?? colors.edge : colors.line },
  dexOn: { borderWidth: 2, borderColor: colors.edge, boxShadow: `0px 6px 16px ${colors.glow}` },
  number: { fontFamily: displayFont(fonts.bold), fontSize: 12, lineHeight: 16, color: colors.muted, paddingLeft: 8, paddingTop: 6 },
  tag: { alignSelf: 'center', marginTop: 8, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.edge },
  tagText: { fontFamily: fonts.heavy, fontSize: 12, lineHeight: 16, color: colors.onEdge },
  cushion: { position: 'absolute', borderRadius: 999, backgroundColor: colors.mint },
  tile: { position: 'absolute', borderRadius: retro() ? 8 : 14, overflow: 'hidden', backgroundColor: colors.sunken, borderWidth: retro() ? 2 : 1,
    borderColor: retro() ? colors.frameOuter ?? colors.edge : glass(0.6) },
  stand: { position: 'absolute', borderTopLeftRadius: retro() ? 4 : 10, borderTopRightRadius: retro() ? 4 : 10, backgroundColor: colors.brandFrom, overflow: 'hidden' }
}))
