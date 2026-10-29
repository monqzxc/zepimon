# Task: Immersive play mode (full screen, see-through D-pad, landscape)

You are working in the Zepimon repository, an Expo / React Native app in `zepimon-mobile/`. Build an **immersive play mode** for the two walking games that use the D-pad:

- the **Legendary Trial** (`src/games/LegendaryTrial.tsx`, opened from `src/app/expeditions.tsx`)
- the **Safari Zone** (`src/games/SafariZone.tsx`, opened from the arcade tab `src/app/(tabs)/play.tsx`)

In immersive mode:

1. The map fills the whole screen.
2. The D-pad floats over the map, low-opacity.
3. The player can turn the game to landscape.

Build it once in shared pieces and use it in both games. Both games already share the map view (`TileWorld`), the D-pad (`DPad`) and the step loop (`useStepWalker`).

Read `zepimon-mobile/AGENTS.md` first. Expo changes between SDKs, so check every Expo API you use against the docs for this SDK (v57): https://docs.expo.dev/versions/v57.0.0/

---

## 1. Stack

| Area | What the project uses |
|---|---|
| App | Expo SDK 57, React Native 0.86, React 19, TypeScript |
| Navigation | Expo Router (`src/app/`). The arcade is a tab; `expeditions.tsx` is a root stack screen |
| Layout | `react-native-safe-area-context`, the `Screen` component in `src/ui.tsx` (`fill` and `full` props) |
| Animation | React Native `Animated` (the map and D-pad use it); `react-native-reanimated` is installed but not used by these games |
| Status bar | `expo-status-bar` |
| Settings | `src/preferences.ts` (AsyncStorage, `usePreferences`, `setPreference`) |
| Tests | `node --test tests/*.test.js` (tests are `.js` and import `.ts` files directly) |
| Checks | `npm test`, `npm run lint`, `npm run typecheck`, all run in `zepimon-mobile/` |
| **New dependency** | `expo-screen-orientation`, added with `npx expo install expo-screen-orientation` (never npm/yarn add) |
| Optional dependency | `expo-navigation-bar`, only if hiding the Android navigation bar is needed for true full screen. Check the SDK 57 docs before adding it |

The app has its own native module (`modules/zepimon-diagnostics`), so it already runs as a development build, not Expo Go. Orientation is native config. Changing it means a **new native build** (`scripts/build-apk-local.ps1` or EAS). An over-the-air update won't do it.

---

## 2. What exists today (reuse it, don't rebuild it)

- **Full screen in the arcade:** `src/games/fullscreen.ts` defines `GameScreenContext` / `useGameScreen()` → `{ full, setFull, setFill }`. `src/app/(tabs)/play.tsx` provides it. In full screen it hides the tab bar (`navigation.setOptions({ tabBarStyle: { display: 'none' } })`) and the status bar (`<StatusBar hidden />`), and makes Android's back button leave full screen (`BackHandler`). `DefenseGame.tsx` already has a full-screen toggle using `IconButton` with `fullscreen` / `fullscreenExit` icons.
- **The Expeditions screen has no provider:** `src/app/expeditions.tsx` does not provide `GameScreenContext`, so `useGameScreen()` does nothing there today. It passes `fill` to `Screen` while a trial runs.
- **Map view:** `src/games/TileWorld.tsx` draws the map at any `width` × `height`. Its tile size comes from `tileSizeFor(width)` in `src/games/safari-view.ts`, which divides by 9 tiles and clamps to 40–64 px. That uses width only.
- **D-pad:** `src/games/DPad.tsx` is a fixed 3 × 52 px cross, made of `Pressable`s with `onPressIn` / `onPressOut`. `useKeyboardDirections` handles arrow keys and WASD on the web.
- **Orientation:** `app.json` has `"orientation": "portrait"`, which locks the whole app.
- **Current layouts:**
  - Trial: a `Panel` with the title row, the map (`look.world`, `flex: 1`), the status line, the HUD, a row with the D-pad and minimap, then chips (Restart room, Hint, and so on).
  - Safari: its own top bar and the map, with the D-pad below.

---

## 3. What to build

### Behaviour

1. **Enter and exit.** A full-screen button appears in the Legendary Trial and the Safari Zone while a game is in play.
   - In immersive mode:
     - the status bar is hidden
     - the tab bar (arcade) or stack header (Expeditions) is hidden
     - the game panel's padding and border are gone
     - the map fills the safe area edge to edge
   - An exit button (top corner), Android's back button, and leaving the screen all exit.
