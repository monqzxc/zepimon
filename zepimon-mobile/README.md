# Zepimon Mobile

A standalone iPhone and Android companion for Zepimon, built with Expo SDK 57 and React Native 0.86. Sync or import your watch journal to explore your collection and adventures offline.

## Features

### Phone adventures

The **Adventure** tab, the Poke Ball in the middle of the tab bar, is the
phone version of the watch adventure. Tap the ball and it spins, then Gengar pops
out in a cap, T-shirt and shorts and floats there inside a pulsing shadow aura
while the tab is open, working out: standing, waving (tongue out, with a wink),
lifting, push-ups, sit-ups and worn out, the next pose every 3 seconds or as soon
as you tap the ball again. Choose an egg, or take a
random one, pick a Mega form where the family has one, choose **Walking** or
**Running** and start. The phone measures distance by GPS: every 5 km in one
adventure hatches or evolves the egg, with the Mega form at 21 km, and 1 in 50
eggs is Shiny, as on the watch. While recording you see the walking Pokemon,
distance, time (including stops), current and average pace, the distance to the
next hatch or evolution, and the route drawn live on a street map. **Finish & save** adds the
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

**Routes on a real map (1.9.17).** While you record, the route is drawn live on
a street map that follows you: a blue dot marks where you are, with a soft circle
for the GPS accuracy, and it turns grey when the signal is lost. Drag or pinch
the map to look around; **Follow me** goes back to following you. A saved phone
adventure shows its route on the same map right after saving and on its page.
The map is [Leaflet](https://leafletjs.com) over
[OpenFreeMap](https://openfreemap.org) streets, which MapLibre draws from vector
tiles: free, with no account, key or request limit. OpenStreetMap's own tile
servers are not used because they refuse the app's map, which cannot send the
Referer they require. On phones the map runs in a web view as an Expo DOM component
(`src/LeafletMap.tsx`), so it needs no extra native module. Streets need a
connection; offline, the route still draws on a plain background. Lists and the
share image still draw small routes as a line on a plain grid.
GPS fixes less accurate than 35 m, small jitter while standing still and jumps
faster than running (or walking) speed are ignored. Phones count distance, not
steps. Phone adventures walk their own Legendary Expedition trail, and they are
kept apart from the watch journal, so a watch sync never replaces them.

**Share an adventure as an image.** Tap **Share image** on any adventure (in
**All adventures** or **Your routes**), the round share button on its details, or **Share
adventure image** right after saving one. It makes a 1080 × 1920 PNG,
story size, like a Strava share card: the route, a Pokemon as large pixel art,
and the distance, pace and time. Watch adventures have no route, so their card
shows the Pokemon and stats. Before saving, choose:

- **Design:** **Classic** puts the stats over the route, like Strava; **Split**
  puts the route on top and the Pokemon and stats below.
- **Pokemon:** the one the adventure reached (the default), the egg, or any
  form it passed on the way.
- **Style:** **Default** (the battle sprite), **Facing front** (the sprite
  the Dex shows) or **Running** (that sprite seen from the side, mid-stride to
  the right, as in Trail Defense). The egg and forms without overworld art have
  only Default.
  Android release builds re-save bundled sprites in other PNG formats, which
  `src/pixel-art.ts` reads too.
- **Size:** **Small**, **Medium**, **Large** or **Extra large**.
- **Background:** **Dark**; **Clear**, which is see-through for laying over your
  own photo; or **Habitat**, the Pokemon's home scenery from the Journal (the
  route turns white to stand out on it).
- **Show on the card:** tick any of the type, a personal best the adventure
  holds, the evolutions reached, the hatch time, steps (watch adventures) and
  the start and finish time. Only the ones the adventure has are offered.

These choices, except the Pokemon, stay as you left them until the app closes.
**Save to gallery** asks once for permission to add photos (photos only; the app
never reads your gallery) and saves the PNG to a **Zepimon** album. If access was
turned off for good, **Open settings** goes straight to the switch. **Share**
opens the share sheet to post it, print it or save it to Files. The web build
downloads the PNG instead. Sprites are enlarged by whole
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

Missions open from the Adventure tab (**Missions & expeditions**), with this
week's progress toward 10 km on the tile.

**One egg, phone and watch.** With your watch linked in **Settings**, the egg you
choose in the Adventure tab (or with **Hatch this next** on a Pokemon's Dex page)
is also the next egg on the watch's title screen, ready for one tap on Walk or
Run. Starting it on either one uses it up. While the phone records, the watch
warns before recording too, and the Adventure tab shows an adventure in progress
on the watch (as of its last sync) and asks for a second tap before starting
here, so the same steps are not counted twice. The plan goes through the cloud
when you are signed in; see [zepimon-sync](../zepimon-sync/README.md).

**One shared adventure (1.9.9).** Whichever device starts an adventure, the
phone, the watch and the Zepimon page in Zepp show the same one: its Pokemon,
Walk or Run, and distance, shared every half minute (also with the phone's
screen off); the open app checks for the watch's every 15 seconds. The other device does not start a second one; it offers
**Continue here** instead. Continuing takes the adventure over with its egg,
Shiny roll, start time and distance so far; the device that had it stops
without saving, and the Adventure tab says **Continued on your watch** when the
watch takes over. Only the device recording at the end saves it, so steps are
never counted twice; if both ever save it (each offline when the other took
over), the Journal counts it once with the longer distance. Starting with the
egg chosen here uses it up on both devices. Needs the watch linked in **Settings**
and `zepimon-sync/schema.sql` re-run in Supabase.

**Following the watch (1.9.17).** While the watch records, the Adventure tab
shows its adventure live: the Pokemon stepping along, the distance to its next
hatch or evolution, the distance, the time since it started, the average pace,
the pace now (from the shares heard over the last two minutes), and when it last
synced. There is no map or route, because the watch counts distance without GPS.
**Continue here** moves recording to the phone, which maps the rest of the route.
If the watch goes quiet for 3 minutes, the tab says when it was last heard and
the pace shows as unknown.

**When an adventure is on.** When the watch starts an adventure, **A new
adventure started** slides down over whatever screen is open, with its Pokemon
and Walk or Run, as soon as the app hears of it (when it comes to the front,
then about once a minute). It closes after 3 seconds or with its close button;
tapping it opens the Adventure tab. Each adventure is announced once, also after
a restart. While any adventure is on, here or on the watch, Gengar leaves his
perch on the tab bar and steps along on top of the rolling Poke Ball, twice as
fast on a run, and pops back up on his perch when it ends.

**Phone adventures on the watch (1.9.7).** Adventures saved here also go to the
watch, through the cloud and without their routes. You can pick the Pokemon on the
phone and record either here or, with one tap, on the watch, and both end up in
the watch's journal. The next time Zepimon opens on the watch with Zepp
connected, it adds their Pokemon to its Dex, makes each the family's latest
record unless the watch has a newer one, and updates its personal bests. Phone
distance keeps walking the phone's own Expedition trail. When the watch's
journal syncs back, the phone recognizes its own adventures, so missions and
runs never count one twice. Needs the watch linked in **Settings** and
`zepimon-sync/schema.sql` re-run in Supabase.

**The Journal is a calendar.** A strip of the last two weeks runs across the top,
**Today** first; a dot marks days with an adventure. The open day joins a card
with its date, the distance walked that day in large type, how many adventures
and how long. Your buddy stands on the card's edge (tap it for its record) and
says how far it walked with you. Below, **Week**, **Month** and **Year** show that
period's adventures, from the chosen day, as pastel bento tiles in each
Pokemon's type colour: the Pokemon, a phone or watch badge, the date and what it
became. Personal bests close the page. Missions and Legendary Expeditions moved
to the Adventure tab (**Missions & expeditions**).

**Calendar.** The calendar button beside the Journal's title opens the month of
the day it shows. Days are round cells from Monday; a day with adventures shows
its latest Pokemon in the circle, with a dot per adventure below. Tap any day up
to today for its history: each adventure that finished then, with its Pokemon,
walk or run, distance and time, and its start time on a dark pill (tap it for
its details). **This month** picks another month, back to your first adventure;
**Today** comes back, and **+** starts an adventure.

**Adventures from both devices.** The Journal keeps every walk and run from the
watch as well as from this phone. **View all** (also under **Your routes** in the
Adventure tab) lists every one by month, with its total distance, and filters by
device. Tap any adventure for its details, laid out like a calendar event: a
header in its type colour with the date, weekday and Pokemon, then a sheet with
a short description of the adventure, rows for its type, start → finish time and
duration, distance and pace, walk or run and steps, the device, the hatch and any
personal best it holds, the Pokemon it reached (each opens its Dex record), the
route for phone adventures, and a round share button for the image. The watch sends its
last 30 adventures with each sync, so two walks with the same egg between syncs
both appear; older watch versions still send only each family's latest.

### Settings

The last tab, **Settings** (it was **Sync**), opens on your profile: your buddy
as the picture, your trainer name (set under **Edit profile**, kept on this
phone) and your account's email. Below it, grouped lists in the order people
look for things: **Preferences**, **Account** (sign in with an email code, the
**Watch** page to link it through Zepp, get a replacement code or disconnect,
**Sync now**, and **Log out**, which asks for a second tap), **Your data**
(backups, and importing a watch's JSON export) and **About** (phone and watch
versions, credits). Longer settings open on their own page. Preferences are kept
on this phone: **Theme**, **Start adventures as** Walking or Running (the
Adventure tab's first choice), **Reduce motion** (off follows the phone's
reduce-motion setting) and **Record with the screen off** (the foreground-service
recording, which a crash during an adventure turns off). The open tab's icon
sits on a soft violet pill.

**Theme** picks **Emerald** (the default for new installs; see below), **Gengar**
(ghostly violet), **Deoxys** (cosmic orange-red and teal) or **Pikachu**
(electric yellow), from small previews of each with its Pokemon perched on a
tiny tab bar. A phone that had Zepimon before Emerald keeps the theme it was
showing, Gengar unless another was chosen. Its **Appearance**
is System, Light or Dark; System follows the phone's dark mode and switches with
it. A theme recolors the whole app in both appearances: pages and cards, the
accent on chips and links, the gradient on banners and main buttons, the second
accent (Gengar's red eyes, Deoxys's teal, Pikachu's cheeks) and the tab bar.
Each theme brings its own Pokemon to the tab bar, in its training gear: it peeks
over the open tab, floats out of a ball in its colors (Gengar's violet, an
orange-red Deoxys ball with a teal stripe, a yellow Pikachu ball with a stripe as
red as its cheeks) through the same six workout poses, and steps on the ball
during an adventure. With reduced motion the poses change only on a tap. The
floating poses, and Deoxys's and Pikachu's peeking art, are cut from the
`*-fitness*.png` sheets in `pokemon_data/` by `scripts/build-nav-poses.py`;
Pikachu's sheet has no shut-eyed face, so its blink is drawn. Every text color
keeps at least 4.5:1 contrast in all eight palettes, which
`tests/palettes.test.js` checks. Share images and the route map keep their own
colors. The palettes are in `src/palettes.ts` and the active one in
`src/theme.ts`; styles that use them are made with `themedStyles`, and each
screen calls `useTheme()` so it redraws when the theme changes.

#### Themes: Emerald (1.15.0)

**Emerald** looks like Pokemon Emerald on the Game Boy Advance, with a little
HD-2D depth. Its colors are emerald green with Hoenn sea blue and Rayquaza gold,
on soft cream paper by day and deep teal at night. Every card is a **RetroFrame**,
like the game's text boxes: a rounded double border (dark outside, light inside)
with chunky corners, a light line along the top edge and a hard drop shadow.
Eyebrows, titles and headings use the **Pixelify Sans** pixel face
(`fonts.pixel`, SIL Open Font License); body text stays in Nunito. Banners show
Hoenn's sky with hills, sea and clouds drifting in layers at different speeds
(`src/Parallax.tsx`). Buttons, chips and tiles rise a few pixels onto a deeper
shadow while pressed. Chosen chips and theme cards glow, and the chosen row in a
settings list gets Emerald's ▶ cursor. With reduced motion nothing drifts or
lifts. Its tab-bar Pokemon is Deoxys, met on Birth Island in Emerald, with an
emerald-and-gold ball and aura; no other Hoenn Pokemon has the cut-out training
poses. All of this goes through `colors`, `fonts`, `themedStyles` and the
components in `src/ui.tsx` (`retro()` tells them Emerald is on), so every screen
picks it up and the other themes look as before.

### Legendary Expeditions (1.5.0)

**The Legendary Gate (1.15.0)** is the way in. It's the featured card at the top
of Home, a smaller strip on the Adventure tab under Missions, and the header of
the Expeditions screen, seen from inside the gate. It's a Sky Pillar-style stone
gate under a layered sky, with your Safari Zone trainer at its foot, and it shows
where you stand:

- **Waiting:** the gate glows and gently pulses, the waiting Legendary stands in
  it, and the line reads "Mesprit is waiting at Lake Verity". A ✦ badge shows on
  the Journal tab.
- **Permit ready:** a permit is in hand, or the Expedition Quest is done and one
  is ready to claim.
- **On the trail:** how far to the next encounter, for example "3 km to your next
  encounter".
- **No trail yet:** save an adventure to find the first clue.

Away from waiting, the gate is dim and the last Legendary you caught stands in it
as a dark silhouette (a ? before your first catch). It never reveals a Shiny; the
chamber does. With reduced motion the gate holds still, and the glow, the
silhouette and the words still tell the states apart. `gateStatus` in
`src/legendary-gate.ts` works the state out (`tests/legendary-gate.test.js`); the
scene is `src/LegendaryGate.tsx`.


Open **Expeditions** under **Missions & expeditions** on the Adventure tab. With watch v1.11.0, saved
walks/runs accumulate toward clues at 5, 15 and 25 km. Mystery habitats and silhouettes become visible as
clues are discovered. The 39 available species cycle from a random starting point. Extra distance carries
into subsequent expeditions; multiple unlocked encounters wait for you.

**Three ways to open the next encounter.** Any one is enough, and the screen shows each one's progress separately:

- **Route A, distance:** 25 km of saved walks and runs (never live distance). 24,999 m is not enough; 25,000 m is.
- **Route B, Expedition Quest:** three saved walks or runs of at least 1 km each, plus the quest's shrine
  challenge (light nine lanterns; touching one flips it and its neighbours). It earns one **Expedition Permit**.
  The first quest counts sessions since your expedition trail began; each later quest counts sessions after the
  last one used, so no session counts twice, however often a journal is imported.
- **Route C, arcade achievements:** 32 achievements across the Pocket Arcade (Memory Match, Quiz, Berry Catch,
  Route Guard, Trail Defense, the Adventure Map, the Safari Zone and the Legendary Trials) are worth 10–40 points
  each, 610 in all.
  Every 100 points can be traded for an Expedition Permit. Achievements are read from the best scores, stars and
  Safari catches the games already save, so replaying cannot count one twice. The arcade shows them under
  **Arcade achievements**.

A permit opens the next encounter on a trail early; it is spent only when nothing there is already open, and it
never grants a free catch. Permits are kept beside the trails (`quest` in the phone's saved data), so the watch/phone
trail contract `{ seed, startedAt, meters }` and its merge rules are unchanged. Distance keeps counting toward the
next 25 km after a permit encounter.

**Each encounter: trial → chamber → Resonance Trial → battle → catch.**

1. **Trial:** a species-themed Legendary Trial (for example Sky Pillar Ascent for Rayquaza), one or two rooms walked
   like the Safari Zone. See **Legendary Trials** below. Once finished, it stays finished.
2. **Chamber:** the Legendary slides in and its result is revealed. Each roll has a **1 in 100** Shiny chance, made
   the first time the chamber opens. Leaving, refreshing, reopening or syncing never rerolls. **Reset encounter**
   asks for confirmation (two steps for a Shiny), waits **5 seconds**, then rolls once. The wait is saved as a clock
   time, so a reset left running finishes when you come back. Resetting never changes the species, the trial,
   distance or claim order, and is only possible before the Resonance Trial starts.
3. **Resonance Trial:** an arena where you switch on four ancient seals to steady the Legendary. See **Legendary
   Resonance Trials** below. The catch opens once it is stabilized.
4. **Battle:** an Emerald-style FIGHT / BAG / POKéMON / RUN battle with your buddy (or Pikachu). Moves (your
   buddy's type move and False Swipe) lower HP but always leave the Legendary at 1 HP or more.
5. **Catch:** five Poké Balls per battle; lower HP makes a catch likelier. A failed catch, running or running out of
   balls uses nothing up. Only a successful catch claims the encounter and adds the Legendary to the Dex, once.

Battle animations (entrances, idle bob, lunge, hit flashes with Gen III move strips, ball arc, shakes and capture)
respect the phone's or the app's reduce-motion setting. They reuse the Emerald battle backgrounds and move sprites
already credited in `SPRITE-CREDITS.md`; the Poké Ball is the app's own vector icon.

#### Legendary Resonance Trials

Between the chamber and the battle, the Legendary resonates in an arena: a 9 × 9 clearing of the Safari Zone by the
lake, drawn, walked and collided exactly as the Safari Zone is (the same map and terrain, D-pad, arrow keys / WASD or
Tap to walk, trainer and buddy). The Legendary stands in the middle, and four ancient seals ◇ sit around it:

- **Wave:** an energy wave covers the whole clearing but one safe tile ◎; stand on it before it lands (3.2 s).
- **Rune:** three numbered runes light up; step on 1, 2, then 3. A rune out of turn simply doesn't count.
- **Pulse:** stand on the seal and press **Resonate** (or Space / Enter) while the shrinking ring is inside the gold band.
  The Legendary holds still while you focus.
- **Stone:** three guardian stones ▲ stir; step on each, in any order.

Runes and stones keep their progress while you walk around; the wave and the pulse simply start again if missed.
Meanwhile the Legendary sends gentle attacks: a ring around you or a line through you, marked ⚠ on the ground for 1.8 s
before it lands ✸. That's time for about eight steps, and one or two always get you clear. Only the marked tiles count,
at the moment the attack lands. A hit costs one **resonance** and a short stagger. You start with 3, plus 1 for each km
of saved walks and runs this week, up to 5 (the arcade's walking bonus: only saved, finished adventures count). At 0
you catch your breath while the Legendary holds back, then you're back to full. Nothing ever turns a seal off.

With all four seals on, **Steady the Legendary** plays a short stabilization and opens the catch: the battle and
catch above, unchanged. Leaving, pausing (or the app going to the background), restarting the app or a failed catch
keeps every seal; each one is saved the moment it switches on. Entering the arena sets the encounter, so the chamber
can no longer be reset, and only a successful catch claims it. The rules are in `src/games/resonance.ts`, the saved
progress (`resonance` on the waiting encounter) in `src/expedition-encounter.ts`, and the screen is
`src/games/ResonanceTrial.tsx`. They're covered by `tests/resonance-arena.test.js` and `tests/resonance-encounter.test.js`.

#### Legendary Trials

Every Legendary has a trial of one of six kinds. All six share the Safari Zone's movement: Brendan or May (the Safari
setting) with your buddy one tile behind, the D-pad or the arrow keys / WASD (hold to keep walking), or **Tap to walk**,
whose routes never cross a hole, cracked floor, switch, pad or crystal on the way (they can end on one). A bump into
a wall costs no move.
Rooms are Emerald tiles, and a minimap shows only the tiles you have seen.

| Kind | Legendaries | What the rooms ask |
|---|---|---|
| **Switch Maze** | Zapdos, Raikou, Ho-Oh, Jirachi, Magearna, Zeraora, Arceus | Stepping *onto* a switch (a, b, c) opens or shuts every gate of its letter. Standing still or bumping does nothing. |
| **Crumbling Floor** | Articuno, Moltres, Suicune, Regice, Latias, Latios, Rayquaza, Heatran | Cracked floor holds once, then becomes a hole. Stepping into a hole drops you and the room starts again. Some rooms ask you to cross every cracked tile. |
| **Dark Labyrinth** | Entei, Celebi, Kyogre, Groudon, Giratina, Darkrai, Cresselia, Zygarde | You see 2 tiles around you, and wall torches light 1 tile around them. Unseen tiles stay black, and Tap to walk only goes to tiles you have seen. |
| **Ancient Temple** | Lugia, Regirock, Registeel, Regigigas, Shaymin, Diancie, Phione, Manaphy | Push boulders onto pressure plates. When every plate holds a boulder at once, the stone door opens for good. A push that would leave a boulder where it could never reach a plate is refused ("The boulder would get stuck there."). |
| **Warp Chamber** | Mewtwo, Mew, Uxie, Mesprit, Azelf, Dialga, Palkia | Stepping onto a numbered pad moves you to its partner pad. You stop there, so a held key never chains warps. |
| **Shattered Star** | Deoxys | A single island puzzle (below). |

Every maze room also has walls, rocks and deep water that block, relics to collect, and a golden exit (the chamber
door in the last room) that opens once every relic is found ("The seal holds. 2 relics remain." until then).

**Room order.** Until you have cleared that kind's tutorial, its trial starts with a short tutorial room that teaches
its mechanic. Then comes one main room: room 1 if you have cleared no main room of that kind yet, room 2 after one, and
room 3 after two or more. So a trial is one or two rooms, and later Legendaries of a kind you know get harder rooms.
The Shattered Star is always the one island; its clue stones and hints stand in for a tutorial.

**Moves and par.** There is no timer and no move limit. Each room counts your moves (a step, push or warp) and shows
its par, the fewest moves that clear it. **Restart room** puts the room back as it was. **Start over**
goes back to the first room, and **Leave** takes you back to Expeditions. While you play, the screen doesn't scroll:
the map takes the space left by the status line, the moves line, the D-pad with the minimap beside it and these
buttons, so everything fits on a phone at once.

**The Shattered Star (Deoxys).** A meteorite sits at the island's heart, with five crystals around the shore and on
an islet. The goal is to light the right crystals and turn the star to the right face, then wake it.

- **Crystals.** Each time you step *onto* a crystal, it flips: lit goes dark and dark lights up. Its two linked
  neighbours flip with it. Only the step onto it counts: standing on a crystal, or bumping into something while you
  stand on it, changes nothing. The status line says whether the crystal lit up or went dark and whether a passage
  opened, but never whether the star turned.
- **Turns.** Some crystals also turn the star one face each time you step onto them. It has three faces, so the
  third turn brings it back to the first face.
- **Passages.** A crystal can open a passage (a gate across the water) the first time it lights. The passage stays
  open for good, whatever you do to the crystals afterwards.
- **Clue stones.** Walk into a stone to read it. Together, the stones tell you the whole answer. The lines of old
  stars drawn on the ground also point the way.
- **Attuning.** Walk into the meteorite to try it. If the lit crystals and the star's face are right, the
  meteorite wakes and Deoxys appears. If not, the attempt counts and the meteorite says how close you were without
  saying which part is wrong: "The meteorite flickers. 3 of 6 lights answer." counts each crystal in the right state,
  plus one if the face is right. A failed attempt changes nothing else, so you can build on what it told you.
- **Hints.** The **Hint** button shows, in the status line, a new hint after every two attempts, up to three, from vague to specific.
  None of them gives the whole answer.
- **Reset the crystals** puts the crystals and the star's face back to how you found them. You keep your place,
  the map you have explored, the stones you have read, the passages you have opened and your attempts (and so your
  hints). **Restart room** resets everything, including those.

**Checkpoints.** Leaving never uses up the encounter. Your place in the trial is saved when you clear a room, when
you leave and when the app goes to the background, and you pick up exactly where you were: the same room, position,
moves, open gates, holes, boulders and seen tiles. If an app update changes a room you were partway through, that
checkpoint is dropped and the trial starts fresh; the encounter itself is kept. Finishing the trial is permanent.

**Records and achievements.** Your best moves for every room are kept on this phone (`trialRecords`, included in
backups). The arcade has seven trial achievements, 80 points in all: **Switch Maze clear**, **Crumbling Floor clear**,
**Dark Labyrinth clear**, **Ancient Temple clear** and **Warp Chamber clear** (clear a main room of that kind, 10
points each), **Wake the Shattered Star** (10) and **Right on par** (clear 5 different rooms at or under par, 20). The trial itself never claims the
encounter or changes its species, Shiny roll or order: only a successful catch does.

Trial animations (steps, falls, warps, room fades and the star's reveal) respect reduce motion. The art is Emerald's,
credited in `SPRITE-CREDITS.md`.

**Adding a room or a new star-style puzzle.** Rooms are data. Each is an entry in `scripts/trials/stages.json`, keyed
`<kind>-tutorial` or `<kind>-1`…`3` (the ids the room order picks), with `kind`, `tiles` (one character per tile:
`.` ground, `,` path, `g` grass, `w` shallows, `~` water, `R` rock, `#` wall, `!` torch, `@` start, `X` exit,
`*` relic, `a`–`c` switches and `A`–`C` their gates, `_` plate, `=` stone door, `O` boulder, `:` cracked floor,
`1`–`9` warp pads, and for a star `%` crystal, `?` clue stone and `M` the 2 × 2 meteorite), `par` and a `hint`, plus
`open`, `crackAll`, `dark` or `warps` where they apply. A star-style puzzle adds a `star` block: crystal `nodes` (`id`,
`at`, `links`, `turns`, optional `opens`), `patterns`, `startLit`, the `target`, `resetOnFail`, `clues` (each with the
crystals or `pattern` it `reveals`) and three `hints`. A new Legendary's kind and lore go in `TRIALS` in
`src/games/trials.ts`. Then run `python scripts/build-trial-maps.py` (Pillow), which checks the room against the
rules, bakes `assets/trials/` and writes `src/generated/trial-maps.js` and `trial-assets.js`, and `npm test`, which
proves every room can be cleared within par by the real rules, keeps rooms to a 3–5 minute size and checks that a
star's clues cover its whole target and that it takes at least three crystal presses.

**Shiny odds and older saves.** The canonical seeded draw in `hatdog-app/shared/expedition.js` (species and its
1-in-50 Shiny) is unchanged and still fixes each encounter's species. Encounter rolls are kept separately (`encounters`
in the phone's saved data: species, attempt, trial, Shiny, reset-pending and `nextResetAllowedAt`). On the first
launch after this update, an encounter that was already open and showed a Shiny from the old draw keeps that Shiny
as its first roll; every other unclaimed encounter rolls 1 in 100 when its chamber opens. Friends already befriended
are never changed.

Normal and Shiny friends join the Dex separately and can be selected as buddies.
Expedition records show 25 cumulative km rather than invented workout pace,
steps or hatch time. They do not create extra workouts or inflate run missions.

Progress starts with adventures saved after the watch update; overwritten old
runs cannot be recovered. Existing Legendary acquisitions and active watch
adventures are retained. The watch counter and seed use the existing Supabase
snapshot and manual JSON path, with no database migration. Befriending records,
quests, permits and encounter rolls are stored on this phone alongside missions and scores. Reinstalling the app
requires befriending unlocked encounters again after syncing. A watch reset starts a new trail without removing
phone discoveries.

#### Shrine Revisits (1.13.0)

Every Legendary you've caught on an expedition gets a row under **Shrine Revisits** on the Expeditions screen, in
species order. A Shiny catch gets its own row, marked ✦. You can come back any time, with no permit, distance or quest needed:

- **Revisit the trial** opens a room picker for that Legendary's kind: Tutorial and Rooms 1–3, each with your best
  moves and par. Deoxys goes straight to the Shattered Star island, reveal included. Practice is never saved mid-room,
  so leaving drops the run. A clear saves the room's moves to your trial records only if they're lower ("Room cleared
  in N moves (best M)"), which also counts toward the trial achievements.
- **Battle again** is a rematch in the same battle, against the form you caught. If the ball holds, you win the rematch
  ("You won the rematch! Zapdos returns to your team.") and the row counts your rematch wins. Running away or running out
  of balls just ends it.

Revisits are practice. They never claim an encounter, add or change a Dex entry, roll a Shiny, use or give a permit,
or touch an open encounter's trial checkpoint. Only trial records and rematch wins change. The rules are in
`src/games/revisits.ts` and are checked by `tests/revisits.test.js`. Rematch wins are included in backups beside the
trial records.

### Adventure games

Open **Play** for three new games and an **Adventure Map** that strings them together:

- **Route Guard** (lane defense): Shadow Pokemon walk down five lanes. Place up to six Pokemon from your Dex (or the six loaners): Grass types grow berries to tap and collect, Rock/Ground/Steel types block, and every other type attacks foes above it in its lane. Each lane's Snorlax wakes once to roll a breach away; a second breach in that lane ends the battle.
- **Trail Defense** (tower defense): place Pokemon beside a winding trail. Defeated foes pay berries. Every family starts at its first stage and can evolve mid-battle with berries, all the way to its final stage. Foes that reach the end cost lives (a boss costs three). Twenty levels in four stages (Viridian Meadows, Cerulean Coast, Ember Peaks, Shadow Summit) on maps that grow from 6 × 8 to 9 × 16 squares, with longer waves and tougher foes; each stage ends on a spiral with a Shadow Legendary boss (Celebi, Lugia, Moltres, Giratina). Levels earn up to three stars, one star opens the next level, and the start screen previews the map. Free play (twelve waves on a classic trail) is still there.
- **Safari Zone** (hunting): walk Emerald's Safari Zone with your buddy and catch what hides in the tall grass. See **Safari Zone** below.
- **Adventure Map**: nine stops from Route 1 to Victory Road, alternating the three games. Each stop gives up to three stars, and one star opens the next stop. The final stop ends with a Shadow Mewtwo.

Foes walk with two-step overworld animations: down the lanes in Route Guard, and facing whichever way the trail runs in Trail Defense. Your own Pokemon (Normal or Shiny) turn to face the foe they attack, step in place - faster when a foe is in range - and lunge toward it right after attacking; growers hop when they harvest, and idle Pokemon face you. Forms without walking art stay still, and reduced motion keeps everyone still. Trail Defense draws its habitat as textured ground with an edged dirt trail, direction chevrons, a cave where foes enter and a Poke Ball goal; tapping a placed Pokemon shows its attack range.

**Safari Zone.** Walk Emerald's Safari Zone as Brendan or May, in a Zepimon outfit (a purple-and-white cap and a black-and-white shirt), with your buddy one tile behind. You start outside the gate house, and the map has four areas, each with its own Pokemon: the **Sunny meadow** (Grass, Bug, Normal, Electric and Fairy), **Lakeside** (Water and Ice), the sandy **Rocky mountain** (Rock, Ground, Fighting, Steel, Fire and Dragon) and the darker **Night forest** (Ghost, Dark, Poison and Psychic). Adventure Map stops start in their own area.

- **Steps and balls.** A round has 400 steps and 12 Safari Balls. It ends when either runs out (*Ding-dong! Time's up!*), or when you walk back into the gate house door, which asks first. Bumping into a tree costs no step.
- **Finding Pokemon.** Each step in tall grass has a 1 in 10 chance of a wild Pokemon, with none for the 3 steps after one. Every 25 steps a nearby patch rustles, and stepping into it always finds one.
- **On the map.** Ledges are one-way: hop down, never climb back. Six item balls are worth 3 Safari Balls each, every round. Signs name each area and its types.
- **Catching.** An encounter opens on Emerald's battle background after a GBA flash. Throw when the shrinking ring is small. Bait makes a Pokemon less likely to run but harder to catch, and rocks do the opposite. Shinies are 1 in 100, and catching the same species in a row improves that to 1 in 77, 54, 31 and then 8.
- **Controls.** Walk with the on-screen **D-pad** (hold to keep walking), or switch to **Tap to walk** and tap a spot (a ✕ marks one you can't reach). Both choices, and your trainer, are remembered. On the web, the arrow keys and WASD walk too. Reduced motion stops the map from gliding and skips the flash.

The map is Emerald's own tiles (the General and Lilycove tilesets its Safari Zone uses) in our own layout. `python scripts/build-safari-map.py` (Pillow) reads `scripts/safari/layout.txt`, one character per tile, and `areas.txt`, one area letter per tile. It writes `assets/safari/`, `src/generated/safari-map.js` and `src/generated/safari-assets.js`, and stops before writing anything if the layout breaks a rule, such as a missing start or the wrong number of items. The tests also check that every grass patch and item can be reached and that no ledge cuts off the way back to the gate. See SPRITE-CREDITS.md.

**Move animations.** Every attack plays its move with the Gen III battle animation sprites (see SPRITE-CREDITS.md): Ember fireballs burst into flame, Water Gun splashes, Thunder Shock strikes from above and arcs to a second foe, Shadow Ball, Sludge, Ice Shard, Mach Punch, Pin Missile, Air Cutter, Swift, Fairy Wind and Dragon Breath fly at their target, Bite snaps shut on it, and Confusion, Magnitude, Rock Throw and Metal Claw send a wave out across their whole range. Each type has one move (tap a placed Pokemon to see it); a hatched Pokemon with egg-move coverage plays its egg move's type whenever that hits harder, and growers sparkle as they harvest. Hits follow the foe they land on, and reduced motion shows a still frame instead. `src/generated/move-sprites.js` and `assets/moves/` are built by `python scripts/build-move-sprites.py`.

Both defense games use type matchups (super-effective hits do double damage) and let a befriended Expedition Legendary strike every foe once per battle; its move lands on each of them.

**Egg moves.** Pokemon hatched from an egg on the watch are like bred Pokemon: they know their family's real egg moves from the Gen II–IV games (Gold/Silver/Crystal through HeartGold/SoulSilver), shared by the whole evolution chain. Team cards and the battle board (EGG) show the egg move used in battle, and the Dex record lists the family's egg moves.

- Attackers use the damaging egg move that improves the most type matchups over their own type (power breaks ties), and every hit uses whichever type is stronger. For example, Charmander's Crunch lets it hit Psychic and Ghost foes as Dark.
- With only same-type damaging egg moves, attacks deal 20% more damage; with only status egg moves (such as Chatot's Agility), the Pokemon has 30% more health.
- Grass growers harvest 10 extra berries in Route Guard (5 in Trail Defense), and Rock/Ground/Steel blockers in Route Guard get 30% more health.
- Families without egg moves (such as Magnemite), loaners and Safari catches get no perk.

`src/generated/egg-moves.js` is built by `node scripts/build-egg-moves.mjs`, which follows `pokemon_data/generate_pokemon_egg_moves.py`: it reads Pokemon #1–493 from PokéAPI, keeps moves learned by egg in the Gen II–IV version groups, adds each move's type and power, and merges moves per evolution chain (`hatdog-app/data/pokemon_species.csv`), so a family shares what its baby or first stage can inherit.

**Walking bonus.** Each km of completed adventures this Monday–Sunday adds 25 starting berries, 3 Safari Balls and 50 Safari Zone steps to every game, up to 3 km. It is only a bonus; every game is fully playable without walking.

**Safari catches in the Dex.** Gen 1–4 non-Legendary Pokemon caught in the Safari Zone join your Dex on this phone with a ◎ Safari mark and a **Safari** filter. They have no distance, steps or time, and they never count toward missions or badges. If the watch later hatches the same Normal/Shiny variant, the watch record replaces the Safari mark. Safari catches can be used as buddies, in Memory Match and in battle teams, even before any watch import.

#### Full screen and landscape (1.14.0)

The Safari Zone and the Legendary Trial (including Shrine Revisit practice rooms) have a **Full screen** button while you play. In full screen the map fills the screen, and the status bar and the tab bar or header are hidden. The HUD and status line sit in a small translucent strip at the top, and the D-pad floats over the map, faint until you press it (bottom-left in portrait, left-centre in landscape). The game's buttons (Pause, Restart room, Hint, Leave and so on) sit in the opposite corner. Its buttons are as big as ever; only their look is faded. With **Tap to walk** there is no D-pad: tap the map as usual.

- **Rotate** (top right) turns the game to landscape and back. The choice is remembered for next time. The rest of the app always stays portrait.
- **Exit full screen** (top right), Android's back button, leaving the screen or putting the app in the background all leave full screen, and so do the end of a Safari round, a trial reaching the chamber, and a Safari encounter in landscape (encounters only fit in portrait).
- In landscape the map uses about 9 tiles across the shorter side, so it doesn't zoom in too far. With reduced motion the D-pad changes instantly instead of fading.
- On the web the browser can't rotate, so there is no rotate button; full screen is a layout, and it uses the landscape layout whenever the window is wider than it is tall.

Turning the phone needs the native `expo-screen-orientation` module, so this release needs a new app build (an over-the-air update can't add it). The layout maths are in `src/games/immersive.ts`; `src/games/useImmersive.ts` applies and undoes the orientation lock, the hidden bars and the back button.

### Collection and games

- Gen 1–4 Pokémon and the extra Mega families, with bundled sprites and type-themed habitats.
- Separate Normal and Shiny Dex entries, saved run details, and a selectable buddy.
- The Dex sorts and filters like the egg picker: **Lowest No.**, **Highest No.**,
  **A–Z** or **Z–A** (Mega forms sit beside their species), generation with
  region names, type, and **Show** All, Normal, Shiny or Safari. Search takes a
  name, a type or a Dex number, and the count shows how many of your Pokemon
  match. Both screens share `src/pokedex.ts` and `src/PokedexFilters.tsx`.
- A Journal with personal bests and completed runs retained across imports.
- A Pocket Arcade with the Adventure Map, Route Guard, Trail Defense, Safari Zone, Memory Match, Who’s That Pokémon?, and Berry Catch. Everything works offline and saves best scores and stars on the phone.
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

Open **Settings**, sign in under **Account** using an email code, and create a one-time linking code under **Watch**. In the Zepp app, open Zepimon's settings → **Sync to Zepimon mobile**, paste the code and link your account. Sync from your connected watch, then return to the phone app and tap **Sync now**. The phone also checks for updates on opening and every minute while visible.

Both apps must have the same Supabase project configured and the database must be installed. See [cloud setup and linking instructions](../zepimon-sync/README.md). Native sign-in sessions are stored in SecureStore. Your normal/shiny Dex entries remain separate, and failed downloads keep your offline journal.

### Using Zepimon with another account

Anyone with their own Amazfit watch and Zepp app can use Zepimon with their own email. Each person signs in with their own email code and links their own watch through their own Zepp app. Their records stay separate from everyone else's, and nobody shares a Zepp password.

1. Install Zepimon on their phone, open **Settings** and sign in with an email code.
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
3. Copy the generated text. Save it as a `.json` file, or paste it into **Settings → Your data → Import a watch export** in this app.
4. Import again after future adventures to update your collection and missions.

Importing the same file again does not double-count runs or mission progress. The watch export contains the latest completed run per family and retained personal bests. Older runs already overwritten on the watch cannot be recovered; regular imports let the phone keep runs it has seen. The Journal shows the latest 20 retained runs. Active adventures do not count toward completed-run missions.

Cloud sync uses Zepp as the watch connection. Manual imports also remain available. The app does not connect directly to the watch over Bluetooth. Adventures recorded in the phone's **Adventure** tab stay on the phone and are not sent to the watch.

## Back up your data

Open **Settings** and scroll to **Your data**. **Save a backup file** creates `zepimon-backup-YYYY-MM-DD-HHmm.json` and opens the share sheet so you can keep it in Files, Drive, email or another app (on the web it downloads). **Show backup as text** shows the same JSON to copy by hand.

The backup is an ordinary Zepimon export (your watch journal exactly as synced) plus a `phoneBackup` section with everything stored only on this phone: missions and saved runs, phone adventures with their routes, best scores, Adventure Map stars, Expedition friends, Safari catches and your buddy. Account links and sign-in details are never included. **Choose JSON file** accepts a backup to bring the watch journal back; restoring the `phoneBackup` section is not built yet.

## Mini-games

Open **Play**, then choose a game:

- **Memory Match:** match up to six pairs from your acquired Normal/Shiny variants. Requires at least two variants in your Dex (imported or caught in the Safari Zone); fewer moves is better.
- **Who’s That Pokémon?:** identify ten Gen 1–4 silhouettes, with four choices for each. Answers reveal the Pokemon; there is no timer. Best score is out of ten.
- **Berry Catch:** tap a berry in the nine garden plots before it moves. Twenty berries appear over 30 seconds, with at most one catch per appearance. The game pauses when you switch tabs, leave the app, or press Pause; tap Resume to continue. Best score is out of twenty.

- **Route Guard / Trail Defense / Safari Zone:** see [Adventure games](#adventure-games). Free play saves the most waves cleared (out of 10 and 12) and the most Pokemon caught in one Safari Zone round.

Every game except Memory Match works without an import. Only completed games save scores; returning to the arcade discards an unfinished round, and switching tabs or leaving the app pauses it. Scores and stars survive app restarts and journal imports. No game changes watch distance, evolution or Shiny odds; the Safari Zone is the only one that adds Dex entries, marked ◎ Safari and kept out of missions.

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

- the watch icon in every `hatdog-app/assets/<target>/icon.png`: 248 x 248, a round deep-navy badge with a sky-blue rim and a 4px transparent margin, per Zepp's app icon spec;
- `assets/icon.png`: 1024 x 1024 on a solid deep-navy background (`#0B1F3A`), since iOS does not allow transparent icons;
- the Android adaptive icon (`android-icon-foreground.png` inside the launcher safe zone, background `#0B1F3A`) and its Android 13 themed `android-icon-monochrome.png`;
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

Dex cards and Pokemon records have pixel-style landscapes
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
