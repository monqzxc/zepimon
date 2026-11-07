import { useState } from 'react'
import { Image, Platform, Pressable, Text, TextInput, View } from 'react-native'
import { spriteSource } from '../catalog'
import { Copy, Eyebrow, colors, fonts, styles, themedStyles } from '../ui'
import { WEATHER, eggPerk, kitFor, placedForm, unitWeather } from './battle'
import type { Layout, Weather } from './battle'
import { TEAM_SIZE, autoTeam, battleType, cardKey } from './roster'
import type { TeamCard } from './roster'
import type { Suggestion } from './suggest'

const SHOWN = 24
// A still sprite for busy game boards; the Dex keeps the interactive Sprite.
// tint paints the sprite one solid color, as a silhouette (the Legendary Gate's sealed Legendary).
export function PixelSprite({ name, shiny = false, size, tint }: { name: string, shiny?: boolean, size: number, tint?: string }) {
  return <Image source={spriteSource(name, shiny)} resizeMode="contain" fadeDuration={0} accessible={false}
    style={{ width: size, height: size, ...(tint ? { tintColor: tint } : {}), ...(Platform.OS === 'web' ? { imageRendering: 'pixelated' } : {}) }} />
}

// The team before a battle: six slots, the level's suggested team a tap away (with why, on request), and the full list
// of your Pokemon only while editing. weather marks the Pokemon it powers up (▲) or weakens (▼).
export function TeamPicker({ layout, choices, team, onChange, suggestion, weather }: {
  layout: Layout, choices: TeamCard[], team: TeamCard[], onChange: (team: TeamCard[]) => void, suggestion?: Suggestion, weather?: Weather
}) {
  const [editing, setEditing] = useState(false)
  const [why, setWhy] = useState(false)
  const [query, setQuery] = useState('')
  const chosen = new Set(team.map(cardKey))
  const search = query.trim().toLowerCase()
  const matches = choices.filter(card => !search ||
    `${card.name} ${battleType(card.name)} ${kitFor(placedForm({ layout }, card), layout).label}`.toLowerCase().includes(search))
  function toggle(card: TeamCard) {
    if (chosen.has(cardKey(card))) onChange(team.filter(item => cardKey(item) !== cardKey(card)))
    else if (team.length < TEAM_SIZE) onChange([...team, card])
  }
  const suggested = !!suggestion && suggestion.team.length === team.length && suggestion.team.every(card => chosen.has(cardKey(card)))
  return <View style={{ gap: 10 }}>
    <View style={picker.head}>
      <Eyebrow>TEAM · {team.length}/{TEAM_SIZE}</Eyebrow>
      <TextButton label={editing ? 'Done' : 'Edit team'} onPress={() => { setEditing(!editing); setQuery('') }} />
    </View>
    {suggestion && <View style={picker.suggest}>
      <Text style={picker.suggestText}>{suggested ? '✓ Suggested team' : 'Suggested team ready'}</Text>
      {suggestion.notes.length > 0 && <TextButton label={why ? 'Hide' : 'Why?'} onPress={() => setWhy(!why)} />}
      {!suggested && <TextButton label="Use" strong onPress={() => onChange(suggestion.team)} />}
    </View>}
    {suggestion && why && <View style={{ gap: 2 }}>
      {suggestion.notes.map(note => <Copy key={note} small>• {note}</Copy>)}
    </View>}
    {!!suggestion?.missing.length && <Copy small>{`No ${suggestion.missing.map(type => type[0].toUpperCase() + type.slice(1)).join(' or ')} Pokemon yet: those tiles stay empty.`}</Copy>}
    <View style={picker.slots}>{Array.from({ length: TEAM_SIZE }, (_, i) => {
      const card = team[i]
      return card ? <Slot key={cardKey(card)} card={card} layout={layout} weather={weather} editing={editing}
        onPress={() => editing ? toggle(card) : setEditing(true)} />
        : <Pressable key={`empty-${i}`} accessibilityRole="button" accessibilityLabel="Empty slot: add a Pokemon" onPress={() => setEditing(true)}
          style={[picker.slot, picker.empty]}><Text style={picker.plus}>+</Text></Pressable>
    })}</View>
    {editing && <>
      <View style={picker.head}>
        <TextInput accessibilityLabel="Search your Pokemon by name, type or role" placeholder={`Search ${choices.length} Pokemon`}
          placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} autoCorrect={false} style={[styles.input, { flex: 1, minHeight: 44 }]} />
        <TextButton label="Auto-pick" onPress={() => onChange(autoTeam(choices))} />
      </View>
      <View style={picker.grid}>{matches.slice(0, SHOWN).map(card =>
        <TeamChip key={cardKey(card)} card={card} layout={layout} weather={weather} selected={chosen.has(cardKey(card))}
          disabled={!chosen.has(cardKey(card)) && team.length >= TEAM_SIZE} onPress={() => toggle(card)} />)}</View>
      {matches.length > SHOWN && <Copy small>{SHOWN} of {matches.length} shown</Copy>}
      {!matches.length && <Copy small>No match for “{query}”.</Copy>}
    </>}
  </View>
}

function TextButton({ label, onPress, strong = false }: { label: string, onPress: () => void, strong?: boolean }) {
  return <Pressable accessibilityRole="button" hitSlop={10} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
    <Text style={[picker.link, strong && picker.linkStrong]}>{label}</Text>
  </Pressable>
}

