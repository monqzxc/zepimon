import { useMemo, useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { useJournal } from './store'
import { allAdventures } from './adventures'
import { LEVEL_ORDER, bestTimes, levelDetail, levelFor, levelName } from './profile'
import { ConfirmDialog } from './ConfirmDialog'
import { Button, Copy, Heading, Screen, colors, fonts, themedStyles } from './ui'

// Choosing a runner level (src/profile.ts) the first time, until one is set. A new player picks from three cards. Someone
// who already has saved adventures is not blocked: a dialog suggests the level their records reach, and they can set it or
// choose themselves. Nothing here ever sets a level without a tap, and it never shows once one is set.
export function LevelWelcome() {
  const { ready, profile, progress, phoneRuns, setLevel } = useJournal()
  const [choosing, setChoosing] = useState(false)
  // Someone with saved adventures can put it off for this launch; a new player must pick (the cards are the first screen).
  const [later, setLater] = useState(false)
  const [error, setError] = useState('')
  const adventures = useMemo(() => allAdventures(progress, phoneRuns), [progress, phoneRuns])
  if (!ready || profile.level || later) return null
  // A level picked by hand carries today's bests, so only a better time offers the next one.
  const best = bestTimes(adventures)
  const choose = (level: (typeof LEVEL_ORDER)[number]) => {
    setError('')
    setLevel(level, adventures.length ? best : undefined).catch(() => setError('Could not save your level. Try again.'))
  }
  if (adventures.length && !choosing) {
    const suggested = levelFor(best)
    return <ConfirmDialog visible title="Your runner level" confirm="Set it" cancel="Choose myself" onCancel={() => setChoosing(true)}
      body={`We suggest ${levelName[suggested]} from your records. Set it?`} onConfirm={() => choose(suggested)} />
  }
  return <Modal visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => {}}>
    <Screen>
      <Heading>Pick your runner level</Heading>
      <Copy>It helps Zepimon tell real progress from a ride or a GPS glitch. You can change it any time in Settings.</Copy>
      {LEVEL_ORDER.map(level => <Pressable key={level} accessibilityRole="button" accessibilityLabel={`${levelName[level]}. ${levelDetail[level]}`}
        onPress={() => choose(level)} style={({ pressed }) => [card.card, { opacity: pressed ? 0.8 : 1 }]}>
        <Text style={card.name}>{levelName[level]}</Text>
        <Text style={card.detail}>{levelDetail[level]}</Text>
      </Pressable>)}
      <View style={{ height: 4 }} />
      {!!error && <Copy color={colors.danger}>{error}</Copy>}
      <Button title="Not sure? Start as Beginner" secondary onPress={() => choose('beginner')} />
      {adventures.length > 0 && <Button title="Maybe later" secondary onPress={() => setLater(true)} />}
    </Screen>
  </Modal>
}

const card = themedStyles(() => ({
  card: { borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, paddingVertical: 16, paddingHorizontal: 18, gap: 2 },
  name: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 18, lineHeight: 24 },
  detail: { fontFamily: fonts.bold, color: colors.muted, fontSize: 14, lineHeight: 20 }
}))
