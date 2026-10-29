import { useMemo, useState } from 'react'
import { useJournal } from '../../store'
import { MemoryMatch } from '../../MemoryMatch'
import { Image, Text, View } from 'react-native'
import { BerryCatch, BerryIcon } from '../../games/BerryCatch'
import { PokemonQuiz } from '../../games/PokemonQuiz'
import type { ArcadeGame } from '../../games/scores'
import { spriteSource } from '../../catalog'
import { Button, Copy, Eyebrow, Hero, IconBubble, IconButton, Panel, Screen, Sprite, colors, styles, typeTints, useTheme } from '../../ui'
import { GameScreenContext } from '../../games/fullscreen'
import { useImmersive } from '../../games/useImmersive'
import { DefenseGame, starText } from '../../games/DefenseGame'
import type { BattleResult } from '../../games/DefenseGame'
import { SafariZone } from '../../games/SafariZone'
import { STEPS_PER_KM } from '../../games/safari-zone'
import { AdventureMap, MODE_NAMES, STAR_GOALS } from '../../games/AdventureMap'
import { BALLS_PER_KM, BERRIES_PER_KM, BONUS_KM_CAP, STOPS, freePlaySpec, safariStars, stopUnlocked, walkingBonus } from '../../games/adventure'
import type { Stop } from '../../games/adventure'
import { LEVELS, STAGES, levelUnlocked } from '../../games/levels'
import type { Level } from '../../games/levels'
import { TrailLevels } from '../../games/TrailLevels'
import { ArcadeAchievements } from '../../games/ArcadeAchievements'
import { legendaryAssists, teamChoices } from '../../games/roster'
import type { TeamCard } from '../../games/roster'
import { PixelSprite } from '../../games/TeamPicker'
import { GameGrid } from '../../games/GameGrid'

type Launch = { game: 'guard' | 'trail' | 'safari', stop?: Stop, level?: Level }
type Selected = 'memory' | 'quiz' | 'berries' | 'map' | 'levels' | Launch | null

