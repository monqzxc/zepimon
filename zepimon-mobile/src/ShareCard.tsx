import { useEffect, useState } from 'react'
import type { Ref } from 'react'
import { Image, PixelRatio, Platform, Pressable, Text, View } from 'react-native'
import type { ImageSourcePropType, TextStyle } from 'react-native'
import { router } from 'expo-router'
import { Asset } from 'expo-asset'
import { File } from 'expo-file-system'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { pokemonType, spriteSource, typeColors } from './catalog'
import { trailWalkers } from './generated/trail-walkers.js'
import { walkingFrames } from './generated/walking.js'
import { averagePace, km, recordForm } from './journal'
import type { DexRecord } from './journal'
import { bestLabels } from './adventures'
import type { AdventureFacts } from './adventures'
import { dayKey } from './progress'
import { crop, decodePng, pixelArt } from './pixel-art'
import type { PixelArt } from './pixel-art'
import { routeShape } from './RouteView'
import { Backdrop, habitatTheme } from './HabitatScene'
import { Icon, PokeballIcon, colors, fonts, typeLabel, themedStyles } from './ui'

// A saved adventure as a story-sized image, like a Strava share card: the route and a Pokemon from the adventure,
// drawn as enlarged pixel art, with its distance, pace and time. The share screen (src/app/share.tsx) picks the
// design, sprite style and size, background and extra details. Sizes below are in pixels of the 1080 × 1920 image.
export const CARD_PIXELS = [1080, 1920] as const
// The card is laid out at its pixel size, so a capture is 1080 × 1920 without resampling. Previews shrink it.
export const cardWidth = () => CARD_PIXELS[0] / PixelRatio.get()

// classic puts the stats over the route, like Strava; split puts the route on top and the Pokemon and stats below.
export type CardDesign = 'classic' | 'split'
// default is the battle sprite; front is the overworld sprite as the Dex shows it, and running the same sprite seen
// from the side, mid-stride to the right.
export type SpriteStyle = 'default' | 'front' | 'running'
export type SpriteSize = 'small' | 'medium' | 'large' | 'huge'
export type CardBackground = 'dark' | 'clear' | 'habitat'
export type CardDetail = 'type' | 'best' | 'evolution' | 'hatch' | 'steps' | 'clock'
export type CardOptions = { design: CardDesign, style: SpriteStyle, size: SpriteSize, background: CardBackground, details: CardDetail[] }

// The sprite's longest side, before rounding down to a whole-number enlargement. Split shows it smaller below the
// route, or at the full size in the route's place when there is none.
const SPRITE_SIZES: Record<SpriteSize, number> = { small: 260, medium: 440, large: 620, huge: 800 }
const SPLIT_SIZES: Record<SpriteSize, number> = { small: 260, medium: 360, large: 460, huge: 560 }
// Habitat scenery fills the bottom of the card; the sky color fills the rest.
const LANDSCAPE_HEIGHT = 1100
// The app's teal-to-blue brand gradient, brightened to stand out on a dark card or a photo.
const ROUTE_COLORS = ['#3BE8C4', '#4AA8FF']
const DARK = '#0D1218'
const WHITE = '#FFFFFF'
const STAR = '#C27C00'

type AssetSource = Parameters<typeof Asset.fromModule>[0]
// Overworld art covers about 600 forms; eggs and some forms have only the battle sprite. The front pose is the Dex's
// (src/generated/walking.js). The side one comes from the Trail Defense sheets (scripts/build-trail-walkers.py),
// eight 44 × 44 frames facing south, north, west and east, two steps each: the first step east has the longer stride.
const poses = walkingFrames as Record<string, AssetSource[]>
const walkers = trailWalkers as Record<string, AssetSource>
const FRAME = 44
const STRIDE_FRAME = 6
const variant = (name: string, shiny: boolean) => `${shiny ? 'Shiny ' : ''}${name}`
export function spriteStyles(name: string, shiny: boolean): SpriteStyle[] {
  const key = variant(name, shiny)
  return ['default', ...(poses[key] ? ['front'] as const : []), ...(walkers[key] ? ['running'] as const : [])]
}
// The image a style draws from: the running pose is one frame of a sheet.
const spriteFile = (name: string, shiny: boolean, style: SpriteStyle): AssetSource =>
  style === 'default' ? spriteSource(name, shiny) as AssetSource : style === 'front' ? poses[variant(name, shiny)][0] : walkers[variant(name, shiny)]

