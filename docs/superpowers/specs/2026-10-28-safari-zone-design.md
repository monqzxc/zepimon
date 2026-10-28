# Safari Zone: design

Date: 2026-10-28 · App: `zepimon-mobile` · Status: approved in brainstorming, awaiting spec review

## Intent

Turn the arcade's **Safari Hunt** into a **Safari Zone** like Pokémon Emerald's. You walk a trainer around a scrolling
tile map with tall grass and obstacles, and stepping into grass starts encounters where you hunt and catch Pokémon.
It stays offline, runs on Android, iPhone and web, and needs no new native module.

**Success means:**
- It feels like a GBA Safari Zone: Emerald tiles, Brendan or May walking tile by tile, a buddy following, ledges,
  grass rustling as you walk through it, and a battle screen for encounters.
- The current catch rules, Dex saving, Shiny chains, Adventure Map stars and walking bonus keep working.
- It runs smoothly on low-end Android phones.

## Decisions

| # | Decision |
|---|---|
| 1 | Safari Hunt **becomes** the Safari Zone. There is no separate game. The arcade key stays `'safari'`. |
| 2 | The player is **Brendan or May**, chosen on the start screen. Your **buddy** follows one tile behind. |
| 3 | **D-pad and tap-to-walk** are both available, through a remembered **D-pad · Tap to walk** switch. The web keyboard always works. |
| 4 | A round ends on a **step budget**, running out of balls, or leaving through the gate. The walking bonus adds steps. |
| 5 | **One map, four areas** (Meadow, Lakeside, Rocky Mountain, Night Forest) plus a gate, with a scrolling camera. |
| 6 | **Real Emerald tiles** from pokeemerald-expansion, built into map images from our own text layout. |
| 7 | Map images are built ahead of time, and the game is drawn with React Native views and Reanimated. There is no Skia and no per-tile views. |
| 8 | The base Shiny rate is **1 in 100**. Chains improve it to 1 in 8 after 4 chained catches. |
| 9 | Brendan and May wear a Zepimon outfit: a **purple and white cap** (Brendan's band and May's bandana turn from green to Gengar-theme purple) and a **black and white shirt**. Everything else keeps Emerald's colours. |

## How a round plays

### Start
The start panel shows your best result (or the Adventure Map goal), the walking-bonus note and a **Brendan / May**
toggle (saved as a preference). **Enter the Safari Zone** fades into the map at the gate start, facing north. An
Adventure Map stop starts at its area's start tile instead: Viridian Forest in the Meadow, Cerulean Cape in Lakeside,
Midnight Grove in the Night Forest. You can still walk anywhere.

### Budget
| Constant | Value |
|---|---|
| `ZONE_STEPS` | 400 |
| `STEPS_PER_KM` (walking bonus) | +50 per km walked this week, up to `BONUS_KM_CAP` (3), so at most 550 |
| `SAFARI_BALLS` | 12 (unchanged) |
| `BALLS_PER_KM` | +3 per km (unchanged), so at most 21 at the start |
| `ITEM_COUNT` × `ITEM_BALLS` | 6 items × 3 balls |

A step is spent only when the trainer actually moves. Bumping into a wall, water or a ledge from below or the side
costs nothing. A ledge hop moves two tiles (over the ledge) and costs **one** step.

