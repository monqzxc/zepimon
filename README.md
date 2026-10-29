# Zepimon

Zepimon is a Pokémon walking game for Amazfit watches. Pick an egg, then walk or run: the egg hatches at 5 km and evolves as you keep going. The Zepimon phone app for Android and iPhone holds your Dex, journal, missions and mini-games, and gets your watch progress through the Zepp app.

- 552 Pokémon: all of Gen 1–4, plus the later families that have Mega forms (97 Mega forms in all).
- Separate Normal and Shiny versions. Every new egg has a 1 in 50 chance of being Shiny.
- The 39 Legendary and Mythical Pokémon come from Legendary Expeditions instead of eggs.
- Everything works offline. Syncing is optional.

Current versions: watch app 1.11.4, phone app 1.9.2.

## How it fits together

| Part | Folder | What it does |
| --- | --- | --- |
| Watch app | [`hatdog-app`](hatdog-app/README.md) | Starts adventures, counts your distance, hatches and evolves eggs, keeps personal bests. |
| Zepp app settings | `hatdog-app/setting`, `hatdog-app/app-side` | Links the watch to your Zepimon account, uploads your progress, exports it as JSON. |
| Phone app | [`zepimon-mobile`](zepimon-mobile/README.md) | Dex, journal, missions, phone GPS adventures, Legendary Expeditions and mini-games. |
| Cloud sync | [`zepimon-sync`](zepimon-sync/README.md) | Supabase database that carries your progress from Zepp to the phone app. |
| Source data | `pokemon_data` | Egg move data, its generator script and the app icon artwork. |

Watch progress travels **watch → Zepp app → Zepimon cloud → phone app**. The phone app does not connect to the watch directly, and it never changes the watch's saved progress.

## Compatible watches

