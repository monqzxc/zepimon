import { useMemo, useState } from 'react'
import { useJournal } from '../../store'
import { MemoryMatch } from '../../MemoryMatch'
import { Image, Text, View } from 'react-native'
import { BerryCatch, BerryIcon } from '../../games/BerryCatch'
import { PokemonQuiz } from '../../games/PokemonQuiz'
import type { ArcadeGame } from '../../games/scores'
import { spriteSource } from '../../catalog'
import { Button, Copy, Eyebrow, Heading, Panel, Screen, Sprite, colors, styles } from '../../ui'
import { DefenseGame, starText } from '../../games/DefenseGame'
import { SafariHunt } from '../../games/SafariHunt'
import { AdventureMap, MODE_NAMES, STAR_GOALS } from '../../games/AdventureMap'
import { BALLS_PER_KM, BERRIES_PER_KM, BONUS_KM_CAP, STOPS, freePlaySpec, safariStars, stopUnlocked, walkingBonus } from '../../games/adventure'
import type { Stop } from '../../games/adventure'
import { legendaryAssists, teamChoices } from '../../games/roster'
import { PixelSprite } from '../../games/TeamPicker'

type Launch = { game: 'guard' | 'trail' | 'safari', stop?: Stop }
type Selected = 'memory' | 'quiz' | 'berries' | 'map' | Launch | null

