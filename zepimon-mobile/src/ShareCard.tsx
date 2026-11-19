import { useEffect, useState } from 'react'
import type { Ref } from 'react'
import { Image, PixelRatio, Platform, Pressable, Text, View } from 'react-native'
import type { ImageSourcePropType, TextStyle } from 'react-native'
import { router } from 'expo-router'
import { Asset } from 'expo-asset'
import { File } from 'expo-file-system'
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
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
import type { IconName } from './ui'

// A saved adventure as a story-sized image, like a Strava share card: the route and a Pokemon from the adventure,
// drawn as enlarged pixel art, with its distance, pace and time. The share screen (src/app/share.tsx) picks the
// design, sprite style and size, background and extra details. Sizes below are in pixels of the 1080 × 1920 image.
export const CARD_PIXELS = [1080, 1920] as const
// The card is laid out at its pixel size, so a capture is 1080 × 1920 without resampling. Previews shrink it.
export const cardWidth = () => CARD_PIXELS[0] / PixelRatio.get()

// classic puts the stats over the route, like Strava; split puts the route on top and the Pokemon and stats below;
// starter shows the Pokemon as a starter pick over a big Zepimon wordmark, with the run as its Dex entry.
export type CardDesign = 'classic' | 'split' | 'starter'
// default is the battle sprite; front is the overworld sprite as the Dex shows it, and running the same sprite seen
// from the side, mid-stride to the right.
export type SpriteStyle = 'default' | 'front' | 'running'
export type SpriteSize = 'small' | 'medium' | 'large' | 'huge'
export type CardBackground = 'dark' | 'clear' | 'habitat'
export type CardDetail = 'type' | 'best' | 'evolution' | 'hatch' | 'steps' | 'clock' | 'buddy'
// What can be left off a card: the dates, the Zepimon mark and (on Starter) the adventure's number.
export type CardHidden = 'date' | 'mark' | 'number'
export type CardOptions = { design: CardDesign, style: SpriteStyle, size: SpriteSize, background: CardBackground, details: CardDetail[],
  hidden: CardHidden[] }

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
// friend: the Buddy Friendship line, for a buddy with three hearts (src/friendship.ts shareLine).
export function cardDetails(facts: AdventureFacts, record: DexRecord, pokemon: string, friend: string | null = null): Partial<Record<CardDetail, string>> {
  const details: Partial<Record<CardDetail, string>> = {}
  if (pokemon !== 'Egg') details.type = typeLabel(pokemonType(pokemon))
  if (facts.bests.length) details.best = `★ ${facts.bests.map(metric => bestLabels[metric]).join(' · ')}`
  if (facts.evolution.length > 1) details.evolution = facts.evolution.join(' › ')
  if (facts.hatchSeconds) details.hatch = `Hatched in ${cardTime(facts.hatchSeconds)}`
  if (facts.steps) details.steps = `${facts.steps.toLocaleString()} steps`
  if (facts.started) details.clock = `${clock(facts.started)} – ${clock(Date.parse(record.finishedAt))}`
  if (friend) details.buddy = friend
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
  facts: AdventureFacts, options: CardOptions, count?: number | null, friend?: string | null }
// What both designs draw with: u turns image pixels into layout units, and text styles a line at a pixel size.
type Kit = CardProps & { u: number, text: (size: number, fontFamily: string, color?: string) => TextStyle, title: string, subtitle: string,
  shown: Partial<Record<CardDetail, string>> }

export function ShareCard({ ref, width, ...props }: CardProps & { ref?: Ref<View>, width: number }) {
  const { family, record, pokemon, facts, options: { background, details } } = props
  const u = width / CARD_PIXELS[0]
  const habitat = background === 'habitat' ? habitatTheme(pokemon) : null
  const finished = new Date(record.finishedAt)
  const available = cardDetails(facts, record, pokemon, props.friend ?? null)
  const kit: Kit = { ...props, u,
    // A soft shadow keeps white text readable where it crosses the route, the scenery or a photo behind a clear card.
    text: (size, fontFamily, color = WHITE) => ({ fontFamily, fontSize: size * u, lineHeight: Math.round(size * 1.22) * u, color, textAlign: 'center',
      textShadowColor: habitat ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.6)', textShadowOffset: { width: 0, height: 3 * u }, textShadowRadius: 14 * u }),
    title: cardTitle(family, record, pokemon),
    subtitle: [record.activity && (record.activity === 'running' ? 'Run' : 'Walk'),
      !props.options.hidden.includes('date') && Number.isFinite(finished.getTime()) && finished.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })]
      .filter(Boolean).join(' · ').toUpperCase(),
    shown: Object.fromEntries(details.filter(detail => available[detail]).map(detail => [detail, available[detail]]))
  }
  const starter = props.options.design === 'starter'
  return <View ref={ref} collapsable={false} style={{ width, height: width * CARD_PIXELS[1] / CARD_PIXELS[0],
    backgroundColor: background === 'dark' ? starter ? STARTER_SKY[0] : DARK : habitat ? habitat.sky : 'transparent' }}>
    {habitat && <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: LANDSCAPE_HEIGHT * u }}>
      <Backdrop theme={habitat} platform={false} />
    </View>}
    {props.options.design === 'classic' ? <Classic kit={kit} /> : props.options.design === 'split' ? <Split kit={kit} /> : <Starter kit={kit} />}
  </View>
}