export default function PlayScreen() {
  useTheme()
  const { dex, buddy, progress, adventure, trailLevels, bestMoves, recordWin, arcadeScores, recordArcadeScore, recordStars, recordLevelStars, recordSafariCatch } = useJournal()
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<Selected>(null)
  // The team last used in Trail Defense, so moving from level to level keeps it.
  const [trailTeam, setTrailTeam] = useState<TeamCard[]>()
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
  const levelStars = LEVELS.reduce((sum, level) => sum + (trailLevels[level.id] || 0), 0)
  const levelsCleared = LEVELS.filter(level => trailLevels[level.id]).length
  const nextLevel = LEVELS.find((level, index) => levelUnlocked(trailLevels, index) && !trailLevels[level.id])
  const berriesNote = bonus.km ? `Walking bonus: ${bonus.km} km this week adds ◉ ${bonus.berries} starting berries.`
    : `Walk 1 km this week for ◉ ${BERRIES_PER_KM} extra starting berries (up to ◉ ${BERRIES_PER_KM * BONUS_KM_CAP}).`
  const ballsNote = bonus.km ? `Walking bonus: ${bonus.km} km this week adds ${bonus.balls} Safari Balls and ${bonus.km * STEPS_PER_KM} steps.`
    : `Walk 1 km this week for ${BALLS_PER_KM} extra Safari Balls and ${STEPS_PER_KM} extra steps (up to ${BALLS_PER_KM * BONUS_KM_CAP} balls and ${STEPS_PER_KM * BONUS_KM_CAP} steps).`
  // Full screen is for games, not the menus: it hides the tab bar, the back button and the status bar, and Android's
  // back button leaves full screen first (useImmersive). It stays on from one level to the next until you leave or turn it off.
  const inGame = !!selected && selected !== 'map' && selected !== 'levels'
  const { screen, full: immersive, fill, overlay, setFull } = useImmersive(inGame, 'tabs')
  function select(game: Selected) {
    setMessage(''); setSelected(game)
    if (!game || game === 'map' || game === 'levels') setFull(false)
  }
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
  function saveLevel(level: Level, stars: number) {
    if (!stars) { setMessage(`No star on Level ${level.number} this time. Try another team or strategy!`); return }
    const next = LEVELS[level.number]
    const opened = trailLevels[level.id] ? '' : !next ? ' You cleared every Trail Defense level!'
      : next.stage !== level.stage ? ` Stage ${next.stage + 1}, ${STAGES[next.stage].name}, is now open!` : ` Level ${next.number} is now open!`
    recordLevelStars(level.id, stars).then(() => setMessage(`${starText(stars)} saved for Level ${level.number}.${opened}`))
      .catch(() => setMessage('Could not save your stars. Please try again.'))
  }
  const best = (game: ArcadeGame, unit: string, limit: number) => `Best: ${arcadeScores[game] === undefined ? 'Not set' : `${arcadeScores[game]} / ${limit} ${unit}`}`
  const stopRecord = (stop: Stop) => `Best here: ${starText(adventure[stop.id] || 0)}`
  const safariBest = `Best: ${arcadeScores.safari === undefined ? 'Not set' : `${arcadeScores.safari} caught in one hunt`}`

  return <Screen fill={fill && inGame} full={immersive} edge={overlay}><GameScreenContext.Provider value={screen}>
    {/* A running battle and the Safari Zone's hunt have the full-screen toggle in their own top bar. */}
    {selected ? immersive ? !fill && <View style={{ alignItems: 'flex-end' }}>
      <IconButton name="fullscreenExit" label="Exit full screen" onPress={() => setFull(false)} />
    </View> : <View style={[styles.row, { flexWrap: 'nowrap' }]}>
      <View style={{ flex: 1 }}>
        <Button title={launch?.stop ? 'Back to the map' : launch?.game === 'trail' ? 'Back to levels' : 'Back to arcade'} secondary
          onPress={() => select(launch?.stop ? 'map' : launch?.game === 'trail' ? 'levels' : null)} />
      </View>
      {inGame && !fill && <IconButton name="fullscreen" label="Full screen" size={50} onPress={() => setFull(true)} />}
    </View> : <>
      <Hero eyebrow="ZEPIMON · POCKET ARCADE" title="A little trail break.">
        <Copy color={colors.onBrand}>Pick a game. Everything works offline and saves on this phone.</Copy>
      </Hero>
      <GameGrid games={[
        { id: 'map', title: 'Adventure Map', tint: typeTints.flying, logo: <PixelSprite name="Dragonite" size={76} />,
          record: `★ ${totalStars} / ${STOPS.length * 3}`, onPress: () => select('map'),
          about: `Nine stops from Route 1 to Victory Road that mix the battle and hunting games.${nextStop ? ` Next: ${nextStop.title}, ${MODE_NAMES[nextStop.mode]}.` : ''}` },
        { id: 'guard', title: 'Route Guard', tint: typeTints.ground, logo: <PixelSprite name="Snorlax" size={76} />,
          record: best('guard', 'waves', 10), onPress: () => select({ game: 'guard' }),
          about: 'Lane defense: hold five lanes against Shadow Pokemon with berries, Grass and Rock types.' },
        { id: 'trail', title: 'Trail Defense', tint: typeTints.fire, logo: <PixelSprite name="Charizard" size={76} />,
          record: `★ ${levelStars} / ${LEVELS.length * 3}`, onPress: () => select('levels'),
          about: `Tower defense: ${LEVELS.length} levels in ${STAGES.length} stages; ${levelsCleared} cleared.${nextLevel ? ` Next: Level ${nextLevel.number}.` : ''} Evolve your team mid-battle with berries.` },
        { id: 'safari', title: 'Safari Zone', tint: typeTints.grass, logo: <PixelSprite name="Kangaskhan" size={76} />,
          record: `Best: ${arcadeScores.safari === undefined ? 'Not set' : `${arcadeScores.safari} caught`}`, onPress: () => select({ game: 'safari' }),
          about: 'Walk Emerald’s Safari Zone with your buddy and catch Pokemon in the tall grass. Catches join your Dex.' },
        { id: 'memory', title: 'Memory Match', tint: typeTints.fairy, logo: <><Sprite name="Bulbasaur" size={52} /><Sprite name="Bulbasaur" shiny size={52} /></>,
          onPress: () => select('memory'),
          about: 'Find matching Normal and Shiny pairs from your collection. Needs at least two variants.' },
        { id: 'quiz', title: 'Who’s That Pokémon?', tint: typeTints.water,
          logo: <Image source={spriteSource('Pikachu')} resizeMode="contain" accessible={false} style={{ width: 72, height: 72, tintColor: colors.ink }} />,
          record: `Best: ${arcadeScores.quiz === undefined ? 'Not set' : `${arcadeScores.quiz} / 10`}`, onPress: () => select('quiz'),
          about: 'Ten silhouettes, four choices each, from Gen 1 to 4.' },
        { id: 'berries', title: 'Berry Catch', tint: typeTints.bug, logo: <BerryIcon />,
          record: `Best: ${arcadeScores.berries === undefined ? 'Not set' : `${arcadeScores.berries} / 20`}`, onPress: () => select('berries'),
          about: 'A 30-second garden game: tap each ripe berry before it hops away.' }
      ]} />
      <Panel style={{ backgroundColor: colors.mint, borderColor: colors.mintLine }}>
        <View style={[styles.row, { flexWrap: 'nowrap' }]}>
          <IconBubble name="walk" background={colors.panel} />
          <View style={{ flex: 1 }}><Eyebrow>WALKING BONUS · THIS WEEK</Eyebrow><Text style={styles.stat}>{bonus.km} / {BONUS_KM_CAP} km</Text></View>
        </View>
        <Copy color={colors.ink}>{bonus.km ? `+◉ ${bonus.berries} starting berries, +${bonus.balls} Safari Balls and +${bonus.km * STEPS_PER_KM} Safari Zone steps this week.` : 'Every km you walk this week (Monday–Sunday) adds starting berries, Safari Balls and Safari Zone steps.'}</Copy>
        <Copy small>A bonus, never a requirement: every game is fully playable without walking.</Copy>
      </Panel>
      <ArcadeAchievements place="arcade" />
      <Copy small>Every game except Memory Match is available right away. Game points, stars and Safari catches stay on this phone; your walking distance, hatching and watch records come from your watch.</Copy>
    </>}
    {!(immersive && fill) && !!message && <Copy color={colors.gold}>{message}</Copy>}
    {selected === 'map' && <AdventureMap stars={adventure} onPlay={stop => select({ game: stop.mode, stop })} />}
    {selected === 'levels' && <TrailLevels stars={trailLevels} freeBest={best('trail', 'waves', 12)}
      onPlay={level => select({ game: 'trail', level })} onFreePlay={() => select({ game: 'trail' })} />}
    {launch?.level && <LevelGame key={launch.level.id} level={launch.level} stars={trailLevels[launch.level.id] || 0}
      choices={choices} assists={assists} bonus={bonus.berries} bonusNote={berriesNote} team={trailTeam} onStart={setTrailTeam}
      onFinish={result => saveLevel(launch.level!, result.stars)} onNext={next => select({ game: 'trail', level: next })} />}
    {launch && launch.game !== 'safari' && !launch.level && <DefenseGame key={launch.stop?.id ?? launch.game}
      layout={launch.game === 'guard' ? 'lanes' : 'trail'}
      makeSpec={() => launch.stop && launch.stop.mode !== 'safari' ? launch.stop.spec : freePlaySpec(launch.game === 'guard' ? 'lanes' : 'trail')}
      title={launch.stop ? `${launch.stop.title} · ${MODE_NAMES[launch.game]}` : MODE_NAMES[launch.game]}
      intro={launch.stop ? `${launch.stop.blurb} ${STAR_GOALS[launch.game]}` : launch.game === 'guard'
        ? 'Free play: ten waves of Shadow Pokemon of every type, in a random habitat.' : 'Free play: twelve waves of Shadow Pokemon of every type, on a random trail.'}
      choices={choices} assists={assists} bonus={bonus.berries} bonusNote={berriesNote} showStars={!!launch.stop}
      preview={launch.stop?.mode === 'trail' ? launch.stop.spec : undefined}
      initialTeam={launch.game === 'trail' ? trailTeam : undefined} onStart={launch.game === 'trail' ? setTrailTeam : undefined}
      record={launch.stop ? stopRecord(launch.stop) : best(launch.game, 'waves', launch.game === 'guard' ? 10 : 12)}
      onFinish={result => launch.stop ? saveStars(launch.stop, result.stars) : saveScore(launch.game, result.score)} />}
    {launch?.game === 'safari' && <SafariZone key={launch.stop?.id ?? 'safari'} zone={launch.stop?.mode === 'safari' ? launch.stop.zone : undefined}
      bonusKm={bonus.km} bonusNote={ballsNote} dex={dex} goal={launch.stop ? STAR_GOALS.safari : undefined}
      buddy={buddy ? { name: buddy.replace(/^Shiny /, ''), shiny: buddy.startsWith('Shiny ') } : null}
      record={launch.stop ? stopRecord(launch.stop) : safariBest}
      onCatch={recordSafariCatch} onLeave={() => select(launch.stop ? 'map' : null)}
      onComplete={catches => launch.stop ? saveStars(launch.stop, safariStars(catches)) : saveScore('safari', catches)} />}
    {selected === 'memory' && <MemoryMatch entries={entries} bestMoves={bestMoves} onComplete={(pairs, moves) => {
      recordWin(pairs, moves).then(() => setMessage('Your score is saved.')).catch(() => setMessage('Could not save this score. Please try again.'))
    }} />}
    {selected === 'quiz' && <PokemonQuiz best={arcadeScores.quiz} onComplete={score => saveScore('quiz', score)} />}
    {selected === 'berries' && <BerryCatch best={arcadeScores.berries} onComplete={score => saveScore('berries', score)} />}
  </GameScreenContext.Provider></Screen>
}

// One Trail Defense level, with its map preview and a button to the next level after a win.
function LevelGame({ level, stars, choices, assists, bonus, bonusNote, team, onStart, onFinish, onNext }: {
  level: Level, stars: number, choices: TeamCard[], assists: string[], bonus: number, bonusNote: string, team?: TeamCard[],
  onStart: (team: TeamCard[]) => void, onFinish: (result: BattleResult) => void, onNext: (level: Level) => void
}) {
  const next = LEVELS[level.number]
  return <DefenseGame layout="trail" makeSpec={() => level.spec} title={`Level ${level.number} · ${level.name}`}
    intro={`Stage ${level.stage + 1}, ${STAGES[level.stage].name}. ${level.blurb} ${STAR_GOALS.trail}`}
    choices={choices} assists={assists} bonus={bonus} bonusNote={bonusNote} showStars preview={level.spec}
    record={`Best here: ${starText(stars)}`} initialTeam={team} onStart={onStart} onFinish={onFinish}
    next={next ? { title: `Next: Level ${next.number} · ${next.name}`, onPress: () => onNext(next) } : undefined} />
}