### Movement and the map
- **Walls** (can't enter): trees, boulders, fences, water, signs, the gate building's walls.
- **Ledges** (`v` south, `<` west, `>` east): you can only cross one moving in its direction. The trainer hops over it
  and lands on the tile beyond, with a dust puff and a shadow. A ledge is a wall from every other side. There are no
  north ledges.
- **Items:** 6 item balls lie on walkable tiles. Stepping onto one picks it up: +3 Safari Balls and a message. Each is
  picked up once per round, and all come back next round.
- **Signs:** one at each area entrance. A step that ends next to a sign (one of the 4 neighbouring tiles), arriving
  from a tile that was not next to it, shows a toast with the area name and its types (the existing
  `ZONES[zone].blurb`).
- **Gate:** trying to step onto a gate tile doesn't move you or spend a step. It asks **"Leave the Safari Zone?"**.
  **Leave** ends the round. **Stay** closes the prompt.
- **Buddy:** the Dex buddy takes the tile the trainer just left and faces the same way. With no buddy set, the trainer
  walks alone. A buddy with no walking strip (eggs, a few Mega forms) follows as its still sprite.

### Encounters
- **Tall grass:** each step that *ends* on tall grass rolls `GRASS_RATE` = **0.1**. After any encounter, the next
  `GRASS_COOLDOWN` = **3** steps cannot roll.
- **Rustling grass:** every `RUSTLE_EVERY` = **25** steps, one tall-grass tile in the trainer's current area, 2–6
  tiles away (Chebyshev distance) and not under the trainer or buddy, starts shaking. Stepping onto it **always**
  starts an encounter, even during the cooldown. It keeps shaking until it is stepped on or the next rustle replaces
  it. If the area has no grass tile in range, nothing rustles that time.
- **Which Pokémon:** the pool comes from the area of the tile you stepped on. Area letters map to the existing zones
  (`m` → `meadow`, `l` → `lake`, `k` → `mountain`, `n` → `night`; the gate area has no grass), then
  `ZONES[zone].types` → `wildPool` as now,
  with the existing chain behaviour: a 35% chance of meeting the chained species again when it is in that pool.
- **Shiny:** `shinyOdds = chain on this species ? max(8, 100 − 23 × count) : 100`, which gives 100, 77, 54, 31, then 8.
  A chained species running away still breaks the chain.
- **Encounter screen:** a GBA-style double flash and horizontal wipe (about 600 ms, skipped with reduced motion). Then
  Emerald's battle background: **long grass** in the Meadow, Mountain and Night Forest, **pond** in Lakeside, with the
  wild Pokémon (`PixelSprite`) on the platform. A Shiny plays a sparkle burst from the existing `fairy-sparkle` move
  sprite (still with reduced motion) and keeps the "✦ SHINY ENCOUNTER" label. Below that are today's ring, quality
  label, mood note, and **Throw Safari Ball / Throw bait / Throw rock / Run**, unchanged. Afterwards you are back on the
  same tile.

### End of a round
- **Steps reach 0:** show "Ding-dong! Time's up!" and the results. If the last step started an encounter, the
  encounter plays out first.
- **Balls reach 0:** the round ends as today (including mid-encounter: "Out of Safari Balls!").
- **Leaving through the gate:** the round ends after the confirmation.

The results panel is today's (catches, sprites, "Hunt again"). "Choose another zone" is removed, since the zones are
now areas of the map. `onComplete(catches)` is called once, as now.

### Scores and stars
- Free-play best is the most caught in one round. `SCORE_LIMITS.safari` = 12 + 3 × 3 + 6 × 3 = **39**. Saved bests up to
  the old limit (21) stay valid.
- Adventure Map stars are unchanged: `safariStars` gives 3, 5 and 7 catches for 1, 2 and 3 stars.

## Map and art

### Layout files (build input, not bundled)
- `zepimon-mobile/scripts/safari/layout.txt`: about **44 × 44** characters, one per tile:

  | Char | Tile | Char | Tile |
  |---|---|---|---|
  | `.` | ground / path | `T` | tree |
  | `g` | tall grass | `R` | boulder |
  | `~` | water | `F` | fence |
  | `v` `<` `>` | ledge (hop south / west / east) | `S` | sign |
  | `o` | item ball (on ground) | `G` | gate tile |
  | `#` | gate building wall | `@` | gate start (ground) |
  | `1` `2` `3` `4` | Meadow / Lakeside / Mountain / Night start (ground) | | |

- `zepimon-mobile/scripts/safari/areas.txt`: the same size, one letter per tile: `g` gate, `m` meadow, `l` lake,
  `k` mountain, `n` night.

The gate sits at the bottom centre, the Meadow south-west, Lakeside south-east, Rocky Mountain north-west and the Night
Forest north-east. Paths join them through the middle. Each area has 3–5 grass patches, 1–2 items and one sign, and
ledges make one-way shortcuts.

### `zepimon-mobile/scripts/build-safari-map.py` (Pillow, no network beyond the pinned downloads)
1. **Sources.** It downloads missing files from rh-hideout/pokeemerald-expansion at the pinned revision
   `0ecb1115129ccb7eb3a7e0dc3718dc263ab84011` into `hatdog-app/data/walk-source/` (the shared cache), following
   `build-move-sprites.py`:
   - `data/tilesets/primary/general/` (`tiles.png`, `metatiles.bin`, `palettes/*.pal`), plus **one secondary tileset**
     for mountain rock and fences. It is chosen in the first plan task from a metatile reference sheet, and the script
     records which one.
   - `graphics/object_events/pics/people/{brendan,may}/walking.png` and `graphics/object_events/palettes/{brendan,may}.pal`
   - `graphics/object_events/pics/misc/ball_poke.png` (item ball) and `pushable_boulder.png`
   - `graphics/field_effects/pics/tall_grass.png`, `ground_impact_dust.png`, `shadow_medium.png`
   - `graphics/battle_environment/{long_grass,pond_water}/` (`tiles.png`, `map.bin`, `palette.pal`)
   - `graphics/balls/safari.png`
2. **Metatiles.** It decodes Emerald metatiles (16 × 16 px: bottom and top layers of four 8 × 8 tiles, each with tile
   index, flips and palette) from the primary and secondary tilesets. A table in the script maps each layout character
   and its neighbour case (water edges, tree clusters, path borders, ledge ends) to metatile IDs. The IDs are picked
   from a reference sheet the script can write to `tmp/` (not committed).
3. **Chunks.** It writes the map as **8 × 8-tile chunks**, enlarged **4×** with nearest-neighbour scaling (64 px per tile,
   512 × 512 px per chunk), to `zepimon-mobile/assets/safari/`:
   - `ground-<cx>-<cy>.png` for every chunk.
   - `top-<cx>-<cy>.png` only for chunks with top-layer pixels (tree crowns, roofs, sign tops), drawn over the trainer.
   - Night Forest tiles are darkened with a cool blue tint in both layers.
4. **Sprites.**
   - `brendan.png` and `may.png`: 12-frame strips (stand, step A, step B for south, north, west and east), 16 × 32 frames
     enlarged 4×. The script asserts Emerald's 9-frame layout (an indexed 144 × 32 sheet: south, north and west
     standing, then two steps each for south, north and west) and mirrors west for east.
   - **Outfit recolour**, applied before enlarging. Each rule swaps a palette index for a new colour **only inside a
     band of rows** of the 16 × 32 frame, so the same index elsewhere (the green backpack, red shoes, skin) keeps its
     colour:

     | Trainer | Rows | Index → colour |
     |---|---|---|
     | Brendan (cap band) | 0–19 | 10 → `#A474EE` light purple · 11 → `#6A3FC8` purple |
     | Brendan (shirt) | 21–27 | 8 → `#282830` black · 4 → `#484856` dark grey · 13 → `#CECEDE` white shade · 12 → `#F8F8F8` white |
     | May (bandana) | 0–17 | 10 → `#A474EE` · 11 → `#6A3FC8` |
     | May (top) | 21–27 | 13 → `#282830` black · 12 → `#484856` dark grey |

     The white of Brendan's cap (9, 14) and of May's bandana and sleeves (9, 14) stays white. The rules live in one
     table in the script and match the throwaway preview shown during brainstorming on 2026-10-28.
   - `grass.png`, `dust.png`, `shadow.png`, `item.png`, `boulder.png` and `safari-ball.png`, each enlarged 4×.
   - `battle-grass.png` and `battle-pond.png`: rendered from the battle-environment tilemaps and palettes, then enlarged.
