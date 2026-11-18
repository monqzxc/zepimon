import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Animated, Platform, Pressable, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { router, useFocusEffect } from 'expo-router'
import { useJournal } from './store'
import { MAX_HEARTS, PERKS, countingSince, friendshipLevel, levelUps } from './friendship'
import { PixelSprite } from './games/TeamPicker'
import { introFinished, subscribeIntro } from './launch-intro'
import { Copy, colors, displayFont, fonts, themedStyles, useTheme } from './ui'

// Buddy Friendship on screen (src/friendship.ts): the hearts, the panel on a Pokemon's record, the Best Buddy ribbon, the
// hello bubble over your buddy on the Journal and the toast that celebrates a new level once.
const native = Platform.OS !== 'web'
const together = (meters: number) => `${(meters / 1000).toFixed(meters < 100000 ? 1 : 0)} km together`
const species = (key: string) => key.replace(/^Shiny /, '')

export function Hearts({ hearts, size = 15 }: { hearts: number, size?: number }) {
  return <View accessible accessibilityLabel={`${hearts} of ${MAX_HEARTS} friendship hearts`} style={sheet.hearts}>
    {Array.from({ length: MAX_HEARTS }, (_, i) => <Heart key={i} size={size} color={i < hearts ? colors.danger : colors.track} />)}
  </View>
}

// One heart, drawn, so it matches on every platform and font.
export function Heart({ size, color }: { size: number, color: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 21 C11.2 20.3 3 14.6 3 8.8 C3 5.9 5.2 3.8 7.9 3.8 C9.7 3.8 11.2 4.8 12 6.3 C12.8 4.8 14.3 3.8 16.1 3.8 C18.8 3.8 21 5.9 21 8.8 C21 14.6 12.8 20.3 12 21 Z" fill={color} />
  </Svg>
}

// Under your buddy on the Journal, from the first heart: hearts and the distance together. Opens its record.
export function BuddyHearts({ buddy }: { buddy: string | null }) {
  const { friends } = useJournal()
  const meters = buddy ? friends[buddy] ?? 0 : 0
  const { hearts, title } = friendshipLevel(meters)
  if (!buddy || hearts < PERKS.counter) return null
  return <Pressable onPress={() => router.push({ pathname: '/pokemon', params: { name: species(buddy) } })} accessibilityRole="button"
    accessibilityLabel={`${title}: ${hearts} of ${MAX_HEARTS} hearts, ${together(meters)}`} accessibilityHint="Opens your buddy's record"
    style={sheet.pill}>
    {hearts >= PERKS.ribbon && <Ribbon />}
    <Hearts hearts={hearts} size={13} />
    <Text style={sheet.pillText}>{together(meters)}</Text>
  </Pressable>
}

// The Best Buddy ribbon, from five hearts.
export function Ribbon({ size = 16 }: { size?: number }) {
  return <View accessible accessibilityLabel="Best Buddy ribbon" style={[sheet.ribbon, { width: size, height: size, borderRadius: size / 2 }]}>
    <Svg width={size * 0.66} height={size * 0.66} viewBox="0 0 24 24">
      <Path d="M12 2.5 L14.9 8.6 L21.5 9.4 L16.6 13.9 L17.9 20.5 L12 17.2 L6.1 20.5 L7.4 13.9 L2.5 9.4 L9.1 8.6 Z" fill={colors.onBrand} />
    </Svg>
  </View>
}

// The friendship part of a Pokemon's record: hearts, title, distance, the way to the next level and the perks.
export function FriendshipDetails({ friendKey, isBuddy }: { friendKey: string, isBuddy: boolean }) {
  useTheme()
  const { friends, friendship } = useJournal()
  const meters = friends[friendKey] ?? 0
  const level = friendshipLevel(meters)
  const since = countingSince(friendship)
  if (!meters && !isBuddy) return null
  const perks: [number, string][] = [
    [PERKS.counter, 'Hearts and distance under your buddy on the Journal'],
    [PERKS.hello, 'Says hello when you open the app'],
    [PERKS.share, 'Joins your adventure share images'],
    [PERKS.cheer, 'Cheers when your egg hatches or evolves'],
    [PERKS.ribbon, 'Best Buddy ribbon in the Dex and the Safari Zone']
  ]
  return <View style={sheet.details}>
    <Text accessibilityRole="header" style={sheet.section}>Friendship</Text>
    <View style={sheet.titleRow}>
      {level.hearts >= PERKS.ribbon && <Ribbon size={20} />}
      <Text style={sheet.title}>{level.title}</Text>
      <Hearts hearts={level.hearts} size={17} />
    </View>
    <Copy color={colors.ink}>{together(meters)}{level.next ? ` · ${(level.toNext! / 1000).toFixed(1)} km to ${level.next.title}` : ''}</Copy>
    {level.next && <View accessible accessibilityRole="progressbar" accessibilityLabel={`Friendship progress to ${level.next.title}`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(level.progress * 100) }} style={sheet.track}>
      <View style={[sheet.fill, { width: `${Math.round(level.progress * 100)}%` }]} />
    </View>}
    {perks.map(([hearts, text]) => <View key={hearts} accessible style={sheet.perkRow}
      accessibilityLabel={`${text}: ${level.hearts >= hearts ? 'unlocked' : `unlocks at ${hearts} hearts`}`}>
      <View style={sheet.perkLevel}>
        <Heart size={14} color={level.hearts >= hearts ? colors.danger : colors.track} />
        <Text style={sheet.perkCount}>{hearts}</Text>
      </View>
      <Text style={[sheet.perk, { color: level.hearts >= hearts ? colors.ink : colors.muted }]}>{text}</Text>
    </View>)}
    <Copy small>{isBuddy ? 'Every walk or run you start with this buddy counts, on your watch or this phone.' : 'Choose it as your buddy to keep walking together.'}
      {since ? ` Friendship counts from ${new Date(since).toLocaleDateString()}.` : ''}</Copy>
  </View>
}

