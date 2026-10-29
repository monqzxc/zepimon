import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { parseJournal, receiveCloudJournal } from './journal'
import type { DexRecord, Journal } from './journal'
import { emptyProgress, importProgress, restoreProgress, unlockMissions } from './progress'
import type { Progress } from './progress'
import { restoreScores, saveBestScore } from './games/scores'
import type { ArcadeGame, ArcadeScores } from './games/scores'
import { emptyExpeditions, expeditionJournal, importExpeditions, restoreExpeditions } from './expeditions'
import type { ExpeditionProgress } from './expeditions'
import { completeChallenge, earnArcadePermit, earnPermit, emptyQuest, questSessions, restoreQuest, spendPermit } from './expedition-quest'
import { arcadePoints } from './games/achievements'
import type { Quest } from './expedition-quest'
import { catchEncounter, finishReset, finishTrial, legacyEncounters, openChamber, requestReset, restoreEncounters, saveCheckpoint } from './expedition-encounter'
import type { Encounters } from './expedition-encounter'
import { addSafariCatch, restoreSafariDex, withSafariCatches } from './games/safari'
import type { SafariDex } from './games/safari'
import { restoreStars, saveStars } from './games/adventure'
import { restoreLevelStars, saveLevelStars } from './games/levels'
import { restoreTrialRecords, saveTrialRecords } from './games/trials'
import type { TrialRecords, TrialRun } from './games/trials'
import { backupSummary, createBackup } from './backup'
import { restorePhoneRuns, withPhoneRuns, withPhoneTrail } from './phone-adventure'
import type { PhoneRun } from './phone-adventure'
import { restorePlan, withEgg, withoutEgg, withPhone } from './plan'
import type { Plan } from './plan'

const KEY = 'zepimon-mobile-v1'
type Saved = { journal: Journal | null, buddy: string | null, bestMoves: Record<string, number>, progress: Progress, arcadeScores: ArcadeScores, cloudOwner: string | null, expeditions: ExpeditionProgress, quest: Quest, encounters: Encounters, safari: SafariDex, adventure: Record<string, number>, trailLevels: Record<string, number>, trialRecords: TrialRecords, phoneRuns: PhoneRun[], plan: Plan | null }
type Store = Saved & { ready: boolean, error: string, dex: Record<string, DexRecord>, importText: (text: string) => Promise<void>, importCloud: (text: string, owner: string) => Promise<void>, chooseBuddy: (key: string) => Promise<void>, recordWin: (pairs: number, moves: number) => Promise<void>, recordArcadeScore: (game: ArcadeGame, score: number) => Promise<void>, befriend: (key: string, index: number) => Promise<void>,
  finishTrial: (key: string, index: number, results: Record<string, number>) => Promise<void>, saveTrialCheckpoint: (key: string, index: number, run: TrialRun) => Promise<void>, openChamber: (key: string, index: number) => Promise<void>,
  resetEncounter: (key: string, index: number, discardShiny: boolean) => Promise<void>, finishReset: (key: string, index: number) => Promise<void>,
  completeQuestChallenge: () => Promise<void>, earnPermit: () => Promise<void>, earnArcadePermit: () => Promise<void>, unlockWithPermit: (key: string) => Promise<void>, recordSafariCatch: (name: string, shiny: boolean) => Promise<void>, recordStars: (stop: string, stars: number) => Promise<void>,
  recordLevelStars: (level: string, stars: number) => Promise<void>, savePhoneRun: (run: PhoneRun) => Promise<void>, chooseEgg: (family: string[], mega: string | null) => Promise<void>,
  setPhoneAdventure: (phone: Plan['phone']) => Promise<void>, dropEgg: () => Promise<void>, receivePlan: (plan: unknown) => Promise<void>, makeBackup: () => string, backupInfo: ReturnType<typeof backupSummary> }
const empty: Saved = { journal: null, buddy: null, bestMoves: {}, progress: emptyProgress(), arcadeScores: {}, cloudOwner: null, expeditions: emptyExpeditions(), quest: emptyQuest(), encounters: {}, safari: {}, adventure: {}, trailLevels: {}, trialRecords: {}, phoneRuns: [], plan: null }
const Context = createContext<Store | null>(null)

// Watch records with this phone's own adventures layered on top; missions and Expeditions count both.
const walkedJournal = (saved: Pick<Saved, 'journal' | 'expeditions' | 'phoneRuns'>) => expeditionJournal(withPhoneRuns(saved.journal, saved.phoneRuns), saved.expeditions)
// Everything shown in the Dex: watch and phone adventures and expedition friends, plus Safari catches (which also work before any import).
function collectionOf(saved: Pick<Saved, 'journal' | 'expeditions' | 'safari' | 'phoneRuns'>) {
  const journal = withSafariCatches(walkedJournal(saved), saved.safari)
  return { journal, dex: journal?.snapshot.dex ?? { ...saved.safari } }
}

