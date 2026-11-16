import { useEffect, useState } from 'react'
import { Animated, Easing, Platform, Text, View } from 'react-native'
import { safariChunks, safariSprites } from '../generated/safari-assets.js'
import { HELPERS, areaAt, pointKey, safariMap, tileAt } from './safari-zone'
import type { Help, Point, WalkResult, Wild, ZoneGame } from './safari-zone'
import { OverworldSprite } from './OverworldSprite'
import { SAFARI_ACROSS, buddyFrame, tileSizeFor } from './safari-view'
import { Sprite, TileWorld, Walker } from './TileWorld'
import type { Strip, TileChunks } from './TileWorld'
import { ShinyStars } from './ShinyAura'
import { WildCover, WildFoe, useWildScene } from './SafariWild'

const sprites = safariSprites as Record<'grass' | 'item', Strip>
const chunkImages = safariChunks as TileChunks
const items = safariMap.tiles.flatMap((row, y) => [...row].flatMap((tile, x) => tile === 'o' ? [{ x, y }] : []))
const native = Platform.OS !== 'web'
const helpers = safariMap.tiles.flatMap((row, y) => [...row].flatMap((tile, x) => HELPERS[tile] ? [{ ...HELPERS[tile], at: { x, y } }] : []))
// The rectangle an area covers, in tiles: the storm hangs over the desert and the dark fills the cave.
function bounds(letter: string) {
  const points = safariMap.areas.flatMap((row, y) => [...row].flatMap((area, x) => area === letter ? [{ x, y }] : []))
  const xs = points.map(point => point.x), ys = points.map(point => point.y)
  const left = Math.min(...xs), top = Math.min(...ys)
  return { left, top, cols: Math.max(...xs) - left + 1, rows: Math.max(...ys) - top + 1 }
}
const DESERT = bounds('k'), CAVE = bounds('c')
// How far you see in the dark cave, in tiles each way from the trainer: next to nothing, or a wide circle with Flash.
const SIGHT = { dark: 1.5, flash: 4.5 }

type Props = {
  game: ZoneGame, move: { kind: WalkResult['move'], id: number }, trainer: 'brendan' | 'may',
  buddy: { name: string, shiny: boolean } | null, width: number, height: number, reduced: boolean,
  tapToWalk: boolean, onTapTile: (tile: Point) => void, miss: { tile: Point, id: number } | null, jump?: number, fitHeight?: boolean,
  // The id of the encounter action being played out on the map, or null.
  playing?: number | null
}

// The Safari Zone map: the shared tile world, seen from a little further back, with the Safari's items, its helper and
// roaming wild Pokemon and missed-tap marks on the ground. Seen from outside, the cave is dark and the desert hazy with
// its sandstorm (thick until you have goggles). Inside the cave only a small window around the trainer is lit, a wide one
// with Flash; inside the desert the whole view is hazy. On water the trainer rides Lapras. The Pokemon you walked into
// is drawn by SafariWild.tsx, with everything you throw at it.
export function SafariWorld({ game, move, trainer, buddy, width, height, reduced, tapToWalk, onTapTile, miss, jump = 0, fitHeight = false, playing = null }: Props) {
  const tile = tileSizeFor(width, fitHeight ? height : undefined, SAFARI_ACROSS)
  const scene = useWildScene(game, playing, reduced)
  const area = areaAt(game.at)
  const box = (area: typeof CAVE, backgroundColor: string) => <View pointerEvents="none" style={{ position: 'absolute', left: area.left * tile, top: area.top * tile,
    width: area.cols * tile, height: area.rows * tile, backgroundColor }} />
  const sight = (game.helps.includes('flash') ? SIGHT.flash : SIGHT.dark) * tile
  const dark = game.helps.includes('flash') ? 'rgba(6, 4, 12, 0.72)' : 'rgba(6, 4, 12, 0.96)'
  const world = <TileWorld map={safariMap} chunks={chunkImages} at={game.at} facing={game.facing} buddyAt={game.buddy} buddyFacing={game.buddyFacing}
    move={move} trainer={trainer} buddy={buddy} onGrass={tileAt(game.at) === 'g'} width={width} height={height} reduced={reduced} jump={jump}
    background="#1d3b2a" tapToWalk={tapToWalk} onTapTile={onTapTile} fitHeight={fitHeight} across={SAFARI_ACROSS}
    mount={tileAt(game.at) === '~' ? HELPERS.L.name : undefined}
    cover={<>
      {area !== 'cave' && box(CAVE, 'rgba(6, 4, 12, 0.8)')}
      {area !== 'desert' && box(DESERT, game.helps.includes('goggles') ? 'rgba(226, 190, 120, 0.18)' : 'rgba(226, 190, 120, 0.55)')}
      {scene && <WildCover scene={scene} trainerAt={game.at} tile={tile} reduced={reduced} />}
    </>}>
    {items.filter(point => !game.items.includes(pointKey(point))).map(point =>
      <Sprite key={pointKey(point)} strip={sprites.item} frame={0} at={point} tile={tile} />)}
    {game.wilds.filter(wild => wild.id !== scene?.wild.id).map(wild => <WildPokemon key={wild.id} wild={wild} tile={tile} reduced={reduced} jump={jump}
      inGrass={tileAt(wild.at) === 'g'} />)}
    {scene && <WildFoe key={scene.wild.id} scene={scene} tile={tile} inGrass={tileAt(scene.wild.at) === 'g'} reduced={reduced} />}
    {/* While you ride, Lapras is under you, not on the bank. */}
    {helpers.filter(helper => helper.help !== 'ride' || tileAt(game.at) !== '~').map(helper => <Helper key={helper.help} name={helper.name} at={helper.at} tile={tile} helping={game.helps.includes(helper.help)} />)}
    {miss && <Miss key={miss.id} at={miss.tile} tile={tile} />}
  </TileWorld>
  // Screen-fixed weather: the trainer is always in the middle, so the lit window in the cave never has to move.
  const cx = width / 2, cy = height / 2
  return <View style={{ width, height }}>
    {world}
    {area === 'cave' && <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', left: 0, top: 0, width, height: Math.max(0, cy - sight), backgroundColor: dark }} />
      <View style={{ position: 'absolute', left: 0, top: cy + sight, width, height: Math.max(0, height - cy - sight), backgroundColor: dark }} />
      <View style={{ position: 'absolute', left: 0, top: cy - sight, width: Math.max(0, cx - sight), height: sight * 2, backgroundColor: dark }} />
      <View style={{ position: 'absolute', left: cx + sight, top: cy - sight, width: Math.max(0, width - cx - sight), height: sight * 2, backgroundColor: dark }} />
    </View>}
    {area === 'desert' && <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height, backgroundColor: 'rgba(226, 190, 120, 0.18)' }} />}
  </View>
}

