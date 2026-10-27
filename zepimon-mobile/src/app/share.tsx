import { useMemo, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import Svg, { Defs, Pattern, Rect } from 'react-native-svg'
import { useJournal } from '../store'
import { averagePace, km, recordForm } from '../journal'
import { decodePath, earnedForms } from '../phone-adventure'
import type { SavedRun } from '../progress'
import { findAdventure } from '../adventures'
import { exportCard } from '../card-image'
import { CARD_PIXELS, ShareCard, cardFileName, cardTitle, cardWidth, spriteStyles, usePixelArt } from '../ShareCard'
import type { CardBackground, SpriteSize, SpriteStyle } from '../ShareCard'
import { FilterSection } from '../PokedexFilters'
import { PixelSprite } from '../games/TeamPicker'
import { Button, Chip, Copy, Panel, Screen, Title, colors, fonts } from '../ui'

// The share image of one saved adventure, opened from its card or details. id is a Journal run's id or a phone
// adventure's own (see src/adventures.ts); only phone adventures have a route to draw.
// Narrow enough that the preview and the first choices fit on a phone screen together.
const PREVIEW_WIDTH = 280
const STYLES: [SpriteStyle, string][] = [['original', 'Original'], ['walking', 'Walking'], ['front', 'Facing front']]
const SIZES: [SpriteSize, string][] = [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['huge', 'Extra large']]
type Look = { style: SpriteStyle, size: SpriteSize, background: CardBackground }
// The look stays as you left it until the app closes, like the egg list's filters. The Pokemon starts as the one
// each adventure reached.
let remembered: Look = { style: 'original', size: 'medium', background: 'dark' }
const remember = (look: Look) => { remembered = look }

export default function ShareScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const { phoneRuns, progress } = useJournal()
  const adventure = findAdventure(id, progress, phoneRuns)
  if (!adventure) return <Screen><Panel>
    <Title>Adventure not found</Title>
    <Copy>This adventure is no longer saved on this phone.</Copy>
    <Button title="Back" secondary onPress={() => router.back()} />
  </Panel></Screen>
  return <ShareRun key={adventure.id} run={adventure} path={adventure.path} />
}