export function JournalProvider({ children }: React.PropsWithChildren) {
  const [saved, setSaved] = useState<Saved>(empty)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const latest = useRef(saved)
  const writes = useRef<Promise<void>>(Promise.resolve())
  useEffect(() => {
    let mounted = true
    AsyncStorage.getItem(KEY).then(async raw => {
      if (!mounted || !raw) return
      const value = JSON.parse(raw)
      const journal = value.journal ? parseJournal(JSON.stringify(value.journal)) : null
      const bestMoves: Record<string, number> = {}
      for (let pairs = 2; pairs <= 6; pairs++) {
        const score = value.bestMoves?.[pairs]
        if (Number.isSafeInteger(score) && score >= pairs) bestMoves[pairs] = score
      }
      const phoneRuns = restorePhoneRuns(value.phoneRuns)
      // Permits let a trail claim encounters before their 25 km, so they are read first.
      const quest = restoreQuest(value.quest)
      const oldExpeditions = restoreExpeditions(value.expeditions, quest.unlocks)
      const expeditions = withPhoneTrail(journal ? importExpeditions(oldExpeditions, journal) : oldExpeditions, phoneRuns)
      // Saves from before encounter rolls keep the Shiny they were already showing (see legacyEncounters).
      const encounters = value.encounters === undefined ? legacyEncounters(expeditions) : restoreEncounters(value.encounters, expeditions, quest)
      const collection = walkedJournal({ journal, expeditions, phoneRuns })
      const safari = restoreSafariDex(value.safari)
      const buddy = typeof value.buddy === 'string' && collectionOf({ journal, expeditions, safari, phoneRuns }).dex[value.buddy] ? value.buddy : null
      const restored = restoreProgress(value.progress)
      const progress = collection ? importProgress(restored, collection) : restored
      latest.current = { journal, buddy, bestMoves, progress, arcadeScores: restoreScores(value.arcadeScores),
        cloudOwner: typeof value.cloudOwner === 'string' ? value.cloudOwner : null, expeditions, quest, encounters, safari, adventure: restoreStars(value.adventure),
        trailLevels: restoreLevelStars(value.trailLevels), trialRecords: restoreTrialRecords(value.trialRecords), phoneRuns, plan: restorePlan(value.plan) }
      setSaved(latest.current)
      if (JSON.stringify(value.progress) !== JSON.stringify(progress) || JSON.stringify(value.expeditions) !== JSON.stringify(expeditions) ||
          JSON.stringify(value.quest) !== JSON.stringify(quest) || JSON.stringify(value.encounters) !== JSON.stringify(encounters)) {
        try { await AsyncStorage.setItem(KEY, JSON.stringify(latest.current)) }
        catch { if (mounted) setError('Your journal opened, but mission updates could not be saved. Try importing again.') }
      }
    }).catch(() => { if (mounted) setError('Saved phone data could not be read. Import your Zepp export again to recover it.') })
      .finally(() => { if (mounted) setReady(true) })
    return () => { mounted = false }
  }, [])

  function persist(change: (current: Saved) => Saved): Promise<void> {
    if (!ready) return Promise.reject(new Error('Your journal is still loading.'))
    const next = writes.current.then(async () => {
      const value = change(latest.current)
      await AsyncStorage.setItem(KEY, JSON.stringify(value))
      latest.current = value
      setSaved(value)
      setError('')
    })
    writes.current = next.catch(() => {})
    return next
  }
  const importText = (text: string) => persist(current => {
    const journal = parseJournal(text, current.journal)
    const expeditions = importExpeditions(current.expeditions, journal)
    const collection = walkedJournal({ ...current, journal, expeditions })!
    return { ...current, journal, expeditions, progress: importProgress(current.progress, collection),
      buddy: current.buddy && collectionOf({ ...current, journal, expeditions }).dex[current.buddy] ? current.buddy : null }
  })
  const importCloud = (text: string, owner: string) => persist(current => {
    const journal = receiveCloudJournal(text, current.journal, current.cloudOwner, owner)
    const expeditions = importExpeditions(current.expeditions, journal)
    const collection = walkedJournal({ ...current, journal, expeditions })!
    return { ...current, journal, expeditions, cloudOwner: owner, progress: importProgress(current.progress, collection),
      buddy: current.buddy && collectionOf({ ...current, journal, expeditions }).dex[current.buddy] ? current.buddy : null }
  })
  const chooseBuddy = (key: string) => persist(current => {
    if (!collectionOf(current).dex[key]) throw new Error('Import this Pokemon before choosing it as your buddy.')
    return { ...current, buddy: key }
  })
  const recordWin = (pairs: number, moves: number) => persist(current => {
    if (!Number.isInteger(pairs) || pairs < 2 || pairs > 6 || !Number.isSafeInteger(moves) || moves < pairs) return current
    return { ...current, bestMoves: { ...current.bestMoves, [pairs]: Math.min(current.bestMoves[pairs] || Infinity, moves) } }
  })
  const recordArcadeScore = (game: ArcadeGame, score: number) => persist(current => ({
    ...current, arcadeScores: saveBestScore(current.arcadeScores, game, score)
  }))
  // Legendary encounters (src/expedition-encounter.ts): trial, chamber roll, reset and, only after a successful catch,
  // the claim. Each step is saved, so leaving or reopening the app picks up where the player was.
  const befriend = (key: string, index: number) => persist(current => {
    const { expeditions, encounters } = catchEncounter(current, key, index)
    return { ...current, expeditions, encounters, progress: unlockMissions(walkedJournal({ ...current, expeditions }), current.progress) }
  })
  // Finishing saves the rooms' best moves and the encounter together, in one write.
  const finishEncounterTrial = (key: string, index: number, results: Record<string, number>) => persist(current => ({ ...current,
    encounters: finishTrial(current, key, index), trialRecords: saveTrialRecords(current.trialRecords, results) }))
  const saveTrialCheckpoint = (key: string, index: number, run: TrialRun) => persist(current => ({ ...current, encounters: saveCheckpoint(current, key, index, run) }))
  const openEncounterChamber = (key: string, index: number) => persist(current => ({ ...current, encounters: openChamber(current, key, index) }))
  const resetEncounter = (key: string, index: number, discardShiny: boolean) =>
    persist(current => ({ ...current, encounters: requestReset(current, key, index, discardShiny) }))
  const finishEncounterReset = (key: string, index: number) => persist(current => ({ ...current, encounters: finishReset(current, key, index) }))
  // The Expedition Quest (src/expedition-quest.ts): the shrine challenge, the permit it earns and spending it on a trail.
  const completeQuestChallenge = () => persist(current => ({ ...current, quest: completeChallenge(current.quest) }))
  const earnQuestPermit = () => persist(current => ({ ...current, quest: earnPermit(current.quest, questSessions(current.quest, current.progress, current.expeditions)) }))
  const earnPointsPermit = () => persist(current => ({ ...current, quest: earnArcadePermit(current.quest, arcadePoints(current)) }))
  const unlockWithPermit = (key: string) => persist(current => ({ ...current, quest: spendPermit(current.quest, current.expeditions, key) }))
  // A phone adventure is saved like a watch one: it joins the journal, missions and the phone's Expedition trail.
  const savePhoneRun = (run: PhoneRun) => persist(current => {
    const phoneRuns = [run, ...current.phoneRuns.filter(item => item.id !== run.id)]
    const expeditions = withPhoneTrail(current.expeditions, phoneRuns)
    const collection = walkedJournal({ ...current, expeditions, phoneRuns })!
    return { ...current, phoneRuns, expeditions, progress: importProgress(current.progress, collection) }
  })
  // The plan shared with the watch (see src/plan.ts); the cloud provider sends each change.
  const chooseEgg = (family: string[], mega: string | null) => persist(current => ({ ...current, plan: withEgg(current.plan, family, mega) }))
  const setPhoneAdventure = (phone: Plan['phone']) => persist(current => ({ ...current, plan: withPhone(current.plan, phone) }))
  const dropEgg = () => persist(current => current.plan?.egg ? { ...current, plan: withoutEgg(current.plan) } : current)
  // A newer plan from the cloud: this phone after a reinstall, or another phone on the same account.
  const receivePlan = (raw: unknown) => persist(current => {
    const plan = restorePlan(raw)
    return plan && plan.updatedAt > (current.plan?.updatedAt ?? -1) ? { ...current, plan } : current
  })
  const recordSafariCatch = (name: string, shiny: boolean) => persist(current => ({ ...current, safari: addSafariCatch(current.safari, name, shiny) }))
  const recordStars = (stop: string, stars: number) => persist(current => ({ ...current, adventure: saveStars(current.adventure, stop, stars) }))
  const recordLevelStars = (level: string, stars: number) => persist(current => ({ ...current, trailLevels: saveLevelStars(current.trailLevels, level, stars) }))
  // Backups use the raw saved data, so the watch journal stays exactly as the watch sent it.
  const makeBackup = () => createBackup(latest.current, Date.now(), Constants.expoConfig?.version ?? '')
  return <Context.Provider value={{ ...saved, ...collectionOf(saved), ready, error, importText, importCloud, chooseBuddy, recordWin, recordArcadeScore,
    befriend, finishTrial: finishEncounterTrial, saveTrialCheckpoint, openChamber: openEncounterChamber, resetEncounter, finishReset: finishEncounterReset,
    completeQuestChallenge, earnPermit: earnQuestPermit, earnArcadePermit: earnPointsPermit, unlockWithPermit, recordSafariCatch, recordStars, recordLevelStars, savePhoneRun, chooseEgg, setPhoneAdventure, dropEgg, receivePlan, makeBackup,
    backupInfo: backupSummary(saved) }}>{children}</Context.Provider>
}

export function useJournal() {
  const value = useContext(Context)
  if (!value) throw new Error('JournalProvider is missing')
  return value
}
