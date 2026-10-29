# Zepimon Legendary Expeditions — Final Feature Specification

**Status:** Product/implementation specification plus standalone browser prototype. This is not a claim that the private React Native app has already been integrated.

## Player journey

1. A completed and saved walk/run adds distance to the appropriate expedition trail.
2. At **5 km**, reveal the first clue; at **15 km**, reveal a deeper clue.
3. Unlock the next Legendary encounter through either of two legitimate routes: **Distance Route** (25 km of saved walk/run distance per unclaimed expedition) or **Expedition Quest** (complete three valid saved activity sessions plus a separate themed challenge to earn one Expedition Permit). Encounters are claimed in order.
4. Choose **Begin Trial**. The encounter's species is fixed by the existing canonical species-selection contract.
5. Solve a species-themed maze/trial. Touch buttons and keyboard arrows/WASD work in the browser prototype. Walls block movement; reach the exit to finish.
6. Trial completion is preserved. Reopening the encounter does not force the player to repeat a completed maze.
7. Enter the **pre-battle chamber**. The Legendary's current shiny result is revealed with a GBA-inspired entrance animation.
8. Choose **BATTLE**, **RESET ENCOUNTER**, or **LEAVE CHAMBER**.
9. Battle in a Generation-3-inspired, turn-based interface. Fight actions lower the Legendary's HP but never reduce it below 1, so the player cannot accidentally knock it out in this prototype.
10. Use **BAG → POKÉ BALL**. Lower HP improves catch odds. Failed throws do not consume the expedition encounter; a successful catch adds the demo reward to the Expedition Dex and advances the claim count.

## Alternative unlock route: Expedition Quest

- The **Distance Route** remains the primary route: 25 km of valid, saved walk/run distance unlocks the next encounter.
- The **Expedition Quest** is an alternative for players who have not reached 25 km. Suggested initial requirement: complete **three valid saved activity sessions** and one separate themed quest challenge. Completing the quest awards one **Expedition Permit**.
- An Expedition Permit unlocks the same next Legendary expedition and the same maze, pre-battle chamber, battle, catch, and Dex reward. It does not grant a free catch or skip the gameplay.
- Quest progress must be based on real persisted activity sessions and in-game objectives. User-entered distance, unsaved/live distance, repeated imports, and demo simulation must never count as production proof.
- Keep distance progress and quest progress visibly separate in the UI. Clearly explain what remains to complete each route.
- Persist quest progress and permit state using the existing app persistence queue and synchronization rules. Prevent duplicate quest completion, permit awards, permit consumption, and encounter claims.
- Do not modify the existing watch/phone trail data contract merely to store quest state. Store additional quest state separately using established project conventions.
- If a player unlocks the next encounter via the quest route, the normal 25 km distance requirement is not required for that encounter. Claim ordering still applies, and a permit is consumed once when the encounter is legitimately unlocked. A failed catch or leaving the encounter must not consume another permit or duplicate the unlock.
- Keep any custom-distance input and encounter simulation strictly in the standalone browser demo/developer tooling. Never expose these as production player controls or accept them as quest progress.

## Shiny and reset rules

- **Shiny probability:** 1 in 100 (1%) per encounter roll.
- The first roll occurs when the player reaches the pre-battle chamber after completing the trial.
- **Reset cooldown:** 5 seconds after a confirmed reset. Show a visible countdown/status while the shrine gathers energy.
- A reset must be an explicit player action; screen refresh, app reopen, navigation, and ordinary re-entry must never silently reroll the result.
- Species does not change during a reset. Only the shiny result changes.
- Trial completion and walking distance remain unchanged during reset.
- The active encounter result, attempt count, reset-in-progress flag, and cooldown timestamp are persisted in the browser prototype's `localStorage`.
- If the player has a shiny result, show a stronger confirmation before resetting because that action discards the shiny result.
- The reset control is only present before the battle begins. Do not add a mid-battle shiny reroll.
- A catch, run, failed catch, or leaving the chamber must not accidentally create duplicate claims or Dex entries.

