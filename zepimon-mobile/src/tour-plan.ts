// The welcome tour and the first-visit tips, as plain data and geometry so tests can check them (tests/tour.test.js).
// src/tour.ts keeps what has been seen, src/WelcomeTour.tsx draws the slides and src/CoachMarks.tsx the tips.

export type TourScreen = 'journal' | 'dex' | 'adventure' | 'play' | 'settings'
export const tourScreens: TourScreen[] = ['journal', 'dex', 'adventure', 'play', 'settings']
export const screenNames: Record<TourScreen, string> = { journal: 'Journal', dex: 'Dex', adventure: 'Adventure', play: 'Play', settings: 'Settings' }

// welcomed: the welcome slides were finished or skipped. seen: the screens whose tips were shown.
export type TourState = { welcomed: boolean, seen: TourScreen[] }
export const freshTour: TourState = { welcomed: false, seen: [] }

// Anything unreadable counts as not seen, one part at a time.
export function restoreTour(raw: unknown): TourState {
  const value = raw && typeof raw === 'object' ? raw as { welcomed?: unknown, seen?: unknown } : {}
  const seen = Array.isArray(value.seen) ? tourScreens.filter(screen => (value.seen as unknown[]).includes(screen)) : []
  return { welcomed: value.welcomed === true, seen }
}

// The welcome slides. spot is where the guide Pokemon lands on the slide's picture, as a share of its width and height
// (its feet, from the top left); it hops from one slide's spot to the next.
export type SlideId = 'welcome' | 'adventure' | 'journal' | 'dex' | 'play'
export type Slide = { id: SlideId, eyebrow: string, title: string, body: string, spot: { x: number, y: number } }
export const slides: Slide[] = [
  { id: 'welcome', eyebrow: 'Welcome', title: 'Welcome to Zepimon', spot: { x: 0.5, y: 0.84 },
    body: 'Every walk and run hatches Pokemon. Here is a quick look around before you set off.' },
  { id: 'adventure', eyebrow: 'Adventure', title: 'Walk to hatch your egg', spot: { x: 0.2, y: 0.9 },
    body: 'Tap the Poke Ball, pick an egg, then walk or run. Every 5 km in one adventure hatches or evolves it, and 1 egg in 50 is Shiny.' },
  { id: 'journal', eyebrow: 'Journal', title: 'Your days add up', spot: { x: 0.85, y: 0.46 },
    body: 'Distance, streaks, records and every adventure from your phone and watch, by week, month or year.' },
  { id: 'dex', eyebrow: 'Dex', title: 'Every hatch is kept', spot: { x: 0.5, y: 0.7 },
    body: 'Each Pokemon joins your Dex with its own record. Choose a buddy there and it walks with you across the app.' },
  { id: 'play', eyebrow: 'Play', title: 'Play with your team', spot: { x: 0.76, y: 0.78 },
    body: 'Six games use the Pokemon in your Dex. The distance you walk each week adds berries and Safari Balls.' }
]

// One tip of a screen's first-visit tutorial. target names what it points at (a CoachTarget on that screen, or a part
// of the tab bar); without one the tip sits in the middle of the screen.
export type CoachStep = { target?: string, title: string, body: string }
export const coachSteps: Record<TourScreen, CoachStep[]> = {
  journal: [
    { target: 'journal.pills', title: 'Caught and streak', body: 'The Pokemon you have caught and your weekly streak. Tap one to open the Dex or the calendar.' },
    { target: 'journal.distance', title: 'Distance travelled', body: 'Every kilometre from your phone and your watch adds up here.' },
    { target: 'journal.progress', title: 'Your progress', body: 'Days walked, distance and eggs hatched. Switch between this week, month and year.' },
    { target: 'tab.adventure', title: 'Start an adventure', body: 'The Poke Ball opens Adventure, where you record a walk or run.' }
  ],
  dex: [
    { target: 'dex.header', title: 'Your Pokedex', body: 'Every Pokemon you hatch or catch, with Normal and Shiny kept apart. The button on the right sorts them.' },
    { target: 'dex.filters', title: 'Find a Pokemon', body: 'Search by name, type or number, or filter by variant, generation and type.' },
    { title: 'Say hello', body: 'Tap a Pokemon to say hello. Tap its card to open its record, where you can make it your buddy.' }
  ],
  adventure: [
    { target: 'adventure.card', title: 'Choose your egg', body: 'Tap the egg to change it, pick Walk or Run, then Start. Every 5 km in one adventure hatches or evolves it.' },
    { target: 'adventure.rail', title: 'Along the way', body: 'Location, your weekly missions, Legendary Expeditions and the routes you have walked.' },
    { title: 'Your trail', body: 'The distance you travel moves your trainer along the map, from town to town.' }
  ],
  play: [
    { target: 'play.points', title: 'Legendary points', body: 'Games and adventures earn points. Tap to see your achievements.' },
    { target: 'play.games', title: 'Six games', body: 'They play with the Pokemon in your Dex, so every hatch gives you more to choose from.' },
    { target: 'play.more', title: 'Walking bonus', body: 'Each km you walk this week adds starting berries, Safari Balls and Safari Zone steps.' }
  ],
  settings: [
    { target: 'settings.preferences', title: 'Make it yours', body: 'Four themes in light or dark, and Reduce motion if you like things still.' },
    { target: 'settings.account', title: 'Link your watch', body: 'Sign in and link your watch to bring its journal to this phone.' },
    { target: 'settings.tour', title: 'See this again', body: 'Welcome tour replays the introduction and these tips whenever you like.' }
  ]
}

