import { useMemo, useRef, useState } from 'react'
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import Svg, { Defs, Pattern, Rect } from 'react-native-svg'
import { useJournal } from '../store'
import { averagePace, km, recordForm } from '../journal'
import { decodePath } from '../phone-adventure'
import type { SavedRun } from '../progress'
import { adventureFacts, findAdventure } from '../adventures'
import { GalleryDenied, exportCard, saveCardToGallery } from '../card-image'
import { CARD_PIXELS, ShareCard, cardDetails, cardFileName, cardTitle, cardWidth, spriteStyles, usePixelArt } from '../ShareCard'
import type { CardBackground, CardDesign, CardDetail, CardOptions, SpriteSize, SpriteStyle } from '../ShareCard'
import { habitatTheme } from '../HabitatScene'
import { FilterSection } from '../PokedexFilters'
import { PixelSprite } from '../games/TeamPicker'
import { Button, Chip, Copy, Panel, Screen, Title, colors, fonts } from '../ui'

// The share image of one saved adventure, opened from its card or details. id is a Journal run's id or a phone
// adventure's own (see src/adventures.ts); only phone adventures have a route to draw.
// Narrow enough that the preview and the first choices fit on a phone screen together.
const PREVIEW_WIDTH = 280
const DESIGNS: [CardDesign, string, string][] = [['classic', 'Classic', 'Your stats over the route, like Strava.'],
  ['split', 'Split', 'The route on top, your Pokemon and stats below.']]
const STYLES: [SpriteStyle, string][] = [['default', 'Default'], ['front', 'Facing front'], ['running', 'Running']]
const SIZES: [SpriteSize, string][] = [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['huge', 'Extra large']]
const BACKGROUNDS: [CardBackground, string][] = [['dark', 'Dark'], ['clear', 'Clear'], ['habitat', 'Habitat']]
const DETAILS: [CardDetail, string][] = [['type', 'Type'], ['best', 'Personal best'], ['evolution', 'Evolutions'], ['hatch', 'Hatch time'],
  ['steps', 'Steps'], ['clock', 'Start and finish time']]
// The choices stay as you left them until the app closes, like the egg list's filters. The Pokemon starts as the one
// each adventure reached, and a detail an adventure lacks is simply left off its card.
let remembered: CardOptions = { design: 'classic', style: 'default', size: 'medium', background: 'dark', details: [] }
const remember = (options: CardOptions) => { remembered = options }

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

