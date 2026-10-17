# Zepimon

Pixel-sprite Gen 1-4 walking companion for Amazfit Bip 5 Unity (320 x 380).

The app icon is the Gengar sprite from [PokéAPI sprites](https://github.com/PokeAPI/sprites/blob/master/sprites/pokemon/94.png).

```powershell
npm test
npm run build
npm run preview
```

## Phone companion (v1.7.2)

Install the updated preview, open Zepimon on your connected watch, then open
Zepimon's settings page in the Zepp phone app. Tap **Sync from watch**. Keep both
apps open until **Synced with your watch** appears. A sync is also attempted when
Zepimon opens on the watch and when an adventure starts or finishes. The Zepp
phone view uses the platform's [Settings App](https://docs.zepp.com/docs/guides/framework/app-settings/intro/)
and [Bluetooth companion service](https://docs.zepp.com/docs/guides/architecture/arc/).

- **Pokedex:** larger pixel sprites, name search, normal/shiny and generation
  filters, twelve entries per page, and separate normal/shiny detail cards.
  Each card shows its saved distance, steps, date, elapsed time, average pace
  and first-detected hatch time when those details are available.
- **Export JSON:** after syncing, tap Export JSON in the Zepp phone view.
  Long-press in the generated text, select all, and copy it into a text editor;
  save using the displayed `.json` filename. The generated copy stays frozen
  during background sync. Go back and export again to include a newer sync.
  Export is only on the phone. There is no React integration or server upload.
  This uses the documented multiline TextInput; native clipboard buttons and
  file downloads are not provided by the documented Zepp settings UI API.
- **Journeys:** the active adventure at its last sync and the latest completed
  journey for each egg family. Distance, steps, date, elapsed time and average
  pace are shown where available. Completed journeys now save their timing;
  older records have no timing data and are labelled accordingly.
- This preserves the existing replacement rule: finishing another adventure
  replaces that family's previous journey. It does not reconstruct overwritten
  activities or provide a complete activity timeline or GPS route map.
- Phone records are a read-only local copy. Failed/disconnected syncs keep the
  previous copy. Browsing and filtering do not change watch progress. The active
  adventure is a snapshot, not a live timer; tap Sync to refresh it.
- Pokemon sprites load from PokeAPI's sprite repository on the phone; the egg
  images are embedded. Records remain readable offline. Watch sprites remain
  bundled, and no extra Pokemon image set is added to the installer.

`shared/companion.js` defines a reusable, validated JSON format for a future app:
`schemaVersion: 1`, `capturedAt` (watch epoch milliseconds), `dex` (normal names
and `Shiny `-prefixed names), `records` (route index keys), and `active`.
Optional `personalBests` holds `distance`, `elapsed` and `hatch` winner records,
each including its route index. Optional `hatchSeconds` stores elapsed time at
the first detected crossing of 5 km. Older snapshots without these fields work.
Distances are meters, elapsed time is seconds and finish dates are ISO strings.
The phone adds `receivedAt` (phone epoch milliseconds). The route index mapping
is in `page/catalog.js`. Internal daily sensor baselines are excluded. Phone
storage key: `zepimon-phone-v1`; watch key `zepimon-v1` is unchanged. This is a
data contract for later integration, not an automatic connection to another app.
The phone export wraps the snapshot in `{ exportVersion: 1, app: 'Zepimon',
exportedAt, receivedAt, snapshot, routes }`. `routes` includes the index-to-names
mapping, so the file is readable without separately obtaining the catalog.

Bluetooth uses the official ZML package pinned to `0.0.27` and its API 3.0
messaging modules; later ZML releases require newer watch APIs. Tests execute
the installed library with simulated BLE endpoints, including a full normal
and shiny Dex spanning multiple packets. Physical Bluetooth delivery and the
Zepp settings renderer still need verification on the user's phone/watch.

The UI uses the dark pixel theme with blue menus, stepped borders and a cream
distance card. Scenery and frames use native rectangles with existing sprites.
The title screen shows a moonlit forest, lake and path with Gible,
today's total activity distance, **Start Adventure**, **Dex** and **History**.
While an adventure is active, the main button reads **Continue adventure** and
resumes that run. With no active adventure it reads **Start Adventure**.
The label is refreshed from the saved state whenever the title page opens.
Dex and History sit side by side below Start Adventure. Dex opens the Pokedex
directly, including during an active adventure, and its Back button returns
to the title screen. Browsing the Dex does not reset the active adventure.
Start Adventure opens a blue pixel adventure hub with an animated egg,
collection count and New Egg / Continue Adventure buttons, plus Back to the title.
New Egg opens generation selection, whose **Back to title** button returns
directly to the title screen. The hub's Continue Adventure opens saved routes.
History opens three Pokemon personal bests: **Highest distance**, **Longest
elapsed time**, and **Fastest 5 km hatch**. Tap a category for the winning
Pokemon, its normal/shiny sprite, and the record value. History can be viewed
during a run without resetting it; Back returns to the title screen.
Personal bests use completed, saved journeys. On upgrade they are seeded from
the route records still available, then retained even when a later run replaces
a route's latest record. Already-overwritten journeys cannot be reconstructed.
The first two categories maximize meters and elapsed seconds; fastest hatch
minimizes the positive time recorded at the first sensor update reaching 5 km.
The hatch winner displays the species that hatched, with its shiny status.
Older already-hatched journeys have no hatch timestamp and are excluded. If
the app is closed across the threshold, detection on reopening may be later
than the actual hatch; the detail screen labels this as first-detected timing.
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
or **Shiny**. Each variant shows its own last qualifying saved distance, steps,
elapsed time and finish date;
unlocked variants remain saved and missing variants show **Not acquired**.
Saving only updates forms reached during that adventure. For example, a new
5.5 km Bulbasaur run updates Bulbasaur but preserves the previous Venusaur
and Mega Venusaur records. A run below 5 km does not replace any Dex details.
Normal and shiny records remain separate. The Dex shows completed journeys;
use **Finish & save** to record the active adventure's distance and timing.

Older versions could overwrite acquired forms with an unhatched repeat run's
0 km or short distance. Opening the watch app or syncing now repairs those
entries from surviving completed route records or History personal bests,
using the newest qualifying journey for that exact variant. A matching saved
journey can also restore missing elapsed/hatch timing. Valid existing Dex
distances are preserved. If no evidence survives, the Pokemon stays acquired
and its detail view says **Distance unavailable**; lost values are not guessed.

Sprites gently bounce through six small position offsets every 400 ms on
selection, session and acquired record screens. Timers are cleared before
switching screens and on page destruction. This reuses the existing art
rather than adding extra animation frames to the package. Pixel accents and
dark background colors match the current Pokemon's primary type and update
on evolution; an egg uses its selected family's first species type.

The run screen highlights the egg/Pokemon in a centered 176 x 176 image area
(previously 96 x 96), using native scaling of the same compact PNGs. Motion
keeps this larger image centered, including after hatching and evolution.
Both `auto_scale` and `auto_scale_obj_fit` are explicitly enabled, with zero
image offsets, so the resource fills its centered widget. Size and fitting
are reapplied on animation and sprite changes. The source images are square,
so filling the square widget preserves their aspect ratio. Check fitting on
the physical watch: desktop mocks cannot verify firmware image scaling.
Distance sits below the sprite, with time and pace side by side underneath;
steps, the next milestone and Finish & save remain visible below the header.
No larger image files or extra animation frames are bundled.

The run screen shows distance, elapsed time (hours:minutes:seconds), current
pace (minutes per kilometer), steps and the next evolution milestone. Current
pace estimates speed from roughly the last 15 seconds of distance changes,
with a five-second warm-up. It responds to faster/slower movement and becomes
**--:-- /km** after about 15 seconds without distance changes. The display
refreshes without waiting for a step change. Samples stay in memory and reset
on reopening, a sampling gap over five seconds, a clock/counter reset, or a
new adventure, so recovered background distance cannot create a speed spike.
The [Distance API](https://docs.zepp.com/docs/reference/device-app-api/newAPI/sensor/Distance/)
provides a distance total and change callbacks; its update frequency on the
watch limits how quickly pace responds. This estimate is not GPS speed.
Time continues while the app is closed and includes stops, resetting only for
a new adventure. Older active saves without a start timestamp show dashes
for elapsed time; their distance and fresh current-pace estimate still work.
Phone journey snapshots and completed records show **Avg pace**, calculated
from the full saved elapsed time and distance. Live samples are not exported.
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
use available PokeAPI sprites. All watch images are bundled for offline use.
Watch assets use 48 x 48 sprites with native scaling into 96 x 96 selection
areas and the 176 x 176 run portrait to keep the installation small. Full-size originals are
preserved in data/original-sprites outside the watch package.
Build and preview explicitly disable intermediate source products (--ip=false)
so source snapshots and original art are excluded from the installer.
Mega Zygarde uses its base sprite with the Mega name because its sprite is
missing from the source.

**Finish & save** opens a confirmation. Saving replaces the selected route's
last journey, adds newly earned Pokemon, and updates only the acquired forms
reached during this run. Earlier evolution/Mega records remain until another
run reaches those forms, and acquisitions are never removed by a shorter run.
Finishing below 5 km saves an egg adventure but unlocks no new Pokemon.
**Existing adventure** starts another egg in that route at zero; old records
remain until the new adventure is finished. Pokedex entries show the latest
qualifying saved distance, steps, timing and finish date.

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
