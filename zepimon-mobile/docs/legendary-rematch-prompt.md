# Task: Shrine Revisits: replay trials and rematch caught Legendaries

You are working in the Zepimon repository, an Expo / React Native app in `zepimon-mobile/`. Read `zepimon-mobile/AGENTS.md` first.

## Goal

Today a Legendary Expedition only opens when the player is eligible: 25 km walked, an Expedition Quest done, or an Expedition Permit. Each encounter runs **trial → chamber → battle → catch** once, and the catch claims it for good.

Add **Shrine Revisits**: for every Legendary the player has **already caught**, they can come back at any time, with no permit, distance or quest needed, to:

1. **Revisit the trial:** replay its puzzle rooms (Switch Maze, Crumbling Floor, Dark Labyrinth, Ancient Temple, Warp Chamber, or the Shattered Star island for Deoxys).
2. **Battle it again:** a rematch against that Legendary in the existing battle.

Revisits are practice and fun. They must **never** claim an encounter, add or change a Dex entry, roll a Shiny, use or give a permit, or change claim order. The existing expedition flow stays exactly as it is.

## Stack

Expo SDK 57, React Native 0.86, Expo Router, TypeScript.

- **Tests:** `node --test tests/*.test.js` (`.js` tests import `.ts` directly).
- **Checks:** `npm test`, `npm run lint`, `npm run typecheck`, all run in `zepimon-mobile/`.
- **Dependencies:** none new.

## What exists (reuse it, don't rebuild it)

- **Caught Legendaries:** `expeditions.dex` in the store (`src/store.tsx`, type in `src/expeditions.ts`). It is keyed `'Name'` or `'Shiny Name'`. The canonical species order is `legendarySpecies` in `src/generated/expedition.js`.
- **Trials:**
  - `src/games/trials.ts`: `trialFor(name, records)` gives `{ title, lore, kind, stages }`, and `KIND_NAMES` holds the kind names.
  - `src/generated/trial-maps.js`: `trialStages` with ids `<kind>-tutorial`, `<kind>-1|2|3`, and `star`.
  - `src/games/LegendaryTrial.tsx`: the trial screen. Its props are `trial`, `checkpoint`, `onCheckpoint`, `onSolved(results)` and `onLeave(run)`.
- **Battle:** `src/games/LegendaryBattle.tsx`, with props `foe`, `partner`, `number`, `reduced`, `onCaught`, `onLeave` and `onDone`. In an expedition, `onCaught` calls `store.befriend(key, index)`, which claims the encounter (`src/app/expeditions.tsx` ~line 73). **A rematch must not call `befriend`.**
- **Records:** `store.trialRecords` (stage id → best moves) and `saveTrialRecords` in `trials.ts`. The trial arcade achievements in `src/games/achievements.ts` read these records.
- **Screen:** `src/app/expeditions.tsx` is a small step machine: `overview | lanterns | trial | chamber | battle`. It wraps the trial step in `Screen fill`.

## What to build

### On the Expeditions overview

Add a **"Shrine Revisits"** section that lists every caught Legendary, in `legendarySpecies` order.

- **Shiny catches:** a Shiny catch is its own entry, marked ✦ (e.g. "Shiny Rayquaza").
- **Each row shows:** the sprite (existing `PixelSprite`), the name, the trial title and kind (`trialFor(name, …).title · KIND_NAMES[kind]`), and two buttons: **Revisit the trial** and **Battle again**.
- **Empty state:** "Catch a Legendary on an expedition to revisit its shrine here."
- **Placement:** the section appears whether or not an expedition is currently open, and it doesn't need any permit.

### Revisit the trial

1. **Pick a room.** Show a room picker for that Legendary's kind:
   - Maze kinds offer Tutorial, Room 1, Room 2 and Room 3.
   - Deoxys has only the island (`star`), so skip the picker.
   - Show each room's best moves and par when known, e.g. "Room 2 · best 64 · par 58".
2. **Play it.** Open `LegendaryTrial` with `trial = { ...trialFor(name, records), stages: [pickedId] }` and no checkpoint.
3. **Saving.**
   - Practice runs are **not** saved mid-room: `onCheckpoint` is a no-op, and leaving just returns to the overview.
   - On a clear, save the room's moves to `trialRecords`, keeping the lower value (`saveTrialRecords`).
   - Show "Room cleared in N moves (best M)", then return to the room picker. **No chamber, no battle, no claim.**
4. **Screen text.** Add a `practice` prop to `LegendaryTrial` that changes only its copy:
   - eyebrow "SHRINE REVISIT"
   - the finish line "Room cleared!" (not "a presence stirs…")
   - the Leave chip returns to Shrine Revisits
   - on the island, the Deoxys reveal still plays. It's the fun part.

