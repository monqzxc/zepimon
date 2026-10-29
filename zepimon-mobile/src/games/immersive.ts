// Immersive play for the walking games (the Legendary Trial and the Safari Zone), kept free of React so it can be tested:
// where the see-through D-pad, the HUD strip, the action group and the corner buttons go over a full-screen map, for a
// given size and orientation. PlayOverlay.tsx draws it; useImmersive.ts owns the side effects.
export type Rect = { x: number, y: number, width: number, height: number }
export type Insets = { top: number, right: number, bottom: number, left: number }
export type PlayLayout = { landscape: boolean, map: Rect, hud: Rect, dpad: Rect, actions: Rect, corner: Rect }

// One D-pad button. The overlay only fades the look: every button keeps this touch size.
export const DPAD_BUTTON = 52
export const DPAD_SIZE = DPAD_BUTTON * 3
// The D-pad's opacity over the map: faint while idle, nearly solid on the button being pressed.
export const OVERLAY_IDLE = 0.35
export const OVERLAY_PRESSED = 0.85
export const CORNER_BUTTON = 44
export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
const MARGIN = 12
const GAP = 8
// The HUD line and up to four status lines.
const HUD_HEIGHT = 96
// Room for five 40 px chips stacked, the most a game shows at once.
const ACTIONS_WIDTH = 172
const ACTIONS_HEIGHT = 240

// Landscape whenever the view is wider than it is tall. On a phone that follows the orientation lock; on the web, where
// the browser can't rotate, it follows the window.
export const isLandscape = (width: number, height: number) => width > height

export const right = (rect: Rect) => rect.x + rect.width
export const bottom = (rect: Rect) => rect.y + rect.height
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a)
}
export function inside(rect: Rect, area: Rect): boolean {
  return rect.x >= area.x && rect.y >= area.y && right(rect) <= right(area) && bottom(rect) <= bottom(area)
}

// The map fills the safe area. Exit and rotate sit in the top-right corner and the HUD strip runs beside them. In
// portrait the D-pad sits bottom-left with the actions bottom-right; in landscape the D-pad is centred on the left and
// the actions take the right side under the corner buttons. `buttons` is how many corner buttons are shown.
export function playLayout(width: number, height: number, { insets = NO_INSETS, buttons = 2 }: { insets?: Insets, buttons?: number } = {}): PlayLayout {
  const map = { x: insets.left, y: insets.top, width: Math.max(0, width - insets.left - insets.right), height: Math.max(0, height - insets.top - insets.bottom) }
  const landscape = isLandscape(map.width, map.height)
  const cornerWidth = buttons * CORNER_BUTTON + Math.max(0, buttons - 1) * GAP
  const corner = { x: right(map) - MARGIN - cornerWidth, y: map.y + MARGIN, width: cornerWidth, height: CORNER_BUTTON }
  const dpad = landscape
    ? { x: map.x + MARGIN, y: map.y + Math.round((map.height - DPAD_SIZE) / 2), width: DPAD_SIZE, height: DPAD_SIZE }
    : { x: map.x + MARGIN, y: bottom(map) - MARGIN - DPAD_SIZE, width: DPAD_SIZE, height: DPAD_SIZE }
  // In landscape the strip stops above the centred D-pad.
  const hudHeight = landscape ? Math.min(HUD_HEIGHT, dpad.y - GAP - (map.y + MARGIN)) : HUD_HEIGHT
  const hud = { x: map.x + MARGIN, y: map.y + MARGIN, width: Math.max(0, corner.x - GAP - (map.x + MARGIN)), height: Math.max(0, hudHeight) }
  const top = Math.max(bottom(hud), bottom(corner)) + GAP
  const actions = landscape
    ? { x: right(map) - MARGIN - ACTIONS_WIDTH, y: top, width: ACTIONS_WIDTH, height: Math.max(0, bottom(map) - MARGIN - top) }
    : (() => {
      const x = right(dpad) + MARGIN
      const height = Math.max(0, Math.min(ACTIONS_HEIGHT, bottom(map) - MARGIN - top))
      return { x, y: bottom(map) - MARGIN - height, width: Math.max(0, right(map) - MARGIN - x), height }
    })()
  return { landscape, map, hud, dpad, actions, corner }
}

// Where a prompt (the Safari gate question, an encounter) goes: under the HUD strip, across the map.
export function promptArea(layout: PlayLayout): Rect {
  const top = Math.max(bottom(layout.hud), bottom(layout.corner)) + GAP
  return { x: layout.map.x + MARGIN, y: top, width: Math.max(0, layout.map.width - MARGIN * 2), height: Math.max(0, bottom(layout.map) - MARGIN - top) }
}
