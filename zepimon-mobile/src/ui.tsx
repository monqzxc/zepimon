import React, { useEffect, useRef } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { ColorValue, StyleProp, ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import type { AndroidSymbol, SFSymbol } from 'expo-symbols'
import { pokemonType, typeColors, typeTints } from './catalog'
import { HabitatScene, habitatTheme } from './HabitatScene'
import { PokeballLoader } from './PokeballLoader'
export { Sprite } from './Sprite'
export { HabitatScene } from './HabitatScene'
export { PokeballLoader } from './PokeballLoader'

// A bright, Pokemon HOME-style light theme. Text colors keep at least 4.5:1 on both white cards and the page:
// ink 14.6, muted 6.1, edge (teal accent) 5.1, gold 5.6, danger 5.2. star is for large glyphs only (3.4:1).
export const colors = {
  bg: '#EEF3F7', panel: '#FFFFFF', sunken: '#F4F7FA', line: '#DCE4EA', mint: '#DDF4EF',
  ink: '#1F2A36', muted: '#566472', edge: '#0B7C73', blue: '#1374B8', bright: '#16B5A0',
  gold: '#9A5800', star: '#C27C00', danger: '#C53B3B', onBrand: '#FFFFFF'
}
// Nunito is loaded in src/app/_layout.tsx. Each weight is its own family so Android picks the right file.
export const fonts = { body: 'Nunito_600SemiBold', bold: 'Nunito_700Bold', heavy: 'Nunito_800ExtraBold', black: 'Nunito_900Black' }
export const BRAND_GRADIENT = 'linear-gradient(135deg, #0B8577 0%, #1374B8 100%)'
// Native draws CSS gradients through experimental_backgroundImage; the web takes plain backgroundImage.
export function gradient(css = BRAND_GRADIENT, fallback = colors.edge): ViewStyle {
  return (Platform.OS === 'web' ? { backgroundColor: fallback, backgroundImage: css } : { backgroundColor: fallback, experimental_backgroundImage: css }) as ViewStyle
}
export const shadows = {
  card: { boxShadow: '0px 4px 16px rgba(31, 61, 89, 0.08)' } as ViewStyle,
  raised: { boxShadow: '0px 6px 16px rgba(19, 116, 184, 0.28)' } as ViewStyle
}

export function Copy({ children, small = false, color = colors.muted }: React.PropsWithChildren<{ small?: boolean, color?: string }>) {
  return <Text style={{ color, fontFamily: fonts.body, fontSize: small ? 13 : 15, lineHeight: small ? 19 : 22 }}>{children}</Text>
}
export function Heading({ children }: React.PropsWithChildren) {
  return <Text accessibilityRole="header" style={styles.heading}>{children}</Text>
}
// A card or list-item title, one step below Heading.
export function Title({ children, color = colors.ink }: React.PropsWithChildren<{ color?: string }>) {
  return <Text style={[styles.title, { color }]}>{children}</Text>
}
export function Eyebrow({ children, color = colors.edge }: React.PropsWithChildren<{ color?: string }>) {
  return <Text style={[styles.eyebrow, { color }]}>{children}</Text>
}
export function Panel({ children, style }: React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.panel, style]}>{children}</View>
}
// The gradient banner that opens each tab, with a faint Poke Ball in the corner.
export function Hero({ eyebrow, title, children }: React.PropsWithChildren<{ eyebrow: string, title: string }>) {
  return <View style={[styles.hero, gradient(), shadows.raised]}>
    <View pointerEvents="none" accessible={false} style={styles.heroMark}><PokeballIcon size={190} color="rgba(255, 255, 255, 0.16)" stroke={14} /></View>
    <Text style={styles.heroEyebrow}>{eyebrow}</Text>
    <Text accessibilityRole="header" style={styles.heroTitle}>{title}</Text>
    {children}
  </View>
}
// A gradient layer that fills its parent. Mount or unmount it instead of switching a live view's gradient or shadow:
// Android can crash when an existing view gains a background image (the quiz turned its right answer into a primary
// button). Views that start with a gradient, like Hero, are fine.
export function GradientFill({ radius, shadow = false }: { radius: number, shadow?: boolean }) {
  return <View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill, { borderRadius: radius }, gradient(), shadow && shadows.raised]} />
}
// loading shows a shrinking Pokeball beside the title and blocks presses at full opacity.
export function Button({ title, onPress, secondary = false, disabled = false, loading = false }: {
  title: string, onPress: () => void, secondary?: boolean, disabled?: boolean, loading?: boolean
}) {
  const label = <Text style={[styles.buttonText, secondary && styles.secondaryText, loading && { flexShrink: 1 }]}>{title}</Text>
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || loading, busy: loading }}
    disabled={disabled || loading} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary,
      { opacity: loading ? 1 : disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed && !disabled ? 0.98 : 1 }] }]}>
    {!secondary && <GradientFill radius={999} shadow />}
    {loading ? <View style={styles.loadingRow}><PokeballLoader size={20} />{label}</View> : label}
  </Pressable>
}
// A compact pill for filters and one-of-many choices.
export function Chip({ label, selected, onPress }: { label: string, selected: boolean, onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} hitSlop={4} onPress={onPress}
    style={({ pressed }) => [styles.chip, selected && styles.chipOn, { opacity: pressed ? 0.8 : 1 }]}>
    <Text style={[styles.chipText, selected && { color: colors.onBrand }]}>{label}</Text>
  </Pressable>
}
export const typeLabel = (type: string) => type[0].toUpperCase() + type.slice(1)
export function TypeBadge({ type }: { type: string }) {
  return <View style={[styles.type, { backgroundColor: typeColors[type] || typeColors.normal }]}>
    <Text style={styles.typeText}>{typeLabel(type)}</Text>
  </View>
}

