import { createContext, useContext } from 'react'

export type PlayOrientation = 'portrait' | 'landscape'
// Full-screen play. The arcade (src/app/(tabs)/play.tsx) and Legendary Expeditions (src/app/expeditions.tsx) own the
// state through useImmersive, which in full screen hides the tab bar or header and the status bar, and makes the back
// button leave full screen. Games read it to show their own toggle, and ask for fill while they lay themselves out to
// the screen instead of scrolling (a running battle). The walking games draw PlayOverlay, which asks for an edge-to-edge
// screen with setOverlay; only then does `orientation` (the remembered playOrientation) turn the phone.
export type GameScreen = {
  full: boolean, setFull: (full: boolean) => void, setFill: (fill: boolean) => void, setOverlay: (overlay: boolean) => void,
  orientation: PlayOrientation, setOrientation: (orientation: PlayOrientation) => void
}
export const GameScreenContext = createContext<GameScreen>({ full: false, setFull: () => {}, setFill: () => {}, setOverlay: () => {},
  orientation: 'portrait', setOrientation: () => {} })
export const useGameScreen = () => useContext(GameScreenContext)
