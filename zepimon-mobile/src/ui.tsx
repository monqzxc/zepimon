import React from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { pokemonType, habitatColors } from './catalog'
import { HabitatScene, habitatTheme } from './HabitatScene'
export { Sprite } from './Sprite'
export { HabitatScene } from './HabitatScene'

export const colors = { bg: '#071b2c', panel: '#102d42', edge: '#54c7c4', ink: '#f4ebcf', muted: '#9abfcd', blue: '#135b89', gold: '#ffe08d' }
export const font = Platform.OS === 'ios' ? 'Menlo' : 'monospace'
export function Copy({ children, small = false, color = colors.muted }: React.PropsWithChildren<{ small?: boolean, color?: string }>) {
  return <Text style={{ color, fontSize: small ? 12 : 15, lineHeight: small ? 19 : 23 }}>{children}</Text>
}
export function Heading({ children }: React.PropsWithChildren) {
  return <Text accessibilityRole="header" style={styles.heading}>{children}</Text>
}
export function Eyebrow({ children }: React.PropsWithChildren) {
  return <Text style={styles.eyebrow}>{children}</Text>
}
export function Panel({ children, style }: React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.panel, style]}>{children}</View>
}
export function Button({ title, onPress, secondary = false, disabled = false }: {
  title: string, onPress: () => void, secondary?: boolean, disabled?: boolean
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}>
    <Text style={[styles.buttonText, secondary && { color: colors.ink }]}>{title}</Text>
  </Pressable>
}
export function Screen({ children }: React.PropsWithChildren) {
  return <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {children}
    </ScrollView>
  </SafeAreaView>
}
export function Habitat({ name, shiny = false, children }: React.PropsWithChildren<{ name: string, shiny?: boolean }>) {
  const type = pokemonType(name)
  return <Panel style={[styles.habitat, { backgroundColor: habitatColors[type] || habitatColors.normal }]}>
    <View style={styles.habitatTop}><Eyebrow>{type.toUpperCase()} HABITAT</Eyebrow><Text style={{ color: colors.gold }}>✦ · ✧</Text></View>
    <HabitatScene name={name} shiny={shiny} />
    <Copy small color={colors.ink}>{habitatTheme(name).label}</Copy>
    <Copy small>Tap your Pokemon to say hello.</Copy>
    {children}
  </Panel>
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, paddingBottom: 32, gap: 16 },
  heading: { fontFamily: font, color: colors.ink, fontWeight: '800', fontSize: 26, lineHeight: 35 },
  eyebrow: { fontFamily: font, color: colors.edge, fontSize: 11, fontWeight: '700', letterSpacing: 1.6 },
  panel: { backgroundColor: colors.panel, borderColor: colors.edge, borderWidth: 2, borderRadius: 6, padding: 18, gap: 10 },
  button: { minHeight: 48, backgroundColor: colors.ink, borderWidth: 2, borderColor: colors.edge, borderRadius: 4, padding: 12, justifyContent: 'center' },
  secondary: { backgroundColor: colors.blue },
  buttonText: { textAlign: 'center', fontFamily: font, fontWeight: '700', color: colors.bg, fontSize: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  stat: { fontFamily: font, color: colors.ink, fontWeight: '800', fontSize: 27 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.edge, borderRadius: 4, color: colors.ink, backgroundColor: colors.panel, padding: 12, fontSize: 16 },
  habitat: { paddingBottom: 18 },
  habitatTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }
})
