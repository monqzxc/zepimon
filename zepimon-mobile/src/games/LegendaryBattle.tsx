import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Image, Platform, Pressable, Text, View } from 'react-native'
import type { ImageSourcePropType, ViewStyle } from 'react-native'
import { pokemonType } from '../catalog'
import { safariSprites } from '../generated/safari-assets.js'
import { Button, Copy, PokeballIcon, fonts } from '../ui'
import { FOE_HP, attackWith, chooseMenu, finishAttack, finishIntro, finishThrow, runFromBattle, startBattle, throwBall } from './legendary-battle'
import type { BattleMenu, LegendaryBattle as Battle } from './legendary-battle'
import { hitSheet } from './MoveFx'
import { Sparkles } from './SafariEncounter'
import { PixelSprite } from './TeamPicker'

type Strip = { source: ImageSourcePropType, frames: number, width: number, height: number }
const pixelated = Platform.OS === 'web' ? { imageRendering: 'pixelated' as const } : {}
const backgrounds = safariSprites as Record<'battleGrass' | 'battlePond', Strip>
// Emerald's battle layout on its 240 x 112 background: the wild Pokemon on the far platform, the partner on the near one.
const FOE = { x: 176 / 240, feet: 82 / 112 }
const PARTNER = { x: 62 / 240, feet: 118 / 112 }
// The GBA battle palette: off-white boxes with slate borders, and the green / yellow / red HP bar.
const GBA = { box: '#f8f8f0', border: '#283850', text: '#303030', shade: '#d0d0c8', menu: '#f8f8f8', pick: '#e05840', bar: '#48c058', mid: '#f0b828', low: '#e83820' }
const hpColor = (hp: number) => hp <= 20 ? GBA.low : hp <= 50 ? GBA.mid : GBA.bar
const STEP_MS = { intro: 1100, attack: 900, ball: 650, shake: 450 }

