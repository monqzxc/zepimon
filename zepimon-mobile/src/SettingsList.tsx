import React, { Fragment } from 'react'
import { Modal, Pressable, Switch, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon, colors, fonts, shadows, themedStyles } from './ui'
import type { IconName } from './ui'

// The Settings tab's grouped lists: a quiet label, then a rounded card of rows split by hairlines, each with an icon
// tile, a name, and its value with a chevron, a switch, or nothing. A footer under the card explains the group.

// radio marks a group of SettingsRadio rows, where one is chosen.
export function SettingsGroup({ label, footer, radio = false, children }: React.PropsWithChildren<{ label?: string, footer?: string, radio?: boolean }>) {
  const rows = React.Children.toArray(children).filter(Boolean)
  return <View style={list.group}>
    {!!label && <Text accessibilityRole="header" style={list.label}>{label}</Text>}
    <View accessibilityRole={radio ? 'radiogroup' : undefined} accessibilityLabel={radio ? label : undefined} style={list.card}>
      {rows.map((row, index) => <Fragment key={index}>{index > 0 && <View style={list.divider} />}{row}</Fragment>)}
    </View>
    {!!footer && <Text style={list.footer}>{footer}</Text>}
  </View>
}

type RowProps = { icon: IconName, label: string, value?: string, danger?: boolean, busy?: boolean, onPress?: () => void }
// With onPress the row opens something and shows a chevron; without it the row only shows its value.
export function SettingsRow({ icon, label, value, danger = false, busy = false, onPress }: RowProps) {
  const body = <>
    <IconTile name={icon} danger={danger} />
    <Text style={[list.name, danger && { color: colors.danger }]} numberOfLines={2}>{label}</Text>
    {!!value && <Text style={list.value} numberOfLines={1}>{value}</Text>}
    {onPress && !danger && <Icon name="chevron" size={20} color={colors.muted} />}
  </>
  if (!onPress) return <View accessible accessibilityLabel={value ? `${label}, ${value}` : label} style={list.row}>{body}</View>
  return <Pressable accessibilityRole="button" accessibilityLabel={value ? `${label}, ${value}` : label} accessibilityState={{ disabled: busy, busy }}
    disabled={busy} onPress={onPress} style={({ pressed }) => [list.row, pressed && { backgroundColor: colors.sunken }, busy && { opacity: 0.6 }]}>
    {body}
  </Pressable>
}

// Like iOS Settings, only the switch toggles; it carries the row's name for screen readers.
export function SettingsSwitch({ icon, label, value, onChange }: { icon: IconName, label: string, value: boolean, onChange: (value: boolean) => void }) {
  return <View style={list.row}>
    <IconTile name={icon} />
    <Text style={list.name} numberOfLines={2}>{label}</Text>
    <Switch accessibilityLabel={label} value={value} onValueChange={onChange}
      trackColor={{ true: colors.edge, false: colors.line }} thumbColor="#FFFFFF" ios_backgroundColor={colors.line} />
  </View>
}

// One choice of several, with a radio circle on the right.
export function SettingsRadio({ icon, label, detail, checked, onPress }: { icon?: IconName, label: string, detail?: string, checked: boolean, onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked }} accessibilityLabel={label} accessibilityHint={detail} onPress={onPress}
    style={({ pressed }) => [list.row, pressed && { backgroundColor: colors.sunken }]}>
    {icon && <IconTile name={icon} />}
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={list.choice}>{label}</Text>
      {!!detail && <Text style={list.detail}>{detail}</Text>}
    </View>
    <View style={[list.radio, checked && list.radioOn]}>{checked && <View style={list.radioDot} />}</View>
  </Pressable>
}

function IconTile({ name, danger = false }: { name: IconName, danger?: boolean }) {
  return <View style={[list.tile, danger && { backgroundColor: colors.dangerTint, borderColor: colors.dangerTint }]}>
    <Icon name={name} size={17} color={danger ? colors.danger : colors.muted} />
  </View>
}

// One of a few choices, picked from a sheet that slides up from the bottom. Picking one closes it.
export function ChoiceSheet<T extends string>({ title, open, options, value, onChoose, onClose }: {
  title: string, open: boolean, options: { value: T, label: string, detail?: string }[], value: T, onChoose: (value: T) => void, onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  return <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
    <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={[list.scrim, { backgroundColor: colors.scrim }]} />
    <View style={[list.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={list.handle} />
      <Text accessibilityRole="header" style={list.sheetTitle}>{title}</Text>
      <SettingsGroup radio>
        {options.map(option => <SettingsRadio key={option.value} label={option.label} detail={option.detail} checked={option.value === value}
          onPress={() => { onChoose(option.value); onClose() }} />)}
      </SettingsGroup>
    </View>
  </Modal>
}

const list = themedStyles(() => ({
  group: { gap: 8 },
  label: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, color: colors.muted, paddingHorizontal: 4 },
  card: { backgroundColor: colors.panel, borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...shadows.card },
  divider: { height: 1, marginLeft: 14, backgroundColor: colors.line },
  footer: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted, paddingHorizontal: 4 },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  tile: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunken,
    borderWidth: 1, borderColor: colors.line },
  name: { flex: 1, fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.ink },
  value: { flexShrink: 1, maxWidth: '45%', fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.muted, textAlign: 'right' },
  scrim: { flex: 1 },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10, gap: 14,
    width: '100%', maxWidth: 720, alignSelf: 'center' },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line },
  sheetTitle: { fontFamily: fonts.heavy, fontSize: 18, lineHeight: 24, color: colors.ink, textAlign: 'center' },
  choice: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.ink },
  detail: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.edge },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.edge }
}))
