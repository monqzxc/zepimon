import { Image, Platform, View } from 'react-native'
import type { ImageSourcePropType, ViewStyle } from 'react-native'
import { moveSprites } from '../generated/move-sprites.js'
import { enemyPoint } from './battle'
import type { Battle, Shot, Strike } from './battle'

// Move animations drawn with the Gen III battle animation strips (src/generated/move-sprites.js). One source pixel is
// 1/48 of a square, so a 32 px sprite covers two thirds of one, about its size beside a Pokemon in the games.
// Both components draw around their anchor point (a 0 x 0 Mover), so the board only places that point.
type Sheet = { source: ImageSourcePropType, frames: number, width: number, height: number }
const sheets = moveSprites as Record<string, Sheet>
const PIXEL = 1 / 48
const FRAME_MS = 100
const FEET = 0.35

// aim turns a sprite toward its target and spin turns it steadily; fall drops it onto the foe, rise floats it up, grow
// swells it as it fades, flash makes it flicker and spread widens a ring to the wave's reach. bottom stands it on the
// foe's feet instead of its middle.
type Motion = 'aim' | 'spin' | 'fall' | 'rise' | 'grow' | 'flash' | 'spread'
type Layer = { sprite: string, scale?: number, motion?: Motion, bottom?: boolean, tint?: string }
// shot flies to the foe (null: nothing in flight, as with Bite); hit lands on it; spread lands on foes caught by a splash
// or chain (default: a smaller hit); wave plays around the attacker.
type Look = { shot: Layer | null, hit: Layer[], spread?: Layer[], wave?: Layer[] }
const pink = '#ff7fc8'
const looks: Record<string, Look> = {
  normal: { shot: { sprite: 'swift', scale: 0.6, motion: 'spin' }, hit: [{ sprite: 'hit' }] },
  fire: { shot: { sprite: 'ember', scale: 0.7 }, hit: [{ sprite: 'fire-plume', bottom: true }], spread: [{ sprite: 'small-ember', scale: 0.8 }] },
  water: { shot: { sprite: 'water-gun' }, hit: [{ sprite: 'water-splash', scale: 1.3, bottom: true }] },
  electric: { shot: { sprite: 'electricity', scale: 0.6 },
    hit: [{ sprite: 'lightning', scale: 0.7, motion: 'flash', bottom: true }, { sprite: 'electricity' }],
    spread: [{ sprite: 'lightning', scale: 0.5, motion: 'flash', bottom: true }, { sprite: 'electricity', scale: 0.7 }] },
  grass: { shot: { sprite: 'razor-leaf', scale: 0.8, motion: 'aim' }, hit: [{ sprite: 'hit', scale: 0.8 }], wave: [{ sprite: 'growth', motion: 'rise' }] },
  ice: { shot: { sprite: 'icicle', scale: 0.7, motion: 'aim' }, hit: [{ sprite: 'ice-chunk' }] },
  fighting: { shot: { sprite: 'fist', scale: 0.6 }, hit: [{ sprite: 'punch-impact', motion: 'grow' }] },
  poison: { shot: { sprite: 'sludge' }, hit: [{ sprite: 'sludge-splat', scale: 1.4 }] },
  ground: { shot: { sprite: 'rock', scale: 0.4, motion: 'spin' }, hit: [{ sprite: 'mound', bottom: true }],
    wave: [{ sprite: 'ring', tint: '#d9b77a', motion: 'spread' }] },
  flying: { shot: { sprite: 'air-cutter', scale: 0.8, motion: 'aim' }, hit: [{ sprite: 'gust', scale: 0.8 }] },
  psychic: { shot: { sprite: 'spiral', scale: 0.25, motion: 'spin', tint: pink }, hit: [{ sprite: 'spiral', scale: 0.45, motion: 'spin', tint: pink }],
    wave: [{ sprite: 'ring', tint: pink, motion: 'spread' }] },
  bug: { shot: { sprite: 'pin', motion: 'aim' }, hit: [{ sprite: 'hit', scale: 0.6 }] },
  rock: { shot: { sprite: 'rock', scale: 0.5, motion: 'spin' }, hit: [{ sprite: 'rock', scale: 0.8, motion: 'fall' }],
    wave: [{ sprite: 'ring', tint: '#b89a6a', motion: 'spread' }] },
  ghost: { shot: { sprite: 'shadow-ball', scale: 0.6, motion: 'spin' }, hit: [{ sprite: 'shadow-ball', scale: 0.8, motion: 'grow' }] },
  dragon: { shot: { sprite: 'dragon-flame', scale: 0.8 }, hit: [{ sprite: 'dragon-plume', bottom: true }] },
  dark: { shot: null, hit: [{ sprite: 'bite', scale: 0.45 }] },
  steel: { shot: { sprite: 'metal', scale: 0.8 }, hit: [{ sprite: 'claw' }], wave: [{ sprite: 'ring', tint: '#c8d6de', motion: 'spread' }] },
  fairy: { shot: { sprite: 'fairy-sparkle' }, hit: [{ sprite: 'heart', motion: 'rise' }] }
}
const lookOf = (move: string) => looks[move] ?? looks.normal
// The strip a move of this type lands with, for battles that draw their own hits (the Legendary battle).
export const hitSheet = (type: string) => sheets[lookOf(type).hit[0].sprite]
const smaller = (layers: Layer[]) => layers.map(layer => ({ ...layer, scale: (layer.scale ?? 1) * 0.75 }))

