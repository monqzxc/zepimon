import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { typeColors } from '../catalog'
import { typeTheme } from '../HabitatScene'
import { Button, Copy, Eyebrow, colors, fonts, themedStyles } from '../ui'
import { PATHS, WEATHER, WEATHER_POWER, WEATHER_WEAK } from './battle'
import type { BattleSpec, Layout } from './battle'
import { SKILL_MARKS, bossMoves } from './boss'
import type { BossSkill } from './boss'
import type { TeamCard } from './roster'
import type { Suggestion } from './suggest'
import { PixelSprite, TeamPicker } from './TeamPicker'
import { TILE_MARKS, TrailTerrain } from './TrailTerrain'

// What a battle is, for its brief: an eyebrow over the title (the level and its stage), one line about it, its star goals
// and the best stars or score so far.
export type Brief = { eyebrow?: string, title: string, blurb: string, goals?: string, record: string }

const label = (type: string) => type[0].toUpperCase() + type.slice(1)
const types = (list: string[]) => list.map(label).join(', ')
const UP = Math.round((WEATHER_POWER - 1) * 100), DOWN = Math.round((1 - WEATHER_WEAK) * 100)
const BOSS_TIPS: Record<BossSkill, string> = {
  dash: 'rushes ahead. Slow it with Ice.', shield: 'soaks up hits. Poison gets through.', blast: 'hits Pokemon nearby. Spread out.',
  stun: 'stops Pokemon nearby for a while.', heal: 'recovers health. Hit it while it charges.', summon: 'calls two more foes.'
}
type Tag = 'weather' | 'boss' | 'tiles'

// The screen before a battle, kept to one glance: the title and best stars, one card with the map and what makes this
// battle different (weather, boss, element tiles: tap one for details), the Legendary helper in a row, the team, Start,
// and how to play folded away.
export function BattleBrief({ layout, brief, preview, bonus, assists, helper, onHelper, choices, team, onTeam, suggestion, onStart }: {
  layout: Layout, brief: Brief, preview?: BattleSpec, bonus: number, assists: string[], helper: string | null, onHelper: (name: string) => void,
  choices: TeamCard[], team: TeamCard[], onTeam: (team: TeamCard[]) => void, suggestion?: Suggestion, onStart: () => void
}) {
  const [open, setOpen] = useState<Tag | null>(null)
  const [howTo, setHowTo] = useState(false)
  const tiles = useMemo(() => {
    if (!preview) return []
    const counts = new Map<string, number>()
    for (const type of PATHS[preview.path].tiles.values()) counts.set(type, (counts.get(type) ?? 0) + 1)
    return [...counts].sort((a, b) => b[1] - a[1])
  }, [preview])
  const tags: [Tag, string][] = [
    ...preview?.weather ? [['weather', `${WEATHER[preview.weather].mark} ${WEATHER[preview.weather].name}`] as [Tag, string]] : [],
    ...preview?.boss ? [['boss', `Boss · ${preview.boss}`] as [Tag, string]] : [],
    ...tiles.length ? [['tiles', `◆ ${tiles.reduce((sum, [, count]) => sum + count, 0)} element tiles`] as [Tag, string]] : []
  ]
  const trail = preview?.layout === 'trail'
  const theme = preview ? typeTheme(preview.habitat) : null

  return <View style={{ gap: 18 }}>
    <View style={{ gap: 2 }}>
      {!!brief.eyebrow && <Eyebrow>{brief.eyebrow}</Eyebrow>}
      <View style={look.titleRow}>
        <Text style={look.title} accessibilityRole="header">{brief.title}</Text>
        <Text style={look.record}>{brief.record}</Text>
      </View>
      <Copy small>{brief.blurb}</Copy>
    </View>

    <View style={look.card}>
      <View style={look.cardRow}>
        {trail && preview && <MapThumb spec={preview} />}
        <View style={{ flex: 1, gap: 4 }}>
          {preview && <Text style={look.fact}>{preview.waves} waves{trail && theme ? ` · ${PATHS[preview.path].cols}×${PATHS[preview.path].rows} ${theme.label}` : ''}</Text>}
          {!!brief.goals && <Text style={look.goals}>{brief.goals.split(' · ').join('\n')}</Text>}
          {bonus > 0 && <Text style={look.bonus}>+◉ {bonus} walking bonus</Text>}
        </View>
      </View>
      {tags.length > 0 && <View style={look.tags}>{tags.map(([tag, text]) =>
        <Pressable key={tag} accessibilityRole="button" accessibilityState={{ expanded: open === tag }} onPress={() => setOpen(open === tag ? null : tag)}
          style={({ pressed }) => [look.tag, open === tag && look.tagOn, { opacity: pressed ? 0.7 : 1 }]}>
          <Text style={[look.tagText, open === tag && { color: colors.onEdge }]}>{text}</Text>
        </Pressable>)}</View>}
      {open === 'weather' && preview?.weather && <View style={look.detail}>
        <Copy small color={colors.ink}>{`${types(WEATHER[preview.weather].types)} foes are tougher.`}</Copy>
        <Copy small color={colors.ink}>{`Your ${types(WEATHER[preview.weather].types)} ▲ +${UP}% · ${types(WEATHER[preview.weather].weakens)} ▼ −${DOWN}%`}</Copy>
      </View>}
      {open === 'boss' && preview?.boss && <View style={look.detail}>
        <View style={look.bossRow}>
          <PixelSprite name={preview.boss} size={36} />
          <Text style={look.fact}>Shadow {preview.boss} · last wave</Text>
        </View>
        {bossMoves(preview.boss).map(({ skill, move }) => <Copy key={move} small color={colors.ink}>{`${SKILL_MARKS[skill]} ${move}: ${BOSS_TIPS[skill]}`}</Copy>)}
      </View>}
      {open === 'tiles' && <View style={look.detail}>
        <View style={look.tags}>{tiles.map(([type, count]) => <View key={type} style={[look.tile, { backgroundColor: typeColors[type] ?? colors.sunken }]}>
          <Text style={look.tileText}>{TILE_MARKS[type] ?? '○'} {label(type)} ×{count}</Text>
        </View>)}</View>
        <Copy small color={colors.ink}>Only Pokemon of a tile’s type can stand on it.</Copy>
      </View>}
    </View>

    {assists.length > 0 && <View style={{ gap: 8 }}>
      <View style={look.sectionHead}>
        <Eyebrow>HELPER</Eyebrow>
        <Text style={look.hint}>Once per battle</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
        {assists.map(name => <Pressable key={name} accessibilityRole="radio" accessibilityState={{ selected: helper === name }}
          accessibilityLabel={`${name} as your helper`} onPress={() => onHelper(name)} style={({ pressed }) => [look.helper, { opacity: pressed ? 0.7 : 1 }]}>
          <View style={[look.helperArt, helper === name && look.helperOn]}><PixelSprite name={name} size={40} /></View>
          <Text numberOfLines={1} style={[look.helperName, helper === name && { color: colors.edge }]}>{name}</Text>
        </Pressable>)}
      </ScrollView>
    </View>}

    <TeamPicker layout={layout} choices={choices} team={team} onChange={onTeam} suggestion={suggestion} weather={preview?.weather} />
    <Button title={team.length ? 'Start battle' : 'Choose at least one Pokemon'} disabled={!team.length} onPress={onStart} />

    <Pressable accessibilityRole="button" accessibilityState={{ expanded: howTo }} onPress={() => setHowTo(!howTo)} style={look.howToHead}>
      <Text style={look.howToTitle}>How to play</Text>
      <Text style={look.howToTitle}>{howTo ? '−' : '+'}</Text>
    </Pressable>
    {howTo && <View style={{ gap: 4, marginTop: -10 }}>{(layout === 'lanes' ? [
      'Tap a card, then a square. Foes walk down the lanes and nibble the first Pokemon in their way.',
      'Grass types grow berries: tap to collect. Rock, Ground and Steel block.',
      'A foe that gets through wakes that lane’s Snorlax once. A second one ends the battle.'
    ] : [
      'Tap a card, then a square beside the trail. Tap a placed Pokemon to evolve it.',
      'A foe that reaches the Poke Ball costs a life; a boss costs three.'
    ]).concat([
      'Super-effective hits deal ×2. EGG Pokemon know an egg move.',
      'Hits can leave a status: BRN burns, FRZ freezes, FRB frostbites, PAR slows, SLP sleeps, PSN poisons, CNF sends foes back.',
      'Leaving the app pauses the battle.'
    ]).map(line => <Copy key={line} small>• {line}</Copy>)}</View>}
  </View>
}