// SF Symbols on iOS, Material Symbols on Android and the web.
const icons = {
  journal: ['book', 'menu_book'], missions: ['flag', 'flag'], play: ['gamecontroller', 'sports_esports'], sync: ['arrow.triangle.2.circlepath', 'sync'],
  search: ['magnifyingglass', 'search'], walk: ['figure.walk', 'directions_walk'], badge: ['rosette', 'military_tech'], explore: ['safari', 'explore'],
  check: ['checkmark.circle', 'check_circle'], lock: ['lock', 'lock'], sparkle: ['sparkles', 'auto_awesome'], trophy: ['trophy', 'trophy'],
  map: ['map', 'map'], timer: ['timer', 'timer'], cloud: ['icloud', 'cloud_sync'], backup: ['externaldrive', 'backup'], star: ['star', 'star'],
  pause: ['pause.fill', 'pause'], resume: ['play.fill', 'play_arrow'], fullscreen: ['arrow.up.left.and.arrow.down.right', 'fullscreen'],
  fullscreenExit: ['arrow.down.right.and.arrow.up.left', 'fullscreen_exit'], run: ['figure.run', 'directions_run'],
  location: ['location', 'location_on'], egg: ['oval.portrait', 'egg'], share: ['square.and.arrow.up', 'share'],
  chevron: ['chevron.right', 'chevron_right']
} satisfies Record<string, [SFSymbol, AndroidSymbol]>
export type IconName = keyof typeof icons
export function Icon({ name, size = 22, color = colors.ink }: { name: IconName, size?: number, color?: ColorValue }) {
  const [ios, material] = icons[name]
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
    <SymbolView name={{ ios, android: material, web: material }} size={size} tintColor={color} />
  </View>
}
// An icon on a soft circle, like the menu tiles in Pokemon HOME. 'pokeball' draws the Poke Ball.
export function IconBubble({ name, color = colors.edge, background = colors.mint, size = 44 }: {
  name: IconName | 'pokeball', color?: string, background?: string, size?: number
}) {
  const glyph = Math.round(size * 0.52)
  return <View accessible={false} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: background, alignItems: 'center', justifyContent: 'center' }}>
    {name === 'pokeball' ? <PokeballIcon size={glyph} color={color} /> : <Icon name={name} size={glyph} color={color} />}
  </View>
}
// A round icon-only button on the mint bubble, for compact controls such as pause and full screen.
export function IconButton({ name, label, onPress, size = 44 }: { name: IconName, label: string, onPress: () => void, size?: number }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={4} onPress={onPress}
    style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.mint, opacity: pressed ? 0.7 : 1 })}>
    <Icon name={name} size={Math.round(size * 0.52)} color={colors.edge} />
  </Pressable>
}
// A line-drawn Poke Ball (no platform has a symbol for it): ring, split band and center button.
export function PokeballIcon({ size = 22, color = colors.ink, stroke = Math.max(2, Math.round(size / 11)) }: { size?: number, color?: ColorValue, stroke?: number }) {
  const button = size * 0.36
  const band = { position: 'absolute' as const, top: (size - stroke) / 2, height: stroke, width: (size - button) / 2, backgroundColor: color }
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: stroke, borderColor: color }} />
    <View style={[band, { left: 0 }]} />
    <View style={[band, { right: 0 }]} />
    <View style={{ position: 'absolute', left: (size - button) / 2, top: (size - button) / 2, width: button, height: button, borderRadius: button / 2, borderWidth: stroke, borderColor: color }} />
  </View>
}