// From four hearts your buddy cheers at a hatch or evolution (src/Evolution.tsx).
export function BuddyCheer() {
  const { buddy, friends } = useJournal()
  if (!buddy || friendshipLevel(friends[buddy] ?? 0).hearts < PERKS.cheer) return null
  const name = species(buddy)
  return <View accessible accessibilityLabel={`${name} cheers you on`} style={sheet.cheer}>
    <PixelSprite name={name} shiny={buddy.startsWith('Shiny ')} size={56} />
    <Text style={sheet.cheerText}>{name} cheers you on!</Text>
    <Heart size={16} color="#FF8FA3" />
  </View>
}

// A heart bubble over your buddy each time the Journal comes into view, from two hearts. It pops up, then fades; with
// reduced motion it simply shows, then goes. Right after launch it waits until the opening animation (src/LaunchIntro.tsx)
// is out of the way.
const HELLO_MS = 3200
export function HelloBubble({ buddy, reduced }: { buddy: string | null, reduced: boolean }) {
  const { friends } = useJournal()
  const friendly = !!buddy && friendshipLevel(friends[buddy] ?? 0).hearts >= PERKS.hello
  const [shown, setShown] = useState(false)
  const [fade] = useState(() => new Animated.Value(0))
  const ready = useSyncExternalStore(subscribeIntro, introFinished)
  useFocusEffect(useCallback(() => {
    if (!friendly || !ready) return
    const wait = 700
    const show = setTimeout(() => setShown(true), wait)
    const hide = setTimeout(() => setShown(false), wait + HELLO_MS)
    return () => { clearTimeout(show); clearTimeout(hide); setShown(false) }
  }, [friendly, ready]))
  useEffect(() => {
    if (!shown) { fade.setValue(0); return }
    if (reduced) { fade.setValue(1); return }
    const pop = Animated.sequence([
      Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: native }),
      Animated.delay(HELLO_MS - 260 - 420),
      Animated.timing(fade, { toValue: 0, duration: 420, useNativeDriver: native })
    ])
    pop.start()
    return () => pop.stop()
  }, [shown, reduced, fade])
  if (!friendly || !shown) return null
  return <Animated.View pointerEvents="none" accessible accessibilityLabel={`${species(buddy!)} says hello`}
    style={[sheet.bubble, { opacity: fade, transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]}>
    <Heart size={20} color={colors.danger} />
  </Animated.View>
}

// A new friendship level, celebrated once on whatever screen is open, after saving or syncing an adventure. Tapping it
// opens that Pokemon's record; either way it is marked as seen.
export function FriendshipToast() {
  useTheme()
  const { friends, friendship, dex, celebrateFriends } = useJournal()
  const up = levelUps(friends, friendship.seen).find(item => dex[item.key])
  useEffect(() => {
    if (!up) return
    const timer = setTimeout(() => { celebrateFriends().catch(() => {}) }, 6000)
    return () => clearTimeout(timer)
  }, [up?.key, up?.hearts]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!up) return null
  const open = () => {
    celebrateFriends().catch(() => {})
    router.push({ pathname: '/pokemon', params: { name: species(up.key) } })
  }
  return <View pointerEvents="box-none" style={sheet.toastWrap}>
    <Pressable onPress={open} accessibilityRole="button" accessibilityLiveRegion="polite"
      accessibilityLabel={`You and ${up.key} are now ${up.title}, ${up.hearts} hearts`} accessibilityHint="Opens its record" style={sheet.toast}>
      <Hearts hearts={up.hearts} size={14} />
      <Text style={sheet.toastText}>You and {up.key} are now {up.title}!</Text>
    </Pressable>
  </View>
}

const sheet = themedStyles(() => ({
  hearts: { flexDirection: 'row', gap: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', minHeight: 44, paddingHorizontal: 14, borderRadius: 999,
    backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  pillText: { fontFamily: fonts.bold, color: colors.ink, fontSize: 13, lineHeight: 18 },
  ribbon: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold },
  details: { gap: 8, paddingTop: 6 },
  section: { fontFamily: fonts.heavy, color: colors.muted, fontSize: 14, lineHeight: 19 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: { fontFamily: displayFont(), color: colors.ink, fontSize: 18, lineHeight: 24 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.danger },
  perk: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 24 },
  perkLevel: { width: 30, flexDirection: 'row', alignItems: 'center', gap: 3 },
  perkCount: { fontFamily: fonts.heavy, color: colors.muted, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] },
  bubble: { position: 'absolute', top: 6, right: '22%', minWidth: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.panel, borderWidth: 2, borderColor: colors.danger },
  bubbleText: { fontSize: 20, lineHeight: 24, color: colors.danger },
  cheer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  // On the evolution scene's dark backdrop in every theme.
  cheerText: { fontFamily: fonts.heavy, color: '#FFFFFF', fontSize: 15, lineHeight: 20 },
  // Above the floating tab bar, clear of every screen's title.
  toastWrap: { position: 'absolute', left: 16, right: 16, bottom: 116, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 520, minHeight: 48, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 999, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.danger, boxShadow: `0px 6px 16px ${colors.shadow}` },
  toastText: { flexShrink: 1, fontFamily: fonts.heavy, color: colors.ink, fontSize: 14, lineHeight: 19 }
}))
