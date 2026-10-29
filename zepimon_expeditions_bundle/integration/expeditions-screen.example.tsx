/**
 * Expo Router screen scaffold.
 *
 * Adapt this to your existing `src/app/expeditions.tsx`, `src/ui.tsx`, and
 * JournalProvider API. The store adapter below is intentionally a TODO rather
 * than guessing the names of your real context methods.
 */

import React from "react";
import { ScrollView, Text, View, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../ui";
import { EXPEDITION_GOAL_METERS, metersIntoCurrentLeg, clueState, type Trail } from "./expedition";

type Props = {
  watchTrail?: Trail;
  phoneTrail?: Trail;
  weekMeters: number; // supply from your existing missions()/week-distance calculation
  onSyncWatch: () => void;
  onClaim: (trailKey: string, index: number) => void; // call the existing store befriend()/claim path
};

function km(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

function TrailPanel({ label, trail }: { label: string; trail?: Trail }) {
  if (!trail) {
    return (
      <View style={styles.panel}>
        <Text style={styles.heading}>{label}</Text>
        <Text style={styles.muted}>No saved expedition trail yet.</Text>
      </View>
    );
  }

  const progress = metersIntoCurrentLeg(trail);
  const clues = clueState(trail);
  const percent = Math.min(100, (progress / EXPEDITION_GOAL_METERS) * 100);

  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>{label}</Text>
      <Text style={styles.progress}>{km(progress)} / 25.0 km</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%` }]} />
      </View>
      <Text style={styles.muted}>{clues.fiveKm ? "✓" : "○"} 5 km clue</Text>
      <Text style={styles.muted}>{clues.fifteenKm ? "✓" : "○"} 15 km clue</Text>
      <Text style={styles.muted}>{clues.encounterReady ? "✓ Legendary encounter ready" : "○ Reach 25 km to encounter"}</Text>
    </View>
  );
}

export default function ExpeditionsScreenExample({
  watchTrail,
  phoneTrail,
  weekMeters,
  onSyncWatch,
  onClaim,
}: Props) {
  const theme = useTheme();

  // Replace the props with values selected from your existing JournalProvider.
  // `weekMeters` should be derived from the existing week-distance calculation,
  // not recomputed independently here.
  const readyTrail = [watchTrail, phoneTrail].find(
    (trail) => trail && trail.meters >= (trail.claimed + 1) * EXPEDITION_GOAL_METERS,
  );

  const stylesForTheme = {
    backgroundColor: theme?.background ?? "#171526",
    color: theme?.text ?? "#ffffff",
  };

  return (
    <ScrollView contentContainerStyle={[styles.screen, { backgroundColor: stylesForTheme.backgroundColor }]}>
      <Text style={[styles.eyebrow, { color: stylesForTheme.color }]}>MISSIONS & EXPEDITIONS</Text>
      <Text style={[styles.title, { color: stylesForTheme.color }]}>Legendary Expeditions</Text>
      <Text style={[styles.body, { color: stylesForTheme.color }]}>
        Three clues. 25 km across saved walks and runs.
      </Text>

      <View style={styles.weekPanel}>
        <Text style={styles.heading}>This week</Text>
        <Text style={styles.progress}>{km(weekMeters)} · watch + phone</Text>
      </View>

      <TrailPanel label="Watch trail" trail={watchTrail} />
      <TrailPanel label="Phone trail" trail={phoneTrail} />

      {readyTrail ? (
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          onPress={() => onClaim(
            `${readyTrail.startedAt}:${readyTrail.seed}`,
            readyTrail.claimed,
          )}
        >
          <Text style={styles.buttonText}>Befriend next Legendary</Text>
        </Pressable>
      ) : (
        <Pressable accessibilityRole="button" style={styles.button} onPress={onSyncWatch}>
          <Text style={styles.buttonText}>Sync my watch</Text>
        </Pressable>
      )}

      <Text style={[styles.note, { color: stylesForTheme.color }]}>
        Saved distance counts. Live, unsaved distance does not count.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 20, gap: 14, flexGrow: 1 },
  eyebrow: { fontSize: 11, letterSpacing: 1.4, fontWeight: "700", opacity: 0.75 },
  title: { fontSize: 28, fontWeight: "800" },
  body: { fontSize: 15, lineHeight: 22, opacity: 0.8 },
  panel: { backgroundColor: "#292640", borderRadius: 18, padding: 16, gap: 8 },
  weekPanel: { backgroundColor: "#40345e", borderRadius: 18, padding: 16, gap: 6 },
  heading: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  progress: { color: "#ffffff", fontSize: 20, fontWeight: "800" },
  muted: { color: "#d4d0e6", fontSize: 13 },
  track: { height: 8, borderRadius: 8, backgroundColor: "#514c6a", overflow: "hidden", marginVertical: 4 },
  fill: { height: "100%", backgroundColor: "#d9b7ff", borderRadius: 8 },
  button: { backgroundColor: "#9b72dc", borderRadius: 14, padding: 15, alignItems: "center" },
  buttonText: { color: "#ffffff", fontWeight: "800", fontSize: 15 },
  note: { fontSize: 12, opacity: 0.7, lineHeight: 18, marginTop: 4 },
});
