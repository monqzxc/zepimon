# Gym Training and Buddy Friendship: design

Date: 2026-11-17, revised 2026-11-18 · App: `zepimon-mobile` (phone first, watch later) · Status: review answers
folded in (names, friendship, permits, voice cues, Speed Gym badge); Marathon and Ultramarathon Gyms added

## Intent

Zepimon's core rule is **5 km in one adventure** hatches an egg. That is easy for runners and a wall for beginners, who
often walk 2–3 km at a time and can go weeks without a hatch. This spec adds two features that keep the rule intact
and give every kind of player a goal they can reach and one that stretches them:

1. **Gym Training:** guided training plans, from a first 5 km all the way to a **marathon**, the summit of the ladder,
   with an optional **50 km ultramarathon** beyond it. Each ends in a graduation adventure that hatches, evolves,
   Mega Evolves, Dynamaxes or Gigantamaxes a Pokémon you picked when you started.
2. **Buddy Friendship:** your buddy's friendship grows with every kilometre you walk or run together, at any length,
   on the watch or the phone, and unlocks cosmetic perks.

**Success means:**
- A new player who has never run 5 km can follow a plan and hatch their first egg in about 6–8 weeks.
- An experienced runner who already runs 5 km a day still finds a plan that's hard: a faster 5 km, a half marathon
  that ends in a Mega Evolution, or a **marathon that ends in a Dynamax**, the goal the ladder builds toward.
- Runners who finish a marathon have one more, optional step: a 50 km ultra that ends in a Gigantamax.
- The game rules don't change. Eggs still need 5 km in one adventure, Mega still needs 21 km, Dynamax 42 km,
  Gigantamax 50 km, and Shiny odds stay at 1 in 50.
- Every number on screen is real or labelled as an estimate (product principle 1).

## Decisions