// Classic: everything in one centred column over the route, which fills the card behind it.
function Classic({ kit }: { kit: Kit }) {
  const { u, text, title, subtitle, shown, art, points, record, options } = kit
  const box = SPRITE_SIZES[options.size]
  const tags = tagRow(kit)
  const notes = [shown.hatch, shown.steps, shown.clock, shown.buddy].filter(Boolean).join(' · ')
  // A big sprite with every detail would run off the card, so the stats shrink to make room.
  const tall = 71 + 36 + box + 94 + 37 + (tags ? 74 : 0) + (shown.evolution ? 50 : 0) + 657 + (notes ? 90 : 0) > 1820
  const stats = [['Distance', km(record.meters)], ['Pace', averagePace(record.elapsedSeconds, record.meters)], ['Time', cardTime(record.elapsedSeconds)]]
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    {points.length > 0 && <View style={{ position: 'absolute', left: 60 * u, top: 250 * u }}>
      <RouteArt kit={kit} width={960} height={1420} />
    </View>}
    {!options.hidden.includes('mark') && <Wordmark kit={kit} size={58} />}
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
  const notes = [shown.hatch, shown.steps, shown.clock, shown.buddy].filter(Boolean).join(' · ')
  const pace = averagePace(record.elapsedSeconds, record.meters)
  const stats = [['Distance', km(record.meters).replace(' km', ''), 'km'], ['Pace', pace.replace(' /km', ''), '/km'], ['Time', cardTime(record.elapsedSeconds), '']]
  return <View style={{ flex: 1, paddingHorizontal: 70 * u, paddingTop: 100 * u, paddingBottom: 110 * u }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 20 * u }}>
      {options.hidden.includes('mark') ? <View /> : <Wordmark kit={kit} size={46} />}
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

// Starter: a "choose your starter" screen made from the adventure. The Pokemon stands in the middle
// in front of its route, and below come which adventure it was (#0042 is the 42nd), its name, type,
// the run's stats and a Dex-style entry written from the details picked on the share screen.
const STARTER_SKY = ['#18202B', '#2A3848', '#5D7A96']
const STARTER_SIZES: Record<SpriteSize, number> = { small: 380, medium: 520, large: 640, huge: 760 }
// The sprite stands on this line.
const GROUND = 1050

