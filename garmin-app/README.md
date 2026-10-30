# Zepimon for Garmin (Forerunner 165)

The Zepimon watch game rebuilt for Garmin's Connect IQ, starting with the Forerunner 165 and 165 Music. It follows
the same rules as the Zepp watch app (`hatdog-app`): carry an egg on a walk or run, every 5 km of one adventure it
hatches or evolves, its Mega form arrives at 21 km, and 1 egg in 50 is Shiny.

**Step 1 (this version)** plays a whole adventure on the watch:

- **Title screen:** the egg to carry next, from the same 266 families as the Zepp app (Legendaries come from
  Expeditions). Press UP/DOWN or swipe to change it, START to choose **Walk** or **Run**.
- **Adventure:** a real Garmin walking or running activity with GPS. The screen shows the time, distance, the Pokemon
  and the distance to its next form; a hatch, evolution or Mega buzzes. Until GPS is good it says so.
- **Finish (BACK or START):** **Save & finish** saves the activity to Garmin Connect (and from there to Strava, if you
  link it) and the Pokemon to the watch's Dex. **Discard** keeps nothing. Leaving the app while recording saves.

Not yet: Pokemon sprites (a placeholder badge shows for now), syncing with your Zepimon account and the phone app,
choosing the next egg from the phone, and Expeditions. Those are the next steps.

## Build and install

You need the Connect IQ SDK, which Garmin only offers through its developer site:

1. Install **Visual Studio Code** and its **Monkey C** extension (by Garmin).
2. In VS Code, run **Monkey C: Verify Installation**. It opens the **SDK Manager**: sign in with a Garmin account,
   download the latest SDK and the **Forerunner 165** device (and **165 Music** if that is yours).
3. Run **Monkey C: Generate a Developer Key** once.
4. Open the `garmin-app` folder and run **Monkey C: Build for Device**, choosing the Forerunner 165. It writes
   `bin/garmin-app.prg`.
5. Try it in the simulator first: **Run → Run Without Debugging** with the Forerunner 165. In the simulator,
   **Simulation → Activity Data** feeds it a fake walk or run.
6. On the watch: connect it by USB, copy the `.prg` file into the watch's `GARMIN/APPS` folder, and unplug. Zepimon
   appears in the apps list.

If the build stops on the product ids in `manifest.xml`, open the SDK Manager's device list and use the ids it shows
for the Forerunner 165 and 165 Music (`fr165` and `fr165m` are expected). The launcher icon is 70 px; if the build
asks for another size, it says which.

The Pokemon art belongs to Nintendo, Game Freak and The Pokemon Company, so this app is for your own watch: the
Connect IQ Store would not accept it.

## Files

- `manifest.xml`, `monkey.jungle`: the app, its devices and permissions (GPS and activity recording).
- `source/`: `ZepimonApp.mc` (start and stop), `Rules.mc` (the eggs and forms, as in `hatdog-app/page/pokemon.js`),
  `Adventure.mc` (the activity being recorded), `Journal.mc` (the Dex, records and Expedition distance in the watch's
  storage), `Draw.mc`, and the screens: `HomeView.mc`, `SessionView.mc`, `SavedView.mc`.
- `resources/data/catalog.json`: the eggs, written by `node garmin-app/scripts/build-catalog.mjs` from the Zepp app's
  catalog. Run it again when the catalog changes.