| # | Decision |
|---|---|
| 1 | Plans are called **Gyms**, and finishing one earns a **Gym Badge**. The badge names and art are our own, not names from the games. |
| 2 | There are **seven Gyms** in five levels: Beginner (Steady Steps, First Hatch), Intermediate (Evolution Road), Advanced (Speed Gym, Mega Trial), **Elite (Dynamax Marathon, the summit)** and **Beyond (Gigantamax Ultra, optional)**. |
| 3 | One plan is active at a time. You can pause it for up to 28 days, or quit it. Quitting keeps earned badges but drops the plan's progress. |
| 4 | Each plan has a **plan egg**, chosen when it starts. The egg only hatches on the **graduation adventure**, under the normal rules, so no distance is added up across adventures. Shiny is rolled when that adventure starts, on whichever device records it. |
| 5 | Plan sessions are **ordinary adventures**. You still carry an egg, and anything that reaches 5 km hatches as usual. A session also counts toward missions, the Expedition trail and buddy friendship. Nothing is counted twice. |
| 6 | The schedule is **flexible, not tied to dates**. A plan week ends when its sessions are done. Rest rules stop you from doing hard sessions on back-to-back days. |
| 7 | Advanced plans set **pace zones** from your own recent 5 km best effort (`src/running.ts`). They are labelled as estimates. |
| 8 | Sessions earn **1–3 stars** for sticking to the plan's paces, and that includes running easy days slowly enough. Stars are only about pride. They never block progress. |
| 9 | Phone sessions get **live cues**: an on-screen banner, vibration (React Native's built-in `Vibration`, no new dependency), on Android text in the live notification, and **voice cues** (`expo-speech`, one new dependency, phase 4). Watch cues come later. |
| 10 | Watch adventures count toward a plan through a **one-tap match**. Without a pace log they count by distance and time only and earn no pace stars. |
| 11 | Friendship is **worked out from saved adventures and a log of buddy changes**. There is no separate counter, so syncing, re-imports and removed duplicates can't make it go wrong. |
| 12 | Friendship perks are **cosmetic only**. They give no extra Safari Balls, no better Shiny odds and no permits. |
| 13 | Everything is stored on the phone, included in the backup file, and never synced to the cloud (the same as missions). |
| 14 | **Every Gym Badge earns one Expedition Permit**, once per Gym, so at most 7 in total. It's claimed from the badge case, the same way running tickets and arcade points are. |
| 15 | **The marathon is the summit.** The picker and the suggestions build toward Dynamax Marathon. Gigantamax Ultra is shown as an optional "Beyond the marathon" card, is never suggested, and only opens for runners who have run a marathon. |
| 16 | **Normal and Shiny buddies are separate friends** (confirmed in review). |

---

## Part 1: Gym Training

### The seven Gyms

| Gym | Level | Who it's for | Length | Sessions per week | Graduation | Badge |
|---|---|---|---|---|---|---|
| **Steady Steps** | Beginner | Walkers, people who can't or don't want to run | 6 weeks | 3 | Walk 5 km in one adventure, which hatches the plan egg | Sprout Badge |
| **First Hatch** | Beginner | New runners | 8 weeks | 3 | Run/walk 5 km in one adventure, which hatches the plan egg | Hatch Badge |
| **Evolution Road** | Intermediate | Can cover 5 km and wants 10 km | 8 weeks | 4 | Run 10 km in one adventure, which evolves the plan egg | Stride Badge |
| **Speed Gym** | Advanced | Runs 5 km often and wants it faster | 6 weeks | 4 | A 5 km time trial that **beats your baseline**, which hatches the plan egg | Spark Badge |
| **Mega Trial** | Advanced | Has 10 km fitness and wants a half marathon | 12 weeks | 4 | Run 21.1 km in one adventure, which Mega Evolves the plan egg | Summit Badge |
| **Dynamax Marathon** | Elite, **the summit** | Has half marathon fitness and wants a marathon | 16 weeks | 4, then 5 from week 5 | Run 42.2 km in one adventure, which Dynamaxes the plan egg | Titan Badge |
| **Gigantamax Ultra** | Beyond, **optional** | Has run a marathon and wants to go further | 12 weeks | 5 | Run 50 km in one adventure, which Gigantamaxes the plan egg | Colossus Badge |

**The ladder.** The picker shows the Gyms as a climb, from Sprout up to **Titan**, with the marathon at the top as the
headline goal (*"The summit: your first marathon"*). Gigantamax Ultra sits apart below the ladder, as a locked
card reading *"Beyond the marathon"* until you have run one. It is never suggested.

**Which egg each plan allows:**
- Steady Steps, First Hatch and Speed Gym: any egg you could pick in the Adventure tab.
- Evolution Road: only families whose next form comes at 10 km, so the graduation shows an evolution.
- Mega Trial: only families with a Mega form (`megaChoices(family).length > 0`). You choose the Mega when the plan starts.
- Dynamax Marathon: any egg, because every family Dynamaxes at 42 km. A family with a Mega may pick one, and it
  Mega Evolves at 21 km on the way.
- Gigantamax Ultra: only the 32 families with a Gigantamax form (`gigantamaxChoices(family).length > 0`). Urshifu and
  Toxtricity choose theirs when the plan starts, the same way they do in the Adventure tab.

**Entry checks.** These are soft gates: the app shows the reason and lets you start anyway after a confirm, because
people often have fitness the app hasn't seen.

| Gym | Recommended when |
|---|---|
| Steady Steps, First Hatch | Always open. |
| Evolution Road | A saved adventure of ≥ 5 km in the last 8 weeks, or the Hatch Badge. |
| Speed Gym | A 5 km best effort in the last 12 weeks (this becomes the baseline). Otherwise week 0 adds a **Gym Entry Trial**: run 5 km as hard as you can comfortably sustain. |
| Mega Trial | A saved adventure of ≥ 10 km in the last 6 weeks **and** ≥ 15 km a week on average over the last 4 weeks, or the Stride Badge. |
| Dynamax Marathon | A saved adventure of ≥ 16 km in the last 8 weeks **and** ≥ 30 km a week on average over the last 4 weeks, or the Summit Badge. |
| Gigantamax Ultra | **Locked** until you have the Titan Badge or a saved adventure of ≥ 42 km. With neither, you can open it only by confirming *"I've run a marathon in the last 12 months"* **and** having ≥ 50 km a week on average over the last 4 weeks. This is the one stricter gate, because a 50 km plan built on too little base is how people get hurt. |

**Suggested Gym.** The plan picker highlights one Gym based on your saved adventures:
- No run of ≥ 3 km: First Hatch, with Steady Steps offered next to it.
- Your longest in 8 weeks is ≥ 5 km: Evolution Road.
- You have a 5 km best effort and ≥ 15 km a week: Speed Gym.
- Your longest is ≥ 10 km: Mega Trial.
- Your longest is ≥ 16 km and you average ≥ 30 km a week, or you have the Summit Badge: Dynamax Marathon.
- Gigantamax Ultra is never suggested. After the Titan Badge, the marathon card says *"Run it again"* and the Ultra
  card unlocks quietly beside it.

### Session building blocks

A session is a list of **steps**:

```ts
type StepKind = 'warmup' | 'walk' | 'brisk' | 'jog' | 'run' | 'tempo' | 'interval' | 'recover' | 'stride' | 'hill' | 'race' | 'cooldown'
type PaceZone = 'easy' | 'tempo' | 'interval' | 'half' | 'marathon' | 'race' | 'any'
type Step = { kind: StepKind, seconds?: number, meters?: number, zone: PaceZone }   // exactly one of seconds or meters
type SessionKind = 'walk' | 'runwalk' | 'easy' | 'long' | 'backtoback' | 'tempo' | 'intervals' | 'hills' | 'strides' | 'trial' | 'graduation'
type Session = { id: string, kind: SessionKind, title: string, hard: boolean, steps: Step[],
  capSeconds?: number,      // long runs: the session also counts once this much time has passed (see "Time caps")
  pairedWith?: string }     // back-to-back: the long run this session must follow the next day
```

- **Beginner** sessions are timed and start with a 5 minute brisk walk warm-up and end with a 5 minute walk cool-down.
- **Intermediate and advanced** quality sessions start with a 1.5–2 km easy warm-up and end with a 1–1.5 km
  cool-down. Easy and long runs are a single step measured by distance.
- Recovery steps are **walking or jogging, never standing still**. GPS updates come every 3 m of movement
  (`distanceInterval: 3`), so a standing recovery would freeze distance-based steps.
- `hard: true` is set for intervals, tempo, long runs, trials and graduations, and for every First Hatch run/walk session.

### Pace zones (Speed Gym, Mega Trial, Dynamax Marathon, Evolution Road's quality days)

Every zone comes from your baseline 5 km pace **P** (seconds per km), worked out with standard running rules of
thumb. Half and marathon pace use Riegel's formula (T₂ = T₁ × (D₂/D₁)^1.06), which comes out at about 1.09 × P for
the half and 1.14 × P for the marathon.

| Zone | Band | Feel |
|---|---|---|
| Easy | P × 1.20 – P × 1.40 | You could chat the whole way |
| Tempo | P × 1.05 – P × 1.09 | Comfortably hard; a few words at a time |
| Interval | P × 0.97 – P × 1.00 | Hard; about your 5 km race pace or a touch faster |
| Half | P × 1.07 – P × 1.11 | Your goal half marathon pace |
| Marathon | P × 1.12 – P × 1.16 | Your goal marathon pace; steady, sustainable for hours |
| Race | Faster than baseline | Time trials |

**Worked example:** with a baseline 5 km in 25:00 (P = 5:00/km), easy is 6:00–7:00/km, tempo 5:15–5:27,
interval 4:51–5:00, half pace 5:21–5:33 and marathon pace 5:36–5:48. That predicts a half marathon of about
1:55 (**"Estimated 1:55 · from your 5 km best"**) and a marathon of about 4:00.

**Marathon estimates are often too fast.** Riegel's formula assumes the endurance of someone trained for the
distance, which few people have from a 5 km time. The marathon estimate is therefore labelled
*"Estimate · often optimistic until your long runs reach 30 km"*. Dynamax Marathon offers to refresh the marathon
zone from your **half marathon** best effort (`raceRecords()`), a much better predictor, at the start of week 9.

Gigantamax Ultra uses **no pace targets** except easy. Ultra running is about effort, walking breaks and time on
your feet, so its stars only reward keeping long runs easy (see Stars).

The baseline is fixed when the plan starts, so the zones don't move under you. Speed Gym offers to **refresh zones**
at the start of week 4 if a faster 5 km effort was recorded since.

### Plans in detail

Every table lists the sessions **in order**. Easy and long runs are distances. "W/C" means warm-up and cool-down are included.

#### Steady Steps (Beginner walk, 6 weeks, 3 per week)

Brisk segments are 3 minutes at a pace where talking takes effort, followed by 2 minutes at an easy pace.

| Week | Session 1 | Session 2 | Session 3 |
|---|---|---|---|
| 1 | Walk 20 min | Walk 20 min | Walk 25 min |
| 2 | Walk 25 min | Walk 25 min | Walk 30 min |
| 3 | Walk 30 min | Walk 30 min with 3 × 3 min brisk | Walk 35 min |
| 4 | Walk 30 min | Walk 35 min with 4 × 3 min brisk | Walk 40 min |
| 5 | Walk 35 min | Walk 40 min with 5 × 3 min brisk | Walk 50 min |
| 6 | Walk 30 min | Walk 40 min with 4 × 3 min brisk | **Hatch Day: walk 5 km** (about 55–70 min) |

Walks are not `hard`, so you can do them on back-to-back days.

#### First Hatch (Beginner run/walk, 8 weeks, 3 per week)

Each session is a 5 min walk, then the main set below, then a 5 min walk.

| Week | Session 1 | Session 2 | Session 3 | Longest jog |
|---|---|---|---|---|
| 1 | 8 × (1 min jog, 2 min walk) | same | same | 1 min |
| 2 | 6 × (90 s jog, 2 min walk) | same | same | 90 s |
| 3 | 5 × (2 min jog, 90 s walk) | same | same | 2 min |
| 4 | 4 × (3 min jog, 90 s walk) | same | same | 3 min |
| 5 | 3 × (5 min jog, 2 min walk) | 2 × (8 min jog, 3 min walk) | 2 × (10 min jog, 2 min walk) | 10 min |
| 6 | 2 × (10 min jog, 2 min walk) | 15 min jog, 2 min walk, 8 min jog | 22 min jog | 22 min |
| 7 | 25 min jog | 25 min jog | 25 min jog | 25 min |
| 8 | 28 min jog | 30 min jog | **Hatch Day: 5 km**, walking breaks allowed | 30 min |

The jump in week 5 is the hardest part, so the plan screen shows *"Week 5 is a step up. Repeating week 4 is
completely fine."* together with a **Repeat week** button.

#### Evolution Road (Intermediate, 8 weeks, 4 per week)

Strides are 20 s relaxed-fast with a full walk back. Fartlek is brisk efforts at tempo feel with easy running between.

| Week | Easy | Easy | Quality | Long | Total |
|---|---|---|---|---|---|
| 1 | 4 km | 4 km | 4 km + 6 strides | 6 km | 18 km |
| 2 | 4 km | 4 km | 5 km fartlek: 6 × (1 min brisk, 2 min easy) | 7 km | 20 km |
| 3 | 5 km | 5 km | 5 km fartlek: 8 × (1 min brisk, 1 min easy) | 7.5 km | 22.5 km |
| 4 (cutback) | 4 km | 4 km | 4 km + 6 strides | 6 km | 18 km |
| 5 | 5 km | 5 km | 6 km: 5 × (2 min tempo, 2 min easy) | 8 km | 24 km |
| 6 | 5 km | 6 km | 6 km: 4 × (3 min tempo, 2 min easy) | 8.5 km | 25.5 km |
| 7 | 5 km | 6 km | 6 km: 3 × (4 min tempo, 2 min easy) | 9 km | 26 km |
| 8 | 4 km | 4 km + 4 strides | (rest) | **Graduation: 10 km** | 18 km |

#### Speed Gym (Advanced, 6 weeks, 4 per week)

Quality sessions include a 2 km warm-up and a 1.5 km cool-down. "Jog" recoveries are at easy pace.

| Week | Intervals | Easy | Tempo | Long (easy) |
|---|---|---|---|---|
| 1 | 6 × 400 m @ interval, 90 s jog | 6 km | 20 min @ tempo | 8 km |
| 2 | 5 × 800 m @ interval, 2 min jog | 6 km | 2 × 10 min @ tempo, 2 min jog | 9 km |
| 3 | 10 × 400 m @ interval, 75 s jog | 7 km | 25 min @ tempo | 10 km |
| 4 (cutback) | 4 × 1 km @ interval, 2:30 jog | 5 km | 6 km easy + 6 strides | 8 km |
| 5 | 6 × 800 m @ interval, 90 s jog | 7 km | 3 × 10 min @ tempo, 2 min jog | 11 km |
| 6 (taper) | 4 × 400 m @ interval, 2 min jog | 5 km + 4 strides | (rest) | **Gym Trial: 5 km** |

- **Graduation:** the trial's 5 km time is your fastest 5 km stretch in that adventure (`bestEffort(adventure, 5000)`
  on the phone, `hatchSeconds` on the watch). The **Spark Badge needs a time faster than your baseline**. The
  screen also shows a stretch target 3% faster (for example 24:15 from 25:00).
