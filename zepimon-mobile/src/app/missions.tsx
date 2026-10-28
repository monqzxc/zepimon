import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { Text, View } from 'react-native'
import { useJournal } from '../store'
import { missions } from '../progress'
import { Copy, Eyebrow, Heading, Hero, IconBubble, Panel, Screen, Title, colors, gradient, styles, useTheme } from '../ui'

export default function MissionsScreen() {
  useTheme()
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
    <Hero eyebrow="SMALL GOALS · BIG ADVENTURES" title="Your quest board" />
    <Panel>
      <View style={[styles.row, { flexWrap: 'nowrap' }]}>
        <IconBubble name="badge" background={colors.goldTint} color={colors.gold} />
        <Text style={[styles.stat, { flex: 1 }]}>{earned} badges earned</Text>
      </View>
      <Copy>Progress grows with every adventure you save here or import from your watch. Walk or run at your own pace.</Copy>
    </Panel>
    {sections.map(({ title, items }) =>
      <View key={title} style={{ gap: 12 }}>
        <Heading>{title}</Heading>
        {items.map(mission => {
          const unlockedAt = progress.unlocked[mission.id]
          const complete = mission.weekly ? mission.value >= mission.goal : !!unlockedAt
          const secret = mission.hidden && !unlockedAt
          return <Panel key={mission.id} style={complete ? { borderColor: colors.star, borderWidth: 1.5 } : undefined}>
            <View style={[styles.row, { flexWrap: 'nowrap', alignItems: 'flex-start' }]}>
              <IconBubble name={secret ? 'lock' : complete ? 'check' : 'missions'} size={40}
                background={secret ? colors.sunken : complete ? colors.goldTint : colors.mint} color={secret ? colors.muted : complete ? colors.gold : colors.edge} />
              <View style={{ flex: 1, gap: 2 }}>
                <Eyebrow color={complete ? colors.gold : secret ? colors.muted : colors.edge}>{secret ? 'UNDISCOVERED' : complete ? 'COMPLETE' : mission.weekly ? 'THIS WEEK' : 'IN PROGRESS'}</Eyebrow>
                <Title>{secret ? 'Hidden achievement' : mission.title}</Title>
              </View>
            </View>
            <Copy>{secret ? 'Keep exploring to uncover this badge.' : mission.description}</Copy>
            {!secret && !mission.hidden && <>
              <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: mission.goal, now: Math.min(mission.goal, complete ? mission.goal : mission.value) }}
                style={styles.track}>
                {/* Keyed so finishing a mission mounts a new fill instead of removing the gradient from a live view. */}
                <View key={complete ? 'done' : 'progress'} style={[styles.fill, complete ? { backgroundColor: colors.star } : gradient(),
                  { width: `${Math.min(100, (complete ? 1 : mission.value / mission.goal) * 100)}%` }]} />
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