// A projectile in flight: its strip loops, and aimed sprites point at the foe they chase.
export function ShotSprite({ shot, game, cell, reduced }: { shot: Shot, game: Battle, cell: number, reduced: boolean }) {
  const layer = lookOf(shot.move).shot
  if (!layer) return null
  const target = game.enemies.find(enemy => enemy.id === shot.target)
  const to = target ? enemyPoint(game, target) : shot
  const angle = Math.atan2(to.y - shot.y, to.x - shot.x) * 180 / Math.PI
  const { frames } = sheets[layer.sprite]
  const frame = reduced ? 0 : (Math.floor(game.elapsed / FRAME_MS) + shot.id) % frames
  return <LayerView layer={layer} frame={frame} progress={0} elapsed={game.elapsed} cell={cell} reach={0} angle={angle} reduced={reduced} />
}

// A move landing: its strip plays once over the strike's life. Reduced motion shows one still frame that fades out.
export function StrikeSprite({ strike, elapsed, cell, reduced }: { strike: Strike, elapsed: number, cell: number, reduced: boolean }) {
  const look = lookOf(strike.move)
  const layers = strike.kind === 'wave' ? look.wave ?? [] : strike.kind === 'spread' ? look.spread ?? smaller(look.hit) : look.hit
  const progress = Math.min(0.999, Math.max(0, (elapsed - strike.start) / (strike.until - strike.start)))
  return <>{layers.map((layer, index) => {
    const { frames } = sheets[layer.sprite]
    const frame = reduced ? Math.floor((frames - 1) / 2) : Math.floor(progress * frames)
    return <LayerView key={index} layer={layer} frame={frame} progress={progress} elapsed={elapsed} cell={cell} reach={strike.reach} angle={0} reduced={reduced} />
  })}</>
}

function LayerView({ layer, frame, progress, elapsed, cell, reach, angle, reduced }: {
  layer: Layer, frame: number, progress: number, elapsed: number, cell: number, reach: number, angle: number, reduced: boolean
}) {
  const sheet = sheets[layer.sprite]
  const scale = (layer.scale ?? 1) * cell * PIXEL
  let width = sheet.width * scale, height = sheet.height * scale
  const motion = reduced && layer.motion !== 'aim' ? undefined : layer.motion
  if (layer.motion === 'spread') width = height = 2 * reach * cell * (reduced ? 1 : 0.35 + 0.65 * progress)
  const rotate = motion === 'aim' ? angle : motion === 'spin' ? (elapsed * 0.6) % 360 : 0
  const translateY = motion === 'fall' ? -(1 - Math.min(1, progress * 2.5)) * cell * 1.2 : motion === 'rise' ? -progress * cell * 0.5 : 0
  const opacity = layer.motion === 'grow' || layer.motion === 'spread' ? 1 - progress * 0.8
    : motion === 'flash' && Math.floor(progress * 5) % 2 ? 0.25 : progress >= 0.75 ? 0.55 : 1
  const transform: ViewStyle['transform'] = [{ translateY }, { rotate: `${rotate}deg` }, { scale: motion === 'grow' ? 0.6 + 0.8 * progress : 1 }]
  return <View pointerEvents="none" style={{ position: 'absolute', left: -width / 2, top: layer.bottom ? cell * FEET - height : -height / 2,
    width, height, overflow: 'hidden', opacity, transform }}>
    <Image source={sheet.source} resizeMode="stretch" fadeDuration={0} accessible={false}
      style={{ position: 'absolute', top: 0, left: -frame * width, width: width * sheet.frames, height, tintColor: layer.tint,
        ...(Platform.OS === 'web' ? { imageRendering: 'pixelated' } : {}) }} />
  </View>
}
