import { useEffect, useState } from 'react'
import type { Ref } from 'react'
import { Image, PixelRatio, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import type { TextStyle } from 'react-native'
import { router } from 'expo-router'
import { Asset } from 'expo-asset'
import { File } from 'expo-file-system'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { spriteSource } from './catalog'
import { trailWalkers } from './generated/trail-walkers.js'
import { averagePace, km, recordForm } from './journal'
import type { DexRecord } from './journal'
import { dayKey } from './progress'
import { crop, decodePng, pixelArt } from './pixel-art'
import type { PixelArt } from './pixel-art'
import { routeShape } from './RouteView'
import { Icon, PokeballIcon, colors, fonts } from './ui'

// A saved adventure as a story-sized image, like a Strava share card: the route behind a Pokemon from the adventure,
// drawn as enlarged pixel art in the chosen style and size, with its distance, pace and time. Sizes below are in
// pixels of the 1080 × 1920 image.
export const CARD_PIXELS = [1080, 1920] as const
// The card is laid out at its pixel size, so a capture is 1080 × 1920 without resampling. Previews shrink it.
export const cardWidth = () => CARD_PIXELS[0] / PixelRatio.get()
export type CardBackground = 'dark' | 'clear'
// original is the battle sprite; walking and front are overworld poses, a step to the right and facing you.
export type SpriteStyle = 'original' | 'walking' | 'front'
export type SpriteSize = 'small' | 'medium' | 'large' | 'huge'

const ROUTE = { left: 60, top: 250, width: 960, height: 1420, pad: 40 }
// The sprite's longest side on the card, before rounding down to a whole-number enlargement.
const SPRITE_SIZES: Record<SpriteSize, number> = { small: 260, medium: 440, large: 620, huge: 800 }
// The app's teal-to-blue brand gradient, brightened to stand out on a dark card or a photo.
const ROUTE_COLORS = ['#3BE8C4', '#4AA8FF']
const DARK = '#0D1218'

type AssetSource = Parameters<typeof Asset.fromModule>[0]
// The Trail Defense sheets (scripts/build-trail-walkers.py): eight 44 × 44 frames facing south, north, west and east,
// two steps each. About 600 forms have one; Eggs and some forms do not.
const walkers = trailWalkers as Record<string, AssetSource>
const FRAME = 44
const FRAME_INDEX: Record<Exclude<SpriteStyle, 'original'>, number> = { front: 0, walking: 6 }
const variant = (name: string, shiny: boolean) => `${shiny ? 'Shiny ' : ''}${name}`
export const spriteStyles = (name: string, shiny: boolean): SpriteStyle[] =>
  walkers[variant(name, shiny)] ? ['original', 'walking', 'front'] : ['original']

// Sprites read once per session. Phones copy a bundled image to a local file before it can be read; the web
// serves it over HTTP.
const artCache = new Map<string, Promise<PixelArt>>()
async function readImage(source: AssetSource): Promise<Uint8Array> {
  const asset = Asset.fromModule(source)
  if (Platform.OS === 'web') return new Uint8Array(await (await fetch(asset.uri)).arrayBuffer())
  await asset.downloadAsync()
  return new File(asset.localUri ?? asset.uri).bytes()
}
function loadArt(name: string, shiny: boolean, style: SpriteStyle): Promise<PixelArt> {
  const key = `${style} ${variant(name, shiny)}`
  let art = artCache.get(key)
  if (!art) {
    art = style === 'original' ? readImage(spriteSource(name, shiny) as AssetSource).then(bytes => pixelArt(decodePng(bytes)))
      : readImage(walkers[variant(name, shiny)]).then(bytes => pixelArt(crop(decodePng(bytes), FRAME_INDEX[style] * FRAME, 0, FRAME, FRAME)))
    artCache.set(key, art)
    art.catch(() => artCache.delete(key))
  }
  return art
}

// The sprite as pixel art: undefined while it loads, null if it could not be read (the card then shows the
// ordinary, smoothed battle sprite).
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

// pokemon is the form shown (the one reached unless another is chosen) and art its sprite in the chosen style.
export function ShareCard({ ref, family, record, pokemon = recordForm(family, record), points, art, size = 'medium', background, width }: {
  ref?: Ref<View>, family: string[], record: DexRecord, pokemon?: string, points: [number, number][], art: PixelArt | null | undefined,
  size?: SpriteSize, background: CardBackground, width: number
}) {
  const u = width / CARD_PIXELS[0]
  const route = routeShape(points, ROUTE.width, ROUTE.height, ROUTE.pad)
  const box = SPRITE_SIZES[size]
  // The largest whole-number enlargement that fits the box keeps every sprite pixel square and sharp.
  const scale = art?.width ? Math.max(1, Math.floor(box / Math.max(art.width, art.height))) : 0
  const finished = new Date(record.finishedAt)
  const subtitle = [record.activity && (record.activity === 'running' ? 'Run' : 'Walk'),
    Number.isFinite(finished.getTime()) && finished.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })]
    .filter(Boolean).join(' · ').toUpperCase()
  const stats = [['Distance', km(record.meters)], ['Pace', averagePace(record.elapsedSeconds, record.meters)], ['Time', cardTime(record.elapsedSeconds)]]
  // A soft shadow keeps white text readable where it crosses the route or a photo behind a clear card.
  const text = (size: number, fontFamily: string, color = '#FFFFFF'): TextStyle => ({
    fontFamily, fontSize: size * u, lineHeight: Math.round(size * 1.22) * u, color, textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.6)', textShadowOffset: { width: 0, height: 3 * u }, textShadowRadius: 14 * u
  })
  return <View ref={ref} collapsable={false} style={{ width, height: width * CARD_PIXELS[1] / CARD_PIXELS[0],
    backgroundColor: background === 'dark' ? DARK : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
    {/* A View places the route: the web capture redraws each svg as a standalone image, where the svg's own left and
        top would shift the drawing inside it. */}
    {route && <View style={{ position: 'absolute', left: ROUTE.left * u, top: ROUTE.top * u }}>
      <Svg width={ROUTE.width * u} height={ROUTE.height * u} viewBox={`0 0 ${ROUTE.width} ${ROUTE.height}`}>
        <Defs>
          <LinearGradient id="share-route" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={ROUTE_COLORS[0]} /><Stop offset="1" stopColor={ROUTE_COLORS[1]} />
          </LinearGradient>
        </Defs>
        <Path d={route.path} fill="none" stroke="url(#share-route)" strokeOpacity={0.22} strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" />
        <Path d={route.path} fill="none" stroke="url(#share-route)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 * u }}>
      <PokeballIcon size={54 * u} color="#FFFFFF" stroke={7 * u} />
      <Text allowFontScaling={false} style={[text(58, fonts.black), { letterSpacing: 8 * u }]}>ZEPIMON</Text>
    </View>
    <View style={{ width: box * u, height: box * u, marginTop: 36 * u, alignItems: 'center', justifyContent: 'center' }}>
      {art ? <Svg width={art.width * scale * u} height={art.height * scale * u} viewBox={`0 0 ${art.width} ${art.height}`}>
        {art.paths.map((path, i) => <Path key={i} d={path.d} fill={path.color} fillOpacity={path.opacity} />)}
      </Svg> : art === null && <Image source={spriteSource(pokemon, record.shiny)} resizeMode="contain" fadeDuration={0}
        style={{ width: box * u, height: box * u }} />}
    </View>
    <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit
      style={[text(64, fonts.black), { maxWidth: 960 * u, marginTop: 16 * u }]}>{cardTitle(family, record, pokemon)}</Text>
    {!!subtitle && <Text allowFontScaling={false} style={[text(30, fonts.heavy, 'rgba(255, 255, 255, 0.8)'), { letterSpacing: 4 * u }]}>{subtitle}</Text>}
    {stats.map(([label, value], i) => <View key={label} style={{ alignItems: 'center', marginTop: (i ? 26 : 56) * u }}>
      <Text allowFontScaling={false} style={text(38, fonts.bold)}>{label}</Text>
      <Text allowFontScaling={false} style={text(112, fonts.black)}>{value}</Text>
    </View>)}
  </View>
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

const card = StyleSheet.create({
  share: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 34, marginTop: 4,
    paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.mint },
  shareText: { fontFamily: fonts.heavy, fontSize: 13, lineHeight: 18, color: colors.edge }
})
