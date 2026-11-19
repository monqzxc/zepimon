import React, { Fragment, useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, Switch, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon, colors, displayFont, fonts, retro, shadows, themedStyles } from './ui'
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

// A level from 0 to 1 in 5% steps, dragged or tapped along the track. onChange follows the finger; onCommit gets the
// value once it is let go, so a drag saves once. Screen readers adjust it by 10% with a swipe up or down.
export function SettingsSlider({ icon, label, value, disabled = false, onChange, onCommit }: {
  icon: IconName, label: string, value: number, disabled?: boolean, onChange: (value: number) => void, onCommit: (value: number) => void
}) {
  const track = useRef<View>(null)
  const frame = useRef({ x: 0, width: 1 })
  const latest = useRef(value)
  const [draft, setDraft] = useState<number | null>(null)
  const shown = draft ?? value
  const percent = Math.round(shown * 100)
  const level = (raw: number) => Math.round(Math.min(1, Math.max(0, raw)) * 20) / 20
  function move(pageX: number) {
    const next = level((pageX - frame.current.x) / frame.current.width)
    if (next === latest.current) return
    latest.current = next
    setDraft(next)
    onChange(next)
  }
  function release() {
    if (latest.current !== value) onCommit(latest.current)
    setDraft(null)
  }
  function step(by: number) {
    const next = level(value + by)
    onChange(next)
    onCommit(next)
  }
  return <View style={[list.row, disabled && { opacity: 0.5 }]}>
    <IconTile name={icon} />
    <View style={{ flex: 1, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={list.name} numberOfLines={1}>{label}</Text>
        <Text style={list.value}>{percent}%</Text>
      </View>
      <View ref={track} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityState={{ disabled }}
        accessibilityValue={{ min: 0, max: 100, now: percent, text: `${percent}%` }}
        accessibilityActions={disabled ? [] : [{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={event => step(event.nativeEvent.actionName === 'increment' ? 0.1 : -0.1)}
        onStartShouldSetResponder={() => !disabled} onMoveShouldSetResponder={() => !disabled}
        // Once the finger is on the track, a sideways drag stays with the slider instead of scrolling the page.
        onResponderTerminationRequest={() => false}
        onResponderGrant={event => {
          const pageX = event.nativeEvent.pageX
          latest.current = value
          track.current?.measureInWindow((x, _y, width) => { frame.current = { x, width: Math.max(1, width) }; move(pageX) })
        }}
        onResponderMove={event => move(event.nativeEvent.pageX)}
        onResponderRelease={release} onResponderTerminate={release}
        style={list.slider}>
        <View style={list.sliderTrack}>
          <View style={[list.sliderFill, { width: `${percent}%` }]} />
        </View>
        <View pointerEvents="none" style={[list.sliderThumb, { left: `${percent}%` }]} />
      </View>
    </View>
  </View>
}

// One choice of several, with a radio circle on the right. In Emerald the chosen row is lit, with the game's ▶ menu cursor.
export function SettingsRadio({ icon, label, detail, checked, onPress }: { icon?: IconName, label: string, detail?: string, checked: boolean, onPress: () => void }) {
  const cursor = checked && retro()
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked }} accessibilityLabel={label} accessibilityHint={detail} onPress={onPress}
    style={({ pressed }) => [list.row, cursor && list.chosen, pressed && { backgroundColor: colors.sunken }]}>
    <Text accessible={false} style={[list.cursor, !cursor && list.noCursor]}>▶</Text>
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

// One of several choices, picked from a sheet that slides up from the bottom; a long list scrolls. Picking one closes it.
export function ChoiceSheet<T extends string>({ title, open, options, value, onChoose, onClose }: {
  title: string, open: boolean, options: { value: T, label: string, detail?: string }[], value: T, onChoose: (value: T) => void, onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  return <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
    <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={[list.scrim, { backgroundColor: colors.scrim }]} />
    <View style={[list.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={list.handle} />
      <Text accessibilityRole="header" style={list.sheetTitle}>{title}</Text>
      <ScrollView style={{ maxHeight: height * 0.6 }} contentContainerStyle={{ paddingBottom: 2 }}>
        <SettingsGroup radio>
          {options.map(option => <SettingsRadio key={option.value} label={option.label} detail={option.detail} checked={option.value === value}
            onPress={() => { onChoose(option.value); onClose() }} />)}
        </SettingsGroup>
      </ScrollView>
    </View>
  </Modal>
}

const list = themedStyles(() => ({
  group: { gap: 8 },
  label: { fontFamily: displayFont(fonts.bold), fontSize: 14, lineHeight: 19, color: colors.muted, paddingHorizontal: 4 },
  // In Emerald, a menu box like the game's (RetroFrame's outer border and shadow).
  card: retro()
    ? { backgroundColor: colors.panel, borderRadius: 10, borderWidth: 2, borderColor: colors.frameOuter, overflow: 'hidden',
      boxShadow: `0px 3px 0px ${colors.frameOuter}, 0px 8px 18px ${colors.shadow}` }
    : { backgroundColor: colors.panel, borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...shadows.card },
  divider: { height: 1, marginLeft: 14, backgroundColor: colors.line },
  footer: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted, paddingHorizontal: 4 },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  tile: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunken,
    borderWidth: 1, borderColor: colors.line },
  name: { flex: 1, fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.ink },
  value: { flexShrink: 1, maxWidth: '45%', fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.muted, textAlign: 'right' },
  // The track is thin, but the touch area around it is a full finger tall.
  slider: { height: 32, justifyContent: 'center', marginHorizontal: 11 },
  sliderTrack: { height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  sliderFill: { height: 6, backgroundColor: colors.edge },
  sliderThumb: { position: 'absolute', width: 22, height: 22, marginLeft: -11, borderRadius: 11, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: colors.line, ...shadows.card },
  scrim: { flex: 1 },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10, gap: 14,
    width: '100%', maxWidth: 720, alignSelf: 'center' },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line },
  sheetTitle: { fontFamily: displayFont(), fontSize: 18, lineHeight: 24, color: colors.ink, textAlign: 'center' },
  choice: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.ink },
  detail: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.edge },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.edge },
  chosen: { backgroundColor: colors.mint },
  // The cursor keeps its width on every row, so labels stay lined up; only Emerald's chosen row shows it.
  cursor: { width: retro() ? 12 : 0, marginRight: retro() ? -4 : -12, fontSize: 12, lineHeight: 16, color: colors.edge },
  noCursor: { opacity: 0 }
}))
