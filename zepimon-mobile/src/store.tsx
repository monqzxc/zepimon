import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { parseJournal, receiveCloudJournal } from './journal'
import type { Journal } from './journal'
import { emptyProgress, importProgress, restoreProgress, unlockMissions } from './progress'
import type { Progress } from './progress'
import { restoreScores, saveBestScore } from './games/scores'
import type { ArcadeGame, ArcadeScores } from './games/scores'
import { claimExpedition, emptyExpeditions, expeditionJournal, importExpeditions, restoreExpeditions } from './expeditions'
import type { ExpeditionProgress } from './expeditions'

const KEY = 'zepimon-mobile-v1'
type Saved = { journal: Journal | null, buddy: string | null, bestMoves: Record<string, number>, progress: Progress, arcadeScores: ArcadeScores, cloudOwner: string | null, expeditions: ExpeditionProgress }
type Store = Saved & { ready: boolean, error: string, importText: (text: string) => Promise<void>, importCloud: (text: string, owner: string) => Promise<void>, chooseBuddy: (key: string) => Promise<void>, recordWin: (pairs: number, moves: number) => Promise<void>, recordArcadeScore: (game: ArcadeGame, score: number) => Promise<void>, befriend: (key: string, index: number) => Promise<void> }
const empty: Saved = { journal: null, buddy: null, bestMoves: {}, progress: emptyProgress(), arcadeScores: {}, cloudOwner: null, expeditions: emptyExpeditions() }
const Context = createContext<Store | null>(null)

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
      const buddy = typeof value.buddy === 'string' && collection?.snapshot.dex[value.buddy] ? value.buddy : null
      const restored = restoreProgress(value.progress)
      const progress = collection ? importProgress(restored, collection) : restored
      latest.current = { journal, buddy, bestMoves, progress, arcadeScores: restoreScores(value.arcadeScores),
        cloudOwner: typeof value.cloudOwner === 'string' ? value.cloudOwner : null, expeditions }
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
      buddy: current.buddy && collection.snapshot.dex[current.buddy] ? current.buddy : null }
  })
  const importCloud = (text: string, owner: string) => persist(current => {
    const journal = receiveCloudJournal(text, current.journal, current.cloudOwner, owner)
    const expeditions = importExpeditions(current.expeditions, journal)
    const collection = expeditionJournal(journal, expeditions)!
    return { ...current, journal, expeditions, cloudOwner: owner, progress: importProgress(current.progress, collection),
      buddy: current.buddy && collection.snapshot.dex[current.buddy] ? current.buddy : null }
  })
  const chooseBuddy = (key: string) => persist(current => {
    if (!expeditionJournal(current.journal, current.expeditions)?.snapshot.dex[key]) throw new Error('Import this Pokemon before choosing it as your buddy.')
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
  return <Context.Provider value={{ ...saved, journal: expeditionJournal(saved.journal, saved.expeditions), ready, error, importText, importCloud, chooseBuddy, recordWin, recordArcadeScore, befriend }}>{children}</Context.Provider>
}

export function useJournal() {
  const value = useContext(Context)
  if (!value) throw new Error('JournalProvider is missing')
  return value
}