2. **See-through D-pad.**
   - In immersive mode the D-pad is drawn **over the map**: bottom-left in portrait, left-centre in landscape.
   - Opacity is about **0.35** when idle and about **0.85** on the button being pressed.
   - Touch targets keep their full size (52 px per button or larger), and only the look is faded.
   - When "Tap to walk" is chosen (`safariControls === 'tap'`), no D-pad is drawn and taps on the map walk, as today.
3. **Small overlays instead of panels.** The HUD (moves, relics or attempts) and the status line show as a small translucent strip at the top of the map. The action chips form a compact group in the corner opposite the D-pad:
   - Legendary Trial: Restart room, Start over, Hint, Reset the crystals
   - Safari Zone: its own actions
   - Both: Leave and exit full screen

   The minimap is optional in immersive mode (a corner toggle is fine).
4. **Landscape.**
   - In immersive mode only, a rotate button switches between portrait and landscape.
   - The choice is remembered as a new preference, `playOrientation: 'portrait' | 'landscape'`, default `'portrait'`, so the next immersive session opens the same way.
   - Outside immersive mode the app stays **locked to portrait**, as it is now.
5. **Always put things back.** Restore the portrait lock and show the status bar and tab bar or header again on **every** way out:
   - the exit button
   - the back button
   - leaving the route
   - the trial finishing and moving to the chamber
   - a Safari round ending, or an encounter screen opening if that layout can't fit
   - the component unmounting

   The trial's existing timers, checkpoint saves and `walking === false` input drops must keep working.
6. **Map sizing in landscape.** Tile size must take height into account, so a short, wide screen doesn't zoom in too far:
   - Extend `tileSizeFor` to `tileSizeFor(width, height?)`.
   - When `height` is given, use about 9 tiles across the shorter side, clamped 40–64.
   - Without `height`, it behaves exactly as now, so every existing Safari test passes unchanged.
7. **Accessibility and motion.**
   - Buttons have labels ("Full screen", "Exit full screen", "Turn to landscape", "Turn to portrait").
   - The status line stays a polite live region.
   - With reduced motion (`useReducedMotion()`), no animated opacity changes; switch instantly.
8. **Web.** Rotation isn't available in a browser. On web, hide the rotate button. Immersive mode works as a layout only, and landscape layout applies whenever the window is wider than it is tall.

### Out of scope

Don't change the trial rules (`trial.ts`, `trials.ts`), the room data, saving, the battle or chamber screens, or Safari's catch rules.

---

## 4. Folders and files

```
zepimon-mobile/
├── app.json                        CHANGE  "orientation": "portrait" → allow rotation (see §5 step 1)
├── src/
│   ├── app/
│   │   ├── _layout.tsx             CHANGE  lock portrait once at app start
│   │   ├── expeditions.tsx         CHANGE  provide GameScreenContext like play.tsx; hide the stack header and
│   │   │                                   status bar while immersive; back button exits immersive first
│   │   └── (tabs)/play.tsx         CHANGE  only if needed to share the provider logic (see useImmersive)
│   ├── preferences.ts              CHANGE  add playOrientation (type, default, restorePreferences)
│   └── games/
│       ├── fullscreen.ts           CHANGE  extend GameScreen with orientation: { orientation, setOrientation }
│       ├── immersive.ts            NEW     pure layout maths, no React: where the D-pad, HUD and action
│       │                                   group go for a given width × height and orientation; the
│       │                                   opacity constants; landscape-or-not for web
│       ├── useImmersive.ts         NEW     the one hook that owns side effects: orientation lock/unlock
│       │                                   (expo-screen-orientation), status bar, header/tab bar, back
│       │                                   button, and the guaranteed restore on unmount
│       ├── PlayOverlay.tsx         NEW     the immersive layout: full-bleed map slot + translucent HUD/status
│       │                                   strip + floating D-pad + action group + exit/rotate buttons
│       ├── DPad.tsx                CHANGE  add an optional `overlay` look (opacity idle/pressed); hit areas unchanged
│       ├── safari-view.ts          CHANGE  tileSizeFor(width, height?) — backwards compatible
│       ├── LegendaryTrial.tsx      CHANGE  render inside PlayOverlay when immersive; current layout otherwise
│       └── SafariZone.tsx          CHANGE  same
├── tests/
│   ├── immersive.test.js           NEW     layout maths for portrait / landscape / small phones
│   ├── preferences.test.js         CHANGE  playOrientation default and restore
│   └── safari-view.test.js         CHANGE  add cases for tileSizeFor with height; existing cases untouched
└── README.md                       CHANGE  short "Full screen and landscape" section under the games
```

Keep side effects in `useImmersive.ts` and layout maths in `immersive.ts`, so the maths can be unit-tested with `node --test`. Follow the existing style: no semicolons, single quotes, short comments that say what a rule is.

---

## 5. Implementation steps (in order)