const HELP_MARK: Record<Help, string> = { ride: 'RIDE', flash: 'FLASH', goggles: 'GOGGLES' }

// A helper Pokemon on its tile, a little bigger than the wild ones, stepping in place under a label that says what it
// offers (ticked once it is helping), so it never reads as one more wild Pokemon.
function Helper({ name, at, tile, helping }: { name: string, at: Point, tile: number, helping: boolean }) {
  const size = tile * 1.3, wide = tile * 4
  const help = Object.values(HELPERS).find(helper => helper.name === name)!.help
  return <View pointerEvents="none" accessible accessibilityLabel={`${name}, a helper Pokemon${helping ? ', helping you' : ''}`}
    style={{ position: 'absolute', left: at.x * tile + tile / 2 - size / 2, top: (at.y + 1) * tile - size, width: size, alignItems: 'center' }}>
    <OverworldSprite name={name} size={size} />
    <View style={{ position: 'absolute', top: -tile * 0.5, left: (size - wide) / 2, width: wide, alignItems: 'center' }}>
      <Text style={{ paddingHorizontal: tile * 0.14, borderRadius: tile * 0.2, overflow: 'hidden', backgroundColor: 'rgba(8, 12, 20, 0.7)', fontSize: Math.max(8, tile * 0.3),
        lineHeight: tile * 0.44, fontWeight: '900', color: helping ? '#bff2a1' : '#ffffff' }}>{helping ? '✓ ' : ''}{HELP_MARK[help]}</Text>
    </View>
  </View>
}

// A wild Pokemon out on the map: it fades in where it walked out, glides a tile per step as your buddy does, stands in
// the tall grass up to its feet, and twinkles if it is Shiny.
function WildPokemon({ wild, tile, reduced, jump, inGrass }: { wild: Wild, tile: number, reduced: boolean, jump: number, inGrass: boolean }) {
  const [shown] = useState(() => new Animated.Value(reduced ? 1 : 0))
  useEffect(() => {
    if (reduced) { shown.setValue(1); return }
    const appear = Animated.timing(shown, { toValue: 1, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: native })
    appear.start()
    return () => appear.stop()
  }, [shown, reduced])
  const left = wild.at.x * tile, top = wild.at.y * tile
  return <Animated.View pointerEvents="none" accessible accessibilityLabel={`A wild ${wild.shiny ? 'Shiny ' : ''}${wild.name}`}
    style={{ position: 'absolute', left: 0, top: 0, opacity: shown }}>
    <Walker name={wild.name} shiny={wild.shiny} at={wild.at} frame={buddyFrame(wild.facing, (wild.steps % 2) as 0 | 1)} tile={tile} reduced={reduced} jump={jump} />
    {inGrass && <View style={{ position: 'absolute', left, top: top + tile / 2, width: tile, height: tile / 2, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', top: -tile / 2 }}><Sprite strip={sprites.grass} frame={0} at={{ x: 0, y: 0 }} tile={tile} /></View>
    </View>}
    {wild.shiny && <View style={{ position: 'absolute', left, top }}><ShinyStars size={tile} reduced={reduced} /></View>}
  </Animated.View>
}

function Miss({ at, tile }: { at: Point, tile: number }) {
  const [shown, setShown] = useState(true)
  useEffect(() => { const timer = setTimeout(() => setShown(false), 600); return () => clearTimeout(timer) }, [])
  if (!shown) return null
  return <Text style={{ position: 'absolute', left: at.x * tile, top: at.y * tile, width: tile, height: tile, lineHeight: tile, textAlign: 'center',
    fontSize: tile * 0.6, fontWeight: '900', color: '#ffffff', textShadowColor: '#000000', textShadowRadius: 3 }}>✕</Text>
}