5. **Data.** It writes `zepimon-mobile/src/generated/safari-map.js` containing `cols`, `rows`, `tiles` (one string per
   row, using the layout characters), `areas` (one string per row), `starts` (`gate`, `meadow`, `lake`, `mountain`,
   `night` as `{ x, y }`), `chunk` (8), and `chunks` (`{ ground, top? }` image requires keyed by `"cx,cy"`), plus the
   `require`s for the sprites above.
6. **Validation** (the build fails, writing nothing): mismatched file sizes, unknown characters, missing or wrong-size
   source sheets, more or fewer than 6 items, a missing start, or grass in the gate area.

**Credits:** add a "Safari Zone" section to `SPRITE-CREDITS.md` listing the tilesets, object events, field effects,
battle environments and ball, at the same pinned revision and under the same upstream credits.

**Size:** about 36 ground chunks plus the top layers, sprites and two backgrounds, roughly 2–3 MB.

## Code structure

| Unit | Job | Depends on |
|---|---|---|
| `src/games/safari.ts` (trimmed) | **Catch rules.** Game status, balls, chain, encounter, ring clock (`elapsed`, advanced by `tickSafari` while playing, with **no** time limit), `throwBall` / `throwBait` / `throwRock` / `runAway`, `catchChance`, `fleeChance`, the new `shinyOdds`, `pauseSafari` / `resumeSafari`, and the Dex functions (`addSafariCatch`, `restoreSafariDex`, `withSafariCatches`). **Removed:** `PATCHES`, `RUSTLE_MS`, `SAFARI_DURATION`, `rustle` / `nextRustle`, `approachPatch`. **New:** `meetWild(game, zone, random)`. | `roster.ts` |
| `src/games/safari-zone.ts` (new, no screen code) | **Walking rules.** The zone state (position, facing, buddy tile, steps left, items taken, rustle tile and next rustle step, grass cooldown, pending gate prompt) layered on `SafariGame`. `startZone(start, bonusKm, now, random)`; `walk(game, direction, now, random)` returns `{ game, event }`, where `event` is `moved`, `bumped`, `hopped`, `item`, `sign`, `rustle`, `encounter`, `gate` or `out-of-steps`; `confirmLeave` / `stayInZone`; `pathTo(from, to)` (breadth-first search over the tile grid that crosses ledges only downhill and returns `null` when unreachable); `areaAt`, `tileAt`. | `safari.ts`, `generated/safari-map.js` |
| `src/games/SafariZone.tsx` (new; replaces `SafariHunt.tsx`) | Start panel, HUD (steps, balls, caught, area), map ↔ encounter switch, gate prompt, results panel (moved from `SafariHunt.tsx`), catch-saving news (as now), fill mode while playing. Props as `SafariHunt` today, except that `zone` now means the start area and `bonusBalls` becomes `bonusKm`, from which both extra balls and extra steps follow. `play.tsx`'s bonus note then mentions steps too. | the units below |
| `src/games/SafariWorld.tsx` | Draws the map. The trainer is centred and the map container slides under it. It mounts only chunks within one chunk of the viewport, draws trainer and buddy strips (the `Strip` technique from `DefenseGame.tsx`), grass rustle, dust, shadow and items, and glides each step over `STEP_MS` = **220 ms** with Reanimated (reduced motion: no glide). In tap mode it turns a tap into a tile and flashes ✕ on unreachable tiles. | `safari-map.js`, Reanimated |
| `src/games/SafariEncounter.tsx` | Flash and wipe, battle background, Pokémon, Shiny sparkle, ring (moved from `SafariHunt.tsx`) and the action buttons. | `safari.ts` |
| `src/games/DPad.tsx` | Four buttons. Press-and-hold repeats a step every `STEP_MS`, and a press during a step is queued as the next direction. On the web, arrow keys and WASD do the same. | — |

