import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useJournal } from '../store'
import { MAX_PERMITS } from '../expedition-release'
import { Button, Chip, Copy, Eyebrow, Heading, Panel, colors, fonts, retro, styles, themedStyles } from '../ui'
import { PixelSprite } from './TeamPicker'
import { caughtLegendaries } from './revisits'

// Releasing caught Legendaries for Expedition Permits, one each (rules in src/expedition-release.ts). Every caught
// Legendary is a row to tick; Select all ticks the Normal ones only, so a Shiny is never released without being picked
// by hand. Releasing cannot be undone, so the button asks once more, saying exactly what leaves and what is gained.
export function ReleaseLegendaries({ busy, error, onRelease, onBack }: { busy: boolean, error: string, onRelease: (keys: string[]) => void, onBack: () => void }) {
  const { expeditions, quest, buddy } = useJournal()
  const caught = caughtLegendaries(expeditions.dex)
  const [picked, setPicked] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)
  // Only what is still caught counts, in case the Dex changed under the list.
  const chosen = caught.filter(({ key }) => picked.includes(key))
  const normal = caught.filter(({ shiny }) => !shiny).map(({ key }) => key)
  const allNormal = normal.length > 0 && normal.every(key => picked.includes(key))
  const room = MAX_PERMITS - quest.permits
  const toggle = (key: string) => { setConfirming(false); setPicked(keys => keys.includes(key) ? keys.filter(item => item !== key) : [...keys, key]) }
  const count = chosen.length
  const shinies = chosen.filter(({ shiny }) => shiny).length
  const legendaries = `${count} Legendar${count === 1 ? 'y' : 'ies'}`
  const permits = `${count} Expedition Permit${count === 1 ? '' : 's'}`
  return <Panel style={{ gap: 12 }}>
    <Eyebrow>RELEASE FOR PERMITS</Eyebrow>
    <Heading>Back to the wild</Heading>
    <Copy>Each Legendary you release gives one Expedition Permit, which opens your next encounter. A released Legendary leaves your Dex, along with its shrine, rematch wins and egg, and can be met again on a later expedition.</Copy>
    <Text style={look.held}>Permits held: {quest.permits}</Text>
    {caught.length ? <>
      <View style={styles.row}>
        <Chip label={allNormal ? 'Clear' : 'Select all'} selected={allNormal} disabled={!normal.length}
          onPress={() => { setConfirming(false); setPicked(keys => allNormal ? keys.filter(key => !normal.includes(key)) : [...new Set([...keys, ...normal])]) }} />
        {caught.length > normal.length && <Copy small>Select all leaves your Shinies out. Tick one yourself to release it.</Copy>}
      </View>
      <View style={{ gap: 6 }}>{caught.map(({ name, shiny, key }) => {
        const on = picked.includes(key)
        return <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(key)}
          accessibilityLabel={`${shiny ? 'Shiny ' : ''}${name}${key === buddy ? ', your buddy' : ''}`}
          style={({ pressed }) => [look.row, on && look.rowOn, pressed && { opacity: 0.7 }]}>
          <View style={[look.box, on && look.boxOn]}>{on && <Text style={look.tick}>✓</Text>}</View>
          <PixelSprite name={name} shiny={shiny} size={40} />
          <Text numberOfLines={1} style={look.name}>{name}{shiny && <Text style={{ color: colors.star }}> ✦ Shiny</Text>}</Text>
          {key === buddy && <Text style={look.tag}>BUDDY</Text>}
        </Pressable>
      })}</View>
      {confirming && <View accessibilityLiveRegion="polite" style={look.warning}>
        <Text style={look.warningTitle}>Release {legendaries}?</Text>
        <Copy small color={colors.ink}>{chosen.map(({ key }) => key).join(', ')} will leave your Dex for good{shinies ? `, ${shinies === 1 ? 'a Shiny' : `${shinies} Shinies`} included` : ''}. You will receive {permits}. This cannot be undone.</Copy>
      </View>}
      {!!error && <Copy color={colors.danger}>{error}</Copy>}
      {count > room && <Copy color={colors.danger}>You can hold {MAX_PERMITS} permits at most. Use some first.</Copy>}
      {confirming ? <Button title={`Yes, release for ${permits}`} loading={busy} disabled={!count || count > room} onPress={() => onRelease(chosen.map(({ key }) => key))} />
        : <Button title={count ? `Release ${legendaries} · +${permits}` : 'Tick a Legendary to release'} disabled={!count || count > room || busy} onPress={() => setConfirming(true)} />}
    </> : <Copy>You have no caught Legendaries to release.</Copy>}
    <Button title={confirming ? 'Keep them' : 'Back to Expeditions'} secondary disabled={busy} onPress={confirming ? () => setConfirming(false) : onBack} />
  </Panel>
}

const look = themedStyles(() => ({
  held: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 15, lineHeight: 21 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 6, borderRadius: retro() ? 8 : 16,
    backgroundColor: colors.sunken, borderWidth: 2, borderColor: 'transparent' },
  rowOn: { borderColor: colors.edge, backgroundColor: colors.panel },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  boxOn: { borderColor: colors.edge, backgroundColor: colors.edge },
  tick: { color: colors.onEdge, fontFamily: fonts.black, fontSize: 15, lineHeight: 18 },
  name: { flex: 1, fontFamily: fonts.heavy, color: colors.ink, fontSize: 16, lineHeight: 22 },
  tag: { fontFamily: fonts.heavy, color: colors.muted, fontSize: 11, lineHeight: 15, letterSpacing: 0.8 },
  warning: { gap: 4, padding: 12, borderRadius: retro() ? 8 : 16, borderWidth: 2, borderColor: colors.danger, backgroundColor: colors.sunken },
  warningTitle: { fontFamily: fonts.black, color: colors.ink, fontSize: 17, lineHeight: 23 }
}))
