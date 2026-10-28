import { Pressable, Text, View } from 'react-native'
import type { DimensionValue } from 'react-native'
import { PixelSprite } from '../../games/TeamPicker'
import { Screen, colors, fonts, gradient, themedStyles, useTheme } from '../../ui'
import { themes } from '../../palettes'
import type { Palette, ThemeName } from '../../palettes'
import { setPreference, usePreferences } from '../../preferences'
import type { Appearance } from '../../preferences'
import { SettingsGroup, SettingsRadio } from '../../SettingsList'
import type { IconName } from '../../ui'

// Settings → Theme: three cards, each a tiny Settings screen in that Pokemon's colors with the Pokemon perched on its
// tab bar, shown in the current light or dark. Below, the appearance: follow the phone, or always light or dark.
const choices: { value: ThemeName, label: string, detail: string }[] = [
  { value: 'gengar', label: 'Gengar', detail: 'Ghostly violet' },
  { value: 'deoxys', label: 'Deoxys', detail: 'Cosmic red and teal' },
  { value: 'pikachu', label: 'Pikachu', detail: 'Electric yellow' }
]
const appearances: { value: Appearance, label: string, icon: IconName, detail?: string }[] = [
  { value: 'system', label: 'System', icon: 'contrast', detail: 'Matches your phone' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' }
]

export default function ThemeScreen() {
  const { mode } = useTheme()
  const { theme, appearance } = usePreferences()
  return <Screen>
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={look.section}>Pokemon</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Pokemon theme" style={look.cards}>
        {choices.map(choice => {
          const on = choice.value === theme
          return <Pressable key={choice.value} accessibilityRole="radio" accessibilityState={{ checked: on }}
            accessibilityLabel={`${choice.label}. ${choice.detail}`} onPress={() => setPreference('theme', choice.value)}
            style={({ pressed }) => [look.card, { opacity: pressed ? 0.8 : 1 }]}>
            <View style={[look.frame, on && look.frameOn]}>
              <Preview palette={themes[choice.value][mode]} pokemon={choice.label} />
            </View>
            <View style={look.labelRow}>
              <View style={[look.radio, on && look.radioOn]}>{on && <View style={look.radioDot} />}</View>
              <Text style={[look.label, on && { color: colors.edge }]} numberOfLines={1}>{choice.label}</Text>
            </View>
            <Text style={look.detail} numberOfLines={2}>{choice.detail}</Text>
          </Pressable>
        })}
      </View>
    </View>
    <SettingsGroup radio label="Appearance" footer="System switches between light and dark when your phone does. Your theme and appearance are saved on this phone.">
      {appearances.map(item => <SettingsRadio key={item.value} icon={item.icon} label={item.label} detail={item.detail}
        checked={item.value === appearance} onPress={() => setPreference('appearance', item.value)} />)}
    </SettingsGroup>
  </Screen>
}

// A miniature of the Settings tab in palette's colors, whatever the theme: title, profile, button, a card of rows, and
// the floating tab bar with the theme's Pokemon standing on it.
function Preview({ palette, pokemon }: { palette: Palette, pokemon: string }) {
  const bar = (width: DimensionValue, color: string, height = 4) => <View style={{ width, height, borderRadius: height / 2, backgroundColor: color }} />
  return <View style={[look.preview, { backgroundColor: palette.bg }]}>
    <View style={{ alignSelf: 'center' }}>{bar(30, palette.ink, 5)}</View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: palette.mint }} />
      <View style={{ flex: 1, gap: 3 }}>{bar('70%', palette.ink)}{bar('50%', palette.muted, 3)}</View>
    </View>
    <View style={[{ width: 26, height: 7, borderRadius: 3.5 }, gradient(palette.brand, palette.brandFrom)]} />
    <View style={{ backgroundColor: palette.panel, borderRadius: 6, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 5 }}>
      {[0, 1].map(row => <View key={row} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5,
        borderTopWidth: row ? 1 : 0, borderColor: palette.line }}>
        <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: palette.sunken, borderWidth: 1, borderColor: palette.line }} />
        <View style={{ flex: 1 }}>{bar('75%', palette.ink, 3)}</View>
        {row === 1 ? <View style={{ width: 12, height: 7, borderRadius: 4, backgroundColor: palette.edge }} /> : bar(4, palette.muted, 3)}
      </View>)}
    </View>
    <View style={look.perch}><PixelSprite name={pokemon} size={52} /></View>
    <View style={[look.tabs, { borderColor: palette.tabHalo }, gradient(`linear-gradient(180deg, ${palette.tabTop} 0%, ${palette.tabBottom} 100%)`, palette.tabBottom)]}>
      {[0, 1, 2].map(tab => <View key={tab} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tab === 1 ? palette.tabActive : palette.tabInk, opacity: tab === 1 ? 1 : 0.5 }} />)}
    </View>
  </View>
}

const look = themedStyles(() => ({
  section: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, color: colors.muted, paddingHorizontal: 4 },
  cards: { flexDirection: 'row', gap: 10 },
  card: { flex: 1, gap: 8 },
  frame: { aspectRatio: 0.6, borderRadius: 16, borderWidth: 2, borderColor: colors.line, overflow: 'hidden' },
  frameOn: { borderColor: colors.edge, borderWidth: 2.5 },
  preview: { flex: 1, padding: 8, gap: 7 },
  // The Pokemon stands on the tab bar, as Gengar does on the real one.
  perch: { position: 'absolute', left: 0, right: 0, bottom: 18, alignItems: 'center' },
  tabs: { position: 'absolute', left: 8, right: 8, bottom: 8, height: 16, borderRadius: 8, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.edge },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.edge },
  label: { flexShrink: 1, fontFamily: fonts.heavy, fontSize: 15, lineHeight: 20, color: colors.ink },
  detail: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.muted, paddingHorizontal: 2 }
}))
