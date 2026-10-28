import { Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import type { Href } from 'expo-router'
import { useJournal } from './store'
import { missions } from './progress'
import { trailUnlocked } from './expedition-quest'
import { Icon, colors, fonts, themedStyles, glass } from './ui'
import type { IconName } from './ui'

// Missions and Legendary Expeditions on the Adventure tab, as two pastel tiles like the Journal's: this week's distance
// toward its 10 km mission and the badges earned, and the expedition encounters waiting.

export function QuestTiles() {
  const { journal, progress, expeditions, quest } = useJournal()
  const all = missions(journal, progress)
  const week = all.find(mission => mission.id === 'week-distance')
  const badges = all.filter(mission => !mission.weekly)
  const earned = badges.filter(mission => progress.unlocked[mission.id]).length
  const waiting = Object.entries(expeditions.trails).reduce((sum, [key, trail]) => sum + trailUnlocked(quest, key, trail) - trail.claimed, 0)
  return <View style={tiles.row}>
    <Tile href="/missions" icon="missions" tint={colors.mint} ink={colors.edge} title="Missions"
      line={`${earned} of ${badges.length} badges`}
      detail={week ? `This week ${Math.min(week.value, week.goal).toFixed(1)} of ${week.goal} km` : ''}
      fill={week ? Math.min(1, week.value / week.goal) : 0} />
    <Tile href="/expeditions" icon="explore" tint={colors.altTint} ink={colors.alt} title="Expeditions"
      line={waiting ? `${waiting} encounter${waiting === 1 ? '' : 's'} waiting` : 'A Legendary awaits'}
      detail={quest.permits ? `${quest.permits} Expedition Permit${quest.permits === 1 ? '' : 's'} ready` : 'Three clues across 25 km'} />
  </View>
}

function Tile({ href, icon, tint, ink, title, line, detail, fill }: {
  href: Href, icon: IconName, tint: string, ink: string, title: string, line: string, detail: string, fill?: number
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${line}. ${detail}`} onPress={() => router.push(href)}
    style={({ pressed }) => [tiles.tile, { backgroundColor: tint, opacity: pressed ? 0.8 : 1 }]}>
    <View style={tiles.badge}><Icon name={icon} size={20} color={ink} /></View>
    <View style={{ gap: 3 }}>
      <Text style={[tiles.title, { color: ink }]}>{title}</Text>
      <Text style={tiles.line}>{line}</Text>
      {fill != null && <View style={tiles.track}><View style={[tiles.fill, { width: `${fill * 100}%`, backgroundColor: ink }]} /></View>}
      <Text style={tiles.detail}>{detail}</Text>
    </View>
  </Pressable>
}

const tiles = themedStyles(() => ({
  row: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, minHeight: 168, borderRadius: 26, padding: 16, justifyContent: 'space-between', gap: 12 },
  badge: { width: 40, height: 40, borderRadius: 20, backgroundColor: glass(0.85), alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.black, fontSize: 21, lineHeight: 26 },
  line: { fontFamily: fonts.bold, color: colors.ink, fontSize: 14, lineHeight: 19 },
  track: { height: 6, borderRadius: 3, backgroundColor: glass(0.9), overflow: 'hidden', marginVertical: 3 },
  fill: { height: 6, borderRadius: 3 },
  detail: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, lineHeight: 16 }
}))
