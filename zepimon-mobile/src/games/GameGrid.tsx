import { useState } from 'react'
import type React from 'react'
import { Pressable, Text, View } from 'react-native'
import { colors, displayFont, fonts, pressDepth, retro, shadows, themedStyles } from '../ui'

type ArtSize = { width: number, height: number }
export type GameTile = {
  id: string, title: string, art: (size: ArtSize) => React.ReactNode, record?: string,
  // What the game is, read out by screen readers in place of the long description the old cards showed.
  about: string, onPress: () => void
}
export type MiniGame = { id: string, title: string, icon: React.ReactNode, about: string, onPress: () => void }

const ART_HEIGHT = 112

// The arcade's main games as picture cards, two to a row: a still scene from the game, its name and best result.
// Rows are built in pairs so both cards in a row share a height, and an odd last game keeps half the width.
export function GameGrid({ games }: { games: GameTile[] }) {
  const rows: GameTile[][] = []
  for (let i = 0; i < games.length; i += 2) rows.push(games.slice(i, i + 2))
  return <View style={look.grid}>
    {rows.map(row => <View key={row.map(game => game.id).join('+')} style={look.row}>
      {row.map(game => <Card key={game.id} game={game} />)}
      {row.length === 1 && <View style={look.spacer} />}
    </View>)}
  </View>
}

function Card({ game }: { game: GameTile }) {
  // The scene is drawn to the card's measured width, so lanes and trail tiles stay square on any phone.
  const [width, setWidth] = useState(0)
  return <Pressable accessibilityRole="button" accessibilityLabel={`${game.title}${game.record ? `. ${game.record}` : ''}`} accessibilityHint={game.about}
    onPress={game.onPress} style={({ pressed }) => [look.card, retro() && look.cardRetro,
      { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }, pressDepth(pressed)]}>
    <View style={look.art} onLayout={event => setWidth(Math.round(event.nativeEvent.layout.width))}>
      {width > 0 && game.art({ width, height: ART_HEIGHT })}
    </View>
    <View style={look.label}>
      <Text numberOfLines={2} style={look.title}>{game.title}</Text>
      {!!game.record && <Text numberOfLines={1} style={look.record}>{game.record}</Text>}
    </View>
  </Pressable>
}

// The smaller extras as a row of square icon tiles under the cards.
export function MiniGames({ games }: { games: MiniGame[] }) {
  return <View style={look.minis}>
    {games.map(game => <Pressable key={game.id} accessibilityRole="button" accessibilityLabel={game.title} accessibilityHint={game.about}
      onPress={game.onPress} style={({ pressed }) => [look.mini, retro() && look.cardRetro,
        { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] }, pressDepth(pressed)]}>
      <View style={look.miniIcon}>{game.icon}</View>
      <Text numberOfLines={1} style={look.miniTitle}>{game.title}</Text>
    </Pressable>)}
  </View>
}

const look = themedStyles(() => ({
  grid: { gap: 12 },
  row: { flexDirection: 'row', gap: 12 },
  spacer: { flex: 1 },
  card: { flex: 1, minWidth: 0, backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: 20, padding: 6, ...shadows.card },
  cardRetro: { borderRadius: 10, borderWidth: 2, borderColor: colors.frameOuter ?? colors.edge, boxShadow: `0px 3px 0px ${colors.frameOuter ?? colors.edge}` },
  art: { height: ART_HEIGHT, borderRadius: retro() ? 6 : 14, overflow: 'hidden', backgroundColor: colors.sunken },
  label: { flex: 1, paddingHorizontal: 6, paddingTop: 8, paddingBottom: 4, gap: 2 },
  title: { fontFamily: displayFont(), fontSize: retro() ? 14 : 15, lineHeight: 19, color: colors.ink },
  record: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 17, color: colors.gold, marginTop: 'auto' },
  minis: { flexDirection: 'row', gap: 10 },
  mini: { flex: 1, minWidth: 0, alignItems: 'center', gap: 6, paddingTop: 12, paddingBottom: 10, paddingHorizontal: 4,
    backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: 16, ...shadows.card },
  miniIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  miniTitle: { fontFamily: displayFont(fonts.bold), fontSize: retro() ? 13 : 14, lineHeight: 18, color: colors.ink }
}))
