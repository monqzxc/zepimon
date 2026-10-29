# Prompt for your local coding agent: integrate the finalized Zepimon expedition

Open the **existing Zepimon repository root** as the workspace. The sibling folder `zepimon-expeditions-bundle/` contains the prototype and specification. Read these first:

1. `zepimon-expeditions-bundle/EXPEDITION_FINAL_SPEC.md`
2. `zepimon-expeditions-bundle/integration/INTEGRATION.md`
3. `zepimon-expeditions-bundle/prototype/index.html`
4. `hatdog-app/shared/expedition.js`
5. The existing mobile expedition screen, store/persistence queue, Dex code, generated contract, and tests.

Implement the expedition feature in the existing React Native app; do not simply copy the HTML into production and do not stop at a plan. Start with a concise file map and implementation plan, then make the changes and run the available checks.

## Required player flow

Saved completed walk/run distance → clues at 5 km and 15 km → unlock the next encounter through either (A) the primary 25 km Distance Route or (B) the alternative Expedition Quest (three valid saved activity sessions plus a separate themed challenge, awarding one Expedition Permit) → species-themed interactive maze/trial → pre-battle chamber with entrance animation and shiny reveal → Generation 3-inspired turn-based battle → Poké Ball catch attempt → successful catch updates the existing Dex and claims the encounter once.

## Unlock routes and quest requirements

- Keep the 25 km Distance Route as the primary and default route. Only completed, saved walk/run sessions contribute; never credit live/unsaved distance.
- Implement an alternative **Expedition Quest** for players who have not reached 25 km. Initial suggested requirement: **three valid saved activity sessions plus one separate themed quest challenge**. Completing it awards exactly one **Expedition Permit**.
- The quest challenge is separate from the Legendary's required maze/trial. An earned permit unlocks the same next Legendary encounter and does not skip the maze, shiny reveal, battle, catching, or Dex flow.
- Show the two routes and their progress separately. Make it clear that the quest route is an alternative to the 25 km requirement, not an extra requirement after it.
- Persist quest progress, completion, and permit state through existing store/persistence/sync conventions. Prevent duplicate session counting, duplicate permit awards/consumption, and repeated claims after imports or app reopen.
- Preserve encounter claim ordering. Consume a permit once when the alternative route unlocks the next eligible encounter; leaving the chamber or a failed catch must not consume another permit or relock the already unlocked encounter.
- Keep quest state separate from the canonical watch/phone trail contract unless repository inspection shows an existing suitable field. Do not casually migrate saved data.
- The standalone HTML prototype's custom-distance controls are demo-only. Do not add any custom-distance entry to the production UI, and never treat typed distance or demo controls as valid activity or quest proof. Keep developer simulation isolated from production rewards.

## Product rules

- Shiny chance is **1 in 100 (1%) per active encounter roll**.
- The first roll occurs when the player first enters the pre-battle chamber after completing the puzzle.
- The species is fixed for that encounter and does not change on reset.
- **Reset cooldown is 5 seconds.** Confirm the reset, show a countdown, and roll again only after the cooldown completes.
- A shiny result must show a stronger confirmation before it can be discarded by resetting.
- Refresh, navigation, app close/reopen, or re-entering the chamber must not silently reroll the shiny result.
- Persist the active encounter result, attempt count, reset-pending flag, and absolute `nextResetAllowedAt` timestamp using existing project persistence conventions. Resume a reset already in progress after reopening.
- The maze stays completed when the player resets or leaves and returns.
- Resetting must not award distance, change the species, reorder encounters, or claim anything.
- The reset control exists only before battle. Do not permit mid-battle shiny rerolls.
- Leaving or failing a catch must not consume the encounter. Only successful capture triggers the existing claim/befriend/Dex flow, exactly once.
- Battle damage must not accidentally knock out the Legendary before the player can catch it.

## Compatibility requirements

- Preserve the canonical species selection formula and species order.
- The older project summary described a deterministic 1-in-50 shiny calculation. The new design requires 1-in-100 rolls for the active encounter/reset flow. Do not silently change previously claimed rewards. Implement and document a deliberate compatibility/migration strategy for unclaimed encounters; keep active encounter rolls separate from the canonical species-selection function.
- `hatdog-app/shared/expedition.js` remains canonical. Do not edit generated `zepimon-mobile/src/generated/expedition.js` by hand; use the existing sync command after an approved shared-contract change.
- Preserve the existing watch/phone trail separation, saved data contracts, claim ordering, merge/import rules, and persistence queue.
- Count only completed/saved sessions. Reuse existing weekly-distance calculations.
- Use existing project UI, navigation, state, and inventory conventions. Do not invent store APIs; inspect them first.
- Use original, user-provided, or properly licensed pixel-art assets. The HTML prototype uses emoji placeholders, not production Pokémon sprites.

## Required implementation details

- Implement and test both unlock routes: 25 km of valid saved distance, or three valid saved activity sessions plus the themed Expedition Quest challenge.
- Make the Expedition Permit award and use idempotent across persistence, repeated app opens, and watch/phone/cloud imports.
- Do not require 25 km for an encounter already legitimately unlocked by an Expedition Permit; keep encounter claim order and normal trial/battle/catch rules intact.

- Modular maze/trial logic with touch controls and keyboard support where applicable.
- Species-themed trials, with a real interactive maze at minimum; add switch/sequence/riddle trials where appropriate.
- GBA-inspired entrance, idle, attack, damage, Poké Ball throw/shake, catch success/failure animations. Respect reduced-motion settings.
- A battle state machine with clear state transitions and protected capture flow.
- Tests for the 25 km threshold, quest-session counting, quest challenge completion, exactly-once permit award/consumption, alternative unlock below 25 km, duplicate sync/import behavior, maze collisions/completion, persisted 1-in-100 rolls, five-second cooldown, refresh/reopen behavior, reset during a pending cooldown, shiny reset confirmation, species stability, catch failure, and exactly-once Dex/claim updates.

## Validation

Run the repository's actual available commands, including as applicable:

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npx expo start --web`
- existing watch-app checks and the existing sync command if the canonical shared contract changes.

Do not claim checks passed unless they were executed. Report exact files changed, test outcomes, missing assets, migration choices, and remaining limitations. Keep the standalone prototype available as a reference.
