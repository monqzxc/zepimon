# Zepimon Mobile

A standalone iPhone and Android companion for Zepimon, built with Expo SDK 57 and React Native 0.86. Sync or import your watch journal to explore your collection and adventures offline.

## Features

### Phone adventures

The **Adventure** tab, the violet Poke Ball in the middle of the tab bar, is the
phone version of the watch adventure. Tap the ball and it spins, then Gengar pops
out and floats there with a wicked grin inside a pulsing shadow aura while the tab is open; tap again and he
taunts, tongue out and pulling an eye, as the aura flares. Choose an egg, or take a
random one, pick a Mega form where the family has one, choose **Walking** or
**Running** and start. The phone measures distance by GPS: every 5 km in one
adventure hatches or evolves the egg, with the Mega form at 21 km, and 1 in 50
eggs is Shiny, as on the watch. While recording you see the walking Pokemon,
distance, time (including stops), current and average pace, the distance to the
next hatch or evolution, and the route drawn live. **Finish & save** adds the
adventure to the Journal, Dex, personal bests, missions and the Walking bonus,
and it becomes the family's latest record; **Discard** drops it.

**Choose an egg** opens a Pokedex-style list (1.9.5): cards with the Dex
number, sprite, type and evolutions, and how many of the family are already in
your Dex (a Poke Ball when all are). Sort by **Lowest No.**, **Highest No.**,
**A–Z** or **Z–A**; filter by generation (Gen 1 · Kanto to Gen 9 · Paldea, from
the eggs themselves, so new generations appear on their own), by type, and by
**Not caught** (a family with a Pokemon missing from your Dex) or **Caught**.
Search finds a name (accents optional), a type, or a Dex number such as `25` or `#025`.
Filters match any Pokemon of the family, so the Pichu egg is under Kanto too.
**Random** picks from the current results, and the sort and filters stay as you
left them until the app closes.

Routes are drawn as a line on a plain grid, like Strava without the map, with a
scale bar; the Journal and the Adventure tab show them beside past adventures.
GPS fixes less accurate than 35 m, small jitter while standing still and jumps
faster than running (or walking) speed are ignored. Phones count distance, not
steps. Phone adventures walk their own Legendary Expedition trail, and they are
kept apart from the watch journal, so a watch sync never replaces them.

**Share an adventure as an image.** Tap **Share image** on any adventure (in the
Journal, **All adventures**, **Your routes** or its details), or **Share
adventure image** right after saving one. It makes a 1080 × 1920 PNG,
story size, like a Strava share card: the route, a Pokemon as large pixel art,
and the distance, pace and time. Watch adventures have no route, so their card
shows the Pokemon and stats. Before saving, choose:

- **Pokemon:** the one the adventure reached (the default), the egg, or any
  form it passed on the way.
- **Style:** **Original** (the battle sprite), **Walking** (the overworld
  sprite stepping to the right) or **Facing front** (the overworld sprite
  looking at you). The egg and forms without overworld art have only Original.
- **Size:** **Small**, **Medium**, **Large** or **Extra large**.
- **Background:** **Dark**, or **Clear**, which is see-through for laying over
  your own photo.

Style, size and background stay as you left them until the app closes. **Share
or save image** opens the share sheet to save it to Photos or Files, print it
or post it. The web build downloads the PNG instead. Sprites are enlarged by whole
numbers from their own pixels (`src/pixel-art.ts`), so they stay sharp.

Recording keeps going with the screen off. Android runs it as a foreground
service with a notification; iPhone uses background location with the blue
indicator. Both need only **While using the app** permission, never **Allow all
the time**, because recording always starts from the open app. If location is
off or not allowed, the tab says so, and **Open location settings** goes to
Android's location switch or to Zepimon's own settings for permission and
precise location. If the system stops recording (a restart, a force stop), the
adventure is kept with a **Resume recording** button.

**If the app crashes (1.9.4).** Zepimon keeps its own crash report, so no
computer or developer options are needed. On Android, a crash is written down
just before the app closes, and the next start shows **Zepimon closed
unexpectedly** with the details (plus Android's own record of recent crashes and
freezes on Android 11 and later); **Share report** sends it by chat or email.
An error inside a screen shows **Something went wrong** with **Try again** and
**Share report** instead of closing the app. After a crash, and after each
install or update, the next start drops the saved location task once, so a
failing recorder cannot crash the app on every start. If the crash came during
an adventure, recording switches to **Keep Zepimon open** mode, which records
only while the app is on screen (no foreground service), until **Record with the
screen off again** is tapped. The location task is defined in the app entry,
`index.js`, so it is ready when Android starts the app in the background to
deliver locations.

