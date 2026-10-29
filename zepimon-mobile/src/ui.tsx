import React, { useEffect, useRef } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { ColorValue, StyleProp, ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import type { AndroidSymbol, SFSymbol } from 'expo-symbols'
import { pokemonType, typeColors } from './catalog'
import { colors, glass, motionReduced, retro, themedStyles, typeTints } from './theme'
import { Parallax } from './Parallax'
import { HabitatScene, habitatTheme } from './HabitatScene'
import { PokeballLoader } from './PokeballLoader'
export { Sprite } from './Sprite'
export { HabitatScene } from './HabitatScene'
export { PokeballLoader } from './PokeballLoader'
export { colors, glass, motionReduced, retro, themedStyles, typeInks, typeTints, useTheme } from './theme'

// Nunito and Pixelify Sans are loaded in src/app/_layout.tsx. Each weight is its own family so Android picks the right
// file. pixel is Emerald's display face, for eyebrows, titles and short labels only; Nunito stays for anything longer.
export const fonts = { body: 'Nunito_600SemiBold', bold: 'Nunito_700Bold', heavy: 'Nunito_800ExtraBold', black: 'Nunito_900Black',
  pixel: 'PixelifySans_600SemiBold' }
// The face for a short display label: the pixel font in Emerald, otherwise the given Nunito weight.
export const displayFont = (nunito: string = fonts.heavy) => retro() ? fonts.pixel : nunito
// Emerald's 2.5D press: a card or button rises 3 px onto a deeper shadow while pressed. Nothing moves with reduced motion,
// and other themes keep their own press.
export function pressDepth(pressed: boolean): ViewStyle | null {
  if (!pressed || !retro() || motionReduced()) return null
  return { transform: [{ translateY: -3 }], boxShadow: `0px 6px 0px ${colors.frameOuter}, 0px 10px 18px ${colors.shadow}` } as ViewStyle
}
// The theme's brand gradient by default. Native draws CSS gradients through experimental_backgroundImage; the web takes
// plain backgroundImage.
export function gradient(css = colors.brand, fallback = colors.brandFrom): ViewStyle {
  return (Platform.OS === 'web' ? { backgroundColor: fallback, backgroundImage: css } : { backgroundColor: fallback, experimental_backgroundImage: css }) as ViewStyle
}
// raised glows in the theme's brand color.
export const shadows = {
  card: { boxShadow: '0px 4px 16px rgba(31, 61, 89, 0.08)' } as ViewStyle,
  get raised() { return { boxShadow: `0px 6px 16px ${colors.glow}` } as ViewStyle }
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
// A card. In Emerald it is a RetroFrame, like the game's menus and text boxes.
export function Panel({ children, style }: React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  if (retro()) return <RetroFrame style={style}>{children}</RetroFrame>
  return <View style={[styles.panel, style]}>{children}</View>
}
// Pokemon Emerald's text box: a rounded double border (dark outside, light inside) with small, chunky corners, a light
// line along the inside of the top edge, and a hard drop shadow under a soft one for depth. Any theme can use it;
// Emerald draws every Panel with it.
export function RetroFrame({ children, style }: React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.frame, style]}>
    <View pointerEvents="none" accessible={false} style={styles.frameInner}><View style={styles.frameShine} /></View>
    {children}
  </View>
}
// The gradient banner that opens each tab, with a faint Poke Ball in the corner. In Emerald, Hoenn's sky instead: hills,
// sea and clouds drifting by in layers (src/Parallax.tsx).
export function Hero({ eyebrow, title, children }: React.PropsWithChildren<{ eyebrow: string, title: string }>) {
  return <View style={[styles.hero, gradient(), shadows.raised]}>
    {retro() ? <Parallax />
      : <View pointerEvents="none" accessible={false} style={styles.heroMark}><PokeballIcon size={190} color={colors.onBrand} stroke={14} /></View>}
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
      { opacity: loading ? 1 : disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed && !disabled ? 0.98 : 1 }] },
      pressDepth(pressed && !disabled && !loading)]}>
    {!secondary && <GradientFill radius={999} shadow />}
    {loading ? <View style={styles.loadingRow}><PokeballLoader size={20} />{label}</View> : label}
  </Pressable>
}
// A compact pill for filters and one-of-many choices. In Emerald the chosen one glows.
export function Chip({ label, selected, onPress, disabled = false }: { label: string, selected: boolean, onPress: () => void, disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} hitSlop={4} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.chip, selected && styles.chipOn, { opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, pressDepth(pressed && !disabled)]}>
    <Text style={[styles.chipText, selected && { color: colors.onEdge }]}>{label}</Text>
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
  chevron: ['chevron.right', 'chevron_right'], close: ['xmark', 'close'], settings: ['gearshape', 'settings'],
  phone: ['iphone', 'smartphone'], watch: ['applewatch', 'watch'], clock: ['clock', 'schedule'], steps: ['shoeprints.fill', 'footprint'],
  back: ['chevron.left', 'arrow_back'], palette: ['paintpalette', 'palette'], person: ['person.crop.circle', 'account_circle'],
  logout: ['rectangle.portrait.and.arrow.right', 'logout'], info: ['info.circle', 'info'], doc: ['doc.text', 'description'],
  download: ['square.and.arrow.down', 'download'], sun: ['sun.max', 'light_mode'], moon: ['moon', 'dark_mode'],
  contrast: ['circle.lefthalf.filled', 'contrast'], edit: ['pencil', 'edit'], calendar: ['calendar', 'calendar_month'], plus: ['plus', 'add'],
  chevronDown: ['chevron.down', 'expand_more'], rotate: ['rectangle.portrait.rotate', 'screen_rotation']
} satisfies Record<string, [SFSymbol, AndroidSymbol]>
export type IconName = keyof typeof icons
const symbolBox = { alignItems: 'center', justifyContent: 'center' } as const
export function Icon({ name, size = 22, color = colors.ink }: { name: IconName, size?: number, color?: ColorValue }) {
  const [ios, material] = icons[name]
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
    {/* On Android and the web the symbol is a font glyph in its box; centering keeps it in the middle. */}
    <SymbolView name={{ ios, android: material, web: material }} size={size} tintColor={color} style={symbolBox} />
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
// fill: lay out to the screen instead of scrolling. full: full-screen play, inside every safe-area edge. edge: full
// screen with no padding at all, for a map that fills the safe area (PlayOverlay).
export function Screen({ children, fill = false, full = false, edge = false }: React.PropsWithChildren<{ fill?: boolean, full?: boolean, edge?: boolean }>) {
  const scroll = useRef<ScrollView>(null)
  useEffect(() => { if (fill) scroll.current?.scrollTo({ y: 0, animated: false }) }, [fill])
  return <SafeAreaView style={styles.screen} edges={full || edge ? ['top', 'left', 'right', 'bottom'] : ['top', 'left', 'right']}>
    <ScrollView ref={scroll} scrollEnabled={!fill && !edge} keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, fill && styles.contentFill, full && styles.contentFull, edge && styles.contentEdge]}>
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
export const styles = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40, gap: 16 },
  // The bottom padding keeps the end of the screen clear of the Gengar peeking over the tab bar (src/TabBar.tsx).
  contentFill: { flexGrow: 1, paddingBottom: 16 },
  contentFull: { paddingHorizontal: 10, paddingTop: 6, paddingBottom: 8 },
  contentEdge: { flexGrow: 1, maxWidth: '100%', paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0 },
  // Emerald sets headings, titles and eyebrows in the pixel face, a touch smaller as it runs wide.
  heading: { fontFamily: displayFont(), color: colors.ink, fontSize: retro() ? 23 : 24, lineHeight: 31 },
  title: { fontFamily: displayFont(), fontSize: retro() ? 18 : 19, lineHeight: 25 },
  eyebrow: { fontFamily: displayFont(), fontSize: 12, lineHeight: 16, letterSpacing: retro() ? 1.4 : 1.1 },
  panel: { backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: 20, padding: 18, gap: 10, ...shadows.card },
  frame: { backgroundColor: colors.panel, borderColor: colors.frameOuter ?? colors.edge, borderWidth: 2, borderRadius: 10, padding: 18, gap: 10,
    boxShadow: `0px 3px 0px ${colors.frameOuter ?? colors.edge}, 0px 8px 18px ${colors.shadow}` },
  frameInner: { position: 'absolute', left: 1, top: 1, right: 1, bottom: 1, borderRadius: 7, borderWidth: 2, borderColor: colors.frameInner ?? colors.line },
  frameShine: { position: 'absolute', left: 6, right: 6, top: 1, height: 2, borderRadius: 1, backgroundColor: glass(0.8) },
  hero: { borderRadius: retro() ? 12 : 24, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 24, gap: 6, overflow: 'hidden' },
  heroMark: { position: 'absolute', right: -42, top: -46, opacity: 0.16 },
  heroEyebrow: { fontFamily: displayFont(), color: colors.onBrand, fontSize: 12, lineHeight: 16, letterSpacing: 1.1, opacity: 0.92 },
  heroTitle: { fontFamily: displayFont(fonts.black), color: colors.onBrand, fontSize: retro() ? 26 : 28, lineHeight: 35 },
  button: { minHeight: 50, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 22, justifyContent: 'center' },
  secondary: { backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.line },
  buttonText: { textAlign: 'center', fontFamily: fonts.heavy, color: colors.onBrand, fontSize: 15, lineHeight: 20 },
  secondaryText: { color: colors.edge },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.line },
  chipOn: { backgroundColor: colors.edge, borderColor: colors.edge, ...(retro() ? { boxShadow: `0px 0px 10px ${colors.glow}` } : null) },
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
  track: { height: 10, borderRadius: 5, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 }
}))