// The tips to show: those with nothing to point at, and those whose target is on the screen right now.
export function stepsFor(screen: TourScreen, has: (target: string) => boolean): CoachStep[] {
  return coachSteps[screen].filter(step => !step.target || has(step.target))
}

export type Box = { x: number, y: number, width: number, height: number }
// The part of the screen tips and their targets may use: below the status bar, above the tab bar or home indicator.
export type Frame = { width: number, top: number, bottom: number }

// How far a page must scroll (down is positive) to bring a target into the frame with a margin, 0 if it already is. A
// target taller than the frame lines up with its top.
export function scrollNeeded(box: Box, frame: Frame, margin = 12): number {
  const top = frame.top + margin
  const bottom = frame.bottom - margin
  if (box.y < top) return box.y - top
  if (box.y + box.height > bottom) return Math.min(box.y + box.height - bottom, box.y - top)
  return 0
}

// The lit area around a target: padded, kept inside the frame, and null when too little of the target shows to point at.
export function spotlight(box: Box | null, frame: Frame, pad = 6): Box | null {
  if (!box) return null
  const left = Math.max(4, box.x - pad)
  const right = Math.min(frame.width - 4, box.x + box.width + pad)
  const top = Math.max(frame.top, box.y - pad)
  const bottom = Math.min(frame.bottom, box.y + box.height + pad)
  if (right - left < 24 || bottom - top < Math.min(40, box.height * 0.5)) return null
  return { x: left, y: top, width: right - left, height: bottom - top }
}

// Where a tip of the given height goes: under the lit area when it fits, else over it, else on whichever side has more
// room (covering a little of it); in the middle when nothing is lit. headroom is kept free above the tip for the guide
// Pokemon standing on it.
export function placeTip(hole: Box | null, frame: Frame, height: number, headroom = 0, gap = 14): { top: number, side: 'below' | 'above' | 'middle' } {
  const lowest = Math.max(frame.top + headroom, frame.bottom - height)
  if (!hole) return { top: Math.min(lowest, Math.max(frame.top + headroom, (frame.top + frame.bottom - height + headroom) / 2)), side: 'middle' }
  const below = hole.y + hole.height + gap + headroom
  if (below + height <= frame.bottom) return { top: below, side: 'below' }
  const above = hole.y - gap - height
  if (above - headroom >= frame.top) return { top: above, side: 'above' }
  return frame.bottom - (hole.y + hole.height) >= hole.y - frame.top ? { top: lowest, side: 'below' } : { top: frame.top + headroom, side: 'above' }
}

// The guide's hop from each spot to the next as the slides scroll by: scroll offsets (page is one slide's width) and
// the matching positions, for an interpolation. It rises lift above the straight line between two spots, highest
// halfway, and its shadow shrinks as it does.
const HOP = [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1]
export function hopTrack(spots: { x: number, y: number }[], page: number, lift: number) {
  const input: number[] = [], x: number[] = [], y: number[] = [], ground: number[] = [], air: number[] = []
  spots.forEach((spot, index) => {
    const next = spots[index + 1]
    for (const t of next ? HOP.slice(0, -1) : [0]) {
      const to = next ?? spot
      const arc = 4 * t * (1 - t)
      input.push((index + t) * page)
      x.push(spot.x + (to.x - spot.x) * t)
      ground.push(spot.y + (to.y - spot.y) * t)
      y.push(spot.y + (to.y - spot.y) * t - lift * arc)
      air.push(arc)
    }
  })
  return { input, x, y, ground, air }
}
