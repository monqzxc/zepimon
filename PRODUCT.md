# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Pokémon fans who walk or run with a Zepp watch (Zepimon watch app) or with the Zepimon phone app. They carry an egg on each walk or run, and the distance hatches and evolves it. They open the phone app before or after an outing to see how their days went, what hatched, and what is next.

## Product Purpose

Zepimon turns everyday walking and running into collecting Pokémon. The phone app (`zepimon-mobile`, Expo / React Native) records phone adventures by GPS, imports or syncs the watch journal, and holds the Dex, personal bests, missions, Legendary Expeditions and mini-games. The Journal tab is where players review their days, their progress over a week, month or year, and their records.

## Positioning

Distance is the only currency: every 5 km in one adventure hatches or evolves the egg (Mega at 21 km, 1 in 50 eggs Shiny), the same rules on watch and phone. Progress is earned outdoors, not bought.

## Operating Context

- Adventures come from two devices: watch records (distance, steps, time; no route) and phone records (GPS distance, time, route; no steps).
- Weeks run Monday to Sunday, matching weekly missions and the Walking bonus.
- Players pick a buddy Pokémon in the Dex, which walks with them across the app.
- Works offline; cloud sync and backup are optional.

## Capabilities and Constraints

- Four themes (Emerald retro default, Gengar, Deoxys, Pikachu), each in light and dark, chosen in Settings; every screen must follow the active theme.
- Reduce motion is honoured (system setting or the app's own).
- Calories are not measured by any device. Where shown, they are an estimate from distance and activity and must be labelled as one.
- The floating tab bar (`src/TabBar.tsx`, Gengar and Poké Ball centre) is a fixed part of the identity.

## Brand Commitments

- Pixel-art Pokémon sprites and the Emerald (GBA Pokémon Emerald) retro look with Pixelify Sans display type; Nunito for everything else.
- Poké Ball motif; Gengar as the app's mascot on the tab bar.

## Evidence on Hand

- Real player data only: adventures, Dex records, personal bests, missions. Demo data: `zepimon-mobile/examples/demo-export.json`.
- Sprites credited in `zepimon-mobile/SPRITE-CREDITS.md`.
- No calorie, heart-rate or step data from phones; do not show invented figures.

## Product Principles

1. Every number on screen is real or explicitly marked as an estimate.
2. The player's own Pokémon are the imagery; no stock art.
3. One codebase, every theme: a screen that only works in one theme is unfinished.
