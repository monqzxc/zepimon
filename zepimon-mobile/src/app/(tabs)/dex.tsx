import { useEffect, useState } from 'react'
import { router } from 'expo-router'
import { Animated, Platform, Pressable, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useJournal } from '../../store'
import { entriesFromDex } from '../../journal'
import type { DexEntry } from '../../journal'
import { defaultDexFilter, filterDex, fromSafari, generationsOf, isFiltered, regionName, sortOrders, typesOf } from '../../pokedex'
import type { DexFilter, DexVariant } from '../../pokedex'
import { FilterPill, PickerSheet, ResultLine, SearchBox } from '../../PokedexFilters'
import type { PickerOption } from '../../PokedexFilters'
import { dexNumber, pokemonType, typeColors } from '../../catalog'
import { Squish } from '../../JournalDashboard'
import { useReducedMotion } from '../../games/hooks'
import { Button, Copy, Icon, PokeballIcon, Sprite, Title, TypeBadge, colors, displayFont, fonts, gradient, retro, shadows, styles, themedStyles,
  typeLabel, typeTints, useTheme } from '../../ui'

// Your collection as a Pokedex: a slanted banner in the theme's colours with the count and the sort button, a search,
// and three dropdown pills (variant, generation, type) over a grid of cards. A variant caught in the Safari Zone keeps
// its Safari mark until the watch hatches the same variant.
const GAP = 5
const native = Platform.OS !== 'web'
// The first screenful of cards pops in one after another; cards scrolled to later just appear.
const STAGGERED = 12
type Sheet = 'variant' | 'generation' | 'type' | 'sort' | null

const variantLabels: Record<DexVariant, string> = { all: 'All', normal: 'Normal', shiny: 'Shiny', safari: 'Safari' }
function VariantMark({ variant, color }: { variant: DexVariant, color: string }) {
  if (variant === 'shiny') return <Icon name="sparkle" size={18} color={color} />
  if (variant === 'safari') return <Icon name="explore" size={18} color={color} />
  return <PokeballIcon size={18} color={color} />
}

