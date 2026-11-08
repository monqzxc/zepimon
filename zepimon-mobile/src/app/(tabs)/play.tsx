import { useMemo, useState } from 'react'
import { useJournal } from '../../store'
import { MemoryMatch } from '../../MemoryMatch'
import { Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import { BerryCatch, BerryIcon } from '../../games/BerryCatch'
import { PokemonQuiz } from '../../games/PokemonQuiz'
import type { ArcadeGame } from '../../games/scores'
import { Button, Copy, Icon, IconButton, PokeballIcon, Screen, colors, displayFont, fonts, retro, styles, themedStyles, useTheme } from '../../ui'
import { GameScreenContext } from '../../games/fullscreen'
import { useImmersive } from '../../games/useImmersive'
import { DefenseGame, starText } from '../../games/DefenseGame'
import type { BattleResult } from '../../games/DefenseGame'
import { SafariZone } from '../../games/SafariZone'
import { STEPS_PER_KM } from '../../games/safari-zone'
import { AdventureMap, MODE_NAMES, STAR_GOALS } from '../../games/AdventureMap'
import { BALLS_PER_KM, BONUS_KM_CAP, STOPS, freePlaySpec, safariStars, stopUnlocked, walkingBonus } from '../../games/adventure'
import type { Stop } from '../../games/adventure'
import { LEVELS, STAGES, levelUnlocked } from '../../games/levels'
import type { Level } from '../../games/levels'
import { TrailLevels } from '../../games/TrailLevels'
import { ArcadeAchievements } from '../../games/ArcadeAchievements'
import { legendaryAssists, teamChoices } from '../../games/roster'
import type { TeamCard } from '../../games/roster'
import { PixelSprite } from '../../games/TeamPicker'
import { GameGrid, MiniGames } from '../../games/GameGrid'
import { AdventureArt, MemoryArt, QuizArt, RouteGuardArt, SafariArt, TrailArt } from '../../games/GameArt'
import { OverworldSprite } from '../../games/OverworldSprite'
import { legendaryPoints } from '../../games/achievements'

type Launch = { game: 'guard' | 'trail' | 'safari', stop?: Stop, level?: Level }
type Selected = 'memory' | 'quiz' | 'berries' | 'map' | 'levels' | Launch | null

export default function PlayScreen() {
  useTheme()
  const { dex, buddy, progress, adventure, trailLevels, bestMoves, recordWin, arcadeScores, recordArcadeScore, recordStars, recordLevelStars, recordSafariCatch,
    trialRecords, safari, phoneRuns } = useJournal()
  const [message, setMessage] = useState('')
  const [view, setView] = useState<'games' | 'achievements'>('games')
  const [bonusOpen, setBonusOpen] = useState(false)
  const points = useMemo(() => legendaryPoints({ arcadeScores, bestMoves, adventure, trailLevels, trialRecords, safari, progress, phoneRuns }).total,
    [arcadeScores, bestMoves, adventure, trailLevels, trialRecords, safari, progress, phoneRuns])
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
  // The cards show a best only once there is one.
  const shortBest = (game: ArcadeGame, limit: number) => arcadeScores[game] === undefined ? undefined : `Best ${arcadeScores[game]} / ${limit}`
  const stopRecord = (stop: Stop) => `Best here: ${starText(adventure[stop.id] || 0)}`
  const safariBest = `Best: ${arcadeScores.safari === undefined ? 'Not set' : `${arcadeScores.safari} caught in one hunt`}`

  return <Screen fill={fill && inGame} full={immersive} edge={overlay}><GameScreenContext.Provider value={screen}>
    {/* A running battle and the Safari Zone's hunt have the full-screen toggle in their own top bar. */}
    {selected ? immersive ? !fill && <View style={{ alignItems: 'flex-end' }}>
      <IconButton name="fullscreenExit" label="Exit full screen" onPress={() => setFull(false)} />
    </View> : <View style={[styles.row, { flexWrap: 'nowrap' }]}>
      <View style={{ flex: 1 }}>
        <Button title={launch?.stop ? 'Back to the map' : launch?.game === 'trail' ? 'Back to levels' : 'Back to games'} secondary
          onPress={() => select(launch?.stop ? 'map' : launch?.game === 'trail' ? 'levels' : null)} />
      </View>
      {inGame && !fill && <IconButton name="fullscreen" label="Full screen" size={50} onPress={() => setFull(true)} />}
    </View> : <>
      <View style={look.header}>
        <PokeballIcon size={30} color={colors.ink} />
        <Text accessibilityRole="header" style={look.headerTitle}>Games</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${points} Legendary points. Show achievements`} hitSlop={4}
          onPress={() => setView('achievements')} style={({ pressed }) => [look.points, { opacity: pressed ? 0.8 : 1 }]}>
          <Icon name="star" size={18} color={colors.star} />
          <Text style={look.pointsText}>{points}</Text>
          <Icon name="chevron" size={18} color={colors.muted} />
        </Pressable>
      </View>
      <View accessibilityRole="tablist" style={look.tabs}>
        {([['games', 'Games', 'play'], ['achievements', 'Achievements', 'trophy']] as const).map(([id, label, icon]) => {
          const on = view === id
          return <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setView(id)}
            style={({ pressed }) => [look.tab, on && look.tabOn, { opacity: pressed && !on ? 0.75 : 1 }]}>
            <Icon name={icon} size={20} color={on ? colors.onEdge : colors.muted} />
            <Text style={[look.tabText, on && { color: colors.onEdge }]}>{label}</Text>
          </Pressable>
        })}
      </View>
      {view === 'games' ? <>
        <GameGrid games={[
          { id: 'map', title: 'Adventure Map', art: size => <AdventureArt {...size} />,
            record: `★ ${totalStars} / ${STOPS.length * 3}`, onPress: () => select('map'),
            about: `Nine stops from Route 1 to Victory Road that mix the battle and hunting games.${nextStop ? ` Next: ${nextStop.title}, ${MODE_NAMES[nextStop.mode]}.` : ''}` },
          { id: 'guard', title: 'Route Guard', art: size => <RouteGuardArt {...size} />,
            record: shortBest('guard', 10), onPress: () => select({ game: 'guard' }),
            about: 'Lane defense: hold five lanes against Shadow Pokemon with berries, Grass and Rock types.' },
          { id: 'trail', title: 'Trail Defense', art: size => <TrailArt {...size} />,
            record: `★ ${levelStars} / ${LEVELS.length * 3}`, onPress: () => select('levels'),
            about: `Tower defense: ${LEVELS.length} levels in ${STAGES.length} stages; ${levelsCleared} cleared.${nextLevel ? ` Next: Level ${nextLevel.number}.` : ''} Evolve your team mid-battle with berries.` },
          { id: 'safari', title: 'Safari Zone', art: size => <SafariArt {...size} />,
            record: arcadeScores.safari === undefined ? undefined : `Best ${arcadeScores.safari} caught`, onPress: () => select({ game: 'safari' }),
            about: 'Walk Emerald’s Safari Zone with your buddy and catch Pokemon in the tall grass. Catches join your Dex.' },
          { id: 'memory', title: 'Memory Match', art: size => <MemoryArt {...size} />,
            onPress: () => select('memory'),
            about: 'Find matching Normal and Shiny pairs from your collection. Needs at least two variants.' },
          { id: 'quiz', title: 'Who’s That Pokémon?', art: size => <QuizArt {...size} />,
            record: shortBest('quiz', 10), onPress: () => select('quiz'),
            about: 'Ten silhouettes, four choices each, from Gen 1 to 4.' }
        ]} />
        <Text accessibilityRole="header" style={look.section}>More games</Text>
        <MiniGames games={[
          { id: 'berries', title: 'Berry Catch', icon: <BerryIcon />, onPress: () => select('berries'),
            about: `A 30-second garden game: tap each ripe berry before it hops away.${arcadeScores.berries === undefined ? '' : ` Best ${arcadeScores.berries} / 20.`}` },
          { id: 'expeditions', title: 'Legends', icon: <PixelSprite name="Rayquaza" size={52} />, onPress: () => router.push('/expeditions'),
            about: 'Legendary Expeditions: trials, battles and catches.' },
          { id: 'walk', title: `${bonus.km} / ${BONUS_KM_CAP} km`, icon: <OverworldSprite name={buddy ? buddy.replace(/^Shiny /, '') : 'Pikachu'}
            shiny={!!buddy?.startsWith('Shiny ')} size={52} />, onPress: () => setBonusOpen(!bonusOpen),
            about: `Walking bonus this week: ${bonus.km} of ${BONUS_KM_CAP} km.` }
        ]} />
        {bonusOpen && <Copy color={colors.ink}>{bonus.km ? `This week's walking bonus: +◉ ${bonus.berries} starting berries, +${bonus.balls} Safari Balls and +${bonus.km * STEPS_PER_KM} Safari Zone steps.`
          : 'Each km you walk this week adds starting berries, Safari Balls and Safari Zone steps. Every game plays fine without it.'}</Copy>}
      </> : <ArcadeAchievements place="arcade" />}
    </>}
    {!(immersive && fill) && !!message && <Copy color={colors.gold}>{message}</Copy>}
    {selected === 'map' && <AdventureMap stars={adventure} onPlay={stop => select({ game: stop.mode, stop })} />}
    {selected === 'levels' && <TrailLevels stars={trailLevels} freeBest={best('trail', 'waves', 12)}
      onPlay={level => select({ game: 'trail', level })} onFreePlay={() => select({ game: 'trail' })} />}
    {launch?.level && <LevelGame key={launch.level.id} level={launch.level} stars={trailLevels[launch.level.id] || 0}
      choices={choices} assists={assists} bonus={bonus.berries} team={trailTeam} onStart={setTrailTeam}
      onFinish={result => saveLevel(launch.level!, result.stars)} onNext={next => select({ game: 'trail', level: next })} />}
    {launch && launch.game !== 'safari' && !launch.level && <DefenseGame key={launch.stop?.id ?? launch.game}
      layout={launch.game === 'guard' ? 'lanes' : 'trail'}
      makeSpec={() => launch.stop && launch.stop.mode !== 'safari' ? launch.stop.spec : freePlaySpec(launch.game === 'guard' ? 'lanes' : 'trail')}
      brief={launch.stop ? { eyebrow: MODE_NAMES[launch.game].toUpperCase(), title: launch.stop.title, blurb: launch.stop.blurb,
        goals: STAR_GOALS[launch.game], record: starText(adventure[launch.stop.id] || 0) }
        : { eyebrow: 'FREE PLAY', title: MODE_NAMES[launch.game], record: best(launch.game, 'waves', launch.game === 'guard' ? 10 : 12),
          blurb: launch.game === 'guard' ? 'Ten waves of every type, in a random habitat.' : 'Twelve waves of every type, on a random trail.' }}
      choices={choices} assists={assists} bonus={bonus.berries} showStars={!!launch.stop}
      preview={launch.stop?.mode === 'trail' ? launch.stop.spec : undefined}
      initialTeam={launch.game === 'trail' ? trailTeam : undefined} onStart={launch.game === 'trail' ? setTrailTeam : undefined}
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
function LevelGame({ level, stars, choices, assists, bonus, team, onStart, onFinish, onNext }: {
  level: Level, stars: number, choices: TeamCard[], assists: string[], bonus: number, team?: TeamCard[],
  onStart: (team: TeamCard[]) => void, onFinish: (result: BattleResult) => void, onNext: (level: Level) => void
}) {
  const next = LEVELS[level.number]
  return <DefenseGame layout="trail" makeSpec={() => level.spec}
    brief={{ eyebrow: `LEVEL ${level.number} · ${STAGES[level.stage].name.toUpperCase()}`, title: level.name, blurb: level.blurb,
      goals: STAR_GOALS.trail, record: starText(stars) }}
    choices={choices} assists={assists} bonus={bonus} showStars preview={level.spec} initialTeam={team} onStart={onStart} onFinish={onFinish}
    next={next ? { title: `Next: Level ${next.number} · ${next.name}`, onPress: () => onNext(next) } : undefined} />
}

const look = themedStyles(() => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4 },
  headerTitle: { flex: 1, fontFamily: displayFont(fonts.black), fontSize: retro() ? 30 : 32, lineHeight: 38, color: colors.ink },
  points: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingLeft: 12, paddingRight: 6, borderRadius: 999,
    backgroundColor: colors.panel, borderWidth: retro() ? 2 : 1, borderColor: retro() ? colors.frameOuter ?? colors.line : colors.line },
  pointsText: { fontFamily: fonts.black, fontSize: 17, color: colors.ink, fontVariant: ['tabular-nums'] },
  tabs: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: retro() ? 12 : 999, backgroundColor: colors.sunken,
    borderWidth: retro() ? 2 : 1, borderColor: retro() ? colors.frameOuter ?? colors.line : colors.line },
  tab: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: retro() ? 8 : 999 },
  tabOn: { backgroundColor: colors.edge },
  tabText: { fontFamily: displayFont(fonts.heavy), fontSize: 15, color: colors.muted },
  section: { fontFamily: displayFont(fonts.heavy), fontSize: 18, lineHeight: 24, color: colors.ink, marginTop: 4 }
}))