**Data flow:** input (D-pad, tap path step or key) → `walk()` → new state plus event → `SafariWorld` animates the event
→ the next queued step. The pure logic never waits on animation. Tap-to-walk walks the `pathTo` result one step per
`STEP_MS` and stops on `encounter`, `item`, `gate`, `out-of-steps` or any new input. `useGameLoop` keeps driving
`tickSafari` (the ring clock) and pausing.

**Preferences** (`src/preferences.ts`): add `safariControls: 'dpad' | 'tap'` (default `'dpad'`) and
`safariTrainer: 'brendan' | 'may'` (default `'brendan'`). `restorePreferences` falls back per setting, as it does now.

**Screen fit:** while playing, call `setFill(true)` from `GameScreenContext`, as running battles do. The tile size is
`clamp(floor(viewportWidth / 9), 40, 64)` points. The viewport height is what remains after the HUD and controls.

**Other edits:**
- `src/app/(tabs)/play.tsx`: use `SafariZone`; the card becomes "04 · HUNTING · Safari Zone" with new copy.
- `src/games/AdventureMap.tsx`: `MODE_NAMES.safari` becomes "Safari Zone".
- `src/games/scores.ts`: the new limit (39).
- `README.md`: replace the Safari Hunt text in "Adventure games" and "Mini-games".
- `SPRITE-CREDITS.md`: the new section.

