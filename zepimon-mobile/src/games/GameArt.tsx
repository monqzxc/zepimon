import type { ReactNode } from 'react'
import { Image, Platform, Text, View } from 'react-native'
import type { ImageSourcePropType } from 'react-native'
import { typeTheme } from '../HabitatScene'
import { PokeballIcon, displayFont, typeTints } from '../ui'
import { routeRunners } from '../generated/adventure-route.js'
import { moveSprites } from '../generated/move-sprites.js'
import { safariSprites } from '../generated/safari-assets.js'
import { trailWalkers } from '../generated/trail-walkers.js'
import { Frame } from './TileWorld'
import { TrailTerrain } from './TrailTerrain'
import { PixelSprite } from './TeamPicker'

// Still scenes for the arcade's game cards, drawn from each game's own art: the route tiles, the battle boards, the
// Safari backdrop and the move strips. Each fills a box of width x height and never animates, so a grid of six costs
// nothing per frame.
type Sheet = { source: ImageSourcePropType, frames: number, width: number, height: number }
const walkers = trailWalkers as Record<string, ImageSourcePropType>
const moves = moveSprites as Record<string, Sheet>
const safari = safariSprites as Record<string, Sheet>
const runners = routeRunners as Record<'brendan' | 'may', Sheet>
const pixelated = Platform.OS === 'web' ? { imageRendering: 'pixelated' } as object : {}
const SHADOW = '#2a1240'
// Overworld strips run south, south step, north, north step, west, ..., as in DefenseGame.
const SOUTH = 0, NORTH = 2, WEST = 4, EAST = 6

type Size = { width: number, height: number }

function At({ x, y, children }: { x: number, y: number, children: ReactNode }) {
  return <View pointerEvents="none" style={{ position: 'absolute', left: x, top: y }}>{children}</View>
}
// A walker centered on (x, y) with its feet a little below; foes get the battle's shadow wash.
function Walker({ name, x, y, size, frame, foe = false }: { name: string, x: number, y: number, size: number, frame: number, foe?: boolean }) {
  const strip = walkers[name]
  const sprite = strip ? (tint?: string) => <Frame strip={{ source: strip, frames: 8, width: 44, height: 44 }} frame={frame} width={size} height={size} tint={tint} />
    : (tint?: string) => <PixelSprite name={name} size={size} tint={tint} />
  return <At x={x - size / 2} y={y - size / 2}>
    {sprite()}
    {foe && <View style={{ position: 'absolute', opacity: 0.55 }}>{sprite(SHADOW)}</View>}
  </At>
}
function Move({ name, x, y, size, frame = 0 }: { name: string, x: number, y: number, size: number, frame?: number }) {
  const sheet = moves[name]
  return <At x={x - size / 2} y={y - size / 2}><Frame strip={sheet} frame={frame} width={size} height={size} /></At>
}

// The trainer runs north up Route 1, past the Pokemon Center.
export function AdventureArt({ width, height }: Size) {
  const tall = height * 0.42
  return <>
    <Image source={require('../../assets/route/start.png')} resizeMode="cover" fadeDuration={0} accessible={false}
      style={[{ position: 'absolute', width, height }, pixelated]} />
    <At x={width * 0.5 - tall / 4} y={height * 0.5}><Frame strip={runners.brendan} frame={4} width={tall / 2} height={tall} /></At>
  </>
}

// Route Guard as it plays: five lanes running down the screen, Shadow Pokemon walking in from the top, your team
// firing up the lanes and a Snorlax asleep at the foot of each one.
export function RouteGuardArt({ width, height }: Size) {
  const theme = typeTheme('electric')
  const cell = width / 5
  const snorlax = cell * 0.9
  const field = height - snorlax
  const rows = Math.ceil(field / cell)
  // Rows in squares from the top of the board: foes near the sky, your team just above the Snorlax.
  const front = field / cell - 0.5
  const foes: [string, number, number][] = [['Rattata', 0, 0.5], ['Zubat', 2, 0.45], ['Ekans', 4, 0.8]]
  const team: [string, number, string][] = [['Pikachu', 0, 'electricity'], ['Squirtle', 2, 'water-gun'], ['Charmander', 4, 'ember']]
  return <View style={{ width, height, backgroundColor: theme.sky }}>
    {Array.from({ length: rows * 5 }, (_, index) => {
      const col = index % 5, row = Math.floor(index / 5)
      return <View key={index} style={{ position: 'absolute', left: col * cell, top: field - (row + 1) * cell, width: cell, height: cell,
        backgroundColor: (col + row) % 2 ? theme.ground : theme.near }} />
    })}
    {foes.map(([name, lane, row]) => <Walker key={name} foe name={name} frame={SOUTH} x={(lane + 0.5) * cell} y={row * cell} size={cell * 0.95} />)}
    {team.map(([name, lane, move]) => <View key={name}>
      <Move name={move} x={(lane + 0.5) * cell} y={(front - 0.95) * cell} size={cell * 0.6} />
      <Walker name={name} frame={NORTH} x={(lane + 0.5) * cell} y={front * cell} size={cell * 0.95} />
    </View>)}
    <View style={{ position: 'absolute', left: 0, right: 0, top: field, height: snorlax, backgroundColor: theme.platform, flexDirection: 'row' }}>
      {Array.from({ length: 5 }, (_, lane) => <View key={lane} style={{ width: cell, alignItems: 'center', justifyContent: 'center' }}>
        <PixelSprite name="Snorlax" size={snorlax * 0.95} />
      </View>)}
    </View>
  </View>
}

