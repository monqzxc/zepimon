# Zepimon Mobile

A standalone iPhone and Android companion for Zepimon, built with Expo SDK 57 and React Native 0.86. Sync or import your watch journal to explore your collection and adventures offline.

## Features

- Gen 1–4 Pokémon and the extra Mega families, with bundled sprites and type-themed habitats.
- Separate Normal and Shiny Dex entries, saved run details, and a selectable buddy.
- A Journal with personal bests and completed runs retained across imports.
- A Pocket Arcade with Memory Match, Who’s That Pokémon?, and Berry Catch. All three work offline and save their best scores on the phone.
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

## Mini-games

Open **Play**, then choose a game:

- **Memory Match:** match up to six pairs from your acquired Normal/Shiny variants. Requires at least two variants in your imported Dex; fewer moves is better.
- **Who’s That Pokémon?:** identify ten Gen 1–4 silhouettes, with four choices for each. Answers reveal the Pokemon; there is no timer. Best score is out of ten.
- **Berry Catch:** tap a berry in the nine garden plots before it moves. Twenty berries appear over 30 seconds, with at most one catch per appearance. The game pauses when you switch tabs, leave the app, or press Pause; tap Resume to continue. Best score is out of twenty.

Quiz and Berry Catch need no import. Only completed games save scores; returning to the arcade discards an unfinished round. Scores survive app restarts and journal imports. These games do not change watch distance, evolution, Shiny odds, or Dex records.

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