// Sprites read once per session. The web serves bundled images over HTTP; phones copy them to a file first.
const artCache = new Map<string, Promise<PixelArt>>()
async function readImage(source: AssetSource): Promise<Uint8Array> {
  const asset = Asset.fromModule(source)
  if (Platform.OS === 'web') return new Uint8Array(await (await fetch(asset.uri)).arrayBuffer())
  await asset.downloadAsync()
  // A release build on Android keeps bundled images as app resources, which expo-asset reports by their resource
  // name (no scheme) without copying them anywhere a file can be read. Downloading it again copies it to the cache.
  if (!asset.localUri?.includes(':')) {
    asset.downloaded = false
    await asset.downloadAsync()
  }
  return new File(asset.localUri!).bytes()
}
function loadArt(name: string, shiny: boolean, style: SpriteStyle): Promise<PixelArt> {
  const key = `${style} ${variant(name, shiny)}`
  let art = artCache.get(key)
  if (!art) {
    art = readImage(spriteFile(name, shiny, style)).then(bytes => {
      const pixels = decodePng(bytes)
      return pixelArt(style === 'running' ? crop(pixels, STRIDE_FRAME * FRAME, 0, FRAME, FRAME) : pixels)
    })
    artCache.set(key, art)
    art.catch(() => artCache.delete(key))
  }
  return art
}

// The sprite as pixel art: undefined while it loads, null if it could not be read (the card then shows the same
// sprite as an ordinary, smoothed image).
export function usePixelArt(name: string, shiny: boolean, style: SpriteStyle): PixelArt | null | undefined {
  const key = `${style} ${variant(name, shiny)}`
  const [loaded, setLoaded] = useState<{ key: string, art: PixelArt | null }>()
  useEffect(() => {
    let live = true
    loadArt(name, shiny, style).then(art => { if (live) setLoaded({ key, art }) }, () => { if (live) setLoaded({ key, art: null }) })
    return () => { live = false }
  }, [key, name, shiny, style])
  return loaded?.key === key ? loaded.art : undefined
}

// Hours and minutes like Strava (1h 22m); minutes and seconds under an hour.
function cardTime(seconds?: number | null): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '--'
  const total = Math.round(seconds), hours = Math.floor(total / 3600), minutes = Math.floor(total / 60) % 60
  return hours ? `${hours}h ${minutes}m` : `${minutes}m ${total % 60}s`
}
const clock = (time: number) => new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

// The extra details this adventure can show, as they read on the card. The share screen offers a checkbox for each.
export function cardDetails(facts: AdventureFacts, record: DexRecord, pokemon: string): Partial<Record<CardDetail, string>> {
  const details: Partial<Record<CardDetail, string>> = {}
  if (pokemon !== 'Egg') details.type = typeLabel(pokemonType(pokemon))
  if (facts.bests.length) details.best = `★ ${facts.bests.map(metric => bestLabels[metric]).join(' · ')}`
  if (facts.evolution.length > 1) details.evolution = facts.evolution.join(' › ')
  if (facts.hatchSeconds) details.hatch = `Hatched in ${cardTime(facts.hatchSeconds)}`
  if (facts.steps) details.steps = `${facts.steps.toLocaleString()} steps`
  if (facts.started) details.clock = `${clock(facts.started)} – ${clock(Date.parse(record.finishedAt))}`
  return details
}

// The Pokemon an adventure reached, or another form it passed through (the share image can show any of them).
export function cardTitle(family: string[], record: DexRecord, form = recordForm(family, record)): string {
  return `${record.shiny ? 'Shiny ' : ''}${form === 'Egg' ? `${family[0]} egg` : form}`
}

// zepimon-shiny-garchomp-2026-10-27.png
export function cardFileName(family: string[], record: DexRecord, form?: string): string {
  const name = cardTitle(family, record, form).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const finished = Date.parse(record.finishedAt)
  return `zepimon-${name || 'adventure'}${Number.isFinite(finished) ? `-${dayKey(finished)}` : ''}.png`
}