// The Legendary battle (src/games/legendary-battle.ts holds its rules): Emerald's background and boxes, an entrance from
// both sides, an idle bob, a lunge and a type-coloured hit, and a thrown Poké Ball that shakes before it holds or opens.
// onCaught saves the catch; it runs once, only after a ball holds.
export function LegendaryBattle({ foe, partner, number, reduced, onCaught, onLeave, onDone }: {
  foe: { name: string, shiny: boolean }, partner: { name: string, shiny: boolean }, number: number, reduced: boolean,
  onCaught: () => Promise<void>, onLeave: () => void, onDone: () => void
}) {
  const [battle, setBattle] = useState(() => startBattle(foe, partner))
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [error, setError] = useState('')
  const [width, setWidth] = useState(0)
  const caught = useRef(onCaught)
  useEffect(() => { caught.current = onCaught })
  const anim = useBattleAnimation(battle, width, reduced)
  // Each timed phase moves on by itself once its animation has played.
  useEffect(() => {
    const wait = battle.phase === 'intro' ? STEP_MS.intro : battle.phase === 'attack' ? STEP_MS.attack
      : battle.phase === 'throw' && battle.ball ? STEP_MS.ball + (battle.ball.shakes + 1) * STEP_MS.shake : null
    if (wait === null) return
    const next = battle.phase === 'intro' ? finishIntro : battle.phase === 'attack' ? finishAttack : finishThrow
    const timer = setTimeout(() => setBattle(next), reduced ? 300 : wait)
    return () => clearTimeout(timer)
  }, [battle.phase, battle.turn, battle.ball, reduced])
  function save() {
    setSaving('saving'); setError('')
    caught.current().then(() => setSaving('saved'))
      .catch(reason => { setSaving('failed'); setError(reason instanceof Error ? reason.message : 'Could not save your catch. Try again.') })
  }
  const saveOnce = useRef(false)
  useEffect(() => {
    if (battle.phase !== 'caught' || saveOnce.current) return
    saveOnce.current = true
    save()
  }, [battle.phase])
  const height = width * 112 / 240
  const foeSize = Math.round(width * 0.36)
  const partnerSize = Math.round(width * 0.4)
  const foeAt = { x: width * FOE.x, y: height * FOE.feet }
  const partnerAt = { x: width * PARTNER.x, y: height * PARTNER.feet }
  const water = ['water', 'ice'].includes(pokemonType(foe.name))
  const sheet = battle.hit ? hitSheet(battle.hit.move.type) as Strip : null
  const done = battle.phase === 'caught' || battle.phase === 'out' || battle.phase === 'fled'
  return <View style={gba.frame}>
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ alignSelf: 'stretch', height: height || 160, overflow: 'hidden' }}>
      {width > 0 && <>
        <Image source={(water ? backgrounds.battlePond : backgrounds.battleGrass).source} fadeDuration={0} resizeMode="stretch"
          style={{ position: 'absolute', left: 0, top: 0, width, height, ...pixelated }} />
        <Animated.View style={{ position: 'absolute', left: foeAt.x - foeSize / 2, top: foeAt.y - foeSize, opacity: anim.foeOpacity,
          transform: [{ translateX: anim.foeX }, { translateY: anim.foeBob }, { scale: anim.foeScale }] }}>
          <PixelSprite name={foe.name} shiny={foe.shiny} size={foeSize} />
        </Animated.View>
        <Animated.View style={{ position: 'absolute', left: partnerAt.x - partnerSize / 2, top: partnerAt.y - partnerSize,
          transform: [{ translateX: anim.partnerX }, { scaleX: -1 }] }}>
          <PixelSprite name={partner.name} shiny={partner.shiny} size={partnerSize} />
        </Animated.View>
        {battle.phase === 'attack' && sheet && <HitBurst key={battle.turn} sheet={sheet} centre={{ x: foeAt.x, y: foeAt.y - foeSize / 2 }} size={foeSize * 0.7} reduced={reduced} />}
        {battle.ball && (battle.phase === 'throw' || battle.phase === 'caught') && <Animated.View pointerEvents="none" style={{ position: 'absolute',
          left: anim.ballX, top: anim.ballY, transform: [{ rotate: anim.ballTurn }] }}>
          <PokeballIcon size={Math.max(18, Math.round(width * 0.07))} color={GBA.border} />
        </Animated.View>}
        {foe.shiny && battle.phase === 'choose' && battle.turn === 0 && <Sparkles centre={{ x: foeAt.x, y: foeAt.y - foeSize / 2 }} size={foeSize} reduced={reduced} />}
        <StatusBox style={{ left: width * 0.03, top: height * 0.06 }} name={foe.name} shiny={foe.shiny} level={battle.foe.level} hp={battle.foe.hp} width={width * 0.46} />
        <StatusBox style={{ right: width * 0.03, bottom: height * 0.03 }} name={partner.name} shiny={partner.shiny} level={battle.partner.level} hp={FOE_HP} width={width * 0.44} />
        {!reduced && <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height, backgroundColor: '#ffffff', opacity: anim.flash }} />}
      </>}
    </View>
    <View style={gba.textbox}>
      <View style={gba.message}><Text accessibilityLiveRegion="polite" style={gba.messageText}>{battle.message}</Text></View>
      {battle.phase === 'choose' && <Menu battle={battle} onChange={setBattle} />}
    </View>
    {battle.phase === 'caught' && <View style={gba.after}>
      {saving === 'saved' ? <>
        <Text style={gba.afterText}>{foe.shiny ? 'Shiny ' : ''}{foe.name}’s data was added to your Dex.</Text>
        <Button title="Continue" onPress={onDone} />
      </> : saving === 'failed' ? <>
        <Copy color={GBA.low}>{error}</Copy>
        <Button title="Try saving again" onPress={save} />
      </> : <Button title="Saving your new friend…" loading onPress={() => {}} />}
    </View>}
    {(battle.phase === 'out' || battle.phase === 'fled') && <View style={gba.after}>
      <Button title="Back to the chamber" onPress={onLeave} />
    </View>}
    {!done && <Text style={gba.footer}>EXPEDITION {number} · Poké Balls ×{battle.balls} · Moves never knock the Legendary out.</Text>}
  </View>
}

function StatusBox({ name, shiny, level, hp, width, style }: {
  name: string, shiny: boolean, level: number, hp: number, width: number, style: ViewStyle
}) {
  return <View accessible accessibilityLabel={`${shiny ? 'Shiny ' : ''}${name}, level ${level}, HP ${Math.round(hp)} percent`}
    style={[gba.status, { width }, style]}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 4 }}>
      <Text numberOfLines={1} style={[gba.statusName, { flexShrink: 1 }]}>{name.toUpperCase()}{shiny ? ' ✦' : ''}</Text>
      <Text style={gba.statusName}>Lv{level}</Text>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Text style={gba.hpLabel}>HP</Text>
      <View style={gba.hpTrack}><View style={{ width: `${hp / FOE_HP * 100}%`, height: '100%', backgroundColor: hpColor(hp) }} /></View>
    </View>
  </View>
}