- If you don't beat your baseline, the plan is still marked complete and the plan egg hatches as usual, but there's
  no badge. You get **one retry within 14 days**, after a minimum of 2 rest days. Coming up short in a time trial is
  normal, and the copy says so.
- If you already run 5 km a day: the 4 sessions replace 4 of those runs. Other runs still count toward everything
  else (missions, friendship). The screen suggests keeping them easy.

#### Mega Trial (Advanced half marathon, 12 weeks, 4 per week)

| Week | Easy | Quality | Easy | Long | Total |
|---|---|---|---|---|---|
| 1 | 6 km | Tempo: 5 km with 3 km @ tempo | 6 km | 10 km | 27 km |
| 2 | 6 km | Intervals: 8 km with 5 × 1 km @ interval, 2 min jog | 6 km | 11 km | 31 km |
| 3 | 7 km | Tempo: 7 km with 5 km @ tempo | 7 km | 13 km | 34 km |
| 4 (cutback) | 6 km | 6 km + 6 strides | 5 km | 11 km | 28 km |
| 5 | 7 km | Intervals: 9 km with 6 × 1 km @ interval, 2 min jog | 7 km | 14 km | 37 km |
| 6 | 8 km | Tempo: 9 km with 6 km @ tempo | 7 km | 15 km | 39 km |
| 7 | 8 km | Cruise: 9 km with 3 × 2 km @ tempo, 3 min jog | 8 km | 16 km | 41 km |
| 8 (cutback) | 6 km | 8 km with 4 km @ half | 6 km | 13 km | 33 km |
| 9 | 8 km | Cruise: 11 km with 5 × 1.6 km @ tempo, 2 min jog | 8 km | 17 km | 44 km |
| 10 | 8 km | 10 km with 8 km @ half | 8 km | 18 km | 44 km |
| 11 (taper) | 6 km | 8 km with 3 × 1.6 km @ half | 6 km | 14 km | 34 km |
| 12 | 5 km | 5 km with 4 × 1 min @ half | (rest) | **Graduation: 21.1 km** | 31 km |