// A small still picture of the trail.
function MapThumb({ spec }: { spec: BattleSpec }) {
  const { cols, rows, name } = PATHS[spec.path]
  const theme = typeTheme(spec.habitat)
  const cell = Math.min(12, 92 / cols, 124 / rows)
  return <View accessible accessibilityLabel={`Map of ${name}: ${cols} by ${rows} squares`}
    style={[look.thumb, { width: cols * cell, height: rows * cell, backgroundColor: theme.sky }]}>
    <TrailTerrain path={spec.path} cell={cell} theme={theme} />
  </View>
}

const look = themedStyles(() => ({
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, color: colors.ink, fontFamily: fonts.black, fontSize: 28, lineHeight: 34 },
  record: { color: colors.gold, fontFamily: fonts.black, fontSize: 16, lineHeight: 22 },
  card: { gap: 12, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  thumb: { borderRadius: 10, overflow: 'hidden' },
  fact: { color: colors.ink, fontFamily: fonts.heavy, fontSize: 14, lineHeight: 19 },
  goals: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  bonus: { color: colors.gold, fontFamily: fonts.heavy, fontSize: 12, lineHeight: 17 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, backgroundColor: colors.sunken },
  tagOn: { backgroundColor: colors.edge },
  tagText: { color: colors.ink, fontFamily: fonts.heavy, fontSize: 12, lineHeight: 16 },
  detail: { gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
  bossRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tile: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  tileText: { color: '#FFFFFF', fontSize: 12, lineHeight: 16, fontFamily: fonts.heavy },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  hint: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  helper: { width: 64, alignItems: 'center', gap: 4 },
  helperArt: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunken,
    borderWidth: 2, borderColor: 'transparent' },
  helperOn: { borderColor: colors.edge, backgroundColor: colors.mint },
  helperName: { color: colors.muted, fontFamily: fonts.heavy, fontSize: 11, lineHeight: 14 },
  howToHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1,
    borderTopColor: colors.line },
  howToTitle: { color: colors.ink, fontFamily: fonts.heavy, fontSize: 15, lineHeight: 20 }
}))