// FIGHT / BAG / POKéMON / RUN, and the move and bag lists behind them, as two-by-two grids.
function Menu({ battle, onChange }: { battle: Battle, onChange: (battle: Battle) => void }) {
  const open = (menu: BattleMenu) => onChange(chooseMenu(battle, menu))
  const items: [string, () => void, boolean?][] = battle.menu === 'fight'
    ? [...[0, 1, 2, 3].map(index => [battle.moves[index]?.name.toUpperCase() ?? '—', () => onChange(attackWith(battle, index)), !battle.moves[index]] as [string, () => void, boolean]),
      ['◀ BACK', () => open('main')]]
    : battle.menu === 'bag' ? [[`POKé BALL ×${battle.balls}`, () => onChange(throwBall(battle)), battle.balls < 1], ['◀ BACK', () => open('main')]]
    : battle.menu === 'party' ? [['◀ BACK', () => open('main')]]
    : [['FIGHT', () => open('fight')], ['BAG', () => open('bag')], ['POKéMON', () => open('party')], ['RUN', () => onChange(runFromBattle(battle))]]
  return <View style={gba.menu}>
    {items.map(([label, press, disabled], index) => <Pressable key={index} accessibilityRole="button" accessibilityLabel={label.replace('◀ ', '')}
      disabled={!!disabled} onPress={press} style={({ pressed }) => [gba.option, pressed && { backgroundColor: GBA.shade }, disabled && { opacity: 0.4 }]}>
      <Text style={gba.optionText}>{label.startsWith('◀') ? label : `▶ ${label}`}</Text>
    </Pressable>)}
  </View>
}

// A move landing on the Legendary: its Gen III strip plays once, or shows a still frame with reduced motion.
function HitBurst({ sheet, centre, size, reduced }: { sheet: Strip, centre: { x: number, y: number }, size: number, reduced: boolean }) {
  const [frame, setFrame] = useState(reduced ? Math.floor((sheet.frames - 1) / 2) : 0)
  useEffect(() => {
    if (reduced) return
    const timer = setInterval(() => setFrame(current => Math.min(sheet.frames - 1, current + 1)), 90)
    return () => clearInterval(timer)
  }, [reduced, sheet.frames])
  const height = size * sheet.height / sheet.width
  return <View pointerEvents="none" style={{ position: 'absolute', left: centre.x - size / 2, top: centre.y - height / 2, width: size, height, overflow: 'hidden' }}>
    <Image source={sheet.source} fadeDuration={0} resizeMode="stretch" accessible={false}
      style={{ position: 'absolute', top: 0, left: -frame * size, width: size * sheet.frames, height, ...pixelated }} />
  </View>
}

