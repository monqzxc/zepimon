import { Text, View } from 'react-native'

import { Button, Copy, Eyebrow, Hero, Panel, colors, fonts, styles, themedStyles, typeTints } from '../ui'
import { STOPS, stopUnlocked } from './adventure'
import type { Stop } from './adventure'
import { starText } from './DefenseGame'

export const MODE_NAMES = { guard: 'Route Guard', trail: 'Trail Defense', safari: 'Safari Zone' }
export const STAR_GOALS = {
  guard: '★ Win · ★★ Keep 3 Snorlax asleep · ★★★ Keep all 5',
  trail: '★ Win · ★★ Keep 6 lives · ★★★ Lose no lives',
  safari: '★ Catch 3 · ★★ Catch 5 · ★★★ Catch 7'
}

export function AdventureMap({ stars, onPlay }: { stars: Record<string, number>, onPlay: (stop: Stop) => void }) {
  const total = STOPS.reduce((sum, stop) => sum + (stars[stop.id] || 0), 0)
  return <View style={{ gap: 14 }}>
    <Hero eyebrow="ROUTE 1 TO VICTORY ROAD" title="Adventure Map">
      <Copy color={colors.onBrand}>Nine stops from Route 1 to Victory Road. Earn at least one star at each stop to open the next.</Copy>
    </Hero>
    <Panel>
      <Text style={styles.stat}>★ {total} / {STOPS.length * 3}</Text>
      <Copy>stars collected on this phone</Copy>
    </Panel>
    {STOPS.map((stop, index) => {
      const open = stopUnlocked(stars, index)
      const earned = stars[stop.id] || 0
      return <View key={stop.id} style={map.stop}>
        <View style={map.rail} accessible={false}>
          <View style={[map.dot, earned ? map.dotDone : open ? map.dotOpen : null]} />
          {index < STOPS.length - 1 && <View style={map.line} />}
        </View>
        <Panel style={[{ flex: 1, backgroundColor: open ? typeTints[stop.habitat] || colors.panel : colors.sunken }, !open && map.locked]}>
          <Eyebrow>STOP {index + 1} / {MODE_NAMES[stop.mode].toUpperCase()}</Eyebrow>
          <Text style={map.title}>{stop.title}</Text>
          <Copy small color={colors.ink}>{open ? stop.blurb : `Earn a star at ${STOPS[index - 1].title} to open this stop.`}</Copy>
          {open && <Copy small color={colors.ink}>{STAR_GOALS[stop.mode]}</Copy>}
          <Text accessibilityLabel={`${earned} of 3 stars`} style={map.stars}>{starText(earned)}</Text>
          <Button title={open ? (earned ? 'Play again' : `Play ${MODE_NAMES[stop.mode]}`) : 'Locked'} disabled={!open} onPress={() => onPlay(stop)} />
        </Panel>
      </View>
    })}
    <Copy small>Stars and stops are saved on this phone. Your best free-play scores stay separate.</Copy>
  </View>
}

const map = themedStyles(() => ({
  stop: { flexDirection: 'row', gap: 10 },
  rail: { width: 18, alignItems: 'center', paddingTop: 22 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.panel },
  dotOpen: { borderColor: colors.edge },
  dotDone: { borderColor: colors.star, backgroundColor: colors.star },
  line: { flex: 1, width: 2, marginTop: 4, marginBottom: -26, backgroundColor: colors.edge, opacity: 0.35 },
  locked: { boxShadow: 'none' },
  title: { color: colors.ink, fontSize: 20, lineHeight: 26, fontFamily: fonts.heavy },
  stars: { color: colors.star, fontSize: 22, letterSpacing: 4 }
}))
