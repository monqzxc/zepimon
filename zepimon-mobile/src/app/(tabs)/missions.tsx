import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { Text, View } from 'react-native'
import { useJournal } from '../../store'
import { missions } from '../../progress'
import { Copy, Eyebrow, Heading, Panel, Screen, colors, styles } from '../../ui'

export default function MissionsScreen() {
  const { journal, progress } = useJournal()
  const [now, setNow] = useState(Date.now)
  useFocusEffect(useCallback(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(timer)
  }, []))
  const all = missions(journal, progress, now)
  const earned = all.filter(mission => !mission.weekly && progress.unlocked[mission.id]).length
  const sections = [
    { title: 'This week', items: all.filter(mission => mission.weekly) },
    { title: 'Journey missions', items: all.filter(mission => !mission.weekly && !mission.hidden) },
    { title: 'Secret discoveries', items: all.filter(mission => mission.hidden) }
  ]
  return <Screen>
    <Eyebrow>SMALL GOALS / BIG ADVENTURES</Eyebrow><Heading>Your quest board</Heading>
    <Panel><Text style={styles.stat}>{earned} badges earned</Text>
      <Copy>Progress grows when you import completed adventures. Walk or run at your own pace.</Copy></Panel>
    {sections.map(({ title, items }) =>
      <View key={title} style={{ gap: 12 }}>
        <Heading>{title}</Heading>
        {items.map(mission => {
          const unlockedAt = progress.unlocked[mission.id]
          const complete = mission.weekly ? mission.value >= mission.goal : !!unlockedAt
          const secret = mission.hidden && !unlockedAt
          return <Panel key={mission.id} style={complete ? { borderColor: colors.gold } : undefined}>
            <Eyebrow>{secret ? '? / UNDISCOVERED' : complete ? '✦ / COMPLETE' : mission.weekly ? 'THIS WEEK' : 'IN PROGRESS'}</Eyebrow>
            <Text style={{ color: colors.ink, fontSize: 19, fontWeight: '700' }}>{secret ? 'Hidden achievement' : mission.title}</Text>
            <Copy>{secret ? 'Keep exploring to uncover this badge.' : mission.description}</Copy>
            {!secret && !mission.hidden && <>
              <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: mission.goal, now: Math.min(mission.goal, complete ? mission.goal : mission.value) }}
                style={{ height: 8, backgroundColor: colors.bg, overflow: 'hidden', borderRadius: 2 }}>
                <View style={{ height: 8, backgroundColor: complete ? colors.gold : colors.edge, width: `${Math.min(100, (complete ? 1 : mission.value / mission.goal) * 100)}%` }} />
              </View>
              <Copy small>{Math.min(mission.goal, complete ? mission.goal : mission.value).toFixed(mission.unit === 'km' ? 1 : 0)} / {mission.goal} {mission.unit}</Copy>
            </>}
            {!!unlockedAt && <Copy small>Discovered {new Date(unlockedAt).toLocaleDateString()}</Copy>}
          </Panel>
        })}
      </View>)}
    <Copy small>Weeks run Monday–Sunday using your phone’s local time. A run counts on its finish date. Weekly goals reset; discovered badges stay earned. Active adventures and duplicate imports do not add progress.</Copy>
    <Copy small>Your totals include runs available in your exports, plus those kept by this phone. Older journeys overwritten before your first import are unavailable.</Copy>
  </Screen>
}
