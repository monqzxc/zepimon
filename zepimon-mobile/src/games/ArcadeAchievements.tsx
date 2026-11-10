import { useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { router } from 'expo-router'
import { useJournal } from '../store'
import { arcadePointsLeft } from '../expedition-quest'
import { ARCADE_PERMIT_POINTS, achieved, arcadeAchievements, legendaryPoints } from './achievements'
import { Button, Copy, Eyebrow, Panel, colors, fonts, gradient, styles, themedStyles } from '../ui'

// Arcade and running achievements and their points toward Expedition Permits, in the arcade, with a way to Expeditions
// (where the points are traded: src/games/ExpeditionRoutes.tsx).
export function ArcadeAchievements({ place }: { place: 'arcade' }) {
  const store = useJournal()
  const [open, setOpen] = useState(false)
  const { arcadeScores, bestMoves, adventure, trailLevels, trialRecords, safari, progress, phoneRuns } = store
  const points = useMemo(() => legendaryPoints({ arcadeScores, bestMoves, adventure, trailLevels, trialRecords, safari, progress, phoneRuns }),
    [arcadeScores, bestMoves, adventure, trailLevels, trialRecords, safari, progress, phoneRuns])
  const list = arcadeAchievements(store)
  const done = list.filter(achieved)
  const left = arcadePointsLeft(store.quest, points.total)
  const total = list.reduce((sum, item) => sum + item.points, 0)
  return <Panel style={place === 'arcade' ? { backgroundColor: colors.goldTint } : undefined}>
    <Eyebrow>ARCADE ACHIEVEMENTS · LEGENDARY POINTS</Eyebrow>
    <Text style={styles.stat}>{points.total} points</Text>
    <Copy color={colors.ink}>{points.arcade} from the arcade ({done.length} of {list.length}) · {points.running} from running · {Math.min(left, ARCADE_PERMIT_POINTS)} / {ARCADE_PERMIT_POINTS} toward your next Expedition Permit</Copy>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: ARCADE_PERMIT_POINTS, now: Math.min(left, ARCADE_PERMIT_POINTS) }} style={styles.track}>
      <View style={[styles.fill, gradient(), { width: `${Math.min(1, left / ARCADE_PERMIT_POINTS) * 100}%` }]} />
    </View>
    <Copy small>Every {ARCADE_PERMIT_POINTS} points can be traded for a permit that opens your next Legendary encounter, with no walking needed. You still face its trial and battle, and a Poké Ball has to hold. {store.quest.arcade ? `Permits traded so far: ${store.quest.arcade}. ` : ''}Arcade achievements together are worth {total} points, and running feats and milestones add theirs.</Copy>
    <Button title={left >= ARCADE_PERMIT_POINTS ? 'Trade points on Legendary Expeditions' : 'Open Legendary Expeditions'} secondary
      onPress={() => router.push('/expeditions')} />
    <Button title={open ? 'Hide arcade achievements' : 'Show arcade achievements'} secondary onPress={() => setOpen(!open)} />
    <Button title="Running achievements" secondary onPress={() => router.push('/achievements')} />
    {open && <AchievementRows />}
  </Panel>
}

// Every arcade achievement as a row: a star, its name and game, what it takes (and how far along), and its points.
export function AchievementRows() {
  const store = useJournal()
  return <>{arcadeAchievements(store).map(item => {
    const got = achieved(item)
    return <View key={item.id} style={[look.row, got && look.got]} accessible
      accessibilityLabel={`${item.title}, ${item.game}, ${item.points} points, ${got ? 'unlocked' : `${Math.min(item.value, item.goal)} of ${item.goal}`}. ${item.description}`}>
      <Text style={[look.mark, { color: got ? colors.success : colors.muted }]}>{got ? '★' : '☆'}</Text>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={look.title}>{item.title} <Text style={look.game}>· {item.game}</Text></Text>
        <Text style={look.detail}>{item.description}{got ? '' : ` (${Math.min(item.value, item.goal)} / ${item.goal})`}</Text>
      </View>
      <Text style={[look.points, { color: got ? colors.success : colors.muted }]}>+{item.points}</Text>
    </View>
  })}</>
}

const look = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  got: { backgroundColor: colors.mint, borderColor: colors.mintLine },
  mark: { fontSize: 20, lineHeight: 24, fontFamily: fonts.black },
  title: { color: colors.ink, fontSize: 14, lineHeight: 19, fontFamily: fonts.heavy },
  game: { color: colors.muted, fontFamily: fonts.bold },
  detail: { color: colors.muted, fontSize: 12, lineHeight: 16, fontFamily: fonts.body },
  points: { fontSize: 14, fontFamily: fonts.black }
}))
