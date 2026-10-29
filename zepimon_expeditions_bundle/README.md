# Zepimon Legendary Expeditions — integration starter + playable prototype

This bundle is based on the uploaded **Explore Expeditions: implementation summary and guide** (2026-10-28).

It contains:
- `integration/expedition.ts` — pure expedition constants, validation, seeded encounter selection, progress helpers, claim logic, and merge helpers.
- `integration/phone-adventure.ts` — phone-run trail adapter and clue/encounter notices.
- `integration/expeditions-screen.example.tsx` — an example Expo Router / React Native screen scaffold to adapt to your app's existing UI components and store.
- `integration/INTEGRATION.md` — integration map and compatibility cautions.
- `EXPEDITION_FINAL_SPEC.md` — consolidated final player flow, shiny/reset rules, production architecture, and acceptance checklist.
- `LOCAL_AGENT_PROMPT.md` — copy-ready instructions for a coding agent opened on the local repository.
- `prototype/index.html` — a standalone playable browser prototype. It simulates saved walk/run distance; it does not use GPS, a watch bridge, Supabase, or your app's AsyncStorage. Its custom-distance field is strictly a demo testing control, not a production feature.

## Important compatibility note

Your guide says the canonical shared contract already lives in `hatdog-app/shared/expedition.js` and is copied into the phone app by `npm run sync:watch`. It also says the species order, seeded shiny hash, claim order, and saved-data shape must remain stable.

Therefore, treat `integration/expedition.ts` as a **reference/adaptation module**, not a drop-in replacement for your canonical contract. Before integrating:
1. Compare the seed/hash implementation against your existing `hatdog-app/shared/expedition.js`.
2. Prefer importing the existing generated contract at `zepimon-mobile/src/generated/expedition.js` for species draws and validation, rather than maintaining a second implementation.
3. Keep your existing `src/expeditions.ts` claim/import/restore code and `src/store.tsx` persistence path authoritative.
4. Do not edit `src/generated/expedition.js` by hand. Change the shared watch contract only when necessary, then run `npm run sync:watch`.

The files here are starter code and have **not been run against your repository**. Adapt import paths, type names, and UI components to match the real files in your checkout.

## Play the prototype

Open `prototype/index.html` directly in a modern browser. No install or build step is required. Use the `+1 km`, `+5 km`, or custom distance controls to simulate a completed, saved walk/run. Clues unlock at 5 km and 15 km of each 25 km leg; an encounter unlocks at 25 km. Encounters are claimed in order and do not expire. Each encounter first opens a playable 7×7 maze trial with species-themed lore; use arrow buttons or arrow keys/WASD to reach the exit. Only then does the Generation-3-inspired battle open: fight to lower HP, then use a Poké Ball. A failed catch leaves the encounter available. The prototype persists its demo state in browser local storage.

The prototype adds a playable maze trial before the retro, Generation-3-inspired battle. Reach the exit to enter battle; walls block movement, the maze can be restarted, and leaving the trial does not consume the encounter. Fight actions lower HP; Poké Balls have a better catch chance at low HP. A failed catch or leaving the battle does not consume the encounter. The prototype intentionally uses demo-only local state and a simple deterministic reward draw. It is not connected to your real Dex, watch, GPS, or cloud sync.


## Battle animation update

The browser prototype now includes GBA-inspired CSS animation effects: the wild encounter slides in from the right, the trainer marker enters from the left, the battlefield flashes briefly, the opponent idles with a subtle bob, attacks lunge, damage flashes the sprite, and Poké Balls arc toward the target before shaking or opening. These are prototype effects applied to placeholder symbols, not authentic Pokémon sprite sheets. Production React Native integration and licensed/user-provided pixel-art assets remain separate tasks. Reduced-motion preferences are respected.


## Finalized encounter design

The intended complete flow is either the primary 25 km Distance Route or an alternative Expedition Quest (three valid saved activity sessions plus a separate themed challenge that awards one Expedition Permit) → species-themed maze → pre-battle Legendary reveal → Generation 3-inspired battle → Poké Ball attempt → Dex reward. Shiny chance is **1 in 100 per encounter roll** and explicit pre-battle reset has a **5-second persisted cooldown**. The active result survives refresh/reopen; only the Reset Encounter action can request another roll. See `EXPEDITION_FINAL_SPEC.md` for the full design and production integration constraints.


## Alternative unlock route

Production should offer two unlock routes: the primary 25 km saved-distance route and an alternative Expedition Quest requiring three valid saved activity sessions plus a separate themed challenge. The quest awards one persisted Expedition Permit that unlocks the same next encounter and normal gameplay. Custom-distance entry and simulated sessions remain browser-demo-only and must never be included in the production player flow. The browser prototype has not yet been updated to demonstrate this alternative quest route; implement it in the real app based on `EXPEDITION_FINAL_SPEC.md` and `LOCAL_AGENT_PROMPT.md`.
