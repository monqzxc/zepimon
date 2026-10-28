import { memo } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { pokemonType, spriteSource } from './catalog'
import { Sprite } from './Sprite'

type Scenery = 'forest' | 'coast' | 'volcano' | 'meadow' | 'snow' | 'desert' | 'mountain' | 'night' | 'crystal' | 'ruins' | 'marsh'
type HabitatTheme = {
  label: string, scenery: Scenery, sky: string, haze: string, far: string,
  near: string, ground: string, edge: string, accent: string, platform: string
}

// Landscapes use the catalog's primary type; both color variants share a home.
const themes: Record<string, HabitatTheme> = {
  normal: { label: 'Sunlit meadow', scenery: 'meadow', sky: '#76b9c7', haze: '#b9daba', far: '#568a78', near: '#38745d', ground: '#44764a', edge: '#8ebc68', accent: '#f5db8b', platform: '#a0b96f' },
  grass: { label: 'Forest glade', scenery: 'forest', sky: '#285b66', haze: '#5d9685', far: '#326b60', near: '#184c42', ground: '#24583d', edge: '#72a96b', accent: '#e7cd85', platform: '#89aa63' },
  bug: { label: 'Leafy grove', scenery: 'forest', sky: '#386c66', haze: '#81ac83', far: '#547b4d', near: '#304d38', ground: '#456538', edge: '#9dbd63', accent: '#f2d995', platform: '#a5b878' },
  fire: { label: 'Ember trail', scenery: 'volcano', sky: '#583f56', haze: '#bc735d', far: '#79474b', near: '#492f3e', ground: '#49383e', edge: '#c77b50', accent: '#ffce7c', platform: '#98644f' },
  water: { label: 'Quiet coast', scenery: 'coast', sky: '#548db8', haze: '#b2dbd5', far: '#437b97', near: '#296b87', ground: '#358e9d', edge: '#9dd7cf', accent: '#e7eed3', platform: '#d9c68e' },
  electric: { label: 'Spark meadow', scenery: 'meadow', sky: '#648f9e', haze: '#d4d6a0', far: '#728764', near: '#4e7253', ground: '#637a42', edge: '#bacb66', accent: '#fff1a3', platform: '#c1bf70' },
  ice: { label: 'Snowy peaks', scenery: 'snow', sky: '#658cac', haze: '#c3dce1', far: '#7eacc0', near: '#507f9e', ground: '#92b9c7', edge: '#e1f1e9', accent: '#f6fbef', platform: '#d5e8df' },
  fighting: { label: 'Training ridge', scenery: 'mountain', sky: '#8c817e', haze: '#d7b995', far: '#9c7864', near: '#665353', ground: '#72644e', edge: '#c09c70', accent: '#f5d9a3', platform: '#b6a27b' },
  poison: { label: 'Misty marsh', scenery: 'marsh', sky: '#494961', haze: '#8c829f', far: '#66657b', near: '#3b4653', ground: '#4b5861', edge: '#88a991', accent: '#d3a6de', platform: '#8c9a7a' },
  ground: { label: 'Dune trail', scenery: 'desert', sky: '#878c9c', haze: '#e1c6a0', far: '#c49875', near: '#94705a', ground: '#b08d64', edge: '#e6c992', accent: '#fff0b9', platform: '#ddbd83' },
  flying: { label: 'Cloud summit', scenery: 'mountain', sky: '#5c96c0', haze: '#c8e6e4', far: '#729eaf', near: '#4d788d', ground: '#65867a', edge: '#b1ceb0', accent: '#f1f4d7', platform: '#bdd0a7' },
  psychic: { label: 'Starlit crystals', scenery: 'crystal', sky: '#3c365f', haze: '#7c6296', far: '#63507e', near: '#433b65', ground: '#59466b', edge: '#ad88b1', accent: '#f2c3e5', platform: '#a98caa' },
  rock: { label: 'Stone canyon', scenery: 'mountain', sky: '#728b98', haze: '#c8bba3', far: '#9b8a76', near: '#6a675e', ground: '#7d775b', edge: '#b8ac7f', accent: '#e6d9a4', platform: '#b3a882' },
  ghost: { label: 'Moonlit woods', scenery: 'night', sky: '#252d50', haze: '#575d80', far: '#414967', near: '#252f4b', ground: '#343d52', edge: '#747d9c', accent: '#ded7ac', platform: '#78819b' },
  dragon: { label: 'Dragon highlands', scenery: 'mountain', sky: '#384f7a', haze: '#8ca8bb', far: '#576f8e', near: '#354b6d', ground: '#3f6565', edge: '#91b4a0', accent: '#e6d8b0', platform: '#96ac8a' },
  dark: { label: 'Twilight grove', scenery: 'night', sky: '#242f48', haze: '#576880', far: '#3e506a', near: '#25374b', ground: '#304b4b', edge: '#76958d', accent: '#e9d7a2', platform: '#7d9786' },
  steel: { label: 'Ancient ruins', scenery: 'ruins', sky: '#4a6576', haze: '#a4b8b5', far: '#6b8690', near: '#455f6b', ground: '#506663', edge: '#9cae9b', accent: '#d3ded0', platform: '#a4b4a4' },
  fairy: { label: 'Blossom glade', scenery: 'forest', sky: '#7c719c', haze: '#c3a7bf', far: '#aa84ac', near: '#785d8c', ground: '#61785e', edge: '#b1c58d', accent: '#ffe0d4', platform: '#c7bf94' }
}