type CardProps = { family: string[], record: DexRecord, pokemon: string, points: [number, number][], art: PixelArt | null | undefined,
  facts: AdventureFacts, options: CardOptions }
// What both designs draw with: u turns image pixels into layout units, and text styles a line at a pixel size.
type Kit = CardProps & { u: number, text: (size: number, fontFamily: string, color?: string) => TextStyle, title: string, subtitle: string,
  shown: Partial<Record<CardDetail, string>> }

export function ShareCard({ ref, width, ...props }: CardProps & { ref?: Ref<View>, width: number }) {
  const { family, record, pokemon, facts, options: { background, details } } = props
  const u = width / CARD_PIXELS[0]
  const habitat = background === 'habitat' ? habitatTheme(pokemon) : null
  const finished = new Date(record.finishedAt)
  const available = cardDetails(facts, record, pokemon)
  const kit: Kit = { ...props, u,
    // A soft shadow keeps white text readable where it crosses the route, the scenery or a photo behind a clear card.
    text: (size, fontFamily, color = WHITE) => ({ fontFamily, fontSize: size * u, lineHeight: Math.round(size * 1.22) * u, color, textAlign: 'center',
      textShadowColor: habitat ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.6)', textShadowOffset: { width: 0, height: 3 * u }, textShadowRadius: 14 * u }),
    title: cardTitle(family, record, pokemon),
    subtitle: [record.activity && (record.activity === 'running' ? 'Run' : 'Walk'),
      Number.isFinite(finished.getTime()) && finished.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })]
      .filter(Boolean).join(' · ').toUpperCase(),
    shown: Object.fromEntries(details.filter(detail => available[detail]).map(detail => [detail, available[detail]]))
  }
  return <View ref={ref} collapsable={false} style={{ width, height: width * CARD_PIXELS[1] / CARD_PIXELS[0],
    backgroundColor: background === 'dark' ? DARK : habitat ? habitat.sky : 'transparent' }}>
    {habitat && <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: LANDSCAPE_HEIGHT * u }}>
      <Backdrop theme={habitat} platform={false} />
    </View>}
    {props.options.design === 'classic' ? <Classic kit={kit} /> : <Split kit={kit} />}
  </View>
}

// Classic: everything in one centred column over the route, which fills the card behind it.
function Classic({ kit }: { kit: Kit }) {
  const { u, text, title, subtitle, shown, art, points, record, options } = kit
  const box = SPRITE_SIZES[options.size]
  const tags = tagRow(kit)
  const notes = [shown.hatch, shown.steps, shown.clock].filter(Boolean).join(' · ')
  // A big sprite with every detail would run off the card, so the stats shrink to make room.
  const tall = 71 + 36 + box + 94 + 37 + (tags ? 74 : 0) + (shown.evolution ? 50 : 0) + 657 + (notes ? 90 : 0) > 1820
  const stats = [['Distance', km(record.meters)], ['Pace', averagePace(record.elapsedSeconds, record.meters)], ['Time', cardTime(record.elapsedSeconds)]]
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    {points.length > 0 && <View style={{ position: 'absolute', left: 60 * u, top: 250 * u }}>
      <RouteArt kit={kit} width={960} height={1420} />
    </View>}
    <Wordmark kit={kit} size={58} />
    <View style={{ marginTop: 36 * u }}><SpriteArt art={art} kit={kit} box={box} /></View>
    <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit
      style={[text(64, fonts.black), { maxWidth: 960 * u, marginTop: 16 * u }]}>{title}</Text>
    {!!subtitle && <Text allowFontScaling={false} style={[text(30, fonts.heavy, 'rgba(255, 255, 255, 0.85)'), { letterSpacing: 4 * u }]}>{subtitle}</Text>}
    {tags && <View style={{ marginTop: 18 * u }}>{tags}</View>}
    {shown.evolution && <Text allowFontScaling={false} style={[text(30, fonts.heavy), { marginTop: 10 * u, maxWidth: 960 * u }]}>{shown.evolution}</Text>}
    {stats.map(([label, value], i) => <View key={label} style={{ alignItems: 'center', marginTop: (i ? tall ? 14 : 26 : tall ? 40 : 56) * u }}>
      <Text allowFontScaling={false} style={text(tall ? 34 : 38, fonts.bold)}>{label}</Text>
      <Text allowFontScaling={false} style={text(tall ? 96 : 112, fonts.black)}>{value}</Text>
    </View>)}
    {!!notes && <Text allowFontScaling={false} style={[text(32, fonts.bold, 'rgba(255, 255, 255, 0.9)'), { marginTop: 36 * u, maxWidth: 960 * u }]}>{notes}</Text>}
  </View>
}