// The battle's motion, driven by its phase: entrances and a flash at the start, an idle bob while choosing, a lunge and
// hit flicker on attacks, and a ball arc, shakes and capture on throws. Reduced motion keeps everything still.
function useBattleAnimation(battle: Battle, width: number, reduced: boolean) {
  const [values] = useState(() => ({ enter: new Animated.Value(reduced ? 1 : 0), bob: new Animated.Value(0), lunge: new Animated.Value(0),
    hit: new Animated.Value(1), arc: new Animated.Value(0), shake: new Animated.Value(0), capture: new Animated.Value(0) }))
  const { enter, bob, lunge, hit, arc, shake, capture } = values
  const timing = (value: Animated.Value, toValue: number, duration: number, easing = Easing.linear) =>
    Animated.timing(value, { toValue, duration, easing, useNativeDriver: false })
  useEffect(() => {
    if (reduced || !width) { enter.setValue(1); return }
    const run = timing(enter, 1, 800, Easing.out(Easing.cubic))
    run.start()
    return () => run.stop()
  }, [width > 0, reduced]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (reduced || battle.phase !== 'choose') { bob.setValue(0); return }
    const loop = Animated.loop(Animated.sequence([timing(bob, 1, 600, Easing.inOut(Easing.sin)), timing(bob, 0, 600, Easing.inOut(Easing.sin))]))
    loop.start()
    return () => loop.stop()
  }, [battle.phase, reduced]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (battle.phase !== 'attack' || reduced) return
    const run = Animated.parallel([Animated.sequence([timing(lunge, 1, 140), timing(lunge, 0, 220)]),
      Animated.sequence([Animated.delay(200), ...[0, 1, 2].flatMap(() => [timing(hit, 0.15, 70), timing(hit, 1, 70)])])])
    run.start()
    return () => run.stop()
  }, [battle.phase, battle.turn, reduced]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (battle.phase === 'choose') { capture.setValue(0); arc.setValue(0); shake.setValue(0) }
    if (battle.phase !== 'throw' || !battle.ball) return
    if (reduced) { arc.setValue(1); capture.setValue(1); return }
    arc.setValue(0); capture.setValue(0); shake.setValue(0)
    const shakes = Array.from({ length: battle.ball.shakes }, () =>
      Animated.sequence([timing(shake, 1, 110), timing(shake, -1, 170), timing(shake, 0, 110), Animated.delay(60)]))
    const run = Animated.sequence([timing(arc, 1, STEP_MS.ball, Easing.out(Easing.quad)), timing(capture, 1, 180), ...shakes,
      ...(battle.ball.caught ? [] : [timing(capture, 0, 160)])])
    run.start()
    return () => run.stop()
  }, [battle.phase, battle.turn, reduced]) // eslint-disable-line react-hooks/exhaustive-deps
  const height = width * 112 / 240
  const foeSize = width * 0.36
  const ball = Math.max(18, Math.round(width * 0.07))
  const from = { x: width * PARTNER.x - ball / 2, y: height * 0.75 }
  const to = { x: width * FOE.x - ball / 2, y: height * FOE.feet - foeSize * 0.45 - ball / 2 }
  return {
    // The Legendary slides in from the right, the partner from the left; the partner lunges toward it to attack.
    foeX: enter.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }),
    partnerX: Animated.add(enter.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] }),
      lunge.interpolate({ inputRange: [0, 1], outputRange: [0, width * 0.08] })),
    flash: enter.interpolate({ inputRange: [0, 0.15, 0.3, 0.45, 1], outputRange: [0.85, 0, 0.6, 0, 0] }),
    foeBob: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }),
    foeOpacity: Animated.multiply(hit, capture.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })),
    foeScale: capture.interpolate({ inputRange: [0, 1], outputRange: [1, 0.2] }),
    ballX: arc.interpolate({ inputRange: [0, 1], outputRange: [from.x, to.x] }),
    ballY: arc.interpolate({ inputRange: [0, 0.5, 1], outputRange: [from.y, Math.min(from.y, to.y) - height * 0.35, to.y] }),
    ballTurn: shake.interpolate({ inputRange: [-1, 1], outputRange: ['-25deg', '25deg'] })
  }
}

const gba = {
  frame: { borderWidth: 4, borderColor: GBA.border, borderRadius: 10, overflow: 'hidden' as const, backgroundColor: GBA.box },
  textbox: { borderTopWidth: 4, borderColor: GBA.border, backgroundColor: '#3a4a6a', padding: 6, gap: 6 },
  message: { backgroundColor: GBA.menu, borderRadius: 6, borderWidth: 2, borderColor: '#9aa8c0', paddingHorizontal: 12, paddingVertical: 10, minHeight: 64 },
  messageText: { color: GBA.text, fontFamily: fonts.heavy, fontSize: 16, lineHeight: 22 },
  menu: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, backgroundColor: GBA.menu, borderRadius: 6, borderWidth: 2, borderColor: GBA.pick, padding: 4 },
  option: { width: '50%' as const, minHeight: 48, justifyContent: 'center' as const, paddingHorizontal: 10, borderRadius: 4 },
  optionText: { color: GBA.text, fontFamily: fonts.black, fontSize: 15, lineHeight: 20, letterSpacing: 0.5 },
  status: { position: 'absolute' as const, backgroundColor: GBA.box, borderWidth: 2, borderColor: GBA.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, gap: 2 },
  statusName: { color: GBA.text, fontFamily: fonts.black, fontSize: 11, lineHeight: 14 },
  hpLabel: { color: '#f8b000', fontFamily: fonts.black, fontSize: 9, lineHeight: 12, backgroundColor: '#505050', paddingHorizontal: 3, borderRadius: 2 },
  hpTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#505050', overflow: 'hidden' as const },
  after: { padding: 10, gap: 8, backgroundColor: GBA.box },
  afterText: { color: GBA.text, fontFamily: fonts.heavy, fontSize: 15, lineHeight: 21 },
  footer: { color: '#5a6478', fontFamily: fonts.heavy, fontSize: 11, lineHeight: 15, padding: 8, textAlign: 'center' as const }
}