## Visual and interaction direction

- Aim for a **Pokémon Emerald / Generation 3 GBA-inspired** presentation: crisp pixel-like typography, flat palette, chunky outlines, HP bars, fixed battle layout, entrance/idle/attack/hit/capture animation beats.
- The browser demo currently uses placeholder emoji for creature art. Replace these with original, user-provided, or properly licensed pixel-art sprites before production release.
- Respect reduced-motion preferences and keep controls touch-friendly.
- Suggested animation beats: puzzle exit → shrine reveal → Legendary slides in from the right → battle intro message → idle bob → attack lunge/hit flash → Poké Ball throw and shake → catch success.

## Recommended production architecture

Keep the existing app authoritative and implement this as a modular feature, not a separate data system:

- `hatdog-app/shared/expedition.js` remains the canonical shared species/progress contract.
- `zepimon-mobile/src/generated/expedition.js` remains generated; never edit it by hand. Run the existing sync script after any approved shared-contract changes.
- Adapt the existing expedition screen and store instead of replacing them.
- Route persistence through the existing store persistence queue; do not write directly to AsyncStorage from new UI components.
- Keep the existing saved expedition shape and watch/phone trail separation unless the project owner explicitly approves a migration.
- Store active encounter attempt details separately from the core watch trail: species/index, shiny result, attempt number, trial completion, reset pending flag, and `nextResetAllowedAt`. Reuse the project's existing storage conventions.
- Use an absolute timestamp for cooldowns, not a timer alone, so refresh/reopen cannot bypass the delay.
- Keep successful catch idempotent: call the existing claim/befriend and Dex path once, only after capture succeeds.
- Preserve the canonical species order/formula and all existing claim/import/merge rules.

### Important compatibility decision: old shiny odds

The original project summary described a canonical deterministic **1-in-50** shiny calculation. The new product requirement in this spec is **1-in-100 per active encounter roll**, with deliberate pre-battle resets. Do not silently rewrite previously claimed rewards or change species selection. Implement the resettable 1-in-100 roll as persisted active-encounter state for the new encounter flow, and explicitly review how unclaimed legacy encounters migrate. If the team decides to change the canonical contract, update it intentionally, test existing save compatibility, and regenerate the mobile copy with the project's sync command.

## Prototype limits

The standalone `prototype/index.html` simulates completed distance and stores demo state in browser `localStorage`. It does not access GPS, the watch bridge, Supabase, or the production Dex. Creature art is placeholder artwork. Production React Native integration, real inventory/ball persistence, server-side anti-tamper protection, and platform-specific animation remain implementation work.

## Acceptance checklist

- [ ] 24,999 m does not unlock an encounter through the Distance Route; 25,000 m does.
- [ ] Three valid saved activity sessions plus the themed quest challenge award exactly one Expedition Permit.
- [ ] An earned permit unlocks the same next encounter without requiring 25 km, while preserving claim order and all normal gameplay.
- [ ] Duplicate session imports or repeated quest completion cannot award or consume multiple permits.
- [ ] Custom-distance inputs and demo simulation are unavailable as production unlock paths.
- [ ] Trial must be completed before the pre-battle chamber opens.
- [ ] Completed trial stays completed when leaving and returning.
- [ ] First chamber entry creates exactly one persisted 1-in-100 shiny result.
- [ ] Screen refresh/reopen preserves the current shiny result.
- [ ] Explicit reset displays a 5-second wait and produces one new roll after the wait.
- [ ] Refreshing during a reset resumes the pending reset instead of freezing or skipping it.
- [ ] Reset preserves species, distance, encounter order, and completed puzzle.
- [ ] Resetting a shiny requires confirmation.
- [ ] Battle starts with the currently persisted shiny status.
- [ ] Failed catch, leave, and battle close do not claim the encounter.
- [ ] Successful catch claims once and adds exactly one Dex record.
- [ ] Existing canonical species draw, trail contracts, merge semantics, and old saves remain compatible.
- [ ] Unit tests, lint, typecheck, and web preview are run in the real repository before release.
