import { useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { pokemonType } from '../catalog'
import { Button, Copy, Eyebrow, Heading, Panel, colors, fonts, themedStyles, typeInks, typeTints } from '../ui'
import { DPad, useKeyboardDirections } from './DPad'
import { startMaze, stepMaze, trialFor } from './maze'
import type { Direction } from './safari-zone'
import { PixelSprite } from './TeamPicker'

const MAX_BOARD = 396

// The shrine maze before a Legendary encounter. The D-pad or the arrow keys / WASD move the partner one square at a
// time; walls block. Reaching the golden exit finishes the trial (saved by the screen), then the chamber opens.
export function MazeTrial({ name, number, partner, reduced, busy, onSolved, onLeave }: {
  name: string, number: number, partner: { name: string, shiny: boolean }, reduced: boolean, busy: boolean,
  onSolved: () => void, onLeave: () => void
}) {
  const trial = trialFor(name)
  const [maze, setMaze] = useState(() => startMaze(trial.layout))
  const [width, setWidth] = useState(0)
  const solved = useRef(onSolved)
  useEffect(() => { solved.current = onSolved })
  useEffect(() => {
    if (!maze.solved) return
    const timer = setTimeout(() => solved.current(), reduced ? 0 : 700)
    return () => clearTimeout(timer)
  }, [maze.solved, reduced])
  const step = (direction: Direction) => setMaze(current => stepMaze(current, direction))
  useKeyboardDirections(step, () => {}, !maze.solved)
  const type = pokemonType(name)
  const columns = trial.layout[0].length
  const cell = Math.floor(Math.min(width, MAX_BOARD) / columns)
  const status = maze.solved ? 'Trial cleared! The shrine opens… a presence stirs beyond the gate.'
    : maze.bumped ? 'A stone wall blocks the way. Try another path.' : 'Find the golden exit (★). Walls block the way.'
  return <Panel style={{ backgroundColor: typeTints[type] || colors.panel }}>
    <Eyebrow>EXPEDITION {number} · {name.toUpperCase()} · TRIAL</Eyebrow>
    <Heading>{trial.title}</Heading>
    <Copy color={colors.ink}>{trial.lore}</Copy>
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ alignSelf: 'stretch', alignItems: 'center' }}>
      {cell > 0 && <View accessible accessibilityRole="image" style={[maze_.board, { borderColor: typeInks[type] }]}
        accessibilityLabel={`Maze. You are at row ${maze.at.row + 1}, column ${maze.at.col + 1}. ${maze.moves} moves.`}>
        {trial.layout.map((line, row) => <View key={row} style={{ flexDirection: 'row' }}>
          {[...line].map((tile, col) => {
            const here = maze.at.row === row && maze.at.col === col
            return <View key={col} style={[{ width: cell, height: cell, alignItems: 'center', justifyContent: 'center' },
              tile === '#' ? { backgroundColor: typeInks[type] } : tile === 'E' ? maze_.exit : maze_.floor]}>
              {here ? <PixelSprite name={partner.name} shiny={partner.shiny} size={cell} />
                : tile === 'E' ? <Text accessible={false} style={[maze_.star, { fontSize: cell * 0.6, lineHeight: cell * 0.8 }]}>★</Text> : null}
            </View>
          })}
        </View>)}
      </View>}
    </View>
    <Text accessibilityLiveRegion="polite" style={[maze_.status, maze.solved && { color: colors.success }]}>{status}</Text>
    <Copy small>Moves: {maze.moves}. Use the D-pad, or the arrow keys / WASD on a keyboard.</Copy>
    <View style={{ alignItems: 'center' }}><DPad onPress={step} onRelease={() => {}} disabled={maze.solved} /></View>
    <View style={{ gap: 10 }}>
      <Button title="Restart the maze" secondary disabled={maze.solved || busy} onPress={() => setMaze(startMaze(trial.layout))} />
      <Button title="Leave the trial" secondary disabled={busy} onPress={onLeave} />
    </View>
    <Copy small>Leaving does not use up the encounter. Once you finish the trial, it stays finished.</Copy>
  </Panel>
}

const maze_ = themedStyles(() => ({
  board: { borderWidth: 3, borderRadius: 6, overflow: 'hidden' },
  floor: { backgroundColor: colors.panel },
  exit: { backgroundColor: colors.goldTint },
  star: { color: colors.gold, fontFamily: fonts.black },
  status: { color: colors.ink, fontFamily: fonts.heavy, fontSize: 15, lineHeight: 21 }
}))
