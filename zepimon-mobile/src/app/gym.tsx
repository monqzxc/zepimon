import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { useJournal } from '../store'
import { GymPicker, GymPlan } from '../Gym'
import { Screen, useTheme } from '../ui'

// Gym Training: choose a Gym, or follow the one under way (src/Gym.tsx, src/training.ts).
export default function GymScreen() {
  useTheme()
  const { training } = useJournal()
  // Rest days end at midnight, so the time moves on while the screen stays open.
  const [now, setNow] = useState(Date.now)
  useFocusEffect(useCallback(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(timer)
  }, []))
  return <Screen>
    {training.active ? <GymPlan plan={training.active} now={now} /> : <GymPicker />}
  </Screen>
}