// Split: the route on top with nothing over it, then the Pokemon, its name and the stats in a row. Without a route
// (a watch adventure), the Pokemon takes the route's place.
function Split({ kit }: { kit: Kit }) {
  const { u, text, title, subtitle, shown, art, points, record, options } = kit
  const [area, setArea] = useState<{ width: number, height: number } | null>(null)
  const tags = tagRow(kit)
  const notes = [shown.hatch, shown.steps, shown.clock].filter(Boolean).join(' · ')
  const pace = averagePace(record.elapsedSeconds, record.meters)
  const stats = [['Distance', km(record.meters).replace(' km', ''), 'km'], ['Pace', pace.replace(' /km', ''), '/km'], ['Time', cardTime(record.elapsedSeconds), '']]
  return <View style={{ flex: 1, paddingHorizontal: 70 * u, paddingTop: 100 * u, paddingBottom: 110 * u }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 20 * u }}>
      <Wordmark kit={kit} size={46} />
      {!!subtitle && <Text allowFontScaling={false} style={[text(28, fonts.heavy, 'rgba(255, 255, 255, 0.85)'), { letterSpacing: 3 * u, flexShrink: 1 }]}>{subtitle}</Text>}
    </View>
    <View style={{ flex: 1, marginVertical: 40 * u, alignItems: 'center', justifyContent: 'center' }}
      onLayout={event => setArea({ width: event.nativeEvent.layout.width / u, height: event.nativeEvent.layout.height / u })}>
      {points.length ? area && <RouteArt kit={kit} width={area.width} height={area.height} />
        : <SpriteArt art={art} kit={kit} box={SPRITE_SIZES[options.size]} />}
    </View>
    <View style={{ alignItems: 'center' }}>
      {points.length > 0 && <SpriteArt art={art} kit={kit} box={SPLIT_SIZES[options.size]} />}
      <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={[text(64, fonts.black), { maxWidth: 940 * u, marginTop: 12 * u }]}>{title}</Text>
      {tags && <View style={{ marginTop: 14 * u }}>{tags}</View>}
      {shown.evolution && <Text allowFontScaling={false} style={[text(30, fonts.heavy), { marginTop: 10 * u }]}>{shown.evolution}</Text>}
      <View style={{ flexDirection: 'row', alignSelf: 'stretch', marginTop: 44 * u }}>
        {stats.map(([label, value, unit]) => <View key={label} style={{ flex: 1, alignItems: 'center' }}>
          <Text allowFontScaling={false} style={text(32, fonts.bold, 'rgba(255, 255, 255, 0.85)')}>{label}</Text>
          <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={text(76, fonts.black)}>
            {value}{!!unit && <Text style={{ fontFamily: fonts.heavy, fontSize: 34 * u }}> {unit}</Text>}</Text>
        </View>)}
      </View>
      {!!notes && <Text allowFontScaling={false} style={[text(30, fonts.bold, 'rgba(255, 255, 255, 0.9)'), { marginTop: 30 * u }]}>{notes}</Text>}
    </View>
  </View>
}

function Wordmark({ kit: { u, text }, size }: { kit: Kit, size: number }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.31 * u }}>
    <PokeballIcon size={size * 0.93 * u} color={WHITE} stroke={size * 0.12 * u} />
    <Text allowFontScaling={false} style={[text(size, fonts.black), { letterSpacing: size * 0.14 * u }]}>ZEPIMON</Text>
  </View>
}

