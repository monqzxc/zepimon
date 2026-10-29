import type React from 'react'
import { Pressable, Text, View } from 'react-native'
import { colors, displayFont, fonts, pressDepth, retro, shadows, themedStyles } from '../ui'

export type GameTile = {
  id: string, title: string, tint: string, logo: React.ReactNode, record?: string,
  // What the game is, read out by screen readers in place of the long description the old cards showed.
  about: string, onPress: () => void
}

// The arcade's games as small square-ish tiles, two to a row: a logo on the game's tint, its name and best result.
// Rows are built in pairs so both tiles in a row share a height, and an odd last game keeps half the width.
export function GameGrid({ games }: { games: GameTile[] }) {
  const rows: GameTile[][] = []
  for (let i = 0; i < games.length; i += 2) rows.push(games.slice(i, i + 2))
  return <View style={look.grid}>
    {rows.map(row => <View key={row.map(game => game.id).join('+')} style={look.row}>
      {row.map(game => <Tile key={game.id} game={game} />)}
      {row.length === 1 && <View style={look.spacer} />}
    </View>)}
  </View>
}

function Tile({ game }: { game: GameTile }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${game.title}${game.record ? `. ${game.record}` : ''}`} accessibilityHint={game.about}
    onPress={game.onPress} style={({ pressed }) => [look.tile, retro() && look.tileRetro,
      { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }, pressDepth(pressed)]}>
    <View style={[look.logo, { backgroundColor: game.tint }]}>{game.logo}</View>
    <Text numberOfLines={2} style={look.title}>{game.title}</Text>
    {!!game.record && <Text numberOfLines={1} style={look.record}>{game.record}</Text>}
  </Pressable>
}

const look = themedStyles(() => ({
  grid: { gap: 12 },
  row: { flexDirection: 'row', gap: 12 },
  spacer: { flex: 1 },
  tile: { flex: 1, minWidth: 0, backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: 20, padding: 10, gap: 6,
    ...shadows.card },
  tileRetro: { borderRadius: 10, borderWidth: 2, borderColor: colors.frameOuter ?? colors.edge, boxShadow: `0px 3px 0px ${colors.frameOuter ?? colors.edge}` },
  logo: { height: 92, borderRadius: retro() ? 6 : 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, overflow: 'hidden' },
  title: { fontFamily: displayFont(), fontSize: retro() ? 14 : 15, lineHeight: 20, color: colors.ink, paddingHorizontal: 2 },
  record: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, color: colors.gold, paddingHorizontal: 2, marginTop: 'auto' }
}))
