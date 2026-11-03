import { useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useJournal } from '../store'
import { allAdventures } from '../adventures'
import { achievements, runningPoints } from '../running'
import type { Achievement } from '../running'
import { arcadePointsLeft } from '../expedition-quest'
import { ARCADE_PERMIT_POINTS, arcadePoints } from '../games/achievements'
import { RunningTickets } from '../games/RunningTickets'
import { Button, Copy, Eyebrow, Heading, Hero, IconBubble, Panel, Screen, Title, colors, fonts, gradient, styles, useTheme } from '../ui'

// Every running achievement (src/running.ts), opened from the Journal: feats of pace and speed, then milestones of
// distance and consistency. Earned ones show when and open the adventure that earned them; the rest show how close
// you are. Each is worth Legendary points, which fill the same gauge as the arcade's toward an Expedition Permit.
export default function AchievementsScreen() {
  useTheme()
  const store = useJournal()
  const { progress, phoneRuns, quest } = store
  const all = useMemo(() => achievements(allAdventures(progress, phoneRuns)), [progress, phoneRuns])
  const earned = all.filter(item => item.earned).length
  const running = runningPoints(all)
  const left = Math.min(ARCADE_PERMIT_POINTS, arcadePointsLeft(quest, running + arcadePoints(store)))
  const sections = [
    { title: 'Feats', line: 'Times, paces and pacing in a single adventure.', items: all.filter(item => item.group === 'feat') },
    { title: 'Milestones', line: 'Distance and consistency, one adventure at a time.', items: all.filter(item => item.group === 'milestone') }
  ]
  return <Screen>
    <Hero eyebrow="EVERY STRIDE COUNTS" title="Your achievements" />
    <Panel>
      <View style={[styles.row, { flexWrap: 'nowrap' }]}>
        <IconBubble name="trophy" background={colors.goldTint} color={colors.gold} />
        <Text style={[styles.stat, { flex: 1 }]}>{earned} of {all.length} earned</Text>
      </View>
      <Copy>Race times count the clock from the first step of the stretch to the last, as in a race. Paces and splits use moving time. Phone adventures record both; for watch adventures only the time to hatch (your first 5 km) and whole adventures of about a race distance count.</Copy>
    </Panel>
    <Panel style={{ backgroundColor: colors.goldTint }}>
      <Eyebrow>LEGENDARY POINTS</Eyebrow>
      <Text style={styles.stat}>{running} of {all.reduce((sum, item) => sum + item.points, 0)} from running</Text>
      <Copy color={colors.ink}>{left} / {ARCADE_PERMIT_POINTS} toward your next Expedition Permit, with your arcade points</Copy>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: ARCADE_PERMIT_POINTS, now: left }} style={styles.track}>
        <View style={[styles.fill, gradient(), { width: `${left / ARCADE_PERMIT_POINTS * 100}%` }]} />
      </View>
      <Copy small>Each achievement adds its points once. Every {ARCADE_PERMIT_POINTS} points, from running and the arcade together, trade for a permit that opens your next Legendary encounter. You still face its trial and battle.</Copy>
      <Button title={left >= ARCADE_PERMIT_POINTS ? 'Trade points on Legendary Expeditions' : 'Open Legendary Expeditions'} secondary
        onPress={() => router.push('/expeditions')} />
    </Panel>
    <RunningTickets place="achievements" />
    {sections.map(({ title, line, items }) => <View key={title} style={{ gap: 12 }}>
      <Heading>{title}</Heading>
      <Copy small>{line}</Copy>
      {items.map(item => <Item key={item.id} item={item} />)}
    </View>)}
  </Screen>
}

function Item({ item }: { item: Achievement }) {
  const { earned, fraction, note } = item
  const date = earned ? new Date(earned.at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  const body = <Panel style={earned ? { borderColor: colors.star, borderWidth: 1.5 } : undefined}>
    <View style={[styles.row, { flexWrap: 'nowrap', alignItems: 'flex-start' }]}>
      <IconBubble name={item.icon} size={40} background={earned ? colors.goldTint : colors.sunken} color={earned ? colors.gold : colors.muted} />
      <View style={{ flex: 1, gap: 2 }}>
        <Eyebrow color={earned ? colors.gold : colors.edge}>{earned ? `EARNED ${date.toUpperCase()}` : fraction ? 'IN PROGRESS' : 'NOT YET'}</Eyebrow>
        <Title>{item.title}</Title>
      </View>
      <Text accessibilityLabel={`${item.points} Legendary points${earned ? ', added' : ''}`}
        style={{ fontFamily: fonts.black, fontSize: 15, lineHeight: 20, color: earned ? colors.gold : colors.muted }}>+{item.points}</Text>
    </View>
    {earned && <Copy color={colors.ink}>{earned.detail}</Copy>}
    <Copy small={!!earned}>{item.description}</Copy>
    {item.ticket && <Copy small color={colors.gold}>🎟 Also gives a running ticket: an Expedition Permit.</Copy>}
    {!earned && fraction !== null && <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }} style={styles.track}>
      <View style={[styles.fill, gradient(), { width: `${Math.round(fraction * 100)}%` }]} />
    </View>}
    {!!note && <Copy small>{note}</Copy>}
    {earned && <Copy small color={colors.edge}>Open the adventure that earned it ›</Copy>}
  </Panel>
  if (!earned) return body
  return <Pressable accessibilityRole="button" accessibilityHint="Opens the adventure that earned it"
    onPress={() => router.push({ pathname: '/adventure-details', params: { id: earned.adventure.id } })}
    style={({ pressed }) => pressed && { opacity: 0.75 }}>{body}</Pressable>
}
