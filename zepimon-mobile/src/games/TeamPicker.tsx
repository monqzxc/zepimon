import { useState } from 'react'
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { spriteSource } from '../catalog'
import { Button, Copy, Eyebrow, colors, styles } from '../ui'
import { eggPerk, kitFor, placedForm } from './battle'
import type { Layout } from './battle'
import { TEAM_SIZE, autoTeam, battleType, cardKey } from './roster'
import type { TeamCard } from './roster'

const SHOWN = 24

// A still sprite for busy game boards; the Dex keeps the interactive Sprite.
export function PixelSprite({ name, shiny = false, size }: { name: string, shiny?: boolean, size: number }) {
  return <Image source={spriteSource(name, shiny)} resizeMode="contain" fadeDuration={0} accessible={false}
    style={{ width: size, height: size, ...(Platform.OS === 'web' ? { imageRendering: 'pixelated' } : {}) }} />
}

export function TeamPicker({ layout, choices, team, onChange }: { layout: Layout, choices: TeamCard[], team: TeamCard[], onChange: (team: TeamCard[]) => void }) {
  const [query, setQuery] = useState('')
  const chosen = new Set(team.map(cardKey))
  const search = query.trim().toLowerCase()
  const matches = choices.filter(card => !search ||
    `${card.name} ${battleType(card.name)} ${kitFor(placedForm({ layout }, card), layout).label}`.toLowerCase().includes(search))
  function toggle(card: TeamCard) {
    if (chosen.has(cardKey(card))) onChange(team.filter(item => cardKey(item) !== cardKey(card)))
    else if (team.length < TEAM_SIZE) onChange([...team, card])
  }
  return <View style={{ gap: 12 }}>
    <Eyebrow>YOUR TEAM · {team.length} / {TEAM_SIZE}</Eyebrow>
    {team.length ? <View style={picker.grid}>{team.map(card =>
      <TeamChip key={cardKey(card)} card={card} layout={layout} selected onPress={() => toggle(card)} />)}</View> :
      <Copy>Choose up to six Pokemon below, or let the auto-pick build a balanced team.</Copy>}
    <Button title="Auto-pick a balanced team" secondary onPress={() => onChange(autoTeam(choices))} />
    <Eyebrow>AVAILABLE · {choices.length}</Eyebrow>
    {team.length >= TEAM_SIZE && <Copy small>Your team is full. Tap a chosen Pokemon to make room for another.</Copy>}
    <TextInput accessibilityLabel="Search team choices by name, type or role" placeholder="Search name, type or role…" placeholderTextColor={colors.muted}
      value={query} onChangeText={setQuery} style={styles.input} autoCorrect={false} />
    <View style={picker.grid}>{matches.slice(0, SHOWN).map(card =>
      <TeamChip key={cardKey(card)} card={card} layout={layout} selected={chosen.has(cardKey(card))}
        disabled={!chosen.has(cardKey(card)) && team.length >= TEAM_SIZE} onPress={() => toggle(card)} />)}</View>
    {matches.length > SHOWN && <Copy small>Showing {SHOWN} of {matches.length}. Search to find the rest.</Copy>}
    {!matches.length && <Copy small>No Pokemon match “{query}”.</Copy>}
  </View>
}

function TeamChip({ card, layout, selected, disabled = false, onPress }: { card: TeamCard, layout: Layout, selected: boolean, disabled?: boolean, onPress: () => void }) {
  const form = placedForm({ layout }, card)
  const kit = kitFor(form, layout)
  const evolves = layout === 'trail' && card.family.length > 1 ? card.family[card.family.length - 1] : ''
  const perk = card.hatched ? eggPerk(form, layout) : null
  const label = `${card.shiny ? 'Shiny ' : ''}${form}, ${battleType(form)} type, ${kit.label}, costs ${kit.cost} berries` +
    `${perk ? `, hatched, egg move ${perk.move}: ${perk.text}` : card.hatched ? ', hatched, no egg moves' : ''}${evolves ? `, can evolve to ${evolves}` : ''}${card.loaner ? ', loaner' : card.hatched ? '' : ', Safari catch'}`
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: selected, disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [picker.chip, selected && picker.selected, { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}>
    <PixelSprite name={form} shiny={card.shiny} size={40} />
    <View style={{ flex: 1, gap: 1 }}>
      <Text numberOfLines={1} style={picker.name}>{form}{card.shiny ? ' ✦' : ''}</Text>
      <Text numberOfLines={2} style={picker.detail}>{kit.label} · ◉ {kit.cost}</Text>
      {perk && <Text numberOfLines={2} style={[picker.detail, { color: colors.gold }]}>Egg move: {perk.move}</Text>}
      {!!evolves && <Text numberOfLines={1} style={[picker.detail, { color: colors.gold }]}>Evolves to {evolves}</Text>}
      {(card.loaner || !card.hatched) && <Text style={picker.detail}>{card.loaner ? 'Loaner' : '◎ Safari · no egg move'}</Text>}
    </View>
    {selected && <Text accessible={false} style={picker.check}>✓</Text>}
  </Pressable>
}

const picker = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexBasis: '48%', flexGrow: 1, minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, paddingRight: 14,
    borderWidth: 2, borderColor: '#2d5a70', borderRadius: 5, backgroundColor: colors.panel },
  selected: { borderColor: colors.gold, backgroundColor: '#1a3d52' },
  name: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  detail: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  check: { position: 'absolute', top: 2, right: 5, color: colors.gold, fontSize: 14, fontWeight: '800' }
})