function Starter({ kit }: { kit: Kit }) {
  const { u, text, title, shown, art, points, record, pokemon, facts, options, count } = kit
  const dark = options.background === 'dark'
  const habitat = options.background === 'habitat'
  const type = pokemonType(pokemon)
  const tint = typeColors[type] || typeColors.normal
  const box = STARTER_SIZES[options.size]
  const finished = new Date(record.finishedAt)
  const day = Number.isFinite(finished.getTime()) ? finished.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }).toUpperCase() : ''
  // The year sits in the top corner, away from the day and month by the name.
  const year = Number.isFinite(finished.getTime()) ? String(finished.getFullYear()) : ''
  const hide = { date: options.hidden.includes('date'), mark: options.hidden.includes('mark'), number: options.hidden.includes('number') }
  const activity = record.activity === 'running' ? 'Run' : record.activity ? 'Walk' : 'Adventure'
  const activityIcon = record.activity === 'running' ? 'run' : record.activity ? 'walk' : 'explore'
  const entry = starterEntry(kit)
  const stats = [['Distance', km(record.meters).replace(' km', ''), 'km'],
    ['Pace', averagePace(record.elapsedSeconds, record.meters).replace(' /km', ''), '/km'], ['Time', cardTime(record.elapsedSeconds), '']]
  // The swipe-up handle fits under a one-line entry (about 48 characters); a longer one leaves the bottom clear.
  const handle = entry.length <= 48
  // Sized to the name, since the web cannot shrink text to fit: about 0.7 em a letter in the 600 px between the sides.
  const nameSize = Math.min(112, Math.floor(600 / (title.length * 0.7)))
  const best = shown.best && facts.bests.length > 1 ? `★ ${facts.bests.length} personal bests` : shown.best
  return <View style={{ flex: 1 }}>
    {dark && <View style={{ position: 'absolute', left: 0, top: 0 }}>
      <Svg width={CARD_PIXELS[0] * u} height={CARD_PIXELS[1] * u} viewBox={`0 0 ${CARD_PIXELS[0]} ${CARD_PIXELS[1]}`}>
        <Defs>
          <LinearGradient id="starter-sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={STARTER_SKY[0]} /><Stop offset="0.55" stopColor={STARTER_SKY[1]} /><Stop offset="1" stopColor={STARTER_SKY[2]} />
          </LinearGradient>
          <RadialGradient id="starter-glow" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={tint} stopOpacity={0.55} /><Stop offset="1" stopColor={tint} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={CARD_PIXELS[0]} height={CARD_PIXELS[1]} fill="url(#starter-sky)" />
        <Circle cx={540} cy={GROUND - 300} r={520} fill="url(#starter-glow)" />
      </Svg>
    </View>}
    {habitat && <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 900 * u,
      experimental_backgroundImage: 'linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.6))', backgroundImage: 'linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.6))' } as object} />}
    {/* The route behind the Pokemon, raised so most of it shows above the sprite. */}
    {points.length > 0 && <View style={{ position: 'absolute', left: 90 * u, top: 200 * u, opacity: habitat ? 0.85 : 0.9 }}>
      <RouteArt kit={kit} width={900} height={GROUND - 300} />
    </View>}

    {!!year && !hide.date && <Text allowFontScaling={false} style={{ position: 'absolute', left: 96 * u, top: 120 * u, fontFamily: fonts.black, fontSize: 30 * u,
      lineHeight: 38 * u, letterSpacing: 4 * u, color: 'rgba(255, 255, 255, 0.8)', textShadowColor: 'rgba(0, 0, 0, 0.5)',
      textShadowOffset: { width: 0, height: 2 * u }, textShadowRadius: 8 * u }}>{year}</Text>}
    {!hide.mark && <View style={{ position: 'absolute', right: 96 * u, top: 120 * u }}><Tag u={u} tint={tint} /></View>}

    <View style={{ position: 'absolute', left: 0, right: 0, top: (GROUND - box) * u, alignItems: 'center' }}>
      <View style={{ position: 'absolute', top: (box - 34) * u, width: box * 0.62 * u, height: 56 * u }}>
        <Svg width={box * 0.62 * u} height={56 * u} viewBox={`0 0 ${box * 0.62} 56`}>
          <Ellipse cx={box * 0.31} cy={28} rx={box * 0.31} ry={22} fill="rgba(0, 0, 0, 0.35)" />
        </Svg>
      </View>
      <SpriteArt art={art} kit={kit} box={box} />
    </View>

    <View style={{ position: 'absolute', left: 80 * u, right: 80 * u, top: (GROUND + 40) * u, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', alignSelf: 'stretch' }}>
        <Text allowFontScaling={false} style={[text(40, fonts.heavy, 'rgba(255, 255, 255, 0.85)'), { width: 150 * u, textAlign: 'left', marginBottom: 14 * u }]}>
          {count && !hide.number ? `#${String(count).padStart(4, '0')}` : ''}</Text>
        <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit
          style={[text(nameSize, fonts.black), { flex: 1, letterSpacing: 2 * u }]}>{title.toUpperCase()}</Text>
        <Text allowFontScaling={false} style={[text(40, fonts.heavy, 'rgba(255, 255, 255, 0.85)'), { width: 150 * u, textAlign: 'right', marginBottom: 14 * u }]}>{hide.date ? '' : day}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16 * u, marginTop: 14 * u }}>
        {shown.type ? <Pill u={u} label={shown.type} dot={tint} /> : <Pill u={u} label={activity} dot={ROUTE_COLORS[0]} icon={activityIcon} />}
        {best && <Pill u={u} label={best} dot={STAR} />}
      </View>
      <View style={{ flexDirection: 'row', alignSelf: 'stretch', gap: 18 * u, marginTop: 36 * u }}>
        {stats.map(([label, value, unit]) => <View key={label} style={{ flex: 1, alignItems: 'center', paddingVertical: 22 * u, borderRadius: 36 * u,
          backgroundColor: 'rgba(255, 255, 255, 0.10)', borderWidth: 2 * u, borderColor: 'rgba(255, 255, 255, 0.18)' }}>
          <Text allowFontScaling={false} style={[text(26, fonts.heavy, 'rgba(255, 255, 255, 0.75)'), { letterSpacing: 3 * u }]}>{label.toUpperCase()}</Text>
          <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={[text(64, fonts.black), { maxWidth: 270 * u }]}>
            {value}{!!unit && <Text style={{ fontFamily: fonts.heavy, fontSize: 30 * u }}> {unit}</Text>}</Text>
        </View>)}
      </View>
      {!!entry && <Text allowFontScaling={false} style={[text(34, fonts.heavy, 'rgba(255, 255, 255, 0.92)'),
        { textAlign: 'left', alignSelf: 'stretch', marginTop: 36 * u, lineHeight: 46 * u }]}>{entry}</Text>}
    </View>
    {handle && <View style={{ position: 'absolute', left: 0, right: 0, bottom: 96 * u, alignItems: 'center' }}><Handle u={u} tint={tint} /></View>}
  </View>
}

