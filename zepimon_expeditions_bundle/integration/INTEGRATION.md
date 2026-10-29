# Integration guide

## Recommended file placement

```text
zepimon/
├── hatdog-app/
│   └── shared/expedition.js          # existing canonical contract; preserve
├── zepimon-mobile/
│   └── src/
│       ├── generated/expedition.js   # generated copy; never edit by hand
│       ├── expeditions.ts            # existing import/claim/restore layer
│       ├── phone-adventure.ts        # existing phone trail layer
│       ├── store.tsx                 # persist changes through the existing queue
│       └── app/expeditions.tsx        # existing route
└── zepimon-expeditions-bundle/
    ├── integration/
    └── prototype/
```

## Safest integration strategy

1. **Keep your existing contracts.** Your guide specifies the expedition trail as `{ seed, startedAt, meters }` on the watch and `{ seed, startedAt, meters, claimed }` on the phone. The cloud carries the watch snapshot inside the journal JSON. Avoid changing these shapes.
2. **Use the existing canonical draw.** The guide describes `legendarySpecies[(seed + index) % 39]` and a seeded 1-in-50 shiny calculation. The new product requirement is 1-in-100 per explicit active-encounter roll, with a 5-second pre-battle reset cooldown. Preserve the species-selection formula and previously claimed rewards. Implement the new roll as persisted active-encounter state and deliberately review migration for unclaimed legacy encounters; do not silently replace the canonical draw.
3. **Credit only completed sessions.** Add distance when the watch session is saved (`finishSession`) or when the phone GPS run is saved (`savePhoneRun`). Do not credit live/unsaved distance.
4. **Make repeated imports idempotent.** When merging a synced trail, use the existing rule: take the greater meter total and preserve the local `claimed` count. Do not add incoming meters to local meters.
5. **Do not turn friends into workouts.** An expedition friend is a Dex record with source `expedition`; it must not be inserted into run records or counted as km.
6. **Keep claim order.** A claim should only succeed when `index === claimed` and the relevant encounter threshold is reached.
7. **Persist through the store.** Route all writes through the existing `persist()` queue in `src/store.tsx`. Do not write directly to AsyncStorage from a new screen.
8. **Add the weekly total separately.** Your guide recommends displaying the existing watch + phone week distance as a display-only stat. Reuse the current calculation (`missions(...)` or the existing adventure/calendar helpers); do not create a second independent definition of “this week”.

## Suggested implementation order

- First add a display-only `This week: X km · watch + phone` stat using the current weekly-distance calculation.
- Next display progress for all trails (watch and phone) without changing encounter rules.
- Then adapt the screen scaffold in `expeditions-screen.example.tsx` to your actual components and context methods.
- Finally add tests around 24,999 m vs 25,000 m, duplicate syncs, ordered claims, shiny determinism, and Monday week boundaries.

## Expected project checks

From `zepimon-mobile/`, your guide lists:

```bash
npm test
npm run lint
npm run typecheck
npx expo start --web
```

If the web app does not reflect edits, restart Metro before checking.

## Starter caveats

- The code is illustrative and has not been compiled against your private repo.
- The screen example deliberately marks the store adapter as a TODO because the exact exported context API should be copied from your current `src/store.tsx`, not guessed.
- The standalone HTML prototype is independent from the React Native integration files.


## Legendary battle and Poké Ball catch flow

The browser prototype now uses a retro battle screen inspired by Pokémon Generation 3 / Emerald-era GBA presentation (flat palette, chunky borders, HP bars, four-option battle menu). This is a UI/interaction reference, not a pixel-perfect recreation or a source of Pokémon assets.

Flow:
1. At 25 km, the encounter appears in the queue.
2. Choose **Begin Trial** to open the maze. Solve it to unlock the encounter screen.
3. **Fight** lowers the Legendary's HP; lower HP improves catch odds.
4. Open **Bag → Poké Ball** to attempt a catch. A failed throw consumes one demo ball but does not consume the encounter.
5. Only after a successful catch does the prototype add the Pokémon to the demo Dex and advance the claimed count. Leaving the battle also leaves the encounter ready.

For React Native integration, implement this as a transient battle screen/state machine and call the existing claim/befriend store method only after a successful catch. Do not change the canonical reward draw, encounter order, or persisted progress contract. Keep battle HP and ball throws transient unless the product explicitly decides otherwise.


### GBA-inspired animation reference

`prototype/index.html` demonstrates entrance, idle, attack, hit-flash, and Poké Ball throw/shake effects using CSS keyframes. Treat these as interaction references, not production sprite assets. In React Native, recreate the transitions with the animation library already used by the app (or the built-in Animated API), keep animation state separate from canonical expedition state, and use suitable original/licensed pixel-art sprite sheets when available. Respect reduced-motion/accessibility preferences.


## Playable maze gate (prototype)

The browser prototype's encounter queue now calls `beginTrial(index)` rather than opening the battle directly. The trial uses a 7×7 maze, wall collision, touch-friendly direction buttons, keyboard arrows/WASD, restart, and leave controls. Reaching the exit closes the trial and opens the battle; leaving or restarting does not consume the encounter. Species-themed text changes for selected Legendaries. This is still browser-demo logic; port the same flow into React Native and connect successful catches to the existing store/Dex claim method.


## Final shiny-hunting and cooldown requirement

The browser prototype includes a pre-battle chamber after the maze. The initial encounter roll is persisted at 1-in-100. `RESET ENCOUNTER` requires confirmation and waits five seconds before creating one new shiny roll. The species, completed trial, distance, and claim order remain unchanged. Refresh/reopen must not reroll; an in-progress reset is resumed from its persisted timestamp. A shiny result requires stronger confirmation before reset. The reset button is unavailable after the battle begins.

For production, persist encounter-attempt state using the app's established persistence approach (separate from the watch trail contract), including species/index, shiny, attempt number, trial completion, reset-pending state, and an absolute `nextResetAllowedAt` timestamp. Do not make a successful claim until a catch succeeds, and make the Dex/claim operation idempotent. See `../EXPEDITION_FINAL_SPEC.md` for the full final design and acceptance checklist, and `../LOCAL_AGENT_PROMPT.md` for a copy-ready local-agent implementation task.