export function habitatTheme(name: string): HabitatTheme {
  if (name.replace(/^Shiny /, '') === 'Egg') return { ...themes.normal, label: 'Hatching meadow' }
  return typeTheme(pokemonType(name))
}

// Game fields borrow the same landscape colors by type.
export function typeTheme(type: string): HabitatTheme {
  return themes[type] || themes.normal
}

// Small native rectangles keep the pixel scenery offline without image packs or animation timers.
type Tile = [x: number, y: number, width: number, height: number, color: string]
function landscape(t: HabitatTheme, platform: boolean): Tile[] {
  const tiles: Tile[] = [[0, 34, 100, 40, t.haze]]
  const block = (x: number, y: number, w: number, h: number, color: string) => tiles.push([x, y, w, h, color])
  function peak(x: number, y: number, w: number, h: number, color: string) {
    for (let i = 0; i < 5; i++) block(x + w * (4 - i) / 10, y + h * i / 5, w * (i + 1) / 5, h / 5 + 0.5, color)
  }
  function tree(x: number, y: number) {
    block(x + 5, y + 18, 3, 15, t.near)
    block(x + 3, y, 8, 7, t.edge)
    block(x, y + 6, 14, 11, t.near)
    block(x + 2, y + 16, 11, 6, t.near)
    block(x + 2, y + 7, 5, 3, t.far)
  }
  const night = ['night', 'crystal', 'marsh'].includes(t.scenery)
  block(77, 12, 10, 13, t.accent)
  block(75, 15, 14, 7, t.accent)
  if (night) {
    block(81, 10, 9, 11, t.sky)
    for (const [x, y] of [[14, 14], [34, 24], [60, 10], [91, 35]]) block(x, y, 1, 2, t.accent)
  } else {
    block(8, 22, 22, 3, '#e1eddf')
    block(12, 18, 10, 4, '#e1eddf')
    block(54, 30, 14, 3, '#e1eddf')
  }
  peak(-6, 38, 58, 36, t.far)
  peak(48, 31, 64, 43, t.far)
  peak(66, 47, 41, 27, t.near)
  if (t.scenery === 'snow') {
    peak(71, 31, 18, 12, t.accent)
    peak(14, 38, 18, 10, t.accent)
  }
  block(0, 72, 100, 28, t.ground)
  block(0, 72, 100, 3, t.edge)
  if (['forest', 'meadow', 'night', 'marsh'].includes(t.scenery)) {
    tree(3, 39)
    tree(84, 43)
    if (t.scenery === 'forest') { tree(-7, 26); tree(92, 28) }
    for (const x of [6, 20, 77, 92]) {
      block(x, 85, 2, 7, t.edge)
      block(x - 2, 87, 6, 2, t.edge)
      block(x - 1, 84, 2, 2, t.accent)
    }
  }
  if (t.scenery === 'coast' || t.scenery === 'marsh') {
    for (const [x, y, w] of [[5, 79, 22], [72, 82, 24], [12, 94, 13], [78, 97, 14]]) block(x, y, w, 1.5, t.edge)
  }
  if (t.scenery === 'volcano') {
    peak(3, 42, 29, 30, t.near)
    block(15, 42, 6, 3, t.accent)
    for (const [x, y, w] of [[7, 79, 14], [13, 82, 13], [74, 90, 17], [70, 93, 10]]) block(x, y, w, 2, '#efaa6a')
    block(17, 24, 4, 4, t.haze)
    block(20, 18, 6, 3, t.haze)
  }
  if (t.scenery === 'crystal' || t.scenery === 'ruins') {
    for (const [x, y] of [[9, 49], [83, 43]]) {
      block(x, y, 7, 30, t.far)
      block(x, y, 2, 30, t.edge)
      block(x - 2, y, 11, 3, t.accent)
      block(x - 3, 78, 13, 3, t.near)
      if (t.scenery === 'crystal') block(x + 8, y + 14, 4, 16, t.accent)
    }
  }
  if (['desert', 'mountain', 'snow'].includes(t.scenery)) {
    for (const [x, y] of [[9, 81], [80, 88], [19, 96]]) {
      block(x, y, 10, 3, t.near)
      block(x + 2, y - 3, 6, 3, t.edge)
    }
  }
  if (platform) {
    block(25, 87, 50, 8, t.platform)
    block(30, 84, 40, 3, t.platform)
    block(30, 95, 40, 2, t.near)
  }
  return tiles
}

