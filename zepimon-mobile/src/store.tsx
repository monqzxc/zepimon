import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { parseJournal, receiveCloudJournal } from './journal'
import type { DexRecord, Journal } from './journal'
import { emptyProgress, importProgress, restoreProgress, unlockMissions } from './progress'
import type { Progress } from './progress'
import { restoreScores, saveBestScore } from './games/scores'
import type { ArcadeGame, ArcadeScores } from './games/scores'
import { claimExpedition, emptyExpeditions, expeditionJournal, importExpeditions, restoreExpeditions } from './expeditions'
import type { ExpeditionProgress } from './expeditions'
import { addSafariCatch, restoreSafariDex, withSafariCatches } from './games/safari'
import type { SafariDex } from './games/safari'
import { restoreStars, saveStars } from './games/adventure'
import { backupSummary, createBackup } from './backup'

const KEY = 'zepimon-mobile-v1'
type Saved = { journal: Journal | null, buddy: string | null, bestMoves: Record<string, number>, progress: Progress, arcadeScores: ArcadeScores, cloudOwner: string | null, expeditions: ExpeditionProgress, safari: SafariDex, adventure: Record<string, number> }
type Store = Saved & { ready: boolean, error: string, dex: Record<string, DexRecord>, importText: (text: string) => Promise<void>, importCloud: (text: string, owner: string) => Promise<void>, chooseBuddy: (key: string) => Promise<void>, recordWin: (pairs: number, moves: number) => Promise<void>, recordArcadeScore: (game: ArcadeGame, score: number) => Promise<void>, befriend: (key: string, index: number) => Promise<void>, recordSafariCatch: (name: string, shiny: boolean) => Promise<void>, recordStars: (stop: string, stars: number) => Promise<void>,
  makeBackup: () => string, backupInfo: ReturnType<typeof backupSummary> }
const empty: Saved = { journal: null, buddy: null, bestMoves: {}, progress: emptyProgress(), arcadeScores: {}, cloudOwner: null, expeditions: emptyExpeditions(), safari: {}, adventure: {} }
const Context = createContext<Store | null>(null)

// Everything shown in the Dex: watch records and expedition friends, plus Safari catches (which also work before any import).
function collectionOf(saved: Pick<Saved, 'journal' | 'expeditions' | 'safari'>) {
  const journal = withSafariCatches(expeditionJournal(saved.journal, saved.expeditions), saved.safari)
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
      const oldExpeditions = restoreExpeditions(value.expeditions)
      const expeditions = journal ? importExpeditions(oldExpeditions, journal) : oldExpeditions
      const collection = expeditionJournal(journal, expeditions)
      const safari = restoreSafariDex(value.safari)
      const buddy = typeof value.buddy === 'string' && collectionOf({ journal, expeditions, safari }).dex[value.buddy] ? value.buddy : null
      const restored = restoreProgress(value.progress)
      const progress = collection ? importProgress(restored, collection) : restored
      latest.current = { journal, buddy, bestMoves, progress, arcadeScores: restoreScores(value.arcadeScores),
        cloudOwner: typeof value.cloudOwner === 'string' ? value.cloudOwner : null, expeditions, safari, adventure: restoreStars(value.adventure) }
      setSaved(latest.current)
      if (JSON.stringify(value.progress) !== JSON.stringify(progress) || JSON.stringify(value.expeditions) !== JSON.stringify(expeditions)) {
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
    const collection = expeditionJournal(journal, expeditions)!
    return { ...current, journal, expeditions, progress: importProgress(current.progress, collection),
      buddy: current.buddy && collectionOf({ ...current, journal, expeditions }).dex[current.buddy] ? current.buddy : null }
  })
  const importCloud = (text: string, owner: string) => persist(current => {
    const journal = receiveCloudJournal(text, current.journal, current.cloudOwner, owner)
    const expeditions = importExpeditions(current.expeditions, journal)
    const collection = expeditionJournal(journal, expeditions)!
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
  const befriend = (key: string, index: number) => persist(current => {
    const expeditions = claimExpedition(current.expeditions, key, index)
    return { ...current, expeditions, progress: unlockMissions(expeditionJournal(current.journal, expeditions), current.progress) }
  })
  const recordSafariCatch = (name: string, shiny: boolean) => persist(current => ({ ...current, safari: addSafariCatch(current.safari, name, shiny) }))
  const recordStars = (stop: string, stars: number) => persist(current => ({ ...current, adventure: saveStars(current.adventure, stop, stars) }))
  // Backups use the raw saved data, so the watch journal stays exactly as the watch sent it.
  const makeBackup = () => createBackup(latest.current, Date.now(), Constants.expoConfig?.version ?? '')
  return <Context.Provider value={{ ...saved, ...collectionOf(saved), ready, error, importText, importCloud, chooseBuddy, recordWin, recordArcadeScore,
    befriend, recordSafariCatch, recordStars, makeBackup, backupInfo: backupSummary(saved) }}>{children}</Context.Provider>
}

export function useJournal() {
  const value = useContext(Context)
  if (!value) throw new Error('JournalProvider is missing')
  return value
}
