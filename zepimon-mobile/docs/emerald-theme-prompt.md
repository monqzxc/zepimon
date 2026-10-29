# Task: "Emerald" 2.5D retro theme + a Legendary Expeditions entrance worth finding

You are a senior front-end engineer and UI/UX designer working in the Zepimon repository, an Expo / React Native app in `zepimon-mobile/`. Read `zepimon-mobile/AGENTS.md` first. Expo changes between SDKs, so check the Expo SDK 57 docs before using any Expo API.

## Goal

1. **A new look:**
   - **Nostalgic:** like Pokémon Emerald on the Game Boy Advance.
   - **"2D-3D":** flat pixel art given depth, in the spirit of the HD-2D style. Use layered parallax, soft drop shadows, light glows, and gentle tilt or press-depth on cards.
   - **Readable and accessible**, as the current themes are.
2. **Move Legendary Expeditions somewhere exciting.** Today it is a small pastel tile next to Missions (`src/QuestTiles.tsx`) on the Adventure and Home tabs. It should feel like the app's big event: a **Legendary Gate** that players notice, want to open, and can tell at a glance when something is waiting.

## Stack

Expo SDK 57, React Native 0.86, React 19, Expo Router, TypeScript.

- **Animation:** React Native `Animated` (used throughout); `react-native-reanimated` is installed.
- **Graphics:** `react-native-svg`.
- **Fonts:** Nunito, via `@expo-google-fonts/nunito`.
- **Tests:** `node --test tests/*.test.js`.
- **Checks:** `npm test`, `npm run lint`, `npm run typecheck`, all run in `zepimon-mobile/`.
- **New packages:** add any with `npx expo install` only. A pixel display font such as `@expo-google-fonts/pixelify-sans` or `@expo-google-fonts/silkscreen` is fine; check the package exists for this SDK.

## What exists (reuse it, don't rebuild it)

- **Themes:**
  - `src/palettes.ts` holds plain-data palettes: `gengar`, `deoxys` and `pikachu`, each in light and dark. Its header comment explains every color role (`edge`, `alt`, `brand`, `tab*`, `star`, and so on).
  - `src/theme.ts` picks the active palette.
  - `tests/palettes.test.js` **enforces 4.5:1 contrast** on listed pairs. A new theme must pass it.
- **Theme choice:** `src/preferences.ts` stores `theme` and `appearance` (system, light or dark), chosen in Settings (`src/app/settings/`).
- **UI kit:** `src/ui.tsx` has `Screen`, `Panel`, `Hero`, `Button`, `Chip`, `IconButton`, `Copy`, `Heading`, `Eyebrow`, `fonts`, and `themedStyles` for styles that follow the theme.
- **Tab bar:** `src/TabBar.tsx` is a floating tab bar with a theme mascot peeking over it (`assets/nav/gengar|deoxys|pikachu`). The tabs are defined in `src/app/(tabs)/_layout.tsx`: `index`, `adventure`, `dex`, `play` and `import`.
- **Expeditions:**
  - The screen is `src/app/expeditions.tsx`.
  - Its entry points are the tile in `src/QuestTiles.tsx`, a button in `src/app/(tabs)/adventure.tsx` (~line 443), and the permit button in `src/games/ArcadeAchievements.tsx`.
  - The waiting-encounter count is computed in `QuestTiles.tsx` (`trailUnlocked(quest, key, trail) - trail.claimed`).
- **Emerald art already in the app:** `assets/safari/` (Brendan and May, terrain and battle backgrounds) and `assets/trials/`, built from pokeemerald-expansion and credited in `SPRITE-CREDITS.md`. Reuse these for the gate scene instead of new external art.

## Design direction (decide the details, but stay inside this)

### 1. The "Emerald" theme

Add `emerald` as a fourth theme in `src/palettes.ts`, in light and dark, and make it the default for new installs. Existing users keep the theme they chose.

- **Palette:** Emerald's own colors.
  - Accent: emerald green.
  - Second accent: Hoenn sea blue.
  - Highlight: Rayquaza gold.
  - Dark mode: deep teal or night navy.
  - Light mode: soft cream paper, like GBA menus.

  Every pair listed in the contrast test must pass.
- **Emerald menu frame:** a reusable `RetroFrame` (or a `variant` on `Panel`) that echoes Emerald's text boxes:
  - a rounded double border (light inner, dark outer)
  - a 2 px "pixel" corner feel
  - a subtle inner highlight on the top edge
  - a soft drop shadow for depth

  Use it for panels and dialogs in this theme.
- **Type:**
  - A pixel display font for eyebrows, titles and short labels only.
  - Nunito stays for body copy and anything longer than a line, for readability.
  - Keep the existing `fonts` names working, and add a `fonts.pixel`.
- **2.5D touches** (all respect `useReducedMotion()`):
  - cards lift 2–4 px with a deeper shadow while pressed
  - heroes get a 2–3 layer parallax background (sky, far hills or sea, near ground) that drifts slowly
  - focused or selected items get a gentle glow
  - a ▶ cursor marks the selected list row, like Emerald's menus
- **Scope:** apply the theme through the existing `colors`, `fonts` and `themedStyles` system, so every screen picks it up. Don't hand-edit every screen.

### 2. The Legendary Gate (Expeditions entrance)

- **Home:** make it the **featured hero card at the top of the Home tab** (`src/app/(tabs)/index.tsx`). It is a scene, not a tile:
  - A layered sky and stone gate, Sky Pillar style, using the existing `assets/trials` and `assets/safari` art and/or simple SVG shapes.
  - The silhouette or sprite of the **next waiting Legendary** (use the existing `PixelSprite`), or of the last one caught when nothing is waiting.
  - A short line under it: "Rayquaza is waiting at the Sky Pillar", "3 km to your next encounter", or "Permit ready — open the gate".
  - One clear button: **Enter the Gate**.
