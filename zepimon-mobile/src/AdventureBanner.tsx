import { useEffect, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTracker } from './tracker'
import { newOnWatch, sharedPokemon } from './shared-adventure'
import type { SharedAdventure } from './shared-adventure'
import { currentForm } from './phone-adventure'
import { PixelSprite } from './games/TeamPicker'
import { useReducedMotion } from './games/hooks'
import { Icon, colors, fonts, shadows, themedStyles } from './ui'

// "A new adventure started" across the top of any screen when the watch starts one, as the next sync brings it (at
// once when the app comes to the front, then about once a minute). It closes after a few seconds or with its close
// button; tapping it opens the Adventure tab, where it can be continued here. Each adventure is announced once, also
// across restarts.
const KEY = 'zepimon-announced-adventure-v1'
const SHOW_MS = 3000
const useNativeDriver = Platform.OS !== 'web'

export function AdventureBanner() {
  const { shared, handedOver } = useTracker()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  // The id announced last: undefined until read from storage, so a restart does not repeat it.
  const [last, setLast] = useState<string | null | undefined>(undefined)
  const [shown, setShown] = useState<SharedAdventure | null>(null)
  const [slide] = useState(() => new Animated.Value(0))
  useEffect(() => {
    let live = true
    AsyncStorage.getItem(KEY).then(value => { if (live) setLast(value) }, () => { if (live) setLast(null) })
    return () => { live = false }
  }, [])
  // The watch took over this phone's adventure: the Adventure tab says so, so it is not news afterwards either.
  if (handedOver && last !== undefined && last !== handedOver.id) setLast(handedOver.id)
  const news = last === undefined ? null : newOnWatch(shared, handedOver, last)
  if (news) {
    setLast(news.id)
    setShown(news)
  }
  useEffect(() => {
    if (last) void AsyncStorage.setItem(KEY, last).catch(() => {})
  }, [last])

  const hide = () => {
    if (reduced) { setShown(null); return }
    Animated.timing(slide, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver }).start(() => setShown(null))
  }
  useEffect(() => {
    if (!shown) return
    AccessibilityInfo.announceForAccessibility(`A new adventure started on your watch: ${sharedPokemon(shown)}`)
    slide.setValue(reduced ? 1 : 0)
    if (!reduced) Animated.timing(slide, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver }).start()
    const timer = setTimeout(hide, SHOW_MS)
    return () => clearTimeout(timer)
    // hide only reads values that stay the same while one adventure shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, reduced, slide])

  if (!shown) return null
  const what = `${sharedPokemon(shown)} · ${shown.activity === 'running' ? 'Run' : 'Walk'}`
  return <Animated.View pointerEvents="box-none" style={[banner.wrap, { top: insets.top + 8, opacity: slide,
    transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }] }]}>
    <View style={[banner.card, shadows.raised]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`A new adventure started on your watch. ${what}`}
        accessibilityHint="Opens the Adventure tab" onPress={() => { hide(); router.navigate('/adventure') }}
        style={({ pressed }) => [banner.main, { opacity: pressed ? 0.75 : 1 }]}>
        <View style={banner.art}><PixelSprite name={currentForm(shown.family, shown.meters, shown.mega)} shiny={shown.shiny} size={44} /></View>
        <View style={{ flex: 1 }}>
          <Text style={banner.eyebrow}>ON YOUR WATCH</Text>
          <Text style={banner.title}>A new adventure started</Text>
          <Text numberOfLines={1} style={banner.detail}>{what}</Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={hide}
        style={({ pressed }) => [banner.close, { opacity: pressed ? 0.6 : 1 }]}>
        <Icon name="close" size={20} color={colors.muted} />
      </Pressable>
    </View>
  </Animated.View>
}

const banner = themedStyles(() => ({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center', zIndex: 20, elevation: 20 },
  card: { width: '100%', maxWidth: 520, flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8, paddingRight: 4,
    borderRadius: 20, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.edge },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  art: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mint },
  eyebrow: { fontFamily: fonts.heavy, fontSize: 11, lineHeight: 15, letterSpacing: 1, color: colors.edge },
  title: { fontFamily: fonts.heavy, fontSize: 16, lineHeight: 21, color: colors.ink },
  detail: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }
}))