export default function DexScreen() {
  useTheme()
  const reduced = useReducedMotion()
  const { journal, dex } = useJournal()
  const [filter, setFilter] = useState<DexFilter>(defaultDexFilter)
  const [sheet, setSheet] = useState<Sheet>(null)
  const insets = useSafeAreaInsets()
  const [scroll] = useState(() => new Animated.Value(0))
  const change = (next: Partial<DexFilter>) => setFilter(value => ({ ...value, ...next }))
  const entries = entriesFromDex(dex)
  const names = entries.map(entry => entry.name)
  const safariCount = entries.filter(fromSafari).length
  const filtered = filterDex(entries, filter)
  const filtering = isFiltered(filter)
  // How many the list would show with one choice changed, for the counts in each sheet.
  const countWith = (next: Partial<DexFilter>) => filterDex(entries, { ...filter, ...next }).length
  const clear = () => change({ ...defaultDexFilter, sort: filter.sort })

  const variants: PickerOption<DexVariant>[] = (['all', 'normal', 'shiny', 'safari'] as DexVariant[])
    .filter(variant => variant !== 'safari' || safariCount > 0 || filter.variant === 'safari')
    .map(variant => ({ value: variant, label: variantLabels[variant], count: countWith({ variant }),
      detail: { all: 'Normal and Shiny records, kept separately', normal: undefined, shiny: undefined, safari: 'Caught in the Safari Zone · no walking record' }[variant],
      mark: <VariantMark variant={variant} color={variant === 'shiny' || variant === 'safari' ? colors.gold : colors.edge} /> }))
  const generations: PickerOption<number>[] = [{ value: 0, label: 'All generations', count: countWith({ generation: 0 }) },
    ...generationsOf(names).map(({ generation }) => ({ value: generation, label: `Gen ${generation}`, detail: regionName(generation),
      count: countWith({ generation }) }))]
  const types: PickerOption<string | null>[] = [{ value: null, label: 'All types', count: countWith({ type: null }), wide: true },
    ...typesOf(names).map(type => ({ value: type, label: typeLabel(type), count: countWith({ type }), color: typeColors[type], tint: typeTints[type] }))]
  const sorts: PickerOption<string>[] = sortOrders.map(([sort, label]) => ({ value: sort, label }))

  // The header card runs up under the status bar, so the safe area is its top padding rather than the screen's.
  return <SafeAreaView edges={['left', 'right']} style={styles.screen}>
    <View style={look.top}>
      <View pointerEvents="none" accessible={false} style={look.watermark}><PokeballIcon size={150} color={colors.ink} stroke={12} /></View>
      <View style={[look.banner, { paddingTop: insets.top }]}>
        <View pointerEvents="none" accessible={false} style={look.stripe} />
        <View pointerEvents="none" accessible={false} style={[look.fill, gradient()]} />
        <View style={look.bannerRow}>
          <View style={look.ball}><PokeballIcon size={22} color={colors.brandFrom} stroke={3} /></View>
          <Text accessibilityRole="header" numberOfLines={1} style={look.title}>Pokédex</Text>
        </View>
      </View>
      <View style={[look.actions, { paddingTop: insets.top }]}>
        <View accessible accessibilityLabel={`${entries.length} Pokemon in your Dex`} style={look.tally}>
          <Text style={look.tallyText}>{entries.length}</Text>
          <PokeballIcon size={16} color={colors.muted} />
        </View>
        <View style={look.divider} />
        <Squish reduced={reduced} onPress={() => setSheet('sort')} accessibilityLabel={`Sort: ${sortOrders.find(([sort]) => sort === filter.sort)?.[1]}`}
          style={look.sort}>
          <Icon name="sort" size={24} color={colors.ink} />
        </Squish>
      </View>
    </View>
    {/* The search and pills stay put while the grid scrolls under them; a soft shadow appears once it has. */}
    {entries.length > 0 && <View style={look.controls}>
      <Animated.View pointerEvents="none" style={[look.shade, { opacity: scroll.interpolate({ inputRange: [0, 24], outputRange: [0, 1], extrapolate: 'clamp' }) }]} />
      <SearchBox label="Search Pokemon by name, type or number" placeholder="Search Pokémon…"
        value={filter.query} onChange={query => change({ query })} />
      <View style={look.pills}>
        <FilterPill name="Show" label={variantLabels[filter.variant]} on={filter.variant !== 'all'} onPress={() => setSheet('variant')}
          mark={<VariantMark variant={filter.variant} color={filter.variant !== 'all' ? colors.onEdge : colors.edge} />} />
        <FilterPill name="Generation" label={filter.generation ? `Gen ${filter.generation}` : 'Gen'} on={!!filter.generation}
          onPress={() => setSheet('generation')} mark={<Icon name="star" size={18} color={filter.generation ? colors.onEdge : colors.edge} />} />
        <FilterPill name="Type" label={filter.type ? typeLabel(filter.type) : 'Type'} on={!!filter.type} onPress={() => setSheet('type')}
          mark={<View style={[look.typeDot, filter.type ? { backgroundColor: typeColors[filter.type], borderColor: colors.onEdge }
            : { borderColor: colors.edge }]} />} />
      </View>
    </View>}
    <Animated.FlatList<DexEntry> data={filtered} keyExtractor={item => item.name} numColumns={3}
      windowSize={5} initialNumToRender={12} maxToRenderPerBatch={12}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" scrollEventThrottle={16}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scroll } } }], { useNativeDriver: native })}
      contentContainerStyle={[styles.content, { gap: 0, paddingTop: 4, paddingHorizontal: 16 - GAP }]}
      ListHeaderComponent={entries.length > 0 ? <View style={look.note}>
        {filtering ? <ResultLine text={`${filtered.length} of ${entries.length} Pokemon`} onClear={clear} />
          : <Copy small>Tap a Pokemon to say hello. Tap its card to view its record.</Copy>}
      </View> : null}
      ListEmptyComponent={entries.length ? <View style={look.empty}>
        <Copy>No Pokemon match these filters. Try another name, number, generation or type.</Copy>
        <Button secondary title="Clear filters" onPress={clear} />
      </View> : <View style={look.empty}>
        <View style={look.emptyBall}><PokeballIcon size={56} color={colors.edge} /></View>
        <Title>Your Dex is empty</Title>
        <Copy>{journal ? 'No Pokemon yet. Hatch an egg on an adventure to meet your first.' : 'Import your Zepp journal, or catch Pokemon in the Safari Zone, to meet your team.'}</Copy>
      </View>}
      renderItem={({ item, index }) => <DexCard entry={item} index={index} shinyView={filter.variant === 'shiny'} reduced={reduced} />} />
    <PickerSheet visible={sheet === 'variant'} title="Show" options={variants} value={filter.variant}
      onPick={variant => change({ variant })} onClose={() => setSheet(null)} />
    <PickerSheet visible={sheet === 'generation'} title="Generation" options={generations} value={filter.generation}
      onPick={generation => change({ generation })} onClose={() => setSheet(null)} />
    <PickerSheet visible={sheet === 'type'} title="Type" grid options={types} value={filter.type}
      onPick={type => change({ type })} onClose={() => setSheet(null)} />
    <PickerSheet visible={sheet === 'sort'} title="Sort by" options={sorts} value={filter.sort}
      onPick={sort => change({ sort: sort as DexFilter['sort'] })} onClose={() => setSheet(null)} />
  </SafeAreaView>
}

