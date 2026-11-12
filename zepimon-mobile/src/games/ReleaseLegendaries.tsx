import { useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useJournal } from '../store'
import { MAX_PERMITS } from '../expedition-release'
import { Icon, IconButton, PokeballLoader, colors, displayFont, fonts, pressDepth, retro, themedStyles } from '../ui'
import { PixelSprite } from './TeamPicker'
import { caughtLegendaries } from './revisits'
import type { Revisit } from './revisits'

// The Expedition Permit Exchange: releasing caught Legendaries for Expedition Permits, one each (rules in
// src/expedition-release.ts). Every caught Legendary is a card in a two-column grid, ticked by tapping it; a Shiny's
// card is framed in gold. Select All ticks the Normal ones only, so a Shiny is never released without being picked by
// hand. A panel pinned to the bottom counts what is picked; Proceed opens it to say exactly what leaves and what is
// gained, and only Confirm releases. It cannot be undone.
export function ReleaseLegendaries({ busy, error, onRelease, onBack }: { busy: boolean, error: string, onRelease: (keys: string[]) => void, onBack: () => void }) {
  const { expeditions, quest, buddy } = useJournal()
  const insets = useSafeAreaInsets()
  // The page fills the window from where it starts down, so the grid scrolls and the panel stays pinned at the bottom.
  // (The screen around it grows with its content, so flex alone can't hold it to the window.)
  const { height: windowHeight } = useWindowDimensions()
  const page = useRef<View>(null)
  const [top, setTop] = useState<number | null>(null)
  const caught = caughtLegendaries(expeditions.dex)
  const [picked, setPicked] = useState<string[]>([])
  const [reviewing, setReviewing] = useState(false)
  // Only what is still caught counts, in case the Dex changed under the grid.
  const chosen = caught.filter(({ key }) => picked.includes(key))
  const normal = caught.filter(({ shiny }) => !shiny).map(({ key }) => key)
  const allNormal = normal.length > 0 && normal.every(key => picked.includes(key))
  const count = chosen.length
  const shinies = chosen.filter(({ shiny }) => shiny).length
  const tooMany = count > MAX_PERMITS - quest.permits
  const change = (next: (keys: string[]) => string[]) => { setReviewing(false); setPicked(next) }
  const toggle = (key: string) => change(keys => keys.includes(key) ? keys.filter(item => item !== key) : [...keys, key])
  const permits = `${count} Permit${count === 1 ? '' : 's'}`

  return <View ref={page} style={[look.page, top !== null && { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', height: Math.max(360, windowHeight - top) }]}
    onLayout={() => page.current?.measureInWindow((_x, y) => setTop(previous => previous === y ? previous : y))}>
    <View style={look.header}>
      <IconButton name="back" label="Back to Shrines" size={40} onPress={onBack} />
      <Text accessibilityRole="header" style={look.title}>Expedition Permit Exchange</Text>
      <Text style={look.intro}>Release Legendaries back to the wild for Expedition Permits. One permit opens one new encounter, and a released Legendary can be met again.</Text>
    </View>

    <ScrollView style={look.grid0} contentContainerStyle={look.scroll} showsVerticalScrollIndicator={false}>
      <View style={look.card}>
        <View style={look.cardTop}>
          <Text style={look.cardTitle}>Your Legendaries</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={allNormal ? 'Untick the Normal Legendaries' : 'Select all Normal Legendaries'}
            disabled={!normal.length || busy} onPress={() => change(keys => allNormal ? keys.filter(key => !normal.includes(key)) : [...new Set([...keys, ...normal])])}
            style={({ pressed }) => [look.pill, look.pillTint, (!normal.length || busy) && { opacity: 0.45 }, pressDepth(pressed)]}>
            <Icon name="check" size={16} color={colors.edge} />
            <Text style={[look.pillText, { color: colors.edge }]}>{allNormal ? 'Untick all' : 'Select all'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Clear the selection" disabled={!count || busy} onPress={() => change(() => [])}
            style={({ pressed }) => [look.pill, (!count || busy) && { opacity: 0.45 }, pressDepth(pressed)]}>
            <Text style={look.pillText}>Clear</Text>
          </Pressable>
        </View>
        {caught.length > normal.length && <Text style={look.note}>✦ Shinies are left out of Select all. Tap one to release it.</Text>}
        {caught.length ? <View style={look.grid}>
          {caught.map(revisit => <Tile key={revisit.key} revisit={revisit} on={picked.includes(revisit.key)} buddy={revisit.key === buddy}
            disabled={busy} onPress={() => toggle(revisit.key)} />)}
        </View> : <Text style={[look.note, { textAlign: 'center', paddingVertical: 24 }]}>You have no caught Legendaries to release.</Text>}
      </View>
    </ScrollView>

    <View style={[look.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
      <View style={look.grabber} />
      {reviewing && count ? <>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={look.sheetTitle}>Proceed to Exchange</Text>
        <Text style={look.sheetText}>{list(chosen.map(({ key }) => key))} will be released and removed from your Dex, with their shrines, rematch wins and eggs. This cannot be undone.</Text>
        {shinies > 0 && <Text style={[look.sheetText, { color: colors.danger, fontFamily: fonts.heavy }]}>✦ {shinies === 1 ? 'A Shiny is' : `${shinies} Shinies are`} included.</Text>}
      </> : <Text style={look.sheetTitle}>{count ? `${count} selected` : 'Tap Legendaries to release'}</Text>}
      <View style={look.held}>
        <Text style={look.heldText}>Permits held: <Text style={{ fontFamily: fonts.black }}>{quest.permits}</Text>
          {count ? <Text style={{ color: colors.edge }}>  (+{count} upon exchange)</Text> : null}</Text>
      </View>
      {!!error && <Text style={[look.sheetText, { color: colors.danger }]}>{error}</Text>}
      {tooMany && <Text style={[look.sheetText, { color: colors.danger }]}>You can hold {MAX_PERMITS} permits at most. Use some first.</Text>}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !count || tooMany || busy, busy }} disabled={!count || tooMany || busy}
        onPress={() => reviewing ? onRelease(chosen.map(({ key }) => key)) : setReviewing(true)}
        style={({ pressed }) => [look.confirm, reviewing && count ? look.confirmFinal : null, (!count || tooMany) && { opacity: 0.45 }, pressDepth(pressed && !busy)]}>
        {busy ? <PokeballLoader size={26} /> : <Text style={look.confirmText}>
          {!count ? 'Nothing selected' : reviewing ? `Confirm release & receive ${permits}` : `Proceed · +${permits}`}</Text>}
      </Pressable>
      {reviewing && count > 0 && <Pressable accessibilityRole="button" disabled={busy} onPress={() => setReviewing(false)} hitSlop={6} style={look.keep}>
        <Text style={look.keepText}>Keep them</Text>
      </Pressable>}
    </View>
  </View>
}

// "Mew", "Mew and Jirachi", "Mew, Rayquaza and Jirachi".
const list = (names: string[]) => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

// One Legendary: its sprite on a soft stage, its name, and a tick box in the corner. A Shiny is framed in gold with a
// sparkle; a picked one takes the accent's tint and border, so picked and Shiny read apart without color too (the tick).
function Tile({ revisit: { name, shiny }, on, buddy, disabled, onPress }: { revisit: Revisit, on: boolean, buddy: boolean, disabled: boolean, onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled }} disabled={disabled} onPress={onPress}
    accessibilityLabel={`${shiny ? 'Shiny ' : ''}${name}${buddy ? ', your buddy' : ''}`}
    style={({ pressed }) => [look.tile, shiny && look.tileShiny, on && look.tileOn, pressDepth(pressed)]}>
    <View style={[look.box, on && look.boxOn]}>{on && <Text style={look.tick}>✓</Text>}</View>
    {shiny && <Text style={look.sparkle}>✦</Text>}
    <View style={look.stage}><PixelSprite name={name} shiny={shiny} size={84} /></View>
    <Text numberOfLines={1} style={look.name}>{name}</Text>
    {(shiny || buddy) && <Text style={[look.tag, shiny && { color: colors.star }]}>{[shiny && 'SHINY', buddy && 'BUDDY'].filter(Boolean).join(' · ')}</Text>}
  </Pressable>
}

const look = themedStyles(() => ({
  // The page fills the screen (expeditions.tsx) edge to edge at the bottom, where the panel sits.
  page: { flex: 1, overflow: 'hidden', marginBottom: -16, marginHorizontal: -16 },
  header: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  title: { alignSelf: 'stretch', textAlign: 'center', fontFamily: displayFont(fonts.black), color: colors.ink, fontSize: retro() ? 22 : 26, lineHeight: retro() ? 28 : 32 },
  intro: { textAlign: 'center', fontFamily: fonts.body, color: colors.muted, fontSize: 15, lineHeight: 21, maxWidth: 420 },
  // minHeight 0 lets the grid shrink to the room left, and scroll, instead of growing to its content (on the web).
  grid0: { flex: 1, minHeight: 0 },
  scroll: { padding: 16, paddingBottom: 24 },
  card: { gap: 12, padding: 14, borderRadius: retro() ? 12 : 26, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line,
    boxShadow: `0px 4px 18px ${colors.shadow}` },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontFamily: displayFont(fonts.heavy), color: colors.ink, fontSize: retro() ? 16 : 19, lineHeight: 24 },
  pill: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: retro() ? 8 : 999,
    backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  pillTint: { backgroundColor: colors.mint, borderColor: colors.mintLine },
  pillText: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 14, lineHeight: 18 },
  note: { fontFamily: fonts.body, color: colors.muted, fontSize: 13, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexBasis: '45%', flexGrow: 1, maxWidth: '48.6%', alignItems: 'center', gap: 6, paddingTop: 12, paddingBottom: 12, paddingHorizontal: 10,
    borderRadius: retro() ? 10 : 22, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.line },
  tileShiny: { borderWidth: 2.5, borderColor: colors.star, backgroundColor: colors.goldTint, boxShadow: `0px 0px 14px ${colors.star}` },
  tileOn: { borderWidth: 2.5, borderColor: colors.edge, backgroundColor: colors.mint },
  box: { position: 'absolute', left: 10, top: 10, zIndex: 1, width: 24, height: 24, borderRadius: retro() ? 4 : 7, borderWidth: 2, borderColor: colors.muted,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel },
  boxOn: { borderColor: colors.edge, backgroundColor: colors.edge },
  tick: { color: colors.onEdge, fontFamily: fonts.black, fontSize: 15, lineHeight: 18 },
  sparkle: { position: 'absolute', right: 10, top: 6, color: colors.star, fontSize: 24, lineHeight: 30 },
  stage: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunken },
  name: { fontFamily: displayFont(fonts.heavy), color: colors.ink, fontSize: retro() ? 15 : 17, lineHeight: 22 },
  tag: { marginTop: -4, fontFamily: fonts.heavy, color: colors.muted, fontSize: 11, lineHeight: 15, letterSpacing: 0.8 },
  // The panel pinned under the grid, like a sheet that has risen to say what happens.
  sheet: { alignItems: 'center', gap: 10, paddingTop: 8, paddingHorizontal: 20, backgroundColor: colors.panel,
    borderTopLeftRadius: retro() ? 14 : 30, borderTopRightRadius: retro() ? 14 : 30, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.line,
    boxShadow: `0px -8px 24px ${colors.shadow}` },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 4 },
  sheetTitle: { textAlign: 'center', fontFamily: displayFont(fonts.heavy), color: colors.ink, fontSize: retro() ? 18 : 22, lineHeight: 28 },
  sheetText: { textAlign: 'center', fontFamily: fonts.body, color: colors.muted, fontSize: 15, lineHeight: 21, maxWidth: 440 },
  held: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: retro() ? 8 : 999, backgroundColor: colors.sunken, borderWidth: 1, borderColor: colors.line },
  heldText: { fontFamily: fonts.bold, color: colors.ink, fontSize: 14, lineHeight: 19 },
  confirm: { alignSelf: 'stretch', minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: retro() ? 10 : 999,
    backgroundColor: colors.edge, boxShadow: `0px 4px 12px ${colors.shadow}` },
  confirmFinal: { backgroundColor: colors.danger },
  confirmText: { textAlign: 'center', fontFamily: fonts.black, color: colors.onEdge, fontSize: 17, lineHeight: 22 },
  keep: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16 },
  keepText: { fontFamily: fonts.heavy, color: colors.muted, fontSize: 15, lineHeight: 20 }
}))