function ShareRun({ run: { family, record }, path }: { run: SavedRun, path?: string }) {
  const points = useMemo(() => path ? decodePath(path) : [], [path])
  const reached = recordForm(family, record)
  // The egg and every form this adventure reached, in order.
  const choices = useMemo(() => [...new Set(['Egg', ...earnedForms(family, record.meters, record.mega ?? null), reached])], [family, record, reached])
  const [pokemon, setPokemon] = useState(reached)
  const [look, setLook] = useState(remembered)
  const [frame, setFrame] = useState(0)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string, error: boolean } | null>(null)
  const card = useRef<View>(null)
  const width = cardWidth()
  function change(next: Partial<Look>) {
    const value = { ...look, ...next }
    setLook(value)
    remember(value)
  }
  // A Pokemon without overworld art (the egg, some forms) shows its original sprite whatever style is chosen.
  const available = spriteStyles(pokemon, record.shiny)
  const style = available.includes(look.style) ? look.style : 'original'
  const art = usePixelArt(pokemon, record.shiny, style)
  async function save() {
    setBusy(true); setNote(null)
    try {
      const text = await exportCard(card, cardFileName(family, record, pokemon))
      setNote(text ? { text, error: false } : null)
    } catch (error) {
      setNote({ text: `Could not make the image${error instanceof Error && error.message ? `: ${error.message}` : '.'}`, error: true })
    } finally { setBusy(false) }
  }
  return <Screen>
    <View onLayout={event => setFrame(Math.min(PREVIEW_WIDTH, event.nativeEvent.layout.width))} style={{ alignItems: 'center' }}>
      {frame > 0 && <View accessible accessibilityRole="image"
        accessibilityLabel={`Share image: ${cardTitle(family, record, pokemon)}, ${km(record.meters)}, pace ${averagePace(record.elapsedSeconds, record.meters)}`}
        style={[share.frame, { width: frame, height: frame * CARD_PIXELS[1] / CARD_PIXELS[0] }]}>
        {look.background === 'clear' && <Checkerboard />}
        {/* The card keeps its full size and is shrunk to fit; captures draw it unscaled (see src/card-image.ts). */}
        <View style={{ position: 'absolute', left: 0, top: 0, transform: [{ scale: frame / width }], transformOrigin: 'top left' }}>
          <ShareCard ref={card} family={family} record={record} pokemon={pokemon} points={points} art={art} size={look.size}
            background={look.background} width={width} />
        </View>
      </View>}
    </View>
    <Panel style={{ gap: 16 }}>
      {choices.length > 1 && <FilterSection label="POKEMON">{choices.map(name => <Pressable key={name} accessibilityRole="radio"
        accessibilityState={{ checked: pokemon === name }} accessibilityLabel={cardTitle(family, record, name)} onPress={() => setPokemon(name)}
        style={({ pressed }) => [share.tile, pokemon === name && share.chosen, { opacity: pressed ? 0.75 : 1 }]}>
        <PixelSprite name={name} shiny={record.shiny} size={48} />
        <Text numberOfLines={1} style={[share.tileText, pokemon === name && { color: colors.edge }]}>{name}</Text>
      </Pressable>)}</FilterSection>}
      <FilterSection label="STYLE">{STYLES.filter(([value]) => available.includes(value)).map(([value, label]) =>
        <Chip key={value} label={label} selected={style === value} onPress={() => change({ style: value })} />)}</FilterSection>
      {available.length === 1 && <Copy small>{pokemon === 'Egg' ? 'The egg' : pokemon} has no walking or front-facing art yet, so it shows its original sprite.</Copy>}
      <FilterSection label="SIZE">{SIZES.map(([value, label]) =>
        <Chip key={value} label={label} selected={look.size === value} onPress={() => change({ size: value })} />)}</FilterSection>
      <FilterSection label="BACKGROUND">
        <Chip label="Dark" selected={look.background === 'dark'} onPress={() => change({ background: 'dark' })} />
        <Chip label="Clear" selected={look.background === 'clear'} onPress={() => change({ background: 'clear' })} />
      </FilterSection>
      <Copy small>{look.background === 'clear' ? 'See-through, to lay over your own photo in a story.' : 'A dark card, ready to post as it is.'}</Copy>
    </Panel>
    <Button title={Platform.OS === 'web' ? 'Download PNG' : 'Share or save image'} loading={busy} disabled={art === undefined}
      onPress={() => { void save() }} />
    {note && <Copy color={note.error ? colors.danger : colors.edge}>{note.text}</Copy>}
    <Copy small>{Platform.OS === 'web' ? 'A 1080 × 1920 PNG, the size of a story.'
      : 'A 1080 × 1920 PNG, the size of a story. In the share sheet, save it to Photos or Files, print it, or post it.'}
      {path ? '' : ' Watch adventures have no route, so the card shows your Pokemon and stats.'}</Copy>
  </Screen>
}

// Shows where a clear card is see-through.
function Checkerboard() {
  return <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
    <Defs>
      <Pattern id="share-checker" width={16} height={16} patternUnits="userSpaceOnUse">
        <Rect width={16} height={16} fill="#3B4652" />
        <Rect width={8} height={8} fill="#4C5866" />
        <Rect x={8} y={8} width={8} height={8} fill="#4C5866" />
      </Pattern>
    </Defs>
    <Rect width="100%" height="100%" fill="url(#share-checker)" />
  </Svg>
}

const share = StyleSheet.create({
  frame: { borderRadius: 20, overflow: 'hidden', backgroundColor: '#0D1218' },
  tile: { alignItems: 'center', minWidth: 76, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 16, borderWidth: 1.5,
    borderColor: colors.line, backgroundColor: colors.panel },
  chosen: { borderColor: colors.edge, borderWidth: 2.5, backgroundColor: colors.mint },
  tileText: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, color: colors.ink }
})