export default function PlayScreen() {
  const { dex, progress, adventure, bestMoves, recordWin, arcadeScores, recordArcadeScore, recordStars, recordSafariCatch } = useJournal()
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<Selected>(null)
  const entries = Object.keys(dex).map(key => ({ key, name: key.replace(/^Shiny /, ''), shiny: key.startsWith('Shiny ') }))
  const dexKeys = Object.keys(dex).sort().join('|')
  // Safari catches (and Expedition friends) did not hatch from a watch egg, so they have no egg move.
  const caughtKeys = Object.keys(dex).filter(key => dex[key].source).sort().join('|')
  const choices = useMemo(() => teamChoices(dexKeys ? dexKeys.split('|') : [], caughtKeys ? caughtKeys.split('|') : []), [dexKeys, caughtKeys])
  const assists = useMemo(() => legendaryAssists(dexKeys ? dexKeys.split('|') : []), [dexKeys])
  const bonus = walkingBonus(progress)
  const launch = selected && typeof selected === 'object' ? selected : null
  const totalStars = STOPS.reduce((sum, stop) => sum + (adventure[stop.id] || 0), 0)
  const nextStop = STOPS.find((stop, index) => stopUnlocked(adventure, index) && !adventure[stop.id])
  const berriesNote = bonus.km ? `Walking bonus: ${bonus.km} km this week adds ◉ ${bonus.berries} starting berries.`
    : `Walk 1 km this week for ◉ ${BERRIES_PER_KM} extra starting berries (up to ◉ ${BERRIES_PER_KM * BONUS_KM_CAP}).`
  const ballsNote = bonus.km ? `Walking bonus: ${bonus.km} km this week adds ${bonus.balls} Safari Balls.`
    : `Walk 1 km this week for ${BALLS_PER_KM} extra Safari Balls (up to ${BALLS_PER_KM * BONUS_KM_CAP}).`
  function select(game: Selected) { setMessage(''); setSelected(game) }
  function saveScore(game: ArcadeGame, score: number) {
    recordArcadeScore(game, score).then(() => setMessage('Your best score is saved on this phone.'))
      .catch(() => setMessage('Could not save this score. Your earlier best is unchanged.'))
  }
  function saveStars(stop: Stop, stars: number) {
    if (!stars) { setMessage(`No star at ${stop.title} this time. Try another team or strategy!`); return }
    const index = STOPS.indexOf(stop)
    recordStars(stop.id, stars).then(() => setMessage(`${starText(stars)} saved for ${stop.title}.${STOPS[index + 1] && !adventure[stop.id] ? ` ${STOPS[index + 1].title} is now open!` : ''}`))
      .catch(() => setMessage('Could not save your stars. Please try again.'))
  }
  const best = (game: ArcadeGame, unit: string, limit: number) => `Best: ${arcadeScores[game] === undefined ? 'Not set' : `${arcadeScores[game]} / ${limit} ${unit}`}`
  const stopRecord = (stop: Stop) => `Best here: ${starText(adventure[stop.id] || 0)}`
  const safariBest = `Best: ${arcadeScores.safari === undefined ? 'Not set' : `${arcadeScores.safari} caught in one hunt`}`

  return <Screen>
    <Eyebrow>ZEPIMON / POCKET ARCADE</Eyebrow>
    {selected ? <Button title={launch?.stop ? 'Back to the map' : 'Back to arcade'} secondary onPress={() => select(launch?.stop ? 'map' : null)} /> : <>
      <Heading>A little trail break.</Heading>
      <Copy>An adventure map, three battle and hunting games, and three quick puzzles. Everything works offline and saves on this phone.</Copy>
      <Panel style={{ borderColor: colors.gold }}>
        <Eyebrow>WALKING BONUS / THIS WEEK</Eyebrow>
        <Text style={styles.stat}>{bonus.km} / {BONUS_KM_CAP} km</Text>
        <Copy>{bonus.km ? `+◉ ${bonus.berries} starting berries and +${bonus.balls} Safari Balls in every game this week.` : 'Every km you walk this week (Monday–Sunday) adds starting berries and Safari Balls.'}</Copy>
        <Copy small>A bonus, never a requirement: every game is fully playable without walking.</Copy>
      </Panel>
      <Panel>
        <Eyebrow>01 / ADVENTURE MAP</Eyebrow>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>{['Pidgey', 'Geodude', 'Clefairy', 'Gastly', 'Dragonite'].map(name =>
          <PixelSprite key={name} name={name} size={56} />)}</View>
        <Heading>From Route 1 to Victory Road</Heading>
        <Copy>Nine stops that mix all three new games. Earn stars to open the trail ahead.</Copy>
        <Copy small color={colors.gold}>★ {totalStars} / {STOPS.length * 3}{nextStop ? ` · Next: ${nextStop.title} (${MODE_NAMES[nextStop.mode]})` : ''}</Copy>
        <Button title="Open the Adventure Map" onPress={() => select('map')} />
      </Panel>
      <Panel style={{ borderColor: '#d9b77a' }}>
        <Eyebrow>02 / LANE DEFENSE</Eyebrow>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>{['Bulbasaur', 'Charmander', 'Geodude', 'Snorlax'].map(name =>
          <PixelSprite key={name} name={name} size={64} />)}</View>
        <Heading>Route Guard</Heading>
        <Copy>Shadow Pokemon march down five lanes. Grow berries with Grass types, block with Rock types, and hold the line. Snorlax naps at the end of every lane.</Copy>
        <Copy small color={colors.gold}>{best('guard', 'waves', 10)}</Copy>
        <Button title="Play Route Guard" onPress={() => select({ game: 'guard' })} />
      </Panel>
      <Panel style={{ borderColor: '#ff8a3d' }}>
        <Eyebrow>03 / TOWER DEFENSE</Eyebrow>
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 4 }}>{[['Charmander', 48], ['Charmeleon', 60], ['Charizard', 76]].map(([name, size]) =>
          <PixelSprite key={name} name={name as string} size={size as number} />)}</View>
        <Heading>Trail Defense</Heading>
        <Copy>Build a team beside a winding trail and evolve them mid-battle with berries. Pokemon hatched on your watch bring their egg moves.</Copy>
        <Copy small color={colors.gold}>{best('trail', 'waves', 12)}</Copy>
        <Button title="Play Trail Defense" onPress={() => select({ game: 'trail' })} />
      </Panel>
      <Panel style={{ borderColor: '#79b977', backgroundColor: '#12392e' }}>
        <Eyebrow>04 / HUNTING</Eyebrow>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>{['Pidgey', 'Pikachu', 'Oddish'].map(name =>
          <PixelSprite key={name} name={name} size={64} />)}</View>
        <Heading>Safari Hunt</Heading>
        <Copy>Tap rustling grass, time your throw on the shrinking ring, and chain catches for a better Shiny chance. Catches join your Dex.</Copy>
        <Copy small color={colors.gold}>{safariBest}</Copy>
        <Button title="Play Safari Hunt" onPress={() => select({ game: 'safari' })} />
      </Panel>
      <Panel>
        <Eyebrow>05 / PAIRS & PATIENCE</Eyebrow>
        <View style={{ flexDirection: 'row', justifyContent: 'center' }}><Sprite name="Bulbasaur" size={88} /><Sprite name="Bulbasaur" shiny size={88} /></View>
        <Heading>Memory Match</Heading>
        <Copy>Find matching Normal and Shiny pairs from your collection. Import or catch at least two variants to play.</Copy>
        <Button title="Play Memory Match" onPress={() => select('memory')} />
      </Panel>
      <Panel>
        <Eyebrow>06 / FIELD RESEARCH</Eyebrow>
        <Image source={spriteSource('Pikachu')} resizeMode="contain" accessibilityLabel="Mystery Pokemon silhouette"
          style={{ width: 144, height: 144, alignSelf: 'center', tintColor: colors.ink }} />
        <Heading>Who’s That Pokémon?</Heading>
        <Copy>Ten silhouettes. Four choices. How well do you know Gen 1–4?</Copy>
        <Copy small color={colors.gold}>Best: {arcadeScores.quiz === undefined ? 'Not set' : `${arcadeScores.quiz} / 10`}</Copy>
        <Button title="Play Pokemon Quiz" onPress={() => select('quiz')} />
      </Panel>
      <Panel style={{ borderColor: '#79b977', backgroundColor: '#12392e' }}>
        <Eyebrow>07 / GARDEN DASH</Eyebrow>
        <View style={{ height: 104, alignItems: 'center', justifyContent: 'center' }}><BerryIcon /></View>
        <Heading>Berry Catch</Heading>
        <Copy>A 30-second garden game. Tap each ripe berry before it hops to another patch.</Copy>
        <Copy small color={colors.gold}>Best: {arcadeScores.berries === undefined ? 'Not set' : `${arcadeScores.berries} / 20`}</Copy>
        <Button title="Play Berry Catch" onPress={() => select('berries')} />
      </Panel>
      <Copy small>Every game except Memory Match is available right away. Game points, stars and Safari catches stay on this phone; your walking distance, hatching and watch records come from your watch.</Copy>
    </>}
    {!!message && <Copy color={colors.gold}>{message}</Copy>}
    {selected === 'map' && <AdventureMap stars={adventure} onPlay={stop => select({ game: stop.mode, stop })} />}
    {launch && launch.game !== 'safari' && <DefenseGame key={launch.stop?.id ?? launch.game}
      layout={launch.game === 'guard' ? 'lanes' : 'trail'}
      makeSpec={() => launch.stop && launch.stop.mode !== 'safari' ? launch.stop.spec : freePlaySpec(launch.game === 'guard' ? 'lanes' : 'trail')}
      title={launch.stop ? `${launch.stop.title} · ${MODE_NAMES[launch.game]}` : MODE_NAMES[launch.game]}
      intro={launch.stop ? `${launch.stop.blurb} ${STAR_GOALS[launch.game]}` : launch.game === 'guard'
        ? 'Free play: ten waves of Shadow Pokemon of every type, in a random habitat.' : 'Free play: twelve waves of Shadow Pokemon of every type, on a random trail.'}
      choices={choices} assists={assists} bonus={bonus.berries} bonusNote={berriesNote} showStars={!!launch.stop}
      record={launch.stop ? stopRecord(launch.stop) : best(launch.game, 'waves', launch.game === 'guard' ? 10 : 12)}
      onFinish={result => launch.stop ? saveStars(launch.stop, result.stars) : saveScore(launch.game, result.score)} />}
    {launch?.game === 'safari' && <SafariHunt key={launch.stop?.id ?? 'safari'} zone={launch.stop?.mode === 'safari' ? launch.stop.zone : undefined}
      bonusBalls={bonus.balls} bonusNote={ballsNote} dex={dex} goal={launch.stop ? STAR_GOALS.safari : undefined}
      record={launch.stop ? stopRecord(launch.stop) : safariBest}
      onCatch={recordSafariCatch}
      onComplete={catches => launch.stop ? saveStars(launch.stop, safariStars(catches)) : saveScore('safari', catches)} />}
    {selected === 'memory' && <MemoryMatch entries={entries} bestMoves={bestMoves} onComplete={(pairs, moves) => {
      recordWin(pairs, moves).then(() => setMessage('Your score is saved.')).catch(() => setMessage('Could not save this score. Please try again.'))
    }} />}
    {selected === 'quiz' && <PokemonQuiz best={arcadeScores.quiz} onComplete={score => saveScore('quiz', score)} />}
    {selected === 'berries' && <BerryCatch best={arcadeScores.berries} onComplete={score => saveScore('berries', score)} />}
  </Screen>
}
