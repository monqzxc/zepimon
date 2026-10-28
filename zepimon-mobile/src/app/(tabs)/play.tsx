import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { useNavigation } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useJournal } from '../../store'
import { MemoryMatch } from '../../MemoryMatch'
import { BackHandler, Image, Text, View } from 'react-native'
import { BerryCatch, BerryIcon } from '../../games/BerryCatch'
import { PokemonQuiz } from '../../games/PokemonQuiz'
import type { ArcadeGame } from '../../games/scores'
import { spriteSource } from '../../catalog'
import { Button, Copy, Eyebrow, Hero, IconBubble, IconButton, Panel, Screen, Sprite, Title, colors, styles, typeTints, useTheme } from '../../ui'
import { GameScreenContext } from '../../games/fullscreen'
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
  // back button leaves full screen first. It stays on from one level to the next until you leave or turn it off.
  const [full, setFull] = useState(false)
  const [fill, setFill] = useState(false)
  const screen = useMemo(() => ({ full, setFull, setFill }), [full])
  const inGame = !!selected && selected !== 'map' && selected !== 'levels'
  const immersive = full && inGame
  const navigation = useNavigation()
  useEffect(() => { navigation.setOptions({ tabBarStyle: immersive ? { display: 'none' } : undefined }) }, [navigation, immersive])
  useEffect(() => {
    if (!immersive) return
    const back = BackHandler.addEventListener('hardwareBackPress', () => { setFull(false); return true })
    return () => back.remove()
  }, [immersive])
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

  return <Screen fill={fill && inGame} full={immersive}><GameScreenContext.Provider value={screen}>
    {immersive && <StatusBar hidden />}
    {/* A running battle has the full-screen toggle in its own top bar. */}
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
        <Copy color={colors.onBrand}>An adventure map, three battle and hunting games, and three quick puzzles. Everything works offline and saves on this phone.</Copy>
      </Hero>
      <Panel style={{ backgroundColor: colors.mint, borderColor: colors.mintLine }}>
        <View style={[styles.row, { flexWrap: 'nowrap' }]}>
          <IconBubble name="walk" background={colors.panel} />
          <View style={{ flex: 1 }}><Eyebrow>WALKING BONUS · THIS WEEK</Eyebrow><Text style={styles.stat}>{bonus.km} / {BONUS_KM_CAP} km</Text></View>
        </View>
        <Copy color={colors.ink}>{bonus.km ? `+◉ ${bonus.berries} starting berries, +${bonus.balls} Safari Balls and +${bonus.km * STEPS_PER_KM} Safari Zone steps this week.` : 'Every km you walk this week (Monday–Sunday) adds starting berries, Safari Balls and Safari Zone steps.'}</Copy>
        <Copy small>A bonus, never a requirement: every game is fully playable without walking.</Copy>
      </Panel>
      <ArcadeAchievements place="arcade" />
      <GameCard tint={typeTints.flying} eyebrow="01 · ADVENTURE MAP" title="From Route 1 to Victory Road"
        art={['Pidgey', 'Geodude', 'Clefairy', 'Gastly', 'Dragonite'].map(name => <PixelSprite key={name} name={name} size={56} />)}
        text="Nine stops that mix all three new games. Earn stars to open the trail ahead."
        record={`★ ${totalStars} / ${STOPS.length * 3}${nextStop ? ` · Next: ${nextStop.title} (${MODE_NAMES[nextStop.mode]})` : ''}`}
        action="Open the Adventure Map" onPress={() => select('map')} />
      <GameCard tint={typeTints.ground} eyebrow="02 · LANE DEFENSE" title="Route Guard"
        art={['Bulbasaur', 'Charmander', 'Geodude', 'Snorlax'].map(name => <PixelSprite key={name} name={name} size={64} />)}
        text="Shadow Pokemon march down five lanes. Grow berries with Grass types, block with Rock types, and hold the line. Snorlax naps at the end of every lane."
        record={best('guard', 'waves', 10)} action="Play Route Guard" onPress={() => select({ game: 'guard' })} />
      <GameCard tint={typeTints.fire} eyebrow="03 · TOWER DEFENSE" title="Trail Defense"
        art={([['Charmander', 48], ['Charmeleon', 60], ['Charizard', 76]] as const).map(([name, size]) => <PixelSprite key={name} name={name} size={size} />)}
        text={`${LEVELS.length} levels in ${STAGES.length} stages, on maps that keep getting bigger. Build a team beside a winding trail and evolve them mid-battle with berries. Pokemon hatched on your watch bring their egg moves.`}
        record={`★ ${levelStars} / ${LEVELS.length * 3} · ${levelsCleared} / ${LEVELS.length} levels cleared${nextLevel ? ` · Next: Level ${nextLevel.number}` : ''}`}
        action="Play Trail Defense" onPress={() => select('levels')} />
      <GameCard tint={typeTints.grass} eyebrow="04 · HUNTING" title="Safari Zone"
        art={['Pidgey', 'Pikachu', 'Oddish'].map(name => <PixelSprite key={name} name={name} size={64} />)}
        text="Walk Emerald’s Safari Zone with your buddy. Step into tall grass, time your throw on the shrinking ring, and chain catches for a better Shiny chance. Catches join your Dex."
        record={safariBest} action="Enter the Safari Zone" onPress={() => select({ game: 'safari' })} />
      <GameCard tint={typeTints.fairy} eyebrow="05 · PAIRS & PATIENCE" title="Memory Match"
        art={<><Sprite name="Bulbasaur" size={80} /><Sprite name="Bulbasaur" shiny size={80} /></>}
        text="Find matching Normal and Shiny pairs from your collection. Import or catch at least two variants to play."
        action="Play Memory Match" onPress={() => select('memory')} />
      <GameCard tint={typeTints.water} eyebrow="06 · FIELD RESEARCH" title="Who’s That Pokémon?"
        art={<Image source={spriteSource('Pikachu')} resizeMode="contain" accessibilityLabel="Mystery Pokemon silhouette"
          style={{ width: 120, height: 120, tintColor: colors.ink }} />}
        text="Ten silhouettes. Four choices. How well do you know Gen 1–4?"
        record={`Best: ${arcadeScores.quiz === undefined ? 'Not set' : `${arcadeScores.quiz} / 10`}`} action="Play Pokemon Quiz" onPress={() => select('quiz')} />
      <GameCard tint={typeTints.bug} eyebrow="07 · GARDEN DASH" title="Berry Catch"
        art={<View style={{ height: 88, justifyContent: 'center' }}><BerryIcon /></View>}
        text="A 30-second garden game. Tap each ripe berry before it hops to another patch."
        record={`Best: ${arcadeScores.berries === undefined ? 'Not set' : `${arcadeScores.berries} / 20`}`} action="Play Berry Catch" onPress={() => select('berries')} />
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
      onCatch={recordSafariCatch}
      onComplete={catches => launch.stop ? saveStars(launch.stop, safariStars(catches)) : saveScore('safari', catches)} />}
    {selected === 'memory' && <MemoryMatch entries={entries} bestMoves={bestMoves} onComplete={(pairs, moves) => {
      recordWin(pairs, moves).then(() => setMessage('Your score is saved.')).catch(() => setMessage('Could not save this score. Please try again.'))
    }} />}
    {selected === 'quiz' && <PokemonQuiz best={arcadeScores.quiz} onComplete={score => saveScore('quiz', score)} />}
    {selected === 'berries' && <BerryCatch best={arcadeScores.berries} onComplete={score => saveScore('berries', score)} />}
  </GameScreenContext.Provider></Screen>
}

// An arcade menu card: artwork on a pastel strip, then the game's name, pitch, best result and play button.
function GameCard({ tint, eyebrow, title, art, text, record, action, onPress }: {
  tint: string, eyebrow: string, title: string, art: React.ReactNode, text: string, record?: string, action: string, onPress: () => void
}) {
  return <Panel>
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 4, paddingVertical: 12, borderRadius: 16, backgroundColor: tint }}>{art}</View>
    <Eyebrow>{eyebrow}</Eyebrow>
    <Title>{title}</Title>
    <Copy>{text}</Copy>
    {!!record && <Copy small color={colors.gold}>{record}</Copy>}
    <Button title={action} onPress={onPress} />
  </Panel>
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