function ShareRun({ run, path }: { run: SavedRun, path?: string }) {
  const { family, record } = run
  const { journal } = useJournal()
  const points = useMemo(() => path ? decodePath(path) : [], [path])
  const facts = useMemo(() => adventureFacts(run, journal), [run, journal])
  const reached = recordForm(family, record)
  // The egg and every form this adventure reached, in order.
  const choices = useMemo(() => [...new Set(['Egg', ...facts.evolution, reached])], [facts, reached])
  const [pokemon, setPokemon] = useState(reached)
  const [chosen, setChosen] = useState(remembered)
  const [frame, setFrame] = useState(0)
  // Which button is working, so only it shows the loader.
  const [busy, setBusy] = useState<'' | 'gallery' | 'share'>('')
  // settings: photo access is blocked, so offer the phone's settings.
  const [note, setNote] = useState<{ text: string, error: boolean, settings?: boolean } | null>(null)
  const card = useRef<View>(null)
  const width = cardWidth()
  function change(next: Partial<CardOptions>) {
    const value = { ...chosen, ...next }
    setChosen(value)
    remember(value)
  }
  function toggle(detail: CardDetail) {
    change({ details: chosen.details.includes(detail) ? chosen.details.filter(item => item !== detail) : [...chosen.details, detail] })
  }
  // A Pokemon without overworld art (the egg, some forms) shows its default sprite whatever style is chosen.
  const available = spriteStyles(pokemon, record.shiny)
  const options = { ...chosen, style: available.includes(chosen.style) ? chosen.style : 'default' }
  const art = usePixelArt(pokemon, record.shiny, options.style)
  const details = cardDetails(facts, record, pokemon)
  // Saves the PNG to the gallery (asking for photo access once) or opens the share sheet.
  async function save(to: 'gallery' | 'share') {
    setBusy(to); setNote(null)
    try {
      const name = cardFileName(family, record, pokemon)
      const text = to === 'gallery' ? await saveCardToGallery(card, name) : await exportCard(card, name)
      setNote(text ? { text, error: false } : null)
    } catch (error) {
      if (error instanceof GalleryDenied) setNote({ text: error.message, error: true, settings: error.blocked })
      else setNote({ text: `Could not make the image${error instanceof Error && error.message ? `: ${error.message}` : '.'}`, error: true })
    } finally { setBusy('') }
  }
  return <Screen>
    <View onLayout={event => setFrame(Math.min(PREVIEW_WIDTH, event.nativeEvent.layout.width))} style={{ alignItems: 'center' }}>
      {frame > 0 && <View accessible accessibilityRole="image"
        accessibilityLabel={`Share image: ${cardTitle(family, record, pokemon)}, ${km(record.meters)}, pace ${averagePace(record.elapsedSeconds, record.meters)}`}
        style={[share.frame, { width: frame, height: frame * CARD_PIXELS[1] / CARD_PIXELS[0] }]}>
        {options.background === 'clear' && <Checkerboard />}
        {/* The card keeps its full size and is shrunk to fit; captures draw it unscaled (see src/card-image.ts). */}
        <View style={{ position: 'absolute', left: 0, top: 0, transform: [{ scale: frame / width }], transformOrigin: 'top left' }}>
          <ShareCard ref={card} family={family} record={record} pokemon={pokemon} points={points} art={art} facts={facts}
            options={options} width={width} />
        </View>
      </View>}
    </View>
    <Panel style={{ gap: 16 }}>
      <FilterSection label="DESIGN">{DESIGNS.map(([value, label]) =>
        <Chip key={value} label={label} selected={options.design === value} onPress={() => change({ design: value })} />)}</FilterSection>
      <Copy small>{DESIGNS.find(([value]) => value === options.design)![2]}</Copy>
      {choices.length > 1 && <FilterSection label="POKEMON">{choices.map(name => <Pressable key={name} accessibilityRole="radio"
        accessibilityState={{ checked: pokemon === name }} accessibilityLabel={cardTitle(family, record, name)} onPress={() => setPokemon(name)}
        style={({ pressed }) => [share.tile, pokemon === name && share.chosen, { opacity: pressed ? 0.75 : 1 }]}>
        <PixelSprite name={name} shiny={record.shiny} size={48} />
        <Text numberOfLines={1} style={[share.tileText, pokemon === name && { color: colors.edge }]}>{name}</Text>
      </Pressable>)}</FilterSection>}
      <FilterSection label="STYLE">{STYLES.filter(([value]) => available.includes(value)).map(([value, label]) =>
        <Chip key={value} label={label} selected={options.style === value} onPress={() => change({ style: value })} />)}</FilterSection>
      {available.length === 1 && <Copy small>{pokemon === 'Egg' ? 'The egg' : pokemon} has no overworld art yet, so it shows its default sprite.</Copy>}
      <FilterSection label="SIZE">{SIZES.map(([value, label]) =>
        <Chip key={value} label={label} selected={options.size === value} onPress={() => change({ size: value })} />)}</FilterSection>
      <FilterSection label="BACKGROUND">{BACKGROUNDS.map(([value, label]) =>
        <Chip key={value} label={label} selected={options.background === value} onPress={() => change({ background: value })} />)}</FilterSection>
      <Copy small>{options.background === 'clear' ? 'See-through, to lay over your own photo in a story.'
        : options.background === 'habitat' ? `${habitatTheme(pokemon).label}, where ${pokemon === 'Egg' ? 'eggs hatch' : `${pokemon} lives`}.`
        : 'A dark card, ready to post as it is.'}</Copy>
      <View style={{ gap: 4 }}>
        <Text style={share.label}>SHOW ON THE CARD</Text>
        {DETAILS.filter(([detail]) => details[detail]).map(([detail, label]) => <Check key={detail} label={label} hint={details[detail]!}
          checked={options.details.includes(detail)} onPress={() => toggle(detail)} />)}
      </View>
    </Panel>
    {Platform.OS === 'web' ? <Button title="Download PNG" loading={busy === 'share'} disabled={art === undefined || !!busy}
      onPress={() => { void save('share') }} /> : <>
      <Button title="Save to gallery" loading={busy === 'gallery'} disabled={art === undefined || !!busy} onPress={() => { void save('gallery') }} />
      <Button title="Share" secondary loading={busy === 'share'} disabled={art === undefined || !!busy} onPress={() => { void save('share') }} />
    </>}
    {note && <Copy color={note.error ? colors.danger : colors.edge}>{note.text}</Copy>}
    {note?.settings && <Button title="Open settings" secondary onPress={() => { void Linking.openSettings() }} />}
    <Copy small>{Platform.OS === 'web' ? 'A 1080 × 1920 PNG, the size of a story.'
      : 'A 1080 × 1920 PNG, the size of a story. Save to gallery puts it in your photos, in a Zepimon album; Share opens the share sheet to post it, print it or save it to Files.'}
      {path ? '' : ' Watch adventures have no route, so the card shows your Pokemon and stats.'}</Copy>
  </Screen>
}

// A detail to add to the card, with how it will read.
function Check({ label, hint, checked, onPress }: { label: string, hint: string, checked: boolean, onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={`${label}: ${hint}`} onPress={onPress}
    style={({ pressed }) => [share.check, { opacity: pressed ? 0.75 : 1 }]}>
    <View style={[share.box, checked && share.boxOn]}>{checked && <Text style={share.tick}>✓</Text>}</View>
    <View style={{ flex: 1 }}>
      <Text style={share.checkLabel}>{label}</Text>
      <Text numberOfLines={1} style={share.checkHint}>{hint}</Text>
    </View>
  </Pressable>
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
  tileText: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, color: colors.ink },
  // Matches FilterSection's label.
  label: { fontFamily: fonts.heavy, fontSize: 12, lineHeight: 16, letterSpacing: 1.1, color: colors.muted, marginBottom: 4 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.panel,
    alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.edge, borderColor: colors.edge },
  tick: { fontFamily: fonts.black, fontSize: 15, lineHeight: 18, color: colors.onBrand },
  checkLabel: { fontFamily: fonts.heavy, fontSize: 15, lineHeight: 20, color: colors.ink },
  checkHint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted }
})