- Weekly distance goes up by about 15% at most, with a cutback week every fourth week and a taper before graduation.
- **Graduation:** one adventure of at least 21,098 m, carrying the plan egg and its chosen Mega. It hatches at 5 km,
  evolves at 10 and 15, and Mega Evolves at 21 km, all under the normal rules.
- **Extra challenge (hidden badge "Mega Pacer"):** graduate with a negative split (`negativeSplit()` in `src/running.ts`).

#### Dynamax Marathon (Elite, the summit, 16 weeks, 4 then 5 per week)

This is the goal the whole ladder builds toward. Weeks 1–4 have four sessions. From week 5 a short **recovery run**
is added, because marathon long runs need more weekly distance around them than four runs can safely hold.
"@ M" means marathon pace. Quality sessions include their warm-up and cool-down in the distance shown.

| Week | Easy | Quality | Easy | Recovery | Long | Total |
|---|---|---|---|---|---|---|
| 1 | 6 km | Tempo: 8 km with 5 km @ tempo | 6 km | | 14 km | 34 km |
| 2 | 6 km | Intervals: 9 km with 5 × 1 km @ interval, 2 min jog | 6 km | | 16 km | 37 km |
| 3 | 7 km | Tempo: 10 km with 6 km @ tempo | 7 km | | 18 km | 42 km |
| 4 (cutback) | 6 km | 8 km + 6 strides | 6 km | | 14 km | 34 km |
| 5 | 8 km | Intervals: 10 km with 6 × 1 km @ interval, 2 min jog | 7 km | 4 km | 19 km | 48 km |
| 6 | 8 km | 12 km with 8 km @ M | 8 km | 6 km | 21 km | 55 km |
| 7 | 8 km | Cruise: 12 km with 2 × 4 km @ tempo, 3 min jog | 8 km | 8 km | 23 km | 59 km |
| 8 (cutback) | 7 km | 10 km with 6 km @ M | 6 km | 5 km | 18 km | 46 km |
| 9 | 9 km | Intervals: 12 km with 6 × 1 km @ interval, 2 min jog | 8 km | 8 km | 24 km | 61 km |
| 10 | 9 km | 16 km with 12 km @ M | 8 km | 8 km | 26 km | 67 km |
| 11 | 10 km | Cruise: 13 km with 3 × 3 km @ tempo, 3 min jog | 9 km | 8 km | 28 km | 68 km |
| 12 (cutback) | 8 km | 12 km with 8 km @ M | 7 km | 6 km | 21 km | 54 km |
| 13 (peak) | 10 km | Tempo: 12 km with 7 km @ tempo | 9 km | 8 km | **32 km** | 71 km |
| 14 (taper) | 9 km | 16 km with 12 km @ M | 8 km | 6 km | 26 km | 65 km |
| 15 (taper) | 7 km | 10 km with 6 km @ M | 6 km | 5 km | 19 km | 47 km |
| 16 | 6 km | 8 km with 3 × 1.6 km @ M | 5 km | (rest) | **Graduation: 42.2 km** | 61 km |

- Weekly distance rises by at most 15%, with a cutback every fourth week, a peak of 71 km in week 13, and a
  three-week taper (peak long run, then 26 km, then 19 km).
- **Long runs stop at 32 km.** Going further in training adds injury risk for little gain, and race-day adrenaline,
  taper and fuel cover the last 10 km. The plan screen explains this so the jump from 32 to 42.2 km doesn't feel like
  a mistake.
- **Fuel and water:** long runs over 90 minutes show *"Bring water and something to eat. Practise your race-day fuel
  on these runs."* This is guidance only. The app tracks no food or drink.
- **Graduation:** one adventure of at least 42,195 m carrying the plan egg. It hatches at 5 km, evolves at 10 and
  15, Mega Evolves at 21 km if a Mega was chosen, and **Dynamaxes at 42 km** in its red glow, under the normal rules.