### Battle again

1. Open `LegendaryBattle` with `foe = { name, shiny }` as caught, and the player's current partner as today.
2. Add a `rematch` prop:
   - `onCaught` does **nothing to the store**.
   - The success text reads "You won the rematch! {Name} returns to your team." instead of any "joined your Dex" or new-catch wording.
   - The battle's failure and run-away paths simply end the rematch.
3. `number` (the encounter number) isn't meaningful in a rematch. Hide it or show "REMATCH" in its place.
4. Optional but nice: count rematch wins per Legendary in a new store field `rematchWins: Record<string, number>`.
   - Keyed like the Dex.
   - Restored like the other saved fields.
   - Included in backups wherever `trialRecords` is.
   - Shown on the row as "Rematch wins: 3".

   Skip this if it adds risk.

### Rules (must hold, with tests)

- Revisits are available only for names in `expeditions.dex`. A crafted call for an uncaught Legendary is refused.
- Nothing in a revisit or rematch changes:
  - `expeditions.trails`
  - `expeditions.dex`
  - `quest` (permits)
  - `encounters` (active encounter, Shiny roll, checkpoint)
- Practice clears update `trialRecords` with the lower moves only.
- The normal expedition flow (trial → chamber → battle → catch) and all existing tests stay unchanged.

## Folders and files

```
zepimon-mobile/src/
├── games/
│   ├── revisits.ts          NEW     pure helpers, no React:
│   │                                  caughtLegendaries(dex) → [{ name, shiny, key }] in legendarySpecies order
│   │                                  revisitRooms(name) → stage ids for that Legendary's kind ('star' only for Deoxys)
│   │                                  canRevisit(dex, name, shiny) → boolean
│   ├── LegendaryTrial.tsx   CHANGE  optional `practice` prop (copy only)
│   └── LegendaryBattle.tsx  CHANGE  optional `rematch` prop (copy + no claim)
├── app/expeditions.tsx      CHANGE  Shrine Revisits section; steps 'revisit-rooms' | 'revisit-trial' | 'rematch'
├── store.tsx                CHANGE  recordPracticeClear(results) → trialRecords only; (optional) rematchWins
└── backup.ts                CHANGE  only if you add rematchWins
zepimon-mobile/tests/
├── revisits.test.js         NEW     helpers + "nothing but trialRecords changes" rules
└── backup.test.js           CHANGE  only if you add rematchWins
zepimon-mobile/README.md     CHANGE  short "Shrine Revisits" paragraph in the Expeditions section
```

Follow the existing style: no semicolons, single quotes, short comments that say what a rule is.

## Steps

1. `revisits.ts` and its tests first, including a test that a practice clear changes only `trialRecords`.
2. The store method `recordPracticeClear`.
3. The `practice` prop on `LegendaryTrial` and the `rematch` prop on `LegendaryBattle`, copy only. Expedition behaviour stays identical when these props are absent.
4. The Expeditions section and the new steps. The trial step keeps `Screen fill`.
5. README.
6. Run `npm test`, `npm run lint` and `npm run typecheck`. Then bump `app.json` `version` (minor) and `android.versionCode` (+1) above whatever is on `main` when you start.

## Acceptance criteria

- [ ] A caught Legendary appears in Shrine Revisits with no permit, distance or open encounter needed. An uncaught one never appears.
- [ ] Revisit the trial lets you pick any room of that Legendary's kind (just the island for Deoxys), play it, and on a clear saves the best moves and returns. Leaving mid-room saves nothing.
- [ ] Battle again runs the existing battle against the caught form (Shiny if the catch was Shiny). Winning or losing never changes the Dex, trails, permits or encounters.
- [ ] The normal expedition flow is unchanged, and an active encounter's checkpoint is untouched by any revisit.
- [ ] It works on phone sizes 360×740 and 390×844, and the trial still fits without scrolling.
- [ ] `npm test`, `npm run lint` and `npm run typecheck` pass.

## Notes

- **Immersive play may land first.** Another branch may add an immersive full-screen mode to `LegendaryTrial` (see `zepimon-mobile/docs/immersive-play-prompt.md`). Start from the latest `main`. If that work has landed, make sure practice mode works inside it too.
- **Git:** work on a new branch from `main` and open a pull request. Don't merge or push to `main`. Stage files by name; never use `git add -A`.
- **Report:** in the PR, list the files changed, the test, lint and typecheck output, and anything you couldn't test (for example, on a real device).
