import { useEffect, useState } from 'react'
import { Text } from 'react-native'
import { safariChunks, safariSprites } from '../generated/safari-assets.js'
import { pointKey, safariMap, tileAt } from './safari-zone'
import type { Point, WalkResult, ZoneGame } from './safari-zone'
import { tileSizeFor } from './safari-view'
import { Sprite, TileWorld } from './TileWorld'
import type { Strip, TileChunks } from './TileWorld'

const sprites = safariSprites as Record<'grass' | 'item', Strip>
const chunkImages = safariChunks as TileChunks
const items = safariMap.tiles.flatMap((row, y) => [...row].flatMap((tile, x) => tile === 'o' ? [{ x, y }] : []))

type Props = {
  game: ZoneGame, move: { kind: WalkResult['move'], id: number }, trainer: 'brendan' | 'may',
  buddy: { name: string, shiny: boolean } | null, width: number, height: number, reduced: boolean,
  tapToWalk: boolean, onTapTile: (tile: Point) => void, miss: { tile: Point, id: number } | null, jump?: number, fitHeight?: boolean
}

// The Safari Zone map: the shared tile world with the Safari's items, rustling grass and missed-tap marks on the ground.
export function SafariWorld({ game, move, trainer, buddy, width, height, reduced, tapToWalk, onTapTile, miss, jump = 0, fitHeight = false }: Props) {
  const tile = tileSizeFor(width, fitHeight ? height : undefined)
  return <TileWorld map={safariMap} chunks={chunkImages} at={game.at} facing={game.facing} buddyAt={game.buddy} buddyFacing={game.buddyFacing}
    move={move} trainer={trainer} buddy={buddy} onGrass={tileAt(game.at) === 'g'} width={width} height={height} reduced={reduced} jump={jump}
    background="#1d3b2a" tapToWalk={tapToWalk} onTapTile={onTapTile} fitHeight={fitHeight}>
    {items.filter(point => !game.items.includes(pointKey(point))).map(point =>
      <Sprite key={pointKey(point)} strip={sprites.item} frame={0} at={point} tile={tile} />)}
    {game.rustling && <Rustle at={game.rustling} tile={tile} reduced={reduced} />}
    {miss && <Miss key={miss.id} at={miss.tile} tile={tile} />}
  </TileWorld>
}

// Frames 1-4 of the tall grass effect over and over: something is hiding there.
function Rustle({ at, tile, reduced }: { at: Point, tile: number, reduced: boolean }) {
  const [frame, setFrame] = useState(1)
  useEffect(() => {
    if (reduced) return
    const timer = setInterval(() => setFrame(current => current % 4 + 1), 120)
    return () => clearInterval(timer)
  }, [reduced])
  return <Sprite strip={sprites.grass} frame={reduced ? 2 : frame} at={at} tile={tile} />
}

function Miss({ at, tile }: { at: Point, tile: number }) {
  const [shown, setShown] = useState(true)
  useEffect(() => { const timer = setTimeout(() => setShown(false), 600); return () => clearTimeout(timer) }, [])
  if (!shown) return null
  return <Text style={{ position: 'absolute', left: at.x * tile, top: at.y * tile, width: tile, height: tile, lineHeight: tile, textAlign: 'center',
    fontSize: tile * 0.6, fontWeight: '900', color: '#ffffff', textShadowColor: '#000000', textShadowRadius: 3 }}>✕</Text>
}
