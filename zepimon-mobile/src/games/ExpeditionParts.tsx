import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Copy, GradientFill, Icon, IconBubble, PokeballLoader, colors, displayFont, fonts, pressDepth, retro, shadows, themedStyles } from '../ui'

// The pieces an expedition card is built from, shared by the waiting encounter (src/app/expeditions.tsx) and a Shrine
// Revisit's sheet (src/games/ShrineRevisits.tsx): a status line over a big name, a habitat in a rounded frame, facts as
// their own rounded rows with a Poke Ball, a tinted note, one wide Poke Ball action and a footnote under it.

// "EXPEDITION 2 | ENCOUNTER READY": a quiet eyebrow, a short divider, and the status in a glowing pill.
export function StatusLine({ eyebrow, status }: { eyebrow: string, status: string }) {
  return <View accessible accessibilityLabel={`${eyebrow}. ${status}`} style={look.status}>
    <Text style={look.eyebrow}>{eyebrow}</Text>
    <View style={look.divider} />
    <View style={look.pill}><Text numberOfLines={1} style={look.pillText}>{status}</Text></View>
  </View>
}

// The name the card is about, large: the screen's heading.
export function BigName({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={look.name}>{children}</Text>
}

// A habitat scene (or anything else) in a frame with large, soft corners.
export function SceneFrame({ children }: { children: ReactNode }) {
  return <View style={look.scene}>{children}</View>
}

// A Poke Ball in its colors: red over white, the band and the button. dim draws one still to find, in grey.
export function ColorBall({ size, dim = false }: { size: number, dim?: boolean }) {
  const band = Math.max(2, size / 11)
  const button = size * 0.38
  const ink = dim ? colors.muted : '#2B2F45'
  return <View accessible={false} importantForAccessibility="no-hide-descendants"
    style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', borderWidth: band, borderColor: ink, backgroundColor: '#ffffff' }}>
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '50%', backgroundColor: dim ? colors.line : '#E8413A' }} />
    <View style={{ position: 'absolute', left: 0, right: 0, top: (size - band * 2 - band) / 2, height: band, backgroundColor: ink }} />
    <View style={{ position: 'absolute', left: (size - band * 2 - button) / 2, top: (size - band * 2 - button) / 2, width: button, height: button,
      borderRadius: button / 2, borderWidth: band, borderColor: ink, backgroundColor: '#ffffff' }} />
  </View>
}

// One fact (a clue found, a room count) in its own rounded row: a Poke Ball on a soft disc, a small label and a line.
// dim shows one not reached yet: a grey ball and muted words.
export function FactRow({ label, text, dim = false }: { label: string, text: string, dim?: boolean }) {
  return <View accessible accessibilityLabel={`${label}. ${text}`} style={look.row}>
    <View style={look.ballDisc}><ColorBall size={30} dim={dim} /></View>
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={[look.rowLabel, dim && { color: colors.muted }]}>{label}</Text>
      <Text style={[look.rowText, dim && { color: colors.muted }]}>{text}</Text>
    </View>
  </View>
}

// A note on a tinted card with a round badge: success (a check on green) or info (a sparkle on the brand's tint).
// detail adds a smaller line under it.
export function StatusNote({ tone, children, detail }: { tone: 'success' | 'info', children: ReactNode, detail?: string }) {
  const success = tone === 'success'
  return <View accessible accessibilityLiveRegion="polite" style={[look.note, success
    ? { backgroundColor: `${colors.success}1A`, borderColor: `${colors.success}40` } : { backgroundColor: colors.mint, borderColor: colors.mintLine }]}>
    {success ? <View style={[look.check, { backgroundColor: colors.success }]}><Text style={look.checkMark}>✓</Text></View>
      : <IconBubble name="sparkle" size={36} background={colors.panel} />}
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={[look.noteText, { color: success ? colors.success : colors.ink }]}>{children}</Text>
      {!!detail && <Copy small>{detail}</Copy>}
    </View>
    {success && <Text style={[look.noteStar, { color: colors.success }]}>✦</Text>}
  </View>
}