Missions now open from the Journal (**View missions**) instead of the tab bar.

**One egg, phone and watch.** With your watch linked in **Sync**, the egg you
choose in the Adventure tab (or with **Hatch this next** on a Pokemon's Dex page)
is also the next egg on the watch's title screen, ready for one tap on Walk or
Run. Starting it on either one uses it up. While the phone records, the watch
warns before recording too, and the Adventure tab shows an adventure in progress
on the watch (as of its last sync) and asks for a second tap before starting
here, so the same steps are not counted twice. The plan goes through the cloud
when you are signed in; see [zepimon-sync](../zepimon-sync/README.md).

**One shared adventure (1.9.9).** Whichever device starts an adventure, the
phone, the watch and the Zepimon page in Zepp show the same one: its Pokemon,
Walk or Run, and distance, updated about once a minute (also with the phone's
screen off). The other device does not start a second one; it offers
**Continue here** instead. Continuing takes the adventure over with its egg,
Shiny roll, start time and distance so far; the device that had it stops
without saving, and the Adventure tab says **Continued on your watch** when the
watch takes over. Only the device recording at the end saves it, so steps are
never counted twice; if both ever save it (each offline when the other took
over), the Journal counts it once with the longer distance. Starting with the
egg chosen here uses it up on both devices. Needs the watch linked in **Sync**
and `zepimon-sync/schema.sql` re-run in Supabase.

**Phone adventures on the watch (1.9.7).** Adventures saved here also go to the
watch, through the cloud and without their routes. You can pick the Pokemon on the
phone and record either here or, with one tap, on the watch, and both end up in
the watch's journal. The next time Zepimon opens on the watch with Zepp
connected, it adds their Pokemon to its Dex, makes each the family's latest
record unless the watch has a newer one, and updates its personal bests. Phone
distance keeps walking the phone's own Expedition trail. When the watch's
journal syncs back, the phone recognizes its own adventures, so missions and
runs never count one twice. Needs the watch linked in **Sync** and
`zepimon-sync/schema.sql` re-run in Supabase.

**Recent adventures from both devices.** The Journal keeps every walk and run
from the watch as well as from this phone, each marked **Watch** or **This
phone** with Walk or Run. **Recent adventures** shows the latest 5; **View all
adventures** (also under **Your routes** in the Adventure tab) lists every one
by month, with its total distance, and filters by device. Tap any adventure for
its details: the Pokemon it reached (each opens its Dex record), date and start
and finish times, distance, time, average pace, hatch time and steps where
known, the route for phone adventures, and **Share image**. The watch sends its
last 30 adventures with each sync, so two walks with the same egg between syncs
both appear; older watch versions still send only each family's latest.

### Legendary Expeditions (1.5.0)

Open **Explore expeditions** on the Journal screen. With watch v1.11.0, saved
walks/runs accumulate toward clues at 5, 15 and 25 km. At 25 km, meet and
befriend a Legendary or Mythical Pokemon in a short, untimed interaction.
Mystery habitats and silhouettes become visible as clues are discovered.
The existing sprites and habitats are reused, with themed encounters for
Articuno, Suicune, Rayquaza and Mewtwo and a habitat trail for the other species.
The 39 available species cycle from a random starting point. Extra distance
carries into subsequent expeditions; multiple unlocked encounters wait for you.

Each encounter has a stable seeded 1-in-50 shiny draw. Reopening, duplicate
imports, delayed syncs or restoring the same watch snapshot cannot reroll it.
Normal and Shiny friends join the Dex separately and can be selected as buddies.
Expedition records show 25 cumulative km rather than invented workout pace,
steps or hatch time. They do not create extra workouts or inflate run missions.

Progress starts with adventures saved after the watch update; overwritten old
runs cannot be recovered. Existing Legendary acquisitions and active watch
adventures are retained. The watch counter and seed use the existing Supabase
snapshot and manual JSON path, with no database migration. Befriending records
are stored on this phone alongside missions and scores. Reinstalling the app
requires befriending unlocked encounters again after syncing; outcomes remain
the same. A watch reset starts a new trail without removing phone discoveries.

### Adventure games

Open **Play** for three new games and an **Adventure Map** that strings them together:

- **Route Guard** (lane defense): Shadow Pokemon walk down five lanes. Place up to six Pokemon from your Dex (or the six loaners): Grass types grow berries to tap and collect, Rock/Ground/Steel types block, and every other type attacks foes above it in its lane. Each lane's Snorlax wakes once to roll a breach away; a second breach in that lane ends the battle.
- **Trail Defense** (tower defense): place Pokemon beside a winding trail. Defeated foes pay berries. Every family starts at its first stage and can evolve mid-battle with berries, all the way to its final stage. Foes that reach the end cost lives (a boss costs three). Twenty levels in four stages (Viridian Meadows, Cerulean Coast, Ember Peaks, Shadow Summit) on maps that grow from 6 × 8 to 9 × 16 squares, with longer waves and tougher foes; each stage ends on a spiral with a Shadow Legendary boss (Celebi, Lugia, Moltres, Giratina). Levels earn up to three stars, one star opens the next level, and the start screen previews the map. Free play (twelve waves on a classic trail) is still there.
- **Safari Hunt** (hunting): two minutes, 12 Safari Balls. Tap rustling grass, then throw when the shrinking ring is small. Bait makes a Pokemon less likely to run but harder to catch; rocks do the opposite. Catching the same species in a row raises its Shiny chance from 1 in 60 to as good as 1 in 8.
- **Adventure Map**: nine stops from Route 1 to Victory Road, alternating the three games. Each stop gives up to three stars, and one star opens the next stop. The final stop ends with a Shadow Mewtwo.

Foes walk with two-step overworld animations: down the lanes in Route Guard, and facing whichever way the trail runs in Trail Defense. Your own Pokemon (Normal or Shiny) turn to face the foe they attack, step in place - faster when a foe is in range - and lunge toward it right after attacking; growers hop when they harvest, and idle Pokemon face you. Forms without walking art stay still, and reduced motion keeps everyone still. Trail Defense draws its habitat as textured ground with an edged dirt trail, direction chevrons, a cave where foes enter and a Poke Ball goal; tapping a placed Pokemon shows its attack range.

**Move animations.** Every attack plays its move with the Gen III battle animation sprites (see SPRITE-CREDITS.md): Ember fireballs burst into flame, Water Gun splashes, Thunder Shock strikes from above and arcs to a second foe, Shadow Ball, Sludge, Ice Shard, Mach Punch, Pin Missile, Air Cutter, Swift, Fairy Wind and Dragon Breath fly at their target, Bite snaps shut on it, and Confusion, Magnitude, Rock Throw and Metal Claw send a wave out across their whole range. Each type has one move (tap a placed Pokemon to see it); a hatched Pokemon with egg-move coverage plays its egg move's type whenever that hits harder, and growers sparkle as they harvest. Hits follow the foe they land on, and reduced motion shows a still frame instead. `src/generated/move-sprites.js` and `assets/moves/` are built by `python scripts/build-move-sprites.py`.

Both defense games use type matchups (super-effective hits do double damage) and let a befriended Expedition Legendary strike every foe once per battle; its move lands on each of them.

**Egg moves.** Pokemon hatched from an egg on the watch are like bred Pokemon: they know their family's real egg moves from the Gen II–IV games (Gold/Silver/Crystal through HeartGold/SoulSilver), shared by the whole evolution chain. Team cards and the battle board (EGG) show the egg move used in battle, and the Dex record lists the family's egg moves.

- Attackers use the damaging egg move that improves the most type matchups over their own type (power breaks ties), and every hit uses whichever type is stronger. For example, Charmander's Crunch lets it hit Psychic and Ghost foes as Dark.
- With only same-type damaging egg moves, attacks deal 20% more damage; with only status egg moves (such as Chatot's Agility), the Pokemon has 30% more health.
- Grass growers harvest 10 extra berries in Route Guard (5 in Trail Defense), and Rock/Ground/Steel blockers in Route Guard get 30% more health.
- Families without egg moves (such as Magnemite), loaners and Safari catches get no perk.

`src/generated/egg-moves.js` is built by `node scripts/build-egg-moves.mjs`, which follows `pokemon_data/generate_pokemon_egg_moves.py`: it reads Pokemon #1–493 from PokéAPI, keeps moves learned by egg in the Gen II–IV version groups, adds each move's type and power, and merges moves per evolution chain (`hatdog-app/data/pokemon_species.csv`), so a family shares what its baby or first stage can inherit.

**Walking bonus.** Each km of completed adventures this Monday–Sunday adds 25 starting berries and 3 Safari Balls to every game, up to 3 km. It is only a bonus; every game is fully playable without walking.

**Safari catches in the Dex.** Gen 1–4 non-Legendary Pokemon caught in Safari Hunt join your Dex on this phone with a ◎ Safari mark and a **Safari** filter. They have no distance, steps or time, and they never count toward missions or badges. If the watch later hatches the same Normal/Shiny variant, the watch record replaces the Safari mark. Safari catches can be used as buddies, in Memory Match and in battle teams, even before any watch import.

### Collection and games

- Gen 1–4 Pokémon and the extra Mega families, with bundled sprites and type-themed habitats.
- Separate Normal and Shiny Dex entries, saved run details, and a selectable buddy.
- The Dex sorts and filters like the egg picker: **Lowest No.**, **Highest No.**,
  **A–Z** or **Z–A** (Mega forms sit beside their species), generation with
  region names, type, and **Show** All, Normal, Shiny or Safari. Search takes a
  name, a type or a Dex number, and the count shows how many of your Pokemon
  match. Both screens share `src/pokedex.ts` and `src/PokedexFilters.tsx`.
- A Journal with personal bests and completed runs retained across imports.
- A Pocket Arcade with the Adventure Map, Route Guard, Trail Defense, Safari Hunt, Memory Match, Who’s That Pokémon?, and Berry Catch. Everything works offline and saves best scores and stars on the phone.
- Weekly goals for 10 km and three active days, career missions, and hidden badges. Weeks run Monday–Sunday in the phone’s local time; completed runs count on their finish date.
- A bright, Pokémon HOME-inspired look: white rounded cards on a light page, a teal-to-blue gradient for headers and main buttons, the rounded Nunito font (bundled, so it works offline), type-colored badges and a Dex grid with National Dex numbers. Icons use SF Symbols on iOS and Material Symbols on Android and the web. Text colors keep at least 4.5:1 contrast.

## Compatible watches

The Zepimon watch app (`hatdog-app`) runs on these Amazfit models:

| Watch | Screen | Status | Notes |
| --- | --- | --- | --- |
| Amazfit Bip 5 Unity | 320 × 380, rectangular | Supported | Zepp OS API 3.0. Covers all three hardware versions (device sources 8782081, 8782088, 8782089). The adventure screen is confirmed working on firmware 2.0.1.4. |

Other models are not supported yet. Every watch screen is drawn at a fixed 320 × 380, and the build scripts only build for the Bip 5 Unity. The generic round-screen target in `hatdog-app/app.json` is left over from the project template and has no layout behind it.

To add a watch:

1. Look it up in Zepp's [device list](https://docs.zepp.com/docs/reference/related-resources/device-list/) for its screen size, device source codes and API level. It needs API 3.0 or later.
2. Add a target for it in `hatdog-app/app.json`, and build it with `zeus build -t "<watch name>"` (see the `build` and `preview` scripts in `hatdog-app/package.json`).
3. Adjust the page layouts if its screen differs from 320 × 380.
4. Test it on the watch, then add a row to the table above.

## Bring your watch data across

### Account sync

Open **Sync**, sign in using an email code, and create a one-time linking code. In the Zepp app, open Zepimon's settings → **Sync to Zepimon mobile**, paste the code and link your account. Sync from your connected watch, then return to the phone app and tap **Sync now**. The phone also checks for updates on opening and every minute while visible.

Both apps must have the same Supabase project configured and the database must be installed. See [cloud setup and linking instructions](../zepimon-sync/README.md). Native sign-in sessions are stored in SecureStore. Your normal/shiny Dex entries remain separate, and failed downloads keep your offline journal.

### Using Zepimon with another account

Anyone with their own Amazfit watch and Zepp app can use Zepimon with their own email. Each person signs in with their own email code and links their own watch through their own Zepp app. Their records stay separate from everyone else's, and nobody shares a Zepp password.

1. Install Zepimon on their phone, open **Sync** and sign in with an email code.
2. Tap **Create linking code**, paste it into Zepimon's settings in *their* Zepp app, and tap **Link account**.
3. Sync from the watch in Zepp, then tap **Sync now** on the phone.

Each account links one watch. A phone's journal belongs to the first account that syncs on it, so two people cannot take turns signing in on the same phone. Use separate phones.

Before someone else can do this, check the following:

- **Sign-in emails.** Supabase's built-in email service only sends to members of the Supabase project team, at a few emails an hour, so other people would never receive their code. Set up custom SMTP under **Authentication** in the Supabase dashboard. See [Supabase email delivery](https://supabase.com/docs/guides/auth/auth-smtp).
- **Installing the watch app.** Zepimon is not in the Zepp App Store; it installs from the QR code that `zeus preview` prints, scanned in the Zepp app's developer mode (**Profile → Settings → About**, tap the Zepp logo 7 times). Zepp's docs do not say whether a QR code made under one developer account installs from a Zepp app signed in to a different account, so test it first. If it fails, the other person can create their own Zepp developer account and build the watch app themselves, or the app can be submitted to the Zepp App Store. Developer mode is reported to need an account registered directly with Zepp, not one created through Google sign-in. See [Preview on a watch](https://docs.zepp.com/docs/guides/quick-start/preview/).
- **Watch model.** The watch app only runs on the models listed in [Compatible watches](#compatible-watches).
- **Installing the phone app.** On Android, share the APK link from the EAS preview build. On iPhone, installing outside the App Store needs an Apple Developer account with the other person's iPhone registered for ad hoc builds. See [EAS internal distribution](https://docs.expo.dev/build/internal-distribution/).

### Manual import

1. Save your adventure on the watch, then sync Zepimon in the Zepp app.
2. Open Zepimon’s settings in Zepp and choose **Export JSON**.
3. Copy the generated text. Save it as a `.json` file, or paste it into the manual import section of this app’s **Sync** tab.
4. Import again after future adventures to update your collection and missions.

Importing the same file again does not double-count runs or mission progress. The watch export contains the latest completed run per family and retained personal bests. Older runs already overwritten on the watch cannot be recovered; regular imports let the phone keep runs it has seen. The Journal shows the latest 20 retained runs. Active adventures do not count toward completed-run missions.

Cloud sync uses Zepp as the watch connection. Manual imports also remain available. The app does not connect directly to the watch over Bluetooth. Adventures recorded in the phone's **Adventure** tab stay on the phone and are not sent to the watch.

## Back up your data

Open **Sync** and scroll to **Back up your data**. **Save a backup file** creates `zepimon-backup-YYYY-MM-DD-HHmm.json` and opens the share sheet so you can keep it in Files, Drive, email or another app (on the web it downloads). **Show backup as text** shows the same JSON to copy by hand.

The backup is an ordinary Zepimon export (your watch journal exactly as synced) plus a `phoneBackup` section with everything stored only on this phone: missions and saved runs, phone adventures with their routes, best scores, Adventure Map stars, Expedition friends, Safari catches and your buddy. Account links and sign-in details are never included. **Choose JSON file** accepts a backup to bring the watch journal back; restoring the `phoneBackup` section is not built yet.

## Mini-games

Open **Play**, then choose a game:

- **Memory Match:** match up to six pairs from your acquired Normal/Shiny variants. Requires at least two variants in your Dex (imported or caught in Safari Hunt); fewer moves is better.
- **Who’s That Pokémon?:** identify ten Gen 1–4 silhouettes, with four choices for each. Answers reveal the Pokemon; there is no timer. Best score is out of ten.
- **Berry Catch:** tap a berry in the nine garden plots before it moves. Twenty berries appear over 30 seconds, with at most one catch per appearance. The game pauses when you switch tabs, leave the app, or press Pause; tap Resume to continue. Best score is out of twenty.

- **Route Guard / Trail Defense / Safari Hunt:** see [Adventure games](#adventure-games). Free play saves the most waves cleared (out of 10 and 12) and the most Pokemon caught in one hunt.

Every game except Memory Match works without an import. Only completed games save scores; returning to the arcade discards an unfinished round, and switching tabs or leaving the app pauses it. Scores and stars survive app restarts and journal imports. No game changes watch distance, evolution or Shiny odds; Safari Hunt is the only one that adds Dex entries, marked ◎ Safari and kept out of missions.

## Run locally

Use Node.js 24 and npm. From this directory:

```sh
npm ci
npm start
```

Scan the QR code with a compatible **Expo Go** app. The phone and computer should be on the same network. On a physical iPhone, sign into the same Expo account in Expo Go and the CLI (`npx expo login`). Check [Expo Go compatibility](https://expo.dev/go) for SDK 57 during the SDK transition; use an EAS preview build if the available Expo Go version does not support it. See [Expo’s device setup](https://docs.expo.dev/get-started/start-developing/) and the [SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/).

Expo Go has no background location, so the Adventure tab there (and on the web) records only while the app is open on screen. Use the APK or another build to record with the screen off.

## Checks and exports

```sh
npm test
npm run lint
npm run typecheck
npm run export
npx expo-doctor
```

`npm run export` writes web assets and native JavaScript/Hermes bundles to `dist/`. These files are **not an APK or IPA** and cannot be installed as standalone phone apps.

`npm run sync:watch` refreshes the bundled catalog and sprites from the neighboring `hatdog-app` project after changes there.

## Pokemon sprites

The mobile app uses [PokeAPI/sprites](https://github.com/PokeAPI/sprites) for the Dex, buddy habitats, Memory Match and Who's That Pokemon. Normal and Shiny variants are bundled locally, so these views work offline on Android and iPhone.

Gen 1-4 Pokemon use the Platinum pixel sprites; later species and Mega forms use the repository's default sprites. The mobile bundle uses the preserved 96 x 96 source canvases, rather than the watch's reduced 48 x 48 assets. Eggs are locally drawn. Mega Zygarde currently uses its base-form sprite as a fallback.

Images are copied from `hatdog-app/data/original-sprites` by `npm run sync:watch`, with static asset references generated in `src/generated/sprites.js`. The shared `spriteSource` function in `src/catalog.ts` selects the Normal or Shiny image across the app.

Sprite source and credits: [PokeAPI sprites README](https://github.com/PokeAPI/sprites#readme) and [upstream license notice](https://github.com/PokeAPI/sprites/blob/master/LICENCE.txt). The upstream notice credits image copyright to The Pokemon Company.

## App icons

Both apps' icons come from `pokemon_data/zepimon-icon.png`. After changing it, run `python scripts/build-icons.py` (needs Pillow) to rebuild:

- the watch icon in every `hatdog-app/assets/<target>/icon.png`: 248 x 248, a round purple badge with a 4px transparent margin, per Zepp's app icon spec;
- `assets/icon.png`: 1024 x 1024 on a solid purple background, since iOS does not allow transparent icons;
- the Android adaptive icon (`android-icon-foreground.png` inside the launcher safe zone, background `#1C0D3F`) and its Android 13 themed `android-icon-monochrome.png`;
- `assets/favicon.png` for the web build.

`npm run sync:watch` no longer touches the app icon.

## Standalone builds

`eas.json` includes a **preview** profile for internal distribution and a **production** profile for store builds. EAS requires your Expo account and project setup. No cloud build or store submission is performed by this repository’s checks.

### Installable Android APK

The preview profile explicitly builds an **APK**. It bundles the app and sprites,
so the installed app runs without Expo Go or a running development server.
From `zepimon-mobile`, sign in and start the cloud build:

```sh
npx --yes eas-cli@latest login
npm run build:apk
```

On the first build, EAS may ask to create/link the Zepimon project and generate
an Android signing keystore; let EAS manage that key. Once the build succeeds,
open the provided APK download link on your Android phone and install it.
Android may ask you to allow installations from the browser used to download it.
The repo-root `.easignore` limits the build upload to the mobile app and excludes
local caches, generated native folders and signing files.
See [Expo's APK build instructions](https://docs.expo.dev/build-reference/apk/).

### iPhone preview and store builds

```sh
npx eas-cli@latest login
npx eas-cli@latest build --platform ios --profile preview
```

Android preview builds produce an installable APK. Physical iPhone preview builds require an Apple Developer account and registered test devices for ad hoc signing. See [EAS internal distribution](https://docs.expo.dev/build/internal-distribution/).

Before publishing, replace or confirm ownership of the placeholder Android package and iOS bundle identifier, `com.zepimon.companion`, in `app.json`. Configure the appropriate signing credentials and store accounts, then create store binaries with:

```sh
npx eas-cli@latest build --platform all --profile production
```

Production Android builds use AAB; iOS builds require Apple signing. Building and submitting are separate steps. See the [EAS build configuration reference](https://docs.expo.dev/build/eas-json/).

## Data and release limitations

Downloaded/imported journals, retained runs, mission progress, buddy selection, and game scores live in local AsyncStorage. The cloud keeps the latest uploaded watch journal and retained Dex discoveries. It does not back up arcade scores, buddy choice, or the full phone-only run/badge archive. Treat uninstalling or clearing storage as deleting phone-only data, including phone adventures and their routes (save a backup to keep them).

Recording adventures adds location permissions: Android gets fine/coarse location and a location foreground service (no background location), and iOS gets the `location` background mode. Google Play asks apps that use a location foreground service to describe it in the Play Console before release. Keep your original Zepp JSON exports; a fresh sign-in can restore the cloud watch snapshot, while reimporting exports restores only what they contain.

As of **2026-10-17**, `npm audit` reports **28 transitive findings**, mainly in build dependencies, plus the `query-string` URL-decoder dependency chain. The suggested fixes include incompatible major changes or downgrades. Review and resolve the dependency advisories before a public release; do not apply `npm audit fix --force` without checking Expo SDK compatibility.

## Interactive sprites (1.3.0)

Pokemon in Dex cards, habitats, journeys and the play menu face the viewer.
Tap a sprite for a short two-pose reaction and a heart, then it returns to its
idle pose. In the Dex, tap the name/details below the sprite to open records.
There are 600 supported forms (552 species and 48 Mega forms), including shiny
variants. The remaining 49 Mega forms and eggs use still artwork with a heart
response. Mini-game boards and quiz silhouettes keep their original artwork.

Reactions stop when leaving the screen or backgrounding the app. Reduce Motion
uses the still pose with a heart. Rapid taps restart one reaction; no idle
animation timer runs. These interactions do not change progress or game scores.

Rebuild the front-facing frames with `python scripts/build-walking-sprites.py`
(Pillow required; the older script/asset names are retained). This writes only
to the mobile project. See [artwork credits](SPRITE-CREDITS.md).

## Pokemon habitats (1.4.0)

The journal buddy, Dex cards and Pokemon records have pixel-style landscapes
matched to the catalog's primary type: forest glades, coasts, ember trails,
snowy peaks, moonlit woods and more. All 18 types have a theme; Normal and Shiny
variants share their habitat, and eggs use a hatching meadow. Unknown types
fall back to the meadow.

Scenery is drawn with native views and works offline, with no new image pack,
dependency or background animation. The Pokemon remains centered and tappable;
its name below a Dex scene still opens its record. Only the standalone phone
app changes; watch and Zepp bridge packages are unaffected.

### Smaller sprites (1.4.1)

Buddy and record portraits now render at 132 logical pixels (previously 184),
while Dex and arcade preview sprites use 88 (previously 116 and 104). These
are whole multiples of the 44-pixel reaction frames. Web previews use pixelated
image scaling, and Android frame swaps have no fade. Habitat sizes and tap
reactions are retained. The original pixel artwork is unchanged; this reduces
enlargement rather than adding detail to the source sprites.

## Pokeball loader (1.5.1)

While the journal opens, a large pixel Pokeball pulses, shrinking to 40% of its
size and growing back. The same Pokeball, at 20 px, pulses inside buttons while they
wait: Send sign-in code, Sign in, Sync now, linking code, Disconnect watch,
Sign out, Choose JSON file, Use this export and expedition befriending. Only
the pressed button shows it; the others stay disabled. Navigation buttons open
instantly and do not add a delay.

The ball reuses the watch loader's 14 x 14 layout (`hatdog-app/page/loader.js`)
as native views (`src/PokeballLoader.tsx`), so no image or dependency is added.
Reduce Motion shows a still ball. Screen readers hear the button's busy state.