// fill stops the page scrolling so a child with flex: 1 takes the rest of the screen, like a running battle.
// full is for full-screen games with the tab bar hidden: it keeps clear of the bottom safe area and trims the padding.
export function Screen({ children, fill = false, full = false }: React.PropsWithChildren<{ fill?: boolean, full?: boolean }>) {
  const scroll = useRef<ScrollView>(null)
  useEffect(() => { if (fill) scroll.current?.scrollTo({ y: 0, animated: false }) }, [fill])
  return <SafeAreaView style={styles.screen} edges={full ? ['top', 'left', 'right', 'bottom'] : ['top', 'left', 'right']}>
    <ScrollView ref={scroll} scrollEnabled={!fill} keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, fill && styles.contentFill, full && styles.contentFull]}>
      {children}
    </ScrollView>
  </SafeAreaView>
}
export function Habitat({ name, shiny = false, children }: React.PropsWithChildren<{ name: string, shiny?: boolean }>) {
  const type = pokemonType(name)
  return <Panel style={{ backgroundColor: typeTints[type] || colors.panel }}>
    <View style={styles.habitatTop}><TypeBadge type={type} /><Text style={styles.habitatLabel}>{habitatTheme(name).label}</Text></View>
    <HabitatScene name={name} shiny={shiny} />
    <Copy small>Tap your Pokemon to say hello.</Copy>
    {children}
  </Panel>
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40, gap: 16 },
  // The bottom padding keeps the end of the screen clear of the Gengar peeking over the tab bar (src/TabBar.tsx).
  contentFill: { flexGrow: 1, paddingBottom: 16 },
  contentFull: { paddingHorizontal: 10, paddingTop: 6, paddingBottom: 8 },
  heading: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 24, lineHeight: 31 },
  title: { fontFamily: fonts.heavy, fontSize: 19, lineHeight: 25 },
  eyebrow: { fontFamily: fonts.heavy, fontSize: 12, lineHeight: 16, letterSpacing: 1.1 },
  panel: { backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: 20, padding: 18, gap: 10, ...shadows.card },
  hero: { borderRadius: 24, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 24, gap: 6, overflow: 'hidden' },
  heroMark: { position: 'absolute', right: -42, top: -46 },
  heroEyebrow: { fontFamily: fonts.heavy, color: colors.onBrand, fontSize: 12, lineHeight: 16, letterSpacing: 1.1, opacity: 0.92 },
  heroTitle: { fontFamily: fonts.black, color: colors.onBrand, fontSize: 28, lineHeight: 35 },
  button: { minHeight: 50, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 22, justifyContent: 'center' },
  secondary: { backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.line },
  buttonText: { textAlign: 'center', fontFamily: fonts.heavy, color: colors.onBrand, fontSize: 15, lineHeight: 20 },
  secondaryText: { color: colors.edge },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.line },
  chipOn: { backgroundColor: colors.edge, borderColor: colors.edge },
  chipText: { fontFamily: fonts.bold, color: colors.ink, fontSize: 14, lineHeight: 18 },
  type: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  typeText: { fontFamily: fonts.heavy, color: '#ffffff', fontSize: 12, lineHeight: 16, letterSpacing: 0.3 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  stat: { fontFamily: fonts.black, color: colors.ink, fontSize: 30, lineHeight: 38 },
  input: { minHeight: 50, borderWidth: 1.5, borderColor: colors.line, borderRadius: 16, color: colors.ink, backgroundColor: colors.panel,
    paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, fontFamily: fonts.body },
  habitatTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  habitatLabel: { flexShrink: 1, fontFamily: fonts.bold, color: colors.muted, fontSize: 13, textAlign: 'right' },
  // A rounded progress track and its fill.
  track: { height: 10, borderRadius: 5, backgroundColor: '#E2E9EF', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 }
})