// The card's one main action: a wide gradient pill with a Poke Ball at its left end and a chevron at its right.
// loading turns the ball into the loader and blocks presses at full opacity, as Button does.
export function BallButton({ title, onPress, disabled = false, loading = false }: { title: string, onPress: () => void, disabled?: boolean, loading?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || loading, busy: loading }} disabled={disabled || loading} onPress={onPress}
    style={({ pressed }) => [look.action, { opacity: loading ? 1 : disabled ? 0.5 : 1, transform: [{ scale: pressed && !disabled ? 0.98 : 1 }] },
      pressDepth(pressed && !disabled && !loading)]}>
    <GradientFill radius={retro() ? 10 : 999} shadow />
    <View style={look.actionBall}>{loading ? <PokeballLoader size={28} /> : <ColorBall size={40} />}</View>
    <Text numberOfLines={2} style={look.actionText}>{title}</Text>
    <Icon name="chevron" size={24} color={colors.onBrand} />
  </Pressable>
}

// A footnote under the action, set off by a short rule with a star in it.
export function Footnote({ children }: { children: ReactNode }) {
  return <View style={{ gap: 8 }}>
    <View accessible={false} style={look.footRule}>
      <View style={look.footLine} /><Text style={look.footStar}>✦</Text><View style={look.footLine} />
    </View>
    <Text style={look.footText}>{children}</Text>
  </View>
}

const look = themedStyles(() => ({
  status: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  eyebrow: { fontFamily: displayFont(fonts.heavy), color: colors.edge, fontSize: 14, lineHeight: 18, letterSpacing: 0.8 },
  divider: { width: 1.5, height: 16, borderRadius: 1, backgroundColor: colors.line },
  pill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: retro() ? 6 : 999, backgroundColor: colors.mint, borderWidth: 1,
    borderColor: colors.mintLine, boxShadow: `0px 2px 10px ${colors.glow}` },
  pillText: { fontFamily: displayFont(fonts.black), color: colors.edge, fontSize: 12, lineHeight: 16, letterSpacing: 0.8 },
  name: { fontFamily: displayFont(fonts.black), color: colors.ink, fontSize: retro() ? 28 : 32, lineHeight: 40 },
  scene: { borderRadius: retro() ? 10 : 24, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingLeft: 14, paddingRight: 18,
    borderRadius: retro() ? 10 : 28, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, ...shadows.card },
  ballDisc: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunken },
  rowLabel: { fontFamily: displayFont(fonts.heavy), color: colors.edge, fontSize: 13, lineHeight: 18, letterSpacing: 0.6 },
  rowText: { fontFamily: fonts.bold, color: colors.ink, fontSize: 15, lineHeight: 21 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: retro() ? 10 : 24, borderWidth: 1 },
  check: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: '#ffffff', fontFamily: fonts.black, fontSize: 18, lineHeight: 22 },
  noteText: { fontFamily: fonts.heavy, fontSize: 15, lineHeight: 21 },
  noteStar: { fontSize: 18, lineHeight: 22 },
  action: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 10, paddingRight: 20, borderRadius: retro() ? 10 : 999 },
  actionBall: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.9)',
    boxShadow: '0px 3px 8px rgba(20, 30, 60, 0.25)' },
  actionText: { flex: 1, fontFamily: fonts.heavy, color: colors.onBrand, fontSize: 17, lineHeight: 22 },
  footRule: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24 },
  footLine: { flex: 1, height: 1, backgroundColor: colors.line },
  footStar: { color: colors.edge, fontSize: 14, lineHeight: 18 },
  footText: { textAlign: 'center', fontFamily: fonts.bold, color: colors.muted, fontSize: 14, lineHeight: 20, paddingHorizontal: 12 }
}))