- **Hidden badge "Wall Breaker":** graduate with the second half no more than 5% slower than the first (from `splits()`).
- **Battery:** a phone recording GPS for 4–5 hours can run flat. Before graduation the screen suggests a full charge,
  or recording on the watch and counting it with a one-tap match.

#### Gigantamax Ultra (Beyond, optional, 12 weeks, 5 per week)

For runners who have already run a marathon. It builds the classic ultra way: **back-to-back long runs** on two days
in a row (the long run, then a medium-long run the next day on tired legs), hills for strength, and planned walking
breaks. Pace matters little; time on your feet matters a lot.

| Week | Easy | Quality | Easy | Long | Back-to-back (next day) | Total |
|---|---|---|---|---|---|---|
| 1 | 8 km | Tempo: 12 km with 6 km @ tempo | 8 km | 24 km | 10 km | 62 km |
| 2 | 8 km | Hills: 12 km with 8 × 90 s uphill, jog down | 8 km | 26 km | 12 km | 66 km |
| 3 | 9 km | Tempo: 13 km with 7 km @ tempo | 9 km | 28 km | 14 km | 73 km |
| 4 (cutback) | 8 km | 10 km easy + 6 strides | 7 km | 21 km | 8 km | 54 km |
| 5 | 9 km | Hills: 13 km with 10 × 90 s uphill, jog down | 9 km | 30 km | 15 km | 76 km |
| 6 | 10 km | 14 km with 10 km @ M | 9 km | 32 km | 16 km | 81 km |
| 7 | 10 km | Tempo: 14 km with 8 km @ tempo | 10 km | 35 km | 16 km | 85 km |
| 8 (cutback) | 8 km | 10 km easy + 6 strides | 8 km | 24 km | 10 km | 60 km |
| 9 (peak) | 10 km | Hills: 14 km with 12 × 90 s uphill, jog down | 10 km | **38 km** | 18 km | 90 km |
| 10 | 10 km | 14 km with 10 km @ M | 10 km | 32 km | 20 km | 86 km |
| 11 (taper) | 8 km | 12 km with 6 km @ tempo | 8 km | 24 km | 10 km | 62 km |
| 12 | 6 km | 8 km easy + 4 strides | 5 km | **Graduation: 50 km** | (rest) | 69 km |

- **Back-to-back sessions** are the one exception to the rest rule: the back-to-back run must be done **the day
  after** its long run (`pairedWith`). Done any later, it still counts, but the screen notes that the point is running
  on tired legs.
- **Long runs stop at 38 km or 4 h 30 min**, whichever comes first.
- **Walking breaks:** long runs, back-to-backs and the graduation have an optional **Run/walk** switch (walk 1 min
  every 10 min by default, adjustable from 5 to 25 min). Walking hills is encouraged in the copy. Walking breaks never
  cost stars.
- **Graduation:** one adventure of at least 50,000 m carrying the plan egg, which **Gigantamaxes at 50 km**.
  Expect 5–7 hours. The battery note from the marathon applies with more force: the screen strongly suggests the watch
  or a power bank.
- **Hidden badge "Ultra Steady":** every long run and back-to-back in the plan at its full stars (kept easy).
- The extra safety note for this Gym is in Safety and copy.

### How sessions are counted

**Order and rest rules**
- Sessions are done in order. Only the **next** session can be counted.
- At most **one plan session per calendar day** (local time, `dayKey`).
- After a `hard` session, the next `hard` session unlocks the **next day but one**. Non-hard sessions (walks, easy
  runs, recovery runs) can be the next day. Rest days show as *"Rest day: your egg is resting too"*.
- Exception: an Ultra back-to-back (`pairedWith`) unlocks **the day after** its long run, on purpose.
- You can **skip** one session per week. It counts as done, but gives no warmth and no stars. You can't skip a graduation.

**Two ways a session counts**
1. **Started from the plan** (phone): **Start today's session** opens the Adventure tab with the session attached.
   You still choose the egg you carry, and the default is your current next egg. On **Finish & save**, the session is
   checked against its target and counted automatically.
2. **Matched afterwards** (watch, or a phone adventure not started from the plan): the plan screen lists saved
   adventures since the last counted session that meet the next session's target, and offers
   *"Your watch run on Tue, 6.2 km, fits today's Easy run. Count it?"* with **Count it** and **Not this one**.
   It never counts anything on its own.

**Targets**

| Session kind | Counts when |
|---|---|
| Timed (walk, run/walk) | Elapsed time ≥ 90% of the plan's total time |
| Distance (easy, long, quality) | Distance ≥ 95% of the plan's distance (allows for GPS shortfall) |
| Long run with a time cap (marathon and ultra) | Distance ≥ 95% **or** elapsed time ≥ `capSeconds`. Slower runners stop at the cap rather than running for longer than is useful. Caps: 3 h 15 min for marathon long runs, 4 h 30 min for ultra long runs, 2 h 30 min for back-to-backs |
| Graduation (hatch, 10 km, half, marathon, ultra) | Distance ≥ the form's distance, **exactly** as the game rules need (5,000 / 10,000 / 21,098 / 42,195 / 50,000 m), with the plan egg's family. No time cap |
| Speed Gym trial | 5 km best effort found; badge if faster than baseline |

**Stars** (phone adventures started from the plan, which have a pace log and step boundaries):

| Stars | Quality sessions | Easy / long runs | Beginner sessions |
|---|---|---|---|
| ★ | Completed | Completed | Completed |
| ★★ | At least 2 of every 3 reps (or tempo km) in their zone | Average moving pace no faster than the easy band | Completed with every step done |
| ★★★ | Every rep in its zone, last rep no slower than 3% behind the first | Every split in the easy band | Same as ★★ (beginners top out at 2 stars on purpose; finishing is the win) |

Easy-run stars reward running slowly enough, which is the most common mistake experienced runners make.
In Gigantamax Ultra, long runs and back-to-backs score as easy runs, and moving time during planned walking breaks
is left out of the pace check.
**Perfect Gym** (hidden badge): every non-skipped session in a plan at the most stars it can earn.

