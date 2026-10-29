import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Platform, Text, View } from 'react-native'
import { pokemonType } from '../catalog'
import { Button, Copy, Eyebrow, Panel, colors, fonts, themedStyles, typeInks } from '../ui'
import { RESET_COOLDOWN, resetDue } from '../expedition-encounter'
import type { ActiveEncounter } from '../expedition-encounter'
import { Sparkles } from './SafariEncounter'
import { PixelSprite } from './TeamPicker'

const native = Platform.OS !== 'web'
type Confirm = 'none' | 'reset' | 'shiny' | 'shiny-final'

// The shrine chamber between the trial and the battle. The Legendary's current result is revealed as it slides in. From
// here: BATTLE, RESET ENCOUNTER (a confirmed reset, a five-second wait, then one new roll) or LEAVE CHAMBER. The wait is
// saved as a clock time, so leaving and coming back resumes it.
export function LegendaryChamber({ encounter, number, reduced, busy, onBattle, onReset, onSettle, onLeave }: {
  encounter: ActiveEncounter & { shiny: boolean }, number: number, reduced: boolean, busy: boolean,
  onBattle: () => void, onReset: (discardShiny: boolean) => void, onSettle: () => void, onLeave: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const [confirm, setConfirm] = useState<Confirm>('none')
  const lastTry = useRef(0)
  const settle = useRef(onSettle)
  useEffect(() => { settle.current = onSettle })
  const pending = encounter.resetPending
  useEffect(() => {
    if (!pending) return
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [pending])
  // Finishes a due reset, including one left running when the app closed. The clock is read fresh here: the ticking now
  // can be a moment old, and an old one looks like a turned-back clock. Until the saved encounter shows the new roll,
  // it asks again about once a second, so one early or failed attempt never leaves the reset stuck at 0.
  const due = pending && resetDue(encounter, now)
  useEffect(() => {
    if (!due || !resetDue(encounter, Date.now()) || Date.now() - lastTry.current < 1000) return
    lastTry.current = Date.now()
    settle.current()
  }, [due, now, encounter])
  const remaining = Math.min(RESET_COOLDOWN, Math.max(0, encounter.nextResetAllowedAt - now)) / 1000
  const ink = typeInks[pokemonType(encounter.name)] || colors.edge
  const label = `${encounter.shiny ? 'Shiny ' : ''}${encounter.name}`
  return <Panel style={{ backgroundColor: look.shrine.backgroundColor, borderColor: ink }}>
    <Eyebrow color={colors.goldTint}>EXPEDITION {number} · PRE-BATTLE CHAMBER</Eyebrow>
    <Reveal key={encounter.attempt} encounter={encounter} pending={pending} reduced={reduced} glow={ink} />
    <Text accessibilityLiveRegion="polite" style={look.title}>
      {pending ? 'The shrine is gathering energy…' : encounter.shiny ? `✦ A Shiny ${encounter.name} appeared! ✦` : `A wild ${encounter.name} appeared!`}
    </Text>
    <Text style={look.detail}>ATTEMPT #{encounter.attempt} · {pending ? `NEW RESULT IN ${remaining.toFixed(1)} s` : encounter.shiny ? 'SHINY COLOURING' : 'NORMAL COLOURING'}</Text>
    {confirm === 'none' ? <View style={{ gap: 10 }}>
      <Button title="▶ BATTLE" disabled={pending || busy} onPress={onBattle} />
      <Button title={pending ? `↻ RESETTING… ${remaining.toFixed(1)} s` : '↻ RESET ENCOUNTER'} secondary disabled={pending || busy}
        onPress={() => setConfirm(encounter.shiny ? 'shiny' : 'reset')} />
      <Button title="◀ LEAVE CHAMBER" secondary disabled={busy} onPress={onLeave} />
    </View> : <View style={look.confirm}>
      {confirm === 'reset' ? <>
        <Text style={look.confirmTitle}>Reset this encounter?</Text>
        <Text style={look.confirmText}>{encounter.name} stays the same and your trial stays finished. After 5 seconds the shrine rolls again: a 1 in 100 chance of a Shiny.</Text>
        <Button title="Reset encounter" disabled={busy} onPress={() => { setConfirm('none'); onReset(false) }} />
      </> : confirm === 'shiny' ? <>
        <Text style={[look.confirmTitle, { color: colors.gold }]}>✦ This {encounter.name} is SHINY ✦</Text>
        <Text style={look.confirmText}>Resetting throws this Shiny away for a new 1 in 100 roll. Most resets will not bring it back.</Text>
        <Button title="I understand, continue" secondary disabled={busy} onPress={() => setConfirm('shiny-final')} />
      </> : <>
        <Text style={[look.confirmTitle, { color: colors.danger }]}>Discard the Shiny {encounter.name}?</Text>
        <Text style={look.confirmText}>This cannot be undone.</Text>
        <Button title="Discard the Shiny and reset" disabled={busy} onPress={() => { setConfirm('none'); onReset(true) }} />
      </>}
      <Button title={encounter.shiny ? 'Keep the Shiny' : 'Keep this encounter'} secondary onPress={() => setConfirm('none')} />
    </View>}
    <Copy small color={look.detail.color}>Each roll has a 1 in 100 Shiny chance. Leaving or closing the app keeps {pending ? 'the reset going' : `this ${label}`}; nothing rerolls unless you reset here. Resetting is only possible before the battle.</Copy>
  </Panel>
}

// The Legendary slides in from the right over a flash of light, then breathes in place. Shinies sparkle.
function Reveal({ encounter, pending, reduced, glow }: { encounter: ActiveEncounter & { shiny: boolean }, pending: boolean, reduced: boolean, glow: string }) {
  const [width, setWidth] = useState(0)
  const [enter] = useState(() => new Animated.Value(reduced ? 1 : 0))
  const [bob] = useState(() => new Animated.Value(0))
  useEffect(() => {
    if (reduced) { enter.setValue(1); return }
    const run = Animated.sequence([Animated.delay(150), Animated.timing(enter, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: native })])
    run.start()
    return () => run.stop()
  }, [enter, reduced])
  useEffect(() => {
    if (reduced || pending) { bob.setValue(0); return }
    const loop = Animated.loop(Animated.sequence([Animated.timing(bob, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      Animated.timing(bob, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: native })]))
    loop.start()
    return () => loop.stop()
  }, [bob, reduced, pending])
  const size = Math.round(Math.min(width, 420) * 0.5)
  const height = size + 36
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ alignSelf: 'stretch', height: height || 220, overflow: 'hidden', borderRadius: 14 }}>
    {width > 0 && <>
      <View style={[look.halo, { left: width / 2 - size * 0.55, top: height - 18 - size * 0.12, width: size * 1.1, height: size * 0.24, borderRadius: size, backgroundColor: glow }]} />
      <Animated.View accessible accessibilityRole="image" accessibilityLabel={`${encounter.shiny ? 'Shiny ' : ''}${encounter.name}`}
        style={{ position: 'absolute', left: width / 2 - size / 2, top: height - size - 18, opacity: pending ? 0.25 : 1,
          transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }) },
            { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }}>
        <PixelSprite name={encounter.name} shiny={encounter.shiny} size={size} />
      </Animated.View>
      {encounter.shiny && !pending && <Sparkles centre={{ x: width / 2, y: height - 18 - size / 2 }} size={size} reduced={reduced} />}
      {!reduced && <Animated.View pointerEvents="none" style={[look.flash, { width, height, opacity: enter.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.9, 0.3, 0] }) }]} />}
    </>}
  </View>
}

const look = themedStyles(() => ({
  shrine: { backgroundColor: '#1d1a33' },
  halo: { position: 'absolute', opacity: 0.5 },
  flash: { position: 'absolute', left: 0, top: 0, backgroundColor: '#ffffff' },
  title: { color: '#f7f3e3', fontFamily: fonts.black, fontSize: 20, lineHeight: 26, textAlign: 'center' },
  detail: { color: '#c9c2e6', fontFamily: fonts.heavy, fontSize: 12, lineHeight: 16, letterSpacing: 1.1, textAlign: 'center' },
  confirm: { gap: 10, padding: 14, borderRadius: 16, backgroundColor: colors.panel },
  confirmTitle: { color: colors.ink, fontFamily: fonts.black, fontSize: 18, lineHeight: 24 },
  confirmText: { color: colors.ink, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 }
}))
