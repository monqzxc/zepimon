# Zepimon Mobile

A standalone iPhone and Android companion for Zepimon, built with Expo SDK 57 and React Native 0.86. Import your watch journal to explore your collection and adventures offline.

## Features

- Gen 1–4 Pokémon and the extra Mega families, with bundled sprites and type-themed habitats.
- Separate Normal and Shiny Dex entries, saved run details, and a selectable buddy.
- A Journal with personal bests and completed runs retained across imports.
- Memory Match using your acquired Pokémon variants, with a best score for each board size.
- Weekly goals for 10 km and three active days, career missions, and hidden badges. Weeks run Monday–Sunday in the phone’s local time; completed runs count on their finish date.

## Bring your watch data across

1. Save your adventure on the watch, then sync Zepimon in the Zepp app.
2. Open Zepimon’s settings in Zepp and choose **Export JSON**.
3. Copy the generated text. Save it as a `.json` file, or paste it directly into this app’s **Import** tab.
4. Import again after future adventures to update your collection and missions.

Importing the same file again does not double-count runs or mission progress. The watch export contains the latest completed run per family and retained personal bests. Older runs already overwritten on the watch cannot be recovered; regular imports let the phone keep runs it has seen. The Journal shows the latest 20 retained runs. Active adventures do not count toward completed-run missions.

This app uses manual imports. It does not connect directly to the watch over Bluetooth, run a server, or record phone workouts.

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

## Standalone builds

`eas.json` includes a **preview** profile for internal distribution and a **production** profile for store builds. EAS requires your Expo account and project setup. No cloud build or store submission is performed by this repository’s checks.

```sh
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform ios --profile preview
```

Android preview builds produce an installable APK. Physical iPhone preview builds require an Apple Developer account and registered test devices for ad hoc signing. See [EAS internal distribution](https://docs.expo.dev/build/internal-distribution/).

Before publishing, replace or confirm ownership of the placeholder Android package and iOS bundle identifier, `com.zepimon.companion`, in `app.json`. Configure the appropriate signing credentials and store accounts, then create store binaries with:

```sh
npx eas-cli@latest build --platform all --profile production
```

Production Android builds use AAB; iOS builds require Apple signing. Building and submitting are separate steps. See the [EAS build configuration reference](https://docs.expo.dev/build/eas-json/).

## Data and release limitations

Imported journals, retained runs, mission progress, buddy selection, and game scores live in local AsyncStorage. Treat uninstalling the app or clearing its storage as deleting that data. There is no cloud sync or phone-data backup yet. Keep your original Zepp JSON exports; reimporting them restores only the data those exports contain.

As of **2026-10-17**, `npm audit` reports **28 transitive findings**, mainly in build dependencies, plus the `query-string` URL-decoder dependency chain. The suggested fixes include incompatible major changes or downgrades. Review and resolve the dependency advisories before a public release; do not apply `npm audit fix --force` without checking Expo SDK compatibility.
