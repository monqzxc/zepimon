# Zepimon

Pixel-sprite Gen 1-4 walking companion for Amazfit Bip 5 Unity (320 x 380).

The app icon is the Gengar sprite from [PokéAPI sprites](https://github.com/PokeAPI/sprites/blob/master/sprites/pokemon/94.png).

```powershell
npm test
npm run build
npm run preview
```

## Minimal watch and Zepp bridge (v1.9.0)

### Legendary Expeditions (v1.11.0)

Legendary and Mythical Pokemon now come from phone expeditions rather than new
eggs. Existing acquired variants and active Legendary adventures are preserved.
The catalog order and route IDs are unchanged; the picker and Random Egg filter
out the 39 Legendary/Mythical species identified in the bundled PokeAPI CSV.

Each newly saved adventure adds its distance to a persistent expedition total,
even when it replaces a route's last record. Old completed records are not
retroactively counted. Clues appear at 5 and 15 cumulative km; 25 km reveals
an encounter. A small message appears after saving across a milestone, and
the hub shows progress toward the next 25 km. Extra distance carries forward.
The regular egg's own hatching/evolution distance still starts at zero per run.

Sync through Zepp, then open **Explore expeditions** in mobile v1.5.0. A short
three-step interaction befriends the Pokemon and records its Normal or Shiny
variant in the phone Dex. Rewards cycle through the 39 species from a random
starting point. A persisted seed assigns each encounter a stable 1-in-50 shiny
draw, so repeated syncing/reopening cannot reroll it. This is game randomness,
not a security mechanism. The compact counter/seed syncs through the existing
cloud snapshot and JSON export; no new assets or Supabase migration are needed.
Phone befriending records are local, like missions and mini-game scores.
Reinstalling the phone app can recover unlocked outcomes from a watch sync,
but requires befriending those encounters again. No phone-to-watch writes or
new Legendary Mega unlock mechanism are added in this release.
The validated counter supports 100,000 cumulative km (4,000 encounters).

The watch keeps egg selection, walking/running, hatching/evolution, saving,
resuming adventures and the three History personal bests. Dex browsing now
lives in the standalone Zepimon mobile app. The watch still keeps collection
records locally so offline progress, normal/shiny variants and cloud sync work.
Existing saves and account links are retained when updating in place.

Zepp settings are a single Pokedex-styled bridge screen. Before linking it shows
three steps, the linking code field and **Link account**. Once linked, a Trainer
Card replaces the code field and shows upload state, Dex entries and the last
watch sync (plus when the account was linked); **Sync from watch** becomes the
main button and **Retry upload** appears only while newer progress is waiting.
Under Manage account, **Change account** takes a code from another Zepimon
account and keeps the current link until the new code works, and **Remove
account** asks once before it stops uploads from this phone (nothing is deleted
from the account or the watch). Export JSON is always available under Manual
transfer.

While the phone syncs with the watch, links an account or uploads, a yellow
banner with a spinning Pokeball and a pixel progress bar appears below the
header, the Pokedex lights chase each other and the status line spins a small
Pokeball. The Zepp service drives this by bumping `zepimon-sync-frame` about
seven times a second while it is busy; it stops as soon as the work finishes,
and a restarted service replaces a leftover "Syncing…" or "Uploading…" message.
Dex browsing, journey cards and remote sprites have been removed from Zepp.
Use the standalone app for your collection and journeys.

Version 1.9.6 restores **Export JSON** as a small manual-transfer screen in Zepp.
Tap **Sync from watch**, wait for **Synced with your watch**, then **Export JSON**.
Tap the JSON field, long-press its text, and choose **Select all > Copy**.
In Zepimon mobile, open **Sync > Manual JSON import**, paste the text, then tap
**Check pasted JSON > Use this export**. The existing mobile APK supports this;
no phone app update or cloud login is required. You can also save the copied
text as a `.json` file and use the phone's **Choose JSON file** option.
The export contains the last synced collection, active adventure, latest saved
adventure per family and personal bests, including separate normal/shiny data.
It excludes account credentials. The text stays fixed while copying; return to
the bridge and export again after a newer sync. Empty or damaged snapshots must
be synced again before exporting. No export screen or extra art is added on the watch.

In Zepimon mobile, open Sync, sign in, and create a linking code. Paste it into
Zepimon's settings in Zepp and tap Link account. Keep the watch connected and
open Zepimon on it for a manual Sync from watch. Open the mobile app after upload.
Automatic sync attempts still run when the watch app starts or an adventure
starts/finishes; background delivery depends on Zepp remaining available.
See [Supabase setup and linking](../zepimon-sync/README.md).

Supabase retains the latest watch snapshot, Dex variants, active adventure,
latest completed record per family and personal bests. This release does not
add backup for phone-only missions, scores, preferences or full run history.
Watch sprites remain bundled because egg selection and evolution still use them.
Removing Dex screens saves code, not the entire sprite collection.

`shared/companion.js` defines a reusable, validated JSON format for a future app:
`schemaVersion: 1`, `capturedAt` (watch epoch milliseconds), `dex` (normal names
and `Shiny `-prefixed names), `records` (route index keys), and `active`.
Optional `personalBests` holds `distance`, `elapsed` and `hatch` winner records,
each including its route index. Optional `hatchSeconds` stores elapsed time at
the first detected crossing of 5 km. Optional `activity` stores `walking` or
`running` on active journeys, completed records and their acquired Pokemon.
Older snapshots without these fields work and retain an unspecified activity.
Distances are meters, elapsed time is seconds and finish dates are ISO strings.
The phone adds `receivedAt` (phone epoch milliseconds). The route index mapping
is in `page/catalog.js`. Internal daily sensor baselines are excluded. Phone
storage key: `zepimon-phone-v1`; watch key `zepimon-v1` is unchanged. The same contract is used by the standalone app cloud sync.
The cloud upload wraps the snapshot in `{ exportVersion: 1, app: 'Zepimon',
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
today's total activity distance, **Start Adventure** and **History**.
While an adventure is active, the main button reads **Continue adventure** and
resumes that run. With no active adventure it reads **Start Adventure**.
The label is refreshed from the saved state whenever the title page opens.
A full-width History button sits below Start Adventure.
Start Adventure opens a blue pixel adventure hub with an egg,
collection count and New Egg / Random Egg buttons, plus Back to the title.
New Egg opens generation selection, whose **Back to title** button returns
directly to the title screen. **Random Egg** (v1.10.1) picks an evolution route
with equal odds from eligible egg routes, including Extra Mega families, and
opens its preview. You can choose its Mega form before tapping
**Start**, then **Walking** or **Running**. Back from activity selection keeps
the same egg; Back from the random preview returns to the hub. Previewing or
cancelling does not change progress. Active adventures still resume from the
title screen's **Continue adventure** button.
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
Version 1.10.2 adds a lighter egg picker: choose a generation, then **A-F**,
**G-L**, **M-R**, or **S-Z** by the egg Pokemon's name. Four alphabetical names
appear per page, with **Prev / Back / Next** controls. Evolution routes include
their final form (for example, **Eevee > Umbreon**) to distinguish branches.
Tap a name for its sprite, evolution path and Mega choice, then **Start**.
Back from the preview restores the same list page; Back from the list returns
to letter groups, then generation selection. Paging reuses four row buttons
and loads no sprites. Only the selected preview loads a Pokemon sprite, and
cycling Mega choices updates the button without rebuilding the preview.
All existing route IDs and progress are preserved; sorting is for display only.
The generation picker uses blue buttons, with a brighter fill and cream arrow
highlighting the last selected generation. All app content starts at or below y=64, leaving
the watch's system app-name/time header visible. No duplicate custom header
is drawn. This follows the rectangular-screen status bar dimensions in the
[Zepp screen adaptation guide](https://docs.zepp.com/docs/v2/guides/best-practice/multi-screen-adaption/).
Every new adventure starts at zero. Random Egg excludes Legendary/Mythical
routes and opens its preview directly; Back returns to the hub to pick again.
Choosing **Walking** or **Running** starts a new adventure and rolls a 1-in-50
(2%) shiny chance as of v1.10.3, including random eggs and previously completed routes.
Browsing eggs and reopening an active adventure do not reroll.
Shiny eggs have gold spots and a Shiny label. The same shiny status persists
through normal and Mega evolution, using shiny sprites. Regular and shiny
acquisitions have separate Pokedex entries; a later regular run cannot remove
an acquired shiny. The latest route record still replaces the previous run.

The standalone mobile Pokedex groups normal and shiny acquisitions under one Pokemon name.
Tap the Pokemon's name to open its records, then select **Normal**
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

Version 1.10.0 restores walking sprites with no extra image files. For 600
supported forms (normal and shiny), both 24 x 24 poses share the existing
portrait file as a 48 x 24 sheet. An API 3.0 canvas scales and clips a single
pose inside the centered 176 x 176 session area. Walking changes pose every
400 ms; Running every 200 ms. This is cosmetic movement during the adventure,
not a measurement of live cadence. Sensor/pace polling still runs once per
second. Eggs and the 49 unsupported Mega forms retain their still artwork.
Selection, History and title use the first pose. The system header and all
recording, pace, saving, JSON export and sync behavior are preserved.

`python tools/build_walk_sprites.py` regenerates the sheets in place; it must
not add a separate animation pack. See [sprite credits](data/walk-credits.md).
Tests check sheet dimensions, frame offsets, evolution/shiny changes, timer
cleanup and widget bounds. Canvas clipping/scaling and installation still need
verification on Bip 5 Unity hardware.

After selecting an egg, tap **Start**, then choose **Walking** or **Running**.
Back returns to the same egg and Mega choice without starting or rolling a
shiny. The activity is saved with the adventure and exported to the phone.
Existing active adventures resume without another selection; their pace uses
the walking smoothing window until a new adventure is started.

The run screen shows distance, elapsed time (hours:minutes:seconds), **Est.
pace** (minutes per kilometer), activity/steps and the next evolution milestone.
Pace uses recent distance changes with roughly an **8-second Running** or
**15-second Walking** window and at least five seconds of fresh observations.
It polls the counters about once a second while this screen is awake, as well
as listening for sensor changes. It times actual distance updates and holds
the estimate between batches, instead of interpreting each unchanged drawing
frame as slower movement. With frequent updates it shows **--:-- /km** after
15 seconds without new distance. For slower batches it holds the estimate for
1.5 times the last batch interval, capped at 60 seconds. Expiring the display
retains the last distance timestamp, so 20-60 second batches can produce pace
instead of repeatedly losing their baseline. After a longer delay, the first
changed counter starts a fresh baseline; repeated similar batches up to two
minutes can then produce a reading. Slow sensors still limit responsiveness.
When distance is delayed or updates less often than every 15 seconds, fresh
step updates provide a fallback. It multiplies recent steps per second by the
adventure's measured meters per step, held stable between distance updates.
It never assumes a default stride or changes recorded distance. The estimate
needs some recorded distance and at least ten steps for calibration; before
that, or without fresh movement readings, dashes are expected. This fallback
responds to cadence changes, but cannot measure changes in stride length until
distance updates. Neither path substitutes the full-session average pace.
Samples stay in memory and reset on reopening, a polling gap over five seconds,
a clock/counter reset, or a new adventure. After a gap, the first changed
counter establishes a fresh baseline so recovered distance cannot become a
speed spike. Only changed activity totals trigger a storage write during polling.
The [Distance API](https://docs.zepp.com/docs/reference/device-app-api/newAPI/sensor/Distance/)
provides a distance total and change callbacks; its update frequency on the
watch limits how quickly pace responds. This estimate is not GPS speed, and
selecting Running does not change the watch's stride/distance algorithm or
activate a native workout. Bip 5 Unity supports
[API level 3.0](https://docs.zepp.com/docs/reference/related-resources/device-list/);
native pace access via [getSportData](https://docs.zepp.com/docs/reference/device-app-api/newAPI/app-access/getSportData/)
requires API 3.6. That unsupported API is not imported into this app.
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

Watch sprites appear in egg selection, active sessions and History.
Supported species use the compact overworld sheets described above; fallback
portraits use the Gen 4 Platinum set or available PokeAPI artwork. All images
are bundled for offline use and scaled into the 96 x 96 selection areas or
176 x 176 run area. Full-size originals remain in data/original-sprites outside
the watch package.
Build and preview explicitly disable intermediate source products (--ip=false)
so source snapshots and original art are excluded from the installer.
Mega Zygarde uses its base sprite with the Mega name because its sprite is
missing from the source.

**Finish & save** opens a confirmation. Saving replaces the selected route's
last journey, adds newly earned Pokemon, and updates only the acquired forms
reached during this run. Earlier evolution/Mega records remain until another
run reaches those forms, and acquisitions are never removed by a shorter run.
Finishing below 5 km saves an egg adventure but unlocks no new Pokemon.
Selecting a previously completed route starts another egg at zero; old records
remain until the new adventure is finished. Pokedex entries show the latest
qualifying saved distance, steps, timing and finish date.

Active sessions are saved on sensor changes and app exit. Reopening resumes
the session using changes in the watch's daily activity counters; walking
while the app is closed also counts until you finish. Wake-up relaunch is
enabled during an adventure. This is an activity-counter game, not a GPS
workout recorder, and does not start the watch's native workout mode.

Version 1.11.1 adds a Pokeball loader. Buttons that open another screen first cover the content area with a pixel
Pokeball that pulses once, shrinking from 126 to 70 pixels and growing back
over seven 40 ms frames (about 0.28 s), then open the screen. The watch cannot
animate while a screen builds, so the full-size ball stays up until it appears.
Taps during the animation are ignored. Paging and Mega cycling update in place and
stay instant. The ball is drawn with native rectangles (`page/loader.js`), so
no image files are added.

## Device verification still required

- Check that the Pokeball loader animates smoothly and does not make menus
  feel slow on Bip 5 Unity.

- Grant step, distance and local storage permissions when installing.
- Compare a short walk with the watch's distance display. The implementation
  treats Distance.getCurrent() as meters; the API reference does not specify
  its unit, so confirm the scale on this watch before relying on milestones.
- Test screen-off/reopen recovery and actual widget layout on the watch.
- In a Running adventure, compare a steady jog, faster interval and stop with
  the native workout pace. The estimate depends on daily-counter updates and
  cannot be guaranteed to match the native workout. Check that batch updates
  remain steady and that reopening does not produce a pace spike.
- Reopen each day for multi-day adventures: daily counters cannot recover
  missed full days or the unobserved tail of the previous day across midnight.
- Uninstalling clears watch saves. Cloud records remain available on the phone,
  but this sync does not restore them back onto the watch.

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