## Edge cases

- **Pause** (tab blur, app background): the round pauses, held input is released, any tap path is cleared, and the ring
  clock stops. "Back to arcade" discards the round, as now.
- **Ledge traps:** a map test requires the gate to be reachable from every tile reachable from any start.
- **Last step into grass:** the encounter plays out, then the round ends.
- **Out of balls mid-encounter:** today's behaviour (the round ends).
- **Tap-to-walk:** an unreachable target shows ✕ and doesn't move you. A target that is a wall walks to the nearest
  reachable neighbour if there is one. A new tap or D-pad press replaces the path.
- **Catch save failure:** today's message ("Could not save … Your other catches are safe.").
- **Memory:** chunks more than one chunk outside the viewport unmount.

## Accessibility

- D-pad buttons are labelled "Walk north", "Walk south", "Walk west" and "Walk east", each at least 48 × 48 points.
- An `accessibilityLiveRegion="polite"` status line announces area changes, bumps ("A tree is in the way"), stepping
  into grass, rustles, items, signs, encounters and the gate prompt.
- HUD values have labels ("Steps left: 312").
- Text uses theme colours, so `tests/palettes.test.js` keeps covering contrast. The map art itself keeps Emerald's colours.
- Reduced motion turns off the step glide, the flash and wipe, the grass shake animation and the moving sparkle (it
  shows a still frame).

## Testing

- **`tests/safari-zone.test.js` (new)**, with seeded `random` helpers as in `safari.test.js`:
  - Bumping costs no steps, and moving costs one.
  - Ledges: a hop moves two tiles for one step and fails from below or from the side.
  - Items: +3 balls, once per round.
  - Grass: the rate is about 0.1 over many seeded steps, the cooldown blocks rolls for 3 steps, and a rustle always
    leads to an encounter.
  - Rustles appear every 25 steps, in range and in the current area.
  - The buddy takes the previous tile.
  - Bonus km adds 50 steps each, capped at 3.
  - The round ends at 0 steps (after a pending encounter) and on `confirmLeave`; `stayInZone` costs no step.
  - `pathTo`: shortest path, never uphill over a ledge, `null` when unreachable.
- **Map checks (in the same file)**, on `generated/safari-map.js`:
  - The size matches, and all four areas have grass.
  - Every start is walkable.
  - Every grass tile and item can be reached from the gate start, and the gate can be reached from every reachable tile.
  - Every chunk has a ground image.
- **`tests/safari.test.js`:** remove the patch and timer tests, then add `meetWild` (pool per zone, chain 35%) and the
  100/77/54/31/8 Shiny curve. The existing catch, flee, bait, rock and Dex tests stay.
- **`tests/adventure.test.js`:** the new `SCORE_LIMITS.safari`.
- **Preferences:** the new fields restore safely from missing or garbage values.
- **Before calling it done:** `npm test`, `npm run lint`, `npm run typecheck`. Then walk through the web build with
  Playwright (restart Metro first, since it misses edits in this OneDrive folder) covering start, walking, a ledge, an
  item, an encounter and catch, the gate and results. Smoothness on a real Android phone is checked by the owner on
  device.

## Out of scope

Surfing, fishing, bikes, NPC trainers on the map, Pokéblock feeders, animated water and flowers, a day/night cycle, and
saving a round in progress.