### Egg warmth

- The plan egg sits in an **incubator** on the plan screen. Warmth = counted sessions ÷ all sessions before
  graduation. The egg sprite shows cracks at 25%, 50% and 75%, and wobbles at 100%. With reduced motion, the wobble
  is replaced by a still glow.
- Warmth **doesn't** change hatching. The egg still needs the graduation distance. At 100% (no skips) graduation also
  earns the hidden badge **"Warm Welcome"**.
- If a graduation adventure comes up short (for example, stopping at 4.2 km), it's saved as a normal adventure, the
  plan stays on graduation with the same egg, and you can try again whenever you like.

### Missed time

| Time since the last counted session | What happens |
|---|---|
| ≤ 9 days | Nothing. Carry on. |
| 10–20 days | *"Welcome back. Repeat last week to ease in?"* with **Repeat week** (recommended) and **Carry on**. |
| 21+ days | Suggests going back 2 weeks, or to week 1 if the plan is ≤ 2 weeks in. |
| Paused | The clock stops for up to 28 days. After that the plan is still there, and the rule above applies from the pause date. |

### Live cues (phone)

A pure function works out where you are in the session. It runs on every GPS fix (about every 2 s or 3 m) and on a 1 s
timer while the screen is on:

```ts
type CueState = { index: number, stepStartedAt: number, stepStartMeters: number, reps: [number, number][] }
function advance(session: Session, cue: CueState, now: number, meters: number): { cue: CueState, changed: Step | null, remaining: string }
```

- **Screen on:** a large banner above the map: the step (**JOG**, **WALK**, **TEMPO 5:15–5:27**), a countdown in time
  or metres, the next step, and the current pace coloured against the zone. The colour always comes with a word
  (*on pace*, *ease off*, *pick it up*), never colour alone. Your buddy shows next to the banner as the "coach".
- **Vibration** on every step change: run-type steps get two long pulses, recover/walk steps one long pulse, and there's
  a short pulse 10 s (or 50 m) before a change. This uses `Vibration` from `react-native`, with no new dependency.
- **Android live notification:** add `cue?: string` to `LiveOptions` in `modules/zepimon-live` and show it as the
  notification's text (*"Jog · 0:45 left"*). This needs a small change in `LiveNotification.kt`.
