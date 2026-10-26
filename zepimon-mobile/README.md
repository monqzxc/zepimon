# Zepimon Mobile

A standalone iPhone and Android companion for Zepimon, built with Expo SDK 57 and React Native 0.86. Sync or import your watch journal to explore your collection and adventures offline.

## Features

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
- **Trail Defense** (tower defense): place Pokemon beside a winding trail. Defeated foes pay berries. Every family starts at its first stage and can evolve mid-battle with berries, all the way to its final stage. Foes that reach the end cost lives (a boss costs three).
- **Safari Hunt** (hunting): two minutes, 12 Safari Balls. Tap rustling grass, then throw when the shrinking ring is small. Bait makes a Pokemon less likely to run but harder to catch; rocks do the opposite. Catching the same species in a row raises its Shiny chance from 1 in 60 to as good as 1 in 8.
- **Adventure Map**: nine stops from Route 1 to Victory Road, alternating the three games. Each stop gives up to three stars, and one star opens the next stop. The final stop ends with a Shadow Mewtwo.

Foes walk with two-step overworld animations: down the lanes in Route Guard, and facing whichever way the trail runs in Trail Defense (Gen 1-4 forms; still sprites otherwise, and with reduced motion). Trail Defense draws its habitat as textured ground with an edged dirt trail, direction chevrons, a cave where foes enter and a Poke Ball goal; tapping a placed Pokemon shows its attack range.

Both defense games use type matchups (super-effective hits do double damage) and let a befriended Expedition Legendary strike every foe once per battle.

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
- A Journal with personal bests and completed runs retained across imports.
- A Pocket Arcade with the Adventure Map, Route Guard, Trail Defense, Safari Hunt, Memory Match, Who’s That Pokémon?, and Berry Catch. Everything works offline and saves best scores and stars on the phone.
- Weekly goals for 10 km and three active days, career missions, and hidden badges. Weeks run Monday–Sunday in the phone’s local time; completed runs count on their finish date.

## Bring your watch data across

### Account sync

Open **Sync**, sign in using an email code, and create a one-time linking code. In the Zepp app, open Zepimon's settings → **Sync to Zepimon mobile**, paste the code and link your account. Sync from your connected watch, then return to the phone app and tap **Sync now**. The phone also checks for updates on opening and every minute while visible.

Both apps must have the same Supabase project configured and the database must be installed. See [cloud setup and linking instructions](../zepimon-sync/README.md). Native sign-in sessions are stored in SecureStore. Your normal/shiny Dex entries remain separate, and failed downloads keep your offline journal.

### Manual import

1. Save your adventure on the watch, then sync Zepimon in the Zepp app.
2. Open Zepimon’s settings in Zepp and choose **Export JSON**.
3. Copy the generated text. Save it as a `.json` file, or paste it into the manual import section of this app’s **Sync** tab.
4. Import again after future adventures to update your collection and missions.

Importing the same file again does not double-count runs or mission progress. The watch export contains the latest completed run per family and retained personal bests. Older runs already overwritten on the watch cannot be recovered; regular imports let the phone keep runs it has seen. The Journal shows the latest 20 retained runs. Active adventures do not count toward completed-run missions.

Cloud sync uses Zepp as the watch connection. Manual imports also remain available. The app does not connect directly to the watch over Bluetooth or record phone workouts.

## Back up your data

Open **Sync** and scroll to **Back up your data**. **Save a backup file** creates `zepimon-backup-YYYY-MM-DD-HHmm.json` and opens the share sheet so you can keep it in Files, Drive, email or another app (on the web it downloads). **Show backup as text** shows the same JSON to copy by hand.

The backup is an ordinary Zepimon export (your watch journal exactly as synced) plus a `phoneBackup` section with everything stored only on this phone: missions and saved runs, best scores, Adventure Map stars, Expedition friends, Safari catches and your buddy. Account links and sign-in details are never included. **Choose JSON file** accepts a backup to bring the watch journal back; restoring the `phoneBackup` section is not built yet.

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

Downloaded/imported journals, retained runs, mission progress, buddy selection, and game scores live in local AsyncStorage. The cloud keeps the latest uploaded watch journal and retained Dex discoveries. It does not back up arcade scores, buddy choice, or the full phone-only run/badge archive. Treat uninstalling or clearing storage as deleting phone-only data. Keep your original Zepp JSON exports; a fresh sign-in can restore the cloud watch snapshot, while reimporting exports restores only what they contain.

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