// The type and personal best as small badges, or null when neither is shown.
function tagRow({ u, shown, pokemon }: Kit) {
  const tags = [shown.type && [shown.type, typeColors[pokemonType(pokemon)] || typeColors.normal], shown.best && [shown.best, STAR]]
    .filter((tag): tag is [string, string] => !!tag)
  if (!tags.length) return null
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14 * u, maxWidth: 960 * u }}>
    {tags.map(([label, color]) => <View key={label} style={{ backgroundColor: color, borderRadius: 999, paddingHorizontal: 24 * u, paddingVertical: 6 * u }}>
      <Text allowFontScaling={false} style={{ fontFamily: fonts.heavy, fontSize: 26 * u, lineHeight: 34 * u, letterSpacing: 2 * u, color: WHITE }}>
        {label.toUpperCase()}</Text>
    </View>)}
  </View>
}

// The sprite at the largest whole-number enlargement that fits the box, which keeps every pixel square and sharp.
// If its file could not be read, the same sprite shows as an ordinary image, so the chosen pose still shows.
function SpriteArt({ art, kit: { u, pokemon, record, options }, box }: { art: PixelArt | null | undefined, kit: Kit, box: number }) {
  const scale = art?.width ? Math.max(1, Math.floor(box / Math.max(art.width, art.height))) : 0
  const source = spriteFile(pokemon, record.shiny, options.style) as ImageSourcePropType
  const pixelated = Platform.OS === 'web' ? { imageRendering: 'pixelated' } as const : {}
  return <View style={{ width: box * u, height: box * u, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
    {art ? <Svg width={art.width * scale * u} height={art.height * scale * u} viewBox={`0 0 ${art.width} ${art.height}`}>
      {art.paths.map((path, i) => <Path key={i} d={path.d} fill={path.color} fillOpacity={path.opacity} />)}
    </Svg> : art === null && (options.style === 'running'
      // The whole eight-frame sheet, shifted so the box shows only the stride frame.
      ? <Image source={source} fadeDuration={0} style={{ position: 'absolute', top: 0, left: -STRIDE_FRAME * box * u,
        width: 8 * box * u, height: box * u, ...pixelated }} />
      : <Image source={source} resizeMode="contain" fadeDuration={0} style={{ width: box * u, height: box * u, ...pixelated }} />)}
  </View>
}

// The route in a width × height box (image pixels), drawn through a viewBox at that size. Its parent places it: the
// web capture redraws each svg as a standalone image, where the svg's own left and top would shift the drawing.
// Over scenery it is white with a dark edge, which reads on any habitat's colors.
function RouteArt({ kit: { u, points, options }, width, height }: { kit: Kit, width: number, height: number }) {
  const route = routeShape(points, width, height, 40)
  if (!route) return null
  const habitat = options.background === 'habitat'
  return <Svg width={width * u} height={height * u} viewBox={`0 0 ${width} ${height}`}>
    <Defs>
      <LinearGradient id="share-route" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={ROUTE_COLORS[0]} /><Stop offset="1" stopColor={ROUTE_COLORS[1]} />
      </LinearGradient>
    </Defs>
    <Path d={route.path} fill="none" stroke={habitat ? 'rgba(0, 0, 0, 0.45)' : 'url(#share-route)'} strokeOpacity={habitat ? 1 : 0.22}
      strokeWidth={habitat ? 26 : 40} strokeLinecap="round" strokeLinejoin="round" />
    <Path d={route.path} fill="none" stroke={habitat ? WHITE : 'url(#share-route)'} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
}

// Opens the share image of a saved adventure: a phone adventure's id (it has a route) or a Journal run's.
export function ShareRunButton({ id }: { id: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Share this adventure as an image" hitSlop={6}
    onPress={() => router.push({ pathname: '/share', params: { id } })}
    style={({ pressed }) => [card.share, { opacity: pressed ? 0.7 : 1 }]}>
    <Icon name="share" size={16} color={colors.edge} />
    <Text style={card.shareText}>Share image</Text>
  </Pressable>
}

const card = themedStyles(() => ({
  share: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 34, marginTop: 4,
    paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.mint },
  shareText: { fontFamily: fonts.heavy, fontSize: 13, lineHeight: 18, color: colors.edge }
}))
