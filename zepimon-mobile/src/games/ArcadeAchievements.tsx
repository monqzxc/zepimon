import { useState } from 'react'
import { Text, View } from 'react-native'
import { router } from 'expo-router'
import { useJournal } from '../store'
import { arcadePointsLeft } from '../expedition-quest'
import { ARCADE_PERMIT_POINTS, achieved, arcadeAchievements } from './achievements'
import { Button, Copy, Eyebrow, Panel, colors, fonts, gradient, styles, themedStyles } from '../ui'

// Arcade achievements and their points toward Expedition Permits. The arcade shows it with a way to Expeditions; the
// Expeditions screen shows it as the third unlock route, with the trade button.
export function ArcadeAchievements({ place }: { place: 'arcade' | 'expeditions' }) {
  const store = useJournal()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const list = arcadeAchievements(store)
  const done = list.filter(achieved)
  const points = done.reduce((sum, item) => sum + item.points, 0)
  const left = arcadePointsLeft(store.quest, points)
  const total = list.reduce((sum, item) => sum + item.points, 0)
  async function trade() {
    setBusy(true); setMessage('')
    try { await store.earnArcadePermit(); setMessage('Points traded! You received an Expedition Permit.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the permit. Try again.') }
    finally { setBusy(false) }
  }
  return <Panel style={place === 'arcade' ? { backgroundColor: colors.goldTint } : undefined}>
    <Eyebrow>{place === 'arcade' ? 'ARCADE ACHIEVEMENTS · LEGENDARY POINTS' : 'ROUTE C · ARCADE ACHIEVEMENTS'}</Eyebrow>
    <Text style={styles.stat}>{points} points</Text>
    <Copy color={colors.ink}>{done.length} of {list.length} achievements · {Math.min(left, ARCADE_PERMIT_POINTS)} / {ARCADE_PERMIT_POINTS} toward your next Expedition Permit</Copy>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: ARCADE_PERMIT_POINTS, now: Math.min(left, ARCADE_PERMIT_POINTS) }} style={styles.track}>
      <View style={[styles.fill, gradient(), { width: `${Math.min(1, left / ARCADE_PERMIT_POINTS) * 100}%` }]} />
    </View>
    <Copy small>Every {ARCADE_PERMIT_POINTS} points can be traded for a permit that opens your next Legendary encounter, with no walking needed. You still face its trial and battle, and a Poké Ball has to hold. {store.quest.arcade ? `Permits traded so far: ${store.quest.arcade}. ` : ''}All achievements together are worth {total} points.</Copy>
    {place === 'expeditions' ? left >= ARCADE_PERMIT_POINTS &&
      <Button title={`Trade ${ARCADE_PERMIT_POINTS} points for a permit`} loading={busy} onPress={() => { void trade() }} />
      : <Button title={left >= ARCADE_PERMIT_POINTS ? 'Trade points on Legendary Expeditions' : 'Open Legendary Expeditions'} secondary
        onPress={() => router.push('/expeditions')} />}
    {!!message && <Copy color={colors.gold}>{message}</Copy>}
    <Button title={open ? 'Hide achievements' : 'Show all achievements'} secondary onPress={() => setOpen(!open)} />
    {open && list.map(item => {
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
    })}
  </Panel>
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
