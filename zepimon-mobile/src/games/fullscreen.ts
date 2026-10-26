import { createContext, useContext } from 'react'

// Full-screen play. The arcade (src/app/(tabs)/play.tsx) owns the state and, in full screen, hides the tab bar, its
// back button and the status bar. Games read it to show their own toggle, and ask for fill while they lay themselves
// out to the screen instead of scrolling (a running battle).
export type GameScreen = { full: boolean, setFull: (full: boolean) => void, setFill: (fill: boolean) => void }
export const GameScreenContext = createContext<GameScreen>({ full: false, setFull: () => {}, setFill: () => {} })
export const useGameScreen = () => useContext(GameScreenContext)
