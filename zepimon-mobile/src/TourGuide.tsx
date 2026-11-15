import { View } from 'react-native'
import { useJournal } from './store'
import { OverworldSprite } from './games/OverworldSprite'
import type { Direction } from './games/safari-zone'

// The Pokemon that shows you around: your buddy, or Pikachu until you have chosen one. It hops between the welcome
// slides (src/WelcomeTour.tsx) and stands on each first-visit tip (src/CoachMarks.tsx).

// Twice the 44 px overworld frame, so its pixels stay even. Its feet stand FEET px above the frame's bottom edge.
export const GUIDE = 88
export const FEET = 4

export function TourGuide({ facing = 'south' }: { facing?: Direction }) {
  const { buddy } = useJournal()
  const name = buddy ? buddy.replace(/^Shiny /, '') : 'Pikachu'
  return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: GUIDE, height: GUIDE }}>
    <OverworldSprite name={name} shiny={!!buddy?.startsWith('Shiny ')} size={GUIDE} facing={facing} />
  </View>
}
