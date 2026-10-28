import { useMemo } from 'react'
import { Pressable, View } from 'react-native'
import { router } from 'expo-router'
import type { Adventure } from './adventures'
import { averagePace, duration, km, recordForm } from './journal'
import { decodePath } from './phone-adventure'
import { RouteView } from './RouteView'
import { ShareRunButton, cardTitle } from './ShareCard'
import { PixelSprite } from './games/TeamPicker'
import { Copy, Icon, Title, colors, styles, themedStyles } from './ui'

// A saved adventure in the Journal, All adventures and the Adventure tab. Tapping it opens its details (the share
// button sits beside the tappable area, not inside it, so screen readers reach both).
export function AdventureCard({ adventure }: { adventure: Adventure }) {
  const { family, record } = adventure
  const points = useMemo(() => adventure.path ? decodePath(adventure.path) : [], [adventure.path])
  const title = cardTitle(family, record)
  const finished = new Date(record.finishedAt)
  const details = [adventure.device === 'phone' ? 'This phone' : 'Watch', record.activity && (record.activity === 'running' ? 'Run' : 'Walk'),
    finished.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    `Pace ${averagePace(record.elapsedSeconds, record.meters)}`].filter(Boolean).join(' · ')
  return <View style={[styles.panel, card.panel]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${km(record.meters)}, ${duration(record.elapsedSeconds)}. ${details}`}
      accessibilityHint="Opens this adventure's details" onPress={() => router.push({ pathname: '/adventure-details', params: { id: adventure.id } })}
      style={({ pressed }) => [card.main, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={card.art}><PixelSprite name={recordForm(family, record)} shiny={record.shiny} size={56} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Title>{title}</Title>
        <Copy>{km(record.meters)} · {duration(record.elapsedSeconds)}</Copy>
        <Copy small>{details}</Copy>
      </View>
      {points.length > 0 && <View style={{ width: 76 }}><RouteView points={points} height={64} compact label={`Route of ${km(record.meters)}`} /></View>}
      <Icon name="chevron" size={18} color={colors.muted} />
    </Pressable>
    <View style={card.footer}><ShareRunButton id={adventure.id} /></View>
  </View>
}

const card = themedStyles(() => ({
  panel: { padding: 0, gap: 0 },
  main: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, paddingBottom: 6 },
  art: { borderRadius: 18, backgroundColor: colors.sunken },
  // Lines the share button up with the text above it.
  footer: { paddingLeft: 80, paddingRight: 14, paddingBottom: 14 }
}))