// The landscape filling its parent. The share image (src/ShareCard.tsx) leaves out the stand the Pokemon sits on.
export const Backdrop = memo(function Backdrop({ theme, platform = true }: { theme: HabitatTheme, platform?: boolean }) {
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    {landscape(theme, platform).map(([x, y, w, h, color], i) => <View key={i} style={{ position: 'absolute',
      left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, backgroundColor: color }} />)}
    {platform && <View style={sceneStyles.shadow} />}
  </View>
})

export function HabitatScene({ name, shiny = false, compact = false, discovery = 'revealed' }: { name: string, shiny?: boolean, compact?: boolean, discovery?: 'hidden' | 'silhouette' | 'revealed' }) {
  const theme = habitatTheme(name)
  return <View testID={`habitat-${pokemonType(name)}`} style={[sceneStyles.frame, { height: compact ? 144 : 224, backgroundColor: theme.sky }]}>
    <Backdrop theme={theme} />
    <View style={sceneStyles.pokemon}>
      {discovery === 'hidden' ? <Text accessibilityLabel="An unknown presence" style={{ color: '#ffe08d', fontSize: 72, lineHeight: 84, fontFamily: 'Nunito_900Black', textAlign: 'center' }}>?</Text> :
        discovery === 'silhouette' ? <Image source={spriteSource(name)} accessibilityLabel="A mysterious Pokemon silhouette" resizeMode="contain"
          style={{ width: compact ? 88 : 132, height: compact ? 88 : 132, tintColor: '#081829' }} /> :
          <Sprite name={name} shiny={shiny} size={compact ? 88 : 132} />}
    </View>
  </View>
}

const sceneStyles = StyleSheet.create({
  frame: { width: '100%', overflow: 'hidden', borderRadius: 16 },
  pokemon: { position: 'absolute', bottom: '7%', alignSelf: 'center' },
  shadow: { position: 'absolute', left: '38%', top: '89%', width: '24%', height: '4%', backgroundColor: '#12263c50', borderRadius: 20 }
})