// The top of the Switchback Trail: the cave, the first bends, foes on the dirt and your team beside it.
export function TrailArt({ width, height }: Size) {
  const theme = typeTheme('normal')
  const cell = width / 6
  return <View style={{ width, height, backgroundColor: theme.ground }}>
    <TrailTerrain path="switchback" cell={cell} theme={theme} />
    <Walker foe name="Rattata" frame={EAST} x={1.6 * cell} y={1.45 * cell} size={cell * 1.05} />
    <Walker foe name="Spearow" frame={EAST} x={3.4 * cell} y={1.45 * cell} size={cell * 1.05} />
    <Walker foe name="Ekans" frame={SOUTH} x={4.5 * cell} y={3 * cell} size={cell * 1.05} />
    <Walker name="Bulbasaur" frame={SOUTH} x={2.5 * cell} y={0.45 * cell} size={cell * 1.1} />
    <Move name="razor-leaf" x={2.1 * cell} y={0.95 * cell} size={cell * 0.6} />
    <Walker name="Charmander" frame={NORTH} x={2.6 * cell} y={2.55 * cell} size={cell * 1.1} />
    <Move name="ember" x={3.1 * cell} y={2.0 * cell} size={cell * 0.6} />
    <Walker name="Squirtle" frame={WEST} x={5.45 * cell} y={2.6 * cell} size={cell * 1.1} />
  </View>
}

// The Safari encounter: a wild Kangaskhan on the far patch of grass and a Safari Ball on its way.
export function SafariArt({ width, height }: Size) {
  const backdrop = height * 960 / 448
  const left = Math.min(0, width - backdrop)
  const wild = height * 0.62
  return <>
    <Image source={safari.battleGrass.source} resizeMode="stretch" fadeDuration={0} accessible={false}
      style={[{ position: 'absolute', left, top: 0, width: backdrop, height }, pixelated]} />
    <At x={left + backdrop * 0.73 - wild / 2} y={height * 0.6 - wild * 0.92}><PixelSprite name="Kangaskhan" size={wild} /></At>
    <At x={width * 0.12} y={height * 0.58}>
      <Image source={require('../../assets/safari/safari-ball.png')} fadeDuration={0} accessible={false}
        style={[{ width: height * 0.3, height: height * 0.3 }, pixelated]} />
    </At>
  </>
}

// Six cards, two turned over as a Normal and Shiny pair.
export function MemoryArt({ width, height }: Size) {
  const gap = 6
  const cardW = Math.min((width - gap * 4) / 3, (height - gap * 3) / 2 * 0.86)
  const cardH = cardW / 0.86
  const faces: Record<number, boolean> = { 1: false, 5: true }
  return <View style={{ width, height, backgroundColor: typeTints.fairy, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: cardW * 3 + gap * 2, flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {Array.from({ length: 6 }, (_, index) => {
        const shiny = faces[index]
        const up = shiny !== undefined
        return <View key={index} style={{ width: cardW, height: cardH, borderRadius: 6, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          backgroundColor: up ? '#FFFFFF' : '#D9483B', borderWidth: 2, borderColor: up ? '#F2B630' : '#7A1F1A' }}>
          {up ? <PixelSprite name="Pikachu" shiny={shiny} size={cardW * 1.3} /> : <PokeballIcon size={cardW * 0.5} color="#FFFFFF" />}
        </View>
      })}
    </View>
  </View>
}

// The quiz's silhouette, framed by question marks.
export function QuizArt({ width, height }: Size) {
  const mark = { position: 'absolute' as const, fontFamily: displayFont(), color: '#FFFFFF', fontSize: height * 0.34 }
  return <View style={{ width, height, backgroundColor: '#4F8FDB', alignItems: 'center', justifyContent: 'center' }}>
    <PixelSprite name="Pikachu" size={height * 1.15} tint="#13213A" />
    <Text accessible={false} style={[mark, { left: width * 0.1, top: height * 0.12, transform: [{ rotate: '-12deg' }] }]}>?</Text>
    <Text accessible={false} style={[mark, { right: width * 0.1, bottom: height * 0.1, fontSize: height * 0.26, transform: [{ rotate: '10deg' }] }]}>?</Text>
  </View>
}
