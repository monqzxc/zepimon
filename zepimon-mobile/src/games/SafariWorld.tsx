import { useEffect, useState } from 'react'
import { Animated, Easing, Platform, Text, View } from 'react-native'
import { safariChunks, safariSprites } from '../generated/safari-assets.js'
import { pointKey, safariMap, tileAt } from './safari-zone'
import type { Point, WalkResult, Wild, ZoneGame } from './safari-zone'
import { SAFARI_ACROSS, buddyFrame, tileSizeFor } from './safari-view'
import { Sprite, TileWorld, Walker } from './TileWorld'
import type { Strip, TileChunks } from './TileWorld'
import { ShinyStars } from './ShinyAura'

const sprites = safariSprites as Record<'grass' | 'item', Strip>
const chunkImages = safariChunks as TileChunks
const items = safariMap.tiles.flatMap((row, y) => [...row].flatMap((tile, x) => tile === 'o' ? [{ x, y }] : []))
const native = Platform.OS !== 'web'

type Props = {
  game: ZoneGame, move: { kind: WalkResult['move'], id: number }, trainer: 'brendan' | 'may',
  buddy: { name: string, shiny: boolean } | null, width: number, height: number, reduced: boolean,
  tapToWalk: boolean, onTapTile: (tile: Point) => void, miss: { tile: Point, id: number } | null, jump?: number, fitHeight?: boolean
}

// The Safari Zone map: the shared tile world, seen from a little further back, with the Safari's items, its roaming
// wild Pokemon and missed-tap marks on the ground.
export function SafariWorld({ game, move, trainer, buddy, width, height, reduced, tapToWalk, onTapTile, miss, jump = 0, fitHeight = false }: Props) {
  const tile = tileSizeFor(width, fitHeight ? height : undefined, SAFARI_ACROSS)
  return <TileWorld map={safariMap} chunks={chunkImages} at={game.at} facing={game.facing} buddyAt={game.buddy} buddyFacing={game.buddyFacing}
    move={move} trainer={trainer} buddy={buddy} onGrass={tileAt(game.at) === 'g'} width={width} height={height} reduced={reduced} jump={jump}
    background="#1d3b2a" tapToWalk={tapToWalk} onTapTile={onTapTile} fitHeight={fitHeight} across={SAFARI_ACROSS}>
    {items.filter(point => !game.items.includes(pointKey(point))).map(point =>
      <Sprite key={pointKey(point)} strip={sprites.item} frame={0} at={point} tile={tile} />)}
    {game.wilds.map(wild => <WildPokemon key={wild.id} wild={wild} tile={tile} reduced={reduced} jump={jump}
      inGrass={tileAt(wild.at) === 'g'} focused={game.encounter?.id === wild.id} />)}
    {miss && <Miss key={miss.id} at={miss.tile} tile={tile} />}
  </TileWorld>
}

// A wild Pokemon out on the map: it fades in where it walked out, glides a tile per step as your buddy does, stands in
// the tall grass up to its feet, twinkles if it is Shiny, and shows a "!" once it has noticed you.
function WildPokemon({ wild, tile, reduced, jump, inGrass, focused }: { wild: Wild, tile: number, reduced: boolean, jump: number, inGrass: boolean, focused: boolean }) {
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
    {focused && <Text style={{ position: 'absolute', left, top: top - tile * 0.8, width: tile, textAlign: 'center', fontSize: tile * 0.7, lineHeight: tile * 0.8,
      fontWeight: '900', color: '#ffffff', textShadowColor: '#000000', textShadowRadius: 3 }}>!</Text>}
  </Animated.View>
}

function Miss({ at, tile }: { at: Point, tile: number }) {
  const [shown, setShown] = useState(true)
  useEffect(() => { const timer = setTimeout(() => setShown(false), 600); return () => clearTimeout(timer) }, [])
  if (!shown) return null
  return <Text style={{ position: 'absolute', left: at.x * tile, top: at.y * tile, width: tile, height: tile, lineHeight: tile, textAlign: 'center',
    fontSize: tile * 0.6, fontWeight: '900', color: '#ffffff', textShadowColor: '#000000', textShadowRadius: 3 }}>✕</Text>
}
