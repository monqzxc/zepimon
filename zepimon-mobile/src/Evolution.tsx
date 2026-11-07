import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native'
import { EvolveFx } from './games/BattleFx'
import { EVOLVE_MS } from './games/battle'
import { PixelSprite } from './games/TeamPicker'
import { changeVerb } from './phone-adventure'
import { Button, fonts } from './ui'

const native = Platform.OS !== 'web'
// The beat before it starts, with the old form on its own: "What? Ivysaur is evolving!"
const INTRO_MS = 1100

const calling = { hatched: 'Oh? The egg is hatching!', 'Mega Evolved': 'is Mega Evolving!', Dynamaxed: 'is Dynamaxing!',
  Gigantamaxed: 'is Gigantamaxing!', evolved: 'is evolving!' }

// A hatch or evolution on the Adventure screen, over everything there, as in the games: the old form stands alone
// ("What? Ivysaur is evolving!"), then the 1.5 s evolution (src/games/BattleFx.tsx) and the new form, congratulated,
// until Continue. onEvolved runs once the evolution has played through: only then has it been seen. label names a form
// as the screen does ("Bulbasaur egg").
export function EvolutionScene({ from, to, shiny, label, reduced, onEvolved, onClose }: {
  from: string, to: string, shiny: boolean, label: (form: string) => string, reduced: boolean,
  onEvolved: () => void, onClose: () => void
}) {
  const [phase, setPhase] = useState<'intro' | 'evolve' | 'done'>('intro')
  const [fade] = useState(() => new Animated.Value(0))
  const verb = changeVerb(from, to)
  // The screen re-renders every second while recording: the timers must not restart with each new callback.
  const evolved = useRef(onEvolved)
  useEffect(() => { evolved.current = onEvolved }, [onEvolved])
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: reduced ? 0 : 260, easing: Easing.out(Easing.quad), useNativeDriver: native }).start()
  }, [fade, reduced])
  useEffect(() => {
    if (phase === 'done') return
    const timer = setTimeout(() => {
      if (phase === 'intro') { setPhase('evolve'); return }
      setPhase('done')
      evolved.current()
    }, phase === 'intro' ? INTRO_MS : EVOLVE_MS + 150)
    return () => clearTimeout(timer)
  }, [phase])
  const headline = phase !== 'done'
    ? verb === 'hatched' ? calling.hatched : `What? ${label(from)} ${calling[verb]}`
    : verb === 'hatched' ? `${label(to)} hatched from the egg!` : `Congratulations! Your ${label(from)} ${verb} into ${label(to)}!`
  useEffect(() => { AccessibilityInfo.announceForAccessibility(headline) }, [headline])
  const size = 168
  return <Animated.View style={[scene.root, { opacity: fade }]} accessibilityViewIsModal>
    <View style={scene.stage}>
      <View style={[scene.halo, { width: size * 1.6, height: size * 1.6, borderRadius: size }]} />
      {phase === 'intro' ? <PixelSprite name={from} shiny={shiny} size={size} />
        : <EvolveFx to={label(to)} size={size} reduced={reduced}
          draw={(form, white) => <PixelSprite name={form === 'from' ? from : to} shiny={shiny} size={size} tint={white ? '#ffffff' : undefined} />} />}
    </View>
    <View style={scene.box} accessibilityLiveRegion="polite">
      <Text style={scene.text}>{headline}</Text>
    </View>
    <View style={{ minHeight: 52, alignSelf: 'stretch' }}>
      {phase === 'done' && <Button title="Continue" onPress={onClose} />}
    </View>
  </Animated.View>
}

const scene = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 50, alignItems: 'center', justifyContent: 'center', gap: 28, paddingHorizontal: 24,
    backgroundColor: 'rgba(6, 8, 22, 0.92)' },
  stage: { width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', backgroundColor: 'rgba(255, 244, 200, 0.08)' },
  // A Pokemon-style message box: white text in a dark box with a light edge.
  box: { alignSelf: 'stretch', maxWidth: 520, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.7)', backgroundColor: 'rgba(16, 20, 44, 0.95)' },
  text: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 18, lineHeight: 25, textAlign: 'center' }
})
