# Zepimon

Pixel-sprite Gen 1-4 walking companion for Amazfit Bip 5 Unity (320 x 380).

The app icon is the Gengar sprite from [PokéAPI sprites](https://github.com/PokeAPI/sprites/blob/master/sprites/pokemon/94.png).

```powershell
npm test
npm run build
npm run preview
```

The UI uses the dark pixel theme with blue menus, stepped borders and a cream
distance card. Scenery and frames use native rectangles with existing sprites.
The title screen shows a moonlit forest, lake and path with Gible,
today's total activity distance, **Start Adventure** and **History**.
Start Adventure opens a blue pixel adventure hub with an animated egg,
collection count and New Egg / Continue Adventure / Dex buttons.
New Egg opens generation selection; Continue Adventure opens saved routes.
History opens the latest saved
adventure for each route. An active session takes priority and resumes instead.
Choose a generation, browse the evolution routes, then **Start**.
The generation picker uses blue buttons, with a brighter fill and cream arrow
highlighting the last selected generation. Back from egg browsing returns
to generation selection. All app content starts at or below y=64, leaving
the watch's system app-name/time header visible. No duplicate custom header
is drawn. This follows the rectangular-screen status bar dimensions in the
[Zepp screen adaptation guide](https://docs.zepp.com/docs/v2/guides/best-practice/multi-screen-adaption/).
The **+10** button skips ten routes. Every new adventure starts at zero.
Each press of **Start** rolls a 1-in-100 shiny chance, including existing
adventures. Browsing eggs and reopening an active adventure do not reroll.
Shiny eggs have gold spots and a Shiny label. The same shiny status persists
through normal and Mega evolution, using shiny sprites. Regular and shiny
acquisitions have separate Pokedex entries; a later regular run cannot remove
an acquired shiny. The latest route record still replaces the previous run.

The Pokedex groups normal and shiny acquisitions under one Pokemon name.
Tap the Pokemon's name or sprite to open its records, then select **Normal**
or **Shiny**. Each variant shows its own last distance, steps and finish date;
unlocked variants remain saved and missing variants show **Not acquired**.
Existing saved entries are used directly without migration or clearing.

Sprites gently bounce through six small position offsets every 400 ms on
selection, session and acquired record screens. Timers are cleared before
switching screens and on page destruction. This reuses the existing art
rather than adding extra animation frames to the package. Pixel accents and
dark background colors match the current Pokemon's primary type and update
on evolution; an egg uses its selected family's first species type.

The run screen highlights the egg/Pokemon in a centered 176 x 176 image area
(previously 96 x 96), using native scaling of the same compact PNGs. Motion
keeps this larger image centered, including after hatching and evolution.
Distance sits below the sprite, with time and pace side by side underneath;
steps, the next milestone and Finish & save remain visible below the header.
No larger image files or extra animation frames are bundled.

The run screen shows distance, elapsed time (hours:minutes:seconds), average
pace (minutes per kilometer), steps and the next evolution milestone. Time
continues while the app is closed and includes stops; pace is elapsed time
divided by session distance, not instantaneous or moving pace. It refreshes
without waiting for a step change. Timing resets only when starting a new
adventure. Older active saves without a start timestamp show dashes for time
and pace until a new adventure is started; their distance remains preserved.
The build and preview scripts disable bytecode compilation and use the documented
source JavaScript loader (runtime.type = 0) while investigating the black screen
on Bip 5 Unity firmware 2.0.1.4. The user confirmed the adventure page opens with this setup.
Branching families have separate routes so the final evolution is chosen before starting.
At 5 km the egg hatches, at 10 km it reaches its second form, and at 15 km
its third form. Shorter families stop at their final normal form.
This game uses distance milestones even for stone and trade evolutions.

The catalog includes all 493 Gen 1-4 species and the later-generation families
needed for the requested Mega list: 552 species total. **Extra Mega families**
contains routes starting after Gen 4. Cross-generation babies appear under
the generation of the first species in the route. Legacy route indices and
acquired names are preserved for existing saves.

Tap **Mega ... @21km** to cycle variants before starting an eligible route.
The chosen variant unlocks at exactly 21,000 meters. All 87 requested species
are supported with 97 Mega variants. Save and finish adds that Mega form to
the Pokedex. Mega entries count separately from the normal species total.

Sprites appear in egg selection, active sessions and Pokedex entries.
Gen 1-4 base sprites use the Gen 4 Platinum set; later species and Mega forms
use available PokeAPI sprites. All images are bundled for offline use.
Watch assets use 48 x 48 sprites with native scaling into 96 x 96 selection
areas and the 176 x 176 run portrait to keep the installation small. Full-size originals are
preserved in data/original-sprites outside the watch package.
Build and preview explicitly disable intermediate source products (--ip=false)
so source snapshots and original art are excluded from the installer.
Mega Zygarde uses its base sprite with the Mega name because its sprite is
missing from the source.

**Finish & save** opens a confirmation. Saving replaces the selected route's
last distance and steps, adds newly earned Pokemon, and updates already
acquired Pokemon in that route without removing their acquisition.
Finishing below 5 km saves an egg adventure but unlocks no new Pokemon.
**Existing adventure** starts another egg in that route at zero; old records
remain until the new adventure is finished. Pokedex entries show the latest
saved distance, steps and finish date.

Active sessions are saved on sensor changes and app exit. Reopening resumes
the session using changes in the watch's daily activity counters; walking
while the app is closed also counts until you finish. Wake-up relaunch is
enabled during an adventure. This is an activity-counter game, not a GPS
workout recorder, and does not start the watch's native workout mode.

## Device verification still required

- Grant step, distance and local storage permissions when installing.
- Compare a short walk with the watch's distance display. The implementation
  treats Distance.getCurrent() as meters; the API reference does not specify
  its unit, so confirm the scale on this watch before relying on milestones.
- Test screen-off/reopen recovery and actual widget layout on the watch.
- Reopen each day for multi-day adventures: daily counters cannot recover
  missed full days or the unobserved tail of the previous day across midnight.
- Uninstalling clears local saves. No cloud backup is included.

Tests cover Gen 1-4 completeness, all 87 Mega species and 97 Mega variants,
21 km boundaries, asset availability, legacy routes, shorter families, counter
updates, midnight reset, overwrites, acquired-form retention, page navigation
and storage/reopen using mocked Zepp OS APIs. They do not verify hardware.
Additional checks cover grouped variant records, missing variants, primary
types, sprite movement and timer cleanup when navigating or closing the page.

Catalog sources: [PokeAPI data](https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv)
and [sprites](https://github.com/PokeAPI/sprites). Snapshot CSVs and the generator
are included in data/ and tools/build_catalog.py. Regenerating assets requires
Python and Pillow; the watch does not access the network.