- **Screen readers:** `AccessibilityInfo.announceForAccessibility` announces each step change.
- **Voice cues (phase 4):** `expo-speech` speaks each step change (*"Jog for 90 seconds"*, *"Tempo, 3 kilometres,
  5:15 to 5:27"*), plus optional kilometre splits on long runs (*"Kilometre 12, 6:05"*). They're on by default for
  plan sessions, with a switch in Settings, and they duck rather than stop the user's music. Install the version that
  matches the project's Expo SDK (`npx expo install expo-speech`).
- **Screen off:** vibration from the location task on Android (foreground service) and iOS (background location) needs
  testing on a real device first; see Risks. If it isn't reliable, v1 says *"Keep the screen on for cues"* before the start.
- `reps` saves the start and end distance of each `interval` and `tempo` step on the saved adventure, so stars can be
  scored from the pace log's 100 m marks.

### Data model

```ts
// src/training-plans.ts: static plan definitions (no state)
type GymId = 'steady-steps' | 'first-hatch' | 'evolution-road' | 'speed-gym' | 'mega-trial' | 'dynamax-marathon' | 'gigantamax-ultra'
type Gym = { id: GymId, name: string, badge: string, level: 'beginner' | 'intermediate' | 'advanced' | 'elite' | 'beyond',
  activity: Activity, weeks: Session[][], eggRule: 'any' | 'evolves-at-10' | 'has-mega' | 'has-gigantamax',
  graduationMeters: number }   // 5000, 10000, 21098, 42195 or 50000

// src/training.ts: state, kept in the store next to progress
type SessionResult = { adventureId: string, at: number, stars: 0 | 1 | 2 | 3, device: 'phone' | 'watch' } | { skipped: true, at: number }
type ActivePlan = {
  gym: GymId, startedAt: number, egg: { family: string[], mega: string | null },   // mega also holds a chosen Gigantamax form
  baseline5k: number | null,            // seconds; Speed Gym, Mega Trial and Dynamax Marathon
  baselineHalf: number | null,          // seconds; Dynamax Marathon after the week 9 refresh
  runWalk: number | null,               // Gigantamax Ultra: minutes between 1 min walking breaks, null when off
  week: number, done: Record<string, SessionResult>,   // keyed by session id
  pausedAt: number | null, retryUntil: number | null    // Speed Gym trial retry window
}
type Training = {
  active: ActivePlan | null,
  badges: Partial<Record<GymId, { at: number, adventureId: string, perfect: boolean, warm: boolean, time?: number }>>,
  declined: string[]                    // adventure ids answered "Not this one"
}

// Added to PhoneRun (src/phone-adventure.ts) and ActiveAdventure, both optional so older saves stay valid:
training?: { gym: GymId, session: string, reps: [number, number][] }
```

**Expedition Permits.** `Quest` (`src/expedition-quest.ts`) gets a `gyms: number` field, the permits already
claimed from badges, next to `arcade` and `running`. Claimable permits = number of badges − `quest.gyms`.
**Claim permit** on the badge case adds one to both `gyms` and `permits`. Because the count comes from the badges,
claiming twice or restoring a backup can't create extra permits. `restoreQuest` reads a missing `gyms` as 0.

All counting logic is pure functions in `src/training.ts`: `startPlan`, `nextSession`, `unlockAt`, `matchCandidates`,
`countSession`, `skipSession`, `repeatWeek`, `scoreStars`, `graduate`, `restoreTraining`. Each takes the state and
the saved adventures (`allAdventures()`) and returns new state, following the same pattern as `src/progress.ts`.

---

## Part 2: Buddy Friendship

### Rules

- **Friendship distance** for a buddy is the total distance of saved adventures (phone and watch, after the
  duplicate removal in `completedRuns`/`allAdventures`) that **started while it was your buddy**.
- Who was your buddy at a given time comes from a new **buddy log**, `{ key: string | null, at: number }[]`. A row is
  added on `chooseBuddy` and whenever the buddy is cleared (released Legendary, re-import). On first launch of this
  version, it starts with the current buddy at `now`.
- This works for watch adventures that sync days later, because they're matched by `record.startedAt` (or
  `finishedAt` if there's no start time). Adventures from before the log began don't count. The app can't know who
  was walking then, and it says so: *"Friendship counts from 17 Nov 2026."*
- Normal and Shiny are **separate friends**, matching the buddy key (`"Pikachu"` / `"Shiny Pikachu"`).
- Plan sessions count just like any other adventure. There's no bonus multiplier.
- Nothing is stored except the log. Friendship is always worked out again, so re-syncs and duplicate removal can't inflate it.

### Levels

| Hearts | Title | Distance together | Beginner at ~10 km/week | Runner at ~35 km/week |
|---|---|---|---|---|
| ♥ | Walking pals | 5 km | Week 1 | Day 1–2 |
| ♥♥ | Good friends | 25 km | ~3 weeks | 1 week |
| ♥♥♥ | Great friends | 75 km | ~2 months | ~2 weeks |
| ♥♥♥♥ | Trusted partners | 150 km | ~4 months | ~1 month |
| ♥♥♥♥♥ | Best buddies | 300 km | ~7 months | ~2 months |

Because each buddy has its own friendship, an experienced runner has a reason to rotate through their team.

### Perks (cosmetic only, on screens that already exist)

| Hearts | Perk | Where |
|---|---|---|
| ♥ | Heart counter and distance together | Buddy card on Journal, the Pokémon page |
| ♥♥ | Buddy says hello with an emote bubble when you open the app | `HabitatScene` on Journal |
| ♥♥♥ | Buddy appears on share images: *"with Pikachu · 75 km together"* | `ShareCard` |
| ♥♥♥♥ | Buddy cheers at hatches and evolutions during an adventure, and coaches Gym cues | `Evolution`, training cue banner |
| ♥♥♥♥♥ | **Best Buddy ribbon** on the Dex entry and over its head in the Safari Zone; hidden badge **"Best buddies"** | Dex, `SafariWorld` follower |

A level-up shows a one-time toast after saving or syncing: *"You and Pikachu are now Great friends! ♥♥♥"*.

---

## Code structure

| File | Change |
|---|---|
| `src/training-plans.ts` | **New.** The five Gyms as data. |
| `src/training.ts` | **New.** Pure state functions, matching, stars, pace zones. |
| `src/training-cues.ts` | **New.** `advance()` step engine, vibration patterns, cue text, spoken text, run/walk breaks. |
| `package.json` | `expo-speech` (phase 4). |
| `src/friendship.ts` | **New.** `friendship(adventures, buddyLog)` → km and hearts per key; `heartsFor`, `levelUps(before, after)`. |
| `src/store.tsx` | Add `training: Training` and `buddyLog` to `Saved`; actions `startGym`, `countSession`, `skipSession`, `pauseGym`, `quitGym`, `declineMatch`; append to the buddy log in `chooseBuddy`. |
| `src/backup.ts` | Add `training` and `buddyLog` to `PhoneData`, `createBackup` and `backupSummary`. `BACKUP_VERSION` stays 1, since the fields are optional. |
| `src/phone-adventure.ts` | Optional `training` on `ActiveAdventure`/`PhoneRun`; `finishAdventure` carries it over. |
| `src/tracker.ts` | Calls `advance()` on each fix and passes the cue to `showLive`. |
| `modules/zepimon-live` | `cue?: string` in `LiveOptions`; shown in the notification. |
| `src/expedition-quest.ts` | `gyms` field on `Quest`, `claimGymPermit(quest, badgeCount)`, restore default 0. |
| `src/progress.ts` | Hidden badges for graduations, Perfect Gym, Warm Welcome, Mega Pacer, Wall Breaker, Ultra Steady and Best buddies. `missions()` gets an optional `extras` argument so its signature stays compatible. |
| `src/app/gym.tsx` | **New.** Gym picker (suggested Gym, entry checks, safety note), active plan screen (incubator, week list, next session, rest status, matches), badge case. |
| `src/app/(tabs)/adventure` | **Gym Training** entry under *Missions & expeditions*; session banner while recording. |
| Journal | Small "Today: Easy run 6 km · Week 3" card while a plan is active; buddy hearts on the buddy card. |

All new screens follow the four themes in light and dark, and reduced motion (product constraints).

## Edge cases

- **Phone and watch both save the same adventure:** `completedRuns` already removes the duplicate, and matching uses
  its output, so a session is never counted twice.
- **The plan egg's family is caught before graduation:** nothing changes. The graduation still hatches it, which
  adds or updates the record as usual.
- **A Legendary plan egg** isn't possible, because Gyms only offer the egg list the Adventure tab offers.
- **Graduation on the watch:** the plan screen's **Send egg to watch** uses `withEgg` in `src/plan.ts`, so the watch
  offers the plan egg on its title screen. A synced watch adventure with that family that reaches the target meets the
  graduation.
- **Clock changes and time zones:** rest rules use `dayKey` (local days), the same as weekly missions.
- **A buddy released or missing from the Dex:** its friendship is kept in the log and comes back if it's caught again.
- **Restoring a backup** isn't built yet (README), so a reinstall loses plan progress until it is. The plan screen links
  to **Back up your data** when a plan starts.

## Safety and copy

- The picker shows, once per plan: *"These plans are general fitness guidance, not medical advice. If you have a
  health condition, are pregnant or haven't exercised in a long time, check with a doctor first. Stop if you feel pain,
  dizziness or chest discomfort."*
- Walk-only Steady Steps is always offered next to First Hatch.
- Dynamax Marathon and Gigantamax Ultra add: *"Marathon and ultra training puts real strain on your body. Sleep,
  food and water matter as much as the runs. Sharp or worsening pain is a reason to stop, not to push through. Use
  **Pause** freely; the plan waits for you."*
- Gigantamax Ultra adds: *"Tell someone your route on long runs, carry water and a phone, and be ready to cut a run
  short in heat."*
- Runs with a time cap say why they stop: *"That's the long run done. Time on your feet counts, not just the distance."*
- Pace zones and the half marathon estimate always say *"estimate"*.
- No calories, heart rate or effort scores are shown (product principle).

## Accessibility

- Step changes reach people through text, vibration and screen reader announcements, never colour alone.
- The countdown uses at least the display size, with 4.5:1 contrast in every theme.
- Every control (**Count it**, **Skip**, **Repeat week**) is a labelled button with a target of at least 44 × 44 pt.
- Reduced motion: the egg doesn't wobble, the banner doesn't slide, and level-up toasts appear without animation.

## Testing (`node --test`, matching `tests/*.test.js`)

- **Plan data:** every session has steps; timed totals and weekly totals match the tables; weekly distance never
  rises more than 15% over the highest earlier week (graduation weeks excepted); every plan ends in a graduation;
  egg rules can be met (including the 32 Gigantamax families); every back-to-back follows a long run.
- **Time caps:** a long run counts at its cap below 95% distance; a graduation never does.
- **Permits:** one per badge, claiming twice gives one, older `Quest` saves without `gyms` load as 0.
- **Ultra gate:** locked without the Titan Badge or a 42 km adventure; the confirm path still needs 50 km a week.
- **Rest rules:** hard sessions on back-to-back days are refused; easy sessions are allowed; only one session a day;
  skip limits.
- **Matching:** watch and phone adventures, duplicates, declined adventures, adventures before the last session, 95% and 90% tolerances.
- **Graduation:** exact distance thresholds; Speed Gym badge only when faster than baseline; retry window.
- **Pace zones:** the worked example (25:00 → bands above, estimated half about 1:55).
- **Stars:** made-up pace logs with reps in and out of the zone, and easy runs that are too fast.
- **Cue engine:** time and distance steps, last step, jumps from GPS gaps, one change per step.
- **Friendship:** buddy changes in the middle of the log, watch adventures synced later, duplicate removal, Normal vs Shiny, the level boundaries.
- **Backup:** `training` and `buddyLog` are included; older backups without them still load.

## Rollout

| Phase | Ships | Why first |
|---|---|---|
| 1 | Buddy Friendship | All derived data, small and low risk, useful straight away for current players. |
| 2 | Gym core, Steady Steps and First Hatch, cues while the screen is on, watch matching | Fixes the beginner wall, which matters most once the app is shared. |
| 3 | Pace zones, stars, Evolution Road, Speed Gym, Mega Trial, Expedition Permit claims | The challenge for experienced runners. |
| 4 | Android notification cues, screen-off vibration (once tested on a device), **voice cues** | Needed before the long Gyms: nobody looks at a phone for 4 hours. |
| 5 | Dynamax Marathon, then Gigantamax Ultra; time caps, run/walk breaks, back-to-backs | The summit, then the optional step beyond. They depend on voice cues and the battery guidance. |
| Later | Watch-side cues on the Zepp and Garmin apps | Needs watch app releases. |

## Risks

- **Screen-off cues** are the biggest technical unknown. Android's foreground service should allow `Vibration` from
  the location task, but iOS doesn't guarantee vibration from background location updates. This needs a device spike
  before phase 4 commits to it.
- **Cue timing** depends on GPS updates (2 s or 3 m). Time-based steps also tick on a 1 s timer while the screen is
  on, so cues are within about 1 s with the screen on and about 2–3 s with it off.
- **GPS distance** can come up short in cities or under trees. The 95% tolerance covers ordinary sessions. Graduations
  need the full distance, as the hatch rules always have.
- **Plans live only on the phone** until backup restore exists. This matters most for the 16-week marathon.
- **Battery on marathon and ultra graduations.** A phone recording GPS for 4–7 hours may not last. The watch path
  (record on the watch, count it with a one-tap match) is the reliable route, and the copy says so.
- **Riegel's formula overestimates marathon speed** for runners without the mileage. This is handled by the label and the
  half marathon refresh, but some people will still start too fast. The cue banner's *"ease off"* is the last guard.

## Out of scope

- Plans that adapt themselves to performance (beyond the zone refresh and Repeat week).
- Ultras longer than 50 km, trail-specific plans (elevation targets), and race-day features (bib, start time, course).
- Heart rate zones, calories and effort scores.
- Social features (training with friends, leaderboards).
- Syncing plan progress through the cloud.

## Review decisions (2026-11-18)

1. **Names:** kept (Sprout, Hatch, Stride, Spark, Summit), with **Titan** and **Colossus** added for the new Gyms.
2. **Friendship:** Normal and Shiny are separate friends.
3. **Graduation reward:** each badge also earns one Expedition Permit (decision 14).
4. **Voice cues:** yes, with `expo-speech` in phase 4.
5. **Speed Gym:** any improvement on the baseline earns the badge; the 3% target is a stretch goal only.
6. **Distance ladder:** goes up to a 50 km ultramarathon, with the **marathon as the usual goal** (decision 15).

## Open questions

1. **Gym names for the new top tier:** "Dynamax Marathon" and "Gigantamax Ultra" are proposed, with the Titan and
   Colossus badges. Keep them?
2. **Marathon long-run cap:** 32 km is proposed. Some coaches go to 35 km for experienced runners. Offer that as an
   option for anyone who already has the Titan Badge?