// A Pokemon's card: its number, Shiny and Safari marks, the sprite standing on a cushion in its type's tint, its name
// and type. The sprite says hello when tapped; the rest of the card opens its record, and so does holding the sprite.
// The card's button is a layer behind the content rather than around it, so the sprite stays its own button: a button
// inside a button is invalid on the web and hides the inner one from screen readers.
function DexCard({ entry, index, shinyView, reduced }: { entry: DexEntry, index: number, shinyView: boolean, reduced: boolean }) {
  const [rise] = useState(() => new Animated.Value(reduced || index >= STAGGERED ? 1 : 0))
  const [press] = useState(() => new Animated.Value(1))
  const squeeze = (toValue: number, bounciness: number) => reduced ? press.setValue(toValue)
    : Animated.spring(press, { toValue, speed: 40, bounciness, useNativeDriver: native }).start()
  useEffect(() => {
    if (reduced) { rise.setValue(1); return }
    const run = Animated.spring(rise, { toValue: 1, delay: Math.min(index, STAGGERED) * 35, speed: 12, bounciness: 7, useNativeDriver: native })
    run.start()
    return () => run.stop()
  }, [rise, index, reduced])
  const type = pokemonType(entry.name)
  const open = () => router.push({ pathname: '/pokemon', params: { name: entry.name } })
  const marks = [entry.shiny && 'Shiny caught', fromSafari(entry) && 'from the Safari Zone'].filter(Boolean).join(', ')
  return <Animated.View style={{ width: '33.333%', padding: GAP, opacity: rise,
    transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
      { scale: rise.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }}>
    <Animated.View style={[look.card, { transform: [{ scale: press }] }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${entry.name}, ${dexNumber(entry.name)}, ${typeLabel(type)} type${marks ? `, ${marks}` : ''}`}
        accessibilityHint="Opens its record" onPress={open} onPressIn={() => squeeze(0.95, 0)} onPressOut={() => squeeze(1, 9)} style={look.hit} />
      <View pointerEvents="none" style={look.cardTop}>
        <Text style={look.number}>{dexNumber(entry.name)}</Text>
        <View style={look.marks}>
          {entry.shiny && <Icon name="sparkle" size={14} color={colors.gold} />}
          {fromSafari(entry) && <Icon name="explore" size={14} color={colors.gold} />}
        </View>
      </View>
      <View pointerEvents="box-none" style={look.stage}>
        <View pointerEvents="none" style={[look.cushion, { backgroundColor: typeTints[type] || colors.sunken }]} />
        <Sprite name={entry.name} shiny={shinyView || !entry.normal} size={72} onLongPress={open} />
      </View>
      <View pointerEvents="none" style={look.label}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={look.name}>{entry.name}</Text>
        <View style={{ alignSelf: 'center' }}><TypeBadge type={type} /></View>
      </View>
    </Animated.View>
  </Animated.View>
}

const look = themedStyles(() => ({
  // A Pokedex lid: a card across the top with rounded lower corners. The banner takes 70% of it and ends in a slant,
  // with a thin second slant beside it; a faint Poke Ball sits behind the count and sort button.
  top: { flexDirection: 'row', alignItems: 'stretch', zIndex: 3, overflow: 'hidden', backgroundColor: colors.panel,
    borderBottomLeftRadius: retro() ? 12 : 26, borderBottomRightRadius: retro() ? 12 : 26,
    ...(retro() ? { borderBottomWidth: 2, borderColor: colors.frameOuter, boxShadow: `0px 3px 0px ${colors.frameOuter}` }
      : { boxShadow: `0px 6px 18px ${colors.shadow}` }) },
  watermark: { position: 'absolute', right: -34, bottom: -58, opacity: 0.05 },
  banner: { width: '70%', flexShrink: 1, paddingLeft: 16, paddingRight: 52 },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64 },
  fill: { position: 'absolute', top: 0, bottom: 0, left: -40, right: 20, transform: [{ skewX: '-20deg' }],
    borderBottomRightRadius: retro() ? 4 : 12 },
  stripe: { position: 'absolute', top: 0, bottom: 0, right: 2, width: 10, transform: [{ skewX: '-20deg' }], backgroundColor: colors.line },
  ball: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.onBrand },
  title: { flexShrink: 1, fontFamily: displayFont(fonts.black), color: colors.onBrand, fontSize: retro() ? 22 : 24, lineHeight: 30 },
  actions: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingRight: 8 },
  tally: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tallyText: { fontFamily: fonts.black, color: colors.ink, fontSize: 18, lineHeight: 24, fontVariant: ['tabular-nums'] },
  divider: { width: 1.5, height: 24, borderRadius: 1, backgroundColor: colors.line },
  sort: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  controls: { zIndex: 2, gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  shade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.bg, boxShadow: `0px 8px 12px -8px ${colors.shadow}` },
  note: { marginBottom: 10, paddingHorizontal: GAP },
  pills: { flexDirection: 'row', gap: 8 },
  typeDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2.5 },
  card: { alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingTop: 9, paddingBottom: 11, borderRadius: retro() ? 10 : 18,
    backgroundColor: colors.panel,
    ...(retro() ? { borderWidth: 2, borderColor: colors.frameOuter, boxShadow: `0px 3px 0px ${colors.frameOuter}` } : shadows.card) },
  hit: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: retro() ? 8 : 18 },
  label: { alignSelf: 'stretch', alignItems: 'center', gap: 5 },
  cardTop: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 16 },
  number: { fontFamily: fonts.bold, color: colors.muted, fontSize: 11, lineHeight: 14, fontVariant: ['tabular-nums'] },
  marks: { flexDirection: 'row', gap: 2 },
  // The sprite stands on a soft oval, its feet on the cushion and its head above it.
  stage: { alignSelf: 'stretch', height: 80, alignItems: 'center', justifyContent: 'flex-end' },
  cushion: { position: 'absolute', left: 2, right: 2, bottom: 2, height: 58, borderRadius: 999 },
  name: { alignSelf: 'stretch', fontFamily: displayFont(fonts.heavy), color: colors.ink, fontSize: retro() ? 13 : 14, lineHeight: 18, textAlign: 'center', marginTop: 2 },
  empty: { alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 32 },
  emptyBall: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mint }
}))