// The Dex entry: the run told as a sentence or two, then the details picked on the share screen.
function starterEntry({ title, record, shown, pokemon }: Kit): string {
  const moved = record.activity === 'walking' ? 'walked' : 'ran'
  const name = pokemon === 'Egg' ? `This ${title.replace(/ egg$/, '')} egg` : title
  const sentences = [`${name} ${moved} ${km(record.meters)} at ${averagePace(record.elapsedSeconds, record.meters)}.`]
  if (shown.evolution) sentences.push(`It grew ${shown.evolution.split(' › ').join(' to ')} on the way.`)
  if (shown.hatch) sentences.push(`${shown.hatch.replace('Hatched', 'The egg hatched')}.`)
  if (shown.steps) sentences.push(`${shown.steps[0].toUpperCase()}${shown.steps.slice(1)} together.`)
  if (shown.clock) sentences.push(`Out from ${shown.clock.replace(' – ', ' to ')}.`)
  if (shown.buddy) sentences.push(`${shown.buddy.replace(/ ♥+$/, '').replace(' · ', ', ')}.`)
  return sentences.join(' ')
}

// A small "made with Zepimon" mark for the corner: a tiny orb in the Pokemon's type color and the name.
function Tag({ u, tint }: { u: number, tint: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 * u, opacity: 0.8 }}>
    <View style={{ width: 22 * u, height: 22 * u, borderRadius: 11 * u, backgroundColor: tint, borderWidth: 4 * u, borderColor: WHITE }} />
    <Text allowFontScaling={false} style={{ fontFamily: fonts.black, fontSize: 30 * u, lineHeight: 38 * u, letterSpacing: 2 * u, color: WHITE,
      textShadowColor: 'rgba(0, 0, 0, 0.5)', textShadowOffset: { width: 0, height: 2 * u }, textShadowRadius: 8 * u }}>zepimon</Text>
  </View>
}

// A dot in the given color, or with icon, a small badge holding the icon (the activity's figure).
function Pill({ u, label, dot, icon }: { u: number, label: string, dot: string, icon?: IconName }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 * u, paddingLeft: 18 * u, paddingRight: 34 * u, paddingVertical: 12 * u,
    borderRadius: 999, backgroundColor: 'rgba(10, 14, 20, 0.55)', borderWidth: 2 * u, borderColor: 'rgba(255, 255, 255, 0.12)' }}>
    {icon ? <View style={{ width: 48 * u, height: 48 * u, borderRadius: 24 * u, backgroundColor: dot, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={34 * u} color={DARK} />
    </View> : <View style={{ width: 40 * u, height: 40 * u, borderRadius: 20 * u, backgroundColor: dot, borderWidth: 6 * u, borderColor: 'rgba(255, 255, 255, 0.9)' }} />}
    <Text allowFontScaling={false} style={{ fontFamily: fonts.heavy, fontSize: 34 * u, lineHeight: 44 * u, color: WHITE }}>{label}</Text>
  </View>
}

// A story's swipe-up handle: chevrons in a pill, ending in an orb in the Pokemon's type color.
function Handle({ u, tint }: { u: number, tint: string }) {
  return <View style={{ alignItems: 'center' }}>
    <View style={{ width: 86 * u, paddingTop: 20 * u, paddingBottom: 62 * u, borderRadius: 43 * u, alignItems: 'center', gap: 6 * u,
      backgroundColor: 'rgba(235, 240, 246, 0.9)' }}>
      {[0, 1, 2].map(i => <Svg key={i} width={40 * u} height={22 * u} viewBox="0 0 40 22">
        <Path d="M6 18 L20 5 L34 18" fill="none" stroke="#1E2733" strokeOpacity={0.45 + i * 0.2} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>)}
    </View>
    <View style={{ marginTop: -56 * u }}>
      <Svg width={112 * u} height={112 * u} viewBox="0 0 124 124">
        <Defs>
          <RadialGradient id="starter-orb" cx="0.38" cy="0.32" r="0.75">
            <Stop offset="0" stopColor={WHITE} stopOpacity={0.55} /><Stop offset="0.35" stopColor={tint} /><Stop offset="1" stopColor={tint} />
          </RadialGradient>
        </Defs>
        <Circle cx={62} cy={62} r={56} fill="url(#starter-orb)" stroke={WHITE} strokeWidth={8} />
        <Circle cx={62} cy={62} r={22} fill="none" stroke={WHITE} strokeWidth={8} />
        <Circle cx={62} cy={62} r={8} fill={WHITE} />
      </Svg>
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
