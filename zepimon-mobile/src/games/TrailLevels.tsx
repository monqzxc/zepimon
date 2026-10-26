import { Pressable, StyleSheet, Text, View } from 'react-native'
import { typeTints } from '../catalog'
import { Button, Copy, Eyebrow, Hero, Panel, colors, fonts, styles } from '../ui'
import { STAR_GOALS } from './AdventureMap'
import { PATHS } from './battle'
import { starText } from './DefenseGame'
import { LEVELS, LEVELS_PER_STAGE, STAGES, levelUnlocked } from './levels'
import type { Level } from './levels'

const label = (type: string) => type[0].toUpperCase() + type.slice(1)
// Non-breaking spaces keep a map size like "9 × 16" on one line.
const dims = (level: Level) => `${PATHS[level.spec.path].cols} × ${PATHS[level.spec.path].rows}`

// Level select for Trail Defense: four stages of five levels, then free play.
export function TrailLevels({ stars, freeBest, onPlay, onFreePlay }: {
  stars: Record<string, number>, freeBest: string, onPlay: (level: Level) => void, onFreePlay: () => void
}) {
  const total = LEVELS.reduce((sum, level) => sum + (stars[level.id] || 0), 0)
  const cleared = LEVELS.filter(level => stars[level.id]).length
  const next = LEVELS.find((level, index) => levelUnlocked(stars, index) && !stars[level.id])
  return <View style={{ gap: 14 }}>
    <Hero eyebrow="TOWER DEFENSE" title="Trail Defense">
      <Copy color={colors.onBrand}>{LEVELS.length} levels in {STAGES.length} stages. Maps grow from {dims(LEVELS[0])} to {dims(LEVELS[LEVELS.length - 1])} squares, waves get longer, and every stage ends with a Legendary boss. Earn a star on a level to open the next.</Copy>
    </Hero>
    <Panel>
      <Text style={styles.stat}>★ {total} / {LEVELS.length * 3}</Text>
      <Copy>{cleared} of {LEVELS.length} levels cleared on this phone</Copy>
      <Copy small>{STAR_GOALS.trail}</Copy>
      {next && <Button title={`${cleared ? 'Continue' : 'Start'}: Level ${next.number} · ${next.name}`} onPress={() => onPlay(next)} />}
    </Panel>
    {STAGES.map((stage, index) => {
      const levels = LEVELS.filter(level => level.stage === index)
      const open = levelUnlocked(stars, LEVELS.indexOf(levels[0]))
      return <Panel key={stage.name} style={[{ backgroundColor: open ? typeTints[stage.habitat] || colors.panel : colors.sunken }, !open && grid.locked]}>
        <Eyebrow>STAGE {index + 1} / LEVELS {levels[0].number}–{levels[levels.length - 1].number}</Eyebrow>
        <Text style={grid.title}>{stage.name}</Text>
        <Copy small color={colors.ink}>{open ? `${stage.blurb} Foes: ${stage.foes.map(label).join(', ')}.` : `Clear Level ${levels[0].number - 1} to reach this stage.`}</Copy>
        <View style={grid.row}>{levels.map(level => <LevelTile key={level.id} level={level} stars={stars[level.id] || 0}
          open={levelUnlocked(stars, level.number - 1)} current={level === next} onPress={() => onPlay(level)} />)}</View>
      </Panel>
    })}
    <Panel>
      <Eyebrow>FREE PLAY</Eyebrow>
      <Copy>Twelve waves of Shadow Pokemon of every type, in a random habitat on a random classic trail.</Copy>
      <Copy small color={colors.gold}>{freeBest}</Copy>
      <Button title="Play free play" secondary onPress={onFreePlay} />
    </Panel>
    <Copy small>Level stars are saved on this phone. Your best free-play score stays separate.</Copy>
  </View>
}

function LevelTile({ level, stars, open, current, onPress }: { level: Level, stars: number, open: boolean, current: boolean, onPress: () => void }) {
  const { cols, rows } = PATHS[level.spec.path]
  const boss = level.number % LEVELS_PER_STAGE === 0
  return <Pressable disabled={!open} onPress={onPress} accessibilityRole="button" accessibilityState={{ disabled: !open }}
    accessibilityLabel={open ? `Level ${level.number}, ${level.name}, ${cols} by ${rows} map${boss ? ', boss level' : ''}, ${stars} of 3 stars`
      : `Level ${level.number}, locked`}
    style={({ pressed }) => [grid.tile, stars ? grid.done : open ? grid.open : grid.shut, current && grid.current, { opacity: pressed ? 0.7 : 1 }]}>
    <Text style={[grid.number, !open && { color: colors.muted }]}>{level.number}</Text>
    <Text style={grid.stars}>{open ? starText(stars) : '🔒'}</Text>
    <Text style={grid.size}>{boss ? 'BOSS' : `${cols}×${rows}`}</Text>
  </Pressable>
}

const grid = StyleSheet.create({
  title: { color: colors.ink, fontSize: 20, lineHeight: 26, fontFamily: fonts.heavy },
  locked: { boxShadow: 'none' },
  row: { flexDirection: 'row', gap: 6 },
  tile: { flex: 1, minHeight: 80, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 6, borderWidth: 1.5, borderRadius: 14 },
  open: { borderColor: colors.line, backgroundColor: colors.panel },
  done: { borderColor: colors.star, backgroundColor: colors.panel },
  shut: { borderColor: colors.line, backgroundColor: 'rgba(255, 255, 255, 0.5)' },
  current: { borderColor: colors.edge, borderWidth: 2.5, backgroundColor: colors.mint },
  number: { color: colors.ink, fontSize: 21, lineHeight: 26, fontFamily: fonts.black },
  stars: { color: colors.gold, fontSize: 11, lineHeight: 14, letterSpacing: 1 },
  size: { color: colors.muted, fontSize: 10, lineHeight: 13, fontFamily: fonts.heavy, letterSpacing: 0.4 }
})