For now, only the **Amazfit Bip 5 Unity**. See [Compatible watches](zepimon-mobile/README.md#compatible-watches) for the full list and how to add another model.

## Get started

### 1. Install the watch app

Zepimon is not in the Zepp App Store yet. It installs as a developer preview:

1. Sign in to the Zepp app and pair your watch.
2. Turn on developer mode in the Zepp app: **Profile → Settings → About**, then tap the Zepp logo 7 times.
3. On a computer with the [Zeus CLI](https://docs.zepp.com/docs/guides/tools/cli/) (signed in with `zeus login`), run `npm run preview` in `hatdog-app`. It prints a QR code.
4. In the Zepp app's **Developer Mode**, tap **Scan** and scan the QR code.
5. Allow step, distance and storage access when asked.

See Zepp's [Preview on a watch](https://docs.zepp.com/docs/guides/quick-start/preview/) guide for details.

### 2. Install the phone app

- **Android:** install the APK from the EAS preview build (`npm run build:apk` in `zepimon-mobile`). Android may ask you to allow installs from your browser.
- **iPhone:** installing outside the App Store needs an Apple Developer account, with the iPhone registered for ad hoc builds.
- **For testing:** run it in Expo Go. See [Run locally](zepimon-mobile/README.md#run-locally).

See [Standalone builds](zepimon-mobile/README.md#standalone-builds) for the build commands.

### 3. Link the watch to the phone app

1. In the phone app, open the **Sync** tab. Enter your email, tap **Send sign-in code**, type the code from the email and tap **Sign in**.
2. Tap **Create linking code**, then long-press the code to copy it. It works once and expires after 10 minutes.
3. In the Zepp app, open Zepimon's settings, paste the code under **Link your account** and tap **Link account**.
4. Open Zepimon on the watch, then tap **Sync from watch** in Zepimon's settings in the Zepp app.
5. Back in the phone app, tap **Sync now**.

No account? You can copy your progress by hand instead. See [Manual JSON import](#manual-json-import).

To use Zepimon with someone else's watch and email, see [Using Zepimon with another account](zepimon-mobile/README.md#using-zepimon-with-another-account).

## Using the watch

**Start an adventure.** The title screen shows today's distance and your **Next egg**, which is a Pokémon you haven't hatched yet or one you picked.

- Tap **Walk** or **Run** to start with that egg.
- Or tap **Change egg**: choose a generation (or **Extra Mega families**), a letter group (A–F, G–L, M–R, S–Z), then a Pokémon. Its preview shows the evolution path. If it has Mega forms, tap the Mega button to choose one. Tap **Start**, then **Walking** or **Running**.

**During the adventure,** the screen shows your Pokémon, distance, elapsed time, estimated pace, steps and the next milestone:

| Distance | What happens |
| --- | --- |
| 5 km | The egg hatches. |
| 10 km | It evolves to its second form. |
| 15 km | It evolves to its third form. |
| 21 km | It Mega evolves, if you chose a Mega form. |

You can close the app and keep walking; it still counts. On the title screen, **Continue adventure** takes you back. For adventures longer than a day, open Zepimon at least once a day, because the watch's daily step and distance counters reset at midnight.

**Finish.** Tap **Finish & save**, then **Save & finish**. This adds the Pokémon you reached to your Dex and replaces that egg's last record. An adventure under 5 km is saved but unlocks no Pokémon.

**History** shows your personal bests: **Highest distance**, **Longest elapsed time** and **Fastest 5 km hatch**.

**Legendary Expeditions.** Every saved adventure adds its distance to your expedition total. Clues appear at 5 and 15 km. At 25 km a Legendary or Mythical Pokémon appears, and you meet it in the phone app. Extra distance carries over to the next expedition. The phone app also opens encounters early with Expedition Permits, earned from Expedition Quests or arcade achievement points.

## Using the Zepp app

Zepimon's settings page in the Zepp app is the bridge between the watch and the phone app.

- **Link your account:** paste the linking code from the phone app and tap **Link account**.
- **Trainer card** (after linking): shows whether your progress is uploaded, your Dex entries and the last watch sync. **Retry upload** appears when newer progress hasn't reached your account yet.
- **Watch sync:** **Sync from watch** gets the latest progress from the watch. Keep the watch connected and Zepimon open on it. Saving an adventure also sends your progress automatically.
- **Manual transfer:** **Export JSON** shows your progress as text, for copying into the phone app without an account.
- **Manage account:** **Change account** links a different Zepimon account; the current link keeps working until the new code succeeds. **Remove account** stops uploads from this phone. Nothing is deleted from your account or your watch.

## Using the phone app (Android and iPhone)

The app works the same on Android and iPhone. It has five tabs:

| Tab | What's there |
| --- | --- |
| **Journal** | Your buddy, the watch adventure in progress (as of the last sync), personal bests and recent adventures. **View missions** opens weekly goals, missions and badges. **Explore expeditions** opens Legendary Expeditions. |
| **Dex** | Every Pokémon you've collected, Normal and Shiny. Tap a name to see its records or make it your buddy. |
| **Adventure** | The violet Poké Ball in the middle. Records a walk or run with the phone's GPS. |
| **Play** | Adventure Map, Route Guard, Trail Defense, Safari Hunt, Memory Match, Who's That Pokémon? and Berry Catch. |
| **Sync** | Sign in, link your watch, **Sync now**, manual JSON import and backups. |

**Syncing.** Once your watch is linked, the phone app checks for new progress when you open it and every minute while it's open. Tap **Sync now** in the **Sync** tab at any time.

**Phone adventures.** In the **Adventure** tab, tap **Choose an egg** or **Random egg**, pick **Walking** or **Running** and tap **Start walking** or **Start running**. Every 5 km hatches or evolves the egg, the Mega form comes at 21 km, and 1 in 50 eggs is Shiny, as on the watch. When you're done, tap **Finish & save** or **Discard**. Phone adventures stay on the phone and are not sent to the watch.

- **Android** keeps recording with the screen off and shows a notification while it does.
- **iPhone** keeps recording in the background and shows the blue location indicator.
- Both only need **While using the app** location permission.

**Legendary Expeditions.** Open a Legendary encounter with 25 km of saved walks and runs, an Expedition Quest (three saved sessions plus a shrine challenge) or 100 arcade achievement points. Then clear its Legendary Trial (a Switch Maze, Crumbling Floor, Dark Labyrinth, Ancient Temple or Warp Chamber, or the Shattered Star island puzzle for Deoxys), see its result in the chamber (1 in 100 Shiny, resettable before the battle), and battle and catch it with a Poké Ball. Only a successful catch adds it to your Dex.

### Manual JSON import

1. In Zepimon's settings in the Zepp app, tap **Sync from watch** and wait for **Synced with your watch**.
2. Tap **Export JSON**. Tap the JSON field, long-press its text and choose **Select all → Copy**.
3. In the phone app's **Sync** tab, paste the text, then tap **Check pasted JSON → Use this export**. You can also save the text as a `.json` file and use **Choose JSON file**.

Importing the same export again doesn't count anything twice.

### Backups

In the **Sync** tab, go to **Back up your data** and tap **Save a backup file**. The backup includes everything that is stored only on the phone, such as missions, scores, phone adventures and Expedition friends. Restoring that phone-only part isn't built yet.

See the [phone app README](zepimon-mobile/README.md) for every feature and game in detail.

## For developers

Each folder is its own project. Install its dependencies with `npm ci` inside it.

| Folder | Commands | Details |
| --- | --- | --- |
| `hatdog-app` | `npm test`, `npm run build`, `npm run preview` (build and print an install QR code) | [Watch app README](hatdog-app/README.md), including release notes |
| `zepimon-mobile` | `npm start`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build:apk` | [Phone app README](zepimon-mobile/README.md) |
| `zepimon-sync` | `npm test` | [Cloud setup and linking](zepimon-sync/README.md) |

Build output, dependencies, local test files and AI assistant folders are kept out of Git by [`.gitignore`](.gitignore).

## Credits

Pokémon sprites come from [PokéAPI sprites](https://github.com/PokeAPI/sprites); see [SPRITE-CREDITS.md](zepimon-mobile/SPRITE-CREDITS.md) for all artwork credits. Pokémon and its images are © The Pokémon Company. Zepimon is a fan project and is not affiliated with The Pokémon Company, Nintendo, Zepp Health or Amazfit.