- **When an encounter is waiting:** the gate glows and pulses gently, a ✦ badge shows on the Home tab icon in the tab bar, and the sprite is shown in full. When nothing is waiting, the gate is dim and the sprite is a dark silhouette. With reduced motion, show the state with no animation.
- **Adventure tab:** keep a smaller "Legendary Gate" strip there too, so players who live in that tab still find it. Remove the old pastel Expeditions tile from `QuestTiles` and leave Missions as it is.
- **Expeditions screen:** restyle its header as the inside of the gate, using the same layered scene in a short banner. Leave the encounter, trial, chamber and battle logic untouched.

### 3. Don'ts

- Don't change any game, trial, battle, expedition or save logic.
- Don't remove the Gengar, Deoxys or Pikachu themes.
- Don't use official Pokémon logos or any art not already in the repo or from pokeemerald-expansion at the pinned revision. If you add art from that repo, credit it in `SPRITE-CREDITS.md` as the existing sections do.
- Don't drop contrast below the tested 4.5:1, or touch targets below 44 px.

## Folders and files

```
zepimon-mobile/
├── src/
│   ├── palettes.ts             CHANGE  add 'emerald' (light + dark); ThemeName gains 'emerald'
│   ├── theme.ts                CHANGE  only if needed to pick/default the new theme
│   ├── preferences.ts          CHANGE  default theme 'emerald' for new installs; restore keeps saved choices
│   ├── ui.tsx                  CHANGE  fonts.pixel, RetroFrame (or Panel variant), press-depth on cards/buttons
│   ├── TabBar.tsx              CHANGE  emerald mascot (see below) + ✦ badge on Home when an encounter waits
│   ├── LegendaryGate.tsx       NEW     the layered gate scene: props { variant: 'hero' | 'strip' | 'banner' }
│   ├── legendary-gate.ts       NEW     pure: gateStatus(expeditions, quest, progress) → { state: 'waiting' |
│   │                                   'permit' | 'walking' | 'none', name, shiny, line }  (no React; tested)
│   ├── QuestTiles.tsx          CHANGE  remove the Expeditions tile; Missions stays
│   ├── app/(tabs)/index.tsx    CHANGE  LegendaryGate hero at the top
│   ├── app/(tabs)/adventure.tsx CHANGE LegendaryGate strip
│   ├── app/expeditions.tsx     CHANGE  LegendaryGate banner header (logic unchanged)
│   └── app/settings/…          CHANGE  Emerald appears in the theme picker
├── assets/nav/emerald/         NEW     tab-bar mascot for the theme (e.g. Rayquaza or Kecleon poses, built the way
│                                       scripts/build-nav-poses.py builds the others; or reuse a PixelSprite)
├── tests/
│   ├── palettes.test.js        CHANGE  include emerald in the contrast checks
│   ├── legendary-gate.test.js  NEW     gateStatus for waiting / permit / walking / none
│   └── preferences.test.js     CHANGE  new default, old saved themes kept
└── README.md                   CHANGE  short "Themes" and "Legendary Gate" notes
```

Follow the existing style: no semicolons, single quotes, short comments that say what a rule is.

## Steps

1. `legendary-gate.ts` and its tests first. Reuse the waiting count logic now in `QuestTiles.tsx`; move it rather than copy it.
2. The Emerald palette and the contrast tests.
3. The default theme in preferences, with tests showing existing saved themes are kept.
4. `ui.tsx`: `fonts.pixel`, `RetroFrame`, and press-depth, all theme-driven.
5. `LegendaryGate.tsx` in three variants, then place it on Home, Adventure and the Expeditions header. Remove the old tile.
6. The tab bar badge and the Emerald mascot. If the mascot is too much, ship without one and say so.
7. Settings theme picker and the README.
8. Run `npm test`, `npm run lint` and `npm run typecheck`. Bump `app.json` `version` (minor) and `android.versionCode` (+1) above whatever is on `main` when you start.

## Acceptance criteria

- [ ] Emerald is selectable in Settings and is the default on a fresh install. Existing users keep their theme.
- [ ] Every screen picks up Emerald colors, pixel headings and the framed panels with no per-screen hacks. Body text is still Nunito.
- [ ] Contrast tests pass for Emerald light and dark.
- [ ] The Legendary Gate is the first thing on Home, has a smaller strip on Adventure, and heads the Expeditions screen. The old Expeditions tile is gone.
- [ ] The gate clearly shows each state with the right line and button:
  - [ ] waiting
  - [ ] permit ready
  - [ ] walking toward the next encounter
  - [ ] nothing yet

  When something is waiting, the Home tab shows a ✦ badge.
- [ ] Reduced motion: no parallax drift, pulses or lifts, and states are still clear.
- [ ] Phones at 360×740 and 390×844 show no clipped text, and touch targets are 44 px or larger.
- [ ] Expedition, trial, battle and save logic is unchanged. `npm test`, `npm run lint` and `npm run typecheck` pass.

## Notes

- **Other branches may land first.** "Immersive play" and "Shrine Revisits" branches may change `LegendaryTrial.tsx` and `expeditions.tsx`. Start from the latest `main`, keep your changes in those files to the header and banner only, and rebase before opening the PR.
- **Git:** work on a new branch from `main` and open a pull request. Don't merge or push to `main`. Stage files by name; never use `git add -A`.
- **Screenshots:** include them in the PR for Home, Adventure, Expeditions and Settings, in Emerald light and dark at 390×844. Use the web build (`npx expo start --web`) plus a headless browser if available, and say which ones you couldn't take.