1. **Native orientation setup.**
   - `npx expo install expo-screen-orientation`.
   - Read its SDK 57 page for:
     - the right `app.json` setting to allow rotation (`"orientation": "default"`, and/or the package's config plugin with an initial portrait orientation)
     - what iOS needs to allow landscape
   - Lock to portrait at app start in `src/app/_layout.tsx` (`ScreenOrientation.lockAsync(PORTRAIT_UP)`), so nothing outside immersive mode can rotate.
   - Confirm on a device that the app still opens and stays portrait everywhere.
2. **Preference.** Add `playOrientation` to `src/preferences.ts`, with a test.
3. **Pure layout.** Write `immersive.ts` and its tests first:
   - D-pad rectangle, HUD strip and action group for portrait and landscape at 360×740, 390×844, 740×360 and 844×390
   - nothing overlaps the D-pad
   - everything is inside the safe area that is passed in
4. **`tileSizeFor(width, height?)`**, with new tests. Existing Safari tests must pass unchanged.
5. **`useImmersive`.** One hook that, given `full` and `orientation`, applies and **always restores**:
   - the orientation lock
   - the hidden status bar
   - the hidden header or tab bar
   - the back button behaviour

   Restoring must happen on unmount too. Provide it through `GameScreenContext` in both `play.tsx` and `expeditions.tsx`, so both games use the same `useGameScreen()` API.
6. **`DPad` overlay look and `PlayOverlay`.**
   - The map slot measures itself (`onLayout`) and passes `width` and `height` to `TileWorld`, as `LegendaryTrial` already does.
   - Remeasure on rotation.
   - Snap the camera after a rotation, using the existing `jump` prop on `TileWorld`.
7. **Wire up the Legendary Trial.**
   - Add the full-screen button to its top row.
   - When immersive, render `PlayOverlay` with the same map, status, HUD, D-pad and chips.
   - Leaving, finishing (to the chamber) or the reveal must exit immersive mode.
8. **Wire up the Safari Zone** the same way. Keep its behaviour outside immersive mode exactly as now.
9. **Docs and version.**
   - Add the README section.
   - Bump `app.json` `version` and `android.versionCode`. This is a native change: currently **1.12.0 / 40**, so it becomes **1.13.0 / 41**.

---

## 6. Acceptance criteria

- [ ] A full-screen button appears in the Legendary Trial and the Safari Zone. In immersive mode the map fills the screen, and the status bar and header or tab bar are hidden.
- [ ] The D-pad floats over the map at about 0.35 opacity and about 0.85 while pressed. Every button is still 52 px or larger and easy to hit. Holding it walks exactly as before, at one step per 220 ms.
- [ ] The rotate button turns the game to landscape and back. The choice is remembered. The rest of the app stays portrait.
- [ ] Every way out restores portrait, the status bar and the header or tab bar:
  - [ ] the exit button
  - [ ] Android back
  - [ ] leaving the route
  - [ ] trial finish → chamber
  - [ ] Safari round end
  - [ ] app backgrounded and reopened
- [ ] In landscape at 844×390 and 740×360, the map, HUD, status line, D-pad and action buttons are all visible with no overlap and no scrolling. The same holds in portrait at 390×844 and 360×740.
- [ ] Tap-to-walk works in immersive mode, in both orientations.
- [ ] Reduced motion: no animated fades.
- [ ] Trial progress is unchanged: held input drops on a fall, warp or room change. Rotating mid-room doesn't move the trainer or lose the checkpoint.
- [ ] The Safari Zone outside immersive mode is unchanged.
- [ ] `npm test`, `npm run lint` and `npm run typecheck` all pass.

## 7. How to verify

- **Unit tests:** the new layout maths, `tileSizeFor` and the preference.
- **Web (layout only):** run `npx expo start --web` and use Playwright at the four sizes above. Restart the dev server after edits, because the file watcher misses changes in this OneDrive folder. Seed data by writing the store JSON to `localStorage['zepimon-mobile-v1']`.
- **Android device (required):** rotation, status bar and back button only behave for real on a device. Build an APK with `scripts/build-apk-local.ps1` and check:
  - every exit path in §6
  - rotating mid-trial and mid-Safari
  - a Safari ledge hop and a trial fall in landscape
- **iOS**, if you have it: the same checks, especially that landscape is allowed only in immersive mode.

## 8. Rules

- Don't commit `zepimon_expeditions_bundle/` or unrelated local changes. Stage files by name, never with `git add -A`.
- Work on a new branch from `main`. Don't push or merge without the owner's go-ahead.
- Report back with:
  - the files changed
  - test, lint and typecheck output
  - device test results, including what you could not test
  - screenshots in both orientations