// What one card is, in words for a screen reader: its form, type, role and cost, and what the eye reads off its badges.
function cardWords(card: TeamCard, layout: Layout, weather?: Weather) {
  const form = placedForm({ layout }, card)
  const kit = kitFor(form, layout)
  const perk = card.hatched ? eggPerk(form, layout) : null
  const sky = unitWeather(weather, form, layout)
  const evolves = layout === 'trail' && card.family.length > 1 ? card.family[card.family.length - 1] : ''
  return `${card.shiny ? 'Shiny ' : ''}${form}, ${battleType(form)} type, ${kit.label}, costs ${kit.cost} berries` +
    `${sky && weather ? `, ${sky === 'boosted' ? 'powered up' : 'weakened'} by ${WEATHER[weather].name.toLowerCase()}` : ''}` +
    `${perk ? `, egg move ${perk.move}: ${perk.text}` : ''}${evolves ? `, evolves to ${evolves}` : ''}${card.loaner ? ', loaner' : ''}`
}

// The small marks a card carries: EGG for an egg move, ▲ / ▼ for the weather.
function Badges({ card, layout, weather }: { card: TeamCard, layout: Layout, weather?: Weather }) {
  const form = placedForm({ layout }, card)
  const egg = card.hatched && !!eggPerk(form, layout)
  const sky = unitWeather(weather, form, layout)
  if (!egg && !sky) return null
  return <View style={picker.badges}>
    {egg && <Text style={[picker.badge, picker.egg]}>EGG</Text>}
    {sky && <Text style={[picker.badge, sky === 'boosted' ? picker.up : picker.down]}>{sky === 'boosted' ? '▲' : '▼'}</Text>}
  </View>
}

// A chosen Pokemon in the team's slots: tap to edit the team, or while editing, to take it out.
function Slot({ card, layout, weather, editing, onPress }: { card: TeamCard, layout: Layout, weather?: Weather, editing: boolean, onPress: () => void }) {
  const form = placedForm({ layout }, card)
  const kit = kitFor(form, layout)
  return <Pressable accessibilityRole="button" accessibilityLabel={`${cardWords(card, layout, weather)}${editing ? '. Tap to remove' : ''}`}
    onPress={onPress} style={({ pressed }) => [picker.slot, { opacity: pressed ? 0.7 : 1 }]}>
    <PixelSprite name={form} shiny={card.shiny} size={44} />
    <Text numberOfLines={1} style={picker.slotName}>{form}</Text>
    <Text numberOfLines={1} style={picker.detail}>◉ {kit.cost}</Text>
    <Badges card={card} layout={layout} weather={weather} />
    {editing && <Text style={picker.remove}>×</Text>}
  </Pressable>
}

function TeamChip({ card, layout, weather, selected, disabled = false, onPress }: {
  card: TeamCard, layout: Layout, weather?: Weather, selected: boolean, disabled?: boolean, onPress: () => void
}) {
  const form = placedForm({ layout }, card)
  const kit = kitFor(form, layout)
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={cardWords(card, layout, weather)} accessibilityState={{ checked: selected, disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [picker.chip, selected && picker.selected, { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
    <PixelSprite name={form} shiny={card.shiny} size={36} />
    <View style={{ flex: 1 }}>
      <Text numberOfLines={1} style={picker.name}>{form}{card.shiny ? ' ✦' : ''}</Text>
      <Text numberOfLines={1} style={picker.detail}>{kit.label} · ◉ {kit.cost}</Text>
    </View>
    <Badges card={card} layout={layout} weather={weather} />
  </Pressable>
}

const picker = themedStyles(() => ({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  link: { color: colors.edge, fontFamily: fonts.heavy, fontSize: 14, lineHeight: 20 },
  linkStrong: { fontFamily: fonts.black },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: colors.goldTint },
  suggestText: { flex: 1, color: colors.ink, fontFamily: fonts.heavy, fontSize: 13, lineHeight: 18 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: '31.5%', flexGrow: 1, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, borderRadius: 14, borderWidth: 1,
    borderColor: colors.line, backgroundColor: colors.panel },
  empty: { justifyContent: 'center', minHeight: 92, borderStyle: 'dashed' },
  plus: { color: colors.muted, fontSize: 24, fontFamily: fonts.heavy },
  slotName: { color: colors.ink, fontSize: 13, lineHeight: 17, fontFamily: fonts.heavy, marginTop: 2 },
  remove: { position: 'absolute', top: 2, right: 8, color: colors.muted, fontSize: 16, fontFamily: fonts.black },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexBasis: '48%', flexGrow: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 8,
    borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.panel },
  selected: { borderColor: colors.edge, borderWidth: 1.5, backgroundColor: colors.mint },
  name: { color: colors.ink, fontSize: 14, lineHeight: 19, fontFamily: fonts.heavy },
  detail: { color: colors.muted, fontSize: 12, lineHeight: 16, fontFamily: fonts.body },
  badges: { flexDirection: 'row', gap: 3, marginTop: 2 },
  badge: { fontSize: 10, lineHeight: 14, fontFamily: fonts.black, paddingHorizontal: 5, borderRadius: 999, overflow: 'hidden' },
  egg: { color: colors.ink, backgroundColor: colors.goldTint },
  up: { color: colors.gold },
  down: { color: colors.danger }
}))
